"use client";

import { useEffect, useRef, useState } from "react";
import { BringToFront, Donut, Move, PenLine, Rainbow, Ruler, SendToBack, Shapes, Trash2 } from "lucide-react";
import type { ArcSpec, MapAppearance, MapShape, Product, RingSpec, ShapePart } from "@/lib/catalog/types";
import { ARC_SWEEP, MAP_SHAPES, RING_GAP, ROUND_FIELD, SHAPE_LABEL, usesDiameter } from "@/lib/catalog/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import type { EdgeCurve } from "@/lib/studio/hall";
import {
  arcSpecOf,
  customShapeBounds,
  footprintBounds,
  footprintOutlines,
  resolveContent,
  resolveFootprint,
  ringSpecOf,
  roundSizeMm,
  shapeFootprint,
  type BuiltOutline,
  type RingShape,
} from "@/lib/studio/footprint";
import { seatSides } from "@/lib/studio/seating";
import { FootprintShape } from "@/components/footprint-shape";
import { SeatChairs, SeatSidesPicker } from "@/components/seat-sides-picker";
import { seatsAround } from "@/lib/studio/seating";
import { AddElementFlyout, type FlyoutItem } from "@/components/add-element-flyout";
import { Actions, Bar, BarButton, Note, PanelRow, Rotation, ltr } from "@/components/inspector-bar";
import { InspectorDivider } from "@/components/plan-canvas";
import { Popover } from "@/components/popover";
import { StructureFeatures } from "@/components/venue-plan";
import { emptyStructure, type StructureFeature } from "@/lib/venues/structure";
import type { HostSnapOptions } from "@/components/plan-canvas";
import { useOutlineEditor } from "@/lib/studio/use-outline-editor";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { Segmented } from "@/components/segmented";
import { StyleFields } from "@/components/style-fields";
import { PlanCanvas, SelectionInspector } from "@/components/plan-canvas";
import { fieldLabelClassName } from "@/components/control";
import { AppearancePreview, PlanContent } from "./appearance-preview";
import { labelAnchor } from "@/lib/studio/label-anchor";
import { IconPicker } from "./icon-picker";

type Curves = (EdgeCurve | null)[];
const padCurves = (c: Curves | undefined, len: number): Curves => Array.from({ length: len }, (_, i) => c?.[i] ?? null);

// Product footprints are cm-scale — feed the shared canvas a small frame + fine grid so a ~1.6m
// table doesn't render as a speck inside the hall-scale (22m) default.
const PRODUCT_FRAME = { padMm: 200, minExtentMm: { w: 2000, h: 2000 }, gridMm: 100 };

const CONTENT_OPTIONS = [
  ["none", "ריק"],
  ["icon", "אייקון"],
  ["name", "שם"],
] as const;

const mmToCm = (mm: number) => Math.round(mm / 10);

// What the plan draws for a draft right now — the value a control shows as chosen, and the one any
// appearance patch has to preserve. A product from before `appearance` existed has no row to read
// and the resolvers answer for it: a diameter makes it a circle, and it draws its name.
const shapeOf = (p: Product): MapShape => p.appearance?.shape ?? (p.dimensions.diameterMm ? "circle" : "rect");
const contentOf = (p: Product): MapAppearance["content"] => p.appearance?.content ?? resolveContent(p).mode;

// ── Starting from a shape the app already knows ────────────────────────────────────────────────
//
// Drawing a ח or a serpentine point by point is work the catalog has already done: every shape IS
// an outline (footprintOutlines, lib/studio/footprint.ts — the primitives included, as four quarter
// arcs or four corners), so dropping one in and then dragging a vertex is the same editor with a
// head start.
const DEFAULT_PRESET_MM = { w: 1600, h: 900 };

function presetOutline(shape: MapShape, w: number, d: number, arc?: ArcSpec, ring?: RingSpec): BuiltOutline {
  const f = shapeFootprint(shape, { widthMm: w, depthMm: d, diameterMm: shape === "circle" ? Math.min(w, d) : undefined, arc, ring });
  return footprintOutlines(f)[0];
}

/** The sides of an arc nobody sits at by default: its caps, the short straight runs across the band.
 *  The reference is a serpentine laid out for a ceremony — chairs along both curves and none at the
 *  two ends — and a designer who wants the ends seated clicks them back open. */
function arcCaps(product: Product): number[] {
  return seatSides(resolveFootprint(product))
    .map((side, i) => ({ i, straight: side.pts.length === 2 }))
    .filter((x) => x.straight)
    .map((x) => x.i);
}

const SWEEP_PRESETS = [
  ["180", "חצי"],
  ["120", "שליש"],
  ["90", "רבע"],
  ["270", "¾"],
] as const;

/** The two numbers an arc has beyond its diameter — how much of the circle, and how wide the band.
 *  Shared by the base shape and by a part, which is an arc by exactly the same rule. */
