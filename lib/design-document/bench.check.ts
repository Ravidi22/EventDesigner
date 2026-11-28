// npm run check:bench — the self-check of ./bench.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { BenchSpec, Placement, Point, StageStair } from "./types";
import { CHAIR_OFFSET_MM, CHAIR_W_MM } from "../studio/seating";
import { type Footprint } from "../studio/footprint";
import { BACKREST_THICK_MM, BENCH_DEPTH_MM, BENCH_TABLE_DEPTH_MM, BENCH_TOP_MM, benchDefaultDepth, benchIsNumbered, benchLayout, benchLayoutFor, benchSideRows, benchSpecOf, CHAIR_TABLE_MM, patchBenchSide, SEAT_WIDTH_MM, SOFA_BACK_MM, SOFA_DEFAULT_RUN_MM, SOFA_SEAT_MM, sofaFacingTable, standaloneBench, standaloneBenchSeats, type BenchLookup } from "./bench";

// ponytail: self-check. Run: npm run check:bench
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

// ── Defaults: chairs along the back, nothing along the front — the banquette every stage had.
const plain = benchLayout(6000, BENCH_DEPTH_MM);
assert(plain.back.kind === "chairs" && plain.front.kind === "none", "a banquette nobody configured has chairs at its back and nothing at its front");
assert(plain.seats === 10 && plain.chairSeats === 10 && plain.sofaSeats === 0, "…one chair per 60cm of a 6m run");
assert(plain.chairs.length === 10 && plain.cushions.length === 0, "…drawn as ten chairs and no cushions");
assert(plain.chairs.every((c) => c.y === -(BENCH_DEPTH_MM / 2 + CHAIR_OFFSET_MM) && c.facingDeg === 90), "…standing behind the back side, tucked in, facing the strip");
assert(plain.heightMm === BENCH_TOP_MM && plain.sofaHeightMm === SOFA_SEAT_MM, "…its top at table height, a sofa seat at 46cm");
const xs = plain.chairs.map((c) => c.x);
assert(Math.abs(xs[0] + xs[xs.length - 1]) < 1e-6 && Math.abs(xs[1] - xs[0] - 600) < 1e-6, "…spread evenly along it, symmetric about its middle");

// ── A set count, and a cap at what fits.
assert(benchLayout(6000, 450, { back: { kind: "chairs", seats: 3 } }).chairs.length === 3, "a typed count is what is drawn");
assert(benchLayout(6000, 450, { back: { kind: "chairs", seats: 99 } }).seats === Math.floor(6000 / CHAIR_W_MM), "…never more than fit shoulder to shoulder");
assert(benchLayout(6000, 450, { back: { kind: "chairs", seats: 0 } }).seats === 0, "…and zero is zero");
assert(benchLayout(6000, 450, { back: { kind: "none" } }).seats === 0, "a bare back seats nobody");

// ── A sofa side: seats, no chairs; cushions on its half, a backrest toward the other half.
const sofa = benchLayout(3000, 600, { back: { kind: "sofa" } });
assert(sofa.seats === 5 && sofa.sofaSeats === 5 && sofa.chairSeats === 0, "a 3m sofa seats five, and packs no chairs");
assert(sofa.chairs.length === 0 && sofa.cushions.length === 5 && sofa.backs.length === 1, "…drawn as five cushions and one backrest");
assert(sofa.cushions.every((q) => q.every((p) => p.y <= 0 && p.y >= -300)), "…the cushions on the back half of the strip");
assert(sofa.cushions.every((q) => Math.min(...q.map((p) => p.y)) === -300 && Math.max(...q.map((p) => p.y)) === -SOFA_BACK_MM), "…from the back edge to the backrest band");
assert(sofa.backs[0][0].y === -SOFA_BACK_MM && sofa.backs[0][1].y === -SOFA_BACK_MM, "…the backrest line toward the strip's other half");
const shallow = benchLayout(3000, 300, { front: { kind: "sofa" } });
assert(shallow.cushions.every((q) => Math.max(...q.map((p) => p.y)) === 150 && Math.min(...q.map((p) => p.y)) === 50), "a shallow strip thins the backrest so a cushion still shows");

