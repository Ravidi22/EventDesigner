// npm run check:chandelier — the self-check of ./chandelier.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { profileAt } from "../element/revolve";
import { asksStrands, BEAD, BEAD_STEP, CASCADE, CHANDELIER_PROFILE_FORMS, CHANDELIER_PROFILES, CHANDELIER_TIERS_MAX, chandelierDrawOf, chandelierHint, chandelierOf, chandelierPatch, chandelierTiers, crystalBeads, EMPIRE, equalGlobes, glassFinishOf, globeRise, PENDANT_GLASS, PENDANT_GLASS_FORMS, ringPoint, RINGS, SPIRAL, strandsLabel } from "./chandelier";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;

const plain = chandelierOf(undefined, undefined);
assert(plain.style === "arms" && plain.tiers === 1 && plain.crystals === "drops" && plain.strands === 0, "no style, no spec: arms, one tier, drops");
const crystal = chandelierOf("crystal", undefined);
assert(crystal.tiers === 2 && crystal.crystals === "strands", "a crystal piece is two tiers of strands by itself");
assert(chandelierOf("sputnik", { tiers: 4, crystals: "strands" }).tiers === 1 && chandelierOf("sputnik", { crystals: "strands" }).crystals === "none", "a sputnik takes no tiers and no crystal");
assert(chandelierOf("arms", { tiers: 19 }).tiers === CHANDELIER_TIERS_MAX && chandelierOf("arms", { tiers: 0 }).tiers === 1, `tiers are held to 1–${CHANDELIER_TIERS_MAX}`);
assert(chandelierOf("hoop", { crystals: "drops" }).crystals === "drops", "a hoop may hang drops");
const drums = chandelierOf("drums", undefined);
const prisms = chandelierOf("prisms", undefined);
const empire = chandelierOf("empire", undefined);
assert(drums.tiers === 3 && drums.crystals === "none" && chandelierOf("drums", { crystals: "drops" }).crystals === "none", "drum shades: three tiers, never crystal");
assert(prisms.tiers === 5 && prisms.crystals === "strands" && chandelierOf("prisms", { crystals: "none" }).crystals === "strands", "a cascade of rods: five tiers, its rods are its crystal whatever is asked");
assert(empire.tiers === 1 && empire.crystals === "strands" && chandelierOf("empire", { tiers: 3 }).tiers === 3, "a basket: one ring of strands by itself, stacked when asked");
assert(asksStrands(prisms) && asksStrands(empire) && asksStrands(crystal) && !asksStrands(plain) && !asksStrands(drums), "who is asked for a strand count");
assert(strandsLabel("prisms").startsWith("מוטות") && chandelierHint(prisms).includes("0 = ") && !chandelierHint(chandelierOf("prisms", { strands: 40 })).includes("0 = "), "the hint says what 0 means until a count is typed");

assert(chandelierPatch("crystal", undefined, { tiers: 2 }) === undefined, "the style's own answer is not stored");
assert(JSON.stringify(chandelierPatch("crystal", undefined, { tiers: 3 })) === '{"tiers":3}', "…a different one is");
assert(JSON.stringify(chandelierPatch("arms", { tiers: 3 }, { crystals: "none" })) === '{"tiers":3,"crystals":"none"}', "a patch keeps what was set");
assert(chandelierPatch("drums", undefined, { tiers: 3 }) === undefined && JSON.stringify(chandelierPatch("drums", undefined, { tiers: 4 })) === '{"tiers":4}', "drum shades' own three tiers are not stored, four are");

const one = chandelierTiers(plain, 8);
assert(one.length === 1 && near(one[0].r, 0.74) && near(one[0].z, 0.2) && one[0].count === 8 && one[0].angles[0] === -90 && one[0].h === undefined, "one tier: the plan's ring at 0.74 R, 0.2 h, eight lights from −90°, a ring");
assert(chandelierTiers(plain, 1)[0].count === 3 && chandelierTiers(plain, 0)[0].count === 8, "never under three lights; no count = eight");
const three = chandelierTiers(chandelierOf("arms", { tiers: 3 }), 12);
assert(three.length === 3 && three[0].r > three[1].r && three[1].r > three[2].r && three[0].z < three[1].z && three[1].z < three[2].z, "three tiers taper upward");
assert(three[0].count === 12 && three[1].count === 10 && three[2].count === 8, `…with fewer lights each (${three.map((t) => t.count).join(",")})`);
assert(near(three[1].angles[0] - -90, 180 / three[1].count), "…the second tier turned half a step");
assert(near(chandelierTiers(chandelierOf("hoop", undefined), 8)[0].r, 0.9), "a hoop's ring is at 0.9 R");

