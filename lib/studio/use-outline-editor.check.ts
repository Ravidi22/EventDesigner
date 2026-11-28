// npm run check:outline — the self-check of ./use-outline-editor.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Entrance, Point } from "./hall";
import { absoluteControlPoints, cubicPointAt, wallLengthMm } from "./geometry";
import { closedOutline, closeRefusal, COALESCE_MS, continuesEntry, initialState, MAX_HISTORY, patchToken, pushPast, reconcileSelection, redoStore, sanitizeEdgeCurves, sanitizeLockedEdges, sideIndicesAfterInsert, sideIndicesAfterRemove, undoStore, withEdgeReshaped, withFixturesSet, withSelectionMoved, withSelectionRemoved, withSideLength, withVertexInserted, withVertexMoved, withVertexRemoved, withWallMoved, type OutlineState, type Store } from "./use-outline-editor";

// ponytail: self-check. Run: npm run check:outline
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const square: Point[] = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1000 },
  { x: 0, y: 1000 },
];
const door = (id: string, wallIndex: number, distanceMm: number): Entrance => ({ id, wallIndex, distanceMm, widthMm: 200, swingInward: true, doubleDoor: false });
const base: OutlineState = { mode: "edit", outline: square, edgeCurves: [null, null, null, null], lockedEdges: [false, false, false, false], entrances: [], stage: undefined, bars: [] };

// Load-time sanitizing: pad a short/absent array out to the outline, and re-clamp a curve that
// was saved before the bulge clamp existed.
assert(sanitizeEdgeCurves(square, undefined).length === 4, "missing edgeCurves pad out to the outline length");
const wild = sanitizeEdgeCurves(square, [{ c1: { x: 0, y: 78176988 }, c2: { x: 0, y: -78176988 } }]);
assert(wild.length === 4 && wild[1] === null && wild[0] !== null, "a short saved array keeps what it had and pads the rest");
assert(Math.hypot(wild[0]!.c1.x, wild[0]!.c1.y) <= 3000 + 1e-6, "a corrupted saved curve is re-clamped on load");
assert(initialState({ outline: square }).mode === "edit" && initialState({ outline: [] }).mode === "draw", "mode is derived from the outline");
assert(sanitizeLockedEdges(square, undefined).length === 4 && sanitizeLockedEdges(square, undefined).every((v) => !v), "missing lockedEdges pad out to all-unlocked");
assert(sanitizeLockedEdges(square, [true]).join(",") === "true,false,false,false", "a short saved lock array keeps what it had and pads the rest unlocked");

// Locked walls: dragging (or numerically reshaping) either endpoint keeps a locked wall's length.
const oneLock = { ...base, lockedEdges: [true, false, false, false] }; // wall0 (v0→v1) locked at 1000mm
const draggedLocked = withVertexMoved(oneLock, 1, { x: 1400, y: 300 });
assert(Math.abs(wallLengthMm(oneLock.outline[0], draggedLocked.outline[1]) - 1000) < 1e-6, "dragging the far end of a locked wall keeps its length");
const ownWallLocked = withEdgeReshaped(oneLock, 0, { x: 2000, y: 0 });
assert(ownWallLocked === oneLock, "editing a locked wall's own length is refused outright");
const neighborLocked = { ...base, lockedEdges: [false, false, true, false] }; // wall2 (v2→v3, the far side) is locked
const guarded = withEdgeReshaped(neighborLocked, 0, { x: 1400, y: 0 });
assert(guarded.outline[1].x === 1400 && guarded.outline[1].y === 0, "the directly-edited wall still moves its own end vertex");
assert(guarded.outline[2].x === 1000 && guarded.outline[2].y === 1000 && guarded.outline[3].x === 0 && guarded.outline[3].y === 1000, "a locked wall two corners away survives the edit untouched, at the cost of the angle-preserving reshape");

