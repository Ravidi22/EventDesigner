// npm run check:items — the self-check of ./items.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Footprint } from "@/lib/studio/footprint";
import { resolveFootprint } from "@/lib/studio/footprint";
import type { Product } from "@/lib/catalog/types";
import { SYMBOL_STYLES, type SymbolKind, symbolOf } from "@/lib/catalog/symbols";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { DEFAULT_TONE } from "@/components/item-symbol";
import { type ItemBuild } from "./collect";
import { type ItemContext } from "./item-context";
import { polygonAreaMm2 } from "@/lib/studio/geometry";
import { ENVELOPE } from "./materials";
import { type MaterialRef, type Part, transform, vec3 } from "./types";
import { chairParts, chairRequest, FIRE, itemBody, PLAN_ONLY_STYLES, PLATE_MM, ROD_MM, vesselForm, vesselFormOf, vesselInside, vesselRimShare, WAX } from "./items";

// ponytail: self-check. Run: npm run check:items
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
const ctxOf = (footprint: Footprint, heightMm: number, extra: Partial<ItemContext> = {}): ItemContext => {
  const w = footprint.kind === "circle" ? footprint.diameterMm : footprint.kind === "rect" || footprint.kind === "ellipse" ? footprint.widthMm : 0;
  const d = footprint.kind === "circle" ? footprint.diameterMm : footprint.kind === "rect" || footprint.kind === "ellipse" ? footprint.depthMm : 0;
  return { product: undefined, resolved: undefined, footprint, widthMm: w, depthMm: d, heightMm, tone: DEFAULT_TONE.candlestick, count: 1, author: false, ...extra };
};
const waxCandles = (b: ItemBuild) => b.parts.filter((p) => p.shape === "cylinder" && p.material?.colour === WAX);

// §5.3 — the candle spec (lib/catalog/candles.ts). No spec = the candles it always built.
const ring5 = (extra: Partial<ItemContext>) => itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 400 }, 600, { count: 5, drawStyle: "ring", ...extra }));
const lathesOf = (b: ItemBuild) => b.parts.filter((p) => p.shape === "lathe").length;
assert(lathesOf(ring5({})) === lathesOf(ring5({ candles: undefined })), "(no spec builds what it built)");
assert(lathesOf(ring5({ candles: { guard: "tulip" } })) - lathesOf(ring5({})) === 5, "a tulip guard round each of five candles");
const tallPillar = ring5({ candles: { kind: "pillar", heightMm: 200 } });
assert(waxCandles(tallPillar).some((p) => (p as { h: number }).h > 150), "a pillar candle stands its own real height");
const hadorit = ring5({ candles: { kind: "hadorit" } });
assert(lathesOf(hadorit) >= 5, "a הידורית is a glass cup with its wax in it");
assert(ring5({ candles: { armShape: "s" } }).parts.filter((p) => p.shape === "sphere").length > ring5({}).parts.filter((p) => p.shape === "sphere").length + 40, "S-arms are curves of beads, not bars");
assert(ring5({ candles: { drops: "full" } }).parts.filter((p) => p.shape === "sphere").length - ring5({}).parts.filter((p) => p.shape === "sphere").length === 4 * 8, "full drops: a chain of three and a pear under each of the four arms and between them");
const rods = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 600, depthMm: 160 }, 600, { count: 5, drawStyle: "rods" }));
const rodTops = rods.parts.filter((p) => p.shape === "cylinder" && (p as { rBottom: number }).rBottom === ROD_MM).map((p) => (p as { h: number }).h);
assert(rodTops.length === 5 && new Set(rodTops.map((x) => Math.round(x))).size === 5, "rods on a base: five rods at five heights (stepped)");
assert(lathesOf(rods) === 5, "…each candle in its glass");

