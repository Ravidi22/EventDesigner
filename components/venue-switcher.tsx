"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { Venue } from "@/lib/venues/storage";

// Circular venue mark: the designer's uploaded logo when set, else the venue name's initial —
// same fallback pattern as ProductImage (app/(app)/catalog/product-image.tsx).
function VenueAvatar({ venue, tone = "tint" }: { venue: Venue; tone?: "tint" | "solid" }) {
  return (
    <span
      className={
        "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold " +
        (tone === "solid" ? "bg-accent text-canvas" : "bg-accent-tint text-accent")
      }
    >
      {venue.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs; next/image needs remote config we don't have yet
        <img src={venue.logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        venue.name.trim().charAt(0) || "?"
      )}
    </span>
  );
}

// The venue switcher — sits under the wordmark, scopes the whole shell to one business
// location. `collapsed` swaps the labeled trigger for an icon-only puck (icon rail mode).
export function VenueSwitcher({
  venues,
  activeId,
  collapsed = false,
  onSelect,
  onAdd,
}: {
  venues: Venue[];
  activeId: string;
  collapsed?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = venues.find((v) => v.id === activeId) ?? venues[0];

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

  return (
    <div ref={rootRef} className={"relative mb-6 " + (collapsed ? "px-0" : "px-2")}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={collapsed ? `אולם נבחר: ${active?.name ?? ""}` : undefined}
        title={collapsed ? active?.name : undefined}
        onClick={() => setOpen((o) => !o)}
        className={
          "flex w-full items-center gap-2.5 rounded-md border border-border bg-canvas text-start transition-colors hover:border-accent-line " +
          (collapsed ? "justify-center px-0 py-2" : "px-3 py-2")
        }
      >
        {active ? (
          <VenueAvatar venue={active} tone="solid" />
        ) : (
          <span className="h-7 w-7 shrink-0 rounded-full bg-accent-tint" />
        )}
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-sm font-medium text-ink">{active?.name}</span>
            <ChevronDown
              className={"h-4 w-4 shrink-0 text-muted transition-transform duration-150 " + (open ? "rotate-180" : "")}
              strokeWidth={2}
            />
          </>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="בחירת אולם"
          className={
            "absolute top-[calc(100%+6px)] z-20 w-max min-w-[14rem] overflow-hidden rounded-md border border-border bg-surface p-1 shadow-lifted " +
            (collapsed ? "start-0" : "start-0 w-full")
          }
        >
          {venues.map((v) => {
            const selected = v.id === activeId;
            return (
              <div
                key={v.id}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(v.id);
                  setOpen(false);
                }}
                className={
                  "flex cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 text-sm transition-colors " +
                  (selected
                    ? "bg-accent-wash font-semibold text-accent-hover"
                    : "text-ink-soft hover:bg-accent-tint hover:text-accent-hover")
                }
              >
                <VenueAvatar venue={v} />
                <span className="flex-1 truncate">{v.name}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
              </div>
            );
          })}

          <div className="my-1 border-t border-border-soft" />

          <button
            type="button"
            onClick={() => {
              onAdd();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-accent transition-colors hover:bg-accent-tint"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
            הוספת אולם
          </button>
        </div>
      )}
    </div>
  );
}
