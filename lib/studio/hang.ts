// HUNG FROM THE CEILING — where a chandelier is, in the three ways a rigger asks.
//
// A ceiling item is the one thing on a plan nobody can measure to on the night: it is four metres
// up, and the crew marks its hook point on the floor first and hoists over the mark. So the plan has
// to say where the mark goes, and it says it three ways, every one DERIVED from the drawing:
//
//   wall ties   from the hang point, square to the nearest wall across and the nearest along — two
//               numbers fix a point in a room, and "the nearer of the two" is the one a tape reaches
//   over        the table or element underneath, and how far the hang point is off ITS centre — a
//               chandelier "over table 7" is hung from the table's middle, and the middle is the
//               shape's visual one (label-anchor.ts), not its box: a crescent head table's box centre
//               is in the air the arc curves round
//   height      how far down it hangs: the catalog row's own default, overridden per item on a plan
//               (Placement.hangHeightMm). A drawing fact like Placement.scale — the quote, the packing
//               list and procurement never read it.
//
// The same answer centres a chandelier dropped over a table and snaps one dragged across it (the
// studio), and draws the figures on the printed ceiling plan (lib/outputs/measurements.ts). Pure,
// no React; self-checked: npm run check:hang.
import type { Placement, Point } from "@/lib/design-document/types";
import type { Product } from "@/lib/catalog/types";
import type { Footprint } from "./footprint";
import { labelAnchor } from "./label-anchor";
import { footprintPolygons, insidePolys, polysBox, type Poly } from "./proximity";
import { sampleEdgePoints } from "./geometry";
import { nodeMap, wallPoints, type VenueStructure } from "@/lib/venues/structure";
import { isMain } from "../self-check";

/** Something a ceiling item can hang over — a table, a stage, a bar — as world polygons, and the
 *  point a rigger would call its middle. */
export interface HangTarget {
  key: string;
  polys: Poly[];
  centre: Point;
}

/** A straight measured run: from `a` to `b`, `mm` long, along one of the room's axes. */
export interface HangTie {
  a: Point;
  b: Point;
  mm: number;
  axis: "x" | "y";
}

/** The categoryFields key a ceiling product's default hang height lives under, in mm. In
 *  categoryFields rather than `dimensions` because dimensions are flat columns in the database and
 *  categoryFields is the row's jsonb — and it is NOT a quantity multiplier, so no CategoryDef field
 *  declares it and nothing that multiplies reads it. */
export const HANG_FIELD = "hangHeightMm";

/** Hang heights are typed in centimetres and stored in whole centimetres; a ceiling 30m up is a typo. */
export const HANG_MAX_MM = 30000;

/** Where a footprint's visual centre sits relative to its placement's position, once it is flipped,
 *  scaled and turned the way the canvas draws it (translate · rotate · flip · scale). */
export function anchorOffset(f: Footprint, rotationDeg = 0, mirrored = false, scale = 1): Point {
  const a = labelAnchor(f);
  const x = (mirrored ? -a.x : a.x) * scale;
  const y = a.y * scale;
  const t = (rotationDeg * Math.PI) / 180;
  return { x: x * Math.cos(t) - y * Math.sin(t), y: x * Math.sin(t) + y * Math.cos(t) };
}

/** A footprint standing at `at` as something to hang over. */
export function hangTarget(key: string, f: Footprint, at: Point, rotationDeg = 0, mirrored = false, scale = 1): HangTarget {
  const o = anchorOffset(f, rotationDeg, mirrored, scale);
  return { key, polys: footprintPolygons(f, at, rotationDeg, mirrored, scale), centre: { x: at.x + o.x, y: at.y + o.y } };
}

const area = (polys: Poly[]) => {
  const b = polysBox(polys);
  return (b.maxX - b.minX) * (b.maxY - b.minY);
};

/** What `p` hangs over: of every target whose outline it is inside, the SMALLEST — a chandelier over
 *  a head table standing on a stage is over the table, which is what the crew will centre it on. */
export function targetUnder(p: Point, targets: readonly HangTarget[]): HangTarget | undefined {
  let best: HangTarget | undefined;
  let bestArea = Infinity;
  for (const t of targets) {
    if (!insidePolys(p, t.polys)) continue;
    const a = area(t.polys);
    if (a < bestArea) {
      best = t;
      bestArea = a;
    }
  }
  return best;
}

/** The centre of whatever `p` is over, when `p` is within `reachMm` of it — a drop passes Infinity
 *  (anywhere over a table puts it in the table's middle), a drag passes a few screen pixels' worth
 *  (it pulls to the middle as it crosses it, and lets go past that). Null when there is nothing under
 *  `p`, or its middle is further than that. */
export function centreOver(p: Point, targets: readonly HangTarget[], reachMm = Infinity): { point: Point; target: HangTarget } | null {
  const t = targetUnder(p, targets);
  if (!t || Math.hypot(p.x - t.centre.x, p.y - t.centre.y) > reachMm) return null;
  return { point: t.centre, target: t };
}

