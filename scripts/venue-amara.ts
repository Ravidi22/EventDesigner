// Draw the "אמרה" property into a studio: the two halls, the courtyard around them, the קוליסאום
// and its pools, the paving and the planting.
//
//   npx tsx scripts/venue-amara.ts <org-uuid>            → create the venue
//   npx tsx scripts/venue-amara.ts <org-uuid> --force    → redraw it, OVERWRITING edits made in /halls
//   npx tsx scripts/venue-amara.ts --preview <file.svg>  → no database; write the drawing as an SVG
//
// WHERE THE NUMBERS COME FROM. Two sources, and they are not equally good:
//   - MEASURED: the walls of both halls, their doors and stages, the central pool and the property
//     line. These are a tape-measured plan of the same property and are entered here as millimetres.
//   - TRACED: everything else — planting, the small pools, the paving and the beds — read off the
//     site rendering in pixels and scaled by the halls, which appear in both. Good to about a metre.
//     `px()` marks every traced number, so the two are never confused.
//
// It writes the tables directly rather than through lib/venues/actions.ts, for the same reason the
// seed does: those carry an authorization check for a request that, out here, does not exist.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { EdgeCurve, Point } from "@/lib/studio/hall";
import { outlineBounds, sampleEdgePoints } from "@/lib/studio/geometry";
import { detectFaces, faceAt } from "@/lib/venues/faces";
import {
  featureFootprint,
  type PlantSpecies,
  type StructureEntrance,
  type StructureFeature,
  type SurfaceMaterial,
  type VenueStructure,
  type Wall,
  type WallKind,
} from "@/lib/venues/structure";
import type { Zone } from "@/lib/venues/zone";

const VENUE_NAME = "אמרה";

