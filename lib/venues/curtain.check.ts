// npm run check:curtain — the self-check of ./curtain.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { wallTrack } from "@/lib/studio/anchor";
import { type RodRail } from "@/lib/studio/rail";
import { fromLocalFrame } from "@/lib/studio/geometry";
import { type StructureFeature, type VenueStructure } from "./structure";
import { splitWall } from "./wall-split";
import { CURTAIN_DEPTH_MM, CURTAIN_FILL, curtainEndPatch, curtainEnds, curtainEndT, curtainLengthMm, curtainLookPatch, curtainOf, curtainPatch, curtainPieces, curtainRail, DOOR_CLEAR_MM, newCurtain, newRailCurtain, syncCurtains } from "./curtain";

// ponytail: self-check. Run: npm run check:curtain
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
// A 10 m wall along x from n0 to n1 (its left-hand normal points +y), and a bowed one.
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
  features: [],
};
const made = newCurtain(s, "w", { x: 5000, y: 300 });
assert(!!made && made.kind === "curtain" && curtainOf(made!)?.side === 1 && made.style?.fill === CURTAIN_FILL, "a click on the +y side hangs a black curtain on that side");
assert(made!.widthMm === 10000 && made!.depthMm === CURTAIN_DEPTH_MM && made!.x === 5000 && made!.y === CURTAIN_DEPTH_MM / 2 && made!.rotationDeg === 0 && made!.shape === "rect", "…the whole wall long, a band deep, its centre half a band into the room");
const other = newCurtain(s, "w", { x: 5000, y: -300 })!;
assert(curtainOf(other)?.side === -1 && other.y === -CURTAIN_DEPTH_MM / 2, "a click on the other side hangs it there");
assert(!made!.heightMm, "no height of its own: it hangs from the ceiling");

const withOne: VenueStructure = { ...s, features: [{ ...made!, id: "c" }] };
const half = curtainPatch(withOne, withOne.features[0], { from: 0.25, to: 0.75 });
assert(half.widthMm === 5000 && half.x === 5000 && curtainOf({ curtain: half.curtain })?.from === 0.25, "a shorter stretch re-lays the box along it");
const flipped = curtainPatch(withOne, withOne.features[0], { from: 0.9, to: 0.1 });
assert(curtainOf({ curtain: flipped.curtain })?.from === 0.1 && curtainOf({ curtain: flipped.curtain })?.to === 0.9, "ends given backwards are put in order");

// The wall is dragged: the curtain follows it, the same structure back when nothing moved.
assert(syncCurtains(withOne) === withOne, "nothing moved — the same structure back");
const moved = syncCurtains({ ...withOne, nodes: withOne.nodes.map((n) => (n.id === "n1" ? { ...n, x: 12000 } : n)) });
assert(moved.features[0].widthMm === 12000 && moved.features[0].x === 6000, "a wall lengthened carries its curtain across the whole wall");
const turned = syncCurtains({ ...withOne, nodes: withOne.nodes.map((n) => (n.id === "n1" ? { ...n, x: 0, y: 10000 } : n)) });
assert(turned.features[0].rotationDeg === 90 && turned.features[0].x === -CURTAIN_DEPTH_MM / 2 && turned.features[0].y === 5000, "a wall turned turns its curtain with it, still on its side");
const noWall: VenueStructure = { ...withOne, walls: [] };
assert(syncCurtains(noWall) === noWall && noWall.features[0].widthMm === 10000, "a curtain whose wall is gone keeps the box it had");
assert(curtainOf({ curtain: { wallId: "w", from: 0.8, to: 0.2, side: -1 } })?.from === 0.2 && curtainOf({}) === null, "curtainOf orders the ends and refuses a row with no span");

