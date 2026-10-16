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
import type { Placement, Point, StageBuild, StageEdgeKind, StageLevel, StagePiece, StageStair } from "./types";
import type { Product } from "../catalog/types";
import { asRect, defaultFront, fillWithDecks, polygonsOverlap, signedArea, type DeckType, type FillResult, type LaidDeck, type MissingPiece } from "../studio/stage-fill";
import { pieceName, type PieceInfo } from "../studio/stage-rim";
import { flattenEdge, footprintBounds, footprintOutlines, resolveFootprint, sizedFootprint, type BuiltOutline, type Footprint } from "../studio/footprint";
import { cleanOutline, halfRoundArea, pushSide, shapeRect, splitSide, stickBoxes, unionOutline, unionShapes, type RectShape, type RoundedAt } from "../studio/stage-draw";
import { CHAIR_OFFSET_MM, CHAIR_W_MM, type Seat } from "../studio/seating";
import { BENCH_DEPTH_MM, BENCH_TOP_MM, SEAT_WIDTH_MM, SOFA_SEAT_MM, benchLayout, benchSpecOf, type BenchLayout } from "./bench";
import { slopeOn, walkingLine, walkingPadMm, type ClimbMark } from "../venues/climb";
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
  /** A whole piece (StageBuild.pieces, or one standing on the rim) as the outline it stands on, in
   *  the stage's frame — what the plan draws for it where a rectangle is drawn for a deck. */
  outline?: Point[];
  /** …flipped across its own width. */
  mirrored?: boolean;
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
 *  the quote, procurement — builds its lookup from this, so they all lay the same decks. A piece
 *  that is not a rectangle carries its shape: `round` for a disc or an oval, its `outline` for any
 *  other (a half-round, a triangle) — the fill never lays either; a stage stands them whole. */
export function deckTypeOf(variantId: string, product: Product): DeckType {
  const b = footprintBounds(resolveFootprint(product));
  const type: DeckType = { id: variantId, widthMm: Math.round(b.w), depthMm: Math.round(b.h), heightMm: product.dimensions.heightMm };
  if (isRoundPiece(product)) return { ...type, round: true };
  if (isShapedPiece(product)) {
    const shape = cachedPieceOutline(product);
    // A quarter-round is the corner piece of a rounded stage: its box is one radius across.
    const quarter = shapeOf(product) === "quarter-circle" && !product.appearance?.parts?.length ? { quarterMm: Math.round(b.w) } : {};
    if (shape) return { ...type, outline: shape.outline, ...quarter };
  }
  return type;
}

const shapeOf = (product: Product) => product.appearance?.shape ?? (product.dimensions.diameterMm ? "circle" : "rect");

/** A missing rim piece (layStage's `missing`) as the catalog row that would supply it — its name,
 *  size and drawing: a quarter-round, a half-round or a disc as the catalog's own shapes, anything
 *  else as its exact outline with its curved sides as béziers. Read back through deckTypeOf, the row
 *  is the piece the stage was missing, and the next build stands it there. */
export function pieceProduct(info: PieceInfo, heightMm: number): Pick<Product, "name" | "dimensions" | "appearance" | "spec"> {
  const name = pieceName(info);
  const spec = "פלטת במה בצורה, לשפה מעוגלת או משופעת של במה";
  switch (info.kind) {
    case "quarter": {
      const r = info.radiusMm ?? info.widthMm;
      return { name, spec, dimensions: { diameterMm: 2 * r, widthMm: r, depthMm: r, heightMm }, appearance: { shape: "quarter-circle", content: "none" } };
    }
    case "half": {
      const r = info.radiusMm ?? info.depthMm;
      return { name, spec, dimensions: { diameterMm: 2 * r, widthMm: 2 * r, depthMm: r, heightMm }, appearance: { shape: "half-circle", content: "none" } };
    }
    case "round":
      return info.radiusMm
        ? { name, spec, dimensions: { diameterMm: 2 * info.radiusMm, widthMm: 2 * info.radiusMm, depthMm: 2 * info.radiusMm, heightMm }, appearance: { shape: "circle", content: "none" } }
        : { name, spec, dimensions: { widthMm: info.widthMm, depthMm: info.depthMm, heightMm }, appearance: { shape: "ellipse", content: "none" } };
    case "rect":
      return { name, spec, dimensions: { widthMm: info.widthMm, depthMm: info.depthMm, heightMm }, appearance: { shape: "rect", content: "none" } };
    default:
      return {
        name,
        spec,
        dimensions: { widthMm: info.widthMm, depthMm: info.depthMm, heightMm },
        appearance: { shape: "custom", outline: info.outline, ...(info.edgeCurves?.some(Boolean) ? { edgeCurves: info.edgeCurves } : {}), content: "none" },
      };
  }
}

/** A round or oval stage piece — a "במה עגולה" the studio owns: one platform, which becomes a stage
 *  with a curved rim (stageFromPiece `round`) built of itself. */
export function isRoundPiece(product: Product): boolean {
  const shape = shapeOf(product);
  return (shape === "circle" || shape === "ellipse") && !product.appearance?.parts?.length;
}

/** A stage piece of any shape but a plain rectangle — a disc, a half-round, a quarter, a triangle,
 *  a hexagon, one drawn by hand or built of added shapes. It becomes a stage of its own outline
 *  (pieceOutline), standing on itself whole. */
export function isShapedPiece(product: Product): boolean {
  return shapeOf(product) !== "rect" || !!product.appearance?.parts?.length;
}

/** About how long each chord of a round stage's rim is. Short enough that the polygon reads as a
 *  curve; long enough to stay a few dozen points. */
const ROUND_SIDE_MM = 250;

/** One catalog outline as a stage outline: every curved edge cut into chords of about
 *  ROUND_SIDE_MM, the corners inside a curve marked smooth — and so is a corner where two curves meet
 *  without turning (the apex of a half-round), but not where a curve meets a straight side (the ends
 *  of its chord, which are real corners: a run of stairs turns there). */
function flattenCurves(b: BuiltOutline): { outline: Point[]; smooth: number[] } {
  const n = b.outline.length;
  const edges = b.outline.map((a, i) => {
    const next = b.outline[(i + 1) % n];
    const curve = b.edgeCurves?.[i] ?? null;
    if (!curve) return { pts: [a, next], curved: false };
    const rough = flattenEdge(a, next, curve, 16);
    let L = 0;
    for (let k = 1; k < rough.length; k++) L += len(rough[k - 1], rough[k]);
    return { pts: flattenEdge(a, next, curve, Math.max(2, Math.ceil(L / ROUND_SIDE_MM))), curved: true };
  });
  const outline: Point[] = [];
  const smooth: number[] = [];
  const turn = (a: Point, b: Point, c: Point) => {
    const u = Math.atan2(b.y - a.y, b.x - a.x);
    const v = Math.atan2(c.y - b.y, c.x - b.x);
    const d = Math.abs(v - u) % (2 * Math.PI);
    return Math.min(d, 2 * Math.PI - d);
  };
  edges.forEach((e, i) => {
    const prev = edges[(i - 1 + n) % n];
    if (e.curved && prev.curved && turn(prev.pts[prev.pts.length - 2], e.pts[0], e.pts[1]) < rad(30)) smooth.push(outline.length);
    outline.push(e.pts[0]);
    for (let k = 1; k < e.pts.length - 1; k++) {
      smooth.push(outline.length);
      outline.push(e.pts[k]);
    }
  });
  return { outline, smooth };
}

/** A stage piece's shape as a stage outline, in the piece's own frame and centred on its box: a
 *  rectangle's four corners, a disc's or an oval's roundOutline, and any other shape its catalog
 *  drawing with the curves cut into chords — several added shapes as their union. At `sizeMm` when
 *  the piece was stretched on the plan. Null when the drawing is not one piece. */
