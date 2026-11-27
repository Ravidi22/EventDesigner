// npm run check:wall-edit — the self-check of ./wall-edit.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import { type VenueStructure } from "./structure";
import { hasWall, splitWall } from "./wall-split";
import { deleteNode, dropNode, newFaceAfter, removePoint, splitAt, wallUnder } from "./wall-edit";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;
// A 6 × 4 room, and a loose wall E→G beside it.
const room: VenueStructure = {
  nodes: [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 6000, y: 0 },
    { id: "C", x: 6000, y: 4000 },
    { id: "D", x: 0, y: 4000 },
    { id: "E", x: 8000, y: 2000 },
    { id: "G", x: 9000, y: 2000 },
  ],
  walls: [
    { id: "ab", a: "A", b: "B", kind: "wall" },
    { id: "bc", a: "B", b: "C", kind: "wall" },
    { id: "cd", a: "C", b: "D", kind: "wall" },
    { id: "da", a: "D", b: "A", kind: "wall" },
    { id: "e", a: "E", b: "G", kind: "wall" },
  ],
  entrances: [],
  features: [],
};
const at = (s: VenueStructure, id: string, p: Point): VenueStructure => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) });

// The wall under a point.
const under = wallUnder(room, { x: 3000, y: 30 }, 100);
assert(!!under && under.wallId === "ab" && near(under.t, 0.5, 1e-3), "a point by a wall finds it, and where along it");
assert(wallUnder(room, { x: 3000, y: 500 }, 100) === null, "a point in the room finds no wall");
assert(wallUnder(room, { x: 30, y: 2000 }, 100, "A") === null, "the walls of the corner being dragged are not candidates");

// A double-click on a wall splits it there.
const cut = splitAt(room, "ab", { x: 2000, y: 40 });
if ("error" in cut) throw new Error("FAIL: " + cut.error);
const n = cut.structure.nodes.find((x) => x.id === cut.nodeId)!;
assert(near(n.x, 2000) && near(n.y, 0), "the new corner stands on the wall, under the click");

// A corner dropped on a corner merges into it — and says which, so the screen can select it.
const onBDrop = dropNode(at(room, "E", { x: 6040, y: 30 }), "E", 100);
const onB = onBDrop.structure;
assert(!onB.nodes.some((x) => x.id === "E") && onB.walls.find((w) => w.id === "e")!.a === "B" && onBDrop.into === "B", "dropped on a corner, it becomes that corner");
// …on a wall's middle, splits the wall and joins it there — keeping the dragged corner's own id.
const onABDrop = dropNode(at(room, "E", { x: 3000, y: 40 }), "E", 100);
const onAB = onABDrop.structure;
const joint = onAB.nodes.find((x) => x.id === "E")!;
assert(!!joint && onABDrop.into === undefined && onAB.walls.length === 6 && !onAB.walls.some((w) => w.id === "ab") && near(joint.x, 3000) && near(joint.y, 0), "dropped on a wall, it splits the wall and joins it, still itself");
assert(onAB.walls.filter((w) => w.a === "E" || w.b === "E").length === 3 && hasWall(onAB, "ab"), "…a T: three walls at the corner, the old wall still resolving");
// …anywhere else, nothing.
const free = at(room, "E", { x: 8000, y: 3000 });
assert(dropNode(free, "E", 100).structure === free, "dropped in the open, nothing changes");
const ownWalls = at(room, "C", { x: 6000, y: 3990 });
assert(dropNode(ownWalls, "C", 100).structure === ownWalls, "a corner is never dropped onto its own walls");
// …inside a door: refused, and it says why — a corner left loose on the wall's line would be a
// room silently unclosed (spec DECIDE 23).
const doored: VenueStructure = { ...room, entrances: [{ id: "dd", wallId: "ab", distanceMm: 3000, widthMm: 1000, swingInward: true, doubleDoor: false }] };
const inDoor = dropNode(at(doored, "E", { x: 3000, y: 40 }), "E", 100);
assert(inDoor.structure.walls.length === doored.walls.length && inDoor.hint === "הנקודה בתוך פתח הדלת", "dropped inside a door: refused, with the reason");

// The room a wall run closes — found against the plan as it stood just before the wall, after any
// split the click made (the split adds a corner to the room next door, which is not new).
const splitRight = splitWall(room, "bc", 0.5) as { structure: VenueStructure; nodeId: string };
assert(newFaceAfter(room, splitRight.structure) !== null, "against the plan BEFORE the split the room next door looks new — which is why a caller passes the split plan as `before`");
assert(newFaceAfter(splitRight.structure, splitRight.structure) === null, "nothing new against itself");
const M = splitRight.nodeId;
const second: VenueStructure = {
  ...splitRight.structure,
  nodes: [...splitRight.structure.nodes, { id: "P", x: 9000, y: 2000 }, { id: "Q", x: 9000, y: 4000 }],
  walls: [...splitRight.structure.walls, { id: "mp", a: M, b: "P", kind: "wall" }, { id: "pq", a: "P", b: "Q", kind: "wall" }, { id: "qc", a: "Q", b: "C", kind: "wall" }],
};
const closed = newFaceAfter(splitRight.structure, second);
assert(!!closed && [...closed.nodeIds].sort().join(",") === [M, "P", "Q", "C"].sort().join(","), "the run's own room is the new one, not the room next door");

// A double-click on a corner only ever JOINS (spec §5: "where exactly two walls meet").
const dblTee = removePoint(onAB, "E");
assert(dblTee.structure === onAB && !!dblTee.hint, "a double-click on a corner of three walls changes nothing, and says so");
const dblCorner = removePoint(room, "A");
assert(!dblCorner.structure.nodes.some((x) => x.id === "A"), "a double-click on a corner of two walls joins them");

// Delete on a corner.
const straightCut = splitAt(room, "ab", { x: 3000, y: 0 }) as { structure: VenueStructure; nodeId: string };
const unsplit = deleteNode(straightCut.structure, straightCut.nodeId);
assert(unsplit.structure.walls.some((w) => w.id === "ab") && unsplit.hint === undefined, "Delete on a split point joins the wall back, nothing to say");
const corner = deleteNode(room, "A");
assert(!corner.structure.nodes.some((x) => x.id === "A") && corner.structure.walls.length === 4 && corner.hint === "חובר כקיר ישר", "Delete on a room's corner joins its two walls, and says the result is straight");
const mixed: VenueStructure = { ...room, walls: room.walls.map((w) => (w.id === "da" ? { ...w, kind: "edge" as const } : w)) };
const refused = deleteNode(mixed, "A");
assert(refused.structure === mixed && refused.hint === "קיר וגבול שטח לא מתחברים", "a wall and an edge are not joined, nothing removed");
const end = deleteNode(room, "G");
assert(!end.structure.walls.some((w) => w.id === "e") && !end.structure.nodes.some((x) => x.id === "G"), "a corner with one wall is removed with it, as before");
const tee = deleteNode(onAB, "E");
assert(!tee.structure.nodes.some((x) => x.id === "E") && tee.structure.walls.length === 3, "a corner of three walls is removed with them, as before");

console.log("wall-edit: ok");
