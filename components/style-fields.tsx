"use client";

import type { ElementStyle, DashPattern } from "@/lib/element-style";
import { NumberField } from "./number-field";
import { Select, type SelectOption } from "./select";

const DASH_OPTIONS: SelectOption[] = [
  { value: "solid", label: "רציף" },
  { value: "dashed", label: "מקווקו" },
  { value: "dotted", label: "מנוקד" },
];

const DEFAULT_SWATCH = "#6d55bd";

// A colour that can be "unset" (falls back to the renderer's own default) — a plain
// <input type="color"> can't represent that, so a checkbox toggles it on/off. Turning it off
// clears the field entirely rather than leaving a stale colour behind.
function ColorField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (value: string | undefined) => void }) {
  const on = value != null;
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-soft">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked ? (value ?? DEFAULT_SWATCH) : undefined)}
        className="h-3.5 w-3.5 rounded-sm border-border accent-[var(--color-accent)]"
      />
      {label}
      <input
        type="color"
        value={value ?? DEFAULT_SWATCH}
        disabled={!on}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-7 w-9 shrink-0 rounded-md border border-border bg-canvas p-0.5 disabled:cursor-not-allowed disabled:opacity-35"
      />
    </label>
  );
}

// Free-form per-element style controls (F: fill/stroke colour, stroke width, dash) — shared by
// the hall editor's stage/bar inspector, the studio table inspector, and the catalog appearance
// editor. Walls don't carry a style (see lib/element-style.ts), so this never appears for one.
export function StyleFields({
  style,
  onChange,
  strokeWidthDefault,
  fillLabel = "מילוי",
  strokeLabel = "קו מתאר",
}: {
  style: ElementStyle | undefined;
  onChange: (style: ElementStyle | undefined) => void;
  /** The caller's own default stroke width — shown at rest so the field never displays a number the element isn't actually drawn with. */
  strokeWidthDefault: number;
  fillLabel?: string;
  strokeLabel?: string;
}) {
  const patch = (p: Partial<ElementStyle>) => {
    const next: ElementStyle = { ...style, ...p };
    // Drop unset keys so an all-cleared style collapses back to `undefined` instead of leaving
    // an empty `{}` in the saved document.
    for (const k of Object.keys(next) as (keyof ElementStyle)[]) {
      if (next[k] === undefined) delete next[k];
    }
    onChange(Object.keys(next).length ? next : undefined);
  };

  return (
    <>
      <ColorField label={fillLabel} value={style?.fill} onChange={(v) => patch({ fill: v })} />
      <ColorField label={strokeLabel} value={style?.stroke} onChange={(v) => patch({ stroke: v })} />
      <NumberField
        layout="inline"
        label="עובי קו"
        decimals={1}
        min={0.5}
        step={0.5}
        value={style?.strokeWidthPx ?? strokeWidthDefault}
        onChange={(v) => patch({ strokeWidthPx: v })}
        className="w-14"
      />
      <label className="flex items-center gap-1.5 text-xs text-ink-soft">
        סגנון קו
        <Select
          value={style?.dash ?? "solid"}
          onChange={(v) => patch({ dash: v === "solid" ? undefined : (v as DashPattern) })}
          options={DASH_OPTIONS}
          className="w-20"
          aria-label="סגנון קו"
        />
      </label>
    </>
  );
}
