// What the DESIGNER decides about a quote, over what the drawing derives (lib/outputs/quote-sections.ts).
//
// The drawing says what is in each section and how much of it. The designer says how the client
// reads it: what the event is called, how prices show, the one number agreed, what is a gift, what
// is left out, each section's title, note and photographs, and the order. Pure and self-checked —
// the screen, the server action that stores it, and the issued record all go through here.
//
// THE PRICE IS TYPED. A studio quotes a round number ("85,000 ₪ בסגירת האירוע"), not the sum of a
// price list. The catalog sum is still worked out — it is the reference the designer types against
// — and the gap between the two is the discount, which the client sees or does not (`showDiscount`).
// Wherever the client is shown prices that should ADD UP (per section, itemized), the gap is always
// printed, because sections that do not sum to the total are a quote nobody can check.
import type { QuoteSection, SectionLine } from "@/lib/outputs/quote-sections";

export type PriceMode = "total" | "sections" | "itemized";

export const PRICE_MODES: { id: PriceMode; label: string }[] = [
  { id: "total", label: "סכום כולל" },
  { id: "sections", label: "לפי אזור" },
  { id: "itemized", label: "מפורט" },
];

/** A line the drawing cannot know about — הובלה, פיזור ואיסוף, a lighting rental — typed by the
 *  designer with its price. Listed under "תוספות" and added to the sum like any other line. */
export interface QuoteExtra {
  id: string;
  label: string;
  price: number;
}

export const MAX_EXTRAS = 30;

/** The closing line printed above the studio's signature when the designer has written none. */
export const DEFAULT_CLOSING = "בברכת מזל טוב ובהצלחה,";

export const MAX_SECTION_PHOTOS = 3;

/** The photo-map keys of the pages that are not sections. Never a section key (those are
 *  "zone:…", "kit:…", "ceiling"…). */
export const COVER_PHOTO = "page:cover";
export const CONCEPT_PHOTO = "page:concept";
export const CLOSING_PHOTO = "page:closing";

export interface QuoteLayout {
  priceMode: PriceMode;
  /** The price agreed, in the studio's price basis (VAT included when the studio quotes so).
   *  null = the catalog sum. */
  finalPrice: number | null;
  /** Show the gap between the catalog sum and the final price as a discount line. Forced on in the
   *  modes that print section or line prices. */
  showDiscount: boolean;
  /** Line keys (SectionLine.key) left out of the quote and its sum. */
  hidden: string[];
  /** Line keys shown as "מתנה" — listed, never charged. */
  gifts: string[];
  /** Section key → the designer's title / a note printed under it. */
  titles: Record<string, string>;
  notes: Record<string, string>;
  /** Section key → the photographs chosen for it: gallery image ids, or `product:<id>` for a
   *  catalog row's own photo. Absent = the default pick; [] = deliberately none. */
  photos: Record<string, string[]>;
  /** Section keys in the designer's order; sections not named keep their derived place. */
  order: string[];
  /** One sentence under the palette, in the client's words: "כל הפרחים בגווני שמנת-לבן…". */
  paletteNote: string;
  /** The idea, in a paragraph — the concept page's text (the Documents board, 2026-11-10). Empty =
   *  the page shows the palette alone, or is left out when there is no palette either. Its photo is
   *  `photos[CONCEPT_PHOTO]`, the cover's `photos[COVER_PHOTO]`, the last page's
   *  `photos[CLOSING_PHOTO]`. */
  concept: string;
  /** Lines the drawing cannot know (QuoteExtra). */
  extras: QuoteExtra[];
  /** Print the floor-plan sketch page. */
  sketch: boolean;
  /** The greeting above the studio's signature; "" = DEFAULT_CLOSING. */
  closing: string;
}

