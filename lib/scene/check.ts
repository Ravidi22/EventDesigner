// `npm run check:scene`: the fixture (./fixture.ts) built by ./build.ts, asserted by hand. Its own
// file because the fixture primes the catalog, which nothing a page imports may do — build.ts is
// imported by the scene screens, this is imported by nobody.
import { isMain } from "../self-check";
import { buildScene } from "./build";
import { fixtureInput, SECRET_PRICE } from "./fixture";
import { DOOR_HEIGHT_MM, KERB_MM } from "./types";

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const scene = buildScene(fixtureInput(true));
  const bodies = scene.nodes.filter((n) => n.kind === "body");
  const byType = (type: string) => bodies.filter((b) => b.tag.type === type);
  const minZ = (parts: { at: { z: number } }[]) => Math.min(...parts.map((q) => q.at.z));
  const topOf = (part: { shape: string; at: { z: number }; h?: number }) => part.at.z + (part.h ?? 0);

  // The envelope.
  assert(byType("floor").length === 2, `two zone floors (got ${byType("floor").length})`);
  assert(byType("ground").length === 1, "one ground plane");
  assert(byType("ceiling").length === 1 && scene.roofedMm === 4000, "the hall has one ceiling at 4 m and it is the tallest roofed zone");
  const wallTops = byType("wall").flatMap((b) => b.parts.map(topOf));
  assert(wallTops.some((h) => Math.abs(h - 4000) < 1), "the hall's walls stand 4 m");
  assert(wallTops.some((h) => Math.abs(h - KERB_MM) < 1), "the terrace's edges are kerbs");
  const door = byType("door");
  assert(door.length >= 1, "the door exists");
  const lintel = door.flatMap((b) => b.parts).find((q) => Math.abs(q.at.z - DOOR_HEIGHT_MM) < 1);
  assert(!!lintel, "the door has a lintel starting at 2.1 m");

  // The dressed table.
  const tops = byType("table");
  assert(tops.length === 3, `three table bodies (got ${tops.length})`);
  const round = tops.find((b) => b.tag.id === "t1")!;
  assert(round.parts.some((q) => q.shape === "extrude" && Math.abs(q.at.z - 720) < 1), "the round table's top is a 30 mm slab whose face is at 750");
  assert(Math.abs(round.instances[0].at.x - 5000) < 1 && Math.abs(round.instances[0].at.y - 5000) < 1, "…standing where the document puts it");
  const cloth = byType("cloth");
  assert(cloth.length === 1 && minZ(cloth[0].parts) < 1, "the cloth falls to the floor");
  const chairs = byType("chair");
  const chairInstances = chairs.reduce((n, b) => n + b.instances.length, 0);
  assert(chairInstances === 26, `ten chairs round the round table and sixteen round the block (got ${chairInstances})`);
  assert(chairs.length === 1 && chairs[0].id.startsWith("i:chair:chiavari"), "…all one instanced body, chiavari in ivory");
  for (const id of ["p-ring", "p-cluster", "p-lamp"]) {
    const b = bodies.find((x) => x.tag.id === id && x.instances.length === 1);
    assert(!!b && Math.abs(b.instances[0].at.z - 750) < 1, `${id} stands on the table top`);
  }
  assert(bodies.some((b) => b.tag.type === "flowers" || b.id.startsWith("i:flower:")), "the arrangement has flowers");
  const emitters = scene.nodes.filter((n) => n.kind === "emitter");
  assert(emitters.length >= 5 + 7 + 9 + 1, `every candle and the lamp glow (got ${emitters.length} emitters)`);
  assert(emitters.every((e) => e.at.z > 750), "…above the table top");
  const labels = scene.nodes.filter((n) => n.kind === "label");
  assert(labels.some((l) => l.text === "1"), "the author sees table 1's number");

  // Privacy.
  const json = JSON.stringify(scene);
  for (const word of ["unitPrice", "supplierId", String(SECRET_PRICE)]) {
    assert(!json.includes(word), `the scene carries no ${word}`);
  }
  const client = buildScene(fixtureInput(false));
  assert(!client.nodes.some((n) => n.kind === "label"), "a client sees no labels");

  console.log(`scene ok: ${scene.stats.bodies} bodies, ${scene.stats.instances} instances, ${scene.stats.emitters} emitters`);
}
