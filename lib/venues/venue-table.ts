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
// zones). They become the sketch's OWN tables (`layoutTables` below) when a new event's drawing is
// seeded on the server (lib/studio/sketch-actions.ts seedEventDocument) — or, for a drawing that
// never was offered them (an event made before that, or whose venue was picked later), the first
// time the studio opens it: one undo entry, numbered, seated, dressed and quoted like any table.
// Each is matched to the studio's own catalog row by its SHAPE and size — a 180 round is the
// studio's 180 round, priced and packed as its own; a hand-drawn outline by its drawing, never by its
// box alone; a run stretched from a resizable row as that row, stretched — and a table no row
// matches comes across by its name, its size and the shape it is drawn in.
// Pure. `npm run check:venue-table`.
import type { MapAppearance, Product } from "@/lib/catalog/types";
import { shadeVariant } from "@/lib/catalog/shades";
import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import type { EdgeCurve, Point } from "@/lib/studio/hall";
import { footprintBounds, resizeAxes, resizeSpecOf, resolveFootprint, type Footprint } from "@/lib/studio/footprint";
import { footprintPolygons, insidePolys, polysBox, type Poly } from "@/lib/studio/proximity";
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

/** The table's copy for a row put down as table `number`. */
export function tableSpec(product: Pick<Product, "name" | "categoryFields">, number: number): FeatureTable {
  return { seats: rowSeats(product), number, name: product.name };
}

/** What a venue table is read by here — a StructureFeature of kind "table" is one. */
export type TableFeature = {
  id: string;
  x: number;
  y: number;
  rotationDeg?: number;
  widthMm: number;
  depthMm: number;
  shape: string;
  /** A hand-drawn one's points and bows (StructureFeature.outline / edgeCurves). */
  outline?: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  table?: FeatureTable;
};

const rowShape = (p: Product): string => p.appearance?.shape ?? (p.dimensions.diameterMm ? "circle" : "rect");

/** A row's drawing as a venue table is made from it (lib/venues/structure.ts newFeatureFromProduct):
 *  its base shape without the parts beside it — and a band opened in two places as its outer shape.
 *  Its box is the venue table's box. */
function rowBase(p: Product): Footprint {
  const look = (extra: Partial<MapAppearance>): Product => ({ ...p, appearance: p.appearance && { ...p.appearance, parts: undefined, ...extra } });
  const drawn = resolveFootprint(look({}));
  return drawn.kind === "multi" ? resolveFootprint(look({ hollow: undefined })) : drawn;
}

/** Within a centimetre and a half either way. */
const SIZE_TOL_MM = 15;
const near = (a: number, b: number) => Math.abs(a - b) <= SIZE_TOL_MM;

/** How much of a HAND-DRAWN venue table's drawing must be a row's for the two to be one table: of a
 *  grid over their boxes, the points inside both over those inside either. High on purpose — a 160
 *  round is 95% of a 160 octagon — because a wrong match is priced and drawn as the wrong table,
 *  where no match comes across as itself, drawn right, for the designer to swap. */
const SAME_DRAWING = 0.97;
const GRID = 40;

/** A drawing fitted into the unit box (0–1 both ways): its SHAPE, apart from its size, which is
 *  checked on its own. `turned`: a quarter turn on, as the row stands when it is laid the other way. */
function unitShape(f: Footprint, turned = false): Poly[] {
  const polys = footprintPolygons(f, { x: 0, y: 0 }, turned ? 90 : 0);
  const b = polysBox(polys);
  const w = b.maxX - b.minX || 1;
  const h = b.maxY - b.minY || 1;
  return polys.map((poly) => poly.map((p) => ({ x: (p.x - b.minX) / w, y: (p.y - b.minY) / h })));
}

/** Of a grid over the unit box, the points inside both drawings over the points inside either. */
function sameness(a: Poly[], b: Poly[]): number {
  let both = 0;
  let either = 0;
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      const p = { x: (i + 0.5) / GRID, y: (j + 0.5) / GRID };
      const inA = insidePolys(p, a);
      const inB = insidePolys(p, b);
      if (inA && inB) both++;
      if (inA || inB) either++;
    }
  return either ? both / either : 0;
}

