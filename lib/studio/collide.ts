import type { Point } from "./hall";
import type { SnapBox } from "./snap";
import { isMain } from "../self-check";

// Two things cannot stand in the same place.
//
// A plan is a drawing OF A ROOM, and the room is the authority: a table cannot stand in a sofa, a
// deck cannot stand in a deck, and nothing stands in a wall. A plan that shows it is not a bold
// arrangement, it is wrong — and wrong in the expensive direction, because the crew builds what the
// sheet says and finds out at 6pm. Snapping already offered the RIGHT answer (an edge against an
// edge, no gap); this stops the drag going one pixel further and putting one thing inside another.
//
// EVERY ELEMENT, AND ONE LIST OF EXCEPTIONS (the user, 2026-11-20: "needs all elements"). It used
// to be same-kind only — a deck held off a deck, a table off a table, and a table walked straight
// through a sofa, a bar or a wall. Now every pair of floor things holds, except the pairs in
// MAY_OVERLAP below, each of which is a real arrangement the plan has to keep being able to draw:
// a head table and a chuppah stand ON a stage, a rug lies UNDER everything, an aisle runs between
// its rows of chairs. What is not standing on the floor at all — an item on a table, a candle
// perched on a banquette, anything hung — is not a solid in the first place (canvas-stage's
// solidKindOf), and neither is what the drag carries with it. A WALL (wallSolids) holds every
// floor thing, stages and rugs included; a doorway is cut out of it.
//
// A NUDGE, NOT A SOLVER. Each pass finds the deepest overlap and pushes along its shorter axis —
// the least it can move to be legal, which is also the direction that reads as "it slid along the
// edge". A handful of passes settles anything a designer actually builds (a deck between two decks,
// a table pushed into a row). A deliberate pile it cannot untangle keeps whatever improvement the
// passes made and stops; it never makes an overlap deeper than it found it.

/** The key of every wall segment (wallSolids). Nothing on the floor passes through one. */
export const WALL_SOLID = "wall";

/** The key a rug or a dance floor holds under (catalog-resolver holdKind): lying under everything,
 *  it holds against walls alone. */
export const FLOOR_COVER = "floor-cover";

/** Any kind but a wall — and, unless the row names it twice, any kind but itself. */
const ANY = "*";

/**
 * THE ONE LIST: the pairs of floor things that MAY overlap, each with why. Read both ways round.
 * `*` is every OTHER kind (never a wall, never the kind itself — two stages hold, two chuppahs
 * hold); a kind against itself is listed by name. Every pair not on this list holds.
 *
 * Kinds are the catalog's category ids (catalog-resolver solidKind), plus "table" for every table on
 * the plan, "stage" for stages, decks and the venue's own staging, "bar" for bars hired and built,
 * and FLOOR_COVER. A pair that was genuinely unclear was answered permissively (it may overlap) —
 * the last group.
 */
export const MAY_OVERLAP: readonly (readonly [string, string, string])[] = [
  // A floor to stand on.
  ["stage", ANY, "a stage is floor: a head table, a chuppah, a bar, a flight stand on it"],
  ["stage-surfaces", ANY, "a stage's surface is floor"],
  [FLOOR_COVER, ANY, "a rug or a dance floor lies under everything"],
  [FLOOR_COVER, FLOOR_COVER, "rugs are layered"],
  ["pool", "fountains", "a fountain stands in the pool's water"],
  // An aisle and what lines it.
  ["aisles", "chairs", "an aisle runs between its rows of chairs"],
  ["aisles", "sofas", "…or its sofas"],
  ["aisles", "arches", "an aisle is walked through an arch"],
  ["aisles", "gates", "…or a gate"],
  ["aisles", "flower-arrangements", "flowers line it"],
  ["aisles", "vases", "…on plinths"],
  ["aisles", "candlesticks", "candles line it"],
  ["aisles", "lamps", "…and lanterns"],
  ["aisles", "columns", "…and columns"],
  // Flowers dressing another piece.
  ["flower-arrangements", "columns", "a sleeve of flowers round a column"],
  ["flower-arrangements", "vases", "an arrangement set on a floor plinth"],
  ["flower-arrangements", "arches", "flowers at an arch's feet"],
  ["flower-arrangements", "gates", "…a gate's"],
  ["flower-arrangements", "backdrops", "…a backdrop's"],
  // Permissive — a canopy you stand UNDER, whose box is its roof or crown, not what stands on the floor.
  ["chuppahs", ANY, "the couple and a kiddush table stand under a chuppah"],
  ["pergolas", ANY, "a pergola's box is its roof; only its posts stand on the floor"],
  ["trees", ANY, "a tree's box is its crown; its trunk takes a pot's worth of floor"],
];

