// npm run check:overhead — the self-check of ./overhead.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { CASCADE, CHANDELIER_PROFILES, EMPIRE, FITTING_COLOUR, PENDANT_GLASS, SPIRAL, chandelierOf, chandelierTiers, profileAt } from "@/lib/catalog/chandelier";
import { darkerShade } from "@/lib/catalog/border";
import type { InstanceRequest, ItemBuild } from "./collect";
import { type ItemContext } from "./item-context";
import { flowerBuild } from "./flowers";
import { applyTransform } from "./frame";
import { ENVELOPE, glassMaterial } from "./materials";
import { type Part, vec3 } from "./types";
import { type ClothRun } from "@/lib/studio/ceiling-cloth";
import { BULB, CABLE_R_MM, CANDLE_SLEEVE, ceilingDrapeBody, ceilingUndersideMm, CHAIN_R_MM, CHANDELIER_H_MM, CURTAIN_PLEATS, curtainBody, FAIRY_R_MM, flipPart, flipZ, GLOBE, hungFlowersBody, LAMP_MAX_R_MM, overheadKindBody, partSpan, PLEAT_MM, POST_MM, ROD_R_MM, SAIL_GRID, sailBody, sailGrid, SWAG_ACROSS, SWAG_ONE_ACROSS, SWAG_ONE_ALONG } from "./overhead";

const GLASS = glassMaterial();

// ponytail: self-check. Run: npx tsx lib/scene/overhead.ts
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const ctxOf = (diameterMm: number, heightMm: number, extra: Partial<ItemContext> = {}): ItemContext => ({
  product: undefined,
  resolved: undefined,
  footprint: { kind: "circle", diameterMm },
  widthMm: diameterMm,
  depthMm: diameterMm,
  heightMm,
  tone: "#c9a24a",
  count: 1,
  author: false,
  ...extra,
});
const top = (p: Part) => partSpan(p)[1];
const cylinders = (b: ItemBuild) => b.parts.filter((p): p is Extract<Part, { shape: "cylinder" }> => p.shape === "cylinder");
const crystals = (b: ItemBuild) => b.parts.filter((p) => p.material?.kind === "crystal");
const sleeves = (b: ItemBuild) => cylinders(b).filter((p) => p.material?.colour === CANDLE_SLEEVE);
/** An arm's runs: the frame's leaned rods, as thin as an arm. */
const armRods = (b: ItemBuild) => cylinders(b).filter((p) => p.tiltDeg !== undefined && p.material === b.material && p.rBottom <= 9);

// A ⌀1200 chandelier, 600 high, eight arms: a turned column, eight arms curving out of its collar
// to eight candles at 0.74 R — no ring at the arms (a real one has none) — each lit.
const eight = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8 }));
assert(!eight.parts.some((p) => p.shape === "torus" && near(p.r, 444)), "no ring where the arms end");
assert(armRods(eight).length === 8 * 3, `eight arms, three runs each (${armRods(eight).length})`);
assert(sleeves(eight).length === 8 && sleeves(eight).every((p) => near(Math.hypot(p.at.x, p.at.y), 444) && p.rBottom <= 14), "eight candles at 0.74 R, at their real size");
assert(eight.emitters.length === 8 && eight.emitters.every((e) => e.strength === BULB && e.colour === ENVELOPE.bulb && e.at.z > 120 && near(Math.hypot(e.at.x, e.at.y), 444)), "eight flames glow over the arms' tier");
assert(eight.parts.filter((p) => p.shape === "sphere" && p.material?.kind === "emissive").every((p) => p.shape === "sphere" && p.r <= LAMP_MAX_R_MM), "a flame is a flame's size, never the plan's dot");
const column = eight.parts.find((p): p is Extract<Part, { shape: "lathe" }> => p.shape === "lathe" && p.material === eight.material && p.at.z === 0);
assert(!!column && Math.max(...column.profile.map((q) => q.z)) === 540 && Math.max(...column.profile.map((q) => q.r)) < 1200 * 0.1, "a turned column from the finial up to the crown at 0.9 h, slender");
const crownCup = eight.parts.find((p): p is Extract<Part, { shape: "lathe" }> => p.shape === "lathe" && near(p.at.z, 540));
assert(!!crownCup && near(crownCup.at.z + Math.max(...crownCup.profile.map((q) => q.z)), 600), "the crown joins the column to the top — nothing floats");
// The arms style's crystal is DROPS (lib/catalog/chandelier.ts): a bead and a pear under every
// candle; a garland of beads round the arms' dip at 0.48 R; a crystal finial.
assert(crystals(eight).length > 16 + 16 && crystals(eight).every((p) => partSpan(p)[0] >= -1e-9), `drops, a garland and a finial, all cut crystal, none under the underside (${crystals(eight).length})`);
assert(crystals(eight).filter((p) => p.shape === "sphere" && near(Math.hypot(p.at.x, p.at.y), 288)).length >= 16, "…the garland at 0.48 R");
assert(Math.max(...eight.parts.map(top)) <= 600 + 1e-6 && eight.parts.every((p) => partSpan(p)[0] >= -1e-9), "open sky: nothing above h and nothing under the underside");
assert(eight.material.kind === "metal" && eight.material.colour === "#c9a24a", "a gold chandelier's frame is its metal");
assert(overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, tone: "#f7f6fc" })).material.kind === "glass", "a crystal one's frame is faint glass");

