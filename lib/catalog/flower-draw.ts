// How an arrangement is LAID OUT from above — which flower goes where — from its spec.
//
// An arrangement on the plan used to be one picture: five leaves and seven identical blooms, for
// a ⌀20 posy and a ⌀90 urn alike. This module builds the picture from what the catalog already
// says about the row: its flower spec (name × stems — lib/catalog/flower-kinds.ts says what each
// name looks like and how big one head is), its shade, its size and its FORM (a dome, a low
// cushion, a wild garden, a cascade, a runner, a cluster of bud vases — MapAppearance.symbolStyle
// for an arrangement, chosen in the appearance editor like a chair's style).
//
// Everything here is real size: a rose head is 76mm whether the arrangement is ⌀30 or ⌀90, so a
// bigger arrangement shows MORE flowers, never bigger ones, and the heads are thinned to what the
// surface has room for. The layout is seeded by the product, so the same arrangement draws the
// same on every table, in the catalog and on paper — and a different one on every product.
//
// Pure: no React, no DOM. components/flower-symbol.tsx turns the items into SVG. The composition is
// memoised per spec object (the spec is cached per product/shade/size upstream), so a plan with
// sixty arrangements lays each product out once. `npm run check:flower-draw`.
import { FLOWER_KIND_BY_ID, type FlowerKindId } from "./flower-kinds";
import { isMain } from "../self-check";

export type FlowerForm = "dome" | "cushion" | "garden" | "cascade" | "runner" | "bud" | "single";

/** The forms the appearance editor offers. `single` is for a stem on its own (a flower product
 *  from the marketplace dropped on a table) and is never picked. */
export const FLOWER_FORMS: FlowerForm[] = ["dome", "cushion", "garden", "cascade", "runner", "bud"];

export const FLOWER_FORM_LABEL: Record<FlowerForm, string> = {
  dome: "כיפה",
  cushion: "כרית נמוכה",
  garden: "גן פראי",
  cascade: "א־סימטרי / מפל",
  runner: "ראנר",
  bud: "אשכול בקבוקונים",
  single: "פרח בודד",
};

export const FLOWER_FORM_HINT: Record<FlowerForm, string> = {
  dome: "עגולה ומלאה; העלים נשפכים מכל הצדדים.",
  cushion: "צפופה עד השפה, כמעט בלי ירק — מרכז שולחן נמוך.",
  garden: "אוורירית ולא סימטרית; ענפים באורכים שונים וכמה פרחים על גבעול ארוך.",
  cascade: "רוב הפרחים בצד אחד, והסידור נשפך לכיוון השני.",
  runner: "לאורך שולחן ארוך: בסיס של ירק ואשכולות פרחים לאורכו.",
  bud: "כמה אגרטלונים קטנים, ובכל אחד פרח או שניים.",
  single: "",
};

export function isFlowerForm(value: unknown): value is FlowerForm {
  return typeof value === "string" && value in FLOWER_FORM_LABEL;
}

/** The form an arrangement takes when its row says nothing: a strip is a runner; up to 30cm tall
 *  it is a low cushion; anything taller is a dome. Height is the catalog's `heightMm`. */
export function defaultFlowerForm(heightMm: number | undefined, w: number, h: number): FlowerForm {
  if (Math.max(w, h) >= Math.min(w, h) * 2.2) return "runner";
  return heightMm !== undefined && heightMm > 0 && heightMm <= 300 ? "cushion" : "dome";
}

/** One row of the spec as the drawing reads it: resolved to a kind, with the colour the row pins
 *  (absent = follows the shade, or the kind's own colour) and a head size when a known flower
 *  product carries one. */
export interface DrawLine {
  kind: FlowerKindId;
  qty: number;
  colour?: string;
  headMm?: number;
}

export interface FlowerDrawSpec {
  form: FlowerForm;
  /** The footprint's box, mm. */
  w: number;
  h: number;
  lines: DrawLine[];
  /** The shade picked for it (its variant's swatch), or the row's fill. Absent = the default blush. */
  shade?: string;
  seed: number;
}

