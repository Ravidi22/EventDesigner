"use client";

import {
  Accessibility,
  ArrowDownUp,
  Box,
  Cylinder,
  Grid2x2,
  Grid3x3,
  Leaf,
  Mountain,
  Rows3,
  Sun,
  Hexagon,
  Flower2,
  Fence,
  Shrub,
  Sprout,
  TreeDeciduous,
  TreePalm,
  AppWindow,
  Blinds,
  DoorOpen,
  Droplets,
  Footprints,
  GlassWater,
  Presentation,
  Shapes,
  Square,
  Waves,
  type LucideIcon,
} from "lucide-react";

import {
  PLANT_SPECIES,
  SURFACE_MATERIALS,
  updateFeature,
  type FeatureKind,
  type PlantSpecies,
  type SurfaceMaterial,
  type StructureFeature,
} from "@/lib/venues/structure";

import {
  MAX_RISERS,
  climbCurved,
  climbRisers,
  climbRunMm,
  formatRatio,
  patchForHeight,
  patchForRisers,
  patchToAccessible,
  patchToCurved,
  patchToStraight,
  rampRatio,
  rampTooSteep,
  riserHeightMm,
  risersForRise,
  treadDepthMm,
  withRun,
} from "@/lib/venues/climb";
import { arcSpecOf } from "@/lib/studio/footprint";

import type { AddTool } from "@/lib/venues/add-tools";
import { ARC_SWEEP } from "@/lib/catalog/types";

import { Button } from "@/components/button";

import { NumberField } from "@/components/number-field";

import {
  InspectorGroup,
  SegmentedToggle,
} from "@/components/plan-canvas";

export const FEATURE_KINDS: FeatureKind[] = ["pool", "stage", "bar", "structure", "column", "other", "plant", "surface", "stairs", "ramp", "seating"];
// Which features are offered flights and ramps is takesEdgeItems (lib/venues/stage-edges.ts) — a
// stage, or a platform somebody climbs onto; never a bar, a fence or a column.

export const FEATURE_ICON: Record<FeatureKind, LucideIcon> = {
  pool: Waves,
  stage: Presentation,
  bar: GlassWater,
  structure: Box,
  column: Cylinder,
  other: Shapes,
  plant: Sprout,
  surface: Grid2x2,
  // The catalog's own icons for a stage's flight and a stage's ramp (lib/catalog/categories.ts).
  stairs: Footprints,
  ramp: Accessibility,
  // The sketch's own block of chairs wears the same (app/(app)/studio/inspector.tsx).
  seating: Rows3,
  // The catalog's own for its fountains (lib/catalog/categories.ts).
  fountain: Droplets,
  curtain: Blinds,
};

/** The icon an add-element entry wears, keyed by its feature kind — or by "entrance" for the one
 *  tool that is a door rather than a feature. Shared so the canvas's flyout and a zone's quick-add
 *  can't drift apart.
 *
 *  A record and not a function returning one: a component that comes back from a CALL is a new
 *  component on every render (react-hooks/static-components), and these are rendered in a grid. */
export const SURFACE_ICON: Record<SurfaceMaterial, LucideIcon> = {
  grass: Leaf,
  paving: Grid2x2,
  deck: Rows3,
  gravel: Hexagon,
  sand: Sun,
  soil: Mountain,
  tile: Grid3x3,
  plain: Square,
  water: Waves,
};

export const PLANT_ICON: Record<PlantSpecies, LucideIcon> = {
  palm: TreePalm,
  tree: TreeDeciduous,
  shrub: Shrub,
  pot: Sprout,
  hedge: Fence,
  flowers: Flower2,
};

export const ADD_TOOL_ICON: Record<string, LucideIcon> = {
  entrance: DoorOpen,
  window: AppWindow,
  ...FEATURE_ICON,
  ...Object.fromEntries(PLANT_SPECIES.map((p) => [`plant:${p}`, PLANT_ICON[p]])),
  ...Object.fromEntries(SURFACE_MATERIALS.map((m) => [`surface:${m}`, SURFACE_ICON[m]])),
};

/** The key into it. Kept beside the record so no caller has to remember the "entrance" fallback. */
export function addToolIconKey(tool: AddTool): string {
  if (tool.plant) return `plant:${tool.plant}`;
  if (tool.surface) return `surface:${tool.surface}`;
  // The two tools hung on a wall rather than placed: the door, and the window.
  return tool.kind ?? (tool.id === "window" ? "window" : "entrance");
}
// The hall editor's selection UI is app/(app)/halls/selection-bar.tsx — the sketch's own Bar of
// chips under the selection. What stays here are the field groups it opens in its panels (a
// climb's, a stage flight's) and the icon maps every surface of the hall editor shares.

