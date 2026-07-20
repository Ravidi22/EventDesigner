"use client";

import { DoorOpen, Presentation, Wine, type LucideIcon } from "lucide-react";

export type StructureDragType = "entrance" | "stage" | "bar";

// Palette rail, same drag-source chrome as the studio's CatalogRail — drag an element onto the
// hall canvas to drop it there. The room shape itself isn't here: it's drawn directly on the
// canvas, wall by wall.
export function StructureRail({ hasStage }: { hasStage: boolean }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-s border-border bg-surface">
      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-2 px-1.5 text-xs font-medium text-ink-soft">אלמנטים קבועים</p>
        <ul className="flex flex-col gap-1.5">
          <PaletteRow icon={DoorOpen} label="כניסה" type="entrance" />
          {!hasStage && <PaletteRow icon={Presentation} label="במה" type="stage" />}
          <PaletteRow icon={Wine} label="עמדת בר" type="bar" />
        </ul>
      </div>
      <p className="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted">
        גררו אל תוך התרשים למיקום. קווי המתאר עצמם מצוירים ישירות על הקנבס — קיר אחר קיר.
      </p>
    </aside>
  );
}

function PaletteRow({ icon: Icon, label, type }: { icon: LucideIcon; label: string; type: StructureDragType }) {
  return (
    <li>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/structure", type);
          e.dataTransfer.effectAllowed = "copy";
        }}
        className="group flex cursor-grab items-center gap-2.5 rounded-md border border-transparent p-2 transition-colors hover:border-border hover:bg-bg active:cursor-grabbing"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-canvas text-ink-soft">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <span className="text-sm font-medium text-ink">{label}</span>
      </div>
    </li>
  );
}
