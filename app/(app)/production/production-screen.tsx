"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  CalendarHeart,
  CircleCheck,
  CircleSlash,
  FileText,
  Trash2,
  MessagesSquare,
  PenTool,
  Plus,
  Printer,
  RotateCcw,
  Users,
} from "lucide-react";
import type { ActionTarget, Runway, RunwayRow } from "@/lib/production/runway";
import { LANE_HINT, LANE_LABEL, type LaneId } from "@/lib/production/runway";
import { confirmEvent, markEventLost, patchEvent, reopenEvent } from "@/lib/events/actions";
import type { EventSummary } from "@/lib/events/types";
import { useEvents } from "@/lib/events/use-events";
import { clearActiveEventId, loadActiveEventId, setActiveEventId } from "@/lib/events/storage";
import type { Appointment } from "@/lib/appointments/types";
import { useAppointments } from "@/lib/appointments/use-appointments";
import { useVenues } from "@/lib/venues/use-venues";
import type { MenuItem } from "@/components/menu";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/button";
import { EmptyState, NoResults } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EventDialog } from "@/components/event-dialog";
import { CrewDialog } from "@/components/crew-dialog";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { EventDetailDrawer } from "../dashboard/event-detail-drawer";
import { AppointmentDialog } from "../dashboard/appointment-dialog";
import { toISODate } from "../dashboard/dashboard-view-utils";
import { LaneFilter, type FilterId } from "./lane-filter";
import { CollisionBand, RunwayRowCard } from "./runway-row";
import { groupByMonth, planCollisions } from "./view-utils";

