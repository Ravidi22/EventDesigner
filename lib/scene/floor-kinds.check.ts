// npm run check:floor-kinds — the self-check of ./floor-kinds.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Footprint } from "@/lib/studio/footprint";
import { footprintOutlines, resolveFootprint } from "@/lib/studio/footprint";
import type { Point } from "@/lib/studio/hall";
import { flatRing, signedDistance } from "@/lib/studio/label-anchor";
import { BOTTLE_PITCH_MM, barDrawing } from "@/lib/catalog/bar-draw";
import { DEFAULT_TONE } from "@/components/item-symbol";
import { benchLayout, benchLayoutFor } from "@/lib/design-document/bench";
import { FALLBACK_CHAIR, chairRowsLayout } from "@/lib/design-document/chair-rows";
import { CHUPPAH_PROFILES } from "@/lib/catalog/chuppah";
import type { ItemBuild } from "./collect";
import { type ItemContext } from "./item-context";
import { treeParts } from "./plants";
import { BILLIARD_POCKET } from "@/lib/catalog/game-tables";
import { ENVELOPE } from "./materials";
import { type Part } from "./types";
import { BATTEN_MM, chairRowsBody, floorKindBody, GATE_VOUSSOIRS, POSY_SHARE, profileBowls, rad, rugBody, SHEER_OPACITY, SLAT_H_MM } from "./floor-kinds";

// ponytail: self-check. Run: npm run check:floor-kinds
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const ctxOf = (footprint: Footprint, heightMm: number, tone: string, extra: Partial<ItemContext> = {}): ItemContext => {
  const w = footprint.kind === "circle" ? footprint.diameterMm : footprint.kind === "rect" || footprint.kind === "ellipse" ? footprint.widthMm : 0;
  const d = footprint.kind === "circle" ? footprint.diameterMm : footprint.kind === "rect" || footprint.kind === "ellipse" ? footprint.depthMm : 0;
  return { product: undefined, resolved: undefined, footprint, widthMm: w, depthMm: d, heightMm, tone: tone.toLowerCase(), count: 1, author: false, ...extra };
};
const top = (p: Part) => (p.shape === "box" || p.shape === "cylinder" || p.shape === "extrude" || p.shape === "ribbon" ? p.at.z + p.h : p.shape === "sphere" ? p.at.z + p.r : p.shape === "lathe" ? Math.max(...p.profile.map((q) => q.z)) + p.at.z : p.at.z);
const boxes = (b: ItemBuild) => b.parts.filter((p): p is Extract<Part, { shape: "box" }> => p.shape === "box");
const cyls = (b: ItemBuild) => b.parts.filter((p): p is Extract<Part, { shape: "cylinder" }> => p.shape === "cylinder");

// A sofa 2000×900×800: the back reaches 800 along −y, two arms to 0.65 h, and — by the plan's
// own count, round((2000 − 2·230)/650) — two cushions with their tops at 450.
const sofa = floorKindBody("sofa", ctxOf({ kind: "rect", widthMm: 2000, depthMm: 900 }, 800, DEFAULT_TONE.sofa));
assert(boxes(sofa).some((p) => p.at.y < 0 && near(top(p), 800) && p.w === 2000), "sofa: the back reaches 800 along −y");
const arms = boxes(sofa).filter((p) => near(top(p), 520) && Math.abs(p.at.x) > 800);
assert(arms.length === 2 && near(arms[0].w, 230), `sofa: two arms min(0.13 w, 230, 0.3 d) wide to 0.65 h (${arms.length})`);
const cushions = boxes(sofa).filter((p) => near(top(p), 450));
assert(cushions.length === Math.max(1, Math.round((2000 - 460) / 650)) && cushions.length === 2, `sofa: round((w − 2·arm)/650) cushions at 450 (${cushions.length})`);
assert(boxes(floorKindBody("sofa", ctxOf({ kind: "rect", widthMm: 2400, depthMm: 900 }, 800, DEFAULT_TONE.sofa))).filter((p) => near(top(p), 450)).length === 3, "sofa: a 2.4 m one has three");
assert(floorKindBody("sofa", ctxOf({ kind: "circle", diameterMm: 600 }, 450, DEFAULT_TONE.sofa)).parts.some((p) => p.shape === "cylinder" && p.rBottom === 300), "a round sofa is a pouf");

