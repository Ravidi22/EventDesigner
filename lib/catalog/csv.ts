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
import { PRICE_UNIT_LABEL, STOCK_KIND_LABEL, type Product } from "./types";
import { isMain } from "../self-check";

const COLS: Record<string, string> = {
  "שם": "name", name: "name",
  "קטגוריה": "category", category: "category",
  "קוטר": "diameter", diameter: "diameter",
  "רוחב": "width", width: "width",
  "עומק": "depth", depth: "depth",
  "גובה": "height", height: "height",
  "מחיר": "price", price: "price",
};

export interface CsvCategory {
  id: string;
  label: string;
  defaultLayer: Layer;
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
  const rows = splitCsvRows(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => COLS[h.trim().toLowerCase()] ?? "");
  const byLabel = new Map(categories.map((c) => [c.label, c]));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: Product[] = [];
  for (const cells of rows.slice(1)) {
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      if (key) row[key] = (cells[i] ?? "").trim();
    });
    if (!row.name) continue;
    const cat = byLabel.get(row.category) ?? byId.get(row.category) ?? categories[0];
    const num = (v?: string) => (v && !isNaN(parseFloat(v)) ? Math.round(parseFloat(v) * 10) : undefined);
    out.push({
      id: makeId(),
      name: row.name,
      category: cat.id,
      layer: cat.defaultLayer,
      dimensions: { diameterMm: num(row.diameter), widthMm: num(row.width), depthMm: num(row.depth), heightMm: num(row.height) ?? 0 },
      categoryFields: {},
      unitPrice: row.price && !isNaN(parseFloat(row.price)) ? parseFloat(row.price) : undefined,
      styleTags: [],
      variants: [],
    });
  }
  return out;
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
  const english = parseCsvProducts("name,category,height,price\nRunner,tablecloths,2,22\n", cats, id);
  assert(english[0].category === "tablecloths" && english[0].unitPrice === 22, "english header + category id");

  // ── the quoted forms the naive split used to break on ────────────────────────────────────────
  const tricky = parseCsvProducts('שם,מפרט\n"רהיט ""מיוחד""","שתי\nשורות"\n', cats, id);
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
  assert(out[1][2] === "בבעלות" && out[2][2] === "בהשכרה", "stock kind, including the absent default");
  assert(out[2][12] === "טקסטיל בע״מ", "the supplier id resolves to a name");
  assert(out[2][13] === "גליל" && out[2][14] === "1", "an order unit with no factor is one for one");
  assert(out[1][13] === "" && out[1][14] === "", "no order unit, no factor");
  assert(splitCsvRows(productsToCsv([product({ priceUnit: "m2" })], cats))[1][9] === 'למ"ר', "a quote inside a cell survives");

  // The round trip the shared column names exist for.
  const back = parseCsvProducts(CSV_BOM + sheet, cats, id);
  assert(back.length === 2, "an exported sheet imports back, BOM and all");
  assert(back[0].name === "כיסא, מתקפל", "…keeping the quoted name whole");
  assert(back[0].dimensions.widthMm === 450 && back[0].unitPrice === 30, "…with its measurements and price");
  assert(back[1].category === "tablecloths", "…and its category, matched by label");
  assert(inventoryFileName(new Date("2026-08-30T09:00:00Z")) === "eve-inventory-2026-08-30.csv", "dated filename");

  console.log("catalog/csv self-check passed");
}
