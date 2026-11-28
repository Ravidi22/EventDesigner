// npm run check:snap — the self-check of ./snap.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "./hall";
import { constrainAngleDeg, gridStepMm, snapPoint, snapTurned, type SnapBox } from "./snap";

// ponytail: self-check. Run: npm run check:snap
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const origin: Point = { x: 0, y: 0 };
const base = { outline: [] as Point[], fixtures: [] as Point[], gridMm: 1000, toleranceMm: 120 }; // ~6px at the default hall zoom

assert(constrainAngleDeg(37) === 35, "37° quantises down to 35°");
assert(constrainAngleDeg(88) === 90, "88° quantises to the orthogonal");
assert(constrainAngleDeg(92.5) === 90, "an exact tie between the orthogonal and the next 5° step goes to the orthogonal");
assert(constrainAngleDeg(-2) === 0, "negative angles normalise into [0,360)");
assert(constrainAngleDeg(352) === 350, "wrap-around stays on a 5° multiple");
assert(constrainAngleDeg(358) === 0, "just under 360° snaps to 0, not 360");
// The shape editor's lock: 45° steps counted from the first side, not from the page.
assert(constrainAngleDeg(70, 45, 30) === 75, "a 45° lock from a 30° side lands on 75°");
assert(constrainAngleDeg(52.5, 45, 30) === 30, "…and an exact tie between the side's own line and the 45° notch goes to the line");
assert(constrainAngleDeg(40, 45, 0) === 45 && constrainAngleDeg(20, 45, 0) === 0, "from the page it is the plain 45° grid");
const fromSide = snapPoint({ x: 1000, y: 2000 }, { ...base, anchor: origin, constrainAngle: true, angleStepDeg: 45, angleRefDeg: 30 });
const fromSideDeg = ((Math.atan2(fromSide.point.y, fromSide.point.x) * 180) / Math.PI + 360) % 360;
assert(fromSide.angleLocked === true && Math.abs(fromSideDeg - 75) < 0.5, `a draw locked from a 30° side lands on 75°, not on a page notch (${fromSideDeg})`);

assert(gridStepMm(1000, 120) === 100, "a hall grid zoomed out steps in 100mm");
assert(gridStepMm(1000, 6) === 5, "the same grid zoomed in steps in 5mm");
assert(gridStepMm(100, 0.01) === 1, "the step never drops below a whole millimetre");
assert(gridStepMm(1000, 5000) === 1000, "a tolerance wider than the grid keeps the grid itself");

// Angle lock: a wall drawn 2° off horizontal lands exactly horizontal, at a rounded length.
const locked = snapPoint({ x: 4237.7719, y: 148 }, { ...base, anchor: origin, constrainAngle: true });
assert(locked.angleLocked === true && locked.point.y === 0, "a near-horizontal draw locks to 0°");
assert(locked.point.x % 100 === 0, "the locked length rounds to the grid step");
assert(Number.isInteger(locked.point.x) && Number.isInteger(locked.point.y), "snapped points are whole millimetres");

// …and Alt (constrainAngle false) leaves the direction alone, only rounding.
const free = snapPoint({ x: 4237.7719, y: 148 }, { ...base, anchor: origin, constrainAngle: false });
assert(free.angleLocked === false && free.point.y === 100 && free.point.x === 4200, "releasing the lock falls back to plain grid rounding");

// Inference along the ray: the locked direction is kept, the length stretches to meet an
// existing vertex's x — so the new corner lines up with the wall opposite.
const withOutline = { ...base, outline: [origin, { x: 3000, y: 1000 }] };
const inferred = snapPoint({ x: 2990, y: 20 }, { ...withOutline, anchor: origin, constrainAngle: true });
assert(inferred.point.x === 3000 && inferred.point.y === 0, "the locked ray slides out to a reference x");
assert(inferred.guides.x === 3000 && inferred.guides.y === null, "the matched axis comes back as a guide");

// Plain alignment (a vertex drag) is unchanged: pull onto the nearby axis, report the guide.
const dragged = snapPoint({ x: 3020, y: 640 }, { ...withOutline, excludeVertexIdx: undefined });
assert(dragged.point.x === 3000 && dragged.guides.x === 3000, "a drag snaps onto a reference x");
assert(dragged.point.y === 600 && dragged.guides.y === null, "the unmatched axis just rounds to the grid step");

