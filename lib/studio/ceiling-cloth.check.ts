// npm run check:ceiling-cloth — the self-check of ./ceiling-cloth.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import type { VenueStructure } from "@/lib/venues/structure";
import { type RailContext, type RunRail } from "./rail";
import { polygonAreaMm2 } from "./geometry";
import { canopyCornerMoved, CLOTH_OPEN_SKY_MM, CLOTH_WIDTH_MM, clothAreaMm2, clothKindOf, clothRuns, defaultClothHeight, endHeightAt, GATHER, gatherOf, isCeilingClothCategory, longestSideDeg, maxSagMm, newCanopy, newRun, newSail, newSwag, redrawnCloth, RUN_SAG_MM, runClothLengthMm, runDrop, runEndHeight, runEndMoved, runGathers, runGatherTicks, runHalfWidth, runLights, runLowestMm, runOutline, runTop, runZ, sagFromPoint, sailCentre, sailIsFree, sailSheet, sailTieHeight, sailTieMoved, snapSwagEnd, snapTie, SWAG_GATHER, swagHandle, swagProfile, swagSagFor, tieCandidates, wavesFor, withSag, type TieContext } from "./ceiling-cloth";

// ponytail: self-check. Run: npm run check:ceiling-cloth
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

// Which is which: the category, never the rail alone.
const run: RunRail = { type: "run", a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, heightMm: 3500 };
assert(clothKindOf("ceiling-drapes", run) === "drape" && clothKindOf("led-strips", run) === null && clothKindOf("sails", run) === null, "a run is a drape only in the ceiling-drapes category");
assert(clothKindOf("sails", { type: "sail", ties: [] }) === "sail" && clothKindOf("curtains", { type: "wall", wallId: "w", from: 0, to: 1 }) === null, "a sail is the sails category's");
assert(isCeilingClothCategory("sails") && isCeilingClothCategory("ceiling-drapes") && !isCeilingClothCategory("curtains"), "the two categories");

// Defaults: the hook, else 3 m.
assert(defaultClothHeight({ x: 0, y: 0 }) === CLOTH_OPEN_SKY_MM && defaultClothHeight({ x: 0, y: 0 }, () => 4200) === 4200 && defaultClothHeight({ x: 0, y: 0 }, () => null) === 3000, "a new tie is the roof's height, else 3 m");

// A 6 m run: 4 scallops (1.5 m each), 1.2 m wide, 30 cm of sag — all defaults, none written.
const [r6] = clothRuns(run);
assert(r6.waves === 4 && r6.widthMm === CLOTH_WIDTH_MM && r6.sagMm === RUN_SAG_MM && near(r6.lengthMm, 6000), "a 6 m run: four scallops, 1.2 m wide, 30 cm of sag, by default");
assert(clothRuns(run) === clothRuns(run), "…remembered per rail");
const custom = clothRuns({ ...run, widthMm: 800, waves: 2, sagMm: 500 })[0];
assert(custom.waves === 2 && custom.widthMm === 800 && custom.sagMm === 500, "…or the rail's own");
assert(near(runDrop(r6, 0), 0) && near(runDrop(r6, 1 / 8), 300) && near(runDrop(r6, 1 / 4), 0), "it hangs its sag in the middle of every scallop and none where gathered");
assert(near(runHalfWidth(r6, 1 / 8), 600) && near(runHalfWidth(r6, 0), 600 * GATHER), "…full width mid-scallop, gathered at the ends");
const outline = runOutline(r6);
assert(outline.length === 2 * (4 * 8 + 1) && outline.every((q) => Math.abs(q.y) <= 600 + 1e-6), "the band's outline: both edges, inside the cloth's width");

// Fairy lights: none unless the rail says; one every 25 cm along a lit run, inside its cloth, with
// the cloth's drop under each.
assert(!r6.lights && runLights(r6).length === 0, "a run has no lights unless asked");
const lit = clothRuns({ ...run, lights: true })[0];
const lights = runLights(lit);
assert(lit.lights && lights.length === 24 && lights.every((q) => q.x > 0 && q.x < 6000 && Math.abs(q.y) <= runHalfWidth(lit, q.x / 6000) + 1e-6), `a lit 6 m run: twenty-four lights along it, inside the cloth (${lights.length})`);
assert(lights.some((q) => q.y > 1) && lights.some((q) => q.y < -1) && near(lights[0].dropMm, runDrop(lit, lights[0].x / 6000)), "…wandering across the cloth, each with the cloth's drop under it");
assert(runGatherTicks(r6).length === 5 && runGathers(r6)[2].x === 3000, "five gathers on four scallops — the ends and three between");
assert(wavesFor(700) === 1 && wavesFor(10000, 3) === 3, "never fewer than one scallop");

