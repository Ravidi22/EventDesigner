// THE CHANDELIER'S LAYOUT — one definition for the plan and the room (the user, 2026-11-07: "need
// to improve the 3D of the chandeliers, more customisable — קומות, חרוזי קריסטל"; and "the body you
// added is good but it doesn't combine the shape with the drawing"; 2026-11-08, seven photographs
// of the chandeliers at אמרה: "this is how it should be").
//
// A chandelier is its STYLE (lib/catalog/symbols.ts ChandelierStyle — arms, crystal, hoop, sputnik,
// pendants, linear, floral, drums, prisms, empire) and, for the tiered styles, how many TIERS stand
// one above the other and what CRYSTAL hangs from them (MapAppearance.chandelier). Everything here
// is in FRACTIONS of the piece's radius R and height h, so the picture (components/item-symbol.tsx
// chandelier) and the body (lib/scene/overhead.ts chandelierBody) read the same rings, lights and
// beads at any size: where the plan draws a bead from above, the room hangs a glass bead.
//
// Two families of tiers. The CLASSIC ones (arms, crystal, hoop) widen DOWNWARD — the lowest ring is
// the plan's circle, each ring above it smaller. The CASCADES (drums, prisms — the photographs'
// stacked drum shades and curtains of crystal rods) widen UPWARD: the top tier is the plan's circle
// and each tier under it narrower, down to a thin tail. An EMPIRE piece is a basket: a crown, a wide
// ring with a fringe, strands of beads sweeping down and inward to a small ring with a drop cluster.
//
// THE SILHOUETTE (2026-11-08, eight more photographs: "I tried the generic גוף on my catalog but it
// doesn't look good in 3D"). A round shape's body (MapAppearance.revolve, lib/element/revolve.ts) is,
// on a chandelier, its OUTLINE SEEN FROM THE SIDE — the envelope its tiers, rods, rings and strands
// fill — never a solid: built as a solid it was an opaque gold urn the size of the whole piece with
// the arms, the bulbs and the crystal inside it. Every tier's radius is read off the silhouette at
// the tier's height, so a spindle of crystal, a basket stacked three high, a funnel of rings and a
// Maria-Theresa cone are one field, and the plan's rings (seen from above) follow it too.
//
// GLASS PENDANTS (2026-11-08, two photographs: an amber globe on a black cord, and five of them in
// amber, smoke, clear and chrome at different drops — "can I make this, as a single, as a group,
// and more variations?"). The `pendants` style is one globe or a group: its count is the globes, its
// SHADE is the glass (glassFinishOf — a clear, a tinted, a mirrored or a frosted glass, read off the
// shade's name and swatch), the base's body is the GLASS'S SHAPE (PENDANT_GLASS — a globe, an egg,
// a bell, a cylinder…; on this style the profile is each glass's own outline, not an envelope), and
// the spec says the metal of the cap and cord, whether every globe takes the next of the row's
// shades, and whether they are all one size.
//
// Pure. Run: npm run check:chandelier
import type { ChandelierCrystals, ChandelierSpec, MapAppearance, PendantFitting, RevolvePoint, Variant } from "./types";
import type { ChandelierStyle } from "./symbols";
import { cleanRevolve, profileAt } from "../element/revolve";

export { profileAt };

export const CHANDELIER_TIERS_MAX = 10;
export const CHANDELIER_STYLES: readonly ChandelierStyle[] = ["arms", "crystal", "hoop", "sputnik", "pendants", "linear", "floral", "drums", "prisms", "empire", "spiral", "rings"];

/** One of a row's shades, as a glass pendant reads it: its name says the finish, its swatch the tint. */
export interface GlassShade {
  name: string;
  swatch: string;
}

/** What the plan and the room are handed for a chandelier: its stored build, its silhouette — the
 *  base shape's body (MapAppearance.revolve), which a chandelier reads as its outline from the side
 *  (and a glass pendant as its glass's shape) — and, for a group of pendants each in its own glass,
 *  the row's shades in order. Neither is stored in ChandelierSpec. */
export type ChandelierDraw = ChandelierSpec & { profile?: RevolvePoint[]; palette?: GlassShade[] };

/** A row's appearance read as a chandelier's drawing — undefined when it says nothing. `variants`
 *  are the row's shades: a group whose globes each take the next one needs them. */
export function chandelierDrawOf(a: MapAppearance | undefined, variants?: readonly Variant[]): ChandelierDraw | undefined {
  if (!a) return undefined;
  const profile = a.revolve && a.revolve.length >= 2 ? a.revolve : undefined;
  if (!a.chandelier && !profile) return undefined;
  const palette = a.chandelier?.glassMix ? (variants ?? []).filter((v) => !v.archived && v.swatch).map((v) => ({ name: v.name, swatch: v.swatch! })) : [];
  return { ...a.chandelier, ...(profile ? { profile } : {}), ...(palette.length ? { palette } : {}) };
}

