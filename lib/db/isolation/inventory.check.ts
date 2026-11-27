// npm run check:isolation-inventory — the isolation test cannot fall behind the code: every exported
// server action must have a case, and an action added without one is named.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { missingCases, serverActions } from "./inventory";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

const here = serverActions(process.cwd());
assert(here.length >= 191, `the repo's server actions are found (${here.length})`);
assert(here.includes("lib/catalog/actions.ts#fetchProducts"), "keys are <path>#<name>, with forward slashes");
assert(here.includes("lib/events/workspace.ts#fetchEventWorkspace"), "a \"use server\" file not named actions.ts is found too");
assert(!here.some((k) => k.startsWith("lib/files/keys.ts#")), "a module without \"use server\" is not");
assert(new Set(here).size === here.length, "each action once");

const tmp = mkdtempSync(join(tmpdir(), "isolation-inventory-"));
try {
  mkdirSync(join(tmp, "lib", "x"), { recursive: true });
  writeFileSync(
    join(tmp, "lib", "x", "actions.ts"),
    [
      '"use server";',
      "export async function covered(id: string) {}",
      "export async function sneaky(id: string) {}",
      "export const arrow = async () => {};",
      "async function helper() {}",
      "export type NotAnAction = string;",
    ].join("\n"),
  );
  writeFileSync(join(tmp, "lib", "x", "plain.ts"), "export async function notServer() {}");
  const found = serverActions(tmp);
  assert(
    JSON.stringify(found) === JSON.stringify(["lib/x/actions.ts#arrow", "lib/x/actions.ts#covered", "lib/x/actions.ts#sneaky"]),
    `exported functions and consts of "use server" files only (${found.join(", ")})`,
  );
  const missing = missingCases(found, { "lib/x/actions.ts#covered": {}, "lib/x/actions.ts#arrow": {} });
  assert(JSON.stringify(missing) === JSON.stringify(["lib/x/actions.ts#sneaky"]), "an action with no case is named");
  assert(missingCases(found, {}).length === 3, "…all of them, when there are no cases");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log("isolation inventory self-check passed");
