"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignCenterVertical,
  Armchair,
  ArrowUpFromLine,
  Box,
  BrickWall,
  BringToFront,
  ChartPie,
  Check,
  Copy,
  CopyPlus,
  Cylinder,
  Donut,
  DraftingCompass,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Frame,
  Layers,
  Lock,
  LockOpen,
  Magnet,
  Move,
  Paintbrush,
  PenLine,
  Plus,
  Rainbow,
  Repeat as RepeatIcon,
  RotateCcw,
  RotateCw,
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
import type { ArcSpec, ChandelierCrystals, ChandelierSpec, ChuppahFinish, ChuppahFlowers, ChuppahRoof, ChuppahSpec, HollowSpec, MapAppearance, MapShape, PendantFitting, Pin, PinMode, Product, Repeat, RepeatAlong, RevolvePoint, RingSpec, ShapePart } from "@/lib/catalog/types";
import { CHANDELIER_CRYSTALS, CHANDELIER_PROFILES, FITTING_LABEL, PENDANT_FITTINGS, PENDANT_GLASS, PENDANT_GLASS_FORMS, PENDANT_GLASS_LABEL, CHANDELIER_PROFILE_FORMS, CHANDELIER_PROFILE_LABEL, CHANDELIER_TIERS_MAX, CRYSTALS_LABEL, CRYSTAL_STYLES, PROFILED_STYLES, TIERED_STYLES, asksStrands, chandelierDrawOf, chandelierHint, chandelierOf, chandelierPatch, strandsLabel } from "@/lib/catalog/chandelier";
import { CHUPPAH_FINISHES, CHUPPAH_FINISH_LABEL, CHUPPAH_FLOWERS_LABEL, CHUPPAH_FLOWER_SPOTS, CHUPPAH_PROFILES, CHUPPAH_PROFILE_FORMS, CHUPPAH_PROFILE_LABEL, CHUPPAH_ROOFS, CHUPPAH_ROOF_LABEL, chuppahDrawOf, chuppahLayout, chuppahOf, chuppahPatch } from "@/lib/catalog/chuppah";
import { ARC_SWEEP, MAP_SHAPES, PICKER_SHAPES, RING_GAP, ROUND_FIELD, SHAPE_LABEL, canHollow, usesDiameter } from "@/lib/catalog/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { drawnBounds, drawnPieces, flipShapes, lookOf, rescaleOutline, shapesOf, type FlipAxis } from "@/lib/catalog/shape-list";
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
import { CHAIR_D_MM, seatSides, seatsAround } from "@/lib/studio/seating";
import { FootprintShape, OutlinePath } from "@/components/footprint-shape";
import { SeatChairs, SeatSidesPicker } from "@/components/seat-sides-picker";
import { Bar, BarButton, Note, PanelRow, QuickNumber, QuickSep, QuickTail, QuickUnit, ltr } from "@/components/inspector-bar";
import { Popover } from "@/components/popover";
import { IconButton } from "@/components/icon-button";
import { FoldRow } from "@/components/fold-row";
import { EndPanel, PanelGroupsHeader, PanelList, PanelListRow } from "@/components/end-panel";
import { ToolGrid, ToolTile, toolTileClass } from "@/components/tool-tile";
import { ShapeGrid, ShapeIcon } from "@/components/shape-grid";
import { ElevationView } from "./elevation-view";
import { ElevationCanvas } from "./elevation-canvas";
import { ElevationQuickBar } from "./elevation-bar";
import { elevationNudge, type ElevationView as SideView } from "@/lib/element/elevation";
import { RevolveFields, type RevolveTiles } from "./revolve-editor";
import { REVOLVE_LABEL, revolveFormOf } from "@/lib/element/revolve";
import { ScenePane } from "./scene-pane";
import { itemBaseZ, itemScene, itemSceneKey } from "@/lib/scene/item-scene";
import { Menu, type MenuItem } from "@/components/menu";
import { StructureFeatures } from "@/components/venue-plan";
import { Dim } from "@/components/venue-dims";
import { emptyStructure, type StructureFeature } from "@/lib/venues/structure";
import { PlanCanvas, type ContextMenuItem, type HostSnapOptions, type MarqueeMode } from "@/components/plan-canvas";
import { closeRefusal, useOutlineEditor, type SelectedRef } from "@/lib/studio/use-outline-editor";
import { isShortcut, isTypingTarget } from "@/lib/keyboard";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { Segmented } from "@/components/segmented";
import { StyleFields } from "@/components/style-fields";
import { fieldLabelClassName } from "@/components/control";
import { CurtainStyleTiles } from "@/components/curtain-style-tiles";
import { curtainStyleOf } from "@/lib/catalog/symbols";
import { pergolaPostOf } from "@/lib/venues/pergola";
import { AppearancePreview, PlanContent } from "./appearance-preview";
import { labelAnchor } from "@/lib/studio/label-anchor";
import { IconPicker } from "./icon-picker";
import { CloseButton } from "@/components/close-button";
import { SwitchRow } from "@/components/toggle";
import { ItemSurface } from "@/components/surface-fill";
import { hasSurface } from "@/lib/catalog/textures";
import { SurfacePicker, surfaceLabel } from "./surface-picker";
import { ItemSymbol } from "@/components/item-symbol";
import { FootprintBorder } from "@/components/item-symbol";
import { BorderFields } from "@/components/border-fields";
import { Swatch, SwatchField } from "@/components/swatch-field";
import { borderOf, newBorder, takesBorder } from "@/lib/catalog/border";
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
import { FLOWER_FORMS, FLOWER_FORM_HINT, FLOWER_FORM_LABEL, FLOWER_PROFILES, FLOWER_PROFILE_FORMS, FLOWER_PROFILE_LABEL, defaultFlowerForm, isFlowerForm, type FlowerDrawSpec } from "@/lib/catalog/flower-draw";
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
    <div className="space-y-2.5">
      <Segmented
        label="כמה מהעיגול"
        value={String(spec.sweepDeg)}
        options={SWEEP_PRESETS}
        onChange={(v) => onChange({ ...spec, sweepDeg: Number(v) })}
      />
      <div>
        <PanelRow label="זווית (°)" htmlFor={`${idPrefix}-sweep`}>
          <NumberField
            id={`${idPrefix}-sweep`}
            decimals={0}
            min={ARC_SWEEP.min}
            max={ARC_SWEEP.max}
            commitOnBlur
            value={spec.sweepDeg}
            onChange={(v) => onChange({ ...spec, sweepDeg: v })}
            className="w-20"
          />
        </PanelRow>
        <PanelRow label="רוחב הרצועה (ס״מ)" htmlFor={`${idPrefix}-band`}>
          <NumberField
            id={`${idPrefix}-band`}
            decimals={0}
            min={5}
            commitOnBlur
            value={mmToCm(spec.bandMm)}
            onChange={(v) => onChange({ ...spec, bandMm: Math.round(v * 10) })}
            className="w-20"
          />
        </PanelRow>
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
    <div className="space-y-2.5">
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
    <div className="space-y-2.5">
      <div>
        <PanelRow label="רוחב הרצועה (ס״מ)" htmlFor={`${idPrefix}-band`}>
          <NumberField
            id={`${idPrefix}-band`}
            decimals={0}
            min={5}
            commitOnBlur
            value={mmToCm(spec.bandMm)}
            onChange={(v) => onChange({ ...spec, bandMm: Math.round(v * 10) })}
            className="w-20"
          />
        </PanelRow>
        {opens && (
          <PanelRow label={oval ? "פתח (ס״מ)" : "פתח ליד הקיר (ס״מ)"} htmlFor={`${idPrefix}-gap`}>
            <NumberField
              id={`${idPrefix}-gap`}
              decimals={0}
              min={0}
              commitOnBlur
              value={mmToCm(spec.gapMm)}
              onChange={(v) => onChange({ ...spec, gapMm: Math.round(v * 10) })}
              className="w-20"
            />
          </PanelRow>
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
    <div className="space-y-2.5">
      <Segmented
        label="מילוי"
        hideLabel
        value={hollow ? "hollow" : "solid"}
        options={FILL_OPTIONS}
        onChange={(v) => onChange(v === "hollow" ? (hollow ?? { bandMm: defaultBand }) : undefined)}
      />
      {hollow ? (
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
          <div>
            <span className={fieldLabelClassName}>צדדים פתוחים</span>
            <div className="grid grid-cols-2 gap-1" role="group" aria-label="צדדים פתוחים">
              {names.map((name, i) => {
                const on = open.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? open.filter((x) => x !== i) : [...open, i].sort((a, b) => a - b);
                      onChange({ ...hollow, openSides: next.length ? next : undefined });
                    }}
                    className={`h-8 min-w-0 truncate rounded-sm border px-2 text-xs transition-colors ${
                      on ? "border-accent bg-accent-tint font-semibold text-accent" : "border-border text-ink-soft hover:border-accent-line"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
          {/* An entrance only makes sense in a band that runs all the way round — with a side open,
              that side IS the way in. */}
          {open.length === 0 && (
            <div>
              <PanelRow label="כניסה (ס״מ)" htmlFor={`${idPrefix}-gap`}>
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
                <div className="mt-1.5 space-y-2.5">
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
                </div>
              )}
            </div>
          )}
          <Note>{open.length ? "צד פתוח — הרצועה מגיעה עד קו הצד ונעצרת בו, כמו ח׳." : "צד פתוח — הרצועה מגיעה עד קו הצד ונעצרת בו, כמו ח׳. כניסה — פתח ברצועה הסגורה; 0 — בלי פתח."}</Note>
        </>
      ) : (
        <Note>חלול — רצועה לאורך קו הצורה: בר ח׳, אליפסה חלולה, מזנון סביב.</Note>
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

/** A shape's picture, at a neutral proportion — the drawer's tiles and the shape picker's. */

/** A shape tile — the drawer's and the shape picker's, one look. */

/** The drawer's names where the full one does not fit a tile; the full one is its tooltip. */
const SHAPE_SHORT: Partial<Record<MapShape, string>> = {
  stadium: "קפסולה",
  crescent: "סהר",
  "rounded-u": "צורת ח",
  "quarter-circle": "רבע עיגול",
  "half-circle": "חצי עיגול",
};

// The picker's shapes (PICKER_SHAPES): a קשת חלולה, a צורת ח and an אליפסה חלולה are a half circle,
// a rectangle and a capsule made hollow on the shape's bar.
type RailShape = Exclude<MapShape, "custom">;
const RAIL_SHAPES = PICKER_SHAPES.filter((s): s is RailShape => s !== "custom");
const isRailShape = (id: string): id is RailShape => (RAIL_SHAPES as readonly string[]).includes(id);

/** The view switch over the canvas — the plan and the two side views (lib/element/elevation.ts). */
const VIEW_OPTIONS = [
  ["plan", "תוכנית"],
  ["front", "חזית"],
  ["side", "צד"],
] as const;

function ShapeRail({ armed, drawing, onArm, onDraw, disabled = false }: { armed: RailShape | null; drawing: boolean; onArm: (s: RailShape | null) => void; onDraw: () => void; disabled?: boolean }) {
  // A side view places nothing new yet (front shapes are the next stage): shapes are added on the
  // plan, and the rail says so rather than arming a tool the view cannot place.
  const why = disabled ? "צורות חדשות מונחות בתוכנית" : undefined;
  return (
    <aside className={"flex w-56 shrink-0 flex-col border-e border-border bg-surface" + (disabled ? " opacity-50" : "")} title={why}>
      <div className="scroll-slim flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
        <button
          type="button"
          onClick={onDraw}
          disabled={disabled}
          aria-pressed={drawing}
          title={why ?? "ציור חופשי — נקודה אחר נקודה"}
          className={
            "flex h-9 w-full items-center justify-center gap-2 rounded-sm border px-2.5 text-[13px] font-semibold transition-colors " +
            (drawing ? "border-accent bg-accent-tint text-accent" : "border-border bg-surface text-ink hover:border-accent-line hover:bg-inset")
          }
        >
          <PenLine className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
          ציור חופשי
        </button>
        <ToolGrid label="צורות">
          {RAIL_SHAPES.map((s) => (
            <ToolTile
              key={s}
              glyph={<ShapeIcon shape={s} />}
              label={SHAPE_SHORT[s] ?? SHAPE_LABEL[s]}
              title={why ?? SHAPE_LABEL[s]}
              armed={armed === s}
              disabled={disabled}
              onClick={() => onArm(armed === s ? null : s)}
              dragId={s}
            />
          ))}
        </ToolGrid>
      </div>
    </aside>
  );
}

/** A hand-drawn shape's outline stretched to a new box about its own centre — what its resize handles
 *  and its size fields do. Curves are offsets from their endpoints, so they scale by the same two. */
function rescaleCustomPart(part: ShapePart, widthMm: number, depthMm: number): Pick<ShapePart, "outline" | "edgeCurves" | "widthMm" | "depthMm"> {
  return rescaleOutline(part.outline ?? [], part.edgeCurves, widthMm, depthMm);
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
    // A body of revolution is a round shape's; a bowl reshaped to a square is a block.
    revolve: next === "circle" || next === "ellipse" ? part.revolve : undefined,
    open: undefined,
  };
}

/** What the "גוף" chip reads: a cylinder, a preset's name, or a profile of the designer's own. */
function bodyValue(part: ShapePart, tiles?: RevolveTiles): string {
  if (!part.revolve) return tiles?.none ?? "גליל";
  const same = (a: readonly RevolvePoint[], b: readonly RevolvePoint[]) => a.length === b.length && a.every((q, i) => Math.abs(q.r - b[i].r) < 1e-6 && Math.abs(q.z - b[i].z) < 1e-6);
  if (tiles) return tiles.forms.find((f) => same(f.points, part.revolve!))?.label.split(" — ")[0] ?? "מותאם";
  const form = revolveFormOf(part.revolve);
  return form ? REVOLVE_LABEL[form] : "מותאם";
}

// ── Pins and repeats (the element model, Stage 3) ────────────────────────────────────────────────
// How a shape follows a resize of the item (ShapePart.pin — Figma's constraints, against the first
// shape's box) and whether it is laid in copies against the first shape (ShapePart.repeat — posts in
// the corners, a beam along every side, slats at a spacing). Both are read by the one footprint
// engine (lib/studio/footprint.ts sizedShapes / repeatCopies), so the canvas's faint copies, the
// plan and the room agree.

const PIN_X: { value: PinMode; label: string }[] = [
  { value: "scale", label: "יחסי — זז וגדל עם הפריט" },
  { value: "start", label: "צמוד לשמאל" },
  { value: "end", label: "צמוד לימין" },
  { value: "center", label: "ממורכז — במרחק קבוע מהאמצע" },
  { value: "stretch", label: "נמתח — צמוד לשני הצדדים" },
];
const PIN_Y: { value: PinMode; label: string }[] = [
  { value: "scale", label: "יחסי — זז וגדל עם הפריט" },
  { value: "start", label: "צמוד למעלה" },
  { value: "end", label: "צמוד למטה" },
  { value: "center", label: "ממורכז — במרחק קבוע מהאמצע" },
  { value: "stretch", label: "נמתח — צמוד לשני הצדדים" },
];
const PIN_SHORT: Record<PinMode, string> = { scale: "יחסי", start: "התחלה", end: "סוף", center: "מרכז", stretch: "נמתח" };

function pinValue(pin: Pin | undefined): string {
  const x = pin?.x ?? "scale";
  const y = pin?.y ?? "scale";
  if (x === "scale" && y === "scale") return "יחסי";
  return `${PIN_SHORT[x]} · ${PIN_SHORT[y]}`;
}

/** The pin with one axis set; "scale" is the default and is not stored; none left = no pin. */
function withPin(pin: Pin | undefined, axis: "x" | "y", mode: PinMode): Pin | undefined {
  const next: Pin = { ...pin };
  if (mode === "scale") delete next[axis];
  else next[axis] = mode;
  return next.x || next.y ? next : undefined;
}

const REPEAT_LABEL: Record<RepeatAlong, string> = { corners: "בפינות", edges: "לאורך הצלעות", row: "בשורה", grid: "ברשת" };
const REPEAT_OPTIONS: { value: RepeatAlong | ""; label: string }[] = [
  { value: "", label: "ללא — הצורה הזו בלבד" },
  { value: "corners", label: "בפינות הצורה הראשונה" },
  { value: "edges", label: "לאורך כל צלע של הצורה הראשונה" },
  { value: "row", label: "בשורה — לרוחב הצורה הראשונה, במרווח" },
  { value: "grid", label: "ברשת — בתוך הצורה הראשונה" },
];
const REPEAT_HINT: Record<RepeatAlong, string> = {
  corners: "עותק אחד בתוך כל פינה של הצורה הראשונה, פניו על שני הקווים — עמודי פרגולה.",
  edges: "עותק לאורך כל צלע, באורך הצלע ובעומק הצורה הזו, פניו החיצוניים על הקו — קורה, מעקה, אבן שפה.",
  row: "עותקים במרווח קבוע, מהאמצע החוצה, כל אחד חוצה את הצורה הראשונה מצד לצד — רפפות, קורות תקרה.",
  grid: "עותקים בגודל הצורה הזו על רשת, רק אלה שמרכזם בתוך הצורה הראשונה — באלוסטרים, עמודים.",
};
const DEFAULT_SPACING_MM = 300;

function repeatValue(r: Repeat | undefined): string {
  if (!r) return "ללא";
  const s = r.along === "row" || r.along === "grid" ? ` ${Math.round((r.spacingMm ?? DEFAULT_SPACING_MM) / 10)}` : "";
  return `${REPEAT_LABEL[r.along]}${s}`;
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

/** The versions of a category's picture (SYMBOL_STYLES) as tiles, each drawn at a typical size of
 *  that version in THIS row's shade and count, so the designer picks by looking. The first tile is
 *  what the category always drew, and picking it stores no style at all. A sofa drawn round is a
 *  pouf whatever its style, so a round one is offered none. */
/** Whether the category's picture has a grid of versions of its own here (StyleTiles, or the chairs',
 *  candlesticks' or arrangements' own tiles) — the grid the "ללא" tile leads. */
function hasStyleTiles(kind: SymbolKind, product: Product): boolean {
  if (product.category === "chairs" || product.category === "candlesticks" || product.category === "flower-arrangements" || product.category === "centerpieces") return true;
  if (!SYMBOL_STYLES[kind]) return false;
  return !(kind === "sofa" && resolveFootprint(product).kind !== "rect");
}

const tileClass = (on: boolean) =>
  "flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " + (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line");

/** "ללא" — the first tile of the picture's versions (2026-11-09, the user: in place of the "ציור כ…"
 *  switch, "just add an option of ללא"): the item drawn as its plain shape, with its name or icon
 *  (MapAppearance.symbol false); any other tile turns the picture back on. Drawn as the item's own
 *  outline, empty and dashed. */
function NoneTile({ on, footprint, onPick }: { on: boolean; footprint: Footprint; onPick: () => void }) {
  const b = footprintBounds(footprint);
  const pad = Math.max(b.w, b.h) * 0.12;
  return (
    <button type="button" role="radio" aria-checked={on} title="ללא ציור — הפריט מצויר כצורה, עם שם או אייקון" onClick={onPick} className={tileClass(on)}>
      <svg viewBox={`${-b.w / 2 - pad} ${-b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className="h-10 w-full" aria-hidden>
        <FootprintShape footprint={footprint} fill="var(--color-surface)" stroke="var(--color-faint)" strokeWidth={1.25} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">ללא</span>
    </button>
  );
}

function StyleTiles({ kind, product, onPick, off, lead }: { kind: SymbolKind; product: Product; onPick: (style: DrawStyle | undefined) => void; off?: boolean; lead?: ReactNode }) {
  const set = SYMBOL_STYLES[kind];
  if (!set) return null;
  if (kind === "sofa" && resolveFootprint(product).kind !== "rect") return null;
  const chosen = drawStyleOf(product) ?? set.styles[0];
  const tone = product.variants.find((v) => !v.archived && v.swatch)?.swatch ?? product.appearance?.style?.fill;
  const count = symbolCount(product, kind);
  const n = set.styles.length + (lead ? 1 : 0);
  const cols = n <= 2 ? "grid-cols-2" : n === 3 ? "grid-cols-3" : "grid-cols-4";
  return (
    <div>
      <span className={fieldLabelClassName}>{set.title}</span>
      <div className={`grid ${cols} gap-1`} role="radiogroup" aria-label={set.title}>
        {lead}
        {set.styles.map((st, i) => {
          const f = set.sample(st);
          const b = footprintBounds(f);
          const pad = Math.max(b.w, b.h) * 0.06;
          const on = !off && chosen === st;
          return (
            <button
              key={st}
              type="button"
              role="radio"
              aria-checked={on}
              title={set.hint?.[st] ?? set.label[st]}
              onClick={() => onPick(i === 0 ? undefined : st)}
              className={tileClass(on)}
            >
              <svg viewBox={`${-b.w / 2 - pad} ${-b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className="h-10 w-full" aria-hidden>
                <ItemSymbol kind={kind} footprint={f} count={count} tone={tone} drawStyle={st} chandelier={chandelierDrawOf(product.appearance, product.variants)} chuppah={chuppahDrawOf(product.appearance)} />
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
/** A chandelier's body is its SILHOUETTE (lib/catalog/chandelier.ts): its own outlines as the tiles,
 *  on the chandelier panel and on its first shape's "גוף". */
const CHANDELIER_SILHOUETTES: RevolveTiles = {
  title: "צללית — צורת השנדליר מהצד",
  none: "לפי הסוג",
  forms: CHANDELIER_PROFILE_FORMS.map((f) => ({ key: f, label: CHANDELIER_PROFILE_LABEL[f], points: CHANDELIER_PROFILES[f] })),
  note: "הקומות, המוטות והמחרוזות נפרשים בתוך הצללית — כל קומה ברוחב הצללית בגובה שלה; לא גוף מלא. הרוחב הגדול ביותר הוא הקוטר על התוכנית.",
};

/** A glass pendant's body is its GLASS'S shape (lib/catalog/chandelier.ts PENDANT_GLASS). */
const PENDANT_GLASS_TILES: RevolveTiles = {
  title: "צורת הזכוכית",
  none: "כדור",
  nonePoints: PENDANT_GLASS.globe,
  forms: PENDANT_GLASS_FORMS.filter((f) => f !== "globe").map((f) => ({ key: f, label: PENDANT_GLASS_LABEL[f], points: PENDANT_GLASS[f] })),
  note: "כל גלובוס בקבוצה באותה צורה; הקוטר על התוכנית הוא הרוחב שלו.",
};

/** A round chuppah's body is its ROOF'S section (lib/catalog/chuppah.ts CHUPPAH_PROFILES): a flat
 *  cloth when none is picked. */
const CHUPPAH_ROOF_TILES: RevolveTiles = {
  title: "צורת הגג — חופה עגולה",
  none: "שטוח",
  forms: CHUPPAH_PROFILE_FORMS.map((f) => ({ key: f, label: CHUPPAH_PROFILE_LABEL[f], points: CHUPPAH_PROFILES[f] })),
  note: "העמודים עולים עד המקום שבו הצללית מתחילה להתקמר, ומשם הגג — בד, שיפון, ענן פרחים או צלעות — בצורת הצללית. לא גוף מלא.",
};

/** A flower arrangement's body is its ENVELOPE (lib/catalog/flower-draw.ts FLOWER_PROFILES): the
 *  form's own dome when none is picked. */
const FLOWER_ENVELOPES: RevolveTiles = {
  title: "צללית — צורת הסידור מהצד",
  none: "כיפה",
  forms: FLOWER_PROFILE_FORMS.map((f) => ({ key: f, label: FLOWER_PROFILE_LABEL[f], points: FLOWER_PROFILES[f] })),
  note: "הפרחים נפרשים על הצללית — מלמעלה ומהצדדים — והירק ממלא אותה; לא גוף מלא. הרוחב הגדול ביותר הוא הקוטר על התוכנית; חלק צר מדי לפרחים (גזע) הוא צרור גבעולים.",
};

function PictureFields({
  product,
  preview,
  symbol,
  onChange,
  onProfile,
}: {
  product: Product;
  preview: Product;
  symbol: SymbolKind | null;
  onChange: (p: Partial<MapAppearance>) => void;
  /** Sets the FIRST shape's body (its `revolve`) — a chandelier's silhouette. Absent when the first
   *  shape cannot have one (not round). */
  onProfile?: (revolve: RevolvePoint[] | undefined) => void;
}) {
  const category = CATEGORY_BY_ID[product.category];
  const tone = preview.variants.find((v) => !v.archived && v.swatch)?.swatch ?? preview.appearance?.style?.fill;
  // Drawn as its plain shape ("ללא"): `symbol` is then null, so the picture it WOULD be — what the
  // tiles offer to go back to — is asked of the row with the picture on.
  const off = product.appearance?.symbol === false;
  const footprint = resolveFootprint(preview);
  const kind = symbol ?? symbolOf({ ...preview, appearance: preview.appearance && { ...preview.appearance, symbol: undefined } }, footprint);
  // Any version picked turns the picture back on.
  const pick = (p: Partial<MapAppearance>) => onChange({ symbol: undefined, ...p });
  const none = <NoneTile on={off} footprint={footprint} onPick={() => onChange({ symbol: false })} />;
  if (!kind) return <Note>הציור חל על צורה אחת — עיגול, אליפסה או מלבן. לצורה הזו מוצג תוכן במקומו.</Note>;
  return (
    <div className="space-y-3">
      {/* A picture with no versions of its own: itself, or ללא. */}
      {!hasStyleTiles(kind, preview) && (
        <div>
          <span className={fieldLabelClassName}>ציור</span>
          <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="ציור">
            {none}
            {(() => {
              const b = footprintBounds(footprint);
              const pad = Math.max(b.w, b.h) * 0.08;
              return (
                <button type="button" role="radio" aria-checked={!off} title="הפריט מצויר על התוכנית לפי הקטגוריה שלו, במידות ובגוון שלו" onClick={() => pick({})} className={tileClass(!off)}>
                  <svg viewBox={`${-b.w / 2 - pad} ${-b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className="h-10 w-full" aria-hidden>
                    <ItemSymbol kind={kind} footprint={footprint} count={symbolCount(preview, kind)} tone={tone} drawStyle={drawStyleOf(preview)} />
                  </svg>
                  <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{category?.label ?? "ציור"}</span>
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Which chair it is — a Chiavari and a ghost chair are both "a chair" to the category. */}
      {product.category === "chairs" && (
        <div>
          <span className={fieldLabelClassName}>סוג הכיסא</span>
          <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="סוג הכיסא">
            {none}
            {CHAIR_STYLES.map((st) => {
              const on = !off && (chairStyleOf(preview) ?? "dining") === st;
              return (
                <button
                  key={st}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={CHAIR_STYLE_LABEL[st]}
                  onClick={() => pick({ symbolStyle: st === "dining" ? undefined : st })}
                  className={tileClass(on)}
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
      {product.category === "candlesticks" && (
        <div>
          <span className={fieldLabelClassName}>סוג הפמוט</span>
          <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="סוג הפמוט">
            {none}
            {[undefined, ...CANDLE_STYLES].map((st) => {
              const on = !off && st === drawStyleOf(preview);
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
                  onClick={() => pick({ symbolStyle: st })}
                  className={tileClass(on)}
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
      {SYMBOL_STYLES[kind] && <StyleTiles kind={kind} product={preview} off={off} lead={none} onPick={(symbolStyle) => pick({ symbolStyle })} />}

      {/* A chandelier's build beyond its style (lib/catalog/chandelier.ts): how many TIERS of lights
          stand one above the other and what CRYSTAL hangs from them — the plan and the room read one
          layout. The style's own answers are not stored (chandelierPatch), so a row follows its
          style until it says otherwise. */}
      {symbol === "chandelier" &&
        (() => {
          const style = drawStyleOf(preview);
          const built = chandelierOf(style, chandelierDrawOf(preview.appearance));
          const set = (patch: ChandelierSpec) => onChange({ chandelier: chandelierPatch(style, preview.appearance?.chandelier, patch) });
          const tiered = TIERED_STYLES.includes(built.style);
          const crystalled = CRYSTAL_STYLES.includes(built.style);
          const stranded = asksStrands(built);
          // THE SILHOUETTE is the base shape's body (the shape bar's "גוף"), offered here too with a
          // chandelier's own outlines, since this is where a chandelier is built.
          const profiled = PROFILED_STYLES.includes(built.style) && !!onProfile;
          const pendants = built.style === "pendants";
          if (!tiered && !crystalled && !stranded && !profiled && !pendants) return null;
          return (
            <div className="space-y-2">
              {profiled && (
                <RevolveFields value={preview.appearance?.revolve} onChange={(revolve) => onProfile!(revolve)} tiles={pendants ? PENDANT_GLASS_TILES : CHANDELIER_SILHOUETTES} />
              )}
              {/* GLASS PENDANTS: the glass is the shade (גוונים וצבעים — ענבר, עשן, שקוף, כרום), so here
                  only the metal, whether every globe takes its own shade, and their sizes. */}
              {pendants && (
                <>
                  <PanelRow label="מתכת — כובע וכבל" stack>
                    <Select
                      aria-label="מתכת"
                      value={built.fitting}
                      onChange={(v) => set({ fitting: v as PendantFitting })}
                      options={PENDANT_FITTINGS.map((f) => ({ value: f, label: FITTING_LABEL[f] }))}
                      className="w-full"
                    />
                  </PanelRow>
                  <SwitchRow
                    checked={built.glassMix}
                    onChange={(on) => set({ glassMix: on })}
                    label="כל גלובוס בגוון אחר"
                    hint={(preview.variants.filter((v) => !v.archived && v.swatch).length || 0) > 1 ? "הגלובוסים מתחלפים לפי הגוונים של הפריט, לפי הסדר." : "הוסיפו לפריט כמה גוונים (ענבר, עשן, שקוף, כרום) — וכל גלובוס יקבל את הבא."}
                  />
                  <SwitchRow checked={built.equal} onChange={(on) => set({ equal: on })} label="כל הגלובוסים באותו גודל" hint={built.equal ? "גלובוסים זהים סביב המרכז." : "בגדלים שונים, צפופים זה ליד זה."} />
                </>
              )}
              {tiered && (
                <PanelRow label="קומות" htmlFor="chandelier-tiers">
                  <NumberField id="chandelier-tiers" decimals={0} min={1} max={CHANDELIER_TIERS_MAX} commitOnBlur value={built.tiers} onChange={(v) => set({ tiers: Math.round(v) })} className="w-20" />
                </PanelRow>
              )}
              {crystalled && (
                <PanelRow label="קריסטל" stack>
                  <Select
                    aria-label="קריסטל"
                    value={built.crystals}
                    onChange={(v) => set({ crystals: v as ChandelierCrystals })}
                    options={CHANDELIER_CRYSTALS.map((k) => ({ value: k, label: CRYSTALS_LABEL[k] }))}
                    className="w-full"
                  />
                </PanelRow>
              )}
              {stranded && (
                <PanelRow label={strandsLabel(built.style)} htmlFor="chandelier-strands">
                  <NumberField id="chandelier-strands" decimals={0} min={0} commitOnBlur value={built.strands} onChange={(v) => set({ strands: Math.round(v) })} className="w-20" />
                </PanelRow>
              )}
              <Note>{chandelierHint(built)}</Note>
            </div>
          );
        })()}

      {/* Which form an arrangement takes — a dome, a low cushion, a wild garden, a cascade, a runner,
          bud vases (lib/catalog/flower-draw.ts). Absent = by its height. The flowers in each tile are
          the row's own spec in its first shade, so the tiles show THIS arrangement six ways. */}
      {(product.category === "flower-arrangements" || product.category === "centerpieces") && (
        <div>
          <span className={fieldLabelClassName}>צורת הסידור</span>
          <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="צורת הסידור">
            {none}
            {[undefined, ...FLOWER_FORMS].map((form) => {
              const chosen = preview.appearance?.symbolStyle;
              const on = !off && (form === undefined ? !isFlowerForm(chosen) : chosen === form);
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
                  onClick={() => pick({ symbolStyle: form })}
                  className={tileClass(on)}
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

      {/* A chuppah's build beyond its style (lib/catalog/chuppah.ts): its posts, their finish, its roof
          — on a round one the roof's section is the base's body — where its flowers are and in what
          colour, a meadow at the posts' feet, sheer drapes. The plan and the room read one layout; a
          plain chuppah stores nothing (chuppahPatch). The rotunda is its own build. */}
      {symbol === "chuppah" &&
        drawStyleOf(preview) !== "rotunda" &&
        (() => {
          const built = chuppahOf(chuppahDrawOf(preview.appearance));
          const set = (patch: ChuppahSpec) => onChange({ chuppah: chuppahPatch(preview.appearance?.chuppah, patch) });
          const fp = resolveFootprint(preview);
          const round = fp.kind === "circle" || fp.kind === "ellipse";
          // What the posts are when the row says nothing: four, or a drawn outline's corners.
          const fpBox = footprintBounds(fp);
          const ownPosts = chuppahLayout(fpBox.w, fpBox.h, round, { ...built, posts: null }, fp.kind === "custom" ? fp.outline : undefined).posts.length;
          const flowered = built.flowers !== "none" || built.roof === "flowers" || built.meadow;
          return (
            <div className="space-y-2">
              {round && onProfile && <RevolveFields value={preview.appearance?.revolve} onChange={(revolve) => onProfile(revolve)} tiles={CHUPPAH_ROOF_TILES} />}
              <PanelRow label="עמודים" htmlFor="chuppah-posts">
                <NumberField id="chuppah-posts" decimals={0} min={0} max={12} commitOnBlur value={built.posts ?? ownPosts} onChange={(v) => set({ posts: Math.round(v) === ownPosts ? undefined : Math.round(v) })} className="w-20" />
              </PanelRow>
              <Note>{built.posts === 0 ? "בלי עמודים — החופה תלויה מהתקרה בכבלים." : round ? "העמודים מסביב, והחזית פתוחה." : "בפינות הצורה; יותר מארבעה — גם לאורך הצלעות הארוכות. 0 = תלויה מהתקרה."}</Note>
              {built.posts !== 0 && (
                <PanelRow label="חומר העמודים" stack>
                  <Select aria-label="חומר העמודים" value={built.finish} onChange={(v) => set({ finish: v as ChuppahFinish })} options={CHUPPAH_FINISHES.map((f) => ({ value: f, label: CHUPPAH_FINISH_LABEL[f] }))} className="w-full" />
                </PanelRow>
              )}
              <PanelRow label="גג" stack>
                <Select aria-label="גג החופה" value={built.roof} onChange={(v) => set({ roof: v as ChuppahRoof })} options={CHUPPAH_ROOFS.map((f) => ({ value: f, label: CHUPPAH_ROOF_LABEL[f] }))} className="w-full" />
              </PanelRow>
              <PanelRow label="פרחים" stack>
                <Select aria-label="פרחי החופה" value={built.flowers} onChange={(v) => set({ flowers: v as ChuppahFlowers })} options={CHUPPAH_FLOWER_SPOTS.map((f) => ({ value: f, label: CHUPPAH_FLOWERS_LABEL[f] }))} className="w-full" />
              </PanelRow>
              {flowered && (
                <PanelRow label="צבע הפרחים">
                  <SwatchField value={built.bloom} onChange={(bloom) => onChange({ chuppah: chuppahPatch({ ...preview.appearance?.chuppah, bloom: undefined }, bloom ? { bloom } : {}) })} label="צבע הפרחים" />
                </PanelRow>
              )}
              <SwitchRow checked={built.meadow} onChange={(on) => set({ meadow: on })} label="פרחים על הרצפה סביב העמודים" />
              {built.posts !== 0 && <SwitchRow checked={built.drapes} onChange={(on) => set({ drapes: on })} label="וילון שיפון בכל עמוד" hint="בד שקוף אסוף בכל עמוד, ומלמעלה ביניהם." />}
            </div>
          );
        })()}

      {/* THE ENVELOPE is the base shape's body (the shape bar's "צללית"), offered here too with an
          arrangement's own outlines: the room lays the heads on it and fills it (lib/scene/flowers.ts).
          A runner and bud vases have none. */}
      {(symbol === "flowers" || symbol === "centerpiece") &&
        onProfile &&
        (() => {
          const b = footprintBounds(resolveFootprint(preview));
          const chosen = preview.appearance?.symbolStyle;
          const form = isFlowerForm(chosen) ? chosen : defaultFlowerForm(preview.dimensions.heightMm, b.w, b.h);
          if (form === "runner" || form === "bud" || form === "single") return null;
          return <RevolveFields value={preview.appearance?.revolve} onChange={(revolve) => onProfile(revolve)} tiles={FLOWER_ENVELOPES} />;
        })()}
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

/** The editor's side-panel groups (2026-11-09, the user's redesign): one folding section per subject,
 *  each reading back its value on its end. Which are open is kept across selections — a designer
 *  working down a row of posts keeps "חזרה" open from one to the next. */
type GroupKey = "picture" | "content" | "seats" | "border" | "look" | "pos" | "height" | "body" | "pin" | "rep" | "arc" | "sweep" | "ring" | "fill" | "texture";
const GROUPS_OPEN: Record<GroupKey, boolean> = {
  picture: true,
  content: false,
  seats: false,
  border: false,
  look: false,
  pos: false,
  height: true,
  body: false,
  pin: false,
  rep: true,
  arc: true,
  sweep: false,
  ring: false,
  fill: false,
  texture: false,
};
type Groups = { open: Record<GroupKey, boolean>; toggle: (k: GroupKey) => void };
const group = (g: Groups, k: GroupKey) => ({ open: g.open[k], onToggle: () => g.toggle(k), variant: "panel" as const });

const cmOf = (mm?: number) => Math.round((mm ?? 0) / 10);

/** A shape's size as the quick bar and the shapes list read it: ⌀ / R for a round one, W×D else. */
function sizeLabel(part: ShapePart): string {
  if (usesDiameter(part.shape)) {
    const field = ROUND_FIELD[part.shape] ?? { label: "קוטר", factor: 1 };
    return `${field.label === "רדיוס" ? "R" : "⌀"}${cmOf((roundSizeMm(part.shape, part) ?? 0) / field.factor)}`;
  }
  return `${cmOf(part.widthMm)}×${cmOf(part.depthMm)}`;
}

/** The small number box the quick bar types sizes into — the sketch bar's h-7, 56px wide. */

/** A selected shape's QUICK bar, at the canvas's foot — the edits made most: which shape, its size,
 *  its turn, and the verbs (redraw, flip/order, duplicate, delete). Everything else about the shape is
 *  a group in the side panel (ShapePanel). */
function ShapeQuickBar({
  part,
  base,
  onReshape,
  onChange,
  onRedraw,
  onDuplicate,
  onRemove,
  more,
  onClose,
}: {
  part: ShapePart;
  /** Whether this is the FIRST shape — the item's box and height. */
  base: boolean;
  onReshape: (shape: MapShape) => void;
  onChange: (p: Partial<ShapePart>) => void;
  onRedraw: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  more: MenuItem[];
  onClose: () => void;
}) {
  const round = usesDiameter(part.shape);
  const drawn = part.shape === "custom";
  const field = ROUND_FIELD[part.shape] ?? { label: "קוטר", factor: 1 };
  const D = roundSizeMm(part.shape, part);
  const deg = Math.round(part.rotation || 0) % 360;
  const turn = (by: number) => onChange({ rotation: ((((part.rotation || 0) + by) % 360) + 360) % 360 });
  const title = drawn ? (part.open ? "קווים" : "צורה חופשית") : SHAPE_LABEL[part.shape];
  return (
    <Bar
      icon={drawn ? (part.open ? Route : PenLine) : Shapes}
      title={title}
      badge={base ? "בסיס" : undefined}
      facts={base ? "מידות הפריט וגובהו" : part.repeat ? `חוזרת ${REPEAT_SHORT[part.repeat.along]}` : undefined}
      onClose={onClose}
    >
      <Popover label="צורה" icon={Shapes} value={drawn ? "חופשית" : SHAPE_LABEL[part.shape]} variant="picker">
        {(close) => (
          <ShapeGrid
            value={part.shape}
            onPick={(s) => {
              onReshape(s);
              close();
            }}
          />
        )}
      </Popover>
      <QuickSep />
      <span title="מידות" className="inline-flex text-muted">
        <Ruler className="h-4 w-4" strokeWidth={1.75} />
      </span>
      {round ? (
        <>
          <QuickUnit>{field.label === "רדיוס" ? "R" : "⌀"}</QuickUnit>
          <QuickNumber min={0} label={`${field.label} (ס״מ)`} value={(D ?? 0) / field.factor / 10} onChange={(v) => onChange({ diameterMm: Math.round(v * 10 * field.factor) })} />
        </>
      ) : (
        <>
          {/* Committed on blur: a size typed digit by digit rescaled the shape at "1", then "12", then
              "120" — a hand-drawn one through rescaleCustomPart each time. */}
          <QuickNumber min={0} label={part.shape === "line" ? "אורך (ס״מ)" : "רוחב (ס״מ)"} value={cmOf(part.widthMm)} onChange={(v) => onChange({ widthMm: Math.round(v * 10) })} />
          <QuickUnit>×</QuickUnit>
          {part.shape === "line" ? (
            <QuickNumber label="עובי (ס״מ)" decimals={1} min={0.1} value={(part.depthMm ?? 0) / 10} onChange={(v) => onChange({ depthMm: Math.max(1, Math.round(v * 10)) })} />
          ) : (
            <QuickNumber min={0} label="עומק (ס״מ)" value={cmOf(part.depthMm)} onChange={(v) => onChange({ depthMm: Math.round(v * 10) })} />
          )}
        </>
      )}
      <QuickUnit>ס״מ</QuickUnit>
      <QuickSep />
      <BarButton icon={RotateCcw} label="רבע סיבוב שמאלה" onClick={() => turn(-90)} />
      <NumberField size="sm" aria-label="זווית במעלות" decimals={0} value={deg} onChange={(v) => onChange({ rotation: ((v % 360) + 360) % 360 })} className="w-12" />
      <QuickUnit>°</QuickUnit>
      <BarButton icon={RotateCw} label="רבע סיבוב ימינה" onClick={() => turn(90)} />
      <QuickSep />
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
      <QuickTail onCopy={onDuplicate} copyLabel="שכפול הצורה · Ctrl+D" onDelete={onRemove} deleteLabel="מחיקת הצורה" more={more} moreLabel="עוד פעולות לצורה" />
    </Bar>
  );
}

const REPEAT_SHORT: Record<RepeatAlong, string> = { corners: "בפינות", edges: "לאורך הצלעות", row: "בשורה", grid: "ברשת" };

/** What a "מראה" group reads back: the fill's swatch and the line's, or that it follows the item. */
function PaintSummary({ style, empty = "כמו הפריט" }: { style: ShapePart["style"]; empty?: string }) {
  if (!style?.fill && !style?.stroke) return <span>{empty}</span>;
  return (
    <>
      {style.fill && <Swatch color={style.fill} size={14} />}
      {style.stroke && <span aria-hidden className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm border-2 bg-surface" style={{ borderColor: style.stroke }} />}
    </>
  );
}

/** A shape's own outline, small — the glyph on its row in the side panel's "צורות בפריט". */
function PartGlyph({ part }: { part: ShapePart }) {
  const f = shapeFootprint(part.shape, part);
  const b = footprintBounds(f);
  // A line's thickness is a sliver at this size; it is drawn at least a twentieth of its length.
  const w = Math.max(b.w, 1);
  const h = Math.max(b.h, w * 0.06);
  const pad = Math.max(w, h) * 0.1;
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-inset">
      <svg viewBox={`${-w / 2 - pad} ${-h / 2 - pad} ${w + pad * 2} ${h + pad * 2}`} className="h-[22px] w-[22px]" aria-hidden>
        <FootprintShape footprint={f} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

/** What the "ציור" group reads back: the picture's version as it is set (its style's label), or
 *  nothing to say when the category has a single drawing. */
function pictureLabel(p: Product, symbol: SymbolKind | null): string | null {
  if (!symbol) return null;
  if (symbol === "chair") return CHAIR_STYLE_LABEL[chairStyleOf(p) ?? "dining"];
  const style = drawStyleOf(p);
  if (symbol === "candlestick") return style ? (CANDLE_STYLE_LABEL[style as keyof typeof CANDLE_STYLE_LABEL] ?? null) : null;
  const set = SYMBOL_STYLES[symbol];
  return set?.label[style ?? set.styles[0]] ?? null;
}

/** A selected shape's side-panel groups — what its quick bar leaves out, one folding section each:
 *  מיקום, גובה, גוף, עיגון, חזרה, the round shapes' own (קשת, חלק מהעיגול, רצועה / ח), מילוי,
 *  טקסטורה. The same for every shape of the item. */
function ShapePanel({
  part,
  others,
  textured,
  color,
  base,
  shapes,
  itemHeightMm,
  onItemHeight,
  onChange,
  groups,
  bodyTiles,
}: {
  /** The tiles the "גוף" group offers instead of the vessels' — a chandelier's silhouettes. */
  bodyTiles?: RevolveTiles;
  part: ShapePart;
  /** The centre of the box the item's OTHER shapes stand in — what "מיקום" is measured from — or
   *  null when this is the only shape. */
  others: { x: number; y: number } | null;
  /** Whether this is the FIRST shape — the one stored as the row's base, which stands on the floor
   *  and is the item's height (the element model: a part's own z and height are the others'). */
  base: boolean;
  /** Every shape, for the חזית view. */
  shapes: readonly ShapePart[];
  itemHeightMm: number;
  onItemHeight: (mm: number) => void;
  /** Whether the item's shapes take a surface here (not where it is drawn as its picture). */
  textured: boolean;
  /** The item's fill, for the texture tiles. */
  color?: string;
  onChange: (p: Partial<ShapePart>) => void;
  groups: Groups;
}) {
  const id = `shape-${part.id}`;
  const cm = cmOf;
  const D = roundSizeMm(part.shape, part);
  const spec = part.shape === "arc" ? arcSpecOf(D || DEFAULT_PRESET_MM.w, part.arc) : null;
  const ringShape = ringShapeOf(part.shape);
  const ringSpec = ringShape ? ringSpecOf(part.widthMm || DEFAULT_PRESET_MM.w, part.depthMm || DEFAULT_PRESET_MM.h, part.ring, ringShape) : null;
  return (
    <>
      {others && (
        <FoldRow {...group(groups, "pos")} icon={Move} title="מיקום" summary={ltr(`${cm(part.x - others.x)}, ${cm(part.y - others.y)}`)}>
          <PanelRow label="אופקי (ס״מ)" htmlFor={`${id}-x`}>
            <NumberField id={`${id}-x`} decimals={0} commitOnBlur value={cm(part.x - others.x)} onChange={(v) => onChange({ x: Math.round(v * 10 + others.x) })} className="w-20" />
          </PanelRow>
          <PanelRow label="אנכי (ס״מ)" htmlFor={`${id}-y`}>
            <NumberField id={`${id}-y`} decimals={0} commitOnBlur value={cm(part.y - others.y)} onChange={(v) => onChange({ y: Math.round(v * 10 + others.y) })} className="w-20" />
          </PanelRow>
          <Note>מרכז הצורה, ביחס למרכז שאר הצורות.</Note>
        </FoldRow>
      )}
      {/* HEIGHT (the element model, Stage 2): the first shape is the item's height from the floor;
          any other may stand at a z of its own, as tall as it says — a shelf a metre up a back-bar,
          a basin's upper tier — which the 3D room builds and the חזית view shows. The plan is
          unchanged: a raised shape is drawn over the shapes under it. */}
      <FoldRow
        {...group(groups, "height")}
        icon={ArrowUpFromLine}
        title="גובה"
        summary={ltr(base ? `${cm(itemHeightMm) || "—"}` : part.zMm ? `${cm(part.heightMm ?? itemHeightMm)} ↑${cm(part.zMm)}` : `${cm(part.heightMm ?? itemHeightMm) || "—"}`)}
      >
        <div className="space-y-1.5">
          <ElevationView shapes={shapes} itemHeightMm={itemHeightMm} selectedId={part.id} />
          {base ? (
            <>
              <PanelRow label="גובה הפריט (ס״מ)" htmlFor={`${id}-height`}>
                <NumberField id={`${id}-height`} decimals={0} min={0} commitOnBlur value={cm(itemHeightMm)} onChange={(v) => onItemHeight(Math.max(0, Math.round(v * 10)))} className="w-20" />
              </PanelRow>
              {/* OUTLINE ONLY (ShapePart.body "none", the element model, Stage 3): the first shape is
                  the item's reach on the plan and builds nothing in the room — the other shapes are the
                  body (a pergola: its posts, beams and slats under the roof's line). */}
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => onChange({ body: part.body === "none" ? undefined : "none" })}>
                {part.body === "none" ? "עם גוף — מלאה בגובה הפריט" : "מתאר בלבד — בלי גוף בתלת־ממד"}
              </Button>
              <Note>
                {part.body === "none"
                  ? "הצורה הראשונה היא קו המתאר של הפריט בלבד; הגוף בחדר הוא שאר הצורות — בפרגולה: העמודים, הקורות והרפפות."
                  : "הצורה הראשונה עומדת על הרצפה בגובה הפריט — אותו גובה שבטופס."}
              </Note>
            </>
          ) : (
            <>
              <PanelRow label="גובה הצורה (ס״מ)" htmlFor={`${id}-height`}>
                <NumberField
                  id={`${id}-height`}
                  decimals={0}
                  min={1}
                  commitOnBlur
                  value={cm(part.heightMm ?? itemHeightMm)}
                  onChange={(v) => onChange({ heightMm: Math.max(10, Math.round(v * 10)) })}
                  className="w-20"
                />
              </PanelRow>
              <PanelRow label="גובה מהרצפה (ס״מ)" htmlFor={`${id}-z`}>
                <NumberField id={`${id}-z`} decimals={0} min={0} commitOnBlur value={cm(part.zMm ?? 0)} onChange={(v) => onChange({ zMm: Math.max(0, Math.round(v * 10)) })} className="w-20" />
              </PanelRow>
              {(part.zMm !== undefined || part.heightMm !== undefined) && (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => onChange({ zMm: undefined, heightMm: undefined })}>
                  כמו הפריט — על הרצפה, בגובה הפריט
                </Button>
              )}
              <Note>בתוכנית הצורה מצוירת כרגיל; בחדר התלת-ממדי היא עומדת בגובה הזה.</Note>
            </>
          )}
        </div>
      </FoldRow>
      {/* THE BODY of a round shape (the element model, lib/element/revolve.ts): a cylinder, or a body
          turned from a side profile — a bowl, a vase, a basin's tier — for the 3D room and the חזית
          view; the plan still draws the circle, which is the body's widest ring. Not for a band or
          a slice, which have no body of revolution. */}
      {(part.shape === "circle" || part.shape === "ellipse") && !part.hollow && !(part.arc?.sweepDeg && part.arc.sweepDeg < 360) && (
        <FoldRow {...group(groups, "body")} icon={Cylinder} title={bodyTiles ? bodyTiles.title.split(" — ")[0] : "גוף"} summary={bodyValue(part, bodyTiles)}>
          <RevolveFields value={part.revolve} onChange={(revolve) => onChange({ revolve })} tiles={bodyTiles} />
        </FoldRow>
      )}
      {/* PIN (Stage 3): how this shape follows a resize of the item on the sketch — against the first
          shape's box. Absent = scaled with the whole, as every part was. Not for the first shape,
          which IS the box, nor for a repeated one, whose copies are laid afresh at every size. */}
      {!base && !part.repeat && (
        <FoldRow {...group(groups, "pin")} icon={Magnet} title="עיגון" summary={pinValue(part.pin)}>
          <PanelRow label="אופקי" stack>
            <Select aria-label="עיגון אופקי" value={part.pin?.x ?? "scale"} onChange={(v) => onChange({ pin: withPin(part.pin, "x", v as PinMode) })} options={PIN_X} className="w-full" />
          </PanelRow>
          <PanelRow label="אנכי" stack>
            <Select aria-label="עיגון אנכי" value={part.pin?.y ?? "scale"} onChange={(v) => onChange({ pin: withPin(part.pin, "y", v as PinMode) })} options={PIN_Y} className="w-full" />
          </PanelRow>
          <Note>מה קורה לצורה הזו כשהפריט נמתח על הסקיצה: נמדד מול הצורה הראשונה. מדף צמוד לימין נשאר במרחקו מהקצה הימני ובגודלו; נמתח — גדל עם הפריט.</Note>
        </FoldRow>
      )}
      {/* REPEAT (Stage 3): this shape laid in copies against the first shape. The copies are drawn
          faint on the canvas; the shape itself is the prototype — its size is the copies' section. */}
      {!base && (
        <FoldRow {...group(groups, "rep")} icon={RepeatIcon} title="חזרה" summary={repeatValue(part.repeat)}>
          <PanelRow label="פריסה" stack>
            <Select
              aria-label="פריסה"
              value={part.repeat?.along ?? ""}
              onChange={(v) => {
                if (!v) return onChange({ repeat: undefined });
                const along = v as RepeatAlong;
                const spacing = along === "row" || along === "grid" ? { spacingMm: part.repeat?.spacingMm ?? DEFAULT_SPACING_MM } : {};
                onChange({ repeat: { ...part.repeat, ...spacing, along }, pin: undefined });
              }}
              options={REPEAT_OPTIONS}
              className="w-full"
            />
          </PanelRow>
          {part.repeat && (part.repeat.along === "row" || part.repeat.along === "grid") && (
            <PanelRow label={part.repeat.along === "grid" ? "מרווח אופקי (ס״מ)" : "מרווח (ס״מ)"} htmlFor={`${id}-rep-s`}>
              <NumberField
                id={`${id}-rep-s`}
                decimals={0}
                min={1}
                commitOnBlur
                value={cm(part.repeat.spacingMm ?? DEFAULT_SPACING_MM)}
                onChange={(v) => onChange({ repeat: { ...part.repeat!, spacingMm: Math.max(10, Math.round(v * 10)) } })}
                className="w-20"
              />
            </PanelRow>
          )}
          {part.repeat?.along === "grid" && (
            <PanelRow label="מרווח אנכי (ס״מ)" htmlFor={`${id}-rep-sy`}>
              <NumberField
                id={`${id}-rep-sy`}
                decimals={0}
                min={1}
                commitOnBlur
                value={cm(part.repeat.spacingYMm ?? part.repeat.spacingMm ?? DEFAULT_SPACING_MM)}
                onChange={(v) => onChange({ repeat: { ...part.repeat!, spacingYMm: Math.max(10, Math.round(v * 10)) } })}
                className="w-20"
              />
            </PanelRow>
          )}
          {part.repeat?.along === "row" && (
            <PanelRow label="כיוון" stack>
              <Select
                aria-label="כיוון השורה"
                value={part.repeat.axis ?? ""}
                onChange={(v) => onChange({ repeat: { ...part.repeat!, axis: v ? (v as "x" | "y") : undefined } })}
                options={[
                  { value: "", label: "לאורך הצד הארוך" },
                  { value: "x", label: "לרוחב — העותקים זה לצד זה" },
                  { value: "y", label: "לעומק — העותקים זה מעל זה" },
                ]}
                className="w-full"
              />
            </PanelRow>
          )}
          {part.repeat && (part.repeat.along === "row" || part.repeat.along === "edges" || part.repeat.along === "grid") && (
            <PanelRow label="שוליים (ס״מ)" htmlFor={`${id}-rep-m`}>
              <NumberField
                id={`${id}-rep-m`}
                decimals={0}
                min={0}
                commitOnBlur
                value={cm(part.repeat.marginMm ?? 0)}
                onChange={(v) => onChange({ repeat: { ...part.repeat!, marginMm: Math.max(0, Math.round(v * 10)) } })}
                className="w-20"
              />
            </PanelRow>
          )}
          <Note>{part.repeat ? REPEAT_HINT[part.repeat.along] : "הצורה הזו תונח בעותקים מול הצורה הראשונה — והעותקים ייפרסו מחדש בכל גודל שהפריט יימתח אליו על הסקיצה."}</Note>
        </FoldRow>
      )}
      {spec && (
        <FoldRow {...group(groups, "arc")} icon={Rainbow} title="קשת" summary={ltr(`${spec.sweepDeg}°`)}>
          <ArcFields idPrefix={id} diameterMm={D ?? 0} arc={part.arc} onChange={(arc) => onChange({ arc })} />
        </FoldRow>
      )}
      {part.shape === "circle" && (
        <FoldRow {...group(groups, "sweep")} icon={ChartPie} title="חלק מהעיגול" summary={sweepValue(part.arc)}>
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
        </FoldRow>
      )}
      {ringShape && ringSpec && (
        <FoldRow {...group(groups, "ring")} icon={Donut} title={RING_LABEL[ringShape]} summary={`רצועה ${cm(ringSpec.bandMm)}`}>
          <RingFields idPrefix={id} shape={ringShape} widthMm={part.widthMm ?? 0} depthMm={part.depthMm ?? 0} ring={part.ring} onChange={(ring) => onChange({ ring })} />
        </FoldRow>
      )}
      {part.shape === "u-shape" && (
        <FoldRow {...group(groups, "ring")} icon={Donut} title="ח" summary={`דלפק ${cm(uShapeBandOf(part.widthMm || DEFAULT_PRESET_MM.w, part.depthMm || DEFAULT_PRESET_MM.h, part.ring))}`}>
          <CounterFields idPrefix={id} widthMm={part.widthMm ?? 0} depthMm={part.depthMm ?? 0} ring={part.ring} onChange={(ring) => onChange({ ring })} />
        </FoldRow>
      )}
      {canHollow(part.shape) && !part.open && !part.revolve && (
        <FoldRow {...group(groups, "fill")} icon={Donut} title="מילוי" summary={hollowValue(part.hollow)}>
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
        </FoldRow>
      )}
      {/* This shape's OWN colours (ShapePart.style): laid over the item's look and kept in every
          shade, a black counter on a white bar. Empty = the item's, as every shape was. */}
      {textured && (
        <FoldRow {...group(groups, "look")} icon={Paintbrush} title="מראה" summary={<PaintSummary style={part.style} />}>
          <StyleFields style={part.style} onChange={(style) => onChange({ style })} strokeWidthDefault={1.5} lineOnly={!!part.open} emptyLabel="כמו הפריט" />
          <Note>{part.open ? "צבע משלה לקווים של הצורה הזו. ריק — כמו הפריט." : "צבעים משלה לצורה הזו בלבד — נשארים כך בכל גוון של הפריט. ריק — כמו הפריט."}</Note>
        </FoldRow>
      )}
      {/* This shape's own surface — a layer of its own, whatever the other shapes wear. */}
      {textured && !part.open && (
        <FoldRow {...group(groups, "texture")} icon={BrickWall} title="טקסטורה" summary={surfaceLabel(part)}>
          <SurfacePicker
            idPrefix={id}
            value={{ texture: part.texture, textureImage: part.textureImage }}
            color={color}
            onChange={(sf) => onChange({ texture: sf.texture, textureImage: sf.textureImage })}
          />
        </FoldRow>
      )}
    </>
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
  // Which side-panel groups are open — kept across selections, for the whole editing session.
  const [groupsOpen, setGroupsOpen] = useState<Record<GroupKey, boolean>>(GROUPS_OPEN);
  // Opened on a row with no size yet, the editor drew it at a starting size (withSizeFor) — said over
  // the canvas until the first edit, so a stand-in size is never mistaken for a measured one.
  const [seeded] = useState(() => !stretch && withSizeFor(product) !== product);
  // The 3D pane (./shape-scene.tsx): mounted on its first opening and kept — closing hides it, so
  // its shaders compile once for this editing session.
  const [scene3d, setScene3d] = useState(false);
  const [sceneMounted, setSceneMounted] = useState(false);
  const toggleScene = () => {
    setSceneMounted(true);
    setScene3d((v) => !v);
  };
  // תוכנית · חזית · צד (lib/element/elevation.ts). The side views' canvas is mounted on the first
  // visit and then kept — hidden while the plan shows — so the room under it compiles once; the plan's
  // canvas is kept too, its view where the designer left it.
  const [view, setView] = useState<"plan" | SideView>("plan");
  // The side view the side canvas shows — kept while the plan is up, so it comes back as it was.
  const [sideView, setSideView] = useState<SideView>("front");
  const [sideMounted, setSideMounted] = useState(false);
  const [roomShown, setRoomShown] = useState(true);
  const side = view === "plan" ? null : view;
  const showView = (v: "plan" | SideView) => {
    if (v !== "plan") {
      setSideMounted(true);
      setSideView(v);
    }
    setArmedShape(null);
    setView(v);
  };
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
  // The copies every repeated shape lays against the first shape (lib/studio/footprint.ts
  // repeatCopies) — drawn faint on the canvas, and what the plan and the room draw of it.
  const copies = shapes.some((s, i) => i > 0 && s.repeat) ? drawnPieces(shapes.filter((s, i) => i === 0 || s.repeat)).slice(1) : [];
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
  const nudge = (dx: number, dy: number) =>
    editShapes((l) =>
      l.map((s, i) => {
        if (!selected.includes(s.id)) return s;
        // In a side view → is across and ↑ is up (a screen's down is the floor's).
        return side ? { ...s, ...elevationNudge(s, i, side, dx, -dy) } : shifted(s, dx, dy);
      }),
    );
  /** A side view's live edit, inside the open undo entry — the shapes, and the item's height when the
   *  first shape's top edge moved. Committed when the gesture ends. */
  const sideEdit = (fn: (list: ShapePart[]) => ShapePart[], itemHeightMm?: number) =>
    hist.amend((d) => {
      const next = withShapes(d, fn(d.shapes));
      return itemHeightMm === undefined ? next : { ...next, look: { ...next.look, dimensions: { ...next.look.dimensions, heightMm: itemHeightMm } } };
    });

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
        ...p.style,
        dash: p.style?.dash ?? draft.appearance?.style?.dash ?? "solid",
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

  // THE FIRST SHAPE'S NUMBERS — the item's box and height, the very ones the drawer's form types under
  // its preview (2026-11-09: "the form and the editor edit the same numbers"). The header names them,
  // the item's quick bar edits them, the footer says they go back to the form.
  const base = shapes[0] ?? null;
  const baseRound = !!base && usesDiameter(base.shape);
  const baseField = (base && ROUND_FIELD[base.shape]) ?? { label: "קוטר", factor: 1 };
  const heightCm = mmToCm(draft.dimensions.heightMm ?? 0);
  const boxText = base
    ? baseRound
      ? `${baseField.label === "רדיוס" ? "R" : "⌀"}${mmToCm((roundSizeMm(base.shape, base) ?? 0) / baseField.factor)}`
      : `${mmToCm(base.widthMm ?? 0)}×${mmToCm(base.depthMm ?? 0)}`
    : null;
  // The figures go in an LRI…PDI isolate: in a Hebrew line "240×120×75" is a run of numbers joined by
  // neutrals, and the bidi algorithm prints it backwards (75×120×240).
  const iso = (t: string) => `⁦${t}⁩`;
  const sizeText = boxText ? (baseRound ? `${iso(boxText)} ס״מ${heightCm ? ` · גובה ${heightCm}` : ""}` : `${iso(`${boxText}${heightCm ? `×${heightCm}` : ""}`)} ס״מ`) : stretch && heightCm ? `גובה ${heightCm} ס״מ` : null;
  const headLine = [draft.name.trim() || "מוצר ללא שם", category?.label, sizeText].filter(Boolean).join(" · ");
  const setBase = (p: Partial<ShapePart>) => editShapes((l) => l.map((s, i) => (i === 0 ? patchedPart(s, p) : s)));
  const setItemHeight = (mm: number) => hist.set((d) => ({ ...d, look: { ...d.look, dimensions: { ...d.look.dimensions, heightMm: mm } } }));
  const CategoryIcon = category?.icon ?? Shapes;
  // What to do next, over the canvas — a refusal first, then the armed shape, then the empty canvas,
  // then the size a new row was opened at (withSizeFor), until the first edit says it was seen.
  const canvasHint =
    hint ??
    (drawingPart
      ? null
      : armedShape
        ? `לחצו על הקנבס כדי להניח ${SHAPE_LABEL[armedShape]} · Esc לביטול`
        : missing
          ? "גררו צורה מהמגירה אל הקנבס, או ״ציור חופשי״"
          : side && !selected.length
            ? "גררו צורה למעלה או למטה כדי לשנות את גובהה מהרצפה"
            : seeded && !hist.canUndo && !selected.length
            ? `גודל התחלתי ל${category?.label ?? "פריט"} — הקלידו את המידות האמיתיות בסרגל למטה`
            : null);

  // ── The side panel: the item's shapes, then the selection's (or the item's) groups ─────────────
  const groups: Groups = { open: groupsOpen, toggle: (k) => setGroupsOpen((g) => ({ ...g, [k]: !g[k] })) };
  const g = (k: GroupKey) => group(groups, k);
  const itemGroups = (
    <>
      {categoryHasSymbol(draft.category) && (
        <FoldRow {...g("picture")} icon={Sparkles} title="ציור" summary={draft.appearance?.symbol === false ? "ללא" : (pictureLabel(preview, previewSymbol) ?? "לפי הקטגוריה")}>
          <PictureFields
            product={draft}
            preview={preview}
            symbol={previewSymbol}
            onChange={setAppearance}
            onProfile={
              shapes[0] && (shapes[0].shape === "circle" || shapes[0].shape === "ellipse") && !shapes[0].hollow
                ? (revolve) => editShapes((list) => list.map((s, i) => (i === 0 ? { ...s, revolve } : s)))
                : undefined
            }
          />
        </FoldRow>
      )}
      {!previewSymbol && !stretch && (
        <FoldRow {...g("content")} icon={Type} title="תוכן" summary={CONTENT_OPTIONS.find(([v]) => v === content)?.[1] ?? ""}>
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
        </FoldRow>
      )}
      {/* Which sides are laid with chairs — a drawing of the table to click on. The chairs are on the
          canvas too, where the effect of a click shows at full size. */}
      {seated && footprint && (
        <FoldRow {...g("seats")} icon={Armchair} title="צדדים לישיבה" summary={blocked.length ? `${blocked.length} חסומים` : "הכול"}>
          <SeatSidesPicker footprint={footprint} seats={seatCount} blocked={blocked} onToggle={toggleSide} className="h-44 w-full rounded-md bg-canvas" />
          <Note>
            {blocked.length
              ? "הצדדים המקווקווים חסומים — הכסאות עוברים לצדדים הפתוחים. לחיצה על צד פותחת אותו שוב."
              : "לחצו על צד כדי שלא יוצבו בו כסאות — שולחן ראש, שולחן צמוד לקיר."}
            {seatCount === 0 && " (כמות הכסאות התקנית נקבעת בטופס, תחת ״על התוכנית״.)"}
          </Note>
        </FoldRow>
      )}
      {/* A rug's or a cloth's contour (lib/catalog/border.ts) — the row's; a plan may give a placement
          its own or none. */}
      {takesBorder(draft) && (
        <FoldRow
          {...g("border")}
          icon={Frame}
          title="קונטור"
          summary={
            <>
              {draft.appearance?.border && <Swatch color={draft.appearance.border.colour} size={12} />}
              <span>{draft.appearance?.border ? `${Math.round(draft.appearance.border.widthMm) / 10} ס״מ` : "ללא"}</span>
            </>
          }
        >
          <div className="space-y-2">
            <SwitchRow
              checked={!!draft.appearance?.border}
              onChange={(on) => setAppearance({ border: on ? newBorder(draft.category) : undefined })}
              label="קונטור"
              hint={draft.category === "rugs" ? "פס צבעוני לאורך שולי השטיח, בתוך הקצה." : "פס צבעוני לאורך שולי המפה."}
            />
            {draft.appearance?.border && <BorderFields border={draft.appearance.border} category={draft.category} onChange={(border) => setAppearance({ border })} idPrefix="a-border" />}
          </div>
        </FoldRow>
      )}
      <FoldRow {...g("look")} icon={Paintbrush} title="מראה" summary={<PaintSummary style={draft.appearance?.style} empty="ברירת מחדל" />}>
        <StyleFields style={draft.appearance?.style} onChange={(style) => setAppearance({ style })} strokeWidthDefault={2} />
        <Note>הגוון הראשון בטופס צובע את הפריט על התוכנית; המילוי כאן משמש כשאין גוונים. צבע לצורה אחת בלבד — בחרו אותה ב״צורות בפריט״.</Note>
      </FoldRow>
    </>
  );
  const panel = (
    <EndPanel screen="editor">
        {!stretch && (
          <>
            <PanelList title="צורות בפריט" count={shapes.length}>
                {shapes.map((s, i) => (
                  <PanelListRow
                    key={s.id}
                    glyph={<PartGlyph part={s} />}
                    label={shapeName(s).replace(/ \d+$/, "")}
                    badge={i > 0 && s.repeat ? REPEAT_SHORT[s.repeat.along] : undefined}
                    meta={
                      <span className="flex items-center gap-1.5">
                        {i === 0 && <span className="rounded-pill bg-accent-wash px-2 py-px text-[11px] font-semibold text-accent-hover">בסיס</span>}
                        <span dir="ltr">{sizeLabel(s)}</span>
                      </span>
                    }
                    selected={selected.includes(s.id)}
                    onClick={(e) => {
                      if (drawingPart) return;
                      setArmedShape(null);
                      setSel((cur) => (e.shiftKey || e.ctrlKey || e.metaKey ? (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]) : [s.id]));
                    }}
                  />
                ))}
              <p className="mx-1 mt-2 text-xs leading-relaxed text-muted">
                {shapes.length <= 1
                  ? "הוסיפו צורות מהמגירה כדי לבנות פריט מכמה חלקים — עמודים, מדף, במה."
                  : "הצורה הראשונה היא בסיס הפריט: היא קובעת את מידותיו ואת גובהו."}
              </p>
            </PanelList>
            <div className="h-px bg-border" />
          </>
        )}
        <PanelGroupsHeader
          title={drawingPart ? "ציור צורה" : one ? shapeName(one).replace(/ \d+$/, "") : selShapes.length > 1 ? `${selShapes.length} צורות נבחרו` : "הפריט"}
          sub={drawingPart || selShapes.length > 1 ? undefined : one ? "מתקדם" : draft.name.trim() || category?.label || undefined}
        />
        {drawingPart ? (
          <p className="px-4 pb-4 text-xs leading-relaxed text-muted">לחצו על הקנבס נקודה אחר נקודה. לחיצה על הנקודה הראשונה או Enter — סגירת הצורה; ״סיום כקווים״ — בלי לסגור.</p>
        ) : one ? (
          <ShapePanel
            part={one}
            others={(() => {
              const rest = shapes.filter((s) => s.id !== one.id);
              if (!rest.length) return null;
              const b = drawnBounds(rest);
              return { x: b.cx, y: b.cy };
            })()}
            textured={textured}
            color={itemColor}
            base={shapes[0]?.id === one.id}
            shapes={shapes}
            itemHeightMm={draft.dimensions.heightMm ?? 0}
            onItemHeight={setItemHeight}
            onChange={(p) => patchShape(one.id, p)}
            groups={groups}
            bodyTiles={(() => {
              if (shapes[0]?.id !== one.id) return undefined;
              if (previewSymbol === "flowers" || previewSymbol === "centerpiece") return FLOWER_ENVELOPES;
              if (previewSymbol === "chuppah") return drawStyleOf(preview) === "rotunda" ? undefined : CHUPPAH_ROOF_TILES;
              if (previewSymbol !== "chandelier") return undefined;
              const st = chandelierOf(drawStyleOf(preview), undefined).style;
              return st === "pendants" ? PENDANT_GLASS_TILES : PROFILED_STYLES.includes(st) ? CHANDELIER_SILHOUETTES : undefined;
            })()}
          />
        ) : selShapes.length > 1 ? (
          <p className="px-4 pb-4 text-xs leading-relaxed text-muted">בחרו צורה אחת כדי לערוך את המאפיינים שלה. יישור, היפוך, שכפול ומחיקה — בסרגל שבתחתית הקנבס.</p>
        ) : (
          itemGroups
        )}
    </EndPanel>
  );

  return (
    // `close`/`cancel` don't bubble in the DOM, but React dispatches them up the FIBER tree anyway —
    // and this modal is rendered INSIDE the product drawer's <dialog>. Without stopPropagation, saving
    // or cancelling ran the drawer's onClose too: the drawer shut and the item being added was thrown
    // away, shape and all.
    <dialog ref={ref} onClose={stopThenClose} onCancel={refuseCancel} className="modal m-auto max-h-none rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog">
      <div className="flex h-[86vh] w-[94vw] max-w-7xl flex-col">
        {/* What is being drawn, named: the category's icon, then the product and the numbers the
            form will get back — so moving between the two never loses which item this is. */}
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-accent-tint text-accent">
            <CategoryIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">מראה על התוכנית</div>
            <div className="nums truncate text-xs text-muted">{headLine}</div>
          </div>
          <div className="flex-1" />
          {!stretch && (
            <IconButton label={scene3d ? "סגירת התלת-ממד" : "תלת-ממד — הפריט בחדר"} pressed={scene3d} onClick={toggleScene}>
              <Box className="h-[18px] w-[18px]" strokeWidth={1.4} />
            </IconButton>
          )}
          <CloseButton onClick={onClose} />
        </header>

        <div className="flex min-h-0 flex-1">
          {!stretch && <ShapeRail armed={armedShape} drawing={!!drawingPart?.isNew} onArm={setArmedShape} onDraw={() => startDrawing()} disabled={!!side} />}

          <div className="relative min-w-0 flex-1 bg-canvas">
            {/* Why something was refused (an outline that crosses itself), for a moment, over the
                canvas — the studio's own hint line — or what to do on an empty canvas. */}
            <div className="pointer-events-none absolute inset-x-0 top-[68px] z-10 flex justify-center" aria-live="polite">
              {canvasHint && <span className="max-w-[70%] rounded-pill bg-ink/85 px-4 py-2 text-center text-[13px] text-canvas">{canvasHint}</span>}
            </div>
            {stretch ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 pb-24">
                <AppearancePreview product={preview} className="max-h-[70%] w-full max-w-md" />
                <p className="text-center text-xs text-muted">{`${category?.label ?? "פריטים אלה"} נמדדים על התוכנית — הגודל נקבע כשמותחים אותם באירוע.`}</p>
                {/* A curtain's style (SYMBOL_STYLES.curtain, spec 2026-11-07 §6.5) — the plan and the 3D
                    only; the quote bills its length whatever it is. */}
                {draft.category === "curtains" && (
                  <div className="w-full max-w-md">
                    <CurtainStyleTiles
                      value={curtainStyleOf(preview)}
                      tone={preview.variants.find((v) => !v.archived && v.swatch)?.swatch ?? preview.appearance?.style?.fill}
                      onPick={(symbolStyle) => setAppearance({ symbolStyle })}
                      labelClassName={fieldLabelClassName}
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
              <div className={"absolute inset-0" + (side ? " invisible pointer-events-none" : "")} aria-hidden={!!side}>
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
                  // …with room round it for its figures and clear of the toolbar and the quick bar.
                  ...(drawn
                    ? (() => {
                        const m = Math.max(drawn.w, drawn.h) * 0.18;
                        return [
                          { x: drawn.minX - m, y: drawn.minY - m },
                          { x: drawn.maxX + m, y: drawn.maxY + m },
                        ];
                      })()
                    : []),
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
                topmost={
                  // A repeated shape's copies, dashed, OVER the shapes (the first shape's fill would
                  // hide them underneath) and taking no pointer — the posts seen in the corners while
                  // their prototype is dragged.
                  copies.length > 0 && (
                    <g className="pointer-events-none">
                      {copies.map((o, i) => (
                        <OutlinePath
                          key={i}
                          outline={o.outline}
                          edgeCurves={o.edgeCurves}
                          open={o.open}
                          fill="none"
                          className="stroke-accent"
                          strokeWidth={1.25}
                          strokeDasharray="80 60"
                          vectorEffect="non-scaling-stroke"
                          opacity={0.7}
                        />
                      ))}
                    </g>
                  )
                }
                defaultDims
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
                              fill={p.style?.fill ?? draft.appearance?.style?.fill ?? "var(--color-inset)"}
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
                              stroke={selected.includes(p.id) ? "var(--color-accent)" : (p.style?.stroke ?? draft.appearance?.style?.stroke ?? "var(--color-ink-soft)")}
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
                            <ItemSurface appearance={{ texture: p.texture, textureImage: p.textureImage }} footprint={shapeFootprint(p.shape, p)} color={p.style?.fill ?? itemColor} seed={p.id} />
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
                    {/* THE FIGURES (the toolbar's ruler, on from the start): the selected shape's size
                        round its turned box — a diameter for an unturned circle — else the whole
                        item's, outside its chairs. The hall editor's own dimension line. */}
                    {ctx.dims &&
                      !drawingPart &&
                      (() => {
                        const box = one ? partBox(one) : drawn ? { x: drawn.cx, y: drawn.cy, widthMm: drawn.w, depthMm: drawn.h } : null;
                        if (!box || selShapes.length > 1) return null;
                        const reach = !one && chairs ? CHAIR_D_MM + 120 : 0;
                        const gap = ctx.mm(14);
                        const minX = box.x - box.widthMm / 2;
                        const maxX = box.x + box.widthMm / 2;
                        const minY = box.y - box.depthMm / 2 - reach;
                        const maxY = box.y + box.depthMm / 2;
                        // A selected shape wears its rotate knob over its top edge, so its width is
                        // figured along the bottom (the hall editor's rule); the whole item, along
                        // the top.
                        const across = one ? maxY + gap : minY - gap;
                        const side = maxX + reach + gap;
                        const roundOne = one ? one.shape === "circle" && !((one.rotation || 0) % 360) && !(one.arc && one.arc.sweepDeg < 360) : false;
                        const tone = one ? "accent" : "ink";
                        return (
                          <>
                            <Dim a={{ x: minX, y: across }} b={{ x: maxX, y: across }} text={`${roundOne ? `⁦⌀${mmToCm(box.widthMm)}⁩` : mmToCm(box.widthMm)} ס״מ`} mm={ctx.mm} tone={tone} rtl />
                            {!roundOne && <Dim a={{ x: side, y: box.y - box.depthMm / 2 }} b={{ x: side, y: maxY }} text={`${mmToCm(box.depthMm)} ס״מ`} mm={ctx.mm} tone={tone} rtl />}
                          </>
                        );
                      })()}
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
                            chandelier={chandelierDrawOf(preview.appearance, preview.variants)} chuppah={chuppahDrawOf(preview.appearance)}
                            postMm={pergolaPostOf(preview)}
                            rise={climbRise(preview)}
                            border={previewSymbol === "runner" ? borderOf(undefined, preview) : undefined}
                          />
                        ) : (
                          <>
                            {/* A cloth's contour, inside the outline being drawn — on the plan it is the
                                hem round the table the cloth falls over. */}
                            {borderOf(undefined, preview) && <FootprintBorder footprint={footprint} border={borderOf(undefined, preview)!} />}
                            <PlanContent content={resolveContent(preview)} w={drawn.w} h={drawn.h} at={labelAnchor(footprint)} />
                          </>
                        )}
                      </g>
                    )}
                  </>
                )}
              />
              </div>
              {/* חזית · צד — the shapes as boxes from their bottom to their top, the room under them. */}
              {sideMounted && (
                <div className={"absolute inset-0" + (side ? "" : " invisible pointer-events-none")} aria-hidden={!side}>
                  <ElevationCanvas
                    view={sideView}
                    shapes={shapes}
                    itemHeightMm={draft.dimensions.heightMm ?? 0}
                    itemStyle={draft.appearance?.style}
                    selected={selected}
                    onSelect={(ids) => {
                      setArmedShape(null);
                      setSel(ids);
                    }}
                    onEdit={sideEdit}
                    onCommit={hist.commit}
                    history={{ canUndo: hist.canUndo, canRedo: hist.canRedo, onUndo: hist.undo, onRedo: hist.redo }}
                    room={shapes.length ? { subject: { key: itemSceneKey(preview), build: () => itemScene(preview) }, itemAt, baseZMm: itemBaseZ(preview) } : null}
                    roomShown={roomShown}
                    hidden={!side}
                    frame={PRODUCT_FRAME}
                  />
                </div>
              )}
              {/* The view switch — the plan's strip is at the top END, so this takes the START. Not
                  while a shape is being drawn: the drawing is the plan's. */}
              {!drawingPart && (
                <div className="absolute top-4 start-4 z-20 flex items-center gap-1 rounded-md bg-surface p-1 shadow-floating">
                  <Segmented label="מבט" hideLabel value={view} options={VIEW_OPTIONS} onChange={showView} />
                  {side && (
                    <IconButton label="החדר מאחורי השרטוט" pressed={roomShown} onClick={() => setRoomShown((v) => !v)}>
                      {roomShown ? <Eye className="h-[18px] w-[18px]" strokeWidth={1.4} /> : <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.4} />}
                    </IconButton>
                  )}
                </div>
              )}
              </>
            )}

            {/* The item in a room of its own, in the canvas's corner — above the bar's band, under
                its popovers (z-40). Hidden, never unmounted, once opened. */}
            {sceneMounted && !stretch && (
              <ScenePane
                subject={shapes.length ? { key: itemSceneKey(preview), build: () => itemScene(preview) } : null}
                open={scene3d}
                onClose={() => setScene3d(false)}
                emptyText="אין עדיין צורה להציג"
              />
            )}

            {/* The QUICK bar at the canvas's foot follows the selection: the shape being drawn, one
                shape (which shape, its size, its turn), several (align, order), or — with nothing
                selected — the item itself: the first shape's size and the item's height, the same
                numbers as the form. Everything else about a selection is in the side panel. */}
            <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
              <div className="pointer-events-auto max-w-full">
                {drawingPart ? (
                  <DrawingBar ed={partEd} isNew={drawingPart.isNew} onCancel={cancelDrawing} onFinish={finishDrawing} />
                ) : one && side ? (
                  <ElevationQuickBar
                    part={one}
                    base={shapes[0]?.id === one.id}
                    title={shapeName(one).replace(/ \d+$/, "")}
                    itemHeightMm={draft.dimensions.heightMm ?? 0}
                    onChange={(p) => patchShape(one.id, p)}
                    onItemHeight={setItemHeight}
                    onDuplicate={() => duplicate([one.id])}
                    onRemove={() => removeShapes([one.id])}
                    more={moreItems(
                      (axis) => flip([one.id], axis),
                      (how) => restack([one.id], how),
                    )}
                    onClose={() => setSel([])}
                  />
                ) : one ? (
                  <ShapeQuickBar
                    part={one}
                    base={shapes[0]?.id === one.id}
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
                    <QuickTail
                      onCopy={() => duplicate(selected)}
                      copyLabel="שכפול הצורות · Ctrl+D"
                      onDelete={() => removeShapes(selected)}
                      deleteLabel="מחיקת הצורות"
                      more={moreItems(
                        (axis) => flip(selected, axis),
                        (how) => restack(selected, how),
                      )}
                      moreLabel="עוד פעולות לנבחרות"
                    />
                  </Bar>
                ) : (
                  <Bar
                    icon={CategoryIcon}
                    title={draft.name.trim() || "הפריט"}
                    facts={stretch ? "נמדד על התוכנית" : base ? `${shapes.length === 1 ? "צורה אחת" : `${shapes.length} צורות`} · בחרו צורה כדי לערוך אותה` : "אין צורות"}
                  >
                    {base && (
                      <>
                        <span title="מידות הצורה הראשונה" className="inline-flex text-muted">
                          <Ruler className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        {baseRound ? (
                          <>
                            <QuickUnit>{baseField.label === "רדיוס" ? "R" : "⌀"}</QuickUnit>
                            <QuickNumber min={0}
                              label={`${baseField.label} (ס״מ)`}
                              value={(roundSizeMm(base.shape, base) ?? 0) / baseField.factor / 10}
                              onChange={(v) => setBase({ diameterMm: Math.round(v * 10 * baseField.factor) })}
                            />
                          </>
                        ) : (
                          <>
                            <QuickNumber min={0} label={base.shape === "line" ? "אורך (ס״מ)" : "רוחב (ס״מ)"} value={mmToCm(base.widthMm ?? 0)} onChange={(v) => setBase({ widthMm: Math.round(v * 10) })} />
                            <QuickUnit>×</QuickUnit>
                            {base.shape === "line" ? (
                              <QuickNumber label="עובי (ס״מ)" decimals={1} min={0.1} value={(base.depthMm ?? 0) / 10} onChange={(v) => setBase({ depthMm: Math.max(1, Math.round(v * 10)) })} />
                            ) : (
                              <QuickNumber min={0} label="עומק (ס״מ)" value={mmToCm(base.depthMm ?? 0)} onChange={(v) => setBase({ depthMm: Math.round(v * 10) })} />
                            )}
                          </>
                        )}
                        <QuickUnit>ס״מ</QuickUnit>
                        <QuickSep />
                      </>
                    )}
                    <span title="גובה הפריט" className="inline-flex text-muted">
                      <ArrowUpFromLine className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <NumberField size="sm" aria-label="גובה הפריט (ס״מ)" decimals={0} min={0} hideZero placeholder="—" commitOnBlur value={heightCm} onChange={(v) => setItemHeight(Math.max(0, Math.round(v * 10)))} className="w-14" />
                    <QuickUnit>ס״מ</QuickUnit>
                  </Bar>
                )}
              </div>
            </div>
          </div>
          {panel}
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-border px-5 py-3">
          {missing ? (
            <span className="text-xs text-alert-ink">יש להוסיף לפחות צורה אחת.</span>
          ) : (
            sizeText && <span className="nums text-xs text-muted">{`${sizeText} · יעודכן בטופס בשמירה`}</span>
          )}
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
