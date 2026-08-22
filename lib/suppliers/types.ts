// Suppliers, and what the studio pays them.
//
// The register of this module is deliberately narrow. It answers TWO questions — what did this
// event cost me, and what do I owe this supplier — and it is not an accounting system. There is no
// invoice number, no VAT breakdown, no receipt, no payment run, no aged debt. The studio has a
// bookkeeper; a table here that is *nearly* an accounting record is worse than none, because it
// invites a reconciliation nobody can finish and then quietly disagrees with the real books.
//
// The third question — "what do I need to order" — is NOT stored. It is derived from the drawings
// (lib/suppliers/procurement.ts), because a number a designer types about usage will drift from the
// plan that generated it inside a month.

/** Who the studio buys from. A contact record with the fewest fields that still work: a supplier is
 *  a phone number and a sentence about what they stock. */
export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  /** Free text — "פרחים, ירק, אגרטלים". Not a category list: the catalog's taxonomy describes what
   *  the studio SELLS, and forcing a supplier into it would be the wrong taxonomy applied twice. */
  supplies?: string;
  note?: string;
  /** Archived, never deleted — an expense must not lose who it was paid to. */
  archived?: boolean;
}

/** Money paid to a supplier. */
export interface Expense {
  id: string;
  supplierId: string;
  /** ⚠ Optional on purpose: a bulk purchase of 500 candles belongs to no event. Requiring one would
   *  make a designer invent a booking in order to record a real cost. */
  eventId?: string;
  /** The catalog item it was for, when it was for one. A product id or a variant id — resolved the
   *  same way every placement is, which is why the column carries no foreign key. */
  variantId?: string;
  description: string;
  amount: number;
  /** ISO `yyyy-mm-dd`. When the money was SPENT, which is not when the row was typed — a receipt
   *  entered a week late still belongs to the week it happened. */
  spentAt: string;
  paid: boolean;
}

/** What one event cost, against what it was quoted for (F-7.4's `issued_quotes.total`).
 *
 *  ⚠ INTERNAL, all three numbers. This never reaches /present, the client portal or a quote. */
export interface EventMargin {
  eventId: string;
  /** The total of the last issued quote, or undefined when nothing has been quoted yet — which is
   *  a different thing from zero and must render differently. */
  quoted?: number;
  spent: number;
  /** quoted − spent, or undefined when there is nothing to subtract from. A margin against a quote
   *  that does not exist is not a small margin; it is not a margin. */
  profit?: number;
  /** profit / quoted, as a fraction. Undefined for the same reason, and when quoted is 0. */
  ratio?: number;
}

export function eventMargin(eventId: string, quoted: number | undefined, spent: number): EventMargin {
  if (quoted === undefined) return { eventId, spent };
  const profit = Math.round((quoted - spent + Number.EPSILON) * 100) / 100;
  return { eventId, quoted, spent, profit, ratio: quoted > 0 ? profit / quoted : undefined };
}

/** A supplier with the two counts its card shows. Assembled by the action rather than joined in the
 *  component, so the screen never fires a query per card. */
export interface SupplierSummary extends Supplier {
  /** Catalog items sourced from them. */
  productCount: number;
  /** What has been billed by them, all time, and how much of it is still unpaid. */
  spent: number;
  outstanding: number;
}
