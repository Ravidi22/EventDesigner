import { useCallback, useEffect, useRef, useState } from "react";
import { isTypingTarget } from "@/lib/keyboard";
import type { EdgeCurve, Entrance, Fixture, Point } from "./hall";
import {
  bulgeToCurve,
  clampEdgeCurve,
  edgeMidpoint,
  endpointFromLengthAngle,
  projectOntoWall,
  reshapeEdgeKeepingAngles,
  setBulgeDepth,
  wallAngleDeg,
  wallLengthMm,
} from "./geometry";

// The single owner of an editable outline: the shape's state, every geometry mutation on it, and
// the undo/redo history those mutations feed. Both the hall editor (outline + doors + stage +
// bars) and the catalog's footprint editor (outline only) run through here.
//
// The hall's collections are optional fields that simply stay empty for a footprint, rather than a
// second hall-flavoured hook layered on a smaller core: one edit routinely touches several of them
// at once (removing a corner rewrites the outline, the curves *and* the doors on them), so a
// snapshot has to be atomic across the lot. Two histories kept in lockstep would be the bug.

export type SelectedKind = "vertex" | "wall" | "entrance" | "stage" | "bar";
export interface SelectedRef {
  kind: SelectedKind;
  id: string;
}

export interface OutlineState {
  mode: "draw" | "edit";
  outline: Point[];
  edgeCurves: (EdgeCurve | null)[];
  entrances: Entrance[];
  stage: Fixture | undefined;
  bars: Fixture[];
}

export interface OutlineEditorInit {
  outline?: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  entrances?: Entrance[];
  stage?: Fixture;
  bars?: Fixture[];
  mode?: "draw" | "edit"; // default: an outline of 3+ points opens in edit, anything less in draw
}

const MAX_HISTORY = 50; // a long session must not grow the stack without bound
const COALESCE_MS = 900; // how long an open history entry keeps accepting writes to the same target

// Older/seed halls saved before curves existed have no edgeCurves — pad to match the outline
// instead of leaving it short, or every per-edge update would map over nothing. Also re-clamp
// every curve to the current per-wall bound, in case it was ever saved before the bulge-depth
// clamp existed (that's how "עיקום" could show an absurd number).
function sanitizeEdgeCurves(outline: Point[], edgeCurves: (EdgeCurve | null)[] | undefined): (EdgeCurve | null)[] {
  const n = outline.length;
  return Array.from({ length: n }, (_, i) => {
    const c = edgeCurves?.[i] ?? null;
    return c ? clampEdgeCurve(outline[i], outline[(i + 1) % n], c) : null;
  });
}

function initialState(init: OutlineEditorInit): OutlineState {
  const outline = init.outline ?? [];
  return {
    mode: init.mode ?? (outline.length >= 3 ? "edit" : "draw"),
    outline,
    edgeCurves: sanitizeEdgeCurves(outline, init.edgeCurves),
    entrances: init.entrances ?? [],
    stage: init.stage,
    bars: init.bars ?? [],
  };
}

// --- pure state transforms -------------------------------------------------------------------

function withVertexMoved(s: OutlineState, idx: number, p: Point): OutlineState {
  return { ...s, outline: s.outline.map((v, i) => (i === idx ? p : v)) };
}

// Swapping in a whole new outline changes wall lengths, so the two things measured *against* those
// lengths have to be re-fitted: a bow whose control offsets now exceed its shortened wall, and a
// door whose distance along the chord now falls past the wall's end.
function withOutlineReplaced(s: OutlineState, outline: Point[]): OutlineState {
  const n = outline.length;
  const edgeCurves = s.edgeCurves.map((c, i) => (c ? clampEdgeCurve(outline[i], outline[(i + 1) % n], c) : c));
  const entrances = s.entrances.map((e) => {
    const len = wallLengthMm(outline[e.wallIndex], outline[(e.wallIndex + 1) % n]);
    return { ...e, distanceMm: Math.max(0, Math.min(len, e.distanceMm)) };
  });
  return { ...s, outline, edgeCurves, entrances };
}