// Ids are derived, not random: a redraw keeps every zone id (events book zones by id) and every
// plant keeps the crown its id seeds.
function uid(key: string): string {
  const h = createHash("md5").update(`venue-amara:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const VENUE_ID = uid("venue");

// The rendering is 572×773px. Both halls are in it AND measured, which fixes the scale (212mm to
// the pixel) and the offset: the small hall's top-left corner is pixel (148,160) and (-4996,-2500)mm.
const MM_PER_PX = 212;
function px(x: number, y: number): Point {
  return { x: Math.round((x - 148) * MM_PER_PX - 4996), y: Math.round((y - 160) * MM_PER_PX - 2500) };
}

// ── The wall graph ─────────────────────────────────────────────────────────────────────────────

const N: Record<string, Point> = {
  // אולם קטן — 26.6 × 32m, its south-east corner rounded off.
  s0: { x: -4996, y: -2500 },
  sVoid: { x: -4996, y: 14500 }, // where the service building's north face meets the hall
  s1: { x: -4996, y: 29500 },
  s2: { x: 15804, y: 29450 },
  s3: { x: 21600, y: 13349 },
  s4: { x: 21600, y: -2500 },
  // אולם גדול — 37 × 36.5m, its north-east corner cut at 45°.
  g5: { x: -7000, y: 49500 },
  gRoad: { x: -7000, y: 60900 }, // where the service road's kerb meets the hall
  g6: { x: -7000, y: 86000 },
  g7: { x: 30000, y: 86000 },
  g8: { x: 30000, y: 57500 },
  g9: { x: 22000, y: 49500 },
  // The property line, clockwise from the north-west corner.
  pA: { x: -32500, y: -26000 },
  pB: { x: -13700, y: -26000 },
  pC: { x: -2244, y: -27002 },
  pD: { x: 21600, y: -24916 },
  pE: { x: 49992, y: -22432 },
  pF: { x: 69478, y: -11182 },
  pG: { x: 80000, y: 8166 },
  pH: { x: 80000, y: 120500 },
  pI: { x: -14765, y: 120500 },
  pJ: { x: -14765, y: 60154 },
  pK: { x: -23000, y: 53000 },
  pL: { x: -23000, y: 45000 },
  pM: { x: -32500, y: 45000 },
  pN: { x: -32500, y: 14500 },
  pR: { x: -13700, y: 60900 },
  // The service building's curved east face, between the two halls.
  vS: { x: 18304, y: 28000 },
  vT: { x: 19132, y: 37464 },
  vU: { x: 23200, y: 46400 },
  vV: { x: 21200, y: 47300 },
  vW: { x: 22871, y: 49292 },
};

type WallSpec = [a: string, b: string, kind: WallKind, curve?: EdgeCurve];

const WALLS: WallSpec[] = [
  ["s0", "sVoid", "wall"],
  ["sVoid", "s1", "wall"],
  ["s1", "s2", "wall"],
  ["s2", "s3", "wall", { c1: { x: 760, y: -7142 }, c2: { x: -3106, y: 3592 } }],
  ["s3", "s4", "wall"],
  ["s4", "s0", "wall"],

  ["g5", "gRoad", "wall"],
  ["gRoad", "g6", "wall"],
  ["g6", "g7", "wall"],
  ["g7", "g8", "wall"],
  ["g8", "g9", "wall"],
  ["g9", "g5", "wall"],

  ["pA", "pB", "edge"],
  ["pB", "pC", "edge"],
  ["pC", "pD", "edge"],
  ["pD", "pE", "edge"],
  ["pE", "pF", "edge", { c1: { x: 9214, y: 1555 }, c2: { x: -3777, y: -5945 } }],
  ["pF", "pG", "edge", { c1: { x: 5179, y: 5831 }, c2: { x: -835, y: -7068 } }],
  ["pG", "pH", "edge"],
  ["pH", "pI", "edge"],
  ["pI", "pJ", "edge"],
  ["pJ", "pK", "edge"],
  ["pK", "pL", "edge"],
  ["pL", "pM", "edge"],
  ["pM", "pN", "edge"],
  ["pN", "pA", "edge"],
  // The three runs that tie the halls to the property line. With them the graph closes four
  // regions — each hall, the service building between them, and the courtyard — instead of two
  // rooms floating inside an outline.
  ["pN", "sVoid", "edge"],
  ["pJ", "pR", "edge"],
  ["pR", "gRoad", "edge"],
  ["s2", "vS", "edge"],
  ["vS", "vT", "edge", { c1: { x: -173, y: 3222 }, c2: { x: -725, y: -3087 } }],
  ["vT", "vU", "edge", { c1: { x: 940, y: 3320 }, c2: { x: -1772, y: -2637 } }],
  ["vU", "vV", "edge"],
  ["vV", "vW", "edge"],
  ["vW", "g9", "edge"],
];

const wallId = (a: string, b: string) => uid(`wall:${a}>${b}`);

// Doors, by the wall they hang on and how far along it from its first node. All double, opening out.
const DOORS: [a: string, b: string, distanceMm: number, widthMm: number][] = [
  ["s3", "s4", 9665, 2400],
  ["s0", "sVoid", 3410, 2400],
  ["sVoid", "s1", 6773, 3000],
  ["s4", "s0", 13428, 2400],
  ["g7", "g8", 14250, 2400],
  ["g5", "gRoad", 2637, 3000],
  ["g6", "g7", 18500, 2400],
  ["g9", "g5", 5155, 2400],
];

/** A run of wall nodes as a polyline, following every bow on the way. */
function trace(...keys: string[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < keys.length; i++) {
    out.push(N[keys[i]]);
    if (i === keys.length - 1) break;
    const spec = WALLS.find(([a, b]) => (a === keys[i] && b === keys[i + 1]) || (b === keys[i] && a === keys[i + 1]));
    if (!spec?.[3]) continue;
    const along = sampleEdgePoints(N[spec[0]], N[spec[1]], spec[3]);
    out.push(...(spec[0] === keys[i] ? along : along.reverse()));
  }
  return out;
}

// ── Features ───────────────────────────────────────────────────────────────────────────────────

const features: StructureFeature[] = [];
let serial = 0;

function add(f: Omit<StructureFeature, "id">): void {
  features.push({ ...f, id: uid(`feature:${serial++}`) });
}

/** A feature in the shape of an arbitrary polygon, given in plan millimetres. */
function polygon(
  kind: StructureFeature["kind"],
  label: string,
  points: Point[],
  extra: Partial<StructureFeature> = {},
): void {
  const b = outlineBounds(points);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  add({
    kind,
    label,
    x: Math.round(cx),
    y: Math.round(cy),
    widthMm: Math.round(b.widthMm),
    depthMm: Math.round(b.heightMm),
    heightMm: 0,
    shape: "custom",
    outline: points.map((p) => ({ x: Math.round(p.x - cx), y: Math.round(p.y - cy) })),
    rotationDeg: 0,
    ...extra,
  });
}

function surface(label: string, material: SurfaceMaterial, points: Point[], fill?: string): void {
  polygon("surface", label, points, { surface: material, ...(fill ? { style: { fill } } : {}) });
}

function round(
  kind: StructureFeature["kind"],
  label: string,
  at: Point,
  diameterMm: number,
  extra: Partial<StructureFeature> = {},
): void {
  add({ kind, label, x: at.x, y: at.y, widthMm: diameterMm, depthMm: diameterMm, heightMm: 0, shape: "circle", rotationDeg: 0, ...extra });
}

const PLANT_LABEL: Record<PlantSpecies, string> = { palm: "דקל", tree: "עץ", shrub: "שיח", pot: "עציץ", hedge: "גדר חיה", flowers: "ערוגת פרחים" };
const PLANT_HEIGHT: Record<PlantSpecies, number> = { palm: 6000, tree: 4000, shrub: 1000, pot: 900, hedge: 1200, flowers: 400 };

function plants(species: PlantSpecies, diameterMm: number, at: [number, number][]): void {
  for (const [x, y] of at) {
    // Each crown turned by its own position, so a row of palms is not one palm repeated.
    const turn = species === "palm" || species === "tree" ? (x * 37 + y * 53) % 360 : 0;
    round("plant", PLANT_LABEL[species], px(x, y), diameterMm, { plant: species, heightMm: PLANT_HEIGHT[species], rotationDeg: turn });
  }
}

// The void's boundary, walked from the service road up to the property line's west side. Both big
// ground polygons run along it, so the building between the halls stays undrawn under both.
const AROUND_SERVICE_BUILDING = trace("gRoad", "g5", "g9", "vW", "vV", "vU", "vT", "vS", "s2", "s1", "sVoid", "pN");

// 1 — The ground, bottom layer first. Surfaces draw beneath everything else, in this order.

// The road wrapping the property, and the parking and service road inside its line.
surface("כביש וחניה", "gravel", [
  px(18, 8), px(300, 18), px(400, 28), px(450, 45), px(490, 75), px(520, 115), px(545, 170), px(560, 230), px(570, 300),
  px(572, 330), px(572, 770), px(102, 770),
  ...trace("pI", "pJ", "pR"),
  ...AROUND_SERVICE_BUILDING,
  px(18, 240),
], "#8b867f");

// The paved courtyard, running under both halls (their own floors are laid over it below).
surface("ריצוף הרחבה", "paving", [
  ...trace("pA", "pB", "pC", "pD", "pE", "pF", "pG"),
  px(549, 740), px(312, 740), px(312, 702), px(150, 702), px(150, 578),
  N.g6,
  ...AROUND_SERVICE_BUILDING,
], "#cfcecb");

// Planting beds.
const BED = "#8a5f42";
surface("ערוגה צפונית", "soil", [
  px(30, 57), px(200, 55), px(330, 62), px(400, 72), px(450, 92), px(485, 125), px(510, 165), px(525, 205), px(530, 240),
  px(508, 240), px(500, 205), px(487, 172), px(465, 140), px(435, 112), px(395, 95), px(330, 84), px(200, 80), px(42, 80),
], BED);
surface("ערוגה מערבית", "soil", [px(19, 80), px(42, 80), px(42, 240), px(19, 240)], BED);
surface("ערוגה מזרחית", "soil", [px(508, 270), px(536, 270), px(536, 702), px(508, 702)], BED);
surface("ערוגה מזרחית פנימית", "soil", [px(492, 440), px(508, 440), px(508, 582), px(492, 582)], BED);
surface("ערוגה דרומית", "soil", [px(312, 702), px(536, 702), px(536, 740), px(312, 740)], BED);
surface("ערוגת החניה", "soil", [px(138, 590), px(152, 590), px(152, 680), px(312, 680), px(312, 704), px(138, 704)], BED);

// The קוליסאום: an oval court around the big pool, ringed by eight pools.
const COLOSSEUM = { x: 44200, y: 31000, rx: 17000, ry: 20300 };
function onColosseum(deg: number, factor: number): Point {
  const t = (deg * Math.PI) / 180;
  return { x: COLOSSEUM.x + Math.cos(t) * COLOSSEUM.rx * factor, y: COLOSSEUM.y + Math.sin(t) * COLOSSEUM.ry * factor };
}
function arc(from: number, to: number, factor: number, stepDeg = 4): Point[] {
  const out: Point[] = [];
  const n = Math.max(1, Math.round(Math.abs(to - from) / stepDeg));
  for (let i = 0; i <= n; i++) out.push(onColosseum(from + ((to - from) * i) / n, factor));
  return out;
}
const COLOSSEUM_RIM = arc(0, 352.5, 1, 7.5);
surface("רחבת הקוליסאום", "paving", COLOSSEUM_RIM, "#a9a6a2");

// Two round paved features on the courtyard's edge.
round("surface", "רחבה עגולה", px(60, 97), 7800, { surface: "paving", style: { fill: "#a9a6a2" } });
round("surface", "רחבה עגולה", px(414, 698), 8500, { surface: "paving", style: { fill: "#a9a6a2" } });

// The halls' own floors.
const HALL_FLOOR = "#000000";
surface("רצפת אולם קטן", "tile", trace("s0", "sVoid", "s1", "s2", "s3", "s4"), HALL_FLOOR);
surface("רצפת אולם גדול", "tile", trace("g5", "gRoad", "g6", "g7", "g8", "g9"), HALL_FLOOR);

// 2 — Water.
const WATER = { fill: "#90cce0" };
add({ kind: "pool", label: "בריכה", x: 44515, y: 31257, widthMm: 18863, depthMm: 11241, heightMm: 0, shape: "ellipse", rotationDeg: 75, style: WATER });
for (let k = 0; k < 8; k++) {
  const mid = -90 + k * 45;
  polygon("pool", "בריכת קוליסאום", [...arc(mid - 16, mid + 16, 0.97), ...arc(mid + 16, mid - 16, 0.79)], { style: WATER });
}
round("pool", "מזרקה", px(211, 100), 6400, { style: WATER });
round("pool", "מזרקה", px(413, 566), 6000, { style: WATER });

// 3 — Stages (measured).
add({ kind: "stage", label: "במה", x: 6139, y: 27161, widthMm: 10140, depthMm: 4134, heightMm: 600, shape: "rect", rotationDeg: 0 });
add({ kind: "stage", label: "במה", x: -3051, y: 67289, widthMm: 12147, depthMm: 6460, heightMm: 600, shape: "rect", rotationDeg: 270 });

// 4 — Planting. Trees first, so the palms that stand over them draw over them.

// The tree line down the east side, and the shrubs in the bed in front of it.
plants("tree", 5800, Array.from({ length: 17 }, (_, i): [number, number] => [522 + (i % 2 ? 2 : -2), 285 + i * 26]));
plants("shrub", 3400, [[500, 450], [503, 480], [500, 512], [504, 545], [500, 575]]);
// Between the palms of the north row and round the north-east bend.
plants("tree", 4600, [[82, 63], [127, 75], [178, 57], [230, 72], [278, 62], [326, 68], [374, 72], [471, 120], [499, 157], [486, 183], [496, 207]]);
// The west side.
plants("tree", 6500, [[57, 127]]);
plants("tree", 4200, [[18, 88], [20, 187], [23, 230]]);
// The south beds.
plants("tree", 4800, [[208, 691], [257, 691], [316, 678], [348, 699], [389, 713], [453, 713], [483, 713]]);
// Round the קוליסאום.
plants("tree", 4200, [[404, 208], [441, 243], [473, 343], [459, 386], [353, 423], [316, 387], [283, 290]]);
// Free-standing trees in planters on the paving.
plants("tree", 3800, [[158, 103], [334, 108], [406, 152], [459, 456], [366, 579], [288, 629], [498, 591], [489, 679]]);

// Palms: the north row and its bend, the west side, the parking corner and the south row.
plants("palm", 8000, [
  [22, 67], [55, 60], [105, 68], [152, 63], [203, 63], [257, 67], [298, 73], [354, 73], [399, 83], [454, 100], [489, 137], [513, 177], [523, 220],
  [23, 112], [25, 157], [23, 208],
  [143, 609], [145, 649], [143, 686],
  [182, 688], [233, 691], [282, 694], [321, 699], [348, 729], [394, 733], [434, 729], [476, 729], [516, 733],
]);
// …and the ring of them round the קוליסאום.
plants("palm", 7000, [[319, 227], [381, 207], [423, 227], [456, 257], [469, 317], [466, 363], [436, 406], [376, 423], [338, 399], [306, 373], [289, 310], [289, 267]]);

// Pots along the halls' outer walls.
plants("pot", 1500, [
  [152, 153], [172, 153], [197, 153], [223, 153], [249, 153],
  [278, 162], [278, 183], [278, 210], [278, 235], [263, 263], [253, 293],
  [178, 583], [207, 583], [239, 583], [269, 583], [309, 583],
  [321, 448], [321, 473], [321, 496], [321, 521], [321, 548], [321, 576],
]);
plants("shrub", 2000, [[263, 333], [272, 367], [280, 402]]);
// The flower beds: along the big hall's cut corner, and beside the small hall's west door.
add({ kind: "plant", label: PLANT_LABEL.flowers, ...px(302, 420), widthMm: 9500, depthMm: 1200, heightMm: 400, shape: "rect", rotationDeg: 45, plant: "flowers" });
add({ kind: "plant", label: PLANT_LABEL.flowers, ...px(143, 215), widthMm: 6000, depthMm: 1000, heightMm: 400, shape: "rect", rotationDeg: 90, plant: "flowers" });

// 5 — The חופה: a round stage at the south end of the courtyard, and the runway that reaches it
// across a pool. Every size here was given by the designer; WHERE it stands was not, and is read
// off the rendering — on the round paved feature in the south bed, the runway heading north.
//
// The runway's own width was not given either. It is derived: the steps at its far end span the
// runway plus the 2m of water either side, and they are 6.6m across, which leaves 2.6m.
{
  const AXIS_X = 51396;
  const STAGE_Y = 111556;
  const DECK_MM = 680; // four risers of 17cm, and the runway is level with the stage
  const RUNWAY_END = STAGE_Y - 3250; // where the runway meets the stage's rim
  const RUNWAY_START = RUNWAY_END - 14000;
  const TIMBER = "#a9774b"; // the deck material's own colour (components/surface-fill.tsx)
  const keyed = (key: string, f: Omit<StructureFeature, "id">) => features.push({ ...f, id: uid(`feature:chuppah-${key}`) });

  keyed("pool", { kind: "pool", label: "בריכת המסלול", x: AXIS_X, y: (RUNWAY_START + RUNWAY_END) / 2, widthMm: 6600, depthMm: 14000, heightMm: 0, shape: "rect", rotationDeg: 0, style: WATER });
  keyed("runway", { kind: "stage", label: "מסלול במה", x: AXIS_X, y: (RUNWAY_START + RUNWAY_END) / 2, widthMm: 2600, depthMm: 14000, heightMm: DECK_MM, shape: "rect", rotationDeg: 0 });
  // The steps up onto the runway: 6.6m across and 4m deep in all. A flight is never wider than the
  // deck it hangs off, and these are wider than the runway — so they hang off a 1m landing of their
  // own width at the runway's head, and the three 1m treads below it make up the other 3m.
  keyed("steps", {
    kind: "stage", label: "ראש המסלול", x: AXIS_X, y: RUNWAY_START - 500, widthMm: 6600, depthMm: 1000, heightMm: DECK_MM, shape: "rect", rotationDeg: 0, style: { fill: TIMBER },
    stairs: { side: "back", steps: 4, treadMm: 1000, widthMm: 6600, offsetMm: 0, fill: TIMBER },
  });
  keyed("stage", {
    kind: "stage", label: "במת חופה", x: AXIS_X, y: STAGE_Y, widthMm: 6500, depthMm: 6500, heightMm: DECK_MM, shape: "circle", rotationDeg: 0,
    stairs: { side: "right", steps: 4, treadMm: 300, widthMm: 1500, offsetMm: 0, bothSides: true, fill: TIMBER },
  });
}

// 6 — The second חופה, outside the small hall: north-east of it, backed onto the north bed, the
// runway heading south toward the קוליסאום. Sizes are the designer's; the spot is read off a crop of
// the plan they marked. The stage is 6m across — the pool is "as wide as the חופה" — and 4m deep.
{
  const AXIS_X = 41000;
  const STAGE_TOP = -16500; // 0.8m clear of the bed behind it
  const DECK_MM = 510; // three risers of 17cm
  const TIMBER = "#a9774b";
  const RUNWAY_START = STAGE_TOP + 4000;
  const RUNWAY_END = RUNWAY_START + 12000;
  const keyed = (key: string, f: Omit<StructureFeature, "id">) => features.push({ ...f, id: uid(`feature:chuppah2-${key}`) });

  keyed("pool", { kind: "pool", label: "בריכת המסלול", x: AXIS_X, y: (RUNWAY_START + RUNWAY_END) / 2, widthMm: 6000, depthMm: 12000, heightMm: 0, shape: "rect", rotationDeg: 0, style: WATER });
  keyed("runway", { kind: "stage", label: "מסלול במה", x: AXIS_X, y: (RUNWAY_START + RUNWAY_END) / 2, widthMm: 2200, depthMm: 12000, heightMm: DECK_MM, shape: "rect", rotationDeg: 0 });
  keyed("stage", {
    kind: "stage", label: "במת חופה", x: AXIS_X, y: STAGE_TOP + 2000, widthMm: 6000, depthMm: 4000, heightMm: DECK_MM, shape: "rect", rotationDeg: 0,
    stairs: { side: "right", steps: 3, treadMm: 300, widthMm: 1500, offsetMm: 0, bothSides: true, fill: TIMBER },
  });
  // The steps at the runway's foot, as the designer sketched them: three nested blocks that all
  // start at the pool's edge. The top one is exactly the runway's width; each one below it is a
  // tread wider on either side and a tread longer in front, so the flight is climbed from the front
  // or from either side. A flight is one width top to bottom, so each tier is a deck of its own —
  // widest and lowest first, so each narrower one draws on top of it.
  const TREAD = 600;
  [2, 1, 0].forEach((out, i) => {
    keyed(`step-${i}`, {
      kind: "stage", label: i === 0 ? "מדרגות המסלול" : "", x: AXIS_X, y: RUNWAY_END + ((out + 1) * TREAD) / 2,
      widthMm: 2200 + out * 2 * TREAD, depthMm: (out + 1) * TREAD, heightMm: Math.round((DECK_MM * (i + 1)) / 3), shape: "rect", rotationDeg: 0, style: { fill: TIMBER },
    });
  });
}

// ── Assemble ───────────────────────────────────────────────────────────────────────────────────

const nodeId = (key: string) => uid(`node:${key}`);

const structure: VenueStructure = {
  nodes: Object.entries(N).map(([key, p]) => ({ id: nodeId(key), x: p.x, y: p.y })),
  walls: WALLS.map(([a, b, kind, curve]): Wall => ({ id: wallId(a, b), a: nodeId(a), b: nodeId(b), kind, ...(curve ? { curve } : {}) })),
  entrances: DOORS.map(([a, b, distanceMm, widthMm], i): StructureEntrance => ({
    id: uid(`door:${i}`),
    wallId: wallId(a, b),
    distanceMm,
    widthMm,
    swingInward: false,
    doubleDoor: true,
  })),
  features,
};

const CREATED = Date.UTC(2026, 9, 1);
const ZONES: Zone[] = [
  { id: uid("zone:small"), venueId: VENUE_ID, name: "אולם קטן", kind: "hall", source: { type: "face", anchor: { x: 8000, y: 10000 } }, ceilingHeightMm: 4000, createdAt: CREATED },
  { id: uid("zone:large"), venueId: VENUE_ID, name: "אולם גדול", kind: "hall", source: { type: "face", anchor: { x: 10000, y: 70000 } }, ceilingHeightMm: 4000, createdAt: CREATED + 1 },
  { id: uid("zone:court"), venueId: VENUE_ID, name: "רחבה", kind: "open", source: { type: "face", anchor: px(350, 500) }, ceilingHeightMm: 0, createdAt: CREATED + 2 },
  // Open ground with no walls round it, so it is a drawn region rather than a detected one.
  { id: uid("zone:colosseum"), venueId: VENUE_ID, name: "קוליסאום", kind: "open", source: { type: "region", boundary: COLOSSEUM_RIM.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) }, ceilingHeightMm: 0, createdAt: CREATED + 3 },
];

/** Refuses to write a drawing whose rooms did not close — a hall that is not a region cannot be
 *  booked, and that is far easier to see here than on the screen afterwards. */
function check(): void {
  const faces = detectFaces(structure);
  const area = (z: Zone) => {
    if (z.source.type !== "face") return null;
    const f = faceAt(faces, z.source.anchor);
    return f ? Math.round(f.areaMm2 / 1e6) : null;
  };
  console.log(`regions: ${faces.map((f) => `${Math.round(f.areaMm2 / 1e6)}m²`).join(", ")}`);
  for (const z of ZONES) {
    if (z.source.type !== "face") continue;
    const a = area(z);
    if (a === null) throw new Error(`zone "${z.name}" is not enclosed by the walls`);
    console.log(`  ${z.name}: ${a}m²`);
  }
  if (faces.length !== 4) throw new Error(`expected 4 regions (two halls, the service building, the courtyard), got ${faces.length}`);
  const count = (kind: string) => features.filter((f) => f.kind === kind).length;
  console.log(`features: ${count("surface")} surfaces, ${count("pool")} pools, ${count("stage")} stages, ${count("plant")} plants`);
}

// ── Preview ────────────────────────────────────────────────────────────────────────────────────

/** The drawing as flat shapes — enough to lay over the rendering and see what is out of place. */
function previewSvg(): string {
  const FILL: Record<string, string> = { pool: "#3aa0d0", stage: "#c0b060", plant: "#2f8f2f" };
  const poly = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  let body = "";
  for (const f of [...features.filter((x) => x.kind === "surface"), ...features.filter((x) => x.kind !== "surface")]) {
    const fill = f.kind === "plant" ? (f.plant === "palm" ? "#7fd04f" : FILL.plant) : (f.style?.fill ?? FILL[f.kind] ?? "#999");
    const fp = featureFootprint(f);
    const shape =
      fp.kind === "custom" ? `<polygon points="${poly(fp.outline)}"/>`
      : fp.kind === "multi" ? fp.parts.map((p) => `<polygon points="${poly(p.outline)}"/>`).join("")
      : fp.kind === "circle" ? `<circle r="${fp.diameterMm / 2}"/>`
      : fp.kind === "ellipse" ? `<ellipse rx="${fp.widthMm / 2}" ry="${fp.depthMm / 2}"/>`
      : `<rect x="${-fp.widthMm / 2}" y="${-fp.depthMm / 2}" width="${fp.widthMm}" height="${fp.depthMm}"/>`;
    body += `<g transform="translate(${f.x} ${f.y}) rotate(${f.rotationDeg})" fill="${fill}" fill-opacity="${f.kind === "plant" ? 0.75 : 1}" stroke="#222" stroke-width="80">${shape}</g>`;
  }
  for (const [a, b, kind] of WALLS) {
    body += `<polyline points="${poly(trace(a, b))}" fill="none" stroke="${kind === "wall" ? "#000" : "#d02090"}" stroke-width="${kind === "wall" ? 350 : 200}"/>`;
  }
  for (const z of ZONES) if (z.source.type === "region") body += `<polygon points="${poly(z.source.boundary)}" fill="none" stroke="#6d55bd" stroke-width="200"/>`;
  const o = px(0, 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1144" height="1546" viewBox="${o.x} ${o.y} ${572 * MM_PER_PX} ${773 * MM_PER_PX}">${body}</svg>`;
}

// ── Write ──────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  check();

  const preview = args.indexOf("--preview");
  if (preview >= 0) {
    writeFileSync(args[preview + 1], previewSvg());
    console.log(`preview written to ${args[preview + 1]} — nothing was saved`);
    return;
  }

  const organizationId = args.find((a) => !a.startsWith("--"));
  if (!organizationId) {
    console.error("usage: npx tsx scripts/venue-amara.ts <org-uuid> [--force]");
    process.exit(1);
  }

  // Imported here so --preview needs no database.
  const { db } = await import("@/lib/db");
  const { organizations, venues, venueStructures, zones } = await import("@/lib/db/schema");
  const { emptyPlan } = await import("@/lib/venues/types");
  const { toStructureRow, toVenueRow, toZoneRow } = await import("@/lib/venues/db-mapping");
  const database = db();

  const [org] = await database.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId));
  if (!org) {
    console.error(`no organisation with id ${organizationId}`);
    process.exit(1);
  }
  const [existing] = await database.select({ organizationId: venues.organizationId }).from(venues).where(eq(venues.id, VENUE_ID));
  if (existing && existing.organizationId !== organizationId) {
    console.error("this venue already exists in another studio");
    process.exit(1);
  }
  if (existing && !args.includes("--force")) {
    console.error(`"${VENUE_NAME}" already exists in ${org.name}. --force redraws it and overwrites any edits made in /halls.`);
    process.exit(1);
  }

  await database.transaction(async (tx) => {
    await tx
      .insert(venues)
      .values(toVenueRow({ id: VENUE_ID, name: VENUE_NAME, plan: emptyPlan() }, organizationId))
      .onConflictDoNothing();
    const row = toStructureRow(VENUE_ID, structure, organizationId);
    await tx
      .insert(venueStructures)
      .values(row)
      .onConflictDoUpdate({ target: venueStructures.venueId, set: { structure: row.structure, updatedAt: row.updatedAt } });
    for (const z of ZONES) {
      const zr = toZoneRow(z, organizationId);
      await tx
        .insert(zones)
        .values(zr)
        .onConflictDoUpdate({ target: zones.id, set: { name: zr.name, kind: zr.kind, source: zr.source, ceilingHeightMm: zr.ceilingHeightMm } });
    }
  });

  console.log(`${existing ? "redrew" : "created"} "${VENUE_NAME}" in ${org.name} — venue ${VENUE_ID}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("venue-amara failed:", err);
    process.exit(1);
  });
