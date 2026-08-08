"use client";

import { useMemo, useState } from "react";
import type { EventSummary } from "@/lib/events/types";
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
    const inRange = events.filter((e) => !e.archived && e.date && e.date >= todayIso && e.date <= endIso);

    // Three tiles for the three stages an event can be sitting in that are worth counting: still
    // being shown the gallery, being drawn, or quoted. (There used to be a "ממתין לסקיצה" tile, back
    // when the table layout was drawn outside the app and the event just waited for it.)
    let gallery = 0;
    let design = 0;
    let sent = 0;
    for (const e of inRange) {
      const status = eventStatus(e, flow);
      if (status === "gallery") gallery++;
      else if (status === "design") design++;
      else if (status === "sent") sent++;
    }
    return { active: inRange.length, gallery, design, sent };
  }, [events, rangeDays, flow]);

  return (
    <div className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-surface p-5">
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
        <StatTile value={counts.gallery} label="בגלריה" tone="neutral" />
        <StatTile value={counts.design} label="בעיצוב" tone="accent" />
        <StatTile value={counts.sent} label="נשלחה הצעה" tone="success" />
      </div>
    </div>
  );
}

function StatTile({ value, label, tone }: { value: number; label: string; tone: "neutral" | "accent" | "success" }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-inset p-3">
      <p className="font-display text-h2 text-ink">{value}</p>
      <span className={"self-start rounded-pill px-2 py-0.5 text-[11px] font-medium " + TONE_CLASS[tone]}>{label}</span>
    </div>
  );
}
