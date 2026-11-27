// npm run check:cover — the self-check of ./cover.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, Placement, PlacementCover, Point } from "@/lib/design-document/types";
import { footprintOutlines } from "./footprint";
import { outlineAreaMm2 } from "./shaped-outline";
import { type DeckLookup } from "@/lib/design-document/stage";
import { featureFootprint, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import { adoptCovers, carpetAreaMm2, carpetPolygon, carpetShape, cleanCover, detachCover, settleCovers, turn, type CoverContext } from "./cover";

// ponytail: self-check. Run: npm run check:cover
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const doc = (placements: Placement[], features?: DesignDocumentContent["features"]): DesignDocumentContent => ({ calibration: { mmPerUnit: 1 }, tables: [], placements, ...(features ? { features } : {}) });
const rug = (cover: PlacementCover, extra: Partial<Placement> = {}): Placement => ({ id: "rug", variantId: "v-rug", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, cover, ...extra });
const feature = (f: Partial<StructureFeature> & Pick<StructureFeature, "id" | "shape" | "widthMm" | "depthMm">): StructureFeature => ({ kind: "surface", label: "דשא", x: 5000, y: 5000, heightMm: 0, rotationDeg: 0, surface: "grass", ...f });
const venue = (features: StructureFeature[]): VenueStructure => ({ nodes: [], walls: [], entrances: [], features });
/** The carpet's outline where it lies in the room. */
const inRoom = (p: Placement) => carpetPolygon(carpetShape(p)!).map((q) => {
  const t = turn(q, p.rotation);
  return { x: p.position.x + t.x, y: p.position.y + t.y };
});

// ── a rectangle, turned ──
const lawn = feature({ id: "lawn", shape: "rect", widthMm: 4000, depthMm: 3000, rotationDeg: 30 });
const onLawn = adoptCovers(doc([rug({ featureId: "lawn" })]), venue([lawn])).placements[0];
assert(onLawn.sizeMm?.widthMm === 4000 && onLawn.sizeMm.depthMm === 3000, "a carpet over a 4×3 lawn is 4×3");
assert(near(onLawn.position.x, 5000) && near(onLawn.position.y, 5000) && onLawn.rotation === 30, "…where the lawn is, turned as it is");
assert(near(carpetAreaMm2(onLawn)!, 12e6, 1e3), "…and bills its twelve square metres");
const inset = adoptCovers(doc([rug({ featureId: "lawn", insetMm: 200 })]), venue([lawn])).placements[0];
assert(inset.sizeMm?.widthMm === 3600 && inset.sizeMm.depthMm === 2600, `an inset of 20cm leaves 3.6×2.6 (${inset.sizeMm?.widthMm}×${inset.sizeMm?.depthMm})`);
assert(near(inset.position.x, 5000) && near(inset.position.y, 5000), "…on the lawn's middle");

// ── an ellipse: its curves are kept ──
const oval = feature({ id: "oval", shape: "ellipse", widthMm: 6000, depthMm: 4000 });
const onOval = adoptCovers(doc([rug({ featureId: "oval" })]), venue([oval])).placements[0];
assert(onOval.edgeCurves?.filter(Boolean).length === 4, "a carpet over an oval lawn keeps the oval's four curves");
assert(Math.abs(carpetAreaMm2(onOval)! / (Math.PI * 3000 * 2000) - 1) < 0.005, `…and its area is the ellipse's (${carpetAreaMm2(onOval)})`);
const ovalIn = adoptCovers(doc([rug({ featureId: "oval", insetMm: 300 })]), venue([oval])).placements[0];
assert(near(ovalIn.sizeMm!.widthMm, 5400, 2) && near(ovalIn.sizeMm!.depthMm, 3400, 2), `…and 30cm in it is 5.4×3.4 (${ovalIn.sizeMm?.widthMm}×${ovalIn.sizeMm?.depthMm})`);

// ── a bowed and rounded hand-drawn bed ──
const bed = feature({
  id: "bed",
  shape: "custom",
  widthMm: 6000,
  depthMm: 3000,
  outline: [{ x: -3000, y: -1500 }, { x: 3000, y: -1500 }, { x: 3000, y: 1500 }, { x: -3000, y: 1500 }],
  edgeCurves: [{ c1: { x: 1000, y: -600 }, c2: { x: -1000, y: -600 } }, null, null, null],
  corners: [null, null, 500, 500],
});
const fp = featureFootprint(bed);
const truth = outlineAreaMm2(footprintOutlines(fp)[0].outline, footprintOutlines(fp)[0].edgeCurves);
const onBed = adoptCovers(doc([rug({ featureId: "bed" })]), venue([bed])).placements[0];
assert(Math.abs(carpetAreaMm2(onBed)! / truth - 1) < 0.002, `a bowed, rounded bed: the carpet's area is the bed's (${carpetAreaMm2(onBed)} vs ${truth})`);
assert((onBed.edgeCurves?.filter(Boolean).length ?? 0) >= 3, "…its bow and its two rounded corners are curves on the carpet");
const bedIn = adoptCovers(doc([rug({ featureId: "bed", insetMm: 150 })]), venue([bed])).placements[0];
assert(carpetAreaMm2(bedIn)! < carpetAreaMm2(onBed)! && near(bedIn.sizeMm!.widthMm, onBed.sizeMm!.widthMm - 300, 3), "…and 15cm in it is 30cm narrower");

// ── a stage: carried when it moves, its holes cut ──
const stage: Placement = {
  id: "st",
  variantId: "deck",
  layer: "floor",
  quantity: 1,
  position: { x: 10000, y: 8000 },
  rotation: 0,
  scale: 1,
  stage: { outline: [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 2000 }, { x: -3000, y: 2000 }], front: 0, decks: ["deck"] },
};
const decks: DeckLookup = (id) => (id === "deck" ? { id, widthMm: 1000, depthMm: 500, heightMm: 600 } : undefined);
const ctx: CoverContext = { deckOf: decks };
const d0 = settleCovers(undefined, doc([stage, rug({ stageId: "st", insetMm: 100 })]), ctx);
const c0 = d0.placements[1];
assert(c0.sizeMm?.widthMm === 5800 && c0.sizeMm.depthMm === 3800 && near(c0.position.x, 10000) && near(c0.position.y, 8000), "a carpet 10cm in from a 6×4 stage's edge is 5.8×3.8 on its middle");
const movedStage = { ...stage, position: { x: 12000, y: 9000 }, rotation: 90 };
const d1 = settleCovers(d0, { ...d0, placements: [movedStage, c0] }, ctx);
const c1 = d1.placements[1];
assert(near(c1.position.x, 12000) && near(c1.position.y, 9000) && c1.rotation === 90, "the stage moved and turned: its carpet with it");
const untouched = { ...d1, tables: [...d1.tables] };
assert(settleCovers(d1, untouched, ctx).placements[1] === c1, "a step that leaves the stage alone leaves the carpet alone");
const nudged = { ...d1, placements: [movedStage, { ...c1, position: { x: 0, y: 0 } }] };
assert(settleCovers(d1, nudged, ctx) === d1, "a covered carpet nudged is put straight back — and the step is no step at all");
// A hole in the middle, and one at the rim.
const holed: Placement = { ...stage, stage: { ...stage.stage!, pieces: [{ variantId: "deck", centre: { x: 0, y: 0 }, rotation: 0, hole: true }, { variantId: "deck", centre: { x: 2800, y: 0 }, rotation: 90, hole: true }] } };
const d2 = settleCovers(undefined, doc([holed, rug({ stageId: "st" })]), ctx);
const c2 = d2.placements[1];
assert(c2.holes?.length === 2, "the stage's two holes are holes in its carpet");
// The rim one is a 1000×500 deck stood on end at x 2550…3050: 45cm of it over the carpet.
assert(near(carpetAreaMm2(c2)!, 24e6 - 0.5e6 - 0.45e6, 2e3), `…the one in the middle whole, the one at the rim only where the carpet is (${carpetAreaMm2(c2)})`);
const blind = settleCovers(d0, { ...d0, placements: [holed, c0] }, {});
assert(blind.placements[1] === c0, "with no lookup to size its holes, a holed stage's carpet is left as it stands");
// A mirrored stage of a non-symmetric outline: the carpet lies over the stage as the plan draws it.
const ell: Placement = { ...stage, mirrored: true, rotation: 20, stage: { ...stage.stage!, outline: [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 2000 }, { x: -3000, y: 2000 }] } };
const c3 = settleCovers(undefined, doc([ell, rug({ stageId: "st" })]), ctx).placements[1];
const toRoomPt = (q: Point) => {
  const t = turn({ x: -q.x, y: q.y }, 20);
  return { x: 10000 + t.x, y: 8000 + t.y };
};
const room = ell.stage!.outline.map(toRoomPt);
assert(room.every((q) => inRoom(c3).some((r) => near(r.x, q.x, 2) && near(r.y, q.y, 2))), "a mirrored, turned L-stage: every corner of its carpet is a corner of the stage");

