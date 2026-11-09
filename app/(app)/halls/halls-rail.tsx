"use client";

import { PenLine, SquareDashed } from "lucide-react";
import { ToolGrid, ToolTile } from "@/components/tool-tile";
import { ADD_TOOL_ICON, addToolIconKey } from "@/components/venue-inspector";
import { SURFACE_BASE } from "@/components/surface-fill";
import { formatDimensions } from "@/lib/catalog/format";
import { DRAW_SURFACE_ID, railSections, type AddTool } from "@/lib/venues/add-tools";
import type { VenueStructure } from "@/lib/venues/structure";

// The venue's START RAIL (2026-11-09, the user's "Studio + Halls" board): what can be drawn and
// what can be put on the plan, always in view — it replaces the toolbar's שרטוט button and the
// add-element flyout, which hid forty tools behind one. Drawing first (walls, then a new zone), then
// one grid per ADD_TOOL_SECTIONS section; click to arm and click the plan to place, or drag a tile
// onto the plan, as the flyout did.

/** What a tile says on hover, and whether it can be used yet — an opening needs a wall to sit in. */
export function toolTileState(tool: AddTool, structure: VenueStructure): { title: string; disabled: boolean } {
  const needsWall = tool.id === "entrance" || tool.id === "window" || tool.id === "curtain";
  const disabled = needsWall && !structure.walls.some((w) => w.kind === "wall");
  const title = tool.surface
    ? `${tool.label} — לחיצה בשטח סגור ממלאת אותו מקיר לקיר; בשטח פתוח מניחה משטח לשינוי גודל`
    : tool.pool
      ? tool.pool === "free"
        ? "בריכה בציור חופשי — לחיצה לכל פינה, Enter לסגירה; הקווים מתעקמים ומתעגלים אחר כך"
        : `בריכה · ${tool.label} — הקווים מתעקמים והפינות מתעגלות ב״עריכת הקווים״`
      : tool.kind === "seating"
        ? `${tool.label} — חמש שורות של חמישה${tool.chair ? ` · ${tool.chair.name}` : ""}; השורות, הרווחים ומעבר באמצע בסרגל`
        : tool.product
          ? `${tool.label} · ${formatDimensions(tool.product.dimensions)}`
          : tool.label;
  return { title: disabled ? `${tool.label} — קודם משרטטים קיר` : title, disabled };
}

export function HallsRail({
  tools,
  structure,
  armedId,
  drawingWalls,
  drawingSurface,
  onDrawWalls,
  onNewZone,
  onPick,
}: {
  tools: AddTool[];
  structure: VenueStructure;
  armedId: string | null;
  drawingWalls: boolean;
  /** A surface is being traced from "ציור חופשי" — its tile reads pressed. */
  drawingSurface?: boolean;
  onDrawWalls: () => void;
  onNewZone: () => void;
  /** A tile pressed: the tool's id, or DRAW_SURFACE_ID — the flyout's own contract. */
  onPick: (id: string) => void;
}) {
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-e border-border bg-surface">
      <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2.5">
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onDrawWalls}
            aria-pressed={drawingWalls}
            title="שרטוט קירות — לחיצה לכל פינה · W"
            className={
              "flex h-10 w-full items-center gap-2 rounded-md border px-3 text-[13px] font-semibold transition-colors " +
              (drawingWalls ? "border-accent bg-accent-tint text-accent-hover" : "border-border bg-surface text-ink hover:border-accent-line hover:bg-inset")
            }
          >
            <PenLine className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
            שרטוט קירות
            <kbd className="ms-auto font-mono text-[11px] font-normal text-faint">W</kbd>
          </button>
          <button
            type="button"
            onClick={onNewZone}
            title="אזור חדש — הקפת שטח בנקודות, Enter לסגירה"
            className="flex h-10 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:border-accent-line hover:bg-inset"
          >
            <SquareDashed className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
            אזור חדש
          </button>
        </div>
        {railSections(tools).map((r) => (
          <ToolGrid key={r.section} label={r.label}>
            {r.section === "ground" && (
              <ToolTile
                icon={PenLine}
                label="ציור חופשי"
                title="ציור משטח בכל צורה — לחיצה לכל פינה, Enter לסגירה, ואז בחירת החומר"
                armed={!!drawingSurface}
                onClick={() => onPick(DRAW_SURFACE_ID)}
              />
            )}
            {r.tools.map((tool) => {
              const { title, disabled } = toolTileState(tool, structure);
              return (
                <ToolTile
                  key={tool.id}
                  icon={ADD_TOOL_ICON[addToolIconKey(tool)]}
                  swatch={tool.surface ? SURFACE_BASE[tool.surface] : undefined}
                  label={tool.label}
                  title={title}
                  armed={armedId === tool.id}
                  disabled={disabled}
                  onClick={() => onPick(tool.id)}
                  dragId={tool.id}
                />
              );
            })}
          </ToolGrid>
        ))}
      </div>
    </aside>
  );
}
