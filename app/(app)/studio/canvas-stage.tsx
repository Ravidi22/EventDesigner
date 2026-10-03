"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DesignDocumentContent, DesignTable, Placement, WallSpan } from "@/lib/design-document/types";
import type { Plane } from "@/lib/studio/planes";
import { groupSeated, groupSeats } from "@/lib/design-document/groups";
import { seatsAround, CHAIR_BACK_MM, CHAIR_D_MM, CHAIR_W_MM, type Seat } from "@/lib/studio/seating";
import { deckOf, resolve, tableUtilization, type Resolved } from "@/lib/studio/catalog-resolver";
import { pointToT, resolveSpan, wallSegment, nearestWall } from "@/lib/studio/anchor";
import { toLocalFrame, fromLocalFrame, rotatedExtent, tableAt } from "@/lib/studio/geometry";
import { overlappingAtStart, pushApart, type SolidBox } from "@/lib/studio/collide";
import { featureFootprint, type VenueStructure } from "@/lib/venues/structure";
import { resolveFootprint, resolveContent, footprintBounds, catalogBox, clampSize, resizeAxes, type Footprint } from "@/lib/studio/footprint";
import type { Point } from "@/lib/studio/hall";
import type { EventPlan } from "@/lib/events/plan";
import { zoneBounds } from "@/lib/venues/zone";
import { isDark, resolveStyle } from "@/lib/element-style";
import { isAdditiveClick } from "@/lib/keyboard";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";
import { FootprintShape, tableBlockedSides, tableFootprint, placementFootprint, productStyle } from "@/components/footprint-shape";
import { labelAnchor } from "@/lib/studio/label-anchor";
import { PlanCanvas, RotateHandle, type CanvasFocus, type CanvasLayerContext, type ContextMenuItem, type MarqueeMode, type MeasureTarget } from "@/components/plan-canvas";
import { IconButton } from "@/components/icon-button";
import { Grid2x2Plus, ShieldAlert } from "lucide-react";
import { lengthSnapper, type LaidDeck, type LengthSnap } from "@/lib/studio/stage-fill";
import { constrainNext, moveVertex, pushSide, removeVertex, selfIntersects, splitSide, squareUp } from "@/lib/studio/stage-draw";
import {
  benchInRoom,
  edgeGaps,
  edgeItemShape,
  itemEdge,
  stageCorners,
  itemSpan,
  layStage,
  reframeStage,
  stageDeckTypes,
  stageRect,
  toRoom,
  toStageFrame,
  type EdgeRun,
  type StagePlacement,
} from "@/lib/design-document/stage";
import type { StageBuild, StageStair } from "@/lib/design-document/types";
import { signedArea } from "@/lib/studio/stage-fill";
import { MIRROR_TRANSFORM, uprightTransform } from "@/lib/design-document/mirror";
import { polysBox, type ClearanceIssue, type ClearanceSubject } from "@/lib/studio/proximity";
import { itemGeometry } from "./plan-geometry";
import { constrainAngleDeg, type SnapBox } from "@/lib/studio/snap";
import { carriedItem, carriedOf, type CarriedItem } from "@/lib/studio/drag-payload";
import type { Product } from "@/lib/catalog/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { ZoneRegions, StructureFeatures, StructureDoors } from "@/components/venue-plan";
import { arrangedStructure } from "@/lib/design-document/features";
import { floorStack, type StackKind } from "@/lib/design-document/stacking";

// The studio's design surface — the app's one canvas (components/plan-canvas.tsx) with the design
// document drawn into its layers.
//
// It owns the viewport, grid, pan/zoom, fit and the wall graph itself; this file supplies the venue
// plan underneath (the same ZoneRegions / StructureFeatures / StructureDoors the hall editor uses,
// so the two screens cannot drift into drawing the same property two different ways) and the
// tables and placements on top.
//
// THE WALLS ARE NOT EDITABLE HERE. Walls, corners, doors and zones are a property of the PROPERTY,
// drawn once at /halls — an event is designed inside them, never by moving them. That is enforced by
// omission rather than by a flag: the canvas only draws corner handles and takes wall clicks when
// given onMoveGraphNode/onSelectGraph, and the zone layer is only interactive when given onSelect.
// None of those are passed.
//
// ITS FURNITURE IS. A venue FEATURE — the bar, a staging deck, a marquee — can be dragged and turned
// here, and the one thing that makes that safe is that it does not write to the venue. The document
// stores an offset for this event only (lib/design-document/features.ts), so the same bar stands
// against the far wall for a wedding and in the middle of the room for a launch, neither event
// disturbs the other, and a property re-surveyed at /halls carries both arrangements with it. The
// pool moves too — it is the designer's judgement, not ours, and putting it back is one button.
//
// WHAT THIS SURFACE CAN DO THAT IT COULD NOT: select several things at once (shift-click, or a
// rubber-band across the room), drag the lot by one delta, and align a dragged item to the walls
// and to the other items with the same accent guide lines the hall editor draws. Those were never
// deliberate omissions — they live in PlanCanvas for the things PlanCanvas itself draws, and
// everything on THIS screen is host-drawn, so each one had to be met on this side of the seam.
// Passing onMarquee is also what settles the pan gesture: a canvas with a rubber-band pans on Space
// (or the middle button) and rubber-bands on a plain drag, which is the one this screen wanted.
/** The three kinds of thing on this surface that can be picked up. `feature` is the venue's own —
 *  see the note at the top of this file about what moving one does and does not mean. */
export type SelectionKind = "table" | "placement" | "feature";
export interface SelectionRef {
  kind: SelectionKind;
  id: string;
}
/** What the inspector edits: exactly one thing, or nothing. A selection of six has no fields to
 *  show — see the studio screen, which narrows the list down to this before handing it over. */
export type Selection = SelectionRef | null;

/** What the rotate handle does with a selection of SEVERAL — the one question a single item never
 *  has to answer.
 *
 *   together — the lot swings about the one centre they share. Right for a block: four decks pushed
 *              into one platform are one object and turn like one, corner sweeping round.
 *   each     — every item turns where it stands, about its own centre, by the same angle. Right for
 *              a room of tables: "turn them all a quarter turn" means each of them, not all of them
 *              orbiting the middle of the hall and landing somewhere else entirely.
 *
 *  Both are real gestures and neither is a default the other can be reached from, which is why this
 *  is a choice on screen (the inspector's מה הידית מסובבת) rather than a modifier key nobody finds. */
export type SpinMode = "together" | "each";

const sameRef = (a: SelectionRef, b: SelectionRef) => a.kind === b.kind && a.id === b.id;