// A side pushed: both its ends move together, the neighbours follow, nothing else shifts.
const pushed = withWallMoved(base, 0, { x: 0, y: -200 }, { x: 1000, y: -200 });
assert(pushed.outline[0].y === -200 && pushed.outline[1].y === -200, "a pushed side carries both its ends");
assert(pushed.outline[2].y === 1000 && pushed.outline[3].y === 1000 && pushed.outline[0].x === 0 && pushed.outline[1].x === 1000, "…and the far side stays where it was");
assert(Math.abs(wallLengthMm(pushed.outline[1], pushed.outline[2]) - 1200) < 1e-6, "…so the neighbouring sides lengthen by the push");
const pushedIntoLock = withWallMoved({ ...base, lockedEdges: [false, true, false, false] }, 0, { x: 0, y: -200 }, { x: 1000, y: -200 });
assert(Math.abs(wallLengthMm(pushedIntoLock.outline[1], pushedIntoLock.outline[2]) - 1000) < 1e-6, "a locked neighbour keeps its length under a push");
assert(withWallMoved(base, 7, { x: 0, y: 0 }, { x: 1, y: 1 }) === base, "a side the outline does not have is a no-op");

// SH-5/SH-6 (QA 2026-11-20): a side of a shape that is not a rectangle. A regular hexagon's side
// typed 1200 used to make its sides 1200/400/1200/800/800/800; pushing a side sheared its 120°
// corners to 105°/136°.
const hexPts: Point[] = Array.from({ length: 6 }, (_, k) => ({ x: 800 * Math.cos((k * Math.PI) / 3), y: 800 * Math.sin((k * Math.PI) / 3) }));
const hex: OutlineState = { ...base, outline: hexPts, edgeCurves: hexPts.map(() => null), lockedEdges: hexPts.map(() => false) };
const sidesOf = (s: OutlineState) => s.outline.map((v, i) => Math.round(wallLengthMm(v, s.outline[(i + 1) % s.outline.length])));
const typed = withSideLength(hex, 0, 1200);
assert(sidesOf(typed)[0] === 1200 && sidesOf(typed).slice(2).every((l) => l === 800), `a hexagon's side typed: it and the next side change, no side further on (${sidesOf(typed)})`);
assert(typed.outline[0].x === hexPts[0].x && typed.outline[0].y === hexPts[0].y, "…its start stays where it was");
const fromEnd = withSideLength(hex, 0, 1200, "end");
assert(sidesOf(fromEnd)[0] === 1200 && fromEnd.outline[1].x === hexPts[1].x && fromEnd.outline[1].y === hexPts[1].y && sidesOf(fromEnd).slice(1, 5).every((l) => l === 800), `…or its END stays, and the side before it gives (${sidesOf(fromEnd)})`);
const rectTyped = withSideLength(base, 0, 1400);
assert(rectTyped.outline[1].x === 1400 && rectTyped.outline[2].x === 1400 && rectTyped.outline[2].y === 1000, "a rectangle's side typed keeps its right angles, the far side grows with it");
const rectFromEnd = withSideLength(base, 0, 1400, "end");
assert(rectFromEnd.outline[0].x === -400 && rectFromEnd.outline[3].x === -400 && rectFromEnd.outline[1].x === 1000, "…from its end too: the start and the corner before it move out together");
const angleOf = (s: OutlineState, i: number) => {
  const n = s.outline.length;
  const p = s.outline[(i - 1 + n) % n];
  const v = s.outline[i];
  const q = s.outline[(i + 1) % n];
  const d = Math.atan2(q.y - v.y, q.x - v.x) - Math.atan2(p.y - v.y, p.x - v.x);
  return Math.round(((((d * 180) / Math.PI) % 360) + 360) % 360);
};
// Pushed outward along its normal by 200: an offset side, every corner as it was.
const nrm = { x: (hexPts[1].y - hexPts[0].y) / 800, y: -(hexPts[1].x - hexPts[0].x) / 800 };
const pushedHex = withWallMoved(hex, 0, { x: hexPts[0].x - nrm.x * 200, y: hexPts[0].y - nrm.y * 200 }, { x: hexPts[1].x - nrm.x * 200, y: hexPts[1].y - nrm.y * 200 });
assert([0, 1, 2, 3, 4, 5].every((i) => angleOf(pushedHex, i) === angleOf(hex, i)), `a hexagon's side pushed keeps every corner (${[0, 1, 2, 3, 4, 5].map((i) => angleOf(pushedHex, i))})`);
assert(pushedHex.outline.slice(2).every((v, i) => v === hexPts[i + 2]), "…and moves no other corner");

