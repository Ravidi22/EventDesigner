// A sofa's seats (U6, 2026-11-20: "a sofa should count as seating, with an option not to").
//
// HOW MANY SIT ON A SOFA. Its row may say (`categoryFields.seats`, the drawer's "מקומות ישיבה");
// when it does not, as many as the cushions the plan draws on it — one per SOFA_SEAT_PITCH_MM of the
// seat between its arms (components/item-symbol.tsx classicSofa, and the room's sofa body in
// lib/scene/floor-kinds.ts, both draw them by `sofaCushionCount` from here, so the number a sofa is
// counted by is the number of cushions anyone can see on it).
//
// WHO COUNTS THEM. Every count of the people a drawing seats (lib/design-document/seat-count.ts: the
// studio's "ישיבה" readout, the sheets' seating summary, the quote's cover, the client's and the
// venue's sketch pages) adds every sofa standing on the plan to the tables' and the banquettes' places
// — unless the placement says it is not seating (Placement.notSeating, the bar's "לא נספר כישיבה": a
// lounge corner the guests are not seated at). Opting out changes the COUNT only. A sofa packs no
// chairs and is quoted as the one row it is, as before.
//
// Pure, no DOM, self-checked: `npm run check:sofa`.
import type { Placement } from "@/lib/design-document/types";
import type { Product } from "./types";

/** The category a sofa is (lib/catalog/categories.ts). */
export const SOFA_CATEGORY = "sofas";
/** The row's seat count, in its categoryFields. */
export const SOFA_SEATS_FIELD = "seats";
/** One seat cushion about every this many mm of the seat between the arms. */
export const SOFA_SEAT_PITCH_MM = 650;

/** A sofa's arm — what the plan and the room both draw at each end of a classic sofa. */
export function sofaArmMm(widthMm: number, depthMm: number): number {
  return Math.min(widthMm * 0.13, 230, depthMm * 0.3);
}

/** The seat cushions a sofa `widthMm` long and `depthMm` deep is drawn with: round((w − 2·arm)/650),
 *  never fewer than one. */
export function sofaCushionCount(widthMm: number, depthMm: number): number {
  return Math.max(1, Math.round((widthMm - 2 * sofaArmMm(widthMm, depthMm)) / SOFA_SEAT_PITCH_MM));
}

/** How many sit on a sofa row drawn at `box`: what the row says, else its cushions. */
export function sofaSeatsOf(row: Pick<Product, "categoryFields">, box: { widthMm: number; depthMm: number }): number {
  const typed = Number(row.categoryFields?.[SOFA_SEATS_FIELD]);
  return Number.isFinite(typed) && typed > 0 ? Math.round(typed) : sofaCushionCount(box.widthMm, box.depthMm);
}

/** Says whether a placement is a sofa standing on the plan, and how many sit on it — null for anything
 *  else. The catalog decides (lib/studio/catalog-resolver.ts `sofaOf`), so the pure code here needs
 *  none of its own. */
export type SofaLookup = (p: Placement) => number | null;

/** Everyone the plan's sofas seat, as the seating readout counts them: a placement's quantity
 *  multiplies, and one that is not seating (Placement.notSeating) counts nobody. */
export function sofaSeats(placements: readonly Placement[], sofas: SofaLookup | undefined): number {
  if (!sofas) return 0;
  let n = 0;
  for (const p of placements) {
    if (p.notSeating) continue;
    n += (sofas(p) ?? 0) * Math.max(1, p.quantity);
  }
  return n;
}
