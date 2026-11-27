// npm run check:chuppah — the self-check of ./chuppah.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { CHUPPAH_PROFILES, chuppahDrawOf, chuppahLayout, chuppahOf, chuppahPatch, eaveOf } from "./chuppah";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// No spec: the chuppah it always was.
const plain = chuppahLayout(3000, 3000, false, chuppahOf(undefined));
assert(plain.posts.length === 4 && near(Math.abs(plain.posts[0].x), 1500 - 135 * 1.6) && plain.planPostR === 135, "a plain 3×3: four posts pole·1.6 in from the corners, the plan's pole m·0.045");
assert(plain.postR === 30 && plain.eave === 1, "…built 6 cm thick in the room, the cloth at the top");
assert(plain.spots.length === 2 && plain.spots.every((s) => s.y > 0 && near(s.z, 2 / 3) && near(s.size, 840)), "…posies on the two front posts at two thirds of the height");
const roundPlain = chuppahLayout(3000, 3000, true, chuppahOf(undefined));
const deg = roundPlain.posts.map((p) => Math.round((Math.atan2(p.y, p.x) * 180) / Math.PI)).sort((a, b) => a - b);
assert(JSON.stringify(deg) === JSON.stringify([-135, -45, 45, 135]) && near(Math.hypot(roundPlain.posts[0].x, roundPlain.posts[0].y), 1500 * 0.82), "a round one: four posts at 45° steps on 0.82 of the radius");

// The spec.
assert(chuppahLayout(3000, 3000, true, chuppahOf({ posts: 0 })).posts.length === 0, "posts 0: hung, no posts");
const six = chuppahLayout(3000, 3000, true, chuppahOf({ posts: 6 }));
assert(six.posts.length === 6 && six.posts.every((p) => Math.abs(p.x) > 1), "six posts on a ring, none at the front's middle");
const hex = Array.from({ length: 6 }, (_, i) => ({ x: 1500 * Math.cos((i * Math.PI) / 3), y: 1500 * Math.sin((i * Math.PI) / 3) }));
assert(chuppahLayout(3000, 2600, false, chuppahOf(undefined), hex).posts.length === 6, "a hexagon's corners take its posts");
const long = chuppahLayout(4000, 2400, false, chuppahOf({ posts: 6 }));
assert(long.posts.length === 6 && long.posts.filter((p) => near(p.x, 0)).length === 2, "six on a long rectangle: a middle post on each long side");
assert(chuppahLayout(3000, 3000, false, chuppahOf({ finish: "acrylic" })).postR === 50, "a clear acrylic post is 10 cm");
assert(chuppahLayout(3000, 3000, false, chuppahOf({ flowers: "corners" })).spots.length === 4, "flowers on every post's top");
const asym = chuppahLayout(3000, 3000, false, chuppahOf({ flowers: "asym" }));
assert(asym.spots.length === 2 && asym.spots[0].x < 0 && asym.spots[0].y > 0 && asym.spots[1].x > 0 && asym.spots[1].y < 0, "two clusters on opposite corners");
assert(chuppahLayout(3000, 3000, false, chuppahOf({ meadow: true })).meadow.length === 4, "a meadow at every post's foot");

// The roof's section.
assert(eaveOf(undefined) === 1 && near(eaveOf(CHUPPAH_PROFILES.dome), 0.72, 0.03) && near(eaveOf(CHUPPAH_PROFILES.peak), 0.78, 0.011), "the eave is where the profile turns in");
const dome = chuppahLayout(3000, 3000, true, chuppahOf({ flowers: "corners", profile: CHUPPAH_PROFILES.dome }));
assert(dome.spots.every((s) => near(s.z, dome.eave)), "…and the corner flowers sit at the eave, under the dome");

// The patch keeps only what differs.
assert(chuppahPatch(undefined, { roof: "cloth", flowers: "front", finish: "metal" }) === undefined, "a plain chuppah stores nothing");
assert(JSON.stringify(chuppahPatch({ roof: "flowers" }, { drapes: true })) === JSON.stringify({ roof: "flowers", drapes: true }), "a patch adds to what is there");
assert(chuppahDrawOf({ shape: "circle", content: "none" }) === undefined && chuppahDrawOf({ shape: "circle", content: "none", revolve: CHUPPAH_PROFILES.peak })?.profile === CHUPPAH_PROFILES.peak, "the draw is the spec and the base's body");
console.log("chuppah self-check passed");
