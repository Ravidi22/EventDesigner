// Build-time generator for lib/calendar/hebrew.generated.ts.  `npm run gen:calendar`
//
// WHY THIS IS A GENERATOR AND NOT A RUNTIME IMPORT
//
// @hebcal/core is the reference implementation of the Hebrew calendar and computes any year
// offline — but it is licensed GPL-2.0. The calendar renders in a "use client" component, so
// importing it there would ship GPL code to browsers, and shipping to browsers is distribution:
// exactly what triggers copyleft. Running it here, at build time, as a devDependency, and
// committing the plain data table it prints keeps GPL code out of the bundle entirely. Calendar
// dates are facts, and facts are not copyrightable, so the emitted table carries no license of
// its own. The app gets a dependency-free object lookup that also works offline and costs no
// network round-trip per month rendered.
//
// Re-run this when the range below needs to reach further out. That is the only maintenance.
import { writeFileSync } from "node:fs";
import { HDate, HebrewCalendar, flags, months, type Event } from "@hebcal/core";
import type { Booking, CalendarPeriod, HolidayDef } from "./types";

/** Gregorian years to emit. Wide enough that nobody has to think about this for a decade. */
const FROM_YEAR = 2025;
const TO_YEAR = 2040;

const OUT = new URL("./hebrew.generated.ts", import.meta.url);

// ── Date conversion ──────────────────────────────────────────────────────────────────────────
// LOCAL parts, never toISOString(). `HDate.greg()` returns local midnight, so on any timezone
// east of UTC (Israel included) toISOString() rolls the date back a day and silently produces a
// calendar where every holiday is 24h early. The self-check in hebrew.ts pins known dates so
// this can't regress.
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const hd = (day: number, month: number, year: number) => iso(new HDate(day, month, year).greg());

// ── What an event designer cares about ───────────────────────────────────────────────────────

// Civic observances: real days, no effect on whether a hall can be booked. Dropping them is the
// difference between a calendar that informs and one that cries wolf every other week. Delete a
// line here to let one back in.
const IGNORED = new Set([
  "Hebrew Language Day",
  "Family Day",
  "Yom HaAliyah",
  "Yom HaAliyah School Observance",
  "Herzl Day",
  "Jabotinsky Day",
  "Ben-Gurion Day",
  "Yitzhak Rabin Memorial Day",
  "Rosh Hashana LaBehemot",
  "Chag HaBanot",
  "Birkat Hachamah",
]);

// Chanukah is emitted as eight separate per-day events named by candle count ("Chanukah: 3
// Candles"), which is a lighting instruction, not a date name — and the count is off by one
// against the day it labels, since candle N is lit the evening that BEGINS day N. The `chanukah`
// period below already covers the same eight days with the one label a calendar cell wants, so
// the per-day rows are dropped rather than reworded.
const isChanukahDay = (desc: string) => desc.startsWith("Chanukah:");

// Israeli law closes places of entertainment on these two; they are not יום טוב, so the flags
// don't say so, but for a hall they are as closed as Yom Kippur.
const CLOSED_BY_LAW = new Set(["Yom HaZikaron", "Yom HaShoah"]);

// Days people compete to book. Deliberately short: a calendar that calls eight days a year "peak"
// is saying something; one that calls forty days peak is saying nothing. חול המועד and חנוכה are
// peak too, but as periods rather than named days.
const PEAK = new Set(["Purim", "Shushan Purim", "Lag BaOmer", "Yom HaAtzma'ut", "Tu B'Av"]);

// hebcal's Hebrew renderings are accurate but a few read oddly in a calendar cell.
const RENAME: Record<string, string> = {
  "Yom HaZikaron": "יום הזיכרון",
  "Yom HaShoah": "יום השואה",
  "Yom HaAtzma'ut": "יום העצמאות",
  "Yom Yerushalayim": "יום ירושלים",
  "Leil Selichot": "ליל סליחות",
  // Israel keeps one day here, and everyone calls it by the second name.
  "Shmini Atzeret": "שמיני עצרת / שמחת תורה",
  // hebcal ships this one in VISUAL order — its own locale data is literally "(תשעה באב (נדחה":
  // two opening parens, none closing, because it was typed into a left-to-right editor. Rendered
  // in an RTL page that comes out mangled. Written here in logical order instead. Applies to
  // years when 9 Av falls on Shabbat and the fast defers to Sunday (2029, 2032, …).
  "Tish'a B'Av (observed)": "תשעה באב (נדחה)",
};

