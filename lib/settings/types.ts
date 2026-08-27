// Business settings (F-8.1): the letterhead for quotes and outputs, the VAT rate, the currency.
//
// Studio-level, not venue-level: a designer working three properties still has one VAT rate and one
// letterhead. What varies per property lives in the מתחמים ושיתוף section.
export interface BusinessSettings {
  businessName: string;
  ownerName: string;
  phone: string;
  address: string;
  /** ע.מ / ח.פ — printed under the business name on the quote. */
  businessNumber: string;
  email: string;
  logoUrl?: string;
  vatRate: number; // 0.18 = 18%
  currency: string; // display symbol; phase 1 is ₪
  /** Days an issued quote holds its price, printed as "בתוקף עד …". */
  quoteValidityDays: number;
  /** The clauses at the foot of the quote — payment schedule, cancellation, exclusions. One per
   *  line; the sheet renders each line as a bullet. */
  quoteTerms: string;
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
  vatRate: 0.18,
  currency: "₪",
  quoteValidityDays: 14,
  quoteTerms: "",
};
