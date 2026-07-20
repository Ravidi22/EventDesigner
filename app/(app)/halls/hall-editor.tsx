"use client";

import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { HallTemplate } from "@/lib/setup/types";
import type { Hall, Point, EdgeCurve, Entrance, Fixture, Column } from "@/lib/studio/hall";
import { loadTemplates } from "@/lib/setup/storage";
import {
  edgeMidpoint,
  bulgeToCurve,
  wallLengthMm,
  wallAngleDeg,
  endpointFromLengthAngle,
  setBulgeDepth,
  clampEdgeCurve,
  nearestWallToPoint,
  projectOntoWall,
} from "@/lib/studio/geometry";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { controlClassName } from "@/components/control";
import { StructureRail, type StructureDragType } from "./structure-rail";
import { WallCanvas, SelectionInspector, type SelectedRef } from "./wall-canvas";

const toM = (mm: number) => String(mm / 1000);
const smallInput = `${controlClassName} nums px-2 w-16`;

function computeColumns(outline: Point[], count: number): Column[] {
  if (outline.length < 3 || count <= 0) return [];
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const minX = Math.min(...xs);
  const w = Math.max(...xs) - minX;
  const minY = Math.min(...ys);
  const h = Math.max(...ys) - minY;
  return Array.from({ length: count }, (_, i) => ({ x: minX + (w / (count + 1)) * (i + 1), y: minY + h / 2, rMm: 350 }));
}

function sanitizeEdgeCurves(outline: Point[], edgeCurves: (EdgeCurve | null)[] | undefined): (EdgeCurve | null)[] {
  // Older/seed halls saved before curves existed have no edgeCurves — pad to match the outline
  // instead of leaving it empty, or every per-edge update would map over nothing. Also re-clamp
  // every curve to the current per-wall bound, in case it was ever saved before the bulge-depth
  // clamp existed (that's how "עיקום" could show an absurd number).
  const n = outline.length;
  const base = edgeCurves?.length === n ? edgeCurves : Array(n).fill(null);
  return base.map((c, i) => (c ? clampEdgeCurve(outline[i], outline[(i + 1) % n], c) : c));
}

