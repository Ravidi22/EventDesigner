// npm run check:measurements — the self-check of ./measurements.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import { roundOutline } from "@/lib/design-document/stage";
import { asRound, centroid, curveSides, measurements, polygonGap, type DimKind } from "./measurements";

// ponytail: self-check. Run: npm run check:measurements
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];
const room = rect(0, 0, 20000, 12000);
const walls = room.map((p, i) => [p, room[(i + 1) % 4]] as [Point, Point]);
const stage = { id: "stage", kind: "stage" as const, polygon: rect(7000, 500, 6000, 3000) };
const t = (id: string, x: number, y: number) => ({ id, kind: "table" as const, polygon: rect(x - 900, y - 900, 1800, 1800) });
const tables = [t("t1", 4000, 6000), t("t2", 8000, 6000), t("t3", 11000, 6000), t("t4", 4000, 9500), t("t5", 8000, 9500)];
const input = { boundaries: [room], walls, solids: [stage, ...tables], centres: tables.map((x) => centroid(x.polygon)) };
const all = measurements(input, { overall: true, chains: true, sizes: true, ties: true, gaps: true, aisles: true, offsetMm: 900 });
const of = (k: DimKind) => all.dims.filter((d) => d.kind === k);

assert(of("overall").length === 2, "the room is figured on two sides");
assert(of("size").length === 2 && of("size").some((d) => d.mm === 6000) && of("size").some((d) => d.mm === 3000), "a rectangular stage is figured by its width and depth");
const ell = measurements({ ...input, solids: [{ id: "L", kind: "stage", polygon: [{ x: 1000, y: 1000 }, { x: 7000, y: 1000 }, { x: 7000, y: 3000 }, { x: 4000, y: 3000 }, { x: 4000, y: 5000 }, { x: 1000, y: 5000 }] }] }, { sizes: true, offsetMm: 900 });
assert(ell.dims.length === 6, "a shaped stage is figured on every side");
// The stage stands 0.50 off the back wall — no room for a figure there — so its width is figured
// along the front, outside the stage.
const width = of("size").find((d) => d.mm === 6000)!;
assert(width.a.y === 3500 && width.offset.y > 0, "a side's figure sits OUTSIDE the stage, on the side with room for it");
const ties = of("tie");
assert(ties.length === 2, "two ties fix an element");
assert(ties.some((d) => d.mm === 500), "the stage is 0.50 off the back wall");
assert(ties.some((d) => d.mm === 7000), "…and 7.00 off the nearer side wall");
const gap = of("gap")[0];
assert(gap && gap.mm === 1600 && gap.warn === false, "the stage's front is 1.60 from the nearest table");
const aisles = of("aisle");
assert(aisles.some((d) => Math.abs(d.mm - 1200) < 1), "the narrowest gap in the first row is its aisle (11.0−8.0−1.8 = 1.20)");
assert(aisles.some((d) => Math.abs(d.mm - 1700) < 1), "columns get an aisle too (9.5−6.0−1.8 = 1.70)");
assert(aisles.filter((d) => Math.abs(d.mm - 1700) < 1).length === 1, "two columns at the same 1.70 are figured once")
assert(of("chain").length > 0 && all.leaders.length > 0, "the chains come through");

