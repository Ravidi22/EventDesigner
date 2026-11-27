// npm run check:wall-split — the self-check of ./wall-split.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { EdgeCurve, Point } from "@/lib/studio/hall";
import { absoluteControlPoints, cubicPointAt } from "@/lib/studio/geometry";
import { nodeMap, wallPoints, type VenueStructure, type Wall } from "./structure";
import { hasWall, joinable, joinRefusal, joinWalls, mergeNodes, splitWall, typedHeightAlong, wallChain } from "./wall-split";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (p: Point, q: Point, tol = 0.5) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
const BOW: EdgeCurve = { c1: { x: 3000, y: -2000 }, c2: { x: -3000, y: -2000 } };
const s: VenueStructure = {
  nodes: [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 10000, y: 0 },
    { id: "C", x: 0, y: 5000 },
    { id: "D", x: 10000, y: 5000 },
  ],
  walls: [
    { id: "w", a: "A", b: "B", kind: "wall", heightMm: 2800 },
    { id: "wb", a: "C", b: "D", kind: "wall", curve: BOW },
  ],
  entrances: [{ id: "d", wallId: "w", distanceMm: 2000, widthMm: 1000, swingInward: true, doubleDoor: false }],
  features: [],
};
const ok = (r: ReturnType<typeof splitWall>) => {
  if ("error" in r) throw new Error("FAIL: unexpected refusal — " + r.error);
  return r;
};

// A straight wall split at 0.6.
const r = ok(splitWall(s, "w", 0.6));
const node = r.structure.nodes.find((n) => n.id === r.nodeId)!;
assert(near(node, { x: 6000, y: 0 }), "the new corner stands on the wall at t");
const chain = wallChain(r.structure, "w")!;
assert(chain.length === 2, "the old id resolves to two pieces");
const [left, right] = chain;
assert(left.from === 0 && left.to === 0.6 && right.from === 0.6 && right.to === 1, "covering 0–0.6 and 0.6–1");
assert(left.wall.heightMm === 2800 && right.wall.heightMm === 2800 && right.wall.kind === "wall", "both halves inherit height and kind");
assert(r.structure.walls.length === 3 && !r.structure.walls.some((w) => w.id === "w"), "the old wall is gone from walls");
const door = r.structure.entrances[0];
assert(door.wallId === left.wall.id && Math.abs(door.distanceMm - 2000) < 1, "the door goes to the half its middle stands on, same world position");
assert(hasWall(s, "w") && hasWall(r.structure, "w") && hasWall(r.structure, left.wall.id), "the old id is still a wall to everyone who asks");

// Refusals.
const inDoor = splitWall(s, "w", 0.2);
assert("error" in inDoor && inDoor.error === "הנקודה בתוך פתח הדלת", "a point inside an opening is refused");
assert("error" in splitWall(s, "w", 0.005) && "error" in splitWall(s, "w", 0.995), "a point at a corner is refused");
assert("error" in splitWall(s, "nope", 0.5), "an unknown wall is refused");

// A bowed wall: the two halves draw the curve that was there.
const rb = ok(splitWall(s, "wb", 0.4));
const [bl, br] = wallChain(rb.structure, "wb")!;
const nodes = nodeMap(rb.structure);
const cub = (w: Wall) => {
  const { a, b } = wallPoints(rb.structure, w, nodes)!;
  const { c1, c2 } = absoluteControlPoints(a, b, w.curve!);
  return (u: number) => cubicPointAt(a, c1, c2, b, u);
};
const before = (u: number) => cubicPointAt({ x: 0, y: 5000 }, { x: 3000, y: 3000 }, { x: 7000, y: 3000 }, { x: 10000, y: 5000 }, u);
for (let i = 0; i <= 20; i++) {
  const u = i / 20;
  const after = u <= 0.4 ? cub(bl.wall)(u / 0.4) : cub(br.wall)((u - 0.4) / 0.6);
  assert(near(after, before(u)), `the halves draw the old bow (u ${u})`);
}