// The chain reaches the ceiling exactly; a long drop is three cables.
const chained = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, chainMm: 1500 }));
const chains = chained.parts.filter((p) => p.shape === "cylinder" && p.at.z === 600);
assert(chains.length === 1 && chains[0].shape === "cylinder" && chains[0].rBottom === CHAIN_R_MM && near(top(chains[0]), 2100), "one chain from h to h + chainMm");
const cabled = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, chainMm: 4000 }));
const cables = cabled.parts.filter((p) => p.shape === "cylinder" && p.at.z === 600);
assert(cables.length === 3 && cables.every((p) => p.shape === "cylinder" && p.rBottom === CABLE_R_MM && near(top(p), 4600)), "a 4 m drop is three cables, each to the ceiling");
assert(sleeves(overheadKindBody("chandelier", ctxOf(800, 500, { count: 3 }))).length === 3, "three arms");
assert(sleeves(overheadKindBody("chandelier", ctxOf(800, 500, { count: 1 }))).length === 3, "never fewer than three (item-symbol.tsx:925)");
assert(sleeves(overheadKindBody("chandelier", ctxOf(800, 500, { count: 0 }))).length === 8, "no count: the plan's eight");
assert(Math.max(...overheadKindBody("chandelier", ctxOf(800, 0, { count: 5 })).parts.map(top)) <= CHANDELIER_H_MM + 1e-6, "no height: 600");

