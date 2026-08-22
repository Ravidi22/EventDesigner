"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Building2,
  ChevronUp,
  DoorOpen,
  GlassWater,
  MousePointer2,
  PenLine,
  Plus,
  Presentation,
  Search as SearchIcon,
  Shapes,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { polygonCentroid } from "@/lib/studio/geometry";
import {
  DEFAULT_VENUES,
  DEFAULT_ZONES,
  loadActiveVenueId,
  loadStructure,
  loadVenues,
  onActiveVenueChange,
  saveStructure,
  saveZonesForVenue,
  structureForVenue,
  zonesForVenue,
  type Venue,
  type VenueStructure,
  type Zone,
} from "@/lib/venues/storage";
import {
  FEATURE_KIND_LABEL,
  addEntrance,
  addFeature,
  addNode,
  addWall,
  bulgeWall,
  moveNode,
  moveWallControlPoint,
  nearestWall,
  newFeature,
  removeEntrance,
  removeFeature,
  removeNode,
  removeWall,
  updateFeature,
  updateStairs,
  type WallKind,
} from "@/lib/venues/structure";
import { stairsPlacementAt } from "@/lib/venues/stairs";
import { detectFaces, faceAt } from "@/lib/venues/faces";
import {
  ZONE_KIND_LABEL,
  newZone,
  resolveZones,
  zoneAreaM2,
  zoneBounds,
  type ZoneKind,
  type ZoneSource,
} from "@/lib/venues/zone";
import { ZoneRegions, StructureFeatures, StructureDoors } from "@/components/venue-plan";
import { VenueInspector, ZoneFields, FEATURE_KINDS } from "@/components/venue-inspector";
import {
  hitsInBox,
  isSelected,
  mergeSelection,
  toggleSelection,
  type PlanSelection,
  type SelectionBox,
} from "@/lib/venues/selection";
import { PlanCanvas, type CanvasFocus } from "@/components/plan-canvas";
import { useHistory } from "@/lib/studio/use-history";
import { isAdditiveClick, isTypingTarget } from "@/lib/keyboard";
import type { Point } from "@/lib/studio/hall";

// Everything one Ctrl+Z has to be able to take back, in one snapshot. The structure and the zones
// are edited in the same breath — draw a wall, name the room it just closed — so two separate
// histories would let undo step back through them in an order that never happened.
interface PlanState {
  venueId: string; // travels with the snapshot so a venue switch can't persist the outgoing plan under the incoming id
  structure: VenueStructure;
  zones: Zone[];
}

type Mode = "select" | "walls" | "zones";

// What the floating add-toolbar offers: the same six things the old right-click menu did (an
// entrance plus every FEATURE_KINDS member), each keyed to a distinct icon so the row reads at a
// glance instead of six identical squares.
type AddTool = "entrance" | (typeof FEATURE_KINDS)[number];
const ADD_TOOL_ICON: Record<AddTool, LucideIcon> = {
  entrance: DoorOpen,
  pool: Waves,
  stage: Presentation,
  bar: GlassWater,
  structure: Box,
  other: Shapes,
};
const ADD_TOOL_LABEL: Record<AddTool, string> = { entrance: "כניסה", ...FEATURE_KIND_LABEL };
const ADD_TOOLS: AddTool[] = ["entrance", ...FEATURE_KINDS];
// A pastel swatch per kind, so the picker's cards read as a little gallery of colours rather than
// six identical grey tiles — there's no product photo to preview, so the colour + icon combination
// is standing in for one.
const ADD_TOOL_PREVIEW: Record<AddTool, string> = {
  entrance: "#f3c6d6",
  pool: "#bcdcf5",
  stage: "#f6df9b",
  bar: "#f3c99b",
  structure: "#d9d1f2",
  other: "#c7e8cf",
};

// A solid dot per zone kind, for the sidebar list — a saturated sibling to venue-plan.tsx's own
// ZONE_FILL, which is deliberately pale (it tints a whole room on the plan, not a 12px legend dot
// that pale would just read as grey). Kept local rather than exported/shared: the plan's tint and
// the list's dot are allowed to diverge exactly here, since only one of them has to stay print-safe.
const ZONE_DOT_COLOR: Record<ZoneKind, string> = {
  hall: "var(--color-accent)",
  canopy: "#5b9bd5",
  open: "var(--color-success)",
  service: "var(--color-muted)",
};

const MODES: { id: Mode; label: string; icon: typeof MousePointer2; hint: string }[] = [
  {
    id: "select",
    label: "בחירה",
    icon: MousePointer2,
    hint: "לחצו על קיר, פינה, כניסה או אזור כדי לערוך אותו · גררו פינה כדי להזיז את כל הקירות שנוגעים בה · גררו את היהלום שבאמצע הקיר כדי לעקם אותו · הוסיפו אלמנטים מסרגל הכלים בתחתית",
  },
  {
    id: "walls",
    label: "שרטוט קירות",
    icon: PenLine,
    hint: "לחצו להנחת פינה · הקלידו אורך מדויק · Enter לסיום",
  },
  {
    id: "zones",
    label: "הגדרת אזורים",
    icon: Shapes,
    hint: "לחצו בשטח סגור לשם · לשטח פתוח: ״סימון שטח״",
  },
];

