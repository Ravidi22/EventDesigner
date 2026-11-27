// Placing a photograph of a floor plan under the wall graph, at true scale, so walls can be traced
// over it (F-3.5) and the traced lengths are the building's real ones (F-3.4).
//
// THE PLANE IS MILLIMETRES, AND CALIBRATION SCALES THE IMAGE — not `mmPerUnit`.
//
// `mmPerUnit` survives from the cancelled PDF/iPlan import (ADR-3), where a drawing arrived in PDF
// points and something had to convert them. Nothing enters the plane in foreign units any more, so
// it is 1 at every call site and stays that way. Putting an image's scale there instead would mean:
//
//   - a 3-metre drape is 3 metres in every hall, yet catalog widths are millimetres, so each
//     venue's factor would have to divide them — a product's size would depend on the building;
//   - two sources of truth for scale (the factor AND this image's widthMm), which drift, and whose
//     first symptom is a wrong quantity on a quote rather than anything visible on screen;
//   - a multiplier through measure.ts / quote.ts / aggregate.ts to compensate for a picture being
//     the wrong size.
//
// So the picture is resized until the distance the designer identified reads true, and every
// millimetre downstream keeps meaning a millimetre.
//
// GEOMETRY CONVENTION, because two of these functions are wrong if it is misread: `x`/`y` is the
// TOP-LEFT of the *unrotated* rectangle, `widthMm`/`heightMm` are its unrotated extents, and
// `rotationDeg` turns it about its own CENTRE. That matches how the renderer emits
// `rotate(deg, cx, cy)`, and it is why scaling has to move `x`/`y` rather than leave them pinned.
import type { Point } from "@/lib/studio/hall";
import type { PlanUnderlay } from "./types";

/** Dimmed by default: the point is to see the traced wall ON TOP of the photo, and a scan at full
 *  strength competes with the very lines being drawn over it. */
export const DEFAULT_OPACITY = 0.5;

/** A traced plan is a building, and buildings are neither 4mm nor 4km across. The bounds exist so a
 *  mistyped calibration ("12" meaning metres, entered as millimetres) fails visibly at the moment
 *  it is entered rather than by scattering the image somewhere off the plane. */
export const MIN_SPAN_MM = 100; // 10cm
export const MAX_SPAN_MM = 2_000_000; // 2km

/** Below this, two calibration points are the same click and the scale is a division by ~zero. In
 *  screen terms it is a few pixels at any sane zoom. */
export const MIN_CALIBRATION_SPAN_MM = 1;

export const clampOpacity = (o: number): number =>
  !Number.isFinite(o) ? DEFAULT_OPACITY : Math.min(1, Math.max(0.05, o));

/** The rectangle's centre, in world mm. Rotation happens about this point. */
export function underlayCentre(u: PlanUnderlay): Point {
  return { x: u.x + u.widthMm / 2, y: u.y + u.heightMm / 2 };
}

/** The four corners as they actually sit on the plane, rotation included.
 *
 *  Callers use this for framing and bounds; a rotated image's bounding box is NOT its width and
 *  height, and treating it as such crops the image out of "fit to view" the moment it is turned. */
export function underlayCorners(u: PlanUnderlay): Point[] {
  const c = underlayCentre(u);
  const rad = (u.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = u.widthMm / 2;
  const hh = u.heightMm / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => ({ x: c.x + p.x * cos - p.y * sin, y: c.y + p.x * sin + p.y * cos }));
}

/**
 * Where to put an image nobody has calibrated yet.
 *
 * It lands at a readable size with its own aspect ratio intact — never square, because a distorted
 * first impression invites the designer to "fix" it by stretching, and a non-uniformly stretched
 * underlay cannot be made true by any later calibration.
 *
 * `naturalWidth`/`naturalHeight` come from the loaded image. A browser that reports 0 (a decode
 * that failed, an SVG with no intrinsic size — which the upload allowlist refuses anyway) falls
 * back to a square rather than dividing by zero.
 */