export function pieceOutline(product: Product, sizeMm?: { widthMm: number; depthMm: number }): { outline: Point[]; smooth: number[] } | null {
  const fp = sizedFootprint(product, sizeMm);
  if (fp.kind === "rect") return { outline: rectOutline(Math.round(fp.widthMm), Math.round(fp.depthMm)), smooth: [] };
  if (fp.kind === "circle") return roundOutline(fp.diameterMm, fp.diameterMm);
  if (fp.kind === "ellipse") return roundOutline(fp.widthMm, fp.depthMm);
  const parts = footprintOutlines(fp).map(flattenCurves);
  const one = parts.length === 1 ? parts[0] : unionShapes(parts);
  if (!one || one.outline.length < 3) return null;
  const xs = one.outline.map((q) => q.x);
  const ys = one.outline.map((q) => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { outline: one.outline.map((q) => ({ x: Math.round(q.x - cx), y: Math.round(q.y - cy) })), smooth: one.smooth };
}

/** The catalog-size outline of a shaped piece, worked out once per catalog row — the deck lookup is
 *  asked for it on every draw. */
const pieceOutlines = new WeakMap<Product, { outline: Point[]; smooth: number[] } | null>();
function cachedPieceOutline(product: Product) {
  if (!pieceOutlines.has(product)) pieceOutlines.set(product, pieceOutline(product));
  return pieceOutlines.get(product) ?? null;
}

/** A whole piece's outline about its own centre: its catalog shape, or the ellipse or rectangle of
 *  its box. */
function pieceShape(t: DeckType): Point[] {
  if (t.outline?.length) return t.outline;
  return t.round ? roundOutline(t.widthMm, t.depthMm).outline : rectOutline(t.widthMm, t.depthMm);
}

/** A whole piece where it stands in the stage's frame: flipped, turned, moved. */
export function placedPiece(pc: StagePiece, t: DeckType): Point[] {
  const r = rad(pc.rotation || 0);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return pieceShape(t).map((q) => {
    const x = pc.mirrored ? -q.x : q.x;
    return { x: pc.centre.x + x * c - q.y * s, y: pc.centre.y + x * s + q.y * c };
  });
}

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

// ── Rounded corners and a bowed front ─────────────────────────────────────────────────────────
//
// A rectangle the fill tool SHAPED (lib/studio/stage-draw.ts shapeRect) remembers what was done to
// it — StageBuild.roundedMm / roundedAt / bowMm — because the outline alone cannot say what fillet
// radius or what sagitta it carries, and a resize, a typed size or the fill tool reopened has to do
// the same thing to the new rectangle (plainRect is the rectangle it was made from: its box less the
// bow). It is BUILT like any other outline, though (layStage): decks in the rows, and the corners'
// arcs and the bow as rim pieces — a quarter-round, a deck with a curved side — that the studio owns
// or is told it is missing (lib/studio/stage-rim.ts). No deck is cut to a curve: the crew brings the
// piece made for it. Shaping is a rectangle's: an L or a round area has no plain rectangle, and a
// shaped stage merged with another forgets its shape (mergeStages).

/** A corner piece is called for only where the outline turns at least this much (a tangent point
 *  between a straight run and an arc turns a few degrees, and is no corner). */
const CORNER_TURN_MIN = rad(15);

export interface StageShape {
  roundedMm: number;
  roundedAt: RoundedAt;
  bowMm: number;
}

/** What a stage was shaped with, when anything: a radius, which corners, a sagitta. */
export function stageShapeOf(s: Pick<StageBuild, "roundedMm" | "roundedAt" | "bowMm">): StageShape | null {
  const roundedMm = s.roundedMm && s.roundedMm > 0 ? s.roundedMm : 0;
  const bowMm = s.bowMm && s.bowMm > 0 ? s.bowMm : 0;
  return roundedMm || bowMm ? { roundedMm, roundedAt: s.roundedAt ?? "all", bowMm } : null;
}

/** The stage's box in its own frame — what a shaped or round stage reads as its size. */
export function stageBox(stage: Pick<StageBuild, "outline">): { widthMm: number; depthMm: number } {
  const xs = stage.outline.map((q) => q.x);
  const ys = stage.outline.map((q) => q.y);
  return { widthMm: Math.round(Math.max(...xs) - Math.min(...xs)), depthMm: Math.round(Math.max(...ys) - Math.min(...ys)) };
}

/** The rectangle a shaped stage was made from, in its frame, front first along the top (−y): its
 *  box, less the bow in front of the chord. Null for a stage that carries no shape. */
export function plainRect(stage: Pick<StageBuild, "outline" | "roundedMm" | "roundedAt" | "bowMm">): Point[] | null {
  const shape = stageShapeOf(stage);
  if (!shape) return null;
  const xs = stage.outline.map((q) => q.x);
  const ys = stage.outline.map((q) => q.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys) + shape.bowMm;
  const y1 = Math.max(...ys);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** A rectangle shaped as asked, as the pieces of a StageBuild: its outline centred on its own box,
 *  the corners its curves run through, its front (edge 0), and `offset` — where its centre stands
 *  in the plain rectangle's frame, so the caller can keep the rectangle where it was drawn. */
export function shapedRect(widthMm: number, depthMm: number, shape: RectShape): { outline: Point[]; smooth?: number[]; front: number; offset: Point } {
  const r = shapeRect(widthMm, depthMm, shape);
  return { outline: r.outline, ...(r.smooth.length ? { smooth: r.smooth } : {}), front: r.front, offset: r.offset };
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
  // Remembered per stage OBJECT: a selected stage is re-laid on every frame the plan pans or zooms,
  // and it is the same object until it is edited. Keyed too on the decks the lookup returns, so a
  // deck re-measured in the catalog is laid afresh.
  const sig = [...stage.decks, ...(stage.pieces ?? []).map((pc) => pc.variantId)]
    .map((id) => {
      const t = deckOf(id);
      return t ? `${id}:${t.widthMm}x${t.depthMm}x${t.heightMm ?? ""}${t.round ? "r" : ""}${t.outline ? `o${t.outline.length}` : ""}${t.quarterMm ? `q${t.quarterMm}` : ""}` : `${id}:-`;
    })
    .join("|");
  const hit = laidCache.get(stage);
  if (hit && hit.sig === sig) return hit.layout;
  const layout = layFresh(stage, deckOf);
  laidCache.set(stage, { sig, layout });
  return layout;
}
const laidCache = new WeakMap<StageBuild, { sig: string; layout: StageLayout }>();

function layFresh(stage: StageBuild, deckOf: DeckLookup): StageLayout {
  const all = stageDeckTypes(stage, deckOf);
  const levels = stage.levels ?? [];
  const baseH = stageHeight(stage, deckOf);
  // A round stage the size of a round piece the studio owns stands on that piece, whole. (A stage
  // made since says so itself — StageBuild.pieces — and this guess is for one made before.)
  const whole = levels.length || stage.pieces?.length ? null : wholePiece(stage, all);
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
      missing: [],
    };
  }
  const types = all.filter((t) => !t.round && !t.outline);
  // The shapes that are not rectangles — a quarter-round, a deck with a curved side, a triangle —
  // which the RIM of a curved or angled stage is built of where they fit (lib/studio/stage-rim.ts).
  const shaped = all.filter((t) => t.round || t.outline);
  // The whole pieces stand where they stand, and the decks are laid round them.
  const pieces = (stage.pieces ?? []).flatMap((pc) => {
    const t = deckOf(pc.variantId);
    return t ? [{ pc, t, poly: placedPiece(pc, t) }] : [];
  });
  const piecePolys = pieces.map((x) => x.poly);
  // An inner flight is a RECESS: no deck stands where its steps go down into the stage.
  const baseRecess = recesses(stage, undefined, deckOf);
  const obstacles = [...levels.map((l) => l.outline), ...baseRecess, ...piecePolys];
  // A curved front that is not a closed rim — a bowed front, a half-round facing out from its arc —
  // lays its rows along its end-to-end chord, not along whichever way its first chord leans.
  const frontSide = stageSide(stage, undefined, stage.front);
  const axis = frontSide?.curved && !frontSide.closed ? ([frontSide.points[0], frontSide.points[frontSide.points.length - 1]] as const) : undefined;
  // One build for every outline — a rounded or bowed rectangle (StageBuild.roundedMm / bowMm) too:
  // the decks in the rows the outline allows, its curves and angled sides as pieces, owned or missing.
  const base = fillWithDecks(stage.outline, types, {
    front: stage.front,
    obstacles,
    exceed: stage.exceed,
    phases: !!stage.smooth?.length,
    axis,
    smooth: stage.smooth,
    pieces: shaped,
  });
  // The fill keeps out of an obstacle by its cells' centres; a deck that would still reach into a
  // recess is left out — nobody stands a deck over a flight of steps — and so is one that would
  // reach onto a piece: two platforms do not stand in one place.
  const clear = (holes: Point[][]) => (d: LaidDeck) => !holes.some((h) => deckOverlaps(d, h));
  const laid = base.decks.filter(clear(baseRecess)).filter(clear(piecePolys));
  const decks: StageDeck[] = [
    ...pieces.map(({ pc, t, poly }) => ({
      typeId: t.id,
      centre: pc.centre,
      rotation: pc.rotation || 0,
      widthMm: t.widthMm,
      depthMm: t.depthMm,
      heightMm: baseH,
      outline: poly,
      ...(t.round ? { round: true } : {}),
      ...(pc.mirrored ? { mirrored: true } : {}),
    })),
    ...laid.map((d) => ({ ...d, heightMm: baseH, ...(d.outline && deckOf(d.typeId)?.round ? { round: true } : {}) })),
  ];
  for (const l of levels) {
    const holes = recesses(stage, l.id, deckOf);
    const r = fillWithDecks(l.outline, types, { front: levelFront(l.outline), within: stage.outline, obstacles: holes });
    decks.push(...r.decks.filter(clear(holes)).map((d) => ({ ...d, level: l.id, heightMm: l.heightMm })));
  }
  const covered = decks.reduce((s, d) => s + (d.outline ? Math.abs(signedArea(d.outline)) : d.widthMm * d.depthMm), 0);
  // Coverage is of the floor meant to be decked, and a recess is left open on purpose.
  const decked = base.areaMm2 - baseRecess.reduce((s, q) => s + Math.abs(signedArea(q)), 0);
  return {
    ...base,
    decks,
    coverage: decked > 0 ? Math.min(1, covered / decked) : 0,
    // A stage with levels or pieces has been shaped on purpose: no sizes are suggested.
    suggestions: levels.length || pieces.length ? [] : base.suggestions,
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

/** Whether the stage is ONE whole piece (a disc, a half-round the studio owns) and nothing else —
 *  nothing can be cut into it. */
export function stageIsOnePiece(stage: StageBuild, deckOf: DeckLookup): boolean {
  if (stage.levels?.length) return false;
  if (stage.pieces?.length) {
    const laid = layStage({ ...stage, stairs: undefined }, deckOf).decks;
    return laid.length > 0 && laid.every((d) => !!d.outline);
  }
  return !!wholePiece(stage, stageDeckTypes(stage, deckOf));
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
    const flipped = !!d.mirrored !== !!p.mirrored;
    const { mirrored: _m, ...rest } = d;
    return {
      ...rest,
      centre: { x: Math.round(c.x), y: Math.round(c.y) },
      rotation: norm360((p.mirrored ? -d.rotation : d.rotation) + (p.rotation || 0)),
      ...(d.outline ? { outline: d.outline.map((q) => toRoom(p, q)) } : {}),
      ...(flipped ? { mirrored: true } : {}),
    };
  });
}

/** The rim pieces the stage is missing, where they go in the room. */
export function stageMissingInRoom(p: StagePlacement, deckOf: DeckLookup): MissingPiece[] {
  return layStage(p.stage, deckOf).missing.map((m) => ({ ...m, outline: m.outline.map((q) => toRoom(p, q)) }));
}

/** The missing pieces of a stage, one entry per SHAPE: what it is and how many of it — what the
 *  fill panel and the stage bar list, and what "הוספה לקטלוג" adds. */
