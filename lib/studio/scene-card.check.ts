// npm run check:scene-card — the self-check of ./scene-card.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { ASPECT, CARD_MARGIN_PX, cardHeight, DEFAULT_CARD_POS, grownWidth, movedCard, placeCard, type CardRoom } from "./scene-card";

const assert = (ok: unknown, msg: string) => {
  if (!ok) throw new Error("check:scene-card — " + msg);
  console.log("ok —", msg);
};
// The canvas card at 1440×900: the canvas (~580) and the end panel (296) beside it.
const room: CardRoom = { w: 876, h: 800 };

const home = placeCard(300, DEFAULT_CARD_POS, room);
assert(home.end === CARD_MARGIN_PX && home.bottom === CARD_MARGIN_PX && home.width === 300, "by default it stands in the bottom-end corner (bottom-left), at its stored width");

// Dragged: right on a Hebrew screen is toward the start (the rail); up is up.
const moved = movedCard(home, 200, -100, true, room);
assert(moved.end === home.end + 200 && moved.bottom === home.bottom + 100, "the header drags it: right/up on a Hebrew screen moves it toward the start and up");
const ltr = movedCard(home, -200, 0, false, room);
assert(ltr.end === home.end + 200, "…mirrored on a left-to-right screen");

// Never onto the catalog rail, never past the top, never off the end or the foot.
const far = movedCard(home, 5000, -5000, true, room);
assert(far.end + far.width + CARD_MARGIN_PX === room.w, "dragged at the rail it stops short of it — the card never covers the catalog");
assert(far.bottom + cardHeight(far.width) + CARD_MARGIN_PX === room.h, "…and stops under the top");
const back = movedCard(far, -9000, 9000, true, room);
assert(back.end === CARD_MARGIN_PX && back.bottom === CARD_MARGIN_PX, "dragged the other way it stops at the end edge and the foot");

// A stored spot from a wider screen comes back inside this one.
const stale = placeCard(300, { end: 1500, bottom: 1200 }, room);
assert(stale.end + stale.width + CARD_MARGIN_PX <= room.w && stale.bottom + cardHeight(stale.width) + CARD_MARGIN_PX <= room.h, "a stored spot past the area is drawn inside it");

// The grip: up or toward the start grows it; the anchor holds; the room bounds it.
const wider = grownWidth(home, 80, 0, true, room);
assert(wider === 380, "pulling the top-start grip toward the start widens it by as much");
assert(grownWidth(home, 0, -50, true, room) === 300 + Math.round(50 / ASPECT), "pulling it up grows it in the card's proportions");
assert(grownWidth(home, -80, 0, true, room) === 260, "pulling it toward the end shrinks it, never under the minimum");
const nearRail = placeCard(300, { end: 500, bottom: CARD_MARGIN_PX }, room);
assert(grownWidth(nearRail, 900, 0, true, room) === room.w - nearRail.end - CARD_MARGIN_PX, "grown near the rail it stops at the rail — the anchor corner does not move");
const low: CardRoom = { w: 876, h: 400 };
const tall = grownWidth(placeCard(300, DEFAULT_CARD_POS, low), 0, -2000, true, low);
assert(cardHeight(tall) + 2 * CARD_MARGIN_PX <= low.h, "grown up it stops under the top");

// A stored width wider than the area is drawn inside it.
const narrow = placeCard(760, DEFAULT_CARD_POS, { w: 500, h: 800 });
assert(narrow.width === 500 - 2 * CARD_MARGIN_PX, "a stored 760 on a 500px area is drawn 484");
console.log("check:scene-card — all passed");
