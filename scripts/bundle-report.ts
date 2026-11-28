// npm run bundle:report [-- --fail-on-checks] [-- --json <file>] — what the browser downloads, read
// off the last `next build` (EVE-54). CI's build job runs it with --fail-on-checks: the sizes land in
// the job's log, and the build fails on the old isMain guard or a `check:<name> —` message in a chunk
// — a backstop; the guard at the source is `check:check-files`.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { report } from "./bundle-size";

const dir = join(process.cwd(), ".next", "static", "chunks");
if (!existsSync(dir)) {
  console.error("No .next/static/chunks — run `npm run build` first.");
  process.exit(1);
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const r = report(dir);

console.log(`client chunks: ${r.chunks} · ${mb(r.raw)} raw · ${mb(r.gzip)} gzip`);
console.log("largest:");
for (const c of r.largest) {
  console.log(`  ${kb(c.raw).padStart(8)} raw  ${kb(c.gzip).padStart(7)} gzip  ${c.file}${c.checks ? "  ← self-check code" : ""}`);
}
console.log(`chunks carrying self-check code: ${r.withChecks.length}`);

const jsonAt = process.argv.indexOf("--json");
if (jsonAt > 0 && process.argv[jsonAt + 1]) writeFileSync(process.argv[jsonAt + 1], JSON.stringify(r, null, 2));

if (process.argv.includes("--fail-on-checks") && r.withChecks.length > 0) {
  console.error(`\nFAIL: ${r.withChecks.length} client chunk(s) carry self-check code: ${r.withChecks.slice(0, 5).join(", ")}`);
  console.error("A module the browser loads has an inline self-check again — move it to a sibling *.check.ts:");
  console.error("  npx tsx scripts/split-self-checks.ts");
  process.exit(1);
}
