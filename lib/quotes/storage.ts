// Issued quotes (F-7.4): a quote locks to the design-document version it was produced from.
// The mock "version" is the serialized document itself — equality means unchanged, anything
// else lights the "העיצוב השתנה מאז ההצעה האחרונה" indicator. Re-issue = overwrite with the
// current document. Per-event key, same seam pattern as lib/studio/storage.ts.
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { DiscountType } from "@/lib/outputs/quote";

export interface IssuedQuote {
  issuedAt: number;
  docJson: string; // snapshot of the design document at issue time
  discountType: DiscountType;
  discountValue: number;
  hiddenVariantIds: string[]; // rows hidden before showing (F-7.1)
  mergedCategoryIds: string[]; // categories collapsed to a single line (F-7.1)
  total: number;
}

const key = (eventId: string) => `idesign.quote.${eventId}`;

export function loadIssuedQuote(eventId: string): IssuedQuote | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(eventId));
    return raw ? (JSON.parse(raw) as IssuedQuote) : null;
  } catch {
    return null;
  }
}

export function saveIssuedQuote(eventId: string, q: IssuedQuote): void {
  try {
    window.localStorage.setItem(key(eventId), JSON.stringify(q));
  } catch {
    // non-fatal
  }
}

// Has the design changed since the quote was issued? (F-7.4 — no itemized diff in phase 1.)
export function designChangedSince(q: IssuedQuote, doc: DesignDocumentContent): boolean {
  return q.docJson !== JSON.stringify(doc);
}