const anyKinds = new Set(MAY_OVERLAP.filter((r) => r[1] === ANY).map((r) => r[0]));
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const listedPairs = new Set(MAY_OVERLAP.filter((r) => r[1] !== ANY).map((r) => pairKey(r[0], r[1])));

/** May things of kinds `a` and `b` stand in the same place? (MAY_OVERLAP — both ways round.) */
export function mayOverlap(a: string, b: string): boolean {
  if (a === WALL_SOLID || b === WALL_SOLID) return false;
  if (listedPairs.has(pairKey(a, b))) return true;
  if (a === b) return false;
  return anyKinds.has(a) || anyKinds.has(b);
}

/** A door's opening on its wall: its two jambs (lib/studio/anchor.ts doorOpenings). */
export interface WallGap {
  a: Point;
  b: Point;
}

/** A door is in a segment's line when both its jambs are this near it. */
const DOOR_ON_WALL_MM = 50;

/**
 * Every wall as THIN SEGMENTS the hold reads like any other solid: a rectangle as long as the
 * segment and no thickness, turned to it — so a thing pushed through a wall comes back flush against
 * its line, an angled wall included. `walls` is lib/studio/wall-clip.ts wallPolylines (a bowed wall
 * already cut into chords); a doorway (`doors`) is cut out of its wall, so a gate or an arch stands
 * in it and a table carried through the door into the next room is not held at the jamb.
 */
export function wallSolids(walls: readonly (readonly Point[])[], doors: readonly WallGap[] = []): SolidBox[] {
  const out: SolidBox[] = [];
  for (const line of walls) {
    for (let i = 0; i + 1 < line.length; i++) {
      const p = line[i];
      const q = line[i + 1];
      const L = Math.hypot(q.x - p.x, q.y - p.y);
      if (L < 1) continue;
      const ux = (q.x - p.x) / L;
      const uy = (q.y - p.y) / L;
      // What of [0, L] the doors on this line leave standing.
      let runs: [number, number][] = [[0, L]];
      for (const d of doors) {
        const across = (r: Point) => Math.abs((r.x - p.x) * uy - (r.y - p.y) * ux);
        if (across(d.a) > DOOR_ON_WALL_MM || across(d.b) > DOOR_ON_WALL_MM) continue;
        const sa = (d.a.x - p.x) * ux + (d.a.y - p.y) * uy;
        const sb = (d.b.x - p.x) * ux + (d.b.y - p.y) * uy;
        const lo = Math.min(sa, sb);
        const hi = Math.max(sa, sb);
        runs = runs.flatMap(([r0, r1]): [number, number][] =>
          hi <= r0 || lo >= r1
            ? [[r0, r1]]
            : ([
                [r0, Math.min(lo, r1)],
                [Math.max(hi, r0), r1],
              ] as [number, number][]).filter(([x0, x1]) => x1 - x0 >= 1),
        );
      }
      const rotation = (Math.atan2(uy, ux) * 180) / Math.PI;
      for (const [s0, s1] of runs) {
        const len = s1 - s0;
        const mid = (s0 + s1) / 2;
        out.push({
          x: p.x + ux * mid,
          y: p.y + uy * mid,
          widthMm: Math.abs(ux) * len,
          depthMm: Math.abs(uy) * len,
          solid: WALL_SOLID,
          shape: { rotation, widthMm: len, depthMm: 0 },
        });
      }
    }
  }
  return out;
}

