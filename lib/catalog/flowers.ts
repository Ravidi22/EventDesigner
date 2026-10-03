// The flower spec of an arrangement — what it is MADE of, as rows, not as a note.
//
// A סידור פרחים used to carry one number (categoryFields.stems) and whatever the designer typed in
// the free spec: "12 ורדים, 5 פיאוניות, אקליפטוס". The number fed the packing list and the florist
// order; the text fed nobody. These helpers are the seam between the structured list a drawer edits
// (Product.flowers) and the two things downstream actually need from it: the stem total, which
// stays the count-multiplier every other surface already reads, and the per-flower breakdown the
// florist is phoned with.
//
// THE TOTAL IS DERIVED. When an arrangement has lines, `categoryFields.stems` is their sum and the
// drawer will not let it be typed — the one place a typed total still lives is an arrangement with
// no lines at all, which is the designer saying "180 stems, don't ask me which". Pure, no React, no
// catalog registry: `npm run check:flowers`.
import type { FlowerLine, Product } from "./types";
import { isMain } from "../self-check";

/** A starting vocabulary for the name field, the way STYLE_TAGS is for tags: the flowers an Israeli
 *  event florist is asked for most, singular, as a spec would list them. The drawer offers them as
 *  suggestions and takes anything typed — see flowerNamesOf. */
export const FLOWER_NAMES = [
  "ורד",
  "ורד ספריי",
  "פיאוני",
  "ליזיאנטוס",
  "הידראנגאה",
  "אורכידאה",
  "סחלב",
  "קאלה",
  "צבעוני",
  "נורית",
  "אנמונה",
  "ציפורן",
  "גרברה",
  "חרצית",
  "חמנייה",
  "ליליום",
  "דלפיניום",
  "אלסטרומריה",
  "פרזיה",
  "לימוניום",
  "גיבסנית",
  "סולידגו",
  "אסטר",
  "לבנדר",
  "אקליפטוס",
  "רוסקוס",
  "פיטוספורום",
  "מונסטרה",
  "שרך",
];

/** The names to suggest: the built-ins first, then every name this catalog already uses — so an
 *  arrangement's "ורד" and the next one's are spelt the same way, and a flower the list never heard
 *  of appears once it has been typed once. */
export const flowerNamesOf = (products: readonly { flowers?: FlowerLine[] }[]): string[] => [
  ...new Set([...FLOWER_NAMES, ...products.flatMap((p) => (p.flowers ?? []).map((f) => f.name))]),
];

/** What is kept on save: trimmed names, whole positive quantities, and no row without both. An
 *  empty list is `undefined` — absent IS "no spec", the same way an absent variant list is "no
 *  shades", and keeping one spelling is what makes save → reload lossless. */
export function cleanFlowers(lines: readonly FlowerLine[] | undefined): FlowerLine[] | undefined {
  const kept = (lines ?? [])
    .map((l) => ({ ...l, name: l.name.trim(), qty: Math.max(0, Math.round(l.qty)) }))
    .filter((l) => l.name !== "" && l.qty > 0);
  return kept.length ? kept : undefined;
}

/** Stems in one arrangement, from its lines. 0 for no lines — callers that want the typed fallback
 *  use stemsOf. */
export const stemCount = (lines: readonly FlowerLine[] | undefined): number =>
  (lines ?? []).reduce((n, l) => n + (l.qty > 0 ? l.qty : 0), 0);

/** The stem count every surface multiplies by: the lines' sum when there are lines, else whatever
 *  was typed into the category field. One answer, so the drawer, the packing list and procurement
 *  cannot disagree about how many stems an arrangement is. */
export function stemsOf(p: Pick<Product, "flowers" | "categoryFields">): number {
  if (p.flowers?.length) return stemCount(p.flowers);
  const typed = Number(p.categoryFields?.stems ?? 0);
  return Number.isFinite(typed) && typed > 0 ? typed : 0;
}

/** "ורד ×12 · פיאוני ×5 · אקליפטוס ×8" — one line for a card or a sheet. Name × count rather than
 *  a Hebrew plural, which no list of flower names can supply for every entry. */
export const flowerSummary = (lines: readonly FlowerLine[] | undefined): string =>
  (lines ?? [])
    .filter((l) => l.name.trim() !== "" && l.qty > 0)
    .map((l) => `${l.name.trim()} ×${l.qty}`)
    .join(" · ");

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const lines: FlowerLine[] = [
    { id: "a", name: " ורד ", qty: 12 },
    { id: "b", name: "פיאוני", qty: 5.4 },
    { id: "c", name: "", qty: 9 },
    { id: "d", name: "אקליפטוס", qty: 0 },
  ];
  const clean = cleanFlowers(lines)!;
  assert(clean.length === 2, "a nameless row and a zero row are dropped");
  assert(clean[0].name === "ורד" && clean[1].qty === 5, "names trimmed, quantities whole");
  assert(cleanFlowers([]) === undefined && cleanFlowers(undefined) === undefined, "no rows is absent, not []");
  assert(cleanFlowers([{ id: "x", name: "ורד", qty: -3 }]) === undefined, "a negative quantity is no row");

  assert(stemCount(clean) === 17, "12 + 5 = 17 stems");
  assert(stemsOf({ flowers: clean, categoryFields: { stems: 180 } }) === 17, "lines win over the typed total");
  assert(stemsOf({ flowers: undefined, categoryFields: { stems: 180 } }) === 180, "no lines: the typed total");
  assert(stemsOf({ flowers: [], categoryFields: {} }) === 0, "nothing at all is 0");
  assert(stemsOf({ categoryFields: { stems: "abc" } }) === 0, "garbage in the field is 0, not NaN");

  assert(flowerSummary(clean) === "ורד ×12 · פיאוני ×5", "the summary reads name × count");
  assert(flowerSummary(undefined) === "", "no lines, no summary");

  const names = flowerNamesOf([{ flowers: clean }, { flowers: [{ id: "z", name: "פרוטאה", qty: 2 }] }]);
  assert(names[0] === FLOWER_NAMES[0], "the built-ins come first");
  assert(names.includes("פרוטאה"), "a name the catalog uses is offered");
  assert(names.filter((n) => n === "ורד").length === 1, "no duplicates");
  console.log("catalog/flowers self-check passed");
}
