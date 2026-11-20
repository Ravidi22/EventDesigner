// What a gesture on the wall graph MEANS at /halls (docs/superpowers/specs/2026-11-20-connected-
// drawings-design.md §5): a double-click on a wall, a corner dropped somewhere, Delete on a corner.
// The screen only asks; the answers live here so they are checked (`check:wall-edit`). The edits
// themselves are lib/venues/wall-split.ts's; this module is the rule for which one a gesture is.
//
// One promise holds across all of them: a shared point is a connected one. A corner dropped on a
// corner merges into it, dropped on a wall splits the wall there and joins it — landing a corner on
// another without connecting them would leave the room silently unclosed.
import type { Point } from "@/lib/studio/hall";
import { wallTrack } from "@/lib/studio/anchor";
import { removeNode, type VenueStructure } from "./structure";
import { joinable, joinRefusal, joinWalls, mergeNodes, splitWall } from "./wall-split";
import { isMain } from "../self-check";

/** The wall nearest `p` within `reachMm`, and where along it (its own parameter) — bows followed.
 *  The walls of `exceptNode` are not candidates: a corner is never dropped onto its own walls. */
export function wallUnder(s: VenueStructure, p: Point, reachMm: number, exceptNode?: string): { wallId: string; t: number } | null {
  let best: { wallId: string; t: number } | null = null;
  let bestD = reachMm;
  for (const w of s.walls) {
    if (exceptNode && (w.a === exceptNode || w.b === exceptNode)) continue;
    const tr = wallTrack(s, w.id);
    if (!tr) continue;
    const t = tr.nearestT(p);
    const q = tr.at(t).p;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = { wallId: w.id, t };
    }
  }
  return best;
}

/** A double-click on a wall: split it at the point of the wall nearest the click. */
export function splitAt(s: VenueStructure, wallId: string, p: Point): { structure: VenueStructure; nodeId: string } | { error: string } {
  const tr = wallTrack(s, wallId);
  return tr ? splitWall(s, wallId, tr.nearestT(p)) : { error: "הקיר לא נמצא" };
}

/** A corner let go: on another corner within `reachMm` it merges into it; on a wall (not its own) it
 *  splits that wall there and merges into the new corner — a T. Anywhere else, nothing (the same
 *  structure object comes back). */
export function dropNode(s: VenueStructure, nodeId: string, reachMm: number): VenueStructure {
  const node = s.nodes.find((n) => n.id === nodeId);
  if (!node) return s;
  let into: string | null = null;
  let bestD = reachMm;
  for (const n of s.nodes) {
    if (n.id === nodeId) continue;
    const d = Math.hypot(n.x - node.x, n.y - node.y);
    if (d <= bestD) {
      bestD = d;
      into = n.id;
    }
  }
  if (into) return mergeNodes(s, nodeId, into);
  const under = wallUnder(s, node, reachMm, nodeId);
  if (!under) return s;
  const cut = splitWall(s, under.wallId, under.t);
  return "error" in cut ? s : mergeNodes(cut.structure, nodeId, cut.nodeId);
}

/** Delete on a corner (spec DECIDE 24): where exactly two walls of one kind meet, the point goes and
 *  the walls become one — "חובר כקיר ישר" when that could not keep what they drew. Two kinds: refused,
 *  nothing removed. Any other corner: removed with its walls, as it always was. */
export function deleteNode(s: VenueStructure, nodeId: string): { structure: VenueStructure; hint?: string } {
  if (joinable(s, nodeId)) {
    const j = joinWalls(s, nodeId);
    if ("error" in j) return { structure: s, hint: j.error };
    return { structure: j.structure, ...(j.straightened ? { hint: "חובר כקיר ישר" } : {}) };
  }
  const refusal = joinRefusal(s, nodeId);
  if (refusal) return { structure: s, hint: refusal };
  return { structure: removeNode(s, nodeId) };
}

if (isMain(import.meta.url)) {
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

  // A corner dropped on a corner merges into it.
  const onB = dropNode(at(room, "E", { x: 6040, y: 30 }), "E", 100);
  assert(!onB.nodes.some((x) => x.id === "E") && onB.walls.find((w) => w.id === "e")!.a === "B", "dropped on a corner, it becomes that corner");
  // …on a wall's middle, splits the wall and joins it there.
  const onAB = dropNode(at(room, "E", { x: 3000, y: 40 }), "E", 100);
  const eWall = onAB.walls.find((w) => w.id === "e")!;
  const joint = onAB.nodes.find((x) => x.id === eWall.a)!;
  assert(onAB.walls.length === 6 && !onAB.walls.some((w) => w.id === "ab") && near(joint.x, 3000) && near(joint.y, 0), "dropped on a wall, it splits the wall and joins it");
  assert(onAB.walls.filter((w) => w.a === joint.id || w.b === joint.id).length === 3, "…a T: three walls at the new corner");
  // …anywhere else, nothing.
  const free = at(room, "E", { x: 8000, y: 3000 });
  assert(dropNode(free, "E", 100) === free, "dropped in the open, nothing changes");
  const ownWalls = at(room, "C", { x: 6000, y: 3990 });
  assert(dropNode(ownWalls, "C", 100) === ownWalls, "a corner is never dropped onto its own walls");

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
  const tee = deleteNode(onAB, joint.id);
  assert(!tee.structure.nodes.some((x) => x.id === joint.id) && tee.structure.walls.length === 3, "a corner of three walls is removed with them, as before");

  console.log("wall-edit: ok");
}
