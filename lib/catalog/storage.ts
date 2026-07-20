// Catalog persistence (F-4.4–F-4.5). localStorage for now; the swap to a server action lives
// here and nowhere else (same seam as lib/events/storage.ts).
import type { DesignDocumentContent } from "../design-document/types";
import type { Product } from "./types";
import { SAMPLE_PRODUCTS } from "./sample-data";

const KEY = "idesign.catalog.products";

// Bumped on every write so the studio's resolver index knows to rebuild (no import cycle).
export let catalogVersion = 0;

export function loadProducts(): Product[] {
  if (typeof window === "undefined") return SAMPLE_PRODUCTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return SAMPLE_PRODUCTS;
    const saved = JSON.parse(raw) as Product[];
    return saved.length ? saved : SAMPLE_PRODUCTS;
  } catch {
    return SAMPLE_PRODUCTS;
  }
}

export function saveProducts(products: Product[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(products));
  } catch {
    // non-fatal
  }
  catalogVersion++;
}

export function upsertProduct(p: Product): Product[] {
  const existing = loadProducts();
  const next = existing.some((x) => x.id === p.id) ? existing.map((x) => (x.id === p.id ? p : x)) : [p, ...existing];
  saveProducts(next);
  return next;
}

export function productById(id: string): Product | undefined {
  return loadProducts().find((p) => p.id === id);
}

// Every variant id a placement could reference for this product (incl. the implicit
// product-id default used when a product has no variants).
function variantIdsOf(p: Product): string[] {
  return [p.id, ...p.variants.map((v) => v.id)];
}

// F-4.5: is any of these variant ids placed in ANY event's design document?
// Scans the per-event doc keys (B) — a design document must never point at nothing.
export function isPlacedAnywhere(variantIds: string[]): boolean {
  if (typeof window === "undefined") return false;
  const ids = new Set(variantIds);
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith("idesign.studio.doc.")) continue;
    try {
      const doc = JSON.parse(window.localStorage.getItem(key) ?? "") as DesignDocumentContent;
      if (doc.placements?.some((pl) => ids.has(pl.variantId))) return true;
    } catch {
      // unreadable doc — ignore
    }
  }
  return false;
}

// F-4.5: delete a product — or archive it (hidden from the catalog) when it's placed
// somewhere. Returns the action taken so the UI can say which happened.
export function deleteOrArchiveProduct(id: string): { products: Product[]; archived: boolean } {
  const existing = loadProducts();
  const p = existing.find((x) => x.id === id);
  if (!p) return { products: existing, archived: false };
  if (isPlacedAnywhere(variantIdsOf(p))) {
    const products = existing.map((x) => (x.id === id ? { ...x, archived: true } : x));
    saveProducts(products);
    return { products, archived: true };
  }
  const products = existing.filter((x) => x.id !== id);
  saveProducts(products);
  return { products, archived: false };
}
