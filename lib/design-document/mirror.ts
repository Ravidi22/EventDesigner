// Mirroring a selection — what "היפוך" means for things that also have a position and a facing.
//
// A mirror is not a rotation, and there is no angle that fakes one: a corner sofa with its long arm
// on the left turned any way at all still has its long arm on the left. So a placed item carries ONE
// flag (Placement.mirrored / DesignTable.mirrored: drawn flipped across its own width, before its
// turn), and everything else here is the bookkeeping that makes a flip read the way the eye expects
// on screen — which is in the WORLD's frame, not the item's:
//
//   side to side (across a vertical line)   x → 2·cx − x,  facing r → −r,        flag toggles
//   top to bottom (across a horizontal one)  y → 2·cy − y,  facing r → 180° − r,  flag toggles
//
// Both follow from one identity: reflecting the world, F·R(r)·M, equals R(−r)·(F·M) — the item turns
// the other way and its own flag flips. A top-to-bottom reflection is a side-to-side one plus half a
// turn, which is why one flag is enough for both and the second axis never needs a field of its own.
//
// Several things mirror about the centre of the box they share, so a row of tables laid down the
// left of a hall is mirrored onto the right of it rather than each flipping on its own spot — the
// "copy this side to the other side" gesture. One thing mirrors about its own centre, so it stays
// exactly where it is and only its shape turns over.
//
// Pure, and self-checked: `npm run check:mirror`.
import type { Point } from "./types";
import { isMain } from "../self-check";

export type MirrorAxis = "horizontal" | "vertical";

export interface MirrorSubject<K extends string = string> {
  kind: K;
  id: string;
  position: Point;
  rotation: number;
  mirrored?: boolean;
}

export interface MirrorFlip<K extends string = string> {
  kind: K;
  id: string;
  position: Point;
  rotation: number;
  mirrored: boolean;
}

// Rounded to the hundredth, for the reason actions.ts gives: 180 − 0.1 − 0.2 is not 179.7.
const norm360 = (deg: number) => {
  const r = Math.round((((deg % 360) + 360) % 360) * 100) / 100;
  return r >= 360 ? r - 360 : r;
};

/** Every member of `subjects`, mirrored across a line through `pivot`. `horizontal` flips side to
 *  side (the line is vertical); `vertical` flips top to bottom. Positions are rounded to whole
 *  millimetres, like every other write on the plan. */
export function mirrorFlips<K extends string>(subjects: readonly MirrorSubject<K>[], axis: MirrorAxis, pivot: Point): MirrorFlip<K>[] {
  return subjects.map((s) => ({
    kind: s.kind,
    id: s.id,
    position:
      axis === "horizontal"
        ? { x: Math.round(2 * pivot.x - s.position.x), y: s.position.y }
        : { x: s.position.x, y: Math.round(2 * pivot.y - s.position.y) },
    rotation: norm360(axis === "horizontal" ? -s.rotation : 180 - s.rotation),
    mirrored: !s.mirrored,
  }));
}

/** The SVG transform a flipped item wears between its turn and its shape, and the one a label inside
 *  it wears to read upright again (`scale(-1 1)` undoes itself, and has to be undone BEFORE the
 *  counter-turn, because it was applied after the turn). */
export const MIRROR_TRANSFORM = "scale(-1 1)";
export function uprightTransform(rotation: number, mirrored?: boolean): string | undefined {
  const turn = rotation ? `rotate(${-rotation})` : "";
  const flip = mirrored ? MIRROR_TRANSFORM : "";
  const t = [flip, turn].filter(Boolean).join(" ");
  return t || undefined;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const one = mirrorFlips([{ kind: "p", id: "a", position: { x: 500, y: 200 }, rotation: 30 }], "horizontal", { x: 500, y: 200 });
  assert(one[0].position.x === 500 && one[0].position.y === 200, "one item mirrors in place");
  assert(one[0].rotation === 330 && one[0].mirrored, "…turning the other way, flipped");

  const again = mirrorFlips(one, "horizontal", { x: 500, y: 200 });
  assert(again[0].rotation === 30 && !again[0].mirrored, "mirroring twice is where it started");

  const row = mirrorFlips(
    [
      { kind: "t", id: "l", position: { x: 0, y: 0 }, rotation: 0 },
      { kind: "t", id: "r", position: { x: 4000, y: 0 }, rotation: 90 },
    ],
    "horizontal",
    { x: 2000, y: 0 },
  );
  assert(row[0].position.x === 4000 && row[1].position.x === 0, "a pair mirrors about the centre they share");
  assert(row[1].rotation === 270, "…each facing reflected");

  const down = mirrorFlips([{ kind: "p", id: "a", position: { x: 0, y: 100 }, rotation: 0 }], "vertical", { x: 0, y: 0 });
  assert(down[0].position.y === -100 && down[0].rotation === 180 && down[0].mirrored, "top-to-bottom is a flip plus half a turn");

  // The identity the whole module rests on: reflect a point of the item's own outline both ways and
  // land on the same world point.
  const local = { x: 300, y: 100 };
  const world = (pos: Point, r: number, m: boolean, p: Point) => {
    const lx = m ? -p.x : p.x;
    const t = (r * Math.PI) / 180;
    return { x: pos.x + lx * Math.cos(t) - p.y * Math.sin(t), y: pos.y + lx * Math.sin(t) + p.y * Math.cos(t) };
  };
  const before = world({ x: 1000, y: 500 }, 40, false, local);
  const [v] = mirrorFlips([{ kind: "p", id: "a", position: { x: 1000, y: 500 }, rotation: 40 }], "vertical", { x: 0, y: 0 });
  const after = world(v.position, v.rotation, v.mirrored, local);
  assert(Math.abs(after.x - before.x) < 1e-6 && Math.abs(after.y + before.y) < 1e-6, "a vertical mirror reflects every point of the shape");
  const [h] = mirrorFlips([{ kind: "p", id: "a", position: { x: 1000, y: 500 }, rotation: 40 }], "horizontal", { x: 0, y: 0 });
  const afterH = world(h.position, h.rotation, h.mirrored, local);
  assert(Math.abs(afterH.x + before.x) < 1e-6 && Math.abs(afterH.y - before.y) < 1e-6, "…and so does a horizontal one");

  assert(uprightTransform(0) === undefined, "an unturned, unflipped label needs no transform");
  assert(uprightTransform(30, true) === "scale(-1 1) rotate(-30)", "a flipped label unflips before it unturns");

  console.log("mirror self-check passed");
}
