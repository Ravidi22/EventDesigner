// A dressed table as bodies: the top on its legs, the cloth falling to the floor, the ring of chairs
// round it (or round the BLOCK it is part of), and what stands on it — spec §3.2–§3.3.
//
// Nothing here measures anything of its own. The footprint is `tableFootprint` (stretched as the
// plan stretched it), the chairs are `seatsAround`/`blockSeats` in the table's or the block's frame,
// the dressing stands at `dressingSpots(…).at` laid by `dressBlockOf` — the exact functions the
// studio canvas and the printed map draw with, so the room in 3D is the plan lifted, never a cousin
// of it. What this file adds is the HEIGHT: a leg rule by shape (no row stores legs), the cloth's
// fall (DECIDE 2: always to the floor), a chair's style and size from the table's chair row, and the
// top face every item on the table stands on.
//
// `itemContextOf` is the one seam from a placement to an item builder's context (./items.ts). The
// floor and ceiling placements in ./build.ts go through it too, so a candlestick on a table and a
// candlestick on the floor resolve their colour, count, style and flowers by one rule — the canvas's
// `own` (canvas-stage.tsx:3924): the shade's swatch, else the row's fill, else the kind's tone.
//
// Pure: no DOM, no React rendering, no three, no prices. Self-checked: `npx tsx lib/scene/tables.ts`.
import type { Point } from "@/lib/studio/hall";
import type { Product } from "@/lib/catalog/types";
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { type BuiltOutline, type Footprint, catalogBox, flattenEdge, footprintBounds, footprintOutlines, resolveFootprint } from "@/lib/studio/footprint";
import { polygonCentroid } from "@/lib/studio/geometry";
import { CHAIR_D_MM, CHAIR_W_MM, seatsAround, type Seat } from "@/lib/studio/seating";
import { benchOf, coverOn, resolve, type Resolved } from "@/lib/studio/catalog-resolver";
import { blockSeats, type BlockFrame } from "@/lib/design-document/block";
import { groupSeats } from "@/lib/design-document/groups";
import { standaloneBench } from "@/lib/design-document/bench";
import { climbRise } from "@/lib/studio/climb-item";
import { chairOf } from "@/lib/catalog/chairs";
import { CLOTH_DROP_MM, chairStyleOf, drawStyleOf, symbolCount, symbolOf, type ChairStyle } from "@/lib/catalog/symbols";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { vesselOf } from "@/lib/catalog/vessel";
import { type DressingSpot, dressBlockOf, dressingSpots, placementFootprint, tableBlock, tableBlockedSides, tableFootprint } from "@/components/footprint-shape";
import { DEFAULT_TONE } from "@/components/item-symbol";
import { primeCatalog } from "@/lib/catalog/storage";
import { isMain } from "../self-check";
import { placeSettings, type Keepout, type SettingSeat } from "./tableware";
import { SceneCollector } from "./collect";
import { applyTransform, roomTransform, seatTransform } from "./frame";
import { chairRequest, itemBody, type ItemContext } from "./items";
import { clothMaterial, hexOf, swatchMaterial } from "./materials";
import { type BodyNode, type LabelNode, type NodeTag, type Part, type SceneInput, type Transform, transform, vec3 } from "./types";

// --- the rules, as numbers ------------------------------------------------------------------------

/** The top's thickness. */
export const TABLE_TOP_MM = 30;
/** A table whose row has no height (lib/catalog/categories.ts `tables` defaultHeightMm). */
export const DEFAULT_TABLE_HEIGHT_MM = 750;
/** A chair whose row has no height: the back's top. */
export const DEFAULT_CHAIR_HEIGHT_MM = 900;
/** The cloth's hem: how far past the rim the fabric falls, and how tall the hem band is. */
export const CLOTH_HEM_MM = 10;
/** A cloth's folds: one every this many mm along the rim, this deep at the hem, the hem flaring out. */
export const CLOTH_FOLD_PITCH_MM = 260;
export const CLOTH_FOLD_DEPTH_MM = 34;
export const CLOTH_FLARE_MM = 45;
/** The fabric's own thickness — what a covered top is shortened by, so its face and the cloth's
 *  never coincide (two faces at one height flicker in any renderer). */
export const CLOTH_THICK_MM = 2;
/** A long table's leg: square, this wide, its outer faces this far in from the box's corner. */
export const LEG_MM = 60;
export const LEG_INSET_MM = 80;
/** A pedestal's radius and its foot's, as a share of the top's smaller side; the foot's height. */
export const PEDESTAL_SHARE = 0.06;
export const FOOT_SHARE = 0.13;
export const FOOT_MM = 30;
/** A rectangle whose sides differ by less than this share of the longer is square: a pedestal. */
export const SQUARE_TOLERANCE = 0.1;
/** An arrangement in a vessel stands at this share of the vessel's height (DECIDE 7). */
export const VASE_RIM_SHARE = 0.9;
/** An author label floats this far above the top. */
export const LABEL_ABOVE_MM = 400;
/** A bare table with no shade and no fill: timber. */
export const BARE_TABLE_TONE = "#b98a5e";
/** A cloth whose variant has no swatch: the plan's lavender-white. */
export const BARE_CLOTH_TONE = "#efeafb";
/** An item with no picture and no colour: the plan draws its outline canvas-white. */
export const NO_PICTURE_TONE = "#ffffff";

const NONE: readonly Placement[] = [];

