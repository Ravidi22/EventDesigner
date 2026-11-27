// LED in the room (spec 2026-11-07 §7): a STRIP is a thin glowing ribbon along its line, a SCREEN a
// dark box whose front face glows. Both glow through their material (`glow`, ./types.ts MaterialKind)
// and through nothing else: no emitter, no point light. The viewer's light pool is fixed at the
// device's size and must never change with the content (CLAUDE.md, 2026-10-27: a light count that
// changes recompiles every shader) — a strip's light is its own face, which the mood brightens.
//
// Pure, as every builder here: the caller (./build.ts) resolves the rail to a path in the room and
// says how high the light runs; this only turns that into parts.
import type { Point } from "@/lib/studio/hall";
import type { ItemBuild } from "./collect";
import type { ItemContext } from "./item-context";
import { glowMaterial } from "./materials";
import { vec3, type MaterialRef, type Part } from "./types";

/** A strip's height in the room: a 10 mm tape in its 14 mm aluminium profile. */
export const STRIP_H_MM = 14;
/** A strip along an EDGE (a stage's deck, a bar's counter) runs this far under its top. */
export const STRIP_UNDER_TOP_MM = 20;
/** A strip at the floor line (a wall rail at 0) stands this far up, clear of the floor's plane. */
export const STRIP_FLOOR_MM = 30;

/** A screen's dark frame round its face, and how far the face stands proud of it. */
export const BEZEL_MM = 40;
const FACE_MM = 4;
/** The face's colour: a neutral grey-blue — an unlit panel reads dark, and at night it glows softly
 *  in this colour (the viewer's GLOW_BY_MOOD). No picture: this is a placement drawing. */
export const SCREEN_FACE = "#7d8ea8";
/** The frame's colour when the row says nothing (components/led-glyph.tsx SCREEN_BODY). */
export const SCREEN_FRAME = "#23262e";

/** Where the strip's ribbon stands, from the line's top as the rail reads it: on an EDGE (`edge`) just
 *  under the top, at the floor line just clear of it, anywhere else at the height asked. */
export function stripBaseMm(topMm: number, edge: boolean): number {
  if (edge) return Math.max(0, topMm - STRIP_H_MM - STRIP_UNDER_TOP_MM);
  return topMm <= 0 ? STRIP_FLOOR_MM : topMm;
}

/** A strip along `path` (room coordinates; the caller places the body at the room origin), its
 *  ribbon's foot at `zMm`, in `colour`. */
export function ledStripBody(path: readonly Point[], zMm: number, colour: string): ItemBuild {
  const b: ItemBuild = { parts: [], material: glowMaterial(colour), instanced: [], emitters: [] };
  if (path.length < 2) return b;
  b.parts.push({ shape: "ribbon", path: path.slice(), h: STRIP_H_MM, at: vec3(0, 0, Math.max(0, zMm)) });
  return b;
}

/** A screen standing on its floor: a dark box `w` × `d` × `h`, and over its FRONT (+y) a face inset by
 *  the bezel that glows by the mood. A screen too thin to frame is all face. */
export function screenBody(ctx: Pick<ItemContext, "widthMm" | "depthMm" | "heightMm" | "tone">): ItemBuild {
  const w = Math.max(100, ctx.widthMm);
  const d = Math.max(20, ctx.depthMm);
  const h = Math.max(200, ctx.heightMm || 0);
  const frame: MaterialRef = { colour: ctx.tone || SCREEN_FRAME, kind: "matte" };
  const bezel = Math.min(BEZEL_MM, w * 0.05, h * 0.05);
  const parts: Part[] = [
    { shape: "box", w, d, h, at: vec3(0, 0, 0) },
    { shape: "box", w: w - 2 * bezel, d: FACE_MM, h: h - 2 * bezel, at: vec3(0, d / 2 + FACE_MM / 2 - 1, bezel), material: glowMaterial(SCREEN_FACE) },
  ];
  return { parts, material: frame, instanced: [], emitters: [] };
}
