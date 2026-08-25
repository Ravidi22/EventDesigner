"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Lock, Plus } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, eventProgress, eventStatus, zonesLabelOf } from "@/lib/events/types";
import type { Appointment } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL, appointmentLabel, appointmentTimeLabel, byDate } from "@/lib/appointments/types";
import type { BusyBlock } from "@/lib/google/types";
import type { BusyHandle } from "@/lib/google/use-busy";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import type { MeetingStepId } from "@/lib/meeting/steps";
import { IconButton } from "@/components/icon-button";
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
} from "./dashboard-view-utils";

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
// event on purpose so the two could be told apart at arm's length. They still can be — by the kind
// icon and the 3px hue rail that only a diary card wears — but the difference is now carried by the
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
}) {
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  // Read once here, not in each card: a month view renders dozens of them, all measuring progress
  // against the same configured meeting flow.
  const flow = useMeetingFlow();
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
  const title = mode === "week" ? "השבוע שלי" : "החודש שלי";
  const rangeLabel = mode === "week" ? weekLabel(days) : monthLabel(anchor);
  const maxVisible = mode === "week" ? Infinity : 2;

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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-2">
        <h3 className="font-display text-h2 text-ink">{title}</h3>

        <div className="flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            onClick={goToday}
            disabled={isCurrentRange}
            className="rounded-pill border border-border px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-accent-hover disabled:cursor-default disabled:opacity-50 disabled:hover:text-ink-soft"
          >
            היום
          </button>
          <IconButton label={mode === "week" ? "השבוע הקודם" : "החודש הקודם"} onClick={() => step(-1)}>
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </IconButton>
          <span className="min-w-32 text-center text-sm font-medium text-ink-soft">{rangeLabel}</span>
          <IconButton label={mode === "week" ? "השבוע הבא" : "החודש הבא"} onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={2} />
          </IconButton>
        </div>
      </div>

      {/* Seven columns don't get to shrink to nothing. The sidebar is a fixed 258px and does not
          collapse on its own, so at a 768px tablet — which docs/01 names as a real device for this
          app — an unconstrained `grid-cols-7` lands on ~53px cells: narrower than the "+ פגישה"
          button's own label, let alone a client's name. `min-w` holds the columns at a legible
          ~118px and this wrapper scrolls sideways instead, the same pattern the team table already
          uses (settings/team-section.tsx). Above ~1200px there is nothing to scroll and the grid
          simply fills the card.
          `pb-1` is for the scrollbar itself: `overflow-x-auto` reserves no room for it, so without
          the padding it sits on top of the last row's cards on the platforms that draw one. */}
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[860px] grid-cols-7 gap-2">
          {days.map((d, i) => {
            const iso = toISODate(d);
            const dayEvents = eventsByDate.get(iso) ?? [];
            const dayAppointments = appointmentsByDate.get(iso) ?? [];
            const dayBusy = busy.byDate.get(iso) ?? [];
            const isToday = sameDay(d, today);
            const isPast = !isToday && iso < todayIso;
            const inMonth = mode === "week" || d.getMonth() === anchor.getMonth();
            // Each kind gets its own allowance rather than sharing one, so a day with three meetings on
            // it can't push the wedding out of its own cell.
            const visible = dayEvents.slice(0, maxVisible);
            const visibleAppointments = dayAppointments.slice(0, maxVisible);
            // ONE busy block visible in a month cell, not two. These are the designer's private
            // errands, not the studio's work: they earn a place in the cell so a day that looks free
            // is not quietly double-booked, and they must not be the reason a wedding is hidden.
            const visibleBusy = dayBusy.slice(0, mode === "week" ? maxVisible : 1);
            // One "+N נוספים" for the whole day, counting both kinds — a cell with two hidden meetings
            // and one hidden event has three more things in it, and that is what it should say.
            const overflow =
              dayEvents.length - visible.length +
              (dayAppointments.length - visibleAppointments.length) +
              (dayBusy.length - visibleBusy.length);
            const isExpanded = expandedDate === iso;
            const note = notes[i];

            return (
              <div
                key={iso}
                // A past day is crossed by a faint diagonal hatch and sits a whisper — not a step —
                // under a live day: struck through rather than dimmed down. The hatch is the cell's
                // own background-image, so it lies UNDER the day's numbers and under whatever the
                // day held (see the note in dashboard-view-utils.ts) — the date and the weekday keep
                // their ordinary inks, because history is quieter than today, not less readable
                // than today.
                style={isPast ? PAST_DAY_HATCH : undefined}
                className={
                  "group relative flex flex-col gap-2 rounded-md px-1.5 py-2 " +
                  (mode === "week" ? "min-h-44" : "min-h-40") + " " +
                  (isPast ? PAST_DAY_FILL : isToday ? "bg-accent-tint" : inMonth ? "bg-inset" : "bg-inset/50")
                }
              >
                <div className="flex items-center justify-between px-1">
                  <span className={"text-xs font-medium " + (inMonth ? "text-muted" : "text-faint")}>
                    {d.toLocaleDateString("he-IL", { weekday: "short" })}
                  </span>
                  <span
                    className={
                      "nums flex h-6 w-6 items-center justify-center rounded-full text-xs " +
                      (isToday ? "bg-accent font-semibold text-canvas" : inMonth ? "text-ink-soft" : "text-faint")
                    }
                  >
                    {d.getDate()}
                  </span>
                </div>

                {note?.period && (
                  // Full-bleed against the cell's own px-1.5, so consecutive days join into one bar
                  // across the row. Height stays fixed whether or not this cell carries the label,
                  // otherwise the band would step up and down along its own length.
                  <div
                    className={"-mx-1.5 flex h-[20px] shrink-0 items-center px-2 " + (note.bandTheme?.band ?? "")}
                    title={note.title}
                  >
                    {note.showPeriodLabel && (
                      <span className="truncate text-[11px] font-bold leading-none">{note.period.short}</span>
                    )}
                  </div>
                )}

                {note?.holiday && (
                  <span
                    className={"flex items-center gap-1.5 rounded-sm px-1.5 py-1.5 " + note.chipTheme.chip}
                    title={note.title}
                  >
                    <span className={"h-2 w-2 shrink-0 rounded-full " + note.chipTheme.dot} aria-hidden />
                    <span className="truncate text-[12px] font-bold leading-none">{note.holiday}</span>
                  </span>
                )}

                {/* A past day's cards fade a little, but only a little: the hatch behind them is
                    saying "this is behind us" now, so the fade is a second voice rather than the
                    only one, and last week's wedding stays legible at a glance. */}
                <div className={"flex flex-col gap-1.5" + (isPast ? " opacity-85" : "")}>
                  {(isExpanded ? dayEvents : visible).map((e) => (
                    <EventCard key={e.id} event={e} flow={flow} compact={mode === "month"} onClick={() => onOpenEvent(e)} />
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
                    <button
                      type="button"
                      onClick={() => setExpandedDate(isExpanded ? null : iso)}
                      className="rounded-sm px-1.5 py-0.5 text-start text-[11px] font-medium text-muted hover:text-accent-hover"
                    >
                      {isExpanded ? "הצג פחות" : `+${overflow} נוספים`}
                    </button>
                  )}
                </div>

                {/* The write this calendar was missing. Quiet until the day is hovered so 42 plus signs
                    don't compete with the month itself, but never `hidden` — it is a real button with a
                    real label, so keyboard focus brings it back into view (focus-visible:opacity-100)
                    and a screen reader reaches it either way. `mt-auto` pins it to the bottom of the
                    cell rather than letting it float under whatever the day happens to hold. */}
                {/* NOT ON A DAY THAT HAS BEEN AND GONE. Hovering last Tuesday used to offer to book
                    a meeting on it, which is an offer the calendar cannot keep — and it was the only
                    thing that lit up on the past half of a month view, drawing the eye backwards
                    across the grid. Today still offers it: a meeting later this afternoon is a
                    perfectly ordinary thing to add at noon.
                    Says "הוספה", not "פגישה": what lands here is whatever occupies a day — a sit-down,
                    an אילוץ, a חופשה, an אספקה — and the kind is chosen in the dialog. */}
                {!isPast && (
                  <button
                    type="button"
                    onClick={() => onCreateAppointment(iso)}
                    aria-label={`הוספה ליומן ב-${d.toLocaleDateString("he-IL", { day: "numeric", month: "long" })}`}
                    className="z-[2] mt-auto flex items-center justify-center gap-1 rounded-sm border border-dashed border-border-soft py-1 text-[11px] font-medium text-muted opacity-0 transition-opacity hover:border-accent-line hover:text-accent-hover focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                    הוספה
                  </button>
                )}

                {/* ⚠ "+N נוספים" USED TO OPEN A FLOATING PANEL here — `absolute start-1 top-full w-56`,
                    hanging out of the cell. Three things were wrong with it and the third is fatal:
                    it had no max-height, so a busy day produced a panel taller than the card; anchored
                    at `start` it grew toward the viewport edge, so on the last column (Saturday, the
                    LEFTMOST cell in RTL) 90-odd pixels of it hung off the card; and it cannot coexist
                    with the horizontal scroll the grid now needs, because `overflow-x: auto` computes
                    `overflow-y` to `auto` rather than `visible` — the panel would be clipped by the
                    very wrapper that keeps the columns legible.
                    Expanding IN PLACE has none of those problems: the row simply gets taller, every
                    cell in it stretches to match, and there is no position, no width and no edge to
                    get wrong at any viewport. */}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// A diary entry in a day cell. THE SAME CARD AN EVENT GETS — same radius, same padding, same type
// sizes, the same lift on hover — because a designer scanning a day wants to read what is happening
// on it, not to decode two widget vocabularies. What differs is what each card can honestly say: an
// event spends its last two lines on a progress bar and a status word, and a diary entry has neither
// (an hour in a diary has no stages to be at), so it spends its lines on the note and the kind.
//
// COLOUR IS THE KIND HERE, not the status — see KIND_CARD_THEME. The fill is the kind's tint, the
// leading 3px rail is the kind's full hue, and the icon is its glyph. The rail and the icon are also
// the tell between the species: no event card carries either, so a wedding and a walkthrough sitting
// in one cell in two greens are still not the same object.
//
// A held meeting (`done`) goes grey with a tick rather than disappearing: the record of having met
// is most of what makes a diary worth keeping, and a past date is not the same claim (see the column
// note in lib/db/schema.ts).
const CHIP_SIZE = {
  compact: { card: "gap-1.5 p-2", icon: "h-3 w-3", name: "text-xs", time: "text-[11px]", meta: "text-[10px]" },
  full: { card: "gap-2 p-2.5", icon: "h-3.5 w-3.5", name: "text-sm", time: "text-xs", meta: "text-xs" },
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
        "flex flex-col rounded-md border-s-[3px] text-start transition-transform hover:-translate-y-px hover:shadow-floating " +
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
        "flex items-center rounded-md border border-dashed border-border bg-inset/60 " +
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

function EventCard({ event: e, flow, compact, onClick }: { event: EventSummary; flow: MeetingStepId[]; compact: boolean; onClick: () => void }) {
  const progress = eventProgress(e, flow);
  const status = eventStatus(e, flow);
  const theme = STATUS_CARD_THEME[STATUS_TONE[status]];

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${e.clientName} · ${zonesLabelOf(e)}${e.time ? " · " + e.time : ""} · ${progress}% · ${STATUS_LABEL[status]}`}
        className={"flex flex-col gap-1.5 rounded-md p-2 text-start transition-transform hover:-translate-y-px hover:shadow-floating " + theme.bg}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{e.clientName}</span>
          {e.time && <span className={"nums shrink-0 text-[11px] font-semibold " + theme.text}>{e.time}</span>}
        </div>
        <span className="truncate text-[10px] text-ink-soft">{zonesLabelOf(e)}</span>
        <div className="flex items-center gap-1.5">
          <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-canvas/60">
            <div className={"h-full rounded-full " + theme.bar} style={{ width: `${progress}%` }} />
          </div>
          <span className={"nums shrink-0 text-[10px] font-bold " + theme.text}>{progress}%</span>
        </div>
        <span className={"truncate text-[10px] font-semibold " + theme.text}>{STATUS_LABEL[status]}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={"flex flex-col gap-2 rounded-md p-2.5 text-start transition-all hover:shadow-floating " + theme.bg}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{e.clientName}</span>
        {e.time && <span className={"nums shrink-0 text-xs font-semibold " + theme.text}>{e.time}</span>}
      </div>
      <span className="truncate text-xs text-ink-soft">{zonesLabelOf(e)}</span>
      <div className="flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-canvas/60">
          <div className={"h-full rounded-full " + theme.bar} style={{ width: `${progress}%` }} />
        </div>
        <span className={"nums shrink-0 text-xs font-bold " + theme.text}>{progress}%</span>
      </div>
      <span className={"truncate text-xs font-semibold " + theme.text}>{STATUS_LABEL[status]}</span>
    </button>
  );
}
