import type { Dimensions, Product, Variant } from "./types";

const cm = (mm: number) => {
  const v = mm / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

// Human dimensions in cm. Round → diameter; otherwise width×depth. Height is shown only when
// it carries meaning (≥10cm) — a 5mm tablecloth "thickness" is noise, a chair height isn't.
// ponytail: 10cm threshold is a display heuristic, tune if a real short item needs its height.
export function formatDimensions(d: Dimensions): string {
  const parts: string[] = [];
  if (d.diameterMm) parts.push(`⌀${cm(d.diameterMm)}`);
  else if (d.widthMm && d.depthMm) parts.push(`${cm(d.widthMm)}×${cm(d.depthMm)}`);
  if (d.heightMm >= 100) parts.push(`ג׳ ${cm(d.heightMm)}`);
  return parts.length ? `${parts.join(" · ")} ס״מ` : "—";
}

export function formatPrice(n?: number): string {
  return n == null ? "—" : `₪${n.toLocaleString("he-IL")}`;
}

// A variant inherits the product price when it has none of its own (F-2.4).
export function variantPrice(product: Product, variant: Variant): number | undefined {
  return variant.unitPrice ?? product.unitPrice;
}

if ((import.meta as { main?: boolean }).main) {
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
  console.log("format self-check passed");
}