// ── Both sides, independently.
const both = benchLayout(4800, 600, { back: { kind: "chairs", seats: 6 }, front: { kind: "sofa", seats: 4 } });
assert(both.seats === 10 && both.chairSeats === 6 && both.sofaSeats === 4, "chairs at the back and a sofa at the front add up");
assert(both.chairs.length === 6 && both.chairs.every((c) => c.y < 0), "…the chairs behind the back");
assert(both.cushions.length === 4 && both.cushions.every((q) => q.every((p) => p.y >= 0)), "…the cushions on the front half");
const frontChairs = benchLayout(2400, 450, { front: { kind: "chairs" }, back: { kind: "none" } });
assert(frontChairs.chairs.length === 4 && frontChairs.chairs.every((c) => c.y === 225 + CHAIR_OFFSET_MM && c.facingDeg === -90), "chairs at the front stand in front of it, facing back at it");
const twoSofas = benchLayout(3000, 600, { back: { kind: "sofa" }, front: { kind: "sofa" } });
assert(twoSofas.seats === 10 && twoSofas.backs.length === 2, "a sofa both ways seats both ways");

// ── Heights are the designer's when typed.
const tall = benchLayout(3000, 450, { heightMm: 900, sofaHeightMm: 400 });
assert(tall.heightMm === 900 && tall.sofaHeightMm === 400, "typed heights are read back");
assert(benchLayout(3000, 450, { heightMm: 0 }).heightMm === BENCH_TOP_MM, "…a zero height falls back to the default");

// ── The legacy stage edge item reads as the back side.
const legacy = benchSpecOf({ seats: 4, heightMm: 500, depthMm: 500 });
assert(legacy.back?.kind === "chairs" && legacy.back.seats === 4 && legacy.heightMm === 500 && legacy.depthMm === 500, "an old edge item's seats, height and depth are its back side's");
const newer = benchSpecOf({ seats: 4, bench: { back: { kind: "sofa" }, front: { kind: "chairs", seats: 2 } } });
assert(newer.back?.kind === "sofa" && newer.back.seats === undefined && newer.front?.seats === 2, "…and the new form wins over it where it speaks");
assert(benchSpecOf({}).back === undefined, "an item with neither says nothing — the defaults apply");

// ── Patching a side.
const patched = patchBenchSide(undefined, "front", { kind: "sofa" });
assert(patched.front?.kind === "sofa" && patched.back === undefined, "patching the front leaves the back to its default");
const counted = patchBenchSide(patched, "front", { seats: 3 });
assert(counted.front?.kind === "sofa" && counted.front.seats === 3, "…a count keeps the kind");
assert(patchBenchSide(counted, "front", { seats: null }).front?.seats === undefined, "…and null puts the count back to automatic");

// ── Standalone banquettes: the catalog says which placement is one.
const free = (id: string, bench?: BenchSpec, extra: Partial<Placement> = {}): Placement => ({
  id,
  variantId: "bench",
  layer: "floor",
  quantity: 1,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: 1,
  ...(bench ? { bench } : {}),
  ...extra,
});
const benches: BenchLookup = (p) => (p.variantId === "bench" ? (p.sizeMm ?? { widthMm: 3000, depthMm: 450 }) : null);
assert(standaloneBench(free("a"), benches)?.seats === 5, "a banquette off the rail seats one per 60cm of its catalog length");
assert(standaloneBench(free("b", undefined, { sizeMm: { widthMm: 6000, depthMm: 450 } }), benches)?.seats === 10, "…stretched on the plan, of its stretched length");
assert(standaloneBench(free("c", undefined, { variantId: "arch" }), benches) === null, "an arch is not a banquette");
assert(standaloneBench(free("d", undefined, { perch: { stageId: "s", itemId: "i" } }), benches) === null, "…nor is a banquette row perched on a stage's banquette");
assert(standaloneBench(free("e"), undefined) === null, "with no catalog to ask, nothing is a banquette");
assert(standaloneBenchSeats([free("a"), free("b", { back: { kind: "none" } }), free("c", undefined, { quantity: 2 })], benches) === 15, "the readout sums them, a quantity multiplying");

