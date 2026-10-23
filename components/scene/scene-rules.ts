// The viewer's decisions that are arithmetic, kept out of the React/three files so
// `check:scene-viewer` can hold them under Node: how an emitter's strength becomes a light, which
// emitters get a real light, when a body's level of detail flips, and which flat bodies are
// coplanar floors that must not z-fight. No three here, no DOM.
import type { BodyNode, Mood } from "@/lib/scene/types";

// --- emitters -------------------------------------------------------------------------------------

/** How much of an emitter's halo shows: nothing by day, most of it in the evening, all at night. */
export const HALO_BY_MOOD: Record<Mood, number> = { day: 0, evening: 0.6, night: 1 };

/** How much of an emitter's real light shows (spec §4: evening at half). */
export const LIGHT_BY_MOOD: Record<Mood, number> = { day: 0, evening: 0.5, night: 1 };

/** A strength at or above this is a bulb or a lamp — lit before any candle. */
export const LAMP_CLASS = 0.7;

/** A point light's intensity in candela from the builder's 0–1 strength: a candle (0.4) 0.6, a
 *  chandelier bulb (0.7) 2, a lamp (1) 3 — piecewise linear between them, clamped past 1. */
export function intensityOf(strength: number): number {
  const s = Math.max(0, Math.min(1, strength));
  if (s <= 0.4) return (s / 0.4) * 0.6;
  if (s <= LAMP_CLASS) return 0.6 + ((s - 0.4) / (LAMP_CLASS - 0.4)) * 1.4;
  return 2 + ((s - LAMP_CLASS) / (1 - LAMP_CLASS)) * 1;
}

/** How far a light reaches, in metres: six times the emitter's radius, plus two. */
export function lightDistanceM(radiusM: number): number {
  return 6 * radiusM + 2;
}

export interface LitCandidate {
  index: number;
  lamp: boolean;
  /** Any monotone measure of distance to the camera (squared is fine). */
  distance: number;
}

/** Which `n` emitters get a real light: every lamp-class one nearest first, then the nearest
 *  candles. Returns their indices, nearest lamp first. */
export function pickLit(candidates: LitCandidate[], n: number): number[] {
  if (n <= 0 || candidates.length === 0) return [];
  const byDistance = (a: LitCandidate, b: LitCandidate) => a.distance - b.distance;
  const lamps = candidates.filter((c) => c.lamp).sort(byDistance);
  const candles = candidates.filter((c) => !c.lamp).sort(byDistance);
  return [...lamps, ...candles].slice(0, n).map((c) => c.index);
}

// --- level of detail ------------------------------------------------------------------------------

/** Past this a chair is drawn as its box (spec §8). */
export const CHAIR_BOX_MM = 25000;

export interface LodVisibility {
  /** The body as built. */
  main: boolean;
  /** The body's far box, where it has one. */
  far: boolean;
}

/** What shows at `distMm` from the camera: a `near` body up to its threshold, a `far` one past it,
 *  and a body with a box stand-in swaps to the box past CHAIR_BOX_MM. `lodScale` multiplies every
 *  threshold (a phone's 0.5 drops detail twice as near). Never both, never neither when the body
 *  itself is in range. */
export function lodVisibility(lod: BodyNode["lod"], hasBox: boolean, distMm: number, lodScale: number): LodVisibility {
  let main = true;
  if (lod) {
    const beyond = lod.beyondMm * lodScale;
    main = lod.tier === "near" ? distMm <= beyond : distMm > beyond;
  }
  let far = false;
  if (hasBox && main && distMm > CHAIR_BOX_MM * lodScale) {
    far = true;
    main = false;
  }
  return { main, far };
}

/** Which bodies get a box stand-in at distance. */
export function hasFarBox(body: BodyNode): boolean {
  return body.tag.type === "chair";
}

/** Whether the body takes part in the distance evaluation at all. */
export function lodMatters(body: BodyNode): boolean {
  return !!body.lod || hasFarBox(body);
}

// --- coplanar floors ------------------------------------------------------------------------------

export const GROUND_RANK = -2;
export const FLOOR_RANK = 0;
export const MAX_SURFACE_RANK = 8;

/** The stacking rank of a flat floor body, or null for anything that is not one. The builder lays
 *  the ground a millimetre under the zone floors and the surface features a millimetre each over
 *  them (lib/scene/envelope.ts): the ground is −2, a floor 0, a surface feature 1… by its own
 *  height above the floor. A higher rank is drawn later and pulled a hair toward the camera
 *  (a negative polygon offset), so three planes a millimetre apart never z-fight at distance. Only
 *  a body made of planes alone ranks — a pool's well, a plant, an extruded structure do not. */
export function floorRank(body: BodyNode): number | null {
  if (body.parts.length === 0 || !body.parts.every((p) => p.shape === "plane")) return null;
  switch (body.tag.type) {
    case "ground":
      return GROUND_RANK;
    case "floor":
      return FLOOR_RANK;
    case "feature": {
      let z = Infinity;
      for (const p of body.parts) z = Math.min(z, p.at.z);
      return Math.max(1, Math.min(MAX_SURFACE_RANK, Math.round(z)));
    }
    default:
      return null;
  }
}

/** The polygon offset (factor = units) a rank gets: the ground pushed back, a surface pulled in. */
export function polygonOffsetOf(rank: number): number {
  return -rank;
}

/** Where a ranked floor goes in the draw order: every floor before the furniture, in rank order,
 *  so a later (higher) plane wins a depth tie under LessEqual as well as by its offset. */
export function renderOrderOf(rank: number): number {
  return rank - 10;
}
