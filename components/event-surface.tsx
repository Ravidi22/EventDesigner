"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Box, PenTool, Presentation, Printer } from "lucide-react";
import { EventWorkspaceProvider, useEventWorkspace } from "@/lib/events/use-workspace";
import { formatEventDate, zonesLabelOf } from "@/lib/events/types";
import { HeaderSlot } from "@/components/header-slot";

// The studio and the operational outputs are surfaces OF an event, not pages of the app — which is
// why neither sits in the sidebar. You arrive by opening an event (from the flow, or from the
// production runway afterwards), and the top bar is what says which event you are inside and lets
// you cross between the two without going back out to a list first.
//
// ONE bar, the shell's own (HeaderSlot), laid out as the meeting's header is: the event's name in
// the title's place with its zones and date under it, the way across in the middle, the way out at
// the end — and the work under it in the same white card the meeting puts it in. It used to be a
// second, flat strip under the shell's card, under a title that said what the tab beside it said.
//
// `no-print` throughout: the outputs underneath are the deliverable, and app chrome on a page the
// crew carries around the hall is noise.
export type EventSurfaceTab = "studio" | "outputs" | "scene";

export function EventSurface({ active, children }: { active: EventSurfaceTab; children: ReactNode }) {
  // THE surface's one read, for the header AND for the screen inside it — see lib/events/
  // use-workspace.tsx. The header used to resolve the event for itself while the screen resolved
  // the same event again a moment later, which was two round trips for one answer.
  return (
    <EventWorkspaceProvider>
      <SurfaceHeader active={active} />
      <div className="h-full overflow-hidden rounded-md bg-surface shadow-floating print:block print:h-auto print:overflow-visible print:rounded-none print:bg-transparent print:shadow-none">
        {children}
      </div>
    </EventWorkspaceProvider>
  );
}

function SurfaceHeader({ active }: { active: EventSurfaceTab }) {
  // Until the one round trip lands the bar says "אין אירוע פעיל", which is also what it says when
  // there genuinely isn't one.
  const { workspace } = useEventWorkspace();
  const event = workspace?.event ?? null;

  return (
    <HeaderSlot>
      <Link
        href="/production"
        title="חזרה להפקה"
        aria-label="חזרה להפקה"
        className="-ms-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
      >
        <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
        <h1 className="truncate font-display text-h2 text-ink">{event?.clientName ?? "אין אירוע פעיל"}</h1>
        {event && (
          <span className="truncate text-xs text-muted">
            {zonesLabelOf(event)} · {formatEventDate(event.date)}
          </span>
        )}
      </div>

      {/* The meeting's stepper rail, holding the event's three working screens. */}
      <nav className="flex shrink-0 items-center gap-0.5 rounded-pill bg-inset p-1" aria-label="מסכי האירוע">
        <Tab href="/studio" icon={PenTool} active={active === "studio"}>
          סטודיו
        </Tab>
        <Tab href="/outputs" icon={Printer} active={active === "outputs"}>
          פלטים
        </Tab>
        <Tab href="/scene" icon={Box} active={active === "scene"}>
          תלת-ממד
        </Tab>
      </nav>

      <div className="flex flex-1 justify-end">
        {event && (
          <Link
            href="/meeting"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover"
          >
            <Presentation className="h-4 w-4" strokeWidth={1.75} />
            מצב פגישה
          </Link>
        )}
      </div>
    </HeaderSlot>
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
        "inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-caption transition-colors " +
        (active ? "bg-accent-tint font-bold text-accent" : "font-semibold text-ink-soft hover:bg-surface hover:text-ink")
      }
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {children}
    </Link>
  );
}
