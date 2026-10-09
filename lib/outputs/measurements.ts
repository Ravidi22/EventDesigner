// MEASUREMENTS — what a crew sets a room out from.
//
// A placement map is read with a tape measure in the other hand. The questions on site are all
// distances: how long is each side of the stage, how far is it off the back wall, how much room is
// left between it and the first table, how wide is the aisle between rows. The drawing alone answers
// none of them; a scale bar answers them to the nearest half-metre, which is not an answer.
//
// Every figure here is DERIVED from the plan, never placed by hand — a designer who moves the stage
// moves every number that mentions it, and there is no dimension object to forget. Six kinds:
//
//   overall  the room's width and depth (dimensions.ts), off its bottom and right sides
//   chain    wall → each column/row of table centres → wall (setting-out.ts), off the top and left
//   size     an element's own sides: every side of a stage, width × depth of a rug or a bar
//   tie      an element's distance to the nearest wall, once across and once along — two numbers
//            fix where it stands
//   gap      edge to edge between an element and its nearest table and its nearest other element;
//            under the walkway minimum it is flagged
//   aisle    the narrowest edge-to-edge gap in each row and column of tables
//
// Pure geometry over world polygons the caller built — no catalog, no React — so it runs under node
// (npm run check:measurements). Which kinds a sheet carries is the sheet's choice (PlanSheet.measure).
import type { Point } from "@/lib/studio/hall";
import { pointInPolygon } from "@/lib/venues/faces";
import { overallDimensions } from "./dimensions";
import { cluster, settingOut } from "./setting-out";
import { isMain } from "../self-check";

export type DimKind = "overall" | "chain" | "size" | "tie" | "gap" | "aisle";

export interface Dim {
  kind: DimKind;
  /** The measured points. */
  a: Point;
  b: Point;
  /** Where the dimension line is drawn, as an offset from a→b. Zero: drawn on a→b itself. */
  offset: Point;
  mm: number;
  /** A gap narrower than the walkway minimum. */
  warn?: boolean;
}

export interface Leader {
  from: Point;
  to: Point;
}

/** Something on the floor, as a closed polygon in world mm (a table without its chairs). */
export interface Solid {
  id: string;
  kind: "table" | "stage" | "rug" | "item";
  polygon: Point[];
}

export interface MeasureInput {
  /** Each zone on the sheet. */
  boundaries: Point[][];
  /** Every wall as straight segments (a bowed wall sampled). Zone outlines are added as walls too —
   *  a lawn has no walls, but its edge is still what an element is measured off. */
  walls: [Point, Point][];
  solids: Solid[];
  /** Numbered units' centres — a block of tables is one centre. */
  centres: Point[];
}

export interface MeasureOptions {
  overall?: boolean;
  chains?: boolean;
  sizes?: boolean;
  ties?: boolean;
  gaps?: boolean;
  aisles?: boolean;
  /** How far an offset dimension sits off what it measures, in world mm. */
  offsetMm: number;
  /** The narrowest a walkway may be before it is flagged. */
  minWalkwayMm?: number;
  /** Gaps wider than this are not worth a figure. */
  gapReachMm?: number;
}

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Point) => Math.hypot(v.x, v.y);

function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const d = sub(b, a);
  const l2 = d.x * d.x + d.y * d.y;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / l2)) : 0;
  return { x: a.x + t * d.x, y: a.y + t * d.y };
}

function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const o = (a: Point, b: Point, c: Point) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return o(p1, p2, q1) !== o(p1, p2, q2) && o(q1, q2, p1) !== o(q1, q2, p2);
}

/** The two nearest points of two polygons, and the distance between them (0 when they touch or
 *  overlap). */