export type Point = { x: number; y: number };

export type FlowerItem =
  /** The foliage mass the flowers sit in, showing in the gaps. */
  | { t: "base"; d: Point[] }
  /** A head or a filler cluster: its centre, radius, colour, turn, and the foreshortening of a
   *  head on the slope of the dome (`sc` across `ang`). `z` orders the paint within its layer. */
  | { t: "head" | "fill"; kind: FlowerKindId; x: number; y: number; r: number; col: string; rot: number; sc: number; ang: number; z: number }
  /** A sprig of greenery from (x,y) along `ang`, `len` long, bowed by `bend`. */
  | { t: "green"; kind: FlowerKindId; x: number; y: number; ang: number; len: number; bend: number; col: string }
  /** An orchid spray arching out. */
  | { t: "trail"; x: number; y: number; ang: number; len: number; bend: number; col: string }
  /** A stem out to a flower standing proud of the mass (the garden form). */
  | { t: "stem"; x1: number; y1: number; x2: number; y2: number }
  /** A bud vase, seen from above. */
  | { t: "bottle"; x: number; y: number; r: number };

const TAU = Math.PI * 2;

// ── colour ──────────────────────────────────────────────────────────────────────────────────────

const hex2rgb = (h: string): [number, number, number] => {
  const s = h.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
};
const rgb2hex = (a: number[]) => "#" + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const isHex = (c: string | undefined): c is string => !!c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim());

