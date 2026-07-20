// Wiring: adapt the catalog resolver + category registry into the injected lookups that
// the pure aggregations (aggregate.ts, quote.ts) consume. This is the only outputs file that
// touches the catalog graph.
import { resolve } from "@/lib/studio/catalog-resolver";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/catalog/categories";
import type { ItemLookup } from "./aggregate";
import type { QuoteLookup } from "./quote";

const catOrder = new Map(CATEGORIES.map((c, i) => [c.id, i]));

export const itemLookup: ItemLookup = (variantId) => {
  const r = resolve(variantId);
  if (!r) return undefined;
  const cat = CATEGORY_BY_ID[r.product.category];
  const armsField = cat?.fields.find((f) => f.key === "arms");
  const arms = r.product.categoryFields?.arms;
  return {
    productName: r.product.name,
    variantLabel: r.label,
    categoryId: r.product.category,
    categoryLabel: cat?.label ?? r.product.category,
    categoryOrder: catOrder.get(r.product.category) ?? 99,
    armsMultiplier:
      armsField && typeof arms === "number" && arms > 0
        ? { label: armsField.suffix ?? "נרות", count: arms }
        : undefined,
  };
};

export const productName = (variantId: string): string | undefined => resolve(variantId)?.product.name;

export const priceLookup: QuoteLookup = (variantId) => {
  const r = resolve(variantId);
  if (!r) return undefined;
  const cat = CATEGORY_BY_ID[r.product.category];
  return {
    label: r.label,
    categoryId: r.product.category,
    categoryLabel: cat?.label ?? r.product.category,
    categoryOrder: catOrder.get(r.product.category) ?? 99,
    unitPrice: r.price,
  };
};