// ── glass pendants ──────────────────────────────────────────────────────────────────────────────

/** How a pendant's glass is made: clear, tinted in its shade (amber, smoke, rose…), mirrored (a
 *  chrome or silvered globe — the lamp shows through it faintly), or frosted (opal, milk). */
export type GlassFinish = "clear" | "tinted" | "mirror" | "frosted";

const nearWhite = (hex: string): boolean => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return Math.min(r, g, b) > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 18;
};

/** The finish a shade's NAME says (the way a vessel's form is read off its name), else its swatch:
 *  chrome / mirror / silver → mirrored; opal / milk / frosted → frosted; clear, or a swatch near
 *  white → clear; any other colour → that colour's tinted glass. */
export function glassFinishOf(name: string | undefined, swatch: string | undefined): GlassFinish {
  const n = (name ?? "").toLowerCase();
  if (/כרום|מראה|כסוף|כסף|מטאל|chrome|mirror|silver/.test(n)) return "mirror";
  if (/חלבי|חלב|אופל|(^|s)מט($|s)|frost|opal|milk|matt/.test(n)) return "frosted";
  if (/שקוף|clear|transparent/.test(n) || !swatch || nearWhite(swatch)) return "clear";
  return "tinted";
}

export const PENDANT_FITTINGS: readonly PendantFitting[] = ["black", "brass", "chrome", "white"];
export const FITTING_LABEL: Record<PendantFitting, string> = { black: "שחור", brass: "פליז", chrome: "כרום", white: "לבן" };
export const FITTING_COLOUR: Record<PendantFitting, string> = { black: "#232326", brass: "#b08d57", chrome: "#c6cbd1", white: "#f1f0ec" };

/** A glass's shape, bottom to top as fractions of its radius and its height (it stands in a box as
 *  tall as it is wide). A closed glass starts on the axis; a shade open underneath (a bell, a dome, a
 *  cone) starts at its rim. Each ends at the neck its cap covers. */
export type PendantGlassForm = "globe" | "egg" | "drop" | "bell" | "dome" | "cylinder" | "cone";
export const PENDANT_GLASS_FORMS: PendantGlassForm[] = ["globe", "egg", "drop", "bell", "dome", "cylinder", "cone"];
export const PENDANT_GLASS_LABEL: Record<PendantGlassForm, string> = {
  globe: "כדור",
  egg: "ביצה",
  drop: "טיפה",
  bell: "פעמון",
  dome: "כיפה",
  cylinder: "גליל",
  cone: "חרוט",
};
export const PENDANT_GLASS: Record<PendantGlassForm, RevolvePoint[]> = {
  globe: [
    { r: 0.04, z: 0 },
    { r: 0.5, z: 0.07 },
    { r: 0.87, z: 0.25 },
    { r: 1, z: 0.5 },
    { r: 0.87, z: 0.75 },
    { r: 0.55, z: 0.92 },
    { r: 0.3, z: 1 },
  ],
  egg: [
    { r: 0.04, z: 0 },
    { r: 0.55, z: 0.06 },
    { r: 0.9, z: 0.22 },
    { r: 1, z: 0.4 },
    { r: 0.9, z: 0.66 },
    { r: 0.58, z: 0.9 },
    { r: 0.28, z: 1 },
  ],
  drop: [
    { r: 0.04, z: 0 },
    { r: 0.62, z: 0.06 },
    { r: 0.96, z: 0.2 },
    { r: 1, z: 0.32 },
    { r: 0.78, z: 0.58 },
    { r: 0.42, z: 0.84 },
    { r: 0.2, z: 1 },
  ],
  bell: [
    { r: 1, z: 0 },
    { r: 0.92, z: 0.12 },
    { r: 0.68, z: 0.38 },
    { r: 0.54, z: 0.66 },
    { r: 0.42, z: 0.88 },
    { r: 0.22, z: 1 },
  ],
  dome: [
    { r: 1, z: 0 },
    { r: 0.97, z: 0.18 },
    { r: 0.84, z: 0.45 },
    { r: 0.58, z: 0.74 },
    { r: 0.2, z: 1 },
  ],
  cylinder: [
    { r: 0.04, z: 0 },
    { r: 0.92, z: 0.02 },
    { r: 1, z: 0.07 },
    { r: 1, z: 0.93 },
    { r: 0.4, z: 1 },
  ],
  cone: [
    { r: 1, z: 0 },
    { r: 0.62, z: 0.45 },
    { r: 0.18, z: 1 },
  ],
};

/** A group of globes all one size, as fractions of the piece's radius: one in the middle; up to six
 *  round a ring, touching their neighbours and the plan's circle; more round a ring with one in the
 *  middle. */
