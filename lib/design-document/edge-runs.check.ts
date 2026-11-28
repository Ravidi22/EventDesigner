// npm run check:edge-runs — the self-check of ./edge-runs.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point, StageEdgeKind } from "./types";
import { joinEdgeRuns, joinedItemsByStage, rad, type EdgeRunMember } from "./edge-runs";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
/** A straight flight along the line from `a`, `w` long in direction `deg`, `depth` deep to its
 *  left-hand side (the way the stage frame's items come out), with treads every 280mm. */
const flight = (stageId: string, itemId: string, a: Point, w: number, deg: number, depth = 840, kind: StageEdgeKind = "stairs", inner = false): EdgeRunMember => {
  const t = rad(deg);
  const u = { x: Math.cos(t), y: Math.sin(t) };
  const n = { x: -u.y, y: u.x };
  const at = (x: number, y: number): Point => ({ x: a.x + u.x * x + n.x * y, y: a.y + u.y * x + n.y * y });
  const treads: [Point, Point][] = [];
  if (kind === "stairs") for (let k = 280; k < depth - 1; k += 280) treads.push([at(0, k), at(w, k)]);
  return {
    stageId,
    itemId,
    shape: {
      kind,
      inner,
      outer: false,
      floorMm: 0,
      polygon: [at(0, 0), at(w, 0), at(w, depth), at(0, depth)],
      treads,
      lines: [[at(0, 0), at(w, 0)], ...treads.map(([p, q]) => [p, q]), [at(0, depth), at(w, depth)]],
      ends: ["free", "free"],
      base: at(w / 2, 0),
      foot: at(w / 2, depth),
      farLine: [at(0, depth), at(w, depth)],
      midline: [at(0, depth / 2), at(w, depth / 2)],
      angleDeg: deg,
      widthMm: w,
      depthMm: depth,
      risers: 4,
      riserMm: 150,
      riseMm: 600,
      heightMm: 0,
      seats: 0,
      chairs: [],
      sofaSeats: 0,
      sofaHeightMm: 0,
      cushions: [],
      backs: [],
    },
  };
};
const near = (p: Point, q: Point, tol = 1) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;

