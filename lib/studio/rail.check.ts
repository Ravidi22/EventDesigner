// npm run check:rail — the self-check of ./rail.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import type { Placement } from "@/lib/design-document/types";
import type { Product } from "@/lib/catalog/types";
import { type VenueStructure } from "@/lib/venues/structure";
import { pointInPolygon } from "@/lib/venues/faces";
import { wallTrack } from "./anchor";
import { polygonAreaMm2 } from "./geometry";
import { canopyRuns, curtainDrop, defaultRailHeight, featureHost, footprintHost, hostSides, hostsSide, isRailed, isRodRow, nearestBareRod, nearestHostSide, nearestSideRail, offsetPath, railBand, railLengthMm, railLines, railMidpoint, railMoved, railNamesVenue, railOf, resolveRail, ROD_CATEGORY, ROD_HEIGHT_MM, ROD_MIN_MM, ROD_THICK_MAX_MM, ROD_THICK_MM, rodDropLength, rodPostMm, rodRunMm, rodThickMm, rodWithLength, rodWithThick, sideCandidates, sketchRailContext, withRail, type CanopyRail, type RailContext, type ResolvedRail, type RodRail, type RunRail } from "./rail";

// ponytail: self-check. Run: npm run check:rail
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const asLines = (r: ResolvedRail | null, m: string) => {
  if (r?.type !== "lines") throw new Error("FAIL: no lines — " + m);
  return r;
};
const asSheet = (r: ResolvedRail | null, m: string) => {
  if (r?.type !== "sheet") throw new Error("FAIL: no sheet — " + m);
  return r;
};

// A 10 m wall along x, a bowed 6 m wall, a 4 × 3 m building (3.5 m high) and a 40 cm stage.
const structure: VenueStructure = {
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
  features: [
    { id: "b", kind: "structure", label: "מבנה", x: 3000, y: 3000, widthMm: 4000, depthMm: 3000, heightMm: 3500, shape: "rect", rotationDeg: 0 },
    { id: "low", kind: "stage", label: "במה", x: 7000, y: 3000, widthMm: 2000, depthMm: 1000, heightMm: 400, shape: "rect", rotationDeg: 0 },
    { id: "round", kind: "other", label: "פרגולה עגולה", x: 3000, y: 8000, widthMm: 4000, depthMm: 4000, heightMm: 2800, shape: "circle", rotationDeg: 0 },
  ],
};
const ctx: RailContext = { structure };

// WALL — the span it always was.
const wall = asLines(resolveRail({ type: "wall", wallId: "w", from: 0.2, to: 0.5 }, ctx), "wall");
assert(wall?.type === "lines" && near(wall.lengthMm, 3000) && wall.lines[0].hang === 0 && wall.lines[0].topMm === undefined, "a wall rail is its span — 3 m, on the wall's line, the ceiling to say its top");
assert(near(wall.lines[0].path[0].x, 2000) && near(wall.lines[0].path[1].x, 5000), "…from 2 m to 5 m along");
const sided = resolveRail({ type: "wall", wallId: "w", from: 0, to: 1, side: -1 }, ctx);
assert(sided?.type === "lines" && sided.lines[0].hang === -1, "a venue curtain's side rides on the wall rail");
// An LED strip's height on a wall (spec §7.1): 0 is the floor line — a top of 0, not "the ceiling".
const skirting = resolveRail({ type: "wall", wallId: "w", from: 0, to: 1, side: 1, heightMm: 0 }, ctx);
const raised = resolveRail({ type: "wall", wallId: "w", from: 0, to: 1, side: 1, heightMm: 1200 }, ctx);
assert(skirting?.type === "lines" && skirting.lines[0].topMm === 0 && raised?.type === "lines" && raised.lines[0].topMm === 1200, "a strip's wall height is its line's top — 0 the floor line, 1.2 m where it was typed");
const bowTrack = wallTrack(structure, "bow")!;
const bowLen = railLengthMm({ type: "wall", wallId: "bow", from: 0, to: 1 }, ctx);
assert(bowLen !== undefined && near(bowLen, bowTrack.lengthMm) && bowLen > 6000 + 100, `on a bowed wall the length is the ARC, not the 6 m chord (${Math.round(bowLen ?? 0)})`);
assert(resolveRail({ type: "wall", wallId: "gone", from: 0, to: 1 }, ctx) === null, "a dangling wall is null");
const legacy = { span: { wallId: "w", from: 0, to: 1 } };
assert(railOf(legacy)?.type === "wall" && railOf(legacy) === railOf(legacy), "a legacy span reads as a wall rail, the same object each time");
assert(railOf({}) === null && !isRailed({}) && isRailed(legacy), "no span, no rail");
const moved = withRail({ span: { wallId: "w", from: 0, to: 1 } } as Pick<Placement, "rail" | "span">, { type: "wall", wallId: "w", from: 0, to: 0.5 });
assert(!("span" in moved) && moved.rail?.type === "wall", "writing a rail lets the legacy span go");