/** Catch any other locale string stored in visual order before it reaches the app. Unbalanced
 *  parentheses are the tell — see the "Tish'a B'Av (observed)" note above. */
function assertLogicalOrder(name: string, desc: string): void {
  const open = (name.match(/\(/g) ?? []).length;
  const close = (name.match(/\)/g) ?? []).length;
  if (open !== close || name.startsWith("(")) {
    throw new Error(
      `visual-order Hebrew from @hebcal/core for ${JSON.stringify(desc)}: ${JSON.stringify(name)}\n` +
        `add a RENAME entry in lib/calendar/generate.mts writing it in logical order.`,
    );
  }
}

function nameOf(ev: Event): string {
  const desc = ev.getDesc();
  if (RENAME[desc]) return RENAME[desc];
  // "Rosh Hashana 5787" renders as "ראש השנה 5787" — the year number is noise in a day cell.
  if (desc.startsWith("Rosh Hashana 5")) return "ראש השנה";
  return ev.render("he-x-nonikud");
}

function bookingOf(ev: Event): Booking {
  const mask = ev.getFlags();
  if (CLOSED_BY_LAW.has(ev.getDesc())) return "blocked";
  // CHAG is יום טוב; MAJOR_FAST is יום כיפור and תשעה באב. EREV of a יום טוב is blocked in
  // practice too — the afternoon is gone and nobody starts an event into candle-lighting.
  if (mask & flags.CHAG || mask & flags.MAJOR_FAST) return "blocked";
  if (mask & flags.EREV && mask & flags.LIGHT_CANDLES) return "blocked";
  return "open";
}

// ── Periods: the "areas" ─────────────────────────────────────────────────────────────────────
//
// Built from fixed Hebrew dates rather than scraped out of the event stream, because a range's
// boundary is not always an event: בין המצרים starts on 17 Tammuz even in a year when the fast
// itself is deferred to the 18th.
//
// On ספירת העומר: the mourning window is a matter of custom (Ashkenazi and Sephardi practice
// diverge, and communities differ on the 33rd vs 34th day). This models the window in widest
// practical use by Israeli halls — from after Pesach through ל״ג בעומר — as ONE band, and leaves
// the ruling to the couple's rabbi. It is a booking hint, not a psak.
function periodsFor(hyear: number): CalendarPeriod[] {
  return [
    {
      id: "chol-hamoed-pesach",
      name: "חול המועד פסח",
      short: "חוה״מ פסח",
      booking: "no-weddings",
      peak: true,
      from: hd(16, months.NISAN, hyear),
      to: hd(20, months.NISAN, hyear),
    },
    {
      id: "omer",
      name: "ספירת העומר",
      short: "ספירת העומר",
      booking: "open",
      peak: false,
      from: hd(16, months.NISAN, hyear),
      to: hd(5, months.SIVAN, hyear),
    },
    {
      id: "omer-mourning",
      name: "ימי הספירה — מנהגי אבלות",
      short: "ימי הספירה",
      booking: "no-weddings",
      peak: false,
      // Starts the day after Pesach ends, not on 16 Nisan: 15 and 21 Nisan are יום טוב and 16–20
      // are חול המועד, all already closed to weddings by their own entries. Ends on 17 Iyyar —
      // the day BEFORE ל״ג בעומר (18 Iyyar, the 33rd day), because Lag BaOmer is precisely the
      // day weddings resume. Running the band through it would black out the one date in the
      // seven weeks that halls are fully booked.
      from: hd(22, months.NISAN, hyear),
      to: hd(17, months.IYYAR, hyear),
    },
    {
      id: "three-weeks",
      name: "בין המצרים",
      short: "בין המצרים",
      booking: "no-weddings",
      peak: false,
      from: hd(17, months.TAMUZ, hyear),
      to: hd(9, months.AV, hyear),
    },
    {
      id: "nine-days",
      name: "תשעת הימים",
      short: "תשעת הימים",
      booking: "no-weddings",
      peak: false,
      from: hd(1, months.AV, hyear),
      to: hd(9, months.AV, hyear),
    },
    {
      id: "chol-hamoed-sukkot",
      name: "חול המועד סוכות",
      short: "חוה״מ סוכות",
      booking: "no-weddings",
      peak: true,
      from: hd(16, months.TISHREI, hyear),
      to: hd(21, months.TISHREI, hyear),
    },
    {
      id: "chanukah",
      name: "חנוכה",
      short: "חנוכה",
      booking: "open",
      peak: true,
      from: hd(25, months.KISLEV, hyear),
      // Kislev is 29 or 30 days, so Chanukah ends on 2 or 3 Tevet. Counting 7 days forward from
      // the first lands on the eighth whichever kind of year it is.
      to: iso(new HDate(25, months.KISLEV, hyear).add(7, "d").greg()),
    },
  ];
}

