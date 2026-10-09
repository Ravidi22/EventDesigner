// Resolve a placement's variantId back to its catalog product/variant, and derive the
// footprint used by the geometry check. Placements reference variants (F-4.2); a product
// with no variants places an implicit default keyed by the product id.
// The index includes ARCHIVED products/variants on purpose (F-4.5) — a design document
// must always resolve, even when the item is hidden from the catalog.
import type { Product, Variant } from "@/lib/catalog/types";
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { loadProducts, catalogVersion } from "@/lib/catalog/storage";
import { CATEGORY_BY_ID, type Anchor, type Sizing } from "@/lib/catalog/categories";
import { variantPrice } from "@/lib/catalog/format";
import { tableAreaMm2 } from "./geometry";
import { deckTypeOf, type DeckLookup } from "@/lib/design-document/stage";

export interface Resolved {
  product: Product;
  variant?: Variant;
  label: string;
  category: string;
  price?: number;
  footprintMm2: number; // 0 for items that don't consume table area (e.g. tablecloths)
  /** How this item behaves on the plan — lifted off its category so the canvas can ask one
   *  question of one object instead of walking product → category itself at every node. */
  anchor: Anchor;
  sizing: Sizing;
  /** The shade's actual colour, when the designer gave it one (F-4.2). */
  swatch?: string;
  /** WHAT KIND OF SOLID THING this is, for the studio's no-overlap rule (lib/studio/collide.ts) —
   *  or undefined for anything that rule must not touch. Lifted off the category for the same
   *  reason `anchor` and `sizing` are: the canvas asks one question of one object. */
  solid?: string;
}

/** The two categories whose key has to match a venue FeatureKind, so that the house staging and a
 *  hired deck are the same kind of thing as far as the floor is concerned. Every other category is
 *  its own key, under its own name. */
const SOLID_BY_CATEGORY: Record<string, string> = { stages: "stage", "stage-decks": "stage", bars: "bar" };

/**
 * Which things cannot share the same floor as this one.
 *
 * Three exemptions, and each is a real arrangement the plan has to keep being able to draw: a RUG
 * is laid under things (sizing "stretch"), anything anchored to a table or hanging from the ceiling
 * is not standing on the floor at all, and a drape belongs to a wall. Everything else that stands
 * on the floor is solid against others OF ITS OWN KIND — deck against deck, bar against bar — and
 * free to overlap anything else, which is what keeps a חופה on a stage and a plinth beside a table
 * possible. See lib/studio/collide.ts for why the rule is same-kind-only.
 */
export function solidKind(product: Product): string | undefined {
  const cat = CATEGORY_BY_ID[product.category];
  if (product.layer !== "floor") return undefined;
  if ((cat?.anchor ?? "free") !== "free" || cat?.sizing === "stretch") return undefined;
  return SOLID_BY_CATEGORY[product.category] ?? product.category;
}

/** A stage's decks, as the fill sees them, out of the primed catalog (lib/design-document/stage.ts). */
export const deckOf: DeckLookup = (variantId) => {
  const r = resolve(variantId);
  return r ? deckTypeOf(variantId, r.product) : undefined;
};

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
    const cat = CATEGORY_BY_ID[product.category];
    const base = {
      product,
      category: product.category,
      footprintMm2: footprint(product),
      anchor: cat?.anchor ?? ("free" as Anchor),
      sizing: cat?.sizing ?? ("fixed" as Sizing),
      solid: solidKind(product),
    };
    index.set(product.id, { ...base, label: product.name, price: product.unitPrice });
    for (const variant of product.variants) {
      index.set(variant.id, {
        ...base,
        variant,
        label: `${product.name} · ${variant.name}`,
        price: variantPrice(product, variant),
        swatch: variant.swatch,
      });
    }
  }
  builtVersion = catalogVersion;
  return index;
}

export function resolve(variantId: string): Resolved | undefined {
  return ensureIndex().get(variantId);
}

/** The cover a table is wearing — one per table by definition, since a cover IS the table's
 *  surface (CategoryDef.anchor === "table"). */
export function coverOn(doc: DesignDocumentContent, tableId: string): Placement | undefined {
  return doc.placements.find(
    (p) => p.layer === "table" && p.tableId === tableId && resolve(p.variantId)?.anchor === "table",
  );
}

/** Every shade of the product this variant belongs to — what a colour picker offers, and what a
 *  bulk re-colour has to replace on the tables it reaches. */
export function shadesOf(variantId: string): { id: string; name: string; swatch?: string }[] {
  const product = resolve(variantId)?.product;
  if (!product) return [];
  return product.variants.filter((v) => !v.archived).map((v) => ({ id: v.id, name: v.name, swatch: v.swatch }));
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
