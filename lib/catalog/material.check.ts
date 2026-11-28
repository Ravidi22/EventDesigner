// npm run check:material — the self-check of ./material.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { MapAppearance } from "./types";
import { MATERIAL_LABEL, MATERIAL_TONE, materialOf, MATERIALS, withShadeMaterial } from "./material";

// Self-check. Run: npm run check:material
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
