// npm run check:hang — the self-check of ./hang.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/design-document/types";
import { insidePolys, polysBox } from "./proximity";
import { anchorOffset, blockTarget, centreOffset, centreOver, formatHang, HANG_FIELD, hangHeightOf, hangTarget, targetUnder, wallTies } from "./hang";

// ponytail: self-check. Run: npm run check:hang
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: Point, b: Point, tol = 1) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

// A 20×12m room, a round table, a stage, and a head table standing on the stage.
const room: Point[] = [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 12000 }, { x: 0, y: 12000 }];
const walls = room.map((p, i) => [p, room[(i + 1) % 4]] as [Point, Point]);
const round = hangTarget("t1", { kind: "circle", diameterMm: 1800 }, { x: 5000, y: 6000 });
const stage = hangTarget("stage", { kind: "rect", widthMm: 6000, depthMm: 3000 }, { x: 10000, y: 2000 });
const head = hangTarget("head", { kind: "rect", widthMm: 3000, depthMm: 800 }, { x: 10000, y: 2000 });
const targets = [round, stage, head];

assert(near(round.centre, { x: 5000, y: 6000 }), "a round table's middle is its centre");
assert(targetUnder({ x: 5300, y: 6200 }, targets)?.key === "t1", "a point over the table is over the table");
assert(targetUnder({ x: 10200, y: 2100 }, targets)?.key === "head", "over a table on a stage it is the table, the smaller of the two");
assert(targetUnder({ x: 12500, y: 3000 }, targets)?.key === "stage", "off the table but on the stage it is the stage");
assert(targetUnder({ x: 15000, y: 9000 }, targets) === undefined, "over bare floor it is nothing");

// Dropped anywhere over the table → its middle; dragged past within reach → its middle; further → free.
assert(near(centreOver({ x: 5600, y: 5500 }, targets)!.point, { x: 5000, y: 6000 }), "a drop over a table lands in its middle");
assert(centreOver({ x: 5600, y: 5500 }, targets, 200) === null, "a drag 0.78 off the middle is not pulled to it");
assert(near(centreOver({ x: 5100, y: 6050 }, targets, 200)!.point, { x: 5000, y: 6000 }), "a drag 0.11 off the middle is");
assert(centreOver({ x: 15000, y: 9000 }, targets) === null, "nothing under it, nothing to centre on");

// Two tables pushed together as one head table: ONE target, its middle on the seam — a chandelier
// over either half is hung from the block's middle, not from the half it happens to be over.
const half = { kind: "rect", widthMm: 1800, depthMm: 800 } as const;
const block = blockTarget("block", [{ f: half, at: { x: 4100, y: 9000 } }, { f: half, at: { x: 5900, y: 9000 } }]);
assert(near(block.centre, { x: 5000, y: 9000 }), "a block's middle is the middle of its box, on the seam");
const bb = polysBox(block.polys);
assert(bb.minX === 3200 && bb.maxX === 6800 && bb.minY === 8600 && bb.maxY === 9400, "…and its outline is the box round both halves");
assert(targetUnder({ x: 4300, y: 9100 }, [...targets, block])?.key === "block", "over one half of the block it is over the block");
assert(near(centreOver({ x: 4300, y: 9100 }, [block])!.point, { x: 5000, y: 9000 }), "…and is centred on the seam");
const tb = polysBox(blockTarget("turned", [{ f: half, at: { x: 0, y: 0 }, rotationDeg: 90 }]).polys);
assert(near({ x: tb.minX, y: tb.minY }, { x: -400, y: -900 }) && near({ x: tb.maxX, y: tb.maxY }, { x: 400, y: 900 }), "a turned member is boxed where it stands, through its turn");

