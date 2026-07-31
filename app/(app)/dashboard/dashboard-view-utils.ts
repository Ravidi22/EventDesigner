// Shared by weekly-calendar.tsx and today-focus.tsx — the two views that both need to place
// events on real dates and color them by status.
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

export const startOfWeek = (d: Date) => addDays(d, -d.getDay());

export function weekGrid(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
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
