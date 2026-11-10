"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MAX_EVENT_SHADES, hasShade, shadeKey, toggleShade, type CatalogShade } from "@/lib/catalog/shades";
import { Button } from "./button";
import { Swatch } from "./swatch-field";
import { SearchInput } from "./search-input";
import { controlClassName, fieldLabelClassName } from "./control";

// ⚠ UNUSED UNTIL THE EVENT PALETTE IS RELOCATED. It was the details form's "גווני האירוע" field
// (components/event-form.tsx) until the "Modals & popups" board took it out of the event dialog —
// Ravid, 2026-11-10: "drop from the dialog, need to relocate it — think where, don't do". Moved here
// as it stood, so the place it goes next wears it unchanged. Nothing clears a stored palette in the
// meantime: the form stops sending `shades`, and `defaultVariantId` still reads what an event has
// (lib/catalog/shades.ts). Its caller fed it `fetchCatalogShades()` (lib/catalog/actions.ts).

/** גווני האירוע: the catalog's own shade names, several at once, in the order picked — the number
 *  on a tile is its preference. The offer keeps the catalog's order (most stocked first) so nothing
 *  moves under the pointer; a picked shade the catalog no longer carries stays at the end, where it
 *  can be taken off. Hidden while the catalog has no shades at all.
 *
 *  COLLAPSED by default. A studio's catalog carries dozens of shade names, and as a wall of chips
 *  they took more of the form than every other field together. Shut, it is one control-height row
 *  in the shape of the zones MultiSelect above it, reading the palette back in order (swatch +
 *  name, ellipsised); open, a dense grid of tiles with a search once the list is long.
 *
 *  The grid FLOATS, and it is `position: fixed`, not absolute. Opened in the flow it pushed the
 *  form down and grew the dialog; hung `absolute` out of this field it would be clipped twice over —
 *  by the dialog frame's scrolling body and by the modal <dialog> itself, which the UA makes a
 *  scroll container — the same edges the date popover died against. A fixed box's containing block
 *  is the viewport, so neither clips it, and it stays a DOM child of the dialog (no portal), so it
 *  is in the dialog's top layer rather than under its backdrop. The cost is placing it by hand:
 *  `place` reads the field's rect (and the width of the form row it sits in — the panel spans the
 *  whole row even when the field shares it with the sketch picker; in half a row the tiles came
 *  two to a line) on open, on resize and on any scroll, opens below unless there is more room
 *  above, and caps its height to the room it has, the tiles scrolling inside.
 *
 *  It closes from its trigger, its סיום, Escape, or a press anywhere outside it. Escape is taken
 *  in the capture phase with its default prevented, so in the dialog frame it folds the grid rather
 *  than closing the dialog (the same contract as components/popover.tsx). Enter in the search is
 *  held back from the form, or it would submit it. A palette holds MAX_EVENT_SHADES: once it is
 *  full the tiles still off are disabled and say so. The rank is part of the button's accessible
 *  name — an aria-label on a <span> inside a button is not read. */
