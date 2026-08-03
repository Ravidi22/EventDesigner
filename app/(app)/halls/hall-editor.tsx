"use client";

import { useEffect, useState } from "react";
import { DoorOpen, Presentation, Trash2, Wine, X } from "lucide-react";
import type { HallTemplate } from "@/lib/setup/types";
import type { Hall, Point, Entrance, Fixture } from "@/lib/studio/hall";
import { loadTemplates } from "@/lib/setup/storage";
import { isTypingTarget } from "@/lib/keyboard";
import { nearestWallToPoint } from "@/lib/studio/geometry";
import { useOutlineEditor } from "@/lib/studio/use-outline-editor";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import {
  ShapeCanvas,
  SelectionInspector,
  type StructureDragType,
} from "@/components/shape-canvas";

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
  const [ceilingM, setCeilingM] = useState(draft.hall.ceilingHeightMm / 1000);
  // The shape, the doors, the fixtures and their undo history all live in the hook — this screen
  // only adds the hall's own fields (name, ceiling) and the save/delete plumbing.
  const ed = useOutlineEditor({
    outline: draft.hall.outline,
    edgeCurves: draft.hall.edgeCurves,
    entrances: draft.hall.entrances,
    stage: draft.hall.stage,
    bars: draft.hall.bars,
  });
  const { mode, outline, edgeCurves, entrances, stage, bars, selected } = ed;
  const {
    setSelected,
    removeVertex,
    removeEntrance,
    removeStage,
    removeBar,
    removeLastVertex,
  } = ed;

  const isNew = !loadTemplates().some((t) => t.id === draft.id);

  const dropStructure = (type: StructureDragType, p: Point) => {
    if (type === "entrance" && outline.length >= 3) {
      const { edgeIdx, distanceMm } = nearestWallToPoint(outline, p);
      const e: Entrance = {
        id: crypto.randomUUID(),
        wallIndex: edgeIdx,
        distanceMm,
        widthMm: 1600,
        swingInward: true,
        doubleDoor: true,
      };
      ed.addEntrance(e);
    } else if (type === "bar") {
      const b: Fixture = {
        id: crypto.randomUUID(),
        label: "בר",
        x: p.x,
        y: p.y,
        widthMm: 3000,
        depthMm: 1500,
        heightMm: 1100,
        shape: "rect",
        rotationDeg: 0,
      };
      ed.addBar(b);
    } else if (type === "stage" && !stage) {
      const s: Fixture = {
        id: "fx-stage",
        label: "במה",
        x: p.x,
        y: p.y,
        widthMm: 4000,
        depthMm: 2400,
        heightMm: 600,
        shape: "rect",
        rotationDeg: 0,
      };
      ed.addStage(s);
    }
  };

  // Global delete/escape: Backspace/Delete undoes the last drawn point while drawing, or removes
  // the current selection once the shape is closed. Escape clears the selection — but only in edit
  // mode; while drawing it belongs to the canvas, which reads it as "abandon this outline".
  // (Ctrl+Z/Ctrl+Y are the hook's own — every removal here goes through it, so all of it undoes.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget()) return;
      if (e.key === "Escape") {
        if (mode !== "draw") setSelected(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (mode === "draw") {
        removeLastVertex();
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
  }, [
    mode,
    selected,
    setSelected,
    removeVertex,
    removeEntrance,
    removeStage,
    removeBar,
    removeLastVertex,
  ]);

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
      ceilingHeightMm: Math.max(0, ceilingM) * 1000,
      columns: draft.hall.columns.map((c) => ({ ...c, ...shift(c) })), // preserved as-is (עמודים are no longer editable here)
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
        ? "הקלידו מספר לאורך מדויק · Alt לשחרור נעילת הזווית · Backspace לביטול הנקודה האחרונה"
        : "Enter או לחיצה על הנקודה הראשונה לסגירת הצורה · Backspace לביטול נקודה · Esc לביטול הציור";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <IconButton label="חזרה לרשימת האולמות" onClick={onCancel}>
          <X className="h-5 w-5" strokeWidth={2} />
        </IconButton>

        <div className="h-6 w-px bg-border" />

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם אולם"
          className="-mx-2 w-56 shrink-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-base font-semibold text-ink transition-colors placeholder:text-muted hover:border-border hover:bg-canvas focus-visible:border-accent focus-visible:bg-canvas"
          autoFocus
        />
        <NumberField
          layout="inline"
          label="גובה תקרה (מ׳)"
          min={0}
          value={ceilingM}
          onChange={setCeilingM}
          wrapperClassName="shrink-0"
          className="w-16"
        />

        <div className="flex-1" />

        <span className="max-w-xs truncate text-xs text-ink-soft">
          {mode === "draw"
            ? hint
            : "קליק ימני על הקנבס להוספת כניסה, במה או בר"}
        </span>
        {mode === "draw" && outline.length >= 3 && (
          <Button variant="ghost" onClick={ed.closeOutline}>
            סגירת הצורה
          </Button>
        )}

        <div className="h-6 w-px bg-border" />

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
        <div className="relative min-w-0 flex-1 bg-canvas">
          <ShapeCanvas
            mode={mode}
            outline={outline}
            edgeCurves={edgeCurves}
            columns={draft.hall.columns}
            entrances={entrances}
            stage={stage}
            bars={bars}
            selected={selected}
            onSelect={setSelected}
            onAddVertex={ed.addVertex}
            onCloseOutline={ed.closeOutline}
            onCancelDraw={() => ed.setAll({ outline: [], edgeCurves: [] })}
            onMoveVertex={ed.moveVertex}
            onMoveWallHandle={ed.moveWallHandle}
            onMoveEntrance={ed.moveEntrance}
            onMoveStage={(p) => ed.updateStage({ x: p.x, y: p.y })}
            onMoveBar={(id, p) => ed.updateBar(id, { x: p.x, y: p.y })}
            onUpdateStage={ed.updateStage}
            onUpdateBar={ed.updateBar}
            onCommit={ed.commit}
            canUndo={ed.canUndo}
            canRedo={ed.canRedo}
            onUndo={ed.undo}
            onRedo={ed.redo}
            contextMenuItems={(point) => [
              {
                label: "כניסה",
                icon: DoorOpen,
                disabled: outline.length < 3,
                onSelect: () => dropStructure("entrance", point),
              },
              ...(stage
                ? []
                : [
                    {
                      label: "במה",
                      icon: Presentation,
                      onSelect: () => dropStructure("stage", point),
                    },
                  ]),
              {
                label: "עמדת בר",
                icon: Wine,
                onSelect: () => dropStructure("bar", point),
              },
            ]}
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
                  onUpdateEntrance={ed.updateEntrance}
                  onUpdateStage={ed.updateStage}
                  onUpdateBar={ed.updateBar}
                  onRemoveEntrance={removeEntrance}
                  onRemoveStage={removeStage}
                  onRemoveBar={removeBar}
                  onRemoveVertex={removeVertex}
                  onInsertVertexOnWall={ed.insertVertexOnWall}
                  onSetWallLength={ed.setWallLength}
                  onSetWallAngle={ed.setWallAngle}
                  onSetWallBulgeDepth={ed.setWallBulgeDepth}
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
