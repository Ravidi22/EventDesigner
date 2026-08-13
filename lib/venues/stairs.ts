// Stairs onto a raised feature — in practice the built stage, which is a 40–80cm deck nobody walks
// onto without them, and whose approach a designer has to keep clear of tables.
//
// They are modelled as an attachment to the feature, not as a feature of their own, because that is
// what they physically are: move or turn the stage and the flight goes with it, and there is no
// state in which a stage's stairs are somewhere else.
//
// The rise is the load-bearing part of the model. A flight stores a step COUNT and derives the riser
// from the deck it climbs (heightMm / steps) rather than storing a height of its own: risers must
// add up to exactly the deck height, and two independently-stored numbers drift apart the first time
// the stage is raised. So "make them 17cm steps" is really "give me whichever count lands closest to
// 17cm" — which is what stepsForRise answers, and why the inspector's height field writes a count.
import type { Point } from "@/lib/studio/hall";
import { fromLocalFrame, toLocalFrame } from "@/lib/studio/geometry";

/** Which edge of the deck the flight hangs off, in the feature's OWN frame — so it turns with the
 *  stage instead of pointing at a fixed compass direction the stage no longer faces. */
export type StairsSide = "front" | "back" | "left" | "right";

export const STAIRS_SIDE_LABEL: Record<StairsSide, string> = {
  front: "חזית",
  back: "אחור",
  right: "ימין",
  left: "שמאל",
};

export const STAIRS_SIDES: StairsSide[] = ["front", "back", "right", "left"];

export interface FeatureStairs {
  side: StairsSide;
  /** Risers. The riser *height* is derived — see stairsRiserMm and this file's header. */
  steps: number;
  /** The going: how deep one step is underfoot. */
  treadMm: number;
  /** How wide the flight is, across the edge it hangs off. */
  widthMm: number;
  /** Slide along that edge, from its centre. 0 = centred. */
  offsetMm: number;
}

/** What a flight is attached to. Structural rather than importing StructureFeature: it keeps this
 *  module free of the venue model (so structure.ts can own the field without a cycle), and anything
 *  with a centre, a size and a facing can be measured by it. */
export interface StairsHost {
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  rotationDeg: number;
  stairs?: FeatureStairs;
}

const TARGET_RISER_MM = 170; // a comfortable event-stage step; the default count is whatever lands nearest this
const DEFAULT_TREAD_MM = 300;
const DEFAULT_WIDTH_MM = 1200;
export const MAX_STEPS = 20;
export const MIN_STAIRS_WIDTH_MM = 400;
export const MIN_TREAD_MM = 200;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** How many risers a deck of this height needs for steps of about `riserMm` each. Never zero: a
 *  flight with no steps is not a flight, and a deck flush with the floor still gets the one step
 *  the designer explicitly asked for by adding stairs at all. */
export function stepsForRise(heightMm: number, riserMm = TARGET_RISER_MM): number {
  if (!(riserMm > 0)) return 1;
  return clamp(Math.round(heightMm / riserMm), 1, MAX_STEPS);
}

export function stairsRiserMm(host: StairsHost): number {
  const steps = host.stairs?.steps ?? 0;
  return steps > 0 ? host.heightMm / steps : 0;
}

/** How much floor the flight eats. N risers means N-1 treads underfoot — the last riser lands on the
 *  deck itself, which is why a flight is never as deep as its step count suggests. A single step
 *  still occupies one tread's worth of floor, since the step block has to stand somewhere. */
export function stairsRunMm(stairs: FeatureStairs): number {
  return Math.max(1, stairs.steps - 1) * stairs.treadMm;
}

/** The length of the deck edge a flight is hung on — what the flight's width and slide are bounded by. */
export function sideLengthMm(host: StairsHost, side: StairsSide): number {
  return side === "front" || side === "back" ? host.widthMm : host.depthMm;
}

/** Keeps a flight on the deck it belongs to: never wider than the edge it hangs off, never slid so
 *  far along it that it hangs past the corner. Applied on every edit (see structure.updateFeature),
 *  so shrinking a stage takes its stairs in rather than leaving them floating off the end. */
export function normalizeStairs(host: StairsHost, stairs: FeatureStairs): FeatureStairs {
  const edge = sideLengthMm(host, stairs.side);
  const widthMm = clamp(Math.round(stairs.widthMm), MIN_STAIRS_WIDTH_MM, Math.max(MIN_STAIRS_WIDTH_MM, edge));
  const slack = Math.max(0, (edge - widthMm) / 2);
  return {
    side: stairs.side,
    steps: clamp(Math.round(stairs.steps), 1, MAX_STEPS),
    treadMm: Math.max(MIN_TREAD_MM, Math.round(stairs.treadMm)),
    widthMm,
    offsetMm: clamp(Math.round(stairs.offsetMm), -slack, slack),
  };
}