// SIDE — the building's top side (edge 0, −y), hung outside it, from its 3.5 m down.
const top = asLines(resolveRail({ type: "side", featureId: "b", side: 0, from: 0, to: 1, out: 1 }, ctx), "side");
assert(top?.type === "lines" && near(top.lengthMm, 4000) && top.lines[0].topMm === 3500, "a side rail runs the whole side, 4 m, from the thing's height");
const tl = top.lines[0];
const outward = { x: -(tl.path[1].y - tl.path[0].y), y: tl.path[1].x - tl.path[0].x };
assert(tl.hang * outward.y < 0, "…its cloth hangs OUT of the building (−y, away from it)");
const inner = resolveRail({ type: "side", featureId: "b", side: 0, from: 0, to: 1, out: -1 }, ctx);
assert(inner?.type === "lines" && inner.lines[0].hang === -tl.hang, "…and out: −1 hangs it inside");
const part = railLengthMm({ type: "side", featureId: "b", side: 1, from: 0.25, to: 0.75, out: 1 }, ctx);
assert(part !== undefined && near(part, 1500), "a stretch of the 3 m right side is half of it");
const rim = resolveRail({ type: "side", featureId: "round", side: 0, from: 0, to: 1, out: 1 }, ctx);
assert(rim?.type === "lines" && near(rim.lengthMm, Math.PI * 4000, 40) && rim.lines[0].path.length > 16, `a round thing is ONE side, followed round its rim (${Math.round(rim?.type === "lines" ? rim.lengthMm : 0)})`);
assert(hostSides(featureHost(structure.features[2])!).length === 1 && hostSides(featureHost(structure.features[0])!).length === 4, "a circle has one side, a rectangle four");
// A rectangle rounded at its corners: each straight run and each arc is a side of its own — the
// front is not wrapped round the building.
const rounded = footprintHost(
  {
    kind: "custom",
    outline: [{ x: -1500, y: -1000 }, { x: 1500, y: -1000 }, { x: 2000, y: -500 }, { x: 2000, y: 500 }, { x: 1500, y: 1000 }, { x: -1500, y: 1000 }, { x: -2000, y: 500 }, { x: -2000, y: -500 }],
    edgeCurves: [null, { c1: { x: 276, y: 0 }, c2: { x: 0, y: -276 } }, null, { c1: { x: 0, y: 276 }, c2: { x: 276, y: 0 } }, null, { c1: { x: -276, y: 0 }, c2: { x: 0, y: 276 } }, null, { c1: { x: 0, y: -276 }, c2: { x: -276, y: 0 } }],
  },
  { x: 0, y: 0 },
  0,
  3000,
)!;
const roundedSides = hostSides(rounded);
assert(roundedSides.length === 8 && near(roundedSides[0].L, 3000) && roundedSides[1].curved, `a rounded rectangle is eight sides — four runs, four arcs (got ${roundedSides.length})`);
assert(resolveRail({ type: "side", featureId: "nobody", side: 0, from: 0, to: 1, out: 1 }, ctx) === null, "a dangling thing is null");
assert(resolveRail({ type: "side", featureId: "b", side: 9, from: 0, to: 1, out: 1 }, ctx) === null, "…and so is a side it does not have");
assert(hostsSide(featureHost(structure.features[0])) && !hostsSide(featureHost(structure.features[1])), "a 3.5 m building offers its sides, a 40 cm stage does not");
const hit = nearestHostSide(featureHost(structure.features[0])!, { x: 3000, y: 1300 })!;
assert(hit.side.edge === 0 && near(hit.t, 0.5, 0.01) && hit.out === 1 && near(hit.distanceMm, 200), "a click 20 cm above the building's top side finds it, outside, at its middle");
assert(nearestHostSide(featureHost(structure.features[0])!, { x: 3000, y: 1700 })!.out === -1, "…a click just inside it is inside");
const offered = sideCandidates(structure.features);
assert(offered.map((c) => c.id).join(",") === "b,round", "the building and the tall round thing offer their sides; the 40 cm stage does not");
const dropped = nearestSideRail(offered, { x: 5300, y: 3000 })!;
assert(dropped.rail.featureId === "b" && dropped.rail.side === 1 && dropped.rail.out === 1 && dropped.rail.from === 0 && dropped.rail.to === 1 && near(dropped.distanceMm, 300), "a curtain dropped beside the building's right side hangs the whole of it, outside");
// A sketch item resolves through the caller's lookup — the document first.
const stagePl: Placement = { id: "st", variantId: "v", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 90, scale: 1, stage: { outline: [{ x: -2000, y: -1000 }, { x: 2000, y: -1000 }, { x: 2000, y: 1000 }, { x: -2000, y: 1000 }], front: 0, decks: [], heightMm: 1200 } };
const sketchCtx = sketchRailContext({ placements: [stagePl] }, structure, structure, () => undefined);
const onStage = asLines(resolveRail({ type: "side", featureId: "st", side: 0, from: 0, to: 1, out: 1 }, sketchCtx), "sketch side");
assert(onStage?.type === "lines" && near(onStage.lengthMm, 4000) && onStage.lines[0].topMm === 1200, "a side rail on a sketch stage reads its outline, turned, at its height");
assert(near(onStage.lines[0].path[0].x, 1000) && near(onStage.lines[0].path[0].y, -2000), "…turned with the stage (its front edge now stands at x = +1 m)");
assert(resolveRail({ type: "side", featureId: "b", side: 0, from: 0, to: 1, out: 1 }, sketchCtx)?.type === "lines", "…and a venue feature through the same lookup");

