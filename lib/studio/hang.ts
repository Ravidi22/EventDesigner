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
import { footprintBounds, type Footprint } from "./footprint";
import { labelAnchor } from "./label-anchor";
import { footprintPolygons, insidePolys, polysBox, type Poly } from "./proximity";
import { fromLocalFrame, sampleEdgePoints } from "./geometry";
import { nodeMap, wallPoints, type VenueStructure } from "@/lib/venues/structure";

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

/** An offset off the middle of what an item hangs over shorter than this is not an offset: it is
 *  the few centimetres a chandelier was let go beside the table's middle by eye, and a rigger told
 *  "0.03 across" marks the middle anyway. Below it the item is hung dead centre — on the sketch's
 *  live ties and on the printed ceiling plan alike. */
export const OFFSET_MIN_MM = 100;

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

/** A block of tables pushed together as one (a design group) as something to hang over: the box
 *  round every member, each boxed where it stands (through its own turn), and the box's centre as
 *  the middle. The BOX, not a union of outlines — the studio draws a group's chairs round its box
 *  for the same reason: grouping says "these are one table now", and the designer has pushed them
 *  into a block to make that true. Two head tables as one block are one table to the crew
 *  (numberedUnits), so this stands IN for its members: a chandelier over either half is centred on
 *  the seam, which no member's own middle could offer. */
export function blockTarget(key: string, members: readonly { f: Footprint; at: Point; rotationDeg?: number }[]): HangTarget {
  const b = polysBox(
    members.map(({ f, at, rotationDeg }) => {
      const { w, h } = footprintBounds(f);
      return [-1, 1].flatMap((sx) => [-1, 1].map((sy) => fromLocalFrame({ x: (sx * w) / 2, y: (sy * h) / 2 }, at, rotationDeg ?? 0)));
    }),
  );
  return {
    key,
    polys: [[{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }]],
    centre: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
  };
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
export function centreOffset(p: Point, centre: Point, minMm = OFFSET_MIN_MM): HangTie[] {
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
