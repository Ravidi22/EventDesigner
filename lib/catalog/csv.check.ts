// npm run check:csv — the self-check of ./csv.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { STOCK_KIND_LABEL, type Product } from "./types";
import { CSV_BOM, inventoryFileName, parseCsvImport, parseCsvProducts, productsToCsv, splitCsvRows, type CsvCategory } from "./csv";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const cats: CsvCategory[] = [
  { id: "chairs", label: "כיסאות", defaultLayer: "floor" },
  { id: "tablecloths", label: "מפות", defaultLayer: "table" },
];
let n = 0;
const id = () => `csv-${++n}`;
const rows = parseCsvProducts(
  "שם,קטגוריה,רוחב,עומק,גובה,מחיר\nכיסא במבוק,כיסאות,45,45,92,30\nמפה לבנה,מפות,320,320,1,\n,כיסאות,1,1,1,1\n",
  cats,
  id,
);
assert(rows.length === 2, "skips the nameless row");
assert(rows[0].category === "chairs" && rows[0].layer === "floor", "category by Hebrew label");
assert(rows[0].dimensions.widthMm === 450 && rows[0].dimensions.heightMm === 920, "cm → mm");
assert(rows[0].unitPrice === 30, "price parsed");
assert(rows[1].unitPrice === undefined, "empty price stays undefined, not 0");
// A category renamed since the sheet was exported is still found by the name it had — and a live
// label always wins over a retired one ("פרחים" was the stems', is the arrangements' now).
const renamed: CsvCategory[] = [
  { id: "flower-arrangements", label: "פרחים", defaultLayer: "table", aliases: ["סידורי פרחים"] },
  { id: "stems", label: "פרחי קטיף", defaultLayer: "table", aliases: ["פרחים"] },
];
const old = parseCsvProducts("שם,קטגוריה,גובה\nכיפת ורדים,סידורי פרחים,40\nקיר,פרחים,240\n", renamed, id);
assert(old[0].category === "flower-arrangements", "a category is found by a name it went by before");
assert(old[1].category === "flower-arrangements", "…and a label in use wins over another category's old name");
const english = parseCsvProducts("name,category,height,price\nRunner,tablecloths,2,22\n", cats, id);
assert(english[0].category === "tablecloths" && english[0].unitPrice === 22, "english header + category id");

// ── a studio's built-in-only categories (lib/catalog/built-in.ts) ─────────────────────────────
const withKit: CsvCategory[] = [
  ...cats,
  { id: "led-strips", label: "פסי לד", defaultLayer: "ceiling", builtIn: true },
  { id: "flowers", label: "פרחים", defaultLayer: "table", supplierOnly: true },
];
const kitSheet = "שם,קטגוריה\nפס לד חם,פסי לד\nכיסא,כיסאות\nורד אדום,פרחים\n";
const studio = parseCsvImport(kitSheet, withKit, id, { isSupplier: false });
assert(studio.products.length === 1 && studio.products[0].category === "chairs", "a studio's import leaves out the built-in category's row and the stem…");
assert(studio.refused.length === 2 && studio.refused[0].includes("שורה 2") && studio.refused[0].includes("פס לד חם"), "…and names the line and the item");
assert(studio.refused[1].includes("שורה 4") && studio.refused[1].includes("ורד אדום") && studio.refused[1].includes("ספקים"), "…the stem's line says the category is a supplier's");
const supplier = parseCsvImport(kitSheet, withKit, id, { isSupplier: true });
assert(supplier.products.length === 3 && supplier.refused.length === 0, "a supplier imports every row");

// ── the quoted forms the naive split used to break on ────────────────────────────────────────
const tricky = parseCsvProducts('שם,מפרט,קטגוריה\n"רהיט ""מיוחד""","שתי\nשורות",כיסאות\n', cats, id);
assert(tricky.length === 1, "a newline inside quotes is not a second product");
assert(tricky[0].name === 'רהיט "מיוחד"', "doubled quotes unescape to one");
assert(splitCsvRows('a,"b,c",d\n')[0].length === 3, "a quoted comma is not a delimiter");

