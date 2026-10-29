// Filling an area of the plan with stage decks — "draw where the stage goes, get the decks".
//
// A stage is built from the decks the studio owns (244×122 and its strips, 200×100…), and working out how
// many of which to lay across a 7.5×4m area is arithmetic nobody should do by hand at a meeting. The
// designer draws the area, says which side faces the room, and this lays the decks.
//
// THE METHOD, and why it is this one. Greedy row-by-row fill on a grid, from the FRONT:
//
//   1. The FRONT edge — the side the audience sees — becomes the x axis, with y running back into
//      the stage. Rows are laid from the front, so whatever an area does not divide into lands at
//      the BACK, against the wall or the backdrop, never along the edge everyone looks at. A row
//      that leaves slack at its ends is centred, so a gap is two equal ones and not one lopsided one.
//   2. The decks are split into FAMILIES — decks that share a module of 10cm or more (200×100 and
//      100×100 do; 200×100 and 122×244 share 2cm and do not), or a side of exactly the same length
//      (the 244×40/60/80 strips that finish a row of 244×122 sheets). One stage is built from one family:
//      a crew does not clamp a metric deck to an imperial one. Each family is tried, and each deck
//      on its own, and the layout that covers most with fewest decks wins — which also rescues the
//      cases where largest-first picks the wrong big deck.
//   3. A grid is laid at the family's module, and cells are visited row by row. At the first free
//      cell the largest deck that fits from there is laid, long side ALONG the front where it fits
//      that way — every deck of a platform facing the same way is what a crew does — and turned
//      only where it does not, which is how a narrow catwalk ends up decked along its length.
//   4. A TOLERANCE (5cm by default): corners snap to walls, and walls are never a whole number of
//      metres apart. An area 10mm short of four rows of decks is four rows of decks — without this,
//      the commonest stage of all, wall to wall, lost a whole row.
//   5. EXCEEDING THE LINE, when asked (`exceed`): a deck may reach past the drawn edge where it
//      covers more of the drawn floor than it hangs over — its centre on the floor is the test. A
//      6.90m front is then seven metres of deck with 10cm over the line, rather than six metres and
//      a 90cm bare strip; a 6.30m front still gets six, because a metre of deck hanging 70cm out to
//      cover 30cm is not better than the strip. The designer chooses; the line is the line by default.
//
// Largest-first is what a crew does, and it is what keeps the count of decks low — fewer joins, fewer
// legs. It is not an optimal packing (that is NP-hard, and a meeting does not wait for one). When a
// RECTANGLE does not divide into the decks, the gap is not left for the designer to discover: the
// nearest smaller and larger sizes that DO divide are offered instead (`suggestions`).
//
// THE FRONT LINE IS WHERE THE ROWS START. The rows behind the front are laid from the front edge
// itself — not from whatever sticks out furthest in front of it. Anything that DOES stand in front of
// the line (a catwalk, an apron) is laid on its own, from its own far end back to the line, so its
// leftover lands against the body of the stage. Counting the body's rows from the tip of a half-round
// in front of it was how a stage got a column of strips along its front and a hole in its middle.
//
// CURVES AND ANGLED SIDES ARE BUILT OF PIECES, NOT CHASED WITH STRIPS (./stage-rim.ts). Where the
// outline curves or runs at an angle to the rows, the decks are laid in the rectilinear CORE that is
// left when each such run is replaced by the two legs of a right angle, and the RIM between them and
// the line is cut into pieces: a quarter-round, a half-round, a triangle, a deck with a curved side.
// A piece the studio owns (`pieces`, any non-rectangular stage deck) is stood where it fits; one it
// does not own is MISSING — listed with its outline so the panel can offer to add it to the catalog —
// and is never faked with a cut sheet. Each run may instead take the OUTER corner (the core reaches
// past the line, and the decks there that overhang it become curved-deck pieces of their own), and
// the build kept is the one with the fewest bare holes, then the fewest DIFFERENT new pieces, then
// the fewest new pieces, then the fewest decks — tried run-group by run-group, not exhaustively.
//
// Pure, no DOM, self-checked: `npm run check:stage-fill`.
import type { Point } from "@/lib/design-document/types";
import { boxOf, clipToBox, clipY, congruent, coreOutline, curveTest, describePiece, distToBoundary, inside, isRectangle, normal, polyArea, rimSegments, runRegion, signedArea, turned, type Box, type Normal, type PieceInfo, type RimRun, type RimSegment, type Turn } from "./stage-rim";
import { isMain } from "../self-check";

export { signedArea };

export interface DeckType {
  id: string;
  widthMm: number;
  depthMm: number;
  /** Two decks of different heights are not one platform. Absent = no opinion. */
  heightMm?: number;
  /** A round (or oval) platform: one piece, never laid by this fill — a round stage built of
   *  exactly that piece stands on it whole (lib/design-document/stage.ts layStage). */
  round?: boolean;
  /** Any other platform that is not a rectangle — a half-round, a triangle, a deck with a curved
   *  side — as its outline about its own centre: never laid in rows, but stood whole where the rim of
   *  a stage is its shape (`FillOptions.pieces`), or where a stage is built of it (StageBuild.pieces). */
  outline?: Point[];
  /** A QUARTER-ROUND piece — a corner platform — and its radius. Carries `outline` too. */
  quarterMm?: number;
}

export interface LaidDeck {
  typeId: string;
  /** World centre. */
  centre: Point;
  /** World facing, degrees: the deck's width runs along this direction. */
  rotation: number;
  widthMm: number;
  depthMm: number;
  /** A whole piece's own outline, where it stands. In the same frame as `centre`. */
  outline?: Point[];
  /** …flipped across its own width before it was turned (StagePiece.mirrored). */
  mirrored?: boolean;
}

/** A piece of the rim no deck the stage may use can be: its outline where it goes (in the same
 *  frame as the decks), and what it is. Pieces of one shape — turned or flipped — share `shape` and
 *  one `info`, which describes it the way a catalog row would draw it (stage-rim.ts describePiece). */
export interface MissingPiece {
  outline: Point[];
  shape: string;
  info: PieceInfo;
}

/** A rectangle that the chosen decks cover exactly, near the one drawn. */
export interface SizeSuggestion {
  direction: "smaller" | "larger";
  /** Along the front. */
  widthMm: number;
  /** Front to back. */
  depthMm: number;
  decks: number;
}

export interface FillResult {
  decks: LaidDeck[];
  /** How much of the drawn area the decks cover, 0..1. */
  coverage: number;
  areaMm2: number;
  /** The edge the rows were laid from: edge i runs polygon[i] → polygon[i+1]. */
  front: number;
  /** The drawn area as a rectangle, when it is one — the sizes below are measured against it. */
  rect: { widthMm: number; depthMm: number } | null;
  /** Rectangles the decks would cover exactly, when this one they do not. Empty otherwise. */
  suggestions: SizeSuggestion[];
  /** The rim pieces the stage needs and the studio does not have (see the header). */
  missing: MissingPiece[];
}

export interface FillOptions {
  /** Which edge faces the room. Absent = the longest edge (see defaultFront for a better guess). */
  front?: number;
  /** Stages already standing in the area — the venue's own staging, hired decks — laid around. */
  obstacles?: readonly (readonly Point[])[];
  /** How far a deck may overhang the drawn line. Default 50mm. */
  toleranceMm?: number;
  /** A second outline every deck must ALSO stay inside — a raised level is laid within its own
   *  outline and within the stage it stands on, whatever was drawn past the stage's edge. */
  within?: readonly Point[];
  /** Let a deck reach past the drawn line where that beats the bare strip it would otherwise leave
   *  — see point 5 in the header. Never past `within`: a level stays on its stage. */
  exceed?: boolean;
  /** The outline is a CURVE (a disc, a half-round): try the rows at several offsets from its front
   *  and keep the one that covers most. A straight front lays its first row ON the front; a curve's
   *  front is a point, and rows counted from it in whole deck depths can miss the stage entirely —
   *  a 4m disc of 244×122 sheets laid one sheet where three fit. */
  phases?: boolean;
  /** The line the rows run ALONG, when it is not edge `front` itself: a CURVED front (a bowed stage,
   *  a half-round facing out from its arc) is many short chords, and the first of them points the
   *  way the curve happens to leave its end — rows laid along that are rows laid askew. Its
   *  end-to-end chord is the line the stage is really built along. The rows still start at the
   *  front: the grid begins at the outline's foremost point. */
  axis?: readonly [Point, Point];
  /** The corners the outline's curves run THROUGH (StageBuild.smooth), by index — one curve is one
   *  stretch of rim, even where one of its chords happens to lie along the rows. */
  smooth?: readonly number[];
  /** Pieces that are not rectangles the stage may stand on its rim — a quarter-round, a curved deck,
   *  a triangle (DeckType.outline / round). A shaped type among `types` counts as one too. */
  pieces?: readonly DeckType[];
}

export const STAGE_TOLERANCE_MM = 50;
/** Two builds whose cover differs by less than a strip this deep along the whole front cover the same
 *  stage — fewer decks decides (see bestParts). */
const COVER_SLACK_MM = 100;

/** Above this many cells the grid is coarsened — a 30×20m area at a 10mm grid would be 6M cells,
 *  which is a frozen tab. */
const MAX_CELLS = 400_000;
/** Two decks share a family when every measurement of both is a multiple of this or more. */
const FAMILY_MODULE_MM = 100;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const r10 = (mm: number) => Math.round(mm / 10) * 10;
/** A deck the fill lays in rows — not a shaped piece. */
const isRectDeck = (t: DeckType) => t.widthMm > 0 && t.depthMm > 0 && !t.round && !t.outline;

function longestEdge(poly: readonly Point[]): number {
  let best = 0;
  let len = -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > len + 1e-6) {
      len = l;
      best = i;
    }
  }
  return best;
}

/** The frame a fill works in: x along the front edge (or the `axis` given instead of it), y running
 *  back into the stage. */
function frameOf(polygon: readonly Point[], front: number, axis?: readonly [Point, Point]) {
  const a = axis ? axis[0] : polygon[front];
  const b = axis ? axis[1] : polygon[(front + 1) % polygon.length];
  const theta = Math.atan2(b.y - a.y, b.x - a.x);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // Which side of a→b the stage is on: the left normal for a positively wound outline.
  const s = signedArea(polygon) >= 0 ? 1 : -1;
  const toLocal = (p: Point): Point => {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return { x: dx * cos + dy * sin, y: s * (-dx * sin + dy * cos) };
  };
  const toWorld = (p: Point): Point => ({ x: a.x + p.x * cos - s * p.y * sin, y: a.y + p.x * sin + s * p.y * cos });
  return { theta, s, toLocal, toWorld };
}

/** A four-cornered outline with square corners, measured from `front`. */
export function asRect(polygon: readonly Point[], front: number): { widthMm: number; depthMm: number } | null {
  if (polygon.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % 4];
    const c = polygon[(i + 2) % 4];
    const u = { x: b.x - a.x, y: b.y - a.y };
    const v = { x: c.x - b.x, y: c.y - b.y };
    const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
    if (Math.abs(cos) > 0.01) return null; // more than about half a degree off square
  }
  const e = (i: number) => {
    const a = polygon[i % 4];
    const b = polygon[(i + 1) % 4];
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  return { widthMm: e(front), depthMm: e(front + 1) };
}

/** Decks that can be one platform: same height, and either a shared module of FAMILY_MODULE_MM or
 *  more, or one side EXACTLY the same length — a 244×40 strip shares no 10cm module with the 244×122
 *  sheet, but it is cut to the sheet's own 244cm to finish the depth of a row of them, which is what
 *  it is for. A 200×100 and a 122×244 share neither, and stay apart. */
