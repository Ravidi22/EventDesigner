// npm run check:stage — the self-check of ./stage.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point, StageBuild, StageStair } from "./types";
import type { Product } from "../catalog/types";
import { defaultFront, signedArea, type DeckType, type LaidDeck } from "../studio/stage-fill";
import { cleanOutline, halfRoundArea, pushSide, splitSide } from "../studio/stage-draw";
import { CHAIR_OFFSET_MM, CHAIR_W_MM } from "../studio/seating";
import { BENCH_DEPTH_MM, BENCH_TABLE_DEPTH_MM, BENCH_TOP_MM, SEAT_WIDTH_MM, SOFA_SEAT_MM } from "./bench";
import { benchInRoom, benchSeats, besideNeighbours, carryLevels, carryPieces, deckOverlaps, deckTypeOf, defaultEdgeItems, defaultStair, edgeGaps, edgeItemInRoom, edgeItemShape, edgeItemStrokes, edgeKind, fillGaps, freeStretch, insidePoly, isRoundPiece, isShapedPiece, itemAlong, itemAt, itemSidePoint, itemSpan, layStage, len, mergeStages, mergeTouching, missingByShape, onBoundary, openEdges, pieceOutline, pieceProduct, placedPiece, placeEdgeItem, plainRect, rad, railingRuns, rectOutline, reframeStage, rehomeEdgeItems, RISER_MAX_MM, roundOutline, scaleStage, separateEdgeItems, settleEdgeItems, shapedRect, shareSide, sidePosition, skirtMm, STAGE_TOUCH_MM, stageAreaMm2, stageBox, stageCorners, stageDeckCounts, stageDecksInRoom, stageFromArea, stageFromPiece, stageHeight, stageIsOnePiece, stageOutlineInRoom, stageRect, stageSide, stageSides, STAIR_WIDTH_MM, stairFits, stairShape, stairStepOf, stickTogether, tidyEdgeItems, toRoom, toStageFrame, touchingStages, TREAD_MM, trimSeams, type DeckLookup, type DoorOpening, type EdgeItemShape, type StageLayout, type StagePlacement, type WallDistance } from "./stage";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const decks: Record<string, DeckType> = {
  big: { id: "big", widthMm: 2000, depthMm: 1000, heightMm: 600 },
  small: { id: "small", widthMm: 1000, depthMm: 1000, heightMm: 600 },
};
const deckOf: DeckLookup = (id) => decks[id];
const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const place = (area: Point[], front: number, mirrored = false): StagePlacement => {
  const s = stageFromArea(area, front);
  return { id: "s", variantId: "big", layer: "floor" as const, quantity: 1, scale: 1, position: s.position, rotation: s.rotation, mirrored, stage: { outline: s.outline, front: s.front, decks: ["big", "small"] } };
};

// A 6×4 drawn with its front along the bottom edge (y = 4000) faces down the room.
const down = place(rect(1000, 1000, 6000, 4000), 2);
assert(down.position.x === 4000 && down.position.y === 3000, "a stage stands at the middle of what was drawn");
assert(stageRect(down.stage)?.widthMm === 6000 && stageRect(down.stage)?.depthMm === 4000, "…is stored as a 6×4 rectangle, front first");
assert(down.rotation === 180, "…turned to face the edge that was chosen");
const room = stageOutlineInRoom(down);
const xs = room.map((p) => Math.round(p.x));
const ys = room.map((p) => Math.round(p.y));
assert(Math.min(...xs) === 1000 && Math.max(...xs) === 7000 && Math.min(...ys) === 1000 && Math.max(...ys) === 5000, "…and covers exactly the area drawn");
const back = toStageFrame(down, toRoom(down, { x: 123, y: -456 }));
assert(Math.abs(back.x - 123) < 1e-6 && Math.abs(back.y + 456) < 1e-6, "room and stage frame are each other's inverse");
const flippedFrame = { ...down, mirrored: true };
const back2 = toStageFrame(flippedFrame, toRoom(flippedFrame, { x: 123, y: -456 }));
assert(Math.abs(back2.x - 123) < 1e-6, "…flipped too");

const counts = stageDeckCounts(down.stage, deckOf);
assert(counts.get("big")?.length === 12 && !counts.has("small"), "a 6×4 is twelve big decks");
assert(stageHeight(down.stage, deckOf) === 600, "a stage with no height of its own stands at its decks' height");

// The same stage, clicked the other way round, and flipped: the same build.
const ccw = place([...rect(1000, 1000, 6000, 4000)].reverse(), 1);
assert(stageDeckCounts(ccw.stage, deckOf).get("big")?.length === 12, "clicked the other way round, the same build");
const inRoom = stageDecksInRoom(down, deckOf);
const flipped = stageDecksInRoom({ ...down, mirrored: true }, deckOf);
const key = (ds: LaidDeck[]) => ds.map((d) => `${d.centre.x},${d.centre.y}`).sort().join(" ");
assert(key(inRoom) === key(flipped), "a flipped rectangle stands on the same decks");
assert(inRoom.every((d) => d.centre.x > 1000 && d.centre.x < 7000 && d.centre.y > 1000 && d.centre.y < 5000), "…all of them inside the area");

// Odd size: rows from the front, so the half metre is at the back — the TOP, for a stage facing down.
const odd = place(rect(0, 0, 6000, 4500), 2);
assert(stageDecksInRoom(odd, deckOf).every((d) => d.centre.y > 500), "the leftover strip is at the back of the stage, away from its front");

// An L keeps its outline and its front.
const l = place(
  [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 2000 },
    { x: 2000, y: 2000 },
    { x: 2000, y: 4000 },
    { x: 0, y: 4000 },
  ],
  0,
);
assert(stageRect(l.stage) === null && l.stage.outline.length === 6, "an L stays an L");
assert(stageDeckCounts(l.stage, deckOf).get("big")?.length === 6, "…and is six decks");
assert(stageDeckCounts({ ...down.stage, decks: ["gone"] }, deckOf).size === 0, "a stage whose decks left the catalog lays nothing, and does not throw");

// ── Levels: a 6×4 band stage at 40cm with a 4×2 drum riser at 80cm across its back.
const band: StagePlacement = {
  ...place(rect(0, 0, 6000, 4000), 0),
  stage: { outline: rectOutline(6000, 4000), front: 0, decks: ["big"], heightMm: 400, levels: [{ id: "riser", outline: rect(-2000, 0, 4000, 2000), heightMm: 800 }] },
};
const bandLaid = layStage(band.stage, deckOf);
const onRiser = bandLaid.decks.filter((d) => d.level === "riser");
assert(onRiser.length === 4 && onRiser.every((d) => d.heightMm === 800), "a 4×2 riser is four decks at the riser's height");
assert(bandLaid.decks.length === 12 && bandLaid.decks.filter((d) => !d.level).every((d) => d.heightMm === 400), "…and the base is the other eight, at the base's");
const spill = layStage({ ...band.stage, levels: [{ id: "r", outline: rect(1000, 0, 4000, 2000), heightMm: 800 }] }, deckOf);
assert(spill.decks.filter((d) => d.level === "r").every((d) => d.centre.x < 3000), "a riser drawn past the stage's edge is laid only on the stage");

// ── Stairs.
const stair: StageStair = { id: "a", edge: 1, t: 0.5, widthMm: 1000 };
const shape = stairShape({ ...down.stage, heightMm: 600 }, stair, deckOf)!;
assert(shape.risers === 4 && shape.riserMm === 150 && shape.depthMm === 840, "60cm is four risers of 15cm — three treads, 84cm deep");
assert(shape.polygon.every((q) => q.x >= 3000 - 1), "a flight on the right-hand side stands outside it");
assert(shape.treads.length === 2, "…with a line across it between each tread");
// Its walking line: from the floor at its far side up to the edge, the arrowhead at the edge,
// standing in from both ends — the catalog's own flight is drawn with the same one.
const walkUp = shape.climb!;
assert(walkUp.arrow.from.x > shape.foot.x - 1 - 150 && walkUp.arrow.from.x < shape.foot.x && Math.abs(walkUp.arrow.from.y - shape.foot.y) < 1, "a flight's walking line starts at its foot on the floor, just in from the end");
assert(walkUp.arrow.head[0].x > shape.base.x && walkUp.arrow.head[0].x < walkUp.arrow.from.x && Math.abs(walkUp.arrow.head[0].x - shape.base.x - Math.min(840 * 0.12, 150)) < 1, "…and its arrowhead points at the deck, just out from the edge");
assert(walkUp.arrow.head.length === 3 && walkUp.arrow.dotR > 0 && !walkUp.slope, "…a filled head, a dot at the foot, and no slope on stairs");
const riserStair = stairShape(band.stage, { id: "r", level: "riser", edge: 0, t: 0.5, widthMm: 1000 }, deckOf)!;
assert(riserStair.riseMm === 400 && riserStair.polygon.every((q) => q.y <= 1), "a flight onto the riser climbs the difference, out from its front onto the base");
const cornered = stairShape(down.stage, { ...stair, t: 0.99 }, deckOf)!;
assert(cornered.polygon.every((q) => q.y <= 2001 && q.y >= -2001), "a flight put at a corner is slid back onto its side");
assert(stairShape({ ...down.stage, heightMm: 600 }, { ...stair, edge: 9 }, deckOf) === null, "a flight on an edge that no longer exists is not drawn");
const three = stairShape({ ...down.stage, heightMm: 600 }, { ...stair, risers: 3, widthMm: 1500 }, deckOf)!;
assert(three.risers === 3 && three.riserMm === 200 && three.depthMm === 560, "three steps set by hand: 20cm risers, two treads deep");
assert(Math.round(Math.hypot(three.polygon[1].x - three.polygon[0].x, three.polygon[1].y - three.polygon[0].y)) === 1500, "…and the width set by hand");
const whole = stairShape({ ...down.stage, heightMm: 600 }, { ...stair, edge: 0, full: true }, deckOf)!;
assert(Math.round(Math.hypot(whole.polygon[1].x - whole.polygon[0].x, whole.polygon[1].y - whole.polygon[0].y)) === 6000, "a full-width flight runs the whole side");
assert(skirtMm({ ...down, stage: { ...down.stage, stairs: [{ ...stair, edge: 0, full: true }] } }, deckOf, (q) => Math.abs(q.y - 1000)) === 8000, "…and leaves no skirt on it");

// Against the wall behind it (y = 5000 in the room), a stage facing down gets its default flight
// on a side, and a flight clicked on the back is refused.
const wallBehind: WallDistance = (p) => Math.abs(p.y - 1000);
const firstFlight = defaultStair(down, deckOf, wallBehind);
assert(!!firstFlight && firstFlight.edge !== 2 && firstFlight.edge !== down.stage.front, "a new stage gets a flight on a side");
const backEdge = (down.stage.front + 2) % 4;
assert(!stairFits(down, { id: "x", edge: backEdge, t: 0.5, widthMm: 1000 }, deckOf, wallBehind).ok, "…and none can be put against the wall behind it");

// ── Skirt: every open side, less the wall and the flights.
const skirted = skirtMm(down, deckOf, wallBehind);
assert(skirted === 6000 + 4000 + 4000, "a 6×4 against a wall is skirted on its front and both sides");
const withFlight = skirtMm({ ...down, stage: { ...down.stage, stairs: [stair] } }, deckOf, wallBehind);
assert(withFlight === skirted - 1000, "…less the metre a flight stands against");
const bandSkirt = openEdges(band, deckOf);
assert(bandSkirt.some((r) => r.level === "riser" && r.dropMm === 400 && r.lengthMm === 4000), "a riser's face is skirted too, at the difference in height");

// ── Railing: off unless the studio says above what.
assert(railingRuns(down, deckOf, null, wallBehind).length === 0, "no railing rule, no railing");
const rails = railingRuns({ ...down, stage: { ...down.stage, heightMm: 900 } }, deckOf, 800, wallBehind);
assert(rails.length === 2 && rails.every((r) => !r.front), "a 90cm stage over an 80cm rule is railed on its open sides, never its front");
assert(railingRuns(down, deckOf, 800, wallBehind).length === 0, "…and a 60cm one is not");