// Full-screen shape editor, same shell as the studio: a rail on one side, the hall canvas on the
// other (RTL DOM order puts the canvas on the left, matching /studio). New halls start with an
// empty outline — draw the walls one click at a time; existing halls open straight into edit
// mode on their saved shape. No dialog, no native <form> — plain state, plain buttons.
export function HallEditor({
  draft,
  onSave,
  onDelete,
  onCancel,
}: {
  draft: HallTemplate;
  onSave: (t: HallTemplate) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(draft.name);
  const [ceilingM, setCeilingM] = useState(toM(draft.hall.ceilingHeightMm));
  const [columnCount, setColumnCount] = useState(String(draft.hall.columns.length));
  const [outline, setOutline] = useState<Point[]>(draft.hall.outline ?? []);
  const [edgeCurves, setEdgeCurves] = useState<(EdgeCurve | null)[]>(sanitizeEdgeCurves(draft.hall.outline ?? [], draft.hall.edgeCurves));
  const [mode, setMode] = useState<"draw" | "edit">((draft.hall.outline?.length ?? 0) >= 3 ? "edit" : "draw");
  const [entrances, setEntrances] = useState<Entrance[]>(draft.hall.entrances);
  const [stage, setStage] = useState<Fixture | undefined>(draft.hall.stage);
  const [bars, setBars] = useState<Fixture[]>(draft.hall.bars);
  const [selected, setSelected] = useState<SelectedRef | null>(null);

  const isNew = !loadTemplates().some((t) => t.id === draft.id);
  const nCols = Math.max(0, Math.min(12, Number(columnCount) || 0));
  const previewColumns = computeColumns(outline, nCols);

  const closeOutline = () => {
    if (outline.length < 3) return;
    setEdgeCurves(Array(outline.length).fill(null));
    setMode("edit");
  };

  const moveVertex = (idx: number, p: Point) => setOutline((prev) => prev.map((v, i) => (i === idx ? p : v)));

  // Removing a corner merges its two adjacent walls into one straight wall — doors on either of
  // those walls lose their host and are dropped; every other door's wallIndex shifts to match.
  const removeVertex = (idx: number) => {
    if (outline.length <= 3) return;
    const n = outline.length;
    const incomingIdx = (idx - 1 + n) % n;
    const nextCurves: (EdgeCurve | null)[] = [];
    const indexMap = new Map<number, number>();
    let newIdx = 0;
    for (let i = 0; i < n; i++) {
      if (i === idx) continue;
      nextCurves.push(i === incomingIdx ? null : (edgeCurves[i] ?? null));
      indexMap.set(i, newIdx);
      newIdx++;
    }
    setOutline((prev) => prev.filter((_, i) => i !== idx));
    setEdgeCurves(nextCurves);
    setEntrances((prev) =>
      prev.filter((e) => e.wallIndex !== idx && e.wallIndex !== incomingIdx).map((e) => ({ ...e, wallIndex: indexMap.get(e.wallIndex)! })),
    );
    setSelected(null);
  };

  // Splitting a wall shifts every later wall's index by one; a door on the split wall stays on
  // whichever half it now falls in (measured along the original chord).
  const insertVertexOnWall = (edgeIdx: number) => {
    const n = outline.length;
    const a = outline[edgeIdx];
    const b = outline[(edgeIdx + 1) % n];
    const mid = edgeMidpoint(a, b, edgeCurves[edgeIdx] ?? null);
    const splitDistance = wallLengthMm(a, b) / 2;
    const nextOutline = [...outline.slice(0, edgeIdx + 1), mid, ...outline.slice(edgeIdx + 1)];
    const nextCurves: (EdgeCurve | null)[] = [];
    for (let i = 0; i < n; i++) {
      if (i === edgeIdx) nextCurves.push(null, null); // wall splits into two straight segments
      else nextCurves.push(edgeCurves[i] ?? null);
    }
    setOutline(nextOutline);
    setEdgeCurves(nextCurves);
    setEntrances((prev) =>
      prev.map((e) => {
        if (e.wallIndex === edgeIdx) {
          return e.distanceMm < splitDistance ? e : { ...e, wallIndex: edgeIdx + 1, distanceMm: e.distanceMm - splitDistance };
        }
        return e.wallIndex > edgeIdx ? { ...e, wallIndex: e.wallIndex + 1 } : e;
      }),
    );
    setSelected({ kind: "vertex", id: String(edgeIdx + 1) });
  };

  const moveWallHandle = (edgeIdx: number, which: "bulge" | "c1" | "c2", p: Point) => {
    const n = outline.length;
    const a = outline[edgeIdx];
    const b = outline[(edgeIdx + 1) % n];
    setEdgeCurves((prev) =>
      prev.map((c, i) => {
        if (i !== edgeIdx) return c;
        if (which === "bulge") return bulgeToCurve(a, b, p);
        if (!c) return c;
        const next = which === "c1" ? { ...c, c1: { x: p.x - a.x, y: p.y - a.y } } : { ...c, c2: { x: p.x - b.x, y: p.y - b.y } };
        return clampEdgeCurve(a, b, next);
      }),
    );
  };

  // Numeric wall editing: length/angle move the wall's end vertex through the same moveVertex
  // plumbing a drag would use; bulge depth writes through the same edgeCurves state a drag would.
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
    setEdgeCurves((prev) => prev.map((c, i) => (i === edgeIdx ? setBulgeDepth(a, b, c, depthMm) : c)));
  };

  const updateEntrance = (id: string, patch: Partial<Entrance>) => setEntrances((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const updateStage = (patch: Partial<Fixture>) => setStage((prev) => (prev ? { ...prev, ...patch } : prev));
  const updateBar = (id: string, patch: Partial<Fixture>) => setBars((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const removeEntrance = (id: string) => {
    setEntrances((prev) => prev.filter((e) => e.id !== id));
    setSelected((s) => (s?.kind === "entrance" && s.id === id ? null : s));
  };
  const removeStage = () => {
    setStage(undefined);
    setSelected((s) => (s?.kind === "stage" ? null : s));
  };
  const removeBar = (id: string) => {
    setBars((prev) => prev.filter((b) => b.id !== id));
    setSelected((s) => (s?.kind === "bar" && s.id === id ? null : s));
  };

  const dropStructure = (type: StructureDragType, p: Point) => {
    if (type === "entrance" && outline.length >= 3) {
      const { edgeIdx, distanceMm } = nearestWallToPoint(outline, p);
      const e: Entrance = { id: crypto.randomUUID(), wallIndex: edgeIdx, distanceMm, widthMm: 1600, swingInward: true, doubleDoor: true };
      setEntrances((prev) => [...prev, e]);
      setSelected({ kind: "entrance", id: e.id });
    } else if (type === "bar") {
      const b: Fixture = { id: crypto.randomUUID(), label: "בר", x: p.x, y: p.y, widthMm: 3000, depthMm: 1500, heightMm: 1100, shape: "rect", rotationDeg: 0 };
      setBars((prev) => [...prev, b]);
      setSelected({ kind: "bar", id: b.id });
    } else if (type === "stage" && !stage) {
      const s: Fixture = { id: "fx-stage", label: "במה", x: p.x, y: p.y, widthMm: 4000, depthMm: 2400, heightMm: 600, shape: "rect", rotationDeg: 0 };
      setStage(s);
      setSelected({ kind: "stage", id: s.id });
    }
  };

  // Global delete/escape: Backspace/Delete undoes the last drawn point while drawing, or removes
  // the current selection once the shape is closed. Escape just clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      if (e.key === "Escape") {
        setSelected(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (mode === "draw") {
        setOutline((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
        e.preventDefault();
        return;
      }
      if (!selected) return;
      e.preventDefault();
      if (selected.kind === "vertex") removeVertex(Number(selected.id));
      else if (selected.kind === "entrance") removeEntrance(selected.id);
      else if (selected.kind === "stage") removeStage();
      else if (selected.kind === "bar") removeBar(selected.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selected, outline, edgeCurves, entrances, bars, stage]);

  const buildHall = (): Hall => {
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const shift = (p: Point) => ({ x: p.x - minX, y: p.y - minY });
    return {
      widthMm: Math.max(...xs) - minX,
      heightMm: Math.max(...ys) - minY,
      outline: outline.map(shift),
      edgeCurves,
      ceilingHeightMm: Math.max(0, Number(ceilingM) || 0) * 1000,
      columns: computeColumns(outline, nCols).map((c) => ({ ...c, ...shift(c) })),
      entrances, // wall-relative (wallIndex + distanceMm along the chord) — translation-invariant
      stage: stage ? { ...stage, ...shift(stage) } : undefined,
      bars: bars.map((b) => ({ ...b, ...shift(b) })),
    };
  };

  const canSave = name.trim() !== "" && mode === "edit" && outline.length >= 3;
  const save = () => {
    if (!canSave) return;
    onSave({ ...draft, name: name.trim(), hall: buildHall() });
  };

  const hint =
    outline.length === 0
      ? "לחצו על הקנבס כדי להתחיל לצייר את קירות האולם"
      : outline.length < 3
        ? "המשיכו להוסיף פינות…"
        : "לחצו שוב על הנקודה הראשונה כדי לסגור את הצורה";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-6">
        <IconButton label="חזרה לרשימת האולמות" onClick={onCancel}>
          <X className="h-5 w-5" strokeWidth={2} />
        </IconButton>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="אולם לה־וידה"
          className="w-56 shrink-0 border-0 bg-transparent text-base font-semibold text-ink placeholder:text-muted focus:outline-none"
          autoFocus
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
          גובה תקרה (מ׳)
          <input type="number" inputMode="decimal" min={0} value={ceilingM} onChange={(e) => setCeilingM(e.target.value)} className={smallInput} />
        </label>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
          עמודים
          <input type="number" inputMode="numeric" min={0} max={12} value={columnCount} onChange={(e) => setColumnCount(e.target.value)} className={smallInput} />
        </label>

        <div className="flex-1" />

        {mode === "draw" && <span className="text-xs text-ink-soft">{hint}</span>}
        {mode === "draw" && outline.length >= 3 && (
          <Button variant="ghost" onClick={closeOutline}>
            סגירת הצורה
          </Button>
        )}

        <Button onClick={save} disabled={!canSave}>
          שמירת האולם
        </Button>
        {!isNew && (
          <Button variant="danger" onClick={() => onDelete(draft.id)}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            מחיקה
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <StructureRail hasStage={Boolean(stage)} />
        <div className="relative min-w-0 flex-1 bg-canvas">
          <WallCanvas
            mode={mode}
            outline={outline}
            edgeCurves={edgeCurves}
            columns={previewColumns}
            entrances={entrances}
            stage={stage}
            bars={bars}
            selected={selected}
            onSelect={setSelected}
            onAddVertex={(p) => setOutline((prev) => [...prev, p])}
            onCloseOutline={closeOutline}
            onMoveVertex={moveVertex}
            onMoveWallHandle={moveWallHandle}
            onMoveEntrance={(id, p) =>
              setEntrances((prev) =>
                prev.map((e) => {
                  if (e.id !== id) return e;
                  const a = outline[e.wallIndex];
                  const b = outline[(e.wallIndex + 1) % outline.length];
                  return { ...e, distanceMm: projectOntoWall(a, b, p) };
                }),
              )
            }
            onMoveStage={(p) => setStage((prev) => (prev ? { ...prev, x: p.x, y: p.y } : prev))}
            onMoveBar={(id, p) => setBars((prev) => prev.map((b) => (b.id === id ? { ...b, x: p.x, y: p.y } : b)))}
            onUpdateStage={updateStage}
            onUpdateBar={updateBar}
            onDropStructure={dropStructure}
          />
          {selected && (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
              <div className="pointer-events-auto">
                <SelectionInspector
                  selected={selected}
                  outline={outline}
                  edgeCurves={edgeCurves}
                  entrances={entrances}
                  stage={stage}
                  bars={bars}
                  onUpdateEntrance={updateEntrance}
                  onUpdateStage={updateStage}
                  onUpdateBar={updateBar}
                  onRemoveEntrance={removeEntrance}
                  onRemoveStage={removeStage}
                  onRemoveBar={removeBar}
                  onRemoveVertex={removeVertex}
                  onInsertVertexOnWall={insertVertexOnWall}
                  onSetWallLength={setWallLength}
                  onSetWallAngle={setWallAngle}
                  onSetWallBulgeDepth={setWallBulgeDepth}
                  onClose={() => setSelected(null)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
