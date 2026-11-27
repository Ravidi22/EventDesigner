// npm run check:shape-list — the self-check of ./shape-list.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { MapAppearance, Product, ShapePart } from "./types";
import type { Point } from "../studio/hall";
import { customShapeBounds, placedPartOutline, sampledBounds, placedPartOutlines, resolveFootprint, footprintBounds } from "../studio/footprint";
import { bakesTurn, drawnBounds, flipShapes, lookOf, onLines, patchedPart, polylines, promotionLoss, remapBlockedSides, reshaped, restackShapes, shapesOf, turnedAbout, upright } from "./shape-list";

// ponytail: self-check. Run: npm run check:shape-list
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, m: string) => assert(Math.abs(a - b) < 2, `${m}: ${a} vs ${b}`);
const row = (appearance: Partial<MapAppearance>, dimensions: Product["dimensions"] = { widthMm: 1600, depthMm: 900, heightMm: 750 }): Product =>
  ({ id: "p", name: "t", category: "tables", dimensions, variants: [], appearance: { shape: "rect", content: "none", ...appearance } }) as unknown as Product;
const box = (p: Product) => footprintBounds(resolveFootprint(p));
const roundTrip = (p: Product) => ({ ...p, ...lookOf(p, shapesOf(p)) });

// A rectangle with a round end comes back as it went in.
const withPart = row({ parts: [{ id: "q", shape: "circle", diameterMm: 900, x: 800, y: 0, rotation: 0 }] });
const back = roundTrip(withPart);
near(box(back).w, box(withPart).w, "round trip width");
near(box(back).h, box(withPart).h, "round trip depth");
assert(back.appearance?.parts?.[0].x === 800, "part offset kept");

// A hand-drawn base comes back where it was drawn relative to its part.
const drawn = row({ shape: "custom", outline: [{ x: 5000, y: 5000 }, { x: 6000, y: 5000 }, { x: 6000, y: 5500 }], parts: [{ id: "q", shape: "rect", widthMm: 400, depthMm: 400, x: 700, y: 0, rotation: 0 }] });
const drawnBack = roundTrip(drawn);
near(box(drawnBack).w, box(drawn).w, "custom base round trip");

// Deleting the base makes the next shape the base, at its own size.
const list = shapesOf(withPart);
const promoted = lookOf(withPart, list.slice(1));
assert(promoted.appearance.shape === "circle" && promoted.dimensions.diameterMm === 900 && !promoted.appearance.parts, "next shape promoted");

// Each shape keeps its OWN colours: the base's as baseStyle (never the item's style), a part's on
// the part — through a round trip, a promotion to base, and a turn baked into an outline.
const painted = row({ style: { fill: "#ffffff" }, baseStyle: { fill: "#111111" }, parts: [{ id: "q", shape: "circle", diameterMm: 900, x: 800, y: 0, rotation: 0, style: { stroke: "#aa0000" } }] });
const paintedBack = roundTrip(painted);
assert(paintedBack.appearance?.baseStyle?.fill === "#111111" && paintedBack.appearance?.style?.fill === "#ffffff", "base colour kept apart from the item's");
assert(paintedBack.appearance?.parts?.[0].style?.stroke === "#aa0000", "part colour kept");
const paintedList = shapesOf(painted);
assert(lookOf(painted, paintedList.slice(1)).appearance.baseStyle?.stroke === "#aa0000", "a promoted part brings its colour to the base");
assert(upright({ ...paintedList[0], shape: "custom", outline: [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 0, y: 400 }], rotation: 30 }).style?.fill === "#111111", "a baked turn keeps the colour");

// A quarter-turned rectangle is the same rectangle, width and depth swapped — no outline needed.
const q = upright({ ...shapesOf(row({}))[0], rotation: 90 });
assert(q.shape === "rect" && q.widthMm === 900 && q.depthMm === 1600 && q.rotation === 0, "quarter turn swaps");

// Turned 30°, it is baked into the outline the canvas showed.
const t = shapesOf(row({}))[0];
const baked = upright({ ...t, rotation: 30 });
const shown = sampledBounds([placedPartOutline({ ...t, rotation: 30 })]);
assert(baked.shape === "custom" && baked.rotation === 0, "turned base baked");
near(baked.widthMm ?? 0, shown.w, "baked width");
near(baked.depthMm ?? 0, shown.h, "baked depth");
const bakedRow = { ...row({}), ...lookOf(row({}), [{ ...t, rotation: 30 }]) };
near(box(bakedRow).w, shown.w, "baked row draws what was shown");