// ── Edge items: every open side finished.
let n = 0;
const nid = () => `i${++n}`;
const finish = defaultEdgeItems(down, deckOf, nid, wallBehind);
assert(finish.length === 3 && finish.every((it) => edgeKind(it) === "stairs" && it.full), "a new stage against a wall gets stairs along its three open sides");
const finished = { ...down, stage: { ...down.stage, stairs: finish } };
assert(edgeGaps(finished, deckOf, wallBehind).length === 0, "…and then nothing is left bare");
assert(edgeGaps(down, deckOf, wallBehind).reduce((t, g) => t + g.lengthMm, 0) === 14000, "a bare 6×4 against a wall has 14m of open edge");
const benches = fillGaps(down, deckOf, "bench", nid, wallBehind);
const bench = edgeItemShape(down.stage, benches[0], deckOf)!;
assert(bench.kind === "bench" && bench.depthMm === BENCH_TABLE_DEPTH_MM && bench.seats === Math.floor(bench.widthMm / SEAT_WIDTH_MM), "a banquette with chairs at it is table-deep, and seats one per 60cm");
assert(edgeItemShape(down.stage, { ...benches[0], bench: { back: { kind: "sofa" } } }, deckOf)!.depthMm === BENCH_DEPTH_MM, "…a sofa alone is seat-deep");
assert(bench.chairs.every((c) => Math.abs(c.y) < 2000 && 2000 - Math.abs(c.y) === CHAIR_OFFSET_MM), "…its chairs on the stage, beside it, like a table's");
assert(bench.chairs.length === bench.seats, "…with a chair drawn for every seat");
const fewer = edgeItemShape(down.stage, { ...benches[0], seats: 3 }, deckOf)!;
assert(fewer.chairs.length === 3, "…or as many as the designer set");
assert(edgeItemShape(down.stage, { ...benches[0], seats: 99 }, deckOf)!.seats === Math.floor(fewer.widthMm / CHAIR_W_MM), "…never more than fit");
const sideBench = edgeItemShape(down.stage, { id: "sb", kind: "bench", edge: 1, t: 0.5, widthMm: 0, full: true }, deckOf)!;
assert(sideBench.chairs.every((c) => c.x < 3000 && Math.abs(c.facingDeg) < 1), "…on the stage side of it, facing it and the room past it");
assert(bench.heightMm === BENCH_TOP_MM && bench.sofaSeats === 0 && bench.cushions.length === 0, "…its top at table height above the deck, and no sofa");
// Two sides, each its own: a sofa on the room side of the front banquette (edge 0, along the top,
// y = -2000) is sat on facing the room — cushions on the outer half of the strip, backrest toward
// the stage — while the chairs stay on the stage behind it. Seats add up; only chairs are chairs.
const twoSided = edgeItemShape(down.stage, { ...benches[0], bench: { back: { kind: "chairs", seats: 6 }, front: { kind: "sofa", seats: 4 } } }, deckOf)!;
assert(twoSided.seats === 10 && twoSided.chairs.length === 6 && twoSided.sofaSeats === 4, "a banquette with chairs behind and a sofa in front seats both, and packs only the chairs");
assert(twoSided.cushions.length === 4 && twoSided.cushions.every((q) => q.every((p) => p.y <= -2000 - BENCH_TABLE_DEPTH_MM / 2 + 1e-6)), "…the cushions on the room half of the strip");
assert(twoSided.backs.length === 1 && twoSided.backs[0].every((p) => Math.abs(p.y - (-2000 - BENCH_TABLE_DEPTH_MM / 2)) <= 80 + 1e-6), "…with the backrest toward the strip's stage half");
assert(twoSided.sofaHeightMm === SOFA_SEAT_MM && twoSided.bench?.front.kind === "sofa", "…a sofa seat at 46cm, and the layout says which side is which");
// U6 / QA BQ-3: its sofa side may be left out of the seating readout — the count only.
const loungeSide: StageStair = { ...benches[0], bench: { back: { kind: "chairs", seats: 6 }, front: { kind: "sofa", seats: 4, notSeating: true } } };
assert(benchSeats([{ ...down, stage: { ...down.stage, stairs: [loungeSide] } }], deckOf) === 6, "a stage banquette's sofa side that is not seating is out of the seating count");
assert(edgeItemShape(down.stage, loungeSide, deckOf)!.seats === 10, "…its sitters still seated there");
// QA BQ-7: carried into the room (for a run across two stages) its cushions and backrest go too.
const movedDown = { ...down, position: { x: down.position.x + 5000, y: down.position.y } } as StagePlacement;
const sofaInRoom = edgeItemInRoom(movedDown, twoSided);
assert(sofaInRoom.cushions.length === twoSided.cushions.length && Math.abs(sofaInRoom.cushions[0][0].x - toRoom(movedDown, twoSided.cushions[0][0]).x) < 1e-6 && Math.abs(sofaInRoom.backs[0][0].y - toRoom(movedDown, twoSided.backs[0][0]).y) < 1e-6, "an edge item carried into the room carries its cushions and backrest with it");
const frontChairs = edgeItemShape(down.stage, { ...benches[0], bench: { back: { kind: "none" }, front: { kind: "chairs", seats: 3 } } }, deckOf)!;
assert(frontChairs.chairs.length === 3 && frontChairs.chairs.every((c) => c.y < -2000 - BENCH_TABLE_DEPTH_MM && Math.abs(Math.abs(c.facingDeg) - 90) < 1), "chairs on the room side stand in the room, facing the banquette");
// The legacy form still reads: an old item's `seats` is its stage side's count, nothing in front.
const legacyItem = edgeItemShape(down.stage, { ...benches[0], seats: 5, heightMm: 600 }, deckOf)!;
assert(legacyItem.chairs.length === 5 && legacyItem.sofaSeats === 0 && legacyItem.heightMm === 600, "an edge item from before sides existed is unchanged: its seats are its back side's");
assert(edgeItemShape(down.stage, { ...benches[0], seats: 5, bench: { back: { kind: "sofa" } } }, deckOf)!.chairs.length === 0, "…and the new form wins where it speaks");
const rail = edgeItemShape(down.stage, { ...benches[0], kind: "barrier" }, deckOf)!;
const inward = rail.polygon.every((q) => Math.abs(q.x) <= 3001 && Math.abs(q.y) <= 2001);
assert(inward, "a barrier stands on the stage, inside its edge");
const clickedGap = itemAt({ ...down, stage: { ...down.stage, stairs: [{ id: "x", edge: 0, t: 0.25, widthMm: 2000 }] } }, deckOf, "bench", undefined, 0, 0.8, "y", wallBehind);
const cg = itemSpan(down.stage, clickedGap)!;
assert(Math.round(cg.from) === 2500 && Math.round(cg.to) === 6000, "a click in a bare stretch covers the whole stretch");
const barred = { ...down, stage: { ...down.stage, heightMm: 900, stairs: [{ id: "b", kind: "barrier" as const, edge: 1, t: 0.5, widthMm: 0, full: true }] } };
assert(railingRuns(barred, deckOf, 800, wallBehind).length === 1, "a side with a barrier needs no railing; the other still does");
assert(skirtMm(barred, deckOf, wallBehind) === 14000, "…and a barrier stands on the stage, so the skirt still hangs below it");

// ── One side, shared: items divide it, never stand through each other.
const frontFull: StageStair = { id: "ff", edge: 0, t: 0.5, widthMm: 0, full: true };
const benchMid: StageStair = { id: "bm", kind: "bench", edge: 0, t: 0.5, widthMm: 2000 };
const shared = shareSide({ ...down.stage, stairs: [frontFull, benchMid] }, "bm");
assert(shared.length === 3 && shared.filter((it) => edgeKind(it) === "stairs").length === 2, "a banquette clicked onto a full flight splits it in two");
const [halfA, halfB] = shared.filter((it) => edgeKind(it) === "stairs").map((it) => itemSpan(down.stage, it)!).sort((a, b) => a.from - b.from);
assert(Math.round(halfA.from) === 0 && Math.round(halfA.to) === 2000 && Math.round(halfB.from) === 4000 && Math.round(halfB.to) === 6000, "…each half running from its corner to the banquette");
assert(shared.some((it) => it.id === "ff") && shared.every((it) => !it.full), "…the first half keeping the flight's id, neither still the whole side");
assert(edgeGaps({ ...down, stage: { ...down.stage, stairs: shared } }, deckOf, wallBehind).filter((g) => g.edge === 0).length === 0, "…and the side is still covered end to end");
const benchEnd: StageStair = { id: "be", kind: "bench", edge: 0, t: 0.9, widthMm: 2000 };
const cutBack = shareSide({ ...down.stage, stairs: [frontFull, benchEnd] }, "be");
assert(cutBack.length === 2 && Math.round(itemSpan(down.stage, cutBack.find((it) => it.id === "ff")!)!.to) === 4000, "a banquette at the end cuts the flight back to meet it");
const swallowed = shareSide({ ...down.stage, stairs: [{ id: "sm", edge: 0, t: 0.5, widthMm: 1000 }, { id: "big", kind: "bench", edge: 0, t: 0.5, widthMm: 3000 }] }, "big");
assert(swallowed.length === 1 && swallowed[0].id === "big", "an item wholly under the kept one is gone");
const sliver = shareSide({ ...down.stage, stairs: [frontFull, { id: "almost", kind: "bench", edge: 0, t: 0.5, widthMm: 5600 }] }, "almost");
assert(sliver.length === 1, "…and so is a sliver too short to be anything");
const otherSide = shareSide({ ...down.stage, stairs: [{ id: "s1", edge: 1, t: 0.5, widthMm: 0, full: true }, benchMid] }, "bm");
assert(otherSide.length === 2 && otherSide[0].full === true, "an item on another side is untouched");
const between = freeStretch({ ...down.stage, stairs: [benchMid, { id: "l", edge: 0, t: 0.1, widthMm: 1000 }, { id: "r", edge: 0, t: 0.95, widthMm: 600 }] }, benchMid)!;
assert(Math.round(between.from) === 1100 && Math.round(between.to) === 5400, "the free stretch runs from the item before to the item after");
assert(freeStretch({ ...down.stage, stairs: [benchMid] }, benchMid)!.from === 0 && freeStretch({ ...down.stage, stairs: [benchMid] }, benchMid)!.to === 6000, "…and corner to corner with nothing else there");
const tidied = tidyEdgeItems({ ...down.stage, stairs: [frontFull, benchMid] });
assert(tidied.length === 3 && tidied.some((it) => it.id === "bm") && tidied.filter((it) => edgeKind(it) === "stairs").every((it) => !it.full), "tidying divides a side two kinds were standing through — the narrower keeps its stretch, the flight parts round it");

// ── Ramps, backdrops, corners, area.
const ramp = edgeItemShape({ ...down.stage, heightMm: 600 }, { id: "r", kind: "ramp", edge: 1, t: 0.5, widthMm: 1200 }, deckOf)!;
assert(ramp.depthMm === 7200, "a ramp onto a 60cm stage runs 7.2m — one in twelve");
assert(ramp.treads.length === 0 && ramp.climb?.slope?.text === "1:12" && !ramp.climb.slope.tooSteep, "…drawn with no step edges and its slope written on it");
assert(ramp.climb!.arrow.from.x > ramp.climb!.arrow.head[0].x && Math.abs(ramp.climb!.arrow.head[0].x - ramp.base.x - 150) < 1 && Math.abs(ramp.climb!.slope!.at.x - (ramp.base.x + 3600)) < 1, "…its walking line up to the edge, the slope at its middle");
assert(Math.abs(((ramp.climb!.slope!.angleDeg % 360) + 360) % 360 - 180) < 1, "…running with the line (toward −x, onto the right-hand side)");
assert(!edgeItemShape(down.stage, { id: "b", kind: "bench", edge: 1, t: 0.5, widthMm: 2000 }, deckOf)!.climb && !edgeItemShape(down.stage, { id: "br", kind: "barrier", edge: 1, t: 0.5, widthMm: 2000 }, deckOf)!.climb, "a banquette and a barrier climb nothing");
const rampInRoom = edgeItemInRoom({ ...down, rotation: 90 }, ramp);
const turnOf = (deg: number) => ((deg % 360) + 360) % 360;
assert(turnOf(rampInRoom.climb!.slope!.angleDeg - ramp.climb!.slope!.angleDeg - 90) < 1e-6 && Math.abs(Math.hypot(rampInRoom.climb!.arrow.head[0].x - rampInRoom.base.x, rampInRoom.climb!.arrow.head[0].y - rampInRoom.base.y) - 150) < 1, "carried into the room, the walking line and the slope turn with the stage");
const rampMirrored = edgeItemInRoom({ ...down, rotation: 0, mirrored: true }, ramp);
assert(turnOf(rampMirrored.climb!.slope!.angleDeg) < 1e-6 && rampMirrored.climb!.arrow.from.x < rampMirrored.climb!.arrow.head[0].x, "…and a flipped stage's ramp climbs the other way, its slope read off the flipped line");
const wall = edgeItemShape(down.stage, { id: "w", kind: "backdrop", edge: 2, t: 0.5, widthMm: 0, full: true }, deckOf)!;
assert(wall.polygon.every((q) => Math.abs(q.y) <= 2001), "a backdrop stands on the stage, on its edge");
assert(
  stairFits(down, { id: "w", kind: "backdrop", edge: (down.stage.front + 2) % 4, t: 0.5, widthMm: 0, full: true }, deckOf, wallBehind).ok,
  "…and may stand against the venue's wall, where stairs may not",
);
const allStairs = { ...down.stage, stairs: [0, 1, 2, 3].map((e) => ({ id: `e${e}`, edge: e, t: 0.5, widthMm: 0, full: true })) };
const corners = stageCorners(allStairs, deckOf);
assert(corners.length === 4 && corners.every((c) => c.kind === "stairs"), "stairs on all four sides meet at four corner pieces");
assert(stageCorners({ ...allStairs, corners: false }, deckOf).length === 0, "…unless the stage says no");
assert(
  stageCorners({ ...allStairs, stairs: allStairs.stairs.map((x, i) => (i === 1 ? { ...x, kind: "bench" as const } : x)) }, deckOf).length === 2,
  "a corner between stairs and a banquette stays open",
);
assert(corners[0].polygon.every((q) => Math.abs(q.x) >= 2999 || Math.abs(q.y) >= 1999), "…and a corner piece stands outside the stage");
// QA BQ-10: two banquettes of different depths meet at a corner piece as deep as EACH of them —
// no notch where the deeper one stops.
const twoDepths = { ...down.stage, stairs: [0, 1].map((e) => ({ id: `b${e}`, kind: "bench" as const, edge: e, t: 0.5, widthMm: 0, full: true, bench: { depthMm: e === 0 ? 600 : 900 } })) };
const deepCorner = stageCorners(twoDepths, deckOf);
assert(deepCorner.length === 1, "two banquettes meeting outside a corner get one corner piece");
const cp = deepCorner[0].polygon;
const sideLens = cp.map((q, i) => Math.round(Math.hypot(cp[(i + 1) % 4].x - q.x, cp[(i + 1) % 4].y - q.y))).sort((a, b) => a - b);
assert(sideLens.join(",") === "600,600,900,900", `…its sides the two banquettes' depths, 60 and 90 (${sideLens.join(",")})`);
assert(stageAreaMm2(down.stage) === 24e6, "a 6×4 stage is 24m² of deck");