export function equalGlobes(count: number): { x: number; y: number; r: number }[] {
  const n = Math.max(1, Math.min(24, Math.round(count) || 1));
  if (n === 1) return [{ x: 0, y: 0, r: 0.95 }];
  const ring = n <= 6 ? n : n - 1;
  const s = Math.sin(Math.PI / ring);
  const g = Math.min(s / (1 + s), n <= 6 ? 0.5 : 1 / 3);
  const out = Array.from({ length: ring }, (_, i) => {
    const a = ((-90 + (i * 360) / ring) * Math.PI) / 180;
    return { x: (1 - g) * Math.cos(a), y: (1 - g) * Math.sin(a), r: g * 0.95 };
  });
  return n <= 6 ? out : [{ x: 0, y: 0, r: g * 0.95 }, ...out];
}

/** How far above the piece's underside globe `i` of a group hangs, as a share of the height its
 *  glass leaves free (0 = the lowest, at the underside) — the drops differ, as the photographs' do;
 *  a single globe IS the underside. */
export const globeRise = (i: number, count: number): number => (count <= 1 ? 0 : ((i * 7) % 5) / 4);

/** The silhouettes a chandelier is commonly made in, bottom to top as fractions of the radius and
 *  the height (RevolvePoint): offered as tiles in the chandelier's own panel. Each reaches r = 1 —
 *  the plan's circle is the widest ring. */
export type ChandelierProfileForm = "cone" | "funnel" | "spindle" | "crown" | "bell" | "globe";
export const CHANDELIER_PROFILE_FORMS: ChandelierProfileForm[] = ["cone", "funnel", "spindle", "crown", "bell", "globe"];
export const CHANDELIER_PROFILE_LABEL: Record<ChandelierProfileForm, string> = {
  cone: "חרוט — רחב למטה",
  funnel: "משפך — רחב למעלה",
  spindle: "יהלום",
  crown: "כתר ומפל",
  bell: "פעמון",
  globe: "כדור",
};
export const CHANDELIER_PROFILES: Record<ChandelierProfileForm, RevolvePoint[]> = {
  cone: [
    { r: 1, z: 0 },
    { r: 0.92, z: 0.3 },
    { r: 0.35, z: 1 },
  ],
  funnel: [
    { r: 0.12, z: 0 },
    { r: 0.55, z: 0.45 },
    { r: 1, z: 1 },
  ],
  spindle: [
    { r: 0.05, z: 0 },
    { r: 0.55, z: 0.28 },
    { r: 1, z: 0.62 },
    { r: 0.8, z: 0.84 },
    { r: 0.32, z: 1 },
  ],
  crown: [
    { r: 0.08, z: 0 },
    { r: 0.55, z: 0.32 },
    { r: 1, z: 0.66 },
    { r: 0.9, z: 0.72 },
    { r: 0.42, z: 0.78 },
    { r: 0.38, z: 1 },
  ],
  bell: [
    { r: 0.22, z: 0 },
    { r: 0.95, z: 0.2 },
    { r: 1, z: 0.3 },
    { r: 0.68, z: 0.58 },
    { r: 0.42, z: 0.82 },
    { r: 0.28, z: 1 },
  ],
  globe: [
    { r: 0.25, z: 0 },
    { r: 0.85, z: 0.18 },
    { r: 1, z: 0.5 },
    { r: 0.85, z: 0.82 },
    { r: 0.25, z: 1 },
  ],
};

export const CHANDELIER_CRYSTALS: readonly ChandelierCrystals[] = ["none", "drops", "strands", "garlands"];
export const CRYSTALS_LABEL: Record<ChandelierCrystals, string> = {
  none: "בלי קריסטל",
  drops: "נטיפים",
  strands: "מחרוזות חרוזים",
  garlands: "שרשראות בין הקנים",
};
export const CRYSTALS_HINT: Record<ChandelierCrystals, string> = {
  none: "הקנים והנורות בלבד",
  drops: "נטיף קריסטל תלוי מתחת לכל נורה",
  strands: "מחרוזות של חרוזי קריסטל יורדות מכל קומה",
  garlands: "שרשראות חרוזים שמוטות מקנה לקנה",
};

/** The styles built in TIERS — rings or bands one above the other (a basket's tiers are baskets
 *  stacked, a floating piece's its rings); the rest are their own thing (a sputnik, a cluster of
 *  globes, a bar, a hoop of flowers, a spiral). */
export const TIERED_STYLES: readonly ChandelierStyle[] = ["arms", "crystal", "hoop", "drums", "prisms", "empire", "rings"];
/** The styles whose crystal is a CHOICE (the editor's קריסטל select). A cascade of rods, an empire
 *  basket and a spiral ARE crystal; drum shades and floating rings hang none. */
