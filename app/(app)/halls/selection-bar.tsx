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
} from "lucide-react";
import { useState } from "react";
import { Segmented } from "@/components/segmented";
import { VENUE_EDGE_KINDS, VENUE_EDGE_LABEL, edgeRows, edgesMatter, featureGaps, takesEdgeItems, type VenueEdgeKind } from "@/lib/venues/stage-edges";
import { BUILDING_HEIGHT_MM, featureWorldOutline, followsWalls } from "@/lib/venues/face-surfaces";
import { SurfaceTiles } from "@/components/surface-tiles";
import type { WallDistance } from "@/lib/design-document/stage";
import { Actions, Bar, BarButton, Note, PanelRow, Rotation, ltr } from "@/components/inspector-bar";
import { Popover } from "@/components/popover";
import { Menu, type MenuItem } from "@/components/menu";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { Select } from "@/components/select";
import { StyleFields } from "@/components/style-fields";
import { Switch } from "@/components/toggle";
import { TextField } from "@/components/text-field";
import { InspectorDivider, SegmentedToggle } from "@/components/plan-canvas";
import { ALIGN_LABEL, needsThree, type AlignOp } from "@/lib/studio/align";
import { bulgeDepthMm, maxBulgeDepthMm, polygonAreaMm2, wallAngleDeg, wallLengthMm } from "@/lib/studio/geometry";
import { ringSpecOf, uShapeBandOf } from "@/lib/studio/footprint";
import type { ElementStyle } from "@/lib/element-style";
import { MAP_SHAPES, SHAPE_LABEL } from "@/lib/catalog/types";
import { climbRunMm, isClimb } from "@/lib/venues/climb";
import { seatingChair, seatingCount, seatingOf, seatingPatch } from "@/lib/venues/seating";
import { canDefineColumns, columnOf, columnPatch } from "@/lib/venues/column";
import { curtainLengthMm, curtainOf, curtainPatch } from "@/lib/venues/curtain";
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

