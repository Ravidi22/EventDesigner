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
