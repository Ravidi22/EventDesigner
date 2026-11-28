// npm run check:elevation-view — the self-check of ./elevation.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type ShapePart } from "@/lib/catalog/types";
import { REVOLVE_PRESETS, cleanRevolve } from "./revolve";
import { bandResize, boxGripSpots, boxRect, drawnFront, ELEVATION_MIN_H_MM, elevationBoxes, elevationFrame, elevationNudge, faceSized, FLOOR_CLEARANCE_MM, handleSpots, orthoFrame, placedFront, profileHandles, profilePoint, rectEdit, runsClearOf } from "./elevation";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
// The proving bar (spec 2026-11-07-element-model §13): a counter 300×60, a back-bar 90 cm behind
// it 2 m tall, a shelf on the back-bar's face at 1 m.
const bar: ShapePart[] = [
  { id: "counter", shape: "rect", widthMm: 3000, depthMm: 600, x: 0, y: 0, rotation: 0 },
  { id: "back", shape: "rect", widthMm: 3000, depthMm: 400, x: 0, y: -900, rotation: 0, zMm: 0, heightMm: 2000 },
  { id: "shelf", shape: "rect", widthMm: 3000, depthMm: 250, x: 0, y: -600, rotation: 0, zMm: 1000, heightMm: 40 },
];
const fb = elevationBoxes(bar, 1100, "front");
assert(fb[0].a0 === -1500 && fb[0].a1 === 1500 && fb[0].z === 0 && fb[0].h === 1100, "the base stands on the floor, as tall as the item");
assert(fb[2].z === 1000 && fb[2].h === 40, "the shelf at its own height");
const sb = elevationBoxes(bar, 1100, "side");
assert(sb[1].a0 === -1100 && sb[1].a1 === -700, "seen from the side, across is plan y");
const up = rectEdit(bar[2], fb[2], { ...boxRect(fb[2]), y: boxRect(fb[2]).y - 200 }, "front");
assert(up.patch.zMm === 1200 && up.patch.heightMm === undefined && up.patch.x === undefined, "dragged up 20 cm — its height untouched");
const follows = elevationBoxes([bar[0], { ...bar[1], heightMm: undefined }], 1100, "front")[1];
const raised = rectEdit({ ...bar[1], heightMm: undefined }, follows, { ...boxRect(follows), y: boxRect(follows).y - 300 }, "front");
assert(raised.patch.zMm === 300 && !("heightMm" in raised.patch), "a part that follows the item's height is not pinned by a move");
const r0 = boxRect(fb[0]);
const taller = rectEdit(bar[0], fb[0], { ...r0, y: r0.y - 150, depthMm: r0.depthMm + 300 }, "front");
assert(taller.itemHeightMm === 1400 && taller.patch.zMm === undefined, "the base's top edge is the item's height");
const lifted = rectEdit(bar[0], fb[0], { ...r0, y: r0.y - 500 }, "front");
assert(lifted.itemHeightMm === undefined && lifted.patch.zMm === undefined, "the base never leaves the floor");
const sunk = rectEdit(bar[2], fb[2], { ...boxRect(fb[2]), y: 100 }, "front");
assert(sunk.patch.zMm === 0, "nothing goes under the floor");
const thin = rectEdit(bar[2], fb[2], { ...boxRect(fb[2]), depthMm: 2 }, "front");
assert(thin.patch.heightMm === ELEVATION_MIN_H_MM, "a height never goes under 10 mm");
// A bottom-edge resize keeps the top where it was (review F1).
const sr = boxRect(fb[2]);
const underFloor = rectEdit(bar[2], fb[2], { ...sr, y: -470, depthMm: 1140 }, "front");
assert(underFloor.patch.zMm === 0 && underFloor.patch.heightMm === 1040, "a shelf's bottom pulled under the floor stops at 0 and keeps its top");
const bottomUp = rectEdit(bar[2], fb[2], { ...sr, y: -1030, depthMm: 20 }, "front");
assert(bottomUp.patch.zMm === 1020 && bottomUp.patch.heightMm === 20, "a shelf's bottom pulled up 20 mm raises it and shortens it from below");
const bottomDown = rectEdit(bar[0], fb[0], { ...r0, y: -450, depthMm: 1300 }, "front");
assert(bottomDown.itemHeightMm === undefined && bottomDown.patch.zMm === undefined, "the base's bottom grip pulled down changes no height");
const bottomUpBase = rectEdit(bar[0], fb[0], { ...r0, y: -700, depthMm: 800 }, "front");
assert(bottomUpBase.itemHeightMm === undefined && bottomUpBase.patch.zMm === undefined, "…nor pulled up");
const topMoved = rectEdit(bar[0], fb[0], { ...r0, y: -700, depthMm: 1400 }, "front");
assert(topMoved.itemHeightMm === 1400, "the base's top edge moved is the item's new height");
assert(sunk.patch.heightMm === undefined, "a shelf carried under the floor is not shortened");
const turned = { ...bar[1], rotation: 45 };
const tb = elevationBoxes([bar[0], turned], 1100, "front")[1];
assert(tb.across === null && rectEdit(turned, tb, { ...boxRect(tb), widthMm: boxRect(tb).widthMm + 400 }, "front").patch.widthMm === undefined, "a turned shape's width is not rewritten across");
const slid = rectEdit(bar[1], sb[1], { ...boxRect(sb[1]), x: boxRect(sb[1]).x + 100 }, "side");
assert(slid.patch.y === -800 && slid.patch.x === undefined, "slid across in the side view moves plan y");
assert(fb[1].across === "width" && sb[1].across === "depth", "an unturned rect is resized across by its width in front, its depth from the side");
const wider = rectEdit(bar[1], fb[1], { ...boxRect(fb[1]), widthMm: 3400 }, "front");
assert(wider.patch.widthMm === 3400, "…and the width is written");

