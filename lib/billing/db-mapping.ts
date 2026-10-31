// Rows ↔ BillingDocument. Pure, no I/O — its own file because a "use server" module may only
// export async functions.
import type { InferSelectModel } from "drizzle-orm";
import type { billingDocuments } from "@/lib/db/schema";
import type { BillingDocument } from "./types";

export type BillingRow = InferSelectModel<typeof billingDocuments>;

const orUndefined = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

export function toDocument(row: BillingRow): BillingDocument {
  return {
    id: row.id,
    eventId: row.eventId,
    kind: row.kind,
    series: row.series,
    number: row.number,
    status: row.status,
    issuedAt: row.issuedAt.getTime(),
    // A `date` column arrives as "yyyy-mm-dd" and stays one — see lib/events/db-mapping.ts on why
    // a calendar day must never pass through a Date.
    documentDate: row.documentDate,
    followsId: orUndefined(row.followsId),
    documentVersion: orUndefined(row.documentVersion),
    customer: row.customer,
    lines: row.lines,
    totals: row.totals,
    schedule: orUndefined(row.schedule),
    payment: orUndefined(row.payment),
    credit: orUndefined(row.credit),
    allocationNumber: orUndefined(row.allocationNumber),
    allocationStatus: row.allocationStatus,
    note: row.note,
    originalAt: row.originalAt?.getTime(),
    sentAt: row.sentAt?.getTime(),
    sentTo: orUndefined(row.sentTo),
    cancelledAt: row.cancelledAt?.getTime(),
    cancelReason: orUndefined(row.cancelReason),
    supersededById: orUndefined(row.supersededById),
    contentHash: row.contentHash,
  };
}
