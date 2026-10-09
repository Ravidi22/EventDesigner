// What a ceiling item can hang OVER on this event's plan — every table, every thing standing on the
// floor, and the venue's own furniture where this event stood it — as lib/studio/hang.ts's targets.
//
// Beside the screen rather than in lib/, for plan-geometry.ts's reason: it reads the catalog through
// the synchronous resolver and the footprint helpers the canvas draws with, so "over the table" here
// is the table the designer can see. The geometry itself (which one, where its middle is) is pure
// and self-checked in lib/studio/hang.ts. The printed ceiling plan asks the same question through
// this file, so the sketch and the sheet can never disagree about what a chandelier is over.
import type { DesignDocumentContent, Placement, Point } from "@/lib/design-document/types";
import { resolve } from "@/lib/studio/catalog-resolver";
import { anchorOffset, hangTarget, type HangTarget } from "@/lib/studio/hang";
import { featureFootprint, type VenueStructure } from "@/lib/venues/structure";
import { placementFootprint, tableFootprint } from "@/components/footprint-shape";

/** `structure` is the ARRANGED one (lib/design-document/features.ts) — the bar where this event put it. */
export function hangTargetsOf(doc: DesignDocumentContent, structure: VenueStructure): HangTarget[] {
  const out: HangTarget[] = doc.tables.map((t) => hangTarget(`table:${t.id}`, tableFootprint(t), t.position, t.rotation ?? 0, !!t.mirrored));
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
