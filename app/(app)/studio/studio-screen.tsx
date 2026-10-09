"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { amend, dispatch, undo, redo, initHistory, type Action, type History, type RetypedTable } from "@/lib/design-document/actions";
import { deleteSketchTemplate, fetchSketchTemplateContent, fetchSketchTemplates, saveSketchTemplate } from "@/lib/studio/sketch-actions";
import type { SketchTemplateSummary } from "@/lib/studio/sketches";
import type { DesignDocumentContent, DesignTable, Placement, Point as DocPoint, StageBuild, StageStair, StageTemplate, TableDesign } from "@/lib/design-document/types";
import { emptyDocument } from "@/lib/design-document/types";
import { EMPTY_PLAN, eventPlan, type EventPlan } from "@/lib/events/plan";
import { useEventWorkspace } from "@/lib/events/use-workspace";
import { saveDocument } from "@/lib/studio/actions";
import { loadScratch, saveScratch } from "@/lib/studio/storage";
import { tableAt } from "@/lib/studio/geometry";
import { ALL_PLANES_VISIBLE, PLANES, type Plane } from "@/lib/studio/planes";
import type { Point } from "@/lib/studio/hall";
import { pointInPolygon } from "@/lib/venues/faces";
import { coverOn, deckOf, defaultVariantId, resolve, shadesOf } from "@/lib/studio/catalog-resolver";
import { productById } from "@/lib/catalog/storage";
import type { Product } from "@/lib/catalog/types";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { CATEGORIES, CATEGORY_BY_ID, DESIGN_PASS_GROUPS, HALL_PASS_GROUPS, anchorOf, isRunner, placesOnce, type CategoryGroupId } from "@/lib/catalog/categories";
import { nearestWall, WHOLE_WALL } from "@/lib/studio/anchor";
import {
  DEFAULT_NUMBERING,
  expandToGroups,
  groupSeated,
  groupSeats,
  numberedUnits,
  membersOf,
  orderedNumbering,
  refitBlock,
  soleGroupId,
  spreadSeated,
  spreadSeats,
  type NumberingOptions,
} from "@/lib/design-document/groups";
import { arrangedFeature, arrangedStructure, isFeatureMoved } from "@/lib/design-document/features";
import { mirrorFlips, type MirrorAxis, type MirrorSubject } from "@/lib/design-document/mirror";
import { axisGap, clearanceIssues, distributedCentres, placeAtGap, polysGap, spacedCentres, spreadAxis, type CentredBox } from "@/lib/studio/proximity";
import { defaultFront, lengthSnapper, polygonsOverlap, resizeRect, signedArea, type DeckType } from "@/lib/studio/stage-fill";
import {
  carryLevels,
  deckTypeOf,
  layStage,
  railingRuns,
  rectOutline,
  skirtMm,
  autoRisers,
  stageDecksInRoom,
  stageFromArea,
  stageHeight,
  stageOutlineInRoom,
  stageRect,
  stairFits,
  stairShape,
  toRoom,
  toStageFrame,
  mergeStages,
  benchInRoom,
  defaultEdgeItems,
  edgeGaps,
  edgeItemShape,
  edgeKind,
  fillGaps,
  itemAt,
  benchSeats,
  rehomeEdgeItems,
  tidyEdgeItems,
  SEAT_WIDTH_MM,
  stageAreaMm2,
  stageCorners,
  besideNeighbours,
  stageFromPiece,
  trimSeams,
  type EdgeRun,
  type StagePlacement,
} from "@/lib/design-document/stage";
import { deleteStageTemplate, deleteTableDesign, fetchStageRules, fetchStageTemplates, fetchTableDesigns, saveStageTemplate, saveTableDesign } from "@/lib/settings/actions";
import { TableDesignsPanel } from "./table-designs-panel";
import { cleanOutline, stickBoxes, type StickItem } from "@/lib/studio/stage-draw";
import { StageFillPanel, type StageFillState } from "./stage-fill-panel";
import { catalogBox, clampSize, footprintBounds, resizeAxes, sizedFootprint } from "@/lib/studio/footprint";
import { dressingSpots, tableBox, tableFootprint } from "@/components/footprint-shape";
import { arrange, clampToTable, toTableFrame, type ArrangeKind } from "@/lib/design-document/dressing";
import { DressingBar } from "./dressing-bar";
import { TablePatternPicker } from "./table-pattern-picker";
import { clearanceSubjects, itemGeometry, type ItemGeometry } from "./plan-geometry";
import { autoStack, floorStack, isStackable, restackTo, type StackBox, type StackKind } from "@/lib/design-document/stacking";
import { clipCount, copySelection, heldClip, holdClip, nextPasteStep, pasteInto, type Clip } from "@/lib/studio/clipboard";
import { hasTextSelection, isShortcut, isTypingTarget } from "@/lib/keyboard";
import { Toolbar } from "./toolbar";
import { CatalogRail } from "./catalog-rail";
import { ProductDrawer, blankProduct } from "../catalog/product-drawer";
import { Inspector, type EdgeKindId, type StageEdgeRow, type StagePanel, type SwapPanel } from "./inspector";
import { Bar, BarButton } from "@/components/inspector-bar";
import { Button } from "@/components/button";
import { BringToFront, Copy, Group, Grid2x2Plus, SendToBack, Trash2, X } from "lucide-react";
// A plain import now that the canvas is the app's shared SVG one: it renders on the server like any
// other component, so there is nothing left to defer and no "loading the studio" flash to cover.
import { CanvasStage, type SelectionKind, type SelectionRef, type SpinMode } from "./canvas-stage";
import type { ContextMenuItem, MarqueeMode } from "@/components/plan-canvas";
import { VenueAccessNotice } from "@/components/venue-access-notice";

const uid = () => crypto.randomUUID();

/** How far a paste lands from what it was copied from, in SCREEN pixels — converted through the
 *  canvas's current zoom, so the step reads the same whether the whole hall is on screen or one
 *  table fills it. Far enough that the copy is grabbable, near enough that it is obviously a copy
 *  of the thing beside it. */
const PASTE_STEP_PX = 34;

/** The meeting draws the same document in two passes, so the studio has two narrower faces:
 *
 *  - `hall`    — סקיצת אולם: the furniture. Rail cut to seating / stages / bars.
 *  - `design`  — סקיצה עיצובית: the dressing. Rail cut to the design departments.
 *  - `full`    — /studio, after the meeting: the whole catalog.
 *
 *  One document, one canvas, one autosave underneath all three — a pass is a narrower set of tools
 *  over the same drawing, never a separate drawing.
 *
 *  The passes are a RAIL filter now and nothing else. They used to also switch the toolbar's table
 *  buttons off during the design pass, so that a table could not be dropped in while the tables were
 *  being dressed; those buttons are gone (see toolbar.tsx) and the rail already enforces the same
 *  thing better — seating is not in DESIGN_PASS_GROUPS, so there is no table on screen to drag. */
export type StudioMode = "full" | "hall" | "design";

const RAIL: Record<StudioMode, { groups?: CategoryGroupId[]; hint?: string }> = {
  full: {},
  hall: { groups: HALL_PASS_GROUPS, hint: "לחצו על שולחן, כיסא, במה או בר ואז על התוכנית — או גררו. העיצוב עצמו — בשלב הבא." },
  design: { groups: DESIGN_PASS_GROUPS, hint: "לחצו על פריט עיצוב ואז על התוכנית — או גררו. פריטי שולחן — על שולחן; רצפה ותקרה — לכל נקודה." },
};

/** The catalog categories a stage may be built from (see deckTypes in the screen below). */
const STAGE_PIECE_CATEGORIES = ["stages", "stage-decks"];

/** What a table takes from its catalog row — on drop, and again when it is swapped for another. */
function tableFields(product: Product): RetypedTable {
  const d = product.dimensions;
  const seats = Number(product.categoryFields?.seats);
  return {
    type: product.name,
    variantId: defaultVariantId(product),
    ...(d.diameterMm ? { diameterMm: d.diameterMm } : { widthMm: d.widthMm ?? 0, depthMm: d.depthMm ?? 0 }),
    ...(seats > 0 ? { seats } : {}),
  };
}

/** Which catalog row a table is, for "every one like this" — its product, or for a table drawn
 *  before tables came from the catalog, the name it was given. */
const tableKind = (t: DesignTable) => (t.variantId ? resolve(t.variantId)?.product.id : undefined) ?? `type:${t.type}`;

/** Design items swap only for rows that sit where they sit: on a table or on the floor, worn as a
 *  cloth or standing, hung on a wall or stretched like a rug. A centrepiece cannot become a drape. */
const swapClass = (p: Product) => {
  const cat = CATEGORY_BY_ID[p.category];
  return `${p.layer}|${anchorOf(p)}|${cat?.sizing ?? "fixed"}`;
};
/** Which kind of floor thing a placement is for the stack (lib/design-document/stacking.ts) — or
 *  none for what is not on the floor at all: a drape hangs on a wall, a cloth or a chip belongs to a
 *  table, a candle on a banquette to the banquette, and a chandelier is overhead and painted last
 *  whatever the stack says. The same answer the canvas paints by (canvas-stage's classify). */
const classifyStack = (p: Placement): StackKind | undefined => {
  const r = resolve(p.variantId);
  if (r?.anchor === "wall") return undefined;
  if (p.layer === "ceiling") return undefined;
  if (p.layer === "table" && p.tableId) return undefined;
  if (p.perch) return undefined;
  return r?.sizing === "stretch" ? "carpet" : "item";
};

/** Never swap targets: tables have their own swap, and stages are built, not picked. */
const unswappable = (p: Product) => p.category === "tables" || CATEGORY_BY_ID[p.category]?.group === "grp-stages";

