"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import type { EventSummary, EventStatus } from "@/lib/events/types";
import { STATUS_LABEL, eventStatus, formatEventDate } from "@/lib/events/types";
import { loadEvents, setActiveEventId } from "@/lib/events/storage";
import { SAMPLE_EVENTS } from "@/lib/events/sample-data";
import type { HallTemplate } from "@/lib/setup/types";
import { loadTemplates } from "@/lib/setup/storage";
import { SEED_TEMPLATES } from "@/lib/setup/sample-data";
import { DEFAULT_VENUES, VENUE_CHANGED_EVENT, loadActiveVenueId, loadVenues, type Venue } from "@/lib/venues/storage";

const DAY_MS = 86_400_000;
const MIN_RANGE_MS = 30 * DAY_MS;

// Bar color carries the same meaning as the Dashboard's status chip (F-1.1) — a room-chart
// reader still needs to tell "waiting on a sketch" from "quote sent" at a glance.
const BAR_TONE: Record<EventStatus, string> = {
  details: "bg-ink-soft",
  gallery: "bg-ink-soft",
  waiting: "bg-warn",
  design: "bg-accent",
  sent: "bg-success",
  archived: "bg-ink-soft",
};

interface MonthTick {
  label: string;
  startPct: number;
  widthPct: number;
}

function monthTicks(rangeStart: number, rangeEnd: number): MonthTick[] {
  const span = rangeEnd - rangeStart || 1;
  const ticks: MonthTick[] = [];
  const cursor = new Date(rangeStart);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < rangeEnd) {
    const monthStart = Math.max(cursor.getTime(), rangeStart);
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    const monthEnd = Math.min(next.getTime(), rangeEnd);
    ticks.push({
      label: cursor.toLocaleDateString("he-IL", { month: "short", year: "numeric" }),
      startPct: ((monthStart - rangeStart) / span) * 100,
      widthPct: ((monthEnd - monthStart) / span) * 100,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

// Gantt tab: a room-booking chart, not a general calendar — one row per hall within the
// active venue, one bar per event spanning intake (createdAt) to the event date itself
// (there's no separate start/end range in the data model). Its whole job is to make a
// double-booked room visible as two overlapping bars on the same row; nothing here edits
// or schedules anything.
export function GanttScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[]>(SAMPLE_EVENTS);
  const [templates, setTemplates] = useState<HallTemplate[]>(SEED_TEMPLATES);
  const [venues, setVenues] = useState<Venue[]>(DEFAULT_VENUES);
  const [activeVenueId, setActiveVenue] = useState(DEFAULT_VENUES[0].id);

  useEffect(() => {
    setEvents(loadEvents());
    setTemplates(loadTemplates());
    setVenues(loadVenues());
    setActiveVenue(loadActiveVenueId());
    const onVenueChanged = () => setActiveVenue(loadActiveVenueId());
    window.addEventListener(VENUE_CHANGED_EVENT, onVenueChanged);
    return () => window.removeEventListener(VENUE_CHANGED_EVENT, onVenueChanged);
  }, []);

  const activeVenue = venues.find((v) => v.id === activeVenueId);
  const halls = useMemo(() => templates.filter((t) => t.venueId === activeVenueId), [templates, activeVenueId]);

  const rows = useMemo(
    () =>
      halls.map((hall) => ({
        hall,
        events: events.filter((e) => !e.archived && e.hallTemplateId === hall.id && e.date),
      })),
    [halls, events]
  );

  const { rangeStart, rangeEnd } = useMemo(() => {
    const shown = rows.flatMap((r) => r.events);
    if (shown.length === 0) {
      const now = Date.now();
      return { rangeStart: now, rangeEnd: now + 90 * DAY_MS };
    }
    const start = Math.min(...shown.map((e) => e.createdAt)) - 7 * DAY_MS;
    const rawEnd = Math.max(...shown.map((e) => Date.parse(e.date))) + 7 * DAY_MS;
    return { rangeStart: start, rangeEnd: Math.max(rawEnd, start + MIN_RANGE_MS) };
  }, [rows]);

  const ticks = useMemo(() => monthTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const pct = (ms: number) => {
    const span = rangeEnd - rangeStart || 1;
    return Math.min(100, Math.max(0, ((ms - rangeStart) / span) * 100));
  };

  const openEvent = (e: EventSummary) => {
    setActiveEventId(e.id);
    router.push("/meeting");
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <p className="mb-6 max-w-xl text-sm leading-relaxed text-ink-soft">
        ציר הזמן של <span className="font-semibold text-ink">{activeVenue?.name ?? ""}</span> — שורה
        לכל אולם, פס לכל אירוע מרגע פתיחתו ועד תאריך האירוע. חפיפה בין פסים באותה שורה = אותו אולם
        משובץ פעמיים.
      </p>

      {halls.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-canvas">
            <CalendarDays className="h-7 w-7 text-accent" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-h2 text-ink">אין עדיין אולמות ב{activeVenue?.name ?? "מתחם זה"}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            הוסיפו אולם דרך לשונית "אולמות" כדי לראות כאן את ציר האירועים שלו.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <div className="min-w-[720px] p-5">
            <div className="relative ms-40 h-6 border-b border-border-soft text-xs text-muted">
              {ticks.map((t, i) => (
                <span
                  key={i}
                  className="absolute top-0 truncate ps-1.5"
                  style={{ insetInlineStart: `${t.startPct}%`, width: `${t.widthPct}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>

            <div className="flex flex-col">
              {rows.map(({ hall, events: hallEvents }) => (
                <div key={hall.id} className="flex items-center border-b border-border-soft py-3 last:border-b-0">
                  <span className="w-40 shrink-0 truncate pe-3 text-sm font-semibold text-ink">{hall.name}</span>
                  <div className="relative h-9 flex-1 rounded-md bg-bg">
                    {hallEvents.length === 0 && (
                      <span className="absolute inset-0 flex items-center px-3 text-xs text-quiet">אין אירועים משובצים</span>
                    )}
                    {hallEvents.map((e) => {
                      const start = pct(e.createdAt);
                      const end = pct(Date.parse(e.date));
                      const status = eventStatus(e);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => openEvent(e)}
                          title={`${e.clientName} · ${STATUS_LABEL[status]} · ${formatEventDate(e.date)}`}
                          style={{ insetInlineStart: `${start}%`, width: `${Math.max(end - start, 2)}%` }}
                          className={
                            "absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-pill px-2.5 text-[11px] font-semibold text-canvas shadow-floating transition-transform hover:scale-[1.03] " +
                            BAR_TONE[status]
                          }
                        >
                          <span className="truncate">{e.clientName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
