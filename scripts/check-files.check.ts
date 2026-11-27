// npm run check:check-files — self-checks stay out of the app's modules, and every check runs (EVE-54).
//
// A self-check lives in a sibling `*.check.ts(x)` that only its `check:*` script runs. ./check-files.ts
// says what is wrong; this runs it on fixtures (each rule must catch what it is written for) and then
// on the repo, which must have nothing to report.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkFiles } from "./check-files";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

// ── fixtures ──
const dir = mkdtempSync(join(tmpdir(), "check-files-"));
const put = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
try {
  put("lib/a.ts", `import { x } from "./b.check";\nexport const a = x;\n`);
  put("lib/c.ts", `import "./d.check";\n`);
  put("lib/e.ts", `export * from "./f.check.js";\n`);
  put("lib/g.ts", `const m = require("./h.check");\nexport default m;\n`);
  put("lib/i.ts", `export const load = () => import("./j.check.ts");\n`);
  put("lib/k.ts", `// import { x } from "./k.check";\n/* import "./k2.check"; */\nexport const k = "./k.check";\n`);
  put("components/row.tsx", `import { y } from "../lib/r.check";\nexport const Row = () => <i>{y}</i>;\n`);
  put("proxy.ts", `import { z } from "./lib/z.check";\nexport const p = z;\n`);
  put("lib/m.ts", `export const m = 1;\nif (isMain(import.meta.url)) {\n  console.log(m);\n}\n`);
  put("lib/n.check.ts", `console.log("nobody runs me");\n`);
  put("lib/o.check.ts", `console.log("o");\n`);
  put("lib/p.ts", `export const p = 1;\n`);
  const scripts = {
    "check:o": "tsx --tsconfig tsconfig.json lib/o.check.ts",
    "check:p": "tsx lib/p.ts",
    "check:q": "tsx lib/o.check.ts && tsx lib/missing.check.ts",
    build: "next build",
  };
  const problems = checkFiles(dir, scripts);
  const about = (file: string) => problems.filter((p) => p.startsWith(`${file}:`));

  assert(about("lib/a.ts").length === 1, "a named import of a *.check file is caught");
  assert(about("lib/c.ts").length === 1, "…a bare `import \"./x.check\"`");
  assert(about("lib/e.ts").length === 1, "…an `export * from \"./x.check.js\"`");
  assert(about("lib/g.ts").length === 1, "…a require()");
  assert(about("lib/i.ts").length === 1, "…a dynamic import()");
  assert(about("components/row.tsx").length === 1, "…in a .tsx component");
  assert(about("proxy.ts").length === 1, "…in a file at the root (proxy.ts)");
  assert(about("lib/k.ts").length === 0, "an import in a comment, or a string that merely looks like one, is not");
  assert(about("lib/m.ts").some((p) => p.includes("inline")), "an inline isMain block is caught");
  assert(about("lib/n.check.ts").some((p) => p.includes("no check:* script")), "a *.check file no script runs is caught");
  assert(about("lib/o.check.ts").length === 0, "…one a script runs (flags before the path) is not");
  assert(problems.some((p) => p.startsWith("package.json:") && p.includes("check:p") && p.includes("lib/p.ts")), "a check:* script running a file that is not a *.check is caught");
  assert(problems.some((p) => p.includes("check:q") && p.includes("lib/missing.check.ts")), "…and one running a file that does not exist");
  assert(!problems.some((p) => p.includes("build")), "scripts that are not check:* are not judged");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// ── the repo ──
const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
const found = checkFiles(root, pkg.scripts);
if (found.length) {
  for (const p of found) console.error(`FAIL: ${p}`);
  process.exit(1);
}
console.log("  ok   the repo: no inline self-check, no module imports a *.check file, every check runs and every check:* runs a check");
console.log("check:check-files passed");
