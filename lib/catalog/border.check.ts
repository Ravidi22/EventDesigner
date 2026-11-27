// npm run check:border — the self-check of ./border.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "./types";
import { type BuiltOutline } from "../studio/footprint";
import { borderBands, borderOf, cleanBorder, clothHem, darkerShade, edgeFringe, fringeOf, sameBorder, type Border } from "./border";

// ponytail: self-check. Run: npm run check:border
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;
const rug = { id: "r", name: "שטיח", category: "rugs", layer: "floor", dimensions: { widthMm: 3000, depthMm: 2000 }, categoryFields: {}, styleTags: [], variants: [] } as unknown as Product;
const gold: Border = { widthMm: 120, colour: "#c9a24a" };
const bordered = { ...rug, appearance: { shape: "rect", content: "none", border: gold } } as Product;

// The resolver: the row's, the plan's own, none here, and never on a category that takes none.
assert(borderOf(undefined, rug) === undefined && borderOf({}, rug) === undefined, "a rug nobody gave a contour has none");
assert(borderOf(undefined, bordered) === gold && borderOf({}, bordered) === gold, "the row's contour, the same object back");
const own: Border = { widthMm: 60, colour: "#222222", fringe: false };
assert(borderOf({ border: own }, bordered) === own, "the plan's own wins over the row's");
assert(borderOf({ border: null }, bordered) === undefined, "null = none on this plan, whatever the row says");
const chair = { ...bordered, category: "chairs" } as Product;
assert(borderOf({ border: own }, chair) === undefined, "a chair takes no contour even if one was stored");
assert(borderOf(undefined, { ...bordered, category: "tablecloths" } as Product) === gold, "a cloth (and a runner) takes one");

// Cleaning: garbage is no contour, a band with no width keeps only what it says, the inner band
// needs a width and a colour, numbers become whole millimetres.
assert(cleanBorder(undefined) === undefined && cleanBorder({ widthMm: 50 }) === undefined && cleanBorder("x") === undefined, "no colour, no contour");
const messy = cleanBorder({ widthMm: 52.6, colour: " #abc ", inner: { widthMm: 0, gapMm: 10, colour: "#fff" }, fringe: "yes", fringeColour: "" })!;
assert(messy.widthMm === 53 && messy.colour === "#abc" && !messy.inner && !("fringe" in messy) && !("fringeColour" in messy), "cleaned to what it says");
assert(cleanBorder({ widthMm: 80, colour: "#000", inner: { widthMm: 20, gapMm: -5, colour: "#fff" } })!.inner!.gapMm === 0, "a negative gap is none");
assert(sameBorder({ ...gold }, gold) && !sameBorder(gold, own) && !sameBorder(gold, { ...gold, inner: { widthMm: 1, gapMm: 1, colour: "#fff" } }), "compared by value");

// The fringe: a rug's by default, a cloth's only when asked, in the band's colour unless its own.
assert(fringeOf(undefined, "rugs").on && !fringeOf(undefined, "tablecloths").on, "on for a rug, off for a cloth");
assert(fringeOf(gold, "rugs").colour === gold.colour && fringeOf({ ...gold, fringeColour: "#fff" }, "rugs").colour === "#fff", "…in the band's colour unless its own");
assert(!fringeOf({ ...gold, fringe: false }, "rugs").on && fringeOf({ ...gold, fringe: true }, "tablecloths").on, "…unless the contour says otherwise");

// The bands of a plain 3000×2000 rectangle: the edge band 120 deep, the second 40 deep 60 further in.
const rect: BuiltOutline = { outline: [{ x: -1500, y: -1000 }, { x: 1500, y: -1000 }, { x: 1500, y: 1000 }, { x: -1500, y: 1000 }] };
const two = borderBands(rect, { ...gold, inner: { widthMm: 40, gapMm: 60, colour: "#ffffff" } });
const xs = (o: BuiltOutline | null) => (o ? o.outline.map((p) => Math.abs(p.x)) : []);
assert(two.length === 2 && two[0].outer === rect, "two bands, the first from the edge itself");
assert(xs(two[0].inner).every((x) => near(x, 1380)), `the edge band's inside is 120 in (${xs(two[0].inner)})`);
assert(xs(two[1].outer).every((x) => near(x, 1320)) && xs(two[1].inner).every((x) => near(x, 1280)), "the second band 60 further in, 40 deep");
// A band deeper than the rug fills its middle; a band starting past the middle is not drawn.
const deep = borderBands(rect, { widthMm: 1500, colour: "#000" });
assert(deep.length === 1 && deep[0].inner === null, "a band deeper than half the rug is the whole rug");
assert(borderBands(rect, { widthMm: 900, colour: "#000", inner: { widthMm: 100, gapMm: 200, colour: "#fff" } }).length === 1, "…and a second band past the middle is dropped");
assert(borderBands(rect, { widthMm: 0, colour: "#000" }).length === 0, "no width, no band");

// A round cloth's hem, 90 of drop: a 30 contour stands at the outside of the strip; one wider than
// the strip is scaled into four fifths of it, the second band in the same proportion.
const hem = clothHem({ widthMm: 30, colour: "#000" }, 90);
assert(hem.length === 1 && near(hem[0].toMm, 90) && near(hem[0].fromMm, 60), "a 3cm hem on the outer 3cm of the strip");
const wide = clothHem({ widthMm: 100, colour: "#000", inner: { widthMm: 20, gapMm: 20, colour: "#fff" } }, 90);
assert(wide.length === 2 && near(wide[0].toMm - wide[0].fromMm, (100 * 72) / 140) && near(wide[1].fromMm, 90 - 72), `scaled into 72 of the 90 (${JSON.stringify(wide)})`);

// A cloth's fringe stands OUTSIDE the cloth: every strand on a ⌀1800 table's 90 drop is at 990
// from the centre and points away from it.
const fr = edgeFringe({ kind: "circle", diameterMm: 1800 }, 90, 40);
assert(fr.length > 100 && fr.every((s) => near(Math.hypot(s.x, s.y), 990, 3) && s.x * s.nx + s.y * s.ny > 0), "a round cloth's fringe rings it, outward");
const sq = edgeFringe({ kind: "rect", widthMm: 1000, depthMm: 1000 }, 50, 50);
assert(sq.length === 80 && sq.every((s) => Math.max(Math.abs(s.x), Math.abs(s.y)) > 549), `a square's fringe on its four sides (${sq.length})`);

assert(darkerShade("#eeeeee") === "#bebebe" && darkerShade("var(--x)") === "var(--x)", "a step darker, or left alone");
console.log("border: ok");
