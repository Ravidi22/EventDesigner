"use client";

import type { ReactNode } from "react";
import type { BusinessSettings } from "@/lib/settings/types";
import {
  KIND_TITLE,
  PAYMENT_MEANS_LABEL,
  VAT_STATUS_PRINT,
  carriesVat,
  isFiscal,
  recordsPayment,
  type BillingDocument,
  type DocumentPayment,
} from "@/lib/billing/types";
import { formatPrice } from "@/lib/catalog/format";

// A BILLING DOCUMENT AS IT PRINTS — one A4 page, the same on screen, on paper and in the PDF
// (the quote's own page geometry and pipeline: a real `data-quote-page` box, photographed by
// ../outputs/quote-pdf.ts).
//
// Everything on it is read off the FROZEN ROW (lib/billing/types.ts): nothing here derives a
// figure, so a reprint ten years on says what the original said. What the regulations ask of each
// kind — the heading in their words, "עוסק מורשה" and the number in print, net / VAT / gross, the
// payment's means and details on a receipt, the corrected invoice's number and the reason on a
// credit note — is laid out in reading order, and nothing decorative: an accountant files this.
//
// `stamp` is the one thing that is NOT the row's: whether this rendering is the original ("מקור",
// once), a copy ("העתק", every later print of a fiscal kind), or neither (an order, a request).

export type Stamp = "original" | "copy" | null;

export interface DocumentPageProps {
  document: BillingDocument;
  settings: BusinessSettings;
  event: { clientName: string; date: string; eventType?: string; zonesLabel: string };
  venueName?: string;
  /** The invoice a receipt or credit follows. */
  follows?: { kind: BillingDocument["kind"]; number: number; documentDate: string; allocationNumber?: string };
  /** Printed on a payment request only. */
  bankDetails?: string;
  stamp: Stamp;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;

const longDate = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }) : "");
const shortDate = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("he-IL") : "");
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