// SH-3: which pictures' versions the ROOM builds. Every style of a kind built at one size: a kind in
// PLAN_ONLY_STYLES builds one body whatever its style, every other kind at least two — the editor's
// "plan only" label is true, and turns stale (this fails) the day one of them is built. A curtain is
// built on its rail (build.ts), not here.
for (const [k, set] of Object.entries(SYMBOL_STYLES)) {
  if (!set || k === "curtain") continue;
  const kind = k as SymbolKind;
  const f = set.sample(set.styles[0]);
  const built = (st: string) => JSON.stringify(itemBody(kind, ctxOf(f, 1200, { drawStyle: st as ItemContext["drawStyle"], count: 6, tone: "#b08850" })));
  const first = built(set.styles[0]);
  assert(first === built(set.styles[0]), `${kind}: one style builds the same body twice`);
  const varies = set.styles.slice(1).some((st) => built(st) !== first);
  assert(varies === !PLAN_ONLY_STYLES.has(kind), `${kind}: its styles ${varies ? "change" : "do not change"} the room — PLAN_ONLY_STYLES says otherwise`);
}

const top = (p: Part) => (p.shape === "box" || p.shape === "cylinder" || p.shape === "extrude" || p.shape === "ribbon" ? p.at.z + p.h : p.shape === "sphere" ? p.at.z + p.r : p.shape === "lathe" ? Math.max(...p.profile.map((q) => q.z)) + p.at.z : p.at.z);

// A five-arm ring: five candles, five flames at the top.
const ring = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 300 }, 600, { count: 5, drawStyle: "ring" }));
assert(waxCandles(ring).length === 5, `a 5-arm ring has 5 candles (${waxCandles(ring).length})`);
assert(ring.emitters.length === 5 && ring.emitters.every((e) => e.at.z >= 540 && e.at.z <= 600), "…and five flames at the candles' tops, within a tenth of 600");
assert(ring.emitters.some((e) => e.at.z === 600 && e.at.x === 0 && e.at.y === 0), "the odd count's centre candle crowns it at h");
assert(ring.parts.every((p) => top(p) <= 600 + 1e-9), "nothing stands above the row's height");

// A row: three candles along x on a bar at half height.
const row = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 800, depthMm: 120 }, 300, { count: 3 }));
const rowCandles = waxCandles(row);
assert(rowCandles.length === 3, "a long piece with no style is a row of 3");
const xs = rowCandles.map((p) => p.at.x).sort((a, b) => a - b);
assert(xs[0] < -300 && xs[2] > 300 && Math.abs(xs[1]) < 1e-6 && rowCandles.every((p) => Math.abs(p.at.y) < 1e-6), `…spread along x over 0.84 L (${xs.map((x) => Math.round(x)).join(", ")})`);
const tall = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 120, depthMm: 800 }, 300, { count: 3 }));
assert(waxCandles(tall).every((p) => Math.abs(p.at.x) < 1e-6) && waxCandles(tall).some((p) => p.at.y > 300), "a row stored deep runs along y");