// ── detached, gone, moved per event ──
const loose = detachCover(c1);
assert(!loose.cover && loose.outline === c1.outline && loose.sizeMm === c1.sizeMm, "detached: the link goes, the shape stays");
const gone = settleCovers(d1, { ...d1, placements: [c1] }, ctx);
assert(gone.placements[0] === c1, "the stage deleted: its carpet keeps the last shape it was laid in");
const removed = adoptCovers(doc([rug({ featureId: "lawn" }, { outline: onLawn.outline, sizeMm: onLawn.sizeMm, position: onLawn.position })], [{ featureId: "lawn", dx: 0, dy: 0, removed: true }]), venue([{ ...lawn, movable: true }]));
assert(removed.placements[0].position.x === onLawn.position.x && removed.placements[0].outline === onLawn.outline, "a surface taken out of this event's room: the carpet stands as it was");
const movable = { ...lawn, movable: true, rotationDeg: 0 };
const e0 = adoptCovers(doc([rug({ featureId: "lawn" })]), venue([movable]));
const e1 = settleCovers(e0, { ...e0, features: [{ featureId: "lawn", dx: 1000, dy: -500 }] }, { structure: venue([movable]) });
assert(near(e1.placements[0].position.x, 6000) && near(e1.placements[0].position.y, 4500), "a movable lawn moved for this event: its carpet with it");
assert(settleCovers(e0, { ...e0, features: [{ featureId: "lawn", dx: 1000, dy: 0 }] }, {}).placements[0] === e0.placements[0], "…but with no venue to hand, the carpet stands");

// ── a detached carpet resized scales its shape ──
const big = { ...loose, sizeMm: { widthMm: loose.sizeMm!.widthMm * 2, depthMm: loose.sizeMm!.depthMm * 2 } };
assert(near(carpetAreaMm2(big)!, carpetAreaMm2(loose)! * 4, 10), "a detached carpet stretched to twice its size is four times the floor");
assert(carpetShape({ ...loose, outline: undefined }) === null, "a rug with no outline is a rectangle");
assert(cleanCover({ stageId: "a", featureId: "b", insetMm: -5 })?.stageId === "a" && cleanCover({ featureId: "b", insetMm: 12.4 })?.insetMm === 12, "a cover names one thing, and a whole, non-negative inset");

console.log("cover ok");
