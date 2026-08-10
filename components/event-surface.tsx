"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, PenTool, Printer } from "lucide-react";
import { activeEvent } from "@/lib/events/storage";
import { formatEventDate, zonesLabelOf, type EventSummary } from "@/lib/events/types";

// The studio and the operational outputs are surfaces OF an event, not pages of the app — which is
// why neither sits in the sidebar. You arrive by opening an event (from the flow, or from the Gantt
// afterwards), and this header is what says which event you are inside and lets you cross between
// the two without going back out to a list first.
//
// It is `no-print` throughout: the outputs underneath are the deliverable, and app chrome on a page
// the crew carries around the hall is noise.
export function EventSurface({ active, children }: { active: "studio" | "outputs"; children: ReactNode }) {
  const [event, setEvent] = useState<EventSummary | null>(null);

  // Resolve after mount, same as every other screen — the pointer is in this browser, the event
  // itself is a server read. Until it lands the header says "אין אירוע פעיל", which is also what it
  // says when there genuinely isn't one.
  useEffect(() => {
    let live = true;
    void activeEvent().then((e) => {
      if (live) setEvent(e);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="no-print flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-6 py-2.5">
        <Link
          href="/gantt"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover"
        >
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
          האירועים
        </Link>

        <span className="h-4 w-px bg-border" aria-hidden />

        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-ink">{event?.clientName ?? "אין אירוע פעיל"}</span>
          {event && (
            <span className="block truncate text-xs text-muted">
              {zonesLabelOf(event)} · {formatEventDate(event.date)}
            </span>
          )}
        </span>

        <nav className="ms-auto flex items-center gap-0.5 rounded-md border border-border p-0.5" aria-label="מסכי האירוע">
          <Tab href="/studio" icon={PenTool} active={active === "studio"}>
            סטודיו
          </Tab>
          <Tab href="/outputs" icon={Printer} active={active === "outputs"}>
            פלטים
          </Tab>
        </nav>

        <Link
          href="/meeting"
          className="rounded-md px-2 py-1 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
        >
          חזרה לזרימת הפגישה
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-auto print:overflow-visible">{children}</div>
    </div>
  );
}

function Tab({
  href,
  icon: Icon,
  active,
  children,
}: {
  href: string;
  icon: typeof PenTool;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-sm transition-colors " +
        (active ? "bg-accent-tint font-medium text-ink" : "text-ink-soft hover:text-ink")
      }
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {children}
    </Link>
  );
}
