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
import { moveNode, removeNode, type VenueStructure } from "./structure";
import { detectFaces, type Face } from "./faces";
import { joinable, joinRefusal, joinWalls, mergeNodes, splitWall } from "./wall-split";

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

/** A corner let go: on another corner within `reachMm` it merges into it (`into` names the corner it
 *  became); on a wall (not its own) it splits that wall there and the new corner merges into IT — so
 *  the dragged corner keeps its id and stays selected, now standing on the wall (a T). A split the
 *  wall refuses (inside a door) changes nothing and says why in `hint`: a corner left loose on the
 *  wall's line would be a room silently unclosed. Anywhere else, nothing (the same structure object). */
export function dropNode(s: VenueStructure, nodeId: string, reachMm: number): { structure: VenueStructure; into?: string; hint?: string } {
  const node = s.nodes.find((n) => n.id === nodeId);
  if (!node) return { structure: s };
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
  if (into) return { structure: mergeNodes(s, nodeId, into), into };
  const under = wallUnder(s, node, reachMm, nodeId);
  if (!under) return { structure: s };
  const cut = splitWall(s, under.wallId, under.t);
  if ("error" in cut) return { structure: s, hint: cut.error };
  const at = cut.structure.nodes.find((n) => n.id === cut.nodeId)!;
  return { structure: mergeNodes(moveNode(cut.structure, nodeId, { x: at.x, y: at.y }), cut.nodeId, nodeId) };
}

/** The room a wall run just closed: the face of `after` that `before` did not have. `before` must be
 *  the plan as it stood just before the new wall — after any split the click made, which adds a corner
 *  to the room next door without making it new. Compared by node set. */
export function newFaceAfter(before: VenueStructure, after: VenueStructure): Face | null {
  const sig = (f: Face) => [...f.nodeIds].sort().join(",");
  const prior = new Set(detectFaces(before).map(sig));
  return detectFaces(after).find((f) => !prior.has(sig(f))) ?? null;
}

/** A double-click on a corner (spec §5: "where exactly two walls meet"): it only ever JOINS. On any
 *  other corner it changes nothing and says why — removing a T's three walls is Delete's to do. */
export function removePoint(s: VenueStructure, nodeId: string): { structure: VenueStructure; hint?: string } {
  if (joinable(s, nodeId)) return deleteNode(s, nodeId);
  const j = joinWalls(s, nodeId);
  return { structure: s, hint: "error" in j ? j.error : undefined };
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