/** A box that takes part in the rule, and the kind of thing it is. Two boxes hold each other off
 *  unless their kinds may overlap (mayOverlap). */
export interface SolidBox extends SnapBox {
  solid: string;
}

/** Signed overlap of two extents on one axis: positive is how deep they penetrate, ≤0 is clear. */
const penetration = (aCentre: number, aSize: number, bCentre: number, bSize: number) =>
  (aSize + bSize) / 2 - Math.abs(aCentre - bCentre);

/** Which way `a` has to go to leave `b` — away from it, and arbitrarily but consistently positive
 *  when two boxes are exactly concentric (there is no "away" then, and standing still is not an
 *  answer). */
const away = (aCentre: number, bCentre: number) => (aCentre < bCentre ? -1 : 1);

/** How far a pair (`id`) may be ignored: pairs already overlapping when the gesture began. */
export type Ignore = (moverIndex: number, obstacleIndex: number) => boolean;

/** Overlap this shallow between two TRUE shapes is touching: a turned thing's position is whole
 *  millimetres, so flush at an angle is never exact. */
const SHAPE_EPS_MM = 1;

/** Does the box stand for something other than itself — a circle, or a rectangle at an angle that is
 *  not a whole quarter turn (one stood on end is exactly the box it takes up)? */
const turned = (b: SolidBox): boolean => {
  if (!b.shape) return false;
  if (b.shape.round) return true;
  const q = (((b.shape.rotation % 90) + 90) % 90) / 90;
  return Math.min(q, 1 - q) > 1e-6;
};

type Convex = { round: true; c: Point; r: number } | { round: false; c: Point; corners: Point[]; axes: Point[] };

/** A box's true outline, centred at (x, y). */
function convexOf(b: SolidBox, x: number, y: number): Convex {
  const c = { x, y };
  if (b.shape?.round) return { round: true, c, r: b.shape.widthMm / 2 };
  const t = ((b.shape?.rotation ?? 0) * Math.PI) / 180;
  const ux = { x: Math.cos(t), y: Math.sin(t) };
  const uy = { x: -Math.sin(t), y: Math.cos(t) };
  const w = (b.shape ? b.shape.widthMm : b.widthMm) / 2;
  const d = (b.shape ? b.shape.depthMm : b.depthMm) / 2;
  const corners = [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
  ].map(([i, k]) => ({ x: x + i * ux.x + k * uy.x, y: y + i * ux.y + k * uy.y }));
  return { round: false, c, corners, axes: [ux, uy] };
}

const project = (s: Convex, n: Point): [number, number] => {
  if (s.round) {
    const m = s.c.x * n.x + s.c.y * n.y;
    return [m - s.r, m + s.r];
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of s.corners) {
    const m = q.x * n.x + q.y * n.y;
    lo = Math.min(lo, m);
    hi = Math.max(hi, m);
  }
  return [lo, hi];
};

/**
 * The least move that takes `a`, standing at (ax, ay), out of `b` — with how deep they overlap — or
 * null when they do not. Two plain boxes: out along the SHORTER axis, as this rule has always done.
 * Anything turned or round (SnapBox.shape) by its TRUE outline — separating axes, a circle as a
 * circle — so two 30° decks a few centimetres apart are not held off by the boxes they take up, and
 * two rounds on a diagonal touch at their rims, not ~750mm short of them.
 */
