"use client";
// The composition editor — a composite catalog item (lib/catalog/composition.ts) put together on the
// studio's own canvas: its parts picked off the studio's catalog rail and set out by hand, the way
// they will stand once placed on a sketch. The shape editor's sibling (appearance-modal.tsx): a native
// <dialog> over the drawer, and ✕ / ביטול / save the only ways out — Escape steps back one level.
//
// THE CANVAS IS THE STUDIO'S (CanvasStage over PlanCanvas), hosted by a host a fraction of the
// studio's — the client sketch's pattern (app/client/events/[id]/client-sketch.tsx). A composition IS
// a fragment of a drawing (tables, placements, groups), so it is edited as one: a document with no
// venue under it, the reducer's own actions, the reducer's own undo. What lands where is the studio's
// rule (studio-screen dropProduct), its common cases: a table is a table, a cloth goes on the table
// under it (every half of a block), a table item onto the table under it — where it was let go once
// that table is arranged or being dressed — a ceiling item hung over what is under it and linked to
// a table, another composite as its parts, anything else where it was let go. A drape (it needs a
// wall) and a table design (it is worn by a table on the plan) are not parts.
//
// Saved, the whole drawing is the item (fromSelection), centred on the box its pieces stand in — and
// the list it may have been laid out from is let go: the arrangement is the item now.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Copy, Group, Package, PaintRoller, Redo2, Table2, Trash2, Undo2, Ungroup } from "lucide-react";
import type { Composition, Product } from "@/lib/catalog/types";
import type { DesignDocumentContent, DesignTable, Placement, Point } from "@/lib/design-document/types";
import { amend, apply as applyAction, dispatch, initHistory, redo, undo, type Action, type History, type RetypedTable } from "@/lib/design-document/actions";
import { expandToGroups, nextTableNumber, soleGroupId, type GroupRef } from "@/lib/design-document/groups";
import { clampToTable, toTableFrame } from "@/lib/design-document/dressing";
import { NEW_BLOCK, chairRowsCount, cleanRows } from "@/lib/design-document/chair-rows";
import { canBePart, clipOf, fromSelection, isTableSet } from "@/lib/catalog/composition";
import { CATEGORY_BY_ID, anchorOf, placesOnce } from "@/lib/catalog/categories";
import { loadProducts, productById } from "@/lib/catalog/storage";
import { coverOn, defaultVariantId, resolve } from "@/lib/studio/catalog-resolver";
import { clipCount, copySelection, pasteInto, type Clip } from "@/lib/studio/clipboard";
import { carriedRowsOf, rowsTool, rowsToolId } from "@/lib/studio/drag-payload";
import { catalogBox } from "@/lib/studio/footprint";
import { centreOver } from "@/lib/studio/hang";
import { ALL_PLANES_VISIBLE } from "@/lib/studio/planes";
import { isShortcut, isTypingTarget } from "@/lib/keyboard";
import { EMPTY_PLAN, type EventPlan } from "@/lib/events/plan";
import { dressBlockOf, dressingSpots, tableBlock, tableBox, tableUnder } from "@/components/footprint-shape";
import { compositionBox } from "@/components/composition-drawing";
import type { ContextMenuItem, MarqueeMode } from "@/components/plan-canvas";
import { Bar, BarButton, PanelRow, Rotation, ltr } from "@/components/inspector-bar";
import { Popover } from "@/components/popover";
import { NumberField } from "@/components/number-field";
import { Button } from "@/components/button";
import { CloseButton } from "@/components/close-button";
import { formatPrice } from "@/lib/catalog/format";
import { CanvasStage, type SelectionRef } from "../studio/canvas-stage";
import { CatalogRail } from "../studio/catalog-rail";
import { hangPointOf, hangTargetsOf, positionHungAt, tableUnderHang } from "../studio/hang-targets";
import { itemGeometry } from "../studio/plan-geometry";
import { tableFrame } from "../studio/dressing-units";
import { compositeLine, compositeTotal } from "./composite-summary";

const uid = () => crypto.randomUUID();
const NOOP = () => {};
const NO_CLEARANCE = { subjects: [], issues: [] };
const NO_VENUE = EMPTY_PLAN.structure;
const isWall = (variantId: string) => resolve(variantId)?.anchor === "wall";
const sameRef = (a: SelectionRef, b: SelectionRef) => a.kind === b.kind && a.id === b.id;
/** One arrow press, in mm — Shift for a bigger step. */
const NUDGE_MM = 10;
const NUDGE_BIG_MM = 50;
/** Where a duplicate lands from its original. */
const DUPLICATE_STEP_MM = 500;

/** What a table takes from its catalog row — the studio's own rule (studio-screen tableFields). */
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

const docOf = (c: Composition): DesignDocumentContent => ({ calibration: { mmPerUnit: 1 }, tables: c.tables, placements: c.placements, groups: c.groups });

