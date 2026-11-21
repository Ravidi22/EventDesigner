// A catalog row READ AS AN ELEMENT DEFINITION — Stage 1 of the element model (docs/superpowers/
// specs/2026-11-07-element-model-design.md §2.7, §7).
//
// Nothing is stored: a row's MapAppearance is already an assembly — a base shape (its own
// dimensions) and the ShapeParts added beside it — and this reads it into ElementParts. The base is
// part 0 at the origin, on the floor, the row's height; every added part keeps its offset and turn,
// and stands on the floor as tall as the item unless it carries a z and a height of its own
// (ShapePart.zMm / heightMm, Stage 2). The part indices are surfaceLayers' indices (lib/catalog/
// textures.ts) — base 0, then each part — which is how ItemSurface already finds a shape's texture.
//
// PURE. Run: npm run check:element-parity (./parity.ts holds this adapter to every row's plan).
import { FRONT_THICK_MM, type MapShape, type PartBody, type Product, type RevolvePoint, type ShapePart } from "@/lib/catalog/types";
import { resizeSpecOf, catalogBox, frontFace, rowShapeDims } from "@/lib/studio/footprint";
import { hasSurface, type Surface } from "@/lib/catalog/textures";
import { frontReplacesPicture } from "@/lib/catalog/symbols";
import { sizeParams, type ElementDefinition, type ElementPart, type ElementSize, type PartOp, type Profile } from "./types";

const EXTRUDE = { kind: "extrude" } as const;
const NONE = { kind: "none" } as const;

/** How a shape is stood up: not at all when it is an outline only; turned from its side profile when
 *  it is a round one that carries one (and is not a band); else extruded. */
function opOf(shape: MapShape, revolve: RevolvePoint[] | undefined, hollow: unknown, body: PartBody | undefined): PartOp {
  if (body === "none") return NONE;
  return revolve && revolve.length >= 2 && !hollow && (shape === "circle" || shape === "ellipse") ? { kind: "revolve", profile: revolve } : EXTRUDE;
}

/** Drop the keys that are undefined, so a profile is the record it means and nothing else. */
function defined<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

function surfaceOf(s: Surface): Surface | undefined {
  return hasSurface(s) ? defined({ texture: s.texture, textureImage: s.textureImage }) : undefined;
}

/** An added shape (ShapePart) as a part: its profile, its place, its own z and height when it has
 *  them, else the floor and the item's height. */
/** A front shape's op: its face pushed back by its thickness, bent, turned in its face. */
const panelOf = (s: { thicknessMm?: number; bendDeg?: number; faceTurnDeg?: number }): PartOp => ({
  kind: "panel",
  thicknessMm: s.thicknessMm ?? FRONT_THICK_MM,
  bendDeg: s.bendDeg ?? 0,
  faceTurnDeg: s.faceTurnDeg ?? 0,
});

export function partOf(p: ShapePart, itemHeightMm: number): ElementPart {
  const profile: Profile = defined({
    shape: p.shape,
    widthMm: p.widthMm,
    depthMm: p.depthMm,
    diameterMm: p.diameterMm,
    outline: p.outline,
    edgeCurves: p.edgeCurves,
    open: p.open,
    arc: p.arc,
    ring: p.ring,
    hollow: p.hollow,
  });
  const surface = surfaceOf(p);
  const front = p.plane === "front";
  const op = front ? panelOf(p) : opOf(p.shape, p.revolve, p.hollow, p.body);
  const own = p.zMm !== undefined || p.heightMm !== undefined || op.kind !== "extrude" ? true : undefined;
  return defined({
    id: p.id,
    profile,
    x: p.x || 0,
    y: p.y || 0,
    rotation: p.rotation || 0,
    pin: p.pin,
    repeat: p.repeat,
    zMm: p.zMm ?? 0,
    // A front shape rises as far as its face is tall; its own heightMm is not read.
    heightMm: front ? frontFace(p.shape, p).h : (p.heightMm ?? itemHeightMm),
    own,
    op,
    surface,
    colour: p.style?.fill,
    material: p.material,
  });
}

/** The row as a definition. The base shape is `shapeOfProduct`'s (the appearance's shape, else a
 *  circle for a row with a diameter, else a rectangle) with the row's own dimensions; the parts
 *  follow in order. */
export function definitionOf(product: Product): ElementDefinition {
  const a = product.appearance;
  const d = product.dimensions;
  const heightMm = d.heightMm ?? 0;
  // The base as the engine reads it — a front base's face (its depth the row's height) and thickness.
  const { shape, dims } = rowShapeDims(product);
  const front = dims.plane === "front";
  const profile: Profile = defined({
    shape,
    widthMm: dims.widthMm,
    depthMm: dims.depthMm,
    diameterMm: dims.diameterMm,
    outline: a?.outline,
    edgeCurves: a?.edgeCurves,
    open: a?.open,
    arc: a?.arc,
    ring: a?.ring,
    hollow: a?.hollow,
  });
  const base: ElementPart = defined({
    id: "base",
    profile,
    x: 0,
    y: 0,
    rotation: 0,
    zMm: 0,
    heightMm,
    own: front ? true : undefined,
    // An arch, a gate, a chuppah drawn from the front: a plan base is its outline only (symbols.ts).
    op: front ? panelOf(dims) : frontReplacesPicture(product) ? NONE : opOf(shape, a?.revolve, a?.hollow, a?.body),
    surface: a ? surfaceOf(a) : undefined,
    colour: a?.baseStyle?.fill,
    material: a?.baseMaterial,
  });
  const box = catalogBox(product);
  return {
    id: product.id,
    version: 0,
    name: product.name,
    params: sizeParams(box.widthMm, box.depthMm, heightMm),
    parts: [base, ...(a?.parts ?? []).map((p) => partOf(p, heightMm))],
    origin: "row",
  };
}

/** Whether the row's shapes say anything about their own bodies — a part at its own z or height, a
 *  round shape with a profile. A row that does is BUILT BY THE ELEMENT MODEL in the room, whatever
 *  its category's recipe would have made of it (a vase whose designer drew its profile is that
 *  profile, not the category's guess from its name); a row that does not is drawn as it always was. */
export function hasOwnBody(product: Product): boolean {
  const a = product.appearance;
  if (!a) return false;
  if ((a.revolve && a.revolve.length >= 2) || a.body === "none" || a.plane === "front") return true;
  return (a.parts ?? []).some((p) => p.zMm !== undefined || p.heightMm !== undefined || (p.revolve?.length ?? 0) >= 2 || p.body === "none" || p.plane === "front");
}

/** The FIRST shape's side profile, when the element model turns it (a round base with a `revolve` —
 *  never a band or a slice): what a category's recipe reads as its own outline (lib/catalog/
 *  body-profiles.ts — a lamp's shade, a tree's crown, a vessel's form). Undefined = none. */
export function baseProfileOf(product: Product | undefined): RevolvePoint[] | undefined {
  if (!product?.appearance?.revolve || product.appearance.revolve.length < 2) return undefined;
  const op = definitionOf(product).parts[0]?.op;
  return op?.kind === "revolve" ? op.profile : undefined;
}

/** The size the element is drawn at: a placement's stretched size when the row may be stretched
 *  (Product.resize / its category's default), else none — the catalog's own, exactly as
 *  sizedFootprint reads it. */
export function elementSizeOf(product: Product, sizeMm?: { widthMm: number; depthMm: number }): ElementSize | undefined {
  return sizeMm && resizeSpecOf(product) ? { widthMm: sizeMm.widthMm, depthMm: sizeMm.depthMm } : undefined;
}
