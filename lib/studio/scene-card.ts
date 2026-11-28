// Where the studio's 3D card stands and how big it is drawn (app/(app)/studio/scene-preview.tsx).
//
// The user, 2026-11-10: "the 3D dialog should be draggable and position it on the bottom left (can be
// over the in-plan list but not on the catalog list), also put the drag to resize in the other side".
// So the card stands in the canvas card's AREA — the canvas column and the end panel beside it, never
// the catalog rail — anchored by its END-bottom corner (bottom-left on a Hebrew screen, the end panel's
// corner): `end` and `bottom` are its distances from the area's end edge and foot. Its header drags it;
// the grip on its top-START corner (the far corner from the anchor) grows it up and toward the start.
//
// Pure: pixels in, pixels out, so the arithmetic is checked here without a browser.
import { SCENE_PREVIEW_MAX_PX, SCENE_PREVIEW_MIN_PX, type SceneCardPos } from "./storage";

/** The picture's proportions inside the card — a landscape still, like the viewpoints the tab frames. */
export const ASPECT = 10 / 16;
/** The card's header (py-1.5 + the 32px ✕ + its hairline). */
export const HEADER_PX = 46;
/** What the card keeps clear of the area's edges. */
export const CARD_MARGIN_PX = 8;
/** Bottom-left over the end panel, a margin off both edges (the user's spot). */
export const DEFAULT_CARD_POS: SceneCardPos = { end: CARD_MARGIN_PX, bottom: CARD_MARGIN_PX };

/** The area the card may stand in: `w` from the area's end edge to the catalog rail, `h` its height. */
export interface CardRoom {
  w: number;
  h: number;
}

export interface CardPlace extends SceneCardPos {
  width: number;
}

export const cardHeight = (width: number) => HEADER_PX + Math.round(width * ASPECT);

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The widest the card may be drawn with its anchor corner at `pos`: the room toward the rail and up
 *  to the top, less the margins. */
function roomFrom(pos: SceneCardPos, room: CardRoom): number {
  const across = room.w - pos.end - CARD_MARGIN_PX;
  const up = (room.h - pos.bottom - CARD_MARGIN_PX - HEADER_PX) / ASPECT;
  return Math.min(across, up);
}

/** The card as drawn: the stored width held to the area (never under the minimum — an area that small
 *  lets the card overhang rather than shrink it to nothing), then the stored corner held so the whole
 *  card stays inside the area — off the rail, under the top. */
export function placeCard(widthPx: number, pos: SceneCardPos, room: CardRoom | null): CardPlace {
  if (!room) return { width: widthPx, ...pos };
  const fits = Math.min(room.w - 2 * CARD_MARGIN_PX, (room.h - 2 * CARD_MARGIN_PX - HEADER_PX) / ASPECT);
  const width = Math.round(Math.max(SCENE_PREVIEW_MIN_PX, Math.min(widthPx, SCENE_PREVIEW_MAX_PX, fits)));
  return {
    width,
    end: Math.round(clamp(pos.end, CARD_MARGIN_PX, room.w - width - CARD_MARGIN_PX)),
    bottom: Math.round(clamp(pos.bottom, CARD_MARGIN_PX, room.h - cardHeight(width) - CARD_MARGIN_PX)),
  };
}

/** The corner after the header was dragged by (dx, dy) screen px from `from` — held inside the area.
 *  Toward the start (right on a Hebrew screen) adds to `end`; up adds to `bottom`. */
export function movedCard(from: CardPlace, dx: number, dy: number, rtl: boolean, room: CardRoom | null): CardPlace {
  return placeCard(from.width, { end: from.end + (rtl ? dx : -dx), bottom: from.bottom - dy }, room);
}

/** The width after the top-start grip was pulled by (dx, dy) from `from`: toward the start or up grows
 *  it, by whichever the hand moved more in the card's own proportions. The anchor corner stays where it
 *  is, so the card grows only into the room between it and the rail and the top. */
export function grownWidth(from: CardPlace, dx: number, dy: number, rtl: boolean, room: CardRoom | null): number {
  const across = rtl ? dx : -dx;
  const up = -dy / ASPECT;
  const grow = Math.abs(across) >= Math.abs(up) ? across : up;
  const want = Math.min(SCENE_PREVIEW_MAX_PX, Math.max(SCENE_PREVIEW_MIN_PX, Math.round(from.width + grow)));
  if (!room) return want;
  return Math.round(Math.max(SCENE_PREVIEW_MIN_PX, Math.min(want, roomFrom(from, room))));
}
