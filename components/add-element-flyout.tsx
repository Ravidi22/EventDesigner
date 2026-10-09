"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronUp, Search as SearchIcon, Shapes, type LucideIcon } from "lucide-react";

// The add-element trigger and its flyout — a searchable gallery of cards instead of a flat text
// list, so picking an element reads more like choosing a product than reading a menu.
//
// Two canvases add things this way: the hall plan (a bar, a stage, a pool — app/(app)/halls) and the
// catalog's appearance editor (a shape beside the item's base shape). One component, so the gesture
// is learned once: click a card and then a spot on the canvas, or drag the card onto it. The drag
// payload is the item's `id` as "text/plain" and nothing else — PlanCanvas's onDropAt reads it back.
//
// Opens upward, not down, since the dock it sits in is pinned to the canvas's bottom edge — there is
// no room below it to pop into.
const FLYOUT_WIDTH = 420;
const FLYOUT_GAP = 8;
const FLYOUT_MARGIN = 16; // never closer than this to the viewport edge

export interface FlyoutItem {
  /** Stable within one list, and the entire payload of a drag onto the canvas. */
  id: string;
  label: string;
  section: string;
  /** The card's picture — the item's own footprint, where it has one. */
  preview: ReactNode;
  title?: string;
  disabled?: boolean;
}

export function AddElementFlyout({
  open,
  onOpenChange,
  items,
  sections,
  armedId,
  onPick,
  triggerIcon,
  triggerLabel = "אלמנט",
  searchPlaceholder = "חיפוש אלמנט...",
  columns = 4,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: FlyoutItem[];
  /** In display order; a section with nothing in it (after the search) is not shown. */
  sections: { id: string; label: string }[];
  armedId: string | null;
  onPick: (id: string) => void;
  /** What the trigger shows — the armed item's icon, in the hall plan. */
  triggerIcon?: LucideIcon;
  triggerLabel?: string;
  searchPlaceholder?: string;
  columns?: 3 | 4;
}) {
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Screen-space (not `absolute` inside the canvas): the toolbar dock lives inside the canvas's own
  // `overflow-hidden` section (it clips the SVG's corners), and an `absolute` popup wide enough to
  // run past that section's edge got its own corner sheared off along with it — "cuts the card".
  // `fixed` escapes that ancestor entirely; the position is plain viewport math instead of
  // RTL-logical insets because `fixed` coordinates are physical regardless of `dir`. Measured at the
  // moment of the click that opens it (a DOM read the trigger's own handler is already in a position
  // to make), not in an effect reacting to `open` — there is nowhere else `open` ever turns true.
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);
  const query = search.trim();
  const filtered = query ? items.filter((t) => t.label.includes(query)) : items;
  const TriggerIcon = triggerIcon ?? Shapes;
  const openFlyout = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(
        FLYOUT_MARGIN,
        Math.min(r.right - FLYOUT_WIDTH, window.innerWidth - FLYOUT_WIDTH - FLYOUT_MARGIN),
      );
      setPos({ left, bottom: window.innerHeight - r.top + FLYOUT_GAP });
    }
    onOpenChange(true);
  };
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        title={`הוספת ${triggerLabel}`}
        aria-pressed={!!armedId}
        aria-expanded={open}
        onClick={() => (open ? onOpenChange(false) : openFlyout())}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          armedId ? "bg-accent-tint text-accent" : "text-muted hover:bg-inset"
        }`}
      >
        <span className="flex items-center gap-0.5">
          <TriggerIcon className="h-[18px] w-[18px]" strokeWidth={1.6} />
          <ChevronUp className="h-3 w-3" strokeWidth={2} />
        </span>
        {triggerLabel}
      </button>

      {open && pos && (
        <>
          {/* A full-screen, invisible backdrop is what makes "click anywhere else" close the menu —
              the same pattern the canvas's own (now-retired) right-click menu used. */}
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <div
            role="menu"
            className="fixed z-50 rounded-md border border-border bg-surface p-3 shadow-floating"
            style={{ left: pos.left, bottom: pos.bottom, width: FLYOUT_WIDTH }}
          >
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted" style={{ insetInlineStart: 10 }} strokeWidth={1.75} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full rounded-md border border-border bg-canvas py-2 text-sm text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
                style={{ paddingInlineStart: 32, paddingInlineEnd: 10 }}
              />
            </div>

            {/* Sectioned rather than one flat grid: "בריכה" and "בר בצורת ח 360×180" are not the same
                kind of choice. Capped in height — a catalog with forty bars in it must not push the
                flyout off the top of the screen. */}
            <div className="mt-3 flex max-h-[46vh] flex-col gap-3 overflow-y-auto">
              {sections.map((section) => {
                const inSection = filtered.filter((t) => t.section === section.id);
                if (inSection.length === 0) return null;
                return (
                  <div key={section.id}>
                    <p className="mb-1.5 font-label text-[10px] font-medium tracking-[2px] text-muted">{section.label}</p>
                    <div className={`grid gap-2 ${columns === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
                      {inSection.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          disabled={item.disabled}
                          title={item.title ?? item.label}
                          draggable={!item.disabled}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", item.id);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => onPick(item.id)}
                          className={`flex flex-col items-center gap-1.5 rounded-md border p-2 text-center text-[11px] font-semibold leading-tight transition-colors ${
                            armedId === item.id
                              ? "border-accent bg-accent-tint text-accent"
                              : "border-border text-ink hover:border-accent-line hover:bg-inset"
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          {item.preview}
                          <span className="line-clamp-2 w-full">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="py-4 text-center text-xs text-muted">לא נמצאו אלמנטים</p>}
            </div>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
              גררו אלמנט אל הקנבס, או לחצו עליו ואז על מקום בקנבס
            </p>
          </div>
        </>
      )}
    </div>
  );
}
