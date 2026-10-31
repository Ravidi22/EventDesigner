// Trusting reads over the billing documents — PLAIN module, never "use server".
//
// These take an organisation id and trust it, so they may only be called from server code that
// has already decided whose data it is reading (lib/production/actions.ts for the runway). A
// "use server" export with an organisation id parameter would be a public POST endpoint that
// reads any studio's books — the same line lib/scene/reads.ts draws, for the same reason.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingDocuments } from "@/lib/db/schema";
import { toDocument } from "./db-mapping";
import type { BillingDocument } from "./types";

/** The documents of several events at once, by event. */
export async function documentsForEvents(organizationId: string, eventIds: string[]): Promise<Map<string, BillingDocument[]>> {
  const out = new Map<string, BillingDocument[]>();
  if (eventIds.length === 0) return out;
  const rows = await db()
    .select()
    .from(billingDocuments)
    .where(and(eq(billingDocuments.organizationId, organizationId), inArray(billingDocuments.eventId, eventIds)))
    .orderBy(asc(billingDocuments.issuedAt));
  for (const r of rows) {
    const list = out.get(r.eventId) ?? [];
    list.push(toDocument(r));
    out.set(r.eventId, list);
  }
  return out;
}
