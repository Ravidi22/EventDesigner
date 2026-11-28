// npm run check:scene-stage — the self-check of ./stage.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import type { StageBuild, StageStair } from "@/lib/design-document/types";
import { BARRIER_MM, BENCH_TOP_MM, TREAD_MM, edgeItemShape, layStage, type StagePlacement } from "@/lib/design-document/stage";
import { deckOf } from "@/lib/studio/catalog-resolver";
import { wallDistanceOf } from "@/lib/venues/stage-edges";
import { emptyStructure, type StructureFeature } from "@/lib/venues/structure";
import { primeCatalog } from "@/lib/catalog/storage";
import { SOFA_SEAT_MM, mergeStages, rectOutline, roundOutline, skirtMm } from "@/lib/design-document/stage";
import { SceneCollector } from "./collect";
import { applyTransform, turn } from "./frame";
import { type Part, vec3 } from "./types";
import { BARRIER_HEIGHT_MM, benchParts, DECK_TOP_MM, RAIL_HEIGHT_MM, rampParts, RECESS_INSET_MM, SKIRT_PLEAT_MM, SOFA_BACK_HEIGHT_MM, stageNodes, treadParts, venueStageNodes, type StageChair, type StageOpts } from "./stage";

// ponytail: self-check. Run: npm run check:scene-stage
{
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const near = (a: number, b: number, eps = 1) => Math.abs(a - b) <= eps;

  primeCatalog([
    { id: "deck-244x122", name: "פלטה 244×122", category: "stage-decks", layer: "floor", dimensions: { widthMm: 2440, depthMm: 1220, heightMm: 600 }, categoryFields: {}, styleTags: [], variants: [] },
    { id: "skirt", name: "חצאית", category: "stage-skirts", layer: "floor", dimensions: { widthMm: 1000, depthMm: 10, heightMm: 600 }, categoryFields: {}, styleTags: [], variants: [{ id: "v-skirt-black", name: "שחור", swatch: "#111111" }] },
  ]);
  const chair: StageChair = { style: "chiavari", widthMm: 420, depthMm: 340, heightMm: 900, tone: "#f7f6fc" };
  const opts: StageOpts = { structure: emptyStructure(), author: true, chair };

  // ── A 6×4 at 60cm, front along −y (rectOutline's edge 0): a full flight on the front, a banquette
  // across the back with the default chairs on the stage side, a barrier down one side.
  const stage: StageBuild = {
    outline: rectOutline(6000, 4000),
    front: 0,
    decks: ["deck-244x122"],
    skirtVariant: "v-skirt-black",
    stairs: [
      { id: "fl", edge: 0, t: 0.5, widthMm: 1000, full: true },
      { id: "bn", kind: "bench", edge: 2, t: 0.5, widthMm: 0, full: true },
      { id: "br", kind: "barrier", edge: 1, t: 0.5, widthMm: 0, full: true },
    ],
  };
  const p: StagePlacement = { id: "s1", variantId: "deck-244x122", layer: "floor", quantity: 1, scale: 1, position: { x: 10000, y: 8000 }, rotation: 0, stage };
  const out = new SceneCollector();
  stageNodes(p, out, opts);
  const nodes = out.nodes();
  const bodies = nodes.filter((n) => n.kind === "body");
  const ofType = (type: string) => bodies.filter((b) => b.tag.type === type);
  const topOf = (q: Part) => ("h" in q ? q.at.z + q.h : q.at.z);

  const decks = ofType("deck");
  const slabs = decks.find((b) => b.id === "s1:decks")!;
  // 6×4 of 244×122 sheets leaves strips no sheet fits; the platform is the outline all the same.
  assert(layStage(stage, deckOf).coverage < 1, "a 6×4 is not whole sheets — the fill leaves strips");
  assert(slabs.parts.length === 1 && slabs.parts[0].shape === "extrude" && JSON.stringify(slabs.parts[0].outline.outline) === JSON.stringify(stage.outline) && !slabs.parts[0].holes, "…and the room's platform is ONE slab of the stage's outline — no holes where no deck fits");
  assert(near(topOf(slabs.parts[0]), 600), "its top is at the stage height, 600");
  assert(slabs.instances.length === 1 && near(slabs.instances[0].at.x, 10000) && near(slabs.instances[0].at.y, 8000), "…placed at the stage's own transform in the room");
  const under = decks.find((b) => b.id === "s1:deck-under")!;
  assert(under.parts.length === 1 && under.parts.every((q) => q.at.z === 0 && near(topOf(q), 600 - DECK_TOP_MM)), "the dark body stands from the floor to just under the slab");

  // A flight set INTO the stage keeps its recess: the slab and the body have it as a hole, drawn
  // just inside the flight so it never touches the stage's own edge.
  const sunkItem: StageStair = { id: "sk", edge: 0, t: 0.5, widthMm: 1000, inner: true };
  const sunkStage: StageBuild = { ...stage, stairs: [sunkItem] };
  const sunkOut = new SceneCollector();
  stageNodes({ ...p, id: "s3", stage: sunkStage }, sunkOut, opts);
  const sunkSlab = sunkOut.nodes().filter((n) => n.kind === "body").find((b) => b.id === "s3:decks")!;
  const hole = sunkSlab.parts[0].shape === "extrude" ? sunkSlab.parts[0].holes?.[0]?.outline : undefined;
  const sunkPoly = edgeItemShape(sunkStage, sunkItem, deckOf)!.polygon;
  const inside = (q: Point) => q.y > -2000 && Math.abs(q.x) < 3000;
  assert(!!hole && hole.length === sunkPoly.length && hole.every(inside), "a sunk flight is a hole in the slab, inside the stage's edge");
  assert(hole!.every((q, i) => Math.hypot(q.x - sunkPoly[i].x, q.y - sunkPoly[i].y) <= RECESS_INSET_MM * 1.5), "…a hair inside the flight's own outline");

  // Stairs: one block per tread, descending from the edge to the foot.
  const flight = bodies.find((b) => b.tag.type === "edge" && b.tag.id === "fl")!;
  const fs = edgeItemShape(stage, stage.stairs![0], deckOf)!;
  assert(fs.risers === 4 && fs.riserMm === 150, "60cm is four risers of 15cm");
  assert(flight.parts.length === fs.risers - 1, `one tread fewer than risers (got ${flight.parts.length})`);
  const treadTops = flight.parts.map(topOf);
  assert(near(treadTops[0], fs.riseMm - fs.riserMm), "the tread against the edge is one riser under the deck");
  assert(near(treadTops[treadTops.length - 1], fs.riserMm), "the tread at the foot is one riser above the floor");
  assert(treadTops.every((t, i) => i === 0 || t < treadTops[i - 1]), "…and the treads descend monotonically from the edge to the foot");
  const first = flight.parts[0];
  assert(first.shape === "extrude" && first.outline.outline.some((q) => near(q.y, -2000)) && first.outline.outline.every((q) => q.y <= -2000 + 1 && q.y >= -2000 - TREAD_MM - 1), "the first tread stands against the front edge, one tread deep");
  const foot = flight.parts[flight.parts.length - 1];
  assert(foot.shape === "extrude" && foot.outline.outline.some((q) => near(q.y, -2000 - fs.depthMm)), "the last tread reaches the flight's foot");
  // The same flight set INTO the stage climbs the other way.
  const inner = edgeItemShape({ ...stage, stairs: [{ id: "in", edge: 0, t: 0.5, widthMm: 1000, inner: true }] }, { id: "in", edge: 0, t: 0.5, widthMm: 1000, inner: true }, deckOf)!;
  const innerTops = treadParts(inner, 0).map(topOf);
  assert(near(innerTops[0], inner.riserMm) && near(innerTops[innerTops.length - 1], inner.riseMm - inner.riserMm), "an inner flight is climbed from the edge in: first tread low, last one riser under the deck");

  // The banquette: chairs on the deck behind it, facing it.
  const chairs = bodies.filter((b) => b.tag.type === "chair");
  const chairInstances = chairs.flatMap((b) => b.instances);
  assert(chairs.length === 1 && chairInstances.length === 10, `ten chairs along a 6m banquette, one instanced body (got ${chairInstances.length})`);
  assert(chairInstances.every((t) => near(t.at.z, 600)), "the banquette's chairs stand on the deck, at 600");
  const bench = bodies.find((b) => b.tag.type === "edge" && b.tag.id === "bn")!;
  const bs = edgeItemShape(stage, stage.stairs![1], deckOf)!;
  const benchMid = { x: 10000 + (bs.midline[0].x + bs.midline[1].x) / 2, y: 8000 + (bs.midline[0].y + bs.midline[1].y) / 2 };
  for (const t of chairInstances) {
    const front = applyTransform({ ...t, at: vec3(0, 0, 0) }, vec3(0, 1, 0));
    assert(front.x * (benchMid.x - t.at.x) + front.y * (benchMid.y - t.at.y) > 0, "each chair faces the banquette");
    assert(t.at.y < 8000 + 2000, "…standing inside the stage's edge");
  }
  const strip = bench.parts[0];
  assert(strip.shape === "extrude" && strip.at.z === 0 && near(topOf(strip), 600 + BENCH_TOP_MM), "the strip stands on the floor outside the stage, its top table-height above the deck its chairs stand on");
  // QA BQ-5: chairs on the stage side and a sofa on the room side — each side at its own height:
  // the room side's cushions sit on a seat at 46 cm from the floor, never inside a block to deck+75.
  const inPoly = (q: Point, poly: Point[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
      if (poly[i].y > q.y !== poly[j].y > q.y && q.x < ((poly[j].x - poly[i].x) * (q.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
    return c;
  };
  const mixedItem: StageStair = { ...stage.stairs![1], bench: { back: { kind: "chairs" }, front: { kind: "sofa", widthMm: 3000 } } };
  const ms = edgeItemShape({ ...stage, stairs: [mixedItem] }, mixedItem, deckOf)!;
  const mp = benchParts(ms, 0, 600);
  assert(ms.cushions.length > 0, "the room side has cushions");
  for (const q of ms.cushions) {
    const mid = { x: q.reduce((t, p) => t + p.x, 0) / q.length, y: q.reduce((t, p) => t + p.y, 0) / q.length };
    const over = mp.parts.filter((pt) => pt.shape === "extrude" && inPoly(mid, pt.outline.outline) && pt.outline.outline !== q);
    assert(over.every((pt) => topOf(pt) <= SOFA_SEAT_MM + 1), `…nothing but the seat under a cushion, and the cushion on top at 46 cm (${over.map(topOf).join(",")})`);
  }
  assert(mp.parts.some((pt) => near(topOf(pt), 600 + BENCH_TOP_MM)), "…while the chairs' half keeps its table height above the deck");
  assert(mp.parts.some((pt) => near(topOf(pt), SOFA_SEAT_MM + SOFA_BACK_HEIGHT_MM)), "…and the sofa has its backrest");

  // The barrier stands on the deck, to its default height.
  const barrier = bodies.find((b) => b.tag.type === "edge" && b.tag.id === "br")!;
  assert(barrier.parts.length === 1 && barrier.parts[0].at.z === 600 && near(topOf(barrier.parts[0]), 600 + BARRIER_HEIGHT_MM), "the barrier rises 1 m off the deck");
  assert(barrier.parts[0].shape === "extrude" && barrier.parts[0].outline.outline.every((q) => q.x <= 3000 + 1 && q.x >= 3000 - BARRIER_MM - 1), "…on the stage, inside its edge");

  // The skirt: the two bare sides — front and back are stood against — as pleated ribbons.
  const skirt = ofType("skirt");
  assert(skirt.length === 1, "one skirt body");
  const pathLength = (path: Point[]) => path.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - path[i].x, q.y - path[i].y), 0);
  const skirtLen = skirt[0].parts.reduce((s, q) => s + (q.shape === "ribbon" ? pathLength(q.path) : 0), 0);
  const expected = skirtMm(p, deckOf, wallDistanceOf(opts.structure));
  assert(expected === 8000 && Math.abs(skirtLen - expected) <= expected * 0.01, `the skirt's ribbons run the stage's skirt metres (${skirtLen} vs ${expected})`);
  assert(skirt[0].parts.every((q) => q.shape === "ribbon" && q.at.z === 0 && q.h === 600 && q.pleatMm === SKIRT_PLEAT_MM), "…each from the floor to the deck, pleated");
  assert(skirt[0].material.colour === "#111111" && skirt[0].material.kind === "fabric", "…in the skirt row's shade");
  assert(ofType("railing").length === 0, "no railing while the studio has no rule");

  // Railings when the rule asks: posts and a rail along the open drop that is not the front.
  const railed = new SceneCollector();
  stageNodes(p, railed, { ...opts, railingAboveMm: 500 });
  const rail = railed.nodes().filter((n) => n.kind === "body").filter((b) => b.tag.type === "railing");
  assert(rail.length === 1 && rail[0].parts.some((q) => q.shape === "cylinder" && q.at.z === 600) && rail[0].parts.some((q) => q.shape === "box" && near(topOf(q), 600 + RAIL_HEIGHT_MM)), "a 60cm drop above a 50cm rule gets posts on the deck and a rail a metre up");

  // A round stage built of sheets misses its rim pieces — and stands whole all the same.
  const disc = roundOutline(3000, 3000);
  const round: StagePlacement = { ...p, id: "s2", stage: { outline: disc.outline, smooth: disc.smooth, front: 0, decks: ["deck-244x122"] } };
  const authorOut = new SceneCollector();
  stageNodes(round, authorOut, opts);
  const clientOut = new SceneCollector();
  stageNodes(round, clientOut, { ...opts, author: false });
  const missing = layStage(round.stage, deckOf).missing;
  const deckTops = (c: SceneCollector) => c.nodes().filter((n) => n.kind === "body").filter((b) => b.id === "s2:decks").flatMap((b) => b.parts);
  const whole = deckTops(clientOut);
  assert(missing.length > 0 && whole.length === 1 && whole[0].shape === "extrude" && whole[0].outline.outline.length === disc.outline.length, "a disc of sheets misses its rim pieces, and the room still has its whole deck — one slab, no holes");
  assert(deckTops(authorOut).length === whole.length, "…the same for the designer and the client");

  // A ramp: one tilted slab over a stepped infill, from the floor to the deck.
  const ramped = edgeItemShape(stage, { id: "rp", kind: "ramp", edge: 3, t: 0.5, widthMm: 1200 }, deckOf)!;
  const rp = rampParts(ramped, 0);
  const slab = rp.slab[0];
  assert(slab.shape === "box" && near(slab.d, Math.hypot(ramped.depthMm, ramped.riseMm)) && !!slab.tiltDeg && near(slab.tiltDeg, (Math.atan2(600, 7200) * 180) / Math.PI, 0.01), "the slab is the slope's length, tilted by the slope");
  assert(rp.infill.length >= 4 && rp.infill.every((q) => q.shape === "box" && q.at.z === 0 && topOf(q) < 600) && topOf(rp.infill[0]) > topOf(rp.infill[rp.infill.length - 1]), "the infill steps down from the edge to the foot, under the slab");
  const tiltOk = (() => {
    // Local +y of the slab must point from the edge to the foot: a positive tilt then drops the foot.
    const yAxis = turn({ x: 0, y: 1 }, slab.shape === "box" ? (slab.rotDeg ?? 0) : 0);
    return yAxis.x * (ramped.foot.x - ramped.base.x) + yAxis.y * (ramped.foot.y - ramped.base.y) > 0;
  })();
  assert(tiltOk, "the slab's own +y runs from the edge to the foot, so its positive tilt drops the foot");

  // A venue's stage feature: no decks in the catalog, so one slab at its height; its flight the same.
  const feature: StructureFeature = {
    id: "vs",
    kind: "stage",
    label: "במה",
    x: 20000,
    y: 5000,
    widthMm: 6000,
    depthMm: 3000,
    heightMm: 600,
    shape: "rect",
    rotationDeg: 0,
    edgeItems: [{ id: "vf", edge: 0, t: 0.5, widthMm: 1200 }],
  };
  const vOut = new SceneCollector();
  venueStageNodes(feature, vOut, opts);
  const vBodies = vOut.nodes().filter((n) => n.kind === "body");
  const vSlab = vBodies.find((b) => b.id === "feature:vs:decks")!;
  assert(!!vSlab && vSlab.tag.id === "feature:vs" && vSlab.parts.length === 1 && near(topOf(vSlab.parts[0]), 600), "a venue stage stands as one slab at its own height, tagged feature:<id>");
  assert(near(vSlab.instances[0].at.x, 20000) && near(vSlab.instances[0].at.y, 5000), "…where the feature stands");
  const vFlight = vBodies.find((b) => b.tag.type === "edge" && b.tag.id === "vf")!;
  assert(!!vFlight && vFlight.parts.length === 3 && near(topOf(vFlight.parts[0]), 450), "its flight is the sketch's: three treads, the first one riser under the deck");
  assert(vSlab.material.texture === "deck" && vBodies.some((b) => b.tag.type === "skirt"), "an unpainted venue stage is timber in a skirt");

  // Painted at /halls, it is a BUILT platform: stone in its colour, top and steps, no skirt.
  const bOut = new SceneCollector();
  venueStageNodes({ ...feature, style: { fill: "#FBF9F4" } }, bOut, opts);
  const bBodies = bOut.nodes().filter((n) => n.kind === "body");
  const bSlab = bBodies.find((b) => b.id === "feature:vs:decks")!;
  assert(bSlab.material.texture === "paving" && bSlab.material.colour === "#fbf9f4", "a painted venue stage's top is stone slabs in its colour");
  assert(bBodies.find((b) => b.tag.type === "edge" && b.tag.id === "vf")!.material === bSlab.material, "…its steps the same stone");
  assert(!bBodies.some((b) => b.tag.type === "skirt"), "…and no cloth hangs round a built platform");

  // ── MERGED AT TWO HEIGHTS: a 4×2 at 40 beside a 4×2 at 60, one flight along each front, made ONE
  // stage (mergeStages): the 60 part a level, its slab at 60 from the floor, its flight climbing
  // from the floor (not from the base deck) to 60, both flights in one number of steps.
  const tall: StageBuild = { outline: rectOutline(4000, 2000), front: 0, decks: ["deck-244x122"], heightMm: 600, stairs: [{ id: "tf", edge: 0, t: 0.5, widthMm: 4000, full: true }] };
  const low: StageBuild = { ...tall, heightMm: 400, stairs: [{ id: "lf", edge: 0, t: 0.5, widthMm: 4000, full: true }] };
  const merged = mergeStages(
    [
      { id: "lo", variantId: "deck-244x122", layer: "floor", quantity: 1, scale: 1, position: { x: 2000, y: 1000 }, rotation: 0, stage: low },
      { id: "hi", variantId: "deck-244x122", layer: "floor", quantity: 1, scale: 1, position: { x: 6000, y: 1000 }, rotation: 0, stage: tall },
    ],
    deckOf,
  )!;
  const mOut = new SceneCollector();
  stageNodes({ id: "m", variantId: "deck-244x122", layer: "floor", quantity: 1, scale: 1, position: merged.position, rotation: merged.rotation, stage: merged.stage }, mOut, opts);
  const mBodies = mOut.nodes().filter((n) => n.kind === "body");
  const mTops = mBodies.find((b) => b.id === "m:decks")!.parts.map(topOf).sort((a, b) => a - b);
  assert(mTops.length === 2 && near(mTops[0], 400) && near(mTops[1], 600), "a merged stage at two heights stands as two slabs, at 40 and at 60");
  const lvItem = merged.stage.stairs!.find((it) => it.level)!;
  const lvFlight = mBodies.find((b) => b.tag.type === "edge" && b.tag.id === lvItem.id)!;
  const baseFlight = mBodies.find((b) => b.tag.type === "edge" && b.tag.id !== lvItem.id)!;
  assert(lvFlight.parts.every((q) => q.at.z === 0) && near(topOf(lvFlight.parts[0]), 450), "…the 60 part's flight stands on the floor, its top tread one riser under 60");
  assert(lvFlight.parts.length === baseFlight.parts.length && near(topOf(baseFlight.parts[0]), 300), "…and the 40 part's in as many treads, its risers 10cm");
  const mSkirt = mBodies.find((b) => b.tag.type === "skirt")!;
  assert(mSkirt.parts.some((q) => q.shape === "ribbon" && q.h === 600 && q.at.z === 0) && mSkirt.parts.some((q) => q.shape === "ribbon" && q.h === 400 && q.at.z === 0), "…skirted from the floor at each part's own height");

  const stats = out.stats();
  console.log(`scene stage ok: ${stats.bodies} bodies, ${stats.instances} instances for the 6×4`);
}
