// A CHUPPAH, one layout for the plan and the room — where its posts stand, how thick they really
// are, where its roof begins, where its flowers are — read by components/item-symbol.tsx (the plan)
// and lib/scene/floor-kinds.ts (the room), as a chandelier's tiers are (lib/catalog/chandelier.ts;
// the method is .claude/skills/rebuilding-a-catalog-category-in-3d).
//
// The spec (MapAppearance.chuppah, ChuppahSpec) is every field absent = the chuppah it always was:
// four posts — pole·1.6 in from a rectangle's corners, at 45° steps on 0.82 of a round one's radii —
// a cloth over them, posies on the two front posts at two thirds of the height. A ROUND chuppah's
// roof takes its SECTION from the base's body (`revolve`, fractions): the posts rise where the
// profile is straight, and from where it turns in (the eave) the roof follows it — a dome, an onion,
// a peak. Never a solid: the profile is the picture's (lib/scene/items.ts PROFILE_IS_PICTURE).
//
// The plan draws a pole at m·0.045, a disc you can see from above; the room builds it at its real
// size (`postR`, by its finish) — the chandelier round's lesson that the plan's sizes are not the
// room's.
//
// Pure. Run: npx tsx lib/catalog/chuppah.ts
import type { ChuppahFinish, ChuppahFlowers, ChuppahRoof, ChuppahSpec, MapAppearance, RevolvePoint } from "./types";
import { profileAt } from "../element/revolve";
import { seedOf, type FlowerDrawSpec } from "./flower-draw";
import { isMain } from "../self-check";

export type Pt = { x: number; y: number };

export const CHUPPAH_FINISHES: ChuppahFinish[] = ["metal", "gold", "wood", "white", "acrylic", "birch"];
export const CHUPPAH_FINISH_LABEL: Record<ChuppahFinish, string> = {
  metal: "מתכת בגוון",
  gold: "זהב",
  wood: "עץ",
  white: "לבן",
  acrylic: "אקריליק שקוף",
  birch: "גזעי ליבנה",
};
/** A finish's own colour (absent: metal in a darker cut of the row's tone). */
export const CHUPPAH_FINISH_COLOUR: Partial<Record<ChuppahFinish, string>> = {
  gold: "#c9a24a",
  wood: "#8a6a4a",
  white: "#f3f1ec",
  acrylic: "#eef4f8",
  birch: "#ece6da",
};
/** A post's real radius in the room, mm: a 6 cm tube, a 9 cm timber, a 10 cm clear acrylic rod. */
export const CHUPPAH_POST_R: Record<ChuppahFinish, number> = { metal: 30, gold: 30, wood: 45, white: 40, acrylic: 50, birch: 40 };

export const CHUPPAH_ROOFS: ChuppahRoof[] = ["cloth", "sheer", "flowers", "open", "none"];
export const CHUPPAH_ROOF_LABEL: Record<ChuppahRoof, string> = {
  cloth: "בד",
  sheer: "בד שקוף (שיפון)",
  flowers: "ענן פרחים",
  open: "קורות פתוחות",
  none: "בלי גג",
};

export const CHUPPAH_FLOWER_SPOTS: ChuppahFlowers[] = ["front", "corners", "asym", "cascade", "none"];
export const CHUPPAH_FLOWERS_LABEL: Record<ChuppahFlowers, string> = {
  front: "על שני העמודים הקדמיים",
  corners: "בראש כל עמוד",
  asym: "שני אשכולות באלכסון",
  cascade: "מפל לאורך העמודים הקדמיים",
  none: "בלי פרחים",
};

/** A round chuppah's ROOF sections, as the base's body (bottom to top, fractions; each reaches r = 1
 *  — the plan's circle — at the foot, where the posts stand). The none tile is a flat cloth. */
