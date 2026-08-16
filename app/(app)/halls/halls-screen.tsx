"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Building2,
  ChevronUp,
  DoorOpen,
  GlassWater,
  Layers,
  MousePointer2,
  PenLine,
  Presentation,
  Ruler,
  Shapes,
  Users,
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
  isOpenAir,
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
import { IconButton } from "@/components/icon-button";
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

    if (mode === "zones") {
      const face = faceAt(faces, p);
      if (!face) return; // nothing enclosed here — the region tool is the way to name open ground
      const taken = resolved.some((r) => r.zone.source.type === "face" && faceAt(faces, r.zone.source.anchor) === face);
      if (taken) return;
      setDraftZone({ source: { type: "face", anchor: p }, name: "", kind: "hall" });
    }
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

  return (
    <div className="px-6 py-6">
      {/* An explicit two-row grid, not a flex-col column plus a plain second column: the sidebar
          needs to start on the exact same grid line the canvas does, and a column that merely
          *contains* the header above its canvas can't hand that line to a sibling column — only a
          shared row boundary can. Row 1 is the header (tab + mode toolbar), col 1 only; row 2 is
          the canvas and the sidebar side by side, so both begin at the same y regardless of how
          tall the header row ends up being. */}
      <div className="grid gap-x-4 gap-y-3 lg:grid-cols-[1fr_280px] lg:grid-rows-[auto_1fr]">
        {/* The venue's name — a light top tab, standing in for the name/description/stats header
            this screen used to carry (once a venue's plan is open there is only ever the one thing
            to look at) — and "הגדרת אזורים", back up here on its own rather than sharing the
            bottom dock's mode bar with "שרטוט קירות". Its own sub-control ("סימון שטח פתוח") sits
            beside it, same as it did before either of them ever moved. */}
        <div className="flex flex-wrap items-center justify-between gap-2 lg:col-start-1 lg:row-start-1">
          <div className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md bg-accent-tint px-4 py-2 text-sm font-bold text-accent-deep">
            <Building2 className="h-4 w-4" strokeWidth={1.75} />
            {venue?.name ?? "מקום"}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("zones");
                  setRunNodeId(null);
                  setRegion(null);
                  setDraftZone(null);
                  setArmedTool(null);
                  setAddMenuOpen(false);
                  setSelection([]);
                }}
                aria-pressed={mode === "zones"}
                className={`inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors ${
                  mode === "zones" ? "bg-accent-tint font-bold text-accent" : "font-semibold text-muted hover:bg-inset"
                }`}
              >
                <Shapes className="h-[18px] w-[18px]" strokeWidth={1.4} />
                הגדרת אזורים
              </button>
            </div>

            {mode === "zones" && (
              <button
                type="button"
                onClick={() => setRegion(region ? null : [])}
                aria-pressed={region !== null}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  region !== null
                    ? "border-accent-line bg-accent-tint font-bold text-accent"
                    : "border-border bg-surface font-semibold text-muted hover:bg-inset"
                }`}
              >
                {region !== null ? "סיימו עם Enter" : "סימון שטח פתוח"}
              </button>
            )}
          </div>
        </div>

        <section
          className="relative h-[72vh] min-h-96 overflow-hidden rounded-md border border-border bg-canvas lg:col-start-1 lg:row-start-2"
            onPointerMove={(e) => {
              if (mode === "select") return;
              const r = e.currentTarget.getBoundingClientRect();
              setCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
            }}
            onPointerLeave={() => setCursorPos(null)}
          >
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
            onCanvasClick={isSelectMode && armedTool ? placeArmedTool : undefined}
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
                  {region && region.length > 0 && (
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
                  {/* The closing target: the first vertex, enlarged once the boundary can close, with
                      a hover ring — the same "click here to finish" affordance the outline tool gives
                      Studio/catalog shapes, ported to this freehand region. */}
                  {closable && region && (
                    <g>
                      <circle
                        cx={region[0].x}
                        cy={region[0].y}
                        r={mm(hoverCloseRegion ? 10 : 7)}
                        className="text-accent"
                        fill="currentColor"
                      />
                      {hoverCloseRegion && (
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
                      <circle
                        cx={region[0].x}
                        cy={region[0].y}
                        r={mm(16)}
                        fill="transparent"
                        className="cursor-pointer"
                        onPointerEnter={() => setHoverCloseRegion(true)}
                        onPointerLeave={() => setHoverCloseRegion(false)}
                      />
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
              <IconButton
                label="שרטוט קירות"
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
                className={mode === "walls" ? "bg-accent-tint text-accent hover:text-accent" : undefined}
              >
                <PenLine className="h-[18px] w-[18px]" strokeWidth={1.4} />
              </IconButton>

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
              <IconButton
                label="מצב בחירה"
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
                className={isSelectMode && !armedTool ? "bg-accent-tint text-accent hover:text-accent" : undefined}
              >
                <MousePointer2 className="h-[18px] w-[18px]" strokeWidth={1.6} />
              </IconButton>
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

        <aside className="flex flex-col gap-2 self-start lg:col-start-2 lg:row-start-2">
          {/* Naming panel — appears the moment an area is picked */}
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
            <p className="rounded-md border border-dashed border-accent-line bg-accent-tint/50 p-3 text-xs leading-relaxed text-accent-deep">
              זוהו {faces.length} שטחים סגורים במבנה, {unnamed} מהם עדיין ללא שם. לחצו בתוך שטח כדי להגדיר אותו כאזור.
            </p>
          )}

          {resolved.map((r) => {
            const active = selectedZoneIds.includes(r.zone.id);
            return (
              <div
                key={r.zone.id}
                className={`rounded-md border p-3.5 transition-colors ${
                  active ? "border-accent-line bg-accent-tint" : "border-border bg-surface hover:border-accent-line"
                }`}
              >
                <button
                  type="button"
                  // Selecting from the list also frames the zone: on a five-zone property the tint
                  // you just picked is routinely off-screen, and highlighting something nobody can
                  // see is not selection.
                  onClick={(e) => {
                    const additive = isAdditiveClick(e);
                    pick({ kind: "zone", id: r.zone.id }, additive);
                    if (!active && !additive) focusZone(r.zone.id);
                  }}
                  className="w-full min-w-0 text-start"
                >
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-sm font-bold ${active ? "text-accent-deep" : "text-ink"}`}>
                      {r.zone.name || "ללא שם"}
                    </span>
                    <span
                      className={`shrink-0 rounded-pill border px-2 py-0.5 text-[11px] ${
                        active ? "border-badge-line text-accent" : "border-border text-muted"
                      }`}
                    >
                      {ZONE_KIND_LABEL[r.zone.kind]}
                    </span>
                  </div>
                  {r.detached ? (
                    <p className="mt-1.5 text-xs text-alert">השטח נפתח — הקירות סביבו אינם סוגרים אותו יותר.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                      <span className="inline-flex items-center gap-1">
                        <Ruler className="h-3.5 w-3.5" strokeWidth={1.4} />
                        <span className="nums">{Math.round(zoneAreaM2(r))}</span> מ״ר
                      </span>
                      {r.zone.capacity?.seated ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" strokeWidth={1.4} />
                          <span className="nums">{r.zone.capacity.seated}</span> מושבים
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" strokeWidth={1.4} />
                        {isOpenAir(r.zone) ? "פתוח לשמיים" : `תקרה ${(r.zone.ceilingHeightMm / 1000).toFixed(1)} מ׳`}
                      </span>
                    </div>
                  )}
                </button>

                {/* Only when it's the *only* thing selected — a multi-selection is edited from the
                    floating panel, and five expanded forms at once is not a selection, it's a wall
                    of text. */}
                {soleZoneId === r.zone.id && (
                  <ZoneFields
                    zone={r.zone}
                    onChange={(patch) => patchZone(r.zone.id, patch)}
                    onDelete={() => removeZone(r.zone.id)}
                    // A feature belongs to a zone only by sitting inside its boundary (see
                    // resolveZones) — there's no field to set, just a point to drop it at. The
                    // boundary's own centroid is the one point guaranteed to read as "inside this
                    // zone" for any shape, convex or not. A detached zone (boundary undone, walls
                    // no longer close it) has no such point, so it gets no add-element control at
                    // all rather than one that would place something in the wrong room.
                    onAddElement={
                      r.boundary.length >= 3
                        ? (kind) => addFeatureAt(kind, polygonCentroid(r.boundary))
                        : undefined
                    }
                  />
                )}
              </div>
            );
          })}

          {zones.length === 0 && !draftZone && (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted">
              {structure.walls.length === 0
                ? "המקום עדיין ריק. שרטטו את קירות המקום, ואז עברו ל״הגדרת אזורים״ כדי לתת שם לכל שטח."
                : "אין עדיין אזורים. עברו ל״הגדרת אזורים״ ולחצו בתוך שטח סגור."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

// The add-element trigger and its flyout — the six element kinds live behind one chevron button
// instead of six flat icons in the dock, the same shape Figma gives a tool with variants (its own
// shape tool's rectangle/ellipse/line dropdown). Opens upward, not down, since the dock it sits in
// is pinned to the canvas's bottom edge — there is no room below it to pop into.
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
  const TriggerIcon = armedTool ? ADD_TOOL_ICON[armedTool] : Shapes;
  return (
    <div className="relative">
      <IconButton
        label="הוספת אלמנט"
        aria-pressed={!!armedTool}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={armedTool ? "bg-accent-tint text-accent hover:text-accent" : undefined}
      >
        <span className="flex items-center gap-0.5">
          <TriggerIcon className="h-[18px] w-[18px]" strokeWidth={1.6} />
          <ChevronUp className="h-3 w-3" strokeWidth={2} />
        </span>
      </IconButton>

      {open && (
        <>
          {/* A full-screen, invisible backdrop is what makes "click anywhere else" close the menu —
              the same pattern the canvas's own (now-retired) right-click menu used. */}
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <div
            role="menu"
            className="absolute bottom-full start-0 z-50 mb-2 w-40 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-floating"
          >
            {ADD_TOOLS.map((tool) => {
              const Icon = ADD_TOOL_ICON[tool];
              const disabled = tool === "entrance" && entranceDisabled;
              return (
                <button
                  key={tool}
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => onPick(tool)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-ink transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent"
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {ADD_TOOL_LABEL[tool]}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
