import type { EventSummary } from "@/lib/events/types";
import type { BusinessSettings } from "@/lib/settings/types";
import { DEFAULT_LAYOUT, normalizeLayout, quoteFigures, resolveSections, type QuoteLayout } from "@/lib/quotes/layout";
import type { QuoteSection, SectionLine } from "@/lib/outputs/quote-sections";
import type { QuoteDocumentProps, QuotePhoto, QuoteSketch } from "../outputs/quote-document";

// The sample event the branding screen's preview is drawn on (Settings → מיתוג מסמכים) — the
// board's own couple, so every direction can be judged on the same pages. Real components, sample
// data: the preview IS the quote, so what the studio sees here is what its clients will get. Photos
// are slots (a photo with no `src` draws as its labelled frame, ./../outputs/doc-kit.tsx).

const line = (section: string, label: string, opts: Partial<SectionLine> & { total: number }): SectionLine => ({
  key: `${section}|${label}`,
  variantId: label,
  productId: "",
  label,
  quantity: opts.quantity ?? 1,
  perUnit: opts.perUnit,
  priceUnit: "unit",
  unitPrice: opts.total,
  lineTotal: opts.total,
  priced: true,
  detail: opts.detail,
  categoryOrder: 0,
});

const SECTIONS: QuoteSection[] = [
  {
    key: "kit:a",
    kind: "kit",
    title: "שולחנות האורחים",
    perTable: true,
    lines: [
      line("kit:a", "מרכז שולחן נמוך", { total: 11200, quantity: 28, perUnit: 1, detail: "ורד גן, אקליפטוס ולבנדר · ורוד עתיק" }),
      line("kit:a", "מפת פשתן", { total: 3360, quantity: 28, perUnit: 1, detail: "שמנת · 3.2 מטר" }),
      line("kit:a", "ראנר קטיפה", { total: 2240, quantity: 28, perUnit: 1, detail: "ירוק מרווה" }),
      line("kit:a", "פמוטי זכוכית", { total: 5040, quantity: 56, perUnit: 2, detail: "שלושה קנים" }),
    ],
    seating: ["צ׳יאוורי · זהב"],
  },
  {
    key: "kit:b",
    kind: "kit",
    title: "שולחן אבירים",
    lines: [line("kit:b", "קו פרחים לכל האורך", { total: 5200, detail: "ורוד עתיק ולבן" }), line("kit:b", "נרות בגבהים משתנים", { total: 2220, quantity: 24 })],
  },
  {
    key: "zone:g",
    kind: "zone",
    title: "חופה",
    lines: [line("zone:g", "מבנה חופה עגול", { total: 6200, detail: "פליז מוברש" }), line("zone:g", "ענן פרחים", { total: 3630, detail: "לבן ושמנת" })],
  },
];

const LAYOUT: QuoteLayout = normalizeLayout({
  ...DEFAULT_LAYOUT,
  priceMode: "sections",
  finalPrice: 34500,
  concept: "ערב רך בגווני שמנת וורוד עתיק, עם ירוק מרווה שמחבר בין האולם לגן. פרחים נמוכים ועשירים על כל שולחן, כדי שתראו זה את זה, ונרות לאורך שולחן האבירים.",
  paletteNote: "פשתן שמנת · קטיפה בירוק מרווה · זכוכית שקופה · זהב מוברש",
  notes: { "kit:a": "סידור נמוך ועשיר במרכז כל שולחן, על מפת פשתן שמנת וראנר קטיפה בירוק מרווה. שני פמוטי זכוכית בכל צד." },
  gifts: ["kit:b|נרות בגבהים משתנים"],
});

const EVENT: EventSummary = {
  id: "sample",
  clientName: "מיכל ודניאל",
  phone: "",
  date: "2027-05-14",
  time: "19:30",
  zoneIds: [],
  zonesLabel: "אולם הגפן + גן",
  guests: 280,
  step: 0,
  eventType: "חתונה",
} as unknown as EventSummary;