// A PERGOLA (lib/venues/pergola.ts, 2026-11-07) offers its sides — the venue's own, and a hired one
// in a sketch at the size it was laid to — each from its own height.
const pergolaVenue: VenueStructure = {
  ...structure,
  features: [{ id: "pg", kind: "pergola", label: "פרגולה", x: 20000, y: 3000, widthMm: 4000, depthMm: 3000, heightMm: 2600, shape: "rect", rotationDeg: 0, pergola: { postMm: 150, roof: "slats" } }],
};
assert(sideCandidates(pergolaVenue.features).map((c) => c.id).join(",") === "pg", "a venue's pergola offers its sides");
const onPergola = asLines(resolveRail({ type: "side", featureId: "pg", side: 2, from: 0, to: 1, out: 1 }, { structure: pergolaVenue }), "pergola side");
assert(near(onPergola.lengthMm, 4000) && onPergola.lines[0].topMm === 2600, "…a curtain on its front runs its 4 m from its 2.6 m top");
const hiredRow: Product = { id: "hp", name: "פרגולה 4×4", category: "pergolas", layer: "floor", dimensions: { widthMm: 4000, depthMm: 4000, heightMm: 2800 }, categoryFields: {}, styleTags: [], variants: [] };
const hiredPl: Placement = { id: "hpl", variantId: "hp", layer: "floor", quantity: 1, position: { x: 0, y: 12000 }, rotation: 0, scale: 1, sizeMm: { widthMm: 6000, depthMm: 3000 } };
const hiredOf = (v: string) => (v === "hp" ? hiredRow : undefined);
assert(sideCandidates([], { placements: [hiredPl] }, hiredOf).map((c) => c.id).join(",") === "hpl", "a hired pergola in a sketch offers its sides");
const onHired = asLines(resolveRail({ type: "side", featureId: "hpl", side: 0, from: 0, to: 1, out: 1 }, sketchRailContext({ placements: [hiredPl] }, structure, structure, hiredOf)), "hired pergola side");
assert(near(onHired.lengthMm, 6000) && onHired.lines[0].topMm === 2800, "…laid 6 × 3, a curtain on its long side runs 6 m from its row's 2.8 m");

