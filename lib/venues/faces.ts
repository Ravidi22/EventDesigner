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
import { polygonAreaMm2 } from "@/lib/studio/geometry";
import { nodeMap, type VenueStructure } from "./structure";

export interface Face {
  /** Node ids around the region, in traversal order. */
  nodeIds: string[];
  /** The region's polygon, ready to render or hit-test. */
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
      const boundary = nodeIds.map((id) => {
        const n = nodes.get(id)!;
        return { x: n.x, y: n.y };
      });
      const signed = signedAreaMm2(boundary);
      // Enclosed regions come out positive under this traversal; the single outer region that
      // wraps the whole drawing comes out negative and is not a room.
      if (signed <= 0) continue;
      faces.push({ nodeIds, boundary, areaMm2: signed });
    }
  }

  return faces;
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

// ponytail: self-check. Run: node --experimental-strip-types lib/venues/faces.ts
if ((import.meta as { main?: boolean }).main) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const build = (pts: Record<string, [number, number]>, edges: [string, string][]): VenueStructure => ({
    nodes: Object.entries(pts).map(([id, [x, y]]) => ({ id, x, y })),
    walls: edges.map(([a, b], i) => ({ id: `w${i}`, a, b, kind: "wall" as const })),
    entrances: [],
    features: [],
  });

  // A lone square is one room, not two — the outer region must be discarded.
  const square = build({ A: [0, 0], B: [1000, 0], C: [1000, 1000], D: [0, 1000] }, [
    ["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"],
  ]);
  const one = detectFaces(square);
  assert(one.length === 1, `a square encloses exactly one region (got ${one.length})`);
  assert(Math.abs(one[0].areaMm2 - 1_000_000) < 1e-6, "the square's region has the square's area");

  // THE case this whole model exists for: two rooms sharing one wall. The shared wall is stored
  // once, and must bound both rooms.
  const shared = build(
    { A: [0, 0], B: [1000, 0], C: [2000, 0], D: [2000, 1000], E: [1000, 1000], F: [0, 1000] },
    [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"], ["E", "F"], ["F", "A"], ["B", "E"]],
  );
  const two = detectFaces(shared);
  assert(two.length === 2, `two rooms sharing a wall detect as two regions (got ${two.length})`);
  assert(two.every((f) => Math.abs(f.areaMm2 - 1_000_000) < 1e-6), "each shared-wall room is 1m²");
  assert(
    two.every((f) => f.nodeIds.includes("B") && f.nodeIds.includes("E")),
    "the single shared wall bounds both rooms",
  );

  // An open shape encloses nothing, which is what makes the קוליסאום need a drawn region instead.
  const open = build({ A: [0, 0], B: [1000, 0], C: [1000, 1000] }, [["A", "B"], ["B", "C"]]);
  assert(detectFaces(open).length === 0, "an unclosed run of walls encloses no region");

  // Hit-testing picks the room the click actually landed in.
  const left = faceAt(two, { x: 500, y: 500 });
  const right = faceAt(two, { x: 1500, y: 500 });
  assert(left !== null && right !== null, "a click inside each room finds a region");
  assert(left !== right, "clicks in different rooms find different regions");
  assert(faceAt(two, { x: 5000, y: 5000 }) === null, "a click outside the building finds nothing");

  // A concave (L-shaped) room must still close, and report its true area rather than its bbox.
  const ell = build(
    { A: [0, 0], B: [2000, 0], C: [2000, 1000], D: [1000, 1000], E: [1000, 2000], F: [0, 2000] },
    [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"], ["E", "F"], ["F", "A"]],
  );
  const lFaces = detectFaces(ell);
  assert(lFaces.length === 1, "an L-shaped room is one region");
  assert(Math.abs(lFaces[0].areaMm2 - 3_000_000) < 1e-6, "the L reports its true area, not its bounding box");
  assert(!pointInPolygon({ x: 1500, y: 1500 }, lFaces[0].boundary), "the L's notch is outside the room");

  console.log("faces self-check passed");
}