export function ShadePicker({
  offered,
  value,
  onChange,
  className = "",
}: {
  offered: CatalogShade[];
  value: string[];
  onChange: (next: string[]) => void;
  /** The field's cell in the caller's grid row — span it when it stands alone. */
  className?: string;
}) {
  const labelId = useId();
  const triggerId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    // Written straight onto the panel's style, not through state: this runs on every scroll frame,
    // and re-rendering the form for each one would be work for nothing.
    const place = () => {
      const panel = panelRef.current;
      const field = triggerRef.current?.getBoundingClientRect();
      const row = rootRef.current?.parentElement?.getBoundingClientRect() ?? field;
      if (!panel || !field || !row) return;
      const margin = 12;
      const width = Math.min(row.width, window.innerWidth - margin * 2);
      const left = Math.min(Math.max(row.left, margin), window.innerWidth - margin - width);
      const below = window.innerHeight - field.bottom - 6 - margin;
      const above = field.top - 6 - margin;
      const down = below >= PANEL_WANTS || below >= above;
      Object.assign(panel.style, {
        left: `${left}px`,
        width: `${width}px`,
        top: down ? `${field.bottom + 6}px` : "",
        bottom: down ? "" : `${window.innerHeight - field.top + 6}px`,
        maxHeight: `${down ? below : above}px`,
      });
    };
    place();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !panelRef.current?.contains(t)) close(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const stale = value.filter((s) => !offered.some((o) => hasShade([o.name], s)));
  const chips: { name: string; swatch?: string }[] = [...offered, ...stale.map((name) => ({ name }))];
  if (!chips.length) return null;
  const rankOf = (name: string) => value.findIndex((s) => hasShade([s], name));
  const full = value.length >= MAX_EVENT_SHADES;
  // The palette as picked, wearing the catalog's swatch where it has one.
  const picked = value.map((name) => chips.find((c) => hasShade([c.name], name)) ?? { name });
  const q = shadeKey(query);
  const shown = q ? chips.filter((c) => shadeKey(c.name).includes(q)) : chips;

  return (
    <div ref={rootRef} className={className}>
      <span id={labelId} className={fieldLabelClassName}>
        גווני האירוע
      </span>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={`${labelId} ${triggerId}`}
        onClick={() => (open ? close() : setOpen(true))}
        className={`${controlClassName} flex w-full items-center gap-2 ps-3 pe-2.5 text-start`}
      >
        <span className={`min-w-0 flex-1 truncate ${picked.length ? "text-ink" : "text-muted"}`}>
          {picked.length === 0
            ? "בחרו גוונים מהקטלוג"
            : picked.map((c) => (
                <span key={c.name} className="me-3 whitespace-nowrap">
                  <Swatch color={c.swatch} size={12} className="me-1.5 align-[-1px]" />
                  {c.name}
                </span>
              ))}
        </span>
        {picked.length > 0 && <span className="nums shrink-0 text-xs text-muted">{picked.length}</span>}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
          }}
          className="fixed z-30 flex flex-col rounded-md border border-border bg-surface p-2 shadow-lifted"
        >
          {chips.length > 9 && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="חיפוש גוון"
              aria-label="חיפוש גוון"
              className="mb-2 shrink-0"
            />
          )}
          <div
            role="group"
            aria-labelledby={labelId}
            className="scroll-slim grid max-h-60 min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] content-start gap-1 overflow-y-auto"
          >
            {shown.map((c) => {
              const rank = rankOf(c.name);
              const on = rank !== -1;
              const blocked = !on && full;
              return (
                <button
                  key={c.name}
                  type="button"
                  aria-pressed={on}
                  disabled={blocked}
                  title={blocked ? `עד ${MAX_EVENT_SHADES} גוונים` : c.name}
                  onClick={() => onChange(toggleShade(value, c.name))}
                  className={`flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
                    on ? "bg-accent-wash font-semibold text-accent-hover" : "text-ink-soft hover:bg-accent-tint"
                  }`}
                >
                  <Swatch color={c.swatch} size={14} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {on && (
                    <span className="nums flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-pill bg-accent px-1 text-[11px] font-bold text-canvas">
                      <span className="sr-only">עדיפות </span>
                      {rank + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {shown.length === 0 && <p className="px-2 py-3 text-xs text-muted">אין בקטלוג גוון בשם הזה.</p>}
          <div className="mt-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-soft px-1 pt-2">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
              פריט שמונח בסקיצה מקבל את הגוון הראשון ברשימה שיש לו — לפי סדר הבחירה.
              {full && ` עד ${MAX_EVENT_SHADES} גוונים לאירוע.`}
            </p>
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="shrink-0 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                ניקוי הבחירה
              </button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => close()}>
              סיום
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Roughly the open grid's natural height (search, ~7 rows of tiles, the footer): below the field
 *  unless less than this fits there AND more fits above it. */
const PANEL_WANTS = 360;