// Two stages side by side along y = 0, each with a flight along its front: one run.
const left = flight("A", "a1", { x: 0, y: 0 }, 2440, 0);
const right = flight("B", "b1", { x: 2440, y: 0 }, 2440, 0);
const one = joinEdgeRuns([left, right]);
assert(one.length === 1 && one[0].members.length === 2, "two flights end to end on two flush stages are one run");
assert(near(one[0].polygon[0], { x: 0, y: 0 }) && near(one[0].polygon[1], { x: 4880, y: 0 }) && near(one[0].polygon[2], { x: 4880, y: 840 }), "…a rectangle from the first's start to the second's end, as deep as they are");
assert(one[0].treads.length === 2 && one[0].treads.every(([a, b]) => near(a, { x: 0, y: a.y }) && near(b, { x: 4880, y: b.y })) && one[0].treads.map(([a]) => Math.round(a.y)).join() === "280,560", "…each tread one line across both, at the same depths");
assert(joinedItemsByStage(one).get("A")?.has("a1") === true && joinedItemsByStage(one).get("B")?.has("b1") === true, "…and both items are the run's, each under its own stage");
// A copied stage keeps its items' ids: C holds an "a1" too, standing nowhere near the run.
const copied = joinEdgeRuns([left, right, flight("C", "a1", { x: 0, y: 9000 }, 2440, 0)]);
assert(!joinedItemsByStage(copied).get("C")?.has("a1"), "a copy's item with the same id, not in the run, is still drawn by its own stage");
assert(one[0].midline.length === 2 && near(one[0].midline[0], { x: 0, y: 420 }), "…its middle line end to end");
assert(one[0].arrow !== undefined && near(one[0].arrow.from, { x: 2440, y: 840 - 100.8 }) && near(one[0].arrow.head[0], { x: 2440, y: 100.8 }), "…and ONE walking line up the middle of the run, from the floor to the edge");
const sunkRun = joinEdgeRuns([flight("A", "s1", { x: 0, y: 0 }, 2440, 0, 840, "stairs", true), flight("B", "s2", { x: 2440, y: 0 }, 2440, 0, 840, "stairs", true)]);
assert(sunkRun.length === 1 && sunkRun[0].arrow !== undefined && near(sunkRun[0].arrow.from, { x: 2440, y: 100.8 }) && near(sunkRun[0].arrow.head[0], { x: 2440, y: 840 - 100.8 }), "a recessed run is climbed from the edge in");
// A gap, a lean, a different depth, the other side, the same stage: not joined.
assert(joinEdgeRuns([left, flight("B", "b2", { x: 2440 + 100, y: 0 }, 2440, 0)]).length === 0, "ten centimetres apart they are two flights");
assert(joinEdgeRuns([left, flight("B", "b3", { x: 2440, y: 0 }, 2440, 5)]).length === 0, "…and so are two 5° out of line");
assert(joinEdgeRuns([left, flight("B", "b4", { x: 2440, y: 0 }, 2440, 0, 560)]).length === 0, "…and two of different depths");
assert(joinEdgeRuns([left, flight("B", "b5", { x: 2440, y: 0 }, 2440, 0, 840, "bench")]).length === 0, "…and a flight and a banquette");
assert(joinEdgeRuns([left, flight("A", "a2", { x: 2440, y: 0 }, 2440, 0)]).length === 0, "two items of ONE stage are its own affair (tidyEdgeItems joins them)");
// The second stage turned the other way: its flight runs the opposite direction along the same
// line, still out to the same side — one run. Standing out to the other side (facing each other
// across the line) — not.
const turned = flight("B", "b6", { x: 4880, y: 0 }, 2440, 180, 840);
// (turned, its depth points to −y: put it on the far side of the line so its depth points the same way)
const sameSide: EdgeRunMember = { ...turned, shape: { ...turned.shape, polygon: turned.shape.polygon.map((q) => ({ x: q.x, y: -q.y })), treads: turned.shape.treads.map(([a, b]) => [{ x: a.x, y: -a.y }, { x: b.x, y: -b.y }] as [Point, Point]) } };
assert(joinEdgeRuns([left, sameSide]).length === 1, "a flight on a stage turned round, running the other way along the same line, joins");
assert(joinEdgeRuns([left, turned]).length === 0, "…but not one standing out to the other side of it");
// A millimetre or two off, as flush stages come to be: joined. Three in a row: one run of three.
assert(joinEdgeRuns([left, flight("B", "b7", { x: 2442, y: 1 }, 2440, 0.5)]).length === 1, "flush to a millimetre or two is flush");
const three = joinEdgeRuns([left, right, flight("C", "c1", { x: 4880, y: 0 }, 2440, 0)]);
assert(three.length === 1 && three[0].members.length === 3 && near(three[0].polygon[1], { x: 7320, y: 0 }), "three in a row are one run of three");
// Barriers join too — a thin strip, no treads; a ramp never.
const rails = joinEdgeRuns([flight("A", "r1", { x: 0, y: 0 }, 2000, 0, 60, "barrier"), flight("B", "r2", { x: 2000, y: 0 }, 2000, 0, 60, "barrier")]);
assert(rails.length === 1 && rails[0].treads.length === 0 && rails[0].kind === "barrier" && !rails[0].arrow, "two barriers end to end are one rail, with no walking line");
assert(joinEdgeRuns([flight("A", "p1", { x: 0, y: 0 }, 1200, 0, 7200, "ramp"), flight("B", "p2", { x: 1200, y: 0 }, 1200, 0, 7200, "ramp")]).length === 0, "ramps are never joined");
// QA BQ-7: banquettes of two flush stages drawn as one run keep their sofa cushions and backrests.
const sofaBench = (stageId: string, itemId: string, x: number): EdgeRunMember => {
  const m = flight(stageId, itemId, { x, y: 0 }, 2400, 0, 600, "bench");
  const quad = (k: number): Point[] => [{ x: x + k * 600, y: 380 }, { x: x + (k + 1) * 600, y: 380 }, { x: x + (k + 1) * 600, y: 600 }, { x: x + k * 600, y: 600 }];
  return { ...m, shape: { ...m.shape, cushions: [0, 1, 2, 3].map(quad), backs: [[{ x, y: 380 }, { x: x + 2400, y: 380 }]] } };
};
const seatRun = joinEdgeRuns([sofaBench("A", "sa", 0), sofaBench("B", "sb", 2400)]);
assert(seatRun.length === 1 && seatRun[0].cushions.length === 8 && seatRun[0].backs.length === 2, "two flush banquettes drawn as one run keep every cushion and backrest of both");
assert(one[0].cushions.length === 0 && one[0].backs.length === 0, "…a run of stairs has none");

// Items standing through each other (a stage dragged over another) are not one run either.
assert(joinEdgeRuns([left, flight("B", "b8", { x: 1000, y: 0 }, 2440, 0)]).length === 0, "two flights overlapping along the line are not a run");
console.log("edge-runs self-check passed");
