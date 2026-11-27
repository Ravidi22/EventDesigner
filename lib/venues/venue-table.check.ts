// npm run check:venue-table — the self-check of ./venue-table.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "@/lib/catalog/types";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { Point } from "@/lib/studio/hall";
import { layoutTables, matchTableRow, nextTableNumber, rowSeats, tablesInside, tableSpec, wantsLayout, withLayout, type FeatureTable, type TableFeature } from "./venue-table";

// ponytail: self-check. Run: npm run check:venue-table
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
