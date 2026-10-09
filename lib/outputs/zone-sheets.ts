// ONE SHEET PER ZONE. An event that takes the hall AND the garden used to print both on one page,
// framed on the box around the two — which on a real property is half the estate, at 1:500, with
// the room the crew is actually setting up drawn the size of a stamp in the middle of it. A crew
// does not set up "the event"; it sets up a room, then walks to the next one. So each zone is its
// own sheet, framed on that zone, carrying only what stands in it.
//
// Every table and item belongs to exactly ONE zone: the zone that contains it, or — when it stands
// outside them all (a bar pushed onto the terrace lip, a table dragged past the boundary) — the
// nearest one. Nothing a designer drew is dropped from the set of sheets, and nothing prints twice.
//
// The document is FILTERED, never renumbered: a table's number is stored on the table
// (DesignTable.number), so table 14 is table 14 on every sheet and in every legend.
import type { DesignDocumentContent, Placement } from "@/lib/design-document/types";
import type { EventPlan } from "@/lib/events/plan";
import type { ResolvedZone } from "@/lib/venues/zone";
import { zonesBounds } from "@/lib/venues/zone";
import { pointInPolygon } from "@/lib/venues/faces";
import { resolveSpan } from "@/lib/studio/anchor";
import type { Bounds } from "@/lib/studio/geometry";
import type { Point } from "@/lib/studio/hall";
import { isMain } from "../self-check";

