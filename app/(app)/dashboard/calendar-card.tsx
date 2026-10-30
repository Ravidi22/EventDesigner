"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, Lock, Plus, Sparkles } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, eventProgress, eventStatus, zonesLabelOf } from "@/lib/events/types";
import type { Appointment } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL, appointmentLabel, appointmentTimeLabel, byDate } from "@/lib/appointments/types";
import type { BusyBlock } from "@/lib/google/types";
import type { BusyHandle } from "@/lib/google/use-busy";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { IconButton } from "@/components/icon-button";
import { Menu, type MenuItem } from "@/components/menu";
import { GoogleMark } from "@/components/google-mark";
import { BOOKING_LABEL, calendarDay } from "@/lib/calendar/hebrew";
import {
  addDays,
  addMonths,
  sameDay,
  sameWeek,
  toISODate,
  weekGrid,
  weekLabel,
  monthGrid,
  monthLabel,
  NOTE_THEME,
  noteTone,
  STATUS_CARD_THEME,
  KIND_ICON,
  kindTheme,
  PAST_DAY_FILL,
  PAST_DAY_HATCH,
  type CardTone,
} from "./dashboard-view-utils";

/** What an event's card says about where it stands: the word, its tone, and — for a designer's
 *  event, which moves through a meeting — how far along it is. A hall's booking has no progress;
 *  its status is the whole story (lib/hosting bookingStatus). */
export interface EventLook {
  label: string;
  tone: CardTone;
  progress?: number;
  /** A date that is no longer held — a lapsed option, an evening that did not close. */
  struck?: boolean;
}

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

// A day's calendar note, resolved for rendering.
//
// The band is drawn on EVERY day inside a period but labelled only where the period starts or
// where a grid row starts — the same rule a multi-day event follows in any calendar app. That is
// what makes ספירת העומר or בין המצרים read as one continuous area rather than as the same words
// stamped into forty consecutive cells.
//
// Only the innermost period gets a band. תשעת הימים sits inside בין המצרים, and stacking both
// would spend a third of the cell's height restating the outer one; the tooltip carries the full
// nesting instead.
function dayNotes(days: Date[]) {
  let previousPeriodId: string | undefined;

  return days.map((d, i) => {
    const iso = toISODate(d);
    const day = calendarDay(iso);
    const period = day.periods[day.periods.length - 1];

    // Label wherever a visual run of band begins: at a row's leading edge (column 0, which RTL
    // lays out on the right — where a Hebrew reader starts), and wherever the band stops being
    // the same period as the cell before it. That second test is doing more than catching a
    // period's first day: ימי הספירה gives way to plain ספירת העומר on ל״ג בעומר mid-row, and
    // without it the bar would keep flying the label of a period that had already ended.
    const startsRun = period !== undefined && (period.id !== previousPeriodId || i % 7 === 0);
    previousPeriodId = period?.id;

    if (day.holidays.length === 0 && period === undefined) return undefined;

    const parts = [...day.holidays.map((h) => h.name), ...day.periods.map((p) => p.name)];
    if (day.booking !== "open") parts.push(BOOKING_LABEL[day.booking]);

    return {
      // Two themes, deliberately. The chip answers for the DAY, so ל״ג בעומר shows accent even
      // though it sits inside the Omer. The band answers for the PERIOD, so it keeps one color
      // along its whole length instead of flaring up on whichever day inside it happens to be
      // peak or blocked.
      chipTheme: NOTE_THEME[noteTone(day.booking, day.peak)],
      bandTheme: period && NOTE_THEME[noteTone(period.booking, period.peak)],
      holiday: day.holidays[0]?.name,
      period,
      showPeriodLabel: startsRun,
      title: parts.join(" · "),
    };
  });
}

type Mode = "week" | "month";

