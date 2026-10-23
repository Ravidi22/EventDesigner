// What a body is made of, resolved the way the plan resolves colour: the placement's shade (its
// variant's swatch), else the row's own fill, else the kind's tone — canvas-stage.tsx:3924 `own`,
// the printed map's `productStyle`. A texture rides along only for an item drawn as its outline
// (a table, a stage, a bar, a rug — never a chair or a candlestick, which are their picture), the
// same rule lib/catalog/textures.ts states for the plan.
//
// The viewer draws a known texture PROCEDURALLY (a canvas pattern at the real repeat below), so
// there is no texture asset to ship or host; a designer's own picture (`image`) is fetched through
// the file route like every other photo. SURFACE_BASE is the plan's own tint table — imported, not
// copied, so a venue laid in "tile" is the same near-black in both.
import { SURFACE_BASE } from "@/components/surface-fill";
import type { Texture } from "@/lib/catalog/textures";
import type { Product } from "@/lib/catalog/types";
import type { Resolved } from "@/lib/studio/catalog-resolver";
import type { MaterialKind, MaterialRef } from "./types";

/** The real size of one repeat of each material, in mm — the plan's `LaidPattern` sizes
 *  (components/surface-fill.tsx): planks, slabs in a running bond, deck boards, large tiles. */
export const TEXTURE_REPEAT_MM: Record<Texture, { w: number; h: number }> = {
  wood: { w: 180, h: 1800 },
  marble: { w: 1200, h: 1200 },
  grass: { w: 2000, h: 2000 },
  paving: { w: 600, h: 400 },
  deck: { w: 150, h: 2400 },
  gravel: { w: 500, h: 500 },
  sand: { w: 500, h: 500 },
  soil: { w: 500, h: 500 },
  tile: { w: 1200, h: 1200 },
  plain: { w: 1000, h: 1000 },
  water: { w: 450, h: 450 },
};

/** Only a #rrggbb is a colour here (a swatch may hold anything the designer typed). */
export function hexOf(c: string | undefined): string | undefined {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : undefined;
}

/** A placed item's colour and, when asked, its texture. `surfaced` is for the outline-drawn kinds
 *  (tables, stages, bars, rugs, decks, "other"); a symbol kind passes nothing and gets its colour. */
export function swatchMaterial(
  resolved: Resolved | undefined,
  product: Product | undefined,
  fallback: string,
  kind: MaterialKind = "matte",
  surfaced = false,
): MaterialRef {
  const colour = hexOf(resolved?.swatch) ?? hexOf(product?.appearance?.style?.fill) ?? fallback;
  const ref: MaterialRef = { colour, kind };
  if (surfaced) {
    const a = product?.appearance;
    if (a?.textureImage?.url) ref.image = a.textureImage;
    else if (a?.texture) ref.texture = a.texture;
  }
  return ref;
}

/** A floor or ground in one of the venue's materials, tinted by the zone's/feature's own fill. */
export function surfaceMaterial(texture: Texture, tint?: string): MaterialRef {
  return { colour: hexOf(tint) ?? SURFACE_BASE[texture], kind: texture === "water" ? "water" : "matte", texture };
}

export const clothMaterial = (colour: string): MaterialRef => ({ colour, kind: "fabric" });
export const fabricMaterial = clothMaterial;
/** Clear glass: barely there, its edges and reflections doing the work (0.35 read as frosted). */
export const glassMaterial = (colour = "#e8f0f5"): MaterialRef => ({ colour, kind: "glass", opacity: 0.22 });
export const metalMaterial = (colour: string): MaterialRef => ({ colour, kind: "metal" });
export const glossMaterial = (colour: string): MaterialRef => ({ colour, kind: "gloss" });
export const foliageMaterial = (colour: string): MaterialRef => ({ colour, kind: "foliage" });
export const waterMaterial = (): MaterialRef => ({ colour: SURFACE_BASE.water, kind: "water", texture: "water", opacity: 0.8 });
export const emissiveMaterial = (colour: string): MaterialRef => ({ colour, kind: "emissive" });

/** The envelope's own tones: not the designer's to choose, so not tokens either. */
export const ENVELOPE = {
  wall: "#efece6",
  ceiling: "#f7f5f1",
  kerb: "#cfc9bd",
  doorFrame: "#d9d2c6",
  doorLeaf: "#b8a48a",
  ground: "#d9d3c7",
  trunk: "#8a6a4f",
  deckUnderside: "#5a5048",
  flame: "#f2b544",
  bulb: "#ffe9b8",
} as const;
