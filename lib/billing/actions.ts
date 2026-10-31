"use server";
// The billing documents, in Postgres — הזמנה, דרישת תשלום, חשבונית מס, קבלה, חשבונית מס-קבלה,
// חשבונית זיכוי. The rules every write obeys are ./rules.ts; the shape is ./types.ts; the legal frame
// is docs/superpowers/specs/2026-10-30-billing-documents-design.md.
//
// ── THREE THINGS EVERY ISSUE DOES, IN ONE TRANSACTION ──────────────────────────────────────────
//   1. Takes the next number of the kind's series with SELECT … FOR UPDATE (document_counters) —
//      the only way "no gaps, no duplicates" (ניהול ספרים s.18) survives two designers at once. A
//      failed insert rolls the counter back with it; a number is never handed out and then lost.
//   2. COPIES every figure, line, name and address into the row (nothing is recomputed from the
//      quote or the event later) and hashes the frozen text.
//   3. Writes whatever the document means for the event: an order sets `confirmedAt` and keeps the
//      client's legal details; a superseding order marks the old one.
//
// After that the row is frozen by a database trigger (migration 0023): only the allocation
// number, the status stamps and the superseding link may ever change. A mistake is a NEW document.
//
// Same rules as every action module: every export starts with currentOrg()/currentActor(), nothing
// trusts an id it was handed, user-correctable failures return `{ error }`.
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor, currentOrg } from "@/lib/db/org";
import { revalidateBilling } from "@/lib/db/revalidate";
import { billingDocuments, documentCounters, events, issuedQuotes, studioSettings } from "@/lib/db/schema";
import { assertEventOwned } from "@/lib/events/ownership";
import { fetchEvent } from "@/lib/events/actions";
import type { EventSummary } from "@/lib/events/types";
import { toDocument } from "./db-mapping";
import {
  allocationRequired,
  amountLine,
  cancelRefusal,
  computeTotals,
  creditable,
  eventLedger,
  frozenText,
  kindsFor,
  missingFields,
  money,
  paymentRefusal,
  paymentsOf,
  rateFor,
  receiptKindFor,
  scheduleGap,
  toAgorot,
  validAllocationNumber,
  type EventLedger,
} from "./rules";
import {
  DOCUMENT_KINDS,
  PAYMENT_MEANS,
  type AllocationStatus,
  type BillingDocument,
  type DocumentCredit,
  type DocumentCustomer,
  type DocumentKind,
  type DocumentLine,
  type DocumentPayment,
  type DocumentTotals,
  type ScheduleItem,
  type VatStatus,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? money(v) : 0);
const today = (): string => new Date().toISOString().slice(0, 10);
const day = (v: unknown): string => (typeof v === "string" && ISO_DATE.test(v) ? v : today());

/** Everything in the studio's settings a document needs, read once per write. */
interface Basis {
  vatStatus: VatStatus;
  vatRate: number;
  pricesIncludeVat: boolean;
  currency: string;
  bankDetails: string;
}

async function basisOf(organizationId: string): Promise<Basis> {
  const [row] = await db()
    .select({
      vatStatus: studioSettings.vatStatus,
      vatRate: studioSettings.vatRate,
      pricesIncludeVat: studioSettings.pricesIncludeVat,
      currency: studioSettings.currency,
      bankDetails: studioSettings.bankDetails,
    })
    .from(studioSettings)
    .where(eq(studioSettings.organizationId, organizationId))
    .limit(1);
  const rate = Number(row?.vatRate);
  return {
    vatStatus: row?.vatStatus ?? "licensed",
    vatRate: Number.isFinite(rate) ? rate : 0.18,
    pricesIncludeVat: row?.pricesIncludeVat ?? true,
    currency: row?.currency ?? "₪",
    bankDetails: row?.bankDetails ?? "",
  };
}

function cleanCustomer(v: unknown): DocumentCustomer {
  const c = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    name: str(c.name, 200),
    address: str(c.address, 300),
    number: str(c.number, 40) || undefined,
    phone: str(c.phone, 40) || undefined,
    email: str(c.email, 120) || undefined,
  };
}

