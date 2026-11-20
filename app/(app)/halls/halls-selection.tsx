"use client";

import {
  Accessibility,
  AlignCenterVertical,
  AppWindow,
  Armchair,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BringToFront,
  Building2,
  CircleDot,
  Copy,
  Scissors,
  Cylinder,
  DoorOpen,
  Footprints,
  Grid2x2,
  Layers,
  Layers2,
  Lock,
  LockOpen,
  MousePointer2,
  MoveHorizontal,
  Palette,
  PenLine,
  Plus,
  Ruler,
  SendToBack,
  Shapes,
  SquareDashed,
  Trash2,
  Type,
  Undo2,
  Unlink,
  type LucideIcon,
  FlipHorizontal2,
  Pencil,
  Rows3,
  Spline,
  Zap,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Segmented } from "@/components/segmented";
import { VENUE_EDGE_KINDS, VENUE_EDGE_LABEL, edgeRows, edgesMatter, featureGaps, takesEdgeItems, type VenueEdgeKind } from "@/lib/venues/stage-edges";
import { BUILDING_HEIGHT_MM, featureWorldOutline, followsWalls } from "@/lib/venues/face-surfaces";
import { canEditOutline } from "@/lib/venues/face-surfaces";
import { itemProductOf } from "@/lib/venues/item";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { ProductImage } from "../catalog/product-image";
import { SurfaceTiles } from "@/components/surface-tiles";
import type { DoorOpening, WallDistance } from "@/lib/design-document/stage";
import { Bar, BarButton, ModeVerb, Note, PanelRow, QuickLead, QuickNumber, QuickSep, QuickTail, QuickTurn, QuickUnit, ltr } from "@/components/inspector-bar";
import { Popover } from "@/components/popover";
import { PanelGroups, PickRow, type PanelGroup } from "@/components/end-panel";
import { ShapeGrid, ShapeIcon } from "@/components/shape-grid";
import { Swatch } from "@/components/swatch-field";
import { openingsOn } from "@/lib/venues/structure";
import { Menu, type MenuItem } from "@/components/menu";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { Select } from "@/components/select";
import { StyleFields } from "@/components/style-fields";
import { Switch } from "@/components/toggle";
import { TextField } from "@/components/text-field";
import { SegmentedToggle } from "@/components/plan-canvas";
import { ALIGN_LABEL, needsThree, type AlignOp } from "@/lib/studio/align";
import { bulgeDepthMm, maxBulgeDepthMm, polygonAreaMm2, wallAngleDeg, wallLengthMm } from "@/lib/studio/geometry";
import { ringSpecOf, uShapeBandOf } from "@/lib/studio/footprint";
import type { ElementStyle } from "@/lib/element-style";
import { MAP_SHAPES, SHAPE_LABEL } from "@/lib/catalog/types";
import { climbRunMm, isClimb } from "@/lib/venues/climb";
import { seatingChair, seatingCount, seatingOf, seatingPatch } from "@/lib/venues/seating";
import { canDefineColumns, columnOf, columnPatch } from "@/lib/venues/column";
import { openingsAlong } from "@/lib/venues/wall-split";
import { CURTAIN_FILL, curtainLengthMm, curtainLines, curtainLookPatch, curtainOf, curtainPatch, curtainRail, curtainRailPatch } from "@/lib/venues/curtain";
import { CANTILEVER_MAX_MM, type RailLine } from "@/lib/studio/rail";
import { ledLengthMm } from "@/lib/venues/led";
import { VenueLedPopover } from "./led-panel";
import { CurtainStyleTiles } from "@/components/curtain-style-tiles";
import { wallTrack } from "@/lib/studio/anchor";
import { CHAIR_STYLES, CHAIR_STYLE_LABEL, type ChairStyle } from "@/lib/catalog/symbols";
import { ChairRowsPopover } from "@/components/chair-rows-popover";
import {
  FEATURE_KIND_LABEL,
  PLANT_DEFAULTS,
  PLANT_SPECIES,
  PLANT_SPECIES_LABEL,
  SURFACE_MATERIAL_LABEL,
  WINDOW_HEAD_MM,
  WINDOW_SILL_MM,
  addEntrance,
  doorDistanceFrom,
  doorOffsets,
  featureMovable,
  isVitrine,
  isWindow,
  moveNode,
  nodeMap,
  plantSpecies,
  setWallAngle,
  setWallBulge,
  setWallLength,
  surfaceMaterial,
  surfaceMaterialPatch,
  updateEntrance,
  updateFeature,
  updateWall,
  wallPoints,
  type PlantSpecies,
  type Restack,
  type StructureFeature,
  type SurfaceMaterial,
  type VenueStructure,
  type WallKind,
} from "@/lib/venues/structure";
import { ClimbFields, FEATURE_ICON, PLANT_ICON, SURFACE_ICON } from "@/components/venue-inspector";
import { ZONE_KIND_LABEL, type ZoneKind, type ZoneSource } from "@/lib/venues/zone";
import { MAX_ZONE_MARGIN_MM } from "@/lib/venues/feature-zones";
import { soleKind, type PlanSelection, type PlanSelectionKind } from "@/lib/venues/selection";
// The venue round of 2026-11-07 (spec §2, §9): a wall's own height, and a pool's / surface's rim.
import { SquareSquare } from "lucide-react";
import { setWallHeight } from "@/lib/venues/structure";
import { rimPatch, rimSpecOf, takesRim } from "@/lib/venues/rim";
// The pergola round of 2026-11-07 (spec §5): its own panel.
import { RotateCw } from "lucide-react";
import { TagToggle } from "@/components/tag-toggle";
import { PergolaGlyph } from "@/components/pergola-glyph";
import { NEW_PERGOLA, PERGOLA_LEGS, PERGOLA_LEGS_LABEL, PERGOLA_ROOFS, PERGOLA_ROOF_HINT, PERGOLA_ROOF_LABEL, legsPatch, pergolaGeometry, pergolaOf, pergolaPatch, pergolaSides, type Pergola } from "@/lib/venues/pergola";
import { featureFootprint } from "@/lib/venues/structure";
import type { Footprint } from "@/lib/studio/footprint";

// The hall editor's selection: its QUICK BAR at the canvas's foot and its GROUPS in the end panel
// (2026-11-09, the user's "Studio + Halls" board — the appearance editor's anatomy on this canvas
// too). One component rendered twice (`part`), so each kind's derived numbers live in one place.
//
// Every number is the real stored one in the unit a designer says out loud (metres for a wall,
// centimetres for a door), and every edit goes through lib/venues/structure.ts as one undoable step.

const KIND_NOUN: Record<PlanSelectionKind, string> = {
  zone: "אזורים",
  wall: "קירות",
  node: "פינות",
  door: "כניסות",
  feature: "אלמנטים",
};

const RESTACK: { how: Restack; label: string; icon: LucideIcon }[] = [
  { how: "front", label: "הבאה לחזית", icon: BringToFront },
  { how: "forward", label: "הזזה קדימה", icon: ArrowUp },
  { how: "backward", label: "הזזה אחורה", icon: ArrowDown },
  { how: "back", label: "שליחה לרקע", icon: SendToBack },
];

const ALIGN_OPS: AlignOp[] = ["right", "hcenter", "left", "top", "vmiddle", "bottom", "distribute-x", "distribute-y"];

const EDGE_ICON: Record<VenueEdgeKind, LucideIcon> = { stairs: Footprints, ramp: Accessibility };

/** The "מבנה" chip's panel: the height a closed shape is built to, and the one button that builds it. */
function BuildingDraft({ onBuild, note }: { onBuild: (heightMm: number) => void; note: string }) {
  const [heightCm, setHeightCm] = useState(BUILDING_HEIGHT_MM / 10);
  return (
    <>
      <PanelRow label="גובה המבנה (ס״מ)" htmlFor="building-height">
        <NumberField id="building-height" decimals={0} min={50} max={3000} step={10} commitOnBlur value={heightCm} onChange={setHeightCm} className="w-24" />
      </PanelRow>
      <Button size="sm" className="mt-2 w-full" onClick={() => onBuild(Math.round(heightCm * 10))}>
        מבנה סגור עם תקרה
      </Button>
      <Note>{note}</Note>
    </>
  );
}

/** "מהפינה הימנית" — which corner of a door's wall `corner` is, seen from the door on the plan as it
 *  is drawn: left/right along a wall that runs across the screen, top/bottom along one that runs
 *  down it. */
function cornerWord(door: { x: number; y: number }, corner: { x: number; y: number }): string {
  const dx = corner.x - door.x;
  const dy = corner.y - door.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "מהפינה הימנית" : "מהפינה השמאלית") : dy > 0 ? "מהפינה התחתונה" : "מהפינה העליונה";
}
const m = (mm: number) => (mm / 1000).toFixed(2);
const cmOf = (mm: number) => Math.round(mm / 10);

/** The zone a lone selection is — what its quick bar says about it (the screen resolves it). */
export interface ZoneQuick {
  id: string;
  name: string;
  kind: ZoneKind;
  facts: string;
  /** Drawn by hand (a `region`) — its outline is edited on the plan. */
  freehand: boolean;
}

export interface HallsSelectionProps {
  /** "bar" — the quick bar at the canvas's foot; "groups" — the end panel's groups. The screen
   *  renders this twice, once for each, so every derived number lives in one place. */
  part: "bar" | "groups";
  selection: PlanSelection[];
  structure: VenueStructure;
  /** One discrete, undoable edit. Every mutation here goes through lib/venues/structure.ts. */
  apply: (fn: (s: VenueStructure) => VenueStructure) => void;
  /** Deletes the whole selection. The host owns it — a mixed group spans four collections. */
  onDelete: () => void;
  /** Copies the selected features (Ctrl+C · Ctrl+V does the same). Absent = no duplicate button. */
  onDuplicate?: () => void;
  onClose: () => void;
  /** Drawing order of the selected features. */
  onRestack: (how: Restack) => void;
  canRestack: (how: Restack) => boolean;
  /** Lines the selected features up by the first of them (lib/studio/align.ts). */
  onAlign: (op: AlignOp) => void;
  /** The יישור row under the pointer (null when none) — the host draws the line it would align to. */
  onAlignPreview?: (op: AlignOp | null) => void;
  /** Pins the selected features in place, or frees them (StructureFeature.locked). */
  onLock: (locked: boolean) => void;
  /** THE STAGE'S EDGES — the sketch's own stairs and ramps (lib/venues/stage-edges.ts). */
  activeEdge?: { featureId: string; itemId: string } | null;
  edgePick?: { featureId: string; kind: VenueEdgeKind } | null;
  wallDistance?: WallDistance;
  /** The doors' openings: a flight set into a stage at a door fits though the side hugs the wall. */
  doors?: readonly DoorOpening[];
  onSelectEdge: (featureId: string, itemId: string | null) => void;
  onEdgeChange: (featureId: string, itemId: string, patch: { kind?: VenueEdgeKind; widthMm?: number; risers?: number | null; full?: boolean; inner?: boolean }) => void;
  onRemoveEdge: (featureId: string, itemId: string) => void;
  onFillEdges: (featureId: string, kind: VenueEdgeKind) => void;
  onStartEdge: (featureId: string, kind: VenueEdgeKind) => void;
  /** A picked-but-not-yet-real area — a face just closed by a wall, or a freehand region just
   *  closed. Not a `PlanSelection`: it has no id yet, so it takes over on its own. */
  draftZone?: { source: ZoneSource; name: string; kind: ZoneKind; intent?: "surface" } | null;
  onDraftZoneChange?: (patch: { name?: string; kind?: ZoneKind; source?: ZoneSource }) => void;
  /** The venue's zones made of features (lib/venues/feature-zones.ts), each with its members still on
   *  the plan — what the "אזור" group may re-make out of the selection. */
  featureZones?: { id: string; name: string; featureIds: string[] }[];
  /** "הגדרה כאזור": the selected features named as a zone, the area round them. */
  onFeatureZone?: (featureIds: string[]) => void;
  /** A features zone re-made of these features — a member added or taken out. */
  onSetZoneFeatures?: (zoneId: string, featureIds: string[]) => void;
  onSaveDraftZone?: () => void;
  /** The draft's other answer: lay it in a material WITHOUT naming it a zone. */
  onDraftSurface?: (material: SurfaceMaterial) => void;
  /** …or a BUILDING of that shape: a roofed block this high, not a zone. */
  onDraftBuilding?: (heightMm: number) => void;
  onCancelDraftZone?: () => void;
  /** The free surface whose outline is out for point editing, and the switch for it. */
  outlineEditId?: string | null;
  onToggleOutline?: (featureId: string) => void;
  /** "הגדרה כעמודים": the picked stacks of drawn footprints become columns (lib/venues/column.ts). */
  onDefineColumns?: (featureIds: string[]) => void;
  /** The clipboard (Ctrl+C / Ctrl+X) — offered in the ⋯ of anything with features in it. */
  onCopy?: () => void;
  onCut?: () => void;
  /** A wall's opening picked from its פתחים group. */
  onSelectOpening?: (id: string) => void;
  /** The lone selected zone, resolved by the screen. */
  zone?: ZoneQuick | null;
  onEditZone?: (id: string) => void;
  onSelectZoneMembers?: (id: string) => void;
  /** A freehand zone's outline is out for editing on the plan — and the switch for it. */
  zoneOutlining?: boolean;
  onToggleZoneOutline?: () => void;
}