// A cascade widens UPWARD: the top tier the plan's circle, the lowest CASCADE.taper of it, every
// tier a band of its share of the body.
const cascade = chandelierTiers(drums, 8);
assert(cascade.length === 3 && near(cascade[2].r, 1) && near(cascade[0].r, CASCADE.taper) && cascade[0].z < cascade[1].z && cascade[1].z < cascade[2].z, `drum shades: three bands, the top the plan's circle, the lowest ${CASCADE.taper} of it`);
const share = (CASCADE.top - CASCADE.bottom) / 3;
assert(near(cascade[0].z, CASCADE.bottom) && near(cascade[2].z + (cascade[2].h ?? 0), CASCADE.top - share * (1 - CASCADE.band)) && cascade.every((t) => near(t.h ?? 0, share * CASCADE.band)), "…sharing the body between 0.15 h and 0.95 h with a gap under every band");
assert(cascade[2].count === 8 && cascade[0].count < 8 && cascade[0].count >= 3, `…fewer lights in the narrower bands (${cascade.map((t) => t.count).join(",")})`);
const oneDrum = chandelierTiers(chandelierOf("drums", { tiers: 1 }), 8);
assert(oneDrum.length === 1 && near(oneDrum[0].r, 1) && near(oneDrum[0].h ?? 0, (CASCADE.top - CASCADE.bottom) * CASCADE.band), "one drum shade is the whole body at the full radius");
assert(near(chandelierTiers(prisms, 8)[4].r, 0.96) && chandelierTiers(prisms, 8).length === 5, "a cascade of rods hangs just inside the circle, five bands");
const basket = chandelierTiers(empire, 8);
assert(basket.length === 1 && near(basket[0].r, 1) && near(basket[0].z, EMPIRE.ringZ) && basket[0].count === 8, "a basket: its wide ring at 0.78 h, the lights' count");

const drops = crystalBeads(plain, one);
assert(drops.length === 16 && drops.every((b) => b.z < 0.2 && Math.abs(Math.hypot(b.x, b.y) - 0.74) < 1e-6), "drops: two beads under each of eight arm ends");
const strands = crystalBeads(crystal, chandelierTiers(crystal, 8));
const lowerStrands = strands.filter((b) => Math.abs(Math.hypot(b.x, b.y) - 0.84 * 1.05) < 1e-6);
// From 0.17 h down in steps of 0.045 h to the underside's 0.03 h: four beads a strand.
assert(lowerStrands.length === 16 * 4, `strands: sixteen strands on the lowest tier, four beads each down to the underside (${lowerStrands.length})`);
assert(strands.every((b) => b.z >= 0.03 - 1e-9), "…none below the underside");
assert(crystalBeads(chandelierOf("crystal", { strands: 6 }), chandelierTiers(crystal, 8)).filter((b) => Math.abs(Math.hypot(b.x, b.y) - 0.84 * 1.05) < 1e-6).length === 6 * 4, "…six when asked for six");
const garlands = crystalBeads(chandelierOf("arms", { crystals: "garlands" }), one);
assert(garlands.length === 8 * 7 && garlands.every((b) => b.z <= 0.2 && b.z >= 0.1 - 1e-9), "garlands: seven beads swagged between every pair of lights");
assert(crystalBeads(chandelierOf("arms", { crystals: "none" }), one).length === 0, "none: nothing");
assert(crystalBeads(drums, cascade).length === 0, "drum shades hang no crystal");

// Rods: six per light round every band, each the band tall, standing on the band's bottom.
const rodTiers = chandelierTiers(prisms, 8);
const rods = crystalBeads(prisms, rodTiers);
assert(rods.length === rodTiers.reduce((n, t) => n + t.count * 6, 0) && rods.every((b) => b.h !== undefined && near(b.h, rodTiers[0].h ?? 0)), `rods: six per light on every band, each the band tall (${rods.length})`);
assert(rods.filter((b) => near(b.z, rodTiers[4].z)).every((b) => near(Math.hypot(b.x, b.y), 0.96)), "…the top band's rods on its circle");
assert(crystalBeads(chandelierOf("prisms", { strands: 20 }), rodTiers).length === 20 * 5, "…twenty a band when asked for twenty");

