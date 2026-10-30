// What a ceiling item can hang OVER on this event's plan — every table, every thing standing on the
// floor, and the venue's own furniture where this event stood it — as lib/studio/hang.ts's targets.
//
// Beside the screen rather than in lib/, for plan-geometry.ts's reason: it reads the catalog through
// the synchronous resolver and the footprint helpers the canvas draws with, so "over the table" here
// is the table the designer can see. The geometry itself (which one, where its middle is) is pure
// and self-checked in lib/studio/hang.ts. The printed ceiling plan asks the same question through
// this file, so the sketch and the sheet can never disagree about what a chandelier is over.
import type { DesignDocumentContent, DesignTable, Placement, Point } from "@/lib/design-document/types";
import { resolve } from "@/lib/studio/catalog-resolver";
import { anchorOffset, blockTarget, centreOver, hangTarget, targetUnder, type HangTarget } from "@/lib/studio/hang";
import { footprintPolygons, insidePolys } from "@/lib/studio/proximity";
import { featureFootprint, type VenueStructure } from "@/lib/venues/structure";
import { placementFootprint, tableBlock, tableFootprint } from "@/components/footprint-shape";
import { fromLocalFrame } from "@/lib/studio/geometry";

/** `structure` is the ARRANGED one (lib/design-document/features.ts) — the bar where this event put it. */
export function hangTargetsOf(doc: DesignDocumentContent, structure: VenueStructure): HangTarget[] {
  // A lone table is its own target; a grouped one is its BLOCK's — two tables pushed together as one
  // head table are one target with the middle on the seam (lib/studio/hang.ts blockTarget), not one
  // per member with a chandelier over the seam pulled to whichever half it is nearer.
  const out: HangTarget[] = doc.tables.filter((t) => !t.groupId).map((t) => hangTarget(`table:${t.id}`, tableFootprint(t), t.position, t.rotation ?? 0, !!t.mirrored));
  for (const g of doc.groups ?? []) {
    const members = doc.tables.filter((t) => t.groupId === g.id);
    if (members.length === 0) continue; // a group of stages is not a table; its stages are placements below
    // The block's OWN box — in its frame (block.ts: its first member's facing, every member through
    // its turn and mirror), round the seams — and its middle: the same frame and middle the drag's
    // axis pull and the copies over other tables use. A box squared to the room instead stood off a
    // turned block, claimed floor beside it and put its middle somewhere else.
    const blk = tableBlock(members);
    if (!blk) {
      out.push(blockTarget(`group:${g.id}`, members.map((t) => ({ f: tableFootprint(t), at: t.position, rotationDeg: t.rotation ?? 0 }))));
      continue;
    }
    const corner = (sx: number, sy: number) => fromLocalFrame({ x: (sx * blk.widthMm) / 2, y: (sy * blk.depthMm) / 2 }, blk.centre, blk.rotation);
    out.push({ key: `group:${g.id}`, polys: [[corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]], centre: blk.centre });
  }
  for (const p of doc.placements) {
    // Only what stands on the floor with a shape of its own: not a ceiling item, not anything on a
    // table or a banquette (it is its table's), not a drape (its wall's), not a rug (laid under
    // things — what hangs over the rug hangs over the table on it).
    if (p.layer === "ceiling" || p.tableId || p.perch) continue;
    const r = resolve(p.variantId);
    if (r?.anchor === "wall" || r?.sizing === "stretch") continue;
    out.push(hangTarget(`placement:${p.id}`, placementFootprint(p), p.position, p.rotation ?? 0, !!p.mirrored, p.stage ? 1 : p.scale || 1));
  }
  for (const f of structure.features) {
    if (f.kind === "surface" || f.kind === "curtain") continue; // the ground is not furniture; a curtain is the wall
    out.push(hangTarget(`feature:${f.id}`, featureFootprint(f), { x: f.x, y: f.y }, f.rotationDeg ?? 0));
  }
  return out;
}

/** hangTargetsOf, remembered against what it READS — the tables and their groups, the rows on the
 *  floor, the venue and this event's arrangement of it (`doc.features`) — so a screen may ask on
 *  every render and pay only when one of those changed. Keyed on the document instead, the studio
 *  rebuilt every target on every frame of a ceiling item's own drag (each move writes the document):
 *  every table, floor item and venue feature as polygons again, 500+ of them at a landscaped venue.
 *  A move rewrites only the moved placement's row, so the floor's rows keep their identity through
 *  it. One per screen (`useState(hangTargetsCache)`): a plain memoised function rather than a ref,
 *  because its answer is a pure function of its arguments — only the cost depends on what it
 *  remembers. `arranged` is arrangedStructure(venue, doc), which is what the targets are read from. */