// The dragged vertex must not snap to its own coordinates.
const self = snapPoint({ x: 3012, y: 1004 }, { ...withOutline, excludeVertexIdx: 1 });
assert(self.guides.x === null && self.point.x === 3000, "an excluded vertex is not its own snap target");

// A zero-length draw can't emit a degenerate wall. The threshold sits a hair under the grid
// step (100mm) rather than exactly on it: rounding x/y to whole millimetres independently can
// shave a fraction of a millimetre off the Euclidean length, which is fine — the guarantee this
// checks is "nowhere near zero", not an exact minimum.
const degenerate = snapPoint({ x: 3, y: 2 }, { ...base, anchor: origin, constrainAngle: true });
assert(Math.hypot(degenerate.point.x, degenerate.point.y) >= 99, "a locked draw never commits a zero-length wall");

// ── equal gaps ────────────────────────────────────────────────────────────────────────────────
// Two 1000-wide tables in a row with 500 of air between them. A third dragged up to the right of
// them continues the rhythm rather than landing wherever the pointer was.
const box = (x: number, y: number, w = 1000, d = 1000): SnapBox => ({ x, y, widthMm: w, depthMm: d });
const row = [box(0, 0), box(1500, 0)]; // edges at 500 and 1000 → a 500 gap
const mover = { widthMm: 1000, depthMm: 1000 };
const spaced = { ...base, gridMm: 1000, toleranceMm: 200, self: mover, boxes: row };

const continued = snapPoint({ x: 3050, y: 0 }, spaced);
assert(continued.point.x === 3000, "a third box continues the run at the same 500 gap");
assert(continued.gaps?.[0].gapMm === 500, "…and reports that gap");
assert(continued.gaps?.[0].segments.length === 2, "…with both equal gaps drawn, not just the new one");
assert(continued.gaps![0].segments.every((g) => Math.round(g.to - g.from) === 500), "…each segment the gap's own length");

// Dropped into the hole between two, it centres: equal air either side.
const hole = [box(0, 0), box(4000, 0)]; // edges at 500 and 3500 → 3000 of hole, 1000 of table
const centred = snapPoint({ x: 2100, y: 0 }, { ...spaced, boxes: hole });
assert(centred.point.x === 2000, "dropped into a hole it centres between the two");
assert(centred.gaps?.[0].gapMm === 1000, "…with 1000 either side");

// Out of tolerance, nothing is claimed — the point only rounds to the grid, as it always did.
const far = snapPoint({ x: 3600, y: 0 }, spaced);
assert(far.gaps === undefined && far.point.x === 3600, "beyond the tolerance no gap is claimed");

// A box in a different row is not "spaced" from this one, it is simply somewhere else.
const elsewhere = snapPoint({ x: 3050, y: 0 }, { ...spaced, boxes: [box(0, 9000), box(1500, 9000)] });
assert(elsewhere.gaps === undefined, "boxes in another row take no part in this one's spacing");

// Alignment is the stronger claim and keeps the axis it matched: a reference x within tolerance
// wins over any gap that would have moved the item off it.
const pulled = snapPoint({ x: 3050, y: 0 }, { ...spaced, outline: [{ x: 3040, y: 0 }, { x: 3040, y: 5000 }] });
assert(pulled.point.x === 3040 && pulled.guides.x === 3040, "an alignment match wins the axis");
assert(!pulled.gaps?.some((g) => g.axis === "x"), "…and no gap guide is drawn for it");

// The two axes are resolved INDEPENDENTLY, and not necessarily by the same rule. A box dropped
// under a column of two: its x is claimed by the alignment it shares with the column, and its y
// by the rhythm the column already has — 800 of air, so 800 again.
const column = [box(3000, 0), box(3000, 1800)]; // edges at 500 and 1300 → an 800 gap
const under = snapPoint({ x: 3040, y: 3630 }, { ...spaced, boxes: column });
assert(under.point.x === 3000 && under.point.y === 3600, "the two axes are resolved independently, by whichever rule claims each");
assert(under.guides.x === 3000, "…the alignment says which line it lined up with");
assert(under.gaps?.length === 1 && under.gaps[0].axis === "y", "…and only the axis alignment did not claim gets a gap guide");
assert(under.gaps![0].gapMm === 800, "…continuing the 800 the column already has");