// ── Numbered when seated and numbered; the number waits under an empty one.
const numbered = free("n", { number: 4 });
assert(benchIsNumbered(numbered, standaloneBench(numbered, benches)), "a seated banquette with a number is a numbered unit");
const empty = free("m", { number: 4, back: { kind: "none" } });
assert(!benchIsNumbered(empty, standaloneBench(empty, benches)), "…with nobody seated it takes no number");
assert(!benchIsNumbered(free("o"), standaloneBench(free("o"), benches)), "…and without a number it is not numbered, seated or not");

// ── The default depth: table-deep with chairs, seat-deep without.
assert(benchDefaultDepth() === BENCH_TABLE_DEPTH_MM && benchDefaultDepth({ front: { kind: "chairs" }, back: { kind: "none" } }) === BENCH_TABLE_DEPTH_MM, "a banquette with chairs at it is 60 deep — it is their table");
assert(benchDefaultDepth({ back: { kind: "sofa" } }) === BENCH_DEPTH_MM && benchDefaultDepth({ back: { kind: "none" } }) === BENCH_DEPTH_MM, "…a sofa or a bare strip stays seat-deep");

// ── A sofa's own run and seat depth.
const shortSofa = benchLayout(6000, 600, { back: { kind: "sofa", widthMm: 2400, depthMm: 400 } });
assert(shortSofa.seats === 4 && shortSofa.cushions.length === 4, "a 2.4m sofa on a 6m banquette seats four, not ten");
assert(shortSofa.cushions.every((q) => q.every((p) => p.x >= -1200 && p.x <= 1200)), "…its cushions centred on the strip, inside its run");
assert(shortSofa.cushions.every((q) => Math.min(...q.map((p) => p.y)) === -300 && Math.max(...q.map((p) => p.y)) === 100), "…and 40cm deep from the edge in");
assert(shortSofa.backs[0][0].x === -1200 && shortSofa.backs[0][1].x === 1200 && shortSofa.backs[0][0].y === 100, "…the backrest along the run at the seat's inner edge");
assert(shortSofa.back.widthMm === 2400 && shortSofa.back.depthMm === 400, "…and the layout says what was laid");
// §2.1: a sofa stands where it was put along its banquette — absent = centred, to the digit.
assert(shortSofa.back.offsetMm === undefined, "a sofa with no offset is centred and says nothing of an offset");
const moved = benchLayout(6000, 600, { back: { kind: "sofa", widthMm: 2400, depthMm: 400, offsetMm: 1000 } });
assert(moved.back.offsetMm === 1000 && moved.cushions.every((q) => q.every((p) => p.x >= -200 - 1e-6 && p.x <= 2200 + 1e-6)) && moved.backs[0][0].x === -200 && moved.backs[0][1].x === 2200, "a sofa 1 m off the middle: its cushions and backrest run −0.2…2.2 m");
const pinned = benchLayout(6000, 600, { back: { kind: "sofa", widthMm: 2400, offsetMm: 9000 } });
assert(pinned.back.offsetMm === 1800 && pinned.cushions.every((q) => q.every((p) => p.x <= 3000 + 1e-6)), "…held on the banquette: an offset past its end stops at the end");
const seat = moved.blocks.find((bk) => bk.kind === "seat");
assert(!!seat && seat.x0 === -200 && seat.x1 === 2200 && moved.blocks.filter((bk) => bk.side === "back" && bk.kind !== "seat" && bk.kind !== "back").every((bk) => bk.x1 <= -200 + 1e-6 || bk.x0 >= 2200 - 1e-6), "…and the room raises its seat there, the strip on either side as before");
assert(benchLayout(6000, 600, { back: { kind: "sofa", offsetMm: 900 } }).back.offsetMm === undefined, "a sofa the whole length has nowhere to move");
const written = patchBenchSide({ back: { kind: "sofa", widthMm: 2400 } }, "back", { offsetMm: 5000 }, benchLayout(6000, 600, { back: { kind: "sofa", widthMm: 2400 } }));
assert(written.back?.offsetMm === 1800, "patchBenchSide holds a typed offset on the banquette");
assert(patchBenchSide({ back: { kind: "sofa", widthMm: 2400, offsetMm: 600 } }, "back", { widthMm: 6000 }, benchLayout(6000, 600, { back: { kind: "sofa", widthMm: 2400 } })).back?.offsetMm === undefined, "…and a run made the whole length drops it");
// The default: in front of the table on that side.
const frame = { centre: { x: 0, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, lengthMm: 6000, depthMm: 600 };
const box = (cx: number, cy: number, w: number, d: number) => [{ x: cx - w / 2, y: cy - d / 2 }, { x: cx + w / 2, y: cy - d / 2 }, { x: cx + w / 2, y: cy + d / 2 }, { x: cx - w / 2, y: cy + d / 2 }];
const front = sofaFacingTable(frame, "front", [box(1200, 1500, 2400, 1200), box(-2000, 4000, 1800, 1800)]);
assert(front.widthMm === 2400 && front.offsetMm === 1200, "a sofa facing a 2.4 m table 0.9 m in front takes its length and stands across from it");
assert(sofaFacingTable(frame, "back", [box(1200, 1500, 2400, 1200)]).widthMm === SOFA_DEFAULT_RUN_MM, "…a table on the OTHER side is not in front of the back side: 1.8 m, centred");
assert(sofaFacingTable(frame, "front", [box(1200, 3900, 2400, 1200)]).offsetMm === 0, "…nor is one 3 m out");
const head = sofaFacingTable(frame, "front", [[...box(-1200, 1300, 2400, 800), ...box(1200, 1300, 2400, 800)]]);
assert(head.widthMm === 4800 && head.offsetMm === 0, "a head table of two: the block's whole length");
const longer = sofaFacingTable(frame, "front", [box(2500, 1300, 4000, 800)]);
assert(longer.widthMm === 4000 && longer.offsetMm === 1000, "a table running past the banquette's end: its length, held on the banquette");
assert(benchLayout(3000, 600, { back: { kind: "sofa", depthMm: 5000 } }).cushions.every((q) => Math.max(...q.map((p) => p.y)) <= 280), "a seat deeper than the strip stops short of its far edge");
const widened = patchBenchSide(patchBenchSide(undefined, "back", { kind: "sofa", widthMm: 2000, depthMm: 350 }), "back", { widthMm: null });
assert(widened.back?.widthMm === undefined && widened.back?.depthMm === 350, "null puts a sofa's run back to the whole length and keeps its depth");

// ── A sofa's seat is what is DRAWN, and it never runs into the other side (QA BQ-2).
//    (a) The default seat on a 45 cm strip is under the old field floor of 20 cm — the bar is told it.
const plain45 = benchLayout(3000, 450, { back: { kind: "none" }, front: { kind: "sofa" } });
assert(plain45.front.depthMm === 145 && plain45.front.depthDefaultMm === 145, "a 45 cm strip's default seat is 14.5 cm, and the layout says so");
//    (b) A seat typed deeper than the strip: the layout says what it draws.
const deepSeat = benchLayout(3000, 450, { back: { kind: "none" }, front: { kind: "sofa", depthMm: 800 } });
const drawnDepth = (q: Point[]) => Math.max(...q.map((p) => p.y)) - Math.min(...q.map((p) => p.y));
assert(deepSeat.front.depthMm === 450 - SOFA_BACK_MM && deepSeat.cushions.every((q) => drawnDepth(q) === deepSeat.front.depthMm), "a seat typed deeper than the strip is drawn to the strip less its backrest — and that is the number read back");
assert(deepSeat.front.depthMaxMm === 450 - SOFA_BACK_MM, "…which is the most the bar offers");
//    …and WRITTEN as drawn: a deeper strip later never brings back a hidden 80 cm seat.
const sofa45: BenchSpec = { back: { kind: "none" }, front: { kind: "sofa" } };
const clampedSpec = patchBenchSide(sofa45, "front", { depthMm: 800 }, benchLayout(3000, 450, sofa45));
assert(clampedSpec.front?.depthMm === 450 - SOFA_BACK_MM, "a seat deeper than the strip is stored as the deepest it draws");
assert(benchLayout(3000, 1000, clampedSpec).front.depthMm === 450 - SOFA_BACK_MM, "…so deepening the banquette keeps the seat that was shown");
//    (c) A run as long as the banquette or longer is the whole length — it follows a stretch.
const frontSofa: BenchSpec = { front: { kind: "sofa" } };
const longRun = patchBenchSide(frontSofa, "front", { widthMm: 4000 }, benchLayout(2400, 600, frontSofa));
assert(longRun.front?.widthMm === undefined && benchLayout(6000, 600, longRun).front.widthMm === 6000, "a sofa typed longer than its banquette runs the whole length, and stretches with it");
assert(patchBenchSide(frontSofa, "front", { widthMm: 1800 }, benchLayout(2400, 600, frontSofa)).front?.widthMm === 1800, "…a shorter run is kept as typed");
//    (d) Two sides share the strip: a sofa never sits on the chairs' table, two sofas never overlap.
const besideChairs = benchLayout(3000, 600, { back: { kind: "chairs" }, front: { kind: "sofa", depthMm: 500 } });
assert(besideChairs.front.depthMm === 600 - CHAIR_TABLE_MM - SOFA_BACK_MM && besideChairs.cushions.every((q) => q.every((p) => p.y >= 0)), "beside chairs a sofa keeps off their table — a 30 cm place, the backrest between");
assert(besideChairs.front.depthMaxMm === besideChairs.front.depthMm, "…and the bar's most is that");
assert(benchLayout(3000, 1000, { back: { kind: "chairs" }, front: { kind: "sofa", depthMm: 500 } }).front.depthMm === 500, "…a deeper banquette leaves the sofa room to be deeper");
const twoDeep = benchLayout(3000, 600, { back: { kind: "sofa", depthMm: 400 }, front: { kind: "sofa", depthMm: 400 } });
const backInner = Math.max(...twoDeep.cushions.slice(0, twoDeep.back.seats).flat().map((p) => p.y));
const frontInner = Math.min(...twoDeep.cushions.slice(twoDeep.back.seats).flat().map((p) => p.y));
assert(frontInner - backInner >= SOFA_BACK_MM - 1, `two sofas typed 40 cm on a 60 cm strip share it — never overlapping, a backrest between (${backInner}…${frontInner})`);
const backToBack: BenchSpec = { back: { kind: "sofa", depthMm: 300 }, front: { kind: "sofa" } };
const nextToSofa = patchBenchSide(backToBack, "front", { depthMm: 400 }, benchLayout(3000, 600, backToBack));
assert(nextToSofa.front?.depthMm === 600 - SOFA_BACK_MM - 300, "a seat typed beside another sofa is written to what the other leaves");
const squeezed: BenchSpec = { back: { kind: "sofa", depthMm: 450 }, front: { kind: "sofa", depthMm: 450 } };
const evened = patchBenchSide(squeezed, "front", { depthMm: 200 }, benchLayout(3000, 600, squeezed));
assert(evened.back?.depthMm === benchLayout(3000, 600, squeezed).back.depthMm && benchLayout(3000, 600, evened).front.depthMm === 200, "…and a sofa beside it stored deeper than it is drawn is written as drawn, so the next edit is exactly what is typed");
// ── A side seats one per 60 cm of ITS run when nobody typed a count (QA BQ-9).
assert(benchLayout(6000, 600, { back: { kind: "sofa", widthMm: 2400 } }).back.autoSeats === 4, "a 2.4 m sofa on a 6 m banquette goes back to four, not ten");
assert(benchLayout(6000, 600).back.autoSeats === 10 && benchLayout(6000, 600).front.autoSeats === 0, "…a chairs side to one per 60 cm of the banquette, a bare side to none");

// ── The bar's rows for a STAGE banquette (QA BQ-1): its sofa side's run and seat as laid — the
//    fields read 0 and a blur wrote the field's floor into the drawing — and whether each count
//    was typed, through benchSpecOf (QA BQ-10: a legacy count is the back side's only while the new
//    form says nothing of the back).
const edgeSofa: Pick<StageStair, "bench"> = { bench: { back: { kind: "chairs" }, front: { kind: "sofa", widthMm: 2400, depthMm: 200 } } };
const edgeRows = benchSideRows(edgeSofa, benchLayout(6000, 600, benchSpecOf(edgeSofa)));
assert(edgeRows.front.kind === "sofa" && edgeRows.front.widthMm === 2400 && edgeRows.front.depthMm === 200, "a stage banquette's sofa side reads its run and seat as laid, never 0");
assert(!edgeRows.front.set && !edgeRows.back.set && edgeRows.back.kind === "chairs" && edgeRows.back.seats === 10, "…its chairs side as laid, and no count typed on either");
const legacySofa = { seats: 4, bench: { back: { kind: "sofa" as const } } };
assert(!benchSideRows(legacySofa, benchLayout(3000, 450, benchSpecOf(legacySofa))).back.set, "a legacy chair count under a back the new form names is not that side's typed count");
assert(benchSideRows({ seats: 4 }, benchLayout(3000, 450, benchSpecOf({ seats: 4 }))).back.set, "…while the new form says nothing of the back, it is");
assert(benchSideRows({}, undefined).back.kind === "chairs" && benchSideRows({}, undefined).front.kind === "none", "with no layout the sides are the defaults");

// ── A banquette of any shape is laid along its spine.
const strip: Footprint = { kind: "rect", widthMm: 6000, depthMm: 600 };
const viaShape = benchLayoutFor(strip);
assert(!viaShape.shaped && viaShape.chairs.length === plain.chairs.length, "a straight strip laid by its shape is the straight layout");
const deep = benchLayoutFor({ kind: "rect", widthMm: 600, depthMm: 6000 });
assert(!!deep.shaped && deep.widthMm === 6000 && deep.depthMm === 600 && deep.chairs.length === 10, "a strip drawn deep is read along its long side — ten chairs, not one");
assert(deep.chairs.every((c) => Math.abs(Math.abs(c.x) - (300 + CHAIR_OFFSET_MM)) < 1 && (Math.abs(Math.abs(c.facingDeg) - 180) < 1 || Math.abs(c.facingDeg) < 1)), "…standing off its long side, facing it square");
// A crescent: the top half of a ring 6m across, 60cm deep, as a hand-drawn outline.
const arc: Point[] = [];
for (let k = 0; k <= 24; k++) arc.push({ x: 3000 * Math.cos(Math.PI - (Math.PI * k) / 24), y: -3000 * Math.sin(Math.PI - (Math.PI * k) / 24) });
for (let k = 24; k >= 0; k--) arc.push({ x: 2400 * Math.cos(Math.PI - (Math.PI * k) / 24), y: -2400 * Math.sin(Math.PI - (Math.PI * k) / 24) });
const crescent = benchLayoutFor({ kind: "custom", outline: arc }, { back: { kind: "chairs" }, front: { kind: "sofa", seats: 3 } });
// A custom outline is drawn about its BOX's centre (footprintOutlines), so the ring's centre is
// 1.5m down from the frame's origin.
const C = { x: 0, y: 1500 };
const rad = (p: Point) => Math.hypot(p.x - C.x, p.y - C.y);
assert(!!crescent.shaped && crescent.widthMm > 8000 && crescent.widthMm < 8800 && Math.abs(crescent.depthMm - 600) < 60, "a crescent's length is its arc, its depth the band's");
assert(crescent.chairs.length === Math.floor(crescent.widthMm / SEAT_WIDTH_MM), "…seating one per 60cm OF THE ARC");
assert(crescent.chairs.every((c) => rad(c) > 2700 + crescent.depthMm / 2 + CHAIR_OFFSET_MM - 40), "…its chairs round the OUTER rim (the −y side, the back)");
assert(crescent.chairs.every((c) => Math.abs(((((c.facingDeg - (Math.atan2(C.y - c.y, C.x - c.x) * 180) / Math.PI) % 360) + 540) % 360) - 180) < 8), "…each facing in toward the centre, square at the band");
assert(crescent.cushions.length === 3 && crescent.cushions.every((q) => q.every((p) => rad(p) < 2720)), "…and the sofa's cushions on the inner half of the band");
assert(crescent.backs.length === 3, "…its backrest in segments that follow the curve");

// ── The room's blocks, each side at its own height (QA BQ-4/BQ-5/BQ-10).
const tableOnly = benchLayout(3000, 600).blocks;
assert(tableOnly.length === 1 && tableOnly[0].kind === "table" && !!tableOnly[0].core && tableOnly[0].y0 === -300 && tableOnly[0].y1 === 300, "chairs alone: the whole strip is their table");
const mixed = benchLayout(6000, 600, { back: { kind: "chairs" }, front: { kind: "sofa", widthMm: 2400, depthMm: 200 } }).blocks;
const seatBlock = mixed.find((b) => b.kind === "seat")!;
const backBlock = mixed.find((b) => b.kind === "back")!;
const coreBlock = mixed.find((b) => b.core)!;
assert(seatBlock.side === "front" && seatBlock.x0 === -1200 && seatBlock.x1 === 1200 && seatBlock.y0 === 100 && seatBlock.y1 === 300, "a sofa's seat is raised over ITS run, from the edge to its typed depth");
assert(backBlock.y1 === 100 && backBlock.y0 === 100 - BACKREST_THICK_MM && backBlock.x1 === 1200, "…its backrest right behind the seat, along the run");
assert(coreBlock.kind === "table" && coreBlock.side === "back" && coreBlock.y1 === backBlock.y0, "…the chairs' table from the backrest to their edge, never over the cushions");
assert(mixed.filter((b) => !b.core && b.kind === "table").length === 2, "…and the strip beyond a short run is table too");
const sofaAlone = benchLayout(3000, 450, { back: { kind: "sofa" } }).blocks;
assert(!sofaAlone.some((b) => b.kind === "table") && sofaAlone.find((b) => b.core)?.kind === "back", "a sofa nobody eats at has a solid back, no table slab");
const crescentBlocks = benchLayoutFor({ kind: "custom", outline: arc }, { back: { kind: "chairs" }, front: { kind: "sofa" } }).blocks;
assert(crescentBlocks.length >= 3 && crescentBlocks.every((b) => (b.outline?.length ?? 0) >= 4), "a shaped banquette's blocks are carried along its spine as outlines");

// ── A sofa side may be left out of the seating readout (U6, QA BQ-3) — the COUNT only.
const lounge: BenchSpec = { back: { kind: "chairs", seats: 4 }, front: { kind: "sofa", seats: 3, notSeating: true } };
const loungeLay = benchLayout(3000, 600, lounge);
assert(loungeLay.seats === 7 && loungeLay.countedSeats === 4 && loungeLay.sofaSeats === 3, "a sofa side that is not seating is out of the count — its three still sit there");
assert(benchLayout(3000, 600, { ...lounge, front: { kind: "sofa", seats: 3 } }).countedSeats === 7, "…while one that is counts");
const loungeOnly = free("lo", { back: { kind: "sofa", notSeating: true }, number: 6 });
assert(benchIsNumbered(loungeOnly, standaloneBench(loungeOnly, benches)), "…a banquette people sit on keeps its number though none of them is counted");
assert(standaloneBenchSeats([loungeOnly, free("a")], benches) === 5, "…and the readout leaves its sofa out");
assert(patchBenchSide(undefined, "front", { kind: "sofa", notSeating: true }).front?.notSeating === true, "the switch is written on the side");
assert(patchBenchSide(lounge, "front", { notSeating: false }).front?.notSeating === undefined, "…and taken off it");

console.log("bench self-check passed");