export function DocumentPage({ document: d, settings, event, venueName, follows, bankDetails, stamp }: DocumentPageProps) {
  const fiscal = isFiscal(d.kind);
  const vat = carriesVat(d.kind) && d.totals.vatRate > 0;
  const dead = d.status === "cancelled" || d.status === "superseded";
  const contact = [settings.phone, settings.email, settings.instagram && `@${settings.instagram}`].filter(Boolean);
  const place = [venueName, event.zonesLabel && event.zonesLabel !== venueName ? event.zonesLabel : null].filter(Boolean).join(" · ");
  const total = d.kind === "credit" ? -d.totals.gross : d.totals.gross;

  return (
    <section
      data-quote-page=""
      className="quote-page relative shrink-0 bg-canvas text-ink shadow-lifted"
      style={{ width: `${PAGE_W}mm`, height: `${PAGE_H}mm`, padding: `${MARGIN}mm` }}
      dir="rtl"
    >
      {settings.showBsd && (
        <span className="absolute text-[11px] font-semibold text-ink-soft" style={{ top: "6mm", insetInlineStart: `${MARGIN}mm` }}>
          בס״ד
        </span>
      )}

      {/* A cancelled or replaced document says so across its face — on screen, on paper, in the file. */}
      {dead && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-24deg] border-[3px] border-alert px-8 py-2 text-[64px] font-bold text-alert opacity-30">{d.status === "cancelled" ? "מבוטל" : "הוחלף"}</span>
        </div>
      )}

      {/* Letterhead: the studio's mark, then the facts the regulation wants in print. */}
      <header className="flex items-start justify-between gap-6 border-b-[1.5px] border-ink pb-4">
        <div className="min-w-0">
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
            <img src={settings.logoUrl} alt={settings.businessName} className="h-[18mm] w-auto max-w-[70mm] object-contain" />
          ) : (
            <p className="font-display text-[24px] font-bold leading-tight text-ink">{settings.businessName}</p>
          )}
          <p className="nums mt-1.5 text-[11.5px] leading-snug text-ink-soft">
            {settings.logoUrl && <span className="font-semibold text-ink">{settings.businessName} · </span>}
            {VAT_STATUS_PRINT[settings.vatStatus]} {settings.businessNumber}
            {settings.address && <> · {settings.address}</>}
          </p>
          {contact.length > 0 && (
            <p className="nums text-[11px] text-muted" dir="ltr" style={{ textAlign: "end" }}>
              {contact.join("  ·  ")}
            </p>
          )}
        </div>
        <div className="shrink-0 text-end">
          <h1 className="font-display text-[22px] font-bold leading-tight text-ink">
            {KIND_TITLE[d.kind]} <span className="nums">{d.number}</span>
          </h1>
          <p className="nums mt-1 text-[12px] text-ink-soft">תאריך: {shortDate(d.documentDate)}</p>
          {fiscal && stamp && (
            <p className={"mt-2 inline-block border-[1.5px] px-3 py-0.5 text-[13px] font-bold " + (stamp === "original" ? "border-ink text-ink" : "border-ink-soft text-ink-soft")}>{stamp === "original" ? "מקור" : "העתק"}</p>
          )}
          {d.allocationNumber ? (
            <p className="nums mt-1.5 text-[11.5px] text-ink">
              מספר הקצאה: <span dir="ltr">{d.allocationNumber}</span>
            </p>
          ) : (
            d.allocationStatus === "pending" && <p className="mt-1.5 text-[11.5px] text-ink-soft">מספר הקצאה: ______________</p>
          )}
        </div>
      </header>

      {/* The client and the event. */}
      <div className="mt-5 grid grid-cols-2 gap-6 text-[13px]">
        <div>
          <p className="text-[11px] text-muted">לכבוד</p>
          <p className="font-bold text-ink">{d.customer.name}</p>
          {d.customer.address && <p className="text-ink-soft">{d.customer.address}</p>}
          {d.customer.number && (
            <p className="nums text-ink-soft">
              ת.ז / ח.פ <span dir="ltr">{d.customer.number}</span>
            </p>
          )}
          {d.customer.phone && (
            <p className="nums text-ink-soft" dir="ltr" style={{ textAlign: "end" }}>
              {d.customer.phone}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-muted">עבור</p>
          <p className="text-ink">
            {event.eventType ? `עיצוב ${event.eventType}` : "עיצוב האירוע"}
            {event.clientName && event.clientName !== d.customer.name && ` — ${event.clientName}`}
          </p>
          {event.date && <p className="nums text-ink-soft">{longDate(event.date)}</p>}
          {place && <p className="text-ink-soft">{place}</p>}
          {follows && (
            <p className="nums text-ink-soft">
              {d.kind === "credit" ? "מזכה את" : "על חשבון"} {KIND_TITLE[follows.kind]} {follows.number} מיום {shortDate(follows.documentDate)}
              {follows.allocationNumber && (
                <>
                  {" "}
                  (מס׳ הקצאה <span dir="ltr">{follows.allocationNumber}</span>)
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {/* The lines. */}
      <table className="mt-6 w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b-[1.5px] border-ink text-[11px] text-muted">
            <th className="py-1.5 text-start font-medium">תיאור</th>
            <th className="w-[18mm] py-1.5 text-end font-medium">כמות</th>
            <th className="w-[30mm] py-1.5 text-end font-medium">מחיר ליח׳</th>
            <th className="w-[30mm] py-1.5 text-end font-medium">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.key} className="border-b border-border-soft">
              <td className="py-2 text-ink">
                {l.label}
                {l.gift && <span className="ms-2 rounded-sm border border-ink px-1.5 text-[10.5px] font-semibold">מתנה</span>}
              </td>
              <td className="nums py-2 text-end text-ink-soft">{l.unit === "unit" ? l.quantity : `${l.quantity} ${l.unit === "m" ? "מ׳" : "מ״ר"}`}</td>
              <td className="nums py-2 text-end text-ink-soft">{formatPrice(l.unitPrice)}</td>
              <td className="nums py-2 text-end font-medium text-ink">{l.gift ? "—" : formatPrice(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.totals.pricesIncludeVat && vat && <p className="mt-1 text-[10.5px] text-muted">המחירים כוללים מע״מ.</p>}

      {/* The figures — net, VAT and gross where there is VAT; the one sum where there is none. */}
      <div className="mt-4 ms-auto w-[80mm] text-[13px]">
        {d.totals.discount > 0 && (
          <>
            <Figure label="לפני הנחה" value={formatPrice(d.totals.beforeDiscount)} muted />
            <Figure label="הנחה" value={`−${formatPrice(d.totals.discount)}`} muted />
          </>
        )}
        {vat && (
          <>
            <Figure label="לפני מע״מ" value={formatPrice(d.totals.net)} />
            <Figure label={`מס ערך מוסף ${pct(d.totals.vatRate)}`} value={formatPrice(d.totals.vat)} />
          </>
        )}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t-[1.5px] border-ink pt-1.5">
          <span className="font-bold text-ink">{totalLabel(d)}</span>
          <span className="nums text-[18px] font-bold text-ink">{formatPrice(Math.abs(total))}</span>
        </div>
        {settings.vatStatus === "exempt" && fiscal && <p className="mt-0.5 text-end text-[10.5px] text-muted">עוסק פטור — אינו גובה מע״מ.</p>}
      </div>

      {/* What the kind adds. */}
      {recordsPayment(d.kind) && d.payment && (
        <Block title="פרטי התשלום">
          <PaymentLines p={d.payment} />
        </Block>
      )}
      {d.kind === "credit" && d.credit && (
        <Block title="פרטי הזיכוי">
          <p>סיבה: {d.credit.reason}</p>
          {d.credit.refund ? (
            <>
              <p className="mt-1 font-semibold text-ink">ההחזר ללקוח</p>
              <PaymentLines p={d.credit.refund} />
            </>
          ) : (
            <p className="text-ink-soft">הזיכוי מקזז את יתרת החשבונית; לא הוחזר כסף.</p>
          )}
        </Block>
      )}
      {(d.kind === "order" || d.kind === "payment_request") && d.schedule && d.schedule.length > 0 && (
        <Block title={d.kind === "order" ? "לוח התשלומים" : "לתשלום"}>
          <table className="w-full border-collapse text-[12.5px]">
            <tbody>
              {d.schedule.map((s) => (
                <tr key={s.id} className="border-b border-border-soft last:border-0">
                  <td className="py-1 text-ink">{s.label}</td>
                  <td className="nums w-[40mm] py-1 text-ink-soft">עד {shortDate(s.dueDate)}</td>
                  <td className="nums w-[30mm] py-1 text-end font-medium text-ink">{formatPrice(s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.kind === "payment_request" && bankDetails && (
            <p className="nums mt-2 rounded-sm border border-border px-3 py-2 text-[12.5px] text-ink">
              <span className="font-semibold">להעברה בנקאית: </span>
              {bankDetails}
            </p>
          )}
        </Block>
      )}
      {d.note && <p className="mt-5 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-soft">{d.note}</p>}

      {/* Signatures: an order is signed by both; a fiscal document carries the studio's. */}
      <div className="absolute inset-x-0" style={{ bottom: "22mm", paddingInline: `${MARGIN}mm` }}>
        {d.kind === "order" ? (
          <div className="grid grid-cols-2 items-end gap-10">
            <div>
              <p className="mb-1 text-[11.5px] text-ink-soft">אני מאשר/ת את ההזמנה על פרטיה, סכומיה ולוח התשלומים.</p>
              <div className="h-[14mm] border-b border-ink" />
              <p className="mt-1 text-[11px] text-muted">הלקוח/ה — {d.customer.name} · חתימה ותאריך</p>
            </div>
            <StudioSignature settings={settings} />
          </div>
        ) : (
          fiscal && (
            <div className="ms-auto w-[70mm]">
              <StudioSignature settings={settings} />
            </div>
          )
        )}
      </div>

      <footer className="absolute inset-x-0 text-center leading-snug" style={{ bottom: "4.5mm", paddingInline: `${MARGIN}mm` }}>
        <p className="nums text-[9.5px] text-muted" dir="ltr">
          {KIND_TITLE[d.kind]} {d.number} · {d.contentHash.slice(0, 16)}
          {fiscal && stamp === "copy" ? " · העתק" : ""}
        </p>
      </footer>
    </section>
  );
}

function totalLabel(d: BillingDocument): string {
  switch (d.kind) {
    case "receipt":
    case "tax_invoice_receipt":
      return "סה״כ התקבל";
    case "credit":
      return "סה״כ לזיכוי";
    case "order":
      return "סה״כ להזמנה";
    case "payment_request":
      return "סה״כ לתשלום";
    default:
      return "סה״כ לתשלום";
  }
}

function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className={muted ? "text-muted" : "text-ink-soft"}>{label}</span>
      <span className={"nums " + (muted ? "text-ink-soft" : "text-ink")}>{value}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5 text-[12.5px] text-ink-soft">
      <h3 className="mb-1 text-[12px] font-bold text-ink">{title}</h3>
      {children}
    </div>
  );
}

/** The means of payment and the details ניהול ספרים s.5 asks for, by means. */
function PaymentLines({ p }: { p: DocumentPayment }) {
  const parts: string[] = [`${PAYMENT_MEANS_LABEL[p.means]} · ${formatPrice(p.amount)} · ${shortDate(p.date)}`];
  if (p.means === "cheque") parts.push([p.chequeNumber && `שיק מס׳ ${p.chequeNumber}`, p.chequeDate && `לפירעון ${shortDate(p.chequeDate)}`, p.bank, p.branch && `סניף ${p.branch}`, p.account && `חשבון ${p.account}`].filter(Boolean).join(" · "));
  if (p.means === "card") parts.push([p.cardType, p.last4 && `המסתיים ב-${p.last4}`].filter(Boolean).join(" · "));
  if (p.means === "transfer") parts.push([p.bank, p.reference && `אסמכתא ${p.reference}`].filter(Boolean).join(" · "));
  if (p.means === "app" && p.reference) parts.push(`אסמכתא ${p.reference}`);
  return (
    <>
      {parts.filter(Boolean).map((t, i) => (
        <p key={i} className="nums">
          {t}
        </p>
      ))}
    </>
  );
}

function StudioSignature({ settings }: { settings: BusinessSettings }) {
  const name = settings.ownerName || settings.businessName;
  return (
    <div>
      <div className="flex h-[14mm] items-end justify-center border-b border-ink">
        {settings.signatureUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
          <img src={settings.signatureUrl} alt="חתימת העסק" className="max-h-[13mm] w-auto max-w-[55mm] object-contain" />
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted">{settings.businessName}{name && name !== settings.businessName ? ` — ${name}` : ""} · חתימה</p>
    </div>
  );
}