// Nested: the right half split again at its middle.
const r2 = ok(splitWall(r.structure, right.wall.id, 0.5));
const nested = wallChain(r2.structure, "w")!;
assert(
  nested.length === 3 && nested[1].from === 0.6 && Math.abs(nested[1].to - 0.8) < 1e-9 && Math.abs(nested[2].from - 0.8) < 1e-9 && nested[2].to === 1,
  "a split half splits again: 0–0.6, 0.6–0.8, 0.8–1",
);

// Dangling: one piece gone → the old id is gone, as a deleted wall is today.
const gone: VenueStructure = { ...r.structure, walls: r.structure.walls.filter((w) => w.id !== left.wall.id) };
assert(wallChain(gone, "w") === null && !hasWall(gone, "w"), "a chain with a piece gone resolves to nothing");

// A split wall's typed height: the lowest typed among the walls in its place (a curtain is never
// taller than the wall it hangs on).
assert(typedHeightAlong(r.structure, "w") === 2800, "a split wall keeps its typed height");
const lowered: VenueStructure = { ...r.structure, walls: r.structure.walls.map((w) => (w.id === right.wall.id ? { ...w, heightMm: 2000 } : w)) };
assert(typedHeightAlong(lowered, "w") === 2000, "…the lower half wins");
assert(typedHeightAlong(s, "wb") === undefined && typedHeightAlong(s, "gone") === undefined, "no typed height, or no wall: undefined");

// ── Joining back ─────────────────────────────────────────────────────────────────────────────
const j = joinWalls(r.structure, r.nodeId);
if ("error" in j) throw new Error("FAIL: " + j.error);
assert(j.wallId === "w" && j.structure.walls.some((w) => w.id === "w" && w.a === "A" && w.b === "B" && w.heightMm === 2800), "joining a lineage's whole chain gives the ORIGINAL wall back");
assert(!j.structure.wallLineage?.some((l) => l.id === "w") && !j.straightened, "and drops the lineage entry, nothing straightened");
assert(j.structure.entrances[0].wallId === "w" && Math.abs(j.structure.entrances[0].distanceMm - 2000) < 1, "the door is back on the original, same place");
assert(!j.structure.nodes.some((n) => n.id === r.nodeId) && j.structure.walls.length === 2, "the corner and the halves are gone");

const jb = joinWalls(rb.structure, rb.nodeId);
if ("error" in jb) throw new Error("FAIL: " + jb.error);
const wbBack = jb.structure.walls.find((w) => w.id === "wb")!;
assert(!jb.straightened && !!wbBack.curve && near(wbBack.curve.c1, BOW.c1, 1) && near(wbBack.curve.c2, BOW.c2, 1), "a bowed wall joins back with its bow");
const moved: VenueStructure = { ...rb.structure, nodes: rb.structure.nodes.map((n) => (n.id === rb.nodeId ? { ...n, y: n.y - 500 } : n)) };
const jm = joinWalls(moved, rb.nodeId);
if ("error" in jm) throw new Error("FAIL: " + jm.error);
assert(jm.straightened && !jm.structure.walls.find((w) => w.id === "wb")!.curve, "moved off its bow, it joins as a straight wall and says so");

// Two walls that were never one: a NEW wall, and each old id names its share of it.
const pq: VenueStructure = {
  nodes: [{ id: "A", x: 0, y: 0 }, { id: "M", x: 4000, y: 0 }, { id: "B", x: 10000, y: 0 }],
  walls: [{ id: "p", a: "A", b: "M", kind: "wall" }, { id: "q", a: "B", b: "M", kind: "wall" }],
  entrances: [{ id: "d2", wallId: "q", distanceMm: 1000, widthMm: 800, swingInward: false, doubleDoor: false }],
  features: [],
};
const jpq = joinWalls(pq, "M");
if ("error" in jpq) throw new Error("FAIL: " + jpq.error);
assert(jpq.wallId !== "p" && jpq.wallId !== "q" && jpq.structure.walls.length === 1, "an unrelated pair joins into a new wall");
const [pp] = wallChain(jpq.structure, "p")!;
const [qq] = wallChain(jpq.structure, "q")!;
assert(pp.wall.id === jpq.wallId && pp.from === 0 && pp.to === 1 && Math.abs(pp.u0 - 0) < 1e-9 && Math.abs(pp.u1 - 0.4) < 1e-9, "p is the first 0.4 of the new wall");
assert(Math.abs(qq.u0 - 1) < 1e-9 && Math.abs(qq.u1 - 0.4) < 1e-9, "q (drawn B→M) is the new wall from its end back to 0.4");
assert(Math.abs(jpq.structure.entrances[0].distanceMm - 9000) < 1, "q's door keeps its place on the joined wall");

