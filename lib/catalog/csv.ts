// F-4.4 CSV, both directions: a sheet of products comes IN, the studio's inventory goes OUT.
//
// The two share one set of column names, so a catalog exported here, edited in a spreadsheet and
// imported again lands the same fields in the same places — as NEW rows, since the import always
// mints ids. It adds products; it does not update them.
//
// Header row in Hebrew or English. Categories are injected so this stays import-free of the
// category registry (which pulls lucide-react) and node-runnable.
// Run: npm run check:csv
import type { Layer } from "../design-document/types";
import { PRICE_UNIT_LABEL, STOCK_KIND_LABEL, type PriceUnit, type Product, type StockKind } from "./types";
import { flowerSummary } from "./flowers";
import { productProblem } from "./product-values";
import { isMain } from "../self-check";

const COLS: Record<string, string> = {
  "שם": "name", name: "name",
  "קטגוריה": "category", category: "category",
  "קוטר": "diameter", diameter: "diameter",
  "רוחב": "width", width: "width",
  "עומק": "depth", depth: "depth",
  "גובה": "height", height: "height",
  "מחיר": "price", price: "price",
  // The rest of the export's own columns (HEADER below), so a sheet exported, edited and imported
  // again keeps what its prices and its stock MEAN (QA 2026-11-20, PR-5: a curtain at 80 למטר, rented,
  // came back 80 per item, owned, its cost gone). The derived ones (שווי מלאי) and the ones that name
  // other rows (ספק, גוונים, פרחים) are still typed in the drawer.
  "סוג מלאי": "stockKind", "stock kind": "stockKind",
  "כמות במלאי": "stockQty", "stock": "stockQty",
  "תמחור לפי": "priceUnit", "price unit": "priceUnit",
  "עלות": "cost", cost: "cost",
  "יחידת הזמנה": "orderUnit", "order unit": "orderUnit",
  "מקדם הזמנה": "orderFactor", "order factor": "orderFactor",
  "תגיות": "tags", tags: "tags",
  "מפרט": "spec", spec: "spec",
};

/** A header as the sheet wrote it, to the name COLS knows: "רוחב (ס״מ)" — the form the import's own
 *  notice suggests — is "רוחב" (QA PR-9: it was ignored, and every width with it). */