export const CRYSTAL_STYLES: readonly ChandelierStyle[] = ["arms", "crystal", "hoop", "linear"];
/** The styles whose tiers widen UPWARD — the top tier the plan's circle, the lowest the narrowest. */
export const CASCADE_STYLES: readonly ChandelierStyle[] = ["drums", "prisms"];
/** The styles that always ask how many strands or rods they carry (0 = their own count). */
export const STRANDED_STYLES: readonly ChandelierStyle[] = ["prisms", "empire", "spiral"];
/** The styles a silhouette shapes (the base's body): every tiered one and the spiral — and glass
 *  pendants, whose body is each glass's own shape (PENDANT_GLASS). */
export const PROFILED_STYLES: readonly ChandelierStyle[] = [...TIERED_STYLES, "spiral", "pendants"];

/** A CASCADE's build (drums, prisms): the body between `bottom` and `top` of h (the tail under it, the
 *  canopy over it); the lowest tier `taper` of the top's radius; every band `band` of its tier's share
 *  of the height (the rest a gap); the lights inside a tier at `lightR` of its radius. */
export const CASCADE = { bottom: 0.15, top: 0.95, taper: 0.45, band: 0.9, lightR: 0.55 } as const;
/** An EMPIRE basket: the crown ring up top, the wide ring (the plan's circle) with its fringe under
 *  it, the small ring the strands sweep in to, the lamps inside the bag, how many strands when the
 *  row says nothing. */
export const EMPIRE = { crownR: 0.32, crownZ: 0.98, ringR: 1, ringZ: 0.78, bottomR: 0.22, bottomZ: 0.16, lightR: 0.55, lightZ: 0.5, strands: 32 } as const;
/** A basket stacked in tiers: the lowest basket's share of the height between the small ring and the
 *  top ring (the rest is shared by the tiers over it). */
const EMPIRE_BAG_SHARE = 0.45;
/** A SPIRAL (raindrop helix): strands of beads hang from a plate at `plateZ`, from `top` down; strand
 *  i of m ends `turns` turns round lower than the one before, from `top` to `bottom`, on a helix
 *  narrowing from `rTop` to `rBottom` (the silhouette's radius instead, when it has one); each ends
 *  in a ball. */
export const SPIRAL = { plateZ: 0.97, top: 0.93, bottom: 0.05, turns: 3, rTop: 0.82, rBottom: 0.42, strands: 56 } as const;
/** FLOATING RINGS: the rings spread from `bottom` to `top`, the lowest `taper` of the widest (the
 *  top), each tilted up to `tilt`°, a glass globe hung inside each. */
export const RINGS = { bottom: 0.1, top: 0.86, taper: 0.42, r: 0.94, tilt: 16, globeR: 0.11 } as const;

export const isChandelierStyle = (s: unknown): s is ChandelierStyle => typeof s === "string" && (CHANDELIER_STYLES as readonly string[]).includes(s);

/** A chandelier's build, every blank filled: its style (absent = arms), its tiers (a crystal piece
 *  two, drum shades three, a cascade of rods five, every other one; only a tiered style takes more),
 *  its crystal (a crystal piece strands, an arms piece drops — the plan's twelve glass drops under
 *  the ring — a cascade of rods and a basket their strands, the rest none), its strands. */
export interface ResolvedChandelier {
  style: ChandelierStyle;
  tiers: number;
  crystals: ChandelierCrystals;
  /** Strands or garlands per tier (0 = two per light); a cascade's rods per tier (0 = six per
   *  light); a basket's strands round it (0 = EMPIRE.strands); a spiral's strands (0 =
   *  SPIRAL.strands). */
  strands: number;
  /** The silhouette (cleaned, bottom to top) when the row's base has a body and the style is one a
   *  silhouette shapes (PROFILED_STYLES); absent = the style's own outline. */
  profile?: RevolvePoint[];
  /** Glass pendants: the metal (absent in the spec = black), every globe its own shade, all one size. */
  fitting: PendantFitting;
  glassMix: boolean;
  equal: boolean;
}

const ownTiers = (st: ChandelierStyle): number => (st === "crystal" ? 2 : st === "drums" ? 3 : st === "prisms" ? 5 : st === "rings" ? 5 : 1);

export function chandelierOf(style: string | undefined, spec: ChandelierDraw | undefined): ResolvedChandelier {
  const st: ChandelierStyle = isChandelierStyle(style) ? style : "arms";
  const tiered = TIERED_STYLES.includes(st);
  const wanted = spec?.tiers ?? ownTiers(st);
  const tiers = tiered ? Math.max(1, Math.min(CHANDELIER_TIERS_MAX, Math.round(wanted) || 1)) : 1;
  const crystals: ChandelierCrystals = CRYSTAL_STYLES.includes(st)
    ? (spec?.crystals ?? (st === "crystal" ? "strands" : st === "arms" ? "drops" : "none"))
    : STRANDED_STYLES.includes(st)
      ? "strands"
      : "none";
  const strands = Math.max(0, Math.round(spec?.strands ?? 0) || 0);
  const out: ResolvedChandelier = { style: st, tiers, crystals, strands, fitting: spec?.fitting ?? "black", glassMix: !!spec?.glassMix, equal: !!spec?.equal };
  if (spec?.profile && spec.profile.length >= 2 && PROFILED_STYLES.includes(st)) out.profile = cleanRevolve(spec.profile);
  return out;
}

