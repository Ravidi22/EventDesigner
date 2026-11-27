// npm run check:plants — the self-check of ./plants.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { TREE_CLUMPS } from "@/components/item-symbol";
import { type LeafCard, type Part } from "./types";
import { CARDS, cardSizeOf, DATES, hedgeParts, insideOf, MAX_HEDGE_BLOBS, PALM_LEAFLETS, PALM_TIERS, palmParts, plantTurn, POT_MATERIAL, potParts, shrubParts, TREE, treeParts, TRUNK } from "./plants";

// ponytail: self-check. Run: npx tsx lib/scene/plants.ts
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
type Blob = Extract<Part, { shape: "blob" }>;
const blobs = (ps: Part[]) => ps.filter((p): p is Blob => p.shape === "blob");

type Leaves = Extract<Part, { shape: "leaves" }>;
const cardsOf = (ps: Part[]) => ps.filter((p): p is Leaves => p.shape === "leaves");

// A tree: a trunk, three limbs, a core of the nine lobes, the middle mass and the crown, and the
// leaf cards over them.
const tree = treeParts(1750, 1750, 4000, "#8fae84");
const trunk = tree[0];
assert(trunk.shape === "cylinder" && near(trunk.h, 0.62 * 4000) && trunk.rTop < trunk.rBottom && trunk.material === TRUNK, "a tree's trunk tapers to 0.62 h, in bark");
const limbs = tree.filter((p) => p.shape === "cylinder" && p.tiltDeg);
assert(limbs.length === 3, "…three limbs lean out into the crown");
const main = blobs(tree);
assert(main.length === TREE_CLUMPS.length + 2, `…a core of the nine lobes, the middle mass and the crown (${main.length})`);
assert(main.every((p) => p.at.z - p.r * TREE.squash >= TREE.crownFrom * 4000 - 1e-6 && p.at.z + p.r * TREE.squash <= 4000 + 1e-6), "every clump stands in the crown band, half way up to the top");
const nine = main.slice(0, TREE_CLUMPS.length);
assert(nine.some((p) => near(Math.hypot(p.at.x, p.at.y) + p.r, TREE.core * 1750, 1e-3)), "…the lobes touching the core's rim, a little inside the plan's");
assert(new Set(main.map((p) => p.seed)).size === main.length, "…each clump its own lumps");
assert(main.every((p) => p.material && p.material.colour !== "#8fae84"), "…the core in a deeper green than the crown — the shade inside it");
const [leaves] = cardsOf(tree);
assert(!!leaves && leaves.material?.kind === "leaves" && leaves.material.colour === "#8fae84", "the crown wears leaf cards in its own green");
assert(leaves.cards.length >= 60 && leaves.cards.length <= CARDS.max, `…enough of them to break the outline, never more than CARDS.max (${leaves.cards.length})`);
const reach = Math.max(...leaves.cards.map((c) => Math.hypot(c.x, c.y) + c.size / 2));
assert(reach > 0.95 * 1750 && reach < 1.25 * 1750, `…reaching the crown's rim from the core (${Math.round(reach)})`);
assert(leaves.cards.every((c) => c.z > 0.4 * 4000 && main.every((b) => insideOf(c, b) >= 0.92)), "…every card out on the surface, none buried in a clump or hanging down the trunk");
assert(leaves.cards.every((c) => c.size >= 0.8 * cardSizeOf(1750) - 1 && c.size <= 1.2 * cardSizeOf(1750) + 1 && c.tile >= 0 && c.tile < 4), "…each a leaf cluster's size, on one of the atlas's four cells");
const upper = leaves.cards.filter((c) => c.z > 0.85 * 4000);
const lower = leaves.cards.filter((c) => c.z < 0.6 * 4000);
const avg = (cs: LeafCard[], f: (c: LeafCard) => number) => cs.reduce((t, c) => t + f(c), 0) / Math.max(1, cs.length);
assert(avg(upper, (c) => c.shade) > avg(lower, (c) => c.shade) && avg(upper, (c) => c.pitchDeg) > avg(lower, (c) => c.pitchDeg), "…lighter and lying back toward the sky at the top, darker and hanging at the bottom");
assert(JSON.stringify(treeParts(1750, 1750, 4000, "#8fae84")) === JSON.stringify(tree), "the same tree twice is the same tree");

// A palm: a ringed trunk, the boot, nineteen arching fronds, three bunches of dates.
const palm = palmParts(2250, 2250, 6000, "#6f9a5a");
const lathe = palm[0];
assert(lathe.shape === "lathe" && near(Math.max(...lathe.profile.map((q) => q.z)), 0.86 * 6000) && lathe.profile.length > 40, "a palm's trunk is a ringed lathe to 0.86 h");
const fronds = palm.filter((p): p is Extract<Part, { shape: "frond" }> => p.shape === "frond");
assert(fronds.length === PALM_TIERS.reduce((s, t) => s + t.n, 0) && fronds.every((f) => f.leaflets === PALM_LEAFLETS), "…its crown three tiers of pinnate fronds");
assert(fronds.every((f) => f.len <= 2250 + 1e-6 && f.len >= 0.7 * 2250), "…each about the crown's radius long");
const lowest = fronds.filter((f) => (f.liftDeg ?? 0) <= 0);
assert(lowest.length === 6 && lowest.every((f) => f.material!.colour !== "#6f9a5a"), "…the lowest tier hangs, yellowing");
assert(blobs(palm).filter((b) => b.material === DATES).length === 3, "…and three bunches of dates under the crown");

// Shrubs, pots, hedges.
const shrub = shrubParts(600, 600, 0, 1000);
const bushy = blobs(shrub);
assert(bushy.length === 6 && bushy.every((p) => p.at.z - p.r * 0.88 >= -1e-6 && p.at.z + p.r * 0.88 <= 1000 + 1e-6), "a shrub: five lobes and a middle mass on the ground, to its height");
assert(cardsOf(shrub).length === 1 && cardsOf(shrub)[0].cards.length >= 12 && cardsOf(shrub)[0].cards.every((c) => c.size >= CARDS.minMm * 0.8 - 1), "…under leaf cards no smaller than a cluster");
const pot = potParts(350, 350, 900);
assert(pot[0].shape === "lathe" && pot[0].material === POT_MATERIAL && blobs(pot).length === 6 && cardsOf(pot).length === 1, "a pot: a terracotta lathe with a shrub in it");
const hedge = hedgeParts(4000, 800, 1200);
const hb = blobs(hedge);
assert(hb.length >= 5 && hb.every((b) => near(b.at.z, 600) && near(b.r * (b.squash ?? 1), 600)), "a hedge: blobs as tall as it, along its length");
assert(near(Math.min(...hb.map((b) => b.at.x)), -1600) && near(Math.max(...hb.map((b) => b.at.x)), 1600) && hb.every((b) => b.at.y === 0), "…from end to end, along its long side");
assert(blobs(hedgeParts(800, 60000, 1200)).length === MAX_HEDGE_BLOBS, "a very long hedge spaces its blobs out");
assert(plantTurn("a", 3000, 3000, 0) !== plantTurn("b", 3000, 3000, 0) && plantTurn("a", 4000, 800, 15) === 15, "round crowns turn by their id; a hedge keeps the plan's turn");
console.log("scene plants ok");