// A free-standing flight or ramp (lib/venues/climb.ts). The height it climbs is the one number asked
// first; the steps follow from it (at most 18cm each), and so does the run — at the tread the flight
// already has, or at the slope the ramp was laid at. The run is still editable (and the handles on
// the plan still stretch it), so the panel says what the result is rather than refusing it: the
// riser and tread of a flight, a ramp's slope — in alert ink, with a one-click fix, when it is
// steeper than 1:12.
export function ClimbFields({
  feature,
  patch,
}: {
  feature: StructureFeature;
  patch: (p: Parameters<typeof updateFeature>[2]) => void;
}) {
  const ramp = feature.kind === "ramp";
  const curved = climbCurved(feature);
  const spec = curved ? arcSpecOf(feature.widthMm, feature.arc) : null;
  const steep = ramp && rampTooSteep(feature);
  return (
    <>
      {/* A ramp is straight: a slope round a curve is a different thing to walk, and to build. */}
      {!ramp && (
        <SegmentedToggle
          value={curved ? "arc" : "rect"}
          options={[
            { value: "rect", label: "ישרות" },
            { value: "arc", label: "מעוגלות" },
          ]}
          onChange={(v) => patch(v === "arc" ? patchToCurved(feature) : patchToStraight(feature))}
          ariaLabel="צורת המדרגות"
        />
      )}
      <InspectorGroup>
        {spec ? (
          <>
            <NumberField
              layout="inline"
              label="קוטר חיצוני (מ׳)"
              decimals={2}
              min={0.5}
              step={0.1}
              commitOnBlur
              value={feature.widthMm / 1000}
              onChange={(m) => patch({ widthMm: Math.round(m * 1000) })}
              className="w-20"
            />
            <NumberField
              layout="inline"
              label="קשת (°)"
              decimals={0}
              min={ARC_SWEEP.min}
              max={ARC_SWEEP.max}
              step={5}
              commitOnBlur
              value={spec.sweepDeg}
              onChange={(sweepDeg) => patch({ arc: { ...spec, sweepDeg } })}
              className="w-16"
            />
          </>
        ) : (
          <NumberField
            layout="inline"
            label="רוחב (מ׳)"
            decimals={2}
            min={0.4}
            step={0.1}
            commitOnBlur
            value={feature.widthMm / 1000}
            onChange={(m) => patch({ widthMm: Math.round(m * 1000) })}
            className="w-20"
          />
        )}
        <NumberField
          layout="inline"
          label={ramp ? "אורך (מ׳)" : "עומק (מ׳)"}
          decimals={2}
          min={0.2}
          step={0.1}
          commitOnBlur
          value={climbRunMm(feature) / 1000}
          onChange={(m) => patch(withRun(feature, m * 1000))}
          className="w-20"
        />
        <NumberField
          layout="inline"
          label="זווית (°)"
          decimals={0}
          min={0}
          max={360}
          value={feature.rotationDeg}
          onChange={(rotationDeg) => patch({ rotationDeg })}
          className="w-16"
        />
      </InspectorGroup>
      <InspectorGroup>
        <NumberField
          layout="inline"
          label="הפרש גובה (ס״מ)"
          decimals={0}
          min={0}
          step={5}
          commitOnBlur
          value={Math.round(feature.heightMm / 10)}
          onChange={(cm) => patch(patchForHeight(feature, cm * 10))}
          className="w-16"
        />
        {!ramp && (
          // Typing the count the height would give anyway goes back to deriving it.
          <NumberField
            layout="inline"
            label="מדרגות"
            decimals={0}
            min={1}
            max={MAX_RISERS}
            value={climbRisers(feature)}
            onChange={(n) => patch(patchForRisers(feature, n === risersForRise(feature.heightMm) ? undefined : n))}
            className="w-14"
          />
        )}
      </InspectorGroup>
      {ramp ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${steep ? "font-semibold text-alert-ink" : "text-muted"}`}>
            שיפוע <span className="nums" dir="ltr">{formatRatio(rampRatio(feature)) || "—"}</span>
            {steep && " · תלול מ־1:12"}
          </span>
          {steep && (
            <Button variant="outline" size="sm" onClick={() => patch(patchToAccessible(feature))}>
              התאמה ל־1:12
            </Button>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted">
          גובה מדרגה <span className="nums">{Math.round(riserHeightMm(feature) / 10)}</span> ס״מ · עומק מדרגה{" "}
          <span className="nums">{Math.round(treadDepthMm(feature) / 10)}</span> ס״מ
        </span>
      )}
      <div>
        <Button variant="outline" size="sm" onClick={() => patch({ climb: { ...feature.climb, reversed: !feature.climb?.reversed } })}>
          <ArrowDownUp className="h-4 w-4" strokeWidth={2} />
          היפוך כיוון העלייה
        </Button>
      </div>
    </>
  );
}
