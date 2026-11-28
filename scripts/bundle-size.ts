// What the browser downloads, read off a `next build`'s client chunks (EVE-54). Pure: no argv, no
// process.exit — scripts/bundle-report.ts prints it, scripts/bundle-size.check.ts checks it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Signs that a self-check made it into a chunk: the old inline guard (`isMain`), a `check:<name> — …`
 * message, a check's `FAIL: ` assertion, or its closing `… self-check passed` line. Since
 * lib/self-check.ts is gone no chunk can say isMain, and few checks print a check:<name> line; the last
 * two are printed by most checks and by no app code (PR #3 review). Kept narrow: app text says none of
 * them. This is a BACKSTOP, not the guard — a minified check keeps no comments and few distinctive
 * strings — `check:check-files` (scripts/check-files.ts) is what stops a check being imported, at the source.
 */
export const CHECK_FINGERPRINTS: RegExp[] = [/\bisMain\b/, /check:[a-z][a-z0-9-]+ — /, /[`"']FAIL: /, /self-check passed/];

export const carriesChecks = (source: string) => CHECK_FINGERPRINTS.some((re) => re.test(source));

export interface ChunkSize {
  file: string;
  raw: number;
  gzip: number;
  checks: boolean;
}

export interface BundleReport {
  chunks: number;
  raw: number;
  gzip: number;
  /** Chunks carrying self-check code, relative to the chunk folder, forward slashes. */
  withChecks: string[];
  /** The `top` largest chunks by raw size. */
  largest: ChunkSize[];
}

function jsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) jsFiles(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

export function report(chunkDir: string, top = 10): BundleReport {
  const sizes: ChunkSize[] = jsFiles(chunkDir).map((p) => {
    const source = readFileSync(p);
    return {
      file: relative(chunkDir, p).replace(/\\/g, "/"),
      raw: source.length,
      gzip: gzipSync(source, { level: 9 }).length,
      checks: carriesChecks(source.toString("utf8")),
    };
  });
  sizes.sort((a, b) => b.raw - a.raw);
  return {
    chunks: sizes.length,
    raw: sizes.reduce((s, c) => s + c.raw, 0),
    gzip: sizes.reduce((s, c) => s + c.gzip, 0),
    withChecks: sizes.filter((c) => c.checks).map((c) => c.file),
    largest: sizes.slice(0, top),
  };
}
