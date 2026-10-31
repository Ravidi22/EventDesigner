// The billing documents against a real Postgres (the one .env.local names):
//
//   npm run db:verify:billing
//
// Walks the whole chain through the REAL actions — an event, an issued quote, the order (which
// confirms the event), a payment (a חשבונית מס/קבלה), an invoice on terms and its receipt, a credit
// note, a cancellation and its refusal — and asserts the two things `check:billing` cannot: that
// the counter hands out consecutive numbers under the row lock, and that the database trigger
// refuses an UPDATE to a frozen column.
//
// ⚠ IN A THROWAWAY ORGANISATION, created and deleted here. Every other verify script acts as
// SINGLE_ORG_ID, which is a real studio: a billing run there would consume real document numbers
// and then delete the documents, leaving a gap in the studio's books — the one thing the series
// must never have. So this script mints its own studio, and removes it (documents, then events,
// then the organisation — `billing_documents.event_id` is RESTRICT) whatever happens.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { actAsOrgForScript } from "@/lib/db/org";

const ORG = randomUUID();
actAsOrgForScript(ORG);

import { db } from "@/lib/db";
import { billingDocuments, documentCounters, events, organizations, studioSettings } from "@/lib/db/schema";
import { saveEvent } from "@/lib/events/actions";
import { issueQuote } from "@/lib/quotes/actions";
import { DEFAULT_LAYOUT } from "@/lib/quotes/layout";
import { cancelDocument, creditDocument, fetchEventBilling, fetchLedger, issueInvoice, issueOrder, markOriginal, recordPayment, setCounterStart } from "./actions";
import { defaultSchedule } from "./rules";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const isError = (v: unknown): v is { error: string } => !!v && typeof v === "object" && "error" in v;