const headerKey = (h: string) =>
  h
    .replace(/[([][^)\]]*[)\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** A number as a spreadsheet writes it — "1,200", "₪1,500", " 45.5" — `undefined` for an empty cell,
 *  and `null` for a cell that holds something else ("12,5", "$40", "abc"). Never a guess (QA PR-9):
 *  parseFloat read "1,200" as 1 and "₪1,500" as nothing, and a misread number is worse than a line
 *  refused with its reason. */
export function csvNumber(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return undefined;
  const s = raw
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/₪|ש["״]ח|\bnis\b|\bils\b/gi, "")
    .replace(/[\s   ]/g, "");
  if (s === "") return undefined;
  const plain = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, "") : s;
  return /^-?(\d+\.?\d*|\.\d+)$/.test(plain) ? Number(plain) : null;
}

/** "תמחור לפי" as written — the export's label ('למ"ר', with either quote mark) or the key. */
function csvPriceUnit(raw: string): PriceUnit | null {
  const s = raw.replace(/["״׳']/g, "").replace(/\s+/g, "").toLowerCase();
  const byWord: Record<string, PriceUnit> = { ליחידה: "unit", יחידה: "unit", unit: "unit", למטר: "m", מטר: "m", m: "m", למר: "m2", מר: "m2", m2: "m2" };
  return byWord[s] ?? null;
}

/** "סוג מלאי" as written — the export's label or the key. */
function csvStockKind(raw: string): StockKind | null {
  const s = raw.trim();
  const hit = (Object.entries(STOCK_KIND_LABEL) as [StockKind, string][]).find(([k, label]) => label === s || k === s.toLowerCase());
  return hit ? hit[0] : null;
}

export interface CsvCategory {
  id: string;
  label: string;
  defaultLayer: Layer;
  /** What a NEW row of the category starts as (CategoryDef) — an imported line with no answer of its
   *  own gets the same seeds a row made in the drawer does (QA PR-5: an imported arrangement was
   *  "owned", so it never reached the florist's order). */
  defaultStock?: StockKind;
  defaultPriceUnit?: PriceUnit;
  defaultHeightMm?: number;
  /** A built-in-only category (CategoryDef.builtIn): a studio's import refuses rows in it. */
  builtIn?: true;
  /** A supplier's category (CategoryDef.supplierOnly — cut stems): a studio's import refuses rows in it. */
  supplierOnly?: true;
  /** Names the category went by before (CategoryDef.aliases): a sheet exported then still files there. */
  aliases?: readonly string[];
}

/** Split a CSV into rows of fields, per RFC 4180: a field may be quoted, and a quoted field may
 *  hold commas, newlines and doubled quotes. This used to be `text.split("\n")` then
 *  `line.split(",")`, under a note saying that would do until a real file needed better — the
 *  export below IS that file. A product name with a comma and a multi-line spec both survive now.
 *
 *  A leading byte-order mark is stripped here (see CSV_BOM), and blank rows are dropped, so the
 *  trailing newline every well-formed CSV ends with never reads as an empty product. */
export function splitCsvRows(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      // Two quotes inside a quoted field are one literal quote; a lone one closes the field.
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
      continue;
    }
    // A quote only opens a field at its start, so a stray one mid-word stays a character rather
    // than swallowing the rest of the file.
    if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function parseCsvProducts(text: string, categories: CsvCategory[], makeId: () => string): Product[] {
  return parseCsvImport(text, categories, makeId, { isSupplier: true }).products;
}

/** The import, with the rows it REFUSES named: a studio's built-in-only categories (an LED strip, a
 *  stage skirt — lib/catalog/built-in.ts) take no row by hand, and a supplier's categories (a cut
 *  stem) take none from a studio at all, so a line filed under one is left out with a sentence saying
 *  which line and why, rather than silently re-filed under another category. `isSupplier` lifts both:
 *  a supplier sells those things. Line numbers are the sheet's own (the header is line 1). */
export function parseCsvImport(
  text: string,
  categories: CsvCategory[],
  makeId: () => string,
  { isSupplier }: { isSupplier: boolean },
): { products: Product[]; refused: string[] } {
  const rows = splitCsvRows(text);
  const refused: string[] = [];
  if (rows.length < 2) return { products: [], refused };
  const header = rows[0].map((h) => COLS[headerKey(h)] ?? "");
  // An old name first, the live labels over it: a label in use today always wins over a retired one.
  const byLabel = new Map([...categories.flatMap((c) => (c.aliases ?? []).map((a) => [a, c] as const)), ...categories.map((c) => [c.label, c] as const)]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: Product[] = [];
  for (const [index, cells] of rows.slice(1).entries()) {
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      if (key) row[key] = (cells[i] ?? "").trim();
    });
    if (!row.name) continue;
    const refuse = (why: string) => refused.push(`שורה ${index + 2} (${row.name}): ${why}`);
    // A category the catalog does not know — a typo, an empty cell, a name it never had — refuses the
    // line (QA PR-4: it used to be filed under the first category, as a table, without a word).
    const cat = row.category ? (byLabel.get(row.category) ?? byId.get(row.category)) : undefined;
    if (!cat) {
      refuse(row.category ? `אין בקטלוג קטגוריה בשם "${row.category}".` : "חסרה קטגוריה.");
      continue;
    }
    if (!isSupplier && cat.builtIn) {
      refuse(`"${cat.label}" היא קטגוריה מובנית — יש בקטלוג פריט אחד כזה, ועורכים אותו שם.`);
      continue;
    }
    if (!isSupplier && cat.supplierOnly) {
      refuse(`"${cat.label}" היא קטגוריה של ספקים — פרחים נבחרים בשורות המפרט של סידור פרחים.`);
      continue;
    }
    // Every number read as written, or the line refused with the column and the cell (QA PR-9).
    let wrong = false;
    const read = (key: string, word: string): number | undefined => {
      const n = csvNumber(row[key]);
      if (n === null) {
        refuse(`ב"${word}" כתוב "${row[key]}" — זה לא מספר.`);
        wrong = true;
      } else if (n !== undefined && n < 0) {
        refuse(`"${word}" לא יכול להיות שלילי (${row[key]}).`);
        wrong = true;
      }
      return n ?? undefined;
    };
    const mm = (key: string, word: string) => {
      const cm = read(key, word);
      return cm === undefined ? undefined : Math.round(cm * 10);
    };
    const dimensions = { diameterMm: mm("diameter", "קוטר"), widthMm: mm("width", "רוחב"), depthMm: mm("depth", "עומק"), heightMm: mm("height", "גובה") ?? cat.defaultHeightMm ?? 0 };
    const unitPrice = read("price", "מחיר");
    const costPrice = read("cost", "עלות");
    const stockQty = read("stockQty", "כמות במלאי");
    const orderFactor = read("orderFactor", "מקדם הזמנה");
    if (wrong) continue;
    // What its prices and stock mean: the sheet's word, else what the category starts a new row as.
    const priceUnit = row.priceUnit ? csvPriceUnit(row.priceUnit) : (cat.defaultPriceUnit ?? "unit");
    if (!priceUnit) {
      refuse(`"תמחור לפי" — "${row.priceUnit}" אינו ${Object.values(PRICE_UNIT_LABEL).join(" / ")}.`);
      continue;
    }
    const stockKind = row.stockKind ? csvStockKind(row.stockKind) : (cat.defaultStock ?? "owned");
    if (!stockKind) {
      refuse(`"סוג מלאי" — "${row.stockKind}" אינו ${Object.values(STOCK_KIND_LABEL).join(" / ")}.`);
      continue;
    }
    const product: Product = {
      id: makeId(),
      name: row.name,
      category: cat.id,
      layer: cat.defaultLayer,
      dimensions,
      categoryFields: {},
      unitPrice,
      ...(priceUnit !== "unit" ? { priceUnit } : {}),
      ...(stockKind !== "owned" ? { stockKind } : {}),
      ...(stockQty !== undefined ? { stockQty } : {}),
      ...(costPrice !== undefined ? { costPrice } : {}),
      ...(row.orderUnit ? { orderUnit: row.orderUnit } : {}),
      ...(orderFactor ? { orderFactor } : {}),
      ...(row.spec ? { spec: row.spec } : {}),
      styleTags: row.tags ? [...new Set(row.tags.split("·").map((t) => t.trim()).filter(Boolean))] : [],
      variants: [],
    };
    // …and the values no row may be stored with, by the rule the server holds (a fractional count, a
    // size past a kilometre): refused here by line, where it would refuse the whole file there.
    const problem = productProblem(product);
    if (problem) {
      refuse(problem);
      continue;
    }
    out.push(product);
  }
  return { products: out, refused };
}

// ── Export ─────────────────────────────────────────────────────────────────────────────────────

/** Excel reads a UTF-8 file as the machine's codepage unless it opens with a byte-order mark —
 *  without this the Hebrew header arrives as mojibake in the program most likely to open it. It is
 *  written at the head of the download, and stripped again by splitCsvRows on the way back in. */
export const CSV_BOM = "\uFEFF";

/** Only what it takes to NAME a supplier — the export resolves `Product.supplierId` into a word a
 *  person recognises, and the rest of a SupplierSummary is none of this file's business. */
export interface CsvSupplier {
  id: string;
  name: string;
}

/** The inventory columns, in order. The seven the import also reads (שם, קטגוריה, the four
 *  measurements and מחיר) keep exactly the names COLS expects above — that is the round trip. */
const HEADER = [
  "שם",
  "קטגוריה",
  "סוג מלאי",
  "כמות במלאי",
  "קוטר",
  "רוחב",
  "עומק",
  "גובה",
  "מחיר",
  "תמחור לפי",
  "עלות",
  "שווי מלאי",
  "ספק",
  "יחידת הזמנה",
  "מקדם הזמנה",
  "גוונים",
  "תגיות",
  "פרחים",
  "מפרט",
];

/** RFC 4180 again, writing this time: quote a field holding a delimiter, a quote or a newline, and
 *  double the quotes inside it. Not theoretical — a spec is free multi-line text, and the label for
 *  a per-square-metre price has a quote character in the middle of it. */
function cell(value: string | number | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** mm → cm, the unit the import reads and the designer thinks in. Absent and zero both write an
 *  empty cell: an unmeasured item is not an item that measures nothing. */
function cmCell(mm: number | undefined): string {
  if (!mm) return "";
  const v = mm / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** One row per product, in the order given — the catalog hands over its filtered, on-screen list,
 *  so the file says what the screen said.
 *
 *  ⚠ Internal. עלות and שווי מלאי are what the STUDIO pays, the mirror of מחיר. This is a
 *  back-office sheet exported from the catalog; /present, the client portal, a quote and a packing
 *  list may never produce it (lib/suppliers/cost-boundary.ts). */
export function productsToCsv(
  products: Product[],
  categories: CsvCategory[],
  suppliers: CsvSupplier[] = [],
): string {
  const label = new Map(categories.map((c) => [c.id, c.label]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const rows = products.map((p) => {
    // Absent is a real answer for both of these — "I haven't counted it" and "I haven't priced it"
    // — and an empty cell says so, where a 0 would claim an empty shelf and a free item.
    const qty = p.stockQty;
    const cost = p.costPrice;
    return [
      p.name,
      label.get(p.category) ?? p.category,
      STOCK_KIND_LABEL[p.stockKind ?? "owned"],
      qty ?? "",
      cmCell(p.dimensions.diameterMm),
      cmCell(p.dimensions.widthMm),
      cmCell(p.dimensions.depthMm),
      cmCell(p.dimensions.heightMm),
      p.unitPrice ?? "",
      PRICE_UNIT_LABEL[p.priceUnit ?? "unit"],
      cost ?? "",
      qty != null && cost != null ? Math.round(qty * cost * 100) / 100 : "",
      p.supplierId ? supplierName.get(p.supplierId) ?? "" : "",
      p.orderUnit ?? "",
      // The factor only means anything beside an order unit, and absent there is one for one.
      p.orderUnit ? p.orderFactor ?? 1 : "",
      p.variants.filter((v) => !v.archived).map((v) => v.name).join(" · "),
      p.styleTags.join(" · "),
      // The flower spec as rows read: "ורד ×12 · פיאוני ×5". Export only — the import mints plain
      // products, and a spec is typed in the drawer where its rows multiply.
      flowerSummary(p.flowers),
      p.spec ?? "",
    ]
      .map(cell)
      .join(",");
  });

  // CRLF and a trailing newline: RFC 4180, and what Excel writes itself.
  return [HEADER.map(cell).join(","), ...rows, ""].join("\r\n");
}

/** ASCII on purpose — the download itself carries a Hebrew name fine, but the mail clients and file
 *  servers it passes through afterwards do not all agree on how. */
export function inventoryFileName(now = new Date()): string {
  return `eve-inventory-${now.toISOString().slice(0, 10)}.csv`;
}

if (isMain(import.meta.url)) {
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
}