function ArcFields({
  idPrefix,
  diameterMm,
  arc,
  onChange,
}: {
  idPrefix: string;
  diameterMm: number;
  arc?: ArcSpec;
  onChange: (arc: ArcSpec) => void;
}) {
  const spec = arcSpecOf(diameterMm || DEFAULT_PRESET_MM.w, arc);
  return (
    <div className="space-y-2">
      <Segmented
        label="כמה מהעיגול"
        value={String(spec.sweepDeg)}
        options={SWEEP_PRESETS}
        onChange={(v) => onChange({ ...spec, sweepDeg: Number(v) })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          id={`${idPrefix}-sweep`}
          label="זווית (°)"
          decimals={0}
          min={ARC_SWEEP.min}
          max={ARC_SWEEP.max}
          commitOnBlur
          value={spec.sweepDeg}
          onChange={(v) => onChange({ ...spec, sweepDeg: v })}
        />
        <NumberField
          id={`${idPrefix}-band`}
          label="רוחב הרצועה (ס״מ)"
          decimals={0}
          min={5}
          commitOnBlur
          value={mmToCm(spec.bandMm)}
          onChange={(v) => onChange({ ...spec, bandMm: Math.round(v * 10) })}
        />
      </div>
    </div>
  );
}

const GAP_AT = [
  ["left", "שמאל"],
  ["center", "מרכז"],
  ["right", "ימין"],
] as const;

/** The hollow curved shapes, which share a spec (RingSpec) and these fields; null for any other. */
const ringShapeOf = (s: MapShape): RingShape | null => (s === "oval-ring" || s === "horseshoe" || s === "rounded-u" ? s : null);

/** The chip on the bar that opens the ring fields, named for the thing being set. */
const RING_LABEL: Record<RingShape, string> = { "oval-ring": "טבעת", horseshoe: "פרסה", "rounded-u": "ח מעוגלת" };

/** What a hollow curved shape has beyond its two measurements: how wide the band is, and the opening
 *  the staff get in by — how wide, and (on the oval) where along the bottom run. Shared by the base
 *  shape and by a part, which is a ring by exactly the same rule. */
function RingFields({
  idPrefix,
  shape,
  widthMm,
  depthMm,
  ring,
  onChange,
}: {
  idPrefix: string;
  shape: RingShape;
  widthMm: number;
  depthMm: number;
  ring?: RingSpec;
  onChange: (ring: RingSpec) => void;
}) {
  const spec = ringSpecOf(widthMm || DEFAULT_PRESET_MM.w, depthMm || DEFAULT_PRESET_MM.h, ring, shape);
  const oval = shape === "oval-ring";
  // A rounded ח has no opening to set: its sides are the arcs, and its modules cannot be shortened.
  const opens = shape !== "rounded-u";
  return (
    <div className="space-y-2">
      <div className={opens ? "grid grid-cols-2 gap-2" : undefined}>
        <NumberField
          id={`${idPrefix}-band`}
          label="רוחב הרצועה (ס״מ)"
          decimals={0}
          min={5}
          commitOnBlur
          value={mmToCm(spec.bandMm)}
          onChange={(v) => onChange({ ...spec, bandMm: Math.round(v * 10) })}
        />
        {opens && (
          <NumberField
            id={`${idPrefix}-gap`}
            label={oval ? "פתח (ס״מ)" : "פתח ליד הקיר (ס״מ)"}
            decimals={0}
            min={0}
            commitOnBlur
            value={mmToCm(spec.gapMm)}
            onChange={(v) => onChange({ ...spec, gapMm: Math.round(v * 10) })}
          />
        )}
      </div>
      {oval && <Segmented label="מיקום הפתח" value={spec.gapAt} options={GAP_AT} onChange={(gapAt) => onChange({ ...spec, gapAt })} />}
      <Note>
        {oval
          ? `הפתח ברצועה הישרה התחתונה — לפחות ${mmToCm(RING_GAP.min)} ס״מ, או 0 לטבעת סגורה (כניסה דרך דלפק מתרומם; קו דק מסמן אותו). סובבו את הפריט על התוכנית כדי להפנות אותו.`
          : shape === "horseshoe"
            ? "הצד הפתוח הוא צד הקיר. הפתח הוא כמה הרגל התחתונה נעצרת לפני הקיר — 0 כשהיא מגיעה עד אליו. סובבו או שקפו את הפריט על התוכנית כדי להפנות אותו."
            : "החצי העליון של אליפסה חלולה: הצלע הישרה למעלה ורבע קשת יורד מכל צד עד הקיר, שהוא הצד הפתוח למטה. סובבו את הפריט על התוכנית כדי להפנות אותו."}
      </Note>
    </div>
  );
}

// ── Added shapes, placed like the hall plan's elements ─────────────────────────────────────────
//
// A shape beside the base one is added exactly the way /halls adds a bar or a pool: pick a card in
// the element flyout, then click a spot on the canvas (or drag the card there), and from then on it
// is a thing ON the canvas — dragged to move, its square handles to resize, its knob to turn. The
// hall plan's own feature layer (StructureFeatures) draws and drives it, so the handles are the
// same handles, not a look-alike.

/** A card's picture: the shape itself, at a neutral proportion. */
function ShapeCard({ shape }: { shape: Exclude<MapShape, "custom"> }) {
  const f = shapeFootprint(shape, { widthMm: 1600, depthMm: 1000, diameterMm: 1600 });
  const b = footprintBounds(f);
  const pad = Math.max(b.w, b.h) * 0.08;
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-md bg-inset">
      <svg viewBox={`${-b.w / 2 - pad} ${-b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className="h-9 w-9" aria-hidden>
        <FootprintShape footprint={f} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

const SHAPE_ITEMS: FlyoutItem[] = MAP_SHAPES.filter((s): s is Exclude<MapShape, "custom"> => s !== "custom").map((s) => ({
  id: s,
  label: SHAPE_LABEL[s],
  section: "shapes",
  preview: <ShapeCard shape={s} />,
}));
const SHAPE_SECTIONS = [{ id: "shapes", label: "צורות" }];
const isPartShape = (id: string): id is ShapePart["shape"] => SHAPE_ITEMS.some((i) => i.id === id);

/** A new part's starting size — something a designer can see at the size a catalog item is, and
 *  then drag to what it really is. */
function newPart(shape: ShapePart["shape"], at: { x: number; y: number }): ShapePart {
  return {
    id: crypto.randomUUID(),
    shape,
    ...(usesDiameter(shape)
      ? { diameterMm: shape === "arc" ? 2000 : shape === "quarter-circle" ? 1600 : 1200 }
      : shape === "oval-ring"
        ? { widthMm: 2400, depthMm: 1200 }
        : shape === "horseshoe"
          ? { widthMm: 1800, depthMm: 1200 }
          : shape === "rounded-u"
            ? { widthMm: 2400, depthMm: 1200 }
            : { widthMm: 1200, depthMm: 600 }),
    x: Math.round(at.x),
    y: Math.round(at.y),
    rotation: 0,
  };
}

/** The copied shape. Module scope on purpose: it outlives the modal, so a round end copied off one
 *  bar pastes onto the next bar's appearance too. */
let copiedPart: ShapePart | null = null;
const PASTE_STEP_MM = 300;

/** A part's box on the canvas, turned — what the snap aligns and measures gaps against. */
function turnedBox(w: number, h: number, deg: number) {
  const t = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  return { widthMm: w * c + h * s, depthMm: w * s + h * c };
}

/** The base shape's picker: every shape as its own picture, plus "draw it yourself". A grid of cards
 *  rather than a Select — the bar sits on the bottom edge of the canvas, and a list that opens
 *  downward from there opens off it. */
function ShapeGrid({ value, onPick }: { value: MapShape; onPick: (shape: MapShape) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="צורה">
      {MAP_SHAPES.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={value === s}
          onClick={() => onPick(s)}
          className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-center text-[10px] font-semibold leading-tight transition-colors ${
            value === s ? "border-accent bg-accent-tint text-accent" : "border-border text-ink hover:border-accent-line hover:bg-inset"
          }`}
        >
          {s === "custom" ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-inset">
              <PenLine className="h-4 w-4 text-accent" strokeWidth={1.75} />
            </span>
          ) : (
            <ShapeCard shape={s} />
          )}
          <span className="line-clamp-2 w-full">{SHAPE_LABEL[s]}</span>
        </button>
      ))}
    </div>
  );
}