// ONE SWAG, point to point: a single scallop, its depth 12% of its length and written; each end at
// its own height; the lowest point and the cloth's own length walked.
const swag = newSwag({ x: 0, y: 0 }, { x: 6000, y: 0 }, 3500);
const [sw] = clothRuns(swag);
assert(swag.waves === 1 && swag.sagMm === 720 && swag.heightBMm === undefined && sw.waves === 1 && sw.sagMm === 720, `a new swag is one scallop, 12% of its length deep (${swag.sagMm})`);
assert(swagSagFor(1000) === 200 && swagSagFor(30000) === 1500, "…never under 20 cm nor over 1.5 m to start with");
assert(runLowestMm(sw) === 2780 && near(runZ(sw, 0), 3500) && near(runZ(sw, 0.5), 2780), "a level swag hangs lowest at its middle");
assert(runClothLengthMm(sw) > 6150 && runClothLengthMm(sw) < 6300 && near(runClothLengthMm(clothRuns({ ...swag, sagMm: 0 })[0]), 6000), `the cloth along its curve is longer than its line (${runClothLengthMm(sw)})`);
const tilted = newSwag({ x: 0, y: 0 }, { x: 6000, y: 0 }, 4000, 2600);
const [tl] = clothRuns(tilted);
assert(tilted.heightBMm === 2600 && near(runTop(tl, 0), 4000) && near(runTop(tl, 1), 2600) && near(runTop(tl, 0.5), 3300), "an end at its own height: the line runs from one to the other");
assert(runLowestMm(tl) < 2600 - 100 && runLowestMm(tl) > 2600 - 720, `…and its low point is past its middle, under its low end (${runLowestMm(tl)})`);
assert(clothRuns(newCanopy([{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }], 3800)).every((q) => q.heightBMm === undefined), "a canopy's runs are level");
const lowered = runEndHeight(swag, 1, 2800);
assert(lowered.heightMm === 3500 && lowered.heightBMm === 2800 && runEndHeight(lowered, 1, 3500).heightBMm === undefined, "an end's height is typed on its own; B back at A's is level again");
const raisedA = runEndHeight(swag, 0, 4200);
assert(raisedA.heightMm === 4200 && raisedA.heightBMm === 3500, "…and A raised leaves B where it was");
// The handle: at the middle, out from the line by the depth, on the screen's lower side; dragged, it
// sets the depth in whole centimetres, nothing behind the line, never to the floor.
const hd = swagHandle(sw);
assert(near(hd.base.x, 3000) && near(hd.at.y, 720) && hd.n.y === 1, "the depth's handle stands at the middle, its depth out from the line");
assert(swagHandle(clothRuns(newSwag({ x: 6000, y: 0 }, { x: 0, y: 0 }, 3500))[0]).n.y === 1 && swagHandle(clothRuns(newSwag({ x: 0, y: 0 }, { x: 0, y: 5000 }, 3500))[0]).n.x === 1, "…on the same side whichever way the swag was drawn");
assert(sagFromPoint(sw, { x: 3000, y: 1004 }) === 1000 && sagFromPoint(sw, { x: 100, y: 1004 }) === 1000 && sagFromPoint(sw, { x: 3000, y: -400 }) === 0, "dragged out it deepens by how far out it is; behind the line is taut");
assert(sagFromPoint(sw, { x: 3000, y: 9000 }) === 3300 && maxSagMm(sw) === 3300, "…and never nearer the floor than 20 cm");
assert(withSag(swag, 1000).sagMm === 1000 && withSag(swag, 0).sagMm === 0, "a depth set by hand is written, zero too");
assert(clothRuns(runEndHeight(withSag(swag, 3000), 1, 2200))[0].sagMm === 2000, "an end lowered after a deep curve was set: the cloth still stops 20 cm off the floor");
const prof = swagProfile(sw);
assert(prof.length === 17 && near(prof[8].y, 720) && near(prof[0].y, 0), "its profile is folded onto the plan: the curve the cloth makes from the side");
assert(swagHandle(r6).s === 0.375 && near(swagHandle(r6).base.x, 2250), "a run of several scallops holds its depth on a middle one");
assert(near(runHalfWidth(sw, 0), 600 * SWAG_GATHER) && near(runHalfWidth(sw, 0.5), 600) && gatherOf(r6) === GATHER, "one swag is bunched at the two points it hangs from; a scalloped run is gathered as it was");
assert(runOutline(sw).length === 2 * 25 && runGatherTicks(sw).length === 2, "…its edge one long curve, a tick at each end");
assert(endHeightAt({ x: 6000, y: 0 }, [null, tilted]) === 2600 && endHeightAt({ x: 0, y: 0 }, [tilted]) === 4000 && endHeightAt({ x: 3000, y: 0 }, [tilted]) === undefined, "a swag drawn from another's end hangs from the same hook, at its height");
const againSwag = redrawnCloth(tilted, newRun({ x: 0, y: 0 }, { x: 3000, y: 0 }, 3000));
assert(againSwag.heightBMm === 2600 && againSwag.waves === 1 && againSwag.sagMm === 720, "a swag drawn again keeps both its heights and its curve");

