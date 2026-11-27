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
