"use client";

import { useId } from "react";
import { SURFACE_MATERIALS, SURFACE_MATERIAL_LABEL, type SurfaceMaterial } from "@/lib/venues/structure";
import { SurfaceFill } from "@/components/surface-fill";

/** What a floor is laid in, picked by its look: a tile per material, each a swatch of the texture
 *  itself at real scale (a 1.6m square — four paving slabs across, a dozen deck boards), as the
 *  add-element flyout shows a ground. A radio group — one material per floor.
 *
 *  One control wherever a material is chosen: a zone's floor (zone-dialog.tsx, with "ללא"), a
 *  surface feature's material and a closed shape laid without a zone (the hall editor's bar). The
 *  feature's used to be a text Select beside a zone's tiles, so the same choice looked like two. */
export function SurfaceTiles({
  value,
  onChange,
  label = "משטח",
  none,
  columns = 5,
}: {
  value?: SurfaceMaterial;
  onChange: (surface: SurfaceMaterial | undefined) => void;
  /** The group's caption. Empty = none (a panel whose header already says it). */
  label?: string;
  /** A first tile for "no material" with this caption — a zone that is only its tint. Absent = every
   *  tile is a material. */
  none?: string;
  /** 9 lays every material in one row — inline in a bar, where a second row would double its height. */
  columns?: 4 | 5 | 9;
}) {
  const labelId = useId();
  const s = 1600;
  const tile = (material: SurfaceMaterial | undefined, caption: string) => {
    const on = value === material;
    return (
      <button
        key={material ?? "none"}
        type="button"
        role="radio"
        aria-checked={on}
        title={caption}
        onClick={() => onChange(material)}
        className={`flex min-w-0 flex-col items-center gap-1 rounded-sm p-1 text-[11px] transition-colors ${on ? "bg-accent-tint font-bold text-accent" : "font-medium text-ink-soft hover:bg-inset"}`}
      >
        <span className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-sm border ${on ? "border-accent" : "border-border"}`}>
          {material ? (
            <svg viewBox={`${-s / 2} ${-s / 2} ${s} ${s}`} className="h-9 w-9" aria-hidden>
              <SurfaceFill material={material} footprint={{ kind: "rect", widthMm: s, depthMm: s }} w={s} d={s} id={`tile-${material}`} />
            </svg>
          ) : (
            <span aria-hidden className="h-full w-full bg-canvas" />
          )}
        </span>
        <span className="max-w-full truncate">{caption}</span>
      </button>
    );
  };
  return (
    <div className="min-w-0">
      {label && (
        <p id={labelId} className="mb-1.5 text-xs font-medium text-ink-soft">
          {label}
        </p>
      )}
      <div role="radiogroup" aria-labelledby={label ? labelId : undefined} aria-label={label ? undefined : "חומר"} className={`grid gap-1 ${columns === 4 ? "grid-cols-4" : columns === 9 ? "grid-cols-9" : "grid-cols-5"}`}>
        {none !== undefined && tile(undefined, none)}
        {SURFACE_MATERIALS.map((m) => tile(m, SURFACE_MATERIAL_LABEL[m]))}
      </div>
    </div>
  );
}