// A banquette 3000×450, nobody's spec: the strip's top at 750, five chairs behind it (−y) facing it.
const bench = floorKindBody("bench", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 450 }, 750, DEFAULT_TONE.bench, { bench: benchLayout(3000, 450) }));
assert(boxes(bench).some((p) => p.w === 3000 && near(top(p), 750)), "bench: the strip's top at 750");
assert(bench.instanced.length === 5 && bench.instanced.every((r) => r.at.at.y < 0 && near(r.at.rotationDeg, 0) && r.key.startsWith("chair:dining:")), "bench: five dining chairs behind it, unturned (their front is +y, at the strip)");
const sofaBench = floorKindBody("bench", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 600 }, 750, DEFAULT_TONE.bench, { bench: benchLayout(3000, 600, { front: { kind: "sofa" } }) }));
assert(boxes(sofaBench).filter((p) => near(top(p), 460) && p.at.y > 0).length === 5, "bench: a sofa front is five cushions at 460 on the +y half");
assert(bench.parts.every((p) => top(p) <= 750 + 1e-9), "bench: nothing above its top but the chairs");
// QA BQ-4: a typed sofa run (2.4 m) and seat (20 cm) on a 6 m banquette with chairs behind — the
// backrest at the seat's inner line along the run, no table slab or leg over the cushions.
const typedLay = benchLayout(6000, 600, { back: { kind: "chairs" }, front: { kind: "sofa", widthMm: 2400, depthMm: 200 } });
const typed = floorKindBody("bench", ctxOf({ kind: "rect", widthMm: 6000, depthMm: 600 }, 750, DEFAULT_TONE.bench, { bench: typedLay }));
const cushionBoxes = boxes(typed).filter((p) => near(top(p), 460));
assert(cushionBoxes.length === 4 && cushionBoxes.every((p) => p.at.y - p.d / 2 >= 100 - 1 && Math.abs(p.at.x) <= 1200), `bench: four cushions on the typed run and seat (${cushionBoxes.length})`);
const overCushions = boxes(typed).filter((p) => top(p) > 460 + 1 && p.at.y + p.d / 2 > 100 + 1 && Math.abs(p.at.x) - p.w / 2 < 1200 - 1);
assert(overCushions.length === 0, `bench: nothing rises over the cushions (${overCushions.map((p) => `${p.w}×${p.d}@${p.at.y}`).join(" ")})`);
const backrest = boxes(typed).find((p) => near(top(p), 460 + 400));
assert(!!backrest && near(backrest.at.y + backrest.d / 2, 100) && near(backrest.w, 2400), "bench: the backrest stands right behind the seat's inner line, along the run");
// QA BQ-10: a sofa nobody eats at has no 75 cm slab — its back is solid.
const lone = floorKindBody("bench", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 450 }, 750, DEFAULT_TONE.bench, { bench: benchLayout(3000, 450, { back: { kind: "sofa" } }) }));
assert(!boxes(lone).some((p) => near(top(p), 750)), "bench: a sofa alone gets no table slab");
// QA BQ-5: a SHAPED banquette (a crescent) with a sofa side — its outline only to the seat under
// the cushions, the chairs' table and the backrest raised along its spine; never one 75 cm solid.
const arcPts: Point[] = [];
for (let k = 0; k <= 24; k++) arcPts.push({ x: 3000 * Math.cos(Math.PI - (Math.PI * k) / 24), y: -3000 * Math.sin(Math.PI - (Math.PI * k) / 24) });
for (let k = 24; k >= 0; k--) arcPts.push({ x: 2400 * Math.cos(Math.PI - (Math.PI * k) / 24), y: -2400 * Math.sin(Math.PI - (Math.PI * k) / 24) });
const crescentFp: Footprint = { kind: "custom", outline: arcPts };
const crescentLay = benchLayoutFor(crescentFp, { back: { kind: "chairs" }, front: { kind: "sofa" } });
const crescentBody = floorKindBody("bench", ctxOf(crescentFp, 750, DEFAULT_TONE.bench, { bench: crescentLay }));
const extrudes = crescentBody.parts.filter((p) => p.shape === "extrude");
assert(extrudes.some((p) => near(top(p), 460 - 120)) && !extrudes.some((p) => p.shape === "extrude" && p.outline.outline.length === arcPts.length && near(top(p), 750)), "bench: a crescent with a sofa stands to the seat under its cushions, not one solid at 75 cm");
assert(extrudes.some((p) => near(top(p), 750)) && extrudes.some((p) => near(top(p), 460 + 400)), "…its chairs' table and its backrest raised along the band");

// A column ⌀500 × 3000: the shaft 0.74 R, sixteen flutes, the capital reaching 3000.
const column = floorKindBody("column", ctxOf({ kind: "circle", diameterMm: 500 }, 3000, DEFAULT_TONE.column));
assert(cyls(column).some((p) => near(p.rBottom, 185) && near(p.at.z, 360) && near(top(p), 2640)), "column: the shaft 0.74 R from the plinth to 0.88 h");
assert(cyls(column).filter((p) => near(p.rBottom, 20)).length === 16, "column: sixteen flutes");
assert(column.parts.some((p) => p.shape === "lathe" && near(top(p), 3000) && p.profile[p.profile.length - 1].r === 250), "column: the capital flares to R at h");
assert(column.parts[0].shape === "extrude" && near(column.parts[0].h, 360), "column: the plinth is the footprint 0.12 h high");

// A fountain ⌀2000: water at 300 inside a basin 350 high, one splash.
const fountain = floorKindBody("fountain", ctxOf({ kind: "circle", diameterMm: 2000 }, 1500, DEFAULT_TONE.fountain));
assert(fountain.parts.some((p) => p.shape === "plane" && near(p.at.z, 300) && p.material?.kind === "water"), "fountain: a water plane at 300");
assert(fountain.parts.some((p) => p.shape === "extrude" && p.h === 350 && (p.holes?.length ?? 0) === 1), "fountain: the basin is a wall round a well");
assert(fountain.emitters.length === 1 && fountain.emitters[0].strength === 0.6 && near(fountain.emitters[0].radiusMm, 100), "fountain: one spout, 0.1 R");
assert(fountain.parts.some((p) => p.shape === "lathe" && p.profile.some((q) => near(q.r, 420))), "fountain: a bowl 0.42 R");