export const mix = (a: string, b: string, t: number): string => {
  const A = hex2rgb(a);
  const B = hex2rgb(b);
  return rgb2hex(A.map((v, i) => v + (B[i] - v) * t));
};
export const lighten = (c: string, t: number) => mix(c, "#ffffff", t);
export const darken = (c: string, t: number) => mix(c, "#2b2130", t);
export const luminance = (c: string): number => {
  const [r, g, b] = hex2rgb(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
export const isPale = (c: string) => luminance(c) > 0.86;

/** The colour nothing was told: the blush every arrangement used to be drawn in. */
export const DEFAULT_SHADE = "#E8BCCE";

export interface LineColour {
  col: string;
  /** A second colour some heads of the line take, for a mixed line (a two-tone shade). */
  alt?: string;
}

/**
 * The colour each line is drawn in.
 *
 * A pinned colour wins. A kind with a colour of its own (greens, gypsophila) keeps it. Everything
 * else follows the SHADE — one swatch, from which the lines that follow it take their colours in
 * turn: the swatch itself, a lighter tint of it, a lighter one, white — so a pink arrangement of
 * roses, lisianthus and phlox is pink, pale pink and near-white rather than one flat pink. A pale
 * shade ("לבן") is white, cream and a pale green. Fillers take the gentler end of the same run.
 */
export function lineColours(lines: readonly DrawLine[], shade?: string): LineColour[] {
  const c = isHex(shade) ? shade.trim() : DEFAULT_SHADE;
  const pale = isPale(c);
  const heads = pale ? ["#FFFFFF", "#F3EBDD", "#E4ECDA"] : [c, lighten(c, 0.72), lighten(c, 0.38), "#FFFFFF"];
  const anyHead = lines.some((l) => FLOWER_KIND_BY_ID[l.kind].role === "head" && !isHex(l.colour) && !FLOWER_KIND_BY_ID[l.kind].natural);
  const fills = pale ? ["#FFFFFF", "#EEF2E6"] : anyHead ? [lighten(c, 0.45), "#FFFFFF", lighten(c, 0.2)] : [c, lighten(c, 0.5)];
  let h = 0;
  let f = 0;
  return lines.map((l) => {
    const kind = FLOWER_KIND_BY_ID[l.kind];
    if (isHex(l.colour)) return { col: l.colour.trim() };
    if (kind.natural) return { col: kind.natural };
    if (kind.role === "fill") return { col: fills[f++ % fills.length] };
    const col = heads[h++ % heads.length];
    return { col, alt: pale ? undefined : heads[h % heads.length] };
  });
}

// ── the mix when a row has no spec ──────────────────────────────────────────────────────────────

/** Roses, lisianthus, phlox, gypsophila and eucalyptus: what an arrangement with no spec is drawn
 *  as, scaled to its typed stem count when it has one (a ⌀20 posy of "50 stems" is 50 stems). */
export function defaultMix(stems?: number): DrawLine[] {
  const base: DrawLine[] = [
    { kind: "rose", qty: 40 },
    { kind: "lisianthus", qty: 25 },
    { kind: "phlox", qty: 15 },
    { kind: "gyps", qty: 10 },
    { kind: "euca", qty: 20 },
  ];
  if (!stems || stems <= 0) return base;
  const k = stems / 110;
  return base.map((l) => ({ ...l, qty: Math.max(1, Math.round(l.qty * k)) }));
}

// ── seeded randomness ───────────────────────────────────────────────────────────────────────────

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from a string (a product id), so the same row draws the same everywhere. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── placing ─────────────────────────────────────────────────────────────────────────────────────

type Disc = { x: number; y: number; r: number };

const headRadius = (l: DrawLine) => (l.headMm ?? FLOWER_KIND_BY_ID[l.kind].headMm) / 2;
const discArea = (r: number, k: number) => Math.PI * (r * k) ** 2;

function fits(p: Point, r: number, placed: readonly Disc[], k: number): boolean {
  for (const q of placed) {
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const m = (r + q.r) * k;
    if (dx * dx + dy * dy < m * m) return false;
  }
  return true;
}

function place(r: number, placed: readonly Disc[], k: number, sample: (r: number) => Point | null, tries = 60): Point | null {
  for (let i = 0; i < tries; i++) {
    const p = sample(r);
    if (p && fits(p, r, placed, k)) return p;
  }
  return null;
}

/** How long a sprig from (x,y) along `dir` is for its tip to stand `target` from the middle. */
function reachLen(x: number, y: number, dir: number, target: number): number {
  const b = x * Math.cos(dir) + y * Math.sin(dir);
  const c = x * x + y * y - target * target;
  const disc = b * b - c;
  return disc > 0 ? Math.max(target * 0.15, -b + Math.sqrt(disc)) : target * 0.15;
}

/** One entry per head to draw, from the rows' stem counts, shuffled so the kinds mingle. */
function headList<T extends DrawLine>(rows: readonly T[], rng: () => number): T[] {
  const out: T[] = [];
  for (const r of rows) {
    const n = Math.round(r.qty / FLOWER_KIND_BY_ID[r.kind].perHead);
    for (let i = 0; i < n; i++) out.push(r);
  }
  return shuffle(out, rng);
}

/** Keep only as many heads as there is room for, dropping at random so the mix survives. */
function thin<T extends DrawLine>(list: T[], room: number, k: number, rng: () => number): T[] {
  const demand = list.reduce((s, r) => s + discArea(headRadius(r), k), 0);
  if (demand <= room) return list;
  const keep = room / demand;
  return list.filter(() => rng() < keep);
}

interface FormSpec {
  /** The flower mass's radius as a fraction of the box's. */
  core: number;
  /** How closely the heads pack (1 = touching). */
  pack: number;
  /** The foreshortening of a head at the rim (1 = none). */
  fore: number;
  /** The foliage mass's radius as a fraction of the box's. */
  base: number;
  /** The greens: how many on a ⌀60, where they start (fractions of R), how far they reach. */
  greens: { n: number; from: [number, number]; reach: [number, number]; even?: boolean };
  /** An uneven, lobed mass. */
  wobble?: number;
  /** The mass shifted along x (a cascade sits off-centre). */
  shift?: number;
  /** Flowers spilling out toward +x. */
  fall?: boolean;
  /** Flowers standing proud of the mass on long stems. */
  reach?: number;
}

const FORMS: Record<Exclude<FlowerForm, "runner" | "bud" | "single">, FormSpec> = {
  dome: { core: 0.84, pack: 0.8, fore: 0.55, base: 0.86, greens: { n: 22, from: [0.62, 0.8], reach: [0.88, 1], even: true } },
  cushion: { core: 0.95, pack: 0.7, fore: 0.85, base: 0.95, greens: { n: 10, from: [0.82, 0.9], reach: [0.97, 1], even: true } },
  garden: { core: 0.66, wobble: 0.2, pack: 1.0, fore: 0.6, base: 0.64, greens: { n: 16, from: [0.3, 0.55], reach: [0.62, 1] }, reach: 3 },
  cascade: { core: 0.5, shift: -0.38, pack: 0.82, fore: 0.55, base: 0.52, fall: true, greens: { n: 16, from: [0.25, 0.45], reach: [0.9, 1] } },
};

type Coloured = DrawLine & LineColour;
const pickColour = (row: Coloured, rng: () => number) => (row.alt && rng() < 0.28 ? row.alt : row.col);
const byRole = (rows: readonly Coloured[], role: string) => rows.filter((r) => FLOWER_KIND_BY_ID[r.kind].role === role);

function composeRound(rows: readonly Coloured[], R: number, F: FormSpec, rng: () => number): FlowerItem[] {
  const items: FlowerItem[] = [];
  const cx = (F.shift ?? 0) * R;
  const cy = 0;
  const wob = F.wobble ?? 0;
  const ph1 = rng() * TAU;
  const ph2 = rng() * TAU;
  const core = (a: number) => R * F.core * (1 + wob * (0.6 * Math.sin(3 * a + ph1) + 0.4 * Math.sin(5 * a + ph2)));
  const sample = (r: number): Point => {
    const a = rng() * TAU;
    const lim = Math.max(0, core(a) - r * 0.4);
    const d = Math.sqrt(rng()) * lim;
    return { x: cx + d * Math.cos(a), y: cy + d * Math.sin(a) };
  };

  // The foliage the flowers sit in, showing in the gaps: a lumpy edge, never a plate.
  const ph3 = rng() * TAU;
  const bpts: Point[] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * TAU;
    const rr = ((core(a) * F.base) / F.core) * (1 + 0.035 * Math.sin(11 * a + ph3) + 0.025 * Math.sin(17 * a));
    bpts.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
  }
  items.push({ t: "base", d: bpts });

  const heads = byRole(rows, "head");
  const fills = byRole(rows, "fill");
  const greens = byRole(rows, "green");
  const trails = byRole(rows, "trail");
  const area = Math.PI * (R * F.core) ** 2;
  const rim = R * F.core * 1.1;
  const fore = (x: number, y: number) => {
    const d = Math.hypot(x - cx, y - cy);
    return { sc: Math.max(F.fore, Math.sqrt(Math.max(0, 1 - (d / rim) ** 2))), ang: Math.atan2(y - cy, x - cx), z: -d };
  };

  // Heads first, never more than the mass has room for. The big ones (hydrangea, peony, lily) are
  // set first; the rest go in mixed, so a small flower is not crowded out by the order.
  const list = thin(headList(heads, rng), area * (fills.length ? 0.8 : 0.97), F.pack, rng).sort(
    (a, b) => Number(headRadius(b) >= 60) - Number(headRadius(a) >= 60),
  );
  const placed: Disc[] = [];
  for (const r of list) {
    const s = headRadius(r);
    const p = place(s, placed, F.pack, sample);
    if (p) {
      placed.push({ x: p.x, y: p.y, r: s });
      items.push({ t: "head", kind: r.kind, x: p.x, y: p.y, r: s, col: pickColour(r, rng), rot: rng() * TAU, ...fore(p.x, p.y) });
    }
  }

  // Then the fillers, into whatever gaps the heads left.
  const used = placed.reduce((s, h) => s + discArea(h.r, F.pack), 0);
  const flist = thin(headList(fills, rng), Math.max(0, area * 0.97 - used), 0.85, rng);
  const all = placed.slice();
  for (const r of flist) {
    const s = headRadius(r);
    const p = place(s, all, heads.length ? 0.74 : F.pack, sample, 40);
    if (!p) continue;
    all.push({ x: p.x, y: p.y, r: s });
    items.push({ t: "fill", kind: r.kind, x: p.x, y: p.y, r: s, col: pickColour(r, rng), rot: rng() * TAU, ...fore(p.x, p.y) });
  }

  // A cascade falls toward +x: a tapering run of smaller flowers out of the mass, fillers between.
  if (F.fall && (heads.length || fills.length)) {
    const src = heads.length ? heads : fills;
    const fsrc = fills.length ? fills : src;
    for (let k = 0; k < 9; k++) {
      const t = k / 8;
      const r = src[k % src.length];
      const x = cx + R * F.core * 0.85 + t * R * 0.72;
      const y = R * 0.12 * Math.sin(t * 4.5 + ph1);
      items.push({ t: "head", kind: r.kind, x, y, r: headRadius(r) * (1 - 0.4 * t), col: pickColour(r, rng), rot: rng() * TAU, sc: 0.8, ang: 0, z: -R * 3 + k });
      if (k % 2) {
        const f = fsrc[k % fsrc.length];
        items.push({ t: "fill", kind: f.kind, x: x - R * 0.05, y: y + (k % 4 === 1 ? 1 : -1) * R * 0.11, r: headRadius(f) * 0.8, col: pickColour(f, rng), rot: rng() * TAU, sc: 1, ang: 0, z: 0 });
      }
    }
  }

  // A garden arrangement has a few flowers out on long stems.
  if (F.reach) {
    const src = heads.length ? heads : fills;
    for (let i = 0; i < F.reach && src.length; i++) {
      const r = src[i % src.length];
      const a = rng() * TAU;
      const d = R * (0.74 + rng() * 0.14);
      const x = cx + d * Math.cos(a);
      const y = cy + d * Math.sin(a);
      items.push({ t: "stem", x1: cx + R * 0.4 * Math.cos(a), y1: cy + R * 0.4 * Math.sin(a), x2: x, y2: y });
      items.push({ t: "head", kind: r.kind, x, y, r: headRadius(r) * 0.85, col: pickColour(r, rng), rot: rng() * TAU, sc: 0.8, ang: a, z: -d - R });
    }
  }

  // Greenery under it all, its tips past the flowers. As many sprigs as the rim has room for —
  // the leaves are real size, so a small posy gets a few short sprigs, an urn a ring of long ones.
  const gk: Coloured[] = greens.length ? greens : [{ kind: "euca", qty: 1, col: FLOWER_KIND_BY_ID.euca.natural! }];
  const gq = gk.reduce((s, r) => s + r.qty, 0);
  const gn = Math.max(4, Math.min(40, Math.round(F.greens.n * (R / 300) * (greens.length ? 1 : 0.7))));
  const kinds: Coloured[] = [];
  for (const r of gk) {
    const n = Math.max(1, Math.round((gn * r.qty) / gq));
    for (let i = 0; i < n; i++) kinds.push(r);
  }
  shuffle(kinds, rng);
  kinds.forEach((g, i) => {
    let a: number;
    if (F.fall) a = i % 3 === 2 ? Math.PI + (rng() - 0.5) * 2.4 : (rng() - 0.5) * 1.1;
    else a = F.greens.even ? (i / kinds.length) * TAU + (rng() - 0.5) * 0.35 : rng() * TAU;
    const [f0, f1] = F.greens.from;
    const from = R * (f0 + rng() * (f1 - f0));
    const x = cx + from * Math.cos(a);
    const y = cy + from * Math.sin(a);
    // Not straight out from the middle: a sprig leans, and curves.
    const dir = a + (rng() - 0.5) * 1.1;
    const reach = R * (F.greens.reach[0] + rng() * (F.greens.reach[1] - F.greens.reach[0]));
    const len = reachLen(x, y, dir, reach);
    items.push({ t: "green", kind: g.kind, x, y, ang: dir, len, bend: len * 0.22 * (rng() * 2 - 1), col: g.col });
  });

  // Orchids arch out over the rim.
  for (const r of trails) {
    const k = Math.max(1, Math.min(4, Math.round(r.qty / 4)));
    for (let i = 0; i < k; i++) {
      const a = F.fall ? (rng() - 0.5) * 0.9 : (i / k) * TAU + rng() * 0.8;
      const from = R * (F.fall ? 0.05 : 0.32);
      const x = cx + from * Math.cos(a);
      const y = cy + from * Math.sin(a);
      const len = reachLen(x, y, a, R * 0.98);
      items.push({ t: "trail", x, y, ang: a, len, bend: len * 0.18 * (rng() < 0.5 ? 1 : -1), col: pickColour(r, rng) });
    }
  }
  return items;
}

function composeRunner(rows: readonly Coloured[], L: number, D: number, rng: () => number): FlowerItem[] {
  const items: FlowerItem[] = [];
  const half = (x: number) => D * 0.3 * Math.sqrt(Math.max(0, 1 - ((2 * x) / L) ** 4));
  const top: Point[] = [];
  const bottom: Point[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = (-L / 2) * 0.97 + (i / 40) * L * 0.97;
    top.push({ x, y: -half(x) });
    bottom.unshift({ x, y: half(x) });
  }
  items.push({ t: "base", d: top.concat(bottom) });

  const greens = byRole(rows, "green");
  const gk: Coloured[] = greens.length
    ? greens
    : [
        { kind: "euca", qty: 1, col: FLOWER_KIND_BY_ID.euca.natural! },
        { kind: "ruscus", qty: 1, col: FLOWER_KIND_BY_ID.ruscus.natural! },
      ];
  const step = D * 0.3;
  let gi = 0;
  for (let x = -L / 2 + D * 0.35; x <= L / 2 - D * 0.35; x += step) {
    for (const side of [1, -1]) {
      const g = gk[gi++ % gk.length];
      const y0 = side * D * 0.06;
      const ang = (rng() < 0.5 ? 0 : Math.PI) + side * (0.5 + rng() * 0.55);
      const maxLen = (D * 0.5 - Math.abs(y0)) / Math.max(0.3, Math.abs(Math.sin(ang)));
      const len = Math.min(maxLen * 0.98, D * (0.34 + rng() * 0.16));
      items.push({ t: "green", kind: g.kind, x: x + (rng() - 0.5) * step * 0.4, y: y0, ang, len, bend: len * 0.15 * (rng() * 2 - 1), col: g.col });
    }
  }
  for (const s of [1, -1]) items.push({ t: "green", kind: gk[0].kind, x: s * (L / 2 - D * 0.5), y: 0, ang: s > 0 ? 0 : Math.PI, len: D * 0.48, bend: D * 0.04, col: gk[0].col });

  const heads = byRole(rows, "head");
  const fills = byRole(rows, "fill");
  const trails = byRole(rows, "trail");
  const k = Math.max(2, Math.round(L / (D * 1.7)));
  const cr = D * 0.34;
  const centres = Array.from({ length: k }, (_, i) => -L / 2 + (L * (i + 0.5)) / k);
  const list = thin(headList(heads, rng), k * Math.PI * cr * cr * 0.85, 0.8, rng).sort((a, b) => headRadius(b) - headRadius(a));
  const placed: Disc[] = [];
  list.forEach((r, i) => {
    const xc = centres[i % k];
    const s = headRadius(r);
    const p = place(s, placed, 0.8, (rr) => {
      const a = rng() * TAU;
      const d = Math.sqrt(rng()) * Math.max(0, cr - rr * 0.4);
      return { x: xc + d * Math.cos(a), y: d * Math.sin(a) };
    });
    if (!p) return;
    placed.push({ x: p.x, y: p.y, r: s });
    items.push({ t: "head", kind: r.kind, x: p.x, y: p.y, r: s, col: pickColour(r, rng), rot: rng() * TAU, sc: 1, ang: 0, z: rng() });
  });
  const band = (L - D * 0.7) * D * 0.52;
  const flist = thin(headList(fills, rng), band * 0.5, 0.85, rng);
  for (const r of flist) {
    const s = headRadius(r);
    const p = place(s, placed, 0.74, () => ({ x: (rng() - 0.5) * (L - D * 0.7), y: (rng() - 0.5) * 2 * D * 0.26 }), 40);
    if (!p) continue;
    placed.push({ x: p.x, y: p.y, r: s });
    items.push({ t: "fill", kind: r.kind, x: p.x, y: p.y, r: s, col: pickColour(r, rng), rot: rng() * TAU, sc: 1, ang: 0, z: rng() });
  }
  for (const r of trails) {
    centres.forEach((xc, i) => {
      const a = (i % 2 ? 1 : -1) * (0.9 + rng() * 0.5);
      items.push({ t: "trail", x: xc, y: 0, ang: a, len: ((D * 0.5) / Math.abs(Math.sin(a))) * 0.9, bend: D * 0.08, col: pickColour(r, rng) });
    });
  }
  return items;
}

function composeBud(rows: readonly Coloured[], R: number, rng: () => number): FlowerItem[] {
  const items: FlowerItem[] = [];
  const n = Math.max(3, Math.min(9, Math.round((R * R) / (70 * 70))));
  const flowers = rows.filter((r) => FLOWER_KIND_BY_ID[r.kind].role !== "green");
  const greens = byRole(rows, "green");
  const tot = flowers.reduce((s, r) => s + r.qty, 0);
  const pick = (): Coloured => {
    let u = rng() * tot;
    for (const r of flowers) {
      u -= r.qty;
      if (u <= 0) return r;
    }
    return flowers[0];
  };
  const bottles: Disc[] = [];
  for (let i = 0; i < n; i++) {
    const rb = 24 + rng() * 16;
    const p = place(
      rb,
      bottles,
      1.35,
      (r) => {
        const a = rng() * TAU;
        const d = Math.sqrt(rng()) * (R * 0.8 - r);
        return { x: d * Math.cos(a), y: d * Math.sin(a) };
      },
      80,
    );
    if (p) bottles.push({ x: p.x, y: p.y, r: rb });
  }
  bottles.forEach((b, i) => {
    items.push({ t: "bottle", x: b.x, y: b.y, r: b.r });
    const stems = rng() < 0.45 ? 2 : 1;
    for (let s = 0; s < stems && flowers.length; s++) {
      const r = pick();
      const a = rng() * TAU;
      const off = b.r * (0.35 + rng() * 0.5);
      if (FLOWER_KIND_BY_ID[r.kind].role === "trail") {
        items.push({ t: "trail", x: b.x, y: b.y, ang: a, len: Math.min(R * 0.4, reachLen(b.x, b.y, a, R * 0.98)), bend: 10, col: pickColour(r, rng) });
        continue;
      }
      items.push({ t: "head", kind: r.kind, x: b.x + off * Math.cos(a), y: b.y + off * Math.sin(a), r: Math.min(headRadius(r) * 0.9, 70), col: pickColour(r, rng), rot: rng() * TAU, sc: 1, ang: 0, z: i + s * 0.1 });
    }
    if (rng() < 0.5) {
      const g = greens.length ? greens[Math.floor(rng() * greens.length)] : { kind: "euca" as FlowerKindId, qty: 1, col: FLOWER_KIND_BY_ID.euca.natural! };
      const a = rng() * TAU;
      items.push({ t: "green", kind: g.kind, x: b.x, y: b.y, ang: a, len: Math.min(reachLen(b.x, b.y, a, R * 0.98), b.r * 3), bend: b.r * 0.4 * (rng() * 2 - 1), col: g.col });
    }
  });
  return items;
}

/** A stem on its own, filling its box: one head, one sprig along the long side, or one spray. */
function composeSingle(rows: readonly Coloured[], w: number, h: number, rng: () => number): FlowerItem[] {
  const r = rows[0] ?? { kind: "rose" as FlowerKindId, qty: 1, col: DEFAULT_SHADE };
  const role = FLOWER_KIND_BY_ID[r.kind].role;
  const long = Math.max(w, h);
  const ang = w >= h ? 0 : Math.PI / 2;
  if (role === "green") return [{ t: "green", kind: r.kind, x: -Math.cos(ang) * long * 0.45, y: -Math.sin(ang) * long * 0.45, ang, len: long * 0.9, bend: long * 0.08, col: r.col }];
  if (role === "trail") return [{ t: "trail", x: -Math.cos(ang) * long * 0.45, y: -Math.sin(ang) * long * 0.45, ang, len: long * 0.9, bend: -long * 0.12, col: r.col }];
  return [{ t: "head", kind: r.kind, x: 0, y: 0, r: Math.min(w, h) * 0.47, col: r.col, rot: rng() * TAU, sc: 1, ang: 0, z: 0 }];
}

const composed = new WeakMap<FlowerDrawSpec, FlowerItem[]>();

/** The items of an arrangement, laid out. Memoised per spec object. */
export function composeFlowers(spec: FlowerDrawSpec): FlowerItem[] {
  const hit = composed.get(spec);
  if (hit) return hit;
  const rng = mulberry32(spec.seed);
  const lines = spec.lines.length ? spec.lines : defaultMix();
  const colours = lineColours(lines, spec.shade);
  const rows: Coloured[] = lines.map((l, i) => ({ ...l, ...colours[i] }));
  const { w, h } = spec;
  let items: FlowerItem[];
  if (w <= 0 || h <= 0) items = [];
  else if (spec.form === "single") items = composeSingle(rows, w, h, rng);
  else if (spec.form === "runner") items = w >= h ? composeRunner(rows, w, h, rng) : composeRunner(rows, h, w, rng).map(turnQuarter);
  else if (spec.form === "bud") items = composeBud(rows, Math.min(w, h) / 2, rng);
  else items = composeRound(rows, Math.min(w, h) / 2, FORMS[spec.form], rng);
  composed.set(spec, items);
  return items;
}

/** A runner laid along y: the layout is built along x and turned a quarter. */
function turnQuarter(it: FlowerItem): FlowerItem {
  const q = Math.PI / 2;
  const turn = (x: number, y: number) => ({ x: -y, y: x });
  switch (it.t) {
    case "base":
      return { t: "base", d: it.d.map((p) => turn(p.x, p.y)) };
    case "stem": {
      const a = turn(it.x1, it.y1);
      const b = turn(it.x2, it.y2);
      return { t: "stem", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case "bottle":
      return { ...it, ...turn(it.x, it.y) };
    case "green":
    case "trail":
      return { ...it, ...turn(it.x, it.y), ang: it.ang + q };
    default:
      return { ...it, ...turn(it.x, it.y), ang: it.ang + q };
  }
}

// ponytail: self-check. Run: npm run check:flower-draw
if (isMain(import.meta.url)) {
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
  for (const form of FLOWER_FORMS) {
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

  const cols = lineColours([{ kind: "rose", qty: 10 }, { kind: "gyps", qty: 5 }, { kind: "euca", qty: 5 }, { kind: "orchid", qty: 4, colour: "#ffffff" }], "#6E1B2C");
  assert(cols[0].col === "#6E1B2C", "the first following line takes the shade itself");
  assert(cols[1].col === "#FFFFFF", "gypsophila is white in a bordeaux arrangement");
  assert(cols[2].col === FLOWER_KIND_BY_ID.euca.natural, "eucalyptus keeps its own colour");
  assert(cols[3].col === "#ffffff", "a pinned colour wins");
  assert(lineColours([{ kind: "rose", qty: 1 }], "#FFFFFF")[0].col === "#FFFFFF", "a white shade draws white heads");
  assert(lineColours([{ kind: "rose", qty: 1 }])[0].col === DEFAULT_SHADE, "no shade: the default blush");
  assert(lineColours([{ kind: "rose", qty: 1 }], "garbage")[0].col === DEFAULT_SHADE, "a shade that is not a colour is ignored");

  const scaled = defaultMix(55);
  assert(scaled.reduce((s, l) => s + l.qty, 0) >= 50 && scaled.reduce((s, l) => s + l.qty, 0) <= 60, "the default mix scales to a typed total");
  console.log("catalog/flower-draw self-check passed");
}