// ── export ───────────────────────────────────────────────────────────────────────────────────
const product = (over: Partial<Product>): Product => ({
  id: "p",
  name: "פריט",
  category: "chairs",
  layer: "floor",
  dimensions: { heightMm: 750 },
  categoryFields: {},
  styleTags: [],
  variants: [],
  ...over,
});
const sheet = productsToCsv(
  [
    product({
      name: "כיסא, מתקפל",
      stockQty: 40,
      costPrice: 12.5,
      unitPrice: 30,
      dimensions: { widthMm: 450, depthMm: 450, heightMm: 920 },
    }),
    product({
      name: "וילון",
      category: "tablecloths",
      stockKind: "rented",
      supplierId: "s1",
      orderUnit: "גליל",
      dimensions: { heightMm: 0 },
    }),
  ],
  cats,
  [{ id: "s1", name: "טקסטיל בע״מ" }],
);
const out = splitCsvRows(sheet);
assert(out.length === 3, "a header and one row per product");
assert(out[0][0] === "שם" && out[0][3] === "כמות במלאי", "the header names the columns");
assert(sheet.includes('"כיסא, מתקפל"'), "a name with a comma is quoted");
assert(out[1][3] === "40" && out[1][11] === "500", "stock value is quantity × cost");
assert(out[2][3] === "" && out[2][11] === "", "an uncounted item writes empty, never 0");
assert(out[2][7] === "", "a zero height is no measurement, not a measurement of nought");
assert(out[1][2] === STOCK_KIND_LABEL.owned && out[2][2] === STOCK_KIND_LABEL.rented, "stock kind, including the absent default");
assert(out[2][12] === "טקסטיל בע״מ", "the supplier id resolves to a name");
assert(out[2][13] === "גליל" && out[2][14] === "1", "an order unit with no factor is one for one");
assert(out[1][13] === "" && out[1][14] === "", "no order unit, no factor");
assert(splitCsvRows(productsToCsv([product({ priceUnit: "m2" })], cats))[1][9] === 'למ"ר', "a quote inside a cell survives");
const specced = splitCsvRows(
  productsToCsv([product({ flowers: [{ id: "a", name: "ורד", qty: 12 }, { id: "b", name: "פיאוני", qty: 5 }] })], cats),
);
assert(specced[0][17] === "פרחים" && specced[1][17] === "ורד ×12 · פיאוני ×5", "the flower spec exports as rows read");
assert(out[1][17] === "", "no spec, empty cell");

// The round trip the shared column names exist for.
const back = parseCsvProducts(CSV_BOM + sheet, cats, id);
assert(back.length === 2, "an exported sheet imports back, BOM and all");
assert(back[0].name === "כיסא, מתקפל", "…keeping the quoted name whole");
assert(back[0].dimensions.widthMm === 450 && back[0].unitPrice === 30, "…with its measurements and price");
assert(back[1].category === "tablecloths", "…and its category, matched by label");
assert(inventoryFileName(new Date("2026-08-30T09:00:00Z")) === "eve-inventory-2026-08-30.csv", "dated filename");

// ── QA 2026-11-20 ──────────────────────────────────────────────────────────────────────────────
const full: CsvCategory[] = [
  { id: "tables", label: "שולחנות", defaultLayer: "floor", defaultHeightMm: 750 },
  { id: "chairs", label: "כיסאות", defaultLayer: "floor" },
  { id: "curtains", label: "ווילונות", defaultLayer: "ceiling" },
  { id: "flower-arrangements", label: "פרחים", defaultLayer: "table", defaultStock: "consumable" },
  { id: "drapes", label: "בדים", defaultLayer: "ceiling", defaultPriceUnit: "m" },
];
const studioImport = (text: string) => parseCsvImport(text, full, id, { isSupplier: false });

