"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignCenterVertical,
  Armchair,
  BringToFront,
  ChartPie,
  Check,
  Copy,
  CopyPlus,
  Donut,
  DraftingCompass,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  Lock,
  LockOpen,
  Move,
  Paintbrush,
  PenLine,
  Plus,
  Rainbow,
  Route,
  Ruler,
  SendToBack,
  Shapes,
  Sparkles,
  Spline,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type { ArcSpec, HollowSpec, MapAppearance, MapShape, Product, RingSpec, ShapePart } from "@/lib/catalog/types";
import { ARC_SWEEP, MAP_SHAPES, PICKER_SHAPES, RING_GAP, ROUND_FIELD, SHAPE_LABEL, canHollow, usesDiameter } from "@/lib/catalog/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { drawnBounds, flipShapes, lookOf, shapesOf, type FlipAxis } from "@/lib/catalog/shape-list";
import type { EdgeCurve } from "@/lib/studio/hall";
import {
  arcSpecOf,
  customShapeBounds,
  defaultHollowBand,
  footprintBounds,
  hollowGapSide,
  hollowOuter,
  hollowSideNames,
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
import { bulgeDepthMm, maxBulgeDepthMm, wallAngleDeg, wallLengthMm } from "@/lib/studio/geometry";
import { alignedCentres, alignGuide, needsThree, type AlignOp } from "@/lib/studio/align";
import { useHistory } from "@/lib/studio/use-history";
import { hitsInBox, mergeSelection } from "@/lib/venues/selection";
import { Select } from "@/components/select";
import { TagToggle } from "@/components/tag-toggle";
import { seatSides, seatsAround } from "@/lib/studio/seating";
import { FootprintShape, OutlinePath } from "@/components/footprint-shape";
import { SeatChairs, SeatSidesPicker } from "@/components/seat-sides-picker";
import { Actions, Bar, BarButton, Note, PanelRow, Rotation, ltr } from "@/components/inspector-bar";
import { Popover } from "@/components/popover";
import { Menu, type MenuItem } from "@/components/menu";
import { StructureFeatures } from "@/components/venue-plan";
import { emptyStructure, type StructureFeature } from "@/lib/venues/structure";
import { PlanCanvas, type ContextMenuItem, type HostSnapOptions, type MarqueeMode } from "@/components/plan-canvas";
import { closeRefusal, useOutlineEditor, type SelectedRef } from "@/lib/studio/use-outline-editor";
import { isShortcut, isTypingTarget } from "@/lib/keyboard";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { Segmented } from "@/components/segmented";
import { StyleFields } from "@/components/style-fields";
import { fieldLabelClassName } from "@/components/control";
import { AppearancePreview, PlanContent } from "./appearance-preview";
import { labelAnchor } from "@/lib/studio/label-anchor";
import { IconPicker } from "./icon-picker";
import { CloseButton } from "@/components/close-button";
import { SwitchRow } from "@/components/toggle";
import { ItemSurface } from "@/components/surface-fill";
import { hasSurface } from "@/lib/catalog/textures";
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
import { AlignMenu, alignItems, type AlignPanel } from "../studio/align-menu";

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

const DEFAULT_PRESET_MM = { w: 1600, h: 900 };


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

// ── The shapes drawer ──────────────────────────────────────────────────────────────────────────
//
// The studio's layout (catalog rail | canvas | the selection's bar at the foot of it): every shape
// the app knows as a card — dragged onto the canvas, or clicked and then placed with a click — and
// "draw it yourself" at the top of the drawer. No shape is the "main" one: each is a thing ON the
// canvas, moved, turned and resized by the hall plan's own feature layer (StructureFeatures — the
// same handles, not a look-alike), and the row stores the first of them as its base
// (lib/catalog/shape-list.ts).

/** A card's picture: the shape itself, at a neutral proportion. */
function ShapeCard({ shape }: { shape: Exclude<MapShape, "custom"> }) {
  const f = shapeFootprint(shape, { widthMm: 1600, depthMm: shape === "line" ? 60 : 1000, diameterMm: 1600 });
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
// a rectangle and a capsule made hollow on the shape's bar.
type RailShape = Exclude<MapShape, "custom">;
const RAIL_SHAPES = PICKER_SHAPES.filter((s): s is RailShape => s !== "custom");
const isRailShape = (id: string): id is RailShape => (RAIL_SHAPES as readonly string[]).includes(id);

function ShapeRail({ armed, drawing, onArm, onDraw }: { armed: RailShape | null; drawing: boolean; onArm: (s: RailShape | null) => void; onDraw: () => void }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-e border-border bg-surface">
      <div className="scroll-slim flex-1 overflow-y-auto p-3">
        <button
          type="button"
          onClick={onDraw}
          aria-pressed={drawing}
          className={
            "flex w-full items-center gap-3 rounded-md border p-2 text-start transition-colors " +
            (drawing ? "border-accent bg-accent-tint" : "border-border hover:border-accent-line hover:bg-inset")
          }
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-inset">
            <PenLine className="h-4 w-4 text-accent" strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">ציור חופשי</span>
            <span className="block text-xs text-muted">נקודה אחר נקודה</span>
          </span>
        </button>
        <p className="mb-1.5 mt-4 text-xs font-semibold text-muted">צורות</p>
        <div className="grid grid-cols-3 gap-1.5">
          {RAIL_SHAPES.map((s) => (
            <button
              key={s}
              type="button"
              draggable
              aria-pressed={armed === s}
              title={SHAPE_LABEL[s]}
              onClick={() => onArm(armed === s ? null : s)}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", s);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-center text-[10px] font-semibold leading-tight transition-colors ${
                armed === s ? "border-accent bg-accent-tint text-accent" : "border-border text-ink hover:border-accent-line hover:bg-inset"
              }`}
            >
              <ShapeCard shape={s} />
              <span className="line-clamp-2 w-full">{SHAPE_LABEL[s]}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted">
        {armed
          ? `לחצו על הקנבס כדי להניח ${SHAPE_LABEL[armed]} · Esc לביטול`
          : "גררו צורה אל הקנבס, או לחצו עליה ואז על הקנבס. לחיצה כפולה על צורה — עריכת הקווים שלה."}
      </p>
    </aside>
  );
}

/** A hand-drawn shape's outline stretched to a new box about its own centre — what its resize handles
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

/** A shape as the patch would leave it: a hand-drawn one whose size is changed is RESCALED, since its
 *  outline — not its two numbers — is what draws it. */
function patchedPart(part: ShapePart, p: Partial<ShapePart>): ShapePart {
  const next = { ...part, ...p };
  if (part.shape === "custom" && !p.outline && (p.widthMm !== undefined || p.depthMm !== undefined)) {
    return { ...next, ...rescaleCustomPart(part, p.widthMm ?? part.widthMm ?? 0, p.depthMm ?? part.depthMm ?? 0) };
  }
  return next;
}

/** A shape turned into another kind, at the size it already stands at: a 120×60 rectangle becomes a
 *  120×60 ellipse, a ⌀90 circle a 90×90 rectangle. Its band comes across (hollowAcross); a sweep, a
 *  ring and anything else that only one kind reads is the new kind's default. */
function reshaped(part: ShapePart, next: RailShape): ShapePart {
  const b = sampledBounds([hollowOuter(part.shape, part)]);
  const w = Math.round(b.w) || 1200;
  const h = Math.round(b.h) || 600;
  return {
    ...part,
    shape: next,
    ...(usesDiameter(next)
      ? { diameterMm: (next === "quarter-circle" ? 2 : 1) * Math.max(w, h) }
      : next === "line"
        ? { widthMm: Math.max(w, h), depthMm: LINE_MM }
        : { widthMm: w, depthMm: h }),
    arc: undefined,
    ring: undefined,
    hollow: hollowAcross(part.hollow, next),
    open: undefined,
  };
}

/** A line's thickness when nothing says otherwise — a rope, a cable, a rail. */
const LINE_MM = 20;

/** A drawing that is one straight line — two points, or more all on it, no side bowed — as a "line"
 *  shape: its two farthest points are its ends. Null for anything with a width to it. */
function straightLine(points: readonly { x: number; y: number }[], curves?: readonly unknown[]) {
  if (points.length < 2 || curves?.some(Boolean)) return null;
  let [a, b] = [points[0], points[1]];
  for (const p of points) for (const q of points) if (Math.hypot(q.x - p.x, q.y - p.y) > Math.hypot(b.x - a.x, b.y - a.y)) [a, b] = [p, q];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 10) return null;
  if (points.some((p) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len > 5)) return null;
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), widthMm: Math.round(len), rotation: Math.round((((deg % 180) + 180) % 180) * 10) / 10 };
}

/** A new shape's starting size — something a designer can see at the size a catalog item is, and
 *  then drag to what it really is. */
function newPart(shape: RailShape, at: { x: number; y: number }): ShapePart {
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
            : shape === "line"
              ? { widthMm: 2000, depthMm: LINE_MM }
              : { widthMm: 1200, depthMm: 600 }),
    x: Math.round(at.x),
    y: Math.round(at.y),
    rotation: 0,
  };
}

/** The copied shapes, relative to the first shape of the item they were copied from. Module scope on
 *  purpose: it outlives the modal, so a round end copied off one bar pastes onto the next bar too. */
let copiedShapes: ShapePart[] = [];
const PASTE_STEP_MM = 300;
/** One arrow press, in mm — Shift for a bigger step. A footprint is a cm-scale thing. */
const NUDGE_MM = 10;
const NUDGE_BIG_MM = 100;

/** A shape's box on the canvas, turned — what the snap aligns and measures gaps against. */
function turnedBox(w: number, h: number, deg: number) {
  const t = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  return { widthMm: w * c + h * s, depthMm: w * s + h * c };
}
const partBox = (p: ShapePart) => {
  const b = footprintBounds(shapeFootprint(p.shape, p));
  return { x: p.x, y: p.y, ...turnedBox(b.w, b.h, p.rotation || 0) };
};

const shifted = (p: ShapePart, dx: number, dy: number): ShapePart => ({ ...p, x: Math.round(p.x + dx), y: Math.round(p.y + dy) });

/** The list with `ids` moved in the stack — the list IS the stack, the last drawn on top. */
function restacked(list: readonly ShapePart[], ids: readonly string[], how: "front" | "back" | "forward" | "backward"): ShapePart[] {
  const moved = list.filter((s) => ids.includes(s.id));
  const rest = list.filter((s) => !ids.includes(s.id));
  if (how === "front") return [...rest, ...moved];
  if (how === "back") return [...moved, ...rest];
  const out = [...list];
  const step = how === "forward" ? 1 : -1;
  const order = how === "forward" ? [...out.keys()].reverse() : [...out.keys()];
  for (const i of order) {
    const j = i + step;
    if (!ids.includes(out[i].id) || j < 0 || j >= out.length || ids.includes(out[j].id)) continue;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The shape picker on a shape's bar: every shape as its own picture, plus "draw it yourself". A grid
 *  of cards rather than a Select — the bar sits on the bottom edge of the canvas, and a list that
 *  opens downward from there opens off it. The three hollow shapes a solid one now draws
 *  (PICKER_SHAPES) show a card only on a shape that already is one, so the grid still says what it is. */
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

/** The item drawn as its category's picture, and which version of it — the "ציור" panel on the item's
 *  bar. A chair's style, a candle piece's, an arrangement's form, and every other picture's versions
 *  (SYMBOL_STYLES). */
function PictureFields({
  product,
  preview,
  symbol,
  onChange,
}: {
  product: Product;
  preview: Product;
  symbol: SymbolKind | null;
  onChange: (p: Partial<MapAppearance>) => void;
}) {
  const category = CATEGORY_BY_ID[product.category];
  const tone = preview.variants.find((v) => !v.archived && v.swatch)?.swatch ?? preview.appearance?.style?.fill;
  return (
    <div className="space-y-3">
      <SwitchRow
        checked={product.appearance?.symbol !== false}
        onChange={(on) => onChange({ symbol: on ? undefined : false })}
        label={`ציור כ${category?.label ?? "פריט"}`}
        hint={
          product.appearance?.symbol === false
            ? "כבוי — הפריט מצויר כצורה עם שם או אייקון."
            : symbol
              ? "הפריט מצויר על התוכנית לפי הקטגוריה שלו, במידות ובגוון שלו."
              : "הציור חל על צורה אחת — עיגול, אליפסה או מלבן. לצורה הזו מוצג תוכן במקומו."
        }
      />

      {/* Which chair it is — a Chiavari and a ghost chair are both "a chair" to the category. */}
      {product.category === "chairs" && symbol && (
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
                  onClick={() => onChange({ symbolStyle: st === "dining" ? undefined : st })}
                  className={"flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " + (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line")}
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

      {/* Which candle piece it is — a ring of arms, a planar row, crystal tiers, a solitaire cluster,
          floating candles, a fire trough… (CandleStyle). Each tile draws THIS row's count of candles in
          that style; "אוטומטי" is what it drew before there was a choice. */}
      {product.category === "candlesticks" && symbol && (
        <div>
          <span className={fieldLabelClassName}>סוג הפמוט</span>
          <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="סוג הפמוט">
            {[undefined, ...CANDLE_STYLES].map((st) => {
              const on = st === drawStyleOf(preview);
              const n = symbolCount(preview, "candlestick");
              const f: Footprint =
                st === undefined
                  ? resolveFootprint(preview)
                  : st === "fire"
                    ? { kind: "rect", widthMm: 640, depthMm: 180 }
                    : st === "row"
                      ? { kind: "rect", widthMm: 520, depthMm: 200 }
                      : { kind: "circle", diameterMm: 420 };
              const b = footprintBounds(f);
              const pad = Math.max(b.w, b.h) * 0.08;
              return (
                <button
                  key={st ?? "auto"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={st ? CANDLE_STYLE_HINT[st] : "לפי הצורה: פריט ארוך — נרות בשורה, אחרת קנים במעגל"}
                  onClick={() => onChange({ symbolStyle: st })}
                  className={"flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " + (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line")}
                >
                  <svg viewBox={`${-b.w / 2 - pad} ${-b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className="h-9 w-full" aria-hidden>
                    <ItemSymbol kind="candlestick" footprint={f} count={st === "tiered" ? Math.max(n, 13) : st === "lantern" ? 1 : n} tone={tone} drawStyle={st} />
                  </svg>
                  <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{st ? CANDLE_STYLE_LABEL[st] : "אוטומטי"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Which version of the picture — a chuppah's colonnade, a chandelier's crystal tiers, a corner
          sofa, a palm, a gate's round entrance… (SYMBOL_STYLES). */}
      {symbol && SYMBOL_STYLES[symbol] && <StyleTiles kind={symbol} product={preview} onPick={(symbolStyle) => onChange({ symbolStyle })} />}

      {/* Which form an arrangement takes — a dome, a low cushion, a wild garden, a cascade, a runner,
          bud vases (lib/catalog/flower-draw.ts). Absent = by its height. The flowers in each tile are
          the row's own spec in its first shade, so the tiles show THIS arrangement six ways. */}
      {(product.category === "flower-arrangements" || product.category === "centerpieces") && symbol && (
        <div>
          <span className={fieldLabelClassName}>צורת הסידור</span>
          <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="צורת הסידור">
            {[undefined, ...FLOWER_FORMS].map((form) => {
              const chosen = preview.appearance?.symbolStyle;
              const on = form === undefined ? !isFlowerForm(chosen) : chosen === form;
              const b = footprintBounds(resolveFootprint(preview));
              const shown = form ?? defaultFlowerForm(preview.dimensions.heightMm, b.w, b.h);
              const wide = shown === "runner";
              const spec: FlowerDrawSpec = { form: shown, w: wide ? 1600 : 600, h: wide ? 360 : 600, lines: drawLinesOf(preview), shade: tone, seed: 11 };
              return (
                <button
                  key={form ?? "auto"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={form ? FLOWER_FORM_HINT[form] : "לפי גובה הסידור"}
                  onClick={() => onChange({ symbolStyle: form })}
                  className={"flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " + (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line")}
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
    </div>
  );
}

/** The "…" of a shape's bar and of several shapes' — the studio's MoreMenu order: turn it over, then
 *  where it stands in the stack. */
function moreItems(onFlip: (axis: FlipAxis) => void, onRestack: (how: "front" | "back") => void): MenuItem[] {
  return [
    { label: "היפוך מצד לצד", icon: FlipHorizontal2, onSelect: () => onFlip("horizontal") },
    { label: "היפוך מלמעלה למטה", icon: FlipVertical2, onSelect: () => onFlip("vertical") },
    { label: "הבאה לחזית · Ctrl+Shift+]", icon: BringToFront, onSelect: () => onRestack("front"), separated: true },
    { label: "שליחה לרקע · Ctrl+Shift+[", icon: SendToBack, onSelect: () => onRestack("back") },
  ];
}

/** A selected shape's bar — the studio sketch's own selection bar (components/inspector-bar.tsx): a
 *  title row, then one chip per subject, each opening its fields in a small panel. The same bar for
 *  every shape of the item. */
function ShapeBar({
  part,
  others,
  textured,
  color,
  onReshape,
  onChange,
  onRedraw,
  onDuplicate,
  onRemove,
  more,
  onClose,
}: {
  part: ShapePart;
  /** The centre of the box the item's OTHER shapes stand in — what "מיקום" is measured from — or
   *  null when this is the only shape. */
  others: { x: number; y: number } | null;
  /** Whether the item's shapes take a surface here (not where it is drawn as its picture). */
  textured: boolean;
  /** The item's fill, for the texture tiles. */
  color?: string;
  onReshape: (shape: MapShape) => void;
  onChange: (p: Partial<ShapePart>) => void;
  /** Its outline handed to the canvas's own outline editor, point by point. */
  onRedraw: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** The "…": flip, order. */
  more: MenuItem[];
  onClose: () => void;
}) {
  const id = `shape-${part.id}`;
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
    <Bar icon={drawn ? (part.open ? Route : PenLine) : Shapes} title={drawn ? (part.open ? "קווים" : "צורה חופשית") : SHAPE_LABEL[part.shape]} onClose={onClose}>
      <Popover label="צורה" icon={Shapes} value={drawn ? "חופשית" : SHAPE_LABEL[part.shape]} panelClassName="w-80">
        <ShapeGrid value={part.shape} onPick={onReshape} />
      </Popover>
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
            {/* commitOnBlur: a size typed digit by digit rescaled the shape at "1", then "12", then
                "120" — a hand-drawn one through rescaleCustomPart each time. */}
            <PanelRow label={part.shape === "line" ? "אורך (ס״מ)" : "רוחב (ס״מ)"} htmlFor={`${id}-w`}>
              <NumberField id={`${id}-w`} decimals={0} min={0} commitOnBlur value={cm(part.widthMm)} onChange={(v) => onChange({ widthMm: Math.round(v * 10) })} className="w-20" />
            </PanelRow>
            {part.shape === "line" ? (
              <PanelRow label="עובי (ס״מ)" htmlFor={`${id}-h`}>
                <NumberField id={`${id}-h`} decimals={1} min={0.1} commitOnBlur value={(part.depthMm ?? 0) / 10} onChange={(v) => onChange({ depthMm: Math.max(1, Math.round(v * 10)) })} className="w-20" />
              </PanelRow>
            ) : (
              <PanelRow label="עומק (ס״מ)" htmlFor={`${id}-h`}>
                <NumberField id={`${id}-h`} decimals={0} min={0} commitOnBlur value={cm(part.depthMm)} onChange={(v) => onChange({ depthMm: Math.round(v * 10) })} className="w-20" />
              </PanelRow>
            )}
          </>
        )}
      </Popover>
      {others && (
        <Popover label="מיקום" icon={Move} value={ltr(`${cm(part.x - others.x)}, ${cm(part.y - others.y)}`)}>
          <PanelRow label="אופקי (ס״מ)" htmlFor={`${id}-x`}>
            <NumberField id={`${id}-x`} decimals={0} commitOnBlur value={cm(part.x - others.x)} onChange={(v) => onChange({ x: Math.round(v * 10 + others.x) })} className="w-20" />
          </PanelRow>
          <PanelRow label="אנכי (ס״מ)" htmlFor={`${id}-y`}>
            <NumberField id={`${id}-y`} decimals={0} commitOnBlur value={cm(part.y - others.y)} onChange={(v) => onChange({ y: Math.round(v * 10 + others.y) })} className="w-20" />
          </PanelRow>
          <Note>מרכז הצורה, ביחס למרכז שאר הצורות.</Note>
        </Popover>
      )}
      <Rotation value={part.rotation || 0} onChange={(deg) => onChange({ rotation: deg })} />
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
      {canHollow(part.shape) && !part.open && (
        <Popover label="מילוי" icon={Donut} value={hollowValue(part.hollow)} panelClassName="w-80">
          {/* The shape's sides named as it stands on the canvas, turn included. */}
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
      {/* This shape's own surface — a layer of its own, whatever the other shapes wear. */}
      {textured && !part.open && (
        <Popover label="טקסטורה" icon={Paintbrush} value={surfaceLabel(part)} panelClassName="w-80">
          <SurfacePicker
            idPrefix={id}
            value={{ texture: part.texture, textureImage: part.textureImage }}
            color={color}
            onChange={(sf) => onChange({ texture: sf.texture, textureImage: sf.textureImage })}
          />
        </Popover>
      )}
      <BarButton icon={PenLine} label="עריכת הקווים · לחיצה כפולה" onClick={onRedraw} />
      {/* Lines only: the side back to the first point and the fill left out. A band or a surface has
          no inside to go on, so they go with it. */}
      {drawn && (
        <BarButton
          icon={Route}
          label={part.open ? "סגירת הצורה — מילוי והצלע הסוגרת" : "קווים בלבד — בלי מילוי ובלי הצלע הסוגרת"}
          active={!!part.open}
          onClick={() => onChange(part.open ? { open: undefined } : { open: true, hollow: undefined, texture: undefined, textureImage: undefined })}
        />
      )}
      <Menu label="עוד פעולות לצורה" side="top" items={more} />
      <Actions onDuplicate={onDuplicate} duplicateLabel="שכפול הצורה · Ctrl+D" onDelete={onRemove} deleteLabel="מחיקת הצורה · Delete" />
    </Bar>
  );
}

type OutlineEditor = ReturnType<typeof useOutlineEditor>;

/** A shape drawn or redrawn point by point — its bar, in the sketch's bar language: what is picked on
 *  the outline (a side's length, angle and bow, a point to take out) and then ביטול / סיום. */
function DrawingBar({ ed, isNew, onCancel, onFinish }: { ed: OutlineEditor; isNew: boolean; onCancel: () => void; onFinish: () => void }) {
  const n = ed.outline.length;
  const one = ed.selected.length === 1 ? ed.selected[0] : null;
  const idx = one ? Number(one.id) : -1;
  const a = one?.kind === "wall" ? ed.outline[idx] : undefined;
  const b = one?.kind === "wall" ? ed.outline[(idx + 1) % n] : undefined;
  const len = a && b ? wallLengthMm(a, b) : 0;
  const locked = one?.kind === "wall" && !!ed.lockedEdges[idx];
  const facts =
    ed.mode === "draw"
      ? n === 0
        ? "לחצו על הקנבס כדי להתחיל"
        : "Alt — זוויות של 45° · הקלידו אורך בס״מ · Enter או הנקודה הראשונה — סגירה"
      : ed.selected.length > 1
        ? `${ed.selected.length} נבחרו`
        : one?.kind === "wall"
          ? `צלע ${idx + 1}`
          : one?.kind === "vertex"
            ? `נקודה ${idx + 1}`
            : "גררו נקודה או צלע · ידית האמצע מעקמת צלע";
  return (
    <Bar icon={PenLine} title={isNew ? "צורה חופשית חדשה" : "עריכת קווי הצורה"} facts={facts}>
      {a && b && (
        <>
          <Popover label="אורך" icon={Ruler} value={ltr(`${Math.round(len / 10)}`)}>
            <PanelRow label="אורך (ס״מ)" htmlFor="drawing-len">
              <NumberField id="drawing-len" decimals={1} min={0.1} commitOnBlur disabled={locked} value={len / 10} onChange={(v) => ed.setWallLength(idx, v / 100)} className="w-20" />
            </PanelRow>
            {locked && <Note>האורך נעול — שחררו אותו כדי לשנות.</Note>}
          </Popover>
          <Popover label="זווית" icon={DraftingCompass} value={ltr(`${Math.round(wallAngleDeg(a, b))}°`)}>
            <PanelRow label="זווית (°)" htmlFor="drawing-angle">
              <NumberField id="drawing-angle" decimals={1} commitOnBlur value={wallAngleDeg(a, b)} onChange={(deg) => ed.setWallAngle(idx, deg)} className="w-20" />
            </PanelRow>
          </Popover>
          <Popover label="עיקום" icon={Spline} value={ltr(`${Math.round(bulgeDepthMm(a, b, ed.edgeCurves[idx] ?? null) / 10)}`)}>
            <PanelRow label={`עומק העיקום (ס״מ, עד ${Math.round(maxBulgeDepthMm(len) / 10)})`} htmlFor="drawing-bulge">
              <NumberField
                id="drawing-bulge"
                decimals={0}
                min={0}
                max={Math.round(maxBulgeDepthMm(len) / 10)}
                commitOnBlur
                value={Math.round(bulgeDepthMm(a, b, ed.edgeCurves[idx] ?? null) / 10)}
                onChange={(v) => ed.setWallBulgeDepth(idx, v * 10)}
                className="w-20"
              />
            </PanelRow>
          </Popover>
          <BarButton icon={locked ? Lock : LockOpen} label={locked ? "שחרור נעילת האורך" : "נעילת האורך"} active={locked} onClick={() => ed.toggleWallLock(idx)} />
          <BarButton icon={Plus} label="הוספת נקודה באמצע הצלע" onClick={() => ed.insertVertexOnWall(idx)} />
        </>
      )}
      {one?.kind === "vertex" && <BarButton icon={Trash2} tone="danger" label="מחיקת הנקודה · Delete" disabled={n <= 3} onClick={() => ed.removeVertex(idx)} />}
      {ed.selected.length > 1 && <BarButton icon={Trash2} tone="danger" label="מחיקת הנבחרים · Delete" onClick={() => ed.removeSelection(ed.selected)} />}
      <div className="ms-auto flex items-center gap-1">
        <BarButton icon={X} label="ביטול · Esc" onClick={onCancel} />
        {/* Finished before it is closed, the drawing is kept as its LINES — no fill, no closing side. */}
        <Button type="button" size="sm" onClick={onFinish} disabled={n < (ed.mode === "draw" ? 2 : 3)}>
          <Check className="h-4 w-4" strokeWidth={2} />
          {ed.mode !== "draw" ? "סיום" : n === 2 ? "סיום כקו" : "סיום כקווים"}
        </Button>
      </div>
    </Bar>
  );
}

/** The size a shape starts at when nothing has been typed for it yet — so a row opened for the first
 *  time draws at once, at a plausible size. Every number is the designer's to change. */
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

/** What the editor holds, and what one undo step takes back: the row (everything that is not
 *  geometry — content, style, its picture, the seat sides) and its shapes, each at its place. */
interface Draft {
  look: Product;
  shapes: ShapePart[];
}

/** Everything about how a product is DRAWN, in one place.
 *
 *  The rule: IF IT CHANGES WHAT THE PLAN DRAWS, IT IS IN HERE. Shape, measurements, outline, content,
 *  style. The drawer keeps what the plan never sees — the name, the price, the supplier, the height.
 *
 *  Laid out as the studio is (2026-11-01, the user: "make it like the studio layout, canvas + drawer,
 *  put the shapes in the side drawer + option to free draw"): the shapes drawer, the canvas, and the
 *  bar at the canvas's foot that follows the selection — a shape's, several shapes', or, with nothing
 *  selected, the item's own (its picture, content, seat sides, look). Every shape is equal; one
 *  history takes back every edit (Ctrl+Z / Ctrl+Y); the sketch's keyboard (Ctrl+C/X/V/D/A, Delete,
 *  arrows, Ctrl+[ ]), band selection, יישור and the right-click menu all work here. */
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
  const category = CATEGORY_BY_ID[product.category];
  // A stretch category (a drape, a rug) is cut or laid to whatever it has to cover, so it has no
  // shape here — its size is drawn per placement in the studio.
  const stretch = category?.sizing === "stretch";
  // Only tables carry chairs on the plan (the seat count is their count-multiplier).
  const seated = product.category === "tables";
  // A shape being drawn (a new one) or redrawn by hand. While it is, the canvas's outline editor is
  // ITS, with its own Ctrl+Z, and the item's history steps aside.
  const [drawingPart, setDrawingPart] = useState<{ id: string; isNew: boolean; open?: boolean } | null>(null);
  // Mounted by the act of opening and unmounted on close, so the draft and its history are born and
  // die with one editing session.
  const hist = useHistory<Draft>(
    () => {
      const look = withSizeFor(product);
      return { look, shapes: stretch ? [] : shapesOf(look) };
    },
    { keyboard: !drawingPart },
  );
  const { look: draft, shapes } = hist.present;
  const partEd = useOutlineEditor({ outline: [] }, { enabled: !!drawingPart });
  const [sel, setSel] = useState<string[]>([]);
  const [armedShape, setArmedShape] = useState<RailShape | null>(null);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [alignPreview, setAlignPreview] = useState<AlignOp | null>(null);
  const [alignKey, setAlignKey] = useState(0);
  // The shape a right-click landed on — reported by the feature layer just before the canvas asks
  // for its menu (the /halls pattern).
  const contextHit = useRef<string | null>(null);
  // One live group drag: every selected shape's place frozen when the gesture starts, so the whole
  // group is re-derived each frame from one shared delta rather than drifting.
  const groupDrag = useRef<{ from: { x: number; y: number }; origins: Map<string, { x: number; y: number }> } | null>(null);
  // A transient line over the canvas — why a close was refused, and the like. The studio's own.
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number | null>(null);
  const showHint = (msg: string) => {
    setHint(msg);
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 2800);
  };
  useEffect(
    () => () => {
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    },
    [],
  );

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const content = contentOf(draft);
  const seatCount = Number(draft.categoryFields?.seats) || 0;
  // The colour the item's surfaces are tinted by: its own fill, else its first shade.
  const itemColor = draft.appearance?.style?.fill ?? draft.variants.find((v) => !v.archived && v.swatch)?.swatch;
  const blocked = draft.appearance?.blockedSides ?? [];

  // A selection never holds a shape the list no longer has (an undo can take one away).
  const selected = sel.filter((id) => shapes.some((s) => s.id === id));
  const selShapes = selected.map((id) => shapes.find((s) => s.id === id)!);
  const one = selShapes.length === 1 ? selShapes[0] : null;

  // What the plan will draw — the row as it would be saved right now.
  const preview: Product = shapes.length ? { ...draft, ...lookOf(draft, shapes) } : draft;
  const footprint = !stretch && shapes.length ? resolveFootprint(preview) : null;
  const previewSymbol = footprint ? symbolOf(preview, footprint) : null;
  // The item's footprint is centred on the box of everything drawn; on the canvas that box is here.
  const drawn = shapes.length ? drawnBounds(shapes) : null;
  const itemAt = drawn ? { x: drawn.cx, y: drawn.cy } : { x: 0, y: 0 };
  // What a copy is kept relative to: the first shape stands still while copies are pasted beside it.
  const anchor = shapes[0] ? { x: shapes[0].x, y: shapes[0].y } : { x: 0, y: 0 };
  const chairs = seated && footprint && seatCount > 0 ? seatsAround(footprint, seatCount, undefined, blocked) : null;
  // A surface of its own per shape — not where the item is drawn as its picture, nor on a drape.
  const textured = !previewSymbol && category?.anchor !== "wall";

  // ── Edits ─────────────────────────────────────────────────────────────────────────────────────
  const setAppearance = (p: Partial<MapAppearance>) =>
    hist.set((d) => ({ ...d, look: { ...d.look, appearance: { shape: shapeOf(d.look), content: contentOf(d.look), ...d.look.appearance, ...p } } }));
  const toggleSide = (i: number) => setAppearance({ blockedSides: blocked.includes(i) ? blocked.filter((x) => x !== i) : [...blocked, i].sort((a, b) => a - b) });

  /** A new list of shapes, its seat sides kept only while they still exist. Side indices run over the
   *  whole item's outline, so a shape added or taken away can leave one pointing past the end. */
  const withShapes = (d: Draft, next: ShapePart[]): Draft => {
    const had = d.look.appearance?.blockedSides;
    if (!had?.length || !next.length) return { ...d, shapes: next };
    const count = seatSides(resolveFootprint({ ...d.look, ...lookOf(d.look, next) })).length;
    const kept = had.filter((i) => i < count);
    return {
      shapes: next,
      look: kept.length === had.length ? d.look : { ...d.look, appearance: { ...d.look.appearance!, blockedSides: kept.length ? kept : undefined } },
    };
  };
  const editShapes = (fn: (list: ShapePart[]) => ShapePart[]) => hist.set((d) => withShapes(d, fn(d.shapes)));
  const dragShapes = (fn: (list: ShapePart[]) => ShapePart[]) => hist.amend((d) => withShapes(d, fn(d.shapes)));

  /** A hollow slice of a lone round table leaves its two caps across the band unseated, as the arc's
   *  were (arcCaps): the serpentine laid out for a ceremony. Clicked back open by hand if wanted. */
  const sliceCaps = (d: Draft): Draft => {
    const s = d.shapes.length === 1 ? d.shapes[0] : null;
    if (!seated || !s || s.shape !== "circle" || !s.hollow || !s.arc || s.arc.sweepDeg >= 360) return d;
    const caps = arcCaps({ ...d.look, ...lookOf(d.look, d.shapes) });
    return { ...d, look: { ...d.look, appearance: { shape: shapeOf(d.look), content: contentOf(d.look), ...d.look.appearance, blockedSides: caps } } };
  };
  const patchShape = (id: string, p: Partial<ShapePart>) =>
    hist.set((d) => {
      const next = withShapes(d, d.shapes.map((x) => (x.id === id ? patchedPart(x, p) : x)));
      // A band re-cut, or a slice re-swept, renumbers the seat sides from that shape on.
      if (!("hollow" in p) && !("arc" in p)) return next;
      return sliceCaps({ ...next, look: { ...next.look, appearance: next.look.appearance && { ...next.look.appearance, blockedSides: undefined } } });
    });
  const reshape = (part: ShapePart, next: MapShape) => {
    if (next === "custom") startDrawing(part);
    else if (next !== part.shape)
      hist.set((d) => {
        const list = withShapes(d, d.shapes.map((x) => (x.id === part.id ? reshaped(x, next) : x)));
        return { ...list, look: { ...list.look, appearance: list.look.appearance && { ...list.look.appearance, blockedSides: undefined } } };
      });
  };
  const place = (shape: RailShape, at: { x: number; y: number }) => {
    const part = newPart(shape, at);
    editShapes((l) => [...l, part]);
    setSel([part.id]);
    setArmedShape(null);
  };
  const removeShapes = (ids: readonly string[]) => {
    if (!ids.length) return;
    editShapes((l) => l.filter((s) => !ids.includes(s.id)));
    setSel([]);
  };
  const addCopies = (list: ShapePart[]) => {
    const copies = list.map((s) => ({ ...s, id: crypto.randomUUID() }));
    editShapes((l) => [...l, ...copies]);
    setSel(copies.map((c) => c.id));
  };
  const duplicate = (ids: readonly string[]) => addCopies(shapes.filter((s) => ids.includes(s.id)).map((s) => shifted(s, PASTE_STEP_MM, PASTE_STEP_MM)));
  const copy = (ids: readonly string[]) => {
    const list = shapes.filter((s) => ids.includes(s.id));
    if (list.length) copiedShapes = list.map((s) => shifted(s, -anchor.x, -anchor.y));
  };
  const paste = () => {
    if (!copiedShapes.length) return;
    // Each paste steps on from the last one, so three pastes are three shapes, not one on top of two.
    copiedShapes = copiedShapes.map((s) => shifted(s, PASTE_STEP_MM, PASTE_STEP_MM));
    addCopies(copiedShapes.map((s) => shifted(s, anchor.x, anchor.y)));
  };
  const restack = (ids: readonly string[], how: "front" | "back" | "forward" | "backward") => editShapes((l) => restacked(l, ids, how));
  // Turned over, the sides are numbered from other corners: the seat sides are picked again, as after
  // a reshape.
  const flip = (ids: readonly string[], axis: FlipAxis) =>
    hist.set((d) => {
      const next = withShapes(d, flipShapes(d.shapes, ids, axis));
      return { ...next, look: { ...next.look, appearance: next.look.appearance && { ...next.look.appearance, blockedSides: undefined } } };
    });
  const nudge = (dx: number, dy: number) => editShapes((l) => l.map((s) => (selected.includes(s.id) ? shifted(s, dx, dy) : s)));

  // ── יישור — the selection lined up by one of its own (lib/studio/align.ts) ────────────────────
  const shapeName = (s: ShapePart) => `${s.shape === "custom" ? (s.open ? "קווים" : "צורה חופשית") : SHAPE_LABEL[s.shape]} ${shapes.indexOf(s) + 1}`;
  const key = Math.min(alignKey, Math.max(0, selShapes.length - 1));
  const boxes = selShapes.map(partBox);
  const alignPanel: AlignPanel | null =
    selShapes.length >= 2
      ? {
          units: selShapes.length,
          keyLabel: shapeName(selShapes[key]),
          onAlign: (op) => {
            if (needsThree(op) && selShapes.length < 3) return;
            const centres = alignedCentres(boxes, key, op);
            editShapes((l) =>
              l.map((s) => {
                const i = selected.indexOf(s.id);
                return i >= 0 ? { ...s, x: centres[i].x, y: centres[i].y } : s;
              }),
            );
          },
          onPickKey: (which) => setAlignKey((k) => (which === "last" ? selShapes.length - 1 : (k + 1) % selShapes.length)),
          onPreview: setAlignPreview,
        }
      : null;
  const alignLine = alignPreview && alignPanel ? alignGuide(boxes, key, alignPreview) : null;

  // ── Drawn point by point ──────────────────────────────────────────────────────────────────────
  // A new shape starts from an empty canvas in drawing mode; an existing one (of any kind) is handed
  // to the editor as the outline it is drawn as right now, turned and placed, so redrawing starts
  // from exactly what was there. Finishing writes it back as a "custom" shape: the outline, its box's
  // centre as its place, no turn (the turn is in the points now).
  const startDrawing = (part?: ShapePart) => {
    setSel([]);
    setArmedShape(null);
    if (part) {
      const o = placedPartOutline(part);
      partEd.reset({ mode: "edit", outline: o.outline.map((v) => ({ x: v.x, y: v.y })), edgeCurves: padCurves(o.edgeCurves, o.outline.length) });
      setDrawingPart({ id: part.id, isNew: false, open: part.shape === "custom" && !!part.open });
    } else {
      partEd.reset({ mode: "draw", outline: [] });
      setDrawingPart({ id: crypto.randomUUID(), isNew: true });
    }
  };
  /** The shapes with the one being drawn written in — or as they are, if it is not a shape yet: under
   *  three points, or all of them on one straight line (a line has no box to stand in). Drawn and
   *  never closed, it is kept as LINES (ShapePart.open); a shape that was lines stays lines. */
  const shapesWithDrawing = (): ShapePart[] => {
    if (!drawingPart) return shapes;
    const line = straightLine(partEd.outline, partEd.edgeCurves);
    if (line) {
      const old = shapes.find((p) => p.id === drawingPart.id);
      const drawnLine: ShapePart = {
        ...(old ?? { id: drawingPart.id }),
        ...line,
        shape: "line",
        depthMm: old?.shape === "line" ? old.depthMm : LINE_MM,
        outline: undefined,
        edgeCurves: undefined,
        open: undefined,
        hollow: undefined,
        diameterMm: undefined,
        arc: undefined,
        ring: undefined,
      };
      return old ? shapes.map((p) => (p.id === old.id ? drawnLine : p)) : [...shapes, drawnLine];
    }
    if (partEd.outline.length < 3) return shapes;
    const b = customShapeBounds(partEd.outline, partEd.edgeCurves);
    if (b.w < 10 || b.h < 10) return shapes;
    const open = partEd.mode === "draw" || !!drawingPart.open;
    const drawnShape = {
      shape: "custom" as const,
      open: open || undefined,
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
    const old = shapes.find((p) => p.id === drawingPart.id);
    if (!old) return [...shapes, { id: drawingPart.id, ...drawnShape }];
    // A hollow shape redrawn stays hollow — the redraw started from the outside of its band
    // (placedPartOutline) — but its open sides are corner-numbered: with corners added or taken away
    // they would open other sides, so only the band and the entrance come across.
    const sameSides = old.hollow && placedPartOutline(old).outline.length === partEd.outline.length;
    const hollow = open ? undefined : old.hollow && !sameSides ? hollowAcross(old.hollow, "custom") : old.hollow;
    return shapes.map((p) => (p.id === old.id ? { ...old, ...drawnShape, hollow } : p));
  };
  const finishDrawing = () => {
    if (!drawingPart) return;
    const { id, isNew } = drawingPart;
    const next = shapesWithDrawing();
    if (next === shapes && isNew) {
      showHint("לחצו לפחות שתי נקודות במקומות שונים");
      return;
    }
    setDrawingPart(null);
    if (next !== shapes) editShapes(() => next);
    if (next !== shapes || !isNew) setSel([id]);
  };
  const cancelDrawing = () => {
    const id = drawingPart && !drawingPart.isNew ? drawingPart.id : null;
    setDrawingPart(null);
    setSel(id ? [id] : []);
  };
  // Sides were held to 45° steps while drawing; the close squares what is nearly square (the closing
  // side is the one the designer never drew) and refuses a self-crossing outline, saying why.
  const closeDrawn = () => {
    const why = closeRefusal(partEd.outline);
    if (why) showHint(why);
    else partEd.closeOutline();
  };

  // ── The canvas's shapes, as the hall plan's features ──────────────────────────────────────────
  const featureOf = (p: ShapePart): StructureFeature => {
    const round = usesDiameter(p.shape);
    // A hand-drawn shape's box is its outline's; the feature layer stretches the outline to it.
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
      // Solid — the feature layer's default dash says "built into the room". A shape with a surface
      // of its own shows it (drawn under this one) through a clear fill, and so does a hollow one its
      // band: the feature here is the shape's outside.
      style: {
        ...draft.appearance?.style,
        dash: draft.appearance?.style?.dash ?? "solid",
        ...(hasSurface(p) || (p.hollow && canHollow(p.shape)) ? { fillOpacity: 0 } : {}),
        ...(p.open && p.shape === "custom" ? { fillOpacity: 0, strokeOpacity: 0 } : {}),
      },
    };
  };
  const shown = shapes.filter((p) => p.id !== drawingPart?.id);
  const features = shown.map(featureOf);
  /** The canvas's own alignment pull, fed every shape's box but the ones being moved. */
  const snapOpts = (moving: readonly string[], self?: { widthMm: number; depthMm: number }): HostSnapOptions => ({
    boxes: shapes.filter((x) => !moving.includes(x.id)).map(partBox),
    ...(self ? { self } : {}),
  });
  const straight = (deg: number) => Math.abs(((deg % 180) + 180) % 180) < 0.01;

  const marquee = (box: { minX: number; minY: number; maxX: number; maxY: number }, _additive: boolean, mode: MarqueeMode) => {
    const hits = hitsInBox({ ...emptyStructure(), features }, [], box);
    setSel((cur) => mergeSelection(cur.map((id) => ({ kind: "feature" as const, id })), hits, mode).map((r) => r.id));
  };

  // Right-clicking one of several selected shapes acts on all of them; right-clicking another
  // selects it first. On empty canvas the menu is about the selection, as in the sketch.
  const menuItems = (): ContextMenuItem[] => {
    const hit = contextHit.current;
    contextHit.current = null;
    if (drawingPart) return [];
    const ids = hit ? (selected.includes(hit) ? selected : [hit]) : selected;
    if (!ids.length) return [];
    if (hit && !selected.includes(hit)) setSel([hit]);
    const sole = ids.length === 1 ? shapes.find((s) => s.id === ids[0]) : undefined;
    return [
      ...(sole ? [{ label: "עריכת הקווים", icon: PenLine, onSelect: () => startDrawing(sole) }] : []),
      ...(ids.length > 1 && alignPanel ? [{ label: "יישור", icon: AlignCenterVertical, onSelect: () => {}, children: alignItems(alignPanel) }] : []),
      { label: "היפוך מצד לצד", icon: FlipHorizontal2, onSelect: () => flip(ids, "horizontal") },
      { label: "היפוך מלמעלה למטה", icon: FlipVertical2, onSelect: () => flip(ids, "vertical") },
      { label: "הבאה לחזית", icon: BringToFront, onSelect: () => restack(ids, "front") },
      { label: "שליחה לרקע", icon: SendToBack, onSelect: () => restack(ids, "back") },
      { label: "העתקה", icon: Copy, onSelect: () => copy(ids) },
      { label: "שכפול", icon: CopyPlus, onSelect: () => duplicate(ids) },
      { label: "מחיקה", icon: Trash2, onSelect: () => removeShapes(ids) },
    ];
  };

  // ── Keyboard: the sketch's ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget();
      if (e.key === "Escape") {
        // ESCAPE NEVER CLOSES THIS MODAL — it steps back one level. The editor closes through its ✕,
        // ביטול or the save alone; a drawing session lost to a reflex Esc is the bug this replaces.
        // A field keeps its own Escape. The canvas has already taken the presses that are its (a tape
        // put down, a half-drawn outline thrown away) and marked them handled — its listener is on the
        // window ahead of this one. preventDefault is what keeps the <dialog>'s close watcher from
        // firing at all: a cancelled `cancel` is honoured only once without user activation, and Esc
        // grants none — so the keydown is where it has to be stopped.
        if (!typing && !e.defaultPrevented) {
          if (drawingPart) {
            if (partEd.selected.length) partEd.setSelected([]);
            else cancelDrawing();
          } else if (armedShape) setArmedShape(null);
          else setSel([]);
        }
        e.preventDefault();
        return;
      }
      if (typing || drawingPart) return; // the outline editor owns the keys while a shape is drawn
      const mod = e.ctrlKey || e.metaKey;
      if (mod && isShortcut(e, "c") && selected.length) {
        e.preventDefault();
        copy(selected);
      } else if (mod && isShortcut(e, "x") && selected.length) {
        e.preventDefault();
        copy(selected);
        removeShapes(selected);
      } else if (mod && isShortcut(e, "v")) {
        e.preventDefault();
        paste();
      } else if (mod && isShortcut(e, "d") && selected.length) {
        e.preventDefault(); // the browser's own Ctrl+D is "bookmark this page"
        duplicate(selected);
      } else if (mod && isShortcut(e, "a")) {
        e.preventDefault();
        setSel(shapes.map((s) => s.id));
      } else if (mod && (e.code === "BracketRight" || e.code === "BracketLeft") && selected.length) {
        e.preventDefault();
        const up = e.code === "BracketRight";
        restack(selected, e.shiftKey ? (up ? "front" : "back") : up ? "forward" : "backward");
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace") && selected.length) {
        e.preventDefault();
        removeShapes(selected);
      } else if (!mod && e.key.startsWith("Arrow") && !e.defaultPrevented && selected.length) {
        // In SCREEN direction: a plan is a picture, and → is to the right of it whatever the page
        // direction.
        const step = e.shiftKey ? NUDGE_BIG_MM : NUDGE_MM;
        const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        if (dx || dy) {
          e.preventDefault();
          nudge(dx, dy);
        }
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
  // preventDefault (the window handler above always calls it — this is the belt under it), or from a
  // route that is no key at all. Either way the editor stays open, edits and all.
  const refuseCancel = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const missing = !stretch && shapes.length === 0;
  const save = () => {
    const list = drawingPart ? shapesWithDrawing() : shapes;
    onSave(stretch || !list.length ? { dimensions: draft.dimensions, appearance: { shape: shapeOf(draft), content, ...draft.appearance } } : lookOf(draft, list));
    onClose();
  };

  const box = footprint ? footprintBounds(footprint) : null;
  const itemFacts = box ? `${mmToCm(box.w)}×${mmToCm(box.h)} ס״מ${shapes.length > 1 ? ` · ${shapes.length} צורות` : ""}` : undefined;

  return (
    // `close`/`cancel` don't bubble in the DOM, but React dispatches them up the FIBER tree anyway —
    // and this modal is rendered INSIDE the product drawer's <dialog>. Without stopPropagation, saving
    // or cancelling ran the drawer's onClose too: the drawer shut and the item being added was thrown
    // away, shape and all.
    <dialog ref={ref} onClose={stopThenClose} onCancel={refuseCancel} className="modal m-auto max-h-none rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog">
      <div className="flex h-[86vh] w-[94vw] max-w-7xl flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <span className="text-sm font-semibold text-ink">מראה על התוכנית</span>
          {!stretch && !drawingPart && (
            <span className="hidden text-xs text-muted lg:inline">
              גררו צורות מהמגירה · לחיצה כפולה על צורה — עריכת הקווים · Shift / גרירת מלבן — כמה צורות · קליק ימני לעוד פעולות
            </span>
          )}
          <CloseButton className="ms-auto" onClick={onClose} />
        </header>

        <div className="flex min-h-0 flex-1">
          {!stretch && <ShapeRail armed={armedShape} drawing={!!drawingPart?.isNew} onArm={setArmedShape} onDraw={() => startDrawing()} />}

          <div className="relative min-w-0 flex-1 bg-canvas">
            {/* Why something was refused (an outline that crosses itself), for a moment, over the
                canvas — the studio's own hint line — or what to do on an empty canvas. */}
            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center" aria-live="polite">
              {hint ? (
                <span className="rounded-md bg-ink px-3 py-1.5 text-sm text-canvas shadow-dialog">{hint}</span>
              ) : missing && !drawingPart && !armedShape ? (
                <span className="rounded-pill bg-ink/85 px-4 py-2 text-[13px] text-canvas">גררו צורה מהמגירה אל הקנבס, או ״ציור חופשי״</span>
              ) : null}
            </div>
            {stretch ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 pb-24">
                <AppearancePreview product={preview} className="max-h-[70%] w-full max-w-md" />
                <p className="text-center text-xs text-muted">{`${category?.label ?? "פריטים אלה"} נמדדים על התוכנית — הגודל נקבע כשמותחים אותם באירוע.`}</p>
              </div>
            ) : (
              <PlanCanvas
                // A footprint is a cm-scale thing: typed and shown in centimetres. A drawn side goes
                // where the pointer is (pulled square by the points already drawn); Alt holds it to
                // 45° steps from the FIRST side (the stage tool's rule).
                lengthUnit="cm"
                drawAngleStepDeg={45}
                drawAngleFromFirstSide
                drawAngleFree
                {...(drawingPart
                  ? {
                      // The shape being drawn owns the canvas's outline editor.
                      mode: partEd.mode,
                      outline: partEd.outline,
                      edgeCurves: partEd.edgeCurves,
                      lockedEdges: partEd.lockedEdges,
                      selected: partEd.selected,
                      onSelect: (r: SelectedRef | null) => partEd.setSelected(r ? [r] : []),
                      onToggleSelect: partEd.toggleSelected,
                      onSelectMany: partEd.selectMany,
                      onAddVertex: partEd.addVertex,
                      onCloseOutline: closeDrawn,
                      onCancelDraw: cancelDrawing,
                      openEdges: drawingPart.open ? [partEd.outline.length - 1] : undefined,
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
                      // Every shape is a feature on the canvas; the outline editor rests.
                      mode: "edit" as const,
                      outline: [],
                      edgeCurves: [],
                      selected: [],
                      onSelect: () => {},
                      onAddVertex: () => {},
                      onCloseOutline: () => {},
                      onMoveVertex: () => {},
                      onMoveWallHandle: () => {},
                      onMarquee: marquee,
                      contextMenuItems: menuItems,
                      cursor: armedShape ? "crosshair" : "default",
                      onCanvasClick: (p: { x: number; y: number }) => {
                        if (armedShape) place(armedShape, p);
                        else setSel([]);
                      },
                      onCommit: hist.commit,
                      canUndo: hist.canUndo,
                      canRedo: hist.canRedo,
                      onUndo: hist.undo,
                      onRedo: hist.redo,
                    })}
                onDropAt={(e, p) => {
                  const id = e.dataTransfer.getData("text/plain");
                  if (!drawingPart && isRailShape(id)) place(id, p);
                }}
                // The item opens in the MIDDLE of the canvas: a frame the canvas's minimum extent wide,
                // centred on it, plus every shape so none opens off-screen.
                framePoints={[
                  { x: itemAt.x - PRODUCT_FRAME.minExtentMm.w / 2, y: itemAt.y - PRODUCT_FRAME.minExtentMm.h / 2 },
                  { x: itemAt.x + PRODUCT_FRAME.minExtentMm.w / 2, y: itemAt.y + PRODUCT_FRAME.minExtentMm.h / 2 },
                  ...(drawn ? [{ x: drawn.minX, y: drawn.minY }, { x: drawn.maxX, y: drawn.maxY }] : []),
                ]}
                backdrop={
                  // The chairs, drawn on the canvas itself (tables only) — the same ring the plan will
                  // draw, so a blocked side is seen emptying where the designer is looking.
                  chairs && (
                    <g transform={`translate(${itemAt.x} ${itemAt.y})`} className="pointer-events-none">
                      <SeatChairs seats={chairs} />
                    </g>
                  )
                }
                padMm={PRODUCT_FRAME.padMm}
                minExtentMm={PRODUCT_FRAME.minExtentMm}
                gridMm={PRODUCT_FRAME.gridMm}
                overlay={(ctx) => (
                  <>
                    {/* Each hollow shape's band, under its (clear-filled) outline — the feature layer
                        drags and sizes the shape's outside. */}
                    {shown
                      .filter((p) => p.hollow && canHollow(p.shape))
                      .map((p) => (
                        <g key={`band-${p.id}`} transform={`translate(${p.x} ${p.y})${p.rotation ? ` rotate(${p.rotation})` : ""}`} className="pointer-events-none">
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
                    {/* A lines-only shape's lines — its feature underneath is clear, there for the
                        pointer and the handles. */}
                    {shown
                      .filter((p) => p.open && p.shape === "custom")
                      .map((p) => (
                        <g key={`lines-${p.id}`} transform={`translate(${p.x} ${p.y})${p.rotation ? ` rotate(${p.rotation})` : ""}`} className="pointer-events-none">
                          {shapePieces(p.shape, p).map((o, i) => (
                            <OutlinePath
                              key={i}
                              outline={o.outline}
                              edgeCurves={o.edgeCurves}
                              open
                              fill="none"
                              stroke={selected.includes(p.id) ? "var(--color-accent)" : (draft.appearance?.style?.stroke ?? "var(--color-ink-soft)")}
                              strokeWidth={selected.includes(p.id) ? 2.5 : 1.5}
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                        </g>
                      ))}
                    {/* Each shape's own surface, under its (clear-filled) outline. */}
                    {textured &&
                      shown
                        .filter((p) => hasSurface(p))
                        .map((p) => (
                          <g key={p.id} transform={`translate(${p.x} ${p.y})${p.rotation ? ` rotate(${p.rotation})` : ""}`} className="pointer-events-none">
                            <ItemSurface appearance={{ texture: p.texture, textureImage: p.textureImage }} footprint={shapeFootprint(p.shape, p)} color={itemColor} seed={p.id} />
                          </g>
                        ))}
                    {/* A double-click on a shape opens its outline, point by point — the first click
                        has already selected it. */}
                    <g
                      onDoubleClick={() => {
                        if (one && !drawingPart) startDrawing(one);
                      }}
                    >
                      <StructureFeatures
                        structure={{ ...emptyStructure(), features }}
                        mm={ctx.mm}
                        clientToMm={ctx.clientToMm}
                        selectedIds={drawingPart ? [] : selected}
                        onSelect={
                          drawingPart
                            ? undefined
                            : (id, additive) =>
                                setSel((cur) => (additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : cur.includes(id) ? cur : [id]))
                        }
                        onContextMenu={(id) => {
                          contextHit.current = id;
                        }}
                        onMove={
                          drawingPart
                            ? undefined
                            : (id, p) => {
                                const part = shapes.find((x) => x.id === id);
                                if (!part) return;
                                const group = selected.length > 1 && selected.includes(id);
                                const b = partBox(part);
                                const at = ctx.snap(p, snapOpts(group ? selected : [id], { widthMm: b.widthMm, depthMm: b.depthMm }));
                                if (!group) {
                                  dragShapes((l) => l.map((s) => (s.id === id ? { ...s, x: Math.round(at.x), y: Math.round(at.y) } : s)));
                                  return;
                                }
                                if (!groupDrag.current)
                                  groupDrag.current = { from: { x: part.x, y: part.y }, origins: new Map(selShapes.map((s) => [s.id, { x: s.x, y: s.y }])) };
                                const g = groupDrag.current;
                                const dx = at.x - g.from.x;
                                const dy = at.y - g.from.y;
                                dragShapes((l) =>
                                  l.map((s) => {
                                    const o = g.origins.get(s.id);
                                    return o ? { ...s, x: Math.round(o.x + dx), y: Math.round(o.y + dy) } : s;
                                  }),
                                );
                              }
                        }
                        onResize={
                          drawingPart
                            ? undefined
                            : (id, r) => {
                                const part = shapes.find((x) => x.id === id);
                                const before = features.find((f) => f.id === id);
                                if (!part || !before) return;
                                if (part.shape === "line" && Math.round(r.depthMm) !== Math.round(before.depthMm)) return;
                                let { widthMm, depthMm, x, y } = r;
                                // The edge being dragged is pulled onto the guides; the opposite one
                                // stays where it was. Only square to the plan — a turned edge has no
                                // axis to line up.
                                if (straight(part.rotation || 0)) {
                                  if (usesDiameter(part.shape)) {
                                    const edge = ctx.snap({ x: x + widthMm / 2, y }, snapOpts([id])).x;
                                    widthMm = depthMm = Math.max(100, 2 * (edge - x));
                                  } else {
                                    if (widthMm !== before.widthMm) {
                                      const right = Math.abs(x + widthMm / 2 - (before.x + before.widthMm / 2)) > Math.abs(x - widthMm / 2 - (before.x - before.widthMm / 2));
                                      const fixed = right ? x - widthMm / 2 : x + widthMm / 2;
                                      const moved = ctx.snap({ x: right ? x + widthMm / 2 : x - widthMm / 2, y }, snapOpts([id])).x;
                                      widthMm = Math.max(100, Math.abs(moved - fixed));
                                      x = (moved + fixed) / 2;
                                    }
                                    if (depthMm !== before.depthMm) {
                                      const down = Math.abs(y + depthMm / 2 - (before.y + before.depthMm / 2)) > Math.abs(y - depthMm / 2 - (before.y - before.depthMm / 2));
                                      const fixed = down ? y - depthMm / 2 : y + depthMm / 2;
                                      const moved = ctx.snap({ x, y: down ? y + depthMm / 2 : y - depthMm / 2 }, snapOpts([id])).y;
                                      depthMm = Math.max(100, Math.abs(moved - fixed));
                                      y = (moved + fixed) / 2;
                                    }
                                  }
                                }
                                const patch: Partial<ShapePart> = {
                                  ...(usesDiameter(part.shape)
                                    ? { diameterMm: Math.round(widthMm * (part.shape === "quarter-circle" ? 2 : 1)) }
                                    : { widthMm: Math.round(widthMm), depthMm: Math.round(depthMm) }),
                                  x: Math.round(x),
                                  y: Math.round(y),
                                };
                                dragShapes((l) => l.map((s) => (s.id === id ? patchedPart(s, patch) : s)));
                              }
                        }
                        onRotate={drawingPart ? undefined : (id, deg) => dragShapes((l) => l.map((s) => (s.id === id ? { ...s, rotation: deg } : s)))}
                        onCommit={() => {
                          ctx.endSnap();
                          groupDrag.current = null;
                          hist.commit();
                        }}
                      />
                    </g>
                    {/* The line the יישור row under the pointer would align to. */}
                    {alignLine && (
                      <line
                        className="pointer-events-none"
                        aria-hidden
                        x1={alignLine.axis === "x" ? alignLine.at : alignLine.from}
                        y1={alignLine.axis === "x" ? alignLine.from : alignLine.at}
                        x2={alignLine.axis === "x" ? alignLine.at : alignLine.to}
                        y2={alignLine.axis === "x" ? alignLine.to : alignLine.at}
                        stroke="var(--color-accent)"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {/* What the plan draws over the outline — the category's picture over the whole
                        item, or its name or icon at the item's own label point — drawn where the item's
                        footprint is centred. */}
                    {footprint && drawn && !drawingPart && (
                      <g transform={`translate(${itemAt.x} ${itemAt.y})`} className="pointer-events-none text-ink-soft">
                        {previewSymbol ? (
                          <ItemSymbol
                            kind={previewSymbol}
                            footprint={footprint}
                            count={symbolCount(preview, previewSymbol)}
                            flowers={
                              previewSymbol === "flowers" || previewSymbol === "centerpiece"
                                ? flowerDrawSpecOf(preview, footprint, preview.variants.find((v) => !v.archived && v.swatch)?.swatch ?? preview.appearance?.style?.fill)
                                : undefined
                            }
                            tone={preview.variants.find((v) => !v.archived && v.swatch)?.swatch ?? preview.appearance?.style?.fill}
                            overhead={preview.layer === "ceiling"}
                            chairStyle={chairStyleOf(preview)}
                            drawStyle={drawStyleOf(preview)}
                            rise={climbRise(preview)}
                          />
                        ) : (
                          <PlanContent content={resolveContent(preview)} w={drawn.w} h={drawn.h} at={labelAnchor(footprint)} />
                        )}
                      </g>
                    )}
                  </>
                )}
              />
            )}

            {/* The bar at the canvas's foot follows the selection: the shape being drawn, one shape,
                several, or — with nothing selected — the item itself. */}
            <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
              <div className="pointer-events-auto max-w-full">
                {drawingPart ? (
                  <DrawingBar ed={partEd} isNew={drawingPart.isNew} onCancel={cancelDrawing} onFinish={finishDrawing} />
                ) : one ? (
                  <ShapeBar
                    part={one}
                    others={(() => {
                      const rest = shapes.filter((s) => s.id !== one.id);
                      if (!rest.length) return null;
                      const b = drawnBounds(rest);
                      return { x: b.cx, y: b.cy };
                    })()}
                    textured={textured}
                    color={itemColor}
                    onReshape={(next) => reshape(one, next)}
                    onChange={(p) => patchShape(one.id, p)}
                    onRedraw={() => startDrawing(one)}
                    onDuplicate={() => duplicate([one.id])}
                    onRemove={() => removeShapes([one.id])}
                    more={moreItems(
                      (axis) => flip([one.id], axis),
                      (how) => restack([one.id], how),
                    )}
                    onClose={() => setSel([])}
                  />
                ) : selShapes.length > 1 ? (
                  <Bar icon={Layers} title={`${selShapes.length} צורות`} onClose={() => setSel([])}>
                    <AlignMenu align={alignPanel} />
                    <Menu
                      label="עוד פעולות לנבחרות"
                      side="top"
                      items={moreItems(
                        (axis) => flip(selected, axis),
                        (how) => restack(selected, how),
                      )}
                    />
                    <Actions onDuplicate={() => duplicate(selected)} duplicateLabel="שכפול הצורות · Ctrl+D" onDelete={() => removeShapes(selected)} deleteLabel="מחיקת הצורות · Delete" />
                  </Bar>
                ) : (
                  <Bar icon={Shapes} title={draft.name || "הפריט"} facts={itemFacts}>
                    {categoryHasSymbol(draft.category) && (
                      <Popover label="ציור" icon={Sparkles} value={draft.appearance?.symbol === false ? "כבוי" : "לפי הקטגוריה"} panelClassName="w-80">
                        <PictureFields product={draft} preview={preview} symbol={previewSymbol} onChange={setAppearance} />
                      </Popover>
                    )}
                    {!previewSymbol && (
                      <Popover label="תוכן" icon={Type} value={CONTENT_OPTIONS.find(([v]) => v === content)?.[1] ?? ""} panelClassName="w-80">
                        <div className="space-y-3">
                          <Segmented
                            label="מה כתוב בתוך הצורה"
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
                              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setPickingIcon(true)}>
                                החלפת אייקון
                              </Button>
                            ))}
                        </div>
                      </Popover>
                    )}
                    {/* Which sides are laid with chairs — a drawing of the table to click on. The chairs
                        are on the canvas too, where the effect of a click shows at full size. */}
                    {seated && footprint && (
                      <Popover label="צדדים לישיבה" icon={Armchair} value={blocked.length ? `${blocked.length} חסומים` : "הכול"} panelClassName="w-80">
                        <SeatSidesPicker footprint={footprint} seats={seatCount} blocked={blocked} onToggle={toggleSide} className="h-44 w-full rounded-md bg-canvas" />
                        <Note>
                          {blocked.length
                            ? "הצדדים המקווקווים חסומים — הכסאות עוברים לצדדים הפתוחים. לחיצה על צד פותחת אותו שוב."
                            : "לחצו על צד כדי שלא יוצבו בו כסאות — שולחן ראש, שולחן צמוד לקיר."}
                          {seatCount === 0 && " (כמות הכסאות התקנית נקבעת בטופס המוצר.)"}
                        </Note>
                      </Popover>
                    )}
                    <Popover label="מראה" icon={Paintbrush} panelClassName="w-80">
                      <StyleFields style={draft.appearance?.style} onChange={(style) => setAppearance({ style })} strokeWidthDefault={2} />
                    </Popover>
                  </Bar>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-border px-5 py-3">
          {missing && <span className="text-xs text-alert">יש להוסיף לפחות צורה אחת.</span>}
          <div className="flex-1" />
          <Button type="button" variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button type="button" disabled={missing} onClick={save}>
            שמירת המראה
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
