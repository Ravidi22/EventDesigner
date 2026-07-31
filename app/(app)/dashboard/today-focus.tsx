"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, FLOW_STEPS, eventStatus } from "@/lib/events/types";
import { toISODate, TONE_CLASS } from "./dashboard-view-utils";

type Tab = "events" | "meetings";

// "פוקוס היום": what's actually happening today, split into two clear segments — the event
// itself (the wedding/event day, `event.date`) vs a scheduled client consultation
// (`event.meetingDate`) — with location up front either way, including which specific hall
// within the selected venue(s) each item is in.
export function TodayFocus({
  events,
  venueColor,
  onOpenEvent,
}: {
  events: EventSummary[];
  venueColor: (e: EventSummary) => string;
  onOpenEvent: (e: EventSummary) => void;
}) {
  const [tab, setTab] = useState<Tab>("events");
  const today = new Date();
  const todayIso = toISODate(today);

  const todayEvents = events.filter((e) => e.date === todayIso);
  const todayMeetings = events.filter((e) => e.meetingDate === todayIso);
  const shown = tab === "events" ? todayEvents : todayMeetings;

  return (
    // The one brand-toned card on this page — a quiet echo of the accent, not the full mesh
    // (no grain, no radial blooms: those are tuned for a large hero and just read as noise
    // at card size). A plain two-stop gradient in the accent/accent-deep range, dark enough
    // throughout that white text always clears AA (DESIGN.md: accent vs. white is 5.7:1).
    <div className="flex h-fit flex-col gap-4 rounded-lg bg-[linear-gradient(150deg,#6d55bd,#4b3a8c)] p-5 shadow-lifted">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-h2 text-canvas">פוקוס היום</h3>
          <p className="mt-0.5 text-xs text-canvas/75">
            {today.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="glass flex gap-1 rounded-pill p-1">
          <button
            type="button"
            onClick={() => setTab("events")}
            aria-pressed={tab === "events"}
            className={
              "rounded-pill px-3.5 py-1.5 text-sm transition-colors " +
              (tab === "events" ? "bg-canvas font-semibold text-accent-hover shadow-floating" : "text-canvas/85 hover:text-canvas")
            }
          >
            אירועים
          </button>
          <button
            type="button"
            onClick={() => setTab("meetings")}
            aria-pressed={tab === "meetings"}
            className={
              "rounded-pill px-3.5 py-1.5 text-sm transition-colors " +
              (tab === "meetings" ? "bg-canvas font-semibold text-accent-hover shadow-floating" : "text-canvas/85 hover:text-canvas")
            }
          >
            פגישות
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-canvas/80">
          {tab === "events" ? "אין אירועים מתקיימים היום." : "אין פגישות מתוכננות להיום."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((e) => {
            const status = eventStatus(e);
            const progress = Math.round((Math.min(e.step, FLOW_STEPS.length - 1) / (FLOW_STEPS.length - 1)) * 100);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpenEvent(e)}
                className="flex flex-col gap-2 rounded-md bg-canvas p-3 text-start shadow-floating transition-all hover:shadow-lifted"
              >
                <div className="flex items-center gap-2">
                  <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + venueColor(e)} aria-hidden />
                  <span className="flex-1 truncate text-sm font-semibold text-ink">{e.clientName}</span>
                  <span className={"shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium " + TONE_CLASS[STATUS_TONE[status]]}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-ink-soft">
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  {e.hallName}
                </span>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
