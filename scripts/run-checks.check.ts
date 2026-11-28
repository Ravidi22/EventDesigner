// npx tsx scripts/run-checks.check.ts — which scripts `npm run checks` runs.
import { checkScripts } from "./run-checks-select";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

const scripts = {
  dev: "next dev",
  "check:headers": "tsx lib/security/headers.check.ts",
  "check:google": "tsx lib/google/types.ts && tsx lib/google/config.ts",
  checks: "tsx scripts/run-checks.ts",
  "db:verify": "tsx lib/db/verify-roundtrip.ts",
  "check:health": "tsx lib/health/probe.check.ts",
};

const all = checkScripts(scripts);
assert(
  JSON.stringify(all.map((c) => c.name)) === JSON.stringify(["check:google", "check:headers", "check:health"]),
  "every check:* script, sorted — and nothing else (not `checks` itself, not db:verify)",
);
assert(all.find((c) => c.name === "check:google")?.command === scripts["check:google"], "the command is the script's own, chained parts included");
assert(
  JSON.stringify(checkScripts(scripts, "hea").map((c) => c.name)) === JSON.stringify(["check:headers", "check:health"]),
  "a filter keeps names containing it",
);
assert(checkScripts(scripts, "nothing-matches").length === 0, "a filter that matches nothing selects nothing");

console.log("run-checks self-check passed");
