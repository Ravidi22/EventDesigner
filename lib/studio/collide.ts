import type { Point } from "./hall";
import type { SnapBox } from "./snap";
import { isMain } from "../self-check";

// Two of the same thing cannot stand in the same place.
//
// A plan is a drawing OF A ROOM, and the room is the authority: two staging decks cannot occupy the
// same square metre, so a plan that shows them doing it is not a bold arrangement, it is wrong — and
// wrong in the expensive direction, because the crew builds what the sheet says and finds out at
// 6pm. Snapping already offered the RIGHT answer (an edge against an edge, no gap); nothing stopped
// the drag going one pixel further and putting one deck on top of the other.
//
// SAME KIND ONLY, and that restraint is the whole design. A chuppah stands ON a stage, a plinth goes
// beside and behind a table, a rug lies UNDER everything — those are real arrangements and this file
// must never break one. So a box is only ever pushed out of a box carrying the SAME `solid` key: a
// deck out of a deck, a table out of a table, a bar out of a bar. Everything else may overlap freely
// and the drawing order (lib/design-document/stacking.ts) says which is in front.
//
// A NUDGE, NOT A SOLVER. Each pass finds the deepest overlap and pushes along its shorter axis —
// the least it can move to be legal, which is also the direction that reads as "it slid along the
// edge". A handful of passes settles anything a designer actually builds (a deck between two decks,
// a table pushed into a row). A deliberate pile it cannot untangle keeps whatever improvement the
// passes made and stops; it never makes an overlap deeper than it found it.

/** A box that takes part in the rule, and the kind of thing it is. Two boxes are solid to each
 *  other iff their keys are equal. */
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

/**
 * The delta that takes `movers` — one dragged item, or a whole selection moving as one — out of
 * every `obstacles` box of its own kind. `{ x: 0, y: 0 }` when there is nothing to resolve, which
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
    let worst: { px: number; py: number; sx: number; sy: number; depth: number } | null = null;
    for (let i = 0; i < movers.length; i++) {
      const m = movers[i];
      for (let j = 0; j < obstacles.length; j++) {
        const o = obstacles[j];
        if (m.solid !== o.solid) continue;
        if (ignore?.(i, j)) continue;
        const px = penetration(m.x + dx, m.widthMm, o.x, o.widthMm);
        const py = penetration(m.y + dy, m.depthMm, o.y, o.depthMm);
        // Touching exactly (penetration 0) is legal and is in fact the answer the snap was aiming
        // for — flush. Only a real overlap on BOTH axes is a collision.
        if (px <= 0 || py <= 0) continue;
        const depth = Math.min(px, py);
        if (!worst || depth > worst.depth) {
          worst = { px, py, sx: away(m.x + dx, o.x), sy: away(m.y + dy, o.y), depth };
        }
      }
    }
    if (!worst) break;
    // Out along the SHORTER axis: the smallest move that makes it legal, and the one that leaves
    // the item where the designer was pushing it rather than throwing it round the obstacle.
    if (worst.px <= worst.py) dx += worst.sx * worst.px;
    else dy += worst.sy * worst.py;
  }
  return { x: Math.round(dx), y: Math.round(dy) };
}

/** The pairs that were ALREADY overlapping — a gesture must not resolve those. You may leave a bad
 *  arrangement, and you may not enter one: a plan drawn before this rule existed (or one a designer
 *  built deliberately) can still be picked up and dragged without the first pixel of movement
 *  teleporting it somewhere legal. Computed once, when the drag begins. */
export function overlappingAtStart(movers: SolidBox[], obstacles: SolidBox[]): Ignore {
  const pairs = new Set<string>();
  movers.forEach((m, i) =>
    obstacles.forEach((o, j) => {
      if (m.solid !== o.solid) return;
      if (penetration(m.x, m.widthMm, o.x, o.widthMm) > 0 && penetration(m.y, m.depthMm, o.y, o.depthMm) > 0) {
        pairs.add(`${i}:${j}`);
      }
    }),
  );
  return (i, j) => pairs.has(`${i}:${j}`);
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

  // A pile it cannot untangle: it keeps whatever it managed and stops, rather than looping.
  const pile = pushApart([deck(0, 0)], [deck(0, 0), deck(10, 0), deck(-10, 0)], undefined, 3);
  assert(Number.isFinite(pile.x) && Number.isFinite(pile.y), "an impossible pile still returns an answer");

  console.log("collide self-check passed");
}