// A crescent head table: its middle is on the band, not in the air at its box centre.
const arc = hangTarget("arc", { kind: "custom", outline: [{ x: -1500, y: -500 }, { x: 1500, y: -500 }, { x: 1500, y: 500 }, { x: 1000, y: 500 }, { x: 1000, y: 0 }, { x: -1000, y: 0 }, { x: -1000, y: 500 }, { x: -1500, y: 500 }] }, { x: 3000, y: 3000 });
assert(insidePolys(arc.centre, arc.polys), "a shaped table's middle is inside its outline, not in its notch");
// Turned a quarter turn, the middle turns with it.
const turned = hangTarget("arc90", { kind: "custom", outline: [{ x: -1500, y: -500 }, { x: 1500, y: -500 }, { x: 1500, y: 500 }, { x: 1000, y: 500 }, { x: 1000, y: 0 }, { x: -1000, y: 0 }, { x: -1000, y: 500 }, { x: -1500, y: 500 }] }, { x: 3000, y: 3000 }, 90);
assert(insidePolys(turned.centre, turned.polys), "…and stays inside it when the table is turned");
const o = anchorOffset({ kind: "custom", outline: [{ x: -1500, y: -500 }, { x: 1500, y: -500 }, { x: 1500, y: 500 }, { x: 1000, y: 500 }, { x: 1000, y: 0 }, { x: -1000, y: 0 }, { x: -1000, y: 500 }, { x: -1500, y: 500 }] }, 90);
assert(near({ x: 3000 + o.x, y: 3000 + o.y }, turned.centre), "anchorOffset is the same carry hangTarget makes");

// Two ties fix it: 5.00 off the left wall, 6.00 off the top (the nearer of each pair).
const ties = wallTies({ x: 5000, y: 6000 }, walls);
assert(ties.length === 2, "two ties fix a hang point");
assert(ties.some((t) => t.axis === "x" && Math.abs(t.mm - 5000) < 1 && t.b.x === 0), "5.00 to the nearer side wall");
assert(ties.some((t) => t.axis === "y" && Math.abs(t.mm - 6000) < 1), "6.00 to the nearer end wall");
const corner = wallTies({ x: 18000, y: 1000 }, walls);
assert(corner.some((t) => t.axis === "x" && Math.abs(t.mm - 2000) < 1 && t.b.x === 20000), "near the right wall it measures to the right wall");
assert(corner.some((t) => t.axis === "y" && Math.abs(t.mm - 1000) < 1 && t.b.y === 0), "…and to the top one");
assert(wallTies({ x: 5000, y: 6000 }, []).length === 0, "no walls, no ties");

// Off the centre of what it hangs over: two legs; on the centre: none.
const legs = centreOffset({ x: 5400, y: 5700 }, { x: 5000, y: 6000 });
assert(legs.length === 2 && Math.abs(legs[0].mm - 400) < 1 && Math.abs(legs[1].mm - 300) < 1, "0.40 across and 0.30 along");
assert(near(legs[0].b, legs[1].a) && near(legs[1].b, { x: 5400, y: 5700 }), "the legs run centre → corner → hang point");
assert(centreOffset({ x: 5000, y: 6005 }, { x: 5000, y: 6000 }).length === 0, "hung on the centre, there is no offset to give");
assert(centreOffset({ x: 5030, y: 6060 }, { x: 5000, y: 6000 }).length === 0, "a few centimetres off by eye is the centre, not a figure (OFFSET_MIN_MM)");
assert(centreOffset({ x: 5000, y: 6400 }, { x: 5000, y: 6000 }).length === 1, "straight down the line, one leg");

// The height: the placement's own, else the catalog row's, else nothing.
const row = { categoryFields: { [HANG_FIELD]: 3200 } };
assert(hangHeightOf({}, row) === 3200, "the row's default height");
assert(hangHeightOf({ hangHeightMm: 2800 }, row) === 2800, "an item's own height wins");
assert(hangHeightOf({}, { categoryFields: {} }) === undefined, "no height said, none printed");
assert(hangHeightOf({}, { categoryFields: { [HANG_FIELD]: "abc" } }) === undefined, "garbage is no height, not NaN");
assert(formatHang(3200) === "↓ 3.20 מ׳", "printed as metres, down");

console.log("hang self-check passed");
