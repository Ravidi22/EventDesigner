import { useCallback, useEffect, useRef, useState } from "react";
import { isTypingTarget } from "@/lib/keyboard";
import type { EdgeCurve, Entrance, Fixture, Point } from "./hall";
import {
  bulgeToCurve,
  clampEdgeCurve,
  constrainVertexToLocks,
  edgeMidpoint,
  endpointFromLengthAngle,
  projectOntoWall,
  reshapeEdgeKeepingAngles,
  setBulgeDepth,
  wallAngleDeg,
  wallLengthMm,
} from "./geometry";
import { isMain } from "../self-check";

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

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
  lockedEdges: boolean[];
  entrances: Entrance[];
  stage: Fixture | undefined;
  bars: Fixture[];
}

export interface OutlineEditorInit {
  outline?: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  lockedEdges?: boolean[];
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

// Older/seed halls saved before locks existed have no lockedEdges — pad to match the outline, same
// as sanitizeEdgeCurves. Unlike a curve there's nothing to re-validate beyond the pad: a lock
// either survived the save as a plain boolean or it didn't.
function sanitizeLockedEdges(outline: Point[], lockedEdges: boolean[] | undefined): boolean[] {
  return Array.from({ length: outline.length }, (_, i) => lockedEdges?.[i] ?? false);
}

function initialState(init: OutlineEditorInit): OutlineState {
  const outline = init.outline ?? [];
  return {
    mode: init.mode ?? (outline.length >= 3 ? "edit" : "draw"),
    outline,
    edgeCurves: sanitizeEdgeCurves(outline, init.edgeCurves),
    lockedEdges: sanitizeLockedEdges(outline, init.lockedEdges),
    entrances: init.entrances ?? [],
    stage: init.stage,
    bars: init.bars ?? [],
  };
}

// --- pure state transforms -------------------------------------------------------------------

// A locked wall pins whichever of its endpoints is being dragged onto the circle (or, pinned
// between two locked walls, the point) that keeps its length exactly what it was — see
// constrainVertexToLocks. An unlocked vertex is untouched by this, so ordinary dragging is exactly
// as free as it always was.
function withVertexMoved(s: OutlineState, idx: number, p: Point): OutlineState {
  const clamped = constrainVertexToLocks(s.outline, idx, p, s.lockedEdges);
  return { ...s, outline: s.outline.map((v, i) => (i === idx ? clamped : v)) };
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
//
// A locked wall changes this in two ways: editing a locked wall's *own* length/angle is refused
// outright (the inspector disables the field too — this is belt-and-suspenders), and if the
// angle-preserving solve above would quietly change a *different*, locked wall's length two
// corners over, that solve is rejected in favour of the blunter single-vertex fallback — which
// moves nothing past this wall's own far end, so a lock further along the outline can't be
// smuggled past. That fallback still routes through withVertexMoved's own lock clamp, so a lock on
// the wall being directly touched by the fallback is respected too.
function withEdgeReshaped(s: OutlineState, edgeIdx: number, newB: Point): OutlineState {
  if (s.lockedEdges[edgeIdx]) return s;
  const n = s.outline.length;
  const bIdx = (edgeIdx + 1) % n;
  const cIdx = (edgeIdx + 2) % n;
  const solved = reshapeEdgeKeepingAngles(s.outline, edgeIdx, newB);
  const spoilsLock =
    solved &&
    ((s.lockedEdges[bIdx] && Math.abs(wallLengthMm(solved.b, solved.c) - wallLengthMm(s.outline[bIdx], s.outline[cIdx])) > 1e-6) ||
      (s.lockedEdges[cIdx] &&
        Math.abs(wallLengthMm(solved.c, s.outline[(cIdx + 1) % n]) - wallLengthMm(s.outline[cIdx], s.outline[(cIdx + 1) % n])) > 1e-6));
  const outline =
    solved && !spoilsLock
      ? s.outline.map((v, i) => (i === solved.bIdx ? solved.b : i === solved.cIdx ? solved.c : v))
      : s.outline.map((v, i) => (i === bIdx ? constrainVertexToLocks(s.outline, bIdx, newB, s.lockedEdges) : v));
  return withOutlineReplaced(s, outline);
}

// Removing a corner merges its two adjacent walls into one straight wall — doors on either of
// those walls lose their host and are dropped; every other door's wallIndex shifts to match.
function withVertexRemoved(s: OutlineState, idx: number): OutlineState {
  if (s.outline.length <= 3) return s;
  const n = s.outline.length;
  const incomingIdx = (idx - 1 + n) % n;
  const edgeCurves: (EdgeCurve | null)[] = [];
  const lockedEdges: boolean[] = [];
  const indexMap = new Map<number, number>();
  let newIdx = 0;
  for (let i = 0; i < n; i++) {
    if (i === idx) continue;
    edgeCurves.push(i === incomingIdx ? null : (s.edgeCurves[i] ?? null));
    lockedEdges.push(i === incomingIdx ? false : s.lockedEdges[i]); // the merged wall is new geometry — it starts unlocked
    indexMap.set(i, newIdx);
    newIdx++;
  }
  return {
    ...s,
    outline: s.outline.filter((_, i) => i !== idx),
    edgeCurves,
    lockedEdges,
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
  const lockedEdges: boolean[] = [];
  for (let i = 0; i < n; i++) {
    if (i === edgeIdx) {
      edgeCurves.push(null, null); // wall splits into two straight segments
      lockedEdges.push(s.lockedEdges[i], s.lockedEdges[i]); // a locked wall's split halves both stay locked
    } else {
      edgeCurves.push(s.edgeCurves[i] ?? null);
      lockedEdges.push(s.lockedEdges[i]);
    }
  }
  return {
    ...s,
    outline: [...s.outline.slice(0, edgeIdx + 1), mid, ...s.outline.slice(edgeIdx + 1)],
    edgeCurves,
    lockedEdges,
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

// Batched multi-item translate — one group-drag gesture moving every selected ref at once, folded
// through a single state in ref order (so a locked wall touching one of the vertices in the batch
// is still respected, via withVertexMoved) and committed as one history entry rather than one per
// item. A "wall" ref never takes part — see the canvas for why walls are excluded from the group.
function withSelectionMoved(s: OutlineState, moves: { ref: SelectedRef; point: Point }[]): OutlineState {
  return moves.reduce((acc, { ref, point }) => {
    if (ref.kind === "vertex") return withVertexMoved(acc, Number(ref.id), point);
    if (ref.kind === "entrance") {
      const n = acc.outline.length;
      return {
        ...acc,
        entrances: acc.entrances.map((e) =>
          e.id === ref.id ? { ...e, distanceMm: projectOntoWall(acc.outline[e.wallIndex], acc.outline[(e.wallIndex + 1) % n], point) } : e,
        ),
      };
    }
    if (ref.kind === "stage") return acc.stage && acc.stage.id === ref.id ? { ...acc, stage: { ...acc.stage, x: point.x, y: point.y } } : acc;
    if (ref.kind === "bar") return { ...acc, bars: acc.bars.map((b) => (b.id === ref.id ? { ...b, x: point.x, y: point.y } : b)) };
    return acc;
  }, s);
}

// Batched multi-fixture "set" — writes an absolute {x, y, rotationDeg} to every named fixture
// (stage and/or bars) in one history entry. Group-rotating around a shared pivot is the one caller
// today: an angle lock (a snap to an absolute step, not a per-frame nudge) only makes sense against
// an absolute target, so the canvas recomputes every fixture's position fresh each frame from its
// own drag-start snapshot and the current pointer angle — via toLocalFrame/fromLocalFrame, already
// exported from geometry.ts — and this just writes the result, the same way a plain drag reports an
// absolute point every frame rather than an incremental delta.
function withFixturesSet(s: OutlineState, updates: { id: string; x: number; y: number; rotationDeg: number }[]): OutlineState {
  const byId = new Map(updates.map((u) => [u.id, u]));
  const apply = (f: Fixture): Fixture => {
    const u = byId.get(f.id);
    return u ? { ...f, x: Math.round(u.x), y: Math.round(u.y), rotationDeg: norm360(u.rotationDeg) } : f;
  };
  return { ...s, stage: s.stage ? apply(s.stage) : s.stage, bars: s.bars.map(apply) };
}

// Batched multi-item delete — every selected ref removed in one history entry. Vertices go first,
// highest index down, so removing several doesn't invalidate the indices of the others still
// queued (and refuses to drop the outline below a triangle, same as the single-vertex action);
// entrances/stage/bars are then dropped by id, which withVertexRemoved's own reindexing has
// already kept correct for whichever of them survive. A "wall" ref has no group action — nothing
// here handles that kind, so it's silently a no-op, same as it being excluded from the group up front.
function withSelectionRemoved(s: OutlineState, refs: SelectedRef[]): OutlineState {
  const vertexIdxs = refs
    .filter((r) => r.kind === "vertex")
    .map((r) => Number(r.id))
    .sort((a, b) => b - a);
  let next = vertexIdxs.reduce((acc, idx) => withVertexRemoved(acc, idx), s);
  const entranceIds = new Set(refs.filter((r) => r.kind === "entrance").map((r) => r.id));
  const barIds = new Set(refs.filter((r) => r.kind === "bar").map((r) => r.id));
  const dropStage = refs.some((r) => r.kind === "stage");
  if (entranceIds.size) next = { ...next, entrances: next.entrances.filter((e) => !entranceIds.has(e.id)) };
  if (barIds.size) next = { ...next, bars: next.bars.filter((b) => !barIds.has(b.id)) };
  if (dropStage) next = { ...next, stage: undefined };
  return next;
}

// Selection lives outside the history (nobody wants Ctrl+Z to re-select), so every restore has to
// re-validate it against the state it lands on — otherwise undoing past a vertex's creation leaves
// the inspector pointed at an index that no longer exists. A whole selection restores together:
// each ref is checked on its own, so a multi-select surviving an undo just loses the members that
// no longer resolve rather than being cleared wholesale.
export function reconcileSelection(s: OutlineState, sel: SelectedRef[]): SelectedRef[] {
  return sel.filter((ref) => {
    switch (ref.kind) {
      case "vertex":
      case "wall": {
        const i = Number(ref.id);
        return Number.isInteger(i) && i >= 0 && i < s.outline.length;
      }
      case "entrance":
        return s.entrances.some((e) => e.id === ref.id);
      case "stage":
        return !!s.stage;
      case "bar":
        return s.bars.some((b) => b.id === ref.id);
    }
  });
}

// --- history ----------------------------------------------------------------------------------
// Same {present, past, future} shape the design document already uses (lib/design-document/
// actions.ts), plus a depth cap.

interface Store {
  present: OutlineState;
  past: OutlineState[];
  future: OutlineState[];
  selected: SelectedRef[];
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
  const [store, setStore] = useState<Store>(() => ({ present: initialState(init), past: [], future: [], selected: [] }));
  const open = useRef<OpenEntry | null>(null);

  // The one way state changes. `token` names the gesture this write belongs to; null means a
  // discrete action, which always takes its own entry and closes whatever was open. `select`
  // decides the selection for the new state — by default whatever is still resolvable, which is
  // how deleting a fixture drops its own selection.
  const edit = useCallback(
    (next: (s: OutlineState) => OutlineState, token: string | null, select?: (s: OutlineState) => SelectedRef[]) => {
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

  // Replaces the whole selection — a plain click, or clearing it with []. Shift-click and marquee
  // go through toggleSelected/selectMany instead, which merge rather than replace.
  const setSelected = useCallback((refs: SelectedRef[]) => setStore((s) => (s.selected === refs ? s : { ...s, selected: refs })), []);
  const isSameRef = (a: SelectedRef, b: SelectedRef) => a.kind === b.kind && a.id === b.id;
  const toggleSelected = useCallback(
    (ref: SelectedRef) =>
      setStore((s) => ({
        ...s,
        selected: s.selected.some((r) => isSameRef(r, ref)) ? s.selected.filter((r) => !isSameRef(r, ref)) : [...s.selected, ref],
      })),
    [],
  );
  // A marquee drag's hits: additive (shift held) merges into whatever was already selected,
  // otherwise it replaces it outright — the same convention every other plan app uses.
  const selectMany = useCallback(
    (refs: SelectedRef[], additive: boolean) =>
      setStore((s) => {
        if (!additive) return { ...s, selected: refs };
        const merged = [...s.selected];
        for (const ref of refs) if (!merged.some((r) => isSameRef(r, ref))) merged.push(ref);
        return { ...s, selected: merged };
      }),
    [],
  );
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
    setStore({ present: initialState(next), past: [], future: [], selected: [] });
  }, []);

  // One group-drag gesture calling this once per pointermove still lands as a single history entry
  // (same token every frame), the way a lone drag already does for one item.
  const moveSelection = useCallback(
    (moves: { ref: SelectedRef; point: Point }[]) => edit((s) => withSelectionMoved(s, moves), "group-move"),
    [edit],
  );
  const rotateFixtureGroup = useCallback(
    (updates: { id: string; x: number; y: number; rotationDeg: number }[]) => edit((s) => withFixturesSet(s, updates), "group-rotate"),
    [edit],
  );
  const toggleWallLock = useCallback(
    (edgeIdx: number) => edit((s) => ({ ...s, lockedEdges: s.lockedEdges.map((l, i) => (i === edgeIdx ? !l : l)) }), null),
    [edit],
  );
  const removeSelection = useCallback((refs: SelectedRef[]) => edit((s) => withSelectionRemoved(s, refs), null, () => []), [edit]);

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
  const removeVertex = useCallback((idx: number) => edit((s) => withVertexRemoved(s, idx), null, () => []), [edit]);
  const insertVertexOnWall = useCallback(
    (edgeIdx: number) => edit((s) => withVertexInserted(s, edgeIdx), null, () => [{ kind: "vertex", id: String(edgeIdx + 1) }]),
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
    (entrance: Entrance) => edit((s) => ({ ...s, entrances: [...s.entrances, entrance] }), null, () => [{ kind: "entrance", id: entrance.id }]),
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

  const addStage = useCallback((stage: Fixture) => edit((s) => ({ ...s, stage }), null, () => [{ kind: "stage", id: stage.id }]), [edit]);
  const updateStage = useCallback(
    (patch: Partial<Fixture>) => edit((s) => (s.stage ? { ...s, stage: { ...s.stage, ...patch } } : s), patchToken("stage", patch)),
    [edit],
  );
  const removeStage = useCallback(() => edit((s) => ({ ...s, stage: undefined }), null), [edit]);

  const addBar = useCallback((bar: Fixture) => edit((s) => ({ ...s, bars: [...s.bars, bar] }), null, () => [{ kind: "bar", id: bar.id }]), [edit]);
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
    toggleSelected,
    selectMany,
    moveSelection,
    rotateFixtureGroup,
    removeSelection,
    toggleWallLock,
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
if (isMain(import.meta.url)) {
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
  const base: OutlineState = { mode: "edit", outline: square, edgeCurves: [null, null, null, null], lockedEdges: [false, false, false, false], entrances: [], stage: undefined, bars: [] };

  // Load-time sanitizing: pad a short/absent array out to the outline, and re-clamp a curve that
  // was saved before the bulge clamp existed.
  assert(sanitizeEdgeCurves(square, undefined).length === 4, "missing edgeCurves pad out to the outline length");
  const wild = sanitizeEdgeCurves(square, [{ c1: { x: 0, y: 78176988 }, c2: { x: 0, y: -78176988 } }]);
  assert(wild.length === 4 && wild[1] === null && wild[0] !== null, "a short saved array keeps what it had and pads the rest");
  assert(Math.hypot(wild[0]!.c1.x, wild[0]!.c1.y) <= 3000 + 1e-6, "a corrupted saved curve is re-clamped on load");
  assert(initialState({ outline: square }).mode === "edit" && initialState({ outline: [] }).mode === "draw", "mode is derived from the outline");
  assert(sanitizeLockedEdges(square, undefined).length === 4 && sanitizeLockedEdges(square, undefined).every((v) => !v), "missing lockedEdges pad out to all-unlocked");
  assert(sanitizeLockedEdges(square, [true]).join(",") === "true,false,false,false", "a short saved lock array keeps what it had and pads the rest unlocked");

  // Locked walls: dragging (or numerically reshaping) either endpoint keeps a locked wall's length.
  const oneLock = { ...base, lockedEdges: [true, false, false, false] }; // wall0 (v0→v1) locked at 1000mm
  const draggedLocked = withVertexMoved(oneLock, 1, { x: 1400, y: 300 });
  assert(Math.abs(wallLengthMm(oneLock.outline[0], draggedLocked.outline[1]) - 1000) < 1e-6, "dragging the far end of a locked wall keeps its length");
  const ownWallLocked = withEdgeReshaped(oneLock, 0, { x: 2000, y: 0 });
  assert(ownWallLocked === oneLock, "editing a locked wall's own length is refused outright");
  const neighborLocked = { ...base, lockedEdges: [false, false, true, false] }; // wall2 (v2→v3, the far side) is locked
  const guarded = withEdgeReshaped(neighborLocked, 0, { x: 1400, y: 0 });
  assert(guarded.outline[1].x === 1400 && guarded.outline[1].y === 0, "the directly-edited wall still moves its own end vertex");
  assert(guarded.outline[2].x === 1000 && guarded.outline[2].y === 1000 && guarded.outline[3].x === 0 && guarded.outline[3].y === 1000, "a locked wall two corners away survives the edit untouched, at the cost of the angle-preserving reshape");

  // Removing a corner: the two walls it joined become one straight wall, doors on either of them
  // are dropped, and every later door follows its wall's new index.
  const withDoors: OutlineState = { ...base, entrances: [door("keep", 2, 400), door("onOutgoing", 1, 100), door("onIncoming", 0, 100)] };
  const removed = withVertexRemoved(withDoors, 1);
  assert(removed.outline.length === 3 && removed.edgeCurves.length === 3, "the outline and its curves shrink together");
  assert(removed.entrances.length === 1 && removed.entrances[0].id === "keep", "doors on the two merged walls are dropped");
  assert(removed.entrances[0].wallIndex === 1, "a surviving door follows its wall's new index");
  assert(withVertexRemoved(withVertexRemoved(withDoors, 1), 0).outline.length === 3, "a triangle refuses to lose another corner");

  // A removed corner's locks travel with its curves: the merged wall starts unlocked, a surviving
  // locked wall keeps its lock after the removal shifts its index.
  const withLocks: OutlineState = { ...base, lockedEdges: [true, false, true, false] };
  const removedLocks = withVertexRemoved(withLocks, 1);
  assert(removedLocks.lockedEdges.length === 3 && removedLocks.lockedEdges[0] === false, "the merged wall starts unlocked");
  assert(removedLocks.lockedEdges[1] === true, "a surviving locked wall keeps its lock after a removal shifts its index");

  // Splitting a wall: the door stays on whichever half it falls in, later walls shift by one.
  const split = withVertexInserted({ ...base, entrances: [door("near", 0, 100), door("far", 0, 900), door("later", 2, 100)] }, 0);
  assert(split.outline.length === 5 && split.edgeCurves.length === 5, "the split adds a vertex and an edge");
  assert(split.outline[1].x === 500 && split.outline[1].y === 0, "the new vertex lands on the wall's midpoint");
  const byId = (id: string) => split.entrances.find((e) => e.id === id)!;
  assert(byId("near").wallIndex === 0 && byId("near").distanceMm === 100, "a door before the split stays on the first half");
  assert(byId("far").wallIndex === 1 && byId("far").distanceMm === 400, "a door past the split moves onto the second half");
  assert(byId("later").wallIndex === 3, "a door on a later wall shifts by one");

  // Splitting a locked wall keeps both halves locked; a later locked wall's lock follows its shift.
  const insertedLocks = withVertexInserted(withLocks, 0);
  assert(insertedLocks.lockedEdges.length === 5 && insertedLocks.lockedEdges[0] === true && insertedLocks.lockedEdges[1] === true, "splitting a locked wall keeps both halves locked");
  assert(insertedLocks.lockedEdges[3] === true, "a later locked wall's lock follows its shifted index");

  // Selection has to survive — or not survive — a restore. A whole array restores member by
  // member, so a mixed selection just loses whichever refs no longer resolve.
  const withBar: OutlineState = { ...base, bars: [{ id: "b1", label: "בר", x: 0, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 }] };
  assert(reconcileSelection(withBar, [{ kind: "bar", id: "b1" }]).length === 1, "a still-present bar keeps its selection");
  assert(reconcileSelection(base, [{ kind: "bar", id: "b1" }]).length === 0, "a bar that no longer exists clears the selection");
  assert(reconcileSelection(base, [{ kind: "vertex", id: "3" }]).length === 1, "a vertex index inside the outline is kept");
  assert(reconcileSelection(base, [{ kind: "vertex", id: "9" }]).length === 0, "a vertex index past the end is cleared");
  assert(reconcileSelection(base, [{ kind: "stage", id: "fx-stage" }]).length === 0, "a removed stage clears the selection");
  assert(reconcileSelection(withBar, [{ kind: "bar", id: "b1" }, { kind: "vertex", id: "9" }]).length === 1, "a mixed selection keeps only the refs that still resolve");

  // Batched group ops: one call moves/rotates/removes every selected ref, in one history entry.
  const withFixture: OutlineState = { ...base, bars: [{ id: "bar1", label: "בר", x: -100, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 }] };
  const groupMoved = withSelectionMoved(withFixture, [
    { ref: { kind: "vertex", id: "0" }, point: { x: 50, y: 50 } },
    { ref: { kind: "bar", id: "bar1" }, point: { x: 300, y: 300 } },
  ]);
  assert(groupMoved.outline[0].x === 50 && groupMoved.outline[0].y === 50, "a batched move updates the vertex among the selection");
  assert(groupMoved.bars[0].x === 300 && groupMoved.bars[0].y === 300, "…and the fixture in the same batch");
  const withDoor: OutlineState = { ...base, entrances: [door("d1", 0, 500)] };
  const movedDoor = withSelectionMoved(withDoor, [{ ref: { kind: "entrance", id: "d1" }, point: { x: 700, y: 50 } }]);
  assert(Math.abs(movedDoor.entrances[0].distanceMm - 700) < 1e-6, "a batched entrance move re-projects onto its own wall");

  const twoFixtures: OutlineState = {
    ...base,
    stage: { id: "fx-stage", label: "במה", x: 100, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 },
    bars: [{ id: "bar1", label: "בר", x: -100, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 }],
  };
  const wasSet = withFixturesSet(twoFixtures, [
    { id: "fx-stage", x: 0, y: 100, rotationDeg: 90 },
    { id: "bar1", x: 0, y: -100, rotationDeg: 90 },
  ]);
  assert(wasSet.stage!.x === 0 && wasSet.stage!.y === 100 && wasSet.stage!.rotationDeg === 90, "a batched fixture set writes the given absolute position and rotation");
  assert(wasSet.bars[0].x === 0 && wasSet.bars[0].y === -100, "every id in the batch is set together");
  assert(withFixturesSet(twoFixtures, [{ id: "fx-stage", x: 0, y: 0, rotationDeg: 370 }]).stage!.rotationDeg === 10, "rotation wraps into [0,360)");

  const withMany: OutlineState = { ...base, entrances: [door("d1", 0, 500)], bars: [{ id: "bar1", label: "בר", x: 0, y: 0, widthMm: 100, depthMm: 100, heightMm: 100, shape: "rect", rotationDeg: 0 }] };
  const afterGroupDelete = withSelectionRemoved(withMany, [{ kind: "entrance", id: "d1" }, { kind: "bar", id: "bar1" }]);
  assert(afterGroupDelete.entrances.length === 0 && afterGroupDelete.bars.length === 0, "a batched delete removes every selected ref in one pass");
  const triangle: OutlineState = { ...base, outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }], edgeCurves: [null, null, null], lockedEdges: [false, false, false] };
  assert(withSelectionRemoved(triangle, [{ kind: "vertex", id: "0" }, { kind: "vertex", id: "1" }]).outline.length === 3, "a batched vertex delete still refuses to drop the outline below a triangle");

  // History: push/undo/redo round-trip, the depth cap, and a redo branch dropped by a new edit.
  const moved = withVertexMoved(base, 0, { x: 50, y: 50 });
  let store: Store = { present: base, past: [], future: [], selected: [] };
  store = pushPast(store, moved);
  assert(store.present.outline[0].x === 50 && store.past.length === 1, "an edit pushes the previous state");
  store = undoStore(store);
  assert(store.present.outline[0].x === 0 && store.future.length === 1, "undo restores it and banks a redo");
  store = redoStore(store);
  assert(store.present.outline[0].x === 50 && store.future.length === 0, "redo puts it back");
  store = undoStore(store);
  store = pushPast(store, withVertexMoved(base, 0, { x: 9, y: 9 }));
  assert(store.future.length === 0, "a fresh edit drops the redo branch");
  assert(undoStore({ present: base, past: [], future: [], selected: [] }).past.length === 0, "undo at the bottom of the stack is a no-op");
  let deep: Store = { present: base, past: [], future: [], selected: [] };
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
