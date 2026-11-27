// npm run check:edge-copy — the self-check of ./edge-copy.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { StageBuild, StageStair } from "./types";
import { rectOutline } from "./stage";
import { duplicateBeside, edgeClipLabel, edgeClipOf, pasteEdgeAt } from "./edge-copy";

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