// ROD — a ר: a 3 m run, a bend, and a 4 m arm with no post under its end (held to 3 m).
const rod: RodRail = { type: "rod", points: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 4000 }], heightMm: 2400, cantilever: "end" };
const rr = asLines(resolveRail(rod, ctx), "rod");
assert(rr?.type === "lines" && near(rr.lengthMm, 6000) && rr.lines[0].topMm === 2400, "a rod's length is its polyline — the cantilevered arm held to 3 m");
assert(rr.lines[0].posts?.length === 2 && rr.lines[0].hang === 0, "a post at the start and the bend, none under the arm's end; the cloth on the rod's line");
assert(railLengthMm({ ...rod, cantilever: undefined }, ctx) === 7000 && resolveRail({ ...rod, cantilever: undefined }, ctx)?.type === "lines", "without the ר it is the whole polyline, a post at every point");
assert(resolveRail({ type: "rod", points: [{ x: 0, y: 0 }], heightMm: 2400 }, ctx) === null, "a rod of one point is no rod");
// The rod's own measurements (2026-11-13: "the rod width and length should be editable").
assert(rodThickMm(rod) === ROD_THICK_MM && rodPostMm(rod) === 50 && rodWithThick(rod, 30).thickMm === undefined, "a rod with no thickness is the 3 cm rod on 5 cm posts it always was — and the default is never stored");
const heavy = rodWithThick(rod, 80);
assert(heavy.thickMm === 80 && rodThickMm(heavy) === 80 && rodPostMm(heavy) === 100 && rodWithThick(heavy, 5000).thickMm === ROD_THICK_MAX_MM, "a typed thickness is kept, its posts grow with it, and it is held to what a rod can be");
const straight: RodRail = { type: "rod", points: [{ x: 1000, y: 500 }, { x: 4000, y: 500 }], heightMm: 2400 };
const longer = rodWithLength(straight, 4500);
assert(rodRunMm(straight) === 3000 && longer.points[0].x === 1000 && longer.points[1].x === 5500 && longer.points[1].y === 500, "a straight rod typed 4.5 m keeps its first post and reaches 4.5 m along itself");
const bent = rodWithLength({ ...rod, cantilever: undefined }, 5000);
assert(bent.points[1].x === 3000 && bent.points[2].y === 2000 && rodRunMm(bent) === 5000, "an L typed 5 m keeps its first arm and its corner — the last arm is what changes");
assert(rodWithLength({ ...rod, cantilever: undefined }, 1000).points[2].y === ROD_MIN_MM, "…never to less than the shortest arm there is");
// A bare rod, and where a dropped curtain goes.
const rodRow = (v: string) => v === "rod-row";
const rodPlan = [
  { id: "bare", variantId: "rod-row", rail: straight },
  { id: "dressed", variantId: "curtain", rail: { ...straight, points: [{ x: 1000, y: 3000 }, { x: 4000, y: 3000 }] } as RodRail },
];
assert(nearestBareRod(rodPlan, rodRow, { x: 2000, y: 900 })?.id === "bare" && near(nearestBareRod(rodPlan, rodRow, { x: 2000, y: 900 })!.distanceMm, 400), "the nearest bare rod is found by its line");
assert(nearestBareRod(rodPlan, rodRow, { x: 2000, y: 2900 })?.id === "bare", "…and a curtain's own rod is not one, however near the point is to it");
const anyRail = () => true;
const dropAt = (o: Partial<Parameters<typeof curtainDrop>[0]>) => curtainDrop({ p: { x: 0, y: 0 }, wall: null, side: null, rod: null, takes: anyRail, rodHeightMm: 2400, ...o });
const adopted = dropAt({ rod: { id: "bare", distanceMm: 400 }, wall: { wallId: "w", distanceMm: 900 } });
assert(adopted?.kind === "adopt" && adopted.placementId === "bare", "a curtain let go on a bare rod is hung on it, though a wall is not far");
const toWall = dropAt({ rod: { id: "bare", distanceMm: 400 }, wall: { wallId: "w", distanceMm: 100 } });
assert(toWall?.kind === "rail" && toWall.rail.type === "wall", "…but at the wall itself it goes on the wall");
const inOpen = dropAt({ wall: { wallId: "w", distanceMm: 9000 }, rod: { id: "bare", distanceMm: 5000 }, p: { x: 7000, y: 7000 } });
assert(inOpen?.kind === "rail" && inOpen.rail.type === "rod" && inOpen.rail.points[0].x === 5500 && inOpen.rail.points[1].x === 8500 && inOpen.rail.heightMm === 2400, "let go in the open — nine metres from a wall — it stands on a 3 m rod of its own, where it was dropped");
const noRod = dropAt({ wall: { wallId: "w", distanceMm: 9000 }, takes: (t) => t !== "rod" });
assert(noRod?.kind === "rail" && noRod.rail.type === "wall" && dropAt({ takes: (t) => t !== "rod" }) === null, "a category that takes no rod still goes to its wall — and with no wall, nowhere");
assert(rodDropLength(undefined) === 3000 && rodDropLength(1000) === 3000 && rodDropLength(4500) === 4500 && rodDropLength(100) === ROD_MIN_MM, "a rod is laid as long as its row says — 3 m while the row still carries the first kit's placeholder");
assert(isRodRow({ category: ROD_CATEGORY }) && !isRodRow({ category: "curtains" }) && !isRodRow(undefined), "a rod row is told by its category");
assert(defaultRailHeight({ x: 0, y: 0 }) === ROD_HEIGHT_MM &&defaultRailHeight({ x: 0, y: 0 }, () => 3200) === 3200, "a new rod is 2.4 m, unless a roof is there to say");

