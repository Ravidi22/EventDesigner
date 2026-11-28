// The rules a billing document is made under — PURE, no I/O, self-checked (npm run check:billing).
//
// Everything the Israeli bookkeeping regulations decide about a document is a function here, so the
// server action that stores one (./actions.ts), the dialogs that make one and the printed page all
// agree, and so the rules can be asserted under plain node. The legal frame each function answers
// to is in docs/superpowers/specs/2026-10-30-billing-documents-design.md §1.
//
// MONEY IS INTEGER AGOROT INSIDE THIS FILE. A quote's figures are doubles rounded to two places,
// which is fine for a sum shown once; a VAT split that must add up to the gross on a document an
// accountant files cannot be left to floating point. Every function takes and returns shekels with
// two decimals, and does its arithmetic on whole agorot in between.
import {
  carriesVat,
  isFiscal,
  recordsPayment,
  type BillingDocument,
  type DocumentKind,
  type DocumentLine,
  type DocumentPayment,
  type DocumentTotals,
  type ScheduleItem,
  type VatStatus,
} from "./types";

// ── Money ──────────────────────────────────────────────────────────────────────────────────────

/** Shekels → whole agorot, half up. */
export const toAgorot = (n: number): number => Math.round((n + Number.EPSILON) * 100);
export const fromAgorot = (a: number): number => a / 100;
/** Two decimals, the way a stored amount is kept. */
export const money = (n: number): number => fromAgorot(toAgorot(n));

// ── Which documents a studio may issue ─────────────────────────────────────────────────────────

/** A עוסק פטור may not print the words "חשבונית מס" — its sales carry no VAT and its receipts are
 *  the fiscal record. Everyone else issues the whole set. */
export function kindsFor(status: VatStatus): DocumentKind[] {
  return status === "exempt"
    ? ["order", "payment_request", "receipt"]
    : ["order", "payment_request", "tax_invoice", "receipt", "tax_invoice_receipt", "credit"];
}

/** The document a payment produces by default: the combined invoice-receipt for a VAT-registered
 *  studio paid on the spot, a plain receipt for an exempt one — or for a payment against an
 *  invoice issued earlier, which already carried the VAT. */
export function receiptKindFor(status: VatStatus, againstInvoice: boolean): DocumentKind {
  if (status === "exempt" || againstInvoice) return "receipt";
  return "tax_invoice_receipt";
}

/** The VAT rate a document of this kind is issued at: an exempt studio's documents carry none
 *  whatever the settings say. */
export function rateFor(status: VatStatus, vatRate: number): number {
  return status === "exempt" ? 0 : Math.max(0, vatRate);
}

// ── Totals ─────────────────────────────────────────────────────────────────────────────────────

export interface TotalsOpts {
  vatRate: number;
  /** The line amounts were typed INCLUDING VAT (the studio's price basis). */
  pricesIncludeVat: boolean;
  discount?: number;
  currency?: string;
}

/** The figures, from the lines. Gifts add nothing. The VAT split is done in agorot so that
 *  net + vat === gross exactly, whichever way the amounts were typed. */
export function computeTotals(lines: DocumentLine[], opts: TotalsOpts): DocumentTotals {
  const r = Math.max(0, opts.vatRate);
  const before = lines.reduce((n, l) => n + (l.gift ? 0 : toAgorot(l.total)), 0);
  const discount = Math.min(before, Math.max(0, toAgorot(opts.discount ?? 0)));
  const after = before - discount;
  let net: number;
  let vat: number;
  let gross: number;
  if (opts.pricesIncludeVat) {
    gross = after;
    net = Math.round(gross / (1 + r));
    vat = gross - net;
  } else {
    net = after;
    vat = Math.round(net * r);
    gross = net + vat;
  }
  return {
    beforeDiscount: fromAgorot(before),
    discount: fromAgorot(discount),
    net: fromAgorot(net),
    vatRate: r,
    vat: fromAgorot(vat),
    gross: fromAgorot(gross),
    currency: opts.currency ?? "₪",
    pricesIncludeVat: opts.pricesIncludeVat,
  };
}

/** One line for a typed amount — a payment, a request, a credit by sum. The amount is GROSS (what
 *  the client pays), so the line is marked as including VAT whatever the studio's catalog basis. */