export function families(types: readonly DeckType[]): DeckType[][] {
  const out: DeckType[][] = [];
  const sameSide = (o: DeckType, t: DeckType) =>
    [o.widthMm, o.depthMm].map(r10).some((s) => s === r10(t.widthMm) || s === r10(t.depthMm));
  for (const t of types) {
    const home = out.find((f) =>
      f.every(
        (o) =>
          (o.heightMm ?? 0) === (t.heightMm ?? 0) &&
          ([o.widthMm, o.depthMm, t.widthMm, t.depthMm].map(r10).reduce((g, d) => gcd(g, d)) >= FAMILY_MODULE_MM || sameSide(o, t)),
      ),
    );
    if (home) home.push(t);
    else out.push([t]);
  }
  return out;
}

interface Laid {
  decks: LaidDeck[];
  covered: number;
  turned: number;
  /** The decks as boxes in the fill's own frame (x along the front, y back) — what the rim is cut
   *  against (see the rim, below). */
  boxes: { x: number; y: number; w: number; d: number }[];
}

/** Which cells of a grid have their centre inside `poly` — the same even-odd rule as `inside`, with
 *  the crossings worked out once per ROW instead of once per cell. A cell centre is inside exactly
 *  when it lies in [x₀, x₁), [x₂, x₃), … of its row's sorted crossings, which is what counting the
 *  crossings beyond it comes to. */
function insideCells(poly: readonly Point[], minX: number, minY: number, step: number, nx: number, ny: number): Uint8Array {
  const out = new Uint8Array(nx * ny);
  const xs: number[] = [];
  for (let j = 0; j < ny; j++) {
    const y = minY + (j + 0.5) * step;
    xs.length = 0;
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const a = poly[i];
      const b = poly[k];
      // Spelled exactly as `inside` spells it, so a centre on a crossing falls the same way.
      if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // Centres cx = minX + (i + .5)·step with xs[k] <= cx < xs[k+1].
      let i = Math.max(0, Math.ceil((xs[k] - minX) / step - 0.5) - 1);
      while (i < nx && minX + (i + 0.5) * step < xs[k]) i++;
      for (; i < nx && minX + (i + 0.5) * step < xs[k + 1]; i++) out[j * nx + i] = 1;
    }
  }
  return out;
}

/** The distance from each cell centre to `poly`'s boundary, worked out only for the cells within
 *  `band` of some edge (the rest are Infinity): every comparison against a distance up to `band`
 *  comes out exactly as distToBoundary's does, at a fraction of the cost. */
function edgeDistances(poly: readonly Point[], minX: number, minY: number, step: number, nx: number, ny: number, band: number): Float64Array {
  const out = new Float64Array(nx * ny).fill(Infinity);
  for (let e = 0; e < poly.length; e++) {
    const a = poly[e];
    const b = poly[(e + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - band - minX) / step - 0.5));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + band - minX) / step - 0.5));
    const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - band - minY) / step - 0.5));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + band - minY) / step - 0.5));
    for (let j = j0; j <= j1; j++) {
      const py = minY + (j + 0.5) * step;
      for (let i = i0; i <= i1; i++) {
        const px = minX + (i + 0.5) * step;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
        const d = Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
        if (d < out[j * nx + i]) out[j * nx + i] = d;
      }
    }
  }
  return out;
}

/** A summed-area table over a 0/1 mask: how many cells of any box are set, in four reads. */
function summed(mask: Uint8Array, nx: number, ny: number, want: (v: number) => boolean): Int32Array {
  const s = new Int32Array((nx + 1) * (ny + 1));
  for (let j = 0; j < ny; j++) {
    let row = 0;
    for (let i = 0; i < nx; i++) {
      if (want(mask[j * nx + i])) row++;
      s[(j + 1) * (nx + 1) + i + 1] = s[j * (nx + 1) + i + 1] + row;
    }
  }
  return s;
}
const boxSum = (s: Int32Array, nx: number, i: number, j: number, w: number, h: number) =>
  s[(j + h) * (nx + 1) + i + w] - s[j * (nx + 1) + i + w] - s[(j + h) * (nx + 1) + i] + s[j * (nx + 1) + i];

/** The cells of one grid classified for laying — the same for every family laid at that step, so a
 *  fill trying several families classifies each grid once. */
type CellCache = Map<string, Uint8Array>;

/** One family, one frame: the greedy row fill. */
function lay(
  local: readonly Point[],
  blocks: readonly (readonly Point[])[],
  types: readonly DeckType[],
  tol: number,
  frame: ReturnType<typeof frameOf>,
  bound: readonly Point[] | null = null,
  exceed = false,
  /** Where the grid starts, back from the outline's own corner — see FillOptions.phases. */
  offset: Point = { x: 0, y: 0 },
  cache?: CellCache,
  /** Every deck long side along the front — none turned (a curved apron's rows). */
  oneWay = false,
): Laid {
  const minX = Math.min(...local.map((p) => p.x)) - offset.x;
  const maxX = Math.max(...local.map((p) => p.x));
  const minY = Math.min(...local.map((p) => p.y)) - offset.y;
  const maxY = Math.max(...local.map((p) => p.y));
  // How far past the line a deck may reach when exceeding: half the largest deck, which is where a
  // deck would be exactly as much outside as in. The grid is extended that far at the far ends
  // (rows run from the front and from one end, so the overhang lands at the back and is then split
  // between the two ends by the centring below), and the decision per deck is its CENTRE: on the
  // drawn floor, it is laid; past the line, the strip stays bare. `bound` is never exceeded.
  const reach = exceed && types.length ? Math.max(...types.map((t) => Math.max(t.widthMm, t.depthMm))) / 2 : 0;
  const inOne = (p: Point, poly: readonly Point[], t: number) => inside(p, poly) || distToBoundary(p, poly) <= t;
  const near = (p: Point) => inOne(p, local, tol + reach) && (!bound || inOne(p, bound, tol));

  const dims = types.flatMap((t) => [r10(t.widthMm), r10(t.depthMm)]);
  let step = Math.max(10, dims.reduce((g, d) => gcd(g, d)));
  const tooMany = (s: number) => ((maxX - minX + tol + reach) / s) * ((maxY - minY + tol + reach) / s) > MAX_CELLS;
  if (tooMany(step)) {
    // Coarsened, the grid goes to a step the MAIN deck divides into exactly — a 244×122 sheet's 61mm
    // (1220 = 20 × 61), not 40mm: at 40 every sheet took 1240mm, eleven rows lost 22cm, and the
    // strip that should have finished the back no longer fitted (a 28×14m area went to 400 strips
    // of 244×40). Only the strips round up, by a few mm, inside the tolerance.
    const main = types.reduce((a, b) => (b.widthMm * b.depthMm > a.widthMm * a.depthMm ? b : a));
    const g = gcd(r10(main.widthMm), r10(main.depthMm));
    const exact = Array.from({ length: g }, (_, k) => k + 1).filter((d) => g % d === 0 && d >= step && !tooMany(d))[0];
    if (exact) step = exact;
    else while (tooMany(step)) step *= 2;
  }
  const nx = Math.max(1, Math.floor((maxX - minX + tol + reach) / step + 1e-6));
  const ny = Math.max(1, Math.floor((maxY - minY + tol + reach) / step + 1e-6));
  // 1 = a cell of the drawn area; 2 = a cell past its edge a deck may still reach into (exceeding
  // only — without it there are none); 0 = not for laying on. A cell is the drawn area's when its
  // centre is inside the outline or within the tolerance of its line (and of `bound`'s).
  const key = `${step}|${offset.x}|${offset.y}|${reach}`;
  let free = cache?.get(key);
  if (!free) {
    free = new Uint8Array(nx * ny);
    const inLocal = insideCells(local, minX, minY, step, nx, ny);
    const dLocal = edgeDistances(local, minX, minY, step, nx, ny, tol + reach);
    const inBound = bound ? insideCells(bound, minX, minY, step, nx, ny) : null;
    const dBound = bound ? edgeDistances(bound, minX, minY, step, nx, ny, tol) : null;
    const inBlocks = blocks.map((b) => insideCells(b, minX, minY, step, nx, ny));
    for (let c = 0; c < nx * ny; c++) {
      if (inBlocks.some((b) => b[c])) continue;
      if (inBound && !inBound[c] && !(dBound![c] <= tol)) continue;
      free[c] = inLocal[c] || dLocal[c] <= tol ? 1 : dLocal[c] <= tol + reach ? 2 : 0;
    }
    cache?.set(key, free);
  }
  const allowed = summed(free, nx, ny, (v) => v !== 0);
  const drawn = summed(free, nx, ny, (v) => v === 1);
  const taken = new Uint8Array(nx * ny);

  // Largest first; long side along the front before across it. `turned` = the deck's own DEPTH runs
  // along the front (how its rotation comes out); `across` = its LONG side runs front to back (what
  // a crew would rather not do). A coarsened grid rounds a deck UP to whole cells, which leaves a
  // hairline between two decks rather than laying one over the other.
  const cells = (mm: number) => Math.max(1, Math.ceil(r10(mm) / step - 1e-9));
  const shapes = types
    .flatMap((t) => {
      const orient = (turned: boolean) => {
        const w = turned ? t.depthMm : t.widthMm;
        const d = turned ? t.widthMm : t.depthMm;
        return { type: t, turned, across: d > w, w, d, cw: cells(w), ch: cells(d) };
      };
      return t.widthMm === t.depthMm || oneWay ? [orient(t.depthMm > t.widthMm)] : [orient(false), orient(true)];
    })
    .sort((a, b) => b.type.widthMm * b.type.depthMm - a.type.widthMm * a.type.depthMm || Number(a.across) - Number(b.across));

  /** A deck's own footprint at a spot: cell centres say "mostly inside"; the deck's corners must be
   *  inside too (to within the tolerance, or within reach when exceeding), or a deck would hang
   *  over a slanted edge by up to half a cell — and, exceeding, its centre must be on the floor
   *  PROPERLY: inside the line by more than the tolerance, not merely on it. A deck whose middle
   *  sits on the line is half out, and half out is not better than the strip. */
  const onFloor = (p: Point) => inside(p, local) && distToBoundary(p, local) > tol;
  const footprintOk = (x0: number, y0: number, w: number, d: number) =>
    [
      { x: x0 + 1, y: y0 + 1 },
      { x: x0 + w - 1, y: y0 + 1 },
      { x: x0 + w - 1, y: y0 + d - 1 },
      { x: x0 + 1, y: y0 + d - 1 },
    ].every(near) && (!exceed || onFloor({ x: x0 + w / 2, y: y0 + d / 2 }));

  // A spot is free for a deck when every cell under it may be laid on and none is taken: the first
  // from the summed-area table, the second against the decks laid so far (a few dozen at most).
  const placed: { i: number; j: number; w: number; h: number }[] = [];
  const fits = (i: number, j: number, sh: (typeof shapes)[number]) => {
    if (i + sh.cw > nx || j + sh.ch > ny) return false;
    if (boxSum(allowed, nx, i, j, sh.cw, sh.ch) !== sh.cw * sh.ch) return false;
    if (placed.some((p) => i < p.i + p.w && p.i < i + sh.cw && j < p.j + p.h && p.j < j + sh.ch)) return false;
    return footprintOk(minX + i * step, minY + j * step, sh.w, sh.d);
  };

  // WHICH deck at a free cell: the largest that fits, as a crew lays — except in the last stretch of
  // a column, under two of the main deck's depth from the back, where the strip chosen is the one
  // whose best finish covers most of what is left. Largest-first alone put an 80cm strip behind four
  // rows of sheets in a 6m depth and left 32cm no strip fits, where 60 + 40 leave 12. A smaller deck
  // is taken there only when it covers COVER_SLACK_MM more; `fin[r]` is the most r cells of depth the
  // rows along the front can cover.
  const rows = shapes.filter((sh) => !sh.across);
  const mainCh = rows.length ? Math.max(...rows.map((sh) => sh.ch)) : 0;
  const depthsInCells = [...new Set(rows.map((sh) => sh.ch))];
  const fin: number[] = [0];
  const finish = (r: number) => {
    while (fin.length <= r) {
      const k = fin.length;
      fin.push(Math.max(0, ...depthsInCells.filter((d) => d <= k).map((d) => d + fin[k - d])));
    }
    return fin[r];
  };
  const room = (i: number, j: number) => {
    let k = j;
    while (k < ny && free[k * nx + i] && !taken[k * nx + i]) k++;
    return k - j;
  };
  const boxes: { x: number; y: number; w: number; d: number; type: DeckType; turned: boolean; across: boolean; frac: number }[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (!free[j * nx + i] || taken[j * nx + i]) continue;
      let s = shapes.find((sh) => fits(i, j, sh));
      if (!s) continue;
      if (!s.across) {
        const r = room(i, j);
        if (r < 2 * mainCh) {
          const value = (sh: (typeof shapes)[number]) => Math.min(r, sh.ch) + finish(Math.max(0, r - sh.ch));
          let sv = value(s);
          for (const sh of rows)
            if (sh !== s && sh.ch < s.ch && fits(i, j, sh)) {
              const v = value(sh);
              if ((v - sv) * step > COVER_SLACK_MM) {
                s = sh;
                sv = v;
              }
            }
        }
      }
      // How much of the deck is on the drawn floor — what it COVERS, as against what it hangs over.
      const on = boxSum(drawn, nx, i, j, s.cw, s.ch);
      placed.push({ i, j, w: s.cw, h: s.ch });
      for (let y = j; y < j + s.ch; y++) taken.fill(1, y * nx + i, y * nx + i + s.cw);
      boxes.push({ x: minX + i * step, y: minY + j * step, w: s.w, d: s.d, type: s.type, turned: s.turned, across: s.across, frac: on / (s.cw * s.ch) });
    }

  // Centre along the front: the slack at the two ends of the layout, split evenly — when every deck
  // still fits after the shift (an L or an obstacle may say no, and then it stays put).
  if (boxes.length > 0 && blocks.length === 0) {
    const lo = Math.min(...boxes.map((b) => b.x));
    const hi = Math.max(...boxes.map((b) => b.x + b.w));
    const shift = (maxX - hi - (lo - (minX + offset.x))) / 2;
    if (Math.abs(shift) > 1) {
      const ok = boxes.every((b) => footprintOk(b.x + shift, b.y, b.w, b.d));
      if (ok) for (const b of boxes) b.x += shift;
    }
  }

  // A ROW whose two ends both meet a curve or a slant — a half-round's rows, a trapezoid's — is
  // centred in its own span, so the pieces at its ends come out the same on both sides. A row with
  // a square end stays flush against it.
  const rowsAt = new Map<number, typeof boxes>();
  for (const b of boxes) rowsAt.set(b.y, [...(rowsAt.get(b.y) ?? []), b]);
  for (const row of rowsAt.values()) {
    const d = Math.min(...row.map((b) => b.d));
    const lo = Math.min(...row.map((b) => b.x));
    const hi = Math.max(...row.map((b) => b.x + b.w));
    // How far along the row, from x, the line is at height y — the nearest crossing that way.
    const reach = (x: number, y: number, dir: 1 | -1) => {
      let best = Infinity;
      for (let i = 0; i < local.length; i++) {
        const a = local[i];
        const b = local[(i + 1) % local.length];
        if (a.y > y === b.y > y) continue;
        const along = (a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y) - x) * dir;
        if (along >= -tol && along < best) best = along;
      }
      return best;
    };
    // An end on a curve or a slant: the line meets it at one corner and falls away along it — not
    // all along like a square end, and not a deck or open floor away.
    const onSlant = (x: number, dir: 1 | -1) => {
      const r = [0.02, 0.5, 0.98].map((f) => reach(x, row[0].y + f * d, dir));
      return Math.min(...r) <= tol + 10 && Math.max(...r) - Math.min(...r) > tol;
    };
    if (!onSlant(lo, -1) || !onSlant(hi, 1)) continue;
    const others = boxes.filter((b) => !row.includes(b));
    const clear = (b: (typeof boxes)[number], dx: number) =>
      footprintOk(b.x + dx, b.y, b.w, b.d) &&
      !blocks.some((bl) => [0.02, 0.5, 0.98].some((fx) => [0.02, 0.5, 0.98].some((fy) => inside({ x: b.x + dx + fx * b.w, y: b.y + fy * b.d }, bl)))) &&
      others.every((o) => b.x + dx >= o.x + o.w - 1 || o.x >= b.x + dx + b.w - 1 || b.y >= o.y + o.d - 1 || o.y >= b.y + b.d - 1);
    const ok = (dx: number) => row.every((b) => clear(b, dx));
    let right = 0;
    while (right < 4000 && ok(right + 10)) right += 10;
    let left = 0;
    while (left < 4000 && ok(-(left + 10))) left += 10;
    const dx = Math.round((right - left) / 20) * 10;
    if (Math.abs(dx) >= 10) for (const b of row) b.x += dx;
  }

  const baseDeg = (frame.theta * 180) / Math.PI;
  const decks = boxes.map((b) => {
    const c = frame.toWorld({ x: b.x + b.w / 2, y: b.y + b.d / 2 });
    // A deck's own width runs along its rotation: along the front unless it was turned.
    const deg = baseDeg + (b.turned ? 90 : 0);
    return {
      typeId: b.type.id,
      centre: { x: Math.round(c.x), y: Math.round(c.y) },
      rotation: Math.round((((deg % 360) + 360) % 360) * 100) / 100,
      widthMm: b.type.widthMm,
      depthMm: b.type.depthMm,
    };
  });
  return {
    decks,
    covered: boxes.reduce((s, b) => s + b.w * b.d * b.frac, 0),
    turned: boxes.filter((b) => b.across).length,
    boxes: boxes.map(({ x, y, w, d }) => ({ x, y, w, d })),
  };
}