// A full circle has no turn to bake.
const c = upright({ id: "c", shape: "circle", diameterMm: 1000, x: 0, y: 0, rotation: 45 });
assert(c.shape === "circle" && c.rotation === 0, "circle stays a circle");

// Flips, judged by what is DRAWN: the flipped shapes' lines are the originals' mirrored.
const drawnLines = (list: ShapePart[]) => polylines(list.flatMap(placedPartOutlines));
const flipBoth = (list: ShapePart[], m: string) => {
  for (const axis of ["horizontal", "vertical"] as const) {
    const c = drawnBounds(list);
    const across = (p: Point): Point => (axis === "horizontal" ? { x: 2 * c.cx - p.x, y: p.y } : { x: p.x, y: 2 * c.cy - p.y });
    const want = drawnLines(list).map((l) => l.map(across));
    const got = drawnLines(flipShapes(list, list.map((x) => x.id), axis));
    assert(onLines(got, want, 3) && onLines(want, got, 3), `${m} flips (${axis})`);
  }
};
const quarter: ShapePart = { id: "q", shape: "quarter-circle", diameterMm: 2000, x: 300, y: -200, rotation: 0 };
const flippedQ = flipShapes([quarter], ["q"], "horizontal")[0];
assert(flippedQ.shape === "quarter-circle", "a quarter-circle flips as a turn — it is symmetric about its diagonal");
assert(flippedQ.x === 300 && flippedQ.y === -200, "a shape flipped alone stays where it is");
flipBoth([quarter], "a quarter-circle");
const rect: ShapePart = { id: "r", shape: "rect", widthMm: 1600, depthMm: 900, x: 0, y: 0, rotation: 30 };
const flippedR = flipShapes([rect], ["r"], "horizontal")[0];
assert(flippedR.shape === "rect" && flippedR.rotation === 330, `a turned rectangle flips to the opposite turn (${flippedR.rotation})`);
assert(flipShapes([{ ...rect, rotation: 0 }], ["r"], "vertical")[0].rotation === 0, "a square-standing rectangle flipped stays at 0°");
assert(flipShapes([{ id: "h", shape: "half-circle", diameterMm: 2000, x: 0, y: 0, rotation: 0 }], ["h"], "vertical")[0].rotation === 180, "a half-circle flipped top to bottom faces the other way");
flipBoth([rect], "a turned rectangle");
flipBoth([{ id: "h", shape: "half-circle", diameterMm: 2000, x: 0, y: 0, rotation: 20 }], "a turned half-circle");
const tri: ShapePart = { id: "t", shape: "custom", outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 600 }], widthMm: 1000, depthMm: 600, x: 500, y: 300, rotation: 0 };
assert(flipShapes([tri], ["t"], "vertical")[0].shape === "custom", "a lopsided hand-drawn shape is redrawn");
flipBoth([tri], "a right triangle");
flipBoth([{ ...tri, id: "b", edgeCurves: [{ c1: { x: 300, y: -200 }, c2: { x: -300, y: -200 } }, null, null] }], "a bowed side");
flipBoth([{ id: "s", shape: "circle", diameterMm: 3000, arc: { sweepDeg: 120, bandMm: 0 }, hollow: { bandMm: 600 }, x: 0, y: 0, rotation: 40 }], "a turned hollow slice");
flipBoth([{ id: "u", shape: "rect", widthMm: 2400, depthMm: 1200, hollow: { bandMm: 600, openSides: [1] }, x: 0, y: 0, rotation: 15 }], "a rectangle open on one side");
flipBoth([quarter, rect, tri], "three together");
flipBoth([{ id: "l", shape: "line", widthMm: 2000, depthMm: 20, x: 300, y: -200, rotation: 30 }], "a turned line");
// Lines only: a |_| flipped top to bottom is open at the BOTTOM — not the box it would close into,
// which is its own mirror image either way.
const cup: ShapePart = { id: "c", shape: "custom", open: true, outline: [{ x: 0, y: 0 }, { x: 0, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 0 }], widthMm: 2000, depthMm: 1000, x: 0, y: 0, rotation: 0 };
const cupDown = flipShapes([cup], ["c"], "vertical")[0];
assert(cupDown.open === true, "a lines-only shape stays lines only when flipped");
assert(cupDown.shape === "custom" && (cupDown.rotation === 180 || cupDown.outline!.some((v) => v.y < cupDown.y)), "the open side goes to the bottom");
flipBoth([cup], "a lines-only |_|");
flipBoth([{ ...tri, id: "o", open: true }], "a lines-only lopsided shape");
const openBack = roundTrip(row({ shape: "custom", open: true, outline: cup.outline }));
assert(openBack.appearance?.open === true && resolveFootprint(openBack).kind === "custom", "lines only survives the round trip");
assert((resolveFootprint(openBack) as { open?: boolean }).open === true, "…and reaches the footprint every surface draws");