// The same four boxes as a 2×2 block, with the fifth dragged out to the diagonal: it is in neither
// that block's row nor its column, so there is no gap for it to be equal to. Nothing is claimed —
// the honest answer, and the one that keeps a diagonal drag from being yanked square.
const square = [box(0, 0), box(1500, 0), box(0, 1500), box(1500, 1500)];
const diagonal = snapPoint({ x: 3040, y: 3030 }, { ...spaced, boxes: square });
assert(diagonal.gaps === undefined, "a box in neither row nor column is spaced against nothing");

// ── edges, and going flush ────────────────────────────────────────────────────────────────────
// The thing a centre cannot say. Every reference can now be met three ways — the item's centre on
// it, or either of its own edges — which is the whole of "put the stage against the wall" and
// "butt these two decks into one platform", neither of which is a statement about a centre.
{
  const deck = { widthMm: 4000, depthMm: 2000 }; // a run of staging modules
  const room = [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 12000 }, { x: 0, y: 12000 }];
  const ctx = { ...base, gridMm: 1000, toleranceMm: 200, self: deck };

  // Against the wall: dragged near y=0, the deck's BACK EDGE lands on it — not its centre, which
  // would put half the stage outside the building.
  const wall = snapPoint({ x: 10000, y: 1100 }, { ...ctx, outline: room });
  assert(wall.point.y === 1000, "a deck dragged at the wall lands with its back edge on the wall");
  assert(wall.guides.y === 0, "…and the guide is drawn along the wall, not through the deck");

  // Flush: a second deck butts onto the first, no gap and no arithmetic.
  const first: SnapBox = { x: 0, y: 5000, widthMm: 4000, depthMm: 2000 }; // edges at ±2000
  const butted = snapPoint({ x: 4100, y: 5000 }, { ...ctx, boxes: [first] });
  assert(butted.point.x === 4000, "a second deck butts up against the first");
  assert(butted.point.x - deck.widthMm / 2 === first.x + first.widthMm / 2, "…with no gap at all between them");
  assert(butted.guides.x === 2000, "…and the guide is the edge they meet on");
  assert(butted.point.y === 5000, "…in the same row, which is the ordinary centre pull");

  // Edges in line across the room: a narrow item lines its own left edge up with a wide one's,
  // which is a different answer from lining up their centres — and the one that was asked for.
  const wide: SnapBox = { x: 0, y: 0, widthMm: 4000, depthMm: 2000 }; // left edge at -2000
  const narrow = { widthMm: 1000, depthMm: 1000 };
  const flushLeft = snapPoint({ x: -1460, y: 6000 }, { ...ctx, self: narrow, boxes: [wide] });
  assert(flushLeft.point.x === -1500, "a narrow item can line its own edge up with a wide one's");
  assert(flushLeft.point.x - narrow.widthMm / 2 === wide.x - wide.widthMm / 2, "…which is what having the same left edge means");
  assert(flushLeft.guides.x === -2000, "…and the guide is that shared edge");

  // NO EXTENT, NO EDGE RULE. A wall corner being dragged is a point and has no edges, so it gets
  // exactly the centre-only pull this file has always given it.
  const asPoint = snapPoint({ x: -1460, y: 6000 }, { ...ctx, self: undefined, boxes: [wide] });
  assert(asPoint.point.x === -1400, "without an extent nothing has an edge, and the point only rounds to the grid");
  assert(asPoint.guides.x === null, "…and claims no alignment it cannot have");

  // Ties go to the CENTRE. Three same-width decks in a column line up by their edges and by their
  // centres at once; the line drawn is the one through the middle.
  const above: SnapBox = { x: 6000, y: 0, widthMm: 4000, depthMm: 2000 };
  const below = snapPoint({ x: 6040, y: 4000 }, { ...ctx, boxes: [above] });
  assert(below.point.x === 6000, "a deck under another lines up with it");
  assert(below.guides.x === 6000, "…on the centre line, not on whichever edge was reached first");

  // FLUSH FIRST (QA MG-5). A deck dragged 4cm short of the deck beside it, while a table's edge
  // across the room lines up 1cm away: the nearest line used to win, and the 4cm gap stayed.
  // Meeting a box of its own kind edge to edge outranks every other line within reach.
  const near = { ...ctx, toleranceMm: 60 };
  const sameKind: SnapBox = { x: 0, y: 0, widthMm: 4000, depthMm: 2000, flush: true }; // right edge at 2000
  const table: SnapBox = { x: 6550, y: 6000, widthMm: 1000, depthMm: 1000 }; // left edge at 6050
  const butt = snapPoint({ x: 4040, y: 0 }, { ...near, boxes: [sameKind, table] });
  assert(butt.point.x === 4000 && butt.guides.x === 2000, "a deck goes flush against its own kind before lining up with an unrelated edge");
  const otherRow = snapPoint({ x: 4040, y: 0 }, { ...near, boxes: [{ ...sameKind, y: 9000 }, table] });
  assert(otherRow.point.x === 4050, "…one in another row is no neighbour to be flush with — the nearest line wins as before");

  // TABLES MEET AT THEIR CHAIRS (QA MG-16): a table and the one beside it go flush ring to ring —
  // each one's chairs 340 out from its top — never top to top with the chairs through each other.
  const ringed: SnapBox = { x: 0, y: 0, widthMm: 2000, depthMm: 1000, flush: true, flushBox: { x: 0, y: 0, widthMm: 2680, depthMm: 1680 } };
  const selfRing = { widthMm: 2000, depthMm: 1000, flush: { dx: 0, dy: 0, widthMm: 2680, depthMm: 1680 } };
  const rings = snapPoint({ x: 2700, y: 0 }, { ...near, self: selfRing, boxes: [ringed] });
  assert(rings.point.x === 2680 && rings.guides.x === 1340, "a table goes flush against the next one where their chairs meet");
  // A ring off-centre (chairs on one end only) is met by its own edge.
  const oneEnd = snapPoint({ x: 2040, y: 0 }, { ...near, self: { widthMm: 2000, depthMm: 1000, flush: { dx: 170, dy: 0, widthMm: 2340, depthMm: 1000 } }, boxes: [{ ...ringed, flushBox: { x: 0, y: 0, widthMm: 2000, depthMm: 1000 } }] });
  assert(oneEnd.point.x === 2000, "a table seated only at its far end goes top-to-top against a bare one");
}

