"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Point } from "@/lib/design-document/types";
import type { EdgeCurve } from "@/lib/studio/hall";
import { outlineBounds } from "@/lib/studio/footprint";
import { bulgeToCurve, clampEdgeCurve, edgeMidpoint, endpointFromLengthAngle, setBulgeDepth, wallAngleDeg, wallLengthMm } from "@/lib/studio/geometry";
import { Button } from "@/components/button";
import { controlClassName } from "@/components/control";
import { ShapeCanvas, SelectionInspector, type SelectedRef } from "@/components/shape-canvas";

type Curves = (EdgeCurve | null)[];
const padCurves = (c: Curves | undefined, len: number): Curves => Array.from({ length: len }, (_, i) => c?.[i] ?? null);

// Product footprints are cm-scale — feed the shared canvas a small frame + fine grid so a ~1.6m
// table doesn't render as a speck inside the hall-scale (22m) default.
const PRODUCT_FRAME = { padMm: 200, minExtentMm: { w: 2000, h: 2000 }, gridMm: 100 };

// The custom-footprint editor: the full hall shape canvas (pan/zoom, guides, measure, curves, edge
// length/angle inspector) in a modal, minus everything hall-specific (no entrances/stage/bars). This
// container owns the outline + edge curves and the geometry handlers — the same plumbing hall-editor
// uses, without the entrance-index bookkeeping. Width/depth inputs rescale the whole shape.
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
  const [outline, setOutline] = useState<Point[]>(outlineProp);
  const [curves, setCurves] = useState<Curves>(padCurves(curvesProp, outlineProp.length));
  const [selected, setSelected] = useState<SelectedRef | null>(null);
  const [mode, setMode] = useState<"draw" | "edit">(outlineProp.length >= 3 ? "edit" : "draw");
  const [edit, setEdit] = useState<{ w?: string; h?: string }>({}); // in-flight size text, committed on blur/Enter

  useEffect(() => {
    if (open) {
      setOutline(outlineProp);
      setCurves(padCurves(curvesProp, outlineProp.length));
      setSelected(null);
      setMode(outlineProp.length >= 3 ? "edit" : "draw");
      setEdit({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // --- geometry handlers (no entrances/fixtures — a footprint is just a curved polygon) ---
  const moveVertex = (idx: number, p: Point) => setOutline((prev) => prev.map((v, i) => (i === idx ? p : v)));
  const closeOutline = () => { if (outline.length >= 3) { setCurves(Array(outline.length).fill(null)); setMode("edit"); } };

  const moveWallHandle = (edgeIdx: number, which: "bulge" | "c1" | "c2", p: Point) => {
    const n = outline.length;
    const a = outline[edgeIdx];
    const b = outline[(edgeIdx + 1) % n];
    setCurves((prev) =>
      prev.map((c, i) => {
        if (i !== edgeIdx) return c;
        if (which === "bulge") return bulgeToCurve(a, b, p);
        if (!c) return c;
        const next = which === "c1" ? { ...c, c1: { x: p.x - a.x, y: p.y - a.y } } : { ...c, c2: { x: p.x - b.x, y: p.y - b.y } };
        return clampEdgeCurve(a, b, next);
      }),
    );
  };

  // Removing a corner merges its two edges into one straight edge.
  const removeVertex = (idx: number) => {
    if (outline.length <= 3) return;
    const n = outline.length;
    const prev = (idx - 1 + n) % n;
    const nc: Curves = [];
    for (let i = 0; i < n; i++) { if (i === idx) continue; nc.push(i === prev ? null : (curves[i] ?? null)); }
    setOutline((o) => o.filter((_, i) => i !== idx));
    setCurves(nc);
    setSelected(null);
  };

  const insertVertexOnWall = (edgeIdx: number) => {
    const n = outline.length;
    const a = outline[edgeIdx];
    const b = outline[(edgeIdx + 1) % n];
    const mid = edgeMidpoint(a, b, curves[edgeIdx] ?? null);
    const nextOutline = [...outline.slice(0, edgeIdx + 1), mid, ...outline.slice(edgeIdx + 1)];
    const nc: Curves = [];
    for (let i = 0; i < n; i++) { if (i === edgeIdx) nc.push(null, null); else nc.push(curves[i] ?? null); }
    setOutline(nextOutline);
    setCurves(nc);
    setSelected({ kind: "vertex", id: String(edgeIdx + 1) });
  };

  const setWallLength = (edgeIdx: number, meters: number) => {
    const n = outline.length;
    const a = outline[edgeIdx];
    const b = outline[(edgeIdx + 1) % n];
    moveVertex((edgeIdx + 1) % n, endpointFromLengthAngle(a, Math.max(1, meters * 1000), wallAngleDeg(a, b)));
  };
  const setWallAngle = (edgeIdx: number, degrees: number) => {
    const n = outline.length;
    const a = outline[edgeIdx];
    const b = outline[(edgeIdx + 1) % n];
    moveVertex((edgeIdx + 1) % n, endpointFromLengthAngle(a, wallLengthMm(a, b), degrees));
  };
  const setWallBulgeDepth = (edgeIdx: number, depthMm: number) => {
    const n = outline.length;
    const a = outline[edgeIdx];
    const b = outline[(edgeIdx + 1) % n];
    setCurves((prev) => prev.map((c, i) => (i === edgeIdx ? setBulgeDepth(a, b, c, depthMm) : c)));
  };

  const bounds = outline.length >= 3 ? outlineBounds(outline) : null;
  const mmToCm = (mm: number) => String(Math.round(mm / 10));

  // Rescale the shape to a new bounding width/height (cm). Curves are endpoint-relative offsets, so
  // they scale by the same per-axis factor.
  const resize = (dim: "w" | "h", cm: number) => {
    if (!bounds || bounds.w === 0 || bounds.h === 0) return;
    const target = Math.max(100, cm * 10);
    const sx = dim === "w" ? target / bounds.w : 1;
    const sy = dim === "h" ? target / bounds.h : 1;
    setOutline(outline.map((p) => ({ x: Math.round(bounds.cx + (p.x - bounds.cx) * sx), y: Math.round(bounds.cy + (p.y - bounds.cy) * sy) })));
    setCurves(curves.map((c) => (c ? { c1: { x: c.c1.x * sx, y: c.c1.y * sy }, c2: { x: c.c2.x * sx, y: c.c2.y * sy } } : c)));
  };

  const hint =
    outline.length === 0 ? "לחצו על הקנבס כדי לצייר את הצורה"
    : outline.length < 3 ? "המשיכו להוסיף נקודות…"
    : "לחצו שוב על הנקודה הראשונה כדי לסגור את הצורה";

  const sizeInput = `${controlClassName} nums px-2 w-16`;
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
            <Button variant="ghost" onClick={closeOutline}>סגירת הצורה</Button>
          )}
          <Button variant="ghost" className="ms-auto" disabled={outline.length === 0} onClick={() => { setOutline([]); setCurves([]); setSelected(null); setMode("draw"); }}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            ניקוי
          </Button>
        </header>

        <div className="relative min-h-0 flex-1 bg-canvas">
          <ShapeCanvas
            mode={mode}
            outline={outline}
            edgeCurves={curves}
            selected={selected}
            onSelect={setSelected}
            onAddVertex={(p) => setOutline((prev) => [...prev, p])}
            onCloseOutline={closeOutline}
            onMoveVertex={moveVertex}
            onMoveWallHandle={moveWallHandle}
            padMm={PRODUCT_FRAME.padMm}
            minExtentMm={PRODUCT_FRAME.minExtentMm}
            gridMm={PRODUCT_FRAME.gridMm}
          />
          {selected && (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
              <div className="pointer-events-auto">
                <SelectionInspector
                  selected={selected}
                  outline={outline}
                  edgeCurves={curves}
                  onRemoveVertex={removeVertex}
                  onInsertVertexOnWall={insertVertexOnWall}
                  onSetWallLength={setWallLength}
                  onSetWallAngle={setWallAngle}
                  onSetWallBulgeDepth={setWallBulgeDepth}
                  onClose={() => setSelected(null)}
                  edgeNoun="צלע"
                />
              </div>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-border px-5 py-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            רוחב (ס״מ)
            <input
              type="number" inputMode="decimal" min={0} disabled={!bounds}
              value={edit.w ?? (bounds ? mmToCm(bounds.w) : "")}
              onChange={(e) => setEdit((s) => ({ ...s, w: e.target.value }))}
              onBlur={() => { if (edit.w != null) { resize("w", Number(edit.w) || 0); setEdit((s) => ({ ...s, w: undefined })); } }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className={sizeInput}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            עומק (ס״מ)
            <input
              type="number" inputMode="decimal" min={0} disabled={!bounds}
              value={edit.h ?? (bounds ? mmToCm(bounds.h) : "")}
              onChange={(e) => setEdit((s) => ({ ...s, h: e.target.value }))}
              onBlur={() => { if (edit.h != null) { resize("h", Number(edit.h) || 0); setEdit((s) => ({ ...s, h: undefined })); } }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className={sizeInput}
            />
          </label>
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
