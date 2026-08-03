"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, FLOW_STEPS, eventStatus, zonesLabelOf } from "@/lib/events/types";
import type { Venue } from "@/lib/venues/storage";
import { IconButton } from "@/components/icon-button";
import { MultiSelect } from "@/components/multi-select";
import {
  addDays,
  addMonths,
  sameDay,
  toISODate,
  weekGrid,
  weekLabel,
  monthGrid,
  monthLabel,
  TONE_CLASS,
} from "./dashboard-view-utils";

type Mode = "week" | "month";

// "השבוע שלי" / "החודש שלי" (F-1.1): one card, two grids. Week is the default (a designer's
// week is the unit that matters day to day); month is a toggle for the wider view. The venue
// filter lives in this header (not the page header) so its effect on the calendar reads as
// direct, not global. `venueColor` and `onOpenEvent` are supplied by the parent so this
// component stays free of venue-resolution and navigation concerns.
export function CalendarCard({
  events,
  venueColor,
  onOpenEvent,
  venues,
  selectedVenueIds,
  onChangeSelectedVenueIds,
}: {
  events: EventSummary[];
  venueColor: (e: EventSummary) => string;
  onOpenEvent: (e: EventSummary) => void;
  venues: Venue[];
  selectedVenueIds: string[];
  onChangeSelectedVenueIds: (ids: string[]) => void;
}) {
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const today = new Date();

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
  const maxVisible = mode === "week" ? Infinity : 3;

  const step = (n: number) => {
    setExpandedDate(null);
    setAnchor((d) => (mode === "week" ? addDays(d, n * 7) : addMonths(d, n)));
  };
  const switchMode = (m: Mode) => {
    setMode(m);
    setExpandedDate(null);
  };

  return (
    <div ref={rootRef} className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-h2 text-ink">{title}</h3>
          <MultiSelect
            values={selectedVenueIds}
            onChange={onChangeSelectedVenueIds}
            options={venues.map((v) => ({ value: v.id, label: v.name }))}
            aria-label="סינון מתחמים ליומן"
            className="w-48"
          />
        </div>

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
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {days.map((d) => {
          const iso = toISODate(d);
          const dayEvents = eventsByDate.get(iso) ?? [];
          const isToday = sameDay(d, today);
          const inMonth = mode === "week" || d.getMonth() === anchor.getMonth();
          const visible = dayEvents.slice(0, maxVisible === Infinity ? dayEvents.length : maxVisible);
          const overflow = dayEvents.length - visible.length;
          const isExpanded = expandedDate === iso;

          return (
            <div
              key={iso}
              className={
                "relative flex flex-col gap-2 rounded-md p-2 " +
                (mode === "week" ? "min-h-40" : "min-h-28") +
                " " +
                (isToday ? "bg-accent-tint" : inMonth ? "bg-inset" : "bg-inset/50")
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

              <div className="flex flex-col gap-1.5">
                {visible.map((e) => (
                  <EventCard key={e.id} event={e} swatch={venueColor(e)} compact={mode === "month"} onClick={() => onOpenEvent(e)} />
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
                <div className="absolute start-1 top-full z-20 mt-1 w-52 rounded-md border border-border bg-surface p-1.5 shadow-lifted">
                  {dayEvents.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        onOpenEvent(e);
                        setExpandedDate(null);
                      }}
                      className={
                        "mb-1 block w-full truncate rounded-sm px-1.5 py-1 text-start text-xs font-medium last:mb-0 hover:opacity-80 " +
                        TONE_CLASS[STATUS_TONE[eventStatus(e)]]
                      }
                    >
                      {e.clientName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({
  event: e,
  swatch,
  compact,
  onClick,
}: {
  event: EventSummary;
  swatch: string;
  compact: boolean;
  onClick: () => void;
}) {
  const status = eventStatus(e);
  const progress = Math.round((Math.min(e.step, FLOW_STEPS.length - 1) / (FLOW_STEPS.length - 1)) * 100);

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${e.clientName} · ${zonesLabelOf(e)}`}
        className="flex items-center gap-1.5 truncate rounded-sm border border-border bg-surface px-1.5 py-1 text-start transition-all hover:border-accent-line hover:shadow-floating"
      >
        <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + swatch} aria-hidden />
        <span className="truncate text-[11px] font-semibold text-ink">{e.clientName}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1 rounded-sm border border-border bg-surface p-2 text-start shadow-floating transition-all hover:border-accent-line hover:shadow-lifted"
    >
      <div className="flex items-center gap-1.5">
        <span className={"h-2 w-2 shrink-0 rounded-full " + swatch} aria-hidden />
        <span className="truncate text-xs font-semibold text-ink">{e.clientName}</span>
      </div>
      <span className="truncate text-[11px] text-muted">{zonesLabelOf(e)}</span>
      <span className={"self-start rounded-pill px-1.5 py-0.5 text-[10px] font-medium " + TONE_CLASS[STATUS_TONE[status]]}>
        {STATUS_LABEL[status]}
      </span>
      <div className="h-1 overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
      </div>
    </button>
  );
}