// ── Drawn, or built by hand: the same stage.
// A 6×4 against a wall along its top, drawn with the area tool…
const wallTop: WallDistance = (q) => Math.abs(q.y - 0);
const drawnAt = stageFromArea(rect(0, 0, 6000, 4000), defaultFront(rect(0, 0, 6000, 4000), wallTop));
const drawn: StagePlacement = { id: "d", variantId: "big", layer: "floor", quantity: 1, scale: 1, position: drawnAt.position, rotation: drawnAt.rotation, stage: { outline: drawnAt.outline, front: drawnAt.front, decks: ["big", "small"] } };
drawn.stage.stairs = defaultEdgeItems(drawn, deckOf, nid, wallTop);
// …and the same 6×4 laid by hand: twelve 2×1 decks dropped facing the page, then merged.
const pieces: StagePlacement[] = [];
for (let r = 0; r < 4; r++)
  for (let c = 0; c < 3; c++)
    pieces.push(
      stageFromPiece(
        { id: `p${r}${c}`, variantId: "big", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 1000 + c * 2000, y: 500 + r * 1000 } },
        { widthMm: 2000, depthMm: 1000 },
        { decks: ["big", "small"], deckOf, newId: nid, withEdges: true, wallDistance: wallTop },
      ),
    );
const built = mergeStages(pieces)!;
const handmade: StagePlacement = { ...pieces[0], ...built, mirrored: false, stage: built.stage };
handmade.stage.stairs = [...(handmade.stage.stairs ?? []), ...fillGaps(handmade, deckOf, "stairs", nid, wallTop)];
assert(!!stageRect(handmade.stage) && stageRect(handmade.stage)!.widthMm === 6000 && stageRect(handmade.stage)!.depthMm === 4000, "built by hand, it is the same 6×4 rectangle — with resize handles");
const ro = (p: StagePlacement) => stageOutlineInRoom(p).map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).sort().join(" ");
assert(ro(handmade) === ro(drawn), "…standing on the same floor");
const fr = (p: StagePlacement) => {
  const a = toRoom(p, p.stage.outline[p.stage.front]);
  const b = toRoom(p, p.stage.outline[(p.stage.front + 1) % p.stage.outline.length]);
  return Math.round((a.y + b.y) / 2);
};
assert(fr(handmade) === fr(drawn) && fr(drawn) === 4000, "…facing the same way, away from the wall");
assert(layStage(handmade.stage, deckOf).decks.length === 12 && layStage(drawn.stage, deckOf).decks.length === 12, "…built of the same twelve decks");
const runs = (p: StagePlacement) =>
  (p.stage.stairs ?? [])
    .map((it) => `${edgeKind(it)}:${Math.round(itemSpan(p.stage, it)!.to - itemSpan(p.stage, it)!.from)}`)
    .sort()
    .join(" ");
assert(runs(handmade) === runs(drawn), "…with the same stairs: one run per open side, none on the seams");
assert(edgeGaps(handmade, deckOf, wallTop).length === 0, "…and no open edge");
assert(skirtMm(handmade, deckOf, wallTop) === skirtMm(drawn, deckOf, wallTop), "…and the same skirt");

// Two stages pushed flush, not merged: the stairs on the seam go, and the seam is not "open".
const leftS = stageFromPiece({ id: "L", variantId: "big", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 1000, y: 3000 } }, { widthMm: 2000, depthMm: 1000 }, { decks: ["big"], deckOf, newId: nid, withEdges: true });
const rightS = stageFromPiece({ id: "R", variantId: "big", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 3000, y: 3000 } }, { widthMm: 2000, depthMm: 1000 }, { decks: ["big"], deckOf, newId: nid, withEdges: true });
const trimmed = trimSeams([leftS, rightS], deckOf);
assert(trimmed.get("L")!.length === 3 && trimmed.get("R")!.length === 3, "flush stages lose the stairs on the side they share");
const nb = besideNeighbours(undefined, [stageOutlineInRoom(rightS)]);
assert(edgeGaps({ ...leftS, stage: { ...leftS.stage, stairs: trimmed.get("L") } }, deckOf, nb).length === 0, "…and that side is not open");

// A run of items on one side tidied to one.
const twice = tidyEdgeItems({ ...down.stage, stairs: [
  { id: "a", edge: 0, t: 1 / 6, widthMm: 2000 },
  { id: "b", edge: 0, t: 0.5, widthMm: 2000 },
  { id: "c", edge: 0, t: 5 / 6, widthMm: 2000 },
] });
assert(twice.length === 1 && twice[0].full === true, "three flights end to end along a side are one flight across it");

// ── Levels stay where they stand when the stage's frame moves.
const moved = { ...band, position: { x: band.position.x + 500, y: band.position.y } };
const carried = carryLevels(band.stage.levels, band, moved)!;
assert(carried[0].outline[0].x === -2500, "a stage stretched to the right keeps its riser where it stood");
// ── Reframe and merge.
const pushed = reframeStage(down, [...down.stage.outline.slice(0, 2), { x: 3000, y: 3000 }, { x: -3000, y: 3000 }]);
assert(pushed.stage.outline[0].y === -2500 && pushed.stage.outline[2].y === 2500, "a side pushed out leaves the outline centred on its box");
const r0 = stageOutlineInRoom({ ...down, ...pushed, stage: pushed.stage } as StagePlacement).map((q) => Math.round(q.y));
assert(Math.min(...r0) === 0 && Math.max(...r0) === 5000, "…and in the room it grew only where it was pushed");

const left: StagePlacement = { ...place(rect(0, 0, 4000, 2000), 0), id: "l" };
const right: StagePlacement = { ...place(rect(4000, 0, 2000, 4000), 0), id: "r" };
left.stage.stairs = [{ id: "s1", edge: 3, t: 0.5, widthMm: 1000 }];
const merged = mergeStages([left, right])!;
assert(!!merged && merged.stage.outline.length === 6, "a 4×2 and a 2×4 pushed together are one L-shaped stage");
const mp = { ...left, ...merged, stage: merged.stage } as StagePlacement;
assert(stageDeckCounts(mp.stage, deckOf).get("big")?.length === 8, "…built of eight decks");
assert(merged.stage.stairs?.length === 1 && stairShape(mp.stage, merged.stage.stairs[0], deckOf) !== null, "…with its flight still on its side");
assert(skirtMm(mp, deckOf) === 20000 - 1000, "…and skirted round the outside only (20m less the flight), never along the seam");
assert(mergeStages([left, { ...place(rect(9000, 0, 2000, 2000), 0), id: "far" }]) === null, "two stages apart are not merged");

// ── Re-shaped in "עריכת הבמה": a free-standing 6×4 with stairs all round has half its back pushed
// out into an L. Every old flight lands on its side again, the back's on both halves, and only the
// new step between them is bare — once filled, one run per side and nothing open.
const solo = place(rect(0, 0, 6000, 4000), 2);
solo.stage.stairs = defaultEdgeItems(solo, deckOf, nid);
const roomPoly = stageOutlineInRoom(solo).map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) }));
const backSide = (solo.stage.front + 2) % 4;
const cut = splitSide(roomPoly, solo.stage.front, backSide);
const reshaped = cleanOutline(pushSide(cut.outline, backSide, 2000), cut.front);
const at2 = stageFromArea(reshaped.outline, reshaped.front);
const now: StagePlacement = { ...solo, position: at2.position, rotation: at2.rotation, stage: { ...solo.stage, outline: at2.outline, front: at2.front } };
const carriedOver = rehomeEdgeItems(solo, now, nid);
assert(carriedOver.length === 5 && carriedOver.every((it) => it.full), "a reshaped stage keeps every flight, on its side, the split back's on both halves");
const done = { ...now, stage: { ...now.stage, stairs: carriedOver } };
const bare = fillGaps(done, deckOf, "stairs", nid);
assert(bare.length === 1, "…and only the new step between the halves is bare");
const tidy = tidyEdgeItems({ ...done.stage, stairs: [...carriedOver, ...bare] });
assert(tidy.length === 6 && edgeGaps({ ...done, stage: { ...done.stage, stairs: tidy } }, deckOf).length === 0, "…filled, one run on each of the L's six sides");

