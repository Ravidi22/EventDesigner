// Remove ONE organisation and everything that hangs off it — its people, their logins and sessions,
// its settings, and every row in every table that points at it, found from the database's own
// catalogue rather than from a list somebody has to keep current: the foreign keys that point at
// `organizations` and `users`, AND every table with an `organization_id` column. Most of the
// schema has no foreign key to `organizations` (ADR-2's `orgId()` is a plain uuid column), so
// the first version of this script, which followed foreign keys only, left an organisation's
// products, variants, events, drawings and venues behind (found 2026-11-11 clearing a throwaway
// studio). Written 2026-10-31 to clear a stale empty studio from the production branch before
// opening the real one.
//
//   npx tsx scripts/delete-organization.ts --org <organisation id> [--db PROD_DIRECT_URL] [--dry-run] [--yes]
//
// DRY RUN FIRST, ALWAYS: it prints each referencing table with the number of rows that would go
// and the foreign key's own delete rule (cascade / no action / set null / restrict). Nothing is
// deleted without --yes. Take a backup (scripts/backup-db.ts) before the real run; this is not
// reversible.
//
// Order: rows referencing the organisation's USERS first (sessions, credentials, assignments), then
// the users, then rows referencing the ORGANISATION, then the organisation — each table's rows for
// this organisation only. A table whose rows are themselves referenced by another table with a NO
// ACTION rule is retried after the others, up to a handful of passes, which covers chains like
// order_lines → orders → organisations, or billing_documents → events → venues, without
// hard-coding them. A child table with no organisation column of its own (event_zones, order_lines)
// goes by its parent's CASCADE.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULE: Record<string, string> = { a: "no action", c: "cascade", n: "set null", r: "restrict", d: "set default" };

interface Ref {
  table: string;
  column: string;
  rule: string;
}

async function referencing(sql: postgres.Sql, target: string): Promise<Ref[]> {
  const rows = await sql<{ table: string; column: string; rule: string }[]>`
    select c.conrelid::regclass::text as table, a.attname as column, c.confdeltype as rule
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = ${target}::regclass
    order by 1, 2`;
  return rows.map((r) => ({ table: r.table.replace(/^public\./, ""), column: r.column, rule: RULE[r.rule] ?? r.rule }));
}

async function main() {
  const orgId = String(arg("org") ?? "");
  const dbVar = arg("db") ?? "DIRECT_URL";
  const dryRun = flag("dry-run");
  const yes = flag("yes");
  if (!UUID.test(orgId)) throw new Error("usage: npx tsx scripts/delete-organization.ts --org <organisation id> [--db <ENV_VAR>] [--dry-run] [--yes]");
  if (!dryRun && !yes) throw new Error("pass --dry-run to see what would go, or --yes to delete");
  const url = process.env[dbVar];
  if (!url) throw new Error(`${dbVar} is not set in .env.local`);
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 20 });
  try {
    const host = url.replace(/^[^@]*@/, "").replace(/[/?].*$/, "");
    const [org] = await sql`select id, name, kind from organizations where id = ${orgId}`;
    if (!org) throw new Error(`no organisation ${orgId} in ${dbVar} (${host})`);
    const people = await sql<{ id: string; email: string; name: string | null; role: string }[]>`select id, email, name, role from users where organization_id = ${orgId}`;
    console.log(`${dbVar} (${host}) — organisation "${org.name}" (${org.kind}) ${org.id}`);
    console.log(`people: ${people.length}${people.map((p) => `\n  ${p.email} · ${p.name ?? ""} · ${p.role}`).join("")}`);

    const userIds = people.map((p) => p.id);
    const byUser = await referencing(sql, "users");
    const byOrg = await referencing(sql, "organizations");
    const counts: { table: string; column: string; rule: string; via: "user" | "organisation"; n: number }[] = [];
    for (const r of byUser) {
      if (!userIds.length) break;
      const [{ n }] = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from "${r.table}" where "${r.column}" = any($1::uuid[])`, [userIds]);
      if (n) counts.push({ ...r, via: "user", n });
    }
    for (const r of byOrg) {
      const [{ n }] = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from "${r.table}" where "${r.column}" = $1::uuid`, [orgId]);
      if (n) counts.push({ ...r, via: "organisation", n });
    }
    // Every table that carries the tenant column without a foreign key on it — most of the schema.
    const keyed = new Set(byOrg.filter((r) => r.column === "organization_id").map((r) => r.table));
    const scoped = await sql<{ table: string }[]>`
      select table_name as table from information_schema.columns
      where table_schema = 'public' and column_name = 'organization_id' order by 1`;
    for (const { table } of scoped) {
      if (table === "users" || keyed.has(table)) continue;
      const [{ n }] = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from "${table}" where "organization_id" = $1::uuid`, [orgId]);
      if (n) counts.push({ table, column: "organization_id", rule: "no fk", via: "organisation", n });
    }
    console.log("rows that go with it:");
    for (const c of counts) console.log(`  ${c.table}.${c.column} (${c.via}, ${c.rule === "no fk" ? "no fk" : `fk ${c.rule}`}): ${c.n}`);
    if (!counts.length) console.log("  (none beyond the organisation row)");
    if (dryRun) {
      console.log("dry run — nothing deleted");
      return;
    }

    await sql.begin(async (tx) => {
      // Rows that point at the users, then the users; rows that point at the organisation, then it.
      // A table still referenced by another table's rows (NO ACTION) fails and is retried on the
      // next pass once that table has been emptied.
      const pending = [
        ...counts.filter((c) => c.via === "user").map((c) => ({ ...c, key: userIds })),
        ...counts.filter((c) => c.via === "organisation").map((c) => ({ ...c, key: [orgId] })),
      ];
      let passes = 0;
      while (pending.length && passes < 10) {
        passes++;
        for (let i = pending.length - 1; i >= 0; i--) {
          const c = pending[i];
          try {
            await tx.savepoint(async (sp) => {
              await sp.unsafe(`delete from "${c.table}" where "${c.column}" = any($1::uuid[])`, [c.key]);
            });
            pending.splice(i, 1);
          } catch (error) {
            if (!/foreign key/i.test(String(error))) throw error;
          }
        }
        if (pending.length && passes === 1 && userIds.length) {
          // The users themselves, once nothing points at them.
          try {
            await tx.savepoint(async (sp) => {
              await sp`delete from users where id = any (${userIds}::uuid[])`;
            });
          } catch (error) {
            if (!/foreign key/i.test(String(error))) throw error;
          }
        }
      }
      if (pending.length) throw new Error(`could not delete: ${pending.map((c) => c.table).join(", ")} — something still references them`);
      if (userIds.length) await tx`delete from users where id = any (${userIds}::uuid[])`;
      await tx`delete from organizations where id = ${orgId}`;
    });
    const [left] = await sql`select count(*)::int as n from organizations where id = ${orgId}`;
    const [leftPeople] = await sql`select count(*)::int as n from users where id = any (${userIds}::uuid[])`;
    let leftRows = 0;
    for (const { table } of scoped) {
      const [{ n }] = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from "${table}" where "organization_id" = $1::uuid`, [orgId]);
      if (n) console.log(`  still in ${table}: ${n}`);
      leftRows += n;
    }
    console.log(`deleted organisation "${org.name}" and ${people.length} people — remaining: ${left.n} organisation rows, ${leftPeople.n} user rows, ${leftRows} rows carrying its id`);
  } finally {
    await sql.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  });
