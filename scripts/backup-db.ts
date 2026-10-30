// A logical backup of every table in the database DATABASE_URL points at — every row, as JSON.
//
//   npx tsx scripts/backup-db.ts <out.json>
//
// Written before the venue-owner change (docs/superpowers/specs/2026-10-30-venue-owners-design.md)
// re-scoped who reads a venue: אמרה is hand-curated data with no other copy, and a restore needs the
// rows, not a migration history. Plain `select *` per table, in name order; jsonb comes back parsed,
// dates as ISO strings. Read-only.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { writeFileSync } from "node:fs";
import postgres from "postgres";

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("usage: npx tsx scripts/backup-db.ts <out.json>");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const tables = await sql<{ name: string }[]>`
      select table_name as name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
    const dump: Record<string, unknown[]> = {};
    for (const { name } of tables) {
      dump[name] = await sql.unsafe(`select * from "${name}"`);
      console.log(`  ${name}: ${dump[name].length}`);
    }
    writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), host: new URL(url).host, tables: dump }));
    console.log(`wrote ${out}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
