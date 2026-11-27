// npm run check:split-self-checks — the codemod that moves a module's inline self-check into a sibling
// *.check.ts (EVE-54), run on fixture modules in a temp folder: what leaves the module, what the
// sibling imports, what becomes exported, and that both files still compile and the check still runs.
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { findBlockModules, retargetScripts, splitAll } from "./split-self-checks-core";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

const dir = mkdtempSync(join(tmpdir(), "split-self-checks-"));
const at = (name: string) => join(dir, name);

const GEO = `// Geometry the browser also loads.
import { helper } from "./dep";
import type { Shape } from "./dep";
import { readFileSync } from "node:fs";
import { isMain } from "./self-check";

export interface Box {
  w: number;
  h: number;
}
const SCALE = 2;
function area(b: Box): number {
  return b.w * b.h * SCALE;
}
export function grow(b: Box): Box {
  return { w: helper(b.w), h: b.h };
}

// The check: area and growth.
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, m: string) => {
    if (!ok) throw new Error(m);
    console.log("ok", m);
  };
  const b: Box = { w: 2, h: 3 };
  const s: Shape = "circle";
  const w = 4;
  assert(area(b) === 12, "area");
  assert(grow({ w, h: 1 }).w === 5, "grow");
  const text = \`line one
  line two\`;
  assert(text.includes("\\n  line two"), "template kept");
  assert(typeof readFileSync === "function" && s === "circle", "imports");
}

export const AFTER = 1;
`;