// A shape's own height and body (the element model) ride the list in and out: a round base with
// a bowl's profile, a part raised a metre — and baked into a hand-drawn shape when a turned one is
// stood upright.
const bowl = row({ shape: "circle", revolve: [{ r: 0.4, z: 0 }, { r: 1, z: 1 }], parts: [{ id: "s", shape: "rect", widthMm: 600, depthMm: 200, x: 0, y: -600, rotation: 0, zMm: 1000, heightMm: 40 }] }, { diameterMm: 1200, heightMm: 900 });
const bowlShapes = shapesOf(bowl);
assert(bowlShapes[0].revolve?.length === 2 && bowlShapes[1].zMm === 1000 && bowlShapes[1].heightMm === 40, "the base's body and a part's height open on the canvas");
const bowlBack = roundTrip(bowl);
assert(bowlBack.appearance?.revolve?.length === 2 && bowlBack.appearance.parts?.[0].zMm === 1000 && bowlBack.appearance.parts?.[0].heightMm === 40, "…and are saved back");
const turnedPart = { ...bowlShapes[1], shape: "trapezoid" as const, rotation: 30 };
const bakedBack = lookOf(bowl, [turnedPart, bowlShapes[0]]);
assert(bakedBack.appearance.shape === "custom" && bakedBack.appearance.parts?.[0].revolve?.length === 2 && bakedBack.appearance.parts?.[0].zMm === undefined, "a turned first shape is baked with nothing lost; the bowl behind it keeps its body (the base has no z)");

// THE FRONT PLANE (backdrops S2): a front first shape is the row's base — its face height the
// row's height, its thickness the row's depth.
const wall = row({ shape: "rect", plane: "front", bendDeg: 40 }, { widthMm: 4000, depthMm: 30, heightMm: 2600 });
const ws = shapesOf(wall);
assert(ws[0].plane === "front" && ws[0].widthMm === 4000 && ws[0].depthMm === 2600 && ws[0].thicknessMm === 30 && ws[0].bendDeg === 40 && ws[0].x === 0 && ws[0].y === 0, "a front base opens as its face, 30 thick, bent 40°");
const wBack = { ...wall, ...lookOf(wall, ws) };
assert(
  wBack.dimensions.widthMm === 4000 && wBack.dimensions.depthMm === 30 && wBack.dimensions.heightMm === 2600 && wBack.appearance?.plane === "front" && wBack.appearance?.bendDeg === 40,
  `…and saves back the same (${JSON.stringify(wBack.dimensions)})`,
);
// A petal drawn by hand as the base: its face outline is kept; its height is its box's.
const petal = row({ shape: "custom", plane: "front", outline: [{ x: 0, y: 0 }, { x: 800, y: -2000 }, { x: 1600, y: 0 }] }, { widthMm: 1600, depthMm: 20, heightMm: 2000 });
const ps = shapesOf(petal);
assert(ps[0].x === 0 && ps[0].y === 0 && ps[0].depthMm === 2000, "a hand-drawn front base stands at the origin, its face 2000 high");
const pBack = { ...petal, ...lookOf(petal, ps) };
assert(pBack.dimensions.heightMm === 2000 && pBack.dimensions.depthMm === 20 && pBack.dimensions.widthMm === 1600 && pBack.appearance?.outline?.length === 3, "a hand-drawn front base round-trips");
// Layers behind a front base keep their places (picture 5: two more panels behind it).
const layered: ShapePart[] = [ws[0], { ...ws[0], id: "b", y: -300 }, { ...ws[0], id: "c", y: -600 }];
const lb = shapesOf({ ...wall, ...lookOf(wall, layered) });
assert(lb.length === 3 && lb[1].y === -300 && lb[2].y === -600 && lb.every((s) => s.plane === "front"), "three layers come back at their depths");
// The first shape turned 30° on the plan: the whole drawing turns back about it, nothing moves
// relative to it.
const turned = turnedAbout(layered, { x: 0, y: 0 }, 30);
assert(turned[0].rotation === 30 && Math.abs(turned[2].x - 300) < 1, "turnedAbout turns places and shapes");
const tb = shapesOf({ ...wall, ...lookOf(wall, turned) });
assert(tb[0].rotation === 0 && Math.abs(tb[2].y - -600) < 2 && Math.abs(tb[2].x) < 2 && tb[2].rotation === 0, `a turned front base is stored upright, the drawing turned back about it (${tb[2].x},${tb[2].y},${tb[2].rotation})`);
// A plan first shape leaves no front fields behind; a front one behind it stays front.
const asPlan = lookOf(wall, [{ ...ws[0], plane: undefined, thicknessMm: undefined, bendDeg: undefined, depthMm: 600 }, { ...ws[0], id: "f", y: -400 }]);
assert(asPlan.appearance.plane === undefined && asPlan.appearance.bendDeg === undefined && asPlan.dimensions.depthMm === 600 && asPlan.appearance.parts?.[0].plane === "front", "a plan first shape leaves no front fields behind");

