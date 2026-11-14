// WHAT A ROUND ITEM'S SIDE PROFILE MEANS, BY CATEGORY (2026-11-13 — the user: "the צללית is not
// working well on all the catalog categories, like אהיל and more").
//
// The shape editor lets a round first shape carry a side profile (MapAppearance.revolve — fractions
// of the radius and the height, lib/element/revolve.ts). What that profile IS depends on the thing:
//
//   chandelier   the silhouette its tiers follow            lib/catalog/chandelier.ts
//   flowers      the envelope its heads are laid on         lib/catalog/flower-draw.ts
//   chuppah      its roof's section                         lib/catalog/chuppah.ts
//   lamp         the WHOLE lamp from the side: below its neck (its narrowest ring) the base, turned
//                in metal; above it the SHADE — cloth, lit from inside (lampParts)
//   tree         its CROWN — leaves inside it, a trunk where it is thin
//   vase         the vessel itself, in its glass / metal / glaze, hollow
//   column       the turned shaft, in its stone
//   fountain     its basin and tiers in stone, the water and the jet kept
//   candlestick  its turned body in its metal or crystal, the candles standing on it
//   chair, sofa  a pouf turned to that profile, in its fabric
//
// Until this round only the first three read it. For a lamp, a vase, a column and a fountain the
// profile REPLACED the whole recipe with one matte solid (a lamp was a dunce cap with no light); for
// everything else it was built as a solid the size of the piece with the picture hidden inside it.
// This file is the data half — the shapes each category offers as tiles and a style's own answer;
// the room's recipes (lib/scene/items.ts, floor-kinds.ts, plants.ts) read the profile through
// `ItemContext.profile`.
//
// Pure. Run: npm run check:body-profiles
import type { RevolvePoint } from "./types";
import type { SymbolKind } from "./symbols";
import { isMain } from "../self-check";

type Pts = RevolvePoint[];
const pts = (...p: [number, number][]): Pts => p.map(([r, z]) => ({ r, z }));

// ── Lamps: the shade ────────────────────────────────────────────────────────────────────────────

export type LampShade = "empire" | "drum" | "coolie" | "dome" | "globe" | "bell" | "pagoda" | "lantern";

/** A globe: a ball of glass on its fitting, open at the bottom where it sits. */
const globe = (): Pts => {
  const out: Pts = [];
  for (let a = -72; a <= 90; a += 18) out.push({ r: Math.round(Math.cos((a * Math.PI) / 180) * 1000) / 1000, z: Math.round((0.64 + 0.36 * Math.sin((a * Math.PI) / 180)) * 1000) / 1000 });
  return out;
};

/** Each SHADE as fractions of the lamp's radius and of its WHOLE height: the shade is where these
 *  points are, and the stem and foot stand under its lowest one. The first is the lamp the category
 *  always drew (the plan's `empire`: its top rim 0.64 of the bottom, over the top 45%). What a lamp
 *  STYLE builds; the editor's tiles are the whole lamps made of them (LAMP_PROFILES). */
export const LAMP_SHADES: Record<LampShade, Pts> = {
  empire: pts([1, 0.55], [0.64, 1]),
  drum: pts([1, 0.54], [1, 1]),
  coolie: pts([1, 0.66], [0.22, 1]),
  dome: pts([1, 0.6], [0.98, 0.7], [0.86, 0.84], [0.6, 0.95], [0.1, 1]),
  globe: globe(),
  bell: pts([1, 0.5], [0.82, 0.58], [0.6, 0.74], [0.5, 0.9], [0.34, 1]),
  pagoda: pts([1, 0.56], [0.66, 0.63], [0.46, 0.8], [0.38, 1]),
  lantern: pts([0.86, 0.1], [1, 0.14], [1, 0.92], [0.86, 0.96], [0.3, 1]),
};
export const LAMP_SHADE_LABEL: Record<LampShade, string> = {
  empire: "מתרחב",
  drum: "תוף",
  coolie: "קוני",
  dome: "כיפה",
  globe: "גלובוס",
  bell: "פעמון",
  pagoda: "פגודה",
  lantern: "פנס עומד",
};
export const LAMP_SHADE_KEYS = Object.keys(LAMP_SHADES) as LampShade[];

/** A stored profile always runs from the floor to the top (lib/element/revolve.ts cleanRevolve), so a
 *  lamp's is the WHOLE lamp: a turned foot, a slim stem up to the shade's lowest ring, then the shade.
 *  The stem is the profile's neck — `lampParts` splits base from shade there. A shade that comes down
 *  to the table (a lantern) is all shade. */
