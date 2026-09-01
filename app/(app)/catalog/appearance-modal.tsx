"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { MapAppearance, MapShape, Product } from "@/lib/catalog/types";
import { MAP_SHAPES, SHAPE_LABEL } from "@/lib/catalog/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import type { EdgeCurve } from "@/lib/studio/hall";
import {
  buildShapeOutline,
  customShapeBounds,
  resolveContent,
  resolveFootprint,
  type BuiltOutline,
} from "@/lib/studio/footprint";
import { useOutlineEditor } from "@/lib/studio/use-outline-editor";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { Select } from "@/components/select";
import { Segmented } from "@/components/segmented";
import { StyleFields } from "@/components/style-fields";
import { PlanCanvas, SelectionInspector } from "@/components/plan-canvas";
import { fieldLabelClassName } from "@/components/control";
import { AppearancePreview, PlanContent } from "./appearance-preview";
import { IconPicker } from "./icon-picker";

type Curves = (EdgeCurve | null)[];
const padCurves = (c: Curves | undefined, len: number): Curves => Array.from({ length: len }, (_, i) => c?.[i] ?? null);

// Product footprints are cm-scale — feed the shared canvas a small frame + fine grid so a ~1.6m
// table doesn't render as a speck inside the hall-scale (22m) default.
const PRODUCT_FRAME = { padMm: 200, minExtentMm: { w: 2000, h: 2000 }, gridMm: 100 };

const SHAPE_OPTIONS = MAP_SHAPES.map((s) => ({ value: s, label: SHAPE_LABEL[s] }));

const CONTENT_OPTIONS = [
  ["none", "ריק"],
  ["icon", "אייקון"],
  ["name", "שם"],
] as const;

const mmToCm = (mm: number) => Math.round(mm / 10);

// What the plan draws for a draft right now — the value a control shows as chosen, and the one any
// appearance patch has to preserve. A product from before `appearance` existed has no row to read
// and the resolvers answer for it: a diameter makes it a circle, and it draws its name.
const shapeOf = (p: Product): MapShape => p.appearance?.shape ?? resolveFootprint(p).kind;
const contentOf = (p: Product): MapAppearance["content"] => p.appearance?.content ?? resolveContent(p).mode;

// ── Starting from a shape the app already knows ────────────────────────────────────────────────
//
// Drawing a ח or a serpentine point by point is work the catalog has already done: every derived
// shape IS an outline (buildShapeOutline, lib/studio/footprint.ts), so dropping one in and then
// dragging a vertex is the same editor with a head start. The three primitives are spelled out
// here because they render as SVG rect/circle/ellipse everywhere else and own no outline —
// K is the same quarter-arc constant, and the four points sit at the extremes so the bounds the
// width/depth fields read stay honest (rule 2 in footprint.ts).
const K = 0.5523;
const PRESET_SHAPES = MAP_SHAPES.filter((s) => s !== "custom");
const DEFAULT_PRESET_MM = { w: 1600, h: 900 };

function presetOutline(shape: MapShape, w: number, d: number): BuiltOutline {
  const built = buildShapeOutline(shape, w, d);
  if (built) return built;
  const hw = w / 2;
  const hh = d / 2;
  if (shape === "rect") {
    return { outline: [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }] };
  }
  // circle / ellipse — four quarter arcs, apex of each at a vertex
  const r = shape === "circle" ? Math.min(hw, hh) : 0;
  const rx = shape === "circle" ? r : hw;
  const ry = shape === "circle" ? r : hh;
  return {
    outline: [{ x: -rx, y: 0 }, { x: 0, y: ry }, { x: rx, y: 0 }, { x: 0, y: -ry }],
    edgeCurves: [
      { c1: { x: 0, y: K * ry }, c2: { x: -K * rx, y: 0 } },
      { c1: { x: K * rx, y: 0 }, c2: { x: 0, y: K * ry } },
      { c1: { x: 0, y: -K * ry }, c2: { x: K * rx, y: 0 } },
      { c1: { x: -K * rx, y: 0 }, c2: { x: 0, y: -K * ry } },
    ],
  };
}

