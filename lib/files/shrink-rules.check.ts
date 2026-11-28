// npm run check:shrink — how big an upload is drawn, and in what format, before it leaves the browser (EVE-25).
import { FILE_KINDS } from "./keys";
import { JPEG_QUALITY, LONG_SIDE, outputType, renamed, targetSize, uploadOriginal } from "./shrink-rules";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Sizes: the long side is capped by kind, never enlarged.
assert(same(targetSize(4032, 3024, "gallery"), { width: 2400, height: 1800 }), "a landscape phone photo → 2400 wide");
assert(same(targetSize(3024, 4032, "product"), { width: 1800, height: 2400 }), "a portrait one → 2400 tall");
assert(same(targetSize(6000, 4000, "underlay"), { width: 4000, height: 2667 }), "a hall-plan scan keeps 4000 for tracing");
assert(same(targetSize(3000, 3000, "logo"), { width: 1200, height: 1200 }), "a logo → 1200");
assert(same(targetSize(800, 600, "gallery"), { width: 800, height: 600 }), "a small picture is never enlarged");
assert(targetSize(5000, 1, "logo").height === 1, "a sliver keeps at least one pixel");
assert(
  FILE_KINDS.every((k) => Number.isInteger(LONG_SIDE[k]) && LONG_SIDE[k] > 0),
  "every upload kind has a long side",
);
assert(
  LONG_SIDE.gallery === 2400 && LONG_SIDE.product === 2400 && LONG_SIDE.dish === 2400 && LONG_SIDE.sketch === 2400,
  "photographs: 2400",
);
assert(LONG_SIDE.underlay === 4000 && LONG_SIDE.logo === 1200 && LONG_SIDE.signature === 1200, "plans 4000, logos and signatures 1200");
assert(JPEG_QUALITY === 0.85, "JPEG quality 0.85");

// Formats: PNG keeps transparency; anything else that is a photograph becomes a JPEG.
assert(outputType("image/jpeg", false) === "image/jpeg", "JPEG stays JPEG");
assert(outputType("image/png", false) === "image/png", "PNG stays PNG (a scan or a logo)");
assert(outputType("image/png", true) === "image/png", "a transparent PNG stays PNG");
assert(outputType("image/webp", true) === "image/png", "a transparent WebP → PNG, never a JPEG on black");
assert(outputType("image/webp", false) === "image/jpeg", "an opaque WebP → JPEG");
assert(outputType("image/avif", false) === "image/jpeg", "an opaque AVIF → JPEG");

// The name follows the format, the rest of it is kept.
assert(renamed("IMG_1.HEIC.webp", "image/jpeg") === "IMG_1.HEIC.jpg", "the last extension is replaced");
assert(renamed("logo", "image/png") === "logo.png", "a name with no extension gets one");
assert(renamed("photo.JPG", "image/jpeg") === "photo.jpg", "an upper-case extension is replaced too");

// What goes up (PR #2 review): never something bigger than what was picked, unless only the redraw
// drops the metadata. A canvas PNG encoder compresses less than the tool that made an optimised PNG, so
// a hall plan that uploaded before EVE-25 must not grow past MAX_BYTES and be refused after it.
const MB = 1024 * 1024;
assert(uploadOriginal("image/png", 20 * MB, 28 * MB), "a PNG that came out bigger goes up as picked");
assert(!uploadOriginal("image/png", 20 * MB, 6 * MB), "a PNG that came out smaller goes up redrawn");
assert(uploadOriginal("image/webp", 15 * MB, 30 * MB), "a transparent WebP that became a bigger PNG goes up as picked");
assert(!uploadOriginal("image/jpeg", 2 * MB, 3 * MB), "a JPEG goes up redrawn even when bigger — the redraw is what drops its EXIF");
assert(!uploadOriginal("image/png", 5 * MB, 5 * MB), "the same size: redrawn");

console.log("shrink self-check passed");