export function polygonGap(P: Point[], Q: Point[]): { mm: number; a: Point; b: Point } {
  let best = { mm: Infinity, a: P[0], b: Q[0] };
  for (let i = 0; i < P.length; i++) {
    const p1 = P[i], p2 = P[(i + 1) % P.length];
    for (let j = 0; j < Q.length; j++) {
      const q1 = Q[j], q2 = Q[(j + 1) % Q.length];
      if (segmentsCross(p1, p2, q1, q2)) return { mm: 0, a: p1, b: p1 };
      for (const [pt, s1, s2, mine] of [
        [p1, q1, q2, true],
        [p2, q1, q2, true],
        [q1, p1, p2, false],
        [q2, p1, p2, false],
      ] as [Point, Point, Point, boolean][]) {
        const c = closestOnSegment(pt, s1, s2);
        const d = len(sub(pt, c));
        if (d < best.mm) best = mine ? { mm: d, a: pt, b: c } : { mm: d, a: c, b: pt };
      }
    }
  }
  if (pointInPolygon(P[0], Q) || pointInPolygon(Q[0], P)) return { mm: 0, a: P[0], b: P[0] };
  return best;
}

/** Where a ray from `p` along `dir` first meets a wall, or null. */
function cast(p: Point, dir: Point, walls: [Point, Point][]): Point | null {
  let best: Point | null = null;
  let bestT = Infinity;
  for (const [a, b] of walls) {
    const e = sub(b, a);
    const den = dir.x * e.y - dir.y * e.x;
    if (Math.abs(den) < 1e-9) continue;
    const w = sub(a, p);
    const t = (w.x * e.y - w.y * e.x) / den;
    const u = (w.x * dir.y - w.y * dir.x) / den;
    if (t > 1 && u >= 0 && u <= 1 && t < bestT) {
      bestT = t;
      best = { x: p.x + dir.x * t, y: p.y + dir.y * t };
    }
  }
  return best;
}

/** Four corners, each a right angle. */
function isRectangle(poly: Point[]): boolean {
  if (poly.length !== 4) return false;
  return poly.every((p, i) => {
    const a = poly[(i + 3) % 4], b = poly[(i + 1) % 4];
    const u = sub(a, p), v = sub(b, p);
    return Math.abs(u.x * v.x + u.y * v.y) < 1e-3 * len(u) * len(v);
  });
}

const centroid = (poly: Point[]) => ({
  x: poly.reduce((n, p) => n + p.x, 0) / poly.length,
  y: poly.reduce((n, p) => n + p.y, 0) / poly.length,
});

