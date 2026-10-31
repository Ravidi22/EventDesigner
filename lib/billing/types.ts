// The billing documents — הזמנה, חשבונית מס, קבלה, חשבונית זיכוי — as the app carries them.
//
// PURE TYPES AND LABELS, no I/O: imported by the schema (for the jsonb column types), by the rules
// (lib/billing/rules.ts), by the actions and by every screen. Nothing here may import the database.
//
// ── THE ONE IDEA ─────────────────────────────────────────────────────────────────────────────────
// A billing document is an IMMUTABLE, NUMBERED SNAPSHOT. The quote is the thing that moves (it is
// re-issued, the drawing changes under it); a document is the opposite kind of thing — the moment it
// has a number, nothing about it may change, for seven years (הוראות ניהול ספרים s.25). So every
// figure, line, name and address is COPIED into the row at issue, from the quote, the event and the
// settings, and never recomputed from them later. A mistake is corrected by a NEW document (a credit
// note against an invoice, a new order superseding an order), never by an edit.
//
// See docs/superpowers/specs/2026-10-30-billing-documents-design.md for the legal frame each field
// answers to.

/** The studio's standing with VAT. Decides which documents it may issue at all: a עוסק פטור may
 *  never print the words "חשבונית מס" (its receipts carry no VAT), while a עוסק מורשה and a company
 *  must. A studio-level SETTING, read by every document. */
export type VatStatus = "exempt" | "licensed" | "company";

export const VAT_STATUS_LABEL: Record<VatStatus, string> = {
  exempt: "עוסק פטור",
  licensed: "עוסק מורשה",
  company: "חברה בע״מ",
};

/** The words a document prints under the studio's name beside its number (תקנות מע"מ 9א(א)(1)
 *  asks for "עוסק מורשה" in print on a tax invoice). */
export const VAT_STATUS_PRINT: Record<VatStatus, string> = {
  exempt: "עוסק פטור",
  licensed: "עוסק מורשה",
  company: "ח.פ",
};

/** The kinds, in the order they happen:
 *    order               הזמנה — the client's yes, written down (ניהול ספרים s.15, the order book)
 *    payment_request     דרישת תשלום — "please pay X by date"; NOT fiscal, no VAT a client may deduct
 *    tax_invoice         חשבונית מס — a VAT-bearing sale, to be paid (a receipt follows)
 *    receipt             קבלה — money received
 *    tax_invoice_receipt חשבונית מס-קבלה — both at once, when paid on the spot (the usual case)
 *    credit              חשבונית זיכוי — a reversal of an issued invoice, whole or part */
export type DocumentKind = "order" | "payment_request" | "tax_invoice" | "receipt" | "tax_invoice_receipt" | "credit";

export const DOCUMENT_KINDS: DocumentKind[] = ["order", "payment_request", "tax_invoice", "receipt", "tax_invoice_receipt", "credit"];

export const KIND_LABEL: Record<DocumentKind, string> = {
  order: "הזמנה",
  payment_request: "דרישת תשלום",
  tax_invoice: "חשבונית מס",
  receipt: "קבלה",
  tax_invoice_receipt: "חשבונית מס / קבלה",
  credit: "חשבונית זיכוי",
};

/** The title PRINTED at the head of the page — the words the regulation asks for, exactly. */
export const KIND_TITLE: Record<DocumentKind, string> = {
  order: "הזמנה",
  payment_request: "דרישת תשלום",
  tax_invoice: "חשבונית מס",
  receipt: "קבלה",
  tax_invoice_receipt: "חשבונית מס / קבלה",
  credit: "חשבונית זיכוי",
};

export type DocumentStatus = "issued" | "sent" | "cancelled" | "superseded";

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  issued: "הופק",
  sent: "נשלח",
  cancelled: "מבוטל",
  superseded: "הוחלף",
};

/** The client as the document names them. COPIED onto the row: a client who moves house after the
 *  invoice does not change the invoice. */
export interface DocumentCustomer {
  name: string;
  address: string;
  /** ת.ז / ח.פ / עוסק מורשה — required on an invoice to a business (and what an allocation request
   *  sends); optional for a private person. */
  number?: string;
  phone?: string;
  email?: string;
}

/** One line of a document. An order's lines are the quote's sections in the client's words (never
 *  catalog rows, never a deck size — the quote's own rule); a receipt's one line is what was paid
 *  for; a credit's are what is reversed. `total` is the line's amount in the document's basis
 *  (with or without VAT — `DocumentTotals.pricesIncludeVat` says which). */
export interface DocumentLine {
  key: string;
  label: string;
  quantity: number;
  unit: "unit" | "m" | "m2";
  unitPrice: number;
  total: number;
  /** Listed, never charged. */
  gift?: boolean;
}

/** The figures, computed ONCE at issue by lib/billing/rules.ts and stored. `vatRate` is the rate
 *  the document was issued at — a later change of the studio's rate must not reprint history. */
export interface DocumentTotals {
  /** The sum of the lines before any discount, in the stored basis. */
  beforeDiscount: number;
  discount: number;
  /** Without VAT. */
  net: number;
  vatRate: number;
  vat: number;
  /** With VAT — what the client pays. */
  gross: number;
  currency: string;
  /** Whether the line amounts were typed including VAT (the studio's price basis) — the document
   *  prints net / VAT / gross whichever way they were typed. */
  pricesIncludeVat: boolean;
}