// The styles and the build (lib/catalog/chandelier.ts): a crystal piece is two tiers of strands,
// a three-tier one three tiers of arms; a hoop no arms and cables to every ring; a sputnik rods;
// pendants globes on cables; a linear piece a bar; a floral one foliage and blooms on a hoop.
const tori = (b: ItemBuild) => b.parts.filter((p): p is Extract<Part, { shape: "torus" }> => p.shape === "torus" && p.material?.kind !== "crystal" && p.material?.kind !== "emissive");
const crystal = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, drawStyle: "crystal" }));
assert(tori(crystal).length === 2 && near(tori(crystal)[0].r, 600 * 0.84 * 1.05) && tori(crystal)[0].at.z < tori(crystal)[1].at.z, "a crystal piece: two thin rings that carry its strands, the lower at 0.84 R");
assert(crystal.emitters.length === 8 + 6, `…eight candles below, six above (${crystal.emitters.length})`);
assert(crystals(crystal).length > 60 && crystals(crystal).every((p) => partSpan(p)[0] >= -1e-9), `…strands of cut crystal, none under the underside (${crystals(crystal).length})`);
const threeTier = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 12, drawStyle: "arms", chandelier: { tiers: 3, crystals: "garlands" } }));
assert(sleeves(threeTier).length === 12 + 10 + 8 && armRods(threeTier).length === 3 * 30, `three tiers: thirty arms, thirty candles (${sleeves(threeTier).length})`);
assert(crystals(threeTier).filter((p) => p.shape === "sphere" && Math.abs(p.r - Math.max(5, 0.028 * 600)) < 1e-6).length >= 7 * 30, "…garlands of seven beads between every pair of arms");
assert(crystals(overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, chandelier: { crystals: "none" } }))).length === crystals(eight).length - 8 - 8 * 2, "no drops when asked for none — eight beads and eight two-part pears go; the garland and the finial stay");
const hoop = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, drawStyle: "hoop" }));
assert(armRods(hoop).length === 3 && tori(hoop).length === 1 && near(tori(hoop)[0].r, 540) && hoop.emitters.length === 8 && sleeves(hoop).length === 0, "a hoop: one ring at 0.9 R, eight lamps along its LED strip, no arms, three cables");
assert(hoop.parts.some((p) => p.shape === "torus" && p.material?.kind === "emissive"), "…the strip lit inside it");
// The photographs' three (2026-11-08): drum shades are lit drums, top-widest, with a tail; a cascade
// of rods a faceted crystal bar per rod; a basket three rings and its hundreds of beads.
const drums = overheadKindBody("chandelier", ctxOf(1000, 700, { count: 8, drawStyle: "drums" }));
const drumBands = drums.parts.filter((p): p is Extract<Part, { shape: "cylinder" }> => p.shape === "cylinder" && p.material?.kind === "emissive");
assert(drumBands.length === 3 && drumBands[2].rBottom > drumBands[0].rBottom && near(drumBands[2].rBottom, 500) && drumBands[0].at.z < drumBands[2].at.z, `drum shades: three lit drums, the top the full radius (${drumBands.map((p) => p.rBottom).join(",")})`);
assert(tori(drums).length === 6 && drums.emitters.length === chandelierTiers(chandelierOf("drums", undefined), 8).reduce((n, t) => n + t.count, 0), "…a rim top and bottom of each, its lamps inside");
assert(drums.parts.some((p) => p.shape === "cylinder" && near(p.at.z, 0) && p.material?.kind === "metal") && drumBands[0].material?.colour === darkerShade("#c9a24a", 0.45), "…the rod down to the tail; the cloth a darker cut of the tone, lit");
const prisms = overheadKindBody("chandelier", ctxOf(1200, 1500, { count: 10, drawStyle: "prisms" }));
const rodsOf = cylinders(prisms).filter((p) => p.material?.kind === "crystal" && p.segments === 6 && p.rTop === p.rBottom);
const rodTiers = chandelierTiers(chandelierOf("prisms", undefined), 10);
assert(rodsOf.length === rodTiers.reduce((n, t) => n + t.count * 6, 0) && rodsOf.every((p) => near(p.h, 1500 * (rodTiers[0].h ?? 0))), `a cascade of rods: a faceted crystal bar per rod, each a band tall (${rodsOf.length})`);
assert(tori(prisms).length === 5 && prisms.emitters.length === rodTiers.reduce((n, t) => n + t.count, 0), "…a frame ring on every band, the lamps inside");
assert(armRods(prisms).length === 5 * 4, "…every ring held by four spokes off the rod");
assert(crystals(prisms).some((p) => p.at.z < 1500 * CASCADE.bottom && Math.hypot(p.at.x, p.at.y) < 1), "…a crystal tail under the lowest band, not a bare pole");
const drumOfRods = overheadKindBody("chandelier", ctxOf(600, 300, { count: 8, drawStyle: "prisms", chandelier: { tiers: 1 } }));
assert(cylinders(drumOfRods).every((p) => p.material?.kind === "crystal" || p.at.z >= 300 * (CASCADE.top - (CASCADE.top - CASCADE.bottom) * (1 - CASCADE.band)) - 1 || Math.hypot(p.at.x, p.at.y) > 1), "a single drum of crystal: no rod through the middle of it");
const empireB = overheadKindBody("chandelier", ctxOf(1100, 1100, { count: 8, drawStyle: "empire" }));
assert(tori(empireB).length === 3 && near(tori(empireB)[1].r, 550) && near(tori(empireB)[1].at.z, 1100 * EMPIRE.ringZ), "a basket: crown, wide ring at the full radius, small ring");
assert(crystals(empireB).length > 400 && crystals(empireB).every((p) => partSpan(p)[0] >= -1e-9 && Math.hypot(p.at.x, p.at.y) <= 550 * 1.03 + 1e-6) && empireB.emitters.length === 8, `…hundreds of beads, none outside the ring or under the underside, eight lamps in the bag (${crystals(empireB).length})`);
const empire3 = overheadKindBody("chandelier", ctxOf(1000, 1800, { count: 8, drawStyle: "empire", chandelier: { tiers: 3 } }));
assert(tori(empire3).length === 5 && empire3.emitters.length > 8, "three baskets: crown, three rings, the small ring; lamps in every basket");
const spiralB = overheadKindBody("chandelier", ctxOf(500, 1800, { count: 8, drawStyle: "spiral" }));
const balls = crystals(spiralB).filter((p): p is Extract<Part, { shape: "sphere" }> => p.shape === "sphere" && p.r > 0.03 * 250);
assert(balls.length === SPIRAL.strands && cylinders(spiralB).filter((p) => p.rBottom === 1.2).length === SPIRAL.strands, `a spiral: a ball at the end of each of ${SPIRAL.strands} threads (${balls.length})`);
assert(spiralB.emitters.length >= 3 && spiralB.parts.some((p) => p.shape === "cylinder" && near(p.rBottom, 245) && near(p.at.z, 1800 * SPIRAL.plateZ)), "…hung from a plate the size of the piece, its downlights glowing");
const ringsB = overheadKindBody("chandelier", ctxOf(1000, 1500, { count: 8, drawStyle: "rings", chandelier: { tiers: 7 } }));
const leaned = ringsB.parts.filter((p): p is Extract<Part, { shape: "torus" }> => p.shape === "torus" && p.material === ringsB.material);
assert(leaned.length === 7 && leaned.every((p) => Math.abs(p.tiltDeg ?? 0) > 5) && leaned[6].r > leaned[0].r, "floating rings: seven, each leaned, the widest on top");
assert(ringsB.parts.filter((p) => p.shape === "sphere" && p.material?.colour === GLOBE).length === 7 && armRods(ringsB).length === 7 * 2, "…a lit amber globe in each, two cables to every ring");
const sputnik = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 8, drawStyle: "sputnik" }));
const rods = sputnik.parts.filter((p): p is Extract<Part, { shape: "cylinder" }> => p.shape === "cylinder" && p.tiltDeg !== undefined);
assert(rods.length === 12 && sputnik.emitters.length === 12 && rods.every((p) => near(p.at.z, 300)), "a sputnik: twelve rods from the core at half height, a lamp on each");
assert(rods.some((p) => p.tiltDeg! > 90) && rods.some((p) => p.tiltDeg! < 90) && rods.some((p) => near(p.tiltDeg!, 90)), "…some down, some up, some level");
// Glass pendants (2026-11-08): every globe a glass lathe in its shade, a cap, an Edison bulb round a
// lit filament, its own cord to the canopy; a single globe IS the underside; a mixed group's globes
// take the row's shades in turn; under a ceiling every cord runs to it.
type Lathe = Extract<Part, { shape: "lathe" }>;
const globesOf = (b: ItemBuild) => b.parts.filter((p): p is Lathe => p.shape === "lathe" && Math.max(...p.profile.map((q) => q.r)) >= 40 && p.material?.colour !== "#f6ead2");
const cords = (b: ItemBuild) => cylinders(b).filter((p) => p.rBottom === 2.5 && p.material?.kind !== "emissive");
const pendants = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 6, drawStyle: "pendants" }));
assert(globesOf(pendants).length === 6 && pendants.emitters.length === 6 && cylinders(pendants).filter((p) => p.material?.kind === "emissive").length === 6, "pendants: six glass globes, an Edison filament glowing in each");
assert(cords(pendants).length === 6 && pendants.parts.every((p) => partSpan(p)[1] <= 600 + 1e-9) && Math.min(...globesOf(pendants).map((p) => p.at.z)) === 0, "…each on its own cord, nothing above the top, the lowest at the underside");
const single = overheadKindBody("chandelier", ctxOf(250, 320, { count: 1, drawStyle: "pendants", tone: "#C8862A", chainMm: 2000 }));
const globe = globesOf(single);
assert(globe.length === 1 && globe[0].at.z === 0 && near(Math.max(...globe[0].profile.map((q) => q.r)), 125 * 0.98) && globe[0].material?.kind === "glass" && globe[0].material.colour === "#C8862A", "a single amber globe: the plan's circle, at the underside, in amber glass");
assert(cords(single).length === 1 && near(top(cords(single)[0]), 320 + 2000 - 25) && !single.parts.some((p) => p.shape === "cylinder" && p.rBottom === CHAIN_R_MM), "…its cord up to the canopy at the ceiling — a cord, never a chandelier's chain");
const group = overheadKindBody("chandelier", {
  ...ctxOf(1000, 900, { count: 5, drawStyle: "pendants" }),
  chandelier: { glassMix: true, equal: true, fitting: "brass", palette: [{ name: "ענבר", swatch: "#C8862A" }, { name: "עשן", swatch: "#6E6F73" }, { name: "שקוף", swatch: "#E8F0F5" }, { name: "כרום", swatch: "#C9CDD3" }] },
});
const gl = globesOf(group);
assert(gl.length === 5 && new Set(gl.map((p) => Math.round(Math.max(...p.profile.map((q) => q.r))))).size === 1, "a group of five, all one size");
assert(gl[0].material?.colour === "#C8862A" && gl[1].material?.colour === "#6E6F73" && gl[2].material?.opacity === 0.2 && gl[3].material?.kind === "metal" && gl[4].material?.colour === "#C8862A", "…amber, smoke, clear, chrome, amber again");
assert(new Set(gl.map((p) => p.at.z)).size === 5 && cords(group).every((p) => p.material?.colour === FITTING_COLOUR.brass), "…every one at its own drop, on a brass cord");
const bell = overheadKindBody("chandelier", { ...ctxOf(400, 400, { count: 1, drawStyle: "pendants" }), chandelier: { profile: PENDANT_GLASS.bell } });
assert(globesOf(bell)[0].profile[0].r > 150, "a bell's glass is open underneath, its rim the plan's circle");
const linear = overheadKindBody("chandelier", ctxOf(2400, 600, { count: 5, drawStyle: "linear" }));
const bar = linear.parts.find((p): p is Extract<Part, { shape: "box" }> => p.shape === "box" && p.w > 2000);
assert(!!bar && near(bar.at.z, 420) && !bar.rotDeg && linear.emitters.length === 5, "a linear piece: a bar along its length at 0.7 h, five lamps under it");
assert(!!overheadKindBody("chandelier", ctxOf(600, 600, { count: 5, drawStyle: "linear" })).parts.find((p) => p.shape === "box" && p.rotDeg === 90) === false, "…a square one lies along x");
const floral = overheadKindBody("chandelier", ctxOf(1200, 600, { count: 5, drawStyle: "floral" }));
assert(floral.parts.filter((p) => p.shape === "blob").length === 18 && floral.parts.filter((p) => p.shape === "bloom").length === 25 && floral.emitters.length === 5, "a floral hoop: eighteen clumps, twenty-five blooms, five lights");