// Closing: the near-square is made square, duplicate corners go, a bow-tie is refused in words.
const skewed: Point[] = [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1205, y: 598 }, { x: 2, y: 602 }];
const squared = closedOutline(skewed);
assert(squared[1].y === squared[0].y && squared[2].x === squared[1].x && squared[3].y === squared[2].y && squared[0].x === squared[3].x, "a drawn outline a few degrees off square closes square");
assert(closedOutline([...square, { x: 0, y: 1000 }]).length === 4, "a corner dropped on the last one is taken out on close");
assert(closeRefusal(square) === null, "a square may close");
assert(closeRefusal([{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }]) !== null, "a bow-tie may not");
assert(closeRefusal([{ x: 0, y: 0 }, { x: 1000, y: 0 }]) !== null, "…nor two points");
const diamondPts: Point[] = [{ x: 0, y: 0 }, { x: 500, y: 500 }, { x: 0, y: 1000 }, { x: -500, y: 500 }];
assert(closedOutline(diamondPts).every((p, i) => p.x === diamondPts[i].x && p.y === diamondPts[i].y), "a meant 45° shape is left as drawn");

// Side indices when the outline gains or loses a corner: the thing the catalog's blocked sides are.
assert(sideIndicesAfterInsert([0, 2], 1).join(",") === "0,3", "sides after a split side shift up; before it stay");
assert(sideIndicesAfterInsert([1, 3], 1).join(",") === "1,2,4", "a split blocked side stays blocked on both halves");
assert(sideIndicesAfterInsert([5], 1).join(",") === "6", "an added part's side (past the outline's own) shifts with the count");
assert(sideIndicesAfterRemove([0, 1, 2, 3], 2, 4).join(",") === "0,2", "the two sides merged by a removed corner are gone and later ones shift down");
assert(sideIndicesAfterRemove([0, 3], 0, 4).join(",") === "", "removing corner 0 merges the last side and the first");
assert(sideIndicesAfterRemove([1, 2, 6], 0, 4).join(",") === "0,1,5", "…and every other side, parts included, shifts down one");
assert(sideIndicesAfterRemove([0, 1, 2], 1, 3).join(",") === "0,1,2", "a triangle loses no corner, so nothing shifts");

// Removing a corner: the two walls it joined become one straight wall, doors on either of them
// are dropped, and every later door follows its wall's new index.
const withDoors: OutlineState = { ...base, entrances: [door("keep", 2, 400), door("onOutgoing", 1, 100), door("onIncoming", 0, 100)] };
const removed = withVertexRemoved(withDoors, 1);
assert(removed.outline.length === 3 && removed.edgeCurves.length === 3, "the outline and its curves shrink together");
assert(removed.entrances.length === 1 && removed.entrances[0].id === "keep", "doors on the two merged walls are dropped");
assert(removed.entrances[0].wallIndex === 1, "a surviving door follows its wall's new index");
assert(withVertexRemoved(withVertexRemoved(withDoors, 1), 0).outline.length === 3, "a triangle refuses to lose another corner");

// A removed corner's locks travel with its curves: the merged wall starts unlocked, a surviving
// locked wall keeps its lock after the removal shifts its index.
const withLocks: OutlineState = { ...base, lockedEdges: [true, false, true, false] };
const removedLocks = withVertexRemoved(withLocks, 1);
assert(removedLocks.lockedEdges.length === 3 && removedLocks.lockedEdges[0] === false, "the merged wall starts unlocked");
assert(removedLocks.lockedEdges[1] === true, "a surviving locked wall keeps its lock after a removal shifts its index");

// Splitting a wall: the door stays on whichever half it falls in, later walls shift by one.
const split = withVertexInserted({ ...base, entrances: [door("near", 0, 100), door("far", 0, 900), door("later", 2, 100)] }, 0);
assert(split.outline.length === 5 && split.edgeCurves.length === 5, "the split adds a vertex and an edge");
assert(split.outline[1].x === 500 && split.outline[1].y === 0, "the new vertex lands on the wall's midpoint");
const byId = (id: string) => split.entrances.find((e) => e.id === id)!;
assert(byId("near").wallIndex === 0 && byId("near").distanceMm === 100, "a door before the split stays on the first half");
assert(byId("far").wallIndex === 1 && byId("far").distanceMm === 400, "a door past the split moves onto the second half");
assert(byId("later").wallIndex === 3, "a door on a later wall shifts by one");

