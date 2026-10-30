"use client";
// The designer's plain hall sketch, as the venue sees it (lib/event-links/hall-pass.ts): tables and
// their chairs, numbers and seat counts, stages and bars, on the venue's own plan. Read-only — the
// studio's own canvas (CanvasStage over PlanCanvas) with every edit handler a no-op and no plane
// active, the way the client portal hosts it for a viewer. The design pass never reaches this page.
import { useMemo, useState } from "react";
import { CanvasStage, type SelectionRef } from "@/app/(app)/studio/canvas-stage";
import { eventPlan } from "@/lib/events/plan";
import { primeCatalog } from "@/lib/catalog/storage";
import { ALL_PLANES_VISIBLE } from "@/lib/studio/planes";
import type { HallSketch } from "@/lib/event-links/types";

const NOOP = () => {};
const NO_CLEARANCE = { subjects: [], issues: [] };
const NO_SELECTION: SelectionRef[] = [];

export function HallSketchView({ sketch }: { sketch: HallSketch }) {
  // Primed before the first child draws, in the initialiser, for the reason useCatalog gives.
  useState(() => {
    primeCatalog(sketch.products);
    return true;
  });
  const plan = useMemo(() => eventPlan({ venueId: sketch.venueId ?? undefined, zoneIds: sketch.zoneIds }, sketch.geometry), [sketch]);
  const seats = sketch.content.tables.reduce((n, t) => n + (t.seats ?? 0), 0);

  return (
    <div className="relative min-h-[70dvh] flex-1 overflow-hidden rounded-md bg-surface shadow-floating">
      <CanvasStage
        doc={sketch.content}
        plan={plan}
        selection={NO_SELECTION}
        layerVisible={ALL_PLANES_VISIBLE}
        spin="together"
        activeLayer={null}
        focusZoneId={null}
        onSelect={NOOP}
        onSelectMany={NOOP}
        onMoveTable={NOOP}
        onMovePlacement={NOOP}
        onMoveFeature={NOOP}
        onMoveMany={NOOP}
        onRotateMany={NOOP}
        onEndDrag={NOOP}
        onResizePlacement={NOOP}
        onSpanPlacement={NOOP}
        onDropProduct={NOOP}
        clearance={NO_CLEARANCE}
        showClearance={false}
        onToggleClearance={NOOP}
        onResizeTable={NOOP}
        stageFillActive={false}
        onStageFill={NOOP}
        drawArea={false}
        onArea={NOOP}
        onCancelArea={NOOP}
        areaPreview={null}
        onPickFront={NOOP}
        armed={null}
        onPlaceArmed={NOOP}
        onDisarm={NOOP}
        showTableNumbers
      />
      <p className="nums pointer-events-none absolute start-3 top-3 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-ink-soft shadow-lifted">
        {sketch.content.tables.length} שולחנות · {seats} מקומות ישיבה
      </p>
    </div>
  );
}
