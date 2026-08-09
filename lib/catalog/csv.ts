// F-4.4 basic CSV import: name, category, dimensions (cm), price. Header row in Hebrew or
// English. Categories are injected so this stays import-free and node-runnable.
// ponytail: naive comma split — no quoted-comma support until a real file needs it.
// Run: node --experimental-strip-types lib/catalog/csv.ts
import type { Layer } from "../design-document/types";
import type { Product } from "./types";
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

export function parseCsvProducts(text: string, categories: CsvCategory[], makeId: () => string): Product[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => COLS[h.trim().toLowerCase()] ?? "");
  const byLabel = new Map(categories.map((c) => [c.label, c]));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: Product[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      if (key) row[key] = cells[i] ?? "";
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
  console.log("catalog/csv self-check passed");
}
