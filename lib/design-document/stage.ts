// A stage on the plan — one placement, many decks (see StageBuild in ./types.ts).
//
// The plan holds ONE thing where the stage stands: an outline, a front, the decks it may be built
// from, its height, any raised levels, and the flights of stairs onto it. Everything else is derived
// here, by the same fill the area tool previews with (lib/studio/stage-fill.ts), and everything that
// needs it asks this file: the canvas draws the seams and the steps from it, the quote and the
// packing list count decks, flights and skirt from it (./measure.ts), the stage plan prints it
// (app/(app)/outputs/stage-plan.tsx), and "פירוק לפלטות" turns it into loose decks with it. There is
// no stored list of decks to drift from the drawing, which is the rule this codebase keeps for
// everything that can be derived.
//
// ONE FRAME. The decks are always laid in the stage's OWN frame — its outline before it is turned,
// moved or flipped — and only then carried out into the room. Laying them in world coordinates
// instead would let a mirrored stage start its rows from the other end and come out a different
// build from its unflipped twin; in its own frame a stage is the same stage wherever it stands.
//
// LEVELS partition the floor with the base: the base is laid with every level as an obstacle, and
// each level is laid inside its own outline AND the stage's (a riser drawn past the edge is clipped
// to the stage it stands on). Each is its own platform at its own height, which is what it is.
//
// INNER items are set into the stage instead of out from it (StageStair.inner): a flight recessed
// into the deck, the decks laid AROUND its recess (layStage takes it as an obstacle and drops any
// deck that still reaches into it), its recess taken off the surface area and off the skirt; a
// banquette standing on the deck. A side too close to a wall for a flight's run outside takes only
// an inner one (placeEdgeItem, settleEdgeItems).
//
// CURVES. A round stage is a fine polygon whose every vertex is `smooth`; its rim is ONE side
// (stageSide), and an edge item on it follows the curve. Edge items are addressed by SIDE — the
// side's first edge and how far along the whole side — which on straight sides is exactly the edge.
//
// Pure, no DOM, self-checked: `npm run check:stage`.
import type { Placement, Point, StageBuild, StageEdgeKind, StageLevel, StageStair } from "./types";
import type { Product } from "../catalog/types";
import { asRect, defaultFront, fillWithDecks, signedArea, type DeckType, type FillResult, type LaidDeck } from "../studio/stage-fill";
import { footprintBounds, resolveFootprint } from "../studio/footprint";
import { cleanOutline, pushSide, splitSide, unionOutline } from "../studio/stage-draw";
import { CHAIR_OFFSET_MM, CHAIR_W_MM, type Seat } from "../studio/seating";
import { isMain } from "../self-check";

/** What the fill needs to know about a deck, keyed by the variant id the stage stores. */
export type DeckLookup = (variantId: string) => DeckType | undefined;

/** How far a point in the room is from the nearest venue wall. */
export type WallDistance = (p: Point) => number;

export type StagePlacement = Placement & { stage: StageBuild };

/** A deck as laid on a stage: which level it belongs to (absent = the base) and how high it stands. */
export interface StageDeck extends LaidDeck {
  level?: string;
  heightMm: number;
  /** A round piece standing whole (its box is width × depth) — drawn as the ellipse it is. */
  round?: boolean;
}

export interface StageLayout extends Omit<FillResult, "decks"> {
  decks: StageDeck[];
}

/** An edge closer to a wall than this is AGAINST it: no skirt, no railing, no stairs. */
export const WALL_HUG_MM = 300;
/** A comfortable riser, and the tread that goes with it (the 2R + T ≈ 63cm stair rule). */
export const RISER_MAX_MM = 180;
export const TREAD_MM = 280;
export const STAIR_WIDTH_MM = 1000;
const DEFAULT_HEIGHT_MM = 600;

/** A deck product as the fill sees it: its footprint box and its height. Every caller — the studio,
 *  the quote, procurement — builds its lookup from this, so they all lay the same decks. */
export function deckTypeOf(variantId: string, product: Product): DeckType {
  const b = footprintBounds(resolveFootprint(product));
  return { id: variantId, widthMm: Math.round(b.w), depthMm: Math.round(b.h), heightMm: product.dimensions.heightMm, ...(isRoundPiece(product) ? { round: true } : {}) };
}

/** A round or oval stage piece — a "במה עגולה" the studio owns: one platform, which becomes a stage
 *  with a curved rim (stageFromPiece `round`) built of itself. */
export function isRoundPiece(product: Product): boolean {
  const shape = product.appearance?.shape ?? (product.dimensions.diameterMm ? "circle" : "rect");
  return (shape === "circle" || shape === "ellipse") && !product.appearance?.parts?.length;
}

/** About how long each chord of a round stage's rim is. Short enough that the polygon reads as a
 *  curve; long enough to stay a few dozen points. */
const ROUND_SIDE_MM = 250;

/** An ellipse `widthMm` × `depthMm` as a stage outline in its own frame: centred, wound the way
 *  rectOutline is, with edge 0 the chord across the TOP (−y) — the front, as on a rectangle — and
 *  every vertex smooth. */
export function roundOutline(widthMm: number, depthMm: number): { outline: Point[]; smooth: number[] } {
  const a = widthMm / 2;
  const b = depthMm / 2;
  const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const n = Math.max(24, 4 * Math.ceil(perimeter / (4 * ROUND_SIDE_MM)));
  const step = (2 * Math.PI) / n;
  const outline = Array.from({ length: n }, (_, k) => {
    const th = -Math.PI / 2 - step / 2 + k * step;
    return { x: Math.round(a * Math.cos(th)), y: Math.round(b * Math.sin(th)) };
  });
  return { outline, smooth: outline.map((_, k) => k) };
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const norm360 = (deg: number) => Math.round((((deg % 360) + 360) % 360) * 100) / 100;
const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const edgeOf = (poly: readonly Point[], i: number): [Point, Point] => [poly[i], poly[(i + 1) % poly.length]];

function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
const onBoundary = (p: Point, poly: readonly Point[], tol = 50) => poly.some((_, i) => segDist(p, ...edgeOf(poly, i)) <= tol);

/** A rectangle outline in the stage's frame: front along the top (−y) edge, as edge 0. */
export function rectOutline(widthMm: number, depthMm: number): Point[] {
  const w = widthMm / 2;
  const d = depthMm / 2;
  return [
    { x: -w, y: -d },
    { x: w, y: -d },
    { x: w, y: d },
    { x: -w, y: d },
  ];
}

/** The stage's size when it is a rectangle stored the way rectOutline stores one — the one shape the
 *  resize handles can stretch. Null for anything else (an L, a T, an angled corner). */
export function stageRect(stage: Pick<StageBuild, "outline" | "front">): { widthMm: number; depthMm: number } | null {
  if (stage.front !== 0 || stage.outline.length !== 4) return null;
  const [a, b, c, d] = stage.outline;
  const axis = Math.abs(a.y - b.y) < 1 && Math.abs(b.x - c.x) < 1 && Math.abs(c.y - d.y) < 1 && Math.abs(d.x - a.x) < 1;
  return axis && a.y < c.y && a.x < b.x ? { widthMm: Math.round(b.x - a.x), depthMm: Math.round(c.y - b.y) } : null;
}

/** An area drawn in the room, turned into a stage: where it stands, which way it faces, and its
 *  outline in its own frame. The frame's x runs along the front edge and its y runs back into the
 *  stage, so a stage's rotation IS the direction its front runs — a turned stage turns its decks. */
export function stageFromArea(polygon: readonly Point[], front: number): { position: Point; rotation: number; outline: Point[]; front: number } {
  const a = polygon[front];
  const b = polygon[(front + 1) % polygon.length];
  let theta = Math.atan2(b.y - a.y, b.x - a.x);
  // Which side of the front the stage is on: local +y must point INTO it, so the frame's x runs
  // along the front one way or the other depending on which way round the corners were clicked.
  if (signedArea(polygon) < 0) theta += Math.PI;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const turned = polygon.map((p) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos }));
  const xs = turned.map((p) => p.x);
  const ys = turned.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const position = { x: Math.round(cx * cos - cy * sin), y: Math.round(cx * sin + cy * cos) };
  const rotation = norm360((theta * 180) / Math.PI);

  const rect = asRect(polygon, front);
  if (rect) return { position, rotation, outline: rectOutline(Math.round(rect.widthMm), Math.round(rect.depthMm)), front: 0 };
  return {
    position,
    rotation,
    outline: turned.map((p) => ({ x: Math.round(p.x - cx), y: Math.round(p.y - cy) })),
    front,
  };
}

type Frame = Pick<Placement, "position" | "rotation" | "mirrored">;

/** A point of the stage's frame, out in the room: flipped (Placement.mirrored — across its own
 *  width, before the turn), turned, moved. */
export function toRoom(p: Frame, q: Point): Point {
  const x = p.mirrored ? -q.x : q.x;
  const t = rad(p.rotation || 0);
  return { x: p.position.x + x * Math.cos(t) - q.y * Math.sin(t), y: p.position.y + x * Math.sin(t) + q.y * Math.cos(t) };
}

/** …and back: a point in the room, in the stage's own frame. */
export function toStageFrame(p: Frame, r: Point): Point {
  const t = rad(p.rotation || 0);
  const dx = r.x - p.position.x;
  const dy = r.y - p.position.y;
  const x = dx * Math.cos(t) + dy * Math.sin(t);
  const y = -dx * Math.sin(t) + dy * Math.cos(t);
  return { x: p.mirrored ? -x : x, y };
}

/** The stage's outline where it stands in the room. */
export function stageOutlineInRoom(p: StagePlacement): Point[] {
  return p.stage.outline.map((q) => toRoom(p, q));
}

/** The decks this stage may use that the lookup still knows — a deck deleted from the catalog since
 *  simply stops being offered, rather than breaking the stage. */
export function stageDeckTypes(stage: StageBuild, deckOf: DeckLookup): DeckType[] {
  return stage.decks.map(deckOf).filter((t): t is DeckType => !!t);
}

/** The base's height: stated, or the tallest chosen deck's own. */
export function stageHeight(stage: StageBuild, deckOf: DeckLookup): number {
  if (stage.heightMm && stage.heightMm > 0) return stage.heightMm;
  const heights = stageDeckTypes(stage, deckOf)
    .map((t) => t.heightMm ?? 0)
    .filter((h) => h > 0);
  return heights.length ? Math.max(...heights) : DEFAULT_HEIGHT_MM;
}

/** A level's front: the edge nearest the stage's own front (the stage frame's −y), so a riser at the
 *  back of a band stage is decked along the same line the stage is. */
export function levelFront(outline: readonly Point[]): number {
  let best = 0;
  let bestY = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const [a, b] = edgeOf(outline, i);
    const my = (a.y + b.y) / 2;
    if (Math.abs(a.y - b.y) < Math.abs(a.x - b.x) && my < bestY - 1e-6) {
      bestY = my;
      best = i;
    }
  }
  return bestY === Infinity ? 0 : best;
}

/** The build, in the stage's own frame: the base around its levels, then each level inside itself
 *  and inside the stage. Coverage is of the stage's whole outline; size suggestions are offered for
 *  a plain rectangle only — a stage with levels has been shaped on purpose. */
export function layStage(stage: StageBuild, deckOf: DeckLookup): StageLayout {
  const all = stageDeckTypes(stage, deckOf);
  const levels = stage.levels ?? [];
  const baseH = stageHeight(stage, deckOf);
  // A round stage the size of a round piece the studio owns stands on that piece, whole.
  const whole = levels.length ? null : wholePiece(stage, all);
  if (whole) {
    const areaMm2 = Math.abs(signedArea(stage.outline));
    const t = whole.type;
    return {
      decks: [{ typeId: t.id, centre: whole.centre, rotation: whole.turned ? 90 : 0, widthMm: t.widthMm, depthMm: t.depthMm, heightMm: baseH, round: true }],
      coverage: 1,
      areaMm2,
      front: stage.front,
      rect: null,
      suggestions: [],
    };
  }
  const types = all.filter((t) => !t.round);
  // An inner flight is a RECESS: no deck stands where its steps go down into the stage.
  const baseRecess = recesses(stage, undefined, deckOf);
  const base = fillWithDecks(stage.outline, types, { front: stage.front, obstacles: [...levels.map((l) => l.outline), ...baseRecess], exceed: stage.exceed });
  // The fill keeps out of an obstacle by its cells' centres; a deck that would still reach into a
  // recess is left out — nobody stands a deck over a flight of steps.
  const clear = (holes: Point[][]) => (d: LaidDeck) => !holes.some((h) => deckOverlaps(d, h));
  const decks: StageDeck[] = base.decks.filter(clear(baseRecess)).map((d) => ({ ...d, heightMm: baseH }));
  for (const l of levels) {
    const holes = recesses(stage, l.id, deckOf);
    const r = fillWithDecks(l.outline, types, { front: levelFront(l.outline), within: stage.outline, obstacles: holes });
    decks.push(...r.decks.filter(clear(holes)).map((d) => ({ ...d, level: l.id, heightMm: l.heightMm })));
  }
  const covered = decks.reduce((s, d) => s + d.widthMm * d.depthMm, 0);
  // Coverage is of the floor meant to be decked — a recess is left open on purpose.
  const decked = base.areaMm2 - baseRecess.reduce((s, q) => s + Math.abs(signedArea(q)), 0);
  return {
    ...base,
    decks,
    coverage: decked > 0 ? Math.min(1, covered / decked) : 0,
    suggestions: levels.length ? [] : base.suggestions,
  };
}

/** The round piece a round stage stands on whole, when it is built of one its size (either way
 *  round), and where it stands in the stage's frame. */
