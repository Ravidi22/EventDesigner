// GET /api/account/export/data — the whole business as JSON, for the owner (EVE-51, spec §5.8). The
// browser fetches the photos itself and builds the zip (lib/account/export-zip.ts), so this answers
// fast and depends on no host limit. Works while the business is closed (the closed page offers it).
// Every download is in the audit log.
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth/session";
import { closedMember, currentActor } from "@/lib/db/org";
import { exportData } from "@/lib/account/export";
import { peopleOf, recordAudit } from "@/lib/audit/write";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  const session = await currentSession();
  if (!session) return Response.json({ error: "not signed in" }, { status: 401, headers: NO_STORE });
  const actor = await (session.closed ? closedMember() : currentActor()).catch(() => null);
  if (!actor || actor.role !== "owner" || !actor.userId) {
    return Response.json({ error: "only the owner downloads the business" }, { status: 403, headers: NO_STORE });
  }
  const data = await exportData(actor.organizationId);
  await recordAudit(db(), {
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: "export.downloaded",
    summary: "ייצוא כל הנתונים",
    people: await peopleOf(db(), [actor.userId]),
  });
  return Response.json(data, { headers: NO_STORE });
}
