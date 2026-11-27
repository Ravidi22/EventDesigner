// npx tsx scripts/split-self-checks.ts [--dry] [file…] — move every inline
// `if (isMain(import.meta.url)) { … }` self-check into a sibling `<module>.check.ts` and point its
// package.json script there (EVE-54). How it decides is in ./split-self-checks-core.ts.
//
// For a branch that still has inline blocks after merging master: run this, then `npm run checks`.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { findBlockModules, retargetScripts, splitAll } from "./split-self-checks-core";

const root = process.cwd();
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const named = args.filter((a) => !a.startsWith("--")).map((a) => join(root, a));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (abs: string) => relative(root, abs).replace(/\\/g, "/");
const pkgPath = join(root, "package.json");
const pkgText = readFileSync(pkgPath, "utf8");
const scripts = (JSON.parse(pkgText) as { scripts: Record<string, string> }).scripts;

const pool = named.length ? named : ["lib", "app", "components"].filter((d) => existsSync(join(root, d))).flatMap((d) => walk(join(root, d)));
const files = findBlockModules(pool);
if (!files.length) {
  console.log("No inline self-checks left.");
  process.exit(0);
}

const results = splitAll(files, scripts, rel);
const done = results.filter((r) => r.problems.length === 0);
const refused = results.filter((r) => r.problems.length > 0);

for (const r of done) {
  const extra = [r.exported.length ? `exports ${r.exported.join(", ")}` : "", ...r.notes].filter(Boolean).join(" · ");
  console.log(`moved   ${rel(r.file)}${extra ? `  (${extra})` : ""}`);
  if (!dry) {
    writeFileSync(r.file, r.moduleText!);
    writeFileSync(r.checkFile, r.checkText!);
  }
}
for (const r of refused) console.log(`REFUSED ${rel(r.file)}: ${r.problems.join("; ")}`);

if (!dry && done.length) writeFileSync(pkgPath, retargetScripts(pkgText, done.map((r) => rel(r.file))));
console.log(`\n${done.length} moved, ${refused.length} refused${dry ? " (dry run — nothing written)" : ""}.`);
if (refused.length) process.exit(1);
