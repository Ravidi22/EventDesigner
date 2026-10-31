"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck, ExternalLink, FileSignature, HandCoins, ReceiptText, TriangleAlert } from "lucide-react";
import { confirmEvent } from "@/lib/events/actions";
import type { EventSummary } from "@/lib/events/types";
import { formatEventDate } from "@/lib/events/types";
import { fetchEventBilling, type EventBilling } from "@/lib/billing/actions";
import { kindsFor } from "@/lib/billing/rules";
import { KIND_LABEL, STATUS_LABEL, documentName, type BillingDocument } from "@/lib/billing/types";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { Menu, type MenuItem } from "@/components/menu";
import { Skeleton } from "@/components/skeleton";
import { DrawerSection } from "./drawer-section";
import { toISODate } from "./dashboard-view-utils";
import { InvoiceDialog, OrderDialog, PaymentDialog, RequestDialog } from "./billing-dialogs";

// THE MONEY OF ONE EVENT, in the order it happens: the quote that went out → the ORDER (the client's
// yes, written down, with its payment schedule) → each installment and what came in against it →
// the documents, newest last → the balance. Everything but the quote line is lib/billing.
//
// ⚠ THIS IS THE CLIENT'S MONEY — prices, never costs. It replaced the booking card (which showed the
// quote's total and the one "הלקוח אישר" button) and it keeps that button's job: issuing an order
// sets `events.confirmedAt` the same way confirmEvent does, and a verbal yes is still recorded with
// the small link under the order button, because a client who says yes on the phone before the
// paperwork is a normal week and a system that refuses to record it teaches people to lie to it.
//
// Nothing here is a status somebody sets: "paid" is a sum of receipts, "late" is a date passed with
// the sum short, the balance is the order less the receipts (lib/billing/rules.ts eventLedger).
type Dialog = "order" | "payment" | "invoice" | "request";