// Every style builds, lights as many flames as it has candles, and keeps under its height.
const thirteen = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 500 }, 900, { count: 13, drawStyle: "tiered" }));
assert(thirteen.emitters.length === 13 && waxCandles(thirteen).length === 13, "a 13-arm tiered piece lights 13");
for (const style of ["sleeves", "cluster", "floating", "powder", "pillars"] as const) {
  const b = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 300 }, 400, { count: 5, drawStyle: style }));
  assert(b.emitters.length === 5, `${style}: 5 flames (${b.emitters.length})`);
  assert(b.parts.every((p) => top(p) <= 400 + 1e-9) && b.emitters.every((e) => e.at.z <= 400), `${style}: under its height`);
}
const lantern = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 200, depthMm: 200 }, 350, { count: 5, drawStyle: "lantern" }));
assert(lantern.emitters.length === 1 && lantern.parts.every((p) => top(p) <= 350 + 1e-9), "a square lantern is one lantern whatever its count, under its height");
const sleeves = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 300 }, 400, { count: 5, drawStyle: "sleeves" }));
assert(sleeves.parts.filter((p) => p.material?.kind === "glass").length === 5, "sleeves: a glass round every candle");
const glasses = sleeves.parts.filter((p) => p.material?.kind === "glass");
assert(glasses.every((p) => p.shape === "lathe" && p.profile[p.profile.length - 1].r === 0 && p.profile[2].z > p.profile[1].z), "…open at the top (a lathe with a floor and a rim, never a lidded cylinder — QA CN-1)");
const flameTop = Math.max(...sleeves.emitters.map((e) => e.at.z));
assert(glasses.some((p) => p.shape === "lathe" && p.at.z + p.profile[2].z > flameTop), "…and taller than the flame it shelters");
const lanternRow = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 900, depthMm: 200 }, 350, { count: 3, drawStyle: "lantern" }));
assert(lanternRow.emitters.length === 3, "three lanterns in a row");
const trough = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 1200, depthMm: 300 }, 250, { count: 1, drawStyle: "fire" }));
assert(trough.emitters.length === Math.floor((1200 - 180) / 130) && trough.emitters.every((e) => e.strength === FIRE), "a fire trough's flames follow its length, not its count");
const bowl = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 600 }, 300, { count: 1, drawStyle: "fire" }));
assert(bowl.emitters.length >= 6, "a fire bowl has a ring of flames");
// §5.4: a LOW body (12 cm, never the row's height), white pebbles round the burner, a frame on ask.
const troughTop = Math.max(...trough.parts.filter((p) => p.shape === "box").map((p) => (p as { at: { z: number }; h: number }).at.z + (p as { h: number }).h));
assert(troughTop <= 130, `the trough is a low body, not a block the row's height (${troughTop})`);
assert(trough.instanced.length > 50 && trough.instanced.every((r) => r.key.startsWith("pebble:#f2f0ea")), "white pebbles fill the trough round its burner");
const framedT = itemBody("candlestick", ctxOf({ kind: "rect", widthMm: 1200, depthMm: 300 }, 250, { count: 1, drawStyle: "fire", fire: { stones: "frame", guard: true } }));
assert(framedT.instanced.some((r) => r.at.at.z === 0) && framedT.parts.filter((p) => p.material?.kind === "glass").length === 4, "a frame of stones on the table round it; a glass guard of four panes");
const crystal = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 300 }, 600, { count: 4, drawStyle: "ring", tone: "#f7f6fc" }));
assert(crystal.parts.some((p) => p.shape === "box" && p.material?.kind === "glass"), "a crystal piece's arms are faint glass, not white metal");

// Chairs.
const chiavari = chairParts("chiavari", 420, 340, 900, "#f7f6fc");
assert(chiavari.parts.some((p) => p.shape === "extrude" && p.at.z === 410 && p.h === 40), "chiavari: a seat slab 40 thick under 450");
assert(Math.abs(Math.max(...chiavari.parts.map(top)) - 900) < 1e-6, "…and its posts reach 900");
assert(chiavari.parts.filter((p) => p.shape === "cylinder").length === 4, "…on four round legs");
for (const style of ["dining", "crossback", "ghost", "folding", "armchair", "bench"] as const) {
  const c = chairParts(style, 450, 450, 900, "#e4dfd6");
  assert(c.parts.length > 0 && Math.max(...c.parts.map(top)) <= 900 + 1e-9, `${style} builds under 900`);
  assert(Math.min(...c.parts.map((p) => p.at.z)) === 0, `${style} stands on the floor`);
}
assert(chairParts("ghost", 450, 450, 900, "#f7f6fc").material.opacity === 0.35, "a ghost chair is see-through");
assert(Math.max(...chairParts("bench", 1500, 400, 900, "#e4dfd6").parts.map(top)) === 450, "a bench has no back: nothing above its seat");
const pouf = chairParts("stool", 400, 400, 450, "#ece7f5");
assert(pouf.parts.some((p) => p.shape === "cylinder" && p.rBottom === 200), "a stool is a pouf: a cylinder of the footprint's radius");
assert(chairRequest("chiavari", 420.4, 340, 900, "#f7f6fc", transform(vec3(0, 0, 0)), { type: "chair" }).key === "chair:chiavari:#f7f6fc:420x340x900", "a chair's instance key");
const roundChair = itemBody("chair", ctxOf({ kind: "circle", diameterMm: 400 }, 450, { tone: "#ece7f5" }));
assert(roundChair.instanced.length === 1 && roundChair.instanced[0].key.startsWith("chair:stool:"), "a round chair footprint is a pouf, instanced");