// ── Inner stairs and banquettes: set into the stage instead of out from it.
// A 6×4 at 60cm, front along the top (room y = 0), standing at room (3000, 2000) unturned; its
// right-hand side (edge 1) is at room x = 6000, with a wall half a metre beyond it.
const flat = place(rect(0, 0, 6000, 4000), 0);
assert(flat.rotation === 0 && flat.position.x === 3000, "(a stage drawn front-first stands unturned)");
const tall = { ...flat, stage: { ...flat.stage, heightMm: 600, decks: ["small"] } };
const wallRight: WallDistance = (q) => Math.abs(q.x - 6500);
const sunk: StageStair = { id: "in", edge: 1, t: 0.5, widthMm: 1000, inner: true };
const sunkShape = edgeItemShape(tall.stage, sunk, deckOf)!;
assert(
  Math.abs(Math.hypot(sunkShape.climb!.arrow.from.x - sunkShape.base.x, sunkShape.climb!.arrow.from.y - sunkShape.base.y) - Math.min(sunkShape.depthMm * 0.12, 150)) < 1 &&
    Math.hypot(sunkShape.climb!.arrow.head[0].x - sunkShape.foot.x, sunkShape.climb!.arrow.head[0].y - sunkShape.foot.y) < Math.hypot(sunkShape.climb!.arrow.from.x - sunkShape.foot.x, sunkShape.climb!.arrow.from.y - sunkShape.foot.y),
  "a recessed flight is climbed the other way: from the floor at the edge up onto the deck inside",
);
assert(sunkShape.inner && sunkShape.depthMm === 840 && sunkShape.polygon.every((q) => q.x <= 3001 && q.x >= 3000 - 841), "an inner flight is the same flight, sunk into the stage behind its edge");
assert(sunkShape.treads.length === 2 && sunkShape.treads.every(([u]) => u.x < 3000), "…its treads inside the outline");
const withSunk = { ...tall, stage: { ...tall.stage, stairs: [sunk] } };
const sunkDecks = layStage(withSunk.stage, deckOf).decks;
const overlapsRecess = sunkDecks.some((d) => d.centre.x + d.widthMm / 2 > 3000 - 840 + 1 && Math.abs(d.centre.y) - d.depthMm / 2 < 500 - 1);
assert(!overlapsRecess && sunkDecks.length === 24 - 2, "the decks are laid around its recess (two 1×1 decks fewer)");
assert(Math.abs(layStage(withSunk.stage, deckOf).coverage - 22e6 / (24e6 - 840e3)) < 1e-9, "…and coverage is of the floor meant to be decked, not of the recess");
assert(stageAreaMm2(withSunk.stage, deckOf) === 24e6 - 1000 * 840 && stageAreaMm2(withSunk.stage) === 24e6, "the surface is priced less the recess (given the decks)");
// A HOLE: a piece of nothing the size of a 1×1 deck at the stage's middle — laid round, no deck,
// the surface less it, reported where it is (2026-10-31).
const holed = { ...tall, stage: { ...tall.stage, pieces: [{ variantId: "small", centre: { x: 0, y: 0 }, rotation: 0, hole: true as const }] } };
const holedLaid = layStage(holed.stage, deckOf);
assert(holedLaid.holes.length === 1 && holedLaid.holes[0].piece === 0 && holedLaid.holes[0].widthMm === 1000, "a hole is reported where its piece stands");
assert(holedLaid.decks.length === 24 - 4 && holedLaid.decks.every((d) => d.piece === undefined && !deckOverlaps(d, holedLaid.holes[0].outline)), "…no deck is laid in it, and it is no deck itself");
assert(stageAreaMm2(holed.stage, deckOf) === 24e6 - 1e6, "…and the surface is priced less it");
assert(Math.abs(holedLaid.coverage - 20 / 23) < 1e-9, "…while the coverage is of the floor meant to be decked (the four decks the hole cut into are left out)");
assert(carryPieces(holed.stage.pieces, holed, { position: { x: 0, y: 0 }, rotation: 0 })![0].hole === true, "a hole is carried as a hole");
assert(skirtMm(withSunk, deckOf) === 20000 - 1000, "a recess leaves no deck face to skirt");
assert(edgeGaps(withSunk, deckOf).reduce((t, g) => t + g.lengthMm, 0) === 20000 - 1000, "…and finishes its stretch of the edge");
assert(stageCorners({ ...tall.stage, stairs: [0, 1, 2, 3].map((e) => ({ id: `c${e}`, edge: e, t: 0.5, widthMm: 0, full: true, inner: e === 1 })) }, deckOf).length === 2, "an inner run takes no corner piece outside the stage");

// Half a metre off the wall: no room for the flight's 84cm outside — only set into the stage.
const outer: StageStair = { id: "o", edge: 1, t: 0.5, widthMm: 1000 };
assert(!stairFits(tall, outer, deckOf, wallRight).ok, "a flight half a metre off a wall does not fit outside");
assert(stairFits(tall, sunk, deckOf, wallRight).ok, "…and fits set into the stage");
const clicked = placeEdgeItem(tall, outer, deckOf, wallRight);
assert(clicked.ok && clicked.item.inner === true, "…so a flight clicked onto that side is placed inner");
const hugging: WallDistance = (q) => Math.abs(q.x - 6200);
assert(!placeEdgeItem(tall, outer, deckOf, hugging).ok, "a side against the wall takes neither");
// …unless a DOOR is in that wall where the flight would stand: whoever comes through it steps onto
// the bottom tread of a flight set into the stage (2026-10-31).
const doorThere: DoorOpening[] = [{ a: { x: 6200, y: 1500 }, b: { x: 6200, y: 2500 } }];
const atDoor = placeEdgeItem(tall, outer, deckOf, hugging, doorThere);
assert(atDoor.ok && atDoor.item.inner === true, "against a wall with a door, a flight clicked at the door is set into the stage");
assert(!placeEdgeItem(tall, { ...outer, t: 0.1 }, deckOf, hugging, doorThere).ok, "…one clicked away from the door still takes neither");
assert(!stairFits(tall, outer, deckOf, hugging, doorThere).ok, "…and never outside, through the doorway");
assert(!placeEdgeItem(tall, outer, deckOf, hugging, [{ a: { x: 6200, y: 2400 }, b: { x: 6200, y: 2800 } }]).ok, "a door the flight barely reaches is not its door");
assert(settleEdgeItems(tall, [outer], deckOf, nid, hugging, { inner: true, otherwise: "barrier", doors: doorThere })[0].inner === true, "finishing the edges sinks a flight at the door too");
const moved1 = settleEdgeItems(tall, [outer], deckOf, nid, wallRight, { inner: true, otherwise: "keep" });
assert(moved1.length === 1 && moved1[0].inner === true && moved1[0].id === "o", "an outer flight a move left without floor resolves to inner, keeping its id");
assert(settleEdgeItems(tall, [outer], deckOf, nid, (q) => Math.abs(q.x - 9000), { inner: true, otherwise: "keep" })[0].inner === undefined, "…and one with floor stays outside");
assert(defaultEdgeItems(tall, deckOf, nid, wallRight).find((it) => it.edge === 1)?.kind === "barrier", "a NEW stage still gets a barrier there, not a whole side of recess");

const benchIn: StageStair = { id: "bi", kind: "bench", edge: 1, t: 0.5, widthMm: 2400, inner: true };
const bi = edgeItemShape(tall.stage, benchIn, deckOf)!;
assert(bi.inner && bi.polygon.every((q) => q.x <= 3001 && q.x >= 3000 - BENCH_TABLE_DEPTH_MM - 1), "an inner banquette stands on the deck inside its edge");
assert(bi.chairs.length === 4 && bi.chairs.every((c) => Math.abs(c.x - (3000 - BENCH_TABLE_DEPTH_MM - CHAIR_OFFSET_MM)) < 1 && Math.abs(c.facingDeg) < 1), "…its chairs further in behind it, still facing out");
assert(bi.heightMm === BENCH_TOP_MM, "…its top at table height above the deck its chairs stand on");
const biSofaItem: StageStair = { ...benchIn, bench: { back: { kind: "sofa" }, front: { kind: "chairs", seats: 2 } } };
const biSofa = edgeItemShape(tall.stage, biSofaItem, deckOf)!;
const biDepth = biSofa.depthMm;
assert(biSofa.cushions.length > 0 && biSofa.cushions.every((q) => q.every((p) => p.x <= 3000 - biDepth / 2 + 1e-6 && p.x >= 3000 - biDepth - 1)), "an inner banquette's sofa side is on the inner half of its strip");
// QA BQ-6: its ROOM side is the stage's edge — a drop. Chairs there stood 6 cm off the stage in the
// air (at deck height in 3D); now it seats nobody, the spec's room side kept underneath.
assert(biSofa.chairs.length === 0 && biSofa.bench?.front.kind === "none" && biSofa.seats === biSofa.sofaSeats, "an inner banquette has no room side: no chair stands off the stage's edge");
assert(biSofaItem.bench?.front?.kind === "chairs" && edgeItemShape(tall.stage, { ...biSofaItem, inner: undefined }, deckOf)!.chairs.length === 2, "…and set back outside, its room side's chairs come back");
assert(benchSeats([{ ...tall, stage: { ...tall.stage, stairs: [biSofaItem] } }], deckOf) === biSofa.sofaSeats, "…nor are they counted in the seating");
const withBenchIn = { ...tall, stage: { ...tall.stage, stairs: [benchIn] } };
assert(skirtMm(withBenchIn, deckOf) === 20000, "the stage's face below an inner banquette is still skirted");
assert(edgeGaps(withBenchIn, deckOf).reduce((t, g) => t + g.lengthMm, 0) === 20000 - 2400, "…and the banquette finishes its stretch");
assert(layStage(withBenchIn.stage, deckOf).decks.length === 24, "…standing on the decks, not in a recess");
assert(placeEdgeItem(tall, { ...benchIn, inner: undefined }, deckOf, wallRight).ok, "a banquette near the wall goes on the stage too");
assert(tidyEdgeItems({ ...tall.stage, stairs: [sunk, { ...outer, t: 0.2 }] }).length === 2, "an inner and an outer flight on one side are never merged into one");

// ── A round stage: a curved rim is ONE side, and edge items follow it.
const round = roundOutline(4000, 4000);
const disc: StagePlacement = { id: "disc", variantId: "big", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 0, y: 0 }, stage: { outline: round.outline, smooth: round.smooth, front: 0, decks: ["big", "small"], heightMm: 600 } };
const rim = stageSides(disc.stage);
assert(rim.length === 1 && rim[0].closed && rim[0].curved && Math.abs(rim[0].L - Math.PI * 4000) < 40, "a round stage's rim is one closed side, its circumference long");
assert(round.outline.length >= 24 && rim[0].L / round.outline.length < 300, "…drawn in chords short enough to read as a curve");
const ring = defaultEdgeItems(disc, deckOf, nid);
assert(ring.length === 1 && !ring[0].full && ring[0].widthMm === STAIR_WIDTH_MM && edgeKind(ring[0]) === "stairs", "a free-standing round stage gets ONE flight — not stairs all the way round");
const ringShape = edgeItemShape(disc.stage, ring[0], deckOf)!;
const rOf = (q: Point) => Math.hypot(q.x, q.y);
assert(ringShape.base.y > 1900 && Math.abs(ringShape.base.x) < 300, "…at its back, opposite the front");
assert(ringShape.polygon.length > 4 && ringShape.polygon.every((q) => rOf(q) >= 2000 - 5 && rOf(q) <= 2000 + 840 + 5), "…following the curve, 84cm deep outside the rim");
const withRing = { ...disc, stage: { ...disc.stage, stairs: ring } };
assert(edgeGaps(withRing, deckOf).length === 0 && Math.abs(skirtMm(withRing, deckOf) - (rim[0].L - STAIR_WIDTH_MM)) < 1, "…the rest of the rim skirted, and not reported bare");
assert(edgeGaps(disc, deckOf).length === 0 && edgeGaps(disc, deckOf, undefined, { rims: true }).length === 1, "a bare round rim is normal — not an open edge — unless asked about outright");
const allRound = fillGaps(withRing, deckOf, "stairs", nid, undefined, { rims: true });
assert(allRound.length === 1 && Math.abs(allRound[0].widthMm - (rim[0].L - STAIR_WIDTH_MM)) <= 1, "…and 'finish the edges' can still run stairs round the rest of it, as one flight across the seam");
assert(edgeGaps({ ...disc, stage: { ...disc.stage, stairs: [...ring, ...allRound] } }, deckOf, undefined, { rims: true }).length === 0, "…which leaves nothing of the rim bare");
assert(stageCorners(withRing.stage, deckOf).length === 0, "…and no corner anywhere on a curve");
assert(Math.abs(skirtMm(disc, deckOf) - rim[0].L) < 1, "a bare round stage is skirted all the way round");
// A banquette round half of it; then a flight clicked on one of the chords of the other half.
const halfBench: StageStair = { id: "hb", kind: "bench", edge: 0, t: 0.25, widthMm: Math.round(rim[0].L / 2) };
const benchDisc = { ...disc, stage: { ...disc.stage, stairs: [halfBench] } };
const hb = edgeItemShape(benchDisc.stage, halfBench, deckOf)!;
assert(hb.chairs.every((c) => Math.abs(rOf(c) - (2000 - CHAIR_OFFSET_MM)) < 15) && hb.seats === Math.floor(hb.widthMm / SEAT_WIDTH_MM), "a curved banquette's chairs stand round the inside of the rim");
assert(hb.chairs.every((c) => {
  const out = { x: Math.cos(rad(c.facingDeg)), y: Math.sin(rad(c.facingDeg)) };
  return (c.x * out.x + c.y * out.y) / rOf(c) > 0.99;
}), "…each facing straight out");
const onBench = benchInRoom(benchDisc, "hb", deckOf)!;
assert([-0.5, -0.25, 0, 0.25, 0.5].every((f) => Math.abs(rOf(onBench.along(f)) - (2000 + BENCH_TABLE_DEPTH_MM / 2)) < 15), "…and what is dressed on it is spread along the curve");
const chord = Math.round(round.outline.length * 0.75);
const flight = itemAt(benchDisc, deckOf, "stairs", undefined, chord, 0.5, "f1");
assert(flight.edge === 0 && !!itemSpan(benchDisc.stage, flight) && flight.widthMm === STAIR_WIDTH_MM, "a flight clicked on one chord of the rim is placed on the rim, a standard flight wide — never the whole bare half of a round stage");
const both = { ...disc, stage: { ...disc.stage, stairs: [halfBench, flight] } };
assert(edgeGaps(both, deckOf).length === 0 && edgeGaps(both, deckOf, undefined, { rims: true }).length > 0, "…the rest of the rim skirted: bare only when asked about outright");
const short: StageStair = { id: "s1", edge: 0, t: 0.5, widthMm: 1000 };
const sp1 = sidePosition(disc.stage, undefined, chord, 0.5);
const along1 = itemAlong(disc.stage, short, itemSidePoint(disc.stage, short, sp1.t * rim[0].L)!)!;
assert(Math.abs(along1.s - sp1.t * rim[0].L) < 2 && Math.abs(along1.o) < 2, "a point on the rim reads back as how far round it is");
assert(Math.abs(edgeItemShape(disc.stage, short, deckOf)!.widthMm - 1000) < 1, "a metre-wide flight on the rim is a metre wide along it");
const rampShape = edgeItemShape(disc.stage, { id: "rp", kind: "ramp", edge: 0, t: 0.5, widthMm: 1200 }, deckOf)!;
assert(rampShape.polygon.length === 4, "a ramp on a curve stands straight, on the tangent");
// Near a wall above it (y = −2400): the stretch with no floor for 84cm of steps is split off, and
// the rest keeps its stairs.
const wallAbove: WallDistance = (q) => Math.abs(q.y + 2400);
const nearWall = defaultEdgeItems(disc, deckOf, nid, wallAbove);
assert(nearWall.length === 1 && edgeKind(nearWall[0]) === "stairs" && !nearWall[0].inner, "a round stage near a wall still gets its one flight, where there is floor — and no barrier round the rest");
assert(edgeItemShape(disc.stage, nearWall[0], deckOf)!.base.y > 0, "…away from the wall");
assert(edgeGaps({ ...disc, stage: { ...disc.stage, stairs: nearWall } }, deckOf, wallAbove).length === 0, "…and no stretch of its rim is reported bare");
const fullRim: StageStair = { id: "fr", edge: 0, t: 0.5, widthMm: 0, full: true };
const asked = settleEdgeItems(disc, [fullRim], deckOf, nid, wallAbove, { inner: true, otherwise: "keep" });
assert(asked.some((it) => it.inner) && asked.some((it) => !it.inner), "…and stairs asked for all the way round go inner where the wall is and outer elsewhere");
assert(rehomeEdgeItems(withRing, { ...withRing }, nid).length === 1, "the fill tool reopened on a round stage keeps its items where they stand");