export function CanvasStage({
  doc,
  plan,
  selection,
  layerVisible,
  spin,
  activeLayer,
  focusZoneId,
  onSelect,
  onSelectMany,
  onMoveTable,
  onMovePlacement,
  onMoveFeature,
  onMoveMany,
  onRotateMany,
  onEndDrag,
  onResizePlacement,
  onSpanPlacement,
  onDropProduct,
  onScale,
  clearance,
  showClearance,
  onToggleClearance,
  onResizeTable,
  stageFillActive,
  onStageFill,
  drawArea,
  onArea,
  onCancelArea,
  onAreaRefused,
  areaRefDeg,
  areaPreview,
  onPickFront,
  onAreaReshape,
  areaLengthSnap,
  stageRailings,
  onStageOutline,
  placeGhost,
  onPlaceStage,
  armed,
  onPlaceArmed,
  onDisarm,
  stageWallDistance,
  activeEdgeItem,
  onEdgeItemSelect,
  onEdgeItemChange,
  stairPick,
  onPickStair,
  onContextMenu,
}: {
  doc: DesignDocumentContent;
  plan: EventPlan;
  /** Everything selected right now — one item, or a whole group. */
  selection: SelectionRef[];
  layerVisible: Record<Plane, boolean>;
  /** What the rotate handle does with several things at once — see SpinMode. */
  spin: SpinMode;
  /** The layer being worked in, or null for "all of them" — see the note on `isLive` below. */
  activeLayer: Plane | null;
  /** The zone the designer asked to be shown (the toolbar's eye). Frames it and holds everything
   *  else back; null = the whole event, which is what the surface opens on. */
  focusZoneId: string | null;
  /** A plain click replaces the selection (null clears it); `additive` is shift/ctrl, which toggles. */
  onSelect: (ref: SelectionRef | null, additive: boolean) => void;
  /** A rubber-band drag finished — everything its box touched. `mode` is what the band does with
   *  them (plan-canvas's MarqueeMode): replace the selection, add to it, or toggle each one. */
  onSelectMany: (refs: SelectionRef[], additive: boolean, mode?: MarqueeMode) => void;
  onMoveTable: (id: string, pos: Point) => void;
  onMovePlacement: (id: string, pos: Point) => void;
  /** A venue feature pushed somewhere for THIS event. Absolute world mm, like everything else on
   *  this surface — the screen converts it to the offset the document actually stores, because only
   *  it knows where the property has the thing. */
  onMoveFeature: (id: string, pos: Point) => void;
  /** A whole selection dragged by one shared delta — one action, so one undo step. */
  onMoveMany: (moves: { kind: SelectionKind; id: string; position: Point }[]) => void;
  /** A whole selection turned about one pivot: each member's new centre AND new facing, absolute.
   *  One item turns about itself; several turn about the box they share, which is what makes a
   *  block of tables swing round the room without coming apart. */
  onRotateMany: (turns: { kind: SelectionKind; id: string; position: Point; rotation: number }[]) => void;
  /** The end of a drag, however many frames it took: the host closes its history entry here.
   *  `moved` is what the gesture actually carried (a drag's cargo, a rotate's members), for the
   *  host to settle what now stands on what; absent for a gesture that moved nothing in particular. */
  onEndDrag: (moved?: SelectionRef[]) => void;
  /** A carpet stretched by its corner: the new size, and the centre it moved to (the opposite
   *  corner stays put, which is what dragging one corner means). */
  onResizePlacement: (id: string, sizeMm: { widthMm: number; depthMm: number }, position: Point) => void;
  /** A drape's run along its wall, after dragging one of its ends. */
  onSpanPlacement: (id: string, span: WallSpan) => void;
  onDropProduct: (productId: string, x: number, y: number) => void;
  /** The current zoom, in world mm per screen pixel. Reported up so the catalog rail can draw the
   *  thing being dragged at the size it will actually land — see catalog-rail.tsx. */
  onScale?: (mmPerPx: number) => void;
  /** The safety-distance picture (Product.clearanceMm), worked out by the screen — which also hands
   *  the breaches to the inspector, so the two are one computation rather than two that could drift. */
  clearance: { subjects: ClearanceSubject[]; issues: ClearanceIssue[] };
  /** Whether the halos are drawn. Breaches are drawn whatever this says: a warning the designer can
   *  switch off by switching off the view it lives in is not a warning. */
  showClearance: boolean;
  onToggleClearance: () => void;
  /** A resizable table stretched by a handle: its new size, and the centre that keeps the edge
   *  opposite the handle where it was. */
  onResizeTable: (id: string, sizeMm: { widthMm: number; depthMm: number }, position: Point) => void;
  /** The "מילוי במות" tool: whether it is open at all (lights its button), and the button itself. */
  stageFillActive: boolean;
  onStageFill: () => void;
  /** Drawing the area: every click on the plan is a corner, whatever is under it. */
  drawArea: boolean;
  onArea: (polygon: Point[]) => void;
  onCancelArea: () => void;
  /** An outline that could not be a stage (it crosses itself) — the screen says so. */
  onAreaRefused?: (message: string) => void;
  /** The angle the area tool squares its sides to — a level is square to its stage. Absent = square
   *  to the wall nearest the first corner (a stage along an angled wall is square to THAT wall). */
  areaRefDeg?: number;
  /** The drawn area and the decks it would get — a preview, drawn over everything, taking no clicks. */
  areaPreview: { polygon: Point[]; front: number; decks: LaidDeck[] } | null;
  /** A click on one of the preview's edges: that edge is the stage's front now. */
  onPickFront: (edge: number) => void;
  /** The preview's outline re-shaped by its grips (corners dragged, sides pushed, split, removed). */
  onAreaReshape?: (polygon: Point[], front: number) => void;
  /** What lengths the decks being drawn with build exactly — drawn sides are pulled to them. */
  areaLengthSnap?: LengthSnap;
  /** Where each stage needs a railing (the studio's rule, lib/design-document/stage.ts), by
   *  placement id — drawn on the stage while the rule is on. */
  stageRailings?: Record<string, EdgeRun[]>;
  /** A stage re-shaped by the grips on its sides: its new build and where it now stands. */
  onStageOutline?: (id: string, stage: StageBuild, position: Point) => void;
  /** Placing a saved stage: its outline (in its own frame) follows the pointer; a click puts it down. */
  placeGhost?: Point[] | null;
  /** The catalog item armed on the rail (click-to-place): it follows the pointer, at true scale,
   *  and every click on the plan puts one down where it shows. */
  armed?: Product | null;
  /** A click with an item armed — the point already snapped and cleared exactly as a drop's is.
   *  `keep` is Shift: stay armed even for an item that lets go after one (placesOnce). */
  onPlaceArmed?: (at: Point, keep: boolean) => void;
  /** Right-click while armed: put the item down without placing it. */
  onDisarm?: () => void;
  /** How far a point is from a wall or another stage, for one stage — what "open edge" means. */
  stageWallDistance?: (stageId: string) => (p: Point) => number;
  onPlaceStage?: (at: Point) => void;
  /** The stairs / banquette / barrier being edited on the selected stage. */
  activeEdgeItem?: string | null;
  onEdgeItemSelect?: (stageId: string, itemId: string | null) => void;
  /** An edge item slid along its side or resized by its grips. */
  onEdgeItemChange?: (stageId: string, item: StageStair) => void;
  /** Placing a flight of stairs: the sides it may stand against, in room coordinates. A click on one
   *  reports which side and how far along it. */
  stairPick?: { level?: string; edge: number; a: Point; b: Point }[] | null;
  onPickStair?: (level: string | undefined, edge: number, t: number) => void;
  /** The right-click menu for a set of things: the thing under the pointer (selected first, when
   *  it was not), or the whole selection when it was one of them or the click landed on floor. */
  onContextMenu?: (refs: SelectionRef[]) => ContextMenuItem[];
}) {
  // THE PLANES FOLLOW THE HAND. With no plane chosen on the toolbar, the one being worked in is read
  // off the gesture: dragging a table (or a stage, a rug — anything standing on the floor) holds
  // back the ceiling and what is laid on tables; carrying a centrepiece holds back the floor and the
  // ceiling, since only a table can take it; placing a chandelier holds back everything below it;
  // drawing a stage, placing stairs or a saved stage are floor work. The planes that cannot be the
  // gesture's target dim and stop taking the pointer, exactly as choosing one on the toolbar does —
  // and come back the moment the pointer lifts. A plane chosen on the toolbar still wins: that is
  // the designer saying so, this is the canvas guessing well.
  const [gesturePlane, setGesturePlane] = useState<Plane | null>(null);
  /** What a drag is carrying, keyed `kind:id` — PAINTED LAST in the floor pass, over everything it
   *  crosses, whatever its own place in the stack, so a table carried across a stage stays in sight
   *  all the way. Its real place is settled when it lands (the host's autoStack). State rather than
   *  the ref below, because the paint order is read during render. */
  const [lifted, setLifted] = useState<string[]>([]);
  const autoPlane: Plane | null = gesturePlane ?? (armed ? armed.layer : drawArea || stairPick || placeGhost ? "floor" : null);
  const relevant = (p: Plane): readonly Plane[] => (p === "ceiling" ? ["ceiling"] : p === "table" ? ["tables", "table"] : ["tables", "floor"]);
  const livePlanes = activeLayer !== null ? [activeLayer] : autoPlane ? relevant(autoPlane) : null;
  /** Is this plane accepting the pointer? With nothing chosen and no gesture under way every
   *  visible one is, which is how this canvas has always behaved. */
  const isLive = (l: Plane) => livePlanes === null || livePlanes.includes(l);
  /** Which plane a thing is worked in — what a drag of it sets `gesturePlane` to. */
  const planeOf = (ref: SelectionRef): Plane => {
    if (ref.kind === "table") return "tables";
    if (ref.kind === "feature") return "floor";
    const p = doc.placements.find((x) => x.id === ref.id);
    return p?.layer ?? "floor";
  };
  /** What a plane's <g> wears when it is visible but not the one being worked in. */
  const layerAttrs = (l: Plane) =>
    isLive(l) ? undefined : { opacity: 0.35, style: { pointerEvents: "none" as const } };

  // Frame the event's zones — or the one zone the eye picked — and only once there is something to
  // frame: the plan resolves from the server after mount, so framing on the first render would
  // spend the move on an empty box and leave the event off-screen.
  //
  // Keyed on the BOX, not on a "have I framed yet" flag. The box is a pure function of the event,
  // the zones it occupies and the zone being focused, so it changes exactly when the answer to
  // "what am I looking at" changes — another event opened from the sidebar, the designer editing
  // which zones this one occupies, or the eye pointed at the חופה. It does NOT change while
  // drawing, so the designer's own panning is still never yanked back mid-work.
  //
  // The first framing CUTS and every later one TRAVELS (CanvasFocus.immediate): opening a stage is
  // not a journey from a default frame nobody asked to see, but being moved from the חופה to the
  // hall is a journey, and the travel is what says so.
  const [focus, setFocus] = useState<CanvasFocus | null>(null);
  const framedBox = useRef<string | null>(null);
  const nonce = useRef(0);
  const focused = focusZoneId ? plan.all.find((r) => r.zone.id === focusZoneId) : undefined;
  const box = focused && focused.boundary.length >= 3 ? zoneBounds(focused) : plan.bounds;
  const { minX, minY, maxX, maxY, widthMm, heightMm } = box;
  useEffect(() => {
    // widthMm OR heightMm: a zone drawn as a narrow strip is degenerate on one axis and still a real
    // place to be taken to.
    if (!widthMm && !heightMm) return;
    const key = `${minX},${minY},${maxX},${maxY}`;
    if (framedBox.current === key) return;
    const first = framedBox.current === null;
    framedBox.current = key;
    nonce.current += 1;
    setFocus({ minX, minY, maxX, maxY, nonce: nonce.current, immediate: first });
  }, [minX, minY, maxX, maxY, widthMm, heightMm]);

  // The property as THIS event has arranged it. Every reference to the venue's geometry below goes
  // through this rather than through plan.structure, so a bar the designer pushed across the room is
  // drawn where they put it — and a drape still measures itself against the WALL, which nothing here
  // can move. Identity-stable when the event arranged nothing, which is most events.
  const structure = useMemo(() => arrangedStructure(plan.structure, doc), [plan.structure, doc]);

  const eventZoneIds = plan.zones.map((r) => r.zone.id);
  // Three bands rather than two, once the eye is pointed somewhere: the zone being worked in, the
  // event's other zones, and the property around them. Held back by opacity, never hidden — placing
  // just outside a zone stays possible, and the designer still needs to see what the חופה opens on.
  const focusedZones = focused ? [focused] : [];
  const eventZones = plan.zones.filter((r) => r.zone.id !== focusZoneId);
  const otherZones = plan.all.filter((r) => r.zone.id !== focusZoneId && !eventZoneIds.includes(r.zone.id));

  // Sort the placements by what they ARE before drawing any of them: a drape hangs on a wall, a
  // cloth is a table's surface, a carpet is a rectangle on the floor, and everything else is an
  // object standing somewhere. Which is which comes from the product's category (CategoryDef
  // anchor/sizing, lifted onto the resolver), never from guessing at whichever fields are set.
  const sorted = useMemo(() => {
    const drapes: Placement[] = [];
    const carpets: Placement[] = [];
    const items: Placement[] = [];
    const ceiling: Placement[] = [];
    const coverByTable = new Map<string, Placement>();
    const chipsByTable = new Map<string, Placement[]>();
    const perched: Placement[] = [];

    for (const p of doc.placements) {
      const r = resolve(p.variantId);
      if (p.perch) {
        perched.push(p);
      } else if (r?.anchor === "wall") {
        drapes.push(p);
      } else if (p.layer === "table" && p.tableId) {
        if (r?.anchor === "table") coverByTable.set(p.tableId, p);
        else chipsByTable.set(p.tableId, [...(chipsByTable.get(p.tableId) ?? []), p]);
      } else if (p.layer === "ceiling") {
        ceiling.push(p);
      } else if (r?.sizing === "stretch") {
        carpets.push(p);
      } else {
        items.push(p);
      }
    }
    // These buckets say what a thing IS. They no longer say what order it is drawn in — that is one
    // stack over the whole floor now (see `stack` below and lib/design-document/stacking.ts).
    return { drapes, carpets, items, ceiling, coverByTable, chipsByTable, perched };
  }, [doc.placements]);

  /** Where each design item on a banquette is drawn: the items on one banquette spread evenly along
   *  it, in the order they were put there — the way a table's dressing clusters on its table. */
  const perchedSpots = useMemo(() => {
    const byBench = new Map<string, Placement[]>();
    for (const p of sorted.perched) {
      const k = `${p.perch!.stageId}|${p.perch!.itemId}`;
      byBench.set(k, [...(byBench.get(k) ?? []), p]);
    }
    const out: { p: Placement; at: Point }[] = [];
    for (const [k, list] of byBench) {
      const [stageId, itemId] = k.split("|");
      const stage = doc.placements.find((x) => x.id === stageId);
      const bench = stage?.stage ? benchInRoom(stage as StagePlacement, itemId, deckOf) : null;
      if (!bench) continue;
      const u = { x: Math.cos((bench.angle * Math.PI) / 180), y: Math.sin((bench.angle * Math.PI) / 180) };
      list.forEach((p, i) => {
        const f = (i + 0.5) / list.length - 0.5;
        out.push({ p, at: { x: bench.centre.x + u.x * f * bench.lengthMm, y: bench.centre.y + u.y * f * bench.lengthMm } });
      });
    }
    return out;
  }, [sorted.perched, doc.placements]);

  /** Which kind of floor thing a placement is, for the stacker — undefined for the two that are not
   *  on the floor at all. The same question `sorted` above answers, asked in the shape stacking.ts
   *  needs, so there is one definition of "a rug" on this screen and not two. */
  const classify = useCallback((p: Placement): StackKind | undefined => {
    const r = resolve(p.variantId);
    if (r?.anchor === "wall") return undefined; // a drape hangs on a wall
    // Overhead. It is not standing on the floor, so it is in no floor stack and nothing on the
    // floor can be in front of it — it draws in its own pass, last. Before this, a chandelier was
    // sorted among the rugs and tables and could be occluded by one.
    if (p.layer === "ceiling") return undefined;
    if (p.layer === "table" && p.tableId) return undefined; // a cloth or a chip belongs to a table
    if (p.perch) return undefined; // …and a candle on a banquette to the banquette
    return r?.sizing === "stretch" ? "carpet" : "item";
  }, []);

  // EVERYTHING ON THE FLOOR, BACK TO FRONT — rugs, tables and objects in one order, so that "bring
  // to front" can put a table over a rug or an object under a table. A plan nobody has restacked
  // comes out of here in exactly the order the three separate passes used to draw it in.
  const stack = useMemo(() => floorStack(doc, classify), [doc, classify]);

  /** The lookups the merged pass needs: a table or placement by id, without walking a list per entry. */
  const tableById = useMemo(() => new Map(doc.tables.map((t) => [t.id, t])), [doc.tables]);
  const placementById = useMemo(() => new Map(doc.placements.map((p) => [p.id, p])), [doc.placements]);

  // Everything with a free position of its own, boxed — the list a rubber-band catches from, the one
  // a group drag carries, and the one a drag aligns itself against. The two ANCHORED kinds are on
  // none of them: a cloth is its table's surface and a drape belongs to a wall, so neither has a
  // centre a shared delta could move.
  //
  // Each one is a BOX, not a point. Alignment only ever needed the centre, but equal-gap snapping
  // measures the air BETWEEN items, and edge snapping puts one item's edge against another's — and
  // air, like an edge, is a thing a centre cannot describe: a 2.44m table and a candlestick sitting
  // on the same centre line are nowhere near the same distance apart.
  //
  // `reach` is the one question that differs between the two lists below, asked once per plane.
  const boxesOn = useCallback(
    (reach: (p: Plane) => boolean) => {
      // Every box is the box the item TURNED occupies (rotatedExtent) — a 4×2 deck stood on end is
      // 2×4 of floor, and a rule about whether two things fit in one room cannot be measured off
      // the size the deck would have had if nobody had turned it.
      const out: { ref: SelectionRef; box: SnapBox; solid?: string }[] = reach("tables")
        ? doc.tables.map((t) => ({
            ref: { kind: "table" as const, id: t.id },
            box: { ...t.position, ...turnedExtent(tableFootprint(t), t.rotation ?? 0) },
            solid: "table",
          }))
        : [];
      const placed = [
        ...(reach("floor") ? sorted.carpets : []),
        ...sorted.items.filter((p) => reach(p.layer)),
        ...(reach("ceiling") ? sorted.ceiling : []),
      ];
      for (const p of placed) {
        out.push({
          ref: { kind: "placement", id: p.id },
          box: { ...p.position, ...placementExtent(p) },
          solid: solidKindOf(p),
        });
      }
      // The venue's own furniture is on the list too, which is what gives it everything the list is
      // for at once: a rubber-band catches it, a group drag carries it, and a table dragged past it
      // lines up on its edges. A bar you can move but cannot align to would be the worse half of the
      // feature — the reason to move it at all is usually to line it up with something. It stands on
      // the floor, so it answers to the floor plane.
      if (reach("floor")) {
        for (const f of structure.features) {
          out.push({
            ref: { kind: "feature", id: f.id },
            // Through its real shape, like everything else here: the venue's round bar is a
            // circle and a circle turned is the same circle.
            box: { x: f.x, y: f.y, ...turnedExtent(featureFootprint(f), f.rotationDeg ?? 0) },
            // The venue's own stage is a stage: a deck dropped on top of the house staging is the
            // same mistake as one dropped on another deck, and the crew cannot build either.
            solid: f.kind === "stage" || f.kind === "bar" || f.kind === "pool" ? f.kind : undefined,
          });
        }
      }
      return out;
    },
    [doc.tables, sorted, structure],
  );

  /** What the pointer may TAKE: a rubber-band's catch and a group drag's cargo. A hidden plane is
   *  not on it — a marquee must not sweep up what the designer cannot see — and neither is a plane
   *  that is visible but not the one being worked in, which is the whole of what activating one
   *  buys: lay the tables, switch to רצפה, and a band round three stages standing on top of them
   *  takes the three stages. */
  const movable = useMemo(
    () => boxesOn((p) => layerVisible[p] && isLive(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boxesOn, layerVisible, activeLayer, autoPlane],
  );

  /** What a drag LINES UP WITH — everything on screen, whether or not its plane is the live one.
   *  The two lists part company here on purpose: reaching a dimmed item and referring to one are
   *  different acts. A stage being pushed into place while the tables are held back still has to
   *  land square with the row of tables it is going in front of — you can see them, so lining up
   *  with them is the whole point. A HIDDEN plane is on neither list: an item nobody can see is not
   *  an alignment the designer could have meant. */
  const alignTo = useMemo(() => boxesOn((p) => layerVisible[p]), [boxesOn, layerVisible]);

  // ── The area tool ────────────────────────────────────────────────────────────────────────────
  // Corners so far, and where the next one would land. Local: nothing outside this canvas cares
  // about a half-drawn outline, and throwing it away is what Escape does.
  /** Where a template being placed would land — the pointer. */
  const [ghostAt, setGhostAt] = useState<Point | null>(null);
  /** Where the armed item would land — the pointer, snapped as a drop would be. Null off the plan. */
  const [armedAt, setArmedAt] = useState<Point | null>(null);
  const [areaPts, setAreaPts] = useState<Point[]>([]);
  const [areaCursor, setAreaCursor] = useState<Point | null>(null);
  /** A length being typed, in cm — "340" then Enter lays the next side 3.40m along the pointer. */
  const [areaTyped, setAreaTyped] = useState("");
  const areaCtx = useRef<CanvasLayerContext | null>(null);
  const finishArea = useCallback(
    (pts: Point[]) => {
      if (pts.length < 3) return;
      // A shape that is square to within a few degrees is MADE square — the closing side is the one
      // the designer never draws, and it is the one that comes out 2° off.
      const clean = squareUp(pts).filter((p, i, all) => {
        const q = all[(i + 1) % all.length];
        return Math.hypot(q.x - p.x, q.y - p.y) > 1;
      });
      if (clean.length < 3) return;
      if (selfIntersects(clean)) {
        onAreaRefused?.("הקווים חוצים זה את זה — סמנו את הפינות לפי הסדר, מסביב לבמה");
        return;
      }
      areaCtx.current?.endSnap();
      setAreaPts([]);
      setAreaCursor(null);
      setAreaTyped("");
      onArea(clean);
    },
    [onArea, onAreaRefused],
  );
  // Leaving the tool by any door (the button, a finished area, Escape) starts the next one clean —
  // adjusted during render when the prop flips, rather than in an effect a frame later.
  const [wasDrawing, setWasDrawing] = useState(drawArea);
  if (wasDrawing !== drawArea) {
    setWasDrawing(drawArea);
    if (!drawArea) {
      setAreaPts([]);
      setAreaCursor(null);
      setAreaTyped("");
    }
  }
  /** Where the next corner goes, from the pointer: the first corner snaps to walls and items like
   *  any drag; every later one is held to 45° steps from the FIRST side and whole 10cm
   *  (lib/studio/stage-draw.ts) — unless the snap found a wall or an item edge right on that line,
   *  in which case it ends exactly there. Alt draws freely. Near the first corner, it closes. */
  const nextCorner = (ctx: CanvasLayerContext, clientX: number, clientY: number, free: boolean, typedMm?: number): Point => {
    const raw = ctx.clientToMm(clientX, clientY);
    const snapped = ctx.snap(raw, { boxes: alignTo.map((m) => m.box) });
    const last = areaPts[areaPts.length - 1];
    if (!last) return { x: Math.round(snapped.x), y: Math.round(snapped.y) };
    const first = areaPts[0];
    if (!typedMm && areaPts.length >= 3 && Math.hypot(raw.x - first.x, raw.y - first.y) < ctx.mm(10)) return first;
    const ref = areaPts.length >= 2 ? (Math.atan2(areaPts[1].y - first.y, areaPts[1].x - first.x) * 180) / Math.PI : firstSideRef(first);
    const c = constrainNext(last, raw, ref, {
      free,
      typedMm,
      snapLength: areaLengthSnap ? (mm) => areaLengthSnap(mm, { magnetMm: ctx.mm(8), gridMm: 100 }) : undefined,
    });
    if (free || typedMm) return c;
    const len = Math.hypot(c.x - last.x, c.y - last.y) || 1;
    const u = { x: (c.x - last.x) / len, y: (c.y - last.y) / len };
    const moved = Math.hypot(snapped.x - raw.x, snapped.y - raw.y) > 0.5;
    const along = (snapped.x - last.x) * u.x + (snapped.y - last.y) * u.y;
    const off = Math.abs((snapped.x - last.x) * u.y - (snapped.y - last.y) * u.x);
    return moved && along > 0 && off < ctx.mm(10) ? { x: Math.round(last.x + u.x * along), y: Math.round(last.y + u.y * along) } : c;
  };
  /** What the FIRST side is squared to: the level's stage, or the wall nearest the first corner
   *  (its angle folded into a quarter turn — a wall at 93° squares a stage to 3°). */
  const firstSideRef = (first: Point): number => {
    if (areaRefDeg !== undefined) return areaRefDeg;
    const near = nearestWall(plan.structure, first);
    const seg = near ? wallSegment(plan.structure, near.wallId) : null;
    if (!seg || near!.distanceMm > 3000) return 0;
    const a = (Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180) / Math.PI;
    return ((a % 90) + 90) % 90;
  };
  const areaPointer = useRef<{ x: number; y: number; alt: boolean } | null>(null);
  // Taken in the CAPTURE phase and stopped there: the studio's own window listener would otherwise
  // read the same Backspace as "delete the selection" and Escape as "deselect".
  useEffect(() => {
    if (!drawArea) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9.]$/.test(e.key) && areaPts.length > 0) {
        setAreaTyped((t) => (t.length < 6 ? t + e.key : t));
      } else if (e.key === "Enter") {
        const cm = parseFloat(areaTyped);
        const at = areaPointer.current;
        if (areaTyped && cm > 0 && at && areaCtx.current) {
          const p = nextCorner(areaCtx.current, at.x, at.y, at.alt, cm * 10);
          setAreaPts((cur) => [...cur, p]);
          setAreaTyped("");
        } else finishArea(areaPts);
      } else if (e.key === "Escape") {
        if (areaTyped) setAreaTyped("");
        else {
          areaCtx.current?.endSnap();
          onCancelArea();
        }
      } else if (e.key === "Backspace" || e.key === "Delete") {
        if (areaTyped) setAreaTyped((t) => t.slice(0, -1));
        else setAreaPts((p) => p.slice(0, -1));
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // nextCorner reads areaPts, which is in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawArea, areaPts, areaTyped, finishArea, onCancelArea]);

  /** What the tape can pick up whole — everything on a visible plane that has a place of its own on
   *  the floor, as the outline it is drawn with (./plan-geometry.ts). A drape is on it though it is
   *  in no drag list: "how far is the candle table from the curtain" is exactly what gets measured. */
  const measureTargets = useMemo<MeasureTarget[]>(() => {
    // Bottom to top, the way they are drawn — the tape takes the TOPMOST outline under the click, so
    // a table standing on a rug is the table, and a rug is only picked where nothing stands on it.
    const carpetIds = new Set(sorted.carpets.map((p) => p.id));
    const rank = (r: SelectionRef) => (r.kind === "feature" ? 0 : r.kind === "placement" && carpetIds.has(r.id) ? 1 : r.kind === "table" ? 2 : 3);
    const refs = [
      ...alignTo.map((m) => m.ref).sort((a, b) => rank(a) - rank(b)),
      ...(layerVisible.ceiling ? sorted.drapes.map((p) => ({ kind: "placement" as const, id: p.id })) : []),
    ];
    const out: MeasureTarget[] = [];
    for (const ref of refs) {
      const g = itemGeometry(doc, structure, plan.structure, ref);
      if (g) out.push({ id: `${ref.kind}:${ref.id}`, polys: g.polysAt(g.centre) });
    }
    return out;
  }, [alignTo, layerVisible.ceiling, sorted.drapes, sorted.carpets, doc, structure, plan.structure]);

  /** The selection's own boxes, for the centre-line guides — one crosshair per selected thing. */
  const guideItems = useMemo(
    () =>
      selection
        .map((ref) => itemGeometry(doc, structure, plan.structure, ref))
        .filter((g): g is NonNullable<typeof g> => !!g)
        .map((g) => polysBox(g.polysAt(g.centre))),
    [selection, doc, structure, plan.structure],
  );

  /** Whose safety distance each breach broke — the item wearing the rule, which is the one whose halo
   *  turns to the warning ink. Both, when they asked for the same. */
  const brokenKeys = useMemo(() => {
    const byKey = new Map(clearance.subjects.map((s) => [s.key, s]));
    const out = new Set<string>();
    for (const i of clearance.issues) {
      if ((byKey.get(i.a)?.clearanceMm ?? 0) >= i.required) out.add(i.a);
      if ((byKey.get(i.b)?.clearanceMm ?? 0) >= i.required) out.add(i.b);
    }
    return out;
  }, [clearance]);

  /** The one selected thing's resize handles, when its catalog row lets it be stretched. One
   *  selection only: several things of different sizes have no one edge to pull. */
  const resizing = useMemo(() => {
    if (selection.length !== 1) return null;
    const ref = selection[0];
    if (ref.kind === "table") {
      const t = doc.tables.find((x) => x.id === ref.id);
      const product = t?.variantId ? resolve(t.variantId)?.product : undefined;
      const axes = product ? resizeAxes(product) : null;
      if (!t || !product || !axes || t.groupId) return null;
      const clamp = (s: { widthMm: number; depthMm: number }) => clampSize(product, s);
      return { ref, axes, clamp, centre: t.position, rotation: t.rotation || 0, size: t.sizeMm ?? catalogBox(product) };
    }
    if (ref.kind !== "placement") return null;
    const p = doc.placements.find((x) => x.id === ref.id);
    // A STAGE that is a rectangle stretches like any resizable item, in whole modules of the decks it
    // is built from — so a pull from its front grows it by a row of decks, not by 37cm. An L or a T
    // has no box to pull; it is re-drawn in the area tool instead.
    if (p?.stage) {
      const size = stageRect(p.stage);
      if (!size || p.groupId) return null;
      const pullTo = lengthSnapper(stageDeckTypes(p.stage, deckOf));
      const snap = (mm: number, magnetMm: number) => Math.max(100, pullTo(mm, { magnetMm }));
      const clamp = (s: { widthMm: number; depthMm: number }, magnetMm = 0) => ({ widthMm: snap(s.widthMm, magnetMm), depthMm: snap(s.depthMm, magnetMm) });
      return { ref, axes: { width: true, depth: true, uniform: false }, clamp, centre: p.position, rotation: p.rotation || 0, size };
    }
    const r = p ? resolve(p.variantId) : undefined;
    // Not a stretch item (a carpet has corners of its own), nothing on a table, nothing on a wall.
    if (!p || !r || r.sizing === "stretch" || r.anchor !== "free" || p.tableId) return null;
    const axes = resizeAxes(r.product);
    if (!axes) return null;
    const product = r.product;
    const clamp = (s: { widthMm: number; depthMm: number }) => clampSize(product, s);
    return { ref, axes, clamp, centre: p.position, rotation: p.rotation || 0, size: p.sizeMm ?? catalogBox(product) };
  }, [selection, doc]);

  /** The one selected stage, for its edge items' grips and its bare stretches. */
  const edgingStage = useMemo(() => {
    if (selection.length !== 1 || selection[0].kind !== "placement") return null;
    const p = doc.placements.find((x) => x.id === selection[0].id);
    return p?.stage ? (p as StagePlacement) : null;
  }, [selection, doc]);
  const edgingGaps = useMemo(
    () =>
      edgingStage
        ? edgeGaps(edgingStage, deckOf, stageWallDistance?.(edgingStage.id) ?? ((q) => nearestWall(plan.structure, q)?.distanceMm ?? Infinity))
        : [],
    [edgingStage, plan.structure, stageWallDistance],
  );

  const shapingStage = useMemo(() => {
    if (selection.length !== 1 || selection[0].kind !== "placement") return null;
    const p = doc.placements.find((x) => x.id === selection[0].id);
    return p?.stage && !stageRect(p.stage) && !p.groupId ? (p as StagePlacement) : null;
  }, [selection, doc]);
  /** The stage as it stood when a drag of its corner or side began. */
  const shapingFrom = useRef<StagePlacement | null>(null);
  // Keyed on the deck list, which a reshape carries over untouched — not on the stage, which is a new
  // object every frame of a drag.
  const shapingDecks = shapingStage?.stage.decks;
  const shapingSnap = useMemo(() => {
    if (!shapingDecks) return null;
    const pullTo = lengthSnapper(stageDeckTypes({ outline: [], front: 0, decks: shapingDecks }, deckOf));
    return (mm: number, magnetMm: number) => pullTo(mm, { magnetMm });
  }, [shapingDecks]);

  const isSel = (kind: SelectionKind, id: string) => selection.some((r) => r.kind === kind && r.id === id);

  // A group of tables read as the ONE larger table the designer said it is: the box its members
  // occupy between them, the number they share, and the chairs that go round the outside of the lot.
  //
  // The BOX, not a true union of the outlines. Grouping is how a designer says "these four are one
  // table now", and what they have done to make that true is pushed them into a block — for which
  // the bounding box IS the union. Computing a real polygon union would buy fidelity for the
  // L-shaped arrangement nobody groups, at the cost of the one geometry routine in this app that
  // could go quietly wrong.
  const tableGroups = useMemo(() => {
    return (doc.groups ?? [])
      .map((g) => {
        const tables = doc.tables.filter((t) => t.groupId === g.id);
        if (tables.length === 0) return null; // a group of stages is not a table and carries no number
        const xs: number[] = [];
        const ys: number[] = [];
        for (const t of tables) {
          const b = footprintBounds(tableFootprint(t));
          for (const [sx, sy] of CORNERS) {
            // Through the table's own rotation, so a group holding a turned table is boxed round
            // where that table actually is rather than where its unrotated bounds would be.
            const c = fromLocalFrame({ x: (sx * b.w) / 2, y: (sy * b.h) / 2 }, t.position, t.rotation || 0);
            xs.push(c.x);
            ys.push(c.y);
          }
        }
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        return {
          id: g.id,
          number: g.number ?? Math.min(...tables.map((t) => t.number)),
          centre: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
          widthMm: maxX - minX,
          depthMm: maxY - minY,
          seats: groupSeats(doc, g.id),
          seated: groupSeated(doc, g.id),
          selected: tables.some((t) => isSel("table", t.id)),
        };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, selection]);

  // Every ring of chairs on the plan, in the frame it is drawn in. A grouped table's chairs belong
  // to the GROUP — the seam between two tables pushed together is not a place anyone sits, and the
  // seats it would have held move to the outside where they really are.
  const seating = useMemo(() => {
    // `forTable` is what lets the merged pass below draw a table's own chairs immediately under that
    // table, wherever in the stack it has been put. A GROUP's ring belongs to no single member, so it
    // keeps a pass of its own.
    const rings: { key: string; transform: string; seats: Seat[]; forTable: boolean }[] = [];
    for (const t of doc.tables) {
      if (t.groupId || !t.seats) continue;
      rings.push({
        key: t.id,
        // Flipped with its table: the chairs are drawn in the table's own frame, so a mirrored ח
        // seats the side it is actually open on.
        transform: `translate(${t.position.x} ${t.position.y})${t.rotation ? ` rotate(${t.rotation})` : ""}${t.mirrored ? ` ${MIRROR_TRANSFORM}` : ""}`,
        seats: seatsAround(tableFootprint(t), t.seats, undefined, tableBlockedSides(t)),
        forTable: true,
      });
    }
    for (const g of tableGroups) {
      if (!g.seats) continue;
      rings.push({
        key: g.id,
        transform: `translate(${g.centre.x} ${g.centre.y})`,
        seats: seatsAround({ kind: "rect", widthMm: g.widthMm, depthMm: g.depthMm }, g.seats),
        forTable: false,
      });
    }
    return rings;
  }, [doc.tables, tableGroups]);

  /** Each table's ring of chairs, by table id — the rings for GROUPS are drawn in their own pass,
   *  since a group's chairs belong to no single one of its members. */
  const seatRingByTable = useMemo(
    () => new Map(seating.filter((r) => r.forTable).map((r) => [r.key, r])),
    [seating],
  );
  /** Each group's ring of chairs, by group id… */
  const groupRingById = useMemo(
    () => new Map(seating.filter((r) => !r.forTable).map((r) => [r.key, r])),
    [seating],
  );
  /** …and the member it is drawn under: the group's lowest table in the floor stack, so the whole
   *  block stands on its chairs rather than the chairs standing on it. */
  const firstOfGroup = useMemo(() => {
    const out = new Map<string, string>();
    for (const entry of stack) {
      if (entry.ref.kind !== "table") continue;
      const g = tableById.get(entry.ref.id)?.groupId;
      if (g && !out.has(g)) out.set(g, entry.ref.id);
    }
    return out;
  }, [stack, tableById]);

  // One live group drag: every selected item's position, frozen the moment the gesture crosses the
  // threshold, so the whole group is re-derived each frame from one shared delta off fixed origins
  // rather than drifting from repeated relative nudges. Mirrors PlanCanvas's own group drag.
  //
  // `box` is the whole selection's own bounding box, frozen with the origins — and it is what makes
  // a group drag SNAP. The omission this used to carry ("no alignment pull while several things
  // move together") had the right reason and drew the wrong conclusion: snapping each MEMBER would
  // indeed shear the group apart, so nothing was snapped and a block of four stages could not be
  // put against a wall or in line with anything. Snapping the BOX cannot shear anything — it yields
  // one delta, every member takes it, and the arrangement inside the box is untouched.
  const groupDrag = useRef<{ start: Point; box: SnapBox; snapshot: { ref: SelectionRef; origin: Point }[] } | null>(null);

  /** THE NO-OVERLAP RULE, frozen for one gesture: the movers as they stood when it began, the
   *  obstacles they must stay out of, and the pairs that were already overlapping and are therefore
   *  none of this rule's business (lib/studio/collide.ts). Frozen because all three answers have to
   *  be the ones from the start of the drag: the movers are moving, and re-asking "what was already
   *  wrong here" against a position the drag itself just wrote would answer "everything".
   *
   *  Rebuilt per gesture, cleared in endDrag alongside groupDrag. Null when the thing being dragged
   *  is not solid at all — a rug, a centrepiece, a chandelier — which is most of a plan's decor and
   *  costs nothing at all to drag. */
  const solids = useRef<{
    /** Where the gesture began — the dragged item's centre, or the whole selection's. Every delta
     *  below is measured from HERE and not from the live position, which the drag itself is
     *  rewriting frame by frame. */
    origin: Point;
    movers: SolidBox[];
    obstacles: SolidBox[];
    ignore: ReturnType<typeof overlappingAtStart>;
  } | null>(null);

  /** Freeze the collision sets for whatever this gesture is about to move. `refs` is the mover set —
   *  one item, or a whole selection — and `origin` is what its position is measured against. */
  const asSolid = (e: { ref: SelectionRef; box: SnapBox; solid?: string }): SolidBox | null =>
    e.solid ? { ...e.box, solid: e.solid } : null;

  /** Everything solid on the plan except `exclude` — what a gesture must keep its cargo out of.
   *  Drawn from `alignTo`, not `movable`: a plane held back from the pointer is still furniture
   *  standing in the room, and dropping a deck into the house bar because the bar's plane happened
   *  to be dimmed would be the plan lying about the room. Only a HIDDEN plane is absent, and an item
   *  nobody can see is one nobody is arranging around. */
  const solidObstacles = (exclude: SelectionRef[]): SolidBox[] =>
    alignTo
      .filter((m) => !exclude.some((x) => sameRef(x, m.ref)))
      .map(asSolid)
      .filter((b): b is SolidBox => !!b);

  /** Where a freshly dropped item actually lands: where it was let go, moved off anything solid it
   *  would have been inside. The size and kind come from the rail's drag payload — `dataTransfer`
   *  cannot be read until the drop, which is the whole reason that payload exists. A fresh item has
   *  no history, so nothing is exempt: it may not land overlapping at all. */
  const clearedDrop = (p: Point, carried: CarriedItem | null = carriedItem()): Point => {
    if (!carried?.solid) return p;
    const box: SolidBox = { x: p.x, y: p.y, widthMm: carried.widthMm, depthMm: carried.depthMm, solid: carried.solid };
    const clear = pushApart([box], solidObstacles([]));
    return { x: p.x + clear.x, y: p.y + clear.y };
  };

  const beginSolids = (refs: SelectionRef[], origin: Point) => {
    const inSet = (r: SelectionRef) => refs.some((x) => sameRef(x, r));
    const movers = movable.filter((m) => inSet(m.ref)).map(asSolid).filter((b): b is SolidBox => !!b);
    const obstacles = movers.length ? solidObstacles(refs) : [];
    return { origin, movers, obstacles, ignore: overlappingAtStart(movers, obstacles) };
  };

  /** The delta that keeps this gesture's movers out of everything solid, given where the drag has
   *  taken them. Zero when nothing being dragged is solid, or nothing is in the way — which is the
   *  usual frame, and costs one empty loop. */
  const clearOf = (target: Point): Point => {
    const s = solids.current;
    if (!s || s.movers.length === 0) return { x: 0, y: 0 };
    const dx = target.x - s.origin.x;
    const dy = target.y - s.origin.y;
    return pushApart(
      s.movers.map((m) => ({ ...m, x: m.x + dx, y: m.y + dy })),
      s.obstacles,
      s.ignore,
    );
  };

  /** Everything a drag in progress is moving right now — the pressed item alone on a solo drag, or
   *  the whole snapshot on a group one. Set in moveFor below, the one place that dispatches a move
   *  and therefore knows which things it is about to move, and cleared in endDrag. Read by the floor
   *  pass: what is being dragged is painted LAST, over everything it crosses, so a table carried
   *  across a stage never vanishes under it on the way (see `lifted` below). Handed to the host when
   *  the gesture ends, so it can settle what landed on what (studio-screen's autoStack). */
  const draggingRefs = useRef<SelectionRef[]>([]);

  /** The move handler for one item: the group's shared delta when it is part of a live
   *  multi-selection, otherwise its own snapped move. */
  const moveFor = (ref: SelectionRef, ctx: CanvasLayerContext) => (p: Point) => {
    // The first frame of a gesture: from here on the planes the gesture cannot be about are held
    // back (see autoPlane) and what it carries is painted on top (see `lifted`). `solids` is set on
    // this same first frame below, so it is the marker.
    if (solids.current === null) {
      setGesturePlane(planeOf(ref));
      const cargo = selection.length > 1 && isSel(ref.kind, ref.id) ? selection : [ref];
      setLifted(cargo.map((r) => `${r.kind}:${r.id}`));
    }
    if (selection.length > 1 && isSel(ref.kind, ref.id)) {
      // The pressed item is selected and draggable, so it is on `movable` and this is never empty —
      // which is what lets the box below be taken without a guard.
      const picked = movable.filter((m) => isSel(m.ref.kind, m.ref.id));
      groupDrag.current ??= {
        start: p,
        box: unionBox(picked.map((m) => m.box)),
        snapshot: picked.map((m) => ({ ref: m.ref, origin: { x: m.box.x, y: m.box.y } })),
      };
      const { start, box, snapshot } = groupDrag.current;
      solids.current ??= beginSolids(snapshot.map((sn) => sn.ref), { x: box.x, y: box.y });
      draggingRefs.current = snapshot.map((sn) => sn.ref);
      // ONE BOX, SNAPPED ONCE, and the delta it comes back with is handed to every member. That is
      // what keeps the arrangement rigid: the guides light up for the block's own edges and centre —
      // four stages pushed together go against the wall as one deck — and no member is ever pulled
      // off the others. The rest of the selection is dropped from the references, or the block would
      // align to itself and never move at all.
      const moved = { x: box.x + (p.x - start.x), y: box.y + (p.y - start.y) };
      const snapped = ctx.snap(moved, {
        boxes: alignTo.filter((m) => !isSel(m.ref.kind, m.ref.id)).map((m) => m.box),
        self: { widthMm: box.widthMm, depthMm: box.depthMm },
      });
      // …and then out of anything solid it has been pushed into. The snap already offers flush; this
      // is what stops the drag going through it.
      const clear = clearOf(snapped);
      const dx = snapped.x - box.x + clear.x;
      const dy = snapped.y - box.y + clear.y;
      onMoveMany(
        snapshot.map((sn) => ({
          kind: sn.ref.kind,
          id: sn.ref.id,
          position: { x: Math.round(sn.origin.x + dx), y: Math.round(sn.origin.y + dy) },
        })),
      );
      return;
    }
    // Aligned against the walls (PlanCanvas's own references) and every OTHER item on the plan —
    // itself excluded, or it would align to where it already is and could never be pulled off. Its
    // own extent goes along too: that is what lets the gap either side of it be measured.
    const self = alignTo.find((m) => sameRef(m.ref, ref))?.box;
    const snapped = ctx.snap(p, {
      boxes: alignTo.filter((m) => !sameRef(m.ref, ref)).map((m) => m.box),
      self: self && { widthMm: self.widthMm, depthMm: self.depthMm },
    });
    // Two things cannot stand in the same place. The snap above has already offered the edge of
    // whatever is nearby; this is what stops the drag from carrying on THROUGH it and leaving one
    // deck on top of another — a plan the crew cannot build. Same-kind only, and an overlap that
    // was already there when the drag began is left alone (lib/studio/collide.ts).
    // `self` is this item's box as it stood when the gesture began: beginSolids runs on the first
    // move frame only (??=), before any of this drag's writes have landed.
    solids.current ??= beginSolids([ref], self ? { x: self.x, y: self.y } : snapped);
    const clear = clearOf(snapped);
    const at = { x: snapped.x + clear.x, y: snapped.y + clear.y };
    draggingRefs.current = [ref];

    if (ref.kind === "table") onMoveTable(ref.id, at);
    else if (ref.kind === "feature") onMoveFeature(ref.id, at);
    else onMovePlacement(ref.id, at);
  };

  const endDrag = (ctx: CanvasLayerContext) => () => {
    // Read BEFORE the reset: these are the things the gesture actually moved. The selection is not
    // the same list — something merely selected alongside a live drag was never moved by it.
    const moved = draggingRefs.current;
    groupDrag.current = null;
    solids.current = null;
    draggingRefs.current = [];
    setGesturePlane(null);
    setLifted([]);
    ctx.endSnap();
    onEndDrag(moved);
  };

  // One live rotate gesture: the pivot, where the sweep began, and every member's starting centre
  // and facing — frozen the moment the drag crosses the threshold, for exactly the reason the group
  // DRAG freezes its origins. Each frame re-derives the whole arrangement from one shared delta off
  // fixed origins; accumulating per-frame deltas instead drifts, and a set of tables that comes back
  // from a 360° sweep no longer square to the room it started square to is drift you cannot undo.
  const rotateGesture = useRef<{
    pivot: Point;
    startDeg: number;
    snapshot: { ref: SelectionRef; origin: Point; rotation: number }[];
  } | null>(null);

  /** Everything in the selection that HAS a facing — see the note where the handle is drawn. */
  const rotatableRefs = useMemo(
    () => selection.filter((r) => r.kind !== "placement" || movable.some((m) => sameRef(m.ref, r))),
    [selection, movable],
  );

  /** Where the handle goes, and what it says it will turn. Null when there is nothing coherent to
   *  turn — an empty selection, or one holding a cloth or a drape. */
  const rotatable = useMemo(() => {
    if (rotatableRefs.length === 0 || rotatableRefs.length !== selection.length) return null;
    const boxes = rotatableRefs
      .map((r) => movable.find((m) => sameRef(m.ref, r))?.box)
      .filter((b): b is SnapBox => !!b);
    if (boxes.length !== rotatableRefs.length) return null;
    const b = unionBox(boxes);
    // A lone item's handle rides round with the item, so it stays over the same corner of the thing
    // as it turns — which is what makes the knob feel attached to it. A group's stays north: the box
    // is axis-aligned and has no facing to ride, and a handle that jumped as the box re-fitted
    // itself each frame would be chasing the pointer rather than answering it.
    const only = rotatableRefs.length === 1 ? facingOf(rotatableRefs[0]) : 0;
    return {
      pivot: { x: b.x, y: b.y },
      reachMm: b.depthMm / 2,
      rotationDeg: only,
      count: rotatableRefs.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotatableRefs, selection, movable, doc, structure]);

  /** This ref's current facing, whatever kind of thing it is. */
  function facingOf(ref: SelectionRef): number {
    if (ref.kind === "table") return doc.tables.find((t) => t.id === ref.id)?.rotation ?? 0;
    if (ref.kind === "placement") return doc.placements.find((x) => x.id === ref.id)?.rotation ?? 0;
    return structure.features.find((f) => f.id === ref.id)?.rotationDeg ?? 0;
  }

  const rotateSelection = (deg: number, mods: { alt: boolean; raw: number }) => {
    if (!rotatable) return;
    // ONE item takes the handle's absolute bearing: dragging the knob to the top of the screen
    // points the stage up the room, which is the whole of what a designer means by turning one
    // thing. Nothing has to be frozen for that — the answer depends only on where the pointer is.
    if (rotatableRefs.length === 1) {
      const ref = rotatableRefs[0];
      onRotateMany([{ kind: ref.kind, id: ref.id, position: rotatable.pivot, rotation: deg }]);
      return;
    }
    // SEVERAL take the sweep instead — how far the pointer has travelled since the drag began —
    // because a group has no single bearing to set. The lock therefore goes on the DELTA (see the
    // note on RotateHandle's onRotate): a block already sitting at 7° turns by exactly 90° and is
    // still the block it was, rather than being sheared square to the grid the instant it is
    // touched.
    rotateGesture.current ??= {
      pivot: rotatable.pivot,
      startDeg: mods.raw,
      snapshot: rotatableRefs.map((ref) => {
        const box = movable.find((m) => sameRef(m.ref, ref))!.box;
        return { ref, origin: { x: box.x, y: box.y }, rotation: facingOf(ref) };
      }),
    };
    const { pivot, startDeg, snapshot } = rotateGesture.current;
    const delta = mods.alt ? mods.raw - startDeg : constrainAngleDeg(mods.raw - startDeg);
    onRotateMany(
      snapshot.map((sn) => {
        // EACH ABOUT ITSELF: the position is the one it started at, untouched. A room of tables
        // turned a quarter turn is a room of tables each facing a new way — not a room whose
        // tables have all been swept round the middle of the hall onto somebody else's spot.
        // Same delta, same one undo, and the only difference is whether anything moves.
        const moved = spin === "each" ? sn.origin : fromLocalFrame(toLocalFrame(sn.origin, pivot, 0), pivot, delta);
        return {
          kind: sn.ref.kind,
          id: sn.ref.id,
          position: { x: Math.round(moved.x), y: Math.round(moved.y) },
          rotation: sn.rotation + delta,
        };
      }),
    );
  };

  /** Press and click, with the group-preserving rules PlanCanvas settled on: shift toggles, a plain
   *  PRESS on something already in a multi-selection leaves the group alone (or the drag it is about
   *  to start would find a selection of one), and the CLICK that follows a press which never moved
   *  collapses back to just that item. */
  const pressFor = (ref: SelectionRef) => (additive: boolean) => {
    if (additive) return; // the click phase toggles — a shift-press must not toggle twice
    if (selection.length > 1 && isSel(ref.kind, ref.id)) return;
    onSelect(ref, false);
  };
  const clickFor = (ref: SelectionRef) => (additive: boolean) => onSelect(ref, additive);

  /** What a right-click on a node is about: the selection when the node is in it, else the node
   *  alone — selected on the spot, so the menu and the plan agree about what is being acted on.
   *  Held in a ref for the canvas's own contextmenu handler, which fires on the same event, before
   *  the selection it just changed has rendered. */
  const contextRefs = useRef<SelectionRef[] | null>(null);
  const contextFor = (ref: SelectionRef) => () => {
    if (isSel(ref.kind, ref.id)) contextRefs.current = selection;
    else {
      contextRefs.current = [ref];
      onSelect(ref, false);
    }
  };

  const nodeProps = (ref: SelectionRef, ctx: CanvasLayerContext, movableItem = true) => ({
    onPress: pressFor(ref),
    onClick: clickFor(ref),
    onContext: contextFor(ref),
    ...(movableItem ? { onMove: moveFor(ref, ctx), onEnd: endDrag(ctx) } : {}),
  });

  const liftedKeys = new Set(lifted);

  return (
    <PlanCanvas
      mode="edit"
      ariaLabel="סקיצת האירוע — שולחנות ופריטי עיצוב על תוכנית המתחם"
      outline={[]}
      edgeCurves={[]}
      selected={[]}
      onSelect={() => onSelect(null, false)}
      contextMenuItems={
        onContextMenu
          ? () => {
              const refs = contextRefs.current ?? selection;
              contextRefs.current = null;
              return refs.length ? onContextMenu(refs) : [];
            }
          : undefined
      }
      onAddVertex={() => {}}
      onCloseOutline={() => {}}
      onMoveVertex={() => {}}
      onMoveWallHandle={() => {}}
      graph={plan.structure}
      focus={focus}
      measureTargets={measureTargets}
      // The middle that matters is the event's — the zones it is held in, or the one the eye is on —
      // not the whole property's: a stage centred on the ballroom is what the designer is checking,
      // and the property's centre may be in the car park.
      centerGuides={{ plan: widthMm || heightMm ? { minX, minY, maxX, maxY } : null, items: guideItems }}
      toolbarExtras={
        <>
          <IconButton
            label={showClearance ? "הסתרת מרחקי ביטחון" : "הצגת מרחקי ביטחון"}
            onClick={onToggleClearance}
            pressed={showClearance}
            className={!showClearance && clearance.issues.length ? "text-warn-ink" : undefined}
          >
            <ShieldAlert className="h-4 w-4" strokeWidth={2} />
          </IconButton>
          <IconButton
            label={stageFillActive ? "סגירת מילוי הבמות · Esc" : "מילוי אזור בבמות — סימון האזור על התוכנית"}
            onClick={onStageFill}
            pressed={stageFillActive}
          >
            <Grid2x2Plus className="h-4 w-4" strokeWidth={2} />
          </IconButton>
        </>
      }
      // The box, not the hits: everything selectable on this surface is drawn by this file, so this
      // is the only place that could test it. Supplying it at all is also what stops a plain drag on
      // empty canvas from panning — the view moves with Space (or the middle button) and the wheel,
      // and a bare drag draws a selection box.
      onMarquee={(b, additive, mode) =>
        onSelectMany(
          movable
            // TOUCHED, not enclosed. The band takes everything it crosses, however little of it: a
            // row of forty tables is caught by a stroke across the row, without having to clear the
            // last chair of the last table. It used to demand the whole box inside the band — exact,
            // and exactly what nobody drawing a quick band wants — and the designer asked for this
            // instead. What the band swept up by accident is one Ctrl+band (or Ctrl+click) away from
            // being let go again, which is the other half of the same request.
            .filter(
              (m) =>
                m.box.x + m.box.widthMm / 2 >= b.minX &&
                m.box.x - m.box.widthMm / 2 <= b.maxX &&
                m.box.y + m.box.depthMm / 2 >= b.minY &&
                m.box.y - m.box.depthMm / 2 <= b.maxY,
            )
            .map((m) => m.ref),
          additive,
          mode,
        )
      }
      // The point is already snapped and the guide lines were already drawn under the incoming drag
      // — see PlanCanvas's dropSnap. An item off the rail lands in line with the row it is joining
      // and at the same gap that row already keeps, which is where the designer was about to drag it
      // to anyway. The size of the thing in flight comes from the rail (lib/studio/drag-payload):
      // a drop cannot ask dataTransfer what it is carrying until it has landed.
      onDropAt={(e, p) => {
        const productId = e.dataTransfer.getData("text/product");
        if (!productId) return;
        // A deck must not LAND on another deck either. The point arrives already snapped (the guides
        // were drawn under the incoming drag), so this only bites when the designer let go somewhere
        // that would have put one solid thing inside another — and it puts it against it instead.
        const at = clearedDrop(p);
        onDropProduct(productId, at.x, at.y);
      }}
      dropSnap={() => {
        const carried = carriedItem();
        return {
          boxes: alignTo.map((m) => m.box),
          self: carried ? { widthMm: carried.widthMm, depthMm: carried.depthMm } : undefined,
        };
      }}
      backdrop={(ctx) => {
        const { mm } = ctx;
        // The zoom, reported up during render the way the hall editor reports its own close radius.
        // The rail is a sibling of this canvas and has no other way to learn the scale it is
        // dragging at; a ref write costs nothing and nothing re-renders on it.
        onScale?.(mm(1));
        return (
          <>
            {/* Zones stay drawn whatever the eye is pointed at, held back rather than hidden: the
                designer needs to see what the חופה opens onto, and placing just outside a zone
                stays possible. Their NAMES are off — see ZoneRegions' `labels`. */}
            <g opacity={focusZoneId ? 0.2 : 0.45}>
              <ZoneRegions zones={otherZones} mm={mm} labels={false} />
            </g>
            <g opacity={focusZoneId ? 0.35 : 1}>
              <ZoneRegions zones={eventZones} mm={mm} labels={false} />
            </g>
            <ZoneRegions zones={focusedZones} mm={mm} labels={false} />
            {/* The venue's furniture, as this event has arranged it — and selectable, so it can be
                arranged. Deliberately WITHOUT onResize: an event may push the bar across the room,
                it may not decide the bar is four metres long. That is the property's fact and it is
                measured at /halls.
                It stands on the FLOOR, so it answers to the floor plane in both ways the plane can
                be asked: it dims and stops taking the pointer when another plane is being worked in,
                and the eye hides it along with everything else standing down there. Drawn but
                unselectable was the one state worth ruling out — `movable` gates it on both, and a
                thing on screen that nothing can pick up is a bug report waiting to be written. */}
            {layerVisible.floor && (
            <g {...layerAttrs("floor")}>
              <StructureFeatures
                structure={structure}
                mm={mm}
                selectedIds={selection.filter((r) => r.kind === "feature").map((r) => r.id)}
                onSelect={(id, additive) => onSelect({ kind: "feature", id }, additive)}
                onMove={(id, pos) => moveFor({ kind: "feature", id }, ctx)(pos)}
                onCommit={onEndDrag}
                clientToMm={ctx.clientToMm}
              />
            </g>
            )}
          </>
        );
      }}
      overlay={(ctx) => (
        <>
          <StructureDoors structure={plan.structure} />

          {/* SAFETY DISTANCES, under everything they belong to. A halo is the item's own outline
              grown by its rule (a round-joined stroke twice the distance wide, which is exactly the
              outline offset outward) — accent while the rule is kept, the warning ink once something
              is inside it. One group opacity each, so the fill and the stroke's inner half do not
              stack into a darker ring. */}
          <g className="pointer-events-none">
            {clearance.subjects.map((s) => {
              const broken = brokenKeys.has(s.key);
              if (s.clearanceMm <= 0 || (!showClearance && !broken)) return null;
              const colour = broken ? "var(--color-warn)" : "var(--color-accent)";
              return (
                <g key={`halo-${s.key}`} opacity={broken ? 0.2 : 0.09}>
                  {s.polys.map((poly, i) => (
                    <polygon
                      key={i}
                      points={poly.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={colour}
                      stroke={colour}
                      strokeWidth={s.clearanceMm * 2}
                      strokeLinejoin="round"
                    />
                  ))}
                </g>
              );
            })}
          </g>

          {/* ONE PASS OVER THE WHOLE FLOOR, back to front.

              Rugs, tables and free objects used to be three fixed passes in that order, and
              reordering was only possible inside each — which meant a "bring to front" could never
              put a table over a rug or a plinth under a table, i.e. could never fix any of the
              overlaps a designer actually has. `stack` is the single order now
              (lib/design-document/stacking.ts); with nothing restacked it comes out identical to
              the three passes it replaced.

              A table's own chairs are drawn as part of ITS entry, immediately under it: wherever
              the table has been put in the stack, the chairs it tucks under go with it. They never
              take a click meant for the table (pointer-events-none on the ring).

              THE PLANE ATTRS GO ON EACH ENTRY, not round the pass. A table and a stage are on two
              different planes now and in ONE stack — that is the whole point of the stack, that a
              designer can put a plinth under a table — so a <g> per plane would have to break the
              order to gather them, which is the one thing this pass exists not to do. Dimming a
              plane is an opacity per node instead of one over the group; overlapping items held
              back at 35% each read a shade darker where they cross, which is a fair price for
              keeping the z-order the designer set. */}
          {(liftedKeys.size
            ? [...stack.filter((e) => !liftedKeys.has(`${e.ref.kind}:${e.ref.id}`)), ...stack.filter((e) => liftedKeys.has(`${e.ref.kind}:${e.ref.id}`))]
            : stack
          ).map((entry) => {
            if (entry.ref.kind === "table") {
              if (!layerVisible.tables) return null;
              const t = tableById.get(entry.ref.id);
              if (!t) return null;
              const ring = seatRingByTable.get(t.id);
              // A GROUP's ring goes in under its FIRST member in the stack — under every table of the
              // block, the way a lone table's chairs tuck under its own edge. Drawn after the tables,
              // as it used to be, the chairs sat on top of the block.
              const groupRing = t.groupId && firstOfGroup.get(t.groupId) === t.id ? groupRingById.get(t.groupId) : undefined;
              return (
                <g key={`t-${t.id}`} {...layerAttrs("tables")}>
                  {groupRing && (
                    <g transform={groupRing.transform} className="pointer-events-none">
                      {groupRing.seats.map((seat, i) => (
                        <Chair key={i} seat={seat} />
                      ))}
                    </g>
                  )}
                  {ring && (
                    <g transform={ring.transform} className="pointer-events-none">
                      {ring.seats.map((seat, i) => (
                        <Chair key={i} seat={seat} />
                      ))}
                    </g>
                  )}
                  <TableNode
                    table={t}
                    selected={isSel("table", t.id)}
                    util={tableUtilization(doc, t)}
                    // The cloth IS the table's surface — a table wears one, so it is drawn as the
                    // table's own fill rather than as an object sitting on top of it, and is
                    // selected from the table's inspector. (catalog-resolver gives tablecloths zero
                    // footprint for the same reason: a cover consumes no room on the table it covers.)
                    cloth={sorted.coverByTable.get(t.id)}
                    // A grouped table draws no number of its own — its group draws the one they share.
                    showNumber={!t.groupId}
                    ctx={ctx}
                    drag={nodeProps({ kind: "table", id: t.id }, ctx)}
                    onNudge={(pos) => {
                      onMoveTable(t.id, pos);
                      onEndDrag();
                    }}
                  />
                </g>
              );
            }
            const p = placementById.get(entry.ref.id);
            const plane = entry.kind === "carpet" ? "floor" : p?.layer;
            if (!p || !plane || !layerVisible[plane]) return null;
            return entry.kind === "carpet" ? (
              <g key={`c-${p.id}`} {...layerAttrs(plane)}>
                <CarpetNode
                  placement={p}
                  selected={isSel("placement", p.id)}
                  ctx={ctx}
                  drag={nodeProps({ kind: "placement", id: p.id }, ctx)}
                  onResize={(sizeMm, position) => onResizePlacement(p.id, sizeMm, position)}
                  onEndResize={onEndDrag}
                />
              </g>
            ) : (
              <g key={`p-${p.id}`} {...layerAttrs(plane)}>
                <PlacementNode
                  placement={p}
                  x={p.position.x}
                  y={p.position.y}
                  selected={isSel("placement", p.id)}
                  ctx={ctx}
                  drag={nodeProps({ kind: "placement", id: p.id }, ctx)}
                  railing={p.stage ? stageRailings?.[p.id] : undefined}
                  gaps={edgingStage?.id === p.id ? edgingGaps : undefined}
                  activeItem={edgingStage?.id === p.id ? activeEdgeItem : undefined}
                />
              </g>
            );
          })}

          {/* The group, drawn once over its members: the outline that says where the one larger
              table ends, and the single number it carries instead of each table carrying its own.
              It traces tables, so it dims and hides with them rather than floating over them at
              full contrast. (The block's CHAIRS are drawn in the stack, under its first table.) */}
          {layerVisible.tables && tableGroups.map((g) => (
            <g key={`group-${g.id}`} className="pointer-events-none" {...layerAttrs("tables")}>
              {/* Only while the block is selected. At rest a block of tables reads as the one table it
                  is — a dashed box round it all evening ran straight through its own chairs. */}
              {g.selected && (
              <rect
                x={g.centre.x - g.widthMm / 2 - GROUP_PAD_MM}
                y={g.centre.y - g.depthMm / 2 - GROUP_PAD_MM}
                width={g.widthMm + GROUP_PAD_MM * 2}
                height={g.depthMm + GROUP_PAD_MM * 2}
                rx={GROUP_PAD_MM}
                fill="none"
                stroke={g.selected ? "var(--color-accent)" : "var(--color-ink-soft)"}
                strokeOpacity={g.selected ? 1 : 0.35}
                strokeWidth={g.selected ? 2 : 1}
                strokeDasharray="10 7"
                vectorEffect="non-scaling-stroke"
              />
              )}
              {g.number > 0 && (
                <text
                  x={g.centre.x}
                  y={g.centre.y + (g.seats > 0 ? GROUP_LABEL.number : 0)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={g.selected ? "var(--color-accent)" : "var(--color-muted)"}
                  style={{ fontSize: GROUP_NUMBER_MM, fontWeight: 700, ...HALO }}
                >
                  {g.number}
                </text>
              )}
              {/* One block, one occupancy — what its tables hold between them. Nobody seated at a
                  block of four thinks of themselves as being at the second table of it. */}
              {g.seats > 0 && (
                <CapacityLabel
                  x={g.centre.x}
                  y={g.centre.y + (g.number > 0 ? GROUP_LABEL.capacity : 0)}
                  seated={g.seated}
                  seats={g.seats}
                  size={GROUP_CAPACITY_MM}
                  baseInk={g.selected ? "var(--color-accent)" : "var(--color-muted)"}
                  halo
                />
              )}
            </g>
          ))}

          {/* Items ON a table — clustered on the table they belong to. Covers are excluded: they
              were drawn as the table itself just above. Gated on the TABLES plane as well as their
              own: a centrepiece hanging in the air where the table it stands on has been hidden is
              a thing to drag by accident, and says nothing true about the room. */}
          <g {...layerAttrs("table")}>
            {layerVisible.table &&
              layerVisible.tables &&
              doc.tables.map((t) => {
                const chips = sorted.chipsByTable.get(t.id) ?? [];
                return chips.map((p, i) => (
                  <PlacementNode
                    key={p.id}
                    placement={p}
                    x={t.position.x}
                    y={t.position.y + (i - (chips.length - 1) / 2) * 840}
                    selected={isSel("placement", p.id)}
                    ctx={ctx}
                    drag={nodeProps({ kind: "placement", id: p.id }, ctx, false)}
                  />
                ));
              })}
            {/* …and on a stage's banquettes, spread along each one. Not dragged — they belong to the
                banquette, as a centrepiece belongs to its table. */}
            {layerVisible.table &&
              perchedSpots.map(({ p, at }) => (
                <PlacementNode
                  key={p.id}
                  placement={p}
                  x={at.x}
                  y={at.y}
                  selected={isSel("placement", p.id)}
                  ctx={ctx}
                  drag={nodeProps({ kind: "placement", id: p.id }, ctx, false)}
                />
              ))}
          </g>

          {/* ONE rotate handle for whatever is selected, rather than a knob on every node. A table
              turned on its own and six turned together are the same gesture about a different
              pivot, and a handle per item would put six of them on screen for one selection —
              overlapping each other, each promising to turn only its own table.

              Not offered for a cloth or a drape: one is its table's surface (it turns when the
              table does) and the other is pinned to a wall by both its ends, so neither has a
              facing of its own to spin. A selection holding one is a selection with nothing
              coherent to turn, so the handle stays away rather than turning half of it. */}
          {rotatable && (
            <RotateHandle
              pivot={rotatable.pivot}
              reachMm={rotatable.reachMm}
              rotationDeg={rotatable.rotationDeg}
              onRotate={(deg, mods) => rotateSelection(deg, mods)}
              onCommit={() => {
                rotateGesture.current = null;
                onEndDrag(rotatableRefs);
              }}
              clientToMm={ctx.clientToMm}
              mm={ctx.mm}
              // The label says which of the two gestures this handle is about to be, because they
              // look identical until the pointer moves and only one of them keeps everything where
              // it is.
              label={
                rotatable.count === 1
                  ? "סיבוב הפריט — גרירה · Alt לזווית חופשית"
                  : spin === "each"
                    ? `סיבוב ${rotatable.count} הפריטים, כל אחד סביב עצמו — גרירה · Alt לזווית חופשית`
                    : `סיבוב ${rotatable.count} הפריטים יחד סביב מרכז משותף — גרירה · Alt לזווית חופשית`
              }
            />
          )}

          {edgingStage && onEdgeItemSelect && onEdgeItemChange && (
            <EdgeItemHandles
              p={edgingStage}
              ctx={ctx}
              active={activeEdgeItem ?? null}
              onSelect={(itemId) => onEdgeItemSelect(edgingStage.id, itemId)}
              onChange={(item) => onEdgeItemChange(edgingStage.id, item)}
              onEnd={onEndDrag}
            />
          )}

          {shapingStage && onStageOutline && (
            <OutlineHandles
              outline={shapingStage.stage.outline}
              refDeg={0}
              toRoom={(q) => toRoom(shapingStage, q)}
              fromRoom={(q) => toStageFrame(shapingStage, q)}
              ctx={ctx}
              snap={shapingSnap ?? undefined}
              onBegin={() => {
                shapingFrom.current = shapingStage;
              }}
              onChange={(next) => {
                // Worked out against the stage as it stood when the drag BEGAN (the outline is in that
                // frame), then re-centred, so nothing else on it moves. Re-framing against the stage
                // as it is now — already re-centred by the last frame — walks it off under the pointer.
                const was = shapingFrom.current ?? shapingStage;
                const { stage, position } = reframeStage(was, next);
                onStageOutline(shapingStage.id, stage, position);
              }}
              onEnd={() => {
                shapingFrom.current = null;
                onEndDrag();
              }}
            />
          )}

          {resizing && (
            <ResizeHandles
              centre={resizing.centre}
              rotation={resizing.rotation}
              size={resizing.size}
              axes={resizing.axes}
              clamp={resizing.clamp}
              ctx={ctx}
              onResize={(size, centre) =>
                resizing.ref.kind === "table"
                  ? onResizeTable(resizing.ref.id, size, centre)
                  : onResizePlacement(resizing.ref.id, size, centre)
              }
              onEnd={onEndDrag}
            />
          )}

          {/* THE CEILING LAYER, one <g> for the whole of it — drapes and the overhead pass share it
              rather than each wearing its own dim/lock wrapper. */}
          <g {...layerAttrs("ceiling")}>
            {/* Drapes, over the wall they hang on — they are overhead (the ceiling layer), and a
                wall drawn on top of a curtain would read as the curtain being behind it. */}
            {layerVisible.ceiling &&
              sorted.drapes.map((p) => (
                <DrapeNode
                  key={p.id}
                  placement={p}
                  // The property's own walls, NOT the arranged copy: a curtain hangs on a wall, and
                  // no arrangement on this surface can move a wall. Reading the arranged structure
                  // here would be true but misleading about what a drape is anchored to.
                  structure={plan.structure}
                  selected={isSel("placement", p.id)}
                  ctx={ctx}
                  onSelect={(additive) => onSelect({ kind: "placement", id: p.id }, additive)}
                  onSpan={(span) => onSpanPlacement(p.id, span)}
                  onEndSpan={onEndDrag}
                />
              ))}

            {/* OVERHEAD, and therefore last. A chandelier is not standing on the floor: nothing down
                there can be in front of it, so it is drawn after everything, outside the floor stack.
                See lib/design-document/stacking.ts. */}
            {layerVisible.ceiling &&
              sorted.ceiling.map((p) => (
                <PlacementNode
                  key={p.id}
                  placement={p}
                  x={p.position.x}
                  y={p.position.y}
                  selected={isSel("placement", p.id)}
                  ctx={ctx}
                  drag={nodeProps({ kind: "placement", id: p.id }, ctx)}
                  overhead
                />
              ))}
          </g>

          {/* THE AREA TOOL. A pane over the whole plan while corners are being placed — every click
              is a corner, whatever it lands on, for the reason the tape has its own pane — then the
              outline so far and the rubber band to the pointer. Corners snap to the walls and to the
              other items like any drag does. */}
          {placeGhost && onPlaceStage && (
            <g>
              <rect
                x={-1e7}
                y={-1e7}
                width={2e7}
                height={2e7}
                fill="transparent"
                className="cursor-copy"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => setGhostAt(ctx.clientToMm(e.clientX, e.clientY))}
                onClick={(e) => {
                  e.stopPropagation();
                  const at = ctx.clientToMm(e.clientX, e.clientY);
                  onPlaceStage({ x: Math.round(at.x), y: Math.round(at.y) });
                }}
              />
              {ghostAt && (
                <polygon
                  className="pointer-events-none"
                  points={placeGhost.map((q) => `${q.x + ghostAt.x},${q.y + ghostAt.y}`).join(" ")}
                  fill="var(--color-accent)"
                  fillOpacity={0.12}
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          )}

          {armed && onPlaceArmed && !placeGhost && !drawArea && !stairPick && (
            <ArmedPane
              product={armed}
              ctx={ctx}
              at={armedAt}
              onAt={setArmedAt}
              doc={doc}
              structure={plan.structure}
              // The same pull a drop gets: in line with the row it is joining, at the gap that row
              // keeps.
              snapOptions={(item) => ({
                boxes: alignTo.map((m) => m.box),
                self: { widthMm: item.widthMm, depthMm: item.depthMm },
              })}
              clear={clearedDrop}
              onPlace={onPlaceArmed}
              onDisarm={onDisarm}
            />
          )}

          {drawArea &&
            (() => {
              areaCtx.current = ctx;
              const pts = areaCursor ? [...areaPts, areaCursor] : areaPts;
              const closeR = ctx.mm(10);
              const track = (e: React.PointerEvent | React.MouseEvent) => {
                areaPointer.current = { x: e.clientX, y: e.clientY, alt: e.altKey };
                return nextCorner(ctx, e.clientX, e.clientY, e.altKey);
              };
              // Every side's length, on a small pill beside its middle — the one number a designer
              // is drawing TO ("4 metres along the wall"), live on the side still being drawn.
              const font = ctx.mm(11);
              const labels = pts.slice(1).map((b, i) => {
                const a = pts[i];
                const L = Math.hypot(b.x - a.x, b.y - a.y);
                if (L < 1) return null;
                const live = i === pts.length - 2 && !!areaCursor;
                const text = live && areaTyped ? `${areaTyped} ס״מ` : `${(L / 1000).toFixed(2)} מ׳`;
                const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
                const at = { x: (a.x + b.x) / 2 + n.x * ctx.mm(14), y: (a.y + b.y) / 2 + n.y * ctx.mm(14) };
                const w = font * (text.length * 0.62 + 1.2);
                return (
                  <g key={i} className="pointer-events-none" transform={`translate(${at.x} ${at.y})`}>
                    <rect x={-w / 2} y={-font * 0.85} width={w} height={font * 1.7} rx={font * 0.85} fill={live ? "var(--color-accent)" : "var(--color-surface)"} stroke="var(--color-accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <text textAnchor="middle" dominantBaseline="central" fill={live ? "var(--color-canvas)" : "var(--color-ink)"} style={{ fontSize: font, fontWeight: 600 }} className="nums">
                      {text}
                    </text>
                  </g>
                );
              });
              return (
                <g>
                  <rect
                    x={-1e7}
                    y={-1e7}
                    width={2e7}
                    height={2e7}
                    fill="transparent"
                    className="cursor-crosshair"
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => setAreaCursor(track(e))}
                    onClick={(e) => {
                      e.stopPropagation();
                      const p = track(e);
                      const first = areaPts[0];
                      if (areaPts.length >= 3 && (e.detail >= 2 || (first && Math.hypot(p.x - first.x, p.y - first.y) < closeR))) {
                        finishArea(areaPts);
                        return;
                      }
                      setAreaTyped("");
                      setAreaPts((cur) => [...cur, p]);
                    }}
                  />
                  {pts.length >= 2 && (
                    <polygon
                      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="var(--color-accent)"
                      fillOpacity={pts.length >= 3 ? 0.08 : 0}
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none"
                    />
                  )}
                  {areaPts.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={i === 0 && areaPts.length >= 3 ? closeR : ctx.mm(4)}
                      fill={i === 0 && areaPts.length >= 3 ? "var(--color-accent-tint)" : "var(--color-canvas)"}
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none"
                    />
                  ))}
                  {labels}
                </g>
              );
            })()}

          {/* …and what it would lay: the area, and every deck in it, in the accent tint. The decks
              take no clicks — the bar at the bottom is where the layout is kept or thrown away — but
              the EDGES do: the solid one is the front the rows are laid from, and a click on any
              other moves the front there. */}
          {/* Placing a flight of stairs: every side it may stand against, as a fat hit line; a click
              reports the side and how far along it, and the screen decides whether it fits. */}
          {stairPick && onPickStair && (
            <g>
              {stairPick.map((e, i) => (
                <g key={i}>
                  <line
                    className="pointer-events-none"
                    x1={e.a.x}
                    y1={e.a.y}
                    x2={e.b.x}
                    y2={e.b.y}
                    stroke="var(--color-accent)"
                    strokeWidth={3}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={e.a.x}
                    y1={e.a.y}
                    x2={e.b.x}
                    y2={e.b.y}
                    stroke="transparent"
                    strokeWidth={18}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer"
                    style={{ pointerEvents: "stroke" }}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      const p = ctx.clientToMm(ev.clientX, ev.clientY);
                      const dx = e.b.x - e.a.x;
                      const dy = e.b.y - e.a.y;
                      const l2 = dx * dx + dy * dy || 1;
                      const t = Math.max(0, Math.min(1, ((p.x - e.a.x) * dx + (p.y - e.a.y) * dy) / l2));
                      onPickStair(e.level, e.edge, t);
                    }}
                  >
                    <title>להציב כאן מדרגות</title>
                  </line>
                </g>
              ))}
            </g>
          )}

          {areaPreview && (
            <g>
              <polygon
                className="pointer-events-none"
                points={areaPreview.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={2}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
              <g className="pointer-events-none">
                {areaPreview.decks.map((d, i) => (
                  <rect
                    key={i}
                    x={-d.widthMm / 2}
                    y={-d.depthMm / 2}
                    width={d.widthMm}
                    height={d.depthMm}
                    transform={`translate(${d.centre.x} ${d.centre.y}) rotate(${d.rotation})`}
                    fill="var(--color-accent-tint)"
                    fillOpacity={0.85}
                    stroke="var(--color-accent)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
              {areaPreview.polygon.map((a, i) => {
                const b = areaPreview.polygon[(i + 1) % areaPreview.polygon.length];
                const L = Math.hypot(b.x - a.x, b.y - a.y);
                if (L < 1) return null;
                const font = ctx.mm(11);
                const sgn = signedArea(areaPreview.polygon) >= 0 ? 1 : -1;
                const at = { x: (a.x + b.x) / 2 + ((sgn * (b.y - a.y)) / L) * font * 1.5, y: (a.y + b.y) / 2 + ((-sgn * (b.x - a.x)) / L) * font * 1.5 };
                return (
                  <text
                    key={`len-${i}`}
                    x={at.x}
                    y={at.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--color-accent)"
                    stroke="var(--color-canvas)"
                    strokeWidth={font * 0.35}
                    paintOrder="stroke"
                    style={{ fontSize: font, fontWeight: 600 }}
                    className="nums pointer-events-none"
                  >
                    {`${(L / 1000).toFixed(2)} מ׳`}
                  </text>
                );
              })}
              {areaPreview.polygon.map((a, i) => {
                const b = areaPreview.polygon[(i + 1) % areaPreview.polygon.length];
                const isFront = i === areaPreview.front;
                return (
                  <g key={i}>
                    {isFront && (
                      <line
                        className="pointer-events-none"
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="var(--color-accent)"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="transparent"
                      strokeWidth={16}
                      vectorEffect="non-scaling-stroke"
                      className={isFront ? undefined : "cursor-pointer"}
                      style={{ pointerEvents: "stroke" }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPickFront(i);
                      }}
                    >
                      <title>{isFront ? "חזית הבמה" : "לקבוע כחזית הבמה"}</title>
                    </line>
                  </g>
                );
              })}
              {onAreaReshape &&
                (() => {
                  const poly = areaPreview.polygon;
                  const fa = poly[areaPreview.front];
                  const fb = poly[(areaPreview.front + 1) % poly.length];
                  const refDeg = fa && fb ? (Math.atan2(fb.y - fa.y, fb.x - fa.x) * 180) / Math.PI : 0;
                  const same = (q: Point) => q;
                  return (
                    <OutlineHandles
                      outline={poly}
                      refDeg={refDeg}
                      toRoom={same}
                      fromRoom={same}
                      ctx={ctx}
                      snap={areaLengthSnap ? (mm, magnetMm) => areaLengthSnap(mm, { magnetMm }) : undefined}
                      onChange={(next) => onAreaReshape(next, areaPreview.front)}
                      onSplit={(i) => {
                        const r = splitSide(poly, areaPreview.front, i);
                        onAreaReshape(r.outline, r.front);
                      }}
                      onRemove={(k) => {
                        const r = removeVertex(poly, areaPreview.front, k);
                        if (r.outline.length >= 3 && !selfIntersects(r.outline)) onAreaReshape(r.outline, r.front);
                      }}
                    />
                  );
                })()}
            </g>
          )}

          {/* Every breach, on top of everything: a dashed line across the air that is too narrow,
              and how much there is against how much was asked for. Drawn whatever the halo toggle
              says — see showClearance. */}
          {clearance.issues.map((iss) => {
            const mid = { x: (iss.from.x + iss.to.x) / 2, y: (iss.from.y + iss.to.y) / 2 };
            return (
              <g key={`breach-${iss.a}-${iss.b}`} className="pointer-events-none">
                <line
                  x1={iss.from.x}
                  y1={iss.from.y}
                  x2={iss.to.x}
                  y2={iss.to.y}
                  stroke="var(--color-warn)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={iss.from.x} cy={iss.from.y} r={ctx.mm(3)} fill="var(--color-warn)" />
                <circle cx={iss.to.x} cy={iss.to.y} r={ctx.mm(3)} fill="var(--color-warn)" />
                <text
                  x={mid.x}
                  y={mid.y}
                  dy={-ctx.mm(8)}
                  textAnchor="middle"
                  fill="var(--color-warn-ink)"
                  style={{ fontSize: ctx.mm(11), fontWeight: 600, direction: "ltr", paintOrder: "stroke", stroke: "var(--color-surface)", strokeWidth: ctx.mm(3), strokeLinejoin: "round" }}
                  className="nums"
                >
                  {iss.distance < 1 ? "0" : (iss.distance / 1000).toFixed(2)} / {(iss.required / 1000).toFixed(2)} מ׳
                </text>
              </g>
            );
          })}
        </>
      )}
    />
  );
}

/** The colour a placed item is drawn in: the shade the designer picked, or the neutral surface for
 *  a product whose shades carry no colour (or that has none at all). */
function swatchOf(r: Resolved | undefined, fallback = "var(--color-surface)"): string {
  return r?.swatch ?? fallback;
}

// A drape hung on a wall (F: curtains). Drawn as a band lying along the wall's own line, thick
// enough to read at plan scale — a curtain is a surface you see, not a hairline. Selecting it puts
// a handle on each end; dragging one slides that end along the wall, which is the whole vocabulary
// this thing needs (its other dimension is the wall's, and its height is the product's).
const DRAPE_MM = 220; // drawn thickness of the band, in plan millimetres

function DrapeNode({
  placement,
  structure,
  selected,
  ctx,
  onSelect,
  onSpan,
  onEndSpan,
}: {
  placement: Placement;
  structure: VenueStructure;
  selected: boolean;
  ctx: CanvasLayerContext;
  onSelect: (additive: boolean) => void;
  onSpan: (span: WallSpan) => void;
  /** The end of one slide along the wall — the host closes its history entry here. */
  onEndSpan: () => void;
}) {
  // A drape whose wall was deleted at the venue draws nothing. It is not lost — it still lists and
  // prices, and the inspector offers it a new wall — but there is no honest place to put it here.
  const span = placement.span;
  const resolved = span ? resolveSpan(structure, span) : null;
  if (!span || !resolved) return null;

  const r = resolve(placement.variantId);
  const colour = swatchOf(r, "var(--color-accent-tint)");
  const { from, to } = resolved;

  const dragEnd = (which: "from" | "to") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      onSelect(false);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.buttons !== 1) return;
      const wall = wallSegment(structure, span.wallId);
      if (!wall) return;
      const t = pointToT(wall, ctx.clientToMm(e.clientX, e.clientY));
      onSpan(which === "from" ? { ...span, from: t } : { ...span, to: t });
    },
    onPointerUp: (e: React.PointerEvent) => {
      const el = e.currentTarget as Element;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      onEndSpan();
    },
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });

  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={colour}
        strokeWidth={DRAPE_MM}
        strokeLinecap="butt"
        opacity={0.9}
        tabIndex={0}
        role="button"
        aria-label={`${r?.label ?? "וילון"} — ${(resolved.lengthMm / 1000).toFixed(1)} מטר על הקיר`}
        className="cursor-pointer touch-none focus:outline-none"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(isAdditiveClick(e));
        }}
      />
      {/* The selection outline is a second stroke rather than a colour change: a drape's whole
          point is the colour it is, and highlighting must not repaint it. */}
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={selected ? "var(--color-accent)" : "var(--color-ink-soft)"}
        strokeWidth={selected ? 3 : 1}
        strokeOpacity={selected ? 1 : 0.5}
        vectorEffect="non-scaling-stroke"
        className="pointer-events-none"
      />
      {selected &&
        ([
          ["from", from],
          ["to", to],
        ] as const).map(([which, p]) => (
          <circle
            key={which}
            cx={p.x}
            cy={p.y}
            r={ctx.mm(7)}
            fill="var(--color-canvas)"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            tabIndex={0}
            role="slider"
            aria-label={which === "from" ? "תחילת הווילון על הקיר" : "סוף הווילון על הקיר"}
            aria-valuenow={Math.round((which === "from" ? span.from : span.to) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="cursor-ew-resize touch-none focus:outline-none"
            onKeyDown={(e) => {
              const step = (e.shiftKey ? 0.1 : 0.02) * (e.key === "ArrowLeft" ? -1 : 1);
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const at = which === "from" ? span.from : span.to;
              const next = Math.max(0, Math.min(1, at + step));
              onSpan(which === "from" ? { ...span, from: next } : { ...span, to: next });
              onEndSpan();
            }}
            {...dragEnd(which)}
          />
        ))}
    </g>
  );
}

// A carpet laid on the floor: a rectangle in its own colour, sized on the plan rather than in the
// catalog. Dragging a corner stretches it, keeping the opposite corner where it is — which is what
// grabbing a corner of a rug means, and why the resize reports a new centre alongside a new size.
function CarpetNode({
  placement,
  selected,
  ctx,
  drag,
  onResize,
  onEndResize,
}: {
  placement: Placement;
  selected: boolean;
  ctx: CanvasLayerContext;
  drag: DragProps;
  onResize: (sizeMm: { widthMm: number; depthMm: number }, position: Point) => void;
  onEndResize: () => void;
}) {
  const r = resolve(placement.variantId);
  const size = placement.sizeMm ?? fallbackSize(r);
  const { x, y } = placement.position;
  const halfW = size.widthMm / 2;
  const halfD = size.depthMm / 2;
  const rot = placement.rotation || 0;
  // Its shade, else the fill its catalog row was given in the appearance editor, else the neutral
  // inset — translucent by default, so whatever stands on the rug still reads through it.
  const style = resolveStyle(productStyle(r?.product), "screen", {
    fill: "var(--color-inset)",
    fillOpacity: 0.85,
    stroke: "var(--color-border)",
    strokeWidth: 1.5,
  });

  return (
    <g transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>
      <rect
        {...draggable(placement.position, ctx, drag)}
        x={x - halfW}
        y={y - halfD}
        width={size.widthMm}
        height={size.depthMm}
        rx={Math.min(size.widthMm, size.depthMm) * 0.03}
        fill={swatchOf(r, style.fill)}
        fillOpacity={style.fillOpacity}
        stroke={selected ? "var(--color-accent)" : style.stroke}
        strokeOpacity={selected ? 1 : style.strokeOpacity}
        strokeWidth={selected ? 3 : style.strokeWidth}
        strokeDasharray={style.dashArray.length ? style.dashArray.join(" ") : undefined}
        vectorEffect="non-scaling-stroke"
        tabIndex={0}
        role="button"
        aria-label={`${r?.label ?? "שטיח"} — ${(size.widthMm / 1000).toFixed(1)}×${(size.depthMm / 1000).toFixed(1)} מטר`}
        className="cursor-move touch-none focus:outline-none"
      />
      {selected &&
        CORNERS.map(([sx, sy]) => {
          const corner = { x: x + sx * halfW, y: y + sy * halfD };
          return (
            <rect
              key={`${sx},${sy}`}
              x={corner.x - ctx.mm(5)}
              y={corner.y - ctx.mm(5)}
              width={ctx.mm(10)}
              height={ctx.mm(10)}
              fill="var(--color-canvas)"
              stroke="var(--color-accent)"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
              className={(sx === sy ? "cursor-nwse-resize" : "cursor-nesw-resize") + " touch-none focus:outline-none"}
              tabIndex={0}
              role="button"
              aria-label="פינה — גרירה לשינוי הגודל"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
                drag.onPress(false);
              }}
              onPointerMove={(e) => {
                if (e.buttons !== 1) return;
                // Work in the carpet's own frame so a rotated one still stretches along its edges
                // rather than along the world axes.
                const world = ctx.clientToMm(e.clientX, e.clientY);
                const local = toLocalFrame(world, { x, y }, rot);
                const fixed = { x: -sx * halfW, y: -sy * halfD }; // the opposite corner, held still
                const widthMm = Math.max(MIN_CARPET_MM, Math.abs(local.x - fixed.x));
                const depthMm = Math.max(MIN_CARPET_MM, Math.abs(local.y - fixed.y));
                const centreLocal = { x: fixed.x + (sx * widthMm) / 2, y: fixed.y + (sy * depthMm) / 2 };
                onResize({ widthMm: Math.round(widthMm), depthMm: Math.round(depthMm) }, fromLocalFrame(centreLocal, { x, y }, rot));
              }}
              onPointerUp={(e) => {
                const el = e.currentTarget as Element;
                if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
                onEndResize();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          );
        })}
    </g>
  );
}

/** One chair, seen from above, drawn in the seat's own frame: after its rotation the +x axis points
 *  at the table, so the backrest goes at the far end and the seat runs in under the edge.
 *
 *  Two shapes, not one. A single rounded rectangle is a lozenge — it says "something is here" and
 *  nothing about which way it faces or what it is. The bar across the outer end is the backrest, and
 *  it is the whole difference between a ring of chairs and a ring of dots.
 *
 *  Sized in world millimetres, so chairs shrink with the plan like the tables they belong to; only
 *  the hairline holds a constant screen width, which is what keeps a room of 400 legible zoomed out. */
function Chair({ seat }: { seat: Seat }) {
  const halfD = CHAIR_D_MM / 2;
  const halfW = CHAIR_W_MM / 2;
  return (
    <g transform={`translate(${seat.x} ${seat.y}) rotate(${seat.facingDeg})`}>
      <rect
        x={-halfD}
        y={-halfW}
        width={CHAIR_D_MM}
        height={CHAIR_W_MM}
        rx={95}
        fill="var(--color-tray)"
        stroke="var(--color-muted)"
        strokeOpacity={0.4}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={-halfD}
        y={-halfW}
        width={CHAIR_BACK_MM}
        height={CHAIR_W_MM}
        rx={CHAIR_BACK_MM / 2}
        fill="var(--color-muted)"
        fillOpacity={0.5}
      />
    </g>
  );
}

/** How far a group's dashed outline stands off the tables inside it. */
const GROUP_PAD_MM = 260;

// Type sizes, in plan millimetres — fixed rather than scaled to the table, so that every number in
// the room is the same size and the plan can be read at a glance instead of table by table.
const TABLE_NUMBER_MM = 520;
const TABLE_CAPACITY_MM = 300;
const GROUP_NUMBER_MM = 640;
const GROUP_CAPACITY_MM = 340;

/** Where the two lines of a table's label sit: the NUMBER over the CAPACITY, centred together on
 *  the middle of the table.
 *
 *  As one label, not as a number at dead centre with a second line hung off the bottom of it. Hung,
 *  the pair reads bottom-heavy — and on anything shallow (a block of two 180×120s is only 1200 deep)
 *  the capacity ends up sitting on the table's own edge. Centring the PAIR keeps the promise the
 *  number was given when it moved to the middle: one label, in one place, on every shape.
 *
 *  0.78em is about the height of a line of digits, which is what has to be centred — not the em box,
 *  most of which is the descender space digits never use. */
const LINE = 0.78;
const labelStack = (numberSize: number, capacitySize: number) => ({
  number: -(capacitySize * LINE) / 2,
  capacity: (numberSize * LINE) / 2,
});
const TABLE_LABEL = labelStack(TABLE_NUMBER_MM, TABLE_CAPACITY_MM);
const GROUP_LABEL = labelStack(GROUP_NUMBER_MM, GROUP_CAPACITY_MM);

/** A knocked-out ring of the table's own surface colour, drawn UNDER the glyphs (paint-order) so a
 *  line running behind the text stops at it.
 *
 *  A block's label is centred on the block, and the centre of a block is exactly where the two
 *  tables meet — so the one place the number is guaranteed to land is on top of a seam. Cartography
 *  has solved this for a century: halo the type, don't move it. Only the group needs it; a lone
 *  table has nothing drawn through its middle but a centrepiece the designer put there. */
const HALO = {
  paintOrder: "stroke" as const,
  stroke: "var(--color-surface)",
  strokeWidth: 70,
  strokeLinejoin: "round" as const,
};

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;
const MIN_CARPET_MM = 300; // a rug you can still grab a corner of

/** What KIND of solid thing a placement is, for the no-overlap rule — or undefined for anything the
 *  rule must not touch (lib/studio/collide.ts explains why it is same-kind-only).
 *
 *  Three exemptions, each of them a real arrangement: a RUG is laid under things, so it overlaps
 *  everything by definition; anything on a table or hanging from the ceiling is not standing on the
 *  floor at all; and a drape belongs to a wall. Everything else that stands on the floor is solid
 *  against others OF ITS OWN CATEGORY — deck against deck, bar against bar — and free to overlap
 *  anything else, which is what keeps a חופה on a stage and a plinth beside a table possible.
 *
 *  The catalog answers the KIND (solidKind, lib/studio/catalog-resolver.ts, which is also what the
 *  rail's drag payload asks); this adds the two things only a PLACEMENT knows — that it has been
 *  put on a table or hung on a wall, and is therefore not standing on the floor whatever its
 *  category says. */
function solidKindOf(p: Placement): string | undefined {
  if (p.tableId || p.span) return undefined;
  return resolve(p.variantId)?.solid;
}

/** The one box a set of boxes sits inside. What a group drag snaps as, and what a group rotate
 *  turns about — the selection's own extent, axis-aligned, which is the only shape a multi-selection
 *  of a round table and a 4×2 stage has in common. */
function unionBox(boxes: SnapBox[]): SnapBox {
  const minX = Math.min(...boxes.map((b) => b.x - b.widthMm / 2));
  const maxX = Math.max(...boxes.map((b) => b.x + b.widthMm / 2));
  const minY = Math.min(...boxes.map((b) => b.y - b.depthMm / 2));
  const maxY = Math.max(...boxes.map((b) => b.y + b.depthMm / 2));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, widthMm: maxX - minX, depthMm: maxY - minY };
}

/** The axis-aligned room a shape takes up once it has been TURNED — what every box on this canvas
 *  is measured with.
 *
 *  A ROUND SHAPE IS THE EXCEPTION AND IT MATTERS: a circle turned is the same circle, so its box
 *  must not grow. It would have, by 41% at 45°, and round tables carry an angle all the time — a
 *  group rotate writes one onto every member — so a hall of 1.80m rounds would each have started
 *  claiming 2.55m of floor for snapping and for the no-overlap rule. Everything else is measured as
 *  the rectangle enclosing it, which is exact at a right angle and generous in between. */
function turnedExtent(footprint: Footprint, rotationDeg: number, scale = 1): { widthMm: number; depthMm: number } {
  const b = footprintBounds(footprint);
  const w = b.w * scale;
  const d = b.h * scale;
  return footprint.kind === "circle" ? { widthMm: w, depthMm: d } : rotatedExtent(w, d, rotationDeg);
}

/** How much room a placed item takes on the plan — its drawn footprint at whatever scale and angle
 *  it was given. A carpet answers with the size it was stretched to rather than the catalog's,
 *  because that is the rectangle actually lying on the floor. */
function placementExtent(p: Placement): { widthMm: number; depthMm: number } {
  const r = resolve(p.variantId);
  const turn = p.rotation ?? 0;
  if (r?.sizing === "stretch") {
    const s = p.sizeMm ?? fallbackSize(r);
    return rotatedExtent(s.widthMm, s.depthMm, turn);
  }
  return turnedExtent(placementFootprint(p), turn, p.scale || 1);
}

/** The size a stretch item gets before anyone has stretched it: whatever the catalog footprint
 *  says, so a freshly dropped carpet is a real rectangle rather than a point. */
function fallbackSize(r: Resolved | undefined): { widthMm: number; depthMm: number } {
  const b = r ? footprintBounds(resolveFootprint(r.product)) : null;
  return { widthMm: b?.w || 2000, depthMm: b?.h || 1400 };
}

/** What one selectable, usually draggable thing on this canvas needs from the host — built once per
 *  node per render by CanvasStage's `nodeProps`, which is where the group rules live. `onMove` and
 *  `onEnd` are absent for the anchored kinds (a cloth's chips follow their table). */
export interface DragProps {
  /** The pointer went down on this item. Selection happens HERE, not on release, so what you are
   *  about to drag is already lit. */
  onPress: (additive: boolean) => void;
  /** A press that never became a drag — the only signal for "this was a click". */
  onClick: (additive: boolean) => void;
  /** A right-click. The canvas's own handler opens the menu on the same event; this says what for. */
  onContext?: () => void;
  onMove?: (p: Point) => void;
  onEnd?: () => void;
}

// Where each live drag started, keyed by pointerId. Module scope rather than a closure: the first
// onMove re-renders the host, which rebuilds these handlers mid-gesture, so the origin has to
// outlive that. Same shape and same 4px threshold as venue-plan.tsx's feature drag — a click that
// drifts a pixel under the finger must select, not nudge.
const dragOrigin = new Map<number, { cx: number; cy: number; ox: number; oy: number; moved: boolean }>();
const DRAG_THRESHOLD_PX = 4;
// Set when a gesture crossed the threshold, so the click that always follows its pointerup can skip
// the selection logic. Without it, dragging a group would re-fire "select just me" the instant the
// drag ended, undoing the very group the drag just moved. Not pointerId-keyed — one drag-then-click
// sequence is in flight at a time, the same assumption PlanCanvas's own handlers make.
let suppressNextClick = false;

function draggable(at: Point, ctx: CanvasLayerContext, h: DragProps) {
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (dragOrigin.get(e.pointerId)?.moved) {
      suppressNextClick = true;
      h.onEnd?.();
    }
    dragOrigin.delete(e.pointerId);
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      dragOrigin.set(e.pointerId, { cx: e.clientX, cy: e.clientY, ox: at.x, oy: at.y, moved: false });
      h.onPress(isAdditiveClick(e));
    },
    onPointerMove: (e: React.PointerEvent) => {
      const origin = dragOrigin.get(e.pointerId);
      if (!origin || !h.onMove || e.buttons !== 1) return;
      if (!origin.moved) {
        if (Math.hypot(e.clientX - origin.cx, e.clientY - origin.cy) < DRAG_THRESHOLD_PX) return;
        origin.moved = true;
      }
      // Off the gesture's own origin each frame, not off the last position — repeated relative
      // nudges drift, and the grab point would slide out from under the pointer.
      const from = ctx.clientToMm(origin.cx, origin.cy);
      const to = ctx.clientToMm(e.clientX, e.clientY);
      h.onMove({ x: Math.round(origin.ox + to.x - from.x), y: Math.round(origin.oy + to.y - from.y) });
    },
    onPointerUp: end,
    onPointerCancel: end,
    // Not stopped: the canvas's own contextmenu handler is what opens the menu.
    onContextMenu: () => h.onContext?.(),
    // Always stopped: a click that reached the canvas would be read as "empty canvas" and clear the
    // selection the press just made.
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      h.onClick(isAdditiveClick(e));
    },
  };
}