export function placeUnderlay(
  url: string,
  fileName: string,
  naturalWidth: number,
  naturalHeight: number,
  targetSpanMm = 20_000,
): PlanUnderlay {
  const ratio =
    Number.isFinite(naturalWidth) && Number.isFinite(naturalHeight) && naturalWidth > 0 && naturalHeight > 0
      ? naturalWidth / naturalHeight
      : 1;
  const widthMm = ratio >= 1 ? targetSpanMm : targetSpanMm * ratio;
  const heightMm = ratio >= 1 ? targetSpanMm / ratio : targetSpanMm;
  return {
    url,
    fileName,
    // Centred on the origin, which is where an empty plane's view already sits.
    x: -widthMm / 2,
    y: -heightMm / 2,
    widthMm,
    heightMm,
    rotationDeg: 0,
    opacity: DEFAULT_OPACITY,
  };
}

/**
 * Scale uniformly about a fixed point.
 *
 * UNIFORM is the load-bearing word: one factor for both axes. A plan stretched more in x than in y
 * has no scale at all — every wall traced off it would be wrong by an amount that depends on its
 * direction, which is the one error that cannot be spotted by looking.
 *
 * `anchor` stays exactly where it is. Rotation is untouched: scaling about a point commutes with
 * rotation about the centre, so a turned image stays turned.
 */
export function scaleUnderlayAbout(u: PlanUnderlay, factor: number, anchor: Point): PlanUnderlay {
  const c = underlayCentre(u);
  const widthMm = u.widthMm * factor;
  const heightMm = u.heightMm * factor;
  // The centre moves along the ray from the anchor, by the same factor as everything else.
  const cx = anchor.x + (c.x - anchor.x) * factor;
  const cy = anchor.y + (c.y - anchor.y) * factor;
  return { ...u, x: cx - widthMm / 2, y: cy - heightMm / 2, widthMm, heightMm };
}

export type CalibrationResult =
  | { ok: true; underlay: PlanUnderlay; factor: number }
  | { ok: false; reason: string };

/**
 * F-3.4. Two points the designer clicked on the image, and what the distance between them really
 * is, in millimetres. The image is resized until those two points are that far apart.
 *
 * `a` is the anchor, deliberately: it is the point they clicked FIRST, and leaving it fixed means
 * the image grows away from where they were looking instead of sliding out from under the pointer.
 *
 * Every failure is a sentence, not a throw — this runs on a value someone is typing, and a typo is
 * an ordinary thing for it to receive.
 */
export function calibrateUnderlay(
  u: PlanUnderlay,
  a: Point,
  b: Point,
  realMm: number,
): CalibrationResult {
  const measured = Math.hypot(b.x - a.x, b.y - a.y);
  if (!Number.isFinite(measured) || measured < MIN_CALIBRATION_SPAN_MM) {
    return { ok: false, reason: "סמנו קטע ארוך יותר על התוכנית" };
  }
  if (!Number.isFinite(realMm) || realMm <= 0) {
    return { ok: false, reason: "האורך חייב להיות מספר גדול מאפס" };
  }

  const factor = realMm / measured;
  const widthMm = u.widthMm * factor;
  const heightMm = u.heightMm * factor;
  const span = Math.max(widthMm, heightMm);
  // Caught here rather than after the fact: the image is still on screen and the number is still in
  // the field, so the message can be about what was typed instead of about a plan that vanished.
  if (span < MIN_SPAN_MM || span > MAX_SPAN_MM || !Number.isFinite(span)) {
    return { ok: false, reason: "הכיול נותן תוכנית בגודל לא סביר — בדקו את האורך שהוזן (במ״מ)" };
  }

  return { ok: true, underlay: scaleUnderlayAbout(u, factor, a), factor };
}

/** What one span on the image currently measures, for the live readout while marking. */
export const spanMm = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
