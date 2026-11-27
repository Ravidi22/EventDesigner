// npm run check:scene-frame — the self-check of ./frame.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { fromTableFrame } from "@/lib/design-document/dressing";
import { type Transform, transform, vec3 } from "./types";
import { applyTransform, compose, fromWorld, headingDeg, rad, roomTransform, seatTransform, toWorld, worldRotationY } from "./frame";

const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const w = toWorld(vec3(1000, 2000, 750));
assert(near(w[0], 1) && near(w[1], 0.75) && near(w[2], 2), "plan (1000, 2000, z 750) is world (1, 0.75, 2): x stays, z becomes up, y becomes depth");

const turned = applyTransform(transform(vec3(0, 0, 0), 90), vec3(1, 0, 0));
assert(near(turned.x, 0) && near(turned.y, 1), "a 90° plan turn carries +x onto +y (down the plan)");
assert(near(Math.sin(worldRotationY(90)), -1), "…and the same turn is −90° about three's +y, so +x lands on +z, which is where plan +y went");

const table = { position: { x: 5000, y: 3000 }, rotation: 30, mirrored: true };
const chip = applyTransform(roomTransform(table, 750), vec3(400, -200, 0));
const ref = fromTableFrame(table, { x: 400, y: -200 });
assert(near(chip.x, ref.x) && near(chip.y, ref.y) && near(chip.z, 750), "a chip on a mirrored, turned table lands where fromTableFrame puts it, at the table's height");

const composed = compose(roomTransform(table, 750), transform(vec3(400, -200, 0), 45, false, 2));
assert(near(composed.at.x, ref.x) && near(composed.at.y, ref.y), "compose places the inner origin where applyTransform does");
assert(near(composed.rotationDeg, 30 - 45), "a mirrored outer turns the inner's rotation the other way");
assert(composed.mirrored === true && composed.scale === 2, "mirror XORs, scale multiplies");
const twice = compose(transform(vec3(0, 0, 0), 0, true), transform(vec3(0, 0, 0), 20, true));
assert(!twice.mirrored && near(twice.rotationDeg, -20), "two mirrors cancel");
const q = applyTransform(composed, vec3(100, 0, 0));
const q2 = applyTransform(roomTransform(table, 750), applyTransform(transform(vec3(400, -200, 0), 45, false, 2), vec3(100, 0, 0)));
assert(near(q.x, q2.x) && near(q.y, q2.y), "a point through the composed transform equals the point through both");

const flat = transform(vec3(0, 0, 0), 0);
const top = seatTransform(flat, { x: 0, y: -900, facingDeg: 90 });
assert(near(top.rotationDeg, 0), "a seat on the −y side facing +y (the table) seats a chair unturned — its front already points +y");
const right = seatTransform(flat, { x: 900, y: 0, facingDeg: 180 });
const front = applyTransform(transform(vec3(0, 0, 0), right.rotationDeg), vec3(0, 1, 0));
assert(near(front.x, -1) && near(front.y, 0), "a seat on the +x side facing −x turns the chair so its front points −x, at the table");
const mirroredTable = transform(vec3(0, 0, 0), 0, true);
const m = seatTransform(mirroredTable, { x: 900, y: 0, facingDeg: 180 });
const mFront = applyTransform(transform(vec3(0, 0, 0), m.rotationDeg, m.mirrored), vec3(0, 1, 0));
assert(near(m.at.x, -900) && near(mFront.x, 1), "on a mirrored table the same seat stands at −x and its chair faces +x — still at the table");

// A leaning head: its top (+z) tips toward its own +y, which its rotation turns on the plan.
const leaning: Transform = { ...transform(vec3(0, 0, 0), -90), tiltDeg: 90 };
const tip = applyTransform(leaning, vec3(0, 0, 1));
assert(near(tip.x, 1) && near(tip.y, 0) && near(tip.z, 0), "a head turned −90 (its +y onto +x) and leant 90° faces +x, lying on its side");
const spun = applyTransform({ ...transform(vec3(0, 0, 0), 0), spinDeg: 90, tiltDeg: 30 }, vec3(1, 0, 0));
assert(near(spun.x, 0) && near(spun.y, Math.cos(rad(30))) && near(spun.z, -Math.sin(rad(30))), "the spin turns the head about its own axis BEFORE the lean");
// Composed into a turned, mirrored table, a leaning, spun head lands where the two frames put it.
for (const outer of [roomTransform(table, 750), roomTransform({ ...table, mirrored: false }, 750)]) {
  const inner: Transform = { ...transform(vec3(120, -40, 300), 35), tiltDeg: 50, spinDeg: 70 };
  const both = compose(outer, inner);
  for (const p of [vec3(10, 0, 0), vec3(0, 10, 0), vec3(0, 0, 10), vec3(7, -3, 5)]) {
    const once = applyTransform(both, p);
    const twice = applyTransform(outer, applyTransform(inner, p));
    assert(near(once.x, twice.x) && near(once.y, twice.y) && near(once.z, twice.z), `compose carries a lean and a spin through ${outer.mirrored ? "a mirrored" : "an unmirrored"} outer`);
  }
}

assert(near(headingDeg({ x: 0, y: 0 }, { x: 0, y: 5 }), 90), "heading toward +y is 90° (down the plan)");
const back = fromWorld(...toWorld(vec3(1234, -567, 890)));
assert(near(back.x, 1234) && near(back.y, -567) && near(back.z, 890), "fromWorld undoes toWorld");
console.log("scene frame ok");
