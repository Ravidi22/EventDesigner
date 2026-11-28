// npm run check:underlay — the self-check of ./underlay.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { calibrateUnderlay, clampOpacity, DEFAULT_OPACITY, placeUnderlay, scaleUnderlayAbout, spanMm, underlayCorners } from "./underlay";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const close = (x: number, y: number, tol = 1e-6) => Math.abs(x - y) < tol;

// Placement keeps the image's proportions — a 2:1 photo is not allowed to arrive square.
const wide = placeUnderlay("u", "wide.png", 2000, 1000);
assert(close(wide.widthMm / wide.heightMm, 2), "a 2:1 image is placed 2:1");
const tall = placeUnderlay("u", "tall.png", 1000, 2000);
assert(close(tall.heightMm / tall.widthMm, 2), "a 1:2 image is placed 1:2");
assert(close(wide.x + wide.widthMm / 2, 0), "a fresh underlay is centred on the origin");
const broken = placeUnderlay("u", "broken.png", 0, 0);
assert(close(broken.widthMm, broken.heightMm), "an image with no intrinsic size falls back square");
assert(Number.isFinite(broken.widthMm), "…and does not divide by zero");

// THE case this module exists for: mark a wall known to be 12m, and it becomes 12m.
const u = placeUnderlay("u", "plan.png", 1000, 1000, 10_000);
const a = { x: 0, y: 0 };
const b = { x: 1000, y: 0 }; // 1000mm as currently placed
const res = calibrateUnderlay(u, a, b, 12_000);
assert(res.ok, "a sane calibration succeeds");
if (res.ok) {
  assert(close(res.factor, 12), "12m over a 1m span is a factor of 12");
  // Re-measuring the same two points on the scaled image must now give the real length.
  const scaledB = { x: a.x + (b.x - a.x) * res.factor, y: a.y + (b.y - a.y) * res.factor };
  assert(close(spanMm(a, scaledB), 12_000), "the marked span now measures what was typed");
  assert(close(res.underlay.widthMm, u.widthMm * 12), "the image scales by the same factor");
  assert(
    close(res.underlay.widthMm / res.underlay.heightMm, u.widthMm / u.heightMm),
    "scaling is UNIFORM — the aspect ratio is untouched",
  );
}

// The anchor does not move. Without this the image slides out from under the pointer.
const anchored = scaleUnderlayAbout(u, 3, { x: 500, y: 500 });
const back = scaleUnderlayAbout(anchored, 1 / 3, { x: 500, y: 500 });
assert(close(back.x, u.x) && close(back.y, u.y), "scaling up then down returns to where it began");
assert(close(back.widthMm, u.widthMm), "…at the size it began");

// Rotation survives scaling, and a rotated rectangle reports rotated corners.
const turned = { ...u, rotationDeg: 90 };
assert(scaleUnderlayAbout(turned, 2, a).rotationDeg === 90, "scaling leaves rotation alone");
const square = placeUnderlay("u", "s.png", 1000, 1000, 1000); // 1000mm, centred on origin
const corners = underlayCorners({ ...square, rotationDeg: 90 });
assert(
  corners.every((p) => close(Math.abs(p.x), 500) && close(Math.abs(p.y), 500)),
  "a square turned 90° still has its corners 500mm from the centre",
);

// Every degenerate input is a sentence, not a crash and not a silent absurdity.
assert(!calibrateUnderlay(u, a, a, 12_000).ok, "a zero-length span is refused");
assert(!calibrateUnderlay(u, a, b, 0).ok, "a zero real length is refused");
assert(!calibrateUnderlay(u, a, b, -5).ok, "a negative real length is refused");
assert(!calibrateUnderlay(u, a, b, Number.NaN).ok, "NaN is refused");
assert(!calibrateUnderlay(u, a, b, 1e12).ok, "an absurdly large plan is refused");
assert(!calibrateUnderlay(u, a, b, 0.001).ok, "an absurdly small plan is refused");

// Opacity is clamped rather than trusted: 0 would make the underlay invisible while still
// present, which reads as "the upload failed" and invites a second upload of the same file.
assert(clampOpacity(0) >= 0.05, "opacity never reaches fully transparent");
assert(clampOpacity(5) === 1, "opacity never exceeds 1");
assert(clampOpacity(Number.NaN) === DEFAULT_OPACITY, "a non-number falls back to the default");

console.log("underlay self-check passed");