// An arch 3000×600×2500: two feet to 2250, the span across them, the garland in flowers.
const arch = floorKindBody("arch", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 600 }, 2500, DEFAULT_TONE.arch));
const feet = boxes(arch).filter((p) => p.w === 600 && p.d === 600 && near(top(p), 2250));
assert(feet.length === 2 && feet.every((p) => near(Math.abs(p.at.x), 1200)), `arch: two feet min(D, 0.2 L) square to 0.9 h (${feet.length})`);
assert(boxes(arch).some((p) => near(p.at.z, 2250) && near(p.d, 228) && p.w === 2400), "arch: the span D·0.38 deep across the feet");
assert(arch.instanced.some((r) => r.key.startsWith("flower:")) && arch.instanced.every((r) => r.at.at.z >= 2250 + 120 - 1e-9), "arch: a garland of flowers on the span");
const tallArch = floorKindBody("arch", ctxOf({ kind: "rect", widthMm: 600, depthMm: 3000 }, 2500, DEFAULT_TONE.arch));
assert(boxes(tallArch).filter((p) => near(top(p), 2250)).every((p) => near(Math.abs(p.at.y), 1200) && near(p.at.x, 0)), "an arch stored deep runs along y");

// A gate 3000×500×2800: two columns 500 square at ±1250, joined by a lintel to h — or, arched, by
// voussoirs laid from the +x column over to the −x one, each ending where the next begins, the
// crown's centre line half the ring (0.6 P) under h.
const gateSq = floorKindBody("gate", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 500 }, 2800, DEFAULT_TONE.gate));
assert(boxes(gateSq).filter((p) => p.w === 500 && p.d === 500).every((p) => near(Math.abs(p.at.x), 1250)) && cyls(gateSq).length === 2, "gate: two columns min(D, 0.2 L) square at ±(L − P)/2");
assert(boxes(gateSq).some((p) => p.w === 3000 && near(top(p), 2800)), "gate: a square entrance is a lintel across both columns to h");
const gateArch = floorKindBody("gate", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 500 }, 2800, DEFAULT_TONE.gate, { drawStyle: "arched" }));
const vous = boxes(gateArch).filter((p) => p.rotDeg === 90 && p.tiltDeg !== undefined);
const endOf = (p: Extract<Part, { shape: "box" }>) => ({ x: p.at.x - p.h * Math.sin(rad(p.tiltDeg!)), z: p.at.z + p.h * Math.cos(rad(p.tiltDeg!)) });
assert(vous.length === GATE_VOUSSOIRS && !boxes(gateArch).some((p) => p.w === 3000), `gate: an arched entrance is ${GATE_VOUSSOIRS} voussoirs and no lintel (${vous.length})`);
assert(near(vous[0].at.x, 1250) && vous.every((p, i) => i === vous.length - 1 || Math.hypot(endOf(p).x - vous[i + 1].at.x, endOf(p).z - vous[i + 1].at.z) < 0.03 * p.h), "gate: the voussoirs join, from the +x column over");
assert(near(endOf(vous[vous.length - 1]).x, -1250, 0.03 * vous[0].h) && near(endOf(vous[vous.length - 1]).z, vous[0].at.z, 0.03 * vous[0].h), "gate: …landing on the −x column at the springing");
assert(near(Math.max(...vous.map((p) => p.at.z)), 2800 - 150), "gate: the crown's centre line half the ring under h");
assert(near(top(boxes(floorKindBody("gate", ctxOf({ kind: "rect", widthMm: 500, depthMm: 3000 }, 2800, DEFAULT_TONE.gate))).find((p) => p.d === 3000 || p.w === 3000)!), 2800), "a gate stored deep runs along y");

// A tree ⌀3500 × 4000: the venue's own tree (./plants.ts) in the row's shade.
const tree = floorKindBody("tree", ctxOf({ kind: "circle", diameterMm: 3500 }, 4000, DEFAULT_TONE.tree));
assert(JSON.stringify(tree.parts) === JSON.stringify(treeParts(1750, 1750, 4000, DEFAULT_TONE.tree.toLowerCase())), "tree: the venue's tree, at its size and in its shade");
assert(tree.parts.some((p) => p.shape === "leaves") && cyls(tree).some((p) => p.material?.colour === ENVELOPE.trunk), "tree: leaf cards over a crown, on a trunk");

// A straight bar 3000×600×1100: the body to 1100, the counter top on it, bottles on the shelf.
const bar = floorKindBody("bar", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 600 }, 1100, DEFAULT_TONE.bar));
assert(boxes(bar).some((p) => near(top(p), 1100) && p.w === 3000 && p.at.y > 0), "straight bar: the counter to 1100");
assert(boxes(bar).some((p) => near(p.at.z, 1100) && p.h === 40 && near(p.d, 240 + 50) && p.at.y > 0), "straight bar: a counter top counterTopMm(D) deep, 50 proud, on the front");
assert(bar.instanced.length >= 10 && bar.instanced.every((r) => r.key.startsWith("bottle:") && near(r.at.at.z, 935) && r.at.at.y < 0), `straight bar: bottles every 26 cm on the back shelf at 0.85 h (${bar.instanced.length})`);
assert(bar.instanced.length === Math.floor((3000 - 120) / BOTTLE_PITCH_MM), "…as many as the plan draws");
const tallBar = floorKindBody("bar", ctxOf({ kind: "rect", widthMm: 600, depthMm: 3000 }, 1100, DEFAULT_TONE.bar));
assert(tallBar.instanced.every((r) => Math.abs(r.at.at.y) > 1000 || Math.abs(r.at.at.x) > 0) && boxes(tallBar).every((p) => p.rotDeg === 90), "a bar stored deep runs along y");
const round = floorKindBody("bar", ctxOf({ kind: "circle", diameterMm: 3000 }, 1100, DEFAULT_TONE.bar));
assert(round.parts.some((p) => p.shape === "extrude" && p.h === 1100 && (p.holes?.length ?? 0) === 1), "round bar: a ring with its well open");
assert(round.instanced.length === Math.max(6, Math.round((2 * Math.PI * 1500 * 0.3) / 220)) && round.instanced.every((r) => near(Math.hypot(r.at.at.x, r.at.at.y), 450)), "round bar: the plan's ring of bottles at 0.3 R");