export function missingByShape(missing: readonly MissingPiece[]): { shape: string; info: PieceInfo; count: number }[] {
  const out = new Map<string, { shape: string; info: PieceInfo; count: number }>();
  for (const m of missing) {
    const g = out.get(m.shape);
    if (g) g.count++;
    else out.set(m.shape, { shape: m.shape, info: m.info, count: 1 });
  }
  return [...out.values()];
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

/** A banquette's depth, seat module and heights live with the banquette (./bench.ts — one layout for
 *  a stage's edge banquette and a standalone one); re-exported for the readers that always found
 *  them here. */
export { BENCH_DEPTH_MM, BENCH_TOP_MM, SEAT_WIDTH_MM, SOFA_SEAT_MM } from "./bench";
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
  /** Stairs and a ramp: the walking line up it — a dot at the foot, an arrowhead where it reaches
   *  the deck — and a ramp's slope written on it; the picture a free-standing flight from the
   *  catalog is drawn with (lib/venues/climb.ts, components/climb-glyph.tsx WalkingLine), so a
   *  stage's own steps read the same as a rented flight standing beside it. Up the middle of the
   *  item, standing in from both ends. */
  climb?: ClimbMark;
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
  /** Bench: its TOP (above the deck, for a chairs side), everyone who sits at it, and where each
   *  chair stands — on the stage side BEHIND it, tucked under its inner edge and facing out over it
   *  into the room, as a head table's chairs are; or in the room in front of it, facing it (in the
   *  stage's frame, as a table's chairs are in its). Only chairs are packed; `seats` counts the sofa
   *  side's sitters too, drawn as `cushions` inside the strip with a `backs` line (./bench.ts). */
  heightMm: number;
  seats: number;
  chairs: Seat[];
  sofaSeats: number;
  sofaHeightMm: number;
  cushions: Point[][];
  backs: [Point, Point][];
  /** The banquette as laid in its own frame — which side is what. Only on a bench. */
  bench?: BenchLayout;
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
  const shape = (s: {
    polygon: Point[];
    treads?: [Point, Point][];
    climb?: ClimbMark;
    depth: number;
    reach: number;
    risers?: number;
    riserMm?: number;
    heightMm?: number;
    seats?: number;
    chairs?: Seat[];
    sofaSeats?: number;
    sofaHeightMm?: number;
    cushions?: Point[][];
    backs?: [Point, Point][];
    bench?: BenchLayout;
  }): EdgeItemShape => ({
    kind,
    inner,
    polygon: s.polygon,
    treads: s.treads ?? [],
    climb: s.climb,
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
    sofaSeats: s.sofaSeats ?? 0,
    sofaHeightMm: s.sofaHeightMm ?? 0,
    cushions: s.cushions ?? [],
    backs: s.backs ?? [],
    bench: s.bench,
  });
  if (kind === "barrier" || kind === "backdrop") {
    const thick = kind === "barrier" ? BARRIER_MM : BACKDROP_MM;
    return shape({ polygon: strip(0, -thick), depth: thick, reach: -thick });
  }
  if (kind === "bench") {
    // The banquette is laid in ITS OWN frame by the one function a standalone banquette uses too
    // (./bench.ts): its back is the stage side, so chairs there stand on the STAGE, pushed in under
    // its edge, facing it and the room past it; a sofa there is sat on facing the stage; the front
    // side faces the room. Then carried onto the edge: the strip's centre line is half a depth out —
    // or, for an inner banquette standing on the deck, half a depth in, its chairs further in still.
    // On a curved side `at` follows the curve, so the cushions and the chairs bend with the rim.
    const spec = benchSpecOf(item);
    const depthMm = spec.depthMm && spec.depthMm > 0 ? spec.depthMm : BENCH_DEPTH_MM;
    const lay = benchLayout(w, depthMm, spec);
    const dir = inner ? -1 : 1;
    // The banquette's own +y (its front, toward the room) is the side's outward normal either way;
    // only its centre line moves — half a depth out of the edge, or half a depth in.
    const carry = (q: Point) => at(q.x, q.y + (dir * depthMm) / 2);
    const face = (x: number, deg: number) => {
      // A local facing turned into the stage's: along the edge's direction and its outward normal at
      // this point of the side (which bends with a curve).
      const n = bent ? sideFrame(side, mid + x).n : m.n;
      const u = bent ? sideFrame(side, mid + x).u : m.u;
      const r = (deg * Math.PI) / 180;
      const d = { x: u.x * Math.cos(r) + n.x * Math.sin(r), y: u.y * Math.cos(r) + n.y * Math.sin(r) };
      return (Math.atan2(d.y, d.x) * 180) / Math.PI;
    };
    const reach = dir * depthMm;
    return shape({
      polygon: strip(0, reach),
      depth: depthMm,
      reach,
      heightMm: lay.heightMm,
      seats: lay.seats,
      chairs: lay.chairs.map((c) => ({ ...carry(c), facingDeg: face(c.x, c.facingDeg) })),
      sofaSeats: lay.sofaSeats,
      sofaHeightMm: lay.sofaHeightMm,
      cushions: lay.cushions.map((q) => q.map(carry)),
      backs: lay.backs.map(([a, b]) => [carry(a), carry(b)] as [Point, Point]),
      bench: lay,
    });
  }
  // The walking line up a flight or a ramp, from its foot on the floor to where it reaches the deck,
  // standing in from both ends (lib/venues/climb.ts — the catalog's own flight draws the same line).
  // Up the item's middle: on a curved side `at(0, y)` runs along the normal there, so it is straight.
  const walk = (floorY: number, deckY: number, depthMm: number): { foot: Point; top: Point } => {
    const pad = walkingPadMm(depthMm);
    const toDeck = Math.sign(deckY - floorY);
    return { foot: at(0, floorY + toDeck * pad), top: at(0, deckY - toDeck * pad) };
  };
  if (kind === "ramp") {
    if (riseMm <= 0) return null;
    const depthMm = Math.max(1000, Math.round(riseMm * RAMP_SLOPE));
    // The arrow up the ramp, foot to stage, with its slope written on it — what a ramp is drawn
    // with on a plan.
    const { foot, top } = walk(depthMm, 0, depthMm);
    return shape({
      polygon: strip(0, depthMm),
      climb: { arrow: walkingLine(foot, top, w), slope: slopeOn(foot, top, depthMm, riseMm) },
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
  // An outer flight is climbed from the floor at its far side up to the edge; an inner one from the
  // floor at the edge up onto the deck at its far side.
  const { foot, top } = inner ? walk(0, -depthMm, depthMm) : walk(depthMm, 0, depthMm);
  return shape({
    polygon: strip(0, dir * depthMm),
    treads: lines,
    climb: { arrow: walkingLine(foot, top, w) },
    depth: depthMm,
    reach: dir * depthMm,
    risers,
    riserMm: Math.round(riseMm / risers),
  });
}

/** A flight's shape — null for anything that is not stairs. */
export function stairShape(stage: StageBuild, stair: StageStair, deckOf: DeckLookup): EdgeItemShape | null {
  return edgeKind(stair) === "stairs" ? edgeItemShape(stage, stair, deckOf) : null;
}

/** A walking line and its slope carried through a point map: the slope's angle is re-read off the
 *  carried line (foot to head), so a flipped stage's reads as the room sees it. */
function carryClimb(climb: ClimbMark, r: (q: Point) => Point): ClimbMark {
  const arrow = { ...climb.arrow, from: r(climb.arrow.from), to: r(climb.arrow.to), head: climb.arrow.head.map(r) };
  const head = arrow.head[0] ?? arrow.to;
  const angleDeg = (Math.atan2(head.y - arrow.from.y, head.x - arrow.from.x) * 180) / Math.PI;
  return { arrow, slope: climb.slope && { ...climb.slope, at: r(climb.slope.at), angleDeg } };
}

/** An edge item's shape carried out of its stage's frame into the room — what items of two stages
 *  are compared and drawn together by (lib/design-document/edge-runs.ts). Its chairs are left out:
 *  each stage draws its own. */
export function edgeItemInRoom(p: StagePlacement, shape: EdgeItemShape): EdgeItemShape {
  const r = (q: Point) => toRoom(p, q);
  const base = r(shape.base);
  const ahead = r({ x: shape.base.x + Math.cos(rad(shape.angleDeg)), y: shape.base.y + Math.sin(rad(shape.angleDeg)) });
  return {
    ...shape,
    polygon: shape.polygon.map(r),
    treads: shape.treads.map(([u, v]) => [r(u), r(v)] as [Point, Point]),
    climb: shape.climb && carryClimb(shape.climb, r),
    base,
    foot: r(shape.foot),
    farLine: shape.farLine.map(r),
    midline: shape.midline.map(r),
    angleDeg: (Math.atan2(ahead.y - base.y, ahead.x - base.x) * 180) / Math.PI,
    chairs: [],
  };
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
    // The front is the SIDE the front edge is on — a bowed front is still the front (skirt, never a
    // railing); a rim that goes all the way round has no front, its one chord notwithstanding.
    if (open.length) out.push({ edge: side.edge, side, L: side.L, open, dropMm: baseH, front: !side.closed && side.edges.includes(stage.front) });
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

/** A side all the way round that bends — a round stage's rim. Open, it is finished by its skirt:
 *  the way round a disc is not an edge anyone expects stairs along. */
const isRim = (side: StageSide) => side.closed && side.curved;

/** On a side all the way round, a bare stretch ending where the lap ends and one starting where it
 *  starts are ONE stretch across the seam at edge 0 — one flight to fill it with, not two. */
function joinedRound(e: OpenEdge, lo: number, hi: number, parts: [number, number][]): [number, number][] {
  if (!e.side.closed || parts.length < 2 || lo > 1e-6 || hi < e.L - 1e-6) return parts;
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (first[0] > 1e-6 || last[1] < e.L - 1e-6) return parts;
  return [...parts.slice(1, -1), [last[0] - e.L, first[1]]];
}

/** Every stretch of an open edge that NOTHING covers — no stairs, no banquette, no barrier. These are
 *  the edges somebody can walk off, and the stage bar asks for them to be filled. A ROUND stage's
 *  rim is not among them: its default is one flight at the back and skirt round the rest, and an
 *  open rim is normal there — `rims` asks for it anyway (fillGaps, when the designer wants more). */
export function edgeGaps(p: StagePlacement, deckOf: DeckLookup, wallDistance?: WallDistance, opts: { rims?: boolean } = {}): EdgeRun[] {
  const any = kindIn("stairs", "bench", "barrier", "backdrop", "ramp");
  return needyEdges(p, deckOf, wallDistance)
    .filter((e) => opts.rims || !isRim(e.side))
    .flatMap((e) => e.open.flatMap(([lo, hi]) => runsOf(e, joinedRound(e, lo, hi, uncoveredIn(lo, hi, spansOn(p.stage, e, any))))));
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

/** Items that cover every gap with `kind` — the one-click "finish the edges". Ids from `newId`. A
 *  round stage's bare rim too when `rims` is asked (edgeGaps). */
export function fillGaps(p: StagePlacement, deckOf: DeckLookup, kind: StageEdgeKind, newId: () => string, wallDistance?: WallDistance, opts: { rims?: boolean } = {}): StageStair[] {
  return edgeGaps(p, deckOf, wallDistance, opts).map((g) => {
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
 *  stage is a choice the designer makes, not a default: a whole side recessed eats a strip of deck.)
 *  A ROUND stage — a rim all the way round with nothing on it yet — gets ONE flight, at its back,
 *  and the rest of its rim is skirted: stairs round a whole disc is not what anyone builds. */
export function defaultEdgeItems(p: StagePlacement, deckOf: DeckLookup, newId: () => string, wallDistance?: WallDistance): StageStair[] {
  const items = fillGaps(p, deckOf, "stairs", newId, wallDistance).filter((it) => !it.level);
  const taken = new Set((p.stage.stairs ?? []).filter((it) => !it.level).map((it) => stageSide(p.stage, undefined, it.edge)?.edge));
  const rims = stageSides(p.stage)
    .filter((s) => isRim(s) && !taken.has(s.edge))
    .flatMap((s) => backFlight(p, s, deckOf, newId, wallDistance) ?? []);
  return settleEdgeItems(p, [...items, ...rims], deckOf, newId, wallDistance, { inner: false, otherwise: "barrier" });
}

/** One STAIR_WIDTH_MM flight on a round stage's rim, OPPOSITE its front — the point of the rim
 *  farthest from the room — or the nearest place round from there with floor in front of it. Null
 *  when the whole rim is against walls. */
function backFlight(p: StagePlacement, side: StageSide, deckOf: DeckLookup, newId: () => string, wallDistance?: WallDistance): StageStair | null {
  const k = side.edges.indexOf(p.stage.front);
  const sFront = k >= 0 ? (side.cum[k] + side.cum[k + 1]) / 2 : 0;
  const id = newId();
  for (const f of [0, 1 / 8, -1 / 8, 1 / 4, -1 / 4, 3 / 8, -3 / 8]) {
    const s = sFront + side.L / 2 + f * side.L;
    const it: StageStair = { id, edge: side.edge, t: wrapT(s, side.L), widthMm: STAIR_WIDTH_MM };
    if (stairFits(p, it, deckOf, wallDistance).ok) return it;
  }
  return null;
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

// ── One side, shared ─────────────────────────────────────────────────────────────────────────
//
// TWO ITEMS NEVER SHARE A STRETCH OF A SIDE. A flight and a banquette on one side divide it between
// them; they do not stand through each other. The item the designer is acting on — clicked onto the
// side, dragged wider, given a typed width, told to run the whole side — takes the stretch it asks
// for, and whatever else stood there gives way: cut back where they overlap, split in two where the
// new item lands in its middle, dropped when what is left is too short to be anything. Sliding an
// item along its side is the other way round — it stops at its neighbours (freeStretch) rather than
// eating them, because a slide is a move and a move through something is not what anyone meant.

/** The shortest edge item worth keeping, mm — what the grips refuse to go under. */
export const MIN_EDGE_ITEM_MM = 300;

const wrapT = (mid: number, L: number) => ((((mid % L) + L) % L) / L);

/** The items standing on the same side as `item` (same level, same side), other than itself. */
function sideMates(stage: StageBuild, item: StageStair): StageStair[] {
  const side = stageSide(stage, item.level, item.edge);
  if (!side) return [];
  return (stage.stairs ?? []).filter((it) => it.id !== item.id && it.level === item.level && stageSide(stage, it.level, it.edge)?.edge === side.edge);
}

/** The stage's edge items with every OTHER item on `keepId`'s side trimmed to clear its span. Items
 *  elsewhere are untouched; a trimmed item keeps its id for its first piece (the second piece of a
 *  split takes a new one, derived and unique). Unknown id: the items as they are. */
export function shareSide(stage: StageBuild, keepId: string): StageStair[] {
  const items = stage.stairs ?? [];
  const keep = items.find((it) => it.id === keepId);
  const side = keep && stageSide(stage, keep.level, keep.edge);
  const ks = keep && itemSpan(stage, keep);
  if (!keep || !side || !ks) return [...items];
  const laps = side.closed ? [-side.L, 0, side.L] : [0];
  const taken = laps.map((d) => [ks.from + d, ks.to + d] as [number, number]);
  const mates = new Set(sideMates(stage, keep).map((it) => it.id));
  const ids = new Set(items.map((it) => it.id));
  const freshId = (base: string) => {
    let k = 2;
    while (ids.has(`${base}-${k}`)) k++;
    const id = `${base}-${k}`;
    ids.add(id);
    return id;
  };
  const out: StageStair[] = [];
  for (const it of items) {
    if (!mates.has(it.id)) {
      out.push(it);
      continue;
    }
    const sp = itemSpan(stage, it);
    if (!sp) {
      out.push(it);
      continue;
    }
    const left = uncoveredIn(sp.from, sp.to, taken).filter(([f, t]) => t - f >= MIN_EDGE_ITEM_MM);
    if (left.length === 1 && left[0][0] <= sp.from + 1 && left[0][1] >= sp.to - 1) {
      out.push(it); // nothing of it under the kept item
      continue;
    }
    let first = true;
    for (const [f, t] of left) {
      const { full: _full, ...rest } = it;
      out.push({ ...rest, id: first ? it.id : freshId(it.id), t: wrapT((f + t) / 2, side.L), widthMm: Math.round(t - f) });
      first = false;
    }
  }
  return out;
}

/** The stretch of its side `item` may stand on without touching another item on it: from the end of
 *  the nearest item before it to the start of the nearest after it — the side's own ends on an open
 *  side with nothing else; a full lap either way on a closed one. In mm along the side, in the same
 *  coordinates as itemSpan (a closed side's may run past 0 or L). Null when the item has no side. */
export function freeStretch(stage: StageBuild, item: StageStair): { from: number; to: number; L: number } | null {
  const side = stageSide(stage, item.level, item.edge);
  const sp = itemSpan(stage, item);
  if (!side || !sp) return null;
  const L = side.L;
  const mid = (sp.from + sp.to) / 2;
  let lo = side.closed ? mid - L : 0;
  let hi = side.closed ? mid + L : L;
  for (const other of sideMates(stage, item)) {
    const o = itemSpan(stage, other);
    if (!o) continue;
    // On a closed side the other item is read on the lap nearest this one.
    const shift = side.closed ? L * Math.round((mid - (o.from + o.to) / 2) / L) : 0;
    const from = o.from + shift;
    const to = o.to + shift;
    if (to <= sp.from + 1) lo = Math.max(lo, to);
    else if (from >= sp.to - 1) hi = Math.min(hi, from);
    // Overlapping already: neither bound — the slide will carry it clear or shareSide will cut.
  }
  return { from: lo, to: hi, L };
}

/** Every side divided: the NARROWER item keeps its stretch and the wider gives way round it
 *  (shareSide) — a banquette set on a side with a flight along its whole length is the deliberate
 *  one, and the flight is what parts round it. What a merge or a reshape hands back goes through
 *  this so no two items it carried over stand through each other. Each pass leaves everything clear
 *  of its keeper, so a later pass never cuts an earlier keeper. */
function resolveOverlaps(stage: StageBuild): StageStair[] {
  const width = (it: StageStair) => {
    const sp = itemSpan(stage, it);
    return sp ? sp.to - sp.from : Infinity;
  };
  let items = [...(stage.stairs ?? [])];
  for (const it of [...items].sort((a, b) => width(a) - width(b))) {
    if (!items.some((x) => x.id === it.id)) continue;
    items = shareSide({ ...stage, stairs: items }, it.id);
  }
  return items;
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
      // Outside corners only: the outline turns the way it winds — and turns in earnest. Where a
      // straight run meets an arc the corner is a TANGENT point, turning only the half-chord the
      // arc's first chord leans by; the runs on either side of it are flush, and the sliver between
      // them is no corner piece.
      const turn = (c.x - a.x) * (b.y - c.y) - (c.y - a.y) * (b.x - c.x);
      if (turn * sg <= 0) continue;
      const along = (c.x - a.x) * (b.x - c.x) + (c.y - a.y) * (b.y - c.y);
      if (Math.atan2(Math.abs(turn), along) < CORNER_TURN_MIN) continue;
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

/** Everyone a document's STAGE banquettes seat — on chairs and on a sofa side alike. (A standalone
 *  banquette's seats are standaloneBenchSeats, ./bench.ts — it needs the catalog to be told apart.) */
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

/** A ROUND stage: a disc, an oval, or a half-round — every corner on its curve but at most the two
 *  ends of a chord. The one kind a new size SCALES whole (scaleStage); a stage merged from a
 *  rectangle and a half-round is not round, and keeps its own sides. */
export function stageIsRound(stage: Pick<StageBuild, "outline" | "smooth">): boolean {
  return !!stage.smooth?.length && stage.smooth.length >= stage.outline.length - 2;
}

/** A stage with a curve — a disc, an oval, a half-round — at a new size, scaled WHOLE about its
 *  centre: the same curve through the same corners, its levels scaled with it, its stairs where they
 *  were along their sides. A whole piece is no longer its own size, so it goes, and the stage is
 *  built of decks. (The caller moves the placement, as for a rectangle — the back held still.) */
export function scaleStage(stage: StageBuild, size: { widthMm: number; depthMm: number }): StageBuild {
  const xs = stage.outline.map((q) => q.x);
  const ys = stage.outline.map((q) => q.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const d = Math.max(...ys) - Math.min(...ys);
  if (!w || !d) return stage;
  const sx = size.widthMm / w;
  const sy = size.depthMm / d;
  const scale = (q: Point) => ({ x: Math.round(q.x * sx), y: Math.round(q.y * sy) });
  const { pieces: _whole, ...rest } = stage;
  return { ...rest, outline: stage.outline.map(scale), levels: stage.levels?.map((l) => ({ ...l, outline: l.outline.map(scale) })) };
}

/** The stage's whole pieces (StageBuild.pieces), kept where they STAND IN THE ROOM when the stage's
 *  frame changes under them — the area tool re-framing an edited stage, a turned or flipped frame
 *  becoming an unturned one. A piece of a flipped frame is flipped once more and turns the other way. */
export function carryPieces(pieces: readonly StagePiece[] | undefined, from: Frame, to: Frame): StagePiece[] | undefined {
  if (!pieces?.length) return pieces ? [...pieces] : undefined;
  const flip = !!from.mirrored !== !!to.mirrored;
  return pieces.map((pc) => {
    const c = toStageFrame(to, toRoom(from, pc.centre));
    // The piece's facing in the room, then in the new frame.
    const inRoom = (from.rotation || 0) + (from.mirrored ? -(pc.rotation || 0) : pc.rotation || 0);
    const local = (to.mirrored ? -1 : 1) * (inRoom - (to.rotation || 0));
    const mirrored = !!pc.mirrored !== flip;
    return { variantId: pc.variantId, centre: { x: Math.round(c.x), y: Math.round(c.y) }, rotation: norm360(local), ...(mirrored ? { mirrored: true } : {}) };
  });
}

/** A stage whose outline changed in its own frame (a side pushed out, a corner moved), put back in
 *  order: the outline re-centred on its box — the plan draws a custom outline about its box's
 *  centre, so an off-centre outline would draw somewhere its decks and stairs are not — its levels
 *  and whole pieces shifted by the same amount, and the placement moved so nothing moves in the room. */
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
      ...(was.stage.pieces?.length ? { pieces: was.stage.pieces.map((pc) => ({ ...pc, centre: shift(pc.centre) })) } : {}),
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
 *  the front once, not twice. The first item of each run keeps its own settings (steps, depth…).
 *  Then items of DIFFERENT kinds left standing through each other divide the side (resolveOverlaps),
 *  the earlier in the list keeping its stretch. */
export function tidyEdgeItems(stage: StageBuild): StageStair[] {
  return resolveOverlaps({ ...stage, stairs: joinRuns(stage) });
}

function joinRuns(stage: StageBuild): StageStair[] {
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
    /** Any other shape (isShapedPiece) — its outline in the piece's own frame and which of its
     *  corners a curve runs through (pieceOutline): the stage is that outline, its curves one side
     *  each, so stairs and banquettes follow them. */
    shape?: { outline: Point[]; smooth: number[] } | null;
    /** The piece stands in the stage WHOLE (StageBuild.pieces) — true for a round or shaped piece at
     *  its catalog size; one stretched on the plan is not the piece any more, and is built of decks. */
    whole?: boolean;
  },
): StagePlacement {
  const k = p.scale || 1;
  // Where the piece stands in the room — then faced the way a drawn stage is: away from the wall it
  // stands against (defaultFront), so a piece dropped facing the page's top does not face the wall.
  const room = rectOutline(Math.round(box.widthMm * k), Math.round(box.depthMm * k)).map((q) => toRoom(p, q));
  const at = stageFromArea(room, defaultFront(room, opts.wallDistance));
  const { sizeMm: _size, mirrored: _flip, ...rest } = p;
  const base = {
    front: at.front,
    decks: [...new Set([p.variantId, ...opts.decks])],
    ...(opts.heightMm && opts.heightMm > 0 ? { heightMm: opts.heightMm } : {}),
    ...(opts.parts ?? {}),
  };
  // The piece itself, standing whole where it stands — at the stage's centre, turned by however its
  // own facing differs from the stage's.
  const piece = (centre: Point): StagePiece[] =>
    opts.whole ? [{ variantId: p.variantId, centre, rotation: norm360((p.rotation || 0) - at.rotation), ...(p.mirrored ? { mirrored: true } : {}) }] : [];
  let sp: StagePlacement;
  const size = opts.round ? stageRect(at) : null;
  if (size) {
    const round = roundOutline(size.widthMm, size.depthMm);
    sp = { ...rest, position: at.position, rotation: at.rotation, scale: 1, stage: { ...base, outline: round.outline, smooth: round.smooth, ...(opts.whole ? { pieces: piece({ x: 0, y: 0 }) } : {}) } };
  } else if (opts.shape) {
    // The shape, carried out of the piece's frame into the stage's and centred on its own box.
    const pts = opts.shape.outline.map((q) => toStageFrame(at, toRoom(p, { x: q.x * k, y: q.y * k })));
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    const outline = pts.map((q) => ({ x: Math.round(q.x - c.x), y: Math.round(q.y - c.y) }));
    const centre = toRoom(at, c);
    sp = {
      ...rest,
      position: { x: Math.round(centre.x), y: Math.round(centre.y) },
      rotation: at.rotation,
      scale: 1,
      stage: {
        ...base,
        outline,
        front: levelFront(outline),
        ...(opts.shape.smooth.length ? { smooth: [...opts.shape.smooth] } : {}),
        ...(opts.whole ? { pieces: piece({ x: Math.round(-c.x), y: Math.round(-c.y) }) } : {}),
      },
    };
  } else {
    sp = { ...rest, position: at.position, rotation: at.rotation, scale: 1, stage: { ...base, outline: at.outline } };
  }
  if (opts.withEdges) sp.stage.stairs = defaultEdgeItems(sp, opts.deckOf, opts.newId, opts.wallDistance);
  return sp;
}

/** Where a point lies along a side: mm from its start to the point of it nearest, and how far off. */
function alongSide(side: StageSide, q: Point): { s: number; d: number } {
  let best = { s: 0, d: Infinity };
  for (let k = 0; k < side.points.length - 1; k++) {
    const a = side.points[k];
    const b = side.points[k + 1];
    const l = side.cum[k + 1] - side.cum[k] || 1;
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    const t = Math.max(0, Math.min(l, (q.x - a.x) * u.x + (q.y - a.y) * u.y));
    const d = Math.hypot(q.x - (a.x + u.x * t), q.y - (a.y + u.y * t));
    if (d < best.d) best = { s: side.cum[k] + t, d };
  }
  return best;
}

/** Several stages that touch, as ONE: the outline of them all, their levels carried over, every
 *  edge item re-homed — by the stretch it actually covered — onto the side of the merged outline it
 *  stood on (a seam swallows it), then tidied so a side holds one run per kind, and the decks any of
 *  them could use. A merged RECTANGLE comes out exactly as a drawn one does: front first, with resize
 *  handles. Any other shape merges too — a half-round apron against a stage, a disc over a catwalk —
 *  its curves kept curves (unionShapes) and its whole pieces carried (StageBuild.pieces). Null when
 *  they are not one connected piece without a hole — pushTogether is what gets them there. The
 *  result carries its own frame (position, rotation, unflipped): set all three. */
export function mergeStages(parts: readonly StagePlacement[]): { stage: StageBuild; position: Point; rotation: number } | null {
  if (parts.length < 2) return null;
  const anchor = parts[0];
  const inAnchor = (p: StagePlacement, q: Point) => toStageFrame(anchor, toRoom(p, q));
  // Square stages through the exact grid union, as they always were; anything with a curve or an
  // angle through the general one, which keeps a curve a curve (StageBuild.smooth).
  const square = parts.every((p) => squareStage(p) && squareTo(anchor, p));
  const shapes = parts.map((p) => ({ outline: p.stage.outline.map((q) => inAnchor(p, q)), smooth: p.stage.smooth }));
  const general = square ? null : unionShapes(shapes);
  const united = square ? unionOutline(shapes.map((s) => s.outline)) : general?.outline;
  if (!united) return null;

  // The anchor's front, found on the united outline — then the whole thing re-framed the way a drawn
  // area is (stageFromArea), so a rectangle becomes the canonical front-first one.
  const fa = inAnchor(anchor, anchor.stage.outline[anchor.stage.front]);
  const fb = inAnchor(anchor, anchor.stage.outline[(anchor.stage.front + 1) % anchor.stage.outline.length]);
  const fm = { x: (fa.x + fb.x) / 2, y: (fa.y + fb.y) / 2 };
  let frontU = united.findIndex((_, i) => segDist(fm, ...edgeOf(united, i)) <= 5);
  if (frontU < 0) {
    // The anchor's front was cut where it is — a half-round set against its middle. The longest
    // stretch of the same line still on the outline is the front, so the decks keep the anchor's
    // rows; failing that, the straight edge facing the same way nearest it; failing that, the top.
    const curve = new Set(general?.smooth ?? []);
    const fl = len(fa, fb) || 1;
    // Facing the same way: outward normals compared, each by its own outline's winding.
    const sa = signedArea(anchor.stage.outline.map((q) => inAnchor(anchor, q))) >= 0 ? 1 : -1;
    const su = signedArea(united) >= 0 ? 1 : -1;
    const out = { x: (sa * (fb.y - fa.y)) / fl, y: (-sa * (fb.x - fa.x)) / fl };
    const pick = united
      .map((a, i) => {
        const b = united[(i + 1) % united.length];
        const L = len(a, b);
        if (L < 1 || curve.has(i) || curve.has((i + 1) % united.length)) return null;
        const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
        if (su * u.y * out.x - su * u.x * out.y < 0.98) return null;
        return { i, L, off: Math.abs((fm.x - a.x) * u.y - (fm.y - a.y) * u.x) };
      })
      .filter((c): c is { i: number; L: number; off: number } => !!c)
      .sort((p, q) => Math.round(p.off) - Math.round(q.off) || q.L - p.L)[0];
    frontU = pick ? pick.i : levelFront(united);
  }
  const fin = stageFromArea(
    united.map((q) => toRoom(anchor, q)),
    frontU,
  );
  const frame = { position: fin.position, rotation: fin.rotation, mirrored: false };
  const inFin = (p: StagePlacement, q: Point) => toStageFrame(frame, toRoom(p, q));
  const outline = fin.outline;
  // stageFromArea keeps the corners in order for anything but a rectangle, so the union's smooth
  // corners are still the same corners.
  const smooth = general?.smooth.length && outline.length === general.outline.length ? general.smooth : undefined;
  const sidesNow = stageSides({ outline, front: fin.front, decks: [], ...(smooth ? { smooth } : {}) });

  const levels = parts.flatMap((p) =>
    (p.stage.levels ?? []).map((l) => ({
      ...l,
      outline: l.outline.map((q) => {
        const r = inFin(p, q);
        return { x: Math.round(r.x), y: Math.round(r.y) };
      }),
    })),
  );
  // Every base item by the stretch of its SIDE it covered — along a curve as along a straight edge —
  // onto the side of the merged outline its middle stands on. A middle that is on no side any more
  // is on a seam: the item goes, and the caller finishes what is left bare.
  const items: StageStair[] = [];
  for (const p of parts)
    for (const it of p.stage.stairs ?? []) {
      if (it.level) {
        items.push(it); // a level's outline kept its corners, so its edge numbers still hold
        continue;
      }
      const side = stageSide(p.stage, undefined, it.edge);
      const sp = itemSpan(p.stage, it);
      if (!side || !sp) continue;
      const at = (s: number) => inFin(p, sideFrame(side, s).p);
      const M = at((sp.from + sp.to) / 2);
      const hit = sidesNow
        .map((ns) => ({ ns, ...alongSide(ns, M) }))
        .filter((x) => x.d <= 5)
        .sort((x, y) => x.d - y.d)[0];
      if (!hit) continue;
      const L = hit.ns.L || 1;
      let f: number;
      let t: number;
      if (hit.ns.closed) {
        // All the way round there are no ends to clamp to: the same width, about the same middle.
        f = hit.s - (sp.to - sp.from) / 2;
        t = hit.s + (sp.to - sp.from) / 2;
      } else {
        const a = alongSide(hit.ns, at(sp.from)).s;
        const b = alongSide(hit.ns, at(sp.to)).s;
        f = Math.min(a, b);
        t = Math.max(a, b);
      }
      if (t - f < 1) continue;
      const { full: _f, ...rest } = it;
      items.push({ ...rest, edge: hit.ns.edge, t: ((((f + t) / 2) % L) + L) % L / L, widthMm: Math.round(t - f) });
    }
  // Whole pieces carried into the merged frame: a piece of a flipped part is flipped once more, and
  // turns the other way inside it.
  const pieces: StagePiece[] = parts.flatMap((p) =>
    (p.stage.pieces ?? []).map((pc) => {
      const c = inFin(p, pc.centre);
      const flipped = !!pc.mirrored !== !!p.mirrored;
      return {
        variantId: pc.variantId,
        centre: { x: Math.round(c.x), y: Math.round(c.y) },
        rotation: norm360((p.rotation || 0) - fin.rotation + (p.mirrored ? -(pc.rotation || 0) : pc.rotation || 0)),
        ...(flipped ? { mirrored: true } : {}),
      };
    }),
  );
  // A rounded or bowed rectangle merged with anything is not that rectangle any more: its shape
  // fields go, and the merged outline is laid as the curve it is.
  const { roundedMm: _rounded, roundedAt: _roundedAt, bowMm: _bow, ...anchorStage } = anchor.stage;
  const stage: StageBuild = {
    ...anchorStage,
    outline,
    front: fin.front,
    decks: [...new Set(parts.flatMap((p) => p.stage.decks))],
    levels: levels.length ? levels : undefined,
    // A curve that ran into the merge still runs through the same corners of the merged outline.
    smooth,
    pieces: pieces.length ? pieces : undefined,
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

// ── Grouping stages: touching → one stage, apart → a group ─────────────────────────────────────
//
// Ctrl+G over a selection made only of stages does not make a group of them when they stand against
// each other: a grouped stage is still N stages — N skirts, stairs on the seams, N builds — where the
// designer pushed them together to make ONE platform. So the ones that touch are merged (mergeStages:
// one outline, one skirt round the outside, nothing on the seam), and only what is still apart after
// that is grouped. "Touching" is decided here, with the same distance the rest of this file calls
// "against" (WALL_HUG_MM): a side that close to another stage already gets no stairs and no skirt,
// so the app has already treated the two as one platform — grouping makes it so. The gap between them
// is closed (stickBoxes) before they merge, as "איחוד" does.

/** Stages this close to each other are standing against each other, and share at least this much
 *  of a side — two stages meeting only at a corner are not one platform. */
export const STAGE_TOUCH_MM = WALL_HUG_MM;

/** A merged cluster: the largest keeps its id, place, front and settings as the anchor. */
export interface StageMerge {
  anchor: StagePlacement;
  others: StagePlacement[];
  stage: StageBuild;
  position: Point;
  rotation: number;
}

/** A stage of square corners only — a rectangle, an L, a T — whose sides run along its own frame's
 *  axes. Two of them square to each other merge on the exact grid (unionOutline), and are pushed
 *  together by their boxes (stickBoxes). */
const squareStage = (p: StagePlacement): boolean =>
  !p.stage.smooth?.length &&
  p.stage.outline.every((a, i) => {
    const b = p.stage.outline[(i + 1) % p.stage.outline.length];
    return Math.abs(a.x - b.x) <= 2 || Math.abs(a.y - b.y) <= 2;
  });
/** …and two stages turned a whole number of quarter turns from each other. */
const squareTo = (a: StagePlacement, b: StagePlacement): boolean => {
  const d = ((((a.rotation || 0) - (b.rotation || 0)) % 90) + 90) % 90;
  return Math.min(d, 90 - d) < 0.5;
};

/** The shortest move that puts `b` against `a` — from b's point nearest a to a's point nearest b —
 *  and how long it is. Read off corners against sides, both ways round. */
function closestApproach(a: readonly Point[], b: readonly Point[]): { d: number; move: Point } {
  let best = { d: Infinity, move: { x: 0, y: 0 } };
  const nearestOn = (q: Point, poly: readonly Point[]) => {
    let out = { d: Infinity, p: q };
    for (let i = 0; i < poly.length; i++) {
      const [s, e] = edgeOf(poly, i);
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - s.x) * dx + (q.y - s.y) * dy) / l2));
      const p = { x: s.x + t * dx, y: s.y + t * dy };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < out.d) out = { d, p };
    }
    return out;
  };
  for (const q of b) {
    const n = nearestOn(q, a);
    if (n.d < best.d) best = { d: n.d, move: { x: n.p.x - q.x, y: n.p.y - q.y } };
  }
  for (const q of a) {
    const n = nearestOn(q, b);
    if (n.d < best.d) best = { d: n.d, move: { x: q.x - n.p.x, y: q.y - n.p.y } };
  }
  return best;
}

/** How much of `b`'s rim lies on `a`'s (within a few millimetres) — the length of side two stages
 *  share once they stand against each other. Sampled every 20mm. */
function sharedRimMm(a: readonly Point[], b: readonly Point[]): number {
  let shared = 0;
  for (let i = 0; i < b.length; i++) {
    const [s, e] = edgeOf(b, i);
    const L = len(s, e);
    const steps = Math.max(1, Math.ceil(L / 20));
    for (let k = 0; k < steps; k++) {
      const f = (k + 0.5) / steps;
      const q = { x: s.x + (e.x - s.x) * f, y: s.y + (e.y - s.y) * f };
      if (onBoundary(q, a, 3)) shared += L / steps;
    }
  }
  return shared;
}

/** Two stages standing against each other. Square ones square to each other: their boxes within
 *  `tolMm` in the first one's frame, overlapping along the side they meet on by STAGE_TOUCH_MM at
 *  least. Any other pair (a curve, an angle): they overlap, or — pushed the last few centimetres
 *  together — share at least STAGE_TOUCH_MM of rim. A disc against a straight side touches it along
 *  one chord, which is not a side two stages share. */
function stagesTouch(a: StagePlacement, b: StagePlacement, tolMm: number): boolean {
  if (!squareStage(a) || !squareStage(b)) {
    const A = stageOutlineInRoom(a);
    const B = stageOutlineInRoom(b);
    if (polygonsOverlap(A, B)) return true;
    const gap = closestApproach(A, B);
    if (gap.d > tolMm) return false;
    return sharedRimMm(A, B.map((q) => ({ x: q.x + gap.move.x, y: q.y + gap.move.y }))) >= STAGE_TOUCH_MM;
  }
  if (!squareTo(a, b)) return false;
  const box = (p: StagePlacement) => {
    const pts = p.stage.outline.map((q) => toStageFrame(a, toRoom(p, q)));
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };
  const A = box(a);
  const B = box(b);
  const ovX = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
  const ovY = Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY);
  return (ovX >= -tolMm && ovY >= STAGE_TOUCH_MM) || (ovY >= -tolMm && ovX >= STAGE_TOUCH_MM);
}

/** The stages in clusters of ones that stand against each other (stagesTouch, transitively) — a
 *  stage touching nothing is a cluster of one. Order is kept: a cluster is listed where its first
 *  member was. */
export function touchingStages(stages: readonly StagePlacement[], tolMm = STAGE_TOUCH_MM): StagePlacement[][] {
  const parent = stages.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < stages.length; i++)
    for (let j = i + 1; j < stages.length; j++) if (stagesTouch(stages[i], stages[j], tolMm)) parent[find(j)] = find(i);
  const out = new Map<number, StagePlacement[]>();
  stages.forEach((p, i) => {
    const r = find(i);
    out.set(r, [...(out.get(r) ?? []), p]);
  });
  return [...out.values()];
}

/** Ctrl+G over stages: every cluster of touching ones pushed flush and merged into ONE stage (its
 *  largest member the anchor — it keeps its id and its front), and the rest returned loose. A cluster
 *  that will not merge after all (an outline with a hole in it) is loose too, whole. The caller
 *  finishes each merged stage's bare edges (fillGaps) and groups whatever is left when more than one
 *  thing is. */
export function mergeTouching(stages: readonly StagePlacement[], tolMm = STAGE_TOUCH_MM): { merged: StageMerge[]; loose: StagePlacement[] } {
  const merged: StageMerge[] = [];
  const loose: StagePlacement[] = [];
  for (const cluster of touchingStages(stages, tolMm)) {
    if (cluster.length < 2) {
      loose.push(...cluster);
      continue;
    }
    const parts = pushTogether(cluster).sort((p, q) => Math.abs(signedArea(q.stage.outline)) - Math.abs(signedArea(p.stage.outline)));
    const m = mergeStages(parts);
    if (!m) loose.push(...cluster);
    else merged.push({ anchor: parts[0], others: parts.slice(1), ...m });
  }
  return { merged, loose };
}

/** Stages pushed together, ready to merge: square ones square to each other by their boxes
 *  (stickBoxes — gaps closed, edges nearly in line lined up), as "איחוד" always did; any other set
 *  one at a time onto what is already placed, largest first, each by the shortest move that puts it
 *  against them — and not at all when it already overlaps or touches them (a half-round laid over
 *  the front of a stage is where the designer put it). */
export function pushTogether(parts: readonly StagePlacement[]): StagePlacement[] {
  if (parts.length < 2) return [...parts];
  if (parts.every((p) => squareStage(p) && squareTo(parts[0], p))) {
    const moves = stickBoxes(
      parts.map((p) => {
        const xs = p.stage.outline.map((q) => q.x);
        const ys = p.stage.outline.map((q) => q.y);
        return { id: p.id, centre: p.position, rotation: p.rotation || 0, widthMm: Math.max(...xs) - Math.min(...xs), depthMm: Math.max(...ys) - Math.min(...ys) };
      }),
    );
    return parts.map((p) => (moves.has(p.id) ? { ...p, position: moves.get(p.id)! } : p));
  }
  const area = (p: StagePlacement) => Math.abs(signedArea(p.stage.outline));
  const order = [...parts].sort((p, q) => area(q) - area(p));
  const placed: StagePlacement[] = [order[0]];
  const rest = order.slice(1);
  const moved = new Map<string, StagePlacement>();
  while (rest.length) {
    const gaps = rest.map((p) => {
      const B = stageOutlineInRoom(p);
      const near = placed
        .map((o) => {
          const A = stageOutlineInRoom(o);
          return polygonsOverlap(A, B) ? { d: 0, move: { x: 0, y: 0 } } : closestApproach(A, B);
        })
        .sort((x, y) => x.d - y.d)[0];
      return { p, near };
    });
    gaps.sort((x, y) => x.near.d - y.near.d);
    const { p, near } = gaps[0];
    rest.splice(rest.indexOf(p), 1);
    const at = near.d > 0.5 ? { ...p, position: { x: Math.round(p.position.x + near.move.x), y: Math.round(p.position.y + near.move.y) } } : p;
    if (at !== p) moved.set(p.id, at);
    placed.push(at);
  }
  return parts.map((p) => moved.get(p.id) ?? p);
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
  // Its walking line: from the floor at its far side up to the edge, the arrowhead at the edge,
  // standing in from both ends — the catalog's own flight is drawn with the same one.
  const walkUp = shape.climb!;
  assert(walkUp.arrow.from.x > shape.foot.x - 1 - 150 && walkUp.arrow.from.x < shape.foot.x && Math.abs(walkUp.arrow.from.y - shape.foot.y) < 1, "a flight's walking line starts at its foot on the floor, just in from the end");
  assert(walkUp.arrow.head[0].x > shape.base.x && walkUp.arrow.head[0].x < walkUp.arrow.from.x && Math.abs(walkUp.arrow.head[0].x - shape.base.x - Math.min(840 * 0.12, 150)) < 1, "…and its arrowhead points at the deck, just out from the edge");
  assert(walkUp.arrow.head.length === 3 && walkUp.arrow.dotR > 0 && !walkUp.slope, "…a filled head, a dot at the foot, and no slope on stairs");
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
  assert(bench.heightMm === BENCH_TOP_MM && bench.sofaSeats === 0 && bench.cushions.length === 0, "…its top at table height above the deck, and no sofa");
  // Two sides, each its own: a sofa on the room side of the front banquette (edge 0, along the top,
  // y = -2000) is sat on facing the room — cushions on the outer half of the strip, backrest toward
  // the stage — while the chairs stay on the stage behind it. Seats add up; only chairs are chairs.
  const twoSided = edgeItemShape(down.stage, { ...benches[0], bench: { back: { kind: "chairs", seats: 6 }, front: { kind: "sofa", seats: 4 } } }, deckOf)!;
  assert(twoSided.seats === 10 && twoSided.chairs.length === 6 && twoSided.sofaSeats === 4, "a banquette with chairs behind and a sofa in front seats both, and packs only the chairs");
  assert(twoSided.cushions.length === 4 && twoSided.cushions.every((q) => q.every((p) => p.y <= -2000 - BENCH_DEPTH_MM / 2 + 1e-6)), "…the cushions on the room half of the strip");
  assert(twoSided.backs.length === 1 && twoSided.backs[0].every((p) => Math.abs(p.y - (-2000 - BENCH_DEPTH_MM / 2)) <= 80 + 1e-6), "…with the backrest toward the strip's stage half");
  assert(twoSided.sofaHeightMm === SOFA_SEAT_MM && twoSided.bench?.front.kind === "sofa", "…a sofa seat at 46cm, and the layout says which side is which");
  const frontChairs = edgeItemShape(down.stage, { ...benches[0], bench: { back: { kind: "none" }, front: { kind: "chairs", seats: 3 } } }, deckOf)!;
  assert(frontChairs.chairs.length === 3 && frontChairs.chairs.every((c) => c.y < -2000 - BENCH_DEPTH_MM && Math.abs(Math.abs(c.facingDeg) - 90) < 1), "chairs on the room side stand in the room, facing the banquette");
  // The legacy form still reads: an old item's `seats` is its stage side's count, nothing in front.
  const legacyItem = edgeItemShape(down.stage, { ...benches[0], seats: 5, heightMm: 600 }, deckOf)!;
  assert(legacyItem.chairs.length === 5 && legacyItem.sofaSeats === 0 && legacyItem.heightMm === 600, "an edge item from before sides existed is unchanged: its seats are its back side's");
  assert(edgeItemShape(down.stage, { ...benches[0], seats: 5, bench: { back: { kind: "sofa" } } }, deckOf)!.chairs.length === 0, "…and the new form wins where it speaks");
  const rail = edgeItemShape(down.stage, { ...benches[0], kind: "barrier" }, deckOf)!;
  const inward = rail.polygon.every((q) => Math.abs(q.x) <= 3001 && Math.abs(q.y) <= 2001);
  assert(inward, "a barrier stands on the stage, inside its edge");
  const clickedGap = itemAt({ ...down, stage: { ...down.stage, stairs: [{ id: "x", edge: 0, t: 0.25, widthMm: 2000 }] } }, deckOf, "bench", undefined, 0, 0.8, "y", wallBehind);
  const cg = itemSpan(down.stage, clickedGap)!;
  assert(Math.round(cg.from) === 2500 && Math.round(cg.to) === 6000, "a click in a bare stretch covers the whole stretch");
  const barred = { ...down, stage: { ...down.stage, heightMm: 900, stairs: [{ id: "b", kind: "barrier" as const, edge: 1, t: 0.5, widthMm: 0, full: true }] } };
  assert(railingRuns(barred, deckOf, 800, wallBehind).length === 1, "a side with a barrier needs no railing; the other still does");
  assert(skirtMm(barred, deckOf, wallBehind) === 14000, "…and a barrier stands on the stage, so the skirt still hangs below it");

  // ── One side, shared: items divide it, never stand through each other.
  const frontFull: StageStair = { id: "ff", edge: 0, t: 0.5, widthMm: 0, full: true };
  const benchMid: StageStair = { id: "bm", kind: "bench", edge: 0, t: 0.5, widthMm: 2000 };
  const shared = shareSide({ ...down.stage, stairs: [frontFull, benchMid] }, "bm");
  assert(shared.length === 3 && shared.filter((it) => edgeKind(it) === "stairs").length === 2, "a banquette clicked onto a full flight splits it in two");
  const [halfA, halfB] = shared.filter((it) => edgeKind(it) === "stairs").map((it) => itemSpan(down.stage, it)!).sort((a, b) => a.from - b.from);
  assert(Math.round(halfA.from) === 0 && Math.round(halfA.to) === 2000 && Math.round(halfB.from) === 4000 && Math.round(halfB.to) === 6000, "…each half running from its corner to the banquette");
  assert(shared.some((it) => it.id === "ff") && shared.every((it) => !it.full), "…the first half keeping the flight's id, neither still the whole side");
  assert(edgeGaps({ ...down, stage: { ...down.stage, stairs: shared } }, deckOf, wallBehind).filter((g) => g.edge === 0).length === 0, "…and the side is still covered end to end");
  const benchEnd: StageStair = { id: "be", kind: "bench", edge: 0, t: 0.9, widthMm: 2000 };
  const cutBack = shareSide({ ...down.stage, stairs: [frontFull, benchEnd] }, "be");
  assert(cutBack.length === 2 && Math.round(itemSpan(down.stage, cutBack.find((it) => it.id === "ff")!)!.to) === 4000, "a banquette at the end cuts the flight back to meet it");
  const swallowed = shareSide({ ...down.stage, stairs: [{ id: "sm", edge: 0, t: 0.5, widthMm: 1000 }, { id: "big", kind: "bench", edge: 0, t: 0.5, widthMm: 3000 }] }, "big");
  assert(swallowed.length === 1 && swallowed[0].id === "big", "an item wholly under the kept one is gone");
  const sliver = shareSide({ ...down.stage, stairs: [frontFull, { id: "almost", kind: "bench", edge: 0, t: 0.5, widthMm: 5600 }] }, "almost");
  assert(sliver.length === 1, "…and so is a sliver too short to be anything");
  const otherSide = shareSide({ ...down.stage, stairs: [{ id: "s1", edge: 1, t: 0.5, widthMm: 0, full: true }, benchMid] }, "bm");
  assert(otherSide.length === 2 && otherSide[0].full === true, "an item on another side is untouched");
  const between = freeStretch({ ...down.stage, stairs: [benchMid, { id: "l", edge: 0, t: 0.1, widthMm: 1000 }, { id: "r", edge: 0, t: 0.95, widthMm: 600 }] }, benchMid)!;
  assert(Math.round(between.from) === 1100 && Math.round(between.to) === 5400, "the free stretch runs from the item before to the item after");
  assert(freeStretch({ ...down.stage, stairs: [benchMid] }, benchMid)!.from === 0 && freeStretch({ ...down.stage, stairs: [benchMid] }, benchMid)!.to === 6000, "…and corner to corner with nothing else there");
  const tidied = tidyEdgeItems({ ...down.stage, stairs: [frontFull, benchMid] });
  assert(tidied.length === 3 && tidied.some((it) => it.id === "bm") && tidied.filter((it) => edgeKind(it) === "stairs").every((it) => !it.full), "tidying divides a side two kinds were standing through — the narrower keeps its stretch, the flight parts round it");

  // ── Ramps, backdrops, corners, area.
  const ramp = edgeItemShape({ ...down.stage, heightMm: 600 }, { id: "r", kind: "ramp", edge: 1, t: 0.5, widthMm: 1200 }, deckOf)!;
  assert(ramp.depthMm === 7200, "a ramp onto a 60cm stage runs 7.2m — one in twelve");
  assert(ramp.treads.length === 0 && ramp.climb?.slope?.text === "1:12" && !ramp.climb.slope.tooSteep, "…drawn with no step edges and its slope written on it");
  assert(ramp.climb!.arrow.from.x > ramp.climb!.arrow.head[0].x && Math.abs(ramp.climb!.arrow.head[0].x - ramp.base.x - 150) < 1 && Math.abs(ramp.climb!.slope!.at.x - (ramp.base.x + 3600)) < 1, "…its walking line up to the edge, the slope at its middle");
  assert(Math.abs(((ramp.climb!.slope!.angleDeg % 360) + 360) % 360 - 180) < 1, "…running with the line (toward −x, onto the right-hand side)");
  assert(!edgeItemShape(down.stage, { id: "b", kind: "bench", edge: 1, t: 0.5, widthMm: 2000 }, deckOf)!.climb && !edgeItemShape(down.stage, { id: "br", kind: "barrier", edge: 1, t: 0.5, widthMm: 2000 }, deckOf)!.climb, "a banquette and a barrier climb nothing");
  const rampInRoom = edgeItemInRoom({ ...down, rotation: 90 }, ramp);
  const turnOf = (deg: number) => ((deg % 360) + 360) % 360;
  assert(turnOf(rampInRoom.climb!.slope!.angleDeg - ramp.climb!.slope!.angleDeg - 90) < 1e-6 && Math.abs(Math.hypot(rampInRoom.climb!.arrow.head[0].x - rampInRoom.base.x, rampInRoom.climb!.arrow.head[0].y - rampInRoom.base.y) - 150) < 1, "carried into the room, the walking line and the slope turn with the stage");
  const rampMirrored = edgeItemInRoom({ ...down, rotation: 0, mirrored: true }, ramp);
  assert(turnOf(rampMirrored.climb!.slope!.angleDeg) < 1e-6 && rampMirrored.climb!.arrow.from.x < rampMirrored.climb!.arrow.head[0].x, "…and a flipped stage's ramp climbs the other way, its slope read off the flipped line");
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
  assert(
    Math.abs(Math.hypot(sunkShape.climb!.arrow.from.x - sunkShape.base.x, sunkShape.climb!.arrow.from.y - sunkShape.base.y) - Math.min(sunkShape.depthMm * 0.12, 150)) < 1 &&
      Math.hypot(sunkShape.climb!.arrow.head[0].x - sunkShape.foot.x, sunkShape.climb!.arrow.head[0].y - sunkShape.foot.y) < Math.hypot(sunkShape.climb!.arrow.from.x - sunkShape.foot.x, sunkShape.climb!.arrow.from.y - sunkShape.foot.y),
    "a recessed flight is climbed the other way: from the floor at the edge up onto the deck inside",
  );
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
  assert(bi.heightMm === BENCH_TOP_MM, "…its top at table height above the deck its chairs stand on");
  const biSofa = edgeItemShape(tall.stage, { ...benchIn, bench: { back: { kind: "sofa" }, front: { kind: "chairs", seats: 2 } } }, deckOf)!;
  assert(biSofa.cushions.every((q) => q.every((p) => p.x <= 3000 - BENCH_DEPTH_MM / 2 + 1e-6 && p.x >= 3000 - BENCH_DEPTH_MM - 1)), "an inner banquette's sofa side is on the inner half of its strip");
  assert(biSofa.chairs.length === 2 && biSofa.chairs.every((c) => c.x > 3000 && Math.abs(Math.abs(c.facingDeg) - 180) < 1), "…and chairs on its room side stand off the stage, facing it");
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
  assert(ring.length === 1 && !ring[0].full && ring[0].widthMm === STAIR_WIDTH_MM && edgeKind(ring[0]) === "stairs", "a free-standing round stage gets ONE flight — not stairs all the way round");
  const ringShape = edgeItemShape(disc.stage, ring[0], deckOf)!;
  const rOf = (q: Point) => Math.hypot(q.x, q.y);
  assert(ringShape.base.y > 1900 && Math.abs(ringShape.base.x) < 300, "…at its back, opposite the front");
  assert(ringShape.polygon.length > 4 && ringShape.polygon.every((q) => rOf(q) >= 2000 - 5 && rOf(q) <= 2000 + 840 + 5), "…following the curve, 84cm deep outside the rim");
  const withRing = { ...disc, stage: { ...disc.stage, stairs: ring } };
  assert(edgeGaps(withRing, deckOf).length === 0 && Math.abs(skirtMm(withRing, deckOf) - (rim[0].L - STAIR_WIDTH_MM)) < 1, "…the rest of the rim skirted, and not reported bare");
  assert(edgeGaps(disc, deckOf).length === 0 && edgeGaps(disc, deckOf, undefined, { rims: true }).length === 1, "a bare round rim is normal — not an open edge — unless asked about outright");
  const allRound = fillGaps(withRing, deckOf, "stairs", nid, undefined, { rims: true });
  assert(allRound.length === 1 && Math.abs(allRound[0].widthMm - (rim[0].L - STAIR_WIDTH_MM)) <= 1, "…and 'finish the edges' can still run stairs round the rest of it, as one flight across the seam");
  assert(edgeGaps({ ...disc, stage: { ...disc.stage, stairs: [...ring, ...allRound] } }, deckOf, undefined, { rims: true }).length === 0, "…which leaves nothing of the rim bare");
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
  assert(flight.edge === 0 && !!itemSpan(benchDisc.stage, flight) && flight.widthMm === STAIR_WIDTH_MM, "a flight clicked on one chord of the rim is placed on the rim, a standard flight wide — never the whole bare half of a round stage");
  const both = { ...disc, stage: { ...disc.stage, stairs: [halfBench, flight] } };
  assert(edgeGaps(both, deckOf).length === 0 && edgeGaps(both, deckOf, undefined, { rims: true }).length > 0, "…the rest of the rim skirted: bare only when asked about outright");
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
  assert(nearWall.length === 1 && edgeKind(nearWall[0]) === "stairs" && !nearWall[0].inner, "a round stage near a wall still gets its one flight, where there is floor — and no barrier round the rest");
  assert(edgeItemShape(disc.stage, nearWall[0], deckOf)!.base.y > 0, "…away from the wall");
  assert(edgeGaps({ ...disc, stage: { ...disc.stage, stairs: nearWall } }, deckOf, wallAbove).length === 0, "…and no stretch of its rim is reported bare");
  const fullRim: StageStair = { id: "fr", edge: 0, t: 0.5, widthMm: 0, full: true };
  const asked = settleEdgeItems(disc, [fullRim], deckOf, nid, wallAbove, { inner: true, otherwise: "keep" });
  assert(asked.some((it) => it.inner) && asked.some((it) => !it.inner), "…and stairs asked for all the way round go inner where the wall is and outer elsewhere");
  assert(rehomeEdgeItems(withRing, { ...withRing }, nid).length === 1, "the fill tool reopened on a round stage keeps its items where they stand");

  // A round PIECE the studio owns becomes a round stage built of itself.
  const roundDeck: DeckType = { id: "disc4", widthMm: 4000, depthMm: 4000, heightMm: 400, round: true };
  const deckOf2: DeckLookup = (id) => (id === "disc4" ? roundDeck : decks[id]);
  const piece = stageFromPiece({ id: "rp", variantId: "disc4", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 5000, y: 5000 } }, { widthMm: 4000, depthMm: 4000 }, { decks: ["big"], heightMm: 400, deckOf: deckOf2, newId: nid, withEdges: true, round: true });
  assert(piece.stage.smooth?.length === piece.stage.outline.length, "a round piece becomes a stage with a curved rim");
  const pieceDecks = layStage(piece.stage, deckOf2).decks;
  assert(pieceDecks.length === 1 && pieceDecks[0].typeId === "disc4" && pieceDecks[0].round === true, "…standing on the one round piece it is");
  assert(stageHeight(piece.stage, deckOf2) === 400 && piece.stage.stairs?.length === 1 && edgeKind(piece.stage.stairs[0]) === "stairs" && !piece.stage.stairs[0].full, "…at its height, with one flight at its back");
  assert(!stairFits(piece, { id: "x", edge: 0, t: 0.5, widthMm: 1000, inner: true }, deckOf2).ok, "…and nothing can be sunk into one solid piece");

  // ── Ctrl+G over stages: touching → one stage, apart → a group (mergeTouching).
  // Two 244×122 sheets laid flush side by side, each finished with stairs all round.
  const sheet: DeckType = { id: "sheet", widthMm: 2440, depthMm: 1220, heightMm: 400 };
  const deckOf3: DeckLookup = (id) => (id === "sheet" ? sheet : decks[id]);
  const laySheet = (id: string, x: number, y: number) =>
    stageFromPiece({ id, variantId: "sheet", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x, y } }, { widthMm: 2440, depthMm: 1220 }, { decks: ["sheet"], heightMm: 400, deckOf: deckOf3, newId: nid, withEdges: true });
  const s1 = laySheet("s1", 1220, 610);
  const s2 = laySheet("s2", 3660, 610);
  assert(s1.stage.stairs?.length === 4 && s2.stage.stairs?.length === 4, "(each sheet starts with stairs on all four sides)");
  const pair = mergeTouching([s1, s2]);
  assert(pair.merged.length === 1 && pair.loose.length === 0, "two flush sheets grouped are ONE merged stage, nothing loose");
  const one = pair.merged[0];
  assert(one.anchor.id === "s1" && one.others.length === 1 && one.others[0].id === "s2", "…the first of two equals its anchor, the other folded in");
  const oneAt: StagePlacement = { ...one.anchor, stage: one.stage, position: one.position, rotation: one.rotation, mirrored: false };
  assert(stageRect(one.stage)?.widthMm === 4880 && stageRect(one.stage)?.depthMm === 1220, "…a 4.88×1.22 rectangle");
  assert(layStage(one.stage, deckOf3).decks.length === 2, "…built of the two sheets");
  assert(one.stage.stairs?.length === 4 && one.stage.stairs.every((it) => it.full), "…with one full run of stairs on each of its four sides — none on the seam");
  assert(edgeGaps(oneAt, deckOf3).length === 0 && skirtMm(oneAt, deckOf3) === 0, "…nothing bare, and nothing to skirt");
  // Three sheets, two of them touching: one merged stage and one loose — to be grouped by the caller.
  const s3 = laySheet("s3", 9000, 610);
  const trio = mergeTouching([s1, s2, s3]);
  assert(trio.merged.length === 1 && trio.loose.length === 1 && trio.loose[0].id === "s3", "three sheets where two touch: one merged, one loose");
  assert(touchingStages([s1, s2, s3]).length === 2, "…two clusters");
  // A round stage touching nothing — and one pushed against a sheet — is never merged.
  assert(mergeTouching([piece]).merged.length === 0 && mergeTouching([piece]).loose.length === 1, "a round stage alone is left as it is");
  const discBeside = { ...piece, position: { x: 1220, y: 1220 + 2000 } };
  const withDisc = mergeTouching([s1, discBeside]);
  assert(withDisc.merged.length === 0 && withDisc.loose.length === 2, "…and a round stage against a sheet is not merged into it (its rim is no side)");
  // A gap within STAGE_TOUCH_MM is closed and merged; a wider one stays apart. A corner is not a side.
  const near = mergeTouching([s1, laySheet("s4", 3660 + 200, 610)]);
  assert(near.merged.length === 1 && stageRect(near.merged[0].stage)?.widthMm === 4880, "a sheet 20cm off is pushed flush and merged");
  assert(mergeTouching([s1, laySheet("s5", 3660 + STAGE_TOUCH_MM + 100, 610)]).merged.length === 0, "…one 40cm off is left apart");
  assert(mergeTouching([s1, laySheet("s6", 3660, 610 + 1220)]).merged.length === 0, "…and one meeting it only at a corner too");
  assert(mergeTouching([s1, { ...s2, rotation: 30 }]).merged.length === 0, "…and one at 30° to it");
  assert(touchingStages([s1, s2, s3]).flat().length === 3, "every stage is in exactly one cluster");

  // ── A piece of ANY shape: a half-round platform the studio owns (D244 — 2.44 across, 1.22 deep).
  const halfProduct = {
    id: "hp",
    name: "במה חצי עיגול",
    category: "stages",
    layer: "floor",
    dimensions: { diameterMm: 2440, heightMm: 400 },
    categoryFields: {},
    styleTags: [],
    variants: [],
    appearance: { shape: "half-circle", content: "none" },
  } as unknown as Product;
  assert(isShapedPiece(halfProduct) && !isRoundPiece(halfProduct), "a half-round is a shaped piece, not a round one");
  const halfShape = pieceOutline(halfProduct)!;
  const hxs = halfShape.outline.map((q) => q.x);
  const hys = halfShape.outline.map((q) => q.y);
  assert(Math.max(...hxs) - Math.min(...hxs) === 2440 && Math.max(...hys) - Math.min(...hys) === 1220, "its outline is its 2.44×1.22 box");
  assert(halfShape.smooth.length === halfShape.outline.length - 2, "…every corner along its arc smooth, the two ends of its chord real corners");
  const halfDeck = deckTypeOf("half", halfProduct);
  assert(!!halfDeck.outline && !halfDeck.round, "as a deck it carries its outline, never laid by the fill");
  const deckOf4: DeckLookup = (id) => (id === "half" ? halfDeck : id === "sheet" ? sheet : decks[id]);
  // Dropped with its chord against the wall at the top of the room.
  const wallUp: WallDistance = (q) => Math.abs(q.y);
  const halfStage = stageFromPiece(
    { id: "h", variantId: "half", layer: "floor", quantity: 1, scale: 1, rotation: 180, position: { x: 3000, y: 610 } },
    { widthMm: 2440, depthMm: 1220 },
    { decks: ["sheet"], heightMm: 400, deckOf: deckOf4, newId: nid, withEdges: true, wallDistance: wallUp, shape: halfShape, whole: true },
  );
  const hRoom = stageOutlineInRoom(halfStage);
  assert(Math.abs(Math.min(...hRoom.map((q) => q.y))) <= 1 && Math.abs(Math.max(...hRoom.map((q) => q.y)) - 1220) <= 1, "it becomes a stage standing where the piece stood");
  const hSides = stageSides(halfStage.stage);
  assert(hSides.length === 2 && hSides.filter((s) => s.curved).length === 1, "…with two sides: its chord, and its arc as ONE curved side");
  const hLaid = layStage(halfStage.stage, deckOf4);
  assert(hLaid.decks.length === 1 && hLaid.decks[0].typeId === "half" && !!hLaid.decks[0].outline && hLaid.coverage > 0.99, "…built of the one piece it is, whole");
  assert(stageIsOnePiece(halfStage.stage, deckOf4), "…which nothing can be cut into");
  const hItems = halfStage.stage.stairs ?? [];
  assert(hItems.length > 0 && hItems.every((it) => hSides.find((s) => s.curved)!.edge === stageSide(halfStage.stage, undefined, it.edge)?.edge), "its chord against the wall takes nothing; its arc is finished");
  const arcStairs = hItems.filter((it) => edgeKind(it) === "stairs");
  assert(arcStairs.length > 0 && arcStairs.every((it) => edgeItemShape(halfStage.stage, it, deckOf4)!.polygon.length > 4), "…with stairs that follow the curve");
  assert(edgeGaps(halfStage, deckOf4, wallUp).length === 0, "…and nothing left bare");

  // A half-round APRON against the middle of a stage's front: Ctrl+G makes them ONE stage.
  const front = stageFromArea(rect(0, 0, 4880, 2440), 2);
  const main: StagePlacement = { id: "main", variantId: "sheet", layer: "floor", quantity: 1, scale: 1, position: front.position, rotation: front.rotation, stage: { outline: front.outline, front: front.front, decks: ["sheet"], heightMm: 400 } };
  main.stage.stairs = defaultEdgeItems(main, deckOf4, nid, wallUp);
  const apron = stageFromPiece(
    { id: "ap", variantId: "half", layer: "floor", quantity: 1, scale: 1, rotation: 180, position: { x: 2440, y: 2440 + 610 } },
    { widthMm: 2440, depthMm: 1220 },
    { decks: ["sheet"], heightMm: 400, deckOf: deckOf4, newId: nid, withEdges: true, wallDistance: wallUp, shape: halfShape, whole: true },
  );
  assert(touchingStages([main, apron]).length === 1, "a half-round flush against a stage's front touches it — a curve no longer keeps it apart");
  const joined = mergeTouching([main, apron]);
  assert(joined.merged.length === 1 && joined.loose.length === 0 && joined.merged[0].anchor.id === "main", "…and merges into it, the bigger stage the anchor");
  const jm = joined.merged[0];
  const jAt: StagePlacement = { ...main, stage: jm.stage, position: jm.position, rotation: jm.rotation, mirrored: false };
  const jSides = stageSides(jm.stage);
  assert(jSides.length === 6 && jSides.filter((s) => s.curved).length === 1, "…one outline: its four sides, the front either side of the apron, and the apron's arc as one curved side");
  assert(Math.abs(stageAreaMm2(jm.stage) - (4880 * 2440 + (Math.PI * 1220 * 1220) / 2)) < 0.01 * 4880 * 2440, "…covering both");
  const jLaid = layStage(jm.stage, deckOf4);
  assert(jLaid.decks.filter((d) => d.typeId === "half").length === 1 && jLaid.decks.filter((d) => d.typeId === "sheet").length === 4, "…built of the half-round piece, whole, and four sheets behind it");
  const fFront = toRoom(jAt, jm.stage.outline[jm.stage.front]);
  const fNext = toRoom(jAt, jm.stage.outline[(jm.stage.front + 1) % jm.stage.outline.length]);
  assert(Math.abs(fFront.y - 2440) < 2 && Math.abs(fNext.y - 2440) < 2, "…still facing the room along the line of its old front");
  assert(
    (jm.stage.stairs ?? []).some((it) => stageSide(jm.stage, undefined, it.edge)?.curved),
    "the apron's stairs are carried onto the merged arc",
  );
  const jFilled: StagePlacement = { ...jAt, stage: { ...jm.stage, stairs: [...(jm.stage.stairs ?? []), ...fillGaps(jAt, deckOf4, "stairs", nid, wallUp)] } };
  assert(edgeGaps(jFilled, deckOf4, wallUp).length === 0, "…and, its bare stretches filled, nothing is left open");
  assert(
    (jFilled.stage.stairs ?? []).filter((it) => stageSide(jm.stage, undefined, it.edge)?.curved).every((it) => edgeItemShape(jm.stage, it, deckOf4)!.polygon.length > 4),
    "…the stairs round the apron following its curve",
  );
  // Pulled 15cm off the front, it is pushed back against it and merged all the same.
  const apart = { ...apron, position: { x: apron.position.x, y: apron.position.y + 150 } };
  const pushedBack = mergeTouching([main, apart]);
  assert(pushedBack.merged.length === 1 && Math.abs(stageAreaMm2(pushedBack.merged[0].stage) - stageAreaMm2(jm.stage)) < 0.002 * stageAreaMm2(jm.stage), "a half-round 15cm off is pushed flush and merged");
  // A disc laid OVER a stage's corner overlaps it: one stage too, the disc's rim outside it a curve.
  const discAt: StagePlacement = { ...piece, id: "dc", position: { x: 4880, y: 2440 } };
  const over = mergeTouching([main, discAt]);
  assert(over.merged.length === 1, "a disc overlapping a stage's corner merges with it");
  assert(stageSides(over.merged[0].stage).some((s) => s.curved && !s.closed), "…the part of its rim outside the stage one curved side");

  // ── DRAWN round: the area tool's half-round along a wall is a stage like the piece is.
  const drawnHalf = halfRoundArea({ x: 1000, y: 0 }, { x: 5000, y: 0 }, 1);
  const dhFront = drawnHalf.outline.reduce((best, a, i) => {
    const b = drawnHalf.outline[(i + 1) % drawnHalf.outline.length];
    const d = wallUp({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    return d > best.d + 1 ? { i, d } : best;
  }, { i: 0, d: -Infinity }).i;
  const dhAt = stageFromArea(drawnHalf.outline, dhFront);
  const dh: StagePlacement = { id: "dh", variantId: "sheet", layer: "floor", quantity: 1, scale: 1, position: dhAt.position, rotation: dhAt.rotation, stage: { outline: dhAt.outline, front: dhAt.front, decks: ["sheet"], smooth: drawnHalf.smooth, heightMm: 400 } };
  const dhSides = stageSides(dh.stage);
  assert(dhSides.length === 2 && dhSides.some((s) => s.curved && Math.abs(s.L - Math.PI * 2000) < 30), "a half-round drawn on the plan is its chord and its arc");
  const dhLaid = layStage(dh.stage, deckOf4);
  assert(
    dhLaid.missing.length === 2 && dhLaid.missing.every((m) => m.info.kind === "quarter" && Math.abs((m.info.radiusMm ?? 0) - 2000) <= 20) && new Set(dhLaid.missing.map((m) => m.shape)).size === 1,
    "…built of what the studio has, and what it lacks named: one piece, a quarter-round R200, twice — not sheets stair-stepped round the curve",
  );
  dh.stage.stairs = defaultEdgeItems(dh, deckOf4, nid, wallUp);
  assert(edgeGaps(dh, deckOf4, wallUp).length === 0 && dh.stage.stairs.every((it) => stageSide(dh.stage, undefined, it.edge)?.curved), "…its arc finished, its chord against the wall left as it is");
  // Scaled whole: the same curve, bigger; its pieces gone (it is not the piece's size any more).
  const bigger = scaleStage(halfStage.stage, { widthMm: 3660, depthMm: 1830 });
  assert(bigger.smooth?.length === halfStage.stage.smooth?.length && !bigger.pieces, "a half-round scaled is the same curve, built of decks");
  assert(Math.abs(stageSides(bigger).find((s) => s.curved)!.L - Math.PI * 1830) < 30, "…its arc one and a half times as long");
  // Pieces carried to a new frame stay where they stand in the room.
  const turnedFrame = { position: { x: 100, y: 200 }, rotation: 90, mirrored: false };
  const carriedPc = carryPieces(jm.stage.pieces, jAt, turnedFrame)!;
  const before = toRoom(jAt, jm.stage.pieces![0].centre);
  const after = toRoom(turnedFrame, carriedPc[0].centre);
  assert(Math.abs(before.x - after.x) <= 1 && Math.abs(before.y - after.y) <= 1, "a piece carried to a new frame stands where it stood");
  const outlineBefore = placedPiece(jm.stage.pieces![0], halfDeck).map((q) => toRoom(jAt, q));
  const outlineAfter = placedPiece(carriedPc[0], halfDeck).map((q) => toRoom(turnedFrame, q));
  assert(outlineBefore.every((q, i) => Math.hypot(q.x - outlineAfter[i].x, q.y - outlineAfter[i].y) < 2), "…facing the way it faced");

  // ── A ROUNDED rectangle and a BOWED front — the fill tool's shapes (shapedRect), laid over the
  // rectangle they were made from.
  {
    const sh = shapedRect(6000, 4000, { roundedMm: 1000 });
    const rounded: StagePlacement = {
      id: "rr",
      variantId: "big",
      layer: "floor",
      quantity: 1,
      scale: 1,
      rotation: 0,
      position: { x: 0, y: 0 },
      stage: { outline: sh.outline, smooth: sh.smooth, front: sh.front, decks: ["big", "small"], heightMm: 600, roundedMm: 1000, roundedAt: "all" },
    };
    assert(stageRect(rounded.stage) === null && stageBox(rounded.stage).widthMm === 6000 && stageBox(rounded.stage).depthMm === 4000, "a rounded 6×4 is no plain rectangle, but its box still reads 6×4");
    const pr = plainRect(rounded.stage)!;
    assert(pr.length === 4 && pr[0].x === -3000 && pr[0].y === -2000 && pr[2].x === 3000 && pr[2].y === 2000, "…and the rectangle it was made from is its box");
    const sides = stageSides(rounded.stage);
    assert(sides.length === 8 && sides.filter((s) => s.curved).length === 4 && !sides.some((s) => s.closed), "its rim is eight sides — four straight runs and four arcs — none of them closed");
    assert(sides.find((s) => s.edges.includes(rounded.stage.front))!.curved === false, "…the front being the straight run across the top");
    const laidR = layStage(rounded.stage, deckOf);
    const deckArea = (l: StageLayout) => l.decks.reduce((s, d) => s + (d.outline ? Math.abs(signedArea(d.outline)) : d.widthMm * d.depthMm), 0);
    assert(laidR.decks.every((d) => !d.outline) && Math.abs(deckArea(laidR) - 20e6) < 1, "with no quarter-round piece, whole decks fill the rectangle less its four corner squares — none cut");
    assert(
      laidR.missing.length === 4 && laidR.missing.every((m) => m.info.kind === "quarter" && Math.abs((m.info.radiusMm ?? 0) - 1000) <= 10) && new Set(laidR.missing.map((m) => m.shape)).size === 1,
      "…and the corners are named as the ONE piece the studio lacks: a quarter-round R100, four of it",
    );
    assert(laidR.coverage < 0.9, "…which the coverage does not pretend to have");
    assert([...stageDeckCounts(rounded.stage, deckOf).values()].flat().length === laidR.decks.length, "…the quote counting only the decks there are");
    // With a quarter-round piece of the corner's radius in the catalog and among the chosen decks,
    // each corner stands on one and nothing is cut.
    const quarterProduct = {
      id: "qp",
      name: "רבע עיגול R100",
      category: "stage-decks",
      layer: "floor",
      dimensions: { diameterMm: 2000, heightMm: 600 },
      categoryFields: {},
      styleTags: [],
      variants: [],
      appearance: { shape: "quarter-circle", content: "none" },
    } as unknown as Product;
    const quarter = deckTypeOf("q100", quarterProduct);
    assert(quarter.quarterMm === 1000 && !!quarter.outline && quarter.widthMm === 1000 && quarter.depthMm === 1000, "a quarter-round product is a quarter piece of its radius");
    const deckOfQ: DeckLookup = (id) => (id === "q100" ? quarter : decks[id]);
    const withQ = { ...rounded, stage: { ...rounded.stage, decks: ["big", "small", "q100"] } };
    const laidQ = layStage(withQ.stage, deckOfQ);
    const quarters = laidQ.decks.filter((d) => d.typeId === "q100");
    assert(quarters.length === 4 && quarters.every((d) => !!d.outline) && laidQ.missing.length === 0, "with the piece in the catalog, four quarter-rounds stand in the corners and nothing is missing");
    assert(
      quarters.every((d) => {
        const at = placedPiece({ variantId: "q100", centre: d.centre, rotation: d.rotation, mirrored: d.mirrored }, quarter);
        return at.every((q, i) => Math.hypot(q.x - d.outline![i].x, q.y - d.outline![i].y) <= 2);
      }),
      "…each one's turn and flip the ones that stand the piece there (what פירוק לפלטות places)",
    );
    assert(
      quarters.every((d) => {
        const c = { x: Math.sign(d.centre.x) * 2000, y: Math.sign(d.centre.y) * 1000 };
        return d.outline!.every((q) => Math.hypot(q.x - c.x, q.y - c.y) <= 1000 + 3 && Math.abs(q.x) <= 3001 && Math.abs(q.y) <= 2001);
      }),
      "…each inside the stage, its arc on the stage's own corner arc",
    );
    assert(Math.abs(deckArea(laidQ) - deckArea(laidR) - 4 * ((Math.PI * 1000 * 1000) / 4)) < 0.01 * 24e6, "…the decks between them as before");
    assert(Math.abs(laidQ.coverage - 1) < 0.01, "…covering the stage");
    const sh15 = shapedRect(6000, 4000, { roundedMm: 1500 });
    const at15 = layStage({ ...withQ.stage, outline: sh15.outline, smooth: sh15.smooth, front: sh15.front, roundedMm: 1500 }, deckOfQ);
    assert(
      at15.decks.filter((d) => d.typeId === "q100").length === 0 && at15.missing.length >= 4 && at15.missing.every((m) => m.info.kind !== "rect"),
      "a quarter-round half a metre off the corner's radius does not stand in it — the corners are named as the pieces they need instead",
    );
    // Small corners on sheets: the corner sheets themselves become one curved deck, four of it.
    const sh5 = shapedRect(7320, 3660, { roundedMm: 500 });
    const at5 = layStage({ outline: sh5.outline, smooth: sh5.smooth, front: sh5.front, decks: ["sheet"], heightMm: 400, roundedMm: 500 }, (id) => (id === "sheet" ? { id, widthMm: 2440, depthMm: 1220, heightMm: 400 } : undefined));
    assert(at5.decks.length === 5 && at5.missing.length === 4 && new Set(at5.missing.map((m) => m.shape)).size === 1 && at5.missing[0].info.kind === "curve" && at5.missing[0].info.widthMm === 2440, "a 7.32×3.66 of sheets rounded R50: five sheets and one curved sheet, four of it");
    // Its edges: a flight on the front run AND one following each arc, flush at the tangent points,
    // the same depth — one continuous run to the eye — and no corner piece anywhere.
    const finishR = defaultEdgeItems(rounded, deckOf, nid);
    assert(finishR.length === 8 && finishR.every((it) => edgeKind(it) === "stairs" && it.full), "a free-standing rounded stage gets a flight on each of its eight sides");
    const arcFlights = finishR.filter((it) => stageSide(rounded.stage, undefined, it.edge)!.curved).map((it) => edgeItemShape(rounded.stage, it, deckOf)!);
    assert(arcFlights.length === 4 && arcFlights.every((s) => s.polygon.length > 4 && s.depthMm === 840), "…the four on the arcs following them, as deep as the straight ones");
    const frontFlight = edgeItemShape(rounded.stage, finishR.find((it) => stageSide(rounded.stage, undefined, it.edge)!.edges.includes(rounded.stage.front))!, deckOf)!;
    assert(
      arcFlights.filter((s) => s.polygon.some((q) => frontFlight.polygon.some((f) => Math.hypot(q.x - f.x, q.y - f.y) < 2))).length === 2,
      "…the front's flight meeting an arc's flush at each tangent point",
    );
    const withFinish = { ...rounded, stage: { ...rounded.stage, stairs: finishR } };
    assert(stageCorners(withFinish.stage, deckOf).length === 0, "…and no corner piece at a tangent point");
    assert(edgeGaps(withFinish, deckOf).length === 0, "…nothing left bare");

    // A bowed front.
    const bw = shapedRect(6000, 4000, { bowMm: 300 });
    const bowed: StagePlacement = { ...rounded, id: "bw", stage: { outline: bw.outline, smooth: bw.smooth, front: bw.front, decks: ["big", "small"], heightMm: 600, bowMm: 300 } };
    assert(bw.offset.y === -150 && stageBox(bowed.stage).depthMm === 4300, "a 6×4 bowed 30cm stands 15cm forward of the rectangle and reads 4.3m deep");
    const bpr = plainRect(bowed.stage)!;
    assert(bpr[0].y === -1850 && bpr[2].y === 2150 && bpr[0].x === -3000, "…its plain rectangle the 4m behind the chord");
    const bSides = stageSides(bowed.stage);
    assert(bSides.length === 4 && bSides.find((s) => s.edges.includes(bowed.stage.front))!.curved, "its front is the bow: one curved side");
    const laidB = layStage(bowed.stage, deckOf);
    assert(laidB.decks.length === 12 && laidB.decks.every((d) => d.rotation === 0 && !d.outline), "the field is the plain 6×4's twelve decks, square to the stage");
    assert(
      laidB.missing.length >= 2 && laidB.missing.every((m) => m.info.kind === "curve" && m.outline.every((q) => q.y <= -1850 + 1 && q.y >= -2150 - 1)),
      "…and the bow is named as curved pieces in front of the chord — none of them a cut deck",
    );
    assert(new Set(laidB.missing.map((m) => m.shape)).size <= Math.ceil(laidB.missing.length / 2), "…its two halves mirror images, one shape each pair");

    // "הוספה לקטלוג": each missing shape made a catalog row (pieceProduct), read back as a deck
    // (deckTypeOf) and chosen for the stage — and the stage is then built WITH it, nothing missing.
    const supplied = (stage: StageBuild, look: DeckLookup, label: string) => {
      const before = layStage(stage, look);
      const rows = missingByShape(before.missing).map((g, k) => {
        const p = pieceProduct(g.info, 600);
        const product = { id: `m${k}`, category: "stage-decks", layer: "floor", categoryFields: {}, styleTags: [], variants: [], ...p } as unknown as Product;
        return { id: `m${k}`, type: deckTypeOf(`m${k}`, product), count: g.count };
      });
      const look2: DeckLookup = (id) => rows.find((r) => r.id === id)?.type ?? look(id);
      const after = layStage({ ...stage, decks: [...stage.decks, ...rows.map((r) => r.id)] }, look2);
      assert(rows.length > 0 && after.missing.length === 0, `${label}: once its missing pieces are in the catalog, nothing is missing`);
      assert(rows.every((r) => after.decks.filter((d) => d.typeId === r.id).length === r.count), `${label}: …each piece standing where it was missing, as many as were missing`);
      assert(after.coverage > before.coverage + 0.01, `${label}: …and covering what it did not`);
    };
    supplied(bowed.stage, deckOf, "a bowed front");
    supplied(rounded.stage, deckOf, "a stage rounded R100");
    supplied({ outline: sh5.outline, smooth: sh5.smooth, front: sh5.front, decks: ["sheet"], heightMm: 400 }, (id) => (id === "sheet" ? { id, widthMm: 2440, depthMm: 1220, heightMm: 400 } : undefined), "sheets rounded R50");
    supplied({ outline: [{ x: -3660, y: -1830 }, { x: 3660, y: -1830 }, { x: 3660, y: 610 }, { x: 2440, y: 1830 }, { x: -3660, y: 1830 }], front: 0, decks: ["sheet"], heightMm: 400 }, (id) => (id === "sheet" ? { id, widthMm: 2440, depthMm: 1220, heightMm: 400 } : undefined), "a corner cut at 45°");
    supplied(dh.stage, deckOf4, "a drawn half-round");
    const rails = railingRuns({ ...bowed, stage: { ...bowed.stage, heightMm: 900 } }, deckOf, 800);
    assert(rails.length === 3 && rails.every((r) => !r.front), "a bowed front is still the front: railed on the other three sides, never on the bow");
    assert(skirtMm(bowed, deckOf) > 20000, "…and skirted along the bow, which is longer than its chord");
    const finishB = defaultEdgeItems(bowed, deckOf, nid);
    assert(finishB.length === 4 && edgeItemShape(bowed.stage, finishB.find((it) => stageSide(bowed.stage, undefined, it.edge)!.curved)!, deckOf)!.polygon.length > 4, "…its stairs following the bow");
    // Both together, and at another size: the same shape, rebuilt from the new rectangle.
    const again = shapedRect(7320, 4000, { roundedMm: 1000, roundedAt: "all", bowMm: 300 });
    const againStage = { outline: again.outline, smooth: again.smooth, front: again.front, decks: [] };
    assert(stageSides(againStage).length === 8 && stageSides(againStage).find((s) => s.edges.includes(0))!.curved, "a shaped stage at a new size is the same shape — eight sides, the bow its front");
    // Merged with another stage, the shape goes: the merged outline is laid as the curve it is.
    const neighbour: StagePlacement = { ...place(rect(3000, -2000, 2000, 4000), 0), id: "nb" };
    const mergedR = mergeStages([rounded, neighbour]);
    assert(!!mergedR && mergedR.stage.roundedMm === undefined && plainRect(mergedR.stage) === null && layStage(mergedR.stage, deckOf).decks.length > 0, "a rounded stage merged with another forgets its radius and is laid as the outline it now is");
  }
  console.log("stage self-check passed");
}
