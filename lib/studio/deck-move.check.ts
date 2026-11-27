// npm run check:deck-move — the self-check of ./deck-move.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { deckBox, heldPieces, keepDeckPick, snapDeck, type Bounds, type DeckBox } from "./deck-move";

// ponytail: self-check. Run: npm run check:deck-move
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
