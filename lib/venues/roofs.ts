// WHAT IS OVERHEAD at a point of the plan — the one question everything that HANGS asks (spec
// docs/superpowers/specs/2026-11-07-venue-heights-rails-and-covers-design.md §5.3; the user: a
// pergola is a roof, "yes").
//
// Before this round a chandelier's chain and a curtain's top read `zone.ceilingHeightMm` and nothing
// else, and an open zone (0 = open sky) had nothing to hang from — though the terrace's pergola, or
// the office block, is plainly a roof. `roofAt` answers in a fixed order, the first that covers the
// point:
//
//   1. the ZONE's ceiling, when the zone the point is in is roofed (ceilingHeightMm > 0) — of nested
//      zones, the smallest roofed one;
//   2. else the BUILDING it is in — a face-filling `structure` (./face-surfaces.ts), roofed at its
//      own height (lib/scene/envelope.ts roofBody);
//   3. else the venue's own PERGOLA it is under (FeatureKind "pergola", ./pergola.ts), at its height;
//   4. else a sketch's hired pergola it is under — the caller's (`sketchPergolas` reads them off a
//      document with the caller's catalog);
//   5. else null: open sky.
//
// A pergola's height is its TOP — what a rod or a chain is tied to; the slats a chain passes between
// are not modelled. Pure: no React, no catalog priming. `npm run check:roofs` runs the self-check.
import type { Point } from "@/lib/studio/hall";
import type { Placement } from "@/lib/design-document/types";
import type { Product } from "@/lib/catalog/types";
import { sizedFootprint } from "@/lib/studio/footprint";
import { footprintPolygons } from "@/lib/studio/proximity";
import { polygonAreaMm2 } from "@/lib/studio/geometry";
import { pointInPolygon } from "./faces";
import { featureWorldOutline, followsWalls } from "./face-surfaces";
import { isPergolaRow } from "./pergola";
import type { StructureFeature, VenueStructure } from "./structure";

export type RoofKind = "zone" | "building" | "pergola";

export interface Roof {
  /** How high it is over the floor, mm — a ceiling's plane, a building's roof, a pergola's top. */
  heightMm: number;
  kind: RoofKind;
  /** The zone's, the building's or the pergola's id. */
  id: string;
}

/** A pergola that is not the venue's: a sketch's hired one, where it stands (its outline in room mm)
 *  and how tall it is. */
export interface PergolaCover {
  id: string;
  outline: Point[];
  heightMm: number;
}

/** What `roofAt` reads of a zone — a ResolvedZone (./zone.ts) is one. */
export interface RoofZone {
  boundary: Point[];
  zone: { id: string; ceilingHeightMm: number };
}

// Each feature's outline read once per feature object — the venue's features are stable objects
// between edits, and a landscaped venue is hundreds of them.
const outlines = new WeakMap<StructureFeature, Point[]>();
function outlineOf(f: StructureFeature): Point[] {
  let o = outlines.get(f);
  if (!o) outlines.set(f, (o = featureWorldOutline(f)));
  return o;
}

/** What is overhead at `point`, or null for open sky. `structure` is the venue as this surface has it
 *  (a sketch's arranged one: a pergola an event moved is where it stands tonight); `zones` every zone
 *  on the property; `pergolas` a sketch's hired ones (sketchPergolas). */
export function roofAt(
  point: Point,
  structure: Pick<VenueStructure, "features">,
  zones: readonly RoofZone[],
  pergolas: readonly PergolaCover[] = [],
): Roof | null {
  let zone: { roof: Roof; area: number } | null = null;
  for (const z of zones) {
    const h = z.zone.ceilingHeightMm || 0;
    if (h <= 0 || z.boundary.length < 3 || !pointInPolygon(point, z.boundary)) continue;
    const area = Math.abs(polygonAreaMm2(z.boundary));
    if (!zone || area < zone.area) zone = { roof: { heightMm: h, kind: "zone", id: z.zone.id }, area };
  }
  if (zone) return zone.roof;
  for (const f of structure.features) {
    if (f.kind !== "structure" || !followsWalls(f) || !(f.heightMm > 0)) continue;
    const o = outlineOf(f);
    if (o.length >= 3 && pointInPolygon(point, o)) return { heightMm: f.heightMm, kind: "building", id: f.id };
  }
  for (const f of structure.features) {
    if (f.kind !== "pergola" || !(f.heightMm > 0)) continue;
    const o = outlineOf(f);
    if (o.length >= 3 && pointInPolygon(point, o)) return { heightMm: f.heightMm, kind: "pergola", id: f.id };
  }
  for (const p of pergolas) {
    if (p.heightMm > 0 && p.outline.length >= 3 && pointInPolygon(point, p.outline)) return { heightMm: p.heightMm, kind: "pergola", id: p.id };
  }
  return null;
}

/** A sketch's hired pergolas (rows of the `pergolas` category standing on the floor) as covers: each
 *  at the size it was stretched to, turned, mirrored and drawn at its scale, at its row's height. */
export function sketchPergolas(placements: readonly Placement[], productOf: (variantId: string) => Product | undefined): PergolaCover[] {
  const out: PergolaCover[] = [];
  for (const p of placements) {
    if (p.layer !== "floor" || p.tableId || p.perch) continue;
    const product = productOf(p.variantId);
    if (!product || !isPergolaRow(product)) continue;
    const [outline] = footprintPolygons(sizedFootprint(product, p.sizeMm), p.position, p.rotation || 0, !!p.mirrored, p.scale || 1);
    if (outline && outline.length >= 3) out.push({ id: p.id, outline, heightMm: product.dimensions.heightMm || 0 });
  }
  return out;
}

/** The height of what is overhead, or null under open sky — `roofAt` in the shape the rail's
 *  `defaultRailHeight(point, roofAt?)` hook (lib/studio/rail.ts) takes. */
export function roofHeightAt(
  structure: Pick<VenueStructure, "features">,
  zones: readonly RoofZone[],
  pergolas: readonly PergolaCover[] = [],
): (p: Point) => number | null {
  return (p) => roofAt(p, structure, zones, pergolas)?.heightMm ?? null;
}
