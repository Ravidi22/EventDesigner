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
  // Phase B rows.
  { id: "deck-244x122", name: "במה 244×122", category: "stage-decks", layer: "floor", dimensions: { widthMm: 2440, depthMm: 1220, heightMm: 600 }, categoryFields: {}, styleTags: [], variants: [] },
  { id: "stage-stairs", name: "מדרגות לבמה", category: "stage-stairs", layer: "floor", dimensions: { widthMm: 1000, depthMm: 840, heightMm: 600 }, categoryFields: {}, styleTags: [], variants: [] },
  { id: "stage-skirt", name: "חצאית במה", category: "stage-skirts", layer: "floor", dimensions: { widthMm: 1000, depthMm: 20, heightMm: 600 }, categoryFields: {}, styleTags: [], variants: [{ id: "v-skirt-black", name: "שחור", swatch: "#2b2a2e" }] },
  { id: "stage-bench", name: "בנקט", category: "stage-benches", layer: "floor", dimensions: { widthMm: 1000, depthMm: 450, heightMm: 750 }, categoryFields: {}, styleTags: [], variants: [] },
  { id: "bar-straight", name: "בר ישר 300", category: "bars", layer: "floor", dimensions: { widthMm: 3000, depthMm: 600, heightMm: 1100 }, categoryFields: {}, styleTags: [], appearance: { shape: "rect", content: "none", texture: "marble" }, variants: [] },
  { id: "chuppah", name: "חופה", category: "chuppahs", layer: "floor", dimensions: { widthMm: 3000, depthMm: 3000, heightMm: 2600 }, categoryFields: {}, styleTags: [], appearance: { shape: "rect", content: "none", symbolStyle: "canopy" }, variants: [{ id: "v-chuppah-cream", name: "שמנת", swatch: "#fbf7f1" }] },
  { id: "chandelier", name: "נברשת", category: "chandeliers", layer: "ceiling", dimensions: { diameterMm: 1200, heightMm: 600 }, categoryFields: { arms: 8, hangHeightMm: 2600 }, styleTags: [], variants: [{ id: "v-chand-gold", name: "זהב", swatch: "#c9a24a" }] },
  { id: "curtain", name: "וילון", category: "curtains", layer: "ceiling", dimensions: { widthMm: 4000, depthMm: 220, heightMm: 4000 }, categoryFields: {}, styleTags: [], variants: [{ id: "v-curtain-ivory", name: "שנהב", swatch: "#f3ede2" }] },
  { id: "rug", name: "שטיח", category: "rugs", layer: "floor", dimensions: { widthMm: 3000, depthMm: 2000, heightMm: 0 }, categoryFields: {}, styleTags: [], variants: [{ id: "v-rug-plum", name: "סגול", swatch: "#4b3a6e" }] },
  { id: "sofa", name: "ספה", category: "sofas", layer: "floor", dimensions: { widthMm: 2000, depthMm: 900, heightMm: 800 }, categoryFields: {}, styleTags: [], variants: [] },
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
    // Phase B: a stage 6×4 at the hall's south, a flight on its front (−y, toward the tables), a
    // banquette on its back, a barrier on its +x side; a vase perched on the banquette.
    {
      id: "p-stage",
      variantId: "deck-244x122",
      layer: "floor",
      quantity: 1,
      position: { x: 10000, y: 9500 },
      rotation: 0,
      scale: 1,
      stage: {
        outline: [
          { x: -3000, y: -2000 },
          { x: 3000, y: -2000 },
          { x: 3000, y: 2000 },
          { x: -3000, y: 2000 },
        ],
        front: 0,
        decks: ["deck-244x122"],
        heightMm: 600,
        stairs: [
          { id: "flight-1", kind: "stairs", edge: 0, t: 0.5, widthMm: 1000 },
          { id: "bench-1", kind: "bench", edge: 2, t: 0.5, widthMm: 3000 },
          { id: "barrier-1", kind: "barrier", edge: 1, t: 0.5, widthMm: 4000, full: true },
        ],
        stairsVariant: "stage-stairs",
        skirtVariant: "v-skirt-black",
        benchVariant: "stage-bench",
      },
    },
    { id: "p-perched-vase", variantId: "vase", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, perch: { stageId: "p-stage", itemId: "bench-1" } },
    { id: "p-bar", variantId: "bar-straight", layer: "floor", quantity: 1, position: { x: 17000, y: 1500 }, rotation: 0, scale: 1 },
    { id: "p-sofa", variantId: "sofa", layer: "floor", quantity: 1, position: { x: 2000, y: 10000 }, rotation: 90, scale: 1 },
    { id: "p-rug", variantId: "v-rug-plum", layer: "floor", quantity: 1, position: { x: 2500, y: 2500 }, rotation: 0, scale: 1, sizeMm: { widthMm: 3000, depthMm: 2000 } },
    { id: "p-rows", variantId: "v-chair-ivory", layer: "floor", quantity: 10, position: { x: 25000, y: 9500 }, rotation: 0, scale: 1, rows: { rows: 2, perRow: 5 } },
    { id: "p-chuppah", variantId: "v-chuppah-cream", layer: "floor", quantity: 1, position: { x: 25000, y: 6000 }, rotation: 0, scale: 1 },
    { id: "p-chandelier", variantId: "v-chand-gold", layer: "ceiling", quantity: 1, position: { x: 5000, y: 5000 }, rotation: 0, scale: 1, over: "t1" },
    { id: "p-curtain", variantId: "v-curtain-ivory", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, span: { wallId: "w-left", from: 0.2, to: 0.6 } },
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
  // Phase B: the terrace's tree, a palm, a pool and the venue's own chair rows.
  features: [
    { id: "f-tree", kind: "plant", label: "עץ", x: 21500, y: 10500, widthMm: 3500, depthMm: 3500, heightMm: 4000, shape: "circle", rotationDeg: 0, plant: "tree" },
    { id: "f-palm", kind: "plant", label: "דקל", x: 28500, y: 1500, widthMm: 4500, depthMm: 4500, heightMm: 6000, shape: "circle", rotationDeg: 0, plant: "palm" },
    { id: "f-pool", kind: "pool", label: "בריכה", x: 24000, y: 2500, widthMm: 6000, depthMm: 2500, heightMm: 0, shape: "ellipse", rotationDeg: 0 },
    { id: "f-seating", kind: "seating", label: "שורות כיסאות", x: 28000, y: 6000, widthMm: 2000, depthMm: 1500, heightMm: 900, shape: "rect", rotationDeg: 0, seating: { rows: 3, perRow: 4, chairStyle: "dining", chairWidthMm: 450, chairDepthMm: 500 } },
  ],
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