/** The best layout over every family and every deck alone: most covered, then fewest decks, then
 *  fewest turned. Coverage is compared with a SLACK of a COVER_SLACK_MM strip the length of the
 *  front: two builds that differ by less than a 10cm strip cover the same stage, and the one with
 *  fewer decks wins. Compared to the half-percent instead, an 8.01m deep band went to 114 strips of
 *  244×80 (ten rows, 8.00m) over six rows of sheets and one strip (7.92m) — a 9cm gap at the back no
 *  crew would trade forty more decks for. Several PARTS (behind the front line and in front of it)
 *  are laid with one family between them — one stage, one system of decks — each from its own
 *  first row. */
function bestParts(
  parts: readonly (readonly Point[])[],
  blocks: readonly (readonly Point[])[],
  types: readonly DeckType[],
  tol: number,
  frame: ReturnType<typeof frameOf>,
  areaMm2: number,
  bound: readonly Point[] | null = null,
  exceed = false,
  phases = false,
  /** The stage's own outline, when `parts` are a core cut from it — whether a part's tip is square is
   *  read off the line, not off the core's corners (fromLine). */
  outline?: readonly Point[],
): Laid {
  const fams = families(types);
  // Each deck alone too — but not a STRIP of a bigger deck in its own family (244×40 beside the
  // 244×122): the family already lays it where it finishes a row, and a stage of strips alone is
  // never what the crew builds (nor, with the slack, the build that wins). Half the work on a big area.
  const strip = (t: DeckType) =>
    fams.some((f) => f.includes(t) && f.some((o) => o !== t && Math.max(o.widthMm, o.depthMm) === Math.max(t.widthMm, t.depthMm) && Math.min(o.widthMm, o.depthMm) > Math.min(t.widthMm, t.depthMm)));
  // …and not a SMALL piece (under a third of the largest deck — a 40×122 step, an 80×122 riser)
  // either: on an irregular area it hugs the line closer than any sheet and wins on cover, and a
  // stage of three hundred step pieces is not a stage. It still finishes the rows of its family.
  const largest = Math.max(...types.map((t) => t.widthMm * t.depthMm));
  const small = (t: DeckType) => t.widthMm * t.depthMm * 3 < largest;
  const candidates = [...fams, ...types.filter((t) => types.length > 1 && !strip(t) && !small(t)).map((t) => [t])].filter(
    (c, i, all) => all.findIndex((o) => o.length === c.length && o.every((t, k) => t.id === c[k].id)) === i,
  );
  let winner: (Laid & { judged: number }) | null = null;
  const xs = parts.flatMap((p) => p.map((q) => q.x));
  const slack = COVER_SLACK_MM * (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
  // ponytail: a tolerance, so not transitive — fine for keeping a running best over a dozen builds.
  // `judged` is the cover that counts: a curved tip's part (fromLine) is left out of it when the rim
  // is being built, because what its decks do not reach is a piece there, not bare floor.
  type Judged = Laid & { judged: number };
  const beats = (l: Judged, w: Judged) =>
    Math.abs(l.judged - w.judged) > slack ? l.judged > w.judged : l.decks.length !== w.decks.length ? l.decks.length < w.decks.length : l.turned !== w.turned ? l.turned < w.turned : l.judged > w.judged + 1;
  const caches = parts.map((): CellCache => new Map());
  for (const c of candidates) {
    // A curve tries its rows at a few offsets within one grid step, when the step is coarse (a family
    // of one deck size steps a whole deck at a time); a fine step already finds every row.
    const step = Math.max(10, c.flatMap((t) => [r10(t.widthMm), r10(t.depthMm)]).reduce((g, d) => gcd(g, d)));
    const k = phases && step >= 200 ? Math.min(6, Math.floor(step / 100)) : 1;
    for (let oy = 0; oy < k; oy++)
      for (let ox = 0; ox < k; ox++) {
        const each = parts.map((part, p) => {
          const at = { x: (ox * step) / k, y: (oy * step) / k };
          if (!fromLine(outline ? clipToBox(outline, boxOf(part)) : part)) {
            const l = lay(part, blocks, c, tol, frame, bound, exceed, at, caches[p]);
            return { ...l, judged: l.covered };
          }
          // Laid as its own mirror image, so its rows start at the line and end at the tip — and of the
          // family's LARGEST deck only: the curve beyond its rows is pieces, and strips stair-stepped
          // up a curve are exactly what a crew does not lay.
          const flip = (q: Point) => ({ x: q.x, y: -q.y });
          const mirror = { ...frame, toWorld: (q: Point) => frame.toWorld(flip(q)) };
          const largest = [...c].sort((a, b) => b.widthMm * b.depthMm - a.widthMm * a.depthMm).slice(0, 1);
          // One deck size steps a whole deck at a time: the rows are tried at a few offsets across
          // (never back from the line), or a row of three where three fit comes out two.
          const grid = Math.max(10, gcd(r10(largest[0].widthMm), r10(largest[0].depthMm)));
          const tries = Math.max(1, Math.min(6, Math.floor(grid / 100)));
          let l: Laid | null = null;
          for (let t = 0; t < tries; t++) {
            const o = lay(part.map(flip), blocks.map((b) => b.map(flip)), largest, tol, mirror, bound?.map(flip) ?? null, exceed, { x: at.x + (t * grid) / tries, y: at.y }, caches[p], true);
            if (!l || o.covered > l.covered + 1 || (Math.abs(o.covered - l.covered) <= 1 && o.decks.length < l.decks.length)) l = o;
          }
          return { ...l!, boxes: l!.boxes.map((b) => ({ ...b, y: -(b.y + b.d) })), judged: outline ? 0 : l!.covered };
        });
        const l = {
          decks: each.flatMap((e) => e.decks),
          covered: each.reduce((s, e) => s + e.covered, 0),
          judged: each.reduce((s, e) => s + e.judged, 0),
          turned: each.reduce((s, e) => s + e.turned, 0),
          boxes: each.flatMap((e) => e.boxes),
        };
        if (!winner || beats(l, winner)) winner = l;
      }
  }
  if (!winner) return { decks: [], covered: 0, turned: 0, boxes: [] };
  const { judged: _, ...laid } = winner;
  return laid;
}

function best(
  local: readonly Point[],
  blocks: readonly (readonly Point[])[],
  types: readonly DeckType[],
  tol: number,
  frame: ReturnType<typeof frameOf>,
  areaMm2: number,
): Laid {
  return bestParts([local], blocks, types, tol, frame, areaMm2);
}

/** The outline in the fill's frame, split at the front line (y = 0): the part behind it, laid from
 *  the line back, and the part in front of it (a catwalk, an apron), laid from its own far end back
 *  to the line — see the header. One part when nothing stands in front. */
function frontParts(local: readonly Point[]): Point[][] {
  if (!local.some((p) => p.y < -1)) return [[...local]];
  return [clipY(local, 0, true), clipY(local, 0, false)].filter((p) => polyArea(p) > 1);
}

/** A part in front of the line whose far end is not a square edge (a half-round, a point) is laid FROM
 *  the line: its tip is curved or angled anyway, and taking the leftover there leaves no strip of
 *  bare floor between it and the body. A catwalk's square tip keeps its decks (see frontParts). */
function fromLine(part: readonly Point[]): boolean {
  if (part.some((p) => p.y > 1)) return false;
  const tip = Math.min(...part.map((p) => p.y));
  let flat = 0;
  for (let i = 0; i < part.length; i++) {
    const a = part[i];
    const b = part[(i + 1) % part.length];
    if (Math.abs(a.y - tip) <= 2 && Math.abs(b.y - tip) <= 2) flat += Math.abs(b.x - a.x);
  }
  return flat < 400;
}

/** Lay decks of the given types across `polygon`. */
export function fillWithDecks(polygon: readonly Point[], types: readonly DeckType[], opts: FillOptions = {}): FillResult {
  const areaMm2 = Math.abs(signedArea(polygon));
  const usable = types.filter(isRectDeck);
  const owned = [...(opts.pieces ?? []), ...types.filter((t) => !isRectDeck(t) && t.widthMm > 0 && t.depthMm > 0)];
  const front = opts.front !== undefined && opts.front >= 0 && opts.front < polygon.length ? opts.front : longestEdge(polygon);
  const empty: FillResult = { decks: [], coverage: 0, areaMm2, front, rect: null, suggestions: [], missing: [] };
  if (polygon.length < 3 || areaMm2 <= 0 || (usable.length === 0 && owned.length === 0)) return empty;

  const tol = opts.toleranceMm ?? STAGE_TOLERANCE_MM;
  const frame = frameOf(polygon, front, opts.axis);
  const local = polygon.map(frame.toLocal);
  const blocks = (opts.obstacles ?? []).map((ob) => ob.map(frame.toLocal));
  const bound = opts.within ? opts.within.map(frame.toLocal) : null;
  const rect = asRect(polygon, front);
  // A raised level is laid within its stage as it always was; a stage whose outline runs only along
  // the rows has no rim.
  const segments = bound ? [] : rimSegments(local, opts.smooth?.length ? new Set(opts.smooth) : undefined);
  if (!segments.some((s) => s.kind === "run")) {
    if (!usable.length) return empty;
    const laid = bestParts(frontParts(local), blocks, usable, tol, frame, areaMm2, bound, !!opts.exceed, !!opts.phases);
    const coverage = Math.min(1, laid.covered / areaMm2);
    return {
      decks: laid.decks,
      coverage,
      areaMm2,
      front,
      rect,
      suggestions: rect && coverage < 0.995 && blocks.length === 0 && !bound ? suggestSizes(rect, usable, tol) : [],
      missing: [],
    };
  }
  const built = rimBuild(local, segments, blocks, usable, owned, tol, frame, areaMm2, !!opts.exceed);
  return { decks: built.decks, coverage: Math.min(1, built.covered / areaMm2), areaMm2, front, rect, suggestions: [], missing: built.missing };
}

// ── The rim ───────────────────────────────────────────────────────────────────────────────────

/** Pieces narrower than this (area over longest side), or smaller than RIM_SLIVER_MM2, are the
 *  tolerance's — the line wobbling past a deck — and not a piece anyone brings. */
const RIM_THIN_MM = 40;
const RIM_SLIVER_MM2 = 15_000;
/** A rim piece is at most a deck's long side either way, and a quarter more than its area. */
const RIM_AREA_FACTOR = 1.25;
const STANDARD_KINDS = new Set(["quarter", "half", "triangle", "round"]);

/** A joined rim region without the points the join left on a straight line. */
const tidyRun = (pts: Point[]) => pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) > 0.5 || Math.abs(p.y - pts[i - 1].y) > 0.5);

