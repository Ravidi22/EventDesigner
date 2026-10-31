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
      <div role="group" aria-label={label} className="flex gap-1 rounded-md border border-border p-0.5">
        {options.map(([v, optionLabel, Icon]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={
              "inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium leading-snug transition-colors " +
              (value === v ? "bg-accent text-canvas" : "text-ink-soft hover:bg-accent-tint hover:text-accent")
            }
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />}
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
