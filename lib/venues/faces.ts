// Finds the enclosed regions a wall graph forms — the rooms — so the designer can name a hall by
// clicking inside it instead of re-tracing walls that are already drawn.
//
// Standard planar-subdivision face traversal. Each wall becomes two directed half-edges; at every
// node the outgoing half-edges are sorted by angle; and the walk always takes, on arrival at a
// node, the neighbour immediately *clockwise* of the way it came. That rule closes each enclosed
// region exactly once, and traverses the infinite outer region in the opposite orientation — which
// is precisely how the outer one is told apart and dropped (it is not a room).
//
// ponytail: assumes walls meet only at shared nodes. Two walls that visually cross mid-span
// without a node there are not split, so the X they make encloses nothing. The editor snaps
// endpoints together (structure.addNode) so drawn walls do share nodes; a proper segment-
// intersection pass is only needed if free-floating crossings ever become a real drawing style.
import type { Point } from "@/lib/studio/hall";
import { polygonAreaMm2, polygonCentroid, sampleEdgePoints } from "@/lib/studio/geometry";
import { nodeMap, type VenueStructure, type Wall } from "./structure";

export interface Face {
  /** Node ids around the region, in traversal order. */
  nodeIds: string[];
  /** The region's polygon, ready to render or hit-test. A bowed wall contributes points along its
   *  curve, not just its two corners — so the room's tint, its area and a click inside it all agree
   *  with the wall as drawn instead of cutting the chord the bow leaves behind. */
  boundary: Point[];
  areaMm2: number;
}

// Shoelace WITH sign retained — the sign is the load-bearing part here (it distinguishes an
// enclosed room from the outer region), so this can't just call polygonAreaMm2, which takes the
// absolute value.
function signedAreaMm2(poly: Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function detectFaces(structure: VenueStructure): Face[] {
  const nodes = nodeMap(structure);

  // Adjacency, then each node's neighbours sorted by the angle of the wall leaving it.
  const neighbours = new Map<string, string[]>();
  for (const wall of structure.walls) {
    if (!nodes.has(wall.a) || !nodes.has(wall.b)) continue; // wall dangling off a deleted node
    if (!neighbours.has(wall.a)) neighbours.set(wall.a, []);
    if (!neighbours.has(wall.b)) neighbours.set(wall.b, []);
    neighbours.get(wall.a)!.push(wall.b);
    neighbours.get(wall.b)!.push(wall.a);
  }
  for (const [id, list] of neighbours) {
    const from = nodes.get(id)!;
    list.sort((p, q) => {
      const np = nodes.get(p)!;
      const nq = nodes.get(q)!;
      return Math.atan2(np.y - from.y, np.x - from.x) - Math.atan2(nq.y - from.y, nq.x - from.x);
    });
  }

  const key = (a: string, b: string) => `${a}>${b}`;
  // The wall joining any two adjacent nodes, reachable from either end — a face walks a wall in
  // whichever direction its traversal took, while the wall stores its bow in one fixed direction.
  const wallBetween = new Map<string, Wall>();
  for (const wall of structure.walls) {
    wallBetween.set(key(wall.a, wall.b), wall);
    wallBetween.set(key(wall.b, wall.a), wall);
  }
  const visited = new Set<string>();
  const faces: Face[] = [];

  for (const wall of structure.walls) {
    if (!nodes.has(wall.a) || !nodes.has(wall.b)) continue;
    for (const [from, to] of [
      [wall.a, wall.b],
      [wall.b, wall.a],
    ]) {
      if (visited.has(key(from, to))) continue;

      const nodeIds: string[] = [];
      let u = from;
      let v = to;
      // A malformed graph must not spin forever; the bound is generous but finite.
      for (let guard = 0; guard <= structure.walls.length * 2 + 1; guard++) {
        if (visited.has(key(u, v))) break;
        visited.add(key(u, v));
        nodeIds.push(u);

        const around = neighbours.get(v);
        if (!around || around.length === 0) break;
        // Step clockwise from the direction we arrived: the neighbour just before `u` in the
        // angle-sorted ring around `v`.
        const i = around.indexOf(u);
        const next = around[(i - 1 + around.length) % around.length];
        u = v;
        v = next;
        if (u === from && v === to) break; // closed the loop
      }

      if (nodeIds.length < 3) continue;
      const boundary: Point[] = [];
      for (let i = 0; i < nodeIds.length; i++) {
        const fromId = nodeIds[i];
        const toId = nodeIds[(i + 1) % nodeIds.length];
        const from = nodes.get(fromId)!;
        boundary.push({ x: from.x, y: from.y });
        const wall = wallBetween.get(key(fromId, toId));
        if (!wall?.curve) continue;
        const a = nodes.get(wall.a)!;
        const b = nodes.get(wall.b)!;
        const along = sampleEdgePoints({ x: a.x, y: a.y }, { x: b.x, y: b.y }, wall.curve);
        // The curve is stored a→b; a face walking that wall the other way meets its points in
        // reverse, and inserting them as stored would fold the boundary back on itself.
        boundary.push(...(wall.a === fromId ? along : along.reverse()));
      }
      const signed = signedAreaMm2(boundary);
      // Enclosed regions come out positive under this traversal; the single outer region that
      // wraps the whole drawing comes out negative and is not a room.
      if (signed <= 0) continue;
      faces.push({ nodeIds, boundary, areaMm2: signed });
    }
  }

  return faces;
}

// Which side of a wall reads as "inward" for a door hung on it — the centroid of whichever
// enclosed face that wall directly borders (its two nodes appear adjacent in the face's own
// cycle), the graph-structure counterpart to the outline system's one whole-shape centroid: this
// plan can have several rooms, so there is no single interior to point at. A wall with no face on
// either side (open to nothing yet) has no interior to reference at all, so it falls back to an
// arbitrary but consistent perpendicular offset — doorGeometry only reads the SIGN of which side
// that point is on, and a door hung on an open wall has no "correct" side for that to disagree with.
export function wallInteriorHint(faces: Face[], a: Point, b: Point, aId: string, bId: string): Point {
  for (const f of faces) {
    const n = f.nodeIds.length;
    for (let i = 0; i < n; i++) {
      const x = f.nodeIds[i];
      const y = f.nodeIds[(i + 1) % n];
      if ((x === aId && y === bId) || (x === bId && y === aId)) return polygonCentroid(f.boundary);
    }
  }
  return { x: (a.x + b.x) / 2 - (b.y - a.y), y: (a.y + b.y) / 2 + (b.x - a.x) };
}

// Ray casting. Used to turn "the designer clicked here" into "…inside this room", so it has to
// agree with what is drawn on screen rather than be merely approximately right.
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const straddles = a.y > p.y !== b.y > p.y;
    if (straddles && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The enclosed region under a point, smallest first so a room inside a room resolves to the inner
 *  one rather than the hall containing it. */
export function faceAt(faces: Face[], p: Point): Face | null {
  return (
    [...faces]
      .sort((x, y) => x.areaMm2 - y.areaMm2)
      .find((f) => pointInPolygon(p, f.boundary)) ?? null
  );
}

export function faceAreaM2(face: Face): number {
  return polygonAreaMm2(face.boundary) / 1_000_000;
}
