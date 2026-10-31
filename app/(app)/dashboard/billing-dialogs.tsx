"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import {
  creditDocument,
  issueInvoice,
  issueOrder,
  issuePaymentRequest,
  recordPayment,
  type EventBilling,
} from "@/lib/billing/actions";
import {
  allocationRequired,
  amountTotals,
  cashCap,
  creditable,
  defaultSchedule,
  money,
  nextInstallment,
  rateFor,
  receiptKindFor,
  scheduleGap,
  toAgorot,
  validAllocationNumber,
} from "@/lib/billing/rules";
import {
  KIND_LABEL,
  PAYMENT_MEANS,
  PAYMENT_MEANS_LABEL,
  documentName,
  type BillingDocument,
  type DocumentCustomer,
  type DocumentLine,
  type DocumentPayment,
  type PaymentMeans,
  type ScheduleItem,
} from "@/lib/billing/types";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { CloseButton } from "@/components/close-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateField } from "@/components/date-field";
import { NumberField } from "@/components/number-field";
import { Select } from "@/components/select";
import { TextField } from "@/components/text-field";
import { SwitchRow } from "@/components/toggle";

// The five ways a billing document is made, each a small modal over the event drawer:
//
//   הזמנה          the client's yes — their legal details, the agreed lines, the payment schedule
//   התקבל תשלום    money arrived — amount, date, means and its details → a חשבונית מס/קבלה or a קבלה
//   חשבונית מס     an invoice to be paid later (a business client on terms)
//   דרישת תשלום    one installment, asked for in writing, with the bank details
//   חשבונית זיכוי  a reversal of an invoice, with the reason
//
// Every one ends in the same question — "להפיק?" — because issuing takes a number that can never be
// given back (lib/billing/actions.ts): the dialog is where the designer still can change their
// mind, and the ConfirmDialog is where they stop being able to.
//
// Nothing here computes a document: the server does, from the same rules (lib/billing/rules.ts)
// the previews here read, so what the dialog shows is what the row will say.

type Done = (doc: BillingDocument) => void;

/** The shell every billing dialog shares: a native <dialog> on the app's modal scrim, a titled
 *  header with the one ✕, a scrolling body, a footer. Mounted only while open, like EventDialog. */
function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`modal m-auto max-h-none w-[92vw] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog`}
    >
      <div className="flex max-h-[88vh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="font-display text-base text-ink">{title}</h2>
          <CloseButton onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">{footer}</footer>
      </div>
    </dialog>
  );
}

