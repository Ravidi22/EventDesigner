"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, CalendarArrowDown, CalendarArrowUp, PenTool, Printer } from "lucide-react";
import type { EventSummary, EventStatus } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, eventProgress, eventStatus, monogram, formatEventDate, zonesLabelOf } from "@/lib/events/types";
import { stepAt, type MeetingStepId } from "@/lib/meeting/steps";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { setActiveEventId } from "@/lib/events/storage";
import { useEvents } from "@/lib/events/use-events";
import { useActiveVenueScope } from "@/lib/venues/use-active-venue-scope";
import { SearchInput } from "@/components/search-input";
import { StatusChip } from "@/components/status-chip";

type Filter = "active" | EventStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "פעילים" },
  { id: "gallery", label: "בגלריה" },
  { id: "design", label: "בעיצוב" },
  { id: "sent", label: "נשלחה הצעה" },
  { id: "archived", label: "ארכיון" },
];

// Moved here from the Dashboard (F-1.1): the event grid — with its filters and search — now
// lives on the Gantt tab. The room-booking timeline that used to live here was removed in
// favor of this view.
export function GanttScreen() {
  const router = useRouter();
  const { events, patch } = useEvents();
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const { activeVenueId } = useActiveVenueScope();
  const flow = useMeetingFlow();

  const filtered = useMemo(() => {
    const byVenue = events.filter((e) => e.venueId === activeVenueId);
    const byTab =
      filter === "active"
        ? byVenue.filter((e) => !e.archived)
        : filter === "archived"
          ? byVenue.filter((e) => e.archived)
          : byVenue.filter((e) => eventStatus(e, flow) === filter);
    const q = query.trim().toLowerCase();
    return q ? byTab.filter((e) => `${e.clientName} ${e.zonesLabel}`.toLowerCase().includes(q)) : byTab;
  }, [events, filter, query, activeVenueId, flow]);

  const shown = useMemo(() => {
    const sign = sortDir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? -sign : a.date > b.date ? sign : 0;
    });
  }, [filtered, sortDir]);

  const enterMeeting = (e: EventSummary) => {
    setActiveEventId(e.id);
    router.push("/meeting");
  };
  const openStudio = (e: EventSummary) => {
    setActiveEventId(e.id);
    router.push("/studio");
  };
  // F-6: the operational outputs are prepared here, after the meeting — the one route into them.
  const openOutputs = (e: EventSummary) => {
    setActiveEventId(e.id);
    router.push("/outputs");
  };
  const toggleArchive = (e: EventSummary) => {
    void patch(e.id, { archived: !e.archived });
  };

  return (
    <div className="px-8 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-pill bg-bg p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={
                "rounded-pill px-3.5 py-1.5 text-sm transition-colors " +
                (filter === f.id
                  ? "bg-surface font-semibold text-accent-hover shadow-floating"
                  : "text-ink-soft hover:text-accent-hover")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SearchInput
          className="min-w-56 flex-1"
          value={query}
          onChange={setQuery}
          placeholder="חיפוש לפי לקוח או אולם…"
          aria-label="חיפוש אירועים"
        />
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
          className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover"
          aria-label={
            sortDir === "desc" ? "מיון לפי תאריך, מהחדש לישן. לחצו למיון מהישן לחדש" : "מיון לפי תאריך, מהישן לחדש. לחצו למיון מהחדש לישן"
          }
        >
          {sortDir === "desc" ? (
            <CalendarArrowDown className="h-4 w-4" strokeWidth={2} />
          ) : (
            <CalendarArrowUp className="h-4 w-4" strokeWidth={2} />
          )}
          {sortDir === "desc" ? "החדש ביותר" : "הישן ביותר"}
        </button>
        <span className="nums text-sm text-muted">{shown.length} אירועים</span>
      </div>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          {query.trim()
            ? "לא נמצאו אירועים התואמים לחיפוש."
            : filter === "archived"
              ? "הארכיון ריק."
              : "אין אירועים בסינון הזה."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              flow={flow}
              onMeeting={() => enterMeeting(e)}
              onStudio={() => openStudio(e)}
              onOutputs={() => openOutputs(e)}
              onArchive={() => toggleArchive(e)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event: e,
  flow,
  onMeeting,
  onStudio,
  onOutputs,
  onArchive,
}: {
  event: EventSummary;
  flow: MeetingStepId[];
  onMeeting: () => void;
  onStudio: () => void;
  onOutputs: () => void;
  onArchive: () => void;
}) {
  const status = eventStatus(e, flow);
  // F-1.1: progress = the furthest stage reached, shown against this studio's own meeting flow.
  const stepLabel = stepAt(flow, e.step).label;
  const progress = eventProgress(e, flow);

  return (
    <article className="group flex flex-col gap-5 rounded-lg border border-border bg-surface p-6 transition-all hover:border-accent-line hover:shadow-lifted">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-accent-wash font-display text-lede text-accent-hover">
            {monogram(e.clientName)}
          </span>
          <span className="leading-tight">
            <span className="block text-base font-semibold text-ink">{e.clientName}</span>
            <span className="block text-sm text-muted">
              {zonesLabelOf(e)} · {formatEventDate(e.date)}
            </span>
          </span>
        </div>
        <StatusChip tone={STATUS_TONE[status]} className="shrink-0">
          {STATUS_LABEL[status]}
        </StatusChip>
      </div>

      <div className="flex gap-5 text-sm text-ink-soft">
        <span className="nums"><b className="font-semibold text-ink">{e.guests || "—"}</b> אורחים</span>
        {e.phone && <span className="nums" dir="ltr">{e.phone}</span>}
      </div>

      <div>
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>שלב: {stepLabel}</span>
          <span className="nums">{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3.5">
        <button
          type="button"
          onClick={onMeeting}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
        >
          המשך פגישה
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={onStudio}
            title="פתיחה בסטודיו"
            aria-label={`פתיחת ${e.clientName} בסטודיו`}
            className="rounded-pill p-1.5 text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
          >
            <PenTool className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onOutputs}
            title="פלטים תפעוליים"
            aria-label={`פלטים תפעוליים של ${e.clientName}`}
            className="rounded-pill p-1.5 text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
          >
            <Printer className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onArchive}
            title={e.archived ? "שחזור מהארכיון" : "העברה לארכיון"}
            aria-label={e.archived ? `שחזור ${e.clientName} מהארכיון` : `העברת ${e.clientName} לארכיון`}
            className="rounded-pill p-1.5 text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
          >
            {e.archived ? <ArchiveRestore className="h-4 w-4" strokeWidth={1.75} /> : <Archive className="h-4 w-4" strokeWidth={1.75} />}
          </button>
        </div>
      </div>
    </article>
  );
}
