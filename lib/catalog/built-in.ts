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
import { isMain } from "../self-check";

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

/** May "שכפול" copy this row? Never a built-in, and never a row in a built-in-only category — a copy
 *  would be a second row of a category the studio cannot otherwise make (a supplier can). */
export function canDuplicate(p: Pick<Product, "category" | "builtIn">, isSupplier = false): boolean {
  return !p.builtIn && (isSupplier || !isBuiltInCategory(p.category));
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

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error("FAIL: " + what);
    console.log(`  ok   ${what}`);
  };
  const studio = creatableCategories(CATEGORIES, false).map((c) => c.id);
  assert(!studio.includes("led-strips") && !studio.includes("stage-skirts") && !studio.includes("sails"), "a studio makes no row in a built-in-only category");
  assert(studio.includes("rugs") && studio.includes("curtains") && studio.includes("tables"), "…but rugs and curtains stay creatable, beside their built-in");
  assert(creatableCategories(CATEGORIES, true).length === CATEGORIES.length, "a supplier makes rows of every category");

  // A backdrop (קירות רקע, Backdrops S2): a studio makes as many as it stocks — drawn from the
  // front — while the stage's own backdrop edge row stays the built-in it was.
  const fresh = offeredCategories(CATEGORIES, { isSupplier: false, product: { id: "", category: "backdrops" } }).map((c) => c.id);
  assert(fresh.includes("backdrops"), "a studio's new row may be a backdrop");
  assert(!isBuiltInCategory("backdrops") && CATEGORY_BY_ID.backdrops?.front === true, "…an ordinary category, its first shape a front panel");
  assert(isBuiltInCategory("stage-backdrops") && !fresh.includes("stage-backdrops"), "…the stage's backdrop edge stays built-in");

  // A supplier's categories (the cut stems): never a studio's to file in, see or browse by.
  assert(isSupplierCategory("flowers") && isSupplierCategory("greenery") && isSupplierCategory("dried-flowers"), "the three stem categories are a supplier's");
  assert(!isSupplierCategory("flower-arrangements") && !isSupplierCategory("centerpieces"), "…an arrangement and a centrepiece are the studio's");
  assert(!studio.includes("flowers") && !studio.includes("greenery") && !studio.includes("dried-flowers"), "a studio makes no stem row");
  assert(studio.includes("flower-arrangements"), "…but files its arrangements as ever");
  // Flowers are a department of their own, shown to a studio, apart from the supplier's stems.
  const floral = CATEGORIES.find((c) => c.id === "flower-arrangements")!;
  assert(floral.group === "grp-florals" && floral.places === true && floral.label !== CATEGORIES.find((c) => c.id === "flowers")!.label, "פרחים: its own department, a place per row, a name the stems do not share");
  assert(shownGroups([{ id: "grp-florals" }, { id: "grp-flowers" }] as const, false, []).map((g) => g.id).join() === "grp-florals", "…and the studio sees it, not the stems'");
  const groups = [{ id: "grp-flowers" }, { id: "grp-table-design" }] as const;
  assert(JSON.stringify(shownGroups(groups, false, []).map((g) => g.id)) === '["grp-table-design"]', "a studio with no stem rows is not shown the stems department");
  assert(shownGroups(groups, false, [{ category: "dried-flowers" }]).length === 2, "…a studio holding a copy from before still finds it");
  assert(shownGroups(groups, true, []).length === 2, "…a supplier sees every department");
  const fine = shownCategories(CATEGORIES, false, []).map((c) => c.id);
  assert(!fine.includes("flowers") && fine.includes("flower-arrangements") && fine.includes("tables"), "the fine list hides the stems and keeps the rest");
  assert(shownCategories(CATEGORIES, false, [{ category: "flowers" }]).some((c) => c.id === "flowers"), "…unless a row is filed there");
  assert(!offeredCategories(CATEGORIES, { isSupplier: false, product: { id: "", category: "flowers" } }).some((c) => c.id === "flowers"), "the drawer offers a NEW row no stem category");
  assert(offeredCategories(CATEGORIES, { isSupplier: false, product: { id: "old", category: "flowers" } }).some((c) => c.id === "flowers"), "…an old copy keeps its own");

  const ledCopy = { id: "x", category: "led-strips" };
  assert(offeredCategories(CATEGORIES, { isSupplier: false, product: ledCopy }).some((c) => c.id === "led-strips"), "an existing row in a built-in category keeps its own category");
  assert(!offeredCategories(CATEGORIES, { isSupplier: false, product: { id: "", category: "led-strips" } }).some((c) => c.id === "led-strips"), "a NEW row is not offered it");
  const strip = { id: "y", category: "led-strips", builtIn: "builtin-led-strip" };
  assert(JSON.stringify(offeredCategories(CATEGORIES, { isSupplier: false, product: strip }).map((c) => c.id)) === '["led-strips"]', "a built-in is offered its own category only");
  const rug = { id: "z", category: "rugs", builtIn: "builtin-rug" };
  assert(JSON.stringify(offeredCategories(CATEGORIES, { isSupplier: false, product: rug }).map((c) => c.id)) === '["rugs"]', "…a built-in rug too");

  assert(!canDuplicate(strip) && !canDuplicate(rug), "a built-in is never duplicated");
  assert(!canDuplicate({ category: "led-strips" }), "nor a hand row in a built-in-only category");
  assert(canDuplicate({ category: "led-strips" }, true), "…unless a supplier holds it");
  assert(canDuplicate({ category: "rugs" }), "an owned rug is duplicated as ever");
  assert(!canDelete(strip) && canDelete({}), "a built-in is never deleted; an ordinary row is");

  const rows = [
    { id: "a", category: "sails", builtIn: "builtin-sail" },
    { id: "b", category: "stage-skirts", builtIn: "stage-skirt" },
    { id: "c", category: "rugs", builtIn: "builtin-rug" },
    { id: "d", category: "rugs" },
    { id: "e", category: "dance-floors", builtIn: "builtin-dance-floor" },
    { id: "f", category: "led-strips", builtIn: "builtin-led-strip", archived: true },
  ];
  const all = railBuiltIns(rows, () => true).map((p) => p.id);
  assert(JSON.stringify(all) === '["c","e","a"]', `the rail pins the placed-directly built-ins, in order, live only (${all})`);
  assert(railBuiltIns(rows, (p) => p.category !== "sails").every((p) => p.id !== "a"), "…in the rail's scope");
  assert(builtInRug(rows)?.id === "c" && builtInRug([rows[3]]) === undefined, "the built-in rug is found by its key, never by category");

  console.log("built-in self-check passed");
}
