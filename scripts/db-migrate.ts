// `npm run db:migrate:prod` — the generated migrations, applied to PRODUCTION (the Neon branch
// Vercel reads), with a look first at what is about to run.
//
//   npm run db:migrate:prod                 list what production lacks, ask, apply
//   npm run db:migrate:prod -- --status     list only, touch nothing
//   npm run db:migrate:prod -- --yes        apply without the question (a script, CI)
//   npx tsx scripts/db-migrate.ts [--status]   the same against develop (DIRECT_URL / DATABASE_URL)
//
// It is `drizzle-kit migrate` itself, not a second migrator: the same drizzle.config.ts, the same
// `drizzle.__drizzle_migrations` table. That config loads .env.local with dotenv, which never
// overwrites a variable already set — so handing the child process DIRECT_URL is what points it
// at production. Always the DIRECT host (PROD_DIRECT_URL), never the pooled PROD_DATABASE_URL: a
// migration through Neon's pooler hangs with no error to read (see drizzle.config.ts).
//
// "Pending" is read the way drizzle's migrator decides it — every journal entry newer than the
// newest `created_at` applied — not by hash: the .sql files are checked out with CRLF on Windows,
// so their hashes never match the rows written from an LF checkout.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const args = new Set(process.argv.slice(2));
const prod = args.has("--prod");
const statusOnly = args.has("--status");
const yes = args.has("--yes");

const varName = prod ? "PROD_DIRECT_URL" : process.env.DIRECT_URL ? "DIRECT_URL" : "DATABASE_URL";
const url = process.env[varName];
if (!url) {
  console.error(`${varName} is not set in .env.local.`);
  process.exit(1);
}
const host = new URL(url).host; // printed instead of the URL — it carries the password
const label = prod ? "PRODUCTION" : "develop";

type JournalEntry = { tag: string; when: number };
const journal: { entries: JournalEntry[] } = JSON.parse(
  readFileSync(path.join("drizzle", "meta", "_journal.json"), "utf8"),
);

async function pending(): Promise<{ applied: number; missing: JournalEntry[] }> {
  const sql = postgres(url!, { max: 1, idle_timeout: 2, connect_timeout: 20, onnotice: () => {} });
  try {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
    if (!exists) return { applied: 0, missing: journal.entries };
    const rows = await sql<{ created_at: string }[]>`select created_at from drizzle.__drizzle_migrations`;
    const last = Math.max(0, ...rows.map((r) => Number(r.created_at)));
    return { applied: rows.length, missing: journal.entries.filter((e) => e.when > last) };
  } finally {
    await sql.end();
  }
}

async function main() {
  console.log(`${label} — ${host}`);
  const before = await pending();
  console.log(`${before.applied} applied, ${journal.entries.length} in the journal.`);
  if (before.missing.length === 0) {
    console.log("Up to date — nothing to apply.");
    return;
  }
  console.log(`Pending (${before.missing.length}):`);
  for (const e of before.missing) console.log(`  ${e.tag}`);
  if (statusOnly) return;

  if (prod && !yes) {
    if (!process.stdin.isTTY) {
      console.error("Refusing to migrate production without a terminal to confirm in — pass --yes.");
      process.exit(1);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Apply ${before.missing.length} migration(s) to PRODUCTION? Type "prod" to go on: `);
    rl.close();
    if (answer.trim() !== "prod") {
      console.log("Nothing applied.");
      return;
    }
  }

  const run = spawnSync("npx drizzle-kit migrate", {
    stdio: "inherit",
    shell: true, // npx is a .cmd shim on Windows
    env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
  });
  if (run.status !== 0) {
    console.error(`drizzle-kit migrate failed (exit ${run.status}).`);
    process.exit(run.status ?? 1);
  }

  const after = await pending();
  if (after.missing.length) {
    console.error(`Still pending after the run: ${after.missing.map((e) => e.tag).join(", ")}`);
    process.exit(1);
  }
  console.log(`${label} is up to date — ${after.applied} applied.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
