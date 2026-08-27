// Shared by weekly-calendar.tsx and today-focus.tsx — the two views that both need to place
// events on real dates and color them by status.
import type { CSSProperties } from "react";
import {
  Ban,
  CalendarDays,
  MapPin,
  MessagesSquare,
  Truck,
  TreePalm,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AppointmentKind } from "@/lib/appointments/types";
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

// WHAT KIND OF DAY IS THIS? — one color per סוג הרשומה.
//
// An event is colored by its STATUS, because an event is a body of work that moves through stages.
// A diary entry has no stages (see AppointmentChip), so the only thing its color can carry is what
// KIND of thing it is — and that is what the designer actually scans a month for: where the אילוץ
// days are, which week the חופשה eats, whether Thursday is a sit-down or a delivery.
//
// EIGHT KINDS, EIGHT HUES, NO NEW VOCABULARY. Every fill below is a tint of a hue this design system
// already owns — indigo twice (the two client-meeting kinds belong together and separate on the
// tint/wash step), green, terracotta, gold, magenta, blush, and the plain plane for "אחר". The four
// semantic hues keep the meaning they carry everywhere else in the app: alert = you cannot book
// this, warn = the studio is away, success = go and stand in the room.
//
// `text` is an INK, never the raw swatch: this text renders at 10-12px, so every pair here clears
// 4.5:1 on its own fill. magenta-ink, blush-ink and success-ink were added to globals.css for
// exactly this — the raw `success` swatch is 2.8:1 on success-tint and would have failed.
//
// `rail` is the saturated hue worn as a 3px leading edge, and it is doing two jobs: eight tints this
// pale are close neighbours, and the rail is the channel that still separates them at arm's length —
// and it is what tells a diary card from an event card now that the two share one geometry.
//
// Surfaces with no fill to tint take `text` alone on the kind's icon and label — that is what the
// event drawer's list does. Today's Focus takes neither: its ground is the violet gradient, and
// every ink here is tuned for a near-white tint. It gets the glyph and white type instead.
export interface KindTheme {
  bg: string;
  text: string;
  rail: string;
}

export const KIND_CARD_THEME: Record<AppointmentKind, KindTheme> = {
  consultation: { bg: "bg-accent-tint", text: "text-accent", rail: "border-s-accent" },
  followup: { bg: "bg-accent-wash", text: "text-accent-deep", rail: "border-s-accent-deep" },
  walkthrough: { bg: "bg-success-tint", text: "text-success-ink", rail: "border-s-success" },
  constraint: { bg: "bg-alert-tint", text: "text-alert-ink", rail: "border-s-alert" },
  vacation: { bg: "bg-warn-tint", text: "text-warn-ink", rail: "border-s-warn" },
  supply: { bg: "bg-magenta-tint", text: "text-magenta-ink", rail: "border-s-magenta" },
  personal: { bg: "bg-blush-tint", text: "text-blush-ink", rail: "border-s-blush-ink" },
  other: { bg: "bg-bg", text: "text-ink-soft", rail: "border-s-faint" },
};

// The glyph half of the same answer. A diary card is the only card in a day cell carrying an icon,
// so this is also what separates it from an event at a glance — and it is what keeps the eight kinds
// apart for anyone reading the grid without color, which is the whole point of not leaning on hue
// alone. `done` swaps in a tick at the call site rather than being an entry here: it is a state, not
// a ninth kind.
export const KIND_ICON: Record<AppointmentKind, LucideIcon> = {
  consultation: Users,
  followup: MessagesSquare,
  walkthrough: MapPin,
  constraint: Ban,
  vacation: TreePalm,
  supply: Truck,
  personal: User,
  other: CalendarDays,
};

// A HELD entry drops its hue. `done` is the designer confirming it happened, and what happened is
// finished business — it should not go on flying the loudest color in the cell over what is still
// ahead. Grey with a tick, the same retirement the chip has always used.
export const DONE_CARD_THEME: KindTheme = {
  bg: "bg-inset",
  text: "text-muted",
  rail: "border-s-border",
};

export const kindTheme = (kind: AppointmentKind, done?: boolean): KindTheme =>
  done ? DONE_CARD_THEME : KIND_CARD_THEME[kind];

// PAST DAYS: a light hatch, under everything.
//
// This has been three things now, and the middle one is why the current one is shaped the way it
// is. It began as a hand-mixed #e4e2ea fill plus a 22%-opacity diagonal hatch layered OVER the
// cell — including over the day's own numbers, which dragged them under AA — and a fortnight of
// history read as a construction sign. Removing both went too far the other way: `bg-bg` is
// DARKER than the `bg-inset` well a live day sits in, so a past day was simultaneously the
// heaviest cell in the grid and the one carrying no signal at all.
//
// So: a hatch again, but a third of the old ink and half its width, and applied as the cell's own
// `background-image` rather than as an overlay. Two consequences, both of them the point —
// children paint on top of it, so an event card covers the hatch instead of being veiled by it,
// and the fill underneath can back almost all the way off, because texture is doing the work that
// darkness was failing to do. `PAST_DAY_FILL` is `--color-bg` at 45% over the card's white —
// about #f7f7fa, three levels under a live day's `bg-inset` where flat `bg-bg` was twelve. The
// tokens, in other words, not a fourth hand-mixed grey.
export const PAST_DAY_FILL = "bg-bg/45";
export const PAST_DAY_HATCH: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgb(124 120 137 / 0.08) 0px, rgb(124 120 137 / 0.08) 1px, transparent 1px, transparent 9px)",
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
