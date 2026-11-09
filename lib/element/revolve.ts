// A BODY OF REVOLUTION — a round shape stood up from its side profile (the element model, docs/
// superpowers/specs/2026-11-07-element-model-design.md §2.2 `revolve`, Stage 2). A circle on the
// plan is a cylinder until it is given a profile: then it is a bowl, a vase, an urn, a basin's tier,
// a baluster — the profile turned about the shape's centre, its rim where the plan draws the
// circle (r = 1), its foot where the shape's bottom is (z = 0), its top at the shape's height (z = 1).
//
// The profile is FRACTIONS (lib/catalog/types.ts RevolvePoint), not millimetres, so a bowl typed
// wider or taller stays a bowl; the millimetres are read off the piece as it stands
// (`revolveProfileMm`, lib/scene/element-body.ts) — an ellipse is the same profile stretched. A few
// forms are presets a tile picks; any of them may then be dragged point by point in the editor
// (app/(app)/catalog/revolve-editor.tsx), which goes through `movedPoint` / `addedPoint` /
// `removedPoint` here so the profile stays sound: bottom to top, every radius inside the rim.
//
// Pure. Run: npm run check:revolve
import type { RevolvePoint } from "@/lib/catalog/types";
import type { Point } from "@/lib/studio/hall";
import { isMain } from "../self-check";

export type RevolveForm = "bowl" | "vase" | "urn" | "basin" | "baluster" | "cone" | "dome";

export const REVOLVE_FORMS: RevolveForm[] = ["bowl", "basin", "vase", "urn", "baluster", "cone", "dome"];

export const REVOLVE_LABEL: Record<RevolveForm, string> = {
  bowl: "קערה",
  basin: "אגן",
  vase: "אגרטל",
  urn: "כד",
  baluster: "באלוסטר",
  cone: "חרוט",
  dome: "כיפה",
};

/** The presets, bottom to top. Each reaches r = 1 somewhere (the plan's circle IS the widest
 *  ring) and runs from z = 0 to z = 1. */
export const REVOLVE_PRESETS: Record<RevolveForm, RevolvePoint[]> = {
  bowl: [
    { r: 0.35, z: 0 },
    { r: 0.55, z: 0.15 },
    { r: 0.85, z: 0.5 },
    { r: 1, z: 0.85 },
    { r: 0.96, z: 1 },
  ],
  basin: [
    { r: 0.9, z: 0 },
    { r: 1, z: 0.25 },
    { r: 1, z: 1 },
  ],
  vase: [
    { r: 0.4, z: 0 },
    { r: 0.9, z: 0.25 },
    { r: 1, z: 0.45 },
    { r: 0.6, z: 0.75 },
    { r: 0.5, z: 0.9 },
    { r: 0.62, z: 1 },
  ],
  urn: [
    { r: 0.45, z: 0 },
    { r: 0.4, z: 0.08 },
    { r: 0.95, z: 0.4 },
    { r: 1, z: 0.6 },
    { r: 0.75, z: 0.9 },
    { r: 0.85, z: 1 },
  ],
  baluster: [
    { r: 1, z: 0 },
    { r: 1, z: 0.08 },
    { r: 0.45, z: 0.15 },
    { r: 0.9, z: 0.45 },
    { r: 0.5, z: 0.75 },
    { r: 0.45, z: 0.92 },
    { r: 1, z: 1 },
  ],
  cone: [
    { r: 1, z: 0 },
    { r: 0.05, z: 1 },
  ],
  dome: [
    { r: 1, z: 0 },
    { r: 0.95, z: 0.4 },
    { r: 0.75, z: 0.75 },
    { r: 0.4, z: 0.95 },
    { r: 0.03, z: 1 },
  ],
};

/** The least a radius may be: a point on the axis makes the lathe pinch. */
export const MIN_R = 0.02;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/** A profile made sound: radii inside the rim and off the axis, heights in [0, 1] in order, the
 *  first point at the bottom and the last at the top, at least two points. */
export function cleanRevolve(points: readonly RevolvePoint[]): RevolvePoint[] {
  const pts = points.map((p) => ({ r: round(clamp(p.r, MIN_R, 1)), z: round(clamp(p.z, 0, 1)) })).sort((a, b) => a.z - b.z);
  if (pts.length < 2) return pts.length ? [{ r: pts[0].r, z: 0 }, { r: pts[0].r, z: 1 }] : [{ r: 1, z: 0 }, { r: 1, z: 1 }];
  pts[0] = { ...pts[0], z: 0 };
  pts[pts.length - 1] = { ...pts[pts.length - 1], z: 1 };
  return pts;
}

