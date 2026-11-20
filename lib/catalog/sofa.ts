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
import { isMain } from "../self-check";

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

// ponytail: self-check. Run: npm run check:sofa
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  // The plan's own count: a 2 m sofa has two cushions, a 2.4 m one three, a pouf one.
  assert(sofaArmMm(2000, 900) === 230 && sofaCushionCount(2000, 900) === 2, "a 2 m sofa: 23 cm arms, two cushions");
  assert(sofaCushionCount(2400, 900) === 3 && sofaCushionCount(900, 900) === 1, "…a 2.4 m one three, a 90 cm pouf one");
  assert(sofaCushionCount(300, 300) === 1, "…never fewer than one");
  // The row's own number wins; else the cushions at the size it is drawn.
  const row = (seats?: number): Pick<Product, "categoryFields"> => ({ categoryFields: seats === undefined ? {} : { [SOFA_SEATS_FIELD]: seats } });
  assert(sofaSeatsOf(row(), { widthMm: 2400, depthMm: 900 }) === 3, "a sofa row that says nothing seats its cushions");
  assert(sofaSeatsOf(row(4), { widthMm: 2400, depthMm: 900 }) === 4 && sofaSeatsOf(row(0), { widthMm: 2400, depthMm: 900 }) === 3, "…a typed count is what it seats, and 0 is no count");
  // The readout: three 3-seat sofas are nine places; one opted out is six; quantity multiplies.
  const sofa = (id: string, extra: Partial<Placement> = {}): Placement => ({ id, variantId: "sofa", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, ...extra });
  const lookup: SofaLookup = (p) => (p.variantId === "sofa" ? 3 : null);
  assert(sofaSeats([sofa("a"), sofa("b"), sofa("c")], lookup) === 9, "three 3-seat sofas are nine places");
  assert(sofaSeats([sofa("a"), sofa("b", { notSeating: true }), sofa("c")], lookup) === 6, "…one that is not seating counts nobody");
  assert(sofaSeats([sofa("a", { quantity: 2 }), { ...sofa("t"), variantId: "table" }], lookup) === 6, "…a quantity multiplies, and what is not a sofa counts nothing");
  assert(sofaSeats([sofa("a")], undefined) === 0, "with no catalog to ask, nothing is a sofa");
  console.log("sofa self-check passed");
}