// SH-10 (QA 2026-11-20): a reshape keeps ONLY the numbers the new kind is drawn from. A ⌀180
// round made a square and typed to 120 was saved {diameterMm 1800, widthMm 1200} and drawn
// 180×180 — a square's side is read diameter first — and a stale diameter makes any row a ROUND
// table to the utilisation, the venue-table match and the studio.
const round = row({ shape: "circle" }, { diameterMm: 1800, heightMm: 750 });
const [r0] = shapesOf(round);
const sq = patchedPart(reshaped(r0, "square"), { widthMm: 1200 });
assert(sq.diameterMm === undefined, `the square keeps no diameter (${sq.diameterMm})`);
const sqRow = { ...round, ...lookOf(round, [sq]) };
assert(sqRow.dimensions.diameterMm === undefined, `…nor does the row it is saved as (${JSON.stringify(sqRow.dimensions)})`);
near(box(sqRow).w, 1200, "the square is drawn at the side typed");
near(box(sqRow).h, 1200, "…both ways");
const toRound = reshaped(shapesOf(row({}))[0], "circle");
assert(toRound.widthMm === undefined && toRound.depthMm === undefined && toRound.diameterMm === 1600, `a 160×90 made round is ⌀160 and nothing else (${JSON.stringify(toRound)})`);
const roundRow = { ...row({}), ...lookOf(row({}), [toRound]) };
assert(roundRow.dimensions.widthMm === undefined && roundRow.dimensions.depthMm === undefined && roundRow.dimensions.diameterMm === 1600, `…and saved so (${JSON.stringify(roundRow.dimensions)})`);
const byHand = { ...round, ...lookOf(round, [{ ...r0, shape: "custom", outline: [{ x: -900, y: -900 }, { x: 900, y: -900 }, { x: 0, y: 900 }], widthMm: 1800, depthMm: 1800 }]) };
assert(byHand.dimensions.diameterMm === undefined && byHand.dimensions.widthMm === 1800, "a round redrawn by hand keeps no diameter");
// A row from before round shapes had a diameter (width and depth only) opens at its size and is
// saved as the diameter — never as no size at all.
const legacy = row({ shape: "half-circle" }, { widthMm: 1200, depthMm: 600, heightMm: 750 });
assert(shapesOf(legacy)[0].diameterMm === 1200, `a legacy half-circle opens at its width (${shapesOf(legacy)[0].diameterMm})`);
const legacyBack = roundTrip(legacy);
assert(legacyBack.dimensions.diameterMm === 1200 && legacyBack.dimensions.widthMm === undefined, `…and is saved as its diameter (${JSON.stringify(legacyBack.dimensions)})`);
near(box(legacyBack).w, 1200, "…at the size it had");
// A front base keeps its thickness whatever its face is.
const frontRound = lookOf(wall, [{ ...ws[0], shape: "half-circle", diameterMm: 2400, widthMm: undefined, depthMm: undefined }]);
assert(frontRound.dimensions.diameterMm === 2400 && frontRound.dimensions.depthMm === 30 && frontRound.dimensions.widthMm === undefined, `a round front base: its diameter and its thickness (${JSON.stringify(frontRound.dimensions)})`);
assert(lookOf({ ...wall, dimensions: { ...wall.dimensions, diameterMm: 999 } }, ws).dimensions.diameterMm === undefined, "a square front base keeps no diameter");

