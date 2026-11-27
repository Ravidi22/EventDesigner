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
import type { BenchSide, Placement, Point, StageBuild, StageEdgeKind, StageLevel, StagePiece, StageStair } from "./types";
import type { Product } from "../catalog/types";
import { asRect, defaultFront, fillWithDecks, polygonsOverlap, signedArea, type DeckType, type FillResult, type LaidDeck, type MissingPiece } from "../studio/stage-fill";
import { pieceName, type PieceInfo } from "../studio/stage-rim";
import { flattenEdge, footprintBounds, footprintOutlines, resolveFootprint, sizedFootprint, type BuiltOutline, type Footprint } from "../studio/footprint";
import { shapeRect, STICK_ALIGN_MM, stickBoxes, unionOutline, unionShapes, type RectShape, type RoundedAt } from "../studio/stage-draw";
import { type Seat } from "../studio/seating";
import { benchDefaultDepth, benchLayout, benchSpecOf, type BenchBlock, type BenchLayout } from "./bench";
import { slopeOn, walkingLine, walkingPadMm, type ClimbMark } from "../venues/climb";

/** What the fill needs to know about a deck, keyed by the variant id the stage stores. */
export type DeckLookup = (variantId: string) => DeckType | undefined;

/** How far a point in the room is from the nearest venue wall. */
export type WallDistance = (p: Point) => number;

/** A door's opening in the ROOM — its two jambs (lib/studio/anchor.ts doorOpenings). A flight may be
 *  SET INTO a stage standing against a wall where a door is in that wall: whoever comes through the
 *  door steps onto its bottom tread (2026-10-31, the user: "if there is a door, I want to be able to
 *  put in stairs even if it's too close — inner stairs"). Never a flight outside, through the doorway. */
export interface DoorOpening {
  a: Point;
  b: Point;
}

/** Does the item's base — its stretch along the stage's edge — stand at one of `doors`? At: the
 *  stretch and the opening overlap by at least half the narrower of the two, and the stretch lies
 *  within the wall-hug distance (and a little) of the opening's line. */
export function baseAtDoor(p: StagePlacement, shape: Pick<EdgeItemShape, "base" | "angleDeg" | "widthMm">, doors: readonly DoorOpening[]): boolean {
  const half = shape.widthMm / 2;
  const t = rad(shape.angleDeg);
  const e1 = toRoom(p, { x: shape.base.x - Math.cos(t) * half, y: shape.base.y - Math.sin(t) * half });
  const e2 = toRoom(p, { x: shape.base.x + Math.cos(t) * half, y: shape.base.y + Math.sin(t) * half });
  for (const d of doors) {
    const L = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
    if (L < 1) continue;
    const ux = (d.b.x - d.a.x) / L;
    const uy = (d.b.y - d.a.y) / L;
    const s1 = (e1.x - d.a.x) * ux + (e1.y - d.a.y) * uy;
    const s2 = (e2.x - d.a.x) * ux + (e2.y - d.a.y) * uy;
    const overlap = Math.min(Math.max(s1, s2), L) - Math.max(Math.min(s1, s2), 0);
    if (overlap < Math.min(L, shape.widthMm) / 2) continue;
    const off = (q: Point) => Math.abs((q.x - d.a.x) * uy - (q.y - d.a.y) * ux);
    if (Math.max(off(e1), off(e2)) <= WALL_HUG_MM + 100) return true;
  }
  return false;
}

export type StagePlacement = Placement & { stage: StageBuild };

/** A deck as laid on a stage: which level it belongs to (absent = the base) and how high it stands. */
export interface StageDeck extends LaidDeck {
  level?: string;
  heightMm: number;
  /** The index into StageBuild.pieces this deck IS — a whole piece, or a deck put by hand in the fill
   *  tool. Absent = laid by the fill. */
  piece?: number;
  /** A round piece standing whole (its box is width × depth) — drawn as the ellipse it is. */
  round?: boolean;
  /** A whole piece (StageBuild.pieces, or one standing on the rim) as the outline it stands on, in
   *  the stage's frame — what the plan draws for it where a rectangle is drawn for a deck. */
  outline?: Point[];
  /** …flipped across its own width. */
  mirrored?: boolean;
}

/** A spot left BARE on purpose (StagePiece.hole): where it stands in the stage's frame, as a box and
 *  as the outline the platform is open along. */
export interface StageHole {
  piece: number;
  centre: Point;
  rotation: number;
  widthMm: number;
  depthMm: number;
  outline: Point[];
  /** The level it is cut through (its centre inside that level's outline); absent = the base. */
  level?: string;
}

export interface StageLayout extends Omit<FillResult, "decks"> {
  decks: StageDeck[];
  /** The bare spots: no deck, no surface, the platform open there. */
  holes: StageHole[];
}

/** The stage's holes (StagePiece.hole), each where it stands in the stage's frame. The fill lays
 *  round them like an inner flight's recess, the surface is priced less them, the 3D platform is cut
 *  through at them. */
export function stageHoles(stage: StageBuild, deckOf: DeckLookup): StageHole[] {
  return (stage.pieces ?? []).flatMap((pc, piece) => {
    if (!pc.hole) return [];
    const t = deckOf(pc.variantId);
    if (!t) return [];
    const level = levelAt(stage, pc.centre)?.id;
    return [{ piece, centre: pc.centre, rotation: pc.rotation || 0, widthMm: t.widthMm, depthMm: t.depthMm, outline: placedPiece(pc, t), ...(level ? { level } : {}) }];
  });
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
  // A circle with a sweep is a slice of one — shaped, not round.
  return (shape === "circle" || shape === "ellipse") && !product.appearance?.parts?.length && !(shape === "circle" && product.appearance?.arc);
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
  return footprintStageOutline(sizedFootprint(product, sizeMm));
}

/** Any footprint as a stage outline in its own frame — a rectangle's four corners, a disc's or an
 *  oval's roundOutline, any other shape with its curves cut into chords — centred on its box. What a
 *  VENUE's built stage reads its StageBuild off (lib/venues/structure.ts featureStage), so its edge
 *  items are the sketch's. Null when the drawing is not one piece. */