// A basket: every strand from the ring (never outside it) in to the small ring, half of them on up
// to the crown, the fringe and the cluster.
const bag = crystalBeads(empire, basket);
const inBag = bag.filter((b) => b.z < EMPIRE.ringZ && b.z >= EMPIRE.bottomZ - 1e-9 && b.r === BEAD);
const perStrand = inBag.length / EMPIRE.strands;
assert(perStrand >= 13 && perStrand <= 15 && inBag.every((b) => Math.hypot(b.x, b.y) <= EMPIRE.ringR * 1.03 + 1e-9), `a basket: thirty-two strands of ${perStrand} beads from the ring in to the small ring`);
const lowest = inBag.filter((b) => b.z < EMPIRE.bottomZ + BEAD_STEP);
assert(lowest.length > 0 && lowest.every((b) => Math.hypot(b.x, b.y) < EMPIRE.bottomR + 0.06), "…sweeping in to the small ring at the bottom");
const tent = bag.filter((b) => b.z > EMPIRE.ringZ);
assert(tent.length === (EMPIRE.strands / 2) * 4 && tent.every((b) => Math.hypot(b.x, b.y) >= EMPIRE.crownR - 1e-9), `…every other strand carried up to the crown, four beads each (${tent.length})`);
assert(bag.some((b) => near(b.z, 0.06) && near(b.r, BEAD * 2)) && bag.every((b) => b.z >= 0.03), "…a pear under the cluster, nothing under the underside");
assert(crystalBeads(chandelierOf("empire", { strands: 16 }), basket).filter((b) => near(b.z, EMPIRE.ringZ - 0.03)).length === 16, "…sixteen strands when asked for sixteen");

// THE SILHOUETTE (the base's body): it shapes the tiers, never a style it means nothing to.
assert(near(profileAt(CHANDELIER_PROFILES.cone, 0), 1) && near(profileAt(CHANDELIER_PROFILES.cone, 1), 0.35) && near(profileAt([{ r: 0.5, z: 0 }, { r: 0.5, z: 1 }], 0.4), 1), "a silhouette is read as a share of its widest ring");
for (const f of CHANDELIER_PROFILE_FORMS) assert(CHANDELIER_PROFILES[f].some((p) => p.r === 1) && CHANDELIER_PROFILES[f][0].z === 0 && CHANDELIER_PROFILES[f].at(-1)!.z === 1, `${f}: reaches the plan's circle and runs foot to top`);
assert(!chandelierOf("sputnik", { profile: CHANDELIER_PROFILES.cone }).profile && !!chandelierOf("prisms", { profile: CHANDELIER_PROFILES.spindle }).profile, "only a tiered style or a spiral takes a silhouette");
assert(chandelierOf("arms", { tiers: 7 }).tiers === 7 && chandelierOf("prisms", { tiers: 12 }).tiers === CHANDELIER_TIERS_MAX, "up to ten tiers");
const spindle = chandelierTiers(chandelierOf("prisms", { tiers: 9, profile: CHANDELIER_PROFILES.spindle }), 10);
const widest = spindle.reduce((w, t, k) => (t.r > spindle[w].r ? k : w), 0);
assert(spindle.length === 9 && widest > 3 && widest < 8 && spindle[0].r < 0.4 && spindle[8].r < spindle[widest].r, `a spindle of rods: narrow at the tail, widest above the middle, narrower at the top (${spindle.map((t) => t.r.toFixed(2)).join(",")})`);
const tree = chandelierTiers(chandelierOf("arms", { tiers: 4, profile: CHANDELIER_PROFILES.cone }), 16);
assert(tree[0].z === 0.12 && near(tree[3].z, 0.84) && tree.every((t, k) => k === 0 || t.r < tree[k - 1].r) && tree[0].count > tree[3].count, "a cone of arms: four tiers spread over the body, each narrower, fewer lights");
assert(JSON.stringify(chandelierTiers(chandelierOf("arms", { tiers: 3 }), 12)) === JSON.stringify(three), "no silhouette: the old layout to the digit");
assert(chandelierDrawOf({ shape: "circle", content: "none" }) === undefined && chandelierDrawOf({ shape: "circle", content: "none", revolve: CHANDELIER_PROFILES.bell })?.profile?.length === 6, "a row's drawing carries its base's body as the silhouette");

// A basket in tiers: rings stacked, the lowest widest, its bag down to the small ring, a curtain
// from every ring over it down to the ring under it, the tent from the top ring.
const tiered = chandelierOf("empire", { tiers: 3 });
const stack = chandelierTiers(tiered, 8);
assert(stack.length === 3 && near(stack[2].z, EMPIRE.ringZ) && stack[0].r > stack[1].r && stack[1].r > stack[2].r && stack[0].z < stack[1].z, `three baskets stacked (${stack.map((t) => `${t.r.toFixed(2)}@${t.z.toFixed(2)}`).join(" ")})`);
const stackBeads = crystalBeads(tiered, stack);
assert(stackBeads.some((b) => b.z < stack[1].z && b.z > stack[0].z && Math.abs(Math.hypot(b.x, b.y) - stack[1].r) < stack[1].r * 0.08) && stackBeads.every((b) => b.z >= 0.03 - 1e-9), "…the middle ring's curtain hangs down to the lowest");
assert(stackBeads.filter((b) => b.z > stack[2].z).every((b) => Math.hypot(b.x, b.y) <= stack[2].r + 1e-9), "…the tent rises inside the top ring");