interface RimPiece {
  /** In the fill's frame. */
  poly: Point[];
  owned?: { type: DeckType; turn: Turn; centre: Point };
}

interface RimEval {
  decks: LaidDeck[];
  pieces: RimPiece[];
  /** Missing pieces, grouped by shape. */
  groups: { rep: Normal; info: PieceInfo; members: Point[][] }[];
  bare: number;
  covered: number;
  score: number[];
}

const better = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

function rimBuild(
  local: readonly Point[],
  segments: readonly RimSegment[],
  blocks: readonly (readonly Point[])[],
  usable: readonly DeckType[],
  owned: readonly DeckType[],
  tol: number,
  frame: ReturnType<typeof frameOf>,
  areaMm2: number,
  exceed: boolean,
): { decks: LaidDeck[]; missing: MissingPiece[]; covered: number } {
  const runs: RimRun[] = segments.flatMap((s) => (s.kind === "run" ? [s.run] : []));
  const maxSide = usable.length ? Math.max(...usable.map((t) => Math.max(t.widthMm, t.depthMm))) : 2440;
  const maxArea = RIM_AREA_FACTOR * (usable.length ? Math.max(...usable.map((t) => t.widthMm * t.depthMm)) : 2440 * 1220);
  const narrowest = usable.length ? Math.min(...usable.map((t) => Math.min(t.widthMm, t.depthMm))) : 0;
  // A LONG STRAIGHT ANGLED SIDE is built the crew's way (the אמארה plan of 26.10): a row of whole
  // decks turned to run along it, their outer edge on the line, and the square rows behind. The
  // zig-zag between the two is filled on site, not bought — never a grid of cut pieces. Not a choice
  // the search below makes: every such side gets its row, and the rest is decked round it.
  const main = usable.length ? [...usable].sort((a, b) => b.widthMm * b.depthMm - a.widthMm * a.depthMm)[0] : null;
  const rows: (BevelRow | null)[] = [];
  for (const r of runs) rows.push(main ? bevelRow(r, local, main, [...blocks, ...rows.flatMap((x) => x?.polys ?? [])], tol) : null);
  const rowPolys = rows.flatMap((x) => x?.polys ?? []);
  const rowArea = rowPolys.reduce((s, p) => s + polyArea(p), 0);
  // Which edges of a piece lie along the stage's own curves — what makes a side of it curved.
  const onCurve = curveTest(runs.map((r) => r.pts));
  const ownedShapes = owned.map((t) => ({ t, n: normal(t.outline?.length ? t.outline : ellipse(t.widthMm, t.depthMm)) }));
  const ownedFor = (poly: Point[]): RimPiece["owned"] => {
    const n = normal(poly);
    for (const o of ownedShapes) {
      const turn = congruent(n, o.n);
      if (turn) return { type: o.t, turn, centre: n.centre };
    }
    return undefined;
  };
  // A curve too big to be ONE piece (a half-round of 8m) is decked as far as whole decks reach, and
  // only what is left along the line is cut into pieces — never the region chopped into a grid of
  // "pieces", rectangles among them that a deck would have covered.
  const big = runs.map((r, i) => {
    if (rows[i]) return false;
    const reg = runRegion(r);
    const b = boxOf(reg);
    // …and deep enough across to take a whole deck: a long thin bow is still pieces along its line.
    const room = main ? Math.min(main.widthMm, main.depthMm) : Infinity;
    return !ownedFor(reg) && Math.min(b.x1 - b.x0, b.y1 - b.y0) >= room && !(b.x1 - b.x0 <= maxSide + 1 && b.y1 - b.y0 <= maxSide + 1 && polyArea(reg) <= maxArea);
  });
  // Runs of one shape are decided together — the four corners of a rounded stage, the two halves of
  // an apron — so a stage comes out the same on both sides.
  const groupOf: number[] = [];
  const reps: Normal[] = [];
  runs.forEach((r, i) => {
    const n = normal(runRegion(r));
    const g = reps.findIndex((rep) => congruent(rep, n));
    groupOf[i] = g >= 0 ? g : reps.push(n) - 1;
  });
  const covering = (poly: Point[]) => {
    // How much of a piece an obstacle (a level, a recess, a piece already standing) already covers.
    if (!blocks.length) return 0;
    const b = boxOf(poly);
    let hit = 0;
    let all = 0;
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        const p = { x: b.x0 + ((i + 0.5) * (b.x1 - b.x0)) / 6, y: b.y0 + ((j + 0.5) * (b.y1 - b.y0)) / 6 };
        if (!inside(p, poly)) continue;
        all++;
        if (blocks.some((o) => inside(p, o))) hit++;
      }
    return all ? hit / all : 0;
  };

  // A run with a turned row along it, or too big to be a piece, keeps its own LINE in the core: the
  // decks go up to it as far as whole ones reach.
  const onLine = runs.map((_, i) => !!rows[i] || big[i]);
  const allBlocks = [...blocks, ...rowPolys];
  const evaluate = (outer: boolean[]): RimEval => {
    const core = coreOutline(segments, (r) => (onLine[r] && !outer[r] ? "line" : outer[r]));
    const coreArea = polyArea(core);
    const innerRuns = runs.map((r, i) => ({ r, i })).filter(({ i }) => !outer[i] && !onLine[i]);
    const outerRegions = runs.filter((_, i) => outer[i]).map((r) => runRegion(r, true));
    const innerRegions = innerRuns.map(({ r }) => runRegion(r));
    const laid =
      coreArea > 1 && usable.length
        ? bestParts(frontParts(core), exceed ? [...allBlocks, ...innerRegions] : allBlocks, usable, tol, frame, coreArea, null, exceed, false, local)
        : { decks: [], covered: 0, turned: 0, boxes: [] };
    // A deck over an OUTER corner that overhangs the line is not laid: what of it is on the stage is
    // a piece of the rim (a deck with a curved side), cut along the deck's own seams. Overhanging is
    // reaching past the line by more than the tolerance — at a corner, or by more than a tolerance-
    // wide strip along the deck — into the part of the core that is not stage.
    const overhangs = (b: { x: number; y: number; w: number; d: number }) => {
      if (!outerRegions.length) return false;
      const box = { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d };
      const over = outerRegions.reduce((s, o) => s + polyArea(clipToBox(o, box)), 0);
      if (over <= 1) return false;
      if (over > tol * Math.max(b.w, b.d)) return true;
      const corners = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }];
      return corners.some((p) => !inside(p, local) && distToBoundary(p, local) > tol && outerRegions.some((o) => inside(p, o) || distToBoundary(p, o) <= 1));
    };
    const keep = laid.boxes.map((b) => !overhangs(b));
    const kept = laid.boxes.filter((_, i) => keep[i]);
    const dropped = laid.boxes.filter((_, i) => !keep[i]);
    const toBox = (b: { x: number; y: number; w: number; d: number }): Box => ({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d });

    const fixed: { poly: Point[]; from: "deck" | "rim" | "gap" | "fill" }[] = [];
    for (const b of dropped) fixed.push({ poly: clipToBox(local, toBox(b)), from: "deck" });
    // What the core's decks leave uncovered — a gap where a run's corner falls between rows, or
    // the part of an OUTER corner no deck reached: cut along every deck seam and core corner, and
    // gathered into the largest rectangles a piece can be.
    // A cell the line of an on-line run crosses is open even with its centre off the stage — the
    // sliver of it on the stage is part of the zig-zag along that line. That line's own corners cut
    // nothing: a curve of 24 chords cut at each would be 24 slivers no deck is as narrow as.
    const lines = runs.filter((_, k) => onLine[k] && !outer[k]).map((r) => r.pts);
    const byLine = (c: Point, reach: number) => lines.some((pts) => distToPolyline(c, pts) <= reach);
    const cuts = core.filter((p) => !lines.some((pts) => pts.slice(1, -1).some((q) => Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5)));
    const xs = [...new Set([...cuts.map((p) => p.x), ...laid.boxes.flatMap((b) => [b.x, b.x + b.w])].map((v) => Math.round(v)))].sort((a, b) => a - b);
    const ys = [...new Set([...cuts.map((p) => p.y), ...laid.boxes.flatMap((b) => [b.y, b.y + b.d])].map((v) => Math.round(v)))].sort((a, b) => a - b);
    const cx = xs.length - 1;
    const cy = ys.length - 1;
    const open = new Uint8Array(Math.max(0, cx * cy));
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
        if (xs[i + 1] - xs[i] < 1 || ys[j + 1] - ys[j] < 1 || coreArea <= 1) continue;
        if (!inside(c, core) && !byLine(c, Math.hypot(xs[i + 1] - xs[i], ys[j + 1] - ys[j]) / 2)) continue;
        if (laid.boxes.some((b) => c.x > b.x && c.x < b.x + b.w && c.y > b.y && c.y < b.y + b.d)) continue;
        // The rim's own regions are pieces already, never gaps of the core.
        if (innerRegions.some((r) => inside(c, r))) continue;
        if (allBlocks.some((o) => inside(c, o))) continue;
        if (polyArea(clipToBox(local, { x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1] })) <= 1) continue;
        open[j * cx + i] = 1;
      }
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        if (!open[j * cx + i]) continue;
        let i1 = i + 1;
        while (i1 < cx && open[j * cx + i1] && xs[i1 + 1] - xs[i] <= maxSide + 1) i1++;
        let j1 = j + 1;
        const rowOpen = (jj: number) => {
          for (let ii = i; ii < i1; ii++) if (!open[jj * cx + ii]) return false;
          return true;
        };
        while (j1 < cy && rowOpen(j1) && ys[j1 + 1] - ys[j] <= maxSide + 1 && (xs[i1] - xs[i]) * (ys[j1 + 1] - ys[j]) <= maxArea) j1++;
        for (let jj = j; jj < j1; jj++) for (let ii = i; ii < i1; ii++) open[jj * cx + ii] = 0;
        // Between a turned row and the square rows behind it: filled on site (see `rows`).
        const mid = { x: (xs[i] + xs[i1]) / 2, y: (ys[j] + ys[j1]) / 2 };
        const fill = rows.some((row) => row && distToPolyline(mid, row.line) <= row.depthMm * 2);
        fixed.push({ poly: clipToBox(local, { x0: xs[i], x1: xs[i1], y0: ys[j], y1: ys[j1] }), from: fill ? "fill" : "gap" });
      }
    const decks = laid.decks.filter((_, i) => keep[i]);
    const keptArea = kept.reduce((s, b) => s + polyArea(clipToBox(local, toBox(b))), 0);
    // The rim's own regions, two ways: each run its own piece; or consecutive runs about one corner
    // (the two quarters of a half-round, a whole disc) joined into one, where that is still a piece
    // one can carry or the studio has it whole. Whichever needs less.
    const assemble = (join: boolean) => {
      const raw = [...fixed];
      const regions: Point[][] = [];
      for (let k = 0; k < innerRuns.length; ) {
        let m = k + 1;
        const same = (a: Point, b: Point) => Math.abs(a.x - b.x) <= 5 && Math.abs(a.y - b.y) <= 5;
        while (join && m < innerRuns.length && innerRuns[m].i === innerRuns[m - 1].i + 1 && same(innerRuns[m].r.inner, innerRuns[k].r.inner)) m++;
        const along = m - k > 1 ? tidyRun(innerRuns.slice(k, m).flatMap(({ r }, n) => (n ? r.pts.slice(1) : r.pts))) : null;
        // Runs that close on themselves (every quarter of a disc) are the whole piece — no corner.
        const joined = along ? (same(along[0], along[along.length - 1]) ? along.slice(0, -1) : [...along, innerRuns[k].r.inner]) : null;
        const jb = joined ? boxOf(joined) : null;
        if (joined && jb && ((jb.x1 - jb.x0 <= maxSide + 1 && jb.y1 - jb.y0 <= maxSide + 1 && polyArea(joined) <= maxArea) || ownedFor(joined))) regions.push(joined);
        else for (let q = k; q < m; q++) regions.push(innerRegions[q]);
        k = m;
      }
      return { raw, regions };
    };
    const variants = [assemble(false), ...(innerRuns.length > 1 ? [assemble(true)] : [])];
    let bestOf: RimEval | null = null;
    for (const { raw, regions } of variants) {
      const e = finish(raw, regions);
      if (!bestOf || better(e.score, bestOf.score)) bestOf = e;
    }
    return bestOf!;

    function finish(raw: { poly: Point[]; from: "deck" | "rim" | "gap" | "fill" }[], regions: Point[][]): RimEval {
      for (const region of regions) {
        if (covering(region) > 0.5) continue;
        const b = boxOf(region);
        const w = b.x1 - b.x0;
        const h = b.y1 - b.y0;
        if (ownedFor(region) || (w <= maxSide + 1 && h <= maxSide + 1 && polyArea(region) <= maxArea)) {
          raw.push({ poly: region, from: "rim" });
          continue;
        }
        // Too big to carry: cut into equal pieces that are not.
        const nx = Math.max(1, Math.ceil(w / maxSide - 1e-6));
        let ny = Math.max(1, Math.ceil(h / maxSide - 1e-6));
        while ((w / nx) * (h / ny) > maxArea && ny < 20) ny++;
        for (let i = 0; i < nx; i++)
          for (let j = 0; j < ny; j++) raw.push({ poly: clipToBox(region, { x0: b.x0 + (i * w) / nx, x1: b.x0 + ((i + 1) * w) / nx, y0: b.y0 + (j * h) / ny, y1: b.y0 + ((j + 1) * h) / ny }), from: "rim" });
      }
      let bare = 0;
      const pieces: RimPiece[] = [];
      const missing: Point[][] = [];
      for (const { poly, from } of raw) {
        const a = polyArea(poly);
        if (a < RIM_SLIVER_MM2) continue;
        const b = boxOf(poly);
        if (a / Math.max(b.x1 - b.x0, b.y1 - b.y0) < RIM_THIN_MM) continue;
        if (from === "fill") {
          bare += a;
          continue;
        }
        const own = ownedFor(poly);
        if (own) pieces.push({ poly, owned: own });
        // A bare rectangle left among the decks is a size question (the drawn size is not what the
        // decks make), not a piece to buy — and so is any leftover narrower than the narrowest deck
        // (the 12cm a 5m depth leaves behind four rows of sheets, where it meets an angled corner);
        // one cut out of the rim is a piece.
        else if (from === "gap" && (isRectangle(poly) || Math.min(b.x1 - b.x0, b.y1 - b.y0) < narrowest)) bare += a;
        else missing.push(poly);
      }
      const groups: RimEval["groups"] = [];
      for (const m of missing) {
        const n = normal(m);
        const g = groups.find((x) => congruent(x.rep, n));
        if (g) g.members.push(m);
        else groups.push({ rep: n, info: describePiece(m, onCurve), members: [m] });
      }
      const covered = keptArea + pieces.reduce((s, p) => s + polyArea(p.poly), 0);
      const score = [
        Math.round((bare / areaMm2) * 100),
        groups.length,
        groups.filter((g) => !STANDARD_KINDS.has(g.info.kind)).length,
        missing.length,
        decks.length + pieces.length,
      ];
      return { decks, pieces, groups, bare, covered, score };
    }
  };

  // Every run in, then each shape of run out, then every run out, then every flip that helped. Each
  // build chooses its own family of decks: a core notched at its corners may be best built of strips
  // where the plain rectangle the outer corners leave is built of sheets.
  const first = evaluate(runs.map(() => false));
  let winner = first;
  const flips = reps.map((_, g) => runs.map((r, i) => groupOf[i] === g && r.outerOk && !onLine[i]));
  const helped: boolean[][] = [];
  for (const f of flips) {
    if (!f.some(Boolean)) continue;
    const e = evaluate(f);
    if (better(e.score, first.score)) helped.push(f);
    if (better(e.score, winner.score)) winner = e;
  }
  if (runs.every((r) => r.outerOk) && reps.length > 1) {
    const e = evaluate(runs.map((_, i) => !onLine[i]));
    if (better(e.score, winner.score)) winner = e;
  }
  if (helped.length > 1) {
    const e = evaluate(runs.map((_, i) => helped.some((f) => f[i])));
    if (better(e.score, winner.score)) winner = e;
  }

  const world = (p: Point) => {
    const w = frame.toWorld(p);
    return { x: Math.round(w.x), y: Math.round(w.y) };
  };
  const baseDeg = (frame.theta * 180) / Math.PI;
  const norm = (deg: number) => Math.round((((deg % 360) + 360) % 360) * 100) / 100;
  const pieceDecks: LaidDeck[] = winner.pieces.flatMap(({ owned: o }) => {
    if (!o) return [];
    // Placed in the fill's frame as a StagePiece is (flipped, then turned), then carried out — a
    // frame that is itself a mirror image turns the other way and flips the piece once more.
    const shape = o.type.outline?.length ? o.type.outline : ellipse(o.type.widthMm, o.type.depthMm);
    const outline = turned(shape, o.turn).map((q) => world({ x: o.centre.x + q.x, y: o.centre.y + q.y }));
    const rot = o.turn.rot * 90;
    return [
      {
        typeId: o.type.id,
        centre: world(o.centre),
        rotation: norm(frame.s > 0 ? baseDeg + rot : baseDeg - rot + 180),
        widthMm: o.type.widthMm,
        depthMm: o.type.depthMm,
        outline,
        ...((frame.s > 0 ? o.turn.mirror : !o.turn.mirror) ? { mirrored: true } : {}),
      },
    ];
  });
  const missing: MissingPiece[] = winner.groups.flatMap((g, k) => {
    const shape = `${g.info.kind}:${g.info.widthMm}x${g.info.depthMm}:${k}`;
    return g.members.map((m) => ({ outline: m.map(world), shape, info: g.info }));
  });
  const rowDecks: LaidDeck[] = rows.flatMap((row) =>
    (row?.decks ?? []).map((d) => ({ typeId: d.type.id, centre: world(d.centre), rotation: norm(baseDeg + frame.s * d.deg), widthMm: d.type.widthMm, depthMm: d.type.depthMm })),
  );
  return { decks: [...winner.decks, ...pieceDecks, ...rowDecks], missing, covered: winner.covered + rowArea };
}

