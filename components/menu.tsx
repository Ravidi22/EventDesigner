"use client";

import { Fragment, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Ellipsis, type LucideIcon } from "lucide-react";
import { IconButton } from "./icon-button";

// The "…" menu — a row of actions folded behind one button.
//
// It exists because the alternative does not scale: a card that reveals its actions on hover has to
// find room for every one of them, they land on top of whatever the card was already showing there,
// and on a touch screen there is no hover at all. One quiet button that is always there says the
// same thing in a quarter of the space, and it can hold a third action later without the card
// having to be redesigned around it.
//
// Built by hand for the same reason Select is (components/select.tsx): the native control cannot
// take the EvE treatment and its popup ignores this app's RTL logical properties. The keyboard
// contract is Select's, deliberately — ↑↓ to move, Enter/Space to choose, Escape to close, Tab to
// leave — and like Select it keeps focus on the trigger and points at the active row with
// aria-activedescendant rather than moving focus into the panel.
export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Destructive — drawn in the alert ink so it reads as different from the rows above it before
   *  it is read as a word. */
  danger?: boolean;
}

export function Menu({
  label,
  items,
  icon: Icon = Ellipsis,
  side = "bottom",
  onOpenChange,
  className = "",
}: {
  /** What the button is, for a screen reader and the tooltip — "אפשרויות לשולחן עגול 180", not
   *  "אפשרויות": in a grid of a hundred cards the bare word names all hundred of them. */
  label: string;
  items: MenuItem[];
  /** The "…" by default. A named group of actions inside a toolbar — "סדר בערימה", "בחירה" — wears
   *  its own glyph instead, so a bar of them reads as a row of subjects rather than a row of
   *  identical dots. */
  icon?: LucideIcon;
  /** Which way the panel opens. "bottom" for a menu on a card; "top" for one in a bar that is
   *  itself along the bottom of a canvas, where a downward panel would open off the screen. */
  side?: "top" | "bottom";
  /** Told when the panel opens and closes. The caller needs it because a panel that overflows its
   *  card is painted UNDER the next card unless that card is lifted while it is open — see the
   *  z-index note in app/(app)/catalog/product-card.tsx. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [open, setOpenState] = useState(false);
  // -1 = "open, but nothing is aimed at yet" — where a click on the trigger leaves it, so that
  // opening with the mouse does not pre-highlight a row the pointer is nowhere near.
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Memoised only so the outside-click listener below can depend on it honestly. A caller that
  // passes an inline arrow re-binds one document listener per render, which costs nothing.
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  // A press anywhere else closes it. On pointerdown rather than click, matching Select: the panel
  // is gone before the click lands, so a press on the card underneath does what a press on that
  // card normally does.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, setOpen]);

  const openAt = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  const choose = (index: number) => {
    const item = items[index];
    setOpen(false);
    setActiveIndex(-1);
    item?.onSelect();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (open) setActiveIndex((i) => Math.min(items.length - 1, i + 1));
        else openAt(0);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) setActiveIndex((i) => Math.max(0, i - 1));
        else openAt(items.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (open && activeIndex >= 0) choose(activeIndex);
        else if (!open) openAt(0);
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          // …and stops here. A screen may bind its own Escape to the window — the studio clears the
          // selection on it — and one press that both closed this menu and wiped the selection would
          // take the menu's own trigger off the screen with it.
          e.stopPropagation();
          setOpen(false);
        }
        break;
      case "Tab":
        if (open) setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <IconButton
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${menuId}-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openAt(-1))}
        onKeyDown={onKeyDown}
        className={open ? "bg-accent-tint text-accent-hover" : ""}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </IconButton>

      {open && (
        // Aligned END-to-END with the trigger, which in an RTL screen means the panel hangs to the
        // right of it and stays inside the card rather than off the edge of it.
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute end-0 z-40 min-w-40 rounded-md border border-border bg-surface p-1 shadow-lifted ${
            side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          }`}
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            // A hairline wherever the list turns destructive — no flag to pass, and it means the
            // last ordinary row and the one that destroys something are never flush against each
            // other under a moving cursor.
            const separated = item.danger && index > 0 && !items[index - 1].danger;
            return (
              // A Fragment, not a wrapper element: role="menu" wants its menuitems as direct
              // children, and a div in between is a div in between.
              <Fragment key={item.label}>
                {separated && <div role="separator" className="my-1 h-px bg-border" />}
                <button
                  type="button"
                  id={`${menuId}-${index}`}
                  role="menuitem"
                  // Focus stays on the trigger (aria-activedescendant), so these are not tab stops.
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(index)}
                  className={`flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-start text-sm transition-colors ${
                    item.danger
                      ? index === activeIndex
                        ? "bg-alert-tint text-alert"
                        : "text-alert"
                      : index === activeIndex
                        ? "bg-accent-tint text-ink"
                        : "text-ink-soft"
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
                  <span className="truncate">{item.label}</span>
                </button>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
