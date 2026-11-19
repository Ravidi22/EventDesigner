"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// A TOOL in a rail: a 58px tile, its picture over a one-line name, armed by a click (then a click on
// the canvas places it) or dragged onto the canvas. The shape editor's shape drawer was the first
// (2026-11-09, the user's "Create Product" redesign); the venue's draw + add rail and the zone
// dialog's "הוספה בתוך האזור" are the same tile (the "Studio + Halls" board), so there is one look
// for "a thing you can put on the plan" in every place it is offered.

export const toolTileClass = (on: boolean, disabled = false) => "h-[58px] " + tileLook(on, disabled);

/** The tile without its height: ToolTile grows past 58px when a name needs a second line. */
const tileLook = (on: boolean, disabled: boolean) =>
  "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-sm border px-1 pb-[5px] pt-1 text-[11px] font-semibold leading-tight transition-colors " +
  (disabled
    ? "cursor-not-allowed border-transparent bg-inset text-faint opacity-60"
    : on
      ? "border-accent bg-accent-tint text-accent"
      : "border-transparent bg-inset text-ink-soft hover:border-accent-line");

export function ToolTile({
  icon: Icon,
  glyph,
  swatch,
  label,
  title,
  armed = false,
  disabled = false,
  onClick,
  dragId,
}: {
  /** A lucide icon, drawn 18px in accent… */
  icon?: LucideIcon;
  /** …or a picture of the tool's own (the editor's shape outlines)… */
  glyph?: ReactNode;
  /** …or the colour it lays, as a swatch (a lawn says more as green than as a leaf icon). */
  swatch?: string;
  label: string;
  /** The whole name, and why a disabled tile is disabled. Defaults to the label. */
  title?: string;
  armed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** What a drag onto the canvas carries as "text/plain"; absent = not draggable. */
  dragId?: string;
}) {
  return (
    <button
      type="button"
      draggable={!!dragId && !disabled}
      aria-pressed={armed}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      onDragStart={
        dragId
          ? (e) => {
              e.dataTransfer.setData("text/plain", dragId);
              e.dataTransfer.effectAllowed = "copy";
            }
          : undefined
      }
      // At least 58px, and taller when the name takes two lines: a catalog row's name is what tells
      // "במה 122×244" from "במה 122×80", and one line cut both to "במה 122…" (2026-11-19). A grid
      // row stretches to its tallest tile, so the row stays even.
      className={"min-h-[58px] " + tileLook(armed, disabled)}
    >
      {glyph ??
        (swatch ? (
          <span className="h-[18px] w-[18px] shrink-0 rounded-full border border-inset-border" style={{ background: swatch }} aria-hidden />
        ) : Icon ? (
          <Icon className="h-[18px] w-[18px] shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        ) : null)}
      <span className="line-clamp-2 w-full text-center [overflow-wrap:anywhere]">{label}</span>
    </button>
  );
}

/** A labelled grid of tiles, three to a row. */
export function ToolGrid({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="ps-0.5 text-xs font-semibold text-muted">{label}</span>}
      <div className="grid grid-cols-3 gap-1">{children}</div>
    </div>
  );
}
