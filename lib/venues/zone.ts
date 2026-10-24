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
import type { Column, EdgeCurve, Entrance, Fixture, Point } from "@/lib/studio/hall";
import type { ElementStyle } from "@/lib/element-style";
import { outlineBounds, polygonAreaMm2, type Bounds } from "@/lib/studio/geometry";
import { faceAt, type Face } from "./faces";

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
  | { type: "region"; boundary: Point[] };

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
  createdAt: number;
}

// A zone paired with the region it currently resolves to. Screens render these, never raw zones,
// because a face-sourced zone has no boundary until the walls are consulted.
export interface ResolvedZone {
  zone: Zone;
  boundary: Point[];
  /** Face-sourced, but the walls no longer enclose its anchor — someone deleted or opened a wall.
   *  Surfaced rather than silently dropped: the designer needs to know a named area came undone. */
  detached: boolean;
}

export function resolveZone(zone: Zone, faces: Face[]): ResolvedZone {
  if (zone.source.type === "region") return { zone, boundary: zone.source.boundary, detached: false };
  const face = faceAt(faces, zone.source.anchor);
  return { zone, boundary: face?.boundary ?? [], detached: face === null };
}

export function resolveZones(zones: Zone[], faces: Face[]): ResolvedZone[] {
  return zones.map((z) => resolveZone(z, faces));
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

// --- the legacy renderer seam ----------------------------------------------
// Unrelated to the zone model above, and on its way out. The four plan renderers still take Hall
// objects from the old per-hall screens; this is the geometric subset they read, so they could
// come off Hall.widthMm/heightMm before their callers were migrated. It retires with Hall.
export interface ZoneShell {
  outline?: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  columns: Column[];
  entrances: Entrance[];
  stage?: Fixture;
  bars: Fixture[];
  /** @deprecated Legacy Hall bounding box. Read only when `outline` is absent; retires with Hall. */
  widthMm?: number;
  heightMm?: number;
}

// Synthesises the width×height rectangle for halls saved before `outline` existed, so that fallback
// lives in one place instead of at each viewBox. Any partially-drawn outline wins outright: mid-draw
// a shape legitimately has one or two points, which is not the legacy case the rectangle is for.
export function shellOutline(shell: ZoneShell): Point[] {
  if (shell.outline?.length) return shell.outline;
  const w = shell.widthMm ?? 0;
  const h = shell.heightMm ?? 0;
  if (w <= 0 || h <= 0) return [];
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

export function shellBounds(shell: ZoneShell): Bounds {
  return outlineBounds(shellOutline(shell), shell.edgeCurves);
}
