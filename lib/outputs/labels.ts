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
import { isMain } from "../self-check";

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

/** `obstacles` block every figure (the doors). `furniture` blocks only figures beside their line —
 *  a figure ON its line in an aisle between two tables necessarily sits among their chairs. */
export function placeLabels(reqs: LabelRequest[], obstacles: Box[], furniture: Box[] = []): Point[] {
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
    const alongs = [0.5, 0.35, 0.65, 0.2, 0.8, 0.08, 0.92].map((t) => t * L);
    alongs.push(-reach, L + reach);
    const sides: number[] = [...(r.inline ? [0] : []), r.side, -r.side];
    const box = (c: Point): Box => ({ minX: c.x - r.w / 2, minY: c.y - r.h / 2, maxX: c.x + r.w / 2, maxY: c.y + r.h / 2 });
    let chosen: Point | null = null;
    outer: for (const s of sides) {
      for (const t of alongs) {
        const c = { x: r.a.x + u.x * t + n.x * off * s, y: r.a.y + u.y * t + n.y * off * s };
        const b = box(c);
        if (!blockers.some((o) => hit(o, b)) && !taken.some((o) => hit(o, b))) {
          chosen = c;
          break outer;
        }
      }
    }
    const fallback = { x: r.a.x + u.x * (L / 2) + n.x * off * (r.inline ? 0 : r.side), y: r.a.y + u.y * (L / 2) + n.y * off * (r.inline ? 0 : r.side) };
    const at = chosen ?? fallback;
    taken.push(box(at));
    return at;
  });
}

// ponytail: self-check. Run: npm run check:labels
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const line = { a: { x: 0, y: 0 }, b: { x: 10000, y: 0 }, w: 1000, h: 400, gap: 100, side: -1 as const };
  const [free] = placeLabels([line], []);
  assert(free.x === 5000 && free.y < 0, "a clear line puts its figure at the middle, on its side");
  const door: Box = { minX: 4000, minY: -2000, maxX: 6000, maxY: 2000 };
  const [moved] = placeLabels([line], [door]);
  assert(moved.x + 500 <= 4000 || moved.x - 500 >= 6000, "a figure slides off a door");
  const [one, two] = placeLabels([line, line], []);
  assert(Math.abs(one.x - two.x) >= 1000 || Math.abs(one.y - two.y) >= 400, "two figures never land on each other");
  const short = { ...line, b: { x: 600, y: 0 } };
  const [past] = placeLabels([short], [{ minX: -50, minY: -2000, maxX: 650, maxY: 2000 }]);
  assert(past.x + 500 <= -50 || past.x - 500 >= 650, "a figure too big for its line goes past the end");
  const [onLine] = placeLabels([{ ...line, inline: true }], []);
  assert(onLine.y === 0, "an inline figure sits on its own line when it can");
  console.log("labels self-check passed");
}