function TableNode({
  table,
  selected,
  util,
  cloth,
  showNumber,
  ctx,
  drag,
  onNudge,
}: {
  table: DesignTable;
  selected: boolean;
  util: number;
  /** The cover this table wears, if any — drawn as the table's own fill. */
  cloth?: Placement;
  /** False for a table inside a group: the group draws the one number they share. */
  showNumber: boolean;
  ctx: CanvasLayerContext;
  drag: DragProps;
  /** An arrow-key step. Discrete, so it closes its own history entry immediately. */
  onNudge: (pos: Point) => void;
}) {
  const overflow = util > 1;
  const clothColour = cloth ? (resolve(cloth.variantId)?.swatch ?? "var(--color-accent-tint)") : undefined;
  // The catalog row's look (its appearance editor) is the table's base, and the table's own style —
  // set in the inspector — overrides it key by key (productStyle); selection and the overflow
  // warning are functional states that must stay legible regardless, so they still override
  // stroke/fill on top of that (mirrors the hall editor's fixtures, whose selection works the same way).
  const style = resolveStyle(productStyle(table.variantId ? resolve(table.variantId)?.product : undefined, table.style), "screen", {
    fill: "var(--color-surface)",
    stroke: "var(--color-ink)",
    strokeWidth: 2.5,
  });
  const shape = {
    // A dressed table shows its cloth. The overflow warning still wins over it: that one is a
    // problem to notice, not a colour choice, and it has to stay legible whatever is on the table.
    fill: overflow ? "var(--color-warn-tint)" : (clothColour ?? style.fill),
    fillOpacity: overflow || !clothColour ? style.fillOpacity : 1,
    stroke: selected ? "var(--color-accent)" : overflow ? "var(--color-warn)" : style.stroke,
    strokeWidth: selected ? 4 : style.strokeWidth,
    strokeDasharray: style.dashArray.length ? style.dashArray.join(" ") : undefined,
    vectorEffect: "non-scaling-stroke" as const,
  };
  const footprint = tableFootprint(table);
  const labelAt = labelAnchor(footprint);
  const upright = uprightTransform(table.rotation, table.mirrored);
  const seats = table.seats ?? 0;
  // The number has to stay readable on whatever colour the cloth is, so it goes dark on a light
  // cloth and light on a dark one rather than trusting one fixed grey.
  const numberInk = selected
    ? "var(--color-accent)"
    : clothColour && isDark(clothColour)
      ? "var(--color-canvas)"
      : "var(--color-muted)";

  return (
    <g
      {...draggable(table.position, ctx, drag)}
      transform={`translate(${table.position.x} ${table.position.y})${table.rotation ? ` rotate(${table.rotation})` : ""}${table.mirrored ? ` ${MIRROR_TRANSFORM}` : ""}`}
      tabIndex={0}
      role="button"
      aria-label={`שולחן ${table.number || ""}${seats > 0 ? ` — ${table.seated ?? 0} מתוך ${seats} מקומות` : ""} — גרירה להזזה`}
      className="cursor-move touch-none focus:outline-none"
      onKeyDown={(e) => {
        const step = e.shiftKey ? 500 : 100;
        if (e.key === "ArrowLeft") onNudge({ x: table.position.x - step, y: table.position.y });
        else if (e.key === "ArrowRight") onNudge({ x: table.position.x + step, y: table.position.y });
        else if (e.key === "ArrowUp") onNudge({ x: table.position.x, y: table.position.y - step });
        else if (e.key === "ArrowDown") onNudge({ x: table.position.x, y: table.position.y + step });
        else return;
        e.preventDefault();
      }}
    >
      <FootprintShape footprint={footprint} {...shape} />
      {/* The label rides the table's POSITION and not its angle. Turning a table turns the table:
          the number is not printed on the cloth, it is how a crew and a client find one table in a
          room of forty, and a 6 that comes out as a 9 at 180° is worse than one that is merely hard
          to read. The counter-turn is about the label's own point — the shape's visual centre
          (labelAnchor): (0,0) on a rectangle or a round, but the middle of the band on an arc, whose
          box centre is in the air the ring curves round — which the parent <g> has already carried
          into place with the table, so the pair sits ON the table at every angle and only stops
          leaning. The chairs are NOT counter-turned: a chair is a thing in the room and it faces the
          edge it is pulled up to. Same split the printed map already makes, where the numbers are
          drawn outside the rotated group (app/(app)/outputs/placement-map.tsx). */}
      <g transform={`translate(${labelAt.x} ${labelAt.y})${upright ? ` ${upright}` : ""}`}>
        {showNumber && table.number > 0 && (
          <text
            x={0}
            // Centred on every shape. A round table used to carry its number up near the top edge, out
            // of the way of whatever stands in the middle of it — but the number is how the crew finds
            // the table, and having it in one place on a round and another on a rectangle means
            // reading the plan twice. A centrepiece drawn over it is the lesser problem.
            //
            // It lifts by half a line when a capacity hangs under it, so that the PAIR is what sits in
            // the middle. Alone, it is still dead centre.
            y={seats > 0 ? TABLE_LABEL.number : 0}
            textAnchor="middle"
            dominantBaseline="central"
            fill={numberInk}
            style={{ fontSize: TABLE_NUMBER_MM, fontWeight: 600 }}
            className="pointer-events-none"
          >
            {table.number}
          </text>
        )}
        {/* Under the number, and dead centre in its place on a head table, which has seats but no
            number. A table inside a group draws neither — the group draws the one of each they
            share (showNumber). */}
        {showNumber && seats > 0 && (
          <CapacityLabel
            x={0}
            y={table.number > 0 ? TABLE_LABEL.capacity : 0}
            seated={table.seated ?? 0}
            seats={seats}
            size={TABLE_CAPACITY_MM}
            baseInk={numberInk}
            // On a dark cloth the alert and success inks are both unreadable, and a capacity nobody
            // can read reports nothing at all. Legibility wins; the inspector still says which it is.
            semantic={!(clothColour && isDark(clothColour))}
          />
        )}
      </g>
    </g>
  );
}