function separation(a: SolidBox, ax: number, ay: number, b: SolidBox): { x: number; y: number; depth: number } | null {
  const px = penetration(ax, a.widthMm, b.x, b.widthMm);
  const py = penetration(ay, a.depthMm, b.y, b.depthMm);
  // Touching exactly (penetration 0) is legal and is in fact the answer the snap was aiming for —
  // flush. Only a real overlap on BOTH axes is a collision. Whatever the shapes, they are inside
  // these boxes: clear of each other's box, clear of each other.
  if (px <= 0 || py <= 0) return null;
  if (!turned(a) && !turned(b)) {
    // Out along the SHORTER axis: the smallest move that makes it legal, and the one that leaves the
    // item where the designer was pushing it rather than throwing it round the obstacle.
    return px <= py ? { x: away(ax, b.x) * px, y: 0, depth: px } : { x: 0, y: away(ay, b.y) * py, depth: py };
  }
  const A = convexOf(a, ax, ay);
  const B = convexOf(b, b.x, b.y);
  const axes: Point[] = [];
  if (A.round && B.round) {
    const v = { x: A.c.x - B.c.x, y: A.c.y - B.c.y };
    const L = Math.hypot(v.x, v.y);
    axes.push(L > 1e-9 ? { x: v.x / L, y: v.y / L } : { x: 1, y: 0 });
  } else {
    for (const s of [A, B]) if (!s.round) axes.push(...s.axes);
    // A circle against a rectangle: also the line from the circle's centre to the nearest corner.
    const circle = A.round ? A : B.round ? B : null;
    const box = !A.round ? A : !B.round ? B : null;
    if (circle && box) {
      const corner = box.corners.reduce((n, q) => (Math.hypot(q.x - circle.c.x, q.y - circle.c.y) < Math.hypot(n.x - circle.c.x, n.y - circle.c.y) ? q : n));
      const v = { x: circle.c.x - corner.x, y: circle.c.y - corner.y };
      const L = Math.hypot(v.x, v.y);
      if (L > 1e-9) axes.push({ x: v.x / L, y: v.y / L });
    }
  }
  let best: { x: number; y: number; depth: number } | null = null;
  for (const n of axes) {
    const [a0, a1] = project(A, n);
    const [b0, b1] = project(B, n);
    const forward = b1 - a0; // a moved along +n by this clears b
    const backward = a1 - b0; // …along −n by this
    if (forward <= SHAPE_EPS_MM || backward <= SHAPE_EPS_MM) return null;
    const [sign, depth] = forward <= backward ? [1, forward] : [-1, backward];
    if (!best || depth < best.depth) best = { x: n.x * sign * depth, y: n.y * sign * depth, depth };
  }
  return best;
}

/**
 * The delta that takes `movers` — one dragged item, or a whole selection moving as one — out of
 * every `obstacles` box it may not overlap (mayOverlap). `{ x: 0, y: 0 }` when there is nothing to resolve, which
 * is the overwhelming majority of frames.
 *
 * ONE DELTA FOR ALL THE MOVERS, because that is what a group drag is: the arrangement inside the
 * selection is the designer's and this file does not get to shear it. A block of four decks pushed
 * into a fifth stops as a block.
 */
export function pushApart(movers: SolidBox[], obstacles: SolidBox[], ignore?: Ignore, maxPasses = 8): Point {
  let dx = 0;
  let dy = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    let worst: { x: number; y: number; depth: number } | null = null;
    for (let i = 0; i < movers.length; i++) {
      const m = movers[i];
      for (let j = 0; j < obstacles.length; j++) {
        const o = obstacles[j];
        if (mayOverlap(m.solid, o.solid)) continue;
        if (ignore?.(i, j)) continue;
        const out = separation(m, m.x + dx, m.y + dy, o);
        if (out && (!worst || out.depth > worst.depth)) worst = out;
      }
    }
    if (!worst) break;
    dx += worst.x;
    dy += worst.y;
  }
  return { x: Math.round(dx), y: Math.round(dy) };
}