export const DEFAULT_LAYOUT: QuoteLayout = {
  priceMode: "total",
  finalPrice: null,
  showDiscount: false,
  hidden: [],
  gifts: [],
  titles: {},
  notes: {},
  photos: {},
  order: [],
  paletteNote: "",
  concept: "",
  extras: [],
  sketch: true,
  closing: "",
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const strList = (v: unknown, maxItems: number, max = 300) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, max)))].slice(0, maxItems) : [];
function strMap<T>(v: unknown, maxKeys: number, each: (x: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, maxKeys)) {
    const val = each(x);
    if (val !== undefined) out[k.slice(0, 300)] = val;
  }
  return out;
}

/** Whatever arrives — from the client, or a stored jsonb written by an older build — made into a
 *  layout. Never throws: an unreadable field falls back to its default. */
export function normalizeLayout(value: unknown): QuoteLayout {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const mode = PRICE_MODES.some((m) => m.id === v.priceMode) ? (v.priceMode as PriceMode) : DEFAULT_LAYOUT.priceMode;
  const price = typeof v.finalPrice === "number" && Number.isFinite(v.finalPrice) && v.finalPrice >= 0 && v.finalPrice < 1e9 ? Math.round(v.finalPrice * 100) / 100 : null;
  const extras = Array.isArray(v.extras)
    ? v.extras
        .slice(0, MAX_EXTRAS)
        .map((x): QuoteExtra | null => {
          const e = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
          const id = str(e.id, 60);
          const price = typeof e.price === "number" && Number.isFinite(e.price) && e.price >= 0 && e.price < 1e9 ? Math.round(e.price * 100) / 100 : 0;
          return id ? { id, label: str(e.label, 120), price } : null;
        })
        .filter((e): e is QuoteExtra => !!e)
    : [];
  return {
    priceMode: mode,
    finalPrice: price,
    showDiscount: v.showDiscount === true,
    hidden: strList(v.hidden, 2000),
    gifts: strList(v.gifts, 2000),
    titles: strMap(v.titles, 200, (x) => (typeof x === "string" && x.trim() ? x.slice(0, 120) : undefined)),
    notes: strMap(v.notes, 200, (x) => (typeof x === "string" && x.trim() ? x.slice(0, 1000) : undefined)),
    photos: strMap(v.photos, 200, (x) => (Array.isArray(x) ? strList(x, MAX_SECTION_PHOTOS) : undefined)),
    order: strList(v.order, 200),
    paletteNote: str(v.paletteNote, 400),
    concept: str(v.concept, 1200),
    extras,
    sketch: v.sketch !== false,
    closing: str(v.closing, 200),
  };
}

/** The designer's typed lines as a section of their own, so hide, gift, title, note and order all
 *  work on them exactly as on a derived one. Untitled or empty lines are not shown. */
export function extrasSection(layout: QuoteLayout): QuoteSection | null {
  const lines: SectionLine[] = layout.extras
    .filter((e) => e.label.trim())
    .map((e) => ({
      key: `extras|${e.id}`,
      variantId: `extra:${e.id}`,
      productId: "",
      label: e.label.trim(),
      quantity: 1,
      priceUnit: "unit",
      unitPrice: e.price,
      lineTotal: e.price,
      priced: true,
      categoryOrder: 0,
    }));
  return lines.length ? { key: "extras", kind: "extras", title: "תוספות", lines } : null;
}

export interface ResolvedLine extends SectionLine {
  gift: boolean;
}

export interface ResolvedSection extends Omit<QuoteSection, "lines"> {
  lines: ResolvedLine[];
  /** The derived title, for "back to the default". */
  defaultTitle: string;
  note: string;
  /** Sum of the charged lines (gifts and unpriced lines add nothing). */
  subtotal: number;
}

