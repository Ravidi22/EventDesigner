"use client";

import type { ReactNode } from "react";
import { Check, Eye, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/skeleton";

// The pieces the outputs and 3D screens share (2026-11-11, the user's claude.ai/design board
// "Outputs and 3D Drawers", turn 2: "one drawer system for Outputs & 3D"). Both wear the studio's
// canvas shell — a start rail, the work, the END PANEL (components/end-panel.tsx) — and these are
// what that shell needed on those two screens that the studio's did not:
//
// · the panel's FOOT: the screen's one outward action (print, share the PDF, the client link) and
//   its count, pinned under the groups — it never scrolls away, and put away the 48px column keeps
//   the same action as one round button;
// · CHECK ROWS: 16px boxes with a visible off state, a figure or a chip at the end (the booklet's
//   layers, zones and kits);
// · the FLOAT STRIP over the work: page and zoom on outputs, the camera on 3D, and on both the one
//   named "תצוגת לקוח" toggle.

/** The panel's foot: a status line (warn ink when something is off) and a figure at its end, then
 *  the action — one filled button and, beside it, the secondary actions as round outlined icons. */
export function PanelFoot({
  info,
  warn = false,
  side,
  action,
  extras = [],
  below,
}: {
  info: ReactNode;
  warn?: boolean;
  side?: ReactNode;
  action?: FootAction;
  extras?: FootAction[];
  /** Under the buttons, centred and quiet (the 3D view's scene figures). */
  below?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span role="status" className={"nums min-w-0 truncate " + (warn ? "font-semibold text-warn-ink" : "text-muted")}>
          {info}
        </span>
        {side && <span className="nums inline-flex shrink-0 items-center gap-1 text-quiet">{side}</span>}
      </div>
      {(action || extras.length > 0) && (
        <div className="flex items-center gap-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.title}
              className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-pill grad-cta text-sm font-bold text-canvas shadow-cta transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <action.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span className="truncate">{action.label}</span>
            </button>
          )}
          {extras.map((x) => (
            <button
              key={x.label}
              type="button"
              onClick={x.onClick}
              disabled={x.disabled}
              title={x.label}
              aria-label={x.label}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border-[1.5px] border-accent-line text-accent transition-colors hover:bg-accent-tint disabled:cursor-not-allowed disabled:opacity-40"
            >
              <x.icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          ))}
        </div>
      )}
      {below && <span className="nums text-center text-[11px] text-muted">{below}</span>}
    </div>
  );
}

export interface FootAction {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}

/** The foot's action in the put-away column: one round filled button. */
export function CollapsedAction({ action }: { action: FootAction }) {
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.label}
      aria-label={action.label}
      className="flex h-9 w-9 items-center justify-center rounded-full grad-cta text-canvas shadow-cta transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <action.icon className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

/** One switchable row: a 16px box (filled when in, a visible outline when out), the label, and a
 *  figure ("2 גיל׳") or a chip ("מומלץ", "ריק") at its end. */
export function CheckRow({
  on,
  onClick,
  disabled = false,
  meta,
  chip,
  children,
}: {
  on: boolean;
  onClick?: () => void;
  disabled?: boolean;
  meta?: ReactNode;
  /** A pill at the end — "מומלץ" in the accent's line, anything else (ריק) quiet. */
  chip?: string;
  children: ReactNode;
}) {
  const recommend = chip === "מומלץ";
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={on}
      className={"flex min-h-[34px] w-full items-center gap-2.5 rounded-sm px-2 text-start transition-colors " + (disabled ? "cursor-default" : "hover:bg-inset")}
    >
      <span
        aria-hidden
        className={
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] " +
          (on ? "border-accent bg-accent text-white" : disabled ? "border-border bg-surface" : "border-quiet bg-surface")
        }
      >
        {on && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className={"min-w-0 flex-1 truncate text-[13px] " + (disabled ? "font-medium text-faint" : on ? "font-semibold text-ink" : "font-medium text-ink-soft")}>{children}</span>
      {chip ? (
        <span className={"shrink-0 rounded-pill border px-[7px] text-[11px] font-semibold " + (recommend ? "border-accent-line text-accent-hover" : "border-border text-quiet")}>{chip}</span>
      ) : (
        meta !== undefined && meta !== null && meta !== "" && <span className="nums shrink-0 text-xs text-muted">{meta}</span>
      )}
    </button>
  );
}

/** A label over a control inside a group (the board's 12px medium soft-ink label). */
export function GroupField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
    </div>
  );
}

/** A row inside a group: what is wrong or where it comes from, and the link that fixes it. */
export function GroupLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[13px] text-ink-soft">
      <span className="min-w-0">{children}</span>
      {action && <span className="shrink-0 text-xs font-semibold text-accent">{action}</span>}
    </div>
  );
}

/** The panel while the work has not landed: the heading's place, then group rows as bars. */
export function PanelSkeleton() {
  return (
    <div role="status" aria-label="טוען">
      {["w-16", "w-[88px]", "w-14", "w-[72px]", "w-20"].map((w) => (
        <div key={w} className="flex items-center gap-2.5 border-t border-border-soft px-4 py-[13px]">
          <Skeleton className="h-4 w-4 rounded-[4px]" />
          <Skeleton className="h-3 w-[72px]" />
          <span className="flex-1" />
          <Skeleton className={`h-3 ${w}`} />
        </div>
      ))}
    </div>
  );
}

/** The strip that floats at the top centre of the work. */
export function FloatStrip({ children, under }: { children: ReactNode; under?: ReactNode }) {
  return (
    <div className="no-print pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-2.5">
      <div className="pointer-events-auto flex items-center gap-1 rounded-pill bg-inset p-1 shadow-lifted">{children}</div>
      {under}
    </div>
  );
}

export function StripDivider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

export function StripIcon({ icon: Icon, label, onClick, disabled }: { icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-pill text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}

/** "תצוגת לקוח" — the one place a screen is switched to what the client sees. On: both drawers away. */
export function ClientChip({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 py-1.5 text-[13px] transition-colors " +
        (on ? "bg-accent-tint font-bold text-accent" : "font-semibold text-ink-soft hover:bg-surface hover:text-ink")
      }
    >
      <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
      תצוגת לקוח
    </button>
  );
}