const slot = (id: string, name: string): QuotePhoto => ({ id, src: "", name });
const SECTION_SLOTS: Record<string, QuotePhoto[]> = {
  "kit:a": [slot("a1", "מרכז השולחן"), slot("a2", "מפה וראנר"), slot("a3", "כלים ונרות")],
  "kit:b": [slot("b1", "קו פרחים")],
  "zone:g": [slot("g1", "החופה"), slot("g2", "ענן הפרחים")],
};
const PAGE_SLOTS: Record<string, QuotePhoto> = {
  "page:cover": slot("cover", "תמונת שער — עבודה קודמת או השראה"),
  "page:concept": slot("concept", "תמונת השראה"),
};

/** A plan drawn as a plan: rounds in rows, a head table, a stage — enough to judge the frame. */
const SKETCH: QuoteSketch = {
  key: "sample",
  title: "אולם הגפן",
  aspect: 0.72,
  render: (w, h) => (
    <svg viewBox="0 0 100 72" width={`${w}mm`} height={`${h}mm`} aria-hidden>
      <rect x="1" y="1" width="98" height="70" fill="none" stroke="#888" strokeWidth="0.4" />
      <rect x="30" y="4" width="40" height="7" fill="#e9e3d8" stroke="#666" strokeWidth="0.3" />
      <rect x="34" y="14" width="32" height="3" fill="#fff" stroke="#333" strokeWidth="0.3" />
      {Array.from({ length: 24 }, (_, i) => (
        <circle key={i} cx={12 + (i % 6) * 15.2} cy={26 + Math.floor(i / 6) * 11.5} r="3.6" fill="#fff" stroke="#333" strokeWidth="0.3" />
      ))}
    </svg>
  ),
};

export function sampleQuote(settings: BusinessSettings): Omit<QuoteDocumentProps, "style" | "pagesRef"> {
  const sections = resolveSections(SECTIONS, LAYOUT);
  return {
    settings: {
      ...settings,
      businessName: settings.businessName || "סטודיו לביא",
      ownerName: settings.ownerName || "נועה לביא",
      phone: settings.phone || "052-555-0101",
      quoteTerms:
        settings.quoteTerms ||
        ["מקדמה של 30% עם החתימה; היתרה עד שבעה ימים לפני האירוע.", "שינויים בכמויות — עד ארבעה־עשר ימים לפני האירוע.", "הפרחים טריים ועונתיים; זן שאינו זמין יוחלף בזן דומה.", "ההצעה בתוקף שלושים יום מיום הפקתה."].join("\n"),
    },
    event: EVENT,
    venueName: "אחוזת אמרה",
    layout: LAYOUT,
    sections,
    figures: quoteFigures(sections, LAYOUT, { vatRate: settings.vatRate || 0.18, vatIncluded: true }),
    photosOf: (s) => SECTION_SLOTS[s.key] ?? [],
    pagePhoto: (key) => PAGE_SLOTS[key] ?? null,
    palette: {
      shades: [
        { name: "שמנת", swatch: "#efe7d8" },
        { name: "ורוד עתיק", swatch: "#d4a39b" },
        { name: "ירוק מרווה", swatch: "#a7b59a" },
        { name: "זהב עתיק", swatch: "#c4a467" },
        { name: "לבן חלבי", swatch: "#f7f4ee" },
      ],
      cloths: [],
    },
    seating: { tables: 29, seats: 284 },
    sketches: [SKETCH],
    reference: "4F2A9C-3",
    issuedAt: new Date("2026-11-10T12:00:00").getTime(),
  };
}

/** The crew sample: a packing list of four categories. */
export const SAMPLE_PACKING = [
  { label: "שולחנות וכיסאות", rows: [["שולחן עגול ⌀180", 28, "—", 28], ["שולחן אבירים 6 מ׳", 1, "—", 1], ["כיסא צ׳יאוורי זהב", 284, 10, 294]] },
  { label: "מפות וטקסטיל", rows: [["מפה פשתן שמנת 3.2 מ׳", 28, 2, 30], ["ראנר קטיפה ירוק מרווה", 29, 2, 31]] },
  { label: "פרחים", rows: [["מרכז שולחן נמוך — ורוד עתיק", 28, 1, 29], ["קו פרחים לשולחן אבירים", 1, "—", 1]] },
  { label: "תאורה ונרות", rows: [["פמוט זכוכית 3 קנים", 56, 3, 59]] },
] as const;