export function StudioScreen({
  mode = "full",
  initialProducts,
}: {
  mode?: StudioMode;
  /** From the server, when this screen is a page of its own (app/(app)/studio/page.tsx). Absent
   *  inside the meeting flow, which embeds this screen bare — see app/meeting/meeting-screen.tsx —
   *  and where the hook falls back to fetching for itself. */
  initialProducts?: Product[];
}) {
  // Held once here, for the whole studio: it fills the rail below AND primes the synchronous cache
  // that the canvas's resolver and dropProduct() read during render and mid-drag.
  const { products: catalog, installStageBasics, installStageParts, save: saveProduct } = useCatalog(initialProducts);
  // A new catalog item made from the rail (its "+"), so a client asking for something the catalog
  // lacks does not end the meeting. The form is the catalog's own drawer; in the meeting's passes it
  // opens without anything a client must not see, and offers only the categories this pass's rail
  // shows. `addedIds` pins what was made here to the top of the rail, newest first.
  const [adding, setAdding] = useState<Product | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const railCategories = useMemo(() => {
    const groups = RAIL[mode].groups;
    return groups ? CATEGORIES.filter((c) => groups.includes(c.group)) : CATEGORIES;
  }, [mode]);
  // Resolved once for this whole event surface — the event, its document and its venue geometry.
  const { workspace, ready } = useEventWorkspace();
  // An EMPTY document, not a fabricated one. The studio used to open on a sample plan built out of
  // sample products — invented tables, invented placements — which the restore effect below then
  // replaced. With the catalog on Postgres that fiction is worse than useless: it would draw items
  // against variant ids the designer's real catalog may not contain, and for one frame it showed a
  // plan nobody drew. An event's real document is loaded below; a new one starts empty, which is
  // what beginEvent() already writes.
  const [history, setHistory] = useState<History>(() => initHistory(emptyDocument()));
  // DERIVED, not state: the plane an event sits on is a pure function of its venue and zones, and
  // nothing on this screen edits it — the designer draws ON the walls, never the walls themselves
  // (that is /halls). Holding it in state meant an effect to fill it and a second copy to keep
  // honest. EMPTY_PLAN until the geometry lands, which is the same blank plane it showed before.
  const plan: EventPlan = useMemo(
    () => (workspace ? eventPlan(workspace.event, workspace.geometry) : EMPTY_PLAN),
    [workspace],
  );
  // A LIST, not one ref: several tables can be dragged across the room together, and a rubber-band
  // across a corner of the hall is how you get hold of them. One selected thing is the ordinary
  // case and still the only one the inspector has fields for.
  const [selected, setSelected] = useState<SelectionRef[]>([]);
  /** The table being dressed — its focus mode (see DressingOverlay in canvas-stage.tsx). Screen state,
   *  not the document's: it is where the designer is looking, not a fact about the event. */
  const [dressing, setDressing] = useState<string | null>(null);
  // FOUR PLANES, not three: the tables are one of their own (lib/studio/planes.ts). A table and a
  // stage both stand on the floor, so "work in the floor layer" used to name them both at once —
  // and the designer who has finished laying the tables and is now placing stages over them had no
  // way to say so. A rubber-band round the stages took the tables underneath with it.
  const [layerVisible, setLayerVisible] = useState<Record<Plane, boolean>>(ALL_PLANES_VISIBLE);
  // WHICH plane is being worked in, as opposed to which are merely visible. null — the default, and
  // exactly how this screen behaved before — means every visible plane is live. Naming one dims the
  // others and takes them out of the pointer's reach, which is the whole of what "lock" would have
  // been: dressing tables without dragging a rug by accident is one click, and there is no second
  // flag to keep honest.
  const [activeLayer, setActiveLayer] = useState<Plane | null>(null);
  // What the rotate handle does with several things at once. A screen-level preference rather than
  // a property of the selection: it is how the designer is working right now, and it has to survive
  // selecting a different six tables. "together" is the behaviour this canvas has always had.
  const [spin, setSpin] = useState<SpinMode>("together");
  // The safety-distance halos (Product.clearanceMm). On by default: the rule is only drawn round the
  // few items that carry one, and a designer who set it wants to see it. Breaches draw either way.
  const [showClearance, setShowClearance] = useState(true);
  // "מילוי במות": null, drawing the area, or choosing which decks fill it (see stage-fill-panel.tsx).
  const [stageFill, setStageFill] = useState<StageFillState | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved");
  const [zoneFocus, setZoneFocus] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The canvas's current zoom, in world mm per screen pixel, reported up during its render. The rail
  // reads it once per drag start, to draw the item being dragged at the size it will land at — see
  // catalog-rail.tsx. A ref, not state: nothing on this screen re-renders because of a zoom.
  const mmPerPx = useRef(20);
  // Which event this drawing belongs to. A ref, not state: the autosave timeout below reads it when
  // it FIRES rather than when it was scheduled, so the id cannot go stale in a closure.
  const eventId = useRef<string | null>(null);
  // The autosave queue. `pending` is the newest document not yet written, `inFlight` whether a write
  // is in the air, `persisted` the last content known to be on the server — see the note on flush().
  const pending = useRef<DesignDocumentContent | null>(null);
  const inFlight = useRef(false);
  const persisted = useRef<DesignDocumentContent | null>(null);
  // Whether the restore below has finished. It gates the autosave, and it has to: resolving which
  // event we are in is a round trip now, and the 500ms debounce would otherwise beat it — writing
  // the blank starting document under the "default" key (clobbering a scratch drawing) and then
  // racing the restore that is still in flight.
  const [restored, setRestored] = useState(false);

  const doc = history.present;

  // Open the editor on the saved drawing, once the one read that resolved this event surface has
  // landed (lib/events/workspace.ts). This used to be a chain of three server actions — resolve the
  // event, then its document, then its venue geometry — each a separate POST that could not start
  // until the previous one returned.
  //
  // This one stays an EFFECT rather than becoming a render-phase adjustment like the others in this
  // change, and the reason is the two refs: `eventId` and `persisted` are read by the autosave when
  // it FIRES, and writing a ref during render is the thing that makes a concurrent re-render see a
  // value from a render that was thrown away. Seeding an editing session with an undo history from
  // data that arrived asynchronously is what an effect is actually for.
  useEffect(() => {
    if (!ready) return;
    const event = workspace?.event ?? null;
    eventId.current = event?.id ?? null;
    // A studio with no events at all has nothing to attach a drawing to, so that one case still
    // reads the local scratch.
    const saved = event ? workspace?.document?.content : loadScratch();
    if (saved) {
      setHistory(initHistory(saved));
      // What is already on the server, so the first render after a restore doesn't write it
      // straight back. Against localStorage that redundant save was free; it is a round trip now.
      persisted.current = saved;
    }
    setRestored(true);
  }, [ready, workspace]);

  // Continuous autosave (F-3.5) — debounced, no save button. The indicator only claims "saved" when
  // the write actually landed; a failed write shows an error + retry.
  //
  // ⚠ WRITES ARE SEQUENCED, not just debounced. A save is a request now, and requests can overlap
  // and land out of order — which against a single-row document means an older drawing overwriting
  // a newer one, silently, with the screen showing "נשמר". So at most one is in the air at a time
  // and the newest document waits its turn in `pending`.
  const flush = useCallback(async () => {
    if (inFlight.current) return; // the running save will pick up whatever is pending when it lands
    const next = pending.current;
    if (!next) return;

    inFlight.current = true;
    setSaveState("saving");
    let ok = true;
    try {
      const id = eventId.current;
      if (id) await saveDocument(id, next);
      else ok = saveScratch(next);
    } catch {
      ok = false;
    }
    inFlight.current = false;

    if (!ok) {
      // `pending` deliberately keeps the document: retrySave and the next edit both resend it.
      setSaveState("error");
      return;
    }
    persisted.current = next;
    if (pending.current === next) {
      pending.current = null;
      setSaveState("saved");
    } else {
      // An edit arrived while this write was in the air — send that one too.
      void flush();
    }
  }, []);

  useEffect(() => {
    if (!restored) return;
    // Nothing to do for the render that follows a restore: this is the document we just read.
    if (doc === persisted.current) return;
    pending.current = doc;
    setSaveState("saving");
    const t = setTimeout(() => void flush(), 500);
    return () => clearTimeout(t);
  }, [doc, restored, flush]);

  // ⚠ THE DEBOUNCE DOES NOT SURVIVE AN UNMOUNT. The effect above clears its own timer on the way
  // out, so a document still inside the 500ms window was simply dropped — and this screen is
  // unmounted constantly: the meeting steps it in and out (hall → gallery → design), and "יציאה"
  // navigates away from it. Place a table, press "השלב הבא" half a second later, and the table was
  // gone, silently, with the client watching. beforeunload never saw any of it — that fires for a
  // closing tab, not for a client-side route change.
  //
  // Flushing here rather than lengthening the window: the write outlives the component, and a save
  // that has already been decided on should not depend on the screen staying mounted to finish.
  useEffect(
    () => () => {
      if (pending.current) void flush();
    },
    [flush],
  );

  const retrySave = useCallback(() => {
    pending.current ??= doc;
    void flush();
  }, [doc, flush]);

  // Warn before leaving while a write is still pending or has failed — don't let a plan slip away unsaved.
  useEffect(() => {
    if (saveState === "saved") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  // --- edits, and where one gesture ends ---------------------------------------------------------
  //
  // `act` is a discrete edit — one thing done once, one entry on the undo stack. `drag` is a frame
  // of a gesture that is still happening: the FIRST frame opens an entry and every frame after it
  // amends that same one, so a table dragged the length of the hall is one Ctrl+Z rather than the
  // hundred it used to be (each of which held a whole copy of the document). `endDrag` closes it —
  // the canvas calls it on pointerup, once per press that actually moved something.
  //
  // Whether the entry is already open is decided BEFORE setHistory is called, never inside the
  // updater: an updater runs at render time, and a gesture that dispatches two actions in one frame
  // (a carpet corner: resize, then re-centre) would otherwise see the flag already set by the time
  // the first of them ran, and amend into the previous, unrelated edit.
  const gestureOpen = useRef(false);
  const act = useCallback((a: Action) => {
    gestureOpen.current = false;
    setHistory((h) => dispatch(h, a));
  }, []);
  const drag = useCallback((a: Action) => {
    const open = gestureOpen.current;
    gestureOpen.current = true;
    setHistory((h) => (open ? amend(h, a) : dispatch(h, a)));
  }, []);
  const endDrag = useCallback(() => {
    gestureOpen.current = false;
  }, []);
  /** Several actions that are ONE thing the designer did — a paste, a multi-delete. The first opens
   *  a history entry and the rest fold into it, so one Ctrl+Z takes the whole thing back. */
  const batch = useCallback((actions: Action[]) => {
    if (actions.length === 0) return;
    gestureOpen.current = false;
    setHistory((h) => actions.reduce((acc, a, i) => (i === 0 ? dispatch(acc, a) : amend(acc, a)), h));
  }, []);

  const showHint = (msg: string) => {
    setHint(msg);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2600);
  };

  // F-3.3: auto-running table numbering, editable per table.
  const nextNumber = useCallback(() => doc.tables.reduce((m, t) => Math.max(m, t.number), 0) + 1, [doc.tables]);

  // Where a dropped item lands depends on what it is (CategoryDef.anchor), not on where the pointer
  // happened to be: a drape goes onto the nearest wall, a cloth onto the table under it, everything
  // else stays exactly where it was let go.
  /** The banquette under a point, if any: which stage, which of its edge items. */
  const benchAt = (x: number, y: number): { stageId: string; itemId: string } | null => {
    for (const p of doc.placements) {
      if (!p.stage) continue;
      for (const it of p.stage.stairs ?? []) {
        if (edgeKind(it) !== "bench") continue;
        const shape = edgeItemShape(p.stage, it, deckOf);
        if (!shape) continue;
        const poly = shape.polygon.map((q) => toRoom(p as StagePlacement, q));
        if (polygonsOverlap(poly, [
          { x: x - 1, y: y - 1 },
          { x: x + 1, y: y - 1 },
          { x: x + 1, y: y + 1 },
          { x: x - 1, y: y + 1 },
        ]))
          return { stageId: p.id, itemId: it.id };
      }
    }
    return null;
  };

  /** Put one of `productId` down at (x, y). True when something landed — false when the item said
   *  why it could not (a cloth over bare floor, a drape with no wall), which click-to-place needs
   *  to tell a placement from a refusal. */
  const dropProduct = (productId: string, x: number, y: number): boolean => {
    const product = productById(productId);
    if (!product) return false;
    const cat = CATEGORY_BY_ID[product.category];
    const id = uid();
    const variantId = defaultVariantId(product);
    const base = { id, variantId, layer: product.layer, quantity: 1, rotation: 0, scale: 1 };

    // A TABLE IS NOT A PLACEMENT. Dropping one mints a DesignTable — the thing that carries a
    // number, wears a cloth, groups a smart-apply and prints on the placement map — rather than
    // another object standing on the floor. This is the path the three toolbar buttons used to be,
    // with the difference that matters: the table now knows which catalog row it is, so it is
    // priced, ordered and drawn as the item its own studio owns (see DesignTable.variantId).
    if (product.category === "tables") {
      act({
        type: "addTable",
        table: { id, number: nextNumber(), position: { x, y }, rotation: 0, ...tableFields(product) },
      });
      setSelected([{ kind: "table", id }]);
      return true;
    }

    if (cat?.anchor === "wall") {
      const near = nearestWall(plan.structure, { x, y });
      if (!near) {
        showHint("אין קיר לתלות עליו — שרטטו את המתחם ב״אולמות״");
        return false;
      }
      // Across the whole wall, which is the normal case and the one worth defaulting to; the two
      // end handles shorten it from there.
      act({
        type: "addPlacement",
        placement: { ...base, position: { x, y }, span: { wallId: near.wallId, ...WHOLE_WALL } },
      });
    } else if (product.layer === "table") {
      const t = tableAt(doc, x, y);
      if (!t) {
        // Not on a table — on a stage's banquette, then? It is a surface to dress, like a table.
        const bench = benchAt(x, y);
        if (bench) {
          act({ type: "addPlacement", placement: { ...base, position: { x, y }, perch: bench } });
          setSelected([{ kind: "placement", id }]);
          return true;
        }
        showHint("הניחו פריט עיצוב על שולחן או על בנקט של במה");
        return false;
      }
      // A table wears ONE cloth: dropping a second onto a dressed table recolours the one that is
      // already there rather than stacking. Not a remove+add — that would record the removal as a
      // deliberate divergence and make the next "on all tables" skip this table (F-5.3).
      // (A runner is not a cloth — it lies on top of one: isRunner, lib/catalog/categories.ts.)
      const worn = anchorOf(product) === "table" ? coverOn(doc, t.id) : undefined;
      if (worn) {
        act({ type: "setPlacementVariant", id: worn.id, variantId });
        setSelected([{ kind: "table", id: t.id }]);
        return true;
      }
      // On the table being dressed, or one already arranged by hand, it stands WHERE IT WAS LET GO —
      // in the table's own frame, kept on its top. The first such drop onto a table still laid out
      // automatically freezes the items already there where they were drawn, in the same history
      // entry, so nothing jumps. Anywhere else the automatic layout finds it a place.
      if (t.id === dressing || t.arranged) {
        const position = clampToTable(tableBox(t), catalogBox(product), toTableFrame(t, { x, y }));
        const freeze: Action[] = t.arranged
          ? []
          : [{ type: "arrangeDressing", tableId: t.id, positions: dressingSpots(t, chipsOn(t.id)).map((sp) => ({ id: sp.p.id, position: sp.local })) }];
        batch([...freeze, { type: "addPlacement", placement: { ...base, tableId: t.id, position } }]);
      } else {
        act({ type: "addPlacement", placement: { ...base, tableId: t.id, position: { x: 0, y: 0 } } });
      }
    } else if (product.category === "stages") {
      // A stage from the rail is a STAGE — stairs, height, levels, resizing in whole decks — not a
      // box. asStage leaves a non-rectangular one (a round stage) as the item it is.
      const plain: Placement = { ...base, position: { x, y } };
      const sp = asStage(plain);
      act({ type: "addPlacement", placement: sp ?? plain });
      if (sp) ensureStageParts();
    } else {
      act({ type: "addPlacement", placement: { ...base, position: { x, y } } });
    }
    setSelected([{ kind: "placement", id }]);
    return true;
  };

  // --- selection ---------------------------------------------------------------------------------
  // Shift/Ctrl toggles one ref in or out; a plain click replaces the whole list. Same vocabulary as
  // the hall editor's plan (lib/venues/selection.ts), and the same one the canvas assumes.
  //
  // EVERY PATH THROUGH HERE EXPANDS TO WHOLE GROUPS, which is the whole of what grouping costs:
  // touching one member selects all of them, and from that one line the drag, the delete, the copy
  // and the paste all treat a group as one thing without knowing groups exist. They were already
  // written to work on a list.
  /** The selection minus the venue's own features — everything that is actually IN this document.
   *
   *  A feature is the property's, borrowed for the evening. It can be picked up, dragged and turned
   *  (the document records where this event stood it, and nothing more), but it cannot be grouped
   *  with a table, copied onto the clipboard, or deleted: there is no row here to group, no row to
   *  paste, and deleting the venue's bar from inside one event is not a thing an event may do. So
   *  every operation that edits the DOCUMENT's own objects runs through this, and each one that
   *  drops something says so on screen rather than quietly doing less than was asked.
   *
   *  Moving and turning deliberately do NOT go through it — those are the two things a feature is
   *  here for. */
  const docRefs = useCallback(
    (refs: SelectionRef[]) =>
      refs.filter((r): r is { kind: "table" | "placement"; id: string } => r.kind !== "feature"),
    [],
  );
  const featureRefs = useCallback((refs: SelectionRef[]) => refs.filter((r) => r.kind === "feature"), []);

  const pick = useCallback(
    (ref: SelectionRef | null, additive: boolean) => {
      setSelected((cur) => {
        if (!ref) return cur.length ? [] : cur;
        // A venue feature is in no group and can be in none, so it selects as itself.
        const picked = ref;
        const whole: SelectionRef[] =
          picked.kind === "feature" ? [picked] : expandToGroups(doc, [{ kind: picked.kind, id: picked.id }]);
        if (!additive) return whole;
        // Toggling a member toggles its group: a shift-click that could take one table out of a
        // group-shaped selection would leave a selection no drag could honour.
        const inSelection = cur.some((r) => r.kind === ref.kind && r.id === ref.id);
        if (inSelection) return cur.filter((c) => !whole.some((w) => w.kind === c.kind && w.id === c.id));
        const merged = [...cur];
        for (const w of whole) if (!merged.some((m) => m.kind === w.kind && m.id === w.id)) merged.push(w);
        return merged;
      });
    },
    [doc],
  );

  // A placement on a HIDDEN layer never enters a selection made here — every selection command
  // (below) and the canvas's own marquee both route through this one function, so this is the one
  // place that guarantee has to be written for all of them to inherit it. Without it, a designer
  // could select-similar/select-in-zone/select-layer their way onto something the canvas has
  // stopped drawing entirely (layerVisible off is a hard "not on screen", not a dim — see the
  // render gates in canvas-stage.tsx) and then drag or delete it blind.
  //
  // A table's WORN COVER is the one exception: it draws as the table's own surface regardless of
  // the "on the table" layer's visibility (see the `cloth` prop on TableNode in canvas-stage.tsx,
  // which reads it off `coverByTable` rather than the gated chip list) — so it stays selectable
  // exactly when it stays visible, which now means: when the TABLES plane is on. A venue feature
  // has no chip of its own; only `activeLayer` dims it, which `movable` already excludes on the
  // canvas side.
  const layerHidden = useCallback(
    (r: SelectionRef) => {
      // The tables have a chip of their own now, and it hides the things that belong to a table
      // along with it — a centrepiece left selectable over a table nobody can see is a thing to
      // drag by accident.
      if (r.kind === "table") return !layerVisible.tables;
      // The venue's own furniture stands on the floor and is drawn with it (canvas-stage.tsx), so
      // the floor's eye hides it too — and what is not on screen is not selectable.
      if (r.kind === "feature") return !layerVisible.floor;
      if (r.kind !== "placement") return false;
      const p = doc.placements.find((x) => x.id === r.id);
      if (!p) return false;
      // Keyed the same way canvas-stage.tsx sorts them, so the two cannot disagree about what
      // "belongs to a table" is.
      if (p.layer === "table" && p.tableId)
        return !layerVisible.tables || (resolve(p.variantId)?.anchor !== "table" && !layerVisible.table);
      return !layerVisible[p.layer];
    },
    [doc, layerVisible],
  );

  const pickMany = useCallback(
    (refs: SelectionRef[], additive: boolean, mode: MarqueeMode = additive ? "add" : "replace") => {
      const whole: SelectionRef[] = [...featureRefs(refs), ...expandToGroups(doc, docRefs(refs))].filter(
        (r) => !layerHidden(r),
      );
      const same = (a: SelectionRef, b: SelectionRef) => a.kind === b.kind && a.id === b.id;
      setSelected((cur) => {
        // Ctrl: each thing the band touched flips — in if it was out, out if it was in. A whole
        // group flips together (it was expanded above), so a band across half a block cannot leave
        // a selection no drag could honour.
        if (mode === "toggle") {
          const out = cur.filter((c) => !whole.some((w) => same(w, c)));
          for (const r of whole) if (!cur.some((c) => same(c, r))) out.push(r);
          return out;
        }
        if (mode === "replace") return whole;
        const merged = [...cur];
        for (const r of whole) if (!merged.some((m) => same(m, r))) merged.push(r);
        return merged;
      });
    },
    [doc, docRefs, featureRefs, layerHidden],
  );

  /** Ctrl+A: everything on the plan with a place of its own — the tables, the free-standing items,
   *  the venue's own furniture. Dressing on a table or a banquette belongs to what it stands on and
   *  comes along with it; a drape is in, since a drape can be selected. Hidden planes stay out, as
   *  with every other way of building a selection here. */
  const selectAll = useCallback(() => {
    pickMany(
      [
        ...doc.tables.map((t) => ({ kind: "table" as const, id: t.id })),
        ...doc.placements.filter((p) => !p.tableId && !p.perch).map((p) => ({ kind: "placement" as const, id: p.id })),
        ...plan.structure.features.map((f) => ({ kind: "feature" as const, id: f.id })),
      ],
      false,
    );
  }, [doc, plan.structure.features, pickMany]);

  // --- selection commands -------------------------------------------------------------------------
  // BULK IS A SELECTION PROBLEM. Every operation this screen has -- drag, rotate, delete, style,
  // restack, copy, paste -- already takes a list of refs. Make the list easy to build and each of
  // them becomes a bulk operation without a line of new code apiece; the alternative was a menu of
  // one-off "apply to..." commands, one per operation, each with its own idea of what it applied to.
  const selectSimilar = useCallback(() => {
    const one = selected[0];
    if (!one) return;
    if (one.kind === "table") {
      const type = doc.tables.find((t) => t.id === one.id)?.type;
      if (!type) return;
      pickMany(doc.tables.filter((t) => t.type === type).map((t) => ({ kind: "table" as const, id: t.id })), false);
    } else if (one.kind === "placement") {
      const variantId = doc.placements.find((p) => p.id === one.id)?.variantId;
      if (!variantId) return;
      pickMany(doc.placements.filter((p) => p.variantId === variantId).map((p) => ({ kind: "placement" as const, id: p.id })), false);
    }
  }, [selected, doc, pickMany]);

  const selectInZone = useCallback(() => {
    const zone = plan.zones.find((r) => r.zone.id === zoneFocus);
    if (!zone || zone.boundary.length < 3) return;
    const inside = (p: Point) => pointInPolygon(p, zone.boundary);
    pickMany(
      [
        ...doc.tables.filter((t) => inside(t.position)).map((t) => ({ kind: "table" as const, id: t.id })),
        ...doc.placements
          .filter((p) => !p.tableId && !p.span && inside(p.position))
          .map((p) => ({ kind: "placement" as const, id: p.id })),
      ],
      false,
    );
  }, [plan.zones, zoneFocus, doc, pickMany]);

  const selectLayer = useCallback(() => {
    if (!activeLayer) return;
    // The tables are their own plane, so "select this plane" means the tables and nothing else —
    // and the floor means what STANDS on the floor, which is the distinction the chip row exists to
    // make. Selecting the floor used to hand back the tables too.
    if (activeLayer === "tables") {
      pickMany(doc.tables.map((t) => ({ kind: "table" as const, id: t.id })), false);
      return;
    }
    pickMany(doc.placements.filter((p) => p.layer === activeLayer).map((p) => ({ kind: "placement" as const, id: p.id })), false);
  }, [activeLayer, doc, pickMany]);

  const sole = selected.length === 1 ? selected[0] : null;

  /** The design items standing on a table — not its cloth, which is the table's surface. */
  const chipsOn = (tableId: string) =>
    doc.placements.filter((p) => p.layer === "table" && p.tableId === tableId && resolve(p.variantId)?.anchor !== "table");
  // Derived, so a table deleted (or undone away) while it was being dressed simply ends the mode.
  const dressingTable = dressing ? doc.tables.find((t) => t.id === dressing) : undefined;


  // One undo puts the whole selection back, however many things were in it.
  //
  // A venue feature in the selection is skipped, not deleted: the bar belongs to the property and an
  // event may only say where it stood, never that it stopped existing. Saying so out loud matters —
  // a Delete that silently took four of five selected things would read as a bug.
  const deleteSelection = useCallback(() => {
    if (selected.length === 0) return;
    const refs = docRefs(selected);
    const kept = featureRefs(selected);
    if (refs.length === 0) {
      showHint(kept.length === 1 ? "פריט של המתחם — אפשר להזיז, לא למחוק" : "פריטי המתחם נשארים — אפשר להזיז אותם, לא למחוק");
      return;
    }
    setSelected(kept);
    batch(
      refs.map((r) => (r.kind === "table" ? { type: "removeTable", id: r.id } : { type: "removePlacement", id: r.id })),
    );
    if (kept.length > 0) showHint("פריטי המתחם נשארו — אפשר להזיז אותם, לא למחוק");
  }, [selected, batch, docRefs, featureRefs]);

  // --- clipboard ---------------------------------------------------------------------------------
  // The rules for what a selection amounts to, and what a paste has to do to it, are in
  // lib/studio/clipboard.ts and self-checked there. This is the wiring: the catalog question that
  // file refuses to ask for itself, the zoom-relative offset, and what the designer is told.
  const copy = useCallback(() => {
    if (selected.length === 0) return null;
    // The venue's own features are dropped here: a copy of the property's bar is not a second bar,
    // and pasting one could only mean adding a row to a venue this screen does not edit.
    const clip = copySelection(doc, docRefs(selected), (variantId) => resolve(variantId)?.anchor === "wall");
    const n = clipCount(clip);
    // Nothing copyable means the selection was drapes and only drapes — say so rather than leaving
    // the old clip in place to be pasted later under the impression it was this one.
    if (n === 0) {
      showHint("וילון נמדד על הקיר שלו — אין לו עותק");
      return null;
    }
    holdClip(clip);
    showHint(n === 1 ? "הועתק פריט" : `הועתקו ${n} פריטים`);
    return clip;
  }, [doc, selected, docRefs]);

  /** A re-id'd fragment put on the plan and selected — what a paste and a loaded sketch share. */
  const addClip = useCallback((fresh: Clip) => {
    batch([
      ...fresh.tables.map((table) => ({ type: "addTable" as const, table })),
      ...fresh.placements.map((placement) => ({ type: "addPlacement" as const, placement })),
      // The members already carry their new groupId, but the group ROW only exists once something
      // creates it — and this is also what gives the pasted block its own number. A block copied
      // whole pastes as another block; the reducer prunes any that arrived with only one member
      // left (a group whose other half was a drape the copy refused).
      ...fresh.groups.map((g) => ({
        type: "group" as const,
        groupId: g.id,
        refs: [
          ...fresh.tables.filter((t) => t.groupId === g.id).map((t) => ({ kind: "table" as const, id: t.id })),
          ...fresh.placements.filter((x) => x.groupId === g.id).map((x) => ({ kind: "placement" as const, id: x.id })),
        ],
        ...(g.number === undefined ? {} : { number: g.number }),
      })),
    ]);
    // Selected, and ready to be dragged where it is actually wanted. Table-layer items are left out:
    // they follow their table, so a group drag would carry them twice.
    setSelected([
      ...fresh.tables.map((t) => ({ kind: "table" as const, id: t.id })),
      ...fresh.placements.filter((x) => !x.tableId).map((x) => ({ kind: "placement" as const, id: x.id })),
    ]);
  }, [batch]);

  const paste = useCallback(() => {
    const clip = heldClip();
    if (clipCount(clip) === 0) return;
    // A screen-relative step, so a paste lands a thumb's width away whether the whole hall is on
    // screen or one table fills it — and each repeat steps one further out, fanning a run of pastes
    // instead of stacking them.
    const step = nextPasteStep() * PASTE_STEP_PX * mmPerPx.current;
    const fresh = pasteInto(clip, { dx: step, dy: step, firstNumber: nextNumber(), newId: uid });
    addClip(fresh);
    const n = clipCount(fresh);
    showHint(n === 1 ? "הודבק פריט" : `הודבקו ${n} פריטים`);
  }, [addClip, nextNumber]);

  // A cut removes exactly what it TOOK, not what was selected. The two differ by a drape, which
  // copySelection refuses to copy — deleting the selection wholesale would take a curtain off the
  // wall and put nothing on the clipboard to put it back with, which is a cut that loses work.
  //
  // Removing a table already takes its placements with it (see the reducer), so a copied cloth is
  // only removed on its own when its table stayed behind. Doing it twice would be harmless except
  // that removePlacement records a smart-apply exception (F-5.3) against a table about to cease
  // existing — garbage in the document that a later "on all tables" would have to step over.
  const cut = useCallback(() => {
    const clip = copy();
    if (!clip) return;
    const goneWithTable = new Set(clip.tables.map((t) => t.id));
    setSelected([]);
    batch([
      ...clip.tables.map((t) => ({ type: "removeTable" as const, id: t.id })),
      ...clip.placements
        .filter((x) => x.tableId === undefined || !goneWithTable.has(x.tableId))
        .map((x) => ({ type: "removePlacement" as const, id: x.id })),
    ]);
    const n = clipCount(clip);
    // Replaces the "הועתקו" the copy above just set — both are synchronous, so only this one is
    // ever painted, and what happened was a cut.
    showHint(n === 1 ? "נגזר פריט" : `נגזרו ${n} פריטים`);
  }, [copy, batch]);

  /** "שכפול" — the button form of Ctrl+C, Ctrl+V, and nothing more. It replaced a bespoke
   *  duplicate that rebuilt one table by hand and, in doing so, left its cloth and its centrepiece
   *  behind: a copied table brings what it wears (see copySelection), so going through the
   *  clipboard duplicates the dressed table rather than a bare disc. The guard is the drape case —
   *  a copy that took nothing must not paste whatever was on the clipboard before it. */
  const duplicate = useCallback(() => {
    if (copy()) paste();
  }, [copy, paste]);

  // --- grouping ----------------------------------------------------------------------------------
  // The one group this selection exactly is, if it is one — what the inspector needs in order to
  // show a group's panel rather than a list of things that happen to be selected together.
  const soleGroup = useMemo(
    () => (selected.some((r) => r.kind === "feature") ? undefined : soleGroupId(doc, docRefs(selected))),
    [doc, selected, docRefs],
  );
  /** What the inspector shows for that group — one walk of the members, not three. */
  const groupPanel = useMemo(() => {
    if (!soleGroup) return null;
    const { tables, placements } = membersOf(doc, soleGroup);
    return {
      id: soleGroup,
      number: doc.groups?.find((g) => g.id === soleGroup)?.number,
      tables: tables.length,
      items: placements.length,
      seats: groupSeats(doc, soleGroup),
      seated: groupSeated(doc, soleGroup),
    };
  }, [doc, soleGroup]);

  const groupSelection = useCallback(() => {
    const refs = docRefs(selected);
    if (refs.length < 2) {
      if (selected.some((r) => r.kind === "feature")) showHint("פריטי המתחם לא נכנסים לקבוצה");
      return;
    }
    const groupId = uid();
    // The number the block keeps is the LOWEST its members brought with them. A room numbered 1..12
    // that loses 4 and 5 into one block still reads in order, which is what the number is for; a
    // fresh number off the end would send the crew looking for table 13 in the middle of the room.
    const numbers = refs
      .filter((r) => r.kind === "table")
      .map((r) => doc.tables.find((t) => t.id === r.id)?.number ?? 0)
      .filter((n) => n > 0);
    act({ type: "group", groupId, refs, ...(numbers.length ? { number: Math.min(...numbers) } : {}) });
    showHint(numbers.length ? `קובצו לשולחן ${Math.min(...numbers)}` : "הפריטים קובצו");
  }, [selected, doc.tables, act, docRefs]);

  const ungroupSelection = useCallback(() => {
    if (!soleGroup) return;
    act({ type: "ungroup", groupId: soleGroup });
    showHint("הקבוצה פורקה");
  }, [soleGroup, act]);

  // --- the venue's own features ------------------------------------------------------------------
  // The canvas reports every position in absolute world millimetres, because that is what every
  // other thing on it has. A feature's position is not stored that way — the document holds an
  // OFFSET from wherever /halls puts it (see lib/design-document/features.ts) — and this is the one
  // place that knows both, so this is where the conversion lives. The canvas stays uniform and the
  // reducer stays offsets-only; nothing in between has to hold both ideas at once.
  const featureOffset = useCallback(
    (id: string, abs: { x: number; y: number }) => {
      const f = plan.structure.features.find((x) => x.id === id);
      return f ? { dx: Math.round(abs.x - f.x), dy: Math.round(abs.y - f.y) } : { dx: 0, dy: 0 };
    },
    [plan.structure],
  );
  /** The same for a facing: the document stores the turn ON TOP of the property's own. */
  const featureTurn = useCallback(
    (id: string, absDeg: number) => {
      const f = plan.structure.features.find((x) => x.id === id);
      return absDeg - (f?.rotationDeg ?? 0);
    },
    [plan.structure],
  );

  const moveFeature = useCallback(
    (id: string, pos: { x: number; y: number }) => drag({ type: "arrangeFeature", featureId: id, ...featureOffset(id, pos) }),
    [drag, featureOffset],
  );

  /** A whole selection turned as one. Tables and items take the angle straight; a feature's is
   *  converted to the turn-on-top the document stores. One action, so one undo takes the sweep back
   *  however many frames it took. */
  const rotateMany = useCallback(
    (turns: { kind: SelectionKind; id: string; position: { x: number; y: number }; rotation: number }[]) => {
      drag({
        type: "rotateMany",
        turns: turns.map((t) =>
          t.kind === "feature"
            ? { ...t, position: (({ dx, dy }) => ({ x: dx, y: dy }))(featureOffset(t.id, t.position)), rotation: featureTurn(t.id, t.rotation) }
            : t,
        ),
      });
    },
    [drag, featureOffset, featureTurn],
  );

  /** Put a feature back where the property has it. The inverse of every drag on it, and one row
   *  deleted rather than a number remembered. */
  const resetFeature = useCallback(
    (featureId: string) => {
      act({ type: "resetFeature", featureId });
      showHint("הפריט חזר למקומו בתוכנית המתחם");
    },
    [act],
  );

  /** What the inspector shows for a selected feature: the property's own row, as this event has it,
   *  plus whether this event has moved it at all (which is what the "put it back" button needs). */
  const featurePanel = useMemo(() => {
    if (sole?.kind !== "feature") return null;
    const f = plan.structure.features.find((x) => x.id === sole.id);
    if (!f) return null;
    const here = arrangedFeature(doc, f);
    return { id: f.id, label: f.label, kind: f.kind, rotationDeg: here.rotationDeg ?? 0, moved: isFeatureMoved(doc, f.id) };
  }, [sole, plan.structure, doc]);

  // --- stacking ----------------------------------------------------------------------------------
  // Rugs, tables and free objects are ONE stack over the floor — what a designer overlaps is not
  // sorted by category. The policy is in lib/design-document/stacking.ts (and self-checked there);
  // this is the wiring, plus the catalog question that file refuses to ask for itself.
  //
  // A cloth and a drape are in no stack at all: one is its table's surface, the other is pinned to a
  // wall by both ends. The buttons are simply not offered for them, rather than being offered and
  // doing nothing.
  const stack = useMemo(() => floorStack(doc, classifyStack), [doc]);

  /** The part of a selection that is in the floor stack — tables included. */
  const stackRefs = useCallback(
    (refs: SelectionRef[]) => docRefs(refs).filter((r) => isStackable(stack, r)),
    [stack, docRefs],
  );

  const restack = useCallback(
    (to: "front" | "back") => {
      const assign = restackTo(stack, stackRefs(selected), to);
      // Empty means it is already there — say so, rather than opening a history entry that changes
      // nothing and leaving the designer to wonder whether the button worked.
      if (assign.length === 0) {
        showHint(to === "front" ? "כבר בחזית" : "כבר מאחור");
        return;
      }
      act({ type: "restack", assign });
      showHint(to === "front" ? "הובא לחזית" : "נשלח לאחור");
    },
    [selected, act, stack, stackRefs],
  );

  /** The end of a canvas gesture: the history entry closes, and what landed on what is settled —
   *  a table carried onto a stage goes above it, a stage dragged over tables leaves them on top
   *  (lib/design-document/stacking.ts autoStack). Worked out INSIDE the history updater, against
   *  the document as it is after the gesture's last frame (the only place that is guaranteed to
   *  hold it), and folded into the gesture's own entry, so one Ctrl+Z takes the move and the lift
   *  back together. Nothing landed on anything: the history is returned untouched. */
  const settleDrag = useCallback(
    (moved?: SelectionRef[]) => {
      endDrag();
      const refs = moved ? docRefs(moved) : [];
      if (refs.length === 0) return;
      setHistory((h) => {
        const present = h.present;
        const s = floorStack(present, classifyStack);
        const arrangedNow = arrangedStructure(plan.structure, present);
        const boxes = new Map<string, StackBox>();
        for (const e of s) {
          const g = itemGeometry(present, arrangedNow, plan.structure, e.ref);
          if (g) boxes.set(`${e.ref.kind}:${e.ref.id}`, g.box);
        }
        const assign = autoStack(s, boxes, refs);
        return assign.length ? amend(h, { type: "restack", assign }) : h;
      });
    },
    [endDrag, docRefs, plan.structure],
  );

  // --- bulk edits --------------------------------------------------------------------------------
  /** One number of chairs, laid over every selected table at once. Setting a room of forty tables
   *  from ten places to twelve was forty trips through the inspector; it is one now, and one undo.
   *
   *  The OCCUPANCY is deliberately not offered in bulk. Seats are a property of the furniture and
   *  are genuinely the same across a room; how many of them are spoken for is a different fact per
   *  table, and a control that wrote one number over all of them would only ever be used by
   *  accident. */
  const setSeatsForSelection = useCallback(
    (seats: number) => {
      const ids = docRefs(selected).filter((r) => r.kind === "table").map((r) => r.id);
      if (ids.length === 0) return;
      batch(ids.map((id) => ({ type: "setTableSeats" as const, id, seats })));
      showHint(`${ids.length} שולחנות — ${seats} כסאות`);
    },
    [selected, batch, docRefs],
  );

  /** Where a feature currently stands, absolute — so that turning it in place can restate the offset
   *  it already had rather than dropping it. */
  function arrangedFeatureAt(id: string): { x: number; y: number } {
    const f = plan.structure.features.find((x) => x.id === id);
    if (!f) return { x: 0, y: 0 };
    const here = arrangedFeature(doc, f);
    return { x: here.x, y: here.y };
  }

  /** Turn everything selected to one absolute angle, each about its OWN centre — which is what the
   *  inspector's number field means, as against the canvas handle's sweep about a shared pivot.
   *  Squaring a scattered handful of items to the room is the case: they do not move, they all just
   *  end up facing the same way. */
  const faceSelection = useCallback(
    (deg: number) => {
      const refs = selected;
      if (refs.length === 0) return;
      batch(
        refs.map((r) =>
          r.kind === "table"
            ? { type: "rotateTable" as const, id: r.id, rotation: deg }
            : r.kind === "placement"
              ? { type: "rotatePlacement" as const, id: r.id, rotation: deg }
              : { type: "arrangeFeature" as const, featureId: r.id, ...featureOffset(r.id, arrangedFeatureAt(r.id)), rotationDeg: featureTurn(r.id, deg) },
        ),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, batch, featureOffset, featureTurn, doc, plan.structure],
  );

  /** The one facing a selection shares, or null when they disagree — what the inspector's rotation
   *  field shows, and what stops it from claiming a room of differently-angled items is all at 0°. */
  const sharedFacing = useMemo(() => {
    if (selected.length === 0) return null;
    const angles = selected.map((r) =>
      r.kind === "table"
        ? (doc.tables.find((t) => t.id === r.id)?.rotation ?? 0)
        : r.kind === "placement"
          ? (doc.placements.find((x) => x.id === r.id)?.rotation ?? 0)
          : (() => {
              const f = plan.structure.features.find((x) => x.id === r.id);
              return f ? (arrangedFeature(doc, f).rotationDeg ?? 0) : 0;
            })(),
    );
    return angles.every((a) => a === angles[0]) ? angles[0] : null;
  }, [selected, doc, plan.structure]);

  // --- geometry: safety distance, mirroring, spacing, size ---------------------------------------
  // Every one of these measures things by the outline they are drawn with (./plan-geometry.ts), so
  // the halo, the tape and "1.5m between them" cannot disagree about where an edge is.
  const arranged = useMemo(() => arrangedStructure(plan.structure, doc), [plan.structure, doc]);
  const geometryOf = useCallback(
    (ref: SelectionRef) => itemGeometry(doc, arranged, plan.structure, ref),
    [doc, arranged, plan.structure],
  );

  const clearance = useMemo(() => {
    const subjects = clearanceSubjects(doc, arranged, plan.structure, layerVisible);
    return { subjects, issues: clearanceIssues(subjects) };
  }, [doc, arranged, plan.structure, layerVisible]);

  /** The breaches the one selected thing is party to — what its bar lists by name. */
  const breaches = useMemo(() => {
    if (!sole) return [];
    const key = `${sole.kind}:${sole.id}`;
    const label = new Map(clearance.subjects.map((s) => [s.key, s.label]));
    return clearance.issues
      .filter((i) => i.a === key || i.b === key)
      .map((i) => ({ other: label.get(i.a === key ? i.b : i.a) ?? "פריט", distance: i.distance, required: i.required }));
  }, [sole, clearance]);

  /** Can this be turned over? Not a cloth or a centrepiece (they belong to their table, which turns
   *  over with them) and not a drape (a wall has no mirror image). */
  const mirrorable = useCallback(
    (r: SelectionRef) => {
      if (r.kind !== "placement") return true;
      const p = doc.placements.find((x) => x.id === r.id);
      return !!p && !p.tableId && !p.span;
    },
    [doc.placements],
  );

  /** Mirror the selection — one item on its own spot, several about the centre of the box they share
   *  (lib/design-document/mirror.ts has the rule and the proof). One action, one undo. */
  const mirrorSelection = useCallback(
    (axis: MirrorAxis) => {
      const geos = selected.filter(mirrorable).map(geometryOf).filter((g): g is ItemGeometry => !!g);
      if (geos.length === 0) {
        showHint("אין כאן מה להפוך");
        return;
      }
      const subjects: MirrorSubject<SelectionKind>[] = geos.map(({ ref }) => {
        if (ref.kind === "table") {
          const t = doc.tables.find((x) => x.id === ref.id)!;
          return { kind: "table", id: ref.id, position: t.position, rotation: t.rotation || 0, mirrored: t.mirrored };
        }
        if (ref.kind === "placement") {
          const p = doc.placements.find((x) => x.id === ref.id)!;
          return { kind: "placement", id: ref.id, position: p.position, rotation: p.rotation || 0, mirrored: p.mirrored };
        }
        const here = arrangedFeatureAt(ref.id);
        const f = plan.structure.features.find((x) => x.id === ref.id);
        return { kind: "feature", id: ref.id, position: here, rotation: f ? (arrangedFeature(doc, f).rotationDeg ?? 0) : 0 };
      });
      const boxes = geos.map((g) => g.box);
      const pivot =
        geos.length === 1
          ? geos[0].centre
          : {
              x: (Math.min(...boxes.map((b) => b.x - b.widthMm / 2)) + Math.max(...boxes.map((b) => b.x + b.widthMm / 2))) / 2,
              y: (Math.min(...boxes.map((b) => b.y - b.depthMm / 2)) + Math.max(...boxes.map((b) => b.y + b.depthMm / 2))) / 2,
            };
      act({
        type: "mirrorMany",
        flips: mirrorFlips(subjects, axis, pivot).map((f) =>
          f.kind === "feature"
            ? { ...f, position: (({ dx, dy }) => ({ x: dx, y: dy }))(featureOffset(f.id, f.position)), rotation: featureTurn(f.id, f.rotation) }
            : f,
        ),
      });
      const skipped = selected.length - geos.length;
      showHint(skipped > 0 ? "הבחירה הופכה — מפות ווילונות נשארו כמו שהם" : axis === "horizontal" ? "הופך מצד לצד" : "הופך מלמעלה למטה");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, mirrorable, geometryOf, doc, plan.structure, act, featureOffset, featureTurn],
  );
  const canMirror = selected.some(mirrorable);

  /** Everything selected, measured — or null when there are fewer than two, or one of them has no
   *  free position a spacing could move (a drape, a hung chandelier, a centrepiece). */
  const spacingGeos = useMemo(() => {
    if (selected.length < 2) return null;
    const geos = selected.map(geometryOf);
    if (geos.some((g) => !g || !g.movable)) return null;
    return geos as ItemGeometry[];
  }, [selected, geometryOf]);

  /** What the spacing panel reads before anything is typed: the air there is now, on each axis and
   *  (for a pair) straight across. A row whose gaps differ has no one number, and says so (null). */
  const spacing = useMemo(() => {
    if (!spacingGeos) return null;
    const boxes = spacingGeos.map((g) => g.box);
    const key = spacingGeos.map((g) => `${g.ref.kind}:${g.ref.id}`).join("|");
    if (spacingGeos.length === 2) {
      const [a, b] = spacingGeos;
      return {
        key,
        count: 2,
        axis: spreadAxis(boxes),
        x: axisGap(a.box, b.box, "x"),
        y: axisGap(a.box, b.box, "y"),
        direct: polysGap(a.polysAt(a.centre), b.polysAt(b.centre)).distance,
        first: a.label,
      };
    }
    const along = (ax: "x" | "y") => {
      const row = [...boxes].sort((p, q) => p[ax] - q[ax]);
      const gaps = row.slice(1).map((b, i) => axisGap(row[i], b, ax));
      return gaps.every((g) => Math.abs(g - gaps[0]) < 5) ? gaps[0] : null;
    };
    return { key, count: spacingGeos.length, axis: spreadAxis(boxes), x: along("x"), y: along("y"), direct: null, first: spacingGeos[0].label };
  }, [spacingGeos]);

  /** "1.5m between them." The FIRST thing selected stays where it is — it is what the designer is
   *  measuring from — and the rest are set down that far from it: along an axis, a row built outward
   *  from it both ways (edge to edge between the turned boxes, as the snap measures); straight
   *  across, the second walked along the line between their centres until the OUTLINES are that far
   *  apart. One moveMany, one undo. */
  const spaceSelection = useCallback(
    (gapMm: number, mode: "x" | "y" | "direct") => {
      if (!spacingGeos) return;
      const moves: { kind: SelectionKind; id: string; position: Point }[] = [];
      if (mode === "direct") {
        if (spacingGeos.length !== 2) return;
        const [a, b] = spacingGeos;
        moves.push({ kind: b.ref.kind, id: b.ref.id, position: placeAtGap(a.polysAt(a.centre), a.centre, b.centre, b.polysAt, gapMm) });
      } else {
        const anchor = spacingGeos[0];
        const row = [...spacingGeos].sort((p, q) => p.box[mode] - q.box[mode]);
        const k = row.indexOf(anchor);
        for (const run of [row.slice(k), row.slice(0, k + 1).reverse()]) {
          if (run.length < 2) continue;
          const centres = spacedCentres(run.map((g) => g.box), mode, gapMm);
          run.forEach((g, i) => {
            if (i === 0) return;
            // The box moved; the item's own centre moves with it by the same delta (a turned
            // triangle's box is not centred on the point it stands on).
            moves.push({
              kind: g.ref.kind,
              id: g.ref.id,
              position: { x: Math.round(g.centre.x + centres[i].x - g.box.x), y: Math.round(g.centre.y + centres[i].y - g.box.y) },
            });
          });
        }
      }
      act({
        type: "moveMany",
        moves: moves.map((m) =>
          m.kind === "feature" ? { ...m, position: (({ dx, dy }) => ({ x: dx, y: dy }))(featureOffset(m.id, m.position)) } : m,
        ),
      });
      showHint(`${spacingGeos[0].label} נשאר במקומו · מרווח ${(gapMm / 1000).toFixed(2)} מ׳`);
    },
    [spacingGeos, act, featureOffset],
  );

  // --- even distribution --------------------------------------------------------------------------
  /** What a distribute moves: each loose thing on its own, and each GROUP as one unit — a block of
   *  four tables pushed into one head table is one thing on the floor, and spacing its members apart
   *  would undo the grouping the designer did on purpose. Null when something selected has no free
   *  position (a cloth, a drape, a hung chandelier) — the command is then not offered at all. */
  const distributeUnits = useMemo(() => {
    const geos = selected.map(geometryOf);
    if (geos.length < 3 || geos.some((g) => !g || !g.movable)) return null;
    const units = new Map<string, ItemGeometry[]>();
    for (const g of geos as ItemGeometry[]) {
      const key = g.groupId ?? `${g.ref.kind}:${g.ref.id}`;
      units.set(key, [...(units.get(key) ?? []), g]);
    }
    if (units.size < 3) return null;
    return [...units.values()].map((members) => {
      const minX = Math.min(...members.map((m) => m.box.x - m.box.widthMm / 2));
      const maxX = Math.max(...members.map((m) => m.box.x + m.box.widthMm / 2));
      const minY = Math.min(...members.map((m) => m.box.y - m.box.depthMm / 2));
      const maxY = Math.max(...members.map((m) => m.box.y + m.box.depthMm / 2));
      const box: CentredBox = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, widthMm: maxX - minX, depthMm: maxY - minY };
      return { members, box };
    });
  }, [selected, geometryOf]);
  const canDistribute = distributeUnits !== null;

  /** EQUAL AIR between neighbours, measured edge to edge between the real (turned) sizes, along the
   *  axis the selection is spread over; the two end units stay where they are (lib/studio/proximity.ts
   *  distributedCentres). It used to space the CENTRES evenly, which gives a 2.4m table 60cm on one
   *  side and 1.8m on the other — the opposite of even — and it moved grouped tables one by one. */
  const distributeEvenly = useCallback(() => {
    if (!distributeUnits) return;
    const boxes = distributeUnits.map((u) => u.box);
    const axis = spreadAxis(boxes);
    const centres = distributedCentres(boxes, axis);
    const moves: { kind: SelectionKind; id: string; position: Point }[] = [];
    distributeUnits.forEach((u, i) => {
      const dx = centres[i].x - u.box.x;
      const dy = centres[i].y - u.box.y;
      if (!dx && !dy) return;
      for (const m of u.members) moves.push({ kind: m.ref.kind, id: m.ref.id, position: { x: Math.round(m.centre.x + dx), y: Math.round(m.centre.y + dy) } });
    });
    if (moves.length === 0) {
      showHint("כבר מפוזרים באופן אחיד");
      return;
    }
    act({
      type: "moveMany",
      moves: moves.map((m) =>
        m.kind === "feature" ? { ...m, position: (({ dx, dy }) => ({ x: dx, y: dy }))(featureOffset(m.id, m.position)) } : m,
      ),
    });
    showHint(`פוזרו ${distributeUnits.length} פריטים ${axis === "x" ? "לרוחב" : "לאורך"} — רווח שווה ביניהם`);
  }, [distributeUnits, act, featureOffset]);

  // --- stage fill ---------------------------------------------------------------------------------
  /** The pieces the catalog can build a stage from: everything rectangular the studio keeps under
   *  "במות" AND "פלטות במה". A studio's own "במה 400×300" is a real platform it owns and brings, and
   *  building a 7×4 stage out of one of those and a few decks is exactly the arithmetic the tool is
   *  for — the designer narrows the set in "אילו במות" when a piece should not be used. Keyed by
   *  VARIANT id, which is what a stage stores and what the quote counts. */
  const deckTypes = useMemo<(DeckType & { name: string })[]>(
    () =>
      catalog
        .filter((p) => STAGE_PIECE_CATEGORIES.includes(p.category) && !p.archived)
        .filter((p) => (p.appearance?.shape ?? (p.dimensions.diameterMm ? "circle" : "rect")) === "rect" && !p.appearance?.parts?.length)
        .map((p) => ({ name: p.name, ...deckTypeOf(defaultVariantId(p), p) }))
        .filter((t) => t.widthMm > 0 && t.depthMm > 0),
    [catalog],
  );

  /** What already stands where a stage is being drawn — other stages, hired decks, the venue's own
   *  staging — for the one question worth asking before laying another on top: does it overlap. The
   *  stage being edited is not in its own way. */
  const editingStage = stageFill?.editing;
  const stageObstacles = useMemo(() => {
    const out: Point[][] = [];
    for (const p of doc.placements) {
      if (p.tableId || p.id === editingStage || resolve(p.variantId)?.solid !== "stage") continue;
      const g = geometryOf({ kind: "placement", id: p.id });
      if (g) out.push(...g.polysAt(g.centre));
    }
    for (const f of arranged.features) {
      if (f.kind !== "stage") continue;
      const g = geometryOf({ kind: "feature", id: f.id });
      if (g) out.push(...g.polysAt(g.centre));
    }
    return out;
  }, [doc.placements, arranged.features, geometryOf, editingStage]);

  /** The stage the area tool would make, built by the SAME functions the saved stage is counted with
   *  (lib/design-document/stage.ts) — so what the preview shows is what the quote bills. */
  const stagePreview = useMemo(() => {
    if (stageFill?.phase !== "pick") return null;
    const clean = cleanOutline(stageFill.polygon, stageFill.front);
    const at = stageFromArea(clean.outline, clean.front);
    const stage: StageBuild = { outline: at.outline, front: at.front, decks: stageFill.chosen, ...(stageFill.exceed ? { exceed: true } : {}) };
    const placement = {
      id: stageFill.editing ?? "preview",
      variantId: stageFill.chosen[0] ?? "",
      layer: "floor" as const,
      quantity: 1,
      scale: 1,
      position: at.position,
      rotation: at.rotation,
      stage,
    };
    const laid = layStage(stage, deckOf);
    return {
      placement,
      layout: { ...laid, decks: stageDecksInRoom(placement, deckOf) },
      overlaps: stageObstacles.some((o) => polygonsOverlap(o, clean.outline)),
    };
  }, [stageFill, stageObstacles]);
  const stageLayout = stagePreview?.layout ?? null;
  /** The lengths the decks in hand build exactly — what a side being drawn, or a corner of the
   *  preview being dragged, is pulled to (lib/studio/stage-fill.ts lengthSnapper). */
  const areaLengthSnap = useMemo(() => {
    const ids = stageFill?.chosen;
    const types = ids?.length ? deckTypes.filter((t) => ids.includes(t.id)) : deckTypes;
    return lengthSnapper(types);
  }, [stageFill?.chosen, deckTypes]);

  const startStageFill = useCallback(() => {
    if (stageFill) {
      setStageFill(null);
      return;
    }
    setSelected([]);
    if (deckTypes.length > 0) {
      setStageFill({ phase: "draw" });
      return;
    }
    // A studio with nothing at all to build a stage from. Rather than send the designer off to type
    // a deck in, give the studio the base decks (and the stairs and skirt a stage is finished with)
    // — its own rows, add-only — and carry on.
    void installStageBasics().then((list) => {
      const has = list?.some((p) => STAGE_PIECE_CATEGORIES.includes(p.category) && !p.archived);
      if (!has) {
        showHint("אין בקטלוג במות או פלטות מלבניות, והוספת פלטות הבסיס נכשלה — נסו שוב, או הוסיפו במה בקטלוג");
        return;
      }
      showHint("נוספו לקטלוג פלטות במה 200×100 ו־100×100, מדרגות וחצאית — אפשר לשנות להן מחיר ושם בקטלוג");
      setStageFill({ phase: "draw" });
    });
  }, [stageFill, deckTypes.length, installStageBasics]);

  /** An area just closed: the decks already chosen (every deck, the first time), and the front is
   *  the side that faces the room — the edge away from the wall the stage is standing against. A
   *  click on another edge changes it. A redraw of a stage being edited stays that stage's edit. */
  const openStageFill = useCallback(
    (polygon: Point[]) =>
      setStageFill((cur) => ({
        phase: "pick",
        polygon,
        front: defaultFront(polygon, (p) => nearestWall(plan.structure, p)?.distanceMm ?? Infinity),
        chosen: cur?.chosen ?? deckTypes.map((t) => t.id),
        editing: cur?.editing,
      })),
    [plan.structure, deckTypes],
  );

  /** Take one of the layout's exact sizes: the area is redrawn at that size, front first. */
  const resizeStageArea = useCallback((widthMm: number, depthMm: number) => {
    setStageFill((cur) =>
      cur?.phase === "pick" ? { ...cur, polygon: resizeRect(cur.polygon, cur.front, widthMm, depthMm), front: 0 } : cur,
    );
  }, []);

  /** The studio's railing rule (settings → במות). Off until the studio says otherwise — and off while
   *  it is being read, rather than guessing a height for a frame. */
  const [railingAboveMm, setRailingAboveMm] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetchStageRules()
      .then((r) => live && setRailingAboveMm(r.railingAboveMm))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  /** How far a point is from the venue's nearest wall — which sides of a stage are against one. */
  const wallDistance = useCallback((p: Point) => nearestWall(plan.structure, p)?.distanceMm ?? Infinity, [plan.structure]);
  /** …and, for one stage, from the other stages too: a side pushed flush against another stage (and
   *  not merged with it) needs no stairs, no skirt, and is not an open edge. Every question asked
   *  about one stage's edges goes through this, whether the stage was drawn or laid by hand. */
  const wallDistanceFor = (stageId: string | undefined) => {
    const others = doc.placements
      .filter((x) => x.stage && x.id !== stageId)
      .map((x) => stageOutlineInRoom(x as StagePlacement));
    return others.length ? besideNeighbours(wallDistance, others) : wallDistance;
  };

  /** A template's own finish rows, so they win over the studio's defaults when it is placed. */
  const templateFinishes = (st: StageBuild): Partial<StageBuild> =>
    Object.fromEntries(
      (["stairsVariant", "skirtVariant", "benchVariant", "barrierVariant", "backdropVariant", "rampVariant"] as const)
        .filter((k) => st[k])
        .map((k) => [k, st[k]]),
    );

  /** The catalog rows a new stage counts its stairs and skirt as — the studio's first of each. */
  const stageParts = useMemo(() => {
    const first = (category: string) => {
      const p = catalog.find((x) => x.category === category && !x.archived);
      return p ? defaultVariantId(p) : undefined;
    };
    return {
      stairsVariant: first("stage-stairs"),
      skirtVariant: first("stage-skirts"),
      benchVariant: first("stage-benches"),
      barrierVariant: first("stage-barriers"),
      backdropVariant: first("stage-backdrops"),
      rampVariant: first("stage-ramps"),
    };
  }, [catalog]);
  /** A studio that builds from its own stages may never have had the stairs, skirt, banquette and
   *  barrier rows — give it them (add-only, those four only) the first time a stage needs one, so
   *  the quote can count what the plan shows. */
  const ensureStageParts = useCallback(() => {
    if (Object.values(stageParts).some((v) => !v)) void installStageParts();
  }, [stageParts, installStageParts]);

  /** Put the stage on the plan — ONE placement, whatever it is built of — or, when a stage was being
   *  edited, give that one its new outline. Its variant is the deck it is mostly built from: that is
   *  what the catalog rail and the solid-against-solid rule read it as; the quote never does.
   *
   *  A NEW stage gets its height (its decks'), the studio's stairs and skirt rows, and one flight on
   *  a side that is not against a wall — never a platform nobody can get onto. An EDITED one keeps
   *  all of that, its levels carried to where they stood in the room. */
  const commitStageFill = useCallback(() => {
    if (stageFill?.phase !== "pick" || !stagePreview || stagePreview.layout.decks.length === 0) return;
    const { placement } = stagePreview;
    const tally = new Map<string, number>();
    for (const d of stagePreview.layout.decks) tally.set(d.typeId, (tally.get(d.typeId) ?? 0) + 1);
    const variantId = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const count = stagePreview.layout.decks.length;
    const old = stageFill.editing ? doc.placements.find((p) => p.id === stageFill.editing) : undefined;
    if (old?.stage) {
      const was = old as StagePlacement;
      const frame = { position: placement.position, rotation: placement.rotation, mirrored: false };
      const levels = carryLevels(old.stage.levels, old, frame);
      // The fill tool's own answers replace the old ones — the decks it may use, and whether they
      // may exceed the line — which is why `exceed` is taken off before the spread rather than
      // overwritten: switching it off has to leave no key behind.
      const { exceed: _wasExceeding, ...keep } = old.stage;
      const now: StagePlacement = {
        ...was,
        ...frame,
        stage: { ...keep, outline: placement.stage.outline, front: placement.stage.front, decks: placement.stage.decks, levels, ...(placement.stage.exceed ? { exceed: true } : {}) },
      };
      // The outline may have new corners, so side numbers mean nothing now: every item goes back to
      // the side it stood on, by where it stood; what the reshape left bare gets stairs (or a barrier
      // where stairs cannot stand), the default for any open side; runs on one side become one.
      const carried = rehomeEdgeItems(was, now, uid).filter((st) => !st.level || levels?.some((l) => l.id === st.level));
      const wd = wallDistanceFor(old.id);
      const withItems: StagePlacement = { ...now, stage: { ...now.stage, stairs: carried } };
      const bare = fillGaps(withItems, deckOf, "stairs", uid, wd)
        .filter((it) => !it.level)
        .map((it) => (stairFits(withItems, it, deckOf, wd).ok ? it : { ...it, kind: "barrier" as const }));
      const stairs = tidyEdgeItems({ ...now.stage, stairs: [...carried, ...bare] });
      const kept = new Set(stairs.map((st) => st.id));
      // Dressing on a banquette the reshape took away goes with it.
      const orphans = doc.placements.filter((x) => x.perch?.stageId === old.id && !kept.has(x.perch.itemId));
      batch([
        ...orphans.map((x) => ({ type: "removePlacement" as const, id: x.id })),
        { type: "setPlacementStage", id: old.id, stage: { ...now.stage, stairs }, ...frame },
      ]);
      setSelected([{ kind: "placement", id: old.id }]);
      showHint(`הבמה עודכנה — ${count} פלטות`);
    } else {
      const id = uid();
      const stage: StageBuild = { ...placement.stage, heightMm: stageHeight(placement.stage, deckOf), ...stageParts };
      // Every open side finished — stairs, the default — so no new stage has an edge to fall off.
      stage.stairs = defaultEdgeItems({ ...placement, stage }, deckOf, uid, wallDistanceFor(undefined));
      act({ type: "addPlacement", placement: { ...placement, id, variantId, stage } });
      setSelected([{ kind: "placement", id }]);
      ensureStageParts();
      showHint(`נוספה במה — ${count} פלטות, ומדרגות בכל צד פתוח. לחיצה על מדרגות מחליפה אותן בבנקט או במחסום`);
    }
    setStageFill(null);
  }, [stageFill, stagePreview, act, batch, doc.placements, stageParts, wallDistance, ensureStageParts]);

  /** The one selected stage, if the selection is exactly that. */
  const soleStage = useMemo(() => {
    if (sole?.kind !== "placement") return null;
    const p = doc.placements.find((x) => x.id === sole.id);
    return p?.stage ? (p as StagePlacement) : null;
  }, [sole, doc.placements]);

  /** The stairs / banquette / barrier being edited, on the selected stage. Let go the moment that
   *  stage stops being the selection or the item stops existing — adjusted during render. */
  const [activeEdge, setActiveEdge] = useState<string | null>(null);
  if (activeEdge && !soleStage?.stage.stairs?.some((st) => st.id === activeEdge)) setActiveEdge(null);

  /** Where each stage on the plan needs a railing, by the studio's rule — drawn on the stage. */
  const stageRailings = useMemo(() => {
    if (!railingAboveMm) return undefined;
    const out: Record<string, EdgeRun[]> = {};
    for (const p of doc.placements) if (p.stage) out[p.id] = railingRuns(p as StagePlacement, deckOf, railingAboveMm, wallDistanceFor(p.id));
    return out;
  }, [doc.placements, railingAboveMm, wallDistance]);

  const stagePanel = useMemo<StagePanel | null>(() => {
    if (!soleStage) return null;
    const stage = soleStage.stage;
    const laid = layStage(stage, deckOf);
    const counts = new Map<string, number>();
    for (const d of laid.decks) counts.set(d.typeId, (counts.get(d.typeId) ?? 0) + 1);
    const front = stage.outline[stage.front];
    const frontNext = stage.outline[(stage.front + 1) % stage.outline.length];
    const side = (edge: number) => {
      if (edge === stage.front) return "בחזית";
      const a = stage.outline[edge];
      const b = stage.outline[(edge + 1) % stage.outline.length];
      if (!a || !b || !front || !frontNext) return "בצד";
      const u = { x: b.x - a.x, y: b.y - a.y };
      const f = { x: frontNext.x - front.x, y: frontNext.y - front.y };
      const cos = (u.x * f.x + u.y * f.y) / (Math.hypot(u.x, u.y) * Math.hypot(f.x, f.y) || 1);
      return cos < -0.9 ? "מאחור" : "בצד";
    };
    const railing = railingAboveMm ? (stageRailings?.[soleStage.id] ?? []) : null;
    const edges: StageEdgeRow[] = (stage.stairs ?? []).flatMap((st) => {
      const shape = edgeItemShape(stage, st, deckOf);
      if (!shape) return [];
      return [
        {
          id: st.id,
          kind: edgeKind(st),
          side: st.level ? "במפלס" : side(st.edge),
          widthMm: shape.widthMm,
          full: !!st.full,
          risers: shape.risers,
          riserMm: shape.riserMm,
          autoRisers: autoRisers(shape.riseMm),
          manual: !!st.risers,
          depthMm: shape.depthMm,
          heightMm: shape.heightMm,
          seats: shape.seats,
          seatsSet: st.seats !== undefined,
          autoSeats: Math.floor(shape.widthMm / SEAT_WIDTH_MM),
          dressed: doc.placements.filter((x) => x.perch?.stageId === soleStage.id && x.perch.itemId === st.id).length,
        },
      ];
    });
    return {
      edges,
      activeEdge: edges.find((e) => e.id === activeEdge) ?? null,
      gapsMm: edgeGaps(soleStage, deckOf, wallDistanceFor(soleStage.id)).reduce((t, g) => t + g.lengthMm, 0),
      benchCounted: !!(stage.benchVariant ?? stageParts.benchVariant),
      barrierCounted: !!(stage.barrierVariant ?? stageParts.barrierVariant),
      surface: stage.surfaceVariant ?? null,
      surfaceOptions: catalog
        .filter((x) => x.category === "stage-surfaces" && !x.archived)
        .map((x) => ({ value: defaultVariantId(x), label: x.name })),
      areaMm2: stageAreaMm2(stage),
      corners: stage.corners !== false,
      exceed: stage.exceed === true,
      cornerCount: stageCorners(stage, deckOf).length,
      size: stageRect(stage),
      deckCount: laid.decks.length,
      coverage: laid.coverage,
      decks: [...counts.entries()].map(([id, count]) => ({ name: resolve(id)?.product.name ?? "פלטה", count })),
      heightMm: stageHeight(stage, deckOf),
      levels: (stage.levels ?? []).map((l) => ({ id: l.id, heightMm: l.heightMm, deckCount: laid.decks.filter((d) => d.level === l.id).length })),
      skirtMm: skirtMm(soleStage, deckOf, wallDistanceFor(soleStage.id)),
      railingMm: railing ? railing.reduce((s, r) => s + r.lengthMm, 0) : null,
      railingAboveMm,
      stairsCounted: !!(stage.stairsVariant ?? stageParts.stairsVariant),
      skirtCounted: !!(stage.skirtVariant ?? stageParts.skirtVariant),
    };
  }, [soleStage, railingAboveMm, stageRailings, wallDistance, activeEdge, doc.placements, stageParts, catalog]);

  /** A rectangular stage typed to an exact size: the back stays where it stands and the front moves
   *  toward the room — what pulling its front handle does — with no snapping at all. */
  const setStageSize = useCallback(
    (size: { widthMm: number; depthMm: number }) => {
      if (!soleStage) return;
      const cur = stageRect(soleStage.stage);
      if (!cur || size.widthMm < 100 || size.depthMm < 100) return;
      const c = toRoom(soleStage, { x: 0, y: (cur.depthMm - size.depthMm) / 2 });
      const position = { x: Math.round(c.x), y: Math.round(c.y) };
      const levels = carryLevels(soleStage.stage.levels, soleStage, { ...soleStage, position });
      act({ type: "setPlacementStage", id: soleStage.id, stage: { ...soleStage.stage, outline: rectOutline(size.widthMm, size.depthMm), levels }, position });
    },
    [soleStage, act],
  );

  /** Back into the area tool with this stage's own outline, front and decks. */
  const editStage = useCallback(() => {
    if (!soleStage) return;
    // Decks archived since the stage was drawn are not offered again; if none of its decks are left,
    // the edit starts from every deck the catalog has now.
    const still = soleStage.stage.decks.filter((id) => deckTypes.some((t) => t.id === id));
    setSelected([]);
    setStageFill({
      phase: "pick",
      polygon: stageOutlineInRoom(soleStage).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      front: soleStage.stage.front,
      chosen: still.length ? still : deckTypes.map((t) => t.id),
      editing: soleStage.id,
      ...(soleStage.stage.exceed ? { exceed: true } : {}),
    });
  }, [soleStage, deckTypes]);

  /** The stage, taken apart into the decks it was built of — loose, grouped, where they stood — and
   *  its flights into loose stairs beside them. One way: the plan holds decks from here on, for the
   *  designer who needs to move one by hand. */
  const explodeStage = useCallback(() => {
    if (!soleStage) return;
    const decks = stageDecksInRoom(soleStage, deckOf);
    if (decks.length === 0) return;
    const added: Placement[] = decks.map((d) => ({
      id: uid(),
      variantId: d.typeId,
      layer: "floor",
      quantity: 1,
      position: d.centre,
      rotation: d.rotation,
      scale: 1,
    }));
    const stairsVariant = soleStage.stage.stairsVariant;
    if (stairsVariant && resolve(stairsVariant)) {
      for (const st of soleStage.stage.stairs ?? []) {
        const shape = stairShape(soleStage.stage, st, deckOf);
        if (!shape) continue;
        const [a, b, c, d] = shape.polygon.map((q) => toRoom(soleStage, q));
        added.push({
          id: uid(),
          variantId: stairsVariant,
          layer: "floor",
          quantity: 1,
          position: { x: Math.round((a.x + b.x + c.x + d.x) / 4), y: Math.round((a.y + b.y + c.y + d.y) / 4) },
          rotation: Math.round(((((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 360) + 360) % 360),
          scale: 1,
        });
      }
    }
    // What stood on its banquettes stays where it stood, free of the stage.
    const dressed = doc.placements.filter((x) => x.perch?.stageId === soleStage.id);
    const freed = dressed.flatMap((x) => {
      const bench = benchInRoom(soleStage, x.perch!.itemId, deckOf);
      const mates = dressed.filter((y) => y.perch!.itemId === x.perch!.itemId);
      const f = bench ? (mates.indexOf(x) + 0.5) / mates.length - 0.5 : 0;
      const u = bench ? { x: Math.cos((bench.angle * Math.PI) / 180), y: Math.sin((bench.angle * Math.PI) / 180) } : { x: 0, y: 0 };
      const at = bench ? { x: Math.round(bench.centre.x + u.x * f * bench.lengthMm), y: Math.round(bench.centre.y + u.y * f * bench.lengthMm) } : x.position;
      return [
        { type: "setPlacementPerch" as const, id: x.id, perch: null },
        { type: "movePlacement" as const, id: x.id, position: at },
      ];
    });
    const groupId = uid();
    batch([
      ...freed,
      { type: "removePlacement", id: soleStage.id },
      ...added.map((placement) => ({ type: "addPlacement" as const, placement })),
      ...(added.length > 1 ? [{ type: "group" as const, groupId, refs: added.map((p) => ({ kind: "placement" as const, id: p.id })) }] : []),
    ]);
    setSelected(added.map((p) => ({ kind: "placement" as const, id: p.id })));
    showHint(`הבמה פורקה ל־${decks.length} פלטות`);
  }, [soleStage, batch, doc.placements]);

  // ── A stage's own parts: its height, its levels, its flights ─────────────────────────────────
  /** Level drawing, or stair placing, on one stage. The area tool draws the level; the canvas offers
   *  the stage's sides for a flight. */
  const [stageTool, setStageTool] = useState<{ kind: "level" | "stair"; stageId: string; edgeKind?: EdgeKindId } | null>(null);
  // Placing a flight ends the moment the stage it was for stops being the selection — adjusted
  // during render, like the area tool's reset, rather than in an effect a frame later.
  if (stageTool?.kind === "stair" && soleStage?.id !== stageTool.stageId) setStageTool(null);
  const toolStage = useMemo(() => {
    if (!stageTool) return null;
    const p = doc.placements.find((x) => x.id === stageTool.stageId);
    return p?.stage ? (p as StagePlacement) : null;
  }, [stageTool, doc.placements]);
  /** …and a level is drawn in lengths its own stage's decks build. */
  const levelDecks = toolStage?.stage.decks;
  const levelLengthSnap = useMemo(() => (levelDecks ? lengthSnapper(deckTypes.filter((t) => levelDecks.includes(t.id))) : undefined), [levelDecks, deckTypes]);

  const patchStage = useCallback(
    (id: string, patch: (stage: StageBuild) => StageBuild) => {
      const p = doc.placements.find((x) => x.id === id);
      if (p?.stage) act({ type: "setPlacementStage", id, stage: patch(p.stage) });
    },
    [doc.placements, act],
  );

  const setStageHeightMm = useCallback(
    (heightMm: number) => soleStage && patchStage(soleStage.id, (s) => ({ ...s, heightMm: Math.round(heightMm) })),
    [soleStage, patchStage],
  );
  const setLevelHeight = useCallback(
    (levelId: string, heightMm: number) =>
      soleStage &&
      patchStage(soleStage.id, (s) => ({ ...s, levels: (s.levels ?? []).map((l) => (l.id === levelId ? { ...l, heightMm: Math.round(heightMm) } : l)) })),
    [soleStage, patchStage],
  );
  const removeLevel = useCallback(
    (levelId: string) =>
      soleStage &&
      patchStage(soleStage.id, (s) => ({
        ...s,
        levels: (s.levels ?? []).filter((l) => l.id !== levelId),
        stairs: (s.stairs ?? []).filter((st) => st.level !== levelId),
      })),
    [soleStage, patchStage],
  );
  const removeStair = useCallback(
    (stairId: string) => {
      if (!soleStage) return;
      const carried = doc.placements.filter((x) => x.perch?.stageId === soleStage.id && x.perch.itemId === stairId);
      if (carried.length) batch(carried.map((x) => ({ type: "removePlacement" as const, id: x.id })));
      patchStage(soleStage.id, (s) => ({ ...s, stairs: (s.stairs ?? []).filter((st) => st.id !== stairId) }));
    },
    [soleStage, patchStage, doc.placements, batch],
  );
  const changeStair = useCallback(
    (
      stairId: string,
      patch: { kind?: EdgeKindId; widthMm?: number; risers?: number | null; full?: boolean; depthMm?: number; heightMm?: number; seats?: number | null },
    ) => {
      if (!soleStage) return;
      // A banquette turned into stairs or a barrier puts down what stood on it.
      if (patch.kind && patch.kind !== "bench") {
        const carried = doc.placements.filter((x) => x.perch?.stageId === soleStage.id && x.perch.itemId === stairId);
        if (carried.length) batch(carried.map((x) => ({ type: "removePlacement" as const, id: x.id })));
      }
      patchStage(soleStage.id, (s) => ({
        ...s,
        stairs: (s.stairs ?? []).map((st) => {
          if (st.id !== stairId) return st;
          const next = {
            ...st,
            ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
            ...(patch.widthMm !== undefined ? { widthMm: Math.max(300, Math.round(patch.widthMm)) } : {}),
            ...(patch.full !== undefined ? { full: patch.full } : {}),
            ...(patch.depthMm !== undefined ? { depthMm: Math.round(patch.depthMm) } : {}),
            ...(patch.heightMm !== undefined ? { heightMm: Math.round(patch.heightMm) } : {}),
          };
          if (patch.seats === null) {
            const { seats: _auto, ...rest } = next;
            return rest;
          }
          if (patch.seats !== undefined) return { ...next, seats: Math.max(0, Math.round(patch.seats)) };
          if (patch.risers === null) {
            const { risers: _auto, ...rest } = next;
            return rest;
          }
          return patch.risers !== undefined ? { ...next, risers: Math.max(1, Math.round(patch.risers)) } : next;
        }),
      }));
      if (patch.kind) ensureStageParts();
    },
    [soleStage, patchStage, doc.placements, batch, ensureStageParts],
  );

  const setSurface = useCallback(
    (variantId: string | null) =>
      soleStage &&
      patchStage(soleStage.id, (s) => {
        const { surfaceVariant: _was, ...rest } = s;
        return variantId ? { ...rest, surfaceVariant: variantId } : rest;
      }),
    [soleStage, patchStage],
  );
  const setCorners = useCallback(
    (on: boolean) =>
      soleStage &&
      patchStage(soleStage.id, (s) => {
        const { corners: _was, ...rest } = s;
        return on ? rest : { ...rest, corners: false };
      }),
    [soleStage, patchStage],
  );
  /** Whether this stage's decks may reach past its outline (StageBuild.exceed) — the build follows. */
  const setExceed = useCallback(
    (on: boolean) =>
      soleStage &&
      patchStage(soleStage.id, (s) => {
        const { exceed: _was, ...rest } = s;
        return on ? { ...rest, exceed: true } : rest;
      }),
    [soleStage, patchStage],
  );

  // ── Templates ─────────────────────────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<StageTemplate[]>([]);
  useEffect(() => {
    let live = true;
    fetchStageTemplates()
      .then((t) => live && setTemplates(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  /** A saved stage being placed: it follows the pointer until a click puts it down. */
  const [placing, setPlacing] = useState<StageTemplate | null>(null);

  const saveTemplate = useCallback(
    async (name: string) => {
      if (!soleStage) return;
      const dressing = doc.placements
        .filter((x) => x.perch?.stageId === soleStage.id)
        .map((x) => ({ itemId: x.perch!.itemId, variantId: x.variantId, quantity: x.quantity }));
      const res = await saveStageTemplate({ id: uid(), name, stage: soleStage.stage, ...(dressing.length ? { dressing } : {}) });
      if ("error" in res) {
        showHint(res.error);
        return;
      }
      setTemplates(res);
      showHint(`התבנית ״${name}״ נשמרה — היא מופיעה בכלי ״מילוי במות״`);
    },
    [soleStage, doc.placements],
  );
  const removeTemplate = useCallback(async (id: string) => {
    setTemplates(await deleteStageTemplate(id));
  }, []);

  /** Put a saved stage down at `at`: the stage, facing the page's top, with its own banquette
   *  dressing back on it. Its variant is the deck it is mostly built from, as a drawn stage's is. */
  const placeTemplate = useCallback(
    (at: Point) => {
      const t = placing;
      setPlacing(null);
      if (!t) return;
      const id = uid();
      const tally = new Map<string, number>();
      for (const d of layStage(t.stage, deckOf).decks) tally.set(d.typeId, (tally.get(d.typeId) ?? 0) + 1);
      const variantId = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? t.stage.decks[0];
      if (!variantId) {
        showHint("הפלטות של התבנית כבר לא בקטלוג");
        return;
      }
      const dressing: Placement[] = (t.dressing ?? []).flatMap((d) => {
        const r = resolve(d.variantId);
        return r
          ? [{ id: uid(), variantId: d.variantId, layer: r.product.layer, quantity: d.quantity, position: at, rotation: 0, scale: 1, perch: { stageId: id, itemId: d.itemId } }]
          : [];
      });
      batch([
        { type: "addPlacement", placement: { id, variantId, layer: "floor", quantity: 1, position: at, rotation: 0, scale: 1, stage: { ...t.stage, ...stageParts, ...templateFinishes(t.stage) } } },
        ...dressing.map((placement) => ({ type: "addPlacement" as const, placement })),
      ]);
      setSelected([{ kind: "placement", id }]);
      ensureStageParts();
      showHint(`הוצבה במה מתבנית ״${t.name}״`);
    },
    [placing, batch, stageParts, ensureStageParts],
  );
  // Escape lets go of a template being placed.
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setPlacing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [placing]);

  // ── Saved sketches ───────────────────────────────────────────────────────────────────────────
  // A whole drawing kept under a name (lib/studio/sketch-actions.ts): saved from here, loaded here —
  // in place of what is drawn, or on top of it — and offered when a new event is opened.
  const [sketches, setSketches] = useState<SketchTemplateSummary[]>([]);
  useEffect(() => {
    let live = true;
    fetchSketchTemplates()
      .then((t) => live && setSketches(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const eventVenueId = workspace?.event?.venueId ?? null;
  const saveSketch = useCallback(
    async (name: string) => {
      const res = await saveSketchTemplate({ name, venueId: eventVenueId, content: doc });
      if ("error" in res) {
        showHint(res.error);
        return;
      }
      setSketches(res);
      showHint(`הסקיצה ״${name}״ נשמרה — אפשר לפתוח ממנה אירוע חדש, או לטעון אותה לכל סקיצה`);
    },
    [doc, eventVenueId],
  );
  /** Replace the drawing with a saved sketch (one undo), or add the sketch's things to it — re-id'd
   *  and renumbered on from the room's last table, the way a paste is. What hung on another venue's
   *  walls is already gone (adoptSketch, server side). */
  const loadSketch = useCallback(
    async (id: string, mode: "replace" | "add") => {
      const content = await fetchSketchTemplateContent(id, eventVenueId);
      if (!content) {
        showHint("הסקיצה לא נמצאה — אולי נמחקה");
        setSketches(await fetchSketchTemplates());
        return;
      }
      if (mode === "replace") {
        setSelected([]);
        act({ type: "loadDocument", content });
        showHint("הסקיצה נטענה במקום הקיימת — Ctrl+Z מחזיר את הקודמת");
        return;
      }
      const fresh = pasteInto(
        { tables: content.tables, placements: content.placements, groups: content.groups ?? [] },
        { dx: 0, dy: 0, firstNumber: nextNumber(), newId: uid },
      );
      addClip(fresh);
      showHint(`נוספו ${clipCount(fresh)} פריטים מהסקיצה — הם נבחרים, ואפשר לגרור אותם למקומם`);
    },
    [eventVenueId, act, addClip, nextNumber],
  );
  const deleteSketch = useCallback(async (id: string) => {
    setSketches(await deleteSketchTemplate(id));
    showHint("הסקיצה נמחקה");
  }, []);

  // ── Click-to-place ───────────────────────────────────────────────────────────────────────────
  // A click on a rail row ARMS that item; every click on the plan then puts one down, until Escape,
  // a right-click, a second click on the row, or the banner's ✕. Forty tables are forty clicks
  // rather than forty drags across the screen. Each one goes through dropProduct — the drop's own
  // path, so a clicked cloth and a dragged one cannot land differently — and is its own undo step.
  // Things an event has one of let go after one (placesOnce); Shift keeps them.
  const [armedId, setArmedId] = useState<string | null>(null);
  const [armedCount, setArmedCount] = useState(0);
  // Read from the live catalog: an item archived while armed simply stops being armed.
  const armed = armedId ? (catalog.find((p) => p.id === armedId && !p.archived) ?? null) : null;
  const arm = (productId: string | null) => {
    setArmedId(productId);
    setArmedCount(0);
    // One armed thing at a time: a template half-placed and a catalog item armed would both claim
    // the next click.
    if (productId) setPlacing(null);
  };
  const placeArmed = (at: Point, keep: boolean) => {
    if (!armed || !dropProduct(armed.id, at.x, at.y)) return;
    if (placesOnce(CATEGORY_BY_ID[armed.category]) && !keep) {
      arm(null);
      return;
    }
    setArmedCount((n) => n + 1);
  };
  useEffect(() => {
    if (!armedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A dialog over the plan (the add-product form) owns its own Escape.
      if (e.target instanceof Element && e.target.closest("dialog")) return;
      e.preventDefault();
      e.stopPropagation();
      setArmedId(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [armedId]);

  /** Everyone the plan seats: at its tables (a group of tables as the one table it is) and on its
   *  stages' banquettes. */
  const seating = useMemo(() => {
    let tables = 0;
    for (const u of numberedUnits(doc)) {
      if (u.tableIds.length > 1) tables += groupSeats(doc, u.id);
      else tables += doc.tables.find((t) => t.id === u.tableIds[0])?.seats ?? 0;
    }
    return { tables, benches: benchSeats(doc.placements, deckOf) };
  }, [doc]);

  /** Every bare stretch of open edge covered with `kind` — a flight or a banquette where there is
   *  floor in front of it, else a barrier. */
  const fillEdges = useCallback(
    (kind: EdgeKindId) => {
      if (!soleStage) return;
      const wd = wallDistanceFor(soleStage.id);
      const add = fillGaps(soleStage, deckOf, kind, uid, wd).map((it) => (stairFits(soleStage, it, deckOf, wd).ok ? it : { ...it, kind: "barrier" as const }));
      if (!add.length) return;
      patchStage(soleStage.id, (s) => ({ ...s, stairs: [...(s.stairs ?? []), ...add] }));
      ensureStageParts();
    },
    [soleStage, wallDistance, patchStage, ensureStageParts],
  );
  /** A stage PIECE standing on its own — a "במה 400×300" dropped from the rail — as a stage: its box
   *  as the outline, every piece the studio has as what it may be built from (so it comes out as
   *  itself, and grows in its own steps), its own height, the studio's stairs and skirt, and one
   *  flight on a side off the walls. Null for anything that is not a rectangular stage piece. */
  const asStage = useCallback(
    (p: Placement, withStair = true): StagePlacement | null => {
      if (p.stage) return p as StagePlacement;
      if (!isStagePiece(p)) return null;
      const product = resolve(p.variantId)?.product;
      if (!product) return null;
      return stageFromPiece(p, p.sizeMm ?? catalogBox(product), {
        decks: deckTypes.map((t) => t.id),
        heightMm: product.dimensions.heightMm,
        parts: stageParts,
        deckOf,
        newId: uid,
        withEdges: withStair,
        wallDistance: wallDistanceFor(p.id),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckTypes, stageParts, wallDistance, doc.placements],
  );
  /** A stage, or a piece of one: anything rectangular from "במות" / "פלטות במה" standing free on the
   *  floor — archived rows included, so an old platform still on a plan can still become a stage. */
  function isStagePiece(p: Placement | undefined): p is Placement {
    if (!p || p.tableId || p.perch) return false;
    if (p.stage) return true;
    const product = resolve(p.variantId)?.product;
    if (!product || !STAGE_PIECE_CATEGORIES.includes(product.category)) return false;
    return (product.appearance?.shape ?? (product.dimensions.diameterMm ? "circle" : "rect")) === "rect" && !product.appearance?.parts?.length;
  }

  /** The one selected thing, when it is a stage piece that is not yet a stage. */
  const makeStage = useMemo(() => {
    if (sole?.kind !== "placement") return undefined;
    const p = doc.placements.find((x) => x.id === sole.id);
    if (!p || p.stage || !isStagePiece(p)) return undefined;
    return () => {
      const sp = asStage(p);
      if (!sp) return;
      // Replaced rather than patched: its scale and stretched size become the outline itself.
      batch([
        { type: "removePlacement", id: p.id },
        { type: "addPlacement", placement: sp },
      ]);
      setSelected([{ kind: "placement", id: p.id }]);
      ensureStageParts();
      showHint("הפריט הוא במה עכשיו — מדרגות, גובה ומפלסים בסרגל שלה");
    };
  }, [sole, doc.placements, isStagePiece, asStage, batch]);

  /** The selected things that are stages, or stage pieces that can become one. */
  const selectedStages = useMemo(
    () =>
      selected
        .filter((r) => r.kind === "placement")
        .map((r) => doc.placements.find((p) => p.id === r.id))
        .filter(isStagePiece),
    [selected, doc.placements, isStagePiece],
  );

  /** Several stages selected (or a group of them): the bar speaks of stages, not "items". */
  const stageGroup = useMemo(() => {
    if (selected.length < 2 || selected.some((r) => r.kind !== "placement")) return null;
    if (selectedStages.length !== selected.length) return null;
    const groups = new Set(selectedStages.map((p) => p.groupId));
    return { count: selectedStages.length, grouped: groups.size === 1 && !groups.has(undefined) };
  }, [selected, selectedStages]);

  /** Their turned boxes, as stickBoxes reads them. */
  const stickItems = useCallback(
    (list: Placement[]): StickItem[] =>
      list.map((p) => {
        if (p.stage) {
          const xs = p.stage.outline.map((q) => q.x);
          const ys = p.stage.outline.map((q) => q.y);
          return { id: p.id, centre: p.position, rotation: p.rotation || 0, widthMm: Math.max(...xs) - Math.min(...xs), depthMm: Math.max(...ys) - Math.min(...ys) };
        }
        const product = resolve(p.variantId)?.product;
        const box = p.sizeMm ?? (product ? catalogBox(product) : { widthMm: 0, depthMm: 0 });
        const k = p.scale || 1;
        return { id: p.id, centre: p.position, rotation: p.rotation || 0, widthMm: box.widthMm * k, depthMm: box.depthMm * k };
      }),
    [],
  );

  const stickStages = useCallback(() => {
    const moves = stickBoxes(stickItems(selectedStages));
    if (moves.size === 0) {
      showHint("הבמות כבר צמודות — או שהן בזוויות שונות זו מזו");
      return;
    }
    const after = selectedStages
      .filter((p): p is StagePlacement => !!p.stage)
      .map((p) => (moves.has(p.id) ? { ...p, position: moves.get(p.id)! } : p) as StagePlacement);
    const trimmed = trimSeams(after, deckOf);
    batch([
      { type: "moveMany", moves: [...moves].map(([id, position]) => ({ kind: "placement" as const, id, position })) },
      ...[...trimmed].map(([id, stairs]) => {
        const was = after.find((p) => p.id === id)!;
        return { type: "setPlacementStage" as const, id, stage: { ...was.stage, stairs } };
      }),
    ]);
    showHint(`הבמות הוצמדו — ${moves.size} הוזזו. ״איחוד לבמה אחת״ יהפוך אותן לבמה אחת עם קצוות משותפים`);
  }, [selectedStages, stickItems, batch]);

  /** Several stages as ONE: pushed together first (so "איחוד" works on stages that merely stand
   *  close), then one outline, one build, one skirt round the outside. The largest keeps its place,
   *  its front and its id. */
  const mergeSelectedStages = useCallback(() => {
    const moves = stickBoxes(stickItems(selectedStages));
    const parts = selectedStages
      // Pieces become stages WITHOUT a flight each — the merged stage gets its stairs below.
      .map((p) => asStage(moves.has(p.id) ? { ...p, position: moves.get(p.id)! } : p, false))
      .filter((p): p is StagePlacement => !!p)
      .sort((a, b) => {
        const area = (x: StagePlacement) => Math.abs(signedArea(x.stage.outline));
        return area(b) - area(a);
      });
    const merged = parts.length >= 2 ? mergeStages(parts) : null;
    if (!merged) {
      showHint("אי אפשר לאחד — הבמות צריכות להיות מלבניות ובאותו כיוון (או בזווית ישרה זו לזו)");
      return;
    }
    const anchor = parts[0];
    const others = new Set(parts.slice(1).map((p) => p.id));
    // The merged edges are new: whatever is bare gets stairs, as a new stage does.
    const mergedAt: StagePlacement = { ...anchor, stage: merged.stage, position: merged.position, rotation: merged.rotation, mirrored: false };
    const wd = besideNeighbours(
      wallDistance,
      doc.placements.filter((x) => x.stage && !others.has(x.id) && x.id !== anchor.id).map((x) => stageOutlineInRoom(x as StagePlacement)),
    );
    const gaps = fillGaps(mergedAt, deckOf, "stairs", uid, wd)
      .filter((it) => !it.level)
      .map((it) => (stairFits(mergedAt, it, deckOf, wd).ok ? it : { ...it, kind: "barrier" as const }));
    merged.stage.stairs = [...(merged.stage.stairs ?? []), ...gaps];
    batch([
      // What stood on the others' banquettes moves to the merged stage — their items kept their ids.
      ...doc.placements
        .filter((x) => x.perch && others.has(x.perch.stageId))
        .map((x) => ({ type: "setPlacementPerch" as const, id: x.id, perch: { stageId: anchor.id, itemId: x.perch!.itemId } })),
      ...[...others].map((id) => ({ type: "removePlacement" as const, id })),
      { type: "setPlacementStage", id: anchor.id, stage: merged.stage, position: merged.position, rotation: merged.rotation, mirrored: false, scale: 1 },
      // A piece that was never a stage leaves its catalog stretch behind — the outline is the size now.
      ...(doc.placements.find((x) => x.id === anchor.id)?.sizeMm ? [{ type: "resizePlacement" as const, id: anchor.id, sizeMm: null }] : []),
    ]);
    setSelected([{ kind: "placement", id: anchor.id }]);
    ensureStageParts();
    showHint(`${parts.length} במות אוחדו לבמה אחת`);
  }, [selectedStages, stickItems, asStage, batch, wallDistance, doc.placements, ensureStageParts]);

  const startLevel = useCallback(() => {
    if (!soleStage) return;
    setStageTool({ kind: "level", stageId: soleStage.id });
  }, [soleStage, setStageTool]);
  const startEdge = useCallback(
    (edgeKind: EdgeKindId) => {
      if (!soleStage) return;
      setActiveEdge(null);
      setStageTool({ kind: "stair", stageId: soleStage.id, edgeKind });
    },
    [soleStage, setStageTool, setActiveEdge],
  );

  /** A level just drawn: into the stage's frame, and 20cm above the base — the ordinary step from a
   *  stage up to a riser, which the designer then changes in the bar. */
  const addLevel = useCallback(
    (room: Point[]) => {
      const p = toolStage;
      setStageTool(null);
      if (!p) return;
      const outline = room.map((r) => {
        const q = toStageFrame(p, r);
        return { x: Math.round(q.x), y: Math.round(q.y) };
      });
      if (!polygonsOverlap(outline, p.stage.outline)) {
        showHint("המפלס סומן מחוץ לבמה — מסמנים אותו על הבמה עצמה");
        setSelected([{ kind: "placement", id: p.id }]);
        return;
      }
      const baseH = stageHeight(p.stage, deckOf);
      const level = { id: uid(), outline, heightMm: baseH + 200 };
      patchStage(p.id, (s) => {
        const next = { ...s, levels: [...(s.levels ?? []), level] };
        // Its faces onto the base are edges too: stairs up onto it, like every other open side.
        const faces = fillGaps({ ...p, stage: next }, deckOf, "stairs", uid, wallDistance).filter((it) => it.level === level.id);
        return { ...next, stairs: [...(next.stairs ?? []), ...faces] };
      });
      setSelected([{ kind: "placement", id: p.id }]);
      showHint("נוסף מפלס מוגבה — את הגובה שלו קובעים בסרגל הבמה, תחת ״גובה״");
    },
    [toolStage, patchStage, wallDistance],
  );

  /** The sides a flight may be put against, in the room: the stage's own, and each level's faces
   *  that look onto the base. */
  const stairPick = useMemo(() => {
    if (stageTool?.kind !== "stair" || !toolStage) return null;
    const p = toolStage;
    const out: { level?: string; edge: number; a: Point; b: Point }[] = [];
    const edges = (outline: Point[], level?: string) =>
      outline.forEach((_, i) => out.push({ level, edge: i, a: toRoom(p, outline[i]), b: toRoom(p, outline[(i + 1) % outline.length]) }));
    edges(p.stage.outline);
    for (const l of p.stage.levels ?? []) edges(l.outline, l.id);
    return out;
  }, [stageTool, toolStage]);

  const pickStair = useCallback(
    (level: string | undefined, edge: number, t: number) => {
      const p = toolStage;
      if (!p) return;
      const wd = wallDistanceFor(p.id);
      const stair: StageStair = itemAt(p, deckOf, stageTool?.edgeKind ?? "stairs", level, edge, t, uid(), wd);
      const fits = stairFits(p, stair, deckOf, wd);
      if (!fits.ok) {
        showHint(
          fits.reason === "wall"
            ? "הצד הזה צמוד לקיר — אין מקום למדרגות. בחרו צד אחר"
            : fits.reason === "flat"
              ? "המפלס לא גבוה מהבמה — אין לאן לעלות"
              : "הצד קצר מדי לגרם מדרגות",
        );
        return;
      }
      setStageTool(null);
      patchStage(p.id, (s) => ({ ...s, stairs: [...(s.stairs ?? []), stair] }));
      setSelected([{ kind: "placement", id: p.id }]);
      setActiveEdge(stair.id);
      ensureStageParts();
    },
    [toolStage, wallDistance, patchStage, stageTool, ensureStageParts],
  );

  // Escape leaves stair placing (the level drawing has the area tool's own Escape).
  useEffect(() => {
    if (stageTool?.kind !== "stair") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setStageTool(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [stageTool]);

  /** The size panel for one selected resizable thing (Product.resize) — a carpet keeps its own. */
  const sizePanel = useMemo(() => {
    if (!sole || sole.kind === "feature") return null;
    if (sole.kind === "table") {
      const t = doc.tables.find((x) => x.id === sole.id);
      const product = t?.variantId ? resolve(t.variantId)?.product : undefined;
      const axes = product ? resizeAxes(product) : null;
      if (!t || !product?.resize || !axes) return null;
      return { size: t.sizeMm ?? catalogBox(product), catalog: catalogBox(product), axes, spec: product.resize, custom: !!t.sizeMm };
    }
    const p = doc.placements.find((x) => x.id === sole.id);
    const r = p ? resolve(p.variantId) : undefined;
    if (!p || !r || r.sizing === "stretch" || p.tableId || r.anchor !== "free") return null;
    const axes = resizeAxes(r.product);
    if (!r.product.resize || !axes) return null;
    return { size: p.sizeMm ?? catalogBox(r.product), catalog: catalogBox(r.product), axes, spec: r.product.resize, custom: !!p.sizeMm };
  }, [sole, doc]);

  /** A typed size, snapped to the module and held in range; null goes back to the catalog's. It
   *  grows about the centre — the handles on the plan are for growing from one edge. */
  const resizeSole = useCallback(
    (size: { widthMm: number; depthMm: number } | null) => {
      if (!sole || sole.kind === "feature") return;
      const variantId =
        sole.kind === "table" ? doc.tables.find((t) => t.id === sole.id)?.variantId : doc.placements.find((p) => p.id === sole.id)?.variantId;
      const product = variantId ? resolve(variantId)?.product : undefined;
      if (!product) return;
      const next = size ? clampSize(product, size) : null;
      act(sole.kind === "table" ? { type: "resizeTable", id: sole.id, sizeMm: next } : { type: "resizePlacement", id: sole.id, sizeMm: next });
    },
    [sole, doc, act],
  );

  // --- numbering ---------------------------------------------------------------------------------
  // What the plan's numbers WOULD be, put back in order. Held rather than recomputed on click, so
  // the button can be disabled when there is nothing to fix — which is also how the designer learns
  // the numbering is already clean without pressing anything.
  //
  // WHERE it starts and WHICH WAY it runs are the designer's, not ours. The default is still the
  // top-right in rows — a Hebrew reader's eye, and where the head table usually is — but a room
  // whose entrance is at the far corner gets numbered from that corner, and a hall of tables either
  // side of an aisle gets numbered in columns. Held on this screen rather than in the document: it
  // is how the designer wants to READ the room, not a fact about the event, and it is re-applied by
  // pressing the button, never automatically.
  const [numbering, setNumbering] = useState<NumberingOptions>(DEFAULT_NUMBERING);
  const renumbering = useMemo(() => orderedNumbering(doc, numbering), [doc, numbering]);

  const renumberAll = useCallback(() => {
    if (renumbering.length === 0) return;
    batch(
      renumbering.map((r) =>
        r.kind === "table"
          ? { type: "renumberTable" as const, id: r.id, number: r.number }
          : { type: "renumberGroup" as const, groupId: r.id, number: r.number },
      ),
    );
    showHint(`${renumbering.length} שולחנות מוספרו מחדש`);
  }, [renumbering, batch]);

  const changeQuantity = (id: string, delta: number) => {
    const p = doc.placements.find((x) => x.id === id);
    if (!p) return;
    act({ type: "setPlacementQuantity", id, quantity: Math.max(1, p.quantity + delta) });
  };


  // --- dressing a table ------------------------------------------------------------------------------
  // A table's focus mode, its arrange actions, and putting what is on it onto other tables in a
  // pattern (lib/studio/table-patterns.ts). Where things stand on a table is
  // lib/design-document/dressing.ts.

  /** Open a table to dress it: framed, with the table itself selected so its bar (the cloth, the
   *  chairs) is the one along the bottom. */
  const dressTable = useCallback((tableId: string) => {
    setDressing(tableId);
    setSelected([{ kind: "table", id: tableId }]);
  }, []);

  /** An arrange action on the table being dressed — on the selected items when there are some (two
   *  or more; one is enough for "to the centre"), on all of them otherwise. One history entry. */
  const arrangeDressed = (kind: ArrangeKind | "auto") => {
    const t = doc.tables.find((x) => x.id === dressing);
    if (!t) return;
    if (kind === "auto") {
      act({ type: "resetDressing", tableId: t.id });
      return;
    }
    const spots = dressingSpots(t, chipsOn(t.id));
    const current = new Map(spots.map((sp) => [sp.p.id, sp.local]));
    // A runner stays where it lies — the arrangement is of what is set out ON it.
    const laid = spots.filter((sp) => !sp.runner);
    const picked = selected.filter((r) => r.kind === "placement" && laid.some((sp) => sp.p.id === r.id)).map((r) => r.id);
    const subset = picked.length >= (kind === "center" ? 1 : 2) ? picked : undefined;
    const next = arrange(kind, tableBox(t), laid.map((sp) => sp.box), current, subset);
    act({ type: "arrangeDressing", tableId: t.id, positions: [...next].map(([id, position]) => ({ id, position })) });
  };

  /** The arrow keys on the table being dressed: the selected items on it step 1cm (Shift: 5cm) in
   *  the direction of the key ON SCREEN — carried into the table's frame, so a table turned 90° still
   *  moves its candlestick the way the arrow points — and stay on the table top. True when something
   *  moved, so the key is spent. */
  const nudgeDressing = useCallback(
    (key: string, big: boolean): boolean => {
      const t = dressing ? doc.tables.find((x) => x.id === dressing) : undefined;
      if (!t) return false;
      const step = big ? 50 : 10;
      const d = key === "ArrowLeft" ? { x: -step, y: 0 } : key === "ArrowRight" ? { x: step, y: 0 } : key === "ArrowUp" ? { x: 0, y: -step } : key === "ArrowDown" ? { x: 0, y: step } : null;
      if (!d) return false;
      const chips = doc.placements.filter((p) => p.layer === "table" && p.tableId === t.id && resolve(p.variantId)?.anchor !== "table");
      const picked = new Set(selected.filter((r) => r.kind === "placement").map((r) => r.id));
      if (!chips.some((c) => picked.has(c.id))) return false;
      const local = toTableFrame({ position: { x: 0, y: 0 }, rotation: t.rotation, mirrored: t.mirrored }, d);
      const box = tableBox(t);
      act({
        type: "arrangeDressing",
        tableId: t.id,
        positions: dressingSpots(t, chips).map((sp) => ({
          id: sp.p.id,
          position: picked.has(sp.p.id) ? clampToTable(box, sp.box, { x: sp.local.x + local.x, y: sp.local.y + local.y }) : sp.local,
        })),
      });
      return true;
    },
    [dressing, doc, selected, act],
  );

  /** One item onto a set of tables. It recolours a table already wearing another shade of the same
   *  product rather than giving it a second one, and keeps its place on the table — on a target that
   *  is arranged by hand; an automatic one lays it out itself. */
  const applyItemTo = (placementId: string, groups: { tableIds: string[]; variantId?: string }[]) => {
    const p = doc.placements.find((x) => x.id === placementId);
    const count = groups.reduce((n, g) => n + g.tableIds.length, 0);
    if (!p || count === 0) return;
    // One action per shade, in one history entry: two shades in alternation are one thing done.
    batch(
      groups.map((g) => ({
        type: "applyToTables" as const,
        tableIds: g.tableIds,
        placement: { variantId: g.variantId ?? p.variantId, layer: "table" as const, quantity: p.quantity, position: p.position, rotation: p.rotation, scale: p.scale },
        replaces: shadesOf(p.variantId).map((sh) => sh.id),
      })),
    );
    showHint(`${resolve(p.variantId)?.product.name ?? "הפריט"} הוחל על ${count} שולחנות${groups.length > 1 ? " בשני גוונים" : ""}`);
  };

  /** A table's whole dressing onto a set of tables. */
  const applyDressingFrom = (fromTableId: string, toTableIds: string[], mode: "add" | "replace") => {
    if (toTableIds.length === 0) return;
    // The shades of whatever the source is wearing, so a target already in cream is recoloured to the
    // source's gold rather than handed a second cloth. A table wears one cloth; the quote sums every
    // placement, so the second one would be billed.
    const replaces = doc.placements
      .filter((p) => p.layer === "table" && p.tableId === fromTableId)
      .flatMap((p) => shadesOf(p.variantId).map((sh) => sh.id));
    act({ type: "copyDressing", fromTableId, toTableIds, mode, replaces });
    showHint(mode === "replace" ? `${toTableIds.length} שולחנות עוצבו מחדש` : `העיצוב הוחל על ${toTableIds.length} שולחנות`);
  };

  // ── saved table designs (TableDesign) ──────────────────────────────────────────────────────────
  const [designs, setDesigns] = useState<TableDesign[]>([]);
  useEffect(() => {
    let live = true;
    fetchTableDesigns()
      .then((d) => live && setDesigns(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  /** Everything on a table — its cloth too — saved under a name, standing where it stands. */
  const saveDesign = async (tableId: string, name: string) => {
    const t = doc.tables.find((x) => x.id === tableId);
    const items = doc.placements
      .filter((p) => p.layer === "table" && p.tableId === tableId)
      .map((p) => ({ variantId: p.variantId, quantity: p.quantity, position: p.position, rotation: p.rotation, scale: p.scale || 1 }));
    if (!t || items.length === 0) return;
    const res = await saveTableDesign({ id: uid(), name, ...(t.arranged ? { arranged: true } : {}), items });
    if ("error" in res) {
      showHint(res.error);
      return;
    }
    setDesigns(res);
    showHint(`העיצוב ״${name}״ נשמר — אפשר להלביש בו כל שולחן, בכל אירוע`);
  };

  /** A saved design onto one table, in place of what it wears. */
  const wearDesign = (tableId: string, designId: string) => {
    const d = designs.find((x) => x.id === designId);
    if (!d) return;
    act({
      type: "dressTables",
      tableIds: [tableId],
      design: { items: d.items, arranged: d.arranged },
      mode: "replace",
      replaces: d.items.flatMap((it) => shadesOf(it.variantId).map((sh) => sh.id)),
    });
    showHint(`השולחן הולבש ב״${d.name}״ — להחלה על שולחנות נוספים: ״דפוס״`);
  };

  const renderDesigns = (tableId: string) => (
    <TableDesignsPanel
      designs={designs}
      canSave={doc.placements.some((p) => p.layer === "table" && p.tableId === tableId)}
      onSave={(name) => void saveDesign(tableId, name)}
      onApply={(id) => wearDesign(tableId, id)}
      onDelete={(id) => void deleteTableDesign(id).then(setDesigns)}
    />
  );

  /** The "which tables" panel, bound to a source table — and to one item on it, when that is what
   *  is being applied rather than the whole table. */
  const renderPattern = (sourceTableId: string, placementId?: string) => (
    <TablePatternPicker
      tables={doc.tables}
      sourceId={sourceTableId}
      selectedTableIds={selected.filter((r) => r.kind === "table").map((r) => r.id)}
      whole={!placementId}
      item={(() => {
        const p = placementId ? doc.placements.find((x) => x.id === placementId) : undefined;
        return p ? { variantId: p.variantId, shades: shadesOf(p.variantId) } : undefined;
      })()}
      onApply={(groups, mode) =>
        placementId ? applyItemTo(placementId, groups) : applyDressingFrom(sourceTableId, groups.flatMap((g) => g.tableIds), mode)
      }
    />
  );

  // "על כל השולחנות" — the whole room in one cloth, whatever each table's type. `replaces` carries
  // the product's other shades, so tables already dressed in gold are recoloured rather than given
  // a second cloth: a table wears one.
  const spreadCloth = (placementId: string) => {
    const p = doc.placements.find((x) => x.id === placementId);
    if (!p) return;
    act({
      type: "applyToTables",
      tableIds: doc.tables.map((t) => t.id),
      placement: { variantId: p.variantId, layer: "table", quantity: p.quantity, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      replaces: shadesOf(p.variantId).map((s) => s.id),
    });
    showHint(`${resolve(p.variantId)?.product.name ?? "המפה"} הוחלה על כל השולחנות`);
  };

  /** "החל את עיצוב השולחן הזה" — the clipboard's one copied table, worn onto every other table now
   *  selected. `copyDressing` already no-ops on a stale source (a table copied in an event that is
   *  no longer open) by finding no dressing to copy, so there is nothing to re-check here. */
  const copyDressingToSelection = (mode: "add" | "replace") => {
    const clip = heldClip();
    if (clip.tables.length !== 1) return;
    const fromTableId = clip.tables[0].id;
    const toTableIds = docRefs(selected)
      .filter((r) => r.kind === "table" && r.id !== fromTableId)
      .map((r) => r.id);
    if (toTableIds.length === 0) return;
    // The shades of whatever the source table is wearing, so a target already in cream is
    // recoloured to the source's gold rather than handed a second cloth. A table wears one cloth;
    // the quote sums every placement, so the second one would be billed.
    applyDressingFrom(fromTableId, toTableIds, mode);
  };

  // --- swapping for another catalog row ------------------------------------------------------------
  // "Rounds instead of the 180×90s", "the gold candlesticks instead of the silver ones". The thing on
  // the plan stays — its id, place, number, group, dressing — and only which row of the catalog it is
  // changes, so nothing has to be put back where it was. Offered over whatever is selected (one, a
  // block, a rubber-band) and, in the picker, over every one on the plan that is the same row.
  //
  // Only rows this pass's rail offers: the meeting's design pass does not swap the furniture.
  const swapPanel = useMemo((): SwapPanel | null => {
    const refs = docRefs(selected);
    if (refs.length === 0) return null;
    const allowed = new Set(railCategories.map((c) => c.id));
    const live = catalog.filter((p) => !p.archived && allowed.has(p.category));
    const one = <T,>(xs: T[]) => (xs.every((x) => x === xs[0]) ? xs[0] : null);

    // Tables lead: a block of tables with a decoration grouped into it is still a block of tables.
    const tables = doc.tables.filter((t) => refs.some((r) => r.kind === "table" && r.id === t.id));
    if (tables.length > 0) {
      const options = live.filter((p) => p.category === "tables");
      const current = one(tables.map(tableKind));
      if (options.every((p) => p.id === current)) return null;
      return { kind: "tables", count: tables.length, current, similar: current ? doc.tables.filter((t) => tableKind(t) === current).length : 0, options };
    }

    // Design items: every one of them swappable, and all of one class (see swapClass).
    const items = refs.map((r) => doc.placements.find((p) => p.id === r.id));
    const products = items.map((p) => (p && !p.stage ? resolve(p.variantId)?.product : undefined));
    if (products.some((p) => !p || unswappable(p))) return null;
    const cls = one(products.map((p) => swapClass(p!)));
    if (!cls) return null;
    const options = live.filter((p) => !unswappable(p) && swapClass(p) === cls);
    const current = one(products.map((p) => p!.id));
    if (options.every((p) => p.id === current)) return null;
    const similar = current ? doc.placements.filter((p) => !p.stage && resolve(p.variantId)?.product.id === current).length : 0;
    return { kind: "items", count: items.length, current, similar, options };
  }, [selected, doc, catalog, railCategories, docRefs]);

  /** Tables to another row. A block swapped whole is re-closed about its middle (refitBlock), so a run
   *  of tables pushed end to end stays end to end at the new length; anything else keeps its centre. */
  const retypeTables = (ids: string[], product: Product) => {
    const fields = tableFields(product);
    const to = footprintBounds(sizedFootprint(product));
    const tables = doc.tables.filter((t) => ids.includes(t.id));
    const blocks = new Map<string, DesignTable[]>();
    for (const t of tables) if (t.groupId) blocks.set(t.groupId, [...(blocks.get(t.groupId) ?? []), t]);
    const at = new Map<string, DocPoint>();
    for (const [groupId, members] of blocks) {
      // Half a block swapped has no one scale to re-close it by — its tables keep their centres.
      if (doc.tables.filter((t) => t.groupId === groupId).length !== members.length) continue;
      const fit = refitBlock(
        members.map((t) => ({ id: t.id, position: t.position, rotation: t.rotation, from: footprintBounds(tableFootprint(t)), to })),
      );
      fit?.forEach((position, id) => at.set(id, position));
    }
    batch(tables.map((t) => ({ type: "retypeTable" as const, id: t.id, table: fields, ...(at.has(t.id) ? { position: at.get(t.id) } : {}) })));
    showHint(tables.length === 1 ? `השולחן הוחלף ל${product.name}` : `${tables.length} שולחנות הוחלפו ל${product.name}`);
  };

  /** Design items to another row. The shade goes back to the new row's first: the old one's colours
   *  are not the new one's. A size typed for the old row goes too — unless both are stretched to the
   *  plan (a rug for a rug), where the size is the room's and not the product's. */
  const replaceItems = (ids: string[], product: Product) => {
    const variantId = defaultVariantId(product);
    const keepSize = CATEGORY_BY_ID[product.category]?.sizing === "stretch";
    const items = doc.placements.filter((p) => ids.includes(p.id) && !p.stage);
    batch(
      items.flatMap((p): Action[] => [
        { type: "setPlacementVariant", id: p.id, variantId },
        ...(p.sizeMm && !keepSize ? [{ type: "resizePlacement" as const, id: p.id, sizeMm: null }] : []),
      ]),
    );
    showHint(items.length === 1 ? `הוחלף ל${product.name}` : `${items.length} פריטים הוחלפו ל${product.name}`);
  };

  const swapSelection = (productId: string, all: boolean) => {
    const product = productById(productId);
    if (!product || !swapPanel) return;
    const refs = docRefs(selected);
    const everyLike = all && swapPanel.current;
    if (swapPanel.kind === "tables") {
      retypeTables(
        everyLike ? doc.tables.filter((t) => tableKind(t) === swapPanel.current).map((t) => t.id) : refs.filter((r) => r.kind === "table").map((r) => r.id),
        product,
      );
    } else {
      replaceItems(
        everyLike
          ? doc.placements.filter((p) => !p.stage && resolve(p.variantId)?.product.id === swapPanel.current).map((p) => p.id)
          : refs.map((r) => r.id),
        product,
      );
    }
  };

  /** The cloths a table's own cloth can be swapped for — offered in its cloth panel, since a cloth is
   *  the table's surface and is never selected on its own. */
  const clothOptions = useMemo(
    () => catalog.filter((p) => !p.archived && p.category === "tablecloths" && !isRunner(p)).map((p) => ({ value: p.id, label: p.name })),
    [catalog],
  );

  // Keyboard: undo/redo + delete (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A key pressed inside a dialog over the plan (the rail's product form, a confirm) belongs to
      // the dialog, even when focus is on a button there rather than in a field: Backspace with the
      // category picker focused must not delete the table selected behind the form.
      const typing = isTypingTarget() || (e.target instanceof Element && !!e.target.closest("dialog"));
      const mod = e.ctrlKey || e.metaKey;
      // isShortcut, not e.key: on a Hebrew layout Ctrl+C arrives as "ב" and every one of these
      // stops working the moment the designer switches layout to type a client's name.
      // Every one of these stands down while a field has focus. Undo especially: correcting a table
      // number and pressing Ctrl+Z has to take back the digit, not the whole plan — the field owns
      // its own undo stack and the browser is already about to use it.
      if (mod && !typing && isShortcut(e, "z")) {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
      } else if (mod && !typing && isShortcut(e, "y")) {
        e.preventDefault();
        setHistory((h) => redo(h));
      } else if (mod && !typing && (isShortcut(e, "c") || isShortcut(e, "x"))) {
        // Text the designer highlighted somewhere on the page is what Ctrl+C means there, and the
        // browser is already about to do the right thing with it. The plan waits its turn.
        if (hasTextSelection()) return;
        e.preventDefault();
        if (isShortcut(e, "c")) copy();
        else cut();
      } else if (mod && !typing && isShortcut(e, "v")) {
        e.preventDefault();
        paste();
      } else if (mod && !typing && isShortcut(e, "g")) {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
      } else if (mod && !typing && isShortcut(e, "a")) {
        if (hasTextSelection()) return;
        e.preventDefault();
        selectAll();
      } else if (mod && !typing && (e.code === "BracketRight" || e.code === "BracketLeft")) {
        // Physical keys, so they are the same two keys on a Hebrew layout (where ] and [ print ך
        // and ף) — the reason every shortcut here reads e.code first (lib/keyboard.ts).
        e.preventDefault();
        restack(e.code === "BracketRight" ? "front" : "back");
      } else if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        // Stairs, a banquette, a barrier picked out on a stage: Delete takes THAT, not the stage it
        // stands on (the stage stays selected underneath, which is why this is asked first).
        if (activeEdge) {
          removeStair(activeEdge);
          setActiveEdge(null);
        } else deleteSelection();
      } else if (!typing && !mod && !e.defaultPrevented && e.key.startsWith("Arrow") && nudgeDressing(e.key, e.shiftKey)) {
        e.preventDefault();
      } else if (!typing && e.key === "Escape" && !e.defaultPrevented) {
        // (Not when the canvas already spent this Escape putting its tape measure away, or ending
        // the area being drawn — both take it in the capture phase.)
        // One step back at a time: a tool first (the fill tool with its area already drawn), then
        // the edge item, then the selection, then — with nothing left selected — the zone eye and
        // the active layer, which are what keep the empty-selection bar on screen.
        if (stageFill?.phase === "pick") setStageFill(null);
        else if (dressing) setDressing(null);
        else if (activeEdge) setActiveEdge(null);
        else if (selected.length > 0) setSelected([]);
        else {
          setZoneFocus(null);
          setActiveLayer(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelection, copy, cut, paste, groupSelection, ungroupSelection, selectAll, restack, selected.length, activeEdge, removeStair, stageFill?.phase, dressing, nudgeDressing]);

  // --- the right-click menu ------------------------------------------------------------------------
  // The same verbs the bar offers, where the pointer already is. The menu is built the instant the
  // button goes down, before React has re-rendered with whatever the canvas just selected under it
  // — so each row reaches for the LATEST handlers through a ref rather than closing over this
  // render's, which would act on the selection as it was a click ago.
  const latest = useRef({ restack, duplicate, deleteSelection, groupSelection });
  latest.current = { restack, duplicate, deleteSelection, groupSelection };
  const contextItems = useCallback(
    (refs: SelectionRef[]): ContextMenuItem[] => {
      const own = docRefs(refs);
      const stackable = stackRefs(refs).length > 0;
      return [
        ...(stackable
          ? [
              { label: "לחזית", icon: BringToFront, onSelect: () => latest.current.restack("front") },
              { label: "לאחור", icon: SendToBack, onSelect: () => latest.current.restack("back") },
            ]
          : []),
        ...(own.length > 0 ? [{ label: "שכפול", icon: Copy, onSelect: () => latest.current.duplicate() }] : []),
        ...(own.length > 1 ? [{ label: "קיבוץ", icon: Group, onSelect: () => latest.current.groupSelection() }] : []),
        ...(own.length > 0 ? [{ label: "מחיקה", icon: Trash2, onSelect: () => latest.current.deleteSelection() }] : []),
      ];
    },
    [docRefs, stackRefs],
  );

  // What the eye offers: the zones this event occupies, or — for an event still being booked into
  // one — everything on the property, so the picker is never an empty list next to a drawn plan.
  const zoneOptions = useMemo(() => {
    const list = plan.zones.length ? plan.zones : plan.all;
    return list.filter((r) => r.boundary.length >= 3).map((r) => ({ id: r.zone.id, name: r.zone.name }));
  }, [plan]);
  // A zone the event stopped occupying (or a plan that has not landed yet) is not somewhere to be
  // held: fall back to the whole property rather than framing a box that no longer exists.
  const focusZoneId = zoneOptions.some((z) => z.id === zoneFocus) ? zoneFocus : null;

  // Not memoised, on purpose: `heldClip()` is the same module variable `canPaste` below reads
  // straight off at render, and the render that follows a copy (its only writer) already happens
  // because copy() also sets the hint. What the inspector's dressing button needs beyond `canPaste`
  // is whether the one held table actually brought dressing along, and how many of the currently
  // selected tables that dressing would land on.
  const dressClip = heldClip();
  const dressedSourceTableId = dressClip.tables.length === 1 && dressClip.placements.length > 0 ? dressClip.tables[0].id : null;
  const dressCandidateCount = dressedSourceTableId
    ? docRefs(selected).filter((r) => r.kind === "table" && r.id !== dressedSourceTableId).length
    : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Toolbar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => setHistory(undo)}
        onRedo={() => setHistory(redo)}
        canCopy={selected.length > 0}
        onCopy={copy}
        onCut={cut}
        // ponytail: read at render rather than mirrored into state. The clip is a module variable,
        // and its only writer is copy()/cut() — both of which set the hint, so the render that
        // enables the button is already happening.
        canPaste={clipCount(heldClip()) > 0}
        onPaste={paste}
        layerVisible={layerVisible}
        onToggleLayer={(l) => setLayerVisible((v) => ({ ...v, [l]: !v[l] }))}
        activeLayer={activeLayer}
        onActivateLayer={(l) => setActiveLayer((cur) => (cur === l ? null : l))}
        zones={zoneOptions}
        focusZoneId={focusZoneId}
        onFocusZone={setZoneFocus}
        canRenumber={renumbering.length > 0}
        onRenumber={renumberAll}
        numbering={numbering}
        onNumbering={setNumbering}
        renumberCount={renumbering.length}
        sketches={sketches}
        sketchEmpty={doc.tables.length + doc.placements.length === 0}
        onSaveSketch={(name) => void saveSketch(name)}
        onLoadSketch={(id, mode) => void loadSketch(id, mode)}
        onDeleteSketch={(id) => void deleteSketch(id)}
        saveState={saveState}
        onRetrySave={retrySave}
      />
      <div className="flex min-h-0 flex-1">
        <CatalogRail
          products={catalog}
          groups={RAIL[mode].groups}
          hint={RAIL[mode].hint}
          mmPerPx={mmPerPx}
          onAddProduct={() => setAdding(blankProduct(railCategories[0]))}
          addedIds={addedIds}
          armedId={armed?.id ?? null}
          onArm={arm}
        />
        <div className="relative min-w-0 flex-1">
          <CanvasStage
            doc={doc}
            plan={plan}
            selection={selected}
            layerVisible={layerVisible}
            activeLayer={activeLayer}
            spin={spin}
            focusZoneId={focusZoneId}
            onSelect={pick}
            onSelectMany={pickMany}
            onMoveTable={(id, pos) => drag({ type: "moveTable", id, position: pos })}
            onMovePlacement={(id, pos) => drag({ type: "movePlacement", id, position: pos })}
            onMoveFeature={moveFeature}
            onMoveMany={(moves) =>
              drag({
                type: "moveMany",
                // A feature among them arrives absolute like everything else and is converted here —
                // see featureOffset. The other two kinds pass straight through.
                moves: moves.map((m) =>
                  m.kind === "feature"
                    ? { ...m, position: (({ dx, dy }) => ({ x: dx, y: dy }))(featureOffset(m.id, m.position)) }
                    : m,
                ),
              })
            }
            onRotateMany={rotateMany}
            onEndDrag={settleDrag}
            onContextMenu={contextItems}
            onResizePlacement={(id, sizeMm, position) => {
              // A stage's handles stretch its OUTLINE — the decks follow on their own.
              const was = doc.placements.find((p) => p.id === id);
              if (was?.stage) {
                const levels = carryLevels(was.stage.levels, was, { ...was, position });
                drag({ type: "setPlacementStage", id, stage: { ...was.stage, outline: rectOutline(sizeMm.widthMm, sizeMm.depthMm), levels }, position });
                return;
              }
              drag({ type: "resizePlacement", id, sizeMm });
              drag({ type: "movePlacement", id, position });
            }}
            onSpanPlacement={(id, span) => drag({ type: "setPlacementSpan", id, span })}
            onDropProduct={dropProduct}
            onScale={(v) => {
              mmPerPx.current = v;
            }}
            clearance={clearance}
            showClearance={showClearance}
            onToggleClearance={() => setShowClearance((on) => !on)}
            onResizeTable={(id, sizeMm, position) => {
              drag({ type: "resizeTable", id, sizeMm });
              drag({ type: "moveTable", id, position });
            }}
            stageFillActive={stageFill !== null}
            onStageFill={startStageFill}
            drawArea={stageFill?.phase === "draw" || stageTool?.kind === "level"}
            onArea={stageTool?.kind === "level" ? addLevel : openStageFill}
            onCancelArea={() => {
              setStageFill(null);
              setStageTool(null);
            }}
            areaPreview={stageFill?.phase === "pick" ? { polygon: stageFill.polygon, front: stageFill.front, decks: stageLayout?.decks ?? [] } : null}
            onPickFront={(front) => setStageFill((cur) => (cur?.phase === "pick" ? { ...cur, front } : cur))}
            onAreaReshape={(polygon, front) => setStageFill((cur) => (cur?.phase === "pick" ? { ...cur, polygon, front } : cur))}
            areaLengthSnap={stageTool?.kind === "level" ? levelLengthSnap : areaLengthSnap}
            stageRailings={stageRailings}
            activeEdgeItem={activeEdge}
            stageWallDistance={wallDistanceFor}
            placeGhost={placing ? placing.stage.outline : null}
            onPlaceStage={placeTemplate}
            armed={armed}
            onPlaceArmed={placeArmed}
            onDisarm={() => arm(null)}
            onEdgeItemSelect={(stageId, itemId) => {
              setSelected([{ kind: "placement", id: stageId }]);
              setActiveEdge(itemId);
            }}
            onEdgeItemChange={(stageId, item) => {
              const was = doc.placements.find((x) => x.id === stageId);
              if (was?.stage)
                drag({ type: "setPlacementStage", id: stageId, stage: { ...was.stage, stairs: (was.stage.stairs ?? []).map((st) => (st.id === item.id ? item : st)) } });
            }}
            onStageOutline={(id, stage, position) => drag({ type: "setPlacementStage", id, stage, position })}
            onAreaRefused={showHint}
            areaRefDeg={stageTool?.kind === "level" && toolStage ? toolStage.rotation || 0 : undefined}
            stairPick={stairPick}
            onPickStair={pickStair}
            dressingTableId={dressingTable?.id ?? null}
            onFocusTable={dressTable}
            onExitDressing={() => setDressing(null)}
            onArrangeDressing={(tableId, positions) => drag({ type: "arrangeDressing", tableId, positions })}
          />
          {/* The table being dressed: how its items stand, and which tables should look like it. */}
          {dressingTable && (
            <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-center">
              <div className="pointer-events-auto flex min-w-0 justify-center">
                <DressingBar
                  title={dressingTable.number > 0 ? `עיצוב שולחן ${dressingTable.number}` : "עיצוב שולחן הראש"}
                  count={chipsOn(dressingTable.id).length}
                  selectedCount={selected.filter((r) => r.kind === "placement" && chipsOn(dressingTable.id).some((c) => c.id === r.id)).length}
                  arranged={!!dressingTable.arranged}
                  onArrange={arrangeDressed}
                  onAuto={() => arrangeDressed("auto")}
                  picker={renderPattern(dressingTable.id)}
                  designs={renderDesigns(dressingTable.id)}
                  onClose={() => setDressing(null)}
                />
              </div>
            </div>
          )}
          {/* What the area tool is waiting for, where the tape says what IT is waiting for. */}
          {stageFill?.phase === "draw" && (
            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
              <span className="rounded-full border border-border bg-surface/95 px-3 py-1 text-xs font-medium text-ink-soft shadow-floating">
                סמנו את פינות האזור · הקלדת מספר ו־Enter קובעת אורך בס״מ · Alt לקו חופשי · לחיצה כפולה או Enter לסגירה · Esc ליציאה
              </span>
            </div>
          )}
          {stageFill?.phase === "pick" && (
            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
              <span className="rounded-full border border-border bg-surface/95 px-3 py-1 text-xs font-medium text-ink-soft shadow-floating">
                גררו פינה או צד לשינוי הצורה · Shift שומר על זוויות ישרות · לחיצה כפולה על צד מפצלת אותו, על פינה מוחקת אותה · לחיצה על צד קובעת חזית · Alt בלי הצמדה
              </span>
            </div>
          )}
          {stageTool && (
            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
              <span className="rounded-full border border-border bg-surface/95 px-3 py-1 text-xs font-medium text-ink-soft shadow-floating">
                {stageTool.kind === "level"
                  ? "סמנו את פינות המפלס על הבמה · הקלדת מספר ו־Enter קובעת אורך בס״מ · לחיצה כפולה או Enter לסגירה · Esc ליציאה"
                  : `לחצו על צד של הבמה או של מפלס — שם ${stageTool.edgeKind === "bench" ? "יעמוד הבנקט" : stageTool.edgeKind === "barrier" ? "יעמוד המחסום" : "יעמדו המדרגות"} · לחיצה על קטע פתוח ממלאת את כולו · Esc ליציאה`}
              </span>
            </div>
          )}
          {stageFill?.phase === "pick" && (
            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
              <span className="rounded-full border border-border bg-surface/95 px-3 py-1 text-xs font-medium text-ink-soft shadow-floating">
                הקו הרציף הוא חזית הבמה — לחיצה על צלע אחרת מעבירה אותה
              </span>
            </div>
          )}
          {/* The inspector is a BAR along the bottom of the canvas now, centred — the shape the
              venue plan's inspector already has, and the shape that keeps a selection's controls
              from eating a column of the plan. It is centred rather than tucked into a corner
              because its own popovers open upwards and centred on their chip: from a corner, half
              of them would open past the edge of the plane. */}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
            <div className="pointer-events-auto flex min-w-0 justify-center">
              {stageFill?.phase === "draw" && templates.length > 0 ? (
                <Bar icon={Grid2x2Plus} title="במה מתבנית" facts="או סמנו אזור על התוכנית" onClose={() => setStageFill(null)}>
                  {templates.map((t) => (
                    <span key={t.id} className="inline-flex items-center rounded-md border border-border">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setStageFill(null);
                          setPlacing(t);
                        }}
                      >
                        {t.name}
                      </Button>
                      <BarButton icon={X} label={`מחיקת התבנית ״${t.name}״`} onClick={() => void removeTemplate(t.id)} />
                    </span>
                  ))}
                </Bar>
              ) : stageFill?.phase === "pick" ? (
                <StageFillPanel
                  state={stageFill}
                  types={deckTypes}
                  layout={stageLayout}
                  onChange={setStageFill}
                  overlaps={stagePreview?.overlaps ?? false}
                  onRedraw={() => setStageFill((cur) => ({ phase: "draw", chosen: cur?.chosen, editing: cur?.editing }))}
                  onResize={resizeStageArea}
                  onCommit={commitStageFill}
                  onClose={() => setStageFill(null)}
                />
              ) : (
              <Inspector
                selection={sole}
                selectedCount={selected.length}
                feature={featurePanel}
                onResetFeature={resetFeature}
                facing={sharedFacing}
                onFace={faceSelection}
                spin={spin}
                onSpin={setSpin}
                canRestack={stackRefs(selected).length > 0}
                onRestack={restack}
                selectedTables={selected.filter((r) => r.kind === "table").length}
                onSeatsForSelection={setSeatsForSelection}
                group={groupPanel}
                onGroup={groupSelection}
                onUngroup={ungroupSelection}
                onRenumberGroup={(groupId, number) => act({ type: "renumberGroup", groupId, number })}
                onSeats={(id, seats) => act({ type: "setTableSeats", id, seats })}
                onSeated={(id, seated) => act({ type: "setTableSeated", id, seated })}
                onBlockedSides={(id, sides) => act({ type: "setTableBlockedSides", id, sides })}
                // One number for the block, laid back over the tables it is made of — one history
                // entry, because from the designer's side it was one number typed once.
                onGroupSeated={(groupId, seated) =>
                  batch(spreadSeated(doc, groupId, seated).map((x) => ({ type: "setTableSeated" as const, id: x.id, seated: x.seated })))
                }
                onGroupSeats={(groupId, seats) =>
                  batch(spreadSeats(doc, groupId, seats).map((x) => ({ type: "setTableSeats" as const, id: x.id, seats: x.seats })))
                }
                doc={doc}
                structure={plan.structure}
                onClose={() => setSelected([])}
                onQuantity={changeQuantity}
                onDelete={deleteSelection}
                onDressTable={dressTable}
                renderPattern={renderPattern}
                renderDesigns={renderDesigns}
                onScale={(id, scale) => act({ type: "setPlacementScale", id, scale })}
                onApplyToAllTables={spreadCloth}
                onVariant={(id, variantId) => act({ type: "setPlacementVariant", id, variantId })}
                onSpan={(id, span) => act({ type: "setPlacementSpan", id, span })}
                onResize={(id, sizeMm) => act({ type: "resizePlacement", id, sizeMm })}
                onRenumber={(id, number) => act({ type: "renumberTable", id, number })}
                onStyleTable={(id, style) => act({ type: "styleTable", id, style })}
                onDuplicate={duplicate}
                onRemovePlacement={(id) => act({ type: "removePlacement", id })}
                zoneFocused={!!focusZoneId}
                onSelectInZone={selectInZone}
                layerActive={activeLayer !== null}
                onSelectLayer={selectLayer}
                scopeLabel={
                  [
                    focusZoneId && `אזור: ${zoneOptions.find((z) => z.id === focusZoneId)?.name ?? ""}`,
                    activeLayer && `שכבה: ${PLANES.find((pl) => pl.id === activeLayer)?.label ?? ""}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                onClearScope={() => {
                  setZoneFocus(null);
                  setActiveLayer(null);
                }}
                onSelectSimilar={selectSimilar}
                canDistribute={canDistribute}
                onDistribute={distributeEvenly}
                dressCandidateCount={dressCandidateCount}
                onCopyDressing={copyDressingToSelection}
                onMirror={canMirror ? mirrorSelection : undefined}
                breaches={breaches}
                sizePanel={sizePanel}
                onSize={resizeSole}
                spacing={spacing}
                onSpace={spaceSelection}
                stagePanel={stagePanel}
                onEditStage={editStage}
                onExplodeStage={explodeStage}
                onStageHeight={setStageHeightMm}
                onStageSize={setStageSize}
                onLevelHeight={setLevelHeight}
                onRemoveLevel={removeLevel}
                onAddLevel={startLevel}
                onAddEdge={startEdge}
                onFillEdges={fillEdges}
                onSelectEdge={setActiveEdge}
                onRemoveStair={removeStair}
                onStairChange={changeStair}
                onStageSurface={setSurface}
                onStageCorners={setCorners}
                onStageExceed={setExceed}
                onSaveTemplate={(name) => void saveTemplate(name)}
                stageGroup={stageGroup}
                onStickStages={selectedStages.length >= 2 ? stickStages : undefined}
                onMergeStages={selectedStages.length >= 2 ? mergeSelectedStages : undefined}
                onMakeStage={makeStage}
                swap={swapPanel}
                onSwap={swapSelection}
                clothOptions={clothOptions}
                onReplaceCloth={(id, productId) => {
                  const product = productById(productId);
                  if (product) replaceItems([id], product);
                }}
              />
              )}
            </div>
          </div>
          {/* The event is booked into a property this designer was never granted. The canvas stays
              usable — items can still be placed and the meeting can go on — but the blank ground
              under them gets a reason instead of being mistaken for an undrawn hall. */}
          {/* Everyone the plan seats — tables and banquettes. Only once there is someone to seat. */}
          {seating.tables + seating.benches > 0 && (
            <div className={"pointer-events-none absolute inset-inline-start-4 " + (plan.access === "denied" ? "top-20" : "top-4")}>
              <span className="nums rounded-md border border-border bg-surface/95 px-3 py-1 text-xs font-medium text-ink-soft shadow-floating">
                {`${seating.tables + seating.benches} מקומות ישיבה`}
                {seating.benches > 0 ? ` · ${seating.benches} על בנקטים` : ""}
              </span>
            </div>
          )}
          {/* What the next click will do, said where the eye is. It is the one part of this state
              with a button in it, so it takes the pointer — the ✕ is the way out for a designer
              who has never heard of Escape, and the one a tablet has. */}
          {armed && !placing && (
            <div className={"pointer-events-none absolute inset-x-0 flex justify-center " + (dressingTable ? "top-28" : "top-4")}>
              <div
                role="status"
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-accent-line bg-surface/95 py-1 ps-3 pe-1 text-xs text-ink-soft shadow-floating"
              >
                <span>
                  {"מניחים: "}
                  <span className="font-semibold text-accent">{armed.name}</span>
                </span>
                <span className="text-muted">·</span>
                <span>
                  {placesOnce(CATEGORY_BY_ID[armed.category])
                    ? "לחיצה על התוכנית מניחה אחד (Shift — עוד)"
                    : armed.layer === "table"
                      ? "לחיצה על שולחן מניחה עליו"
                      : "כל לחיצה על התוכנית מניחה עוד אחד"}
                </span>
                {armedCount > 0 && (
                  <>
                    <span className="text-muted">·</span>
                    <span className="nums">{`הונחו ${armedCount}`}</span>
                  </>
                )}
                <span className="text-muted">·</span>
                <span>Esc לסיום</span>
                <button
                  type="button"
                  onClick={() => arm(null)}
                  aria-label="סיום ההנחה"
                  title="סיום ההנחה"
                  className="rounded-full p-1 text-muted transition-colors hover:bg-accent-tint hover:text-accent"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            </div>
          )}
          {placing && (
            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
              <span className="rounded-full border border-border bg-surface/95 px-3 py-1 text-xs font-medium text-ink-soft shadow-floating">
                {`לחיצה על התוכנית מציבה את ״${placing.name}״ · Esc לביטול`}
              </span>
            </div>
          )}
          {plan.access === "denied" && (
            <div className="pointer-events-none absolute inset-inline-start-4 top-4">
              <div className="pointer-events-auto">
                <VenueAccessNotice />
              </div>
            </div>
          )}
          {/* Stable live region so the drop hint / smart-apply confirmation is announced, not just shown. */}
          {/* Above the inspector bar, not under it: both are centred along the bottom edge. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center"
            aria-live="polite"
          >
            {hint && (
              <span className="rounded-md bg-ink px-3 py-1.5 text-sm text-canvas shadow-dialog">{hint}</span>
            )}
          </div>
        </div>
      </div>
      <ProductDrawer
        product={adding}
        internal={mode === "full"}
        categories={railCategories}
        onSave={(p) => void addProduct(p)}
        // Only ever a NEW product here, so the drawer never shows its delete.
        onDelete={() => {}}
        onClose={() => setAdding(null)}
      />
    </div>
  );

  async function addProduct(p: Product) {
    if (await saveProduct(p)) {
      setAddedIds((ids) => [p.id, ...ids]);
      // Armed straight away: the reason it was made, mid-meeting, is to put it on the plan.
      arm(p.id);
      showHint(`${p.name} נוסף לקטלוג — לחצו על התוכנית כדי להניח`);
    } else {
      showHint("ההוספה לקטלוג נכשלה — נסו שוב");
    }
  }
}
