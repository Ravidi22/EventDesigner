"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DesignDocumentContent, DesignTable, Placement, Layer as LayerId, WallSpan } from "@/lib/design-document/types";
import { groupSeated, groupSeats } from "@/lib/design-document/groups";
import { seatsAround, CHAIR_BACK_MM, CHAIR_D_MM, CHAIR_W_MM, type Seat } from "@/lib/studio/seating";
import { resolve, tableUtilization, type Resolved } from "@/lib/studio/catalog-resolver";
import { pointToT, resolveSpan, wallSegment } from "@/lib/studio/anchor";
import { toLocalFrame, fromLocalFrame } from "@/lib/studio/geometry";
import type { VenueStructure } from "@/lib/venues/structure";
import { resolveFootprint, resolveContent, footprintBounds, type Footprint } from "@/lib/studio/footprint";
import type { Point } from "@/lib/studio/hall";
import type { EventPlan } from "@/lib/events/plan";
import { zoneBounds } from "@/lib/venues/zone";
import { resolveStyle } from "@/lib/element-style";
import { isAdditiveClick } from "@/lib/keyboard";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";
import { FootprintShape, tableFootprint } from "@/components/footprint-shape";
import { PlanCanvas, RotateHandle, type CanvasFocus, type CanvasLayerContext } from "@/components/plan-canvas";
import { constrainAngleDeg, type SnapBox } from "@/lib/studio/snap";
import { carriedItem } from "@/lib/studio/drag-payload";
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

const sameRef = (a: SelectionRef, b: SelectionRef) => a.kind === b.kind && a.id === b.id;