// A vase on the plan: a circle with a body; the handles sit on its silhouette's right half.
const vase: ShapePart = { id: "vase", shape: "circle", diameterMm: 600, x: 0, y: 0, rotation: 0, revolve: REVOLVE_PRESETS.vase };
const vb = elevationBoxes([vase], 900, "front")[0];
assert(vb.across === "diameter" && !!vb.revolve, "a round body is a silhouette, resized by its diameter");
const handles = profileHandles(vb);
const want = cleanRevolve(REVOLVE_PRESETS.vase)[3];
const got = profilePoint(vb, handles[3]);
assert(handles.length === REVOLVE_PRESETS.vase.length &&Math.abs(got.r - want.r) < 1e-3 && Math.abs(got.z - want.z) < 1e-3, "a profile handle reads back to its point");
assert(profilePoint(vb, { x: -handles[3].x, y: handles[3].y }).r === got.r, "the left half reads the same radius");

// The click-to-add band is cut round the box's own grips: a basin's right side runs along the
// box's edge (r = 1), through its edge-midpoint grip and up to the top-right corner.
const basin = elevationBoxes([{ ...vase, revolve: REVOLVE_PRESETS.basin }], 900, "front")[0];
const rim = profileHandles(basin);
const gripRadius = 12;
const cutRuns = runsClearOf(rim, boxGripSpots(basin), gripRadius);
const mid = { x: basin.a1, y: -(basin.z + basin.h / 2) };
const corner = { x: basin.a1, y: -(basin.z + basin.h) };
const covered = (q: { x: number; y: number }) => cutRuns.some((r) => r.some((m) => Math.hypot(m.x - q.x, m.y - q.y) < 1e-6));
const nearGrip = cutRuns.flat().some((m) => Math.hypot(m.x - mid.x, m.y - mid.y) < gripRadius || Math.hypot(m.x - corner.x, m.y - corner.y) < gripRadius);
assert(cutRuns.length >= 2 && !nearGrip && !covered(mid) && !covered(corner), "a basin's right side is cut at the edge-midpoint grip and the top-right corner");
assert(runsClearOf(rim, [], gripRadius).length === 1, "with no grips near, the side is one run");
// …and a handle on a grip is drawn beside it, toward the axis; one off every grip stays put.
const axis = (basin.a0 + basin.a1) / 2;
const shown = handleSpots(rim, boxGripSpots(basin), gripRadius, axis);
const onGrip = rim.findIndex((h) => boxGripSpots(basin).some((g) => Math.hypot(h.x - g.x, h.y - g.y) < gripRadius));
assert(onGrip >= 0 && shown[onGrip].x < rim[onGrip].x && shown[onGrip].y === rim[onGrip].y && boxGripSpots(basin).every((g) => Math.hypot(shown[onGrip].x - g.x, shown[onGrip].y - g.y) >= gripRadius), "a handle on a corner grip is drawn beside it, toward the axis, clear of every grip");
const free = rim.findIndex((h) => boxGripSpots(basin).every((g) => Math.hypot(h.x - g.x, h.y - g.y) >= gripRadius));
assert(free < 0 || shown[free] === rim[free], "a handle off every grip stands on its point");

