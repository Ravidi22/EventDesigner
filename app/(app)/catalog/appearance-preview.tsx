"use client";

import type { ReactNode } from "react";
import type { Product } from "@/lib/catalog/types";
import { resolveFootprint, resolveContent, outlineBounds } from "@/lib/studio/footprint";
import { outlinePathD } from "@/lib/studio/geometry";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";

export function AppearancePreview({ product, className }: { product: Product; className?: string }) {
  const f = resolveFootprint(product);
  const content = resolveContent(product);

  // Bounds in mm, centered on (0,0) to match the map's local frame.
  let w: number, h: number, shape: ReactNode;
  const shapeProps = { fill: "#ffffff", stroke: "currentColor", strokeWidth: 2, vectorEffect: "non-scaling-stroke" as const };
  if (f.kind === "circle") { w = f.diameterMm; h = f.diameterMm; shape = <circle cx={0} cy={0} r={w / 2} {...shapeProps} />; }
  else if (f.kind === "ellipse") { w = f.widthMm; h = f.depthMm; shape = <ellipse cx={0} cy={0} rx={w / 2} ry={h / 2} {...shapeProps} />; }
  else if (f.kind === "custom") {
    const b = outlineBounds(f.outline); w = b.w; h = b.h;
    // Center on (0,0); edge curves are endpoint-relative offsets so they carry over unchanged.
    const centered = f.outline.map((p) => ({ x: p.x - b.cx, y: p.y - b.cy }));
    shape = <path d={outlinePathD(centered, f.edgeCurves)} {...shapeProps} />;
  } else { w = f.widthMm; h = f.depthMm; shape = <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(w, h) * 0.06} {...shapeProps} />; }

  const pad = Math.max(w, h) * 0.15 + 100;
  const vb = `${-(w / 2 + pad)} ${-(h / 2 + pad)} ${w + pad * 2} ${h + pad * 2}`;
  const Icon = content.mode === "icon" && content.icon ? ICON_BY_NAME[content.icon] : undefined;
  const iconSize = Math.min(w, h) * 0.6;

  return (
    <svg viewBox={vb} className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית">
      {shape}
      {content.mode === "name" && (
        <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="currentColor"
          style={{ fontSize: Math.max(120, Math.min(h * 0.4, w * 0.22)) }}>
          {content.name}
        </text>
      )}
      {Icon && (
        <g transform={`translate(${-iconSize / 2} ${-iconSize / 2})`}>
          <Icon width={iconSize} height={iconSize} color="currentColor" />
        </g>
      )}
    </svg>
  );
}
