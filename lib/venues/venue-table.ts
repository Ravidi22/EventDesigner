// THE VENUE'S DEFAULT TABLE LAYOUT (2026-11-20, the user: "why can't I put a table on /halls" — and,
// asked what such a table is, "the venue's usual table layout: every NEW sketch in this venue starts
// with these tables as its own").
//
// A table put down at /halls is a feature of kind "table" carrying `FeatureTable` — what a sketch
// needs to make it a table of its own: its number, how many sit at it, and the name of the row it
// was copied from (a COPY, never a link: every business opens every venue, and a row id means
// nothing in another studio's catalog). Its shape and size are the feature's own.
//
// It is NOT part of the room an event draws on: lib/events/plan.ts takes every venue table out of
// the plan's structure, so no sketch, printed sheet, 3D room or client view ever draws it as the
// venue's — and hands them over apart (`EventPlan.layoutTables`, only those inside the event's
// zones). The studio turns those into the sketch's OWN tables (`layoutTables` below) the first time
// an event's drawing is opened, one undo entry: numbered, seated, dressed and quoted like any table,
// each matched to the studio's own catalog row by shape and size (a 180 round is the studio's 180
// round, priced and packed as its own) — a table no row matches comes across by its name and size.
// Pure. `npm run check:venue-table`.
import type { Product } from "@/lib/catalog/types";
import type { DesignTable } from "@/lib/design-document/types";
import type { Point } from "@/lib/studio/hall";
import { isMain } from "../self-check";

export interface FeatureTable {
  /** How many sit at it. */
  seats: number;
  /** Its number in the layout. */
  number: number;
  /** The row it was copied from, by name ("עגול 180") — what the studio's own row is found by when
   *  shape and size alone do not settle it. */
  name: string;
}

/** The category a venue table is copied from. */
export const TABLE_CATEGORY = "tables";

/** A row's chairs, as the table it lands as is seated (the base library's are the ordinary
 *  settings; a row with none sits nobody until the bar says otherwise). */