/** Which preset a profile is, or null for a designer's own. */
export function revolveFormOf(points: readonly RevolvePoint[] | undefined): RevolveForm | null {
  if (!points) return null;
  for (const form of REVOLVE_FORMS) {
    const p = REVOLVE_PRESETS[form];
    if (p.length === points.length && p.every((q, i) => Math.abs(q.r - points[i].r) < 1e-6 && Math.abs(q.z - points[i].z) < 1e-6)) return form;
  }
  return null;
}

/** The profile in millimetres for a piece `radiusMm` across its half-width, `heightMm` high — what
 *  the lathe is turned from (lib/scene/types.ts Part "lathe"), bottom to top. */
export function revolveProfileMm(points: readonly RevolvePoint[], radiusMm: number, heightMm: number): { r: number; z: number }[] {
  return cleanRevolve(points).map((p) => ({ r: p.r * radiusMm, z: p.z * heightMm }));
}

/** The body's outline seen from the side — the profile and its mirror about the axis at `cx`,
 *  as a closed polygon in (x, z) millimetres: right side up, left side down. */
export function revolveSilhouette(points: readonly RevolvePoint[], cx: number, radiusMm: number, zMm: number, heightMm: number): Point[] {
  const mm = revolveProfileMm(points, radiusMm, heightMm);
  const right = mm.map((p) => ({ x: cx + p.r, y: zMm + p.z }));
  const left = [...mm].reverse().map((p) => ({ x: cx - p.r, y: zMm + p.z }));
  return [...right, ...left];
}

/** Point `i` moved to (r, z): its height kept between its neighbours' (the profile never folds back
 *  on itself), the first and last held to the bottom and the top. */
export function movedPoint(points: readonly RevolvePoint[], i: number, r: number, z: number): RevolvePoint[] {
  const pts = cleanRevolve(points);
  if (i < 0 || i >= pts.length) return pts;
  const lo = i === 0 ? 0 : pts[i - 1].z;
  const hi = i === pts.length - 1 ? 1 : pts[i + 1].z;
  const zz = i === 0 ? 0 : i === pts.length - 1 ? 1 : clamp(z, lo, hi);
  pts[i] = { r: round(clamp(r, MIN_R, 1)), z: round(zz) };
  return pts;
}

/** A point added at (r, z), in height order. */
export function addedPoint(points: readonly RevolvePoint[], r: number, z: number): RevolvePoint[] {
  return cleanRevolve([...points, { r, z: clamp(z, 0.001, 0.999) }]);
}

/** Point `i` taken out — never below two points. */
export function removedPoint(points: readonly RevolvePoint[], i: number): RevolvePoint[] {
  const pts = cleanRevolve(points);
  if (pts.length <= 2 || i < 0 || i >= pts.length) return pts;
  return cleanRevolve(pts.filter((_, k) => k !== i));
}

/** The silhouette's radius at height `z` (fractions), as a share of its widest — the plan's circle
 *  is the widest ring, whatever the designer dragged the profile to. Read by every picture whose
 *  profile is its envelope rather than a solid (a chandelier's tiers, a flower arrangement's mass,
 *  a chuppah's roof — lib/scene/items.ts PROFILE_IS_PICTURE). */
export function profileAt(profile: readonly RevolvePoint[], z: number): number {
  const pts = cleanRevolve(profile);
  const widest = Math.max(...pts.map((p) => p.r)) || 1;
  const zz = Math.max(0, Math.min(1, z));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (zz <= b.z + 1e-12) {
      const t = b.z - a.z > 1e-9 ? (zz - a.z) / (b.z - a.z) : 1;
      return (a.r + (b.r - a.r) * t) / widest;
    }
  }
  return pts[pts.length - 1].r / widest;
}

/** The TOP of the body over a point `rho` out from the axis (a share of the widest ring): the
 *  highest height at which the silhouette reaches that far, and the silhouette's run there (`dr`,
 *  `dz`, fractions, bottom to top — its outward normal in millimetres is (dz·H, −dr·R)). What an
 *  envelope is seen as from above: a flower arrangement's heads lie on it. Past the widest: null. */
