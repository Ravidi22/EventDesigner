"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarDays,
  CalendarHeart,
  Plus,
  PenTool,
  Printer,
} from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, eventStatus, monogram, formatEventDate, zonesLabelOf } from "@/lib/events/types";
import { MEETING_STEPS, STEP_BY_ID, toggleStep, type MeetingStepId } from "@/lib/meeting/steps";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { saveMeetingFlow } from "@/lib/settings/actions";
import { setActiveEventId } from "@/lib/events/storage";
import { useEvents } from "@/lib/events/use-events";
import { useActiveVenueScope } from "@/lib/venues/use-active-venue-scope";
import { SearchInput } from "@/components/search-input";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/button";
import { EmptyState, NoResults } from "@/components/empty-state";
import { EventDialog } from "@/components/event-dialog";

type View = "pipeline" | "archived";
const VIEWS: { id: View; label: string }[] = [
  { id: "pipeline", label: "צינור אירועים" },
  { id: "archived", label: "ארכיון" },
];

// A pastel per column position, cycling — the same "little gallery of colour" idea the halls
// canvas's add-element picker uses (ADD_TOOL_PREVIEW): there's no photo to tell stages apart by, so
// a tint standing in for one is what marks the stage number badge and each card's top band. Column
// *backgrounds* stay one unified accent-tint wash (see PipelineColumn) — six differently-coloured
// column fills would fight the "one quiet plane" system more than they'd help tell stages apart.
const COLUMN_TINTS = ["#f6df9b", "#f3c6d6", "#d9d1f2", "#bcdcf5", "#c7e8cf", "#f3c99b"];

