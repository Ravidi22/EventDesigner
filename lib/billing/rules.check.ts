// npm run check:billing — the self-check of ./rules.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type BillingDocument, type DocumentKind, type DocumentLine, type DocumentPayment } from "./types";
import { allocationRequired, amountLine, amountTotals, cancelRefusal, cashCap, computeTotals, creditable, defaultSchedule, eventLedger, frozenText, installments, kindsFor, lateInstallment, missingFields, nextInstallment, paymentRefusal, rateFor, receiptKindFor, scheduleGap, toAgorot, validAllocationNumber } from "./rules";

// ponytail: self-check. Run: npm run check:billing
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const line = (total: number, gift = false): DocumentLine => ({ key: String(total), label: "x", quantity: 1, unit: "unit", unitPrice: total, total, gift });

// Kinds by standing.
assert(!kindsFor("exempt").includes("tax_invoice") && kindsFor("licensed").includes("tax_invoice"), "a פטור never issues a tax invoice");
assert(receiptKindFor("licensed", false) === "tax_invoice_receipt" && receiptKindFor("licensed", true) === "receipt" && receiptKindFor("exempt", false) === "receipt", "the default receipt kind");
assert(rateFor("exempt", 0.18) === 0 && rateFor("company", 0.18) === 0.18, "an exempt studio carries no VAT");

// Totals add up exactly, both ways.
const inc = computeTotals([line(40000), line(6000, true)], { vatRate: 0.18, pricesIncludeVat: true });
assert(inc.gross === 40000 && inc.net === 33898.31 && inc.vat === 6101.69, `VAT inside: ${JSON.stringify(inc)}`);
assert(toAgorot(inc.net) + toAgorot(inc.vat) === toAgorot(inc.gross), "net + vat = gross in agorot");
const exc = computeTotals([line(10000)], { vatRate: 0.18, pricesIncludeVat: false, discount: 1000 });
assert(exc.beforeDiscount === 10000 && exc.discount === 1000 && exc.net === 9000 && exc.vat === 1620 && exc.gross === 10620, `VAT on top: ${JSON.stringify(exc)}`);
const odd = computeTotals([line(0.01)], { vatRate: 0.18, pricesIncludeVat: true });
assert(toAgorot(odd.net) + toAgorot(odd.vat) === 1, "one agora still splits whole");
assert(amountTotals(1180, 0.18).net === 1000 && amountTotals(1180, 0).vat === 0, "a typed gross amount");

// Schedule.
const sch = defaultSchedule(85000, "2026-12-20", "2026-10-30");
assert(sch.length === 2 && sch[0].amount === 42500 && sch[1].dueDate === "2026-12-13", `default schedule: ${JSON.stringify(sch)}`);
assert(scheduleGap(sch, 85000) === 0, "the default schedule adds up");
assert(scheduleGap([{ id: "a", label: "", amount: 100, dueDate: "2026-01-01" }], 85000) === 84900, "a short schedule reports its gap");
assert(defaultSchedule(1000, "2026-10-31", "2026-10-30")[1].dueDate === "2026-10-30", "a near event puts the rest today");
const pay = (amount: number, id?: string): DocumentPayment => ({ means: "transfer", amount, date: "2026-10-30", scheduleItemId: id });
const st = installments(sch, [pay(15000)], "2026-10-31");
assert(st[0].paid === 15000 && st[0].state === "late" && st[1].state === "due", `a loose payment fills the deposit first: ${JSON.stringify(st)}`);
const st2 = installments(sch, [pay(42500, "deposit"), pay(42500)], "2026-10-31");
assert(st2.every((i) => i.state === "paid") && !nextInstallment(st2), "named and loose payments settle the schedule");
const st3 = installments(sch, [pay(10000)], "2026-10-30");
assert(st3[0].state === "partial" && lateInstallment(st3) === undefined && nextInstallment(st3)?.id === "deposit", "partial, not yet late");

// Allocation.
assert(allocationRequired("tax_invoice", 5001, "2026-10-30") && !allocationRequired("tax_invoice", 5000, "2026-10-30"), "5,000 net from June 2026, exclusive");
assert(!allocationRequired("tax_invoice", 9000, "2026-03-01") && allocationRequired("tax_invoice", 11000, "2026-03-01"), "10,000 before June 2026");
assert(!allocationRequired("receipt", 99999, "2026-10-30") && !allocationRequired("credit", 99999, "2026-10-30") && !allocationRequired("order", 99999, "2026-10-30"), "only VAT invoices");
assert(validAllocationNumber("123456789") && !validAllocationNumber("12345678") && !validAllocationNumber("12345678a"), "nine digits");

