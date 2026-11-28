// Money and supply: billing documents, suppliers and procurement, orders, the marketplace, the catalog.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import {
  cancelDocument,
  creditDocument,
  fetchCounters,
  fetchDocument as fetchBillingDocument,
  fetchEventBilling,
  fetchLedger,
  issueInvoice,
  issueOrder,
  issuePaymentRequest,
  markOriginal,
  markSent,
  recordPayment,
  setAllocationNumber,
  setCounterStart,
} from "@/lib/billing/actions";
import { assignSupplier, assignSupplierMany, fetchEventMargin, fetchExpenses, fetchProcurement, fetchProcurementSetup, fetchSuppliers, removeExpense, removeSupplier, saveExpense, saveSupplier, setSourcing } from "@/lib/suppliers/actions";
import { answerOrder, fetchIncomingOrders, fetchOrders, sendOrder, setOrderStatus } from "@/lib/orders/actions";
import { acceptSourcePrice, addToCatalog, fetchMarketFlowers, fetchMarketplace, fetchMarketShops, fetchSourceStatus } from "@/lib/marketplace/actions";
import { fetchCatalogShades, fetchProducts, importProducts, installStageBasics, installStageParts, isPlacedAnywhere, isStandardProduct, removeProduct, saveProduct } from "@/lib/catalog/actions";
import type { Fixture } from "../fixture";
import type { Cases } from "./types";

const isError = (r: unknown) => r instanceof Error || (!!r && typeof r === "object" && typeof (r as { error?: unknown }).error === "string");
const today = () => new Date().toISOString().slice(0, 10);
const orderInput = () => ({
  customer: { name: "B", address: "רחוב", number: "012345678" },
  lines: [{ key: "design", label: "x", quantity: 1, unit: "unit", unitPrice: 100, total: 100 }],
  schedule: [{ id: "a", label: "מקדמה", amount: 100, dueDate: today() }],
});

/** What the marketplace shows by design: the supplier's PUBLISHED row and its letterhead. */
const PUBLISHED = (a: Fixture) => [a.orgS, a.publicProductS, a.publicVariantS];
const MARKET = "the marketplace is the one cross-tenant read: published supplier rows, by design (check:marketplace)";
const noCopyOf = (id: (a: Fixture) => string) => async (a: Fixture) =>
  (await db().select({ id: products.id }).from(products).where(eq(products.sourceProductId, id(a)))).length === 0;

