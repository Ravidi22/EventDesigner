// ONE stair, banquette, barrier, backdrop or ramp copied off its stage — not the stage it stands on.
//
// An edge item has no place of its own on the plan: it is a stretch of one side of one stage
// (StageStair: edge + t + widthMm). So its copy is everything but WHERE (an EdgeClip), and a paste is
// a place on a side: beside the original (duplicateBeside — Ctrl+D, the quick bar's copy button) or
// where the designer clicks (pasteEdgeAt — Ctrl+V arms the stage's lit sides). Both hand back a
// StageStair that the caller puts through placeEdgeItem (a side too close to a wall takes it inside)
// and shareSide (it never stands through another item), exactly as a click from the bar's "+" does.
//
// QA 2026-11-21 EI-3/EI-5: Ctrl+C with a banquette picked copied the WHOLE stage, Ctrl+X cut it, and
// an item's bar had no copy at all.

import type { StageBuild, StageStair } from "./types";
import { edgeKind, itemSpan, MIN_EDGE_ITEM_MM, rectOutline, sidePosition, stageSide } from "./stage";
import { isMain } from "../self-check";

/** What a copied edge item carries: its kind, width and spec — everything but where it stood. */
export type EdgeClip = Omit<StageStair, "id" | "edge" | "t" | "level" | "full">;

/** `item` as a clip. A "whole side" item is copied at the width it has there. */
export function edgeClipOf(stage: StageBuild, item: StageStair): EdgeClip {
  const sp = itemSpan(stage, item);
  const { id: _id, edge: _edge, t: _t, level: _level, full: _full, ...rest } = item;
  return { ...rest, widthMm: sp ? Math.round(sp.to - sp.from) : item.widthMm };
}

const KIND_WORD: Record<string, string> = { stairs: "מדרגות", bench: "בנקט", barrier: "מחסום", backdrop: "קיר רקע", ramp: "רמפה" };

/** "בנקט 2.40 מ׳" — what a copy or a paste of `clip` says it did. */
export function edgeClipLabel(clip: EdgeClip): string {
  return `${KIND_WORD[edgeKind(clip)] ?? "פריט"} ${(clip.widthMm / 1000).toFixed(2)} מ׳`;
}

interface Span {
  from: number;
  to: number;
}

/** The items on the side `edge` belongs to (same level), each read as a span along it. */
function sideSpans(stage: StageBuild, level: string | undefined, sideEdge: number): { item: StageStair; span: Span }[] {
  const out: { item: StageStair; span: Span }[] = [];
  for (const it of stage.stairs ?? []) {
    if (it.level !== level || stageSide(stage, it.level, it.edge)?.edge !== sideEdge) continue;
    const sp = itemSpan(stage, it);
    if (sp) out.push({ item: it, span: { from: sp.from, to: sp.to } });
  }
  return out;
}

/** What of [lo, hi] no span covers. On a closed side every span is laid on the lap that meets the
 *  window (and its spill past the end wrapped to the start). */
function freeIn(lo: number, hi: number, spans: Span[], L: number, closed: boolean): Span[] {
  const taken: Span[] = [];
  for (const s of spans) {
    if (!closed) {
      taken.push(s);
      continue;
    }
    const f = lo + ((((s.from - lo) % L) + L) % L);
    const t = f + (s.to - s.from);
    taken.push({ from: f, to: Math.min(t, hi) });
    if (t > hi) taken.push({ from: lo, to: lo + (t - hi) });
  }
  taken.sort((a, b) => a.from - b.from);
  const free: Span[] = [];
  let at = lo;
  for (const s of taken) {
    if (s.from > at + 1) free.push({ from: at, to: Math.min(s.from, hi) });
    at = Math.max(at, s.to);
  }
  if (hi > at + 1) free.push({ from: at, to: hi });
  return free.filter((s) => s.to - s.from > 1);
}

const wrapT = (mid: number, L: number) => ((((mid % L) + L) % L) / L);

/** A copy of `itemId` FLUSH beside it on its own side — toward the larger free stretch that touches
 *  it — at its width, or as much of it as that stretch has. With nothing free against it: the largest
 *  free stretch elsewhere on the side, at its end nearest the original. Null when the side has no
 *  stretch of MIN_EDGE_ITEM_MM free: the caller says so rather than putting it somewhere else. */
