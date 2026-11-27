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
import { railLines, railMidpoint, railOf, sketchRailContext } from "@/lib/studio/rail";
import { sailCentre, sailSheet } from "@/lib/studio/ceiling-cloth";
import type { Bounds } from "@/lib/studio/geometry";
import type { Point } from "@/lib/studio/hall";

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
  const railCtx = sketchRailContext(doc, plan.structure, plan.structure, () => undefined);
  // A table's dressing stands where its table does — its own `position` is in the table's frame.
  const placementAt = (p: Placement): Point | null => {
    const onTable = p.layer === "table" && p.tableId ? tableById.get(p.tableId) : undefined;
    if (onTable) return tableAt(onTable);
    const rail = railOf(p);
    if (rail) {
      // The middle of the run on its rail — on a wall, out on the bow of a curved one, not its chord.
      // No catalog here: a side rail on a hired thing that is not a stage goes by where that thing
      // stands, which is the zone it hangs in anyway.
      const line = railLines(rail, railCtx)[0];
      if (line) return railMidpoint(line);
      if (rail.type === "side") return placementById.get(rail.featureId)?.position ?? null;
      // A sail (lib/studio/ceiling-cloth.ts) is on the sheet of the zone its middle is over.
      if (rail.type === "sail") return sailCentre(rail, sailSheet(rail, railCtx));
      return null;
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