// A ח bar 4800×1800 (the counter a third of the short side): the counter top only along the hull
// edges, the shelf and its bottles along the inside, nothing added.
const uBar = resolveFootprint({
  id: "u", name: "בר", category: "bars", layer: "floor",
  dimensions: { heightMm: 1100, widthMm: 4800, depthMm: 1800 }, categoryFields: {}, styleTags: [], variants: [],
  appearance: { content: "none", shape: "u-shape" } as never,
});
const u = floorKindBody("bar", ctxOf(uBar, 1100, DEFAULT_TONE.bar, { widthMm: 4800, depthMm: 1800 }));
const counters = u.parts.filter((p) => p.shape === "extrude" && near(p.at.z, 1100) && p.h === 40);
const shelves = u.parts.filter((p) => p.shape === "extrude" && near(p.at.z, 935) && p.h === 30);
assert(counters.length === barDrawing(uBar).front.length && counters.length > 0, `ח bar: a counter top per front strip (${counters.length})`);
assert(shelves.length === barDrawing(uBar).shelf.length && shelves.length === 1, `ח bar: one shelf, the inside of the ח (${shelves.length})`);
assert(u.parts.some((p) => p.shape === "extrude" && p.h === 1100), "ח bar: the body to 1100");
assert(u.instanced.length === barDrawing(uBar).bottles.length && u.instanced.length >= 8 && u.instanced.every((r) => near(r.at.at.z, 935)), `ח bar: the plan's bottles on the shelf (${u.instanced.length})`);
// The shelf is folded out across the inner edge: its bottles stand inside the ח's crook.
const uRing = flatRing(footprintOutlines(uBar)[0]);
assert(u.instanced.every((r) => signedDistance(r.at.at.x, r.at.at.y, uRing) < 0), "ח bar: the bottles stand in the crook, off the counter");
// The counter top overhangs the guests' edge by 50.
const hull = (p: Point) => Math.max(Math.abs(p.x) - 2400, Math.abs(p.y) - 900);
assert(counters.some((p) => p.shape === "extrude" && p.outline.outline.some((q) => hull(q) > 45)), "ח bar: the counter top stands 50 proud of the edge");

// A chuppah 3000×3000×2600: four posts to 2600 at their REAL size (a 6 cm tube, not the plan's
// m·0.045), where the plan stands them; a frame along their tops; the canopy at 2600; posies on
// the +y posts only.
const chuppah = floorKindBody("chuppah", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 3000 }, 2600, DEFAULT_TONE.chuppah));
const poles = cyls(chuppah).filter((p) => near(p.rBottom, 30) && near(top(p), 2600) && !p.tiltDeg);
assert(poles.length === 4 && poles.every((p) => near(Math.abs(p.at.x), 1500 - 216) && near(Math.abs(p.at.y), 1500 - 216)), `chuppah: four posts 6 cm thick, the plan's pole·1.6 in from the corners (${poles.length})`);
assert(cyls(chuppah).filter((p) => near(p.tiltDeg ?? 0, 90) && near(p.at.z, 2600)).length === 4, "…a beam along the top of every side, so the cloth hangs from something");
assert(chuppah.parts.filter((p) => p.shape === "plane").length === 2 && chuppah.parts.some((p) => p.shape === "plane" && near(p.at.z, 2600) && p.material?.kind === "fabric"), "chuppah: a cloth canopy at h, and its sag under it");
assert(chuppah.instanced.some((r) => r.key.startsWith("flower:")) && chuppah.instanced.every((r) => r.at.at.y > 0), "chuppah: posies (heads and their leaves) on the front (+y) poles only");
assert(chuppah.instanced.every((r) => r.at.at.z >= 2600 * POSY_SHARE - 1e-6), "…hung at 2/3 h");
const roundChuppah = floorKindBody("chuppah", ctxOf({ kind: "circle", diameterMm: 3000 }, 2600, DEFAULT_TONE.chuppah));
const roundPosts = cyls(roundChuppah).filter((p) => near(p.rBottom, 30) && !p.tiltDeg);
assert(roundPosts.length === 4 && roundPosts.every((p) => near(Math.hypot(p.at.x, p.at.y), 1500 * 0.82)), "a round chuppah's posts stand at 0.82 of the radius");

