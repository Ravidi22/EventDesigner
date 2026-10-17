"use client";

import { useState } from "react";
import { Inbox, Phone } from "lucide-react";
import { answerOrder } from "@/lib/orders/actions";
import { ORDER_STATUS_LABEL, type IncomingOrder, type OrderStatus } from "@/lib/orders/types";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { TextField } from "@/components/text-field";
import { StatusChip } from "../suppliers/orders-tab";

const day = (iso: string) => iso.slice(0, 10);
const ANSWERS: { status: OrderStatus; label: string; variant: "primary" | "outline" | "danger" }[] = [
  { status: "confirmed", label: "אישור", variant: "primary" },
  { status: "partial", label: "אישור חלקי", variant: "outline" },
  { status: "delivered", label: "סופק", variant: "outline" },
  { status: "declined", label: "דחייה", variant: "danger" },
];

export function OrdersScreen({ initial }: { initial: IncomingOrder[] }) {
  const [orders, setOrders] = useState(initial);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = async (id: string, status: OrderStatus) => {
    setBusy(id);
    setError(null);
    try {
      setOrders(await answerOrder(id, status, reply[id]));
    } catch {
      setError("לא ניתן לעדכן את ההזמנה כרגע");
    } finally {
      setBusy(null);
    }
  };

  if (orders.length === 0) {
    return (
      <div className={PAGE_GUTTER}>
        <EmptyState
          icon={Inbox}
          title="עדיין אין הזמנות"
          body="כשמעצב מוסיף פריט שלכם לקטלוג שלו ומזמין אותו ממסך הרכש, ההזמנה מגיעה לכאן. ודאו שהפריטים שלכם מפורסמים בקטלוג."
        />
      </div>
    );
  }

  return (
    <div className={PAGE_GUTTER}>
      {error && (
        <p className="mb-4 rounded-md border border-alert bg-alert-tint px-4 py-2.5 text-sm text-ink" role="alert">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {orders.map((o) => {
          const total = o.lines.reduce((s, l) => s + (l.unitCost === undefined ? 0 : l.quantity * l.unitCost), 0);
          const open = o.status === "sent";
          return (
            <li key={o.id} className={`rounded-md border border-border bg-surface px-4 py-3.5 ${busy === o.id ? "opacity-60" : ""}`}>
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
                  <div className="truncate text-sm font-bold text-ink">{o.studioName}</div>
                  {o.studioPhone && (
                    <div className="nums inline-flex items-center gap-1 text-[13px] text-muted" dir="ltr">
                      <Phone className="h-3 w-3" strokeWidth={2} />
                      {o.studioPhone}
                    </div>
                  )}
                </div>
                <span className="nums text-sm font-semibold text-ink-soft">{formatPrice(total)}</span>
                <StatusChip status={o.status} />
              </div>

              <table className="mt-3 w-full text-sm">
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border-soft last:border-0">
                      <td className="py-1.5 text-ink">{l.description}</td>
                      <td className="nums w-32 py-1.5 text-start font-semibold text-ink">
                        {l.quantity} {l.unitLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {o.note && <p className="mt-2 text-xs text-muted">הערת הסטודיו: {o.note}</p>}

              {open ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <TextField
                    label="תשובה (לא חובה)"
                    value={reply[o.id] ?? ""}
                    onChange={(v) => setReply((r) => ({ ...r, [o.id]: v }))}
                    placeholder="מועד אספקה, מה חסר…"
                    wrapperClassName="min-w-[240px] flex-1"
                  />
                  {ANSWERS.map((a) => (
                    <Button key={a.status} size="sm" variant={a.variant} disabled={busy === o.id} onClick={() => void answer(o.id, a.status)}>
                      {a.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-ink-soft">
                  {ORDER_STATUS_LABEL[o.status]}
                  {o.reply && ` — ${o.reply}`}
                  {o.status !== "delivered" && o.status !== "declined" && (
                    <Button size="sm" variant="outline" className="ms-3" disabled={busy === o.id} onClick={() => void answer(o.id, "delivered")}>
                      סימון כסופק
                    </Button>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
