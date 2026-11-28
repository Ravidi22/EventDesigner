// The studio's BUILT-INS — the rules every screen asks of them (docs/superpowers/specs/
// 2026-11-07-built-in-kit-design.md).
//
// A built-in is an ordinary catalog row the app installed once (lib/catalog/standard/items.ts,
// `builtIn: true`): the studio's to rename, photograph, price and shade, but never deleted, never
// duplicated, and — where its category is built-in only (CategoryDef.builtIn) — never made again by
// hand, because the one row IS the category. Which row is one is `Product.builtIn`, DERIVED by the
// server from the row's id (lib/catalog/standard/built-ins.ts — the id is a hash, so it needs
// node:crypto). This file is the pure half, safe in the browser: it reads that field and the
// category registry, and decides what a form, a menu and the rail may offer.
//
// Run: npm run check:built-in
import { CATEGORIES, CATEGORY_BY_ID, type CategoryDef, type CategoryGroup, type CategoryGroupId } from "./categories";
import type { Product } from "./types";

/** The built-ins PLACED DIRECTLY (the spec's "Placed directly?" = yes), in the order the sketch's rail
 *  pins them. The others are counted off what they finish — a skirt, a barrier, a backdrop and a
 *  surface off a stage — and a pinned card for them would place nothing. (The rod is placed: a bare
 *  rod a curtain is then hung on — lib/studio/rail.ts.)
 *  The dance floor is listed by key so its row is pinned the day it is installed. */
export const RAIL_BUILT_INS: readonly string[] = [
  "builtin-rug",
  "builtin-dance-floor",
  "stage-stairs-100",
  "stage-ramp",
  "stage-bench",
  "builtin-curtain",
  "builtin-curtain-rod",
  "builtin-led-strip",
  "builtin-led-screen",
  "builtin-ceiling-drape",
  "builtin-sail",
  "builtin-pergola",
];

/** The built-in שטיח — what "שטיח מותאם…" lays over a surface or a stage, sized to it. */
export const BUILT_IN_RUG = "builtin-rug";

/** What the server answers a delete of a built-in with (lib/catalog/actions.ts removeProduct). */
export const BUILT_IN_DELETE_REFUSAL = "פריט מובנה לא נמחק — אפשר לשנות בו כל שדה: שם, תמונה, מחיר וגוונים.";

/** Is `id` a category whose one row is the studio's built-in (never offered for a new row)? */
export function isBuiltInCategory(id: string | undefined): boolean {
  return !!id && CATEGORY_BY_ID[id]?.builtIn === true;
}

/** Is `id` a category only a SUPPLIER files rows in (CategoryDef.supplierOnly — the cut stems a
 *  florist sells)? A studio's flowers are its arrangements; a stem reaches it as a spec line. */
export function isSupplierCategory(id: string | undefined): boolean {
  return !!id && CATEGORY_BY_ID[id]?.supplierOnly === true;
}

/** What a studio is told when it tries to file a stem (the marketplace's add, an import that skipped
 *  the form). */
export const SUPPLIER_CATEGORY_REFUSAL = "פרחים חתוכים לא נוספים לקטלוג כפריט — בוחרים אותם בשורות המפרט של סידור פרחים.";

/** The categories a NEW row may be filed under. A supplier sells LED strips and cut roses and makes
 *  rows of any category; a studio has its one built-in row in each built-in-only category instead,
 *  and no row at all in a supplier's. */
export function creatableCategories<C extends Pick<CategoryDef, "id" | "builtIn" | "supplierOnly">>(categories: readonly C[], isSupplier: boolean): C[] {
  return isSupplier ? [...categories] : categories.filter((c) => c.builtIn !== true && c.supplierOnly !== true);
}

/** The fine categories a catalog's filter lets its organisation narrow to: every one for a supplier;
 *  for a studio, a supplier's category is left out — unless a row of its own is filed there (a copy
 *  from before), which still has to be findable. */
export function shownCategories<C extends Pick<CategoryDef, "id" | "supplierOnly">>(
  categories: readonly C[],
  isSupplier: boolean,
  products: readonly Pick<Product, "category">[],
): C[] {
  if (isSupplier) return [...categories];
  const used = new Set(products.map((p) => p.category));
  return categories.filter((c) => c.supplierOnly !== true || used.has(c.id));
}

/** The departments a catalog's filter offers, by the same rule: a department made only of a
 *  supplier's categories (פרחי קטיף וירק) is not a studio's, unless one of its rows is. */
export function shownGroups<G extends Pick<CategoryGroup, "id">>(
  groups: readonly G[],
  isSupplier: boolean,
  products: readonly Pick<Product, "category">[],
): G[] {
  if (isSupplier) return [...groups];
  const shown = new Set(shownCategories(CATEGORIES, false, products).map((c) => c.group));
  return groups.filter((g) => shown.has(g.id as CategoryGroupId));
}

/** The categories the product drawer offers for `product`: what a new row may be, plus — for a row
 *  that already exists in a built-in-only category (a marketplace copy, a row from before the kit) —
 *  its own category, so it still opens and saves as it is. A built-in itself is offered only its
 *  own: re-filing the studio's one LED strip as a table would leave the kit without one. */
export function offeredCategories(
  categories: readonly CategoryDef[],
  { isSupplier, product }: { isSupplier: boolean; product?: Pick<Product, "id" | "category" | "builtIn"> | null },
): CategoryDef[] {
  const own = product?.id ? (categories.find((c) => c.id === product.category) ?? CATEGORY_BY_ID[product.category]) : undefined;
  if (product?.builtIn && own) return [own];
  const base = creatableCategories(categories, isSupplier);
  return own && !base.some((c) => c.id === own.id) ? [...base, own] : base;
}

/** What the server answers a NEW studio row in a built-in-only category with (lib/catalog/actions.ts
 *  saveProduct) — a request the forms never make. */
export const BUILT_IN_CATEGORY_REFUSAL = "בקטגוריה הזו יש פריט מובנה אחד — עורכים אותו, ולא מוסיפים עוד.";

/** May "שכפול" copy this row? Never a built-in, and never a row in a built-in-only category or a
 *  supplier's (a studio's old stem row) — a copy would be a new row of a category the studio cannot
 *  otherwise make, and the server refuses it (a supplier can). */
export function canDuplicate(p: Pick<Product, "category" | "builtIn">, isSupplier = false): boolean {
  return !p.builtIn && (isSupplier || (!isBuiltInCategory(p.category) && !isSupplierCategory(p.category)));
}

/** May the row be deleted (or, being placed, archived — which hides it from the rail and the
 *  catalog, the same loss to the studio)? Not a built-in. */
export function canDelete(p: Pick<Product, "builtIn">): boolean {
  return !p.builtIn;
}

/** The built-ins the sketch's rail pins at its top: placed directly, live, in the rail's scope, in
 *  RAIL_BUILT_INS order. */
export function railBuiltIns<P extends Pick<Product, "builtIn" | "archived" | "category">>(products: readonly P[], inScope: (p: P) => boolean): P[] {
  const rank = (p: P) => RAIL_BUILT_INS.indexOf(p.builtIn ?? "");
  return products.filter((p) => !p.archived && rank(p) >= 0 && inScope(p)).sort((a, b) => rank(a) - rank(b));
}

/** The studio's built-in rug, if it has one yet (an older studio before the backfill has none). */
export function builtInRug<P extends Pick<Product, "builtIn" | "archived">>(products: readonly P[]): P | undefined {
  return products.find((p) => p.builtIn === BUILT_IN_RUG && !p.archived);
}