/** The kind of selection — what the end panel remembers its open groups by (lib/studio/panel-groups.ts). */
function kindKey(selection: PlanSelection[], structure: VenueStructure): string {
  if (selection.length > 1) return "halls:multi";
  const one = selection[0];
  if (!one) return "halls:none";
  if (one.kind === "feature") return `halls:feature:${structure.features.find((f) => f.id === one.id)?.kind ?? "?"}`;
  if (one.kind === "door") return isWindow(structure.entrances.find((e) => e.id === one.id) ?? { kind: "door" }) ? "halls:window" : "halls:door";
  return `halls:${one.kind}`;
}

const G = (key: string, icon: LucideIcon, title: string, summary: ReactNode, body: ReactNode, warn = false): PanelGroup => ({ key, icon, title, summary, body, warn });

/** The hall editor's selection, asked about in two places (2026-11-09, the user's "Studio + Halls"
 *  board): the QUICK BAR at the canvas's foot — what it is, at most three numbers typed in place, one
 *  mode verb, then copy · delete · ⋯ — and the END PANEL's groups, every other field, folded under a
 *  title that reads its value back. It was one bar of popover chips; the fields moved into the
 *  groups as they were, and the chips' values became the groups' summaries. */
export function HallsSelection({
  part,
  selection,
  structure,
  apply,
  onDelete,
  onDuplicate,
  onClose,
  onRestack,
  canRestack,
  onAlign,
  onAlignPreview,
  onLock,
  activeEdge,
  edgePick,
  wallDistance,
  doors,
  onSelectEdge,
  onEdgeChange,
  onRemoveEdge,
  onFillEdges,
  onStartEdge,
  draftZone,
  onDraftZoneChange,
  featureZones,
  onFeatureZone,
  onSetZoneFeatures,
  onSaveDraftZone,
  onDraftSurface,
  onDraftBuilding,
  onCancelDraftZone,
  outlineEditId,
  onToggleOutline,
  onDefineColumns,
  onCopy,
  onCut,
  onSelectOpening,
  zone,
  onEditZone,
  onSelectZoneMembers,
  zoneOutlining,
  onToggleZoneOutline,
}: HallsSelectionProps) {
  const bar = part === "bar";
  const groupsOf = (kind: string, title: string, sub: string | undefined, groups: (PanelGroup | false | null | undefined)[], opts: { note?: string; defaultOpen?: string[] } = {}) => (
    <PanelGroups kind={kind} title={title} sub={sub} note={opts.note} defaultOpen={opts.defaultOpen} groups={groups.filter((g): g is PanelGroup => !!g)} />
  );

  // ── a zone being named ───────────────────────────────────────────────────────────────────────
  if (draftZone) {
    // Traced from "ציור חופשי": a surface, whose one question is what it is laid in.
    if (draftZone.intent === "surface") {
      if (!bar)
        return groupsOf(
          "halls:draft-surface",
          "משטח חדש",
          "ממה הוא עשוי?",
          [G("material", Grid2x2, "חומר", "בחירה", <SurfaceTiles label="" onChange={(m) => m && onDraftSurface?.(m)} />)],
          { defaultOpen: ["material"] },
        );
      return (
        <Bar icon={Grid2x2} title="משטח חדש" facts="בחרו ממה הוא עשוי — בלוח שבצד" onClose={onCancelDraftZone}>
          <SurfaceTiles label="" columns={9} onChange={(m) => m && onDraftSurface?.(m)} />
        </Bar>
      );
    }
    const src = draftZone.source;
    const title = src.type === "face" ? "מתן שם לשטח הסגור" : src.type === "features" ? "אזור מהאלמנטים שנבחרו" : "מתן שם לשטח המסומן";
    const facts = src.type === "features" ? `${src.featureIds.length === 1 ? "אלמנט אחד" : `${src.featureIds.length} אלמנטים`} · האזור זז ומשתנה איתם` : undefined;
    if (!bar)
      return groupsOf("halls:draft", title, facts, [
        src.type === "features" &&
          G(
            "margin",
            Ruler,
            "מרווח",
            `${m(src.marginMm)} מ׳`,
            <PanelRow label="מרווח סביב האלמנטים (מ׳)" htmlFor="draft-margin">
              <NumberField
                id="draft-margin"
                decimals={1}
                min={0}
                max={MAX_ZONE_MARGIN_MM / 1000}
                step={0.5}
                value={src.marginMm / 1000}
                onChange={(v) => onDraftZoneChange?.({ source: { ...src, marginMm: Math.round(v * 1000) } })}
                className="w-20"
              />
            </PanelRow>,
          ),
        // Or not a zone at all: the shape is only to be COLOURED — a path, a bed, a lot the events
        // never book (the user, 2026-10-17).
        !!onDraftSurface &&
          G(
            "surface",
            Grid2x2,
            "משטח בלבד",
            "בלי אזור",
            <>
              <SurfaceTiles label="" onChange={(mat) => mat && onDraftSurface(mat)} />
              <Note>
                {src.type === "face"
                  ? "ממלא את השטח הסגור בחומר מקיר לקיר, בלי להגדיר אותו כאזור: הוא לא נכנס לרשימת האזורים, והמשטח זז עם הקירות שסביבו."
                  : src.type === "features"
                    ? "השטח שמסביב לאלמנטים נפרש בחומר בלי להגדיר אותו כאזור. המשטח נשאר בצורה הזו ולא זז איתם; אפשר להזיז אותו ולשנות את קוויו אחר כך."
                    : "השטח המסומן נפרש בחומר בלי להגדיר אותו כאזור. אפשר להזיז אותו ולשנות את קוויו אחר כך."}
              </Note>
            </>,
          ),
        // Or a building: the kitchen and the offices are a block with a roof, not a room an event
        // books (the user, 2026-10-30).
        !!onDraftBuilding &&
          G(
            "building",
            Building2,
            "מבנה",
            "בלי אזור",
            <BuildingDraft
              onBuild={onDraftBuilding}
              note={
                src.type === "face"
                  ? "השטח הסגור הופך למבנה בנוי עם תקרה — בלי להגדיר אותו כאזור: הוא לא נכנס לרשימת האזורים, ובמבט התלת־ממדי הוא גוש סגור בגובה הזה. המבנה זז עם הקירות שסביבו."
                  : "השטח המסומן הופך למבנה בנוי עם תקרה, בלי להגדיר אותו כאזור. אפשר להזיז אותו ולשנות את קוויו אחר כך."
              }
            />,
          ),
      ]);
    return (
      <Bar icon={src.type === "features" ? SquareDashed : Layers} title={title} facts={facts} onClose={onCancelDraftZone}>
        <TextField autoFocus aria-label="שם האזור" value={draftZone.name} onChange={(name) => onDraftZoneChange?.({ name })} placeholder="שם האזור" className="w-48" />
        <SegmentedToggle
          value={draftZone.kind}
          options={(Object.keys(ZONE_KIND_LABEL) as ZoneKind[]).map((k) => ({ value: k, label: ZONE_KIND_LABEL[k] }))}
          onChange={(kind) => onDraftZoneChange?.({ kind })}
          ariaLabel="סוג האזור"
        />
        <div className="min-w-4 flex-1" />
        <Button size="sm" variant="ghost" onClick={onCancelDraftZone}>
          ביטול
        </Button>
        <Button size="sm" onClick={onSaveDraftZone} disabled={!draftZone.name.trim()}>
          שמירה
        </Button>
      </Bar>
    );
  }

  if (selection.length === 0) return null;

  const featureIds = selection.filter((r) => r.kind === "feature").map((r) => r.id);
  const features = featureIds.map((id) => structure.features.find((f) => f.id === id)).filter((f): f is StructureFeature => !!f);
  const allLocked = features.length > 0 && features.every((f) => f.locked);
  const kind = kindKey(selection, structure);

  // The ⋯: what used to be the bar's rarer chips — name these as a zone, define them as columns,
  // lock, the drawing order. Each section starts with a hairline.
  const ownZone = (() => {
    const ids = features.map((f) => f.id);
    return featureZones?.find((z) => z.featureIds.length === ids.length && ids.every((id) => z.featureIds.includes(id)));
  })();
  const moreItems = (): MenuItem[] => {
    if (features.length === 0) return [];
    const ids = features.map((f) => f.id);
    const items: MenuItem[] = [];
    // The clipboard first — the header's העתקה / גזירה went, Ctrl+C / Ctrl+X stay; the quick bar's
    // copy button is a duplicate, not the clipboard (a copy can be pasted into another venue).
    if (onCopy) items.push({ label: "העתקה · Ctrl+C", icon: Copy, onSelect: onCopy });
    if (onCut) items.push({ label: "גזירה · Ctrl+X", icon: Scissors, onSelect: onCut });
    const sectionStart = items.length;
    if (onFeatureZone && !ownZone) items.push({ label: ids.length === 1 ? "הגדרת האלמנט כאזור" : `הגדרת ${ids.length} האלמנטים כאזור`, icon: SquareDashed, onSelect: () => onFeatureZone(ids) });
    if (onDefineColumns && canDefineColumns(features))
      items.push({ label: features.length === 1 ? "הגדרה כעמוד" : "הגדרה כעמודים", icon: Cylinder, onSelect: () => onDefineColumns(ids) });
    if (sectionStart > 0 && items.length > sectionStart) items[sectionStart] = { ...items[sectionStart], separated: true };
    items.push({ label: allLocked ? "שחרור הנעילה · Ctrl+Shift+L" : "נעילה במקום · Ctrl+Shift+L", icon: allLocked ? LockOpen : Lock, onSelect: () => onLock(!allLocked), separated: items.length > 0 });
    RESTACK.filter((r) => canRestack(r.how)).forEach((r, i) => items.push({ label: r.label, icon: r.icon, onSelect: () => onRestack(r.how), separated: i === 0 }));
    return items;
  };

  // `tintOnly` for what is drawn as a picture (a lawn, a palm): its drawing reads the fill as its
  // tint and has no line to style, so the line rows did nothing there.
  const styleGroup = (style: ElementStyle | undefined, onChange: (style: ElementStyle | undefined) => void, tintOnly = false) =>
    G(
      "look",
      Palette,
      "מראה",
      style?.fill ? <Swatch color={style.fill} size={12} /> : "ברירת מחדל",
      <>
        <StyleFields style={style} onChange={onChange} strokeWidthDefault={1.25} fillOnly={tintOnly} fillLabel={tintOnly ? "גוון" : undefined} />
        {tintOnly && <Note>הגוון מחליף את הצבע של החומר עצמו. ניקוי השדה מחזיר את הצבע המקורי.</Note>}
      </>,
    );

  // "אזור" — the selected features named as a zone of their own, WITHOUT drawing round them (the
  // user, 2026-10-17: "define the canopies as zones"). A selection that already IS a zone's features
  // says which; any other zone made of features can be re-made of the selection.
  const zoneGroup = (() => {
    if (!onFeatureZone || features.length === 0) return null;
    const ids = features.map((f) => f.id);
    const others = (featureZones ?? []).filter((z) => z !== ownZone);
    const what = ids.length === 1 ? "האלמנט" : `${ids.length} האלמנטים`;
    return G(
      "zone",
      SquareDashed,
      "אזור",
      ownZone ? ownZone.name || "ללא שם" : "הגדרה",
      <>
        {ownZone ? (
          <Note>{`${ids.length === 1 ? "האלמנט הזה הוא" : "האלמנטים האלה הם"} האזור ״${ownZone.name || "ללא שם"}״ — הוא עוטף אותם וזז איתם. שם, סוג ומרווח: בעריכת האזור ברשימה.`}</Note>
        ) : (
          <>
            <Button size="sm" className="w-full" onClick={() => onFeatureZone(ids)}>
              {`הגדרת ${what} כאזור`}
            </Button>
            <Note>בלי לצייר סביבם: האזור עוטף את האלמנטים במרווח שתבחרו, וזז ומשתנה איתם — למשל חופה: הבמה, המסלול והבריכה.</Note>
          </>
        )}
        {others.length > 0 && onSetZoneFeatures && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-border-soft pt-3">
            <p className="text-xs font-medium text-ink-soft">{ownZone ? "או להגדיר אזור אחר לפיהם:" : "או לעדכן אזור קיים לפי הנבחרים:"}</p>
            {others.map((z) => (
              <Button key={z.id} size="sm" variant="outline" className="w-full" onClick={() => onSetZoneFeatures(z.id, ids)}>
                {`עדכון ״${z.name || "ללא שם"}״`}
              </Button>
            ))}
          </div>
        )}
      </>,
    );
  })();

  // ── several things ───────────────────────────────────────────────────────────────────────────
  if (selection.length > 1) {
    const sole = soleKind(selection);
    const wallIds = sole === "wall" ? selection.map((s) => s.id) : [];
    const units = features.filter((f) => !f.locked).length;
    const title = `${selection.length} ${sole ? KIND_NOUN[sole] : "פריטים"} נבחרו`;
    const wallKindNow = structure.walls.find((w) => w.id === wallIds[0])?.kind ?? "wall";
    if (!bar)
      return groupsOf(kind, title, "גרירה מזיזה את כולם יחד", [
        // A field only appears for a group when it means the same thing for every member. Length
        // doesn't (six walls have six lengths); kind does.
        wallIds.length > 0 &&
          G(
            "kind",
            Layers,
            "סוג",
            wallKindNow === "edge" ? "גבול שטח" : "קיר",
            <SegmentedToggle
              value={wallKindNow}
              options={[
                { value: "wall" as WallKind, label: "קיר" },
                { value: "edge" as WallKind, label: "גבול שטח" },
              ]}
              onChange={(k) =>
                apply((s) => {
                  let next = s;
                  for (const id of wallIds) next = updateWall(next, id, { kind: k });
                  return k === "edge" ? { ...next, entrances: next.entrances.filter((e) => !wallIds.includes(e.wallId)) } : next;
                })
              }
              ariaLabel="סוג הקירות" fill
            />,
          ),
        features.length > 0 && styleGroup(features[0].style, (style) => apply((s) => features.reduce((acc, f) => updateFeature(acc, f.id, { style }), s))),
        zoneGroup,
      ]);
    return (
      <Bar icon={Layers} title={title} facts="גרירה מזיזה את כולם יחד" onClose={onClose}>
        {features.length > 0 && (
          <QuickTurn
            value={features.every((f) => f.rotationDeg === features[0].rotationDeg) ? features[0].rotationDeg : null}
            onChange={(deg) => apply((s) => features.reduce((acc, f) => (f.locked ? acc : updateFeature(acc, f.id, { rotationDeg: deg })), s))}
          />
        )}
        {units > 1 && (
          <>
            <QuickSep />
            <Menu
              label="יישור — לפי הראשון שנבחר"
              trigger="pill"
              triggerText="יישור"
              icon={AlignCenterVertical}
              side="top"
              items={ALIGN_OPS.filter((op) => !needsThree(op) || units > 2).map<MenuItem>((op) => ({
                label: ALIGN_LABEL[op],
                onSelect: () => onAlign(op),
                onHover: onAlignPreview ? (h) => onAlignPreview(h ? op : null) : undefined,
              }))}
            />
          </>
        )}
        <QuickTail
          onCopy={onDuplicate && features.length > 0 ? onDuplicate : undefined}
          copyLabel="שכפול הנבחרים · Ctrl+D"
          onDelete={onDelete}
          deleteLabel="מחיקת הנבחרים"
          deleteDisabled={allLocked}
          more={moreItems()}
          moreLabel="עוד פעולות לנבחרים"
        />
      </Bar>
    );
  }

  const one = selection[0];

  // ── a zone: its fields live in its dialog; the bar has its verbs ─────────────────────────────
  if (one.kind === "zone") {
    if (!zone) return null;
    if (!bar) return groupsOf("halls:zone", zone.name || "ללא שם", "אזור", [], { note: "השדות של האזור — בחלון ״עריכת האזור״. כאן: הרשימה, והאזור מסומן בה." });
    return (
      <Bar icon={SquareDashed} title={zone.name || "ללא שם"} facts={zone.facts} onClose={onClose}>
        {onEditZone && <ModeVerb icon={Pencil} label="עריכת האזור" onClick={() => onEditZone(zone.id)} />}
        {onSelectZoneMembers && <BarButton icon={MousePointer2} label="בחירת הפריטים באזור" onClick={() => onSelectZoneMembers(zone.id)} />}
        {zone.freehand && onToggleZoneOutline && <ModeVerb icon={PenLine} label="עריכת הקווים" active={zoneOutlining} onClick={onToggleZoneOutline} />}
        <QuickTail onDelete={onDelete} deleteLabel="מחיקת האזור" />
      </Bar>
    );
  }

  // ── a wall ───────────────────────────────────────────────────────────────────────────────────
  if (one.kind === "wall") {
    const wall = structure.walls.find((w) => w.id === one.id);
    const pts = wall ? wallPoints(structure, wall) : null;
    if (!wall || !pts) return null;
    const openings = openingsOn(structure, wall.id);
    const doorsN = openings.filter((o) => o.kind !== "window").length;
    const windowsN = openings.length - doorsN;
    const length = wallLengthMm(pts.a, pts.b);
    const maxBulge = Math.round(maxBulgeDepthMm(length) / 10);
    const bulgeCm = Math.round(bulgeDepthMm(pts.a, pts.b, wall.curve ?? null) / 10);
    const title = wall.kind === "edge" ? "גבול שטח" : "קיר";
    const facts = [`${m(length)} מ׳`, doorsN > 0 ? `${doorsN} כניסות` : null, windowsN > 0 ? `${windowsN} חלונות` : null].filter(Boolean).join(" · ");
    const addOpening = (kindOf: "door" | "window") =>
      apply((s) => {
        const w = s.walls.find((x) => x.id === wall.id);
        const p = w ? wallPoints(s, w) : null;
        if (!w || !p) return s;
        const half = Math.round(wallLengthMm(p.a, p.b) / 2);
        return addEntrance(
          s,
          kindOf === "door"
            ? { wallId: w.id, distanceMm: half, widthMm: 1600, swingInward: true, doubleDoor: true }
            : { wallId: w.id, distanceMm: half, widthMm: 2000, swingInward: false, doubleDoor: false, kind: "window" },
        ).structure;
      });
    if (!bar)
      return groupsOf(kind, title, facts, [
        G(
          "size",
          Ruler,
          "מידות",
          `${m(length)} מ׳`,
          <>
            <PanelRow label="אורך (מ׳)" htmlFor="wall-length">
              <NumberField id="wall-length" decimals={2} min={0.1} step={0.1} commitOnBlur value={length / 1000} onChange={(v) => apply((s) => setWallLength(s, wall.id, v * 1000))} className="w-20" />
            </PanelRow>
            {/* The wall's own height (Wall.heightMm) — blank is the room's. */}
            <PanelRow label="גובה (ס״מ)" htmlFor="wall-height">
              <NumberField
                id="wall-height"
                decimals={0}
                min={0}
                step={10}
                commitOnBlur
                hideZero
                placeholder="לפי החדר"
                value={wall.heightMm ? Math.round(wall.heightMm / 10) : 0}
                onChange={(cm) => apply((s) => setWallHeight(s, wall.id, cm > 0 ? cm * 10 : undefined))}
                className="w-20"
              />
            </PanelRow>
            <Note>{wall.kind === "edge" ? "גובה לגבול הופך אותו לגדר או לקיר נמוך בתלת־ממד. 0 — גבול נמוך בלבד, כמו עד היום." : "0 — לפי החדר: כגובה התקרה של האזור או המבנה שהקיר גובל בו."}</Note>
          </>,
        ),
        wall.kind === "wall" &&
          G(
            "openings",
            DoorOpen,
            "פתחים",
            openings.length === 0 ? "אין" : openings.length === 1 ? openings[0].label : `${openings.length} פתחים`,
            <>
              {openings.length === 0 ? (
                <p className="text-sm text-muted">אין פתחים בקיר.</p>
              ) : (
                <div className="flex flex-col overflow-hidden rounded-md border border-inset-border">
                  {openings.map((o, i) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onSelectOpening?.(o.id)}
                      className={"flex items-center gap-2 px-2.5 py-2 text-start transition-colors hover:bg-inset " + (i ? "border-t border-border-soft" : "")}
                    >
                      {o.kind === "window" ? <AppWindow className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} /> : <DoorOpen className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{o.label}</span>
                      <span className="nums whitespace-nowrap text-xs text-muted">{`${cmOf(o.widthMm)} ס״מ · ${m(o.fromCornerMm)} מ׳ מהפינה`}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="soft" icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.25} />} onClick={() => addOpening("door")}>
                  דלת
                </Button>
                <Button size="sm" variant="soft" icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.25} />} onClick={() => addOpening("window")}>
                  חלון
                </Button>
              </div>
            </>,
          ),
        G(
          "kind",
          Layers,
          "סוג",
          title,
          <>
            <SegmentedToggle
              value={wall.kind}
              options={[
                { value: "wall" as WallKind, label: "קיר" },
                { value: "edge" as WallKind, label: "גבול שטח" },
              ]}
              onChange={(k) =>
                apply((s) => {
                  const next = updateWall(s, wall.id, { kind: k });
                  return k === "edge" ? { ...next, entrances: next.entrances.filter((e) => e.wallId !== wall.id) } : next;
                })
              }
              ariaLabel="סוג הקיר" fill
            />
            <Note>קיר יכול לשאת דלתות וחלונות; גבול שטח הוא קו שרואים ולא נכנסים בו — מעבר אליו מוריד את הפתחים שבקיר.</Note>
          </>,
        ),
        G(
          "bow",
          Spline,
          "קשת",
          bulgeCm ? `${bulgeCm} ס״מ` : "ישר",
          <PanelRow label={`עיקום (ס״מ, עד ${maxBulge})`} htmlFor="wall-bulge">
            <NumberField id="wall-bulge" decimals={0} min={0} max={maxBulge} step={5} commitOnBlur value={bulgeCm} onChange={(cm) => apply((s) => setWallBulge(s, wall.id, cm * 10))} className="w-20" />
          </PanelRow>,
        ),
      ], { defaultOpen: ["size", "openings"] });
    return (
      <Bar icon={Shapes} title={title} facts={facts} onClose={onClose}>
        <QuickLead icon={Ruler} label="אורך" />
        <QuickNumber label="אורך (מ׳)" decimals={2} min={0.1} value={length / 1000} onChange={(v) => apply((s) => setWallLength(s, wall.id, v * 1000))} />
        <QuickUnit>מ׳</QuickUnit>
        <QuickSep />
        <QuickTurn value={Math.round(wallAngleDeg(pts.a, pts.b))} onChange={(deg) => apply((s) => setWallAngle(s, wall.id, deg))} label="זווית הקיר" />
        <QuickSep />
        <QuickLead icon={Spline} label="קשת" />
        <QuickNumber label={`עיקום (ס״מ, עד ${maxBulge})`} narrow min={0} max={maxBulge} value={bulgeCm} onChange={(cm) => apply((s) => setWallBulge(s, wall.id, cm * 10))} />
        <QuickUnit>ס״מ</QuickUnit>
        {wall.kind === "wall" && (
          <>
            <QuickSep />
            <Menu
              label="הוספת פתח באמצע הקיר"
              trigger="pill"
              triggerText="פתח"
              icon={DoorOpen}
              side="top"
              items={[
                { label: "דלת", icon: DoorOpen, onSelect: () => addOpening("door") },
                { label: "חלון / ויטרינה", icon: AppWindow, onSelect: () => addOpening("window") },
              ]}
            />
          </>
        )}
        <QuickTail onDelete={onDelete} deleteLabel="מחיקת הקיר" />
      </Bar>
    );
  }

  // ── a corner ─────────────────────────────────────────────────────────────────────────────────
  if (one.kind === "node") {
    const node = nodeMap(structure).get(one.id);
    if (!node) return null;
    const attached = structure.walls.filter((w) => w.a === node.id || w.b === node.id).length;
    const moveTo = (p: { x: number; y: number }) => apply((s) => moveNode(s, node.id, p));
    if (!bar)
      return groupsOf(kind, "פינה", `${attached} קירות נפגשים כאן`, [
        G(
          "position",
          Ruler,
          "מיקום",
          ltr(`${m(node.x)}, ${m(node.y)}`),
          <>
            <PanelRow label="X (מ׳)" htmlFor="node-x">
              <NumberField id="node-x" decimals={2} step={0.1} commitOnBlur value={node.x / 1000} onChange={(v) => moveTo({ x: Math.round(v * 1000), y: node.y })} className="w-20" />
            </PanelRow>
            <PanelRow label="Y (מ׳)" htmlFor="node-y">
              <NumberField id="node-y" decimals={2} step={0.1} commitOnBlur value={node.y / 1000} onChange={(v) => moveTo({ x: node.x, y: Math.round(v * 1000) })} className="w-20" />
            </PanelRow>
            <Note>החיצים מזיזים פינה נבחרת ב־10 ס״מ, עם Shift ב־50.</Note>
          </>,
        ),
      ], { defaultOpen: ["position"] });
    return (
      <Bar icon={CircleDot} title="פינה" facts={`${attached} קירות נפגשים כאן`} onClose={onClose}>
        <QuickUnit>X</QuickUnit>
        <QuickNumber label="X (מ׳)" decimals={2} value={node.x / 1000} onChange={(v) => moveTo({ x: Math.round(v * 1000), y: node.y })} />
        <QuickUnit>Y</QuickUnit>
        <QuickNumber label="Y (מ׳)" decimals={2} value={node.y / 1000} onChange={(v) => moveTo({ x: node.x, y: Math.round(v * 1000) })} />
        <QuickUnit>מ׳</QuickUnit>
        <QuickTail onDelete={onDelete} deleteLabel="מחיקת הפינה" />
      </Bar>
    );
  }

  // ── a door or a window ───────────────────────────────────────────────────────────────────────
  if (one.kind === "door") {
    const door = structure.entrances.find((e) => e.id === one.id);
    const wall = door ? structure.walls.find((w) => w.id === door.wallId) : null;
    const pts = wall ? wallPoints(structure, wall) : null;
    if (!door || !pts) return null;
    const len = wallLengthMm(pts.a, pts.b);
    const off = doorOffsets(door, len);
    // The two corners the distance can run from, named by where they lie on the plan as it is drawn.
    const centre = { x: pts.a.x + ((pts.b.x - pts.a.x) * door.distanceMm) / (len || 1), y: pts.a.y + ((pts.b.y - pts.a.y) * door.distanceMm) / (len || 1) };
    const from = door.measureFrom === "b" ? "b" : "a";
    const setCentre = (centreMm: number) => apply((s) => updateEntrance(s, door.id, { distanceMm: doorDistanceFrom(door, len, centreMm) }));
    const setWidth = (cm: number) =>
      apply((s) => {
        const widthMm = Math.round(cm * 10);
        // The corner it is measured from stays where it was: a wider door grows away from it.
        return updateEntrance(s, door.id, { widthMm, distanceMm: doorDistanceFrom({ ...door, widthMm }, len, off.toEdgeMm + widthMm / 2) });
      });
    const window = isWindow(door);
    const vitrine = window && isVitrine(door);
    const sillMm = door.sillMm ?? 0;
    const glassMm = door.headMm !== undefined ? Math.max(0, door.headMm - sillMm) : null;
    const glassWords = !window ? (door.doubleDoor ? "כנף כפולה" : "כנף יחידה") : vitrine ? "זכוכית מהרצפה עד התקרה" : `${cmOf(sillMm)} ס״מ מהרצפה · ${glassMm !== null ? `גובה ${cmOf(glassMm)} ס״מ` : "עד הקיר"}`;
    const title = window ? (vitrine ? "ויטרינה" : "חלון") : "כניסה";
    const facts = `${cmOf(door.widthMm)} ס״מ · ${m(off.toEdgeMm)} מ׳ ${cornerWord(centre, from === "a" ? pts.a : pts.b)} · ${glassWords}`;
    const curtained = !window && structure.features.some((f) => {
      // On the door's wall, or on the wall it was split from (lib/venues/wall-split.ts).
      const c = f.kind === "curtain" ? curtainOf(f) : null;
      return !!c && openingsAlong(structure, c.wallId).some((o) => o.opening.id === door.id);
    });
    if (!bar)
      return groupsOf(kind, title, `על ה${wall?.kind === "edge" ? "גבול" : "קיר"}`, [
        G(
          "position",
          Ruler,
          "מיקום",
          `${m(off.toEdgeMm)} · ${m(off.farEdgeMm)} מ׳`,
          <>
            <div className="py-1">
              <Segmented
                label="מדידה מ־"
                value={from}
                options={[
                  ["a", cornerWord(centre, pts.a)],
                  ["b", cornerWord(centre, pts.b)],
                ] as const}
                onChange={(v) => apply((s) => updateEntrance(s, door.id, { measureFrom: v === "b" ? "b" : undefined }))}
              />
            </div>
            <PanelRow label="מהפינה עד הפתח (מ׳)" htmlFor="door-edge">
              <NumberField id="door-edge" decimals={2} min={0} max={Math.max(0, (len - door.widthMm) / 1000)} step={0.1} commitOnBlur value={off.toEdgeMm / 1000} onChange={(v) => setCentre(v * 1000 + door.widthMm / 2)} className="w-20" />
            </PanelRow>
            <PanelRow label="מהפינה עד אמצע הפתח (מ׳)" htmlFor="door-at">
              <NumberField id="door-at" decimals={2} min={0} max={len / 1000} step={0.1} commitOnBlur value={off.toCentreMm / 1000} onChange={(v) => setCentre(v * 1000)} className="w-20" />
            </PanelRow>
            <Note>{`מהפינה השנייה עד הפתח: ${m(off.farEdgeMm)} מ׳. המידות מסומנות על התוכנית כש${window ? "החלון" : "הכניסה"} נבחר${window ? "" : "ת"}.`}</Note>
          </>,
        ),
        window
          ? G(
              "glass",
              AppWindow,
              "זכוכית",
              vitrine ? "ויטרינה" : "חלון",
              <>
                <div className="py-1">
                  <Segmented
                    label="סוג"
                    value={vitrine ? "vitrine" : "window"}
                    options={[
                      ["vitrine", "ויטרינה"],
                      ["window", "חלון"],
                    ] as const}
                    onChange={(v) => apply((s) => updateEntrance(s, door.id, v === "vitrine" ? { sillMm: undefined, headMm: undefined } : { sillMm: WINDOW_SILL_MM, headMm: WINDOW_HEAD_MM }))}
                  />
                </div>
                <PanelRow label="גובה מהרצפה (ס״מ)" htmlFor="window-sill">
                  <NumberField
                    id="window-sill"
                    decimals={0}
                    min={0}
                    step={10}
                    commitOnBlur
                    value={cmOf(sillMm)}
                    onChange={(cm) =>
                      apply((s) => {
                        const sill = Math.max(0, Math.round(cm * 10));
                        return updateEntrance(s, door.id, { sillMm: sill, ...(glassMm !== null ? { headMm: sill + glassMm } : {}) });
                      })
                    }
                    className="w-20"
                  />
                </PanelRow>
                <PanelRow label="גובה החלון (ס״מ)" htmlFor="window-height">
                  <NumberField
                    id="window-height"
                    decimals={0}
                    min={0}
                    step={10}
                    commitOnBlur
                    hideZero
                    placeholder="עד הקיר"
                    value={glassMm !== null ? cmOf(glassMm) : 0}
                    onChange={(cm) => apply((s) => updateEntrance(s, door.id, { headMm: cm > 0 ? sillMm + Math.max(100, Math.round(cm * 10)) : undefined }))}
                    className="w-20"
                  />
                </PanelRow>
                <Note>{vitrine ? "ויטרינה — זכוכית מהרצפה עד גובה הקיר. בתוכנית היא קטע מזוגג בקיר; במבט התלת־ממדי, זכוכית במקום הקיר." : "חלון בקיר: הקיר נשאר מתחתיו ומעליו, ובין שניהם זכוכית. גובה החלון 0 — הזכוכית עד ראש הקיר."}</Note>
              </>,
            )
          : G(
              "swing",
              DoorOpen,
              "פתיחה",
              `${door.doubleDoor ? "כנף כפולה" : "כנף יחידה"} · ${door.swingInward ? "פנימה" : "החוצה"}`,
              <div className="flex flex-col gap-2">
                <SegmentedToggle
                  value={door.doubleDoor}
                  options={[
                    { value: false, label: "כנף יחידה" },
                    { value: true, label: "כנף כפולה" },
                  ]}
                  onChange={(doubleDoor) => apply((s) => updateEntrance(s, door.id, { doubleDoor }))}
                  ariaLabel="מספר כנפיים" fill
                />
                <SegmentedToggle
                  value={door.swingInward}
                  options={[
                    { value: true, label: "פנימה" },
                    { value: false, label: "החוצה" },
                  ]}
                  onChange={(swingInward) => apply((s) => updateEntrance(s, door.id, { swingInward }))}
                  ariaLabel="כיוון פתיחה" fill
                />
              </div>,
            ),
        G(
          "size",
          MoveHorizontal,
          "מידות",
          `${cmOf(door.widthMm)} ס״מ`,
          <PanelRow label="רוחב (ס״מ)" htmlFor="door-width">
            <NumberField id="door-width" decimals={0} min={40} step={10} value={door.widthMm / 10} onChange={setWidth} className="w-20" />
          </PanelRow>,
        ),
        // A curtain on this wall (lib/venues/curtain.ts): over the door, or parted for it — the main
        // entrance stays clear, a service door is hidden behind the cloth.
        curtained &&
          G(
            "curtain",
            FEATURE_ICON.curtain,
            "וילון",
            door.curtainClear ? "נפתח מול הדלת" : "מעל הדלת",
            <SegmentedToggle
              value={!!door.curtainClear}
              options={[
                { value: false, label: "וילון מעל הדלת" },
                { value: true, label: "הווילון נפתח מול הדלת" },
              ]}
              onChange={(clear) => apply((s) => updateEntrance(s, door.id, { curtainClear: clear ? true : undefined }))}
              ariaLabel="הווילון מול הדלת" fill
            />,
          ),
      ], { defaultOpen: ["position", "swing", "glass"] });
    return (
      <Bar icon={window ? AppWindow : DoorOpen} title={title} facts={facts} onClose={onClose}>
        <QuickLead icon={MoveHorizontal} label="רוחב" />
        <QuickNumber label="רוחב (ס״מ)" narrow min={40} value={door.widthMm / 10} onChange={setWidth} />
        <QuickUnit>ס״מ</QuickUnit>
        <QuickSep />
        <QuickLead icon={Ruler} label={`${cornerWord(centre, from === "a" ? pts.a : pts.b)} עד הפתח`} />
        <QuickNumber label="מהפינה עד הפתח (מ׳)" decimals={2} min={0} max={Math.max(0, (len - door.widthMm) / 1000)} value={off.toEdgeMm / 1000} onChange={(v) => setCentre(v * 1000 + door.widthMm / 2)} />
        <QuickUnit>מ׳</QuickUnit>
        {!window && (
          <>
            <QuickSep />
            <BarButton icon={FlipHorizontal2} label="היפוך כיוון הפתיחה" onClick={() => apply((s) => updateEntrance(s, door.id, { swingInward: !door.swingInward }))} />
          </>
        )}
        <QuickTail onDelete={onDelete} deleteLabel={window ? "מחיקת החלון" : "מחיקת הכניסה"} />
      </Bar>
    );
  }

  // ── a feature ────────────────────────────────────────────────────────────────────────────────
  const feature = structure.features.find((f) => f.id === one.id);
  if (!feature) return null;
  const patch = (p: Parameters<typeof updateFeature>[2]) => apply((s) => updateFeature(s, feature.id, p));
  // Stairs and a ramp are measured by what they climb, not by a free width × depth × height.
  const climb = isClimb(feature.kind);
  const surface = feature.kind === "surface";
  const seating = feature.kind === "seating";
  const curtain = feature.kind === "curtain" ? curtainOf(feature) : null;
  const isCurtain = feature.kind === "curtain";
  const curtainLine = isCurtain && !curtain ? curtainLines(structure, feature)[0] : undefined;
  const isLed = feature.kind === "led";
  const curtainWall = curtain ? wallTrack(structure, curtain.wallId) : null;
  const column = feature.kind === "column" ? columnOf(feature) : null;
  const bound = followsWalls(feature);
  const icon = feature.kind === "plant" ? PLANT_ICON[plantSpecies(feature)] : feature.kind === "surface" ? SURFACE_ICON[surfaceMaterial(feature)] : FEATURE_ICON[feature.kind];
  const size = climb
    ? `${m(feature.widthMm)} × ${m(climbRunMm(feature))} מ׳ · עולה ${cmOf(feature.heightMm)} ס״מ`
    : curtain
      ? `${m(curtainLengthMm(structure, feature))} מ׳ לאורך ה${curtainWall?.curved ? "קיר המעוגל" : "קיר"}${curtainWall ? ` (${m(curtainWall.lengthMm)} מ׳)` : ""}`
      : isCurtain
        ? `${m(curtainLengthMm(structure, feature))} מ׳ ${curtainLine?.side ? "לאורך הצד" : "על המוט"}`
        : isLed
          ? `${m(ledLengthMm(structure, feature))} מ׳`
          : seating
            ? `${seatingCount(feature)} כיסאות · ${m(feature.widthMm)} × ${m(feature.depthMm)} מ׳`
            : feature.shape === "circle"
              ? `⌀ ${m(feature.widthMm)} מ׳`
              : `${m(feature.widthMm)} × ${m(feature.depthMm)} מ׳`;
  // The depth of a ח's counter or a curved bar's band — null for every shape that has none.
  const band =
    feature.shape === "u-shape"
      ? uShapeBandOf(feature.widthMm, feature.depthMm, feature.ring)
      : feature.shape === "oval-ring" || feature.shape === "horseshoe" || feature.shape === "rounded-u"
        ? ringSpecOf(feature.widthMm, feature.depthMm, feature.ring, feature.shape).bandMm
        : null;
  const facts = [
    surface && feature.label && feature.label !== SURFACE_MATERIAL_LABEL[surfaceMaterial(feature)] ? SURFACE_MATERIAL_LABEL[surfaceMaterial(feature)] : FEATURE_KIND_LABEL[feature.kind],
    bound ? `ממלא שטח סגור · ${Math.round(polygonAreaMm2(featureWorldOutline(feature)) / 1_000_000)} מ״ר` : size,
    band !== null && feature.kind === "bar" ? `דלפק ${cmOf(band)} ס״מ` : null,
    column ? `עמוד ⌀ ${cmOf(column.shaftMm)} ס״מ` : null,
    feature.kind === "pergola" ? `${PERGOLA_ROOF_LABEL[pergolaOf(feature).roof]} · ${pergolaPostsWord(pergolaOf(feature))}` : null,
    feature.kind === "table" && feature.table ? `שולחן ${feature.table.number} · ${feature.table.seats} מקומות` : null,
    !climb && !surface && !seating && feature.heightMm > 0 ? `גובה ${cmOf(feature.heightMm)} ס״מ` : null,
    feature.locked ? "נעול" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ── one of the stage's edge items, picked on the plan ────────────────────────────────────────
  const it = activeEdge?.featureId === feature.id ? edgeRows(feature, wallDistance, doors).find((r) => r.id === activeEdge.itemId) : undefined;
  if (it) {
    const change = (p: Parameters<typeof onEdgeChange>[2]) => onEdgeChange(feature.id, it.id, p);
    const edgeFacts = [it.side, it.inner ? "שקועות בבמה" : null, it.full ? "כל הצד" : `${cmOf(it.widthMm)} ס״מ`, it.kind === "ramp" ? `אורך ${m(it.depthMm)} מ׳` : null].filter(Boolean).join(" · ");
    if (!bar)
      return groupsOf(`halls:edge:${it.kind}`, VENUE_EDGE_LABEL[it.kind], edgeFacts, [
        G(
          "kind",
          Grid2x2,
          "סוג",
          VENUE_EDGE_LABEL[it.kind],
          <>
            <Segmented label="מה עומד בצד הזה" value={it.kind} options={VENUE_EDGE_KINDS.map((k) => [k, VENUE_EDGE_LABEL[k]] as const)} onChange={(k) => change({ kind: k })} />
            <Note>{it.kind === "stairs" ? "עלייה לבמה. מספר המדרגות נקבע מהגובה." : "עלייה בשיפוע 1:12 לכיסא גלגלים — האורך נקבע מגובה הבמה."}</Note>
          </>,
        ),
        it.kind === "stairs" &&
          G(
            "where",
            Layers2,
            "מיקום",
            it.inner ? "פנימי" : "חיצוני",
            <>
              {it.outerFits && it.innerFits ? (
                <Segmented
                  label="איפה המדרגות"
                  value={it.inner ? "inner" : "outer"}
                  options={[
                    ["outer", "מחוץ לבמה"],
                    ["inner", "שקועות בבמה"],
                  ] as const}
                  onChange={(v) => change({ inner: v === "inner" })}
                />
              ) : !it.outerFits && it.innerFits ? (
                <>
                  <p className="text-sm text-ink">{it.inner ? "פנימי — " : ""}הצד קרוב לקיר: אין מקום לגרם המדרגות מחוץ לבמה, רק בתוכה.</p>
                  {!it.inner && (
                    <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => change({ inner: true })}>
                      להעביר לתוך הבמה
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink">
                  {it.inner ? "בתוך הבמה." : "מחוץ לבמה."} {it.innerFits || it.inner ? "" : "אי אפשר לשקוע מדרגות בצד הזה."}
                </p>
              )}
              <Note>מדרגות פנימיות שקועות בתוך קו הבמה — עולים מהרצפה בשפה. זו הדרך היחידה למדרגות בצד שקרוב לקיר.</Note>
            </>,
            !it.inner && !it.outerFits,
          ),
        G(
          "width",
          MoveHorizontal,
          "רוחב",
          it.full ? "כל הצד" : `${cmOf(it.widthMm)} ס״מ`,
          <>
            <Segmented
              label="רוחב"
              value={it.full ? "full" : "set"}
              options={[
                ["set", "לפי מידה"],
                ["full", "כל הצד"],
              ] as const}
              onChange={(v) => change({ full: v === "full" })}
            />
            <Note>אפשר גם לגרור את הקצוות בתוכנית, ואת הפריט כולו לאורך הצד.</Note>
          </>,
        ),
        it.kind === "stairs" &&
          G(
            "steps",
            Footprints,
            "מדרגות",
            ltr(`${it.risers}×${cmOf(it.riserMm)}`),
            <>
              <PanelRow label="מספר מדרגות" htmlFor="edge-r">
                {it.manual && it.risers !== it.autoRisers && <BarButton icon={Undo2} label={`חזרה לאוטומטי (${it.autoRisers})`} onClick={() => change({ risers: null })} />}
                <NumberField id="edge-r" decimals={0} min={1} max={20} value={it.risers} onChange={(n) => change({ risers: n })} className="w-20" />
              </PanelRow>
              {it.riserMm > 200 && <p className="text-xs text-alert-ink">מדרגה של {cmOf(it.riserMm)} ס״מ גבוהה לעלייה — כדאי להוסיף מדרגה.</p>}
            </>,
            it.riserMm > 200,
          ),
      ], { defaultOpen: ["kind", "steps"] });
    return (
      <Bar icon={EDGE_ICON[it.kind]} title={VENUE_EDGE_LABEL[it.kind]} facts={edgeFacts} onClose={() => onSelectEdge(feature.id, null)}>
        <QuickLead icon={MoveHorizontal} label="רוחב" />
        <QuickNumber label="רוחב (ס״מ)" narrow min={30} max={3000} disabled={it.full} value={cmOf(it.widthMm)} onChange={(cm) => change({ widthMm: cm * 10 })} />
        <QuickUnit>ס״מ</QuickUnit>
        {it.kind === "stairs" && (
          <>
            <QuickSep />
            <QuickLead icon={Footprints} label="מספר מדרגות" />
            <QuickNumber label="מספר מדרגות" narrow min={1} max={20} value={it.risers} onChange={(n) => change({ risers: n })} />
          </>
        )}
        <QuickTail onDelete={() => onRemoveEdge(feature.id, it.id)} deleteLabel={`מחיקת ה${VENUE_EDGE_LABEL[it.kind]}`} />
      </Bar>
    );
  }

  if (bar) {
    const round = feature.shape === "circle";
    const sized = !climb && !seating && !isCurtain && !isLed && !bound;
    return (
      <Bar icon={icon} title={feature.label || FEATURE_KIND_LABEL[feature.kind]} badge={feature.locked ? "נעול" : undefined} facts={facts} onClose={onClose}>
        {sized && (
          <>
            <QuickLead icon={Ruler} label="מידות" />
            {round ? (
              <>
                <QuickUnit>⌀</QuickUnit>
                <QuickNumber label="קוטר (מ׳)" decimals={2} min={0.1} value={feature.widthMm / 1000} onChange={(v) => patch({ widthMm: Math.round(v * 1000) })} />
              </>
            ) : (
              <>
                <QuickNumber label={column ? "רוחב הבסיס (מ׳)" : "רוחב (מ׳)"} decimals={2} min={0.1} value={feature.widthMm / 1000} onChange={(v) => patch({ widthMm: Math.round(v * 1000) })} />
                <QuickUnit>×</QuickUnit>
                <QuickNumber label={column ? "עומק הבסיס (מ׳)" : "עומק (מ׳)"} decimals={2} min={0.1} value={feature.depthMm / 1000} onChange={(v) => patch({ depthMm: Math.round(v * 1000) })} />
              </>
            )}
            <QuickUnit>מ׳</QuickUnit>
          </>
        )}
        {climb && (
          <>
            <QuickLead icon={FEATURE_ICON[feature.kind]} label="עולה" />
            <QuickNumber label="גובה העלייה (ס״מ)" narrow min={0} value={cmOf(feature.heightMm)} onChange={(cm) => patch({ heightMm: cm * 10 })} />
            <QuickUnit>ס״מ</QuickUnit>
          </>
        )}
        {(isCurtain || isLed) && <QuickUnit>{size}</QuickUnit>}
        {!climb && !bound && !isCurtain && !isLed && (
          <>
            {(sized || seating) && <QuickSep />}
            <QuickTurn value={feature.rotationDeg} onChange={(rotationDeg) => patch({ rotationDeg })} />
          </>
        )}
        {/* A surface or a building laid wall to wall in a closed shape follows its walls; cut loose,
            it is a free one of the same outline (and then "עריכת הקווים" reshapes it). */}
        {bound && (
          <>
            <QuickSep />
            <BarButton icon={Unlink} label="ניתוק מהקירות — נשאר בצורתו, ואפשר להזיז אותו ולשנות את קוויו" onClick={() => patch({ fillsFace: undefined })} />
          </>
        )}
        {canEditOutline(feature) && onToggleOutline && (
          <>
            <QuickSep />
            <ModeVerb icon={PenLine} label="עריכת הקווים" active={outlineEditId === feature.id} onClick={() => onToggleOutline(feature.id)} />
          </>
        )}
        <QuickTail
          onCopy={onDuplicate}
          copyLabel="שכפול האלמנט · Ctrl+D"
          onDelete={onDelete}
          deleteLabel="מחיקת האלמנט"
          deleteDisabled={allLocked}
          more={moreItems()}
          moreLabel="עוד פעולות לאלמנט"
        />
      </Bar>
    );
  }

  // The feature's GROUPS, in the board's order: what it is (its shape, size, name) → how it is
  // built (its kind's own fields, its edges) → how it looks → advanced (in a sketch, as a zone).
  const shapeGroup = (() => {
    if (feature.kind === "plant")
      return G(
        "plant",
        PLANT_ICON[plantSpecies(feature)],
        "סוג צמח",
        PLANT_SPECIES_LABEL[plantSpecies(feature)],
        <>
          <PanelRow stack>
            <Select
              value={plantSpecies(feature)}
              options={PLANT_SPECIES.map((p) => ({ value: p, label: PLANT_SPECIES_LABEL[p] }))}
              onChange={(v) => {
                const next = v as PlantSpecies;
                const renamed = feature.label !== PLANT_SPECIES_LABEL[plantSpecies(feature)];
                patch({ plant: next, ...PLANT_DEFAULTS[next], ...(renamed ? {} : { label: PLANT_SPECIES_LABEL[next] }) });
              }}
              aria-label="סוג צמח"
              className="w-full"
            />
          </PanelRow>
          <Note>החלפת הסוג מביאה איתה את הגודל המקורב שלו, כמו הנחה מחדש.</Note>
        </>,
      );
    // A catalog item's shape is its row's (lib/venues/item.ts) — its picture is drawn from it.
    if (climb || seating || bound || isCurtain || isLed || feature.kind === "item") return null;
    return G(
      "shape",
      Shapes,
      "צורה",
      SHAPE_LABEL[feature.shape],
      <>
        <PickRow
          glyph={<ShapeIcon shape={feature.shape} />}
          name={SHAPE_LABEL[feature.shape]}
          meta={size}
          pickerLabel="צורה"
          pickerIcon={Shapes}
        >
          {(close) => (
            <ShapeGrid
              value={feature.shape}
              shapes={MAP_SHAPES.filter((sh) => sh !== "custom" || feature.shape === "custom" || (feature.outline?.length ?? 0) >= 3)}
              onPick={(shape) => {
                patch({ shape: shape as StructureFeature["shape"] });
                close();
              }}
            />
          )}
        </PickRow>
        {surface && <Note>לכל צורה אחרת: ״עריכת הקווים״ בסרגל — גוררים פינות, מוסיפים ומוחקים.</Note>}
      </>,
    );
  })();

  const materialGroup =
    surface &&
    G(
      "material",
      SURFACE_ICON[surfaceMaterial(feature)],
      "חומר",
      SURFACE_MATERIAL_LABEL[surfaceMaterial(feature)],
      <>
        <SurfaceTiles label="" value={surfaceMaterial(feature)} onChange={(mat) => mat && patch(surfaceMaterialPatch(feature, mat))} />
        {feature.style?.fill && <Note>החלפת החומר מחזירה את הצבע שלו — הגוון שנבחר לחומר הקודם יורד.</Note>}
        {bound && (
          <Button size="sm" variant="outline" icon={<Unlink className="h-3.5 w-3.5" strokeWidth={2} />} className="mt-2 w-full" onClick={() => patch({ fillsFace: undefined })}>
            ניתוק מהקירות
          </Button>
        )}
      </>,
    );

  const sizeGroup =
    !climb &&
    !seating &&
    !isCurtain &&
    !isLed &&
    !bound &&
    G(
      "size",
      Ruler,
      "מידות",
      size,
      <>
        <PanelRow label={`${feature.shape === "circle" ? "קוטר" : "רוחב"}${column ? " הבסיס" : ""} (מ׳)`} htmlFor="feature-w">
          <NumberField id="feature-w" decimals={2} min={0.1} step={0.1} value={feature.widthMm / 1000} onChange={(v) => patch({ widthMm: Math.round(v * 1000) })} className="w-20" />
        </PanelRow>
        {feature.shape !== "circle" && (
          <PanelRow label={column ? "עומק הבסיס (מ׳)" : "עומק (מ׳)"} htmlFor="feature-d">
            <NumberField id="feature-d" decimals={2} min={0.1} step={0.1} value={feature.depthMm / 1000} onChange={(v) => patch({ depthMm: Math.round(v * 1000) })} className="w-20" />
          </PanelRow>
        )}
        {/* The ground has no height — the field only ever showed a 0 nothing read. */}
        {!surface && (
          <PanelRow label={feature.kind === "pool" ? "גובה הדופן (ס״מ)" : "גובה (ס״מ)"} htmlFor="feature-h">
            <NumberField id="feature-h" decimals={0} min={0} step={10} commitOnBlur hideZero={feature.kind === "pool"} placeholder={feature.kind === "pool" ? "שקועה" : undefined} value={cmOf(feature.heightMm)} onChange={(cm) => patch({ heightMm: Math.round(cm * 10) })} className="w-20" />
          </PanelRow>
        )}
        {feature.kind === "pool" && <Note>ריק — הבריכה שקועה ברצפה. גובה — הדופן עומדת מעל הרצפה והמים מעט מתחת לראשה (בתלת־ממד).</Note>}
        {/* A ח's counter (and a curved bar's band) is a depth of its own. */}
        {band !== null && (
          <>
            <PanelRow label={feature.kind === "bar" ? "עומק הדלפק (ס״מ)" : "עובי הפס (ס״מ)"} htmlFor="feature-band">
              <NumberField id="feature-band" decimals={0} min={5} step={5} commitOnBlur value={cmOf(band)} onChange={(cm) => patch({ ring: { ...feature.ring, bandMm: Math.round(cm * 10) } })} className="w-20" />
            </PanelRow>
            <Note>{feature.kind === "bar" ? "עומק הדלפק נשאר קבוע כשמשנים את הרוחב והעומק של הבר." : "העובי נשאר קבוע כשמשנים את הגודל."}</Note>
          </>
        )}
      </>,
    );

  const nameGroup = G(
    "name",
    Type,
    "שם",
    feature.label || "ללא שם",
    <TextField aria-label="שם" value={feature.label} onChange={(label) => patch({ label })} placeholder={FEATURE_KIND_LABEL[feature.kind]} />,
  );

  const kindGroups: (PanelGroup | false | null)[] = [];
  if (climb) kindGroups.push(G("climb", FEATURE_ICON[feature.kind], feature.kind === "ramp" ? "רמפה" : "מדרגות", size, <ClimbFields feature={feature} patch={patch} />));
  if (seating) {
    const spec = seatingOf(feature);
    const chair = seatingChair(spec);
    const style = spec.chairStyle ?? "dining";
    kindGroups.push(
      G("rows", Rows3, "שורות", ltr(`${spec.rows}×${spec.perRow}`), <ChairRowsPopover bare rows={spec} chair={chair} onChange={(rows) => rows && patch(seatingPatch(feature, rows))} />),
      G(
        "chair",
        Armchair,
        "כיסא",
        CHAIR_STYLE_LABEL[style],
        <>
          <PanelRow label="סוג" stack>
            <Select value={style} options={CHAIR_STYLES.map((c) => ({ value: c, label: CHAIR_STYLE_LABEL[c] }))} onChange={(v) => patch(seatingPatch(feature, { chairStyle: v as ChairStyle }))} aria-label="סוג הכיסא" className="w-full" />
          </PanelRow>
          <PanelRow label="רוחב כיסא (ס״מ)" htmlFor="seat-w">
            <NumberField id="seat-w" decimals={0} min={30} max={120} step={5} commitOnBlur value={cmOf(chair.widthMm)} onChange={(cm) => patch(seatingPatch(feature, { chairWidthMm: cm * 10 }))} className="w-20" />
          </PanelRow>
          <PanelRow label="עומק כיסא (ס״מ)" htmlFor="seat-d">
            <NumberField id="seat-d" decimals={0} min={30} max={120} step={5} commitOnBlur value={cmOf(chair.depthMm)} onChange={(cm) => patch(seatingPatch(feature, { chairDepthMm: cm * 10 }))} className="w-20" />
          </PanelRow>
          <Note>הכיסאות של המקום עצמו: כך הם מצוירים כאן, בכל סקיצה ובהדפסה. גוון הכיסאות — ב״מראה״.</Note>
        </>,
      ),
    );
  }
  if (isLed) kindGroups.push(G("led", Zap, "פס לד", ltr(`${m(ledLengthMm(structure, feature))} מ׳`), <VenueLedPopover bare feature={feature} structure={structure} apply={apply} />));
  if (isCurtain)
    kindGroups.push(
      G(
        "span",
        FEATURE_ICON.curtain,
        "קטע",
        size,
        <>
          {curtain && curtainWall ? (
            <>
              <PanelRow label="מתחילת הקיר (מ׳)" htmlFor="curtain-from">
                <NumberField id="curtain-from" decimals={2} min={0} max={curtainWall.lengthMm / 1000} step={0.1} commitOnBlur value={curtainWall.mmAt(curtain.from) / 1000} onChange={(v) => apply((s) => updateFeature(s, feature.id, curtainPatch(s, feature, { from: curtainWall.tAt(v * 1000) })))} className="w-20" />
              </PanelRow>
              <PanelRow label="עד (מ׳)" htmlFor="curtain-to">
                <NumberField id="curtain-to" decimals={2} min={0} max={curtainWall.lengthMm / 1000} step={0.1} commitOnBlur value={curtainWall.mmAt(curtain.to) / 1000} onChange={(v) => apply((s) => updateFeature(s, feature.id, curtainPatch(s, feature, { to: curtainWall.tAt(v * 1000) })))} className="w-20" />
              </PanelRow>
              <div className="flex gap-2 py-1">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => apply((s) => updateFeature(s, feature.id, curtainPatch(s, feature, { from: 0, to: 1 })))}>
                  כל הקיר
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => apply((s) => updateFeature(s, feature.id, curtainPatch(s, feature, { side: curtain.side === 1 ? -1 : 1 })))}>
                  לצד השני
                </Button>
              </div>
              <PanelRow label="גובה (ס״מ, 0 = עד התקרה)" htmlFor="curtain-h">
                <NumberField id="curtain-h" decimals={0} min={0} step={10} commitOnBlur value={cmOf(feature.heightMm)} onChange={(cm) => patch({ heightMm: Math.round(cm * 10) })} className="w-20" />
              </PanelRow>
              <Note>הווילון תלוי על הקיר וזז איתו. בסקיצה אפשר להסיר אותו לאירוע אחד או להחליף אותו בווילון מהקטלוג — המתחם עצמו לא משתנה.</Note>
            </>
          ) : curtainLine ? (
            <VenueRailFields feature={feature} line={curtainLine} apply={apply} />
          ) : (
            <Note>{curtainRail(feature)?.type === "side" ? "האלמנט שהווילון היה תלוי עליו נמחק. מחקו את הווילון ותלו אחד חדש." : "הקיר שהווילון היה תלוי עליו נמחק. מחקו את הווילון ותלו אחד חדש."}</Note>
          )}
          <CurtainLookFields feature={feature} onPatch={patch} />
        </>,
      ),
    );
  if (column)
    kindGroups.push(
      G(
        "column",
        Cylinder,
        "עמוד",
        `⌀ ${cmOf(column.shaftMm)} ס״מ`,
        <>
          <Segmented
            label="חתך העמוד"
            value={column.square ? "square" : "round"}
            options={[
              ["round", "עגול"],
              ["square", "מרובע"],
            ] as const}
            onChange={(v) => patch(columnPatch(feature, { square: v === "square" }))}
          />
          <PanelRow label={column.square ? "רוחב העמוד (ס״מ)" : "קוטר העמוד (ס״מ)"} htmlFor="column-shaft">
            <NumberField id="column-shaft" decimals={0} min={10} step={5} commitOnBlur value={cmOf(column.shaftMm)} onChange={(cm) => patch(columnPatch(feature, { shaftMm: cm * 10 }))} className="w-20" />
          </PanelRow>
          <PanelRow label="טבעת בסיס (ס״מ)" htmlFor="column-base">
            <NumberField id="column-base" decimals={0} min={0} step={5} commitOnBlur value={column.baseMm ? cmOf(column.baseMm) : 0} onChange={(cm) => patch(columnPatch(feature, { baseMm: cm * 10 }))} className="w-20" />
          </PanelRow>
          <Note>הבסיס המרובע או העגול שהעמוד עומד עליו הוא האלמנט עצמו — הגודל שלו ב״מידות״. עמוד ברוחב הבסיס הוא עמוד בלי בסיס; טבעת 0 היא בלי טבעת.</Note>
        </>,
      ),
    );
  if (feature.kind === "pergola") {
    const spec = pergolaOf(feature);
    kindGroups.push(G("pergola", FEATURE_ICON.pergola, "פרגולה", `${PERGOLA_ROOF_LABEL[spec.roof]} · ${pergolaPostsWord(spec)}`, <PergolaPopover bare feature={feature} onPatch={patch} />));
  }
  // A catalog item the venue keeps (lib/venues/item.ts): what it was copied from, and what that means.
  if (feature.kind === "item" && feature.item) {
    const it = feature.item;
    const product = itemProductOf(feature);
    const category = CATEGORY_BY_ID[it.category]?.label ?? it.category;
    kindGroups.push(
      G(
        "item",
        FEATURE_ICON.item,
        "מהקטלוג",
        it.shade ? `${category} · ${it.shade.name}` : category,
        <>
          <div className="flex items-center gap-2.5 py-1">
            {product && (
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-sm border border-border-soft">
                <ProductImage product={product} />
              </span>
            )}
            <span className="min-w-0 text-[13px] leading-snug">
              <span className="block font-semibold text-ink">{category}</span>
              {it.shade && <span className="block text-muted">גוון: {it.shade.name}</span>}
            </span>
          </div>
          <Note>עותק של הפריט מהקטלוג, שנשמר עם המקום ומצויר כמו בקטלוג. בלי מחיר — לא נספר ולא מתומחר באירועים. שינוי בקטלוג לא משנה אותו.</Note>
        </>,
      ),
    );
  }
  // A table of the venue's DEFAULT LAYOUT (lib/venues/venue-table.ts): its number and its seats, and
  // what it is for — every new sketch in this venue starts with it as one of its own tables.
  if (feature.kind === "table" && feature.table) {
    const t = feature.table;
    const setTable = (p: Partial<typeof t>) => patch({ table: { ...t, ...p } });
    const clash = !!structure?.features.some((o) => o.id !== feature.id && o.table?.number === t.number);
    kindGroups.push(
      G(
        "table",
        FEATURE_ICON.table,
        "שולחן",
        `${t.number ? `שולחן ${t.number}` : "ללא מספר"} · ${t.seats} מקומות`,
        <>
          <PanelRow label="מספר השולחן" htmlFor="venue-table-number">
            <NumberField id="venue-table-number" decimals={0} min={1} max={999} commitOnBlur value={t.number} onChange={(n) => setTable({ number: Math.max(1, Math.round(n)) })} className="w-20" />
          </PanelRow>
          {clash && <Note>שולחן אחר כבר נושא את המספר הזה — בסקיצה יקבל אחד מהם את המספר הפנוי הבא.</Note>}
          <PanelRow label="מקומות ישיבה" htmlFor="venue-table-seats">
            <NumberField id="venue-table-seats" decimals={0} min={0} max={60} commitOnBlur value={t.seats} onChange={(n) => setTable({ seats: Math.max(0, Math.round(n)) })} className="w-20" />
          </PanelRow>
          <Note>פריסת ברירת המחדל של המקום: כל סקיצה חדשה כאן מתחילה עם השולחנות האלה כשולחנות שלה — ממוספרים, עם הכיסאות, וניתנים להזזה ולמחיקה. סקיצות שכבר קיימות לא משתנות.</Note>
        </>,
      ),
    );
  }
  // A pool's שפה, a surface's edging (lib/venues/rim.ts): a band INSIDE the outline.
  if (takesRim(feature)) {
    const rim = rimSpecOf(feature);
    const setRim = (p: Parameters<typeof rimPatch>[1]) => patch(rimPatch(feature, p));
    kindGroups.push(
      G(
        "rim",
        SquareSquare,
        "שפה",
        rim ? `${cmOf(rim.widthMm)} ס״מ · ${SURFACE_MATERIAL_LABEL[rim.material]}` : "ללא",
        <>
          <PanelRow label="רוחב (ס״מ)" htmlFor="rim-width">
            <NumberField id="rim-width" decimals={0} min={0} step={5} commitOnBlur hideZero placeholder="ללא" value={rim ? cmOf(rim.widthMm) : 0} onChange={(cm) => setRim({ widthMm: cm * 10 })} className="w-20" />
          </PanelRow>
          <div className="py-1.5">
            <SurfaceTiles label="ממה היא עשויה" value={rim?.material} onChange={(mat) => mat && setRim({ material: mat })} />
          </div>
          {rim && (
            <>
              <PanelRow label="מוגבהת (ס״מ)" htmlFor="rim-raised">
                <NumberField id="rim-raised" decimals={0} min={0} step={5} commitOnBlur value={cmOf(rim.raisedMm ?? 0)} onChange={(cm) => setRim({ raisedMm: cm * 10 })} className="w-20" />
              </PanelRow>
              <StyleFields style={rim.style} onChange={(style) => setRim({ style })} strokeWidthDefault={1} fillOnly fillLabel="גוון" />
            </>
          )}
          <Note>
            {feature.kind === "pool"
              ? "השפה בתוך קו הבריכה: המים מצטמצמים, והגודל של הבריכה לא משתנה. השפה היא רצפה — המרחק לשולחנות נמדד משפת המים. רוחב 0 — בלי שפה."
              : "השוליים בתוך קו המשטח: המשטח מצטמצם, והגודל לא משתנה. ״מוגבהת״ — אבן שפה בתלת־ממד. רוחב 0 — בלי שוליים."}
          </Note>
        </>,
      ),
    );
  }

  // THE EDGES — what stands on them, what is still bare, and adding one more (then clicked onto a
  // side). Only a STAGE's bare edge is called a fault.
  const edgesGroup = (() => {
    if (!takesEdgeItems(feature)) return null;
    const rows = edgeRows(feature, wallDistance, doors);
    const gapsMm = featureGaps(feature, wallDistance).reduce((t, g) => t + g.lengthMm, 0);
    const flights = rows.filter((r) => r.kind === "stairs");
    const ramps = rows.filter((r) => r.kind === "ramp").length;
    const open = gapsMm > 0;
    const warn = open && edgesMatter(feature);
    const picking = edgePick?.featureId === feature.id ? edgePick.kind : null;
    const summary = picking ? "לחצו על צד" : warn ? `${m(gapsMm)} מ׳ פתוחים` : flights.length > 0 ? `${flights.length} מדרגות` : ramps > 0 ? "רמפה" : open ? "ללא מדרגות" : "סגור";
    return G(
      "edges",
      Footprints,
      "קצוות",
      summary,
      <>
        {rows.length > 0 ? (
          <div className="flex flex-col overflow-hidden rounded-md border border-inset-border">
            {rows.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelectEdge(feature.id, r.id)}
                className={"flex items-center gap-2 px-2.5 py-2 text-start transition-colors hover:bg-inset " + (i ? "border-t border-border-soft" : "")}
              >
                {(() => {
                  const Icon = EDGE_ICON[r.kind];
                  return <Icon className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />;
                })()}
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{`${VENUE_EDGE_LABEL[r.kind]} · ${r.side}`}</span>
                <span className="nums whitespace-nowrap text-xs text-muted">{r.full ? "כל הצד" : `${cmOf(r.widthMm)} ס״מ`}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">אין מדרגות על הבמה.</p>
        )}
        {open && (
          <div className="mt-2 space-y-1.5">
            <p className={`text-xs ${warn ? "text-warn-ink" : "text-muted"}`}>{warn ? `${m(gapsMm)} מ׳ של שפה פתוחה — מסומנים באדום בתוכנית.` : `${m(gapsMm)} מ׳ של שפה בלי מדרגות.`}</p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => onFillEdges(feature.id, "stairs")}>
              מדרגות בכל הצדדים הפתוחים
            </Button>
          </div>
        )}
        <div className="mt-3">
          <span className="mb-1 block text-xs font-medium text-ink-soft">הוספה — ואז לחיצה על צד הבמה</span>
          <div className="grid grid-cols-2 gap-1">
            {VENUE_EDGE_KINDS.map((k) => (
              <Button key={k} size="sm" variant={picking === k ? "primary" : "soft"} icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.25} />} onClick={() => onStartEdge(feature.id, k)}>
                {VENUE_EDGE_LABEL[k]}
              </Button>
            ))}
          </div>
        </div>
      </>,
      warn,
    );
  })();

  // Whether an EVENT may move this in its sketch. Default by kind (featureMovable).
  const sketchGroup =
    feature.kind !== "surface" &&
    feature.kind !== "table" &&
    G(
      "sketch",
      MousePointer2,
      "בסקיצה",
      featureMovable(feature) ? "ניתן להזזה" : "קבוע",
      <>
        <PanelRow label="ניתן להזזה בסקיצת אירוע">
          <Switch checked={featureMovable(feature)} onChange={(movable) => patch({ movable })} label="ניתן להזזה בסקיצה" />
        </PanelRow>
        <Note>סקיצה של אירוע שומרת רק את ההזזה שלה; תוכנית המקום עצמה לעולם לא נכתבת משם.</Note>
      </>,
    );

  return groupsOf(kind, feature.label || FEATURE_KIND_LABEL[feature.kind], FEATURE_KIND_LABEL[feature.kind], [
    shapeGroup,
    materialGroup,
    sizeGroup,
    nameGroup,
    ...kindGroups,
    edgesGroup,
    !isLed && styleGroup(feature.style, (style) => patch({ style }), surface || feature.kind === "plant" || seating || isCurtain),
    sketchGroup,
    zoneGroup,
  ], { defaultOpen: surface ? ["material", "shape"] : ["shape", "size", "plant", "climb", "rows", "span", "led", "table"] });
}


