"use client";

import { CircleDot, DoorOpen, Footprints, Layers, Shapes, Trash2, X } from "lucide-react";
import { bulgeDepthMm, maxBulgeDepthMm, wallAngleDeg, wallLengthMm } from "@/lib/studio/geometry";
import type { ElementStyle } from "@/lib/element-style";
import {
  FEATURE_KIND_LABEL,
  addEntrance,
  addStairs,
  moveNode,
  nodeMap,
  removeStairs,
  setWallAngle,
  setWallBulge,
  setWallLength,
  updateEntrance,
  updateFeature,
  updateStairs,
  updateWall,
  wallPoints,
  type FeatureKind,
  type StructureFeature,
  type VenueStructure,
  type WallKind,
} from "@/lib/venues/structure";
import {
  MAX_STEPS,
  STAIRS_SIDES,
  STAIRS_SIDE_LABEL,
  stairsRiserMm,
  stepsForRise,
  type StairsSide,
} from "@/lib/venues/stairs";
import { ZONE_KIND_LABEL, type Zone, type ZoneKind } from "@/lib/venues/zone";
import { soleKind, type PlanSelection, type PlanSelectionKind } from "@/lib/venues/selection";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import { StyleFields } from "@/components/style-fields";
import {
  INSPECTOR_WRAP,
  InspectorDivider,
  InspectorGroup,
  InspectorHeader,
  SegmentedToggle,
} from "@/components/plan-canvas";

export const FEATURE_KINDS: FeatureKind[] = ["pool", "stage", "bar", "structure", "other"];

const SHAPE_LABEL = { rect: "מלבן", circle: "עיגול", ellipse: "אליפסה" } as const;
const KIND_NOUN: Record<PlanSelectionKind, string> = {
  zone: "אזורים",
  wall: "קירות",
  node: "פינות",
  door: "כניסות",
  feature: "אלמנטים",
};

