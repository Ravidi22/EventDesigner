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
import { edgeKind, itemSpan, MIN_EDGE_ITEM_MM, rectOutline, stageSide } from "./stage";
import { isMain } from "../self-check";

/** Ends within this are touching (1 cm). */
export const FLUSH_MM = 10;

/** What may grow to keep a joint closed: never a flight or a ramp (they are counted per module). */
export function growsToTouch(item: StageStair): boolean {
  const k = edgeKind(item);
  return k === "bench" || k === "barrier" || k === "backdrop";
}

/** The item with its stretch set to `from`…`to` of a side `L` long. */
function withSpan(item: StageStair, from: number, to: number, L: number): StageStair {
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

// Self-check. Run: npm run check:edge-touch
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  // A 6 × 3 m stage, its front (edge 0, 6 m): banquette A | flight S | banquette B, end to end.
  const stage = (stairs: StageStair[]): StageBuild => ({ outline: rectOutline(6000, 3000), front: 0, decks: [], stairs }) as StageBuild;
  const A: StageStair = { id: "A", kind: "bench", edge: 0, t: 0.2, widthMm: 2400 };
  const S: StageStair = { id: "S", kind: "stairs", edge: 0, t: 0.5, widthMm: 1200 };
  const B: StageStair = { id: "B", kind: "bench", edge: 0, t: 0.8, widthMm: 2400 };
  const row = [A, S, B];
  const spanOf = (items: StageStair[], id: string) => {
    const it = items.find((x) => x.id === id)!;
    const sp = itemSpan(stage(items), it)!;
    return [Math.round(sp.from), Math.round(sp.to)].join("…");
  };
  const cut = (items: StageStair[], id: string) => {
    // shareSide's part, for the fixture: what overlaps the item is cut back.
    const it = items.find((x) => x.id === id)!;
    const sp = itemSpan(stage(items), it)!;
    return items.flatMap((x) => {
      if (x.id === id) return [x];
      const o = itemSpan(stage(items), x)!;
      if (o.to <= sp.from + 0.5 || o.from >= sp.to - 0.5) return [x];
      const from = o.from < sp.from ? o.from : sp.to;
      const to = o.from < sp.from ? sp.from : o.to;
      return to - from >= MIN_EDGE_ITEM_MM ? [withSpan(x, from, to, 6000)] : [];
    });
  };
  const apply = (items: StageStair[], next: StageStair, alone = false) => {
    const moved = cut(items.map((x) => (x.id === next.id ? next : x)), next.id);
    return alone ? moved : keepTouching(stage(moved), next.id, items);
  };

  // Typed narrower between two flush banquettes: about its middle, both banquettes grow back (EI-6).
  const narrow = apply(row, typedWidth(stage(row), "S", 600)!);
  assert(spanOf(narrow, "S") === "2700…3300" && spanOf(narrow, "A") === "0…2700" && spanOf(narrow, "B") === "3300…6000", "a flight typed 60 cm between two banquettes: about its middle, both banquettes close up to it");
  // Typed wider: both cut.
  const wide = apply(row, typedWidth(stage(row), "S", 1800)!);
  assert(spanOf(wide, "S") === "2100…3900" && spanOf(wide, "A") === "0…2100" && spanOf(wide, "B") === "3900…6000", "…typed 1.8 m: both cut back");
  // Alt: the neighbours are left as they were.
  const alone = apply(row, typedWidth(stage(row), "S", 600)!, true);
  assert(spanOf(alone, "A") === "0…2400" && spanOf(alone, "B") === "3600…6000", "Alt: a narrower flight leaves its neighbours where they were");

  // A flight in the CORNER keeps its corner (EI-13), and the banquette beside it follows.
  const corner = [{ ...S, t: 0.1 }, { ...B, t: 0.6, widthMm: 4800 }];
  const cornered = apply(corner, typedWidth(stage(corner), "S", 800)!);
  assert(spanOf(cornered, "S") === "0…800" && spanOf(cornered, "B") === "800…6000", "a corner flight typed narrower stays in its corner; the banquette grows to it");
  // One neighbour, no corner: that end holds.
  const lone = [A, { ...S, t: 0.5 }];
  assert(spanOf([typedWidth(stage(lone), "S", 600)!], "S") === "2400…3000", "a flight flush against one banquette keeps that end");

  // A slide between flush neighbours moves the joints: one cut, the other grown.
  const slid = apply(row, { ...S, t: 3300 / 6000 });
  assert(spanOf(slid, "S") === "2700…3900" && spanOf(slid, "A") === "0…2700" && spanOf(slid, "B") === "3900…6000", "a flight slid 30 cm between two banquettes: both joints move with it");
  const room = slideRoom(stage(row), S, { from: 2400, to: 3600 }, false);
  assert(room.from === 300 && room.to === 5700, "…and it may slide into either down to the neighbour's 30 cm");
  assert(slideRoom(stage(row), S, { from: 2400, to: 3600 }, true).from === 2400, "Alt: held by its neighbours, as before");

  // A flight never grows to close a joint.
  const stairsRow = [{ ...A, kind: "stairs" as const }, S, B];
  const shrunk = apply(stairsRow, typedWidth(stage(stairsRow), "S", 600)!);
  assert(spanOf(shrunk, "A") === "0…2400" && spanOf(shrunk, "B") === "3300…6000", "a flight beside it does not grow; the banquette on the other side does");
  console.log("edge-touch self-check passed");
}
