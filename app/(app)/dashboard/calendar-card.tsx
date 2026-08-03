"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, eventProgress, eventStatus } from "@/lib/events/types";
import { IconButton } from "@/components/icon-button";
import {
  addDays,
  addMonths,
  sameDay,
  toISODate,
  weekGrid,
  weekLabel,
  monthGrid,
  monthLabel,
  cardTheme,
  holidayName,
  PAST_DAY_BG,
  PAST_DAY_OVERLAY,
} from "./dashboard-view-utils";

type Mode = "week" | "month";

// "השבוע שלי" / "החודש שלי" (F-1.1): one card, two grids. Week is the default (a designer's
// week is the unit that matters day to day); month is a toggle for the wider view. There is no
// venue filter here anymore — `events` arrives from the parent already scoped to whichever
// venue is active in the sidebar, the one place that scoping decision lives. `onOpenEvent` is
// likewise supplied by the parent; each event's own card color comes from `cardTheme`, keyed to
// its hall, so no external color resolver is needed here.
export function CalendarCard({
  events,
  onOpenEvent,
}: {
  events: EventSummary[];
  onOpenEvent: (e: EventSummary) => void;
}) {
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
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

  const days = mode === "week" ? weekGrid(anchor) : monthGrid(anchor);
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
  const isCurrentRange = sameDay(anchor, today) || (mode === "month" && anchor.getMonth() === today.getMonth() && anchor.getFullYear() === today.getFullYear());

  return (
    <div ref={rootRef} className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
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
          <IconButton label={mode === "week" ? "השבוע הקודם" : "החודש הקודם"} onClick={() => step(-1)}>
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </IconButton>
          <span className="min-w-32 text-center text-sm font-medium text-ink-soft">{rangeLabel}</span>
          <IconButton label={mode === "week" ? "השבוע הבא" : "החודש הבא"} onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={2} />
          </IconButton>
          <button
            type="button"
            onClick={goToday}
            disabled={isCurrentRange}
            className="rounded-pill border border-border px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-accent-hover disabled:cursor-default disabled:opacity-50 disabled:hover:text-ink-soft"
          >
            היום
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {days.map((d) => {
          const iso = toISODate(d);
          const dayEvents = eventsByDate.get(iso) ?? [];
          const isToday = sameDay(d, today);
          const isPast = !isToday && iso < todayIso;
          const inMonth = mode === "week" || d.getMonth() === anchor.getMonth();
          const visible = dayEvents.slice(0, maxVisible === Infinity ? dayEvents.length : maxVisible);
          const overflow = dayEvents.length - visible.length;
          const isExpanded = expandedDate === iso;
          const holiday = holidayName(iso);

          return (
            <div
              key={iso}
              style={isPast ? PAST_DAY_BG : undefined}
              className={
                "relative flex flex-col gap-2 rounded-md p-2 " +
                (mode === "week" ? "min-h-44" : "min-h-40") +
                (isPast ? "" : " " + (isToday ? "bg-accent-tint" : inMonth ? "bg-inset" : "bg-inset/50"))
              }
            >
              <div className="flex items-center justify-between px-1">
                <span className={"text-xs font-medium " + (isPast ? "text-faint" : inMonth ? "text-muted" : "text-faint")}>
                  {d.toLocaleDateString("he-IL", { weekday: "short" })}
                </span>
                <span
                  className={
                    "nums flex h-6 w-6 items-center justify-center rounded-full text-xs " +
                    (isToday ? "bg-accent font-semibold text-canvas" : isPast ? "text-faint" : inMonth ? "text-ink-soft" : "text-faint")
                  }
                >
                  {d.getDate()}
                </span>
              </div>

              {holiday && (
                <span className="truncate px-1 text-[10px] font-semibold text-accent-hover" title={holiday}>
                  {holiday}
                </span>
              )}

              <div className="flex flex-col gap-1.5">
                {visible.map((e) => (
                  <EventCard key={e.id} event={e} compact={mode === "month"} onClick={() => onOpenEvent(e)} />
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

              {isExpanded && (
                <div className="absolute start-1 top-full z-20 w-56 rounded-md border border-border bg-surface p-1.5 shadow-lifted">
                  <div className="flex flex-col gap-1.5">
                    {dayEvents.map((e) => (
                      <EventCard
                        key={e.id}
                        event={e}
                        compact
                        onClick={() => {
                          onOpenEvent(e);
                          setExpandedDate(null);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Layered above the header + cards (not just the empty cell background) so a
                  past day with events reads as "already happened, slightly faded" rather than
                  the pattern only showing in whatever gaps happen to be empty. */}
              {isPast && <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] rounded-md" style={PAST_DAY_OVERLAY} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({ event: e, compact, onClick }: { event: EventSummary; compact: boolean; onClick: () => void }) {
  const progress = eventProgress(e);
  const status = eventStatus(e);
  const theme = cardTheme(e.hallTemplateId);

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${e.clientName} · ${e.hallName}${e.time ? " · " + e.time : ""} · ${progress}% · ${STATUS_LABEL[status]}`}
        className={"flex flex-col gap-1.5 rounded-md p-2 text-start transition-transform hover:-translate-y-px hover:shadow-floating " + theme.bg}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{e.clientName}</span>
          {e.time && <span className={"nums shrink-0 text-[11px] font-semibold " + theme.text}>{e.time}</span>}
        </div>
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
      <span className="truncate text-xs text-ink-soft">{e.hallName}</span>
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
