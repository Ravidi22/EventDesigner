// A PERGOLA (פרגולה) — posts at the corners of an outline, a beam along every side, and a roof across
// them (the user, 2026-11-07: "category of פרגולה … might be both"; spec docs/superpowers/specs/
// 2026-11-07-venue-heights-rails-and-covers-design.md §5).
//
// Both worlds, ONE definition: the venue's own fixed pergola is a feature (FeatureKind "pergola",
// `StructureFeature.pergola`), a hired one a catalog row (category `pergolas`, its roof the row's
// symbolStyle, its post `categoryFields.postMm`). Everything that draws or builds one — the plan
// glyph (components/pergola-glyph.tsx: /halls, the sketch, the catalog's item drawing, the add card,
// both printed looks), the 3D body (lib/scene/floor-kinds.ts pergolaBody, for the row AND the
// feature), the clearance check and the printed sheets' obstacles — reads its geometry from here.
//
// The geometry is read off the FOOTPRINT as drawn, in its own frame and its own millimetres: a
// rectangle's four corners, a hand-drawn outline's corners with its bows and rounded corners (lib/
// studio/shaped-outline.ts makes those arcs, featureFootprint hands them over), an ellipse's rim. It
// never reads fractions of the box: a 4 × 4 row laid 6 × 4 keeps its 15cm posts and its 30cm slat
// spacing, and only gains slats.
//
//   - POSTS stand at every sharp corner of the outline, INSIDE it (their outer faces on its line —
//     a 4 × 4 pergola is 4 m over its posts, the way a rental is described). Along a curve they are
//     spaced about every CURVE_POST_SPACING_MM (a round pergola: at least four round its rim; a
//     rounded corner: one at the middle of its arc); a straight side longer than MAX_SPAN_MM gets
//     posts between its corners, because a 12 m beam on two posts is not a thing anyone builds.
//   - The BEAM LINE (`ring`) is the outline moved half a post inward: the line through the posts'
//     middles, along which the beams run and the lattice panels stand.
//   - SLATS run `slatDirectionDeg` in the pergola's frame (absent = across the long side: a 6 × 4's
//     slats span its 4 m, repeated along its 6), `slatSpacingMm` apart, on centres struck from the
//     middle, clipped to the beam line.
//   - CLOSED SIDES are indices into the footprint outline's edges — the same sides hollowSides names
//     by where they face (lib/studio/footprint.ts), so a toggle reads "ימין", "למטה".
//
// Pure: no React, no structure import (structure.ts imports this one's types and NEW_PERGOLA). `npm
// run check:pergola` runs the self-check.
import type { Point } from "@/lib/studio/hall";
import type { Product } from "@/lib/catalog/types";
import { flattenEdge, footprintOutlines, hollowSides, sampledBounds, type BuiltOutline, type Footprint, type HollowSide } from "@/lib/studio/footprint";
import { shapedOutline } from "@/lib/studio/shaped-outline";
import { isMain } from "../self-check";

/** What is laid across the beams: an open lattice of slats, a solid deck, a stretched cloth, or
 *  nothing at all (the beams alone). */
export type PergolaRoof = "slats" | "solid" | "fabric" | "none";

export const PERGOLA_ROOFS: readonly PergolaRoof[] = ["slats", "solid", "fabric", "none"];

export const PERGOLA_ROOF_LABEL: Record<PergolaRoof, string> = {
  slats: "רפפות",
  solid: "גג אטום",
  fabric: "בד מתוח",
  none: "קורות בלבד",
};

export const PERGOLA_ROOF_HINT: Record<PergolaRoof, string> = {
  slats: "קורות דקות לרוחב — צל חלקי",
  solid: "משטח סגור מעל הקורות",
  fabric: "בד מתוח בין הקורות",
  none: "העמודים והקורות בלבד, בלי גג",
};

/** Where the posts stand (2026-11-19, the user: "custom legs — none or custom"): at the outline's
 *  corners and along it, as every pergola always stood (`auto`); nowhere — the beams and the roof
 *  alone, fixed to a building or hung (`none`); or where the designer put them (`custom`). */
export type PergolaLegs = "auto" | "none" | "custom";

export const PERGOLA_LEGS: readonly PergolaLegs[] = ["auto", "none", "custom"];

export const PERGOLA_LEGS_LABEL: Record<PergolaLegs, string> = {
  auto: "אוטומטי",
  none: "ללא עמודים",
  custom: "מותאם",
};

/** A post the designer put: on side `side` of the outline (an edge index, as `closedSides`), `t` of
 *  the way along that side's beam line (0 = the corner it starts at, 1 = the next). A fraction, not
 *  millimetres, so a post put at a side's middle stays at its middle when the pergola is resized. */
export interface PergolaPostSpot {
  side: number;
  t: number;
}