try {
  writeFileSync(at("dep.ts"), `export const helper = (n: number) => n + 1;\nexport type Shape = "circle" | "square";\n`);
  writeFileSync(at("self-check.ts"), `export function isMain(url: string): boolean {\n  return url.length < 0;\n}\n`);
  writeFileSync(at("geo.ts"), GEO);
  writeFileSync(
    at("mut.ts"),
    `import { isMain } from "./self-check";\nexport let counter = 0;\nlet hidden = 0;\nexport const bump = () => ++hidden;\nif (isMain(import.meta.url)) {\n  hidden = 5;\n  console.log(counter, bump());\n}\n`,
  );
  writeFileSync(at("plain.ts"), `export const x = 1;\n`);
  // A Windows checkout (core.autocrlf) hands the codemod CRLF files.
  writeFileSync(at("geocrlf.ts"), GEO.replace(/\n/g, "\r\n"));
  // Re-exports and property names look like the import's name but are not uses of it.
  writeFileSync(
    at("reexp.ts"),
    `import { isMain } from "./self-check";\nimport { helper, type Shape } from "./dep";\nexport { helper } from "./dep";\nexport type { Shape } from "./dep";\nexport const o = { helper: 1 };\nexport const p = o.helper;\nif (isMain(import.meta.url)) {\n  const s: Shape = "circle";\n  console.log(helper(1), s);\n}\n`,
  );
  writeFileSync(at("doc.ts"), `/**\n * Usage:\n *   if (isMain(import.meta.url)) {\n */\nexport const y = 2;\n`);

  const found = findBlockModules([at("geo.ts"), at("mut.ts"), at("plain.ts"), at("doc.ts"), at("reexp.ts"), at("geocrlf.ts")]);
  assert(!found.includes(at("plain.ts")), "a module without the guard is not picked");
  assert(!found.includes(at("doc.ts")), "…nor one that only shows the guard in a comment");
  assert(found.length === 4, "the four with a real top-level isMain block are");

  const results = splitAll(found, { "check:geo": "tsx geo.ts" }, (p) => p.replace(dir, "").replace(/^[\\/]/, ""));
  const geo = results.find((r) => r.file === at("geo.ts"))!;
  const mut = results.find((r) => r.file === at("mut.ts"))!;

  // ── a CRLF file stays CRLF, with no lone CR where the block was cut ──
  const crlf = results.find((r) => r.file === at("geocrlf.ts"))!;
  const loneCr = (s: string) => /\r(?!\n)/.test(s);
  const bareLf = (s: string) => /(?<!\r)\n/.test(s);
  assert(crlf.problems.length === 0 && !loneCr(crlf.moduleText!) && !bareLf(crlf.moduleText!), "a CRLF module comes back all CRLF, no lone CR at the cut");
  assert(!loneCr(crlf.checkText!) && !bareLf(crlf.checkText!), "…and its sibling is written CRLF throughout");
  assert(crlf.moduleText!.replace(/\r\n/g, "\n") === geo.moduleText, "…with the same content as the LF module's");

  // ── re-exports and property names ──
  const reexp = results.find((r) => r.file === at("reexp.ts"))!;
  assert(!/^import \{[^}]*\bhelper\b/m.test(reexp.moduleText ?? ""), "an import only the block used goes, though the module re-exports and property-names it");
  assert(reexp.moduleText!.includes(`export { helper } from "./dep";`) && reexp.moduleText!.includes("o.helper"), "…and the re-export and the property stay");

  // ── the refused one ──
  assert(mut.problems.some((p) => p.includes("hidden")), "a block that assigns a module variable is refused, naming it");
  assert(mut.moduleText === undefined && mut.checkText === undefined, "…and nothing is written for it");

  // ── the module ──
  assert(geo.problems.length === 0, "the geometry module converts without problems");
  const mod = geo.moduleText!;
  assert(!mod.includes("isMain"), "the module no longer mentions isMain");
  assert(!mod.includes("node:fs") && !mod.includes("Shape"), "imports only the check used leave the module");
  assert(mod.includes(`import { helper } from "./dep";`), "an import the module still uses stays as written");
  assert(mod.includes("export function area(") && !mod.includes("export const SCALE"), "a helper the check calls is exported; one it doesn't is left alone");
  assert(!mod.includes("// The check: area and growth."), "the comment above the block goes with it");
  assert(mod.includes("export const AFTER = 1;"), "statements after the block are kept");
  assert(geo.exported.join() === "area", "the newly exported names are reported");

  // ── the sibling ──
  const chk = geo.checkText!;
  assert(chk.startsWith("// npm run check:geo — "), "the sibling opens by naming the script that runs it");
  assert(chk.includes(`import { readFileSync } from "node:fs";`), "it imports what the block used from other modules");
  assert(chk.includes(`import type { Shape } from "./dep";`), "…type-only imports stay type-only");
  assert(chk.includes(`import { area, grow, type Box } from "./geo";`), "…and the module's own names, sorted, types marked");
  assert(!/import \{[^}]*\bhelper\b/.test(chk), "a name the block never touched is not imported");
  assert(chk.includes("// The check: area and growth."), "the block's comment comes along");
  assert(chk.includes("const text = `line one\n  line two`;"), "a multi-line template literal is not re-indented");
  assert(chk.includes("\nconst assert = (ok: boolean"), "the block's body is dedented to the top level");

  // ── written out, it compiles and runs ──
  writeFileSync(at("geo.ts"), mod);
  writeFileSync(at("geo.check.ts"), chk);
  const program = ts.createProgram([at("geo.ts"), at("geo.check.ts")], {
    strict: true,
    noEmit: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    types: ["node"],
    typeRoots: [join(process.cwd(), "node_modules", "@types")],
  });
  const diags = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
  assert(diags.length === 0, `both files type-check${diags.length ? ": " + diags.join(" | ") : ""}`);
  const out = execFileSync(process.execPath, [join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), at("geo.check.ts")], { encoding: "utf8" });
  assert(out.includes("ok area") && out.includes("ok template kept") && out.includes("ok imports"), "the moved check runs and passes");

  // ── package.json ──
  const pkg = JSON.stringify({ scripts: { "check:geo": "tsx lib/x/geo.ts && tsx lib/x/other.ts", "check:geom": "tsx lib/x/geometry.ts" } }, null, 2);
  const re = retargetScripts(pkg, ["lib/x/geo.ts"]);
  assert(re.includes(`"tsx lib/x/geo.check.ts && tsx lib/x/other.ts"`), "a script running the module now runs its sibling");
  assert(re.includes(`"tsx lib/x/geometry.ts"`), "…and a module whose name merely starts the same is left alone");
  assert(!existsSync(at("mut.check.ts")), "the refused module got no sibling");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("check:split-self-checks passed");
