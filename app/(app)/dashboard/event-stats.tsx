"use client";

import { useMemo, useState } from "react";
import type { EventSummary } from "@/lib/events/types";
import { eventStatus } from "@/lib/events/types";
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

  const counts = useMemo(() => {
    const todayIso = toISODate(new Date());
    const endIso = toISODate(addDays(new Date(), Number(rangeDays)));
    const inRange = events.filter((e) => !e.archived && e.date && e.date >= todayIso && e.date <= endIso);

    let waiting = 0;
    let design = 0;
    let sent = 0;
    for (const e of inRange) {
      const status = eventStatus(e);
      if (status === "waiting") waiting++;
      else if (status === "design") design++;
      else if (status === "sent") sent++;
    }
    return { active: inRange.length, waiting, design, sent };
  }, [events, rangeDays]);

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
        <StatTile value={counts.waiting} label="ממתינים לסקיצה" tone="warn" />
        <StatTile value={counts.design} label="בעיצוב" tone="accent" />
        <StatTile value={counts.sent} label="נשלחה הצעה" tone="success" />
      </div>
    </div>
  );
}

function StatTile({ value, label, tone }: { value: number; label: string; tone: "warn" | "accent" | "success" }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-inset p-3">
      <p className="font-display text-h2 text-ink">{value}</p>
      <span className={"self-start rounded-pill px-2 py-0.5 text-[11px] font-medium " + TONE_CLASS[tone]}>{label}</span>
    </div>
  );
}
