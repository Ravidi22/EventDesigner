// The Hebrew/Israeli calendar as an event designer reads it: not "what day is it in the Jewish
// year" but "may I book this day, and will everyone else be trying to book it too".
//
// Those are two INDEPENDENT questions, which is why there are two fields below rather than one
// enum. חול המועד פסח is peak demand for a bar mitzvah and simultaneously closed to weddings
// (אין מערבין שמחה בשמחה, plus it sits inside the Omer); collapsing both into one "kind" would
// force a lie either way.

/** What may be booked on a day. Ordered by severity — `strongest()` below relies on the order. */
export type Booking =
  /** Nothing runs: יום טוב, יום כיפור, תשעה באב, יום הזיכרון, יום השואה. */
  | "blocked"
  /** Other events run; weddings do not: ספירת העומר (ימי האבלות), בין המצרים. */
  | "no-weddings"
  /** Ordinary. */
  | "open";

const SEVERITY: Record<Booking, number> = { open: 0, "no-weddings": 1, blocked: 2 };

export function strongest(a: Booking, b: Booking): Booking {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

export const BOOKING_LABEL: Record<Booking, string> = {
  blocked: "לא ניתן לקיים אירוע",
  "no-weddings": "ללא חתונות",
  open: "פנוי",
};

/** A named day. One per holiday NAME, not per date — the classification of פורים does not change
 *  from year to year, so the generated table stores each definition once and the date index points
 *  into it. */
export interface HolidayDef {
  /** Hebrew name as printed in a calendar cell. */
  name: string;
  booking: Booking;
  /** Unusually high demand — חול המועד, ל״ג בעומר, ט״ו באב, פורים, יום העצמאות. */
  peak: boolean;
}

/** A stretch of days: the "areas" of the calendar. Dates are inclusive, ISO yyyy-mm-dd. */
export interface CalendarPeriod {
  /** Stable across years, so a view can key styling off it (`omer-mourning`, `three-weeks`…). */
  id: string;
  name: string;
  /** Name trimmed to fit the band drawn across a day cell, which is about twelve characters wide
   *  before it truncates. `name` stays the one that goes in a tooltip or a list. */
  short: string;
  booking: Booking;
  peak: boolean;
  from: string;
  to: string;
}

/** Everything the calendar knows about one date. */
export interface CalendarDay {
  iso: string;
  /** Named days falling on this date, in the order the generator emitted them. Usually 0 or 1;
   *  two when e.g. תענית אסתר and ערב פורים share a date. */
  holidays: readonly HolidayDef[];
  /** Ranges covering this date, longest first, so a view can nest the bands. */
  periods: readonly CalendarPeriod[];
  /** The strongest constraint among `holidays` and `periods`. */
  booking: Booking;
  /** True if any holiday or period on this date is high-demand. */
  peak: boolean;
}

/** The single line worth printing in a cramped day cell: the named day if there is one, else the
 *  innermost period, else nothing. */
export function dayLabel(day: CalendarDay): string | undefined {
  if (day.holidays.length > 0) return day.holidays[0].name;
  return day.periods.length > 0 ? day.periods[day.periods.length - 1].name : undefined;
}