export function EventBillingSection({
  event,
  onChanged,
  orderLines,
}: {
  event: EventSummary;
  onChanged: () => void;
  /** A VENUE's booking: the package figure's lines (lib/hosting packageLines). A venue's order is
   *  written from these, with no drawing quote before it (lib/billing issueOrder). */
  orderLines?: { label: string; amount: number }[];
}) {
  const [data, setData] = useState<EventBilling | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState(event.confirmedAt);

  useEffect(() => {
    let live = true;
    fetchEventBilling(event.id)
      .then((d) => {
        if (!live) return;
        setError(null);
        setData(d);
      })
      .catch(() => live && setError("לא ניתן לטעון את נתוני החיוב."));
    return () => {
      live = false;
    };
  }, [event.id, tick]);

  const done = (doc: BillingDocument) => {
    setDialog(null);
    if (doc.kind === "order") setConfirmedAt((v) => v ?? Date.now());
    setTick((t) => t + 1);
    onChanged();
  };

  const verbalYes = async () => {
    setBusy(true);
    try {
      const outcome = await confirmEvent(event.id);
      if (outcome.error) setError(outcome.error);
      else {
        setConfirmedAt(outcome.event.confirmedAt);
        onChanged();
      }
    } catch {
      setError("האישור לא נשמר — נסו שוב");
    } finally {
      setBusy(false);
    }
  };

  const ledger = data?.ledger;
  const order = ledger?.order;
  const kinds = data ? new Set(kindsFor(data.basis.vatStatus)) : new Set<string>();
  const documents = data?.documents ?? [];

  const more: MenuItem[] = [];
  const canOrder = !!data?.quote || !!orderLines;
  if (canOrder) more.push({ label: order ? "הזמנה מתוקנת" : "הפקת הזמנה", icon: FileSignature, onSelect: () => setDialog("order") });
  if (kinds.has("tax_invoice")) more.push({ label: "חשבונית מס לתשלום", icon: ReceiptText, onSelect: () => setDialog("invoice") });
  more.push({ label: "דרישת תשלום", icon: HandCoins, onSelect: () => setDialog("request") });

  return (
    <>
      <DrawerSection
        title="הצעת מחיר, הזמנה ותשלומים"
        action={data && more.length > 0 ? <Menu label="פעולות חיוב" items={more} /> : undefined}
      >
        {error ? (
          <p className="text-ink-soft">{error}</p>
        ) : !data ? (
          <div className="space-y-3" role="status" aria-label="טוען">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* The quote: the number the client was handed. */}
            <Line icon={<ReceiptText className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />} label={orderLines ? "לפי החבילה" : "הצעת מחיר"}>
              {orderLines ? (
                <span className="nums">{orderLines.length ? formatPrice(orderLines.reduce((n, l) => n + l.amount, 0)) : <span className="text-muted">לא נבחרה חבילה</span>}</span>
              ) : data.quote ? (
                <span className="nums">
                  {formatPrice(data.quote.total)}
                  <span className="text-muted"> · נשלחה {formatEventDate(toISODate(new Date(data.quote.issuedAt)))}</span>
                </span>
              ) : (
                <span className="text-muted">טרם הונפקה</span>
              )}
            </Line>

            {/* The order, or the way to one. */}
            {order ? (
              <div className="rounded-md border border-border-soft bg-inset px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/billing/${order.id}`} className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-accent">
                    <BadgeCheck className="h-4 w-4 shrink-0 text-success" strokeWidth={2} />
                    הזמנה {order.number}
                    <ExternalLink className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
                  </Link>
                  <span className="nums font-semibold text-ink">{formatPrice(order.totals.gross)}</span>
                </div>
                <p className="nums mt-0.5 text-xs text-muted">
                  אושרה {formatEventDate(order.documentDate)}
                  {confirmedAt && ` · הלקוח אישר ${formatEventDate(toISODate(new Date(confirmedAt)))}`}
                </p>
                {ledger && ledger.installments.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-border-soft pt-3">
                    {ledger.installments.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className={"inline-flex items-center gap-1.5 " + (i.state === "late" ? "font-medium text-alert-ink" : i.state === "paid" ? "text-muted" : "text-ink")}>
                          {i.state === "late" && <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />}
                          {i.label}
                          <span className="nums text-muted"> · עד {formatEventDate(i.dueDate)}</span>
                        </span>
                        <span className="nums">
                          {i.state === "paid" ? (
                            <span className="text-success-ink">שולם {formatPrice(i.amount)}</span>
                          ) : i.paid > 0 ? (
                            <>
                              <span className="text-success-ink">{formatPrice(i.paid)}</span>
                              <span className="text-muted"> מתוך {formatPrice(i.amount)}</span>
                            </>
                          ) : (
                            formatPrice(i.amount)
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {canOrder ? (
                  <Button variant="outline" className="w-full" onClick={() => setDialog("order")}>
                    <FileSignature className="h-4 w-4" strokeWidth={2} />
                    הלקוח אישר — הפקת הזמנה
                  </Button>
                ) : (
                  <p className="text-xs text-muted">הזמנה מופקת על הצעת מחיר שנשלחה.</p>
                )}
                {confirmedAt ? (
                  <p className="nums flex items-center gap-2 text-xs text-success-ink">
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    אושר בעל-פה {formatEventDate(toISODate(new Date(confirmedAt)))} — ללא הזמנה כתובה
                  </p>
                ) : (
                  event.quoteSentAt && (
                    <button type="button" onClick={() => void verbalYes()} disabled={busy} className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
                      אישור בעל-פה בלי מסמך
                    </button>
                  )
                )}
              </div>
            )}

            {/* Money in. */}
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialog("payment")} disabled={!order && !canOrder && documents.length === 0}>
                <HandCoins className="h-4 w-4" strokeWidth={2} />
                התקבל תשלום
              </Button>
              {ledger && (ledger.paid > 0 || order) && (
                <span className="nums text-sm">
                  {ledger.balance !== undefined && ledger.balance > 0.005 ? (
                    <>
                      <span className="text-muted">יתרה </span>
                      <span className="font-semibold text-ink">{formatPrice(ledger.balance)}</span>
                    </>
                  ) : ledger.balance !== undefined ? (
                    <span className="font-semibold text-success-ink">שולם במלואו</span>
                  ) : (
                    <>
                      <span className="text-muted">התקבלו </span>
                      <span className="font-semibold text-ink">{formatPrice(ledger.paid)}</span>
                    </>
                  )}
                </span>
              )}
            </div>

            {/* The documents, oldest first — the event's paper trail. */}
            {documents.length > 0 && (
              <ul className="divide-y divide-border-soft border-t border-border-soft">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 py-2 text-[13px]">
                    <Link href={`/billing/${d.id}`} className={"min-w-0 flex-1 truncate hover:text-accent " + (d.status === "cancelled" || d.status === "superseded" ? "text-muted line-through" : "text-ink")}>
                      {documentName(d)}
                    </Link>
                    <span className="nums shrink-0 text-xs text-muted">{formatEventDate(d.documentDate)}</span>
                    {d.allocationStatus === "pending" && <span className="shrink-0 text-xs text-warn-ink">ללא מס׳ הקצאה</span>}
                    {(d.status === "cancelled" || d.status === "superseded") && <span className="shrink-0 text-xs text-muted">{STATUS_LABEL[d.status]}</span>}
                    <span className={"nums shrink-0 " + (d.kind === "credit" ? "text-alert-ink" : "text-ink")}>
                      {d.kind === "credit" ? "−" : ""}
                      {formatPrice(d.totals.gross)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DrawerSection>

      {data && dialog === "order" && <OrderDialog event={event} billing={data} initialLines={orderLines} onClose={() => setDialog(null)} onDone={done} />}
      {data && dialog === "payment" && <PaymentDialog event={event} billing={data} onClose={() => setDialog(null)} onDone={done} />}
      {data && dialog === "invoice" && <InvoiceDialog event={event} billing={data} onClose={() => setDialog(null)} onDone={done} />}
      {data && dialog === "request" && <RequestDialog event={event} billing={data} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

function Line({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5 text-ink-soft">
      <span className="flex items-center gap-2.5">
        {icon}
        {label}
      </span>
      <span className="font-medium text-ink">{children}</span>
    </div>
  );
}

/** Kept for the ledger and the document page, which name kinds the same way. */
export const kindLabel = (d: Pick<BillingDocument, "kind">) => KIND_LABEL[d.kind];
