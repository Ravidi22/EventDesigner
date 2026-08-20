"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { controlClassName } from "./control";

export interface SelectOption {
  value: string;
  label: string;
}

// Custom listbox replacing the native <select> — the OS-drawn control can't take the EvE
// pill/hairline treatment and its popup ignores our RTL logical properties. `className` sizes
// the trigger (e.g. "min-w-56", "max-w-64", "w-full"); the panel matches the trigger's width.
export function Select({
  value,
  onChange,
  options,
  id,
  "aria-label": ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const openAt = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(options.length - 1, index)));
    setOpen(true);
  };

  const commit = (index: number) => {
    const opt = options[index];
    if (opt) onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openAt(Math.max(0, options.findIndex((o) => o.value === value)));
        else setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openAt(Math.max(0, options.findIndex((o) => o.value === value)));
        else setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (open) commit(activeIndex);
        else openAt(Math.max(0, options.findIndex((o) => o.value === value)));
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openAt(Math.max(0, options.findIndex((o) => o.value === value))))}
        onKeyDown={onKeyDown}
        className={`${controlClassName} flex w-full items-center gap-2 ps-3 pe-2.5 text-start`}
      >
        <span className={`flex-1 truncate ${selected ? "text-ink" : "text-muted"}`}>{selected?.label ?? ""}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="scroll-slim absolute start-0 top-[calc(100%+6px)] z-20 max-h-64 w-full min-w-max overflow-auto rounded-md border border-border bg-surface p-1 shadow-lifted"
        >
          {options.map((opt, index) => {
            const isSelected = opt.value === value;
            const isActive = index === activeIndex;
            return (
              <div
                key={opt.value}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-sm transition-colors ${
                  isSelected
                    ? "bg-accent-wash font-semibold text-accent-hover"
                    : isActive
                      ? "bg-accent-tint text-ink"
                      : "text-ink-soft"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
