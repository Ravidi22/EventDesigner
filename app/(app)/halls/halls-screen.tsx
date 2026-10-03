"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  // `Image` is the DOM constructor here (imageSize uses it), so the icon takes the alias.
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  MousePointer2,
  PenLine,
  Plus,
  Ruler,
  Shapes,
  Trash2,
  TriangleAlert,
  Unlock,
  Upload,
  Users,
} from "lucide-react";
import { polygonCentroid } from "@/lib/studio/geometry";
import {
  loadActiveVenueId,
  onActiveVenueChange,
  type Venue,
  type VenueStructure,
  type Zone,
} from "@/lib/venues/storage";
import { fetchVenues, fetchVenuePlan, saveVenuePlan, saveVenue, type BlockedZone } from "@/lib/venues/actions";
import { fileProblem, uploadFile } from "@/lib/files/upload";
import {
  calibrateUnderlay,
  clampOpacity,
  placeUnderlay,
  type CalibrationResult,
} from "@/lib/venues/underlay";
import type { PlanUnderlay } from "@/lib/venues/types";
import {
  addEntrance,
  addFeature,
  addNode,
  addWall,
  bulgeWall,
  emptyStructure,
  moveNode,
  moveWallControlPoint,
  nearestWall,
  newFeature,
  newFeatureFromProduct,
  removeEntrance,
  removeFeature,
  removeNode,
  removeWall,
  updateEntrance,
  updateFeature,
  updateStairs,
  type WallKind,
} from "@/lib/venues/structure";
import { stairsPlacementAt } from "@/lib/venues/stairs";
import { detectFaces, faceAt } from "@/lib/venues/faces";
import {
  isOpenAir,
  newZone,
  resolveZones,
  zoneAreaM2,
  zoneBounds,
  type ZoneKind,
  type ZoneSource,
} from "@/lib/venues/zone";
import {
  ZoneRegions,
  StructureFeatures,
  StructureDoors,
  PlanUnderlayLayer,
  CalibrationOverlay,
} from "@/components/venue-plan";
import { AddElementFlyout } from "@/components/add-element-flyout";
import { VenueInspector, ZoneFields, ADD_TOOL_ICON, addToolIconKey } from "@/components/venue-inspector";
import { ADD_TOOL_SECTIONS, ADD_TOOL_SECTION_LABEL, addTools, findAddTool, type AddTool } from "@/lib/venues/add-tools";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { formatDimensions } from "@/lib/catalog/format";
import { footprintBounds, resolveFootprint } from "@/lib/studio/footprint";
import { FootprintShape } from "@/components/footprint-shape";
import {
  hitsInBox,
  isSelected,
  mergeSelection,
  toggleSelection,
  type PlanSelection,
  type SelectionBox,
} from "@/lib/venues/selection";
import { PlanCanvas, type CanvasFocus } from "@/components/plan-canvas";
import { SidePanel } from "@/components/side-panel";
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

/** An uploaded image's intrinsic pixel size, so it can be placed at its own proportions.
 *
 *  Resolves rather than rejects on failure: a plan that could not be measured is still placeable
 *  (placeUnderlay falls back to a square), and refusing the upload over it would be a worse answer
 *  than a shape the designer can calibrate anyway. */
function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

/**
 * Why a zone the designer deleted is still on the plan.
 *
 * ⚠ IT NAMES THE EVENTS, and that is the entire reason this function exists rather than a template
 * string at the call site. The old line said "there are events assigned to this area" and stopped
 * there, which is the shape of an answer without being one: an ARCHIVED event is filtered off the
 * dashboard (dashboard-screen.tsx), so a designer who had cleared every event they could find was
 * told, truthfully, that one was still standing on the zone — with no way to learn which, and no
 * screen that would admit the event existed. It reads as the app inventing a reason.
 *
 * So the name comes out, "(בארכיון)" is called out on the ones that are hiding, and when any of
 * them is archived the note says where that event can actually be reached. Three names is the cap —
 * past that it is a list nobody reads, and the count carries the rest.
 */
function blockedZoneNote(b: BlockedZone): string {
  // Blocked, but by a row this studio cannot see (see the left join in saveVenuePlan) — which no
  // designer should ever hit. The old wording is exactly right for it, and inventing a name would
  // be worse than admitting there isn't one.
  if (b.events.length === 0) return `${b.name} — לא נמחק, יש אירועים שמשובצים לשטח הזה`;
  const shown = b.events.slice(0, 3).map((e) => (e.archived ? `״${e.name}״ (בארכיון)` : `״${e.name}״`));
  const rest = b.events.length - shown.length;
  const list = shown.join(", ") + (rest > 0 ? ` ועוד ${rest}` : "");
  const verb = b.events.length === 1 ? "משובץ" : "משובצים";
  const noun = b.events.length === 1 ? "האירוע" : "האירועים";
  const hint = b.events.some((e) => e.archived)
    ? " — אירוע בארכיון לא מופיע בלוח השנה; אפשר להגיע אליו במסך ״הפקה״, בלשונית ״הסתיים״"
    : "";
  return `${b.name} — לא נמחק: ${noun} ${list} ${verb} לשטח הזה${hint}`;
}

