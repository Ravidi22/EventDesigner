"use client";

import type { ReactNode } from "react";
import { Check, Loader2, Eye, TriangleAlert } from "lucide-react";
import { Menu, type MenuItem } from "@/components/menu";

// What floats over a canvas besides the selection's bar (2026-11-09, the user's "Studio + Halls"
// board, top-bar option 1b — "everything floats"): no header bar above the plan. The canvas's own
// tool strip (PlanCanvas) holds history, zoom, the ruler and the document menu at the top-END
// corner; the VIEW cluster (which zone or which venue, the 3D) stands at the top-START corner; the
// save state is a pill in the bottom-start corner; and what the armed tool is waiting for reads in
// one row of pills under the corners' line, centred.

/** The top-start card: a zone or venue chooser, the 3D toggle. */
export function ViewCluster({ children }: { children: ReactNode }) {
  return (
    <div className="absolute start-4 top-4 z-20 flex items-center gap-0.5 rounded-md border border-border bg-surface p-1 shadow-floating">{children}</div>
  );
}

export type SaveState = "saving" | "saved" | "error" | "readonly";

/** Whether the plan is written down — there is no save button on these screens and never was: a
 *  write that fails has to say so itself. */
export function SavePill({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  return (
    <div className="absolute bottom-4 start-4 z-20 flex h-7 items-center rounded-pill border border-border bg-surface px-2.5 text-xs text-muted shadow-floating" aria-live="polite">
      {state === "readonly" ? (
        <span className="inline-flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" strokeWidth={2} />
          צפייה בלבד
        </span>
      ) : state === "saving" ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          שומר…
        </span>
      ) : state === "error" ? (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 font-semibold text-alert hover:underline">
          <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
          לא נשמר · נסו שוב
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
          נשמר
        </span>
      )}
    </div>
  );
}

/** The row the hints stand in: under the corners' line (68px down — the board's), centred. Each
 *  child is one `HintPill`; the row takes no pointer, a pill with a button in it takes its own. */
export function HintRow({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute inset-x-4 top-[68px] z-10 flex flex-col items-center gap-1.5">{children}</div>;
}

/** One hint: what the armed tool waits for, or a standing notice (a viewer's, a refused delete's). */
export function HintPill({ tone = "ink", children }: { tone?: "ink" | "warn" | "quiet"; children: ReactNode }) {
  const look =
    tone === "warn"
      ? "border border-warn/40 bg-warn-tint text-warn-ink"
      : tone === "quiet"
        ? "border border-border bg-surface text-ink-soft"
        : "bg-ink/85 text-canvas";
  return <div className={"max-w-[70%] rounded-pill px-4 py-2 text-center text-[13px] leading-snug shadow-floating " + look}>{children}</div>;
}

/** The document's own verbs (paste, numbering, saved sketches, the underlay), in the canvas strip's
 *  ⋯. An entry whose answer is a set of fields opens that group in the end panel rather than a
 *  panel of its own — fields live in the panel (the board's rule). */
export function DocumentMenu({ items }: { items: MenuItem[] }) {
  return <Menu label="פעולות על המסמך" side="bottom" items={items} />;
}
