import { useCallback, useEffect, useRef, useState } from "react";
import { isShortcut, isTypingTarget } from "@/lib/keyboard";
import type { EdgeCurve, Entrance, Fixture, Point } from "./hall";
import { absoluteControlPoints, bulgeToCurve, splitCubic, clampEdgeCurve, constrainVertexToLocks, edgeMidpoint, endpointFromLengthAngle, projectOntoWall, reshapeEdgeKeepingAngles, setBulgeDepth, wallAngleDeg, wallLengthMm } from "./geometry";
import { selfIntersects, squareUp } from "./stage-draw";

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

export const MAX_HISTORY = 50; // a long session must not grow the stack without bound
export const COALESCE_MS = 900; // how long an open history entry keeps accepting writes to the same target

// Older/seed halls saved before curves existed have no edgeCurves — pad to match the outline
// instead of leaving it short, or every per-edge update would map over nothing. Also re-clamp
// every curve to the current per-wall bound, in case it was ever saved before the bulge-depth
// clamp existed (that's how "עיקום" could show an absurd number).
export function sanitizeEdgeCurves(outline: Point[], edgeCurves: (EdgeCurve | null)[] | undefined): (EdgeCurve | null)[] {
  const n = outline.length;
  return Array.from({ length: n }, (_, i) => {
    const c = edgeCurves?.[i] ?? null;
    return c ? clampEdgeCurve(outline[i], outline[(i + 1) % n], c) : null;
  });
}

// Older/seed halls saved before locks existed have no lockedEdges — pad to match the outline, same
// as sanitizeEdgeCurves. Unlike a curve there's nothing to re-validate beyond the pad: a lock
// either survived the save as a plain boolean or it didn't.
export function sanitizeLockedEdges(outline: Point[], lockedEdges: boolean[] | undefined): boolean[] {
  return Array.from({ length: outline.length }, (_, i) => lockedEdges?.[i] ?? false);
}

