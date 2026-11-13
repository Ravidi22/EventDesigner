"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Banknote,
  CircleCheck,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileText,
  HandCoins,
  Landmark,
  Plus,
  ReceiptText,
  Send,
  Smartphone,
  Trash2,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from "lucide-react";
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
  type Installment,
} from "@/lib/billing/rules";
import {
  KIND_LABEL,
  documentName,
  type BillingDocument,
  type DocumentCustomer,
  type DocumentKind,
  type DocumentLine,
  type DocumentPayment,
  type DocumentTotals,
  type PaymentMeans,
  type ScheduleItem,
} from "@/lib/billing/types";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { fieldLabelClassName } from "@/components/control";
import { DateField } from "@/components/date-field";
import { MODAL_CLASS, ModalFooter, ModalHeader, ModalStatus } from "@/components/modal-frame";
import { NumberField } from "@/components/number-field";
import { Segmented } from "@/components/segmented";
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
// Every one but the request ends in the same question — "להפיק?" — because issuing takes a number
// that can never be given back (lib/billing/actions.ts): the dialog is where the designer still can
// change their mind, and the ConfirmDialog is where they stop being able to. That question is the
// NEUTRAL tone (accent tile, FileCheck2): issuing is final, but it destroys nothing — the alert tile
// is for deletes (board 4c).
//
// Nothing here computes a document: the server does, from the same rules (lib/billing/rules.ts)
// the previews here read, so what the dialog shows is what the row will say.
//
// All five wear the one modal frame (components/modal-frame.tsx; the "Modals & popups" board, 4d):
// a tile per kind, the event's money in the header's facts, the primary first in the footer, then
// ביטול, then what is final about this document at the far end — where a failure takes its place.

type Done = (doc: BillingDocument) => void;

/** What the footer's `Issue` reads off its `Modal`: the window's standing status (which an error
 *  replaces) and its way out. Context, so every dialog writes its footer as one `<Issue>`. */
const FrameOf = createContext<{ status?: ReactNode; onClose: () => void }>({ onClose: () => {} });

/** The shell every billing dialog shares: a native <dialog> on the app's modal scrim wearing the
 *  frame — a header with the kind's tile, the title and its facts, a scrolling body, a footer.
 *  Mounted only while open, like EventDialog. */
function Modal({
  title,
  tile: Tile,
  facts,
  status,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  tile: LucideIcon;
  facts?: ReactNode;
  /** What is final about this document, at the footer's far end. */
  status?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  // Its OWN close and cancel only. Neither bubbles in the DOM, but React dispatches both up the
  // fiber tree — so the "להפיק?" ConfirmDialog inside this one, answered ביטול or Escaped, used to
  // shut the whole billing dialog too (and an issue that failed lost its error with it). The
  // event drawer learned the same thing (components/drawer.tsx).
  return (
    <dialog
      ref={ref}
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      // ⚠ NEVER PUT A `display` UTILITY ON THE <dialog> ITSELF — see components/event-dialog.tsx.
      className={MODAL_CLASS}
    >
      <div className={`flex max-h-[88vh] flex-col ${wide ? "w-[min(92vw,42rem)]" : "w-[min(92vw,33rem)]"}`}>
        <ModalHeader tile={<Tile className="h-[18px] w-[18px]" strokeWidth={1.75} />} title={title} facts={facts} onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4">{children}</div>
        <ModalFooter>
          <FrameOf.Provider value={{ status, onClose }}>{footer}</FrameOf.Provider>
        </ModalFooter>
      </div>
    </dialog>
  );
}

/** The footer: the press that issues, ביטול, and at the far end the error — or, while there is
 *  none, the window's status. */
function Issue({ label, onClick, disabled, error }: { label: string; onClick: () => void; disabled?: boolean; error: string | null }) {
  const { status, onClose } = useContext(FrameOf);
  return (
    <>
      <Button size="sm" onClick={onClick} disabled={disabled}>
        {label}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose}>
        ביטול
      </Button>
      {error ? <ModalStatus tone="alert">{error}</ModalStatus> : status ? <ModalStatus>{status}</ModalStatus> : null}
    </>
  );
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

/** A sum in a Hebrew line, isolated left-to-right: "₪-500" (an overpaid balance) has no strong
 *  character of its own, and the bidi algorithm would print its sign on the wrong side. */
function Money({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span dir="ltr" className={`nums ${className}`}>
      {formatPrice(value)}
    </span>
  );
}

/** "1.11" — a due day the way the board writes it; with the year for a document's own date. */
function dayMonth(iso: string, withYear = false): string {
  const [y, m, d] = iso.split("-");
  return withYear ? `${Number(d)}.${Number(m)}.${y}` : `${Number(d)}.${Number(m)}`;
}

/** The header's facts on an event's billing window: whose money, which order, what is left of it —
 *  the three things the designer never opens one of these without wanting (board 4d). Read off the
 *  ledger the rules derived (`eventLedger`), never added up here. */
function ledgerFacts(event: EventSummary, { ledger }: EventBilling): ReactNode {
  const order = ledger.order;
  return (
    <>
      {event.clientName}
      {" · "}
      {order ? `הזמנה ${order.number}` : "ללא הזמנה"}
      {order && ledger.balance != null && (
        <>
          {" · יתרה "}
          <Money value={ledger.balance} />
          {" מתוך "}
          <Money value={order.totals.gross} />
        </>
      )}
    </>
  );
}

/** What the press will make, in one inset line above the footer (board 4d): the KIND — the studio's
 *  VAT standing and the invoice picked decide it, never the designer — and, where VAT applies, the
 *  split the document will print. */
function IssuedLine({ kind, totals }: { kind: DocumentKind; totals: DocumentTotals }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-inset-border bg-inset px-3.5 py-2.5 text-[13px] text-ink-soft">
      <ReceiptText className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1">
        יופק <b className="font-semibold text-ink">{KIND_LABEL[kind]}</b>
      </span>
      {totals.vatRate > 0 && (
        <span className="shrink-0 text-xs text-muted">
          לפני מע״מ <Money value={totals.net} /> · מע״מ <Money value={totals.vat} />
        </span>
      )}
    </div>
  );
}

