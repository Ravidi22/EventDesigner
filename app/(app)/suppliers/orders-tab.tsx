"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { fetchOrders, setOrderStatus } from "@/lib/orders/actions";
import { ORDER_STATUS_LABEL, type Order, type OrderStatus } from "@/lib/orders/types";
import { formatPrice } from "@/lib/catalog/format";
import { EmptyState } from "@/components/empty-state";
import { Menu, type MenuItem } from "@/components/menu";

const TONE: Record<OrderStatus, string> = {
  sent: "border-border text-ink-soft",
  confirmed: "border-success bg-success-tint text-success-ink",
  partial: "border-border bg-inset text-ink",
  delivered: "border-success bg-success-tint text-success-ink",
  declined: "border-alert bg-alert-tint text-alert-ink",
};

export function StatusChip({ status }: { status: OrderStatus }) {
  return <span className={`inline-flex rounded-pill border px-2 py-0.5 text-xs font-semibold ${TONE[status]}`}>{ORDER_STATUS_LABEL[status]}</span>;
}

const day = (iso: string) => iso.slice(0, 10);

export function OrdersTab({ onExpense }: { onExpense?: (order: Order) => void }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchOrders()
      .then((list) => live && setOrders(list))
      .catch(() => live && setError("לא ניתן לטעון את ההזמנות"));
    return () => {
      live = false;
    };
  }, []);

  const mark = async (id: string, status: OrderStatus) => {
    try {
      setOrders(await setOrderStatus(id, status));
    } catch {
      setError("לא ניתן לעדכן את ההזמנה");
    }
  };

  if (error) {
    return (
      <p className="rounded-md border border-alert bg-alert-tint px-4 py-2.5 text-sm text-ink" role="alert">
        {error}
      </p>
    );
  }
  if (!orders) return <p className="py-20 text-center text-sm text-muted">טוען הזמנות…</p>;
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="עדיין לא נשלחו הזמנות"
        body="הזמנה נשלחת ממסך הרכש: כל קבוצת ספק שם היא הזמנה אחת. ספק עם חשבון ב-Eve מקבל אותה לתיבה שלו ועונה כאן; ספק בלי חשבון מקבל אותה בוואטסאפ ואתם מסמנים מה קרה."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {orders.map((o) => {
        const actions: MenuItem[] = (["confirmed", "delivered", "declined"] as const)
          .filter((s) => s !== o.status)
          .map((s) => ({ label: `סימון: ${ORDER_STATUS_LABEL[s]}`, onSelect: () => void mark(o.id, s) }));
        // A delivered order is a bill about to arrive: the ledger row is prefilled from it (the
        // 10-14 spec's §4), typed only where the invoice differs. Never offered on a declined one.
        if (onExpense && o.status !== "declined") {
          actions.push({ label: "רישום הוצאה מההזמנה", onSelect: () => onExpense(o), separated: true });
        }
        const expanded = open === o.id;
        return (
          <li key={o.id} className="rounded-md border border-border bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="w-[96px] shrink-0">
                <div className="nums text-sm font-bold text-ink" dir="ltr">
                  {day(o.sentAt)}
                </div>
                <div className="nums text-[11px] text-muted" dir="ltr">
                  {o.windowFrom} – {o.windowTo}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setOpen(expanded ? null : o.id)} className="block max-w-full truncate text-start text-sm font-bold text-ink hover:text-accent-hover">
                  {o.supplierName}
                </button>
                <div className="nums text-[13px] text-muted">
                  {o.lines.length} שורות · {formatPrice(o.cost)}
                  {o.costPartial && " ומעלה"}
                  {!o.linked && " · ללא חשבון — סימון ידני"}
                </div>
              </div>
              <StatusChip status={o.status} />
              <Menu label={`אפשרויות להזמנה ל${o.supplierName}`} items={actions} className="-me-1 shrink-0" />
            </div>
            {o.reply && <p className="mt-2 rounded-sm bg-inset px-3 py-2 text-[13px] text-ink-soft">תשובת הספק: {o.reply}</p>}
            {expanded && (
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border-soft last:border-0">
                      <td className="py-1.5 text-ink">{l.description}</td>
                      <td className="nums w-32 py-1.5 text-start font-semibold text-ink">
                        {l.quantity} {l.unitLabel}
                      </td>
                      <td className="nums w-24 py-1.5 text-start text-ink-soft">{l.unitCost === undefined ? "—" : formatPrice(l.quantity * l.unitCost)}</td>
                    </tr>
                  ))}
                </tbody>
                {o.note && (
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="pt-2 text-xs text-muted">
                        הערה: {o.note}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </li>
        );
      })}
    </ul>
  );
}