/** The venue curtain on a SIDE or a ROD (lib/studio/rail.ts, spec 2026-11-07 §6.1/§6.2): a side's
 *  stretch typed in metres along the side, the whole side again, the other side of it; a rod's height
 *  and its ר — no post under its end, the arm held to its reach. */
function VenueRailFields({ feature, line, apply }: { feature: StructureFeature; line: RailLine; apply: (fn: (s: VenueStructure) => VenueStructure) => void }) {
  const rail = curtainRail(feature);
  const re = (fn: (s: VenueStructure, f: StructureFeature) => Partial<Omit<StructureFeature, "id">>) =>
    apply((s) => {
      const f = s.features.find((x) => x.id === feature.id);
      return f ? updateFeature(s, f.id, fn(s, f)) : s;
    });
  if (rail?.type === "side" && line.side) {
    const L = line.side.side.L;
    const at = (t: number) => (Math.max(0, Math.min(1, t)) * L) / 1000;
    return (
      <>
        <PanelRow label="מתחילת הצד (מ׳)" htmlFor="curtain-side-from">
          <NumberField id="curtain-side-from" decimals={2} min={0} max={L / 1000} step={0.1} commitOnBlur value={at(Math.min(rail.from, rail.to))} onChange={(m) => re((s, f) => curtainPatch(s, f, { from: (m * 1000) / L }))} className="w-24" />
        </PanelRow>
        <PanelRow label="עד (מ׳)" htmlFor="curtain-side-to">
          <NumberField id="curtain-side-to" decimals={2} min={0} max={L / 1000} step={0.1} commitOnBlur value={at(Math.max(rail.from, rail.to))} onChange={(m) => re((s, f) => curtainPatch(s, f, { to: (m * 1000) / L }))} className="w-24" />
        </PanelRow>
        <div className="flex gap-2 py-1">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => re((s, f) => curtainPatch(s, f, { from: 0, to: 1 }))}>
            כל הצד
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => re((s, f) => curtainPatch(s, f, { side: rail.out === 1 ? -1 : 1 }))}>
            {rail.out === 1 ? "לצד הפנימי" : "לצד החיצוני"}
          </Button>
        </div>
        <Note>{`תלוי על צד של האלמנט מגובהו (${cmOf(line.topMm ?? 0)} ס״מ) וזז איתו.`}</Note>
      </>
    );
  }
  if (rail?.type === "rod") {
    return (
      <>
        <PanelRow label="גובה המוט (ס״מ)" htmlFor="curtain-rod-h">
          <NumberField id="curtain-rod-h" decimals={0} min={50} max={800} step={10} commitOnBlur value={cmOf(rail.heightMm)} onChange={(cm) => re((s, f) => curtainRailPatch(s, f, { ...rail, heightMm: Math.round(cm * 10) }))} className="w-24" />
        </PanelRow>
        <label className="flex items-center justify-between gap-3 py-1 text-sm text-ink">
          <span>ללא עמוד בקצה (ר)</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-accent)]"
            checked={rail.cantilever === "end"}
            onChange={(e) => {
              const { cantilever: _c, ...plain } = rail;
              void _c;
              re((s, f) => curtainRailPatch(s, f, e.target.checked ? { ...plain, cantilever: "end" } : plain));
            }}
          />
        </label>
        <Note>{`מוט עומד על עמודים בכל קצה ופינה. בלי עמוד בקצה — הזרוע יוצאת מהעמוד האחרון, עד ${CANTILEVER_MAX_MM / 1000} מ׳. גוררים את קצוות המוט על הקנבס.`}</Note>
      </>
    );
  }
  return null;
}