// --- outlines -------------------------------------------------------------------------------------

/** A piece's outline as a flat polygon — its bezier edges sampled — with doubled points dropped. */
export function flatOutline(piece: BuiltOutline): Point[] {
  const pts = piece.outline;
  const n = pts.length;
  const out: Point[] = [];
  const push = (p: Point) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-6) out.push(p);
  };
  for (let i = 0; i < n; i++) {
    const run = flattenEdge(pts[i], pts[(i + 1) % n], piece.edgeCurves?.[i]);
    // Every point but the last — that is the next edge's first.
    for (let k = 0; k < run.length - 1; k++) push(run[k]);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && Math.hypot(last.x - first.x, last.y - first.y) <= 1e-6) out.pop();
  return out;
}

function signedArea(poly: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function polySize(poly: readonly Point[]): { w: number; h: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { w: maxX - minX, h: maxY - minY };
}

/**
 * The outline grown outward by `byMm`, for every shape: each edge pushed out along its normal,
 * every convex corner joined by an arc (a point every `stepDeg`) and every concave one by its mitre —
 * the round-joined stroke `ClothDrape` draws the cloth with on the plan (components/item-symbol.tsx),
 * as points. Curved edges are sampled first, so a round-ended table's cloth follows its ends.
 */
export function offsetOutline(piece: BuiltOutline, byMm: number, stepDeg = 15): Point[] {
  const poly = flatOutline(piece);
  const n = poly.length;
  if (n < 3 || byMm <= 0) return poly;
  // Which side is out: the outward normal of an edge (dx, dy) is (dy, −dx) when the polygon winds
  // positively by the shoelace sign, (−dy, dx) otherwise — the same arithmetic in either y direction.
  const sgn = signedArea(poly) >= 0 ? 1 : -1;
  const unit = (a: Point, b: Point): Point => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const v = poly[i];
    const d1 = unit(poly[(i - 1 + n) % n], v);
    const d2 = unit(v, poly[(i + 1) % n]);
    const n1 = { x: sgn * d1.y, y: -sgn * d1.x };
    const n2 = { x: sgn * d2.y, y: -sgn * d2.x };
    const cross = d1.x * d2.y - d1.y * d2.x;
    if (sgn * cross > 1e-9) {
      // Convex: an arc from n1 round to n2 about the corner.
      const a1 = Math.atan2(n1.y, n1.x);
      const delta = Math.atan2(n1.x * n2.y - n1.y * n2.x, n1.x * n2.x + n1.y * n2.y);
      const steps = Math.max(1, Math.ceil(Math.abs(delta) / ((stepDeg * Math.PI) / 180)));
      for (let k = 0; k <= steps; k++) {
        const a = a1 + (delta * k) / steps;
        out.push({ x: v.x + byMm * Math.cos(a), y: v.y + byMm * Math.sin(a) });
      }
    } else {
      // Straight on, or concave: the two offset lines meet at the mitre, (n1 + n2) / (1 + n1·n2).
      const dot = n1.x * n2.x + n1.y * n2.y;
      if (1 + dot > 0.1) {
        out.push({ x: v.x + (byMm * (n1.x + n2.x)) / (1 + dot), y: v.y + (byMm * (n1.y + n2.y)) / (1 + dot) });
      } else {
        out.push({ x: v.x + byMm * n1.x, y: v.y + byMm * n1.y });
        out.push({ x: v.x + byMm * n2.x, y: v.y + byMm * n2.y });
      }
    }
  }
  return out;
}

// --- the top and its legs -------------------------------------------------------------------------

/** A pedestal under (cx, cy): the column to `toZ` and its foot disc, sized by `sizeMm` (the top's
 *  smaller side). */
function pedestal(cx: number, cy: number, sizeMm: number, toZ: number): Part[] {
  const r = sizeMm * PEDESTAL_SHARE;
  const foot = sizeMm * FOOT_SHARE;
  return [
    { shape: "cylinder", rTop: r, rBottom: r, h: Math.max(1, toZ), at: vec3(cx, cy, 0), segments: 24 },
    { shape: "cylinder", rTop: foot, rBottom: foot, h: FOOT_MM, at: vec3(cx, cy, 0), segments: 32 },
  ];
}

/** Four square legs inset from the corners of a w × d box, to `toZ`. */
function fourLegs(w: number, d: number, toZ: number): Part[] {
  const lx = Math.max(LEG_MM / 2, w / 2 - LEG_INSET_MM - LEG_MM / 2);
  const ly = Math.max(LEG_MM / 2, d / 2 - LEG_INSET_MM - LEG_MM / 2);
  const parts: Part[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) parts.push({ shape: "box", w: LEG_MM, d: LEG_MM, h: Math.max(1, toZ), at: vec3(sx * lx, sy * ly, 0) });
  return parts;
}

/** The legs under a footprint, up to the top's underside at `toZ` — a rule by shape, since no row
 *  stores legs: a round or square top stands on a pedestal; a long one on four legs; an oval on a
 *  pedestal under each end of its long axis (a leg at its box's corner would stand in the air past
 *  the rim); a hand-drawn or composite shape on a pedestal per piece, on that piece's centroid. */