/** The distance from a point to an open polyline. */
function distToPolyline(p: Point, pts: readonly Point[]): number {
  let best = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) best = Math.min(best, distToBoundary(p, [pts[k], pts[k + 1]]));
  return best;
}

/** Under this many degrees off the rows, an angled side is a sliver along them — a piece, not a row. */
const BEVEL_MIN_DEG = 10;

interface BevelRow {
  decks: { type: DeckType; centre: Point; deg: number }[];
  polys: Point[][];
  /** The side it runs along, and how deep it is. */
  line: Point[];
  depthMm: number;
}

/** A row of whole decks turned to run along a run that is a long STRAIGHT angled side — the main deck,
 *  long side along the line, its outer edge on it, centred in the stretch where they fit. In the
 *  fill's frame; null when the run is curved, shorter than a deck, within BEVEL_MIN_DEG of the rows,
 *  or no deck fits along it. */
function bevelRow(run: RimRun, poly: readonly Point[], main: DeckType, blocks: readonly (readonly Point[])[], tol: number): BevelRow | null {
  const A = run.pts[0];
  const B = run.pts[run.pts.length - 1];
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  const along = Math.max(main.widthMm, main.depthMm);
  const d = Math.min(main.widthMm, main.depthMm);
  if (L < along - tol) return null;
  const u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
  if (run.pts.some((p) => Math.abs((p.x - A.x) * u.y - (p.y - A.y) * u.x) > 2)) return null;
  const deg = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  const off = ((deg % 90) + 90) % 90;
  if (Math.min(off, 90 - off) < BEVEL_MIN_DEG) return null;
  // Into the stage: the side the run's inner corner is on.
  let n = { x: -u.y, y: u.x };
  if ((run.inner.x - A.x) * n.x + (run.inner.y - A.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  const at = (s: number, o: number) => ({ x: A.x + u.x * s + n.x * o, y: A.y + u.y * s + n.y * o });
  const onStage = (p: Point) => (inside(p, poly) || distToBoundary(p, poly) <= tol) && !blocks.some((b) => inside(p, b));
  const fits = (s: number) => [0, 0.5, 1].every((f) => [1, d / 2, d - 1].every((o) => onStage(at(s + 1 + f * (along - 2), o))));
  let lo = -1;
  let hi = -1;
  for (let s = -tol; s + along <= L + tol; s += 10)
    if (fits(s)) {
      if (lo < 0) lo = s;
      hi = s;
    }
  if (lo < 0) return null;
  const k = Math.floor((hi - lo) / along + 1e-6) + 1;
  const start = lo + (hi - lo - (k - 1) * along) / 2;
  const decks: BevelRow["decks"] = [];
  const polys: Point[][] = [];
  for (let j = 0; j < k; j++) {
    const s = start + j * along;
    if (!fits(s)) continue;
    decks.push({ type: main, centre: at(s + along / 2, d / 2), deg: main.widthMm >= main.depthMm ? deg : deg + 90 });
    polys.push([at(s, 0), at(s + along, 0), at(s + along, d), at(s, d)]);
  }
  return decks.length ? { decks, polys, line: [A, B], depthMm: d } : null;
}

/** An oval piece's outline about its centre, for comparing with the rim. */
function ellipse(w: number, d: number): Point[] {
  return Array.from({ length: 48 }, (_, k) => {
    const t = (2 * Math.PI * k) / 48;
    return { x: (w / 2) * Math.cos(t), y: (d / 2) * Math.sin(t) };
  });
}

/** The step a stage built from these decks grows in: the largest module every deck measurement is a
 *  whole number of, never finer than 10cm. What the resize handles snap a stage's sides to. */
export function deckModule(types: readonly DeckType[]): number {
  const dims = types.filter(isRectDeck).flatMap((t) => [r10(t.widthMm), r10(t.depthMm)]).filter((d) => d > 0);
  return dims.length ? Math.max(100, dims.reduce((g, d) => gcd(g, d))) : 1000;
}

/** Snaps a length to what the decks build. */
export type LengthSnap = (mm: number, opts?: { magnetMm?: number; gridMm?: number }) => number;

/** The lengths the decks lay end to end EXACTLY — every sum of their sides, within one family
 *  (2440 + 1220 = 3660, 4880, …; 2000 + 1000 = 3000, …) — and a snap that pulls a length to the
 *  nearest of them when it is within `magnetMm`, and otherwise leaves it on the plain `gridMm` grid
 *  (default 1cm). This, not a fixed module, is what drawing and resizing snap to: a deck of 244×122
 *  has no 10cm module, and rounding to one is how a 4.88m stage became a 4.90m stage the decks no
 *  longer fill. The pull is a magnet, never a cage — a designer can still put any exact number. */
export function lengthSnapper(types: readonly DeckType[], maxMm = 60_000): LengthSnap {
  const units = Math.ceil(maxMm / 10);
  const ok = new Uint8Array(units + 1);
  for (const fam of families(types.filter(isRectDeck))) {
    const steps = [...new Set(fam.flatMap((t) => [r10(t.widthMm) / 10, r10(t.depthMm) / 10]))].filter((d) => d > 0);
    const reach = new Uint8Array(units + 1);
    reach[0] = 1;
    for (let i = 1; i <= units; i++)
      for (const s of steps)
        if (i >= s && reach[i - s]) {
          reach[i] = 1;
          ok[i] = 1;
          break;
        }
  }
  return (mm, opts = {}) => {
    const grid = opts.gridMm ?? 10;
    const c = Math.round(mm / 10);
    const reachK = Math.floor((opts.magnetMm ?? 0) / 10);
    for (let k = 0; k <= reachK; k++)
      for (const i of k === 0 ? [c] : [c - k, c + k]) if (i > 0 && i <= units && ok[i]) return i * 10;
    return Math.max(grid, Math.round(mm / grid) * grid);
  };
}

/** The lengths a stage built of these decks is MADE in, as a crew lays it: along the front, whole
 *  decks end to end and turned ones (a·long + b·short of the family's main deck); front to back,
 *  rows of that deck and at most one row of a finishing strip (r·short + one strip), or decks turned
 *  along a catwalk. Not every sum of every side — with 40/60/80 strips that is nearly every length,
 *  and "12.20×5.20, 65 decks" is a size made of strips nobody wants offered. Sorted, up to `maxMm`. */
function madeLengths(types: readonly DeckType[], maxMm: number): { along: number[]; deep: number[] } {
  const along = new Set<number>();
  const deep = new Set<number>();
  for (const fam of families(types)) {
    const main = [...fam].sort((a, b) => b.widthMm * b.depthMm - a.widthMm * a.depthMm)[0];
    const L = r10(Math.max(main.widthMm, main.depthMm));
    const S = r10(Math.min(main.widthMm, main.depthMm));
    // Strips: the family's other decks that share the main deck's long side, by their other side.
    const strips = [0, ...fam.filter((t) => t !== main && [t.widthMm, t.depthMm].map(r10).includes(L)).map((t) => r10(Math.min(t.widthMm, t.depthMm) === L ? Math.max(t.widthMm, t.depthMm) : Math.min(t.widthMm, t.depthMm)))];
    // Any other size of the family stands in its own right (a 1×1 beside a 2×1).
    const others = fam.filter((t) => t !== main && !strips.includes(r10(Math.min(t.widthMm, t.depthMm)))).flatMap((t) => [r10(t.widthMm), r10(t.depthMm)]);
    const sides = [...new Set([L, S, ...others])].filter((s) => s > 0);
    // Whole decks end to end: every sum of the family's sides up to maxMm (one pass, as lengthSnapper).
    const units = Math.ceil(maxMm / 10);
    const reach = new Uint8Array(units + 1);
    reach[0] = 1;
    for (let i = 1; i <= units; i++) if (sides.some((s) => i >= s / 10 && reach[i - s / 10])) reach[i] = 1;
    for (let i = 1; i <= units; i++) if (reach[i]) {
      along.add(i * 10);
      deep.add(i * 10);
    }
    for (let r = 0; r * S <= maxMm; r++) for (const s of strips) if (r * S + s > 0 && r * S + s <= maxMm) deep.add(r * S + s);
  }
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return { along: sorted(along), deep: sorted(deep) };
}

/** Rectangles near `rect` that the decks cover exactly: the largest that fits INSIDE what was drawn,
 *  and the smallest that CONTAINS it. Ties keep the front length nearest to what was drawn — the
 *  front is the measurement a designer chose on purpose. The sizes tried are the ones the decks are
 *  made in (madeLengths), the two either side of each measurement. */
function suggestSizes(rect: { widthMm: number; depthMm: number }, types: readonly DeckType[], tol: number): SizeSuggestion[] {
  const made = madeLengths(types, Math.max(rect.widthMm, rect.depthMm) + 5000);
  const around = (mm: number, list: number[]) => [...list.filter((l) => l <= mm + tol).slice(-2), ...list.filter((l) => l > mm + tol).slice(0, 2)];
  const sizes: { widthMm: number; depthMm: number }[] = [];
  for (const w of around(rect.widthMm, made.along)) for (const d of around(rect.depthMm, made.deep)) sizes.push({ widthMm: w, depthMm: d });
  // Each size is laid only when it is the next one wanted — the preferred order first, stopping at
  // the first the decks cover exactly — rather than all sixteen.
  const tried = new Map<string, number | null>();
  const decksFor = (s: { widthMm: number; depthMm: number }) => {
    const k = `${s.widthMm}x${s.depthMm}`;
    if (!tried.has(k)) {
      const { widthMm: w, depthMm: d } = s;
      const poly = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: d },
        { x: 0, y: d },
      ];
      const l = best(poly, [], types, 0, frameOf(poly, 0), w * d);
      tried.set(k, l.covered >= w * d - 1 ? l.decks.length : null);
    }
    return tried.get(k)!;
  };
  const area = (s: { widthMm: number; depthMm: number }) => s.widthMm * s.depthMm;
  const closer = (a: { widthMm: number }, b: { widthMm: number }) => Math.abs(a.widthMm - rect.widthMm) - Math.abs(b.widthMm - rect.widthMm);
  const first = (list: { widthMm: number; depthMm: number }[]) => {
    for (const s of list) {
      const decks = decksFor(s);
      if (decks !== null) return { ...s, decks };
    }
    return undefined;
  };
  const smaller = first(sizes.filter((s) => s.widthMm <= rect.widthMm + tol && s.depthMm <= rect.depthMm + tol).sort((a, b) => area(b) - area(a) || closer(a, b)));
  const larger = first(sizes.filter((s) => s.widthMm >= rect.widthMm - tol && s.depthMm >= rect.depthMm - tol).sort((a, b) => area(a) - area(b) || closer(a, b)));
  return [
    ...(smaller ? [{ direction: "smaller" as const, ...smaller }] : []),
    ...(larger ? [{ direction: "larger" as const, ...larger }] : []),
  ];
}