/**
 * The same rule as a MAGNET, for a drag in progress: the push is honoured only while it is small —
 * the drag has just touched something and is being held flush against it — and given up the moment
 * it would take more than `reachMm` to put right, at which point the item simply goes where the
 * pointer is.
 *
 * Why a drag gets this and not the wall: a hard pushApart holds the dragged item against whatever it
 * touched until the pointer is past that thing's middle, and then throws it out the far side. On a
 * room of tables that is "the drag gets stuck on everything", which is exactly what designers
 * reported. Held only within a few screen pixels, flush is still the easy answer — two decks still
 * butt into one platform — but nothing is ever trapped: push on past the edge and the item follows.
 * An overlap the designer chose is theirs to fix (the clearance halos say so); a drop from the rail
 * still uses the hard rule, since nothing was pushing it.
 */
export function nudgeApart(movers: SolidBox[], obstacles: SolidBox[], reachMm: number, ignore?: Ignore): Point {
  const push = pushApart(movers, obstacles, ignore);
  return Math.hypot(push.x, push.y) <= reachMm ? push : { x: 0, y: 0 };
}

/** overlappingAtStart's answer: an Ignore that can also be told where the movers have got to. */
export interface StartOverlaps extends Ignore {
  /** Forget every remembered pair that stands CLEAR with the movers where they are now: from then on
   *  it is held like any other pair. Cheap — it looks only at the pairs still remembered, which is
   *  nearly always none. */
  release(movers: SolidBox[], obstacles: SolidBox[]): void;
}

/** The pairs that were ALREADY overlapping — a gesture must not resolve those. You may leave a bad
 *  arrangement, and you may not enter one: a plan drawn before this rule existed (or one a designer
 *  built deliberately) can still be picked up and dragged without the first pixel of movement
 *  teleporting it somewhere legal. Computed once, when the drag begins — and each pair is let go
 *  of (`release`, every frame of the drag) the first time it is dragged clear: once out, it cannot
 *  go back in. Remembered for the whole gesture, a pair that started overlapped was never held
 *  again even after it had been dragged clear across the room. */
