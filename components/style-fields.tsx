"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { ElementStyle, DashPattern } from "@/lib/element-style";
import { NumberField } from "./number-field";
import { Select, type SelectOption } from "./select";

const DASH_OPTIONS: SelectOption[] = [
  { value: "solid", label: "רציף" },
  { value: "dashed", label: "מקווקו" },
  { value: "dotted", label: "מנוקד" },
];

const DEFAULT_SWATCH = "#6d55bd";
const HEX_RE = /^[0-9a-fA-F]{0,6}$/;

const toHex = (value: string | undefined) => (value ?? "").replace("#", "").toUpperCase();

// One Figma-style paint row: a clickable swatch (the native colour picker, cropped to a small
// rounded square), a hex field, and an opacity percentage — no checkbox. A paint that isn't set
// reads as an empty hex field over a neutral swatch; typing a full 6-digit hex or picking a colour
// is what turns it "on", and clearing the hex field back to empty is what turns it back off — the
// same on/off the checkbox used to gate, just driven by the field itself instead of a second control
// next to it. The trailing X is the one explicit way to clear both colour and opacity in one step,
// for a colour set from the picker (which never leaves the hex field empty on its own).
function ColorField({
  label,
  value,
  opacity,
  onChange,
  onOpacityChange,
}: {
  label: string;
  value: string | undefined;
  /** 0–1; undefined reads as fully opaque, same convention as resolveStyle's own default. */
  opacity: number | undefined;
  onChange: (value: string | undefined) => void;
  onOpacityChange: (opacity: number | undefined) => void;
}) {
  const hasColor = value != null;
  const focused = useRef(false);
  const [hexText, setHexText] = useState(() => toHex(value));
  useEffect(() => {
    if (!focused.current) setHexText(toHex(value));
  }, [value]);

  const pct = Math.round((opacity ?? 1) * 100);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      <div className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-canvas px-1.5">
        {/* The swatch IS the native colour input, just cropped to a small square — clicking it
            opens the OS picker directly, no separate "edit" step. A checkerboard shows through
            when unset, so an untouched row doesn't quietly imply a colour that isn't there. */}
        <label
          className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-border"
          style={
            hasColor
              ? { backgroundColor: value }
              : {
                  backgroundImage:
                    "linear-gradient(45deg, var(--color-border) 25%, transparent 25%), linear-gradient(-45deg, var(--color-border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-border) 75%), linear-gradient(-45deg, transparent 75%, var(--color-border) 75%)",
                  backgroundSize: "6px 6px",
                  backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0",
                }
          }
        >
          <input
            type="color"
            value={value ?? DEFAULT_SWATCH}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className="absolute inset-0 h-full w-full cursor-pointer border-none p-0 opacity-0"
          />
        </label>

        <input
          type="text"
          dir="ltr"
          value={hexText}
          placeholder="—"
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(e) => {
            const raw = e.target.value.replace("#", "");
            if (!HEX_RE.test(raw)) return;
            setHexText(raw.toUpperCase());
            if (raw.length === 6) onChange(`#${raw}`);
            else if (raw.length === 0) onChange(undefined);
          }}
          onBlur={() => {
            focused.current = false;
            setHexText(toHex(value)); // an incomplete hex (1–5 digits) snaps back to the last real value
          }}
          aria-label={`${label} — קוד צבע`}
          className="w-16 min-w-0 bg-transparent text-xs nums text-ink placeholder:text-faint focus-visible:outline-none"
        />

        <div className="h-4 w-px shrink-0 bg-border" />

        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          value={hasColor ? pct : ""}
          disabled={!hasColor}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw !== "" && !/^\d{0,3}$/.test(raw)) return;
            const n = raw === "" ? 0 : parseInt(raw, 10);
            onOpacityChange(Math.max(0, Math.min(100, n)) / 100);
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "ArrowUp") { e.preventDefault(); onOpacityChange(Math.min(100, pct + 5) / 100); }
            else if (e.key === "ArrowDown") { e.preventDefault(); onOpacityChange(Math.max(0, pct - 5) / 100); }
          }}
          aria-label={`${label} — שקיפות`}
          className="w-7 bg-transparent text-end text-xs nums text-ink placeholder:text-faint focus-visible:outline-none disabled:text-faint"
        />
        <span className="text-xs text-muted">%</span>

        <button
          type="button"
          onClick={() => {
            onChange(undefined);
            onOpacityChange(undefined);
          }}
          disabled={!hasColor}
          aria-label={`הסרת ${label}`}
          title={`הסרת ${label}`}
          className="shrink-0 rounded-sm p-0.5 text-muted transition-colors hover:bg-inset hover:text-ink disabled:cursor-not-allowed disabled:opacity-0"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// Free-form per-element style controls (fill/stroke colour + opacity, stroke width, dash) — shared
// by the hall editor's stage/bar inspector, the studio table inspector, and the catalog appearance
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
    <div className="flex flex-col gap-2.5">
      <ColorField
        label={fillLabel}
        value={style?.fill}
        opacity={style?.fillOpacity}
        onChange={(v) => patch({ fill: v })}
        onOpacityChange={(v) => patch({ fillOpacity: v })}
      />
      <ColorField
        label={strokeLabel}
        value={style?.stroke}
        opacity={style?.strokeOpacity}
        onChange={(v) => patch({ stroke: v })}
        onOpacityChange={(v) => patch({ strokeOpacity: v })}
      />
      <div className="flex flex-wrap items-center gap-2">
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
      </div>
    </div>
  );
}