// A canopy over a 6 × 4 m area, runs along x 1.2 m apart, carries its width to every run.
const area: Point[] = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }];
const canopy = newCanopy(area, 3800);
assert(canopy.directionDeg === 0 && canopy.spacingMm === CLOTH_WIDTH_MM && canopy.widthMm === undefined, "a new canopy runs along its longest side, a width apart, its width the default");
assert(longestSideDeg([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 8000 }, { x: 0, y: 8000 }]) === 90, "…down the plan when that is the long side");
const runs = clothRuns(canopy);
assert(runs.length === 3 && runs.every((r) => near(r.lengthMm, 6000) && r.heightMm === 3800 && r.waves === 4), "three 6 m runs across a 4 m depth at 1.2 m — at its height, four scallops each");
assert(near(clothAreaMm2(canopy)!, 3 * 6000 * 1200), "…its cloth is the runs × the width");
const moved = canopyCornerMoved(canopy, 2, { x: 8000.4, y: 4000 });
assert(moved.outline[2].x === 8000 && canopy.outline[2].x === 6000, "a corner moved, whole millimetres, the old rail untouched");
assert(runEndMoved(run, 1, { x: 7000, y: 10 }).b.x === 7000 && runEndMoved(run, 0, { x: -5, y: 0 }).a.x === -5, "a run's ends move one at a time");
// Drawn again: what was typed stays — onto a run, and a run's width onto a canopy's spacing.
const typedRun: RunRail = { ...run, heightMm: 4100, widthMm: 900, sagMm: 500, waves: 2 };
const again = redrawnCloth(typedRun, newRun({ x: 0, y: 0 }, { x: 3000, y: 0 }, 3000));
assert(again.heightMm === 4100 && again.widthMm === 900 && again.sagMm === 500 && again.waves === 2 && again.b.x === 3000, "a run drawn again keeps its height, width, sag and scallops");
const asArea = redrawnCloth(typedRun, newCanopy(area, 3000));
assert(asArea.type === "canopy" && asArea.heightMm === 4100 && asArea.spacingMm === 900 && asArea.widthMm === 900, "…drawn again as an area, its width is the runs' spacing");

// Ties: a corner of a building beats the wall it stands against; a wall within reach; a post.
const structure: VenueStructure = {
  nodes: [
    { id: "n0", x: 0, y: 0 },
    { id: "n1", x: 10000, y: 0 },
    { id: "n2", x: 10000, y: 8000 },
  ],
  walls: [
    { id: "w", a: "n0", b: "n1", kind: "wall" },
    { id: "k", a: "n1", b: "n2", kind: "edge" },
  ],
  entrances: [],
  features: [
    { id: "b", kind: "structure", label: "מבנה", x: 3000, y: 2000, widthMm: 2000, depthMm: 2000, heightMm: 3500, shape: "rect", rotationDeg: 0 },
    { id: "low", kind: "stage", label: "במה", x: 7000, y: 5000, widthMm: 2000, depthMm: 1000, heightMm: 400, shape: "rect", rotationDeg: 0 },
    { id: "tree", kind: "plant", label: "עץ", x: 8000, y: 2000, widthMm: 3000, depthMm: 3000, heightMm: 5000, shape: "circle", rotationDeg: 0 },
  ],
};
const candidates = tieCandidates(structure.features);
assert(candidates.map((c) => c.id).join(",") === "b", "the building may be tied to; a 40 cm stage and a tree's crown may not");
const tctx: TieContext = { structure, candidates };
const corner = snapTie({ x: 2050, y: 1030 }, tctx, 150);
assert(corner.to.kind === "feature" && corner.to.featureId === "b" && corner.p.x === 2000 && corner.p.y === 1000, "a click by the building's corner ties to that corner");
const onWall = snapTie({ x: 6000, y: 120 }, tctx, 150);
assert(onWall.to.kind === "wall" && onWall.to.wallId === "w" && near(onWall.to.t, 0.6, 1e-4) && onWall.p.y === 0, "a click by the wall ties to it, on its line");
assert(snapTie({ x: 9950, y: 4000 }, tctx, 150).to.kind === "post", "an edge (a kerb) is no wall to tie to — a post");
assert(snapTie({ x: 6000, y: 3000 }, tctx, 150).to.kind === "post" && snapTie({ x: 6000, y: 120 }, tctx, 150, true).to.kind === "post", "open ground is a post, and so is anything with Alt held");

