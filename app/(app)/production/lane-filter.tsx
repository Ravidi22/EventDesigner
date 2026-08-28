"use client";

import { Fragment, useRef, type KeyboardEvent } from "react";
import { TriangleAlert } from "lucide-react";
import { LANE_LABEL, type LaneId, type Runway } from "@/lib/production/runway";

/** What the list is currently showing. The four lanes, plus the one cross-lane view. */
export type FilterId = LaneId | "attention";

const LANES: LaneId[] = ["production", "proposal", "early", "closed"];

// The filter bar's single choice: which lane, or "everything that needs attention".
//
// ── WHY ATTENTION LIVES IN THE SAME GROUP AS THE LANES ─────────────────────────────────────────
//
// It reads as "a segmented control plus a filter", and it behaves as one choice, because the number
// on it has to be true. `runway.needsAttention` counts rows carrying an alert ACROSS EVERY LANE —
// that is what the field is, and the whole point of it: a proposal nobody has answered and a
// confirmed event with no packing list are the same problem to a designer on a Tuesday morning. If
// switching to it kept the lane filter on, the badge would say 7 and the list would show 3, and the
// designer would have to work out which of the two numbers was lying.
//
// So it is a fifth radio in the same group, set off by a hairline. Mutually exclusive, visibly so,
// and the count on it means exactly what it says.
//
// ── WHY THESE ARE FILTERS AND NOT COLUMNS ──────────────────────────────────────────────────────
//
// Because five columns at 288px is what the board this screen replaces did, and it is why nothing
// on it could ever be read at a glance. One lane at full content width, and no horizontal scroll
// anywhere — see the note on LaneId in lib/production/runway.ts.
export function LaneFilter({
  value,
  counts,
  needsAttention,
  onChange,
}: {
  value: FilterId;
  counts: Runway["counts"];
  needsAttention: number;
  onChange: (next: FilterId) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Attention with nothing in it is not a place to go. Disabled rather than hidden: a control that
  // vanishes when the news is good takes the good news with it — a greyed "0" says "nothing is
  // late", which is a thing the designer actively wants to be told.
  const options: { id: FilterId; label: string; count: number; disabled: boolean }[] = [
    ...LANES.map((id) => ({ id: id as FilterId, label: LANE_LABEL[id], count: counts[id], disabled: false })),
    { id: "attention", label: "דורשים טיפול", count: needsAttention, disabled: needsAttention === 0 },
  ];

  const enabled = options.filter((o) => !o.disabled);

  const move = (delta: number) => {
    const at = enabled.findIndex((o) => o.id === value);
    // A disabled current value (attention went to zero under us) restarts from the first option
    // rather than wrapping off the end of a list it is not in.
    const next = enabled[(Math.max(at, 0) + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.id);
    // Roving tabindex: selection and focus move together, which is what a radiogroup promises.
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-filter="${next.id}"]`)?.focus();
  };

  // ⚠ RTL. The first option is drawn at the RIGHT edge, so ArrowRight walks BACKWARDS through the
  // list and ArrowLeft walks forwards. Getting this the LTR way round is the single most common
  // keyboard bug in a mirrored UI, and it is invisible to anyone testing with a mouse.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "Home":
        e.preventDefault();
        onChange(enabled[0].id);
        break;
      case "End":
        e.preventDefault();
        onChange(enabled[enabled.length - 1].id);
        break;
    }
  };

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label="מה מוצג ברשימה"
      onKeyDown={onKeyDown}
      className="flex shrink-0 items-center gap-1 rounded-md bg-bg p-1"
    >
      {options.map((option) => {
        const active = option.id === value;
        const attention = option.id === "attention";
        return (
          // A Fragment, not a wrapper element: role="radiogroup" wants its radios as descendants
          // and a div in between is a div in between — the same reason components/menu.tsx uses one.
          <Fragment key={option.id}>
            {/* The hairline that says "this one is not one of the four". A divider element rather
                than a border on the button, so it never reads as a coloured side-stripe on a
                control (DESIGN.md forbids those outright). */}
            {attention && <span className="mx-1 h-5 w-px bg-border" aria-hidden />}
            <button
              type="button"
              role="radio"
              data-filter={option.id}
              aria-checked={active}
              disabled={option.disabled}
              // Only the selected option is a tab stop; the arrow keys reach the rest. One Tab press
              // crosses the whole control instead of five.
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(option.id)}
              className={
                "flex items-center gap-1.5 rounded-sm px-3.5 py-1.5 text-sm transition-colors disabled:cursor-default " +
                (active
                  ? "bg-surface font-bold text-accent shadow-floating"
                  : option.disabled
                    ? "font-semibold text-quiet"
                    : "font-semibold text-muted hover:text-accent-hover")
              }
            >
              {/* The glyph is not decoration: it is what tells the attention option from the four
                  lanes in black and white, where its alert ink is just another grey. */}
              {attention && option.count > 0 && (
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              )}
              {option.label}
              <span
                className={
                  "nums text-xs font-semibold " +
                  (attention && option.count > 0 && !active
                    ? "text-alert-ink"
                    : active
                      ? "text-accent"
                      : "text-quiet")
                }
              >
                {option.count}
              </span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
