// HOW A STUDIO'S DOCUMENTS LOOK — the quote a client receives and the sheets the crew carries.
//
// The user's claude.ai/design board "Documents" (turn 4, 2026-11-10): three hand-designed
// DIRECTIONS, each its own layout, type and rhythm — not one layout with different settings —
//
//   stationery  הזמנה    Bellefair + David Libre, ivory paper in a double gold frame, a monogram
//                        cover, arched and oval photo frames, items set like a menu card, centred.
//   lookbook    לוקבוק   Karantina + Heebo, full-bleed photos, huge condensed type, the palette as
//                        colour bands, numbered captions, oxblood numerals.
//   studio      סטודיו   IBM Plex Sans Hebrew + Plex Mono, warm grey paper, a 12-column grid, a
//                        project metadata bar, a black total block.
//
// …and inside the chosen direction, turn 3's twelve settings (the user: "turn 4 + all 12
// settings"): logo + its place, the accent colour, the heading and body faces, the cover, section
// headers, photo layout, price table, paper, density, footer and signature. Each direction's own
// answers are its DEFAULTS; a studio's setting is the direction plus what it changed
// (`DocStyleSetting.overrides`), so switching direction starts it from that direction's look and
// "חזרה לתבנית" is dropping the overrides.
//
// Pure and self-checked (npm run check:doc-style). The colours, faces and measures a page is drawn
// with are lib/documents/theme.ts; the faces themselves are loaded by app/doc-fonts.ts.

export type DocDirection = "stationery" | "lookbook" | "studio";

export const DIRECTIONS: { id: DocDirection; name: string; desc: string }[] = [
  { id: "stationery", name: "הזמנה", desc: "סריף עדין, מסגרת זהב, מונוגרמה בשער" },
  { id: "lookbook", name: "לוקבוק", desc: "תמונות מלאות, אותיות ענק, פסי צבע" },
  { id: "studio", name: "סטודיו", desc: "גריד אדריכלי, טבלאות, בלוק סכום שחור" },
];

/** Every face a document may be set in. Each has a CSS variable (app/doc-fonts.ts). */
export const DOC_FONTS = [
  "Bellefair",
  "David Libre",
  "Karantina",
  "Heebo",
  "IBM Plex Sans Hebrew",
  "Frank Ruhl Libre",
  "Suez One",
  "Rubik",
  "Noto Serif Hebrew",
  "Assistant",
] as const;
export type DocFont = (typeof DOC_FONTS)[number];

/** The faces offered for headings — names, titles, totals, the closing. */
export const HEAD_FONTS: DocFont[] = ["Bellefair", "Karantina", "IBM Plex Sans Hebrew", "Frank Ruhl Libre", "David Libre", "Suez One", "Rubik", "Heebo"];
/** The faces offered for running text and tables. */
export const BODY_FONTS: DocFont[] = ["David Libre", "Heebo", "IBM Plex Sans Hebrew", "Assistant", "Rubik", "Noto Serif Hebrew"];

export type LogoPos = "center" | "start" | "corner";
export type CoverKind = "photo" | "plain" | "gradient";
export type SectionKind = "rule" | "numbered" | "band";
export type PhotosKind = "hero" | "pair" | "grid";
export type PricesKind = "dots" | "table" | "totals";
export type PaperKind = "clean" | "frame" | "grain";
export type DensityKind = "airy" | "compact";
export type FooterKind = "contact" | "minimal";
export type SignKind = "lines" | "box";

export interface DocTokens {
  /** #rrggbb — kickers, rules, numbers, the total. Ink on a crew sheet. */
  accent: string;
  headFont: DocFont;
  bodyFont: DocFont;
  logoPos: LogoPos;
  cover: CoverKind;
  section: SectionKind;
  photos: PhotosKind;
  prices: PricesKind;
  paper: PaperKind;
  density: DensityKind;
  footer: FooterKind;
  sign: SignKind;
}

export type DocStyle = DocTokens & { direction: DocDirection };

/** What a studio stores: the direction and only what it changed from that direction's look. */
export interface DocStyleSetting {
  direction: DocDirection;
  overrides: Partial<DocTokens>;
}

export const DIRECTION_DEFAULTS: Record<DocDirection, DocTokens> = {
  stationery: {
    accent: "#a08155",
    headFont: "Bellefair",
    bodyFont: "David Libre",
    logoPos: "center",
    cover: "plain",
    section: "rule",
    photos: "pair",
    prices: "dots",
    paper: "frame",
    density: "airy",
    footer: "minimal",
    sign: "lines",
  },
  lookbook: {
    accent: "#6b2230",
    headFont: "Karantina",
    bodyFont: "Heebo",
    logoPos: "start",
    cover: "photo",
    section: "numbered",
    photos: "grid",
    prices: "table",
    paper: "clean",
    density: "airy",
    footer: "minimal",
    sign: "lines",
  },
  studio: {
    accent: "#b4532f",
    headFont: "IBM Plex Sans Hebrew",
    bodyFont: "IBM Plex Sans Hebrew",
    logoPos: "start",
    cover: "photo",
    section: "numbered",
    photos: "grid",
    prices: "table",
    paper: "grain",
    density: "compact",
    footer: "contact",
    sign: "box",
  },
};