// A swag's end: another swag's end first, then a thing's middle or corner, then a wall, else itself.
const others = [{ x: 5000, y: 5000 }];
assert(snapSwagEnd({ x: 5060, y: 4950 }, tctx, others, 150).p.x === 5000 && snapSwagEnd({ x: 5060, y: 4950 }, tctx, others, 150).tied, "an end by another swag's end shares its point");
const onMid = snapSwagEnd({ x: 3040, y: 1980 }, tctx, others, 150);
assert(onMid.tied && onMid.p.x === 3000 && onMid.p.y === 2000, "…by a thing's middle it goes to the middle");
assert(snapSwagEnd({ x: 2050, y: 1030 }, tctx, others, 150).p.x === 2000 && snapSwagEnd({ x: 6000, y: 120 }, tctx, others, 150).p.y === 0, "…to its corner, or onto a wall's line");
const loose = snapSwagEnd({ x: 6000.4, y: 3000 }, tctx, others, 150);
assert(!loose.tied && loose.p.x === 6000 && !snapSwagEnd({ x: 5060, y: 4950 }, tctx, others, 150, true).tied, "open air is where it is, and so is anything with Alt held");

// A sail of three: the wall, the building's corner, a post — 3 m each by default.
const sail = newSail([onWall, corner, snapTie({ x: 6000, y: 6000 }, tctx, 150)], () => defaultClothHeight({ x: 0, y: 0 }));
assert(sail.ties.length === 3 && sail.ties.every((t) => t.heightMm === 3000) && sail.sagMm === undefined, "a new sail: its ties at 3 m, the sag left to the 8% default");
const ctx: RailContext = { structure };
const sheet = sailSheet(sail, ctx)!;
assert(!!sheet && sheet.posts.length === 1 && near(sheet.polygon[1].x, 2000) && sheet.sagMm > 0, "it resolves: one post of its own, tied to the building's corner, sagging");
assert(sailSheet(sail, ctx) === sheet, "…remembered while nothing it is tied to moves");
const shifted: VenueStructure = { ...structure, features: structure.features.map((f) => (f.id === "b" ? { ...f, x: 3500 } : f)) };
const carried = sailSheet(sail, { structure: shifted })!;
assert(carried !== sheet && near(carried.polygon[1].x, 2500), "the building moved: the tied corner goes with it");
assert(near(clothAreaMm2(sail, ctx)!, sheet.areaMm2) && near(clothAreaMm2(sail)!, Math.abs(polygonAreaMm2(sail.ties.map((t) => t.p)))), "a sail bills its polygon — in the room, or off its points as placed");
assert(clothAreaMm2({ type: "wall", wallId: "w", from: 0, to: 1 }) === undefined, "a curtain has no cloth area here");
const raised = sailTieHeight(sail, 2, 2456.4);
assert(raised.ties[2].heightMm === 2456 && sail.ties[2].heightMm === 3000, "a tie's height is typed on its own");
const retied = sailTieMoved(sail, 2, snapTie({ x: 4000, y: 80 }, tctx, 150));
assert(retied.ties[2].to?.kind === "wall" && retied.ties[2].heightMm === 3000, "a post dragged to the wall ties to it, its height kept");
assert(!sailIsFree(sail) && sailIsFree({ type: "sail", ties: [{ p: { x: 0, y: 0 }, heightMm: 3000, to: { kind: "post" } }, { p: { x: 1, y: 0 }, heightMm: 3000 }] }), "a sail tied to nothing in the room is free to copy");
const gone = sailSheet({ ...sail }, { structure: { ...structure, walls: [] } });
assert(gone === null, "a sail whose wall is gone resolves to nothing");
assert(near(sailCentre(sail, sheet)!.x, (sheet.polygon[0].x + sheet.polygon[1].x + sheet.polygon[2].x) / 3), "its middle is its corners' centroid");
console.log("ceiling-cloth self-check passed");
