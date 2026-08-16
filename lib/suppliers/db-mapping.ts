// Rows ↔ Supplier / Expense. Pure, no I/O, no directive — its own file for the same reason the
// catalog's is: a "use server" module may only export async functions, and these are neither.
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { suppliers, expenses } from "@/lib/db/schema";
import type { Supplier, Expense } from "./types";

export type SupplierRow = InferSelectModel<typeof suppliers>;
export type SupplierInsert = InferInsertModel<typeof suppliers>;
export type ExpenseRow = InferSelectModel<typeof expenses>;
export type ExpenseInsert = InferInsertModel<typeof expenses>;

const orUndefined = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
/** Postgres `numeric` goes the other way as a STRING, deliberately: it is arbitrary-precision and
 *  handing the driver a float is how 1234.56 becomes 1234.5600000000001 in a total. Coming back it
 *  is narrowed with a plain Number() at the one place it is read — money here is shekels and
 *  agorot, well inside what a double holds exactly. Same trade as the catalog's mapping. */
const toNumeric = (v: number | undefined): string | null => (v === undefined ? null : String(v));

export function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactName: orUndefined(row.contactName),
    phone: orUndefined(row.phone),
    supplies: orUndefined(row.supplies),
    note: orUndefined(row.note),
    archived: row.archived || undefined,
  };
}

export function toSupplierRow(s: Supplier, organizationId: string): SupplierInsert {
  return {
    id: s.id,
    organizationId,
    name: s.name,
    contactName: s.contactName ?? null,
    phone: s.phone ?? null,
    supplies: s.supplies ?? null,
    note: s.note ?? null,
    archived: s.archived ?? false,
  };
}

export function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    supplierId: row.supplierId,
    eventId: orUndefined(row.eventId),
    variantId: orUndefined(row.variantId),
    description: row.description,
    // `date` columns come back as `yyyy-mm-dd` strings, which is exactly what the type wants — no
    // Date in between, so no timezone can shift a receipt to the previous day.
    amount: Number(row.amount),
    spentAt: row.spentAt,
    paid: row.paid,
  };
}

export function toExpenseRow(e: Expense, organizationId: string): ExpenseInsert {
  return {
    id: e.id,
    organizationId,
    supplierId: e.supplierId,
    eventId: e.eventId ?? null,
    variantId: e.variantId ?? null,
    description: e.description,
    amount: toNumeric(e.amount)!,
    spentAt: e.spentAt,
    paid: e.paid,
  };
}