export interface ZoneSheet {
  /** null when the event has no zone with a boundary — the plan's own frame is used. */
  zone: ResolvedZone | null;
  /** The event's document, narrowed to what stands in this zone. */
  doc: DesignDocumentContent;
  /** What this sheet frames, in venue millimetres. */
  bounds: Bounds;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToZone(p: Point, boundary: Point[]): number {
  if (pointInPolygon(p, boundary)) return 0;
  let best = Infinity;
  for (let i = 0; i < boundary.length; i++) best = Math.min(best, segmentDistance(p, boundary[i], boundary[(i + 1) % boundary.length]));
  return best;
}

/** The zone a point belongs to: the one containing it, else the nearest. */
function zoneOf(p: Point, zones: ResolvedZone[]): string {
  let best = zones[0].zone.id;
  let bestD = Infinity;
  for (const z of zones) {
    const d = distanceToZone(p, z.boundary);
    if (d < bestD) {
      bestD = d;
      best = z.zone.id;
    }
    if (d === 0) break;
  }
  return best;
}

function grow(b: Bounds, pts: Point[]): Bounds {
  if (pts.length === 0) return b;
  const minX = Math.min(b.minX, ...pts.map((p) => p.x));
  const minY = Math.min(b.minY, ...pts.map((p) => p.y));
  const maxX = Math.max(b.maxX, ...pts.map((p) => p.x));
  const maxY = Math.max(b.maxY, ...pts.map((p) => p.y));
  return { minX, minY, maxX, maxY, widthMm: maxX - minX, heightMm: maxY - minY };
}

export function zoneSheets(doc: DesignDocumentContent, plan: EventPlan): ZoneSheet[] {
  const zones = plan.zones.filter((z) => z.boundary.length >= 3);
  if (zones.length === 0) return [{ zone: null, doc, bounds: plan.bounds }];
  if (zones.length === 1) return [{ zone: zones[0], doc, bounds: zonesBounds(zones) }];

  // Where each thing stands. A pushed-together block goes by the block's centre, so a block that
  // straddles an open boundary is never split across two sheets.
  const groupCentre = new Map<string, Point>();
  for (const g of doc.groups ?? []) {
    const members = doc.tables.filter((t) => t.groupId === g.id);
    if (members.length === 0) continue;
    groupCentre.set(g.id, {
      x: members.reduce((n, t) => n + t.position.x, 0) / members.length,
      y: members.reduce((n, t) => n + t.position.y, 0) / members.length,
    });
  }
  const tableAt = (t: DesignDocumentContent["tables"][number]) => (t.groupId && groupCentre.get(t.groupId)) || t.position;
  const tableZone = new Map(doc.tables.map((t) => [t.id, zoneOf(tableAt(t), zones)]));
  const placementById = new Map(doc.placements.map((p) => [p.id, p]));

  const tableById = new Map(doc.tables.map((t) => [t.id, t]));
  // A table's dressing stands where its table does — its own `position` is in the table's frame.
  const placementAt = (p: Placement): Point | null => {
    const onTable = p.layer === "table" && p.tableId ? tableById.get(p.tableId) : undefined;
    if (onTable) return tableAt(onTable);
    if (p.span) {
      const s = resolveSpan(plan.structure, p.span);
      return s ? { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 } : null;
    }
    if (p.perch) {
      const stage = placementById.get(p.perch.stageId);
      return stage ? stage.position : null;
    }
    return p.position;
  };
  const placementZone = (p: Placement): string | null => {
    const at = placementAt(p);
    return at ? zoneOf(at, zones) : null;
  };

  const sheets = zones.map((zone) => {
    const id = zone.zone.id;
    const tables = doc.tables.filter((t) => tableZone.get(t.id) === id);
    const groupIds = new Set(tables.map((t) => t.groupId).filter(Boolean));
    const placements = doc.placements.filter((p) => placementZone(p) === id);
    const narrowed: DesignDocumentContent = {
      ...doc,
      tables,
      groups: (doc.groups ?? []).filter((g) => groupIds.has(g.id) || doc.tables.every((t) => t.groupId !== g.id)),
      placements,
    };
    // Framed on the zone, grown to take in anything assigned to it from outside its walls.
    const bounds = grow(zonesBounds([zone]), [...tables.map(tableAt), ...placements.map((p) => placementAt(p)).filter((p): p is Point => !!p)]);
    return { zone, doc: narrowed, bounds, empty: tables.length === 0 && placements.length === 0 };
  });

  // A zone with nothing in it is not a placement map — unless NOTHING is drawn yet, in which case
  // every zone still prints its empty room rather than the set printing nothing at all.
  const used = sheets.filter((s) => !s.empty);
  return (used.length ? used : sheets).map(({ zone, doc, bounds }) => ({ zone, doc, bounds }));
}

// ponytail: self-check. Run: npm run check:zone-sheets
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const square = (x: number, y: number, s: number): Point[] => [
    { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
  ];
  const zone = (id: string, boundary: Point[]) =>
    ({ zone: { id, name: id } as unknown as ResolvedZone["zone"], boundary, detached: false }) as ResolvedZone;
  const hall = zone("hall", square(0, 0, 10000));
  const garden = zone("garden", square(20000, 0, 10000));
  const terrace = zone("terrace", square(0, 40000, 5000));
  const plan = { zones: [hall, garden, terrace], bounds: zonesBounds([hall, garden, terrace]), structure: { nodes: [], walls: [], entrances: [], features: [] } } as unknown as EventPlan;
  const table = (id: string, x: number, y: number, groupId?: string) =>
    ({ id, number: Number(id.slice(1)), position: { x, y }, rotation: 0, groupId }) as unknown as DesignDocumentContent["tables"][number];
  const doc = {
    tables: [table("t1", 2000, 2000), table("t2", 25000, 5000), table("t3", 15500, 5000)],
    groups: [],
    placements: [
      { id: "bar", layer: "floor", position: { x: 26000, y: 1000 } },
      { id: "vase", layer: "table", tableId: "t1", position: { x: 99999, y: 99999 } },
    ],
  } as unknown as DesignDocumentContent;

  const sheets = zoneSheets(doc, plan);
  assert(sheets.length === 2, "the empty terrace prints no sheet");
  const [h, g] = sheets;
  assert(h.zone?.zone.id === "hall" && g.zone?.zone.id === "garden", "sheets follow the event's own zone order");
  assert(h.doc.tables.map((t) => t.id).join() === "t1", "the hall carries its own table");
  assert(g.doc.tables.map((t) => t.id).sort().join() === "t2,t3", "a table outside every zone goes to the nearest one");
  assert(g.doc.tables.find((t) => t.id === "t3")!.number === 3, "a table keeps its number on its zone's sheet");
  assert(h.doc.placements.some((p) => p.id === "vase"), "a table's dressing goes where its table is, not where its own position says");
  assert(g.doc.placements.some((p) => p.id === "bar"), "a floor item goes to the zone it stands in");
  assert(h.bounds.widthMm === 10000 && h.bounds.heightMm === 10000, "a sheet frames its own zone, not the union");
  assert(g.bounds.minX === 15500, "…grown to take in what was assigned to it from outside");

  const one = zoneSheets(doc, { ...plan, zones: [hall] } as EventPlan);
  assert(one.length === 1 && one[0].doc === doc, "a single-zone event prints its whole document on one sheet");
  const none = zoneSheets({ ...doc, tables: [], placements: [] }, plan);
  assert(none.length === 3, "with nothing drawn yet every zone still prints its room");
  console.log("zone-sheets self-check passed");
}
