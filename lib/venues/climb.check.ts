// npm run check:climb — the self-check of ./climb.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { buildArcOutline } from "@/lib/studio/footprint";
import { climbDrawing, climbRisers, climbRunMm, climbTreads, formatRatio, patchForHeight, patchForRisers, patchToAccessible, patchToCurved, patchToStraight, rampRatio, rampTooSteep, riserHeightMm, risersForRise, slopeOn, treadDepthMm, walkingLine, walkingPadMm, withRun, type ClimbHost } from "./climb";

// ponytail: self-check. Run: npm run check:climb
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const stairs: ClimbHost = { kind: "stairs", shape: "rect", widthMm: 3000, depthMm: 560, heightMm: 450 };

// --- the rise decides the steps ---------------------------------------------------------------
assert(climbRisers(stairs) === 3, "45cm climbs in 3 risers of 15cm");
assert(risersForRise(540) === 3 && risersForRise(541) === 4, "…and a riser is never over 18cm");
assert(risersForRise(0) === 1, "a flight that climbs nothing is still one step");
assert(climbTreads(stairs) === 2 && near(treadDepthMm(stairs), 280), "3 risers stand on 2 treads of 28cm");
assert(climbRisers({ ...stairs, climb: { risers: 5 } }) === 5, "typed risers win over the derived count");
assert(near(riserHeightMm({ ...stairs, climb: { risers: 5 } }), 90), "…and the riser follows them");

// --- the height carries the run with it ---------------------------------------------------------
const higher = patchForHeight(stairs, 900);
assert(higher.heightMm === 900 && "depthMm" in higher && higher.depthMm === 4 * 280, "90cm is 5 risers on 4 treads, at the tread the flight had");
const wide = { ...stairs, depthMm: 700 }; // treads of 35cm, the designer's choice
const wider = patchForHeight(wide, 900);
assert("depthMm" in wider && wider.depthMm === 4 * 350, "…and a flight with deep treads keeps them");
const typed = patchForRisers(stairs, 6);
assert(typed.climb.risers === 6 && "depthMm" in typed && typed.depthMm === 5 * 280, "typing risers re-derives the run at the same tread");
assert(patchForRisers({ ...stairs, climb: { risers: 6 } }, undefined).climb.risers === undefined, "clearing them goes back to deriving");

const ramp: ClimbHost = { kind: "ramp", shape: "rect", widthMm: 1500, depthMm: 5400, heightMm: 450 };
assert(near(rampRatio(ramp), 12, 0.001) && !rampTooSteep(ramp), "45cm over 5.4m is 1:12");
assert(formatRatio(rampRatio(ramp)) === "1:12" && formatRatio(8.53) === "1:8.5", "the slope reads 1:12, or 1:8.5");
const raised = patchForHeight(ramp, 600);
assert("depthMm" in raised && raised.depthMm === 7200, "a 1:12 ramp raised to 60cm stays 1:12 — 7.2m");
const short = { ...ramp, depthMm: 3600 };
assert(rampTooSteep(short) && formatRatio(rampRatio(short)) === "1:8", "a 3.6m ramp over 45cm is 1:8, and too steep");
const fixed = patchToAccessible(short);
assert("depthMm" in fixed && fixed.depthMm === 5400, "…until it is set back to 1:12");
assert(rampRatio({ ...ramp, heightMm: 0 }) === Infinity && !rampTooSteep({ ...ramp, heightMm: 0 }), "a ramp that climbs nothing is no slope at all");

// --- drawing ------------------------------------------------------------------------------------
const drawn = climbDrawing(stairs);
assert(drawn.treads.length === 1, "2 treads show one step edge inside; the outline's two ends are the others");
assert(drawn.arrow.from.y > 0 && drawn.arrow.head[0].y < 0, "by default it climbs toward −y: the arrow runs up the box");
const down = climbDrawing({ ...stairs, climb: { reversed: true } });
assert(down.arrow.from.y < 0 && down.arrow.head[0].y > 0, "reversed, it climbs the other way");
assert(drawn.arrow.head.every((p) => Math.abs(p.y) <= 280 + 1e-6), "the arrow stays inside the flight");
assert(!drawn.slope, "stairs print no slope");
const rampDrawn = climbDrawing(ramp);
assert(rampDrawn.treads.length === 0 && rampDrawn.slope?.text === "1:12", "a ramp has no step edges, and says its slope");
assert(climbDrawing(short).slope?.tooSteep === true, "…and says when it is too steep");
// The walking line on its own — what a stage's flights borrow: from the foot to the head, the
// arrowhead at the head, sized to the run and never past 45cm; the slope at its middle, along it.
const borrowed = walkingLine({ x: 0, y: 1000 }, { x: 0, y: 0 }, 1200);
assert(borrowed.from.y === 1000 && borrowed.head[0].y === 0 && borrowed.to.y > 0 && borrowed.to.y < 1000, "the walking line runs foot to head, its arrowhead at the head");
assert(walkingLine({ x: 0, y: 9000 }, { x: 0, y: 0 }, 9000).head[0].y - walkingLine({ x: 0, y: 9000 }, { x: 0, y: 0 }, 9000).to.y === -450, "…its head at most 45cm long");
const written = slopeOn({ x: 0, y: 7200 }, { x: 0, y: 0 }, 7200, 600);
assert(written.text === "1:12" && !written.tooSteep && near(written.at.y, 3600) && near(written.angleDeg, -90), "the slope sits at the middle of the line, along it, and reads 1:12 for 7.2m over 60cm");
assert(slopeOn({ x: 0, y: 3600 }, { x: 0, y: 0 }, 3600, 600).tooSteep, "…and is flagged when steeper");
assert(walkingPadMm(560) === Math.min(560 * 0.12, 150) && walkingPadMm(7200) === 150, "the line stands in from the ends by 12% of the run, at most 15cm");

// A curved flight: the band is the run, its step edges are arcs of the ring, its arrow crosses the
// band at the top of the sweep.
const curved: ClimbHost = { kind: "stairs", shape: "arc", widthMm: 8000, depthMm: 0, heightMm: 450, arc: { sweepDeg: 120, bandMm: 840 } };
assert(climbRunMm(curved) === 840 && near(treadDepthMm(curved), 420), "a curved flight runs across its band");
const arcs = climbDrawing(curved);
assert(arcs.treads.length === 1 && arcs.treads[0].includes(" A "), "its step edge is an arc");
const outline = buildArcOutline(8000, curved.arc).outline;
const top = Math.min(...outline.map((p) => p.y));
assert(near(arcs.arrow.head[0].y, top + Math.min(840 * 0.12, 150), 2) && near(arcs.arrow.head[0].x, 0), "it climbs to the outer rim, at the top of the sweep");
assert(climbDrawing({ ...curved, climb: { reversed: true } }).arrow.head[0].y > arcs.arrow.head[0].y, "…or reversed, to the inner one");
const curvedPatch = patchToCurved(stairs);
assert(curvedPatch.arc.bandMm === 560 && curvedPatch.widthMm / 2 > 560, "made curved, it keeps its run inside a ring wider than it");
const back = patchToStraight({ ...stairs, ...curvedPatch });
assert(near(back.widthMm, 3000, 2) && back.depthMm === 560, "…and made straight again, it is the flight it was");
const tallBand = withRun(curved, 99999);
assert("arc" in tallBand && tallBand.arc.bandMm === 4000, "a curved flight's run never exceeds its radius");

console.log("climb self-check passed");
