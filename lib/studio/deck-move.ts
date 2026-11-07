// A DECK MOVED BY HAND in the fill tool — the geometry of putting one where the designer wants it.
//
// The fill lays a stage's decks itself (lib/studio/stage-fill.ts), and for most stages that is the
// whole story. But a crew has its own ideas — the 122 strip goes on the left, not the right; the
// one odd deck stands where the cable comes up — and a designer drawing the plan their crew will
// build wants to drag a deck to its place, or swap one size for another, without taking the stage
// apart into loose decks (2026-10-31, the user: "edit and move a stage inside the stage fill-out —
// change a specific deck to another one, drag to position inside the area"). A deck dragged or
// swapped becomes a PIECE of the stage (StageBuild.pieces — the same field a half-round or a disc
// stands in): it stands where it was put, and the fill lays the rest round it. Nothing new is
// stored for it; nothing else reads anything new.
//
// Here: where a dragged deck lands. In the STAGE'S frame, a deck is an axis-aligned box (the fill
// lays them square to the rows; one turned to an angled side is not snapped), pulled flush against
// the other decks' edges and the outline's box, in line with another deck's centre or edge, and
// kept inside the outline's box.
//
// Pure, no DOM; self-checked: `npm run check:deck-move`.
import type { Point } from "@/lib/studio/hall";
import { isMain } from "../self-check";

/** An axis-aligned box in the stage's frame. */
export interface DeckBox {
  centre: Point;
  widthMm: number;
  depthMm: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** A deck's box in the stage's frame, from its facing relative to the stage: square to the rows
 *  (0/90/180/270) it is its width by its depth, or the other way; at any other angle null — an
 *  angled deck is moved freely. */
export function deckBox(centre: Point, widthMm: number, depthMm: number, relDeg: number): DeckBox | null {
  const r = ((Math.round(relDeg) % 360) + 360) % 360;
  if (r % 90 !== 0) return null;
  return r % 180 === 0 ? { centre, widthMm, depthMm } : { centre, widthMm: depthMm, depthMm: widthMm };
}

export function boundsOf(outline: readonly Point[]): Bounds {
  const xs = outline.map((q) => q.x);
  const ys = outline.map((q) => q.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** A dragged deck's centre, settled: pulled within `tolMm` flush against another deck (side to
 *  side, end to end), in line with its centre or its edges, or against the outline's box — a deck
 *  is laid against its neighbour, never a hair off it — then held inside the outline's box. */
export function snapDeck(box: DeckBox, others: readonly DeckBox[], bounds: Bounds, tolMm: number): Point {
  const hw = box.widthMm / 2;
  const hd = box.depthMm / 2;
  const xs: number[] = [bounds.minX + hw, bounds.maxX - hw, (bounds.minX + bounds.maxX) / 2];
  const ys: number[] = [bounds.minY + hd, bounds.maxY - hd, (bounds.minY + bounds.maxY) / 2];
  for (const o of others) {
    const ohw = o.widthMm / 2;
    const ohd = o.depthMm / 2;
    // Flush beside it, centred on it, its near edges in line with mine.
    xs.push(o.centre.x - ohw - hw, o.centre.x + ohw + hw, o.centre.x, o.centre.x - ohw + hw, o.centre.x + ohw - hw);
    ys.push(o.centre.y - ohd - hd, o.centre.y + ohd + hd, o.centre.y, o.centre.y - ohd + hd, o.centre.y + ohd - hd);
  }
  const pick = (v: number, cands: readonly number[]) => {
    let best = v;
    let err = tolMm;
    for (const c of cands) {
      const e = Math.abs(c - v);
      if (e < err) {
        err = e;
        best = c;
      }
    }
    return best;
  };
  const x = pick(box.centre.x, xs);
  const y = pick(box.centre.y, ys);
  // A deck too big for the box is held at its start, not torn between its two sides.
  const cx = Math.max(bounds.minX + hw, Math.min(bounds.maxX - hw, x));
  const cy = Math.max(bounds.minY + hd, Math.min(bounds.maxY - hd, y));
  return { x: Math.round(cx), y: Math.round(cy) };
}

// ponytail: self-check. Run: npm run check:deck-move
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const bounds: Bounds = { minX: -3000, maxX: 3000, minY: -2000, maxY: 2000 };
  const sheet = (x: number, y: number): DeckBox => ({ centre: { x, y }, widthMm: 2440, depthMm: 1220 });
  const laid = [sheet(-1220, -1390)];
  assert(deckBox({ x: 0, y: 0 }, 2440, 1220, 90)!.widthMm === 1220 && deckBox({ x: 0, y: 0 }, 2440, 1220, 0)!.widthMm === 2440, "a deck turned a quarter is its depth across");
  assert(deckBox({ x: 0, y: 0 }, 2440, 1220, 37) === null, "an angled deck is not a box to snap");
  const beside = snapDeck(sheet(1260, -1370), laid, bounds, 80);
  assert(beside.x === 1220 && beside.y === -1390, `dragged near the laid sheet's end it lands flush beside it, in line (${beside.x}, ${beside.y})`);
  const below = snapDeck(sheet(-1200, -140), laid, bounds, 80);
  assert(below.x === -1220 && below.y === -170, `…or flush under it (${below.x}, ${below.y})`);
  const free = snapDeck(sheet(500, 500), laid, bounds, 80);
  assert(free.x === 500 && free.y === 500, "away from everything it stays where it is put");
  const edge = snapDeck(sheet(1830, 1420), laid, bounds, 80);
  assert(edge.x === 1780 && edge.y === 1390, `near the outline's corner it lands in the corner (${edge.x}, ${edge.y})`);
  const out = snapDeck(sheet(2900, 0), laid, bounds, 80);
  assert(out.x === 1780, "dragged past the line it stops at it");
  console.log("deck-move self-check passed");
}
