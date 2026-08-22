// The Hebrew/Israeli calendar, as the app reads it. A dependency-free lookup over the table in
// hebrew.generated.ts — no network, no date math, no @hebcal/core in the bundle (see the header
// of generate.mts for why that matters). Safe to import from a client component.
import { HOLIDAY_DAYS, HOLIDAY_DEFS, PERIODS, COVERS } from "./hebrew.generated";
import { strongest, type CalendarDay, type CalendarPeriod, type HolidayDef } from "./types";
import { isMain } from "../self-check";

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

if (isMain(import.meta.url)) {
  const eq = (actual: unknown, expected: unknown, what: string) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${what}\n  expected ${e}\n  got      ${a}`);
  };

  // Dates pinned by hand against the 2026 table this replaced. These are the regression net for
  // the timezone trap in the generator: read the greg date with toISOString() instead of local
  // parts and every one of these moves a day earlier.
  eq(calendarDay("2026-09-21").holidays[0]?.name, "יום כיפור", "Yom Kippur 5787 is 2026-09-21");
  eq(calendarDay("2026-04-02").holidays[0]?.name, "פסח א׳", "Pesach I 5786 is 2026-04-02");
  eq(calendarDay("2026-03-03").holidays[0]?.name, "פורים", "Purim 5786 is 2026-03-03");
  eq(calendarDay("2026-05-22").holidays[0]?.name, "שבועות", "Shavuot 5786 is 2026-05-22");
  eq(calendarDay("2026-07-23").holidays[0]?.name, "תשעה באב", "Tish'a B'Av 5786 is 2026-07-23");
  eq(calendarDay("2026-09-12").holidays[0]?.name, "ראש השנה", "Rosh Hashana 5787 is 2026-09-12");

  // Israel observance, not Diaspora: one day of yom tov, so 2026-04-03 is already chol hamoed
  // (in the Diaspora it would be Pesach II), and Shmini Atzeret is not followed by a second day.
  eq(calendarDay("2026-04-03").booking, "no-weddings", "chol hamoed pesach is not yom tov in Israel");
  eq(calendarDay("2026-10-03").holidays[0]?.name, "שמיני עצרת / שמחת תורה", "one day, both names");

  eq(calendarDay("2026-09-21").booking, "blocked", "nothing runs on Yom Kippur");
  eq(calendarDay("2026-04-01").booking, "blocked", "erev Pesach is gone by the afternoon");
  eq(calendarDay("2026-06-10").booking, "open", "an ordinary Wednesday in Sivan");

  // 5 Iyyar 5786 is a Wednesday, so neither day is postponed: Yom HaZikaron 4 Iyyar = 2026-04-21,
  // Yom HaAtzma'ut 5 Iyyar = 2026-04-22. The hand-written table this replaced had both a day early
  // and omitted Yom HaShoah — the kind of error a transcribed calendar makes and a computed one
  // cannot.
  eq(calendarDay("2026-04-21").holidays[0]?.name, "יום הזיכרון", "Yom HaZikaron 5786 is 2026-04-21");
  eq(calendarDay("2026-04-21").booking, "blocked", "halls closed by law");
  eq(calendarDay("2026-04-14").holidays[0]?.name, "יום השואה", "Yom HaShoah 5786 is 2026-04-14");
  eq(calendarDay("2026-04-14").booking, "blocked", "likewise");

  // Yom HaAtzma'ut is peak demand and still inside the Omer mourning band. Custom divides on
  // whether weddings are held; the calendar reports both facts rather than picking a side.
  eq(calendarDay("2026-04-22").holidays[0]?.name, "יום העצמאות", "Yom HaAtzma'ut 5786 is 2026-04-22");
  eq(calendarDay("2026-04-22").peak, true, "peak demand");
  eq(calendarDay("2026-04-22").booking, "no-weddings", "and still inside the Omer band");

  // The Omer boundary. Weddings resume ON Lag BaOmer, so the mourning band must stop the day
  // before it — a band that ran through would black out the busiest date in the seven weeks.
  eq(calendarDay("2026-05-04").booking, "no-weddings", "17 Iyyar is still in the mourning period");
  eq(calendarDay("2026-05-05").holidays[0]?.name, "ל״ג בעומר", "Lag BaOmer 5786 is 2026-05-05");
  eq(calendarDay("2026-05-05").booking, "open", "Lag BaOmer is the day weddings resume");
  eq(calendarDay("2026-05-05").peak, true, "and everyone books it at once");
  eq(
    calendarDay("2026-05-05").periods.map((p) => p.id),
    ["omer"],
    "Lag BaOmer is inside the Omer but outside the mourning band",
  );

  // בין המצרים: 17 Tammuz through 9 Av, with תשעת הימים nested inside it.
  eq(calendarDay("2026-07-02").periods.map((p) => p.id), ["three-weeks"], "17 Tammuz opens the three weeks");
  eq(calendarDay("2026-07-16").periods.map((p) => p.id), ["three-weeks", "nine-days"], "nested, outermost first");
  eq(calendarDay("2026-07-24").periods.length, 0, "the day after 9 Av is clear");

  // Two orthogonal axes: חול המועד is high demand AND closed to weddings. One enum could not say
  // both, which is why CalendarDay carries `booking` and `peak` separately.
  const cholHamoed = calendarDay("2026-04-05");
  eq(cholHamoed.booking, "no-weddings", "no weddings on chol hamoed");
  eq(cholHamoed.peak, true, "but every other kind of event wants that week");

  // Deferred fast: 9 Av 5789 falls on Shabbat, so the fast moves to Sunday and hebcal renames it
  // — the name it hands over is stored in visual order and is rewritten by the generator.
  const deferred = Object.entries(HOLIDAY_DAYS).find(([, ids]) =>
    ids.some((i) => HOLIDAY_DEFS[i].name.includes("נדחה")),
  );
  if (!deferred) throw new Error("expected at least one deferred Tish'a B'Av in 2025-2040");
  eq(HOLIDAY_DEFS.find((d) => d.name.includes("נדחה"))?.name, "תשעה באב (נדחה)", "written in logical order");

  for (const def of HOLIDAY_DEFS) {
    const open = (def.name.match(/\(/g) ?? []).length;
    const close = (def.name.match(/\)/g) ?? []).length;
    if (open !== close || def.name.startsWith("(")) throw new Error(`visual-order name: ${def.name}`);
  }

  eq(isCovered("2026-05-05"), true, "2026 is generated");
  eq(isCovered("2099-01-01"), false, "2099 is not — callers must not read silence as 'ordinary'");
  eq(calendarDay("2099-01-01").booking, "open", "and an uncovered date answers like an empty one");

  eq(
    periodsBetween("2026-07-20", "2026-07-31").map((p) => `${p.id} ${p.from}..${p.to}`),
    ["three-weeks 2026-07-20..2026-07-23", "nine-days 2026-07-20..2026-07-23"],
    "periods are clipped to the rendered range",
  );

  console.log(
    `calendar ok — ${HOLIDAY_DEFS.length} named days, ${Object.keys(HOLIDAY_DAYS).length} dates, ` +
      `${PERIODS.length} periods, ${COVERS.from}-${COVERS.to}`,
  );
}