// Splitting a locked wall keeps both halves locked; a later locked wall's lock follows its shift.
const insertedLocks = withVertexInserted(withLocks, 0);
assert(insertedLocks.lockedEdges.length === 5 && insertedLocks.lockedEdges[0] === true && insertedLocks.lockedEdges[1] === true, "splitting a locked wall keeps both halves locked");
assert(insertedLocks.lockedEdges[3] === true, "a later locked wall's lock follows its shifted index");

// Selection has to survive — or not survive — a restore. A whole array restores member by
// member, so a mixed selection just loses whichever refs no longer resolve.
const withBar: OutlineState = { ...base, bars: [{ id: "b1", label: "בר", x: 0, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 }] };
assert(reconcileSelection(withBar, [{ kind: "bar", id: "b1" }]).length === 1, "a still-present bar keeps its selection");
assert(reconcileSelection(base, [{ kind: "bar", id: "b1" }]).length === 0, "a bar that no longer exists clears the selection");
assert(reconcileSelection(base, [{ kind: "vertex", id: "3" }]).length === 1, "a vertex index inside the outline is kept");
assert(reconcileSelection(base, [{ kind: "vertex", id: "9" }]).length === 0, "a vertex index past the end is cleared");
assert(reconcileSelection(base, [{ kind: "stage", id: "fx-stage" }]).length === 0, "a removed stage clears the selection");
assert(reconcileSelection(withBar, [{ kind: "bar", id: "b1" }, { kind: "vertex", id: "9" }]).length === 1, "a mixed selection keeps only the refs that still resolve");

// Batched group ops: one call moves/rotates/removes every selected ref, in one history entry.
const withFixture: OutlineState = { ...base, bars: [{ id: "bar1", label: "בר", x: -100, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 }] };
const groupMoved = withSelectionMoved(withFixture, [
  { ref: { kind: "vertex", id: "0" }, point: { x: 50, y: 50 } },
  { ref: { kind: "bar", id: "bar1" }, point: { x: 300, y: 300 } },
]);
assert(groupMoved.outline[0].x === 50 && groupMoved.outline[0].y === 50, "a batched move updates the vertex among the selection");
assert(groupMoved.bars[0].x === 300 && groupMoved.bars[0].y === 300, "…and the fixture in the same batch");
const withDoor: OutlineState = { ...base, entrances: [door("d1", 0, 500)] };
const movedDoor = withSelectionMoved(withDoor, [{ ref: { kind: "entrance", id: "d1" }, point: { x: 700, y: 50 } }]);
assert(Math.abs(movedDoor.entrances[0].distanceMm - 700) < 1e-6, "a batched entrance move re-projects onto its own wall");

const twoFixtures: OutlineState = {
  ...base,
  stage: { id: "fx-stage", label: "במה", x: 100, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 },
  bars: [{ id: "bar1", label: "בר", x: -100, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 }],
};
const wasSet = withFixturesSet(twoFixtures, [
  { id: "fx-stage", x: 0, y: 100, rotationDeg: 90 },
  { id: "bar1", x: 0, y: -100, rotationDeg: 90 },
]);
assert(wasSet.stage!.x === 0 && wasSet.stage!.y === 100 && wasSet.stage!.rotationDeg === 90, "a batched fixture set writes the given absolute position and rotation");
assert(wasSet.bars[0].x === 0 && wasSet.bars[0].y === -100, "every id in the batch is set together");
assert(withFixturesSet(twoFixtures, [{ id: "fx-stage", x: 0, y: 0, rotationDeg: 370 }]).stage!.rotationDeg === 10, "rotation wraps into [0,360)");

