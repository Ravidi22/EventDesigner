"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";

/** One folded subject in a list of them: its icon and title, what it holds NOW read back on its end
 *  (so the list reads without opening anything), and its fields under it once opened.
 *
 *  Two places are made of these (2026-11-09, the user's redesign): the product drawer's "אפשר להשלים
 *  אחר כך" card — quiet rows inside one white card, hairlines between them — and the shape editor's
 *  side panel, where each group is a section of the panel and leads with an accent icon. Same row,
 *  two weights; the `variant` says which.
 *
 *  The open state is the caller's: the drawer keeps every row closed until asked, the editor keeps
 *  what the designer opened open across selections. */
export function FoldRow({
  icon: Icon,
  title,
  summary,
  open,
  onToggle,
  variant = "card",
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** What it holds now — text, or a few swatches and a word. */
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** "card": a row inside a card (no line above the first one). "panel": a section of a side panel,
   *  every one under a hairline. */
  variant?: "card" | "panel";
  children: ReactNode;
}) {
  const panel = variant === "panel";
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <div className={panel ? "border-t border-border-soft" : "border-t border-border-soft first:border-t-0"}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex w-full items-center gap-2.5 px-4 text-start transition-colors hover:bg-inset ${panel ? "py-[11px]" : "py-3"}`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${panel ? "text-accent" : "text-muted"}`} strokeWidth={1.75} />
        <span className={`whitespace-nowrap text-sm text-ink ${panel ? "font-bold" : "font-semibold"}`}>{title}</span>
        <span className={`flex min-w-0 flex-1 items-center justify-end gap-1.5 truncate text-xs ${panel ? "font-semibold text-ink-soft" : "text-muted"}`}>
          {summary}
        </span>
        <Chevron className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={2} />
      </button>
      {open && <div className={panel ? "px-4 pb-4 pt-0.5" : "px-4 pb-4 pt-1"}>{children}</div>}
    </div>
  );
}