export function lampSilhouette(shade: Pts): Pts {
  const low = shade[0];
  if (!low || low.z <= 0.12) return [{ r: low?.r ?? 1, z: 0 }, ...shade.slice(1)];
  return [{ r: 0.3, z: 0 }, { r: 0.3, z: 0.024 }, { r: 0.14, z: 0.06 }, { r: 0.07, z: 0.1 }, { r: 0.07, z: low.z }, ...shade];
}
/** The editor's lamp tiles: each shade as a whole lamp on its stem. */
export const LAMP_PROFILES: Record<LampShade, Pts> = Object.fromEntries(LAMP_SHADE_KEYS.map((k) => [k, lampSilhouette(LAMP_SHADES[k])])) as Record<LampShade, Pts>;

/** A lamp's profile read as its two parts (fractions, bottom to top): the BASE below its neck — the
 *  highest of its narrowest rings, when the profile really narrows there (under NECK of what flares
 *  above it) — and the SHADE above. A profile with no neck (a cone, a dome, a lantern) is all shade. */
export const LAMP_NECK = 0.4;
export function lampParts(profile: readonly RevolvePoint[]): { base: Pts; shade: Pts } {
  const p = profile.map((q) => ({ r: q.r, z: q.z }));
  if (p.length < 3) return { base: [], shade: p };
  let neck = -1;
  for (let i = 1; i < p.length - 1; i++) if (neck < 0 || p[i].r <= p[neck].r + 1e-9) neck = i;
  const above = Math.max(...p.slice(neck + 1).map((q) => q.r));
  if (neck < 0 || p[neck].r > above * LAMP_NECK) return { base: [], shade: p };
  // The shade starts at the neck when it flares out of it, or at the next point when that is a step
  // out at the same height (a shade's open bottom rim over a thin stem).
  const step = p[neck + 1].z <= p[neck].z + 1e-6;
  const shade = step ? p.slice(neck + 1) : p.slice(neck);
  return shade.length >= 2 ? { base: p.slice(0, neck + 1), shade } : { base: [], shade: p };
}

/** The shade a lamp STYLE (lib/catalog/symbols.ts LampStyle) is, in the room — the plan has drawn
 *  the four from above all along; the room built the first one whatever was picked. */
export function lampShadeOf(style: string | undefined): Pts {
  if (style === "drum") return LAMP_SHADES.drum;
  if (style === "mushroom") return LAMP_SHADES.dome;
  if (style === "globe") return LAMP_SHADES.globe;
  return LAMP_SHADES.empire;
}

// ── Trees: the crown ────────────────────────────────────────────────────────────────────────────

export type TreeCrown = "ball" | "cone" | "column" | "umbrella" | "topiary" | "cloud";

/** Each crown as fractions of the canopy's radius and the tree's height. Where the profile is THIN
 *  (under CROWN_THIN of its widest) it is trunk; where it is wide it is leaves. */
export const TREE_CROWNS: Record<TreeCrown, Pts> = {
  ball: pts([0.07, 0], [0.07, 0.46], [0.62, 0.52], [1, 0.74], [0.62, 0.95], [0.04, 1]),
  cone: pts([0.07, 0], [0.07, 0.1], [1, 0.15], [0.62, 0.5], [0.3, 0.8], [0.03, 1]),
  column: pts([0.09, 0], [0.09, 0.08], [0.9, 0.13], [1, 0.5], [0.86, 0.9], [0.08, 1]),
  umbrella: pts([0.06, 0], [0.06, 0.64], [1, 0.74], [0.86, 0.9], [0.3, 1]),
  topiary: pts([0.07, 0], [0.07, 0.26], [0.8, 0.32], [1, 0.44], [0.6, 0.57], [0.09, 0.6], [0.09, 0.66], [0.56, 0.71], [0.64, 0.82], [0.4, 0.95], [0.03, 1]),
  cloud: pts([0.08, 0], [0.08, 0.34], [0.7, 0.4], [1, 0.58], [0.82, 0.8], [0.5, 0.95], [0.05, 1]),
};
export const TREE_CROWN_LABEL: Record<TreeCrown, string> = {
  ball: "כדור על גזע",
  cone: "חרוט (ברוש)",
  column: "עמוד (תויה)",
  umbrella: "מטרייה",
  topiary: "שני כדורים",
  cloud: "צמרת מלאה",
};
export const TREE_CROWN_KEYS = Object.keys(TREE_CROWNS) as TreeCrown[];
/** Under this share of its widest a crown's profile is trunk, not leaves. */
export const CROWN_THIN = 0.16;

