"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import type { OrderLine, RentalLine, SupplierGroup } from "@/lib/suppliers/procurement";
import { sendOrder } from "@/lib/orders/actions";
import type { OrderLineInput } from "@/lib/orders/types";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { Drawer } from "@/components/drawer";
import { NumberField } from "@/components/number-field";
import { TextField } from "@/components/text-field";

/** What the procurement tab hands over: one supplier's group and the window it was reduced over. */
export interface OrderDraft {
  group: SupplierGroup<OrderLine | RentalLine>;
  windowFrom: string;
  windowTo: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A rental line is one event's; its description names the event so the supplier knows which day. */
function describe(l: OrderLine | RentalLine): string {
  return "eventId" in l ? `${l.label} — ${l.eventLabel} (${l.date})` : l.label;
}

export function OrderDrawer({ draft, onSent, onClose }: { draft: OrderDraft; onSent: (text: string) => void; onClose: () => void }) {
  const { group } = draft;
  const [lines, setLines] = useState<OrderLineInput[]>(() =>
    group.lines.map((l) => ({
      variantId: l.variantId,
      description: describe(l),
      quantity: l.quantity,
      unitLabel: l.unitLabel,
      unitCost: l.cost === undefined || l.quantity === 0 ? undefined : round2(l.cost / l.quantity),
    })),
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kept = lines.filter((l) => l.quantity > 0);
  const total = kept.reduce((s, l) => s + (l.unitCost === undefined ? 0 : l.quantity * l.unitCost), 0);
  const partial = kept.some((l) => l.unitCost === undefined);

  const send = async () => {
    if (!group.supplierId || kept.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await sendOrder({ supplierId: group.supplierId, windowFrom: draft.windowFrom, windowTo: draft.windowTo, note, lines: kept });
      onSent(`ההזמנה ל${group.supplierName} נשלחה — ${kept.length} שורות.`);
      onClose();
    } catch {
      setError("לא ניתן לשלוח את ההזמנה כרגע");
      setBusy(false);
    }
  };

  return (
    <Drawer title={`הזמנה — ${group.supplierName}`} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <p className="text-xs leading-relaxed text-muted">
            הכמויות נלקחו מהתוכניות לטווח{" "}
            <span className="nums" dir="ltr">
              {draft.windowFrom} – {draft.windowTo}
            </span>
            . אפשר לתקן לפני השליחה; שורה עם 0 לא נשלחת.
          </p>
          <table className="w-full text-sm">
            <tbody>
              {lines.map((l, i) => (
                <tr key={`${l.variantId}-${i}`} className="border-b border-border-soft last:border-0">
                  <td className="py-2 pe-3 text-ink">{l.description}</td>
                  <td className="w-36 py-2">
                    <NumberField
                      aria-label={`כמות — ${l.description}`}
                      value={l.quantity}
                      min={0}
                      decimals={2}
                      onChange={(quantity) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, quantity } : x)))}
                      className="w-24"
                    />
                  </td>
                  <td className="w-16 py-2 text-xs text-muted">{l.unitLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TextField label="הערה לספק" multiline rows={3} value={note} onChange={setNote} placeholder="שעת אספקה, כתובת, מי מקבל…" />
          {error && (
            <p className="rounded-md border border-alert bg-alert-tint px-3 py-2 text-sm text-ink" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <span className="flex items-baseline gap-1.5">
            <span className="text-sm text-muted">סה״כ משוער</span>
            <span className="nums text-base font-bold text-ink">{formatPrice(total)}</span>
            {partial && <span className="text-xs text-muted">ומעלה</span>}
          </span>
          <Button onClick={() => void send()} disabled={busy || kept.length === 0} icon={<Send className="h-4 w-4" strokeWidth={2} />}>
            {busy ? "שולחים…" : "שליחת ההזמנה"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