/** Do two outlines share any floor? An edge of one crossing an edge of the other, or one lying wholly
 *  inside the other. Touching along an edge is not overlapping — two stages built flush are one
 *  platform, which is exactly what a designer extending a stage draws. */
export function polygonsOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const eps = 1;
  for (let i = 0; i < a.length; i++) {
    const p1 = a[i];
    const p2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const q1 = b[j];
      const q2 = b[(j + 1) % b.length];
      const d1 = cross(q1, q2, p1);
      const d2 = cross(q1, q2, p2);
      const d3 = cross(p1, p2, q1);
      const d4 = cross(p1, p2, q2);
      const scale = Math.hypot(q2.x - q1.x, q2.y - q1.y) * Math.hypot(p2.x - p1.x, p2.y - p1.y) * 1e-9 + eps;
      if (((d1 > scale && d2 < -scale) || (d1 < -scale && d2 > scale)) && ((d3 > scale && d4 < -scale) || (d3 < -scale && d4 > scale))) return true;
    }
  }
  const centroid = (poly: readonly Point[]) => ({ x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length });
  return inside(centroid(a), b) || inside(centroid(b), a);
}

/** The drawn rectangle at a new size: centred along the front, and kept against its BACK edge — a
 *  stage is usually against something (a wall, a backdrop), and the front is what moves to meet
 *  the room. Returned with its front as edge 0. */
