"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { controlClassName, fieldLabelClassName } from "./control";

const format = (n: number, decimals?: number) => (decimals != null ? n.toFixed(decimals) : String(n));

// Tailwind resolves conflicting utilities (e.g. h-10 vs h-7) by their order in the generated
// stylesheet, not by where they land in a className string — so a caller can never shrink
// controlClassName's fixed h-10 by appending a smaller h-* class. A compact variant needs its own
// base rather than layering on top of the default one.
const sizeBase = {
  md: controlClassName,
  sm: "h-7 rounded-sm border border-border bg-canvas text-sm text-ink transition-colors hover:border-accent-line focus-visible:border-accent",
};

// Every numeric field in the app used to bind an <input type="number"> straight to a value derived
// fresh on each render (often through a unit conversion, e.g. mm -> cm) and re-parse it back on
// every keystroke. Since the displayed value is recomputed from the *committed* state, a trailing
// "." or a lone "-" got silently erased mid-edit the instant it round-tripped through the
// conversion — you could never type "12.5" one key at a time. This buffers the raw text locally
// while the field is focused and only reconciles with `value` on blur, so partial input survives
// long enough to finish typing. `type="text"` (not "number") also drops the unstyled native
// spinner, which never matched the EvE pill/hairline treatment anyway.
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  decimals,
  step = 1,
  commitOnBlur = false,
  hideZero = false,
  layout = "stack",
  size = "md",
  placeholder,
  required,
  error,
  errorMessage,
  id,
  className = "",
  wrapperClassName = "",
  "aria-label": ariaLabel,
  disabled,
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Fixed decimal places for the resting/formatted display (e.g. 2 for "3.40"). Default: plain `String(value)`. */
  decimals?: number;
  /** Amount ArrowUp/ArrowDown nudge the value. Default 1. */
  step?: number;
  /** Only call onChange when the field is blurred (or Enter), instead of on every valid keystroke.
   *  Use for fields that trigger an expensive recompute (e.g. rescaling a whole shape) where a
   *  live update per digit would be jumpy. Default false — most fields want live updates. */
  commitOnBlur?: boolean;
  /** Show an empty box instead of "0" when at rest and unfocused — for counts where 0 reads as "none". */
  hideZero?: boolean;
  /** "stack": label above the input, full width (form fields). "inline": label beside a compact
   *  input (toolbar / inspector rows) — matches the app's existing small numeric controls. */
  layout?: "stack" | "inline";
  /** "md" (default, h-10) matches every other control. "sm" (h-7) is for a dense data table row. */
  size?: "md" | "sm";
  placeholder?: string;
  required?: boolean;
  error?: boolean;
  errorMessage?: string;
  id?: string;
  className?: string;
  /** Classes for the outer <label> — e.g. `shrink-0` in a toolbar row. */
  wrapperClassName?: string;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  const focused = useRef(false);
  const display = (v: number) => (hideZero && v === 0 ? "" : format(v, decimals));
  const [text, setText] = useState(() => display(value));

  useEffect(() => {
    if (!focused.current) setText(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, hideZero]);

  const clamp = (n: number) => {
    let v = n;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };

  const commit = () => {
    focused.current = false;
    const parsed = parseFloat(text);
    const next = Number.isFinite(parsed) ? clamp(parsed) : value;
    setText(display(next));
    if (next !== value) onChange(next);
  };

  const nudge = (dir: 1 | -1) => {
    const current = parseFloat(text);
    const next = clamp((Number.isFinite(current) ? current : value) + dir * step);
    setText(display(next));
    onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      nudge(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nudge(-1);
    }
  };

  const input = (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      dir="ltr"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?\d*\.?\d*$/.test(raw)) return;
        focused.current = true;
        setText(raw);
        if (!commitOnBlur && raw !== "" && raw !== "-" && !raw.endsWith(".")) {
          const parsed = parseFloat(raw);
          if (Number.isFinite(parsed)) onChange(clamp(parsed));
        }
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={`${sizeBase[size]} nums text-end placeholder:text-faint ${layout === "stack" ? "w-full px-2.5" : size === "sm" ? "px-1.5" : "px-2"} ${
        error ? "border-alert hover:border-alert" : ""
      } ${className}`}
    />
  );

  if (layout === "inline") {
    return (
      <label className={`flex items-center gap-1.5 text-xs text-ink-soft ${wrapperClassName}`}>
        {label}
        {input}
      </label>
    );
  }

  return (
    <label className={`block ${wrapperClassName}`}>
      {label && (
        <span className={fieldLabelClassName}>
          {label}
          {required && <span className="text-alert"> *</span>}
        </span>
      )}
      {input}
      {error && errorMessage && <p className="mt-1 text-xs text-alert">{errorMessage}</p>}
    </label>
  );
}