export type ChuppahProfileForm = "dome" | "onion" | "peak" | "bell";
export const CHUPPAH_PROFILE_FORMS: ChuppahProfileForm[] = ["dome", "onion", "peak", "bell"];
export const CHUPPAH_PROFILE_LABEL: Record<ChuppahProfileForm, string> = { dome: "כיפה", onion: "בצל", peak: "אוהל", bell: "פעמון" };
export const CHUPPAH_PROFILES: Record<ChuppahProfileForm, RevolvePoint[]> = {
  dome: [
    { r: 1, z: 0 },
    { r: 1, z: 0.72 },
    { r: 0.92, z: 0.84 },
    { r: 0.7, z: 0.93 },
    { r: 0.38, z: 0.99 },
    { r: 0.02, z: 1 },
  ],
  onion: [
    { r: 1, z: 0 },
    { r: 1, z: 0.68 },
    { r: 1, z: 0.76 },
    { r: 0.84, z: 0.86 },
    { r: 0.42, z: 0.94 },
    { r: 0.02, z: 1 },
  ],
  peak: [
    { r: 1, z: 0 },
    { r: 1, z: 0.78 },
    { r: 0.02, z: 1 },
  ],
  bell: [
    { r: 1, z: 0 },
    { r: 1, z: 0.7 },
    { r: 0.78, z: 0.78 },
    { r: 0.62, z: 0.9 },
    { r: 0.4, z: 0.98 },
    { r: 0.02, z: 1 },
  ],
};

/** What a placement draws and builds from: the spec, and the base's body as the roof's section. */
export type ChuppahDraw = ChuppahSpec & { profile?: RevolvePoint[] };

export function chuppahDrawOf(a: MapAppearance | undefined): ChuppahDraw | undefined {
  if (!a) return undefined;
  const profile = a.revolve && a.revolve.length >= 2 ? a.revolve : undefined;
  if (!a.chuppah && !profile) return undefined;
  return { ...a.chuppah, ...(profile ? { profile } : {}) };
}

export interface ResolvedChuppah {
  /** null = four, or the outline's corners. */
  posts: number | null;
  finish: ChuppahFinish;
  roof: ChuppahRoof;
  flowers: ChuppahFlowers;
  bloom?: string;
  meadow: boolean;
  drapes: boolean;
  profile?: RevolvePoint[];
}

/** The chuppah a spec says, every absent field what it always was. */
export function chuppahOf(d: ChuppahDraw | undefined): ResolvedChuppah {
  const posts = d?.posts === undefined || !Number.isFinite(d.posts) ? null : Math.max(0, Math.min(12, Math.round(d.posts)));
  return {
    posts,
    finish: d?.finish ?? "metal",
    roof: d?.roof ?? "cloth",
    flowers: d?.flowers ?? "front",
    ...(d?.bloom ? { bloom: d.bloom } : {}),
    meadow: !!d?.meadow,
    drapes: !!d?.drapes,
    ...(d?.profile ? { profile: d.profile } : {}),
  };
}

/** `patch` written over the row's spec, keeping only what differs from a plain chuppah — so a row
 *  left alone stores nothing and follows the default. */
export function chuppahPatch(prev: ChuppahSpec | undefined, patch: ChuppahSpec): ChuppahSpec | undefined {
  const next: ChuppahSpec = { ...prev, ...patch };
  const out: ChuppahSpec = {};
  if (next.posts !== undefined && next.posts !== null) out.posts = Math.max(0, Math.min(12, Math.round(next.posts)));
  if (next.finish && next.finish !== "metal") out.finish = next.finish;
  if (next.roof && next.roof !== "cloth") out.roof = next.roof;
  if (next.flowers && next.flowers !== "front") out.flowers = next.flowers;
  if (next.bloom) out.bloom = next.bloom;
  if (next.meadow) out.meadow = true;
  if (next.drapes) out.drapes = true;
  return Object.keys(out).length ? out : undefined;
}

/** Where the roof begins, a share of the height: the highest point the profile is still as wide as
 *  its foot (the posts rise to it), 1 without a profile — the cloth is at the top. */
export function eaveOf(profile: readonly RevolvePoint[] | undefined): number {
  if (!profile) return 1;
  const foot = profileAt(profile, 0);
  let z = 0;
  for (let i = 1; i <= 100; i++) {
    if (profileAt(profile, i / 100) < foot * 0.985) break;
    z = i / 100;
  }
  return Math.max(0.4, Math.min(1, z));
}

/** A spot flowers go: its centre on the plan, how high (a share of the height), how wide (mm), and
 *  which form the cluster takes. */
export interface ChuppahSpot extends Pt {
  z: number;
  size: number;
  form: "dome" | "cascade" | "cushion";
}