export function resizeRect(polygon: readonly Point[], front: number, widthMm: number, depthMm: number): Point[] {
  const rect = asRect(polygon, front);
  if (!rect) return [...polygon];
  const frame = frameOf(polygon, front);
  const x0 = (rect.widthMm - widthMm) / 2;
  const x1 = x0 + widthMm;
  const y1 = rect.depthMm;
  const y0 = y1 - depthMm;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ].map((p) => {
    const w = frame.toWorld(p);
    return { x: Math.round(w.x), y: Math.round(w.y) };
  });
}

/** Which edge most likely faces the room: of the edges NOT lying along a wall, the longest one
 *  opposite an edge that does (a stage against the back wall faces away from it); failing that,
 *  the longest edge off the walls; failing that, the longest. `wallDistance` answers "how far is
 *  this point from the nearest wall" — absent, the longest edge. */
export function defaultFront(polygon: readonly Point[], wallDistance?: (p: Point) => number, hugMm = 300): number {
  if (!wallDistance || polygon.length < 3) return longestEdge(polygon);
  const edges = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return { i, len, dir: { x: (b.x - a.x) / (len || 1), y: (b.y - a.y) / (len || 1) }, hugs: wallDistance({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) <= hugMm };
  });
  const open = edges.filter((e) => !e.hugs);
  const hugging = edges.filter((e) => e.hugs);
  const opposite = open.filter((e) => hugging.some((h) => e.dir.x * h.dir.x + e.dir.y * h.dir.y < -0.95));
  const pick = (opposite.length ? opposite : open.length ? open : edges).reduce((a, b) => (b.len > a.len + 1e-6 ? b : a));
  return pick.i;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const rect = (x: number, y: number, w: number, h: number): Point[] => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const big = { id: "2x1", widthMm: 2000, depthMm: 1000 };
  const small = { id: "1x1", widthMm: 1000, depthMm: 1000 };
  const imperial = { id: "4x8", widthMm: 1220, depthMm: 2440 };
  const count = (r: FillResult, id: string) => r.decks.filter((d) => d.typeId === id).length;

  const six = fillWithDecks(rect(0, 0, 6000, 4000), [big]);
  assert(six.decks.length === 12 && Math.abs(six.coverage - 1) < 1e-9, "a 6×4 area is exactly twelve 2×1 decks");
  assert(six.decks.every((d) => d.rotation === 0), "…every one of them long side along the front");
  assert(six.suggestions.length === 0, "…and an exact area suggests nothing");

  const walls = fillWithDecks(rect(0, 0, 6010, 3990), [big]);
  assert(walls.decks.length === 12, "wall to wall, 10mm short of four rows, is still four rows");

  const odd = fillWithDecks(rect(0, 0, 5000, 3000), [big, small]);
  assert(Math.abs(odd.coverage - 1) < 1e-9, "a 5×3 area is covered exactly with 2×1s and 1×1s");
  assert(count(odd, "2x1") >= 6, "…mostly by the big deck");

  const mixed = fillWithDecks(rect(0, 0, 6000, 4000), [big, imperial]);
  assert(Math.abs(mixed.coverage - 1) < 1e-9 && count(mixed, "4x8") === 0, "a metric and an imperial deck are never one platform");

  // The front: a 6×4.5 area laid from its bottom edge leaves the half-metre at the top, and from its
  // top edge at the bottom — the gap is always behind.
  const deep = rect(0, 0, 6000, 4500);
  const fromBottom = fillWithDecks(deep, [big], { front: 0 });
  assert(fromBottom.decks.every((d) => d.centre.y < 4000), "rows start at the front; the slack is at the back");
  const fromTop = fillWithDecks(deep, [big], { front: 2 });
  assert(fromTop.decks.every((d) => d.centre.y > 500), "…whichever edge the front is");
  assert(fromTop.decks.length === 12, "…and it is the same stage from either side");

  const endTurn = fillWithDecks(rect(0, 0, 7000, 2000), [big]);
  assert(endTurn.decks.length === 7 && endTurn.coverage > 0.999, "a 7×2 is six decks along the front and one turned to finish");
  const centred = fillWithDecks(rect(0, 0, 7000, 1000), [big]);
  const xs = centred.decks.map((d) => d.centre.x);
  assert(Math.min(...xs) === 1500 && Math.max(...xs) === 5500, "a row with slack is centred — two half-metre ends, not one metre on one side");

  const catwalk = fillWithDecks(rect(0, 0, 1000, 6000), [big], { front: 0 });
  assert(catwalk.decks.length === 3 && catwalk.decks.every((d) => d.rotation === 90), "a 1m catwalk is decked along its length");

  const square = fillWithDecks(rect(0, 0, 3000, 3000), [big]);
  assert(square.coverage < 1, "a 3×3 cannot be built from 2×1s…");
  const smaller = square.suggestions.find((s) => s.direction === "smaller");
  const larger = square.suggestions.find((s) => s.direction === "larger");
  assert(smaller?.widthMm === 3000 && smaller.depthMm === 2000 && smaller.decks === 3, "…so 3×2 is offered, keeping the front");
  assert(larger?.widthMm === 3000 && larger.depthMm === 4000 && larger.decks === 6, "…and 3×4");

  const resized = resizeRect(rect(0, 0, 3000, 3000), 0, 3000, 2000);
  const ry = resized.map((p) => p.y);
  assert(Math.min(...ry) === 1000 && Math.max(...ry) === 3000, "a suggested size keeps the back edge where it was");
  assert(fillWithDecks(resized, [big], { front: 0 }).coverage > 0.999, "…and the resized area really is exact");

  // Turned: a 4×2 area drawn at 30° is decked along its own edge.
  const t = (30 * Math.PI) / 180;
  const turned = rect(0, 0, 4000, 2000).map((p) => ({ x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t) }));
  const tf = fillWithDecks(turned, [big]);
  assert(tf.decks.length === 4 && Math.abs(tf.coverage - 1) < 1e-6, "an angled area is decked along its front edge");
  assert(tf.decks.every((d) => Math.abs(d.rotation - 30) < 0.01), "…with every deck turned to match");
  const cw = [...turned].reverse();
  assert(fillWithDecks(cw, [big]).decks.length === 4, "…whichever way round its corners were clicked");

  const blocked = fillWithDecks(rect(0, 0, 6000, 4000), [big], { obstacles: [rect(0, 0, 2000, 4000)] });
  assert(blocked.decks.length === 8, "a stage already standing there is decked around");

  const lShape: Point[] = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 2000 },
    { x: 2000, y: 2000 },
    { x: 2000, y: 4000 },
    { x: 0, y: 4000 },
  ];
  const l = fillWithDecks(lShape, [big]);
  assert(Math.abs(l.coverage - 1) < 1e-9 && l.decks.length === 6, "an L is decked into its corner and no further");
  assert(l.rect === null && l.suggestions.length === 0, "…and, not being a rectangle, is offered no sizes");

  // A stage against the back wall faces the other way.
  const wallAtY = (y: number) => (p: Point) => Math.abs(p.y - y);
  assert(defaultFront(rect(0, 0, 6000, 3000), wallAtY(3000)) === 0, "against a wall behind, the front is the opposite edge");
  assert(defaultFront(rect(0, 0, 6000, 3000), wallAtY(0)) === 2, "…and turned round, the other one");

  const clipped = fillWithDecks(rect(4000, 0, 4000, 2000), [big], { within: rect(0, 0, 6000, 4000) });
  assert(clipped.decks.length === 2 && clipped.decks.every((d) => d.centre.x < 6000), "a level drawn past its stage is laid only where the stage is");

  assert(polygonsOverlap(rect(0, 0, 4000, 2000), rect(3000, 1000, 4000, 2000)), "two areas crossing overlap");
  assert(!polygonsOverlap(rect(0, 0, 4000, 2000), rect(4000, 0, 4000, 2000)), "…two built flush do not");
  assert(polygonsOverlap(rect(0, 0, 6000, 4000), rect(1000, 1000, 1000, 1000)), "…one inside the other does");
  assert(!polygonsOverlap(rect(0, 0, 1000, 1000), rect(5000, 5000, 1000, 1000)), "…two apart do not");

  assert(fillWithDecks(rect(0, 0, 1000, 1000), []).decks.length === 0, "no decks chosen, nothing laid");
  assert(fillWithDecks(rect(0, 0, 500, 500), [big]).decks.length === 0, "an area smaller than any deck lays nothing");

  // 244×122 sheets: the lengths they build pull a length in; anything else stays where it was put.
  const sheets = lengthSnapper([{ id: "s", widthMm: 2440, depthMm: 1220 }]);
  assert(sheets(4850, { magnetMm: 60 }) === 4880 && sheets(9790, { magnetMm: 60 }) === 9760, "a length near what the sheets build is pulled onto it");
  assert(sheets(4700, { magnetMm: 60 }) === 4700 && sheets(4703) === 4700, "…anything else stays exact, to the centimetre");
  assert(sheets(4960, { magnetMm: 60, gridMm: 100 }) === 5000, "…or to the grid it was asked for");
  assert(lengthSnapper([big, small])(2960, { magnetMm: 60 }) === 3000, "metric decks pull to whole metres");
  const sheet16 = fillWithDecks(rect(0, 0, 4880, 9760), [{ id: "s", widthMm: 2440, depthMm: 1220 }]);
  assert(sheet16.decks.length === 16 && sheet16.coverage > 0.999, "a 4.88×9.76 is exactly sixteen 244×122 sheets");

  // The base library's decks: the 244×122 sheet and the 80/60/40 strips cut to its length. They
  // share no 10cm module, but one side exactly — one platform, the strips finishing the depth.
  const sheet = { id: "122", widthMm: 2440, depthMm: 1220, heightMm: 600 };
  const s80 = { id: "80", widthMm: 2440, depthMm: 800, heightMm: 600 };
  const s60 = { id: "60", widthMm: 2440, depthMm: 600, heightMm: 600 };
  const s40 = { id: "40", widthMm: 2440, depthMm: 400, heightMm: 600 };
  const base244 = [sheet, s80, s60, s40];
  const deep304 = fillWithDecks(rect(0, 0, 4880, 3040), base244, { front: 0 });
  assert(deep304.coverage > 0.999, "a 4.88×3.04 stage is covered exactly by sheets and strips");
  assert(count(deep304, "122") === 4 && count(deep304, "60") === 2, "…four sheets in two rows, and a 60cm strip behind each pair");
  assert(deep304.decks.every((d) => d.rotation === 0), "…every one long side along the front");
  const deep284 = fillWithDecks(rect(0, 0, 7320, 2840), base244, { front: 0 });
  assert(deep284.coverage > 0.999 && count(deep284, "122") === 6 && count(deep284, "40") === 3, "a 7.32×2.84 is six sheets and three 40cm strips");
  assert(count(fillWithDecks(rect(0, 0, 4880, 2440), base244), "122") === 4, "a depth the sheets divide uses no strips");
  assert(lengthSnapper(base244)(3045, { magnetMm: 60 }) === 3040 && lengthSnapper(base244)(2845, { magnetMm: 60 }) === 2840, "the strips' depths are lengths the drawing pulls to");
  const strips = fillWithDecks(rect(0, 0, 6000, 4000), [big, small, sheet, s40]);
  assert(strips.decks.every((d) => d.typeId === "2x1" || d.typeId === "1x1") || strips.decks.every((d) => d.typeId === "122" || d.typeId === "40"), "a sheet and a metric deck are still never one platform");

  // Exceeding the line: a 6.90m front gets a seventh metre of deck 10cm over the line; a 6.30m
  // front does not get one 70cm over it; and a level never reaches past its stage.
  const strip = fillWithDecks(rect(0, 0, 6900, 1000), [big, small], { front: 0 });
  assert(strip.decks.length === 3 && strip.coverage < 0.9, "by default a 6.90m front is six metres of deck and a bare strip");
  const over = fillWithDecks(rect(0, 0, 6900, 1000), [big, small], { front: 0, exceed: true });
  assert(over.decks.length === 4 && over.decks.some((d) => d.centre.x + d.widthMm / 2 > 6900), "exceeding, a seventh metre of deck is laid over the line");
  assert(over.decks.every((d) => d.centre.x + d.widthMm / 2 <= 6900 + 100 && d.centre.x - d.widthMm / 2 >= -100), "…by no more than the strip it covers, split between the two ends");
  assert(over.coverage > 0.999, "…and the front is covered");
  const worse = fillWithDecks(rect(0, 0, 6300, 1000), [big, small], { front: 0, exceed: true });
  assert(worse.decks.length === 3, "a deck that would hang 70cm over to cover 30cm is not laid, even when exceeding");
  const levelOver = fillWithDecks(rect(4000, 0, 4000, 2000), [big], { within: rect(0, 0, 6000, 4000), exceed: true });
  assert(levelOver.decks.length === 2 && levelOver.decks.every((d) => d.centre.x + d.widthMm / 2 <= 6000), "a level never exceeds the stage it stands on");
  assert(fillWithDecks(rect(0, 0, 6000, 4000), [big], { exceed: true }).decks.length === 12, "an exact area is the same build either way");

  // A curved front: the rows run along the curve's end-to-end chord, not along its first chord. A
  // 6×4 whose front is bowed 30cm out: with the first chord as the axis every deck leans with it;
  // with the chord as the axis the build is the plain rectangle's, squared to the sides.
  {
    const bowPts = Array.from({ length: 9 }, (_, k) => {
      const x = -3000 + (6000 * k) / 8;
      return { x, y: -300 * (1 - (x / 3000) ** 2) };
    });
    const bowed: Point[] = [...bowPts, { x: 3000, y: 4000 }, { x: -3000, y: 4000 }];
    const askew = fillWithDecks(bowed, [big], { front: 0 });
    assert(askew.decks.some((d) => d.rotation > 5 && d.rotation < 355), "(laid along a bow's first chord, the rows lean)");
    const square = fillWithDecks(bowed, [big], { front: 0, axis: [bowPts[0], bowPts[8]] });
    assert(square.decks.length >= askew.decks.length && square.decks.every((d) => d.rotation === 0), "laid along the bow's chord, the rows are square to the stage");
    assert(square.decks.every((d) => d.centre.y - d.depthMm / 2 >= -300 - 60), "…and start at the front");
  }

  // THE FRONT LINE AND THE RIM — the stage that showed the old fill up: a 12×5 body with an R1.8
  // half-round out of the middle of its front. Laid from the apron's tip, the body's rows were
  // offset from its own front, strips ran from the apron through the body, and a hole was left in
  // its middle; the curve was stair-stepped with strips.
  {
    const arc = (cx: number, cy: number, r: number, from: number, to: number, n: number): Point[] =>
      Array.from({ length: n + 1 }, (_, k) => {
        const a = ((from + ((to - from) * k) / n) * Math.PI) / 180;
        return { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
      });
    const apron: Point[] = [{ x: 0, y: 0 }, ...arc(6000, 0, 1800, 180, 360, 16), { x: 12000, y: 0 }, { x: 12000, y: 5000 }, { x: 0, y: 5000 }];
    const smooth = Array.from({ length: 15 }, (_, k) => k + 2);
    const withApron = fillWithDecks(apron, base244, { front: 0, smooth });
    const bodyAlone = fillWithDecks(rect(0, 0, 12000, 5000), base244, { front: 0 });
    assert(JSON.stringify(withApron.decks) === JSON.stringify(bodyAlone.decks), "an apron leaves the body's decks exactly as the body alone has them — its rows from its own front line");
    assert(withApron.decks.every((d) => d.centre.y > 0), "…no strip run out into the apron");
    assert(
      withApron.missing.length === 2 && withApron.missing.every((m) => m.info.kind === "quarter" && Math.abs((m.info.radiusMm ?? 0) - 1800) <= 20) && withApron.missing[0].shape === withApron.missing[1].shape,
      "…and the apron is named for what it is: one piece, a quarter-round R180, twice",
    );
    const R = 1800;
    const quarter: DeckType = { id: "q180", widthMm: R, depthMm: R, quarterMm: R, outline: [{ x: -R / 2, y: R / 2 }, { x: R / 2, y: R / 2 }, ...arc(-R / 2, R / 2, R, 0, -90, 8).slice(1, 8), { x: -R / 2, y: -R / 2 }] };
    const owned = fillWithDecks(apron, [...base244, quarter], { front: 0, smooth });
    const pieces = owned.decks.filter((d) => d.typeId === "q180");
    assert(owned.missing.length === 0 && pieces.length === 2 && pieces.every((d) => d.outline!.every((q) => q.y <= 1 && Math.hypot(q.x - 6000, q.y) <= R + 3)), "…and with the piece in the catalog, two of it stand in the apron");
    assert(owned.coverage > withApron.coverage + 0.05, "…covering what was missing");

    // A T: the catwalk in front of the front line is laid on its own, from its tip back, and the
    // body's rows still start at the line.
    const tee: Point[] = [{ x: 0, y: 0 }, { x: 2440, y: 0 }, { x: 2440, y: -1830 }, { x: 4880, y: -1830 }, { x: 4880, y: 0 }, { x: 7320, y: 0 }, { x: 7320, y: 3660 }, { x: 0, y: 3660 }];
    const t = fillWithDecks(tee, base244, { front: 0 });
    const behind = t.decks.filter((d) => d.centre.y > 0);
    assert(behind.length === 9 && behind.every((d) => d.rotation === 0 && [610, 1830, 3050].includes(d.centre.y)), "a T's body is its nine sheets in rows from the front line");
    assert(t.coverage > 0.995 && t.missing.length === 0, "…and its catwalk is decked to its tip");

    // Small rounded corners on sheets: the four corner sheets are one curved sheet, four of it — and a
    // corner cut at 45° is a sheet with its corner cut, named, not a hole.
    const r5: Point[] = [];
    const s5: number[] = [];
    for (const [cx, cy, from] of [[500, 500, 180], [6820, 500, 270], [6820, 3160, 0], [500, 3160, 90]] as const)
      arc(cx, cy, 500, from, from + 90, 6).forEach((p, k) => {
        if (k > 0 && k < 6) s5.push(r5.length);
        r5.push(p);
      });
    const rounded = fillWithDecks(r5, [sheet], { front: 6, smooth: s5 });
    assert(rounded.decks.length === 5 && rounded.missing.length === 4 && new Set(rounded.missing.map((m) => m.shape)).size === 1 && rounded.missing[0].info.kind === "curve", "a 7.32×3.66 rounded R50: five sheets, and one curved sheet four times");
    const cut = fillWithDecks([{ x: 0, y: 0 }, { x: 7320, y: 0 }, { x: 7320, y: 2440 }, { x: 6100, y: 3660 }, { x: 0, y: 3660 }], [sheet], { front: 0 });
    assert(cut.decks.length === 8 && cut.missing.length === 1 && cut.missing[0].info.kind === "angled", "a corner cut at 45°: eight sheets, and the corner sheet with its corner cut, named");
    const t2 = Date.now();
    fillWithDecks(apron, base244, { front: 0, smooth });
    assert(Date.now() - t2 < 1000, "a stage with a rim answers inside a second");

    // ורדה, 2026-10-28: an 8.01m deep band. Ten rows of 80cm strips cover it to the millimetre;
    // six rows of sheets and a 60cm strip leave 9cm at the back — and are what a crew lays.
    const band = fillWithDecks(rect(0, 0, 14640, 8012), base244, { front: 0 });
    assert(count(band, "122") === 36 && count(band, "60") === 6 && band.decks.length === 42, "an 8.01m deep band is six rows of sheets and a strip, not ten rows of strips");

    // A long side at 45° gets a row of sheets turned to run along it (the אמארה plan's crew) —
    // the square rows behind, and nothing listed to buy.
    const splay = fillWithDecks([{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 1000 }, { x: 7000, y: 6000 }, { x: 0, y: 6000 }], base244, { front: 0 });
    const along45 = splay.decks.filter((d) => Math.abs((((d.rotation % 180) + 180) % 180) - 135) < 0.5);
    assert(along45.length === 2 && along45.every((d) => d.typeId === "122"), "a 7m side at 45° carries two sheets turned along it");
    assert(splay.missing.length === 0 && splay.decks.every((d) => along45.includes(d) || d.rotation % 90 === 0), "…the rest square to the front, and no cut pieces");

    // A half-round apron too big to be one piece is decked as far as sheets reach — from the front
    // line out — and only its rim is pieces.
    const bigApron: Point[] = [{ x: 0, y: 0 }, ...arc(6000, 0, 4000, 180, 360, 24), { x: 12000, y: 0 }, { x: 12000, y: 4880 }, { x: 0, y: 4880 }];
    const ba = fillWithDecks(bigApron, base244, { front: 0, smooth: Array.from({ length: 23 }, (_, k) => k + 2) });
    const inApron = ba.decks.filter((d) => d.centre.y < 0 && !d.outline);
    assert(inApron.length >= 6 && inApron.some((d) => Math.abs(d.centre.y + 610) < 2), "a 4m half-round apron is sheets inside, the first row on the front line");
    assert(ba.missing.every((m) => m.info.kind !== "rect"), "…and none of its pieces is a rectangle a sheet would cover");
  }

  const t0 = Date.now();
  fillWithDecks(rect(0, 0, 30000, 20000), [big, small, imperial]);
  assert(Date.now() - t0 < 1500, "a ballroom-sized area answers inside a second and a half");
  const t1 = Date.now();
  fillWithDecks(rect(0, 0, 30000, 20000), base244);
  assert(Date.now() - t1 < 1500, "…and so does one built from the 244 sheet and its strips (a 2cm grid)");
  console.log("stage-fill self-check passed");
}