function Issue({ label, onClick, disabled, error }: { label: string; onClick: () => void; disabled?: boolean; error: string | null }) {
  return (
    <>
      <span role="status" className="min-w-0 text-xs font-medium text-alert-ink">
        {error}
      </span>
      <Button size="sm" onClick={onClick} disabled={disabled}>
        {label}
      </Button>
    </>
  );
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

// ── The payment's means, shared by a receipt and a refund ──────────────────────────────────────

const MEANS_OPTIONS = PAYMENT_MEANS.map((m) => ({ value: m, label: PAYMENT_MEANS_LABEL[m] }));

export function blankPayment(today: string, amount = 0): DocumentPayment {
  return { means: "transfer", amount, date: today };
}

/** The fields ניהול ספרים s.5 asks a receipt to carry, by means. `transaction` is the whole
 *  transaction's gross, for the cash cap. */
export function PaymentFields({ value, onChange, transaction, cashSoFar = 0 }: { value: DocumentPayment; onChange: (p: DocumentPayment) => void; transaction: number; cashSoFar?: number }) {
  const set = (p: Partial<DocumentPayment>) => onChange({ ...value, ...p });
  const cap = cashCap(Math.max(transaction, value.amount + cashSoFar));
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      <NumberField label="סכום (₪, כולל מע״מ)" min={0} value={value.amount} onChange={(amount) => set({ amount })} />
      <DateField label="תאריך התשלום" value={value.date} onChange={(date) => set({ date })} />
      <div>
        <span className="mb-1 block text-xs font-medium text-ink-soft">אמצעי התשלום</span>
        <Select value={value.means} onChange={(means) => set({ means: means as PaymentMeans })} options={MEANS_OPTIONS} className="w-full" aria-label="אמצעי התשלום" />
      </div>
      {value.means === "cash" && (
        <p className="nums self-end pb-2 text-xs text-ink-soft">
          מותר במזומן בעסקה זו: עד {cap.toLocaleString("he-IL")} ₪{cashSoFar > 0 ? ` (התקבלו כבר ${cashSoFar.toLocaleString("he-IL")} ₪)` : ""}
        </p>
      )}
      {value.means === "transfer" && (
        <>
          <TextField label="בנק" value={value.bank ?? ""} onChange={(bank) => set({ bank })} />
          <TextField label="אסמכתא" dir="ltr" value={value.reference ?? ""} onChange={(reference) => set({ reference })} className="text-end" />
        </>
      )}
      {value.means === "app" && <TextField label="אסמכתא / מספר העברה" dir="ltr" value={value.reference ?? ""} onChange={(reference) => set({ reference })} className="text-end" wrapperClassName="col-span-2" />}
      {value.means === "cheque" && (
        <>
          <TextField label="מספר השיק" dir="ltr" value={value.chequeNumber ?? ""} onChange={(chequeNumber) => set({ chequeNumber })} className="text-end" required />
          <DateField label="תאריך פירעון" value={value.chequeDate ?? ""} onChange={(chequeDate) => set({ chequeDate: chequeDate || undefined })} />
          <TextField label="בנק" value={value.bank ?? ""} onChange={(bank) => set({ bank })} />
          <div className="grid grid-cols-2 gap-x-3">
            <TextField label="סניף" dir="ltr" value={value.branch ?? ""} onChange={(branch) => set({ branch })} className="text-end" />
            <TextField label="חשבון" dir="ltr" value={value.account ?? ""} onChange={(account) => set({ account })} className="text-end" />
          </div>
        </>
      )}
      {value.means === "card" && (
        <>
          <TextField label="סוג הכרטיס" value={value.cardType ?? ""} onChange={(cardType) => set({ cardType })} placeholder="ויזה, מאסטרקארד…" />
          <TextField label="4 ספרות אחרונות" dir="ltr" value={value.last4 ?? ""} onChange={(last4) => set({ last4: last4.replace(/\D/g, "").slice(0, 4) })} className="text-end" required />
        </>
      )}
    </div>
  );
}

function AllocationField({ required, value, onChange }: { required: boolean; value: string; onChange: (v: string) => void }) {
  if (!required) return null;
  return (
    <div className="rounded-md border border-warn bg-warn-tint px-4 py-3">
      <TextField
        label="מספר הקצאה (חשבוניות ישראל)"
        dir="ltr"
        value={value}
        onChange={(v) => onChange(v.replace(/\D/g, "").slice(0, 9))}
        placeholder="9 ספרות"
        className="text-end"
        error={value.length > 0 && !validAllocationNumber(value)}
      />
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
        חשבונית מס מעל 5,000 ₪ לפני מע״מ צריכה מספר הקצאה מרשות המסים. אפשר להפיק בלעדיו ולהשלים אותו מעמוד המסמך — עד אז הלקוח לא יוכל לקזז את המע״מ.
      </p>
    </div>
  );
}

// ── הזמנה ──────────────────────────────────────────────────────────────────────────────────────

interface Line {
  id: string;
  label: string;
  amount: number;
}

