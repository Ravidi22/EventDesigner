"use client";

import { useEffect, useRef, useState } from "react";
import { BringToFront, ChartPie, Check, Donut, Move, Paintbrush, PenLine, Rainbow, Ruler, SendToBack, Shapes, Trash2, X } from "lucide-react";
import type { ArcSpec, HollowSpec, MapAppearance, MapShape, Product, RingSpec, ShapePart } from "@/lib/catalog/types";
import { ARC_SWEEP, MAP_SHAPES, PICKER_SHAPES, RING_GAP, ROUND_FIELD, SHAPE_LABEL, canHollow, usesDiameter } from "@/lib/catalog/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import type { EdgeCurve } from "@/lib/studio/hall";
import {
  arcSpecOf,
  buildHollow,
  customShapeBounds,
  defaultHollowBand,
  footprintBounds,
  footprintOutlines,
  hollowGapSide,
  hollowOuter,
  hollowSideNames,
  pieceOf,
  piecesFootprint,
  resolveContent,
  resolveFootprint,
  placedPartOutline,
  ringSpecOf,
  roundSizeMm,
  sampledBounds,
  shapeFootprint,
  shapePieces,
  uShapeBandOf,
  type BuiltOutline,
  type Footprint,
  type RingShape,
} from "@/lib/studio/footprint";
import { Select } from "@/components/select";
import { TagToggle } from "@/components/tag-toggle";
import { seatSides } from "@/lib/studio/seating";
import { FootprintShape, OutlinePath } from "@/components/footprint-shape";
import { SeatChairs, SeatSidesPicker } from "@/components/seat-sides-picker";
import { seatsAround } from "@/lib/studio/seating";
import { AddElementFlyout, type FlyoutItem } from "@/components/add-element-flyout";
import { Actions, Bar, BarButton, Note, PanelRow, Rotation, ltr } from "@/components/inspector-bar";
import { InspectorDivider } from "@/components/plan-canvas";
import { Popover } from "@/components/popover";
import { StructureFeatures } from "@/components/venue-plan";
import { emptyStructure, type StructureFeature } from "@/lib/venues/structure";
import type { HostSnapOptions } from "@/components/plan-canvas";
import { closeRefusal, sideIndicesAfterInsert, sideIndicesAfterRemove, useOutlineEditor, type SelectedRef } from "@/lib/studio/use-outline-editor";
import { isTypingTarget } from "@/lib/keyboard";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { Segmented } from "@/components/segmented";
import { StyleFields } from "@/components/style-fields";
import { PlanCanvas, SelectionInspector } from "@/components/plan-canvas";
import { fieldLabelClassName } from "@/components/control";
import { AppearancePreview, PlanContent } from "./appearance-preview";
import { labelAnchor } from "@/lib/studio/label-anchor";
import { IconPicker } from "./icon-picker";
import { CloseButton } from "@/components/close-button";
import { SwitchRow } from "@/components/toggle";
import { ItemSurface } from "@/components/surface-fill";
import { hasSurface, type Surface } from "@/lib/catalog/textures";
import { SurfacePicker, surfaceLabel } from "./surface-picker";
import { ItemSymbol } from "@/components/item-symbol";
import {
  CANDLE_STYLES,
  CANDLE_STYLE_HINT,
  CANDLE_STYLE_LABEL,
  CHAIR_STYLES,
  CHAIR_STYLE_LABEL,
  SYMBOL_STYLES,
  categoryHasSymbol,
  chairStyleOf,
  drawStyleOf,
  symbolCount,
  symbolOf,
  type DrawStyle,
  type SymbolKind,
} from "@/lib/catalog/symbols";
import { FLOWER_FORMS, FLOWER_FORM_HINT, FLOWER_FORM_LABEL, defaultFlowerForm, isFlowerForm, type FlowerDrawSpec } from "@/lib/catalog/flower-draw";
import { drawLinesOf, flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { FlowerDrawing } from "@/components/flower-symbol";
import { climbRise } from "@/lib/studio/climb-item";

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

const CIRCLE_SWEEPS = [["360", "מלא"], ...SWEEP_PRESETS] as const;

/** How much of a circle it is (MapAppearance.arc.sweepDeg on a "circle") — all of it, a half, a
 *  third, a quarter, or any angle. Under 360 it is a solid slice; the "מילוי" chip hollows it, and
 *  its two radii opened make the old קשת חלולה. */
function CircleSweepFields({ idPrefix, sweepDeg, onChange }: { idPrefix: string; sweepDeg: number; onChange: (sweepDeg: number) => void }) {
  return (
    <div className="space-y-2">
      <Segmented label="כמה מהעיגול" value={String(sweepDeg)} options={CIRCLE_SWEEPS} onChange={(v) => onChange(Number(v))} />
      <PanelRow label="זווית (°)" htmlFor={`${idPrefix}-sweep`}>
        <NumberField id={`${idPrefix}-sweep`} decimals={0} min={ARC_SWEEP.min} max={360} commitOnBlur value={sweepDeg} onChange={onChange} className="w-20" />
      </PanelRow>
    </div>
  );
}

/** A circle's sweep as stored: absent for the whole circle. */
const sweepPatch = (deg: number): ArcSpec | undefined => (deg >= 360 ? undefined : { sweepDeg: Math.max(ARC_SWEEP.min, Math.round(deg)), bandMm: 0 });
const sweepValue = (arc: ArcSpec | undefined) => (arc && arc.sweepDeg < 360 ? ltr(`${arc.sweepDeg}°`) : "מלא");

/** A slice's straight sides — its two radii, or the one chord of a half — as edge numbers; null for
 *  the whole circle. A slice made hollow, or re-cut while hollow, is opened along them: that is the
 *  banana table, the curved partition, what the קשת חלולה was. Closed again by hand if wanted. */
function sliceRadii(diameterMm: number | undefined, arc: ArcSpec | undefined): number[] | null {
  if (!arc || arc.sweepDeg >= 360) return null;
  const o = hollowOuter("circle", { diameterMm, arc });
  return o.outline.map((_, i) => i).filter((i) => !o.edgeCurves?.[i]);
}

/** The row with its hollow slice opened along its radii (sliceRadii) — and, on a table, its two caps
 *  across the band left unseated, as the arc's were (arcCaps). Any other row comes back as it was. */
function withSliceOpened(p: Product, seated: boolean): Product {
  const a = p.appearance;
  const radii = a?.shape === "circle" && a.hollow ? sliceRadii(roundSizeMm("circle", p.dimensions), a.arc) : null;
  if (!a?.hollow || !radii) return p;
  const opened: Product = { ...p, appearance: { ...a, hollow: { ...a.hollow, openSides: radii } } };
  return seated ? { ...opened, appearance: { ...opened.appearance!, blockedSides: arcCaps(opened) } } : opened;
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

/** The square ח's one number beyond its box: how deep its counter is (uShapeBandOf). Stored as the
 *  band of its RingSpec, like the curved bars' — so stretching the bar keeps a 60cm counter at 60cm
 *  instead of thickening it with the arms. Shared by the base shape and a part. */
function CounterFields({ idPrefix, widthMm, depthMm, ring, onChange }: { idPrefix: string; widthMm: number; depthMm: number; ring?: RingSpec; onChange: (ring: RingSpec) => void }) {
  const band = uShapeBandOf(widthMm || DEFAULT_PRESET_MM.w, depthMm || DEFAULT_PRESET_MM.h, ring);
  return (
    <div className="space-y-2">
      <PanelRow label="עומק הדלפק (ס״מ)" htmlFor={`${idPrefix}-band`}>
        <NumberField
          id={`${idPrefix}-band`}
          decimals={0}
          min={5}
          commitOnBlur
          value={mmToCm(band)}
          onChange={(v) => onChange({ ...ring, bandMm: Math.round(v * 10) })}
          className="w-20"
        />
      </PanelRow>
      <Note>{ring?.bandMm ? "נשאר קבוע כשמשנים את הרוחב והעומק של הח׳." : "כרגע שליש מהצלע הקצרה — מספר שתקלידו יישאר קבוע גם כשמשנים את הגודל."}</Note>
    </div>
  );
}

const FILL_OPTIONS = [
  ["solid", "מלא"],
  ["hollow", "חלול"],
] as const;

const GAP_ALONG = [
  ["start", "התחלה"],
  ["center", "מרכז"],
  ["end", "סוף"],
] as const;

/** What the "מילוי" chip reads on a bar. */
const hollowValue = (h: HollowSpec | undefined) => (h ? `חלול · ${mmToCm(h.bandMm)} ס״מ` : "מלא");

/** A hollow spec carried to a DIFFERENT outline (another shape picked, or a drawing found where it
 *  was left): the band and the entrance's width and place mean the same on any shape, but open sides
 *  and the entrance's side are edge numbers of the outline they were chosen on — on another one they
 *  would open some other side, so they go. Nothing at all for a shape that cannot be hollow. */
const hollowAcross = (h: HollowSpec | undefined, next: MapShape): HollowSpec | undefined =>
  h && canHollow(next) ? { bandMm: h.bandMm, ...(h.gapMm ? { gapMm: h.gapMm } : {}), ...(h.gapAt ? { gapAt: h.gapAt } : {}) } : undefined;

/** Solid or hollow (HollowSpec), and how hollow: the band's depth, the sides left open, and — on a
 *  band that runs all the way round — an entrance cut through it. Shared by the base shape and a
 *  part. `outer` is the shape's own outline drawn SOLID, as it stands on the canvas: its edges are
 *  the sides, named by the way they face there. */
function HollowFields({
  idPrefix,
  outer,
  hollow,
  defaultBand,
  onChange,
}: {
  idPrefix: string;
  outer: BuiltOutline;
  hollow?: HollowSpec;
  defaultBand: number;
  onChange: (hollow: HollowSpec | undefined) => void;
}) {
  const names = hollowSideNames(outer);
  // Only sides this outline has — a spec from before a corner was taken away may name one that is gone.
  const open = (hollow?.openSides ?? []).filter((i) => i < names.length);
  const gap = hollow?.gapMm ?? 0;
  return (
    <div className="space-y-2">
      <Segmented
        label="מילוי"
        value={hollow ? "hollow" : "solid"}
        options={FILL_OPTIONS}
        onChange={(v) => onChange(v === "hollow" ? (hollow ?? { bandMm: defaultBand }) : undefined)}
      />
      {hollow && (
        <>
          <PanelRow label="עומק הרצועה (ס״מ)" htmlFor={`${idPrefix}-band`}>
            <NumberField
              id={`${idPrefix}-band`}
              decimals={0}
              min={1}
              commitOnBlur
              value={mmToCm(hollow.bandMm)}
              onChange={(v) => {
                if (v > 0) onChange({ ...hollow, bandMm: Math.round(v * 10) });
              }}
              className="w-20"
            />
          </PanelRow>
          <PanelRow label="צדדים פתוחים" stack>
            <div className="flex flex-wrap gap-1">
              {names.map((name, i) => (
                <TagToggle
                  key={i}
                  active={open.includes(i)}
                  onClick={() => {
                    const next = open.includes(i) ? open.filter((x) => x !== i) : [...open, i].sort((a, b) => a - b);
                    onChange({ ...hollow, openSides: next.length ? next : undefined });
                  }}
                >
                  {name}
                </TagToggle>
              ))}
            </div>
          </PanelRow>
          {/* An entrance only makes sense in a band that runs all the way round — with a side open,
              that side IS the way in. */}
          {open.length === 0 && (
            <>
              <PanelRow label="כניסה (ס״מ, 0 = סגורה)" htmlFor={`${idPrefix}-gap`}>
                <NumberField
                  id={`${idPrefix}-gap`}
                  decimals={0}
                  min={0}
                  commitOnBlur
                  value={mmToCm(gap)}
                  onChange={(v) => onChange({ ...hollow, gapMm: v > 0 ? Math.round(v * 10) : undefined })}
                  className="w-20"
                />
              </PanelRow>
              {gap > 0 && (
                <>
                  <PanelRow label="בצד" stack>
                    <Select
                      value={String(hollowGapSide(outer, hollow))}
                      onChange={(v) => onChange({ ...hollow, gapSide: Number(v) })}
                      options={names.map((label, i) => ({ value: String(i), label }))}
                      aria-label="הצד שבו הכניסה"
                      className="w-full"
                    />
                  </PanelRow>
                  <Segmented label="מיקום הכניסה בצד" value={hollow.gapAt ?? "center"} options={GAP_ALONG} onChange={(gapAt) => onChange({ ...hollow, gapAt })} />
                </>
              )}
            </>
          )}
          <Note>צד פתוח — הרצועה מגיעה עד קו הצד ונעצרת בו, כמו ח׳. כניסה — פתח ברצועה סגורה.</Note>
        </>
      )}
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

// The picker's shapes (PICKER_SHAPES): a קשת חלולה, a צורת ח and an אליפסה חלולה are a half circle,
// a rectangle and a capsule made hollow on the new part's bar.
const SHAPE_ITEMS: FlyoutItem[] = PICKER_SHAPES.filter((s): s is Exclude<MapShape, "custom"> => s !== "custom").map((s) => ({
  id: s,
  label: SHAPE_LABEL[s],
  section: "shapes",
  preview: <ShapeCard shape={s} />,
}));
// "Draw it yourself", as an added shape too — the base shape has always had it. Picking it puts the
// canvas into drawing mode for a NEW shape, closed like the base outline is.
const DRAW_ITEM: FlyoutItem = {
  id: "custom",
  label: "צורה חופשית — ציור ביד",
  section: "shapes",
  preview: (
    <span className="flex h-11 w-11 items-center justify-center rounded-md bg-inset">
      <PenLine className="h-4 w-4 text-accent" strokeWidth={1.75} />
    </span>
  ),
};
const PART_ITEMS: FlyoutItem[] = [...SHAPE_ITEMS, DRAW_ITEM];
const SHAPE_SECTIONS = [{ id: "shapes", label: "צורות" }];
const isPartShape = (id: string): id is Exclude<ShapePart["shape"], "custom"> => SHAPE_ITEMS.some((i) => i.id === id);

/** A hand-drawn part's outline stretched to a new box about its own centre — what its resize handles
 *  and its size fields do. Curves are offsets from their endpoints, so they scale by the same two. */
function rescaleCustomPart(part: ShapePart, widthMm: number, depthMm: number): Pick<ShapePart, "outline" | "edgeCurves" | "widthMm" | "depthMm"> {
  const outline = part.outline ?? [];
  const b = customShapeBounds(outline, part.edgeCurves);
  const sx = b.w > 0 ? Math.max(100, widthMm) / b.w : 1;
  const sy = b.h > 0 ? Math.max(100, depthMm) / b.h : 1;
  return {
    outline: outline.map((v) => ({ x: Math.round(b.cx + (v.x - b.cx) * sx), y: Math.round(b.cy + (v.y - b.cy) * sy) })),
    edgeCurves: part.edgeCurves?.map((c) => (c ? { c1: { x: c.c1.x * sx, y: c.c1.y * sy }, c2: { x: c.c2.x * sx, y: c.c2.y * sy } } : c)),
    widthMm: Math.round(b.w * sx),
    depthMm: Math.round(b.h * sy),
  };
}

/** A part as the patch would leave it: a hand-drawn one whose size is changed is RESCALED, since its
 *  outline — not its two numbers — is what draws it. */
function patchedPart(part: ShapePart, p: Partial<ShapePart>): ShapePart {
  const next = { ...part, ...p };
  if (part.shape === "custom" && !p.outline && (p.widthMm !== undefined || p.depthMm !== undefined)) {
    return { ...next, ...rescaleCustomPart(part, p.widthMm ?? part.widthMm ?? 0, p.depthMm ?? part.depthMm ?? 0) };
  }
  return next;
}

/** A new part's starting size — something a designer can see at the size a catalog item is, and
 *  then drag to what it really is. */
function newPart(shape: Exclude<ShapePart["shape"], "custom">, at: { x: number; y: number }): ShapePart {
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

// ── Where the parts live while they are edited ─────────────────────────────────────────────────
//
// STORED, a part's x/y is its centre relative to the base shape's centre (placedPartOutline reads it
// so; the composite is centred on the lot). IN THE EDITOR it is the part's place on the canvas. The
// two differ by where the base's centre falls on the canvas (`anchor` below), and the editor converts
// on the way in (openAnchor, once) and on the way out (storedParts, at save and for every preview).
//
// Why not keep the stored offsets and add the anchor when drawing? Because the anchor MOVES: drag one
// corner of the base, push a side, type a new width, square it up on close — its box's centre shifts,
// and every part stored relative to it slid by half the change while the designer was looking at
// the corner they were dragging. On the canvas a part is a thing standing where it was put; the base
// reshaped under it leaves it standing there, and so does Ctrl+Z of that reshape (the outline
// editor's history holds the base alone, and now has nothing of the parts' to keep in step).

/** Where the base shape's centre lands on the canvas when the editor opens: footprintOutlines
 *  centres a derived shape on (0,0); a hand-drawn outline is drawn where its points are. */
function openAnchor(p: Product): { x: number; y: number } {
  const a = p.appearance;
  if (a?.shape === "custom" && a.outline && a.outline.length >= 3) {
    const b = customShapeBounds(a.outline, a.edgeCurves);
    return { x: b.cx, y: b.cy };
  }
  return { x: 0, y: 0 };
}

const shifted = (p: ShapePart, dx: number, dy: number): ShapePart => ({ ...p, x: Math.round(p.x + dx), y: Math.round(p.y + dy) });

/** The base shape's picker: every shape as its own picture, plus "draw it yourself". A grid of cards
 *  rather than a Select — the bar sits on the bottom edge of the canvas, and a list that opens
 *  downward from there opens off it. The three hollow shapes a solid one now draws (PICKER_SHAPES)
 *  show a card only on a row that already is one, so the grid still says what it is. */
function ShapeGrid({ value, onPick }: { value: MapShape; onPick: (shape: MapShape) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="צורה">
      {MAP_SHAPES.filter((s) => PICKER_SHAPES.includes(s) || s === value).map((s) => (
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

/** The versions of a category's picture (SYMBOL_STYLES) as tiles, each drawn at a typical size of
 *  that version in THIS row's shade and count, so the designer picks by looking. The first tile is
 *  what the category always drew, and picking it stores no style at all. A sofa drawn round is a
 *  pouf whatever its style, so a round one is offered none. */
function StyleTiles({ kind, product, onPick }: { kind: SymbolKind; product: Product; onPick: (style: DrawStyle | undefined) => void }) {
  const set = SYMBOL_STYLES[kind];
  if (!set) return null;
  if (kind === "sofa" && resolveFootprint(product).kind !== "rect") return null;
  const chosen = drawStyleOf(product) ?? set.styles[0];
  const tone = product.variants.find((v) => !v.archived && v.swatch)?.swatch ?? product.appearance?.style?.fill;
  const count = symbolCount(product, kind);
  const cols = set.styles.length <= 2 ? "grid-cols-2" : set.styles.length === 3 ? "grid-cols-3" : "grid-cols-4";
  return (
    <div>
      <span className={fieldLabelClassName}>{set.title}</span>
      <div className={`grid ${cols} gap-1`} role="radiogroup" aria-label={set.title}>
        {set.styles.map((st, i) => {
          const f = set.sample(st);
          const b = footprintBounds(f);
          const pad = Math.max(b.w, b.h) * 0.06;
          const on = chosen === st;
          return (
            <button
              key={st}
              type="button"
              role="radio"
              aria-checked={on}
              title={set.hint?.[st] ?? set.label[st]}
              onClick={() => onPick(i === 0 ? undefined : st)}
              className={
                "flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " +
                (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line")
              }
            >
              <svg viewBox={`${-b.w / 2 - pad} ${-b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className="h-10 w-full" aria-hidden>
                <ItemSymbol kind={kind} footprint={f} count={count} tone={tone} drawStyle={st} />
              </svg>
              <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{set.label[st]}</span>
            </button>
          );
        })}
      </div>
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
  onRedraw,
  color,
}: {
  part: ShapePart;
  /** Redraw this shape by hand — its outline handed to the canvas's own outline editor. */
  onRedraw: () => void;
  /** The item's fill, for the texture tiles. */
  color?: string;
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
  const drawn = part.shape === "custom";
  const field = ROUND_FIELD[part.shape] ?? { label: "קוטר", factor: 1 };
  const D = roundSizeMm(part.shape, part);
  const size = round ? `${field.label === "רדיוס" ? "R" : "⌀"}${cm((D ?? 0) / field.factor)}` : `${cm(part.widthMm)}×${cm(part.depthMm)}`;
  const spec = part.shape === "arc" ? arcSpecOf(D || DEFAULT_PRESET_MM.w, part.arc) : null;
  const ringShape = ringShapeOf(part.shape);
  const ringSpec = ringShape ? ringSpecOf(part.widthMm || DEFAULT_PRESET_MM.w, part.depthMm || DEFAULT_PRESET_MM.h, part.ring, ringShape) : null;
  return (
    <Bar icon={drawn ? PenLine : Shapes} title={drawn ? "צורה חופשית" : SHAPE_LABEL[part.shape]} facts="צורה נוספת" onClose={onClose}>
      <Popover label="מידות" icon={Ruler} value={ltr(size)}>
        {round ? (
          <PanelRow label={`${field.label} (ס״מ)`} htmlFor={`${id}-d`}>
            <NumberField
              id={`${id}-d`}
              decimals={0}
              min={0}
              commitOnBlur
              value={(D ?? 0) / field.factor / 10}
              onChange={(v) => onChange({ diameterMm: Math.round(v * 10 * field.factor) })}
              className="w-20"
            />
          </PanelRow>
        ) : (
          <>
            {/* commitOnBlur, like the main shape's: a size typed digit by digit rescaled the shape
                at "1", then "12", then "120" — a hand-drawn part through rescaleCustomPart each time. */}
            <PanelRow label="רוחב (ס״מ)" htmlFor={`${id}-w`}>
              <NumberField id={`${id}-w`} decimals={0} min={0} commitOnBlur value={cm(part.widthMm)} onChange={(v) => onChange({ widthMm: Math.round(v * 10) })} className="w-20" />
            </PanelRow>
            <PanelRow label="עומק (ס״מ)" htmlFor={`${id}-h`}>
              <NumberField id={`${id}-h`} decimals={0} min={0} commitOnBlur value={cm(part.depthMm)} onChange={(v) => onChange({ depthMm: Math.round(v * 10) })} className="w-20" />
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
      {/* This shape's own surface — a layer of its own, whatever the main shape or the others wear. */}
      <Popover label="טקסטורה" icon={Paintbrush} value={surfaceLabel(part)} panelClassName="w-80">
        <SurfacePicker
          idPrefix={id}
          value={{ texture: part.texture, textureImage: part.textureImage }}
          color={color}
          onChange={(sf) => onChange({ texture: sf.texture, textureImage: sf.textureImage })}
        />
      </Popover>
      {spec && (
        <Popover label="קשת" icon={Rainbow} value={ltr(`${spec.sweepDeg}°`)} panelClassName="w-72">
          <ArcFields idPrefix={id} diameterMm={D ?? 0} arc={part.arc} onChange={(arc) => onChange({ arc })} />
        </Popover>
      )}
      {part.shape === "circle" && (
        <Popover label="חלק מהעיגול" icon={ChartPie} value={sweepValue(part.arc)} panelClassName="w-72">
          <CircleSweepFields
            idPrefix={id}
            sweepDeg={part.arc?.sweepDeg ?? 360}
            onChange={(deg) => {
              const arc = sweepPatch(deg);
              const hollow = hollowAcross(part.hollow, "circle");
              const radii = hollow && sliceRadii(D, arc);
              onChange({ arc, hollow: radii ? { ...hollow, openSides: radii } : hollow });
            }}
          />
        </Popover>
      )}
      {ringShape && ringSpec && (
        <Popover label={RING_LABEL[ringShape]} icon={Donut} value={`רצועה ${cm(ringSpec.bandMm)}`} panelClassName="w-72">
          <RingFields idPrefix={id} shape={ringShape} widthMm={part.widthMm ?? 0} depthMm={part.depthMm ?? 0} ring={part.ring} onChange={(ring) => onChange({ ring })} />
        </Popover>
      )}
      {part.shape === "u-shape" && (
        <Popover label="ח" icon={Donut} value={`דלפק ${cm(uShapeBandOf(part.widthMm || DEFAULT_PRESET_MM.w, part.depthMm || DEFAULT_PRESET_MM.h, part.ring))}`} panelClassName="w-72">
          <CounterFields idPrefix={id} widthMm={part.widthMm ?? 0} depthMm={part.depthMm ?? 0} ring={part.ring} onChange={(ring) => onChange({ ring })} />
        </Popover>
      )}
      {canHollow(part.shape) && (
        <Popover label="מילוי" icon={Donut} value={hollowValue(part.hollow)} panelClassName="w-80">
          {/* The part's sides named as it stands on the canvas, turn included. */}
          <HollowFields
            idPrefix={`${id}-hollow`}
            outer={placedPartOutline(part)}
            hollow={part.hollow}
            defaultBand={(() => {
              const b = sampledBounds([hollowOuter(part.shape, part)]);
              return defaultHollowBand(b.w, b.h);
            })()}
            onChange={(hollow) => {
              const radii = hollow && !part.hollow && part.shape === "circle" && sliceRadii(D, part.arc);
              onChange({ hollow: radii ? { ...hollow, openSides: radii } : hollow });
            }}
          />
        </Popover>
      )}
      <BarButton icon={PenLine} label={drawn ? "עריכת הקווים" : "עיצוב חופשי — עריכת הקווים ביד"} onClick={onRedraw} />
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
  // The parts come in at their place on the canvas and go out relative to the base again (see "Where
  // the parts live while they are edited", above).
  const [draft, setDraft] = useState<Product>(() => {
    const p = withSizeFor(product);
    const at = openAnchor(p);
    const parts = p.appearance?.parts;
    return parts?.length ? { ...p, appearance: { ...p.appearance!, parts: parts.map((q) => shifted(q, at.x, at.y)) } } : p;
  });
  const [pickingIcon, setPickingIcon] = useState(false);
  // A transient line over the canvas — why a close was refused, and the like. The studio's own.
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number | null>(null);
  const showHint = (msg: string) => {
    setHint(msg);
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 2800);
  };
  useEffect(() => () => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
  }, []);
  const [elementsOpen, setElementsOpen] = useState(false);
  const [armedShape, setArmedShape] = useState<Exclude<ShapePart["shape"], "custom"> | null>(null);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  // An added shape being drawn (a new one) or redrawn by hand. While it is, the canvas's outline
  // editor is ITS — the main shape goes quiet underneath, and its own Ctrl+Z steps aside.
  const [drawingPart, setDrawingPart] = useState<{ id: string; isNew: boolean } | null>(null);
  // Mounted by the act of opening and unmounted on close (the drawer renders it conditionally), so
  // every piece of state here — the draft, the outline, the undo history, the hook's global Ctrl+Z
  // listener — is born and dies with one editing session. Nothing to seed in an effect, and no way
  // for an undo to walk back into a shape that belongs to a product the designer has moved on from.
  const ed = useOutlineEditor({ outline: product.appearance?.outline ?? [], edgeCurves: product.appearance?.edgeCurves }, { enabled: !drawingPart });
  const { mode, outline, edgeCurves: curves, lockedEdges, selected, setSelected } = ed;
  const partEd = useOutlineEditor({ outline: [] }, { enabled: !!drawingPart });

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
  // The colour the item's surfaces are tinted by: its own fill, else its first shade.
  const itemColor = draft.appearance?.style?.fill ?? draft.variants.find((v) => !v.archived && v.swatch)?.swatch;

  // The box of what is DRAWN, bowed sides included — the drawer's two numbers and the saved size.
  const bounds = outline.length >= 3 ? customShapeBounds(outline, curves) : null;

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
      // blank canvas — the derived shapes ARE outlines, so the one on the canvas is handed over as
      // it is. (Rebuilding it from the item's numbers is how a quarter circle doubled here: its one
      // number is a diameter, and the rebuild read it as the quarter's width, which is a radius.) A
      // drawing left behind by an earlier switch away from מותאם is found where it was left.
      // A hollow shape stays hollow: the outline handed over is its OUTSIDE (derived is drawn solid),
      // edge for edge, so its open sides are still the same sides — unless an earlier drawing stands
      // in for it, whose edges are other ones.
      const hollow = draft.appearance?.hollow;
      if (outline.length >= 3) {
        // the earlier drawing stands
        setAppearance({ shape: "custom", blockedSides: undefined, hollow: hollowAcross(hollow, "custom") });
        return;
      } else if (derived) {
        ed.setAll({ mode: "edit", outline: derived.outline, edgeCurves: derived.edgeCurves, lockedEdges: derived.outline.map(() => false) });
      } else insertPreset("rect");
      setAppearance({ shape: "custom", blockedSides: undefined, hollow: derived ? hollow : hollowAcross(hollow, "custom") });
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
        // side is a different place altogether. Neither are the open sides of a hollow spec, for
        // the same reason; its band comes across, and none of it to a shape that cannot be hollow.
        appearance: { content: contentOf(d), ...d.appearance, shape: next, blockedSides: undefined, hollow: next === shapeOf(d) ? d.appearance?.hollow : hollowAcross(d.appearance?.hollow, next) },
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
      const count = seatSides(resolveFootprint(withStoredParts(withParts))).length;
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
  // layer). Nothing is stored for it while it stays derived: its numbers still drive it. Drawn SOLID
  // — a hollow shape's outline is the outside of its band, and that is what is dragged and reshaped;
  // the band is drawn inside it (`band` below).
  const derived = (() => {
    if (custom || stretch) return null;
    const base = resolveFootprint({ ...draft, appearance: { shape, content, ...draft.appearance, parts: undefined, hollow: undefined } });
    const o = footprintOutlines(base)[0];
    return o ? { outline: o.outline, edgeCurves: padCurves(o.edgeCurves, o.outline.length) } : null;
  })();
  const canvasOutline = derived?.outline ?? outline;
  const canvasCurves = derived?.edgeCurves ?? curves;
  const canvasLocked = derived ? derived.outline.map(() => false) : lockedEdges;
  const canvasBounds = canvasOutline.length >= 3 ? customShapeBounds(canvasOutline, canvasCurves) : null;
  // Where the base shape's centre sits on the canvas — a STORED part's offset is measured from here.
  const anchor = canvasBounds ? { x: canvasBounds.cx, y: canvasBounds.cy } : { x: 0, y: 0 };
  /** The parts as the row stores them: relative to the base's centre (see "Where the parts live"). */
  const storedParts = (list: readonly ShapePart[]): ShapePart[] | undefined => (list.length ? list.map((p) => shifted(p, -anchor.x, -anchor.y)) : undefined);
  const withStoredParts = (p: Product): Product =>
    p.appearance?.parts?.length ? { ...p, appearance: { ...p.appearance, parts: storedParts(p.appearance.parts) } } : p;

  // ── Hollow: the band inside the outline ───────────────────────────────────────────────────────
  // The canvas edits the shape's OUTSIDE; the band (buildHollow) is cut inside it here, in the
  // canvas's own coordinates, and drawn under the outline the editor strokes — so a corner dragged
  // is the band re-cut in the same breath, and a hand-drawn outline is hollow the moment it closes.
  const hollowSpec = canHollow(shape) && !stretch ? draft.appearance?.hollow : undefined;
  const outerShown: BuiltOutline | null =
    canvasOutline.length >= 3 && (derived || mode === "edit") ? { outline: canvasOutline, edgeCurves: canvasCurves } : null;
  const band = hollowSpec && outerShown ? buildHollow(outerShown, hollowSpec) : null;
  // Its sides are numbered, and a hollow edit can add, drop or join them: the blocked ones go.
  const setHollow = (h: HollowSpec | undefined) =>
    setDraft((d) => {
      const next: Product = { ...d, appearance: { shape: shapeOf(d), content: contentOf(d), ...d.appearance, hollow: h, blockedSides: undefined } };
      return d.appearance?.hollow ? next : withSliceOpened(next, seated);
    });
  /** The base as the plan draws it — band or whole outline — and where its box's centre sits on the
   *  canvas: what its surface fills and its name is written in. */
  const baseDrawn: { footprint: Footprint; at: { x: number; y: number } } | null = !canvasBounds
    ? null
    : band
      ? (() => {
          const b = sampledBounds(band);
          return { footprint: piecesFootprint(band), at: { x: b.cx, y: b.cy } };
        })()
      : { footprint: { kind: "custom", outline: canvasOutline, edgeCurves: canvasCurves }, at: { x: canvasBounds.cx, y: canvasBounds.cy } };

  /** Wrap an edit so that grabbing a DERIVED shape first turns it into a hand-drawn one — seeded
   *  with the outline the designer is looking at, then the edit applied to it. The seed replaces the
   *  editor's state outright (no undo back into the numbers: from here the outline IS the shape).
   *  Blocked sides go with the numbers, as they do when מותאם is picked from the shape grid: they
   *  index the sides of a shape that is about to stop being that shape. */
  const free =
    <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A) => {
      if (derived) {
        ed.reset({ outline: derived.outline, edgeCurves: derived.edgeCurves });
        ed.setSelected(selected);
        setAppearance({ shape: "custom", blockedSides: undefined });
      }
      fn(...a);
    };

  // ── Closing a drawn outline ─────────────────────────────────────────────────────────────────
  // Sides were held to 45° steps while drawing; the close squares what is nearly square (the closing
  // side is the one the designer never drew) and refuses a self-crossing outline, saying why.
  const closeDrawn = (editor: typeof ed) => {
    const why = closeRefusal(editor.outline);
    if (why) showHint(why);
    else editor.closeOutline();
  };

  // ── Sides nobody sits at follow the corners ─────────────────────────────────────────────────
  // blockedSides index the outline's sides; a corner added or removed renumbers them (lib/studio/
  // use-outline-editor.ts). Not while a derived shape is being freed — `free` has just dropped them.
  const reblock = (next: number[]) => setAppearance({ blockedSides: next.length ? next : undefined });
  // A hollow outline's open sides and its entrance's side are side numbers too, and follow the same
  // way — derived or not, since freeing a derived shape hands over the very outline they were chosen
  // on (and keeps its hollow spec). A side split in two stays open on both halves; two sides joined
  // into one are new geometry nobody opened, and an entrance on either goes back to the default side.
  const hollowNow = draft.appearance?.hollow;
  const rehollow = (open: (ix: number[]) => number[], side: (g: number) => number | undefined) => {
    if (!hollowNow || (!hollowNow.openSides?.length && hollowNow.gapSide === undefined)) return;
    const next = hollowNow.openSides?.length ? open(hollowNow.openSides) : [];
    const gapSide = hollowNow.gapSide === undefined ? undefined : side(hollowNow.gapSide);
    setAppearance({ hollow: { ...hollowNow, openSides: next.length ? next : undefined, gapSide } });
  };
  const sideAfterRemove = (g: number, k: number, n: number) => (n <= 3 ? g : g === k || g === (k - 1 + n) % n ? undefined : g < k ? g : g - 1);
  const insertVertexReblocking = (edgeIdx: number) => {
    ed.insertVertexOnWall(edgeIdx);
    if (!derived && blocked.length) reblock(sideIndicesAfterInsert(blocked, edgeIdx));
    rehollow((ix) => sideIndicesAfterInsert(ix, edgeIdx), (g) => (g > edgeIdx ? g + 1 : g));
  };
  const removeVertexReblocking = (idx: number) => {
    ed.removeVertex(idx);
    if (!derived && blocked.length) reblock(sideIndicesAfterRemove(blocked, idx, canvasOutline.length));
    rehollow((ix) => sideIndicesAfterRemove(ix, idx, canvasOutline.length), (g) => sideAfterRemove(g, idx, canvasOutline.length));
  };
  const removeSelectionReblocking = (refs: SelectedRef[]) => {
    ed.removeSelection(refs);
    // Highest corner first, the way the editor takes them out, so each index is read against the
    // outline as it stands at that step.
    const corners = refs.filter((r) => r.kind === "vertex").map((r) => Number(r.id)).sort((a, b) => b - a);
    const walk = <T,>(start: T, step: (v: T, k: number, n: number) => T): T => {
      let v = start;
      let n = canvasOutline.length;
      for (const k of corners) {
        if (n <= 3) break;
        v = step(v, k, n);
        n -= 1;
      }
      return v;
    };
    rehollow(
      (ix) => walk(ix, sideIndicesAfterRemove),
      (g) => walk<number | undefined>(g, (v, k, n) => (v === undefined ? undefined : sideAfterRemove(v, k, n))),
    );
    if (derived || !blocked.length) return;
    reblock(walk(blocked, sideIndicesAfterRemove));
  };

  // ── Parts on the canvas ─────────────────────────────────────────────────────────────────────
  const patchPart = (id: string, p: Partial<ShapePart>) => setParts(parts.map((x) => (x.id === id ? patchedPart(x, p) : x)));
  const removePart = (id: string) => {
    setParts(parts.filter((x) => x.id !== id));
    setSelectedPart(null);
  };
  const placePart = (shapeId: Exclude<ShapePart["shape"], "custom">, at: { x: number; y: number }) => {
    const part = newPart(shapeId, at);
    setParts([...parts, part]);
    setSelectedPart(part.id);
    setSelected([]);
    setArmedShape(null);
  };
  // The hall plan's feature layer draws and drives the parts: each one handed over as a feature at
  // its place on the canvas, and every gesture on it mapped back to the part.
  const partFeatures: StructureFeature[] = parts.filter((p) => p.id !== drawingPart?.id).map((p) => {
    const round = usesDiameter(p.shape);
    // A hand-drawn part's box is its outline's; the feature layer stretches the outline to it.
    const ob = p.shape === "custom" && p.outline && p.outline.length >= 3 ? customShapeBounds(p.outline, p.edgeCurves) : null;
    const w = (ob ? ob.w : round ? (roundSizeMm(p.shape, p) ?? 0) / (p.shape === "quarter-circle" ? 2 : 1) : p.widthMm) || 600;
    return {
      id: p.id,
      kind: "other",
      label: "",
      x: p.x,
      y: p.y,
      widthMm: w,
      depthMm: ob ? ob.h || 600 : round ? w : p.depthMm || 600,
      heightMm: 0,
      shape: p.shape,
      ...(ob ? { outline: p.outline, ...(p.edgeCurves ? { edgeCurves: p.edgeCurves } : {}) } : {}),
      ...(p.arc ? { arc: p.arc } : {}),
      ...(p.ring ? { ring: p.ring } : {}),
      rotationDeg: p.rotation || 0,
      // Solid, like the base shape — the feature layer's default dash says "built into the room".
      // A shape with a surface of its own shows it (drawn under this one) through a clear fill, and
      // so does a hollow one its band: the feature here is the shape's outside, solid.
      style: {
        ...draft.appearance?.style,
        dash: draft.appearance?.style?.dash ?? "solid",
        ...(hasSurface(p) || (p.hollow && canHollow(p.shape)) ? { fillOpacity: 0 } : {}),
      },
    };
  });
  const selectedPartRow = parts.find((p) => p.id === selectedPart) ?? null;

  // ── An added shape drawn by hand ─────────────────────────────────────────────────────────────
  // A new one starts from an empty canvas in drawing mode; an existing one (of any shape) is handed
  // to the editor as the outline it is drawn as right now, turned and placed, so redrawing starts
  // from exactly what was there. Finishing writes it back as a "custom" part: the outline, its box's
  // centre as the part's place, no turn (the turn is in the points now).
  const startDrawingPart = (part?: ShapePart) => {
    setSelected([]);
    setArmedShape(null);
    if (part) {
      // The part's x/y are its place on the canvas here, so the placed outline IS the canvas outline.
      const o = placedPartOutline(part);
      partEd.reset({
        mode: "edit",
        outline: o.outline.map((v) => ({ x: v.x, y: v.y })),
        edgeCurves: padCurves(o.edgeCurves, o.outline.length),
      });
      setDrawingPart({ id: part.id, isNew: false });
    } else {
      partEd.reset({ mode: "draw", outline: [] });
      setDrawingPart({ id: crypto.randomUUID(), isNew: true });
    }
    setSelectedPart(null);
  };
  /** The parts with the shape being drawn written in — or as they are, if it is not a closed shape. */
  const partsWithDrawing = (): ShapePart[] => {
    if (!drawingPart || partEd.mode !== "edit" || partEd.outline.length < 3) return parts;
    const b = customShapeBounds(partEd.outline, partEd.edgeCurves);
    const drawn = {
      shape: "custom" as const,
      outline: partEd.outline.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y) })),
      edgeCurves: padCurves(partEd.edgeCurves, partEd.outline.length),
      x: Math.round(b.cx),
      y: Math.round(b.cy),
      rotation: 0,
      widthMm: Math.round(b.w),
      depthMm: Math.round(b.h),
      diameterMm: undefined,
      arc: undefined,
      ring: undefined,
    };
    const old = parts.find((p) => p.id === drawingPart.id);
    if (!old) return [...parts, { id: drawingPart.id, ...drawn }];
    // A hollow part redrawn stays hollow — the redraw started from the outside of its band
    // (placedPartOutline) — but its open sides are corner-numbered: with corners added or taken
    // away they would open other sides, so only the band and the entrance come across.
    const sameSides = old.hollow && placedPartOutline(old).outline.length === partEd.outline.length;
    const hollow = old.hollow && !sameSides ? hollowAcross(old.hollow, "custom") : old.hollow;
    return parts.map((p) => (p.id === old.id ? { ...old, ...drawn, hollow } : p));
  };
  const finishDrawingPart = () => {
    if (!drawingPart) return;
    const id = drawingPart.id;
    const next = partsWithDrawing();
    setDrawingPart(null);
    if (next !== parts) {
      setParts(next);
      setSelectedPart(id);
    } else if (!drawingPart.isNew) setSelectedPart(id);
  };
  const cancelDrawingPart = () => {
    const id = drawingPart && !drawingPart.isNew ? drawingPart.id : null;
    setDrawingPart(null);
    setSelectedPart(id);
  };


  // ── Guides while a part is dragged or resized ────────────────────────────────────────────────
  // The canvas's own alignment pull (the same one the studio's sketch uses), fed the base shape's
  // box and every OTHER part's — itself excluded, or it would align to where it already is. The base
  // outline's corners are the canvas's own references already.
  const partBox = (p: ShapePart) => {
    const b = footprintBounds(shapeFootprint(p.shape, p));
    return { x: p.x, y: p.y, ...turnedBox(b.w, b.h, p.rotation || 0) };
  };
  const snapOpts = (id: string, self?: { widthMm: number; depthMm: number }): HostSnapOptions => ({
    boxes: [
      ...(canvasBounds ? [{ x: canvasBounds.cx, y: canvasBounds.cy, widthMm: canvasBounds.w, depthMm: canvasBounds.h }] : []),
      ...parts.filter((x) => x.id !== id).map(partBox),
    ],
    ...(self ? { self } : {}),
  });
  const straight = (deg: number) => Math.abs(((deg % 180) + 180) % 180) < 0.01;

  // ── Keyboard: Escape, delete, copy, paste, duplicate ────────────────────────────────────────
  /** A copy a step off the original. `from` is a part at its place on the canvas. */
  const paste = (from: ShapePart) => {
    const part = { ...from, id: crypto.randomUUID(), x: from.x + PASTE_STEP_MM, y: from.y + PASTE_STEP_MM };
    setParts([...parts, part]);
    setSelectedPart(part.id);
    setSelected([]);
    return part;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget();
      if (e.key === "Escape") {
        // ESCAPE NEVER CLOSES THIS MODAL — it steps back one level. The editor closes through its ✕,
        // ביטול or the save alone; a drawing session lost to a reflex Esc is the bug this replaces.
        // A field keeps its own Escape. The canvas has already taken the presses that are its (a
        // tape put down, a half-drawn outline thrown away) and marked them handled — its listener is
        // on the window ahead of this one. Then, in order: a selected added shape; the shape being
        // drawn by hand (its selection, then the drawing itself — ביטול, as the bar's button); the
        // base's selection; an armed element. preventDefault is what keeps the <dialog>'s close
        // watcher from firing at all: a cancelled `cancel` event is honoured only once without user
        // activation, and Esc grants none — so the keydown is where it has to be stopped.
        if (!typing && !e.defaultPrevented) {
          if (selectedPart) setSelectedPart(null);
          else if (drawingPart) {
            if (partEd.selected.length) partEd.setSelected([]);
            else cancelDrawingPart();
          } else if (selected.length) setSelected([]);
          else if (armedShape) setArmedShape(null);
        }
        e.preventDefault();
        return;
      }
      if (typing) return;
      if (drawingPart) return; // the outline editor owns the keys while a shape is being drawn
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && (key === "c" || e.code === "KeyC") && selectedPartRow) {
        e.preventDefault();
        // Kept relative to the base, as the row stores it: the copy outlives this modal, and the
        // next product's base stands wherever its own outline was drawn.
        copiedPart = shifted(selectedPartRow, -anchor.x, -anchor.y);
      } else if (mod && (key === "v" || e.code === "KeyV") && copiedPart) {
        e.preventDefault();
        // Each paste steps on from the last one, so three pastes are three shapes, not one on top of two.
        copiedPart = shifted(paste(shifted(copiedPart, anchor.x, anchor.y)), -anchor.x, -anchor.y);
      } else if (mod && (key === "d" || e.code === "KeyD") && selectedPartRow) {
        e.preventDefault();
        paste(selectedPartRow);
      } else if (!mod && selectedPart && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removePart(selectedPart);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const stopThenClose = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onClose();
  };
  // A `cancel` reaches the <dialog> only when an Escape got past every keydown handler without
  // preventDefault (the window handler above always calls it — this is the belt under it), or from
  // a route that is no key at all. Either way the editor stays open, edits and all.
  const refuseCancel = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // What the canvas draws: the local draft, with the outline the editor is holding right now, so a
  // vertex dragged on the canvas is a fill and a stroke in the same breath — and its parts relative
  // to the base again, which is how every resolver reads them.
  const preview: Product = withStoredParts(
    custom ? { ...draft, appearance: { shape: "custom", content, ...draft.appearance, outline, edgeCurves: curves } } : draft,
  );
  // Drawn as its category's picture (a candelabrum, a sofa) rather than outline + content?
  const previewSymbol = stretch ? null : symbolOf(preview, resolveFootprint(preview));

  // Where the item's footprint is centred on this canvas. It is centred on the box of ALL its shapes;
  // the base's own pieces — one outline, or a hollow base's several (BuiltOutline.of) — are drawn at
  // `baseDrawn` here, which ties the one frame to the other.
  const itemFootprint = !stretch && canvasBounds ? resolveFootprint(preview) : null;
  const itemAt = (() => {
    if (!itemFootprint || !baseDrawn) return null;
    const pieces = footprintOutlines(itemFootprint);
    const own = itemFootprint.kind === "multi" ? pieces.filter((p, i) => pieceOf(p, i) === 0) : pieces;
    if (!own.length) return null;
    const c = sampledBounds(own);
    return { x: baseDrawn.at.x - c.cx, y: baseDrawn.at.y - c.cy };
  })();
  // The chairs, drawn on the canvas itself (tables only) — the same ring the plan will draw, so a
  // blocked side is seen emptying where the designer is looking, not in a thumbnail off to the side.
  const chairs =
    seated && itemFootprint && itemAt && seatCount > 0 ? { at: itemAt, seats: seatsAround(itemFootprint, seatCount, undefined, blocked) } : null;

  // Which measurements this shape is made of — see the drawer's note: the shape is asked first and
  // the fields follow from it, so a diameter can never sit unread under a מלבן.
  const asksDiameter = !stretch && usesDiameter(shape);
  const asksBox = !stretch && !custom && !usesDiameter(shape);
  const missing =
    (custom && outline.length < 3) ||
    (asksDiameter && !roundSizeMm(shape, draft.dimensions)) ||
    (asksBox && (!draft.dimensions.widthMm || !draft.dimensions.depthMm));

  const drawHint =
    outline.length === 0 ? "לחצו על הקנבס כדי לצייר את הצורה"
    : outline.length < 3 ? "הצלעות נצמדות לזוויות של 45° · Alt לשחרור · הקלידו מספר לאורך מדויק בס״מ"
    : "Enter או לחיצה על הנקודה הראשונה לסגירת הצורה · הקלידו מספר לאורך בס״מ · Esc לניקוי";

  return (
    // `close`/`cancel` don't bubble in the DOM, but React dispatches them up the FIBER tree anyway —
    // and this modal is rendered INSIDE the product drawer's <dialog>. Without stopPropagation,
    // saving or cancelling ran the drawer's onClose too: the drawer shut and the item being added
    // was thrown away, shape and all.
    <dialog
      ref={ref}
      onClose={stopThenClose}
      onCancel={refuseCancel}
      className="modal m-auto max-h-none rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog"
    >
      <div className="flex h-[80vh] w-[88vw] max-w-5xl flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <span className="text-sm font-semibold text-ink">מראה על התוכנית</span>
          {drawingPart && (
            <span className="text-xs text-muted">
              {partEd.mode === "draw"
                ? partEd.outline.length === 0
                  ? "לחצו על הקנבס כדי לצייר את הצורה הנוספת"
                  : "Enter או לחיצה על הנקודה הראשונה לסגירת הצורה · 45° מהצלע הראשונה, Alt לשחרור · אורך בס״מ · Esc לביטול"
                : "גררו נקודה או צלע להזזה · ידית האמצע מעקמת צלע · ״סיום״ כשהצורה מוכנה · Esc לביטול"}
            </span>
          )}
          {derived && !drawingPart && (
            <span className="hidden text-xs text-muted lg:inline">
              גררו נקודה או קצה כדי לעצב את הצורה בחופשיות · הוסיפו צורות מ״אלמנט״ · Ctrl+C / Ctrl+V להעתקת צורה
            </span>
          )}
          {custom && !drawingPart && (
            <>
              {mode === "draw" ? (
                <span className="text-xs text-muted">{drawHint}</span>
              ) : (
                <span className="hidden text-xs text-muted lg:inline">
                  גררו נקודה או צלע להזזה · ידית האמצע מעקמת צלע · בחרו צלע לעריכת אורך/זווית/עיקום · רווח לגרירת התצוגה
                </span>
              )}
              {mode === "draw" && outline.length >= 3 && (
                <Button type="button" variant="ghost" onClick={() => closeDrawn(ed)}>
                  סגירת הצורה
                </Button>
              )}
              <Button type="button" variant="ghost" className="ms-auto" disabled={outline.length === 0} onClick={clearShape}>
                <Trash2 className="h-4 w-4" strokeWidth={2} />
                ניקוי
              </Button>
            </>
          )}
          {/* After ניקוי, which already takes the far edge when it is there. */}
          <CloseButton className={custom ? "" : "ms-auto"} onClick={onClose} />
        </header>

        <div className="flex min-h-0 flex-1">
          {/* The canvas, for the one shape that owns an outline — and for every other shape, what
              the canvas would be showing anyway: the thing that will actually be drawn. */}
          <div className="relative min-h-0 flex-1 bg-canvas">
            {/* Why something was refused (an outline that crosses itself), for a moment, over the
                canvas — the studio's own hint line. */}
            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center" aria-live="polite">
              {hint && <span className="rounded-md bg-ink px-3 py-1.5 text-sm text-canvas shadow-dialog">{hint}</span>}
            </div>
            {custom || derived ? (
              <>
                <PlanCanvas
                  // A footprint is a cm-scale thing: typed and shown in centimetres. Drawn sides are
                  // held to 45° steps from the FIRST side (the stage tool's rule), Alt frees.
                  lengthUnit="cm"
                  drawAngleStepDeg={45}
                  drawAngleFromFirstSide
                  {...(drawingPart
                    ? {
                        // The added shape being drawn owns the canvas's outline editor.
                        mode: partEd.mode,
                        outline: partEd.outline,
                        edgeCurves: partEd.edgeCurves,
                        lockedEdges: partEd.lockedEdges,
                        selected: partEd.selected,
                        onSelect: (r: SelectedRef | null) => partEd.setSelected(r ? [r] : []),
                        onToggleSelect: partEd.toggleSelected,
                        onSelectMany: partEd.selectMany,
                        onAddVertex: partEd.addVertex,
                        onCloseOutline: () => closeDrawn(partEd),
                        onCancelDraw: cancelDrawingPart,
                        onMoveVertex: partEd.moveVertex,
                        onMoveWall: partEd.moveWall,
                        onMoveWallHandle: partEd.moveWallHandle,
                        onMoveSelection: partEd.moveSelection,
                        onToggleWallLock: partEd.toggleWallLock,
                        cursor: "default",
                        onCanvasClick: () => {},
                        onCommit: partEd.commit,
                        canUndo: partEd.canUndo,
                        canRedo: partEd.canRedo,
                        onUndo: partEd.undo,
                        onRedo: partEd.redo,
                      }
                    : {
                        mode: derived ? "edit" : mode,
                        outline: canvasOutline,
                        edgeCurves: canvasCurves,
                        lockedEdges: canvasLocked,
                        // A hollow shape's open sides are guides: a slice's radii, a ח's open bottom.
                        openEdges: hollowSpec?.openSides,
                        selected,
                        onSelect: (r: SelectedRef | null) => {
                          setSelected(r ? [r] : []);
                          if (r) setSelectedPart(null);
                        },
                        onToggleSelect: ed.toggleSelected,
                        onSelectMany: ed.selectMany,
                        onAddVertex: ed.addVertex,
                        onCloseOutline: () => closeDrawn(ed),
                        onCancelDraw: clearShape,
                        onMoveVertex: free(ed.moveVertex),
                        onMoveWall: free(ed.moveWall),
                        onMoveWallHandle: free(ed.moveWallHandle),
                        onMoveSelection: free(ed.moveSelection),
                        onToggleWallLock: free(ed.toggleWallLock),
                        cursor: armedShape ? "crosshair" : "default",
                        onCanvasClick: (p: { x: number; y: number }) => {
                          if (armedShape) placePart(armedShape, p);
                          else setSelectedPart(null);
                        },
                        onCommit: ed.commit,
                        canUndo: ed.canUndo,
                        canRedo: ed.canRedo,
                        onUndo: ed.undo,
                        onRedo: ed.redo,
                      })}
                  onDropAt={(e, p) => {
                    const id = e.dataTransfer.getData("text/plain");
                    if (!drawingPart && isPartShape(id)) placePart(id, p);
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
                    <>
                      {chairs && (
                        <g transform={`translate(${chairs.at.x} ${chairs.at.y})`} className="pointer-events-none">
                          <SeatChairs seats={chairs.seats} />
                        </g>
                      )}
                      {/* A hollow shape's band, filled, inside the outline the canvas strokes — the
                          hole is the canvas showing through; a closed ring has no line across its band. */}
                      {band && (
                        <g className="pointer-events-none">
                          {band.map((p, i) => (
                            <OutlinePath
                              key={i}
                              outline={p.outline}
                              edgeCurves={p.edgeCurves}
                              fill={draft.appearance?.style?.fill ?? "var(--color-inset)"}
                              stroke="var(--color-ink-soft)"
                              strokeWidth={1.25}
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </g>
                      )}
                      {/* The main shape's surface, under its outline — the material or picture the
                          plan will fill it with, seen where it is being edited. A hollow one's band. */}
                      {baseDrawn && (
                        <g transform={`translate(${baseDrawn.at.x} ${baseDrawn.at.y})`} className="pointer-events-none">
                          <ItemSurface
                            appearance={{ texture: draft.appearance?.texture, textureImage: draft.appearance?.textureImage }}
                            footprint={baseDrawn.footprint}
                            color={itemColor}
                            seed={`${draft.id}-base`}
                          />
                        </g>
                      )}
                      {/* While an added shape is drawn by hand, the main shape is still there to draw
                          against — as a quiet outline, out of reach of the pointer. */}
                      {drawingPart && canvasBounds && (
                        <g transform={`translate(${canvasBounds.cx} ${canvasBounds.cy})`} className="pointer-events-none">
                          <FootprintShape
                            footprint={{ kind: "custom", outline: canvasOutline, edgeCurves: canvasCurves }}
                            fill="none"
                            stroke="var(--color-ink)"
                            strokeOpacity={0.45}
                            strokeWidth={2}
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      )}
                    </>
                  }
                  padMm={PRODUCT_FRAME.padMm}
                  minExtentMm={PRODUCT_FRAME.minExtentMm}
                  gridMm={PRODUCT_FRAME.gridMm}
                  // What the plan writes inside the outline, drawn on the outline itself. Without
                  // it, picking an icon changed nothing on the surface the designer is looking at.
                  overlay={(ctx) =>
                    canvasBounds && (
                      <>
                        {/* Each hollow added shape's band, under its (clear-filled) outline — the
                            feature layer drags and sizes the shape's outside, as the canvas does the
                            main shape's. */}
                        {parts.filter((p) => p.id !== drawingPart?.id && p.hollow && canHollow(p.shape)).map((p) => (
                          <g
                            key={`band-${p.id}`}
                            transform={`translate(${p.x} ${p.y})${p.rotation ? ` rotate(${p.rotation})` : ""}`}
                            className="pointer-events-none"
                          >
                            {shapePieces(p.shape, p).map((o, i) => (
                              <OutlinePath
                                key={i}
                                outline={o.outline}
                                edgeCurves={o.edgeCurves}
                                fill={draft.appearance?.style?.fill ?? "var(--color-inset)"}
                                stroke="var(--color-ink-soft)"
                                strokeWidth={1.25}
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
                          </g>
                        ))}
                        {/* Each added shape's own surface, under its (clear-filled) outline. */}
                        {parts.filter((p) => p.id !== drawingPart?.id && hasSurface(p)).map((p) => (
                          <g
                            key={p.id}
                            transform={`translate(${p.x} ${p.y})${p.rotation ? ` rotate(${p.rotation})` : ""}`}
                            className="pointer-events-none"
                          >
                            <ItemSurface appearance={{ texture: p.texture, textureImage: p.textureImage }} footprint={shapeFootprint(p.shape, p)} color={itemColor} seed={p.id} />
                          </g>
                        ))}
                        <StructureFeatures
                          structure={{ ...emptyStructure(), features: partFeatures }}
                          mm={ctx.mm}
                          clientToMm={ctx.clientToMm}
                          selectedIds={selectedPart ? [selectedPart] : []}
                          onSelect={drawingPart ? undefined : (id) => {
                            setSelectedPart(id);
                            setSelected([]);
                          }}
                          onMove={drawingPart ? undefined : (id, p) => {
                            const part = parts.find((x) => x.id === id);
                            if (!part) return;
                            const box = partBox(part);
                            const at = ctx.snap(p, snapOpts(id, { widthMm: box.widthMm, depthMm: box.depthMm }));
                            patchPart(id, { x: Math.round(at.x), y: Math.round(at.y) });
                          }}
                          onResize={drawingPart ? undefined : (id, r) => {
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
                              x: Math.round(x),
                              y: Math.round(y),
                            });
                          }}
                          onRotate={drawingPart ? undefined : (id, deg) => patchPart(id, { rotation: deg })}
                          onCommit={ctx.endSnap}
                        />
                        {/* What the plan writes inside the outline, drawn on the outline itself.
                            Without it, picking an icon changed nothing on the surface the designer
                            is looking at. The category's picture is drawn over the whole item, so it
                            stands where the item's footprint is centred (itemAt); a name or an icon
                            goes on the base as drawn, band and all. */}
                        <g
                          transform={
                            previewSymbol
                              ? `translate(${(itemAt ?? anchor).x} ${(itemAt ?? anchor).y})`
                              : `translate(${(baseDrawn?.at ?? anchor).x} ${(baseDrawn?.at ?? anchor).y})`
                          }
                          className="pointer-events-none text-ink-soft"
                        >
                          {/* At the outline's own label point, as the plan will write it — on the
                              band of an arc, not at the box centre the <g> above sits on. */}
                          {previewSymbol ? (
                            <ItemSymbol
                              kind={previewSymbol}
                              footprint={resolveFootprint(preview)}
                              count={symbolCount(preview, previewSymbol)}
                              flowers={
                                previewSymbol === "flowers" || previewSymbol === "centerpiece"
                                  ? flowerDrawSpecOf(preview, resolveFootprint(preview), preview.variants.find((v) => !v.archived && v.swatch)?.swatch ?? preview.appearance?.style?.fill)
                                  : undefined
                              }
                              tone={preview.variants.find((v) => !v.archived && v.swatch)?.swatch ?? preview.appearance?.style?.fill}
                              overhead={preview.layer === "ceiling"}
                              chairStyle={chairStyleOf(preview)}
                              drawStyle={drawStyleOf(preview)}
                              rise={climbRise(preview)}
                            />
                          ) : (
                            <PlanContent
                              content={resolveContent(preview)}
                              w={canvasBounds.w}
                              h={canvasBounds.h}
                              at={labelAnchor(baseDrawn?.footprint ?? { kind: "custom", outline: canvasOutline, edgeCurves: canvasCurves })}
                            />
                          )}
                        </g>
                      </>
                    )
                  }
                />
                {drawingPart && (
                  <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
                    <div className="pointer-events-auto flex max-w-full flex-col items-center gap-2">
                      {partEd.selected.length > 0 && (
                        <SelectionInspector
                          selected={partEd.selected}
                          outline={partEd.outline}
                          edgeCurves={partEd.edgeCurves}
                          lockedEdges={partEd.lockedEdges}
                          onRemoveVertex={partEd.removeVertex}
                          onRemoveSelection={partEd.removeSelection}
                          onInsertVertexOnWall={partEd.insertVertexOnWall}
                          onSetWallLength={partEd.setWallLength}
                          onSetWallAngle={partEd.setWallAngle}
                          onSetWallBulgeDepth={partEd.setWallBulgeDepth}
                          onToggleWallLock={partEd.toggleWallLock}
                          onClose={() => partEd.setSelected([])}
                          edgeNoun="צלע"
                          lengthUnit="cm"
                        />
                      )}
                      <Bar icon={PenLine} title={drawingPart.isNew ? "צורה חופשית חדשה" : "עריכת קווי הצורה"} facts={partEd.mode === "draw" ? "ציור" : "עריכה"}>
                        <BarButton icon={X} label="ביטול" onClick={cancelDrawingPart} />
                        <Button type="button" onClick={finishDrawingPart} disabled={partEd.mode !== "edit" || partEd.outline.length < 3}>
                          <Check className="h-4 w-4" strokeWidth={2} />
                          סיום
                        </Button>
                      </Bar>
                    </div>
                  </div>
                )}

                {selectedPartRow && !drawingPart && (
                  <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
                    <div className="pointer-events-auto max-w-full">
                      <PartBar
                        // Shown relative to the base, as the row stores it ("מיקום" reads so); a
                        // typed place comes back onto the canvas.
                        part={shifted(selectedPartRow, -anchor.x, -anchor.y)}
                        color={itemColor}
                        onRedraw={() => startDrawingPart(selectedPartRow)}
                        onChange={(p) => {
                          patchPart(selectedPartRow.id, {
                            ...p,
                            ...(p.x !== undefined ? { x: Math.round(p.x + anchor.x) } : {}),
                            ...(p.y !== undefined ? { y: Math.round(p.y + anchor.y) } : {}),
                          });
                          // The seat sides run base first, then each part's: a part's band re-cut
                          // renumbers them from there on.
                          if ("hollow" in p) setAppearance({ blockedSides: undefined });
                        }}
                        onDuplicate={() => paste(selectedPartRow)}
                        onRemove={() => removePart(selectedPartRow.id)}
                        onToFront={() => setParts([...parts.filter((x) => x.id !== selectedPartRow.id), selectedPartRow])}
                        onToBack={() => setParts([selectedPartRow, ...parts.filter((x) => x.id !== selectedPartRow.id)])}
                        onClose={() => setSelectedPart(null)}
                      />
                    </div>
                  </div>
                )}

                {selected.length > 0 && !selectedPartRow && !drawingPart && (
                  <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
                    <div className="pointer-events-auto">
                      <SelectionInspector
                        selected={selected}
                        outline={canvasOutline}
                        edgeCurves={canvasCurves}
                        lockedEdges={canvasLocked}
                        onRemoveVertex={free(removeVertexReblocking)}
                        onRemoveSelection={free(removeSelectionReblocking)}
                        onInsertVertexOnWall={free(insertVertexReblocking)}
                        onSetWallLength={free(ed.setWallLength)}
                        onSetWallAngle={free(ed.setWallAngle)}
                        onSetWallBulgeDepth={free(ed.setWallBulgeDepth)}
                        onToggleWallLock={free(ed.toggleWallLock)}
                        onClose={() => setSelected([])}
                        edgeNoun="צלע"
                        lengthUnit="cm"
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
            {!selectedPartRow && selected.length === 0 && !drawingPart && (
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
                    {shape === "circle" && !stretch && (
                      <Popover label="חלק מהעיגול" icon={ChartPie} value={sweepValue(draft.appearance?.arc)} panelClassName="w-72">
                        <CircleSweepFields
                          idPrefix="a-sweep"
                          sweepDeg={draft.appearance?.arc?.sweepDeg ?? 360}
                          onChange={(deg) =>
                            setDraft((d) =>
                              withSliceOpened(
                                {
                                  ...d,
                                  appearance: { shape: shapeOf(d), content: contentOf(d), ...d.appearance, arc: sweepPatch(deg), hollow: hollowAcross(d.appearance?.hollow, "circle"), blockedSides: undefined },
                                },
                                seated,
                              ),
                            )
                          }
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
                    {shape === "u-shape" && !stretch && (
                      <Popover
                        label="ח"
                        icon={Donut}
                        value={`דלפק ${mmToCm(uShapeBandOf(draft.dimensions.widthMm || DEFAULT_PRESET_MM.w, draft.dimensions.depthMm || DEFAULT_PRESET_MM.h, draft.appearance?.ring))}`}
                        panelClassName="w-72"
                      >
                        <CounterFields
                          idPrefix="a-counter"
                          widthMm={draft.dimensions.widthMm ?? 0}
                          depthMm={draft.dimensions.depthMm ?? 0}
                          ring={draft.appearance?.ring}
                          onChange={(ring) => setAppearance({ ring })}
                        />
                      </Popover>
                    )}
                    {/* Solid or a band round an open middle — every solid shape, a hand-drawn one
                        once it is closed. The sides offered are the outline's on the canvas. */}
                    {canHollow(shape) && !stretch && outerShown && canvasBounds && (
                      <Popover label="מילוי" icon={Donut} value={hollowValue(hollowSpec)} panelClassName="w-80">
                        <HollowFields
                          idPrefix="a-hollow"
                          outer={outerShown}
                          hollow={hollowSpec}
                          defaultBand={defaultHollowBand(canvasBounds.w, canvasBounds.h)}
                          onChange={setHollow}
                        />
                      </Popover>
                    )}
                    {(custom || derived) && (
                      <div className="ms-auto flex items-center gap-1">
                        <InspectorDivider />
                        <AddElementFlyout
                          open={elementsOpen}
                          onOpenChange={setElementsOpen}
                          items={PART_ITEMS}
                          sections={SHAPE_SECTIONS}
                          armedId={armedShape}
                          triggerLabel="אלמנט"
                          searchPlaceholder="חיפוש צורה..."
                          onPick={(id) => {
                            if (id === "custom") startDrawingPart();
                            else if (isPartShape(id)) setArmedShape((a) => (a === id ? null : id));
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

            {/* The category's own picture (lib/catalog/symbols.ts) — on by default, so a candlestick
                is drawn as one. Off gives back the outline with a name or an icon inside. */}
            {categoryHasSymbol(draft.category) && (
              <SwitchRow
                checked={draft.appearance?.symbol !== false}
                onChange={(on) => setAppearance({ symbol: on ? undefined : false })}
                label={`ציור כ${category?.label ?? "פריט"}`}
                hint={
                  draft.appearance?.symbol === false
                    ? "כבוי — הפריט מצויר כצורה עם שם או אייקון."
                    : previewSymbol
                      ? "הפריט מצויר על התוכנית לפי הקטגוריה שלו, במידות ובגוון שלו."
                      : "הציור חל על עיגול, אליפסה או מלבן — לצורה הזו מוצג תוכן במקומו."
                }
              />
            )}

            {!previewSymbol && (
            <Segmented
              label="תוכן"
              value={content}
              options={CONTENT_OPTIONS}
              onChange={(c) => {
                setAppearance({ content: c });
                setPickingIcon(c === "icon");
              }}
            />
            )}

            {!previewSymbol && content === "icon" &&
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

            {/* Which chair it is — a Chiavari and a ghost chair are both "a chair" to the category. */}
            {draft.category === "chairs" && previewSymbol && (
              <div>
                <span className={fieldLabelClassName}>סוג הכיסא</span>
                <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="סוג הכיסא">
                  {CHAIR_STYLES.map((st) => {
                    const on = (chairStyleOf(preview) ?? "dining") === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={CHAIR_STYLE_LABEL[st]}
                        onClick={() => setAppearance({ symbolStyle: st === "dining" ? undefined : st })}
                        className={
                          "flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " +
                          (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line")
                        }
                      >
                        <svg viewBox="-330 -330 660 660" className="h-9 w-9" aria-hidden>
                          <ItemSymbol
                            kind="chair"
                            footprint={st === "stool" ? { kind: "circle", diameterMm: 440 } : st === "bench" ? { kind: "rect", widthMm: 620, depthMm: 260 } : { kind: "rect", widthMm: st === "armchair" ? 560 : 440, depthMm: st === "armchair" ? 560 : 460 }}
                            count={1}
                            chairStyle={st}
                          />
                        </svg>
                        <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{CHAIR_STYLE_LABEL[st]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Which candle piece it is — a ring of arms, a planar row, crystal tiers, a solitaire
                cluster, floating candles, a fire trough… (CandleStyle). Each tile draws THIS row's
                count of candles in that style; "אוטומטי" is what it drew before there was a choice. */}
            {draft.category === "candlesticks" && previewSymbol && (
              <div>
                <span className={fieldLabelClassName}>סוג הפמוט</span>
                <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="סוג הפמוט">
                  {[undefined, ...CANDLE_STYLES].map((st) => {
                    const chosen = drawStyleOf(preview);
                    const on = st === chosen;
                    const n = symbolCount(preview, "candlestick");
                    const own = footprintBounds(resolveFootprint(preview));
                    const f: Footprint =
                      st === undefined
                        ? resolveFootprint(preview)
                        : st === "fire"
                          ? { kind: "rect", widthMm: 640, depthMm: 180 }
                          : st === "row"
                            ? { kind: "rect", widthMm: 520, depthMm: 200 }
                            : { kind: "circle", diameterMm: 420 };
                    const b = st === undefined ? own : footprintBounds(f);
                    const pad = Math.max(b.w, b.h) * 0.08;
                    return (
                      <button
                        key={st ?? "auto"}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={st ? CANDLE_STYLE_HINT[st] : "לפי הצורה: פריט ארוך — נרות בשורה, אחרת קנים במעגל"}
                        onClick={() => setAppearance({ symbolStyle: st })}
                        className={
                          "flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " +
                          (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line")
                        }
                      >
                        <svg viewBox={`${-b.w / 2 - pad} ${-b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className="h-9 w-full" aria-hidden>
                          <ItemSymbol
                            kind="candlestick"
                            footprint={f}
                            count={st === "tiered" ? Math.max(n, 13) : st === "lantern" ? 1 : n}
                            tone={preview.variants.find((v) => !v.archived && v.swatch)?.swatch ?? preview.appearance?.style?.fill}
                            drawStyle={st}
                          />
                        </svg>
                        <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{st ? CANDLE_STYLE_LABEL[st] : "אוטומטי"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Which version of the picture — a chuppah's colonnade, a chandelier's crystal tiers,
                a corner sofa, a palm, a gate's round entrance… (SYMBOL_STYLES). */}
            {previewSymbol && SYMBOL_STYLES[previewSymbol] && (
              <StyleTiles kind={previewSymbol} product={preview} onPick={(symbolStyle) => setAppearance({ symbolStyle })} />
            )}

            {/* Which form an arrangement takes — a dome, a low cushion, a wild garden, a cascade, a
                runner, bud vases (lib/catalog/flower-draw.ts). Absent = by its height: a 25cm one is
                a cushion, a taller one a dome, a strip a runner. The flowers in each tile are the
                row's own spec in its first shade, so the tiles show THIS arrangement six ways. */}
            {(draft.category === "flower-arrangements" || draft.category === "centerpieces") && previewSymbol && (
              <div>
                <span className={fieldLabelClassName}>צורת הסידור</span>
                <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="צורת הסידור">
                  {[undefined, ...FLOWER_FORMS].map((form) => {
                    const chosen = preview.appearance?.symbolStyle;
                    const on = form === undefined ? !isFlowerForm(chosen) : chosen === form;
                    const f = resolveFootprint(preview);
                    const b = footprintBounds(f);
                    const shown = form ?? defaultFlowerForm(preview.dimensions.heightMm, b.w, b.h);
                    const wide = shown === "runner";
                    const spec: FlowerDrawSpec = {
                      form: shown,
                      w: wide ? 1600 : 600,
                      h: wide ? 360 : 600,
                      lines: drawLinesOf(preview),
                      shade: preview.variants.find((v) => !v.archived && v.swatch)?.swatch ?? preview.appearance?.style?.fill,
                      seed: 11,
                    };
                    return (
                      <button
                        key={form ?? "auto"}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={form ? FLOWER_FORM_HINT[form] : "לפי גובה הסידור"}
                        onClick={() => setAppearance({ symbolStyle: form })}
                        className={
                          "flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " +
                          (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line")
                        }
                      >
                        <svg viewBox={wide ? "-840 -340 1680 680" : "-340 -340 680 680"} className="h-10 w-full" aria-hidden>
                          <FlowerDrawing spec={spec} />
                        </svg>
                        <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{form ? FLOWER_FORM_LABEL[form] : `אוטומטי (${FLOWER_FORM_LABEL[shown]})`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* What it is made of — the venue floors' textures, timber and marble, or a picture of the
                designer's own — as its fill on the plan and in its catalog picture. The MAIN shape's;
                each added shape picks its own on its bar. Not offered where the picture is its own fill. */}
            {!previewSymbol && category?.anchor !== "wall" && (
              <>
                <SurfacePicker
                  idPrefix="a-surface"
                  label={parts.length ? "טקסטורה — צורה ראשית" : "טקסטורה"}
                  value={{ texture: draft.appearance?.texture, textureImage: draft.appearance?.textureImage }}
                  color={draft.appearance?.style?.fill}
                  onChange={(sf: Surface) => setAppearance({ texture: sf.texture, textureImage: sf.textureImage })}
                />
                {parts.length > 0 && <p className="text-xs text-muted">לכל צורה נוספת טקסטורה משלה — בחרו אותה וראו ״טקסטורה״ בסרגל שלה.</p>}
              </>
            )}

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
                appearance: {
                  ...(custom
                    ? { shape: "custom" as const, content, ...draft.appearance, outline, edgeCurves: padCurves(curves, outline.length) }
                    : { content, ...draft.appearance, shape }),
                  // Relative to the base again — the editor held them at their place on the canvas.
                  parts: storedParts(drawingPart ? partsWithDrawing() : parts),
                },
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