function cleanLines(v: unknown): DocumentLine[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 200)
    .map((x, i): DocumentLine | null => {
      const l = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
      const label = str(l.label, 200);
      if (!label) return null;
      const quantity = typeof l.quantity === "number" && Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1;
      const unitPrice = num(l.unitPrice);
      const total = typeof l.total === "number" ? num(l.total) : money(unitPrice * quantity);
      return {
        key: str(l.key, 60) || `line-${i}`,
        label,
        quantity,
        unit: l.unit === "m" || l.unit === "m2" ? l.unit : "unit",
        unitPrice,
        total,
        gift: l.gift === true || undefined,
      };
    })
    .filter((l): l is DocumentLine => !!l);
}

function cleanSchedule(v: unknown): ScheduleItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 24)
    .map((x, i): ScheduleItem | null => {
      const s = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
      const amount = num(s.amount);
      if (!(amount > 0)) return null;
      return { id: str(s.id, 40) || `s${i}`, label: str(s.label, 80) || `תשלום ${i + 1}`, amount, dueDate: day(s.dueDate) };
    })
    .filter((s): s is ScheduleItem => !!s);
}

function cleanPayment(v: unknown): DocumentPayment | null {
  const p = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  if (!p) return null;
  const means = PAYMENT_MEANS.includes(p.means as never) ? (p.means as DocumentPayment["means"]) : "transfer";
  const opt = (k: string, max = 60) => str(p[k], max) || undefined;
  return {
    means,
    amount: num(p.amount),
    date: day(p.date),
    bank: opt("bank"),
    branch: opt("branch", 20),
    account: opt("account", 30),
    chequeNumber: opt("chequeNumber", 30),
    chequeDate: typeof p.chequeDate === "string" && ISO_DATE.test(p.chequeDate) ? p.chequeDate : undefined,
    cardType: opt("cardType", 30),
    last4: opt("last4", 4),
    reference: opt("reference", 80),
    scheduleItemId: opt("scheduleItemId", 40),
  };
}

/** The next number of a series, taken under a row lock inside the caller's transaction. */
type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

async function takeNumber(tx: Tx, organizationId: string, series: string): Promise<number> {
  await tx.insert(documentCounters).values({ organizationId, series, next: 1 }).onConflictDoNothing();
  const [row] = await tx
    .select({ next: documentCounters.next })
    .from(documentCounters)
    .where(and(eq(documentCounters.organizationId, organizationId), eq(documentCounters.series, series)))
    .for("update");
  const number = row!.next;
  await tx
    .update(documentCounters)
    .set({ next: number + 1 })
    .where(and(eq(documentCounters.organizationId, organizationId), eq(documentCounters.series, series)));
  return number;
}

/** What every issue has in common, from the allocation question onward. Called INSIDE the
 *  transaction that decided the document's content; the number is the last thing taken. */
interface Draft {
  eventId: string;
  kind: DocumentKind;
  documentDate: string;
  followsId?: string;
  designDocumentId?: string;
  documentVersion?: number;
  customer: DocumentCustomer;
  lines: DocumentLine[];
  totals: DocumentTotals;
  schedule?: ScheduleItem[];
  payment?: DocumentPayment;
  credit?: DocumentCredit;
  allocationNumber?: string;
  note: string;
}

async function insertDocument(tx: Tx, organizationId: string, issuedBy: string | null, d: Draft): Promise<BillingDocument> {
  const series = d.kind;
  const number = await takeNumber(tx, organizationId, series);
  const issuedAt = new Date();
  const required = allocationRequired(d.kind, d.totals.net, d.documentDate);
  const typed = d.allocationNumber && validAllocationNumber(d.allocationNumber) ? d.allocationNumber.trim() : undefined;
  const allocationStatus: AllocationStatus = typed ? "manual" : required ? "pending" : "n/a";
  const frozen = frozenText({
    eventId: d.eventId,
    kind: d.kind,
    series,
    number,
    issuedAt: issuedAt.getTime(),
    documentDate: d.documentDate,
    followsId: d.followsId,
    documentVersion: d.documentVersion,
    customer: d.customer,
    lines: d.lines,
    totals: d.totals,
    schedule: d.schedule,
    payment: d.payment,
    credit: d.credit,
    note: d.note,
  });
  const [row] = await tx
    .insert(billingDocuments)
    .values({
      organizationId,
      eventId: d.eventId,
      kind: d.kind,
      series,
      number,
      status: "issued",
      issuedAt,
      issuedBy,
      documentDate: d.documentDate,
      followsId: d.followsId ?? null,
      designDocumentId: d.designDocumentId ?? null,
      documentVersion: d.documentVersion ?? null,
      customer: d.customer,
      lines: d.lines,
      totals: d.totals,
      schedule: d.schedule ?? null,
      payment: d.payment ?? null,
      credit: d.credit ?? null,
      allocationNumber: typed ?? null,
      allocationStatus,
      note: d.note,
      contentHash: createHash("sha256").update(frozen).digest("hex"),
    })
    .returning();
  return toDocument(row);
}