function wholePiece(stage: StageBuild, types: readonly DeckType[]): { type: DeckType; turned: boolean; centre: Point } | null {
  const rounds = types.filter((t) => t.round);
  if (!rounds.length || !stage.smooth?.length) return null;
  const xs = stage.outline.map((q) => q.x);
  const ys = stage.outline.map((q) => q.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const centre = { x: Math.round((Math.max(...xs) + Math.min(...xs)) / 2), y: Math.round((Math.max(...ys) + Math.min(...ys)) / 2) };
  const near = (a: number, b: number) => Math.abs(a - b) <= 60;
  for (const t of rounds) {
    if (near(t.widthMm, w) && near(t.depthMm, h)) return { type: t, turned: false, centre };
    if (near(t.widthMm, h) && near(t.depthMm, w)) return { type: t, turned: true, centre };
  }
  return null;
}

/** Whether the stage is ONE round piece — nothing can be cut into it. */
export function stageIsOnePiece(stage: StageBuild, deckOf: DeckLookup): boolean {
  return !stage.levels?.length && !!wholePiece(stage, stageDeckTypes(stage, deckOf));
}

function insidePoly(p: Point, poly: readonly Point[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Whether a laid deck reaches into a polygon by more than a hairline (20mm). */
function deckOverlaps(d: LaidDeck, poly: readonly Point[]): boolean {
  const t = rad(d.rotation);
  const w = d.widthMm / 2 - 20;
  const h = d.depthMm / 2 - 20;
  const box = [
    { x: -w, y: -h },
    { x: w, y: -h },
    { x: w, y: h },
    { x: -w, y: h },
  ].map((q) => ({ x: d.centre.x + q.x * Math.cos(t) - q.y * Math.sin(t), y: d.centre.y + q.x * Math.sin(t) + q.y * Math.cos(t) }));
  if (box.some((q) => insidePoly(q, poly)) || poly.some((q) => insidePoly(q, box))) return true;
  const cross = (a: Point, b: Point, c: Point, e: Point) => {
    const o = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) * o(a, b, e) < 0 && o(c, e, a) * o(c, e, b) < 0;
  };
  return box.some((a, i) => poly.some((c, k) => cross(a, box[(i + 1) % 4], c, poly[(k + 1) % poly.length])));
}

/** The recesses inner flights cut into the base (level absent) or into one level, in its frame. */
function recesses(stage: StageBuild, level: string | undefined, deckOf: DeckLookup): Point[][] {
  return (stage.stairs ?? [])
    .filter((it) => it.level === level && edgeKind(it) === "stairs" && isInner(it))
    .map((it) => edgeItemShape(stage, it, deckOf)?.polygon)
    .filter((q): q is Point[] => !!q);
}

/** The build carried out into the room — where "פירוק לפלטות" puts each deck. */
export function stageDecksInRoom(p: StagePlacement, deckOf: DeckLookup): StageDeck[] {
  return layStage(p.stage, deckOf).decks.map((d) => {
    const c = toRoom(p, d.centre);
    return {
      ...d,
      centre: { x: Math.round(c.x), y: Math.round(c.y) },
      rotation: norm360((p.mirrored ? -d.rotation : d.rotation) + (p.rotation || 0)),
    };
  });
}

/** How many of each deck the stage is built from. */
export function stageDeckCounts(stage: StageBuild, deckOf: DeckLookup): Map<string, StageDeck[]> {
  const out = new Map<string, StageDeck[]>();
  for (const d of layStage(stage, deckOf).decks) out.set(d.typeId, [...(out.get(d.typeId) ?? []), d]);
  return out;
}

// ── Edge items: stairs, banquettes, barriers ──────────────────────────────────────────────────
//
// EVERY OPEN EDGE IS FINISHED. A stage edge nobody can step off safely is the one thing a stage plan
// must never show, so each edge that is not against a wall is covered — by stairs (the default: a
// new stage gets them along every open side), a banquette people sit on, or a barrier. What is left
// bare is found by edgeGaps and said out loud, with a one-click fill.

/** A banquette: as deep as a seat, as high as one (but never above the stage it leans on). */
export const BENCH_DEPTH_MM = 450;
export const BENCH_HEIGHT_MM = 450;
/** The room one person takes on a banquette — what its seat count is measured in. */
export const SEAT_WIDTH_MM = 600;
/** A barrier's drawn thickness, along the inside of its edge. */
export const BARRIER_MM = 60;
/** A backdrop's: a framed wall, on the edge, inside the outline. */
export const BACKDROP_MM = 120;
/** A ramp climbs one unit in twelve — the accessible gradient — and is wide enough for a chair. */
export const RAMP_SLOPE = 12;
export const RAMP_WIDTH_MM = 1200;

export const edgeKind = (item: Pick<StageStair, "kind">): StageEdgeKind => item.kind ?? "stairs";

/** Whether an item is set INTO the stage (StageStair.inner) — stairs and banquettes only. */
export const isInner = (item: Pick<StageStair, "kind" | "inner">): boolean => {
  const k = edgeKind(item);
  return item.inner === true && (k === "stairs" || k === "bench");
};

// ── Sides: one edge, or a run of edges the outline curves through ────────────────────────────
//
// An edge item stands on a SIDE. On a stage of straight sides a side is one edge, and nothing about
// that changed. A curved rim (StageBuild.smooth — a round stage is a fine polygon) is ONE side made
// of many short chords, and an item on it is measured along the curve: `edge` names the side's
// first edge and `t` is how far along the whole side its middle is. A side whose every corner is
// smooth goes all the way round (`closed`); its first edge is edge 0, and an item may straddle it.

const NO_SMOOTH: ReadonlySet<number> = new Set();

function outlineOf(stage: StageBuild, level: string | undefined): Point[] | undefined {
  return level ? stage.levels?.find((l) => l.id === level)?.outline : stage.outline;
}

export interface StageSide {
  level?: string;
  outline: Point[];
  /** Its first edge — what an item on it stores as `edge`. */
  edge: number;
  edges: number[];
  /** Its corners in order, `edges.length + 1` of them (a closed side ends where it began). */
  points: Point[];
  /** How far along it each of `points` is, mm. */
  cum: number[];
  L: number;
  closed: boolean;
  /** More than one edge: it bends. */
  curved: boolean;
  /** The outline's winding: the outward normal of a direction u along it is (sg·u.y, −sg·u.x). */
  sg: 1 | -1;
}

/** The side edge `edge` (of the stage's outline, or of level `level`'s) belongs to. */
export function stageSide(stage: StageBuild, level: string | undefined, edge: number): StageSide | null {
  const outline = outlineOf(stage, level);
  if (!outline || !Number.isInteger(edge) || edge < 0 || edge >= outline.length) return null;
  const n = outline.length;
  const smooth = level || !stage.smooth?.length ? NO_SMOOTH : new Set(stage.smooth);
  let start = edge;
  let back = 0;
  while (smooth.has(start) && back < n) {
    start = (start - 1 + n) % n;
    back++;
  }
  const closed = back >= n;
  if (closed) start = 0;
  const edges = [start];
  while (edges.length < n && smooth.has((edges[edges.length - 1] + 1) % n)) edges.push((edges[edges.length - 1] + 1) % n);
  const points = [...edges.map((k) => outline[k]), outline[(edges[edges.length - 1] + 1) % n]];
  const cum = [0];
  for (let k = 1; k < points.length; k++) cum.push(cum[k - 1] + len(points[k - 1], points[k]));
  return { level, outline, edge: start, edges, points, cum, L: cum[cum.length - 1], closed, curved: edges.length > 1, sg: signedArea(outline) >= 0 ? 1 : -1 };
}

/** Every side of the stage's outline (or a level's), each once. */
export function stageSides(stage: StageBuild, level?: string): StageSide[] {
  const outline = outlineOf(stage, level);
  if (!outline) return [];
  const seen = new Set<number>();
  const out: StageSide[] = [];
  for (let i = 0; i < outline.length; i++) {
    if (seen.has(i)) continue;
    const s = stageSide(stage, level, i);
    if (!s) continue;
    s.edges.forEach((k) => seen.add(k));
    out.push(s);
  }
  return out;
}

/** The point `s` mm along a side, the direction it runs there and its outward normal. A closed side
 *  wraps round; an open one is held to its ends. On a bend the direction is the curve's tangent. */
export function sideFrame(side: StageSide, s: number): { p: Point; u: Point; n: Point } {
  const pos = (v: number): Point => {
    const x = side.closed ? ((v % side.L) + side.L) % side.L : Math.max(0, Math.min(side.L, v));
    let k = 0;
    while (k < side.points.length - 2 && side.cum[k + 1] < x) k++;
    const a = side.points[k];
    const b = side.points[k + 1];
    const f = (x - side.cum[k]) / (side.cum[k + 1] - side.cum[k] || 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  const p = pos(s);
  const [a, b] = side.curved ? [pos(s - 20), pos(s + 20)] : [side.points[0], side.points[1]];
  const l = len(a, b) || 1;
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  return { p, u, n: { x: side.sg * u.y, y: -side.sg * u.x } };
}

/** Positions from `s0` to `s1` along a side, with every corner between them — what a line drawn
 *  along a stretch of a curved side needs to follow it. Just the two ends on a straight side. */
function sideStops(side: StageSide, s0: number, s1: number): number[] {
  if (!side.curved) return [s0, s1];
  const lo = Math.min(s0, s1);
  const hi = Math.max(s0, s1);
  const inner = new Set<number>();
  for (const c of side.cum)
    for (const j of side.closed ? [-1, 0, 1] : [0]) {
      const v = Math.round((c + j * side.L) * 1000) / 1000;
      if (v > lo + 1 && v < hi - 1) inner.add(v);
    }
  const mids = [...inner].sort((x, y) => x - y);
  return [s0, ...(s1 < s0 ? mids.reverse() : mids), s1];
}

/** A clicked (edge, t along THAT edge) as the side it is on: its first edge, and t along the side.
 *  The same pair on a straight side. */
export function sidePosition(stage: StageBuild, level: string | undefined, edge: number, t: number): { edge: number; t: number } {
  const side = stageSide(stage, level, edge);
  if (!side || !side.curved || side.L <= 0) return { edge: side?.edge ?? edge, t };
  const k = side.edges.indexOf(edge);
  const s = side.cum[k] + t * (side.cum[k + 1] - side.cum[k]);
  return { edge: side.edge, t: s / side.L };
}

/** The outline an edge item stands against: the stage's, or its level's — and the EDGE its `edge`
 *  names (on a curved side, only the first chord of it; stageSide is the whole side). */
export function itemEdge(stage: StageBuild, stair: StageStair): { outline: Point[]; a: Point; b: Point } | null {
  const outline = outlineOf(stage, stair.level);
  if (!outline || stair.edge < 0 || stair.edge >= outline.length) return null;
  const [a, b] = edgeOf(outline, stair.edge);
  return { outline, a, b };
}

/** The stretch of its side an item covers, in mm from the side's start: the whole side when
 *  `full`, else its width centred at `t`, slid back so it never hangs past a corner. On a side that
 *  goes all the way round there is no corner: `from` may be below 0 or `to` past L — it wraps. */
export function itemSpan(stage: StageBuild, item: StageStair): { from: number; to: number; L: number } | null {
  const side = stageSide(stage, item.level, item.edge);
  if (!side) return null;
  const L = side.L;
  if (L <= 0) return null;
  const w = item.full ? L : Math.min(item.widthMm, L);
  const half = w / 2;
  const mid = side.closed && !item.full ? item.t * L : Math.min(L - half, Math.max(half, item.t * L));
  return { from: mid - half, to: mid + half, L };
}

/** A point under the pointer as an item's side reads it: mm along the side (`s`), mm out from it
 *  (`o`, negative = inside the stage), and the side's length. */
export function itemAlong(stage: StageBuild, item: StageStair, q: Point): { s: number; o: number; L: number } | null {
  const side = stageSide(stage, item.level, item.edge);
  if (!side) return null;
  let best = { d: Infinity, s: 0, o: 0 };
  for (let k = 0; k < side.points.length - 1; k++) {
    const a = side.points[k];
    const b = side.points[k + 1];
    const l = side.cum[k + 1] - side.cum[k] || 1;
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    const along = (q.x - a.x) * u.x + (q.y - a.y) * u.y;
    const out = (q.x - a.x) * side.sg * u.y - (q.y - a.y) * side.sg * u.x;
    const clamped = Math.max(0, Math.min(l, along));
    const d = Math.hypot(along - clamped, out);
    // The first and last chords reach past the side's ends, so a drag can still push an end out.
    const s = k === 0 && along < 0 ? along : k === side.points.length - 2 && along > l ? side.cum[k] + along : side.cum[k] + clamped;
    if (d < best.d) best = { d, s, o: out };
  }
  return { s: best.s, o: best.o, L: side.L };
}

/** The point `s` mm along an item's side, on it. */
export function itemSidePoint(stage: StageBuild, item: StageStair, s: number): Point | null {
  const side = stageSide(stage, item.level, item.edge);
  return side ? sideFrame(side, s).p : null;
}

/** The height a flight climbs: floor to base, or base up to its level. */
export function stairRise(stage: StageBuild, stair: StageStair, deckOf: DeckLookup): number {
  const baseH = stageHeight(stage, deckOf);
  if (!stair.level) return baseH;
  const l = stage.levels?.find((x) => x.id === stair.level);
  return l ? Math.max(0, l.heightMm - baseH) : 0;
}

/** The steps a flight needs to climb `riseMm` comfortably — each riser at most RISER_MAX_MM. */
export function autoRisers(riseMm: number): number {
  return Math.max(1, Math.ceil(riseMm / RISER_MAX_MM));
}

export interface EdgeItemShape {
  kind: StageEdgeKind;
  /** Set into the stage (StageStair.inner): a recessed flight, a banquette on the deck. */
  inner: boolean;
  /** Its footprint, in the stage's frame. A rectangle on a straight side; on a curved side it
   *  follows the curve (a ramp excepted — it stands straight, on the tangent at its middle). */
  polygon: Point[];
  /** Lines across it — a flight's treads. */
  treads: [Point, Point][];
  /** Its middle ON the edge, and straight across from it at its far side — what stands against a
   *  wall and what reaches the floor. */
  base: Point;
  foot: Point;
  /** Its far line, edge to edge (two points on a straight side). */
  farLine: Point[];
  /** A line down its middle, end to end — where a banquette's dressing is spread. */
  midline: Point[];
  /** The direction the edge runs at its middle, degrees, in the stage's frame. */
  angleDeg: number;
  /** Along the edge, mm. */
  widthMm: number;
  /** Out from the edge (stairs, bench) or in from it (barrier, and anything inner), mm. */
  depthMm: number;
  /** Stairs: what it climbs, in how many steps of how much. */
  risers: number;
  riserMm: number;
  riseMm: number;
  /** Bench: its height, and how many sit at it — and where each chair stands: BEHIND it, on the
   *  stage, tucked under its inner edge and facing out over it into the room, as a head table's
   *  chairs are (in the stage's frame, as a table's chairs are in its). */
  heightMm: number;
  seats: number;
  chairs: Seat[];
}
export type StairShape = EdgeItemShape;

/** Where an edge item stands and what it is. A FLIGHT: as many risers as keep each under
 *  RISER_MAX_MM (or as many as the designer set), one tread fewer than risers (the last step up is
 *  the stage itself), each TREAD_MM deep — outside the edge, or recessed into the stage behind it
 *  when `inner`. A BENCH: a seat-deep strip outside the edge, or on the deck inside it. A BARRIER:
 *  a thin strip just inside it, on the stage. */
export function edgeItemShape(stage: StageBuild, item: StageStair, deckOf: DeckLookup): EdgeItemShape | null {
  const side = stageSide(stage, item.level, item.edge);
  const span = itemSpan(stage, item);
  if (!side || !span) return null;
  const kind = edgeKind(item);
  const inner = isInner(item);
  const riseMm = stairRise(stage, item, deckOf);
  if (kind === "stairs" && riseMm <= 0) return null;
  const w = span.to - span.from;
  const half = w / 2;
  const mid = span.from + half;
  const m = sideFrame(side, mid);
  // x is mm along the edge from the item's middle, y mm out from it (negative = into the stage). On
  // a straight side that is the plain frame of the edge. On a curved side an item FOLLOWS the curve
  // — x along the rim, y along the normal there — save a ramp, which must be straight and stands on
  // the tangent at its middle.
  const bent = side.curved && kind !== "ramp";
  const at = (x: number, y: number): Point => {
    if (!bent) return { x: m.p.x + m.u.x * x + m.n.x * y, y: m.p.y + m.u.y * x + m.n.y * y };
    const f = sideFrame(side, mid + x);
    return { x: f.p.x + f.n.x * y, y: f.p.y + f.n.y * y };
  };
  const xs = bent ? sideStops(side, mid - half, mid + half).map((s) => s - mid) : [-half, half];
  const line = (y: number) => xs.map((x) => at(x, y));
  const strip = (y0: number, y1: number) => [...line(y0), ...line(y1).reverse()];
  const segs = (y: number): [Point, Point][] => {
    const l = line(y);
    return l.slice(1).map((q, i) => [l[i], q] as [Point, Point]);
  };
  const angleDeg = (Math.atan2(m.u.y, m.u.x) * 180) / Math.PI;
  const shape = (s: { polygon: Point[]; treads?: [Point, Point][]; depth: number; reach: number; risers?: number; riserMm?: number; heightMm?: number; seats?: number; chairs?: Seat[] }): EdgeItemShape => ({
    kind,
    inner,
    polygon: s.polygon,
    treads: s.treads ?? [],
    base: at(0, 0),
    foot: at(0, s.reach),
    farLine: line(s.reach),
    midline: line(s.reach / 2),
    angleDeg,
    widthMm: w,
    depthMm: s.depth,
    risers: s.risers ?? 0,
    riserMm: s.riserMm ?? 0,
    riseMm,
    heightMm: s.heightMm ?? 0,
    seats: s.seats ?? 0,
    chairs: s.chairs ?? [],
  });
  if (kind === "barrier" || kind === "backdrop") {
    const thick = kind === "barrier" ? BARRIER_MM : BACKDROP_MM;
    return shape({ polygon: strip(0, -thick), depth: thick, reach: -thick });
  }
  if (kind === "bench") {
    const depthMm = item.depthMm && item.depthMm > 0 ? item.depthMm : BENCH_DEPTH_MM;
    // The banquette is set like a table: chairs stand beside it on the STAGE side, pushed in under
    // its edge, facing it and the room past it. As many as were asked for (never more than fit
    // shoulder to shoulder), else one per SEAT_WIDTH_MM; spread evenly along it. An inner one stands
    // on the deck itself, so its chairs stand further in, behind it.
    const most = Math.max(0, Math.floor(w / CHAIR_W_MM));
    const seats = Math.min(most, item.seats !== undefined ? Math.max(0, Math.round(item.seats)) : Math.floor(w / SEAT_WIDTH_MM));
    const chairY = inner ? -(depthMm + CHAIR_OFFSET_MM) : -CHAIR_OFFSET_MM;
    const chairs: Seat[] = Array.from({ length: seats }, (_, i) => {
      const x = -half + ((i + 0.5) * w) / seats;
      const q = at(x, chairY);
      const n = bent ? sideFrame(side, mid + x).n : m.n;
      return { x: q.x, y: q.y, facingDeg: (Math.atan2(n.y, n.x) * 180) / Math.PI };
    });
    const reach = inner ? -depthMm : depthMm;
    // Outside, a banquette leans on the stage and is never taller than it; on the deck it is a seat.
    const seatH = item.heightMm && item.heightMm > 0 ? item.heightMm : BENCH_HEIGHT_MM;
    return shape({ polygon: strip(0, reach), depth: depthMm, reach, heightMm: inner ? seatH : Math.min(seatH, riseMm || BENCH_HEIGHT_MM), seats, chairs });
  }
  if (kind === "ramp") {
    if (riseMm <= 0) return null;
    const depthMm = Math.max(1000, Math.round(riseMm * RAMP_SLOPE));
    // An arrow up the ramp, foot to stage — what a ramp is drawn with on a plan.
    const tip = at(0, 0);
    const foot = at(0, depthMm);
    const head = Math.min(half, 400);
    return shape({
      polygon: strip(0, depthMm),
      treads: [
        [foot, tip],
        [tip, at(-head * 0.6, head)],
        [tip, at(head * 0.6, head)],
      ],
      depth: depthMm,
      reach: depthMm,
    });
  }
  const risers = item.risers && item.risers > 0 ? Math.round(item.risers) : autoRisers(riseMm);
  const treads = Math.max(1, risers - 1);
  const depthMm = treads * TREAD_MM;
  // Outside the edge, or — inner — the same flight sunk into the stage: its first riser at the edge,
  // its last onto the deck `depthMm` in.
  const dir = inner ? -1 : 1;
  const lines: [Point, Point][] = [];
  for (let k = 1; k < treads; k++) lines.push(...segs(dir * k * TREAD_MM));
  return shape({ polygon: strip(0, dir * depthMm), treads: lines, depth: depthMm, reach: dir * depthMm, risers, riserMm: Math.round(riseMm / risers) });
}

/** A flight's shape — null for anything that is not stairs. */
export function stairShape(stage: StageBuild, stair: StageStair, deckOf: DeckLookup): EdgeItemShape | null {
  return edgeKind(stair) === "stairs" ? edgeItemShape(stage, stair, deckOf) : null;
}

/** Whether an item may stand where it was put — or why not: its side is against a wall (stairs and
 *  benches need floor in front of them; an INNER flight needs only room at the edge to step up
 *  from), the edge is too short, a flight has nothing to climb, or the stage is one round piece
 *  nothing can be recessed into ("solid"). */
export function stairFits(
  p: StagePlacement,
  stair: StageStair,
  deckOf: DeckLookup,
  wallDistance?: WallDistance,
): { ok: true } | { ok: false; reason: "wall" | "short" | "flat" | "solid" } {
  const shape = edgeItemShape(p.stage, stair, deckOf);
  if (!shape) return { ok: false, reason: stairRise(p.stage, stair, deckOf) <= 0 ? "flat" : "short" };
  const side = stageSide(p.stage, stair.level, stair.edge);
  if (side && !stair.full && side.L < Math.min(stair.widthMm, 600) * 0.6) return { ok: false, reason: "short" };
  if (shape.inner && shape.kind === "stairs" && !stair.level && stageIsOnePiece(p.stage, deckOf)) return { ok: false, reason: "solid" };
  if (wallDistance && !stair.level && shape.kind !== "barrier" && shape.kind !== "backdrop") {
    const r = (q: Point) => toRoom(p, q);
    if (shape.inner) {
      // Set into the stage, it needs no floor of its own — only a side that is not against the wall.
      if (wallDistance(r(shape.base)) <= WALL_HUG_MM) return { ok: false, reason: "wall" };
    } else {
      // The side it stands against is against a wall, or a wall runs through where it would go, or
      // its foot ends at one: a flight nobody can walk up, a bench nobody can sit on.
      const centre = { x: (shape.base.x + shape.foot.x) / 2, y: (shape.base.y + shape.foot.y) / 2 };
      if (wallDistance(r(shape.base)) <= WALL_HUG_MM || wallDistance(r(centre)) < shape.depthMm / 2 - 50 || wallDistance(r(shape.foot)) < 100) {
        return { ok: false, reason: "wall" };
      }
      // A curved one reaches the floor all along its length.
      if (shape.farLine.length > 2 && shape.farLine.some((q) => wallDistance(r(q)) < 100)) return { ok: false, reason: "wall" };
    }
  }
  return { ok: true };
}

/** Where a stairs or banquette item can stand, worked out from what it was asked to be: outside
 *  where there is floor for it; else (`inner`) set into the stage where the side has room to step
 *  from; else `otherwise` — a barrier, or the item left as it was. Other kinds, and items already
 *  inner, are returned as they are. On a curved side the item is split where the floor runs out, so
 *  a round stage near a wall keeps its stairs everywhere else. */
export function settleEdgeItems(
  p: StagePlacement,
  items: readonly StageStair[],
  deckOf: DeckLookup,
  newId: () => string,
  wallDistance: WallDistance | undefined,
  opts: { inner: boolean; otherwise: "barrier" | "keep" },
): StageStair[] {
  const fallback = (it: StageStair): StageStair => {
    if (opts.inner) {
      const sunk = { ...it, inner: true };
      if (stairFits(p, sunk, deckOf, wallDistance).ok) return sunk;
    }
    if (opts.otherwise === "keep") return it;
    const { inner: _in, ...rest } = it;
    return { ...rest, kind: "barrier" };
  };
  return items.flatMap((it) => {
    const k = edgeKind(it);
    if ((k !== "stairs" && k !== "bench") || isInner(it)) return [it];
    if (stairFits(p, it, deckOf, wallDistance).ok) return [it];
    const side = stageSide(p.stage, it.level, it.edge);
    const span = itemSpan(p.stage, it);
    const shape = edgeItemShape(p.stage, it, deckOf);
    if (!side?.curved || !span || !shape || !wallDistance || it.level) return [fallback(it)];
    // Along the curve: which stretches have floor in front of them, and which do not.
    const fitsAt = (s: number) => {
      const f = sideFrame(side, s);
      const at = (d: number) => toRoom(p, { x: f.p.x + f.n.x * d, y: f.p.y + f.n.y * d });
      return wallDistance(at(0)) > WALL_HUG_MM && wallDistance(at(shape.depthMm / 2)) >= shape.depthMm / 2 - 50 && wallDistance(at(shape.depthMm)) >= 100;
    };
    const stops = sideStops(side, span.from, span.to);
    const runs: { from: number; to: number; ok: boolean }[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const ok = fitsAt((stops[i] + stops[i + 1]) / 2);
      const last = runs[runs.length - 1];
      if (last && last.ok === ok) last.to = stops[i + 1];
      else runs.push({ from: stops[i], to: stops[i + 1], ok });
    }
    // A sliver under 30cm is not worth a change of kind: it goes with what is beside it.
    for (let i = 0; i < runs.length; i++) {
      if (runs.length > 1 && runs[i].to - runs[i].from < 300) {
        const j = i > 0 ? i - 1 : i + 1;
        runs[j] = { from: Math.min(runs[j].from, runs[i].from), to: Math.max(runs[j].to, runs[i].to), ok: runs[j].ok };
        runs.splice(i, 1);
        i = -1;
      }
    }
    let first = true;
    return runs.map((r) => {
      const { full: _f, ...rest } = it;
      const piece: StageStair = {
        ...rest,
        id: first ? it.id : newId(),
        t: ((((r.from + r.to) / 2) % side.L) + side.L) % side.L / side.L,
        widthMm: Math.round(r.to - r.from),
        ...(r.from <= span.from + 1 && r.to >= span.to - 1 && it.full ? { full: true } : {}),
      };
      first = false;
      return r.ok ? piece : fallback(piece);
    });
  });
}

/** One item clicked onto a side, settled: outside if it fits; else set into the stage when the
 *  side is too close to a wall for its run (the one way stairs go there); else why not. */
export function placeEdgeItem(
  p: StagePlacement,
  item: StageStair,
  deckOf: DeckLookup,
  wallDistance?: WallDistance,
): { ok: true; item: StageStair } | { ok: false; reason: "wall" | "short" | "flat" | "solid" } {
  const fits = stairFits(p, item, deckOf, wallDistance);
  if (fits.ok) return { ok: true, item };
  const k = edgeKind(item);
  if (fits.reason === "wall" && (k === "stairs" || k === "bench") && !isInner(item)) {
    const sunk = { ...item, inner: true };
    if (stairFits(p, sunk, deckOf, wallDistance).ok) return { ok: true, item: sunk };
  }
  return fits;
}

// ── Open edges, and what covers them ─────────────────────────────────────────────────────────

interface OpenEdge {
  level?: string;
  /** The side's first edge. */
  edge: number;
  side: StageSide;
  L: number;
  /** The stretches of it that need finishing, mm along it: all of a straight side off the walls;
   *  a curved side can be against a wall for part of its length. On a side all the way round a
   *  stretch may run past L (it wraps). */
  open: [number, number][];
  dropMm: number;
  front: boolean;
  /** A level's side standing on the stage's own outer edge — it drops all the way to the floor. */
  outer?: boolean;
}

/** Every edge that needs finishing: the stage's own sides that are not against a wall, and each
 *  level's faces that look down onto the base (a level side ON the stage's edge is the stage's
 *  edge, and is counted there). */
function needyEdges(p: StagePlacement, deckOf: DeckLookup, wallDistance?: WallDistance): OpenEdge[] {
  const stage = p.stage;
  const baseH = stageHeight(stage, deckOf);
  const hugs = (a: Point, b: Point) => !!wallDistance && wallDistance(toRoom(p, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) <= WALL_HUG_MM;
  const out: OpenEdge[] = [];
  for (const side of stageSides(stage)) {
    if (side.L < 1) continue;
    const open: [number, number][] = [];
    for (let k = 0; k < side.edges.length; k++) {
      if (hugs(side.points[k], side.points[k + 1])) continue;
      const last = open[open.length - 1];
      if (last && Math.abs(last[1] - side.cum[k]) < 1e-6) last[1] = side.cum[k + 1];
      else open.push([side.cum[k], side.cum[k + 1]]);
    }
    // All the way round, the stretch that ends at the start goes on past it.
    if (side.closed && open.length > 1 && open[0][0] < 1e-6 && open[open.length - 1][1] > side.L - 1e-6) {
      const first = open.shift()!;
      open[open.length - 1][1] = side.L + first[1];
    }
    if (open.length) out.push({ edge: side.edge, side, L: side.L, open, dropMm: baseH, front: !side.curved && side.edge === stage.front });
  }
  for (const l of stage.levels ?? []) {
    const drop = l.heightMm - baseH;
    l.outline.forEach((_, i) => {
      const [a, b] = edgeOf(l.outline, i);
      const L = len(a, b);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const side = stageSide(stage, l.id, i);
      if (L < 1 || !side) return;
      if (onBoundary(mid, stage.outline)) {
        if (!hugs(a, b)) out.push({ level: l.id, edge: i, side, L, open: [[0, L]], dropMm: l.heightMm, front: segDist(mid, ...edgeOf(stage.outline, stage.front)) <= 50, outer: true });
        return;
      }
      if (drop > 0) out.push({ level: l.id, edge: i, side, L, open: [[0, L]], dropMm: drop, front: false });
    });
  }
  return out;
}

/** The stretches of [lo, hi] NOT covered by the given intervals. */
function uncoveredIn(lo: number, hi: number, spans: [number, number][]): [number, number][] {
  const sorted = spans
    .map(([f, t]) => [Math.max(lo, f), Math.min(hi, t)] as [number, number])
    .filter(([f, t]) => t > f)
    .sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let at = lo;
  for (const [f, t] of sorted) {
    if (f > at + 1) out.push([at, f]);
    at = Math.max(at, t);
  }
  if (hi > at + 1) out.push([at, hi]);
  return out;
}

/** The spans of a side that the items passing `which` cover — repeated a lap either way round on a
 *  side that closes, so a stretch past L or an item straddling the start is still seen. */
function spansOn(stage: StageBuild, e: OpenEdge, which: (it: StageStair) => boolean): [number, number][] {
  const laps = e.side.closed ? [-e.L, 0, e.L] : [0];
  return (stage.stairs ?? [])
    .filter((it) => it.level === e.level && which(it) && stageSide(stage, it.level, it.edge)?.edge === e.edge)
    .map((it) => itemSpan(stage, it))
    .filter((s): s is { from: number; to: number; L: number } => !!s)
    .flatMap((s) => laps.map((d) => [s.from + d, s.to + d] as [number, number]));
}

const kindIn =
  (...kinds: StageEdgeKind[]) =>
  (it: StageStair) =>
    kinds.includes(edgeKind(it));

export interface EdgeRun {
  /** In the stage's frame. */
  a: Point;
  b: Point;
  /** a → b along the side, through every corner between (just [a, b] on a straight side). */
  path: Point[];
  lengthMm: number;
  /** How far this run drops — the skirt's height here, and what the railing guards against. */
  dropMm: number;
  /** A face of a raised level, rather than the stage's outer edge. */
  level?: string;
  /** The side it lies on (its first edge, of the stage or of `level`), and where along it, mm. */
  edge: number;
  from: number;
  to: number;
  /** The stage's own front — the edge the audience watches, which gets a skirt and never a rail. */
  front: boolean;
}

const runsOf = (e: OpenEdge, parts: [number, number][]): EdgeRun[] =>
  parts.map(([f, t]) => {
    const path = sideStops(e.side, f, t).map((s) => sideFrame(e.side, s).p);
    return {
      a: path[0],
      b: path[path.length - 1],
      path,
      lengthMm: t - f,
      dropMm: e.dropMm,
      level: e.level,
      edge: e.edge,
      from: f,
      to: t,
      front: e.front,
    };
  });

/** Every stretch of an open edge that NOTHING covers — no stairs, no banquette, no barrier. These are
 *  the edges somebody can walk off, and the stage bar asks for them to be filled. */
export function edgeGaps(p: StagePlacement, deckOf: DeckLookup, wallDistance?: WallDistance): EdgeRun[] {
  const any = kindIn("stairs", "bench", "barrier", "backdrop", "ramp");
  return needyEdges(p, deckOf, wallDistance).flatMap((e) => e.open.flatMap(([lo, hi]) => runsOf(e, uncoveredIn(lo, hi, spansOn(p.stage, e, any)))));
}

/** Every open edge with how far it drops — less the stretches a flight or a banquette stands
 *  against. That is where the SKIRT hangs (a barrier stands on the stage, and so does an inner
 *  banquette, so the skirt still hangs below them; an inner flight's recess leaves no deck face to
 *  skirt). A level's side on the stage's own edge is skirted as part of that edge. */
export function openEdges(p: StagePlacement, deckOf: DeckLookup, wallDistance?: WallDistance): EdgeRun[] {
  const against = (it: StageStair) => kindIn("stairs", "ramp")(it) || (edgeKind(it) === "bench" && !isInner(it));
  return needyEdges(p, deckOf, wallDistance)
    .filter((e) => !e.outer)
    .flatMap((e) => e.open.flatMap(([lo, hi]) => runsOf(e, uncoveredIn(lo, hi, spansOn(p.stage, e, against)))));
}

/** Metres of skirt: every open edge, less what stands against it. */
export function skirtMm(p: StagePlacement, deckOf: DeckLookup, wallDistance?: WallDistance): number {
  return openEdges(p, deckOf, wallDistance).reduce((s, r) => s + r.lengthMm, 0);
}

/** Where a BARRIER is needed and missing, when the studio has said above what height one is (a studio
 *  setting, off by default — a safety rule is the studio's to state, not the app's to guess): every
 *  open edge that drops more than that, except the front, less what a barrier or a flight already
 *  covers. A banquette does not count — it is a seat, and a seat is not a rail. */
export function railingRuns(p: StagePlacement, deckOf: DeckLookup, aboveMm: number | null | undefined, wallDistance?: WallDistance): EdgeRun[] {
  if (!aboveMm || aboveMm <= 0) return [];
  const covers = kindIn("barrier", "backdrop", "stairs", "ramp");
  return needyEdges(p, deckOf, wallDistance)
    .filter((e) => !e.front && e.dropMm > aboveMm)
    .flatMap((e) => e.open.flatMap(([lo, hi]) => runsOf(e, uncoveredIn(lo, hi, spansOn(p.stage, e, covers)))));
}

/** Items that cover every gap with `kind` — the one-click "finish the edges". Ids from `newId`. */
export function fillGaps(p: StagePlacement, deckOf: DeckLookup, kind: StageEdgeKind, newId: () => string, wallDistance?: WallDistance): StageStair[] {
  return edgeGaps(p, deckOf, wallDistance).map((g) => {
    const L = stageSide(p.stage, g.level, g.edge)?.L ?? g.to;
    const whole = g.from <= 1 && g.to >= L - 1;
    return {
      id: newId(),
      kind,
      ...(g.level ? { level: g.level } : {}),
      edge: g.edge,
      t: ((((g.from + g.to) / 2) % L) + L) % L / L,
      widthMm: Math.round(g.to - g.from),
      ...(whole ? { full: true } : {}),
    };
  });
}

/** A new stage's finish: stairs along every open side — the default the studio asked for — or a
 *  barrier where there is no floor in front of the side for a flight to stand on. (Set into the
 *  stage is a choice the designer makes, not a default: a whole side recessed eats a strip of deck.) */
export function defaultEdgeItems(p: StagePlacement, deckOf: DeckLookup, newId: () => string, wallDistance?: WallDistance): StageStair[] {
  const items = fillGaps(p, deckOf, "stairs", newId, wallDistance).filter((it) => !it.level);
  return settleEdgeItems(p, items, deckOf, newId, wallDistance, { inner: false, otherwise: "barrier" });
}

/** One item clicked onto an edge — `edge` and `t` as clicked, along THAT edge of the outline: when
 *  the click lands in a bare stretch, the item covers that whole stretch — which is nearly always
 *  what was meant — else a standard width centred on it. */
export function itemAt(p: StagePlacement, deckOf: DeckLookup, kind: StageEdgeKind, level: string | undefined, edge: number, t: number, id: string, wallDistance?: WallDistance): StageStair {
  const pos = sidePosition(p.stage, level, edge, t);
  const L = stageSide(p.stage, level, pos.edge)?.L ?? 1;
  const at = pos.t * L;
  const within = (g: EdgeRun, v: number) => v >= g.from - 1 && v <= g.to + 1;
  const gap = edgeGaps(p, deckOf, wallDistance).find((g) => g.level === level && g.edge === pos.edge && (within(g, at) || within(g, at + L) || within(g, at - L)));
  if (gap) {
    const whole = gap.from <= 1 && gap.to >= L - 1;
    return { id, kind, ...(level ? { level } : {}), edge: pos.edge, t: ((((gap.from + gap.to) / 2) % L) + L) % L / L, widthMm: Math.round(gap.to - gap.from), ...(whole ? { full: true } : {}) };
  }
  return { id, kind, ...(level ? { level } : {}), edge: pos.edge, t: pos.t, widthMm: kind === "stairs" ? STAIR_WIDTH_MM : kind === "ramp" ? RAMP_WIDTH_MM : 2000 };
}

// ── Corners, area, seats ──────────────────────────────────────────────────────────────────────

export interface CornerPiece {
  kind: "stairs" | "bench";
  level?: string;
  /** In the stage's frame. */
  polygon: Point[];
  /** A corner flight's treads, as L-shaped lines. */
  treads: [Point, Point][];
  depthMm: number;
}

/** The item on `edge` (of the stage, or of `level`) that runs into its END (atEnd) or its START. */
function runInto(stage: StageBuild, level: string | undefined, edge: number, atEnd: boolean): StageStair | undefined {
  const side = stageSide(stage, level, edge)?.edge;
  return (stage.stairs ?? []).find((it) => {
    if (it.level !== level || isInner(it) || stageSide(stage, level, it.edge)?.edge !== side) return false;
    const sp = itemSpan(stage, it);
    return !!sp && (atEnd ? sp.to >= sp.L - 1 : sp.from <= 1);
  });
}

/** The outside corners two runs meet at. Where stairs (or banquettes) on two sides of an outside
 *  corner both run into it, the square between their ends is empty on the floor — a crew fills it
 *  with a corner piece, and so does the plan: a corner step with its treads turning the corner, or a
 *  corner seat. Off when the stage says `corners: false`. */
export function stageCorners(stage: StageBuild, deckOf: DeckLookup): CornerPiece[] {
  if (stage.corners === false) return [];
  const out: CornerPiece[] = [];
  const outlines: { level?: string; outline: Point[] }[] = [
    { outline: stage.outline },
    ...(stage.levels ?? []).map((l) => ({ level: l.id as string | undefined, outline: l.outline })),
  ];
  const unit = (p: Point, q: Point) => {
    const L = len(p, q) || 1;
    return { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
  };
  for (const { level, outline } of outlines) {
    const n = outline.length;
    const sg = signedArea(outline) >= 0 ? 1 : -1;
    // A curve runs through its corners; only a real corner can have a corner piece.
    const smooth = new Set(level ? [] : (stage.smooth ?? []));
    for (let v = 0; v < n; v++) {
      if (smooth.has(v)) continue;
      const prev = (v - 1 + n) % n;
      const a = outline[prev];
      const c = outline[v];
      const b = outline[(v + 1) % n];
      // Outside corners only: the outline turns the way it winds.
      const turn = (c.x - a.x) * (b.y - c.y) - (c.y - a.y) * (b.x - c.x);
      if (turn * sg <= 0) continue;
      const ending = runInto(stage, level, prev, true);
      const starting = runInto(stage, level, v, false);
      if (!ending || !starting) continue;
      const kind = edgeKind(ending);
      if ((kind !== "stairs" && kind !== "bench") || edgeKind(starting) !== kind) continue;
      const s1 = edgeItemShape(stage, ending, deckOf);
      const s2 = edgeItemShape(stage, starting, deckOf);
      if (!s1 || !s2) continue;
      const u1 = unit(a, c);
      const u2 = unit(c, b);
      const n1 = { x: sg * u1.y, y: -sg * u1.x };
      const n2 = { x: sg * u2.y, y: -sg * u2.x };
      const d = Math.min(s1.depthMm, s2.depthMm);
      const at = (k1: number, k2: number) => ({ x: c.x + n1.x * k1 + n2.x * k2, y: c.y + n1.y * k1 + n2.y * k2 });
      const treads: [Point, Point][] = [];
      if (kind === "stairs")
        for (let k = TREAD_MM; k < d - 1; k += TREAD_MM) {
          treads.push([at(k, 0), at(k, k)], [at(0, k), at(k, k)]);
        }
      out.push({ kind, level, polygon: [c, at(d, 0), at(d, d), at(0, d)], treads, depthMm: d });
    }
  }
  return out;
}

/** The deck area of a stage, mm² — what a carpet or a dance floor on it is priced by. Its levels are
 *  inside its outline, so this is the outline's own area — less, given the decks, the recesses its
 *  inner flights are sunk into (nothing to carpet there). */
export function stageAreaMm2(stage: StageBuild, deckOf?: DeckLookup): number {
  const area = Math.abs(signedArea(stage.outline));
  if (!deckOf) return area;
  const sunk = [undefined, ...(stage.levels ?? []).map((l) => l.id)].flatMap((lv) => recesses(stage, lv, deckOf));
  return Math.max(0, area - sunk.reduce((s, q) => s + Math.abs(signedArea(q)), 0));
}

/** Everyone a document's banquettes seat. */
export function benchSeats(placements: readonly Placement[], deckOf: DeckLookup): number {
  let n = 0;
  for (const p of placements)
    for (const it of p.stage?.stairs ?? []) {
      if (edgeKind(it) !== "bench") continue;
      n += edgeItemShape(p.stage!, it, deckOf)?.seats ?? 0;
    }
  return n;
}

/** One flight for a stage — kept for callers that want just one (a merged stage with none). */
export function defaultStair(p: StagePlacement, deckOf: DeckLookup, wallDistance?: WallDistance): StageStair | null {
  const n = p.stage.outline.length;
  const f = p.stage.front;
  for (const at of [
    { edge: (f + 1) % n, t: 0.5 },
    { edge: (f - 1 + n) % n, t: 0.5 },
    { edge: f, t: 0.85 },
  ]) {
    const stair: StageStair = { id: `stair-${at.edge}-${at.t}`, edge: at.edge, t: at.t, widthMm: STAIR_WIDTH_MM };
    if (stairFits(p, stair, deckOf, wallDistance).ok) return stair;
  }
  return null;
}

/** Where a banquette stands in the room, for the design items on it: its middle, the direction it
 *  runs there, its length and depth — and `along(f)`, the point on its middle line a fraction `f`
 *  (−½ … ½) of its length from its middle, which follows a banquette round a curved side. */
export function benchInRoom(
  p: StagePlacement,
  itemId: string,
  deckOf: DeckLookup,
): { centre: Point; angle: number; lengthMm: number; depthMm: number; along: (f: number) => Point } | null {
  const item = p.stage.stairs?.find((x) => x.id === itemId);
  if (!item || edgeKind(item) !== "bench") return null;
  const shape = edgeItemShape(p.stage, item, deckOf);
  if (!shape) return null;
  const line = shape.midline.map((q) => toRoom(p, q));
  const cum = [0];
  for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + len(line[k - 1], line[k]));
  const total = cum[cum.length - 1] || 1;
  const along = (f: number): Point => {
    const s = Math.max(0, Math.min(total, (f + 0.5) * total));
    let k = 0;
    while (k < line.length - 2 && cum[k + 1] < s) k++;
    const g = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    return { x: line[k].x + (line[k + 1].x - line[k].x) * g, y: line[k].y + (line[k + 1].y - line[k].y) * g };
  };
  const a = toRoom(p, shape.base);
  const b = toRoom(p, { x: shape.base.x + Math.cos(rad(shape.angleDeg)), y: shape.base.y + Math.sin(rad(shape.angleDeg)) });
  return {
    centre: along(0),
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    lengthMm: shape.widthMm,
    depthMm: shape.depthMm,
    along,
  };
}

// ── Keeping levels and stairs where they are ──────────────────────────────────────────────────

/** The stage's levels, moved so they stay where they STAND IN THE ROOM when the stage itself moves
 *  under them — its centre shifting as a handle stretches one side, or a re-drawn outline giving it
 *  a new frame altogether. */
export function carryLevels(levels: readonly StageLevel[] | undefined, from: Frame, to: Frame): StageLevel[] | undefined {
  if (!levels?.length) return levels ? [...levels] : undefined;
  return levels.map((l) => ({
    ...l,
    outline: l.outline.map((q) => {
      const r = toStageFrame(to, toRoom(from, q));
      return { x: Math.round(r.x), y: Math.round(r.y) };
    }),
  }));
}

/** A stage whose outline changed in its own frame (a side pushed out, a corner moved), put back in
 *  order: the outline re-centred on its box — the plan draws a custom outline about its box's
 *  centre, so an off-centre outline would draw somewhere its decks and stairs are not — its levels
 *  shifted by the same amount, and the placement moved so nothing moves in the room. */
export function reframeStage(was: StagePlacement, outline: readonly Point[]): { stage: StageBuild; position: Point } {
  const xs = outline.map((q) => q.x);
  const ys = outline.map((q) => q.y);
  const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const shift = (q: Point) => ({ x: Math.round(q.x - c.x), y: Math.round(q.y - c.y) });
  const at = toRoom(was, c);
  return {
    stage: {
      ...was.stage,
      outline: outline.map(shift),
      levels: was.stage.levels?.map((l) => ({ ...l, outline: l.outline.map(shift) })),
    },
    position: { x: Math.round(at.x), y: Math.round(at.y) },
  };
}

/** A stage's edge items carried onto a NEW outline of the same stage — corners dragged, a side
 *  pushed or split, a corner taken away ("עריכת הבמה"), where side numbers no longer mean what they
 *  did. Each base item goes to the sides of the new outline that run the same way, face the same way
 *  and overlap its stretch, nearest first and never twice over one stretch — so a side split and half
 *  pushed out keeps its stairs on both halves. A `full` item stays full on whatever side it lands.
 *  A level's items stay as they were (levels keep their own outlines). An item whose side is gone is
 *  dropped; fillGaps then finishes whatever is left bare, and tidyEdgeItems joins the runs. */
export function rehomeEdgeItems(was: StagePlacement, now: StagePlacement, newId: () => string): StageStair[] {
  const outline = now.stage.outline;
  const sNow = signedArea(outline) >= 0 ? 1 : -1;
  const sides = outline.flatMap((a, j) => {
    const b = outline[(j + 1) % outline.length];
    const L = len(a, b);
    if (L < 1) return [];
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    return [{ j, a, u, L, out: { x: sNow * u.y, y: -sNow * u.x } }];
  });
  const sWas = signedArea(was.stage.outline) >= 0 ? 1 : -1;
  const inNow = (q: Point) => toStageFrame(now, toRoom(was, q));
  // The same outline standing in the same place (the fill tool reopened only to change the decks):
  // every item is where it was, on the side it was — a round stage's rim included.
  const same =
    was.stage.outline.length === outline.length &&
    was.stage.outline.every((q, i) => {
      const r = inNow(q);
      return Math.abs(r.x - outline[i].x) <= 2 && Math.abs(r.y - outline[i].y) <= 2;
    });
  if (same) return [...(was.stage.stairs ?? [])];
  const out: StageStair[] = [];
  for (const it of was.stage.stairs ?? []) {
    if (it.level) {
      out.push(it);
      continue;
    }
    // A curved side has no one direction to be matched by: what stood on it is dropped, and the
    // bare stretch filled again (fillGaps) like any other.
    if (stageSide(was.stage, undefined, it.edge)?.curved) continue;
    const e = itemEdge(was.stage, it);
    const sp = itemSpan(was.stage, it);
    if (!e || !sp) continue;
    const u = { x: (e.b.x - e.a.x) / sp.L, y: (e.b.y - e.a.y) / sp.L };
    const A = inNow({ x: e.a.x + u.x * sp.from, y: e.a.y + u.y * sp.from });
    const B = inNow({ x: e.a.x + u.x * sp.to, y: e.a.y + u.y * sp.to });
    const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const AB = len(A, B) || 1;
    const dir = { x: (B.x - A.x) / AB, y: (B.y - A.y) / AB };
    const m0 = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    const o0 = inNow(m0);
    const o1 = inNow({ x: m0.x + sWas * u.y * 100, y: m0.y - sWas * u.x * 100 });
    const outN = { x: (o1.x - o0.x) / 100, y: (o1.y - o0.y) / 100 };
    const fits = sides
      .flatMap((s) => {
        if (Math.abs(dir.x * s.u.y - dir.y * s.u.x) > 0.02) return [];
        if (outN.x * s.out.x + outN.y * s.out.y < 0.9) return [];
        const at = (q: Point) => Math.max(0, Math.min(s.L, (q.x - s.a.x) * s.u.x + (q.y - s.a.y) * s.u.y));
        const from = Math.min(at(A), at(B));
        const to = Math.max(at(A), at(B));
        if (to - from < 1) return [];
        // Where along the ITEM's own line this side's stretch falls — what two halves of a split side
        // must not both claim.
        const along = (q: Point) => (q.x - A.x) * dir.x + (q.y - A.y) * dir.y;
        const p0 = { x: s.a.x + s.u.x * from, y: s.a.y + s.u.y * from };
        const p1 = { x: s.a.x + s.u.x * to, y: s.a.y + s.u.y * to };
        const lo = Math.min(along(p0), along(p1));
        const hi = Math.max(along(p0), along(p1));
        const dist = Math.abs((M.x - s.a.x) * s.u.y - (M.y - s.a.y) * s.u.x);
        return [{ s, from, to, lo, hi, dist }];
      })
      .sort((a, b) => a.dist - b.dist);
    const taken: [number, number][] = [];
    let first = true;
    for (const f of fits) {
      if (taken.some(([lo, hi]) => f.lo < hi - 1 && f.hi > lo + 1)) continue;
      taken.push([f.lo, f.hi]);
      const { full: _f, ...rest } = it;
      const whole = it.full || (f.from <= 1 && f.to >= f.s.L - 1);
      out.push({
        ...rest,
        id: first ? it.id : newId(),
        edge: f.s.j,
        t: (f.from + f.to) / 2 / f.s.L,
        widthMm: Math.round(f.to - f.from),
        ...(whole ? { full: true } : {}),
      });
      first = false;
    }
  }
  return out;
}

/** Edge items tidied: on each side, items of one kind that touch or overlap become ONE item over
 *  their joint stretch (marked `full` when that is the whole side). Two decks pushed together each
 *  brought stairs along their front; the merged stage has one flight across it — and the quote counts
 *  the front once, not twice. The first item of each run keeps its own settings (steps, depth…). */
export function tidyEdgeItems(stage: StageBuild): StageStair[] {
  const items = stage.stairs ?? [];
  const groups = new Map<string, { it: StageStair; from: number; to: number; L: number }[]>();
  const loose: StageStair[] = [];
  for (const it of items) {
    const sp = itemSpan(stage, it);
    if (!sp) {
      loose.push(it);
      continue;
    }
    const k = `${it.level ?? ""}|${it.edge}|${edgeKind(it)}|${isInner(it) ? "in" : "out"}`;
    groups.set(k, [...(groups.get(k) ?? []), { it, ...sp }]);
  }
  const out: StageStair[] = [...loose];
  for (const list of groups.values()) {
    list.sort((a, b) => a.from - b.from);
    let run = { ...list[0] };
    const flush = () => {
      const whole = run.from <= 1 && run.to >= run.L - 1;
      const { full: _f, ...rest } = run.it;
      out.push({ ...rest, t: (run.from + run.to) / 2 / run.L, widthMm: Math.round(run.to - run.from), ...(whole ? { full: true } : {}) });
    };
    for (const next of list.slice(1)) {
      if (next.from <= run.to + 2) run.to = Math.max(run.to, next.to);
      else {
        flush();
        run = { ...next };
      }
    }
    flush();
  }
  return out;
}

/** A stage piece standing on its own — a "במה 400×300" from the rail, a deck left loose — as a STAGE,
 *  the same object the area tool makes: its box as a front-first rectangle, what it may be built from
 *  (`decks`, which always includes the piece itself, so it is built as itself), its height, the
 *  studio's finishing rows, and — when asked — every open side finished, as a new stage is. */
export function stageFromPiece(
  p: Placement,
  box: { widthMm: number; depthMm: number },
  opts: {
    decks: readonly string[];
    heightMm?: number;
    parts?: Partial<StageBuild>;
    deckOf: DeckLookup;
    newId: () => string;
    withEdges: boolean;
    wallDistance?: WallDistance;
    /** A round or oval piece (isRoundPiece): its outline is the ellipse in its box, a curved rim
     *  every vertex of which is smooth — and it is built of itself, whole. */
    round?: boolean;
  },
): StagePlacement {
  const k = p.scale || 1;
  // Where the piece stands in the room — then faced the way a drawn stage is: away from the wall it
  // stands against (defaultFront), so a piece dropped facing the page's top does not face the wall.
  const room = rectOutline(Math.round(box.widthMm * k), Math.round(box.depthMm * k)).map((q) => toRoom(p, q));
  const at = stageFromArea(room, defaultFront(room, opts.wallDistance));
  const size = opts.round ? stageRect(at) : null;
  const round = size ? roundOutline(size.widthMm, size.depthMm) : null;
  const stage: StageBuild = {
    outline: round ? round.outline : at.outline,
    ...(round ? { smooth: round.smooth } : {}),
    front: at.front,
    decks: [...new Set([p.variantId, ...opts.decks])],
    ...(opts.heightMm && opts.heightMm > 0 ? { heightMm: opts.heightMm } : {}),
    ...(opts.parts ?? {}),
  };
  const { sizeMm: _size, mirrored: _flip, ...rest } = p;
  const sp: StagePlacement = { ...rest, position: at.position, rotation: at.rotation, scale: 1, stage };
  if (opts.withEdges) stage.stairs = defaultEdgeItems(sp, opts.deckOf, opts.newId, opts.wallDistance);
  return sp;
}

/** Several stages that touch, as ONE: the outline of them all, their levels carried over, every
 *  edge item re-homed — by the stretch it actually covered — onto the side of the merged outline it
 *  stood on (a seam swallows it), then tidied so a side holds one run per kind, and the decks any of
 *  them could use. A merged RECTANGLE comes out exactly as a drawn one does: front first, with resize
 *  handles. Null when they are not one connected, square-cornered piece — stickBoxes
 *  (lib/studio/stage-draw.ts) is what gets them there. The result carries its own frame (position,
 *  rotation, unflipped): set all three. */
export function mergeStages(parts: readonly StagePlacement[]): { stage: StageBuild; position: Point; rotation: number } | null {
  if (parts.length < 2) return null;
  const anchor = parts[0];
  const inAnchor = (p: StagePlacement, q: Point) => toStageFrame(anchor, toRoom(p, q));
  const united = unionOutline(parts.map((p) => p.stage.outline.map((q) => inAnchor(p, q))));
  if (!united) return null;

  // The anchor's front, found on the united outline — then the whole thing re-framed the way a drawn
  // area is (stageFromArea), so a rectangle becomes the canonical front-first one.
  const fa = inAnchor(anchor, anchor.stage.outline[anchor.stage.front]);
  const fb = inAnchor(anchor, anchor.stage.outline[(anchor.stage.front + 1) % anchor.stage.outline.length]);
  const fm = { x: (fa.x + fb.x) / 2, y: (fa.y + fb.y) / 2 };
  let frontU = united.findIndex((_, i) => segDist(fm, ...edgeOf(united, i)) <= 5);
  if (frontU < 0) frontU = levelFront(united);
  const fin = stageFromArea(
    united.map((q) => toRoom(anchor, q)),
    frontU,
  );
  const frame = { position: fin.position, rotation: fin.rotation, mirrored: false };
  const inFin = (p: StagePlacement, q: Point) => toStageFrame(frame, toRoom(p, q));
  const outline = fin.outline;
  const edgeAt = (pt: Point) => outline.findIndex((_, i) => segDist(pt, ...edgeOf(outline, i)) <= 5);

  const levels = parts.flatMap((p) =>
    (p.stage.levels ?? []).map((l) => ({
      ...l,
      outline: l.outline.map((q) => {
        const r = inFin(p, q);
        return { x: Math.round(r.x), y: Math.round(r.y) };
      }),
    })),
  );
  const items: StageStair[] = [];
  for (const p of parts)
    for (const it of p.stage.stairs ?? []) {
      if (it.level) {
        items.push(it); // a level's outline kept its corners, so its edge numbers still hold
        continue;
      }
      const e = itemEdge(p.stage, it);
      const sp = itemSpan(p.stage, it);
      if (!e || !sp) continue;
      const u = { x: (e.b.x - e.a.x) / sp.L, y: (e.b.y - e.a.y) / sp.L };
      const A = inFin(p, { x: e.a.x + u.x * sp.from, y: e.a.y + u.y * sp.from });
      const B = inFin(p, { x: e.a.x + u.x * sp.to, y: e.a.y + u.y * sp.to });
      const edge = edgeAt({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 });
      if (edge < 0) continue; // its side is inside the merged stage now — a seam, not an edge
      const [ea, eb] = edgeOf(outline, edge);
      const L = len(ea, eb) || 1;
      const along = (q: Point) => Math.max(0, Math.min(L, ((q.x - ea.x) * (eb.x - ea.x) + (q.y - ea.y) * (eb.y - ea.y)) / L));
      const f = Math.min(along(A), along(B));
      const t = Math.max(along(A), along(B));
      if (t - f < 1) continue;
      const { full: _f, ...rest } = it;
      items.push({ ...rest, edge, t: (f + t) / 2 / L, widthMm: Math.round(t - f) });
    }
  const stage: StageBuild = {
    ...anchor.stage,
    outline,
    front: fin.front,
    decks: [...new Set(parts.flatMap((p) => p.stage.decks))],
    levels: levels.length ? levels : undefined,
    // Only square-cornered stages merge (unionOutline), so the merged outline has no curve.
    smooth: undefined,
    stairs: items,
    stairsVariant: parts.find((p) => p.stage.stairsVariant)?.stage.stairsVariant,
    skirtVariant: parts.find((p) => p.stage.skirtVariant)?.stage.skirtVariant,
    benchVariant: parts.find((p) => p.stage.benchVariant)?.stage.benchVariant,
    barrierVariant: parts.find((p) => p.stage.barrierVariant)?.stage.barrierVariant,
    backdropVariant: parts.find((p) => p.stage.backdropVariant)?.stage.backdropVariant,
    rampVariant: parts.find((p) => p.stage.rampVariant)?.stage.rampVariant,
  };
  stage.stairs = tidyEdgeItems(stage);
  return { stage, position: fin.position, rotation: fin.rotation };
}

/** Stages pushed flush but NOT merged: the edge items standing on a side another stage now covers —
 *  stairs climbing into the next stage, a banquette under it — taken away. Returns each stage's
 *  remaining items, for the stages that lost any. */
export function trimSeams(stages: readonly StagePlacement[], deckOf: DeckLookup): Map<string, StageStair[]> {
  const out = new Map<string, StageStair[]>();
  const rooms = stages.map((p) => ({ id: p.id, outline: stageOutlineInRoom(p) }));
  for (const p of stages) {
    const others = rooms.filter((r) => r.id !== p.id);
    const keep = (p.stage.stairs ?? []).filter((it) => {
      if (it.level) return true;
      const shape = edgeItemShape(p.stage, it, deckOf);
      if (!shape) return true;
      const mid = toRoom(p, shape.base);
      return !others.some((o) => onBoundary(mid, o.outline, 60));
    });
    if (keep.length !== (p.stage.stairs ?? []).length) out.set(p.id, keep);
  }
  return out;
}

/** How far a point is from a wall OR from another stage's edge — what decides an edge is "against
 *  something" for a stage pushed flush to another without being merged: that side needs no stairs,
 *  no skirt, and is not open. */
export function besideNeighbours(wallDistance: WallDistance | undefined, others: readonly (readonly Point[])[]): WallDistance {
  return (q) => {
    let d = wallDistance ? wallDistance(q) : Infinity;
    for (const o of others) if (onBoundary(q, o, WALL_HUG_MM)) d = Math.min(d, 0);
    return d;
  };
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const decks: Record<string, DeckType> = {
    big: { id: "big", widthMm: 2000, depthMm: 1000, heightMm: 600 },
    small: { id: "small", widthMm: 1000, depthMm: 1000, heightMm: 600 },
  };
  const deckOf: DeckLookup = (id) => decks[id];
  const rect = (x: number, y: number, w: number, h: number): Point[] => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const place = (area: Point[], front: number, mirrored = false): StagePlacement => {
    const s = stageFromArea(area, front);
    return { id: "s", variantId: "big", layer: "floor" as const, quantity: 1, scale: 1, position: s.position, rotation: s.rotation, mirrored, stage: { outline: s.outline, front: s.front, decks: ["big", "small"] } };
  };

  // A 6×4 drawn with its front along the bottom edge (y = 4000) faces down the room.
  const down = place(rect(1000, 1000, 6000, 4000), 2);
  assert(down.position.x === 4000 && down.position.y === 3000, "a stage stands at the middle of what was drawn");
  assert(stageRect(down.stage)?.widthMm === 6000 && stageRect(down.stage)?.depthMm === 4000, "…is stored as a 6×4 rectangle, front first");
  assert(down.rotation === 180, "…turned to face the edge that was chosen");
  const room = stageOutlineInRoom(down);
  const xs = room.map((p) => Math.round(p.x));
  const ys = room.map((p) => Math.round(p.y));
  assert(Math.min(...xs) === 1000 && Math.max(...xs) === 7000 && Math.min(...ys) === 1000 && Math.max(...ys) === 5000, "…and covers exactly the area drawn");
  const back = toStageFrame(down, toRoom(down, { x: 123, y: -456 }));
  assert(Math.abs(back.x - 123) < 1e-6 && Math.abs(back.y + 456) < 1e-6, "room and stage frame are each other's inverse");
  const flippedFrame = { ...down, mirrored: true };
  const back2 = toStageFrame(flippedFrame, toRoom(flippedFrame, { x: 123, y: -456 }));
  assert(Math.abs(back2.x - 123) < 1e-6, "…flipped too");

  const counts = stageDeckCounts(down.stage, deckOf);
  assert(counts.get("big")?.length === 12 && !counts.has("small"), "a 6×4 is twelve big decks");
  assert(stageHeight(down.stage, deckOf) === 600, "a stage with no height of its own stands at its decks' height");

  // The same stage, clicked the other way round, and flipped: the same build.
  const ccw = place([...rect(1000, 1000, 6000, 4000)].reverse(), 1);
  assert(stageDeckCounts(ccw.stage, deckOf).get("big")?.length === 12, "clicked the other way round, the same build");
  const inRoom = stageDecksInRoom(down, deckOf);
  const flipped = stageDecksInRoom({ ...down, mirrored: true }, deckOf);
  const key = (ds: LaidDeck[]) => ds.map((d) => `${d.centre.x},${d.centre.y}`).sort().join(" ");
  assert(key(inRoom) === key(flipped), "a flipped rectangle stands on the same decks");
  assert(inRoom.every((d) => d.centre.x > 1000 && d.centre.x < 7000 && d.centre.y > 1000 && d.centre.y < 5000), "…all of them inside the area");

  // Odd size: rows from the front, so the half metre is at the back — the TOP, for a stage facing down.
  const odd = place(rect(0, 0, 6000, 4500), 2);
  assert(stageDecksInRoom(odd, deckOf).every((d) => d.centre.y > 500), "the leftover strip is at the back of the stage, away from its front");

  // An L keeps its outline and its front.
  const l = place(
    [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    0,
  );
  assert(stageRect(l.stage) === null && l.stage.outline.length === 6, "an L stays an L");
  assert(stageDeckCounts(l.stage, deckOf).get("big")?.length === 6, "…and is six decks");
  assert(stageDeckCounts({ ...down.stage, decks: ["gone"] }, deckOf).size === 0, "a stage whose decks left the catalog lays nothing, and does not throw");

  // ── Levels: a 6×4 band stage at 40cm with a 4×2 drum riser at 80cm across its back.
  const band: StagePlacement = {
    ...place(rect(0, 0, 6000, 4000), 0),
    stage: { outline: rectOutline(6000, 4000), front: 0, decks: ["big"], heightMm: 400, levels: [{ id: "riser", outline: rect(-2000, 0, 4000, 2000), heightMm: 800 }] },
  };
  const bandLaid = layStage(band.stage, deckOf);
  const onRiser = bandLaid.decks.filter((d) => d.level === "riser");
  assert(onRiser.length === 4 && onRiser.every((d) => d.heightMm === 800), "a 4×2 riser is four decks at the riser's height");
  assert(bandLaid.decks.length === 12 && bandLaid.decks.filter((d) => !d.level).every((d) => d.heightMm === 400), "…and the base is the other eight, at the base's");
  const spill = layStage({ ...band.stage, levels: [{ id: "r", outline: rect(1000, 0, 4000, 2000), heightMm: 800 }] }, deckOf);
  assert(spill.decks.filter((d) => d.level === "r").every((d) => d.centre.x < 3000), "a riser drawn past the stage's edge is laid only on the stage");

  // ── Stairs.
  const stair: StageStair = { id: "a", edge: 1, t: 0.5, widthMm: 1000 };
  const shape = stairShape({ ...down.stage, heightMm: 600 }, stair, deckOf)!;
  assert(shape.risers === 4 && shape.riserMm === 150 && shape.depthMm === 840, "60cm is four risers of 15cm — three treads, 84cm deep");
  assert(shape.polygon.every((q) => q.x >= 3000 - 1), "a flight on the right-hand side stands outside it");
  assert(shape.treads.length === 2, "…with a line across it between each tread");
  const riserStair = stairShape(band.stage, { id: "r", level: "riser", edge: 0, t: 0.5, widthMm: 1000 }, deckOf)!;
  assert(riserStair.riseMm === 400 && riserStair.polygon.every((q) => q.y <= 1), "a flight onto the riser climbs the difference, out from its front onto the base");
  const cornered = stairShape(down.stage, { ...stair, t: 0.99 }, deckOf)!;
  assert(cornered.polygon.every((q) => q.y <= 2001 && q.y >= -2001), "a flight put at a corner is slid back onto its side");
  assert(stairShape({ ...down.stage, heightMm: 600 }, { ...stair, edge: 9 }, deckOf) === null, "a flight on an edge that no longer exists is not drawn");
  const three = stairShape({ ...down.stage, heightMm: 600 }, { ...stair, risers: 3, widthMm: 1500 }, deckOf)!;
  assert(three.risers === 3 && three.riserMm === 200 && three.depthMm === 560, "three steps set by hand: 20cm risers, two treads deep");
  assert(Math.round(Math.hypot(three.polygon[1].x - three.polygon[0].x, three.polygon[1].y - three.polygon[0].y)) === 1500, "…and the width set by hand");
  const whole = stairShape({ ...down.stage, heightMm: 600 }, { ...stair, edge: 0, full: true }, deckOf)!;
  assert(Math.round(Math.hypot(whole.polygon[1].x - whole.polygon[0].x, whole.polygon[1].y - whole.polygon[0].y)) === 6000, "a full-width flight runs the whole side");
  assert(skirtMm({ ...down, stage: { ...down.stage, stairs: [{ ...stair, edge: 0, full: true }] } }, deckOf, (q) => Math.abs(q.y - 1000)) === 8000, "…and leaves no skirt on it");

  // Against the wall behind it (y = 5000 in the room), a stage facing down gets its default flight
  // on a side, and a flight clicked on the back is refused.
  const wallBehind: WallDistance = (p) => Math.abs(p.y - 1000);
  const firstFlight = defaultStair(down, deckOf, wallBehind);
  assert(!!firstFlight && firstFlight.edge !== 2 && firstFlight.edge !== down.stage.front, "a new stage gets a flight on a side");
  const backEdge = (down.stage.front + 2) % 4;
  assert(!stairFits(down, { id: "x", edge: backEdge, t: 0.5, widthMm: 1000 }, deckOf, wallBehind).ok, "…and none can be put against the wall behind it");

  // ── Skirt: every open side, less the wall and the flights.
  const skirted = skirtMm(down, deckOf, wallBehind);
  assert(skirted === 6000 + 4000 + 4000, "a 6×4 against a wall is skirted on its front and both sides");
  const withFlight = skirtMm({ ...down, stage: { ...down.stage, stairs: [stair] } }, deckOf, wallBehind);
  assert(withFlight === skirted - 1000, "…less the metre a flight stands against");
  const bandSkirt = openEdges(band, deckOf);
  assert(bandSkirt.some((r) => r.level === "riser" && r.dropMm === 400 && r.lengthMm === 4000), "a riser's face is skirted too, at the difference in height");

  // ── Railing: off unless the studio says above what.
  assert(railingRuns(down, deckOf, null, wallBehind).length === 0, "no railing rule, no railing");
  const rails = railingRuns({ ...down, stage: { ...down.stage, heightMm: 900 } }, deckOf, 800, wallBehind);
  assert(rails.length === 2 && rails.every((r) => !r.front), "a 90cm stage over an 80cm rule is railed on its open sides, never its front");
  assert(railingRuns(down, deckOf, 800, wallBehind).length === 0, "…and a 60cm one is not");

  // ── Edge items: every open side finished.
  let n = 0;
  const nid = () => `i${++n}`;
  const finish = defaultEdgeItems(down, deckOf, nid, wallBehind);
  assert(finish.length === 3 && finish.every((it) => edgeKind(it) === "stairs" && it.full), "a new stage against a wall gets stairs along its three open sides");
  const finished = { ...down, stage: { ...down.stage, stairs: finish } };
  assert(edgeGaps(finished, deckOf, wallBehind).length === 0, "…and then nothing is left bare");
  assert(edgeGaps(down, deckOf, wallBehind).reduce((t, g) => t + g.lengthMm, 0) === 14000, "a bare 6×4 against a wall has 14m of open edge");
  const benches = fillGaps(down, deckOf, "bench", nid, wallBehind);
  const bench = edgeItemShape(down.stage, benches[0], deckOf)!;
  assert(bench.kind === "bench" && bench.depthMm === BENCH_DEPTH_MM && bench.seats === Math.floor(bench.widthMm / SEAT_WIDTH_MM), "a banquette is seat-deep, and seats one per 60cm");
  assert(bench.chairs.every((c) => Math.abs(c.y) < 2000 && 2000 - Math.abs(c.y) === CHAIR_OFFSET_MM), "…its chairs on the stage, beside it, like a table's");
  assert(bench.chairs.length === bench.seats, "…with a chair drawn for every seat");
  const fewer = edgeItemShape(down.stage, { ...benches[0], seats: 3 }, deckOf)!;
  assert(fewer.chairs.length === 3, "…or as many as the designer set");
  assert(edgeItemShape(down.stage, { ...benches[0], seats: 99 }, deckOf)!.seats === Math.floor(fewer.widthMm / CHAIR_W_MM), "…never more than fit");
  const sideBench = edgeItemShape(down.stage, { id: "sb", kind: "bench", edge: 1, t: 0.5, widthMm: 0, full: true }, deckOf)!;
  assert(sideBench.chairs.every((c) => c.x < 3000 && Math.abs(c.facingDeg) < 1), "…on the stage side of it, facing it and the room past it");
  const rail = edgeItemShape(down.stage, { ...benches[0], kind: "barrier" }, deckOf)!;
  const inward = rail.polygon.every((q) => Math.abs(q.x) <= 3001 && Math.abs(q.y) <= 2001);
  assert(inward, "a barrier stands on the stage, inside its edge");
  const clickedGap = itemAt({ ...down, stage: { ...down.stage, stairs: [{ id: "x", edge: 0, t: 0.25, widthMm: 2000 }] } }, deckOf, "bench", undefined, 0, 0.8, "y", wallBehind);
  const cg = itemSpan(down.stage, clickedGap)!;
  assert(Math.round(cg.from) === 2500 && Math.round(cg.to) === 6000, "a click in a bare stretch covers the whole stretch");
  const barred = { ...down, stage: { ...down.stage, heightMm: 900, stairs: [{ id: "b", kind: "barrier" as const, edge: 1, t: 0.5, widthMm: 0, full: true }] } };
  assert(railingRuns(barred, deckOf, 800, wallBehind).length === 1, "a side with a barrier needs no railing; the other still does");
  assert(skirtMm(barred, deckOf, wallBehind) === 14000, "…and a barrier stands on the stage, so the skirt still hangs below it");

  // ── Ramps, backdrops, corners, area.
  const ramp = edgeItemShape({ ...down.stage, heightMm: 600 }, { id: "r", kind: "ramp", edge: 1, t: 0.5, widthMm: 1200 }, deckOf)!;
  assert(ramp.depthMm === 7200, "a ramp onto a 60cm stage runs 7.2m — one in twelve");
  const wall = edgeItemShape(down.stage, { id: "w", kind: "backdrop", edge: 2, t: 0.5, widthMm: 0, full: true }, deckOf)!;
  assert(wall.polygon.every((q) => Math.abs(q.y) <= 2001), "a backdrop stands on the stage, on its edge");
  assert(
    stairFits(down, { id: "w", kind: "backdrop", edge: (down.stage.front + 2) % 4, t: 0.5, widthMm: 0, full: true }, deckOf, wallBehind).ok,
    "…and may stand against the venue's wall, where stairs may not",
  );
  const allStairs = { ...down.stage, stairs: [0, 1, 2, 3].map((e) => ({ id: `e${e}`, edge: e, t: 0.5, widthMm: 0, full: true })) };
  const corners = stageCorners(allStairs, deckOf);
  assert(corners.length === 4 && corners.every((c) => c.kind === "stairs"), "stairs on all four sides meet at four corner pieces");
  assert(stageCorners({ ...allStairs, corners: false }, deckOf).length === 0, "…unless the stage says no");
  assert(
    stageCorners({ ...allStairs, stairs: allStairs.stairs.map((x, i) => (i === 1 ? { ...x, kind: "bench" as const } : x)) }, deckOf).length === 2,
    "a corner between stairs and a banquette stays open",
  );
  assert(corners[0].polygon.every((q) => Math.abs(q.x) >= 2999 || Math.abs(q.y) >= 1999), "…and a corner piece stands outside the stage");
  assert(stageAreaMm2(down.stage) === 24e6, "a 6×4 stage is 24m² of deck");

  // ── Drawn, or built by hand: the same stage.
  // A 6×4 against a wall along its top, drawn with the area tool…
  const wallTop: WallDistance = (q) => Math.abs(q.y - 0);
  const drawnAt = stageFromArea(rect(0, 0, 6000, 4000), defaultFront(rect(0, 0, 6000, 4000), wallTop));
  const drawn: StagePlacement = { id: "d", variantId: "big", layer: "floor", quantity: 1, scale: 1, position: drawnAt.position, rotation: drawnAt.rotation, stage: { outline: drawnAt.outline, front: drawnAt.front, decks: ["big", "small"] } };
  drawn.stage.stairs = defaultEdgeItems(drawn, deckOf, nid, wallTop);
  // …and the same 6×4 laid by hand: twelve 2×1 decks dropped facing the page, then merged.
  const pieces: StagePlacement[] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      pieces.push(
        stageFromPiece(
          { id: `p${r}${c}`, variantId: "big", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 1000 + c * 2000, y: 500 + r * 1000 } },
          { widthMm: 2000, depthMm: 1000 },
          { decks: ["big", "small"], deckOf, newId: nid, withEdges: true, wallDistance: wallTop },
        ),
      );
  const built = mergeStages(pieces)!;
  const handmade: StagePlacement = { ...pieces[0], ...built, mirrored: false, stage: built.stage };
  handmade.stage.stairs = [...(handmade.stage.stairs ?? []), ...fillGaps(handmade, deckOf, "stairs", nid, wallTop)];
  assert(!!stageRect(handmade.stage) && stageRect(handmade.stage)!.widthMm === 6000 && stageRect(handmade.stage)!.depthMm === 4000, "built by hand, it is the same 6×4 rectangle — with resize handles");
  const ro = (p: StagePlacement) => stageOutlineInRoom(p).map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).sort().join(" ");
  assert(ro(handmade) === ro(drawn), "…standing on the same floor");
  const fr = (p: StagePlacement) => {
    const a = toRoom(p, p.stage.outline[p.stage.front]);
    const b = toRoom(p, p.stage.outline[(p.stage.front + 1) % p.stage.outline.length]);
    return Math.round((a.y + b.y) / 2);
  };
  assert(fr(handmade) === fr(drawn) && fr(drawn) === 4000, "…facing the same way, away from the wall");
  assert(layStage(handmade.stage, deckOf).decks.length === 12 && layStage(drawn.stage, deckOf).decks.length === 12, "…built of the same twelve decks");
  const runs = (p: StagePlacement) =>
    (p.stage.stairs ?? [])
      .map((it) => `${edgeKind(it)}:${Math.round(itemSpan(p.stage, it)!.to - itemSpan(p.stage, it)!.from)}`)
      .sort()
      .join(" ");
  assert(runs(handmade) === runs(drawn), "…with the same stairs: one run per open side, none on the seams");
  assert(edgeGaps(handmade, deckOf, wallTop).length === 0, "…and no open edge");
  assert(skirtMm(handmade, deckOf, wallTop) === skirtMm(drawn, deckOf, wallTop), "…and the same skirt");

  // Two stages pushed flush, not merged: the stairs on the seam go, and the seam is not "open".
  const leftS = stageFromPiece({ id: "L", variantId: "big", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 1000, y: 3000 } }, { widthMm: 2000, depthMm: 1000 }, { decks: ["big"], deckOf, newId: nid, withEdges: true });
  const rightS = stageFromPiece({ id: "R", variantId: "big", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 3000, y: 3000 } }, { widthMm: 2000, depthMm: 1000 }, { decks: ["big"], deckOf, newId: nid, withEdges: true });
  const trimmed = trimSeams([leftS, rightS], deckOf);
  assert(trimmed.get("L")!.length === 3 && trimmed.get("R")!.length === 3, "flush stages lose the stairs on the side they share");
  const nb = besideNeighbours(undefined, [stageOutlineInRoom(rightS)]);
  assert(edgeGaps({ ...leftS, stage: { ...leftS.stage, stairs: trimmed.get("L") } }, deckOf, nb).length === 0, "…and that side is not open");

  // A run of items on one side tidied to one.
  const twice = tidyEdgeItems({ ...down.stage, stairs: [
    { id: "a", edge: 0, t: 1 / 6, widthMm: 2000 },
    { id: "b", edge: 0, t: 0.5, widthMm: 2000 },
    { id: "c", edge: 0, t: 5 / 6, widthMm: 2000 },
  ] });
  assert(twice.length === 1 && twice[0].full === true, "three flights end to end along a side are one flight across it");

  // ── Levels stay where they stand when the stage's frame moves.
  const moved = { ...band, position: { x: band.position.x + 500, y: band.position.y } };
  const carried = carryLevels(band.stage.levels, band, moved)!;
  assert(carried[0].outline[0].x === -2500, "a stage stretched to the right keeps its riser where it stood");
  // ── Reframe and merge.
  const pushed = reframeStage(down, [...down.stage.outline.slice(0, 2), { x: 3000, y: 3000 }, { x: -3000, y: 3000 }]);
  assert(pushed.stage.outline[0].y === -2500 && pushed.stage.outline[2].y === 2500, "a side pushed out leaves the outline centred on its box");
  const r0 = stageOutlineInRoom({ ...down, ...pushed, stage: pushed.stage } as StagePlacement).map((q) => Math.round(q.y));
  assert(Math.min(...r0) === 0 && Math.max(...r0) === 5000, "…and in the room it grew only where it was pushed");

  const left: StagePlacement = { ...place(rect(0, 0, 4000, 2000), 0), id: "l" };
  const right: StagePlacement = { ...place(rect(4000, 0, 2000, 4000), 0), id: "r" };
  left.stage.stairs = [{ id: "s1", edge: 3, t: 0.5, widthMm: 1000 }];
  const merged = mergeStages([left, right])!;
  assert(!!merged && merged.stage.outline.length === 6, "a 4×2 and a 2×4 pushed together are one L-shaped stage");
  const mp = { ...left, ...merged, stage: merged.stage } as StagePlacement;
  assert(stageDeckCounts(mp.stage, deckOf).get("big")?.length === 8, "…built of eight decks");
  assert(merged.stage.stairs?.length === 1 && stairShape(mp.stage, merged.stage.stairs[0], deckOf) !== null, "…with its flight still on its side");
  assert(skirtMm(mp, deckOf) === 20000 - 1000, "…and skirted round the outside only (20m less the flight), never along the seam");
  assert(mergeStages([left, { ...place(rect(9000, 0, 2000, 2000), 0), id: "far" }]) === null, "two stages apart are not merged");

  // ── Re-shaped in "עריכת הבמה": a free-standing 6×4 with stairs all round has half its back pushed
  // out into an L. Every old flight lands on its side again, the back's on both halves, and only the
  // new step between them is bare — once filled, one run per side and nothing open.
  const solo = place(rect(0, 0, 6000, 4000), 2);
  solo.stage.stairs = defaultEdgeItems(solo, deckOf, nid);
  const roomPoly = stageOutlineInRoom(solo).map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) }));
  const backSide = (solo.stage.front + 2) % 4;
  const cut = splitSide(roomPoly, solo.stage.front, backSide);
  const reshaped = cleanOutline(pushSide(cut.outline, backSide, 2000), cut.front);
  const at2 = stageFromArea(reshaped.outline, reshaped.front);
  const now: StagePlacement = { ...solo, position: at2.position, rotation: at2.rotation, stage: { ...solo.stage, outline: at2.outline, front: at2.front } };
  const carriedOver = rehomeEdgeItems(solo, now, nid);
  assert(carriedOver.length === 5 && carriedOver.every((it) => it.full), "a reshaped stage keeps every flight, on its side, the split back's on both halves");
  const done = { ...now, stage: { ...now.stage, stairs: carriedOver } };
  const bare = fillGaps(done, deckOf, "stairs", nid);
  assert(bare.length === 1, "…and only the new step between the halves is bare");
  const tidy = tidyEdgeItems({ ...done.stage, stairs: [...carriedOver, ...bare] });
  assert(tidy.length === 6 && edgeGaps({ ...done, stage: { ...done.stage, stairs: tidy } }, deckOf).length === 0, "…filled, one run on each of the L's six sides");

  // ── Inner stairs and banquettes: set into the stage instead of out from it.
  // A 6×4 at 60cm, front along the top (room y = 0), standing at room (3000, 2000) unturned; its
  // right-hand side (edge 1) is at room x = 6000, with a wall half a metre beyond it.
  const flat = place(rect(0, 0, 6000, 4000), 0);
  assert(flat.rotation === 0 && flat.position.x === 3000, "(a stage drawn front-first stands unturned)");
  const tall = { ...flat, stage: { ...flat.stage, heightMm: 600, decks: ["small"] } };
  const wallRight: WallDistance = (q) => Math.abs(q.x - 6500);
  const sunk: StageStair = { id: "in", edge: 1, t: 0.5, widthMm: 1000, inner: true };
  const sunkShape = edgeItemShape(tall.stage, sunk, deckOf)!;
  assert(sunkShape.inner && sunkShape.depthMm === 840 && sunkShape.polygon.every((q) => q.x <= 3001 && q.x >= 3000 - 841), "an inner flight is the same flight, sunk into the stage behind its edge");
  assert(sunkShape.treads.length === 2 && sunkShape.treads.every(([u]) => u.x < 3000), "…its treads inside the outline");
  const withSunk = { ...tall, stage: { ...tall.stage, stairs: [sunk] } };
  const sunkDecks = layStage(withSunk.stage, deckOf).decks;
  const overlapsRecess = sunkDecks.some((d) => d.centre.x + d.widthMm / 2 > 3000 - 840 + 1 && Math.abs(d.centre.y) - d.depthMm / 2 < 500 - 1);
  assert(!overlapsRecess && sunkDecks.length === 24 - 2, "the decks are laid around its recess (two 1×1 decks fewer)");
  assert(Math.abs(layStage(withSunk.stage, deckOf).coverage - 22e6 / (24e6 - 840e3)) < 1e-9, "…and coverage is of the floor meant to be decked, not of the recess");
  assert(stageAreaMm2(withSunk.stage, deckOf) === 24e6 - 1000 * 840 && stageAreaMm2(withSunk.stage) === 24e6, "the surface is priced less the recess (given the decks)");
  assert(skirtMm(withSunk, deckOf) === 20000 - 1000, "a recess leaves no deck face to skirt");
  assert(edgeGaps(withSunk, deckOf).reduce((t, g) => t + g.lengthMm, 0) === 20000 - 1000, "…and finishes its stretch of the edge");
  assert(stageCorners({ ...tall.stage, stairs: [0, 1, 2, 3].map((e) => ({ id: `c${e}`, edge: e, t: 0.5, widthMm: 0, full: true, inner: e === 1 })) }, deckOf).length === 2, "an inner run takes no corner piece outside the stage");

  // Half a metre off the wall: no room for the flight's 84cm outside — only set into the stage.
  const outer: StageStair = { id: "o", edge: 1, t: 0.5, widthMm: 1000 };
  assert(!stairFits(tall, outer, deckOf, wallRight).ok, "a flight half a metre off a wall does not fit outside");
  assert(stairFits(tall, sunk, deckOf, wallRight).ok, "…and fits set into the stage");
  const clicked = placeEdgeItem(tall, outer, deckOf, wallRight);
  assert(clicked.ok && clicked.item.inner === true, "…so a flight clicked onto that side is placed inner");
  const hugging: WallDistance = (q) => Math.abs(q.x - 6200);
  assert(!placeEdgeItem(tall, outer, deckOf, hugging).ok, "a side against the wall takes neither");
  const moved1 = settleEdgeItems(tall, [outer], deckOf, nid, wallRight, { inner: true, otherwise: "keep" });
  assert(moved1.length === 1 && moved1[0].inner === true && moved1[0].id === "o", "an outer flight a move left without floor resolves to inner, keeping its id");
  assert(settleEdgeItems(tall, [outer], deckOf, nid, (q) => Math.abs(q.x - 9000), { inner: true, otherwise: "keep" })[0].inner === undefined, "…and one with floor stays outside");
  assert(defaultEdgeItems(tall, deckOf, nid, wallRight).find((it) => it.edge === 1)?.kind === "barrier", "a NEW stage still gets a barrier there, not a whole side of recess");

  const benchIn: StageStair = { id: "bi", kind: "bench", edge: 1, t: 0.5, widthMm: 2400, inner: true };
  const bi = edgeItemShape(tall.stage, benchIn, deckOf)!;
  assert(bi.inner && bi.polygon.every((q) => q.x <= 3001 && q.x >= 3000 - BENCH_DEPTH_MM - 1), "an inner banquette stands on the deck inside its edge");
  assert(bi.chairs.length === 4 && bi.chairs.every((c) => Math.abs(c.x - (3000 - BENCH_DEPTH_MM - CHAIR_OFFSET_MM)) < 1 && Math.abs(c.facingDeg) < 1), "…its chairs further in behind it, still facing out");
  assert(bi.heightMm === BENCH_HEIGHT_MM, "…a seat's height, not capped by the stage under it");
  const withBenchIn = { ...tall, stage: { ...tall.stage, stairs: [benchIn] } };
  assert(skirtMm(withBenchIn, deckOf) === 20000, "the stage's face below an inner banquette is still skirted");
  assert(edgeGaps(withBenchIn, deckOf).reduce((t, g) => t + g.lengthMm, 0) === 20000 - 2400, "…and the banquette finishes its stretch");
  assert(layStage(withBenchIn.stage, deckOf).decks.length === 24, "…standing on the decks, not in a recess");
  assert(placeEdgeItem(tall, { ...benchIn, inner: undefined }, deckOf, wallRight).ok, "a banquette near the wall goes on the stage too");
  assert(tidyEdgeItems({ ...tall.stage, stairs: [sunk, { ...outer, t: 0.2 }] }).length === 2, "an inner and an outer flight on one side are never merged into one");

  // ── A round stage: a curved rim is ONE side, and edge items follow it.
  const round = roundOutline(4000, 4000);
  const disc: StagePlacement = { id: "disc", variantId: "big", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 0, y: 0 }, stage: { outline: round.outline, smooth: round.smooth, front: 0, decks: ["big", "small"], heightMm: 600 } };
  const rim = stageSides(disc.stage);
  assert(rim.length === 1 && rim[0].closed && rim[0].curved && Math.abs(rim[0].L - Math.PI * 4000) < 40, "a round stage's rim is one closed side, its circumference long");
  assert(round.outline.length >= 24 && rim[0].L / round.outline.length < 300, "…drawn in chords short enough to read as a curve");
  const ring = defaultEdgeItems(disc, deckOf, nid);
  assert(ring.length === 1 && ring[0].full === true && edgeKind(ring[0]) === "stairs", "a free-standing round stage gets stairs all the way round");
  const ringShape = edgeItemShape(disc.stage, ring[0], deckOf)!;
  const rOf = (q: Point) => Math.hypot(q.x, q.y);
  assert(ringShape.polygon.length > 40 && ringShape.polygon.every((q) => rOf(q) >= 2000 - 5 && rOf(q) <= 2000 + 840 + 5), "…following the curve, 84cm deep outside the rim");
  const withRing = { ...disc, stage: { ...disc.stage, stairs: ring } };
  assert(edgeGaps(withRing, deckOf).length === 0 && skirtMm(withRing, deckOf) === 0, "…leaving nothing bare and nothing to skirt");
  assert(stageCorners(withRing.stage, deckOf).length === 0, "…and no corner anywhere on a curve");
  assert(Math.abs(skirtMm(disc, deckOf) - rim[0].L) < 1, "a bare round stage is skirted all the way round");
  // A banquette round half of it; then a flight clicked on one of the chords of the other half.
  const halfBench: StageStair = { id: "hb", kind: "bench", edge: 0, t: 0.25, widthMm: Math.round(rim[0].L / 2) };
  const benchDisc = { ...disc, stage: { ...disc.stage, stairs: [halfBench] } };
  const hb = edgeItemShape(benchDisc.stage, halfBench, deckOf)!;
  assert(hb.chairs.every((c) => Math.abs(rOf(c) - (2000 - CHAIR_OFFSET_MM)) < 15) && hb.seats === Math.floor(hb.widthMm / SEAT_WIDTH_MM), "a curved banquette's chairs stand round the inside of the rim");
  assert(hb.chairs.every((c) => {
    const out = { x: Math.cos(rad(c.facingDeg)), y: Math.sin(rad(c.facingDeg)) };
    return (c.x * out.x + c.y * out.y) / rOf(c) > 0.99;
  }), "…each facing straight out");
  const onBench = benchInRoom(benchDisc, "hb", deckOf)!;
  assert([-0.5, -0.25, 0, 0.25, 0.5].every((f) => Math.abs(rOf(onBench.along(f)) - (2000 + BENCH_DEPTH_MM / 2)) < 15), "…and what is dressed on it is spread along the curve");
  const chord = Math.round(round.outline.length * 0.75);
  const flight = itemAt(benchDisc, deckOf, "stairs", undefined, chord, 0.5, "f1");
  assert(flight.edge === 0 && !!itemSpan(benchDisc.stage, flight), "a flight clicked on one chord of the rim is placed on the rim");
  const both = { ...disc, stage: { ...disc.stage, stairs: [halfBench, flight] } };
  assert(edgeGaps(both, deckOf).length === 0, "…covering the bare half, so nothing is left open");
  const short: StageStair = { id: "s1", edge: 0, t: 0.5, widthMm: 1000 };
  const sp1 = sidePosition(disc.stage, undefined, chord, 0.5);
  const along1 = itemAlong(disc.stage, short, itemSidePoint(disc.stage, short, sp1.t * rim[0].L)!)!;
  assert(Math.abs(along1.s - sp1.t * rim[0].L) < 2 && Math.abs(along1.o) < 2, "a point on the rim reads back as how far round it is");
  assert(Math.abs(edgeItemShape(disc.stage, short, deckOf)!.widthMm - 1000) < 1, "a metre-wide flight on the rim is a metre wide along it");
  const rampShape = edgeItemShape(disc.stage, { id: "rp", kind: "ramp", edge: 0, t: 0.5, widthMm: 1200 }, deckOf)!;
  assert(rampShape.polygon.length === 4, "a ramp on a curve stands straight, on the tangent");
  // Near a wall above it (y = −2400): the stretch with no floor for 84cm of steps is split off, and
  // the rest keeps its stairs.
  const wallAbove: WallDistance = (q) => Math.abs(q.y + 2400);
  const nearWall = defaultEdgeItems(disc, deckOf, nid, wallAbove);
  assert(nearWall.some((it) => edgeKind(it) === "stairs") && nearWall.some((it) => edgeKind(it) === "barrier"), "a round stage near a wall keeps stairs where there is floor, a barrier where there is not");
  assert(edgeGaps({ ...disc, stage: { ...disc.stage, stairs: nearWall } }, deckOf, wallAbove).length === 0, "…and no stretch of its rim is left bare");
  assert(nearWall.filter((it) => edgeKind(it) === "barrier").every((it) => {
    const s = edgeItemShape(disc.stage, it, deckOf)!;
    return s.base.y < 0;
  }), "…the barrier on the side facing the wall");
  const asked = settleEdgeItems(disc, ring, deckOf, nid, wallAbove, { inner: true, otherwise: "keep" });
  assert(asked.some((it) => it.inner) && asked.some((it) => !it.inner), "…or, asked for stairs, inner ones there and outer ones elsewhere");
  assert(rehomeEdgeItems(withRing, { ...withRing }, nid).length === 1, "the fill tool reopened on a round stage keeps its items where they stand");

  // A round PIECE the studio owns becomes a round stage built of itself.
  const roundDeck: DeckType = { id: "disc4", widthMm: 4000, depthMm: 4000, heightMm: 400, round: true };
  const deckOf2: DeckLookup = (id) => (id === "disc4" ? roundDeck : decks[id]);
  const piece = stageFromPiece({ id: "rp", variantId: "disc4", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 5000, y: 5000 } }, { widthMm: 4000, depthMm: 4000 }, { decks: ["big"], heightMm: 400, deckOf: deckOf2, newId: nid, withEdges: true, round: true });
  assert(piece.stage.smooth?.length === piece.stage.outline.length, "a round piece becomes a stage with a curved rim");
  const pieceDecks = layStage(piece.stage, deckOf2).decks;
  assert(pieceDecks.length === 1 && pieceDecks[0].typeId === "disc4" && pieceDecks[0].round === true, "…standing on the one round piece it is");
  assert(stageHeight(piece.stage, deckOf2) === 400 && piece.stage.stairs?.length === 1 && edgeKind(piece.stage.stairs[0]) === "stairs", "…at its height, with stairs round its open rim");
  assert(!stairFits(piece, { id: "x", edge: 0, t: 0.5, widthMm: 1000, inner: true }, deckOf2).ok, "…and nothing can be sunk into one solid piece");
  console.log("stage self-check passed");
}