// The spec (lib/catalog/chuppah.ts): a domed sheer on gold posts, a floral cloud on clear ones, a
// hung one, a hexagon, never a solid.
const domed = floorKindBody("chuppah", ctxOf({ kind: "circle", diameterMm: 3000 }, 2800, DEFAULT_TONE.chuppah, { chuppah: { roof: "sheer", finish: "gold", profile: CHUPPAH_PROFILES.dome } }));
const sheet = domed.parts.find((p) => p.shape === "sheet");
assert(!!sheet && sheet.shape === "sheet" && sheet.material?.opacity === SHEER_OPACITY && !domed.parts.some((p) => p.shape === "lathe"), "a dome: the roof a two-sided sheer sheet up the base's body, never a lathe");
assert(sheet!.shape === "sheet" && near(Math.max(...sheet!.rows.flat().map((v) => v.z)), 2800) && cyls(domed).filter((p) => !p.tiltDeg && near(p.rBottom, 30)).every((p) => p.h < 2800 * 0.8 && p.material?.colour === "#c9a24a"), "…its crown at h, the gold posts rising only to the eave");
const cloud = floorKindBody("chuppah", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 3000 }, 2700, DEFAULT_TONE.chuppah, { chuppah: { roof: "flowers", finish: "acrylic", flowers: "none", bloom: "#f6f3ec" } }));
const cloudHeads = cloud.instanced.filter((r) => r.key.startsWith("flower:"));
assert(cloudHeads.length > 150 && cloudHeads.every((r) => r.at.at.z > 2000) && !cloud.parts.some((p) => p.shape === "plane"), `a floral cloud: hundreds of heads over the top, no cloth (${cloudHeads.length})`);
assert(cyls(cloud).filter((p) => !p.tiltDeg && near(p.rBottom, 50)).every((p) => p.material?.kind === "glass"), "…on 10 cm clear acrylic posts");
const hung = floorKindBody("chuppah", ctxOf({ kind: "circle", diameterMm: 3000 }, 2600, DEFAULT_TONE.chuppah, { chainMm: 1400, chuppah: { posts: 0, roof: "flowers" } }));
assert(cyls(hung).filter((p) => near(p.rBottom, 2)).length === 4 && cyls(hung).filter((p) => near(p.rBottom, 2)).every((p) => near(p.at.z + p.h, 2600 + 1400)) && !cyls(hung).some((p) => near(p.rBottom, 30)), "hung: no posts, four cables up to the ceiling");
const hexOutline = Array.from({ length: 6 }, (_, i) => ({ x: 1500 * Math.cos((i * Math.PI) / 3), y: 1300 * Math.sin((i * Math.PI) / 3) }));
const hex = floorKindBody("chuppah", ctxOf({ kind: "custom", outline: hexOutline }, 2600, DEFAULT_TONE.chuppah, { widthMm: 3000, depthMm: 2600, chuppah: { finish: "wood", roof: "open" } }));
assert(cyls(hex).filter((p) => !p.tiltDeg && near(p.rBottom, 45)).length === 6, "a hexagon of timber: a post at every corner");

// A rotunda ⌀4000 × 3000: eight columns, two rings, drapes at the back.
const rotunda = floorKindBody("chuppah", ctxOf({ kind: "circle", diameterMm: 4000 }, 3000, DEFAULT_TONE.chuppah, { drawStyle: "rotunda" }));
const columns = cyls(rotunda).filter((p) => near(p.rBottom, 150) && near(p.rTop, 150));
assert(columns.length === 8 && columns.every((p) => near(Math.hypot(p.at.x, p.at.y), 2000 * 0.92)), `rotunda: eight columns m·0.075 thick on 0.92 of the radius (${columns.length})`);
assert(columns.every((p) => Math.abs(p.at.y - 2000 * 0.92) > 1), "rotunda: the front is an opening, not a column");
assert(rotunda.parts.filter((p) => p.shape === "torus").length === 2 && rotunda.parts.some((p) => p.shape === "torus" && near(p.r, 1840) && near(p.at.z, 2850)), "rotunda: two rings at the top, the outer at 0.92 R");
const drapes = rotunda.parts.filter((p): p is Extract<Part, { shape: "ribbon" }> => p.shape === "ribbon");
assert(drapes.length === 3 && drapes.every((p) => p.path.every((q) => q.y < 0)), `rotunda: drapes between the back columns only (${drapes.length})`);

// Stairs 1000×840 rising 600: four risers (≤ 18 cm), so three treads, 150 apart, the highest at −y.
const stairs = floorKindBody("stairs", ctxOf({ kind: "rect", widthMm: 1000, depthMm: 840 }, 0, DEFAULT_TONE.stairs, { climb: { heightMm: 600 } }));
const treads = boxes(stairs).sort((a, b) => top(a) - top(b));
assert(treads.length === 3 && near(top(treads[0]), 150) && near(top(treads[1]), 300) && near(top(treads[2]), 450), `stairs: three treads at 150/300/450 (${treads.map((p) => Math.round(top(p))).join("/")})`);
assert(treads[2].at.y < treads[0].at.y && near(treads[2].at.y, -280) && near(treads[0].at.y, 280) && near(treads[0].d, 280), "stairs: the head at −y, 28 cm treads");
const reversed = floorKindBody("stairs", ctxOf({ kind: "rect", widthMm: 1000, depthMm: 840 }, 0, DEFAULT_TONE.stairs, { climb: { heightMm: 600, reversed: true } }));
assert(boxes(reversed).sort((a, b) => top(a) - top(b))[2].at.y > 0, "…reversed, the head at +y");
assert(boxes(floorKindBody("stairs", ctxOf({ kind: "rect", widthMm: 1000, depthMm: 840 }, 0, DEFAULT_TONE.stairs, { climb: { heightMm: 600, risers: 3 } }))).length === 2, "typed risers: 3 risers stand on 2 treads");

