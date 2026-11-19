"use client";

import { useMemo, useState } from "react";
import { MousePointerClick, PenLine, SquareDashed } from "lucide-react";
import { ToolGrid, ToolTile } from "@/components/tool-tile";
import { Segmented } from "@/components/segmented";
import { SearchInput } from "@/components/search-input";
import { CATEGORY_BY_ID, CATEGORY_GROUPS } from "@/lib/catalog/categories";
import { ProductImage } from "../catalog/product-image";
import { ADD_TOOL_ICON, addToolIconKey } from "@/components/venue-inspector";
import { SURFACE_BASE } from "@/components/surface-fill";
import { formatDimensions } from "@/lib/catalog/format";
import { DRAW_SURFACE_ID, catalogTools, railSections, type AddTool } from "@/lib/venues/add-tools";
import type { VenueStructure } from "@/lib/venues/structure";
import { ToolGlyph, hasToolGlyph } from "./tool-glyph";

// The venue's START RAIL (2026-11-09, the user's "Studio + Halls" board): what can be drawn and
// what can be put on the plan, always in view — it replaces the toolbar's שרטוט button and the
// add-element flyout, which hid forty tools behind one. Drawing first (walls, then a new zone), then
// one grid per ADD_TOOL_SECTIONS section; click to arm and click the plan to place, or drag a tile
// onto the plan, as the flyout did.
//
// Two TABS (2026-11-19, the user: "add all the things from my catalog, but make it separate"):
// בנייה is what the venue is BUILT of — walls, zones, its pool, its bars and stages — as tiles;
// מהקטלוג is everything else the studio's catalog holds that has a place of its own (lib/venues/
// item.ts venueItemOffered), as the studio's catalog rail lists it — search, departments, a row per
// item with its picture — so the two never read as one list. A row from it lands as the venue's own
// copy of the item (kind "item"), drawn as itself and never priced or counted.

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
  const [tab, setTab] = useState<"build" | "catalog">("build");
  const fromCatalog = useMemo(() => catalogTools(tools), [tools]);
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-e border-border bg-surface">
      <div className="shrink-0 border-b border-border-soft p-2.5 pb-2">
        <Segmented
          label="מה מוסיפים"
          hideLabel
          value={tab}
          options={[
            ["build", "בנייה"],
            ["catalog", `מהקטלוג${fromCatalog.length ? ` · ${fromCatalog.length}` : ""}`],
          ] as const}
          onChange={setTab}
        />
      </div>
      {tab === "catalog" ? (
        <CatalogTab tools={fromCatalog} armedId={armedId} onPick={onPick} />
      ) : (
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
                    glyph={hasToolGlyph(tool) ? <ToolGlyph tool={tool} /> : undefined}
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
      )}
    </aside>
  );
}

/** The catalog tab: a search, then the rows by department, each a picture, a name and a size. A
 *  click arms the row (then a click on the plan places it), a drag lays it — the build tab's own
 *  contract, so the canvas does not care which tab a tool came from. */
function CatalogTab({ tools, armedId, onPick }: { tools: AddTool[]; armedId: string | null; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const groups = useMemo(() => {
    const shown = q ? tools.filter((t) => t.label.includes(q)) : tools;
    return CATEGORY_GROUPS.map((g) => ({ ...g, tools: shown.filter((t) => t.product && CATEGORY_BY_ID[t.product.category]?.group === g.id) })).filter((g) => g.tools.length > 0);
  }, [tools, q]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 p-2.5 pb-1.5">
        <SearchInput value={query} onChange={setQuery} placeholder="חיפוש בקטלוג" aria-label="חיפוש בקטלוג" />
        <p className="ps-0.5 text-[11px] leading-snug text-muted">נשמר כחלק מהמקום, כפי שהוא מצויר בקטלוג — בלי מחיר, ולא נספר בהצעות.</p>
      </div>
      <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2.5 pb-2.5">
        {tools.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs leading-relaxed text-muted">אין בקטלוג פריטים שעומדים בעצמם — נברשות, ספות, עצים ועוד מוסיפים ב״קטלוג מוצרים״.</p>
        ) : groups.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted">לא נמצאו פריטים</p>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="flex flex-col gap-0.5">
              <span className="flex items-baseline gap-1.5 ps-0.5 text-xs font-semibold text-muted">
                {g.label}
                <span className="nums text-[11px] font-normal text-faint">{g.tools.length}</span>
              </span>
              <ul className="flex flex-col gap-0.5">
                {g.tools.map((tool) => (
                  <CatalogRow key={tool.id} tool={tool} armed={armedId === tool.id} onPick={onPick} />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CatalogRow({ tool, armed, onPick }: { tool: AddTool; armed: boolean; onPick: (id: string) => void }) {
  const product = tool.product!;
  return (
    <li>
      <button
        type="button"
        draggable
        aria-pressed={armed}
        title={armed ? "לחיצה על התוכנית מניחה אותו · Esc מפסיק" : `${tool.label} — לחיצה ואז לחיצה על התוכנית, או גרירה`}
        onClick={() => onPick(tool.id)}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", tool.id);
          e.dataTransfer.effectAllowed = "copy";
        }}
        className={
          "flex w-full cursor-grab items-center gap-2 rounded-md border p-1 text-start transition-colors active:cursor-grabbing " +
          (armed ? "border-accent-line bg-accent-tint" : "border-transparent hover:border-border hover:bg-bg")
        }
      >
        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-sm bg-inset">
          <ProductImage product={product} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={"block truncate text-[13px] font-medium " + (armed ? "text-accent" : "text-ink")}>{tool.label}</span>
          <span className="nums block truncate text-[11px] text-muted">{formatDimensions(product.dimensions)}</span>
        </span>
        {armed && <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} aria-hidden />}
      </button>
    </li>
  );
}