// A lamp glows once; a vase is two lathes; a runner is a strip with two points.
const lamp = itemBody("lamp", ctxOf({ kind: "circle", diameterMm: 300 }, 500, { tone: DEFAULT_TONE.lamp }));
assert(lamp.emitters.length === 1 && lamp.emitters[0].colour === ENVELOPE.bulb && lamp.emitters[0].strength === 1, "a lamp has one bulb");
assert(lamp.parts.some((p) => p.shape === "lathe" && p.profile[0].r === 150 && p.profile[1].r === 96 && p.profile[1].z === 500), "its shade runs from the full rim to 0.64 of it at the top");
const vase = itemBody("vase", ctxOf({ kind: "circle", diameterMm: 200 }, 300, { tone: DEFAULT_TONE.vase }));
assert(vase.parts.length === 2 && vase.parts.every((p) => p.shape === "lathe") && vase.material.kind === "glass", "a pale vase is two lathes of glass");
assert(itemBody("vase", ctxOf({ kind: "circle", diameterMm: 200 }, 300, { tone: "#c9a24a" })).material.kind === "gloss", "a gold one is glazed");
// §4 / QA MT-1: a material the row says wins over the guess — a white vase in CERAMIC is glazed, not
// clear glass; a gold one in METAL is metal; clear glass stays clear whatever the colour.
assert(itemBody("vase", ctxOf({ kind: "circle", diameterMm: 200 }, 300, { tone: "#ffffff", material: "ceramic" })).material.kind === "gloss", "a white vase made of ceramic is glazed, not glass");
assert(itemBody("vase", ctxOf({ kind: "circle", diameterMm: 200 }, 300, { tone: "#c9a24a", material: "metal" })).material.kind === "metal", "a gold vase made of metal is metal");
const clear = itemBody("vase", ctxOf({ kind: "circle", diameterMm: 200 }, 300, { tone: "#c9a24a", material: "glass-clear" })).material;
assert(clear.kind === "glass" && clear.colour !== "#c9a24a", "clear glass stays clear whatever the shade's colour");
assert(itemBody(null, ctxOf({ kind: "rect", widthMm: 600, depthMm: 600 }, 400, { tone: "#888888", material: "marble" })).material.texture === "marble", "the fallback body is built in its material");
const runner = itemBody("runner", ctxOf({ kind: "rect", widthMm: 400, depthMm: 2400 }, 8, { tone: DEFAULT_TONE.runner }));
assert(runner.parts.filter((p) => p.shape === "extrude").length === 2 && runner.parts.some((p) => p.shape === "box" && p.rotDeg === 90 && p.w === 2400 - 240), "a runner stored deep runs along y with a point at each end");
// …with a contour (lib/catalog/border.ts): a ring on its top in the band's colour, no tassels when
// it says no fringe.
const hemmed = itemBody("runner", ctxOf({ kind: "rect", widthMm: 400, depthMm: 2400 }, 8, { tone: DEFAULT_TONE.runner, border: { widthMm: 30, colour: "#c9a24a", fringe: false } }));
const runnerRings = hemmed.parts.filter((p) => p.shape === "extrude" && p.at.z === 8);
assert(runnerRings.length === 1 && runnerRings[0].shape === "extrude" && runnerRings[0].holes?.length === 1 && runnerRings[0].material?.colour === "#c9a24a", "a hemmed runner wears its band on top");
assert(!hemmed.parts.some((p) => p.shape === "sphere"), "…and no tassels when the contour says no fringe");