/** The spec a designer's choice stores: the style's own answers are not written down, so a row keeps
 *  following the style until it says otherwise. */
export function chandelierPatch(style: string | undefined, spec: ChandelierSpec | undefined, patch: ChandelierSpec): ChandelierSpec | undefined {
  const own = chandelierOf(style, undefined);
  const next: ChandelierSpec = { ...spec, ...patch };
  const out: ChandelierSpec = {};
  if (next.tiers !== undefined && next.tiers !== own.tiers) out.tiers = Math.max(1, Math.min(CHANDELIER_TIERS_MAX, Math.round(next.tiers)));
  if (next.crystals !== undefined && next.crystals !== own.crystals) out.crystals = next.crystals;
  if (next.strands) out.strands = Math.round(next.strands);
  if (next.fitting && next.fitting !== "black") out.fitting = next.fitting;
  if (next.glassMix) out.glassMix = true;
  if (next.equal) out.equal = true;
  return Object.keys(out).length ? out : undefined;
}

/** Whether the editor asks this build how many strands it carries, and what to call them. */
export function asksStrands(c: ResolvedChandelier): boolean {
  return STRANDED_STYLES.includes(c.style) || (TIERED_STYLES.includes(c.style) && (c.crystals === "strands" || c.crystals === "garlands"));
}
export function strandsLabel(style: ChandelierStyle): string {
  return style === "prisms" ? "מוטות קריסטל בכל קומה" : style === "empire" ? "מחרוזות סביב הסל" : style === "spiral" ? "מחרוזות בספירלה" : "מחרוזות בכל קומה";
}
/** The editor's one line under the fields: what this build is, and what 0 strands means for it. */
export function chandelierHint(c: ResolvedChandelier): string {
  switch (c.style) {
    case "drums":
      return "אהילי בד זה מתחת לזה, הרחב למעלה והולכים וצרים — מוארים מבפנים, בגוון הפריט";
    case "prisms":
      return "קומות של מוטות קריסטל תלויים, הרחבה למעלה ומצטמצמות לזנב דק" + (c.strands ? "" : " · 0 = שישה מוטות לכל נורה");
    case "empire":
      return (c.tiers > 1 ? "סלים זה מעל זה — כל טבעת ומחרוזותיה, והתחתון יורד פנימה לטבעת קטנה" : "כתר, טבעת רחבה ומחרוזות חרוזים שיורדות פנימה לטבעת קטנה — צורת סל") + (c.strands ? "" : ` · 0 = ${EMPIRE.strands} מחרוזות`);
    case "spiral":
      return "מחרוזות חרוזים תלויות מצלחת, וכדורי הקריסטל בקצותיהן יורדים בספירלה" + (c.strands ? "" : ` · 0 = ${SPIRAL.strands} מחרוזות`);
    case "rings":
      return "טבעות אור מוטות זו מעל זו, כדור זכוכית מואר בתוך כל טבעת, תלויות בכבלים מהתקרה";
    case "pendants":
      return "גלובוס זכוכית אחד או קבוצה — המספר הוא ״כמות קנים״ בטופס הפריט; הזכוכית בגוון הפריט (ענבר, עשן, שקוף, כרום…), כל גלובוס בכבל משלו עד התקרה";
    default:
      return CRYSTALS_HINT[c.crystals] + (asksStrands(c) && c.strands === 0 ? " · 0 = שתיים לכל נורה" : "");
  }
}

/** One tier of lights: its ring's radius (of R) and height (of h — the ring's own height above the
 *  piece's underside), how many lights stand on it and at which plan angles (degrees). A CASCADE's
 *  tier is a BAND — a drum shade, a curtain of rods — standing `h` of the height up from `z`; its
 *  lights are inside it, at CASCADE.lightR of its radius. A classic tier has no `h`: a ring. */
export interface ChandelierTier {
  r: number;
  z: number;
  h?: number;
  count: number;
  angles: number[];
  /** A floating ring's lean: tilted `tiltDeg` about the plan axis at `turnDeg` (seen from above an
   *  ellipse, its long axis along `turnDeg`, its short one cos(tilt) of it). Level when absent. */
  tiltDeg?: number;
  turnDeg?: number;
}

/** A point of a tier's ring at plan angle `angleDeg`, its lean applied: `x`/`y` of R, `z` of h —
 *  `aspect` is R / h, since a lean lifts one side of the ring by a share of its RADIUS. The same
 *  turn the room gives a leaned torus (lib/scene: rotateX by the tilt, then the plan turn). */