// Cash.
assert(cashCap(5000) === 5000 && cashCap(6000) === 6000 && cashCap(30000) === 3000 && cashCap(100000) === 6000, "the cash cap");
assert(paymentRefusal({ means: "cash", amount: 3000, date: "2026-10-30" }, 30000) === null, "3,000 cash on a 30,000 event is fine");
assert(paymentRefusal({ means: "cash", amount: 3001, date: "2026-10-30" }, 30000) !== null, "3,001 is not");
assert(paymentRefusal({ means: "cash", amount: 2000, date: "2026-10-30" }, 30000, 2000) !== null, "cash already taken counts");
assert(paymentRefusal({ means: "cheque", amount: 2000, date: "2026-10-30" }, 30000) !== null && paymentRefusal({ means: "cheque", amount: 2000, date: "2026-10-30", chequeNumber: "7" }, 30000) === null, "a cheque needs its number");
assert(paymentRefusal({ means: "transfer", amount: 0, date: "2026-10-30" }, 30000) !== null, "a zero payment is refused");

// Cancelling.
const base = { kind: "tax_invoice" as DocumentKind, status: "issued" as const, documentDate: "2026-10-12" };
assert(cancelRefusal(base, "2026-10-30") === null, "an unsent invoice of this month may be cancelled");
assert(cancelRefusal({ ...base, originalAt: 1 }, "2026-10-30") !== null, "…not once the original was produced");
assert(cancelRefusal({ ...base, sentAt: 1 }, "2026-10-30") !== null, "…nor once sent");
assert(cancelRefusal(base, "2026-11-02") !== null, "…nor after its month closed");
assert(cancelRefusal({ ...base, kind: "order", originalAt: 1, documentDate: "2026-01-01" }, "2026-10-30") === null, "an order is not fiscal: unsent is enough");

// Ledger.
const doc = (kind: DocumentKind, number: number, gross: number, extra: Partial<BillingDocument> = {}): BillingDocument => ({
  id: `${kind}-${number}`,
  eventId: "e",
  kind,
  series: kind,
  number,
  status: "issued",
  issuedAt: 0,
  documentDate: "2026-10-30",
  customer: { name: "c", address: "a" },
  lines: [amountLine("x", gross)],
  totals: amountTotals(gross, 0.18),
  allocationStatus: "n/a",
  note: "",
  contentHash: "",
  ...extra,
});
const order = doc("order", 1, 85000, { schedule: sch });
const docs = [
  order,
  doc("tax_invoice_receipt", 1, 42500, { payment: pay(42500, "deposit") }),
  doc("tax_invoice", 1, 10000),
  doc("credit", 1, 2500, { followsId: "tax_invoice_receipt-1", credit: { reason: "r", againstNumber: "1", againstDate: "2026-10-30", refund: pay(2500) } }),
  doc("order", 2, 1, { status: "cancelled" }),
];
const led = eventLedger(docs, "2026-10-30");
assert(led.order?.number === 1, "the cancelled order is not the live one");
assert(led.paid === 40000 && led.balance === 45000 && led.invoicedOpen === 10000, `ledger: ${JSON.stringify({ paid: led.paid, balance: led.balance, open: led.invoicedOpen })}`);
assert(led.installments[0].state === "partial" && led.installments[0].paid === 40000, "a refund comes off the installment it was against");
assert(creditable(docs[1], docs) === 40000, "what is left to credit");

// Completeness and the hash text.
assert(missingFields({ kind: "tax_invoice", customer: { name: "a", address: "" }, lines: [], totals: amountTotals(1, 0.18) }).join() === "כתובת הלקוח,לפחות שורה אחת", "the missing list");
assert(missingFields({ kind: "order", customer: { name: "a", address: "" }, lines: [line(1)], totals: amountTotals(1, 0.18) }).length === 0, "an order needs no address");
assert(frozenText(order) === frozenText({ ...order, status: "sent", contentHash: "zzz" } as BillingDocument), "the hash text ignores what may change");

console.log("billing rules self-check passed");