// Refusals: two kinds, three walls, a loop of two.
const mixed: VenueStructure = { ...pq, walls: [pq.walls[0], { ...pq.walls[1], kind: "edge" }] };
assert(joinRefusal(mixed, "M") === "קיר וגבול שטח לא מתחברים" && !joinable(mixed, "M") && "error" in joinWalls(mixed, "M"), "a wall and an edge do not join");
assert(joinRefusal(pq, "M") === null && joinable(pq, "M"), "two walls of one kind join");
const three: VenueStructure = { ...pq, nodes: [...pq.nodes, { id: "T", x: 4000, y: 3000 }], walls: [...pq.walls, { id: "t", a: "M", b: "T", kind: "wall" }] };
assert(!joinable(three, "M") && joinRefusal(three, "M") === null, "three walls at a corner do not join (and are not refused — Delete keeps today's rule)");

// Nested: split w, split its right half, join the inner corner → the right half comes back.
const jn = joinWalls(r2.structure, r2.nodeId);
if ("error" in jn) throw new Error("FAIL: " + jn.error);
assert(jn.wallId === right.wall.id && wallChain(jn.structure, "w")!.length === 2, "joining a half's own split gives the half back; the original still resolves");

// ── Merging two corners ──────────────────────────────────────────────────────────────────────
const xy: VenueStructure = {
  nodes: [{ id: "X", x: 0, y: 0 }, { id: "Y", x: 5000, y: 0 }, { id: "Z", x: 5000, y: 5000 }],
  walls: [{ id: "x1", a: "X", b: "Z", kind: "wall" }, { id: "x2", a: "X", b: "Y", kind: "wall" }, { id: "x3", a: "Y", b: "Z", kind: "wall" }],
  entrances: [],
  features: [],
};
const m = mergeNodes(xy, "X", "Y");
assert(!m.nodes.some((n) => n.id === "X"), "the dragged corner is gone");
assert(!m.walls.some((w) => w.id === "x2"), "the wall between the two corners collapses and goes");
assert(m.walls.length === 1 && (m.walls[0].a === "Y" || m.walls[0].b === "Y"), "a wall doubled by the merge is kept once, on the kept corner");
assert(m.walls[0].id === "x3" && wallChain(m, "x1")?.[0].wall.id === "x3", "…the wall that stood there stays, and the doubled one's id names it");

// ── Review fixes (2026-11-20) ────────────────────────────────────────────────────────────────
// A drape hung on a HALF after the split keeps hanging when the halves are joined back.
const leftShare = wallChain(j.structure, left.wall.id);
const rightShare = wallChain(j.structure, right.wall.id);
assert(
  !!leftShare && leftShare.length === 1 && leftShare[0].wall.id === "w" && leftShare[0].u0 === 0 && Math.abs(leftShare[0].u1 - 0.6) < 1e-9,
  "after a join back, the left half's id names 0–0.6 of the restored wall",
);
assert(!!rightShare && Math.abs(rightShare[0].u0 - 0.6) < 1e-9 && rightShare[0].u1 === 1, "…and the right half's 0.6–1");
const [innerL, innerR] = wallChain(r2.structure, right.wall.id)!;
const innerBack = wallChain(jn.structure, innerL.wall.id);
assert(!!innerBack && innerBack[0].wall.id === right.wall.id && innerBack[0].u1 === 0.5 && !!wallChain(jn.structure, innerR.wall.id), "a nested join back keeps the inner halves' ids too");