export function OrderDialog({
  event,
  billing,
  initialLines,
  onClose,
  onDone,
}: {
  event: EventSummary;
  billing: EventBilling;
  /** A venue's package lines — the order starts from them instead of from a drawing quote. */
  initialLines?: { label: string; amount: number }[];
  onClose: () => void;
  onDone: Done;
}) {
  const quote = billing.quote;
  const previous = billing.ledger.order;
  const [customer, setCustomer] = useState<DocumentCustomer>(() => ({
    name: previous?.customer.name || event.billingName || event.clientName,
    address: previous?.customer.address || event.billingAddress || "",
    number: previous?.customer.number || event.billingNumber || "",
    phone: event.phone || undefined,
  }));
  // The quote's total as ONE line in the client's words, the typed extras as their own, so an order
  // reads like the quote it follows — editable, because a change after the quote ("בלי החופה") is
  // exactly what a superseding order records.
  const [lines, setLines] = useState<Line[]>(() => {
    if (previous) return previous.lines.map((l) => ({ id: l.key, label: l.label, amount: l.total }));
    if (initialLines?.length) return initialLines.map((l) => ({ id: uid(), label: l.label, amount: l.amount }));
    const extras = quote?.extras ?? [];
    const extrasSum = extras.reduce((n, e) => n + toAgorot(e.price), 0);
    const main = money(((quote?.total ?? 0) * 100 - extrasSum) / 100);
    return [
      { id: "design", label: `עיצוב ${quote?.eventType?.trim() || event.eventType?.trim() || "האירוע"}${quote ? ` לפי הצעת מחיר ${quote.reference}` : ""}`, amount: main },
      ...extras.map((e) => ({ id: uid(), label: e.label, amount: e.price })),
    ];
  });
  const total = useMemo(() => money(lines.reduce((n, l) => n + toAgorot(l.amount), 0) / 100), [lines]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>(() => previous?.schedule?.length ? previous.schedule : defaultSchedule(total, event.date || undefined, billing.today));
  const [note, setNote] = useState(previous?.note ?? "");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gap = scheduleGap(schedule, total);
  const rate = rateFor(billing.basis.vatStatus, billing.basis.vatRate);
  const totals = amountTotals(total, rate);

  const setLine = (id: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const setItem = (id: string, p: Partial<ScheduleItem>) => setSchedule((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)));
  /** Put whatever the schedule is short of on its last row — the one-click way to make it add up. */
  const settle = () =>
    setSchedule((ss) => {
      if (ss.length === 0) return defaultSchedule(total, event.date || undefined, billing.today);
      const last = ss[ss.length - 1];
      return [...ss.slice(0, -1), { ...last, amount: money(last.amount + gap) }];
    });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await issueOrder(event.id, {
        customer: { ...customer, number: customer.number || undefined },
        lines: lines.map((l): DocumentLine => ({ key: l.id, label: l.label, quantity: 1, unit: "unit", unitPrice: l.amount, total: l.amount })),
        schedule,
        note,
        documentDate: billing.today,
      });
      if ("error" in out) setError(out.error);
      else onDone(out);
    } catch {
      setError("ההזמנה לא הופקה — נסו שוב");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const canIssue = !!quote && lines.length > 0 && total > 0 && Math.abs(gap) < 0.005 && customer.name.trim().length > 0;

  return (
    <Modal title={previous ? `הזמנה מתוקנת (במקום הזמנה ${previous.number})` : "אישור ההזמנה"} onClose={onClose} wide footer={<Issue label="הפקת ההזמנה" onClick={() => setConfirm(true)} disabled={!canIssue || busy} error={error} />}>
      {!quote && <p className="rounded-md border border-warn bg-warn-tint px-4 py-2.5 text-sm text-ink">הזמנה מופקת על הצעת מחיר שנשלחה — שלחו קודם את ההצעה מהפלטים.</p>}

      <section>
        <h3 className="mb-2 text-xs font-semibold text-muted">הלקוח, כפי שיופיע על המסמכים</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <TextField label="שם לחיוב" value={customer.name} onChange={(name) => setCustomer({ ...customer, name })} required />
          <TextField label="ת.ז / ח.פ" dir="ltr" value={customer.number ?? ""} onChange={(number) => setCustomer({ ...customer, number })} className="text-end" placeholder="ללקוח עסקי" />
          <TextField label="כתובת" value={customer.address} onChange={(address) => setCustomer({ ...customer, address })} wrapperClassName="col-span-2" placeholder="נדרשת על חשבונית מס" />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-muted">מה הוזמן (הסכומים כוללים מע״מ)</h3>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="flex items-end gap-2">
              <TextField aria-label="תיאור" value={l.label} onChange={(label) => setLine(l.id, { label })} wrapperClassName="min-w-0 flex-1" />
              <NumberField aria-label="סכום" min={0} value={l.amount} onChange={(amount) => setLine(l.id, { amount })} className="w-32" />
              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="mb-1 rounded-sm p-1.5 text-muted hover:bg-alert-tint hover:text-alert" aria-label="הסרת השורה">
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setLines((ls) => [...ls, { id: uid(), label: "", amount: 0 }])} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
              שורה
            </button>
            <p className="nums text-sm text-ink">
              <span className="text-muted">סה״כ </span>
              <span className="font-semibold">{formatPrice(total)}</span>
              {rate > 0 && <span className="text-muted"> · מתוכו מע״מ {formatPrice(totals.vat)}</span>}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold text-muted">לוח התשלומים</h3>
        <div className="space-y-2">
          {schedule.map((s) => (
            <div key={s.id} className="flex items-end gap-2">
              <TextField aria-label="תשלום" value={s.label} onChange={(label) => setItem(s.id, { label })} wrapperClassName="min-w-0 flex-1" />
              <NumberField aria-label="סכום" min={0} value={s.amount} onChange={(amount) => setItem(s.id, { amount })} className="w-28" />
              <DateField aria-label="עד תאריך" value={s.dueDate} onChange={(dueDate) => setItem(s.id, { dueDate })} wrapperClassName="w-40" align="end" />
              <button type="button" onClick={() => setSchedule((ss) => ss.filter((x) => x.id !== s.id))} className="mb-1 rounded-sm p-1.5 text-muted hover:bg-alert-tint hover:text-alert" aria-label="הסרת התשלום">
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setSchedule((ss) => [...ss, { id: uid(), label: `תשלום ${ss.length + 1}`, amount: 0, dueDate: billing.today }])} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
              תשלום
            </button>
            {Math.abs(gap) < 0.005 ? (
              <span className="text-xs text-success-ink">לוח התשלומים מסתכם לסכום ההזמנה</span>
            ) : (
              <span className="nums inline-flex items-center gap-2 text-xs text-warn-ink">
                {gap > 0 ? `חסרים ${formatPrice(gap)}` : `עודף ${formatPrice(-gap)}`}
                <button type="button" onClick={settle} className="font-medium text-accent hover:text-accent-hover">
                  השלמה בתשלום האחרון
                </button>
              </span>
            )}
          </div>
        </div>
      </section>

      <TextField label="הערה על ההזמנה" multiline rows={2} value={note} onChange={setNote} placeholder="למשל: המחיר כולל הובלה, הקמה ופירוק." />

      <ConfirmDialog
        open={confirm}
        title="להפיק את ההזמנה?"
        body="ההזמנה תקבל מספר, האירוע יסומן כמאושר והמסמך לא יהיה ניתן לעריכה. שינוי מאוחר יותר נרשם בהזמנה מתוקנת."
        confirmLabel="הפקה"
        onConfirm={() => void submit()}
        onClose={() => setConfirm(false)}
      />
    </Modal>
  );
}

// ── התקבל תשלום ────────────────────────────────────────────────────────────────────────────────

export function PaymentDialog({ event, billing, onClose, onDone }: { event: EventSummary; billing: EventBilling; onClose: () => void; onDone: Done }) {
  const { ledger, basis, today } = billing;
  const next = nextInstallment(ledger.installments);
  const openInvoices = billing.documents.filter((d) => d.kind === "tax_invoice" && d.status !== "cancelled" && !billing.documents.some((r) => r.kind === "receipt" && r.followsId === d.id && r.status !== "cancelled"));
  const [payment, setPayment] = useState<DocumentPayment>(() => ({ ...blankPayment(today, next ? money(next.amount - next.paid) : (ledger.balance ?? 0)), scheduleItemId: next?.id }));
  const [against, setAgainst] = useState<string>("");
  const [allocation, setAllocation] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = receiptKindFor(basis.vatStatus, !!against);
  const rate = kind === "receipt" ? 0 : rateFor(basis.vatStatus, basis.vatRate);
  const totals = amountTotals(payment.amount, rate);
  const needsAllocation = allocationRequired(kind, totals.net, payment.date);
  const cashSoFar = billing.documents
    .filter((d) => d.status !== "cancelled" && d.payment?.means === "cash")
    .reduce((n, d) => n + (d.payment?.amount ?? 0), 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await recordPayment(event.id, {
        payment,
        label: payment.scheduleItemId ? ledger.installments.find((i) => i.id === payment.scheduleItemId)?.label : undefined,
        againstInvoiceId: against || undefined,
        allocationNumber: allocation || undefined,
        note,
      });
      if ("error" in out) setError(out.error);
      else onDone(out);
    } catch {
      setError("המסמך לא הופק — נסו שוב");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <Modal title="התקבל תשלום" onClose={onClose} footer={<Issue label={`הפקת ${KIND_LABEL[kind]}`} onClick={() => setConfirm(true)} disabled={busy || !(payment.amount > 0)} error={error} />}>
      {ledger.installments.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-medium text-ink-soft">עבור</span>
          <Select
            value={payment.scheduleItemId ?? ""}
            onChange={(id) => {
              const item = ledger.installments.find((i) => i.id === id);
              setPayment({ ...payment, scheduleItemId: id || undefined, amount: item ? money(item.amount - item.paid) : payment.amount });
            }}
            options={[{ value: "", label: "תשלום כללי" }, ...ledger.installments.map((i) => ({ value: i.id, label: `${i.label} · ${formatPrice(i.amount)}${i.paid > 0 ? ` (שולמו ${formatPrice(i.paid)})` : ""}` }))]}
            className="w-full"
            aria-label="עבור"
          />
        </div>
      )}
      {openInvoices.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-medium text-ink-soft">על חשבונית מס שהופקה</span>
          <Select
            value={against}
            onChange={(id) => {
              setAgainst(id);
              const inv = openInvoices.find((d) => d.id === id);
              if (inv) setPayment({ ...payment, amount: inv.totals.gross });
            }}
            options={[{ value: "", label: "לא — תשלום חדש" }, ...openInvoices.map((d) => ({ value: d.id, label: `${documentName(d)} · ${formatPrice(d.totals.gross)}` }))]}
            className="w-full"
            aria-label="על חשבונית"
          />
        </div>
      )}
      <PaymentFields value={payment} onChange={setPayment} transaction={ledger.order?.totals.gross ?? payment.amount} cashSoFar={cashSoFar} />
      <p className="nums text-xs text-ink-soft">
        יופק: <span className="font-semibold text-ink">{KIND_LABEL[kind]}</span>
        {rate > 0 && ` · לפני מע״מ ${formatPrice(totals.net)} · מע״מ ${formatPrice(totals.vat)}`}
      </p>
      <AllocationField required={needsAllocation} value={allocation} onChange={setAllocation} />
      <TextField label="הערה" multiline rows={2} value={note} onChange={setNote} />
      <ConfirmDialog open={confirm} title={`להפיק ${KIND_LABEL[kind]} על ${formatPrice(payment.amount)}?`} body="המסמך יקבל מספר ולא יהיה ניתן לעריכה. טעות מתקנים בחשבונית זיכוי." confirmLabel="הפקה" onConfirm={() => void submit()} onClose={() => setConfirm(false)} />
    </Modal>
  );
}

