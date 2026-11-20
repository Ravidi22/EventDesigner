"use client";

// The "עריכת הקווים" bar (2026-11-07, spec §4.3): what an outline out for editing — a traced zone's,
// a pool's, a free surface's — offers besides its handles on the plan. The SELECTED side's bow and
// the SELECTED corner's radius typed in cm, one radius for every corner, and "החלקה": every corner a
// third of its shorter side in one undo entry — a kidney out of four points in one click
// (lib/studio/shaped-outline.ts smoothShape). The handles pick the side or corner (a click on a
// side's line, on a point or its grip); the bar types what the drag does by eye.
import { PenLine, Plus, Spline } from "lucide-react";
import { Bar, Note } from "@/components/inspector-bar";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { InspectorDivider } from "@/components/plan-canvas";
import type { OutlinePart } from "@/components/venue-plan";
import { commonRadius, fitCornerRadii, maxSideBowMm, sideBowMm, type OutlineShape } from "@/lib/studio/shaped-outline";

export function OutlineBar({
  title = "עריכת הקווים",
  shape,
  selected,
  onBow,
  onCorner,
  onSmooth,
  onInsertMiddle,
  onClose,
}: {
  title?: string;
  shape: OutlineShape;
  selected: OutlinePart | null;
  /** Side `index` bowed `depthMm` out of the shape (− in): one undo entry. */
  onBow: (index: number, depthMm: number) => void;
  /** Corner `index` — or every corner — rounded at `radiusMm` (0 squares it): one undo entry. */
  onCorner: (index: number | "all", radiusMm: number) => void;
  onSmooth: () => void;
  /** "הוספת נקודה באמצע": a point on the picked side's middle (connected drawings §5.1). Absent = no button. */
  onInsertMiddle?: (side: number) => void;
  onClose: () => void;
}) {
  const n = shape.outline.length;
  const side = selected?.kind === "side" && selected.index < n ? selected.index : null;
  const corner = selected?.kind === "corner" && selected.index < n ? selected.index : null;
  const common = commonRadius(shape);
  const facts = side !== null ? `צלע ${side + 1}` : corner !== null ? `פינה ${corner + 1}` : "בחרו צלע או פינה על התוכנית";
  // A radius the sides cannot take is drawn at what they can — said beside the typed one.
  const drawn = corner !== null ? Math.round(fitCornerRadii(shape.outline, shape.edgeCurves, shape.corners).radiusMm[corner] / 10) : null;
  const typed = corner !== null ? Math.round((shape.corners?.[corner] ?? 0) / 10) : 0;
  return (
    <Bar icon={PenLine} title={title} facts={facts} onClose={onClose}>
      {side !== null && (
        <NumberField
          layout="inline"
          label={`עיקום (ס״מ, עד ${Math.round(maxSideBowMm(shape, side) / 10)})`}
          decimals={0}
          min={-Math.round(maxSideBowMm(shape, side) / 10)}
          max={Math.round(maxSideBowMm(shape, side) / 10)}
          step={5}
          commitOnBlur
          value={Math.round(sideBowMm(shape, side) / 10)}
          onChange={(cm) => onBow(side, cm * 10)}
          className="w-20"
        />
      )}
      {side !== null && onInsertMiddle && (
        <Button size="sm" variant="outline" onClick={() => onInsertMiddle(side)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          הוספת נקודה באמצע
        </Button>
      )}
      {corner !== null && (
        <>
          <NumberField
            layout="inline"
            label="רדיוס (ס״מ)"
            decimals={0}
            min={0}
            step={5}
            commitOnBlur
            value={typed}
            onChange={(cm) => onCorner(corner, cm * 10)}
            className="w-20"
          />
          {drawn !== null && drawn < typed && <span className="text-xs text-muted">מצויר {drawn} — הצלעות קצרות</span>}
        </>
      )}
      {(side !== null || corner !== null) && <InspectorDivider />}
      <NumberField
        layout="inline"
        label="כל הפינות (ס״מ)"
        decimals={0}
        min={0}
        step={5}
        commitOnBlur
        hideZero
        placeholder={common === null ? "שונות" : undefined}
        value={Math.round((common ?? 0) / 10)}
        onChange={(cm) => onCorner("all", cm * 10)}
        className="w-20"
      />
      <Button size="sm" variant="outline" onClick={onSmooth}>
        <Spline className="h-3.5 w-3.5" strokeWidth={2} />
        החלקה
      </Button>
      {selected === null && <Note>עיקום: גררו את המעוין שבאמצע צלע · רדיוס: גררו את העיגול שבתוך פינה (Alt — כולן)</Note>}
      {/* The drawing bar's last word (the board: options · סיום) — what its ✕ does. */}
      <div className="ms-auto ps-2">
        <Button size="sm" onClick={onClose}>
          סיום
        </Button>
      </div>
    </Bar>
  );
}
