"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** One section of the event drawer: a quiet heading (with, at its end, the one thing the section
 *  can add or change) over a white card. Every section of the drawer is this — the details, the
 *  contacts, the diary, the sharing and the quote used to be five hand-written variations of it,
 *  one without a heading, one without padding, one with its action in the card instead. */
export function DrawerSection({
  title,
  action,
  flush,
  children,
}: {
  title: string;
  action?: ReactNode;
  /** A list whose rows run edge to edge (the diary) brings its own padding. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted">{title}</h3>
        {action}
      </div>
      <div className={"rounded-md border border-border bg-surface text-sm " + (flush ? "" : "p-4")}>{children}</div>
    </section>
  );
}

/** The heading's action — a small accent text button ("עריכה", "קביעת פגישה"). */
export function SectionAction({ icon: Icon, onClick, children }: { icon: LucideIcon; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      {children}
    </button>
  );
}