export function ringPoint(t: ChandelierTier, angleDeg: number, aspect: number): { x: number; y: number; z: number } {
  const a = (angleDeg * Math.PI) / 180;
  const tilt = ((t.tiltDeg ?? 0) * Math.PI) / 180;
  const turn = ((t.turnDeg ?? 0) * Math.PI) / 180;
  // In the ring's own frame (its lean axis along x), then turned on the plan.
  const ox = t.r * Math.cos(a - turn);
  const oy = t.r * Math.sin(a - turn);
  const ly = oy * Math.cos(tilt);
  const lz = -oy * Math.sin(tilt);
  return { x: ox * Math.cos(turn) - ly * Math.sin(turn), y: ox * Math.sin(turn) + ly * Math.cos(turn), z: t.z + lz * aspect };
}

/** A floating ring's glass globe, hung inside it a little off its middle: `x`/`y`/`r` of R, `z` of h. */
export function ringGlobe(t: ChandelierTier, k: number): { x: number; y: number; z: number; r: number } {
  const a = ((k * 113 + 30) * Math.PI) / 180;
  return { x: 0.28 * t.r * Math.cos(a), y: 0.28 * t.r * Math.sin(a), z: t.z - 0.035, r: RINGS.globeR * Math.max(0.6, Math.min(1, t.r / RINGS.r)) };
}

/** The radius of the tier that IS the plan's circle: the lowest of a classic piece (0.74 R for arms,
 *  0.84 R for a crystal piece — its strands hang just outside — 0.9 R for a hoop), the TOP of a
 *  cascade (a drum shade's rim is the circle; a curtain of rods hangs just inside it), the wide ring
 *  of a basket. */
export function baseRingOf(style: ChandelierStyle): number {
  switch (style) {
    case "hoop":
      return 0.9;
    case "crystal":
      return 0.84;
    case "drums":
    case "empire":
      return 1;
    case "prisms":
      return 0.96;
    case "rings":
      return RINGS.r;
    case "spiral":
      return SPIRAL.rTop;
    default:
      return 0.74;
  }
}

/** A basket's crown: its own small ring, never wider than three fifths of the top ring under it. */
export const empireCrownR = (tiers: readonly ChandelierTier[]): number => Math.min(EMPIRE.crownR, (tiers[tiers.length - 1]?.r ?? 1) * 0.6);

/** The tiers, lowest first. CLASSIC: the lowest is the plan's ring at 0.2 h, each above it smaller
 *  and higher (r × (1 − 0.55 k/n), z 0.2 + 0.6 k/n). CASCADE: the top tier is the plan's circle and
 *  each under it narrower (CASCADE.taper of it at the bottom), the body shared evenly between
 *  CASCADE.bottom and .top, every band CASCADE.band of its share. EMPIRE: its one wide ring. Every
 *  tier has as many lights as its radius has room for in proportion, never under three, every tier
 *  turned half a step from the one under it so the lights alternate. `count` is the row's arms
 *  (symbolCount); 0 = the plan's eight. */
export function chandelierTiers(c: ResolvedChandelier, count: number): ChandelierTier[] {
  const n = c.tiers;
  const r0 = baseRingOf(c.style);
  const base = Math.max(3, Math.round(count) || 8);
  const P = c.profile;
  /** The silhouette's share at `z`, or the style's own `f` when there is none. */
  const shape = (z: number, f: number) => (P ? profileAt(P, z) : f);
  const tier = (k: number, r: number, z: number, h?: number): ChandelierTier => {
    const cnt = Math.max(3, Math.round((base * r) / r0));
    const turn = -90 + (k % 2 ? 180 / cnt : 0);
    return { r, z, ...(h !== undefined ? { h } : {}), count: cnt, angles: Array.from({ length: cnt }, (_, i) => turn + (i * 360) / cnt) };
  };
  if (c.style === "spiral") {
    // The plate's downlights: one ring of them, half the plate across.
    return [tier(0, 0.45, SPIRAL.plateZ)];
  }
  if (c.style === "empire") {
    if (n === 1) return [tier(0, EMPIRE.ringR * shape(EMPIRE.ringZ, 1), EMPIRE.ringZ)];
    // Baskets stacked: the lowest ring EMPIRE_BAG_SHARE of the way up from the small ring, the rest
    // evenly up to the top ring; each smaller than the one under it unless a silhouette says.
    const z0 = EMPIRE.bottomZ + (EMPIRE.ringZ - EMPIRE.bottomZ) * EMPIRE_BAG_SHARE;
    return Array.from({ length: n }, (_, k) => {
      const z = z0 + ((EMPIRE.ringZ - z0) * k) / (n - 1);
      return tier(k, EMPIRE.ringR * shape(z, 1 - (0.55 * k) / n), z);
    });
  }
  if (c.style === "rings") {
    // Floating rings, the widest on top; every ring leaned a little, each its own way, a globe in it.
    return Array.from({ length: n }, (_, k) => {
      const z = n === 1 ? 0.5 : RINGS.bottom + ((RINGS.top - RINGS.bottom) * k) / (n - 1);
      const t = tier(k, r0 * shape(z, n === 1 ? 1 : RINGS.taper + (1 - RINGS.taper) * (k / (n - 1))), z);
      if (n > 1) {
        t.tiltDeg = (k % 2 ? -1 : 1) * RINGS.tilt * (0.55 + 0.45 * (((k * 7) % 4) / 3));
        t.turnDeg = (k * 67) % 360;
      }
      return t;
    });
  }
  if (CASCADE_STYLES.includes(c.style)) {
    const share = (CASCADE.top - CASCADE.bottom) / n;
    return Array.from({ length: n }, (_, k) => {
      const z = CASCADE.bottom + k * share;
      const hh = share * CASCADE.band;
      const f = n === 1 ? 1 : CASCADE.taper + (1 - CASCADE.taper) * (k / (n - 1));
      return tier(k, r0 * shape(z + hh / 2, f), z, hh);
    });
  }
  // Classic: with a silhouette the tiers spread over the body (0.12 h to 0.84 h) and each takes the
  // silhouette's radius where it stands; without one the old layout, so no row changes by itself.
  return Array.from({ length: n }, (_, k) => {
    const z = P ? (n === 1 ? 0.2 : 0.12 + (0.72 * k) / (n - 1)) : 0.2 + (0.6 * k) / n;
    return tier(k, r0 * shape(z, 1 - (0.55 * k) / n), z);
  });
}