type Mode = "select" | "walls" | "zones";

// A pastel swatch per element the designer DRAWS rather than picks off a shelf, so the picker's
// cards read as a little gallery of colours instead of identical grey tiles. The ones that come out
// of the catalog get something better than a colour — their own footprint, at their own proportions
// (see ToolPreview) — so they aren't in here.
const ADD_TOOL_PREVIEW: Record<string, string> = {
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
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<string>("");
  // Starts on an EMPTY plane: server and first client render agree on "nothing drawn yet", and the
  // real graph arrives from the server in the effect below. There is no sample property to seed
  // from any more, and a fresh studio genuinely has none.
  const hist = useHistory<PlanState>(
    () => ({ venueId: "", structure: emptyStructure(), zones: [] }),
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
  const [armedToolId, setArmedToolId] = useState<string | null>(null);
  // The catalog, for the two departments a venue has BUILT versions of (lib/venues/add-tools.ts).
  // Read-only here, and its own hook rather than a prop: this screen has no server component above
  // it to seed from, and nothing on this plan resolves a product id while rendering, so the list
  // arriving a beat after the walls do costs nothing but a card that isn't offered yet.
  const catalog = useCatalog();
  const tools = useMemo(() => addTools(catalog.products), [catalog.products]);
  const armedTool = findAddTool(tools, armedToolId) ?? null;
  // The add-element flyout — closed by picking a row (which arms it), by Escape, or by a click
  // anywhere else (see the backdrop next to it).
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [focus, setFocus] = useState<CanvasFocus | null>(null);
  const focusNonce = useRef(0);
  const [ready, setReady] = useState(false); // storage has been read; before this, nothing is written back
  // The zone-definition / background-plan panel, collapsible exactly like the app's own sidebar
  // (components/app-shell.tsx) — a designer mid-drawing wants the canvas at full width without
  // losing the panel entirely, the same tradeoff the main nav's own collapse toggle makes.
  const [panelCollapsed, setPanelCollapsed] = useState(false);
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

  // The autosave queue — the same three refs as the studio's, for the same reason (see flush()).
  // `pending` is the newest plan not yet written, `inFlight` whether a write is in the air, and
  // `persisted` the snapshot last known to be on the server.
  const pending = useRef<PlanState | null>(null);
  const inFlight = useRef(false);
  const persisted = useRef<PlanState | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved");
  // Something the save did differently from what the screen shows — today, only a zone it refused
  // to delete. Not an error: everything else was written.
  const [planNote, setPlanNote] = useState<string | null>(null);

  /**
   * Write the queued plan, and only ever one at a time.
   *
   * ⚠ WRITES ARE SEQUENCED, not merely debounced. A save is a request now, requests overlap, and
   * two overlapping writes to one wall graph land in whatever order the network decides — an older
   * plan overwriting a newer one, silently, with nothing on screen to say so. So at most one is in
   * the air and the newest snapshot waits its turn in `pending`.
   *
   * Every snapshot carries its own venueId, which is what makes it safe to flush across a venue
   * switch: a write still in the air belongs to the property it was drawn on, not to the one now
   * open.
   */
  const flush = useCallback(async () => {
    if (inFlight.current) return; // the running save will pick up whatever is pending when it lands
    const next = pending.current;
    if (!next?.venueId) return;

    inFlight.current = true;
    setSaveState("saving");
    let ok = true;
    try {
      const { blocked } = await saveVenuePlan(next.venueId, next.structure, next.zones);
      // A zone events are booked into stays on the property whatever the editor's history says, so
      // it will be back on the next load. Saying so is the difference between a plan that argued
      // with you and one that looks broken.
      setPlanNote(blocked.length ? blocked.map(blockedZoneNote).join(" · ") : null);
    } catch {
      ok = false;
    }
    inFlight.current = false;

    if (!ok) {
      // `pending` deliberately keeps the snapshot: retrySave and the next edit both resend it.
      setSaveState("error");
      return;
    }
    persisted.current = next;
    if (pending.current === next) {
      pending.current = null;
      setSaveState("saved");
    } else {
      void flush(); // an edit arrived while this write was in the air — send that one too
    }
  }, []);

  useEffect(() => {
    void fetchVenues().then((list) => {
      setVenues(list);
      const stored = loadActiveVenueId();
      setVenueId(list.some((v) => v.id === stored) ? (stored as string) : (list[0]?.id ?? ""));
    });
  }, []);
  useEffect(() => onActiveVenueChange((id) => setVenueId(id ?? "")), []);

  useEffect(() => {
    if (!venueId) return;
    // Whatever the OUTGOING property still had queued goes out now. The debounce below is about to
    // be cleared by its own cleanup, and that is how the last edit before a venue switch was lost.
    if (pending.current) void flush();
    let live = true;
    setReady(false); // nothing is written back while another property's plan is in flight
    void fetchVenuePlan(venueId).then(({ structure: loaded, zones: loadedZones }) => {
      if (!live) return;
      const snapshot: PlanState = { venueId, structure: loaded, zones: loadedZones };
      // What is already on the server, so the render that follows a load doesn't write it straight
      // back — a round trip that bought nothing and stamped an empty structure row onto every
      // property merely opened in the editor.
      persisted.current = snapshot;
      pending.current = null;
      setSaveState("saved");
      setPlanNote(null);
      hist.reset(snapshot);
      setSelection([]);
      setRunNodeId(null);
      setRegion(null);
      setDraftZone(null);
      setFocus(null);
      // A property with nothing drawn on it has nothing to select or name — open on the one tool
      // that can make progress rather than on an empty grid with the wrong tool in hand.
      setMode(loaded.walls.length === 0 ? "walls" : "select");
      setReady(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  // Persist whatever the history currently holds — including after an undo, which is the reason
  // zones are written as a whole list (a snapshot has no per-zone delete to replay).
  //
  // DEBOUNCED, because this fires on every history entry: every wall dragged, every node nudged.
  // Against localStorage that was free; against the server it would be a request per mouse-up. The
  // cleanup cancels the TIMER, so a burst of edits sends one save at the end of it — but the
  // snapshot itself is already in `pending` by then, which is what lets the two effects below get
  // it out of the door when this screen is about to stop existing.
  useEffect(() => {
    if (!ready) return;
    const snapshot = hist.present;
    if (!snapshot.venueId) return;
    if (snapshot === persisted.current) return; // the plan this screen has just read
    pending.current = snapshot;
    setSaveState("saving");
    const t = setTimeout(() => void flush(), 600);
    return () => clearTimeout(t);
  }, [ready, hist.present, flush]);

  // ⚠ THE DEBOUNCE DOES NOT SURVIVE AN UNMOUNT. The effect above clears its own timer on the way
  // out, so a wall drawn less than 600ms before leaving /halls was simply dropped — and leaving is
  // a client-side route change, which `beforeunload` never sees. Flushing here rather than
  // lengthening the window: a write already decided on should not depend on the screen staying
  // mounted to finish.
  useEffect(
    () => () => {
      if (pending.current) void flush();
    },
    [flush],
  );

  const retrySave = useCallback(() => {
    pending.current ??= hist.present;
    void flush();
  }, [hist.present, flush]);

  // Closing the tab with a write queued or failed is the one case the flush above cannot cover.
  useEffect(() => {
    if (saveState === "saved") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

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

  // Turning a feature by its knob. The angle arrives absolute and already locked to 15° (or free,
  // if Alt was down) — the handle owns that — so this only has to fold it into the live gesture,
  // exactly as the resize above does. The side panel's rotation field still writes the same
  // property; a number is faster when the client says "square to the terrace", and a handle is
  // faster for everything else.
  const rotateFeature = useCallback(
    (id: string, rotationDeg: number) => {
      dragStructure((s) => updateFeature(s, id, { rotationDeg }));
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
        setArmedToolId(null);
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
    // Calibration owns the click while it is running — before the wall tools, so a stray click
    // during it marks a measurement instead of starting a wall nobody asked for.
    if (calib) {
      if (!calib.from) setCalib({ from: p, to: null });
      else if (!calib.to) setCalib({ from: calib.from, to: p });
      return;
    }

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
      const nextStructure = runNodeId ? addWall(withNode, runNodeId, nodeId, wallKind) : withNode;
      editStructure(() => nextStructure);
      setRunNodeId(nodeId);

      // A wall that just closed a loop back onto itself created a brand new room — offer to name
      // it right away instead of making the designer end the run, switch to "zones" mode, and
      // click inside it separately. `faces` is still the pre-click set (memoised off the
      // structure before this edit), so comparing against it tells a genuinely new room apart from
      // one that already existed — and already-named ones are, by definition, not new.
      if (!draftZone) {
        const priorSignatures = new Set(faces.map((f) => [...f.nodeIds].sort().join(",")));
        const newFace = detectFaces(nextStructure).find(
          (f) => !priorSignatures.has([...f.nodeIds].sort().join(",")),
        );
        if (newFace) {
          setDraftZone({ source: { type: "face", anchor: polygonCentroid(newFace.boundary) }, name: "", kind: "hall" });
        }
      }
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

  // ── The traced-over floor plan (F-3.5 / F-3.4) ──────────────────────────────────────────────
  //
  // Held locally as well as on the venue because dragging it fires per pointer-move; the server
  // sees the result of a gesture, not the gesture. Same reason the wall graph has a history.
  const [underlay, setUnderlay] = useState<PlanUnderlay | undefined>(undefined);
  // Locked by default, and that is the whole safety of the feature: once walls have been traced
  // onto the image, nudging the image invalidates every one of them, silently. So moving it is a
  // thing you turn on, not a thing you can do by accident.
  const [underlayUnlocked, setUnderlayUnlocked] = useState(false);
  // null = not calibrating. `from` set, `to` null = one point marked, waiting for the second.
  const [calib, setCalib] = useState<{ from: Point | null; to: Point | null } | null>(null);
  const [calibAnswer, setCalibAnswer] = useState("");
  const [underlayBusy, setUnderlayBusy] = useState(false);
  const [underlayNote, setUnderlayNote] = useState<string | null>(null);

  useEffect(() => {
    setUnderlay(venue?.plan.underlay);
    setUnderlayUnlocked(false);
    setCalib(null);
    setUnderlayNote(null);
  }, [venueId, venue?.plan.underlay]);

  /** Write the plan back to the venue. Separate from saveVenuePlan (walls and zones): this is the
   *  venue RECORD, and it needs `manager` where the graph needs `editor`. */
  const persistUnderlay = useCallback(
    async (next: PlanUnderlay | undefined) => {
      if (!venue) return;
      try {
        const list = await saveVenue({ ...venue, plan: { ...venue.plan, underlay: next } });
        setVenues(list);
      } catch {
        // Put the stored version back rather than leaving the screen showing a placement that was
        // never saved — a plan that looks moved but reverts on reload is worse than one that never
        // moved, because the walls traced in between would be against a position nobody has.
        setUnderlay(venue.plan.underlay);
        setUnderlayNote("לא ניתן לשמור את תוכנית הרקע — נסו שוב");
      }
    },
    [venue],
  );

  const onUploadUnderlay = async (file: File) => {
    const problem = fileProblem(file);
    if (problem) {
      setUnderlayNote(problem);
      return;
    }
    setUnderlayBusy(true);
    setUnderlayNote(null);
    try {
      const { url } = await uploadFile(file, "underlay");
      // The image's own proportions decide the placement, so it never arrives stretched — and a
      // stretched underlay cannot be made true by any later calibration.
      const { width, height } = await imageSize(url);
      const placed = placeUnderlay(url, file.name, width, height);
      setUnderlay(placed);
      setUnderlayUnlocked(true); // it has just landed in the middle of the plane; it needs placing
      await persistUnderlay(placed);
      setUnderlayNote("כעת כיילו: סמנו קטע שאורכו ידוע לכם");
    } catch {
      setUnderlayNote("ההעלאה נכשלה — נסו שוב");
    } finally {
      setUnderlayBusy(false);
    }
  };

  const patchUnderlay = (patch: Partial<PlanUnderlay>) =>
    setUnderlay((u) => (u ? { ...u, ...patch } : u));

  const removeUnderlay = async () => {
    setUnderlay(undefined);
    setUnderlayUnlocked(false);
    setCalib(null);
    await persistUnderlay(undefined);
  };

  /** Second click of a calibration: ask for the real length, apply it, save. */
  const finishCalibration = (from: Point, to: Point, answer: string) => {
    if (!underlay) return;
    // Entered in metres, because that is the unit a designer reads off a plan and says out loud.
    const metres = Number(answer.replace(",", "."));
    const result: CalibrationResult = calibrateUnderlay(underlay, from, to, metres * 1000);
    if (!result.ok) {
      setUnderlayNote(result.reason);
      return;
    }
    setUnderlay(result.underlay);
    setCalib(null);
    setUnderlayNote(null);
    void persistUnderlay(result.underlay);
  };
  const namedFaces = resolved.filter((r) => r.zone.source.type === "face" && !r.detached).length;
  const unnamed = Math.max(0, faces.length - namedFaces);
  const activeMode = MODES.find((m) => m.id === mode)!;
  const runNode = runNodeId ? structure.nodes.find((n) => n.id === runNodeId) : null;
  const selectedZoneIds = selection.filter((s) => s.kind === "zone").map((s) => s.id);
  const soleZoneId = selection.length === 1 && selection[0].kind === "zone" ? selection[0].id : null;
  const isSelectMode = mode === "select";

  // ⚠ NOTHING FRAMES ITSELF ON SELECTION HERE, and that is deliberate. Picking a stage, a bar or a
  // pool on the plan used to travel the view onto it, on the argument that you were about to edit
  // it — but the object was already under the pointer that just clicked it, so the move started
  // from "I can see this" and every one of them was the screen taking the view away from wherever
  // the designer had put it. Ten placements in a row is ten unasked-for journeys.
  //
  // ZONES ARE THE EXCEPTION, and the only one: focusZone above is called from the SIDEBAR LIST,
  // where the thing you picked is routinely off-screen and highlighting something nobody can see is
  // not selection. That is the one click where framing answers a question the click actually asked.
  const graphSelection = useMemo(
    () =>
      selection
        .filter((s): s is PlanSelection & { kind: "node" | "wall" } => s.kind === "node" || s.kind === "wall")
        .map((s) => ({ kind: s.kind, id: s.id })),
    [selection],
  );

  // One placement path for everything the flyout, a drag and a zone's quick-add can put on the plan.
  // A tool that carries a catalog row places THAT — its name, its shape and its three measurements
  // — rather than the rough box a kind alone can offer; a bar built in the shape of a ח arrives as a
  // ח instead of as a rectangle the designer then has to reshape by hand in every venue they own.
  const placeTool = (tool: AddTool, p: Point) => {
    if (!tool.kind) {
      addDoorNear(p);
      return;
    }
    const { structure: next, featureId } = addFeature(
      structure,
      tool.product ? newFeatureFromProduct(tool.kind, tool.product, p) : newFeature(tool.kind, p),
    );
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
  // placement path the old right-click menu items called, now behind one-shot arming instead of a
  // menu that already had the point in hand. Always disarms after one placement, matching how the
  // menu closed itself the moment you picked something.
  const placeArmedTool = (p: Point) => {
    if (!armedTool) return;
    placeTool(armedTool, p);
    setArmedToolId(null);
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
          canvas, not a layer floating on top of it (see the SidePanel at the end). No header row above
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
      <div className="grid min-h-0 flex-1 gap-x-4 gap-y-3 lg:grid-cols-[1fr_auto]">
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
              sitting on the purple canvas rather than blending into it — and beside it, whether the
              plan is actually written down.
              THE SAVE STATE LIVES HERE because there is no save button on this screen and never
              was: a write that fails has to say so itself, or a designer traces a whole hall over an
              error nobody reported. This corner is the one that already answers "which property am I
              in", and "…and is it saved" is the same question's second half. It moved here from a
              top toolbar that no longer exists.
              The stack stays pointer-events-none so the canvas underneath still drags; only the
              retry button takes clicks back. */}
          <div className="pointer-events-none absolute right-4 top-4 z-10 flex w-fit max-w-md flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              <div className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md border border-border bg-canvas px-4 py-2 text-sm font-bold text-accent-deep shadow-floating">
                <Building2 className="h-4 w-4 text-accent" strokeWidth={1.75} />
                {venue?.name ?? "מקום"}
              </div>

              <div
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-canvas px-3 py-2 text-xs shadow-floating"
                aria-live="polite"
              >
                {saveState === "saving" ? (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                    שומר…
                  </span>
                ) : saveState === "error" ? (
                  <button
                    type="button"
                    onClick={retrySave}
                    className="pointer-events-auto inline-flex items-center gap-1.5 rounded-sm font-medium text-warn-ink transition-colors hover:bg-warn-tint"
                  >
                    <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
                    לא נשמר · נסו שוב
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
                    נשמר
                  </span>
                )}
              </div>
            </div>

            {/* A zone the save refused to delete because events stand on it. Not an error — the rest
                of the plan was written — so it reads as a note beneath the chip rather than turning
                the indicator red. */}
            {planNote && (
              <p className="rounded-md border border-border bg-warn-tint px-3 py-2 text-xs font-medium leading-relaxed text-warn-ink shadow-floating">
                {planNote}
              </p>
            )}
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
                    const tool = findAddTool(tools, e.dataTransfer.getData("text/plain"));
                    if (tool) placeTool(tool, p);
                  }
                : undefined
            }
            backdrop={({ clientToMm, mm }) => {
              closeSnapMmRef.current = mm(16); // 16px, matching the outline tool's own SNAP_PX
              const closable = region !== null && region.length >= 3;
              return (
                <>
                  {/* FIRST — the traced-over plan sits under the zone tints, the features and the
                      walls the canvas draws itself. Draggable only while explicitly unlocked, and
                      never while a calibration is being marked (the clicks belong to that). */}
                  <PlanUnderlayLayer
                    underlay={underlay}
                    clientToMm={clientToMm}
                    onMove={
                      underlayUnlocked && !calib ? (p) => patchUnderlay({ x: p.x, y: p.y }) : undefined
                    }
                    onCommit={() => void persistUnderlay(underlay)}
                  />
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
                    onRotate={isSelectMode ? rotateFeature : undefined}
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
            overlay={({ mm, clientToMm }) => (
              <>
                <StructureDoors
                  structure={structure}
                  selectedIds={selection.filter((s) => s.kind === "door").map((s) => s.id)}
                  onSelect={isSelectMode ? (id, additive) => pick({ kind: "door", id }, additive) : undefined}
                  onMove={isSelectMode ? (id, distanceMm) => dragStructure((s) => updateEntrance(s, id, { distanceMm })) : undefined}
                  onCommit={endGesture}
                  clientToMm={clientToMm}
                  mm={mm}
                />
                {/* Above the walls: the span being measured has to stay readable over a dark scan. */}
                <CalibrationOverlay from={calib?.from ?? null} to={calib?.to ?? null} mm={mm} />

              </>
            )}
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
                  setArmedToolId(null);
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
                  {/* A bar and a stage come off the studio's own catalog (lib/venues/add-tools.ts),
                      carrying that row's shape and size, instead of arriving as a rectangle that has
                      to be reshaped into a ח by hand in every venue the studio owns. */}
                  <AddElementFlyout
                    open={addMenuOpen}
                    onOpenChange={setAddMenuOpen}
                    items={tools.map((tool) => ({
                      id: tool.id,
                      label: tool.label,
                      section: tool.section,
                      title: tool.product ? `${tool.label} · ${formatDimensions(tool.product.dimensions)}` : tool.label,
                      disabled: tool.id === "entrance" && !structure.walls.some((w) => w.kind === "wall"),
                      preview: <ToolPreview tool={tool} />,
                    }))}
                    sections={ADD_TOOL_SECTIONS.map((id) => ({ id, label: ADD_TOOL_SECTION_LABEL[id] }))}
                    armedId={armedTool?.id ?? null}
                    triggerIcon={armedTool ? ADD_TOOL_ICON[addToolIconKey(armedTool)] : undefined}
                    onPick={(toolId) => {
                      setArmedToolId((id) => (id === toolId ? null : toolId));
                      setAddMenuOpen(false);
                    }}
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
                  setArmedToolId(null);
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
              which would sit directly over whatever it's editing. The edge is now the whole of what
              keeps the selection visible: picking a product no longer recentres the view on it (see
              the note where that effect used to be), so the panel has to stay out of the middle
              rather than count on the drawing being moved out from under it. Just the width and height ceiling live here; the
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
          {(draftZone || (!soleZoneId && selection.length > 0)) && (
            <div className="pointer-events-none absolute inset-y-4 right-4 z-10 flex items-start justify-end">
              <div className="pointer-events-auto h-full w-72">
                <VenueInspector
                  selection={selection}
                  structure={structure}
                  apply={editStructure}
                  onDelete={deleteSelection}
                  onClose={() => setSelection([])}
                  draftZone={draftZone}
                  onDraftZoneChange={(patch) => draftZone && setDraftZone({ ...draftZone, ...patch })}
                  onSaveDraftZone={saveDraftZone}
                  onCancelDraftZone={() => setDraftZone(null)}
                />
              </div>
            </div>
          )}

        </section>

        {/* The zone-definition list — a dedicated sidebar column next to the canvas, not a layer
            floating on top of it (that was tried and explicitly walked back). bg-bg on the panel
            itself is the same neutral plane colour every card elsewhere in the app sits on, giving
            the white card inside it a visible border of separation from the canvas beside it —
            "sidebar container (own background) → card → canvas next to it", not glued onto it.
            Full height (lg:h-full, matching the canvas's own lg:h-full next to it), and the card
            inside runs the full height with it (lg:min-h-full on it) rather than either of them
            being sized to the zone list — a card that stops halfway down reads as the sidebar
            itself stopping short, not as "a sidebar", and the same is true of the collapsed rail,
            which stretches too. A list too long for that height scrolls inside the panel
            (`scrolls`) instead of growing the page.
            The shell, the collapse puck and the width transition are SidePanel's — the same
            component the app's own navigation is built from (components/side-panel.tsx). This
            screen supplies only what goes inside it and what the collapsed strip says. */}
        <SidePanel
          collapsed={panelCollapsed}
          onToggle={() => setPanelCollapsed((c) => !c)}
          label="לוח האזורים"
          // The puck straddles the panel's inline-start — the edge bordering the canvas — rather
          // than its inline-end, since this panel is the one being tucked away, not the thing
          // everything else collapses toward.
          edge="start"
          desktopOnly
          scrolls
          // True 50% of this panel's own box does NOT line up with the main sidebar's puck
          // (components/app-shell.tsx) — that one sits in a box with equal chrome above and below
          // (p-3 both sides), while this panel sits below the shared header (p-3 + h-16 header +
          // gap-3 ≈ 104px of chrome above it) but only p-3 + this page's own p-4 (≈28px) below it.
          // 50% would land 38px lower than the sidebar's puck; shifting up by that half-difference
          // puts both on the same screen line.
          toggleClassName="top-[calc(50%-38px)]"
          // The padding is unconditional: below lg the toggle is gone, so a collapsed state entered
          // on a wide viewport must not survive into a layout with no way to undo it.
          className="rounded-md bg-bg p-4 lg:col-start-2 lg:h-full"
          expandedClassName="lg:w-[300px]"
          collapsedClassName="lg:w-20 lg:p-0"
          // Two icon chips standing in for the two cards below, so the panel still reads as
          // "תוכנית רקע" + "אזורים (n)" even shrunk to a strip, the same way the main
          // sidebar keeps its nav icons rather than going blank. Either chip re-expands the panel.
          rail={
            <div className="flex flex-1 flex-col items-center gap-2.5 rounded-md border border-border bg-inset p-2">
              <button
                type="button"
                onClick={() => setPanelCollapsed(false)}
                title="תוכנית רקע"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors hover:border-accent-line hover:text-accent"
              >
                <ImageIcon className="h-[18px] w-[18px]" strokeWidth={1.4} />
              </button>
              <button
                type="button"
                onClick={() => setPanelCollapsed(false)}
                title="הגדרת אזורים"
                className="relative flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors hover:border-accent-line hover:text-accent"
              >
                <Shapes className="h-[18px] w-[18px]" strokeWidth={1.4} />
                <span className="absolute -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-canvas" style={{ insetInlineEnd: "-6px" }}>
                  {zones.length}
                </span>
              </button>
            </div>
          }
        >
          {/* lg:min-h-full so the card fills the panel's full height rather than hugging its own
              content — the collapsed rail already does (flex-1), and a short zone list otherwise
              ended the card halfway down with the panel's bare plane below it, which read as the
              sidebar itself stopping short. min-h, not h/flex-1: it is the floor, so a list longer
              than the panel still grows past it and scrolls inside SidePanel's own scroller
              instead of being squashed to fit. lg-only because below it the panel has no definite
              height to take a percentage from, and the stacked layout wants it to hug anyway. */}
          <div className="flex flex-col gap-3 rounded-md border border-border bg-inset p-2 lg:min-h-full">
          {/* Tracing panel (F-3.5 + F-3.4) — its own card, sibling to the zone-definition card
              below: a background plan you place/calibrate isn't part of "defining zones", so it
              keeps that card focused on just that instead of growing a second concern into it. */}
          <div className="rounded-md border border-border bg-surface p-3.5">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
              <ImageIcon className="h-[18px] w-[18px] text-muted" strokeWidth={1.4} />
              תוכנית רקע
            </h3>

            {!underlay?.url ? (
              <>
                <p className="mb-2.5 text-xs leading-relaxed text-ink-soft">
                  העלו תצלום או סריקה של תוכנית המקום, כיילו אותה לפי מידה ידועה, וציירו את הקירות
                  מעליה.
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border bg-canvas px-3 py-1.5 text-sm font-semibold text-ink hover:bg-inset">
                  <Upload className="h-4 w-4" strokeWidth={1.4} />
                  {underlayBusy ? "מעלה…" : "העלאת תוכנית"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={underlayBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      // Cleared so choosing the SAME file again still fires a change event — the
                      // obvious thing to do after a failed upload.
                      e.target.value = "";
                      if (f) void onUploadUnderlay(f);
                    }}
                  />
                </label>
              </>
            ) : (
              <div className="flex flex-col gap-2.5">
                <p className="truncate text-xs text-ink-soft" title={underlay.fileName}>
                  {underlay.fileName}
                </p>

                {/* Calibration — the one control that makes traced walls mean anything. */}
                {calib ? (
                  <div className="rounded-sm border border-accent-line bg-accent-tint p-2.5">
                    {!calib.to ? (
                      <p className="text-xs leading-relaxed text-accent-deep">
                        {calib.from
                          ? "סמנו את הקצה השני של אותו קטע."
                          : "סמנו על התוכנית קצה אחד של קטע שאורכו ידוע לכם."}
                      </p>
                    ) : (
                      <>
                        <label className="mb-1.5 block text-xs font-semibold text-accent-deep">
                          מה האורך האמיתי של הקטע? (מטרים)
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={calibAnswer}
                            onChange={(e) => setCalibAnswer(e.target.value)}
                            onKeyDown={(e) =>
                              e.key === "Enter" &&
                              calib.from &&
                              calib.to &&
                              finishCalibration(calib.from, calib.to, calibAnswer)
                            }
                            placeholder="12.5"
                            dir="ltr"
                            className="w-24 rounded-sm border border-border bg-canvas px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
                          />
                          <button
                            onClick={() =>
                              calib.from && calib.to && finishCalibration(calib.from, calib.to, calibAnswer)
                            }
                            className="rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-deep"
                          >
                            כיול
                          </button>
                        </div>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setCalib(null);
                        setUnderlayNote(null);
                      }}
                      className="mt-2 text-xs font-semibold text-muted hover:text-ink"
                    >
                      ביטול
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setCalib({ from: null, to: null });
                      setCalibAnswer("");
                      setUnderlayNote(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-sm border border-border bg-canvas px-3 py-1.5 text-sm font-semibold text-ink hover:bg-inset"
                  >
                    <Ruler className="h-4 w-4" strokeWidth={1.4} />
                    כיול לפי מידה ידועה
                  </button>
                )}

                <label className="flex items-center gap-2 text-xs text-ink-soft">
                  <span className="w-14 shrink-0">שקיפות</span>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={Math.round(clampOpacity(underlay.opacity) * 100)}
                    onChange={(e) => patchUnderlay({ opacity: Number(e.target.value) / 100 })}
                    onPointerUp={() => void persistUnderlay(underlay)}
                    className="flex-1 accent-[var(--color-accent)]"
                  />
                </label>

                <label className="flex items-center gap-2 text-xs text-ink-soft">
                  <span className="w-14 shrink-0">סיבוב</span>
                  <input
                    type="number"
                    step={0.5}
                    value={underlay.rotationDeg}
                    dir="ltr"
                    onChange={(e) => patchUnderlay({ rotationDeg: Number(e.target.value) || 0 })}
                    onBlur={() => void persistUnderlay(underlay)}
                    className="w-20 rounded-sm border border-border bg-canvas px-2 py-1 text-sm text-ink focus-visible:border-accent focus-visible:outline-none"
                  />
                  <span className="text-muted">°</span>
                </label>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setUnderlayUnlocked((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold ${
                      underlayUnlocked
                        ? "border-accent-line bg-accent-tint text-accent"
                        : "border-border bg-canvas text-ink hover:bg-inset"
                    }`}
                  >
                    {underlayUnlocked ? (
                      <Unlock className="h-3.5 w-3.5" strokeWidth={1.6} />
                    ) : (
                      <Lock className="h-3.5 w-3.5" strokeWidth={1.6} />
                    )}
                    {underlayUnlocked ? "נעילת מיקום" : "שחרור להזזה"}
                  </button>
                  <button
                    onClick={() => void removeUnderlay()}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-canvas px-2.5 py-1.5 text-xs font-semibold text-alert hover:bg-inset"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                    הסרה
                  </button>
                </div>

                {underlayUnlocked && (
                  <p className="text-xs leading-relaxed text-alert">
                    התוכנית פתוחה להזזה. הזזתה אחרי שציירתם קירות מעליה תסיט אותם ממנה.
                  </p>
                )}
              </div>
            )}

            {underlayNote && <p className="mt-2 text-xs leading-relaxed text-accent-deep">{underlayNote}</p>}
          </div>

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

                {/* Naming now happens on the canvas's own right-side panel (VenueInspector, below)
                    — the same place every other selection's fields already live — not here; a
                    picked-but-unnamed area is still shown as "picked" via the unnamed-count line
                    right below, not by a second copy of the form in two places at once. */}
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
                        className="flex w-full min-w-0 flex-col gap-1.5 px-3 py-2.5 text-start"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="nums shrink-0 text-xs text-muted">{Math.round(zoneAreaM2(r))} מ״ר</span>
                          <span className={`min-w-0 flex-1 truncate text-sm font-bold ${active ? "text-accent-deep" : "text-ink"}`}>
                            {r.zone.name || "ללא שם"}
                          </span>
                          <span
                            aria-hidden
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: ZONE_DOT_COLOR[r.zone.kind] }}
                          />
                        </div>
                        {!r.detached && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
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
                            addTools={tools}
                            onAddElement={
                              r.boundary.length >= 3
                                ? (tool) => placeTool(tool, polygonCentroid(r.boundary))
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
          </div>
        </SidePanel>
      </div>
    </div>
  );
}

/** The picture on a card. A catalog-backed tool draws its OWN footprint, at its own proportions —
 *  the ח that makes a ח bar worth picking is visible before it is placed, and two bars that differ
 *  only in size read as two sizes. The drawn elements have no such picture, so they keep the pastel
 *  swatch and icon that were standing in for one. */
function ToolPreview({ tool }: { tool: AddTool }) {
  const Icon = ADD_TOOL_ICON[addToolIconKey(tool)];
  if (!tool.product) {
    return (
      <span
        className="flex h-11 w-11 items-center justify-center rounded-md"
        style={{ backgroundColor: ADD_TOOL_PREVIEW[tool.id] ?? "var(--color-inset)" }}
      >
        <Icon className="h-4 w-4 text-ink/70" strokeWidth={1.75} />
      </span>
    );
  }
  const footprint = resolveFootprint(tool.product);
  const b = footprintBounds(footprint);
  const pad = Math.max(b.w, b.h) * 0.08; // room for the stroke, which sits on the outline itself
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-md bg-inset">
      <svg
        viewBox={`${-b.w / 2 - pad} ${-b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`}
        className="h-9 w-9"
        aria-hidden
      >
        <FootprintShape
          footprint={footprint}
          fill="var(--color-surface)"
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
