// A CONTOUR on a rug or a tablecloth — a coloured band inside its edge, a second band inside a gap if
// wanted, and the fringe in a colour of its own (2026-11-07, Ravid: "in carpet separately color the
// קונטור and define its width"; spec docs/superpowers/specs/2026-11-07-venue-heights-rails-and-covers-
// design.md §10).
//
// Kept on the catalog row (MapAppearance.border — "this rug comes with a gold contour") and
// overridable per plan (Placement.border — absent = the row's, null = none on this plan: the
// vessel's rule, lib/catalog/vessel.ts). `borderOf` is the one resolver every surface asks. Absent
// everywhere = the drawing every rug and cloth had before this file: the rug's 30%-ink weave line
// and its fringe off the short ends, a cloth's plain hem — so no existing plan changes by itself.
//
// A band is the region BETWEEN two insets of the item's real outline (insetOutline, the hollow
// shapes' own offset in lib/studio/footprint.ts) — so a bowed side keeps its bow, a rounded corner
// stays concentric, and a band too deep for the item fills its middle rather than turning inside
// out. A drawing fact like a rug's bows: the quote, the packing list and orders never read it.
//
// Pure; self-checked: npm run check:border.
import type { Product } from "./types";
import type { Point } from "../design-document/types";
import { footprintOutlines, insetOutline, flattenEdge, type BuiltOutline, type Footprint } from "../studio/footprint";
import { isMain } from "../self-check";

export interface Border {
  /** The band, inside the edge, mm. 0 = no band (the fringe settings still apply). */
  widthMm: number;
  /** Its CSS colour. */
  colour: string;
  /** A second band inside the first, `gapMm` in from it (Ravid: yes to two). */
  inner?: { widthMm: number; gapMm: number; colour: string };
  /** Absent = the item's default: on for a rug, off for a cloth. */
  fringe?: boolean;
  /** Absent = the band's colour. */
  fringeColour?: string;
}

/** The categories a contour belongs to. A runner is a `tablecloths` row too, so it takes one. */
export const BORDER_CATEGORIES: readonly string[] = ["rugs", "tablecloths"];

export const takesBorder = (product: Pick<Product, "category"> | undefined): boolean => !!product && BORDER_CATEGORIES.includes(product.category);

/** What a new contour starts at when the designer switches one on: a rug's woven band is wider than
 *  a cloth's hem. */
export function newBorder(category: string, colour = "#b08d57"): Border {
  return { widthMm: category === "rugs" ? 100 : 30, colour };
}

/** A new second band: half the first's width, as far in again. */
export function newInner(border: Border, colour = "#ffffff"): NonNullable<Border["inner"]> {
  const w = Math.max(10, Math.round(border.widthMm / 2));
  return { widthMm: w, gapMm: w, colour };
}

/** The most a band (or a gap) may be, mm — far more than any rug's, a guard against a typed 0 too many. */
const MAX_MM = 3000;

const mmOf = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(MAX_MM, n))) : 0;
};
const colourOf = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Two contours that draw the same — compared by value, because a placement read off the server is
 *  a fresh object on every load and the drawings are memoised on their props (sameDrawProps). */
export function sameBorder(a: Border | null | undefined, b: Border | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.widthMm !== b.widthMm || a.colour !== b.colour || a.fringe !== b.fringe || a.fringeColour !== b.fringeColour) return false;
  if (!a.inner || !b.inner) return !a.inner && !b.inner;
  return a.inner.widthMm === b.inner.widthMm && a.inner.gapMm === b.inner.gapMm && a.inner.colour === b.inner.colour;
}

/** A contour as stored, made safe to draw: whole millimetres, a colour on every band, a second band
 *  only when it has a width, the fringe fields only when they say something. `undefined` for
 *  anything that is not a contour. The SAME object comes back when it was already clean, so a
 *  memoised drawing handed it twice does not redraw. */
export function cleanBorder(raw: unknown): Border | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const colour = colourOf(r.colour);
  if (!colour) return undefined;
  const out: Border = { widthMm: mmOf(r.widthMm), colour };
  const ri = r.inner && typeof r.inner === "object" ? (r.inner as Record<string, unknown>) : undefined;
  const iw = ri ? mmOf(ri.widthMm) : 0;
  const ic = ri ? colourOf(ri.colour) : undefined;
  if (ri && iw > 0 && ic) out.inner = { widthMm: iw, gapMm: mmOf(ri.gapMm), colour: ic };
  if (typeof r.fringe === "boolean") out.fringe = r.fringe;
  const fc = colourOf(r.fringeColour);
  if (fc) out.fringeColour = fc;
  return sameBorder(out, raw as Border) ? (raw as Border) : out;
}

/** The contour THIS placement is drawn with: its own when it has one, none when it says null, else
 *  its row's — and never on anything but a rug or a cloth. `placement` absent = the row's (a card, a
 *  drag image, the appearance editor). `undefined` = the drawing it always had. */
export function borderOf(placement: { border?: Border | null } | undefined, product: Product | undefined): Border | undefined {
  if (!takesBorder(product)) return undefined;
  if (placement && placement.border === null) return undefined;
  if (placement?.border !== undefined) return cleanBorder(placement.border);
  return cleanBorder(product?.appearance?.border);
}

/** Whether the fringe is drawn, and in what colour. A rug is woven with one, a cloth is not —
 *  unless its contour says otherwise. `undefined` colour = the drawing's own ink (no contour). */
