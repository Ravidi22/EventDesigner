"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { controlClassName } from "./control";

export interface MultiSelectOption {
  value: string;
  label: string;
}

// Multi-value sibling of Select (components/select.tsx) — same trigger/listbox shape, but
// picking an option toggles it instead of committing and closing. Used where more than one
// item can be "on" at once (e.g. the dashboard's venue filter).
export function MultiSelect({
  values,
  onChange,
  options,
  id,
  "aria-label": ariaLabel,
  className = "",
  placeholder = "בחירה",
  countNoun = "מתחמים",
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  id?: string;
  "aria-label"?: string;
  className?: string;
  placeholder?: string;
  /** What the trigger counts when more than one is picked ("3 אזורים נבחרו"). */
  countNoun?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  const allSelected = options.length > 0 && values.length === options.length;
  const toggleAll = () => onChange(allSelected ? [] : options.map((o) => o.value));

  const triggerLabel =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? (options.find((o) => o.value === values[0])?.label ?? placeholder)
        : `${values.length} ${countNoun} נבחרו`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={`${controlClassName} flex w-full items-center gap-2 ps-3 pe-2.5 text-start`}
      >
        <span className={`flex-1 truncate ${values.length ? "text-ink" : "text-muted"}`}>{triggerLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel}
          className="scroll-slim absolute start-0 top-[calc(100%+6px)] z-20 max-h-72 w-full min-w-max overflow-auto rounded-md border border-border bg-surface p-1 shadow-lifted"
        >
          <div
            role="option"
            aria-selected={allSelected}
            onClick={toggleAll}
            className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-tint"
          >
            <span>{allSelected ? "נקה הכל" : "בחר הכל"}</span>
          </div>
          <div className="my-1 border-t border-border-soft" />
          {options.map((opt) => {
            const selected = values.includes(opt.value);
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={selected}
                onClick={() => toggle(opt.value)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-sm transition-colors ${
                  selected ? "bg-accent-wash font-semibold text-accent-hover" : "text-ink-soft hover:bg-accent-tint"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