export function tableLegs(footprint: Footprint, pieces: readonly BuiltOutline[], toZ: number): Part[] {
  switch (footprint.kind) {
    case "circle":
      return pedestal(0, 0, footprint.diameterMm, toZ);
    case "rect": {
      const { widthMm: w, depthMm: d } = footprint;
      if (Math.abs(w - d) < SQUARE_TOLERANCE * Math.max(w, d)) return pedestal(0, 0, Math.min(w, d), toZ);
      return fourLegs(w, d, toZ);
    }
    case "ellipse": {
      const { widthMm: w, depthMm: d } = footprint;
      const long = Math.max(w, d);
      const short = Math.min(w, d);
      if (long - short < SQUARE_TOLERANCE * long) return pedestal(0, 0, short, toZ);
      const off = (long - short) / 2;
      return w >= d
        ? [...pedestal(-off, 0, short, toZ), ...pedestal(off, 0, short, toZ)]
        : [...pedestal(0, -off, short, toZ), ...pedestal(0, off, short, toZ)];
    }
    default:
      return pieces.flatMap((piece) => {
        const poly = flatOutline(piece);
        const c = polygonCentroid(poly);
        const s = polySize(poly);
        return pedestal(c.x, c.y, Math.min(s.w, s.h), toZ);
      });
  }
}

/** The top — the footprint extruded TABLE_TOP_MM with its face at `heightMm` — on its legs, in the
 *  table's own frame. Under a cloth (`covered`) the top is a fabric's thickness shorter, so the
 *  cloth's face is the one at the table height. */
export function tableTop(footprint: Footprint, heightMm: number, covered = false): Part[] {
  const pieces = footprintOutlines(footprint);
  const underside = heightMm - TABLE_TOP_MM;
  const parts: Part[] = pieces.map((outline) => ({ shape: "extrude", outline, h: TABLE_TOP_MM - (covered ? CLOTH_THICK_MM : 0), at: vec3(0, 0, underside) }));
  parts.push(...tableLegs(footprint, pieces, underside));
  return parts;
}

// --- the cloth ------------------------------------------------------------------------------------

/** A cloth over a top at `tableHeightMm`, in the table's frame, falling to the floor (DECIDE 2):
 *  the rim CLOTH_DROP_MM past the top's edge at the table height, the hem CLOTH_HEM_MM further out
 *  and lower, then straight down to z 0. A round table's is a lathe; any other shape's is the
 *  outline grown by `offsetOutline`, extruded from the floor, with the hem as a lip under a thinner
 *  top band — the same profile, as a polygon. */
export function clothParts(footprint: Footprint, tableHeightMm: number): Part[] {
  const H = tableHeightMm;
  const D = CLOTH_DROP_MM;
  const parts: Part[] = [];
  for (const piece of footprintOutlines(footprint)) {
    const rim = offsetOutline(piece, D);
    // The top: one sheet over the table, its edge rounded over the rim by the drop.
    parts.push({ shape: "extrude", outline: { outline: rim }, h: CLOTH_THICK_MM, at: vec3(0, 0, H - CLOTH_THICK_MM) });
    // The fall: from the rim to the floor, folding as it goes and flaring at the hem (spec §3.2,
    // DECIDE 2 — to the floor). Seen on plan A in a browser: a straight-sided cloth read as a box.
    parts.push({ shape: "drape", outline: rim, h: H, at: vec3(0, 0, 0), foldPitchMm: CLOTH_FOLD_PITCH_MM, foldDepthMm: CLOTH_FOLD_DEPTH_MM, flareMm: CLOTH_FLARE_MM });
  }
  return parts;
}

// --- the chairs -----------------------------------------------------------------------------------

export interface ChairSpec {
  style: ChairStyle;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  /** #rrggbb, lower case — part of the instancing key. */
  tone: string;
}

/** The chair round `table`: its own row, else the studio's default (lib/catalog/chairs.ts), in its
 *  style at its size and in its shade — the shade's swatch, else the row's fill, else the plan's
 *  chair tone. A studio with no chair row at all seats a plain dining chair of the plan's size. */
export function chairSpecOf(table: Pick<DesignTable, "chairVariantId">): ChairSpec {
  const id = chairOf(table);
  const resolved = id ? resolve(id) : undefined;
  const row = resolved?.product;
  const d = row?.dimensions;
  const box = row && d && (d.widthMm || d.diameterMm) ? catalogBox(row) : { widthMm: CHAIR_W_MM, depthMm: CHAIR_D_MM };
  return {
    style: chairStyleOf(row) ?? "dining",
    widthMm: box.widthMm,
    depthMm: box.depthMm,
    heightMm: d?.heightMm || DEFAULT_CHAIR_HEIGHT_MM,
    tone: hexOf(resolved?.swatch) ?? hexOf(row?.appearance?.style?.fill) ?? DEFAULT_TONE.chair.toLowerCase(),
  };
}

/** Where a ring's place settings go (SceneSettings.tableware): the top they stand on — its height
 *  above the venue floor and its outlines in the room — and what already stands on it. */
export interface SettingsAt {
  topZ: number;
  tops: Point[][];
  keepouts: Keepout[];
}

/** The chairs of a ring, each turned to face the table by `seatTransform`, all sharing one geometry
 *  with every other chair of this spec in the room (the collector merges by key) — and, given
 *  `settings`, a place setting for each diner, laid off the edge they face (./tableware.ts). */