export function fringeOf(border: Border | undefined, category: string | undefined): { on: boolean; colour?: string } {
  const on = border?.fringe ?? category === "rugs";
  return { on, ...(border ? { colour: border.fringeColour ?? border.colour } : {}) };
}

// ── the bands ───────────────────────────────────────────────────────────────────────────────────

/** One band of a contour: fill `outer` with `inner` cut out (an even-odd pair — draw both outlines in
 *  one path). `inner` null = the band fills everything inside `outer` (it is deeper than the item). */
export interface BorderBand {
  colour: string;
  /** "outer" is the band at the edge, "inner" the second one inside the gap — a monochrome sheet
   *  shades them alike, a key may tell them apart. */
  which: "outer" | "inner";
  outer: BuiltOutline;
  inner: BuiltOutline | null;
}

/** A contour's bands inside one closed outline (in the outline's own frame): the band at the edge,
 *  then the second band `gapMm` further in. A band whose outer edge is already swallowed by the
 *  item's depth is not drawn. */
export function borderBands(base: BuiltOutline, border: Border): BorderBand[] {
  const out: BorderBand[] = [];
  const band = (from: number, to: number, colour: string, which: BorderBand["which"]) => {
    if (!(to > from)) return;
    const outer = insetOutline(base, from);
    if (!outer) return;
    out.push({ colour, which, outer, inner: insetOutline(base, to) });
  };
  band(0, border.widthMm, border.colour, "outer");
  if (border.inner) {
    const from = border.widthMm + border.inner.gapMm;
    band(from, from + border.inner.widthMm, border.inner.colour, "inner");
  }
  return out;
}

/** The bands of a contour inside every outline of a footprint (a runner's strip, a cloth drawn as its
 *  own shape on a card), in the footprint's own centred frame. */
export function footprintBorderBands(f: Footprint, border: Border): BorderBand[] {
  return footprintOutlines(f).flatMap((o) => borderBands(o, border));
}

/** A cloth's hem on the plan. Seen from above a cloth is the table's top and `dropMm` of fabric past
 *  its edge (ClothDrape), so the contour is laid in that strip, counted from the cloth's edge in:
 *  each band as the distances from the TABLE's edge out to where it starts and ends (the round-joined
 *  strokes ClothDrape paints with). A contour wider than the strip is drawn narrower, every width in
 *  the same proportion, so a fifth of the strip is always left in the cloth's own colour against the
 *  table — the contour still reads as a hem, not as a second cloth. */
export function clothHem(border: Border, dropMm: number): { colour: string; fromMm: number; toMm: number }[] {
  const w = border.widthMm;
  const g = border.inner ? border.inner.gapMm : 0;
  const iw = border.inner ? border.inner.widthMm : 0;
  const total = w + g + iw;
  if (!(total > 0) || !(dropMm > 0)) return [];
  const k = Math.min(1, (dropMm * 0.8) / total);
  const bands: { colour: string; fromMm: number; toMm: number }[] = [];
  if (w > 0) bands.push({ colour: border.colour, fromMm: dropMm - w * k, toMm: dropMm });
  if (border.inner && iw > 0) {
    const to = dropMm - (w + g) * k;
    bands.push({ colour: border.inner.colour, fromMm: to - iw * k, toMm: to });
  }
  return bands;
}

/** One strand of fringe: where it leaves the edge and the unit direction it hangs in. */
export interface Strand {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/** A fringe all the way round a footprint `offsetMm` outside its outline (a cloth's: the edge of the
 *  fabric, `dropMm` past the table's), a strand every `gapMm` along each run, the corners' round
 *  joins left bare — a tasselled tablecloth. In the footprint's own centred frame. */
export function edgeFringe(f: Footprint, offsetMm: number, gapMm: number): Strand[] {
  const out: Strand[] = [];
  for (const o of footprintOutlines(f)) {
    const n = o.outline.length;
    const pts = o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % n], o.edgeCurves?.[i]).slice(0, -1));
    let area = 0;
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      area += p.x * q.y - q.x * p.y;
    });
    const sgn = area > 0 ? 1 : -1;
    // Carry the spacing across the short segments a curve is flattened into, so a round cloth is
    // fringed evenly rather than once per segment.
    let carry = gapMm / 2;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) return;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      // Outward: the walk's left (in plan coordinates, y down) for a positive shoelace winding.
      const nx = uy * sgn;
      const ny = -ux * sgn;
      let s = carry;
      for (; s < len; s += gapMm) out.push({ x: a.x + ux * s + nx * offsetMm, y: a.y + uy * s + ny * offsetMm, nx, ny });
      carry = s - len;
    });
  }
  return out;
}

/** `hex` a step darker (toward black by `t`) — a monochrome sheet's band against the rug's grey. A
 *  value that is not a hex colour comes back as it was. */
export function darkerShade(hex: string, t = 0.2): string {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return hex;
  const ch = [0, 2, 4].map((i) => Math.round(parseInt(full.slice(i, i + 2), 16) * (1 - t)));
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** A band's outlines as polygons (curves flattened) — what a test, a hit or a scene part reads. */
export function bandPolygon(o: BuiltOutline): Point[] {
  const n = o.outline.length;
  return o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % n], o.edgeCurves?.[i]).slice(0, -1));
}

// ponytail: self-check. Run: npm run check:border
if (isMain(import.meta.url)) {
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
}