export function initialState(init: OutlineEditorInit): OutlineState {
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
export function withVertexMoved(s: OutlineState, idx: number, p: Point): OutlineState {
  const clamped = constrainVertexToLocks(s.outline, idx, p, s.lockedEdges);
  return { ...s, outline: s.outline.map((v, i) => (i === idx ? clamped : v)) };
}

// A whole side pushed along its normal: both its ends land where the gesture puts them, and the two
// neighbouring sides lengthen or shorten to follow (the stage tool's pushSide, lib/studio/stage-draw).
// Folded through withVertexMoved one end at a time, so a locked neighbour still clamps the end it
// shares — the canvas works out the two points from where the press started and where the pointer
// is, and reports them absolutely every frame, as a vertex drag does.
//
// The side moves PARALLEL to itself and each end slides along its neighbour's own line (an offset
// side — SH-6, QA 2026-11-20): pushed straight along the normal, a hexagon's 120° corners sheared to
// 105°/136°. A neighbour square to the side (a rectangle, an L) is slid along exactly as before; one
// nearly in line with the side (no corner to slide along) takes the push as it comes.
export function withWallMoved(s: OutlineState, edgeIdx: number, a: Point, b: Point): OutlineState {
  const n = s.outline.length;
  if (n < 3 || edgeIdx < 0 || edgeIdx >= n) return s;
  const i1 = (edgeIdx + 1) % n;
  const along = (from: Point, to: Point, at: Point) => slideAlong(from, to, at, { x: b.x - a.x, y: b.y - a.y }) ?? at;
  const na = along(s.outline[(edgeIdx - 1 + n) % n], s.outline[edgeIdx], a);
  const nb = along(s.outline[(i1 + 1) % n], s.outline[i1], b);
  const moved = withVertexMoved(withVertexMoved(s, edgeIdx, na), i1, nb);
  return withOutlineReplaced(moved, moved.outline); // the neighbours changed length: re-fit their bows and doors
}

/** Where the line through `from`→`to` (a neighbouring side) meets the line through `at` running `dir`
 *  (the side moved parallel to itself). Null when the two are within 5° of parallel. */
function slideAlong(from: Point, to: Point, at: Point, dir: Point): Point | null {
  const d = { x: to.x - from.x, y: to.y - from.y };
  const den = d.x * dir.y - d.y * dir.x;
  const lens = Math.hypot(d.x, d.y) * Math.hypot(dir.x, dir.y);
  if (!lens || Math.abs(den) < Math.sin((5 * Math.PI) / 180) * lens) return null;
  const t = ((at.x - from.x) * dir.y - (at.y - from.y) * dir.x) / den;
  return { x: from.x + d.x * t, y: from.y + d.y * t };
}

/** The outline walked the other way round — side k is the old side n−k−1, its bow turned over. An
 *  involution: what one end of a side does, done to the other end. */
function reversed(s: OutlineState): OutlineState {
  const n = s.outline.length;
  const old = (k: number) => (n - k - 1 + n) % n;
  return {
    ...s,
    outline: s.outline.map((_, k) => s.outline[(n - k) % n]),
    edgeCurves: s.outline.map((_, k) => {
      const c = s.edgeCurves[old(k)];
      return c ? { c1: c.c2, c2: c.c1 } : null;
    }),
    lockedEdges: s.outline.map((_, k) => s.lockedEdges[old(k)] ?? false),
    entrances: s.entrances.map((e) => ({ ...e, wallIndex: old(e.wallIndex), distanceMm: wallLengthMm(s.outline[e.wallIndex], s.outline[(e.wallIndex + 1) % n]) - e.distanceMm })),
  };
}

/** Side `edgeIdx` typed `lengthMm` long along its own line, its START kept (or its END, `keep`). SH-5
 *  (QA 2026-11-20): on a rectangle or an L the far side is carried square, as it always was; on any
 *  other shape the moving end slides along the side alone and only the next side gives — a regular
 *  hexagon's side typed 1200 made its sides 1200/400/1200/800/800/800. */
export function withSideLength(s: OutlineState, edgeIdx: number, lengthMm: number, keep: "start" | "end" = "start"): OutlineState {
  const n = s.outline.length;
  if (keep === "end") return reversed(withSideLength(reversed(s), (n - edgeIdx - 1 + n) % n, lengthMm, "start"));
  const a = s.outline[edgeIdx];
  const b = s.outline[(edgeIdx + 1) % n];
  return withEdgeReshaped(s, edgeIdx, endpointFromLengthAngle(a, Math.max(1, lengthMm), wallAngleDeg(a, b)));
}

/** Whether the corner at the side's END is square and the side after next runs with the side — the
 *  rectangle the angle-keeping solve was written for (reshapeEdgeKeepingAngles). */
function squareAfter(outline: readonly Point[], edgeIdx: number): boolean {
  const n = outline.length;
  if (n < 4) return false;
  const dir = (i: number) => {
    const p = outline[i % n];
    const q = outline[(i + 1) % n];
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
  };
  const u = dir(edgeIdx);
  const v = dir(edgeIdx + 1);
  const w = dir(edgeIdx + 2);
  const tol = Math.sin((1 * Math.PI) / 180);
  return Math.abs(u.x * v.x + u.y * v.y) < tol && Math.abs(u.x * w.y - u.y * w.x) < tol;
}

// Closing a drawn outline. The sides were held to 45° steps while drawing, but the closing side is
// the one the designer never draws, and it comes out 2° off — so a shape whose sides are all within
// a few degrees of square is MADE square (squareUp), and corners that fell on top of each other go.
// An outline that crosses itself is not a shape anything can be cut from and is refused: closeRefusal
// says why, in the words the hint pill shows, and null when the outline may close.
export function closedOutline(outline: readonly Point[]): Point[] {
  return squareUp(outline).filter((p, i, all) => {
    const q = all[(i + 1) % all.length];
    return Math.hypot(q.x - p.x, q.y - p.y) > 1;
  });
}

export function closeRefusal(outline: readonly Point[]): string | null {
  if (outline.length < 3) return "צורה סגורה צריכה לפחות 3 נקודות";
  const clean = closedOutline(outline);
  if (clean.length < 3) return "צורה סגורה צריכה לפחות 3 נקודות שאינן באותו מקום";
  if (selfIntersects(clean)) return "הקווים חוצים זה את זה — סמנו את הפינות לפי הסדר, מסביב לצורה";
  return null;
}

// Side indices after the outline gains or loses a corner. The sides of an outline are numbered by
// their first corner, so a corner put on side k splits it into k and k+1 and shifts every later side
// up by one; a corner k taken away merges sides k−1 and k into one and shifts every later side down.
// What the indices MEAN is the caller's — the catalog uses them for the sides nobody sits at
// (MapAppearance.blockedSides), where a side's number is also a chair's place: with stale numbers a
// head table's open front moved round to its side. An index past the outline's own sides belongs to
// an added part (seatSides runs base first, then each part) and just shifts with the count.
//   • insert: a blocked side stays blocked on BOTH halves (the way a locked side's halves stay locked);
//   • remove: the two sides that merged are gone — the merged side is new geometry nobody chose.
export function sideIndicesAfterInsert(indices: readonly number[], edgeIdx: number): number[] {
  const out: number[] = [];
  for (const i of indices) {
    if (i < edgeIdx) out.push(i);
    else if (i === edgeIdx) out.push(i, i + 1);
    else out.push(i + 1);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function sideIndicesAfterRemove(indices: readonly number[], vertexIdx: number, n: number): number[] {
  if (n <= 3) return [...indices];
  const incoming = (vertexIdx - 1 + n) % n; // the side that ENDS at the corner
  const out: number[] = [];
  for (const i of indices) {
    if (i === vertexIdx || i === incoming) continue;
    out.push(i < vertexIdx ? i : i - 1);
  }
  return [...new Set(out)].sort((a, b) => a - b);
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
export function withEdgeReshaped(s: OutlineState, edgeIdx: number, newB: Point): OutlineState {
  if (s.lockedEdges[edgeIdx]) return s;
  const n = s.outline.length;
  const bIdx = (edgeIdx + 1) % n;
  const cIdx = (edgeIdx + 2) % n;
  // Only where the shape is a rectangle there (SH-5): elsewhere the end moves alone.
  const solved = squareAfter(s.outline, edgeIdx) ? reshapeEdgeKeepingAngles(s.outline, edgeIdx, newB) : null;
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
export function withVertexRemoved(s: OutlineState, idx: number): OutlineState {
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
/** A point added on side `edgeIdx` at `t` along it (its middle by default — the bar's button; where
 *  it was double-clicked — connected drawings §5.1). A bowed side is cut by de Casteljau, so both
 *  halves draw the curve that was there. Exported for its self-check. */
export function withVertexInserted(s: OutlineState, edgeIdx: number, t = 0.5): OutlineState {
  const n = s.outline.length;
  const a = s.outline[edgeIdx];
  const b = s.outline[(edgeIdx + 1) % n];
  const curve = s.edgeCurves[edgeIdx] ?? null;
  let mid: Point;
  let halves: [EdgeCurve | null, EdgeCurve | null] = [null, null];
  if (curve) {
    const { c1, c2 } = absoluteControlPoints(a, b, curve);
    const { left, right } = splitCubic([a, c1, c2, b], t);
    mid = left[3];
    halves = [
      { c1: { x: left[1].x - a.x, y: left[1].y - a.y }, c2: { x: left[2].x - mid.x, y: left[2].y - mid.y } },
      { c1: { x: right[1].x - mid.x, y: right[1].y - mid.y }, c2: { x: right[2].x - b.x, y: right[2].y - b.y } },
    ];
  } else {
    mid = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  const len = wallLengthMm(a, b);
  const firstLen = wallLengthMm(a, mid);
  const secondLen = wallLengthMm(mid, b);
  const edgeCurves: (EdgeCurve | null)[] = [];
  const lockedEdges: boolean[] = [];
  for (let i = 0; i < n; i++) {
    if (i === edgeIdx) {
      edgeCurves.push(halves[0], halves[1]); // the two halves of the side, its bow kept
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
        // A door's distance is along the chord; its fraction is the side's parameter, mapped onto its half.
        const u = len > 0 ? e.distanceMm / len : 0;
        return u < t ? { ...e, distanceMm: (u / t) * firstLen } : { ...e, wallIndex: edgeIdx + 1, distanceMm: ((u - t) / (1 - t)) * secondLen };
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
export function withSelectionMoved(s: OutlineState, moves: { ref: SelectedRef; point: Point }[]): OutlineState {
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
export function withFixturesSet(s: OutlineState, updates: { id: string; x: number; y: number; rotationDeg: number }[]): OutlineState {
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
export function withSelectionRemoved(s: OutlineState, refs: SelectedRef[]): OutlineState {
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

export interface Store {
  present: OutlineState;
  past: OutlineState[];
  future: OutlineState[];
  selected: SelectedRef[];
}

export function pushPast(store: Store, present: OutlineState): Store {
  const past = [...store.past, store.present];
  return { ...store, present, past: past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past, future: [] };
}

export function undoStore(store: Store): Store {
  if (store.past.length === 0) return store;
  const previous = store.past[store.past.length - 1];
  return { present: previous, past: store.past.slice(0, -1), future: [store.present, ...store.future], selected: reconcileSelection(previous, store.selected) };
}

export function redoStore(store: Store): Store {
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
export function continuesEntry(open: OpenEntry | null, token: string | null, now: number): boolean {
  return token !== null && open !== null && open.token === token && now - open.at < COALESCE_MS;
}

export const patchToken = (prefix: string, patch: object) => `${prefix}:${Object.keys(patch).join(",")}`;

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
  // Squares the near-square (closedOutline) and refuses a self-crossing outline outright — the host
  // asks closeRefusal first and shows its message; this is the belt under that.
  const closeOutline = useCallback(
    () =>
      edit((s) => {
        if (closeRefusal(s.outline)) return s;
        const outline = closedOutline(s.outline);
        return { ...s, mode: "edit", outline, edgeCurves: outline.map(() => null), lockedEdges: outline.map(() => false) };
      }, null),
    [edit],
  );
  const moveVertex = useCallback((idx: number, p: Point) => edit((s) => withVertexMoved(s, idx, p), `vertex:${idx}`), [edit]);
  // A side pushed along its normal — one gesture, one entry, like a vertex drag.
  const moveWall = useCallback((edgeIdx: number, a: Point, b: Point) => edit((s) => withWallMoved(s, edgeIdx, a, b), `wall:${edgeIdx}:push`), [edit]);
  // The corner is gone and every index after it has shifted — the old selection can't be remapped
  // to anything the user meant, so it goes.
  const removeVertex = useCallback((idx: number) => edit((s) => withVertexRemoved(s, idx), null, () => []), [edit]);
  const insertVertexAt = useCallback(
    (edgeIdx: number, t: number) => edit((s) => withVertexInserted(s, edgeIdx, t), null, () => [{ kind: "vertex", id: String(edgeIdx + 1) }]),
    [edit],
  );
  const insertVertexOnWall = useCallback((edgeIdx: number) => insertVertexAt(edgeIdx, 0.5), [insertVertexAt]);
  const moveWallHandle = useCallback(
    (edgeIdx: number, which: "bulge" | "c1" | "c2", p: Point) => edit((s) => withWallHandleMoved(s, edgeIdx, which, p), `wall:${edgeIdx}:${which}`),
    [edit],
  );

  // Numeric wall editing: length/angle move the wall's end vertex through the same transform a
  // drag would use; bulge depth writes through the same edgeCurves.
  // `keep` — which end of the side stays where it is (SH-5): its start, as always, or its end.
  const setWallLength = useCallback(
    (edgeIdx: number, meters: number, keep: "start" | "end" = "start") =>
      edit((s) => (s.lockedEdges[edgeIdx] ? s : withSideLength(s, edgeIdx, meters * 1000, keep)), `wallLength:${edgeIdx}`),
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
      // By the physical key, as use-history: on a Hebrew layout Ctrl+Z arrives as "ז", and undo
      // while drawing a shape silently did nothing.
      if (isShortcut(e, "z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (isShortcut(e, "y")) {
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
    moveWall,
    removeVertex,
    insertVertexOnWall,
    insertVertexAt,
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