// A ramp 1200×7200 rising 600: a slab tilted atan(600/7200), its −y end up, a landing at the head.
const ramp = floorKindBody("ramp", ctxOf({ kind: "rect", widthMm: 1200, depthMm: 7200 }, 0, DEFAULT_TONE.ramp, { climb: { heightMm: 600 } }));
const slab = boxes(ramp).find((p) => p.w === 1200 && p.tiltDeg !== undefined);
assert(!!slab && near(slab.tiltDeg!, (Math.atan2(600, 7200) * 180) / Math.PI) && near(slab.tiltDeg!, 4.76, 0.01), `ramp: the slab tilted atan(rise/run) ≈ 4.76° (${slab?.tiltDeg})`);
assert(slab!.tiltDeg! > 0 && near(slab!.at.z, 300), "ramp: tilted so its −y end rises, about its middle at half the rise");
assert(boxes(ramp).some((p) => near(top(p), 660) && p.at.y < 0 && p.d === 200), "ramp: a landing 200 deep at the head's height");
assert(boxes(ramp).filter((p) => p.w === 40).length === 2, "ramp: a kerb each side");
assert(boxes(floorKindBody("ramp", ctxOf({ kind: "rect", widthMm: 1200, depthMm: 7200 }, 0, DEFAULT_TONE.ramp, { climb: { heightMm: 600, reversed: true } }))).find((p) => p.w === 1200 && p.tiltDeg !== undefined)!.tiltDeg! < 0, "…reversed, the +y end rises");

// A rug 3000×2000: a slab, its border band, fringe on the short ends — under sixty parts.
const rug = rugBody(ctxOf({ kind: "rect", widthMm: 3000, depthMm: 2000 }, 12, "#c9b8a8"));
assert(rug.parts.length <= 60 && rug.parts[0].shape === "box" && rug.parts[0].h === 12 && rug.material.kind === "fabric", `rug: a 12 mm slab and at most sixty parts (${rug.parts.length})`);
assert(boxes(rug).filter((p) => p.h === 2).length === 4, "rug: four border strips");
const fringes = boxes(rug).filter((p) => p.h === 3);
assert(fringes.length === 40 && fringes.every((p) => Math.abs(p.at.x) > 1500), "rug: twenty fringes off each short end");

// The same rug with its right end bowed out 20%: an extruded slab, a ring border with a hole, and
// fringe that follows the curve — the bulge reaches past the straight end, and every strand points out.
const curved = rugBody(ctxOf({ kind: "rect", widthMm: 3000, depthMm: 2000 }, 12, "#c9b8a8", { rug: { bows: [0, 0.2, 0, 0] } }));
const curvedSlab = curved.parts[0];
assert(curvedSlab.shape === "extrude" && curvedSlab.h === 12 && curvedSlab.outline.edgeCurves?.[1] != null, "curved rug: the slab is the bowed outline, extruded");
const ring = curved.parts.find((p) => p.shape === "extrude" && p.h === 2);
assert(ring?.shape === "extrude" && ring.holes?.length === 1, "curved rug: the border is a ring");
const strands = boxes(curved).filter((p) => p.h === 3);
assert(strands.length === 40, `curved rug: twenty strands an end (${strands.length})`);
assert(strands.some((p) => p.at.x > 1500 + 350), "curved rug: the fringe rides the bulge");

// A rug with a CONTOUR (lib/catalog/border.ts): the woven band gives way to its bands — flat rings
// on the slab in their colours — and the fringe is the contour's, in its colour or none at all.
const gold = { widthMm: 120, colour: "#c9a24a", inner: { widthMm: 40, gapMm: 60, colour: "#ffffff" } };
const bordered = rugBody(ctxOf({ kind: "rect", widthMm: 3000, depthMm: 2000 }, 12, "#4b3a6e", { border: gold }));
const bands = bordered.parts.filter((p): p is Extract<Part, { shape: "extrude" }> => p.shape === "extrude" && p.at.z === 12);
assert(bordered.parts[0].shape === "box" && bands.length === 2 && bands.every((p) => p.holes?.length === 1), "bordered rug: the slab, then two rings on it");
assert(bands[0].material?.colour === "#c9a24a" && bands[1].material?.colour === "#ffffff", "bordered rug: each band in its colour");
assert(!boxes(bordered).some((p) => p.h === 2), "bordered rug: no woven strips under the contour");
const goldStrands = boxes(bordered).filter((p) => p.h === 3);
assert(goldStrands.length === 40 && goldStrands.every((p) => p.material?.colour === "#c9a24a"), "bordered rug: the fringe in the contour's colour");
assert(boxes(rugBody(ctxOf({ kind: "rect", widthMm: 3000, depthMm: 2000 }, 12, "#4b3a6e", { border: { ...gold, fringe: false } }))).filter((p) => p.h === 3).length === 0, "bordered rug: no fringe when it says so");
const bentBordered = rugBody(ctxOf({ kind: "rect", widthMm: 3000, depthMm: 2000 }, 12, "#4b3a6e", { rug: { bows: [0, 0.2, 0, 0], corners: [300, 300, 0, 0] }, border: gold }));
assert(bentBordered.parts[0].shape === "extrude" && bentBordered.parts.filter((p) => p.shape === "extrude" && p.at.z === 12).length === 2, "bordered curved rug: its bands follow the bowed, rounded slab");
// A carpet laid to an OUTLINE (lib/studio/cover.ts): an L over a stage with a trap cut in it.
const lOutline = [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 2000 }, { x: -3000, y: 2000 }];
const trap = [{ x: -2000, y: -1000 }, { x: -1000, y: -1000 }, { x: -1000, y: -500 }, { x: -2000, y: -500 }];
const laidRug = rugBody(ctxOf({ kind: "rect", widthMm: 6000, depthMm: 4000 }, 12, "#4b3a6e", { carpet: { outline: lOutline, holes: [trap], widthMm: 6000, depthMm: 4000 } }));
const lSlab = laidRug.parts[0];
assert(lSlab.shape === "extrude" && lSlab.outline.outline.length === 6 && lSlab.holes?.length === 1, "outline carpet: the slab is the L, its trap cut out");
assert(laidRug.parts.filter((p) => p.shape === "extrude" && p.at.z === 12).length === 1 && !boxes(laidRug).length, "…one weave ring on top along it, and no fringe");
const laidBordered = rugBody(ctxOf({ kind: "rect", widthMm: 6000, depthMm: 4000 }, 12, "#4b3a6e", { carpet: { outline: lOutline, holes: [], widthMm: 6000, depthMm: 4000 }, border: gold }));
assert(laidBordered.parts.filter((p) => p.shape === "extrude" && p.at.z === 12).length === 2 && !boxes(laidBordered).length, "…with a contour: its two bands along the L, still no fringe");

