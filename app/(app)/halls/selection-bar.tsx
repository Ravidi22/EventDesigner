"use client";

import {
  Accessibility,
  AlignCenterVertical,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BringToFront,
  CircleDot,
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
  Plus,
  Ruler,
  SendToBack,
  Shapes,
  Trash2,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Segmented } from "@/components/segmented";
import { VENUE_EDGE_KINDS, VENUE_EDGE_LABEL, edgeRows, featureGaps, type VenueEdgeKind } from "@/lib/venues/stage-edges";
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
import { bulgeDepthMm, maxBulgeDepthMm, wallAngleDeg, wallLengthMm } from "@/lib/studio/geometry";
import type { ElementStyle } from "@/lib/element-style";
import { MAP_SHAPES, SHAPE_LABEL } from "@/lib/catalog/types";
import { climbRunMm, isClimb } from "@/lib/venues/climb";
import {
  FEATURE_KIND_LABEL,
  PLANT_DEFAULTS,
  PLANT_SPECIES,
  PLANT_SPECIES_LABEL,
  SURFACE_MATERIALS,
  SURFACE_MATERIAL_LABEL,
  addEntrance,
  featureMovable,
  moveNode,
  nodeMap,
  plantSpecies,
  setWallAngle,
  setWallBulge,
  setWallLength,
  surfaceMaterial,
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
import { ClimbFields, FEATURE_ICON, PLANT_ICON, STAGE_STAIRS_RULE, SURFACE_ICON } from "@/components/venue-inspector";
import { ZONE_KIND_LABEL, type ZoneKind, type ZoneSource } from "@/lib/venues/zone";
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
  onSaveDraftZone,
  onCancelDraftZone,
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
  draftZone?: { source: ZoneSource; name: string; kind: ZoneKind } | null;
  onDraftZoneChange?: (patch: { name?: string; kind?: ZoneKind }) => void;
  onSaveDraftZone?: () => void;
  onCancelDraftZone?: () => void;
}) {
  // ── a zone being named ───────────────────────────────────────────────────────────────────────
  if (draftZone) {
    return (
      <Bar icon={Layers} title={draftZone.source.type === "face" ? "מתן שם לשטח הסגור" : "מתן שם לשטח המסומן"} onClose={onCancelDraftZone}>
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
  const styleOf = (style: ElementStyle | undefined, onChange: (style: ElementStyle | undefined) => void) => (
    <Popover label="מראה" icon={Palette} panelClassName="w-80">
      <StyleFields style={style} onChange={onChange} strokeWidthDefault={1.25} />
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
    const doors = structure.entrances.filter((e) => e.wallId === wall.id).length;
    const length = wallLengthMm(pts.a, pts.b);
    const maxBulge = Math.round(maxBulgeDepthMm(length) / 10);
    return (
      <Bar
        icon={Shapes}
        title={wall.kind === "edge" ? "גבול שטח" : "קיר"}
        facts={[`${(length / 1000).toFixed(2)} מ׳`, doors > 0 ? `${doors} כניסות` : null].filter(Boolean).join(" · ")}
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
    return (
      <Bar icon={DoorOpen} title="כניסה" facts={`${door.widthMm / 10} ס״מ · ${door.doubleDoor ? "כנף כפולה" : "כנף יחידה"}`} onClose={onClose}>
        <Popover label="מידות" icon={Ruler} value={`${door.widthMm / 10} ס״מ`}>
          <PanelRow label="רוחב (ס״מ)" htmlFor="door-width">
            <NumberField
              id="door-width"
              decimals={0}
              min={40}
              step={10}
              value={door.widthMm / 10}
              onChange={(cm) => apply((s) => updateEntrance(s, door.id, { widthMm: Math.round(cm * 10) }))}
              className="w-24"
            />
          </PanelRow>
          <PanelRow label="מרחק מקצה הקיר (מ׳)" htmlFor="door-at">
            <NumberField
              id="door-at"
              decimals={2}
              min={0}
              max={wallLengthMm(pts.a, pts.b) / 1000}
              step={0.1}
              value={door.distanceMm / 1000}
              onChange={(m) => apply((s) => updateEntrance(s, door.id, { distanceMm: Math.round(m * 1000) }))}
              className="w-24"
            />
          </PanelRow>
        </Popover>
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
        {deleteOnly("מחיקת הכניסה")}
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
  const icon =
    feature.kind === "plant" ? PLANT_ICON[plantSpecies(feature)] : feature.kind === "surface" ? SURFACE_ICON[surfaceMaterial(feature)] : FEATURE_ICON[feature.kind];
  const size = climb
    ? `${(feature.widthMm / 1000).toFixed(2)} × ${(climbRunMm(feature) / 1000).toFixed(2)} מ׳ · עולה ${Math.round(feature.heightMm / 10)} ס״מ`
    : feature.shape === "circle"
      ? `⌀ ${(feature.widthMm / 1000).toFixed(2)} מ׳`
      : `${(feature.widthMm / 1000).toFixed(2)} × ${(feature.depthMm / 1000).toFixed(2)} מ׳`;
  const facts = [FEATURE_KIND_LABEL[feature.kind], size, !climb && feature.heightMm > 0 ? `גובה ${(feature.heightMm / 1000).toFixed(2)} מ׳` : null, feature.locked ? "נעול" : null]
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
      ) : climb ? null : (
        <Popover label="צורה" icon={Shapes} value={feature.kind === "surface" ? `${SURFACE_MATERIAL_LABEL[surfaceMaterial(feature)]} · ${SHAPE_LABEL[feature.shape]}` : SHAPE_LABEL[feature.shape]}>
          {feature.kind === "surface" && (
            <PanelRow label="חומר" stack>
              <Select
                value={surfaceMaterial(feature)}
                options={SURFACE_MATERIALS.map((m) => ({ value: m, label: SURFACE_MATERIAL_LABEL[m] }))}
                onChange={(v) => {
                  const next = v as SurfaceMaterial;
                  const renamed = feature.label !== SURFACE_MATERIAL_LABEL[surfaceMaterial(feature)];
                  patch({ surface: next, ...(renamed ? {} : { label: SURFACE_MATERIAL_LABEL[next] }) });
                }}
                aria-label="חומר"
                className="w-full"
              />
            </PanelRow>
          )}
          <PanelRow label="צורה" stack>
            <Select
              value={feature.shape}
              options={MAP_SHAPES.filter((sh) => sh !== "custom" || feature.shape === "custom").map((sh) => ({ value: sh, label: SHAPE_LABEL[sh] }))}
              onChange={(shape) => patch({ shape: shape as StructureFeature["shape"] })}
              aria-label="צורה"
              className="w-full"
            />
          </PanelRow>
        </Popover>
      )}

      {climb ? (
        <Popover label={feature.kind === "ramp" ? "רמפה" : "מדרגות"} icon={FEATURE_ICON[feature.kind]} value={size} panelClassName="w-[26rem]">
          <ClimbFields feature={feature} patch={patch} />
        </Popover>
      ) : (
        <Popover label="מידות" icon={Ruler} value={size}>
          <PanelRow label={feature.shape === "circle" ? "קוטר (מ׳)" : "רוחב (מ׳)"} htmlFor="feature-w">
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
            <PanelRow label="עומק (מ׳)" htmlFor="feature-d">
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
        </Popover>
      )}

      {!climb && <Rotation value={feature.rotationDeg} onChange={(rotationDeg) => patch({ rotationDeg })} />}

      {/* THE EDGES — the sketch's own panel: what stands on them, what is still bare (and one
          click to finish it), and adding one more, which is then clicked onto a side; each one is
          edited by clicking it on the plan. Stairs and a ramp only on a built stage. */}
      {STAGE_STAIRS_RULE(feature) &&
        (() => {
          const rows = edgeRows(feature, wallDistance);
          const gapsMm = featureGaps(feature, wallDistance).reduce((t, g) => t + g.lengthMm, 0);
          const flights = rows.filter((r) => r.kind === "stairs");
          const ramps = rows.filter((r) => r.kind === "ramp").length;
          const open = gapsMm > 0;
          const picking = edgePick?.featureId === feature.id ? edgePick.kind : null;
          return (
            <Popover
              label="קצוות"
              icon={Footprints}
              panelClassName="w-80"
              tone={open ? "warn" : "default"}
              value={picking ? "לחצו על צד" : open ? `${m(gapsMm)} מ׳ פתוחים` : flights.length > 0 ? `${flights.length} מדרגות` : "סגור"}
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
                  <p className="text-xs text-alert-ink">{m(gapsMm)} מ׳ של שפה פתוחה — מסומנים באדום בתוכנית.</p>
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

      {styleOf(feature.style, (style) => patch({ style }))}

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