// ── What the profile is called, and whether anything reads it ───────────────────────────────────

/** The word the editor uses for a kind's profile (the group's title and its chip). */
export const BODY_WORD: Partial<Record<SymbolKind, string>> = {
  lamp: "צורת האהיל",
  tree: "צורת הצמרת",
  vase: "צורת הכלי",
  column: "צללית העמוד",
  fountain: "צללית המזרקה",
  candlestick: "גוף הפמוט",
  chair: "צורת ההדום",
  sofa: "צורת ההדום",
};

/** The pictures a side profile changes NOTHING of — drawn along their own shape, flat, or by a rail:
 *  the editor offers them no body at all, rather than a field that silently does nothing. */
export const BODY_UNREAD: ReadonlySet<SymbolKind> = new Set<SymbolKind>(["bar", "runner", "stairs", "ramp", "bench", "led", "screen", "sail", "ceiling-drape", "dance-floor", "pergola", "arch", "gate"]);

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error("FAIL: " + what);
    console.log(`  ok   ${what}`);
  };
  const sound = (p: Pts) => p.length >= 2 && p.every((q, i) => q.r >= 0 && q.r <= 1 && q.z >= 0 && q.z <= 1 && (i === 0 || q.z >= p[i - 1].z));
  for (const k of LAMP_SHADE_KEYS) assert(sound(LAMP_SHADES[k]) && Math.max(...LAMP_SHADES[k].map((q) => q.r)) === 1 && !!LAMP_SHADE_LABEL[k], `lamp shade ${k}: a sound profile reaching the plan's rim, with a name`);
  for (const k of TREE_CROWN_KEYS) assert(sound(TREE_CROWNS[k]) && Math.max(...TREE_CROWNS[k].map((q) => q.r)) === 1 && TREE_CROWNS[k][0].r < CROWN_THIN && !!TREE_CROWN_LABEL[k], `tree crown ${k}: a sound profile on a trunk, with a name`);
  assert(JSON.stringify(lampShadeOf(undefined)) === JSON.stringify([{ r: 1, z: 0.55 }, { r: 0.64, z: 1 }]), "a lamp with no style is the shade it always was: 0.64 of its rim over the top 45%");
  assert(lampShadeOf("drum") === LAMP_SHADES.drum && lampShadeOf("mushroom") === LAMP_SHADES.dome && lampShadeOf("globe") === LAMP_SHADES.globe && lampShadeOf("empire") === LAMP_SHADES.empire, "each of the plan's four lamp styles has its shade in the room");
  assert(LAMP_SHADES.globe[0].z > 0.25 && LAMP_SHADES.globe[LAMP_SHADES.globe.length - 1].z === 1, "a globe sits on a stem and reaches the lamp's top");
  for (const k of LAMP_SHADE_KEYS) assert(sound(LAMP_PROFILES[k]) && LAMP_PROFILES[k][0].z === 0 && LAMP_PROFILES[k][LAMP_PROFILES[k].length - 1].z === 1, `lamp tile ${k}: the whole lamp, floor to top`);
  const empire = lampParts(LAMP_PROFILES.empire);
  assert(empire.base.length === 5 && empire.base[4].z === 0.55 && JSON.stringify(empire.shade) === JSON.stringify(LAMP_SHADES.empire), "a lamp's profile splits at its neck: the foot and stem below, exactly its shade above");
  assert(lampParts(LAMP_PROFILES.lantern).base.length === 0 && lampParts([{ r: 1, z: 0 }, { r: 0.1, z: 1 }]).base.length === 0, "a lantern and a cone have no neck — all shade");
  const flared = lampParts([{ r: 0.5, z: 0 }, { r: 0.1, z: 0.5 }, { r: 1, z: 1 }]);
  assert(flared.base.length === 2 && flared.shade.length === 2 && flared.shade[0].r === 0.1, "a shade flaring out of the neck starts at the neck");
  assert(!BODY_UNREAD.has("lamp") && !BODY_UNREAD.has("tree") && BODY_UNREAD.has("bar"), "a lamp's and a tree's body is read; a bar's is not offered");
  console.log("body-profiles self-check passed");
}
