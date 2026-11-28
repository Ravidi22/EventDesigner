// npm run check:export-csv — the self-check of ./export-csv.ts (EVE-51): the export's readable tables
// open in Excel as Hebrew, survive commas, quotes and newlines, and never run as a formula.
import { billingCsv, catalogCsv, clientsCsv, csvCell, eventsCsv } from "./export-csv";
import type { ExportData } from "./export-types";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

// ── One cell ─────────────────────────────────────────────────────────────────────────────────────
assert(csvCell("פשוט") === "פשוט", "a plain cell is left alone");
assert(csvCell('כהן, "דני"') === '"כהן, ""דני"""', "commas and quotes are quoted, quotes doubled");
assert(csvCell("שורה\nשנייה") === '"שורה\nשנייה"', "a newline is quoted");
assert(csvCell("=SUM(A1)") === "'=SUM(A1)", "a formula is defused");
for (const lead of ["+", "-", "@"]) assert(csvCell(`${lead}A1`) === `'${lead}A1`, `a cell starting with ${lead} is defused`);
assert(csvCell(null) === "" && csvCell(undefined) === "", "empty for nothing");
assert(csvCell(-5) === "-5" && csvCell("-100.00") === "-100.00", "a negative number is a number, not a formula");
// OWASP's list has a leading tab and carriage return too (PR #5 review).
const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);
assert(csvCell(`${TAB}=HYPERLINK("http://x","y")`).startsWith(`"'${TAB}=`), "a cell starting with a tab is defused");
assert(csvCell(`${CR}=1+1`).startsWith(`"'${CR}=`), "a cell starting with a carriage return is defused");
// A phone number cannot call a function: digits, spaces, dashes and brackets stay as typed — the guard's
// apostrophe showed on every +972… number in clients.csv (PR #5 review).
assert(csvCell("+972 50-123-4567") === "+972 50-123-4567", "a +972 phone is left as it is");
assert(csvCell("+1 (212) 555-0100") === "+1 (212) 555-0100", "…with brackets too");
assert(csvCell("+972-50-SUM(1)") === "'+972-50-SUM(1)", "…but letters after a + are still defused");
assert(csvCell("-") === "'-" && csvCell("+") === "'+", "a lone sign is defused (no digit)");
assert(csvCell(12.5) === "12.5" && csvCell(true) === "כן" && csvCell(false) === "לא", "numbers and switches");

// ── The tables ───────────────────────────────────────────────────────────────────────────────────
const d: ExportData = {
  meta: { business: "אירית עיצובים", kind: "studio", at: "2026-11-27T10:00:00.000Z", app: "eve" },
  tables: {
    events: [
      { id: "e1", client_name: 'כהן, "דני"', event_date: "2027-06-01", event_type: "חתונה", guests: 120, zones_label: "אולם", phone: "050-1", contact_name: "רונית\nכהן", billing_name: null, billing_number: null, billing_address: null },
      { id: "e2", client_name: "לוי", event_date: null, event_type: "", guests: 0, zones_label: "", phone: "", contact_name: null, billing_name: "לוי בע״מ", billing_number: "515", billing_address: "רחוב 1" },
    ],
    products: [{ id: "p1", name: "שולחן עגול", category: "tables", unit_price: "120.00", price_unit: "unit", cost_price: "80.00", stock_kind: "owned", stock_qty: 12, width_mm: null, depth_mm: null, height_mm: 750, diameter_mm: 1800 }],
    billing_documents: [
      { id: "b1", kind: "tax_invoice_receipt", series: "tax_invoice_receipt", number: 7, document_date: "2026-11-20", status: "issued", customer: { name: "כהן", address: "", number: "" }, totals: { net: 1000, vat: 180, gross: 1180 }, allocation_number: null },
    ],
  },
  clientAccounts: [{ eventId: "e1", name: "דני כהן", email: "dani@example.test", role: "editor" }],
  venuesUsed: [],
  files: [],
};

const lines = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);
for (const [name, csv] of [["events", eventsCsv(d)], ["clients", clientsCsv(d)], ["catalog", catalogCsv(d)], ["billing", billingCsv(d)]] as const) {
  assert(csv.startsWith("\uFEFF"), `${name}: a UTF-8 BOM so Excel reads Hebrew`);
  assert(csv.includes("\r\n"), `${name}: CRLF rows`);
}
const events = eventsCsv(d);
assert(events.includes('"כהן, ""דני"""'), "a client name with a comma survives");
assert(events.includes('"רונית\nכהן"'), "a newline inside a cell survives, quoted");
const clients = clientsCsv(d);
assert(clients.includes("dani@example.test"), "the client's account email is listed with the event");
assert(clients.includes("לוי בע״מ") && clients.includes("515"), "the billing details are listed");
assert(lines(catalogCsv(d)).length === 2 && catalogCsv(d).includes("שולחן עגול"), "one header and one product");
const billing = billingCsv(d);
assert(billing.includes("1180.00") && billing.includes("180.00") && billing.includes("1000.00"), "totals in shekels with agorot");
assert(billing.includes("7"), "the document number");

console.log("check:export-csv — ok");