// The floating inspector for everything the plan draws as geometry: a wall, a corner, a door, a
// fixed feature. Every field is the real stored number in the unit a designer would say out loud —
// metres for spans, centimetres for a door leaf — because the whole point of this panel is that the
// plan stops being approximately what you dragged and becomes exactly what you measured.
//
// Zones are not here: a zone has no geometry of its own (see lib/venues/zone.ts), so its fields
// belong beside its name in the list, not floating over the drawing.
export function VenueInspector({
  selection,
  structure,
  apply,
  onDelete,
  onClose,
}: {
  selection: PlanSelection[];
  structure: VenueStructure;
  /** One discrete, undoable edit. Every mutation here goes through lib/venues/structure.ts. */
  apply: (fn: (s: VenueStructure) => VenueStructure) => void;
  /** Deletes the whole selection. The host owns it — a mixed group spans four collections. */
  onDelete: () => void;
  onClose: () => void;
}) {
  if (selection.length === 0) return null;

  const closeBtn = (
    <IconButton label="סגירת בחירה" className="ms-auto" onClick={onClose}>
      <X className="h-4 w-4" strokeWidth={2} />
    </IconButton>
  );
  const deleteBtn = (
    <Button variant="danger" size="sm" onClick={onDelete}>
      <Trash2 className="h-4 w-4" strokeWidth={2} />
      מחיקה
    </Button>
  );

  // --- a group -----------------------------------------------------------------------------------
  if (selection.length > 1) {
    const kind = soleKind(selection);
    const wallIds = kind === "wall" ? selection.map((s) => s.id) : [];
    // Only zones are excluded from the count's noun, because a group can legitimately mix a zone
    // with geometry (marquee over a room catches its tint and its walls at once).
    return (
      <div className={INSPECTOR_WRAP}>
        <InspectorHeader icon={Layers} label={`${selection.length} ${kind ? KIND_NOUN[kind] : "פריטים"} נבחרו`} />
        <InspectorDivider />
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
        {kind === "feature" && (
          <InspectorGroup>
            <StyleFields
              style={structure.features.find((f) => f.id === selection[0].id)?.style}
              onChange={(style: ElementStyle | undefined) =>
                apply((s) => {
                  let next = s;
                  for (const ref of selection) next = updateFeature(next, ref.id, { style });
                  return next;
                })
              }
              strokeWidthDefault={1.25}
            />
          </InspectorGroup>
        )}
        <InspectorDivider />
        {deleteBtn}
        {closeBtn}
      </div>
    );
  }

  const one = selection[0];
  if (one.kind === "zone") return null; // edited in the list, beside its name

  if (one.kind === "wall") {
    const wall = structure.walls.find((w) => w.id === one.id);
    const pts = wall ? wallPoints(structure, wall) : null;
    if (!wall || !pts) return null;
    const doors = structure.entrances.filter((e) => e.wallId === wall.id).length;
    return (
      <div className={INSPECTOR_WRAP}>
        <InspectorHeader icon={Shapes} label={wall.kind === "edge" ? "גבול שטח" : "קיר"} />
        <InspectorDivider />
        <InspectorGroup>
          <NumberField
            layout="inline"
            label="אורך (מ׳)"
            decimals={2}
            min={0.1}
            step={0.1}
            commitOnBlur
            value={wallLengthMm(pts.a, pts.b) / 1000}
            onChange={(m) => apply((s) => setWallLength(s, wall.id, m * 1000))}
            className="w-20"
          />
          <NumberField
            layout="inline"
            label="זווית (°)"
            decimals={0}
            commitOnBlur
            value={Math.round(wallAngleDeg(pts.a, pts.b))}
            onChange={(deg) => apply((s) => setWallAngle(s, wall.id, deg))}
            className="w-16"
          />
        </InspectorGroup>
        <InspectorDivider />
        {/* How far the wall bows out of the straight line between its corners — the number behind
            the diamond handle on the plan. 0 straightens it. The ceiling is the wall's own: a bow
            deeper than the wall is long is a curve nobody drew on purpose. */}
        <InspectorGroup>
          <NumberField
            layout="inline"
            label={`עיקום (ס״מ, עד ${Math.round(maxBulgeDepthMm(wallLengthMm(pts.a, pts.b)) / 10)})`}
            decimals={0}
            min={0}
            max={Math.round(maxBulgeDepthMm(wallLengthMm(pts.a, pts.b)) / 10)}
            step={5}
            commitOnBlur
            value={Math.round(bulgeDepthMm(pts.a, pts.b, wall.curve ?? null) / 10)}
            onChange={(cm) => apply((s) => setWallBulge(s, wall.id, cm * 10))}
            className="w-20"
          />
        </InspectorGroup>
        <InspectorDivider />
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
          <Button
            variant="ghost"
            size="sm"
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
          >
            <DoorOpen className="h-4 w-4" strokeWidth={2} />
            הוספת כניסה
          </Button>
        )}
        {doors > 0 && <span className="shrink-0 text-xs text-muted nums">{doors} כניסות</span>}
        <InspectorDivider />
        {deleteBtn}
        {closeBtn}
      </div>
    );
  }

  if (one.kind === "node") {
    const node = nodeMap(structure).get(one.id);
    if (!node) return null;
    const attached = structure.walls.filter((w) => w.a === node.id || w.b === node.id).length;
    return (
      <div className={INSPECTOR_WRAP}>
        <InspectorHeader icon={CircleDot} label="פינה" />
        <InspectorDivider />
        <InspectorGroup>
          <NumberField
            layout="inline"
            label="X (מ׳)"
            decimals={2}
            step={0.1}
            commitOnBlur
            value={node.x / 1000}
            onChange={(m) => apply((s) => moveNode(s, node.id, { x: Math.round(m * 1000), y: node.y }))}
            className="w-20"
          />
          <NumberField
            layout="inline"
            label="Y (מ׳)"
            decimals={2}
            step={0.1}
            commitOnBlur
            value={node.y / 1000}
            onChange={(m) => apply((s) => moveNode(s, node.id, { x: node.x, y: Math.round(m * 1000) }))}
            className="w-20"
          />
        </InspectorGroup>
        <InspectorDivider />
        <span className="shrink-0 text-xs text-muted">
          <span className="nums">{attached}</span> קירות נפגשים כאן
        </span>
        {deleteBtn}
        {closeBtn}
      </div>
    );
  }

  if (one.kind === "door") {
    const door = structure.entrances.find((e) => e.id === one.id);
    const wall = door ? structure.walls.find((w) => w.id === door.wallId) : null;
    const pts = wall ? wallPoints(structure, wall) : null;
    if (!door || !pts) return null;
    return (
      <div className={INSPECTOR_WRAP}>
        <InspectorHeader icon={DoorOpen} label="כניסה" />
        <InspectorDivider />
        <InspectorGroup>
          <NumberField
            layout="inline"
            label="רוחב (ס״מ)"
            decimals={0}
            min={40}
            step={10}
            value={door.widthMm / 10}
            onChange={(cm) => apply((s) => updateEntrance(s, door.id, { widthMm: Math.round(cm * 10) }))}
            className="w-20"
          />
          <NumberField
            layout="inline"
            label="מרחק מקצה הקיר (מ׳)"
            decimals={2}
            min={0}
            max={wallLengthMm(pts.a, pts.b) / 1000}
            step={0.1}
            value={door.distanceMm / 1000}
            onChange={(m) => apply((s) => updateEntrance(s, door.id, { distanceMm: Math.round(m * 1000) }))}
            className="w-20"
          />
        </InspectorGroup>
        <InspectorDivider />
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
        <InspectorDivider />
        {deleteBtn}
        {closeBtn}
      </div>
    );
  }

  const feature = structure.features.find((f) => f.id === one.id);
  if (!feature) return null;
  const patch = (p: Parameters<typeof updateFeature>[2]) => apply((s) => updateFeature(s, feature.id, p));
  return (
    <div className={INSPECTOR_WRAP}>
      <InspectorHeader icon={Shapes} label={FEATURE_KIND_LABEL[feature.kind]} />
      <InspectorDivider />
      <InspectorGroup>
        <input
          value={feature.label}
          onChange={(e) => patch({ label: e.target.value })}
          aria-label="שם האלמנט"
          className="h-10 w-28 rounded-md border border-border bg-canvas px-2 text-sm text-ink transition-colors hover:border-accent-line focus-visible:border-accent focus-visible:outline-none"
        />
        <SegmentedToggle
          value={feature.shape}
          options={(Object.keys(SHAPE_LABEL) as (keyof typeof SHAPE_LABEL)[]).map((s) => ({ value: s, label: SHAPE_LABEL[s] }))}
          onChange={(shape) => patch({ shape })}
          ariaLabel="צורה"
        />
      </InspectorGroup>
      <InspectorDivider />
      <InspectorGroup>
        <NumberField
          layout="inline"
          label={feature.shape === "circle" ? "קוטר (מ׳)" : "רוחב (מ׳)"}
          decimals={2}
          min={0.1}
          step={0.1}
          value={feature.widthMm / 1000}
          onChange={(m) => patch({ widthMm: Math.round(m * 1000) })}
          className="w-20"
        />
        {feature.shape !== "circle" && (
          <NumberField
            layout="inline"
            label="עומק (מ׳)"
            decimals={2}
            min={0.1}
            step={0.1}
            value={feature.depthMm / 1000}
            onChange={(m) => patch({ depthMm: Math.round(m * 1000) })}
            className="w-20"
          />
        )}
        <NumberField
          layout="inline"
          label="גובה (מ׳)"
          decimals={2}
          min={0}
          step={0.1}
          value={feature.heightMm / 1000}
          onChange={(m) => patch({ heightMm: Math.round(m * 1000) })}
          className="w-20"
        />
        <NumberField
          layout="inline"
          label="זווית (°)"
          decimals={0}
          min={0}
          max={360}
          value={feature.rotationDeg}
          onChange={(rotationDeg) => patch({ rotationDeg })}
          className="w-16"
        />
      </InspectorGroup>
      <InspectorDivider />
      <InspectorGroup>
        <StyleFields style={feature.style} onChange={(style: ElementStyle | undefined) => patch({ style })} strokeWidthDefault={1.25} />
      </InspectorGroup>
      <InspectorDivider />
      <StairsFields feature={feature} apply={apply} />
      {deleteBtn}
      {closeBtn}
    </div>
  );
}