/** A venue curtain's look and drop (FeatureCurtain.style / dropMm — spec 2026-11-07 §6.5): the style
 *  tiles in its own cloth, and how far it comes down (blank = to the floor). Drawing and 3D only. */
function CurtainLookFields({ feature, onPatch }: { feature: StructureFeature; onPatch: (p: Partial<Omit<StructureFeature, "id">>) => void }) {
  const drop = feature.curtain?.dropMm;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-border-soft pt-2">
      <CurtainStyleTiles value={feature.curtain?.style} tone={feature.style?.fill ?? CURTAIN_FILL} onPick={(style) => onPatch(curtainLookPatch(feature, { style: style ?? null }))} />
      <PanelRow label="אורך הבד (ס״מ)" htmlFor="curtain-drop">
        <NumberField id="curtain-drop" decimals={0} min={0} max={1200} hideZero placeholder="עד הרצפה" value={drop ? Math.round(drop / 10) : 0} onChange={(v) => onPatch(curtainLookPatch(feature, { dropMm: v > 0 ? v * 10 : null }))} className="w-24" />
      </PanelRow>
    </div>
  );
}

/** The pergola's panel (lib/venues/pergola.ts): what is laid across the beams — four tiles, each the
 *  plan's own drawing of it — the slats' direction (typed, or turned a quarter) and spacing, the
 *  posts, and which sides carry a lattice, named by where they face (hollowSides — the catalog's
 *  open-sides chips). Every number in cm, stored in mm. */