// Numeric length/angle edits move the wall's end vertex *and* the corner after it, so every other
// wall keeps its angle and wall i+2 absorbs the change (see reshapeEdgeKeepingAngles — without
// this, setting one side of a square shears its neighbour and the rectangle is lost). Degenerate
// shapes fall back to moving the end vertex alone, which is the older, blunter behaviour.
function withEdgeReshaped(s: OutlineState, edgeIdx: number, newB: Point): OutlineState {
  const n = s.outline.length;
  const solved = reshapeEdgeKeepingAngles(s.outline, edgeIdx, newB);
  const outline = solved
    ? s.outline.map((v, i) => (i === solved.bIdx ? solved.b : i === solved.cIdx ? solved.c : v))
    : s.outline.map((v, i) => (i === (edgeIdx + 1) % n ? newB : v));
  return withOutlineReplaced(s, outline);
}

// Removing a corner merges its two adjacent walls into one straight wall — doors on either of
// those walls lose their host and are dropped; every other door's wallIndex shifts to match.
function withVertexRemoved(s: OutlineState, idx: number): OutlineState {
  if (s.outline.length <= 3) return s;
  const n = s.outline.length;
  const incomingIdx = (idx - 1 + n) % n;
  const edgeCurves: (EdgeCurve | null)[] = [];
  const indexMap = new Map<number, number>();
  let newIdx = 0;
  for (let i = 0; i < n; i++) {
    if (i === idx) continue;
    edgeCurves.push(i === incomingIdx ? null : (s.edgeCurves[i] ?? null));
    indexMap.set(i, newIdx);
    newIdx++;
  }
  return {
    ...s,
    outline: s.outline.filter((_, i) => i !== idx),
    edgeCurves,
    entrances: s.entrances
      .filter((e) => e.wallIndex !== idx && e.wallIndex !== incomingIdx)
      .map((e) => ({ ...e, wallIndex: indexMap.get(e.wallIndex)! })),
  };
}

// Splitting a wall shifts every later wall's index by one; a door on the split wall stays on
// whichever half it now falls in (measured along the original chord).
function withVertexInserted(s: OutlineState, edgeIdx: number): OutlineState {
  const n = s.outline.length;
  const a = s.outline[edgeIdx];
  const b = s.outline[(edgeIdx + 1) % n];
  const mid = edgeMidpoint(a, b, s.edgeCurves[edgeIdx] ?? null);
  const splitDistance = wallLengthMm(a, b) / 2;
  const edgeCurves: (EdgeCurve | null)[] = [];
  for (let i = 0; i < n; i++) {
    if (i === edgeIdx) edgeCurves.push(null, null); // wall splits into two straight segments
    else edgeCurves.push(s.edgeCurves[i] ?? null);
  }
  return {
    ...s,
    outline: [...s.outline.slice(0, edgeIdx + 1), mid, ...s.outline.slice(edgeIdx + 1)],
    edgeCurves,
    entrances: s.entrances.map((e) => {
      if (e.wallIndex === edgeIdx) {
        return e.distanceMm < splitDistance ? e : { ...e, wallIndex: edgeIdx + 1, distanceMm: e.distanceMm - splitDistance };
      }
      return e.wallIndex > edgeIdx ? { ...e, wallIndex: e.wallIndex + 1 } : e;
    }),
  };
}

function withWallHandleMoved(s: OutlineState, edgeIdx: number, which: "bulge" | "c1" | "c2", p: Point): OutlineState {
  const n = s.outline.length;
  const a = s.outline[edgeIdx];
  const b = s.outline[(edgeIdx + 1) % n];
  return {
    ...s,
    edgeCurves: s.edgeCurves.map((c, i) => {
      if (i !== edgeIdx) return c;
      if (which === "bulge") return bulgeToCurve(a, b, p);
      if (!c) return c;
      const next = which === "c1" ? { ...c, c1: { x: p.x - a.x, y: p.y - a.y } } : { ...c, c2: { x: p.x - b.x, y: p.y - b.y } };
      return clampEdgeCurve(a, b, next);
    }),
  };
}

// Selection lives outside the history (nobody wants Ctrl+Z to re-select), so every restore has to
// re-validate it against the state it lands on — otherwise undoing past a vertex's creation leaves
// the inspector pointed at an index that no longer exists.
export function reconcileSelection(s: OutlineState, sel: SelectedRef | null): SelectedRef | null {
  if (!sel) return null;
  switch (sel.kind) {
    case "vertex":
    case "wall": {
      const i = Number(sel.id);
      return Number.isInteger(i) && i >= 0 && i < s.outline.length ? sel : null;
    }
    case "entrance":
      return s.entrances.some((e) => e.id === sel.id) ? sel : null;
    case "stage":
      return s.stage ? sel : null;
    case "bar":
      return s.bars.some((b) => b.id === sel.id) ? sel : null;
  }
}