/** What stands on a table and is laid out on it — every table item but its cloth. */
const chipsOf = (doc: DesignDocumentContent, tableId: string) =>
  doc.placements.filter((p) => p.layer === "table" && p.tableId === tableId && resolve(p.variantId)?.anchor !== "table");

/** The actions that put a re-id'd fragment on the plan — the studio's clipActions. */
const clipActions = (fresh: Clip): Action[] => [
  ...fresh.tables.map((table) => ({ type: "addTable" as const, table })),
  ...fresh.placements.map((placement) => ({ type: "addPlacement" as const, placement })),
  ...fresh.groups.map((g) => ({
    type: "group" as const,
    groupId: g.id,
    refs: [
      ...fresh.tables.filter((t) => t.groupId === g.id).map((t) => ({ kind: "table" as const, id: t.id })),
      ...fresh.placements.filter((x) => x.groupId === g.id).map((x) => ({ kind: "placement" as const, id: x.id })),
    ],
    ...(g.number === undefined ? {} : { number: g.number }),
  })),
];
/** What of a pasted fragment is selected after it lands: what stands on its own. */
const landedRefs = (fresh: Clip): SelectionRef[] => [
  ...fresh.tables.map((t) => ({ kind: "table" as const, id: t.id })),
  ...fresh.placements.filter((x) => !x.tableId).map((x) => ({ kind: "placement" as const, id: x.id })),
];

export interface CompositionEditorProps {
  /** The drawer's draft composition, read once — this component is mounted by the act of opening it. */
  composition: Composition;
  /** The composite being edited, if it is saved — kept off the rail (an item is not a part of itself). */
  selfId?: string;
  /** False in front of a client (the meeting): the parts' total is not shown. */
  internal?: boolean;
  onSave: (result: { composition: Composition; widthMm: number; depthMm: number }) => void;
  onClose: () => void;
}