export function footprintStageOutline(fp: Footprint): { outline: Point[]; smooth: number[] } | null {
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

export const rad = (deg: number) => (deg * Math.PI) / 180;
const norm360 = (deg: number) => Math.round((((deg % 360) + 360) % 360) * 100) / 100;
export const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const edgeOf = (poly: readonly Point[], i: number): [Point, Point] => [poly[i], poly[(i + 1) % poly.length]];

function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
export const onBoundary = (p: Point, poly: readonly Point[], tol = 50) => poly.some((_, i) => segDist(p, ...edgeOf(poly, i)) <= tol);

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

export type Frame = Pick<Placement, "position" | "rotation" | "mirrored">;

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
      holes: [],
    };
  }
  const types = all.filter((t) => !t.round && !t.outline);
  // The shapes that are not rectangles — a quarter-round, a deck with a curved side, a triangle —
  // which the RIM of a curved or angled stage is built of where they fit (lib/studio/stage-rim.ts).
  const shaped = all.filter((t) => t.round || t.outline);
  // The whole pieces stand where they stand, and the decks are laid round them. A hole is a piece
  // of nothing: it is laid round too (recesses), and is no deck.
  // A piece stands in the SURFACE it is in — the base, or the level whose outline holds its centre
  // (a half-round merged in at its own height is that level's whole piece) — at that surface's
  // height, and that surface's decks are laid round it.
  const pieces = (stage.pieces ?? []).flatMap((pc, piece) => {
    const t = pc.hole ? undefined : deckOf(pc.variantId);
    return t ? [{ pc, t, piece, poly: placedPiece(pc, t), level: levelAt(stage, pc.centre) }] : [];
  });
  const piecePolys = pieces.filter((x) => !x.level).map((x) => x.poly);
  // An inner flight is a RECESS: no deck stands where its steps go down into the stage. Nor in a hole.
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
    ...pieces.map(({ pc, t, piece, poly, level }) => ({
      typeId: t.id,
      centre: pc.centre,
      rotation: pc.rotation || 0,
      widthMm: t.widthMm,
      depthMm: t.depthMm,
      heightMm: level ? level.heightMm : baseH,
      ...(level ? { level: level.id } : {}),
      piece,
      outline: poly,
      ...(t.round ? { round: true } : {}),
      ...(pc.mirrored ? { mirrored: true } : {}),
    })),
    ...laid.map((d) => ({ ...d, heightMm: baseH, ...(d.outline && deckOf(d.typeId)?.round ? { round: true } : {}) })),
  ];
  const levelMissing: MissingPiece[] = [];
  for (const l of levels) {
    const own = pieces.filter((x) => x.level === l).map((x) => x.poly);
    // A level standing inside this one (a riser on a riser) is laid round, as the base lays round its levels.
    const nested = levels.filter((o) => o !== l && o.outline.every((q) => insidePoly(q, l.outline) || onBoundary(q, l.outline, 2))).map((o) => o.outline);
    const holes = [...recesses(stage, l.id, deckOf), ...own, ...nested];
    // A CURVED level (a half-round merged in at its own height) is built as a curved stage is — its
    // rim in pieces (lib/studio/stage-rim.ts), which the fill lays only for an outline it is not
    // holding within another; a level that lies inside the stage anyway needs no holding. A curved
    // front lays its rows along its chord, as the base does.
    const inside = l.outline.every((q) => insidePoly(q, stage.outline) || onBoundary(q, stage.outline, 2));
    const front = levelFront(l.outline);
    const fs = l.smooth?.length ? stageSide({ ...stage, levels }, l.id, front) : null;
    const axis = fs?.curved && !fs.closed ? ([fs.points[0], fs.points[fs.points.length - 1]] as const) : undefined;
    const r = fillWithDecks(l.outline, types, {
      front,
      obstacles: holes,
      ...(l.smooth?.length && inside ? { smooth: l.smooth, phases: true, pieces: shaped, axis } : { within: stage.outline }),
    });
    decks.push(...r.decks.filter(clear(holes)).map((d) => ({ ...d, level: l.id, heightMm: l.heightMm, ...(d.outline && deckOf(d.typeId)?.round ? { round: true } : {}) })));
    levelMissing.push(...r.missing);
  }
  const covered = decks.reduce((s, d) => s + (d.outline ? Math.abs(signedArea(d.outline)) : d.widthMm * d.depthMm), 0);
  // Coverage is of the floor meant to be decked, and a recess is left open on purpose.
  const decked = base.areaMm2 - baseRecess.reduce((s, q) => s + Math.abs(signedArea(q)), 0);
  return {
    ...base,
    decks,
    missing: [...base.missing, ...levelMissing],
    holes: stageHoles(stage, deckOf),
    coverage: decked > 0 ? Math.min(1, covered / decked) : 0,
    // A stage with levels or pieces has been shaped on purpose: no sizes are suggested.
    suggestions: levels.length || pieces.length || stage.pieces?.length ? [] : base.suggestions,
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

export function insidePoly(p: Point, poly: readonly Point[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Whether a laid deck reaches into a polygon by more than a hairline (20mm). */
export function deckOverlaps(d: LaidDeck, poly: readonly Point[]): boolean {
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

/** The recesses inner flights cut into the base (level absent) or into one level, in its frame —
 *  and, in the base, the holes left bare on purpose (stageHoles). */
function recesses(stage: StageBuild, level: string | undefined, deckOf: DeckLookup): Point[][] {
  const sunk = (stage.stairs ?? [])
    .filter((it) => it.level === level && edgeKind(it) === "stairs" && isInner(it))
    .map((it) => edgeItemShape(stage, it, deckOf)?.polygon)
    .filter((q): q is Point[] => !!q);
  return [...sunk, ...stageHoles(stage, deckOf).filter((h) => h.level === level).map((h) => h.outline)];
}

/** The holes carried out into the room. */
export function stageHolesInRoom(p: StagePlacement, deckOf: DeckLookup): StageHole[] {
  return layStage(p.stage, deckOf).holes.map((h) => {
    const c = toRoom(p, h.centre);
    return { ...h, centre: { x: Math.round(c.x), y: Math.round(c.y) }, rotation: norm360((p.mirrored ? -h.rotation : h.rotation) + (p.rotation || 0)), outline: h.outline.map((q) => toRoom(p, q)) };
  });
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

/** The corners a curve runs through — the stage's (StageBuild.smooth), or a level's own. */
function smoothOf(stage: StageBuild, level: string | undefined): ReadonlySet<number> {
  const s = level ? stage.levels?.find((l) => l.id === level)?.smooth : stage.smooth;
  return s?.length ? new Set(s) : NO_SMOOTH;
}

/** The level whose outline holds `q`, if any. */
function levelAt(stage: StageBuild, q: Point): StageLevel | undefined {
  return stage.levels?.find((l) => insidePoly(q, l.outline));
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
  const smooth = smoothOf(stage, level);
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

/** A level's edge within this of the stage's own outline lies ON it. */
export const LEVEL_EDGE_TOL_MM = 20;

/** Whether edge `edge` of level `l` lies on the stage's own outline — looking OUT at the room rather
 *  than down onto the base. A part merged in at its own height (mergeStages) keeps its outer sides
 *  as a level's, and they are finished, skirted and railed from the FLOOR like the base's; the base's
 *  own edge under them is theirs (needyEdges). */
export function levelEdgeOuter(stage: StageBuild, l: StageLevel, edge: number): boolean {
  const [a, b] = edgeOf(l.outline, edge);
  return onBoundary({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, stage.outline, LEVEL_EDGE_TOL_MM);
}

/** Whether a level's item stands on the stage's own edge (its middle on the outline). False for
 *  every base item. */
export function itemOuter(stage: StageBuild, item: StageStair): boolean {
  if (!item.level) return false;
  const side = stageSide(stage, item.level, item.edge);
  const sp = itemSpan(stage, item);
  if (!side || !sp) return false;
  return onBoundary(sideFrame(side, (sp.from + sp.to) / 2).p, stage.outline, LEVEL_EDGE_TOL_MM);
}

/** The height a flight climbs: floor to base; a level's — from the base up to it, or all the way
 *  from the floor when it stands on the stage's own edge (itemOuter). */
export function stairRise(stage: StageBuild, stair: StageStair, deckOf: DeckLookup): number {
  const baseH = stageHeight(stage, deckOf);
  if (!stair.level) return baseH;
  const l = stage.levels?.find((x) => x.id === stair.level);
  if (!l) return 0;
  return itemOuter(stage, stair) ? l.heightMm : Math.max(0, l.heightMm - baseH);
}

/** The steps a flight needs to climb `riseMm` comfortably — each riser at most `riserMaxMm`
 *  (RISER_MAX_MM, or the stage's own module: stairStepOf). */
export function autoRisers(riseMm: number, riserMaxMm = RISER_MAX_MM): number {
  return Math.max(1, Math.ceil(riseMm / Math.max(1, riserMaxMm)));
}

/** The step a stage's flights are built in (StageBuild.riserMm / treadMm — the crew's own stair
 *  module), else the comfortable defaults. Every reader of a flight's geometry asks this. */
export function stairStepOf(stage: Pick<StageBuild, "riserMm" | "treadMm">): { riserMm: number; treadMm: number } {
  return {
    riserMm: stage.riserMm && stage.riserMm > 0 ? Math.round(stage.riserMm) : RISER_MAX_MM,
    treadMm: stage.treadMm && stage.treadMm > 0 ? Math.round(stage.treadMm) : TREAD_MM,
  };
}

/** How an item's end finishes against the item on the next side (EdgeItemShape.ends). */
export type EdgeEnd = "free" | "flush" | "mitred";

export interface EdgeItemShape {
  kind: StageEdgeKind;
  /** Set into the stage (StageStair.inner): a recessed flight, a banquette on the deck. */
  inner: boolean;
  /** A level's item standing on the stage's OWN edge (itemOuter): it looks out at the room and
   *  climbs from the floor, as the base's items do. False for every base item. */
  outer: boolean;
  /** The floor it stands on outside its edge and climbs from: the room's (0), or the base deck's
   *  for a level's item that looks down onto the base. */
  floorMm: number;
  /** Its footprint, in the stage's frame. A rectangle on a straight side; on a curved side it
   *  follows the curve (a ramp excepted — it stands straight, on the tangent at its middle); cut
   *  on the valley at a mitred end (`ends`). */
  polygon: Point[];
  /** Lines across it — a flight's treads. */
  treads: [Point, Point][];
  /** Every line ACROSS the item, from its edge line (first — the stretch of the side it stands on)
   *  to its far line (last): a flight's treads between them, a banquette's middle line. Each runs
   *  from the item's start end to its end end, through every corner of a curved side; the strip
   *  between two neighbours is one tread, which is what the 3D build stands as a block. */
  lines: Point[][];
  /** How each end (start, end — along the side) finishes: FREE, its own end line; FLUSH, an item of
   *  the same kind runs dead straight on from it (no line between); MITRED, it meets one at a
   *  corner and is cut on the valley where their treads meet, the neighbour cut the same way, so the
   *  two read — and are built — as one run turning the corner. */
  ends: [EdgeEnd, EdgeEnd];
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
  /** …and its blocks as the room raises them (./bench.ts benchBlocks), carried onto the edge — each
   *  with its `outline` in the stage's frame, following a curved side. Only on a bench. */
  blocks?: BenchBlock[];
  /** Each sofa side's run on a bench (seat edge to backrest), in the stage's frame — what a press
   *  drags along the banquette (bug round 2026-11-21 §2.1). */
  sofas?: { side: "back" | "front"; polygon: Point[] }[];
}
export type StairShape = EdgeItemShape;

/** Where an edge item stands and what it is. A FLIGHT: as many risers as keep each under
 *  RISER_MAX_MM (or as many as the designer set), one tread fewer than risers (the last step up is
 *  the stage itself), each TREAD_MM deep — outside the edge, or recessed into the stage behind it
 *  when `inner`. A BENCH: a seat-deep strip outside the edge, or on the deck inside it. A BARRIER:
 *  a thin strip just inside it, on the stage. */
export function edgeItemShape(stage: StageBuild, item: StageStair, deckOf: DeckLookup): EdgeItemShape | null {
  return shapeCore(stage, item, deckOf, edgeJoints(stage, deckOf).get(item));
}

// ── Runs that go on: items of one stage meeting end to end ──────────────────────────────────────
//
// Two flights of ONE stage that meet — the base's front running on into a raised part's front, a
// half-round apron's curved flight meeting the stage's straight one where the arc leaves the front,
// the two flights of an L's inside corner — are one run of stairs to whoever walks them, and to the
// crew who builds them (2026-10-31, the user: "union the stairs also so it is continuous… the stairs
// logic needs to be on both"). So, for every pair of stairs (or banquettes) whose ends meet, from the
// same floor, set the same way into or out of the stage (edgeJoints):
//   - the whole connected run climbs in ONE NUMBER OF STEPS — the most any of them needs — so every
//     tread is as deep as its neighbour's and the tread lines run on; a flight onto a lower part
//     simply has shorter risers. A typed count (StageStair.risers) is the designer's and is kept;
//   - two running dead straight on from each other are FLUSH: no end line between them;
//   - two meeting at an INSIDE corner (each one's strip running into the other's) are MITRED: both
//     cut on the valley where their treads meet, so the treads turn the corner as one L instead of
//     standing through each other. (An OUTSIDE corner is a corner piece's — stageCorners.)
// Derived on every read, memoised per stage object; nothing is stored, and an item that is not on
// the stage (a preview, a candidate) is its own plain self.

/** Two item ends this close are one joint. */
const JOINT_MM = 5;

/** A mitred end: where each line across the item (edge line first, far line last) is cut — the point
 *  it crosses the same line of the item it meets — keeping the part away from the joint. */
interface EdgeTrim {
  end: 0 | 1;
  at: (Point | null)[];
}
interface EdgeJoint {
  risers?: number;
  ends: [EdgeEnd, EdgeEnd];
  trims: EdgeTrim[];
}

/** Where two polylines cross — the crossing nearest `near` when there are several. */
function crossing(a: readonly Point[], b: readonly Point[], near: Point): Point | null {
  let best: Point | null = null;
  for (let i = 0; i < a.length - 1; i++)
    for (let j = 0; j < b.length - 1; j++) {
      const p = a[i];
      const r = { x: a[i + 1].x - p.x, y: a[i + 1].y - p.y };
      const q = b[j];
      const s = { x: b[j + 1].x - q.x, y: b[j + 1].y - q.y };
      const den = r.x * s.y - r.y * s.x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / den;
      const u = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / den;
      if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) continue;
      const x = { x: p.x + r.x * t, y: p.y + r.y * t };
      if (!best || len(x, near) < len(best, near)) best = x;
    }
  return best;
}

/** A polyline cut at a point on it, keeping what comes after it (`after`) or before it. */
function trimAt(line: readonly Point[], at: Point, after: boolean): Point[] {
  if (line.length < 2) return [...line];
  let best = { d: Infinity, i: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const d = segDist(at, line[i], line[i + 1]);
    if (d < best.d) best = { d, i };
  }
  const out = after ? [at, ...line.slice(best.i + 1)] : [...line.slice(0, best.i + 1), at];
  return out.filter((q, k) => k === 0 || len(q, out[k - 1]) > 0.01);
}

const NO_JOINTS: ReadonlyMap<StageStair, EdgeJoint> = new Map();
const jointCache = new WeakMap<StageBuild, WeakMap<DeckLookup, { sig: string; joints: ReadonlyMap<StageStair, EdgeJoint> }>>();

/** How the stage's items meet each other (see above), by item object. Empty for a stage with fewer
 *  than two items. */
function edgeJoints(stage: StageBuild, deckOf: DeckLookup): ReadonlyMap<StageStair, EdgeJoint> {
  const items = stage.stairs ?? [];
  if (items.length < 2) return NO_JOINTS;
  const sig = `${stageHeight(stage, deckOf)}|${(stage.levels ?? []).map((l) => l.heightMm).join(",")}`;
  let byLookup = jointCache.get(stage);
  const hit = byLookup?.get(deckOf);
  if (hit && hit.sig === sig) return hit.joints;
  const joints = findJoints(stage, deckOf, items);
  if (!byLookup) jointCache.set(stage, (byLookup = new WeakMap()));
  byLookup.set(deckOf, { sig, joints });
  return joints;
}

function findJoints(stage: StageBuild, deckOf: DeckLookup, items: readonly StageStair[]): ReadonlyMap<StageStair, EdgeJoint> {
  type End = { p: Point; d: Point; v: Point };
  const info = items.flatMap((it) => {
    const k = edgeKind(it);
    if (k !== "stairs" && k !== "bench") return [];
    const raw = shapeCore(stage, it, deckOf);
    const side = stageSide(stage, it.level, it.edge);
    const sp = itemSpan(stage, it);
    if (!raw || !side || !sp) return [];
    // All the way round a rim it has no ends.
    if (side.closed && sp.to - sp.from >= side.L - 1) return [];
    const out = raw.inner ? -1 : 1;
    // At each end: where it is, the way along it INTO the item, and the way to its far side.
    const end = (s: number, sign: 1 | -1): End => {
      const f = sideFrame(side, s);
      return { p: f.p, d: { x: f.u.x * sign, y: f.u.y * sign }, v: { x: f.n.x * out, y: f.n.y * out } };
    };
    return [{ it, raw, kind: k, ends: [end(sp.from, 1), end(sp.to, -1)] as [End, End] }];
  });
  if (info.length < 2) return NO_JOINTS;
  const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
  const crossOf = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
  const parent = info.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const links: { a: number; ea: 0 | 1; b: number; eb: 0 | 1; how: "flush" | "mitred" }[] = [];
  for (let i = 0; i < info.length; i++)
    for (let j = i + 1; j < info.length; j++) {
      const A = info[i];
      const B = info[j];
      if (A.kind !== B.kind || A.raw.inner !== B.raw.inner || Math.abs(A.raw.floorMm - B.raw.floorMm) > 1) continue;
      for (const ea of [0, 1] as const)
        for (const eb of [0, 1] as const) {
          const P = A.ends[ea];
          const Q = B.ends[eb];
          if (len(P.p, Q.p) > JOINT_MM) continue;
          let how: "flush" | "mitred" | null = null;
          if (dot(P.d, Q.d) < -0.995 && dot(P.v, Q.v) > 0.99) how = "flush";
          // Banquettes meeting at an inside corner are mitred too — a ר of banquettes, each its own
          // piece, reads as one bend instead of two strips standing through each other (bug round
          // 2026-11-21 §2.2, DECIDE 1). They join no run of steps: only stairs share a count.
          else if (Math.abs(crossOf(P.d, Q.d)) > 0.17 && dot(P.v, Q.d) > 0.05 && dot(Q.v, P.d) > 0.05) how = "mitred";
          if (!how) continue;
          links.push({ a: i, ea, b: j, eb, how });
          if (A.kind === "stairs") parent[find(j)] = find(i);
        }
    }
  if (!links.length) return NO_JOINTS;
  // One number of steps per connected run of stairs: the most any of them needs.
  const most = new Map<number, number>();
  info.forEach((x, i) => {
    if (x.kind !== "stairs") return;
    const r = find(i);
    most.set(r, Math.max(most.get(r) ?? 0, x.raw.risers));
  });
  const risersOf = info.map((x, i) => (x.kind !== "stairs" ? 0 : x.it.risers && x.it.risers > 0 ? x.raw.risers : (most.get(find(i)) ?? x.raw.risers)));
  const joints = info.map((x, i): EdgeJoint => ({ ...(risersOf[i] && risersOf[i] !== x.raw.risers ? { risers: risersOf[i] } : {}), ends: ["free", "free"], trims: [] }));
  // Each item as it stands in the run's number of steps, before any end is cut.
  const shaped = info.map((x, i) => (joints[i].risers !== undefined ? (shapeCore(stage, x.it, deckOf, { risers: joints[i].risers, ends: ["free", "free"], trims: [] }) ?? x.raw) : x.raw));
  for (const l of links) {
    const A = shaped[l.a];
    const B = shaped[l.b];
    // Ends meet only where the two are as deep as each other — else each keeps its own end line.
    if (Math.abs(A.depthMm - B.depthMm) > 1 || A.lines.length !== B.lines.length) continue;
    if (l.how === "mitred") {
      // Each line across the one cut where it crosses the same line across the other: the treads
      // meet on the valley, a straight one and a curved one too. The edge lines meet at the joint.
      const J = { x: (info[l.a].ends[l.ea].p.x + info[l.b].ends[l.eb].p.x) / 2, y: (info[l.a].ends[l.ea].p.y + info[l.b].ends[l.eb].p.y) / 2 };
      const at = A.lines.map((la, k) => (k === 0 ? J : crossing(la, B.lines[k], J)));
      // Lines that never cross (they run apart) are no inside corner after all.
      if (at.slice(1).some((x) => !x)) continue;
      joints[l.a].trims.push({ end: l.ea, at });
      joints[l.b].trims.push({ end: l.eb, at });
    }
    joints[l.a].ends[l.ea] = l.how;
    joints[l.b].ends[l.eb] = l.how;
  }
  const out = new Map<StageStair, EdgeJoint>();
  info.forEach((x, i) => {
    const j = joints[i];
    if (j.risers !== undefined || j.trims.length || j.ends[0] !== "free" || j.ends[1] !== "free") out.set(x.it, j);
  });
  return out;
}

/** What to stroke for an item: its edge line, its far line, and the end lines of its FREE ends — a
 *  flush or mitred end draws none, so two items meeting there read as one run. */
export function edgeItemStrokes(shape: EdgeItemShape): Point[][] {
  const first = shape.lines[0];
  const last = shape.lines[shape.lines.length - 1];
  if (!first?.length || !last?.length) return [[...shape.polygon, shape.polygon[0]]];
  const out = [first, last];
  if (shape.ends[0] === "free") out.push([first[0], last[0]]);
  if (shape.ends[1] === "free") out.push([first[first.length - 1], last[last.length - 1]]);
  return out;
}

/** The shape itself, as the item would stand alone — or as its joint (edgeJoints) says: in the run's
 *  number of steps, cut on the valleys it is mitred on, its ends flush or free. */
function shapeCore(stage: StageBuild, item: StageStair, deckOf: DeckLookup, joint?: EdgeJoint): EdgeItemShape | null {
  const side = stageSide(stage, item.level, item.edge);
  const span = itemSpan(stage, item);
  if (!side || !span) return null;
  const kind = edgeKind(item);
  const inner = isInner(item);
  const outer = itemOuter(stage, item);
  const floorMm = item.level && !outer ? stageHeight(stage, deckOf) : 0;
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
  const trims = joint?.trims ?? [];
  const angleDeg = (Math.atan2(m.u.y, m.u.x) * 180) / Math.PI;
  const shape = (s: {
    polygon: Point[];
    lines?: Point[][];
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
    blocks?: BenchBlock[];
    sofas?: { side: "back" | "front"; polygon: Point[] }[];
  }): EdgeItemShape => {
    // A mitred end cuts each line across the item where its neighbour's crosses it; the outline is
    // then the edge line out and the far line back, as it always was (strip).
    let lines = s.lines ?? [line(0), line(s.reach)];
    for (const tr of trims) lines = lines.map((l, k) => (tr.at[k] ? trimAt(l, tr.at[k]!, tr.end === 0) : l));
    const polygon = trims.length ? [...lines[0], ...[...lines[lines.length - 1]].reverse()] : s.polygon;
    return {
    kind,
    inner,
    outer,
    floorMm,
    polygon,
    treads: kind === "stairs" ? lines.slice(1, -1).flatMap((l) => l.slice(1).map((q, i) => [l[i], q] as [Point, Point])) : [],
    lines,
    ends: joint ? [joint.ends[0], joint.ends[1]] : ["free", "free"],
    climb: s.climb,
    base: at(0, 0),
    foot: at(0, s.reach),
    farLine: lines[lines.length - 1],
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
    ...(s.blocks ? { blocks: s.blocks } : {}),
    ...(s.sofas?.length ? { sofas: s.sofas } : {}),
    };
  };
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
    // An INNER banquette's room side is the stage's edge, a drop: nobody sits there and no chair
    // stands there (QA BQ-6 — its chairs stood 6 cm off the stage in the air). The spec's room side
    // is kept underneath, for the day it is set back outside.
    const own = benchSpecOf(item);
    const spec = inner ? { ...own, front: { kind: "none" as const } } : own;
    // Table-deep with chairs at it, seat-deep otherwise (benchDefaultDepth), unless typed.
    const depthMm = spec.depthMm && spec.depthMm > 0 ? spec.depthMm : benchDefaultDepth(spec);
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
      // Each sofa side's run, seat edge to backrest — what a press drags along the banquette (§2.1).
      sofas: (["back", "front"] as const).flatMap((key) => {
        const sd = lay[key];
        if (sd.kind !== "sofa" || sd.seats <= 0) return [];
        const r = sd.widthMm ?? w;
        const c = sd.offsetMm ?? 0;
        const sign = key === "back" ? -1 : 1;
        const half = lay.depthMm / 2;
        const edgeY = sign * half;
        const innerY = sign * (half - (sd.depthMm ?? half));
        const stops = [c - r / 2, ...xs.filter((x) => x > c - r / 2 + 1 && x < c + r / 2 - 1), c + r / 2];
        return [{ side: key, polygon: [...stops.map((x) => carry({ x, y: edgeY })), ...[...stops].reverse().map((x) => carry({ x, y: innerY }))] }];
      }),
      // Each block carried onto the edge, sampled at the side's own stops so it bends with a curve.
      blocks: lay.blocks.map((b) => {
        const stops = [b.x0, ...xs.filter((x) => x > b.x0 + 1 && x < b.x1 - 1), b.x1];
        return { ...b, outline: [...stops.map((x) => carry({ x, y: b.y0 })), ...[...stops].reverse().map((x) => carry({ x, y: b.y1 }))] };
      }),
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
  // In the stage's own step (the crew's stair module), unless the designer typed the count.
  const step = stairStepOf(stage);
  const risers = joint?.risers ?? (item.risers && item.risers > 0 ? Math.round(item.risers) : autoRisers(riseMm, step.riserMm));
  const treads = Math.max(1, risers - 1);
  const depthMm = treads * step.treadMm;
  // Outside the edge, or — inner — the same flight sunk into the stage: its first riser at the edge,
  // its last onto the deck `depthMm` in.
  const dir = inner ? -1 : 1;
  const lines: Point[][] = [line(0)];
  for (let k = 1; k < treads; k++) lines.push(line(dir * k * step.treadMm));
  lines.push(line(dir * depthMm));
  // An outer flight is climbed from the floor at its far side up to the edge; an inner one from the
  // floor at the edge up onto the deck at its far side.
  const { foot, top } = inner ? walk(0, -depthMm, depthMm) : walk(depthMm, 0, depthMm);
  return shape({
    polygon: strip(0, dir * depthMm),
    lines,
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
    lines: shape.lines.map((l) => l.map(r)),
    climb: shape.climb && carryClimb(shape.climb, r),
    base,
    foot: r(shape.foot),
    farLine: shape.farLine.map(r),
    midline: shape.midline.map(r),
    angleDeg: (Math.atan2(ahead.y - base.y, ahead.x - base.x) * 180) / Math.PI,
    chairs: [],
    // A banquette's sofa side and its blocks come too (QA BQ-7: a run across two stages drew none).
    cushions: shape.cushions.map((q) => q.map(r)),
    backs: shape.backs.map(([u, v]) => [r(u), r(v)] as [Point, Point]),
    ...(shape.blocks ? { blocks: shape.blocks.map((b) => ({ ...b, ...(b.outline ? { outline: b.outline.map(r) } : {}) })) } : {}),
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
  doors?: readonly DoorOpening[],
): { ok: true } | { ok: false; reason: "wall" | "short" | "flat" | "solid" } {
  const shape = edgeItemShape(p.stage, stair, deckOf);
  if (!shape) return { ok: false, reason: stairRise(p.stage, stair, deckOf) <= 0 ? "flat" : "short" };
  const side = stageSide(p.stage, stair.level, stair.edge);
  if (side && !stair.full && side.L < Math.min(stair.widthMm, 600) * 0.6) return { ok: false, reason: "short" };
  if (shape.inner && shape.kind === "stairs" && !stair.level && stageIsOnePiece(p.stage, deckOf)) return { ok: false, reason: "solid" };
  if (wallDistance && (!stair.level || shape.outer) && shape.kind !== "barrier" && shape.kind !== "backdrop") {
    const r = (q: Point) => toRoom(p, q);
    if (shape.inner) {
      // Set into the stage, it needs no floor of its own — only a side that is not against the wall,
      // or a DOOR in that wall where it stands (baseAtDoor).
      if (wallDistance(r(shape.base)) <= WALL_HUG_MM && !(doors?.length && baseAtDoor(p, shape, doors))) return { ok: false, reason: "wall" };
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
  opts: { inner: boolean; otherwise: "barrier" | "keep"; doors?: readonly DoorOpening[] },
): StageStair[] {
  const fallback = (it: StageStair): StageStair => {
    if (opts.inner) {
      const sunk = { ...it, inner: true };
      if (stairFits(p, sunk, deckOf, wallDistance, opts.doors).ok) return sunk;
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
  doors?: readonly DoorOpening[],
): { ok: true; item: StageStair } | { ok: false; reason: "wall" | "short" | "flat" | "solid" } {
  const fits = stairFits(p, item, deckOf, wallDistance, doors);
  if (fits.ok) return { ok: true, item };
  const k = edgeKind(item);
  if (fits.reason === "wall" && (k === "stairs" || k === "bench") && !isInner(item)) {
    const sunk = { ...item, inner: true };
    if (stairFits(p, sunk, deckOf, wallDistance, doors).ok) return { ok: true, item: sunk };
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
  // Where a level stands on the stage's own edge, that stretch of the edge is the LEVEL's — finished,
  // skirted and railed at the level's height, below — and not the base's.
  const underLevels = (side: StageSide): [number, number][] => {
    const spans: [number, number][] = [];
    for (const l of stage.levels ?? [])
      for (let i = 0; i < l.outline.length; i++) {
        const [a, b] = edgeOf(l.outline, i);
        if (len(a, b) < 1 || !levelEdgeOuter(stage, l, i)) continue;
        const pa = alongSide(side, a);
        const pb = alongSide(side, b);
        if (pa.d > LEVEL_EDGE_TOL_MM || pb.d > LEVEL_EDGE_TOL_MM) continue;
        spans.push([Math.min(pa.s, pb.s), Math.max(pa.s, pb.s)]);
      }
    return spans;
  };
  for (const side of stageSides(stage)) {
    if (side.L < 1) continue;
    let open: [number, number][] = [];
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
    const taken = underLevels(side);
    if (taken.length) open = open.flatMap(([lo, hi]) => uncoveredIn(lo, hi, taken));
    // The front is the SIDE the front edge is on — a bowed front is still the front (skirt, never a
    // railing); a rim that goes all the way round has no front, its one chord notwithstanding.
    if (open.length) out.push({ edge: side.edge, side, L: side.L, open, dropMm: baseH, front: !side.closed && side.edges.includes(stage.front) });
  }
  for (const l of stage.levels ?? []) {
    const drop = l.heightMm - baseH;
    for (const side of stageSides(stage, l.id)) {
      if (side.L < 1) continue;
      // Each edge of the side looks either OUT at the room — it lies on the stage's own outline, and
      // drops all the way to the floor — or down onto the base; a run of edges looking the same way
      // is one stretch. An outer edge against a wall needs nothing, like the base's.
      const runs: { from: number; to: number; outer: boolean }[] = [];
      for (let k = 0; k < side.edges.length; k++) {
        const a = side.points[k];
        const b = side.points[k + 1];
        const outer = levelEdgeOuter(stage, l, side.edges[k]);
        if (outer && hugs(a, b)) continue;
        const last = runs[runs.length - 1];
        if (last && last.outer === outer && Math.abs(last.to - side.cum[k]) < 1e-6) last.to = side.cum[k + 1];
        else runs.push({ from: side.cum[k], to: side.cum[k + 1], outer });
      }
      if (side.closed && runs.length > 1 && runs[0].from < 1e-6 && runs[runs.length - 1].to > side.L - 1e-6 && runs[0].outer === runs[runs.length - 1].outer) {
        const first = runs.shift()!;
        runs[runs.length - 1].to = side.L + first.to;
      }
      const outerRuns = runs.filter((x) => x.outer).map((x) => [x.from, x.to] as [number, number]);
      const innerRuns = runs.filter((x) => !x.outer).map((x) => [x.from, x.to] as [number, number]);
      if (outerRuns.length) {
        const front = outerRuns.some(([f, t]) => segDist(sideFrame(side, (f + t) / 2).p, ...edgeOf(stage.outline, stage.front)) <= 50);
        out.push({ level: l.id, edge: side.edge, side, L: side.L, open: outerRuns, dropMm: l.heightMm, front, outer: true });
      }
      if (drop > 0 && innerRuns.length) out.push({ level: l.id, edge: side.edge, side, L: side.L, open: innerRuns, dropMm: drop, front: false });
    }
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
 *  skirt). A level's side on the stage's own edge is skirted at the LEVEL's height, from the floor,
 *  and the base's edge under it not at all (needyEdges). */
export function openEdges(p: StagePlacement, deckOf: DeckLookup, wallDistance?: WallDistance): EdgeRun[] {
  const against = (it: StageStair) => kindIn("stairs", "ramp")(it) || (edgeKind(it) === "bench" && !isInner(it));
  return needyEdges(p, deckOf, wallDistance).flatMap((e) => e.open.flatMap(([lo, hi]) => runsOf(e, uncoveredIn(lo, hi, spansOn(p.stage, e, against)))));
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

/** The "stairs everywhere" finish: stairs along every open side, or a barrier where there is no
 *  floor in front of the side for a flight to stand on. (Set into the stage is a choice the designer
 *  makes, not a default: a whole side recessed eats a strip of deck.) A ROUND stage — a rim all the
 *  way round with nothing on it yet — gets ONE flight, at its back, and the rest of its rim is
 *  skirted: stairs round a whole disc is not what anyone builds.
 *
 *  NOT APPLIED BY DEFAULT ANY MORE (2026-10-30, the user: a new stage gets nothing): no path in the
 *  studio or at /halls calls it when a stage is made, reshaped or merged — every edge item is clicked
 *  on or laid from the bar's "קצוות פתוחים". Kept as the rule set `stageFromPiece`'s `withEdges`
 *  and the self-checks below exercise. */
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
    // ONE piece keeps the item — its id (what is perched on it, the bar's pick) and everything typed
    // on it: the piece under its middle, else the longest. Any other piece is a banquette of its
    // own with the automatic seat counts and no sofa — a split used to copy the whole spec onto both
    // pieces, two centred sofas and 8 typed chairs become 5 + 5 (QA EI-10).
    const mid = (sp.from + sp.to) / 2;
    const keeper = left.findIndex(([f, t]) => mid >= f && mid <= t) >= 0 ? left.findIndex(([f, t]) => mid >= f && mid <= t) : left.reduce((best, [f, t], i) => (t - f > left[best][1] - left[best][0] ? i : best), 0);
    left.forEach(([f, t], i) => {
      const { full: _full, ...rest } = it;
      const place = { t: wrapT((f + t) / 2, side.L), widthMm: Math.round(t - f) };
      if (i === keeper) out.push({ ...rest, id: it.id, ...place });
      else out.push({ ...plainPiece(rest), id: freshId(it.id), ...place });
    });
  }
  return out;
}

/** A piece split off an item: the same kind and heights, but no typed seat counts and no sofa — those
 *  stay with the piece that kept the item (shareSide). Stairs and the rest carry nothing typed per
 *  piece but their risers, which are the stage's step and stay. */
function plainPiece<T extends StageStair>(it: T): T {
  const { seats: _seats, ...rest } = it;
  if (!rest.bench) return rest as T;
  const side = (sd?: BenchSide): BenchSide | undefined => (!sd ? sd : sd.kind === "sofa" ? { kind: "none" } : { kind: sd.kind });
  const { back, front, ...bench } = rest.bench;
  return { ...rest, bench: { ...bench, ...(back ? { back: side(back) } : {}), ...(front ? { front: side(front) } : {}) } } as T;
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
/** The stage's edge items with no two standing through each other — resolveOverlaps alone, WITHOUT
 *  joining touching items into one (tidyEdgeItems does both). What a resize leaves: a side made
 *  shorter clamps every item on it on its own (itemSpan), so a 6 m front of banquette | flight |
 *  banquette typed down to 2.4 m stood all three through each other (QA EI-7). Items already apart
 *  come back as they were (the same objects). */
export function separateEdgeItems(stage: StageBuild): StageStair[] {
  return resolveOverlaps(stage);
}

function resolveOverlaps(stage: StageBuild): StageStair[] {
  const width = (it: StageStair) => {
    const sp = itemSpan(stage, it);
    return sp ? sp.to - sp.from : Infinity;
  };
  let items = [...(stage.stairs ?? [])];
  // Pass after pass until nothing moves: a split's second piece is a NEW item no earlier pass
  // looked at, so two banquettes split round one flight could still stand through each other
  // (found with QA EI-7: banquette | flight | banquette on a front made 2.4 m).
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const it of [...items].sort((a, b) => width(a) - width(b))) {
      if (!items.some((x) => x.id === it.id)) continue;
      const next = shareSide({ ...stage, stairs: items }, it.id);
      if (next.length !== items.length || next.some((x, i) => x !== items[i])) {
        items = next;
        changed = true;
      }
    }
    if (!changed) break;
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
  /** The stage's tread (stairStepOf) — what the 3D build cuts the corner's steps in. */
  treadMm: number;
  /** A level's corner on the stage's own edge: its runs climb from the floor (itemOuter). */
  outer?: boolean;
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
    const smooth = smoothOf(stage, level);
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
      // The same climb from the same floor: a level's outer flight and one down onto the base never
      // turn one corner together.
      if (Math.abs(s1.riseMm - s2.riseMm) > 1 || s1.outer !== s2.outer) continue;
      const u1 = unit(a, c);
      const u2 = unit(c, b);
      const n1 = { x: sg * u1.y, y: -sg * u1.x };
      const n2 = { x: sg * u2.y, y: -sg * u2.x };
      const d = Math.min(s1.depthMm, s2.depthMm);
      const at = (k1: number, k2: number) => ({ x: c.x + n1.x * k1 + n2.x * k2, y: c.y + n1.y * k1 + n2.y * k2 });
      const treads: [Point, Point][] = [];
      const treadMm = stairStepOf(stage).treadMm;
      if (kind === "stairs")
        for (let k = treadMm; k < d - 1; k += treadMm) {
          treads.push([at(k, 0), at(k, k)], [at(0, k), at(k, k)]);
        }
      // A banquette corner is as deep as EACH run it meets — out along each normal by that run's own
      // depth — so two of different depths leave no notch (QA BQ-10). `depthMm` stays the lesser, the
      // figure the quote adds.
      const [d1, d2] = kind === "bench" ? [s1.depthMm, s2.depthMm] : [d, d];
      out.push({ kind, level, polygon: [c, at(d1, 0), at(d1, d2), at(0, d2)], treads, depthMm: d, treadMm, ...(s1.outer ? { outer: true } : {}) });
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

/** Everyone a document's STAGE banquettes seat, as the seating readout COUNTS them — on chairs and on
 *  a sofa side alike, a sofa side that is not seating left out (BenchLayout.countedSeats). (A
 *  standalone banquette's seats are standaloneBenchSeats, ./bench.ts — it needs the catalog to be
 *  told apart.) */
export function benchSeats(placements: readonly Placement[], deckOf: DeckLookup): number {
  let n = 0;
  for (const p of placements)
    for (const it of p.stage?.stairs ?? []) {
      if (edgeKind(it) !== "bench") continue;
      const shape = edgeItemShape(p.stage!, it, deckOf);
      n += shape?.bench?.countedSeats ?? shape?.seats ?? 0;
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
    return { variantId: pc.variantId, centre: { x: Math.round(c.x), y: Math.round(c.y) }, rotation: norm360(local), ...(mirrored ? { mirrored: true } : {}), ...(pc.hole ? { hole: true as const } : {}) };
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
    // Banquettes that only TOUCH stay two (bug round 2026-11-21, Ravid's answer): each carries its own
    // sofa, seats and dressing, and Ctrl+D lays a copy flush beside one. Flights still join — a run of
    // stairs is one flight. Overlapping banquettes are resolveOverlaps' (the narrower keeps its stretch).
    const joins = (next: { from: number }) => (edgeKind(run.it) === "bench" ? false : next.from <= run.to + 2);
    for (const next of list.slice(1)) {
      if (joins(next)) run.to = Math.max(run.to, next.to);
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

/** An outline with a corner added wherever one of `cuts` lies inside one of its edges — so a raised
 *  part's side that runs partly along the stage's outline and partly along a seam is two sides, one
 *  looking out at the room and one down onto the base. Smooth corners keep their flag; the corners
 *  added are real ones. */
function splitAt(outline: readonly Point[], smooth: readonly number[] | undefined, cuts: readonly Point[], tolMm = 10): { outline: Point[]; smooth: number[] } {
  const sm = new Set(smooth ?? []);
  const out: Point[] = [];
  const outSmooth: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [a, b] = edgeOf(outline, i);
    if (sm.has(i)) outSmooth.push(out.length);
    out.push(a);
    const L = len(a, b);
    if (L < 2 * tolMm) continue;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const at = cuts
      .map((c) => ({ c, t: (c.x - a.x) * u.x + (c.y - a.y) * u.y }))
      .filter(({ c, t }) => t > tolMm && t < L - tolMm && segDist(c, a, b) <= tolMm)
      .map(({ t }) => t)
      .sort((x, y) => x - y)
      .filter((t, k, all) => k === 0 || t - all[k - 1] > tolMm);
    for (const t of at) out.push({ x: Math.round(a.x + u.x * t), y: Math.round(a.y + u.y * t) });
  }
  return { outline: out, smooth: outSmooth };
}

/** One edge item of a part carried onto the merged stage's sides (`targets` — the base's, or a raised
 *  level's outer ones). A straight item goes onto EVERY straight target side along its line that faces
 *  the same way and overlaps its stretch, one piece per side (a front flight round an apron merged
 *  into its middle stays on both halves of the front); a curved one, or a straight one that finds no
 *  such side, onto the side its middle stands on. Nothing where it stood on a seam. */
function homeItem(
  it: StageStair,
  side: StageSide,
  sp: { from: number; to: number; L: number },
  map: (q: Point) => Point,
  targets: readonly StageSide[],
  level: string | undefined,
): StageStair[] {
  const { full: _f, level: _l, ...rest } = it;
  const mk = (k: number, ns: StageSide, f: number, t: number): StageStair => {
    const L = ns.L || 1;
    return { ...rest, id: k ? `${it.id}~${k}` : it.id, ...(level ? { level } : {}), edge: ns.edge, t: ((((f + t) / 2) % L) + L) % L / L, widthMm: Math.round(t - f) };
  };
  const at = (s: number) => map(sideFrame(side, s).p);
  if (!side.curved) {
    const A = at(sp.from);
    const B = at(sp.to);
    const AB = len(A, B);
    if (AB >= 1) {
      const dir = { x: (B.x - A.x) / AB, y: (B.y - A.y) / AB };
      const f0 = sideFrame(side, (sp.from + sp.to) / 2);
      const o0 = map(f0.p);
      const o1 = map({ x: f0.p.x + f0.n.x * 100, y: f0.p.y + f0.n.y * 100 });
      const outN = { x: (o1.x - o0.x) / 100, y: (o1.y - o0.y) / 100 };
      const fits = targets.flatMap((ns) => {
        if (ns.curved) return [];
        const a = ns.points[0];
        const u = { x: (ns.points[1].x - a.x) / (ns.L || 1), y: (ns.points[1].y - a.y) / (ns.L || 1) };
        if (Math.abs(dir.x * u.y - dir.y * u.x) > 0.02) return [];
        if (outN.x * ns.sg * u.y - outN.y * ns.sg * u.x < 0.9) return [];
        if (Math.abs((A.x - a.x) * u.y - (A.y - a.y) * u.x) > 5) return [];
        const pr = (q: Point) => (q.x - a.x) * u.x + (q.y - a.y) * u.y;
        const f = Math.max(0, Math.min(ns.L, Math.min(pr(A), pr(B))));
        const t = Math.max(0, Math.min(ns.L, Math.max(pr(A), pr(B))));
        return t - f >= 1 ? [{ ns, f, t }] : [];
      });
      if (fits.length) return fits.map((x, k) => mk(k, x.ns, x.f, x.t));
    }
  }
  const M = at((sp.from + sp.to) / 2);
  const hit = targets
    .map((ns) => ({ ns, ...alongSide(ns, M) }))
    .filter((x) => x.d <= 5)
    .sort((x, y) => x.d - y.d)[0];
  if (!hit) return [];
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
  return t - f < 1 ? [] : [mk(0, hit.ns, f, t)];
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
 *  result carries its own frame (position, rotation, unflipped): set all three.
 *
 *  EACH PART KEEPS ITS HEIGHT (2026-10-31, the user: "union stages and they will keep their own
 *  height"): given the deck lookup, parts standing at different heights make a stage at the LOWEST
 *  of them, every higher one a level of its own outline at its own height (parts at one height
 *  joined into one level) — decked, stepped, skirted and railed as itself, from the floor where it
 *  looks out at the room (levelEdgeOuter), and climbed from the base across a seam. Its stairs come
 *  with it onto the level; where they meet the base's, the two go on as one run (edgeJoints). */
export function mergeStages(parts: readonly StagePlacement[], deckOf?: DeckLookup): { stage: StageBuild; position: Point; rotation: number } | null {
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

  const roundPt = (q: Point) => ({ x: Math.round(q.x), y: Math.round(q.y) });
  const levels: StageLevel[] = parts.flatMap((p) =>
    (p.stage.levels ?? []).map((l) => ({
      ...l,
      outline: l.outline.map((q) => roundPt(inFin(p, q))),
    })),
  );

  // Heights: the lowest part is the base; every part standing higher is a level at its own height,
  // the parts at one height one level between them.
  const heightOf = (p: StagePlacement): number | undefined => (p.stage.heightMm && p.stage.heightMm > 0 ? p.stage.heightMm : deckOf ? stageHeight(p.stage, deckOf) : undefined);
  const hs = parts.map(heightOf);
  const known = hs.every((h): h is number => h !== undefined);
  const baseH = known ? Math.min(...(hs as number[])) : undefined;
  const tierOf = new Map<StagePlacement, string>();
  const raised: StageLevel[] = [];
  if (baseH !== undefined) {
    const tiers = new Map<number, StagePlacement[]>();
    parts.forEach((p, i) => {
      const h = Math.round(hs[i]!);
      if (h > baseH + 1) tiers.set(h, [...(tiers.get(h) ?? []), p]);
    });
    for (const [h, members] of tiers) {
      const own = members.map((p) => ({ p, outline: p.stage.outline.map((q) => roundPt(inFin(p, q))), smooth: p.stage.smooth }));
      const joined = own.length > 1 ? unionShapes(own.map((s) => ({ outline: s.outline, smooth: s.smooth }))) : null;
      // Parts at one height that do not make one outline stand as a level each.
      const groups = own.length === 1 ? [{ ps: [own[0].p], outline: own[0].outline, smooth: own[0].smooth }] : joined ? [{ ps: own.map((s) => s.p), outline: joined.outline, smooth: joined.smooth }] : own.map((s) => ({ ps: [s.p], outline: s.outline, smooth: s.smooth }));
      for (const g of groups) {
        const split = splitAt(g.outline, g.smooth, outline);
        const id = `lvl-${g.ps[0].id}`;
        raised.push({ id, outline: split.outline, heightMm: h, ...(split.smooth.length ? { smooth: split.smooth } : {}) });
        g.ps.forEach((p) => tierOf.set(p, id));
      }
    }
  }
  const allLevels = [...levels, ...raised];
  const tentative: StageBuild = { outline, front: fin.front, decks: [], ...(smooth ? { smooth } : {}), levels: allLevels };
  // A raised level's sides that look out at the room — where its part's own items go.
  const outerSides = new Map(raised.map((l) => [l.id, stageSides(tentative, l.id).filter((s) => s.edges.every((k) => levelEdgeOuter(tentative, l, k)))]));

  // Every base item by the stretch of its SIDE it covered — along a curve as along a straight edge —
  // onto the sides of the merged outline it stands on (homeItem); a raised part's onto its level's
  // outer sides. What stood on a seam goes, and the caller finishes what is left bare.
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
      const lv = tierOf.get(p);
      items.push(...homeItem(it, side, sp, (q) => inFin(p, q), lv ? (outerSides.get(lv) ?? []) : sidesNow, lv));
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
    ...(raised.length && baseH !== undefined ? { heightMm: baseH } : {}),
    levels: allLevels.length ? allLevels : undefined,
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
 *  axes. Two of them square to each other merge on the exact grid (unionOutline). */
const squareStage = (p: StagePlacement): boolean =>
  !p.stage.smooth?.length &&
  p.stage.outline.every((a, i) => {
    const b = p.stage.outline[(i + 1) % p.stage.outline.length];
    return Math.abs(a.x - b.x) <= 2 || Math.abs(a.y - b.y) <= 2;
  });
/** …and of those, a plain RECTANGLE: the one shape its box describes. Only rectangles are judged and
 *  pushed together by their boxes (stickBoxes); the box of an L holds its bite, the box of a T the
 *  floor either side of its catwalk, and a deck standing there was read as INSIDE the stage and
 *  thrown out past the box's far edge. */
const rectStage = (p: StagePlacement): boolean => p.stage.outline.length === 4 && squareStage(p);
/** …and two stages turned a whole number of quarter turns from each other. */
const squareTo = (a: StagePlacement, b: StagePlacement): boolean => {
  const d = ((((a.rotation || 0) - (b.rotation || 0)) % 90) + 90) % 90;
  return Math.min(d, 90 - d) < 0.5;
};

/** Do two outlines share AREA — more than a side or a corner? Two sides crossing, or a point just
 *  inside either (the middle of each of its sides, 5mm in) lying inside the other. Not
 *  polygonsOverlap: its centroid test reads a U's vertex average — which lies in the U's notch — as
 *  inside a deck standing free in that notch. */
function outlinesOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  for (let i = 0; i < a.length; i++) {
    const [p1, p2] = edgeOf(a, i);
    for (let j = 0; j < b.length; j++) {
      const [q1, q2] = edgeOf(b, j);
      const d1 = cross(q1, q2, p1);
      const d2 = cross(q1, q2, p2);
      const d3 = cross(p1, p2, q1);
      const d4 = cross(p1, p2, q2);
      const eps = len(p1, p2) * len(q1, q2) * 1e-9 + 1;
      if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) return true;
    }
  }
  const reachesInto = (p: readonly Point[], q: readonly Point[]) =>
    p.some((s, i) => {
      const e = p[(i + 1) % p.length];
      const L = len(s, e);
      if (L < 20) return false;
      const m = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
      const n = { x: (-(e.y - s.y) / L) * 5, y: ((e.x - s.x) / L) * 5 };
      const inward = insidePoly({ x: m.x + n.x, y: m.y + n.y }, p) ? { x: m.x + n.x, y: m.y + n.y } : { x: m.x - n.x, y: m.y - n.y };
      return insidePoly(inward, q) && !onBoundary(inward, q, 1);
    });
  return reachesInto(a, b) || reachesInto(b, a);
}

/** How far `b` can travel along the unit `dir` — at most `maxMm` — before it meets one of `as`;
 *  Infinity when it does not. Each one's corners are run against the other's sides, and every place
 *  a corner reaches a side is a candidate; the first one where going 2mm further would take `b`
 *  INTO one of them is the contact (a corner that only grazes the end of a side — the T's outer
 *  corner, passed along its front — is no contact at all). */
function travelAlong(as: readonly (readonly Point[])[], b: readonly Point[], dir: Point, maxMm: number): number {
  const hit = (o: Point, d: Point, s: Point, e: Point): number => {
    const ex = e.x - s.x;
    const ey = e.y - s.y;
    const den = d.x * ey - d.y * ex;
    // A side running along the travel is slid along, never met.
    if (Math.abs(den) < 1e-9 * Math.hypot(ex, ey)) return Infinity;
    const wx = s.x - o.x;
    const wy = s.y - o.y;
    const t = (wx * ey - wy * ex) / den;
    const u = (wx * d.y - wy * d.x) / den;
    return t >= -0.5 && u >= -1e-6 && u <= 1 + 1e-6 ? Math.max(0, t) : Infinity;
  };
  const back = { x: -dir.x, y: -dir.y };
  const hits: number[] = [];
  for (const a of as) {
    for (const q of b) for (let i = 0; i < a.length; i++) hits.push(hit(q, dir, ...edgeOf(a, i)));
    for (const q of a) for (let i = 0; i < b.length; i++) hits.push(hit(q, back, ...edgeOf(b, i)));
  }
  const at = (s: number) => b.map((q) => ({ x: q.x + dir.x * s, y: q.y + dir.y * s }));
  for (const t of [...new Set(hits.filter((h) => h <= maxMm).map((h) => Math.round(h * 10) / 10))].sort((x, y) => x - y)) {
    const past = at(t + 2);
    if (as.some((a) => outlinesOverlap(a, past))) return t;
  }
  return Infinity;
}

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

/** Two stages standing against each other. Two RECTANGLES square to each other: their boxes within
 *  `tolMm` in the first one's frame, overlapping along the side they meet on by STAGE_TOUCH_MM at
 *  least; two stages of square corners at different angles never are. Any other pair — an L, a T, a
 *  U (whose box holds its bite: a deck standing free in a U's notch is not against it), a curve, an
 *  angle — by their outlines: they overlap, or, pushed the last few centimetres together, share at
 *  least STAGE_TOUCH_MM of rim. A disc against a straight side touches it along one chord, which is
 *  not a side two stages share. */
function stagesTouch(a: StagePlacement, b: StagePlacement, tolMm: number): boolean {
  if (squareStage(a) && squareStage(b) && !squareTo(a, b)) return false;
  if (!rectStage(a) || !rectStage(b)) {
    const A = stageOutlineInRoom(a);
    const B = stageOutlineInRoom(b);
    if (outlinesOverlap(A, B)) return true;
    const gap = closestApproach(A, B);
    if (gap.d > tolMm) return false;
    return sharedRimMm(A, B.map((q) => ({ x: q.x + gap.move.x, y: q.y + gap.move.y }))) >= STAGE_TOUCH_MM;
  }
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
export function mergeTouching(stages: readonly StagePlacement[], opts: { deckOf?: DeckLookup; tolMm?: number } = {}): { merged: StageMerge[]; loose: StagePlacement[] } {
  const tolMm = opts.tolMm ?? STAGE_TOUCH_MM;
  const merged: StageMerge[] = [];
  const loose: StagePlacement[] = [];
  for (const cluster of touchingStages(stages, tolMm)) {
    if (cluster.length < 2) {
      loose.push(...cluster);
      continue;
    }
    const parts = pushTogether(cluster).sort((p, q) => Math.abs(signedArea(q.stage.outline)) - Math.abs(signedArea(p.stage.outline)));
    const m = mergeStages(parts, opts.deckOf);
    if (!m) loose.push(...cluster);
    else merged.push({ anchor: parts[0], others: parts.slice(1), ...m });
  }
  return { merged, loose };
}

/** Stages pushed together, ready to merge: RECTANGLES square to each other by their boxes
 *  (stickBoxes — gaps closed, edges nearly in line lined up), as "איחוד" always did; any other set
 *  — an L, a T, a U among them, whose boxes hold their bites — by their OUTLINES, one at a time onto
 *  what is already placed, largest first, each by the shortest move that puts it against them and
 *  then slid along that side into a corner it nearly fills (slideHome) — and not at all when it
 *  already overlaps or touches them (a half-round laid over the front of a stage, a deck already in
 *  an L's bite, is where the designer put it). */
export function pushTogether(parts: readonly StagePlacement[]): StagePlacement[] {
  if (parts.length < 2) return [...parts];
  if (parts.every((p) => rectStage(p) && squareTo(parts[0], p))) {
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
          return outlinesOverlap(A, B) ? { d: 0, move: { x: 0, y: 0 } } : closestApproach(A, B);
        })
        .sort((x, y) => x.d - y.d)[0];
      return { p, near };
    });
    gaps.sort((x, y) => x.near.d - y.near.d);
    const { p, near } = gaps[0];
    rest.splice(rest.indexOf(p), 1);
    const at = near.d > 0.5 ? slideHome(placed, { ...p, position: { x: Math.round(p.position.x + near.move.x), y: Math.round(p.position.y + near.move.y) } }, near.move) : p;
    if (at !== p) moved.set(p.id, at);
    placed.push(at);
  }
  return parts.map((p) => moved.get(p.id) ?? p);
}

/** A stage just pushed against `placed` along `move`, slid along the side it came to rest on to close
 *  the last STICK_ALIGN_MM of a gap to a side across the way — a deck dragged roughly into an L's
 *  bite goes into the bite, not 10cm short of its far side; what the box path does by lining up
 *  edges nearly in line. Not when it only met a corner, and never so that it shares less side than
 *  it did. */
function slideHome(placed: readonly StagePlacement[], at: StagePlacement, move: Point): StagePlacement {
  const L = Math.hypot(move.x, move.y);
  if (L < 0.5) return at;
  const A = placed.map(stageOutlineInRoom);
  const rim = (q: StagePlacement) => {
    const B = stageOutlineInRoom(q);
    return A.reduce((s, a) => s + sharedRimMm(a, B), 0);
  };
  const before = rim(at);
  if (before < 20) return at;
  const B = stageOutlineInRoom(at);
  const along = { x: -move.y / L, y: move.x / L };
  const options = [along, { x: -along.x, y: -along.y }]
    .map((dir) => ({ dir, s: travelAlong(A, B, dir, STICK_ALIGN_MM) }))
    .filter((o) => o.s > 0.5 && o.s <= STICK_ALIGN_MM)
    .sort((x, y) => x.s - y.s);
  for (const o of options) {
    const next = { ...at, position: { x: Math.round(at.position.x + o.dir.x * o.s), y: Math.round(at.position.y + o.dir.y * o.s) } };
    if (rim(next) >= before) return next;
  }
  return at;
}

/** How far הצמדה reaches: a stage more than this from every other one selected is left where it
 *  stands. A metre — under a walkway: the printed sheets flag a passage under 1.20m as tight
 *  (lib/outputs/measurements.ts), so a gap of a metre or more between two stages is a passage left
 *  on purpose, and anything under it is a gap a drag left. Without a reach a deck across the room
 *  was pulled 9m to the stage, and diagonal neighbours ended up meeting at one corner. */
export const STICK_REACH_MM = 1000;

/** הצמדה (the stage group's magnet) over a selection: what was moved, and what was left and why. */
export interface StickResult {
  /** The stages, in the order given, each where it now stands — the same object when it did not
   *  move. */
  parts: StagePlacement[];
  /** Left where they stood because no other stage selected stands at their angle (a 30° stage among
   *  square ones, a deck turned 0.6°): there is no side to butt against. */
  angled: string[];
  /** …or because no other stage at their angle stands within STICK_REACH_MM of them. */
  far: string[];
}

/** הצמדה: every gap between the selected stages closed — by ANGLE first, each set of stages square
 *  to each other stuck among themselves (a round one, which has every angle, with its nearest
 *  neighbour), then by REACH, each cluster within STICK_REACH_MM of one another pushed together as
 *  Ctrl+G pushes before it merges (pushTogether: rectangles by their boxes, anything else by its
 *  outline, what already shares a side left where it is). It used to box every stage by its
 *  outline's extent — a sheet flush on a T's front beside its catwalk was "inside" the T's box and
 *  was thrown 3m out past the catwalk's tip — and to stick only what was square to the LARGEST,
 *  so one big stage at an angle stopped everything, silently. */
export function stickTogether(stages: readonly StagePlacement[], reachMm = STICK_REACH_MM): StickResult {
  const rooms = stages.map(stageOutlineInRoom);
  const gapOf = (i: number, j: number) => (outlinesOverlap(rooms[i], rooms[j]) ? 0 : closestApproach(rooms[i], rooms[j]).d);
  const clusters = (among: number[], joined: (i: number, j: number) => boolean): number[][] => {
    const parent = new Map(among.map((i) => [i, i]));
    const find = (i: number): number => (parent.get(i) === i ? i : find(parent.get(i)!));
    for (let x = 0; x < among.length; x++)
      for (let y = x + 1; y < among.length; y++) if (joined(among[x], among[y])) parent.set(find(among[y]), find(among[x]));
    const out = new Map<number, number[]>();
    for (const i of among) out.set(find(i), [...(out.get(find(i)) ?? []), i]);
    return [...out.values()];
  };
  const all = stages.map((_, i) => i);
  const round = stages.map((p) => stageIsRound(p.stage));
  const angular = all.filter((i) => !round[i]);
  // A round stage takes the angle of the nearest stage that has one (or, among discs alone, of the
  // nearest disc).
  const angleOf = new Map<number, number>();
  for (const i of all.filter((k) => round[k])) {
    const pool = angular.length ? angular : all.filter((k) => k !== i);
    if (pool.length) angleOf.set(i, pool.reduce((best, k) => (gapOf(i, k) < gapOf(i, best) ? k : best)));
  }
  const sameAngle = (i: number, j: number) =>
    !round[i] && !round[j] ? squareTo(stages[i], stages[j]) : angleOf.get(i) === j || angleOf.get(j) === i || (angleOf.has(i) && angleOf.get(i) === angleOf.get(j));
  const moved = new Map<string, StagePlacement>();
  const angled: string[] = [];
  const far: string[] = [];
  for (const group of clusters(all, sameAngle)) {
    if (group.length < 2) {
      angled.push(stages[group[0]].id);
      continue;
    }
    for (const near of clusters(group, (i, j) => gapOf(i, j) <= reachMm)) {
      if (near.length < 2) {
        far.push(stages[near[0]].id);
        continue;
      }
      const parts = pushTogether(near.map((i) => stages[i]));
      parts.forEach((q, k) => {
        if (q !== stages[near[k]]) moved.set(q.id, q);
      });
    }
  }
  return { parts: stages.map((p) => moved.get(p.id) ?? p), angled, far };
}