/** `4/12` — how many of a table's chairs are spoken for, out of how many it has.
 *
 *  Written LEFT TO RIGHT explicitly. This page is RTL, and in an RTL paragraph the slash between two
 *  numbers is a neutral character that takes the paragraph's direction: `0/12` comes out reading
 *  `12/0`, which is not a typographic nuisance but a different and wrong fact. Same reason
 *  TimeField's columns are the app's other deliberate LTR island.
 *
 *  Colour carries the only two states worth interrupting for: full, and over. Everything between
 *  takes the number's own ink, because a table that is half laid is not news. */
function CapacityLabel({
  x,
  y,
  seated,
  seats,
  size,
  baseInk,
  semantic = true,
  halo = false,
}: {
  x: number;
  y: number;
  seated: number;
  seats: number;
  size: number;
  baseInk: string;
  semantic?: boolean;
  /** Knock the table surface out from around the glyphs — see HALO. */
  halo?: boolean;
}) {
  const ink =
    !semantic || seated < seats
      ? baseInk
      : seated > seats
        ? "var(--color-alert-ink)"
        : "var(--color-success-ink)";
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill={ink}
      style={{ fontSize: size, fontWeight: 600, direction: "ltr", ...(halo ? HALO : {}) }}
      className="pointer-events-none nums"
    >
      {`${seated}/${seats}`}
    </text>
  );
}

