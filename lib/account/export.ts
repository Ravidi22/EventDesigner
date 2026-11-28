// The whole business as data (EVE-51, spec §5.8). A PLAIN module, never "use server": it takes an
// organisation id and trusts it — the route (app/api/account/export/data) proves the caller owns it.
// Which rows and which columns leave is lib/account/tables.ts's; `check:account-tables` keeps every
// secret out.
import { sql, type SQL } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { fileDriver } from "@/lib/files/driver";
import type { OrgKind } from "@/lib/auth/kinds";
import { ACCOUNT_TABLES, exportedColumns } from "./tables";
import type { ExportData, Row } from "./export-types";

const columnsByTable = new Map(
  Object.values(schema)
    .filter((t) => is(t, PgTable))
    .map((t) => {
      const c = getTableConfig(t as PgTable);
      return [c.name, c.columns.map((col) => col.name)] as const;
    }),
);

/** The WHERE naming the business's rows of a table, or null for a table that is nobody's. */
function whereOf(table: string, organizationId: string): SQL | null {
  const reach = ACCOUNT_TABLES[table].reach;
  if (reach === "org") return sql`organization_id = ${organizationId}`;
  if (reach === "self") return sql`id = ${organizationId}`;
  if (reach === "global") return null;
  if ("orgColumns" in reach) return sql`(${sql.join(reach.orgColumns.map((c) => sql`${sql.identifier(c)} = ${organizationId}`), sql` or `)})`;
  if ("via" in reach) {
    const [parent, column] = reach.via.split(".");
    return sql`${sql.identifier(column)} in (select id from ${sql.identifier(parent)} where organization_id = ${organizationId})`;
  }
  return sql`${sql.identifier(reach.user)} in (select id from users where organization_id = ${organizationId})`;
}

export async function exportData(organizationId: string): Promise<ExportData> {
  const database = db();
  const tables: Record<string, Row[]> = {};
  for (const table of Object.keys(ACCOUNT_TABLES)) {
    const columns = exportedColumns(table, columnsByTable.get(table) ?? []);
    const where = whereOf(table, organizationId);
    if (!columns.length || !where) continue;
    const list = sql.join(columns.map((c) => sql.identifier(c)), sql`, `);
    tables[table] = (await database.execute(sql`select ${list} from ${sql.identifier(table)} where ${where}`)) as unknown as Row[];
  }

  const org = (tables.organizations?.[0] ?? {}) as { name?: string; kind?: OrgKind };
  const clientAccounts = (await database.execute(sql`
    select ec.event_id as "eventId", u.name, u.email, ec.role
    from event_clients ec join events e on e.id = ec.event_id join users u on u.id = ec.user_id
    where e.organization_id = ${organizationId}`)) as unknown as ExportData["clientAccounts"];

  const used = (await database.execute(sql`
    select v.id, v.name, s.structure from venues v
    left join venue_structures s on s.venue_id = v.id
    where v.organization_id <> ${organizationId}
      and v.id in (select venue_id from events where organization_id = ${organizationId} and venue_id is not null)`)) as unknown as {
    id: string;
    name: string;
    structure: unknown;
  }[];
  const venuesUsed: ExportData["venuesUsed"] = [];
  for (const v of used) {
    const zones = (await database.execute(sql`select * from zones where venue_id = ${v.id}`)) as unknown as Row[];
    venuesUsed.push({ id: v.id, name: v.name, structure: v.structure, zones });
  }

  return {
    meta: { business: org.name ?? "", kind: org.kind ?? "studio", at: new Date().toISOString(), app: "eve" },
    tables,
    clientAccounts,
    venuesUsed,
    files: await fileDriver().list(`${organizationId}/`),
  };
}