async function documentsOf(organizationId: string, eventId: string): Promise<BillingDocument[]> {
  const rows = await db()
    .select()
    .from(billingDocuments)
    .where(and(eq(billingDocuments.organizationId, organizationId), eq(billingDocuments.eventId, eventId)))
    .orderBy(asc(billingDocuments.issuedAt));
  return rows.map(toDocument);
}

async function ownedDocument(organizationId: string, id: string): Promise<BillingDocument> {
  assertId(id, "id");
  const [row] = await db()
    .select()
    .from(billingDocuments)
    .where(and(eq(billingDocuments.id, id), eq(billingDocuments.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new Error("document not found");
  return toDocument(row);
}

// ── Reads ──────────────────────────────────────────────────────────────────────────────────────

export interface EventBilling {
  documents: BillingDocument[];
  ledger: EventLedger;
  /** The issued quote, when one went out — what an order is made from. */
  quote: { total: number; issuedAt: number; documentVersion: number; reference: string; extras: { label: string; price: number }[]; eventType?: string } | null;
  basis: Basis;
  today: string;
}

/** Everything the event drawer's billing section shows, in one call. */
export async function fetchEventBilling(eventId: string): Promise<EventBilling> {
  assertId(eventId, "eventId");
  const organizationId = await currentOrg();
  const [documents, basis, quoteRow, event] = await Promise.all([
    documentsOf(organizationId, eventId),
    basisOf(organizationId),
    db()
      .select({ total: issuedQuotes.total, issuedAt: issuedQuotes.issuedAt, documentVersion: issuedQuotes.documentVersion, layout: issuedQuotes.layout })
      .from(issuedQuotes)
      .where(and(eq(issuedQuotes.eventId, eventId), eq(issuedQuotes.organizationId, organizationId)))
      .limit(1)
      .then((r) => r[0]),
    fetchEvent(eventId),
  ]);
  const now = today();
  return {
    documents,
    ledger: eventLedger(documents, now),
    quote: quoteRow
      ? {
          total: Number(quoteRow.total) || 0,
          issuedAt: quoteRow.issuedAt.getTime(),
          documentVersion: quoteRow.documentVersion,
          reference: `${eventId.slice(0, 6).toUpperCase()}-${quoteRow.documentVersion}`,
          extras: (quoteRow.layout?.extras ?? []).filter((e) => e.label.trim()).map((e) => ({ label: e.label.trim(), price: e.price })),
          eventType: event?.eventType,
        }
      : null,
    basis,
    today: now,
  };
}

export interface DocumentView {
  document: BillingDocument;
  event: Pick<EventSummary, "id" | "clientName" | "date" | "eventType" | "zonesLabel" | "venueId">;
  /** The invoice a credit note or receipt follows, for its number on the page. */
  follows?: Pick<BillingDocument, "id" | "kind" | "number" | "documentDate" | "allocationNumber">;
  /** Credits taken against this invoice, for what is left to credit. */
  credits: BillingDocument[];
  bankDetails: string;
  today: string;
}

/** One document with what its page prints beside it. */
export async function fetchDocument(id: string): Promise<DocumentView | null> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  const [row] = await db()
    .select()
    .from(billingDocuments)
    .where(and(eq(billingDocuments.id, id), eq(billingDocuments.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  const document = toDocument(row);
  const [event, follows, creditRows, basis] = await Promise.all([
    fetchEvent(document.eventId),
    document.followsId ? ownedDocument(organizationId, document.followsId).catch(() => undefined) : Promise.resolve(undefined),
    db()
      .select()
      .from(billingDocuments)
      .where(and(eq(billingDocuments.organizationId, organizationId), eq(billingDocuments.followsId, id), eq(billingDocuments.kind, "credit"))),
    basisOf(organizationId),
  ]);
  if (!event) return null;
  return {
    document,
    event: { id: event.id, clientName: event.clientName, date: event.date, eventType: event.eventType, zonesLabel: event.zonesLabel, venueId: event.venueId },
    follows: follows ? { id: follows.id, kind: follows.kind, number: follows.number, documentDate: follows.documentDate, allocationNumber: follows.allocationNumber } : undefined,
    credits: creditRows.map(toDocument),
    bankDetails: basis.bankDetails,
    today: today(),
  };
}

export interface LedgerRow extends BillingDocument {
  clientName: string;
}

export interface Ledger {
  /** "yyyy-mm" */
  month: string;
  rows: LedgerRow[];
  totals: { count: number; net: number; vat: number; gross: number; received: number };
  /** Issued fiscal documents whose original has not been produced, and invoices awaiting an
   *  allocation number — the two things the accountant will ask about. */
  unsent: number;
  pendingAllocation: number;
}

/** The studio's documents over one month, newest first, with the month's totals. */
export async function fetchLedger(month?: string): Promise<Ledger> {
  const actor = await currentActor();
  if (actor.role === "crew") throw new Error("not allowed");
  const m = typeof month === "string" && /^\d{4}-\d{2}$/.test(month) ? month : today().slice(0, 7);
  const from = `${m}-01`;
  const [y, mo] = m.split("-").map(Number);
  const to = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const rows = await db()
    .select({ doc: billingDocuments, clientName: events.clientName })
    .from(billingDocuments)
    .innerJoin(events, eq(events.id, billingDocuments.eventId))
    .where(and(eq(billingDocuments.organizationId, actor.organizationId), gte(billingDocuments.documentDate, from), lte(billingDocuments.documentDate, to)))
    .orderBy(desc(billingDocuments.documentDate), desc(billingDocuments.issuedAt));
  const list: LedgerRow[] = rows.map((r) => ({ ...toDocument(r.doc), clientName: r.clientName }));
  const live = list.filter((d) => d.status !== "cancelled" && d.status !== "superseded");
  const fiscal = live.filter((d) => d.kind === "tax_invoice" || d.kind === "tax_invoice_receipt" || d.kind === "credit");
  const sign = (d: BillingDocument) => (d.kind === "credit" ? -1 : 1);
  const sum = (f: (d: BillingDocument) => number) => fiscal.reduce((n, d) => n + sign(d) * toAgorot(f(d)), 0) / 100;
  const received = paymentsOf(live).reduce((n, p) => n + toAgorot(p.amount), 0) / 100;
  return {
    month: m,
    rows: list,
    totals: { count: live.length, net: sum((d) => d.totals.net), vat: sum((d) => d.totals.vat), gross: sum((d) => d.totals.gross), received },
    unsent: live.filter((d) => (d.kind === "tax_invoice" || d.kind === "tax_invoice_receipt" || d.kind === "receipt" || d.kind === "credit") && !d.originalAt && !d.sentAt).length,
    pendingAllocation: live.filter((d) => d.allocationStatus === "pending").length,
  };
}

export interface SeriesCounter {
  series: DocumentKind;
  next: number;
  /** A document exists in this series, so the next number can no longer be chosen. */
  used: boolean;
}

export async function fetchCounters(): Promise<SeriesCounter[]> {
  const organizationId = await currentOrg();
  const [rows, used] = await Promise.all([
    db().select().from(documentCounters).where(eq(documentCounters.organizationId, organizationId)),
    db()
      .selectDistinct({ series: billingDocuments.series })
      .from(billingDocuments)
      .where(eq(billingDocuments.organizationId, organizationId)),
  ]);
  const next = new Map(rows.map((r) => [r.series, r.next]));
  const taken = new Set(used.map((u) => u.series));
  return DOCUMENT_KINDS.map((series) => ({ series, next: next.get(series) ?? 1, used: taken.has(series) }));
}

/** Where a series starts — a studio moving from another program continues its own sequence.
 *  Allowed only while the series has no document: after that the counter is the law's. */
export async function setCounterStart(series: DocumentKind, next: number): Promise<SeriesCounter[] | { error: string }> {
  const organizationId = await currentOrg();
  if (!DOCUMENT_KINDS.includes(series)) throw new Error("unknown series");
  const n = Math.round(Number(next));
  if (!Number.isFinite(n) || n < 1 || n > 99_999_999) return { error: "מספר התחלה לא תקין" };
  const [used] = await db()
    .select({ id: billingDocuments.id })
    .from(billingDocuments)
    .where(and(eq(billingDocuments.organizationId, organizationId), eq(billingDocuments.series, series)))
    .limit(1);
  if (used) return { error: "כבר הופקו מסמכים בסדרה הזו — המספור ממשיך מעצמו" };
  await db()
    .insert(documentCounters)
    .values({ organizationId, series, next: n })
    .onConflictDoUpdate({ target: [documentCounters.organizationId, documentCounters.series], set: { next: n } });
  revalidateBilling();
  return fetchCounters();
}

// ── Writes ─────────────────────────────────────────────────────────────────────────────────────

export interface OrderInput {
  customer: DocumentCustomer;
  /** GROSS amounts — what the client pays, as the quote's total is — whatever the catalog's basis. */
  lines: DocumentLine[];
  schedule: ScheduleItem[];
  note?: string;
  documentDate?: string;
}

/**
 * The client's yes, written down: an הזמנה over the issued quote.
 *
 * A designer's order needs a quote to have gone out (the order seals the drawing version the quote
 * names, which is how "העיצוב השתנה מאז ההזמנה" stays an integer comparison). A VENUE's does not: it
 * sells a menu package, not a drawing, and its order is written from the package figure
 * (lib/hosting packageLines) with no drawing version to seal. Sets `events.confirmedAt` the way
 * confirmEvent does (COALESCE — a second order must not move the day the client said yes), keeps
 * the client's legal details on the event, and marks the previous live order superseded.
 */
export async function issueOrder(eventId: string, input: OrderInput): Promise<BillingDocument | { error: string }> {
  assertId(eventId, "eventId");
  if (!input || typeof input !== "object") throw new Error("order must be an object");
  const actor = await currentActor();
  const organizationId = actor.organizationId;
  await assertEventOwned(organizationId, eventId);

  const [quote] = await db()
    .select({ designDocumentId: issuedQuotes.designDocumentId, documentVersion: issuedQuotes.documentVersion })
    .from(issuedQuotes)
    .where(and(eq(issuedQuotes.eventId, eventId), eq(issuedQuotes.organizationId, organizationId)))
    .limit(1);
  if (!quote && actor.organizationKind !== "venue") return { error: "אי אפשר להפיק הזמנה לפני שנשלחה הצעת מחיר." };

  const basis = await basisOf(organizationId);
  const customer = cleanCustomer(input.customer);
  const lines = cleanLines(input.lines);
  // Every document types GROSS amounts: the quote's total is what the client pays, and an order that
  // re-read it in the catalog's basis would add VAT to a price that already carries it.
  const totals = computeTotals(lines, { vatRate: rateFor(basis.vatStatus, basis.vatRate), pricesIncludeVat: true, currency: basis.currency });
  const schedule = cleanSchedule(input.schedule);
  const draft: Draft = {
    eventId,
    kind: "order",
    documentDate: day(input.documentDate),
    designDocumentId: quote?.designDocumentId ?? undefined,
    documentVersion: quote?.documentVersion,
    customer,
    lines,
    totals,
    schedule,
    note: str(input.note, 1000),
  };
  const missing = missingFields(draft);
  if (missing.length) return { error: `חסר בהזמנה: ${missing.join(", ")}` };
  if (!(totals.gross > 0)) return { error: "סכום ההזמנה חייב להיות חיובי" };
  const gap = scheduleGap(schedule, totals.gross);
  if (Math.abs(gap) > 0.005) return { error: `לוח התשלומים לא מסתכם לסכום ההזמנה (הפרש ${gap.toLocaleString("he-IL")} ₪)` };

  const previous = (await documentsOf(organizationId, eventId)).filter((d) => d.kind === "order" && d.status !== "cancelled" && d.status !== "superseded");
  const doc = await db().transaction(async (tx) => {
    const created = await insertDocument(tx, organizationId, actor.userId, { ...draft, followsId: previous[0]?.id });
    for (const p of previous) {
      await tx
        .update(billingDocuments)
        .set({ status: "superseded", supersededById: created.id })
        .where(and(eq(billingDocuments.id, p.id), eq(billingDocuments.organizationId, organizationId)));
    }
    await tx
      .update(events)
      .set({
        confirmedAt: sql`coalesce(${events.confirmedAt}, now())`,
        lostAt: null,
        billingName: customer.name,
        billingAddress: customer.address,
        billingNumber: customer.number ?? null,
      })
      .where(and(eq(events.id, eventId), eq(events.organizationId, organizationId)));
    return created;
  });
  revalidateBilling();
  return doc;
}

export interface PaymentInput {
  payment: DocumentPayment;
  /** What it is for, printed: "מקדמה", "יתרה". */
  label?: string;
  /** A tax invoice issued earlier that this payment settles — the document is then a plain receipt. */
  againstInvoiceId?: string;
  allocationNumber?: string;
  note?: string;
  documentDate?: string;
}

/**
 * Money arrived: a חשבונית מס-קבלה (a VAT-registered studio paid now), or a קבלה (an exempt
 * studio, or a payment on an invoice issued earlier). The means and its details are what
 * ניהול ספרים s.5 asks a receipt to record; the cash law is applied at the door.
 */
export async function recordPayment(eventId: string, input: PaymentInput): Promise<BillingDocument | { error: string }> {
  assertId(eventId, "eventId");
  if (!input || typeof input !== "object") throw new Error("payment must be an object");
  const actor = await currentActor();
  const organizationId = actor.organizationId;
  await assertEventOwned(organizationId, eventId);
  const payment = cleanPayment(input.payment);
  if (!payment) return { error: "חסרים פרטי התשלום" };

  const [basis, docs, event] = await Promise.all([basisOf(organizationId), documentsOf(organizationId, eventId), fetchEvent(eventId)]);
  if (!event) throw new Error("event not found");
  const ledger = eventLedger(docs, today());
  const transaction = ledger.order?.totals.gross ?? payment.amount;
  const cashSoFar = paymentsOf(docs).filter((p) => p.means === "cash").reduce((n, p) => n + p.amount, 0);
  const refusal = paymentRefusal(payment, transaction, cashSoFar);
  if (refusal) return { error: refusal };

  let against: BillingDocument | undefined;
  if (input.againstInvoiceId) {
    assertId(input.againstInvoiceId, "againstInvoiceId");
    against = docs.find((d) => d.id === input.againstInvoiceId && d.kind === "tax_invoice" && d.status !== "cancelled");
    if (!against) return { error: "החשבונית שצוינה לא נמצאה" };
  }
  const kind = receiptKindFor(basis.vatStatus, !!against);
  if (!kindsFor(basis.vatStatus).includes(kind)) return { error: "סוג המסמך אינו זמין לעסק הזה" };
  const rate = kind === "receipt" ? 0 : rateFor(basis.vatStatus, basis.vatRate);
  const label = str(input.label, 120) || (ledger.order ? `תשלום על חשבון הזמנה ${ledger.order.number}` : "תשלום");
  const line = amountLine(label, payment.amount, "payment");
  const customer: DocumentCustomer = {
    name: ledger.order?.customer.name || event.billingName || event.clientName,
    address: ledger.order?.customer.address || event.billingAddress || "",
    number: ledger.order?.customer.number || event.billingNumber || undefined,
    phone: event.phone || undefined,
  };
  const draft: Draft = {
    eventId,
    kind,
    documentDate: day(input.documentDate ?? payment.date),
    followsId: against?.id ?? ledger.order?.id,
    customer,
    lines: [line],
    totals: computeTotals([line], { vatRate: rate, pricesIncludeVat: true, currency: basis.currency }),
    payment,
    allocationNumber: str(input.allocationNumber, 12) || undefined,
    note: str(input.note, 1000),
  };
  const missing = missingFields(draft);
  if (missing.length) return { error: `חסר בקבלה: ${missing.join(", ")}` };

  const doc = await db().transaction((tx) => insertDocument(tx, organizationId, actor.userId, draft));
  revalidateBilling();
  return doc;
}

export interface InvoiceInput {
  amount: number;
  label?: string;
  scheduleItemId?: string;
  allocationNumber?: string;
  note?: string;
  documentDate?: string;
}

/** A חשבונית מס to be paid later — a business client on terms. A receipt follows when the money
 *  arrives (recordPayment with `againstInvoiceId`). Not offered to an exempt studio. */
export async function issueInvoice(eventId: string, input: InvoiceInput): Promise<BillingDocument | { error: string }> {
  assertId(eventId, "eventId");
  if (!input || typeof input !== "object") throw new Error("invoice must be an object");
  const actor = await currentActor();
  const organizationId = actor.organizationId;
  await assertEventOwned(organizationId, eventId);
  const [basis, docs, event] = await Promise.all([basisOf(organizationId), documentsOf(organizationId, eventId), fetchEvent(eventId)]);
  if (!event) throw new Error("event not found");
  if (!kindsFor(basis.vatStatus).includes("tax_invoice")) return { error: "עוסק פטור אינו מפיק חשבונית מס — הפיקו קבלה" };
  const amount = num(input.amount);
  if (!(amount > 0)) return { error: "סכום החשבונית חייב להיות חיובי" };
  const order = eventLedger(docs, today()).order;
  const label = str(input.label, 120) || (order ? `על חשבון הזמנה ${order.number}` : "עיצוב האירוע");
  const line = amountLine(label, amount, "invoice");
  const draft: Draft = {
    eventId,
    kind: "tax_invoice",
    documentDate: day(input.documentDate),
    followsId: order?.id,
    customer: {
      name: order?.customer.name || event.billingName || event.clientName,
      address: order?.customer.address || event.billingAddress || "",
      number: order?.customer.number || event.billingNumber || undefined,
      phone: event.phone || undefined,
    },
    lines: [line],
    totals: computeTotals([line], { vatRate: rateFor(basis.vatStatus, basis.vatRate), pricesIncludeVat: true, currency: basis.currency }),
    allocationNumber: str(input.allocationNumber, 12) || undefined,
    note: str(input.note, 1000),
  };
  const missing = missingFields(draft);
  if (missing.length) return { error: `חסר בחשבונית: ${missing.join(", ")}` };
  const doc = await db().transaction((tx) => insertDocument(tx, organizationId, actor.userId, draft));
  revalidateBilling();
  return doc;
}

export interface RequestInput {
  amount: number;
  label?: string;
  dueDate: string;
  scheduleItemId?: string;
  note?: string;
}

/** A דרישת תשלום for one installment — not fiscal, carries the bank details, titled so it can
 *  never be mistaken for an invoice. */
export async function issuePaymentRequest(eventId: string, input: RequestInput): Promise<BillingDocument | { error: string }> {
  assertId(eventId, "eventId");
  if (!input || typeof input !== "object") throw new Error("request must be an object");
  const actor = await currentActor();
  const organizationId = actor.organizationId;
  await assertEventOwned(organizationId, eventId);
  const [basis, docs, event] = await Promise.all([basisOf(organizationId), documentsOf(organizationId, eventId), fetchEvent(eventId)]);
  if (!event) throw new Error("event not found");
  const amount = num(input.amount);
  if (!(amount > 0)) return { error: "סכום הדרישה חייב להיות חיובי" };
  const order = eventLedger(docs, today()).order;
  const label = str(input.label, 120) || "תשלום";
  const line = amountLine(label, amount, "request");
  const dueDate = day(input.dueDate);
  const draft: Draft = {
    eventId,
    kind: "payment_request",
    documentDate: today(),
    followsId: order?.id,
    customer: {
      name: order?.customer.name || event.billingName || event.clientName,
      address: order?.customer.address || event.billingAddress || "",
      number: order?.customer.number || event.billingNumber || undefined,
      phone: event.phone || undefined,
    },
    lines: [line],
    totals: computeTotals([line], { vatRate: rateFor(basis.vatStatus, basis.vatRate), pricesIncludeVat: true, currency: basis.currency }),
    schedule: [{ id: str(input.scheduleItemId, 40) || "due", label, amount, dueDate }],
    note: str(input.note, 1000),
  };
  const doc = await db().transaction((tx) => insertDocument(tx, organizationId, actor.userId, draft));
  revalidateBilling();
  return doc;
}

export interface CreditInput {
  /** Gross to reverse; absent = everything still creditable. */
  amount?: number;
  reason: string;
  refund?: DocumentPayment;
  documentDate?: string;
  note?: string;
}

/** A חשבונית זיכוי against an invoice (or an invoice-receipt): the invoice's number, date and
 *  allocation number printed, the reason required (ניהול ספרים s.9(ה)), the refund recorded
 *  when money went back. */
export async function creditDocument(invoiceId: string, input: CreditInput): Promise<BillingDocument | { error: string }> {
  if (!input || typeof input !== "object") throw new Error("credit must be an object");
  const actor = await currentActor();
  const organizationId = actor.organizationId;
  const invoice = await ownedDocument(organizationId, invoiceId);
  if (invoice.kind !== "tax_invoice" && invoice.kind !== "tax_invoice_receipt" && invoice.kind !== "receipt") return { error: "אפשר לזכות רק חשבונית או קבלה" };
  if (invoice.status === "cancelled") return { error: "החשבונית מבוטלת" };
  const basis = await basisOf(organizationId);
  const docs = await documentsOf(organizationId, invoice.eventId);
  const left = creditable(invoice, docs);
  const amount = input.amount === undefined ? left : num(input.amount);
  if (!(amount > 0)) return { error: "סכום הזיכוי חייב להיות חיובי" };
  if (amount > left + 0.005) return { error: `אפשר לזכות עד ${left.toLocaleString("he-IL")} ₪ מהחשבונית הזו` };
  const refund = input.refund ? cleanPayment(input.refund) : null;
  if (refund && refund.amount > amount + 0.005) return { error: "ההחזר גדול מסכום הזיכוי" };
  const line = amountLine(`זיכוי על ${invoice.kind === "receipt" ? "קבלה" : "חשבונית"} ${invoice.number}`, amount, "credit");
  const draft: Draft = {
    eventId: invoice.eventId,
    kind: "credit",
    documentDate: day(input.documentDate),
    followsId: invoice.id,
    customer: invoice.customer,
    lines: [line],
    totals: computeTotals([line], { vatRate: invoice.totals.vatRate, pricesIncludeVat: true, currency: basis.currency }),
    credit: {
      reason: str(input.reason, 300),
      againstNumber: String(invoice.number),
      againstDate: invoice.documentDate,
      againstAllocation: invoice.allocationNumber,
      refund: refund ?? undefined,
    },
    note: str(input.note, 1000),
  };
  const missing = missingFields(draft);
  if (missing.length) return { error: `חסר בזיכוי: ${missing.join(", ")}` };
  const doc = await db().transaction((tx) => insertDocument(tx, organizationId, actor.userId, draft));
  revalidateBilling();
  return doc;
}

/** מבוטל — in place, number kept, under the narrow rule in rules.ts cancelRefusal. */
export async function cancelDocument(id: string, reason: string): Promise<BillingDocument | { error: string }> {
  const organizationId = await currentOrg();
  const doc = await ownedDocument(organizationId, id);
  const refusal = cancelRefusal(doc, today());
  if (refusal) return { error: refusal };
  const [row] = await db()
    .update(billingDocuments)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: str(reason, 300) || null })
    .where(and(eq(billingDocuments.id, id), eq(billingDocuments.organizationId, organizationId)))
    .returning();
  revalidateBilling();
  return toDocument(row);
}

/** The ORIGINAL is being produced — printed as מקור or shared as the file. Once, ever: after this
 *  every print says העתק and the document can no longer be cancelled in place. */
export async function markOriginal(id: string): Promise<BillingDocument> {
  const organizationId = await currentOrg();
  const doc = await ownedDocument(organizationId, id);
  if (doc.originalAt) return doc;
  const [row] = await db()
    .update(billingDocuments)
    .set({ originalAt: new Date() })
    .where(and(eq(billingDocuments.id, id), eq(billingDocuments.organizationId, organizationId)))
    .returning();
  return toDocument(row);
}

/** The document left the studio — by hand, WhatsApp or mail — and to whom. */
export async function markSent(id: string, to: string): Promise<BillingDocument> {
  const organizationId = await currentOrg();
  const doc = await ownedDocument(organizationId, id);
  const [row] = await db()
    .update(billingDocuments)
    .set({
      sentAt: new Date(),
      sentTo: str(to, 120) || null,
      status: doc.status === "issued" ? "sent" : doc.status,
      originalAt: doc.originalAt ? new Date(doc.originalAt) : new Date(),
    })
    .where(and(eq(billingDocuments.id, id), eq(billingDocuments.organizationId, organizationId)))
    .returning();
  revalidateBilling();
  return toDocument(row);
}

/** The allocation number, typed off the Tax Authority's site (חשבוניות ישראל) — nine digits. The
 *  API that obtains it automatically is a later phase; the field is the law's today. */
export async function setAllocationNumber(id: string, value: string): Promise<BillingDocument | { error: string }> {
  const organizationId = await currentOrg();
  const doc = await ownedDocument(organizationId, id);
  const v = str(value, 12);
  if (!validAllocationNumber(v)) return { error: "מספר הקצאה הוא תשע ספרות" };
  if (doc.allocationNumber) return { error: "כבר נרשם מספר הקצאה למסמך" };
  const [row] = await db()
    .update(billingDocuments)
    .set({ allocationNumber: v, allocationStatus: "manual" })
    .where(and(eq(billingDocuments.id, id), eq(billingDocuments.organizationId, organizationId)))
    .returning();
  revalidateBilling();
  return toDocument(row);
}
