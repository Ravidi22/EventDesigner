"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, CalendarArrowDown, CalendarArrowUp, PenTool } from "lucide-react";
import type { EventSummary, EventStatus } from "@/lib/events/types";
import { STATUS_LABEL, FLOW_STEPS, eventStatus, monogram, formatEventDate } from "@/lib/events/types";
import { SAMPLE_EVENTS } from "@/lib/events/sample-data";
import { loadEvents, setActiveEventId, updateEvent } from "@/lib/events/storage";
import { SearchInput } from "@/components/search-input";
import { StatusChip } from "@/components/status-chip";

type Filter = "active" | EventStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "פעילים" },
  { id: "waiting", label: "ממתינים לסקיצה" },
  { id: "design", label: "בעיצוב" },
  { id: "sent", label: "נשלחה הצעה" },
  { id: "archived", label: "ארכיון" },
];

// Chip tone per stage. Colour never carries the meaning alone — the label rides with it.
const STATUS_TONE: Record<EventStatus, "neutral" | "accent" | "success" | "warn"> = {
  details: "neutral",
  gallery: "neutral",
  waiting: "warn",
  design: "accent",
  sent: "success",
  archived: "neutral",
};

export function DashboardScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[]>(SAMPLE_EVENTS);
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [greeting, setGreeting] = useState("שלום");

  useEffect(() => {
    setEvents(loadEvents());
    const h = new Date().getHours();
    setGreeting(h < 12 ? "בוקר טוב" : h < 18 ? "צהריים טובים" : "ערב טוב");
  }, []);

  const filtered = useMemo(() => {
    const byTab =
      filter === "active"
        ? events.filter((e) => !e.archived)
        : filter === "archived"
          ? events.filter((e) => e.archived)
          : events.filter((e) => eventStatus(e) === filter);
    const q = query.trim().toLowerCase();
    return q ? byTab.filter((e) => `${e.clientName} ${e.hallName}`.toLowerCase().includes(q)) : byTab;
  }, [events, filter, query]);

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
  const toggleArchive = (e: EventSummary) => {
    setEvents(updateEvent(e.id, { archived: !e.archived }));
  };

  return (
    <div className="px-8 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{greeting}, דניאל</p>
          <h2 className="mt-1 font-display text-h1 text-ink text-balance">האירועים שלך</h2>
        </div>
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
              onMeeting={() => enterMeeting(e)}
              onStudio={() => openStudio(e)}
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
  onMeeting,
  onStudio,
  onArchive,
}: {
  event: EventSummary;
  onMeeting: () => void;
  onStudio: () => void;
  onArchive: () => void;
}) {
  const status = eventStatus(e);
  // F-1.1: progress = the furthest flow step reached, shown against the whole flow.
  const stepLabel = FLOW_STEPS[Math.min(e.step, FLOW_STEPS.length - 1)].label;
  const progress = Math.round((Math.min(e.step, FLOW_STEPS.length - 1) / (FLOW_STEPS.length - 1)) * 100);

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
              {e.hallName} · {formatEventDate(e.date)}
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