export function hangTargetsCache(): (doc: DesignDocumentContent, venue: VenueStructure, arranged: VenueStructure) => HangTarget[] {
  let last: { tables: DesignTable[]; groups: DesignDocumentContent["groups"]; floor: Placement[]; venue: VenueStructure; features: DesignDocumentContent["features"]; targets: HangTarget[] } | null = null;
  return (doc, venue, arranged) => {
    const floor = doc.placements.filter((p) => p.layer !== "ceiling");
    if (last && last.tables === doc.tables && last.groups === doc.groups && last.venue === venue && last.features === doc.features && last.floor.length === floor.length && last.floor.every((p, i) => p === floor[i])) return last.targets;
    last = { tables: doc.tables, groups: doc.groups, floor, venue, features: doc.features, targets: hangTargetsOf(doc, arranged) };
    return last.targets;
  };
}

/** A ceiling item's hang point: its shape's visual centre, where it stands now. */
export function hangPointOf(p: Placement): Point {
  const o = anchorOffset(placementFootprint(p), p.rotation ?? 0, !!p.mirrored, p.scale || 1);
  return { x: p.position.x + o.x, y: p.position.y + o.y };
}

/** The target key the table `tableId` answers to: its block's when it is grouped (a block is ONE
 *  target, lib/studio/hang.ts blockTarget), else its own. */
export function overKeyOf(doc: DesignDocumentContent, tableId: string): string {
  const t = doc.tables.find((x) => x.id === tableId);
  return t?.groupId ? `group:${t.groupId}` : `table:${tableId}`;
}

/** The TABLE under a hang point — what a dropped or dragged ceiling item gets linked to
 *  (Placement.over). Over a block it is the member the point is over (else the nearest member),
 *  so the link always names a table; over a stage, a bar or bare floor it is nothing. */
export function tableUnderHang(doc: DesignDocumentContent, targets: readonly HangTarget[], point: Point): string | null {
  const t = targetUnder(point, targets);
  if (!t) return null;
  if (t.key.startsWith("table:")) return t.key.slice("table:".length);
  if (!t.key.startsWith("group:")) return null;
  const gid = t.key.slice("group:".length);
  const members = doc.tables.filter((x) => x.groupId === gid);
  for (const m of members) {
    if (insidePolys(point, footprintPolygons(tableFootprint(m), m.position, m.rotation ?? 0, !!m.mirrored))) return m.id;
  }
  let best: string | null = null;
  let bestD = Infinity;
  for (const m of members) {
    const d = Math.hypot(m.position.x - point.x, m.position.y - point.y);
    if (d < bestD) {
      bestD = d;
      best = m.id;
    }
  }
  return best;
}

/** A document drawn before ceiling items were linked to tables (Placement.over), with every free
 *  ceiling item that hangs over a table linked to it — read off the drawing, the way a drop reads
 *  it. Run once when a document is opened: from then on the table carries it, the focus mode
 *  arranges it, and "apply above tables" sees it as already there rather than hanging a second
 *  one on top of it (which is how one event came to have two chandeliers from one point). The
 *  document itself when there is nothing to adopt. */
export function adoptHung(doc: DesignDocumentContent, structure: VenueStructure): DesignDocumentContent {
  const free = doc.placements.filter((p) => p.layer === "ceiling" && !p.over && !p.span && resolve(p.variantId)?.anchor !== "wall");
  if (free.length === 0 || doc.tables.length === 0) return doc;
  const targets = hangTargetsOf(doc, structure);
  const link = new Map<string, string>();
  for (const p of free) {
    const over = tableUnderHang(doc, targets, hangPointOf(p));
    if (over) link.set(p.id, over);
  }
  if (link.size === 0) return doc;
  return { ...doc, placements: doc.placements.map((p) => (link.has(p.id) ? { ...p, over: link.get(p.id)! } : p)) };
}

/** The middle a ceiling item is measured from: the table it is LINKED to (its block's middle when
 *  grouped) — even when it hangs past that table's rim, a pendant in a ring round a round table is
 *  still that table's — else whatever is under its hang point. Null over bare floor. */
export function hangCentreOf(p: Placement, doc: DesignDocumentContent, targets: readonly HangTarget[]): Point | null {
  if (p.over) {
    const key = overKeyOf(doc, p.over);
    const t = targets.find((x) => x.key === key);
    if (t) return t.centre;
  }
  return centreOver(hangPointOf(p), targets)?.point ?? null;
}

/** Where to put a ceiling item so its hang point lands on `point` — its position is its BOX centre,
 *  which on a shaped installation is not its middle. */
export function positionHungAt(p: Placement, point: Point): Point {
  const o = anchorOffset(placementFootprint(p), p.rotation ?? 0, !!p.mirrored, p.scale || 1);
  return { x: Math.round(point.x - o.x), y: Math.round(point.y - o.y) };
}