// ── חשבונית מס (לתשלום) ────────────────────────────────────────────────────────────────────────

export function InvoiceDialog({ event, billing, onClose, onDone }: { event: EventSummary; billing: EventBilling; onClose: () => void; onDone: Done }) {
  const { ledger, basis, today } = billing;
  const next = nextInstallment(ledger.installments);
  const [amount, setAmount] = useState(next ? money(next.amount - next.paid) : (ledger.balance ?? 0));
  const [label, setLabel] = useState(next?.label ?? "");
  const [date, setDate] = useState(today);
  const [allocation, setAllocation] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totals = amountTotals(amount, rateFor(basis.vatStatus, basis.vatRate));
  const needsAllocation = allocationRequired("tax_invoice", totals.net, date);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await issueInvoice(event.id, { amount, label, documentDate: date, allocationNumber: allocation || undefined, note });
      if ("error" in out) setError(out.error);
      else onDone(out);
    } catch {
      setError("החשבונית לא הופקה — נסו שוב");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <Modal title="חשבונית מס לתשלום" onClose={onClose} footer={<Issue label="הפקת חשבונית מס" onClick={() => setConfirm(true)} disabled={busy || !(amount > 0)} error={error} />}>
      <p className="text-[13px] leading-relaxed text-ink-soft">ללקוח שמשלם אחרי קבלת החשבונית. כשהכסף יגיע — ״התקבל תשלום״ על החשבונית הזו מפיק קבלה.</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <NumberField label="סכום (₪, כולל מע״מ)" min={0} value={amount} onChange={setAmount} />
        <DateField label="תאריך" value={date} onChange={setDate} />
        <TextField label="עבור" value={label} onChange={setLabel} wrapperClassName="col-span-2" placeholder="מקדמה / יתרה / עיצוב האירוע" />
      </div>
      <p className="nums text-xs text-ink-soft">
        לפני מע״מ {formatPrice(totals.net)} · מע״מ {formatPrice(totals.vat)}
      </p>
      <AllocationField required={needsAllocation} value={allocation} onChange={setAllocation} />
      <TextField label="הערה" multiline rows={2} value={note} onChange={setNote} />
      <ConfirmDialog open={confirm} title={`להפיק חשבונית מס על ${formatPrice(amount)}?`} body="המסמך יקבל מספר ולא יהיה ניתן לעריכה." confirmLabel="הפקה" onConfirm={() => void submit()} onClose={() => setConfirm(false)} />
    </Modal>
  );
}

