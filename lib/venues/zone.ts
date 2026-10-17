// A zone is an IDENTIFIER over a region of the venue's one structure — not a shape of its own.
//
// This is the correction that matters. Zones do not own walls, outlines, doors, columns or
// fixtures; all of that lives once in the shared VenueStructure. A zone says "this region is
// אולם גדול, it seats 400, its ceiling is 6m" and nothing more. The consequence is that there is
// exactly one drawing of the property, and renaming or deleting a zone never touches a wall.
//
// A zone gets its region one of two ways, matching how the designer marked it out:
//   face   — they clicked inside an area the walls already enclose. Stored as the point clicked,
//            NOT as a copy of the polygon: the region is re-derived from the current walls every
//            time, so moving a wall reshapes the zone automatically instead of leaving its
//            boundary behind as a stale duplicate.
//   region — they drew it freehand over open ground (קוליסאום, lawn, parking), where there are no
//            walls to enclose anything and therefore nothing to detect.
//   features — they picked the venue features it is MADE of (a חופה: its stage, the runway, the pool
//            it crosses) and the zone is the area round them, a margin wide, re-derived from where
//            they stand on every read (./feature-zones.ts) — moved with them, never a stale copy.
import type { Point } from "@/lib/studio/hall";
import type { ElementStyle } from "@/lib/element-style";
import { outlineBounds, polygonAreaMm2, type Bounds } from "@/lib/studio/geometry";
import { faceAt, type Face } from "./faces";
import type { StructureFeature, SurfaceMaterial } from "./structure";
import { featuresBoundary } from "./feature-zones";

//   hall    — enclosed and roofed; walls, doors, ceiling height
//   canopy  — a חופה: a real structure open to the sky
//   open    — an area you occupy rather than a room you enter (קוליסאום, lawn, plaza)
//   service — kitchen, storage, parking; part of the plan, never designed into
export type ZoneKind = "hall" | "canopy" | "open" | "service";

export const ZONE_KIND_LABEL: Record<ZoneKind, string> = {
  hall: "אולם",
  canopy: "חופה",
  open: "שטח פתוח",
  service: "שירות",
};

export type ZoneSource =
  | { type: "face"; anchor: Point }
  | { type: "region"; boundary: Point[] }
  /** The features it is made of, and how far round them it reaches (always written, so a later
   *  default never moves a zone already drawn). */
  | { type: "features"; featureIds: string[]; marginMm: number };

export interface ZoneCapacity {
  seated?: number;
  standing?: number;
}

export interface Zone {
  id: string;
  venueId: string;
  name: string;
  kind: ZoneKind;
  source: ZoneSource;
  ceilingHeightMm: number; // 0 = open to the sky
  capacity?: ZoneCapacity;
  /** Per-zone tint override. Absent = the kind's default fill, so the plan still reads by kind
   *  alone and a designer's colour choice is an addition, never the only signal. */
  style?: ElementStyle;
  /** What its floor is laid in — the lawn of a garden, the tiles of a hall — drawn as a real-scale
   *  texture across the whole region, under everything standing in it (components/surface-fill.tsx,
   *  the same materials as a `surface` feature). The tint above, if any, colours the material.
   *  Absent = no surface: the kind's tint, as every zone drew before this. */
  surface?: SurfaceMaterial;
  createdAt: number;
}

// A zone paired with the region it currently resolves to. Screens render these, never raw zones,
// because a face-sourced zone has no boundary until the walls are consulted.
export interface ResolvedZone {
  zone: Zone;
  boundary: Point[];
  /** Face-sourced, but the walls no longer enclose its anchor — someone deleted or opened a wall —
   *  or made of features none of which is on the plan any more. Surfaced rather than silently
   *  dropped: the designer needs to know a named area came undone. */
  detached: boolean;
}

/** `features` is the venue's own (the structure the faces were detected in) — what a features zone
 *  is resolved against. A caller with none resolves such a zone as detached. */
export function resolveZone(zone: Zone, faces: Face[], features: readonly StructureFeature[] = []): ResolvedZone {
  const src = zone.source;
  if (src.type === "region") return { zone, boundary: src.boundary, detached: false };
  if (src.type === "features") {
    const boundary = featuresBoundary(features, src.featureIds, src.marginMm);
    return { zone, boundary, detached: boundary.length === 0 };
  }
  const face = faceAt(faces, src.anchor);
  return { zone, boundary: face?.boundary ?? [], detached: face === null };
}

export function resolveZones(zones: Zone[], faces: Face[], features: readonly StructureFeature[] = []): ResolvedZone[] {
  return zones.map((z) => resolveZone(z, faces, features));
}

/** What a detached zone's row says came undone — the walls, or the features it was made of. */
export function detachedNote(zone: Zone): string {
  return zone.source.type === "features"
    ? "האלמנטים שהאזור הוגדר לפיהם אינם על התוכנית יותר."
    : "השטח נפתח — הקירות סביבו אינם סוגרים אותו יותר.";
}

export function isOpenAir(zone: Zone): boolean {
  return zone.ceilingHeightMm === 0;
}

export function zoneAreaM2(resolved: ResolvedZone): number {
  return polygonAreaMm2(resolved.boundary) / 1_000_000;
}

export function zoneBounds(resolved: ResolvedZone): Bounds {
  return outlineBounds(resolved.boundary);
}

/** The box containing every resolved zone — what the venue view frames itself with. */
export function zonesBounds(resolved: ResolvedZone[]): Bounds {
  const boxes = resolved.map(zoneBounds).filter((b) => b.widthMm > 0 || b.heightMm > 0);
  if (boxes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, widthMm: 0, heightMm: 0 };
  const minX = Math.min(...boxes.map((b) => b.minX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  return { minX, minY, maxX, maxY, widthMm: maxX - minX, heightMm: maxY - minY };
}

export function newZone(venueId: string, kind: ZoneKind, source: ZoneSource, name = ""): Zone {
  return {
    id: crypto.randomUUID(),
    venueId,
    name,
    kind,
    source,
    ceilingHeightMm: kind === "hall" ? 4000 : 0,
    createdAt: Date.now(),
  };
}