// THE SILHOUETTE: the base's body shapes the tiers — a cone of arms narrows upward, a spindle of
// rods widens and narrows — and never stands in the room as a solid of its own.
const cone = overheadKindBody("chandelier", ctxOf(1500, 1300, { count: 16, chandelier: { tiers: 4, profile: CHANDELIER_PROFILES.cone } }));
const coneR = [...new Set(sleeves(cone).map((p) => Math.round(Math.hypot(p.at.x, p.at.y))))].sort((a, b) => b - a);
assert(coneR.length === 4 && near(coneR[0], 750 * 0.74 * profileAt(CHANDELIER_PROFILES.cone, 0.12), 1), `a cone of arms: four tiers of candles, the lowest widest (${coneR.join(",")})`);
assert(!cone.parts.some((p) => p.shape === "lathe" && Math.max(...p.profile.map((q) => q.r)) > 750 * 0.5), "…and no solid the size of the piece");

// A hung dome: the same heads as on a table, upside down.
const product = {
  id: "p-hung",
  name: "ורדים ואקליפטוס תלויים",
  category: "flower-arrangements",
  layer: "ceiling" as const,
  dimensions: { diameterMm: 600, heightMm: 400 },
  categoryFields: {},
  styleTags: [],
  variants: [],
  flowers: [
    { id: "l1", name: "ורד", qty: 30 },
    { id: "l2", name: "אקליפטוס", qty: 10 },
  ],
};
const spec = flowerDrawSpecOf(product, { kind: "circle", diameterMm: 600 }, "#e8bcce");
assert(spec.form === "dome", `a 40 cm arrangement is a dome (${spec.form})`);
// A head's centre: a ball and a bloom are both built about their own middle (flowers.ts headPart).
const centreOf = (r: InstanceRequest) => r.at.at.z + r.parts[0].at.z;
const upright = flowerBuild(spec, 400, { type: "flowers" });
const hung = hungFlowersBody(ctxOf(600, 400, { flowers: spec }));
const heads = hung.instanced.filter((r) => r.key.startsWith("flower:"));
assert(heads.length > 5, `a ⌀60 hung dome has heads (${heads.length})`);
assert(heads.every((r) => centreOf(r) >= 0 && centreOf(r) <= 400), "every head's centre is between the underside and the top");
const lowest = heads.reduce((a, b) => (centreOf(b) < centreOf(a) ? b : a));
const nearest = heads.reduce((a, b) => (Math.hypot(b.at.at.x, b.at.at.y) < Math.hypot(a.at.at.x, a.at.at.y) ? b : a));
assert(lowest === nearest, "the head nearest the middle hangs lowest — the dome law, inverted");
const upHeads = upright.instanced.filter((r) => r.key.startsWith("flower:"));
assert(upHeads.length === heads.length && upHeads.every((r, i) => r.key === heads[i].key && near(centreOf(r) + centreOf(heads[i]), 400)), "every head is the table's head mirrored about H/2, keyed the same (one geometry for both)");
const looks = (r: InstanceRequest) => applyTransform({ ...r.at, at: vec3(0, 0, 0) }, vec3(0, 0, 1)).z;
const hungBlooms = heads.filter((r) => r.parts[0].shape === "bloom");
assert(hungBlooms.length > 5 && hungBlooms.every((r, i) => near(looks(r), -looks(upHeads.filter((u) => u.parts[0].shape === "bloom")[i]), 1e-9)), "a hung bloom turns over with its arrangement: it looks down as far as the upright one looks up");
const disc = hung.parts.find((p) => p.shape === "cylinder" && near(p.rBottom, 300));
assert(!!disc && near(disc.at.z, 370) && near(top(disc), 400) && disc.material?.kind === "foliage", "a foliage disc the footprint's width at the top");
assert(hung.parts.every((p) => p.shape === "blob" || p.shape === "leaves" || partSpan(p)[0] >= 400 * 0.3 - 1e-9), "every part (the disc, any stem) is in the upper mass, not among the hanging heads — the filler and the leaves round it flip with it");
const leafy = hung.parts.find((p): p is Extract<Part, { shape: "blob" }> => p.shape === "blob");
assert(!!leafy && near(partSpan(leafy)[0], 400 - 400 * 0.8, 400 * 0.05), "…and the filler the heads sit in hangs from the top, flipped with them, its underside above the lowest heads");
const leaves = hung.instanced.filter((r) => r.key.startsWith("leaf:"));
assert(
  leaves.length > 0 &&
    leaves.every((r) => {
      const [lo, hi] = partSpan(r.parts[0]);
      return near(r.at.at.z, 400 - 400 * 0.45 - hi - lo);
    }),
  "the leaves droop at 0.55 h from the top, moved by their own span",
);
const hungChained = hungFlowersBody(ctxOf(600, 400, { flowers: spec, chainMm: 2000 }));
const cable = hungChained.parts.filter((p) => p.shape === "cylinder" && p.at.z === 400);
assert(cable.length === 1 && near(top(cable[0]), 2400), "a hung arrangement's cable reaches the ceiling");
const cascade = hungFlowersBody(ctxOf(600, 400, { flowers: { ...spec, form: "cascade", seed: 3 } }));
const cHeads = cascade.instanced.filter((r) => r.key.startsWith("flower:"));
const fall = cHeads.filter((r) => r.at.at.x > 150).sort((a, b) => a.at.at.x - b.at.at.x);
const massLevel = 400 - 400 * Math.sqrt(1 - (0.85 / 1.1) ** 2);
assert(fall.length >= 3 && centreOf(fall[fall.length - 1]) < centreOf(fall[0]) && centreOf(fall[fall.length - 1]) < 400 * 0.2, "a hung cascade's fall trails DOWN to the underside at its tip (not up, as the plain flip would have it)");
assert(fall.every((r) => centreOf(r) <= massLevel + 1e-6) && cHeads.every((r) => centreOf(r) >= -1e-9 && centreOf(r) <= 400), "…from the inverted rim's level, and every head's centre stays between the underside and the top");
const ball = hungFlowersBody(ctxOf(500, 500, { chainMm: 1000 }));
assert(ball.parts.some((p) => p.shape === "sphere" && p.r === 250 && p.at.z === 250) && ball.material.kind === "foliage", "no spec: a foliage ball at the top");
assert(ball.parts.some((p) => p.shape === "cylinder" && p.at.z === 500 && near(top(p), 1500)), "…on its cable");

