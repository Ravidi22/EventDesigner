"use client";

import type { LucideIcon } from "lucide-react";
import { fieldLabelClassName } from "./control";

// One row of mutually exclusive choices, filling its container. Every option gets the SAME width:
// with intrinsic widths the row spread itself unevenly at whatever length the Hebrew words happened
// to be ("אליפסה" three times "שם"), which reads as a broken control rather than as one question
// with four answers. flex-1 + no wrapping is the whole fix. (The 3D tab's light row — יום / ערב /
// לילה with a sun, a sunset and a moon — was a hand-rolled pill of intrinsic widths, and read
// exactly that way; it is one of these now, with the icons.)
//
// Lives here rather than in the catalog drawer because the appearance modal asks one of these too,
// and the drawer already imports the modal — the other direction would be a cycle.
export function Segmented<T extends string>({
  label,
  hideLabel = false,
  value,
  options,
  onChange,
}: {
  label: string;
  /** The label is not drawn — a heading above the control already says it. It still names the
   *  group for a screen reader. */
  hideLabel?: boolean;
  value: T;
  /** Value, label, and an optional icon drawn before the label. */
  options: readonly (readonly [T, string] | readonly [T, string, LucideIcon])[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      {/* The one field label the app has (control.ts). This used to default to its own lighter
          `text-muted` version and take a prop to override it back — which one caller did, so the
          same control was labelled two ways on two screens. */}
      {!hideLabel && <span className={fieldLabelClassName}>{label}</span>}
      <div role="group" aria-label={label} className={segmentFrameClass(false)}>
        {options.map(([v, optionLabel, Icon]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={segmentClass(value === v, false)}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />}
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The segmented look of the "Studio + Halls" board (2026-11-09, the user: "all the toggles in the side
 *  panel look off" — the chosen option was a filled violet chip): a hairline frame, the chosen option
 *  in the accent WASH with deep ink at 700, the others soft ink at 500. `compact` is the quick bar's
 *  (options as wide as their words, 24px); otherwise every option takes the same width (a panel's).
 *  One look for `Segmented` and plan-canvas's `SegmentedToggle`. */
export function segmentFrameClass(compact: boolean): string {
  return compact
    ? "flex shrink-0 items-center gap-0.5 rounded-[12px] border border-border bg-surface p-0.5"
    : "flex gap-1 rounded-md border border-border bg-surface p-0.5";
}

export function segmentClass(on: boolean, compact: boolean): string {
  return (
    (compact
      ? "inline-flex min-h-6 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 py-0.5 text-xs leading-snug transition-colors "
      : "inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-xs leading-snug transition-colors ") +
    (on ? "bg-accent-wash font-bold text-accent-deep" : "font-medium text-ink-soft hover:bg-accent-tint hover:text-accent")
  );
}