function PlacementNode({
  placement,
  x,
  y,
  selected,
  ctx,
  drag,
  overhead,
  railing,
  gaps,
  activeItem,
}: {
  placement: Placement;
  x: number;
  y: number;
  selected: boolean;
  ctx: CanvasLayerContext;
  drag: DragProps;
  overhead?: boolean;
  railing?: EdgeRun[];
  gaps?: EdgeRun[];
  activeItem?: string | null;
}) {
  const r = resolve(placement.variantId);
  const product = r?.product;
  // The item's own look, from the catalog's appearance editor. The shade picked for THIS placement
  // wins over the row's fill, the way a cloth wins over a table's style — and both show through
  // selection, which says "selected" in the stroke alone, so an item does not lose its colour the
  // moment it is picked up to be edited. A stage keeps the plan's neutral look whatever deck it was
  // built from: its decks, levels and stairs are drawn in fixed inks on top of it (StageMarks), and
  // a black-decked outline would swallow them.
  const style = resolveStyle(placement.stage ? undefined : productStyle(product), "screen", {
    fill: "var(--color-surface)",
    stroke: "var(--color-border)",
    strokeWidth: 2,
  });
  const shade = placement.stage ? undefined : r?.swatch;
  const own = shade ?? (placement.stage ? undefined : product?.appearance?.style?.fill);
  const fill = own ?? (selected ? "var(--color-accent-tint)" : style.fill);
  const fillOpacity = shade ? 1 : style.fillOpacity;
  // What is written inside has to stay readable on whatever the fill is (TableNode's rule for a
  // cloth): dark ink on a light fill, light on a dark one. An overhead item is never filled.
  const dark = !overhead && !!own && fillOpacity > 0.5 && isDark(own);
  // At the size it was stretched to, when its row is resizable (Product.resize).
  const footprint: Footprint = placementFootprint(placement);
  // A stage writes nothing inside itself — its outline, front and stairs already say what it is,
  // and a word across the middle sat on top of the levels and the seams.
  const content = placement.stage
    ? { mode: "none" as const }
    : product
      ? resolveContent(product)
      : { mode: "name" as const, name: r?.label ?? "פריט" };
  const bounds = footprintBounds(footprint);
  const scale = placement.scale || 1;
  const label = content.mode === "name" ? content.name : "";
  // No ellipsis in SVG text: size the type to the footprint the way Konva did, then clip the string
  // to what that box can hold rather than letting it run out past the shape's edge.
  const fontSize = Math.max(140, Math.min(bounds.h * 0.4, bounds.w * 0.22));
  const maxChars = Math.max(3, Math.floor((bounds.w * 0.84) / (fontSize * 0.55)));
  const shown = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
  const Icon = content.mode === "icon" && content.icon ? ICON_BY_NAME[content.icon] : undefined;
  const iconSize = Math.min(bounds.w, bounds.h) * 0.6;
  // Where the name or icon sits: the shape's visual centre (labelAnchor), which on a curved bar is
  // the middle of the band rather than the box centre out in the air. Nothing to place for an item
  // that writes nothing, so a stage's outline is never measured for it.
  const labelAt = content.mode === "none" ? { x: 0, y: 0 } : labelAnchor(footprint);
  const upright = uprightTransform(placement.rotation, placement.mirrored);
  const badge = 340;

  return (
    <g
      {...draggable({ x, y }, ctx, drag)}
      transform={`translate(${x} ${y})${placement.rotation ? ` rotate(${placement.rotation})` : ""}${placement.mirrored ? ` ${MIRROR_TRANSFORM}` : ""}${scale !== 1 ? ` scale(${scale})` : ""}`}
      tabIndex={0}
      role="button"
      aria-label={`${r?.label ?? "פריט"}${drag.onMove ? " — גרירה להזזה" : ""}`}
      className={(drag.onMove ? "cursor-move" : "cursor-pointer") + " touch-none focus:outline-none"}
    >
      <FootprintShape
        footprint={footprint}
        overhead={overhead}
        // fill is passed unconditionally — FootprintShape itself overrides it to "none" when
        // overhead is set, so the convention lives in one place instead of being re-decided at
        // every call site.
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={selected ? "var(--color-accent)" : style.stroke}
        strokeOpacity={selected ? 1 : style.strokeOpacity}
        // A stage is large: the 4px a small item is selected with reads as a heavy frame round a
        // platform, so it keeps its resting weight and says "selected" in colour alone.
        strokeWidth={selected && !placement.stage ? 4 : style.strokeWidth}
        strokeDasharray={style.dashArray.length ? style.dashArray.join(" ") : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {placement.stage && (
        <StageMarks
          stage={placement.stage}
          selected={selected}
          railing={railing}
          gaps={gaps}
          activeItem={activeItem}
          rotation={placement.rotation}
          mirrored={placement.mirrored}
          labelMm={ctx.mm(11)}
        />
      )}

      {/* Upright at every angle, for the reason a table's number is (TableNode above): the caption
          NAMES the thing, it is not painted on it, and a turned stage whose במה reads upside down is
          a caption the plan has stopped delivering. Counter-turned about the label's own point, so
          only its lean changes — a uniform scale commutes with the turn. */}
      {content.mode === "name" && (
        <text
          transform={`translate(${labelAt.x} ${labelAt.y})${upright ? ` ${upright}` : ""}`}
          textAnchor="middle"
          dominantBaseline="central"
          fill={dark ? "var(--color-canvas)" : "var(--color-ink)"}
          style={{ fontSize }}
          className="pointer-events-none"
        >
          {shown}
        </text>
      )}

      {/* The same lucide glyph the catalog picker shows, drawn straight into the plan — its 24-unit
          viewBox scaled to the footprint and re-centred. */}
      {Icon && (
        <g
          transform={`translate(${labelAt.x - iconSize / 2} ${labelAt.y - iconSize / 2}) scale(${iconSize / 24})`}
          className="pointer-events-none"
        >
          {createElement(Icon, {
            width: 24,
            height: 24,
            color: dark ? "var(--color-canvas)" : selected ? "var(--color-accent)" : "var(--color-ink-soft)",
            strokeWidth: 1.5,
          })}
        </g>
      )}
      {/* content.mode "none" renders nothing */}

      {placement.quantity > 1 && (
        <g className="pointer-events-none">
          <rect
            x={-bounds.w / 2 + 40}
            y={bounds.h / 2 - badge - 40}
            width={badge}
            height={badge}
            rx={70}
            fill="var(--color-accent)"
          />
          {/* The pill is pinned to the item's own corner and turns with it — it is part of the
              drawing. The count inside it is READ, so it is counter-turned about the pill's own
              centre and stays inside it. */}
          <text
            x={-bounds.w / 2 + 40 + badge / 2}
            y={bounds.h / 2 - badge / 2 - 40}
            transform={(() => {
              const cx = -bounds.w / 2 + 40 + badge / 2;
              const cy = bounds.h / 2 - badge / 2 - 40;
              const upright = uprightTransform(placement.rotation, placement.mirrored);
              return upright ? `translate(${cx} ${cy}) ${upright} translate(${-cx} ${-cy})` : undefined;
            })()}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--color-canvas)"
            style={{ fontSize: 220, fontWeight: 600 }}
          >
            ×{placement.quantity}
          </text>
        </g>
      )}
    </g>
  );
}