/** The note most documents never carry, behind "+ הערה" (board 4d) — open from the start when it
 *  already has text, and focused when it is asked for. */
function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(value.trim().length > 0);
  const [asked, setAsked] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setAsked(true);
        }}
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-accent hover:text-accent-hover"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
        הערה
      </button>
    );
  return <TextField label="הערה" multiline rows={2} value={value} onChange={onChange} autoFocus={asked} />;
}

// ── The payment's means, shared by a receipt and a refund ──────────────────────────────────────

// The means as the segmented row asks them, in the board's order, in short words. The long ones
// (PAYMENT_MEANS_LABEL) are what a DOCUMENT prints — "העברה בנקאית", "ביט / פייבוקס".
const MEANS: readonly (readonly [PaymentMeans, string, LucideIcon])[] = [
  ["transfer", "העברה", Landmark],
  ["card", "אשראי", CreditCard],
  ["app", "אפליקציה", Smartphone],
  ["cheque", "שיק", FileText],
  ["cash", "מזומן", Banknote],
];

export function blankPayment(today: string, amount = 0): DocumentPayment {
  return { means: "transfer", amount, date: today };
}

/** The fields ניהול ספרים s.5 asks a receipt to carry, by means. `transaction` is the whole
 *  transaction's gross, for the cash cap. The amount is GROSS, as every amount typed on a document. */
