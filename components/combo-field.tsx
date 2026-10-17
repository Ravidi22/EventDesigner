"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { controlClassName, fieldLabelClassName } from "./control";

// A text field with suggestions — the system's own, not the browser's <datalist>, whose popup is
// OS-drawn, ignores our RTL layout and cannot show anything beside a word. The panel is Select's
// panel (components/select.tsx): the same card, the same rows, the same keyboard contract
// (↑↓ move, Enter picks, Escape closes, Tab leaves) and `aria-activedescendant`, so a combobox
// and a listbox standing side by side in a form read as one system.
//
// The answer stays OPEN: what is typed is the value, whether or not it matches a suggestion. A
// pick is a convenience that also tells the caller WHICH suggestion was taken (`onPick`), for the
// facts a suggestion carries beyond its text — a flower's kind and colour.

export interface ComboOption {
  /** What picking it writes into the field. */
  value: string;
  /** Shown in the row; usually the value. */
  label?: string;
  /** A quiet word at the row's end: where it is from, what kind of thing it is. */
  hint?: string;
  /** A small picture at the row's start. */
  icon?: ReactNode;
}

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[֑-ׇ̀-ͯ]/g, "")
    .replace(/[״"'`]/g, "")
    .toLowerCase()
    .trim();

export function ComboField({
  value,
  onChange,
  onPick,
  options,
  label,
  placeholder,
  id,
  "aria-label": ariaLabel,
  className = "",
  autoFocus,
  maxItems = 8,
}: {
  value: string;
  onChange: (value: string) => void;
  /** A suggestion was taken — after `onChange` has been called with its value. */
  onPick?: (option: ComboOption) => void;
  options: ComboOption[];
  label?: string;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  className?: string;
  autoFocus?: boolean;
  /** How many suggestions the panel shows at most — it is a prompt, not a catalog. */
  maxItems?: number;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // What matches what is typed: a prefix match first, then anywhere in the word. An empty field
  // offers the first few, so the list is discoverable before a letter is typed.
  const shown = useMemo(() => {
    const q = fold(value);
    if (!q) return options.slice(0, maxItems);
    const starts: ComboOption[] = [];
    const within: ComboOption[] = [];
    for (const o of options) {
      const t = fold(o.label ?? o.value);
      if (t === q) continue; // already typed in full — nothing to suggest about it
      if (t.startsWith(q)) starts.push(o);
      else if (t.includes(q)) within.push(o);
      if (starts.length >= maxItems) break;
    }
    return [...starts, ...within].slice(0, maxItems);
  }, [value, options, maxItems]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const visible = open && shown.length > 0;

  const commit = (index: number) => {
    const opt = shown[index];
    if (!opt) return;
    onChange(opt.value);
    onPick?.(opt);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!visible) {
          setActiveIndex(0);
          setOpen(true);
        } else setActiveIndex((i) => Math.min(shown.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (visible) setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Enter":
        if (visible) {
          e.preventDefault();
          commit(activeIndex);
        }
        break;
      case "Escape":
        if (visible) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const input = (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={visible}
        aria-controls={listboxId}
        aria-activedescendant={visible ? `${listboxId}-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={`${controlClassName} w-full px-2.5 placeholder:text-faint`}
      />
      {visible && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="scroll-slim absolute start-0 top-[calc(100%+6px)] z-20 max-h-64 w-full min-w-max overflow-auto rounded-md border border-border bg-surface p-1 shadow-lifted"
        >
          {shown.map((opt, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={opt.value}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActiveIndex(index)}
                // Keep the focus in the field: a mousedown that blurred it would close the panel
                // before the click could pick.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(index)}
                className={`flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-sm transition-colors ${isActive ? "bg-accent-tint text-ink" : "text-ink-soft"}`}
              >
                {opt.icon && <span className="flex h-5 w-5 shrink-0 items-center justify-center">{opt.icon}</span>}
                <span className="truncate">{opt.label ?? opt.value}</span>
                {opt.hint && <span className="ms-auto shrink-0 ps-3 text-xs text-muted">{opt.hint}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!label) return input;
  return (
    <label className="block">
      <span className={fieldLabelClassName}>{label}</span>
      {input}
    </label>
  );
}