/** One installment of an order's payment schedule. `amount` is gross (what the client pays). */
export interface ScheduleItem {
  id: string;
  label: string;
  amount: number;
  /** ISO yyyy-mm-dd. */
  dueDate: string;
}

export type PaymentMeans = "cash" | "transfer" | "cheque" | "card" | "app";

export const PAYMENT_MEANS: PaymentMeans[] = ["transfer", "app", "card", "cheque", "cash"];

export const PAYMENT_MEANS_LABEL: Record<PaymentMeans, string> = {
  cash: "מזומן",
  transfer: "העברה בנקאית",
  cheque: "שיק",
  card: "כרטיס אשראי",
  app: "ביט / פייבוקס",
};

/** How money arrived — what ניהול ספרים s.5 requires a receipt to record, per means. */
export interface DocumentPayment {
  means: PaymentMeans;
  /** Gross. */
  amount: number;
  /** ISO yyyy-mm-dd — the day the money arrived, not the day it was typed. */
  date: string;
  /** cheque / transfer: the bank. */
  bank?: string;
  branch?: string;
  account?: string;
  /** cheque: its number and date. */
  chequeNumber?: string;
  chequeDate?: string;
  /** card: type and last four digits. */
  cardType?: string;
  last4?: string;
  /** transfer / app: the reference or confirmation number. */
  reference?: string;
  /** The schedule installment this payment was against, when it was. */
  scheduleItemId?: string;
}

/** What a credit note carries beyond its lines (ניהול ספרים s.9(ה)): the invoice it corrects — by
 *  number, date and allocation number — and the reason. */
export interface DocumentCredit {
  reason: string;
  againstNumber: string;
  againstDate: string;
  againstAllocation?: string;
  /** How the money went back, when it did. */
  refund?: DocumentPayment;
}

/** The allocation number (מספר הקצאה, חשבוניות ישראל): required on a tax invoice above the
 *  threshold (lib/billing/rules.ts allocationRequired). `n/a` = not required; `manual` = typed by
 *  the designer off the Tax Authority's site; `pending` = required and not yet obtained. */
export type AllocationStatus = "n/a" | "pending" | "manual" | "granted" | "refused";

export interface BillingDocument {
  id: string;
  eventId: string;
  kind: DocumentKind;
  /** The sequence this number belongs to (one per kind). */
  series: string;
  number: number;
  status: DocumentStatus;
  /** Epoch ms — when the number was taken. */
  issuedAt: number;
  /** ISO yyyy-mm-dd — the date printed. */
  documentDate: string;
  /** The document this one is against: a receipt its invoice, a credit the invoice it reverses, an
   *  invoice the order it bills, a superseding order the one it replaces. */
  followsId?: string;
  /** Orders only: the sealed drawing agreed on, the same integer the quote seals (F-7.4). */
  documentVersion?: number;
  customer: DocumentCustomer;
  lines: DocumentLine[];
  totals: DocumentTotals;
  /** Orders and payment requests. */
  schedule?: ScheduleItem[];
  /** Receipt kinds. */
  payment?: DocumentPayment;
  /** Credits. */
  credit?: DocumentCredit;
  allocationNumber?: string;
  allocationStatus: AllocationStatus;
  /** A note printed under the lines ("כולל הובלה והקמה"). */
  note: string;
  /** Epoch ms. The ORIGINAL left the studio — printed as מקור, or shared as a file. After this
   *  every print says העתק, and the document can no longer be cancelled in place. */
  originalAt?: number;
  /** Epoch ms, and to whom (a phone, an email, "ביד"). */
  sentAt?: number;
  sentTo?: string;
  cancelledAt?: number;
  cancelReason?: string;
  /** Orders: the newer order that replaced this one. */
  supersededById?: string;
  /** sha256 of the frozen columns — printed small on the page so a copy can be checked against the
   *  record. */
  contentHash: string;
}

/** The kinds that are FISCAL records: a VAT invoice, a receipt, or a credit. These get "מקור" /
 *  "העתק", the seven-year rule and the narrow cancellation rule. An order and a payment request
 *  are not — they are the studio's own paperwork. */
export const FISCAL_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>(["tax_invoice", "receipt", "tax_invoice_receipt", "credit"]);

/** The kinds that carry VAT (and so may need an allocation number). */
export const VAT_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>(["tax_invoice", "tax_invoice_receipt", "credit"]);

/** The kinds that record money received. */
export const RECEIPT_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>(["receipt", "tax_invoice_receipt"]);

export const isFiscal = (kind: DocumentKind): boolean => FISCAL_KINDS.has(kind);
export const carriesVat = (kind: DocumentKind): boolean => VAT_KINDS.has(kind);
export const recordsPayment = (kind: DocumentKind): boolean => RECEIPT_KINDS.has(kind);

/** "חשבונית מס 1042" / "הזמנה 7". The number is LRI-wrapped by the caller when it sits in Hebrew. */
export function documentName(d: Pick<BillingDocument, "kind" | "number">): string {
  return `${KIND_LABEL[d.kind]} ${d.number}`;
}
