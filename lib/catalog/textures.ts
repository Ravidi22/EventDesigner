// What a catalog item is MADE OF, as the plan draws it — the venue's floor textures
// (components/surface-fill.tsx, the grass, paving, timber deck and tiles a hall is laid in) offered to
// the catalog too, plus the two materials furniture is made of and floors are not: planked wood and
// marble. A stage of timber decks, a farm table, a marble bar top, a lawn rug read as what they are.
//
// A texture is the FILL of an item's footprint, so it applies to the items drawn as their outline
// (tables, stages, bars, rugs, decks, "other") — a category drawn as its own picture (a chair, a
// candelabrum: lib/catalog/symbols.ts) is its picture, and ignores it. The colour stays the
// designer's: a shade's swatch, or the row's own fill, tints the material; absent, the material's own.
import { SURFACE_MATERIALS, SURFACE_MATERIAL_LABEL, type SurfaceMaterial } from "@/lib/venues/structure";

/** The floor materials, plus wood and marble — which are the catalog's and are NOT offered to a
 *  venue's surface (nobody lays a hall in marble slabs this size; the list there stays as it was). */
export type Texture = SurfaceMaterial | "wood" | "marble";

export const TEXTURES: Texture[] = ["wood", "marble", ...SURFACE_MATERIALS.filter((m) => m !== "plain")];

export const TEXTURE_LABEL: Record<Texture, string> = {
  ...SURFACE_MATERIAL_LABEL,
  wood: "עץ",
  marble: "שיש",
};

export function isTexture(v: unknown): v is Texture {
  return typeof v === "string" && (TEXTURES as string[]).includes(v);
}

/** The designer's OWN texture: a picture — a fabric swatch, a printed dance floor, a logo — laid over
 *  the shape instead of one of the materials above. `tile` repeats it at `tileMm` across (its real
 *  size, like a slab or a board: a 50cm damask repeat is 50cm at every zoom); `stretch` spreads one
 *  copy over the whole shape, which is what a printed floor or a branded bar front is. */
export interface TextureImage {
  url: string;
  fit: "tile" | "stretch";
  /** How wide one repeat is on the floor, iff `fit === "tile"`. Absent = TEXTURE_TILE_MM. */
  tileMm?: number;
}

export const TEXTURE_TILE_MM = 1000;
export const TEXTURE_TILE_RANGE = { min: 50, max: 20000 } as const;

/** What one shape of an item is surfaced in — a material, or a picture of the designer's own (which
 *  wins when both are set). Both absent = the flat fill. */
export interface Surface {
  texture?: Texture;
  textureImage?: TextureImage;
}

export function hasSurface(s: Surface | undefined): boolean {
  return !!(s?.textureImage?.url || s?.texture);
}

/** Each shape's surface, in the order the item's footprint draws its shapes: the base shape first
 *  (MapAppearance.texture / textureImage), then every added part (ShapePart's own), so a bar can be a
 *  marble counter with a timber end — one layer each, none of them inheriting another's. */
export function surfaceLayers(
  a: (Surface & { parts?: readonly Surface[] }) | undefined,
): Surface[] {
  if (!a) return [];
  return [{ texture: a.texture, textureImage: a.textureImage }, ...(a.parts ?? []).map((p) => ({ texture: p.texture, textureImage: p.textureImage }))];
}

/** Whether any shape of the item is surfaced at all. */
export function anySurface(a: (Surface & { parts?: readonly Surface[] }) | undefined): boolean {
  return surfaceLayers(a).some(hasSurface);
}
