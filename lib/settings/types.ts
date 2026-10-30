// Business settings (F-8.1): the letterhead for quotes and outputs, the VAT rate, the currency.
//
// Studio-level, not venue-level: a designer working three properties still has one VAT rate and one
// letterhead. What varies per property lives in the מתחמים ושיתוף section.
import type { VatStatus } from "@/lib/billing/types";

export interface BusinessSettings {
  businessName: string;
  ownerName: string;
  phone: string;
  address: string;
  /** ע.מ / ח.פ — printed under the business name on the quote. */
  businessNumber: string;
  email: string;
  /** Instagram handle, without the @ — printed on the quote's letterhead. */
  instagram: string;
  logoUrl?: string;
  vatRate: number; // 0.18 = 18%
  /** Catalog prices and a quote's typed price already include VAT (the quote shows the VAT inside
   *  the total), or exclude it (the quote adds it on top). */
  pricesIncludeVat: boolean;
  /** The studio's signature, uploaded — printed over the studio's line on the quote. */
  signatureUrl?: string;
  /** בס״ד at the top of every quote page. */
  showBsd: boolean;
  currency: string; // display symbol; phase 1 is ₪
  /** Days an issued quote holds its price, printed as "בתוקף עד …". */
  quoteValidityDays: number;
  /** The clauses at the foot of the quote — payment schedule, cancellation, exclusions. One per
   *  line; the sheet renders each line as a bullet. */
  quoteTerms: string;
  /** The studio's standing with VAT (lib/billing/types.ts): which billing documents it may issue.
   *  A עוסק פטור never prints "חשבונית מס". */
  vatStatus: VatStatus;
  /** Bank, branch, account — printed on a payment request so the client can transfer. */
  bankDetails: string;
}

/**
 * Shown as the terms field's PLACEHOLDER, never written into the row.
 *
 * A studio that never opened the settings screen must not send a client terms it did not agree to —
 * same rule as the blank business name below. This is here so that filling the field is a matter of
 * reading a sensible draft and editing it, rather than facing an empty box and skipping it, which is
 * how a quote goes out with no payment schedule and no cancellation clause on it.
 */
export const SUGGESTED_QUOTE_TERMS = [
  "תשלום: 50% במעמד אישור ההצעה, היתרה עד 7 ימים לפני האירוע.",
  "המחירים אינם כוללים הובלה, הקמה ופירוק מחוץ לשעות הפעילות, מנוף או חשמל ייעודי.",
  "פריטים המסופקים בהשאלה מוחזרים בתום האירוע; באחריות הלקוח נזק או אובדן.",
  "ביטול עד 30 יום לפני האירוע — החזר המקדמה בניכוי 10%; לאחר מכן המקדמה אינה מוחזרת.",
  "התמונות בהצעה להמחשה בלבד; זנים ופריטים עשויים להשתנות בהתאם לזמינות בעונה.",
].join("\n");

/**
 * What a studio starts with.
 *
 * The name and owner are EMPTY, deliberately. They used to be "Eve — עיצוב אירועים" and a person
 * who does not exist, which meant a real designer's first quote went out under an invented business
 * name if they never opened this screen — sample data in the one place it could reach a client. The
 * business name is asked for at sign-up now and written straight into this row, so the honest
 * default for anything not asked for is blank.
 *
 * The VAT rate and currency are NOT sample data: 18% is the Israeli rate and ₪ is the currency this
 * phase supports. A default that is simply correct is a different thing from a default that is
 * pretend.
 */
export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: "",
  ownerName: "",
  phone: "",
  address: "",
  businessNumber: "",
  email: "",
  instagram: "",
  vatRate: 0.18,
  pricesIncludeVat: true,
  showBsd: false,
  currency: "₪",
  quoteValidityDays: 14,
  quoteTerms: "",
  vatStatus: "licensed",
  bankDetails: "",
};