// flipZ on every shape.
const every: Part[] = [
  { shape: "box", w: 10, d: 10, h: 100, at: vec3(0, 0, 50), tiltDeg: 20 },
  { shape: "cylinder", rTop: 5, rBottom: 10, h: 100, at: vec3(0, 0, 0) },
  { shape: "sphere", r: 20, at: vec3(0, 0, 300) },
  { shape: "torus", r: 50, tube: 5, at: vec3(0, 0, 100) },
  { shape: "extrude", outline: { outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }, h: 40, at: vec3(0, 0, 10) },
  { shape: "lathe", profile: [{ r: 10, z: 0 }, { r: 20, z: 50 }, { r: 5, z: 80 }], at: vec3(0, 0, 100) },
  { shape: "plane", outline: { outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }, at: vec3(0, 0, 250) },
  { shape: "ribbon", path: [{ x: 0, y: 0 }, { x: 100, y: 0 }], h: 60, at: vec3(0, 0, 20) },
];
const flipped = flipZ({ parts: every, material: GLASS, instanced: [], emitters: [{ at: vec3(1, 2, 30), radiusMm: 5, colour: "#fff", strength: 1 }] }, 400);
every.forEach((p, i) => {
  const [lo, hi] = partSpan(p);
  const [flo, fhi] = partSpan(flipped.parts[i]);
  assert(near(flo, 400 - hi) && near(fhi, 400 - lo), `${p.shape}: spans [${lo}, ${hi}] → [${400 - hi}, ${400 - lo}] (got [${flo}, ${fhi}])`);
});
const fc = flipped.parts[1];
assert(fc.shape === "cylinder" && fc.rTop === 10 && fc.rBottom === 5, "a tapered cylinder swaps its radii");
const fb = flipped.parts[0];
assert(fb.shape === "box" && fb.tiltDeg === -20, "a lean tips the other way");
const fl = flipped.parts[5];
assert(fl.shape === "lathe" && fl.profile[0].r === 5 && fl.profile[0].z === 0 && fl.profile[2].r === 10 && fl.profile[2].z === 80, "a lathe's profile is read the other way up, still bottom to top");
const fp = flipped.parts[6];
assert(fp.shape === "plane" && fp.side === "down", "a plane that faced up faces down");
assert(near(flipped.emitters[0].at.z, 370), "an emitter flips by its point");