export function amountLine(label: string, gross: number, key = "amount"): DocumentLine {
  const total = money(gross);
  return { key, label, quantity: 1, unit: "unit", unitPrice: total, total };
}

/** Totals for a document that is one typed gross amount. */
export function amountTotals(gross: number, vatRate: number, currency?: string): DocumentTotals {
  return computeTotals([amountLine("", gross)], { vatRate, pricesIncludeVat: true, currency });
}

// ── The payment schedule ───────────────────────────────────────────────────────────────────────

export const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T12:00:00`).getTime() - new Date(`${fromIso}T12:00:00`).getTime()) / DAY_MS);
}

/** The schedule an order starts with: half now, the rest a week before the event (the clause the
 *  settings screen suggests as a term). An event with no date, or one closer than a week, puts the
 *  rest on the same day. The designer edits it before issuing. */
export function defaultSchedule(gross: number, eventDate: string | undefined, today: string): ScheduleItem[] {
  const total = toAgorot(gross);
  const deposit = Math.round(total / 2);
  let rest = eventDate ? addDays(eventDate, -7) : today;
  if (rest < today) rest = today;
  return [
    { id: "deposit", label: "מקדמה", amount: fromAgorot(deposit), dueDate: today },
    { id: "rest", label: "יתרה", amount: fromAgorot(total - deposit), dueDate: rest },
  ];
}

/** gross − the schedule's sum. Zero when the installments add up, which an order requires. */
export function scheduleGap(schedule: ScheduleItem[], gross: number): number {
  return fromAgorot(toAgorot(gross) - schedule.reduce((n, s) => n + toAgorot(s.amount), 0));
}

export type InstallmentState = "paid" | "partial" | "due" | "late";

export interface Installment extends ScheduleItem {
  paid: number;
  state: InstallmentState;
}

/** Each installment with what has been received against it. A payment that names an installment
 *  goes there; the rest fill the schedule in order, earliest first — so a client who pays "15,000"
 *  with no label is read as the deposit and part of the next, not as a payment nobody can place.
 *  Late = due before today and not fully paid. */
export function installments(schedule: ScheduleItem[], payments: DocumentPayment[], today: string): Installment[] {
  const paid = new Map<string, number>(schedule.map((s) => [s.id, 0]));
  let loose = 0;
  for (const p of payments) {
    if (p.scheduleItemId && paid.has(p.scheduleItemId)) paid.set(p.scheduleItemId, paid.get(p.scheduleItemId)! + toAgorot(p.amount));
    else loose += toAgorot(p.amount);
  }
  const ordered = [...schedule].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  for (const s of ordered) {
    const want = toAgorot(s.amount) - paid.get(s.id)!;
    if (want <= 0 || loose <= 0) continue;
    const take = Math.min(want, loose);
    paid.set(s.id, paid.get(s.id)! + take);
    loose -= take;
  }
  // A refund nobody placed (a credit note's) comes off the LAST money in, so the deposit stays
  // settled and the balance moves on the installment still open.
  for (const s of [...ordered].reverse()) {
    if (loose >= 0) break;
    const give = Math.min(paid.get(s.id)!, -loose);
    paid.set(s.id, paid.get(s.id)! - give);
    loose += give;
  }
  return ordered.map((s) => {
    const got = paid.get(s.id)!;
    const due = toAgorot(s.amount);
    const state: InstallmentState = got >= due ? "paid" : s.dueDate < today ? "late" : got > 0 ? "partial" : "due";
    return { ...s, paid: fromAgorot(got), state };
  });
}

/** The first installment not fully paid — what the payment dialog offers by default. */
export function nextInstallment(list: Installment[]): Installment | undefined {
  return list.find((i) => i.state !== "paid");
}

/** The earliest LATE installment, for the runway's alert: "תשלום שני באיחור — 12,000 ₪". */
export function lateInstallment(list: Installment[]): Installment | undefined {
  return list.find((i) => i.state === "late");
}

// ── The event's money, derived from its documents ──────────────────────────────────────────────

export interface EventLedger {
  /** The live order (the latest not superseded or cancelled), if any. */
  order?: BillingDocument;
  /** What the client has paid, in receipts (credits with a refund taken off). */
  paid: number;
  /** Tax invoices issued and not yet matched by a receipt — money asked for, not yet in. */
  invoicedOpen: number;
  /** order gross − paid. Undefined without an order. */
  balance?: number;
  installments: Installment[];
}

/** The payments an event's documents record: every live receipt, minus every refund a credit
 *  note records. */
export function paymentsOf(docs: BillingDocument[]): DocumentPayment[] {
  const out: DocumentPayment[] = [];
  for (const d of docs) {
    if (d.status === "cancelled") continue;
    if (recordsPayment(d.kind) && d.payment) out.push(d.payment);
    if (d.kind === "credit" && d.credit?.refund) out.push({ ...d.credit.refund, amount: -d.credit.refund.amount });
  }
  return out;
}

export function liveOrder(docs: BillingDocument[]): BillingDocument | undefined {
  return docs.filter((d) => d.kind === "order" && d.status !== "cancelled" && d.status !== "superseded").sort((a, b) => b.number - a.number)[0];
}

export function eventLedger(docs: BillingDocument[], today: string): EventLedger {
  const order = liveOrder(docs);
  const payments = paymentsOf(docs);
  const paid = fromAgorot(payments.reduce((n, p) => n + toAgorot(p.amount), 0));
  const receipted = new Set(docs.filter((d) => d.kind === "receipt" && d.status !== "cancelled" && d.followsId).map((d) => d.followsId));
  const invoicedOpen = fromAgorot(
    docs
      .filter((d) => d.kind === "tax_invoice" && d.status !== "cancelled" && !receipted.has(d.id))
      .reduce((n, d) => n + toAgorot(d.totals.gross), 0),
  );
  const list = order?.schedule ? installments(order.schedule, payments, today) : [];
  return {
    order,
    paid,
    invoicedOpen,
    balance: order ? fromAgorot(toAgorot(order.totals.gross) - toAgorot(paid)) : undefined,
    installments: list,
  };
}

// ── חשבוניות ישראל: the allocation number ──────────────────────────────────────────────────────

/** The threshold (amount BEFORE VAT, exclusive) above which a tax invoice needs an allocation
 *  number, by the date it is issued. Fixed at 5,000 ₪ from 1 June 2026 (חוק מע"מ s.38(a1)). */
export function allocationThreshold(isoDate: string): number {
  if (isoDate >= "2026-06-01") return 5000;
  if (isoDate >= "2026-01-01") return 10000;
  if (isoDate >= "2025-01-01") return 20000;
  if (isoDate >= "2024-05-05") return 25000;
  return Infinity;
}

/** A tax invoice or invoice-receipt whose net exceeds the threshold. Never a credit (not required
 *  today), a receipt, a request or an order. Requested for every qualifying invoice whatever the
 *  client (DECIDE 8): the number costs nothing and removes the question. */
export function allocationRequired(kind: DocumentKind, net: number, isoDate: string): boolean {
  if (!carriesVat(kind) || kind === "credit") return false;
  return net > allocationThreshold(isoDate);
}

/** Nine digits, as printed. */
export function validAllocationNumber(value: string): boolean {
  return /^\d{9}$/.test(value.trim());
}

// ── Cash ───────────────────────────────────────────────────────────────────────────────────────

export const CASH_CAP = 6000;

/** The most cash a business may take in one transaction (חוק לצמצום השימוש במזומן): all of it up
 *  to 6,000 ₪; above that, the lower of 6,000 ₪ and 10% of the transaction. */
export function cashCap(transactionGross: number): number {
  if (transactionGross <= CASH_CAP) return transactionGross;
  return Math.min(CASH_CAP, money(transactionGross * 0.1));
}

/** The reason a payment may not be recorded as typed, or null. `transactionGross` is the whole
 *  transaction (the order's gross when there is one), `cashSoFar` the cash already received on it. */
export function paymentRefusal(p: DocumentPayment, transactionGross: number, cashSoFar = 0): string | null {
  if (!(p.amount > 0)) return "סכום התשלום חייב להיות חיובי";
  if (p.means === "cash") {
    const cap = cashCap(Math.max(transactionGross, p.amount + cashSoFar));
    if (p.amount + cashSoFar > cap + 0.005) {
      return `חוק המזומן: בעסקה זו מותר לקבל במזומן עד ${cap.toLocaleString("he-IL")} ₪ (6,000 ₪ או 10% מהעסקה, הנמוך מביניהם)`;
    }
  }
  if (p.means === "cheque" && !(p.chequeNumber ?? "").trim()) return "קבלה על שיק חייבת לציין את מספר השיק";
  if (p.means === "card" && !(p.last4 ?? "").trim()) return "קבלה על כרטיס חייבת לציין את ארבע הספרות האחרונות";
  return null;
}

// ── Cancelling ─────────────────────────────────────────────────────────────────────────────────

/** A fiscal document may be marked מבוטל in place only while the original never left the studio
 *  and the VAT period it belongs to is still open (ניהול ספרים s.23א). The app cannot know what
 *  was reported, so the period is read as the calendar month — the narrowest honest rule — and
 *  anything else goes through a credit note. Orders and requests, which are not fiscal, may be
 *  cancelled while unsent. Returns the reason it may NOT be, or null. */
export function cancelRefusal(d: Pick<BillingDocument, "kind" | "status" | "originalAt" | "sentAt" | "documentDate">, today: string): string | null {
  if (d.status === "cancelled") return "המסמך כבר מבוטל";
  if (d.status === "superseded") return "המסמך הוחלף במסמך חדש";
  if (d.sentAt) return "המסמך נשלח ללקוח — תיקון רק בחשבונית זיכוי";
  if (isFiscal(d.kind)) {
    if (d.originalAt) return "המקור הופק — תיקון רק בחשבונית זיכוי";
    if (d.documentDate.slice(0, 7) !== today.slice(0, 7)) return "תקופת הדיווח של המסמך נסגרה — תיקון רק בחשבונית זיכוי";
  }
  return null;
}

/** What a credit note may reverse of an invoice: its gross less what earlier credits took. */
export function creditable(invoice: BillingDocument, credits: BillingDocument[]): number {
  const taken = credits
    .filter((c) => c.kind === "credit" && c.status !== "cancelled" && c.followsId === invoice.id)
    .reduce((n, c) => n + toAgorot(c.totals.gross), 0);
  return fromAgorot(Math.max(0, toAgorot(invoice.totals.gross) - taken));
}

// ── Completeness ───────────────────────────────────────────────────────────────────────────────

/** What the regulation requires and the document lacks — refused at issue, never printed blank. */
export function missingFields(d: Pick<BillingDocument, "kind" | "customer" | "lines" | "payment" | "credit" | "totals">): string[] {
  const out: string[] = [];
  if (!d.customer.name.trim()) out.push("שם הלקוח");
  if (isFiscal(d.kind) && !d.customer.address.trim()) out.push("כתובת הלקוח");
  if (d.lines.length === 0) out.push("לפחות שורה אחת");
  if (recordsPayment(d.kind) && !d.payment) out.push("פרטי התשלום");
  if (d.kind === "credit" && !d.credit?.reason.trim()) out.push("סיבת הזיכוי");
  if (d.kind === "credit" && !d.credit?.againstNumber) out.push("החשבונית המזוכה");
  if (d.totals.gross < 0) out.push("סכום חיובי");
  return out;
}

/** The stable text the content hash is taken over — the frozen columns, keys in a fixed order, so
 *  two prints of one record hash alike and a tampered copy does not. */
export function frozenText(d: Omit<BillingDocument, "id" | "contentHash" | "status" | "allocationNumber" | "allocationStatus" | "originalAt" | "sentAt" | "sentTo" | "cancelledAt" | "cancelReason" | "supersededById">): string {
  return JSON.stringify([
    d.eventId,
    d.kind,
    d.series,
    d.number,
    d.issuedAt,
    d.documentDate,
    d.followsId ?? null,
    d.documentVersion ?? null,
    d.customer,
    d.lines,
    d.totals,
    d.schedule ?? null,
    d.payment ?? null,
    d.credit ?? null,
    d.note,
  ]);
}

/** "2026-10" — the ledger's month key. */
export const periodOf = (isoDate: string): string => isoDate.slice(0, 7);