/** Everything about how a product is DRAWN, in one place.
 *
 *  It used to be three places: a shape picker and a row of measurements in the drawer's "צורה
 *  ומידות" section, a content/style block further down under "מראה על התוכנית", and this modal —
 *  which only ever opened for `custom`. Three surfaces for one question, and the two in the drawer
 *  could disagree with each other (a diameter typed under a מלבן changed nothing on the plan).
 *
 *  The rule is now short enough to state in a sentence: IF IT CHANGES WHAT THE PLAN DRAWS, IT IS IN
 *  HERE. Shape, measurements, outline, content, style. The drawer keeps what the plan never sees —
 *  the name, the price, the supplier, the height (that is 3D and stock, not the footprint).
 *
 *  The payoff is not tidiness. A catalog row that is never placed — a flower bought by the stem —
 *  has no footprint to answer for, and the drawer can simply not offer this modal, instead of
 *  asking it for a width it does not have.
 *
 *  The canvas half is the full hall shape editor (pan/zoom, guides, measure, curves, edge
 *  length/angle inspector) minus everything hall-specific, and it appears only for `custom`; every
 *  derived shape is drawn from its own measurements, so what it shows instead is the result. */
export function AppearanceModal({
  product,
  onSave,
  onClose,
}: {
  /** The drawer's draft, read once — this component is mounted by the act of opening it. */
  product: Product;
  onSave: (patch: { dimensions: Product["dimensions"]; appearance: MapAppearance }) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Product>(product);
  const [pickingIcon, setPickingIcon] = useState(false);
  // Mounted by the act of opening and unmounted on close (the drawer renders it conditionally), so
  // every piece of state here — the draft, the outline, the undo history, the hook's global Ctrl+Z
  // listener — is born and dies with one editing session. Nothing to seed in an effect, and no way
  // for an undo to walk back into a shape that belongs to a product the designer has moved on from.
  const ed = useOutlineEditor({ outline: product.appearance?.outline ?? [], edgeCurves: product.appearance?.edgeCurves });
  const { mode, outline, edgeCurves: curves, lockedEdges, selected, setSelected } = ed;

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const shape = shapeOf(draft);
  const content = contentOf(draft);
  const custom = shape === "custom";
  const category = CATEGORY_BY_ID[draft.category];
  // A stretch category (a drape, a rug) is cut or laid to whatever it has to cover, so it has no
  // width or depth here — those are drawn per placement in the studio.
  const stretch = category?.sizing === "stretch";

  const bounds = outline.length >= 3 ? customShapeBounds(outline) : null;

  // Patch appearance, always keeping the required fields present — and seeding them from what the
  // plan already draws, so changing only the style of a product that never had an appearance row
  // cannot quietly change its shape or blank its name.
  const setAppearance = (p: Partial<MapAppearance>) =>
    setDraft((d) => ({ ...d, appearance: { shape: shapeOf(d), content: contentOf(d), ...d.appearance, ...p } }));

  const setDim = (key: keyof Product["dimensions"], cm: number) =>
    setDraft((d) => ({ ...d, dimensions: { ...d.dimensions, [key]: Math.round(cm * 10) } }));

  // Drop a known shape in as the starting outline — at whatever the current shape measures, so
  // picking a different preset keeps the size the designer already typed. One whole-state step,
  // so it is one Ctrl+Z away if it was the wrong shape.
  const insertPreset = (preset: MapShape) => {
    const w = bounds?.w || draft.dimensions.widthMm || draft.dimensions.diameterMm || DEFAULT_PRESET_MM.w;
    const h = bounds?.h || draft.dimensions.depthMm || draft.dimensions.diameterMm || DEFAULT_PRESET_MM.h;
    const built = presetOutline(preset, w, h);
    ed.setAll({
      mode: "edit",
      outline: built.outline,
      edgeCurves: padCurves(built.edgeCurves, built.outline.length),
      lockedEdges: built.outline.map(() => false),
    });
  };

  // Changing the shape carries the size across instead of dropping it: a 180cm round table that
  // becomes a rectangle is still 180cm wide, and the field says so rather than sitting empty while
  // the footprint quietly falls back to 60cm. It only ever FILLS a blank — a measurement the
  // designer typed is never overwritten by one derived from another shape.
  const changeShape = (next: MapShape) => {
    if (next === "custom") {
      // A hand-drawn shape starts from whatever the item is already drawn as rather than from a
      // blank canvas — the derived shapes ARE outlines, so there is no reason to redraw one.
      if (outline.length < 3) insertPreset(custom ? "rect" : shape);
      setAppearance({ shape: "custom" });
      return;
    }
    // Leaving a custom outline: its bounding box is the size it was, so the number fields it is
    // about to hand over to are filled from it rather than left empty.
    const fromOutline = custom && bounds ? bounds : null;
    setDraft((d) => {
      const dim = d.dimensions;
      return {
        ...d,
        dimensions:
          next === "circle"
            ? { ...dim, diameterMm: dim.diameterMm || fromOutline?.w || dim.widthMm || dim.depthMm || undefined }
            : {
                ...dim,
                widthMm: dim.widthMm || fromOutline?.w || dim.diameterMm || undefined,
                depthMm: dim.depthMm || fromOutline?.h || dim.diameterMm || undefined,
              },
        // The outline is kept, not dropped — resolveFootprint reads it only for `custom`, so a
        // designer who switches away and back finds the drawing where they left it.
        appearance: { content: contentOf(d), ...d.appearance, shape: next },
      };
    });
  };

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

  const stopThenClose = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onClose();
  };

  // What the canvas draws: the local draft, with the outline the editor is holding right now, so a
  // vertex dragged on the canvas is a fill and a stroke in the same breath.
  const preview: Product = custom
    ? { ...draft, appearance: { shape: "custom", content, ...draft.appearance, outline, edgeCurves: curves } }
    : draft;

  // Which measurements this shape is made of — see the drawer's note: the shape is asked first and
  // the fields follow from it, so a diameter can never sit unread under a מלבן.
  const asksDiameter = !stretch && shape === "circle";
  const asksBox = !stretch && !custom && shape !== "circle";
  const missing =
    (custom && outline.length < 3) ||
    (asksDiameter && !draft.dimensions.diameterMm) ||
    (asksBox && (!draft.dimensions.widthMm || !draft.dimensions.depthMm));

  const hint =
    outline.length === 0 ? "לחצו על הקנבס כדי לצייר את הצורה"
    : outline.length < 3 ? "הקלידו מספר לאורך מדויק · Alt לשחרור נעילת הזווית"
    : "Enter או לחיצה על הנקודה הראשונה לסגירת הצורה · הקלידו מספר לאורך מדויק · Esc לניקוי";

  return (
    // `close`/`cancel` don't bubble in the DOM, but React dispatches them up the FIBER tree anyway —
    // and this modal is rendered INSIDE the product drawer's <dialog>. Without stopPropagation,
    // saving or cancelling ran the drawer's onClose too: the drawer shut and the item being added
    // was thrown away, shape and all.
    <dialog
      ref={ref}
      onClose={stopThenClose}
      onCancel={stopThenClose}
      className="modal m-auto max-h-none rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog"
    >
      <div className="flex h-[80vh] w-[88vw] max-w-5xl flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <span className="text-sm font-semibold text-ink">מראה על התוכנית</span>
          {custom && (
            <>
              {mode === "draw" ? (
                <span className="text-xs text-muted">{hint}</span>
              ) : (
                <span className="hidden text-xs text-muted lg:inline">
                  גררו נקודה להזזה · ידית האמצע מעקמת קצה · בחרו קצה לעריכת אורך/זווית/עיקום · רווח לגרירת התצוגה
                </span>
              )}
              {mode === "draw" && outline.length >= 3 && (
                <Button type="button" variant="ghost" onClick={ed.closeOutline}>
                  סגירת הצורה
                </Button>
              )}
              <Button type="button" variant="ghost" className="ms-auto" disabled={outline.length === 0} onClick={clearShape}>
                <Trash2 className="h-4 w-4" strokeWidth={2} />
                ניקוי
              </Button>
            </>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          {/* The canvas, for the one shape that owns an outline — and for every other shape, what
              the canvas would be showing anyway: the thing that will actually be drawn. */}
          <div className="relative min-h-0 flex-1 bg-canvas">
            {custom ? (
              <>
                <PlanCanvas
                  mode={mode}
                  outline={outline}
                  edgeCurves={curves}
                  lockedEdges={lockedEdges}
                  selected={selected}
                  onSelect={(r) => setSelected(r ? [r] : [])}
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
                  // What the plan writes inside the outline, drawn on the outline itself. Without
                  // it, picking an icon changed nothing on the surface the designer is looking at.
                  overlay={
                    bounds && (
                      <g transform={`translate(${bounds.cx} ${bounds.cy})`} className="pointer-events-none text-ink-soft">
                        <PlanContent content={resolveContent(preview)} w={bounds.w} h={bounds.h} />
                      </g>
                    )
                  }
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
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
                <AppearancePreview product={preview} className="max-h-[70%] w-full max-w-md" />
                <p className="text-center text-xs text-muted">
                  {stretch
                    ? `${category?.label ?? "פריטים אלה"} נמדדים על התוכנית — הגודל נקבע כשמותחים אותם באירוע.`
                    : "כך יצויר הפריט על התוכנית, בקנה מידה אמיתי."}
                </p>
              </div>
            )}
          </div>

          {/* The inspector: everything that changes what the plan draws, top to bottom in the order
              the questions depend on each other — the shape, then the measurements it is made of,
              then what sits inside it, then how it is painted. */}
          {/* No thumbnail at the top of this panel: the canvas beside it is already showing the
              same drawing, larger. Two previews of one shape, one of them 96px tall, is the kind
              of pair a designer checks twice to see whether they disagree. */}
          <aside className="w-[288px] shrink-0 space-y-4 overflow-y-auto border-s border-border bg-surface p-4">
            <div>
              <label htmlFor="a-shape" className={fieldLabelClassName}>
                צורה
              </label>
              {/* A Select and not a row of buttons: the vocabulary is a dozen shapes now
                  (MAP_SHAPES), and twelve segments in a column this wide is a row of slivers. */}
              <Select
                id="a-shape"
                value={shape}
                onChange={(v) => changeShape(v as MapShape)}
                options={SHAPE_OPTIONS}
                className="w-full"
              />
            </div>

            {custom && (
              <div>
                <label htmlFor="a-preset" className={fieldLabelClassName}>
                  התחלה מצורה מוכנה
                </label>
                <Select
                  id="a-preset"
                  value=""
                  onChange={(v) => insertPreset(v as MapShape)}
                  options={[
                    { value: "", label: "בחרו צורה…" },
                    ...PRESET_SHAPES.map((s) => ({ value: s, label: SHAPE_LABEL[s] })),
                  ]}
                  className="w-full"
                />
              </div>
            )}

            {/* A hand-drawn outline keeps its two fields even for a stretch category: they
                rescale the DRAWING, which is not the same question as "how much of this do we lay
                at the event" — that one is still answered per placement, in the studio. */}
            {custom ? (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="רוחב (ס״מ)"
                  decimals={0}
                  min={0}
                  commitOnBlur
                  disabled={!bounds}
                  value={bounds ? mmToCm(bounds.w) : 0}
                  onChange={(cm) => resize("w", cm)}
                />
                <NumberField
                  label="עומק (ס״מ)"
                  decimals={0}
                  min={0}
                  commitOnBlur
                  disabled={!bounds}
                  value={bounds ? mmToCm(bounds.h) : 0}
                  onChange={(cm) => resize("h", cm)}
                />
              </div>
            ) : (
              !stretch && (
                <div className="grid grid-cols-2 gap-2">
                  {asksDiameter ? (
                    <NumberField
                      label="קוטר (ס״מ)"
                      hideZero
                      min={0}
                      placeholder="0"
                      value={(draft.dimensions.diameterMm ?? 0) / 10}
                      onChange={(v) => setDim("diameterMm", v)}
                    />
                  ) : (
                    <>
                      <NumberField
                        label="רוחב (ס״מ)"
                        hideZero
                        min={0}
                        placeholder="0"
                        value={(draft.dimensions.widthMm ?? 0) / 10}
                        onChange={(v) => setDim("widthMm", v)}
                      />
                      <NumberField
                        label="עומק (ס״מ)"
                        hideZero
                        min={0}
                        placeholder="0"
                        value={(draft.dimensions.depthMm ?? 0) / 10}
                        onChange={(v) => setDim("depthMm", v)}
                      />
                    </>
                  )}
                </div>
              )
            )}

            <div className="h-px bg-border-soft" />

            <Segmented
              label="תוכן"
              value={content}
              options={CONTENT_OPTIONS}
              onChange={(c) => {
                setAppearance({ content: c });
                setPickingIcon(c === "icon");
              }}
            />

            {content === "icon" &&
              (pickingIcon || !draft.appearance?.icon ? (
                <IconPicker
                  value={draft.appearance?.icon}
                  onPick={(icon) => {
                    setAppearance({ content: "icon", icon });
                    setPickingIcon(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setPickingIcon(true)}
                  className="text-xs font-medium text-accent transition-colors hover:text-accent-hover"
                >
                  החלפת אייקון
                </button>
              ))}

            <div className="h-px bg-border-soft" />

            <div>
              <span className={fieldLabelClassName}>עיצוב</span>
              <StyleFields
                style={draft.appearance?.style}
                onChange={(style) => setAppearance({ style })}
                strokeWidthDefault={2}
              />
            </div>
          </aside>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-border px-5 py-3">
          {missing && (
            <span className="text-xs text-alert">
              {custom ? "יש לסמן צורה סגורה (לפחות 3 נקודות)." : "יש להשלים את המידות — לפיהן מצויר הפריט."}
            </span>
          )}
          <div className="flex-1" />
          <Button type="button" variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button
            type="button"
            disabled={missing}
            onClick={() => {
              onSave({
                dimensions: draft.dimensions,
                appearance: custom
                  ? { shape: "custom", content, ...draft.appearance, outline, edgeCurves: padCurves(curves, outline.length) }
                  : { content, ...draft.appearance, shape },
              });
              onClose();
            }}
          >
            שמירת המראה
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
