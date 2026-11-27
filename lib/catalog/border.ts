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
// A band is the region BETWEEN two insets of the item's real outline (evenInset, the hollow
// shapes' own offset in lib/studio/footprint.ts, held to its width) — so a bowed side keeps its bow, a rounded corner
// stays concentric, and a band too deep for the item fills its middle rather than turning inside
// out. A drawing fact like a rug's bows: the quote, the packing list and orders never read it.
//
// Pure; self-checked: npm run check:border.
import type { Product } from "./types";
import type { Point } from "../design-document/types";
import { footprintOutlines, evenInset, flattenEdge, type BuiltOutline, type Footprint } from "../studio/footprint";

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
    const outer = evenInset(base, from);
    if (!outer) return;
    out.push({ colour, which, outer, inner: evenInset(base, to) });
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
