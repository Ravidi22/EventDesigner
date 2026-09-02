"use client";

import type { ReactNode } from "react";
import type { Product } from "@/lib/catalog/types";
import { resolveFootprint, resolveContent, customShapeBounds, type ResolvedContent } from "@/lib/studio/footprint";
import { outlinePathD } from "@/lib/studio/geometry";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";
import { resolveStyle } from "@/lib/element-style";

export function AppearancePreview({ product, className }: { product: Product; className?: string }) {
  const f = resolveFootprint(product);
  const content = resolveContent(product);

  // Bounds in mm, centered on (0,0) to match the map's local frame. "currentColor" is the
  // pass-through default: with no style set, resolveStyle hands it straight back and the
  // wrapping <svg>'s text-ink-soft class still drives it exactly as before.
  const resolved = resolveStyle(product.appearance?.style, "screen", { fill: "#ffffff", stroke: "currentColor", strokeWidth: 2 });
  let w: number, h: number, shape: ReactNode;
  const shapeProps = {
    fill: resolved.fill,
    stroke: resolved.stroke,
    strokeWidth: resolved.strokeWidth,
    strokeDasharray: resolved.dashArray.length ? resolved.dashArray.join(" ") : undefined,
    vectorEffect: "non-scaling-stroke" as const,
  };
  if (f.kind === "circle") { w = f.diameterMm; h = f.diameterMm; shape = <circle cx={0} cy={0} r={w / 2} {...shapeProps} />; }
  else if (f.kind === "ellipse") { w = f.widthMm; h = f.depthMm; shape = <ellipse cx={0} cy={0} rx={w / 2} ry={h / 2} {...shapeProps} />; }
  else if (f.kind === "custom") {
    const b = customShapeBounds(f.outline); w = b.w; h = b.h;
    // Center on (0,0); edge curves are endpoint-relative offsets so they carry over unchanged.
    const centered = f.outline.map((p) => ({ x: p.x - b.cx, y: p.y - b.cy }));
    shape = <path d={outlinePathD(centered, f.edgeCurves)} {...shapeProps} />;
  } else { w = f.widthMm; h = f.depthMm; shape = <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(w, h) * 0.06} {...shapeProps} />; }

  const pad = Math.max(w, h) * 0.15 + 100;
  const vb = `${-(w / 2 + pad)} ${-(h / 2 + pad)} ${w + pad * 2} ${h + pad * 2}`;
  return (
    <svg viewBox={vb} className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית">
      {shape}
      <PlanContent content={content} w={w} h={h} />
    </svg>
  );
}

/** The name-or-icon that sits inside a footprint, centred on (0,0) in a `w`×`h` box, in mm.
 *
 *  Its own component because the custom-shape editor draws it too: the shape canvas is a plan, and
 *  a plan that shows the outline but not what is written inside it answers "what will this look
 *  like?" with half the picture — which is exactly what an icon picked in that modal used to do,
 *  visible only in the 96px tile beside a full-screen canvas that ignored it.
 *
 *  An icon whose name no longer exists in MAP_ICONS falls back to the NAME rather than to nothing:
 *  drawing an empty shape is the one outcome that tells the designer neither what is wrong nor
 *  that anything is. */
export function PlanContent({ content, w, h }: { content: ResolvedContent; w: number; h: number }) {
  const Icon = content.mode === "icon" && content.icon ? ICON_BY_NAME[content.icon] : undefined;
  if (Icon) {
    const size = Math.min(w, h) * 0.6;
    return (
      <g transform={`translate(${-size / 2} ${-size / 2})`}>
        <Icon width={size} height={size} color="currentColor" />
      </g>
    );
  }
  if (content.mode === "none") return null;
  return (
    <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="currentColor"
      style={{ fontSize: Math.max(120, Math.min(h * 0.4, w * 0.22)) }}>
      {content.name}
    </text>
  );
}