export function duplicateBeside(stage: StageBuild, itemId: string, newId: string): StageStair | null {
  const item = (stage.stairs ?? []).find((it) => it.id === itemId);
  const side = item && stageSide(stage, item.level, item.edge);
  const sp = item && itemSpan(stage, item);
  if (!item || !side || !sp) return null;
  const L = side.L;
  const w = sp.to - sp.from;
  const others = sideSpans(stage, item.level, side.edge)
    .filter((x) => x.item.id !== item.id)
    .map((x) => x.span);
  // An open side is read along itself; a closed one from the original's far end round to its near
  // end, so "after" and "before" are the two stretches that touch it.
  const lo = side.closed ? sp.to : 0;
  const hi = side.closed ? sp.from + L : L;
  const free = freeIn(lo, hi, side.closed ? others : [...others, sp], L, side.closed);
  const after = free.find((s) => Math.abs(s.from - sp.to) <= 1);
  const before = free.find((s) => Math.abs(s.to - (side.closed ? sp.from + L : sp.from)) <= 1);
  const len = (s?: Span) => (s ? s.to - s.from : 0);
  let span: Span | null = null;
  if (Math.max(len(after), len(before)) >= MIN_EDGE_ITEM_MM) {
    if (len(after) >= len(before)) span = { from: after!.from, to: after!.from + Math.min(w, len(after)) };
    else span = { from: before!.to - Math.min(w, len(before)), to: before!.to };
  } else {
    const best = free.filter((s) => len(s) >= MIN_EDGE_ITEM_MM).sort((a, b) => len(b) - len(a))[0];
    if (best) {
      const ww = Math.min(w, len(best));
      span = best.to <= sp.from + 1 ? { from: best.to - ww, to: best.to } : { from: best.from, to: best.from + ww };
    }
  }
  if (!span) return null;
  return {
    ...edgeClipOf(stage, item),
    id: newId,
    ...(item.level ? { level: item.level } : {}),
    edge: side.edge,
    t: wrapT((span.from + span.to) / 2, L),
    widthMm: Math.round(span.to - span.from),
  };
}

/** `clip` put where the designer clicked: `edge`/`t` as the lit side reports the click. In a bare
 *  stretch it keeps its width (or takes the stretch, when that is shorter), slid to stay inside it;
 *  over another item it stands centred on the click at its own width, and the caller's shareSide
 *  makes the other give way — the same as a fresh item clicked there. */