/** One bead of crystal, as fractions: `x`/`y` of R on the plan, `z` of h, `r` its radius of R. A ROD
 *  (a cascade's) has `h`: it hangs from `z` + `h` down to `z`, `r` its half-width. */
export interface CrystalBead {
  x: number;
  y: number;
  z: number;
  r: number;
  h?: number;
  /** The beads of one strand, swag or garland share it, in hanging order: the room links them into
   *  one chain (a strand of octagons touching is a line of crystal, not a row of dots). */
  strand?: number;
}

export const BEAD = 0.028;
export const BEAD_STEP = 0.045;
const MAX_BEADS = 10;
const polar = (r: number, deg: number) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });

/** Where the crystal hangs, bead by bead. DROPS: a bead and a pear under every light's arm end.
 *  STRANDS: `strands` strands (0 = two per light, between the lights) just outside each tier's ring,
 *  beads every 0.045 h from under the ring down to a hand above the tier below (the lowest to the
 *  underside). GARLANDS: seven beads swagged from each light to the next, sagging 0.1 h. A CASCADE
 *  OF RODS (prisms): `strands` rods round every tier (0 = six per light), each the tier's band
 *  tall. A BASKET (empire): `strands` strands (0 = EMPIRE.strands) from the wide ring sweeping down
 *  and inward to the small ring — nearly vertical at first, curving in at the bottom — every other
 *  one carried on up to the crown, a short fringe of two beads under the ring at each, and a cluster
 *  of drops under the small ring. The plan draws every bead where it is seen from above (a strand's
 *  beads are one dot; a basket's strand a dotted line); the room hangs a glass bead at each. */