export interface QuoteFigures {
  /** Sum of every charged line, at catalog prices. */
  catalogSum: number;
  /** catalogSum − the agreed price. Negative when the designer typed MORE than the list. */
  discount: number;
  /** What the client pays. */
  total: number;
  /** The VAT inside (or on top of) it. */
  vat: number;
  /** total − vat. */
  net: number;
  vatIncluded: boolean;
  vatRate: number;
  /** Lines with no price — counted, never silently zero. */
  unpriced: number;
  /** Lines hidden by the designer, for "N שורות מוסתרות". */
  hidden: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Sections as the client reads them: the designer's order, titles and notes, hidden lines gone,
 *  gifts flagged, empty sections dropped. */
export function resolveSections(sections: QuoteSection[], layout: QuoteLayout): ResolvedSection[] {
  const hidden = new Set(layout.hidden);
  const gifts = new Set(layout.gifts);
  const resolved = sections
    .map((s): ResolvedSection => {
      const lines = s.lines.filter((l) => !hidden.has(l.key)).map((l) => ({ ...l, gift: gifts.has(l.key) }));
      return {
        ...s,
        lines,
        defaultTitle: s.title,
        title: layout.titles[s.key] || s.title,
        note: layout.notes[s.key] ?? "",
        subtotal: round2(lines.reduce((n, l) => n + (l.gift || !l.priced ? 0 : l.lineTotal), 0)),
      };
    })
    .filter((s) => s.lines.length > 0);
  return applyOrder(resolved, layout.order);
}

/** Sections the designer ordered take the slots ordered sections hold, in the designer's order;
 *  a section the designer never moved — a zone drawn since — keeps its derived place. */
export function applyOrder<T extends { key: string }>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((k, i) => [k, i]));
  const ranked = items.filter((s) => rank.has(s.key)).sort((a, b) => rank.get(a.key)! - rank.get(b.key)!);
  let next = 0;
  return items.map((s) => (rank.has(s.key) ? ranked[next++] : s));
}

export function quoteFigures(
  sections: ResolvedSection[],
  layout: QuoteLayout,
  opts: { vatRate: number; vatIncluded: boolean; hidden?: number },
): QuoteFigures {
  const catalogSum = round2(sections.reduce((n, s) => n + s.subtotal, 0));
  const price = layout.finalPrice ?? catalogSum;
  const r = Math.max(0, opts.vatRate);
  const total = opts.vatIncluded ? price : round2(price * (1 + r));
  const vat = opts.vatIncluded ? round2((price * r) / (1 + r)) : round2(price * r);
  return {
    catalogSum,
    discount: round2(catalogSum - price),
    total: round2(total),
    vat,
    net: round2(total - vat),
    vatIncluded: opts.vatIncluded,
    vatRate: r,
    unpriced: sections.reduce((n, s) => n + s.lines.filter((l) => (!l.priced || l.partial) && !l.gift).length, 0),
    hidden: opts.hidden ?? 0,
  };
}

/** Whether the discount line prints: whenever prices are shown that must add up, else when asked. */
export function discountShown(layout: QuoteLayout, figures: QuoteFigures): boolean {
  if (Math.abs(figures.discount) < 0.005) return false;
  return layout.priceMode !== "total" || (layout.showDiscount && figures.discount > 0);
}

/** A comparable fingerprint of a layout. Not JSON.stringify of it: the issued copy comes back from
 *  a jsonb column, which stores object keys in its own order, so two identical layouts serialise
 *  differently and the screen would report unsent changes forever. Keys sorted; the hidden and gift
 *  SETS sorted; the photo lists and the section order kept, because their order is the content. */
export function layoutSignature(layout: QuoteLayout): string {
  const l = normalizeLayout(layout);
  const sorted = <T,>(m: Record<string, T>) => Object.keys(m).sort().map((k) => [k, m[k]] as const);
  return JSON.stringify([
    l.priceMode,
    l.finalPrice,
    l.showDiscount,
    [...l.hidden].sort(),
    [...l.gifts].sort(),
    sorted(l.titles),
    sorted(l.notes),
    sorted(l.photos),
    l.order,
    l.paletteNote,
    l.concept,
    l.extras.map((e) => [e.id, e.label, e.price]),
    l.sketch,
    l.closing,
  ]);
}

/** "הצעת מחיר לעיצוב חתונה" — from the event's own type (EventSummary.eventType). */
export function quoteTitle(eventType?: string): string {
  return `הצעת מחיר לעיצוב ${eventType?.trim() || "האירוע"}`;
}