export function pasteEdgeAt(stage: StageBuild, clip: EdgeClip, level: string | undefined, edge: number, t: number, id: string): StageStair | null {
  const pos = sidePosition(stage, level, edge, t);
  const side = stageSide(stage, level, pos.edge);
  if (!side) return null;
  const L = side.L;
  const at = pos.t * L;
  const spans = sideSpans(stage, level, side.edge).map((x) => x.span);
  const free = freeIn(0, L, spans, L, side.closed);
  const gap = free.find((s) => at >= s.from - 1 && at <= s.to + 1);
  let ww = Math.min(clip.widthMm, L);
  let mid = at;
  if (gap) ww = Math.min(ww, gap.to - gap.from);
  const lo = gap ? gap.from : side.closed ? -Infinity : 0;
  const hi = gap ? gap.to : side.closed ? Infinity : L;
  mid = Math.max(lo + ww / 2, Math.min(hi - ww / 2, mid));
  return { ...clip, id, ...(level ? { level } : {}), edge: side.edge, t: wrapT(mid, L), widthMm: Math.round(ww) };
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 0.002) => Math.abs(a - b) <= tol;
  // A 6 × 3 m stage, its front (edge 0) along the top: banquette | flight | banquette, end to end,
  // and a banquette down edge 1.
  const benchSpec = { back: { kind: "chairs" as const }, front: { kind: "sofa" as const, widthMm: 1200 } };
  const full: StageStair[] = [
    { id: "L", kind: "bench", edge: 0, t: 0.2, widthMm: 2400, bench: benchSpec },
    { id: "S", kind: "stairs", edge: 0, t: 0.5, widthMm: 1200, risers: 3 },
    { id: "R", kind: "bench", edge: 0, t: 0.8, widthMm: 2400 },
    { id: "E", kind: "bench", edge: 1, t: 0.5, widthMm: 3000 },
  ];
  const stage = (stairs: StageStair[]): StageBuild => ({ outline: rectOutline(6000, 3000), front: 0, decks: [], stairs });

  // The clip: kind, width and spec — never where it stood.
  const clip = edgeClipOf(stage(full), full[0]);
  assert(clip.kind === "bench" && clip.widthMm === 2400 && clip.bench === benchSpec, "a banquette's clip keeps its kind, width and both sides");
  assert(!("id" in clip) && !("edge" in clip) && !("t" in clip), "…and nothing of where it stood");
  assert(edgeClipLabel(clip) === "בנקט 2.40 מ׳", "a clip says what it is");
  const wholeSide = edgeClipOf(stage([{ id: "W", kind: "stairs", edge: 2, t: 0.5, widthMm: 1000, full: true }]), { id: "W", kind: "stairs", edge: 2, t: 0.5, widthMm: 1000, full: true });
  assert(wholeSide.widthMm === 6000 && !("full" in wholeSide), "a whole-side flight is copied at the width it has there");

  // Duplicate beside: no room on a covered side.
  assert(duplicateBeside(stage(full), "S", "S2") === null, "a flight between two banquettes has nowhere beside it");
  // With the right banquette gone, the copy stands flush after the flight, at the flight's width.
  const noRight = full.filter((it) => it.id !== "R");
  const d1 = duplicateBeside(stage(noRight), "S", "S2")!;
  assert(d1 && d1.edge === 0 && near(d1.t, 0.7) && d1.widthMm === 1200 && d1.risers === 3, "…the copy goes flush after it, the same flight");
  // A banquette with the stretch after it taken but a stretch further along free: there, at its end
  // nearest the original.
  const d2 = duplicateBeside(stage(noRight), "L", "L2")!;
  assert(d2 && near(d2.t, 0.8) && d2.widthMm === 2400 && d2.bench === benchSpec, "with nothing free against it, the largest free stretch on the side");
  // Less room than its width: as much as there is, flush.
  const tight = [{ ...full[0] }, { ...full[1] }, { id: "R", kind: "bench" as const, edge: 0, t: (3600 + 800 + 1600 / 2) / 6000, widthMm: 1600 }];
  const d3 = duplicateBeside(stage(tight), "S", "S2")!;
  assert(d3 && d3.widthMm === 800 && near(d3.t, 4000 / 6000), "less room than its width beside it: it takes what there is");
  // A side with room on both sides of the original: the larger.
  const alone = [{ id: "A", kind: "stairs" as const, edge: 2, t: 0.25, widthMm: 1000 }];
  const d4 = duplicateBeside(stage(alone), "A", "A2")!;
  assert(d4 && near(d4.t, 2500 / 6000), "room both ways: toward the larger stretch (after it)");
  const d5 = duplicateBeside(stage([{ id: "A", kind: "stairs", edge: 2, t: 0.75, widthMm: 1000 }]), "A", "A2")!;
  assert(d5 && near(d5.t, 3500 / 6000), "…and before it when that one is larger");

  // Paste where clicked: a bare side keeps the clip's width, slid inside the side.
  const p1 = pasteEdgeAt(stage(full), clip, undefined, 2, 0.5, "P")!;
  assert(p1.edge === 2 && near(p1.t, 0.5) && p1.widthMm === 2400 && p1.bench === benchSpec, "pasted on a bare side at the click, at its own width");
  const p2 = pasteEdgeAt(stage(full), clip, undefined, 2, 0.02, "P")!;
  assert(near(p2.t, 0.2), "…clicked near a corner, slid in so it stays on the side");
  // A short bare stretch: it takes the stretch.
  const p3 = pasteEdgeAt(stage(tight), clip, undefined, 0, (4000) / 6000, "P")!;
  assert(p3.widthMm === 800 && near(p3.t, 4000 / 6000), "in a bare stretch shorter than itself it takes the stretch");
  // Over another item: its own width, centred on the click (shareSide does the rest).
  const p4 = pasteEdgeAt(stage(full), { kind: "stairs", widthMm: 1000 }, undefined, 0, 0.2, "P")!;
  assert(p4.widthMm === 1000 && near(p4.t, 0.2), "over another item it stands where clicked at its own width");
  console.log("edge-copy self-check passed");
}
