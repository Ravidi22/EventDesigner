"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, ReceiptText } from "lucide-react";
import type { Ledger, LedgerRow } from "@/lib/billing/actions";
import { DOCUMENT_KINDS, KIND_LABEL, STATUS_LABEL, documentName, type DocumentKind } from "@/lib/billing/types";
import { formatPrice } from "@/lib/catalog/format";
import { formatEventDate } from "@/lib/events/types";
import { useHeaderSearch } from "@/components/header-search-context";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { IconButton } from "@/components/icon-button";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { StatusChip } from "@/components/status-chip";

// The ledger: one month of documents, newest first, the month's figures above, the CSV the
// accountant wants in the corner. A LIST in the sidebar's register, not a dashboard — the numbers
// that matter are five, and they sit in one row of tiles.
//
// Filters are a lens over the month the server already read (the kind chips, the header search);
// the month itself is a route parameter, so a link to October is a link to October.
const KIND_FILTERS: { id: DocumentKind | "all"; label: string }[] = [{ id: "all", label: "הכול" }, ...DOCUMENT_KINDS.map((k) => ({ id: k, label: KIND_LABEL[k] }))];

const monthLabel = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function BillingScreen({ ledger }: { ledger: Ledger }) {
  const router = useRouter();
  const [kind, setKind] = useState<DocumentKind | "all">("all");
  const { value: search } = useHeaderSearch();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledger.rows.filter((r) => (kind === "all" || r.kind === kind) && (!q || r.clientName.toLowerCase().includes(q) || String(r.number).includes(q)));
  }, [ledger.rows, kind, search]);

  const go = (m: string) => router.push(`/billing?month=${m}`);

  return (
    <div className={`space-y-4 ${PAGE_GUTTER}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {/* → is the previous month in an RTL app: the arrows point where the months go. */}
          <IconButton label="החודש הקודם" onClick={() => go(shiftMonth(ledger.month, -1))}>
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </IconButton>
          <h2 className="min-w-[9rem] text-center font-display text-h2 text-ink">{monthLabel(ledger.month)}</h2>
          <IconButton label="החודש הבא" onClick={() => go(shiftMonth(ledger.month, 1))}>
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </IconButton>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCsv(ledger)} disabled={ledger.rows.length === 0}>
          <Download className="h-4 w-4" strokeWidth={2} />
          ייצוא לרואה החשבון (CSV)
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="מסמכים" value={String(ledger.totals.count)} />
        <Tile label="לפני מע״מ" value={formatPrice(ledger.totals.net)} />
        <Tile label="מע״מ" value={formatPrice(ledger.totals.vat)} />
        <Tile label="כולל מע״מ" value={formatPrice(ledger.totals.gross)} />
        <Tile label="התקבל בפועל" value={formatPrice(ledger.totals.received)} />
      </div>

      {(ledger.unsent > 0 || ledger.pendingAllocation > 0) && (
        <p className="text-sm text-warn-ink">
          {[ledger.unsent > 0 && `${ledger.unsent} מסמכים שהמקור שלהם עוד לא הופק`, ledger.pendingAllocation > 0 && `${ledger.pendingAllocation} חשבוניות ללא מספר הקצאה`].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setKind(f.id)}
            aria-pressed={kind === f.id}
            className={"rounded-pill border px-3 py-1 text-xs font-medium transition-colors " + (kind === f.id ? "border-accent bg-accent-tint text-accent" : "border-border text-ink-soft hover:border-accent-line hover:text-ink")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={ledger.rows.length === 0 ? "אין מסמכים בחודש הזה" : "אין מסמכים שתואמים לסינון"}
          body={ledger.rows.length === 0 ? "הזמנות, חשבוניות וקבלות מופקות מהמגירה של כל אירוע — ״הצעת מחיר, הזמנה ותשלומים״." : "נסו סוג אחר או חודש אחר."}
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-2.5 text-start font-medium">תאריך</th>
                <th className="px-4 py-2.5 text-start font-medium">מסמך</th>
                <th className="px-4 py-2.5 text-start font-medium">לקוח</th>
                <th className="px-4 py-2.5 text-end font-medium">לפני מע״מ</th>
                <th className="px-4 py-2.5 text-end font-medium">מע״מ</th>
                <th className="px-4 py-2.5 text-end font-medium">סה״כ</th>
                <th className="px-4 py-2.5 text-start font-medium">מצב</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="nums mt-0.5 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function Row({ row: r }: { row: LedgerRow }) {
  const dead = r.status === "cancelled" || r.status === "superseded";
  const sign = r.kind === "credit" ? "−" : "";
  return (
    <tr className={"border-b border-border-soft last:border-0 " + (dead ? "text-muted" : "text-ink")}>
      <td className="nums px-4 py-2.5">{formatEventDate(r.documentDate)}</td>
      <td className="px-4 py-2.5">
        <Link href={`/billing/${r.id}`} className={"font-medium hover:text-accent " + (dead ? "line-through" : "")}>
          {documentName(r)}
        </Link>
      </td>
      <td className="max-w-[16rem] truncate px-4 py-2.5">{r.clientName}</td>
      <td className="nums px-4 py-2.5 text-end">{r.kind === "order" || r.kind === "payment_request" ? "" : `${sign}${formatPrice(r.totals.net)}`}</td>
      <td className="nums px-4 py-2.5 text-end">{r.kind === "order" || r.kind === "payment_request" ? "" : `${sign}${formatPrice(r.totals.vat)}`}</td>
      <td className="nums px-4 py-2.5 text-end font-medium">
        {sign}
        {formatPrice(r.totals.gross)}
      </td>
      <td className="px-4 py-2.5">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <StatusChip tone={dead ? "neutral" : r.status === "sent" ? "success" : r.originalAt ? "accent" : "warn"}>{dead ? STATUS_LABEL[r.status] : r.status === "sent" ? "נשלח" : r.originalAt ? "מקור הופק" : "טרם נמסר"}</StatusChip>
          {r.allocationStatus === "pending" && <StatusChip tone="warn">ללא הקצאה</StatusChip>}
        </span>
      </td>
    </tr>
  );
}

/** The month as a spreadsheet: one row per document, every figure a plain number, UTF-8 with a BOM
 *  so Excel reads the Hebrew. Cancelled documents are listed and marked — the books show them. */
function downloadCsv(ledger: Ledger) {
  const head = ["תאריך", "סוג", "מספר", "לקוח", "לפני מע״מ", "מע״מ", "סה״כ", "מצב", "מספר הקצאה", "אמצעי תשלום", "אירוע"];
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ledger.rows.map((r) => {
    const sign = r.kind === "credit" ? -1 : 1;
    return [
      r.documentDate,
      KIND_LABEL[r.kind],
      r.number,
      r.clientName,
      r.kind === "order" || r.kind === "payment_request" ? "" : sign * r.totals.net,
      r.kind === "order" || r.kind === "payment_request" ? "" : sign * r.totals.vat,
      sign * r.totals.gross,
      STATUS_LABEL[r.status],
      r.allocationNumber ?? "",
      r.payment ? r.payment.means : "",
      r.eventId,
    ]
      .map(cell)
      .join(",");
  });
  const blob = new Blob(["﻿" + [head.map(cell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `eve-billing-${ledger.month}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