const tight = measurements({ ...input, solids: [stage, t("near", 10000, 4600)] }, { gaps: true, offsetMm: 900 });
assert(tight.dims[0]?.warn === true && Math.abs(tight.dims[0].mm - 200) < 1, "a 0.20 gap under the walkway minimum is flagged");
assert(polygonGap(rect(0, 0, 10, 10), rect(5, 5, 10, 10)).mm === 0, "overlapping solids have no gap");
// A platform carrying a head table and a DJ booth: both measured off the platform, not the room.
const platform = { id: "plat", kind: "stage" as const, polygon: rect(2000, 1000, 8000, 3000) };
const head = t("head", 4000, 2500);
const booth = { id: "booth", kind: "item" as const, polygon: rect(8000, 1500, 1500, 1500) };
const floorT = t("floor", 6000, 9000);
const onStage = measurements(
  { boundaries: [room], walls, solids: [platform, head, booth, floorT], centres: [centroid(head.polygon), centroid(floorT.polygon)] },
  { chains: true, ties: true, gaps: true, offsetMm: 900 },
);
const boothTies = onStage.dims.filter((d) => d.kind === "tie" && d.a.x >= 8000 && d.a.x <= 9500 && d.a.y >= 1500 && d.a.y <= 3000);
assert(boothTies.length === 2 && boothTies.every((d) => d.mm <= 1000), "an item on a stage is tied to the stage's edges (0.50 / 0.50), not the walls");
// The platform's top side is 1.00 off the wall, so a chain there would sit outside the room: it
// takes the platform's open side instead (4000 + 1260).
const stageChain = onStage.dims.filter((d) => d.kind === "chain" && d.a.y === d.b.y && Math.abs(d.a.y - 5260) < 1);
assert(stageChain.length === 2 && stageChain[0].mm === 2000, "a table on a stage is chained from the stage's edge (2.00 in), on the side that is in the room");
assert(!onStage.dims.some((d) => d.kind === "gap" && (d.a.x === head.polygon[0].x || d.b.x === head.polygon[0].x) && d.mm > 3000), "a table on a stage is not gapped against the room");
// Two stages side by side along a wall: the square's tie does not cross the strip to the far wall,
// and the strip's chain does not run through the square.
const strip = { id: "strip", kind: "stage" as const, polygon: rect(16000, 1000, 3000, 10000) };
const square = { id: "square", kind: "stage" as const, polygon: rect(11000, 3000, 5000, 5000) };
const onStrip = [t("s1", 17500, 3000), t("s2", 17500, 6000), t("s3", 17500, 9000)];
const pair = measurements(
  { boundaries: [room], walls, solids: [strip, square, ...onStrip], centres: onStrip.map((x) => centroid(x.polygon)) },
  { chains: true, ties: true, offsetMm: 900 },
);
const squareTies = pair.dims.filter((d) => d.kind === "tie" && d.a.x >= 11000 && d.a.x <= 16000 && d.a.y >= 3000 && d.a.y <= 8000);
assert(squareTies.every((d) => !(d.b.x > 16000)), "a stage's tie stops at the stage beside it");
assert(squareTies.some((d) => d.mm === 11000), "…and measures to the open side instead (11.00 to the left wall)");
const pairSizes = measurements({ boundaries: [room], walls, solids: [strip, square], centres: [] }, { sizes: true, offsetMm: 900 });
const squareSizes = pairSizes.dims.filter((d) => d.a.x >= 11000 && d.a.x <= 16000 && d.b.x >= 11000 && d.b.x <= 16000 && d.a.y >= 3000 && d.b.y <= 8000);
assert(squareSizes.every((d) => !(d.a.x === 16000 && d.b.x === 16000)), "a stage's depth is figured on its open side, not across the stage it touches");
const rowChain = pair.dims.filter((d) => d.kind === "chain" && d.a.x === d.b.x);
assert(rowChain.length > 0 && rowChain.every((d) => d.a.x > 16000), "the strip's row chain runs inside the strip, not through the square");
// A round stage arrives as a 24-gon (placement-map's outlineOf). It is figured by its diameter —
// one figure, not twenty-four sides of 0.39 — even turned, where no vertex sits on its extremes.
const ring = (cx: number, cy: number, rx: number, ry: number, deg = 0, n = 24): Point[] => {
  const k = (deg * Math.PI) / 180;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    return { x: cx + x * Math.cos(k) - y * Math.sin(k), y: cy + x * Math.sin(k) + y * Math.cos(k) };
  });
};
const roundStage = { id: "round", kind: "item" as const, polygon: ring(10000, 4000, 1500, 1500, 7) };
const rs = measurements({ boundaries: [room], walls, solids: [roundStage], centres: [] }, { sizes: true, ties: true, offsetMm: 900 });
const rsSizes = rs.dims.filter((d) => d.kind === "size");
assert(rsSizes.length === 1 && rsSizes[0].diameter === true && Math.abs(rsSizes[0].mm - 3000) < 1, "a round stage is figured by its diameter alone (⌀3.00), not by the sides of its 24-gon");
assert(Math.hypot(rsSizes[0].offset.x, rsSizes[0].offset.y) > 1500, "…drawn outside the stage, not across it");
const rsTies = rs.dims.filter((d) => d.kind === "tie");
assert(rsTies.length === 2 && rsTies.some((d) => Math.abs(d.mm - 2500) < 1), "…and tied from its true rim: 4.00 − 1.50 = 2.50 off the wall, though no vertex is there");
const oval = measurements({ boundaries: [room], walls, solids: [{ id: "oval", kind: "stage", polygon: ring(10000, 6000, 3000, 1500, 0, 48) }], centres: [] }, { sizes: true, offsetMm: 900 });
const ovalMm = oval.dims.map((d) => Math.round(d.mm)).sort((p, q) => p - q);
assert(ovalMm.length === 2 && ovalMm[0] === 3000 && ovalMm[1] === 6000 && !oval.dims.some((d) => d.diameter), "an elliptical stage is figured by its two axes, 6.00 × 3.00");
// A stage's OWN round outline (roundOutline) samples the ellipse half a step off its axes — no
// vertex lies on either — and is still read as the ellipse it is: 4.00 × 2.00 however it is
// turned, with ties from the true rim rather than from whichever vertex is nearest it.
const place = (pts: Point[], cx: number, cy: number, deg: number): Point[] => {
  const k = (deg * Math.PI) / 180;
  return pts.map((q) => ({ x: cx + q.x * Math.cos(k) - q.y * Math.sin(k), y: cy + q.x * Math.sin(k) + q.y * Math.cos(k) }));
};
const ovalStage = (w: number, d: number, deg: number) =>
  measurements({ boundaries: [room], walls, solids: [{ id: "ov", kind: "stage", polygon: place(roundOutline(w, d).outline, 6000, 4000, deg) }], centres: [] }, { sizes: true, ties: true, offsetMm: 900 });
