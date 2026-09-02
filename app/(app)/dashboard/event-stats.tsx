"use client";

import { useMemo, useState } from "react";
import type { EventSummary, StatusTone } from "@/lib/events/types";
import { eventStatus } from "@/lib/events/types";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { Select } from "@/components/select";
import { addDays, toISODate, TONE_CLASS } from "./dashboard-view-utils";

const RANGE_OPTIONS = [
  { value: "7", label: "לשבוע הקרוב" },
  { value: "30", label: "חודש" },
  { value: "90", label: "3 חודשים" },
  { value: "180", label: "6 חודשים" },
  { value: "365", label: "שנה" },
];

// "סטטיסטיקת אירועים": counts within a forward-looking window (default the coming week),
// scoped to whatever venues the parent has already filtered `events` down to.
export function EventStats({ events }: { events: EventSummary[] }) {
  const [rangeDays, setRangeDays] = useState("7");
  const flow = useMeetingFlow();

  const counts = useMemo(() => {
    const todayIso = toISODate(new Date());
    const endIso = toISODate(addDays(new Date(), Number(rangeDays)));
    // `lostAt` as well as `archived`: an event the client turned down is not upcoming work, and
    // leaving it in would keep it in the headline count until someone remembered to file it.
    const inRange = events.filter(
      (e) => !e.archived && !e.lostAt && e.date && e.date >= todayIso && e.date <= endIso,
    );

    // ⚠ THESE TILES USED TO BE gallery / design / sent, and "נשלחה הצעה" was the last one — the
    // furthest an event could get, because a sent quote was the terminal state the data model had.
    // It isn't any more: `confirmedAt` records the client actually saying yes (see the column note
    // in lib/db/schema.ts), and a confirmed event returns its own status. Left as they were, these
    // three tiles would have silently DROPPED every booked event — the one outcome the row most
    // needs to show — and stopped summing to the headline above them.
    //
    // So the breakdown follows the money now rather than the meeting: being drawn, waiting on the
    // client, booked. The gallery pass is a stage inside a sitting and was never worth a tile of
    // its own here; the runway (/production) is where stage-level detail lives.
    let design = 0;
    let sent = 0;
    let confirmed = 0;
    for (const e of inRange) {
      const status = eventStatus(e, flow);
      if (status === "design") design++;
      else if (status === "sent") sent++;
      else if (status === "confirmed") confirmed++;
    }
    return { active: inRange.length, design, sent, confirmed };
  }, [events, rangeDays, flow]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-h2 text-ink">סטטיסטיקת אירועים</h3>
        <Select
          value={rangeDays}
          onChange={setRangeDays}
          options={RANGE_OPTIONS}
          aria-label="טווח זמן לסטטיסטיקה"
          className="w-40"
        />
      </div>

      <div className="rounded-md bg-inset p-4">
        <p className="font-display text-h1 text-ink">{counts.active}</p>
        <p className="mt-1 text-xs text-muted">פעילים בטווח שנבחר</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile value={counts.design} label="בעיצוב" tone="accent" />
        {/* `warn`, not `success`: a quote that has gone out and not been answered is a thing to
            chase, not a thing achieved. Same reasoning as STATUS_TONE.sent in lib/events/types.ts. */}
        <StatTile value={counts.sent} label="ממתין לתשובה" tone="warn" />
        <StatTile value={counts.confirmed} label="מאושר" tone="success" />
      </div>
    </div>
  );
}

function StatTile({ value, label, tone }: { value: number; label: string; tone: StatusTone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md bg-inset p-3">
      <p className="font-display text-h2 text-ink">{value}</p>
      {/* `block max-w-full truncate` (+ the title) instead of letting the pill size to its text. A
          third of a narrow card is about 67px of usable width, and "נשלחה הצעה" needs ~78px — so the
          longest of the three labels used to wrap to two lines INSIDE the pill, which made that one
          tile taller than the two beside it. It now clips with an ellipsis and keeps the row level;
          the full label is still one hover away. `min-w-0` on the tile is what lets it clip at all —
          a grid item's default `min-width: auto` refuses to go below its content. */}
      <span
        title={label}
        className={"block max-w-full self-start truncate rounded-pill px-2 py-0.5 text-[11px] font-medium " + TONE_CLASS[tone]}
      >
        {label}
      </span>
    </div>
  );
}
