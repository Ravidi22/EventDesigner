// npm run check:flower-draw — the self-check of ./flower-draw.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { FLOWER_KIND_BY_ID } from "./flower-kinds";
import { composeFlowers, DEFAULT_SHADE, defaultFlowerForm, defaultMix, FALL_SPILL, FLOWER_FORMS, lineColours, TAU, type FlowerDrawSpec, type FlowerForm, type FlowerItem } from "./flower-draw";

// ponytail: self-check. Run: npm run check:flower-draw
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const mixLines = defaultMix();
const spec = (form: FlowerForm, w: number, h = w, seed = 7, lines = mixLines): FlowerDrawSpec => ({ form, w, h, lines, seed, shade: "#E8A0B4" });

const one = spec("dome", 600);
const a = composeFlowers(one);
assert(composeFlowers(one) === a, "the same spec object is laid out once");
assert(JSON.stringify(composeFlowers(spec("dome", 600))) === JSON.stringify(a), "the same seed lays out the same");
assert(JSON.stringify(composeFlowers(spec("dome", 600, 600, 8))) !== JSON.stringify(a), "a different seed lays out differently");

const heads = (items: FlowerItem[]) => items.filter((i) => i.t === "head");
assert(heads(a).length > 10, "a ⌀60 dome shows a good number of heads");
assert(heads(composeFlowers(spec("dome", 200))).length < heads(a).length, "a ⌀20 posy shows fewer heads than a ⌀60 — not smaller ones");
const rose = heads(a).find((i) => i.t === "head" && i.kind === "rose");
assert(!!rose && rose.t === "head" && Math.abs(rose.r - 38) < 1, "a rose head is its real size whatever the arrangement");

// Everything stays inside the box, with a hair of slack for a sprig's leaf past the rim.
// (A covered shape's rim heads and sprigs stand a little over its edge by design.)
for (const form of FLOWER_FORMS.filter((f) => f !== "shape")) {
  const w = form === "runner" ? 1600 : 600;
  const h = form === "runner" ? 360 : 600;
  for (const it of composeFlowers(spec(form, w, h))) {
    if (it.t === "head" || it.t === "fill") assert(Math.abs(it.x) + it.r <= w / 2 * 1.08 && Math.abs(it.y) + it.r <= h / 2 * 1.08, `${form}: a ${it.kind} head stays inside the box`);
    if (it.t === "green" || it.t === "trail") {
      const tip = { x: it.x + Math.cos(it.ang) * it.len, y: it.y + Math.sin(it.ang) * it.len };
      assert(Math.abs(tip.x) <= w / 2 * 1.08 && Math.abs(tip.y) <= h / 2 * 1.08, `${form}: a sprig's tip stays inside the box`);
    }
  }
}

const runner = composeFlowers(spec("runner", 1600, 360));
const xs = runner.filter((i) => i.t === "green").map((i) => (i as { x: number }).x);
assert(Math.max(...xs) - Math.min(...xs) > 1600 * 0.7, "a runner's greens run the length of it");
const tall = composeFlowers(spec("runner", 360, 1600));
const ys = tall.filter((i) => i.t === "green").map((i) => (i as { y: number }).y);
assert(Math.max(...ys) - Math.min(...ys) > 1600 * 0.7, "a runner along y is turned, not squashed");

assert(heads(composeFlowers(spec("single", 76))).length === 1, "a single stem is one head");
const sprig = composeFlowers(spec("single", 300, 60, 1, [{ kind: "euca", qty: 1 }]));
assert(sprig.length === 1 && sprig[0].t === "green", "a single green is one sprig");

assert(defaultFlowerForm(250, 300, 300) === "cushion", "a 25cm arrangement is a cushion");
assert(defaultFlowerForm(900, 900, 900) === "dome", "a 90cm one is a dome");
assert(defaultFlowerForm(undefined, 300, 300) === "dome", "no height: a dome");
assert(defaultFlowerForm(300, 1600, 360) === "runner", "a strip is a runner whatever its height");
assert(defaultFlowerForm(300, 3000, 1500) === "shape" && defaultFlowerForm(300, 700, 600) === "cushion", "a box neither a strip nor near square is covered as drawn");

const cols = lineColours([{ kind: "rose", qty: 10 }, { kind: "gyps", qty: 5 }, { kind: "euca", qty: 5 }, { kind: "orchid", qty: 4, colour: "#ffffff" }], "#6E1B2C");
assert(cols[0].col === "#6E1B2C", "the first following line takes the shade itself");
assert(cols[1].col === "#FFFFFF", "gypsophila is white in a bordeaux arrangement");
assert(cols[2].col === FLOWER_KIND_BY_ID.euca.natural, "eucalyptus keeps its own colour");
assert(cols[3].col === "#ffffff", "a pinned colour wins");
assert(lineColours([{ kind: "rose", qty: 1 }], "#FFFFFF")[0].col === "#FFFFFF", "a white shade draws white heads");
assert(lineColours([{ kind: "rose", qty: 1 }])[0].col === DEFAULT_SHADE, "no shade: the default blush");
assert(lineColours([{ kind: "rose", qty: 1 }], "garbage")[0].col === DEFAULT_SHADE, "a shade that is not a colour is ignored");

