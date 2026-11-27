// A DANCE FLOOR (רחבת ריקודים — the built-in kit, docs/superpowers/specs/2026-11-07-built-in-kit-
// design.md §2) is laid like a rug — stretched, its sides bowed, its corners rounded, or laid to an
// outline over a surface or a stage (lib/studio/cover.ts) — and is MADE of panels: the hire trade's
// 61cm square (2 feet) clicked together, every other one a shade off, with a seam between each.
//
// This file is the panels' geometry, pure, so the plan (components/dance-floor.tsx), the printed map
// and the 3D scene (lib/scene/dance-floor.ts) draw the same grid: a true-size grid centred on the
// floor's box, each panel CLIPPED to the floor's real outline (a rounded corner cuts its panel, a hole
// cut through a carpet laid over a stage cuts its panels too), and the seams as the grid lines' runs
// INSIDE the floor. Everything is in the floor's own frame, the frame its outline is drawn in.
import type { Point } from "@/lib/studio/hall";
import { flattenEdge, footprintOutlines, type BuiltOutline, type Footprint } from "@/lib/studio/footprint";
import { rugPolygon, type RugShape } from "@/lib/studio/rug-shape";

/** One panel's side: 2 feet, what dance floors are hired in. */
export const DANCE_PANEL_MM = 610;
/** The aluminium edge trim round the floor, in from its edge. */
export const DANCE_TRIM_MM = 40;
/** The most panels drawn: past it the panel is drawn bigger (a 40m floor is not 4,300 paths). */
export const DANCE_MAX_PANELS = 2500;

/** The floor's outline as rings in its own frame, holes included — to be read even-odd. `footprint`
 *  is a carpet's outline (Placement.outline, carpetFootprint), centred; else the rug shape on a
 *  w × h rectangle about its centre (lib/studio/rug-shape.ts — absent = the plain rectangle). */
export function danceFloorRings(
  w: number,
  h: number,
  opts: { shape?: RugShape; footprint?: Footprint; holes?: readonly (readonly Point[])[] } = {},
): Point[][] {
  const flat = (o: BuiltOutline): Point[] => o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % o.outline.length], o.edgeCurves?.[i]).slice(0, -1));
  const outer = opts.footprint ? footprintOutlines(opts.footprint).filter((o) => !o.open).map(flat) : [rugPolygon(w, h, opts.shape)];
  return [...outer, ...(opts.holes ?? []).map((r) => r.map((p) => ({ x: p.x, y: p.y })))].filter((r) => r.length >= 3);
}

export interface DanceGrid {
  /** The panel's side as drawn (DANCE_PANEL_MM, or bigger past DANCE_MAX_PANELS). */
  panelMm: number;
  /** Every OTHER panel, clipped to the floor: the pieces of the outer rings and of the holes inside
   *  each, to be filled even-odd (a hole's piece cuts its panel's). */
  alt: Point[][];
  /** The seams: each grid line's runs inside the floor (outside its holes). */
  seams: [Point, Point][];
  /** The same alternate panels as SOLIDS, for the 3D scene's extrusions: each piece of an outer ring
   *  in a panel, with the pieces of the holes in that panel to cut out of it (`holesFrom`). */
  panels: { outline: Point[]; holes: Point[][] }[];
}

export const area = (r: readonly Point[]) => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

/** A ring clipped to an axis-aligned box (Sutherland–Hodgman, one side at a time). A concave ring
 *  that leaves the box twice comes back as one ring joined along the box's side — a seam of no area,
 *  which an even-odd fill does not show. */
function clipToBox(ring: readonly Point[], x0: number, y0: number, x1: number, y1: number): Point[] {
  let out: Point[] = ring.slice();
  const side = (inside: (p: Point) => boolean, cut: (a: Point, b: Point) => Point) => {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      const ai = inside(a);
      const bi = inside(b);
      if (ai) out.push(a);
      if (ai !== bi) out.push(cut(a, b));
    }
  };
  const atX = (x: number) => (a: Point, b: Point): Point => ({ x, y: a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x) });
  const atY = (y: number) => (a: Point, b: Point): Point => ({ x: a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y), y });
  side((p) => p.x >= x0, atX(x0));
  if (out.length) side((p) => p.x <= x1, atX(x1));
  if (out.length) side((p) => p.y >= y0, atY(y0));
  if (out.length) side((p) => p.y <= y1, atY(y1));
  return out;
}

/** Where one grid line runs inside the floor: its crossings with every ring, paired even-odd. */
function runsAlong(rings: readonly (readonly Point[])[], axis: "x" | "y", c: number): [number, number][] {
  const hits: number[] = [];
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      const [ac, bc, ao, bo] = axis === "x" ? [a.x, b.x, a.y, b.y] : [a.y, b.y, a.x, b.x];
      if (ac <= c !== bc <= c) hits.push(ao + ((c - ac) * (bo - ao)) / (bc - ac));
    }
  hits.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < hits.length; i += 2) if (hits[i + 1] - hits[i] > 0.5) out.push([hits[i], hits[i + 1]]);
  return out;
}

/** The panels over the floor: a true-size grid centred on the rings' box, every other panel clipped
 *  to the floor, and the seams. Pure, and as cheap as the panel count (one clip per panel). Rings
 *  from `holesFrom` on are holes (danceFloorRings puts them last) — only `panels` needs telling. */
export function danceFloorGrid(rings: readonly (readonly Point[])[], panelMm = DANCE_PANEL_MM, holesFrom = rings.length): DanceGrid {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rings)
    for (const p of r) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  if (!(maxX - minX > 0 && maxY - minY > 0) || !(panelMm > 0)) return { panelMm, alt: [], seams: [], panels: [] };
  let panel = panelMm;
  while (Math.ceil((maxX - minX) / panel) * Math.ceil((maxY - minY) / panel) > DANCE_MAX_PANELS) panel *= 2;
  const nx = Math.ceil((maxX - minX) / panel - 1e-6);
  const ny = Math.ceil((maxY - minY) / panel - 1e-6);
  // Centred: the cut panels at either end are the same width, as a floor laid from its middle is.
  const ox = (minX + maxX) / 2 - (nx * panel) / 2;
  const oy = (minY + maxY) / 2 - (ny * panel) / 2;
  const alt: Point[][] = [];
  const panels: DanceGrid["panels"] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if ((i + j) % 2 === 0) continue;
      const x0 = ox + i * panel;
      const y0 = oy + j * panel;
      const outer: Point[][] = [];
      const cut: Point[][] = [];
      rings.forEach((r, k) => {
        const piece = clipToBox(r, x0, y0, x0 + panel, y0 + panel);
        if (piece.length < 3 || Math.abs(area(piece)) <= 1) return;
        alt.push(piece);
        (k < holesFrom ? outer : cut).push(piece);
      });
      for (const o of outer) panels.push({ outline: o, holes: cut });
    }
  const seams: [Point, Point][] = [];
  for (let i = 1; i < nx; i++) {
    const x = ox + i * panel;
    for (const [a, b] of runsAlong(rings, "x", x)) seams.push([{ x, y: a }, { x, y: b }]);
  }
  for (let j = 1; j < ny; j++) {
    const y = oy + j * panel;
    for (const [a, b] of runsAlong(rings, "y", y)) seams.push([{ x: a, y }, { x: b, y }]);
  }
  return { panelMm: panel, alt, seams, panels };
}

/** Even-odd point-in-floor, for the self-check. */
export function inside(p: Point, rings: readonly (readonly Point[])[]): boolean {
  let hit = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i];
      const b = r[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
  return hit;
}
