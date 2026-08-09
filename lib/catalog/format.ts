import type { Dimensions, PriceUnit, Product, Variant } from "./types";
import { isMain } from "../self-check";

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

// How much of a thing, in its own unit: countable items keep the "×3" the quote and packing list
// have always shown, while the ones cut to fit read as the measurement they are.
export function formatAmount(quantity: number, unit: PriceUnit = "unit"): string {
  if (unit === "m") return `${quantity.toFixed(1)} מ׳`;
  if (unit === "m2") return `${quantity.toFixed(1)} מ״ר`;
  return `×${quantity}`;
}

/** A price with what it is per — "₪180 למטר". */
export function formatUnitPrice(n: number | undefined, unit: PriceUnit = "unit"): string {
  const price = formatPrice(n);
  return n == null || unit === "unit" ? price : `${price} ${unit === "m" ? "למטר" : 'למ"ר'}`;
}

// A variant inherits the product price when it has none of its own (F-2.4).
export function variantPrice(product: Product, variant: Variant): number | undefined {
  return variant.unitPrice ?? product.unitPrice;
}

if (isMain(import.meta.url)) {
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
}