// THE PRODUCTION RUNWAY — what is coming, and what about it is late.
//
// Read the header of lib/production/runway.ts first; it carries the argument this screen is the
// answer to. The short version, because it governs every layout decision below:
//
//   The board this replaces asked "which meeting stage is this event on", as five columns you drag
//   cards between. That is the wrong question (an event crosses all five stages in one ninety-minute
//   sitting) asked in the wrong shape (five 288px columns that scroll sideways, two different card
//   designs for the same object, six hardcoded pastel column tints, actions that only appear on
//   hover). The question that costs a designer money is "what is about to go wrong, and how long do
//   I have" — and the answer to that is a chronological list, because the event date is a deadline
//   that has never moved.
//
// So: two parts, top to bottom, and NOTHING ON THIS SCREEN SCROLLS SIDEWAYS.
//
//   1. A filter bar — the lanes are a FILTER, so exactly one of them renders, at full width.
//   2. The list — chronological always, grouped by month under sticky headers, one card shape at
//      one density. (A thirteen-week "load ribbon" used to sit above it as a second axis for the
//      same rows; the month headers already do that job, and the ribbon cost the top of every
//      visit. It is gone.)
//
// And the aesthetic instruction that outranks all of them: THE SCREEN IS SILENT WHEN NOTHING IS
// WRONG. Alert ink appears for a late checkpoint and for a collision, and for nothing else. A
// designer whose book is on schedule opens this and sees dates and names.
//
// ── A ROW OPENS THE EVENT, THE ALERT OPENS THE FIX ─────────────────────────────────────────────
//
// A click on the name opens the event's DRAWER — the dashboard's own (the brief, the contacts, the
// meetings, the client's side, and for a confirmed event the production section: crew, equipment,
// orders, printed sheets). The row used to jump straight into /studio, a design surface; from a
// screen about deadlines the first click should be a look. The alert's button goes where the slip
// is fixed (`row.action`, decided in runway.ts; `act` below decides how each target is reached).
export function ProductionScreen({
  runway,
  venueId,
  initialEvents,
  initialAppointments,
}: {
  runway: Runway;
  venueId?: string;
  /** For the drawer. Both read on the server with the runway (page.tsx). */
  initialEvents: EventSummary[];
  initialAppointments: Appointment[];
}) {
  const router = useRouter();
  const { venues, remove: removeVenue } = useVenues();
  // The drawer's rows. Re-seeded by every router.refresh() (lib/events/use-events.ts), so a
  // confirmation made in the drawer and the runway's re-derivation land together.
  const { events, remove: removeEvent } = useEvents(initialEvents);
  const { appointments, save: saveAppointment, remove: removeAppointment } = useAppointments(initialAppointments);

  // `?venue=` (see page.tsx): "what is still on this property", asked when deleting it was refused.
  // Every count on the screen is taken from the scoped rows, so the lane badges and the list agree.
  const venue = venueId ? venues.find((v) => v.id === venueId) : undefined;
  const rows = useMemo(
    () => (venueId ? runway.rows.filter((r) => r.event.venueId === venueId) : runway.rows),
    [runway.rows, venueId],
  );
  const counts = useMemo(() => {
    if (!venueId) return runway.counts;
    const scoped: Record<LaneId, number> = { production: 0, proposal: 0, early: 0, closed: 0 };
    for (const r of rows) scoped[r.lane]++;
    return scoped;
  }, [rows, runway.counts, venueId]);
  const needsAttention = venueId ? rows.filter((r) => r.alert).length : runway.needsAttention;

  // `production` by default: the lane the designer is being PAID for. An event the client has said
  // yes to is work with a delivery date; everything else is still a conversation.
  //
  // ⚠ BUT NOT ONTO AN EMPTY LANE. A studio between seasons, or one that files everything the week
  // after, lands on a lane reading "0" — and a screen that opens on nothing looks broken. So the
  // opening lane is the first one that has anything in it, in the order the filter bar already
  // puts them. This is a DEFAULT, not a redirect — `setFilter` still goes wherever it is told, an
  // empty lane reached by clicking still renders its own empty state (that is an answer to a
  // question the designer asked), and the fallback is computed once at mount rather than tracking
  // `counts`, so confirming the last event in a lane cannot yank the view out from under the click
  // that confirmed it.
  const [filter, setFilter] = useState<FilterId>(() => {
    const order: LaneId[] = ["production", "proposal", "early", "closed"];
    return order.find((lane) => counts[lane] > 0) ?? "production";
  });
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  // Which row has a mutation in the air, so it can be dimmed and its menu left alone. One at a
  // time is enough — these are single clicks on single rows, not a batch surface.
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The event whose "סומן כלא נסגר" is waiting on the confirmation. ONE dialog for the whole
  // screen, owned here rather than one per card — the same arrangement the catalog uses, and the
  // reason every delete in a surface asks the same question in the same words.
  const [losing, setLosing] = useState<{ id: string; clientName: string } | null>(null);
  // Same arrangement for the one delete that cannot be undone. Archive and "not closed" both keep
  // the event; this is for the one that should not exist at all — a test event, a duplicate, or
  // the last thing standing between the designer and deleting a venue. Asked from a row's menu or
  // from inside the drawer; either way it is this one question.
  const [deleting, setDeleting] = useState<{ id: string; clientName: string; date: string } | null>(null);
  const [deletingVenue, setDeletingVenue] = useState(false);
  // The event whose crew is being picked. One dialog, owned here, like the two confirmations.
  const [crewFor, setCrewFor] = useState<{ id: string; clientName: string; crewIds: string[] } | null>(null);

  // ── The drawer ───────────────────────────────────────────────────────────────────────────────
  //
  // By id, read off the live list, so an edit, a confirmation or a delete made from inside it shows
  // (or leaves with) the row as it now is — the dashboard's own arrangement.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedId) ?? null, [events, selectedId]);
  const selectedVenueName = useMemo(
    () => (selectedEvent?.venueId ? venues.find((v) => v.id === selectedEvent.venueId)?.name : undefined),
    [venues, selectedEvent],
  );
  const selectedAppointments = useMemo(
    () => (selectedEvent ? appointments.filter((a) => a.eventId === selectedEvent.id) : []),
    [appointments, selectedEvent],
  );
  const [editingEvent, setEditingEvent] = useState<EventSummary | null>(null);
  // The meeting dialog, as the dashboard keeps it: one object, so booking a new one can never leave
  // a stale `editing` behind.
  const [booking, setBooking] = useState<{ editing: Appointment | null; date: string; eventId?: string } | null>(null);
  const liveEvents = useMemo(() => events.filter((e) => !e.archived), [events]);

  // ⚠ FILTER ONLY. Never `.sort()` — `runway.rows` arrives chronological and stays that way, because
  // urgency is a filter here and never a sort: a row must not move out from under the eye between
  // one glance and the next (see the note on `Runway.rows`).
  //
  // No venue scoping either, deliberately. The old board filtered to the active venue; a runway must
  // not, because the things that collide — one truck, one chuppah, one pair of hands on a Thursday —
  // belong to the studio and not to a property. `collisionsIn` already reasons across the whole book
  // for exactly that reason.
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      rows.filter((r) => {
        const inFilter = filter === "attention" ? Boolean(r.alert) : r.lane === filter;
        if (!inFilter) return false;
        return !q || `${r.event.clientName} ${r.event.zonesLabel}`.toLowerCase().includes(q);
      }),
    [rows, filter, q],
  );

  const groups = useMemo(() => groupByMonth(visible), [visible]);
  const collisionPlan = useMemo(
    () => planCollisions(groups, runway.collisions, runway.rows),
    [groups, runway.collisions, runway.rows],
  );

  // The money column is reserved for the whole list or for none of it — a column that appears on
  // some rows and not others is not a column, and figures that do not line up are the one thing
  // The Tabular Count Rule exists to prevent.
  const showMoney = useMemo(() => visible.some((r) => r.event.quoteTotal != null), [visible]);

  // ── Mutations ────────────────────────────────────────────────────────────────────────────────
  //
  // Every one of these ends in `router.refresh()` rather than in local state. The runway is DERIVED
  // — lanes, checkpoints, alerts and collisions are all recomputed from the facts by the server —
  // so patching a row here would mean re-deriving the whole screen in the client from a shape the
  // client does not own. Refreshing re-runs page.tsx's reads and the answer comes back whole and
  // consistent, which is the only way it can be right.
  const run = async (id: string, mutate: () => Promise<unknown>) => {
    setPending(id);
    setError(null);
    try {
      await mutate();
      router.refresh();
    } catch {
      // Next redacts a thrown message in production, so there is nothing here worth reading out.
      setError("הפעולה לא הושלמה. נסה שוב.");
    } finally {
      setPending(null);
    }
  };

  // The one route into a screen that is about a specific event: point this device at it, then
  // navigate. The active event is a per-device UI position that lives in localStorage
  // (lib/events/storage.ts), not a route parameter.
  const go = (id: string, path: string) => {
    setActiveEventId(id);
    router.push(path);
  };

  /** How each `ActionTarget` is reached — the one table that turns runway.ts's verbs into screens. */
  const act = (row: RunwayRow, target: ActionTarget) => {
    const e = row.event;
    switch (target) {
      case "details": {
        const ev = events.find((x) => x.id === e.id);
        if (ev) setEditingEvent(ev);
        else setSelectedId(e.id);
        return;
      }
      case "meeting":
        return go(e.id, "/meeting");
      case "studio":
      case "proposal":
        // The studio shows the client's proposal as a banner over the canvas and reviews it there.
        return go(e.id, "/studio");
      case "quote":
        return go(e.id, "/outputs?view=quote");
      case "packing":
        return go(e.id, "/outputs?view=packing");
      case "map":
        return go(e.id, "/outputs?view=map");
      case "confirm":
        return void run(e.id, () => confirmEvent(e.id));
      case "crew":
        return setCrewFor({ id: e.id, clientName: e.clientName, crewIds: (e.crew ?? []).map((c) => c.id) });
      case "orders":
        return router.push("/suppliers?tab=orders");
    }
  };

  const actionsFor = (row: RunwayRow): MenuItem[] => {
    const e = row.event;
    const items: MenuItem[] = [];

    items.push({ label: "פרטי האירוע", icon: FileText, onSelect: () => setSelectedId(e.id) });
    // "The client said yes" is the ONE fact on this screen that nobody can derive — see the note on
    // `confirmedAt` — so it is the one thing here that is a button rather than a consequence. It is
    // offered only where it means something: an event already confirmed, lost or filed is not
    // waiting on an answer.
    if (!e.confirmedAt && !e.lostAt && !e.archived) {
      items.push({ label: "אישור הזמנה", icon: BadgeCheck, onSelect: () => void run(e.id, () => confirmEvent(e.id)) });
    }
    items.push({ label: "פתיחה בסטודיו", icon: PenTool, separated: true, onSelect: () => go(e.id, "/studio") });
    items.push({ label: "פלטים תפעוליים", icon: Printer, onSelect: () => go(e.id, "/outputs") });
    items.push({ label: "המשך פגישה", icon: MessagesSquare, onSelect: () => go(e.id, "/meeting") });
    // Who is on the truck — the one other typed fact on this screen (see event_crew in the schema).
    if (!e.lostAt && !e.archived) {
      items.push({ label: "צוות הקמה", icon: Users, separated: true, onSelect: () => act(row, "crew") });
    }
    if (e.lostAt) {
      items.push({ label: "החזרה לפעילות", icon: RotateCcw, separated: true, onSelect: () => void run(e.id, () => reopenEvent(e.id)) });
    }
    items.push({
      label: e.archived ? "שחזור מהארכיון" : "העברה לארכיון",
      icon: e.archived ? ArchiveRestore : Archive,
      separated: !e.lostAt,
      onSelect: () => void run(e.id, () => patchEvent(e.id, { archived: !e.archived })),
    });
    // Last, and `danger`, so Menu draws its own hairline above it: the destructive row is never
    // flush against an ordinary one under a moving cursor.
    if (!e.lostAt) {
      items.push({ label: "סומן כלא נסגר", icon: CircleSlash, onSelect: () => setLosing({ id: e.id, clientName: e.clientName }), danger: true });
    }
    items.push({ label: "מחיקת אירוע", icon: Trash2, onSelect: () => setDeleting({ id: e.id, clientName: e.clientName, date: e.date }), danger: true });
    return items;
  };

  const confirmDelete = () => {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    // The pointer to "which event is open on this device" can outlive the event itself, and every
    // screen that resolves it would keep asking the server about a row that is gone.
    if (loadActiveEventId() === target.id) clearActiveEventId();
    if (selectedId === target.id) setSelectedId(null);
    void run(target.id, () => removeEvent(target.id));
  };

  // ── Empty states ─────────────────────────────────────────────────────────────────────────────
  //
  // Three different nothings, and they mean three different things — the distinction the board got
  // right and the one worth keeping. "No events at all" is a first run and has to teach; "the lane
  // is empty" needs to say what belongs in it (LANE_HINT); "the search hid them" needs the way back.
  const laneToOffer = (["production", "proposal", "early", "closed"] as LaneId[])
    .filter((id) => id !== filter && counts[id] > 0)
    .sort((a, b) => counts[b] - counts[a])[0];

  const venueName = venue?.name ?? "המתחם";

  const list =
    venueId && rows.length === 0 ? (
      // The end of the errand that brought the designer here: nothing is left on the venue, so the
      // delete the switcher refused can happen now, from where they are.
      <EmptyState
        icon={CircleCheck}
        title={`אין אירועים ב${venue ? `״${venueName}״` : "מתחם הזה"}`}
        body="כל האירועים שהיו משויכים למתחם נמחקו, ואפשר למחוק אותו עכשיו."
        action={
          venue ? (
            <Button variant="outline" onClick={() => setDeletingVenue(true)}>
              <Trash2 className="h-4 w-4" strokeWidth={2} />
              מחיקת המתחם
            </Button>
          ) : undefined
        }
      />
    ) : rows.length === 0 ? (
      <EmptyState
        icon={CalendarHeart}
        title="אין עדיין אירועים"
        body="ההפקה נספרת אחורה מתאריך האירוע — עד האישור: אזורים, גלריה, סקיצה והצעה; אחריו: צוות, הזמנות, רשימת ציוד ומפות — כל אחד עם יעד משלו. ברגע שיהיה כאן אירוע ראשון עם תאריך, המסך הזה יתחיל לספור."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            צור אירוע ראשון
          </Button>
        }
      />
    ) : visible.length === 0 ? (
      q ? (
        <NoResults
          title="לא נמצאו אירועים"
          body={`אין אירוע שתואם ל״${query.trim()}״ במה שמוצג כרגע. החיפוש עובר על שם הלקוח ועל האזורים באולם.`}
          onClear={() => setQuery("")}
          clearLabel="נקה חיפוש"
        />
      ) : filter === "attention" ? (
        // The good news, said plainly and without a colour: nothing here is late. This is the state
        // the whole screen is designed around being quiet in.
        <NoResults
          icon={CircleCheck}
          title="שום דבר לא דורש טיפול"
          body="כל נקודות הבקרה של האירועים הפתוחים עדיין בתוך לוח הזמנים, ואין שני אירועים שנוגעים זה בזה."
        />
      ) : (
        <NoResults
          icon={CalendarHeart}
          title={`אין אירועים ב״${LANE_LABEL[filter]}״`}
          body={LANE_HINT[filter]}
          onClear={laneToOffer ? () => setFilter(laneToOffer) : undefined}
          clearLabel={laneToOffer ? `מעבר ל״${LANE_LABEL[laneToOffer]}״ (${counts[laneToOffer]})` : undefined}
        />
      )
    ) : (
      groups.map((group) => (
        <section key={group.key || "undated"} aria-label={group.label}>
          {/* Sticky against the list's own scroller, on the page plane's own colour so rows pass
              cleanly underneath it. `z-10` and not higher: an open row menu lifts to `z-30` and has
              to be able to overhang this. */}
          <h2 className="sticky top-0 z-10 flex items-baseline gap-2 bg-bg py-2 text-caption font-bold text-muted">
            {group.label}
            <span className="nums font-semibold text-quiet">{group.rows.length}</span>
          </h2>
          <ul className="flex flex-col gap-2.5 pb-4">
            {group.rows.map((row) => {
              const band = collisionPlan.bandBefore.get(row.event.id);
              return (
                <ListItems key={row.event.id}>
                  {band && <CollisionBand message={band} />}
                  <RunwayRowCard
                    row={row}
                    actions={actionsFor(row)}
                    onOpen={() => setSelectedId(row.event.id)}
                    onAction={(target) => act(row, target)}
                    notes={collisionPlan.notes.get(row.event.id) ?? []}
                    showMoney={showMoney}
                    busy={pending === row.event.id}
                  />
                </ListItems>
              );
            })}
          </ul>
        </section>
      ))
    );

  return (
    <div className={`flex h-full flex-col ${PAGE_GUTTER}`}>
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-alert bg-alert-tint px-4 py-2.5 text-sm text-ink">
          {error}
        </p>
      )}

      {/* Scoped to one venue (page.tsx's `?venue=`): say so, and give the whole book back. Without
          this line the lane counts would quietly disagree with every other visit to this screen. */}
      {venueId && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface px-4 py-2.5 text-sm">
          <span className="font-semibold text-ink">אירועים ב״{venueName}״</span>
          <span className="nums text-muted">{rows.length}</span>
          {rows.length > 0 && (
            <span className="text-muted">— כדי למחוק את המתחם, מחקו את האירועים שבו מתפריט ה״…״ של כל אירוע.</span>
          )}
          <Link href="/production" className="ms-auto font-semibold text-accent hover:text-accent-hover">
            הצגת כל האירועים
          </Link>
        </div>
      )}

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <LaneFilter
          value={filter}
          counts={counts}
          needsAttention={needsAttention}
          onChange={setFilter}
        />
        {/* The shared component as-is, same bordered white field as every other search box in the
            app. An earlier pass elsewhere gave a search a one-off borderless look and it was
            reverted; there is no reason for this screen to be the place that tries it again. */}
        <SearchInput
          className="min-w-56 flex-1"
          value={query}
          onChange={setQuery}
          placeholder="חיפוש לפי לקוח או אזור…"
          aria-label="חיפוש אירועים ברשימת ההפקה"
        />
        <span className="nums shrink-0 text-sm text-muted">{visible.length} אירועים</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>

      <EventDetailDrawer
        event={selectedEvent}
        venueName={selectedVenueName}
        appointments={selectedAppointments}
        onClose={() => setSelectedId(null)}
        onContinue={(e, to = "/meeting") => go(e.id, to)}
        onEdit={setEditingEvent}
        onOpenAppointment={(a) => setBooking({ editing: a, date: a.date })}
        onCreateAppointment={(e) => setBooking({ editing: null, date: toISODate(new Date()), eventId: e.id })}
        onDelete={(e) => setDeleting({ id: e.id, clientName: e.clientName, date: e.date })}
        onEventChanged={() => router.refresh()}
      />

      <ConfirmDialog
        open={losing !== null}
        title={losing ? `לסמן את ${losing.clientName} כלא נסגר?` : ""}
        body="האירוע יעבור ל״הסתיים״ ויירד מההפקה ומההצעות. העיצוב, ההצעה והפרטים נשמרים כמו שהם, ואפשר להחזיר אותו לפעילות מאותו תפריט."
        confirmLabel="סמן כלא נסגר"
        onConfirm={() => {
          const target = losing;
          setLosing(null);
          if (target) void run(target.id, () => markEventLost(target.id));
        }}
        onClose={() => setLosing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `למחוק את ${deleting.clientName}?` : ""}
        body="האירוע יימחק לצמיתות, ואיתו האזורים, העיצוב, ההצעות, הפגישות והגלריה שלו. הוצאות שנרשמו עליו נשארות בספרים, ללא שיוך. אם רק רוצים להסתיר אותו — העברה לארכיון שומרת הכול."
        confirmLabel="מחיקת האירוע"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={deletingVenue}
        title={`למחוק את ${venueName}?`}
        body="המתחם יימחק לצמיתות, ואיתו הקירות, האזורים וההרשאות שניתנו עליו."
        confirmLabel="מחיקת המתחם"
        onConfirm={() => {
          setDeletingVenue(false);
          if (!venueId) return;
          setError(null);
          void removeVenue(venueId)
            .then((refused) => {
              if (refused) setError(refused.error);
              else router.push("/production");
            })
            .catch(() => setError("הפעולה לא הושלמה. נסה שוב."));
        }}
        onClose={() => setDeletingVenue(false)}
      />

      {crewFor && (
        <CrewDialog
          eventId={crewFor.id}
          clientName={crewFor.clientName}
          crewIds={crewFor.crewIds}
          onSaved={() => router.refresh()}
          onClose={() => setCrewFor(null)}
        />
      )}

      <EventDialog open={creating} onClose={() => setCreating(false)} />
      <EventDialog
        open={editingEvent !== null}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSaved={() => router.refresh()}
      />

      <AppointmentDialog
        open={booking !== null}
        appointment={booking?.editing ?? null}
        defaultDate={booking?.date ?? ""}
        defaultEventId={booking?.eventId}
        defaultVenueId={selectedEvent?.venueId}
        events={liveEvents}
        onSave={saveAppointment}
        onDelete={removeAppointment}
        onClose={() => setBooking(null)}
      />
    </div>
  );
}

/** A fragment that can carry a key, so a collision band and the row it precedes stay two direct
 *  children of the <ul> — a wrapper element between a list and its items is a wrapper element
 *  between a list and its items, and it is what makes a screen reader stop counting. */
function ListItems({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