// FULL is the default: the spec is the mix, the surface the count. `sparse` draws the stems listed.
const few = [{ kind: "rose" as const, qty: 12 }, { kind: "euca" as const, qty: 4 }];
type HeadItem = Extract<FlowerItem, { t: "head" | "fill" }>;
const headsOf = (items: FlowerItem[]) => items.filter((i): i is HeadItem => i.t === "head");
const fullDome = headsOf(composeFlowers(spec("dome", 600, 600, 7, few)));
const sparseDome = headsOf(composeFlowers({ ...spec("dome", 600, 600, 7, few), sparse: true }));
assert(sparseDome.length >= 6 && sparseDome.length <= 12, `"by the spec": twelve stems of roses are their own few heads (${sparseDome.length})`);
assert(fullDome.length > 60 && fullDome.every((i) => i.kind === "rose"), `full: the same roses, as many as a ⌀60 dome holds (${fullDome.length})`);
const discs = fullDome.reduce((s, i) => s + Math.PI * i.r ** 2, 0);
assert(discs > Math.PI * (300 * 0.84) ** 2 * 0.8, "…covering the mass, buds in the gaps");
assert(heads(composeFlowers(spec("runner", 1600, 360))).length > heads(composeFlowers({ ...spec("runner", 1600, 360), sparse: true })).length * 1.5, "a full runner is one flowered run, not clusters apart");

// A runner's fall: heads past its end, each knowing how far down it hangs.
const fallen = composeFlowers({ ...spec("runner", 1600, 360), fall: "end" });
const down = headsOf(fallen).filter((i) => i.fall !== undefined);
assert(down.length > 20 && down.every((i) => i.x > 800 && i.x <= 800 + 360 * FALL_SPILL + 20) && down.some((i) => i.fall === 0) && down.some((i) => i.fall === 1), `a fall is drawn past the runner's end, from the edge (0) to the floor (1) (${down.length})`);
assert(!composeFlowers(spec("runner", 1600, 360)).some((i) => i.t === "head" && i.fall !== undefined), "…and only when asked for");

// FLOWERS THAT FOLLOW A SHAPE: a ring is covered on its band, never across its hole.
const ringPts = (r: number, n = 40) => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((i * TAU) / n), y: r * Math.sin((i * TAU) / n) }));
const outerRing = ringPts(500);
const holeRing = ringPts(350).reverse();
const wreath: FlowerDrawSpec = { form: "shape", w: 1000, h: 1000, lines: mixLines, seed: 3, shade: "#E8A0B4", cover: [{ poly: [...outerRing, outerRing[0], holeRing[holeRing.length - 1], ...holeRing, holeRing[holeRing.length - 1]] }] };
const wHeads = headsOf(composeFlowers(wreath));
assert(wHeads.length > 40 && wHeads.every((i) => Math.hypot(i.x, i.y) > 340 && Math.hypot(i.x, i.y) < 510 && !!i.on), `a wreath's heads stand on its band (${wHeads.length})`);
assert(new Set(wHeads.map((i) => i.kind)).size >= 2, "…in the spec's own mix");
assert(composeFlowers(wreath).some((i) => i.t === "base") && composeFlowers(wreath).some((i) => i.t === "green"), "…over its foliage, sprigs out past the rim");
const garland: FlowerDrawSpec = { form: "shape", w: 2000, h: 20, lines: mixLines, seed: 3, cover: [{ poly: [{ x: -1000, y: 0 }, { x: 0, y: 200 }, { x: 1000, y: 0 }], open: true }] };
const gHeads = composeFlowers(garland).filter((i) => i.t === "head");
assert(gHeads.length > 20 && !composeFlowers(garland).some((i) => i.t === "base"), `lines are a garland: heads along them, nothing filled (${gHeads.length})`);
const leafy = composeFlowers({ ...wreath, lines: [{ kind: "ruscus", qty: 30 }, { kind: "euca", qty: 30 }] });
assert(!leafy.some((i) => i.t === "head") && leafy.filter((i) => i.t === "green").length > 80, "greens alone are a foliage hoop, all sprigs");

const scaled = defaultMix(55);
assert(scaled.reduce((s, l) => s + l.qty, 0) >= 50 && scaled.reduce((s, l) => s + l.qty, 0) <= 60, "the default mix scales to a typed total");
console.log("catalog/flower-draw self-check passed");
