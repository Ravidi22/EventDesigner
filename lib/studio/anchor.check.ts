// npm run check:anchor — the self-check of ./anchor.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import type { VenueStructure } from "@/lib/venues/structure";
import { joinWalls, splitWall } from "@/lib/venues/wall-split";
import { doorOpenings, nearestWall, pointToT, resolveSpan, spanBand, wallSegment, wallTrack, WHOLE_WALL } from "./anchor";

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/anchor.ts
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 0.001) => Math.abs(a - b) < tol;

// A 10m wall along x, and a 6m wall along y meeting it at the origin.
const structure: VenueStructure = {
  nodes: [
    { id: "n0", x: 0, y: 0 },
    { id: "n1", x: 10000, y: 0 },
    { id: "n2", x: 0, y: 6000 },
  ],
  walls: [
    { id: "w-long", a: "n0", b: "n1", kind: "wall" },
    { id: "w-side", a: "n0", b: "n2", kind: "wall" },
    { id: "w-lip", a: "n1", b: "n2", kind: "edge" },
  ],
  entrances: [],
  features: [],
};

const seg = wallSegment(structure, "w-long")!;
assert(near(seg.lengthMm, 10000), "wall length");
assert(wallSegment(structure, "gone") === null, "a deleted wall resolves to nothing");

const whole = resolveSpan(structure, { wallId: "w-long", ...WHOLE_WALL })!;
assert(near(whole.lengthMm, 10000) && near(whole.from.x, 0) && near(whole.to.x, 10000), "the whole wall");

const part = resolveSpan(structure, { wallId: "w-long", from: 0.2, to: 0.5 })!;
assert(near(part.lengthMm, 3000) && near(part.from.x, 2000) && near(part.to.x, 5000), "a 3m run starting 2m along");

const backwards = resolveSpan(structure, { wallId: "w-long", from: 0.9, to: 0.4 })!;
assert(near(backwards.lengthMm, 5000) && near(backwards.from.x, 4000), "a span dragged past itself still draws");

const over = resolveSpan(structure, { wallId: "w-long", from: -1, to: 4 })!;
assert(near(over.lengthMm, 10000), "out-of-range fractions clamp to the wall");

assert(near(pointToT(seg, { x: 2500, y: 900 }), 0.25), "a point projects onto the wall it is beside");
assert(pointToT(seg, { x: -5000, y: 0 }) === 0, "…and clamps at the ends");

const dropped = nearestWall(structure, { x: 3000, y: 400 })!;
assert(dropped.wallId === "w-long" && near(dropped.t, 0.3), "a drop near the long wall picks it");
assert(nearestWall(structure, { x: 200, y: 4000 })!.wallId === "w-side", "…and a drop by the side wall picks that one");
assert(nearestWall(structure, { x: 9000, y: 5500 })!.wallId !== "w-lip", "an edge is a boundary, not something to hang a drape on");
assert(nearestWall({ nodes: [], walls: [], entrances: [], features: [] }, { x: 0, y: 0 }) === null, "no walls, no anchor");

// A door's opening: its jambs on the wall, half its width either side of its middle; a window is
// no opening to walk through.
const doors = doorOpenings({
  ...structure,
  entrances: [
    { id: "d", wallId: "w-long", distanceMm: 3000, widthMm: 1000, swingInward: true, doubleDoor: false },
    { id: "w", wallId: "w-long", distanceMm: 7000, widthMm: 2000, swingInward: true, doubleDoor: false, kind: "window" },
  ],
});
assert(doors.length === 1 && near(doors[0].a.x, 2500) && near(doors[0].b.x, 3500) && near(doors[0].a.y, 0), "a door is its opening on the wall, a window is not one");

// A bowed wall: a span follows the bow, is measured along it, and a point beside the bow finds
// the bow — not the chord it bows away from.
const bowed: VenueStructure = {
  ...structure,
  walls: [...structure.walls, { id: "w-bow", a: "n0", b: "n1", kind: "wall", curve: { c1: { x: 2500, y: 3000 }, c2: { x: -2500, y: 3000 } } }],
};
const track = wallTrack(bowed, "w-bow")!;
const apex = track.at(0.5);
assert(track.curved && near(apex.p.x, 5000, 1) && apex.p.y > 2000, "the middle of a bowed wall is out on the bow");
assert(near(apex.n.x, 0) && near(apex.n.y, 1), "…and its normal there is the chord's (the bow is symmetric)");
assert(track.lengthMm > track.chordMm + 500, `a bowed wall is longer along than across (${Math.round(track.lengthMm)} vs ${track.chordMm})`);
assert(near(track.nearestT({ x: 5000, y: apex.p.y + 300 }), 0.5, 0.02), "a point beside the bow finds the bow");
assert(near(track.tAt(track.mmAt(0.3)), 0.3, 0.01), "lengths along the wall and fractions go both ways");
const bowSpan = resolveSpan(bowed, { wallId: "w-bow", from: 0, to: 1 })!;
assert(bowSpan.path.length > 8 && near(bowSpan.lengthMm, track.lengthMm), "a span on a bowed wall follows it, and measures along it");
const strip = spanBand(track, 0.25, 0.75, 0, 220);
assert(strip.length === track.path(0.25, 0.75).length * 2, "a band along a bow is a curved strip");
const straightTrack = wallTrack(structure, "w-long")!;
assert(!straightTrack.curved && straightTrack.path(0, 1).length === 2 && near(straightTrack.nearestT({ x: 2500, y: 900 }), 0.25), "a straight wall is its chord, as before");