/** What a stage shows over its outline, in its own frame. Its FRONT, always — the one edge the
 *  audience sees, and the one the decks are laid from — and while it is selected, the decks it is
 *  built of, as seams: the plan holds one stage, and the build is there to be looked at, not handled.
 *  Unselected there are no seams, so the room reads as a room with a stage in it rather than a
 *  crew's diagram. */
function StageMarks({
  stage,
  selected,
  railing,
  rotation,
  mirrored,
  labelMm,
  gaps,
  activeItem,
}: {
  stage: StageBuild;
  selected: boolean;
  railing?: EdgeRun[];
  gaps?: EdgeRun[];
  activeItem?: string | null;
  rotation: number;
  mirrored?: boolean;
  /** The size of the side-length labels, in world mm (a fixed size on screen). */
  labelMm: number;
}) {
  // Every side at one weight — the front is not marked on the plan; the area tool shows it while it
  // is being chosen, and the printed stage plan writes "קהל" in front of it.
  const decks = selected ? layStage(stage, deckOf).decks : [];
  const upright = uprightTransform(rotation, mirrored);
  return (
    <g className="pointer-events-none">
      {/* Levels stand on the plan as what they are — a raised part of the stage, with its height. */}
      {(stage.levels ?? []).map((l) => {
        const xs = l.outline.map((q) => q.x);
        const ys = l.outline.map((q) => q.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        return (
          <g key={l.id}>
            <polygon
              points={l.outline.map((q) => `${q.x},${q.y}`).join(" ")}
              fill="var(--color-accent-tint)"
              fillOpacity={0.6}
              stroke={selected ? "var(--color-accent)" : "var(--color-ink-soft)"}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <g transform={`translate(${cx} ${cy})`}>
              <text transform={upright} textAnchor="middle" dominantBaseline="central" fill="var(--color-ink-soft)" style={{ fontSize: 220 }}>
                {`${Math.round(l.heightMm / 10)} ס״מ`}
              </text>
            </g>
          </g>
        );
      })}
      {decks.map((d, i) => (
        <rect
          key={i}
          x={-d.widthMm / 2}
          y={-d.depthMm / 2}
          width={d.widthMm}
          height={d.depthMm}
          transform={`translate(${d.centre.x} ${d.centre.y}) rotate(${d.rotation})`}
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity={0.55}
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* Stairs, banquettes and barriers are part of the stage on the floor — drawn always: a flight
          with a line across each tread, a banquette as a seat-coloured strip, a barrier as a heavy
          line along the inside of its edge. The one being edited is in the accent. */}
      {(stage.stairs ?? []).map((st) => {
        const shape = edgeItemShape(stage, st, deckOf);
        if (!shape) return null;
        const on = st.id === activeItem;
        const stroke = on ? "var(--color-accent)" : "var(--color-ink-soft)";
        if (shape.kind === "barrier" || shape.kind === "backdrop") {
          // On the edge: a barrier a thin rail, a backdrop a solid wall.
          return (
            <polygon
              key={st.id}
              points={shape.polygon.map((q) => `${q.x},${q.y}`).join(" ")}
              fill={on ? "var(--color-accent)" : shape.kind === "backdrop" ? "var(--color-ink)" : "var(--color-ink-soft)"}
              fillOpacity={shape.kind === "backdrop" && !on ? 0.75 : 1}
              stroke={stroke}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        return (
          // Outside the stage's outline, so its own hit area: a click on the stairs is a click on the
          // stage (select it, drag it) — not on the floor behind.
          <g key={st.id} style={{ pointerEvents: "visiblePainted" }}>
            {shape.chairs.map((seat, k) => (
              <Chair key={`chair-${k}`} seat={seat} />
            ))}
            <polygon
              points={shape.polygon.map((q) => `${q.x},${q.y}`).join(" ")}
              fill={shape.kind === "bench" ? "var(--color-accent-tint)" : "var(--color-surface)"}
              fillOpacity={1}
              strokeDasharray={shape.kind === "ramp" ? "8 4" : undefined}
              stroke={on ? "var(--color-accent)" : "var(--color-border)"}
              strokeWidth={on ? 2.5 : 1.5}
              vectorEffect="non-scaling-stroke"
            />
            {shape.treads.map(([u, v], k) => (
              <line key={k} x1={u.x} y1={u.y} x2={v.x} y2={v.y} stroke="var(--color-ink-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        );
      })}
      {/* Corner pieces where two runs of stairs (or two banquettes) meet outside a corner. */}
      {stageCorners(stage, deckOf).map((c, i) => (
        <g key={`corner-${i}`}>
          <polygon
            points={c.polygon.map((q) => `${q.x},${q.y}`).join(" ")}
            fill={c.kind === "bench" ? "var(--color-accent-tint)" : "var(--color-surface)"}
            fillOpacity={c.kind === "bench" ? 0.7 : 1}
            stroke="var(--color-border)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          {c.treads.map(([u, v], k) => (
            <line key={k} x1={u.x} y1={u.y} x2={v.x} y2={v.y} stroke="var(--color-ink-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ))}
      {/* What nothing covers yet — an edge somebody can walk off. Only while the stage is selected,
          where the bar offers to finish it. */}
      {(gaps ?? []).map((g, i) => (
        <line
          key={`gap-${i}`}
          x1={g.a.x}
          y1={g.a.y}
          x2={g.b.x}
          y2={g.b.y}
          stroke="var(--color-alert)"
          strokeWidth={3}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* While selected, every side's length just outside it — what a designer checks against the
          room before moving on ("is that 6 metres?"). */}
      {selected &&
        stage.outline.map((a, i) => {
          const b = stage.outline[(i + 1) % stage.outline.length];
          const L = Math.hypot(b.x - a.x, b.y - a.y);
          if (L < 1) return null;
          const s = signedArea(stage.outline) >= 0 ? 1 : -1;
          const out = { x: (s * (b.y - a.y)) / L, y: (-s * (b.x - a.x)) / L };
          const at = { x: (a.x + b.x) / 2 + out.x * labelMm * 1.4, y: (a.y + b.y) / 2 + out.y * labelMm * 1.4 };
          return (
            <g key={`len-${i}`} transform={`translate(${at.x} ${at.y})`}>
              <text
                transform={upright}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--color-accent)"
                stroke="var(--color-canvas)"
                strokeWidth={labelMm * 0.35}
                paintOrder="stroke"
                style={{ fontSize: labelMm, fontWeight: 600 }}
                className="nums"
              >
                {`${(L / 1000).toFixed(2)} מ׳`}
              </text>
            </g>
          );
        })}
      {/* A railing the studio's rule asks for: a heavy dotted line along the side that needs it. */}
      {(railing ?? []).map((r, i) => (
        <line
          key={`rail-${i}`}
          x1={r.a.x}
          y1={r.a.y}
          x2={r.b.x}
          y2={r.b.y}
          stroke="var(--color-alert)"
          strokeWidth={4}
          strokeDasharray="2 5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

/** The stairs, banquettes and barriers of the selected stage, as things to take hold of. A click
 *  selects one (the bar then edits it); a drag on it slides it along its side; the selected one has a
 *  grip at each end for its width and, a banquette, one on its outer side for its depth. Everything
 *  snaps to the side's ends and middle — a flight is nearly always centred or into a corner — and
 *  otherwise to 5cm. Worked out against the item as it was when the drag began. */
function EdgeItemHandles({
  p,
  ctx,
  active,
  onSelect,
  onChange,
  onEnd,
}: {
  p: StagePlacement;
  ctx: CanvasLayerContext;
  active: string | null;
  onSelect: (itemId: string | null) => void;
  onChange: (item: StageStair) => void;
  onEnd: () => void;
}) {
  const start = useRef<{ item: StageStair; grab: number; from: number; to: number } | null>(null);
  const SNAP = 150;
  /** A point under the pointer, as mm along an item's edge (and out from it). */
  const along = (item: StageStair, clientX: number, clientY: number) => {
    const e = itemEdge(p.stage, item);
    if (!e) return null;
    const q = toStageFrame(p, ctx.clientToMm(clientX, clientY));
    const L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) || 1;
    const u = { x: (e.b.x - e.a.x) / L, y: (e.b.y - e.a.y) / L };
    const sg = signedArea(e.outline) >= 0 ? 1 : -1;
    const out = { x: sg * u.y, y: -sg * u.x };
    return { s: (q.x - e.a.x) * u.x + (q.y - e.a.y) * u.y, o: (q.x - e.a.x) * out.x + (q.y - e.a.y) * out.y, L };
  };
  const snapEnd = (v: number, L: number) => (v < SNAP ? 0 : v > L - SNAP ? L : Math.abs(v - L / 2) < SNAP ? L / 2 : Math.round(v / 50) * 50);
  const write = (item: StageStair, from: number, to: number, L: number) => {
    const full = from <= 1 && to >= L - 1;
    onChange({ ...item, t: (from + to) / 2 / L, widthMm: Math.round(to - from), full: full || undefined });
  };
  const s5 = ctx.mm(5);
  const release = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (start.current) onEnd();
    start.current = null;
  };
  return (
    <g>
      {(p.stage.stairs ?? []).map((item) => {
        const shape = edgeItemShape(p.stage, item, deckOf);
        const span = itemSpan(p.stage, item);
        const e = itemEdge(p.stage, item);
        if (!shape || !span || !e) return null;
        const room = shape.polygon.map((q) => toRoom(p, q));
        const on = item.id === active;
        const u = { x: (e.b.x - e.a.x) / span.L, y: (e.b.y - e.a.y) / span.L };
        const edgePt = (v: number) => toRoom(p, { x: e.a.x + u.x * v, y: e.a.y + u.y * v });
        return (
          <g key={item.id}>
            {/* The item itself: click to edit, drag to slide along its side. A barrier is too thin to
                hit, so it is held by a fat invisible line instead of its outline. */}
            {shape.kind === "barrier" || shape.kind === "backdrop" ? (
              <line
                x1={edgePt(span.from).x}
                y1={edgePt(span.from).y}
                x2={edgePt(span.to).x}
                y2={edgePt(span.to).y}
                stroke="transparent"
                strokeWidth={16}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "stroke" }}
                className="cursor-move touch-none"
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  onSelect(item.id);
                  const a = along(item, ev.clientX, ev.clientY);
                  if (a) start.current = { item, grab: a.s, from: span.from, to: span.to };
                  (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
                }}
                onPointerMove={(ev) => {
                  const st = start.current;
                  if (ev.buttons !== 1 || !st) return;
                  const a = along(st.item, ev.clientX, ev.clientY);
                  if (!a) return;
                  const w = st.to - st.from;
                  let from = Math.max(0, Math.min(a.L - w, st.from + a.s - st.grab));
                  if (from < SNAP) from = 0;
                  else if (a.L - (from + w) < SNAP) from = a.L - w;
                  else if (Math.abs(from + w / 2 - a.L / 2) < SNAP) from = a.L / 2 - w / 2;
                  write(st.item, from, from + w, a.L);
                }}
                onPointerUp={release}
                onClick={(ev) => ev.stopPropagation()}
              />
            ) : (
              <polygon
                points={room.map((q) => `${q.x},${q.y}`).join(" ")}
                fill="transparent"
                className="cursor-move touch-none"
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  onSelect(item.id);
                  const a = along(item, ev.clientX, ev.clientY);
                  if (a) start.current = { item, grab: a.s, from: span.from, to: span.to };
                  (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
                }}
                onPointerMove={(ev) => {
                  const st = start.current;
                  if (ev.buttons !== 1 || !st) return;
                  const a = along(st.item, ev.clientX, ev.clientY);
                  if (!a) return;
                  const w = st.to - st.from;
                  let from = Math.max(0, Math.min(a.L - w, st.from + a.s - st.grab));
                  if (from < SNAP) from = 0;
                  else if (a.L - (from + w) < SNAP) from = a.L - w;
                  else if (Math.abs(from + w / 2 - a.L / 2) < SNAP) from = a.L / 2 - w / 2;
                  write(st.item, from, from + w, a.L);
                }}
                onPointerUp={release}
                onClick={(ev) => ev.stopPropagation()}
              />
            )}
            {on && (
              <>
                <EdgeGrip
                  at={edgePt(span.from)}
                  r={s5}
                  label="קצה — גרירה לשינוי הרוחב"
                  cursor="cursor-ew-resize"
                  onBegin={() => (start.current = { item, grab: 0, from: span.from, to: span.to })}
                  onRelease={release}
                  onDrag={(ev) => {
                    if (!start.current) return;
                    const st = start.current!;
                    const a = along(st.item, ev.clientX, ev.clientY);
                    if (!a) return;
                    const from = Math.min(st.to - 300, Math.max(0, snapEnd(a.s, a.L)));
                    write(st.item, from, st.to, a.L);
                  }}
                />
                <EdgeGrip
                  at={edgePt(span.to)}
                  r={s5}
                  label="קצה — גרירה לשינוי הרוחב"
                  cursor="cursor-ew-resize"
                  onBegin={() => (start.current = { item, grab: 0, from: span.from, to: span.to })}
                  onRelease={release}
                  onDrag={(ev) => {
                    if (!start.current) return;
                    const st = start.current!;
                    const a = along(st.item, ev.clientX, ev.clientY);
                    if (!a) return;
                    const to = Math.max(st.from + 300, Math.min(a.L, snapEnd(a.s, a.L)));
                    write(st.item, st.from, to, a.L);
                  }}
                />
                {shape.kind === "bench" && (
                  <EdgeGrip
                    at={toRoom(p, {
                      x: (shape.polygon[2].x + shape.polygon[3].x) / 2,
                      y: (shape.polygon[2].y + shape.polygon[3].y) / 2,
                    })}
                    r={s5}
                    label="עומק הבנקט — גרירה"
                    cursor="cursor-ns-resize"
                    onBegin={() => (start.current = { item, grab: 0, from: span.from, to: span.to })}
                    onRelease={release}
                    onDrag={(ev) => {
                      if (!start.current) return;
                      const st = start.current!;
                      const a = along(st.item, ev.clientX, ev.clientY);
                      if (!a) return;
                      onChange({ ...st.item, depthMm: Math.max(250, Math.min(1500, Math.round(a.o / 50) * 50)) });
                    }}
                  />
                )}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** One round grip of an edge item: captures the pointer, reports the drag, lets go. */
function EdgeGrip({
  at,
  r,
  label,
  cursor,
  onBegin,
  onDrag,
  onRelease,
}: {
  at: Point;
  r: number;
  label: string;
  cursor: string;
  onBegin: () => void;
  onDrag: (e: React.PointerEvent) => void;
  onRelease: (e: React.PointerEvent) => void;
}) {
  return (
    <circle
      cx={at.x}
      cy={at.y}
      r={r}
      fill="var(--color-canvas)"
      stroke="var(--color-accent)"
      strokeWidth={2.5}
      vectorEffect="non-scaling-stroke"
      className={cursor + " touch-none focus:outline-none"}
      role="button"
      tabIndex={0}
      aria-label={label}
      onPointerDown={(e) => {
        e.stopPropagation();
        onBegin();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => e.buttons === 1 && onDrag(e)}
      onPointerUp={onRelease}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** The corners and sides of an outline, as grips — what editing a stage's SHAPE is. A corner drags
 *  where it is put and nothing else moves (Shift makes the square sides meeting it follow, so they
 *  stay square); a side pushes straight out or in. Lengths are pulled to what the decks build (`snap`, a magnet a few pixels wide) and are
 *  otherwise exact to the centimetre; Alt lets go of the pull. With `onSplit`/`onRemove` (the area
 *  tool's "עריכת הבמה"), a double-click on a side splits it in two — then half of it pushes out into
 *  an L — and on a corner takes it away. A move that would fold the outline over itself, or leave a
 *  side shorter than 10cm, is not taken.
 *
 *  `outline` is in its own frame (a stage's, or the room's): `toRoom` draws it, and `fromRoom` — read
 *  when a drag BEGINS, so a stage re-centred under the pointer does not slide its own frame — takes
 *  the pointer back into it. `refDeg` is the direction of the front in that frame. */
function OutlineHandles({
  outline,
  refDeg,
  toRoom: toRoomOf,
  fromRoom,
  ctx,
  snap,
  onChange,
  onSplit,
  onRemove,
  onBegin,
  onEnd,
}: {
  outline: Point[];
  refDeg: number;
  toRoom: (q: Point) => Point;
  fromRoom: (q: Point) => Point;
  ctx: CanvasLayerContext;
  snap?: (mm: number, magnetMm: number) => number;
  onChange: (outline: Point[]) => void;
  onSplit?: (side: number) => void;
  onRemove?: (corner: number) => void;
  /** A drag starting — the owner keeps what the outline belonged to then, since `onChange` reports
   *  outlines in THAT frame (a stage re-centres under the pointer as it is reshaped). */
  onBegin?: () => void;
  onEnd?: () => void;
}) {
  const start = useRef<{ outline: Point[]; fromRoom: (q: Point) => Point } | null>(null);
  const s = ctx.mm(5);
  const pull = (e: React.PointerEvent) => (snap && !e.altKey ? (mm: number) => snap(mm, ctx.mm(8)) : (mm: number) => Math.max(10, Math.round(mm / 10) * 10));
  const take = (next: Point[]) => {
    const short = next.some((v, k) => {
      const w = next[(k + 1) % next.length];
      const L = Math.hypot(w.x - v.x, w.y - v.y);
      return L >= 1 && L < 100;
    });
    if (!short && !selfIntersects(next)) onChange(next);
  };
  const grab = (e: React.PointerEvent) => {
    e.stopPropagation();
    start.current = { outline, fromRoom };
    onBegin?.();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const release = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    start.current = null;
    onEnd?.();
  };
  return (
    <g>
      {outline.map((a, i) => {
        const b = outline[(i + 1) % outline.length];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 1) return null;
        const at = toRoomOf({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const ra = toRoomOf(a);
        const rb = toRoomOf(b);
        const angle = (Math.atan2(rb.y - ra.y, rb.x - ra.x) * 180) / Math.PI;
        return (
          <rect
            key={`side-${i}`}
            x={at.x - s * 1.6}
            y={at.y - s * 0.7}
            width={s * 3.2}
            height={s * 1.4}
            rx={s * 0.7}
            transform={`rotate(${angle} ${at.x} ${at.y})`}
            fill="var(--color-canvas)"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            className="cursor-move touch-none focus:outline-none"
            role="button"
            tabIndex={0}
            aria-label={onSplit ? "צד הבמה — גרירה פנימה או החוצה, לחיצה כפולה מפצלת אותו" : "צד הבמה — גרירה להזזת הצד פנימה או החוצה"}
            onPointerDown={grab}
            onPointerMove={(e) => {
              const was = start.current;
              if (e.buttons !== 1 || !was) return;
              const base = was.outline;
              const ea = base[i];
              const eb = base[(i + 1) % base.length];
              const len = Math.hypot(eb.x - ea.x, eb.y - ea.y) || 1;
              const sgn = signedArea(base) >= 0 ? 1 : -1;
              const n = { x: (sgn * (eb.y - ea.y)) / len, y: (-sgn * (eb.x - ea.x)) / len };
              const q = was.fromRoom(ctx.clientToMm(e.clientX, e.clientY));
              const d = (q.x - (ea.x + eb.x) / 2) * n.x + (q.y - (ea.y + eb.y) / 2) * n.y;
              take(pushSide(base, i, Math.round(d / 10) * 10, pull(e)));
            }}
            onPointerUp={release}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onSplit?.(i);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        );
      })}
      {outline.map((v, i) => {
        const at = toRoomOf(v);
        return (
          <circle
            key={`corner-${i}`}
            cx={at.x}
            cy={at.y}
            r={s * 0.85}
            fill="var(--color-accent)"
            stroke="var(--color-canvas)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="cursor-grab touch-none focus:outline-none"
            role="button"
            tabIndex={0}
            aria-label={onRemove ? "פינת הבמה — גרירה מזיזה אותה (Shift שומר על זוויות ישרות), לחיצה כפולה מוחקת אותה" : "פינת הבמה — גרירה מזיזה אותה (Shift שומר על זוויות ישרות)"}
            onPointerDown={grab}
            onPointerMove={(e) => {
              const was = start.current;
              if (e.buttons !== 1 || !was) return;
              const q = was.fromRoom(ctx.clientToMm(e.clientX, e.clientY));
              take(moveVertex(was.outline, i, q, refDeg, pull(e), e.shiftKey));
            }}
            onPointerUp={release}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onRemove?.(i);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        );
      })}
    </g>
  );
}

/** Handles for stretching a resizable item (Product.resize) — one on each edge that may move, and on
 *  each corner when both may. Pulling one keeps the OPPOSITE edge where it is, which is what grabbing
 *  an edge means, so a stage pulled from its front grows towards the room and not into the wall
 *  behind it.
 *
 *  Every frame is put through `clamp` before it is reported — the item's own module and range
 *  (lib/studio/footprint.ts clampSize) — so the size under the pointer steps from 4m to 5m to 6m the
 *  way the decks are actually built, and the edge that does not move is re-derived from the snapped
 *  size rather than the raw one. Drawn in the item's own frame (its turn, never its flip: the box is
 *  the same either way round), at a fixed screen size like every other handle on this canvas. */
function ResizeHandles({
  centre,
  rotation,
  size,
  axes,
  clamp,
  ctx,
  onResize,
  onEnd,
}: {
  centre: Point;
  rotation: number;
  size: { widthMm: number; depthMm: number };
  axes: { width: boolean; depth: boolean; uniform: boolean };
  /** `magnetMm`: how far a length is pulled to one the item is built in (a stage's decks). */
  clamp: (size: { widthMm: number; depthMm: number }, magnetMm?: number) => { widthMm: number; depthMm: number };
  ctx: CanvasLayerContext;
  onResize: (size: { widthMm: number; depthMm: number }, centre: Point) => void;
  onEnd: () => void;
}) {
  const halfW = size.widthMm / 2;
  const halfD = size.depthMm / 2;
  const grips: [number, number][] = [
    ...(axes.width ? ([[-1, 0], [1, 0]] as [number, number][]) : []),
    ...(axes.depth ? ([[0, -1], [0, 1]] as [number, number][]) : []),
    ...(axes.width && axes.depth ? (CORNERS.map(([a, b]) => [a, b]) as [number, number][]) : []),
  ];
  const s = ctx.mm(5);
  return (
    <g>
      {grips.map(([sx, sy]) => {
        const at = fromLocalFrame({ x: sx * halfW, y: sy * halfD }, centre, rotation);
        const corner = sx !== 0 && sy !== 0;
        return (
          <rect
            key={`${sx},${sy}`}
            x={at.x - s}
            y={at.y - s}
            width={s * 2}
            height={s * 2}
            rx={corner ? 0 : s}
            transform={rotation ? `rotate(${rotation} ${at.x} ${at.y})` : undefined}
            fill="var(--color-canvas)"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            className={(corner ? (sx === sy ? "cursor-nwse-resize" : "cursor-nesw-resize") : sx !== 0 ? "cursor-ew-resize" : "cursor-ns-resize") + " touch-none focus:outline-none"}
            role="button"
            tabIndex={0}
            aria-label={`${sx !== 0 && sy === 0 ? "רוחב" : sx === 0 ? "עומק" : "פינה"} — גרירה לשינוי הגודל`}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (e.buttons !== 1) return;
              const local = toLocalFrame(ctx.clientToMm(e.clientX, e.clientY), centre, rotation);
              // The edge (or corner) opposite the grip, held still.
              const fixed = { x: -sx * halfW, y: -sy * halfD };
              const raw = {
                widthMm: sx !== 0 ? Math.abs(local.x - fixed.x) : size.widthMm,
                depthMm: sy !== 0 ? Math.abs(local.y - fixed.y) : size.depthMm,
              };
              const next = clamp(raw, e.altKey ? 0 : ctx.mm(8));
              if (next.widthMm === size.widthMm && next.depthMm === size.depthMm) return;
              // A round shape grows about the axis it was not pulled on — its depth follows its width,
              // and there is no edge on that side to hold still.
              const centreLocal = {
                x: sx !== 0 ? fixed.x + (sx * next.widthMm) / 2 : 0,
                y: sy !== 0 ? fixed.y + (sy * next.depthMm) / 2 : 0,
              };
              const c = fromLocalFrame(centreLocal, centre, rotation);
              onResize(next, { x: Math.round(c.x), y: Math.round(c.y) });
            }}
            onPointerUp={(e) => {
              const el = e.currentTarget as Element;
              if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
              onEnd();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        );
      })}
    </g>
  );
}

/** The plan while a catalog item is armed on the rail. A pane over everything, like the template
 *  ghost's and the tape's, because a click here means "put one HERE" whatever it lands on — a
 *  centrepiece is placed by clicking the very table that would otherwise take the click and select
 *  itself.
 *
 *  What follows the pointer says what the click will do, by where the item goes:
 *    - on a table (cloths, centrepieces, candlesticks): the table under the pointer is ringed and the
 *      item drawn at its centre; over bare floor, a faint copy at the pointer — the click will say
 *      it needs a table, and stay armed.
 *    - on a wall (drapes): the wall it will hang on, lit.
 *    - anywhere else: the item itself at true scale, snapped exactly as a drop is, so what is shown
 *      is where it lands. */
function ArmedPane({
  product,
  ctx,
  at,
  onAt,
  doc,
  structure,
  snapOptions,
  clear,
  onPlace,
  onDisarm,
}: {
  product: Product;
  ctx: CanvasLayerContext;
  at: Point | null;
  onAt: (p: Point | null) => void;
  doc: DesignDocumentContent;
  structure: VenueStructure;
  snapOptions: (item: CarriedItem) => Parameters<CanvasLayerContext["snap"]>[1];
  clear: (p: Point, item: CarriedItem) => Point;
  onPlace: (at: Point, keep: boolean) => void;
  onDisarm?: () => void;
}) {
  const item = carriedOf(product);
  const onWall = CATEGORY_BY_ID[product.category]?.anchor === "wall";
  const onTable = !onWall && product.layer === "table";
  // Table and wall items are hit-tested on the raw point (which table, which wall); pulling that
  // point toward an alignment line could carry it off the table the pointer is plainly over.
  const free = !onWall && !onTable;
  const landing = (e: React.PointerEvent | React.MouseEvent): Point => {
    const raw = ctx.clientToMm(e.clientX, e.clientY);
    const p = free ? clear(ctx.snap(raw, snapOptions(item)), item) : raw;
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  const footprint = resolveFootprint(product);
  const table = onTable && at ? tableAt(doc, at.x, at.y) : undefined;
  const near = onWall && at ? nearestWall(structure, at) : null;
  const wall = near ? wallSegment(structure, near.wallId) : null;
  const ghost = (p: Point, faint = false) => (
    <g className="pointer-events-none" transform={`translate(${p.x} ${p.y})`} opacity={faint ? 0.45 : 1}>
      <FootprintShape
        footprint={footprint}
        overhead={product.layer === "ceiling"}
        fill="var(--color-accent)"
        fillOpacity={0.14}
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );

  return (
    <g>
      <rect
        x={-1e7}
        y={-1e7}
        width={2e7}
        height={2e7}
        fill="transparent"
        className="cursor-copy"
        // The left button is a placement and nothing else (no marquee starts under it). The middle
        // button still reaches the canvas, so the view can be panned mid-run without letting go.
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation();
        }}
        onPointerMove={(e) => onAt(landing(e))}
        onPointerLeave={() => {
          onAt(null);
          ctx.endSnap();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onPlace(landing(e), e.shiftKey);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ctx.endSnap();
          onDisarm?.();
        }}
      />
      {at && onTable && table && (
        <>
          <g
            className="pointer-events-none"
            transform={`translate(${table.position.x} ${table.position.y})${table.rotation ? ` rotate(${table.rotation})` : ""}`}
          >
            <FootprintShape
              footprint={tableFootprint(table)}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
          </g>
          {ghost(table.position)}
        </>
      )}
      {at && onTable && !table && ghost(at, true)}
      {at && onWall && wall && (
        <line
          className="pointer-events-none"
          x1={wall.a.x}
          y1={wall.a.y}
          x2={wall.b.x}
          y2={wall.b.y}
          stroke="var(--color-accent)"
          strokeOpacity={0.55}
          strokeWidth={10}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {at && free && ghost(at)}
    </g>
  );
}
