// npm run check:faces — the self-check of ./faces.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { bulgeToCurve } from "@/lib/studio/geometry";
import { type VenueStructure } from "./structure";
import { detectFaces, faceAt, pointInPolygon } from "./faces";

// ponytail: self-check. Run: node --experimental-strip-types lib/venues/faces.ts
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

// A bowed wall bounds its room along the curve, not along the chord: the room gains the area the
// bow adds, and a point out in the bulge — beyond where the straight wall used to run — is inside.
const bowed = build({ A: [0, 0], B: [1000, 0], C: [1000, 1000], D: [0, 1000] }, [
  ["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"],
]);
bowed.walls[1].curve = bulgeToCurve({ x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 1300, y: 500 });
const bowedFace = detectFaces(bowed)[0];
assert(bowedFace !== undefined, "a room with a bowed wall still closes");
assert(bowedFace.areaMm2 > 1_100_000, "the bow adds its own area to the room rather than being ignored");
assert(pointInPolygon({ x: 1200, y: 500 }, bowedFace.boundary), "a point out in the bulge is inside the room");
assert(!pointInPolygon({ x: 1200, y: 60 }, bowedFace.boundary), "…while one beside the corner, where the wall barely bows, is not");
assert(bowedFace.nodeIds.length === 4, "the room still has four corners — the curve adds boundary points, not corners");

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