// --- history ----------------------------------------------------------------------------------
// Same {present, past, future} shape the design document already uses (lib/design-document/
// actions.ts), plus a depth cap.

interface Store {
  present: OutlineState;
  past: OutlineState[];
  future: OutlineState[];
  selected: SelectedRef | null;
}

function pushPast(store: Store, present: OutlineState): Store {
  const past = [...store.past, store.present];
  return { ...store, present, past: past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past, future: [] };
}

function undoStore(store: Store): Store {
  if (store.past.length === 0) return store;
  const previous = store.past[store.past.length - 1];
  return { present: previous, past: store.past.slice(0, -1), future: [store.present, ...store.future], selected: reconcileSelection(previous, store.selected) };
}

function redoStore(store: Store): Store {
  if (store.future.length === 0) return store;
  const [next, ...rest] = store.future;
  const past = [...store.past, store.present];
  return { present: next, past: past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past, future: rest, selected: reconcileSelection(next, store.selected) };
}

// One history entry per gesture, not per state write: a drag calls moveVertex dozens of times and
// a NumberField calls setWallLength once per keystroke. Both keep writing into the entry that is
// already open as long as they name the same target — a token built from the thing being edited
// and, for patches, the fields in them, so "אורך" and "זווית" don't share an entry. An entry
// closes when commit() says so (the canvas fires it at pointer-up of every real drag) or after
// COALESCE_MS of silence, which is what stops typing "12.5" from costing four undos.
interface OpenEntry {
  token: string;
  at: number;
}
function continuesEntry(open: OpenEntry | null, token: string | null, now: number): boolean {
  return token !== null && open !== null && open.token === token && now - open.at < COALESCE_MS;
}

const patchToken = (prefix: string, patch: object) => `${prefix}:${Object.keys(patch).join(",")}`;

// --- the hook ---------------------------------------------------------------------------------