// Chairs in rows 3×4: twelve instances, all facing +y.
const rows = chairRowsBody(ctxOf({ kind: "rect", widthMm: 1950, depthMm: 2400 }, 900, DEFAULT_TONE.chair, { rows: { rows: 3, perRow: 4 } }));
assert(rows.instanced.length === 12 && rows.instanced.every((r) => near(r.at.rotationDeg, 0) && r.key.startsWith("chair:dining:")), `chair rows: twelve chairs facing +y (${rows.instanced.length})`);
const layout = chairRowsLayout({ rows: 3, perRow: 4 }, FALLBACK_CHAIR);
assert(rows.instanced.every((r, i) => near(r.at.at.x, layout.chairs[i].x) && near(r.at.at.y, layout.chairs[i].y)), "…where chairRowsLayout stands them");

// A pergola 4 × 4 × 2.6 (lib/venues/pergola.ts): four posts in its corners up to the beams, a beam
// along every side, slats across the top ending at its height; the same row laid 6 × 4 keeps its
// posts; a cloth roof is one plane; a closed side carries battens.
const pergola = floorKindBody("pergola", ctxOf({ kind: "rect", widthMm: 4000, depthMm: 4000 }, 2600, DEFAULT_TONE.pergola));
const posts = boxes(pergola).filter((p) => p.w === 150 && p.d === 150);
assert(posts.length === 4 && posts.every((p) => near(Math.abs(p.at.x), 1925) && near(Math.abs(p.at.y), 1925) && near(top(p), 2600 - SLAT_H_MM)), `pergola: four posts in its corners up to the beams (${posts.length})`);
const slats = boxes(pergola).filter((p) => p.h === SLAT_H_MM);
assert(slats.length >= 10 && slats.every((p) => near(top(p), 2600)), `pergola: slats across the top, ending at its height (${slats.length})`);
assert(boxes(pergola).filter((p) => near(top(p), 2600 - SLAT_H_MM) && p.h !== 2600 - SLAT_H_MM).length === 4, "pergola: a beam along every side, under the slats");
const widePergola = floorKindBody("pergola", ctxOf({ kind: "rect", widthMm: 6000, depthMm: 4000 }, 2600, DEFAULT_TONE.pergola));
assert(boxes(widePergola).filter((p) => p.w === 150 && p.d === 150).length === 4 && boxes(widePergola).filter((p) => p.h === SLAT_H_MM).length > slats.length, "pergola: laid 6 × 4 it keeps its 15cm posts and gains slats");
const cloth = floorKindBody("pergola", ctxOf({ kind: "rect", widthMm: 4000, depthMm: 4000 }, 2600, "#f3ede2", { pergola: { postMm: 120, roof: "fabric", closedSides: [0] } }));
assert(cloth.parts.filter((p) => p.shape === "plane").length === 1 && boxes(cloth).filter((p) => p.h === SLAT_H_MM).length === 0, "pergola: a cloth roof is one plane, no slats");
assert(boxes(cloth).filter((p) => p.w === BATTEN_MM).length > 20, "pergola: a closed side is a lattice of battens");
const roundPergola = floorKindBody("pergola", ctxOf({ kind: "circle", diameterMm: 6000 }, 2800, DEFAULT_TONE.pergola, { pergola: { postMm: 150, roof: "none" } }));
assert(boxes(roundPergola).filter((p) => p.w === 150 && p.d === 150).length === 6 && boxes(roundPergola).every((p) => top(p) <= 2800 + 1e-6), "pergola: a round one on six posts, beams only, no higher than its height");

