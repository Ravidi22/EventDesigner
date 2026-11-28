// WHERE A FIGURE GOES. A dimension's number used to sit at the middle of its line, whatever was
// there — and the middle of a wall is exactly where halls put their doors, so the room's depth
// printed on top of the door swing and the crew could read neither. Every figure on a sheet now goes
// through here, in one pass: it tries spots along its own line (middle first, then outwards), on its
// preferred side and then the other, then just past either end of a line too short to hold it, and
// takes the first spot clear of every obstacle (doors, furniture) and every figure already placed.
// When nothing is clear it falls back to the middle — a figure overprinted is still better than a
// dimension with no number.
//
// Text is set horizontally whatever the line's angle: every figure is a number, and a crew reads a
// number on a sheet taped to a wall without turning their head.
import type { Point } from "@/lib/studio/hall";
import { pointInPolygon } from "@/lib/venues/faces";

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LabelRequest {
  /** The dimension line the figure belongs to. */
  a: Point;
  b: Point;
  /** The figure's own size, world mm. */
  w: number;
  h: number;
  /** Clearance between the line and the figure, world mm. */
  gap: number;
  /** Which side of a→b to try first: +1 along the left-hand normal, −1 the other. */
  side: 1 | -1;
  /** Try sitting ON the line first (a figure in an aisle, haloed over its own line). */
  inline?: boolean;
}

const hit = (p: Box, q: Box) => p.minX < q.maxX && q.minX < p.maxX && p.minY < q.maxY && q.minY < p.maxY;

/** Whether a figure's box overlaps a shape — by its corners, edge midpoints and centre falling
 *  inside, or a vertex of the shape falling inside the box. Exact enough for a figure a few
 *  millimetres across, and exact where a bounding box is not: an L-shaped stage's bounding box
 *  covers the empty corner where its figures belong. */
function overlaps(b: Box, poly: Point[]): boolean {
  const mx = (b.minX + b.maxX) / 2, my = (b.minY + b.maxY) / 2;
  const probes = [
    { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
    { x: mx, y: b.minY }, { x: b.maxX, y: my }, { x: mx, y: b.maxY }, { x: b.minX, y: my }, { x: mx, y: my },
  ];
  if (probes.some((q) => pointInPolygon(q, poly))) return true;
  return poly.some((q) => q.x > b.minX && q.x < b.maxX && q.y > b.minY && q.y < b.maxY);
}

/** `obstacles` block every figure (the doors). `furniture` blocks only figures beside their line —
 *  a figure ON its line in an aisle between two tables necessarily sits among their chairs. `shapes`
 *  are outlines (stages, rugs, bars) no figure beside its line may sit on: a stage's lengths are read
 *  OUTSIDE the stage, never across the decks. */
export function placeLabels(reqs: LabelRequest[], obstacles: Box[], furniture: Box[] = [], shapes: Point[][] = []): Point[] {
  const taken: Box[] = [];
  return reqs.map((r) => {
    const blockers = r.inline ? obstacles : [...obstacles, ...furniture];
    const dx = r.b.x - r.a.x;
    const dy = r.b.y - r.a.y;
    const L = Math.hypot(dx, dy) || 1;
    const u = { x: dx / L, y: dy / L };
    const n = { x: -u.y, y: u.x };
    // How far off the line the CENTRE must be so the box clears it, at this line's angle.
    const off = r.gap + Math.abs(n.x) * (r.w / 2) + Math.abs(n.y) * (r.h / 2);
    const reach = Math.abs(u.x) * (r.w / 2) + Math.abs(u.y) * (r.h / 2) + r.gap;
    // Alongside its own line first, on either side; only then past an end. Going past the end
    // before trying the other side is how a stage's 4.88 used to float off beyond the stage's corner
    // while there was room for it right under its line.
    const middles = [0.5, 0.35, 0.65, 0.2, 0.8, 0.08, 0.92].map((t) => t * L);
    const ends = [-reach, L + reach];
    const sides: number[] = [...(r.inline ? [0] : []), r.side, -r.side];
    const box = (c: Point): Box => ({ minX: c.x - r.w / 2, minY: c.y - r.h / 2, maxX: c.x + r.w / 2, maxY: c.y + r.h / 2 });
    const candidates = [...sides.flatMap((sd) => middles.map((t) => [sd, t])), ...sides.flatMap((sd) => ends.map((t) => [sd, t]))];
    let chosen: Point | null = null;
    for (const [sd, t] of candidates) {
      const c = { x: r.a.x + u.x * t + n.x * off * sd, y: r.a.y + u.y * t + n.y * off * sd };
      const b = box(c);
      if (!blockers.some((o) => hit(o, b)) && !taken.some((o) => hit(o, b)) && (r.inline || !shapes.some((sh) => overlaps(b, sh)))) {
        chosen = c;
        break;
      }
    }
    const fallback = { x: r.a.x + u.x * (L / 2) + n.x * off * (r.inline ? 0 : r.side), y: r.a.y + u.y * (L / 2) + n.y * off * (r.inline ? 0 : r.side) };
    const at = chosen ?? fallback;
    taken.push(box(at));
    return at;
  });
}
