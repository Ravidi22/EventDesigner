// What only the business owner can supply, in ONE place (EVE-8/9/10). Every value is null until Ravid
// provides it; the texts name them as {{key}} and the page draws a missing one as a placeholder, so the
// lawyer and Ravid can see at a glance what is still owed. Filling a value here fills it everywhere.
//
// ⚠ The hosting facts (`subprocessors`, `dataRegion`) wait on the environment choice (Vercel, Neon,
// R2…), which is still open — see docs/legal/README.md.

export const FACT_LABELS = {
  legalName: "שם החברה",
  companyNumber: "מספר החברה (ח״פ / ע״מ)",
  address: "כתובת רשומה",
  contactEmail: "אימייל לפניות",
  privacyEmail: "אימייל לפניות בנושא פרטיות",
  effectiveDate: "תאריך תחילה",
  subprocessors: "ספקי המשנה (אחסון, מסד נתונים, קבצים, דואר)",
  dataRegion: "המדינה / האזור שבהם נשמר המידע",
  retentionAfterClose: "תקופת השמירה אחרי סגירת חשבון",
  taxRecordsYears: "שנות שמירת מסמכי חיוב",
  pricingNoticeDays: "ימי הודעה מראש לפני חיוב או שינוי מחיר",
  termsNoticeDays: "ימי הודעה מראש לפני שינוי בתנאים",
  courtCity: "העיר של בית המשפט המוסמך",
  accessibilityName: "שם רכז/ת הנגישות",
  accessibilityPhone: "טלפון רכז/ת הנגישות",
  accessibilityEmail: "אימייל רכז/ת הנגישות",
  auditDate: "תאריך בדיקת הנגישות",
  auditScope: "הדפדפנים וטכנולוגיות העזר שנבדקו",
  accessibilityReplyDays: "תוך כמה ימים עונים לפנייה בנושא נגישות",
} as const;

export type FactKey = keyof typeof FACT_LABELS;

export const LEGAL_FACTS: Record<FactKey, string | null> = {
  legalName: null,
  companyNumber: null,
  address: null,
  contactEmail: null,
  privacyEmail: null,
  effectiveDate: null,
  subprocessors: null,
  dataRegion: null,
  retentionAfterClose: null,
  taxRecordsYears: null,
  pricingNoticeDays: null,
  termsNoticeDays: null,
  courtCity: null,
  accessibilityName: null,
  accessibilityPhone: null,
  accessibilityEmail: null,
  auditDate: null,
  auditScope: null,
  accessibilityReplyDays: null,
};

export const isFactKey = (key: string): key is FactKey => Object.hasOwn(FACT_LABELS, key);

/** The facts still owed — null or blank. */
export function missingFacts(facts: Record<FactKey, string | null> = LEGAL_FACTS): FactKey[] {
  return (Object.keys(FACT_LABELS) as FactKey[]).filter((k) => !facts[k]?.trim());
}