// Everything stands on its own floor and builds the same twice.
for (const [kind, b] of [["sofa", sofa], ["column", column], ["fountain", fountain], ["arch", arch], ["tree", tree], ["bar", bar], ["chuppah", chuppah], ["stairs", stairs], ["pergola", pergola]] as const) {
  assert(b.parts.every((p) => (p.shape === "sphere" ? p.at.z - p.r : p.at.z) >= -1e-6), `${kind} stands on the floor`);
}
assert(JSON.stringify(arch) === JSON.stringify(floorKindBody("arch", ctxOf({ kind: "rect", widthMm: 3000, depthMm: 600 }, 2500, DEFAULT_TONE.arch))), "the same arch builds the same twice");
// ── The profile is READ by the recipe (2026-11-13, lib/catalog/body-profiles.ts) ──
const baluster = [{ r: 0.8, z: 0 }, { r: 0.5, z: 0.1 }, { r: 0.6, z: 0.9 }, { r: 1, z: 1 }];
const turnedColumn = floorKindBody("column", ctxOf({ kind: "circle", diameterMm: 500 }, 3000, DEFAULT_TONE.column, { profile: baluster }));
assert(turnedColumn.parts.length === 1 && turnedColumn.parts[0].shape === "lathe" && turnedColumn.material.kind === column.material.kind, "a column with a profile is that shaft turned, in the column's own stone");
// A two-tier fountain: a basin's rim at 0.3 h of the stone and a bowl's at its top.
const tiers = [{ r: 0.9, z: 0 }, { r: 1, z: 0.3 }, { r: 0.15, z: 0.34 }, { r: 0.12, z: 0.8 }, { r: 0.5, z: 1 }];
assert(JSON.stringify(profileBowls(tiers)) === JSON.stringify([{ r: 1, z: 0.3 }, { r: 0.5, z: 1 }]), "a profile's bowls are its rims — the basin's lip and the top tier's");
assert(profileBowls([{ r: 0.9, z: 0 }, { r: 1, z: 0.25 }, { r: 1, z: 1 }]).length === 1 && profileBowls([{ r: 1, z: 0 }, { r: 0.05, z: 1 }]).length === 0, "a straight-walled basin holds water at its top; a cone holds none");
const turnedFountain = floorKindBody("fountain", ctxOf({ kind: "circle", diameterMm: 2000 }, 1500, DEFAULT_TONE.fountain, { profile: tiers }));
assert(turnedFountain.parts.filter((p) => p.shape === "lathe").length === 1 && turnedFountain.parts.filter((p) => p.material?.kind === "water").length === 3 && turnedFountain.emitters.length === 1, "a fountain with a profile is its stone turned — with water in both bowls, its jet and its glow kept");
const crown = [{ r: 0.07, z: 0 }, { r: 0.07, z: 0.46 }, { r: 0.62, z: 0.52 }, { r: 1, z: 0.74 }, { r: 0.62, z: 0.95 }, { r: 0.04, z: 1 }];
const ballTree = floorKindBody("tree", ctxOf({ kind: "circle", diameterMm: 2000 }, 3000, DEFAULT_TONE.tree, { profile: crown }));
const ballBlobs = ballTree.parts.filter((p) => p.shape === "blob");
assert(ballBlobs.length >= 2 && ballBlobs.every((p) => p.at.z > 3000 * 0.45) && ballTree.parts.some((p) => p.shape === "cylinder" && p.at.z === 0 && p.h > 1200) && ballTree.parts.some((p) => p.shape === "leaves"), "a tree with a crown profile: leaves inside the envelope, a bare trunk under it");
assert(JSON.stringify(floorKindBody("tree", ctxOf({ kind: "circle", diameterMm: 3500 }, 4000, DEFAULT_TONE.tree))) === JSON.stringify(tree), "…and a tree with none is the tree it always was");
const pouf = floorKindBody("sofa", ctxOf({ kind: "circle", diameterMm: 900 }, 420, DEFAULT_TONE.sofa, { profile: baluster }));
assert(pouf.parts.length === 1 && pouf.parts[0].shape === "lathe", "a round sofa with a profile is a pouf turned to it");

// A billiard table (lib/catalog/game-tables.ts): its rails' tops at its height, the cloth in its
// shade under them, six pocket cups, six legs; turned the long way down it is the same table.
const pool = floorKindBody("billiard", ctxOf({ kind: "rect", widthMm: 2540, depthMm: 1420 }, 790, "#1f4e8c"));
assert(near(Math.max(...pool.parts.map(top)), 792), `billiard: the rails' tops at its height, the sights on them (${Math.max(...pool.parts.map(top))})`);
assert(boxes(pool).some((p) => p.material?.kind === "fabric" && p.material.colour === "#1f4e8c" && p.w > 2000 && top(p) < 790), "billiard: the cloth in the row's shade, under the rails");
assert(cyls(pool).filter((p) => p.material?.colour === BILLIARD_POCKET).length === 6, "billiard: six pockets");
assert(cyls(pool).filter((p) => p.at.z === 0).length === 6, "billiard: six legs on the floor");
const turned = floorKindBody("billiard", ctxOf({ kind: "rect", widthMm: 1420, depthMm: 2540 }, 790, "#1f4e8c"));
assert(cyls(turned).filter((p) => p.material?.colour === BILLIARD_POCKET && Math.abs(p.at.y) < 1e-6).length === 2, "billiard: laid the long way down, its side pockets on the long rails");
console.log("scene floor kinds ok");
