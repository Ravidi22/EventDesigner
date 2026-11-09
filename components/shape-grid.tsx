"use client";

import { PenLine } from "lucide-react";
import { FootprintShape } from "@/components/footprint-shape";
import { toolTileClass } from "@/components/tool-tile";
import { MAP_SHAPES, PICKER_SHAPES, SHAPE_LABEL, type MapShape } from "@/lib/catalog/types";
import { footprintBounds, shapeFootprint } from "@/lib/studio/footprint";

// THE SHAPE GRID — one picker of shapes for every screen that reshapes something (2026-11-09, the
// "Studio + Halls" board: "צורה reuses the appearance editor's reshape grid as a picker — one grid
// on three screens"): the catalog's shape editor, the venue's elements, and the sketch.

/** A shape drawn small, at its own proportions, in the accent outline — a tile's picture. */
export function ShapeIcon({ shape, className = "h-[30px] w-[30px]" }: { shape: MapShape; className?: string }) {
  if (shape === "custom")
    return (
      <span className={`flex shrink-0 items-center justify-center ${className}`}>
        <PenLine className="h-4 w-4 text-accent" strokeWidth={1.75} />
      </span>
    );
  const f = shapeFootprint(shape, { widthMm: 1600, depthMm: shape === "line" ? 60 : 1000, diameterMm: 1600 });
  const b = footprintBounds(f);
  const pad = Math.max(b.w, b.h) * 0.08;
  return (
    <svg viewBox={`${-b.w / 2 - pad} ${-b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className={`shrink-0 ${className}`} aria-hidden>
      <FootprintShape footprint={f} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Every shape as a tile, the current one pressed; a pick is the caller's (a picker closes on it).
 *  `shapes` narrows or widens the list — by default the picker's shapes, plus the current one. */
export function ShapeGrid({ value, onPick, shapes }: { value: MapShape; onPick: (shape: MapShape) => void; shapes?: readonly MapShape[] }) {
  const list = shapes ?? MAP_SHAPES.filter((s) => PICKER_SHAPES.includes(s) || s === value);
  return (
    <div className="grid grid-cols-4 gap-1" role="group" aria-label="צורה">
      {list.map((s) => (
        <button key={s} type="button" aria-pressed={value === s} title={SHAPE_LABEL[s]} onClick={() => onPick(s)} className={`${toolTileClass(value === s)} h-auto min-h-[64px]`}>
          <ShapeIcon shape={s} />
          <span className="line-clamp-2 w-full text-center">{SHAPE_LABEL[s]}</span>
        </button>
      ))}
    </div>
  );
}