// "השבוע שלי" / "החודש שלי" (F-1.1): one card, two grids. MONTH is the default: the dashboard
// is the first thing opened in the morning, and the question it gets asked is "what is coming" —
// which a week answers only until Thursday. Week is the toggle now, for the days actually in
// hand. There is no venue filter here anymore — `events` arrives from the parent already scoped
// to whichever venue is active in the sidebar, the one place that scoping decision lives.
// `onOpenEvent` is likewise supplied by the parent; each event's own card color comes from `STATUS_CARD_THEME`,
// keyed to its status, so no external color resolver is needed here.
//
// TWO KINDS OF THING LAND IN A DAY, and they now wear ONE CARD. An EVENT is the wedding — filled in
// its status colour, with a progress bar, because it is a body of work. A DIARY ENTRY is an hour in
// a diary, filled in its KIND's colour — a sit-down, an אילוץ, a חופשה, a delivery — because what
// kind of thing it is, is the only fact it has to give. Same radius, same padding, same type sizes:
// a day's contents read as one list of what is happening, not as two competing widget styles.
//
// (This is a deliberate reversal. The diary entry used to be a thin outlined chip, drawn unlike an
// event on purpose so the two could be told apart at arm's length. Both now wear a 3px hue rail and
// a leading glyph — the event's ✦, a diary entry its kind's — and the difference is carried by the
// card's CONTENT rather than by giving one species a second-class shape.)
//
// Clicking an event opens its drawer; clicking a diary card opens it for editing; and the day's own
// "+" books a new one on that date, which is the write this calendar never had.
export function CalendarCard({
  events,
  appointments,
  busy,
  onOpenEvent,
  onOpenAppointment,
  onCreateAppointment,
  look,
  summary,
  addItems,
  suggestGoogle = false,
}: {
  events: EventSummary[];
  appointments: Appointment[];
  /** The designer's own Google entries (lib/google/use-busy.ts). An OVERLAY: it never gains a click
   *  handler and never counts as the studio's work — see BusyChip below. */
  busy: BusyHandle;
  onOpenEvent: (e: EventSummary) => void;
  onOpenAppointment: (a: Appointment) => void;
  /** Book a meeting on this ISO date — the day the designer clicked. */
  onCreateAppointment: (iso: string) => void;
  /** How an event's card reads. Absent = a designer's: its meeting status and progress. A hall
   *  passes its booking status (app/(app)/dashboard/venue-dashboard.tsx). */
  look?: (e: EventSummary) => EventLook;
  /** The line under the title for the range on screen. Absent = how many events and diary entries. */
  summary?: (range: { from: string; to: string; events: EventSummary[] }) => ReactNode;
  /** What a day's "+" offers. Absent = it books a meeting on the day; a hall offers an evening too. */
  addItems?: (iso: string) => MenuItem[];
  /** Google can be connected on this deployment and this person has not (or has the pull off):
   *  the header offers the way to settings → יומן Google. */
  suggestGoogle?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  // Read once here, not in each card: a month view renders dozens of them, all measuring progress
  // against the same configured meeting flow.
  const flow = useMeetingFlow();
  const lookOf = (e: EventSummary): EventLook => {
    if (look) return look(e);
    const status = eventStatus(e, flow);
    return { label: STATUS_LABEL[status], tone: STATUS_TONE[status], progress: eventProgress(e, flow) };
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const todayIso = toISODate(today);

  useEffect(() => {
    if (!expandedDate) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setExpandedDate(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedDate(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expandedDate]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventSummary[]>();
    for (const e of events) {
      if (!e.date) continue;
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    return map;
  }, [events]);

  // Same shape, but the grouping (and the within-day sort into clock order) is shared logic — a
  // meeting's day is required, so there is no "not set yet" to skip the way an event has.
  const appointmentsByDate = useMemo(() => byDate(appointments), [appointments]);

  const days = mode === "week" ? weekGrid(anchor) : monthGrid(anchor);
  // Ask Google for whatever this grid is showing. In an effect rather than during render, because
  // it can set state; `ensureRange` is idempotent and returns immediately when the range is already
  // loaded, so the cost of running it on every navigation is a string comparison.
  const firstDay = toISODate(days[0]);
  const lastDay = toISODate(days[days.length - 1]);
  useEffect(() => {
    busy.ensureRange(firstDay, lastDay);
  }, [busy, firstDay, lastDay]);
  // One pass for the whole grid, not per cell: a band's label depends on the cell before it.
  const notes = dayNotes(days);
  const rangeLabel = mode === "week" ? weekLabel(days) : monthLabel(anchor);
  const maxVisible = mode === "week" ? Infinity : 2;
  // The range the summary speaks for: the month itself in month mode (not the spill-over days of
  // the weeks either side), the seven days in week mode.
  const rangeDays = mode === "week" ? days : days.filter((d) => d.getMonth() === anchor.getMonth());
  const range = { from: toISODate(rangeDays[0]), to: toISODate(rangeDays[rangeDays.length - 1]) };
  const rangeEvents = events.filter((e) => e.date && e.date >= range.from && e.date <= range.to);
  const rangeMeetings = appointments.filter((a) => a.date >= range.from && a.date <= range.to);
  const summaryLine = summary
    ? summary({ ...range, events: rangeEvents })
    : `${rangeEvents.length} אירועים · ${rangeMeetings.length} רשומות ביומן`;
  const weeks = days.length / 7;

  const step = (n: number) => {
    setExpandedDate(null);
    setAnchor((d) => (mode === "week" ? addDays(d, n * 7) : addMonths(d, n)));
  };
  const switchMode = (m: Mode) => {
    setMode(m);
    setExpandedDate(null);
  };
  const goToday = () => {
    setExpandedDate(null);
    setAnchor(new Date());
  };
  // "היום" is dead when today is already on screen. In week mode that is now a same-week test
  // rather than a same-day one: the grid snaps to Sunday, so any anchor inside this week shows it.
  const isCurrentRange =
    mode === "week"
      ? sameWeek(anchor, today)
      : anchor.getMonth() === today.getMonth() && anchor.getFullYear() === today.getFullYear();

  return (
    <div ref={rootRef} className="rounded-lg border border-border bg-surface px-3 py-5">
      {/* NO TITLE, THE MONTH IS THE HEADING (2026-10-30, the user: "remove the title 'החודש שלי' and
          put the month navigator like in billing"). The range itself stands where the title stood,
          between its two arrows in the /billing screen's own shape (app/(app)/billing/billing-
          screen.tsx) — → is the previous month in an RTL app, the arrows point where the months
          go — with the range's figures under it; the view and "היום" at the other end. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <IconButton label={mode === "week" ? "השבוע הקודם" : "החודש הקודם"} onClick={() => step(-1)}>
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </IconButton>
            <h3 className="min-w-[9rem] text-center font-display text-h2 text-ink">{rangeLabel}</h3>
            <IconButton label={mode === "week" ? "השבוע הבא" : "החודש הבא"} onClick={() => step(1)}>
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </IconButton>
          </div>
          <p className="nums mt-0.5 ps-9 text-sm text-muted">{summaryLine}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The calendar is half a picture until the person's own Google entries are on it (the
              busy blocks below are how a day that looks free is not quietly double-booked). Gone
              once the pull is on; never shown where the server has no Google set up — settings
              would only say so. */}
          {suggestGoogle && (
            <Link
              href="/settings#calendar"
              aria-label="חיבור יומן Google"
              title="חיבור יומן Google — הפגישות שלך יופיעו ביומן הזה, והיומן יופיע ב-Google"
              className="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-border bg-canvas transition-colors hover:border-accent-line hover:bg-accent-tint"
            >
              <GoogleMark className="h-4 w-4" />
            </Link>
          )}
          <button
            type="button"
            onClick={goToday}
            disabled={isCurrentRange}
            className="rounded-pill border border-border px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-accent-hover disabled:cursor-default disabled:opacity-50 disabled:hover:text-ink-soft"
          >
            היום
          </button>
          <div className="flex gap-1 rounded-pill bg-bg p-1">
            {(["week", "month"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                aria-pressed={mode === m}
                className={
                  "rounded-pill px-3.5 py-1.5 text-sm transition-colors " +
                  (mode === m
                    ? "bg-surface font-semibold text-accent-hover shadow-floating"
                    : "text-ink-soft hover:text-accent-hover")
                }
              >
                {m === "week" ? "שבוע" : "חודש"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        {/* ONE GRID OF HAIRLINES (2026-10-30, the user: "why are the calendars different? some of the
            new calendar UI is good and looks clean"). The hall's month grid was the cleaner one —
            the weekday named once over its column instead of in all 42 cells, the days joined by
            hairlines rather than floating as 42 separate wells, one line per card — and the
            designer's had what the hall's lacked: week mode, the Hebrew calendar's periods as bands,
            Google's busy blocks, "היום". This is the two, one component, for both businesses.
            `min-w` holds the columns legible on a tablet; the wrapper scrolls sideways instead. */}
        <div className="min-w-[860px] rounded-md border border-border-soft">
          <div className="grid grid-cols-7 rounded-t-md border-b border-border-soft bg-inset">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-2 text-center text-xs font-semibold text-muted">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const iso = toISODate(d);
              const dayEvents = eventsByDate.get(iso) ?? [];
              const dayAppointments = appointmentsByDate.get(iso) ?? [];
              const dayBusy = busy.byDate.get(iso) ?? [];
              const isToday = sameDay(d, today);
              const isPast = !isToday && iso < todayIso;
              const inMonth = mode === "week" || d.getMonth() === anchor.getMonth();
              const col = i % 7;
              const lastRow = Math.floor(i / 7) === weeks - 1;
              // Each kind gets its own allowance rather than sharing one, so a day with three
              // meetings on it can't push the wedding out of its own cell.
              const visible = dayEvents.slice(0, maxVisible);
              const visibleAppointments = dayAppointments.slice(0, maxVisible);
              // ONE busy block visible in a month cell. These are the designer's private errands, not
              // the studio's work: they earn a place so a day that looks free is not quietly
              // double-booked, and they must not be the reason a wedding is hidden.
              const visibleBusy = dayBusy.slice(0, mode === "week" ? maxVisible : 1);
              // One "+N נוספים" for the whole day, counting every kind.
              const overflow =
                dayEvents.length - visible.length +
                (dayAppointments.length - visibleAppointments.length) +
                (dayBusy.length - visibleBusy.length);
              const isExpanded = expandedDate === iso;
              const note = notes[i];
              const dayLabel = d.toLocaleDateString("he-IL", { day: "numeric", month: "long" });

              return (
                <div
                  key={iso}
                  // A past day is crossed by a faint diagonal hatch — the cell's own background-image,
                  // so it lies UNDER the day's number and whatever the day held (dashboard-view-utils).
                  style={isPast ? PAST_DAY_HATCH : undefined}
                  className={
                    "group relative flex min-w-0 flex-col gap-1 border-border-soft p-1.5 " +
                    (mode === "week" ? "min-h-44 " : "min-h-32 ") +
                    (col !== 6 ? "border-e " : "") +
                    (!lastRow ? "border-b " : "") +
                    // The grid's rounded corners without clipping it: a day's "+" menu has to be
                    // able to open past the cell it stands in.
                    (lastRow && col === 0 ? "rounded-es-md " : "") +
                    (lastRow && col === 6 ? "rounded-ee-md " : "") +
                    (isToday ? "bg-accent-tint/50" : !inMonth ? "bg-bg/60" : isPast ? PAST_DAY_FILL : "")
                  }
                >
                  {/* A fixed height: a day that offers "+" (a 28px button, hidden at rest) and a past
                      day that does not would otherwise centre their dates 2px apart. */}
                  <div className="flex h-7 items-center justify-between gap-1">
                    <span
                      className={
                        "nums inline-flex h-6 min-w-6 items-center justify-center rounded-pill px-1 text-xs font-semibold " +
                        (isToday ? "bg-accent text-canvas" : inMonth ? "text-ink-soft" : "text-faint")
                      }
                    >
                      {d.getDate()}
                    </span>
                    {/* The write, beside the day it writes to. Quiet until the day is hovered so 42
                        plus signs don't compete with the month (shown at rest on every free day of a
                        hall's, they did) — never `hidden`: focus brings it back, and focus-within
                        keeps it while its menu is open. NOT ON A DAY THAT HAS BEEN AND GONE; today
                        still offers it. */}
                    {!isPast && (
                      <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {addItems ? (
                          <Menu
                            label={`הוספה ב־${dayLabel}`}
                            icon={Plus}
                            items={addItems(iso)}
                            side={lastRow && mode === "month" ? "top" : "bottom"}
                          />
                        ) : (
                          <IconButton label={`הוספה ליומן ב־${dayLabel}`} onClick={() => onCreateAppointment(iso)}>
                            <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                          </IconButton>
                        )}
                      </span>
                    )}
                  </div>

                  {note?.period && (
                    // Full-bleed against the cell's own p-1.5, so consecutive days join into one bar
                    // across the row. Height stays fixed whether or not this cell carries the label.
                    <div
                      className={"-mx-1.5 flex h-[18px] shrink-0 items-center px-2 " + (note.bandTheme?.band ?? "")}
                      title={note.title}
                    >
                      {note.showPeriodLabel && (
                        <span className="truncate text-[11px] font-bold leading-none">{note.period.short}</span>
                      )}
                    </div>
                  )}

                  {note?.holiday && (
                    <span
                      className={"flex items-center gap-1.5 rounded-sm px-1.5 py-1 " + note.chipTheme.chip}
                      title={note.title}
                    >
                      <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + note.chipTheme.dot} aria-hidden />
                      <span className="truncate text-[11px] font-bold leading-none">{note.holiday}</span>
                    </span>
                  )}

                  {/* A past day's cards fade a little, but only a little: the hatch behind them is
                      already saying "this is behind us". */}
                  <div className={"flex flex-col gap-1.5" + (isPast ? " opacity-85" : "")}>
                    {(isExpanded ? dayEvents : visible).map((e) => (
                      <EventCard key={e.id} event={e} look={lookOf(e)} compact={mode === "month"} onClick={() => onOpenEvent(e)} />
                    ))}
                    {(isExpanded ? dayAppointments : visibleAppointments).map((a) => (
                      <AppointmentChip
                        key={a.id}
                        appointment={a}
                        compact={mode === "month"}
                        onClick={() => onOpenAppointment(a)}
                      />
                    ))}
                    {(isExpanded ? dayBusy : visibleBusy).map((b) => (
                      <BusyChip key={b.id} block={b} compact={mode === "month"} />
                    ))}
                    {overflow > 0 && (
                      // Expands IN PLACE — the row grows and every cell in it stretches to match. A
                      // floating panel here once hung off the grid's last column and was clipped by
                      // the very wrapper that keeps the columns legible.
                      <button
                        type="button"
                        onClick={() => setExpandedDate(isExpanded ? null : iso)}
                        className="rounded-sm px-1.5 py-0.5 text-start text-[11px] font-medium text-muted hover:text-accent-hover"
                      >
                        {isExpanded ? "הצג פחות" : `+${overflow} נוספים`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// A diary entry in a day cell. THE SAME CARD AN EVENT GETS — same radius, same padding, same type
// sizes, the same lift on hover — because a designer scanning a day wants to read what is happening
// on it, not to decode two widget vocabularies. What differs is what each card can honestly say: an
// event's second line ends in a status word over a progress bar, and a diary entry has neither (an
// hour in a diary has no stages to be at), so it spends its lines on the note and the kind.
//
// COLOUR IS THE KIND HERE, not the status — see KIND_CARD_THEME. The fill is the kind's tint, the
// leading 3px rail is the kind's full hue, and the icon is its glyph. The glyph is the tell between
// the species: an event always wears ✦, which no kind uses, so a wedding and a walkthrough sitting
// in one cell in two greens are still not the same object.
//
// A held meeting (`done`) goes grey with a tick rather than disappearing: the record of having met
// is most of what makes a diary worth keeping, and a past date is not the same claim (see the column
// note in lib/db/schema.ts).
// The cards are the ones the designer's calendar always had (the user, 2026-10-30, after a pass that
// cut them to one line: "I liked how the event/meeting tiles were before — revert it").
const CHIP_SIZE = {
  compact: { card: "gap-1.5 rounded-md p-2", icon: "h-3 w-3", name: "text-xs", time: "text-[11px]", meta: "text-[10px]" },
  full: { card: "gap-2 rounded-md p-2.5", icon: "h-3.5 w-3.5", name: "text-sm", time: "text-xs", meta: "text-xs" },
} as const;

function AppointmentChip({
  appointment: a,
  compact,
  onClick,
}: {
  appointment: Appointment;
  compact: boolean;
  onClick: () => void;
}) {
  const time = appointmentTimeLabel(a);
  const name = appointmentLabel(a);
  const kind = APPOINTMENT_KIND_LABEL[a.kind];
  const theme = kindTheme(a.kind, a.done);
  const Icon = a.done ? CheckCircle2 : KIND_ICON[a.kind];
  const size = compact ? CHIP_SIZE.compact : CHIP_SIZE.full;
  // The kind only earns a line (or a place in the tooltip) when it isn't already the name: a חופשה
  // has no client, so `appointmentLabel` falls back to the kind, and "חופשה · חופשה" is not a
  // tooltip. The icon and the colour are still saying which kind it is either way.
  const namesItself = name === kind;
  const parts = [name, namesItself ? "" : kind, time, a.note].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onClick}
      title={parts.join(" · ")}
      className={
        "flex flex-col border-s-[3px] text-start transition-transform hover:-translate-y-px hover:shadow-floating " +
        size.card + " " + theme.bg + " " + theme.rail
      }
    >
      <div className={"flex items-center " + (compact ? "gap-1.5" : "gap-2")}>
        <Icon className={size.icon + " shrink-0 " + theme.text} strokeWidth={2} />
        <span
          className={
            "min-w-0 flex-1 truncate font-semibold " + size.name + " " +
            (a.done ? "text-muted line-through" : "text-ink")
          }
        >
          {name}
        </span>
        {time && (
          <span className={"nums shrink-0 font-semibold " + size.time + " " + theme.text} dir="ltr">
            {time}
          </span>
        )}
      </div>
      {/* The note is a WEEK-VIEW line. A month cell already carries up to two of these cards plus
          two event cards, and every line one of them grows is a line all 42 cells grow with it —
          the note is the first thing that can go, because the tooltip still has it and the month is
          a scanning view. Week has the room and is where the day is actually being worked. */}
      {!compact && a.note && <span className={"truncate text-ink-soft " + size.meta}>{a.note}</span>}
      {!namesItself && <span className={"truncate font-semibold " + size.meta + " " + theme.text}>{kind}</span>}
    </button>
  );
}

// An entry from the designer's OWN Google calendar (lib/google/). The quietest thing that can
// appear in a day cell, and deliberately so.
//
// ⚠ NOT A BUTTON. Every other card in this grid is clickable because it belongs to the studio and
// can be opened, edited or advanced. This one is somebody's dentist appointment: there is nothing
// in this app to open, and making it look pressable would promise a screen that does not exist. It
// is a `div` with a tooltip, and that is the whole interaction.
//
// It is also the only card here with NO hue. Events carry their status colour and diary entries
// carry their kind's; both of those are the studio's own vocabulary, and lending a piece of it to
// an external event would say this is one of ours. Grey, dashed, with a lock glyph — present
// enough that a day which looks free is not quietly double-booked, recessive enough that it never
// competes with the work.
function BusyChip({ block, compact }: { block: BusyBlock; compact: boolean }) {
  const size = compact ? CHIP_SIZE.compact : CHIP_SIZE.full;
  // LRM before the range, same as appointmentTimeLabel: an en dash between two Latin-digit clock
  // times flips to the wrong side in an RTL paragraph and reads as 18:30-17:00.
  const time = block.time ? (block.endTime ? `‎${block.time}–${block.endTime}` : `‎${block.time}`) : "";

  return (
    <div
      title={[block.title, time, block.calendarName, "מיומן Google"].filter(Boolean).join(" · ")}
      className={
        "flex items-center border border-dashed border-border bg-inset/60 " +
        size.card + " " + (compact ? "gap-1.5" : "gap-2")
      }
    >
      <Lock className={size.icon + " shrink-0 text-faint"} strokeWidth={1.8} aria-hidden />
      <span className={"min-w-0 flex-1 truncate font-medium text-muted " + size.name}>{block.title}</span>
      {time && (
        <span className={"nums shrink-0 font-medium text-faint " + size.time} dir="ltr">
          {time}
        </span>
      )}
    </div>
  );
}

// THE DIARY CARD'S SHAPE (2026-10-30, the user: "improve it to look a bit more compact and more like
// the meeting bubble"). Same rail, same leading glyph, same first line — name, then the hour — and
// the same second line, here the zones with the status word at its end. The progress (a designer's
// event only) is a slim bar under them: in a month cell without its number, which the tooltip still
// carries; in a week cell, where the day is worked, with it. Four lines became two and a hairline.
function EventCard({ event: e, look, compact, onClick }: { event: EventSummary; look: EventLook; compact: boolean; onClick: () => void }) {
  const theme = STATUS_CARD_THEME[look.tone];
  const size = compact ? CHIP_SIZE.compact : CHIP_SIZE.full;
  const where = zonesLabelOf(e);
  const title = [e.clientName, where, e.time, look.progress !== undefined ? `${look.progress}%` : "", look.label].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        "flex flex-col border-s-[3px] text-start transition-transform hover:-translate-y-px hover:shadow-floating " +
        size.card + " " + theme.bg + " " + theme.rail
      }
    >
      <div className={"flex items-center " + (compact ? "gap-1.5" : "gap-2")}>
        <Sparkles className={size.icon + " shrink-0 " + theme.text} strokeWidth={2} />
        <span
          className={
            "min-w-0 flex-1 truncate font-semibold " + size.name + " " +
            (look.struck ? "text-muted line-through" : "text-ink")
          }
        >
          {e.clientName}
        </span>
        {e.time && <span className={"nums shrink-0 font-semibold " + size.time + " " + theme.text}>{e.time}</span>}
      </div>
      <div className={"flex items-center " + (compact ? "gap-1.5" : "gap-2")}>
        <span className={"min-w-0 flex-1 truncate text-ink-soft " + size.meta}>{where}</span>
        <span className={"shrink-0 font-semibold " + size.meta + " " + theme.text}>{look.label}</span>
      </div>
      {look.progress !== undefined && (
        <div className="flex items-center gap-2">
          <div className={"min-w-0 flex-1 overflow-hidden rounded-full bg-canvas/70 " + (compact ? "h-[3px]" : "h-1")}>
            <div className={"h-full rounded-full " + theme.bar} style={{ width: `${look.progress}%` }} />
          </div>
          {!compact && <span className={"nums shrink-0 font-bold " + size.meta + " " + theme.text}>{look.progress}%</span>}
        </div>
      )}
    </button>
  );
}