const n = elevationNudge(bar[2], 2, "front", 10, 50);
assert(n.x === 10 && n.zMm === 1050 && n.y === undefined, "nudged across and up");
const nb = elevationNudge(bar[0], 0, "front", 0, 50);
assert(nb.zMm === undefined && nb.x === undefined, "the base is never nudged off the floor");
assert(elevationNudge(bar[2], 2, "side", 10, 0).y === -590, "a side nudge moves plan y");

const front = orthoFrame("front", { minX: -2000, minY: -2500, w: 4000, h: 3000 }, { x: 100, y: 0 }, 0);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
assert(near(front.left, -2.1) && near(front.right, 1.9) && near(front.top, 2.5) && near(front.bottom, -0.5) && front.rotationY === 0 && front.position[2] > 0, "the front camera frames what the canvas shows");
const hung = orthoFrame("front", { minX: -2000, minY: -2500, w: 4000, h: 3000 }, { x: 100, y: 0 }, 2800);
assert(near(hung.top, 5.3), "a hung item's floor is its underside");
const side = orthoFrame("side", { minX: -2000, minY: -2500, w: 4000, h: 3000 }, { x: 0, y: 300 }, 0);
assert(side.rotationY === -Math.PI / 2 && side.position[0] < 0 && near(side.left, (-2000 - 300) / 1000), "the side camera looks along +x from the item's −x end");
// The opening frame keeps the floor above the bar and is centred on the shapes (review F4).
const offCentre = elevationBoxes([{ id: "p", shape: "rect", widthMm: 600, depthMm: 600, x: 3000, y: 0, rotation: 0 }], 750, "front");
const fr = elevationFrame(offCentre, { w: 2000, h: 2000 });
assert(fr.minX === 2000 && fr.maxX === 4000 && fr.minY === -2000, "the frame is centred on the shapes' across extent, not on the origin");
assert(fr.maxY >= FLOOR_CLEARANCE_MM && fr.maxY >= (fr.maxY - fr.minY) * 0.2, "room is kept under the floor line for the bar");
const wide = elevationFrame(fb, { w: 2000, h: 2000 });
assert(wide.minX === -1500 && wide.maxX === 1500 && wide.maxY === 600, "a wide item is framed to its own extent");