export interface ChuppahLayout {
  posts: Pt[];
  /** The plan's pole (m·0.045 — a disc you can see from above) and the room's real one. */
  planPostR: number;
  postR: number;
  /** Where the roof begins, a share of the height. */
  eave: number;
  spots: ChuppahSpot[];
  /** Low flowers on the floor at every post's foot (z 0). */
  meadow: ChuppahSpot[];
}

/** Where a round chuppah's posts stand: `n` of them half a step either side of the front (+y), so
 *  the front is an opening — at 45° steps for four, the old 0.82 of the radii. */
function ringPosts(n: number, rx: number, ry: number, k: number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((90 + (360 / n) * (i + 0.5)) * Math.PI) / 180;
    return { x: rx * k * Math.cos(a), y: ry * k * Math.sin(a) };
  });
}

/** The outline's sharp corners (turning more than 20°), pulled in toward the middle by `inset`. */
function cornerPosts(outline: readonly Pt[], inset: number): Pt[] {
  const n = outline.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = outline[(i - 1 + n) % n];
    const b = outline[i];
    const c = outline[(i + 1) % n];
    const t1 = Math.atan2(b.y - a.y, b.x - a.x);
    const t2 = Math.atan2(c.y - b.y, c.x - b.x);
    let turn = Math.abs(t2 - t1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn < (20 * Math.PI) / 180) continue;
    const d = Math.hypot(b.x, b.y) || 1;
    out.push({ x: b.x - (b.x / d) * inset, y: b.y - (b.y / d) * inset });
  }
  return out;
}

/**
 * A chuppah `w` × `d` (its box; `round` for a circle or an ellipse; `outline` for any other drawn
 * shape — a hexagon's corners take its posts) as the plan and the room lay it.
 */
export function chuppahLayout(w: number, d: number, round: boolean, c: ResolvedChuppah, outline?: readonly Pt[]): ChuppahLayout {
  const m = Math.min(w, d);
  const planPostR = m * 0.045;
  const postR = Math.min(CHUPPAH_POST_R[c.finish], planPostR);
  const eave = round ? eaveOf(c.profile) : 1;
  const foot = round && c.profile ? profileAt(c.profile, 0) : 1;
  let posts: Pt[];
  if (c.posts === 0) posts = [];
  else if (round) posts = ringPosts(c.posts ?? 4, (w / 2) * foot, (d / 2) * foot, 0.82);
  else if (outline && outline.length >= 3) posts = cornerPosts(outline, planPostR * 1.6 * Math.SQRT2);
  else {
    const x = w / 2 - planPostR * 1.6;
    const y = d / 2 - planPostR * 1.6;
    posts = [
      { x: -x, y: -y },
      { x, y: -y },
      { x, y },
      { x: -x, y },
    ];
    // More than four on a rectangle: the long sides take the rest, evenly.
    const extra = (c.posts ?? 4) - 4;
    if (extra > 0) {
      const alongX = w >= d;
      const perSide = Math.ceil(extra / 2);
      for (let s = 0; s < 2; s++) {
        const k = s === 0 ? perSide : extra - perSide;
        for (let i = 1; i <= k; i++) {
          const t = -1 + (2 * i) / (k + 1);
          posts.push(alongX ? { x: x * t, y: s === 0 ? -y : y } : { x: s === 0 ? -x : x, y: y * t });
        }
      }
    }
  }

  // The front is +y: the guests' side. With no posts, the canopy's front rim carries them.
  const front = posts.length ? posts.filter((p) => p.y > 1e-6) : [{ x: -w * 0.35, y: d * 0.4 }, { x: w * 0.35, y: d * 0.4 }];
  const spots: ChuppahSpot[] = [];
  const top = eave;
  switch (c.flowers) {
    case "front":
      for (const p of front) spots.push({ ...p, z: posts.length ? 2 / 3 : 1, size: m * 0.28, form: "dome" });
      break;
    case "corners":
      for (const p of posts.length ? posts : front) spots.push({ ...p, z: top, size: m * 0.22, form: "dome" });
      break;
    case "asym": {
      const pool = posts.length ? posts : [{ x: -w * 0.4, y: d * 0.4 }, { x: w * 0.4, y: -d * 0.4 }];
      const near = (tx: number, ty: number) => pool.reduce((b, p) => (Math.hypot(p.x - tx, p.y - ty) < Math.hypot(b.x - tx, b.y - ty) ? p : b));
      const a = near(-w / 2, d / 2);
      const b = near(w / 2, -d / 2);
      spots.push({ ...a, z: top, size: m * 0.36, form: "cascade" }, { ...b, z: top, size: m * 0.3, form: "cascade" });
      break;
    }
    case "cascade":
      for (const p of front) {
        spots.push({ ...p, z: top, size: m * 0.24, form: "dome" });
        spots.push({ ...p, z: top - 0.2, size: m * 0.18, form: "dome" });
        spots.push({ ...p, z: top - 0.38, size: m * 0.13, form: "dome" });
      }
      break;
    case "none":
      break;
  }
  const meadow: ChuppahSpot[] = c.meadow ? (posts.length ? posts : front).map((p) => ({ ...p, z: 0, size: m * 0.3, form: "cushion" as const })) : [];
  return { posts, planPostR, postR, eave, spots, meadow };
}

