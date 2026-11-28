// The Hebrew/Israeli calendar, as the app reads it. A dependency-free lookup over the table in
// hebrew.generated.ts — no network, no date math, no @hebcal/core in the bundle (see the header
// of generate.mts for why that matters). Safe to import from a client component.
import { HOLIDAY_DAYS, HOLIDAY_DEFS, PERIODS, COVERS } from "./hebrew.generated";
import { strongest, type CalendarDay, type CalendarPeriod, type HolidayDef } from "./types";

export { COVERS } from "./hebrew.generated";
export * from "./types";

const NO_HOLIDAYS: readonly HolidayDef[] = [];
const NO_PERIODS: readonly CalendarPeriod[] = [];

/** True when `iso` falls inside the generated window. Outside it every lookup answers "ordinary",
 *  which is indistinguishable from a real ordinary day — so anything that could plausibly be asked
 *  about a far-off date should check this rather than trust the silence. */
export function isCovered(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  return year >= COVERS.from && year <= COVERS.to;
}

/** Ranges covering `iso`, outermost first.
 *
 *  PERIODS is sorted by start date and holds ~7 rows per year, so a linear scan is a few hundred
 *  string compares — cheaper than building and holding an index for a table this size, and a month
 *  grid only asks 42 times. */
function periodsOn(iso: string): readonly CalendarPeriod[] {
  let found: CalendarPeriod[] | undefined;
  for (const p of PERIODS) {
    if (p.from > iso) break; // sorted by `from`; nothing later can have started
    if (p.to >= iso) (found ??= []).push(p);
  }
  return found ?? NO_PERIODS;
}

/** Everything known about one date. Cheap enough to call once per rendered day cell. */
export function calendarDay(iso: string): CalendarDay {
  const holidays = HOLIDAY_DAYS[iso]?.map((i) => HOLIDAY_DEFS[i]) ?? NO_HOLIDAYS;
  const periods = periodsOn(iso);

  // Strictest wins, with no "this day lifts the restriction around it" escape hatch: the period
  // boundaries in the generator already carve out the days that do (the Omer mourning band stops
  // the day before ל״ג בעומר rather than being overridden on it). The days left sitting inside a
  // band while arguably permitted — יום העצמאות during the Omer is the live one — are exactly the
  // cases where custom divides, and a booking tool should show the constraint and let the couple's
  // rabbi rule, not quietly rule for them.
  const booking = strongest(
    holidays.reduce<CalendarDay["booking"]>((acc, h) => strongest(acc, h.booking), "open"),
    periods.reduce<CalendarDay["booking"]>((acc, p) => strongest(acc, p.booking), "open"),
  );

  return {
    iso,
    holidays,
    periods,
    booking,
    peak: holidays.some((h) => h.peak) || periods.some((p) => p.peak),
  };
}

/** The periods overlapping a rendered range, each clipped to it — what a view needs to draw the
 *  bands across a week or a month without asking day by day. */
export function periodsBetween(fromIso: string, toIso: string): CalendarPeriod[] {
  const out: CalendarPeriod[] = [];
  for (const p of PERIODS) {
    if (p.from > toIso) break;
    if (p.to >= fromIso) {
      out.push({ ...p, from: p.from < fromIso ? fromIso : p.from, to: p.to > toIso ? toIso : p.to });
    }
  }
  return out;
}