export const MONEY_CASES: Cases = {
  // ── billing ──
  "lib/billing/actions.ts#fetchEventBilling": { call: (a) => fetchEventBilling(a.eventId) },
  "lib/billing/actions.ts#fetchDocument": { call: (a) => fetchBillingDocument(a.billingDocId) },
  "lib/billing/actions.ts#fetchLedger": { call: () => fetchLedger() },
  // A's order series has been used; B's has not — an outsider must never read "used".
  "lib/billing/actions.ts#fetchCounters": { call: () => fetchCounters(), expect: (r) => isError(r) || !JSON.stringify(r).includes('"used":true') },
  // The receipt series is the one A has not used yet, so A's own call can set it.
  "lib/billing/actions.ts#setCounterStart": { call: () => setCounterStart("receipt" as never, 5000) },
  "lib/billing/actions.ts#issueOrder": { call: (a) => issueOrder(a.eventId, orderInput() as never) },
  "lib/billing/actions.ts#recordPayment": { call: (a) => recordPayment(a.eventId, { payment: { means: "transfer", amount: 100, date: today() } } as never) },
  "lib/billing/actions.ts#issueInvoice": { call: (a) => issueInvoice(a.eventId, { amount: 100, label: "B" } as never) },
  "lib/billing/actions.ts#issuePaymentRequest": { call: (a) => issuePaymentRequest(a.eventId, { amount: 100, dueDate: today() } as never) },
  "lib/billing/actions.ts#creditDocument": { call: (a) => creditDocument(a.invoiceId, { reason: "B", amount: 50 } as never) },
  "lib/billing/actions.ts#cancelDocument": { call: (a) => cancelDocument(a.paymentRequestId, "B") },
  "lib/billing/actions.ts#markOriginal": { call: (a) => markOriginal(a.billingDocId) },
  "lib/billing/actions.ts#markSent": { call: (a) => markSent(a.billingDocId, "b@example.test") },
  "lib/billing/actions.ts#setAllocationNumber": { call: (a) => setAllocationNumber(a.billingDocId, "123456789") },

  // ── suppliers, expenses, procurement ──
  "lib/suppliers/actions.ts#assignSupplier": { call: (a) => assignSupplier(a.variantId, null) },
  "lib/suppliers/actions.ts#assignSupplierMany": { call: (a) => assignSupplierMany([a.variantId], a.supplier.id) },
  "lib/suppliers/actions.ts#setSourcing": { call: (a) => setSourcing([a.productId], { stockKind: "owned" } as never) },
  "lib/suppliers/actions.ts#fetchProcurementSetup": {
    call: () => fetchProcurementSetup("2027-12-31"),
    control: "counts of the CALLER's own catalog and events; it takes no id, and A's and B's counts can match",
  },
  "lib/suppliers/actions.ts#fetchSuppliers": { call: () => fetchSuppliers() },
  "lib/suppliers/actions.ts#saveSupplier": { call: (a) => saveSupplier({ ...a.supplier, name: "B was here" }) },
  "lib/suppliers/actions.ts#removeSupplier": { call: (a) => removeSupplier(a.supplier.id) },
  "lib/suppliers/actions.ts#fetchExpenses": { call: () => fetchExpenses() },
  "lib/suppliers/actions.ts#saveExpense": { call: (a) => saveExpense({ ...a.expense, amount: 1 }) },
  "lib/suppliers/actions.ts#removeExpense": { call: (a) => removeExpense(a.expense.id) },
  // A's event was quoted 11,800 and cost 500: neither figure may reach an outsider.
  "lib/suppliers/actions.ts#fetchEventMargin": { call: (a) => fetchEventMargin(a.eventId), expect: (r) => isError(r) || !/11800|11300/.test(JSON.stringify(r)) },
  "lib/suppliers/actions.ts#fetchProcurement": { call: () => fetchProcurement("2027-01-01", "2027-12-31") },

  // ── orders ──
  "lib/orders/actions.ts#fetchOrders": { call: () => fetchOrders() },
  "lib/orders/actions.ts#sendOrder": {
    call: (a) => sendOrder({ supplierId: a.supplier.id, windowFrom: "2027-05-01", windowTo: "2027-06-30", lines: [{ variantId: a.variantId, description: "B", quantity: 1, unitLabel: "יח׳" }] }),
  },
  "lib/orders/actions.ts#setOrderStatus": { call: (a) => setOrderStatus(a.orderId, "confirmed" as never) },
  "lib/orders/actions.ts#fetchIncomingOrders": { as: "supplierB", call: () => fetchIncomingOrders() },
  "lib/orders/actions.ts#answerOrder": { as: "supplierB", call: (a) => answerOrder(a.orderId, "confirmed" as never, "B") },

  // ── the marketplace ──
  "lib/marketplace/actions.ts#fetchMarketplace": {
    call: (a) => fetchMarketplace(a.orgS),
    allow: PUBLISHED,
    reason: MARKET,
    expect: (r, a) => !JSON.stringify(r ?? null).includes(a.privateProductS),
  },
  "lib/marketplace/actions.ts#fetchMarketShops": {
    call: () => fetchMarketShops(),
    allow: PUBLISHED,
    reason: MARKET,
    expect: (r, a) => !JSON.stringify(r ?? null).includes(a.privateProductS),
  },
  // A PRIVATE row must never be copied, whatever the answer says.
  "lib/marketplace/actions.ts#addToCatalog": {
    call: (a) => addToCatalog(a.privateProductS),
    verify: noCopyOf((a) => a.privateProductS),
    control: "a private row is refused to EVERY caller — what this case holds is that one is never copied (the verify), not tenancy",
  },
  // A's copy, whose supplier has since moved the price.
  "lib/marketplace/actions.ts#fetchSourceStatus": { call: (a) => fetchSourceStatus(a.copyProductId), expect: (r) => isError(r) || r === null },
  "lib/marketplace/actions.ts#acceptSourcePrice": { call: (a) => acceptSourcePrice(a.copyProductId) },
  "lib/marketplace/actions.ts#fetchMarketFlowers": {
    call: () => fetchMarketFlowers(),
    allow: PUBLISHED,
    reason: MARKET,
    control: "the marketplace is shared by design, and the fixture's supplier publishes no stems",
  },

  // ── the catalog ──
  "lib/catalog/actions.ts#fetchProducts": { call: () => fetchProducts() },
  "lib/catalog/actions.ts#fetchCatalogShades": { call: () => fetchCatalogShades() },
  "lib/catalog/actions.ts#saveProduct": { call: (a) => saveProduct({ ...a.product, name: "B was here" }) },
  // A's variant IS placed in A's drawing: an outsider must hear "no".
  "lib/catalog/actions.ts#isPlacedAnywhere": { call: (a) => isPlacedAnywhere([a.variantId]), expect: (r) => isError(r) || r === false },
  "lib/catalog/actions.ts#removeProduct": { call: (a) => removeProduct(a.productId) },
  "lib/catalog/actions.ts#isStandardProduct": {
    call: (a) => isStandardProduct(a.productId),
    expect: (r) => isError(r) || r === false,
    control: "says whether an id is a base-library key of the CALLER's own catalog; A's hand-made row is none, for A too",
  },
  "lib/catalog/actions.ts#installStageBasics": { call: () => installStageBasics() },
  "lib/catalog/actions.ts#installStageParts": { call: () => installStageParts() },
  "lib/catalog/actions.ts#importProducts": {
    call: (a) => importProducts([{ ...a.product, name: "B was here" }]),
    control: "an import only INSERTS new rows — even A's own id collides — so what this case holds is that another tenant's id is never written over (the snapshot)",
  },
};