export function useOutlineEditor(init: OutlineEditorInit, options?: { enabled?: boolean }) {
  // `enabled` gates the global Ctrl+Z listener — the catalog's modal stays mounted while closed
  // and must not answer for a shape nobody can see.
  const enabled = options?.enabled ?? true;
  // init is read once, lazily — the hosts rebuild the object every render.
  const [store, setStore] = useState<Store>(() => ({ present: initialState(init), past: [], future: [], selected: null }));
  const open = useRef<OpenEntry | null>(null);

  // The one way state changes. `token` names the gesture this write belongs to; null means a
  // discrete action, which always takes its own entry and closes whatever was open. `select`
  // decides the selection for the new state — by default whatever is still resolvable, which is
  // how deleting a fixture drops its own selection.
  const edit = useCallback(
    (next: (s: OutlineState) => OutlineState, token: string | null, select?: (s: OutlineState) => SelectedRef | null) => {
      const now = Date.now();
      const joins = continuesEntry(open.current, token, now);
      open.current = token === null ? null : { token, at: now };
      setStore((prev) => {
        const present = next(prev.present);
        if (present === prev.present) return prev;
        const selected = select ? select(present) : reconcileSelection(present, prev.selected);
        const moved = joins ? { ...prev, present, future: [] } : pushPast(prev, present);
        return moved.selected === selected ? moved : { ...moved, selected };
      });
    },
    [],
  );

  const setSelected = useCallback((sel: SelectedRef | null) => setStore((s) => (s.selected === sel ? s : { ...s, selected: sel })), []);
  const commit = useCallback(() => {
    open.current = null;
  }, []);
  const undo = useCallback(() => {
    open.current = null;
    setStore(undoStore);
  }, []);
  const redo = useCallback(() => {
    open.current = null;
    setStore(redoStore);
  }, []);

  // Replaces the whole state in one undoable step — for host-level operations that aren't a single
  // geometry edit (the footprint editor's width/depth rescale, throwing away a half-drawn shape).
  const setAll = useCallback((patch: Partial<OutlineState>) => edit((s) => ({ ...s, ...patch }), null), [edit]);
  // Starts over on a different shape entirely: no undoing back into the previous one.
  const reset = useCallback((next: OutlineEditorInit) => {
    open.current = null;
    setStore({ present: initialState(next), past: [], future: [], selected: null });
  }, []);

  // --- outline -------------------------------------------------------------------------------
  const addVertex = useCallback((p: Point) => edit((s) => ({ ...s, outline: [...s.outline, p] }), null), [edit]);
  const removeLastVertex = useCallback(() => edit((s) => (s.outline.length > 0 ? { ...s, outline: s.outline.slice(0, -1) } : s), null), [edit]);
  const closeOutline = useCallback(
    () => edit((s) => (s.outline.length < 3 ? s : { ...s, mode: "edit", edgeCurves: Array(s.outline.length).fill(null) }), null),
    [edit],
  );
  const moveVertex = useCallback((idx: number, p: Point) => edit((s) => withVertexMoved(s, idx, p), `vertex:${idx}`), [edit]);
  // The corner is gone and every index after it has shifted — the old selection can't be remapped
  // to anything the user meant, so it goes.
  const removeVertex = useCallback((idx: number) => edit((s) => withVertexRemoved(s, idx), null, () => null), [edit]);
  const insertVertexOnWall = useCallback(
    (edgeIdx: number) => edit((s) => withVertexInserted(s, edgeIdx), null, () => ({ kind: "vertex", id: String(edgeIdx + 1) })),
    [edit],
  );
  const moveWallHandle = useCallback(
    (edgeIdx: number, which: "bulge" | "c1" | "c2", p: Point) => edit((s) => withWallHandleMoved(s, edgeIdx, which, p), `wall:${edgeIdx}:${which}`),
    [edit],
  );

  // Numeric wall editing: length/angle move the wall's end vertex through the same transform a
  // drag would use; bulge depth writes through the same edgeCurves.
  const setWallLength = useCallback(
    (edgeIdx: number, meters: number) =>
      edit((s) => {
        const n = s.outline.length;
        const a = s.outline[edgeIdx];
        const b = s.outline[(edgeIdx + 1) % n];
        return withEdgeReshaped(s, edgeIdx, endpointFromLengthAngle(a, Math.max(1, meters * 1000), wallAngleDeg(a, b)));
      }, `wallLength:${edgeIdx}`),
    [edit],
  );
  const setWallAngle = useCallback(
    (edgeIdx: number, degrees: number) =>
      edit((s) => {
        const n = s.outline.length;
        const a = s.outline[edgeIdx];
        const b = s.outline[(edgeIdx + 1) % n];
        return withEdgeReshaped(s, edgeIdx, endpointFromLengthAngle(a, wallLengthMm(a, b), degrees));
      }, `wallAngle:${edgeIdx}`),
    [edit],
  );
  const setWallBulgeDepth = useCallback(
    (edgeIdx: number, depthMm: number) =>
      edit((s) => {
        const n = s.outline.length;
        const a = s.outline[edgeIdx];
        const b = s.outline[(edgeIdx + 1) % n];
        return { ...s, edgeCurves: s.edgeCurves.map((c, i) => (i === edgeIdx ? setBulgeDepth(a, b, c, depthMm) : c)) };
      }, `wallBulge:${edgeIdx}`),
    [edit],
  );

  // --- hall fixtures (no-ops on a footprint, which carries none of them) -----------------------
  const addEntrance = useCallback(
    (entrance: Entrance) => edit((s) => ({ ...s, entrances: [...s.entrances, entrance] }), null, () => ({ kind: "entrance", id: entrance.id })),
    [edit],
  );
  const updateEntrance = useCallback(
    (id: string, patch: Partial<Entrance>) =>
      edit((s) => ({ ...s, entrances: s.entrances.map((e) => (e.id === id ? { ...e, ...patch } : e)) }), patchToken(`entrance:${id}`, patch)),
    [edit],
  );
  // A door's position is a distance along its wall's chord, so a world-space drag has to be
  // projected back onto that wall before it can be stored.
  const moveEntrance = useCallback(
    (id: string, p: Point) =>
      edit((s) => {
        const n = s.outline.length;
        return {
          ...s,
          entrances: s.entrances.map((e) => {
            if (e.id !== id) return e;
            return { ...e, distanceMm: projectOntoWall(s.outline[e.wallIndex], s.outline[(e.wallIndex + 1) % n], p) };
          }),
        };
      }, `entrance:${id}:distanceMm`),
    [edit],
  );
  const removeEntrance = useCallback((id: string) => edit((s) => ({ ...s, entrances: s.entrances.filter((e) => e.id !== id) }), null), [edit]);

  const addStage = useCallback((stage: Fixture) => edit((s) => ({ ...s, stage }), null, () => ({ kind: "stage", id: stage.id })), [edit]);
  const updateStage = useCallback(
    (patch: Partial<Fixture>) => edit((s) => (s.stage ? { ...s, stage: { ...s.stage, ...patch } } : s), patchToken("stage", patch)),
    [edit],
  );
  const removeStage = useCallback(() => edit((s) => ({ ...s, stage: undefined }), null), [edit]);

  const addBar = useCallback((bar: Fixture) => edit((s) => ({ ...s, bars: [...s.bars, bar] }), null, () => ({ kind: "bar", id: bar.id })), [edit]);
  const updateBar = useCallback(
    (id: string, patch: Partial<Fixture>) => edit((s) => ({ ...s, bars: s.bars.map((b) => (b.id === id ? { ...b, ...patch } : b)) }), patchToken(`bar:${id}`, patch)),
    [edit],
  );
  const removeBar = useCallback((id: string) => edit((s) => ({ ...s, bars: s.bars.filter((b) => b.id !== id) }), null), [edit]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTypingTarget()) return; // a field owns its own Ctrl+Z
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, undo, redo]);

  return {
    ...store.present,
    selected: store.selected,
    setSelected,
    addVertex,
    removeLastVertex,
    closeOutline,
    moveVertex,
    removeVertex,
    insertVertexOnWall,
    moveWallHandle,
    setWallLength,
    setWallAngle,
    setWallBulgeDepth,
    addEntrance,
    updateEntrance,
    moveEntrance,
    removeEntrance,
    addStage,
    updateStage,
    removeStage,
    addBar,
    updateBar,
    removeBar,
    setAll,
    reset,
    commit,
    undo,
    redo,
    canUndo: store.past.length > 0,
    canRedo: store.future.length > 0,
  };
}

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/use-outline-editor.ts
if ((import.meta as { main?: boolean }).main) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ];
  const door = (id: string, wallIndex: number, distanceMm: number): Entrance => ({ id, wallIndex, distanceMm, widthMm: 200, swingInward: true, doubleDoor: false });
  const base: OutlineState = { mode: "edit", outline: square, edgeCurves: [null, null, null, null], entrances: [], stage: undefined, bars: [] };

  // Load-time sanitizing: pad a short/absent array out to the outline, and re-clamp a curve that
  // was saved before the bulge clamp existed.
  assert(sanitizeEdgeCurves(square, undefined).length === 4, "missing edgeCurves pad out to the outline length");
  const wild = sanitizeEdgeCurves(square, [{ c1: { x: 0, y: 78176988 }, c2: { x: 0, y: -78176988 } }]);
  assert(wild.length === 4 && wild[1] === null && wild[0] !== null, "a short saved array keeps what it had and pads the rest");
  assert(Math.hypot(wild[0]!.c1.x, wild[0]!.c1.y) <= 3000 + 1e-6, "a corrupted saved curve is re-clamped on load");
  assert(initialState({ outline: square }).mode === "edit" && initialState({ outline: [] }).mode === "draw", "mode is derived from the outline");

  // Removing a corner: the two walls it joined become one straight wall, doors on either of them
  // are dropped, and every later door follows its wall's new index.
  const withDoors: OutlineState = { ...base, entrances: [door("keep", 2, 400), door("onOutgoing", 1, 100), door("onIncoming", 0, 100)] };
  const removed = withVertexRemoved(withDoors, 1);
  assert(removed.outline.length === 3 && removed.edgeCurves.length === 3, "the outline and its curves shrink together");
  assert(removed.entrances.length === 1 && removed.entrances[0].id === "keep", "doors on the two merged walls are dropped");
  assert(removed.entrances[0].wallIndex === 1, "a surviving door follows its wall's new index");
  assert(withVertexRemoved(withVertexRemoved(withDoors, 1), 0).outline.length === 3, "a triangle refuses to lose another corner");

  // Splitting a wall: the door stays on whichever half it falls in, later walls shift by one.
  const split = withVertexInserted({ ...base, entrances: [door("near", 0, 100), door("far", 0, 900), door("later", 2, 100)] }, 0);
  assert(split.outline.length === 5 && split.edgeCurves.length === 5, "the split adds a vertex and an edge");
  assert(split.outline[1].x === 500 && split.outline[1].y === 0, "the new vertex lands on the wall's midpoint");
  const byId = (id: string) => split.entrances.find((e) => e.id === id)!;
  assert(byId("near").wallIndex === 0 && byId("near").distanceMm === 100, "a door before the split stays on the first half");
  assert(byId("far").wallIndex === 1 && byId("far").distanceMm === 400, "a door past the split moves onto the second half");
  assert(byId("later").wallIndex === 3, "a door on a later wall shifts by one");

  // Selection has to survive — or not survive — a restore.
  const withBar: OutlineState = { ...base, bars: [{ id: "b1", label: "בר", x: 0, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 }] };
  assert(reconcileSelection(withBar, { kind: "bar", id: "b1" })?.id === "b1", "a still-present bar keeps its selection");
  assert(reconcileSelection(base, { kind: "bar", id: "b1" }) === null, "a bar that no longer exists clears the selection");
  assert(reconcileSelection(base, { kind: "vertex", id: "3" })?.id === "3", "a vertex index inside the outline is kept");
  assert(reconcileSelection(base, { kind: "vertex", id: "9" }) === null, "a vertex index past the end is cleared");
  assert(reconcileSelection(base, { kind: "stage", id: "fx-stage" }) === null, "a removed stage clears the selection");

  // History: push/undo/redo round-trip, the depth cap, and a redo branch dropped by a new edit.
  const moved = withVertexMoved(base, 0, { x: 50, y: 50 });
  let store: Store = { present: base, past: [], future: [], selected: null };
  store = pushPast(store, moved);
  assert(store.present.outline[0].x === 50 && store.past.length === 1, "an edit pushes the previous state");
  store = undoStore(store);
  assert(store.present.outline[0].x === 0 && store.future.length === 1, "undo restores it and banks a redo");
  store = redoStore(store);
  assert(store.present.outline[0].x === 50 && store.future.length === 0, "redo puts it back");
  store = undoStore(store);
  store = pushPast(store, withVertexMoved(base, 0, { x: 9, y: 9 }));
  assert(store.future.length === 0, "a fresh edit drops the redo branch");
  assert(undoStore({ present: base, past: [], future: [], selected: null }).past.length === 0, "undo at the bottom of the stack is a no-op");
  let deep: Store = { present: base, past: [], future: [], selected: null };
  for (let i = 0; i < MAX_HISTORY + 20; i++) deep = pushPast(deep, withVertexMoved(deep.present, 0, { x: i, y: 0 }));
  assert(deep.past.length === MAX_HISTORY, "the history stops growing at the cap");
  assert(deep.past[deep.past.length - 1].outline[0].x === MAX_HISTORY + 18, "the cap drops the oldest entries, not the newest");

  // Gesture coalescing: same target within the window keeps writing into the open entry.
  const t0 = 1_000_000;
  assert(continuesEntry({ token: "vertex:2", at: t0 }, "vertex:2", t0 + 16), "a drag frame joins the entry it opened");
  assert(!continuesEntry({ token: "vertex:2", at: t0 }, "vertex:2", t0 + COALESCE_MS), "silence longer than the window starts a new entry");
  assert(!continuesEntry({ token: "vertex:2", at: t0 }, "vertex:3", t0 + 16), "a different target starts a new entry");
  assert(!continuesEntry({ token: "vertex:2", at: t0 }, null, t0 + 16), "a discrete action never joins an open entry");
  assert(!continuesEntry(null, "vertex:2", t0), "nothing open means a new entry");
  assert(patchToken("stage", { rotationDeg: 90 }) !== patchToken("stage", { widthMm: 10 }), "two fields of one fixture take separate entries");

  console.log("outline-editor self-check passed");
}