function PergolaPopover({ bare = false, feature, onPatch }: { bare?: boolean; feature: StructureFeature; onPatch: (p: Partial<Omit<StructureFeature, "id">>) => void }) {
  const spec = pergolaOf(feature);
  const footprint = featureFootprint(feature);
  const geometry = pergolaGeometry(footprint, spec);
  const sides = pergolaSides(footprint);
  const closed = (spec.closedSides ?? []).filter((i) => i < sides.length);
  const set = (p: Partial<Pergola>) => onPatch(pergolaPatch(feature, p));
  const slatDeg = Math.round(geometry?.slatDeg ?? spec.slatDirectionDeg ?? 0);
  const legs = spec.legs ?? "auto";
  const body = (
    <>
      <PanelRow label="גג" stack>
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="גג">
          {PERGOLA_ROOFS.map((roof) => {
            const on = spec.roof === roof;
            return (
              <button
                key={roof}
                type="button"
                role="radio"
                aria-checked={on}
                title={PERGOLA_ROOF_HINT[roof]}
                onClick={() => set({ roof })}
                className={"flex flex-col items-center gap-0.5 rounded-sm border p-1 transition-colors " + (on ? "border-accent bg-accent-tint" : "border-border-soft hover:border-accent-line")}
              >
                <svg viewBox="-2200 -1700 4400 3400" className="h-9 w-full" aria-hidden>
                  <PergolaGlyph footprint={PERGOLA_TILE} pergola={{ ...NEW_PERGOLA, roof }} stroke="var(--color-ink-soft)" postFill="var(--color-ink-soft)" fabric="var(--color-accent)" />
                </svg>
                <span className="w-full truncate text-center text-[10px] leading-tight text-ink-soft">{PERGOLA_ROOF_LABEL[roof]}</span>
              </button>
            );
          })}
        </div>
      </PanelRow>
      {spec.roof !== "none" && (
        <PanelRow label={spec.roof === "slats" ? "כיוון הרפפות (°)" : "כיוון (°)"} htmlFor="pergola-dir">
          <BarButton icon={RotateCw} label="סיבוב ב־90°" onClick={() => set({ slatDirectionDeg: (slatDeg + 90) % 180 })} />
          <NumberField id="pergola-dir" decimals={0} min={0} max={179} step={15} commitOnBlur value={slatDeg} onChange={(deg) => set({ slatDirectionDeg: deg })} className="w-20" />
        </PanelRow>
      )}
      {spec.roof === "slats" && (
        <PanelRow label="מרווח בין רפפות (ס״מ)" htmlFor="pergola-spacing">
          <NumberField id="pergola-spacing" decimals={0} min={5} step={5} commitOnBlur value={cmOf(geometry?.spacingMm ?? spec.slatSpacingMm ?? 300)} onChange={(cm) => set({ slatSpacingMm: cm * 10 })} className="w-20" />
        </PanelRow>
      )}
      {/* Where the posts stand (lib/venues/pergola.ts PergolaLegs): by themselves at the corners, none
          at all (fixed to a building, or hung), or put by hand on the beam line, on the plan. */}
      <div className="py-1">
        <Segmented
          label="עמודים"
          value={legs}
          options={PERGOLA_LEGS.map((l) => [l, PERGOLA_LEGS_LABEL[l]] as const)}
          onChange={(l) => set(legsPatch(footprint, spec, l))}
        />
      </div>
      {legs === "custom" && (
        <Note>
          {spec.posts?.length ?? 0} עמודים. על התוכנית: לחיצה על קו הקורה מוסיפה עמוד, גרירה מזיזה אותו לאורך הקורה, ולחיצה כפולה (או Delete אחרי לחיצה) מסירה.
        </Note>
      )}
      {legs !== "none" && (
        <PanelRow label="עובי עמוד (ס״מ)" htmlFor="pergola-post">
          <NumberField id="pergola-post" decimals={0} min={5} max={60} step={1} commitOnBlur value={cmOf(spec.postMm)} onChange={(cm) => set({ postMm: cm * 10 })} className="w-20" />
        </PanelRow>
      )}
      {sides.length > 0 && (
        <PanelRow label="צדדים סגורים (סבכה)" stack>
          <div className="flex flex-wrap gap-1">
            {sides.map((s) => (
              <TagToggle
                key={s.index}
                active={closed.includes(s.index)}
                onClick={() => set({ closedSides: closed.includes(s.index) ? closed.filter((i) => i !== s.index) : [...closed, s.index] })}
              >
                {s.name}
              </TagToggle>
            ))}
          </div>
        </PanelRow>
      )}
      <Note>
        {legs === "auto" ? "העמודים עומדים בפינות הקו (ולאורך קשת — כל כ־3 מ׳). " : ""}הרפפות שומרות על המרווח כשמשנים את הגודל. שולחנות עומדים מתחתיה — רק העמודים נחשבים למכשול. לצורה אחרת: ״עריכת הקווים״.
      </Note>
    </>
  );
  if (bare) return body;
  return (
    <Popover label="פרגולה" icon={FEATURE_ICON.pergola} value={`${PERGOLA_ROOF_LABEL[spec.roof]} · ${pergolaPostsWord(spec)}`} panelClassName="w-80">
      {body}
    </Popover>
  );
}

/** What the posts are, in a summary: their size, how many were put by hand, or none. */
function pergolaPostsWord(spec: Pergola): string {
  if (spec.legs === "none") return "ללא עמודים";
  if (spec.legs === "custom") return `${spec.posts?.length ?? 0} עמודים · ${cmOf(spec.postMm)} ס״מ`;
  return `עמוד ${cmOf(spec.postMm)} ס״מ`;
}

/** The roof tiles' drawing: a small pergola, the same for each roof. */
const PERGOLA_TILE: Footprint = { kind: "rect", widthMm: 4000, depthMm: 3000 };