export function HallsScreen() {
  const [venues, setVenues] = useState<Venue[]>(DEFAULT_VENUES);
  const [venueId, setVenueId] = useState<string>(DEFAULT_VENUES[0].id);
  // Seeded from the static sample so server and first client render agree (storage is client-only).
  const hist = useHistory<PlanState>(
    () => ({
      venueId: DEFAULT_VENUES[0].id,
      structure: structureForVenue(DEFAULT_VENUES[0].id),
      zones: DEFAULT_ZONES.filter((z) => z.venueId === DEFAULT_VENUES[0].id),
    }),
    { keyboard: true },
  );
  const { structure, zones } = hist.present;

  const [mode, setMode] = useState<Mode>("select");
  const [selection, setSelection] = useState<PlanSelection[]>([]);
  const [wallKind, setWallKind] = useState<WallKind>("wall");
  const [runNodeId, setRunNodeId] = useState<string | null>(null); // last corner of the wall run in progress
  const [region, setRegion] = useState<Point[] | null>(null); // freehand zone boundary in progress
  const [draftZone, setDraftZone] = useState<{ source: ZoneSource; name: string; kind: ZoneKind } | null>(null);
  // Which add-toolbar button is armed, if any — the next click on empty canvas places one of it and
  // disarms, the same one-shot placement the old right-click menu gave (see the toolbar and
  // onCanvasClick below). Only meaningful in "select" mode; every mode switch clears it.
  const [armedTool, setArmedTool] = useState<AddTool | null>(null);
  // The add-element flyout — closed by picking a row (which arms it), by Escape, or by a click
  // anywhere else (see the backdrop next to it).
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [focus, setFocus] = useState<CanvasFocus | null>(null);
  const focusNonce = useRef(0);
  const [ready, setReady] = useState(false); // storage has been read; before this, nothing is written back
  // Position, inside the canvas, of the floating instruction tooltip that follows the cursor while a
  // drawing tool is armed — null (and so unrendered) the instant the pointer leaves the canvas or the
  // tool goes back to "select", rather than lingering at its last spot. `w` is the canvas's own
  // measured width, so the tooltip can flip to the cursor's other side near the edge instead of
  // running past it and getting clipped by the canvas's own overflow-hidden.
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; w: number } | null>(null);
  // Hover state for the region tool's closing target — the first vertex, once the boundary has
  // enough points to close. Purely cosmetic (a bigger, brighter dot), so a plain boolean is enough.
  const [hoverCloseRegion, setHoverCloseRegion] = useState(false);
  // Whichever of the several setRegion(null) call sites ends a region (Enter, a near-first-vertex
  // click, Esc, the toggle button), the hover ring shouldn't outlive it and greet the next one already lit.
  useEffect(() => {
    if (region === null) setHoverCloseRegion(false);
  }, [region]);
  // 16 screen px worth of world mm at the current zoom, refreshed every render from inside the
  // canvas's backdrop (the only place a px→mm conversion is available) and read back from onPick,
  // which only ever sees mm points — this is how a click "near" the first vertex gets detected at
  // all zoom levels instead of only at one fixed mm radius.
  const closeSnapMmRef = useRef(16);

  useEffect(() => {
    setVenues(loadVenues());
    setVenueId(loadActiveVenueId());
  }, []);
  useEffect(() => onActiveVenueChange(setVenueId), []);

  useEffect(() => {
    const loaded = loadStructure(venueId);
    hist.reset({ venueId, structure: loaded, zones: zonesForVenue(venueId) });
    setSelection([]);
    setRunNodeId(null);
    setRegion(null);
    setDraftZone(null);
    setFocus(null);
    // A property with nothing drawn on it has nothing to select or name — open on the one tool that
    // can make progress rather than on an empty grid with the wrong tool in hand.
    setMode(loaded.walls.length === 0 ? "walls" : "select");
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  // Persist whatever the history currently holds — including after an undo, which is the reason
  // zones are written as a whole list (a snapshot has no per-zone delete to replay).
  useEffect(() => {
    if (!ready) return;
    saveStructure(hist.present.venueId, hist.present.structure);
    saveZonesForVenue(hist.present.venueId, hist.present.zones);
  }, [ready, hist.present]);

  // Regions are derived from the walls on every change, never stored — that is what makes a zone
  // follow its walls when they move instead of keeping a stale copy of its own outline.
  const faces = useMemo(() => detectFaces(structure), [structure]);
  const resolved = useMemo(() => resolveZones(zones, faces), [zones, faces]);

  const editStructure = useCallback(
    (fn: (s: VenueStructure) => VenueStructure) => hist.set((p) => ({ ...p, structure: fn(p.structure) })),
    [hist],
  );
  // A drag: the first move opens the entry, every later one overwrites it, `commit` closes it — so
  // dragging a corner across the plan is one undo step, not two hundred.
  const dragStructure = useCallback(
    (fn: (s: VenueStructure) => VenueStructure) => hist.amend((p) => ({ ...p, structure: fn(p.structure) })),
    [hist],
  );
  const editZones = useCallback(
    (fn: (z: Zone[]) => Zone[]) => hist.set((p) => ({ ...p, zones: fn(p.zones) })),
    [hist],
  );

  // --- selection ---------------------------------------------------------------------------------
  // One list covering every kind of thing on the plan. The canvas owns walls and corners (it draws
  // them) and reports them through onSelectGraph; zones, doors and features are host-drawn layers
  // and report themselves — but they all land here, so a marquee across a room hands back its
  // walls, its tint and its door as one selection. The rules themselves live in lib/venues/selection.
  const pick = useCallback((ref: PlanSelection | null, additive: boolean) => {
    setSelection((cur) => toggleSelection(cur, ref, additive));
  }, []);

  const deleteSelection = useCallback(() => {
    if (selection.length === 0) return;
    const refs = selection;
    setSelection([]);
    const zoneIds = refs.filter((r) => r.kind === "zone").map((r) => r.id);
    if (zoneIds.length) editZones((zs) => zs.filter((z) => !zoneIds.includes(z.id)));
    if (refs.some((r) => r.kind !== "zone")) {
      // Walls first, then corners: removing a corner already takes its walls, and doing it the
      // other way round would leave the wall pass reaching for ids that are no longer there.
      editStructure((st) => {
        let next = st;
        for (const r of refs) if (r.kind === "wall") next = removeWall(next, r.id);
        for (const r of refs) if (r.kind === "door") next = removeEntrance(next, r.id);
        for (const r of refs) if (r.kind === "feature") next = removeFeature(next, r.id);
        for (const r of refs) if (r.kind === "node") next = removeNode(next, r.id);
        return next;
      });
    }
  }, [selection, editStructure, editZones]);

  // A marquee catches everything on the plan, not just one layer of it. The canvas hands over the
  // box rather than the hits — the graph and the tinted regions are both this screen's data, so
  // this is the only place that could test them.
  const marqueeSelect = useCallback(
    (box: SelectionBox, additive: boolean) =>
      setSelection((cur) => mergeSelection(cur, hitsInBox(structure, resolved, box), additive)),
    [structure, resolved],
  );

  // One live group drag: every selected corner's and feature's position, frozen when the gesture
  // starts, so the whole group is re-derived each frame from one shared delta off fixed origins
  // rather than drifting from repeated relative nudges.
  const groupDrag = useRef<{
    anchor: Point;
    nodes: { id: string; x: number; y: number }[];
    features: { id: string; x: number; y: number }[];
  } | null>(null);

  const moveWithGroup = useCallback(
    (kind: "node" | "feature", id: string, p: Point) => {
      if (!(selection.length > 1 && isSelected(selection, kind, id))) {
        dragStructure((s) => (kind === "node" ? moveNode(s, id, p) : updateFeature(s, id, { x: p.x, y: p.y })));
        return;
      }
      if (!groupDrag.current) {
        const nodes = selection.flatMap((r) =>
          r.kind === "node" ? structure.nodes.filter((n) => n.id === r.id).map((n) => ({ id: n.id, x: n.x, y: n.y })) : [],
        );
        const features = selection.flatMap((r) =>
          r.kind === "feature" ? structure.features.filter((f) => f.id === r.id).map((f) => ({ id: f.id, x: f.x, y: f.y })) : [],
        );
        const anchor = [...nodes, ...features].find((m) => m.id === id);
        if (!anchor) return;
        groupDrag.current = { anchor: { x: anchor.x, y: anchor.y }, nodes, features };
      }
      const g = groupDrag.current;
      const dx = p.x - g.anchor.x;
      const dy = p.y - g.anchor.y;
      dragStructure((s) => {
        let next = s;
        for (const n of g.nodes) next = moveNode(next, n.id, { x: Math.round(n.x + dx), y: Math.round(n.y + dy) });
        for (const f of g.features) next = updateFeature(next, f.id, { x: Math.round(f.x + dx), y: Math.round(f.y + dy) });
        return next;
      });
    },
    [selection, structure, dragStructure],
  );

  // Dragging a stage's stairs. The layer reports the world point they were dropped on; which edge of
  // the deck that is — and how far along it — is the model's answer, so a flight dragged round a
  // corner re-hangs itself on the side the pointer went out of instead of drifting off the stage.
  const moveStairs = useCallback(
    (id: string, p: Point) => {
      const feature = structure.features.find((f) => f.id === id);
      if (!feature) return;
      dragStructure((s) => updateStairs(s, id, stairsPlacementAt(feature, p)));
    },
    [structure, dragStructure],
  );

  // Dragging one of a feature's resize handles — the layer has already done the geometry (which
  // edge stays anchored, whether Shift is locking width:depth together), this just amends it into
  // the live drag's history entry the same way every other in-progress edit on this plan does.
  const resizeFeature = useCallback(
    (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => {
      dragStructure((s) => updateFeature(s, id, patch));
    },
    [dragStructure],
  );

  // End of one gesture: close the history entry and drop the frozen origins together, so the next
  // drag can't reuse a snapshot taken before this one moved everything.
  const endGesture = useCallback(() => {
    groupDrag.current = null;
    hist.commit();
  }, [hist]);

  // Shared by Enter and by clicking back near the first vertex (in onPick, below) — the two ways to
  // close a region boundary. Takes the boundary as an argument rather than reading `region` itself so
  // a caller that already has the point-to-close-with in hand doesn't need a redundant state update.
  const finishRegion = useCallback((boundary: Point[]) => {
    setDraftZone({ source: { type: "region", boundary }, name: "", kind: "open" });
    setRegion(null);
  }, []);

  // Esc still ends a wall run or abandons a half-drawn region (and always clears the selection) —
  // but Enter is the documented way to finish a wall run now, closer to how Enter closes a region
  // a few lines down than to a "cancel" key. Delete removes whatever is selected. The typing guard
  // is load-bearing on that last one — without it, a Backspace while correcting a zone's name
  // would delete the zone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRunNodeId(null);
        setRegion(null);
        setDraftZone(null);
        setSelection([]);
        setArmedTool(null);
        setAddMenuOpen(false);
        return;
      }
      if (isTypingTarget()) return;
      if (e.key === "Enter" && mode === "walls" && runNodeId) {
        e.preventDefault();
        setRunNodeId(null);
      } else if (e.key === "Enter" && region && region.length >= 3) {
        finishRegion(region);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection.length > 0) {
        e.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, runNodeId, region, selection, deleteSelection, finishRegion]);

  // PlanCanvas reports an already-snapped point — its own zoom-adaptive grid step plus alignment
  // against every existing corner — so this only decides what a click *means* in the current mode.
  // Nothing re-rounds that point: a length typed into the canvas's value box arrives exact, and a
  // second snap here would quietly throw those digits away.
  const onPick = (p: Point) => {
    if (region) {
      // Clicking back near the first vertex closes the boundary, exactly like Enter — the outline
      // tool elsewhere in this canvas already works this way; this is the same affordance for a
      // freehand region. Distance is compared in mm, using a threshold that itself tracks the current
      // zoom (see closeSnapMmRef), so "near" means the same 16px at any scale.
      if (region.length >= 3 && Math.hypot(p.x - region[0].x, p.y - region[0].y) <= closeSnapMmRef.current) {
        finishRegion(region);
        return;
      }
      setRegion([...region, p]);
      return;
    }

    if (mode === "walls") {
      // Clicking an existing corner reuses it rather than stacking a new one on top — this is how
      // walls come to share endpoints, and therefore how enclosed areas ever get detected.
      const { structure: withNode, nodeId } = addNode(structure, p);
      editStructure(() => (runNodeId ? addWall(withNode, runNodeId, nodeId, wallKind) : withNode));
      setRunNodeId(nodeId);
      return;
    }

    if (mode === "zones") tryNameEnclosedFace(p);
  };

  // Clicking an already-enclosed, not-yet-named area starts naming it — pulled out so both the old
  // "zones" mode (still reachable mid-region, or from anywhere else that calls onPick) and a plain
  // select-mode click on the canvas (see onCanvasClick below) share the one rule for what counts as
  // "click a room to name it", instead of a dedicated mode being the only door to it.
  const tryNameEnclosedFace = (p: Point): boolean => {
    const face = faceAt(faces, p);
    if (!face) return false; // nothing enclosed here — the region tool is the way to name open ground
    const taken = resolved.some((r) => r.zone.source.type === "face" && faceAt(faces, r.zone.source.anchor) === face);
    if (taken) return false;
    setDraftZone({ source: { type: "face", anchor: p }, name: "", kind: "hall" });
    return true;
  };

  const saveDraftZone = () => {
    if (!draftZone || !draftZone.name.trim()) return;
    const zone = newZone(venueId, draftZone.kind, draftZone.source, draftZone.name.trim());
    editZones((z) => [...z, zone]);
    setDraftZone(null);
    setSelection([{ kind: "zone", id: zone.id }]);
  };

  const patchZone = (id: string, patch: Partial<Zone>) =>
    editZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const removeZone = (id: string) => {
    editZones((zs) => zs.filter((z) => z.id !== id));
    setSelection((s) => s.filter((r) => !(r.kind === "zone" && r.id === id)));
  };

  /** Frames a zone in the canvas. Called from the list, not from the canvas: clicking the shape on
   *  the plan means you are already looking at it, and re-framing under the pointer would be a
   *  jump the user didn't ask for. */
  const focusZone = (zoneId: string) => {
    const r = resolved.find((x) => x.zone.id === zoneId);
    if (!r || r.boundary.length < 3) return;
    const b = zoneBounds(r);
    if (b.widthMm <= 0 && b.heightMm <= 0) return;
    focusNonce.current += 1;
    setFocus({ minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY, nonce: focusNonce.current });
  };

  const venue = venues.find((v) => v.id === venueId);
  const namedFaces = resolved.filter((r) => r.zone.source.type === "face" && !r.detached).length;
  const unnamed = Math.max(0, faces.length - namedFaces);
  const activeMode = MODES.find((m) => m.id === mode)!;
  const runNode = runNodeId ? structure.nodes.find((n) => n.id === runNodeId) : null;
  const selectedZoneIds = selection.filter((s) => s.kind === "zone").map((s) => s.id);
  const soleZoneId = selection.length === 1 && selection[0].kind === "zone" ? selection[0].id : null;
  const soleFeatureId = selection.length === 1 && selection[0].kind === "feature" ? selection[0].id : null;
  const isSelectMode = mode === "select";

  // Selecting a product on the plan — a stage, a bar, a pool — frames it the same way picking a
  // zone from the list does (see focusZone): the object you just picked is the thing you're about
  // to edit, so the view should already be centred on it rather than leaving that to a manual pan,
  // and the inspector (docked at the canvas's top edge, see below) can never land on top of
  // something that's sitting dead centre.
  useEffect(() => {
    if (!soleFeatureId) return;
    const f = structure.features.find((x) => x.id === soleFeatureId);
    if (!f) return;
    const halfW = f.widthMm / 2;
    const halfD = (f.shape === "circle" ? f.widthMm : f.depthMm) / 2;
    focusNonce.current += 1;
    setFocus({ minX: f.x - halfW, minY: f.y - halfD, maxX: f.x + halfW, maxY: f.y + halfD, nonce: focusNonce.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soleFeatureId]);
  const graphSelection = useMemo(
    () =>
      selection
        .filter((s): s is PlanSelection & { kind: "node" | "wall" } => s.kind === "node" || s.kind === "wall")
        .map((s) => ({ kind: s.kind, id: s.id })),
    [selection],
  );

  const addFeatureAt = (kind: (typeof FEATURE_KINDS)[number], p: Point) => {
    const { structure: next, featureId } = addFeature(structure, newFeature(kind, p));
    editStructure(() => next);
    setSelection([{ kind: "feature", id: featureId }]);
  };

  const addDoorNear = (p: Point) => {
    const hit = nearestWall(structure, p);
    if (!hit) return;
    const wall = structure.walls.find((w) => w.id === hit.wallId);
    if (!wall || wall.kind === "edge") return; // a boundary line is not something you hang a door on
    const { structure: next, entranceId } = addEntrance(structure, {
      wallId: hit.wallId,
      distanceMm: hit.distanceMm,
      widthMm: 1600,
      swingInward: true,
      doubleDoor: true,
    });
    editStructure(() => next);
    setSelection([{ kind: "door", id: entranceId }]);
  };

  // What an armed add-toolbar button means once the next canvas click reports a point — the same
  // two placement paths the old right-click menu items called, now behind one-shot arming instead
  // of a menu that already had the point in hand. Always disarms after one placement, matching how
  // the menu closed itself the moment you picked something.
  const placeArmedTool = (p: Point) => {
    if (!armedTool) return;
    if (armedTool === "entrance") addDoorNear(p);
    else addFeatureAt(armedTool, p);
    setArmedTool(null);
  };

  // A plain click on empty canvas, in select mode. With a tool armed it places it (unchanged); with
  // none armed, it's now also how a room gets named — landing inside an enclosed, unnamed area
  // starts naming it, the same thing the old dedicated "zones" mode's own click did. That mode's own
  // top-level toggle is gone (see the header row above); this is what keeps "click a room to name
  // it" reachable without it, straight from the mode you're already in for everything else.
  const onSelectModeCanvasClick = (p: Point) => {
    if (armedTool) { placeArmedTool(p); return; }
    tryNameEnclosedFace(p);
  };

  return (
    <div className="flex h-full flex-col p-4">
      {/* A real two-column layout: the zone-definition list is a dedicated sidebar next to the
          canvas, not a layer floating on top of it (see the aside at the end). No header row above
          either of them any more — "הגדרת אזורים" isn't a mode you switch into any more (see
          onSelectModeCanvasClick above: naming an enclosed room now works straight from select
          mode) and its "סימון שטח פתוח" companion is fully covered by the sidebar's own "+ שרטוט
          אזור חדש", which already both arms the region tool and starts drawing in one click. With
          nothing above them, the canvas and the sidebar's tops align for free — no shared grid row
          needed just to keep them level.
          min-h-0 flex-1 on the grid (rather than a guessed vh height) is what makes the canvas fill
          every bit of vertical space this page has — a fixed vh number always either overshoots
          (forcing the page itself to scroll under a supposedly-fixed layout) or leaves a gap under
          the fold, depending on the viewport's actual height once the chrome above it is accounted
          for. min-h-0 is load-bearing: without it a grid row won't shrink below its content's
          natural size, and the canvas's own min-h-96 would then win a fight with "fill exactly what
          remains" instead of losing to it gracefully once space is tight. */}
      <div className="grid min-h-0 flex-1 gap-x-4 gap-y-3 lg:grid-cols-[1fr_300px]">
        <section
          className="relative min-h-96 overflow-hidden rounded-md border border-border bg-accent-tint lg:h-full lg:min-h-0"
          onPointerMove={(e) => {
            if (mode === "select") return;
            const r = e.currentTarget.getBoundingClientRect();
            setCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
          }}
          onPointerLeave={() => setCursorPos(null)}
        >
          {/* The venue's name, floating on the canvas itself — white, so it reads as its own chip
              sitting on the purple canvas rather than blending into it. */}
          <div className="pointer-events-none absolute right-4 top-4 z-10 inline-flex w-fit shrink-0 items-center gap-2 rounded-md border border-border bg-canvas px-4 py-2 text-sm font-bold text-accent-deep shadow-floating">
            <Building2 className="h-4 w-4 text-accent" strokeWidth={1.75} />
            {venue?.name ?? "מקום"}
          </div>

            {/* The app's one canvas. It owns the viewport, grid, pan/zoom, snapping, undo buttons and
                the wall graph itself; this screen supplies only the zone tints beneath, the doors
                above, and what a click means in the current mode. */}
          <PlanCanvas
            mode={isSelectMode ? "edit" : "draw"}
            outline={[]}
            edgeCurves={[]}
            selected={[]}
            onSelect={() => setSelection([])}
            onAddVertex={onPick}
            onCloseOutline={() => {}}
            onCancelDraw={() => {
              setRunNodeId(null);
              setRegion(null);
            }}
            onMoveVertex={() => {}}
            onMoveWallHandle={() => {}}
            graph={structure}
            onMoveGraphNode={isSelectMode ? (id, p) => moveWithGroup("node", id, p) : undefined}
            // Bowing a wall is a drag like any other: amended into one history entry, closed by
            // onCommit. A wall is bowed in place — no node moves — so the rooms either side of a
            // shared wall follow the curve together, exactly as they follow a dragged corner.
            onCurveGraphWall={
              isSelectMode
                ? (wallId, which, p) =>
                    dragStructure((s) =>
                      which === "bulge" ? bulgeWall(s, wallId, p) : moveWallControlPoint(s, wallId, which, p),
                    )
                : undefined
            }
            graphSelection={graphSelection}
            onSelectGraph={isSelectMode ? (ref, additive) => pick(ref, additive) : undefined}
            onMarquee={isSelectMode ? marqueeSelect : undefined}
            onCommit={endGesture}
            canUndo={hist.canUndo}
            canRedo={hist.canRedo}
            onUndo={hist.undo}
            onRedo={hist.redo}
            focus={focus}
            drawFrom={region?.length ? region[region.length - 1] : runNode ? { x: runNode.x, y: runNode.y } : null}
            // The floating add-toolbar arms one of these instead of a right-click menu handing over
            // a point directly — so placement goes through the same "next empty-canvas click" path
            // every other click-to-place tool on this canvas already uses.
            cursor={armedTool ? "crosshair" : "default"}
            onCanvasClick={isSelectMode ? onSelectModeCanvasClick : undefined}
            // The grid pattern's own line colour is tuned for the white bg-canvas every other host
            // still uses; against this screen's own light-purple canvas it was nearly invisible
            // (text-border and accent-tint sit a hair apart in value). accent-line is the same
            // family, several steps darker, chosen for contrast against this one background.
            gridColorClassName="text-accent-line"
            onDropAt={
              isSelectMode
                ? (e, p) => {
                    const kind = e.dataTransfer.getData("text/plain") as AddTool | "";
                    if (kind === "entrance") addDoorNear(p);
                    else if (kind && (FEATURE_KINDS as string[]).includes(kind)) addFeatureAt(kind as (typeof FEATURE_KINDS)[number], p);
                  }
                : undefined
            }
            backdrop={({ clientToMm, mm }) => {
              closeSnapMmRef.current = mm(16); // 16px, matching the outline tool's own SNAP_PX
              const closable = region !== null && region.length >= 3;
              return (
                <>
                  <ZoneRegions
                    zones={resolved}
                    selectedIds={selectedZoneIds}
                    onSelect={isSelectMode ? (id, additive) => pick({ kind: "zone", id }, additive) : undefined}
                    mm={mm}
                  />
                  <StructureFeatures
                    structure={structure}
                    mm={mm}
                    selectedIds={selection.filter((s) => s.kind === "feature").map((s) => s.id)}
                    onSelect={isSelectMode ? (id, additive) => pick({ kind: "feature", id }, additive) : undefined}
                    onMove={isSelectMode ? (id, p) => moveWithGroup("feature", id, p) : undefined}
                    onMoveStairs={isSelectMode ? moveStairs : undefined}
                    onResize={isSelectMode ? resizeFeature : undefined}
                    onCommit={endGesture}
                    clientToMm={clientToMm}
                  />
                  {region && region.length > 1 && (
                    <polyline
                      points={[...region, region[0]].map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="var(--color-accent-tint)"
                      fillOpacity={0.6}
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {/* A dot per placed point — without this, a first click gave no feedback at all:
                      one point makes a zero-length polyline (invisible), so the boundary looked like
                      it hadn't registered anything until a second click finally drew a line. The
                      first vertex doubles as the closing target once the boundary can close, with a
                      hover ring — the same "click here to finish" affordance the outline tool gives
                      Studio/catalog shapes, ported to this freehand region. */}
                  {region && region.length > 0 && (
                    <g>
                      {region.map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r={mm(i === 0 && closable ? (hoverCloseRegion ? 10 : 7) : 5)}
                          className="text-accent"
                          fill="currentColor"
                        />
                      ))}
                      {closable && hoverCloseRegion && (
                        <circle
                          cx={region[0].x}
                          cy={region[0].y}
                          r={mm(15)}
                          className="text-accent"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {closable && (
                        <circle
                          cx={region[0].x}
                          cy={region[0].y}
                          r={mm(16)}
                          fill="transparent"
                          className="cursor-pointer"
                          onPointerEnter={() => setHoverCloseRegion(true)}
                          onPointerLeave={() => setHoverCloseRegion(false)}
                        />
                      )}
                    </g>
                  )}
                </>
              );
            }}
            overlay={
              <StructureDoors
                structure={structure}
                selectedIds={selection.filter((s) => s.kind === "door").map((s) => s.id)}
                onSelect={isSelectMode ? (id, additive) => pick({ kind: "door", id }, additive) : undefined}
              />
            }
          />

          {/* A short instruction that follows the cursor while a drawing tool is armed — reading it
              never means looking away from the shape you're mid-way through drawing. Flips to the
              cursor's other side once it's within its own width of the canvas edge, so it can never
              run past the canvas's own overflow-hidden and get clipped mid-word. */}
          {mode !== "select" && cursorPos && (
            <div
              className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-canvas shadow-lifted"
              style={
                cursorPos.x > cursorPos.w - 260
                  ? { right: cursorPos.w - cursorPos.x + 16, top: cursorPos.y + 18 }
                  : { left: cursorPos.x + 16, top: cursorPos.y + 18 }
              }
            >
              {region !== null ? "הקיפו בנקודות · Enter לסגירה · Esc לביטול" : activeMode.hint}
            </div>
          )}

          {/* The bottom dock — one toolbar, not two side by side: "שרטוט קירות" (with its
              wall/boundary sub-control inline beside it, walls mode only), then a divider, then the
              add-element trigger (select mode only) and the pointer, always at the far end. */}
          <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-border bg-surface p-1 shadow-floating">
              <button
                type="button"
                title="שרטוט קירות"
                onClick={() => {
                  setMode("walls");
                  setRunNodeId(null);
                  setRegion(null);
                  setDraftZone(null);
                  setArmedTool(null);
                  setAddMenuOpen(false);
                  setSelection([]);
                }}
                aria-pressed={mode === "walls"}
                className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  mode === "walls" ? "bg-accent-tint text-accent" : "text-muted hover:bg-inset"
                }`}
              >
                <PenLine className="h-[18px] w-[18px]" strokeWidth={1.4} />
                שרטוט
              </button>

              {mode === "walls" && (
                <>
                  <div className="mx-0.5 h-5 w-px bg-border" />
                  {(["wall", "edge"] as WallKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setWallKind(k)}
                      aria-pressed={wallKind === k}
                      className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                        wallKind === k ? "bg-accent-tint font-bold text-accent" : "font-semibold text-muted hover:bg-inset"
                      }`}
                    >
                      {k === "wall" ? "קיר" : "גבול שטח"}
                    </button>
                  ))}
                </>
              )}

              <div className="mx-0.5 h-5 w-px bg-border" />

              {isSelectMode && (
                <>
                  <AddElementFlyout
                    open={addMenuOpen}
                    onOpenChange={setAddMenuOpen}
                    armedTool={armedTool}
                    onPick={(tool) => {
                      setArmedTool((t) => (t === tool ? null : tool));
                      setAddMenuOpen(false);
                    }}
                    entranceDisabled={!structure.walls.some((w) => w.kind === "wall")}
                  />
                  <div className="mx-0.5 h-5 w-px bg-border" />
                </>
              )}
              <button
                type="button"
                title="מצב בחירה"
                aria-pressed={isSelectMode && !armedTool}
                onClick={() => {
                  if (!isSelectMode) {
                    setMode("select");
                    setRunNodeId(null);
                    setRegion(null);
                    setDraftZone(null);
                  }
                  setArmedTool(null);
                  setAddMenuOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  isSelectMode && !armedTool ? "bg-accent-tint text-accent" : "text-muted hover:bg-inset"
                }`}
              >
                <MousePointer2 className="h-[18px] w-[18px]" strokeWidth={1.6} />
                בחירה
              </button>
            </div>
          </div>

          {/* Docked on the canvas's own right edge, top to bottom — not a bar spanning the width,
              which would sit directly over whatever it's editing. Selecting a product recentres the
              view on it (see the soleFeatureId effect above), so the drawing stays visible beside
              this panel rather than under it. Just the width and height ceiling live here; the
              vertical stacking and its own scroll are VenueInspector's own shell (see its WRAP) —
              stacking a second overflow-y-auto on top of that one would be the exact nested-
              scrollbar bug the sidebar list already had once this session.
              h-full, not max-h-full: a max-height alone never establishes a *definite* height, so
              VenueInspector's own max-h-full (a percentage) had nothing real to resolve against and
              was silently ignored — the panel just grew past the canvas with no cap and no scroll,
              which is exactly the cut-off-content bug this was for. h-full gives this wrapper an
              actual height children can size a percentage against; the wrapper itself stays
              invisible either way (no border/background of its own), and VenueInspector's own panel
              still sizes to its content — short selections don't get stretched, they just have real
              room to scroll into once they don't. A lone zone is the one selection with nothing to
              show here: its fields live in the list. */}
          {!soleZoneId && selection.length > 0 && (
            <div className="pointer-events-none absolute inset-y-4 right-4 z-10 flex items-start justify-end">
              <div className="pointer-events-auto h-full w-72">
                <VenueInspector
                  selection={selection}
                  structure={structure}
                  apply={editStructure}
                  onDelete={deleteSelection}
                  onClose={() => setSelection([])}
                />
              </div>
            </div>
          )}

        </section>

        {/* The zone-definition list — a dedicated sidebar column next to the canvas, not a layer
            floating on top of it (that was tried and explicitly walked back). bg-bg on the aside
            itself is the same neutral plane colour every card elsewhere in the app sits on, giving
            the white card inside it a visible border of separation from the canvas beside it —
            "sidebar container (own background) → card → canvas next to it", not glued onto it.
            Full height now (lg:h-full, matching the canvas's own lg:h-full next to it), not sized
            to the card's own content — a short zone list just leaves the panel's own background
            showing below the card rather than the panel itself shrinking to hug it, which is what
            actually reads as "a sidebar", as opposed to "a card that happens to have a border". A
            list too long for that fixed height scrolls inside the panel (overflow-y-auto) instead
            of growing the page, now that the panel has a real height to scroll within. */}
        <aside className="flex flex-col overflow-y-auto rounded-lg bg-bg p-4 lg:col-start-2 lg:h-full">
          {/* A looser, more tightly-inset version of the app's own shadow-floating recipe (same
              purple-tinted, negative-spread idea — see --shadow-floating in globals.css — just
              pulled further down and blurred wider) for this one card specifically, rather than
              retuning the shared token every other floating panel in the app also uses. */}
          <div
            className="flex flex-col gap-2.5 rounded-lg border border-border bg-canvas p-3.5"
            style={{ boxShadow: "0 10px 26px -20px rgba(70,40,130,.5)" }}
          >
                <div>
                  {/* Title and badge share this one row (and nothing else), so items-center has
                      only their own single-line heights to centre against — sharing a row with the
                      two-line description too (as this used to) centres the badge against that
                      *combined* block instead, landing it between the two lines rather than level
                      with the title. */}
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-ink">הגדרת אזורים</h2>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-inset text-xs font-semibold text-muted">
                      {zones.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    חלקו את המתחם לאזורים תפקודיים — לכל אחד שם, צבע ושטח.
                  </p>
                </div>

                {/* Naming panel — appears the moment an area is picked. A tinted card standing out
                    against the list's own white, the reverse of when the list itself was purple. */}
                {draftZone && (
                  <div className="rounded-md border border-accent-line bg-accent-tint p-3.5">
                    <h3 className="mb-2 text-sm font-bold text-accent-deep">
                      {draftZone.source.type === "face" ? "מתן שם לשטח הסגור" : "מתן שם לשטח המסומן"}
                    </h3>
                    <input
                      autoFocus
                      value={draftZone.name}
                      onChange={(e) => setDraftZone({ ...draftZone, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && saveDraftZone()}
                      placeholder="שם האזור"
                      className="w-full rounded-sm border border-border bg-canvas px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
                    />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(Object.keys(ZONE_KIND_LABEL) as ZoneKind[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setDraftZone({ ...draftZone, kind: k })}
                          aria-pressed={draftZone.kind === k}
                          className={`rounded-pill border px-2.5 py-1 text-[11px] transition-colors ${
                            draftZone.kind === k ? "border-accent bg-accent text-white" : "border-badge-line bg-canvas text-muted"
                          }`}
                        >
                          {ZONE_KIND_LABEL[k]}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={saveDraftZone}
                        disabled={!draftZone.name.trim()}
                        className="rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        שמירה
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftZone(null)}
                        className="rounded-sm px-3 py-1.5 text-sm font-semibold text-muted hover:bg-canvas"
                      >
                        ביטול
                      </button>
                    </div>
                  </div>
                )}

                {mode === "zones" && !draftZone && unnamed > 0 && (
                  <p className="rounded-md border border-dashed border-accent-line bg-accent-tint/60 p-3 text-xs leading-relaxed text-accent-deep">
                    זוהו {faces.length} שטחים סגורים במבנה, {unnamed} מהם עדיין ללא שם. לחצו בתוך שטח כדי להגדיר אותו כאזור.
                  </p>
                )}

                {resolved.map((r) => {
                  const active = selectedZoneIds.includes(r.zone.id);
                  return (
                    <div
                      key={r.zone.id}
                      className={`rounded-md border bg-canvas transition-colors ${
                        active ? "border-accent" : "border-border hover:border-accent-line"
                      }`}
                    >
                      <button
                        type="button"
                        // Selecting from the list also frames the zone: on a five-zone property the
                        // tint you just picked is routinely off-screen, and highlighting something
                        // nobody can see is not selection.
                        onClick={(e) => {
                          const additive = isAdditiveClick(e);
                          pick({ kind: "zone", id: r.zone.id }, additive);
                          if (!active && !additive) focusZone(r.zone.id);
                        }}
                        className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-start"
                      >
                        <span className="nums shrink-0 text-xs text-muted">{Math.round(zoneAreaM2(r))} מ״ר</span>
                        <span className={`min-w-0 flex-1 truncate text-sm font-bold ${active ? "text-accent-deep" : "text-ink"}`}>
                          {r.zone.name || "ללא שם"}
                        </span>
                        <span
                          aria-hidden
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: ZONE_DOT_COLOR[r.zone.kind] }}
                        />
                      </button>
                      {r.detached && (
                        <p className="px-3 pb-2.5 text-xs text-alert">השטח נפתח — הקירות סביבו אינם סוגרים אותו יותר.</p>
                      )}

                      {/* Only when it's the *only* thing selected — a multi-selection is edited from
                          the floating panel, and five expanded forms at once is not a selection,
                          it's a wall of text. */}
                      {soleZoneId === r.zone.id && (
                        <div className="px-3 pb-3">
                          <ZoneFields
                            zone={r.zone}
                            onChange={(patch) => patchZone(r.zone.id, patch)}
                            onDelete={() => removeZone(r.zone.id)}
                            // A feature belongs to a zone only by sitting inside its boundary (see
                            // resolveZones) — there's no field to set, just a point to drop it at.
                            // The boundary's own centroid is the one point guaranteed to read as
                            // "inside this zone" for any shape, convex or not. A detached zone
                            // (boundary undone, walls no longer close it) has no such point, so it
                            // gets no add-element control at all rather than one that would place
                            // something in the wrong room.
                            onAddElement={
                              r.boundary.length >= 3
                                ? (kind) => addFeatureAt(kind, polygonCentroid(r.boundary))
                                : undefined
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* The dashed "draw a new zone" shortcut the reference card carries at the bottom
                    of its list — jumps straight to the region tool rather than just switching
                    modes, since that's the tool a zone with no walls to detect actually needs. */}
                <button
                  type="button"
                  onClick={() => {
                    setMode("zones");
                    setSelection([]);
                    setDraftZone(null);
                    setRegion([]);
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent-line bg-accent-tint px-3 py-2.5 text-sm font-bold text-accent transition-colors hover:border-solid hover:bg-indigo-100"
                >
                  <Plus className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                  שרטוט אזור חדש
                </button>

                {zones.length === 0 && !draftZone && (
                  <p className="rounded-md border border-dashed border-accent-line bg-accent-tint p-4 text-sm text-accent-deep">
                    {structure.walls.length === 0
                      ? "המקום עדיין ריק. שרטטו את קירות המקום, ואז עברו ל״הגדרת אזורים״ כדי לתת שם לכל שטח."
                      : "אין עדיין אזורים. עברו ל״הגדרת אזורים״ ולחצו בתוך שטח סגור."}
                  </p>
                )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// The add-element trigger and its flyout — a searchable gallery of cards (one per FEATURE_KINDS
// member, plus entrance) instead of a flat text list, so picking an element reads more like
// choosing a product than reading a menu. Opens upward, not down, since the dock it sits in is
// pinned to the canvas's bottom edge — there is no room below it to pop into.
function AddElementFlyout({
  open,
  onOpenChange,
  armedTool,
  onPick,
  entranceDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  armedTool: AddTool | null;
  onPick: (tool: AddTool) => void;
  entranceDisabled: boolean;
}) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);
  const filtered = ADD_TOOLS.filter((t) => ADD_TOOL_LABEL[t].includes(search.trim()));
  const TriggerIcon = armedTool ? ADD_TOOL_ICON[armedTool] : Shapes;
  return (
    <div className="relative">
      <button
        type="button"
        title="הוספת אלמנט"
        aria-pressed={!!armedTool}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          armedTool ? "bg-accent-tint text-accent" : "text-muted hover:bg-inset"
        }`}
      >
        <span className="flex items-center gap-0.5">
          <TriggerIcon className="h-[18px] w-[18px]" strokeWidth={1.6} />
          <ChevronUp className="h-3 w-3" strokeWidth={2} />
        </span>
        אלמנט
      </button>

      {open && (
        <>
          {/* A full-screen, invisible backdrop is what makes "click anywhere else" close the menu —
              the same pattern the canvas's own (now-retired) right-click menu used. */}
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <div
            role="menu"
            className="absolute bottom-full start-0 z-50 mb-2 w-72 rounded-md border border-border bg-surface p-3 shadow-floating"
          >
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted" style={{ insetInlineStart: 10 }} strokeWidth={1.75} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש אלמנט..."
                aria-label="חיפוש אלמנט"
                className="w-full rounded-md border border-border bg-canvas py-2 text-sm text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
                style={{ paddingInlineStart: 32, paddingInlineEnd: 10 }}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {filtered.map((tool) => {
                const Icon = ADD_TOOL_ICON[tool];
                const disabled = tool === "entrance" && entranceDisabled;
                return (
                  <button
                    key={tool}
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    // Dragging straight onto the canvas — PlanCanvas's own onDropAt (see
                    // halls-screen's use of it) reads this same "text/plain" payload back out, the
                    // exact contract its doc comment already promised a host's catalog rail.
                    draggable={!disabled}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", tool);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onPick(tool)}
                    className={`flex flex-col items-center gap-1.5 rounded-md border p-2.5 text-xs font-semibold transition-colors ${
                      armedTool === tool
                        ? "border-accent bg-accent-tint text-accent"
                        : "border-border text-ink hover:border-accent-line hover:bg-inset"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-md"
                      style={{ backgroundColor: ADD_TOOL_PREVIEW[tool] }}
                    >
                      <Icon className="h-4 w-4 text-ink/70" strokeWidth={1.75} />
                    </span>
                    {ADD_TOOL_LABEL[tool]}
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="col-span-2 py-4 text-center text-xs text-muted">לא נמצאו אלמנטים</p>}
            </div>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
              גררו אלמנט אל הקנבס, או לחצו עליו ואז על מקום בקנבס
            </p>
          </div>
        </>
      )}
    </div>
  );
}