export interface Pergola {
  /** A post's square, mm. */
  postMm: number;
  /** Where the posts stand. Absent = `auto`. */
  legs?: PergolaLegs;
  /** iff `legs === "custom"`: every post, where it was put. */
  posts?: PergolaPostSpot[];
  roof: PergolaRoof;
  /** Which way the slats run, degrees in the pergola's own frame (0 = along its width, +x). Absent
   *  = across the long side. */
  slatDirectionDeg?: number;
  /** Centre to centre, mm. Absent = PERGOLA_SLAT_SPACING_MM. */
  slatSpacingMm?: number;
  /** Sides carrying a lattice panel: edge indices of the footprint's outline (hollowSides). Absent
   *  = every side open. */
  closedSides?: number[];
}

/** The catalog category a hired pergola is filed under (lib/catalog/categories.ts). */
export const PERGOLA_CATEGORY = "pergolas";
/** The category's number field for the post size (categoryFields.postMm, mm). */
export const POST_FIELD = "postMm";
export const PERGOLA_POST_MM = 150;
export const PERGOLA_SLAT_SPACING_MM = 300;
/** A new pergola: 15cm posts and slats. */
export const NEW_PERGOLA: Pergola = { postMm: PERGOLA_POST_MM, roof: "slats" };

/** A post stands about this often along a curve. */
export const CURVE_POST_SPACING_MM = 3000;
/** A straight side longer than this gets posts between its corners. */
export const MAX_SPAN_MM = 6000;
/** The size limits a typed number is held to. */
export const POST_MIN_MM = 50;
export const POST_MAX_MM = 600;
export const SPACING_MIN_MM = 50;
/** A turn sharper than this between two sides is a CORNER (a post); under it the outline runs on —
 *  the joints of a flattened curve, the tangent points of a rounded corner. */
const CORNER_DEG = 20;
/** Never more lines across one roof than this — a typed 1cm spacing on a 12m pergola. */
const MAX_LINES = 400;