/** The selected shape's bar — the studio sketch's own selection bar (components/inspector-bar.tsx):
 *  a title row, then one chip per subject, each opening its fields in a small panel. */
function PartBar({
  part,
  onChange,
  onDuplicate,
  onRemove,
  onToFront,
  onToBack,
  onClose,
}: {
  part: ShapePart;
  onChange: (p: Partial<ShapePart>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Where this shape sits among the others: the parts are drawn in order, so the last one is on
   *  top. The base shape is always underneath them all. */
  onToFront: () => void;
  onToBack: () => void;
  onClose: () => void;
}) {
  const id = `part-${part.id}`;
  const cm = (mm?: number) => Math.round((mm ?? 0) / 10);
  const round = usesDiameter(part.shape);
  const field = ROUND_FIELD[part.shape] ?? { label: "קוטר", factor: 1 };
  const D = roundSizeMm(part.shape, part);
  const size = round ? `${field.label === "רדיוס" ? "R" : "⌀"}${cm((D ?? 0) / field.factor)}` : `${cm(part.widthMm)}×${cm(part.depthMm)}`;
  const spec = part.shape === "arc" ? arcSpecOf(D || DEFAULT_PRESET_MM.w, part.arc) : null;
  const ringShape = ringShapeOf(part.shape);
  const ringSpec = ringShape ? ringSpecOf(part.widthMm || DEFAULT_PRESET_MM.w, part.depthMm || DEFAULT_PRESET_MM.h, part.ring, ringShape) : null;
  return (
    <Bar icon={Shapes} title={SHAPE_LABEL[part.shape]} facts="צורה נוספת" onClose={onClose}>
      <Popover label="מידות" icon={Ruler} value={ltr(size)}>
        {round ? (
          <PanelRow label={`${field.label} (ס״מ)`} htmlFor={`${id}-d`}>
            <NumberField
              id={`${id}-d`}
              decimals={0}
              min={0}
              value={(D ?? 0) / field.factor / 10}
              onChange={(v) => onChange({ diameterMm: Math.round(v * 10 * field.factor) })}
              className="w-20"
            />
          </PanelRow>
        ) : (
          <>
            <PanelRow label="רוחב (ס״מ)" htmlFor={`${id}-w`}>
              <NumberField id={`${id}-w`} decimals={0} min={0} value={cm(part.widthMm)} onChange={(v) => onChange({ widthMm: Math.round(v * 10) })} className="w-20" />
            </PanelRow>
            <PanelRow label="עומק (ס״מ)" htmlFor={`${id}-h`}>
              <NumberField id={`${id}-h`} decimals={0} min={0} value={cm(part.depthMm)} onChange={(v) => onChange({ depthMm: Math.round(v * 10) })} className="w-20" />
            </PanelRow>
          </>
        )}
      </Popover>
      <Popover label="מיקום" icon={Move} value={ltr(`${cm(part.x)}, ${cm(part.y)}`)}>
        <PanelRow label="אופקי (ס״מ)" htmlFor={`${id}-x`}>
          <NumberField id={`${id}-x`} decimals={0} value={cm(part.x)} onChange={(v) => onChange({ x: Math.round(v * 10) })} className="w-20" />
        </PanelRow>
        <PanelRow label="אנכי (ס״מ)" htmlFor={`${id}-y`}>
          <NumberField id={`${id}-y`} decimals={0} value={cm(part.y)} onChange={(v) => onChange({ y: Math.round(v * 10) })} className="w-20" />
        </PanelRow>
        <Note>מרכז הצורה, ביחס למרכז הצורה הראשית.</Note>
      </Popover>
      <Rotation value={part.rotation || 0} onChange={(deg) => onChange({ rotation: deg })} />
      {spec && (
        <Popover label="קשת" icon={Rainbow} value={ltr(`${spec.sweepDeg}°`)} panelClassName="w-72">
          <ArcFields idPrefix={id} diameterMm={D ?? 0} arc={part.arc} onChange={(arc) => onChange({ arc })} />
        </Popover>
      )}
      {ringShape && ringSpec && (
        <Popover label={RING_LABEL[ringShape]} icon={Donut} value={`רצועה ${cm(ringSpec.bandMm)}`} panelClassName="w-72">
          <RingFields idPrefix={id} shape={ringShape} widthMm={part.widthMm ?? 0} depthMm={part.depthMm ?? 0} ring={part.ring} onChange={(ring) => onChange({ ring })} />
        </Popover>
      )}
      <BarButton icon={BringToFront} label="לחזית — מעל שאר הצורות" onClick={onToFront} />
      <BarButton icon={SendToBack} label="לאחור — מתחת לשאר הצורות" onClick={onToBack} />
      <Actions onDuplicate={onDuplicate} duplicateLabel="שכפול הצורה" onDelete={onRemove} deleteLabel="הסרת הצורה" />
    </Bar>
  );
}

/** The size a shape starts at when nothing has been typed for it yet — so picking a shape draws it
 *  at once, at a plausible size, rather than leaving the canvas empty and the size fields blank
 *  until someone fills them in. Every number is the designer's to change. */
function defaultDims(shape: MapShape): Partial<Product["dimensions"]> {
  switch (shape) {
    case "circle":
    case "half-circle":
    case "quarter-circle":
      return { diameterMm: 1600 };
    case "arc":
      return { diameterMm: 3000 };
    case "u-shape":
      return { widthMm: 2400, depthMm: 1200 };
    case "oval-ring":
      return { widthMm: 4800, depthMm: 2400 };
    case "horseshoe":
      return { widthMm: 3000, depthMm: 2400 };
    case "rounded-u":
      return { widthMm: 3600, depthMm: 1800 };
    default:
      return { widthMm: 1600, depthMm: 900 };
  }
}

/** Fill whatever the shape needs and the row does not have yet. Never overwrites a typed number. */
function withSizeFor(p: Product): Product {
  const shape = shapeOf(p);
  if (shape === "custom" || CATEGORY_BY_ID[p.category]?.sizing === "stretch") return p;
  const d = p.dimensions;
  const def = defaultDims(shape);
  if (usesDiameter(shape)) return roundSizeMm(shape, d) ? p : { ...p, dimensions: { ...d, diameterMm: def.diameterMm } };
  if (d.widthMm && d.depthMm) return p;
  return { ...p, dimensions: { ...d, widthMm: d.widthMm || def.widthMm, depthMm: d.depthMm || def.depthMm } };
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
 *  length/angle inspector) minus everything hall-specific, and it shows EVERY shape, not only
 *  `custom`: a derived shape is drawn from its measurements until the designer grabs a point or an
 *  edge of it, and at that moment it becomes a hand-drawn outline that starts as exactly that shape
 *  (see `free` below). The shape's numbers stop driving it from then on, which is what "custom"
 *  means. */
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
  const [draft, setDraft] = useState<Product>(() => withSizeFor(product));
  const [pickingIcon, setPickingIcon] = useState(false);
  const [elementsOpen, setElementsOpen] = useState(false);
  const [armedShape, setArmedShape] = useState<ShapePart["shape"] | null>(null);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
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
  const ringShape = ringShapeOf(shape);
  const category = CATEGORY_BY_ID[draft.category];
  // A stretch category (a drape, a rug) is cut or laid to whatever it has to cover, so it has no
  // width or depth here — those are drawn per placement in the studio.
  const stretch = category?.sizing === "stretch";
  // Only tables carry chairs on the plan (the seat count is their count-multiplier).
  const seated = draft.category === "tables";
  const seatCount = Number(draft.categoryFields?.seats) || 0;

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
    const built = presetOutline(preset, w, h, draft.appearance?.arc, draft.appearance?.ring);
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
      setAppearance({ shape: "custom", blockedSides: undefined });
      return;
    }
    // Leaving a custom outline: its bounding box is the size it was, so the number fields it is
    // about to hand over to are filled from it rather than left empty.
    const fromOutline = custom && bounds ? bounds : null;
    setDraft((d) => {
      const dim = d.dimensions;
      const next_: Product = {
        ...d,
        dimensions:
          usesDiameter(next)
            ? {
                ...dim,
                // Leaving a drawn outline, its size is what the designer just drew — that wins over
                // a number typed before they started drawing.
                diameterMm:
                  (next === "quarter-circle" ? 2 : 1) * (fromOutline?.w || 0) ||
                  dim.diameterMm ||
                  (next === "quarter-circle" ? 2 : 1) * (dim.widthMm || dim.depthMm || 0) ||
                  defaultDims(next).diameterMm,
              }
            : {
                ...dim,
                widthMm: Math.round(fromOutline?.w || 0) || dim.widthMm || dim.diameterMm || defaultDims(next).widthMm,
                depthMm: Math.round(fromOutline?.h || 0) || dim.depthMm || dim.diameterMm || defaultDims(next).depthMm,
              },
        // The outline is kept, not dropped — resolveFootprint reads it only for `custom`, so a
        // designer who switches away and back finds the drawing where they left it. Blocked sides
        // are NOT kept: they are indices into this shape's sides, and a different shape's second
        // side is a different place altogether.
        appearance: { content: contentOf(d), ...d.appearance, shape: next, blockedSides: undefined },
      };
      if (next === "arc" && seated) {
        next_.appearance = { ...next_.appearance!, blockedSides: arcCaps(next_) };
      }
      return next_;
    });
  };

  // ── Parts: the shapes added beside the base one ──────────────────────────────────────────────
  const parts = draft.appearance?.parts ?? [];
  // Side indices run base first, then each part in turn — so a part added or removed can leave a
  // blocked index pointing past the end, or at a different side. Past the end is dropped here;
  // the seating ignores an index it has no side for anyway.
  const setParts = (next: ShapePart[]) =>
    setDraft((d) => {
      const withParts: Product = {
        ...d,
        appearance: { shape: shapeOf(d), content: contentOf(d), ...d.appearance, parts: next.length ? next : undefined },
      };
      const count = seatSides(resolveFootprint(withParts)).length;
      const blocked = withParts.appearance!.blockedSides?.filter((i) => i < count);
      withParts.appearance = { ...withParts.appearance!, blockedSides: blocked?.length ? blocked : undefined };
      return withParts;
    });
  // ── Sides nobody sits at (tables) ───────────────────────────────────────────────────────────
  const blocked = draft.appearance?.blockedSides ?? [];
  const toggleSide = (i: number) =>
    setAppearance({
      blockedSides: blocked.includes(i) ? blocked.filter((x) => x !== i) : [...blocked, i].sort((a, b) => a - b),
    });

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

  // ── Every shape is editable on the canvas ────────────────────────────────────────────────────
  // A derived shape is shown as the outline it resolves to (the base alone — the parts are their own
  // layer). Nothing is stored for it while it stays derived: its numbers still drive it.
  const derived = (() => {
    if (custom || stretch) return null;
    const base = resolveFootprint({ ...draft, appearance: { shape, content, ...draft.appearance, parts: undefined } });
    const o = footprintOutlines(base)[0];
    return o ? { outline: o.outline, edgeCurves: padCurves(o.edgeCurves, o.outline.length) } : null;
  })();
  const canvasOutline = derived?.outline ?? outline;
  const canvasCurves = derived?.edgeCurves ?? curves;
  const canvasLocked = derived ? derived.outline.map(() => false) : lockedEdges;
  const canvasBounds = canvasOutline.length >= 3 ? customShapeBounds(canvasOutline) : null;
  // Where the base shape's centre sits on the canvas — a part's offset is measured from here.
  const anchor = canvasBounds ? { x: canvasBounds.cx, y: canvasBounds.cy } : { x: 0, y: 0 };

  /** Wrap an edit so that grabbing a DERIVED shape first turns it into a hand-drawn one — seeded
   *  with the outline the designer is looking at, then the edit applied to it. The seed replaces the
   *  editor's state outright (no undo back into the numbers: from here the outline IS the shape). */
  const free =
    <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A) => {
      if (derived) {
        ed.reset({ outline: derived.outline, edgeCurves: derived.edgeCurves });
        ed.setSelected(selected);
        setAppearance({ shape: "custom" });
      }
      fn(...a);
    };

  // ── Parts on the canvas ─────────────────────────────────────────────────────────────────────
  const patchPart = (id: string, p: Partial<ShapePart>) => setParts(parts.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const removePart = (id: string) => {
    setParts(parts.filter((x) => x.id !== id));
    setSelectedPart(null);
  };
  const placePart = (shapeId: ShapePart["shape"], at: { x: number; y: number }) => {
    const part = newPart(shapeId, { x: at.x - anchor.x, y: at.y - anchor.y });
    setParts([...parts, part]);
    setSelectedPart(part.id);
    setSelected([]);
    setArmedShape(null);
  };
  // The hall plan's feature layer draws and drives the parts: each one handed over as a feature at
  // its place on the canvas, and every gesture on it mapped back to the part.
  const partFeatures: StructureFeature[] = parts.map((p) => {
    const round = usesDiameter(p.shape);
    const w = (round ? (roundSizeMm(p.shape, p) ?? 0) / (p.shape === "quarter-circle" ? 2 : 1) : p.widthMm) || 600;
    return {
      id: p.id,
      kind: "other",
      label: "",
      x: anchor.x + p.x,
      y: anchor.y + p.y,
      widthMm: w,
      depthMm: round ? w : p.depthMm || 600,
      heightMm: 0,
      shape: p.shape,
      ...(p.arc ? { arc: p.arc } : {}),
      ...(p.ring ? { ring: p.ring } : {}),
      rotationDeg: p.rotation || 0,
      // Solid, like the base shape — the feature layer's default dash says "built into the room".
      style: { ...draft.appearance?.style, dash: draft.appearance?.style?.dash ?? "solid" },
    };
  });
  const selectedPartRow = parts.find((p) => p.id === selectedPart) ?? null;


  // ── Guides while a part is dragged or resized ────────────────────────────────────────────────
  // The canvas's own alignment pull (the same one the studio's sketch uses), fed the base shape's
  // box and every OTHER part's — itself excluded, or it would align to where it already is. The base
  // outline's corners are the canvas's own references already.
  const partBox = (p: ShapePart) => {
    const b = footprintBounds(shapeFootprint(p.shape, p));
    return { x: anchor.x + p.x, y: anchor.y + p.y, ...turnedBox(b.w, b.h, p.rotation || 0) };
  };
  const snapOpts = (id: string, self?: { widthMm: number; depthMm: number }): HostSnapOptions => ({
    boxes: [
      ...(canvasBounds ? [{ x: canvasBounds.cx, y: canvasBounds.cy, widthMm: canvasBounds.w, depthMm: canvasBounds.h }] : []),
      ...parts.filter((x) => x.id !== id).map(partBox),
    ],
    ...(self ? { self } : {}),
  });
  const straight = (deg: number) => Math.abs(((deg % 180) + 180) % 180) < 0.01;

  // ── Keyboard: delete, copy, paste, duplicate ────────────────────────────────────────────────
  const paste = (from: ShapePart) => {
    const part = { ...from, id: crypto.randomUUID(), x: from.x + PASTE_STEP_MM, y: from.y + PASTE_STEP_MM };
    setParts([...parts, part]);
    setSelectedPart(part.id);
    setSelected([]);
    return part;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && (key === "c" || e.code === "KeyC") && selectedPartRow) {
        e.preventDefault();
        copiedPart = selectedPartRow;
      } else if (mod && (key === "v" || e.code === "KeyV") && copiedPart) {
        e.preventDefault();
        // Each paste steps on from the last one, so three pastes are three shapes, not one on top of two.
        copiedPart = paste(copiedPart);
      } else if (mod && (key === "d" || e.code === "KeyD") && selectedPartRow) {
        e.preventDefault();
        paste(selectedPartRow);
      } else if (!mod && selectedPart && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removePart(selectedPart);
      } else if (!mod && selectedPart && e.key === "Escape") {
        e.preventDefault();
        setSelectedPart(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const stopThenClose = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onClose();
  };

  // What the canvas draws: the local draft, with the outline the editor is holding right now, so a
  // vertex dragged on the canvas is a fill and a stroke in the same breath.
  const preview: Product = custom
    ? { ...draft, appearance: { shape: "custom", content, ...draft.appearance, outline, edgeCurves: curves } }
    : draft;

  // The chairs, drawn on the canvas itself (tables only) — the same ring the plan will draw, so a
  // blocked side is seen emptying where the designer is looking, not in a thumbnail off to the side.
  // The item's footprint is centred on the box of ALL its shapes; its base piece tells us where that
  // centre sits on this canvas.
  const itemFootprint = !stretch && canvasBounds ? resolveFootprint(preview) : null;
  const chairs = (() => {
    if (!seated || !itemFootprint || seatCount <= 0) return null;
    const basePiece = footprintOutlines(itemFootprint)[0];
    if (!basePiece) return null;
    const c = customShapeBounds(basePiece.outline);
    return {
      at: { x: anchor.x - c.cx, y: anchor.y - c.cy },
      seats: seatsAround(itemFootprint, seatCount, undefined, blocked),
    };
  })();

  // Which measurements this shape is made of — see the drawer's note: the shape is asked first and
  // the fields follow from it, so a diameter can never sit unread under a מלבן.
  const asksDiameter = !stretch && usesDiameter(shape);
  const asksBox = !stretch && !custom && !usesDiameter(shape);
  const missing =
    (custom && outline.length < 3) ||
    (asksDiameter && !roundSizeMm(shape, draft.dimensions)) ||
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
          {derived && (
            <span className="hidden text-xs text-muted lg:inline">
              גררו נקודה או קצה כדי לעצב את הצורה בחופשיות · הוסיפו צורות מ״אלמנט״ · Ctrl+C / Ctrl+V להעתקת צורה
            </span>
          )}
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
            {custom || derived ? (
              <>
                <PlanCanvas
                  mode={derived ? "edit" : mode}
                  outline={canvasOutline}
                  edgeCurves={canvasCurves}
                  lockedEdges={canvasLocked}
                  selected={selected}
                  onSelect={(r) => {
                    setSelected(r ? [r] : []);
                    if (r) setSelectedPart(null);
                  }}
                  onToggleSelect={ed.toggleSelected}
                  onSelectMany={ed.selectMany}
                  onAddVertex={ed.addVertex}
                  onCloseOutline={ed.closeOutline}
                  onCancelDraw={clearShape}
                  onMoveVertex={free(ed.moveVertex)}
                  onMoveWallHandle={free(ed.moveWallHandle)}
                  onMoveSelection={free(ed.moveSelection)}
                  onToggleWallLock={free(ed.toggleWallLock)}
                  cursor={armedShape ? "crosshair" : "default"}
                  onCanvasClick={(p) => {
                    if (armedShape) placePart(armedShape, p);
                    else setSelectedPart(null);
                  }}
                  onDropAt={(e, p) => {
                    const id = e.dataTransfer.getData("text/plain");
                    if (isPartShape(id)) placePart(id, p);
                  }}
                  // The base shape opens in the MIDDLE of the canvas: a frame the canvas's minimum
                  // extent wide, centred on it (the canvas otherwise pins a small shape to the
                  // top-left of that extent), plus every added shape so none opens off-screen.
                  framePoints={[
                    { x: anchor.x - PRODUCT_FRAME.minExtentMm.w / 2, y: anchor.y - PRODUCT_FRAME.minExtentMm.h / 2 },
                    { x: anchor.x + PRODUCT_FRAME.minExtentMm.w / 2, y: anchor.y + PRODUCT_FRAME.minExtentMm.h / 2 },
                    ...partFeatures.flatMap((f) => {
                      const r = Math.hypot(f.widthMm, f.depthMm) / 2;
                      return [{ x: f.x - r, y: f.y - r }, { x: f.x + r, y: f.y + r }];
                    }),
                  ]}
                  backdrop={
                    chairs && (
                      <g transform={`translate(${chairs.at.x} ${chairs.at.y})`} className="pointer-events-none">
                        <SeatChairs seats={chairs.seats} />
                      </g>
                    )
                  }
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
                  overlay={(ctx) =>
                    canvasBounds && (
                      <>
                        <StructureFeatures
                          structure={{ ...emptyStructure(), features: partFeatures }}
                          mm={ctx.mm}
                          clientToMm={ctx.clientToMm}
                          selectedIds={selectedPart ? [selectedPart] : []}
                          onSelect={(id) => {
                            setSelectedPart(id);
                            setSelected([]);
                          }}
                          onMove={(id, p) => {
                            const part = parts.find((x) => x.id === id);
                            if (!part) return;
                            const box = partBox(part);
                            const at = ctx.snap(p, snapOpts(id, { widthMm: box.widthMm, depthMm: box.depthMm }));
                            patchPart(id, { x: Math.round(at.x - anchor.x), y: Math.round(at.y - anchor.y) });
                          }}
                          onResize={(id, r) => {
                            const part = parts.find((x) => x.id === id);
                            const before = partFeatures.find((f) => f.id === id);
                            if (!part || !before) return;
                            let { widthMm, depthMm, x, y } = r;
                            // The edge being dragged is pulled onto the guides; the opposite one stays
                            // where it was. Only square to the plan — a turned edge has no axis to line up.
                            if (straight(part.rotation || 0)) {
                              if (usesDiameter(part.shape)) {
                                const edge = ctx.snap({ x: x + widthMm / 2, y }, snapOpts(id)).x;
                                widthMm = depthMm = Math.max(100, 2 * (edge - x));
                              } else {
                                if (widthMm !== before.widthMm) {
                                  const right = Math.abs(x + widthMm / 2 - (before.x + before.widthMm / 2)) > Math.abs(x - widthMm / 2 - (before.x - before.widthMm / 2));
                                  const fixed = right ? x - widthMm / 2 : x + widthMm / 2;
                                  const moved = ctx.snap({ x: right ? x + widthMm / 2 : x - widthMm / 2, y }, snapOpts(id)).x;
                                  widthMm = Math.max(100, Math.abs(moved - fixed));
                                  x = (moved + fixed) / 2;
                                }
                                if (depthMm !== before.depthMm) {
                                  const down = Math.abs(y + depthMm / 2 - (before.y + before.depthMm / 2)) > Math.abs(y - depthMm / 2 - (before.y - before.depthMm / 2));
                                  const fixed = down ? y - depthMm / 2 : y + depthMm / 2;
                                  const moved = ctx.snap({ x, y: down ? y + depthMm / 2 : y - depthMm / 2 }, snapOpts(id)).y;
                                  depthMm = Math.max(100, Math.abs(moved - fixed));
                                  y = (moved + fixed) / 2;
                                }
                              }
                            }
                            patchPart(id, {
                              ...(usesDiameter(part.shape)
                                ? { diameterMm: Math.round(widthMm * (part.shape === "quarter-circle" ? 2 : 1)) }
                                : { widthMm: Math.round(widthMm), depthMm: Math.round(depthMm) }),
                              x: Math.round(x - anchor.x),
                              y: Math.round(y - anchor.y),
                            });
                          }}
                          onRotate={(id, deg) => patchPart(id, { rotation: deg })}
                          onCommit={ctx.endSnap}
                        />
                        {/* What the plan writes inside the outline, drawn on the outline itself.
                            Without it, picking an icon changed nothing on the surface the designer
                            is looking at. */}
                        <g transform={`translate(${canvasBounds.cx} ${canvasBounds.cy})`} className="pointer-events-none text-ink-soft">
                          {/* At the outline's own label point, as the plan will write it — on the
                              band of an arc, not at the box centre the <g> above sits on. */}
                          <PlanContent
                            content={resolveContent(preview)}
                            w={canvasBounds.w}
                            h={canvasBounds.h}
                            at={labelAnchor({ kind: "custom", outline: canvasOutline, edgeCurves: canvasCurves })}
                          />
                        </g>
                      </>
                    )
                  }
                />
                {selectedPartRow && (
                  <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
                    <div className="pointer-events-auto max-w-full">
                      <PartBar
                        part={selectedPartRow}
                        onChange={(p) => patchPart(selectedPartRow.id, p)}
                        onDuplicate={() => paste(selectedPartRow)}
                        onRemove={() => removePart(selectedPartRow.id)}
                        onToFront={() => setParts([...parts.filter((x) => x.id !== selectedPartRow.id), selectedPartRow])}
                        onToBack={() => setParts([selectedPartRow, ...parts.filter((x) => x.id !== selectedPartRow.id)])}
                        onClose={() => setSelectedPart(null)}
                      />
                    </div>
                  </div>
                )}

                {selected.length > 0 && !selectedPartRow && (
                  <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
                    <div className="pointer-events-auto">
                      <SelectionInspector
                        selected={selected}
                        outline={canvasOutline}
                        edgeCurves={canvasCurves}
                        lockedEdges={canvasLocked}
                        onRemoveVertex={free(ed.removeVertex)}
                        onRemoveSelection={free(ed.removeSelection)}
                        onInsertVertexOnWall={free(ed.insertVertexOnWall)}
                        onSetWallLength={free(ed.setWallLength)}
                        onSetWallAngle={free(ed.setWallAngle)}
                        onSetWallBulgeDepth={free(ed.setWallBulgeDepth)}
                        onToggleWallLock={free(ed.toggleWallLock)}
                        onClose={() => setSelected([])}
                        edgeNoun="צלע"
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 pb-24">
                <AppearancePreview product={preview} className="max-h-[70%] w-full max-w-md" />
                <p className="text-center text-xs text-muted">
                  {stretch
                    ? `${category?.label ?? "פריטים אלה"} נמדדים על התוכנית — הגודל נקבע כשמותחים אותם באירוע.`
                    : "כך יצויר הפריט על התוכנית, בקנה מידה אמיתי."}
                </p>
              </div>
            )}

            {/* The main shape's bar — the same minimal inspector a selected added shape gets, and
                the one that rests on the canvas whenever nothing else is being edited. */}
            {!selectedPartRow && selected.length === 0 && (
              <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
                <div className="pointer-events-auto max-w-full">
                  <Bar icon={Shapes} title="צורה ראשית" facts={SHAPE_LABEL[shape]}>
                    <Popover label="צורה" icon={Shapes} value={SHAPE_LABEL[shape]} panelClassName="w-80">
                      <ShapeGrid value={shape} onPick={changeShape} />
                      {derived && <Note>גררו נקודה או קצה של הצורה על הקנבס כדי לעצב אותה בחופשיות.</Note>}
                    </Popover>
                    {(custom || !stretch) && (
                      <Popover
                        label="מידות"
                        icon={Ruler}
                        tone={missing ? "warn" : "default"}
                        value={ltr(
                          custom
                            ? bounds
                              ? `${mmToCm(bounds.w)}×${mmToCm(bounds.h)}`
                              : "—"
                            : asksDiameter
                              ? `${ROUND_FIELD[shape]?.label === "רדיוס" ? "R" : "⌀"}${mmToCm((roundSizeMm(shape, draft.dimensions) ?? 0) / (ROUND_FIELD[shape]?.factor ?? 1))}`
                              : `${mmToCm(draft.dimensions.widthMm ?? 0)}×${mmToCm(draft.dimensions.depthMm ?? 0)}`,
                        )}
                      >
                        {custom ? (
                          <>
                            <PanelRow label="רוחב (ס״מ)" htmlFor="a-w">
                              <NumberField id="a-w" decimals={0} min={0} commitOnBlur disabled={!bounds} value={bounds ? mmToCm(bounds.w) : 0} onChange={(cm) => resize("w", cm)} className="w-20" />
                            </PanelRow>
                            <PanelRow label="עומק (ס״מ)" htmlFor="a-h">
                              <NumberField id="a-h" decimals={0} min={0} commitOnBlur disabled={!bounds} value={bounds ? mmToCm(bounds.h) : 0} onChange={(cm) => resize("h", cm)} className="w-20" />
                            </PanelRow>
                          </>
                        ) : asksDiameter ? (
                          <PanelRow label={`${ROUND_FIELD[shape]?.label ?? "קוטר"} (ס״מ)`} htmlFor="a-d">
                            <NumberField
                              id="a-d"
                              hideZero
                              min={0}
                              placeholder="0"
                              value={(roundSizeMm(shape, draft.dimensions) ?? 0) / (ROUND_FIELD[shape]?.factor ?? 1) / 10}
                              onChange={(v) => setDim("diameterMm", v * (ROUND_FIELD[shape]?.factor ?? 1))}
                              className="w-20"
                            />
                          </PanelRow>
                        ) : (
                          <>
                            <PanelRow label="רוחב (ס״מ)" htmlFor="a-w">
                              <NumberField id="a-w" hideZero min={0} placeholder="0" value={(draft.dimensions.widthMm ?? 0) / 10} onChange={(v) => setDim("widthMm", v)} className="w-20" />
                            </PanelRow>
                            <PanelRow label="עומק (ס״מ)" htmlFor="a-h">
                              <NumberField id="a-h" hideZero min={0} placeholder="0" value={(draft.dimensions.depthMm ?? 0) / 10} onChange={(v) => setDim("depthMm", v)} className="w-20" />
                            </PanelRow>
                          </>
                        )}
                        {missing && <Note>יש להשלים את המידות — לפיהן מצויר הפריט.</Note>}
                      </Popover>
                    )}
                    {shape === "arc" && !stretch && (
                      <Popover label="קשת" icon={Rainbow} value={ltr(`${arcSpecOf(roundSizeMm(shape, draft.dimensions) || DEFAULT_PRESET_MM.w, draft.appearance?.arc).sweepDeg}°`)} panelClassName="w-72">
                        <ArcFields
                          idPrefix="a-arc"
                          diameterMm={roundSizeMm(shape, draft.dimensions) ?? 0}
                          arc={draft.appearance?.arc}
                          onChange={(arc) => setAppearance({ arc })}
                        />
                      </Popover>
                    )}
                    {ringShape && !stretch && (
                      <Popover
                        label={RING_LABEL[ringShape]}
                        icon={Donut}
                        value={`רצועה ${mmToCm(
                          ringSpecOf(draft.dimensions.widthMm || DEFAULT_PRESET_MM.w, draft.dimensions.depthMm || DEFAULT_PRESET_MM.h, draft.appearance?.ring, ringShape).bandMm,
                        )}`}
                        panelClassName="w-72"
                      >
                        <RingFields
                          idPrefix="a-ring"
                          shape={ringShape}
                          widthMm={draft.dimensions.widthMm ?? 0}
                          depthMm={draft.dimensions.depthMm ?? 0}
                          ring={draft.appearance?.ring}
                          onChange={(ring) => setAppearance({ ring })}
                        />
                      </Popover>
                    )}
                    {(custom || derived) && (
                      <div className="ms-auto flex items-center gap-1">
                        <InspectorDivider />
                        <AddElementFlyout
                          open={elementsOpen}
                          onOpenChange={setElementsOpen}
                          items={SHAPE_ITEMS}
                          sections={SHAPE_SECTIONS}
                          armedId={armedShape}
                          triggerLabel="אלמנט"
                          searchPlaceholder="חיפוש צורה..."
                          onPick={(id) => {
                            if (isPartShape(id)) setArmedShape((a) => (a === id ? null : id));
                            setElementsOpen(false);
                          }}
                        />
                      </div>
                    )}
                  </Bar>
                </div>
              </div>
            )}
          </div>

          {/* (the main bar is drawn inside the canvas column, above) */}
          {/* The inspector: everything that changes what the plan draws, top to bottom in the order
              the questions depend on each other — the shape, then the measurements it is made of,
              then what sits inside it, then how it is painted. */}
          {/* No thumbnail at the top of this panel: the canvas beside it is already showing the
              same drawing, larger. Two previews of one shape, one of them 96px tall, is the kind
              of pair a designer checks twice to see whether they disagree. */}
          <aside className="w-[288px] shrink-0 space-y-4 overflow-y-auto border-s border-border bg-surface p-4">
            {/* Which sides are laid with chairs — a drawing of the table to click on. The chairs are
                also on the canvas, where the effect of a click shows at full size. */}
            {seated && !stretch && !missing && (
              <>
                <div>
                  <span className={fieldLabelClassName}>צדדים לישיבה</span>
                  <SeatSidesPicker
                    footprint={resolveFootprint(preview)}
                    seats={seatCount}
                    blocked={blocked}
                    onToggle={toggleSide}
                    className="h-44 w-full rounded-md bg-canvas"
                  />
                  <p className="mt-1.5 text-xs text-muted">
                    {blocked.length
                      ? "הצדדים המקווקווים חסומים — הכסאות עוברים לצדדים הפתוחים. לחיצה על צד פותחת אותו שוב."
                      : "לחצו על צד כדי שלא יוצבו בו כסאות — שולחן ראש, שולחן צמוד לקיר."}
                    {seatCount === 0 && " (כמות הכסאות התקנית נקבעת בטופס המוצר.)"}
                  </p>
                </div>
                <div className="h-px bg-border-soft" />
              </>
            )}

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
                dimensions:
                  custom && bounds
                    ? { ...draft.dimensions, widthMm: Math.round(bounds.w), depthMm: Math.round(bounds.h) }
                    : draft.dimensions,
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