export const DEFAULT_DOC_STYLE: DocStyleSetting = { direction: "stationery", overrides: {} };

/** The accent swatches offered — each direction's own first, then turn 3's six. */
export const ACCENT_SWATCHES: { name: string; hex: string }[] = [
  { name: "זהב עתיק", hex: "#a08155" },
  { name: "בורדו", hex: "#6b2230" },
  { name: "טרקוטה", hex: "#b4532f" },
  { name: "זית", hex: "#5b6b45" },
  { name: "שזיף", hex: "#6a3e5c" },
  { name: "כחול לילה", hex: "#2f4a63" },
  { name: "פחם", hex: "#3d3a37" },
  { name: "ורד עתיק", hex: "#a8686a" },
];

/** The words each enumerated setting is offered in. */
export const TOKEN_LABELS = {
  logoPos: { center: "במרכז", start: "בצד", corner: "בפינה" },
  cover: { photo: "תמונה", plain: "טיפוגרפי", gradient: "צבע" },
  section: { rule: "קו", numbered: "ממוספר", band: "פס צבע" },
  photos: { hero: "גדולה", pair: "זוג", grid: "פסיפס" },
  prices: { dots: "נקודות", table: "טבלה", totals: "סכום בלבד" },
  paper: { clean: "נקי", frame: "מסגרת", grain: "גרעין" },
  density: { airy: "אוורירי", compact: "צפוף" },
  footer: { contact: "פרטי קשר", minimal: "מספר עמוד" },
  sign: { lines: "קווים", box: "תיבות" },
} as const satisfies { [K in keyof DocTokens]?: Record<DocTokens[K] & string, string> };

export type EnumToken = keyof typeof TOKEN_LABELS;
export const ENUM_TOKENS = Object.keys(TOKEN_LABELS) as EnumToken[];

const HEX = /^#[0-9a-f]{6}$/;

function cleanTokens(v: unknown): Partial<DocTokens> {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: Partial<DocTokens> = {};
  if (typeof o.accent === "string" && HEX.test(o.accent.toLowerCase())) out.accent = o.accent.toLowerCase();
  if (HEAD_FONTS.includes(o.headFont as DocFont)) out.headFont = o.headFont as DocFont;
  if (BODY_FONTS.includes(o.bodyFont as DocFont)) out.bodyFont = o.bodyFont as DocFont;
  for (const key of ENUM_TOKENS) {
    const val = o[key];
    if (typeof val === "string" && val in TOKEN_LABELS[key]) (out as Record<string, string>)[key] = val;
  }
  return out;
}

/** Whatever arrives — the settings screen, a stored jsonb from an older build — made into a
 *  setting. Never throws. An override equal to the direction's own answer is dropped, so "changed"
 *  means changed. */
export function normalizeDocStyle(value: unknown): DocStyleSetting {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const direction = DIRECTIONS.some((d) => d.id === v.direction) ? (v.direction as DocDirection) : DEFAULT_DOC_STYLE.direction;
  const base = DIRECTION_DEFAULTS[direction];
  const overrides = cleanTokens(v.overrides);
  for (const k of Object.keys(overrides) as (keyof DocTokens)[]) if (overrides[k] === base[k]) delete overrides[k];
  return { direction, overrides };
}

/** The look a page is drawn with: the direction's answers under the studio's changes. */
export function resolveDocStyle(setting: DocStyleSetting | null | undefined): DocStyle {
  const s = normalizeDocStyle(setting);
  return { direction: s.direction, ...DIRECTION_DEFAULTS[s.direction], ...s.overrides };
}

/** One setting changed — written back normalised (an answer equal to the direction's drops out). */
export function withToken<K extends keyof DocTokens>(setting: DocStyleSetting, key: K, value: DocTokens[K]): DocStyleSetting {
  return normalizeDocStyle({ direction: setting.direction, overrides: { ...setting.overrides, [key]: value } });
}

export const changedCount = (setting: DocStyleSetting) => Object.keys(normalizeDocStyle(setting).overrides).length;

// ── Colour arithmetic (the accent's tints and shades) ──────────────────────────────────────────

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** `a` moved toward `b` by `t` (0 = a, 1 = b). Both #rrggbb. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

// ── Monogram: the stationery cover's two letters ────────────────────────────────────────────────

/** "מיכל ודניאל" → ["מ", "ד"]; "משפחת כהן" → ["מ", "כ"]; "דנה" → ["ד"]. A couple is told apart by
 *  the "ו" that joins the second name (or & / +); otherwise the first two words. */
export function monogram(name: string | undefined): string[] {
  const n = (name ?? "").trim();
  if (!n) return [];
  const couple = n.split(/\s*[&+]\s*|\s+ו(?=\S)/).filter(Boolean);
  const words = couple.length >= 2 ? couple : n.split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => [...w.replace(/^["'׳״(]+/, "")][0] ?? "")
    .filter(Boolean);
}

/** The Hebrew letter numerals a stationery chapter is counted in: א … ת, then numbers. */
export function hebrewNumeral(n: number): string {
  const letters = "אבגדהוזחטיכלמנסעפצקרשת";
  return n >= 1 && n <= letters.length ? letters[n - 1] : String(n);
}
