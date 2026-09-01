"use client";

import { fieldLabelClassName } from "./control";

// One row of mutually exclusive choices, filling its container. Every option gets the SAME width:
// with intrinsic widths the row spread itself unevenly at whatever length the Hebrew words happened
// to be ("אליפסה" three times "שם"), which reads as a broken control rather than as one question
// with four answers. flex-1 + no wrapping is the whole fix.
//
// Lives here rather than in the catalog drawer because the appearance modal asks one of these too,
// and the drawer already imports the modal — the other direction would be a cycle.
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      {/* The one field label the app has (control.ts). This used to default to its own lighter
          `text-muted` version and take a prop to override it back — which one caller did, so the
          same control was labelled two ways on two screens. */}
      <span className={fieldLabelClassName}>{label}</span>
      <div role="group" aria-label={label} className="flex gap-1 rounded-md border border-border p-0.5">
        {options.map(([v, optionLabel]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={
              "flex-1 rounded-sm px-2 py-1 text-xs transition-colors " +
              (value === v ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg")
            }
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