export function CompositionEditor({ composition, selfId, internal = true, onSave, onClose }: CompositionEditorProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // The rows a part may be: every ordinary row that stands somewhere, and the other composites (they
  // land as their parts). Read once: the catalog does not change under an open modal.
  const products = useMemo(
    () => loadProducts().filter((p) => p.id !== selfId && (canBePart(p) || (!!p.composition && !isTableSet(p.composition) && !p.archived))),
    [selfId],
  );

  const [history, setHistory] = useState<History>(() => initHistory(docOf(composition)));
  const doc = history.present;
  const [selected, setSelected] = useState<SelectionRef[]>([]);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dressing, setDressing] = useState<string | null>(null);
  const mmPerPx = useRef(20);

  // A transient line over the canvas — why a drop was refused, and the like. The studio's own.
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number | null>(null);
  const say = useCallback((msg: string) => {
    setHint(msg);
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 2800);
  }, []);
  useEffect(() => () => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
  }, []);

  // What the canvas frames: the pieces with room round them for their chairs, never smaller than a
  // corner of a hall — framed once, at open (CanvasStage re-frames when the box changes, and the
  // designer's own panning is not to be yanked back on every edit).
  const [plan] = useState<EventPlan>(() => {
    const empty = composition.tables.length + composition.placements.length === 0;
    const b = empty ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : compositionBox(composition);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const hw = Math.max((b.maxX - b.minX) / 2 + 1500, 3000);
    const hh = Math.max((b.maxY - b.minY) / 2 + 1500, 2000);
    return { ...EMPTY_PLAN, bounds: { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh, widthMm: hw * 2, heightMm: hh * 2 } };
  });

  // ── history ─────────────────────────────────────────────────────────────────────────────────
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
  /** Several actions that are ONE thing done — every action run, one entry pushed if anything changed. */
  const batch = useCallback((actions: Action[]) => {
    if (actions.length === 0) return;
    gestureOpen.current = false;
    setHistory((h) => {
      const next = actions.reduce((d, a) => applyAction(d, a), h.present);
      return next === h.present ? h : { present: next, past: [...h.past, h.present], future: [] };
    });
  }, []);
  /** The end of a drag. A ceiling item let go is linked to the table now under its hang point, or
   *  freed over bare floor — in the same entry as the move; one carried WITH its table, or let go a
   *  little past its own table's rim, stays that table's (the studio's settleDrag). */
  const endDrag = useCallback((moved?: SelectionRef[]) => {
    const was = gestureOpen.current;
    gestureOpen.current = false;
    if (!was || !moved?.length) return;
    setHistory((h) => {
      const d = h.present;
      const hung = moved
        .filter((r) => r.kind === "placement")
        .map((r) => d.placements.find((p) => p.id === r.id))
        .filter((p): p is Placement => !!p && p.layer === "ceiling");
      if (!hung.length) return h;
      const targets = hangTargetsOf(d, NO_VENUE);
      const movedTables = new Set(moved.filter((r) => r.kind === "table").map((r) => r.id));
      const nearOwn = (p: Placement): boolean => {
        const t = p.over ? d.tables.find((x) => x.id === p.over) : undefined;
        if (!t) return false;
        const blk = t.groupId ? tableBlock(d.tables.filter((x) => x.groupId === t.groupId)) : null;
        const f = blk ? { position: blk.centre, rotation: blk.rotation, mirrored: undefined, widthMm: blk.widthMm, depthMm: blk.depthMm } : tableFrame(t);
        const local = toTableFrame({ position: f.position, rotation: f.rotation ?? 0, mirrored: f.mirrored }, hangPointOf(p));
        return Math.abs(local.x) <= f.widthMm / 2 + 400 && Math.abs(local.y) <= f.depthMm / 2 + 400;
      };
      let next = h;
      for (const p of hung) {
        if (p.over && movedTables.has(p.over)) continue;
        const over = tableUnderHang(d, targets, hangPointOf(p));
        if (p.over && over === null && nearOwn(p)) continue;
        if ((p.over ?? null) !== over) next = amend(next, { type: "setPlacementOver", id: p.id, over });
      }
      return next;
    });
  }, []);

  // ── selection ───────────────────────────────────────────────────────────────────────────────
  // Every path expands to whole groups, as the studio's does: a block is one thing to drag and delete.
  const whole = useCallback(
    (refs: SelectionRef[]): SelectionRef[] =>
      expandToGroups(
        doc,
        refs.filter((r): r is GroupRef & SelectionRef => r.kind !== "feature"),
      ) as SelectionRef[],
    [doc],
  );
  const pick = useCallback(
    (ref: SelectionRef | null, additive: boolean) => {
      if (!ref) return setSelected([]);
      const refs = whole([ref]);
      if (!refs.length) return;
      setSelected((cur) => {
        if (!additive) return refs;
        const has = refs.every((r) => cur.some((c) => sameRef(c, r)));
        return has ? cur.filter((c) => !refs.some((r) => sameRef(c, r))) : [...cur, ...refs.filter((r) => !cur.some((c) => sameRef(c, r)))];
      });
    },
    [whole],
  );
  const pickMany = useCallback(
    (refs: SelectionRef[], additive: boolean, mode?: MarqueeMode) => {
      const got = whole(refs);
      const how = mode ?? (additive ? "add" : "replace");
      setSelected((cur) => {
        if (how === "replace") return got;
        if (how === "add") return [...cur, ...got.filter((r) => !cur.some((c) => sameRef(c, r)))];
        return [...cur.filter((c) => !got.some((r) => sameRef(c, r))), ...got.filter((r) => !cur.some((c) => sameRef(c, r)))];
      });
    },
    [whole],
  );
  // What an undo or a removal took off the plan leaves the selection too (set while rendering).
  const gone = selected.some((r) => (r.kind === "table" ? !doc.tables.some((t) => t.id === r.id) : !doc.placements.some((p) => p.id === r.id)));
  if (gone) setSelected(selected.filter((r) => (r.kind === "table" ? doc.tables.some((t) => t.id === r.id) : doc.placements.some((p) => p.id === r.id))));
  if (dressing && !doc.tables.some((t) => t.id === dressing)) setDressing(null);

  /** The tables in front of the scrim: the one being dressed, or its whole block. */
  const dressingIds = useMemo(() => {
    const t = dressing ? doc.tables.find((x) => x.id === dressing) : undefined;
    if (!t) return new Set<string>();
    return new Set(t.groupId ? doc.tables.filter((x) => x.groupId === t.groupId).map((x) => x.id) : [t.id]);
  }, [doc.tables, dressing]);
  const dressTable = useCallback(
    (tableId: string) => {
      setDressing(tableId);
      setArmedId(null);
      setSelected(whole([{ kind: "table", id: tableId }]));
    },
    [whole],
  );

  // ── putting a part down ─────────────────────────────────────────────────────────────────────
  /** Put one of `productId` down at (x, y). True when something landed. */
  const drop = (productId: string, x: number, y: number): boolean => {
    const tool = rowsTool(productId);
    const product = productById(tool.productId);
    if (!product) return false;
    const at = { x: Math.round(x), y: Math.round(y) };

    if (product.composition) {
      if (isTableSet(product.composition)) {
        say(`״${product.name}״ הוא עיצוב שולחן — לובשים אותו על שולחן בסקיצה`);
        return false;
      }
      if (dressingIds.size) {
        say("בעיצוב שולחן — Esc ליציאה כדי להניח על הרצפה");
        return false;
      }
      const fresh = pasteInto(clipOf(product.composition), { dx: at.x, dy: at.y, firstNumber: nextTableNumber(doc), newId: uid });
      if (clipCount(fresh) === 0) {
        say(`ב${product.name} אין רכיבים להניח`);
        return false;
      }
      batch(clipActions(fresh));
      setSelected(landedRefs(fresh));
      return true;
    }
    if (!canBePart(product)) {
      say(`״${product.name}״ נתלה על קיר של מתחם — מוסיפים אותו בסקיצה`);
      return false;
    }
    // Dressing a table: what is let go lands on it, or hangs over it — never on the floor behind the scrim.
    if (dressingIds.size && product.layer !== "table" && product.layer !== "ceiling") {
      say("בעיצוב שולחן — Esc ליציאה כדי להניח על הרצפה");
      return false;
    }

    const id = uid();
    const variantId = defaultVariantId(product);
    const base = { id, variantId, layer: product.layer, quantity: 1, rotation: 0, scale: 1 };
    const landed = (refs: SelectionRef[]) => {
      setSelected(refs);
      return true;
    };

    // A block of chairs in rows — the rail's "שורות כיסאות".
    if (tool.rows && product.category === "chairs") {
      const rows = cleanRows(NEW_BLOCK);
      act({ type: "addPlacement", placement: { ...base, position: at, rows, quantity: chairRowsCount(rows) } });
      return landed([{ kind: "placement", id }]);
    }
    // A table is a table, never an item standing on the floor.
    if (product.category === "tables") {
      act({ type: "addTable", table: { id, number: nextTableNumber(doc), position: at, rotation: 0, ...tableFields(product) } });
      return landed([{ kind: "table", id }]);
    }

    if (product.layer === "table") {
      const t = tableUnder(doc.tables, at);
      if (!t) {
        say(doc.tables.length ? "פריט שולחן — מניחים אותו על שולחן" : "פריט שולחן — הניחו קודם שולחן, ועליו את הפריט");
        return false;
      }
      if (dressingIds.size && !dressingIds.has(t.id)) {
        say("בעיצוב שולחן — מניחים על השולחן שבעיצוב (Esc ליציאה)");
        return false;
      }
      const members = t.groupId ? doc.tables.filter((m) => m.groupId === t.groupId) : [t];
      // A table wears ONE cloth — every half of a block, recoloured rather than stacked.
      if (anchorOf(product) === "table") {
        batch(
          members.flatMap((m): Action[] => {
            const worn = coverOn(doc, m.id);
            if (worn) return worn.variantId === variantId ? [] : [{ type: "setPlacementVariant", id: worn.id, variantId }];
            return [{ type: "addPlacement", placement: { ...base, id: uid(), tableId: m.id, position: { x: 0, y: 0 } } }];
          }),
        );
        return landed(whole([{ kind: "table", id: t.id }]));
      }
      // On a table being dressed or already arranged by hand it stands WHERE IT WAS LET GO, kept on
      // its top, and what already stands on the table (its block) is frozen where it was drawn, so
      // nothing jumps. Anywhere else the automatic layout finds it a place.
      if (dressingIds.has(t.id) || members.some((m) => m.arranged)) {
        const freeze: Action[] = members
          .filter((m) => !m.arranged)
          .map((m) => {
            const chips = (id: string) => chipsOf(doc, id);
            const spots = dressingSpots(m, chips(m.id), dressBlockOf(doc.tables, m, chips));
            return { type: "arrangeDressing", tableId: m.id, positions: spots.map((sp) => ({ id: sp.p.id, position: sp.local })) };
          });
        const position = clampToTable(tableBox(t), catalogBox(product), toTableFrame(t, at));
        batch([...freeze, { type: "addPlacement", placement: { ...base, tableId: t.id, position } }]);
      } else act({ type: "addPlacement", placement: { ...base, tableId: t.id, position: { x: 0, y: 0 } } });
      return landed([{ kind: "placement", id }]);
    }

    if (product.layer === "ceiling") {
      // Over a table or an element it is hung from ITS middle and linked to the table; over the
      // table being dressed, where it was let go; over bare floor, where it was let go, free.
      const plain: Placement = { ...base, position: at };
      const targets = hangTargetsOf(doc, NO_VENUE);
      const under = tableUnderHang(doc, targets, at);
      const dressed = under && dressingIds.has(under) ? under : null;
      if (dressingIds.size && !dressed) {
        say("בעיצוב שולחן — תולים מעל השולחן שבעיצוב (Esc ליציאה)");
        return false;
      }
      const over = dressed ? null : centreOver(at, targets);
      const hung = dressed ? { ...plain, position: positionHungAt(plain, at) } : over ? { ...plain, position: positionHungAt(plain, over.point) } : plain;
      const tableId = dressed ?? tableUnderHang(doc, targets, hangPointOf(hung));
      act({ type: "addPlacement", placement: tableId ? { ...hung, over: tableId } : hung });
      return landed([{ kind: "placement", id }]);
    }

    act({ type: "addPlacement", placement: { ...base, position: at } });
    return landed([{ kind: "placement", id }]);
  };

  // Click-to-place: a click on a rail row arms it, every click on the plan puts one down.
  const armedTool = armedId ? rowsTool(armedId) : null;
  const armed = armedTool ? (products.find((p) => p.id === armedTool.productId) ?? null) : null;
  const armedRows = !!armedTool?.rows && armed?.category === "chairs";
  const armedBlock = useMemo(() => (armedRows && armed ? carriedRowsOf(armed, NEW_BLOCK) : null), [armedRows, armed]);
  const placeArmed = (at: Point, keep: boolean) => {
    if (!armed || !drop(armedRows ? rowsToolId(armed.id) : armed.id, at.x, at.y)) return;
    if (placesOnce(CATEGORY_BY_ID[armed.category]) && !keep) setArmedId(null);
  };

  // ── edits ───────────────────────────────────────────────────────────────────────────────────
  const refsNow = selected.filter((r): r is GroupRef & SelectionRef => r.kind !== "feature");
  const removeSelected = () => {
    if (!refsNow.length) return;
    setSelected([]);
    batch(refsNow.map((r): Action => (r.kind === "table" ? { type: "removeTable", id: r.id } : { type: "removePlacement", id: r.id })));
  };
  const duplicate = () => {
    if (!refsNow.length) return;
    const clip = copySelection(doc, refsNow, isWall);
    const fresh = pasteInto(clip, { dx: DUPLICATE_STEP_MM, dy: DUPLICATE_STEP_MM, firstNumber: nextTableNumber(doc), newId: uid });
    if (clipCount(fresh) === 0) return;
    batch(clipActions(fresh));
    const landed = landedRefs(fresh);
    // Items copied off a table on their own stay on it — they are the copy.
    setSelected(landed.length ? landed : fresh.placements.map((p) => ({ kind: "placement" as const, id: p.id })));
  };
  const group = soleGroupId(doc, refsNow);
  /** Tables grouped are ONE table — one ring of chairs, one top to dress — as on the sketch. */
  const groupSelection = () => {
    if (refsNow.length < 2) return;
    // No number of its own, as layoutRecipe's block: a pasted block takes the next free one.
    act({ type: "group", groupId: uid(), refs: refsNow });
    say(refsNow.filter((r) => r.kind === "table").length > 1 ? "קובצו לשולחן אחד — כיסאות סביב כולם" : "הפריטים קובצו");
  };
  /** Taken apart, each table would lay out only its own items and they would jump — so each item is
   *  first frozen on its own table where it is drawn, in the same entry (the studio's ungroup). */
  const ungroupSelection = () => {
    if (!group) return;
    const members = doc.tables.filter((t) => t.groupId === group);
    const chips = (id: string) => chipsOf(doc, id);
    const freeze: Action[] = members.some((m) => m.arranged)
      ? []
      : members
          .filter((m) => chips(m.id).length)
          .map((m) => ({ type: "arrangeDressing", tableId: m.id, positions: dressingSpots(m, chips(m.id), dressBlockOf(doc.tables, m, chips)).map((sp) => ({ id: sp.p.id, position: sp.local })) }));
    batch([...freeze, { type: "ungroup", groupId: group }]);
    say("הקבוצה פורקה — הפריטים נשארו במקומם");
  };
  /** Arrows nudge what stands on its own, in screen direction (the plan's +x is screen right). */
  const nudge = (key: string, big: boolean): boolean => {
    const step = big ? NUDGE_BIG_MM : NUDGE_MM;
    const d = key === "ArrowLeft" ? { x: -step, y: 0 } : key === "ArrowRight" ? { x: step, y: 0 } : key === "ArrowUp" ? { x: 0, y: -step } : key === "ArrowDown" ? { x: 0, y: step } : null;
    if (!d) return false;
    const moves = refsNow.flatMap((r): { kind: "table" | "placement"; id: string; position: Point }[] => {
      if (r.kind === "table") {
        const t = doc.tables.find((x) => x.id === r.id);
        return t ? [{ kind: "table" as const, id: t.id, position: { x: t.position.x + d.x, y: t.position.y + d.y } }] : [];
      }
      const p = doc.placements.find((x) => x.id === r.id);
      return p && !p.tableId && !p.perch ? [{ kind: "placement" as const, id: p.id, position: { x: p.position.x + d.x, y: p.position.y + d.y } }] : [];
    });
    if (!moves.length) return false;
    act({ type: "moveMany", moves });
    return true;
  };

  // The newest handlers, for the right-click menu's rows (chosen after the menu was built) and the keys.
  const latest = useRef({ removeSelected, duplicate, groupSelection, ungroupSelection, nudge });
  useLayoutEffect(() => {
    latest.current = { removeSelected, duplicate, groupSelection, ungroupSelection, nudge };
  });
  const contextItems = useCallback(
    (refs: SelectionRef[]): ContextMenuItem[] => {
      const own = refs.filter((r): r is GroupRef & SelectionRef => r.kind !== "feature");
      if (!own.length) return [];
      return [
        { label: "שכפול", icon: Copy, onSelect: () => latest.current.duplicate() },
        ...(own.length > 1 && soleGroupId(doc, own)
          ? [{ label: "פירוק הקבוצה", icon: Ungroup, onSelect: () => latest.current.ungroupSelection() }]
          : own.length > 1
            ? [{ label: "קיבוץ", icon: Group, onSelect: () => latest.current.groupSelection() }]
            : []),
        { label: "הסרה", icon: Trash2, onSelect: () => latest.current.removeSelected() },
      ];
    },
    [doc],
  );

  // Keys: the studio's, the few that apply here — physical keys (isShortcut), so a Hebrew layout works.
  // ESCAPE NEVER CLOSES THIS MODAL (the shape editor's rule): it steps back — what is armed, then the
  // table being dressed, then the selection — and is always kept from the <dialog>'s close watcher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget();
      if (e.key === "Escape") {
        if (!typing && !e.defaultPrevented) {
          if (armedId) setArmedId(null);
          else if (dressing) setDressing(null);
          else setSelected([]);
        }
        e.preventDefault();
        return;
      }
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && isShortcut(e, "z")) {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
      } else if (mod && isShortcut(e, "y")) {
        e.preventDefault();
        setHistory(redo);
      } else if (mod && isShortcut(e, "d")) {
        e.preventDefault();
        latest.current.duplicate();
      } else if (mod && isShortcut(e, "g")) {
        e.preventDefault();
        if (e.shiftKey) latest.current.ungroupSelection();
        else latest.current.groupSelection();
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        latest.current.removeSelected();
      } else if (!mod && !e.defaultPrevented && e.key.startsWith("Arrow") && latest.current.nudge(e.key, e.shiftKey)) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armedId, dressing]);

  // ── the canvas's callbacks ──────────────────────────────────────────────────────────────────
  const moveTable = useCallback((id: string, position: Point) => drag({ type: "moveTable", id, position }), [drag]);
  const movePlacement = useCallback((id: string, position: Point) => drag({ type: "movePlacement", id, position }), [drag]);
  const moveMany = useCallback(
    (moves: { kind: SelectionRef["kind"]; id: string; position: Point }[]) => {
      const own = moves.filter((m): m is { kind: "table" | "placement"; id: string; position: Point } => m.kind !== "feature");
      if (own.length) drag({ type: "moveMany", moves: own });
    },
    [drag],
  );
  const rotateMany = useCallback(
    (turns: { kind: SelectionRef["kind"]; id: string; position: Point; rotation: number }[]) => {
      const own = turns.filter((m): m is { kind: "table" | "placement"; id: string; position: Point; rotation: number } => m.kind !== "feature");
      if (own.length) drag({ type: "rotateMany", turns: own });
    },
    [drag],
  );
  const resizeTable = useCallback(
    (id: string, sizeMm: { widthMm: number; depthMm: number }, position: Point) => {
      drag({ type: "resizeTable", id, sizeMm });
      drag({ type: "moveTable", id, position });
    },
    [drag],
  );
  const resizePlacement = useCallback(
    (id: string, sizeMm: { widthMm: number; depthMm: number }, position: Point) => {
      drag({ type: "resizePlacement", id, sizeMm });
      drag({ type: "movePlacement", id, position });
    },
    [drag],
  );

  // ── what is selected, for the bar ───────────────────────────────────────────────────────────
  const selTables = refsNow.filter((r) => r.kind === "table").map((r) => doc.tables.find((t) => t.id === r.id)).filter((t): t is DesignTable => !!t);
  const selPlacements = refsNow.filter((r) => r.kind === "placement").map((r) => doc.placements.find((p) => p.id === r.id)).filter((p): p is Placement => !!p);
  const soleTable = refsNow.length === 1 && selTables.length === 1 ? selTables[0] : null;
  const solePlacement = refsNow.length === 1 && selPlacements.length === 1 ? selPlacements[0] : null;
  const blockTables = group ? doc.tables.filter((t) => t.groupId === group) : [];

  // ── the item as it stands, and saving it ───────────────────────────────────────────────────
  const live: Composition = useMemo(() => ({ tables: doc.tables, placements: doc.placements, groups: doc.groups ?? [] }), [doc]);
  const empty = doc.tables.length + doc.placements.length === 0;
  const total = internal && !empty ? compositeTotal(live) : null;
  const save = () => {
    // The box its pieces stand in — tables and what stands on its own, as the studio measures a
    // selection saved off a sketch (composeFromSelection).
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const take = (ref: GroupRef) => {
      const g = itemGeometry(doc, NO_VENUE, NO_VENUE, ref);
      if (!g) return;
      box.minX = Math.min(box.minX, g.box.x - g.box.widthMm / 2);
      box.maxX = Math.max(box.maxX, g.box.x + g.box.widthMm / 2);
      box.minY = Math.min(box.minY, g.box.y - g.box.depthMm / 2);
      box.maxY = Math.max(box.maxY, g.box.y + g.box.depthMm / 2);
    };
    for (const t of doc.tables) take({ kind: "table", id: t.id });
    for (const p of doc.placements) if (!p.tableId && !p.perch) take({ kind: "placement", id: p.id });
    if (!Number.isFinite(box.minX)) {
      say("אין בפריט רכיבים — גררו פריטים מהקטלוג אל הקנבס");
      return;
    }
    const clip: Clip = { tables: doc.tables, placements: doc.placements.filter((p) => !isWall(p.variantId)), groups: doc.groups ?? [] };
    onSave({ composition: fromSelection(clip, box), widthMm: Math.round(box.maxX - box.minX), depthMm: Math.round(box.maxY - box.minY) });
    onClose();
  };

  // `close`/`cancel` don't bubble in the DOM, but React dispatches them up the FIBER tree — and this
  // modal is rendered inside the drawer's <dialog>. Without stopPropagation, closing it closed the
  // drawer too (appearance-modal.tsx).
  const stopThenClose = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onClose();
  };
  const refuseCancel = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <dialog ref={dialog} onClose={stopThenClose} onCancel={refuseCancel} className="modal m-auto max-h-none rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog">
      <div className="flex h-[86vh] w-[94vw] max-w-7xl flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <span className="text-sm font-semibold text-ink">סידור הפריט המורכב</span>
          <span className="hidden text-xs text-muted lg:inline">
            גררו פריטים מהקטלוג אל הקנבס, או לחצו על פריט ואז על הקנבס · פריטי שולחן — על שולחן · לחיצה כפולה על שולחן — סידור מה שעליו
          </span>
          <CloseButton className="ms-auto" onClick={onClose} />
        </header>

        <div className="flex min-h-0 flex-1">
          <CatalogRail
            products={products}
            mmPerPx={mmPerPx}
            armedId={armed ? armedId : null}
            onArm={setArmedId}
            eventFolder={false}
            hint="גררו פריט אל הקנבס, או לחצו עליו ואז על הקנבס. פריטי שולחן — על שולחן; פריטי תקרה — מעליו."
          />
          <div className="relative min-w-0 flex-1 bg-canvas">
            <CanvasStage
              doc={doc}
              plan={plan}
              selection={selected}
              layerVisible={ALL_PLANES_VISIBLE}
              spin="together"
              activeLayer={null}
              focusZoneId={null}
              onSelect={pick}
              onSelectMany={pickMany}
              onMoveTable={moveTable}
              onMovePlacement={movePlacement}
              onMoveFeature={NOOP}
              onMoveMany={moveMany}
              onRotateMany={rotateMany}
              onEndDrag={endDrag}
              onResizePlacement={resizePlacement}
              onBowPlacement={(id, bows) => drag({ type: "setPlacementBows", id, bows })}
              onSpanPlacement={NOOP}
              onDropProduct={(productId, x, y) => void drop(productId, x, y)}
              onScale={(v) => {
                mmPerPx.current = v;
              }}
              clearance={NO_CLEARANCE}
              showClearance={false}
              onToggleClearance={NOOP}
              onResizeTable={resizeTable}
              stageFillActive={false}
              onStageFill={NOOP}
              drawArea={false}
              onArea={NOOP}
              onCancelArea={NOOP}
              areaPreview={null}
              onPickFront={NOOP}
              armed={armed}
              armedSize={armedBlock ? { widthMm: armedBlock.widthMm, depthMm: armedBlock.depthMm } : null}
              onPlaceArmed={placeArmed}
              onDisarm={() => setArmedId(null)}
              onContextMenu={contextItems}
              dressingTableId={dressing}
              onFocusTable={dressTable}
              onExitDressing={() => setDressing(null)}
              onArrangeDressing={(tableId, positions) => drag({ type: "arrangeDressing", tableId, positions })}
              onArrangeBlock={(positions) => drag({ type: "arrangeOnTables", positions })}
            />

            {/* Undo / redo, top start — the client sketch's strip. */}
            <div className="absolute start-3 top-3 flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 shadow-lifted">
              <BarButton icon={Undo2} label="ביטול · Ctrl+Z" disabled={history.past.length === 0} onClick={() => setHistory(undo)} />
              <BarButton icon={Redo2} label="חזרה · Ctrl+Y" disabled={history.future.length === 0} onClick={() => setHistory(redo)} />
            </div>

            <div className="pointer-events-none absolute inset-x-3 top-4 z-10 flex justify-center" aria-live="polite">
              {hint ? (
                <span className="rounded-md bg-ink px-3 py-1.5 text-sm text-canvas shadow-dialog">{hint}</span>
              ) : dressing ? (
                <span className="pointer-events-auto flex items-center gap-2 rounded-pill border border-accent-line bg-surface py-1 ps-4 pe-1 text-[13px] text-ink shadow-floating">
                  עיצוב השולחן — גררו את הפריטים שעליו · Esc ליציאה
                  <Button size="sm" variant="outline" onClick={() => setDressing(null)}>
                    סיום
                  </Button>
                </span>
              ) : armed ? (
                <span className="rounded-pill bg-ink/85 px-4 py-2 text-[13px] text-canvas">לחצו על הקנבס כדי להניח את ״{armed.name}״ · Esc לסיום</span>
              ) : empty ? (
                <span className="rounded-pill bg-ink/85 px-4 py-2 text-[13px] text-canvas">התחילו משולחן או מפריט רצפה — גררו אותו מהקטלוג אל הקנבס</span>
              ) : null}
            </div>

            {/* The selection's bar, bottom centre — the studio's inspector bar, the few verbs that apply. */}
            {refsNow.length > 0 && (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
                <div className="pointer-events-auto max-w-full">
                  {soleTable ? (
                    <Bar icon={Table2} title={soleTable.type} facts={soleTable.seats ? `${soleTable.seats} מקומות` : undefined} onClose={() => setSelected([])}>
                      <Rotation value={soleTable.rotation} onChange={(deg) => act({ type: "rotateTable", id: soleTable.id, rotation: deg })} />
                      <Popover label="מקומות" value={ltr(String(soleTable.seats ?? 0))}>
                        <PanelRow label="כמה כיסאות סביב השולחן" htmlFor="ce-seats">
                          <NumberField id="ce-seats" value={soleTable.seats ?? 0} min={0} max={60} decimals={0} className="w-20" onChange={(n) => act({ type: "setTableSeats", id: soleTable.id, seats: n })} />
                        </PanelRow>
                      </Popover>
                      <BarButton icon={PaintRoller} label="סידור הפריטים על השולחן · לחיצה כפולה" active={dressing === soleTable.id} onClick={() => dressTable(soleTable.id)} />
                      <div className="ms-auto flex items-center gap-1">
                        <BarButton icon={Copy} label="שכפול · Ctrl+D" onClick={duplicate} />
                        <BarButton icon={Trash2} label="הסרה · Delete" tone="danger" onClick={removeSelected} />
                      </div>
                    </Bar>
                  ) : solePlacement ? (
                    <Bar
                      icon={Package}
                      title={resolve(solePlacement.variantId)?.label ?? "פריט"}
                      facts={CATEGORY_BY_ID[resolve(solePlacement.variantId)?.category ?? ""]?.label}
                      onClose={() => setSelected([])}
                    >
                      {resolve(solePlacement.variantId)?.anchor !== "table" && (
                        <Rotation value={solePlacement.rotation} onChange={(deg) => act({ type: "rotatePlacement", id: solePlacement.id, rotation: deg })} />
                      )}
                      <div className="ms-auto flex items-center gap-1">
                        <BarButton icon={Copy} label="שכפול · Ctrl+D" onClick={duplicate} />
                        <BarButton icon={Trash2} label="הסרה · Delete" tone="danger" onClick={removeSelected} />
                      </div>
                    </Bar>
                  ) : (
                    <Bar
                      icon={group && blockTables.length > 1 ? Table2 : Group}
                      title={group && blockTables.length > 1 ? "שולחן מחובר" : `${refsNow.length} פריטים`}
                      facts={group && blockTables.length > 1 ? `${blockTables.length} שולחנות · ${blockTables.reduce((n, t) => n + (t.seats ?? 0), 0)} מקומות` : undefined}
                      onClose={() => setSelected([])}
                    >
                      {group ? (
                        <BarButton icon={Ungroup} label="פירוק הקבוצה · Ctrl+Shift+G" onClick={ungroupSelection} />
                      ) : (
                        <BarButton icon={Group} label={selTables.length > 1 ? "חיבור לשולחן אחד · Ctrl+G" : "קיבוץ · Ctrl+G"} onClick={groupSelection} />
                      )}
                      {group && blockTables.length > 1 && (
                        <BarButton icon={PaintRoller} label="סידור הפריטים על השולחן · לחיצה כפולה" active={!!dressing && dressingIds.has(blockTables[0].id)} onClick={() => dressTable(blockTables[0].id)} />
                      )}
                      <div className="ms-auto flex items-center gap-1">
                        <BarButton icon={Copy} label="שכפול · Ctrl+D" onClick={duplicate} />
                        <BarButton icon={Trash2} label="הסרה · Delete" tone="danger" onClick={removeSelected} />
                      </div>
                    </Bar>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-border px-5 py-3">
          <span className="min-w-0 truncate text-[13px] text-ink-soft">{empty ? "אין עדיין רכיבים" : compositeLine(live)}</span>
          {total && (
            <span className="nums shrink-0 text-[13px] text-muted">
              {total.partial ? "סכום הרכיבים (חלקי)" : "סכום הרכיבים"} <span className="font-bold text-ink">{formatPrice(total.total)}</span>
            </span>
          )}
          <div className="flex-1" />
          <Button type="button" variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button type="button" disabled={empty} onClick={save}>
            שמירת הסידור
          </Button>
        </footer>
      </div>
    </dialog>
  );
}

export default CompositionEditor;
