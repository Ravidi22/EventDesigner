// App-shipped presentation skeletons (F-2.1). Picking one opens the builder with named, ordered,
// photo-less slides — the designer only attaches a photograph to each, then saves.
//
// Data, not per-studio rows: there is nothing here a studio owns, prices, or edits. A new scene is
// a new entry in this array, the same way lib/catalog/standard/ ships the base tables. The `key` is
// stable and never reused — it is only an analytics/telemetry handle, nothing points at it.

export interface PresentationTemplate {
  key: string;
  /** The presentation's starting name — the designer overwrites it freely. */
  name: string;
  /** One line under the name on the chooser card. */
  hint: string;
  /** Ordered slot names. Each becomes a photo-less slide the designer fills in. */
  slides: string[];
}

export const PRESENTATION_TEMPLATES: PresentationTemplate[] = [
  {
    key: "chuppah",
    name: "חופה",
    hint: "מסלול הטקס — מהכניסה ועד הבמה",
    slides: ["שער כניסה", "שביל כניסה", "מתחם החופה", "במה", "כיסאות אורחים"],
  },
  {
    key: "reception",
    name: "קבלת פנים",
    hint: "מה שהאורחים פוגשים ראשון",
    slides: ["עמדת קבלה", "בר", "מזנון פתיחה", "פינות ישיבה", "שולחנות קוקטייל"],
  },
  {
    key: "hall",
    name: "אולם",
    hint: "המבט מהשולחן — מרכזים, תקרה, תאורה",
    slides: [
      "מרכז שולחן",
      "שולחן הכלה",
      "מפה וכלים",
      "עיצוב תקרה",
      "תאורת אווירה",
      "מזנון קינוחים",
    ],
  },
  {
    key: "centerpieces",
    name: "מרכזי שולחן",
    hint: "וריאציות להצגה זו לצד זו",
    slides: ["מרכז גבוה", "מרכז נמוך", "שולחן הכלה", "שילוב נרות"],
  },
];

/** A hall's skeletons (the user, 2026-10-30: "the default options of the presentations need to be
 *  related to the owner — תפריט, מרכזי שולחן…"). What a couple is shown in a hall's meeting: the
 *  food, the tables the hall dresses as standard, the rooms themselves, the evening as it runs. A
 *  hall has no catalog, so its slides are photographs with names — the free slide, not a product. */
export const VENUE_PRESENTATION_TEMPLATES: PresentationTemplate[] = [
  {
    key: "venue-menu",
    name: "תפריט",
    hint: "מהקבלה ועד הקינוח — מנה אחרי מנה",
    slides: ["קבלת פנים", "מנות ראשונות", "מנה עיקרית", "תוספות", "קינוחים", "בר ושתייה"],
  },
  {
    key: "venue-centerpieces",
    name: "מרכזי שולחן",
    hint: "מה שהאולם מעמיד על השולחן — זה לצד זה",
    slides: ["מרכז גבוה", "מרכז נמוך", "שולחן הכלה", "מפות ומפיות", "כלי הגשה"],
  },
  {
    key: "venue-rooms",
    name: "האולם",
    hint: "החללים, ריקים וערוכים",
    slides: ["כניסה", "קבלת פנים", "מתחם החופה", "האולם ערוך", "רחבת הריקודים", "הגן בלילה"],
  },
  {
    key: "venue-evening",
    name: "ערב באולם",
    hint: "האירוע כפי שהוא מתנהל — לפי הלו״ז",
    slides: ["קבלת פנים", "חופה", "כניסה לאולם", "ריקודים", "עמדות קינוח"],
  },
];