/** A first flight for this deck: as many steps as its height needs, centred on the front edge — the
 *  side an audience approaches from — at a width that fits the stage it is attached to. */
export function defaultStairs(host: StairsHost): FeatureStairs {
  return normalizeStairs(host, {
    side: "front",
    steps: stepsForRise(host.heightMm),
    treadMm: DEFAULT_TREAD_MM,
    widthMm: Math.min(DEFAULT_WIDTH_MM, Math.max(MIN_STAIRS_WIDTH_MM, host.widthMm)),
    offsetMm: 0,
  });
}

// The chosen side, as a pair of unit vectors in the feature's own frame: `out` points away from the
// deck (the direction the flight descends in), `along` runs across the edge. Everything below is
// expressed in these two, so all four sides share one piece of maths.
function frame(side: StairsSide): { out: Point; along: Point } {
  switch (side) {
    case "front":
      return { out: { x: 0, y: 1 }, along: { x: 1, y: 0 } };
    case "back":
      return { out: { x: 0, y: -1 }, along: { x: 1, y: 0 } };
    case "right":
      return { out: { x: 1, y: 0 }, along: { x: 0, y: 1 } };
    case "left":
      return { out: { x: -1, y: 0 }, along: { x: 0, y: 1 } };
  }
}

export interface StairsGeometry {
  /** The flight's footprint in world mm — deck edge first, then out to the bottom step. */
  outline: Point[];
  /** The step edges *inside* that footprint. The outermost and innermost ones are the outline's own
   *  two ends, so a renderer strokes the outline plus these and gets exactly one line per riser. */
  nosings: [Point, Point][];
  /** Middle of the flight — where a label sits, and what a drag grabs. */
  centre: Point;
}

/** The flight in world millimetres, rotation included. World rather than local on purpose: every
 *  renderer (the plan editor, the studio backdrop, the printed map) draws the deck inside its own
 *  rotated group, and handing them geometry that has to be rotated *again* is how a stage at 30°
 *  ends up with its stairs at 60°. */
export function stairsGeometry(host: StairsHost): StairsGeometry | null {
  const stairs = host.stairs;
  if (!stairs) return null;
  const centre = { x: host.x, y: host.y };
  const rot = host.rotationDeg ?? 0;
  const { out, along } = frame(stairs.side);
  // How far the chosen edge sits from the deck's centre, measured along `out` — the depth for the
  // front/back edges, the width for the left/right ones (the other axis to sideLengthMm's).
  const edge = (stairs.side === "front" || stairs.side === "back" ? host.depthMm : host.widthMm) / 2;
  const halfFlight = stairs.widthMm / 2;
  const run = stairsRunMm(stairs);
  const treads = Math.max(1, stairs.steps - 1);
  // `depth` is measured out from the deck edge, `across` along it from the flight's own centre.
  const at = (depth: number, across: number): Point =>
    fromLocalFrame(
      {
        x: out.x * (edge + depth) + along.x * (stairs.offsetMm + across),
        y: out.y * (edge + depth) + along.y * (stairs.offsetMm + across),
      },
      centre,
      rot,
    );
  const nosings: [Point, Point][] = [];
  for (let i = 1; i < treads; i++) nosings.push([at(i * stairs.treadMm, -halfFlight), at(i * stairs.treadMm, halfFlight)]);
  return {
    outline: [at(0, -halfFlight), at(0, halfFlight), at(run, halfFlight), at(run, -halfFlight)],
    nosings,
    centre: at(run / 2, 0),
  };
}

/** Where a dragged flight lands: the deck edge nearest the pointer, and how far along it to slide.
 *  Picking the side by which edge the pointer is *outside* (rather than by raw distance to the
 *  centre) is what makes dragging round a corner feel like moving the stairs rather than fighting
 *  them — the flight follows the pointer out past whichever edge it crossed. */
export function stairsPlacementAt(host: StairsHost, p: Point): { side: StairsSide; offsetMm: number } {
  const local = toLocalFrame(p, { x: host.x, y: host.y }, host.rotationDeg ?? 0);
  const beyondX = Math.abs(local.x) - host.widthMm / 2;
  const beyondY = Math.abs(local.y) - host.depthMm / 2;
  const side: StairsSide = beyondY >= beyondX ? (local.y >= 0 ? "front" : "back") : local.x >= 0 ? "right" : "left";
  const along = side === "front" || side === "back" ? local.x : local.y;
  return { side, offsetMm: Math.round(along) };
}

// ponytail: self-check. Run: node --experimental-strip-types lib/venues/stairs.ts
if ((import.meta as { main?: boolean }).main) {
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
}
