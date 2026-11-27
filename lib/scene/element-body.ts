// AN ELEMENT'S BODY — the room reads the element model (lib/element, docs/superpowers/specs/
// 2026-11-07-element-model-design.md §3): every part of a definition stood up at its own z and
// height, each in its own surface. The first customer is the ADR-5 fallback (./item-context.ts):
// an item with no picture of its own used to be its footprint extruded to the row's height in one
// material; now it is its parts — a hollow band in marble beside a timber end, a shelf a metre up
// the back-bar — and a row with no heights of its own builds exactly what it did.
//
// Pure. Run: npm run check:scene-element
import type { Product } from "@/lib/catalog/types";
import { buildHollow, footprintBounds, frontBand, frontFace, type Footprint } from "@/lib/studio/footprint";
import { definitionOf, elementSizeOf } from "@/lib/element/adapter";
import { revolveProfileMm } from "@/lib/element/revolve";
import { elementGeometry, sameFootprint, type ElementGeometry, type ResolvedPart } from "@/lib/element/geometry";
import type { ElementDefinition } from "@/lib/element/types";
import type { ItemBuild } from "./collect";
import { type MaterialRef, type Part, vec3 } from "./types";
import { materialRefOf } from "./materials";
import { isMaterial } from "@/lib/catalog/material";

/** How thick a shape drawn as lines only stands in the room — a rope, a rail, a hedge-line. */
export const LINE_WALL_MM = 40;
/** The least a part rises: a sheet laid flat still has a top to see. */
const MIN_PART_MM = 10;

/** A part's own material: its texture or picture over its own colour, else `body`'s; none when it has
 *  neither a surface nor a colour of its own (the body's material is used). */
function partMaterial(p: ResolvedPart, body: MaterialRef): MaterialRef | undefined {
  const s = p.part.surface;
  const colour = p.part.colour;
  // A part made of something of its own (a crystal stem, gold arms — §4) is built in it, in its own
  // colour, else the item's; a texture of its own is laid on that.
  const own = isMaterial(p.part.material) ? p.part.material : undefined;
  if (!s && !colour && !own) return undefined;
  const m: MaterialRef = own ? materialRefOf(own, colour ?? body.colour) : { colour: colour ?? body.colour, kind: body.kind };
  if (own && !s) return m;
  if (s?.textureImage?.url) m.image = s.textureImage;
  else if (s?.texture) m.texture = s.texture;
  return m.image || m.texture || colour ? m : undefined;
}

/** The outlines a part is built from: its pieces, a lines-only one as a thin wall along its lines
 *  (its closing side left out, as the plan leaves it out). */
function solids(p: ResolvedPart) {
  return p.pieces.flatMap((o) => (o.open ? buildHollow(o, { bandMm: LINE_WALL_MM, openSides: [o.outline.length - 1] }) : [o]));
}