function placeChairs(seats: readonly Seat[], frame: Transform, spec: ChairSpec, tag: NodeTag, out: SceneCollector, settings?: SettingsAt): void {
  if (!seats.length) return;
  const at = seats.map((seat) => seatTransform(frame, seat));
  if (settings) {
    const diners: SettingSeat[] = at.map((t) => {
      const o = applyTransform(t, vec3(0, 0, 0));
      const f = applyTransform(t, vec3(0, 1, 0));
      return { at: { x: o.x, y: o.y }, facing: { x: f.x - o.x, y: f.y - o.y } };
    });
    placeSettings(diners, settings.tops, settings.keepouts, settings.topZ, out);
  }
  // The parts are built once; every instance is the same request at its own transform.
  const base = chairRequest(spec.style, spec.widthMm, spec.depthMm, spec.heightMm, spec.tone, transform(vec3(0, 0, 0)), tag);
  for (const t of at) out.instance({ ...base, at: t });
}

/** The ring round one table that is in no block: `seatsAround` its footprint, through the table's
 *  turn and mirror. Returns how many chairs it placed. */
export function chairRing(table: DesignTable, z: number, out: SceneCollector, spec: ChairSpec = chairSpecOf(table), settings?: SettingsAt): number {
  const seats = seatsAround(tableFootprint(table), table.seats ?? 0, undefined, tableBlockedSides(table));
  placeChairs(seats, roomTransform(table, z), spec, { type: "chair", id: table.id }, out, settings);
  return seats.length;
}

/** A table's top as flat outlines in the room — through its turn and mirror. */
export function topsOf(table: DesignTable): Point[][] {
  const frame = roomTransform(table);
  return footprintOutlines(tableFootprint(table)).map((piece) => flatOutline(piece).map((p) => {
    const q = applyTransform(frame, vec3(p.x, p.y, 0));
    return { x: q.x, y: q.y };
  }));
}

/** How much of an item's box its FOOT takes on the top — what a setting must keep off. A
 *  candelabrum spreads its arms high over the places (its foot is small, at most CANDLE_FOOT_MM
 *  across each way); an arrangement's mass sits on a narrower base; a vase, a bowl, a lamp stand on
 *  their whole box. */
const FOOT_SHARE_BY_KIND: Partial<Record<string, number>> = { candlestick: 0.45, flowers: 0.6, centerpiece: 0.7 };
const CANDLE_FOOT_MM = 160;

/** What stands on a table, as keep-outs for its place settings: every item but the runner. */
export function keepoutsOf(spots: readonly DressingSpot[]): Keepout[] {
  const out: Keepout[] = [];
  for (const spot of spots) {
    if (spot.runner) continue;
    const product = resolve(spot.p.variantId)?.product;
    const footprint = spot.footprint ?? placementFootprint(spot.p);
    const kind = symbolOf(product, footprint);
    const b = footprintBounds(footprint);
    const s = (spot.p.scale || 1) * (FOOT_SHARE_BY_KIND[kind ?? ""] ?? 1);
    let hw = (b.w / 2) * s;
    let hd = (b.h / 2) * s;
    if (kind === "candlestick") {
      hw = Math.min(hw, CANDLE_FOOT_MM);
      hd = Math.min(hd, CANDLE_FOOT_MM);
    }
    out.push({ c: spot.at, hw, hd, rotationDeg: spot.rotation, round: footprint.kind === "circle" });
  }
  return out;
}

/** The ring round a BLOCK: `blockSeats` in the block's frame — its centre and rotation only, never
 *  a mirror (canvas-stage.tsx:1186) — seating what its members seat between them (`groupSeats`).
 *  The chair is the first member's, as the frame is. Returns the block, for its label. */
export function blockChairRing(members: readonly DesignTable[], doc: DesignDocumentContent, z: number, out: SceneCollector, settings?: SettingsAt): BlockFrame | null {
  const first = members[0];
  const groupId = first?.groupId;
  if (!first || !groupId) return null;
  const block = tableBlock(members);
  if (!block) return null;
  const seats = blockSeats(block, groupSeats(doc, groupId));
  placeChairs(seats, transform(vec3(block.centre.x, block.centre.y, z), block.rotation), chairSpecOf(first), { type: "chair", id: groupId }, out, settings);
  return block;
}

// --- items: the one seam to ./items.ts ------------------------------------------------------------

function contextFor(product: Product | undefined, resolved: Resolved | undefined, footprint: Footprint, author: boolean, placement?: Placement): ItemContext {
  const kind = symbolOf(product, footprint);
  const b = footprintBounds(footprint);
  // The canvas's `own` (canvas-stage.tsx:3924): the shade, else the row's fill. The kind's tone only
  // when neither says — and the flowers get `own` alone, so an arrangement with no shade draws its
  // default mix rather than a row tinted the kind's pink.
  const own = hexOf(resolved?.swatch) ?? hexOf(product?.appearance?.style?.fill);
  const ctx: ItemContext = {
    product,
    resolved,
    footprint,
    widthMm: b.w,
    depthMm: b.h,
    heightMm: product?.dimensions.heightMm ?? 0,
    tone: own ?? (kind ? DEFAULT_TONE[kind].toLowerCase() : NO_PICTURE_TONE),
    count: product && kind ? symbolCount(product, kind) : 1,
    author,
  };
  const chairStyle = chairStyleOf(product);
  if (chairStyle) ctx.chairStyle = chairStyle;
  const drawStyle = drawStyleOf(product);
  if (drawStyle) ctx.drawStyle = drawStyle;
  if (product && (kind === "flowers" || kind === "centerpiece")) ctx.flowers = flowerDrawSpecOf(product, footprint, own);
  if (placement) {
    const climb = climbRise(product, placement.climb);
    if (climb) ctx.climb = climb;
    const bench = standaloneBench(placement, benchOf);
    if (bench) ctx.bench = bench;
  }
  return ctx;
}

