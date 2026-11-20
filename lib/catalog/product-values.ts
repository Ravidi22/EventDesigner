// The VALUES a catalog row may be stored with — pure, with no import of the category registry, so the
// drawer, the CSV import (lib/catalog/csv.ts, kept free of it on purpose) and the server actions ask
// one set of questions (QA 2026-11-20, PR-2/6/9/10/11):
//
//   productProblem — the numbers a row cannot be stored with: a size that is no size, a stock count
//                    or a פחת that is not whole (the columns are integers — a 2.5 used to fail the save
//                    with nothing said), a price that is no price.
//   shadeProblem   — a shade given a colour or a price but no name, which the save used to drop.
//   spareRateFor   — the פחת a row stores for a typed one: 0 is an answer ("no פחת") that differs from
//                    the category's 10%, never the same thing as leaving it blank.
//   sameDraft      — whether the drawer holds changes a close would throw away.
//
// Held by lib/catalog/product-rules.ts's self-check: npm run check:product-rules
import type { Product, Variant } from "./types";

/** The biggest size a row may carry, mm — a kilometre. Past it the number is a typo or a unit slip,
 *  and it stays far inside what the integer columns hold. */
export const MAX_SIZE_MM = 1_000_000;
/** The biggest price or cost, ₪ (the numeric(12, 2) columns stop under ten billion). */
export const MAX_PRICE = 1_000_000_000;
/** The biggest order factor (numeric(10, 3): under ten million). */
export const MAX_ORDER_FACTOR = 1_000_000;
/** The biggest stock count. */
export const MAX_STOCK = 1_000_000_000;

const SIZE_WORD: Record<"heightMm" | "widthMm" | "depthMm" | "diameterMm", string> = {
  heightMm: "הגובה",
  widthMm: "הרוחב",
  depthMm: "העומק",
  diameterMm: "הקוטר",
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Absent (undefined or null) — a field nobody filled, which every check below lets through. */
const absent = (v: unknown) => v === undefined || v === null;
const inRange = (v: unknown, max: number) => finite(v) && v >= 0 && v <= max;

/** What is wrong with a row's NUMBERS, in words the designer can act on — or null. One answer, the
 *  first: the drawer shows it and stays open, an import refuses the line with it, the server refuses
 *  the write with it. (The SHAPE of the row — an id, a name, a category — is lib/catalog/actions.ts
 *  assertProduct's, which throws: a request without one never came from a form.) */
export function productProblem(p: Product): string | null {
  for (const key of ["heightMm", "widthMm", "depthMm", "diameterMm"] as const) {
    const v = p.dimensions?.[key];
    if (key !== "heightMm" && absent(v)) continue;
    if (!inRange(v, MAX_SIZE_MM)) return `${SIZE_WORD[key]} לא תקין — מספר בין 0 ל־${(MAX_SIZE_MM / 10).toLocaleString("he-IL")} ס״מ.`;
  }
  if (!absent(p.clearanceMm) && !inRange(p.clearanceMm, MAX_SIZE_MM)) return "מרחק הביטחון לא תקין — מספר, 0 או יותר.";
  if (!absent(p.stockQty) && !(Number.isInteger(p.stockQty) && inRange(p.stockQty, MAX_STOCK))) return "הכמות במלאי היא מספר שלם — 0 או יותר.";
  if (!absent(p.spareRate) && !(Number.isInteger(p.spareRate) && inRange(p.spareRate, 100))) return "הפחת הוא אחוז שלם בין 0 ל־100.";
  if (!absent(p.unitPrice) && !inRange(p.unitPrice, MAX_PRICE)) return "המחיר לא תקין — מספר, 0 או יותר.";
  if (!absent(p.costPrice) && !inRange(p.costPrice, MAX_PRICE)) return "העלות לא תקינה — מספר, 0 או יותר.";
  if (!absent(p.orderFactor) && !inRange(p.orderFactor, MAX_ORDER_FACTOR)) return "מקדם ההזמנה לא תקין — מספר, 0 או יותר.";
  for (const v of p.variants ?? []) {
    if (!absent(v.unitPrice) && !inRange(v.unitPrice, MAX_PRICE)) return `המחיר של הגוון ״${v.name}״ לא תקין — מספר, 0 או יותר.`;
  }
  return null;
}

/** A shade with a colour or a price but no NAME — the save keeps only named shades (a name is what
 *  the plan, the packing list and the client's picker call it), so such a shade used to vanish with
 *  no word. A wholly empty row (just added, nothing typed) is not one: it is dropped as it always was. */
export function shadeProblem(variants: readonly Variant[]): string | null {
  const nameless = variants.filter((v) => !v.archived && !v.name.trim() && (!!v.swatch || !absent(v.unitPrice)));
  if (nameless.length === 0) return null;
  return nameless.length === 1
    ? "לגוון אחד יש צבע או מחיר אבל אין לו שם — תנו לו שם, או הסירו אותו."
    : `ל־${nameless.length} גוונים יש צבע או מחיר אבל אין להם שם — תנו להם שם, או הסירו אותם.`;
}

/** The פחת a row stores when the drawer's field reads `typed`: whole percent, 0–100, and nothing at
 *  all when it is the category's own (so the row follows the category). 0 on a category whose default
 *  is 10% is stored as 0 — it used to be stored as nothing, which IS the 10%. */
export function spareRateFor(typed: number, categoryDefault: number | undefined): number | undefined {
  const rate = Math.min(100, Math.max(0, Math.round(finite(typed) ? typed : 0)));
  return rate === (categoryDefault ?? 0) ? undefined : rate;
}

/** The value as JSON with every object's keys in one order and every undefined left out — so a draft
 *  whose fields were set and cleared again, or written in another order, reads as the row it was. */
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_key, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, (x as Record<string, unknown>)[k]]),
        )
      : x,
  );

/** Is draft `a` the same row as `b`? */
export function sameDraft(a: Product, b: Product): boolean {
  return a === b || canonical(a) === canonical(b);
}
