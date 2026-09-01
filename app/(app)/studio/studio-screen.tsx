"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { amend, dispatch, undo, redo, initHistory, type Action, type History } from "@/lib/design-document/actions";
import type { DesignDocumentContent, Layer as LayerId } from "@/lib/design-document/types";
import { emptyDocument } from "@/lib/design-document/types";
import { EMPTY_PLAN, eventPlan, type EventPlan } from "@/lib/events/plan";
import { useEventWorkspace } from "@/lib/events/use-workspace";
import { saveDocument } from "@/lib/studio/actions";
import { loadScratch, saveScratch } from "@/lib/studio/storage";
import { tableAt } from "@/lib/studio/geometry";
import type { Point } from "@/lib/studio/hall";
import { pointInPolygon } from "@/lib/venues/faces";
import { coverOn, defaultVariantId, resolve, shadesOf } from "@/lib/studio/catalog-resolver";
import { productById } from "@/lib/catalog/storage";
import type { Product } from "@/lib/catalog/types";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { CATEGORY_BY_ID, DESIGN_PASS_GROUPS, HALL_PASS_GROUPS, type CategoryGroupId } from "@/lib/catalog/categories";
import { nearestWall, WHOLE_WALL, hangNear, resolveHang } from "@/lib/studio/anchor";
import {
  DEFAULT_NUMBERING,
  expandToGroups,
  groupSeated,
  groupSeats,
  membersOf,
  orderedNumbering,
  soleGroupId,
  spreadSeated,
  type NumberingOptions,
} from "@/lib/design-document/groups";
import { arrangedFeature, isFeatureMoved } from "@/lib/design-document/features";
import { floorStack, isStackable, restackTo, type StackKind } from "@/lib/design-document/stacking";
import { clipCount, copySelection, heldClip, holdClip, nextPasteStep, pasteInto } from "@/lib/studio/clipboard";
import { hasTextSelection, isShortcut, isTypingTarget } from "@/lib/keyboard";
import { Toolbar } from "./toolbar";
import { CatalogRail } from "./catalog-rail";
import { Inspector } from "./inspector";
// A plain import now that the canvas is the app's shared SVG one: it renders on the server like any
// other component, so there is nothing left to defer and no "loading the studio" flash to cover.
import { CanvasStage, type SelectionKind, type SelectionRef } from "./canvas-stage";
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
  hall: { groups: HALL_PASS_GROUPS, hint: "גרור שולחן, כיסא, במה או בר אל התוכנית. העיצוב עצמו — בשלב הבא." },
  design: { groups: DESIGN_PASS_GROUPS, hint: "גרור פריט עיצוב. פריטי שולחן — על שולחן; רצפה ותקרה — לכל נקודה." },
};

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
  const { products: catalog } = useCatalog(initialProducts);
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
  const [layerVisible, setLayerVisible] = useState<Record<LayerId, boolean>>({ table: true, floor: true, ceiling: true });
  // WHICH layer is being worked in, as opposed to which are merely visible. null — the default, and
  // exactly how this screen behaved before — means every visible layer is live. Naming one dims the
  // others and takes them out of the pointer's reach, which is the whole of what "lock" would have
  // been: dressing tables without dragging a rug by accident is one click, and there is no second
  // flag to keep honest.
  const [activeLayer, setActiveLayer] = useState<LayerId | null>(null);
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
  const dropProduct = (productId: string, x: number, y: number) => {
    const product = productById(productId);
    if (!product) return;
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
      const d = product.dimensions;
      const seats = Number(product.categoryFields?.seats);
      act({
        type: "addTable",
        table: {
          id,
          type: product.name,
          number: nextNumber(),
          position: { x, y },
          rotation: 0,
          ...(d.diameterMm ? { diameterMm: d.diameterMm } : { widthMm: d.widthMm ?? 0, depthMm: d.depthMm ?? 0 }),
          ...(seats > 0 ? { seats } : {}),
          variantId,
        },
      });
      setSelected([{ kind: "table", id }]);
      return;
    }

    if (cat?.anchor === "wall") {
      const near = nearestWall(plan.structure, { x, y });
      if (!near) {
        showHint("אין קיר לתלות עליו — שרטטו את המתחם ב״אולמות״");
        return;
      }
      // Across the whole wall, which is the normal case and the one worth defaulting to; the two
      // end handles shorten it from there.
      act({
        type: "addPlacement",
        placement: { ...base, position: { x, y }, span: { wallId: near.wallId, ...WHOLE_WALL } },
      });
    } else if (product.layer === "ceiling") {
      // Near a rod, it hangs on it and will travel with it if the hall is ever re-surveyed. Far
      // from one — or in a venue nobody has measured the ceiling of — it is a free point, exactly
      // as every ceiling item was before rods existed.
      const hang = hangNear(plan.structure, { x, y });
      act({ type: "addPlacement", placement: { ...base, position: { x, y }, ...(hang ? { hang } : {}) } });
    } else if (product.layer === "table") {
      const t = tableAt(doc, x, y);
      if (!t) {
        showHint("שחרר פריט שולחן על גבי שולחן");
        return;
      }
      // A table wears ONE cloth: dropping a second onto a dressed table recolours the one that is
      // already there rather than stacking. Not a remove+add — that would record the removal as a
      // deliberate divergence and make the next "on all tables" skip this table (F-5.3).
      const worn = cat?.anchor === "table" ? coverOn(doc, t.id) : undefined;
      if (worn) {
        act({ type: "setPlacementVariant", id: worn.id, variantId });
        setSelected([{ kind: "table", id: t.id }]);
        return;
      }
      act({ type: "addPlacement", placement: { ...base, tableId: t.id, position: { x: 0, y: 0 } } });
    } else {
      act({ type: "addPlacement", placement: { ...base, position: { x, y } } });
    }
    setSelected([{ kind: "placement", id }]);
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
  // the "table" layer's visibility (see the `cloth` prop on TableNode in canvas-stage.tsx, which
  // reads it off `coverByTable` rather than the gated chip list) — so it stays selectable exactly
  // when it stays visible. Tables and venue features have no layer toggle of their own; only
  // `activeLayer` dims them, which `movable` already excludes on the canvas side.
  const layerHidden = useCallback(
    (r: SelectionRef) => {
      if (r.kind !== "placement") return false;
      const p = doc.placements.find((x) => x.id === r.id);
      if (!p) return false;
      if (resolve(p.variantId)?.anchor === "table") return false;
      return !layerVisible[p.layer];
    },
    [doc, layerVisible],
  );

  const pickMany = useCallback(
    (refs: SelectionRef[], additive: boolean) => {
      const whole: SelectionRef[] = [...featureRefs(refs), ...expandToGroups(doc, docRefs(refs))].filter(
        (r) => !layerHidden(r),
      );
      setSelected((cur) => {
        if (!additive) return whole;
        const merged = [...cur];
        for (const r of whole) if (!merged.some((m) => m.kind === r.kind && m.id === r.id)) merged.push(r);
        return merged;
      });
    },
    [doc, docRefs, featureRefs, layerHidden],
  );

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
          .filter(
            (p) =>
              !p.tableId &&
              !p.span &&
              // A hung item draws where its ROD puts it, not at the `position` a drag keeps
              // overwriting underneath it all gesture long — same resolveHang the canvas itself
              // draws from (canvas-stage.tsx), off the property's own rigs, never the arranged
              // copy. A dangling rigId (its rod was deleted at the venue) falls back to the stored
              // point, same as the canvas does.
              inside(p.hang ? (resolveHang(plan.structure, p.hang) ?? p.position) : p.position),
          )
          .map((p) => ({ kind: "placement" as const, id: p.id })),
      ],
      false,
    );
  }, [plan.zones, plan.structure, zoneFocus, doc, pickMany]);

  const selectLayer = useCallback(() => {
    if (!activeLayer) return;
    const refs = doc.placements.filter((p) => p.layer === activeLayer).map((p) => ({ kind: "placement" as const, id: p.id }));
    // Tables are floor-plane, so "select the floor layer" means them too.
    pickMany(activeLayer === "floor" ? [...doc.tables.map((t) => ({ kind: "table" as const, id: t.id })), ...refs] : refs, false);
  }, [activeLayer, doc, pickMany]);

  // A table's or a free placement's centre is `.position`, exactly like the box canvas-stage.tsx
  // builds for its own marquee/align pass (`movable`, see the comment there) — but narrower on
  // purpose. That list also carries HUNG ceiling items, resolved through the rod, because a group
  // drag there is allowed to detach one from its rig. Distribute makes the opposite call: a hung
  // item's `position` is a stale point the rod overrides at render (resolveHang), so writing a new
  // one here would either do nothing or silently detach it off-screen — neither reads as "distribute".
  // So it (and a cloth worn on a table, and a drape's wall span) resolves to null here and the
  // selection is treated as not distributable at all, same as canDistribute below. Reusing the
  // canvas's own list would need lifting it out of CanvasStage, which is not one of this task's two
  // files and would also have to be re-filtered for this narrower rule anyway — cheaper to read the
  // doc directly, which this screen already holds.
  const movableBox = useCallback(
    (ref: { kind: "table" | "placement"; id: string }): Point | null => {
      if (ref.kind === "table") return doc.tables.find((t) => t.id === ref.id)?.position ?? null;
      const p = doc.placements.find((x) => x.id === ref.id);
      if (!p || p.tableId || p.span || p.hang) return null;
      return p.position;
    },
    [doc.tables, doc.placements],
  );

  // Equal air between things, along whichever axis the selection is more spread out on. The two end
  // items DO NOT MOVE: they are what the designer has already placed, and a distribute that slid
  // them would be re-deciding the extent instead of dividing it. Rides on the existing moveMany, so
  // it is one history entry and nothing new in the reducer.
  const distributeEvenly = useCallback(() => {
    const refs = docRefs(selected);
    if (refs.length < 3) return;
    const boxes = refs.map((r) => ({ ref: r, box: movableBox(r) })).filter((e) => e.box);
    if (boxes.length < 3) return;
    const spanX = Math.max(...boxes.map((e) => e.box!.x)) - Math.min(...boxes.map((e) => e.box!.x));
    const spanY = Math.max(...boxes.map((e) => e.box!.y)) - Math.min(...boxes.map((e) => e.box!.y));
    const axis: "x" | "y" = spanX >= spanY ? "x" : "y";
    const sorted = [...boxes].sort((a, b) => a.box![axis] - b.box![axis]);
    const first = sorted[0].box![axis];
    const step = (sorted[sorted.length - 1].box![axis] - first) / (sorted.length - 1);
    act({
      type: "moveMany",
      moves: sorted.map((e, i) => ({
        kind: e.ref.kind,
        id: e.ref.id,
        // Whole millimetres, like every other write on this surface — a fractional step would put
        // a table at x=1833.333 and print a dimension nobody can measure to.
        position:
          axis === "x"
            ? { x: Math.round(first + step * i), y: e.box!.y }
            : { x: e.box!.x, y: Math.round(first + step * i) },
      })),
    });
  }, [selected, docRefs, movableBox, act]);

  // "Not offered" (hidden), not merely disabled, when the selection holds a cloth, a drape or a hung
  // ceiling item — same idiom as onSelectSimilar being left out of SelectionCommands rather than
  // greyed out, and the same gate distributeEvenly itself checks before writing anything.
  const canDistribute = useMemo(() => {
    const refs = docRefs(selected);
    return refs.length >= 3 && refs.every((r) => movableBox(r) !== null);
  }, [selected, docRefs, movableBox]);

  const sole = selected.length === 1 ? selected[0] : null;


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

  const paste = useCallback(() => {
    const clip = heldClip();
    if (clipCount(clip) === 0) return;
    // A screen-relative step, so a paste lands a thumb's width away whether the whole hall is on
    // screen or one table fills it — and each repeat steps one further out, fanning a run of pastes
    // instead of stacking them.
    const step = nextPasteStep() * PASTE_STEP_PX * mmPerPx.current;
    const fresh = pasteInto(clip, { dx: step, dy: step, firstNumber: nextNumber(), newId: uid });
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
    const n = clipCount(fresh);
    showHint(n === 1 ? "הודבק פריט" : `הודבקו ${n} פריטים`);
  }, [batch, nextNumber]);

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
  const stack = useMemo(
    () =>
      floorStack(doc, (p): StackKind | undefined => {
        const r = resolve(p.variantId);
        if (r?.anchor === "wall") return undefined;
        if (p.layer === "table" && p.tableId) return undefined;
        return r?.sizing === "stretch" ? "carpet" : "item";
      }),
    [doc],
  );

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


  const smartApply = () => {
    if (sole?.kind !== "placement") return;
    const p = doc.placements.find((x) => x.id === sole.id);
    const table = p?.tableId ? doc.tables.find((t) => t.id === p.tableId) : undefined;
    if (!p || !table) return;
    act({
      type: "applyToTables",
      tableIds: doc.tables.filter((t) => t.type === table.type).map((t) => t.id),
      placement: { variantId: p.variantId, layer: "table", quantity: p.quantity, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    });
    showHint(`הוחל על כל שולחנות ${table.type}`);
  };

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
    const replaces = doc.placements
      .filter((p) => p.layer === "table" && p.tableId === fromTableId)
      .flatMap((p) => shadesOf(p.variantId).map((sh) => sh.id));
    act({ type: "copyDressing", fromTableId, toTableIds, mode, replaces });
    showHint(mode === "replace" ? `${toTableIds.length} שולחנות עוצבו מחדש` : `העיצוב הוחל על ${toTableIds.length} שולחנות`);
  };

  // Keyboard: undo/redo + delete (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget();
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
      } else if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        deleteSelection();
      } else if (!typing && e.key === "Escape") {
        setSelected([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelection, copy, cut, paste, groupSelection, ungroupSelection]);

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
        saveState={saveState}
        onRetrySave={retrySave}
      />
      <div className="flex min-h-0 flex-1">
        <CatalogRail products={catalog} groups={RAIL[mode].groups} hint={RAIL[mode].hint} mmPerPx={mmPerPx} />
        <div className="relative min-w-0 flex-1">
          <CanvasStage
            doc={doc}
            plan={plan}
            selection={selected}
            layerVisible={layerVisible}
            activeLayer={activeLayer}
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
            onEndDrag={endDrag}
            onResizePlacement={(id, sizeMm, position) => {
              drag({ type: "resizePlacement", id, sizeMm });
              drag({ type: "movePlacement", id, position });
            }}
            onSpanPlacement={(id, span) => drag({ type: "setPlacementSpan", id, span })}
            // The end of a ceiling item's drag: re-run the same near/far rule the drop used, so
            // dragging it onto a rod hangs it and dragging it away frees it. Folded into the drag's
            // own open gesture (drag(), not act()) so one undo takes the move and the hang change
            // back together.
            onHangPlacement={(id, hang) => drag({ type: "setPlacementHang", id, hang })}
            onDropProduct={dropProduct}
            onScale={(v) => {
              mmPerPx.current = v;
            }}
          />
          <div className="pointer-events-none absolute inset-inline-end-4 bottom-4">
            <div className="pointer-events-auto">
              <Inspector
                selection={sole}
                selectedCount={selected.length}
                feature={featurePanel}
                onResetFeature={resetFeature}
                facing={sharedFacing}
                onFace={faceSelection}
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
                // One number for the block, laid back over the tables it is made of — one history
                // entry, because from the designer's side it was one number typed once.
                onGroupSeated={(groupId, seated) =>
                  batch(spreadSeated(doc, groupId, seated).map((x) => ({ type: "setTableSeated" as const, id: x.id, seated: x.seated })))
                }
                doc={doc}
                structure={plan.structure}
                onClose={() => setSelected([])}
                onQuantity={changeQuantity}
                onDelete={deleteSelection}
                onSmartApply={smartApply}
                onApplyToAllTables={spreadCloth}
                onVariant={(id, variantId) => act({ type: "setPlacementVariant", id, variantId })}
                onSpan={(id, span) => act({ type: "setPlacementSpan", id, span })}
                onHang={(id, hang) => act({ type: "setPlacementHang", id, hang })}
                onResize={(id, sizeMm) => act({ type: "resizePlacement", id, sizeMm })}
                onRenumber={(id, number) => act({ type: "renumberTable", id, number })}
                onStyleTable={(id, style) => act({ type: "styleTable", id, style })}
                onDuplicate={duplicate}
                onRemovePlacement={(id) => act({ type: "removePlacement", id })}
                zoneFocused={!!focusZoneId}
                onSelectInZone={selectInZone}
                layerActive={activeLayer !== null}
                onSelectLayer={selectLayer}
                onSelectSimilar={selectSimilar}
                canDistribute={canDistribute}
                onDistribute={distributeEvenly}
                dressCandidateCount={dressCandidateCount}
                onCopyDressing={copyDressingToSelection}
              />
            </div>
          </div>
          {/* The event is booked into a property this designer was never granted. The canvas stays
              usable — items can still be placed and the meeting can go on — but the blank ground
              under them gets a reason instead of being mistaken for an undrawn hall. */}
          {plan.access === "denied" && (
            <div className="pointer-events-none absolute inset-inline-start-4 top-4">
              <div className="pointer-events-auto">
                <VenueAccessNotice />
              </div>
            </div>
          )}
          {/* Stable live region so the drop hint / smart-apply confirmation is announced, not just shown. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center"
            aria-live="polite"
          >
            {hint && (
              <span className="rounded-md bg-ink px-3 py-1.5 text-sm text-canvas shadow-dialog">{hint}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