/** Everything an item builder needs about one placed item, resolved once — on a table, on the floor
 *  or overhead alike (./build.ts calls it for the floor and ceiling placements). `footprint` is the
 *  shape it is drawn at: a runner's trimmed strip, a stretched row's size, else `placementFootprint`. */
export function itemContextOf(placement: Placement, product: Product | undefined, resolved: Resolved | undefined, footprint: Footprint, author: boolean): ItemContext {
  return contextFor(product, resolved, footprint, author, placement);
}

/** The vase an arrangement at `spot` stands IN although the plan does not say so: the plan lets a
 *  designer set an arrangement and a vase down as two items on one spot (plan A does it on every
 *  table — "אגרטל מרטיני" and "סידור" at the same offset), and in the room the flowers are in the
 *  vase's mouth, not round its foot. The vase whose box holds the arrangement's middle, nearest
 *  first; null when none does. */
export function vaseUnder(spot: DressingSpot, spots: readonly DressingSpot[]): DressingSpot | null {
  let best: DressingSpot | null = null;
  let bestD = Infinity;
  for (const v of spots) {
    if (v === spot || v.runner) continue;
    const product = resolve(v.p.variantId)?.product;
    if (product?.category !== "vases") continue;
    const b = footprintBounds(v.footprint ?? placementFootprint(v.p));
    const s = v.p.scale || 1;
    const local = turnBack({ x: spot.at.x - v.at.x, y: spot.at.y - v.at.y }, v.rotation);
    if (Math.abs(local.x) > (b.w / 2) * s || Math.abs(local.y) > (b.h / 2) * s) continue;
    const d = Math.hypot(local.x, local.y);
    if (d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

const turnBack = (p: Point, deg: number): Point => {
  const c = Math.cos((-deg * Math.PI) / 180);
  const s = Math.sin((-deg * Math.PI) / 180);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

/** What stands on `table`: every item at its `dressingSpots` place on the top face (z = `topZ`),
 *  turned as the plan turns it, at its own drawing scale, drawn by its kind. An arrangement in a
 *  vessel (`vesselOf`) stands IN it: the vase at the spot first, the flowers raised to VASE_RIM_SHARE
 *  of the vase's height (DECIDE 7) — and so does one set down on a vase's spot (`vaseUnder`).
 *  `chipsOf` is the room's bucketing of table items with the cover left out — the same lookup
 *  `dressBlockOf` lays a block's items with; `spots` may be handed in when the caller has them.
 *  Returns the item count. */
export function dressingOf(
  doc: DesignDocumentContent,
  table: DesignTable,
  chipsOf: (tableId: string) => readonly Placement[],
  topZ: number,
  author: boolean,
  out: SceneCollector,
  given?: readonly DressingSpot[],
): number {
  const chips = chipsOf(table.id);
  if (!chips.length) return 0;
  const spots = given ?? dressingSpots(table, chips, dressBlockOf(doc.tables, table, chipsOf));
  for (const spot of spots) {
    const p = spot.p;
    const resolved = resolve(p.variantId);
    const product = resolved?.product;
    const footprint = spot.footprint ?? placementFootprint(p);
    const kind = symbolOf(product, footprint);
    const ctx = itemContextOf(p, product, resolved, footprint, author);
    const standAt = (z: number) => transform(vec3(spot.at.x, spot.at.y, z), spot.rotation, !!p.mirrored, p.scale || 1);
    let z = topZ;
    const vaseId = vesselOf(p, (id) => resolve(id)?.product);
    const vase = vaseId ? resolve(vaseId) : undefined;
    if (vase) {
      const vaseCtx = contextFor(vase.product, vase, resolveFootprint(vase.product), author);
      out.item(`${p.id}:vase`, { type: "item", id: p.id, label: vase.product.name }, itemBody("vase", vaseCtx), standAt(z));
      z += VASE_RIM_SHARE * (vase.product.dimensions.heightMm || 0);
    } else if (kind === "flowers" || kind === "centerpiece") {
      const under = vaseUnder(spot, spots);
      if (under) z += VASE_RIM_SHARE * (resolve(under.p.variantId)?.product.dimensions.heightMm || 0);
    }
    out.item(p.id, { type: kind === "flowers" ? "flowers" : "item", id: p.id, label: product?.name }, itemBody(kind, ctx), standAt(z));
  }
  return spots.length;
}

// --- the tables -----------------------------------------------------------------------------------

/** A table's height: its row's, else the category default. */
export function tableHeightOf(table: Pick<DesignTable, "variantId">): number {
  const product = table.variantId ? resolve(table.variantId)?.product : undefined;
  return product?.dimensions.heightMm || DEFAULT_TABLE_HEIGHT_MM;
}

/**
 * Every table of the document into `out`: top and legs, cloth, chairs and dressing — never a number. `floorZ` is what the table stands on (./elevation.ts — a stage's deck, the
 * floor); the catalog must be primed (lib/catalog/storage.ts) before this is called, as for the
 * printed map.
 */
export function tableNodes(input: Pick<SceneInput, "doc" | "author"> & { settings?: { tableware?: boolean } }, out: SceneCollector, floorZ: (tableId: string) => number): void {
  const { doc, author } = input;
  // Place settings at every seat unless the designer switched them off (an illustration: ./tableware.ts).
  const tableware = input.settings?.tableware !== false;
  // The table items, bucketed as the canvas buckets them (canvas-stage.tsx:534): the COVER — the one
  // whose row is anchored to the table — kept apart from the chips that stand on it; a perched item
  // belongs to a banquette, not a table.
  const chipsByTable = new Map<string, Placement[]>();
  for (const p of doc.placements) {
    if (p.layer !== "table" || !p.tableId || p.perch) continue;
    if (resolve(p.variantId)?.anchor === "table") continue;
    const list = chipsByTable.get(p.tableId);
    if (list) list.push(p);
    else chipsByTable.set(p.tableId, [p]);
  }
  const chipsOf = (tableId: string): readonly Placement[] => chipsByTable.get(tableId) ?? NONE;
  const ringed = new Set<string>();
  // Each table's dressing, laid once: drawn by `dressingOf`, kept clear by the settings.
  const spotCache = new Map<string, readonly DressingSpot[]>();
  const spotsOf = (t: DesignTable): readonly DressingSpot[] => {
    let hit = spotCache.get(t.id);
    if (!hit) {
      const chips = chipsOf(t.id);
      hit = chips.length ? dressingSpots(t, chips, dressBlockOf(doc.tables, t, chipsOf)) : [];
      spotCache.set(t.id, hit);
    }
    return hit;
  };
  const settingsFor = (members: readonly DesignTable[], z: number, heightMm: number): SettingsAt | undefined =>
    tableware ? { topZ: z + heightMm, tops: members.flatMap(topsOf), keepouts: members.flatMap((m) => keepoutsOf(spotsOf(m))) } : undefined;

  for (const t of doc.tables) {
    const resolved = t.variantId ? resolve(t.variantId) : undefined;
    const product = resolved?.product;
    const footprint = tableFootprint(t);
    const heightMm = tableHeightOf(t);
    const z = floorZ(t.id);
    const frame = roomTransform(t, z);
    const cover = coverOn(doc, t.id);

    // The top on its legs — timber when the row says nothing — and the cloth over it.
    const material = swatchMaterial(resolved, product, BARE_TABLE_TONE, "matte", true);
    if (!material.texture && !material.image) material.texture = "wood";
    out.body(`table:${t.id}`, { type: "table", id: t.id, label: product?.name }, material, tableTop(footprint, heightMm, !!cover), [frame]);
    if (cover) {
      const c = resolve(cover.variantId);
      const colour = hexOf(c?.swatch) ?? hexOf(c?.product.appearance?.style?.fill) ?? BARE_CLOTH_TONE;
      out.body(`cloth:${cover.id}`, { type: "cloth", id: cover.id, label: c?.product.name }, clothMaterial(colour), clothParts(footprint, heightMm), [frame]);
    }

    // The chairs: a lone table's own ring; a block's once, the block's (never its members').
    // No table numbers float in the room (Ravid, 2026-10-23: "remove the numbering of the tables in
    // the 3D") — a number is a crew mark on a plan, and the room is what the client is shown.
    if (!t.groupId) {
      chairRing(t, z, out, undefined, settingsFor([t], z, heightMm));
    } else if (!ringed.has(t.groupId)) {
      ringed.add(t.groupId);
      const members = doc.tables.filter((x) => x.groupId === t.groupId);
      blockChairRing(members, doc, z, out, settingsFor(members, z, Math.max(...members.map(tableHeightOf))));
    }

    dressingOf(doc, t, chipsOf, z + heightMm, author, out, spotsOf(t));
  }
}

// ponytail: self-check. Run: npx tsx lib/scene/tables.ts
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

  const isBody = (n: { kind: string }): n is BodyNode => n.kind === "body";
  const isLabel = (n: { kind: string }): n is LabelNode => n.kind === "label";

  {
    const round: Product = { id: "tbl-round", name: "שולחן עגול 180", category: "tables", layer: "floor", dimensions: { diameterMm: 1800, heightMm: 750 }, categoryFields: { seats: 10 }, styleTags: [], variants: [] };
    const rect: Product = { id: "tbl-rect", name: "שולחן מלבן 240×120", category: "tables", layer: "floor", dimensions: { widthMm: 2400, depthMm: 1200, heightMm: 750 }, categoryFields: { seats: 8 }, styleTags: [], variants: [] };
    const chair: Product = {
      id: "chair",
      name: "כיסא נפוליאון",
      category: "chairs",
      layer: "floor",
      dimensions: { widthMm: 450, depthMm: 500, heightMm: 900 },
      categoryFields: {},
      styleTags: [],
      variants: [{ id: "chair-ivory", name: "שנהב", swatch: "#f7f6fc" }],
      appearance: { shape: "rect", content: "none", symbolStyle: "chiavari" },
    };
    const cloth: Product = { id: "cloth", name: "מפה עגולה", category: "tablecloths", layer: "table", dimensions: { diameterMm: 3000, heightMm: 0 }, categoryFields: {}, styleTags: [], variants: [{ id: "cloth-plum", name: "חציל", swatch: "#4b3a6e" }] };
    const candle: Product = { id: "candle", name: "פמוט 5 קנים", category: "candlesticks", layer: "table", dimensions: { widthMm: 300, depthMm: 300, heightMm: 600 }, categoryFields: { arms: 5 }, styleTags: [], variants: [] };
    primeCatalog([round, rect, chair, cloth, candle]);

    const onTable = (id: string, variantId: string, tableId: string): Placement => ({ id, variantId, layer: "table", quantity: 1, tableId, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });

    // One round table, dressed: a cloth and two candlesticks.
    const doc: DesignDocumentContent = {
      calibration: { mmPerUnit: 1 },
      tables: [{ id: "t1", type: "round", number: 1, position: { x: 5000, y: 5000 }, rotation: 0, seats: 10, variantId: "tbl-round" }],
      placements: [onTable("p-cloth", "cloth-plum", "t1"), onTable("p-c1", "candle", "t1"), onTable("p-c2", "candle", "t1")],
    };
    const out = new SceneCollector();
    tableNodes({ doc, author: true }, out, () => 0);
    const nodes = out.nodes();
    const bodies = nodes.filter(isBody);

    const chairs = bodies.filter((b) => b.tag.type === "chair");
    assert(chairs.length === 1, `ten chairs of one style and shade are ONE body (got ${chairs.length})`);
    assert(chairs[0].id.startsWith("i:chair:chiavari:#f7f6fc"), `the chair body is keyed by style and shade (${chairs[0].id})`);
    assert(chairs[0].instances.length === 10, `…with ten instances (got ${chairs[0].instances.length})`);
    for (const inst of chairs[0].instances) {
      const front = applyTransform(transform(vec3(0, 0, 0), inst.rotationDeg, !!inst.mirrored), vec3(0, 1, 0));
      const toCentre = { x: 5000 - inst.at.x, y: 5000 - inst.at.y };
      const len = Math.hypot(toCentre.x, toCentre.y);
      const cos = (front.x * toCentre.x + front.y * toCentre.y) / len;
      assert(cos > Math.cos((2 * Math.PI) / 180), `every chair's front (+y in its frame) points at the table centre within 2° (chair at ${Math.round(inst.at.x)},${Math.round(inst.at.y)} turned ${inst.rotationDeg.toFixed(1)}°)`);
      assert(near(inst.at.z, 0), "a chair stands on the floor");
      assert(near(len, 900 + CHAIR_D_MM / 2 - 110, 15), "…tucked under the rim as the plan tucks it (CHAIR_OFFSET_MM out from the edge)");
    }

    const table = bodies.find((b) => b.tag.type === "table");
    assert(!!table && table.instances.length === 1 && near(table.instances[0].at.x, 5000) && near(table.instances[0].at.y, 5000), "the table body stands at the table's position");
    const top = table!.parts.find((p) => p.shape === "extrude");
    assert(!!top && top.shape === "extrude" && near(top.at.z, 720) && near(top.h, 30 - CLOTH_THICK_MM), "the top is extruded from 720 — its face at the table height, a fabric's thickness under the cloth");
    assert(table!.parts.filter((p) => p.shape === "cylinder").length === 2, "a round table stands on a pedestal and its foot");
    assert(table!.material.texture === "wood" && table!.material.colour === BARE_TABLE_TONE, "a bare table is timber");

    const clothBody = bodies.find((b) => b.tag.type === "cloth");
    assert(!!clothBody && clothBody.tag.id === "p-cloth" && clothBody.material.kind === "fabric" && clothBody.material.colour === "#4b3a6e", "the cloth is a fabric body in the variant's swatch, tagged by the cover placement");
    const [sheet, fall] = clothBody!.parts;
    assert(sheet.shape === "extrude" && near(sheet.at.z + sheet.h, 750), "a round table's cloth: a sheet over the top at the table height");
    assert(fall.shape === "drape" && near(fall.at.z, 0) && near(fall.h, 750), "…and a drape from the rim to the floor (DECIDE 2)");
    const rimR = fall.shape === "drape" ? Math.max(...fall.outline.map((q) => Math.hypot(q.x, q.y))) : 0;
    assert(near(rimR, 900 + CLOTH_DROP_MM, 2), `…its rim CLOTH_DROP_MM past the top (${Math.round(rimR)})`);
    assert(fall.shape === "drape" && fall.foldDepthMm! > 0 && fall.flareMm! > 0, "…folding and flaring as it falls");

    const candles = bodies.filter((b) => b.id === "p-c1" || b.id === "p-c2");
    assert(candles.length === 2, `the two candlesticks are two bodies (got ${candles.length})`);
    for (const c of candles) {
      assert(c.tag.type === "item" && near(c.instances[0].at.z, 750), "a candlestick stands on the top face, at the table height");
      const d = Math.hypot(c.instances[0].at.x - 5000, c.instances[0].at.y - 5000);
      assert(d < 900, "…inside the table's rim, where dressingSpots put it");
    }
    assert(candles[0].instances[0].at.x !== candles[1].instances[0].at.x || candles[0].instances[0].at.y !== candles[1].instances[0].at.y, "…and not on the same spot");

    const labels = nodes.filter(isLabel);
    assert(labels.length === 0, "no table number floats over a table, even for the author");
    const quiet = new SceneCollector();
    tableNodes({ doc, author: false }, quiet, () => 0);
    assert(!quiet.nodes().some((n) => n.kind === "label"), "…and the client sees no label");

    // Two rectangles pushed into a head table: one ring, the block's; four legs each; one number.
    const block: DesignDocumentContent = {
      calibration: { mmPerUnit: 1 },
      tables: [
        { id: "a", type: "rect", number: 3, position: { x: 10000, y: 5000 }, rotation: 0, seats: 8, variantId: "tbl-rect", groupId: "g1" },
        { id: "b", type: "rect", number: 4, position: { x: 12400, y: 5000 }, rotation: 0, seats: 8, variantId: "tbl-rect", groupId: "g1" },
      ],
      placements: [onTable("p-c3", "candle", "a")],
      groups: [{ id: "g1", number: 2 }],
    };
    const out2 = new SceneCollector();
    tableNodes({ doc: block, author: true }, out2, () => 0);
    const nodes2 = out2.nodes();
    const bodies2 = nodes2.filter(isBody);
    const ring = bodies2.filter((n) => n.tag.type === "chair");
    assert(ring.length === 1 && ring[0].instances.length === 16, `a block's chairs are one ring of what its members seat (got ${ring.map((r) => r.instances.length).join("+") || 0})`);
    assert(ring[0].tag.id === "g1", "…tagged with the group");
    const seam = ring[0].instances.filter((i) => Math.abs(i.at.x - 11200) < 300 && Math.abs(i.at.y - 5000) < 500);
    assert(seam.length === 0, "no chair sits in the seam between the two tables");
    const rects = bodies2.filter((n) => n.tag.type === "table");
    assert(rects.length === 2 && rects.every((r) => r.parts.filter((p) => p.shape === "box").length === 4), "a long table stands on four legs");
    const leg = rects[0].parts.find((p) => p.shape === "box");
    assert(!!leg && leg.shape === "box" && near(Math.abs(leg.at.x), 1200 - LEG_INSET_MM - LEG_MM / 2) && near(Math.abs(leg.at.y), 600 - LEG_INSET_MM - LEG_MM / 2) && near(leg.h, 720), "…inset 80 from the corners, up to the top's underside");
    const labels2 = nodes2.filter(isLabel);
    assert(labels2.length === 0, "…nor over a block");
    const candle3 = bodies2.find((n) => n.id === "p-c3");
    assert(!!candle3 && near(candle3.instances[0].at.z, 750) && near(candle3.instances[0].at.x, 11200, 1), "a lone item on an auto-laid block stands on the block's middle — the seam — at the top height");

    // A cloth on a rectangle: the outline grown by the drop, rounded at the corners, to the floor.
    const rectCloth = clothParts({ kind: "rect", widthMm: 2400, depthMm: 1200 }, 750);
    assert(rectCloth.length === 2 && rectCloth[0].shape === "extrude" && rectCloth[1].shape === "drape", "a rectangle's cloth is a sheet over the top and a drape to the floor");
    const fallR = rectCloth[1];
    assert(fallR.shape === "drape" && near(fallR.at.z, 0) && near(fallR.h, 750), "…the drape from the floor to the table height");
    const rimSize = fallR.shape === "drape" ? polySize(fallR.outline) : { w: 0, h: 0 };
    assert(near(rimSize.w, 2400 + 2 * CLOTH_DROP_MM) && near(rimSize.h, 1200 + 2 * CLOTH_DROP_MM), "…its rim the top grown by the drop all round");
    // Every point of the rim is exactly the drop from the top's edge — a mitred corner would stand
    // √2 times that out at the diagonal.
    const reach = fallR.shape === "drape" ? fallR.outline.reduce((m, p) => Math.max(m, Math.hypot(Math.max(Math.abs(p.x) - 1200, 0), Math.max(Math.abs(p.y) - 600, 0))), 0) : 0;
    assert(near(reach, CLOTH_DROP_MM, 0.5) && fallR.shape === "drape" && fallR.outline.length > 8, "…with corners rounded at the drop, not mitred");

    // A hollow ח (a notch): the concave corners mitre, the convex ones round.
    const notch = offsetOutline({ outline: [{ x: -1000, y: -500 }, { x: 1000, y: -500 }, { x: 1000, y: 500 }, { x: 300, y: 500 }, { x: 300, y: 0 }, { x: -300, y: 0 }, { x: -300, y: 500 }, { x: -1000, y: 500 }] }, 90);
    assert(notch.some((p) => near(p.x, 210) && near(p.y, 90)), "a concave corner of a ח moves to its mitre, 90 in from both sides");
    assert(!notch.some((p) => p.y > 590.5), "nothing grows further than the drop past the shape");

    // itemContextOf: the canvas's colour rule, the count, the style.
    const ctx = itemContextOf(onTable("x", "candle", "t1"), candle, resolve("candle"), { kind: "rect", widthMm: 300, depthMm: 300 }, false);
    assert(ctx.count === 5 && ctx.tone === DEFAULT_TONE.candlestick.toLowerCase() && ctx.heightMm === 600 && !ctx.flowers, "a candlestick's context: its arms, the kind's tone when it has no shade, its height");
    const chairCtx = itemContextOf(onTable("y", "chair-ivory", "t1"), chair, resolve("chair-ivory"), { kind: "rect", widthMm: 450, depthMm: 500 }, false);
    assert(chairCtx.tone === "#f7f6fc" && chairCtx.chairStyle === "chiavari", "a chair's context: its variant's swatch and its style");

    console.log("scene tables ok");
  }
}
