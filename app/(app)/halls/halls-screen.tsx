"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  AlignCenterVertical,
  ArrowUp,
  BringToFront,
  Building2,
  Check,
  Eye,
  ClipboardPaste,
  Copy,
  // `Image` is the DOM constructor here (imageSize uses it), so the icon takes the alias.
  Image as ImageIcon,
  Hand,
  Images,
  Layers,
  Loader2,
  Lock,
  LockOpen,
  MousePointer2,
  Pencil,
  PenLine,
  Plus,
  Redo2,
  Ruler,
  Scissors,
  SendToBack,
  Shapes,
  SquareDashed,
  Trash2,
  TriangleAlert,
  Undo2,
  Unlock,
  Upload,
  Users,
  X,
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
import { canEditPlan, type VenueRole } from "@/lib/venues/access";
import { fileProblem, uploadFile } from "@/lib/files/upload";
import {
  calibrateUnderlay,
  clampOpacity,
  placeUnderlay,
  underlayCorners,
  type CalibrationResult,
} from "@/lib/venues/underlay";
import type { PlanUnderlay } from "@/lib/venues/types";
import {
  addEntrance,
  addFeature,
  duplicateFeatures,
  canRestack,
  restackFeatures,
  type Restack,
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
  type WallKind,
  PLANT_DEFAULTS,
  SURFACE_MATERIAL_LABEL,
  type StructureFeature,
  type SurfaceMaterial,
  copiedFeature,
  featureEdgeItems,
  featureStage,
  surfaceMaterialPatch,
} from "@/lib/venues/structure";
import { addSurfaceUnder, asOutline, buildingFilling, buildingFromBoundary, buildingInFace, featureWorldOutline, followsWalls, surfaceFilling, surfaceFromBoundary, surfaceInFace, syncFaceSurfaces } from "@/lib/venues/face-surfaces";
import { ItemSymbol } from "@/components/item-symbol";
import { insertRegionPoint, moveRegionPoint, removeRegionPoint, tidyRegion } from "@/lib/venues/region-edit";
import { detectFaces, faceAt, pointInPolygon, type Face } from "@/lib/venues/faces";
import {
  detachedNote,
  isOpenAir,
  newZone,
  resolveZones,
  zoneAreaM2,
  type ZoneKind,
  type ZoneSource,
} from "@/lib/venues/zone";
import { ZONE_MARGIN_MM, featuresBoundary, presentFeatureIds } from "@/lib/venues/feature-zones";
import { newSeatingFeature } from "@/lib/venues/seating";
import { FALLBACK_CHAIR, chairRowsLayout } from "@/lib/design-document/chair-rows";
import { SeatingGlyph } from "@/components/chair-block";
import { ColumnGlyph } from "@/components/column-glyph";
import { defineColumns } from "@/lib/venues/column";
import { curtainEndT, curtainPatch, newCurtain, syncCurtains } from "@/lib/venues/curtain";
import {
  ZoneRegions,
  StructureFeatures,
  RegionOutlineEditor,
  StructureDoors,
  PlanUnderlayLayer,
  CalibrationOverlay,
  FeatureRotateHandles,
} from "@/components/venue-plan";
import { VenueDims } from "@/components/venue-dims";
import { UnderlayCropModal } from "@/components/underlay-crop-modal";
import { AddElementFlyout } from "@/components/add-element-flyout";
import { ADD_TOOL_ICON, addToolIconKey } from "@/components/venue-inspector";
import { IconButton } from "@/components/icon-button";
import { ProductImage } from "../catalog/product-image";
import { ZoneDialog } from "./zone-dialog";
import { SelectionBar } from "./selection-bar";
import { addEdgeItemAt, changeEdgeItem, fillFeatureEdges, removeEdgeItem, setEdgeItems, wallDistanceOf, type EdgeRefusal, type VenueEdgeKind } from "@/lib/venues/stage-edges";
import { shareSide } from "@/lib/design-document/stage";
import type { StageStair } from "@/lib/design-document/types";
import { ALIGN_LABEL, alignedCentres, needsThree, type AlignOp } from "@/lib/studio/align";
import type { SnapBox } from "@/lib/studio/snap";
import { ADD_TOOL_SECTIONS, ADD_TOOL_SECTION_LABEL, addTools, findAddTool, type AddTool } from "@/lib/venues/add-tools";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { formatDimensions } from "@/lib/catalog/format";
import { PlantGlyph } from "@/components/plant-glyph";
import { SurfaceFill } from "@/components/surface-fill";
import {
  hitsInBox,
  isSelected,
  mergeSelection,
  toggleSelection,
  type PlanSelection,
  type SelectionBox,
} from "@/lib/venues/selection";
import { PlanCanvas, type CanvasLayerContext, type ContextMenuItem, type MarqueeMode } from "@/components/plan-canvas";
import { SidePanel } from "@/components/side-panel";
import { useHistory } from "@/lib/studio/use-history";
import { isAdditiveClick, isShortcut, isTypingTarget } from "@/lib/keyboard";
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
  window: "#d6e6f3",
  curtain: "#dcd8e4",
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
// While something is being PLACED (an armed tool, a calibration mark), no feature takes the
// pointer: the lawn under the whole plan used to catch the click meant to put a bar on it, and
// showed a move cursor over the one spot the designer was trying to click. Module-level so the
// memoised feature nodes see one identity.
const NEVER = () => false;
/** What a viewer's edits do (see `hist` in HallsScreen): nothing. */
const IGNORE_EDIT = () => {};
// A viewer's selection, always: nothing on a plan they may not edit can be picked, so no bar, handle
// or drag ever offers to change it.
const NO_SELECTION: PlanSelection[] = [];

/** How far each successive paste lands from the one before. */
const PASTE_STEP_MM = 400;

/** The add-element flyout's one entry that is not a tool: trace a surface of any shape, point by
 *  point, as a freehand zone is traced. */
const DRAW_SURFACE = "surface:draw";

/** A surface laid in a closed shape follows the walls round it (lib/venues/face-surfaces.ts): any
 *  edit that moved a wall or a corner re-lays them, inside that same history entry — so a wall drag
 *  carries the floor with it frame by frame, and one undo takes both back. */
function settleWalls(before: VenueStructure, after: VenueStructure): VenueStructure {
  // …and the curtains hung on them (lib/venues/curtain.ts), the same way.
  return after.nodes === before.nodes && after.walls === before.walls ? after : syncCurtains(syncFaceSurfaces(after));
}