export function overlappingAtStart(movers: SolidBox[], obstacles: SolidBox[]): StartOverlaps {
  const pairs = new Set<string>();
  const overlapping = (m: SolidBox, o: SolidBox) => !mayOverlap(m.solid, o.solid) && separation(m, m.x, m.y, o) !== null;
  movers.forEach((m, i) =>
    obstacles.forEach((o, j) => {
      if (overlapping(m, o)) pairs.add(`${i}:${j}`);
    }),
  );
  const ignore = ((i: number, j: number) => pairs.has(`${i}:${j}`)) as StartOverlaps;
  ignore.release = (now, obs) => {
    for (const key of pairs) {
      const [i, j] = key.split(":").map(Number);
      if (now[i] && obs[j] && !overlapping(now[i], obs[j])) pairs.delete(key);
    }
  };
  return ignore;
}

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/collide.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const deck = (x: number, y: number, solid = "stage", w = 4000, d = 2000): SolidBox => ({ x, y, widthMm: w, depthMm: d, solid });

  // Clear of everything: nothing to say.
  assert(pushApart([deck(9000, 0)], [deck(0, 0)]).x === 0, "a deck standing clear is left alone");
  assert(pushApart([deck(9000, 0)], []).y === 0, "…and so is one with nothing to hit");

  // Exactly flush is LEGAL — it is the answer the snap was aiming for.
  const flush = pushApart([deck(4000, 0)], [deck(0, 0)]);
  assert(flush.x === 0 && flush.y === 0, "two decks touching edge to edge are not overlapping");

  // Pushed 500 into its neighbour, it comes back out to flush — along x, the shorter way out.
  const nudged = pushApart([deck(3500, 0)], [deck(0, 0)]);
  assert(nudged.x === 500 && nudged.y === 0, "a deck pushed into another is put back against it");
  assert(3500 + nudged.x - 4000 / 2 === 0 + 4000 / 2, "…exactly flush, no gap invented");

  // From the other side it goes the other way.
  assert(pushApart([deck(-3500, 0)], [deck(0, 0)]).x === -500, "…and out the way it came in");

  // The SHORTER axis wins: a deck sitting slightly low over another leaves through the y, even
  // though it is deep inside on x.
  const shallow = pushApart([deck(200, 1900)], [deck(0, 0)]);
  assert(shallow.x === 0 && shallow.y === 100, "it leaves by the nearest edge, not the furthest");

  // ONE DELTA for a whole selection, and the selection keeps its shape.
  const block = [deck(0, 0), deck(4000, 0)]; // two decks already butted into one platform
  const together = pushApart(block, [deck(7500, 0)]);
  assert(together.x === -500, "a block pushed into something stops as a block");
  assert(together.y === 0, "…without shearing, because there is only ever one delta");

  // Different kinds pass through each other: a chuppah stands on a stage, and that is not a bug.
  assert(pushApart([deck(3500, 0, "chuppah")], [deck(0, 0, "stage")]).x === 0, "a chuppah may stand on a stage");
  assert(pushApart([deck(3500, 0, "stage")], [deck(0, 0, "stage")]).x === 500, "…but a stage may not stand on a stage");

  // A 4m hole between two decks, and a 4m deck pushed at the left-hand one: it settles in the hole,
  // flush with both. The gap a run of modules leaves is exactly one module wide, so this is the
  // ordinary case and not a corner of one.
  const between = pushApart([deck(3500, 0)], [deck(0, 0), deck(8000, 0)]);
  const at = 3500 + between.x;
  assert(at === 4000, "squeezed into the hole between two decks it lands in the hole");
  assert(at - 2000 === 2000 && at + 2000 === 6000, "…flush with the one on each side of it");

  // Already overlapping when the gesture began: left alone, or the first pixel of a drag would
  // teleport it. It can still be dragged out, and once out it cannot go back in.
  const mover = [deck(1000, 0)];
  const obstacle = [deck(0, 0)];
  const wasOverlapping = overlappingAtStart(mover, obstacle);
  assert(wasOverlapping(0, 0), "a pair that starts overlapped is remembered");
  const held = pushApart(mover, obstacle, wasOverlapping);
  assert(held.x === 0 && held.y === 0, "…and is not resolved mid-gesture");
  const forced = pushApart(mover, obstacle);
  // Out along y: 3000 deep on x and only 2000 on y, and the rule is always the shorter way out.
  assert(forced.x === 0 && forced.y === 2000, "…while the same pair without that memory is put right");
  assert(!overlappingAtStart([deck(9000, 0)], obstacle)(0, 0), "a pair that starts clear is not");
  // …and once it HAS been dragged out the memory is let go: pushed back in, it is held like any
  // other pair. It used to stay exempt for the whole gesture, dragged clear or not.
  const exempt = overlappingAtStart([deck(1000, 0)], [deck(0, 0)]);
  exempt.release([deck(2500, 0)], [deck(0, 0)]);
  assert(exempt(0, 0), "a pair still overlapping stays exempt");
  exempt.release([deck(4100, 0)], [deck(0, 0)]);
  assert(!exempt(0, 0), "a pair dragged clear is exempt no longer");
  const heldAgain = nudgeApart([deck(3900, 0)], [deck(0, 0)], 150, exempt);
  assert(heldAgain.x === 100 && heldAgain.y === 0, "…pushed back against it, it is held flush like any other pair");

  // A pile it cannot untangle: it keeps whatever it managed and stops, rather than looping.
  const pile = pushApart([deck(0, 0)], [deck(0, 0), deck(10, 0), deck(-10, 0)], undefined, 3);
  assert(Number.isFinite(pile.x) && Number.isFinite(pile.y), "an impossible pile still returns an answer");

  // ── TRUE SHAPES (QA MG-4/MG-9). A turned thing is held by its outline, never by the room its
  // turned box takes — two 30° decks a few centimetres apart have boxes overlapping by hundreds of
  // millimetres; two rounds on a diagonal, by ~750.
  const turnedBox = (x: number, y: number, rotation: number, w = 4000, d = 2000, solid = "stage"): SolidBox => {
    const t = (rotation * Math.PI) / 180;
    const c = Math.abs(Math.cos(t));
    const s = Math.abs(Math.sin(t));
    return { x, y, widthMm: w * c + d * s, depthMm: w * s + d * c, solid, shape: { rotation, widthMm: w, depthMm: d } };
  };
  const along30 = (k: number) => ({ x: k * Math.cos(Math.PI / 6), y: k * Math.sin(Math.PI / 6) });
  const at30 = (k: number) => turnedBox(along30(k).x, along30(k).y, 30);
  assert(pushApart([at30(4100)], [turnedBox(0, 0, 30)]).x === 0 && pushApart([at30(4100)], [turnedBox(0, 0, 30)]).y === 0, "two 30° decks 100mm apart are clear, though their turned boxes overlap");
  const into30 = pushApart([at30(3950)], [turnedBox(0, 0, 30)]);
  assert(Math.abs(Math.hypot(into30.x, into30.y) - 50) <= 1 && Math.abs(into30.x - along30(50).x) <= 1, "one pushed 50mm into another is put back flush ALONG their own frame");
  assert(!overlappingAtStart([at30(4000)], [turnedBox(0, 0, 30)])(0, 0), "two 30° decks flush are not an overlap the drag began with");
  assert(nudgeApart([at30(3990)], [turnedBox(0, 0, 30)], 150).x !== 0, "…and dragged 1cm into each other, the magnet holds them flush");
  const disc = (x: number, y: number, dia = 1800): SolidBox => ({ x, y, widthMm: dia, depthMm: dia, solid: "table", shape: { round: true, rotation: 0, widthMm: dia, depthMm: dia } });
  const diag = (1800 + 300) / Math.SQRT2;
  assert(pushApart([disc(diag, diag)], [disc(0, 0)]).x === 0, "two ⌀1.8 rounds on a diagonal with 30cm between the rims are clear");
  const pressed = pushApart([disc(1700 / Math.SQRT2, 1700 / Math.SQRT2)], [disc(0, 0)]);
  assert(Math.abs(pressed.x - 100 / Math.SQRT2) <= 1 && Math.abs(pressed.y - 100 / Math.SQRT2) <= 1, "…pressed 10cm into each other, pushed back out along the line between their centres");
  const t45 = (k: number) => turnedBox((k * Math.SQRT2) / 2, (k * Math.SQRT2) / 2, 45, 2000, 1000, "table");
  const air = pushApart([t45(2300)], [t45(0)]);
  assert(air.x === 0 && air.y === 0, "two 45° tables with 30cm of real air are left alone — not pushed 1.5m apart on a drop");
  const square = pushApart([turnedBox(3500, 0, 90, 2000, 4000)], [deck(0, 0)]);
  assert(square.x === 500 && square.y === 0, "a deck stood on end is still its own box");

  // The magnet: a shallow overlap is held flush, a deep one is let through.
  const touching = nudgeApart([deck(3900, 0)], [deck(0, 0)], 150);
  assert(touching.x === 100 && touching.y === 0, "just touching, the dragged deck is held flush");
  const pushedOn = nudgeApart([deck(2500, 0)], [deck(0, 0)], 150);
  assert(pushedOn.x === 0 && pushedOn.y === 0, "pushed well past the edge, it is no longer held — it follows the pointer");
  assert(nudgeApart([deck(9000, 0)], [deck(0, 0)], 150).x === 0, "clear of everything, nothing to say");
  assert(nudgeApart([deck(1000, 0)], [deck(0, 0)], 150, overlappingAtStart([deck(1000, 0)], [deck(0, 0)])).x === 0, "…and a pair already overlapping is still ignored");

  // ── EVERY ELEMENT (the user, 2026-11-20): one list of pairs that may overlap; every other pair
  // of floor things holds.
  assert(pushApart([deck(3500, 0, "table")], [deck(0, 0, "sofas")]).x === 500, "a table pushed into a sofa is held off it");
  assert(pushApart([deck(3500, 0, "bar")], [deck(0, 0, "columns")]).x === 500, "a bar is held off a column");
  assert(pushApart([deck(3500, 0, "table")], [deck(0, 0, "stage")]).x === 0, "a table may stand on a stage");
  assert(pushApart([deck(3500, 0, "chuppahs")], [deck(0, 0, "stage")]).x === 0, "…and so may a chuppah");
  assert(pushApart([deck(3500, 0, FLOOR_COVER)], [deck(0, 0, "table")]).x === 0, "a rug lies under a table");
  assert(pushApart([deck(3500, 0, "table")], [deck(0, 0, FLOOR_COVER)]).x === 0, "…whichever of them is dragged");
  assert(pushApart([deck(3500, 0, "aisles")], [deck(0, 0, "chairs")]).x === 0, "an aisle runs between its rows of chairs");
  assert(pushApart([deck(3500, 0, "table")], [deck(0, 0, "aisles")]).x === 500, "…but a table is held off it");
  assert(!overlappingAtStart([deck(1000, 0, "table")], [deck(0, 0, "stage")])(0, 0), "a pair that may overlap is nothing the gesture remembers");
  assert(overlappingAtStart([deck(1000, 0, "table")], [deck(0, 0, "sofas")])(0, 0), "…a pair that holds, already overlapping, is");
  assert(mayOverlap("stage", "table") && mayOverlap("table", "stage") && !mayOverlap("stage", "stage"), "the table reads both ways round, and two stages hold");
  assert(!mayOverlap("table", WALL_SOLID) && !mayOverlap(FLOOR_COVER, WALL_SOLID) && !mayOverlap("stage", WALL_SOLID), "nothing on the floor passes through a wall — not a rug, not a stage");
  assert(mayOverlap(FLOOR_COVER, FLOOR_COVER), "two rugs may be layered");

  // ── WALLS: every wall line is a thin segment in the same test.
  const room = wallSolids([[{ x: 0, y: 0 }, { x: 10000, y: 0 }], [{ x: 10000, y: 0 }, { x: 10000, y: 8000 }]]);
  assert(room.length === 2, "one obstacle per wall segment");
  const intoWall = pushApart([deck(5000, 900, "table")], room); // 2000 deep: its top edge at −100
  assert(intoWall.x === 0 && intoWall.y === 100, "a table pushed 10cm through a wall comes back flush against it");
  assert(pushApart([deck(5000, 1000, "table")], room).y === 0, "flush against the wall is legal");
  assert(pushApart([deck(8100, 3000, "stage")], room).x === -100, "a stage is held by a wall like everything else");
  const slanted = wallSolids([[{ x: 0, y: 0 }, { x: 10000, y: 10000 }]]);
  const diagonal = pushApart([deck(5300, 4700, "table", 1000, 1000)], slanted);
  assert(diagonal.x > 0 && Math.abs(diagonal.x + diagonal.y) <= 1, "an angled wall pushes straight out across its line");
  // A doorway is not a wall: the stretch between a door's jambs takes nothing.
  const door = wallSolids([[{ x: 0, y: 0 }, { x: 10000, y: 0 }]], [{ a: { x: 4000, y: 0 }, b: { x: 6000, y: 0 } }]);
  assert(door.length === 2, "a door cuts its wall in two");
  assert(pushApart([deck(5000, 0, "gates", 1800, 400)], door).y === 0, "a gate stands in the doorway");
  assert(pushApart([deck(3000, 0, "gates", 1800, 400)], door).y !== 0, "…but not in the wall beside it");

  console.log("collide self-check passed");
}
