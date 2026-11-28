// npm run check:format — the self-check of ./format.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "./types";
import { formatAmount, formatDimensions, formatPrice, formatUnitPrice, variantPrice } from "./format";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
assert(formatDimensions({ diameterMm: 1800, heightMm: 750 }) === "⌀180 · ג׳ 75 ס״מ", "round + height");
assert(formatDimensions({ widthMm: 3200, depthMm: 3200, heightMm: 5 }) === "320×320 ס״מ", "box hides tiny height");
assert(formatDimensions({ widthMm: 420, depthMm: 450, heightMm: 920 }) === "42×45 · ג׳ 92 ס״מ", "box + height");
assert(formatPrice(undefined) === "—" && formatPrice(45).includes("45"), "price");
const p = { unitPrice: 45 } as Product;
assert(variantPrice(p, { id: "v", name: "x" }) === 45, "variant inherits");
assert(variantPrice(p, { id: "v", name: "x", unitPrice: 52 }) === 52, "variant overrides");
assert(formatAmount(3) === "×3", "countable items keep the multiplication sign");
assert(formatAmount(14, "m") === "14.0 מ׳", "metres read as metres");
assert(formatAmount(7.5, "m2") === "7.5 מ״ר", "square metres too");
assert(formatUnitPrice(180, "m") === "₪180 למטר", "a per-metre price says so");
assert(formatUnitPrice(45) === "₪45", "a plain price is unchanged");
console.log("format self-check passed");