const isRoof = (r: unknown): r is PergolaRoof => typeof r === "string" && (PERGOLA_ROOFS as readonly string[]).includes(r);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A spec with every field sane — what every reader gets, whatever was stored. */
export function pergolaSpec(p: Partial<Pergola> | undefined): Pergola {
  const postMm = Number.isFinite(p?.postMm) && p!.postMm! > 0 ? Math.round(clamp(p!.postMm!, POST_MIN_MM, POST_MAX_MM)) : PERGOLA_POST_MM;
  const out: Pergola = { postMm, roof: isRoof(p?.roof) ? p!.roof! : "slats" };
  if (Number.isFinite(p?.slatDirectionDeg)) out.slatDirectionDeg = ((Math.round(p!.slatDirectionDeg!) % 180) + 180) % 180;
  if (Number.isFinite(p?.slatSpacingMm) && p!.slatSpacingMm! > 0) out.slatSpacingMm = Math.round(Math.max(SPACING_MIN_MM, p!.slatSpacingMm!));
  const closed = [...new Set((p?.closedSides ?? []).filter((i) => Number.isInteger(i) && i >= 0))].sort((a, b) => a - b);
  if (closed.length) out.closedSides = closed;
  if (p?.legs === "none") out.legs = "none";
  else if (p?.legs === "custom") {
    out.legs = "custom";
    const seen = new Set<string>();
    out.posts = (p.posts ?? []).flatMap((q) => {
      if (!q || !Number.isInteger(q.side) || q.side < 0 || !Number.isFinite(q.t)) return [];
      const spot = { side: q.side, t: Math.round(clamp(q.t, 0, 1) * 10000) / 10000 };
      const key = `${spot.side}:${spot.t}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [spot];
    });
  }
  return out;
}

/** A venue feature's pergola. Absent reads as a new one's. */
export function pergolaOf(f: { pergola?: Pergola }): Pergola {
  return pergolaSpec(f.pergola);
}

/** What changing a field writes: the whole spec, cleaned. */
export function pergolaPatch(f: { pergola?: Pergola }, patch: Partial<Pergola>): { pergola: Pergola } {
  return { pergola: pergolaSpec({ ...pergolaOf(f), ...patch }) };
}

/** Whether a catalog row is a hired pergola. */
export function isPergolaRow(product: Pick<Product, "category"> | undefined): boolean {
  return product?.category === PERGOLA_CATEGORY;
}

/** A catalog row's post size (categoryFields.postMm) — undefined for a row that is not a pergola,
 *  which is what lets every ItemSymbol caller pass it without asking first. */
export function pergolaPostOf(product: Pick<Product, "category" | "categoryFields"> | undefined): number | undefined {
  if (!isPergolaRow(product)) return undefined;
  const v = Number(product?.categoryFields?.[POST_FIELD]);
  return Number.isFinite(v) && v > 0 ? clamp(v, POST_MIN_MM, POST_MAX_MM) : PERGOLA_POST_MM;
}

/** A catalog row as a pergola: its post, and its roof from the row's drawing style (SYMBOL_STYLES.
 *  pergola — slats are stored as no style). A row says nothing about slat direction or lattice. */
export function pergolaOfProduct(product: Pick<Product, "category" | "categoryFields" | "appearance"> | undefined): Pergola {
  const style = product?.appearance?.symbolStyle;
  return pergolaSpec({ postMm: pergolaPostOf(product) ?? PERGOLA_POST_MM, roof: isRoof(style) ? style : "slats" });
}

/** The same, from what the item drawing is handed: a roof style and a post size. */
export function pergolaFromStyle(style: string | undefined, postMm: number | undefined): Pergola {
  return pergolaSpec({ postMm, roof: isRoof(style) ? style : "slats" });
}

// ── geometry ──────────────────────────────────────────────────────────────────────────────────────

export interface PergolaPost {
  /** The post's middle, in the footprint's own frame. */
  at: Point;
  /** Its square's turn: the side it stands on. */
  deg: number;
  /** A post the designer put: its index in `spec.posts` — what the canvas grips move and remove. */
  spot?: number;
}

export interface PergolaSide {
  /** The edge of the footprint's outline. */
  index: number;
  /** Along the outline itself… */
  outer: Point[];
  /** …along the beam line (half a post in)… */
  inner: Point[];
  /** …and a whole post in: the far edge of a lattice panel's band on the plan. */
  deep: Point[];
}

export interface PergolaGeometry {
  spec: Pergola;
  /** The post's square as it stands: the spec's, held to a fifth of the shape's short side. */
  postMm: number;
  /** The footprint's outline, flattened — its curves as chords. */
  outline: Point[];
  /** The beam line: the outline moved half a post in, through the posts' middles. */
  ring: Point[];
  sides: PergolaSide[];
  posts: PergolaPost[];
  /** The slats' direction as drawn (the spec's, or across the long side) and their spacing. */
  slatDeg: number;
  spacingMm: number;
  /** The shape's box, as drawn. */
  widthMm: number;
  depthMm: number;
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Point) => Math.hypot(v.x, v.y);
const headingDeg = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

function signedArea(poly: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function pathLength(path: readonly Point[]): number {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += len(sub(path[i], path[i - 1]));
  return L;
}

/** The point `s` mm along a path, and the heading there. */
function alongPath(path: readonly Point[], s: number): { p: Point; deg: number } {
  let left = Math.max(0, s);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const l = len(sub(b, a));
    if (l > 0 && (left <= l || i === path.length - 1)) {
      const t = Math.min(1, left / l);
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, deg: headingDeg(a, b) };
    }
    left -= l;
  }
  const a = path[Math.max(0, path.length - 2)];
  const b = path[path.length - 1];
  return { p: { ...b }, deg: a && b ? headingDeg(a, b) : 0 };
}

/** A closed polygon moved `h` toward its inside, vertex by vertex (a mitre, held to 4h at a sharp
 *  spike). `sgn` is the polygon's winding: +1 when its shoelace area is positive. */
function insetPolygon(poly: readonly Point[], h: number, sgn: number): Point[] {
  const n = poly.length;
  const normal = (a: Point, b: Point): Point => {
    const d = sub(b, a);
    const l = len(d) || 1;
    return { x: (-d.y / l) * sgn, y: (d.x / l) * sgn };
  };
  return poly.map((v, i) => {
    const n1 = normal(poly[(i - 1 + n) % n], v);
    const n2 = normal(v, poly[(i + 1) % n]);
    const dot = n1.x * n2.x + n1.y * n2.y;
    let k = 1 + dot > 0.1 ? h / (1 + dot) : 0;
    let off = k ? { x: (n1.x + n2.x) * k, y: (n1.y + n2.y) * k } : { x: n2.x * h, y: n2.y * h };
    const m = len(off);
    if (m > 4 * h) {
      k = (4 * h) / m;
      off = { x: off.x * k, y: off.y * k };
    }
    return { x: v.x + off.x, y: v.y + off.y };
  });
}

/** The outline a pergola is read from: the footprint's own (the biggest piece of a composite). */
function baseOutline(footprint: Footprint): BuiltOutline | null {
  const pieces = footprintOutlines(footprint).filter((o) => o.outline.length >= 2 && !o.open);
  if (!pieces.length) return null;
  const flat = (o: BuiltOutline) => o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % o.outline.length], o.edgeCurves?.[i]).slice(0, -1));
  return pieces.reduce((best, o) => (Math.abs(signedArea(flat(o))) > Math.abs(signedArea(flat(best))) ? o : best));
}

/** The pergola's sides, named by where each faces — the closed-sides toggles' words. */
export function pergolaSides(footprint: Footprint): HollowSide[] {
  const base = baseOutline(footprint);
  return base ? hollowSides(base) : [];
}

/** Everything a pergola is drawn and built from, in its footprint's own frame. Null for a shape
 *  with no inside (a line, nothing). */
export function pergolaGeometry(footprint: Footprint, spec: Pergola): PergolaGeometry | null {
  const base = baseOutline(footprint);
  if (!base || base.outline.length < 2) return null;
  const P = base.outline;
  const n = P.length;
  // Flatten, remembering where each edge starts.
  const outline: Point[] = [];
  const start: number[] = [];
  for (let i = 0; i < n; i++) {
    start.push(outline.length);
    const pts = flattenEdge(P[i], P[(i + 1) % n], base.edgeCurves?.[i]);
    for (let k = 0; k < pts.length - 1; k++) {
      const q = pts[k];
      const last = outline[outline.length - 1];
      if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 0.01) outline.push(q);
      else if (k === 0) start[i] = outline.length - 1;
    }
  }
  if (outline.length < 3) return null;
  const area = signedArea(outline);
  if (Math.abs(area) < 1) return null;
  const sgn = area > 0 ? 1 : -1;
  const box = sampledBounds([base]);
  // A post never more than a fifth of the shape across — a model-sized pergola still has room inside.
  const postMm = Math.max(1, Math.min(spec.postMm, 0.2 * Math.min(box.w, box.h)));
  const h = postMm / 2;
  const ring = insetPolygon(outline, h, sgn);
  const deep = insetPolygon(outline, postMm, sgn);
  const N = outline.length;
  const slice = (path: readonly Point[], from: number, to: number) => {
    const out: Point[] = [];
    for (let k = from; ; k = (k + 1) % N) {
      out.push(path[k]);
      if (k === to) break;
    }
    return out;
  };
  const sides: PergolaSide[] = P.map((_, i) => {
    const from = start[i];
    const to = start[(i + 1) % n];
    return { index: i, outer: slice(outline, from, to), inner: slice(ring, from, to), deep: slice(deep, from, to) };
  });

  // Which of the drawn points are CORNERS: the turn from the chord arriving to the chord leaving.
  const turnAt = (k: number) => {
    const a = headingDeg(outline[(k - 1 + N) % N], outline[k]);
    const b = headingDeg(outline[k], outline[(k + 1) % N]);
    const d = Math.abs((((b - a) % 360) + 540) % 360 - 180);
    return d;
  };
  const sharp = P.map((_, i) => turnAt(start[i]) > CORNER_DEG);
  const curved = P.map((_, i) => !!base.edgeCurves?.[i]);

  const posts: PergolaPost[] = [];
  const put = (p: Point, deg: number, spot?: number) => {
    if (posts.some((q) => Math.hypot(q.at.x - p.x, q.at.y - p.y) < postMm)) return;
    posts.push({ at: { x: p.x, y: p.y }, deg, ...(spot === undefined ? {} : { spot }) });
  };
  const legs = spec.legs ?? "auto";
  // Put by hand: each where it was put along its side's beam line. A side the outline no longer has
  // (a corner removed since) takes its posts with it.
  if (legs === "custom") {
    (spec.posts ?? []).forEach((s, k) => {
      const side = sides[s.side];
      if (!side) return;
      const at = alongPath(side.inner, s.t * pathLength(side.inner));
      put(at.p, at.deg, k);
    });
  }
  if (legs === "auto") {
    // Every corner.
    P.forEach((_, i) => {
      if (sharp[i]) put(ring[start[i]], headingDeg(outline[start[i]], outline[(start[i] + 1) % N]));
    });
    // A long straight side: posts between its corners.
    P.forEach((_, i) => {
      if (curved[i]) return;
      const path = sides[i].inner;
      const L = pathLength(path);
      const between = Math.ceil(L / MAX_SPAN_MM) - 1;
      for (let k = 1; k <= between; k++) {
        const at = alongPath(path, (L * k) / (between + 1));
        put(at.p, at.deg);
      }
    });
    // Curves: runs of curved sides joined smoothly, posts about every CURVE_POST_SPACING_MM.
    const runs: { from: number; to: number }[] = [];
    for (let i = 0; i < n; i++) {
      if (!curved[i]) continue;
      const prev = (i - 1 + n) % n;
      if (curved[prev] && !sharp[i]) continue; // inside a run
      let j = i;
      while (curved[(j + 1) % n] && !sharp[(j + 1) % n] && (j + 1) % n !== i) j = (j + 1) % n;
      runs.push({ from: i, to: j });
    }
    const loop = runs.length === 0 && curved.every(Boolean);
    if (loop) {
      // A round pergola (or one whose every side is curved and joined smoothly): round its rim.
      const path = [...ring, ring[0]];
      const L = pathLength(path);
      const count = Math.max(4, Math.round(L / CURVE_POST_SPACING_MM));
      for (let k = 0; k < count; k++) {
        const at = alongPath(path, (L * k) / count);
        put(at.p, at.deg);
      }
    }
    for (const run of runs) {
      const path: Point[] = [];
      for (let i = run.from; ; i = (i + 1) % n) {
        const part = sides[i].inner;
        path.push(...(path.length ? part.slice(1) : part));
        if (i === run.to) break;
      }
      const L = pathLength(path);
      const fromSharp = sharp[run.from];
      const toSharp = sharp[(run.to + 1) % n];
      if (fromSharp && toSharp) {
        // Between two corners (a bowed side): the corners carry its ends.
        const between = Math.ceil(L / CURVE_POST_SPACING_MM) - 1;
        for (let k = 1; k <= between; k++) {
          const at = alongPath(path, (L * k) / (between + 1));
          put(at.p, at.deg);
        }
      } else {
        // A rounded corner, or a curve that runs on smoothly into a straight side: at least one, on
        // its middle.
        const count = Math.max(1, Math.round(L / CURVE_POST_SPACING_MM));
        for (let k = 0; k < count; k++) {
          const at = alongPath(path, (L * (k + 0.5)) / count);
          put(at.p, at.deg);
        }
      }
    }

  }

  const slatDeg = spec.slatDirectionDeg ?? (box.w >= box.h ? 90 : 0);
  return {
    spec,
    postMm,
    outline,
    ring,
    sides,
    posts,
    slatDeg,
    spacingMm: Math.max(SPACING_MIN_MM, spec.slatSpacingMm ?? PERGOLA_SLAT_SPACING_MM),
    widthMm: box.w,
    depthMm: box.h,
  };
}

// ── posts put by hand ─────────────────────────────────────────────────────────────────────────────

/** The beam line's nearest point to `p` (the footprint's own frame): the side, how far along it, and
 *  how far `p` is from it — where a click puts a post, and where a dragged one slides to. */
export function beamSpotAt(g: PergolaGeometry, p: Point): { spot: PergolaPostSpot; at: Point; distanceMm: number } | null {
  let best: { spot: PergolaPostSpot; at: Point; distanceMm: number } | null = null;
  for (const side of g.sides) {
    const path = side.inner;
    const L = pathLength(path);
    if (L < 1) continue;
    let run = 0;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1];
      const b = path[k];
      const d = sub(b, a);
      const l2 = d.x * d.x + d.y * d.y;
      const l = Math.sqrt(l2);
      const u = l2 > 0 ? clamp(((p.x - a.x) * d.x + (p.y - a.y) * d.y) / l2, 0, 1) : 0;
      const at = { x: a.x + d.x * u, y: a.y + d.y * u };
      const dist = len(sub(p, at));
      if (!best || dist < best.distanceMm - 0.01) best = { spot: { side: side.index, t: Math.round(clamp((run + u * l) / L, 0, 1) * 10000) / 10000 }, at, distanceMm: dist };
      run += l;
    }
  }
  return best;
}

/** The posts a pergola would stand on by itself, as spots — where "מותאם" starts from. */
export function autoPostSpots(footprint: Footprint, spec: Pergola): PergolaPostSpot[] {
  const g = pergolaGeometry(footprint, { ...spec, legs: undefined, posts: undefined });
  if (!g) return [];
  return g.posts.flatMap((post) => {
    const hit = beamSpotAt(g, post.at);
    return hit ? [hit.spot] : [];
  });
}

/** What choosing how the posts stand writes (merged by pergolaPatch). "מותאם" begins at the posts it
 *  stood on a moment ago; "אוטומטי" forgets the hand-put ones. */
export function legsPatch(footprint: Footprint, spec: Pergola, legs: PergolaLegs): Partial<Pergola> {
  if (legs !== "custom") return { legs, posts: undefined };
  return { legs, posts: spec.legs === "custom" ? spec.posts ?? [] : autoPostSpots(footprint, spec) };
}

/** A post put at `spot`, moved to it, or taken away — each the whole list again. */
export const postsAdded = (spec: Pergola, spot: PergolaPostSpot): PergolaPostSpot[] => [...(spec.posts ?? []), spot];
export const postsMoved = (spec: Pergola, index: number, spot: PergolaPostSpot): PergolaPostSpot[] => (spec.posts ?? []).map((q, i) => (i === index ? spot : q));
export const postsRemoved = (spec: Pergola, index: number): PergolaPostSpot[] => (spec.posts ?? []).filter((_, i) => i !== index);

/** Parallel lines `deg` in the pergola's frame, `spacingMm` apart on centres struck from the middle,
 *  each clipped to the beam line — the slats, a solid roof's hatch, a cloth's diagonals. A line
 *  closer than a third of the spacing to the edge it runs along is left off: the beam is there. */
export function pergolaLines(g: Pick<PergolaGeometry, "ring">, deg: number, spacingMm: number): [Point, Point][] {
  const poly = g.ring;
  if (poly.length < 3) return [];
  const r = (deg * Math.PI) / 180;
  const u = { x: Math.cos(r), y: Math.sin(r) };
  const v = { x: -u.y, y: u.x };
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of poly) {
    const o = p.x * v.x + p.y * v.y;
    lo = Math.min(lo, o);
    hi = Math.max(hi, o);
  }
  let step = Math.max(SPACING_MIN_MM, spacingMm);
  if ((hi - lo) / step > MAX_LINES) step = (hi - lo) / MAX_LINES;
  const margin = step / 3;
  const out: [Point, Point][] = [];
  for (let k = Math.ceil((lo + margin) / step); k * step <= hi - margin; k++) {
    const o = k * step;
    const hits: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = a.x * v.x + a.y * v.y - o;
      const db = b.x * v.x + b.y * v.y - o;
      if (da < 0 === db < 0) continue;
      const t = da / (da - db);
      hits.push((a.x + (b.x - a.x) * t) * u.x + (a.y + (b.y - a.y) * t) * u.y);
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      if (hits[i + 1] - hits[i] < 1) continue;
      const at = (s: number): Point => ({ x: u.x * s + v.x * o, y: u.y * s + v.y * o });
      out.push([at(hits[i]), at(hits[i + 1])]);
    }
  }
  return out;
}

/** The roof as lines on the plan: the slats; a solid roof's faint hatch across them; a cloth's
 *  diagonals; nothing for beams only. */
export function pergolaRoofLines(g: PergolaGeometry): [Point, Point][] {
  switch (g.spec.roof) {
    case "slats":
      return pergolaLines(g, g.slatDeg, g.spacingMm);
    case "solid":
      return pergolaLines(g, g.slatDeg + 45, Math.max(150, g.spacingMm * 0.6));
    case "fabric":
      return pergolaLines(g, g.slatDeg + 45, Math.max(400, g.spacingMm * 2));
    case "none":
      return [];
  }
}

/** A closed side's lattice on the plan: crossing ticks across the band from the outline to a post's
 *  depth in, every `pitchMm` along it. */
export function latticeTicks(side: PergolaSide, pitchMm = 150): [Point, Point][] {
  const outer = side.outer;
  const deep = side.deep;
  const L = pathLength(outer);
  const Ld = pathLength(deep);
  if (L < 1 || Ld < 1) return [];
  const count = Math.max(1, Math.round(L / pitchMm));
  const out: [Point, Point][] = [];
  for (let k = 0; k < count; k++) {
    const s0 = k / count;
    const s1 = (k + 1) / count;
    out.push([alongPath(outer, s0 * L).p, alongPath(deep, s1 * Ld).p]);
    out.push([alongPath(outer, s1 * L).p, alongPath(deep, s0 * Ld).p]);
  }
  return out;
}

/** A post's square as a polygon, in the frame the geometry is in. */
export function postSquare(post: PergolaPost, sizeMm: number): Point[] {
  const r = (post.deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const h = sizeMm / 2;
  return [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ].map(([x, y]) => ({ x: post.at.x + x * c - y * s, y: post.at.y + x * s + y * c }));
}

/** The posts' squares in the ROOM: the geometry's posts carried by the item's place and turn (and
 *  mirror and drawing scale, for a placement) — what the clearance check and the printed sheets
 *  keep a table off, since a table may stand anywhere under the roof. */
export function pergolaPostsInRoom(g: PergolaGeometry, at: Point, rotationDeg = 0, mirrored = false, scale = 1): Point[][] {
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return g.posts.map((post) =>
    postSquare(post, g.postMm).map((q) => {
      const x = (mirrored ? -q.x : q.x) * scale;
      const y = q.y * scale;
      return { x: at.x + x * c - y * s, y: at.y + x * s + y * c };
    }),
  );
}

// ponytail: self-check. Run: npm run check:pergola
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, eps = 1) => Math.abs(a - b) <= eps;
  const inside = (p: Point, poly: readonly Point[]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };

  // A 4 × 4: a post in each corner, inside the outline, its outer faces on it.
  const sq = pergolaGeometry({ kind: "rect", widthMm: 4000, depthMm: 4000 }, NEW_PERGOLA)!;
  assert(sq.posts.length === 4, `a 4 × 4 stands on four posts (got ${sq.posts.length})`);
  assert(sq.posts.every((p) => near(Math.abs(p.at.x), 1925) && near(Math.abs(p.at.y), 1925)), "…each in its corner, half a post in from both sides");
  const slats = pergolaRoofLines(sq);
  assert(slats.length >= 10 && slats.every(([a, b]) => near(a.x, b.x) && near(Math.abs(b.y - a.y), 3850)), `the slats run across it, from beam to beam (${slats.length})`);
  const xs = slats.map(([a]) => Math.round(a.x)).sort((a, b) => a - b);
  assert(xs.every((x, i) => i === 0 || near(x - xs[i - 1], 300)), "…30cm apart");
  assert(xs.includes(0), "…on centres struck from the middle");

  // The same row laid 6 × 4: the posts and the slats keep their millimetres; only the count grows.
  const wide = pergolaGeometry({ kind: "rect", widthMm: 6000, depthMm: 4000 }, NEW_PERGOLA)!;
  assert(wide.postMm === 150 && wide.spacingMm === 300, "stretched, a pergola keeps its post and its spacing");
  assert(wide.posts.length === 4, "…and a 6 m side still spans corner to corner");
  const wideSlats = pergolaRoofLines(wide);
  assert(wideSlats.every(([a, b]) => near(a.x, b.x)) && wideSlats.length > slats.length, "…its slats run across the long side, more of them");
  // A 12 m side does not.
  const long = pergolaGeometry({ kind: "rect", widthMm: 12000, depthMm: 4000 }, NEW_PERGOLA)!;
  assert(long.posts.length === 6, `a 12 m side gets a post in its middle (got ${long.posts.length})`);
  // A slat direction typed: along the width.
  const along = pergolaRoofLines(pergolaGeometry({ kind: "rect", widthMm: 6000, depthMm: 4000 }, { ...NEW_PERGOLA, slatDirectionDeg: 0 })!);
  assert(along.every(([a, b]) => near(a.y, b.y)), "a typed direction of 0 runs the slats along x");

  // Round: posts round the rim about every 3 m, at least four.
  const round = pergolaGeometry({ kind: "circle", diameterMm: 6000 }, NEW_PERGOLA)!;
  assert(round.posts.length === 6, `a ⌀6 pergola stands on six posts (got ${round.posts.length})`);
  assert(round.posts.every((p) => near(Math.hypot(p.at.x, p.at.y), 2925, 15)), "…on its rim, half a post in");
  const small = pergolaGeometry({ kind: "circle", diameterMm: 2500 }, NEW_PERGOLA)!;
  assert(small.posts.length === 4, "a small round one still stands on four");

  // A rounded rectangle (lib/studio/shaped-outline.ts makes the arcs): one post on each corner's
  // arc, none where the arc meets the side.
  const shaped = shapedOutline(
    [
      { x: -2000, y: -1500 },
      { x: 2000, y: -1500 },
      { x: 2000, y: 1500 },
      { x: -2000, y: 1500 },
    ],
    undefined,
    [600, 600, 600, 600],
  );
  const rounded = pergolaGeometry({ kind: "custom", outline: shaped.outline, edgeCurves: shaped.edgeCurves }, NEW_PERGOLA)!;
  assert(rounded.posts.length === 4, `a rounded rectangle stands on four posts (got ${rounded.posts.length})`);
  const cornerC = { x: 2000 - 600, y: 1500 - 600 };
  assert(rounded.posts.some((p) => near(Math.hypot(p.at.x - cornerC.x, p.at.y - cornerC.y), 600 - 75, 20)), "…each on its corner's arc, half a post in");

  // A side bowed out between two corners: the corners hold it, and a post between them on the bow.
  const bowed = pergolaGeometry(
    {
      kind: "custom",
      outline: [
        { x: -4000, y: -2000 },
        { x: 4000, y: -2000 },
        { x: 4000, y: 2000 },
        { x: -4000, y: 2000 },
      ],
      edgeCurves: [{ c1: { x: 2667, y: -1333 }, c2: { x: -2667, y: -1333 } }, null, null, null],
    },
    NEW_PERGOLA,
  )!;
  assert(bowed.posts.length >= 6, `a bowed 8 m side has posts along its bow as well as its corners (got ${bowed.posts.length})`);

  // An L: every slat inside the outline, none across the notch.
  const L = pergolaGeometry(
    {
      kind: "custom",
      outline: [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 3000 },
        { x: 3000, y: 3000 },
        { x: 3000, y: 6000 },
        { x: 0, y: 6000 },
      ],
    },
    NEW_PERGOLA,
  )!;
  assert(L.posts.length === 6, `an L stands on a post at each of its six corners (got ${L.posts.length})`);
  const Lslats = pergolaRoofLines(L);
  assert(Lslats.length > 0 && Lslats.every(([a, b]) => inside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, L.outline)), "…its slats all under its roof, none across the notch");

  // Roofs.
  assert(pergolaRoofLines(pergolaGeometry({ kind: "rect", widthMm: 4000, depthMm: 4000 }, { ...NEW_PERGOLA, roof: "none" })!).length === 0, "beams only: no lines across");
  const hatch = pergolaRoofLines(pergolaGeometry({ kind: "rect", widthMm: 4000, depthMm: 4000 }, { ...NEW_PERGOLA, roof: "solid" })!);
  assert(hatch.length > 0 && hatch.every(([a, b]) => !near(a.x, b.x) && !near(a.y, b.y)), "a solid roof is hatched across, at a slant");

  // Lattice: on the closed sides, between the outline and a post's depth in.
  const latticed = pergolaGeometry({ kind: "rect", widthMm: 4000, depthMm: 3000 }, { ...NEW_PERGOLA, closedSides: [1] })!;
  const ticks = latticeTicks(latticed.sides[1]);
  assert(ticks.length > 10 && ticks.every(([a, b]) => near(a.x, 2000) && near(b.x, 1850)), "a closed side is hatched across a post-deep band along it");
  assert(pergolaSides({ kind: "rect", widthMm: 4000, depthMm: 3000 }).map((s) => s.name).join() === "למעלה,ימין,למטה,שמאל", "the sides are named by where they face");

  // The spec, cleaned.
  assert(pergolaSpec(undefined).postMm === 150 && pergolaSpec(undefined).roof === "slats", "absent reads as a new pergola");
  assert(pergolaSpec({ postMm: 5, roof: "glass" as PergolaRoof }).postMm === POST_MIN_MM && pergolaSpec({ roof: "glass" as PergolaRoof }).roof === "slats", "a nonsense post or roof is held to sense");
  assert(pergolaSpec({ slatDirectionDeg: 270 }).slatDirectionDeg === 90, "a direction is a line: 270° is 90°");
  assert(JSON.stringify(pergolaSpec({ closedSides: [2, 0, 2, -1] }).closedSides) === "[0,2]", "closed sides unique, sorted, real");
  const row = { category: PERGOLA_CATEGORY, categoryFields: { postMm: 200 }, appearance: { shape: "rect" as const, content: "none" as const, symbolStyle: "fabric" } };
  assert(pergolaOfProduct(row).postMm === 200 && pergolaOfProduct(row).roof === "fabric", "a row's post is its categoryFields.postMm, its roof its drawing style");
  assert(pergolaPostOf({ category: "chuppahs", categoryFields: {} }) === undefined, "…and a row that is not a pergola has no post");
  assert(pergolaOfProduct({ category: PERGOLA_CATEGORY, categoryFields: {} }).roof === "slats", "a row with no style has slats");

  // Legs (2026-11-19): none, or put by hand on the beam line.
  const rect = { kind: "rect" as const, widthMm: 4000, depthMm: 3000 };
  assert(pergolaGeometry(rect, { ...NEW_PERGOLA, legs: "none" })!.posts.length === 0, "no legs: beams and roof, no posts");
  assert(pergolaRoofLines(pergolaGeometry(rect, { ...NEW_PERGOLA, legs: "none" })!).length > 0, "…its roof still across them");
  const auto = autoPostSpots(rect, NEW_PERGOLA);
  assert(auto.length === 4, `custom starts from the four automatic posts (got ${auto.length})`);
  const fromAuto = pergolaGeometry(rect, { ...NEW_PERGOLA, legs: "custom", posts: auto })!;
  const autoG = pergolaGeometry(rect, NEW_PERGOLA)!;
  assert(fromAuto.posts.length === 4 && fromAuto.posts.every((p) => autoG.posts.some((q) => near(p.at.x, q.at.x) && near(p.at.y, q.at.y))), "…standing exactly where the automatic ones stood");
  assert(fromAuto.posts.every((p, i) => p.spot === i), "…each knowing which spot it is");
  const mid = beamSpotAt(autoG, { x: 0, y: -1700 })!;
  assert(mid.spot.side === 0 && near(mid.spot.t, 0.5, 0.001) && near(mid.at.y, -1425), `a click near the top side's middle lands on its beam line, half way (side ${mid.spot.side}, t ${mid.spot.t})`);
  const five = pergolaSpec({ ...NEW_PERGOLA, legs: "custom", posts: postsAdded({ ...NEW_PERGOLA, posts: auto }, mid.spot) });
  assert(pergolaGeometry(rect, five)!.posts.length === 5, "a post put there is a fifth post");
  const wider = pergolaGeometry({ kind: "rect", widthMm: 8000, depthMm: 3000 }, five)!;
  assert(wider.posts.some((p) => near(p.at.x, 0) && near(p.at.y, -1425)), "…and it stays at its side's middle when the pergola is stretched");
  const moved = pergolaSpec({ ...five, posts: postsMoved(five, 4, { side: 0, t: 0.25 }) });
  assert(pergolaGeometry(rect, moved)!.posts.some((p) => p.spot === 4 && near(p.at.x, -963, 2)), "a post slid a quarter along its side");
  assert(pergolaGeometry(rect, pergolaSpec({ ...five, posts: postsRemoved(five, 0) }))!.posts.length === 4, "…and one taken away");
  assert(pergolaGeometry(rect, pergolaSpec({ ...NEW_PERGOLA, legs: "custom", posts: [{ side: 9, t: 0.5 }] }))!.posts.length === 0, "a post on a side the outline no longer has goes with it");
  assert(pergolaSpec({ legs: "custom", posts: [{ side: 1, t: 2 }, { side: 1, t: 1 }, { side: -1, t: 0 }] }).posts!.length === 1, "spots held to their side, unique, real");
  assert(pergolaSpec({ legs: "auto", posts: auto }).legs === undefined && pergolaSpec({ legs: "auto", posts: auto }).posts === undefined, "automatic is stored as nothing, and keeps no hand-put posts");
  const back = legsPatch(rect, five, "custom");
  assert(back.posts!.length === 5, "choosing מותאם again keeps the posts already put");

  // In the room: turned 90° about its place.
  const room = pergolaPostsInRoom(sq, { x: 10000, y: 5000 }, 90);
  assert(room.length === 4 && room.every((poly) => poly.every((q) => near(Math.abs(q.x - 10000), 1925, 76) && near(Math.abs(q.y - 5000), 1925, 76))), "its posts carried into the room");

  console.log(`pergola: ok (${sq.posts.length}/${round.posts.length}/${rounded.posts.length}/${L.posts.length} posts)`);
}
