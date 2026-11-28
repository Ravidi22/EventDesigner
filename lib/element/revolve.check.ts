// npm run check:revolve — the self-check of ./revolve.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { addedPoint, cleanRevolve, MIN_R, movedPoint, normalisedRevolve, profileAt, profileTop, removedPoint, REVOLVE_FORMS, REVOLVE_PRESETS, revolveFormOf, revolveProfileMm, revolveSilhouette } from "./revolve";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
for (const form of REVOLVE_FORMS) {
  const p = REVOLVE_PRESETS[form];
  assert(p[0].z === 0 && p[p.length - 1].z === 1 && p.some((q) => q.r === 1), `${form}: runs from the foot to the top and reaches the rim`);
  assert(JSON.stringify(cleanRevolve(p)) === JSON.stringify(p), `${form}: is already sound`);
  assert(revolveFormOf(p) === form, `${form}: is recognised`);
}
assert(revolveFormOf([{ r: 0.5, z: 0 }, { r: 1, z: 1 }]) === null && revolveFormOf(undefined) === null, "a profile of the designer's own is no preset");

const bowl = revolveProfileMm(REVOLVE_PRESETS.bowl, 800, 300);
assert(Math.max(...bowl.map((p) => p.r)) === 800 && bowl[bowl.length - 1].z === 300 && bowl[0].z === 0, "a ⌀1.6 m bowl 30 cm high is turned to those millimetres");
const sil = revolveSilhouette(REVOLVE_PRESETS.cone, 1000, 500, 200, 400);
assert(sil.length === 4 && sil[0].x === 1500 && sil[0].y === 200 && sil[3].x === 500 && sil[3].y === 200 && sil[1].y === 600, "a cone's silhouette: its rim at the foot, its tip at the top, about the axis");

const messy = cleanRevolve([{ r: 1.4, z: 0.5 }, { r: -1, z: 0.2 }, { r: 0.5, z: 2 }]);
assert(messy.length === 3 && messy[0].z === 0 && messy[2].z === 1 && messy[0].r === MIN_R && messy[1].r === 1, "a messy profile is clamped, ordered and pinned to the foot and the top");
assert(cleanRevolve([]).length === 2 && cleanRevolve([{ r: 0.5, z: 0.3 }]).length === 2, "fewer than two points become a cylinder");

const moved = movedPoint(REVOLVE_PRESETS.vase, 2, 0.7, 0.9);
assert(moved[2].r === 0.7 && moved[2].z === 0.75, "a point moved past its neighbour stops at it");
assert(movedPoint(REVOLVE_PRESETS.vase, 0, 0.3, 0.5)[0].z === 0, "the foot stays at the foot");
const added = addedPoint(REVOLVE_PRESETS.cone, 0.6, 0.5);
assert(added.length === 3 && added[1].r === 0.6 && added[1].z === 0.5, "a point is added in height order");
assert(removedPoint(added, 1).length === 2 && removedPoint(REVOLVE_PRESETS.cone, 0).length === 2, "a point is removed, never below two");
// An envelope read by its picture: the radius as a share of the widest, and the top over a point.
assert(Math.abs(profileAt([{ r: 0.5, z: 0 }, { r: 0.5, z: 1 }], 0.4) - 1) < 1e-9 && Math.abs(profileAt(REVOLVE_PRESETS.cone, 1) - 0.05) < 1e-9, "a silhouette is read as a share of its widest ring");
const ball = [{ r: 0.1, z: 0 }, { r: 1, z: 0.5 }, { r: 0.1, z: 1 }];
const mid = profileTop(ball, 0.55)!;
assert(Math.abs(mid.z - 0.75) < 1e-9 && mid.dr < 0 && mid.dz > 0, "a ball's top over half its radius is on its upper half, sloping in as it rises");
assert(profileTop(ball, 0.05)!.z === 1 && profileTop(ball, 1.2) === null, "over the axis the top is the top; past the widest ring there is none");
const tower = [{ r: 0.8, z: 0 }, { r: 1, z: 0.9 }, { r: 0.6, z: 1 }];
assert(profileTop(tower, 0.5)!.z === 1 && Math.abs(profileTop(tower, 0.8)!.z - 0.95) < 1e-9, "a flat top is level; the shoulder slopes off it");
// An envelope's widest ring is the plan's circle (review F3).
const narrow = [{ r: 0.4, z: 0 }, { r: 0.8, z: 0.5 }, { r: 0.2, z: 1 }];
const fixed = normalisedRevolve(narrow);
assert(Math.max(...fixed.map((q) => q.r)) === 1 && fixed.length === 3 && fixed[0].r === 0.5 && fixed[2].r === 0.25 && fixed[1].z === 0.5, "a profile whose widest ring is 0.8 is rescaled to reach 1, its shape kept");
assert(JSON.stringify(normalisedRevolve(REVOLVE_PRESETS.vase)) === JSON.stringify(cleanRevolve(REVOLVE_PRESETS.vase)), "a profile already reaching 1 is unchanged");
console.log("revolve self-check passed");
