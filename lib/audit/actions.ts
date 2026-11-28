"use server";
// The owner reads the business's audit log (EVE-52, spec §5.9). Writing is lib/audit/write.ts.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { currentActor } from "@/lib/db/org";
import { actorLabel, renderLine } from "./render";
import { AUDIT_ACTIONS, AUDIT_GROUP, type AuditGroup, type AuditRow } from "./types";

const PAGE = 50;

/** A page's cursor: the last row's `at` to the MICROSECOND, and its id — `2026-11-28T10:00:00.123456Z|<uuid>`.
 *  Rows written in one transaction share now(); a cursor of `at` alone, cut to the millisecond by a
 *  JS Date, skipped the rows at a page edge (PR #5 review). Anything else is no cursor: the first page. */
const CURSOR = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Newest first, 50 at a time; `before` is the `next` of the page already shown. Owner only. */
export async function fetchAuditLog(input?: {
  before?: string;
  group?: AuditGroup;
}): Promise<{ rows: AuditRow[]; more: boolean; next?: string }> {
  const actor = await currentActor();
  if (actor.role !== "owner") throw new Error("only the owner reads the audit log");

  const cursor = typeof input?.before === "string" ? CURSOR.exec(input.before) : null;
  const group = input?.group && Object.values(AUDIT_GROUP).includes(input.group) ? input.group : null;
  const actions = group ? AUDIT_ACTIONS.filter((a) => AUDIT_GROUP[a] === group) : null;

  const rows = await db()
    .select({
      row: auditLog,
      exactAt: sql<string>`to_char(${auditLog.at} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, actor.organizationId),
        cursor ? sql`(${auditLog.at}, ${auditLog.id}) < (${cursor[1]}::timestamptz, ${cursor[2]}::uuid)` : undefined,
        actions ? inArray(auditLog.action, [...actions]) : undefined,
      ),
    )
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(PAGE + 1);

  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  return {
    rows: page.map(({ row: r }) => ({
      id: r.id,
      at: r.at.toISOString(),
      action: r.action,
      group: AUDIT_GROUP[r.action],
      actor: actorLabel(r.actorUserId, r.people),
      line: renderLine(r.summary, r.people),
    })),
    more: rows.length > PAGE,
    ...(rows.length > PAGE && last ? { next: `${last.exactAt}|${last.row.id}` } : {}),
  };
}
