// What is selected on the venue plan, and the two rules that decide it: what a marquee catches, and
// what a click does to a selection that already exists.
//
// Both live here rather than in the screen because they are the parts with actual semantics — "a
// wall counts only when the box holds both its ends", "clicking the one selected thing clears it" —
// and a rule buried in a component is a rule nobody can check. There is no browser to drive here,
// so a pure module with a self-check is the difference between verified and hoped-for.
import type { Point } from "@/lib/studio/hall";
import { pointAtDistance, polygonCentroid } from "@/lib/studio/geometry";
import { nodeMap, wallPoints, type VenueStructure } from "./structure";
import type { ResolvedZone } from "./zone";

export type PlanSelectionKind = "zone" | "wall" | "node" | "door" | "feature";

export interface PlanSelection {
  kind: PlanSelectionKind;
  id: string;
}

export interface SelectionBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const same = (a: PlanSelection, b: PlanSelection) => a.kind === b.kind && a.id === b.id;

export function isSelected(selection: PlanSelection[], kind: PlanSelectionKind, id: string): boolean {
  return selection.some((s) => s.kind === kind && s.id === id);
}

/** True when every ref is the same kind — what decides whether a group can be offered a real field
 *  (six walls all take a kind) or only a count and a delete. */
export function soleKind(selection: PlanSelection[]): PlanSelectionKind | null {
  const first = selection[0]?.kind;
  return first && selection.every((s) => s.kind === first) ? first : null;
}

/** A click. Shift toggles one ref in or out; a plain click replaces the selection — except that
 *  clicking the single thing already selected clears it, which is how you deselect without having
 *  to find empty canvas to click on. `ref: null` is a click on nothing. */
export function toggleSelection(current: PlanSelection[], ref: PlanSelection | null, additive: boolean): PlanSelection[] {
  if (!ref) return additive ? current : [];
  const at = current.findIndex((s) => same(s, ref));
  if (additive) return at >= 0 ? current.filter((_, i) => i !== at) : [...current, ref];
  return at >= 0 && current.length === 1 ? [] : [ref];
}

/** What a finished rubber-band does to the selection: replaces it, ADDS its catch (Shift), or
 *  TOGGLES each thing it caught (Ctrl/⌘) — the one gesture that can take things OUT of a selection
 *  in bulk. `true`/`false` are kept for the callers that only ever knew Shift. */
export type MergeMode = "replace" | "add" | "toggle";

export function mergeSelection(current: PlanSelection[], hits: PlanSelection[], mode: boolean | MergeMode): PlanSelection[] {
  const how: MergeMode = mode === true ? "add" : mode === false ? "replace" : mode;
  if (how === "replace") return hits;
  const merged = [...current];
  for (const h of hits) {
    const at = merged.findIndex((s) => same(s, h));
    if (at < 0) merged.push(h);
    else if (how === "toggle") merged.splice(at, 1);
  }
  return merged;
}

/** A feature's box as it stands, turned — the extent a band has to touch. */
function featureBounds(f: VenueStructure["features"][number]): SelectionBox {
  const rad = ((f.rotationDeg ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const sn = Math.abs(Math.sin(rad));
  const w = f.widthMm * c + f.depthMm * sn;
  const d = f.widthMm * sn + f.depthMm * c;
  return { minX: f.x - w / 2, minY: f.y - d / 2, maxX: f.x + w / 2, maxY: f.y + d / 2 };
}

/** Everything inside a marquee box, across every layer of the plan at once — the graph the canvas
 *  draws and the zones/features/doors the screen draws over it. */
export function hitsInBox(structure: VenueStructure, zones: ResolvedZone[], box: SelectionBox): PlanSelection[] {
  const inside = (p: Point) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  const hits: PlanSelection[] = [];
  const nodes = nodeMap(structure);

  for (const n of structure.nodes) if (inside(n)) hits.push({ kind: "node", id: n.id });

  // A wall counts only when the box holds *both* its ends. Testing the midpoint instead would take
  // walls that mostly lie outside the box, so dragging a box over one room would quietly grab the
  // long walls of the room next door.
  for (const w of structure.walls) {
    const pts = wallPoints(structure, w, nodes);
    if (pts && inside(pts.a) && inside(pts.b)) hits.push({ kind: "wall", id: w.id });
  }

  // A feature counts when the box TOUCHES it, as the sketch's band takes its tables — a band
  // drawn across a row of planters should not have to reach every one's middle. (A node is a
  // point; a wall still wants both ends, or the band over one room grabs the next room's walls.)
  // The GROUND is the exception: it is under everything, so a band drawn round three planters on a
  // lawn always touches the lawn, and took it — and the courtyard's paving with it. A surface is
  // taken only when the band holds all of it, as the sketch's band never takes it at all.
  for (const f of structure.features) {
    const b = featureBounds(f);
    const hit =
      f.kind === "surface"
        ? b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY
        : b.maxX >= box.minX && b.minX <= box.maxX && b.maxY >= box.minY && b.minY <= box.maxY;
    if (hit) hits.push({ kind: "feature", id: f.id });
  }

  for (const e of structure.entrances) {
    const w = structure.walls.find((x) => x.id === e.wallId);
    const pts = w ? wallPoints(structure, w, nodes) : null;
    if (pts && inside(pointAtDistance(pts.a, pts.b, e.distanceMm))) hits.push({ kind: "door", id: e.id });
  }

  // Zones by centroid, not by full containment: a zone is a label over a region, and you point at
  // one by pointing at its middle. Requiring the whole region inside would make the biggest zone —
  // the one hardest to fit in a drag — the hardest to select.
  for (const r of zones) {
    if (r.boundary.length >= 3 && inside(polygonCentroid(r.boundary))) hits.push({ kind: "zone", id: r.zone.id });
  }

  return hits;
}
