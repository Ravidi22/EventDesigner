"use client";

import type { ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";
import { initialsOf } from "@/lib/team/storage";

// The pieces every settings section is built from. Kept here rather than in components/ because
// nothing outside this route uses them yet — the moment a second screen wants a Panel, it moves.

/** A settings card: heading, optional hint, optional action in the header's end corner. */
export function Panel({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-border bg-surface ${className}`}>
      <header className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
        <div className="min-w-0">
          <h2 className="font-display text-h2 text-ink">{title}</h2>
          {hint && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

/** Initials disc. The three tones carry meaning: the gradient is you (matching the sidebar's
 *  profile card), tinted is a teammate, and a plain outline is someone from outside the studio —
 *  worth seeing at a glance in a list about who can reach your work. */
export function Avatar({
  name,
  tone = "member",
  className = "",
}: {
  name: string;
  tone?: "self" | "member" | "guest";
  className?: string;
}) {
  const tones = {
    self: "grad-cta text-canvas",
    member: "bg-accent-tint text-accent-deep",
    guest: "border border-border bg-inset text-muted",
  } as const;
  return (
    <span
      aria-hidden
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${tones[tone]} ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A hairline-separated list row. */
export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 border-b border-border-soft py-3.5 last:border-0 ${className}`}>
      {children}
    </div>
  );
}

/** A recessed note — context that is not itself a control. */
export function Note({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-md border border-inset-border bg-inset px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
      {icon && <span className="mt-px shrink-0 text-faint">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Destructive icon button — removing a person, revoking a share.
 *
 *  Written out rather than IconButton with a className: both would set a hover background, and
 *  which one wins is decided by the order Tailwind emits them, not by the order they are passed.
 *  The catalog's product drawer spells the same button out by hand for the same reason. */
export function RemoveButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-alert-tint hover:text-alert disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted"
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.7} />
    </button>
  );
}

// The on/off switch moved to components/toggle.tsx — the product drawer needed the same control,
// and re-exporting keeps every existing `import { Switch } from "./ui"` working.
export { Switch } from "@/components/toggle";

/** The "נשמר" flash shared by the autosaving forms. */
export function SavedFlag({ shown }: { shown: boolean }) {
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-xs text-muted transition-opacity ${shown ? "opacity-100" : "opacity-0"}`}
    >
      <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
      נשמר
    </span>
  );
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