export function measurements(input: MeasureInput, opts: MeasureOptions): { dims: Dim[]; leaders: Leader[] } {
  const dims: Dim[] = [];
  const leaders: Leader[] = [];
  const { offsetMm, minWalkwayMm = 1200, gapReachMm = 5000 } = opts;
  const walls: [Point, Point][] = [
    ...input.walls,
    ...input.boundaries.flatMap((b) => b.map((p, i) => [p, b[(i + 1) % b.length]] as [Point, Point])),
  ];
  const tables = input.solids.filter((s) => s.kind === "table");
  const elements = input.solids.filter((s) => s.kind !== "table");

  if (opts.overall) {
    for (const boundary of input.boundaries) {
      for (const d of overallDimensions(boundary, offsetMm)) {
        const horizontal = d.from.y === d.to.y;
        dims.push({ kind: "overall", a: d.from, b: d.to, offset: horizontal ? { x: 0, y: d.offsetMm } : { x: d.offsetMm, y: 0 }, mm: len(sub(d.to, d.from)) });
      }
    }
  }

  if (opts.chains) {
    for (const boundary of input.boundaries) {
      const here = input.boundaries.length === 1 ? input.centres : input.centres.filter((c) => pointInPolygon(c, boundary));
      for (const c of settingOut(here, boundary, { offsetMm })) {
        const at = (s: number) => (c.axis === "x" ? { x: s, y: c.lineAt } : { x: c.lineAt, y: s });
        for (let i = 1; i < c.stops.length; i++) {
          dims.push({ kind: "chain", a: at(c.stops[i - 1]), b: at(c.stops[i]), offset: { x: 0, y: 0 }, mm: c.stops[i] - c.stops[i - 1] });
        }
        c.feet.forEach((f, i) => leaders.push({ from: at(c.stops[i + 1]), to: f }));
      }
    }
  }

  if (opts.sizes) {
    for (const e of elements) {
      const mid = centroid(e.polygon);
      // A shaped stage is measured on every side — it is built side by side, and a crew checks each
      // one. A rectangle (any stage that is one) and everything else is a box: its width and its
      // depth, off two adjacent sides; the opposite two would only say the same numbers again.
      const sides = e.kind === "stage" && !isRectangle(e.polygon) ? e.polygon.map((_, i) => i) : [0, 1];
      for (const i of sides) {
        const a = e.polygon[i];
        const b = e.polygon[(i + 1) % e.polygon.length];
        const l = len(sub(b, a));
        if (l < 300) continue;
        let n = { x: (b.y - a.y) / l, y: -(b.x - a.x) / l };
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if ((m.x - mid.x) * n.x + (m.y - mid.y) * n.y < 0) n = { x: -n.x, y: -n.y };
        dims.push({ kind: "size", a, b, offset: { x: n.x * offsetMm * 0.6, y: n.y * offsetMm * 0.6 }, mm: l });
      }
    }
  }

  if (opts.ties) {
    for (const e of elements) {
      // From the element's extreme vertex in each direction, square to the wall it faces; keep the
      // nearer of left/right and of up/down. Two figures fix the element; four would only restate
      // the room's width.
      const ext = (key: "x" | "y", sign: 1 | -1) => e.polygon.reduce((best, p) => (p[key] * sign > best[key] * sign ? p : best), e.polygon[0]);
      for (const [axis, dirs] of [
        ["x", [-1, 1]],
        ["y", [-1, 1]],
      ] as ["x" | "y", (1 | -1)[]][]) {
        let pick: Dim | null = null;
        for (const s of dirs) {
          const from = ext(axis, s);
          const hit = cast(from, axis === "x" ? { x: s, y: 0 } : { x: 0, y: s }, walls);
          if (!hit) continue;
          const mm = len(sub(hit, from));
          if (mm < 50 || mm > 40000) continue;
          if (!pick || mm < pick.mm) pick = { kind: "tie", a: from, b: hit, offset: { x: 0, y: 0 }, mm };
        }
        if (pick) dims.push(pick);
      }
    }
  }

  if (opts.gaps) {
    const seen = new Set<string>();
    for (const e of elements) {
      for (const pool of [tables, elements.filter((x) => x.id !== e.id)]) {
        let best: { s: Solid; g: ReturnType<typeof polygonGap> } | null = null;
        for (const s of pool) {
          const g = polygonGap(e.polygon, s.polygon);
          if (g.mm > 0 && (!best || g.mm < best.g.mm)) best = { s, g };
        }
        if (!best || best.g.mm > gapReachMm) continue;
        const key = [e.id, best.s.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        dims.push({ kind: "gap", a: best.g.a, b: best.g.b, offset: { x: 0, y: 0 }, mm: best.g.mm, warn: best.g.mm < minWalkwayMm });
      }
    }
  }

  if (opts.aisles && tables.length > 1) {
    // Rows and columns as the chains find them, then the NARROWEST gap in each — the one that
    // decides whether a waiter with a tray gets through.
    const withC = tables.map((t) => ({ t, c: centroid(t.polygon) }));
    for (const axis of ["y", "x"] as const) {
      // A width already figured on this axis is not figured again: ten columns at the same 1.80
      // are one fact, and ten copies of it bury the ones that differ.
      const said: number[] = [];
      const other = axis === "y" ? "x" : "y";
      for (const line of cluster(withC.map((w) => w.c[axis]), 450)) {
        const run = withC.filter((w) => Math.abs(w.c[axis] - line) <= 450).sort((p, q) => p.c[other] - q.c[other]);
        let best: ReturnType<typeof polygonGap> | null = null;
        for (let i = 1; i < run.length; i++) {
          const g = polygonGap(run[i - 1].t.polygon, run[i].t.polygon);
          if (g.mm > 0 && (!best || g.mm < best.mm)) best = g;
        }
        if (!best || said.some((v) => Math.abs(v - best.mm) < 20)) continue;
        said.push(best.mm);
        dims.push({ kind: "aisle", a: best.a, b: best.b, offset: { x: 0, y: 0 }, mm: best.mm, warn: best.mm < minWalkwayMm });
      }
    }
  }

  return { dims, leaders };
}

// ponytail: self-check. Run: npm run check:measurements
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const rect = (x: number, y: number, w: number, h: number): Point[] => [
    { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
  ];
  const room = rect(0, 0, 20000, 12000);
  const walls = room.map((p, i) => [p, room[(i + 1) % 4]] as [Point, Point]);
  const stage = { id: "stage", kind: "stage" as const, polygon: rect(7000, 500, 6000, 3000) };
  const t = (id: string, x: number, y: number) => ({ id, kind: "table" as const, polygon: rect(x - 900, y - 900, 1800, 1800) });
  const tables = [t("t1", 4000, 6000), t("t2", 8000, 6000), t("t3", 11000, 6000), t("t4", 4000, 9500), t("t5", 8000, 9500)];
  const input = { boundaries: [room], walls, solids: [stage, ...tables], centres: tables.map((x) => centroid(x.polygon)) };
  const all = measurements(input, { overall: true, chains: true, sizes: true, ties: true, gaps: true, aisles: true, offsetMm: 900 });
  const of = (k: DimKind) => all.dims.filter((d) => d.kind === k);

  assert(of("overall").length === 2, "the room is figured on two sides");
  assert(of("size").length === 2 && of("size").some((d) => d.mm === 6000) && of("size").some((d) => d.mm === 3000), "a rectangular stage is figured by its width and depth");
  const ell = measurements({ ...input, solids: [{ id: "L", kind: "stage", polygon: [{ x: 1000, y: 1000 }, { x: 7000, y: 1000 }, { x: 7000, y: 3000 }, { x: 4000, y: 3000 }, { x: 4000, y: 5000 }, { x: 1000, y: 5000 }] }] }, { sizes: true, offsetMm: 900 });
  assert(ell.dims.length === 6, "a shaped stage is figured on every side");
  const back = of("size").find((d) => d.a.y === 500 && d.b.y === 500)!;
  assert(back.offset.y < 0, "a side's figure sits OUTSIDE the stage");
  const ties = of("tie");
  assert(ties.length === 2, "two ties fix an element");
  assert(ties.some((d) => d.mm === 500), "the stage is 0.50 off the back wall");
  assert(ties.some((d) => d.mm === 7000), "…and 7.00 off the nearer side wall");
  const gap = of("gap")[0];
  assert(gap && gap.mm === 1600 && gap.warn === false, "the stage's front is 1.60 from the nearest table");
  const aisles = of("aisle");
  assert(aisles.some((d) => Math.abs(d.mm - 1200) < 1), "the narrowest gap in the first row is its aisle (11.0−8.0−1.8 = 1.20)");
  assert(aisles.some((d) => Math.abs(d.mm - 1700) < 1), "columns get an aisle too (9.5−6.0−1.8 = 1.70)");
  assert(aisles.filter((d) => Math.abs(d.mm - 1700) < 1).length === 1, "two columns at the same 1.70 are figured once")
  assert(of("chain").length > 0 && all.leaders.length > 0, "the chains come through");

  const tight = measurements({ ...input, solids: [stage, t("near", 10000, 4600)] }, { gaps: true, offsetMm: 900 });
  assert(tight.dims[0]?.warn === true && Math.abs(tight.dims[0].mm - 200) < 1, "a 0.20 gap under the walkway minimum is flagged");
  assert(polygonGap(rect(0, 0, 10, 10), rect(5, 5, 10, 10)).mm === 0, "overlapping solids have no gap");
  console.log("measurements self-check passed");
}