export function rowSeats(product: Pick<Product, "categoryFields">): number {
  const n = Number(product.categoryFields?.seats);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** The next number nobody in the layout holds. */
export function nextTableNumber(features: readonly { table?: FeatureTable }[]): number {
  const taken = new Set(features.flatMap((f) => (f.table ? [f.table.number] : [])));
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

/** The table's copy for a row put down as table number `number`. */
export function tableSpec(product: Pick<Product, "name" | "categoryFields">, number: number): FeatureTable {
  return { seats: rowSeats(product), number, name: product.name };
}

type TableFeature = { id: string; x: number; y: number; rotationDeg?: number; widthMm: number; depthMm: number; shape: string; table?: FeatureTable };

const rowShape = (p: Product): string => p.appearance?.shape ?? (p.dimensions.diameterMm ? "circle" : "rect");
const rowBox = (p: Product): { w: number; h: number } =>
  p.dimensions.diameterMm ? { w: p.dimensions.diameterMm, h: p.dimensions.diameterMm } : { w: p.dimensions.widthMm ?? 0, h: p.dimensions.depthMm ?? 0 };
/** Within a centimetre and a half either way. */
const SIZE_TOL_MM = 15;
const near = (a: number, b: number) => Math.abs(a - b) <= SIZE_TOL_MM;

/** The studio's own row a venue table is: a live table row of the same shape and size (laid either
 *  way round — `turned` when the row's width is the venue table's depth), the one of the same name
 *  first. Undefined when no row is that table. */
export function matchTableRow(f: TableFeature, products: readonly Product[]): { product: Product; turned: boolean } | undefined {
  let best: { product: Product; turned: boolean; score: number } | undefined;
  for (const p of products) {
    if (p.archived || p.category !== TABLE_CATEGORY) continue;
    // A hand-drawn venue outline is matched by size and name alone.
    if (f.shape !== "custom" && rowShape(p) !== f.shape) continue;
    const b = rowBox(p);
    const straight = near(b.w, f.widthMm) && near(b.h, f.depthMm);
    const turned = !straight && near(b.w, f.depthMm) && near(b.h, f.widthMm);
    if (!straight && !turned) continue;
    const score = (f.table && p.name === f.table.name ? 2 : 0) + (straight ? 1 : 0);
    if (!best || score > best.score) best = { product: p, turned, score };
  }
  return best && { product: best.product, turned: best.turned };
}

/** The tables standing inside the given areas — every one when no area is given. */
export function tablesInside<T extends { x: number; y: number }>(tables: readonly T[], areas: readonly (readonly Point[])[], inside: (p: Point, poly: Point[]) => boolean): T[] {
  if (!areas.length) return [...tables];
  return tables.filter((t) => areas.some((a) => a.length >= 3 && inside({ x: t.x, y: t.y }, a as Point[])));
}

/** The venue's tables as a sketch's OWN tables: each matched to the studio's row (its name, size and
 *  shade, so it is priced and packed as the studio's) or, when none is, by its own name and size;
 *  seated as the venue seats it; numbered as the venue numbers it, a repeated or missing number given
 *  the next free one. `variantOf` is the studio's default shade of a row. */
export function layoutTables(
  features: readonly TableFeature[],
  products: readonly Product[],
  opts: { newId: () => string; variantOf?: (p: Product) => string },
): { tables: DesignTable[]; unmatched: number } {
  const variantOf = opts.variantOf ?? ((p: Product) => p.variants.find((v) => !v.archived)?.id ?? p.id);
  const used = new Set<number>();
  const tables: DesignTable[] = [];
  let unmatched = 0;
  // Numbered tables first, in their own order, so a repeated number goes to the later one.
  const ordered = [...features].filter((f) => f.table).sort((a, b) => (a.table!.number || Infinity) - (b.table!.number || Infinity));
  const pending: { f: TableFeature; t: Omit<DesignTable, "number"> }[] = [];
  for (const f of ordered) {
    const spec = f.table!;
    const hit = matchTableRow(f, products);
    if (!hit) unmatched++;
    const p = hit?.product;
    const round = f.shape === "circle" || (p && !!p.dimensions.diameterMm);
    const dims = p
      ? p.dimensions.diameterMm
        ? { diameterMm: p.dimensions.diameterMm }
        : { widthMm: p.dimensions.widthMm ?? 0, depthMm: p.dimensions.depthMm ?? 0 }
      : round
        ? { diameterMm: f.widthMm }
        : { widthMm: f.widthMm, depthMm: f.depthMm };
    const t: Omit<DesignTable, "number"> = {
      id: opts.newId(),
      type: p?.name ?? spec.name,
      ...(p ? { variantId: variantOf(p) } : {}),
      position: { x: Math.round(f.x), y: Math.round(f.y) },
      rotation: (((f.rotationDeg ?? 0) + (hit?.turned ? 90 : 0)) % 360 + 360) % 360,
      ...dims,
      ...(spec.seats > 0 ? { seats: spec.seats } : {}),
    };
    if (spec.number > 0 && !used.has(spec.number)) {
      used.add(spec.number);
      tables.push({ ...t, number: spec.number } as DesignTable);
    } else pending.push({ f, t });
  }
  let n = 1;
  for (const { t } of pending) {
    while (used.has(n)) n++;
    used.add(n);
    tables.push({ ...t, number: n } as DesignTable);
  }
  return { tables, unmatched };
}

// ponytail: self-check. Run: npm run check:venue-table
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const row = (id: string, name: string, dimensions: Product["dimensions"], seats: number, extra: Partial<Product> = {}): Product => ({
    id,
    name,
    category: "tables",
    layer: "floor",
    dimensions,
    categoryFields: { seats },
    styleTags: [],
    variants: [],
    ...extra,
  });
  const catalog = [
    row("r180", "עגול 180", { diameterMm: 1800, heightMm: 750 }, 12),
    row("k240", "מלבן 240×120", { widthMm: 2400, depthMm: 1200, heightMm: 750 }, 10, { variants: [{ id: "k240-white", name: "לבן" }] }),
    row("old", "עגול 180 ישן", { diameterMm: 1800, heightMm: 750 }, 10, { archived: true }),
    row("h120", "חצי עיגול 120×60", { widthMm: 1200, depthMm: 600, heightMm: 750 }, 4, { appearance: { shape: "half-circle", content: "none" } }),
  ];
  const t = (id: string, x: number, shape: string, w: number, d: number, table: FeatureTable, rotationDeg = 0): TableFeature => ({ id, x, y: 0, shape, widthMm: w, depthMm: d, rotationDeg, table });

  assert(rowSeats(catalog[0]) === 12 && rowSeats({ categoryFields: {} }) === 0, "a row's chairs are its seats field");
  assert(nextTableNumber([{ table: { seats: 1, number: 1, name: "" } }, { table: { seats: 1, number: 3, name: "" } }, {}]) === 2, "the next number is the first one free");

  assert(matchTableRow(t("a", 0, "circle", 1800, 1800, tableSpec(catalog[0], 1)), catalog)?.product.id === "r180", "a 180 round is the studio's 180 round (not the archived one)");
  const long = matchTableRow(t("b", 0, "rect", 1200, 2400, tableSpec(catalog[1], 2)), catalog);
  assert(long?.product.id === "k240" && long.turned, "a 240 rectangle laid the long way down is the 240 row, turned");
  assert(!matchTableRow(t("c", 0, "rect", 2000, 1000, { seats: 8, number: 3, name: "מלבן 200" }), catalog), "a size the studio does not own matches nothing");
  assert(matchTableRow(t("d", 0, "half-circle", 1200, 600, tableSpec(catalog[3], 4)), catalog)?.product.id === "h120", "a half round matches the half round, by shape");
  assert(!matchTableRow(t("e", 0, "rect", 1200, 600, { seats: 4, number: 5, name: "x" }), catalog), "…and a 120×60 rectangle does not");

  let k = 0;
  const { tables, unmatched } = layoutTables(
    [
      t("a", 0, "circle", 1800, 1800, tableSpec(catalog[0], 2)),
      t("b", 3000, "rect", 1200, 2400, { ...tableSpec(catalog[1], 2), seats: 12 }, 30),
      t("c", 6000, "rect", 2000, 1000, { seats: 8, number: 0, name: "מלבן 200" }),
    ],
    catalog,
    { newId: () => `n${++k}` },
  );
  assert(tables.length === 3 && unmatched === 1, "three tables, one with no row of its own");
  const [a, b, c] = ["a", "b", "c"].map((_, i) => tables.find((x) => x.position.x === i * 3000)!);
  assert(a.variantId === "r180" && a.diameterMm === 1800 && a.seats === 12 && a.type === "עגול 180" && a.number === 2, "the round: the studio's row (placed under its id), its size, the venue's seats and number");
  assert(b.variantId === "k240-white" && b.widthMm === 2400 && b.depthMm === 1200 && b.rotation === 120 && b.seats === 12, "the long one: the row's first shade, the row's own size turned a quarter more, the venue's 12 seats");
  assert(b.number !== 2 && c.number !== 2 && b.number !== c.number && new Set(tables.map((x) => x.number)).size === 3, "a repeated number and a missing one get the next free numbers");
  assert(!c.variantId && c.type === "מלבן 200" && c.widthMm === 2000 && c.depthMm === 1000, "a table no row matches comes across by its name and size");

  const inside = (p: Point, poly: Point[]) => p.x >= Math.min(...poly.map((q) => q.x)) && p.x <= Math.max(...poly.map((q) => q.x));
  const hall: Point[] = [{ x: -1000, y: -1000 }, { x: 4000, y: -1000 }, { x: 4000, y: 1000 }, { x: -1000, y: 1000 }];
  assert(tablesInside([{ x: 0, y: 0 }, { x: 6000, y: 0 }], [hall], inside).length === 1, "only the tables inside the event's zones");
  assert(tablesInside([{ x: 0, y: 0 }, { x: 6000, y: 0 }], [], inside).length === 2, "…every one when it has none");

  // An event's plan: the venue's tables are not its room, and come apart as its starting layout.
  void (async () => {
    const { eventPlan } = await import("@/lib/events/plan");
    const { emptyStructure } = await import("./structure");
    const venue = emptyStructure();
    venue.features = [
      { id: "bar", kind: "bar", label: "בר", x: 0, y: 0, widthMm: 2000, depthMm: 600, heightMm: 1100, shape: "rect", rotationDeg: 0 },
      { id: "t1", kind: "table", label: "עגול 180", x: 3000, y: 0, widthMm: 1800, depthMm: 1800, heightMm: 750, shape: "circle", rotationDeg: 0, table: tableSpec(catalog[0], 1) },
    ];
    const plan = eventPlan({ venueId: "v", zoneIds: [] }, { structure: venue, zones: [], mmPerUnit: 1, access: "granted" });
    assert(plan.structure.features.length === 1 && plan.structure.features[0].id === "bar", "an event's room has no venue table in it");
    assert(plan.layoutTables.length === 1 && plan.layoutTables[0].id === "t1", "…they come apart, as its starting layout");
    console.log("venue table: ok");
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