// A centrepiece stands its flowers on a plate; an arrangement has none.
const centre = itemBody("centerpiece", ctxOf({ kind: "circle", diameterMm: 400 }, 350, { tone: DEFAULT_TONE.centerpiece }));
assert(centre.parts[0].shape === "cylinder" && centre.parts[0].h === PLATE_MM && centre.instanced.length > 0, "a centrepiece: a plate and instanced heads");
assert(centre.instanced.every((r) => r.at.at.z >= PLATE_MM - 1e-9), "…standing on the plate");
const flowers = itemBody("flowers", ctxOf({ kind: "circle", diameterMm: 400 }, 350, { tone: DEFAULT_TONE.flowers }));
assert(flowers.instanced.some((r) => r.key.startsWith("flower:")) && !flowers.parts.some((p) => p.shape === "cylinder" && p.h === PLATE_MM), "an arrangement with no row still blooms, without a plate");
assert(JSON.stringify(flowers) === JSON.stringify(itemBody("flowers", ctxOf({ kind: "circle", diameterMm: 400 }, 350, { tone: DEFAULT_TONE.flowers }))), "the same arrangement builds the same twice");

// The floor kinds are ./floor-kinds.ts's now, and an unknown picture is the fallback.
const sofa = itemBody("sofa", ctxOf({ kind: "rect", widthMm: 1800, depthMm: 900 }, 800, { tone: DEFAULT_TONE.sofa }));
assert(sofa.parts.length > 1 && !sofa.parts.some((q) => q.shape === "extrude" && q.h === 800), "a sofa is built by the floor kinds (back, arms, cushions), not the fallback box");
assert(itemBody(null, ctxOf({ kind: "rect", widthMm: 300, depthMm: 300 }, 0)).parts[0].shape === "extrude", "no picture: the fallback");
// Lines only (a |_| drawn and never closed): a thin wall along the three drawn sides, not the box.
const cup = itemBody(null, ctxOf({ kind: "custom", open: true, outline: [{ x: -1000, y: -500 }, { x: -1000, y: 500 }, { x: 1000, y: 500 }, { x: 1000, y: -500 }] }, 900));
const cupArea = cup.parts.reduce((s, q) => s + (q.shape === "extrude" ? Math.abs(polygonAreaMm2(q.outline.outline)) : 0), 0);
assert(cupArea > 0 && cupArea < 4000 * 60, `lines only stands as a thin wall (${Math.round(cupArea)} mm²)`);
// Vessels by what their name says, else by their proportions.
assert(vesselForm("אגרטל מרטיני זהב 80", 200, 200, 800) === "trumpet", "a martini vase stands on a stem");
assert(vesselForm("פודיום לבן 90", 450, 450, 900) === "plinth" && vesselForm("מעמד פרספקס", 300, 300, 1000) === "plinth", "a plinth is a stand the flowers are set on");
assert(vesselRimShare({ name: "פודיום לבן 90", dimensions: { widthMm: 450, depthMm: 450, heightMm: 900 } }) === 1 && vesselRimShare({ name: "אגרטל", dimensions: { diameterMm: 200, heightMm: 300 } }) === 0.9, "…at its very top; flowers in a vase start just under its rim");
assert(vesselForm("צילינדר זכוכית מפוספס 50", 60, 60, 500) === "cylinder", "a cylinder is straight");
assert(vesselForm("קערה אובלית על רגל 60", 600, 300, 200) === "pedestal" && vesselForm("קערה שטוחה", 400, 400, 120) === "bowl", "a bowl on a foot has a pedestal; a bowl does not");
assert(vesselForm(undefined, 200, 200, 300) === "vase" && vesselForm(undefined, 60, 60, 500) === "cylinder" && vesselForm(undefined, 400, 400, 150) === "bowl", "…and nameless ones go by their proportions");
// §5.2 / QA VS-2: the style picked is the body built; no style = the guess, as before.
assert(vesselFormOf("bowl", "אגרטל מרטיני", 200, 200, 300) === "bowl" && vesselFormOf(undefined, "אגרטל מרטיני", 200, 200, 300) === "trumpet", "a style picked wins over the name; none = the name's guess");
const plainV = itemBody("vase", ctxOf({ kind: "circle", diameterMm: 300 }, 400, { tone: "#c9a24a" }));
const jar = itemBody("vase", ctxOf({ kind: "circle", diameterMm: 300 }, 400, { tone: "#c9a24a", drawStyle: "urn" }));
assert(plainV.parts.length === 2 && jar.parts.filter((p) => p.shape === "lathe").length === 2 && jar.parts.filter((p) => p.shape === "sphere").length > 20, "כד עם ידיות is a jar with two handles; a plain vase has none");
const handleXs = jar.parts.filter((p) => p.shape === "sphere").map((p) => (p as { at: { x: number } }).at.x);
assert(Math.max(...handleXs) > 150 && Math.min(...handleXs) < -150, "…one handle each side, standing out past the belly");
const latheSig = (bb: typeof jar) => JSON.stringify(bb.parts.filter((p) => p.shape === "lathe").map((p) => (p as { profile: unknown }).profile));
assert(new Set(["vase", "cylinder", "trumpet", "urn", "pedestal", "bowl"].map((st) => latheSig(itemBody("vase", ctxOf({ kind: "circle", diameterMm: 300 }, 400, { tone: "#c9a24a", drawStyle: st as ItemContext["drawStyle"] }))))).size === 6, "every vase style builds a body of its own");
// A row whose shapes carry their own body is built from them, whatever its category: a vase whose
// designer drew a bowl's profile is a lathe of that profile, not the vase recipe's guess from its
// name; the same row without a profile is the recipe's.
const drawnVase: Product = { id: "v", name: "אגרטל", category: "vases", layer: "table", dimensions: { diameterMm: 300, heightMm: 400 }, categoryFields: {}, styleTags: [], variants: [], appearance: { shape: "circle", content: "none", revolve: [{ r: 0.3, z: 0 }, { r: 1, z: 0.7 }, { r: 0.6, z: 1 }] } };
const own = itemBody("vase", ctxOf({ kind: "circle", diameterMm: 300 }, 400, { product: drawnVase, profile: drawnVase.appearance!.revolve, tone: "#ffffff" }));
assert(own.parts.length === 2 && own.parts[0].shape === "lathe" && Math.abs(Math.max(...(own.parts[0] as { profile: { r: number }[] }).profile.map((q) => q.r)) - 150) < 1e-6 && top(own.parts[0]) === 400, "a vase with a drawn profile is that profile, turned — and hollow");
assert(own.material.kind === "glass", "…in the vessel's own glass, not a flat solid (2026-11-13)");
assert(vesselInside([[0.3, 0], [1, 0.7], [0.6, 1]])[0][0] < 0.6 && vesselInside([[0.2, 0], [1, 0.5], [0.02, 1]]).length === 0, "a vessel's inside is a wall in from its opening; a closed top has none");
const { appearance: _a, ...plainVase } = drawnVase;
const recipe = itemBody("vase", ctxOf({ kind: "circle", diameterMm: 300 }, 400, { product: { ...plainVase, appearance: { shape: "circle", content: "none" } } }));
assert(recipe.parts.length !== own.parts.length || recipe.parts[0].shape !== "lathe" || JSON.stringify(recipe.parts[0]) !== JSON.stringify(own.parts[0]), "…and without one it is the recipe's vase");
// ── The profile is READ, never built beside the picture (2026-11-13, lib/catalog/body-profiles.ts) ──
const withProfile = (category: string, revolve: { r: number; z: number }[], d = 400, h = 600): Product => ({ id: "pp-" + category, name: "בדיקה", category, layer: "table", dimensions: { diameterMm: d, heightMm: h }, categoryFields: {}, styleTags: [], variants: [], appearance: { shape: "circle", content: "none", revolve } });
const cone = [{ r: 1, z: 0 }, { r: 0.1, z: 1 }];
// A lamp: the profile is its SHADE — still cloth, still lit; no stem under a shade that reaches the table.
const coneLamp = itemBody("lamp", ctxOf({ kind: "circle", diameterMm: 400 }, 600, { product: withProfile("lamps", cone), profile: cone, tone: DEFAULT_TONE.lamp }));
assert(coneLamp.emitters.length === 1 && coneLamp.material.kind !== "matte" && coneLamp.parts.filter((p) => p.shape === "lathe").length === 1, "a lamp whose profile has no neck is a lit shade standing on the table — not a matte solid with no light");
const wholeLamp = [{ r: 0.4, z: 0 }, { r: 0.08, z: 0.1 }, { r: 0.08, z: 0.5 }, { r: 1, z: 0.5 }, { r: 1, z: 1 }];
const drumProfile = itemBody("lamp", ctxOf({ kind: "circle", diameterMm: 400 }, 600, { product: withProfile("lamps", wholeLamp), profile: wholeLamp, tone: DEFAULT_TONE.lamp }));
const lathes = drumProfile.parts.filter((p) => p.shape === "lathe") as { profile: { r: number; z: number }[]; material?: MaterialRef }[];
assert(lathes.length === 2 && lathes[0].profile[0].z === 300 && lathes[0].profile.every((q) => q.r === 200) && lathes[1].material?.kind === "metal" && lathes[1].profile[0].r === 80, "a whole lamp's profile is split at its neck: a drum shade over the top half, its base turned in metal below");
// The plan's four lamp styles are built, each its own shade; the default is the lamp it always was.
const styled = (s: string) => itemBody("lamp", ctxOf({ kind: "circle", diameterMm: 300 }, 500, { tone: DEFAULT_TONE.lamp, drawStyle: s as ItemContext["drawStyle"] }));
const shadeOf = (b: ItemBuild) => (b.parts[0] as { profile: { r: number; z: number }[] }).profile;
assert(JSON.stringify(shadeOf(styled("empire"))) === JSON.stringify(shadeOf(lamp)) && shadeOf(styled("drum")).every((q) => q.r === 150), "an empire lamp is the default's shade; a drum's is straight");
assert(shadeOf(styled("mushroom")).length > 3 && styled("globe").material.kind === "glass" && shadeOf(styled("globe"))[shadeOf(styled("globe")).length - 1].r < 1, "a mushroom is a dome; a globe is a ball of glass closed at the top");
// A candlestick: its turned body in its metal, its candle on top.
const baluster = [{ r: 0.9, z: 0 }, { r: 0.2, z: 0.3 }, { r: 0.5, z: 0.8 }, { r: 0.3, z: 1 }];
const turnedStick = itemBody("candlestick", ctxOf({ kind: "circle", diameterMm: 120 }, 400, { product: withProfile("candlesticks", baluster, 120, 400), profile: baluster, count: 1 }));
assert(turnedStick.parts.filter((p) => p.shape === "lathe").length === 1 && waxCandles(turnedStick).length === 1 && turnedStick.emitters.length === 1 && turnedStick.emitters[0].at.z === 400, "a candlestick with a profile is that body turned, one candle burning at its top");
// A round chair: a pouf turned to it.
const turnedPouf = itemBody("chair", ctxOf({ kind: "circle", diameterMm: 500 }, 450, { product: withProfile("chairs", baluster, 500, 450), profile: baluster, tone: DEFAULT_TONE.chair }));
assert(turnedPouf.parts.length === 1 && turnedPouf.parts[0].shape === "lathe", "a round seat with a profile is a pouf turned to it — not a stool inside a solid");
// A kind that does not read the profile still combines: its picture on its true footprint + the lathe.
// (A screen on a round base with a profile — rare, and exactly what it was.)