export function PaymentFields({ value, onChange, transaction, cashSoFar = 0 }: { value: DocumentPayment; onChange: (p: DocumentPayment) => void; transaction: number; cashSoFar?: number }) {
  const set = (p: Partial<DocumentPayment>) => onChange({ ...value, ...p });
  const cap = cashCap(Math.max(transaction, value.amount + cashSoFar));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="סכום כולל מע״מ" min={0} value={value.amount} onChange={(amount) => set({ amount })} />
        <DateField label="תאריך התשלום" value={value.date} onChange={(date) => set({ date })} />
      </div>
      <Segmented label="אמצעי התשלום" value={value.means} options={MEANS} onChange={(means) => set({ means })} />
      {/* The chosen means' own fields under it — the rules unchanged. */}
      {value.means === "cash" && (
        <p className="nums text-xs text-ink-soft">
          מותר במזומן בעסקה זו: עד {cap.toLocaleString("he-IL")} ₪{cashSoFar > 0 ? ` (התקבלו כבר ${cashSoFar.toLocaleString("he-IL")} ₪)` : ""}
        </p>
      )}
      {value.means !== "cash" && (
        <div className="grid grid-cols-2 gap-3">
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
    <Modal
      title={previous ? `הזמנה מתוקנת (במקום הזמנה ${previous.number})` : "אישור ההזמנה"}
      tile={ClipboardCheck}
      facts={ledgerFacts(event, billing)}
      status="הזמנה שהופקה משתנה רק בהזמנה מתוקנת"
      onClose={onClose}
      wide
      footer={<Issue label="הפקת ההזמנה" onClick={() => setConfirm(true)} disabled={!canIssue || busy} error={error} />}
    >
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
        tone="neutral"
        icon={FileCheck2}
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

/** "עבור" IS the ledger (board 4d), not a dropdown that hides it: every installment with what is
 *  left of it — the paid ones greyed with a tick, the late one flagged — and "תשלום אחר" for money
 *  that answers none of them. Picking a row fills the amount with what is left of it. Native radios
 *  under the drawn dots, so the arrow keys walk the rows (in the page's direction) for free. */
function LedgerChoice({ list, eventDate, value, onPick }: { list: Installment[]; eventDate: string; value: string | undefined; onPick: (i: Installment | undefined) => void }) {
  const name = useId();
  const row = (on: boolean) =>
    `relative flex cursor-pointer items-center gap-2.5 px-3 py-2.5 ${on ? "bg-accent-tint outline-[1.5px] -outline-offset-[1.5px] outline-accent" : "hover:bg-inset"}`;
  // The dot's ring is `faint`, a step darker than the board's: a 16px control's edge needs its 3:1.
  const dot = (on: boolean) => (
    <span
      aria-hidden
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${on ? "border-accent" : "border-faint"}`}
    >
      {on && <span className="h-2 w-2 rounded-full bg-accent" />}
    </span>
  );
  return (
    <div role="radiogroup" aria-labelledby={`${name}-label`}>
      <span id={`${name}-label`} className={fieldLabelClassName}>
        עבור
      </span>
      <div className="divide-y divide-border-soft overflow-hidden rounded-md border border-border text-[13px]">
        {list.map((i) => {
          if (i.state === "paid")
            return (
              <div key={i.id} className="flex items-center gap-2.5 bg-inset px-3 py-2.5 text-muted">
                <CircleCheck className="h-4 w-4 shrink-0 text-success" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1">{i.label} · שולם</span>
                <Money value={i.amount} />
              </div>
            );
          const on = value === i.id;
          return (
            <label key={i.id} className={row(on)}>
              <input type="radio" name={name} checked={on} onChange={() => onPick(i)} className="peer sr-only" />
              {dot(on)}
              <span className={`min-w-0 flex-1 text-ink ${on ? "font-semibold" : ""}`}>
                {i.label} · {i.dueDate === eventDate ? "ביום האירוע" : <>עד <span className="nums">{dayMonth(i.dueDate)}</span></>}
                {i.paid > 0 && (
                  <span className="font-normal text-muted">
                    {" · שולמו "}
                    <Money value={i.paid} />
                  </span>
                )}
                {i.state === "late" && (
                  <span className="ms-1.5 inline-flex items-center gap-1 text-xs font-bold text-alert-ink">
                    <TriangleAlert className="h-3 w-3" strokeWidth={2} aria-hidden />
                    באיחור
                  </span>
                )}
              </span>
              <Money value={money(i.amount - i.paid)} className={on ? "font-bold text-ink" : "text-ink"} />
            </label>
          );
        })}
        <label className={row(value === undefined)}>
          <input type="radio" name={name} checked={value === undefined} onChange={() => onPick(undefined)} className="peer sr-only" />
          {dot(value === undefined)}
          <span className={`min-w-0 flex-1 text-ink ${value === undefined ? "font-semibold" : ""}`}>תשלום אחר</span>
        </label>
      </div>
    </div>
  );
}

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
    <Modal
      title="התקבל תשלום"
      tile={HandCoins}
      facts={ledgerFacts(event, billing)}
      status="מספר המסמך סופי — תיקון בזיכוי"
      onClose={onClose}
      footer={<Issue label={`הפקת ${KIND_LABEL[kind]}`} onClick={() => setConfirm(true)} disabled={busy || !(payment.amount > 0)} error={error} />}
    >
      {ledger.installments.length > 0 && (
        <LedgerChoice
          list={ledger.installments}
          eventDate={event.date}
          value={payment.scheduleItemId}
          onPick={(item) => setPayment({ ...payment, scheduleItemId: item?.id, amount: item ? money(item.amount - item.paid) : payment.amount })}
        />
      )}
      {openInvoices.length > 0 && (
        <div>
          <span className={fieldLabelClassName}>על חשבונית מס שהופקה</span>
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
      <AllocationField required={needsAllocation} value={allocation} onChange={setAllocation} />
      <IssuedLine kind={kind} totals={totals} />
      <NoteField value={note} onChange={setNote} />
      <ConfirmDialog
        open={confirm}
        tone="neutral"
        icon={FileCheck2}
        title={`להפיק ${KIND_LABEL[kind]} על ${formatPrice(payment.amount)}?`}
        body="המסמך יקבל מספר ולא יהיה ניתן לעריכה. טעות מתקנים בחשבונית זיכוי."
        confirmLabel="הפקה"
        onConfirm={() => void submit()}
        onClose={() => setConfirm(false)}
      />
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
    <Modal
      title="חשבונית מס לתשלום"
      tile={ReceiptText}
      facts={ledgerFacts(event, billing)}
      status="מספר המסמך סופי — תיקון בזיכוי"
      onClose={onClose}
      footer={<Issue label="הפקת חשבונית מס" onClick={() => setConfirm(true)} disabled={busy || !(amount > 0)} error={error} />}
    >
      <p className="text-[13px] leading-relaxed text-ink-soft">ללקוח שמשלם אחרי קבלת החשבונית. כשהכסף יגיע — ״התקבל תשלום״ על החשבונית הזו מפיק קבלה.</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="סכום כולל מע״מ" min={0} value={amount} onChange={setAmount} />
        <DateField label="תאריך" value={date} onChange={setDate} />
        <TextField label="עבור" value={label} onChange={setLabel} wrapperClassName="col-span-2" placeholder="מקדמה / יתרה / עיצוב האירוע" />
      </div>
      <AllocationField required={needsAllocation} value={allocation} onChange={setAllocation} />
      <IssuedLine kind="tax_invoice" totals={totals} />
      <NoteField value={note} onChange={setNote} />
      <ConfirmDialog
        open={confirm}
        tone="neutral"
        icon={FileCheck2}
        title={`להפיק חשבונית מס על ${formatPrice(amount)}?`}
        body="המסמך יקבל מספר ולא יהיה ניתן לעריכה."
        confirmLabel="הפקה"
        onConfirm={() => void submit()}
        onClose={() => setConfirm(false)}
      />
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

  // No "להפיק?" here: a request is not fiscal — the footer's status says so — and a wrong one is
  // simply followed by the right one.
  return (
    <Modal
      title="דרישת תשלום"
      tile={Send}
      facts={ledgerFacts(event, billing)}
      status="דרישת תשלום אינה מסמך מס"
      onClose={onClose}
      footer={<Issue label="הפקת דרישת תשלום" onClick={() => void submit()} disabled={busy || !(amount > 0)} error={error} />}
    >
      <p className="text-[13px] leading-relaxed text-ink-soft">בקשה בכתב לתשלום אחד, עם פרטי הבנק להעברה. אינה מדווחת — החשבונית מופקת כשהכסף מגיע.</p>
      {!billing.basis.bankDetails && <p className="rounded-md border border-warn bg-warn-tint px-4 py-2.5 text-sm text-ink">לא הוגדרו פרטי בנק — הגדרות → חיוב ומסמכים.</p>}
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="סכום (₪)" min={0} value={amount} onChange={setAmount} />
        <DateField label="לתשלום עד" value={dueDate} onChange={setDueDate} />
        <TextField label="עבור" value={label} onChange={setLabel} wrapperClassName="col-span-2" placeholder="מקדמה / יתרה" />
      </div>
      <NoteField value={note} onChange={setNote} />
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

  // Opened from the document page, not the event: the facts are the INVOICE's — whose, when, how
  // much, and what is still creditable of it when an earlier credit took part.
  return (
    <Modal
      title={`חשבונית זיכוי על ${documentName(invoice)}`}
      tile={Undo2}
      facts={
        <>
          {invoice.customer.name}
          {` · מיום ${dayMonth(invoice.documentDate, true)} · `}
          <Money value={invoice.totals.gross} />
          {left < invoice.totals.gross && (
            <>
              {" · נותרו לזיכוי "}
              <Money value={left} />
            </>
          )}
        </>
      }
      status="הזיכוי סופי"
      onClose={onClose}
      footer={<Issue label="הפקת חשבונית זיכוי" onClick={() => setConfirm(true)} disabled={busy || !(amount > 0) || amount > left + 0.005 || !reason.trim()} error={error} />}
    >
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="סכום הזיכוי (₪, כולל מע״מ)" min={0} max={left} value={amount} onChange={setAmount} />
        <TextField label="סיבת הזיכוי" value={reason} onChange={setReason} required placeholder="ביטול האירוע / שינוי בהזמנה / טעות" />
      </div>
      <SwitchRow checked={withRefund} onChange={setWithRefund} label="הכסף הוחזר ללקוח" hint="נרשם על הזיכוי כאמצעי ההחזר. כבוי — הזיכוי מקזז חשבונית שטרם שולמה." />
      {withRefund && <PaymentFields value={refund} onChange={setRefund} transaction={amount} />}
      <ConfirmDialog
        open={confirm}
        tone="neutral"
        icon={FileCheck2}
        title={`להפיק חשבונית זיכוי על ${formatPrice(amount)}?`}
        body="הזיכוי יקבל מספר ויודפס עם מספר החשבונית המזוכה והסיבה."
        confirmLabel="הפקה"
        onConfirm={() => void submit()}
        onClose={() => setConfirm(false)}
      />
    </Modal>
  );
}