// A curtain along a 4 m wall under a 4 m ceiling.
const curtain = curtainBody([{ x: 0, y: 0 }, { x: 4000, y: 0 }], 4000, "#a98db8", { type: "item" });
const ribbons = curtain.parts.filter((p) => p.shape === "ribbon");
assert(ribbons.length === 1 && ribbons[0].shape === "ribbon" && ribbons[0].h === 4000 && ribbons[0].pleatMm === PLEAT_MM && ribbons[0].amplitudeMm === 62 && ribbons[0].path.length === 2, "one pleated ribbon 4000 high, a pleat every 150, 62 either side");
assert(curtain.material.kind === "fabric" && curtain.material.colour === "#a98db8", "in the row's cloth");
const rod = curtain.parts.find((p) => p.shape === "cylinder");
assert(!!rod && rod.shape === "cylinder" && rod.at.z === 4030 && rod.h === 4000 && rod.rTop === ROD_R_MM && rod.tiltDeg === 90 && near(rod.rotDeg ?? 0, -90) && rod.at.x === 0 && rod.at.y === 0, "a rod along the chord at 4030: tilted flat from the path's start, turned to lie along +x");
const slanted = curtainBody([{ x: 0, y: 0 }, { x: 0, y: 3000 }], 2800, "#a98db8", { type: "item" }).parts.find((p) => p.shape === "cylinder");
assert(!!slanted && slanted.shape === "cylinder" && near(slanted.rotDeg ?? 0, 0) && slanted.h === 3000, "a wall down the plan needs no turn: a tilted cylinder already lies along +y");
assert(curtainBody([{ x: 0, y: 0 }], 3000, "#a98db8", { type: "item" }).parts.length === 0, "a path of one point is no curtain");
// 2026-11-07: a style is its pleat, a drop stops the cloth short of the floor, a rod brings posts.
const sheer = curtainBody([{ x: 0, y: 0 }, { x: 4000, y: 0 }], 4000, "#ffffff", { type: "item" }, { style: "sheer", dropMm: 2500 }).parts.find((p) => p.shape === "ribbon");
assert(!!sheer && sheer.shape === "ribbon" && sheer.pleatMm === CURTAIN_PLEATS.sheer.pleatMm && sheer.h === 2500 && sheer.at.z === 1500, "a sheer curtain's long soft pleat, its cloth 2.5 m down from a 4 m rail");
assert(curtainBody([{ x: 0, y: 0 }, { x: 4000, y: 0 }], 3000, "#ffffff", { type: "item" }, { dropMm: 9000 }).parts.find((p) => p.shape === "ribbon")?.h === 3000, "a drop longer than the height is to the floor");
const onRod = curtainBody([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }], 2400, "#ffffff", { type: "item" }, { posts: [{ x: 0, y: 0 }, { x: 3000, y: 0 }] });
const posts = onRod.parts.filter((p) => p.shape === "box");
assert(posts.length === 2 && posts.every((p) => p.shape === "box" && p.at.z === 0 && p.h > 2400), "a rod's two posts stand from the floor past the rod, none under its arm");
assert(posts.every((p) => p.shape === "box" && p.w === POST_MM) && onRod.parts.some((p) => p.shape === "cylinder" && p.rTop === ROD_R_MM), "…the 3 cm rod on 5 cm posts it always was, with no thickness typed");
// A BARE ROD (2026-11-13 — the built-in מוט וילון placed by itself): the rod and its posts, no cloth,
// at its typed thickness.
const bareRod = curtainBody([{ x: 0, y: 0 }, { x: 3000, y: 0 }], 2400, "#ffffff", { type: "item" }, { posts: [{ x: 0, y: 0 }, { x: 3000, y: 0 }], bare: true, rodMm: 80, postMm: 100, rodColour: "#c9a24a" });
assert(!bareRod.parts.some((p) => p.shape === "ribbon") && bareRod.parts.filter((p) => p.shape === "box").length === 2, "a bare rod has no cloth — two posts and a rod");
assert(bareRod.parts.some((p) => p.shape === "cylinder" && p.rTop === 40) && bareRod.parts.every((p) => p.shape !== "box" || p.w === 100), "…an 8 cm rod on 10 cm posts when that is what was typed");
assert(onRod.parts.filter((p) => p.shape === "cylinder").length === 2, "…and the rod bends round its corner, one length per stretch");