async function main() {
  const database = db();
  await database.insert(organizations).values({ id: ORG, name: "בדיקת חיוב (זמני)" });
  await database.insert(studioSettings).values({ organizationId: ORG, businessName: "סטודיו בדיקה", businessNumber: "123456789", address: "רחוב הבדיקה 1", vatRate: "0.18", pricesIncludeVat: true });
  console.log(`org ${ORG} created`);

  try {
    const today = new Date().toISOString().slice(0, 10);
    const eventId = randomUUID();
    const [event] = await saveEvent({ id: eventId, clientName: "לקוח בדיקה", phone: "050-0000000", date: "2027-06-01", zoneIds: [], zonesLabel: "", guests: 100, step: 0, createdAt: Date.now() } as never).then((l) => l.filter((e) => e.id === eventId));
    check("event created", !!event);

    // The series may start anywhere while it is empty.
    const started = await setCounterStart("order", 1000);
    check("a series start can be typed while empty", !isError(started) && started.find((c) => c.series === "order")?.next === 1000);

    // No order before a quote.
    const early = await issueOrder(eventId, { customer: { name: "לקוח בדיקה", address: "" }, lines: [], schedule: [] });
    check("an order before a quote is refused", isError(early), JSON.stringify(early));

    await issueQuote(eventId, { layout: { ...DEFAULT_LAYOUT, finalPrice: 11800 }, total: 11800, discount: 0 });
    const line = { key: "design", label: "עיצוב החתונה לפי הצעת מחיר", quantity: 1, unit: "unit" as const, unitPrice: 11800, total: 11800 };
    const short = await issueOrder(eventId, { customer: { name: "לקוח בדיקה", address: "רחוב 2" }, lines: [line], schedule: [{ id: "a", label: "מקדמה", amount: 100, dueDate: today }] });
    check("a schedule that does not add up is refused", isError(short), JSON.stringify(short));

    const order = await issueOrder(eventId, { customer: { name: "לקוח בדיקה", address: "רחוב 2", number: "012345678" }, lines: [line], schedule: defaultSchedule(11800, "2027-06-01", today) });
    if (isError(order)) throw new Error(order.error);
    check("the order takes the typed start number", order.number === 1000, String(order.number));
    check("the order's VAT is inside its gross", order.totals.gross === 11800 && order.totals.net === 10000 && order.totals.vat === 1800, JSON.stringify(order.totals));
    const [evRow] = await database.select({ confirmedAt: events.confirmedAt, billingName: events.billingName }).from(events).where(eq(events.id, eventId));
    check("the order confirms the event and keeps the client's legal name", !!evRow.confirmedAt && evRow.billingName === "לקוח בדיקה");

    // The trigger: a frozen column cannot move.
    let refused = false;
    try {
      await database.update(billingDocuments).set({ note: "edited" }).where(eq(billingDocuments.id, order.id));
    } catch (e) {
      // Drizzle wraps the driver's error ("Failed query: …") and keeps Postgres' own message in `cause`.
      refused = /frozen/.test(`${String(e)} ${String((e as { cause?: unknown }).cause ?? "")}`);
    }
    check("the database refuses an edit to a frozen column", refused);
    await database.update(billingDocuments).set({ sentTo: "בדיקה" }).where(eq(billingDocuments.id, order.id));
    check("…but lets the after-issue columns move", true);

    // A second order supersedes the first.
    const order2 = await issueOrder(eventId, { customer: order.customer, lines: [line], schedule: defaultSchedule(11800, "2027-06-01", today) });
    if (isError(order2)) throw new Error(order2.error);
    check("numbers are consecutive", order2.number === 1001 && order2.followsId === order.id);
    const afterSupersede = await fetchEventBilling(eventId);
    check("the first order is superseded and the second is live", afterSupersede.documents.find((d) => d.id === order.id)?.status === "superseded" && afterSupersede.ledger.order?.id === order2.id);

    // Money: a cash payment over the cap is refused; a transfer makes a tax invoice-receipt.
    const tooMuchCash = await recordPayment(eventId, { payment: { means: "cash", amount: 6000, date: today } });
    check("cash over the cap is refused", isError(tooMuchCash), JSON.stringify(tooMuchCash));
    const deposit = await recordPayment(eventId, { payment: { means: "transfer", amount: 5900, date: today, reference: "77", scheduleItemId: "deposit" } });
    if (isError(deposit)) throw new Error(deposit.error);
    check("a payment makes a חשבונית מס/קבלה", deposit.kind === "tax_invoice_receipt" && deposit.number === 1 && deposit.totals.vat === 900, JSON.stringify(deposit.totals));
    check("5,000 net needs no allocation number; 5,001 would", deposit.allocationStatus === "n/a");
    const mid = await fetchEventBilling(eventId);
    check("the ledger reads the deposit as paid and the balance as the rest", mid.ledger.paid === 5900 && mid.ledger.balance === 5900 && mid.ledger.installments[0].state === "paid", JSON.stringify(mid.ledger));

    // An invoice on terms, then its receipt.
    const invoice = await issueInvoice(eventId, { amount: 5900, label: "יתרה" });
    if (isError(invoice)) throw new Error(invoice.error);
    check("an invoice to be paid later", invoice.kind === "tax_invoice" && invoice.number === 1);
    const open = await fetchEventBilling(eventId);
    check("…is open until a receipt follows it", open.ledger.invoicedOpen === 5900);
    const receipt = await recordPayment(eventId, { payment: { means: "cheque", amount: 5900, date: today, chequeNumber: "4421", bank: "לאומי" }, againstInvoiceId: invoice.id });
    if (isError(receipt)) throw new Error(receipt.error);
    check("a payment on an invoice is a plain receipt that follows it", receipt.kind === "receipt" && receipt.followsId === invoice.id && receipt.totals.vat === 0);
    const settled = await fetchEventBilling(eventId);
    check("paid in full", settled.ledger.balance === 0 && settled.ledger.invoicedOpen === 0 && settled.ledger.installments.every((i) => i.state === "paid"), JSON.stringify(settled.ledger));

    // Cancelling: allowed while unsent, refused once the original is out; then a credit.
    const cancelled = await cancelDocument(invoice.id, "בדיקה");
    check("an unsent invoice of this month may be cancelled in place", !isError(cancelled) && cancelled.status === "cancelled");
    await markOriginal(deposit.id);
    const kept = await cancelDocument(deposit.id, "");
    check("…but not one whose original was produced", isError(kept), JSON.stringify(kept));
    const credit = await creditDocument(deposit.id, { amount: 1180, reason: "שינוי בהזמנה", refund: { means: "transfer", amount: 1180, date: today } });
    if (isError(credit)) throw new Error(credit.error);
    check("a credit note names the invoice and carries the refund", credit.kind === "credit" && credit.credit?.againstNumber === "1" && credit.totals.vat === 180);
    const tooMuch = await creditDocument(deposit.id, { amount: 5000, reason: "x" });
    check("a credit cannot exceed what is left", isError(tooMuch));
    const after = await fetchEventBilling(eventId);
    check("the refund comes off what was paid", after.ledger.paid === 5900 + 5900 - 1180, String(after.ledger.paid));

    const ledger = await fetchLedger(today.slice(0, 7));
    check("the month's ledger lists every live document and sums the VAT kinds", ledger.rows.length >= 6 && ledger.totals.vat === 900 - 180, JSON.stringify(ledger.totals));
  } finally {
    await database.delete(billingDocuments).where(eq(billingDocuments.organizationId, ORG));
    await database.delete(documentCounters).where(eq(documentCounters.organizationId, ORG));
    await database.delete(events).where(and(eq(events.organizationId, ORG)));
    await database.delete(organizations).where(eq(organizations.id, ORG));
    console.log("org removed");
  }

  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nbilling verify passed");
  process.exit(0);
}

main().catch((err) => {
  console.error("billing verify failed:", err);
  process.exit(1);
});