// SH-11: a square is ONE number — its side. Typed as a depth or a width, both follow; a row the
// drawer stored with two numbers opens as the square it is drawn as.
const side = patchedPart({ id: "s", shape: "square", widthMm: 1200, depthMm: 1200, x: 0, y: 0, rotation: 0 }, { depthMm: 2000 });
assert(side.widthMm === 2000 && side.depthMm === 2000, `typing a square's depth types its side (${side.widthMm}×${side.depthMm})`);
const twoNumbers = shapesOf(row({ shape: "square" }, { widthMm: 1200, depthMm: 600, heightMm: 750 }))[0];
assert(twoNumbers.widthMm === 1200 && twoNumbers.depthMm === 1200, `a square row stored 120×60 opens 120 a side, as drawn (${twoNumbers.widthMm}×${twoNumbers.depthMm})`);
const made = reshaped(shapesOf(row({}))[0], "square");
assert(made.widthMm === 1600 && made.depthMm === 1600, `a 160×90 made a square is 160 a side (${made.widthMm}×${made.depthMm})`);

// SH-8: the stack never makes another shape the base. "To the back" stops just above it; the base
// itself stays first whatever is asked of it. A shelf a metre up sent "to the back" became the base
// — its height and its place above the floor thrown away.
const ids = (l: ShapePart[]) => l.map((s) => s.id).join("");
const stack: ShapePart[] = [
  { id: "a", shape: "rect", widthMm: 1600, depthMm: 600, x: 0, y: 0, rotation: 0 },
  { id: "b", shape: "rect", widthMm: 1600, depthMm: 250, x: 0, y: -400, rotation: 0, zMm: 1000, heightMm: 40 },
  { id: "c", shape: "circle", diameterMm: 600, x: 900, y: 0, rotation: 0 },
];
assert(ids(restackShapes(stack, ["c"], "back")) === "acb", `to the back: just above the base (${ids(restackShapes(stack, ["c"], "back"))})`);
assert(ids(restackShapes(stack, ["b"], "back")) === "abc", "…a shape already there stays");
assert(ids(restackShapes(stack, ["a"], "front")) === "abc" && ids(restackShapes(stack, ["a"], "forward")) === "abc", "the base stays first");
assert(ids(restackShapes(stack, ["c"], "backward")) === "acb" && ids(restackShapes(stack, ["b"], "backward")) === "abc", "one step back stops above the base");
assert(ids(restackShapes(stack, ["b"], "front")) === "acb" && ids(restackShapes(stack, ["b"], "forward")) === "acb", "to the front as before");
assert(promotionLoss(stack[1]).length === 2 && promotionLoss(stack[2]).length === 0, `a raised shelf made the base loses its height and its place above the floor (${promotionLoss(stack[1])})`);

// SH-9: a turn a shape is its own image under is no turn — it stays the shape it is; any other turn
// of a drawn shape is baked into a free drawing, and the editor can say so before it happens.
const hexAt = (rotation: number, depthMm = 1000): ShapePart => ({ id: "h", shape: "hexagon", widthMm: 1200, depthMm, x: 50, y: 70, rotation });
assert(upright(hexAt(180)).shape === "hexagon" && upright(hexAt(180)).rotation === 0, "a hexagon turned 180° stays a hexagon");
assert(upright(hexAt(60, Math.round((1200 * Math.sqrt(3)) / 2))).shape === "hexagon", "…a regular one turned 60° too");
assert(upright(hexAt(60)).shape === "custom" && bakesTurn(hexAt(60)), "a hexagon turned 60° that is not regular is baked, and the editor knows it");
assert(!bakesTurn(hexAt(180)) && !bakesTurn({ ...rect, rotation: 90 }) && !bakesTurn({ id: "c", shape: "circle", diameterMm: 900, x: 0, y: 0, rotation: 33 }), "…the turns that are no turn are not");
assert(upright({ id: "t", shape: "triangle", widthMm: 1200, depthMm: 600, x: 0, y: 0, rotation: 180 }).shape === "custom", "a triangle turned upside down is baked");
// What the editor showed is what is saved: a turned first shape's seat sides were dropped on save
// (even at 180°), while the editor drew them blocked.
const blockedRow = row({ blockedSides: [2] });
assert(lookOf(blockedRow, [{ ...shapesOf(blockedRow)[0], rotation: 180 }]).appearance.blockedSides?.join() === "2", "a turned first shape keeps its seat sides");
assert(lookOf(blockedRow, [{ ...shapesOf(blockedRow)[0], rotation: 30 }]).appearance.blockedSides?.join() === "2", "…baked or not");