/** Where a ray from `p` along `dir` first meets a wall, or null. */
function cast(p: Point, dir: Point, walls: readonly [Point, Point][]): Point | null {
  let best: Point | null = null;
  let bestT = Infinity;
  for (const [a, b] of walls) {
    const e = { x: b.x - a.x, y: b.y - a.y };
    const den = dir.x * e.y - dir.y * e.x;
    if (Math.abs(den) < 1e-9) continue;
    const w = { x: a.x - p.x, y: a.y - p.y };
    const t = (w.x * e.y - w.y * e.x) / den;
    const u = (w.x * dir.y - w.y * dir.x) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < bestT) {
      bestT = t;
      best = { x: p.x + dir.x * t, y: p.y + dir.y * t };
    }
  }
  return best;
}

/** Two figures that fix a hang point: square to the nearer wall left/right, and to the nearer one
 *  up/down. Nothing on the floor is in the way — the ceiling is above all of it. */
export function wallTies(p: Point, walls: readonly [Point, Point][], maxMm = 40000): HangTie[] {
  const out: HangTie[] = [];
  for (const axis of ["x", "y"] as const) {
    let pick: HangTie | null = null;
    for (const s of [-1, 1]) {
      const hit = cast(p, axis === "x" ? { x: s, y: 0 } : { x: 0, y: s }, walls);
      if (!hit) continue;
      const mm = Math.hypot(hit.x - p.x, hit.y - p.y);
      if (mm < 1 || mm > maxMm) continue;
      if (!pick || mm < pick.mm) pick = { a: p, b: hit, mm, axis };
    }
    if (pick) out.push(pick);
  }
  return out;
}

/** How far a hang point is off the centre of what it hangs over, as the two legs a crew measures —
 *  across, then along. A leg under `minMm` is no leg; a point on the centre has none at all. */
export function centreOffset(p: Point, centre: Point, minMm = 20): HangTie[] {
  const out: HangTie[] = [];
  const corner = { x: p.x, y: centre.y };
  const dx = Math.abs(p.x - centre.x);
  const dy = Math.abs(p.y - centre.y);
  if (dx >= minMm) out.push({ a: centre, b: corner, mm: dx, axis: "x" });
  if (dy >= minMm) out.push({ a: corner, b: p, mm: dy, axis: "y" });
  return out;
}

/** How high above the floor this item hangs, mm: its own override, else its catalog row's default.
 *  Undefined = nobody said, and nothing is printed. */
export function hangHeightOf(p: Pick<Placement, "hangHeightMm">, product: Pick<Product, "categoryFields"> | undefined): number | undefined {
  if (p.hangHeightMm !== undefined && p.hangHeightMm > 0) return p.hangHeightMm;
  const d = Number(product?.categoryFields?.[HANG_FIELD]);
  return Number.isFinite(d) && d > 0 ? d : undefined;
}

/** "↓ 3.20 מ׳" — down from the ceiling's hook to the item, read as its height off the floor. */
export function formatHang(mm: number): string {
  return `↓ ${(mm / 1000).toFixed(2)} מ׳`;
}

/** Every wall of a venue as straight runs — a bowed wall sampled, so a tie meets the wall where it IS. */
export function wallRuns(structure: VenueStructure): [Point, Point][] {
  const nodes = nodeMap(structure);
  return structure.walls.flatMap((w) => {
    const pts = wallPoints(structure, w, nodes);
    if (!pts) return [];
    const run = w.curve ? sampleEdgePoints(pts.a, pts.b, w.curve, 12) : [pts.a, pts.b];
    return run.slice(1).map((q, i) => [run[i], q] as [Point, Point]);
  });
}