// A door on the wall parts the curtain: a 2 m door at 4 m leaves a piece either side, each
// stopping DOOR_CLEAR_MM short of the jamb; a wall with no door hangs one whole piece.
const whole = curtainPieces(withOne, withOne.features[0]);
assert(whole.length === 1 && whole[0].lengthMm === 10000 && whole[0].line[0].x === -5000 && Math.abs(whole[0].line[0].y) < 1e-6, "no door — one piece, the whole stretch, along the box's middle");
const covered: VenueStructure = { ...withOne, entrances: [{ id: "d", wallId: "w", distanceMm: 4000, widthMm: 2000, swingInward: true, doubleDoor: true }] };
assert(curtainPieces(covered, covered.features[0]).length === 1, "a door not marked clear is curtained over — a service door, a fire exit");
const doored: VenueStructure = { ...withOne, entrances: [{ id: "d", wallId: "w", distanceMm: 4000, widthMm: 2000, swingInward: true, doubleDoor: true, curtainClear: true }] };
const parted = curtainPieces(doored, doored.features[0]);
assert(parted.length === 2 && parted[0].lengthMm === 3000 - DOOR_CLEAR_MM && parted[1].lengthMm === 5000 - DOOR_CLEAR_MM, `a door parts the curtain into the stretches either side of it, each clear of the jamb (${parted.map((p) => p.lengthMm).join(",")})`);
assert(Math.abs(parted[0].band[0].x + 5000) < 1e-6 && parted[1].t0 > 0.5 && parted[1].t1 === 1, "…each placed along the wall in the box's frame");
// The wall split past the door (connected drawings §5): the door stands on a half now, and the
// curtain, still on the old id, parts for it exactly as before.
const splitPast = splitWall(doored, "w", 0.8);
if ("error" in splitPast) throw new Error("FAIL: " + splitPast.error);
const partedAfter = curtainPieces(splitPast.structure, doored.features[0]);
assert(
  partedAfter.length === 2 && partedAfter[0].lengthMm === parted[0].lengthMm && partedAfter[1].lengthMm === parted[1].lengthMm,
  `a split wall's curtain still parts for its door (${partedAfter.map((p) => p.lengthMm).join(",")})`,
);
assert(newCurtain(splitPast.structure, "w", { x: 0, y: 100 }) !== null, "a curtain may still be hung on the old id");
const windowed: VenueStructure = { ...withOne, entrances: [{ id: "v", wallId: "w", distanceMm: 4000, widthMm: 2000, swingInward: false, doubleDoor: false, kind: "window" }] };
assert(curtainPieces(windowed, windowed.features[0]).length === 1, "a window is curtained over — only a door parts it");
const edgeDoor: VenueStructure = { ...withOne, entrances: [{ id: "e", wallId: "w", distanceMm: 500, widthMm: 1000, swingInward: true, doubleDoor: false, curtainClear: true }] };
const fromDoor = curtainPieces(edgeDoor, edgeDoor.features[0]);
assert(fromDoor.length === 1 && fromDoor[0].t0 > 0.1 && fromDoor[0].t1 === 1, "a door at the wall's corner leaves one piece, starting past it");
assert(curtainEndT(withOne, withOne.features[0], { x: 2500, y: 900 }) === 0.25 && curtainEndT({ ...withOne, walls: [] }, withOne.features[0], { x: 0, y: 0 }) === null, "an end dragged to a point lands at that fraction of the wall; no wall, no fraction");
const ends = curtainEnds(withOne, withOne.features[0])!;
assert(ends.from.p.x === 0 && ends.from.out.x === -1 && ends.to.p.x === 10000 && ends.to.out.x === 1, "the ends are at the wall's corners, each grip pointing on along the wall");

// A bowed wall takes a curtain: it follows the bow, longer than the chord, its outline a strip.
// The bow bulges toward +x (both handles pull that way); the click inside it is the −x side.
const bowTrack = wallTrack(s, "bow")!;
const inside = newCurtain(s, "bow", { x: 9500, y: 3000 })!;
const outside = newCurtain(s, "bow", { x: 10900, y: 3000 })!;
assert(!!inside && inside.shape === "custom" && (inside.outline?.length ?? 0) > 8, "a bowed wall takes a curtain, its footprint a curved strip");
assert(curtainOf(inside)!.side !== curtainOf(outside)!.side, "…on the side the click fell, read against the bow, not its chord");
const onBow = { ...inside, id: "cb" } as StructureFeature;
const bowed: VenueStructure = { ...s, features: [onBow] };
assert(Math.abs(curtainLengthMm(bowed, onBow) - bowTrack.lengthMm) < 1 && bowTrack.lengthMm > 6000, "its length is the arc's, not the 6 m chord's");
const bowPieces = curtainPieces(bowed, onBow);
assert(bowPieces.length === 1 && bowPieces[0].line.length > 8, "its pleats run along the bow");
// The band's middle line, carried back out to the plan, stays a half band off the wall itself.
const mid = fromLocalFrame(bowPieces[0].line[Math.floor(bowPieces[0].line.length / 2)], { x: onBow.x, y: onBow.y }, onBow.rotationDeg);
const foot = bowTrack.at(bowTrack.nearestT(mid)).p;
assert(Math.abs(Math.hypot(mid.x - foot.x, mid.y - foot.y) - CURTAIN_DEPTH_MM / 2) < 15, "…a half band off the bow all the way round, not off its chord");
const apexT = bowTrack.nearestT({ x: 11000, y: 3000 });
assert(Math.abs(curtainEndT(bowed, onBow, { x: 11000, y: 3000 })! - apexT) < 1e-9 && apexT > 0.4 && apexT < 0.6, "an end dragged to the bow's crown lands on the crown");
const bowDoor: VenueStructure = { ...bowed, entrances: [{ id: "bd", wallId: "bow", distanceMm: 3000, widthMm: 1200, swingInward: true, doubleDoor: false, curtainClear: true }] };
assert(curtainPieces(bowDoor, onBow).length === 2, "a door on the bow parts it as on a straight wall");
// Straightening the wall gives the rectangle back.
const straightened = syncCurtains({ ...bowed, walls: bowed.walls.map((w) => (w.id === "bow" ? { ...w, curve: null } : w)) });
assert(straightened.features[0].shape === "rect" && !straightened.features[0].outline && straightened.features[0].widthMm === 6000, "a wall straightened gives the plain band back");
assert(syncCurtains(bowed) === bowed, "a curtain already on its bow is left as it is");