assert(ceilingUndersideMm(4000, 600) === 2800, "under a 4 m ceiling a chandelier's underside is at 2.8 m");
assert(ceilingUndersideMm(null, 600) === 3000, "under open sky it hangs at 3 m");
assert(ceilingUndersideMm(800, 600) === 0, "…and never below the floor");

// 2026-11-07: a SAIL — a 4 × 3 m quad tied at 3 m, 3.2 m, 2.6 m and 2.8 m, sagging 40 cm; one post.
const quad = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];
const sail = sailBody({ polygon: quad, heights: [3000, 3200, 2600, 2800], sagMm: 400, posts: [quad[2]] }, "#f4f1ea");
const sheet = sail.parts.find((p): p is Extract<Part, { shape: "sheet" }> => p.shape === "sheet")!;
const g = sheet.rows;
assert(!!sheet && g.length === SAIL_GRID + 1 && g.every((r) => r.length === SAIL_GRID + 1), "a sail is one sheet, a 12 × 12 grid");
assert(near(g[0][0].z, 3000) && near(g[0][SAIL_GRID].z, 3200) && near(g[SAIL_GRID][SAIL_GRID].z, 2600) && near(g[SAIL_GRID][0].z, 2800), "…its corners at their tie heights");
assert(near(g[6][6].z, 2900 - 400) && near(g[6][6].x, 2000) && near(g[6][6].y, 1500), "…its middle 40 cm under the ties' mean");
assert(near(g[0][6].z, 3100), "…every edge taut between its ties");
assert(sail.material.kind === "fabric" && sail.material.colour === "#f4f1ea", "…in its cloth");
const pole = sail.parts.find((p) => p.shape === "cylinder");
assert(!!pole && pole.at.x === 4000 && pole.at.z === 0 && pole.shape === "cylinder" && pole.h > 2600, "a pole from the ground to the tie on a post of its own");
const tri = sailGrid([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 1500, y: 3000 }], [3000, 3000, 3600], 300, 6);
const centroid = tri[2][3];
assert(near(centroid.x, 1500) && near(centroid.y, 1000) && near(centroid.z, 3200 - 300), "a triangle sags at its centroid, under its ties' mean");
assert(partSpan(sheet)[1] === 3200 && flipPart(sheet, 4000).shape === "sheet", "a sheet's span is its grid's");
// A SWAG — a 6 m run at 3.5 m, four scallops, 30 cm of sag, 1.2 m wide.
const run: ClothRun = { a: { x: 0, y: 0 }, b: { x: 6000, y: 0 }, heightMm: 3500, sagMm: 300, widthMm: 1200, waves: 4, lengthMm: 6000, lights: false };
const swag = ceilingDrapeBody([run, { ...run, a: { x: 0, y: 1500 }, b: { x: 6000, y: 1500 } }], "#f3ede2");
const strips = swag.parts.filter((p): p is Extract<Part, { shape: "sheet" }> => p.shape === "sheet");
assert(strips.length === 2 && swag.emitters.length === 0 && swag.parts.length === 2, "a canopy's runs are a swag each, and nothing else without lights");
// …with fairy lights woven in: a warm point and a faint emitter at every light, under the cloth.
const lit = ceilingDrapeBody([{ ...run, lights: true }], "#f3ede2");
const fairy = lit.parts.filter((p): p is Extract<Part, { shape: "sphere" }> => p.shape === "sphere");
assert(fairy.length === 24 && lit.emitters.length === 24 && fairy.every((p) => p.material?.kind === "emissive" && p.at.z < 3500 && p.at.z > 3500 - 300 - 45 - FAIRY_R_MM * 2 - 1e-6), `a lit run: twenty-four fairy lights under its cloth (${fairy.length})`);
assert(lit.emitters.every((e) => e.strength < 0.4), "…each too faint to be taken for a candle");
// ONE SWAG hung from 4 m down to 2.6 m, 70 cm deep (2026-11-13): its line runs from one height to
// the other, the cloth under it, and a light near the low end hangs under the LOW end's line.
const slope: ClothRun = { ...run, heightMm: 4000, heightBMm: 2600, waves: 1, sagMm: 700, lights: true };
const sloped = ceilingDrapeBody([slope], "#f3ede2");
const slopeEdge = sloped.parts.find((p): p is Extract<Part, { shape: "sheet" }> => p.shape === "sheet")!.rows[0];
assert(Math.abs(slopeEdge[0].z - 4000) < 1 && Math.abs(slopeEdge[slopeEdge.length - 1].z - 2600) < 1, "a swag hung end to end at two heights starts at one and ends at the other");
const midCol = slopeEdge[Math.floor(slopeEdge.length / 2)];
assert(Math.abs(midCol.z - (3300 - 700)) < 1, `…its middle its depth under the line between them (${Math.round(midCol.z)})`);
const lastLight = sloped.parts.filter((p): p is Extract<Part, { shape: "sphere" }> => p.shape === "sphere").reduce((a, q) => (q.at.x > a.at.x ? q : a));
assert(lastLight.at.z < 2700 && lastLight.at.z > 2400, `…and its lights ride it down (${Math.round(lastLight.at.z)})`);
const spine = sloped.parts.find((p): p is Extract<Part, { shape: "sheet" }> => p.shape === "sheet")!.rows[SWAG_ONE_ACROSS / 2];
assert(spine.length === SWAG_ONE_ALONG + 1 && spine[SWAG_ONE_ALONG / 2].z < midCol.z - 100 && Math.abs(spine[0].z - 4000) < 1, "…one swag bellies between its edges and is tied tight at its ends");
const mid = strips[0].rows[SWAG_ACROSS / 2];
const atS = (s: number) => mid[Math.round(s * (mid.length - 1))];
assert(near(atS(0).z, 3500) && near(atS(1 / 4).z, 3500) && near(atS(1 / 8).z, 3500 - 300 - 45), "it hangs from its height where gathered and sags in every scallop");
const edge = strips[0].rows[0];
assert(near(Math.abs(edge[0].y), 600 * 0.7) && near(Math.abs(edge[Math.round((edge.length - 1) / 8)].y), 600), "…gathered to 70% of its width, full width mid-scallop");
console.log("scene overhead ok");