// Stairs onto a raised feature. One button while there are none — the count and the step height are
// worked out from the deck's own height, so the common case is a single click and nothing to fill in
// — and the fields to correct it once there are.
//
// The two numbers are two views of one fact, not two independent settings: risers must add up to the
// deck height exactly, so the count is what is stored and the height is derived from it (see
// lib/venues/stairs.ts). Typing a height therefore asks for the count that lands nearest it, and the
// field snaps to the height that count actually produces — which is the honest answer, since no
// other height would reach the stage.
function StairsFields({
  feature,
  apply,
}: {
  feature: StructureFeature;
  apply: (fn: (s: VenueStructure) => VenueStructure) => void;
}) {
  // Offered on anything raised enough to need them, rather than on the stage alone: a 60cm built
  // platform labelled מבנה needs steps for exactly the same reason a stage does.
  if (feature.kind !== "stage" && feature.heightMm < 300) return null;

  const stairs = feature.stairs;
  if (!stairs) {
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => apply((s) => addStairs(s, feature.id))}>
          <Footprints className="h-4 w-4" strokeWidth={2} />
          הוספת מדרגות
        </Button>
        <InspectorDivider />
      </>
    );
  }

  const riserMm = stairsRiserMm(feature);
  const set = (patch: Partial<typeof stairs>) => apply((s) => updateStairs(s, feature.id, patch));
  return (
    <>
      <InspectorGroup>
        <SegmentedToggle
          value={stairs.side}
          options={STAIRS_SIDES.map((side) => ({ value: side as StairsSide, label: STAIRS_SIDE_LABEL[side] }))}
          onChange={(side) => set({ side })}
          ariaLabel="צד המדרגות"
        />
      </InspectorGroup>
      <InspectorGroup>
        <NumberField
          layout="inline"
          label="מדרגות"
          decimals={0}
          min={1}
          max={MAX_STEPS}
          value={stairs.steps}
          onChange={(steps) => set({ steps })}
          className="w-14"
        />
        <NumberField
          layout="inline"
          label="גובה מדרגה (ס״מ)"
          decimals={1}
          min={1}
          step={1}
          commitOnBlur
          value={Math.round(riserMm) / 10}
          onChange={(cm) => set({ steps: stepsForRise(feature.heightMm, cm * 10) })}
          className="w-16"
        />
        <NumberField
          layout="inline"
          label="עומק מדרגה (ס״מ)"
          decimals={0}
          min={20}
          step={5}
          commitOnBlur
          value={Math.round(stairs.treadMm / 10)}
          onChange={(cm) => set({ treadMm: cm * 10 })}
          className="w-16"
        />
        <NumberField
          layout="inline"
          label="רוחב (מ׳)"
          decimals={2}
          min={0.4}
          step={0.1}
          commitOnBlur
          value={stairs.widthMm / 1000}
          onChange={(m) => set({ widthMm: Math.round(m * 1000) })}
          className="w-20"
        />
        <IconButton label="הסרת המדרגות" onClick={() => apply((s) => removeStairs(s, feature.id))}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
        </IconButton>
      </InspectorGroup>
      <InspectorDivider />
    </>
  );
}

