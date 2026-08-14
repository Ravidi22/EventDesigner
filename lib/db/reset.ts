// Throw the local database away and rebuild it from the migrations.
//
//   npm run db:reset        (this, then db:seed)
//
// It used to be `drizzle-kit push --force`, which stopped being correct the day the schema became
// migration-applied: push REACHES a schema without recording how, so a pushed database and a
// migrated one look identical while `__drizzle_migrations` describes something that no longer
// exists — and the next `db:migrate` then either re-applies a baseline over live tables or skips a
// migration that was never actually run. Both fail confusingly, some hours later.
//
// So this drops and replays instead. The result is a database whose schema is *produced by* the
// files in drizzle/, which is the only version of "local matches production" worth having.
//
// ⚠ LOCALHOST ONLY, enforced below rather than documented above. A reset script is a loaded gun
// pointed at whatever DATABASE_URL happens to say, and the entire cost of pointing it at Neon is
// paid by someone else's evening.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Local, or a throw naming what it found. Hostname only — a password may say anything. */
function assertLocal(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a URL this script can read.");
  }
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!local) {
    throw new Error(
      `REFUSING: DATABASE_URL points at "${host}", not localhost. db:reset destroys every row it ` +
        `can reach. To rebuild a hosted database, do it deliberately and not with this script.`,
    );
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Run `cp .env.example .env.local`, then `docker compose up -d`.",
    );
  }
  assertLocal(url);

  // Its own connection, not lib/db's pool: this drops the schema those tables live in, and the
  // cached handle on globalThis would go on believing in them.
  const sql = postgres(url, { max: 1 });

  try {
    // BOTH schemas. `public` holds the tables; `drizzle` holds __drizzle_migrations, and leaving it
    // behind would leave the ledger insisting the baseline is applied to tables that were just
    // dropped — the exact desynchronisation this script exists to prevent.
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS public CASCADE;
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      CREATE SCHEMA public;
    `);
    console.log("dropped: public + drizzle");

    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("migrations applied — run `npm run db:seed` for the organisation row");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("reset failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