// A round PIECE the studio owns becomes a round stage built of itself.
const roundDeck: DeckType = { id: "disc4", widthMm: 4000, depthMm: 4000, heightMm: 400, round: true };
const deckOf2: DeckLookup = (id) => (id === "disc4" ? roundDeck : decks[id]);
const piece = stageFromPiece({ id: "rp", variantId: "disc4", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x: 5000, y: 5000 } }, { widthMm: 4000, depthMm: 4000 }, { decks: ["big"], heightMm: 400, deckOf: deckOf2, newId: nid, withEdges: true, round: true });
assert(piece.stage.smooth?.length === piece.stage.outline.length, "a round piece becomes a stage with a curved rim");
const pieceDecks = layStage(piece.stage, deckOf2).decks;
assert(pieceDecks.length === 1 && pieceDecks[0].typeId === "disc4" && pieceDecks[0].round === true, "…standing on the one round piece it is");
assert(stageHeight(piece.stage, deckOf2) === 400 && piece.stage.stairs?.length === 1 && edgeKind(piece.stage.stairs[0]) === "stairs" && !piece.stage.stairs[0].full, "…at its height, with one flight at its back");
assert(!stairFits(piece, { id: "x", edge: 0, t: 0.5, widthMm: 1000, inner: true }, deckOf2).ok, "…and nothing can be sunk into one solid piece");

// ── Ctrl+G over stages: touching → one stage, apart → a group (mergeTouching).
// Two 244×122 sheets laid flush side by side, each finished with stairs all round.
const sheet: DeckType = { id: "sheet", widthMm: 2440, depthMm: 1220, heightMm: 400 };
const deckOf3: DeckLookup = (id) => (id === "sheet" ? sheet : decks[id]);
const laySheet = (id: string, x: number, y: number) =>
  stageFromPiece({ id, variantId: "sheet", layer: "floor", quantity: 1, scale: 1, rotation: 0, position: { x, y } }, { widthMm: 2440, depthMm: 1220 }, { decks: ["sheet"], heightMm: 400, deckOf: deckOf3, newId: nid, withEdges: true });
const s1 = laySheet("s1", 1220, 610);
const s2 = laySheet("s2", 3660, 610);
assert(s1.stage.stairs?.length === 4 && s2.stage.stairs?.length === 4, "(each sheet starts with stairs on all four sides)");
const pair = mergeTouching([s1, s2]);
assert(pair.merged.length === 1 && pair.loose.length === 0, "two flush sheets grouped are ONE merged stage, nothing loose");
const one = pair.merged[0];
assert(one.anchor.id === "s1" && one.others.length === 1 && one.others[0].id === "s2", "…the first of two equals its anchor, the other folded in");
const oneAt: StagePlacement = { ...one.anchor, stage: one.stage, position: one.position, rotation: one.rotation, mirrored: false };
assert(stageRect(one.stage)?.widthMm === 4880 && stageRect(one.stage)?.depthMm === 1220, "…a 4.88×1.22 rectangle");
assert(layStage(one.stage, deckOf3).decks.length === 2, "…built of the two sheets");
assert(one.stage.stairs?.length === 4 && one.stage.stairs.every((it) => it.full), "…with one full run of stairs on each of its four sides — none on the seam");
assert(edgeGaps(oneAt, deckOf3).length === 0 && skirtMm(oneAt, deckOf3) === 0, "…nothing bare, and nothing to skirt");
// Three sheets, two of them touching: one merged stage and one loose — to be grouped by the caller.
const s3 = laySheet("s3", 9000, 610);
const trio = mergeTouching([s1, s2, s3]);
assert(trio.merged.length === 1 && trio.loose.length === 1 && trio.loose[0].id === "s3", "three sheets where two touch: one merged, one loose");
assert(touchingStages([s1, s2, s3]).length === 2, "…two clusters");
// A round stage touching nothing — and one pushed against a sheet — is never merged.
assert(mergeTouching([piece]).merged.length === 0 && mergeTouching([piece]).loose.length === 1, "a round stage alone is left as it is");
const discBeside = { ...piece, position: { x: 1220, y: 1220 + 2000 } };
const withDisc = mergeTouching([s1, discBeside]);
assert(withDisc.merged.length === 0 && withDisc.loose.length === 2, "…and a round stage against a sheet is not merged into it (its rim is no side)");
// A gap within STAGE_TOUCH_MM is closed and merged; a wider one stays apart. A corner is not a side.
const near = mergeTouching([s1, laySheet("s4", 3660 + 200, 610)]);
assert(near.merged.length === 1 && stageRect(near.merged[0].stage)?.widthMm === 4880, "a sheet 20cm off is pushed flush and merged");
assert(mergeTouching([s1, laySheet("s5", 3660 + STAGE_TOUCH_MM + 100, 610)]).merged.length === 0, "…one 40cm off is left apart");
assert(mergeTouching([s1, laySheet("s6", 3660, 610 + 1220)]).merged.length === 0, "…and one meeting it only at a corner too");
assert(mergeTouching([s1, { ...s2, rotation: 30 }]).merged.length === 0, "…and one at 30° to it");
assert(touchingStages([s1, s2, s3]).flat().length === 3, "every stage is in exactly one cluster");

// ── A deck in an L's bite, in a U's notch, beside a T's catwalk (QA MG-1/MG-2): a stage of square
// corners that is not a rectangle is judged and pushed by its OUTLINE. By its box, the deck stood
// "inside" the L and was pushed out past the box's far edge — grouped instead of merged, or merged
// two metres off on the far side of a U, or thrown 3m out past a T's catwalk by הצמדה.
const named = (id: string, area: Point[], front: number): StagePlacement => ({ ...place(area, front), id });
const pts = (...xy: number[]): Point[] => xy.filter((_, i) => i % 2 === 0).map((x, i) => ({ x, y: xy[2 * i + 1] }));
const L = named("L", pts(0, 0, 4000, 0, 4000, 2000, 6000, 2000, 6000, 4000, 0, 4000), 4);
const inBite = mergeTouching([L, named("bite", rect(4000, 0, 2000, 2000), 2)]);
assert(inBite.merged.length === 1 && inBite.loose.length === 0, "a deck flush in an L's bite is MERGED with it, not grouped");
assert(stageRect(inBite.merged[0].stage)?.widthMm === 6000 && stageRect(inBite.merged[0].stage)?.depthMm === 4000, "…filling the bite: one 6×4 rectangle");
const U = named("U", pts(0, 0, 2000, 0, 2000, 2000, 4000, 2000, 4000, 0, 6000, 0, 6000, 4000, 0, 4000), 6);
const inNotch = mergeTouching([U, named("notch", rect(2000, 0, 2000, 2000), 2)]);
assert(inNotch.merged.length === 1 && stageRect(inNotch.merged[0].stage)?.widthMm === 6000 && stageRect(inNotch.merged[0].stage)?.depthMm === 4000, "a deck flush in a U's notch is merged INTO the notch — the stage does not grow 2m");
const wideU = named("wideU", pts(0, 0, 1000, 0, 1000, 2000, 5000, 2000, 5000, 0, 6000, 0, 6000, 4000, 0, 4000), 6);
assert(mergeTouching([wideU, named("free", rect(2500, 500, 1000, 1000), 2)]).merged.length === 0, "a deck standing FREE in a U's notch, half a metre off every side, is left apart");
const T = named("T", pts(0, 0, 6000, 0, 6000, 3000, 3500, 3000, 3500, 6000, 2500, 6000, 2500, 3000, 0, 3000), 4);
const beside = named("beside", rect(3500, 3000, 2440, 1220), 2);
const withT = mergeTouching([T, beside]);
assert(withT.merged.length === 1, "a sheet flush on a T's front beside its catwalk merges with it");
assert(Math.abs(stageAreaMm2(withT.merged[0].stage) - (6000 * 3000 + 1000 * 3000 + 2440 * 1220)) < 2000, "…where it stood");
// הצמדה: what already shares a side with the T stays; one 20cm off is closed onto its front and
// slid the last 4cm into the corner it nearly fills — never thrown past the catwalk.
assert(stickTogether([T, beside]).parts.every((p, i) => p === [T, beside][i]), "הצמדה leaves a sheet already flush beside a catwalk where it is");
const off = named("off", rect(3540, 3200, 2440, 1220), 2);
const stuck = stickTogether([T, off]).parts[1];
const offRoom = stageOutlineInRoom(stuck);
assert(Math.round(Math.min(...offRoom.map((q) => q.x))) === 3500 && Math.round(Math.min(...offRoom.map((q) => q.y))) === 3000, "…one 20cm off the front and 4cm off the catwalk goes into the corner");
// QA MG-7: stages at another angle are stuck among themselves, and the one alone at its angle is
// left — and named, rather than nothing moving because the LARGEST was the odd one out.
const big: StagePlacement = { ...named("big", rect(0, 5000, 8000, 4000), 2), rotation: 30 };
const d1 = named("d1", rect(10000, 0, 2440, 1220), 2);
const d2 = named("d2", rect(12640, 0, 2440, 1220), 2);
const mixed = stickTogether([big, d1, d2]);
assert(mixed.parts[0] === big && mixed.angled.length === 1 && mixed.angled[0] === "big", "a big stage at 30° among 0° decks is left, and said so");
const d2Room = stageOutlineInRoom(mixed.parts[2]);
assert(Math.round(Math.min(...d2Room.map((q) => q.x))) === 12440 || Math.round(Math.min(...stageOutlineInRoom(mixed.parts[1]).map((q) => q.x))) === 10200, "…while the two decks 20cm apart are pushed together");
const tilted: StagePlacement = { ...named("tilt", rect(10000, 3000, 2440, 1220), 2), rotation: 0.6 };
assert(stickTogether([d1, d2, tilted]).angled.includes("tilt"), "a deck turned 0.6° is left out, and said so");
// QA MG-15: a stage more than STICK_REACH_MM from every other is not pulled across the room.
const farPair = [d1, named("away", rect(10000, 9000, 2440, 1220), 2)];
const away = stickTogether(farPair);
assert(away.parts.every((p, i) => p === farPair[i]) && away.far.length === 2, "a deck 9m off is not pulled across the room, and said so");