// ── a cloud of flowers ─────────────────────────────────────────────────────────────────────────

/** A cloud of flowers is this many stems a square metre: hydrangea and roses, sprays, a little
 *  gypsophila and greens — as many as cover it. */
export const CLOUD_STEMS_PER_M2 = 110;

/** A flat cloud's envelope (the room's — lib/scene/flowers.ts): a lens, so the flowers dress its
 *  top, its side and its UNDERSIDE, which is what the couple under it see. */
export const CLOUD_LENS: RevolvePoint[] = [
  { r: 0.06, z: 0 },
  { r: 0.55, z: 0.1 },
  { r: 0.88, z: 0.28 },
  { r: 1, z: 0.52 },
  { r: 0.9, z: 0.78 },
  { r: 0.55, z: 0.95 },
  { r: 0.02, z: 1 },
];

/** Where a cloud lies over a chuppah `w` × `d`: one piece per square-ish stretch of a long one, each
 *  its centre and size; a round one is one piece. */
export function cloudPieces(w: number, d: number, round: boolean): { x: number; y: number; w: number; d: number }[] {
  if (round) return [{ x: 0, y: 0, w, d }];
  const long = w >= d;
  const n = Math.max(1, Math.round(Math.max(w, d) / Math.min(w, d)));
  const each = (long ? w : d) / n;
  return Array.from({ length: n }, (_, k) => {
    const off = -((long ? w : d) / 2) + each * (k + 0.5);
    return long ? { x: off, y: 0, w: each, d } : { x: 0, y: off, w, d: each };
  });
}

const clouds = new Map<string, FlowerDrawSpec>();
/** The flowers of a cloud `w` × `d` in `bloom` (absent: the default blush), with the room's envelope
 *  when given — one object per key, so its composition is laid once. The plan and the room ask here. */
