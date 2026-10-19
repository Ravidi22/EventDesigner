"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Check, Search } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { isVessel } from "@/lib/catalog/vessel";
import { controlClassName } from "@/components/control";
import { Swatch } from "@/components/swatch-field";
import { ProductImage } from "./product-image";

// Which vase or jug an arrangement stands in (lib/catalog/vessel.ts) — picked by typing.
//
// Not a Select: its list drops BELOW the trigger, and the item bar this opens from sits at the foot
// of the sketch, so the list ran off the canvas card and was cut (the user's screenshot, 2026-10-17).
// Here the list is part of the panel itself, in flow under the search field — the panel grows to
// hold it and the popover clamps the whole of it on screen — so there is nothing to clip. Typing
// narrows it (the name, the shade, Hebrew without niqqud); ↑↓ move, Enter picks.

export interface VesselChoice {
  value: string;
  label: string;
  hint?: string;
  product?: Product;
  swatch?: string;
}

/** Every vessel in the catalog as a choice — one per live shade, "name · shade". */
export function vesselChoices(products: readonly Product[]): VesselChoice[] {
  return products
    .filter((x) => isVessel(x) && !x.archived)
    .flatMap((x) => {
      const live = x.variants.filter((v) => !v.archived);
      return live.length
        ? live.map((v) => ({ value: v.id, label: live.length > 1 ? `${x.name} · ${v.name}` : x.name, product: x, swatch: v.swatch }))
        : [{ value: x.id, label: x.name, product: x }];
    });
}

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[֑-ׇ̀-ͯ]/g, "")
    .replace(/[״"'`]/g, "")
    .toLowerCase()
    .trim();

export function VesselPicker({
  value,
  onChange,
  choices,
  lead = [],
  autoFocus,
  listClassName = "max-h-56",
}: {
  /** The chosen value — one of `lead`'s or `choices`'. */
  value: string;
  onChange: (value: string) => void;
  choices: VesselChoice[];
  /** Rows above the vessels that are not vessels: "as in the catalog", "no vessel". */
  lead?: VesselChoice[];
  autoFocus?: boolean;
  listClassName?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const shown = useMemo(() => {
    const q = fold(query);
    if (!q) return [...lead, ...choices];
    const starts: VesselChoice[] = [];
    const within: VesselChoice[] = [];
    for (const c of choices) {
      const t = fold(c.label);
      if (t.startsWith(q)) starts.push(c);
      else if (t.includes(q)) within.push(c);
    }
    return [...starts, ...within];
  }, [query, choices, lead]);

  const pick = (i: number) => {
    const c = shown[i];
    if (!c) return;
    onChange(c.value);
    setQuery("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(active);
    }
  };

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
          aria-label="חיפוש כלי"
          placeholder={choices.length ? "חיפוש כד או אגרטל…" : "אין כלים בקטלוג"}
          value={query}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className={`${controlClassName} w-full ps-8 pe-2.5 placeholder:text-faint`}
        />
      </div>
      <div id={listId} role="listbox" aria-label="כלים" className={`scroll-slim mt-1.5 overflow-y-auto ${listClassName}`}>
        {shown.length === 0 && <p className="px-2.5 py-2 text-xs text-muted">אין כלי בשם הזה</p>}
        {shown.map((c, i) => {
          const chosen = c.value === value;
          return (
            <div
              key={c.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={chosen}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
              className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors ${i === active ? "bg-accent-tint text-ink" : "text-ink-soft"}`}
            >
              {c.product ? (
                <span className="h-7 w-7 shrink-0 overflow-hidden rounded-sm border border-border-soft">
                  <ProductImage product={c.product} />
                </span>
              ) : (
                <span className="h-7 w-7 shrink-0" aria-hidden />
              )}
              <span className={`min-w-0 flex-1 truncate ${chosen ? "font-semibold text-ink" : ""}`}>{c.label}</span>
              {c.swatch && <Swatch color={c.swatch} size={14} />}
              {chosen && <Check className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