// The zone's own fields, shown inline in the list under the selected zone. Everything here is what
// a zone actually *is* — a name, a kind, how many people fit, how high the ceiling is — since its
// shape belongs to the walls and is not editable from a zone at all.
//
// Capacity and ceiling were read-only on the card before this: the list displayed both and offered
// no way to set either, which is a dead end for the two numbers the designer quotes from.
export function ZoneFields({
  zone,
  onChange,
  onDelete,
}: {
  zone: Zone;
  onChange: (patch: Partial<Zone>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2.5 border-t border-border pt-3">
      <input
        value={zone.name}
        onChange={(e) => onChange({ name: e.target.value })}
        aria-label="שם האזור"
        placeholder="שם האזור"
        className="h-9 w-full rounded-sm border border-border bg-canvas px-2.5 text-sm font-semibold text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
      />
      <div className="flex flex-wrap gap-1">
        {(Object.keys(ZONE_KIND_LABEL) as ZoneKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange({ kind: k })}
            aria-pressed={zone.kind === k}
            className={`rounded-pill border px-2.5 py-1 text-[11px] transition-colors ${
              zone.kind === k ? "border-accent bg-accent text-white" : "border-badge-line bg-canvas text-muted hover:border-accent-line"
            }`}
          >
            {ZONE_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-2">
        <NumberField
          layout="inline"
          label="מושבים"
          decimals={0}
          min={0}
          step={10}
          hideZero
          value={zone.capacity?.seated ?? 0}
          onChange={(seated) => onChange({ capacity: { ...zone.capacity, seated } })}
          className="w-16"
        />
        <NumberField
          layout="inline"
          label="עמידה"
          decimals={0}
          min={0}
          step={10}
          hideZero
          value={zone.capacity?.standing ?? 0}
          onChange={(standing) => onChange({ capacity: { ...zone.capacity, standing } })}
          className="w-16"
        />
        {/* 0 is not a missing value here — it is the stored meaning of "open to the sky", which is
            why a canopy or a lawn legitimately sits at zero rather than blank. */}
        <NumberField
          layout="inline"
          label="תקרה (מ׳)"
          decimals={1}
          min={0}
          step={0.5}
          value={zone.ceilingHeightMm / 1000}
          onChange={(m) => onChange({ ceilingHeightMm: Math.round(m * 1000) })}
          className="w-16"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StyleFields
          style={zone.style}
          onChange={(style: ElementStyle | undefined) => onChange({ style })}
          strokeWidthDefault={0}
          fillLabel="גוון"
          strokeLabel="מסגרת"
        />
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 self-start rounded-sm px-1.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-canvas hover:text-alert"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
        מחיקת האזור
      </button>
    </div>
  );
}
