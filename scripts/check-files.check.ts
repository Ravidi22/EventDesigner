// npm run check:check-files — self-checks stay out of the app's modules (EVE-54).
//
// A self-check lives in a sibling `*.check.ts` that only its `check:*` script runs. This fails when a
// module in lib/, app/ or components/ has an inline `if (isMain(import.meta.url))` block again (a
// branch from before the move — convert it with `npx tsx scripts/split-self-checks.ts`), or imports
// a `*.check` file, which would ship that check to whoever loads the module. CI's build job catches
// the same thing in the bundle (`npm run bundle:report -- --fail-on-checks`); this says which file.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { findBlockModules } from "./split-self-checks-core";

const root = process.cwd();
const IMPORTS_A_CHECK = /(?:from\s+|import\s*\(\s*)["'][^"']*\.check(?:\.tsx?)?["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.(check|d)\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const modules = ["lib", "app", "components"].filter((d) => existsSync(join(root, d))).flatMap((d) => walk(join(root, d)));
const rel = (p: string) => relative(root, p).replace(/\\/g, "/");
const problems = [
  ...findBlockModules(modules).map((f) => `${rel(f)}: an inline isMain self-check — run \`npx tsx scripts/split-self-checks.ts\``),
  ...modules.filter((f) => IMPORTS_A_CHECK.test(readFileSync(f, "utf8"))).map((f) => `${rel(f)}: imports a *.check file — a check would ship with it`),
];

if (problems.length) {
  for (const p of problems) console.error(`FAIL: ${p}`);
  process.exit(1);
}
console.log(`  ok   ${modules.length} modules: no inline self-check, none imports a *.check file`);
console.log("check:check-files passed");
