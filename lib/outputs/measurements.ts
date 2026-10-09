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
// WHAT STANDS ON A STAGE is measured off the STAGE, not the room: a head table set on a platform is
// placed by the crew from the platform's edge, and a figure running from it to the far wall crosses
// the stage and says nothing anyone can lay out with. So a thing whose centre is on a stage leaves
// the room's chains, ties and gaps, and gets the stage's own instead — chains from the stage's edges
// to its rows and columns of tables, and two ties from any other item to the nearest stage edges.
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
    // A hit at zero counts: an element touching a wall or the stage beside it is AT it, and the
    // caller drops that direction — skipping it would measure on through to whatever is beyond.
    if (t >= -1e-6 && u >= 0 && u <= 1 && t < bestT) {
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
  const stages = input.solids.filter((s) => s.kind === "stage");
  // The stage a thing stands on (its centre inside the outline), or none.
  const hostOf = (sd: Solid | Point): Solid | undefined => {
    const c = "polygon" in sd ? centroid(sd.polygon) : sd;
    return stages.find((st) => st !== sd && pointInPolygon(c, st.polygon));
  };
  const onFloor = (sd: Solid) => !hostOf(sd);
  const tables = input.solids.filter((s) => s.kind === "table");
  const elements = input.solids.filter((s) => s.kind !== "table");
  const sideRuns = (poly: Point[]) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as [Point, Point]);

  if (opts.overall) {
    for (const boundary of input.boundaries) {
      for (const d of overallDimensions(boundary, offsetMm)) {
        const horizontal = d.from.y === d.to.y;
        dims.push({ kind: "overall", a: d.from, b: d.to, offset: horizontal ? { x: 0, y: d.offsetMm } : { x: d.offsetMm, y: 0 }, mm: len(sub(d.to, d.from)) });
      }
    }
  }

  // WHERE A STAGE'S CHAIN RUNS. Off the stage on the side settingOut picks, unless that line crosses
  // another element or leaves the room (a stage along a wall has nothing but wall on its far side,
  // and a stage beside another has the other stage there). Then the opposite side; then INSIDE the
  // stage, along the strip between its edge and its first row of tables — the chain then reads
  // edge → table → table on the stage itself; and only if nothing is clear, where it started.
  const inRoom = (p: Point) => input.boundaries.length === 0 || input.boundaries.some((b) => pointInPolygon(p, b));
  const clearChain = (c: ReturnType<typeof settingOut>[number], host: Solid, onIt: Solid[]) => {
    const xs = host.polygon.map((p) => p.x), ys = host.polygon.map((p) => p.y);
    const lo = c.axis === "x" ? Math.min(...ys) : Math.min(...xs);
    const hi = c.axis === "x" ? Math.max(...ys) : Math.max(...xs);
    const off = lo - c.lineAt;
    const near = (pick: "lo" | "hi") => {
      const edges = onIt.flatMap((t) => t.polygon.map((p) => (c.axis === "x" ? p.y : p.x)));
      if (edges.length === 0) return null;
      const inner = pick === "lo" ? Math.min(...edges) : Math.max(...edges);
      const band = pick === "lo" ? inner - lo : hi - inner;
      return band >= 400 ? (pick === "lo" ? lo + band / 2 : hi - band / 2) : null;
    };
    const candidates = [
      { at: c.lineAt, outside: true },
      { at: hi + off, outside: true },
      { at: near("lo"), outside: false },
      { at: near("hi"), outside: false },
    ].filter((k): k is { at: number; outside: boolean } => k.at !== null);
    const others = input.solids.filter((sd) => sd !== host && (sd.kind !== "table" || !onIt.includes(sd)));
    const clear = (at: number, outside: boolean) => {
      const a = c.axis === "x" ? { x: c.stops[0], y: at } : { x: at, y: c.stops[0] };
      const b = c.axis === "x" ? { x: c.stops[c.stops.length - 1], y: at } : { x: at, y: c.stops[c.stops.length - 1] };
      const seg = [a, b];
      const pool = outside ? others : onIt;
      if (pool.some((sd) => polygonGap(seg, sd.polygon).mm === 0)) return false;
      return !outside || (inRoom(a) && inRoom(b) && inRoom({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }));
    };
    const pick = candidates.find((k) => clear(k.at, k.outside));
    return pick ? { ...c, lineAt: pick.at } : c;
  };

  const pushChain = (c: ReturnType<typeof settingOut>[number]) => {
    const at = (s: number) => (c.axis === "x" ? { x: s, y: c.lineAt } : { x: c.lineAt, y: s });
    for (let i = 1; i < c.stops.length; i++) {
      dims.push({ kind: "chain", a: at(c.stops[i - 1]), b: at(c.stops[i]), offset: { x: 0, y: 0 }, mm: c.stops[i] - c.stops[i - 1] });
    }
    c.feet.forEach((f, i) => leaders.push({ from: at(c.stops[i + 1]), to: f }));
  };
  if (opts.chains) {
    const floorCentres = input.centres.filter((c) => !hostOf(c));
    // On each stage: its edges to its rows and columns of tables, set further out than the stage's
    // own side figures so the two never share a line.
    for (const st of stages) {
      const here = input.centres.filter((c) => hostOf(c) === st);
      const onIt = tables.filter((t) => hostOf(t) === st);
      for (const c of settingOut(here, st.polygon, { offsetMm: offsetMm * 1.4 })) pushChain(clearChain(c, st, onIt));
    }
    for (const boundary of input.boundaries) {
      const here = input.boundaries.length === 1 ? floorCentres : floorCentres.filter((c) => pointInPolygon(c, boundary));
      for (const c of settingOut(here, boundary, { offsetMm })) pushChain(c);
    }
  }

  if (opts.sizes) {
    for (const e of elements) {
      const mid = centroid(e.polygon);
      // A shaped stage is measured on every side — it is built side by side, and a crew checks each
      // one. A rectangle (any stage that is one) and everything else is a box: its width and its
      // depth, off two adjacent sides; the opposite two would only say the same numbers again.
      //
      // Of each pair of opposite sides, the one facing OPEN floor: a stage pushed against another
      // has its figure on the free side, not printed across its neighbour.
      const openSide = (i: number) => {
        const a = e.polygon[i], b = e.polygon[(i + 1) % e.polygon.length];
        const l = len(sub(b, a)) || 1;
        let nn = { x: (b.y - a.y) / l, y: -(b.x - a.x) / l };
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if ((m.x - mid.x) * nn.x + (m.y - mid.y) * nn.y < 0) nn = { x: -nn.x, y: -nn.y };
        const probe = { x: m.x + nn.x * offsetMm, y: m.y + nn.y * offsetMm };
        return inRoom(probe) && !elements.some((x) => x !== e && x !== hostOf(e) && pointInPolygon(probe, x.polygon));
      };
      const rectangular = e.polygon.length === 4 && (e.kind !== "stage" || isRectangle(e.polygon));
      const sides = !rectangular
        ? e.polygon.map((_, i) => i)
        : [openSide(0) || !openSide(2) ? 0 : 2, openSide(1) || !openSide(3) ? 1 : 3];
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
      const host = hostOf(e);
      // A tie runs to the first thing in its way — a wall, or another element standing on the same
      // floor: a stage measured "to the far wall" straight through the stage beside it says nothing.
      // Touching that element (under 5cm) leaves that direction to the other side.
      const blockers = elements.filter((x) => x !== e && x !== host && hostOf(x) === host).flatMap((x) => sideRuns(x.polygon));
      const against = [...(host ? sideRuns(host.polygon) : walls), ...blockers];
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
          const hit = cast(from, axis === "x" ? { x: s, y: 0 } : { x: 0, y: s }, against);
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
    for (const e of elements.filter(onFloor)) {
      for (const pool of [tables.filter(onFloor), elements.filter((x) => x.id !== e.id && onFloor(x))]) {
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
    // The room's tables and each stage's tables are separate rooms as far as an aisle goes.
    const hosts = new Map<Solid | undefined, Solid[]>();
    for (const t of tables) hosts.set(hostOf(t), [...(hosts.get(hostOf(t)) ?? []), t]);
    for (const group of hosts.values()) {
    const withC = group.map((t) => ({ t, c: centroid(t.polygon) }));
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
  // The stage stands 0.50 off the back wall — no room for a figure there — so its width is figured
  // along the front, outside the stage.
  const width = of("size").find((d) => d.mm === 6000)!;
  assert(width.a.y === 3500 && width.offset.y > 0, "a side's figure sits OUTSIDE the stage, on the side with room for it");
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
  // A platform carrying a head table and a DJ booth: both measured off the platform, not the room.
  const platform = { id: "plat", kind: "stage" as const, polygon: rect(2000, 1000, 8000, 3000) };
  const head = t("head", 4000, 2500);
  const booth = { id: "booth", kind: "item" as const, polygon: rect(8000, 1500, 1500, 1500) };
  const floorT = t("floor", 6000, 9000);
  const onStage = measurements(
    { boundaries: [room], walls, solids: [platform, head, booth, floorT], centres: [centroid(head.polygon), centroid(floorT.polygon)] },
    { chains: true, ties: true, gaps: true, offsetMm: 900 },
  );
  const boothTies = onStage.dims.filter((d) => d.kind === "tie" && d.a.x >= 8000 && d.a.x <= 9500 && d.a.y >= 1500 && d.a.y <= 3000);
  assert(boothTies.length === 2 && boothTies.every((d) => d.mm <= 1000), "an item on a stage is tied to the stage's edges (0.50 / 0.50), not the walls");
  // The platform's top side is 1.00 off the wall, so a chain there would sit outside the room: it
  // takes the platform's open side instead (4000 + 1260).
  const stageChain = onStage.dims.filter((d) => d.kind === "chain" && d.a.y === d.b.y && Math.abs(d.a.y - 5260) < 1);
  assert(stageChain.length === 2 && stageChain[0].mm === 2000, "a table on a stage is chained from the stage's edge (2.00 in), on the side that is in the room");
  assert(!onStage.dims.some((d) => d.kind === "gap" && (d.a.x === head.polygon[0].x || d.b.x === head.polygon[0].x) && d.mm > 3000), "a table on a stage is not gapped against the room");
  // Two stages side by side along a wall: the square's tie does not cross the strip to the far wall,
  // and the strip's chain does not run through the square.
  const strip = { id: "strip", kind: "stage" as const, polygon: rect(16000, 1000, 3000, 10000) };
  const square = { id: "square", kind: "stage" as const, polygon: rect(11000, 3000, 5000, 5000) };
  const onStrip = [t("s1", 17500, 3000), t("s2", 17500, 6000), t("s3", 17500, 9000)];
  const pair = measurements(
    { boundaries: [room], walls, solids: [strip, square, ...onStrip], centres: onStrip.map((x) => centroid(x.polygon)) },
    { chains: true, ties: true, offsetMm: 900 },
  );
  const squareTies = pair.dims.filter((d) => d.kind === "tie" && d.a.x >= 11000 && d.a.x <= 16000 && d.a.y >= 3000 && d.a.y <= 8000);
  assert(squareTies.every((d) => !(d.b.x > 16000)), "a stage's tie stops at the stage beside it");
  assert(squareTies.some((d) => d.mm === 11000), "…and measures to the open side instead (11.00 to the left wall)");
  const pairSizes = measurements({ boundaries: [room], walls, solids: [strip, square], centres: [] }, { sizes: true, offsetMm: 900 });
  const squareSizes = pairSizes.dims.filter((d) => d.a.x >= 11000 && d.a.x <= 16000 && d.b.x >= 11000 && d.b.x <= 16000 && d.a.y >= 3000 && d.b.y <= 8000);
  assert(squareSizes.every((d) => !(d.a.x === 16000 && d.b.x === 16000)), "a stage's depth is figured on its open side, not across the stage it touches");
  const rowChain = pair.dims.filter((d) => d.kind === "chain" && d.a.x === d.b.x);
  assert(rowChain.length > 0 && rowChain.every((d) => d.a.x > 16000), "the strip's row chain runs inside the strip, not through the square");
  console.log("measurements self-check passed");
}