// ── Emit ─────────────────────────────────────────────────────────────────────────────────────

function main(): void {
  // Holiday definitions are deduplicated by name: פורים is classified once, not sixteen times.
  const defs: HolidayDef[] = [];
  const defIndex = new Map<string, number>();
  const days = new Map<string, number[]>();

  for (let year = FROM_YEAR; year <= TO_YEAR; year++) {
    for (const ev of HebrewCalendar.calendar({ year, isHebrewYear: false, il: true })) {
      const desc = ev.getDesc();
      if (IGNORED.has(desc) || isChanukahDay(desc)) continue;
      // Saturday already reads as Saturday in the grid; naming שבת שירה adds nine rows a year and
      // changes no booking decision.
      if (ev.getFlags() & flags.SPECIAL_SHABBAT) continue;

      const name = nameOf(ev);
      assertLogicalOrder(name, desc);
      let idx = defIndex.get(name);
      if (idx === undefined) {
        idx = defs.length;
        defIndex.set(name, idx);
        defs.push({ name, booking: bookingOf(ev), peak: PEAK.has(desc) });
      }
      const key = iso(ev.greg());
      const list = days.get(key);
      if (list) {
        if (!list.includes(idx)) list.push(idx);
      } else days.set(key, [idx]);
    }
  }

  const firstHYear = new HDate(new Date(FROM_YEAR, 0, 1)).yy;
  const lastHYear = new HDate(new Date(TO_YEAR, 11, 31)).yy;
  const periods: CalendarPeriod[] = [];
  for (let hyear = firstHYear; hyear <= lastHYear; hyear++) {
    for (const p of periodsFor(hyear)) {
      // Clip to the emitted window: the first and last Hebrew years straddle it.
      if (p.to < `${FROM_YEAR}-01-01` || p.from > `${TO_YEAR}-12-31`) continue;
      periods.push(p);
    }
  }
  periods.sort((a, b) => (a.from === b.from ? b.to.localeCompare(a.to) : a.from.localeCompare(b.from)));

  const sortedDays = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const j = JSON.stringify;

  const out = `// GENERATED FILE — do not edit by hand. Run \`npm run gen:calendar\` (lib/calendar/generate.mts).
//
// Israeli observance (\`il: true\`), Gregorian ${FROM_YEAR}–${TO_YEAR}, computed with @hebcal/core —
// which stays a devDependency so its GPL-2.0 code never reaches the browser bundle. See the header
// of generate.ts for why. Read this through lib/calendar/hebrew.ts, not directly.
import type { CalendarPeriod, HolidayDef } from "./types";

export const COVERS = { from: ${FROM_YEAR}, to: ${TO_YEAR} } as const;

/** Each named day, classified once. HOLIDAY_DAYS indexes into this. */
export const HOLIDAY_DEFS: readonly HolidayDef[] = [
${defs.map((d) => `  { name: ${j(d.name)}, booking: ${j(d.booking)}, peak: ${d.peak} },`).join("\n")}
];

/** ISO date → indices into HOLIDAY_DEFS. */
export const HOLIDAY_DAYS: Readonly<Record<string, readonly number[]>> = {
${sortedDays.map(([k, v]) => `  ${j(k)}: [${v.join(", ")}],`).join("\n")}
};

/** Ranges, sorted by start then by descending length, so the outermost band comes first. */
export const PERIODS: readonly CalendarPeriod[] = [
${periods
  .map((p) => `  { id: ${j(p.id)}, name: ${j(p.name)}, short: ${j(p.short)}, booking: ${j(p.booking)}, peak: ${p.peak}, from: ${j(p.from)}, to: ${j(p.to)} },`)
  .join("\n")}
];
`;

  writeFileSync(OUT, out, "utf8");
  console.log(
    `wrote ${OUT.pathname.replace(/^\//, "")}\n` +
      `  ${defs.length} named days, ${sortedDays.length} dated entries, ${periods.length} periods, ${FROM_YEAR}–${TO_YEAR}\n` +
      `  ${(out.length / 1024).toFixed(1)} KB`,
  );
}

main();