export function CanvasStage({
  doc,
  plan,
  selection,
  layerVisible,
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
}: {
  doc: DesignDocumentContent;
  plan: EventPlan;
  /** Everything selected right now — one item, or a whole group. */
  selection: SelectionRef[];
  layerVisible: Record<LayerId, boolean>;
  /** The zone the designer asked to be shown (the toolbar's eye). Frames it and holds everything
   *  else back; null = the whole event, which is what the surface opens on. */
  focusZoneId: string | null;
  /** A plain click replaces the selection (null clears it); `additive` is shift/ctrl, which toggles. */
  onSelect: (ref: SelectionRef | null, additive: boolean) => void;
  /** A rubber-band drag finished — everything its box caught. */
  onSelectMany: (refs: SelectionRef[], additive: boolean) => void;
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
  /** The end of a drag, however many frames it took: the host closes its history entry here. */
  onEndDrag: () => void;
  /** A carpet stretched by its corner: the new size, and the centre it moved to (the opposite
   *  corner stays put, which is what dragging one corner means). */
  onResizePlacement: (id: string, sizeMm: { widthMm: number; depthMm: number }, position: Point) => void;
  /** A drape's run along its wall, after dragging one of its ends. */
  onSpanPlacement: (id: string, span: WallSpan) => void;
  onDropProduct: (productId: string, x: number, y: number) => void;
  /** The current zoom, in world mm per screen pixel. Reported up so the catalog rail can draw the
   *  thing being dragged at the size it will actually land — see catalog-rail.tsx. */
  onScale?: (mmPerPx: number) => void;
}) {
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

    for (const p of doc.placements) {
      const r = resolve(p.variantId);
      if (r?.anchor === "wall") {
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
    return { drapes, carpets, items, ceiling, coverByTable, chipsByTable };
  }, [doc.placements]);

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
    return r?.sizing === "stretch" ? "carpet" : "item";
  }, []);

  // EVERYTHING ON THE FLOOR, BACK TO FRONT — rugs, tables and objects in one order, so that "bring
  // to front" can put a table over a rug or an object under a table. A plan nobody has restacked
  // comes out of here in exactly the order the three separate passes used to draw it in.
  const stack = useMemo(() => floorStack(doc, classify), [doc, classify]);

  /** The lookups the merged pass needs: a table or placement by id, without walking a list per entry. */
  const tableById = useMemo(() => new Map(doc.tables.map((t) => [t.id, t])), [doc.tables]);
  const placementById = useMemo(() => new Map(doc.placements.map((p) => [p.id, p])), [doc.placements]);

  // Everything with a free position of its own, which is the same list three times over: what a
  // rubber-band can catch, what a group drag carries, and what a single drag aligns itself against.
  // A hidden layer is not on it — a marquee must not sweep up what the designer cannot see.
  // Neither are the two anchored kinds: a cloth is its table's surface and a drape belongs to a
  // wall, so neither has a centre a shared delta could move.
  //
  // Each one is a BOX, not a point. Alignment only ever needed the centre, but equal-gap snapping
  // measures the air BETWEEN items, and air is between edges — a 2.44m table and a candlestick
  // sitting on the same centre line are nowhere near the same distance apart.
  const movable = useMemo(() => {
    const out: { ref: SelectionRef; box: SnapBox }[] = doc.tables.map((t) => {
      const b = footprintBounds(tableFootprint(t));
      return { ref: { kind: "table" as const, id: t.id }, box: { ...t.position, widthMm: b.w, depthMm: b.h } };
    });
    const placed = [
      ...(layerVisible.floor ? sorted.carpets : []),
      ...sorted.items.filter((p) => layerVisible[p.layer]),
      ...(layerVisible.ceiling ? sorted.ceiling : []),
    ];
    for (const p of placed) {
      out.push({ ref: { kind: "placement", id: p.id }, box: { ...p.position, ...placementExtent(p) } });
    }
    // The venue's own furniture is on this list too, which is what gives it everything the list is
    // for at once: a rubber-band catches it, a group drag carries it, and a table dragged past it
    // lines up on its edges. A bar you can move but cannot align to would be the worse half of the
    // feature — the reason to move it at all is usually to line it up with something.
    for (const f of structure.features) {
      out.push({ ref: { kind: "feature", id: f.id }, box: { x: f.x, y: f.y, widthMm: f.widthMm, depthMm: f.depthMm } });
    }
    return out;
  }, [doc.tables, sorted, layerVisible, structure]);

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
        transform: `translate(${t.position.x} ${t.position.y})${t.rotation ? ` rotate(${t.rotation})` : ""}`,
        seats: seatsAround(tableFootprint(t), t.seats),
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

  // One live group drag: every selected item's position, frozen the moment the gesture crosses the
  // threshold, so the whole group is re-derived each frame from one shared delta off fixed origins
  // rather than drifting from repeated relative nudges. Mirrors PlanCanvas's own group drag,
  // including its one deliberate omission: no alignment pull while several things move together —
  // snapping one member would shear the group apart.
  const groupDrag = useRef<{ start: Point; snapshot: { ref: SelectionRef; origin: Point }[] } | null>(null);

  /** The move handler for one item: the group's shared delta when it is part of a live
   *  multi-selection, otherwise its own snapped move. */
  const moveFor = (ref: SelectionRef, ctx: CanvasLayerContext) => (p: Point) => {
    if (selection.length > 1 && isSel(ref.kind, ref.id)) {
      groupDrag.current ??= {
        start: p,
        snapshot: movable.filter((m) => isSel(m.ref.kind, m.ref.id)).map((m) => ({ ref: m.ref, origin: { x: m.box.x, y: m.box.y } })),
      };
      const { start, snapshot } = groupDrag.current;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
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
    const self = movable.find((m) => sameRef(m.ref, ref))?.box;
    const snapped = ctx.snap(p, {
      boxes: movable.filter((m) => !sameRef(m.ref, ref)).map((m) => m.box),
      self: self && { widthMm: self.widthMm, depthMm: self.depthMm },
    });
    if (ref.kind === "table") onMoveTable(ref.id, snapped);
    else if (ref.kind === "feature") onMoveFeature(ref.id, snapped);
    else onMovePlacement(ref.id, snapped);
  };

  const endDrag = (ctx: CanvasLayerContext) => () => {
    groupDrag.current = null;
    ctx.endSnap();
    onEndDrag();
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
    const minX = Math.min(...boxes.map((b) => b.x - b.widthMm / 2));
    const maxX = Math.max(...boxes.map((b) => b.x + b.widthMm / 2));
    const minY = Math.min(...boxes.map((b) => b.y - b.depthMm / 2));
    const maxY = Math.max(...boxes.map((b) => b.y + b.depthMm / 2));
    // A lone item's handle rides round with the item, so it stays over the same corner of the thing
    // as it turns — which is what makes the knob feel attached to it. A group's stays north: the box
    // is axis-aligned and has no facing to ride, and a handle that jumped as the box re-fitted
    // itself each frame would be chasing the pointer rather than answering it.
    const only = rotatableRefs.length === 1 ? facingOf(rotatableRefs[0]) : 0;
    return {
      pivot: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      reachMm: (maxY - minY) / 2,
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
        const moved = fromLocalFrame(toLocalFrame(sn.origin, pivot, 0), pivot, delta);
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

  const nodeProps = (ref: SelectionRef, ctx: CanvasLayerContext, movableItem = true) => ({
    onPress: pressFor(ref),
    onClick: clickFor(ref),
    ...(movableItem ? { onMove: moveFor(ref, ctx), onEnd: endDrag(ctx) } : {}),
  });

  return (
    <PlanCanvas
      mode="edit"
      ariaLabel="סקיצת האירוע — שולחנות ופריטי עיצוב על תוכנית המתחם"
      outline={[]}
      edgeCurves={[]}
      selected={[]}
      onSelect={() => onSelect(null, false)}
      onAddVertex={() => {}}
      onCloseOutline={() => {}}
      onMoveVertex={() => {}}
      onMoveWallHandle={() => {}}
      graph={plan.structure}
      focus={focus}
      // The box, not the hits: everything selectable on this surface is drawn by this file, so this
      // is the only place that could test it. Supplying it at all is also what stops a plain drag on
      // empty canvas from panning — the view moves with Space (or the middle button) and the wheel,
      // and a bare drag draws a selection box.
      onMarquee={(b, additive) =>
        onSelectMany(
          movable
            .filter((m) => m.box.x >= b.minX && m.box.x <= b.maxX && m.box.y >= b.minY && m.box.y <= b.maxY)
            .map((m) => m.ref),
          additive,
        )
      }
      // The point is already snapped and the guide lines were already drawn under the incoming drag
      // — see PlanCanvas's dropSnap. An item off the rail lands in line with the row it is joining
      // and at the same gap that row already keeps, which is where the designer was about to drag it
      // to anyway. The size of the thing in flight comes from the rail (lib/studio/drag-payload):
      // a drop cannot ask dataTransfer what it is carrying until it has landed.
      onDropAt={(e, p) => {
        const productId = e.dataTransfer.getData("text/product");
        if (productId) onDropProduct(productId, p.x, p.y);
      }}
      dropSnap={() => {
        const carried = carriedItem();
        return {
          boxes: movable.map((m) => m.box),
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
                measured at /halls. */}
            <StructureFeatures
              structure={structure}
              mm={mm}
              selectedIds={selection.filter((r) => r.kind === "feature").map((r) => r.id)}
              onSelect={(id, additive) => onSelect({ kind: "feature", id }, additive)}
              onMove={(id, pos) => moveFor({ kind: "feature", id }, ctx)(pos)}
              onCommit={onEndDrag}
              clientToMm={ctx.clientToMm}
            />
          </>
        );
      }}
      overlay={(ctx) => (
        <>
          <StructureDoors structure={plan.structure} />

          {/* ONE PASS OVER THE WHOLE FLOOR, back to front.

              Rugs, tables and free objects used to be three fixed passes in that order, and
              reordering was only possible inside each — which meant a "bring to front" could never
              put a table over a rug or a plinth under a table, i.e. could never fix any of the
              overlaps a designer actually has. `stack` is the single order now
              (lib/design-document/stacking.ts); with nothing restacked it comes out identical to
              the three passes it replaced.

              A table's own chairs are drawn as part of ITS entry, immediately under it: wherever
              the table has been put in the stack, the chairs it tucks under go with it. They never
              take a click meant for the table (pointer-events-none on the ring). */}
          {stack.map((entry) => {
            if (entry.ref.kind === "table") {
              const t = tableById.get(entry.ref.id);
              if (!t) return null;
              const ring = seatRingByTable.get(t.id);
              return (
                <g key={`t-${t.id}`}>
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
            if (!p || !layerVisible[entry.kind === "carpet" ? "floor" : p.layer]) return null;
            return entry.kind === "carpet" ? (
              <CarpetNode
                key={`c-${p.id}`}
                placement={p}
                selected={isSel("placement", p.id)}
                ctx={ctx}
                drag={nodeProps({ kind: "placement", id: p.id }, ctx)}
                onResize={(sizeMm, position) => onResizePlacement(p.id, sizeMm, position)}
                onEndResize={onEndDrag}
              />
            ) : (
              <PlacementNode
                key={`p-${p.id}`}
                placement={p}
                x={p.position.x}
                y={p.position.y}
                selected={isSel("placement", p.id)}
                ctx={ctx}
                drag={nodeProps({ kind: "placement", id: p.id }, ctx)}
              />
            );
          })}

          {/* A GROUP's ring of chairs belongs to no single member, so it cannot travel with one of
              them the way a lone table's does — it goes round the outside of the whole block. */}
          {seating
            .filter((ring) => !ring.forTable)
            .map((ring) => (
              <g key={`chairs-${ring.key}`} transform={ring.transform} className="pointer-events-none">
                {ring.seats.map((seat, i) => (
                  <Chair key={i} seat={seat} />
                ))}
              </g>
            ))}

          {/* The group, drawn once over its members: the outline that says where the one larger
              table ends, and the single number it carries instead of each table carrying its own. */}
          {tableGroups.map((g) => (
            <g key={`group-${g.id}`} className="pointer-events-none">
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

          {/* Table-layer items — clustered on their table. Covers are excluded: they were drawn as
              the table itself just above. */}
          {layerVisible.table &&
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
                onEndDrag();
              }}
              clientToMm={ctx.clientToMm}
              mm={ctx.mm}
              label={
                rotatable.count === 1
                  ? "סיבוב הפריט — גרירה · Alt לזווית חופשית"
                  : `סיבוב ${rotatable.count} הפריטים יחד — גרירה · Alt לזווית חופשית`
              }
            />
          )}

          {/* Drapes last, over the wall they hang on — they are overhead (the ceiling layer), and a
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
        </>
      )}
    />
  );
}

/** Is this shade dark enough that text on it has to go light? Perceived luminance (ITU-R BT.601),
 *  the same rule the catalog swatches read by. Non-hex values (a CSS variable fallback) are treated
 *  as light, which is what the tints in this palette are. */
function isDark(color: string): boolean {
  const hex = color.trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
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

  return (
    <g transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>
      <rect
        {...draggable(placement.position, ctx, drag)}
        x={x - halfW}
        y={y - halfD}
        width={size.widthMm}
        height={size.depthMm}
        rx={Math.min(size.widthMm, size.depthMm) * 0.03}
        fill={swatchOf(r, "var(--color-inset)")}
        fillOpacity={0.85}
        stroke={selected ? "var(--color-accent)" : "var(--color-border)"}
        strokeWidth={selected ? 3 : 1.5}
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

/** How much room a placed item takes on the plan — its drawn footprint, at whatever scale it was
 *  given. A carpet answers with the size it was stretched to rather than the catalog's, because
 *  that is the rectangle actually lying on the floor. */
function placementExtent(p: Placement): { widthMm: number; depthMm: number } {
  const r = resolve(p.variantId);
  if (r?.sizing === "stretch") return p.sizeMm ?? fallbackSize(r);
  const b = r ? footprintBounds(resolveFootprint(r.product)) : { w: 600, h: 600 };
  const scale = p.scale || 1;
  return { widthMm: b.w * scale, depthMm: b.h * scale };
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
  // The table's own style sets its "at rest" look; selection and the overflow warning are
  // functional states that must stay legible regardless, so they still override stroke/fill on top
  // of it (mirrors the hall editor's fixtures, whose selection works the same way).
  const style = resolveStyle(table.style, "screen", {
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
      transform={`translate(${table.position.x} ${table.position.y})${table.rotation ? ` rotate(${table.rotation})` : ""}`}
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
}: {
  placement: Placement;
  x: number;
  y: number;
  selected: boolean;
  ctx: CanvasLayerContext;
  drag: DragProps;
  overhead?: boolean;
}) {
  const r = resolve(placement.variantId);
  const product = r?.product;
  const footprint: Footprint = product ? resolveFootprint(product) : { kind: "rect", widthMm: 600, depthMm: 600 };
  const content = product ? resolveContent(product) : { mode: "name" as const, name: r?.label ?? "פריט" };
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
  const badge = 340;

  return (
    <g
      {...draggable({ x, y }, ctx, drag)}
      transform={`translate(${x} ${y})${placement.rotation ? ` rotate(${placement.rotation})` : ""}${scale !== 1 ? ` scale(${scale})` : ""}`}
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
        fill={selected ? "var(--color-accent-tint)" : "var(--color-surface)"}
        stroke={selected ? "var(--color-accent)" : "var(--color-border)"}
        strokeWidth={selected ? 4 : 2}
        vectorEffect="non-scaling-stroke"
      />

      {content.mode === "name" && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-ink)"
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
          transform={`translate(${-iconSize / 2} ${-iconSize / 2}) scale(${iconSize / 24})`}
          className="pointer-events-none"
        >
          {createElement(Icon, {
            width: 24,
            height: 24,
            color: selected ? "var(--color-accent)" : "var(--color-ink-soft)",
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
          <text
            x={-bounds.w / 2 + 40 + badge / 2}
            y={bounds.h / 2 - badge / 2 - 40}
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