// Moved here from the Dashboard (F-1.1): the event grid — with its filters and search — now lives
// on the Gantt tab. Rebuilt as a pipeline board (one column per configured meeting stage) so the
// stage an event is parked on is a place it sits, not a filter you have to already know to apply.
export function GanttScreen({ initialEvents }: { initialEvents: EventSummary[] }) {
  const router = useRouter();
  // Seeded by page.tsx's server-side read; the hook keeps `patch`, which is a real write.
  const { events, ready, patch } = useEvents(initialEvents);
  const [view, setView] = useState<View>("pipeline");
  const [query, setQuery] = useState("");
  // Opens the shared creation dialog (components/event-dialog.tsx) in place, rather than
  // navigating to /meeting?new — answering six questions isn't worth losing the board you were on.
  const [creating, setCreating] = useState(false);
  const { activeVenueId } = useActiveVenueScope();
  const flow = useMeetingFlow();

  const inVenue = useMemo(
    () => events.filter((e) => e.venueId === activeVenueId),
    [events, activeVenueId],
  );

  const q = query.trim().toLowerCase();

  // Kept apart: an empty screen means something different when this venue has no events at all
  // (first run — teach and offer to create one) than when the search simply hid them (offer the
  // way back). Both look like an empty array downstream.
  const active = useMemo(
    () => inVenue.filter((e) => !e.archived && (!q || `${e.clientName} ${e.zonesLabel}`.toLowerCase().includes(q))),
    [inVenue, q],
  );
  const archived = useMemo(
    () => inVenue.filter((e) => e.archived && (!q || `${e.clientName} ${e.zonesLabel}`.toLowerCase().includes(q))),
    [inVenue, q],
  );
  const shown = view === "pipeline" ? active : archived;

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
  const moveToStep = (e: EventSummary, step: number) => {
    if (step !== e.step) void patch(e.id, { step });
  };
  // "+ Add column" only ever turns a stage from this studio's own fixed catalogue back on — see
  // MeetingSection (Settings → מצב פגישה), the other door to the same saveMeetingFlow. There is no
  // free-text "new status" here: every stage in lib/meeting/steps.ts is backed by real screens (the
  // hall sketch, the gallery pass…), so inventing an arbitrarily-named one would open onto nothing.
  const enableStep = async (id: MeetingStepId) => {
    // toggleStep (not a raw append): it inserts the stage back where the studio's default order
    // has it relative to what's already on, not at the tail — so re-enabling "hall" after
    // "gallery"/"design" were already on lands it before them, where the sketch actually belongs.
    await saveMeetingFlow(toggleStep(flow, id));
    router.refresh();
  };

  return (
    <div className="flex h-full flex-col px-8 pt-6 pb-8">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-pill bg-bg p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              aria-pressed={view === v.id}
              className={
                "rounded-pill px-3.5 py-1.5 text-sm transition-colors " +
                (view === v.id
                  ? "bg-surface font-semibold text-accent-hover shadow-floating"
                  : "text-ink-soft hover:text-accent-hover")
              }
            >
              {v.label}
              {v.id === "archived" && archived.length > 0 && (
                <span className="nums ms-1.5 text-xs text-muted">{archived.length}</span>
              )}
            </button>
          ))}
        </div>
        <SearchInput
          className="min-w-56 flex-1"
          value={query}
          onChange={setQuery}
          placeholder="חיפוש לפי לקוח או אולם…"
          aria-label="חיפוש אירועים"
        />
        <span className="nums text-sm text-muted">{shown.length} אירועים</span>
      </div>

      {!ready ? (
        <p className="py-16 text-center text-sm text-muted" aria-busy="true">
          טוען את האירועים…
        </p>
      ) : inVenue.length === 0 ? (
        // First run: this venue has no events at all. Not a filter problem — there is nothing to
        // filter, so this teaches where an event comes from and opens the meeting that starts it.
        <EmptyState
          icon={CalendarHeart}
          title="אין עדיין אירועים"
          body="כל אירוע מתחיל בפגישה — שם הלקוח, התאריך והאזורים שהוא לוקח באולם. משם ממשיכים לגלריה, לסטודיו, ולפלטים שהצוות והמחסן מקבלים."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              צור אירוע ראשון
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        q ? (
          <NoResults
            title="לא נמצאו אירועים"
            body={`אין אירוע שתואם ל״${query.trim()}״ ב${view === "pipeline" ? "צינור" : "ארכיון"}. החיפוש עובר על שם הלקוח ועל האזורים באולם.`}
            onClear={() => setQuery("")}
            clearLabel="נקה חיפוש"
          />
        ) : view === "archived" ? (
          <NoResults
            icon={Archive}
            title="הארכיון ריק"
            body="אירוע שהסתיים אפשר להעביר לארכיון מכרטיס האירוע — הוא יורד מהצינור, והעיצוב, ההצעה ורשימת הציוד שלו נשמרים כמו שהם."
          />
        ) : (
          <NoResults
            icon={Archive}
            title="אין אירועים פעילים"
            body="כל האירועים במתחם הזה נמצאים בארכיון."
            onClear={() => setView("archived")}
            clearLabel="פתח את הארכיון"
          />
        )
      ) : view === "archived" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {archived.map((e) => (
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
      ) : (
        <PipelineBoard
          events={active}
          flow={flow}
          onMeeting={enterMeeting}
          onStudio={openStudio}
          onOutputs={openOutputs}
          onArchive={toggleArchive}
          onMove={moveToStep}
          onCreate={() => setCreating(true)}
          onEnableStep={enableStep}
        />
      )}

      <EventDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function PipelineBoard({
  events,
  flow,
  onMeeting,
  onStudio,
  onOutputs,
  onArchive,
  onMove,
  onCreate,
  onEnableStep,
}: {
  events: EventSummary[];
  flow: MeetingStepId[];
  onMeeting: (e: EventSummary) => void;
  onStudio: (e: EventSummary) => void;
  onOutputs: (e: EventSummary) => void;
  onArchive: (e: EventSummary) => void;
  onMove: (e: EventSummary, step: number) => void;
  onCreate: () => void;
  onEnableStep: (id: MeetingStepId) => Promise<void>;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const byStep = useMemo(() => {
    const buckets = flow.map(() => [] as EventSummary[]);
    for (const e of events) {
      const clamped = Math.min(Math.max(e.step, 0), flow.length - 1);
      buckets[clamped].push(e);
    }
    // Soonest date first within a column — what the team needs to act on next, not last edited.
    for (const bucket of buckets) {
      bucket.sort((a, b) => (!a.date ? 1 : !b.date ? -1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
    return buckets;
  }, [events, flow]);

  return (
    <div className="-mx-8 flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto px-8 pb-2">
      {flow.map((stepId, i) => (
        <PipelineColumn
          key={stepId}
          index={i}
          label={STEP_BY_ID[stepId]?.label ?? stepId}
          tint={COLUMN_TINTS[i % COLUMN_TINTS.length]}
          events={byStep[i]}
          dragActive={dragOver === i}
          onDragOverColumn={() => draggingId && setDragOver(i)}
          onDropColumn={() => {
            if (draggingId) {
              const dropped = events.find((e) => e.id === draggingId);
              if (dropped) onMove(dropped, i);
            }
            setDraggingId(null);
            setDragOver(null);
          }}
          onMeeting={onMeeting}
          onStudio={onStudio}
          onOutputs={onOutputs}
          onArchive={onArchive}
          onCreate={onCreate}
          onDragStartCard={(id) => setDraggingId(id)}
          onDragEndCard={() => {
            setDraggingId(null);
            setDragOver(null);
          }}
          draggingId={draggingId}
        />
      ))}
      <NewStageColumn flow={flow} onEnableStep={onEnableStep} />
    </div>
  );
}

function PipelineColumn({
  index,
  label,
  tint,
  events,
  dragActive,
  onDragOverColumn,
  onDropColumn,
  onMeeting,
  onStudio,
  onOutputs,
  onArchive,
  onCreate,
  onDragStartCard,
  onDragEndCard,
  draggingId,
}: {
  index: number;
  label: string;
  tint: string;
  events: EventSummary[];
  dragActive: boolean;
  onDragOverColumn: () => void;
  onDropColumn: () => void;
  onMeeting: (e: EventSummary) => void;
  onStudio: (e: EventSummary) => void;
  onOutputs: (e: EventSummary) => void;
  onArchive: (e: EventSummary) => void;
  onCreate: () => void;
  onDragStartCard: (id: string) => void;
  onDragEndCard: () => void;
  draggingId: string | null;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverColumn();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropColumn();
      }}
      className={
        "flex w-72 shrink-0 flex-col rounded-[20px] border p-4 shadow-floating transition-colors " +
        (dragActive ? "border-accent-line bg-accent-tint ring-2 ring-accent-line" : "border-[#eae7f4] bg-tray")
      }
    >
      <div className="mb-3 flex items-center gap-2 border-b border-b-[#ebe8f5] px-1 pb-3">
        <span
          className="font-label flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-ink/70"
          style={{ backgroundColor: tint }}
        >
          {index + 1}
        </span>
        <h3 className="truncate text-sm font-bold text-ink">{label}</h3>
        <span className="nums font-label rounded-pill bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-muted">
          {events.length}
        </span>
      </div>
      <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
        {events.length === 0 ? (
          <p className="rounded-md border border-dashed border-[#ddd6f0] px-3 py-6 text-center text-xs text-[#a29eb2]">
            אין אירועים בשלב זה
          </p>
        ) : (
          events.map((e) => (
            <PipelineCard
              key={e.id}
              event={e}
              tint={tint}
              dragging={draggingId === e.id}
              onDragStart={() => onDragStartCard(e.id)}
              onDragEnd={onDragEndCard}
              onMeeting={() => onMeeting(e)}
              onStudio={() => onStudio(e)}
              onOutputs={() => onOutputs(e)}
              onArchive={() => onArchive(e)}
            />
          ))
        )}
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-[#ddd6f0] bg-[#fcfbff] p-[13px] text-sm font-bold text-[#8f78d8] transition-colors hover:border-solid hover:bg-[#f3effc]"
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          הוספה
        </button>
      </div>
    </div>
  );
}

// The board's trailing "column" — same w-72/flex-col shape as a real one (see PipelineColumn), so
// the row reads as "the next stage slot" rather than a floating control bolted onto the edge. Not a
// free-text name field: a stage here is one of this studio's own fixed five (each backed by a real
// screen — see enableStep's comment in GanttScreen), so clicking it opens the SAME picker of
// currently-off stages the old popover did, just inline in the column body instead of a menu.
function NewStageColumn({
  flow,
  onEnableStep,
}: {
  flow: MeetingStepId[];
  onEnableStep: (id: MeetingStepId) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<MeetingStepId | null>(null);
  const disabledSteps = MEETING_STEPS.filter((s) => !flow.includes(s.id));

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-[20px] border border-[#eae7f4] bg-tray p-4 shadow-floating">
      <div className="mb-3 h-5 border-b border-b-[#ebe8f5] px-1 pb-3" aria-hidden />
      <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
        {/* The picker — a panel above the trigger rather than the trigger itself growing to hold
            it, so the trigger stays the same small pill every column's own "הוספה" button is,
            instead of a big box that reads as a different kind of control. */}
        {editing &&
          (disabledSteps.length === 0 ? (
            <p className="rounded-md border border-border bg-surface p-3 text-center text-xs font-normal leading-relaxed text-muted">
              כל שלבי הפגישה כבר פעילים בצינור. סדר השלבים נקבע ב״הגדרות ← מצב פגישה״.
            </p>
          ) : (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-1.5">
              {disabledSteps.map((s) => (
                <span
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  aria-disabled={busy !== null}
                  onClick={() => {
                    if (busy) return;
                    setBusy(s.id);
                    void onEnableStep(s.id).then(() => {
                      setBusy(null);
                      setEditing(false);
                    });
                  }}
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-sm px-2.5 py-2 text-start font-semibold text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover aria-disabled:opacity-50"
                >
                  {s.label}
                  <span className="text-xs font-normal text-muted">{s.hint}</span>
                </span>
              ))}
            </div>
          ))}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-[#ddd6f0] bg-[#fcfbff] p-[13px] text-sm font-bold text-[#8f78d8] transition-colors hover:border-solid hover:bg-[#f3effc]"
        >
          <Plus className={"h-4 w-4 shrink-0 transition-transform " + (editing ? "rotate-45" : "")} strokeWidth={2.25} />
          {editing ? "ביטול" : "הוספת סטטוס"}
        </button>
      </div>
    </div>
  );
}

function PipelineCard({
  event: e,
  tint,
  dragging,
  onDragStart,
  onDragEnd,
  onMeeting,
  onStudio,
  onOutputs,
  onArchive,
}: {
  event: EventSummary;
  tint: string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMeeting: () => void;
  onStudio: () => void;
  onOutputs: () => void;
  onArchive: () => void;
}) {
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={
        "group relative cursor-grab overflow-hidden rounded-md border border-[#eeebf6] bg-canvas shadow-[0_10px_22px_-18px_rgba(70,40,130,.55)] transition-all hover:shadow-lifted active:cursor-grabbing " +
        (dragging ? "opacity-40" : "opacity-100")
      }
    >
      {/* The stage-colour bar overlays the card's own top edge rather than pushing the content
          down a real 8px, so the 16px padding below reads as one even margin all the way around. */}
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: tint }} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold text-ink">{e.clientName}</span>
            <span className="mt-[3px] block truncate text-[13px] text-muted">
              {zonesLabelOf(e)} · <span className="nums font-label">{e.guests || "—"}</span> אורחים
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              onClick={onStudio}
              title="פתיחה בסטודיו"
              aria-label={`פתיחת ${e.clientName} בסטודיו`}
              className="rounded-sm p-1 text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
            >
              <PenTool className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={onOutputs}
              title="פלטים תפעוליים"
              aria-label={`פלטים תפעוליים של ${e.clientName}`}
              className="rounded-sm p-1 text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
            >
              <Printer className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={onArchive}
              title="העברה לארכיון"
              aria-label={`העברת ${e.clientName} לארכיון`}
              className="rounded-sm p-1 text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
            >
              <Archive className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 text-xs text-ink-soft">
            <CalendarDays className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
            {formatEventDate(e.date)}
          </span>
          <StatusChip tone="success" className={"shrink-0 " + (e.quoteSentAt ? "" : "invisible")}>
            {STATUS_LABEL.sent}
          </StatusChip>
        </div>

        <button
          type="button"
          onClick={onMeeting}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-accent-line bg-accent-tint/40 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent-tint"
        >
          קדם שלב
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </article>
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