// THE FRONT PLANE (backdrops S2): a front panel behind the counter, 40 cm off the floor.
const nearly = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;
const panel: ShapePart = { id: "f", plane: "front", shape: "rect", widthMm: 3000, depthMm: 2000, thicknessMm: 30, x: 0, y: -300, rotation: 0, zMm: 400 };
const fp = elevationBoxes([bar[0], panel], 1100, "front")[1];
assert(fp.z === 400 && fp.h === 2000 && nearly(fp.a0, -1500) && nearly(fp.a1, 1500) && fp.front?.asItself === true && fp.across === "width", "a front panel in front: its face, 40 cm up");
const sp = elevationBoxes([bar[0], panel], 1100, "side")[1];
assert(nearly(sp.a1 - sp.a0, 30) && sp.front?.asItself === false && sp.across === null, "…from the side, its thickness");
const fpr = boxRect(fp);
const tallerFace = rectEdit(panel, fp, { ...fpr, y: fpr.y - 250, depthMm: 2500 }, "front");
assert(tallerFace.patch.depthMm === 2500 && tallerFace.patch.heightMm === undefined && tallerFace.patch.zMm === undefined, "its top pulled up makes its FACE taller");
const raisedFace = rectEdit(panel, fp, { ...fpr, y: fpr.y - 300 }, "front");
assert(raisedFace.patch.zMm === 700 && raisedFace.patch.depthMm === undefined, "…moved up, it is raised");
const widerFace = rectEdit(panel, fp, { ...fpr, widthMm: 3600 }, "front");
assert(widerFace.patch.widthMm === 3600, "…its width is its face's");
const frontBase: ShapePart = { ...panel, zMm: undefined };
const fbb = elevationBoxes([frontBase], 2000, "front")[0];
const fbr = boxRect(fbb);
const ftb = rectEdit(frontBase, fbb, { ...fbr, y: fbr.y - 300, depthMm: 2600 }, "front");
assert(ftb.itemHeightMm === 2600 && ftb.patch.depthMm === 2600, "a front base's top edge is its face height and the item's height");
assert(elevationBoxes([bar[0], { ...panel, rotation: 30 }], 1100, "front")[1].front?.asItself === false, "turned on the plan, it is a box in front");
assert(elevationBoxes([bar[0], { ...panel, bendDeg: 60 }], 1100, "front")[1].across === null, "…and so is a bent one");
const arch: ShapePart = { id: "a", plane: "front", shape: "half-circle", diameterMm: 2400, x: 0, y: 0, rotation: 0, zMm: 0 };
const ab = elevationBoxes([bar[0], arch], 1100, "front")[1];
const archTaller = rectEdit(arch, ab, { ...boxRect(ab), y: boxRect(ab).y - 150, depthMm: 1500 }, "front");
assert(archTaller.patch.diameterMm === 3000, "a round face is resized whole: an arch 1.5 m tall is ⌀3 m");
const petalPart: ShapePart = { id: "p", plane: "front", shape: "custom", outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: -2000 }], widthMm: 1000, depthMm: 2000, x: 0, y: 0, rotation: 0, zMm: 0 };
const pbx = elevationBoxes([bar[0], petalPart], 1100, "front")[1];
const petalWide = rectEdit(petalPart, pbx, { ...boxRect(pbx), widthMm: 1500 }, "front");
assert(petalWide.patch.widthMm === 1500 && petalWide.patch.outline?.length === 3 && petalWide.patch.depthMm === 2000, "a hand-drawn face is rescaled across");
const tile = placedFront("half-circle", { x: 500, y: -100 }, "front", -200);
assert(tile.plane === "front" && tile.diameterMm === 2400 && tile.y === -200 && (tile.zMm ?? 0) === 0 && tile.x === 500, "a half-circle clicked low stands on the floor");
const high = placedFront("rect", { x: 0, y: -2000 }, "front", 0);
assert(high.zMm === 1400 && high.widthMm === 1200 && high.depthMm === 1200, "a panel clicked high is centred there");
const drawn = drawnFront([{ x: 0, y: -100 }, { x: 1000, y: -100 }, { x: 500, y: -1800 }], undefined, 0)!;
assert(drawn.plane === "front" && drawn.shape === "custom" && drawn.zMm === 100 && drawn.depthMm === 1700 && drawn.x === 500 && drawn.y === 0, "a free drawing in front is a front custom shape at its height");
assert(drawnFront([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }], undefined, 0) === null, "…none under 10 mm");
// The plan's grips on a front band (review I3): a flat one's width is its face's, its depth its
// thickness; a bent or face-turned one's box is no one number — its grips change nothing.
const flatBand = bandResize(panel, { widthMm: 3000, depthMm: 30 }, { x: 0, y: -300, widthMm: 3600, depthMm: 30 });
assert(flatBand.widthMm === 3600 && flatBand.thicknessMm === undefined, "a flat band's width grip is its face's width");
assert(bandResize(panel, { widthMm: 3000, depthMm: 30 }, { x: 0, y: -290, widthMm: 3000, depthMm: 50 }).thicknessMm === 50, "…its depth grip its thickness");
assert(Object.keys(bandResize({ ...panel, bendDeg: 90 }, { widthMm: 1910, depthMm: 560 }, { x: 200, y: -200, widthMm: 2400, depthMm: 760 })).length === 0, "a bent band's grips change nothing");
assert(bandResize({ ...panel, faceTurnDeg: 30 }, { widthMm: 3400, depthMm: 30 }, { x: 0, y: -300, widthMm: 3800, depthMm: 30 }).widthMm === undefined, "…nor a face-turned band's width grip");
assert(faceSized(panel, { heightMm: 2600 }).depthMm === 2600 && faceSized(arch, { heightMm: 1500 }).diameterMm === 3000, "faceSized: a face's height by its own measure");
assert(faceSized(petalPart, { heightMm: 1000 }).outline?.length === 3 && faceSized(petalPart, { heightMm: 1000 }).depthMm === 1000, "…a hand-drawn one rescaled");
console.log("elevation self-check passed");
