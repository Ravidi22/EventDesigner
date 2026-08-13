"use server";
// Issued quotes (F-7.4), in Postgres — and the end of the mock version lock.
//
// ── WHAT CHANGED, AND WHY IT MATTERED ──────────────────────────────────────────────────────────
// The old record stored the whole design document as a JSON STRING and answered "has the design
// changed since?" by comparing that string to a fresh serialisation of the current one. It worked,
// and it was wrong in two ways that only show up in a real studio:
//
//   • It was comparing FORMATTING as much as content. Two documents identical in every placement
//     compare unequal if a key order or a float's rendering differs — so the warning could light on
//     a drawing nobody had touched, which is worse than not warning at all, because a designer who
//     learns to ignore the indicator has lost the feature.
//   • The snapshot was the only copy of what was quoted, and it lived in the browser that issued
//     it. "The design changed" could never be followed by "…changed from WHAT".
//
// Now the drawing is sealed in place (lib/studio/actions.ts `sealDocument`) and the quote points at
// it: `documentVersion` is an integer, the comparison is `!==`, and the drawing that was quoted is
// still on disk, still readable, still the thing the client was shown.
//
// ONE ROW PER EVENT, matching what the app does: re-issuing overwrites. The history that matters —
// which drawings were ever issued — lives in the sealed document versions, not in a pile of quotes.
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { issuedQuotes } from "@/lib/db/schema";
import { assertEventOwned } from "@/lib/events/ownership";
import { sealDocument } from "@/lib/studio/actions";
import type { DiscountType } from "@/lib/outputs/quote";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

function assertIdList(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  for (const v of value) assertId(v, `${field}[]`);
}

/** A quote as the screen holds it. `documentVersion` is what replaced the serialised snapshot. */
export interface IssuedQuote {
  issuedAt: number;
  /** The design-document version this quote was produced from, sealed and unchangeable. */
  documentVersion: number;
  discountType: DiscountType;
  discountValue: number;
  /** Rows hidden before showing the client (F-7.1). */
  hiddenVariantIds: string[];
  /** Categories collapsed to a single line (F-7.1). */
  mergedCategoryIds: string[];
  total: number;
}

/** What the caller decides. The version is NOT among them — it is whatever the drawing is when the
 *  quote is issued, decided here, because a quote that could name its own version is a quote that
 *  could claim to match a design it was not made from. */
export interface QuoteInput {
  discountType: DiscountType;
  discountValue: number;
  hiddenVariantIds: string[];
  mergedCategoryIds: string[];
  total: number;
}

/** Postgres `numeric` arrives as a string — arbitrary precision, so the driver will not narrow it
 *  behind your back. These are shekels; a double holds them exactly at any total a quote reaches. */
const toNumber = (v: string | null): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const MONEY_CEILING = 1e9;

function assertMoney(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MONEY_CEILING) {
    throw new Error(`${field} must be an amount`);
  }
}

export async function fetchIssuedQuote(eventId: string): Promise<IssuedQuote | null> {
  assertId(eventId, "eventId");
  const organizationId = await currentOrg();
  const [row] = await db()
    .select()
    .from(issuedQuotes)
    .where(and(eq(issuedQuotes.eventId, eventId), eq(issuedQuotes.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;

  return {
    issuedAt: row.issuedAt.getTime(),
    documentVersion: row.documentVersion,
    discountType: row.discountType,
    discountValue: toNumber(row.discountValue),
    hiddenVariantIds: row.hiddenVariantIds,
    mergedCategoryIds: row.mergedCategoryIds,
    total: toNumber(row.total),
  };
}

/**
 * Issue (or re-issue) the quote for an event.
 *
 * Seals the current drawing first — that is the whole mechanism. From this moment the version the
 * quote names can never be edited, so the client's copy and the studio's agree forever, and the
 * next edit opens a new version whose number no longer matches: the indicator lights, correctly,
 * and only for a real change.
 */
export async function issueQuote(eventId: string, input: QuoteInput): Promise<IssuedQuote> {
  assertId(eventId, "eventId");
  if (!input || typeof input !== "object") throw new Error("quote must be an object");
  if (input.discountType !== "amount" && input.discountType !== "percent") {
    throw new Error("discountType must be amount or percent");
  }
  assertMoney(input.discountValue, "discountValue");
  assertMoney(input.total, "total");
  assertIdList(input.hiddenVariantIds, "hiddenVariantIds");
  // Category ids are the app's own slugs ("tablecloths"), not uuids — see lib/catalog/categories.ts.
  if (!Array.isArray(input.mergedCategoryIds)) throw new Error("mergedCategoryIds must be an array");
  const mergedCategoryIds = input.mergedCategoryIds.map((c) => String(c).slice(0, 64));

  const organizationId = await currentOrg();
  await assertEventOwned(organizationId, eventId);
  const sealed = await sealDocument(eventId);

  const values = {
    designDocumentId: sealed.id,
    documentVersion: sealed.version,
    discountType: input.discountType,
    discountValue: String(input.discountValue),
    hiddenVariantIds: input.hiddenVariantIds,
    mergedCategoryIds,
    total: String(input.total),
    issuedAt: new Date(),
  };

  await db()
    .insert(issuedQuotes)
    .values({ eventId, organizationId, ...values })
    .onConflictDoUpdate({
      target: issuedQuotes.eventId,
      setWhere: eq(issuedQuotes.organizationId, organizationId),
      set: values,
    });

  return (await fetchIssuedQuote(eventId))!;
}
