// The one document `check:scene` builds: a dressed round table, a block of two long tables, a hall
// with a door and a 4 m ceiling beside an open terrace. Small enough to assert by hand, rich enough
// to touch every rule phase A draws (spec §3.1–§3.3). Phase B grows it (a stage with every edge
// item, a bar, a chuppah, plants) rather than starting a second one.
//
// The round table carries a price ON PURPOSE: the check asserts the figure never survives into the
// scene (the builder reads no price — spec §6.5). The studio's cost is not even NAMED under
// lib/scene: `check:costs` scans this folder for the identifier, which is the stronger guarantee.
import type { Product } from "@/lib/catalog/types";
import { primeCatalog } from "@/lib/catalog/storage";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { VenueGeometry } from "@/lib/venues/types";
import type { VenueStructure } from "@/lib/venues/structure";
import type { Zone } from "@/lib/venues/zone";
import { eventPlan } from "@/lib/events/plan";
import { arrangedStructure } from "@/lib/design-document/features";
import { DEFAULT_SETTINGS, type SceneInput } from "./types";

export const SECRET_PRICE = 999777;

export const FIXTURE_PRODUCTS: Product[] = [
  {
    id: "table-round",
    name: "שולחן עגול 180",
    category: "tables",
    layer: "floor",
    dimensions: { diameterMm: 1800, heightMm: 750 },
    categoryFields: { seats: 10 },
    styleTags: [],
    variants: [],
    unitPrice: SECRET_PRICE,
  },
  {
    id: "table-rect",
    name: "שולחן מלבן 240×120",
    category: "tables",
    layer: "floor",
    dimensions: { widthMm: 2400, depthMm: 1200, heightMm: 750 },
    categoryFields: { seats: 8 },
    styleTags: [],
    variants: [],
  },
  {
    id: "chair",
    name: "כיסא קיאווארי",
    category: "chairs",
    layer: "floor",
    dimensions: { widthMm: 450, depthMm: 500, heightMm: 900 },
    categoryFields: {},
    styleTags: [],
    appearance: { shape: "rect", content: "none", symbolStyle: "chiavari" },
    variants: [{ id: "v-chair-ivory", name: "שנהב", swatch: "#f7f6fc" }],
  },
  {
    id: "cloth",
    name: "מפה עגולה",
    category: "tablecloths",
    layer: "table",
    dimensions: { diameterMm: 3000, heightMm: 0 },
    categoryFields: {},
    styleTags: [],
    variants: [{ id: "v-cloth-plum", name: "סגול", swatch: "#4b3a6e" }],
  },
  {
    id: "runner",
    name: "ראנר פשתן",
    category: "tablecloths",
    layer: "table",
    dimensions: { widthMm: 3000, depthMm: 400, heightMm: 0 },
    categoryFields: {},
    styleTags: [],
    variants: [{ id: "v-runner-linen", name: "פשתן", swatch: "#efe3cf" }],
  },
  {
    id: "arrangement",
    name: "סידור ורדים",
    category: "flower-arrangements",
    layer: "table",
    dimensions: { diameterMm: 400, heightMm: 350 },
    categoryFields: { stems: 35, vessel: "vase" },
    flowers: [
      { id: "l1", name: "ורד", qty: 25, kind: "rose" },
      { id: "l2", name: "אקליפטוס", qty: 10, kind: "euca" },
    ],
    styleTags: [],
    variants: [{ id: "v-arr-blush", name: "ורוד", swatch: "#e8bcce" }],
  },
  {
    id: "vase",
    name: "ואזה זכוכית",
    category: "vases",
    layer: "table",
    dimensions: { diameterMm: 180, heightMm: 300 },
    categoryFields: {},
    styleTags: [],
    variants: [],
  },
  {
    id: "candle-ring",
    name: "פמוט 5 קנים",
    category: "candlesticks",
    layer: "table",
    dimensions: { widthMm: 300, depthMm: 300, heightMm: 600 },
    categoryFields: { arms: 5 },
    styleTags: [],
    appearance: { shape: "circle", content: "none", symbolStyle: "ring" },
    variants: [{ id: "v-candle-gold", name: "זהב", swatch: "#c9a24a" }],
  },
  {
    id: "candle-cluster",
    name: "צילינדרים",
    category: "candlesticks",
    layer: "table",
    dimensions: { widthMm: 400, depthMm: 400, heightMm: 200 },
    categoryFields: { arms: 7 },
    styleTags: [],
    appearance: { shape: "circle", content: "none", symbolStyle: "cluster" },
    variants: [],
  },
  {
    id: "candle-tiered",
    name: "פמוט קומות",
    category: "candlesticks",
    layer: "table",
    dimensions: { widthMm: 350, depthMm: 350, heightMm: 700 },
    categoryFields: { arms: 9 },
    styleTags: [],
    appearance: { shape: "circle", content: "none", symbolStyle: "tiered" },
    variants: [],
  },
  {
    id: "lamp",
    name: "מנורת שולחן",
    category: "lamps",
    layer: "table",
    dimensions: { diameterMm: 300, heightMm: 450 },
    categoryFields: {},
    styleTags: [],
    variants: [],
  },
];

