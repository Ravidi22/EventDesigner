// Shared by weekly-calendar.tsx and today-focus.tsx — the two views that both need to place
// events on real dates and color them by status.
import type { CSSProperties } from "react";
import type { StatusTone } from "@/lib/events/types";

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

// A rolling 7-day window starting at `anchor` itself (not Sunday-snapped) — paired with the
// "היום" control resetting anchor to today, so "week view" always reads as "today + the next 6
// days" rather than whichever Sun–Sat box today happens to fall in.
export function weekGrid(anchor: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
}

export function weekLabel(days: Date[]): string {
  const fmt = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  return `${fmt(days[0])} – ${fmt(days[6])}`;
}

// 6 full weeks (42 cells) so the grid never changes height between months.
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const monthLabel = (d: Date) => d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });

// Compact echo of StatusChip's own tone→fill mapping (components/status-chip.tsx) — a chip
// this small can't carry StatusChip's padding/text size, but the meaning must stay identical
// to every other status surface in the app.
export const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-bg text-muted",
  accent: "bg-accent-wash text-accent-hover",
  success: "bg-success-tint text-success",
  warn: "bg-warn-tint text-warn-ink",
};

// Soft thematic card backgrounds, one per hall — a deliberately different color language than
// STATUS_TONE (which colors the stage a card is at, not which hall it's in). Two of these reuse
// existing brand tokens (indigo/accent, amber); teal has no equivalent in the palette yet, so
// it's defined here, scoped to this one calendar-card use rather than added to the global theme.
export interface CardTheme {
  bg: string;
  text: string;
  bar: string;
}
const CARD_THEMES: CardTheme[] = [
  { bg: "bg-[#e7f7f5]", text: "text-[#0f8a82]", bar: "bg-[#14b8a6]" }, // soft teal
  { bg: "bg-[#fbeafa]", text: "text-[#a8479f]", bar: "bg-magenta" }, // soft pink/magenta
  { bg: "bg-accent-tint", text: "text-accent-hover", bar: "bg-accent" }, // soft indigo
  { bg: "bg-[#fdf1e6]", text: "text-[#b3742c]", bar: "bg-amber" }, // soft amber/peach
];
export function cardTheme(hallTemplateId: string | undefined): CardTheme {
  if (!hallTemplateId) return CARD_THEMES[0];
  let hash = 0;
  for (let i = 0; i < hallTemplateId.length; i++) hash = (hash * 31 + hallTemplateId.charCodeAt(i)) >>> 0;
  return CARD_THEMES[hash % CARD_THEMES.length];
}

// Past days: a visibly darker, textured surface (not just a fainter version of "today") so
// "this already happened" reads at a glance, not just on close inspection. Split in two so the
// hatch can be layered as its own overlay ON TOP of the day's event cards (fading them slightly)
// while the solid tint stays the cell's own base — a single opaque style would just hide the
// cards underneath instead of fading them.
export const PAST_DAY_BG: CSSProperties = { backgroundColor: "#e4e2ea" };
export const PAST_DAY_OVERLAY: CSSProperties = {
  backgroundColor: "rgb(228 226 234 / 0.4)",
  backgroundImage:
    "repeating-linear-gradient(135deg, rgb(124 120 137 / 0.22) 0px, rgb(124 120 137 / 0.22) 2px, transparent 2px, transparent 10px)",
};

// Israeli public/religious holidays, keyed by ISO date — Gregorian dates for 2026 (5786), Israel
// observance (e.g. one-day Shemini Atzeret/Simchat Torah, 7-day Pesach), sourced from Hebcal.
// A flat lookup rather than a date-math generator since these dates don't repeat predictably
// across years; extend this map when the calendar needs to reach into 2027.
const HOLIDAYS_2026: Record<string, string> = {
  "2026-03-03": "פורים",
  "2026-04-02": "פסח (חג ראשון)",
  "2026-04-08": "פסח (חג אחרון)",
  "2026-04-20": "יום הזיכרון",
  "2026-04-21": "יום העצמאות",
  "2026-05-22": "שבועות",
  "2026-07-23": "תשעה באב",
  "2026-07-29": "ט״ו באב",
  "2026-09-12": "ראש השנה",
  "2026-09-13": "ראש השנה",
  "2026-09-21": "יום כיפור",
  "2026-09-26": "סוכות (חג ראשון)",
  "2026-10-02": "הושענא רבה",
  "2026-10-03": "שמחת תורה",
  "2026-12-05": "חנוכה",
};

export function holidayName(iso: string): string | undefined {
  return HOLIDAYS_2026[iso];
}
