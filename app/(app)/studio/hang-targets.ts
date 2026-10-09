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
import { anchorOffset, blockTarget, hangTarget, type HangTarget } from "@/lib/studio/hang";
import { featureFootprint, type VenueStructure } from "@/lib/venues/structure";
import { placementFootprint, tableFootprint } from "@/components/footprint-shape";

/** `structure` is the ARRANGED one (lib/design-document/features.ts) — the bar where this event put it. */
export function hangTargetsOf(doc: DesignDocumentContent, structure: VenueStructure): HangTarget[] {
  // A lone table is its own target; a grouped one is its BLOCK's — two tables pushed together as one
  // head table are one target with the middle on the seam (lib/studio/hang.ts blockTarget), not one
  // per member with a chandelier over the seam pulled to whichever half it is nearer.
  const out: HangTarget[] = doc.tables.filter((t) => !t.groupId).map((t) => hangTarget(`table:${t.id}`, tableFootprint(t), t.position, t.rotation ?? 0, !!t.mirrored));
  for (const g of doc.groups ?? []) {
    const members = doc.tables.filter((t) => t.groupId === g.id);
    if (members.length === 0) continue; // a group of stages is not a table; its stages are placements below
    out.push(blockTarget(`group:${g.id}`, members.map((t) => ({ f: tableFootprint(t), at: t.position, rotationDeg: t.rotation ?? 0 }))));
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
    if (f.kind === "surface") continue; // the ground is not furniture
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

/** Where to put a ceiling item so its hang point lands on `point` — its position is its BOX centre,
 *  which on a shaped installation is not its middle. */
export function positionHungAt(p: Placement, point: Point): Point {
  const o = anchorOffset(placementFootprint(p), p.rotation ?? 0, !!p.mirrored, p.scale || 1);
  return { x: Math.round(point.x - o.x), y: Math.round(point.y - o.y) };
}
