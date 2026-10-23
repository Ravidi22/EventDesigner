// three.js stays in components/scene/, asserted rather than remembered.
//
// The viewer is ~700 kB gzipped. It is loaded lazily, on the scene routes only, and that promise
// holds exactly as long as no module OUTSIDE components/scene/ imports three — one stray
// `import { Vector3 } from "three"` in a shared helper puts the whole library into every page's
// bundle, including the studio's first paint, and nothing on screen says so. `npm run
// check:scene-boundary` walks the source for the import and fails on any file outside the folder.
//
// Same shape as lib/suppliers/cost-boundary.ts, same reasoning: a static scan, because the failure
// it guards against is a future edit.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isMain } from "../self-check";

export const SCANNED = ["app", "components", "lib"];
export const ALLOWED = "components/scene";
/** An import statement (static or dynamic) of three or a react-three package — a line that
 *  merely mentions one in a comment or a string is not an import. */
export const THREE_IMPORT = /^\s*(?:import\b[^;]*?\bfrom\s+|import\s*\(\s*|export\b[^;]*?\bfrom\s+|require\s*\(\s*)["'](?:three|three\/[^"']*|@react-three\/[^"']*)["']/;

const SOURCE = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(entry)) out.push(full);
  }
  return out;
}

export interface Violation {
  file: string;
  line: number;
  text: string;
}

export function scanThreeImports(root: string): Violation[] {
  const out: Violation[] = [];
  for (const top of SCANNED) {
    for (const file of walk(join(root, top))) {
      const rel = relative(root, file).split(sep).join("/");
      if (rel.startsWith(ALLOWED + "/")) continue;
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((text, i) => {
        if (THREE_IMPORT.test(text)) out.push({ file: rel, line: i + 1, text: text.trim() });
      });
    }
  }
  return out;
}

if (isMain(import.meta.url)) {
  const violations = scanThreeImports(process.cwd());
  if (violations.length) {
    for (const v of violations) console.error(`${v.file}:${v.line}  ${v.text}`);
    console.error(`\n${violations.length} three.js import(s) outside ${ALLOWED}/`);
    process.exit(1);
  }
  console.log(`scene boundary ok: three.js imported only under ${ALLOWED}/`);
}
