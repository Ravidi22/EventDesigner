// What the browser downloads, read off a `next build`'s client chunks (EVE-54). Pure: no argv, no
// process.exit — scripts/bundle-report.ts prints it, scripts/bundle-size.check.ts checks it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Signs that a self-check made it into a chunk. A self-check lives in a sibling `*.check.ts` that
 * nothing in the app imports; one that leaks back into a module the browser loads shows up as its
 * old guard, `isMain`, or as a `check:<name> — …` message. Kept narrow: app text says neither.
 */
export const CHECK_FINGERPRINTS: RegExp[] = [/\bisMain\b/, /check:[a-z][a-z0-9-]+ — /];

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