/** The parts of `geometry` as 3D parts in the element's frame, bottom at each part's z. */
export function elementParts(geometry: ElementGeometry, body: MaterialRef): Part[] {
  const out: Part[] = [];
  for (const p of geometry.parts) {
    const op = p.part.op;
    // An outline only (a pergola's roof line): the plan's, never the room's.
    if (op.kind === "none") continue;
    const material = partMaterial(p, body);
    if (op.kind === "panel") {
      out.push(...panelParts(p, op, material));
      continue;
    }
    const h = Math.max(MIN_PART_MM, p.heightMm);
    for (const outline of solids(p)) {
      if (op.kind === "revolve") {
        // The side profile turned about the piece's centre — a bowl, a basin, a baluster: the
        // fractions read against the piece as it stands (its half-width the rim, `h` the top), an
        // ellipse the same body stretched along y.
        const b = footprintBounds({ kind: "custom", outline: outline.outline, ...(outline.edgeCurves ? { edgeCurves: outline.edgeCurves } : {}) });
        const xs = outline.outline.map((v) => v.x);
        const ys = outline.outline.map((v) => v.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const part: Part = { shape: "lathe", profile: revolveProfileMm(op.profile, b.w / 2, h), at: vec3(cx, cy, p.zMm) };
        if (b.w && b.h && Math.abs(b.w - b.h) > 1) part.scaleY = b.h / b.w;
        if (material) part.material = material;
        out.push(part);
        continue;
      }
      const part: Part = op.kind === "sheet" ? { shape: "plane", outline, at: vec3(0, 0, p.zMm) } : { shape: "extrude", outline, h, at: vec3(0, 0, p.zMm) };
      if (material) part.material = material;
      out.push(part);
    }
  }
  return out;
}

/** A front shape's panel (lib/element/front.ts): its face pushed back, standing on its plan band —
 *  the band's own frame found from where its first corner landed in the element's frame (the band is
 *  turned about its box centre and moved to the part's place, then the lot is centred), so the panel
 *  stands exactly on what the plan draws. */
function panelParts(p: ResolvedPart, op: Extract<ResolvedPart["part"]["op"], { kind: "panel" }>, material: MaterialRef | undefined): Part[] {
  const face = frontFace(p.part.profile.shape, { ...p.part.profile, faceTurnDeg: op.faceTurnDeg });
  const band = frontBand(face.w, op.thicknessMm, op.bendDeg);
  const turn = ((p.part.rotation || 0) * Math.PI) / 180;
  return p.pieces.map((piece) => {
    const c0 = band.outline[0];
    const q0 = piece.outline[0];
    const cx = q0.x - (c0.x * Math.cos(turn) - c0.y * Math.sin(turn));
    const cy = q0.y - (c0.x * Math.sin(turn) + c0.y * Math.cos(turn));
    const part: Part = {
      shape: "panel",
      face: face.pieces,
      widthMm: face.w,
      faceHeightMm: face.h,
      thicknessMm: op.thicknessMm,
      bendDeg: op.bendDeg,
      at: vec3(cx, cy, p.zMm),
      ...(p.part.rotation ? { rotDeg: p.part.rotation } : {}),
    };
    if (material) part.material = material;
    return part;
  });
}

/** The definition's geometry at the size the item is drawn at, when the element model agrees
 *  with the footprint the room was handed — a placement whose footprint is overridden (a carpet laid
 *  to an outline, a runner's trimmed strip) is not the row's element and gets null. */
export function elementOf(product: Product | undefined, footprint: Footprint): { definition: ElementDefinition; geometry: ElementGeometry } | null {
  if (!product) return null;
  const definition = definitionOf(product);
  // A placement's size is whole millimetres (clampSize); the box read back off a composed footprint
  // may be a hair off (a beam turned 90° through sin/cos), so it is rounded before the element is
  // sized again — otherwise the two readings differ by 1e-12 and the room falls back to an extrude.
  const b = footprintBounds(footprint);
  const catalog = elementGeometry(definition);
  const same = (g: ElementGeometry) => (sameFootprint(g.footprint, footprint) ? g : null);
  const geometry = same(catalog) ?? same(elementGeometry(definition, elementSizeOf(product, { widthMm: Math.round(b.w), depthMm: Math.round(b.h) })));
  return geometry ? { definition, geometry } : null;
}

/** A category's recipe meets the element model: the shapes that SAID something about their bodies
 *  (ElementPart.own — a shelf a metre up, a raised tier) built by the model, and the footprint of
 *  the rest handed back for the recipe to draw as it always did (a table's top, its legs, its
 *  cloth). The rest keeps its place in the element's frame — never a shape that is an outline only
 *  (`body: "none"`, the plan's reach), and each of its pieces with the material its shape asked for
 *  (`materials`, by piece: its own colour or surface, else undefined = the recipe's): a table's top
 *  was built of every shape in the table's timber, so neither ever reached the room (SH-2, QA
 *  2026-11-20). `whole`: the rest is all of the footprint, which the recipe may then draw as it is (a
 *  rectangle on its four legs). Null when no shape says anything the recipe would not draw itself. */
export function ownBodyParts(
  product: Product | undefined,
  footprint: Footprint,
  body: MaterialRef,
  opts: { baseProfileIsPicture?: boolean; only?: (p: ResolvedPart) => boolean; /** Every shape but the first is the model's — the picture stands on the first alone (lib/catalog/picture-frame.ts). */ others?: boolean } = {},
): { parts: Part[]; rest: Footprint; materials: (MaterialRef | undefined)[]; whole: boolean } | null {
  const el = elementOf(product, footprint);
  if (!el) return null;
  // The base's own body of revolution is the model's too (a bowl on a table) — the user, 2026-11-07:
  // "the body you added is good but it doesn't combine with the drawing" — while the base's PIECES
  // stay in the rest: the recipe's picture stands on the item's footprint whatever stands at its
  // centre. Unless the PICTURE reads that profile itself (`baseProfileIsPicture` — a chandelier's
  // silhouette, lib/catalog/chandelier.ts): built here as well, it was a solid the size of the whole
  // piece with the picture inside it.
  // `only` narrows what the model builds (a bar's recipe honours its own back pieces' heights, so
  // only its front panels are the model's).
  const isOwn = (p: ResolvedPart) =>
    opts.only ? opts.only(p) : p.index === 0 ? (!!p.part.own && p.part.op.kind !== "revolve") || (!opts.baseProfileIsPicture && p.part.op.kind === "revolve") : !!p.part.own || !!opts.others;
  const recipe = el.geometry.parts.filter((p) => p.index === 0 || !p.part.own);
  const kept = recipe.filter((p) => p.part.op.kind !== "none");
  const materials = kept.flatMap((p) => p.pieces.map(() => partMaterial(p, body)));
  const ownParts = el.geometry.parts.filter(isOwn);
  // Nothing taken for the model and nothing left out: the recipe's own footprint is the rest.
  const whole = !ownParts.length && kept.length === el.geometry.parts.length;
  if (whole && !materials.some(Boolean)) return null;
  const own = { ...el.geometry, parts: ownParts };
  return { parts: elementParts(own, body), rest: { kind: "multi", parts: kept.flatMap((p) => p.pieces) }, materials, whole };
}

/** The fallback body through the element model: the item's parts, each in its own surface, on the
 *  body's material. Null when the element model does not describe this footprint. */
export function elementBody(product: Product | undefined, footprint: Footprint, body: MaterialRef): ItemBuild | null {
  const el = elementOf(product, footprint);
  if (!el) return null;
  return { parts: elementParts(el.geometry, body), material: body, instanced: [], emitters: [] };
}
