// Items that touch on a stage side STAY touching (bug round 2026-11-21 §2.3, DECIDE 2 and 10).
//
// A side is usually covered by items standing end to end — banquette | flight | banquette. Before
// this, a flight narrowed left a gap beside it (a neighbour was cut back but never grew back, QA
// EI-6), a typed width resized about the middle and walked a flight out of its corner (EI-13), and a
// slide between two neighbours could not move at all. The rules, judged against the items as they
// stood when the press began:
//   - a WIDTH that grows cuts the flush neighbour back (shareSide, as before);
//   - a width that SHRINKS lets the flush neighbour grow to stay flush — a banquette, barrier or
//     backdrop only: a flight is quoted per stair module and never grows by itself;
//   - a SLIDE moves the joints with it — one neighbour cut, the other grown — and may push into a
//     flush neighbour down to MIN_EDGE_ITEM_MM;
//   - a TYPED width keeps the end that touches a corner fixed (a flight into a corner stays in it),
//     else the end that touches a neighbour, else — both or neither — it resizes about its middle;
//   - Alt acts on the one item alone: neighbours are still cut, never grown.
// Closed rims (a disc's) are left to shareSide and freeStretch as they were.
import type { StageBuild, StageStair } from "./types";
import { edgeKind, itemSpan, MIN_EDGE_ITEM_MM, stageSide } from "./stage";

/** Ends within this are touching (1 cm). */
export const FLUSH_MM = 10;

/** What may grow to keep a joint closed: never a flight or a ramp (they are counted per module). */
export function growsToTouch(item: StageStair): boolean {
  const k = edgeKind(item);
  return k === "bench" || k === "barrier" || k === "backdrop";
}

/** The item with its stretch set to `from`…`to` of a side `L` long. */
export function withSpan(item: StageStair, from: number, to: number, L: number): StageStair {
  const { full: _f, ...rest } = item;
  const whole = from <= 1 && to >= L - 1;
  return { ...rest, t: (from + to) / 2 / L, widthMm: Math.round(to - from), ...(whole ? { full: true } : {}) };
}

/** The items on the same open side as `item`, with their stretches. */
function mates(stage: StageBuild, item: StageStair): { it: StageStair; from: number; to: number }[] {
  const side = stageSide(stage, item.level, item.edge);
  if (!side || side.closed) return [];
  return (stage.stairs ?? [])
    .filter((it) => it.id !== item.id && it.level === item.level && stageSide(stage, it.level, it.edge)?.edge === side.edge)
    .flatMap((it) => {
      const sp = itemSpan(stage, it);
      return sp ? [{ it, from: sp.from, to: sp.to }] : [];
    });
}

/** The neighbours standing flush against each end of `item` (an open side only). */
export function flushNeighbours(stage: StageBuild, item: StageStair): { before?: StageStair; after?: StageStair } {
  const sp = itemSpan(stage, item);
  if (!sp) return {};
  const all = mates(stage, item);
  return {
    before: all.find((m) => Math.abs(m.to - sp.from) <= FLUSH_MM)?.it,
    after: all.find((m) => Math.abs(m.from - sp.to) <= FLUSH_MM)?.it,
  };
}

/** After `itemId`'s stretch changed (and shareSide cut what it now overlaps), the neighbours that
 *  were flush against it in `before` close up to it again — those that may grow (growsToTouch).
 *  `after` is the stage as it is now. Returns its items. */
export function keepTouching(after: StageBuild, itemId: string, before: readonly StageStair[]): StageStair[] {
  const items = after.stairs ?? [];
  const now = items.find((it) => it.id === itemId);
  const was = before.find((it) => it.id === itemId);
  if (!now || !was) return items;
  const side = stageSide(after, now.level, now.edge);
  if (!side || side.closed) return items;
  const sp = itemSpan(after, now);
  if (!sp) return items;
  const old = flushNeighbours({ ...after, stairs: [...before] }, was);
  const close = (id: string | undefined, end: "before" | "after"): ((it: StageStair) => StageStair) => (it) => {
    if (!id || it.id !== id || !growsToTouch(it)) return it;
    const o = itemSpan(after, it);
    if (!o) return it;
    // Only grow: shareSide has already cut whatever the item moved over.
    if (end === "before" && sp.from > o.to + 0.5) return withSpan(it, o.from, sp.from, sp.L);
    if (end === "after" && sp.to < o.from - 0.5) return withSpan(it, sp.to, o.to, sp.L);
    return it;
  };
  return items.map(close(old.before?.id, "before")).map(close(old.after?.id, "after"));
}

/** How far a slide may carry `item`: its free stretch, and — unless `alone` — on into a neighbour
 *  flush against it, down to that neighbour's least width (the joint moves with the item). */
export function slideRoom(stage: StageBuild, item: StageStair, free: { from: number; to: number }, alone: boolean): { from: number; to: number } {
  if (alone) return free;
  const side = stageSide(stage, item.level, item.edge);
  if (!side || side.closed) return free;
  const { before, after } = flushNeighbours(stage, item);
  const b = before && itemSpan(stage, before);
  const a = after && itemSpan(stage, after);
  return { from: b ? Math.min(free.from, b.from + MIN_EDGE_ITEM_MM) : free.from, to: a ? Math.max(free.to, a.to - MIN_EDGE_ITEM_MM) : free.to };
}

/** `itemId` given a typed width: the end in a corner holds, else the end against a neighbour, else
 *  (both, or neither) it resizes about its middle. Its neighbours are the caller's (shareSide, then
 *  keepTouching). Null for an unknown item or one on a closed rim (resized about its middle there). */
export function typedWidth(stage: StageBuild, itemId: string, widthMm: number): StageStair | null {
  const item = (stage.stairs ?? []).find((it) => it.id === itemId);
  if (!item) return null;
  const side = stageSide(stage, item.level, item.edge);
  const sp = itemSpan(stage, item);
  if (!side || !sp || side.closed) return null;
  const L = sp.L;
  const w = Math.max(MIN_EDGE_ITEM_MM, Math.min(L, Math.round(widthMm)));
  const n = flushNeighbours(stage, item);
  const cornerFrom = sp.from <= FLUSH_MM;
  const cornerTo = sp.to >= L - FLUSH_MM;
  let from: number;
  if (cornerFrom !== cornerTo) from = cornerFrom ? 0 : L - w;
  else if (!cornerFrom && !!n.before !== !!n.after) from = n.before ? sp.from : sp.to - w;
  else from = (sp.from + sp.to) / 2 - w / 2;
  from = Math.max(0, Math.min(L - w, from));
  return withSpan(item, from, from + w, L);
}