// Taking a triangle's corner away would lay a second wall on the one already there: not a join.
const tri: VenueStructure = {
  nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 4000, y: 0 }, { id: "M", x: 2000, y: 2000 }],
  walls: [{ id: "ab", a: "A", b: "B", kind: "wall" }, { id: "am", a: "A", b: "M", kind: "wall" }, { id: "mb", a: "M", b: "B", kind: "wall" }],
  entrances: [],
  features: [],
};
assert(!joinable(tri, "M") && "error" in joinWalls(tri, "M"), "a triangle's corner does not join onto its own third wall");

// A merge doubles a wall only among the walls it rewired: the one already standing stays, the
// doubled one's openings move onto it and its id names it (direction honoured).
const fold: VenueStructure = {
  nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 10000, y: 0 }, { id: "N", x: 5000, y: 0 }],
  walls: [{ id: "ab", a: "A", b: "B", kind: "wall" }, { id: "nb", a: "N", b: "B", kind: "wall" }],
  entrances: [],
  features: [],
};
const foldCut = ok(splitWall(fold, "ab", 0.5));
const folded = mergeNodes(foldCut.structure, foldCut.nodeId, "N");
assert(folded.walls.some((w) => w.id === "nb") && hasWall(folded, "ab") && wallChain(folded, "ab")![1].wall.id === "nb", "a wall folded onto another keeps both ids alive");
const dup: VenueStructure = {
  nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 5000, y: 0 }, { id: "B2", x: 5000, y: 10 }],
  walls: [{ id: "ab", a: "A", b: "B", kind: "wall" }, { id: "b2a", a: "B2", b: "A", kind: "wall" }],
  entrances: [{ id: "d9", wallId: "b2a", distanceMm: 1000, widthMm: 800, swingInward: true, doubleDoor: false }],
  features: [],
};
const merged = mergeNodes(dup, "B2", "B");
const movedDoor = merged.entrances.find((e) => e.id === "d9");
assert(merged.walls.length === 1 && merged.walls[0].id === "ab" && !!movedDoor && movedDoor.wallId === "ab" && Math.abs(movedDoor.distanceMm - 4000) < 2, "the doubled wall's door moves onto the wall kept, at its place");
const rev = wallChain(merged, "b2a");
assert(!!rev && rev[0].wall.id === "ab" && rev[0].u0 === 1 && rev[0].u1 === 0, "a doubled wall drawn the other way names the kept one backwards");
const pair: VenueStructure = {
  nodes: [...dup.nodes, { id: "X", x: 9000, y: 9000 }, { id: "Y", x: 9500, y: 9000 }],
  walls: [{ id: "p1", a: "A", b: "B", kind: "wall" }, { id: "p2", a: "A", b: "B", kind: "wall", curve: { c1: { x: 0, y: 900 }, c2: { x: 0, y: 900 } } }, { id: "xy", a: "X", b: "Y", kind: "wall" }],
  entrances: [],
  features: [],
};
const elsewhere = mergeNodes(pair, "X", "Y");
assert(elsewhere.walls.some((w) => w.id === "p1") && elsewhere.walls.some((w) => w.id === "p2"), "a merge elsewhere never touches two walls that already shared their corners");

// Review focus 5 on a BOWED wall: the opening is measured on the chord, and a point inside it is refused.
const bowDoor: VenueStructure = { ...s, entrances: [{ id: "bd", wallId: "wb", distanceMm: 4000, widthMm: 1000, swingInward: true, doubleDoor: false }] };
const bowRefused = splitWall(bowDoor, "wb", 0.4);
assert("error" in bowRefused && bowRefused.error === "הנקודה בתוך פתח הדלת", "a point inside a door on a bowed wall is refused");

console.log("wall-split: ok");
