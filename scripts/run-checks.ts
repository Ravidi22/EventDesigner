// npm run checks [filter] — every `check:*` self-check, several at a time (EVE-19; CI's `checks` job).
//
// Runs each script's OWN command through the shell rather than `npm run <name>`: npm's start-up per
// script is most of the cost of a one-second check, times 180. Prints one line per pass, the whole
// output of each failure, and exits 1 if anything failed — a failing check is never skipped here.
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { checkScripts, type CheckScript } from "./run-checks-select";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
const filter = process.argv[2];
const checks = checkScripts(pkg.scripts, filter);
const concurrency = Math.max(1, Math.min(8, availableParallelism()));

// `tsx` is a local binary: put node_modules/.bin on the path, as `npm run` would.
const env = { ...process.env, PATH: `${join(root, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}` };

interface Outcome {
  check: CheckScript;
  ok: boolean;
  ms: number;
  output: string;
}

function run(check: CheckScript): Promise<Outcome> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(check.command, { shell: true, cwd: root, env });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) => resolve({ check, ok: code === 0, ms: Date.now() - started, output }));
    child.on("error", (e) => resolve({ check, ok: false, ms: Date.now() - started, output: String(e) }));
  });
}

async function main() {
  const started = Date.now();
  const queue = [...checks];
  const failed: Outcome[] = [];
  let passed = 0;

  async function worker() {
    for (let check = queue.shift(); check; check = queue.shift()) {
      const outcome = await run(check);
      if (outcome.ok) {
        passed++;
        console.log(`ok   ${check.name}  ${outcome.ms}ms`);
      } else {
        failed.push(outcome);
        console.log(`FAIL ${check.name}  ${outcome.ms}ms`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  for (const f of failed) {
    console.log(`\n──── ${f.check.name}: ${f.check.command}\n${f.output.trimEnd()}`);
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\n${passed} passed, ${failed.length} failed (${checks.length} checks, ${concurrency} at a time, ${seconds}s)`);
  if (failed.length > 0 || checks.length === 0) process.exit(1);
}

main();
