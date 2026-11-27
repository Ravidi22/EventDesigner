// npm run check:bundle-size — the bundle report's arithmetic and its self-check fingerprint (EVE-54).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carriesChecks, report } from "./bundle-size";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

// What a module with an inline self-check looked like in the 2026-11-27 build.
const leaked = 'if((0,a.isMain)({get url(){return e.F("lib/studio/align.ts")}}))';
assert(carriesChecks(leaked), "a minified isMain guard is caught");
assert(carriesChecks('console.log("check:scene-card — all passed")'), "a check:<name> — message is caught");
assert(!carriesChecks('const label = "בדיקות"; t("check the stage")'), "ordinary app text is not");
assert(!carriesChecks("mainIsOpen&&isMainland"), "…nor a word that merely contains isMain");

const dir = mkdtempSync(join(tmpdir(), "bundle-size-"));
try {
  mkdirSync(join(dir, "app"));
  writeFileSync(join(dir, "a.js"), "x".repeat(3000));
  writeFileSync(join(dir, "app", "b.js"), leaked);
  writeFileSync(join(dir, "c.css"), "y".repeat(9000));
  const r = report(dir, 1);
  assert(r.chunks === 2, "only .js files are chunks, in sub-folders too");
  assert(r.raw === 3000 + leaked.length, "raw is the sum of the files' bytes");
  assert(r.gzip > 0 && r.gzip < r.raw, "gzip is measured, and 3000 repeated bytes compress");
  assert(r.withChecks.length === 1 && r.withChecks[0] === "app/b.js", "the leaking chunk is named, with forward slashes");
  assert(r.largest.length === 1 && r.largest[0].file === "a.js", "largest is sorted by raw size and cut to `top`");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("check:bundle-size passed");