const withMany: OutlineState = { ...base, entrances: [door("d1", 0, 500)], bars: [{ id: "bar1", label: "בר", x: 0, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 }] };
const afterGroupDelete = withSelectionRemoved(withMany, [{ kind: "entrance", id: "d1" }, { kind: "bar", id: "bar1" }]);
assert(afterGroupDelete.entrances.length === 0 && afterGroupDelete.bars.length === 0, "a batched delete removes every selected ref in one pass");
const triangle: OutlineState = { ...base, outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }], edgeCurves: [null, null, null], lockedEdges: [false, false, false] };
assert(withSelectionRemoved(triangle, [{ kind: "vertex", id: "0" }, { kind: "vertex", id: "1" }]).outline.length === 3, "a batched vertex delete still refuses to drop the outline below a triangle");

// History: push/undo/redo round-trip, the depth cap, and a redo branch dropped by a new edit.
const moved = withVertexMoved(base, 0, { x: 50, y: 50 });
let store: Store = { present: base, past: [], future: [], selected: [] };
store = pushPast(store, moved);
assert(store.present.outline[0].x === 50 && store.past.length === 1, "an edit pushes the previous state");
store = undoStore(store);
assert(store.present.outline[0].x === 0 && store.future.length === 1, "undo restores it and banks a redo");
store = redoStore(store);
assert(store.present.outline[0].x === 50 && store.future.length === 0, "redo puts it back");
store = undoStore(store);
store = pushPast(store, withVertexMoved(base, 0, { x: 9, y: 9 }));
assert(store.future.length === 0, "a fresh edit drops the redo branch");
assert(undoStore({ present: base, past: [], future: [], selected: [] }).past.length === 0, "undo at the bottom of the stack is a no-op");
let deep: Store = { present: base, past: [], future: [], selected: [] };
for (let i = 0; i < MAX_HISTORY + 20; i++) deep = pushPast(deep, withVertexMoved(deep.present, 0, { x: i, y: 0 }));
assert(deep.past.length === MAX_HISTORY, "the history stops growing at the cap");
assert(deep.past[deep.past.length - 1].outline[0].x === MAX_HISTORY + 18, "the cap drops the oldest entries, not the newest");

// Gesture coalescing: same target within the window keeps writing into the open entry.
const t0 = 1_000_000;
assert(continuesEntry({ token: "vertex:2", at: t0 }, "vertex:2", t0 + 16), "a drag frame joins the entry it opened");
assert(!continuesEntry({ token: "vertex:2", at: t0 }, "vertex:2", t0 + COALESCE_MS), "silence longer than the window starts a new entry");
assert(!continuesEntry({ token: "vertex:2", at: t0 }, "vertex:3", t0 + 16), "a different target starts a new entry");
assert(!continuesEntry({ token: "vertex:2", at: t0 }, null, t0 + 16), "a discrete action never joins an open entry");
assert(!continuesEntry(null, "vertex:2", t0), "nothing open means a new entry");
assert(patchToken("stage", { rotationDeg: 90 }) !== patchToken("stage", { widthMm: 10 }), "two fields of one fixture take separate entries");

// A side split where it was double-clicked keeps its bow on both halves (connected drawings §5.1).
{
  const bow = { c1: { x: 300, y: -400 }, c2: { x: -300, y: -400 } };
  const bowed: OutlineState = { ...base, edgeCurves: [bow, null, null, null] };
  const cut = withVertexInserted(bowed, 0, 0.3);
  assert(cut.outline.length === 5, "one point added");
  const sample = (s: OutlineState, i: number, u: number) => {
    const a = s.outline[i];
    const b = s.outline[(i + 1) % s.outline.length];
    const c = s.edgeCurves[i];
    if (!c) return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    const { c1, c2 } = absoluteControlPoints(a, b, c);
    return cubicPointAt(a, c1, c2, b, u);
  };
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    const want = sample(bowed, 0, u);
    const got = u <= 0.3 ? sample(cut, 0, u / 0.3) : sample(cut, 1, (u - 0.3) / 0.7);
    assert(Math.hypot(want.x - got.x, want.y - got.y) < 0.5, `a bowed side split at 0.3 keeps its curve (u ${u})`);
  }
  assert(withVertexInserted(base, 0).outline[1].x === 500, "no t: the middle, as before");
}

console.log("outline-editor self-check passed");
