"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Plus } from "lucide-react";
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
  onRename,
}: {
  venues: Venue[];
  /** Null on a studio with no venues yet — the switcher shows its own empty state. */
  activeId: string | null;
  collapsed?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
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

  const startRename = (v: Venue) => {
    setRenamingId(v.id);
    setRenameValue(v.name);
  };
  const commitRename = () => {
    if (renamingId) onRename(renamingId, renameValue);
    setRenamingId(null);
  };

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
            const renaming = renamingId === v.id;
            if (renaming) {
              return (
                <div key={v.id} className="group flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm">
                  <VenueAvatar venue={v} />
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      else if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={commitRename}
                    className="min-w-0 flex-1 rounded-sm border border-accent-line bg-canvas px-2 py-1 text-ink outline-none"
                  />
                </div>
              );
            }
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
                  "group flex cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 text-sm transition-colors " +
                  (selected
                    ? "bg-accent-wash font-semibold text-accent-hover"
                    : "text-ink-soft hover:bg-accent-tint hover:text-accent-hover")
                }
              >
                <VenueAvatar venue={v} />
                <span className="flex-1 truncate">{v.name}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
                <button
                  type="button"
                  aria-label={`שינוי שם ${v.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(v);
                  }}
                  className="shrink-0 rounded-sm p-1 opacity-0 transition-opacity hover:bg-canvas group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
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