export function crystalBeads(c: ResolvedChandelier, tiers: readonly ChandelierTier[]): CrystalBead[] {
  const out: CrystalBead[] = [];
  if (c.crystals === "none") return out;
  let sid = 0;
  if (c.style === "prisms") {
    for (const t of tiers) {
      const m = c.strands || t.count * 6;
      const step = 360 / m;
      for (let i = 0; i < m; i++) {
        const p = polar(t.r, t.angles[0] + step / 2 + i * step);
        out.push({ x: p.x, y: p.y, z: t.z, r: BEAD * 0.8, h: t.h ?? 0.1 });
      }
    }
    return out;
  }
  if (c.style === "spiral") {
    // Strands from the plate, each ending in a ball a step further round and lower than the last —
    // the balls ARE the helix; the strand above each ball one dot from above.
    const m = c.strands || SPIRAL.strands;
    for (let i = 0; i < m; i++) {
      const s = m === 1 ? 1 : i / (m - 1);
      const end = SPIRAL.top - (SPIRAL.top - SPIRAL.bottom) * s;
      const r = c.profile ? SPIRAL.rTop * profileAt(c.profile, end) : SPIRAL.rTop + (SPIRAL.rBottom - SPIRAL.rTop) * s;
      const p = polar(r, -90 + s * SPIRAL.turns * 360);
      const strand = sid++;
      for (let z = SPIRAL.top; z > end + BEAD_STEP * 0.5; z -= BEAD_STEP * 1.6) out.push({ x: p.x, y: p.y, z, r: BEAD * 0.55, strand });
      out.push({ x: p.x, y: p.y, z: end, r: BEAD * 3.4, strand });
    }
    return out;
  }
  if (c.style === "empire") {
    const m = c.strands || EMPIRE.strands;
    const step = 360 / m;
    const t0 = tiers[0];
    const bagH = t0.z - EMPIRE.bottomZ;
    for (let i = 0; i < m; i++) {
      const a = -90 + i * step;
      // The bag: nearly vertical under the lowest ring, sweeping in to the small ring at the bottom.
      const strand = sid++;
      for (let z = t0.z - 0.03; z >= EMPIRE.bottomZ - 1e-9; z -= BEAD_STEP) {
        const t = (t0.z - z) / bagH;
        const p = polar(EMPIRE.bottomR + (t0.r - EMPIRE.bottomR) * (1 - Math.pow(t, 2.2)), a);
        out.push({ x: p.x, y: p.y, z, r: BEAD, strand });
      }
    }
    // Every ring's fringe; every ring over the lowest hangs a curtain down to just over the ring
    // under it, bellied a little, fewer strands the smaller it is.
    tiers.forEach((t, k) => {
      const mk = k === 0 ? m : Math.max(8, Math.round((m * t.r) / t0.r));
      const sk = 360 / mk;
      for (let i = 0; i < mk; i++) {
        const a = -90 + i * sk + (k % 2 ? sk / 2 : 0);
        if (k > 0) {
          const below = tiers[k - 1].z + 0.025;
          const strand = sid++;
          for (let z = t.z - 0.03; z >= below - 1e-9; z -= BEAD_STEP) {
            const s = (t.z - z) / Math.max(1e-6, t.z - below);
            const p = polar(t.r * (1 + 0.07 * Math.sin(Math.PI * s)), a);
            out.push({ x: p.x, y: p.y, z, r: BEAD, strand });
          }
        }
        const f = polar(t.r * 1.03, a + sk / 2);
        out.push({ x: f.x, y: f.y, z: t.z - 0.04, r: BEAD }, { x: f.x, y: f.y, z: t.z - 0.085, r: BEAD * 1.4 });
      }
    });
    // The tent: every other strand from the top ring up to the crown.
    const top = tiers[tiers.length - 1];
    const crownR = empireCrownR(tiers);
    const tentH = EMPIRE.crownZ - top.z;
    const mt = Math.max(8, Math.round((m * top.r) / t0.r));
    for (let i = 0; i < mt; i += 2) {
      const a = -90 + (i * 360) / mt;
      const strand = sid++;
      for (let z = top.z + 0.03; z <= EMPIRE.crownZ - 0.02 + 1e-9; z += BEAD_STEP) {
        const t = (z - top.z) / tentH;
        const p = polar(top.r - (top.r - crownR) * t, a);
        out.push({ x: p.x, y: p.y, z, r: BEAD, strand });
      }
    }
    // The drop cluster under the small ring.
    for (let i = 0; i < 6; i++) {
      const p = polar(EMPIRE.bottomR * 0.5, -90 + i * 60);
      out.push({ x: p.x, y: p.y, z: EMPIRE.bottomZ - 0.05, r: BEAD });
    }
    out.push({ x: 0, y: 0, z: 0.06, r: BEAD * 2 });
    return out;
  }
  tiers.forEach((t, k) => {
    const floor = k === 0 ? 0.03 : tiers[k - 1].z + 0.08;
    if (c.crystals === "drops") {
      for (const a of t.angles) {
        const p = polar(t.r, a);
        out.push({ x: p.x, y: p.y, z: t.z - 0.07, r: BEAD }, { x: p.x, y: p.y, z: t.z - 0.13, r: BEAD * 1.5 });
      }
    } else if (c.crystals === "strands") {
      const m = c.strands || t.count * 2;
      const step = 360 / m;
      // Between the lights when there are two per light; else spread from the first light's angle.
      const start = t.angles[0] + (m === t.count * 2 ? step / 2 : 0);
      for (let i = 0; i < m; i++) {
        const p = polar(t.r * 1.05, start + i * step);
        const strand = sid++;
        for (let j = 0; j < MAX_BEADS; j++) {
          const z = t.z - 0.03 - j * BEAD_STEP;
          if (z < floor) break;
          out.push({ x: p.x, y: p.y, z, r: BEAD, strand });
        }
      }
    } else {
      // garlands
      const n = t.angles.length;
      for (let i = 0; i < n; i++) {
        const a = polar(t.r, t.angles[i]);
        const b = polar(t.r, t.angles[(i + 1) % n]);
        const strand = sid++;
        for (let j = 1; j <= 7; j++) {
          const s = j / 8;
          out.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, z: t.z - 0.1 * Math.sin(Math.PI * s), r: BEAD, strand });
        }
      }
    }
  });
  return out;
}