// ── AT AN ANGLE (QA MG-4): two 4×2 stages along a 30° wall are snapped in their own frame, on
// their true sizes. The world-axis snap measured each by the box it takes up turned, which is
// bigger on every side: snapped "flush", they stood 232mm apart (1000mm at 45°).
{
  const along = (k: number, across = 0) => ({ x: k * Math.cos(Math.PI / 6) - across * Math.sin(Math.PI / 6), y: k * Math.sin(Math.PI / 6) + across * Math.cos(Math.PI / 6) });
  const turnedBox = (c: Point, rotation: number, w = 4000, d = 2000): SnapBox => {
    const t = (rotation * Math.PI) / 180;
    const cs = Math.abs(Math.cos(t));
    const sn = Math.abs(Math.sin(t));
    return { ...c, widthMm: w * cs + d * sn, depthMm: w * sn + d * cs, shape: { rotation, widthMm: w, depthMm: d } };
  };
  const self = { widthMm: 4000, depthMm: 2000, rotation: 30 };
  const flushAt = snapTurned(along(4040, 25), self, [turnedBox(along(0), 30)], 60);
  const want = along(4000);
  assert(!!flushAt && Math.hypot(flushAt.x - want.x, flushAt.y - want.y) <= 1, "a 30° stage goes flush against the 30° stage beside it, and in line with it");
  assert(!!snapTurned(along(4040, 25), self, [turnedBox(along(0), 120, 2000, 4000)], 60), "…a neighbour turned a quarter more is at the same angle too");
  assert(snapTurned(along(4040, 25), self, [{ x: 0, y: 0, widthMm: 4000, depthMm: 2000 }], 60) === null, "nothing at its angle: no claim — the room's own snap is asked");
  assert(snapTurned(along(4040, 25), { ...self, rotation: 90 }, [turnedBox(along(0), 90)], 60) === null, "a quarter turn is the room's own axes, snapped as before");
}

console.log("snap self-check passed");
