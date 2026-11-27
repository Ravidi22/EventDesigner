// The export's readable tables (EVE-51, spec §5.8): events, clients, catalog, billing — Excel-ready.
// Pure; `check:export-csv` holds it. UTF-8 with a BOM (Excel reads Hebrew only with one), CRLF rows,
// every cell that could run as a formula defused with a leading apostrophe.
import type { ExportData, Row } from "./export-types";

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  let s = typeof value === "object" ? JSON.stringify(value) : String(value);
  // A leading = + - @ makes Excel evaluate the cell; a plain (negative) number is left a number.
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(header: string[], rows: unknown[][]): string {
  return "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const rowsOf = (d: ExportData, table: string): Row[] => d.tables[table] ?? [];
const money = (n: unknown) => (typeof n === "number" ? n.toFixed(2) : "");

export function eventsCsv(d: ExportData): string {
  return csv(
    ["לקוח", "תאריך", "סוג האירוע", "אורחים", "אזורים", "טלפון", "איש קשר"],
    rowsOf(d, "events").map((e) => [e.client_name, e.event_date, e.event_type, e.guests, e.zones_label, e.phone, e.contact_name]),
  );
}

export function clientsCsv(d: ExportData): string {
  const accounts = new Map<string, string[]>();
  for (const a of d.clientAccounts) accounts.set(a.eventId, [...(accounts.get(a.eventId) ?? []), a.name ? `${a.name} <${a.email}>` : a.email]);
  return csv(
    ["לקוח", "טלפון", "איש קשר", "שם לחשבונית", "ח״פ / ת״ז", "כתובת לחשבונית", "חשבונות לקוח", "תאריך האירוע"],
    rowsOf(d, "events").map((e) => [
      e.client_name,
      e.phone,
      e.contact_name,
      e.billing_name,
      e.billing_number,
      e.billing_address,
      (accounts.get(String(e.id)) ?? []).join("; "),
      e.event_date,
    ]),
  );
}

export function catalogCsv(d: ExportData): string {
  return csv(
    ["שם", "קטגוריה", "מחיר", "יחידת מחיר", "עלות", "אופן אספקה", "כמות במלאי", "רוחב (מ״מ)", "עומק (מ״מ)", "גובה (מ״מ)", "קוטר (מ״מ)"],
    rowsOf(d, "products").map((p) => [
      p.name,
      p.category,
      p.unit_price,
      p.price_unit,
      p.cost_price,
      p.stock_kind,
      p.stock_qty,
      p.width_mm,
      p.depth_mm,
      p.height_mm,
      p.diameter_mm,
    ]),
  );
}

export function billingCsv(d: ExportData): string {
  return csv(
    ["סוג", "סדרה", "מספר", "תאריך", "לקוח", "לפני מע״מ", "מע״מ", "סה״כ", "סטטוס", "מספר הקצאה"],
    rowsOf(d, "billing_documents").map((b) => {
      const totals = (b.totals ?? {}) as { net?: number; vat?: number; gross?: number };
      const customer = (b.customer ?? {}) as { name?: string };
      return [b.kind, b.series, b.number, b.document_date, customer.name, money(totals.net), money(totals.vat), money(totals.gross), b.status, b.allocation_number];
    }),
  );
}
