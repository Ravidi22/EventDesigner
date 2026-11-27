// npm run check:flower-cover — the self-check of ./flower-cover.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { COVER_MAX_SPOTS, coverSpots, insidePoly, polyArea, spiralOutline, type CoverPoint } from "./flower-cover";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
const circle = (r: number, n = 48, cx = 0, cy = 0): CoverPoint[] => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((i * 2 * Math.PI) / n), y: cy + r * Math.sin((i * 2 * Math.PI) / n) }));
const o = { step: 70, inset: 22, seed: 5 };

// A disc: covered rim to middle, the middle deepest, every spot looking out from the middle.
const disc = coverSpots([{ poly: circle(300) }], o);
assert(disc.spots.length > 50 && disc.spots.every((s) => Math.hypot(s.x, s.y) <= 300), `a ⌀60 disc is covered inside its outline (${disc.spots.length} heads)`);
assert(Math.abs(disc.depth[0] - 300) < 80, `…its middle the deepest (${Math.round(disc.depth[0])})`);
assert(disc.spots.filter((s) => Math.hypot(s.x, s.y) > 60).every((s) => s.nx * s.x + s.ny * s.y > 0), "…and the way out of a disc is away from its middle");
const rimCount = disc.spots.filter((s) => s.rim).length;
assert(Math.abs(rimCount - Math.round((2 * Math.PI * 300) / 70)) <= 2, `…its rim row a head apart all the way round (${rimCount})`);
assert(disc.spots.every((a) => disc.spots.every((b) => a === b || Math.hypot(a.x - b.x, a.y - b.y) >= 70 * 0.72 - 1e-6)), "no two heads on one spot");
assert(JSON.stringify(coverSpots([{ poly: circle(300) }], o)) === JSON.stringify(disc), "the same shape lays out the same twice");

// A ring as a keyhole (outer one way, the hole back the other, a seam between): nothing in the hole.
const outer = circle(400);
const hole = circle(250).reverse();
const ring = coverSpots([{ poly: [...outer, outer[0], hole[hole.length - 1], ...hole, hole[hole.length - 1]] }], o);
assert(ring.spots.length > 40 && ring.spots.every((s) => Math.hypot(s.x, s.y) > 245 && Math.hypot(s.x, s.y) < 405), `a ring is covered on its band and not across its hole (${ring.spots.length})`);
assert(ring.depth[0] < 90, `…a band 15 cm wide is 7.5 deep (${Math.round(ring.depth[0])})`);
assert(ring.spots.some((s) => s.nx * s.x + s.ny * s.y < 0) && ring.spots.some((s) => s.nx * s.x + s.ny * s.y > 0), "…and its heads look out of BOTH its rims, the inner one too");

// A band thinner than a head (a front panel's plan band, the "קו" shape): one row, a garland.
const thin = coverSpots([{ poly: [{ x: -1000, y: -10 }, { x: 1000, y: -10 }, { x: 1000, y: 10 }, { x: -1000, y: 10 }] }], o);
assert(thin.spots.length >= 24 && thin.spots.length <= 34 && thin.spots.every((s) => Math.abs(s.y) <= 10), `a 2 cm band is one row down its length (${thin.spots.length})`);
// Lines only: walked along the drawn lines, never the closing side.
const lines = coverSpots([{ poly: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }], open: true }], o);
assert(lines.spots.length >= 24 && lines.spots.every((s) => s.rim && s.d === 0 && (Math.abs(s.y) < 1e-6 || Math.abs(s.x - 1000) < 1e-6)), `lines are a garland along the lines (${lines.spots.length})`);
assert(lines.depth[0] === 0 && lines.spots[0].u < lines.spots[lines.spots.length - 1].u, "…each head knowing how far along it is");

// Two shapes keep their own spots, and never share one where they touch.
const two = coverSpots([{ poly: circle(200, 32, -150, 0) }, { poly: circle(200, 32, 150, 0) }], o);
assert(two.spots.some((s) => s.shape === 0) && two.spots.some((s) => s.shape === 1), "two shapes are both covered");
// A hall's flower ceiling stays inside the budget: the spacing grows.
const big = coverSpots([{ poly: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 8000 }, { x: 0, y: 8000 }] }], o);
assert(big.spots.length <= COVER_MAX_SPOTS * 1.15 && big.step > 70, `a 12 × 8 m ceiling is held to the budget (${big.spots.length} at ${Math.round(big.step)} mm)`);

// The spiral: a band winding out, inside its size, covered along its whole length.
const sp = spiralOutline(1200, 2.5);
assert(sp.every((p) => Math.abs(p.x) <= 601 && Math.abs(p.y) <= 601) && polyArea(sp) > 0.15 * 1200 * 1200 && polyArea(sp) < 0.6 * 1200 * 1200, "a spiral is a band inside its box, mostly air");
const spiral = coverSpots([{ poly: sp }], o);
assert(spiral.spots.length > 60 && !insidePoly(sp, 0, 0), `…covered along its band (${spiral.spots.length}), its eye open`);
console.log("flower-cover self-check passed");
