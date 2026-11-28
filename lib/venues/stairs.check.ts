// npm run check:stairs — the self-check of ./stairs.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { defaultStairs, MIN_STAIRS_WIDTH_MM, normalizeStairs, stairsFlights, stairsGeometry, stairsPlacementAt, stairsRiserMm, stairsRunMm, stepsForRise, type StairsHost } from "./stairs";

// ponytail: self-check. Run: npm run check:stairs
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
// A 3m × 2m stage, 60cm high, sitting at the origin and square to the world.
const stage: StairsHost = { x: 0, y: 0, widthMm: 3000, depthMm: 2000, heightMm: 600, rotationDeg: 0 };

// --- the rise adds up ---------------------------------------------------------------------------
const first = defaultStairs(stage);
assert(first.steps === 4, `a 60cm deck defaults to 4 risers of ~15cm (got ${first.steps})`);
const risen = stairsRiserMm({ ...stage, stairs: first });
assert(Math.abs(risen * first.steps - stage.heightMm) < 1e-9, "the risers add up to exactly the deck height");
assert(risen > 100 && risen < 200, "…at a height a person can actually climb");
assert(defaultStairs({ ...stage, heightMm: 0 }).steps === 1, "a deck flush with the floor still gets one step, not zero");
assert(stepsForRise(600, 300) === 2, "asking for 30cm steps on a 60cm deck gives two of them");
assert(defaultStairs({ ...stage, heightMm: 750 }).steps === 5, "a 75cm deck takes five risers — four would be 18.75cm, over the 18cm rule");
assert(defaultStairs({ ...stage, heightMm: 360 }).steps === 2, "…and a 36cm one exactly two of 18cm");
// The walking line runs up the flight, foot to deck, inside the outline.
const walk = stairsGeometry({ ...stage, stairs: first })!.arrow;
assert(walk.from.y > walk.to.y && walk.to.y > 1000 && walk.from.y < 1900, "the arrow runs from the foot of the flight up to the deck edge, clear of both ends");
assert(stepsForRise(600, 0) === 1, "a nonsense riser height falls back to a single step rather than dividing by zero");

// --- footprint ----------------------------------------------------------------------------------
assert(stairsRunMm({ ...first, steps: 4, treadMm: 300 }) === 900, "4 risers stand on 3 treads — the last one lands on the deck");
assert(stairsRunMm({ ...first, steps: 1, treadMm: 300 }) === 300, "a single step still occupies a tread of floor");

const geo = stairsGeometry({ ...stage, stairs: first })!;
assert(geo !== null, "a feature with stairs has a flight to draw");
// Front = the +depth side, so the flight runs from y=1000 (the deck edge) out to y=1900.
assert(geo.outline.every((p) => Math.abs(p.y - 1000) < 1e-6 || Math.abs(p.y - 1900) < 1e-6), "the flight spans from the deck edge out by its run");
assert(geo.outline.every((p) => Math.abs(p.x) <= first.widthMm / 2 + 1e-6), "…and no wider than the flight itself");
assert(geo.nosings.length === 2, "3 treads show 2 interior step edges; the outer two are the footprint's own");
assert(Math.abs(geo.centre.y - 1450) < 1e-6 && Math.abs(geo.centre.x) < 1e-6, "the flight's centre is the middle of its run");
assert(stairsGeometry(stage) === null, "a feature without stairs has no flight");

// A pair: the twin hangs off the opposite edge, the same size, and survives normalising.
assert(stairsFlights({ ...stage, stairs: first }).length === 1 && stairsFlights(stage).length === 0, "one flight unless a pair is asked for");
const pair = stairsFlights({ ...stage, stairs: normalizeStairs(stage, { ...first, bothSides: true }) });
assert(pair.length === 2, "bothSides draws a second flight, and normalising keeps the flag");
assert(Math.abs(pair[0].centre.y + pair[1].centre.y) < 1e-6 && pair[1].centre.y < 0, "…mirrored across the deck");

// A flight on the left edge hangs off -x, and its width is bounded by the *depth* of the stage.
const onLeft = normalizeStairs(stage, { ...first, side: "left", widthMm: 9000 });
assert(onLeft.widthMm === 2000, "a flight is never wider than the edge it hangs off");
const leftGeo = stairsGeometry({ ...stage, stairs: onLeft })!;
assert(leftGeo.outline.every((p) => p.x <= -1500 + 1e-6), "the left flight sits outside the deck's left edge");

// --- rotation -----------------------------------------------------------------------------------
// Turned 90°, the stage's own "front" no longer points along world +y at all. The stairs must
// follow the stage rather than staying below it.
const turned = stairsGeometry({ ...stage, rotationDeg: 90, stairs: first })!;
assert(turned.centre.x < -1000 && Math.abs(turned.centre.y) < 1e-6, "a rotated stage's stairs turn with it rather than staying on world +y");
assert(Math.abs(Math.hypot(turned.centre.x, turned.centre.y) - Math.hypot(geo.centre.x, geo.centre.y)) < 1e-6, "…without changing how far out they reach");

// --- clamping and dropping ----------------------------------------------------------------------
const slid = normalizeStairs(stage, { ...first, offsetMm: 99999 });
assert(slid.offsetMm === (3000 - first.widthMm) / 2, "sliding a flight past the corner stops it flush with the end of the edge");
const narrowed = normalizeStairs({ ...stage, widthMm: 300 }, first);
assert(narrowed.widthMm === MIN_STAIRS_WIDTH_MM, "a flight never shrinks below a width a person fits through");

assert(stairsPlacementAt(stage, { x: 0, y: 4000 }).side === "front", "dropping below the stage picks the front edge");
assert(stairsPlacementAt(stage, { x: 0, y: -4000 }).side === "back", "…above it, the back edge");
assert(stairsPlacementAt(stage, { x: 4000, y: 0 }).side === "right", "…to the +x side, the right edge");
assert(stairsPlacementAt(stage, { x: -4000, y: 0 }).side === "left", "…and to the -x side, the left edge");
assert(stairsPlacementAt(stage, { x: 800, y: 3000 }).offsetMm === 800, "the drop point's position along the edge becomes the slide");
// A pointer just past the short edge of a wide stage is nearer the centre in x than in y, and yet
// it is the edge it has crossed — this is the case a plain distance-to-centre test gets wrong.
assert(stairsPlacementAt(stage, { x: 1600, y: 900 }).side === "right", "the side is the edge the pointer went outside, not the axis it is nearest");
// A turned stage takes the drop in its own frame: at 90° that stage's front faces world -x.
assert(stairsPlacementAt({ ...stage, rotationDeg: 90 }, { x: -4000, y: 0 }).side === "front", "a drop on a rotated stage resolves in the stage's own frame");

console.log("stairs self-check passed");
