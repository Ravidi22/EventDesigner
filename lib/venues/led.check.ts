// npm run check:led — the self-check of ./led.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { resolveRail, type RunRail, type SideRail, type WallRail } from "@/lib/studio/rail";
import { type StructureFeature, type VenueStructure } from "./structure";
import { isLedStrip, LED_COLOUR, LED_DEPTH_MM, LED_RUN_MM, ledColourPatch, ledDropRail, ledEndPatch, ledEnds, ledLengthMm, ledLines, ledPatch, ledPieces, ledRunRail, ledsFollowFeatures, ledSideCandidates, ledWallRail, newLedFeature, syncLeds } from "./led";

// ponytail: self-check. Run: npm run check:led
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
// A 10 m wall along x (its left-hand normal +y), a 40 cm stage and a 1.1 m bar.
const stage: StructureFeature = { id: "st", kind: "stage", label: "במה", x: 5000, y: 4000, widthMm: 6000, depthMm: 3000, heightMm: 400, shape: "rect", rotationDeg: 0 };
const bar: StructureFeature = { id: "bar", kind: "bar", label: "בר", x: 2000, y: 8000, widthMm: 3000, depthMm: 800, heightMm: 1100, shape: "rect", rotationDeg: 0 };
const s: VenueStructure = {
  nodes: [
    { id: "n0", x: 0, y: 0 },
    { id: "n1", x: 10000, y: 0 },
    { id: "n2", x: 10000, y: 6000 },
  ],
  walls: [
    { id: "w", a: "n0", b: "n1", kind: "wall" },
    { id: "bow", a: "n1", b: "n2", kind: "wall", curve: { c1: { x: 800, y: 1000 }, c2: { x: 800, y: -1000 } } },
  ],
  entrances: [],
  features: [stage, bar],
};

// ON A WALL — at the floor line by default, on the side the click fell.
const wr = ledWallRail(s, "w", { x: 5000, y: 300 })!;
assert(wr.heightMm === 0 && wr.side === 1 && wr.from === 0 && wr.to === 1, "a new wall strip runs the whole wall, at the floor line, on the room's side");
assert(ledWallRail(s, "gone", { x: 0, y: 0 }) === null, "no wall, no strip");
const made = newLedFeature(s, wr)!;
assert(!!made && made.kind === "led" && made.led?.colour === LED_COLOUR && made.widthMm === 10000 && made.depthMm === LED_DEPTH_MM && made.rotationDeg === 0, "a venue strip's box is the band along its wall");
assert(near(made.y, LED_DEPTH_MM / 2) && made.x === 5000, "…its band on the room's side of the wall");
const wallLine = resolveRail(wr, { structure: s });
assert(wallLine?.type === "lines" && wallLine.lines[0].topMm === 0, "a strip at the floor line resolves to a top of 0, not the ceiling");

// ON A SIDE — a 40 cm stage offers its deck edge to a strip, never to a curtain.
const offered = ledSideCandidates(s.features);
assert(offered.map((c) => c.id).join(",") === "st,bar", "the 40 cm stage and the bar both offer their sides to a strip");
const dropped = ledDropRail(s, { x: 5000, y: 2400 }, { wallId: "w", distanceMm: 2400 }, offered, 2400);
assert(dropped?.type === "side" && dropped.featureId === "st" && dropped.side === 0 && dropped.out === 1, "a strip dropped beside the stage's front runs its edge, outside it");
const onWall = ledDropRail(s, { x: 5000, y: 300 }, { wallId: "w", distanceMm: 300 }, offered, 2400);
assert(onWall?.type === "wall" && onWall.heightMm === 0, "…and one dropped by the wall runs the wall, at the floor line");
const inAir = ledDropRail({ ...s, walls: [] }, { x: 20000, y: 20000 }, null, [], 2600);
assert(inAir?.type === "run" && inAir.heightMm === 2600 && near(Math.hypot(inAir.b.x - inAir.a.x, inAir.b.y - inAir.a.y), LED_RUN_MM), "with nothing near, a 3 m run at the height asked");
assert(ledDropRail({ ...s, walls: [] }, { x: 20000, y: 20000 }, null, [], 2600, (t) => t !== "run") === null, "…unless the row takes no run");
const sideRail = dropped as SideRail;
const site: VenueStructure = { ...s, features: [stage, bar, { ...newLedFeature(s, sideRail)!, id: "led" }] };
const onStage = site.features[2];
const stageLine = ledLines(site, onStage)[0];
assert(near(stageLine.lengthMm, 6000) && stageLine.topMm === 400, "a stage strip runs its 6 m front at the deck's height");
assert(onStage.widthMm === 6000 && near(onStage.y, 2500 - LED_DEPTH_MM / 2), "…its box a band just outside the deck edge");
const moved = syncLeds({ ...site, features: [{ ...stage, x: 7000 }, bar, onStage] });
assert(moved.features[2].x === 7000, "a side strip is re-laid where its stage now stands");
assert(syncLeds(site) === site, "nothing moved — the same structure back");
assert(ledsFollowFeatures(site), "…and the structure says a features edit has to re-lay it");

