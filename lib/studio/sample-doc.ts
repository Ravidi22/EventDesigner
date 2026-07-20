// Initial design document: the seed hall's tables, plus a few example placements so the
// studio opens alive rather than blank. Used only on first load (before localStorage exists).
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { SAMPLE_PRODUCTS } from "@/lib/catalog/sample-data";
import { defaultVariantId } from "./catalog-resolver";

const round = (id: string, number: number, x: number, y: number): DesignTable => ({
  id,
  type: "עגול",
  number,
  position: { x, y },
  rotation: 0,
  diameterMm: 1800,
  seats: 12,
});

const cols = [3000, 6500, 10000, 13500, 17000];
const rows = [5500, 9500];

const tables: DesignTable[] = [];
let n = 0;
for (const y of rows) for (const x of cols) tables.push(round(`t${++n}`, n, x, y));
// Head table (rectangular) near the top wall.
tables.push({
  id: "t-head",
  type: "מלבן",
  number: 0,
  position: { x: 10000, y: 2400 },
  rotation: 0,
  widthMm: 3000,
  depthMm: 1000,
  seats: 6,
});

const byName = (name: string) => SAMPLE_PRODUCTS.find((p) => p.name.includes(name))!;

function place(productName: string, opts: Partial<Placement> & { tableId?: string; x?: number; y?: number }): Placement {
  const product = byName(productName);
  return {
    id: crypto.randomUUID(),
    variantId: defaultVariantId(product),
    layer: product.layer,
    quantity: opts.quantity ?? 1,
    tableId: opts.tableId,
    position: { x: opts.x ?? 0, y: opts.y ?? 0 },
    rotation: 0,
    scale: 1,
  };
}

const placements: Placement[] = [
  place("מרכז שולחן", { tableId: "t1", quantity: 1 }),
  place("מרכז שולחן", { tableId: "t2", quantity: 1 }),
  place("שנדליר", { x: 10000, y: 7500, quantity: 1 }),
];

export function sampleDoc(): DesignDocumentContent {
  return { calibration: { mmPerUnit: 1 }, tables, placements };
}
