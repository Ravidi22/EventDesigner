// npm run check:account-tables — the self-check of ./tables.ts (EVE-22, EVE-51): the registry covers
// every table the schema has, exports no secret, and erases in an order the foreign keys accept.
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { ACCOUNT_TABLES, ERASE_ORDER, exportedColumns, isSecretColumn, type EraseRule } from "./tables";

const failures: string[] = [];
const assert = (c: boolean, m: string) => {
  if (!c) failures.push(m);
};

const configs = Object.values(schema)
  .filter((t) => is(t, PgTable))
  .map((t) => getTableConfig(t as PgTable));
const byName = new Map(configs.map((c) => [c.name, c]));

// ── Coverage: a new table must say what the export and the erase do with it. ────────────────────
for (const c of configs) assert(c.name in ACCOUNT_TABLES, `${c.name} has no entry in lib/account/tables.ts`);
for (const name of Object.keys(ACCOUNT_TABLES)) assert(byName.has(name), `${name} is in the registry but not in the schema`);

const columnsOf = (table: string) => byName.get(table)?.columns.map((c) => c.name) ?? [];

// ── Reach: what it names is real. ───────────────────────────────────────────────────────────────
for (const [name, rule] of Object.entries(ACCOUNT_TABLES)) {
  const r = rule.reach;
  if (r === "org") assert(columnsOf(name).includes("organization_id"), `${name}: reach "org" needs organization_id`);
  if (typeof r === "object" && "orgColumns" in r) {
    for (const col of r.orgColumns) assert(columnsOf(name).includes(col), `${name}: no column ${col}`);
  }
  if (typeof r === "object" && "via" in r) {
    const [parent, col] = r.via.split(".");
    assert(byName.has(parent), `${name}: via names no table ${parent}`);
    assert(columnsOf(name).includes(col), `${name}: via names no column ${col}`);
  }
  if (typeof r === "object" && "user" in r) assert(columnsOf(name).includes(r.user), `${name}: no column ${r.user}`);
}

// ── Secrets: nothing that signs anybody in leaves in an export. ─────────────────────────────────
for (const s of ["password", "password_hash", "invite_token_hash", "token", "token_hash", "access_token", "refresh_token", "id_token"]) {
  assert(isSecretColumn(s), `${s} is a secret`);
}
for (const s of ["client_name", "phone", "email", "tokens_used"]) assert(!isSecretColumn(s), `${s} is not a secret`);
for (const c of configs) {
  const cols = c.columns.map((x) => x.name);
  for (const col of exportedColumns(c.name, cols)) {
    assert(!isSecretColumn(col), `${c.name}.${col} is a secret and is exported`);
  }
}
for (const t of ["auth_sessions", "auth_accounts", "auth_verifications", "auth_rate_limits"]) {
  assert(exportedColumns(t, columnsOf(t)).length === 0, `${t} is never exported`);
}

// ── The erase order: every table the erase deletes from, once, children before parents. ────────
const DELETES: EraseRule[] = ["delete", "retain-event", "retain-design", "retain-venue"];
const deleted = Object.entries(ACCOUNT_TABLES)
  .filter(([, r]) => typeof r.erase === "string" && DELETES.includes(r.erase))
  .map(([n]) => n);
for (const name of deleted) {
  assert(ERASE_ORDER.filter((n) => n === name).length === 1, `${name} must appear in ERASE_ORDER exactly once`);
}
for (const name of ERASE_ORDER) assert(deleted.includes(name), `${name} is in ERASE_ORDER but the erase does not delete it`);
const at = (n: string) => ERASE_ORDER.indexOf(n);
for (const c of configs) {
  for (const fk of c.foreignKeys) {
    const parent = getTableConfig(fk.reference().foreignTable).name;
    if (parent === c.name || at(c.name) < 0 || at(parent) < 0) continue;
    assert(at(c.name) < at(parent), `ERASE_ORDER: ${c.name} must come before ${parent} (it references it)`);
  }
}

// ── "cascade" tables go with a parent the erase deletes outright (never a retained one). ────────
for (const [name, rule] of Object.entries(ACCOUNT_TABLES)) {
  if (rule.erase !== "cascade") continue;
  const parents = (byName.get(name)?.foreignKeys ?? [])
    .filter((fk) => fk.onDelete === "cascade")
    .map((fk) => getTableConfig(fk.reference().foreignTable).name);
  assert(parents.length > 0, `${name}: "cascade" needs an ON DELETE CASCADE foreign key`);
  assert(
    parents.some((p) => ACCOUNT_TABLES[p]?.erase === "delete"),
    `${name}: "cascade" needs a parent the erase deletes outright (has: ${parents.join(", ")})`,
  );
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log(`check:account-tables — ok (${configs.length} tables)`);