/** A feature's box as it stands, turned — what alignment and snapping measure. */
function featureBox(f: StructureFeature): SnapBox {
  const rad = ((f.rotationDeg ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const sn = Math.abs(Math.sin(rad));
  return { x: f.x, y: f.y, widthMm: f.widthMm * c + f.depthMm * sn, depthMm: f.widthMm * sn + f.depthMm * c };
}

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
  // The caller's role on the open property (fetchVenuePlan). Everybody sees every venue; only a
  // grant lets them edit it (lib/venues/access.ts resolveVenueRole). A viewer's plan is READ-ONLY:
  // every edit below goes through `hist`, and for a viewer its three writers do nothing — so a
  // drag, a typed size or a pasted feature leaves the plan as it was, and nothing is ever saved.
  const [role, setRole] = useState<VenueRole>("manager");
  const readOnly = !canEditPlan(role);
  const history = useHistory<PlanState>(
    () => ({ venueId: "", structure: emptyStructure(), zones: [] }),
    { keyboard: true },
  );
  const hist = readOnly ? { ...history, set: IGNORE_EDIT, amend: IGNORE_EDIT } : history;
  const { structure, zones } = hist.present;

  const [mode, setMode] = useState<Mode>("select");
  const [pickedSelection, setSelection] = useState<PlanSelection[]>([]);
  const selection = readOnly ? NO_SELECTION : pickedSelection;
  const [wallKind, setWallKind] = useState<WallKind>("wall");
  const [runNodeId, setRunNodeId] = useState<string | null>(null); // last corner of the wall run in progress
  const [region, setRegion] = useState<Point[] | null>(null); // freehand zone boundary in progress
  // The hand: a plain drag moves the view instead of selecting, over anything on the plan. A toggle
  // beside the modes rather than a mode of its own, so turning it off lands back where you were.
  const [handTool, setHandTool] = useState(false);
  // `intent: "surface"` — traced from the flyout's "ציור חופשי": the bar asks for a material, not a name.
  const [draftZone, setDraftZone] = useState<{ source: ZoneSource; name: string; kind: ZoneKind; intent?: "surface" } | null>(null);
  // What the freehand trace in progress will become once it closes.
  const [regionFor, setRegionFor] = useState<"zone" | "surface">("zone");
  // The one free surface whose outline is open for editing point by point (the bar's "עריכת הקווים").
  const [outlineEditId, setOutlineEditId] = useState<string | null>(null);
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
  // The zone whose edit dialog is open (the ✎ on its row in the list) — zone-dialog.tsx.
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  // Which property's plan has been read. Before the open one's arrives nothing is written back.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = readyFor === venueId;
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
  const [hoverCloseRegionRaw, setHoverCloseRegion] = useState(false);
  // Whichever of the several setRegion(null) call sites ends a region (Enter, a near-first-vertex
  // click, Esc, the toggle button), the hover ring shouldn't outlive it and greet the next one already lit.
  const hoverCloseRegion = region !== null && hoverCloseRegionRaw;
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
  const flush = useCallback(async function flush() {
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
  // The list is re-read on a switch: a venue just added from the directory (followVenue) or made in
  // the switcher is not in the copy read on mount, and its name and logo were missing here.
  useEffect(
    () =>
      onActiveVenueChange((id) => {
        setVenueId(id ?? "");
        void fetchVenues().then(setVenues);
      }),
    [],
  );

  useEffect(() => {
    if (!venueId) return;
    // Whatever the OUTGOING property still had queued goes out now. The debounce below is about to
    // be cleared by its own cleanup, and that is how the last edit before a venue switch was lost.
    if (pending.current) void flush();
    let live = true;
    void fetchVenuePlan(venueId).then(({ structure: loaded, zones: loadedZones, role: loadedRole }) => {
      if (!live) return;
      setRole(loadedRole);
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
      setEditingZoneId(null);
      // A property with nothing drawn on it has nothing to select or name — open on the one tool
      // that can make progress rather than on an empty grid with the wrong tool in hand.
      setMode(loaded.walls.length === 0 && canEditPlan(loadedRole) ? "walls" : "select");
      setReadyFor(venueId);
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
  // A zone made of features follows them the same way (lib/venues/feature-zones.ts).
  const resolved = useMemo(() => resolveZones(zones, faces, structure.features), [zones, faces, structure.features]);
  // What the zone being named will cover, drawn under its naming bar: the room clicked, the trace
  // just closed, or the area round the features picked — whose margin is chosen by looking at it.
  const draftBoundary = useMemo(() => {
    const src = draftZone?.source;
    if (!src) return null;
    if (src.type === "face") return faceAt(faces, src.anchor)?.boundary ?? null;
    if (src.type === "region") return src.boundary;
    return featuresBoundary(structure.features, src.featureIds, src.marginMm);
  }, [draftZone, faces, structure.features]);

  const editStructure = useCallback(
    (fn: (s: VenueStructure) => VenueStructure) => hist.set((p) => ({ ...p, structure: settleWalls(p.structure, fn(p.structure)) })),
    [hist],
  );
  // A drag: the first move opens the entry, every later one overwrites it, `commit` closes it — so
  // dragging a corner across the plan is one undo step, not two hundred.
  const dragStructure = useCallback(
    (fn: (s: VenueStructure) => VenueStructure) => hist.amend((p) => ({ ...p, structure: settleWalls(p.structure, fn(p.structure)) })),
    [hist],
  );
  const editZones = useCallback(
    (fn: (z: Zone[]) => Zone[]) => hist.set((p) => ({ ...p, zones: fn(p.zones) })),
    [hist],
  );
  // A freehand zone's outline, rewritten — through `amend` while a corner is being dragged (one
  // undo step per drag, like a wall corner), through `set` for a one-off edit.
  const editRegion = useCallback(
    (id: string, fn: (b: Point[]) => Point[], during: "drag" | "edit" = "edit") => {
      const apply = (zs: Zone[]) =>
        zs.map((z) => (z.id === id && z.source.type === "region" ? { ...z, source: { type: "region" as const, boundary: fn(z.source.boundary) } } : z));
      if (during === "drag") hist.amend((p) => ({ ...p, zones: apply(p.zones) }));
      else hist.set((p) => ({ ...p, zones: apply(p.zones) }));
    },
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
        // A locked feature is left standing (StructureFeature.locked) — unlock it first.
        for (const r of refs) if (r.kind === "feature" && !next.features.find((f) => f.id === r.id)?.locked) next = removeFeature(next, r.id);
        for (const r of refs) if (r.kind === "node") next = removeNode(next, r.id);
        return next;
      });
    }
  }, [selection, editStructure, editZones]);

  // Copies of the selected features, which become the selection — so a second Ctrl+D copies the
  // copy, and a row of palms is one palm and a few keystrokes. Walls, corners and doors are part of
  // the connected graph and are not copied; a mixed selection copies just its features.
  const featureSelection = selection.filter((r) => r.kind === "feature").map((r) => r.id);
  const duplicateSelection = useCallback(() => {
    const ids = selection.filter((r) => r.kind === "feature").map((r) => r.id);
    if (ids.length === 0) return;
    const { structure: next, featureIds } = duplicateFeatures(structure, ids);
    editStructure(() => next);
    setSelection(featureIds.map((id) => ({ kind: "feature" as const, id })));
  }, [selection, structure, editStructure]);

  // Drawing order: which of two overlapping features covers the other (a palm over the shrub at
  // its foot). Also on Ctrl+] / Ctrl+[ (with Shift: all the way), the keys every design tool uses.
  const restackSelection = useCallback(
    (how: Restack, ids = selection.filter((r) => r.kind === "feature").map((r) => r.id)) => {
      if (ids.length === 0) return;
      editStructure((st) => restackFeatures(st, ids, how));
    },
    [selection, editStructure],
  );

  // ── the clipboard ──────────────────────────────────────────────────────────────────────────
  // Features only — a copied wall or corner would be a second, unconnected piece of the graph. Held
  // in state (not a module variable) so the paste button knows when there is something to paste.
  // Each paste lands a step further from the original than the last, so repeated pastes fan out
  // rather than stacking on one spot (the sketch's own rule).
  const [clip, setClip] = useState<StructureFeature[]>([]);
  const pasteStep = useRef(0);
  const copySelection = useCallback(() => {
    const ids = selection.filter((r) => r.kind === "feature").map((r) => r.id);
    const rows = structure.features.filter((f) => ids.includes(f.id));
    if (rows.length === 0) return;
    setClip(rows.map((f) => ({ ...f })));
    pasteStep.current = 0;
  }, [selection, structure]);
  const cutSelection = useCallback(() => {
    const ids = selection.filter((r) => r.kind === "feature").map((r) => r.id);
    const rows = structure.features.filter((f) => ids.includes(f.id) && !f.locked);
    if (rows.length === 0) return;
    setClip(rows.map((f) => ({ ...f })));
    pasteStep.current = 0;
    setSelection((s) => s.filter((r) => !(r.kind === "feature" && rows.some((f) => f.id === r.id))));
    editStructure((st) => rows.reduce((acc, f) => removeFeature(acc, f.id), st));
  }, [selection, structure, editStructure]);
  const pasteClip = useCallback(() => {
    if (clip.length === 0) return;
    pasteStep.current += 1;
    const d = PASTE_STEP_MM * pasteStep.current;
    let next = structure;
    const ids: string[] = [];
    for (const f of clip) {
      // A pasted copy is a new thing: its own id, never born locked, and not in any closed shape.
      const r = addFeature(next, { ...copiedFeature(f), x: f.x + d, y: f.y + d });
      next = r.structure;
      ids.push(r.featureId);
    }
    editStructure(() => next);
    setSelection(ids.map((id) => ({ kind: "feature" as const, id })));
  }, [clip, structure, editStructure]);

  // ── alignment and snapping ─────────────────────────────────────────────────────────────────
  /** Lines the selected features up by the FIRST selected (lib/studio/align.ts) — the key never
   *  moves; a locked member is left out. */
  const alignFeatures = useCallback(
    (op: AlignOp) => {
      const rows = selection
        .filter((r) => r.kind === "feature")
        .map((r) => structure.features.find((f) => f.id === r.id))
        .filter((f): f is StructureFeature => !!f && !f.locked && !followsWalls(f));
      if (rows.length < 2 || (needsThree(op) && rows.length < 3)) return;
      const centres = alignedCentres(rows.map(featureBox), 0, op);
      editStructure((st) => rows.reduce((acc, f, i) => updateFeature(acc, f.id, { x: centres[i].x, y: centres[i].y }), st));
    },
    [selection, structure, editStructure],
  );
  /** The canvas's own alignment pull for a dragged feature: its edges and centre line up with the
   *  walls, the corners and the other features, and equal gaps are offered (the same guides a
   *  dragged table gets in the sketch). The ground is never a reference — it is under everything. */
  const snapFeatureAt = useCallback(
    (id: string, p: Point, snap: CanvasLayerContext["snap"]): Point => {
      const f = structure.features.find((x) => x.id === id);
      if (!f) return p;
      const self = featureBox(f);
      // A dragged lawn lines up with the walls and with the other GROUND — a paved path butted
      // against a bed — never with the palm standing on it; and nothing else lines up with the ground.
      const ground = f.kind === "surface";
      const boxes = structure.features.filter((o) => o.id !== id && (o.kind === "surface") === ground && !isSelected(selection, "feature", o.id)).map(featureBox);
      return snap(p, { boxes, self: { widthMm: self.widthMm, depthMm: self.depthMm } });
    },
    [structure, selection],
  );

  /** Pins features in place, or frees them (StructureFeature.locked). One history entry. */
  const setLocked = useCallback(
    (ids: string[], locked: boolean) => {
      if (ids.length === 0) return;
      editStructure((st) => ids.reduce((acc, id) => updateFeature(acc, id, { locked }), st));
    },
    [editStructure],
  );

  // A right-click on a feature is reported by the feature layer (which knows what is under the
  // pointer, glyph and all) a moment before the canvas asks for its menu — the event bubbles from
  // one to the other — so the id waits here for that one question and is then cleared.
  const contextFeatureRef = useRef<string | null>(null);
  const featureMenuItems = (): ContextMenuItem[] => {
    const hit = contextFeatureRef.current;
    contextFeatureRef.current = null;
    if (hit && !structure.features.some((f) => f.id === hit)) return [];
    // Right-clicking one of several selected features acts on all of them; right-clicking anything
    // else selects it first, the way a file manager does, so the menu is never about something the
    // designer cannot see is selected. A right-click on EMPTY canvas is about the selection, as in
    // the sketch — so the menu is reachable without having to land on a small thing.
    const selected = selection.filter((r) => r.kind === "feature").map((r) => r.id);
    const ids = hit ? (selected.includes(hit) ? selected : [hit]) : selected;
    if (ids.length === 0) return [];
    if (hit && !selected.includes(hit)) setSelection([{ kind: "feature", id: hit }]);
    const unlocked = ids.filter((id) => !structure.features.find((f) => f.id === id)?.locked).length;
    const item = (label: string, icon: ContextMenuItem["icon"], how: Restack): ContextMenuItem => ({
      label,
      icon,
      disabled: !canRestack(structure, ids, how),
      onSelect: () => restackSelection(how, ids),
    });
    const allLocked = ids.every((id) => structure.features.find((f) => f.id === id)?.locked);
    return [
      item("הבאה לחזית", BringToFront, "front"),
      item("הזזה קדימה", ArrowUp, "forward"),
      item("הזזה אחורה", ArrowDown, "backward"),
      item("שליחה לרקע", SendToBack, "back"),
      ...(unlocked > 1
        ? [
            {
              label: "יישור",
              icon: AlignCenterVertical,
              onSelect: () => {},
              children: (["right", "hcenter", "left", "top", "vmiddle", "bottom", "distribute-x", "distribute-y"] as AlignOp[])
                .filter((op) => !needsThree(op) || unlocked > 2)
                .map((op) => ({ label: ALIGN_LABEL[op], onSelect: () => alignFeatures(op) })),
            } satisfies ContextMenuItem,
          ]
        : []),
      {
        label: allLocked ? "שחרור הנעילה" : "נעילה במקום",
        icon: allLocked ? LockOpen : Lock,
        onSelect: () => setLocked(ids, !allLocked),
      },
      {
        label: "הגדרה כאזור",
        icon: SquareDashed,
        onSelect: () => startFeatureZone(ids),
      },
      {
        label: "שכפול",
        icon: Copy,
        onSelect: () => {
          const { structure: next, featureIds } = duplicateFeatures(structure, ids);
          editStructure(() => next);
          setSelection(featureIds.map((id) => ({ kind: "feature" as const, id })));
        },
      },
      {
        label: "מחיקה",
        icon: Trash2,
        onSelect: () => {
          setSelection([]);
          editStructure((st) => ids.reduce((acc, id) => removeFeature(acc, id), st));
        },
      },
    ];
  };

  // A marquee catches everything on the plan, not just one layer of it. The canvas hands over the
  // box rather than the hits — the graph and the tinted regions are both this screen's data, so
  // this is the only place that could test them.
  const marqueeSelect = useCallback(
    (box: SelectionBox, _additive: boolean, mode: MarqueeMode) =>
      setSelection((cur) => mergeSelection(cur, hitsInBox(structure, resolved, box), mode)),
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
        // A locked member of the selection stays put while the rest are carried.
        const features = selection.flatMap((r) =>
          r.kind === "feature" ? structure.features.filter((f) => f.id === r.id && !f.locked && !followsWalls(f)).map((f) => ({ id: f.id, x: f.x, y: f.y })) : [],
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
  // ── the stage's edges: the sketch's own stairs and ramps (lib/venues/stage-edges.ts) ──────
  // The one edge item being edited (its grips on the plan, its bar under the canvas), and the stage
  // whose sides are lit for a new item of `kind`. A short hint for a refusal, as the sketch shows.
  const [activeEdge, setActiveEdge] = useState<{ featureId: string; itemId: string } | null>(null);
  const [edgePick, setEdgePick] = useState<{ featureId: string; kind: VenueEdgeKind } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const wallDistance = useMemo(() => wallDistanceOf(structure), [structure]);
  // An item or a stage that is gone, or no longer selected, takes its editing with it.
  if (activeEdge && !(isSelected(selection, "feature", activeEdge.featureId) && structure.features.some((f) => f.id === activeEdge.featureId && featureEdgeItems(f).some((it) => it.id === activeEdge.itemId)))) setActiveEdge(null);
  if (edgePick && !structure.features.some((f) => f.id === edgePick.featureId)) setEdgePick(null);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 3500);
    return () => clearTimeout(t);
  }, [hint]);
  const refusal = (reason: EdgeRefusal, kind: VenueEdgeKind): string =>
    reason === "wall"
      ? "הצד הזה צמוד לקיר — אין מקום. בחרו צד אחר"
      : reason === "flat"
        ? "הבמה לא גבוהה מהרצפה — אין לאן לעלות"
        : reason === "solid"
          ? "אי אפשר לשקוע מדרגות בצד הזה"
          : kind === "ramp"
            ? "הצד קצר מדי לרמפה"
            : "הצד קצר מדי לגרם מדרגות";
  const selectEdgeItem = useCallback((featureId: string, itemId: string | null) => setActiveEdge(itemId ? { featureId, itemId } : null), []);
  /** A slide or a grip, frame by frame: the item as it stands now, and — from a grip — the items as
   *  they stood when the press began, so a neighbour is trimmed against THAT (shareSide). */
  const dragEdgeItem = useCallback(
    (featureId: string, item: StageStair, from?: StageStair[]) => {
      dragStructure((s) => {
        const f = s.features.find((x) => x.id === featureId);
        if (!f) return s;
        const base = from ?? featureEdgeItems(f);
        const replaced = base.map((x) => (x.id === item.id ? item : x));
        return setEdgeItems(s, featureId, from ? shareSide({ ...featureStage(f), stairs: replaced }, item.id) : replaced);
      });
    },
    [dragStructure],
  );
  /** A side clicked while a kind is armed: the item lands there, settled against the walls. */
  const pickEdge = useCallback(
    (featureId: string, edge: number, t: number) => {
      const kind = edgePick?.kind ?? "stairs";
      const r = addEdgeItemAt(structure, featureId, kind, edge, t, wallDistance);
      if (!r.ok) {
        setHint(refusal(r.reason, kind));
        return;
      }
      setEdgePick(null);
      editStructure(() => r.structure);
      setSelection([{ kind: "feature", id: featureId }]);
      setActiveEdge({ featureId, itemId: r.item.id });
      if (r.item.inner) setHint("אין מספיק מקום מחוץ לבמה בצד הזה — המדרגות שוקעות לתוך הבמה");
    },
    [edgePick, structure, wallDistance, editStructure],
  );
  const changeEdge = useCallback(
    (featureId: string, itemId: string, patch: { kind?: VenueEdgeKind; widthMm?: number; risers?: number | null; full?: boolean; inner?: boolean }) => {
      const r = changeEdgeItem(structure, featureId, itemId, patch, wallDistance);
      if (!r.ok) {
        setHint(r.reason === "solid" ? "אי אפשר לשקוע מדרגות בצד הזה" : patch.inner ? "הצד הזה צמוד לקיר — אין מאיפה לעלות" : "אין מספיק מקום מחוץ לבמה בצד הזה — רק פנימי");
        return;
      }
      editStructure(() => r.structure);
    },
    [structure, wallDistance, editStructure],
  );
  const removeEdge = useCallback(
    (featureId: string, itemId: string) => {
      setActiveEdge(null);
      editStructure((s) => removeEdgeItem(s, featureId, itemId));
    },
    [editStructure],
  );
  const fillEdges = useCallback((featureId: string, kind: VenueEdgeKind) => editStructure((s) => fillFeatureEdges(s, featureId, kind, wallDistance)), [editStructure, wallDistance]);
  const startEdge = useCallback((featureId: string, kind: VenueEdgeKind) => {
    setActiveEdge(null);
    setEdgePick((cur) => (cur && cur.featureId === featureId && cur.kind === kind ? null : { featureId, kind }));
  }, []);

  // Dragging one of a feature's resize handles — the layer has already done the geometry (which
  // edge stays anchored, whether Shift is locking width:depth together), this just amends it into
  // the live drag's history entry the same way every other in-progress edit on this plan does.
  const resizeFeature = useCallback(
    (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => {
      dragStructure((s) => updateFeature(s, id, patch));
    },
    [dragStructure],
  );

  // One end of a curtain slid along its wall (lib/venues/curtain.ts): the point lands at a fraction
  // of the wall, the span and the box are re-laid from it, amended into the live gesture's entry.
  const curtainEnd = useCallback(
    (id: string, end: "from" | "to", p: Point) => {
      dragStructure((s) => {
        const f = s.features.find((x) => x.id === id);
        const t = f ? curtainEndT(s, f, p) : null;
        return f && t !== null ? updateFeature(s, id, curtainPatch(s, f, { [end]: t })) : s;
      });
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
  const finishRegion = useCallback(
    (boundary: Point[]) => {
      setDraftZone({ source: { type: "region", boundary }, name: "", kind: "open", ...(regionFor === "surface" ? { intent: "surface" as const } : {}) });
      setRegion(null);
    },
    [regionFor],
  );

  // Esc still ends a wall run or abandons a half-drawn region (and always clears the selection) —
  // but Enter is the documented way to finish a wall run now, closer to how Enter closes a region
  // a few lines down than to a "cancel" key. Delete removes whatever is selected. The typing guard
  // is load-bearing on that last one — without it, a Backspace while correcting a zone's name
  // would delete the zone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A modal open over the plan (a zone's edit dialog, its delete question, the underlay crop)
      // owns the keyboard. The plan behind it is inert, so its shortcuts are too: Delete pressed on
      // a button in the zone dialog would otherwise delete the zone selected behind it, unasked,
      // and Escape would clear the selection as well as closing the dialog.
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        // One step back per press, innermost first — the sketch's cascade. One Escape used to drop
        // everything at once: the tool in hand, the half-drawn room and the selection together.
        if (outlineEditId) setOutlineEditId(null);
        else if (edgePick) setEdgePick(null);
        else if (activeEdge) setActiveEdge(null);
        else if (addMenuOpen) setAddMenuOpen(false);
        else if (armedToolId) setArmedToolId(null);
        else if (region) setRegion(null);
        else if (runNodeId) setRunNodeId(null);
        else if (draftZone) setDraftZone(null);
        else if (handTool) setHandTool(false);
        else setSelection([]);
        return;
      }
      if (isTypingTarget()) return;
      // A viewer's keyboard edits nothing — no delete, paste, select-all, nudge or restack.
      if (readOnly) return;
      if (e.key === "Enter" && mode === "walls" && runNodeId) {
        e.preventDefault();
        setRunNodeId(null);
      } else if (e.key === "Enter" && region && region.length >= 3) {
        finishRegion(region);
      } else if ((e.key === "Delete" || e.key === "Backspace") && activeEdge) {
        // The edge item being edited goes, not the stage it stands on.
        e.preventDefault();
        removeEdge(activeEdge.featureId, activeEdge.itemId);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection.length > 0) {
        e.preventDefault();
        deleteSelection();
      } else if (e.code === "KeyH" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // e.code: on a Hebrew layout H types "י". The same key every design tool gives its hand.
        setHandTool((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && isShortcut(e, "c")) {
        copySelection();
      } else if ((e.ctrlKey || e.metaKey) && isShortcut(e, "x")) {
        e.preventDefault();
        cutSelection();
      } else if ((e.ctrlKey || e.metaKey) && isShortcut(e, "v")) {
        e.preventDefault();
        pasteClip();
      } else if ((e.ctrlKey || e.metaKey) && isShortcut(e, "a") && mode === "select") {
        // Everything with a place of its own on the plan.
        e.preventDefault();
        setSelection([
          ...structure.features.map((f) => ({ kind: "feature" as const, id: f.id })),
          ...structure.walls.map((w) => ({ kind: "wall" as const, id: w.id })),
          ...structure.nodes.map((n) => ({ kind: "node" as const, id: n.id })),
          ...structure.entrances.map((d) => ({ kind: "door" as const, id: d.id })),
        ]);
      } else if (e.key.startsWith("Arrow") && !e.defaultPrevented && selection.some((r) => r.kind === "feature" || r.kind === "node")) {
        // 10cm, with Shift 50cm — the sketch's nudge. In SCREEN direction: a plan is a picture, and
        // → is to the right of it whatever the page direction. A locked feature stays put.
        e.preventDefault();
        const step = e.shiftKey ? 500 : 100;
        const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        if (dx || dy)
          editStructure((st) => {
            let next = st;
            for (const r of selection) {
              if (r.kind === "feature") {
                const f = next.features.find((x) => x.id === r.id);
                if (f && !f.locked && !followsWalls(f)) next = updateFeature(next, r.id, { x: f.x + dx, y: f.y + dy });
              } else if (r.kind === "node") {
                const n = next.nodes.find((x) => x.id === r.id);
                if (n) next = moveNode(next, r.id, { x: n.x + dx, y: n.y + dy });
              }
            }
            return next;
          });
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyL" && selection.some((r) => r.kind === "feature")) {
        // Lock / unlock the selected features — Figma's own chord. e.code: a Hebrew layout types "ך".
        e.preventDefault();
        const ids = selection.filter((r) => r.kind === "feature").map((r) => r.id);
        setLocked(ids, !ids.every((id) => structure.features.find((f) => f.id === id)?.locked));
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyD" && selection.some((r) => r.kind === "feature")) {
        // e.code, not e.key: on a Hebrew layout the D key types "ג".
        e.preventDefault(); // the browser's own Ctrl+D is "bookmark this page"
        duplicateSelection();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === "BracketRight" || e.code === "BracketLeft") &&
        selection.some((r) => r.kind === "feature")
      ) {
        e.preventDefault();
        const up = e.code === "BracketRight";
        restackSelection(e.shiftKey ? (up ? "front" : "back") : up ? "forward" : "backward");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, mode, runNodeId, region, selection, structure, addMenuOpen, armedToolId, draftZone, handTool, activeEdge, edgePick, outlineEditId, removeEdge, deleteSelection, duplicateSelection, restackSelection, finishRegion, setLocked, copySelection, cutSelection, pasteClip, editStructure]);

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
  const isZoneFace = (face: Face): boolean =>
    resolved.some((r) => r.zone.source.type === "face" && faceAt(faces, r.zone.source.anchor) === face);
  const tryNameEnclosedFace = (p: Point): boolean => {
    const face = faceAt(faces, p);
    if (!face) return false; // nothing enclosed here — the region tool is the way to name open ground
    if (isZoneFace(face)) return false;
    setDraftZone({ source: { type: "face", anchor: p }, name: "", kind: "hall" });
    return true;
  };

  /** A closed shape laid wall to wall in `material`, WITHOUT naming it a zone (the user, 2026-10-17):
   *  a surface that follows the walls round it. A shape that already has one changes its material
   *  instead of growing a second floor on the first. */
  const layInFace = (face: Face, material: SurfaceMaterial) => {
    const existing = surfaceFilling(structure, face, faces);
    if (existing) {
      editStructure((s) => updateFeature(s, existing.id, surfaceMaterialPatch(existing, material)));
      setSelection([{ kind: "feature", id: existing.id }]);
      return;
    }
    const { structure: next, featureId } = addSurfaceUnder(structure, surfaceInFace(face, material));
    editStructure(() => next);
    setSelection([{ kind: "feature", id: featureId }]);
    setHint(`השטח הסגור נפרש ב${SURFACE_MATERIAL_LABEL[material]} · המשטח צמוד לקירות שסביבו`);
  };

  /** The draft's other answer: not a zone, a surface — the closed shape filled, or the trace laid. */
  const saveDraftSurface = (material: SurfaceMaterial) => {
    if (!draftZone) return;
    const src = draftZone.source;
    if (src.type === "face") {
      const face = faceAt(faces, src.anchor);
      if (face) layInFace(face, material);
      // Mid wall-run (a wall that closed a loop): keep drawing, nothing to select.
      if (mode === "walls") setSelection([]);
    } else {
      // A trace, or the area round the features picked — laid as a free surface of that outline.
      const boundary = src.type === "region" ? src.boundary : (draftBoundary ?? []);
      if (boundary.length >= 3) {
        const { structure: next, featureId } = addSurfaceUnder(structure, surfaceFromBoundary(boundary, material));
        editStructure(() => next);
        setSelection([{ kind: "feature", id: featureId }]);
      }
      setMode("select");
    }
    setDraftZone(null);
  };

  /** The draft's third answer: a BUILDING — the closed shape (or the trace) as a roofed block of the
   *  typed height, not a zone (lib/venues/face-surfaces.ts; the user, 2026-10-30: the service block
   *  between אמרה's halls). A shape that already holds one gets its height changed instead. */
  const saveDraftBuilding = (heightMm: number) => {
    if (!draftZone) return;
    const src = draftZone.source;
    if (src.type === "face") {
      const face = faceAt(faces, src.anchor);
      if (face) {
        const existing = buildingFilling(structure, face, faces);
        if (existing) {
          editStructure((s) => updateFeature(s, existing.id, { heightMm }));
          setSelection([{ kind: "feature", id: existing.id }]);
        } else {
          const { structure: next, featureId } = addFeature(structure, buildingInFace(face, heightMm));
          editStructure(() => next);
          setSelection([{ kind: "feature", id: featureId }]);
          setHint("השטח הסגור הוא עכשיו מבנה עם תקרה · צמוד לקירות שסביבו, נעול במקומו");
        }
      }
      if (mode === "walls") setSelection([]);
    } else {
      const boundary = src.type === "region" ? src.boundary : (draftBoundary ?? []);
      if (boundary.length >= 3) {
        const { structure: next, featureId } = addFeature(structure, buildingFromBoundary(boundary, heightMm));
        editStructure(() => next);
        setSelection([{ kind: "feature", id: featureId }]);
      }
      setMode("select");
    }
    setDraftZone(null);
  };

  /** "ציור חופשי" in the flyout's ground section: the freehand trace, for a surface. */
  const startSurfaceDraw = () => {
    setMode("zones");
    setRegionFor("surface");
    setSelection([]);
    setDraftZone(null);
    setArmedToolId(null);
    setRegion([]);
  };

  /** A free surface's outline rewritten point by point — amended into one entry while a corner is
   *  dragged, like a freehand zone's. Baked flat and unturned (lib/venues/face-surfaces.ts asOutline). */
  const editSurfaceOutline = (id: string, fn: (b: Point[]) => Point[], during: "drag" | "edit" = "edit") => {
    const apply = (s: VenueStructure) => {
      const f = s.features.find((x) => x.id === id);
      return f ? updateFeature(s, id, asOutline(fn(featureWorldOutline(f)))) : s;
    };
    if (during === "drag") dragStructure(apply);
    else editStructure(apply);
  };

  const saveDraftZone = () => {
    if (!draftZone || !draftZone.name.trim()) return;
    const zone = newZone(venueId, draftZone.kind, draftZone.source, draftZone.name.trim());
    editZones((z) => [...z, zone]);
    setDraftZone(null);
    setSelection([{ kind: "zone", id: zone.id }]);
  };

  /** "הגדרה כאזור" — the selected features named as a zone of their own, without drawing round them
   *  (the user, 2026-10-17: the חופות at אמרה). The zone is the area round them, a margin wide, and
   *  follows them (lib/venues/feature-zones.ts). The draft asks its name like any other; the
   *  features stay selected under it, so what it is made of is lit while it is named. */
  const startFeatureZone = (ids: string[]) => {
    if (ids.length === 0) return;
    setSelection(ids.map((id) => ({ kind: "feature" as const, id })));
    setDraftZone({ source: { type: "features", featureIds: ids, marginMm: ZONE_MARGIN_MM }, name: "", kind: "canopy" });
  };

  /** "הגדרה כעמודים": the picked stacks of footprints become columns, one undo step, and the
   *  columns are the selection (each keeps its plinth's id — lib/venues/column.ts). */
  const defineAsColumns = (ids: string[]) => {
    const made = defineColumns(structure, ids).ids;
    if (made.length === 0) return;
    editStructure((s) => defineColumns(s, ids).structure);
    setSelection(made.map((id) => ({ kind: "feature" as const, id })));
    setHint(made.length === 1 ? "הוגדר עמוד" : `הוגדרו ${made.length} עמודים`);
  };

  /** A features zone re-made of the selection — how a feature is added to one, or taken out. */
  const setZoneFeatures = (zoneId: string, ids: string[]) => {
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone || zone.source.type !== "features" || ids.length === 0) return;
    patchZone(zoneId, { source: { ...zone.source, featureIds: ids } });
    setHint(`האזור ״${zone.name || "ללא שם"}״ מוגדר עכשיו לפי ${ids.length === 1 ? "אלמנט אחד" : `${ids.length} אלמנטים`}`);
  };

  const patchZone = (id: string, patch: Partial<Zone>) =>
    editZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const removeZone = (id: string) => {
    editZones((zs) => zs.filter((z) => z.id !== id));
    setSelection((s) => s.filter((r) => !(r.kind === "zone" && r.id === id)));
  };

  /** Opens a zone's edit dialog (the ✎ on its row). The zone is selected as well, so the tint
   *  behind the scrim is the one being edited and its outline handles are waiting when it closes. */
  const editZone = (zoneId: string) => {
    if (readOnly) return;
    setSelection([{ kind: "zone", id: zoneId }]);
    setEditingZoneId(zoneId);
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
  // A freshly-picked file waiting on the crop modal — null closes it. Set from the file input's
  // onChange instead of uploading straight away, so nothing reaches storage until "סיום".
  const [cropFile, setCropFile] = useState<File | null>(null);
  // The "pick an existing plan instead" list, collapsed by default — only the empty state offers it.
  const [pickerOpen, setPickerOpen] = useState(false);
  // The locked plan is pointer-transparent — that is what keeps it from being nudged — which also
  // left it with no answer at all when clicked: unlocking or removing it was a control in the side
  // panel nobody thought to look for. So a click that lands on the plan and nothing else gets the
  // Canva answer: a small bar with the unlock right there. It docks at the TOP of the canvas, not
  // at the pointer — at the pointer it sat on the very plan (and the walls traced over it) that
  // the designer had just clicked to look at.
  const [underlayChip, setUnderlayChip] = useState(false);
  const underlayChipRef = useRef<HTMLDivElement>(null);

  // Re-seeded when the property or its stored underlay changes — adjusted during render (React's
  // own pattern for state that follows a prop), so the old image never paints for a frame.
  const [underlayFor, setUnderlayFor] = useState<{ venueId: string; underlay: PlanUnderlay | undefined } | null>(null);
  if (underlayFor?.venueId !== venueId || underlayFor.underlay !== venue?.plan.underlay) {
    setUnderlayFor({ venueId, underlay: venue?.plan.underlay });
    setUnderlay(venue?.plan.underlay);
    setUnderlayUnlocked(false);
    setUnderlayChip(false);
    setCalib(null);
    setUnderlayNote(null);
    setCropFile(null);
    setPickerOpen(false);
  }

  // Other venues in the studio that already have a plan photo — reusing one skips a re-upload (and
  // a re-photograph) when two properties share the same source drawing. `venues` already comes from
  // fetchVenues(), already scoped to what this member can see, so no extra fetch or access check.
  const reusableUnderlays = venues.filter((v) => v.id !== venueId && v.plan.underlay?.url);

  /** Write the plan back to the venue. Separate from saveVenuePlan (walls and zones): this is the
   *  venue RECORD, and it needs `manager` where the graph needs `editor`. */
  const persistUnderlay = useCallback(
    async (next: PlanUnderlay | undefined) => {
      if (!venue || readOnly) return;
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

  // Reuse another venue's plan photo instead of uploading again. No upload call at all — the bytes
  // already exist at that URL; only the placement is fresh, since a source venue's x/y/scale/rotation
  // was calibrated for THAT property's plane and means nothing on this one (this venue still needs
  // its own calibration afterward, same as any new underlay).
  const reuseUnderlay = async (source: Venue) => {
    const u = source.plan.underlay;
    if (!u?.url) return;
    setPickerOpen(false);
    setUnderlayBusy(true);
    setUnderlayNote(null);
    try {
      const { width, height } = await imageSize(u.url);
      const placed = placeUnderlay(u.url, u.fileName, width, height);
      setUnderlay(placed);
      setUnderlayUnlocked(true);
      await persistUnderlay(placed);
      setUnderlayNote("כעת כיילו: סמנו קטע שאורכו ידוע לכם");
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
  // Read live from the resolved list, so the dialog shows every edit as it lands and closes by
  // itself if an undo takes the zone away.
  const editingZone = editingZoneId ? resolved.find((r) => r.zone.id === editingZoneId) : undefined;
  const isSelectMode = mode === "select";
  // Selecting, dragging, resizing, placing — none of it for a viewer (lib/venues/access.ts): the plan
  // is shown, panned and zoomed, and that is all.
  const acts = isSelectMode && !readOnly;
  // Placing something: the next click is the canvas's, not a feature's (see NEVER).
  const placing = !!armedTool || !!calib;
  // The one freehand zone whose outline is open for editing: exactly one zone selected, and drawn
  // freehand (a face zone is reshaped through its walls, which the canvas already hands you).
  const editableRegion =
    isSelectMode && selection.length === 1 && selection[0].kind === "zone"
      ? zones.find((z) => z.id === selection[0].id && z.source.type === "region")
      : undefined;
  // The zones made of features, with the members still on the plan — the bar's "אזור" offers to re-make
  // one of them out of the selection.
  const featureZones = zones.flatMap((z) =>
    z.source.type === "features" ? [{ id: z.id, name: z.name, featureIds: presentFeatureIds(structure.features, z.source.featureIds) }] : [],
  );
  // The free surface open for point editing — gone the moment it is not the one thing selected.
  const outlineSurface =
    outlineEditId && isSelectMode && selection.length === 1 && selection[0].kind === "feature" && selection[0].id === outlineEditId
      ? structure.features.find((f) => f.id === outlineEditId && f.kind === "surface" && !f.locked && !followsWalls(f))
      : undefined;
  if (outlineEditId && !outlineSurface) setOutlineEditId(null);
  const outlineOfSurface = useMemo(() => (outlineSurface ? featureWorldOutline(outlineSurface) : null), [outlineSurface]);

  // ⚠ NOTHING FRAMES ITSELF ON SELECTION HERE, and that is deliberate. Picking a stage, a bar or a
  // pool on the plan used to travel the view onto it, on the argument that you were about to edit
  // it — but the object was already under the pointer that just clicked it, so the move started
  // from "I can see this" and every one of them was the screen taking the view away from wherever
  // the designer had put it. Ten placements in a row is ten unasked-for journeys.
  //
  // The zone list was the last exception — a click on a row flew the canvas onto the zone — and
  // the user asked for it to go (2026-10-16): a row click now only selects, and the ✎ beside it
  // opens the zone's fields in a dialog. Framing on the row comes back only if asked for.
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
      addOpeningNear(p, tool.id === "window" ? "window" : "door");
      return;
    }
    if (tool.kind === "curtain") {
      addCurtainNear(p);
      return;
    }
    // A ground clicked inside a closed shape that is not a zone fills that shape, wall to wall — the
    // way to pave a path or plant a bed outlined with boundary lines. Inside a zone (its floor is the
    // zone's own "משטח") or on open ground it lays a piece to size, as before.
    if (tool.kind === "surface" && tool.surface) {
      const face = faceAt(faces, p);
      if (face && !isZoneFace(face)) {
        layInFace(face, tool.surface);
        return;
      }
    }
    const { structure: next, featureId } = addFeature(
      structure,
      tool.kind === "seating"
        ? newSeatingFeature(p, tool.chair)
        : tool.product
          ? newFeatureFromProduct(tool.kind, tool.product, p)
          : newFeature(tool.kind, p, tool.plant ?? tool.surface),
    );
    // A stage lands with no flights, as the sketch's does (2026-10-30, the user: "put nothing"):
    // they are clicked onto its sides from the bar.
    editStructure(() => next);
    setSelection([{ kind: "feature", id: featureId }]);
  };

  /** The venue's curtain (lib/venues/curtain.ts) hung along the whole of the nearest wall, on the
   *  side of it the click fell — the bar shortens the stretch. A boundary line takes none; a bowed
   *  wall takes one round its bow. */
  const addCurtainNear = (p: Point) => {
    const hit = nearestWall(structure, p);
    const wall = hit ? structure.walls.find((w) => w.id === hit.wallId) : null;
    if (!hit || !wall || wall.kind === "edge") {
      setHint("וילון נתלה על קיר — לחצו ליד קיר");
      return;
    }
    const made = newCurtain(structure, wall.id, p);
    if (!made) return;
    const { structure: next, featureId } = addFeature(structure, made);
    editStructure(() => next);
    setSelection([{ kind: "feature", id: featureId }]);
  };

  /** A door — or a window, the same opening with glass in it (StructureEntrance.kind) — hung on
   *  the nearest wall where the click fell. A new window is a ויטרינה: glass from the floor to the
   *  wall's top, as אמרה's halls are glazed; the bar gives it a sill and a head. */
  const addOpeningNear = (p: Point, kind: "door" | "window") => {
    const hit = nearestWall(structure, p);
    if (!hit) return;
    const wall = structure.walls.find((w) => w.id === hit.wallId);
    if (!wall || wall.kind === "edge") return; // a boundary line is not something you hang a door on
    const { structure: next, entranceId } = addEntrance(
      structure,
      kind === "window"
        ? { wallId: hit.wallId, distanceMm: hit.distanceMm, widthMm: 2000, swingInward: false, doubleDoor: false, kind: "window" }
        : { wallId: hit.wallId, distanceMm: hit.distanceMm, widthMm: 1600, swingInward: true, doubleDoor: true },
    );
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
    if (tryNameEnclosedFace(p)) return;
    const onLockedPlan =
      !!underlay?.url && !underlayUnlocked && !calib && pointInPolygon(p, underlayCorners(underlay));
    setUnderlayChip(onLockedPlan);
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
          remains" instead of losing to it gracefully once space is tight.
          The explicit row (lg:grid-rows-[minmax(0,1fr)]) is load-bearing too: an implicit grid row
          is `auto`, which grows to its tallest item's content — and the zone panel's content is
          the whole zone list, scroller or not. A long list stretched the row past the page, the
          canvas stretched with it (lg:h-full), and the bottom dock went below the fold. */}
      <div className="grid min-h-0 flex-1 gap-x-4 gap-y-3 lg:grid-cols-[1fr_auto] lg:grid-rows-[minmax(0,1fr)]">
        {/* The sketch's canvas card (app/meeting/meeting-screen.tsx CanvasCard, app/(app)/studio/
            toolbar.tsx): a white card with a toolbar along its top, the canvas filling the rest,
            PlanCanvas's own tool strip in the top corner and the selection's bar at the bottom
            centre. It was a lavender plane with a bottom dock and a side panel; the user asked for
            the two canvases to be one canvas (2026-10-16). */}
        <section className="relative flex min-h-96 flex-col overflow-hidden rounded-md bg-surface shadow-floating lg:h-full lg:min-h-0">
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
            {/* A viewer gets no tools: nothing here would do anything but look like it might. */}
            {!readOnly && (
              <>
            <div className="flex items-center gap-0.5">
              <IconButton label="בטל · Ctrl+Z" size="md" onClick={hist.undo} disabled={!hist.canUndo}>
                <Undo2 className="h-4 w-4" strokeWidth={2} />
              </IconButton>
              <IconButton label="בצע שוב · Ctrl+Shift+Z" size="md" onClick={hist.redo} disabled={!hist.canRedo}>
                <Redo2 className="h-4 w-4" strokeWidth={2} />
              </IconButton>
            </div>
            <div className="mx-1 h-6 w-px bg-border" />
            {/* The clipboard, with a face, beside undo/redo as on the sketch: what just happened to
                the plan, rather than what is true of the selection. */}
            <div className="flex items-center gap-0.5">
              <IconButton label="העתקה · Ctrl+C" size="md" onClick={copySelection} disabled={featureSelection.length === 0}>
                <Copy className="h-4 w-4" strokeWidth={2} />
              </IconButton>
              <IconButton label="גזירה · Ctrl+X" size="md" onClick={cutSelection} disabled={featureSelection.length === 0}>
                <Scissors className="h-4 w-4" strokeWidth={2} />
              </IconButton>
              <IconButton label="הדבקה · Ctrl+V" size="md" onClick={pasteClip} disabled={clip.length === 0}>
                <ClipboardPaste className="h-4 w-4" strokeWidth={2} />
              </IconButton>
            </div>
            <div className="mx-1 h-6 w-px bg-border" />
            {/* The tools: draw walls (with the wall/boundary choice beside it while drawing), the
                add-element flyout, the pointer and the hand. */}
            <div className="flex items-center gap-1">
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
                      carrying that row's shape and size. Opens DOWN, out of this toolbar. */}
                  <AddElementFlyout
                    open={addMenuOpen}
                    onOpenChange={setAddMenuOpen}
                    side="bottom"
                    items={tools.flatMap((tool, i) => {
                      const item = {
                        id: tool.id,
                        label: tool.label,
                        section: tool.section,
                        title: tool.surface
                          ? `${tool.label} — לחיצה בשטח סגור ממלאת אותו מקיר לקיר; בשטח פתוח מניחה משטח לשינוי גודל`
                          : tool.kind === "seating"
                            ? `${tool.label} — חמש שורות של חמישה${tool.chair ? ` · ${tool.chair.name}` : ""}; השורות, הרווחים ומעבר באמצע בסרגל`
                            : tool.product
                            ? `${tool.label} · ${formatDimensions(tool.product.dimensions)}`
                            : tool.label,
                        disabled: (tool.id === "entrance" || tool.id === "window" || tool.id === "curtain") && !structure.walls.some((w) => w.kind === "wall"),
                        preview: <ToolPreview tool={tool} />,
                      };
                      const firstGround = tool.section === "ground" && tools[i - 1]?.section !== "ground";
                      return firstGround
                        ? [
                            {
                              id: DRAW_SURFACE,
                              label: "ציור חופשי",
                              section: "ground",
                              title: "ציור משטח בכל צורה — לחיצה לכל פינה, Enter לסגירה, ואז בחירת החומר",
                              preview: <DrawSurfacePreview />,
                            },
                            item,
                          ]
                        : [item];
                    })}
                    sections={ADD_TOOL_SECTIONS.map((id) => ({ id, label: ADD_TOOL_SECTION_LABEL[id] }))}
                    armedId={armedTool?.id ?? null}
                    triggerIcon={armedTool ? ADD_TOOL_ICON[addToolIconKey(armedTool)] : undefined}
                    onPick={(toolId) => {
                      setAddMenuOpen(false);
                      if (toolId === DRAW_SURFACE) {
                        startSurfaceDraw();
                        return;
                      }
                      setArmedToolId((id) => (id === toolId ? null : toolId));
                    }}
                  />
                  <div className="mx-0.5 h-5 w-px bg-border" />
                </>
              )}
              <button
                type="button"
                title="מצב בחירה"
                aria-pressed={isSelectMode && !armedTool && !handTool}
                onClick={() => {
                  if (!isSelectMode) {
                    setMode("select");
                    setRunNodeId(null);
                    setRegion(null);
                    setDraftZone(null);
                  }
                  setHandTool(false);
                  setArmedToolId(null);
                  setAddMenuOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  isSelectMode && !armedTool && !handTool ? "bg-accent-tint text-accent" : "text-muted hover:bg-inset"
                }`}
              >
                <MousePointer2 className="h-[18px] w-[18px]" strokeWidth={1.6} />
                בחירה
              </button>
              <button
                type="button"
                title="הזזת התצוגה (H) · גם: רווח + גרירה, או גלגלת עם שתי אצבעות"
                aria-pressed={handTool}
                onClick={() => {
                  setHandTool((v) => !v);
                  setArmedToolId(null);
                  setAddMenuOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  handTool ? "bg-accent-tint text-accent" : "text-muted hover:bg-inset"
                }`}
              >
                <Hand className="h-[18px] w-[18px]" strokeWidth={1.6} />
                הזזה
              </button>
            </div>
              </>
            )}
            {/* Which property, and whether it is written down — at the toolbar's end, where the
                sketch keeps its own save state. There is no save button on this screen and never
                was: a write that fails has to say so itself. */}
            <div className="ms-auto flex min-w-0 items-center gap-3">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-bold text-accent-deep">
                <Building2 className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
                <span className="truncate">{venue?.name ?? "מקום"}</span>
              </span>
              <div className="flex shrink-0 items-center gap-1.5 text-xs" aria-live="polite">
                {readOnly ? (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                    צפייה בלבד
                  </span>
                ) : saveState === "saving" ? (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                    שומר…
                  </span>
                ) : saveState === "error" ? (
                  <button
                    type="button"
                    onClick={retrySave}
                    className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-warn-ink transition-colors hover:bg-warn-tint"
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
          </header>

          <div
          className="relative min-h-0 flex-1"
          onPointerMove={(e) => {
            if (mode === "select") return;
            const r = e.currentTarget.getBoundingClientRect();
            setCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
          }}
          onPointerLeave={() => setCursorPos(null)}
          // Any press outside the locked-plan chip dismisses it; a click that lands on the plan again
          // re-opens it at the new spot (onSelectModeCanvasClick).
          onPointerDownCapture={(e) => {
            if (!underlayChipRef.current?.contains(e.target as Node)) setUnderlayChip(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setUnderlayChip(false);
          }}
        >
          {/* Docked top-centre, clear of the plan. It offers the ACTION, not the state: locked shows
              only "שחרור נעילה", unlocked only "נעילה" — a "רקע נעול" label beside an unlock button
              said the same thing twice. While unlocked it stays up on its own (a dragged plan is
              pointer-captured, so no click reaches onSelectModeCanvasClick to open it), which is
              also what keeps the way back to locked in sight for the whole time it is open. */}
          {underlay?.url && !calib && (underlayChip || underlayUnlocked) && (
            <div
              ref={underlayChipRef}
              role="dialog"
              aria-label="תוכנית רקע"
              className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border bg-canvas p-1 text-xs shadow-lifted"
            >
              <button
                autoFocus={!underlayUnlocked}
                onClick={() => {
                  setUnderlayUnlocked((v) => !v);
                  setUnderlayChip(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 font-semibold text-accent hover:bg-accent-tint focus-visible:bg-accent-tint focus-visible:outline-none"
              >
                {underlayUnlocked ? (
                  <Lock className="h-3.5 w-3.5" strokeWidth={1.6} />
                ) : (
                  <Unlock className="h-3.5 w-3.5" strokeWidth={1.6} />
                )}
                {underlayUnlocked ? "נעילה" : "שחרור נעילה"}
              </button>
              <button
                onClick={() => {
                  setUnderlayChip(false);
                  void removeUnderlay();
                }}
                className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 font-semibold text-alert hover:bg-inset focus-visible:bg-inset focus-visible:outline-none"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                הסרה
              </button>
            </div>
          )}
          {/* A zone the save refused to delete because events stand on it. Not an error — the rest
              of the plan was written — so it reads as a note on the canvas rather than turning the
              toolbar's indicator red. */}
          {/* A property this business may look at but not draw on — everybody sees the same venue,
              and the one who created it decides who edits (settings → שיתוף מתחם). */}
          {readOnly && ready && (
            <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-md">
              <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium leading-relaxed text-ink-soft shadow-floating">
                צפייה בלבד
                {venue?.ownerName ? ` — המתחם של ${venue.ownerName}` : ""}. רק מי שמנהל את המתחם יכול לאפשר עריכה.
              </p>
            </div>
          )}
          {planNote && (
            <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-md">
              <p className="rounded-md border border-border bg-warn-tint px-3 py-2 text-xs font-medium leading-relaxed text-warn-ink shadow-floating">
                {planNote}
              </p>
            </div>
          )}

          {/* A refusal or a note — the sketch's own toast, for the moment it is read. */}
          {hint && (
            <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center">
              <p className="rounded-md bg-ink px-3 py-1.5 text-sm text-canvas shadow-dialog">{hint}</p>
            </div>
          )}

            {/* The app's one canvas. It owns the viewport, grid, pan/zoom, snapping, undo buttons and
                the wall graph itself; this screen supplies only the zone tints beneath, the doors
                above, and what a click means in the current mode. */}
          <PlanCanvas
            mode={isSelectMode ? "edit" : "draw"}
            panTool={handTool || readOnly}
            outline={[]}
            edgeCurves={[]}
            selected={[]}
            onSelect={() => setSelection([])}
            onAddVertex={readOnly ? IGNORE_EDIT : onPick}
            contextMenuItems={acts ? featureMenuItems : undefined}
            onCloseOutline={() => {}}
            onCancelDraw={() => {
              setRunNodeId(null);
              setRegion(null);
            }}
            onMoveVertex={() => {}}
            onMoveWallHandle={() => {}}
            graph={structure}
            onMoveGraphNode={acts ? (id, p) => moveWithGroup("node", id, p) : undefined}
            // Bowing a wall is a drag like any other: amended into one history entry, closed by
            // onCommit. A wall is bowed in place — no node moves — so the rooms either side of a
            // shared wall follow the curve together, exactly as they follow a dragged corner.
            onCurveGraphWall={
              acts
                ? (wallId, which, p) =>
                    dragStructure((s) =>
                      which === "bulge" ? bulgeWall(s, wallId, p) : moveWallControlPoint(s, wallId, which, p),
                    )
                : undefined
            }
            graphSelection={graphSelection}
            onSelectGraph={acts ? (ref, additive) => pick(ref, additive) : undefined}
            onMarquee={acts ? marqueeSelect : undefined}
            onCommit={endGesture}
            drawFrom={region?.length ? region[region.length - 1] : runNode ? { x: runNode.x, y: runNode.y } : null}
            // The floating add-toolbar arms one of these instead of a right-click menu handing over
            // a point directly — so placement goes through the same "next empty-canvas click" path
            // every other click-to-place tool on this canvas already uses.
            cursor={armedTool ? "crosshair" : "default"}
            onCanvasClick={acts ? onSelectModeCanvasClick : undefined}
            // The grid pattern's own line colour is tuned for the white bg-canvas every other host
            // still uses; against this screen's own light-purple canvas it was nearly invisible
            // (text-border and accent-tint sit a hair apart in value). accent-line is the same
            // family, several steps darker, chosen for contrast against this one background.
            onDropAt={
              acts
                ? (e, p) => {
                    const tool = findAddTool(tools, e.dataTransfer.getData("text/plain"));
                    if (tool) placeTool(tool, p);
                  }
                : undefined
            }
            // The rotate knob, last of all: above the walls' hit lines and every length the canvas
            // writes, so none of them can cover it or take its press (the user, 2026-10-17).
            topmost={({ mm, clientToMm }) =>
              acts && !placing ? (
                <FeatureRotateHandles
                  structure={structure}
                  selectedIds={outlineSurface ? [] : featureSelection}
                  onRotate={rotateFeature}
                  onCommit={endGesture}
                  clientToMm={clientToMm}
                  mm={mm}
                />
              ) : null
            }
            backdrop={({ clientToMm, mm, snap }) => {
              closeSnapMmRef.current = mm(16); // 16px, matching the outline tool's own SNAP_PX
              const closable = region !== null && region.length >= 3;
              return (
                <>
                  {/* FIRST — the traced-over plan sits under the zone tints, the features and the
                      walls the canvas draws itself. Draggable only while explicitly unlocked, and
                      never while a calibration is being marked (the clicks belong to that). */}
                  <PlanUnderlayLayer
                    underlay={underlay}
                    selected={!!underlayChip && !underlayUnlocked}
                    clientToMm={clientToMm}
                    onMove={
                      underlayUnlocked && !calib ? (p) => patchUnderlay({ x: p.x, y: p.y }) : undefined
                    }
                    onCommit={() => void persistUnderlay(underlay)}
                  />
                  <ZoneRegions
                    zones={resolved}
                    selectedIds={selectedZoneIds}
                    onSelect={acts ? (id, additive) => pick({ kind: "zone", id }, additive) : undefined}
                    mm={mm}
                  />
                  {draftBoundary && draftBoundary.length >= 3 && (
                    <polygon
                      points={draftBoundary.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="var(--color-accent-tint)"
                      fillOpacity={0.55}
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )}
                  <StructureFeatures
                    structure={structure}
                    mm={mm}
                    interactive={placing || readOnly ? NEVER : undefined}
                    selectedIds={selection.filter((s) => s.kind === "feature").map((s) => s.id)}
                    onSelect={acts ? (id, additive) => pick({ kind: "feature", id }, additive) : undefined}
                    onMove={acts ? (id, p, free) => moveWithGroup("feature", id, free ? p : snapFeatureAt(id, p, snap)) : undefined}
                    onResize={acts && !outlineSurface ? resizeFeature : undefined}
                    onCurtainEnd={acts && !outlineSurface ? curtainEnd : undefined}
                    // The knob is NOT drawn here but in `topmost` below, above every wall and figure.
                    activeEdgeItem={activeEdge}
                    onSelectEdgeItem={acts ? selectEdgeItem : undefined}
                    onEdgeItemChange={acts ? dragEdgeItem : undefined}
                    edgePick={edgePick}
                    onPickEdge={acts ? pickEdge : undefined}
                    wallDistance={wallDistance}
                    onContextMenu={acts ? (id) => (contextFeatureRef.current = id) : undefined}
                    onCommit={endGesture}
                    clientToMm={clientToMm}
                  />
                  {editableRegion && editableRegion.source.type === "region" && (
                    <RegionOutlineEditor
                      boundary={editableRegion.source.boundary}
                      mm={mm}
                      clientToMm={clientToMm}
                      onMovePoint={(i, to) => editRegion(editableRegion.id, (b) => moveRegionPoint(b, i, to), "drag")}
                      onInsertPoint={(i) => {
                        // The new corner is part of the drag that made it: undo takes both back at once.
                        editRegion(editableRegion.id, (b) => insertRegionPoint(b, i).boundary, "drag");
                        return i + 1;
                      }}
                      onRemovePoint={(i) => editRegion(editableRegion.id, (b) => removeRegionPoint(b, i))}
                      onCommit={endGesture}
                    />
                  )}
                  {outlineSurface && outlineOfSurface && (
                    <RegionOutlineEditor
                      boundary={outlineOfSurface}
                      mm={mm}
                      clientToMm={clientToMm}
                      onMovePoint={(i, to) => editSurfaceOutline(outlineSurface.id, (b) => moveRegionPoint(b, i, to), "drag")}
                      onInsertPoint={(i) => {
                        editSurfaceOutline(outlineSurface.id, (b) => insertRegionPoint(b, i).boundary, "drag");
                        return i + 1;
                      }}
                      onRemovePoint={(i) => editSurfaceOutline(outlineSurface.id, (b) => removeRegionPoint(b, i))}
                      onCommit={endGesture}
                    />
                  )}
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
            overlay={({ mm, clientToMm, dims }) => (
              <>
                <StructureDoors
                  structure={structure}
                  selectedIds={selection.filter((s) => s.kind === "door").map((s) => s.id)}
                  onSelect={acts ? (id, additive) => pick({ kind: "door", id }, additive) : undefined}
                  onMove={acts ? (id, distanceMm) => dragStructure((s) => updateEntrance(s, id, { distanceMm })) : undefined}
                  onCommit={endGesture}
                  clientToMm={clientToMm}
                  mm={mm}
                />
                {/* The editor's own figures under "הצגת מידות" — element sizes, door chains, the
                    selected element's gaps to the walls, freehand zone sides — and the selected
                    door's chain always (components/venue-dims.tsx). */}
                <VenueDims
                  structure={structure}
                  zones={resolved}
                  dims={dims}
                  editingOutline={outlineOfSurface}
                  selectedFeatureIds={featureSelection}
                  selectedDoorIds={selection.filter((s) => s.kind === "door").map((s) => s.id)}
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
              {region !== null
                ? regionFor === "surface"
                  ? "הקיפו את המשטח בנקודות · Enter לסגירה · Esc לביטול"
                  : "הקיפו בנקודות · Enter לסגירה · Esc לביטול"
                : activeMode.hint}
            </div>
          )}

          {/* The selection's bar, bottom centre — the sketch's own place for it (app/(app)/studio/
              studio-screen.tsx), built from the same Bar and chips. A lone zone is the one selection
              with nothing to show here: its fields live in its edit dialog (the ✎ on its row). */}
          {(draftZone || (!soleZoneId && selection.length > 0)) && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center">
              <div className="pointer-events-auto flex min-w-0 justify-center">
                <SelectionBar
                  selection={selection}
                  structure={structure}
                  apply={editStructure}
                  onDelete={deleteSelection}
                  onDuplicate={featureSelection.length > 0 ? duplicateSelection : undefined}
                  onClose={() => setSelection([])}
                  onRestack={(how) => restackSelection(how)}
                  canRestack={(how) => canRestack(structure, featureSelection, how)}
                  onAlign={alignFeatures}
                  onLock={(locked) => setLocked(featureSelection, locked)}
                  activeEdge={activeEdge}
                  edgePick={edgePick}
                  wallDistance={wallDistance}
                  onSelectEdge={selectEdgeItem}
                  onEdgeChange={changeEdge}
                  onRemoveEdge={removeEdge}
                  onFillEdges={fillEdges}
                  onStartEdge={startEdge}
                  draftZone={draftZone}
                  onDraftZoneChange={(patch) => draftZone && setDraftZone({ ...draftZone, ...patch })}
                  featureZones={featureZones}
                  onFeatureZone={startFeatureZone}
                  onSetZoneFeatures={setZoneFeatures}
                  onSaveDraftZone={saveDraftZone}
                  onDraftSurface={saveDraftSurface}
                  onDraftBuilding={saveDraftBuilding}
                  onCancelDraftZone={() => setDraftZone(null)}
                  outlineEditId={outlineSurface?.id ?? null}
                  onToggleOutline={(id) => setOutlineEditId((cur) => (cur === id ? null : id))}
                  onDefineColumns={defineAsColumns}
                />
              </div>
            </div>
          )}
          </div>
        </section>

        {/* The zone-definition list — a dedicated sidebar column next to the canvas, not a layer
            floating on top of it (that was tried and explicitly walked back).
            It is the SAME card as the app's navigation, not a cousin of it: the shell, its white
            surface and shadow, the collapse puck and the width transition are all SidePanel's
            (components/side-panel.tsx), and this screen passes only size, padding and placement.
            It used to wrap its contents in a bg-bg shell around a lighter inner card — the shell
            vanished into the app plane, the card stood 16px short of the canvas at both ends, and
            the puck hung in the gap beside it. Full height (lg:h-full, the canvas's own lg:h-full
            next to it), so the two cards start and end on the same lines. A list too long for
            that height scrolls inside the panel (`scrolls`) instead of growing the page. Inside,
            the two sections are the nav's own inner-panel recipe: a hairline `bg-inset` well,
            like its profile card. */}
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
          className="p-4 lg:col-start-2 lg:h-full"
          expandedClassName="lg:w-[300px]"
          // The nav's own collapsed geometry (components/app-shell.tsx: w-[96px] px-2).
          collapsedClassName="lg:w-[96px] lg:px-2"
          // Two rows standing in for the two sections below, so the panel still reads as
          // "תוכנית רקע" + "אזורים (n)" even shrunk to a strip. They are the nav's own collapsed
          // rows (NavRow in components/app-shell.tsx: rounded-md, py-[11px], an 18px icon at 1.4,
          // muted, accent-tint on hover, gap-[3px] between), so the two collapsed panels match.
          // Either row re-expands the panel.
          rail={
            <div className="flex flex-col gap-[3px]">
              <button
                type="button"
                onClick={() => setPanelCollapsed(false)}
                title="תוכנית רקע"
                className="flex items-center justify-center rounded-md py-[11px] text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
              >
                <ImageIcon className="h-[18px] w-[18px]" strokeWidth={1.4} />
              </button>
              <button
                type="button"
                onClick={() => setPanelCollapsed(false)}
                title="הגדרת אזורים"
                className="flex items-center justify-center rounded-md py-[11px] text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
              >
                <span className="relative">
                  <Shapes className="h-[18px] w-[18px]" strokeWidth={1.4} />
                  <span
                    className="nums absolute -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-canvas"
                    style={{ insetInlineEnd: "-10px" }}
                  >
                    {zones.length}
                  </span>
                </span>
              </button>
            </div>
          }
        >
          {/* No card of its own any more: the panel IS the card (SidePanel's white surface), so the
              two sections sit straight on it. */}
          <div className="flex flex-col gap-3">
          {/* The traced-over plan is the editor's tool — a viewer has nothing to upload or move. */}
          {!readOnly && (
          <>
          {/* Tracing panel (F-3.5 + F-3.4) — its own section, sibling to the zone-definition one
              below: a background plan you place/calibrate isn't part of "defining zones", so it
              keeps that section focused on just that instead of growing a second concern into it. */}
          <div className="rounded-md border border-border bg-inset p-3.5">
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

                {pickerOpen ? (
                  <div className="rounded-sm border border-border bg-canvas p-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink">בחירה מתוכנית קיימת</span>
                      <button
                        type="button"
                        onClick={() => setPickerOpen(false)}
                        aria-label="סגירת הרשימה"
                        className="rounded-full p-0.5 text-muted hover:bg-inset hover:text-ink"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                    <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                      {reusableUnderlays.map((v) => (
                        <li key={v.id}>
                          <button
                            type="button"
                            disabled={underlayBusy}
                            onClick={() => void reuseUnderlay(v)}
                            className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-start hover:bg-inset disabled:opacity-50"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx */}
                            <img
                              src={v.plan.underlay!.url}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-sm object-cover"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-ink">{v.name}</span>
                              <span className="block truncate text-xs text-muted">{v.plan.underlay!.fileName}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
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
                          // obvious thing to do after a failed upload (or a cancelled crop).
                          e.target.value = "";
                          if (f) setCropFile(f);
                        }}
                      />
                    </label>
                    {reusableUnderlays.length > 0 && (
                      <button
                        type="button"
                        disabled={underlayBusy}
                        onClick={() => setPickerOpen(true)}
                        className="inline-flex items-center gap-2 rounded-sm border border-border bg-canvas px-3 py-1.5 text-sm font-semibold text-ink hover:bg-inset disabled:opacity-50"
                      >
                        <Images className="h-4 w-4" strokeWidth={1.4} />
                        בחירה מתוכנית קיימת
                      </button>
                    )}
                  </div>
                )}
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

          </>
          )}
          {/* A hairline well like the section above, and no shadow of its own: it sits INSIDE a
              floating card now, and a second lift inside the first reads as a card stacked on a
              card. The zone rows in it are white (bg-canvas) against the well. */}
          <div className="flex flex-col gap-2.5 rounded-md border border-border bg-inset p-3.5">
                <div>
                  {/* Title and badge share this one row (and nothing else), so items-center has
                      only their own single-line heights to centre against — sharing a row with the
                      two-line description too (as this used to) centres the badge against that
                      *combined* block instead, landing it between the two lines rather than level
                      with the title. */}
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-ink">הגדרת אזורים</h2>
                    <span className="nums flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-border bg-canvas px-1.5 text-xs font-semibold text-muted">
                      {zones.length}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    חלקו את המתחם לאזורים תפקודיים — לכל אחד שם, צבע ושטח.
                  </p>
                </div>

                {/* Naming happens on the selection bar under the canvas (SelectionBar's draft-zone
                    form) — the same place every other selection's fields live — not here; a
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
                      <div className="flex items-start">
                        <button
                          type="button"
                          // Selects, and nothing else — no framing, no fields opening under the row
                          // (the ✎ beside it is the way in to those, see ZoneDialog).
                          onClick={(e) => pick({ kind: "zone", id: r.zone.id }, isAdditiveClick(e))}
                          className="flex min-w-0 flex-1 flex-col gap-1.5 py-2.5 ps-3 text-start"
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
                              {r.zone.surface && <span>{SURFACE_MATERIAL_LABEL[r.zone.surface]}</span>}
                            </div>
                          )}
                        </button>
                        {/* Always there, at muted weight, level with the name — never a hover reveal
                            (CLAUDE.md: card actions). The margin centres the 28px puck on the title
                            line's own centre (py-2.5 + half of text-sm's 20px line). */}
                        {!readOnly && (
                          <IconButton
                            label={`עריכת האזור ${r.zone.name || "ללא שם"}`}
                            onClick={() => editZone(r.zone.id)}
                            className="m-1.5 shrink-0"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </IconButton>
                        )}
                      </div>
                      {r.detached && (
                        <p className="px-3 pb-2.5 text-xs text-alert">{detachedNote(r.zone)}</p>
                      )}
                    </div>
                  );
                })}

                {/* The dashed "draw a new zone" shortcut the reference card carries at the bottom
                    of its list — jumps straight to the region tool rather than just switching
                    modes, since that's the tool a zone with no walls to detect actually needs. */}
                {!readOnly && <button
                  type="button"
                  onClick={() => {
                    setMode("zones");
                    setRegionFor("zone");
                    setSelection([]);
                    setDraftZone(null);
                    setRegion([]);
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent-line bg-accent-tint px-3 py-2.5 text-sm font-bold text-accent transition-colors hover:border-solid hover:bg-indigo-100"
                >
                  <Plus className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                  שרטוט אזור חדש
                </button>}

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

      <ZoneDialog
        zone={editingZone?.zone ?? null}
        areaM2={editingZone ? zoneAreaM2(editingZone) : 0}
        detached={!!editingZone?.detached}
        dotColor={editingZone ? ZONE_DOT_COLOR[editingZone.zone.kind] : "transparent"}
        addTools={tools}
        onChange={(patch) => {
          if (editingZone) patchZone(editingZone.zone.id, patch);
        }}
        onDelete={() => {
          if (editingZone) removeZone(editingZone.zone.id);
          setEditingZoneId(null);
        }}
        onTidy={
          editingZone?.zone.source.type === "region"
            ? () => editRegion(editingZone.zone.id, (b) => tidyRegion(b))
            : undefined
        }
        members={editingZone?.zone.source.type === "features" ? presentFeatureIds(structure.features, editingZone.zone.source.featureIds) : undefined}
        // Lights what the zone is made of on the plan — add one with Shift and the bar's "אזור" re-makes it.
        onSelectMembers={(ids) => {
          setEditingZoneId(null);
          setSelection(ids.map((id) => ({ kind: "feature" as const, id })));
        }}
        // Cut loose from its features: a freehand zone of the outline it has now, its corners dragged
        // on the plan from here on.
        onDetach={
          editingZone?.zone.source.type === "features" && editingZone.boundary.length >= 3
            ? () => patchZone(editingZone.zone.id, { source: { type: "region", boundary: editingZone.boundary } })
            : undefined
        }
        // A feature belongs to a zone only by sitting inside its boundary (see resolveZones) —
        // there's no field to set, just a point to drop it at. The boundary's own centroid is the
        // one point guaranteed to read as "inside this zone" for any shape, convex or not. A
        // detached zone (walls no longer close it) has no such point, so it gets no add-element
        // control at all rather than one that would place something in the wrong room. The dialog
        // closes on a pick: the new element is selected on the plan, and that is where it is
        // positioned next.
        onAddElement={
          editingZone && editingZone.boundary.length >= 3
            ? (tool) => {
                setEditingZoneId(null);
                placeTool(tool, polygonCentroid(editingZone.boundary));
              }
            : undefined
        }
        onClose={() => setEditingZoneId(null)}
      />

      <UnderlayCropModal
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onConfirm={(cropped) => {
          setCropFile(null);
          void onUploadUnderlay(cropped);
        }}
      />
    </div>
  );
}

/** "ציור חופשי": a lawn of no particular shape, its corners marked as the trace marks them. */
const DRAW_PREVIEW_OUTLINE = [
  { x: -620, y: -520 },
  { x: 380, y: -660 },
  { x: 660, y: 120 },
  { x: 120, y: 640 },
  { x: -660, y: 300 },
];
function DrawSurfacePreview() {
  const s = 1600;
  return (
    <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md bg-inset">
      <svg viewBox={`${-s / 2} ${-s / 2} ${s} ${s}`} className="h-11 w-11" aria-hidden>
        <SurfaceFill material="grass" footprint={{ kind: "custom", outline: DRAW_PREVIEW_OUTLINE }} w={1320} d={1300} id="draw-surface" />
        <polygon points={DRAW_PREVIEW_OUTLINE.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={40} strokeDasharray="90 70" />
        {DRAW_PREVIEW_OUTLINE.map((q, i) => (
          <circle key={i} cx={q.x} cy={q.y} r={70} fill="var(--color-accent)" />
        ))}
      </svg>
    </span>
  );
}

/** The picture on a card. A catalog-backed tool draws its OWN footprint, at its own proportions —
 *  the ח that makes a ח bar worth picking is visible before it is placed, and two bars that differ
 *  only in size read as two sizes. The drawn elements have no such picture, so they keep the pastel
 *  swatch and icon that were standing in for one. */
// The rows on the add-element card: three rows of four with an aisle, which says "ceremony" where
// five by five at that size would be a grey square. A dining chair — the card is not the studio's.
const SEATING_PREVIEW = { rows: 3, perRow: 4, aisleMm: 600 };
const SEATING_PREVIEW_BOX = (() => {
  const l = chairRowsLayout(SEATING_PREVIEW, FALLBACK_CHAIR);
  return { w: l.widthMm, d: l.depthMm, pad: Math.max(l.widthMm, l.depthMm) * 0.1 };
})();

// The column on its card: a new one (a 60cm plinth, a ⌀50 base, a ⌀40 shaft) drawn as it will be.
const COLUMN_PREVIEW = newFeature("column", { x: 0, y: 0 });
// The fountain on its card: the catalog's own picture at a new one's size.
const FOUNTAIN_PREVIEW = newFeature("fountain", { x: 0, y: 0 });

function ToolPreview({ tool }: { tool: AddTool }) {
  const Icon = ADD_TOOL_ICON[addToolIconKey(tool)];
  if (tool.kind === "fountain") {
    const s = FOUNTAIN_PREVIEW.widthMm * 1.15;
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-inset">
        <svg viewBox={`${-s / 2} ${-s / 2} ${s} ${s}`} className="h-9 w-9" aria-hidden>
          <ItemSymbol kind="fountain" footprint={{ kind: "circle", diameterMm: FOUNTAIN_PREVIEW.widthMm }} count={1} />
        </svg>
      </span>
    );
  }
  if (tool.kind === "column") {
    const s = COLUMN_PREVIEW.widthMm * 1.3;
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-inset">
        <svg viewBox={`${-s / 2} ${-s / 2} ${s} ${s}`} className="h-8 w-8" aria-hidden>
          <ColumnGlyph f={COLUMN_PREVIEW} fill="var(--color-surface)" stroke="var(--color-muted)" strokeWidth={1.25} />
        </svg>
      </span>
    );
  }
  if (tool.kind === "seating") {
    const { w, d, pad } = SEATING_PREVIEW_BOX;
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-inset">
        <svg viewBox={`${-w / 2 - pad} ${-d / 2 - pad} ${w + pad * 2} ${d + pad * 2}`} className="h-10 w-10" aria-hidden>
          <SeatingGlyph spec={SEATING_PREVIEW} />
        </svg>
      </span>
    );
  }
  if (tool.surface) {
    // A swatch of the material itself, at its real scale — a 1.6m square: four slabs across, a
    // dozen deck boards, enough lawn to see the grain.
    const s = 1600;
    return (
      <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md">
        <svg viewBox={`${-s / 2} ${-s / 2} ${s} ${s}`} className="h-11 w-11" aria-hidden>
          <SurfaceFill material={tool.surface} footprint={{ kind: "rect", widthMm: s, depthMm: s }} w={s} d={s} id={tool.id} />
        </svg>
      </span>
    );
  }
  if (tool.plant) {
    // The planting shows the very drawing it will place, at its own proportions — the section is a
    // little garden to pick from, which an icon of a leaf six times over is not.
    const { widthMm: w, depthMm: d } = PLANT_DEFAULTS[tool.plant];
    const pad = Math.max(w, d) * 0.1;
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-success-tint">
        <svg viewBox={`${-w / 2 - pad} ${-d / 2 - pad} ${w + pad * 2} ${d + pad * 2}`} className="h-9 w-9" aria-hidden>
          <PlantGlyph species={tool.plant} w={w} d={d} id={tool.id} />
        </svg>
      </span>
    );
  }
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
  // The row's own picture, exactly as the sketch's catalog rail shows it (app/(app)/studio/
  // catalog-rail.tsx): its photo, or the plan drawing itself on a dotted tile — a bar in its
  // texture, a stage as a stage. A bare accent outline, which this was, told a ח from a box and
  // nothing else.
  return (
    <span className="block h-14 w-14 overflow-hidden rounded-md border border-border">
      <ProductImage product={tool.product} />
    </span>
  );
}

