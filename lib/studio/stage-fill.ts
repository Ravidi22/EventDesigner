// Filling an area of the plan with stage decks — "draw where the stage goes, get the decks".
//
// A stage is built from the decks the studio owns (200×100, 100×100, 122×244…), and working out how
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
//      100×100 do; 200×100 and 122×244 share 2cm and do not). One stage is built from one family:
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
// Pure, no DOM, self-checked: `npm run check:stage-fill`.
import type { Point } from "@/lib/design-document/types";
import { isMain } from "../self-check";

export interface DeckType {
  id: string;
  widthMm: number;
  depthMm: number;
  /** Two decks of different heights are not one platform. Absent = no opinion. */
  heightMm?: number;
}

export interface LaidDeck {
  typeId: string;
  /** World centre. */
  centre: Point;
  /** World facing, degrees: the deck's width runs along this direction. */
  rotation: number;
  widthMm: number;
  depthMm: number;
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
}

export const STAGE_TOLERANCE_MM = 50;

/** Above this many cells the grid is coarsened — a 30×20m area at a 10mm grid would be 6M cells,
 *  which is a frozen tab. */
const MAX_CELLS = 400_000;
/** Two decks share a family when every measurement of both is a multiple of this or more. */
const FAMILY_MODULE_MM = 100;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const r10 = (mm: number) => Math.round(mm / 10) * 10;

