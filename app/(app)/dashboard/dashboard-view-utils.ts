// Shared by weekly-calendar.tsx and today-focus.tsx — the two views that both need to place
// events on real dates and color them by status.
import type { CSSProperties } from "react";
import type { Booking } from "@/lib/calendar/hebrew";
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

// The calendar week `anchor` falls in, Sunday through Saturday. Snapping to Sunday (rather than
// the rolling "today + 6" window this used to return) is what makes the week and month views agree
// with each other and with every wall calendar in Israel: a given date sits in the same column in
// both, and "next week" is a week, not seven days from wherever you were standing.
export function weekGrid(anchor: Date): Date[] {
  const sunday = addDays(anchor, -anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

/** Same Sunday–Saturday box. Used to tell whether "היום" would move anything. */
export const sameWeek = (a: Date, b: Date) => sameDay(addDays(a, -a.getDay()), addDays(b, -b.getDay()));

export function weekLabel(days: Date[]): string {
  const fmt = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  return `${fmt(days[0])} - ${fmt(days[6])}`;
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

// Calendar event cards used to be themed per-hall, but that meant a card's color didn't match
// its own status pill (a "design"-stage card could land on the amber hall theme, clashing with
// its purple status text) — so the whole card (background, bar, time, percentage, status word)
// is themed by STATUS_TONE instead, one consistent color per card, matching TONE_CLASS/StatusChip
// everywhere else a status shows.
export interface CardTheme {
  bg: string;
  text: string;
  bar: string;
}
export const STATUS_CARD_THEME: Record<StatusTone, CardTheme> = {
  neutral: { bg: "bg-bg", text: "text-muted", bar: "bg-faint" },
  warn: { bg: "bg-warn-tint", text: "text-warn-ink", bar: "bg-warn" },
  accent: { bg: "bg-accent-tint", text: "text-accent-hover", bar: "bg-accent" },
  success: { bg: "bg-success-tint", text: "text-success", bar: "bg-success" },
};

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

// Holidays used to live here as a hand-transcribed map of 2026 only — which meant paging the month
// view to January 2027 emptied the calendar with no error, and two of the fifteen dates in it were
// a day off. They now come from lib/calendar/hebrew.ts, computed for 2025-2040. Import that.

// How a day's calendar note is colored. Booking constraint and peak demand are separate facts
// (lib/calendar/types.ts), but a day cell has room for one color, so they collapse here — with the
// constraint winning, because "you cannot book this" outranks "everyone wants to".
export type NoteTone = "blocked" | "restricted" | "peak" | "quiet";

export function noteTone(booking: Booking, peak: boolean): NoteTone {
  if (booking === "blocked") return "blocked";
  if (booking === "no-weddings") return "restricted";
  return peak ? "peak" : "quiet";
}

export interface NoteTheme {
  /** Fill + text for the holiday chip. */
  chip: string;
  /** The chip's leading dot — where the hue actually lives, so the text can stay quiet. */
  dot: string;
  /** Fill + text for the period band running across the cell. */
  band: string;
}

// Fills follow the pairings already vetted elsewhere in the app — `bg-warn-tint text-warn-ink` and
// `bg-accent-wash text-accent-deep` are StatusChip's own (components/status-chip.tsx). A calendar
// cell is not the place to introduce a fourth color vocabulary.
//
// Two departures from StatusChip, both deliberate:
//
// `quiet` is tinted accent rather than grey. An ordinary named day — ראש חודש, a minor fast — is
// still the only thing in that cell worth reading, and grey made it recede further than the plain
// purple line it replaced.
//
// `blocked` uses `text-alert-ink`, not `text-alert`. StatusChip pairs alert with its own tint at
// 3.2:1, under AA, and this text is smaller than a status chip's rather than larger — so alert got
// the ink variant warn already had. (warn-ink itself was missing AA too and was darkened in
// globals.css; that one is a shared token, so it moved for every warn chip in the app, not here.)
export const NOTE_THEME: Record<NoteTone, NoteTheme> = {
  blocked: { chip: "bg-alert-tint text-alert-ink", dot: "bg-alert", band: "bg-alert-tint text-alert-ink" },
  restricted: { chip: "bg-warn-tint text-warn-ink", dot: "bg-warn", band: "bg-warn-tint text-warn-ink" },
  peak: { chip: "bg-accent-wash text-accent-deep", dot: "bg-accent-deep", band: "bg-accent-wash text-accent-deep" },
  quiet: { chip: "bg-accent-tint text-accent", dot: "bg-accent", band: "bg-accent-tint text-accent" },
};
