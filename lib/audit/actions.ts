"use server";
// The owner reads the business's audit log (EVE-52, spec §5.9). Writing is lib/audit/write.ts.
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { currentActor } from "@/lib/db/org";
import { actorLabel, renderLine } from "./render";
import { AUDIT_ACTIONS, AUDIT_GROUP, type AuditGroup, type AuditRow } from "./types";

const PAGE = 50;

/** Newest first, 50 at a time; `before` is the `at` of the last row already shown. Owner only. */
export async function fetchAuditLog(input?: { before?: string; group?: AuditGroup }): Promise<{ rows: AuditRow[]; more: boolean }> {
  const actor = await currentActor();
  if (actor.role !== "owner") throw new Error("only the owner reads the audit log");

  const before = typeof input?.before === "string" && !Number.isNaN(Date.parse(input.before)) ? new Date(input.before) : null;
  const group = input?.group && Object.values(AUDIT_GROUP).includes(input.group) ? input.group : null;
  const actions = group ? AUDIT_ACTIONS.filter((a) => AUDIT_GROUP[a] === group) : null;

  const rows = await db()
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, actor.organizationId),
        before ? lt(auditLog.at, before) : undefined,
        actions ? inArray(auditLog.action, [...actions]) : undefined,
      ),
    )
    .orderBy(desc(auditLog.at))
    .limit(PAGE + 1);

  return {
    rows: rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      action: r.action,
      group: AUDIT_GROUP[r.action],
      actor: actorLabel(r.actorUserId, r.people),
      line: renderLine(r.summary, r.people),
    })),
    more: rows.length > PAGE,
  };
}