/** A hand-drawn venue table's drawing (its outline as drawn — unitShape stretches its box away); a
 *  malformed one is the box it is drawn as. Null for a shape its name builds. */
function handDrawing(f: TableFeature): Footprint | null {
  if (f.shape !== "custom") return null;
  if (!f.outline || f.outline.length < 3) return { kind: "rect", widthMm: f.widthMm || 1, depthMm: f.depthMm || 1 };
  return { kind: "custom", outline: f.outline, ...(f.edgeCurves ? { edgeCurves: f.edgeCurves } : {}) };
}

type Fit = { stretched: boolean; sizeMm?: { widthMm: number; depthMm: number } };

/** Whether a row whose drawing is `box` is a venue table `w` × `h` across, in the row's own frame:
 *  at the row's own size — or, for a row the plan may stretch (Product.resize), at a size its range
 *  allows, which the table then carries as its `sizeMm` (SK-4: a run stretched at /halls from the
 *  studio's own resizable row used to match nothing). */
function fitOf(p: Product, box: { w: number; h: number }, w: number, h: number): Fit | null {
  if (near(box.w, w) && near(box.h, h)) return { stretched: false };
  const axes = resizeAxes(p);
  const spec = resizeSpecOf(p);
  if (!axes || !spec) return null;
  const within = (v: number, r?: { minMm: number; maxMm: number }) =>
    !!r && v >= Math.min(r.minMm, r.maxMm) - SIZE_TOL_MM && v <= Math.max(r.minMm, r.maxMm) + SIZE_TOL_MM;
  const wOk = near(box.w, w) || (axes.width && within(w, spec.width));
  // A round shape has ONE measurement (resizeAxes): its depth follows its width.
  const hOk = axes.uniform ? near(h, box.w ? (w * box.h) / box.w : h) : near(box.h, h) || (axes.depth && within(h, spec.depth));
  return wOk && hOk ? { stretched: true, sizeMm: { widthMm: Math.round(w), depthMm: Math.round(h) } } : null;
}

export interface TableMatch {
  product: Product;
  /** Laid the other way round: the row's width is the venue table's depth (a quarter turn more). */
  turned: boolean;
  /** The size the row is stretched to (DesignTable.sizeMm), in the row's own frame; absent = its own. */
  sizeMm?: { widthMm: number; depthMm: number };
}

/** The studio's own row a venue table is: a live table row of the same shape and size (laid either
 *  way round; stretched within its range when it is a resizable row), the one of the same name first,
 *  then one at its own size, then one laid the same way. A shape its name builds (a round, a
 *  half-round, an octagon) is the row of that shape; a HAND-DRAWN outline is the row whose drawing it
 *  is (SK-3: it used to be matched by its size alone — a hand-drawn octagon came across as the
 *  studio's 160 square, priced and drawn square). Undefined when no row is that table. */
export function matchTableRow(f: TableFeature, products: readonly Product[]): TableMatch | undefined {
  const drawn = handDrawing(f);
  const own = drawn && unitShape(drawn);
  let best: (TableMatch & { score: number }) | undefined;
  for (const p of products) {
    if (p.archived || p.category !== TABLE_CATEGORY) continue;
    if (!drawn && rowShape(p) !== f.shape) continue;
    const base = rowBase(p);
    const box = footprintBounds(base);
    const straight = fitOf(p, box, f.widthMm, f.depthMm);
    const fit = straight ?? fitOf(p, box, f.depthMm, f.widthMm);
    if (!fit) continue;
    if (own && sameness(own, unitShape(base, !straight)) < SAME_DRAWING) continue;
    const score = (f.table && p.name === f.table.name ? 4 : 0) + (fit.stretched ? 0 : 2) + (straight ? 1 : 0);
    if (!best || score > best.score) best = { product: p, turned: !straight, ...(fit.sizeMm ? { sizeMm: fit.sizeMm } : {}), score };
  }
  return best && { product: best.product, turned: best.turned, ...(best.sizeMm ? { sizeMm: best.sizeMm } : {}) };
}