const close = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;
for (const [w, d, deg] of [[4000, 2000, 0], [4000, 2000, 30], [6000, 3000, 45]] as const) {
  const o = ovalStage(w, d, deg);
  const sizes = o.dims.filter((x) => x.kind === "size").map((x) => x.mm).sort((p, q) => p - q);
  assert(sizes.length === 2 && close(sizes[0], d) && close(sizes[1], w) && !o.dims.some((x) => x.diameter), `a ${w / 1000}×${d / 1000} oval stage turned ${deg}° is figured by its two axes (got ${sizes.map((s) => (s / 1000).toFixed(3)).join(" × ")})`);
}
const flatTies = ovalStage(4000, 2000, 0).dims.filter((x) => x.kind === "tie");
assert(flatTies.length === 2 && flatTies.some((x) => close(x.mm, 4000)) && flatTies.some((x) => close(x.mm, 3000)), "…and tied from its rim: 6.00 − 2.00 and 4.00 − 1.00 off the walls, though no vertex is on the axis");
// Turned 30°, the rim reaches √(a²cos²30° + b²sin²30°) = 1.803 across and 1.323 along.
const tiltedTies = ovalStage(4000, 2000, 30).dims.filter((x) => x.kind === "tie");
assert(tiltedTies.some((x) => close(x.mm, 6000 - 1802.8)) && tiltedTies.some((x) => close(x.mm, 4000 - 1322.9)), "…and turned, from where the curve really reaches (4.20 / 2.68)");
// A D (half-round) stage: its straight side, and its depth — none of the arc's sampled sides.
const arc = Array.from({ length: 13 }, (_, i) => ({ x: 10000 + 2000 * Math.cos(Math.PI - (i / 12) * Math.PI), y: 6000 - 2000 * Math.sin((i / 12) * Math.PI) }));
const dStage = measurements({ boundaries: [room], walls, solids: [{ id: "D", kind: "stage", polygon: arc }] , centres: [] }, { sizes: true, offsetMm: 900 });
const dMm = dStage.dims.map((d) => Math.round(d.mm)).sort((p, q) => p - q);
assert(dMm.length === 2 && dMm[0] === 2000 && dMm[1] === 4000, `a D stage is its 4.00 chord and its 2.00 depth, not its arc's sides (${dMm.join(", ")})`);
assert(curveSides(ring(0, 0, 1000, 1000)).every(Boolean) && !curveSides(rect(0, 0, 4000, 2000)).some(Boolean), "a sampled circle is all curve; a rectangle none");
const octagon = Array.from({ length: 8 }, (_, i) => ({ x: 3000 * Math.cos((i / 8) * Math.PI * 2), y: 3000 * Math.sin((i / 8) * Math.PI * 2) }));
assert(asRound(octagon) === null && !curveSides(octagon).some(Boolean), "an octagonal stage is built side by side, and keeps a figure per side");
// Gaps to a round table run to its true rim.
const roundTable = { id: "rt", kind: "table" as const, polygon: ring(10000, 9000, 900, 900, 7) };
const block = { id: "bar", kind: "item" as const, polygon: rect(8000, 5000, 4000, 2000) };
const rg = measurements({ boundaries: [room], walls, solids: [block, roundTable], centres: [] }, { gaps: true, offsetMm: 900 });
assert(rg.dims.length === 1 && Math.abs(rg.dims[0].mm - 1100) < 1, "the gap to a round table is to its rim (9.00 − 0.90 − 7.00 = 1.10)");
// Ceiling: a chandelier centred over t1 has its two wall ties and no offset; one hung 0.40 off
// t2's centre has the offset too; and no figure is drawn for a sheet that does not ask.
const hungInput = {
  ...input,
  hung: [
    { id: "c1", at: { x: 4000, y: 6000 }, over: { x: 4000, y: 6000 } },
    { id: "c2", at: { x: 8400, y: 6000 }, over: { x: 8000, y: 6000 } },
    { id: "c3", at: { x: 15000, y: 10000 } },
  ],
};
const ceiling = measurements(hungInput, { hangs: true, offsetMm: 900 });
const tiesFrom = (p: Point) => ceiling.dims.filter((d) => d.kind === "tie" && d.a.x === p.x && d.a.y === p.y);
const c1 = tiesFrom({ x: 4000, y: 6000 });
assert(c1.length === 2 && c1.some((d) => d.mm === 4000) && c1.some((d) => d.mm === 6000), "a hung item is tied to the walls from its hang point (4.00 / 6.00)");
const c3 = tiesFrom({ x: 15000, y: 10000 });
assert(c3.some((d) => d.mm === 5000) && c3.some((d) => d.mm === 2000), "…to the nearer wall of each pair (5.00 right, 2.00 down)");
const offsets = ceiling.dims.filter((d) => d.kind === "offset");
assert(offsets.length === 1 && Math.abs(offsets[0].mm - 400) < 1, "one hung 0.40 off its table's centre says so; one dead centre says nothing");
assert(measurements(hungInput, { offsetMm: 900 }).dims.length === 0, "the hang figures are drawn only on a sheet that asks for them");
const twice = measurements({ ...hungInput, hung: [...hungInput.hung!, { ...hungInput.hung![0], id: "copy" }] }, { hangs: true, offsetMm: 900 });
assert(twice.dims.filter((d) => d.kind === "tie").length === ceiling.dims.filter((d) => d.kind === "tie").length, "two items hung from one point share their ties — each figure once");

// The venue's own flight of steps: measured TO — a table 0.80 from its foot is flagged — but
// never sized or tied, and a second flight beside it is not measured to it.
const steps = { id: "steps", kind: "fixed" as const, polygon: rect(15000, 10500, 3000, 600) };
const steps2 = { id: "steps2", kind: "fixed" as const, polygon: rect(15000, 11300, 3000, 600) };
const lobby = measurements(
  { boundaries: [room], walls, solids: [steps, steps2, t("by", 16500, 8800)], centres: [] },
  { sizes: true, ties: true, gaps: true, offsetMm: 900 },
);
assert(!lobby.dims.some((d) => d.kind === "size" || d.kind === "tie"), "the building's stairs are never sized or tied");
const toTable = lobby.dims.filter((d) => d.kind === "gap");
assert(toTable.length === 2 && toTable.every((d) => d.warn && Math.abs(d.mm - 800) < 1 || Math.abs(d.mm - 1600) < 1), "the gap from each flight to the table is measured, and 0.80 is flagged");
assert(!toTable.some((d) => Math.abs(d.mm - 200) < 1), "…but not the 0.20 between the two flights");
console.log("measurements self-check passed");