// ── The picture stands in its FIRST SHAPE'S box (lib/catalog/picture-frame.ts) ──
const hexOutline = Array.from({ length: 6 }, (_, i) => ({ x: 200 * Math.cos((i * Math.PI) / 3), y: 200 * Math.sin((i * Math.PI) / 3) }));
const hexLamp: Product = { id: "hx", name: "מנורה משושה", category: "lamps", layer: "table", dimensions: { widthMm: 400, depthMm: 346, heightMm: 500 }, categoryFields: {}, styleTags: [], variants: [], appearance: { shape: "custom", content: "none", outline: hexOutline } };
const onHex = itemBody("lamp", { ...ctxOf({ kind: "custom", outline: hexOutline }, 500, { product: hexLamp, tone: DEFAULT_TONE.lamp }), widthMm: 400, depthMm: 346 });
assert(onHex.emitters.length === 1 && onHex.parts.some((p) => p.shape === "lathe"), "a lamp on a hexagon is still a lamp — its shade and its bulb, in the hexagon's box");

// ── FLOWERS FOLLOW THEIR SHAPES (./flower-cover.ts), from the row to the room ──
const flowerRow = (appearance: NonNullable<Product["appearance"]>, dimensions: Product["dimensions"]): Product => ({ id: "fl-" + JSON.stringify(dimensions), name: "זר", category: "flower-arrangements", layer: "table", dimensions, categoryFields: {}, styleTags: [], variants: [], appearance });
const flowered = (row: Product, extra: Partial<ItemContext> = {}) => {
  const fp = resolveFootprint(row);
  const kind = symbolOf(row, fp);
  return { kind, build: itemBody(kind, { ...ctxOf(fp, row.dimensions.heightMm ?? 0, { product: row, flowers: flowerDrawSpecOf(row, fp, "#e8bcce"), ...extra }) }) };
};
const headsOf = (b: ItemBuild) => b.instanced.filter((r) => r.key.startsWith("flower:"));
// A ring: a wreath — heads on its band, nothing across its hole, nothing built as a solid.
const wreath = flowered(flowerRow({ shape: "circle", content: "none", hollow: { bandMm: 150 } }, { diameterMm: 1000, heightMm: 160 }));
assert(wreath.kind === "flowers", "an arrangement drawn as a ring is still drawn as flowers");
assert(headsOf(wreath.build).length > 80 && headsOf(wreath.build).every((r) => Math.hypot(r.at.at.x, r.at.at.y) > 320), `…a wreath: its heads on the band, none in the hole (${headsOf(wreath.build).length})`);
assert(!wreath.build.parts.some((p) => p.shape === "extrude" || p.shape === "lathe"), "…and no solid the shape of the ring");
// A shape drawn on the FRONT plane: a flower wall — its board, and heads in front of it.
const wallRow = flowered(flowerRow({ shape: "rect", content: "none", plane: "front" }, { widthMm: 3000, depthMm: 20, heightMm: 2400 }));
assert(wallRow.build.parts.some((p) => p.shape === "panel") && headsOf(wallRow.build).length > 400 && headsOf(wallRow.build).every((r) => r.at.at.y > 0 && r.at.at.z > 0 && r.at.at.z < 2400), `a front panel of flowers is a flower wall: heads over its face (${headsOf(wallRow.build).length})`);
// A plain circle keeps its dome; "by the spec" keeps the stems it lists.
const domeRow = flowered(flowerRow({ shape: "circle", content: "none" }, { diameterMm: 600, heightMm: 500 }));
const bareRow = flowered(flowerRow({ shape: "circle", content: "none", arrangement: { fullness: "spec" } }, { diameterMm: 600, heightMm: 500 }));
assert(domeRow.build.parts.some((p) => p.shape === "blob") && headsOf(domeRow.build).length > headsOf(bareRow.build).length * 1.5, `a plain round arrangement is its dome, FULL unless the row says "by the spec" (${headsOf(domeRow.build).length} vs ${headsOf(bareRow.build).length})`);
// A runner that falls off its table: to the floor under the table's top; nowhere near a table, shown afloat.
const fallRow = flowerRow({ shape: "rect", content: "none", arrangement: { fall: "end" } }, { widthMm: 1800, depthMm: 400, heightMm: 250 });
const onTable = headsOf(flowered(fallRow, { standMm: 760 }).build);
assert(Math.min(...onTable.map((r) => r.at.at.z)) < -700 && Math.min(...onTable.map((r) => r.at.at.z)) >= -760, "a runner's fall hangs from the table's top to the floor under it");
const afloat = headsOf(flowered(fallRow).build);
assert(Math.min(...afloat.map((r) => r.at.at.z)) >= 0 && Math.max(...afloat.map((r) => r.at.at.z)) > 750, "…and set down on its own it is shown at a table's height, the fall reaching the floor");
console.log("scene items ok");