// RAILS (2026-11-07). A curtain stored the old way reads as a wall rail; a new one is written as a
// rail and never in the legacy fields; both read the same.
const legacy = { curtain: { wallId: "w", from: 0.2, to: 0.6, side: -1 as const } };
const rail = curtainRail(legacy);
assert(rail?.type === "wall" && rail.from === 0.2 && rail.side === -1 && curtainRail(legacy) === rail, "a legacy curtain is a wall rail — the same object each read");
assert(!!made!.curtain?.rail && made!.curtain.wallId === undefined && half.curtain?.wallId === undefined, "nothing new writes the legacy wall fields");
const legacyFeature = { ...made!, id: "lc", curtain: { wallId: "w", from: 0, to: 1, side: 1 as const } };
const railFeature = { ...made!, id: "rc" };
assert(
  JSON.stringify(curtainPieces(s, legacyFeature)) === JSON.stringify(curtainPieces(s, railFeature)) && curtainLengthMm(s, legacyFeature) === curtainLengthMm(s, railFeature),
  "a legacy curtain and its rail twin draw and measure exactly alike",
);

// On the SIDE of a building (§6.1): 4 × 3 m, 3.5 m high, its top side hung outside.
const building: StructureFeature = { id: "bld", kind: "structure", label: "מבנה", x: 3000, y: 3000, widthMm: 4000, depthMm: 3000, heightMm: 3500, shape: "rect", rotationDeg: 0 };
const site: VenueStructure = { ...s, features: [building] };
const onSide = newRailCurtain(site, { type: "side", featureId: "bld", side: 0, from: 0, to: 1, out: 1 })!;
assert(!!onSide && onSide.widthMm === 4000 && onSide.depthMm === CURTAIN_DEPTH_MM && onSide.x === 3000 && onSide.y === 1500 - CURTAIN_DEPTH_MM / 2, "a side curtain hangs the whole side, outside the building");
assert(curtainOf(onSide) === null && curtainLengthMm(site, { ...onSide, id: "sc" }) === 4000, "…it is no wall curtain, and is as long as the side");
const hung: VenueStructure = { ...site, features: [building, { ...onSide, id: "sc" }] };
assert(curtainPieces(hung, hung.features[1]).length === 1, "…in one piece — no door parts a side");
const shorter = curtainPatch(hung, hung.features[1], { from: 0.25, to: 0.75 });
assert(shorter.widthMm === 2000 && shorter.x === 3000, "the bar's stretch shortens it along the side");
const turnedIn = curtainPatch(hung, hung.features[1], { side: -1 });
assert(turnedIn.y === 1500 + CURTAIN_DEPTH_MM / 2, "…and its side flips it inside");
const buildingMoved = syncCurtains({ ...hung, features: [{ ...building, x: 5000 }, hung.features[1]] });
assert(buildingMoved.features[1].x === 5000, "a side curtain is re-laid when its feature moves");
const sideEnd = curtainEndPatch(hung, hung.features[1], "to", { x: 4000, y: 1200 });
assert(sideEnd.widthMm === 3000, "its end slides along the side");

// On a free-standing ROD (§6.2): a ר — 3 m, then a 2 m arm with no post under it.
const rod: RodRail = { type: "rod", points: [{ x: 0, y: 5000 }, { x: 3000, y: 5000 }, { x: 3000, y: 7000 }], heightMm: 2400, cantilever: "end" };
const onRod = newRailCurtain(s, rod)!;
assert(!!onRod && onRod.shape === "custom" && curtainLengthMm(s, { ...onRod, id: "r" }) === 5000, "a rod curtain runs the rod's whole polyline");
const reached = curtainEndPatch(s, { ...onRod, id: "r" }, "to", { x: 3000, y: 12000 });
const reachedRail = curtainRail({ curtain: reached.curtain }) as RodRail;
assert(reachedRail.points[2].y === 8000, "a cantilevered arm dragged out is held to its 3 m reach");

// The look and the drop.
const looked = curtainLookPatch(made!, { style: "sheer", dropMm: 2200 });
assert(looked.curtain?.style === "sheer" && looked.curtain.dropMm === 2200 && looked.curtain.rail === made!.curtain?.rail, "a style and a drop are the curtain's own, its rail untouched");
assert(curtainLookPatch({ curtain: looked.curtain }, { style: null, dropMm: null }).curtain?.style === undefined, "…and cleared again");
assert(curtainPatch(s, { ...made!, id: "x", curtain: looked.curtain }, { from: 0.5 }).curtain?.style === "sheer", "re-laying the stretch keeps the look");
console.log("venue curtains ok");