// ── דרישת תשלום ────────────────────────────────────────────────────────────────────────────────

export function RequestDialog({ event, billing, onClose, onDone }: { event: EventSummary; billing: EventBilling; onClose: () => void; onDone: Done }) {
  const { ledger, today } = billing;
  const next = nextInstallment(ledger.installments);
  const [amount, setAmount] = useState(next ? money(next.amount - next.paid) : (ledger.balance ?? 0));
  const [label, setLabel] = useState(next?.label ?? "");
  const [dueDate, setDueDate] = useState(next?.dueDate ?? today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await issuePaymentRequest(event.id, { amount, label, dueDate, scheduleItemId: next?.id, note });
      if ("error" in out) setError(out.error);
      else onDone(out);
    } catch {
      setError("הדרישה לא הופקה — נסו שוב");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="דרישת תשלום" onClose={onClose} footer={<Issue label="הפקת דרישת תשלום" onClick={() => void submit()} disabled={busy || !(amount > 0)} error={error} />}>
      <p className="text-[13px] leading-relaxed text-ink-soft">בקשה בכתב לתשלום אחד, עם פרטי הבנק להעברה. אינה חשבונית ואינה מדווחת — החשבונית מופקת כשהכסף מגיע.</p>
      {!billing.basis.bankDetails && <p className="rounded-md border border-warn bg-warn-tint px-4 py-2.5 text-sm text-ink">לא הוגדרו פרטי בנק — הגדרות → חיוב ומסמכים.</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <NumberField label="סכום (₪)" min={0} value={amount} onChange={setAmount} />
        <DateField label="לתשלום עד" value={dueDate} onChange={setDueDate} />
        <TextField label="עבור" value={label} onChange={setLabel} wrapperClassName="col-span-2" placeholder="מקדמה / יתרה" />
      </div>
      <TextField label="הערה" multiline rows={2} value={note} onChange={setNote} />
    </Modal>
  );
}

// ── חשבונית זיכוי ──────────────────────────────────────────────────────────────────────────────

export function CreditDialog({ invoice, credits, today, onClose, onDone }: { invoice: BillingDocument; credits: BillingDocument[]; today: string; onClose: () => void; onDone: Done }) {
  const left = creditable(invoice, credits);
  const [amount, setAmount] = useState(left);
  const [reason, setReason] = useState("");
  const [withRefund, setWithRefund] = useState(invoice.kind !== "tax_invoice");
  const [refund, setRefund] = useState<DocumentPayment>(() => blankPayment(today, left));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await creditDocument(invoice.id, { amount, reason, refund: withRefund ? { ...refund, amount: Math.min(refund.amount, amount) } : undefined, documentDate: today });
      if ("error" in out) setError(out.error);
      else onDone(out);
    } catch {
      setError("הזיכוי לא הופק — נסו שוב");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <Modal title={`חשבונית זיכוי על ${documentName(invoice)}`} onClose={onClose} footer={<Issue label="הפקת חשבונית זיכוי" onClick={() => setConfirm(true)} disabled={busy || !(amount > 0) || amount > left + 0.005 || !reason.trim()} error={error} />}>
      <p className="nums text-[13px] leading-relaxed text-ink-soft">
        {documentName(invoice)} מיום {invoice.documentDate} על {formatPrice(invoice.totals.gross)}
        {left < invoice.totals.gross && ` · נותרו לזיכוי ${formatPrice(left)}`}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <NumberField label="סכום הזיכוי (₪, כולל מע״מ)" min={0} max={left} value={amount} onChange={setAmount} />
        <TextField label="סיבת הזיכוי" value={reason} onChange={setReason} required placeholder="ביטול האירוע / שינוי בהזמנה / טעות" />
      </div>
      <SwitchRow checked={withRefund} onChange={setWithRefund} label="הכסף הוחזר ללקוח" hint="נרשם על הזיכוי כאמצעי ההחזר. כבוי — הזיכוי מקזז חשבונית שטרם שולמה." />
      {withRefund && <PaymentFields value={refund} onChange={setRefund} transaction={amount} />}
      <ConfirmDialog open={confirm} title={`להפיק חשבונית זיכוי על ${formatPrice(amount)}?`} body="הזיכוי יקבל מספר ויודפס עם מספר החשבונית המזוכה והסיבה." confirmLabel="הפקה" onConfirm={() => void submit()} onClose={() => setConfirm(false)} />
    </Modal>
  );
}