// ── A SPLIT wall's old id still names the same stretch (connected drawings §5) ──
const onLine = (pts: Point[], y: number, x0: number, x1: number) => pts.every((p) => Math.abs(p.y - y) < 0.5 && p.x >= x0 - 0.5 && p.x <= x1 + 0.5);
const cut = splitWall(structure, "w-long", 0.6);
if ("error" in cut) throw new Error("FAIL: " + cut.error);
const chainTr = wallTrack(cut.structure, "w-long")!;
assert(!!chainTr, "a split wall's old id still has a track");
assert(near(chainTr.lengthMm, 10000, 0.5) && near(chainTr.a.x, 0) && near(chainTr.b.x, 10000), "the chain runs the old wall's length, end to end");
const runAfter = chainTr.path(0.2, 0.8);
assert(near(runAfter[0].x, 2000, 0.5) && near(runAfter[runAfter.length - 1].x, 8000, 0.5) && onLine(runAfter, 0, 2000, 8000), "a drape's 0.2–0.8 hangs where it hung");
assert(near(chainTr.at(0.3).p.x, 3000, 0.5) && near(chainTr.at(0.9).p.x, 9000, 0.5) && near(chainTr.at(0.9).n.y, straightTrack.at(0.9).n.y), "points and the normal along it are the old wall's");
assert(near(chainTr.nearestT({ x: 7000, y: 500 }), 0.7, 1e-3) && near(chainTr.mmAt(0.75), 7500, 0.5) && near(chainTr.tAt(2500), 0.25, 1e-4), "nearest, mm and t read the old parameter");
// The new corner dragged a metre off the line: the drape bends with the wall.
const bent: VenueStructure = { ...cut.structure, nodes: cut.structure.nodes.map((n) => (n.id === cut.nodeId ? { ...n, y: 1000 } : n)) };
const runBent = wallTrack(bent, "w-long")!.path(0.2, 0.8);
assert(runBent.some((p) => near(p.x, 6000, 0.5) && near(p.y, 1000, 0.5)), "the drape has a corner where the wall now bends");

// A bowed wall split: every point of the old track, within half a millimetre.
const bowS: VenueStructure = { ...structure, walls: [{ id: "bw", a: "n0", b: "n1", kind: "wall", curve: { c1: { x: 3000, y: -2000 }, c2: { x: -3000, y: -2000 } } }] };
const bowBefore = wallTrack(bowS, "bw")!;
const bowCut = splitWall(bowS, "bw", 0.4);
if ("error" in bowCut) throw new Error("FAIL: " + bowCut.error);
const bowAfter = wallTrack(bowCut.structure, "bw")!;
for (let i = 0; i <= 10; i++) {
  const t = i / 10;
  const [p, q] = [bowBefore.at(t).p, bowAfter.at(t).p];
  assert(Math.hypot(p.x - q.x, p.y - q.y) < 0.5, `a bowed split keeps every point (t ${t})`);
}

// Joined into a new wall drawn the other way: the old id runs its own way along it.
const pq: VenueStructure = {
  nodes: [{ id: "A", x: 0, y: 0 }, { id: "M", x: 4000, y: 0 }, { id: "B", x: 10000, y: 0 }],
  walls: [{ id: "p", a: "A", b: "M", kind: "wall" }, { id: "q", a: "B", b: "M", kind: "wall" }],
  entrances: [],
  features: [],
};
const qBefore = wallTrack(pq, "q")!;
const joined = joinWalls(pq, "M");
if ("error" in joined) throw new Error("FAIL: " + joined.error);
const qAfter = wallTrack(joined.structure, "q")!;
assert(near(qAfter.at(0).p.x, 10000, 0.5) && near(qAfter.at(1).p.x, 4000, 0.5) && near(qAfter.lengthMm, 6000, 0.5), "q still runs from B to M");
assert(near(qAfter.at(0.5).n.y, qBefore.at(0.5).n.y), "…with its own left-hand side");
assert(wallTrack(joined.structure, "gone") === null, "a dangling id is still nothing");
assert(wallSegment(cut.structure, "w-long")!.lengthMm === 10000, "a split wall's old id still has its segment");

console.log("anchor self-check passed");