// ponytail: self-check. Run: npm run check:hang
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: Point, b: Point, tol = 1) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

  // A 20×12m room, a round table, a stage, and a head table standing on the stage.
  const room: Point[] = [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 12000 }, { x: 0, y: 12000 }];
  const walls = room.map((p, i) => [p, room[(i + 1) % 4]] as [Point, Point]);
  const round = hangTarget("t1", { kind: "circle", diameterMm: 1800 }, { x: 5000, y: 6000 });
  const stage = hangTarget("stage", { kind: "rect", widthMm: 6000, depthMm: 3000 }, { x: 10000, y: 2000 });
  const head = hangTarget("head", { kind: "rect", widthMm: 3000, depthMm: 800 }, { x: 10000, y: 2000 });
  const targets = [round, stage, head];

  assert(near(round.centre, { x: 5000, y: 6000 }), "a round table's middle is its centre");
  assert(targetUnder({ x: 5300, y: 6200 }, targets)?.key === "t1", "a point over the table is over the table");
  assert(targetUnder({ x: 10200, y: 2100 }, targets)?.key === "head", "over a table on a stage it is the table, the smaller of the two");
  assert(targetUnder({ x: 12500, y: 3000 }, targets)?.key === "stage", "off the table but on the stage it is the stage");
  assert(targetUnder({ x: 15000, y: 9000 }, targets) === undefined, "over bare floor it is nothing");

  // Dropped anywhere over the table → its middle; dragged past within reach → its middle; further → free.
  assert(near(centreOver({ x: 5600, y: 5500 }, targets)!.point, { x: 5000, y: 6000 }), "a drop over a table lands in its middle");
  assert(centreOver({ x: 5600, y: 5500 }, targets, 200) === null, "a drag 0.78 off the middle is not pulled to it");
  assert(near(centreOver({ x: 5100, y: 6050 }, targets, 200)!.point, { x: 5000, y: 6000 }), "a drag 0.11 off the middle is");
  assert(centreOver({ x: 15000, y: 9000 }, targets) === null, "nothing under it, nothing to centre on");

  // A crescent head table: its middle is on the band, not in the air at its box centre.
  const arc = hangTarget("arc", { kind: "custom", outline: [{ x: -1500, y: -500 }, { x: 1500, y: -500 }, { x: 1500, y: 500 }, { x: 1000, y: 500 }, { x: 1000, y: 0 }, { x: -1000, y: 0 }, { x: -1000, y: 500 }, { x: -1500, y: 500 }] }, { x: 3000, y: 3000 });
  assert(insidePolys(arc.centre, arc.polys), "a shaped table's middle is inside its outline, not in its notch");
  // Turned a quarter turn, the middle turns with it.
  const turned = hangTarget("arc90", { kind: "custom", outline: [{ x: -1500, y: -500 }, { x: 1500, y: -500 }, { x: 1500, y: 500 }, { x: 1000, y: 500 }, { x: 1000, y: 0 }, { x: -1000, y: 0 }, { x: -1000, y: 500 }, { x: -1500, y: 500 }] }, { x: 3000, y: 3000 }, 90);
  assert(insidePolys(turned.centre, turned.polys), "…and stays inside it when the table is turned");
  const o = anchorOffset({ kind: "custom", outline: [{ x: -1500, y: -500 }, { x: 1500, y: -500 }, { x: 1500, y: 500 }, { x: 1000, y: 500 }, { x: 1000, y: 0 }, { x: -1000, y: 0 }, { x: -1000, y: 500 }, { x: -1500, y: 500 }] }, 90);
  assert(near({ x: 3000 + o.x, y: 3000 + o.y }, turned.centre), "anchorOffset is the same carry hangTarget makes");

  // Two ties fix it: 5.00 off the left wall, 6.00 off the top (the nearer of each pair).
  const ties = wallTies({ x: 5000, y: 6000 }, walls);
  assert(ties.length === 2, "two ties fix a hang point");
  assert(ties.some((t) => t.axis === "x" && Math.abs(t.mm - 5000) < 1 && t.b.x === 0), "5.00 to the nearer side wall");
  assert(ties.some((t) => t.axis === "y" && Math.abs(t.mm - 6000) < 1), "6.00 to the nearer end wall");
  const corner = wallTies({ x: 18000, y: 1000 }, walls);
  assert(corner.some((t) => t.axis === "x" && Math.abs(t.mm - 2000) < 1 && t.b.x === 20000), "near the right wall it measures to the right wall");
  assert(corner.some((t) => t.axis === "y" && Math.abs(t.mm - 1000) < 1 && t.b.y === 0), "…and to the top one");
  assert(wallTies({ x: 5000, y: 6000 }, []).length === 0, "no walls, no ties");

  // Off the centre of what it hangs over: two legs; on the centre: none.
  const legs = centreOffset({ x: 5400, y: 5700 }, { x: 5000, y: 6000 });
  assert(legs.length === 2 && Math.abs(legs[0].mm - 400) < 1 && Math.abs(legs[1].mm - 300) < 1, "0.40 across and 0.30 along");
  assert(near(legs[0].b, legs[1].a) && near(legs[1].b, { x: 5400, y: 5700 }), "the legs run centre → corner → hang point");
  assert(centreOffset({ x: 5000, y: 6005 }, { x: 5000, y: 6000 }).length === 0, "hung on the centre, there is no offset to give");
  assert(centreOffset({ x: 5000, y: 6400 }, { x: 5000, y: 6000 }).length === 1, "straight down the line, one leg");

  // The height: the placement's own, else the catalog row's, else nothing.
  const row = { categoryFields: { [HANG_FIELD]: 3200 } };
  assert(hangHeightOf({}, row) === 3200, "the row's default height");
  assert(hangHeightOf({ hangHeightMm: 2800 }, row) === 2800, "an item's own height wins");
  assert(hangHeightOf({}, { categoryFields: {} }) === undefined, "no height said, none printed");
  assert(hangHeightOf({}, { categoryFields: { [HANG_FIELD]: "abc" } }) === undefined, "garbage is no height, not NaN");
  assert(formatHang(3200) === "↓ 3.20 מ׳", "printed as metres, down");

  console.log("hang self-check passed");
}
