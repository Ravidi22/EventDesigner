// `npm run check:scene`: the fixture (./fixture.ts) built by ./build.ts, asserted by hand. Its own
// file because the fixture primes the catalog, which nothing a page imports may do — build.ts is
// imported by the scene screens, this is imported by nobody.
//
// Each module also checks itself (check:envelope, check:tables, check:items, check:flowers,
// check:floor-kinds, check:overhead, check:stage). This one checks the WIRING: that the build hands
// every placement to the right builder, at the right height, and that the pieces agree — a chair
// on a banquette shares its geometry with the chairs round the tables, a vase on a banquette stands
// on its top, a chandelier hangs where its row says.
import { isMain } from "../self-check";
import { buildScene, wallCurtainTop } from "./build";
import { fixtureInput, SECRET_PRICE } from "./fixture";
import { DOOR_HEIGHT_MM, KERB_MM, type BodyNode } from "./types";

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const near = (a: number, b: number, eps = 1) => Math.abs(a - b) < eps;
  const scene = buildScene(fixtureInput(true));
  const bodies = scene.nodes.filter((n): n is BodyNode => n.kind === "body");
  const byType = (type: string) => bodies.filter((b) => b.tag.type === type);
  const ofId = (id: string) => bodies.filter((b) => b.id === id || b.tag.id === id);
  const minZ = (parts: { at: { z: number } }[]) => Math.min(...parts.map((q) => q.at.z));
  const topOf = (part: { shape: string; at: { z: number }; h?: number }) => part.at.z + (part.h ?? 0);

  // ── the envelope ──────────────────────────────────────────────────────────────────────────────
  assert(byType("floor").length === 2, `two zone floors (got ${byType("floor").length})`);
  assert(byType("ground").length === 1, "one ground plane");
  assert(byType("ceiling").length === 1 && scene.roofedMm === 4000, "the hall has one ceiling at 4 m and it is the tallest roofed zone");
  const wallTops = byType("wall").flatMap((b) => b.parts.map(topOf));
  assert(wallTops.some((h) => near(h, 4000)), "the hall's walls stand 4 m");
  assert(wallTops.some((h) => near(h, KERB_MM)), "the terrace's edges are kerbs");
  const door = byType("door");
  assert(door.flatMap((b) => b.parts).some((q) => near(q.at.z, DOOR_HEIGHT_MM)), "the door has a lintel starting at 2.1 m");
  assert(door.filter((b) => b.id.startsWith("door-leaf")).flatMap((b) => b.parts).length === 2, "the double door stands open on two leaves");
  // The terrace's pool is cut out of the lawn it lies in; the hall's floor is whole.
  const terrace = ofId("z-terrace").find((b) => b.tag.type === "floor")!;
  const hall = ofId("z-hall").find((b) => b.tag.type === "floor")!;
  const holes = (b: BodyNode) => b.parts.reduce((n, q) => n + (q.shape === "plane" ? (q.holes?.length ?? 0) : 0), 0);
  assert(holes(terrace) === 1 && holes(hall) === 0, "the pool is a hole in the terrace's floor and nowhere else");
  // The venue's tree and palm are instanced plants; its chair rows are twelve dining chairs.
  assert(bodies.some((b) => b.id.startsWith("i:plant:tree")) && bodies.some((b) => b.id.startsWith("i:plant:palm")), "the venue's tree and palm stand on the terrace");

  // ── the dressed tables ────────────────────────────────────────────────────────────────────────
  const tops = byType("table");
  assert(tops.length === 3, `three table bodies (got ${tops.length})`);
  const round = tops.find((b) => b.tag.id === "t1")!;
  assert(round.parts.some((q) => q.shape === "extrude" && near(q.at.z, 720)), "the round table's top is a 30 mm slab whose face is at 750");
  assert(near(round.instances[0].at.x, 5000) && near(round.instances[0].at.y, 5000), "…standing where the document puts it");
  const cloth = byType("cloth").filter((b) => !b.id.startsWith("cloth-hem:")); // a contour's hem bands are the cloth's too
  assert(cloth.length === 1 && minZ(cloth[0].parts) < 1, "the cloth falls to the floor");
  for (const id of ["p-ring", "p-cluster", "p-lamp"]) {
    const b = bodies.find((x) => x.tag.id === id && x.instances.length === 1);
    assert(!!b && near(b.instances[0].at.z, 750), `${id} stands on the table top`);
  }
  assert(bodies.some((b) => b.id.startsWith("i:flower:")), "the arrangement has flowers");
  assert(!scene.nodes.some((n) => n.kind === "label"), "no table numbers in the room, not even for the author");

  // ── chairs: one geometry per style × colour × size, whoever they belong to ───────────────────
  const chiavari = bodies.find((b) => b.id === "i:chair:chiavari:#f7f6fc:450x500x900");
  const dining = bodies.find((b) => b.id === "i:chair:dining:#f7f6fc:450x500x900");
  // 10 round table 1, 16 round the block of 2 and 3, 10 in the ceremony rows, 5 behind the
  // banquette (3 m of it, one per 60 cm) — all the studio's ivory chiavari.
  assert(!!chiavari && chiavari.instances.length === 10 + 16 + 10 + 5, `one chiavari body for the tables, the rows and the banquette (got ${chiavari?.instances.length})`);
  const onDeck = chiavari!.instances.filter((t) => near(t.at.z, 600));
  assert(onDeck.length === 5, `the banquette's chairs stand on the 600 mm deck (got ${onDeck.length})`);
  assert(!!dining && dining.instances.length === 12 && dining.instances.every((t) => near(t.at.z, 0)), "the venue's own rows: twelve dining chairs on the floor");

  // ── place settings: one per TABLE seat — never at the ceremony rows or the banquette ─────────────
  const settings = bodies.filter((b) => b.tag.type === "tableware").flatMap((b) => b.instances);
  assert(settings.length === 10 + 16, `a place setting at every table seat (got ${settings.length})`);
  assert(settings.every((t) => near(t.at.z, 750)), "…on the table tops");
  const round1 = settings.filter((t) => Math.hypot(t.at.x - 5000, t.at.y - 5000) < 900);
  assert(round1.length === 10 && round1.every((t) => Math.hypot(t.at.x - 5000, t.at.y - 5000) > 500), "…inside the rim, round the round table");
  // The fit (./tableware.ts laySettings): no two settings' chargers-and-cutlery meet, at any seat.
  const clash = settings.some((a, i) => settings.some((b, j) => j > i && Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) < 205 * ((a.scale ?? 1) + (b.scale ?? 1)) - 1));
  assert(!clash, "…and no two of them meet");
  const off = buildScene({ ...fixtureInput(false), settings: { ...fixtureInput(false).settings, tableware: false } });
  assert(!off.nodes.some((n) => n.kind === "body" && n.tag.type === "tableware"), "…and none when the designer switches them off");

  // ── the stage ─────────────────────────────────────────────────────────────────────────────────
  const stage = ofId("p-stage");
  const decks = stage.filter((b) => b.tag.type === "deck");
  assert(decks.length > 0 && decks.flatMap((b) => b.parts).some((q) => near(topOf(q), 600)), "the stage's decks top out at 600");
  assert(stage.some((b) => b.tag.type === "skirt"), "the stage wears a skirt on its open sides");
  const edges = byType("edge").map((b) => b.tag.id);
  assert(["flight-1", "bench-1", "barrier-1"].every((id) => edges.includes(id)), `every edge item is built (${edges.join(",")})`);
  const flight = byType("edge").find((b) => b.tag.id === "flight-1")!;
  assert(flight.parts.length >= 2 && Math.max(...flight.parts.map(topOf)) < 600, "the flight's treads climb toward the deck, the last under it");
  const perched = ofId("p-perched-vase").find((b) => b.instances.length === 1)!;
  assert(!!perched && near(perched.instances[0].at.z, 600 + 750), "a vase perched on the banquette stands on its top: deck + 750");

  // ── the floor and the ceiling ─────────────────────────────────────────────────────────────────
  const bar = ofId("p-bar").find((b) => b.tag.type === "item")!;
  assert(bar.parts.some((q) => q.shape === "box" && near(q.at.z, 1100)), "the bar's counter top sits on its 1100 body");
  assert(bodies.some((b) => b.id.startsWith("i:bottle:")), "…with bottles on its shelf");
  assert(ofId("p-sofa")[0].parts.length > 3, "the sofa is a sofa, not a box");
  const rug = ofId("p-rug")[0];
  assert(rug.parts[0].shape === "box" && (rug.parts[0] as { h: number }).h === 12, "the rug is a 12 mm slab");
  // Its contour (lib/catalog/border.ts): two flat rings on the slab in their colours, the gold one at
  // the edge, the cream one inside it — each its outer edge with its inner cut out.
  const rings = rug.parts.filter((q): q is Extract<typeof q, { shape: "extrude" }> => q.shape === "extrude" && near(q.at.z, 12));
  assert(rings.length === 2 && rings.every((q) => (q.holes?.length ?? 0) === 1), "the rug's contour is two rings on its top");
  assert(rings[0].material?.colour === "#c9a24a" && rings[1].material?.colour === "#f5efe0", "…in the contour's colours, the edge band first");
  // The cloth's hem: the bottom 80 of its fall, gold, over the same folds.
  const hem = bodies.find((b) => b.id.startsWith("cloth-hem:p-cloth"));
  const hemFall = hem?.parts[0];
  assert(!!hem && hem.material.colour === "#c9a24a" && hemFall?.shape === "drape" && hemFall.band?.[0] === 0 && hemFall.band?.[1] === 80, "the cloth's contour is the bottom 80 of its fall, in gold");
  const chuppah = ofId("p-chuppah").find((b) => b.tag.type === "item")!;
  assert(chuppah.parts.filter((q) => q.shape === "cylinder" && near(topOf(q), 2600)).length === 4, "the chuppah stands on four poles to 2600");
  const chandelier = ofId("p-chandelier")[0];
  assert(near(chandelier.instances[0].at.z, 2600), "the chandelier hangs at its row's 2600");
  // Its chain runs from its top (2600 + 600) to the hall's 4 m ceiling.
  assert(chandelier.parts.some((q) => q.shape === "cylinder" && near(topOf(q) + 2600, 4000)), "…on a chain that reaches the ceiling");
  const curtain = ofId("p-curtain")[0];
  const ribbon = curtain.parts.find((q) => q.shape === "ribbon");
  assert(!!ribbon && near((ribbon as { h: number }).h, 4000), "the curtain falls the hall's full 4 m along its wall");
  assert(ribbon!.shape === "ribbon" && ribbon!.path.every((q) => q.x > 100), "…hung on the room's side of the wall, not inside it");
  // 2026-11-07: a wall with a typed height lower than the room's ceiling caps the curtain on it.
  const lowWall = fixtureInput(true);
  const capped = buildScene({ ...lowWall, structure: { ...lowWall.structure, walls: lowWall.structure.walls.map((w) => (w.id === "w-left" ? { ...w, heightMm: 3200 } : w)) } });
  const cappedRibbon = capped.nodes.filter((n): n is BodyNode => n.kind === "body" && n.tag.id === "p-curtain").flatMap((b) => b.parts).find((q) => q.shape === "ribbon");
  assert(!!cappedRibbon && near((cappedRibbon as { h: number }).h, 3200), "a curtain hangs from the lower of the ceiling and its wall's own height");
  assert(wallCurtainTop(4000, 3200) === 3200 && wallCurtainTop(0, 2800) === 2800 && wallCurtainTop(4000, undefined) === 4000 && wallCurtainTop(0, undefined) === undefined, "…the lower of the two; open sky and no height leaves it to the row");
  // A curtain on a ROD (lib/studio/rail.ts): under the rod at its 2.4 m, a post at its start and its
  // bend, none under the ר's arm.
  const rodCurtain = ofId("p-rod-curtain")[0];
  const rodCloth = rodCurtain?.parts.find((q) => q.shape === "ribbon");
  assert(!!rodCloth && near((rodCloth as { h: number }).h, 2400), "a rod's curtain falls from the rod's 2.4 m");
  const rodPosts = rodCurtain.parts.filter((q) => q.shape === "box");
  assert(rodPosts.length === 2 && !rodPosts.some((q) => near(q.at.y, 9500)), `two posts, none under the cantilevered arm (got ${rodPosts.length})`);
  // PERGOLAS (lib/venues/pergola.ts, 2026-11-07): the venue's on the terrace and a hired one in the
  // hall are one body (./floor-kinds.ts pergolaBody) — posts, beams, a roof — at their heights.
  const venuePergola = ofId("feature:f-pergola")[0];
  const pergolaTop = (b: BodyNode) => Math.max(...b.parts.map((q) => topOf(q as { shape: string; at: { z: number }; h?: number })));
  assert(!!venuePergola && venuePergola.parts.filter((q) => q.shape === "box" && q.w === 150 && q.d === 150).length === 4 && near(pergolaTop(venuePergola), 2600), "the terrace's pergola: four posts, its slats ending at 2.6 m");
  const hiredPergola = ofId("p-pergola").find((b) => b.tag.type === "item")!;
  assert(!!hiredPergola && hiredPergola.parts.filter((q) => q.shape === "box" && q.w === 120 && q.d === 120).length === 4 && hiredPergola.parts.some((q) => q.shape === "plane"), "the hired pergola: its row's 12cm posts, laid 4 × 3, under its cloth");
  // What is overhead decides the chain (lib/venues/roofs.ts): under the terrace's pergola an
  // arrangement hangs 1.2 m under its 2.6 m top and is chained to it — never to the hall's 4 m roof.
  const hung = ofId("p-hung")[0];
  assert(!!hung && near(hung.instances[0].at.z, 2600 - 1200) && hung.parts.some((q) => q.shape === "cylinder" && near(topOf(q) + hung.instances[0].at.z, 2600)), "an arrangement hung under the pergola is chained to the pergola");
  // A curtain on the pergola's front side (a SIDE rail): from its 2.6 m, a hand outside it.
  const pergolaCloth = ofId("p-pergola-curtain")[0]?.parts.find((q) => q.shape === "ribbon");
  assert(!!pergolaCloth && pergolaCloth.shape === "ribbon" && near(pergolaCloth.h, 2600) && pergolaCloth.path.every((q) => q.y < 5600 - 1500), "a curtain on the pergola's side falls from its top, outside it");

  // ── what glows ────────────────────────────────────────────────────────────────────────────────
  const emitters = scene.nodes.filter((n) => n.kind === "emitter");
  // 5 + 7 + 9 candles and a lamp on the tables, 8 bulbs on the chandelier.
  assert(emitters.length === 5 + 7 + 9 + 1 + 8, `every candle, the lamp and the chandelier's bulbs glow (got ${emitters.length})`);
  assert(emitters.every((e) => e.at.z > 750), "…all above the table tops");

  // ── privacy ───────────────────────────────────────────────────────────────────────────────────
  const json = JSON.stringify(scene);
  for (const word of ["unitPrice", "supplierId", String(SECRET_PRICE)]) {
    assert(!json.includes(word), `the scene carries no ${word}`);
  }
  const client = buildScene(fixtureInput(false));
  assert(!client.nodes.some((n) => n.kind === "label"), "a client sees no labels");

  console.log(`scene ok: ${scene.stats.bodies} bodies, ${scene.stats.instances} instances, ${scene.stats.emitters} emitters`);
}
