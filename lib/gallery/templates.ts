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
