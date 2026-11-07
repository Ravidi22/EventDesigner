// A DANCE FLOOR in 3D (רחבת ריקודים — the built-in kit, spec 2026-11-07 §2): laid as a rug is
// (./floor-kinds.ts rugBody — the slab, a rug's thickness, ./elevation.ts RUG_MM, so what stands on it
// stands where elevation says), but GLOSS — its shade polished — with every other panel of the plan's
// grid (lib/catalog/dance-floor.ts) a shade off and a hair proud, and the aluminium trim round its
// edge. Follows the rug's bowed sides and rounded corners, or the outline it was laid to over a
// surface or a stage, its holes cut through (lib/studio/cover.ts). All parts merge per material in the
// viewer, so a floor of a thousand panels is still three meshes.
import type { BuiltOutline } from "@/lib/studio/footprint";
import { evenInset, footprintOutlines } from "@/lib/studio/footprint";
import { rugInset, rugOutline } from "@/lib/studio/rug-shape";
import { carpetFootprint } from "@/lib/studio/cover";
import { danceFloorGrid, danceFloorRings, DANCE_TRIM_MM } from "@/lib/catalog/dance-floor";
import { isDark } from "@/lib/element-style";
import type { ItemBuild } from "./collect";
import type { ItemContext } from "./item-context";
import { darkened } from "./items";
import { RUG_MM } from "./elevation";
import { metalMaterial, swatchMaterial } from "./materials";
import { type MaterialRef, type Part, vec3 } from "./types";

/** How far the other panels stand proud of the slab — enough to never share its top face. */
const PANEL_PROUD_MM = 1;
/** The trim stands a little over both. */
const TRIM_PROUD_MM = 2;
const TRIM_COLOUR = "#c9cbd1";

/** A step toward white, for the other panel on a dark floor. */
function lightened(hex: string, t: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

export function danceFloorBody(ctx: ItemContext): ItemBuild {
  const { widthMm: w, depthMm: d, tone } = ctx;
  const floor = swatchMaterial(ctx.resolved, ctx.product, tone, "gloss", true);
  const other: MaterialRef = { colour: isDark(floor.colour) ? lightened(floor.colour, 0.12) : darkened(floor.colour, 0.08), kind: "gloss" };
  const trim = metalMaterial(TRIM_COLOUR);
  const parts: Part[] = [];
  const carpet = ctx.carpet;
  // The slab and the outline the trim runs round.
  let edges: BuiltOutline[];
  if (carpet) {
    const base: BuiltOutline = { outline: carpet.outline, ...(carpet.edgeCurves ? { edgeCurves: carpet.edgeCurves } : {}) };
    parts.push({ shape: "extrude", outline: base, ...(carpet.holes.length ? { holes: carpet.holes.map((h) => ({ outline: h })) } : {}), h: RUG_MM, at: vec3(0, 0, 0) });
    edges = [base];
  } else if (ctx.rug) {
    const slab = rugOutline(w, d, ctx.rug);
    edges = [{ outline: slab.outline, edgeCurves: slab.edgeCurves }];
    parts.push({ shape: "extrude", outline: edges[0], h: RUG_MM, at: vec3(0, 0, 0) });
  } else {
    edges = [{ outline: [{ x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 }, { x: w / 2, y: d / 2 }, { x: -w / 2, y: d / 2 }] }];
    parts.push({ shape: "box", w, d, h: RUG_MM, at: vec3(0, 0, 0) });
  }
  // The other panels, cut to the floor and round its holes.
  const footprint = carpet ? carpetFootprint(carpet) : undefined;
  const rings = danceFloorRings(w, d, { shape: carpet ? undefined : ctx.rug, footprint, holes: carpet?.holes });
  const outers = rings.length - (carpet?.holes.length ?? 0);
  for (const p of danceFloorGrid(rings, undefined, outers).panels)
    parts.push({ shape: "extrude", outline: { outline: p.outline }, ...(p.holes.length ? { holes: p.holes.map((h) => ({ outline: h })) } : {}), h: PANEL_PROUD_MM, at: vec3(0, 0, RUG_MM), material: other });
  // The trim: a band between the edge and the edge pulled in, a little over everything.
  const trimMm = Math.min(DANCE_TRIM_MM, Math.min(w, d) / 20);
  const insets = carpet
    ? edges.map((e) => evenInset(e, trimMm))
    : ctx.rug
      ? [rugInset(w, d, ctx.rug, trimMm)].map((o) => (o ? { outline: o.outline, edgeCurves: o.edgeCurves } : null))
      : footprintOutlines({ kind: "rect", widthMm: w - trimMm * 2, depthMm: d - trimMm * 2 });
  edges.forEach((e, i) => {
    const inner = insets[i];
    if (inner) parts.push({ shape: "extrude", outline: e, holes: [inner], h: RUG_MM + TRIM_PROUD_MM, at: vec3(0, 0, 0), material: trim });
  });
  return { parts, material: floor, instanced: [], emitters: [] };
}