/** The tables standing inside the given areas — every one when no area is given. */
export function tablesInside<T extends { x: number; y: number }>(tables: readonly T[], areas: readonly (readonly Point[])[], inside: (p: Point, poly: Point[]) => boolean): T[] {
  if (!areas.length) return [...tables];
  return tables.filter((t) => areas.some((a) => a.length >= 3 && inside({ x: t.x, y: t.y }, a as Point[])));
}

/** The shade a matched row lands in: the event's first shade it stocks (lib/catalog/shades.ts),
 *  else its first live one — the studio's own default, read without its primed cache, so the server
 *  seeding a new event's drawing lands the same shade the studio would. */
export function layoutVariant(p: Product, shades: readonly string[] = []): string {
  return shadeVariant(p.variants, shades)?.id ?? p.variants.find((v) => !v.archived)?.id ?? p.id;
}

export interface LayoutOptions<F extends TableFeature> {
  newId: () => string;
  /** The event's shades (EventSummary.shades). */
  shades?: readonly string[];
  /** The shape a venue table is DRAWN in — lib/venues/structure.ts featureFootprint, handed in because
   *  that module imports this one. A table no row matches keeps it (DesignTable.footprint); without
   *  it, such a table is the circle or the rectangle of its box. */
  footprintOf?: (f: F) => Footprint;
}

/** A matched row's numbers, as a table dropped off the rail carries them. */
function rowDims(p: Product): Pick<DesignTable, "diameterMm" | "widthMm" | "depthMm"> {
  return p.dimensions.diameterMm ? { diameterMm: p.dimensions.diameterMm } : { widthMm: p.dimensions.widthMm ?? 0, depthMm: p.dimensions.depthMm ?? 0 };
}

/** A table no row matched: its box — and, when it is not the circle or the rectangle of that box,
 *  the shape it is drawn in (SK-4: a half-round, an oval or a hand-drawn table used to arrive as a
 *  plain rectangle). */
function ownDims(f: TableFeature, drawn: Footprint | undefined): Pick<DesignTable, "diameterMm" | "widthMm" | "depthMm" | "footprint"> {
  if (f.shape === "circle") return { diameterMm: f.widthMm };
  const box = { widthMm: f.widthMm, depthMm: f.depthMm };
  return drawn && drawn.kind !== "rect" && drawn.kind !== "circle" ? { ...box, footprint: drawn } : box;
}

/** The venue's tables as a sketch's OWN tables: each matched to the studio's row (its name, size,
 *  stretch and shade, so it is priced and packed as the studio's) or, when none is, by its own name,
 *  size and shape; seated as the venue seats it; numbered as the venue numbers it, a repeated or
 *  missing number given the next free one. */
export function layoutTables<F extends TableFeature>(
  features: readonly F[],
  products: readonly Product[],
  opts: LayoutOptions<F>,
): { tables: DesignTable[]; unmatched: number } {
  const used = new Set<number>();
  const tables: DesignTable[] = [];
  let unmatched = 0;
  // Numbered tables first, in their own order, so a repeated number goes to the later one.
  const ordered = [...features].filter((f) => f.table).sort((a, b) => (a.table!.number || Infinity) - (b.table!.number || Infinity));
  const pending: Omit<DesignTable, "number">[] = [];
  for (const f of ordered) {
    const spec = f.table!;
    const hit = matchTableRow(f, products);
    if (!hit) unmatched++;
    const p = hit?.product;
    const t: Omit<DesignTable, "number"> = {
      id: opts.newId(),
      type: p?.name ?? spec.name,
      ...(p ? { variantId: layoutVariant(p, opts.shades) } : {}),
      position: { x: Math.round(f.x), y: Math.round(f.y) },
      rotation: (((f.rotationDeg ?? 0) + (hit?.turned ? 90 : 0)) % 360 + 360) % 360,
      ...(p ? rowDims(p) : ownDims(f, opts.footprintOf?.(f))),
      ...(hit?.sizeMm ? { sizeMm: hit.sizeMm } : {}),
      ...(spec.seats > 0 ? { seats: spec.seats } : {}),
    };
    if (spec.number > 0 && !used.has(spec.number)) {
      used.add(spec.number);
      tables.push({ ...t, number: spec.number });
    } else pending.push(t);
  }
  let n = 1;
  for (const t of pending) {
    while (used.has(n)) n++;
    used.add(n);
    tables.push({ ...t, number: n });
  }
  return { tables, unmatched };
}