export function profileTop(profile: readonly RevolvePoint[], rho: number): { z: number; dr: number; dz: number } | null {
  const pts = cleanRevolve(profile);
  const widest = Math.max(...pts.map((p) => p.r)) || 1;
  const n = pts.map((p) => ({ r: p.r / widest, z: p.z }));
  const top = n[n.length - 1];
  if (rho <= top.r + 1e-9) return { z: top.z, dr: -1, dz: 0 };
  for (let i = n.length - 1; i > 0; i--) {
    const a = n[i - 1];
    const b = n[i];
    const lo = Math.min(a.r, b.r);
    const hi = Math.max(a.r, b.r);
    if (rho < lo - 1e-9 || rho > hi + 1e-9) continue;
    const t = hi - lo > 1e-9 ? (rho - a.r) / (b.r - a.r) : 1;
    return { z: a.z + (b.z - a.z) * t, dr: b.r - a.r, dz: b.z - a.z };
  }
  return null;
}

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error("FAIL: " + what);
    console.log(`  ok   ${what}`);
  };
  for (const form of REVOLVE_FORMS) {
    const p = REVOLVE_PRESETS[form];
    assert(p[0].z === 0 && p[p.length - 1].z === 1 && p.some((q) => q.r === 1), `${form}: runs from the foot to the top and reaches the rim`);
    assert(JSON.stringify(cleanRevolve(p)) === JSON.stringify(p), `${form}: is already sound`);
    assert(revolveFormOf(p) === form, `${form}: is recognised`);
  }
  assert(revolveFormOf([{ r: 0.5, z: 0 }, { r: 1, z: 1 }]) === null && revolveFormOf(undefined) === null, "a profile of the designer's own is no preset");

  const bowl = revolveProfileMm(REVOLVE_PRESETS.bowl, 800, 300);
  assert(Math.max(...bowl.map((p) => p.r)) === 800 && bowl[bowl.length - 1].z === 300 && bowl[0].z === 0, "a ⌀1.6 m bowl 30 cm high is turned to those millimetres");
  const sil = revolveSilhouette(REVOLVE_PRESETS.cone, 1000, 500, 200, 400);
  assert(sil.length === 4 && sil[0].x === 1500 && sil[0].y === 200 && sil[3].x === 500 && sil[3].y === 200 && sil[1].y === 600, "a cone's silhouette: its rim at the foot, its tip at the top, about the axis");

  const messy = cleanRevolve([{ r: 1.4, z: 0.5 }, { r: -1, z: 0.2 }, { r: 0.5, z: 2 }]);
  assert(messy.length === 3 && messy[0].z === 0 && messy[2].z === 1 && messy[0].r === MIN_R && messy[1].r === 1, "a messy profile is clamped, ordered and pinned to the foot and the top");
  assert(cleanRevolve([]).length === 2 && cleanRevolve([{ r: 0.5, z: 0.3 }]).length === 2, "fewer than two points become a cylinder");

  const moved = movedPoint(REVOLVE_PRESETS.vase, 2, 0.7, 0.9);
  assert(moved[2].r === 0.7 && moved[2].z === 0.75, "a point moved past its neighbour stops at it");
  assert(movedPoint(REVOLVE_PRESETS.vase, 0, 0.3, 0.5)[0].z === 0, "the foot stays at the foot");
  const added = addedPoint(REVOLVE_PRESETS.cone, 0.6, 0.5);
  assert(added.length === 3 && added[1].r === 0.6 && added[1].z === 0.5, "a point is added in height order");
  assert(removedPoint(added, 1).length === 2 && removedPoint(REVOLVE_PRESETS.cone, 0).length === 2, "a point is removed, never below two");
  // An envelope read by its picture: the radius as a share of the widest, and the top over a point.
  assert(Math.abs(profileAt([{ r: 0.5, z: 0 }, { r: 0.5, z: 1 }], 0.4) - 1) < 1e-9 && Math.abs(profileAt(REVOLVE_PRESETS.cone, 1) - 0.05) < 1e-9, "a silhouette is read as a share of its widest ring");
  const ball = [{ r: 0.1, z: 0 }, { r: 1, z: 0.5 }, { r: 0.1, z: 1 }];
  const mid = profileTop(ball, 0.55)!;
  assert(Math.abs(mid.z - 0.75) < 1e-9 && mid.dr < 0 && mid.dz > 0, "a ball's top over half its radius is on its upper half, sloping in as it rises");
  assert(profileTop(ball, 0.05)!.z === 1 && profileTop(ball, 1.2) === null, "over the axis the top is the top; past the widest ring there is none");
  const tower = [{ r: 0.8, z: 0 }, { r: 1, z: 0.9 }, { r: 0.6, z: 1 }];
  assert(profileTop(tower, 0.5)!.z === 1 && Math.abs(profileTop(tower, 0.8)!.z - 0.95) < 1e-9, "a flat top is level; the shoulder slopes off it");
  console.log("revolve self-check passed");
}