export function cloudFlowers(w: number, d: number, bloom: string | undefined, seedKey: string, profile?: RevolvePoint[]): FlowerDrawSpec {
  const key = `${Math.round(w)}|${Math.round(d)}|${bloom ?? ""}|${seedKey}|${profile ? JSON.stringify(profile) : ""}`;
  const hit = clouds.get(key);
  if (hit) return hit;
  if (clouds.size > 200) clouds.clear();
  const n = Math.max(60, Math.round(((Math.PI * w * d) / 4 / 1e6) * CLOUD_STEMS_PER_M2));
  const q = (share: number) => Math.max(1, Math.round(n * share));
  const spec: FlowerDrawSpec = {
    form: "cushion",
    w: Math.round(w),
    h: Math.round(d),
    lines: [
      { kind: "hydrangea", qty: q(0.22) },
      { kind: "rose", qty: q(0.36) },
      { kind: "spray", qty: q(0.14) },
      { kind: "gyps", qty: q(0.12) },
      { kind: "euca", qty: q(0.16) },
    ],
    ...(bloom ? { shade: bloom } : {}),
    seed: seedOf(`cloud:${seedKey}`),
    ...(profile ? { profile } : {}),
  };
  clouds.set(key, spec);
  return spec;
}

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error("FAIL: " + what);
    console.log(`  ok   ${what}`);
  };
  const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

  // No spec: the chuppah it always was.
  const plain = chuppahLayout(3000, 3000, false, chuppahOf(undefined));
  assert(plain.posts.length === 4 && near(Math.abs(plain.posts[0].x), 1500 - 135 * 1.6) && plain.planPostR === 135, "a plain 3×3: four posts pole·1.6 in from the corners, the plan's pole m·0.045");
  assert(plain.postR === 30 && plain.eave === 1, "…built 6 cm thick in the room, the cloth at the top");
  assert(plain.spots.length === 2 && plain.spots.every((s) => s.y > 0 && near(s.z, 2 / 3) && near(s.size, 840)), "…posies on the two front posts at two thirds of the height");
  const roundPlain = chuppahLayout(3000, 3000, true, chuppahOf(undefined));
  const deg = roundPlain.posts.map((p) => Math.round((Math.atan2(p.y, p.x) * 180) / Math.PI)).sort((a, b) => a - b);
  assert(JSON.stringify(deg) === JSON.stringify([-135, -45, 45, 135]) && near(Math.hypot(roundPlain.posts[0].x, roundPlain.posts[0].y), 1500 * 0.82), "a round one: four posts at 45° steps on 0.82 of the radius");

  // The spec.
  assert(chuppahLayout(3000, 3000, true, chuppahOf({ posts: 0 })).posts.length === 0, "posts 0: hung, no posts");
  const six = chuppahLayout(3000, 3000, true, chuppahOf({ posts: 6 }));
  assert(six.posts.length === 6 && six.posts.every((p) => Math.abs(p.x) > 1), "six posts on a ring, none at the front's middle");
  const hex = Array.from({ length: 6 }, (_, i) => ({ x: 1500 * Math.cos((i * Math.PI) / 3), y: 1500 * Math.sin((i * Math.PI) / 3) }));
  assert(chuppahLayout(3000, 2600, false, chuppahOf(undefined), hex).posts.length === 6, "a hexagon's corners take its posts");
  const long = chuppahLayout(4000, 2400, false, chuppahOf({ posts: 6 }));
  assert(long.posts.length === 6 && long.posts.filter((p) => near(p.x, 0)).length === 2, "six on a long rectangle: a middle post on each long side");
  assert(chuppahLayout(3000, 3000, false, chuppahOf({ finish: "acrylic" })).postR === 50, "a clear acrylic post is 10 cm");
  assert(chuppahLayout(3000, 3000, false, chuppahOf({ flowers: "corners" })).spots.length === 4, "flowers on every post's top");
  const asym = chuppahLayout(3000, 3000, false, chuppahOf({ flowers: "asym" }));
  assert(asym.spots.length === 2 && asym.spots[0].x < 0 && asym.spots[0].y > 0 && asym.spots[1].x > 0 && asym.spots[1].y < 0, "two clusters on opposite corners");
  assert(chuppahLayout(3000, 3000, false, chuppahOf({ meadow: true })).meadow.length === 4, "a meadow at every post's foot");

  // The roof's section.
  assert(eaveOf(undefined) === 1 && near(eaveOf(CHUPPAH_PROFILES.dome), 0.72, 0.03) && near(eaveOf(CHUPPAH_PROFILES.peak), 0.78, 0.011), "the eave is where the profile turns in");
  const dome = chuppahLayout(3000, 3000, true, chuppahOf({ flowers: "corners", profile: CHUPPAH_PROFILES.dome }));
  assert(dome.spots.every((s) => near(s.z, dome.eave)), "…and the corner flowers sit at the eave, under the dome");

  // The patch keeps only what differs.
  assert(chuppahPatch(undefined, { roof: "cloth", flowers: "front", finish: "metal" }) === undefined, "a plain chuppah stores nothing");
  assert(JSON.stringify(chuppahPatch({ roof: "flowers" }, { drapes: true })) === JSON.stringify({ roof: "flowers", drapes: true }), "a patch adds to what is there");
  assert(chuppahDrawOf({ shape: "circle", content: "none" }) === undefined && chuppahDrawOf({ shape: "circle", content: "none", revolve: CHUPPAH_PROFILES.peak })?.profile === CHUPPAH_PROFILES.peak, "the draw is the spec and the base's body");
  console.log("chuppah self-check passed");
}