// SH-13: blocked seat sides follow THEIR shape when the list changes — base first, then each shape,
// as seatSides numbers them. Before, an index past the end was dropped and every other kept its
// number: a head table's blocked front became its side.
const head = row({ parts: [{ id: "end", shape: "circle", diameterMm: 900, x: 800, y: 0, rotation: 0 }] });
const hs = shapesOf(head);
const rr: ShapePart = { id: "r", shape: "rect", widthMm: 600, depthMm: 400, x: -900, y: 0, rotation: 0 };
assert(remapBlockedSides(head, hs, [hs[0]], [2]).join() === "2", "the end taken away: the front stays blocked");
assert(remapBlockedSides(head, hs, [hs[1]], [4]).join() === "0", "the base taken away: the end's blocked side is the new base's");
assert(remapBlockedSides(head, [...hs, rr], [hs[0], rr, hs[1]], [2, 4, 6]).join() === "2,5,8", `reordered: each side moves with its shape (${remapBlockedSides(head, [...hs, rr], [hs[0], rr, hs[1]], [2, 4, 6])})`);
assert(remapBlockedSides(head, hs, [hs[0], { ...hs[1], x: 1200 }], [2, 4]).join() === "2,4", "moved: nothing renumbers");
// Redrawn point by point: a side is blocked where it lies on a side that was. A point added on a
// straight side and left on it changes no seat side (seatSides joins it), one pulled out of the line
// makes the top two sides and the front side 3; a side no longer where any blocked one was is open.
const drawnAs = (outline: Point[]): ShapePart => {
  const b = customShapeBounds(outline);
  return { ...hs[0], shape: "custom", outline, widthMm: Math.round(b.w), depthMm: Math.round(b.h), x: Math.round(b.cx), y: Math.round(b.cy) };
};
const onLine = drawnAs([{ x: -800, y: -450 }, { x: 0, y: -450 }, { x: 800, y: -450 }, { x: 800, y: 450 }, { x: -800, y: 450 }]);
assert(remapBlockedSides(head, hs, [onLine, hs[1]], [2, 4], hs[0].id).join() === "2,4", `a point added on the top, left on its line: nothing moves (${remapBlockedSides(head, hs, [onLine, hs[1]], [2, 4], hs[0].id)})`);
const pulled = drawnAs([{ x: -800, y: -450 }, { x: 0, y: -600 }, { x: 800, y: -450 }, { x: 800, y: 450 }, { x: -800, y: 450 }]);
assert(remapBlockedSides(head, hs, [pulled, hs[1]], [2, 4], hs[0].id).join() === "3,5", `…pulled out: the front is side 3, the end's side 5 (${remapBlockedSides(head, hs, [pulled, hs[1]], [2, 4], hs[0].id)})`);
assert(remapBlockedSides(head, hs, [pulled, hs[1]], [0, 4], hs[0].id).join() === "5", "…and the blocked top it split is open: neither half is where it was");
// The base stands upright from a half turn: its sides are read as stored, wherever the editor started.
const halfTurned = [{ ...shapesOf(blockedRow)[0], rotation: 180 }];
const redrawnTurned = { ...drawnAs(placedPartOutline(halfTurned[0]).outline), id: halfTurned[0].id };
// (its outline now starts at the corner the turn put first, so the bottom is the new side 0)
assert(remapBlockedSides(blockedRow, halfTurned, [redrawnTurned], [2], halfTurned[0].id).join() === "0", `a half-turned rectangle redrawn keeps its blocked bottom (${remapBlockedSides(blockedRow, halfTurned, [redrawnTurned], [2], halfTurned[0].id)})`);
console.log("shape-list: ok");
