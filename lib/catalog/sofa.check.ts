// npm run check:sofa — the self-check of ./sofa.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Placement } from "@/lib/design-document/types";
import type { Product } from "./types";
import { SOFA_SEATS_FIELD, sofaArmMm, sofaCushionCount, sofaSeats, sofaSeatsOf, type SofaLookup } from "./sofa";

// ponytail: self-check. Run: npm run check:sofa
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
