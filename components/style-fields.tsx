"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { ElementStyle, DashPattern } from "@/lib/element-style";
import { controlClassName, fieldLabelClassName } from "./control";
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

const UNSET_SWATCH = {
  backgroundImage:
    "linear-gradient(45deg, var(--color-border) 25%, transparent 25%), linear-gradient(-45deg, var(--color-border) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-border) 75%), linear-gradient(-45deg, transparent 75%, var(--color-border) 75%)",
  backgroundSize: "6px 6px",
  backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0",
};

// One paint row, the side panel's colour field (2026-11-09, the user's redesign): the label over a
// control-high box holding the swatch (the native colour picker, cropped to a small rounded square),
// the hex code beside it, and — once a colour is set — its opacity and the ✕ that takes it away. A
// paint that isn't set reads as `emptyLabel` over a checkerboard swatch; typing a full 6-digit hex
// or picking a colour turns it on, emptying the hex field or the ✕ turns it off.
export function ColorField({
  label,
  value,
  opacity,
  emptyLabel,
  onChange,
  onLive,
  onCommit,
  onOpacityChange,
  onClear,
}: {
  label: string;
  value: string | undefined;
  /** 0–1; undefined reads as fully opaque, same convention as resolveStyle's own default. */
  opacity: number | undefined;
  emptyLabel: string;
  onChange: (value: string | undefined) => void;
  /** Given, the OS picker's every move goes here instead of `onChange`, and `onCommit` comes when
   *  the colour is settled (the picker's `change`, or the swatch losing focus) — so a host with an
   *  undo history makes one drag ONE step (QA VS-8). */
  onLive?: (value: string) => void;
  onCommit?: () => void;
  /** Absent = no opacity field (a shade's swatch is a colour, no more). */
  onOpacityChange?: (opacity: number | undefined) => void;
  /** The colour AND its opacity gone, in ONE change. Two changes in a row both read the style as it
   *  was before either: the second put back the colour the first had just taken away, which is how
   *  the ✕ used to do nothing. */
  onClear: () => void;
}) {
  const hasColor = value != null;
  const focused = useRef(false);
  // React's onChange on a colour input is the native `input` (every move of the picker); the native
  // `change` — the colour settled — has no React prop of its own.
  const swatchRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  // eslint-disable-next-line react-hooks/refs -- the "latest value" ref the pointer-up listener reads; deliberate
  commitRef.current = onCommit;
  useEffect(() => {
    const el = swatchRef.current;
    if (!el) return;
    const settled = () => commitRef.current?.();
    el.addEventListener("change", settled);
    return () => el.removeEventListener("change", settled);
  }, []);
  const [hexText, setHexText] = useState(() => toHex(value));
  useEffect(() => {
    if (!focused.current) setHexText(toHex(value));
  }, [value]);

  const pct = Math.round((opacity ?? 1) * 100);

  return (
    <div className="min-w-0">
      <span className={fieldLabelClassName}>{label}</span>
      {/* Built on controlClassName's own geometry (h-10, rounded-sm) so it stands level with the
          NumberFields and Selects round it, and focused like one: `control-group` (app/globals.css)
          moves the focus ring off whichever input inside has it and onto this box. */}
      <div className={`${controlClassName} control-group flex items-center gap-1.5 px-1.5`}>
        {/* The swatch IS the native colour input, cropped to a square — a click opens the OS picker. */}
        <label className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-border" style={hasColor ? { backgroundColor: value } : UNSET_SWATCH}>
          <input
            ref={swatchRef}
            type="color"
            value={value ?? DEFAULT_SWATCH}
            onChange={(e) => (onLive ?? onChange)(e.target.value)}
            onBlur={() => onCommit?.()}
            aria-label={label}
            className="absolute inset-0 h-full w-full cursor-pointer border-none p-0 opacity-0"
          />
        </label>

        {/* The code reads left to right but sits against the swatch, at the box's start. */}
        <input
          type="text"
          dir="ltr"
          value={hexText}
          placeholder={emptyLabel}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(e) => {
            const raw = e.target.value.replace("#", "");
            if (!HEX_RE.test(raw)) return;
            setHexText(raw.toUpperCase());
            if (raw.length === 6) onChange(`#${raw}`);
            else if (raw.length === 0) onClear();
          }}
          onBlur={() => {
            focused.current = false;
            setHexText(toHex(value)); // an incomplete hex (1–5 digits) snaps back to the last real value
          }}
          aria-label={`${label} — קוד צבע`}
          className="w-0 min-w-0 flex-1 bg-transparent text-right text-xs nums text-ink placeholder:text-faint"
        />

        {hasColor && onOpacityChange && (
          <>
            <div className="h-4 w-px shrink-0 bg-border" />
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              value={pct}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw !== "" && !/^\d{0,3}$/.test(raw)) return;
                const n = raw === "" ? 0 : parseInt(raw, 10);
                onOpacityChange(Math.max(0, Math.min(100, n)) / 100);
              }}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  onOpacityChange(Math.min(100, pct + 5) / 100);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  onOpacityChange(Math.max(0, pct - 5) / 100);
                }
              }}
              aria-label={`${label} — שקיפות`}
              className="w-7 bg-transparent text-end text-xs nums text-ink"
            />
            <span className="text-xs text-muted">%</span>
            <button
              type="button"
              onClick={onClear}
              aria-label={`הסרת ${label}`}
              title={`הסרת ${label}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-inset hover:text-ink"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Free-form per-element style controls (fill/stroke colour + opacity, stroke width, dash) — shared
// by the hall editor's stage/bar inspector, the studio table inspector, and the catalog appearance
// editor (the item's look, and each shape's own). Walls don't carry a style (see
// lib/element-style.ts), so this never appears for one.
export function StyleFields({
  style,
  onChange,
  strokeWidthDefault,
  fillLabel = "מילוי",
  strokeLabel = "קו מתאר",
  fillOnly = false,
  lineOnly = false,
  emptyLabel = "ללא",
  onLiveChange,
  onCommit,
}: {
  style: ElementStyle | undefined;
  onChange: (style: ElementStyle | undefined) => void;
  /** A colour picker being dragged — every move, before the colour is settled; then `onCommit`.
   *  Absent, every move is an `onChange` (ColorField's onLive). */
  onLiveChange?: (style: ElementStyle | undefined) => void;
  onCommit?: () => void;
  /** The caller's own default stroke width — shown at rest so the field never displays a number the element isn't actually drawn with. */
  strokeWidthDefault: number;
  fillLabel?: string;
  strokeLabel?: string;
  /** Only the colour row — for what is drawn as a picture rather than an outline (a lawn, a palm),
   *  whose drawing reads the fill as its tint and has no line of its own to style. Offering the line
   *  rows there was offering controls that did nothing. */
  fillOnly?: boolean;
  /** Only the line rows — for what is lines and no inside (a shape drawn as lines only). */
  lineOnly?: boolean;
  /** What an unset colour reads as — "ללא", or "כמו הפריט" where unset means inherited. */
  emptyLabel?: string;
}) {
  const id = useId();
  const patch = (p: Partial<ElementStyle>, to: (style: ElementStyle | undefined) => void = onChange) => {
    const next: ElementStyle = { ...style, ...p };
    // Drop unset keys so an all-cleared style collapses back to `undefined` instead of leaving
    // an empty `{}` in the saved document.
    for (const k of Object.keys(next) as (keyof ElementStyle)[]) {
      if (next[k] === undefined) delete next[k];
    }
    to(Object.keys(next).length ? next : undefined);
  };
  const live = (key: "fill" | "stroke") => (onLiveChange ? (v: string) => patch({ [key]: v }, onLiveChange) : undefined);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2.5">
      {!lineOnly && (
        <ColorField
          label={fillLabel}
          value={style?.fill}
          opacity={style?.fillOpacity}
          emptyLabel={emptyLabel}
          onChange={(v) => patch({ fill: v })}
          onLive={live("fill")}
          onCommit={onCommit}
          onOpacityChange={(v) => patch({ fillOpacity: v })}
          onClear={() => patch({ fill: undefined, fillOpacity: undefined })}
        />
      )}
      {!fillOnly && (
        <>
          <ColorField
            label={strokeLabel}
            value={style?.stroke}
            opacity={style?.strokeOpacity}
            emptyLabel={emptyLabel}
            onChange={(v) => patch({ stroke: v })}
            onLive={live("stroke")}
            onCommit={onCommit}
            onOpacityChange={(v) => patch({ strokeOpacity: v })}
            onClear={() => patch({ stroke: undefined, strokeOpacity: undefined })}
          />
          {/* Side by side, each label over its field, the two halves of the panel's width. */}
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label htmlFor={`${id}-width`} className={fieldLabelClassName}>
                עובי קו
              </label>
              <NumberField
                id={`${id}-width`}
                decimals={1}
                min={0.5}
                step={0.5}
                value={style?.strokeWidthPx ?? strokeWidthDefault}
                onChange={(v) => patch({ strokeWidthPx: v })}
                className="w-full"
              />
            </div>
            <div className="min-w-0">
              <span className={fieldLabelClassName}>סגנון קו</span>
              <Select
                value={style?.dash ?? "solid"}
                onChange={(v) => patch({ dash: v === "solid" ? undefined : (v as DashPattern) })}
                options={DASH_OPTIONS}
                className="w-full"
                aria-label="סגנון קו"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