// A spiral: a ball at the end of every strand, each lower and further round than the last.
const spiral = chandelierOf("spiral", undefined);
const balls = crystalBeads(spiral, chandelierTiers(spiral, 8)).filter((b) => b.r > BEAD);
assert(balls.length === SPIRAL.strands && balls.every((b, i) => i === 0 || b.z < balls[i - 1].z) && near(balls[0].z, SPIRAL.top) && near(balls.at(-1)!.z, SPIRAL.bottom), `a spiral: ${SPIRAL.strands} balls descending from the plate to the foot`);
assert(Math.hypot(balls[0].x, balls[0].y) > Math.hypot(balls.at(-1)!.x, balls.at(-1)!.y), "…narrowing as it goes down");

// Floating rings: the widest on top, every one leaned its own way, its points on the lean.
const rings = chandelierTiers(chandelierOf("rings", { tiers: 7 }), 8);
assert(rings.length === 7 && near(rings[6].r, RINGS.r) && rings[0].r < rings[6].r && rings.every((t) => Math.abs(t.tiltDeg ?? 0) > 5) && rings.some((t) => (t.tiltDeg ?? 0) < 0), "seven floating rings, the widest on top, each leaned");
const lean = rings[0];
const hi = Math.max(...[0, 90, 180, 270].map((a) => ringPoint(lean, a, 1).z));
const lo = Math.min(...[0, 90, 180, 270].map((a) => ringPoint(lean, a, 1).z));
assert(near(hi - lo, 2 * lean.r * Math.sin((Math.abs(lean.tiltDeg!) * Math.PI) / 180), 1e-6) && near(Math.hypot(ringPoint(lean, lean.turnDeg!, 1).x, ringPoint(lean, lean.turnDeg!, 1).y), lean.r), "…a leaned ring rises by r·sin(tilt) either side, its lean axis level");
// GLASS PENDANTS: the finish is read off the shade; one size or packed; the spec keeps its own.
assert(glassFinishOf("ענבר", "#C8862A") === "tinted" && glassFinishOf("עשן", "#6E6F73") === "tinted" && glassFinishOf("שקוף", "#E8F0F5") === "clear" && glassFinishOf("כרום", "#C9CDD3") === "mirror" && glassFinishOf("חלבי", "#F4F2EE") === "frosted" && glassFinishOf(undefined, "#FAFAFA") === "clear", "a shade's name or swatch says its glass");
assert(glassFinishOf("מטבע", "#B08D57") === "tinted", "…and only the word מט means matt");
const ring5 = equalGlobes(5);
assert(ring5.length === 5 && ring5.every((g) => near(g.r, ring5[0].r) && Math.hypot(g.x, g.y) + g.r <= 1 + 1e-9) && ring5.every((g, i) => ring5.every((q, j) => i === j || Math.hypot(g.x - q.x, g.y - q.y) >= g.r + q.r - 1e-9)), "five equal globes round a ring, none touching, inside the circle");
assert(equalGlobes(1).length === 1 && equalGlobes(9).length === 9 && equalGlobes(9)[0].x === 0, "one in the middle; nine a ring round one");
assert(globeRise(0, 1) === 0 && globeRise(0, 5) === 0 && new Set([0, 1, 2, 3, 4].map((i) => globeRise(i, 5))).size === 5, "a single globe is the underside; a group's drops all differ");
assert(JSON.stringify(chandelierPatch("pendants", undefined, { fitting: "brass", glassMix: true, equal: true })) === '{"fitting":"brass","glassMix":true,"equal":true}' && chandelierPatch("pendants", undefined, { fitting: "black", glassMix: false }) === undefined, "a pendant's metal, mix and size are kept; black and off are its own");
const mixed = chandelierDrawOf({ shape: "circle", content: "none", chandelier: { glassMix: true } }, [
  { id: "a", name: "ענבר", swatch: "#C8862A" },
  { id: "b", name: "עשן", swatch: "#6E6F73", archived: true },
  { id: "c", name: "שקוף", swatch: "#E8F0F5" },
]);
assert(mixed?.palette?.map((p) => p.name).join(",") === "ענבר,שקוף", "a mixed group reads the row's live shades in order");
assert(chandelierOf("pendants", { profile: PENDANT_GLASS.bell }).profile?.length === PENDANT_GLASS.bell.length && PENDANT_GLASS_FORMS.every((f) => PENDANT_GLASS[f].some((p) => p.r === 1)), "a pendant's body is its glass's shape");
console.log("chandelier self-check passed");