function inside(p: Point, poly: readonly Point[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function distToBoundary(p: Point, poly: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

export function signedArea(poly: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

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

/** The frame a fill works in: x along the front edge, y running back into the stage. */
function frameOf(polygon: readonly Point[], front: number) {
  const a = polygon[front];
  const b = polygon[(front + 1) % polygon.length];
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
  return { theta, toLocal, toWorld };
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

/** Decks that can be one platform: same height, and a shared module of FAMILY_MODULE_MM or more. */
function families(types: readonly DeckType[]): DeckType[][] {
  const out: DeckType[][] = [];
  for (const t of types) {
    const home = out.find((f) =>
      f.every(
        (o) =>
          (o.heightMm ?? 0) === (t.heightMm ?? 0) &&
          [o.widthMm, o.depthMm, t.widthMm, t.depthMm].map(r10).reduce((g, d) => gcd(g, d)) >= FAMILY_MODULE_MM,
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
}

/** One family, one frame: the greedy row fill. */
function lay(
  local: readonly Point[],
  blocks: readonly (readonly Point[])[],
  types: readonly DeckType[],
  tol: number,
  frame: ReturnType<typeof frameOf>,
  bound: readonly Point[] | null = null,
  exceed = false,
): Laid {
  const minX = Math.min(...local.map((p) => p.x));
  const maxX = Math.max(...local.map((p) => p.x));
  const minY = Math.min(...local.map((p) => p.y));
  const maxY = Math.max(...local.map((p) => p.y));
  // How far past the line a deck may reach when exceeding: half the largest deck, which is where a
  // deck would be exactly as much outside as in. The grid is extended that far at the far ends
  // (rows run from the front and from one end, so the overhang lands at the back and is then split
  // between the two ends by the centring below), and the decision per deck is its CENTRE: on the
  // drawn floor, it is laid; past the line, the strip stays bare. `bound` is never exceeded.
  const reach = exceed && types.length ? Math.max(...types.map((t) => Math.max(t.widthMm, t.depthMm))) / 2 : 0;
  const inOne = (p: Point, poly: readonly Point[], t: number) => inside(p, poly) || distToBoundary(p, poly) <= t;
  const within = (p: Point) => inOne(p, local, tol) && (!bound || inOne(p, bound, tol));
  const near = (p: Point) => inOne(p, local, tol + reach) && (!bound || inOne(p, bound, tol));

  const dims = types.flatMap((t) => [r10(t.widthMm), r10(t.depthMm)]);
  let step = Math.max(10, dims.reduce((g, d) => gcd(g, d)));
  while (((maxX - minX + tol + reach) / step) * ((maxY - minY + tol + reach) / step) > MAX_CELLS) step *= 2;
  const nx = Math.max(1, Math.floor((maxX - minX + tol + reach) / step + 1e-6));
  const ny = Math.max(1, Math.floor((maxY - minY + tol + reach) / step + 1e-6));
  // 1 = a cell of the drawn area; 2 = a cell past its edge a deck may still reach into (exceeding
  // only — without it there are none); 0 = not for laying on.
  const free = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const c = { x: minX + (i + 0.5) * step, y: minY + (j + 0.5) * step };
      free[j * nx + i] = blocks.some((b) => inside(c, b)) ? 0 : within(c) ? 1 : near(c) ? 2 : 0;
    }

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
      return t.widthMm === t.depthMm ? [orient(false)] : [orient(false), orient(true)];
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

  const fits = (i: number, j: number, sh: (typeof shapes)[number]) => {
    if (i + sh.cw > nx || j + sh.ch > ny) return false;
    for (let y = j; y < j + sh.ch; y++) for (let x = i; x < i + sh.cw; x++) if (!free[y * nx + x]) return false;
    return footprintOk(minX + i * step, minY + j * step, sh.w, sh.d);
  };

  const boxes: { x: number; y: number; w: number; d: number; type: DeckType; turned: boolean; across: boolean; frac: number }[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (!free[j * nx + i]) continue;
      const s = shapes.find((sh) => fits(i, j, sh));
      if (!s) continue;
      // How much of the deck is on the drawn floor — what it COVERS, as against what it hangs over.
      let on = 0;
      for (let y = j; y < j + s.ch; y++)
        for (let x = i; x < i + s.cw; x++) {
          if (free[y * nx + x] === 1) on++;
          free[y * nx + x] = 0;
        }
      boxes.push({ x: minX + i * step, y: minY + j * step, w: s.w, d: s.d, type: s.type, turned: s.turned, across: s.across, frac: on / (s.cw * s.ch) });
    }

  // Centre along the front: the slack at the two ends of the layout, split evenly — when every deck
  // still fits after the shift (an L or an obstacle may say no, and then it stays put).
  if (boxes.length > 0 && blocks.length === 0) {
    const lo = Math.min(...boxes.map((b) => b.x));
    const hi = Math.max(...boxes.map((b) => b.x + b.w));
    const shift = (maxX - hi - (lo - minX)) / 2;
    if (Math.abs(shift) > 1) {
      const ok = boxes.every((b) => footprintOk(b.x + shift, b.y, b.w, b.d));
      if (ok) for (const b of boxes) b.x += shift;
    }
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
  };
}

/** The best layout over every family and every deck alone: most covered, then fewest decks, then
 *  fewest turned. Coverage is compared to the half-percent — 0.1% more cover is not worth a
 *  second family of legs. */
function best(
  local: readonly Point[],
  blocks: readonly (readonly Point[])[],
  types: readonly DeckType[],
  tol: number,
  frame: ReturnType<typeof frameOf>,
  areaMm2: number,
  bound: readonly Point[] | null = null,
  exceed = false,
): Laid {
  const fams = families(types);
  const candidates = [...fams, ...types.filter(() => types.length > 1).map((t) => [t])].filter(
    (c, i, all) => all.findIndex((o) => o.length === c.length && o.every((t, k) => t.id === c[k].id)) === i,
  );
  let winner: Laid = { decks: [], covered: 0, turned: 0 };
  let winnerKey = [-1, 0, 0];
  for (const c of candidates) {
    const l = lay(local, blocks, c, tol, frame, bound, exceed);
    const key = [Math.round((Math.min(1, l.covered / areaMm2) * 200)), -l.decks.length, -l.turned];
    const better = key[0] !== winnerKey[0] ? key[0] > winnerKey[0] : key[1] !== winnerKey[1] ? key[1] > winnerKey[1] : key[2] > winnerKey[2];
    if (better) {
      winner = l;
      winnerKey = key;
    }
  }
  return winner;
}

/** Lay decks of the given types across `polygon`. */
export function fillWithDecks(polygon: readonly Point[], types: readonly DeckType[], opts: FillOptions = {}): FillResult {
  const areaMm2 = Math.abs(signedArea(polygon));
  const usable = types.filter((t) => t.widthMm > 0 && t.depthMm > 0);
  const front = opts.front !== undefined && opts.front >= 0 && opts.front < polygon.length ? opts.front : longestEdge(polygon);
  const empty: FillResult = { decks: [], coverage: 0, areaMm2, front, rect: null, suggestions: [] };
  if (polygon.length < 3 || usable.length === 0 || areaMm2 <= 0) return empty;

  const tol = opts.toleranceMm ?? STAGE_TOLERANCE_MM;
  const frame = frameOf(polygon, front);
  const local = polygon.map(frame.toLocal);
  const blocks = (opts.obstacles ?? []).map((ob) => ob.map(frame.toLocal));
  const bound = opts.within ? opts.within.map(frame.toLocal) : null;
  const laid = best(local, blocks, usable, tol, frame, areaMm2, bound, !!opts.exceed);
  const coverage = Math.min(1, laid.covered / areaMm2);
  const rect = asRect(polygon, front);

  return {
    decks: laid.decks,
    coverage,
    areaMm2,
    front,
    rect,
    suggestions: rect && coverage < 0.995 && blocks.length === 0 && !bound ? suggestSizes(rect, usable, tol) : [],
  };
}

/** The step a stage built from these decks grows in: the largest module every deck measurement is a
 *  whole number of, never finer than 10cm. What the resize handles snap a stage's sides to. */
export function deckModule(types: readonly DeckType[]): number {
  const dims = types.flatMap((t) => [r10(t.widthMm), r10(t.depthMm)]).filter((d) => d > 0);
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
  for (const fam of families(types.filter((t) => t.widthMm > 0 && t.depthMm > 0))) {
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

/** Rectangles near `rect` that the decks cover exactly: the largest that fits INSIDE what was drawn,
 *  and the smallest that CONTAINS it. Ties keep the front length nearest to what was drawn — the
 *  front is the measurement a designer chose on purpose. */
function suggestSizes(rect: { widthMm: number; depthMm: number }, types: readonly DeckType[], tol: number): SizeSuggestion[] {
  const step = deckModule(types);
  const around = (mm: number) => {
    const f = Math.floor((mm + tol) / step);
    return [f - 1, f, f + 1, f + 2].filter((n) => n > 0).map((n) => n * step);
  };
  const exact: { widthMm: number; depthMm: number; decks: number }[] = [];
  for (const w of around(rect.widthMm))
    for (const d of around(rect.depthMm)) {
      const poly = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: d },
        { x: 0, y: d },
      ];
      const l = best(poly, [], types, 0, frameOf(poly, 0), w * d);
      if (l.covered >= w * d - 1) exact.push({ widthMm: w, depthMm: d, decks: l.decks.length });
    }
  const area = (s: { widthMm: number; depthMm: number }) => s.widthMm * s.depthMm;
  const closer = (a: { widthMm: number }, b: { widthMm: number }) => Math.abs(a.widthMm - rect.widthMm) - Math.abs(b.widthMm - rect.widthMm);
  const within = exact.filter((s) => s.widthMm <= rect.widthMm + tol && s.depthMm <= rect.depthMm + tol);
  const containing = exact.filter((s) => s.widthMm >= rect.widthMm - tol && s.depthMm >= rect.depthMm - tol);
  const smaller = within.sort((a, b) => area(b) - area(a) || closer(a, b))[0];
  const larger = containing.sort((a, b) => area(a) - area(b) || closer(a, b))[0];
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

  const t0 = Date.now();
  fillWithDecks(rect(0, 0, 30000, 20000), [big, small, imperial]);
  assert(Date.now() - t0 < 1500, "a ballroom-sized area answers inside a second and a half");
  console.log("stage-fill self-check passed");
}
