// Every server action in the app, read off the source (EVE-23). The isolation test checks this list
// against its cases, so an action added without a case fails the test instead of slipping past it.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude", ".superpowers"]);

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(join(dir, entry.name));
    }
  }
}

/** True when the file's first statement is the "use server" directive (comments may precede it). */
function isServerModule(source: string): boolean {
  const code = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return /^["']use server["'];?/.test(code);
}

/** `"<path>#<name>"` for every exported function or const of every "use server" module under lib/ and app/. */
export function serverActions(root: string): string[] {
  const files: string[] = [];
  for (const top of ["lib", "app"]) walk(join(root, top), files);
  const keys: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (!isServerModule(source)) continue;
    const path = relative(root, file).split("\\").join("/");
    for (const m of source.matchAll(/^export (?:async )?function (\w+)|^export const (\w+)\s*=/gm)) {
      keys.push(`${path}#${m[1] ?? m[2]}`);
    }
  }
  return keys.sort();
}

/** The actions that have no case, in order. */
export function missingCases(actions: readonly string[], cases: Readonly<Record<string, unknown>>): string[] {
  return actions.filter((key) => !(key in cases));
}
