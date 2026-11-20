"use client";

import { memo, useMemo } from "react";
import { FootprintShape } from "@/components/footprint-shape";
import { ClimbGlyph } from "@/components/climb-glyph";
import { PergolaGlyph } from "@/components/pergola-glyph";
import { SeatingGlyph } from "@/components/chair-block";
import { SURFACE_BASE } from "@/components/surface-fill";
import { chairRowsLayout } from "@/lib/design-document/chair-rows";
import type { Footprint } from "@/lib/studio/footprint";
import { footprintBounds } from "@/lib/studio/footprint";
import type { AddTool } from "@/lib/venues/add-tools";
import { pergolaOf } from "@/lib/venues/pergola";
import { newPoolFeature } from "@/lib/venues/pool";
import { newSeatingFeature, seatingChair } from "@/lib/venues/seating";
import { featureFootprint, newFeature, newFeatureFromProduct, newItemFeature, type StructureFeature } from "@/lib/venues/structure";
import { VenueItemGlyph } from "@/components/venue-item";
import { useMounted } from "@/lib/use-mounted";

// A rail tile's picture for the things that ARE a shape (2026-11-19, the user, of the /halls rail:
// "give them their shape icon"). The shell's rail gave every tool its category's icon, so ten bars
// wore ten identical glasses and twenty stage rows twenty identical easels, over names cut to
// "במה 122…". A catalog row, a pool shape, the venue's pergola and its chairs in rows are drawn
// instead — built through the very function the drop calls (newFeatureFromProduct, newPoolFeature,
// newSeatingFeature), so the tile is the outline that lands: a ח is a ח, a 244×122 deck is twice as
// long as it is deep, a flight shows its treads. Everything else keeps its icon or swatch.

const ORIGIN = { x: 0, y: 0 };

/** The box the picture is fitted into, in screen px — wide, because most of what a venue builds
 *  (bars, decks, stairs) is long. */
const BOX_W = 50;
const BOX_H = 26;

type Picture =
  | { kind: "outline"; footprint: Footprint; fill: string; dashed?: boolean }
  | { kind: "climb"; feature: Omit<StructureFeature, "id"> }
  | { kind: "pergola"; footprint: Footprint; feature: Omit<StructureFeature, "id"> }
  | { kind: "seating"; spec: NonNullable<StructureFeature["seating"]>; w: number; h: number }
  | { kind: "item"; feature: StructureFeature };

/** "ציור חופשי" in water: a pool of no particular shape, traced dashed as the trace draws it. */
const FREE_OUTLINE = [
  { x: -620, y: -420 },
  { x: 380, y: -560 },
  { x: 760, y: 120 },
  { x: 120, y: 540 },
  { x: -760, y: 300 },
];

// On the tile: three rows of four with an aisle, which reads "rows" where five by five at 26px is a
// grey square.
const SEATING_TILE = { rows: 3, perRow: 4, aisleMm: 600 };

function pictureOf(tool: AddTool): Picture | null {
  if (tool.pool === "free") return { kind: "outline", footprint: { kind: "custom", outline: FREE_OUTLINE }, fill: SURFACE_BASE.water, dashed: true };
  if (tool.pool) return { kind: "outline", footprint: featureFootprint(newPoolFeature(tool.pool, ORIGIN)), fill: SURFACE_BASE.water };
  if (tool.kind === "seating") {
    const placed = newSeatingFeature(ORIGIN, tool.chair).seating;
    if (!placed) return null;
    const spec = { ...placed, ...SEATING_TILE };
    const l = chairRowsLayout(spec, seatingChair(spec));
    return { kind: "seating", spec, w: l.widthMm, h: l.depthMm };
  }
  // The venue's own pergola, beside the catalog's: its posts and slats either way.
  if (tool.kind === "pergola") {
    const feature = tool.product ? newFeatureFromProduct("pergola", tool.product, ORIGIN) : newFeature("pergola", ORIGIN);
    return { kind: "pergola", footprint: featureFootprint(feature), feature };
  }
  if (!tool.product || !tool.kind) return null;
  // A catalog thing put in the venue as itself (./item.ts) — a billiard table — is its picture.
  if (tool.kind === "item") return { kind: "item", feature: { id: `tile:${tool.id}`, ...newItemFeature(tool.product, ORIGIN) } };
  const feature = newFeatureFromProduct(tool.kind, tool.product, ORIGIN);
  if (tool.kind === "stairs" || tool.kind === "ramp") return { kind: "climb", feature };
  return { kind: "outline", footprint: featureFootprint(feature), fill: "var(--color-surface)" };
}

/** Whether a tool is drawn as its shape rather than worn as an icon. */
export function hasToolGlyph(tool: AddTool): boolean {
  return !!(tool.product || tool.pool || tool.kind === "seating" || tool.kind === "pergola");
}

/** The tool's shape at its own proportions, laid long side across. Drawn once the page is the
 *  browser's (lib/use-mounted.ts): a curved outline is trigonometry, and Node's last digit and the
 *  browser's can differ — a server-drawn arc would not hydrate (appearance-preview.tsx's rule). */
export const ToolGlyph = memo(function ToolGlyph({ tool }: { tool: AddTool }) {
  const mounted = useMounted();
  const picture = useMemo(() => (mounted ? pictureOf(tool) : null), [mounted, tool]);
  if (!picture) return <span className="block shrink-0" style={{ width: BOX_W, height: BOX_H }} aria-hidden />;

  const b = picture.kind === "seating" ? { w: picture.w, h: picture.h } : footprintBounds(picture.kind === "climb" || picture.kind === "item" ? featureFootprint(picture.feature) : picture.footprint);
  // A deck stored 122 across and 244 deep is the same deck as a 244×122: laid long side across, it
  // fills the tile instead of standing in a third of it.
  const turned = b.h > b.w * 1.1;
  const w = turned ? b.h : b.w;
  const h = turned ? b.w : b.h;
  // Padding in mm so the outline's stroke (screen px) is never clipped; a hair more than the stroke
  // at the scale the box will draw at.
  const scale = Math.min(BOX_W / w, BOX_H / h);
  const pad = 2 / Math.max(scale, 1e-6);
  const stroke = "var(--color-accent)";

  return (
    <svg
      viewBox={`${-w / 2 - pad} ${-h / 2 - pad} ${w + pad * 2} ${h + pad * 2}`}
      // max-w-full: the zone dialog's six-up grid can be narrower than the box on a phone; the
      // viewBox keeps the proportions as it shrinks.
      className="block max-w-full shrink-0 overflow-visible"
      style={{ width: BOX_W, height: BOX_H }}
      aria-hidden
    >
      <g transform={turned ? "rotate(90)" : undefined}>
        {picture.kind === "outline" && (
          <FootprintShape
            footprint={picture.footprint}
            fill={picture.fill}
            stroke={stroke}
            strokeWidth={1.25}
            strokeDasharray={picture.dashed ? "3 2" : undefined}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {picture.kind === "climb" && (
          <ClimbGlyph f={picture.feature} fill="var(--color-surface)" stroke={stroke} strokeWidth={1.25} lineWidth={0.75} ink={stroke} textFill={stroke} alertFill={stroke} />
        )}
        {picture.kind === "pergola" && (
          <PergolaGlyph footprint={picture.footprint} pergola={pergolaOf(picture.feature)} stroke={stroke} strokeWidth={1} postFill={stroke} />
        )}
        {picture.kind === "seating" && <SeatingGlyph spec={picture.spec} ink={stroke} />}
        {picture.kind === "item" && <VenueItemGlyph feature={picture.feature} />}
      </g>
    </svg>
  );
});