// ── A piece of ANY shape: a half-round platform the studio owns (D244 — 2.44 across, 1.22 deep).
const halfProduct = {
  id: "hp",
  name: "במה חצי עיגול",
  category: "stages",
  layer: "floor",
  dimensions: { diameterMm: 2440, heightMm: 400 },
  categoryFields: {},
  styleTags: [],
  variants: [],
  appearance: { shape: "half-circle", content: "none" },
} as unknown as Product;
assert(isShapedPiece(halfProduct) && !isRoundPiece(halfProduct), "a half-round is a shaped piece, not a round one");
const halfShape = pieceOutline(halfProduct)!;
const hxs = halfShape.outline.map((q) => q.x);
const hys = halfShape.outline.map((q) => q.y);
assert(Math.max(...hxs) - Math.min(...hxs) === 2440 && Math.max(...hys) - Math.min(...hys) === 1220, "its outline is its 2.44×1.22 box");
assert(halfShape.smooth.length === halfShape.outline.length - 2, "…every corner along its arc smooth, the two ends of its chord real corners");
const halfDeck = deckTypeOf("half", halfProduct);
assert(!!halfDeck.outline && !halfDeck.round, "as a deck it carries its outline, never laid by the fill");
const deckOf4: DeckLookup = (id) => (id === "half" ? halfDeck : id === "sheet" ? sheet : decks[id]);
// Dropped with its chord against the wall at the top of the room.
const wallUp: WallDistance = (q) => Math.abs(q.y);
const halfStage = stageFromPiece(
  { id: "h", variantId: "half", layer: "floor", quantity: 1, scale: 1, rotation: 180, position: { x: 3000, y: 610 } },
  { widthMm: 2440, depthMm: 1220 },
  { decks: ["sheet"], heightMm: 400, deckOf: deckOf4, newId: nid, withEdges: true, wallDistance: wallUp, shape: halfShape, whole: true },
);
const hRoom = stageOutlineInRoom(halfStage);
assert(Math.abs(Math.min(...hRoom.map((q) => q.y))) <= 1 && Math.abs(Math.max(...hRoom.map((q) => q.y)) - 1220) <= 1, "it becomes a stage standing where the piece stood");
const hSides = stageSides(halfStage.stage);
assert(hSides.length === 2 && hSides.filter((s) => s.curved).length === 1, "…with two sides: its chord, and its arc as ONE curved side");
const hLaid = layStage(halfStage.stage, deckOf4);
assert(hLaid.decks.length === 1 && hLaid.decks[0].typeId === "half" && !!hLaid.decks[0].outline && hLaid.coverage > 0.99, "…built of the one piece it is, whole");
assert(stageIsOnePiece(halfStage.stage, deckOf4), "…which nothing can be cut into");
const hItems = halfStage.stage.stairs ?? [];
assert(hItems.length > 0 && hItems.every((it) => hSides.find((s) => s.curved)!.edge === stageSide(halfStage.stage, undefined, it.edge)?.edge), "its chord against the wall takes nothing; its arc is finished");
const arcStairs = hItems.filter((it) => edgeKind(it) === "stairs");
assert(arcStairs.length > 0 && arcStairs.every((it) => edgeItemShape(halfStage.stage, it, deckOf4)!.polygon.length > 4), "…with stairs that follow the curve");
assert(edgeGaps(halfStage, deckOf4, wallUp).length === 0, "…and nothing left bare");

// A half-round APRON against the middle of a stage's front: Ctrl+G makes them ONE stage.
const front = stageFromArea(rect(0, 0, 4880, 2440), 2);
const main: StagePlacement = { id: "main", variantId: "sheet", layer: "floor", quantity: 1, scale: 1, position: front.position, rotation: front.rotation, stage: { outline: front.outline, front: front.front, decks: ["sheet"], heightMm: 400 } };
main.stage.stairs = defaultEdgeItems(main, deckOf4, nid, wallUp);
const apron = stageFromPiece(
  { id: "ap", variantId: "half", layer: "floor", quantity: 1, scale: 1, rotation: 180, position: { x: 2440, y: 2440 + 610 } },
  { widthMm: 2440, depthMm: 1220 },
  { decks: ["sheet"], heightMm: 400, deckOf: deckOf4, newId: nid, withEdges: true, wallDistance: wallUp, shape: halfShape, whole: true },
);
assert(touchingStages([main, apron]).length === 1, "a half-round flush against a stage's front touches it — a curve no longer keeps it apart");
const joined = mergeTouching([main, apron]);
assert(joined.merged.length === 1 && joined.loose.length === 0 && joined.merged[0].anchor.id === "main", "…and merges into it, the bigger stage the anchor");
const jm = joined.merged[0];
const jAt: StagePlacement = { ...main, stage: jm.stage, position: jm.position, rotation: jm.rotation, mirrored: false };
const jSides = stageSides(jm.stage);
assert(jSides.length === 6 && jSides.filter((s) => s.curved).length === 1, "…one outline: its four sides, the front either side of the apron, and the apron's arc as one curved side");
assert(Math.abs(stageAreaMm2(jm.stage) - (4880 * 2440 + (Math.PI * 1220 * 1220) / 2)) < 0.01 * 4880 * 2440, "…covering both");
const jLaid = layStage(jm.stage, deckOf4);
assert(jLaid.decks.filter((d) => d.typeId === "half").length === 1 && jLaid.decks.filter((d) => d.typeId === "sheet").length === 4, "…built of the half-round piece, whole, and four sheets behind it");
const fFront = toRoom(jAt, jm.stage.outline[jm.stage.front]);
const fNext = toRoom(jAt, jm.stage.outline[(jm.stage.front + 1) % jm.stage.outline.length]);
assert(Math.abs(fFront.y - 2440) < 2 && Math.abs(fNext.y - 2440) < 2, "…still facing the room along the line of its old front");
assert(
  (jm.stage.stairs ?? []).some((it) => stageSide(jm.stage, undefined, it.edge)?.curved),
  "the apron's stairs are carried onto the merged arc",
);
const jFilled: StagePlacement = { ...jAt, stage: { ...jm.stage, stairs: [...(jm.stage.stairs ?? []), ...fillGaps(jAt, deckOf4, "stairs", nid, wallUp)] } };
assert(edgeGaps(jFilled, deckOf4, wallUp).length === 0, "…and, its bare stretches filled, nothing is left open");
assert(
  (jFilled.stage.stairs ?? []).filter((it) => stageSide(jm.stage, undefined, it.edge)?.curved).every((it) => edgeItemShape(jm.stage, it, deckOf4)!.polygon.length > 4),
  "…the stairs round the apron following its curve",
);
// Pulled 15cm off the front, it is pushed back against it and merged all the same.
const apart = { ...apron, position: { x: apron.position.x, y: apron.position.y + 150 } };
const pushedBack = mergeTouching([main, apart]);
assert(pushedBack.merged.length === 1 && Math.abs(stageAreaMm2(pushedBack.merged[0].stage) - stageAreaMm2(jm.stage)) < 0.002 * stageAreaMm2(jm.stage), "a half-round 15cm off is pushed flush and merged");
// A disc laid OVER a stage's corner overlaps it: one stage too, the disc's rim outside it a curve.
const discAt: StagePlacement = { ...piece, id: "dc", position: { x: 4880, y: 2440 } };
const over = mergeTouching([main, discAt]);
assert(over.merged.length === 1, "a disc overlapping a stage's corner merges with it");
assert(stageSides(over.merged[0].stage).some((s) => s.curved && !s.closed), "…the part of its rim outside the stage one curved side");

