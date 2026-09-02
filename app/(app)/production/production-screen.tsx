"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  CalendarHeart,
  CircleCheck,
  CircleSlash,
  MessagesSquare,
  PenTool,
  Plus,
  Printer,
  RotateCcw,
} from "lucide-react";
import type { Runway, RunwayRow } from "@/lib/production/runway";
import { LANE_HINT, LANE_LABEL, type LaneId } from "@/lib/production/runway";
import { confirmEvent, markEventLost, patchEvent, reopenEvent } from "@/lib/events/actions";
import { setActiveEventId } from "@/lib/events/storage";
import type { MenuItem } from "@/components/menu";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/button";
import { EmptyState, NoResults } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EventDialog } from "@/components/event-dialog";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { LoadRibbon } from "./load-ribbon";
import { LaneFilter, type FilterId } from "./lane-filter";
import { CollisionBand, RunwayRowCard } from "./runway-row";
import {
  groupByMonth,
  planCollisions,
  ribbonStart,
  rowsOutsideRibbon,
  scrollBehavior,
  sundayOf,
  todayOf,
  weekCells,
} from "./view-utils";

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
// So: three parts, top to bottom, and NOTHING ON THIS SCREEN SCROLLS SIDEWAYS.
//
//   1. A load ribbon — thirteen weeks across the content width. Navigation, not a chart.
//   2. A filter bar — the lanes are a FILTER, so exactly one of them renders, at full width.
//   3. The list — chronological always, grouped by month, one card shape at one density.
//
// And the aesthetic instruction that outranks all of them: THE SCREEN IS SILENT WHEN NOTHING IS
// WRONG. Alert ink appears for a late checkpoint and for a collision, and for nothing else. A
// designer whose book is on schedule opens this and sees dates and names.
export function ProductionScreen({ runway }: { runway: Runway }) {
  const router = useRouter();

  // `production` by default: the lane the designer is being PAID for. An event the client has said
  // yes to is work with a delivery date; everything else is still a conversation.
  //
  // ⚠ BUT NOT ONTO AN EMPTY LANE. `confirmedAt` is new, so on the first visit after it shipped
  // NOTHING is confirmed — every live event sits under מוקדם or בהצעה — and opening on a lane
  // reading "0" made a screen that was working perfectly look broken. It is not only a migration
  // artefact either: a studio between seasons, or one that files everything the week after, lands
  // in the same place honestly.
  //
  // So the opening lane is the first one that has anything in it, in the order the filter bar
  // already puts them. This is a DEFAULT, not a redirect — `setFilter` still goes wherever it is
  // told, an empty lane reached by clicking still renders its own empty state (that is an answer to
  // a question the designer asked), and the fallback is computed once at mount rather than tracking
  // `counts`, so confirming the last event in a lane cannot yank the view out from under the click
  // that confirmed it.
  const [filter, setFilter] = useState<FilterId>(() => {
    const order: LaneId[] = ["production", "proposal", "early", "closed"];
    return order.find((lane) => runway.counts[lane] > 0) ?? "production";
  });
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  // Which row has a mutation in the air, so it can be dimmed and its menu left alone. One at a
  // time is enough — these are single clicks on single rows, not a batch surface.
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The row whose "סומן כלא נסגר" is waiting on the confirmation. ONE dialog for the whole screen,
  // owned here rather than one per card — the same arrangement the catalog uses, and the reason
  // every delete in a surface asks the same question in the same words.
  const [losing, setLosing] = useState<RunwayRow | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  // The server's today, recovered from the runway rather than read off this browser's clock — see
  // todayOf. Everything the ribbon marks as "now" is measured against the same day the rows were.
  const today = useMemo(() => todayOf(runway), [runway]);

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
      runway.rows.filter((r) => {
        const inFilter = filter === "attention" ? Boolean(r.alert) : r.lane === filter;
        if (!inFilter) return false;
        return !q || `${r.event.clientName} ${r.event.zonesLabel}`.toLowerCase().includes(q);
      }),
    [runway.rows, filter, q],
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

  // The first visible row of each week is the ribbon's scroll target. `visible` is chronological, so
  // a week's rows are always contiguous and the first one it sees is the first one there is.
  const weekAnchors = useMemo(() => {
    const anchors = new Map<string, string>();
    let last = "";
    for (const row of visible) {
      if (!row.event.date) continue;
      const week = sundayOf(row.event.date);
      if (week !== last) {
        anchors.set(row.event.id, week);
        last = week;
      }
    }
    return anchors;
  }, [visible]);

  const ribbon = useMemo(() => {
    const start = ribbonStart(visible, today);
    return { cells: weekCells(visible, start, today), outside: rowsOutsideRibbon(visible, start) };
  }, [visible, today]);

  const scrollToWeek = (weekStart: string) => {
    // Queried out of the list rather than held in a ref map: the anchor moves every time the filter
    // changes, and a map of refs would have to be torn down and rebuilt to stay honest about it.
    const target = listRef.current?.querySelector<HTMLElement>(`[data-week="${weekStart}"]`);
    target?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  };

  // ── Mutations ────────────────────────────────────────────────────────────────────────────────
  //
  // Every one of these ends in `router.refresh()` rather than in local state. The runway is DERIVED
  // — lanes, checkpoints, alerts and collisions are all recomputed from the facts by the server —
  // so patching a row here would mean re-deriving the whole screen in the client from a shape the
  // client does not own. Refreshing re-runs page.tsx's `fetchRunway()` and the answer comes back
  // whole and consistent, which is the only way it can be right.
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
  // navigate. Same idiom the board used — the active event is a per-device UI position that lives
  // in localStorage (lib/events/storage.ts), not a route parameter.
  const go = (id: string, path: string) => {
    setActiveEventId(id);
    router.push(path);
  };

  const actionsFor = (row: RunwayRow): MenuItem[] => {
    const e = row.event;
    const items: MenuItem[] = [];

    // "The client said yes" is the ONE fact on this screen that nobody can derive — see the note on
    // `confirmedAt` — so it is the one thing here that is a button rather than a consequence. It is
    // offered only where it means something: an event already confirmed, lost or filed is not
    // waiting on an answer.
    if (!e.confirmedAt && !e.lostAt && !e.archived) {
      items.push({ label: "אישור הזמנה", icon: BadgeCheck, onSelect: () => void run(e.id, () => confirmEvent(e.id)) });
    }
    items.push({ label: "פתיחה בסטודיו", icon: PenTool, onSelect: () => go(e.id, "/studio") });
    items.push({ label: "פלטים תפעוליים", icon: Printer, onSelect: () => go(e.id, "/outputs") });
    items.push({ label: "המשך פגישה", icon: MessagesSquare, onSelect: () => go(e.id, "/meeting") });
    if (e.lostAt) {
      items.push({ label: "החזרה לפעילות", icon: RotateCcw, onSelect: () => void run(e.id, () => reopenEvent(e.id)) });
    }
    items.push({
      label: e.archived ? "שחזור מהארכיון" : "העברה לארכיון",
      icon: e.archived ? ArchiveRestore : Archive,
      onSelect: () => void run(e.id, () => patchEvent(e.id, { archived: !e.archived })),
    });
    // Last, and `danger`, so Menu draws its own hairline above it: the destructive row is never
    // flush against an ordinary one under a moving cursor.
    if (!e.lostAt) {
      items.push({ label: "סומן כלא נסגר", icon: CircleSlash, onSelect: () => setLosing(row), danger: true });
    }
    return items;
  };

  // ── Empty states ─────────────────────────────────────────────────────────────────────────────
  //
  // Three different nothings, and they mean three different things — the distinction the board got
  // right and the one worth keeping. "No events at all" is a first run and has to teach; "the lane
  // is empty" needs to say what belongs in it (LANE_HINT); "the search hid them" needs the way back.
  const laneToOffer = (["production", "proposal", "early", "closed"] as LaneId[])
    .filter((id) => id !== filter && runway.counts[id] > 0)
    .sort((a, b) => runway.counts[b] - runway.counts[a])[0];

  const list =
    runway.rows.length === 0 ? (
      <EmptyState
        icon={CalendarHeart}
        title="אין עדיין אירועים"
        body="ההפקה נספרת אחורה מתאריך האירוע — אזורים, גלריה, סקיצה, הצעה, אישור ורשימת ציוד, כל אחד עם יעד משלו. ברגע שיהיה כאן אירוע ראשון עם תאריך, המסך הזה יתחיל לספור."
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
          clearLabel={laneToOffer ? `מעבר ל״${LANE_LABEL[laneToOffer]}״ (${runway.counts[laneToOffer]})` : undefined}
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
                    onOpen={() => go(row.event.id, "/studio")}
                    notes={collisionPlan.notes.get(row.event.id) ?? []}
                    showMoney={showMoney}
                    weekAnchor={weekAnchors.get(row.event.id)}
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

      {/* The ribbon is navigation for the list underneath it, so it is drawn only when there is a
          list to navigate — thirteen disabled cells over an empty state say nothing. */}
      {visible.some((r) => r.event.date) && (
        <LoadRibbon cells={ribbon.cells} outside={ribbon.outside} onPick={scrollToWeek} />
      )}

      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <LaneFilter
          value={filter}
          counts={runway.counts}
          needsAttention={runway.needsAttention}
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

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {list}
      </div>

      <ConfirmDialog
        open={losing !== null}
        title={losing ? `לסמן את ${losing.event.clientName} כלא נסגר?` : ""}
        body="האירוע יעבור ל״הסתיים״ ויירד מההפקה ומההצעות. העיצוב, ההצעה והפרטים נשמרים כמו שהם, ואפשר להחזיר אותו לפעילות מאותו תפריט."
        confirmLabel="סמן כלא נסגר"
        onConfirm={() => {
          const row = losing;
          setLosing(null);
          if (row) void run(row.event.id, () => markEventLost(row.event.id));
        }}
        onClose={() => setLosing(null)}
      />

      <EventDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/** A fragment that can carry a key, so a collision band and the row it precedes stay two direct
 *  children of the <ul> — a wrapper element between a list and its items is a wrapper element
 *  between a list and its items, and it is what makes a screen reader stop counting. */
function ListItems({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
