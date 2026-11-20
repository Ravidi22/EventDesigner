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

/** The pieces put by hand (decks, holes) the outline holds, by their index among them — a piece by its
 *  centre. One the outline no longer holds (a side typed shorter past it, an area redrawn smaller) is
 *  SET ASIDE: not laid, drawn, counted or billed — a new stage kept it, a deck floating off its edge
 *  and a hole off its billed area (QA 2026-11-20, ST-5) — and back the moment the outline holds it
 *  again. */
export function heldPieces(pieces: readonly { centre: Point }[], outline: readonly Point[]): number[] {
  const held = (p: Point) => {
    let inside = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const a = outline[i];
      const b = outline[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  return pieces.flatMap((pc, k) => (held(pc.centre) ? [k] : []));
}

/** A deck of the fill as picked: a PIECE by its index among the pieces put by hand, or a LAID deck by
 *  its index in the layout on screen. */
type DeckPick = { kind: "piece" | "deck"; index: number };

/** The fill tool's next state, its deck pick kept only while it still names the deck it named. A laid
 *  deck is picked by its place in the layout on screen, and a layout laid again from another outline,
 *  front or set of decks numbers its decks afresh — the same index then names another deck, and a key
 *  pressed after a typed length turned or pinned THAT one (QA 2026-11-20, ST-8). So a change to any of
 *  `laidFrom` (compared by reference: an update keeps what it does not change) lets a deck pick go; a
 *  piece is picked by its own index, and is kept. */
export function keepDeckPick<S extends object>(cur: S | null, next: S | null, laidFrom: readonly string[]): S | null {
  const picked = (next as { picked?: DeckPick } | null)?.picked;
  if (!cur || !next || picked?.kind !== "deck") return next;
  const was = cur as Record<string, unknown>;
  const now = next as Record<string, unknown>;
  if (laidFrom.every((k) => was[k] === now[k])) return next;
  const { picked: _gone, ...rest } = next as S & { picked?: DeckPick };
  return rest as S;
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

  // QA 2026-11-20 ST-5: a deck pinned (or a hole made) at the left end, the front then typed shorter
  // so that end goes — the outline no longer holds it, and it is set aside, not built.
  const area = [{ x: 0, y: 0 }, { x: 4880, y: 0 }, { x: 4880, y: 2440 }, { x: 0, y: 2440 }];
  const pinned = [{ centre: { x: 610, y: 1220 } }, { centre: { x: 3660, y: 610 } }, { centre: { x: 6000, y: 610 } }];
  assert(heldPieces(pinned, area).join() === "0,1", "the pieces the outline holds, by their place among them");
  assert(heldPieces(pinned, [{ x: 2440, y: 0 }, { x: 4880, y: 0 }, { x: 4880, y: 2440 }, { x: 2440, y: 2440 }]).join() === "1", "…its left end cut away, the left piece is set aside");

  // QA 2026-11-20 ST-8: a LAID deck is picked by its index in the layout, so a change to what the
  // layout is laid from lets the pick go; a piece is picked by its own index and is kept.
  const laidFrom = ["polygon", "front"];
  const poly = [{ x: 0, y: 0 }];
  const st = { polygon: poly, front: 0, picked: { kind: "deck" as const, index: 3 } };
  assert(keepDeckPick(st, { ...st }, laidFrom)?.picked?.index === 3, "a change that lays nothing afresh keeps the deck picked");
  assert(keepDeckPick(st, { ...st, polygon: [{ x: 1, y: 0 }] }, laidFrom)?.picked === undefined, "a reshaped outline lets a laid deck's pick go");
  assert(keepDeckPick(st, { ...st, front: 1 }, laidFrom)?.picked === undefined, "…and so does another front");
  const pc = { ...st, picked: { kind: "piece" as const, index: 0 } };
  assert(keepDeckPick(pc, { ...pc, polygon: [{ x: 1, y: 0 }] }, laidFrom)?.picked?.index === 0, "a piece stays picked through a reshape");
  console.log("deck-move self-check passed");
}