// ── DRAWN round: the area tool's half-round along a wall is a stage like the piece is.
const drawnHalf = halfRoundArea({ x: 1000, y: 0 }, { x: 5000, y: 0 }, 1);
const dhFront = drawnHalf.outline.reduce((best, a, i) => {
  const b = drawnHalf.outline[(i + 1) % drawnHalf.outline.length];
  const d = wallUp({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return d > best.d + 1 ? { i, d } : best;
}, { i: 0, d: -Infinity }).i;
const dhAt = stageFromArea(drawnHalf.outline, dhFront);
const dh: StagePlacement = { id: "dh", variantId: "sheet", layer: "floor", quantity: 1, scale: 1, position: dhAt.position, rotation: dhAt.rotation, stage: { outline: dhAt.outline, front: dhAt.front, decks: ["sheet"], smooth: drawnHalf.smooth, heightMm: 400 } };
const dhSides = stageSides(dh.stage);
assert(dhSides.length === 2 && dhSides.some((s) => s.curved && Math.abs(s.L - Math.PI * 2000) < 30), "a half-round drawn on the plan is its chord and its arc");
const dhLaid = layStage(dh.stage, deckOf4);
assert(
  dhLaid.missing.length === 2 && dhLaid.missing.every((m) => m.info.kind === "quarter" && Math.abs((m.info.radiusMm ?? 0) - 2000) <= 20) && new Set(dhLaid.missing.map((m) => m.shape)).size === 1,
  "…built of what the studio has, and what it lacks named: one piece, a quarter-round R200, twice — not sheets stair-stepped round the curve",
);
dh.stage.stairs = defaultEdgeItems(dh, deckOf4, nid, wallUp);
assert(edgeGaps(dh, deckOf4, wallUp).length === 0 && dh.stage.stairs.every((it) => stageSide(dh.stage, undefined, it.edge)?.curved), "…its arc finished, its chord against the wall left as it is");
// Scaled whole: the same curve, bigger; its pieces gone (it is not the piece's size any more).
const bigger = scaleStage(halfStage.stage, { widthMm: 3660, depthMm: 1830 });
assert(bigger.smooth?.length === halfStage.stage.smooth?.length && !bigger.pieces, "a half-round scaled is the same curve, built of decks");
assert(Math.abs(stageSides(bigger).find((s) => s.curved)!.L - Math.PI * 1830) < 30, "…its arc one and a half times as long");
// Pieces carried to a new frame stay where they stand in the room.
const turnedFrame = { position: { x: 100, y: 200 }, rotation: 90, mirrored: false };
const carriedPc = carryPieces(jm.stage.pieces, jAt, turnedFrame)!;
const before = toRoom(jAt, jm.stage.pieces![0].centre);
const after = toRoom(turnedFrame, carriedPc[0].centre);
assert(Math.abs(before.x - after.x) <= 1 && Math.abs(before.y - after.y) <= 1, "a piece carried to a new frame stands where it stood");
const outlineBefore = placedPiece(jm.stage.pieces![0], halfDeck).map((q) => toRoom(jAt, q));
const outlineAfter = placedPiece(carriedPc[0], halfDeck).map((q) => toRoom(turnedFrame, q));
assert(outlineBefore.every((q, i) => Math.hypot(q.x - outlineAfter[i].x, q.y - outlineAfter[i].y) < 2), "…facing the way it faced");

// ── A ROUNDED rectangle and a BOWED front — the fill tool's shapes (shapedRect), laid over the
// rectangle they were made from.
{
  const sh = shapedRect(6000, 4000, { roundedMm: 1000 });
  const rounded: StagePlacement = {
    id: "rr",
    variantId: "big",
    layer: "floor",
    quantity: 1,
    scale: 1,
    rotation: 0,
    position: { x: 0, y: 0 },
    stage: { outline: sh.outline, smooth: sh.smooth, front: sh.front, decks: ["big", "small"], heightMm: 600, roundedMm: 1000, roundedAt: "all" },
  };
  assert(stageRect(rounded.stage) === null && stageBox(rounded.stage).widthMm === 6000 && stageBox(rounded.stage).depthMm === 4000, "a rounded 6×4 is no plain rectangle, but its box still reads 6×4");
  const pr = plainRect(rounded.stage)!;
  assert(pr.length === 4 && pr[0].x === -3000 && pr[0].y === -2000 && pr[2].x === 3000 && pr[2].y === 2000, "…and the rectangle it was made from is its box");
  const sides = stageSides(rounded.stage);
  assert(sides.length === 8 && sides.filter((s) => s.curved).length === 4 && !sides.some((s) => s.closed), "its rim is eight sides — four straight runs and four arcs — none of them closed");
  assert(sides.find((s) => s.edges.includes(rounded.stage.front))!.curved === false, "…the front being the straight run across the top");
  const laidR = layStage(rounded.stage, deckOf);
  const deckArea = (l: StageLayout) => l.decks.reduce((s, d) => s + (d.outline ? Math.abs(signedArea(d.outline)) : d.widthMm * d.depthMm), 0);
  assert(laidR.decks.every((d) => !d.outline) && Math.abs(deckArea(laidR) - 20e6) < 1, "with no quarter-round piece, whole decks fill the rectangle less its four corner squares — none cut");
  assert(
    laidR.missing.length === 4 && laidR.missing.every((m) => m.info.kind === "quarter" && Math.abs((m.info.radiusMm ?? 0) - 1000) <= 10) && new Set(laidR.missing.map((m) => m.shape)).size === 1,
    "…and the corners are named as the ONE piece the studio lacks: a quarter-round R100, four of it",
  );
  assert(laidR.coverage < 0.9, "…which the coverage does not pretend to have");
  assert([...stageDeckCounts(rounded.stage, deckOf).values()].flat().length === laidR.decks.length, "…the quote counting only the decks there are");
  // With a quarter-round piece of the corner's radius in the catalog and among the chosen decks,
  // each corner stands on one and nothing is cut.
  const quarterProduct = {
    id: "qp",
    name: "רבע עיגול R100",
    category: "stage-decks",
    layer: "floor",
    dimensions: { diameterMm: 2000, heightMm: 600 },
    categoryFields: {},
    styleTags: [],
    variants: [],
    appearance: { shape: "quarter-circle", content: "none" },
  } as unknown as Product;
  const quarter = deckTypeOf("q100", quarterProduct);
  assert(quarter.quarterMm === 1000 && !!quarter.outline && quarter.widthMm === 1000 && quarter.depthMm === 1000, "a quarter-round product is a quarter piece of its radius");
  const deckOfQ: DeckLookup = (id) => (id === "q100" ? quarter : decks[id]);
  const withQ = { ...rounded, stage: { ...rounded.stage, decks: ["big", "small", "q100"] } };
  const laidQ = layStage(withQ.stage, deckOfQ);
  const quarters = laidQ.decks.filter((d) => d.typeId === "q100");
  assert(quarters.length === 4 && quarters.every((d) => !!d.outline) && laidQ.missing.length === 0, "with the piece in the catalog, four quarter-rounds stand in the corners and nothing is missing");
  assert(
    quarters.every((d) => {
      const at = placedPiece({ variantId: "q100", centre: d.centre, rotation: d.rotation, mirrored: d.mirrored }, quarter);
      return at.every((q, i) => Math.hypot(q.x - d.outline![i].x, q.y - d.outline![i].y) <= 2);
    }),
    "…each one's turn and flip the ones that stand the piece there (what פירוק לפלטות places)",
  );
  assert(
    quarters.every((d) => {
      const c = { x: Math.sign(d.centre.x) * 2000, y: Math.sign(d.centre.y) * 1000 };
      return d.outline!.every((q) => Math.hypot(q.x - c.x, q.y - c.y) <= 1000 + 3 && Math.abs(q.x) <= 3001 && Math.abs(q.y) <= 2001);
    }),
    "…each inside the stage, its arc on the stage's own corner arc",
  );
  assert(Math.abs(deckArea(laidQ) - deckArea(laidR) - 4 * ((Math.PI * 1000 * 1000) / 4)) < 0.01 * 24e6, "…the decks between them as before");
  assert(Math.abs(laidQ.coverage - 1) < 0.01, "…covering the stage");
  const sh15 = shapedRect(6000, 4000, { roundedMm: 1500 });
  const at15 = layStage({ ...withQ.stage, outline: sh15.outline, smooth: sh15.smooth, front: sh15.front, roundedMm: 1500 }, deckOfQ);
  assert(
    at15.decks.filter((d) => d.typeId === "q100").length === 0 && at15.missing.length >= 4 && at15.missing.every((m) => m.info.kind !== "rect"),
    "a quarter-round half a metre off the corner's radius does not stand in it — the corners are named as the pieces they need instead",
  );
  // Small corners on sheets: the corner sheets themselves become one curved deck, four of it.
  const sh5 = shapedRect(7320, 3660, { roundedMm: 500 });
  const at5 = layStage({ outline: sh5.outline, smooth: sh5.smooth, front: sh5.front, decks: ["sheet"], heightMm: 400, roundedMm: 500 }, (id) => (id === "sheet" ? { id, widthMm: 2440, depthMm: 1220, heightMm: 400 } : undefined));
  assert(at5.decks.length === 5 && at5.missing.length === 4 && new Set(at5.missing.map((m) => m.shape)).size === 1 && at5.missing[0].info.kind === "curve" && at5.missing[0].info.widthMm === 2440, "a 7.32×3.66 of sheets rounded R50: five sheets and one curved sheet, four of it");
  // Its edges: a flight on the front run AND one following each arc, flush at the tangent points,
  // the same depth — one continuous run to the eye — and no corner piece anywhere.
  const finishR = defaultEdgeItems(rounded, deckOf, nid);
  assert(finishR.length === 8 && finishR.every((it) => edgeKind(it) === "stairs" && it.full), "a free-standing rounded stage gets a flight on each of its eight sides");
  const arcFlights = finishR.filter((it) => stageSide(rounded.stage, undefined, it.edge)!.curved).map((it) => edgeItemShape(rounded.stage, it, deckOf)!);
  assert(arcFlights.length === 4 && arcFlights.every((s) => s.polygon.length > 4 && s.depthMm === 840), "…the four on the arcs following them, as deep as the straight ones");
  const frontFlight = edgeItemShape(rounded.stage, finishR.find((it) => stageSide(rounded.stage, undefined, it.edge)!.edges.includes(rounded.stage.front))!, deckOf)!;
  assert(
    arcFlights.filter((s) => s.polygon.some((q) => frontFlight.polygon.some((f) => Math.hypot(q.x - f.x, q.y - f.y) < 2))).length === 2,
    "…the front's flight meeting an arc's flush at each tangent point",
  );
  const withFinish = { ...rounded, stage: { ...rounded.stage, stairs: finishR } };
  assert(stageCorners(withFinish.stage, deckOf).length === 0, "…and no corner piece at a tangent point");
  assert(edgeGaps(withFinish, deckOf).length === 0, "…nothing left bare");

  // A bowed front.
  const bw = shapedRect(6000, 4000, { bowMm: 300 });
  const bowed: StagePlacement = { ...rounded, id: "bw", stage: { outline: bw.outline, smooth: bw.smooth, front: bw.front, decks: ["big", "small"], heightMm: 600, bowMm: 300 } };
  assert(bw.offset.y === -150 && stageBox(bowed.stage).depthMm === 4300, "a 6×4 bowed 30cm stands 15cm forward of the rectangle and reads 4.3m deep");
  const bpr = plainRect(bowed.stage)!;
  assert(bpr[0].y === -1850 && bpr[2].y === 2150 && bpr[0].x === -3000, "…its plain rectangle the 4m behind the chord");
  const bSides = stageSides(bowed.stage);
  assert(bSides.length === 4 && bSides.find((s) => s.edges.includes(bowed.stage.front))!.curved, "its front is the bow: one curved side");
  const laidB = layStage(bowed.stage, deckOf);
  assert(laidB.decks.length === 12 && laidB.decks.every((d) => d.rotation === 0 && !d.outline), "the field is the plain 6×4's twelve decks, square to the stage");
  assert(
    laidB.missing.length >= 2 && laidB.missing.every((m) => m.info.kind === "curve" && m.outline.every((q) => q.y <= -1850 + 1 && q.y >= -2150 - 1)),
    "…and the bow is named as curved pieces in front of the chord — none of them a cut deck",
  );
  assert(new Set(laidB.missing.map((m) => m.shape)).size <= Math.ceil(laidB.missing.length / 2), "…its two halves mirror images, one shape each pair");

  // "הוספה לקטלוג": each missing shape made a catalog row (pieceProduct), read back as a deck
  // (deckTypeOf) and chosen for the stage — and the stage is then built WITH it, nothing missing.
  const supplied = (stage: StageBuild, look: DeckLookup, label: string) => {
    const before = layStage(stage, look);
    const rows = missingByShape(before.missing).map((g, k) => {
      const p = pieceProduct(g.info, 600);
      const product = { id: `m${k}`, category: "stage-decks", layer: "floor", categoryFields: {}, styleTags: [], variants: [], ...p } as unknown as Product;
      return { id: `m${k}`, type: deckTypeOf(`m${k}`, product), count: g.count };
    });
    const look2: DeckLookup = (id) => rows.find((r) => r.id === id)?.type ?? look(id);
    const after = layStage({ ...stage, decks: [...stage.decks, ...rows.map((r) => r.id)] }, look2);
    assert(rows.length > 0 && after.missing.length === 0, `${label}: once its missing pieces are in the catalog, nothing is missing`);
    assert(rows.every((r) => after.decks.filter((d) => d.typeId === r.id).length === r.count), `${label}: …each piece standing where it was missing, as many as were missing`);
    assert(after.coverage > before.coverage + 0.01, `${label}: …and covering what it did not`);
  };
  supplied(bowed.stage, deckOf, "a bowed front");
  supplied(rounded.stage, deckOf, "a stage rounded R100");
  supplied({ outline: sh5.outline, smooth: sh5.smooth, front: sh5.front, decks: ["sheet"], heightMm: 400 }, (id) => (id === "sheet" ? { id, widthMm: 2440, depthMm: 1220, heightMm: 400 } : undefined), "sheets rounded R50");
  supplied({ outline: [{ x: -3660, y: -1830 }, { x: 3660, y: -1830 }, { x: 3660, y: 610 }, { x: 2440, y: 1830 }, { x: -3660, y: 1830 }], front: 0, decks: ["sheet"], heightMm: 400 }, (id) => (id === "sheet" ? { id, widthMm: 2440, depthMm: 1220, heightMm: 400 } : undefined), "a corner cut at 45°");
  supplied(dh.stage, deckOf4, "a drawn half-round");
  const rails = railingRuns({ ...bowed, stage: { ...bowed.stage, heightMm: 900 } }, deckOf, 800);
  assert(rails.length === 3 && rails.every((r) => !r.front), "a bowed front is still the front: railed on the other three sides, never on the bow");
  assert(skirtMm(bowed, deckOf) > 20000, "…and skirted along the bow, which is longer than its chord");
  const finishB = defaultEdgeItems(bowed, deckOf, nid);
  assert(finishB.length === 4 && edgeItemShape(bowed.stage, finishB.find((it) => stageSide(bowed.stage, undefined, it.edge)!.curved)!, deckOf)!.polygon.length > 4, "…its stairs following the bow");
  // Both together, and at another size: the same shape, rebuilt from the new rectangle.
  const again = shapedRect(7320, 4000, { roundedMm: 1000, roundedAt: "all", bowMm: 300 });
  const againStage = { outline: again.outline, smooth: again.smooth, front: again.front, decks: [] };
  assert(stageSides(againStage).length === 8 && stageSides(againStage).find((s) => s.edges.includes(0))!.curved, "a shaped stage at a new size is the same shape — eight sides, the bow its front");
  // Merged with another stage, the shape goes: the merged outline is laid as the curve it is.
  const neighbour: StagePlacement = { ...place(rect(3000, -2000, 2000, 4000), 0), id: "nb" };
  const mergedR = mergeStages([rounded, neighbour]);
  assert(!!mergedR && mergedR.stage.roundedMm === undefined && plainRect(mergedR.stage) === null && layStage(mergedR.stage, deckOf).decks.length > 0, "a rounded stage merged with another forgets its radius and is laid as the outline it now is");
}
{
  // THE STAIR MODULE: a stage built in the crew's own step climbs in it (StageBuild.riserMm /
  // treadMm), and a stage that says nothing climbs by the defaults — exactly as before it existed.
  const six: StageBuild = { outline: [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 2000 }, { x: -3000, y: 2000 }], front: 0, decks: [], heightMm: 600 };
  const flight: StageStair = { id: "f", edge: 2, t: 0.5, widthMm: 1000 };
  const none: DeckLookup = () => undefined;
  const plain = edgeItemShape(six, flight, none)!;
  assert(plain.risers === 4 && plain.riserMm === 150 && plain.depthMm === 3 * TREAD_MM, "by default a 60cm stage climbs in four risers of 15 over three 28cm treads");
  const modular = edgeItemShape({ ...six, riserMm: 200 }, flight, none)!;
  assert(modular.risers === 3 && modular.riserMm === 200 && modular.depthMm === 2 * TREAD_MM, "built in 20cm modules it climbs in three — no riser taller than the module");
  const deep = edgeItemShape({ ...six, riserMm: 200, treadMm: 300 }, flight, none)!;
  assert(deep.depthMm === 600 && deep.treads.length === 1, "…and its run is the module's tread, one line between the two treads");
  assert(edgeItemShape({ ...six, riserMm: 200 }, { ...flight, risers: 5 }, none)!.risers === 5, "a typed count still wins over the module");
  assert(stairStepOf(six).riserMm === RISER_MAX_MM && stairStepOf({ riserMm: 0 }).riserMm === RISER_MAX_MM, "no module, or a zero, is the default");
}
{
  // ── MERGED, EACH AT ITS OWN HEIGHT (2026-10-31). Two 4×2 stages side by side facing the room
  // (down, y = 2000), the left at 40cm, the right at 60cm, each with a flight the length of its
  // front: one stage at 40 with the right half a level at 60, and the two flights one run.
  const L: StagePlacement = { ...place(rect(0, 0, 4000, 2000), 2), id: "L" };
  L.stage = { ...L.stage, heightMm: 400, stairs: [{ id: "lf", edge: L.stage.front, t: 0.5, widthMm: 4000, full: true }] };
  const R: StagePlacement = { ...place(rect(4000, 0, 4000, 2000), 2), id: "R" };
  R.stage = { ...R.stage, heightMm: 600, stairs: [{ id: "rf", edge: R.stage.front, t: 0.5, widthMm: 4000, full: true }] };
  const m = mergeStages([L, R], deckOf)!;
  assert(!!m && m.stage.heightMm === 400 && m.stage.levels?.length === 1 && m.stage.levels[0].heightMm === 600, "a 40cm and a 60cm stage merged are one stage at 40 with a level at 60");
  const mp: StagePlacement = { ...L, stage: m.stage, position: m.position, rotation: m.rotation, mirrored: false };
  const lvXs = m.stage.levels![0].outline.map((q) => Math.round(toRoom(mp, q).x));
  assert(Math.min(...lvXs) === 4000 && Math.max(...lvXs) === 8000, "…the level standing where the 60cm stage stood");
  const laidM = layStage(m.stage, deckOf);
  assert(laidM.decks.filter((d) => d.level).length === 4 && laidM.decks.filter((d) => d.level).every((d) => d.heightMm === 600), "…decked at 60 there");
  assert(laidM.decks.filter((d) => !d.level).length === 4 && laidM.decks.filter((d) => !d.level).every((d) => d.heightMm === 400), "…and at 40 beside it");
  const its = m.stage.stairs ?? [];
  assert(its.length === 2 && its.filter((it) => it.level).length === 1, "each part keeps its flight — the 60cm one on its level");
  const bs = edgeItemShape(m.stage, its.find((it) => !it.level)!, deckOf)!;
  const ls = edgeItemShape(m.stage, its.find((it) => it.level)!, deckOf)!;
  assert(bs.riseMm === 400 && ls.riseMm === 600 && ls.outer && ls.floorMm === 0, "…the level's climbing from the floor, all 60cm");
  assert(bs.risers === ls.risers && bs.risers === 4 && bs.depthMm === ls.depthMm, "…both in the run's four steps, as deep as each other");
  assert(bs.ends.includes("flush") && ls.ends.includes("flush"), "…flush end to end: no line between them");
  assert(edgeItemStrokes(bs).length === 3 && edgeItemStrokes(ls).length === 3, "…so each draws its end line at its far end only, none at the joint");
  const runsM = openEdges(mp, deckOf);
  const at600 = runsM.filter((r) => r.dropMm === 600).reduce((s, r) => s + r.lengthMm, 0);
  const at400 = runsM.filter((r) => r.dropMm === 400).reduce((s, r) => s + r.lengthMm, 0);
  assert(at600 === 6000 && at400 === 6000, `the 60cm part is skirted at 60 round its outer sides, the 40cm at 40 — never the base's edge under the level (${at600}, ${at400})`);
  assert(runsM.some((r) => r.dropMm === 200 && r.lengthMm === 2000), "…and the step up between them is a 20cm face to finish");
  // At the same height nothing changes: one stage, no level.
  const same = mergeStages([L, { ...R, stage: { ...R.stage, heightMm: 400 } }], deckOf)!;
  assert(!same.stage.levels?.length && same.stage.stairs?.length === 1 && same.stage.stairs[0].full === true, "two at one height are one stage, one flight across its front");

  // ── A HALF-ROUND APRON at 40 in the middle of a 4.88×2.44 stage's front at 60, a flight round its
  // arc and one along the stage's front. The apron's arc and the stage's front meet at two inside
  // corners: the flights there are mitred, so they turn each corner as one run, never through each
  // other — and climb in one number of steps.
  const main: StagePlacement = { ...place(rect(0, 0, 4880, 2440), 2), id: "main" };
  main.stage = { ...main.stage, heightMm: 600, stairs: [{ id: "mf", edge: main.stage.front, t: 0.5, widthMm: 4880, full: true }] };
  const half = halfRoundArea({ x: 1220, y: 2440 }, { x: 3660, y: 2440 }, 1);
  assert(half.outline.every((q) => q.y >= 2440 - 1), "(the apron bulges into the room)");
  const hf = half.outline.reduce(
    (b, q, i) => {
      const nq = half.outline[(i + 1) % half.outline.length];
      return (q.y + nq.y) / 2 > b.y ? { i, y: (q.y + nq.y) / 2 } : b;
    },
    { i: 0, y: -Infinity },
  ).i;
  const hAt = stageFromArea(half.outline, hf);
  const apronStage: StageBuild = { outline: hAt.outline, front: hAt.front, decks: ["big", "small"], smooth: half.smooth, heightMm: 400 };
  const arcSide = stageSides(apronStage).find((s) => s.curved)!;
  apronStage.stairs = [{ id: "arc", edge: arcSide.edge, t: 0.5, widthMm: Math.round(arcSide.L), full: true }];
  const apron2: StagePlacement = { id: "apron", variantId: "big", layer: "floor", quantity: 1, scale: 1, position: hAt.position, rotation: hAt.rotation, stage: apronStage };
  for (const [label, hMain] of [
    ["at 60 over an apron at 40", 600],
    ["all at 40", 400],
  ] as const) {
    const mainH = { ...main, stage: { ...main.stage, heightMm: hMain } };
    const ma = mergeStages([mainH, apron2], deckOf)!;
    assert(!!ma, `${label}: the stage and its apron merge`);
    assert(hMain === 600 ? ma.stage.heightMm === 400 && ma.stage.levels?.length === 1 && ma.stage.levels[0].heightMm === 600 : !ma.stage.levels?.length, `${label}: the higher part is a level, the same height none`);
    const sa = (ma.stage.stairs ?? []).map((it) => ({ it, s: edgeItemShape(ma.stage, it, deckOf)! }));
    const arcIt = sa.find(({ it }) => stageSide(ma.stage, it.level, it.edge)?.curved);
    const fronts = sa.filter((x) => x !== arcIt);
    assert(!!arcIt && fronts.length === 2, `${label}: the apron's flight on its arc, the stage's front flight on both sides of the apron (got ${sa.length})`);
    assert(
      sa.every(({ s }) => s.risers === sa[0].s.risers && Math.abs(s.depthMm - sa[0].s.depthMm) < 1),
      `${label}: one number of steps round the whole run (${sa.map(({ s }) => s.risers).join(",")})`,
    );
    assert(arcIt!.s.ends[0] === "mitred" && arcIt!.s.ends[1] === "mitred" && fronts.every(({ s }) => s.ends.includes("mitred")), `${label}: mitred at both inside corners (${arcIt!.s.ends} / ${fronts.map(({ s }) => s.ends).join(" ")})`);
    // The arc's flight and each front flight share no floor: sampled every 20mm.
    for (const f of fronts) {
      const P = f.s.polygon;
      const xs = P.map((q) => q.x);
      const ys = P.map((q) => q.y);
      let both = 0;
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 20)
        for (let y = Math.min(...ys); y <= Math.max(...ys); y += 20) {
          const q = { x, y };
          if (insidePoly(q, P) && insidePoly(q, arcIt!.s.polygon) && !onBoundary(q, P, 3) && !onBoundary(q, arcIt!.s.polygon, 3)) both++;
        }
      assert(both === 0, `${label}: the front flight and the arc's never stand through each other (${both} points in both)`);
      // …and their treads meet on the valley: each line across the front flight ends where one across the arc's does.
      const ends = (s: EdgeItemShape) => s.lines.flatMap((l) => [l[0], l[l.length - 1]]);
      const met = ends(f.s).filter((q) => ends(arcIt!.s).some((r) => len(q, r) < 3)).length;
      assert(met >= f.s.lines.length, `${label}: every line across the front flight meets one of the arc's at the corner (${met} of ${f.s.lines.length})`);
    }
    const maAt: StagePlacement = { ...main, stage: ma.stage, position: ma.position, rotation: ma.rotation, mirrored: false };
    if (hMain === 600) {
      assert(layStage(ma.stage, deckOf).decks.filter((d) => d.level).every((d) => d.heightMm === 600), `${label}: the stage decked at 60`);
      assert(openEdges(maAt, deckOf).some((r) => r.dropMm === 200), `${label}: a 20cm face where it rises from the apron`);
    }
  }
}
// QA EI-7: a 6 m front of banquette | flight | banquette, the stage typed down to 2.4 m wide — every
// item clamped on its own stood through the others; separated, none overlaps and the flight (the
// narrowest) keeps its stretch. Items already apart come back as the same objects.
{
  const front: StageStair[] = [
    { id: "bl", kind: "bench", edge: 0, t: 0.2, widthMm: 2400 },
    { id: "fl", kind: "stairs", edge: 0, t: 0.5, widthMm: 1200 },
    { id: "br", kind: "bench", edge: 0, t: 0.8, widthMm: 2400 },
  ];
  const narrow: StageBuild = { outline: rectOutline(2400, 3000), front: 0, decks: [], stairs: front };
  const apart = separateEdgeItems(narrow);
  const spans = apart.map((it) => itemSpan(narrow, it)!).sort((a, b) => a.from - b.from);
  assert(spans.every((sp, i) => i === 0 || sp.from >= spans[i - 1].to - 1), "a stage made narrower leaves no two edge items through each other (EI-7)");
  const fl = apart.find((it) => it.id === "fl");
  assert(!!fl && fl.widthMm === 1200, "…the narrowest (the flight) keeps its stretch");
  const wide: StageBuild = { outline: rectOutline(6000, 3000), front: 0, decks: [], stairs: front };
  assert(separateEdgeItems(wide).every((it, i) => it === front[i]), "…and items already apart come back untouched");
}
// QA EI-10: a banquette with a sofa and typed chairs, split round a flight clicked into its middle,
// keeps them on ONE piece; the other piece seats automatically and has no sofa.
{
  const typed: StageStair = { id: "b", kind: "bench", edge: 0, t: 0.35, widthMm: 4200, bench: { back: { kind: "chairs", seats: 8 }, front: { kind: "sofa", widthMm: 1800 } } };
  const fl: StageStair = { id: "f", kind: "stairs", edge: 0, t: 0.3, widthMm: 1200 };
  const split = shareSide({ outline: rectOutline(6000, 3000), front: 0, decks: [], stairs: [typed, fl] }, "f");
  const pieces = split.filter((it) => it.kind === "bench");
  assert(pieces.length === 2, "a flight clicked into a banquette splits it in two");
  const kept = pieces.find((it) => it.id === "b")!;
  const other = pieces.find((it) => it.id !== "b")!;
  assert(kept.bench?.front?.kind === "sofa" && kept.bench?.back?.seats === 8, "…one piece keeps the sofa and the typed chairs");
  assert(other.bench?.front?.kind === "none" && other.bench?.back?.kind === "chairs" && other.bench?.back?.seats === undefined, "…the other has no sofa and seats automatically");
}
// §2.2: two banquettes meeting at an L-shaped stage's INSIDE corner are mitred, as stairs are — a
// ר of banquettes, two pieces, one bend; neither stands through the other.
{
  const lOut = [
    { x: -3000, y: -2000 },
    { x: 3000, y: -2000 },
    { x: 3000, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 2000 },
    { x: -3000, y: 2000 },
  ];
  const lStage: StageBuild = {
    outline: lOut,
    front: 0,
    decks: [],
    heightMm: 400,
    stairs: [
      { id: "b1", kind: "bench", edge: 2, t: 0.5, widthMm: 3000, full: true },
      { id: "b2", kind: "bench", edge: 3, t: 0.5, widthMm: 2000, full: true },
    ],
  };
  const s1 = edgeItemShape(lStage, lStage.stairs![0], deckOf)!;
  const s2 = edgeItemShape(lStage, lStage.stairs![1], deckOf)!;
  assert(s1.ends.includes("mitred") && s2.ends.includes("mitred"), `two banquettes at an inside corner are mitred (${s1.ends} / ${s2.ends})`);
  let both = 0;
  for (let x = 0; x <= 1200; x += 20)
    for (let y = 0; y <= 1200; y += 20) {
      const q = { x, y };
      if (insidePoly(q, s1.polygon) && insidePoly(q, s2.polygon) && !onBoundary(q, s1.polygon, 3) && !onBoundary(q, s2.polygon, 3)) both++;
    }
  assert(both === 0, `…and share no floor at the corner (${both} samples in both)`);
}
console.log("stage self-check passed");