// The bar's stretch, its side, its height.
const half = ledPatch(site, onStage, { from: 0.25, to: 0.75 });
assert(half.widthMm === 3000 && half.x === 5000, "a shorter stretch re-lays the box along the edge");
const inward = ledPatch(site, onStage, { side: -1 });
assert(near(inward.y ?? 0, 2500 + LED_DEPTH_MM / 2), "…and its side turns it in onto the deck");
const wallFeature = { ...made, id: "wl" } as StructureFeature;
const raised = ledPatch(s, wallFeature, { heightMm: 1200 });
assert((raised.led?.rail as WallRail).heightMm === 1200, "a wall strip's height is typed");
const topped = ledPatch(s, wallFeature, { heightMm: null });
assert((topped.led?.rail as WallRail).heightMm === undefined, "…and null hands it to the wall's top");
assert(ledColourPatch(wallFeature, "#ff0000").led?.colour === "#ff0000" && ledColourPatch(wallFeature, "#ff0000").led?.rail === wr, "a colour is its own, its rail untouched");

// The ends slide along the wall; a run's end goes where it is dragged.
const ends = ledEnds(s, wallFeature)!;
assert(near(ends.from.p.x, 0) && ends.from.out.x === -1 && near(ends.to.p.x, 10000), "the ends are the wall's corners, each grip pointing on along it");
const slid = ledEndPatch(s, wallFeature, "to", { x: 4000, y: 500 });
assert(slid.widthMm === 4000, "an end slid to 4 m shortens the strip to 4 m");
const run = ledRunRail([{ x: 0, y: 5000 }, { x: 1000, y: 5500 }, { x: 4000, y: 5000 }], 3000)!;
assert(run.type === "run" && run.a.x === 0 && run.b.x === 4000 && run.heightMm === 3000, "a drawn run is its two ends — the bends let go");
assert(ledRunRail([{ x: 0, y: 0 }, { x: 50, y: 0 }], 3000) === null, "a run of a few centimetres is no run");
const runFeature = { ...newLedFeature(s, run)!, id: "r" } as StructureFeature;
assert(runFeature.widthMm === 4000 && near(runFeature.y, 5000), "a run's box is centred on its line");
const stretched = ledEndPatch(s, runFeature, "to", { x: 6000, y: 5000 });
assert((stretched.led?.rail as RunRail).b.x === 6000 && stretched.widthMm === 6000, "a run's end dragged out lengthens it");
assert(ledLengthMm(s, runFeature) === 4000 && ledPieces(s, runFeature).length === 1, "a run is one line, its length its own");

// A bowed wall: the strip follows the bow, its box a curved strip.
const bow = { ...newLedFeature(s, ledWallRail(s, "bow", { x: 9500, y: 3000 })!)!, id: "b" } as StructureFeature;
assert(bow.shape === "custom" && (bow.outline?.length ?? 0) > 8 && ledLengthMm(s, bow) > 6000, "a strip on a bowed wall follows the bow, longer than its chord");
const pieces = ledPieces(s, bow);
assert(pieces.length === 1 && pieces[0].line.length > 8, "…drawn along the curve");

// A wall gone: the strip keeps the box it had.
const noWall: VenueStructure = { ...s, walls: [], features: [wallFeature] };
assert(syncLeds(noWall) === noWall && ledEnds(noWall, wallFeature) === null && ledPieces(noWall, wallFeature).length === 1, "a strip whose wall is gone keeps its box and draws it");
assert(isLedStrip({ category: "led-strips" }) && !isLedStrip({ category: "curtains" }) && !isLedStrip(undefined), "a strip is told by its category");
console.log("led ok");