// PR-4: an unknown, misspelled or empty category is refused by line — never filed as the first one.
const typo = studioImport("שם,קטגוריה\nכיסא,כסאות\nמשהו,\nשטיח פרסי,שטיח\nכיסא טוב,כיסאות\n");
assert(typo.products.length === 1 && typo.products[0].category === "chairs", "only the line with a real category is imported");
assert(typo.refused.length === 3 && typo.refused[0].includes("שורה 2") && typo.refused[0].includes("כסאות"), "a misspelled category is refused by line and name");
assert(typo.refused[1].includes("שורה 3") && typo.refused[1].includes("חסרה קטגוריה"), "…an empty one too");

// PR-9: numbers as a spreadsheet writes them; headers with units.
const money = studioImport('שם,קטגוריה,רוחב (ס״מ),עומק (ס"מ),גובה (ס״מ),מחיר (₪)\nשולחן אבירים,שולחנות,"1,200",120,75,"₪1,500"\n');
assert(money.products.length === 1 && money.products[0].dimensions.widthMm === 12000, `"1,200" is 1200 cm, under a header with its unit (${money.products[0]?.dimensions.widthMm})`);
assert(money.products[0].unitPrice === 1500 && money.products[0].dimensions.heightMm === 750, `"₪1,500" is 1500`);
const bad = studioImport('שם,קטגוריה,רוחב,מחיר\nשולחן,שולחנות,-180,10\nשולחן ב,שולחנות,"12,5",10\nשולחן ג,שולחנות,180,$40\nשולחן ד,שולחנות,180,40\n');
assert(bad.products.length === 1 && bad.products[0].name === "שולחן ד", "a negative, an ambiguous or a foreign number refuses its line");
assert(bad.refused.length === 3 && bad.refused[0].includes("שלילי") && bad.refused[1].includes("12,5") && bad.refused[2].includes("$40"), "…each said");
const huge = studioImport("שם,קטגוריה,רוחב\nשולחן,שולחנות,99999999\n");
assert(huge.products.length === 0 && huge.refused[0]?.includes("הרוחב"), "a size the server would refuse is refused by line here");

// PR-5: export → import keeps what prices and stock mean, and a new line gets its category's defaults.
const curtain = product({ name: "וילון שיפון", category: "curtains", layer: "ceiling", priceUnit: "m", unitPrice: 80, stockKind: "rented", costPrice: 35, orderUnit: "מטר", orderFactor: 1.5, styleTags: ["קלאסי", "זוהר"], spec: "שיפון לבן" });
const chair = product({ name: "כיסא", stockQty: 40, costPrice: 12.5, unitPrice: 30 });
const again = studioImport(CSV_BOM + productsToCsv([curtain, chair], full)).products;
assert(again.length === 2 && again[0].priceUnit === "m" && again[0].unitPrice === 80, "a price per metre comes back per metre");
assert(again[0].stockKind === "rented" && again[0].costPrice === 35 && again[0].orderUnit === "מטר" && again[0].orderFactor === 1.5, "…rented, with its cost and order unit");
assert(again[0].styleTags.join() === "קלאסי,זוהר" && again[0].spec === "שיפון לבן", "…its tags and spec");
assert(again[1].stockQty === 40 && again[1].costPrice === 12.5 && again[1].stockKind === undefined && again[1].priceUnit === undefined, "an owned chair comes back counted, owned and per unit");
const seeded = studioImport("שם,קטגוריה\nכיפת ורדים,פרחים\nבד תקרה,בדים\n").products;
assert(seeded[0].stockKind === "consumable" && seeded[1].priceUnit === "m", "a line with no stock kind or price unit gets its category's");
const unknownUnit = studioImport("שם,קטגוריה,תמחור לפי\nכיסא,כיסאות,לשעה\n");
assert(unknownUnit.products.length === 0 && unknownUnit.refused[0].includes("לשעה"), "an unknown price unit refuses the line rather than meaning something else");

console.log("catalog/csv self-check passed");