// The selection bar of the hall editor — the same `Bar` of chips the sketch puts under a selected
// table (components/inspector-bar.tsx), at the bottom centre of the canvas, each chip a small
// panel (components/popover.tsx). It replaced a column of labelled fields docked down the canvas's
// right edge: the user asked for the two canvases to be one canvas, and a designer who has learned
// where "סיבוב" is on the sketch finds it in the same place here.
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
  const [heightM, setHeightM] = useState(BUILDING_HEIGHT_MM / 1000);
  return (
    <>
      <PanelRow label="גובה המבנה (מ׳)" htmlFor="building-height">
        <NumberField id="building-height" decimals={1} min={0.5} max={30} step={0.5} commitOnBlur value={heightM} onChange={setHeightM} className="w-24" />
      </PanelRow>
      <Button size="sm" className="mt-2 w-full" onClick={() => onBuild(Math.round(heightM * 1000))}>
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

export function SelectionBar({
  selection,
  structure,
  apply,
  onDelete,
  onDuplicate,
  onClose,
  onRestack,
  canRestack,
  onAlign,
  onLock,
  activeEdge,
  edgePick,
  wallDistance,
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
}: {
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
  /** Pins the selected features in place, or frees them (StructureFeature.locked). */
  onLock: (locked: boolean) => void;
  /** THE STAGE'S EDGES — the sketch's own stairs and ramps (lib/venues/stage-edges.ts): the item
   *  being edited (its bar replaces the stage's), the stage whose sides are lit for a new one, and
   *  the handlers. */
  activeEdge?: { featureId: string; itemId: string } | null;
  edgePick?: { featureId: string; kind: VenueEdgeKind } | null;
  wallDistance?: WallDistance;
  onSelectEdge: (featureId: string, itemId: string | null) => void;
  onEdgeChange: (featureId: string, itemId: string, patch: { kind?: VenueEdgeKind; widthMm?: number; risers?: number | null; full?: boolean; inner?: boolean }) => void;
  onRemoveEdge: (featureId: string, itemId: string) => void;
  onFillEdges: (featureId: string, kind: VenueEdgeKind) => void;
  onStartEdge: (featureId: string, kind: VenueEdgeKind) => void;
  /** A picked-but-not-yet-real area — a face just closed by a wall, or a freehand region just
   *  closed. Not a `PlanSelection`: it has no id yet, so it takes over the bar on its own. */
  draftZone?: { source: ZoneSource; name: string; kind: ZoneKind; intent?: "surface" } | null;
  onDraftZoneChange?: (patch: { name?: string; kind?: ZoneKind; source?: ZoneSource }) => void;
  /** The venue's zones made of features (lib/venues/feature-zones.ts), each with its members still on
   *  the plan — what the "אזור" chip may re-make out of the selection. */
  featureZones?: { id: string; name: string; featureIds: string[] }[];
  /** "הגדרה כאזור": the selected features named as a zone, the area round them. Absent = no chip. */
  onFeatureZone?: (featureIds: string[]) => void;
  /** A features zone re-made of these features — a member added or taken out. */
  onSetZoneFeatures?: (zoneId: string, featureIds: string[]) => void;
  onSaveDraftZone?: () => void;
  /** The draft's other answer: lay it in a material WITHOUT naming it a zone — a closed shape filled
   *  wall to wall, or the trace laid as a surface (lib/venues/face-surfaces.ts). */
  onDraftSurface?: (material: SurfaceMaterial) => void;
  /** …or a BUILDING of that shape: a roofed block this high, not a zone (lib/venues/face-surfaces.ts). */
  onDraftBuilding?: (heightMm: number) => void;
  onCancelDraftZone?: () => void;
  /** The free surface whose outline is out for point editing, and the switch for it. */
  outlineEditId?: string | null;
  onToggleOutline?: (featureId: string) => void;
  /** "הגדרה כעמודים": the picked stacks of drawn footprints become columns (lib/venues/column.ts). */
  onDefineColumns?: (featureIds: string[]) => void;
}) {
  // ── a zone being named ───────────────────────────────────────────────────────────────────────
  if (draftZone) {
    // Traced from "ציור חופשי": a surface, whose one question is what it is laid in.
    if (draftZone.intent === "surface") {
      return (
        <Bar icon={Grid2x2} title="משטח חדש" facts="ממה הוא עשוי?" onClose={onCancelDraftZone}>
          <SurfaceTiles label="" columns={9} onChange={(m) => m && onDraftSurface?.(m)} />
        </Bar>
      );
    }
    const src = draftZone.source;
    return (
      <Bar
        icon={src.type === "features" ? SquareDashed : Layers}
        title={src.type === "face" ? "מתן שם לשטח הסגור" : src.type === "features" ? "אזור מהאלמנטים שנבחרו" : "מתן שם לשטח המסומן"}
        facts={src.type === "features" ? `${src.featureIds.length === 1 ? "אלמנט אחד" : `${src.featureIds.length} אלמנטים`} · האזור זז ומשתנה איתם` : undefined}
        onClose={onCancelDraftZone}
      >
        <TextField
          autoFocus
          aria-label="שם האזור"
          value={draftZone.name}
          onChange={(name) => onDraftZoneChange?.({ name })}
          placeholder="שם האזור"
          className="w-48"
        />
        <SegmentedToggle
          value={draftZone.kind}
          options={(Object.keys(ZONE_KIND_LABEL) as ZoneKind[]).map((k) => ({ value: k, label: ZONE_KIND_LABEL[k] }))}
          onChange={(kind) => onDraftZoneChange?.({ kind })}
          ariaLabel="סוג האזור"
        />
        {/* How far round the features the zone reaches — drawn on the plan as it is typed. */}
        {src.type === "features" && (
          <NumberField
            layout="inline"
            label="מרווח (מ׳)"
            decimals={1}
            min={0}
            max={MAX_ZONE_MARGIN_MM / 1000}
            step={0.5}
            value={src.marginMm / 1000}
            onChange={(m) => onDraftZoneChange?.({ source: { ...src, marginMm: Math.round(m * 1000) } })}
            className="w-16"
          />
        )}
        <Button size="sm" onClick={onSaveDraftZone} disabled={!draftZone.name.trim()}>
          שמירה
        </Button>
        {/* Or not a zone at all: the shape is only to be COLOURED — a path, a bed, a lot the events
            never book (the user, 2026-10-17). */}
        {onDraftSurface && (
          <>
            <InspectorDivider />
            <Popover label="משטח בלבד" icon={Grid2x2} value="בלי אזור" panelClassName="w-80">
              {(close) => (
                <>
                  <SurfaceTiles
                    label=""
                    onChange={(m) => {
                      if (!m) return;
                      close();
                      onDraftSurface(m);
                    }}
                  />
                  <Note>
                    {src.type === "face"
                      ? "ממלא את השטח הסגור בחומר מקיר לקיר, בלי להגדיר אותו כאזור: הוא לא נכנס לרשימת האזורים, והמשטח זז עם הקירות שסביבו."
                      : src.type === "features"
                        ? "השטח שמסביב לאלמנטים נפרש בחומר בלי להגדיר אותו כאזור. המשטח נשאר בצורה הזו ולא זז איתם; אפשר להזיז אותו ולשנות את קוויו אחר כך."
                        : "השטח המסומן נפרש בחומר בלי להגדיר אותו כאזור. אפשר להזיז אותו ולשנות את קוויו אחר כך."}
                  </Note>
                </>
              )}
            </Popover>
          </>
        )}
        {/* Or a building: the kitchen and the offices are a block with a roof, not a room an event
            books (the user, 2026-10-30). */}
        {onDraftBuilding && (
          <Popover label="מבנה" icon={Building2} value="בלי אזור" panelClassName="w-80">
            {(close) => (
              <BuildingDraft
                onBuild={(h) => {
                  close();
                  onDraftBuilding(h);
                }}
                note={
                  src.type === "face"
                    ? "השטח הסגור הופך למבנה בנוי עם תקרה — בלי להגדיר אותו כאזור: הוא לא נכנס לרשימת האזורים, ובמבט התלת־ממדי הוא גוש סגור בגובה הזה. המבנה זז עם הקירות שסביבו."
                    : "השטח המסומן הופך למבנה בנוי עם תקרה, בלי להגדיר אותו כאזור. אפשר להזיז אותו ולשנות את קוויו אחר כך."
                }
              />
            )}
          </Popover>
        )}
      </Bar>
    );
  }

  if (selection.length === 0) return null;

  const featureIds = selection.filter((r) => r.kind === "feature").map((r) => r.id);
  const features = featureIds.map((id) => structure.features.find((f) => f.id === id)).filter((f): f is StructureFeature => !!f);
  const allLocked = features.length > 0 && features.every((f) => f.locked);
  const lockButton = features.length > 0 && (
    <BarButton
      icon={allLocked ? LockOpen : Lock}
      label={allLocked ? "שחרור הנעילה · Ctrl+Shift+L" : "נעילה במקום — בלי גרירה, ידיות או מחיקה · Ctrl+Shift+L"}
      onClick={() => onLock(!allLocked)}
    />
  );
  const stackMenu = features.length > 0 && (
    <Menu
      label="סדר בערימה — מה מצויר מעל מה"
      icon={Layers}
      side="top"
      items={RESTACK.filter((r) => canRestack(r.how)).map<MenuItem>((r) => ({ label: r.label, icon: r.icon, onSelect: () => onRestack(r.how) }))}
    />
  );
  // `tintOnly` for what is drawn as a picture (a lawn, a palm): its drawing reads the fill as its
  // tint and has no line to style, so the line rows did nothing there.
  const styleOf = (style: ElementStyle | undefined, onChange: (style: ElementStyle | undefined) => void, tintOnly = false) => (
    <Popover label="מראה" icon={Palette} panelClassName="w-80">
      <StyleFields style={style} onChange={onChange} strokeWidthDefault={1.25} fillOnly={tintOnly} fillLabel={tintOnly ? "גוון" : undefined} />
      {tintOnly && <Note>הגוון מחליף את הצבע של החומר עצמו. ניקוי השדה מחזיר את הצבע המקורי.</Note>}
    </Popover>
  );
  // A selection made only of locked features is not deleted from here either: the lock means
  // "leave this alone" until it is taken off, and the Delete key already passes over them.
  const deleteOnly = (label: string) => (
    <div className="ms-auto flex items-center gap-1">
      <InspectorDivider />
      <BarButton icon={Trash2} label={`${label} · Delete`} onClick={onDelete} tone="danger" disabled={allLocked} />
    </div>
  );

  // "אזור" — the selected features named as a zone of their own, WITHOUT drawing round them (the
  // user, 2026-10-17: "define the canopies as zones"): the area round them, a margin wide, following
  // them as they move (lib/venues/feature-zones.ts). A selection that already IS a zone's features
  // says which; any other zone made of features can be re-made of the selection — how one is added
  // to it or taken out (its dialog's "בחירת האלמנטים" puts its members in the selection first).
  const zoneChip = (() => {
    if (!onFeatureZone || features.length === 0) return null;
    const ids = features.map((f) => f.id);
    const own = featureZones?.find((z) => z.featureIds.length === ids.length && ids.every((id) => z.featureIds.includes(id)));
    const others = (featureZones ?? []).filter((z) => z !== own);
    const what = ids.length === 1 ? "האלמנט" : `${ids.length} האלמנטים`;
    return (
      <Popover label="אזור" icon={SquareDashed} value={own ? own.name || "ללא שם" : "הגדרה"} panelClassName="w-80">
        {(close) => (
          <>
            {own ? (
              <Note>{`${ids.length === 1 ? "האלמנט הזה הוא" : "האלמנטים האלה הם"} האזור ״${own.name || "ללא שם"}״ — הוא עוטף אותם וזז איתם. שם, סוג ומרווח: בעריכת האזור ברשימה.`}</Note>
            ) : (
              <>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    close();
                    onFeatureZone(ids);
                  }}
                >
                  {`הגדרת ${what} כאזור`}
                </Button>
                <Note>בלי לצייר סביבם: האזור עוטף את האלמנטים במרווח שתבחרו, וזז ומשתנה איתם — למשל חופה: הבמה, המסלול והבריכה.</Note>
              </>
            )}
            {others.length > 0 && onSetZoneFeatures && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-border-soft pt-3">
                <p className="text-xs font-medium text-ink-soft">{own ? "או להגדיר אזור אחר לפיהם:" : "או לעדכן אזור קיים לפי הנבחרים:"}</p>
                {others.map((z) => (
                  <Button
                    key={z.id}
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      close();
                      onSetZoneFeatures(z.id, ids);
                    }}
                  >
                    {`עדכון ״${z.name || "ללא שם"}״`}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
      </Popover>
    );
  })();

  // A venue's pillars drawn the old way — footprints stacked on one centre, a plinth, a base, a
  // shaft — made into columns: one element each, with the column's own fields.
  const defineChip = onDefineColumns && features.length > 0 && canDefineColumns(features) && (
    <BarButton
      icon={Cylinder}
      label={features.length === 1 ? "הגדרה כעמוד — אלמנט אחד עם בסיס, טבעת ועמוד" : "הגדרה כעמודים — כל ערימה של צורות על מרכז אחד הופכת לעמוד אחד"}
      onClick={() => onDefineColumns(features.map((f) => f.id))}
    />
  );

  // ── several things ───────────────────────────────────────────────────────────────────────────
  if (selection.length > 1) {
    const kind = soleKind(selection);
    const wallIds = kind === "wall" ? selection.map((s) => s.id) : [];
    const units = features.filter((f) => !f.locked).length;
    return (
      <Bar icon={Layers} title={`${selection.length} ${kind ? KIND_NOUN[kind] : "פריטים"} נבחרו`} facts="גרירה מזיזה את כולם יחד" onClose={onClose}>
        {/* A field only appears for a group when it means the same thing for every member. Length
            doesn't (six walls have six lengths); kind does. */}
        {wallIds.length > 0 && (
          <SegmentedToggle
            value={structure.walls.find((w) => w.id === wallIds[0])?.kind ?? "wall"}
            options={[
              { value: "wall" as WallKind, label: "קיר" },
              { value: "edge" as WallKind, label: "גבול" },
            ]}
            onChange={(k) =>
              apply((s) => {
                let next = s;
                for (const id of wallIds) next = updateWall(next, id, { kind: k });
                return k === "edge" ? { ...next, entrances: next.entrances.filter((e) => !wallIds.includes(e.wallId)) } : next;
              })
            }
            ariaLabel="סוג הקירות"
          />
        )}
        {units > 1 && (
          <Menu
            label="יישור — לפי הראשון שנבחר"
            icon={AlignCenterVertical}
            side="top"
            items={ALIGN_OPS.filter((op) => !needsThree(op) || units > 2).map<MenuItem>((op) => ({ label: ALIGN_LABEL[op], onSelect: () => onAlign(op) }))}
          />
        )}
        {features.length > 0 && (
          <Rotation
            value={features.every((f) => f.rotationDeg === features[0].rotationDeg) ? features[0].rotationDeg : null}
            onChange={(deg) =>
              apply((s) => features.reduce((acc, f) => (f.locked ? acc : updateFeature(acc, f.id, { rotationDeg: deg })), s))
            }
          />
        )}
        {features.length > 0 &&
          styleOf(features[0].style, (style) => apply((s) => features.reduce((acc, f) => updateFeature(acc, f.id, { style }), s)))}
        {zoneChip}
        {defineChip}
        {lockButton}
        {stackMenu}
        {onDuplicate && features.length > 0 ? (
          <Actions onDuplicate={onDuplicate} duplicateLabel="שכפול הנבחרים" onDelete={onDelete} deleteLabel="מחיקת הנבחרים" />
        ) : (
          deleteOnly("מחיקת הנבחרים")
        )}
      </Bar>
    );
  }

  const one = selection[0];
  if (one.kind === "zone") return null; // edited from its row in the list

  // ── a wall ───────────────────────────────────────────────────────────────────────────────────
  if (one.kind === "wall") {
    const wall = structure.walls.find((w) => w.id === one.id);
    const pts = wall ? wallPoints(structure, wall) : null;
    if (!wall || !pts) return null;
    const onWall = structure.entrances.filter((e) => e.wallId === wall.id);
    const doors = onWall.filter((e) => !isWindow(e)).length;
    const windows = onWall.length - doors;
    const length = wallLengthMm(pts.a, pts.b);
    const maxBulge = Math.round(maxBulgeDepthMm(length) / 10);
    return (
      <Bar
        icon={Shapes}
        title={wall.kind === "edge" ? "גבול שטח" : "קיר"}
        facts={[`${(length / 1000).toFixed(2)} מ׳`, doors > 0 ? `${doors} כניסות` : null, windows > 0 ? `${windows} חלונות` : null].filter(Boolean).join(" · ")}
        onClose={onClose}
      >
        <Popover label="אורך" icon={Ruler} value={`${(length / 1000).toFixed(2)} מ׳`}>
          <PanelRow label="אורך (מ׳)" htmlFor="wall-length">
            <NumberField
              id="wall-length"
              decimals={2}
              min={0.1}
              step={0.1}
              commitOnBlur
              value={length / 1000}
              onChange={(m) => apply((s) => setWallLength(s, wall.id, m * 1000))}
              className="w-24"
            />
          </PanelRow>
          {/* How far the wall bows out of the straight line between its corners — the number
              behind the diamond handle on the plan. 0 straightens it. */}
          <PanelRow label={`עיקום (ס״מ, עד ${maxBulge})`} htmlFor="wall-bulge">
            <NumberField
              id="wall-bulge"
              decimals={0}
              min={0}
              max={maxBulge}
              step={5}
              commitOnBlur
              value={Math.round(bulgeDepthMm(pts.a, pts.b, wall.curve ?? null) / 10)}
              onChange={(cm) => apply((s) => setWallBulge(s, wall.id, cm * 10))}
              className="w-24"
            />
          </PanelRow>
        </Popover>
        <Rotation value={Math.round(wallAngleDeg(pts.a, pts.b))} onChange={(deg) => apply((s) => setWallAngle(s, wall.id, deg))} />
        {/* A wall can carry doors; a boundary is a line you can see but not walk into, so switching
            to one takes its doors with it. */}
        <SegmentedToggle
          value={wall.kind}
          options={[
            { value: "wall" as WallKind, label: "קיר" },
            { value: "edge" as WallKind, label: "גבול" },
          ]}
          onChange={(kind) =>
            apply((s) => {
              const next = updateWall(s, wall.id, { kind });
              return kind === "edge" ? { ...next, entrances: next.entrances.filter((e) => e.wallId !== wall.id) } : next;
            })
          }
          ariaLabel="סוג הקיר"
        />
        {wall.kind === "wall" && (
          <BarButton
            icon={DoorOpen}
            label="הוספת כניסה באמצע הקיר"
            onClick={() =>
              apply((s) => {
                const w = s.walls.find((x) => x.id === wall.id);
                const p = w ? wallPoints(s, w) : null;
                if (!w || !p) return s;
                return addEntrance(s, {
                  wallId: w.id,
                  distanceMm: Math.round(wallLengthMm(p.a, p.b) / 2),
                  widthMm: 1600,
                  swingInward: true,
                  doubleDoor: true,
                }).structure;
              })
            }
          />
        )}
        {wall.kind === "wall" && (
          <BarButton
            icon={AppWindow}
            label="הוספת חלון / ויטרינה באמצע הקיר — אפשר כמה על קיר אחד"
            onClick={() =>
              apply((s) => {
                const w = s.walls.find((x) => x.id === wall.id);
                const p = w ? wallPoints(s, w) : null;
                if (!w || !p) return s;
                return addEntrance(s, {
                  wallId: w.id,
                  distanceMm: Math.round(wallLengthMm(p.a, p.b) / 2),
                  widthMm: 2000,
                  swingInward: false,
                  doubleDoor: false,
                  kind: "window",
                }).structure;
              })
            }
          />
        )}
        {deleteOnly("מחיקת הקיר")}
      </Bar>
    );
  }

  // ── a corner ─────────────────────────────────────────────────────────────────────────────────
  if (one.kind === "node") {
    const node = nodeMap(structure).get(one.id);
    if (!node) return null;
    const attached = structure.walls.filter((w) => w.a === node.id || w.b === node.id).length;
    return (
      <Bar icon={CircleDot} title="פינה" facts={`${attached} קירות נפגשים כאן`} onClose={onClose}>
        <Popover label="מיקום" icon={Ruler} value={ltr(`${(node.x / 1000).toFixed(2)}, ${(node.y / 1000).toFixed(2)}`)}>
          <PanelRow label="X (מ׳)" htmlFor="node-x">
            <NumberField
              id="node-x"
              decimals={2}
              step={0.1}
              commitOnBlur
              value={node.x / 1000}
              onChange={(m) => apply((s) => moveNode(s, node.id, { x: Math.round(m * 1000), y: node.y }))}
              className="w-24"
            />
          </PanelRow>
          <PanelRow label="Y (מ׳)" htmlFor="node-y">
            <NumberField
              id="node-y"
              decimals={2}
              step={0.1}
              commitOnBlur
              value={node.y / 1000}
              onChange={(m) => apply((s) => moveNode(s, node.id, { x: node.x, y: Math.round(m * 1000) }))}
              className="w-24"
            />
          </PanelRow>
          <Note>החיצים מזיזים פינה נבחרת ב־10 ס״מ, עם Shift ב־50.</Note>
        </Popover>
        {deleteOnly("מחיקת הפינה")}
      </Bar>
    );
  }

  // ── a door ───────────────────────────────────────────────────────────────────────────────────
  if (one.kind === "door") {
    const door = structure.entrances.find((e) => e.id === one.id);
    const wall = door ? structure.walls.find((w) => w.id === door.wallId) : null;
    const pts = wall ? wallPoints(structure, wall) : null;
    if (!door || !pts) return null;
    const len = wallLengthMm(pts.a, pts.b);
    const off = doorOffsets(door, len);
    // The two corners the distance can run from, named by where they lie on the plan as it is drawn
    // (the door's wall from its middle) — a designer reads "from the left-hand corner" off the
    // screen, and node a / node b mean nothing to anyone.
    const centre = { x: pts.a.x + ((pts.b.x - pts.a.x) * door.distanceMm) / (len || 1), y: pts.a.y + ((pts.b.y - pts.a.y) * door.distanceMm) / (len || 1) };
    const from = door.measureFrom === "b" ? "b" : "a";
    const setCentre = (centreMm: number) => apply((s) => updateEntrance(s, door.id, { distanceMm: doorDistanceFrom(door, len, centreMm) }));
    // A window is the same opening with glass in it: the same place and width fields, and its own
    // panel for the glass — floor to ceiling (a ויטרינה), or between a sill and a head.
    const window = isWindow(door);
    const vitrine = window && isVitrine(door);
    const glassWords = !window ? (door.doubleDoor ? "כנף כפולה" : "כנף יחידה") : vitrine ? "זכוכית מהרצפה עד התקרה" : `אדן ${Math.round((door.sillMm ?? 0) / 10)} ס״מ · עד ${Math.round((door.headMm ?? WINDOW_HEAD_MM) / 10)} ס״מ`;
    return (
      <Bar
        icon={window ? AppWindow : DoorOpen}
        title={window ? (vitrine ? "ויטרינה" : "חלון") : "כניסה"}
        facts={`${door.widthMm / 10} ס״מ · ${(off.toEdgeMm / 1000).toFixed(2)} מ׳ ${cornerWord(centre, from === "a" ? pts.a : pts.b)} · ${glassWords}`}
        onClose={onClose}
      >
        <Popover label="מידות" icon={Ruler} value={`${door.widthMm / 10} ס״מ`} panelClassName="w-80">
          <PanelRow label="רוחב (ס״מ)" htmlFor="door-width">
            <NumberField
              id="door-width"
              decimals={0}
              min={40}
              step={10}
              value={door.widthMm / 10}
              // The corner it is measured from stays where it was: a wider door grows away from it.
              onChange={(cm) =>
                apply((s) => {
                  const widthMm = Math.round(cm * 10);
                  return updateEntrance(s, door.id, { widthMm, distanceMm: doorDistanceFrom({ ...door, widthMm }, len, off.toEdgeMm + widthMm / 2) });
                })
              }
              className="w-24"
            />
          </PanelRow>
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
            <NumberField
              id="door-edge"
              decimals={2}
              min={0}
              max={Math.max(0, (len - door.widthMm) / 1000)}
              step={0.1}
              commitOnBlur
              value={off.toEdgeMm / 1000}
              onChange={(m) => setCentre(m * 1000 + door.widthMm / 2)}
              className="w-24"
            />
          </PanelRow>
          <PanelRow label="מהפינה עד אמצע הפתח (מ׳)" htmlFor="door-at">
            <NumberField
              id="door-at"
              decimals={2}
              min={0}
              max={len / 1000}
              step={0.1}
              commitOnBlur
              value={off.toCentreMm / 1000}
              onChange={(m) => setCentre(m * 1000)}
              className="w-24"
            />
          </PanelRow>
          <Note>{`מהפינה השנייה עד הפתח: ${(off.farEdgeMm / 1000).toFixed(2)} מ׳. המידות מסומנות על התוכנית כש${window ? "החלון" : "הכניסה"} נבחר${window ? "" : "ת"}.`}</Note>
        </Popover>
        {window ? (
          <Popover label="זכוכית" icon={AppWindow} value={vitrine ? "ויטרינה" : "חלון"} panelClassName="w-80">
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
            {!vitrine && (
              <>
                <PanelRow label="אדן — גובה מהרצפה (ס״מ)" htmlFor="window-sill">
                  <NumberField
                    id="window-sill"
                    decimals={0}
                    min={0}
                    step={10}
                    commitOnBlur
                    value={Math.round((door.sillMm ?? 0) / 10)}
                    onChange={(cm) => apply((s) => updateEntrance(s, door.id, { sillMm: Math.max(0, Math.round(cm * 10)) }))}
                    className="w-24"
                  />
                </PanelRow>
                <PanelRow label="משקוף — גובה מהרצפה (ס״מ)" htmlFor="window-head">
                  <NumberField
                    id="window-head"
                    decimals={0}
                    min={10}
                    step={10}
                    commitOnBlur
                    value={Math.round((door.headMm ?? WINDOW_HEAD_MM) / 10)}
                    onChange={(cm) => apply((s) => updateEntrance(s, door.id, { headMm: Math.max(100, Math.round(cm * 10)) }))}
                    className="w-24"
                  />
                </PanelRow>
              </>
            )}
            <Note>{vitrine ? "ויטרינה — זכוכית מהרצפה עד גובה הקיר. בתוכנית היא קטע מזוגג בקיר; במבט התלת־ממדי, זכוכית במקום הקיר." : "חלון בקיר: הקיר נשאר מתחת לאדן ומעל המשקוף, ובין שניהם זכוכית."}</Note>
          </Popover>
        ) : (
          <>
            <SegmentedToggle
              value={door.doubleDoor}
              options={[
                { value: true, label: "כנף כפולה" },
                { value: false, label: "כנף יחידה" },
              ]}
              onChange={(doubleDoor) => apply((s) => updateEntrance(s, door.id, { doubleDoor }))}
              ariaLabel="מספר כנפיים"
            />
            <SegmentedToggle
              value={door.swingInward}
              options={[
                { value: true, label: "פנימה" },
                { value: false, label: "החוצה" },
              ]}
              onChange={(swingInward) => apply((s) => updateEntrance(s, door.id, { swingInward }))}
              ariaLabel="כיוון פתיחה"
            />
          </>
        )}
        {/* A curtain on this wall (lib/venues/curtain.ts): over the door, or parted for it — the
            main entrance stays clear, a service door is hidden behind the cloth. */}
        {!window && structure.features.some((f) => f.kind === "curtain" && f.curtain?.wallId === door.wallId) && (
          <SegmentedToggle
            value={!!door.curtainClear}
            options={[
              { value: false, label: "וילון מעל הדלת" },
              { value: true, label: "הווילון נפתח מול הדלת" },
            ]}
            onChange={(clear) => apply((s) => updateEntrance(s, door.id, { curtainClear: clear ? true : undefined }))}
            ariaLabel="הווילון מול הדלת"
          />
        )}
        {deleteOnly(window ? "מחיקת החלון" : "מחיקת הכניסה")}
      </Bar>
    );
  }

  // ── a feature ────────────────────────────────────────────────────────────────────────────────
  const feature = structure.features.find((f) => f.id === one.id);
  if (!feature) return null;
  const patch = (p: Parameters<typeof updateFeature>[2]) => apply((s) => updateFeature(s, feature.id, p));
  // Stairs and a ramp are measured by what they climb, not by a free width × depth × height: their
  // own panel replaces the shape and the size.
  const climb = isClimb(feature.kind);
  const surface = feature.kind === "surface";
  // The venue's own chairs in rows (lib/venues/seating.ts): sized by their rows and their chair.
  const seating = feature.kind === "seating";
  // A curtain: a stretch of its wall (lib/venues/curtain.ts) — no shape, size or turn of its own.
  const curtain = feature.kind === "curtain" ? curtainOf(feature) : null;
  // Measured ALONG the wall — round the bow of a curved one (lib/studio/anchor.ts WallTrack).
  const curtainWall = curtain ? wallTrack(structure, curtain.wallId) : null;
  // A column: its plinth is the size; its shaft and base are its own panel (lib/venues/column.ts).
  const column = feature.kind === "column" ? columnOf(feature) : null;
  // A surface laid wall to wall in a closed shape: the walls are its size and shape.
  const bound = followsWalls(feature);
  const icon =
    feature.kind === "plant" ? PLANT_ICON[plantSpecies(feature)] : feature.kind === "surface" ? SURFACE_ICON[surfaceMaterial(feature)] : FEATURE_ICON[feature.kind];
  const size = climb
    ? `${(feature.widthMm / 1000).toFixed(2)} × ${(climbRunMm(feature) / 1000).toFixed(2)} מ׳ · עולה ${Math.round(feature.heightMm / 10)} ס״מ`
    : curtain
      ? `${(curtainLengthMm(structure, feature) / 1000).toFixed(2)} מ׳ לאורך ה${curtainWall?.curved ? "קיר המעוגל" : "קיר"}${curtainWall ? ` (${(curtainWall.lengthMm / 1000).toFixed(2)} מ׳)` : ""}`
    : seating
      ? `${seatingCount(feature)} כיסאות · ${(feature.widthMm / 1000).toFixed(2)} × ${(feature.depthMm / 1000).toFixed(2)} מ׳`
      : feature.shape === "circle"
      ? `⌀ ${(feature.widthMm / 1000).toFixed(2)} מ׳`
      : `${(feature.widthMm / 1000).toFixed(2)} × ${(feature.depthMm / 1000).toFixed(2)} מ׳`;
  // The depth of a ח's counter or a curved bar's band — null for every shape that has none.
  const band =
    feature.shape === "u-shape"
      ? uShapeBandOf(feature.widthMm, feature.depthMm, feature.ring)
      : feature.shape === "oval-ring" || feature.shape === "horseshoe" || feature.shape === "rounded-u"
        ? ringSpecOf(feature.widthMm, feature.depthMm, feature.ring, feature.shape).bandMm
        : null;
  const facts = [
    // A surface says what it is laid in — unless its name already does ("דשא" is not "דשא · דשא").
    surface && feature.label && feature.label !== SURFACE_MATERIAL_LABEL[surfaceMaterial(feature)] ? SURFACE_MATERIAL_LABEL[surfaceMaterial(feature)] : FEATURE_KIND_LABEL[feature.kind],
    bound ? `ממלא שטח סגור · ${Math.round(polygonAreaMm2(featureWorldOutline(feature)) / 1_000_000)} מ״ר` : size,
    band !== null && feature.kind === "bar" ? `דלפק ${Math.round(band / 10)} ס״מ` : null,
    column ? `עמוד ⌀ ${cmOf(column.shaftMm)} ס״מ` : null,
    !climb && !surface && !seating && feature.heightMm > 0 ? `גובה ${(feature.heightMm / 1000).toFixed(2)} מ׳` : null,
    feature.locked ? "נעול" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ── one of the stage's edge items, picked on the plan: the sketch's own bar for it ───────────
  const it = activeEdge?.featureId === feature.id ? edgeRows(feature, wallDistance).find((r) => r.id === activeEdge.itemId) : undefined;
  if (it) {
    const change = (patch: Parameters<typeof onEdgeChange>[2]) => onEdgeChange(feature.id, it.id, patch);
    return (
      <Bar
        icon={EDGE_ICON[it.kind]}
        title={VENUE_EDGE_LABEL[it.kind]}
        facts={[it.side, it.inner ? "שקועות בבמה" : null, it.full ? "כל הצד" : `${cmOf(it.widthMm)} ס״מ`, it.kind === "ramp" ? `אורך ${m(it.depthMm)} מ׳` : null].filter(Boolean).join(" · ")}
        onClose={onClose}
      >
        <BarButton icon={ArrowRight} label="חזרה לבמה" onClick={() => onSelectEdge(feature.id, null)} />
        {it.kind === "stairs" && (
          <Popover label="מיקום" icon={Layers2} value={it.inner ? "פנימי" : "חיצוני"} tone={!it.inner && !it.outerFits ? "warn" : "default"}>
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
                  <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => change({ inner: true })}>
                    להעביר לתוך הבמה
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-ink">{it.inner ? "בתוך הבמה." : "מחוץ לבמה."} {it.innerFits || it.inner ? "" : "אי אפשר לשקוע מדרגות בצד הזה."}</p>
            )}
            <Note>מדרגות פנימיות שקועות בתוך קו הבמה — עולים מהרצפה בשפה. זו הדרך היחידה למדרגות בצד שקרוב לקיר.</Note>
          </Popover>
        )}
        <Popover label="סוג" icon={Grid2x2} value={VENUE_EDGE_LABEL[it.kind]} panelClassName="w-[22rem]">
          <Segmented label="מה עומד בצד הזה" value={it.kind} options={VENUE_EDGE_KINDS.map((k) => [k, VENUE_EDGE_LABEL[k]] as const)} onChange={(kind) => change({ kind })} />
          <Note>{it.kind === "stairs" ? "עלייה לבמה. מספר המדרגות נקבע מהגובה." : "עלייה בשיפוע 1:12 לכיסא גלגלים — האורך נקבע מגובה הבמה."}</Note>
        </Popover>
        <Popover label="רוחב" icon={MoveHorizontal} value={it.full ? "כל הצד" : `${cmOf(it.widthMm)} ס״מ`}>
          <Segmented
            label="רוחב"
            value={it.full ? "full" : "set"}
            options={[
              ["set", "לפי מידה"],
              ["full", "כל הצד"],
            ] as const}
            onChange={(v) => change({ full: v === "full" })}
          />
          {!it.full && (
            <PanelRow label="רוחב (ס״מ)" htmlFor="edge-w">
              <NumberField id="edge-w" decimals={0} min={30} max={3000} commitOnBlur value={cmOf(it.widthMm)} onChange={(cm) => change({ widthMm: cm * 10 })} className="w-20" />
            </PanelRow>
          )}
          <Note>אפשר גם לגרור את הקצוות בתוכנית, ואת הפריט כולו לאורך הצד.</Note>
        </Popover>
        {it.kind === "stairs" && (
          <Popover label="מדרגות" icon={Footprints} tone={it.riserMm > 200 ? "warn" : "default"} value={ltr(`${it.risers}×${cmOf(it.riserMm)}`)}>
            <PanelRow label="מספר מדרגות" htmlFor="edge-r">
              {it.manual && it.risers !== it.autoRisers && <BarButton icon={Undo2} label={`חזרה לאוטומטי (${it.autoRisers})`} onClick={() => change({ risers: null })} />}
              <NumberField id="edge-r" decimals={0} min={1} max={20} value={it.risers} onChange={(n) => change({ risers: n })} className="w-20" />
            </PanelRow>
            {it.riserMm > 200 && <p className="text-xs text-alert-ink">מדרגה של {cmOf(it.riserMm)} ס״מ גבוהה לעלייה — כדאי להוסיף מדרגה.</p>}
          </Popover>
        )}
        <BarButton icon={Trash2} label={`מחיקת ה${VENUE_EDGE_LABEL[it.kind]} · Delete`} tone="danger" onClick={() => onRemoveEdge(feature.id, it.id)} />
      </Bar>
    );
  }
  return (
    <Bar icon={icon} title={feature.label || FEATURE_KIND_LABEL[feature.kind]} facts={facts} onClose={onClose}>
      <Popover label="שם" icon={Type} value={feature.label || "ללא שם"} panelClassName="w-72">
        <TextField aria-label="שם" value={feature.label} onChange={(label) => patch({ label })} placeholder={FEATURE_KIND_LABEL[feature.kind]} />
      </Popover>

      {/* What it is drawn as. A plant's species IS its shape; a surface keeps a shape and adds what
          it is laid in; a climb has neither (its own panel below). */}
      {feature.kind === "plant" ? (
        <Popover label="סוג צמח" icon={PLANT_ICON[plantSpecies(feature)]} value={PLANT_SPECIES_LABEL[plantSpecies(feature)]}>
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
        </Popover>
      ) : climb || seating ? null : (
        <>
          {/* A surface's material, picked by its look — the zone dialog's own tiles. */}
          {surface && (
            <Popover label="חומר" icon={SURFACE_ICON[surfaceMaterial(feature)]} value={SURFACE_MATERIAL_LABEL[surfaceMaterial(feature)]} panelClassName="w-80">
              <SurfaceTiles label="" value={surfaceMaterial(feature)} onChange={(m) => m && patch(surfaceMaterialPatch(feature, m))} />
              {feature.style?.fill && <Note>החלפת החומר מחזירה את הצבע שלו — הגוון שנבחר לחומר הקודם יורד.</Note>}
            </Popover>
          )}
          {!bound && !curtain && (
            <Popover label="צורה" icon={Shapes} value={SHAPE_LABEL[feature.shape]}>
              <PanelRow label="צורה" stack>
                <Select
                  value={feature.shape}
                  // The drawn outline is kept under any other shape, so "צורה חופשית" stays on the list
                  // while there is one to go back to — once off it, it used to be gone for good.
                  options={MAP_SHAPES.filter((sh) => sh !== "custom" || feature.shape === "custom" || (feature.outline?.length ?? 0) >= 3).map((sh) => ({ value: sh, label: SHAPE_LABEL[sh] }))}
                  onChange={(shape) => patch({ shape: shape as StructureFeature["shape"] })}
                  aria-label="צורה"
                  className="w-full"
                />
              </PanelRow>
              {surface && <Note>לכל צורה אחרת: ״עריכת הקווים״ בסרגל — גוררים פינות, מוסיפים ומוחקים.</Note>}
            </Popover>
          )}
        </>
      )}

      {climb ? (
        <Popover label={feature.kind === "ramp" ? "רמפה" : "מדרגות"} icon={FEATURE_ICON[feature.kind]} value={size} panelClassName="w-[26rem]">
          <ClimbFields feature={feature} patch={patch} />
        </Popover>
      ) : seating ? (
        (() => {
          // The sketch's own rows panel — the same fields, the same layout — and the chair they
          // are made of. Every edit keeps the FRONT row where it stands (seatingPatch).
          const spec = seatingOf(feature);
          const chair = seatingChair(spec);
          const style = spec.chairStyle ?? "dining";
          return (
            <>
              <ChairRowsPopover rows={spec} chair={chair} onChange={(rows) => rows && patch(seatingPatch(feature, rows))} />
              <Popover label="כיסא" icon={Armchair} value={CHAIR_STYLE_LABEL[style]} panelClassName="w-80">
                <PanelRow label="סוג" stack>
                  <Select
                    value={style}
                    options={CHAIR_STYLES.map((c) => ({ value: c, label: CHAIR_STYLE_LABEL[c] }))}
                    onChange={(v) => patch(seatingPatch(feature, { chairStyle: v as ChairStyle }))}
                    aria-label="סוג הכיסא"
                    className="w-full"
                  />
                </PanelRow>
                <PanelRow label="רוחב כיסא (ס״מ)" htmlFor="seat-w">
                  <NumberField id="seat-w" decimals={0} min={30} max={120} step={5} commitOnBlur value={cmOf(chair.widthMm)} onChange={(cm) => patch(seatingPatch(feature, { chairWidthMm: cm * 10 }))} className="w-20" />
                </PanelRow>
                <PanelRow label="עומק כיסא (ס״מ)" htmlFor="seat-d">
                  <NumberField id="seat-d" decimals={0} min={30} max={120} step={5} commitOnBlur value={cmOf(chair.depthMm)} onChange={(cm) => patch(seatingPatch(feature, { chairDepthMm: cm * 10 }))} className="w-20" />
                </PanelRow>
                <Note>הכיסאות של המקום עצמו: כך הם מצוירים כאן, בכל סקיצה ובהדפסה. גוון הכיסאות — ב״מראה״.</Note>
              </Popover>
            </>
          );
        })()
      ) : curtain ? (
        <Popover label="קטע" icon={FEATURE_ICON.curtain} value={size} panelClassName="w-80">
          {curtainWall ? (
            <>
              <PanelRow label="מתחילת הקיר (מ׳)" htmlFor="curtain-from">
                <NumberField
                  id="curtain-from"
                  decimals={2}
                  min={0}
                  max={curtainWall.lengthMm / 1000}
                  step={0.1}
                  commitOnBlur
                  value={curtainWall.mmAt(curtain.from) / 1000}
                  onChange={(m) => apply((s) => updateFeature(s, feature.id, curtainPatch(s, feature, { from: curtainWall.tAt(m * 1000) })))}
                  className="w-24"
                />
              </PanelRow>
              <PanelRow label="עד (מ׳)" htmlFor="curtain-to">
                <NumberField
                  id="curtain-to"
                  decimals={2}
                  min={0}
                  max={curtainWall.lengthMm / 1000}
                  step={0.1}
                  commitOnBlur
                  value={curtainWall.mmAt(curtain.to) / 1000}
                  onChange={(m) => apply((s) => updateFeature(s, feature.id, curtainPatch(s, feature, { to: curtainWall.tAt(m * 1000) })))}
                  className="w-24"
                />
              </PanelRow>
              <div className="flex gap-2 py-1">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => apply((s) => updateFeature(s, feature.id, curtainPatch(s, feature, { from: 0, to: 1 })))}>
                  כל הקיר
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => apply((s) => updateFeature(s, feature.id, curtainPatch(s, feature, { side: curtain.side === 1 ? -1 : 1 })))}>
                  לצד השני של הקיר
                </Button>
              </div>
              <PanelRow label="גובה (מ׳, 0 = עד התקרה)" htmlFor="curtain-h">
                <NumberField id="curtain-h" decimals={2} min={0} step={0.1} commitOnBlur value={feature.heightMm / 1000} onChange={(m) => patch({ heightMm: Math.round(m * 1000) })} className="w-24" />
              </PanelRow>
              <Note>הווילון תלוי על הקיר וזז איתו. בסקיצה אפשר להסיר אותו לאירוע אחד או להחליף אותו בווילון מהקטלוג — המתחם עצמו לא משתנה.</Note>
            </>
          ) : (
            <Note>הקיר שהווילון היה תלוי עליו נמחק. מחקו את הווילון ותלו אחד חדש.</Note>
          )}
        </Popover>
      ) : bound ? null : (
        <Popover label="מידות" icon={Ruler} value={size}>
          <PanelRow label={`${feature.shape === "circle" ? "קוטר" : "רוחב"}${column ? " הבסיס" : ""} (מ׳)`} htmlFor="feature-w">
            <NumberField
              id="feature-w"
              decimals={2}
              min={0.1}
              step={0.1}
              value={feature.widthMm / 1000}
              onChange={(m) => patch({ widthMm: Math.round(m * 1000) })}
              className="w-24"
            />
          </PanelRow>
          {feature.shape !== "circle" && (
            <PanelRow label={column ? "עומק הבסיס (מ׳)" : "עומק (מ׳)"} htmlFor="feature-d">
              <NumberField
                id="feature-d"
                decimals={2}
                min={0.1}
                step={0.1}
                value={feature.depthMm / 1000}
                onChange={(m) => patch({ depthMm: Math.round(m * 1000) })}
                className="w-24"
              />
            </PanelRow>
          )}
          {/* The ground has no height — the field only ever showed a 0 nothing read. */}
          {!surface && (
            <PanelRow label="גובה (מ׳)" htmlFor="feature-h">
              <NumberField
                id="feature-h"
                decimals={2}
                min={0}
                step={0.1}
                value={feature.heightMm / 1000}
                onChange={(m) => patch({ heightMm: Math.round(m * 1000) })}
                className="w-24"
              />
            </PanelRow>
          )}
          {/* A ח's counter (and a curved bar's band) is a depth of its own: the box above is how far
              the arms reach, this is how deep the counter is, and resizing never changes it. */}
          {band !== null && (
            <>
              <PanelRow label={feature.kind === "bar" ? "עומק הדלפק (ס״מ)" : "עובי הפס (ס״מ)"} htmlFor="feature-band">
                <NumberField
                  id="feature-band"
                  decimals={0}
                  min={5}
                  step={5}
                  commitOnBlur
                  value={Math.round(band / 10)}
                  onChange={(cm) => patch({ ring: { ...feature.ring, bandMm: Math.round(cm * 10) } })}
                  className="w-24"
                />
              </PanelRow>
              <Note>{feature.kind === "bar" ? "עומק הדלפק נשאר קבוע כשמשנים את הרוחב והעומק של הבר." : "העובי נשאר קבוע כשמשנים את הגודל."}</Note>
            </>
          )}
        </Popover>
      )}

      {column && (
        <Popover label="עמוד" icon={Cylinder} value={`⌀ ${cmOf(column.shaftMm)} ס״מ`} panelClassName="w-80">
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
        </Popover>
      )}

      {!climb && !bound && !curtain && <Rotation value={feature.rotationDeg} onChange={(rotationDeg) => patch({ rotationDeg })} />}

      {/* THE EDGES — the sketch's own panel: what stands on them, what is still bare (and one
          click to finish it), and adding one more, which is then clicked onto a side; each one is
          edited by clicking it on the plan. Stairs and a ramp only on a stage or a platform somebody
          climbs onto (takesEdgeItems) — never a bar, a fence panel or a column — and only a STAGE's
          bare edge is called a fault. */}
      {takesEdgeItems(feature) &&
        (() => {
          const rows = edgeRows(feature, wallDistance);
          const gapsMm = featureGaps(feature, wallDistance).reduce((t, g) => t + g.lengthMm, 0);
          const flights = rows.filter((r) => r.kind === "stairs");
          const ramps = rows.filter((r) => r.kind === "ramp").length;
          const open = gapsMm > 0;
          const warn = open && edgesMatter(feature);
          const picking = edgePick?.featureId === feature.id ? edgePick.kind : null;
          return (
            <Popover
              label="קצוות"
              icon={Footprints}
              panelClassName="w-80"
              tone={warn ? "warn" : "default"}
              value={
                picking
                  ? "לחצו על צד"
                  : warn
                    ? `${m(gapsMm)} מ׳ פתוחים`
                    : flights.length > 0
                      ? `${flights.length} מדרגות`
                      : ramps > 0
                        ? "רמפה"
                        : open
                          ? "ללא מדרגות"
                          : "סגור"
              }
            >
              <ul className="space-y-1 text-sm">
                {flights.length > 0 && (
                  <li className="flex justify-between gap-3">
                    <span className="text-ink">מדרגות</span>
                    <span className="nums text-muted">{`${flights.length} · ${m(flights.reduce((t, r) => t + r.widthMm, 0))} מ׳`}</span>
                  </li>
                )}
                {ramps > 0 && (
                  <li className="flex justify-between gap-3">
                    <span className="text-ink">רמפה</span>
                    <span className="nums text-muted">{ramps}</span>
                  </li>
                )}
                {rows.length === 0 && <li className="text-muted">אין מדרגות על הבמה.</li>}
              </ul>
              {open && (
                <div className="mt-2 space-y-1.5 border-t border-border-soft pt-2">
                  <p className={`text-xs ${warn ? "text-alert-ink" : "text-muted"}`}>
                    {warn ? `${m(gapsMm)} מ׳ של שפה פתוחה — מסומנים באדום בתוכנית.` : `${m(gapsMm)} מ׳ של שפה בלי מדרגות.`}
                  </p>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => onFillEdges(feature.id, "stairs")}>
                    מדרגות בכל הצדדים הפתוחים
                  </Button>
                </div>
              )}
              <div className="mt-2 border-t border-border-soft pt-2">
                <span className="mb-1 block text-xs font-medium text-ink-soft">הוספה — ואז לחיצה על צד הבמה</span>
                <div className="grid grid-cols-2 gap-1">
                  {VENUE_EDGE_KINDS.map((k) => (
                    <Button key={k} size="sm" variant={picking === k ? "primary" : "outline"} onClick={() => onStartEdge(feature.id, k)}>
                      <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                      {VENUE_EDGE_LABEL[k]}
                    </Button>
                  ))}
                </div>
              </div>
              <Note>לחיצה על מדרגות או רמפה בתוכנית עורכת אותן; גרירה מזיזה לאורך הצד, והידיות בקצוות קובעות את הרוחב.</Note>
            </Popover>
          );
        })()}

      {styleOf(feature.style, (style) => patch({ style }), surface || feature.kind === "plant" || seating || !!curtain)}

      {/* A surface that fills a closed shape follows its walls; cut loose, it is a free surface of
          the same outline. A free one is reshaped point by point, as a freehand zone is. */}
      {bound && <BarButton icon={Unlink} label="ניתוק מהקירות — המשטח נשאר בצורתו, ואפשר להזיז אותו ולשנות את קוויו" onClick={() => patch({ fillsFace: undefined })} />}
      {surface && !bound && !feature.locked && onToggleOutline && (
        <BarButton
          icon={PenLine}
          active={outlineEditId === feature.id}
          label={
            outlineEditId === feature.id
              ? "סיום עריכת הקווים · Esc"
              : "עריכת הקווים — גררו פינה, גררו נקודת אמצע כדי להוסיף פינה, לחיצה כפולה על פינה מוחקת אותה"
          }
          onClick={() => onToggleOutline(feature.id)}
        />
      )}

      {/* Whether an EVENT may move this in its sketch. Default by kind (featureMovable): a bar and a
          stage yes, everything else no. A sketch only ever stores its own offset — this plan is
          never written from there. */}
      {feature.kind !== "surface" && (
        <Popover label="בסקיצה" icon={MousePointer2} value={featureMovable(feature) ? "ניתן להזזה" : "קבוע"}>
          <PanelRow label="ניתן להזזה בסקיצת אירוע">
            <Switch checked={featureMovable(feature)} onChange={(movable) => patch({ movable })} label="ניתן להזזה בסקיצה" />
          </PanelRow>
          <Note>סקיצה של אירוע שומרת רק את ההזזה שלה; תוכנית המקום עצמה לעולם לא נכתבת משם.</Note>
        </Popover>
      )}

      {zoneChip}
      {defineChip}
      {lockButton}
      {stackMenu}
      {onDuplicate ? (
        <Actions onDuplicate={onDuplicate} duplicateLabel="שכפול האלמנט" onDelete={onDelete} deleteLabel="מחיקת האלמנט" />
      ) : (
        deleteOnly("מחיקת האלמנט")
      )}
    </Bar>
  );
}
