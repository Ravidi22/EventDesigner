// Resolve a placement's variantId back to its catalog product/variant, and derive the
// footprint used by the geometry check. Placements reference variants (F-4.2); a product
// with no variants places an implicit default keyed by the product id.
// The index includes ARCHIVED products/variants on purpose (F-4.5) — a design document
// must always resolve, even when the item is hidden from the catalog.
import type { Product, Variant } from "@/lib/catalog/types";
import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import { loadProducts, catalogVersion } from "@/lib/catalog/storage";
import { variantPrice } from "@/lib/catalog/format";
import { tableAreaMm2 } from "./geometry";

export interface Resolved {
  product: Product;
  variant?: Variant;
  label: string;
  category: string;
  price?: number;
  footprintMm2: number; // 0 for items that don't consume table area (e.g. tablecloths)
}

export function defaultVariantId(product: Product): string {
  return product.variants[0]?.id ?? product.id;
}

function footprint(product: Product): number {
  // Tablecloths cover the table rather than sit on it — they don't consume area (F-5.4).
  if (product.category === "tablecloths") return 0;
  const d = product.dimensions;
  if (d.diameterMm) return Math.PI * (d.diameterMm / 2) ** 2;
  if (d.widthMm && d.depthMm) return d.widthMm * d.depthMm;
  return 0;
}

// Rebuilt lazily whenever the catalog changes (storage bumps catalogVersion on write).
let index = new Map<string, Resolved>();
let builtVersion = -1;

function ensureIndex(): Map<string, Resolved> {
  if (builtVersion === catalogVersion && index.size > 0) return index;
  index = new Map();
  for (const product of loadProducts()) {
    const base = { product, category: product.category, footprintMm2: footprint(product) };
    index.set(product.id, { ...base, label: product.name, price: product.unitPrice });
    for (const variant of product.variants) {
      index.set(variant.id, {
        ...base,
        variant,
        label: `${product.name} · ${variant.name}`,
        price: variantPrice(product, variant),
      });
    }
  }
  builtVersion = catalogVersion;
  return index;
}

export function resolve(variantId: string): Resolved | undefined {
  return ensureIndex().get(variantId);
}

// Fraction of a table's area consumed by the items placed on it (F-5.4: table-area only —
// no passage checks in phase 1). >1 means overflow.
export function tableUtilization(doc: DesignDocumentContent, table: DesignTable): number {
  const area = tableAreaMm2(table);
  if (area === 0) return 0;
  let used = 0;
  for (const p of doc.placements) {
    if (p.layer !== "table" || p.tableId !== table.id) continue;
    used += (resolve(p.variantId)?.footprintMm2 ?? 0) * p.quantity;
  }
  return used / area;
}