// RUN — one line in the air.
const run = resolveRail({ type: "run", a: { x: 0, y: 0 }, b: { x: 3000, y: 4000 }, heightMm: 3500, sagMm: 300 }, ctx);
assert(run?.type === "lines" && near(run.lengthMm, 5000) && run.lines[0].sagMm === 300, "a run is its two points, at its height, sagging");
// A ceiling drape's own fields (spec §6.4 — ./ceiling-cloth.ts reads them): optional, the line the same.
const drapeRun: RunRail = { type: "run", a: { x: 0, y: 0 }, b: { x: 3000, y: 4000 }, heightMm: 3500, widthMm: 900, waves: 3 };
const draped = resolveRail(drapeRun, ctx);
assert(draped?.type === "lines" && near(draped.lengthMm, 5000), "a drape's width and scallops leave its line as it was — billed by its length");
const pastedRun = railMoved(drapeRun, 100, 0) as RunRail;
assert(pastedRun.widthMm === 900 && pastedRun.waves === 3 && pastedRun.a.x === 100, "…and travel with it when it is pasted");
const wideCanopy: CanopyRail = { type: "canopy", outline: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }], heightMm: 3500, directionDeg: 0, spacingMm: 1000, widthMm: 1000, waves: 2 };
assert(railLengthMm(wideCanopy, ctx) === 24000 && (railMoved(wideCanopy, 0, 50) as CanopyRail).waves === 2, "a canopy's width and scallops change none of its runs");

// CANOPY — a 6 × 4 m area of runs 1 m apart along x: four runs of 6 m that tile it.
const rect: Point[] = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }];
const cover = (outline: Point[], directionDeg: number, spacingMm: number) => {
  const c: CanopyRail = { type: "canopy", outline, heightMm: 3500, directionDeg, spacingMm };
  const runs = canopyRuns(c);
  const span = (() => {
    const th = (directionDeg * Math.PI) / 180;
    const across = outline.map((p) => -p.x * Math.sin(th) + p.y * Math.cos(th));
    return Math.max(...across) - Math.min(...across);
  })();
  const step = span / Math.max(1, Math.round(span / spacingMm));
  const covered = runs.reduce((n, r) => n + Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y), 0) * step;
  return { runs, covered, area: Math.abs(polygonAreaMm2(outline)), step, lengthMm: railLengthMm(c, ctx) };
};
const flat = cover(rect, 0, 1000);
assert(flat.runs.length === 4 && flat.runs.every((r) => near(Math.abs(r.b.x - r.a.x), 6000)) && near(flat.covered, flat.area), "a 6 × 4 canopy at 1 m is four 6 m runs that cover it exactly");
assert(flat.lengthMm !== undefined && near(flat.lengthMm, 24000), "…billed as 24 m of cloth");
const tri: Point[] = [{ x: 0, y: 0 }, { x: 8000, y: 0 }, { x: 0, y: 6000 }];
const slanted = cover(tri, 30, 700);
assert(Math.abs(slanted.covered - slanted.area) / slanted.area < 0.02, `a triangle cut at 30° is covered by its runs to within 2% (${Math.round(slanted.covered)} vs ${Math.round(slanted.area)})`);
// Every point inside is within half a strip of some run.
const within = (q: Point) =>
  slanted.runs.some((r) => {
    const dx = r.b.x - r.a.x;
    const dy = r.b.y - r.a.y;
    const l2 = dx * dx + dy * dy;
    const f = Math.max(0, Math.min(1, ((q.x - r.a.x) * dx + (q.y - r.a.y) * dy) / l2));
    return Math.hypot(q.x - (r.a.x + dx * f), q.y - (r.a.y + dy * f)) <= slanted.step / 2 + 400;
  });