export const FIXTURE_DOC: DesignDocumentContent = {
  calibration: { mmPerUnit: 1 },
  tables: [
    { id: "t1", type: "round", number: 1, position: { x: 5000, y: 5000 }, rotation: 0, seats: 10, variantId: "table-round" },
    { id: "t2", type: "rectangle", number: 2, position: { x: 12000, y: 4000 }, rotation: 0, seats: 8, variantId: "table-rect", groupId: "g1" },
    { id: "t3", type: "rectangle", number: 3, position: { x: 14400, y: 4000 }, rotation: 0, seats: 8, variantId: "table-rect", groupId: "g1" },
  ],
  placements: [
    { id: "p-cloth", variantId: "v-cloth-plum", layer: "table", tableId: "t1", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { id: "p-arr", variantId: "v-arr-blush", layer: "table", tableId: "t1", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { id: "p-ring", variantId: "v-candle-gold", layer: "table", tableId: "t1", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { id: "p-cluster", variantId: "candle-cluster", layer: "table", tableId: "t1", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { id: "p-lamp", variantId: "lamp", layer: "table", tableId: "t1", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { id: "p-runner", variantId: "v-runner-linen", layer: "table", tableId: "t2", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { id: "p-tiered", variantId: "candle-tiered", layer: "table", tableId: "t3", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
  ],
  groups: [{ id: "g1", number: 2 }],
};

/** A hall (0..20 m × 0..12 m) with a door in its south wall, sharing its east wall with an open
 *  terrace (20..30 m) whose other sides are kerbs. */
export const FIXTURE_STRUCTURE: VenueStructure = {
  nodes: [
    { id: "n1", x: 0, y: 0 },
    { id: "n2", x: 20000, y: 0 },
    { id: "n3", x: 20000, y: 12000 },
    { id: "n4", x: 0, y: 12000 },
    { id: "n5", x: 30000, y: 0 },
    { id: "n6", x: 30000, y: 12000 },
  ],
  walls: [
    { id: "w-top-a", a: "n1", b: "n2", kind: "wall" },
    { id: "w-shared", a: "n2", b: "n3", kind: "wall" },
    { id: "w-bot-a", a: "n3", b: "n4", kind: "wall" },
    { id: "w-left", a: "n4", b: "n1", kind: "wall" },
    { id: "w-top-b", a: "n2", b: "n5", kind: "edge" },
    { id: "w-right", a: "n5", b: "n6", kind: "edge" },
    { id: "w-bot-b", a: "n6", b: "n3", kind: "edge" },
  ],
  entrances: [{ id: "d1", wallId: "w-bot-a", distanceMm: 10000, widthMm: 1800, swingInward: true, doubleDoor: true }],
  features: [],
};

export const FIXTURE_ZONES: Zone[] = [
  { id: "z-hall", venueId: "v1", name: "האולם", kind: "hall", source: { type: "face", anchor: { x: 10000, y: 6000 } }, ceilingHeightMm: 4000, surface: "tile", createdAt: 0 },
  { id: "z-terrace", venueId: "v1", name: "המרפסת", kind: "open", source: { type: "face", anchor: { x: 25000, y: 6000 } }, ceilingHeightMm: 0, surface: "grass", createdAt: 0 },
];

/** Primes the catalog and returns the input `buildScene` takes. */
export function fixtureInput(author = true): SceneInput {
  primeCatalog(FIXTURE_PRODUCTS);
  const geometry: VenueGeometry = { structure: FIXTURE_STRUCTURE, zones: FIXTURE_ZONES, mmPerUnit: 1, access: "granted" };
  const plan = eventPlan({ venueId: "v1", zoneIds: ["z-hall", "z-terrace"] }, geometry);
  return { doc: FIXTURE_DOC, plan, structure: arrangedStructure(plan.structure, FIXTURE_DOC), settings: DEFAULT_SETTINGS, author };
}
