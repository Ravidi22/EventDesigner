// What a product is MADE of (bug round 2026-11-21 §4, Ravid: "define elements material — metal,
// glass, stone… it will define the look, for all products").
//
// A material is NOT a texture (DECIDE 8): a texture is a pattern laid on a surface (the plan, and the
// map in 3D); a material is what the thing is — the 3D surface it is built in. Choosing a material
// never writes a texture.
//
// Three levels, the most specific wins (DECIDE 3, 7):
//   - a SHAPE's (`ShapePart.material`, the first shape's `MapAppearance.baseMaterial`) — a candlestick
//     with a crystal stem and gold arms;
//   - a SHADE's (`MapAppearance.shadeMaterials[variantId]` — in the appearance JSON, not a column, so
//     no migration) — the same vase in clear glass and in gold;
//   - the PRODUCT's (`MapAppearance.material`).
// None of them = undefined, and every 3D recipe keeps the guess it always made (a pale vase as glass,
// a metal word in a shade's name…) — so no row changes until a material is chosen.
import type { MapAppearance } from "./types";
import { isMain } from "../self-check";

export type Material =
  | "metal"
  | "glass-clear"
  | "glass-frosted"
  | "glass-tinted"
  | "crystal"
  | "acrylic"
  | "stone"
  | "marble"
  | "concrete"
  | "wood"
  | "ceramic"
  | "velvet"
  | "rattan"
  | "mirror";

export const MATERIALS: Material[] = ["metal", "glass-clear", "glass-frosted", "glass-tinted", "crystal", "acrylic", "mirror", "stone", "marble", "concrete", "wood", "ceramic", "velvet", "rattan"];

export const MATERIAL_LABEL: Record<Material, string> = {
  metal: "מתכת",
  "glass-clear": "זכוכית שקופה",
  "glass-frosted": "זכוכית חלבית",
  "glass-tinted": "זכוכית צבעונית",
  crystal: "קריסטל",
  acrylic: "אקריליק",
  mirror: "מראה",
  stone: "אבן",
  marble: "שיש",
  concrete: "בטון",
  wood: "עץ",
  ceramic: "קרמיקה / חרס",
  velvet: "קטיפה / בד",
  rattan: "ראטן / קש",
};

/** A metal's finishes — colour presets offered beside "מתכת", not materials of their own: the colour
 *  still comes from the shade when it has one. */
export const METAL_FINISHES: { name: string; hex: string }[] = [
  { name: "זהב", hex: "#C9A24A" },
  { name: "כסף", hex: "#C0C4C8" },
  { name: "שחור", hex: "#2B2B2E" },
  { name: "רוז גולד", hex: "#C99A86" },
];

/** The colour a material is drawn in when nothing gives it one (no shade swatch, no fill). */
export const MATERIAL_TONE: Record<Material, string> = {
  metal: "#c0c4c8",
  "glass-clear": "#e8f0f5",
  "glass-frosted": "#eef2f4",
  "glass-tinted": "#9fb8c8",
  crystal: "#f4f8fc",
  acrylic: "#f2f6f8",
  mirror: "#dfe6ea",
  stone: "#cfc8bc",
  marble: "#eeebe6",
  concrete: "#b9b6b0",
  wood: "#a87b52",
  ceramic: "#e9e2d6",
  velvet: "#7a3b4a",
  rattan: "#c9a66b",
};

export const isMaterial = (v: unknown): v is Material => typeof v === "string" && (MATERIALS as string[]).includes(v);

/** The material of `variantId` (a shade, or the product's own id) and, when asked, of one SHAPE
 *  (0 = the first, the base; k = parts[k − 1]) — the most specific answer, else undefined (the
 *  recipe's own guess). */
export function materialOf(appearance: MapAppearance | undefined, variantId?: string, shapeIndex?: number): Material | undefined {
  if (!appearance) return undefined;
  if (shapeIndex !== undefined) {
    const own = shapeIndex === 0 ? appearance.baseMaterial : appearance.parts?.[shapeIndex - 1]?.material;
    if (isMaterial(own)) return own;
  }
  const shade = variantId ? appearance.shadeMaterials?.[variantId] : undefined;
  if (isMaterial(shade)) return shade;
  return isMaterial(appearance.material) ? appearance.material : undefined;
}

/** `shadeMaterials` with one shade's answer set (`null` = back to the product's). Empty = undefined. */
export function withShadeMaterial(map: MapAppearance["shadeMaterials"], variantId: string, material: Material | null): MapAppearance["shadeMaterials"] {
  const next = { ...(map ?? {}) };
  if (material) next[variantId] = material;
  else delete next[variantId];
  return Object.keys(next).length ? next : undefined;
}

// Self-check. Run: npm run check:material
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  assert(materialOf(undefined, "v1") === undefined && materialOf({ shape: "circle", content: "none" } as MapAppearance, "v1") === undefined, "no material anywhere = undefined: the recipe keeps its guess");
  const a = { shape: "circle", content: "none", material: "ceramic", shadeMaterials: { gold: "metal" }, baseMaterial: "crystal", parts: [{ material: "wood" }, {}] } as unknown as MapAppearance;
  assert(materialOf(a, "white") === "ceramic", "a shade with none of its own is the product's");
  assert(materialOf(a, "gold") === "metal", "a shade's own wins over the product's");
  assert(materialOf(a, "gold", 0) === "crystal", "the first shape's own wins over the shade's");
  assert(materialOf(a, "gold", 1) === "wood" && materialOf(a, "white", 2) === "ceramic", "a part's own wins; a part with none is the shade's or the product's");
  assert(materialOf({ ...a, material: "unobtainium" } as unknown as MapAppearance, "white") === undefined, "an unknown word is no material");
  assert(withShadeMaterial({ gold: "metal" }, "gold", null) === undefined && withShadeMaterial(undefined, "v", "wood")?.v === "wood", "a shade's answer set and cleared");
  assert(MATERIALS.every((m) => MATERIAL_LABEL[m] && MATERIAL_TONE[m]), "every material has a name and a tone");
  console.log("material self-check passed");
}
