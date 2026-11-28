// What `npm run check:check-files` enforces (EVE-54). Pure — scripts/check-files.check.ts runs it.
//
// A self-check lives in a sibling `*.check.ts(x)` that only its `check:*` script runs, so it never
// reaches a bundle. This is the guard that keeps it so — the bundle scan in CI's build job cannot see
// much (a minified check keeps none of its comments and few of its strings):
//   · no module the app builds from (lib/, app/, components/, the root's .ts files) has an inline
//     `if (isMain(import.meta.url))` block — a branch from before the move converts with
//     `npx tsx scripts/split-self-checks.ts` — nor Node 24's `if (import.meta.main)`;
//   · none of them imports, re-exports, import()s or require()s a `*.check` file — read off the syntax
//     tree, so a commented-out import or a string that merely looks like one never counts;
//   · every `*.check.ts(x)` (the root's too) is run by some `check:*` script, and every `check:*`
//     script runs at least one `*.check` file and only ones that exist — a check nobody runs, a script
//     that runs nothing, or a script left running a module whose check moved out, passes while
//     asserting nothing.
import ts from "typescript";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { findBlockModules } from "./split-self-checks-core";

const IS_CHECK = /\.check\.tsx?$/;
const NAMES_A_CHECK = /\.check(\.(tsx?|js))?$/;
const BUNDLED_DIRS = ["lib", "app", "components"];
/** A top-level `if (import.meta.main)` starts its line; one quoted in a doc comment does not. */
const NODE_MAIN_GUARD = /^if \(import\.meta\.main\)/m;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Every module a file imports, re-exports, `import()`s or `require()`s, off its syntax tree. */
function specifiersOf(file: string): string[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      out.push(n.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(n) &&
      n.arguments.length > 0 &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))
    ) {
      out.push(n.arguments[0].text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** What is wrong under `root`, one line per finding, each starting with the file it is about. */
export function checkFiles(root: string, scripts: Record<string, string>): string[] {
  const rel = (p: string) => relative(root, p).replace(/\\/g, "/");
  const dirs = BUNDLED_DIRS.filter((d) => existsSync(join(root, d)));
  const rootFiles = readdirSync(root)
    .filter((n) => /\.tsx?$/.test(n) && !n.endsWith(".d.ts") && statSync(join(root, n)).isFile())
    .map((n) => join(root, n));
  const modules = [...dirs.flatMap((d) => walk(join(root, d))), ...rootFiles].filter((f) => !IS_CHECK.test(f));
  const problems: string[] = [];

  for (const f of findBlockModules(modules)) {
    problems.push(`${rel(f)}: an inline isMain self-check — run \`npx tsx scripts/split-self-checks.ts\``);
  }
  // Node 24's own spelling of the same guard (PR #3 review). The codemod does not convert it: move the
  // block into a sibling *.check.ts by hand.
  for (const f of modules) {
    if (NODE_MAIN_GUARD.test(readFileSync(f, "utf8"))) {
      problems.push(`${rel(f)}: an inline \`if (import.meta.main)\` self-check — move it into a sibling *.check.ts`);
    }
  }
  for (const f of modules) {
    for (const s of specifiersOf(f)) if (NAMES_A_CHECK.test(s)) problems.push(`${rel(f)}: imports ${s} — that check would ship with it`);
  }

  const run = new Set<string>();
  for (const [name, command] of Object.entries(scripts)) {
    if (!name.startsWith("check:")) continue;
    const files = command.split(/\s+/).filter((t) => /\.(tsx?|m?js)$/.test(t));
    if (files.length === 0) problems.push(`package.json: ${name} runs no *.check file — it passes while asserting nothing`);
    for (const file of files) {
      run.add(file);
      if (!IS_CHECK.test(file)) problems.push(`package.json: ${name} runs ${file}, which is not a *.check file`);
      else if (!existsSync(join(root, file))) problems.push(`package.json: ${name} runs ${file}, which does not exist`);
    }
  }
  const checkDirs = [...dirs, ...(existsSync(join(root, "scripts")) ? ["scripts"] : [])];
  // The root's own *.check files too (PR #3 review) — the walk covers the folders only.
  const checks = [...checkDirs.flatMap((d) => walk(join(root, d))), ...rootFiles].filter((f) => IS_CHECK.test(f));
  for (const f of checks) {
    if (!run.has(rel(f))) problems.push(`${rel(f)}: no check:* script runs it`);
  }
  return problems;
}
