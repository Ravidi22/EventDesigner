"use client";

import type { Product } from "@/lib/catalog/types";
import { resolveFootprint, resolveContent, footprintBounds, type ResolvedContent } from "@/lib/studio/footprint";
import { labelAnchor } from "@/lib/studio/label-anchor";
import type { Point } from "@/lib/design-document/types";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";
import { resolveStyle } from "@/lib/element-style";
import { FootprintShape } from "@/components/footprint-shape";

export function AppearancePreview({ product, className }: { product: Product; className?: string }) {
  const f = resolveFootprint(product);
  const content = resolveContent(product);

  // Bounds in mm, centered on (0,0) to match the map's local frame. "currentColor" is the
  // pass-through default: with no style set, resolveStyle hands it straight back and the
  // wrapping <svg>'s text-ink-soft class still drives it exactly as before.
  const resolved = resolveStyle(product.appearance?.style, "screen", { fill: "#ffffff", stroke: "currentColor", strokeWidth: 2 });
  // The same component the plan draws with, so a shape made of several parts previews as the plan
  // will draw it rather than as a second opinion about it.
  const { w, h } = footprintBounds(f);
  const shape = (
    <FootprintShape
      footprint={f}
      fill={resolved.fill}
      stroke={resolved.stroke}
      strokeWidth={resolved.strokeWidth}
      strokeDasharray={resolved.dashArray.length ? resolved.dashArray.join(" ") : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );

  const pad = Math.max(w, h) * 0.15 + 100;
  const vb = `${-(w / 2 + pad)} ${-(h / 2 + pad)} ${w + pad * 2} ${h + pad * 2}`;
  return (
    <svg viewBox={vb} className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית">
      {shape}
      <PlanContent content={content} w={w} h={h} at={labelAnchor(f)} />
    </svg>
  );
}

const ORIGIN: Point = { x: 0, y: 0 };

/** The name-or-icon that sits inside a footprint — at `at`, the shape's own label point
 *  (lib/studio/label-anchor.ts) in a `w`×`h` box centred on (0,0), in mm. The plan writes a name at
 *  the same point, so the preview shows where it will actually land: the middle of an arc's band,
 *  not the box centre out in the air.
 *
 *  Its own component because the custom-shape editor draws it too: the shape canvas is a plan, and
 *  a plan that shows the outline but not what is written inside it answers "what will this look
 *  like?" with half the picture — which is exactly what an icon picked in that modal used to do,
 *  visible only in the 96px tile beside a full-screen canvas that ignored it.
 *
 *  An icon whose name no longer exists in MAP_ICONS falls back to the NAME rather than to nothing:
 *  drawing an empty shape is the one outcome that tells the designer neither what is wrong nor
 *  that anything is. */
export function PlanContent({ content, w, h, at = ORIGIN }: { content: ResolvedContent; w: number; h: number; at?: Point }) {
  const Icon = content.mode === "icon" && content.icon ? ICON_BY_NAME[content.icon] : undefined;
  if (Icon) {
    const size = Math.min(w, h) * 0.6;
    return (
      <g transform={`translate(${at.x - size / 2} ${at.y - size / 2})`}>
        <Icon width={size} height={size} color="currentColor" />
      </g>
    );
  }
  if (content.mode === "none") return null;
  return (
    <text x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central" fill="currentColor"
      style={{ fontSize: Math.max(120, Math.min(h * 0.4, w * 0.22)) }}>
      {content.name}
    </text>
  );
}