/** Whether a drawing is offered the venue's tables: an EMPTY one — nothing on it — that never was.
 *  `layoutAdopted` marks one that was, so a sketch cleared of them on purpose is never filled
 *  again. No drawing saved at all is an empty one. */
export function wantsLayout(doc: Pick<DesignDocumentContent, "tables" | "placements" | "layoutAdopted"> | null | undefined): boolean {
  return !doc || (!doc.layoutAdopted && doc.tables.length === 0 && doc.placements.length === 0);
}

/** The drawing with the venue's tables in it as its own (`layoutTables`), marked as offered —
 *  `content` — and `base`, the drawing marked and nothing more: what one Ctrl+Z of the adoption goes
 *  back to, and what is saved then, so it is never offered them again. */
export function withLayout<F extends TableFeature>(
  doc: DesignDocumentContent,
  features: readonly F[],
  products: readonly Product[],
  opts: LayoutOptions<F>,
): { base: DesignDocumentContent; content: DesignDocumentContent; unmatched: number } {
  const base: DesignDocumentContent = { ...doc, layoutAdopted: true };
  const { tables, unmatched } = layoutTables(features, products, opts);
  return { base, content: { ...base, tables: [...base.tables, ...tables] }, unmatched };
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
    row("k240", "מלבן 240×120", { widthMm: 2400, depthMm: 1200, heightMm: 750 }, 10, { variants: [{ id: "k240-white", name: "לבן" }, { id: "k240-gold", name: "זהב" }] }),
    row("old", "עגול 180 ישן", { diameterMm: 1800, heightMm: 750 }, 10, { archived: true }),
    row("h120", "חצי עיגול 120×60", { widthMm: 1200, depthMm: 600, heightMm: 750 }, 4, { appearance: { shape: "half-circle", content: "none" } }),
  ];
  const t = (id: string, x: number, shape: string, w: number, d: number, table: FeatureTable, rotationDeg = 0): TableFeature => ({ id, x, y: 0, shape, widthMm: w, depthMm: d, rotationDeg, table });

  assert(rowSeats(catalog[0]) === 12 && rowSeats({ categoryFields: {} }) === 0, "a row's chairs are its seats field");
  assert(nextTableNumber([{ table: { seats: 1, number: 1, name: "" } }, { table: { seats: 1, number: 3, name: "" } }, {}]) === 2, "the next number is the first one free");

  assert(matchTableRow(t("a", 0, "circle", 1800, 1800, tableSpec(catalog[0], 1)), catalog)?.product.id === "r180", "a 180 round is the studio's 180 round (not the archived one)");
  const long = matchTableRow(t("b", 0, "rect", 1200, 2400, tableSpec(catalog[1], 2)), catalog);
  assert(long?.product.id === "k240" && long.turned && !long.sizeMm, "a 240 rectangle laid the long way down is the 240 row, turned, at its own size");
  assert(!matchTableRow(t("c", 0, "rect", 2000, 1000, { seats: 8, number: 3, name: "מלבן 200" }), catalog), "a size the studio does not own matches nothing");
  assert(matchTableRow(t("d", 0, "half-circle", 1200, 600, tableSpec(catalog[3], 4)), catalog)?.product.id === "h120", "a half round matches the half round, by shape");
  assert(!matchTableRow(t("e", 0, "rect", 1200, 600, { seats: 4, number: 5, name: "x" }), catalog), "…and a 120×60 rectangle does not");

  // SK-3: a HAND-DRAWN venue table is matched by its drawing — never by its size alone.
  const cut = 1600 / (2 + Math.SQRT2);
  const octagon: Point[] = [
    { x: cut, y: 0 }, { x: 1600 - cut, y: 0 }, { x: 1600, y: cut }, { x: 1600, y: 1600 - cut },
    { x: 1600 - cut, y: 1600 }, { x: cut, y: 1600 }, { x: 0, y: 1600 - cut }, { x: 0, y: cut },
  ];
  const square160 = row("sq160", "מרובע 160×160", { widthMm: 1600, depthMm: 1600, heightMm: 750 }, 8);
  const round160 = row("r160", "עגול 160", { diameterMm: 1600, heightMm: 750 }, 10);
  const octRow = row("oct160", "מתומן 160", { widthMm: 1600, depthMm: 1600, heightMm: 750 }, 8, { appearance: { shape: "custom", outline: octagon, content: "none" } });
  const drawnOct: TableFeature = { id: "o", x: 0, y: 0, shape: "custom", widthMm: 1600, depthMm: 1600, outline: octagon, table: { seats: 8, number: 9, name: "שולחן מתומן" } };
  assert(!matchTableRow(drawnOct, [square160, round160]), "a hand-drawn octagon is not the studio's 160 square, nor its 160 round");
  assert(matchTableRow(drawnOct, [square160, round160, octRow])?.product.id === "oct160", "…it is the studio's row drawn the same way, whatever its name");
  // The same drawing pulled to 2 × 1 m at /halls is not a 1.6 m octagon — size still counts.
  assert(!matchTableRow({ ...drawnOct, widthMm: 2000, depthMm: 1000 }, [octRow]), "…at its own size");

  // SK-4: a venue table stretched from a RESIZABLE row is that row, stretched (sizeMm).
  const knights = row("kn", "שולחן אבירים", { widthMm: 2400, depthMm: 1000, heightMm: 750 }, 10, { resize: { stepMm: 100, width: { minMm: 1200, maxMm: 6000 } } });
  const stretched = matchTableRow(t("k", 0, "rect", 3600, 1000, tableSpec(knights, 6)), [knights]);
  assert(stretched?.product.id === "kn" && stretched.sizeMm?.widthMm === 3600 && stretched.sizeMm.depthMm === 1000, "a 3.6m run of a resizable 2.4m row is that row, stretched to 3.6m");
  const stood = matchTableRow(t("k", 0, "rect", 1000, 3600, tableSpec(knights, 6)), [knights]);
  assert(stood?.turned === true && stood.sizeMm?.widthMm === 3600, "…laid the long way down, turned");
  assert(!matchTableRow(t("k", 0, "rect", 7000, 1000, tableSpec(knights, 6)), [knights]), "…but not past what the row stretches to");
  assert(!matchTableRow(t("k", 0, "rect", 3600, 1200, tableSpec(knights, 6)), [knights]), "…nor on a side it does not stretch");
  const exact = row("kn36", "מלבן 360×100", { widthMm: 3600, depthMm: 1000, heightMm: 750 }, 14);
  const pick = matchTableRow(t("k", 0, "rect", 3600, 1000, { seats: 14, number: 1, name: "x" }), [knights, exact]);
  assert(pick?.product.id === "kn36" && !pick.sizeMm, "a row at the table's own size wins over one that would be stretched to it");

  let k = 0;
  const newId = () => `n${++k}`;
  const { tables, unmatched } = layoutTables(
    [
      t("a", 0, "circle", 1800, 1800, tableSpec(catalog[0], 2)),
      t("b", 3000, "rect", 1200, 2400, { ...tableSpec(catalog[1], 2), seats: 12 }, 30),
      t("c", 6000, "rect", 2000, 1000, { seats: 8, number: 0, name: "מלבן 200" }),
    ],
    catalog,
    { newId },
  );
  assert(tables.length === 3 && unmatched === 1, "three tables, one with no row of its own");
  const [a, b, c] = ["a", "b", "c"].map((_, i) => tables.find((x) => x.position.x === i * 3000)!);
  assert(a.variantId === "r180" && a.diameterMm === 1800 && a.seats === 12 && a.type === "עגול 180" && a.number === 2, "the round: the studio's row (placed under its id), its size, the venue's seats and number");
  assert(b.variantId === "k240-white" && b.widthMm === 2400 && b.depthMm === 1200 && b.rotation === 120 && b.seats === 12, "the long one: the row's first shade, the row's own size turned a quarter more, the venue's 12 seats");
  assert(b.number !== 2 && c.number !== 2 && b.number !== c.number && new Set(tables.map((x) => x.number)).size === 3, "a repeated number and a missing one get the next free numbers");
  assert(!c.variantId && c.type === "מלבן 200" && c.widthMm === 2000 && c.depthMm === 1000 && !c.footprint, "a table no row matches comes across by its name and size");
  const gold = layoutTables([t("b", 0, "rect", 2400, 1200, tableSpec(catalog[1], 1))], catalog, { newId, shades: ["זהב"] }).tables[0];
  assert(gold.variantId === "k240-gold", "…a matched row in the event's shade when it stocks it");
  const run = layoutTables([t("k", 0, "rect", 3600, 1000, tableSpec(knights, 1))], [knights], { newId }).tables[0];
  assert(run.variantId === "kn" && run.widthMm === 2400 && run.sizeMm?.widthMm === 3600, "a stretched run lands as its row, stretched on the plan as a table dragged longer is");

  const inside = (p: Point, poly: Point[]) => p.x >= Math.min(...poly.map((q) => q.x)) && p.x <= Math.max(...poly.map((q) => q.x));
  const hall: Point[] = [{ x: -1000, y: -1000 }, { x: 4000, y: -1000 }, { x: 4000, y: 1000 }, { x: -1000, y: 1000 }];
  assert(tablesInside([{ x: 0, y: 0 }, { x: 6000, y: 0 }], [hall], inside).length === 1, "only the tables inside the event's zones");
  assert(tablesInside([{ x: 0, y: 0 }, { x: 6000, y: 0 }], [], inside).length === 2, "…every one when it has none");

  // Offered once, to an empty drawing.
  const blank: DesignDocumentContent = { calibration: { mmPerUnit: 1 }, tables: [], placements: [] };
  assert(wantsLayout(null) && wantsLayout(blank), "an empty drawing — or none yet — is offered the venue's tables");
  assert(!wantsLayout({ ...blank, layoutAdopted: true }), "…once: one cleared of them on purpose is not offered them again");
  assert(!wantsLayout({ ...blank, tables: [a] }), "…and one with anything on it is not");
  const offered = withLayout(blank, [t("a", 0, "circle", 1800, 1800, tableSpec(catalog[0], 1))], catalog, { newId });
  assert(offered.base.layoutAdopted === true && offered.base.tables.length === 0, "the base is the drawing marked and nothing more");
  assert(offered.content.layoutAdopted === true && offered.content.tables.length === 1 && offered.unmatched === 0, "…the content, marked, with the venue's tables in it");

  // An event's plan: the venue's tables are not its room, and come apart as its starting layout.
  void (async () => {
    const { eventPlan } = await import("@/lib/events/plan");
    const { emptyStructure, featureFootprint } = await import("./structure");
    const venue = emptyStructure();
    venue.features = [
      { id: "bar", kind: "bar", label: "בר", x: 0, y: 0, widthMm: 2000, depthMm: 600, heightMm: 1100, shape: "rect", rotationDeg: 0 },
      { id: "t1", kind: "table", label: "עגול 180", x: 3000, y: 0, widthMm: 1800, depthMm: 1800, heightMm: 750, shape: "circle", rotationDeg: 0, table: tableSpec(catalog[0], 1) },
    ];
    const plan = eventPlan({ venueId: "v", zoneIds: [] }, { structure: venue, zones: [], mmPerUnit: 1, access: "granted" });
    assert(plan.structure.features.length === 1 && plan.structure.features[0].id === "bar", "an event's room has no venue table in it");
    assert(plan.layoutTables.length === 1 && plan.layoutTables[0].id === "t1", "…they come apart, as its starting layout");

    // SK-5: a zone MADE OF the venue's tables (/halls: select them → "אזור") is still their area in
    // an event — the tables leave the room, not the zone's own definition.
    const ring = { ...venue, features: [...venue.features, { ...venue.features[1], id: "t2", x: 6000, table: tableSpec(catalog[0], 2) }] };
    const tableZone = { id: "z", venueId: "v", name: "שולחנות", kind: "hall" as const, source: { type: "features" as const, featureIds: ["t1", "t2"], marginMm: 1000 }, ceilingHeightMm: 0, createdAt: 0 };
    const zoned = eventPlan({ venueId: "v", zoneIds: ["z"] }, { structure: ring, zones: [tableZone], mmPerUnit: 1, access: "granted" });
    assert(zoned.zones.length === 1 && zoned.zones[0].boundary.length >= 3 && !zoned.zones[0].detached, "a zone made of the venue's tables has its area in the event");
    assert(zoned.layoutTables.length === 2, "…and both its tables are the event's starting layout");
    assert(zoned.bounds.widthMm > 6000, "…and the canvas frames the zone, not a collapsed box");
    assert(zoned.structure.features.every((f) => f.kind !== "table"), "…while the room still has no venue table in it");

    // SK-4: a table no row matches keeps the shape it is DRAWN in — only a box stays a rectangle.
    const spec = (number: number, name: string): FeatureTable => ({ seats: 4, number, name });
    const own = layoutTables(
      [
        { id: "h", kind: "table" as const, label: "", x: 0, y: 0, widthMm: 1500, depthMm: 750, heightMm: 750, shape: "half-circle" as const, rotationDeg: 0, table: spec(1, "חצי עיגול 150") },
        { id: "e", kind: "table" as const, label: "", x: 3000, y: 0, widthMm: 2400, depthMm: 1400, heightMm: 750, shape: "ellipse" as const, rotationDeg: 0, table: spec(2, "אליפסה 240") },
        { id: "o", kind: "table" as const, label: "", x: 6000, y: 0, widthMm: 1600, depthMm: 1600, heightMm: 750, shape: "custom" as const, outline: octagon, rotationDeg: 0, table: spec(3, "מתומן") },
        { id: "r", kind: "table" as const, label: "", x: 9000, y: 0, widthMm: 2000, depthMm: 1000, heightMm: 750, shape: "rect" as const, rotationDeg: 0, table: spec(4, "מלבן 200") },
        { id: "c", kind: "table" as const, label: "", x: 12000, y: 0, widthMm: 1500, depthMm: 1500, heightMm: 750, shape: "circle" as const, rotationDeg: 0, table: spec(5, "עגול 150") },
      ],
      catalog,
      { newId, footprintOf: featureFootprint },
    );
    const at = (x: number) => own.tables.find((tb) => tb.position.x === x)!;
    assert(own.unmatched === 5, "none of these is a row the studio owns");
    assert(at(0).footprint?.kind === "custom" && at(0).widthMm === 1500 && at(0).depthMm === 750, "a half-round is drawn half round, in its box");
    assert(at(3000).footprint?.kind === "ellipse", "…an oval as an oval");
    const o = at(6000).footprint;
    assert(o?.kind === "custom" && o.outline.length === 8, "…a hand-drawn octagon as its eight sides");
    assert(!at(9000).footprint && at(9000).widthMm === 2000, "…a rectangle is its box, as before");
    assert(!at(12000).footprint && at(12000).diameterMm === 1500, "…and a round its diameter");
    console.log("venue table: ok");
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
