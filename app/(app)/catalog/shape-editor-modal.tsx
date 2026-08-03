"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import type { Point } from "@/lib/design-document/types";
import type { EdgeCurve } from "@/lib/studio/hall";
import { outlineBounds } from "@/lib/studio/footprint";
import { useOutlineEditor } from "@/lib/studio/use-outline-editor";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { ShapeCanvas, SelectionInspector } from "@/components/shape-canvas";

type Curves = (EdgeCurve | null)[];
const padCurves = (c: Curves | undefined, len: number): Curves => Array.from({ length: len }, (_, i) => c?.[i] ?? null);

// Product footprints are cm-scale — feed the shared canvas a small frame + fine grid so a ~1.6m
// table doesn't render as a speck inside the hall-scale (22m) default.
const PRODUCT_FRAME = { padMm: 200, minExtentMm: { w: 2000, h: 2000 }, gridMm: 100 };

// The custom-footprint editor: the full hall shape canvas (pan/zoom, guides, measure, curves, edge
// length/angle inspector) in a modal, minus everything hall-specific (no entrances/stage/bars). The
// outline, the geometry handlers and the undo history come from the shared editor hook — the hall's
// collections simply stay empty here. Width/depth inputs rescale the whole shape.
export function ShapeEditorModal({
  open,
  outline: outlineProp,
  edgeCurves: curvesProp,
  onSave,
  onClose,
}: {
  open: boolean;
  outline: Point[];
  edgeCurves: Curves | undefined;
  onSave: (outline: Point[], edgeCurves: Curves) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // The modal stays mounted between openings, so the hook's global Ctrl+Z has to stand down while
  // it's closed — and reopening on another product starts a fresh history (see reset below), or
  // undo would walk back into a shape that belongs to someone else.
  const ed = useOutlineEditor({ outline: outlineProp, edgeCurves: curvesProp }, { enabled: open });
  const { mode, outline, edgeCurves: curves, lockedEdges, selected, setSelected, reset } = ed;

  useEffect(() => {
    if (open) reset({ outline: outlineProp, edgeCurves: curvesProp });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const bounds = outline.length >= 3 ? outlineBounds(outline) : null;
  const mmToCm = (mm: number) => Math.round(mm / 10);

  // Rescale the shape to a new bounding width/height (cm). Curves are endpoint-relative offsets, so
  // they scale by the same per-axis factor. Not a single geometry edit, so it goes in as one
  // whole-state step — still one Ctrl+Z.
  const resize = (dim: "w" | "h", cm: number) => {
    if (!bounds || bounds.w === 0 || bounds.h === 0) return;
    const target = Math.max(100, cm * 10);
    const sx = dim === "w" ? target / bounds.w : 1;
    const sy = dim === "h" ? target / bounds.h : 1;
    ed.setAll({
      outline: outline.map((p) => ({ x: Math.round(bounds.cx + (p.x - bounds.cx) * sx), y: Math.round(bounds.cy + (p.y - bounds.cy) * sy) })),
      edgeCurves: curves.map((c) => (c ? { c1: { x: c.c1.x * sx, y: c.c1.y * sy }, c2: { x: c.c2.x * sx, y: c.c2.y * sy } } : c)),
    });
  };

  const clearShape = () => ed.setAll({ outline: [], edgeCurves: [], mode: "draw" });

  const hint =
    outline.length === 0 ? "לחצו על הקנבס כדי לצייר את הצורה"
    : outline.length < 3 ? "הקלידו מספר לאורך מדויק · Alt לשחרור נעילת הזווית"
    : "Enter או לחיצה על הנקודה הראשונה לסגירת הצורה · הקלידו מספר לאורך מדויק · Esc לניקוי";

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} className="modal m-auto max-h-none rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog">
      <div className="flex h-[80vh] w-[88vw] max-w-4xl flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <span className="text-sm font-semibold text-ink">עריכת צורת הפריט</span>
          {mode === "draw" ? (
            <span className="text-xs text-muted">{hint}</span>
          ) : (
            <span className="hidden text-xs text-muted md:inline">גררו נקודה להזזה · ידית האמצע מעקמת קצה · בחרו קצה לעריכת אורך/זווית/עיקום · רווח לגרירת התצוגה</span>
          )}
          {mode === "draw" && outline.length >= 3 && (
            <Button variant="ghost" onClick={ed.closeOutline}>סגירת הצורה</Button>
          )}
          <Button variant="ghost" className="ms-auto" disabled={outline.length === 0} onClick={clearShape}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            ניקוי
          </Button>
        </header>

        <div className="relative min-h-0 flex-1 bg-canvas">
          <ShapeCanvas
            mode={mode}
            outline={outline}
            edgeCurves={curves}
            lockedEdges={lockedEdges}
            selected={selected}
            onSelect={(ref) => setSelected(ref ? [ref] : [])}
            onToggleSelect={ed.toggleSelected}
            onSelectMany={ed.selectMany}
            onAddVertex={ed.addVertex}
            onCloseOutline={ed.closeOutline}
            onCancelDraw={clearShape}
            onMoveVertex={ed.moveVertex}
            onMoveWallHandle={ed.moveWallHandle}
            onMoveSelection={ed.moveSelection}
            onToggleWallLock={ed.toggleWallLock}
            onCommit={ed.commit}
            canUndo={ed.canUndo}
            canRedo={ed.canRedo}
            onUndo={ed.undo}
            onRedo={ed.redo}
            padMm={PRODUCT_FRAME.padMm}
            minExtentMm={PRODUCT_FRAME.minExtentMm}
            gridMm={PRODUCT_FRAME.gridMm}
          />
          {selected.length > 0 && (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
              <div className="pointer-events-auto">
                <SelectionInspector
                  selected={selected}
                  outline={outline}
                  edgeCurves={curves}
                  lockedEdges={lockedEdges}
                  onRemoveVertex={ed.removeVertex}
                  onRemoveSelection={ed.removeSelection}
                  onInsertVertexOnWall={ed.insertVertexOnWall}
                  onSetWallLength={ed.setWallLength}
                  onSetWallAngle={ed.setWallAngle}
                  onSetWallBulgeDepth={ed.setWallBulgeDepth}
                  onToggleWallLock={ed.toggleWallLock}
                  onClose={() => setSelected([])}
                  edgeNoun="צלע"
                />
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-border px-5 py-3">
          <NumberField
            layout="inline"
            label="רוחב (ס״מ)"
            decimals={0}
            min={0}
            commitOnBlur
            disabled={!bounds}
            value={bounds ? mmToCm(bounds.w) : 0}
            onChange={(cm) => resize("w", cm)}
            className="w-16"
          />
          <NumberField
            layout="inline"
            label="עומק (ס״מ)"
            decimals={0}
            min={0}
            commitOnBlur
            disabled={!bounds}
            value={bounds ? mmToCm(bounds.h) : 0}
            onChange={(cm) => resize("h", cm)}
            className="w-16"
          />
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
          <Button disabled={outline.length < 3} onClick={() => { onSave(outline, padCurves(curves, outline.length)); onClose(); }}>
            שמירת הצורה
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
