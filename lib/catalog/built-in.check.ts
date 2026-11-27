// npm run check:built-in — the self-check of ./built-in.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { CATEGORIES, CATEGORY_BY_ID } from "./categories";
import { builtInRug, canDelete, canDuplicate, creatableCategories, isBuiltInCategory, isSupplierCategory, offeredCategories, railBuiltIns, shownCategories, shownGroups } from "./built-in";

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
// QA PR-8: a studio's old stem row (a copy from before stems were the suppliers') was offered
// "שכפול", and the server refused the copy every time.
assert(!canDuplicate({ category: "flowers" }) && !canDuplicate({ category: "dried-flowers" }), "nor a studio's old stem row — a copy would be a new row in a supplier's category");
assert(canDuplicate({ category: "flowers" }, true), "…a supplier duplicates its stems");
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
