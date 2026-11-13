"use client";

import { useId, type ReactNode } from "react";
import type { Product } from "@/lib/catalog/types";
import { shapesOf } from "@/lib/catalog/shape-list";
import { elevationBoxes } from "@/lib/element/elevation";
import { sampledBounds } from "@/lib/studio/footprint";
import { OutlinePath } from "@/components/footprint-shape";
import { Dim, type DimTone } from "@/components/venue-dims";

// A row drawn from the FRONT (Backdrops S2 — a backdrop of panels, an arch, a wave): the catalog card
// and the drawer show it as it stands, not as the thin band the plan sees from above. Every shape is
// read through the shape editor's own חזית reading (lib/element/elevation.ts elevationBoxes), so the
// card is what the editor's front view drew: a front shape as its FACE — x across, bottom at its z —
// and a plan shape behind or before it as its box from the front, faint. Drawn back to front by plan
// depth, so a panel in front covers the one behind it.

/** The picture in the face's world (x across, y = −up, the floor at y 0) and its extent. */
function frontArt(product: Product): { art: ReactNode; minX: number; maxX: number; top: number } | null {
  const shapes = shapesOf(product);
  if (!shapes.length) return null;
  const swatch = product.variants.find((v) => !v.archived && v.swatch)?.swatch;
  const itemFill = product.appearance?.style?.fill;
  const itemH = product.dimensions.heightMm || 0;
  const boxes = elevationBoxes(shapes, itemH, "front");
  // Farthest back first (plan y grows toward the front); ties in list order.
  const order = boxes.map((b, k) => ({ b, k })).sort((p, q) => shapes[p.b.index].y - shapes[q.b.index].y || p.k - q.k);
  let minX = Infinity, maxX = -Infinity, top = 0;
  for (const b of boxes) {
    minX = Math.min(minX, b.a0);
    maxX = Math.max(maxX, b.a1);
    top = Math.max(top, b.z + b.h);
  }
  if (!Number.isFinite(minX)) return null;
  const art = order.map(({ b }) => {
    const s = shapes[b.index];
    const fill = s.style?.fill ?? itemFill ?? swatch ?? "var(--color-inset)";
    if (b.front) {
      // Facing the viewer and flat, the face is drawn as itself; turned on the plan or bent, it is
      // seen narrower — the face squeezed across into the box its band shows from the front.
      const cx = (b.a0 + b.a1) / 2;
      const faceW = sampledBounds(b.front.pieces).w;
      const sx = b.front.asItself || faceW < 1 ? 1 : (b.a1 - b.a0) / faceW;
      return (
        <g key={s.id} transform={sx === 1 ? undefined : `translate(${cx} 0) scale(${sx} 1) translate(${-cx} 0)`}>
          {b.front.pieces.map((o, i) => (
            <OutlinePath
              key={i}
              outline={o.outline}
              edgeCurves={o.edgeCurves}
              open={o.open}
              fill={fill}
              stroke="var(--color-ink-soft)"
              strokeWidth={1.25}
              strokeLinejoin="round"
              strokeDasharray={b.outlineOnly ? "5 3" : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      );
    }
    return (
      <rect
        key={s.id}
        x={b.a0}
        y={-(b.z + b.h)}
        width={Math.max(1, b.a1 - b.a0)}
        height={b.h}
        fill={fill}
        fillOpacity={0.35}
        stroke="var(--color-ink-soft)"
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeDasharray={b.outlineOnly ? "5 3" : undefined}
        vectorEffect="non-scaling-stroke"
      />
    );
  });
  return { art, minX, maxX, top };
}

/** The drawer's frame (PlanPreview's: a 374×200 card, room left for the width figure on top, the
 *  height figure at the end and the "עריכת המראה" pill along the bottom). */
const PREVIEW_W = 374;
const PREVIEW_H = 200;
const GRID_STEPS = [100, 200, 500, 1000, 2000, 5000];

/** A front row as it stands — on the catalog card (inside ProductImage's dotted tile, fitted with a
 *  small margin) or, `figured`, in the drawer: on its grid with its width and height figured, and,
 *  before it is measured (`ghost`), a dashed panel asking for its numbers. */
export function FrontPreview({
  product,
  className,
  figured,
}: {
  product: Product;
  className?: string;
  figured?: { tone: DimTone; ghost: boolean };
}) {
  const gridId = useId();
  const drawn = figured?.ghost ? null : frontArt(product);
  const label = "תצוגה מקדימה של הפריט מהחזית";

  if (!figured) {
    if (!drawn) return <svg className={"text-ink-soft " + (className ?? "")} role="img" aria-label={label} />;
    const w = Math.max(1, drawn.maxX - drawn.minX);
    const h = Math.max(1, drawn.top);
    const pad = Math.max(w, h) * 0.08 + 60;
    return (
      <svg
        viewBox={`${drawn.minX - pad} ${-h - pad} ${w + pad * 2} ${h + pad * 2}`}
        preserveAspectRatio="xMidYMid meet"
        className={"text-ink-soft " + (className ?? "")}
        role="img"
        aria-label={label}
      >
        <line x1={drawn.minX - pad} y1={0} x2={drawn.maxX + pad} y2={0} stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {drawn.art}
      </svg>
    );
  }

  // Figured: before a width is typed the panel is a ghost of the size it will likely be.
  const ghostW = product.dimensions.widthMm || product.dimensions.diameterMm || 2400;
  const ghostH = product.dimensions.heightMm || 2400;
  const minX = drawn ? drawn.minX : -ghostW / 2;
  const maxX = drawn ? drawn.maxX : ghostW / 2;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, drawn ? drawn.top : ghostH);
  const mpp = Math.max(w / (PREVIEW_W - 84), h / (PREVIEW_H - 92), 0.5);
  const mm = (px: number) => px * mpp;
  const vw = PREVIEW_W * mpp;
  const vh = PREVIEW_H * mpp;
  const cx = (minX + maxX) / 2 + mm(10);
  const cy = -h / 2 + mm(6);
  const grid = GRID_STEPS.find((g) => g / mpp >= 14) ?? 10000;
  const gap = mm(14);
  const cm = (v: number) => Math.round(v / 10);
  const knownW = !!drawn;
  const knownH = !!drawn || !!product.dimensions.heightMm;
  return (
    <svg viewBox={`${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`} className={"text-ink-soft " + (className ?? "")} role="img" aria-label={label}>
      <defs>
        <pattern id={gridId} patternUnits="userSpaceOnUse" width={grid} height={grid}>
          <path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="var(--color-border-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      <rect x={cx - vw * 1.5} y={cy - vh * 1.5} width={vw * 3} height={vh * 3} fill={`url(#${gridId})`} />
      {/* The floor it stands on. */}
      <line x1={cx - vw * 1.5} y1={0} x2={cx + vw * 1.5} y2={0} stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {drawn ? (
        drawn.art
      ) : (
        <>
          <rect
            x={minX}
            y={-h}
            width={w}
            height={h}
            fill="var(--color-inset)"
            stroke="var(--color-faint)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
          <text x={(minX + maxX) / 2} y={-h / 2} textAnchor="middle" dominantBaseline="central" fill="var(--color-muted)" style={{ fontSize: mm(11) }}>
            הקלידו מידות, או ערכו בעורך
          </text>
        </>
      )}
      <Dim a={{ x: minX, y: -h - gap }} b={{ x: maxX, y: -h - gap }} text={`${knownW ? cm(w) : "?"} ס״מ`} mm={mm} tone={figured.tone} rtl />
      <Dim a={{ x: maxX + gap, y: -h }} b={{ x: maxX + gap, y: 0 }} text={`${knownH ? cm(h) : "?"} ס״מ`} mm={mm} tone={figured.tone} rtl />
    </svg>
  );
}