let inside = 0;
for (let x = 100; x < 8000; x += 400) for (let y = 100; y < 6000; y += 400) if (pointInPolygon({ x, y }, tri)) {
  inside++;
  assert(within({ x, y }), `a point inside the canopy (${x}, ${y}) is under a run`);
}
assert(inside > 50, "…sampled over the whole area");
const ell: Point[] = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 6000 }, { x: 0, y: 6000 }];
const lShape = cover(ell, 90, 1000);
assert(near(lShape.covered, lShape.area, 1) && lShape.runs.length === 6 && lShape.runs.filter((r) => near(Math.abs(r.b.y - r.a.y), 2000)).length === 4, "an L is cut into runs across both its arms — the long ones and the short ones — covering it");

// SAIL — tied to a wall, a building's corner, and a post.
const sail = asSheet(resolveRail(
  {
    type: "sail",
    ties: [
      { p: { x: 0, y: 0 }, heightMm: 3000, to: { kind: "wall", wallId: "w", t: 0.5 } },
      { p: { x: 0, y: 0 }, heightMm: 3500, to: { kind: "feature", featureId: "b", corner: 1 } },
      { p: { x: 9000, y: 3000 }, heightMm: 2600, to: { kind: "post" } },
    ],
  },
  ctx,
), "sail");
assert(sail?.type === "sheet" && near(sail.sheet.polygon[0].x, 5000) && near(sail.sheet.polygon[1].x, 5000) && near(sail.sheet.polygon[1].y, 1500), "a sail's corners: on the wall at its middle, on the building's top-right corner, on its post");
assert(sail.sheet.posts.length === 1 && sail.sheet.heights[2] === 2600 && sail.sheet.areaMm2 > 0 && sail.sheet.sagMm > 0, "…with one post of its own, each corner at its height, an area and a sag");
assert(resolveRail({ type: "sail", ties: [{ p: { x: 0, y: 0 }, heightMm: 3000, to: { kind: "wall", wallId: "gone", t: 0 } }, { p: { x: 1, y: 0 }, heightMm: 3000 }, { p: { x: 0, y: 1 }, heightMm: 3000 }] }, ctx) === null, "a sail tied to a wall that is gone is null");
assert(railLines({ type: "sail", ties: [] }, ctx).length === 0 && railLengthMm({ type: "sail", ties: [] }, ctx) === undefined, "a sail has no lines and no length");

// Drawing: a band is on its hang side, the same as the wall's own band on a wall.
const band = railBand(top.lines[0], 220);
assert(band.length === 4 && band.every((q) => q.y <= 1500 + 1e-6), "a side band lies outside the building's top side");
const wallBand = railBand(wall.lines[0], 220);
assert(near(wallBand[0].y, -110) && near(wallBand[wallBand.length - 1].y, 110), "a sketch drape's band straddles the wall's line, as before");
assert(near(railMidpoint(wall.lines[0]).x, 3500) && near(railMidpoint(rr.lines[0]).x, 3000), "a rail's middle is half way along it");
assert(offsetPath([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }], 100)[1].x === 900, "an offset rod corner is mitred");

// What a sketch drawn in another room leaves behind.
const ids = new Set(["st"]);
assert(railNamesVenue({ type: "wall", wallId: "w", from: 0, to: 1 }, ids) && railNamesVenue({ type: "side", featureId: "b", side: 0, from: 0, to: 1, out: 1 }, ids), "a wall rail and a rail on the venue's feature name the venue");
assert(!railNamesVenue({ type: "side", featureId: "st", side: 0, from: 0, to: 1, out: 1 }, ids) && !railNamesVenue(rod, ids), "a rail on a hired stage, and a rod, do not");
const shifted = railMoved(rod, 100, 50) as RodRail;
assert(shifted.points[0].x === 100 && shifted.points[2].y === 4050 && railMoved({ type: "wall", wallId: "w", from: 0, to: 1 }, 5, 5).type === "wall", "a rod moves with a paste; a wall rail stays on its wall");
console.log("rail self-check passed");
