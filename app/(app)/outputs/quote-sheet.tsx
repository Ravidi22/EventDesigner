"use client";

import { Merge, EyeOff, TriangleAlert } from "lucide-react";
import type { GalleryImage } from "@/lib/gallery/types";
import type { QuoteGroup, QuoteTotals } from "@/lib/outputs/quote";
import type { BusinessSettings } from "@/lib/settings/types";
import { formatAmount, formatPrice, formatUnitPrice } from "@/lib/catalog/format";
import { formatEventDate, zonesLabelOf, type EventSummary } from "@/lib/events/types";
import { Photo } from "@/components/photo";

// F-7.2: the quote as a DOCUMENT — the thing a client receives, printed to PDF.
//
// Split out of quote.tsx, which keeps the state and the controls. The separation is the point: this
// file renders the sheet and nothing else, so what a client sees can be read top to bottom in one
// place without the hide/merge/discount machinery interleaved through it.
//
// Modelled on what studios actually send today — a Word file of photo boards, a typed מפרט, and one
// bottom-line number — with the four things such a file always omits and cannot easily carry:
//
//   • an identity and an expiry (a quote with no number and no validity date holds its price forever)
//   • VAT stated as its own line rather than folded into a total nobody can decompose
//   • terms — payment schedule, cancellation, what is excluded (lib/settings, printed below)
//   • a signature block, which is what turns an offer into something both sides agreed to
//
// …and the one thing this app has that a Word file cannot: the מפרט is DERIVED from the drawing, so
// it cannot drift from the plan that produced it, and the photographs are the ones already linked to
// the catalog products actually placed on that plan.
//
// ⚠ Client-facing surface. Prices yes — costs, margins and supplier data never (npm run check:costs).

export interface QuoteSheetProps {
  settings: BusinessSettings | null;
  event: EventSummary | null;
  groups: QuoteGroup[];
  totals: QuoteTotals;
  vatRate: number;
  /** Gallery photographs, already loaded — matched to each zone by the products placed in it. */
  images: GalleryImage[];
  /** Categories the designer collapsed to a single price (F-7.1). The spec still prints. */
  merged: Set<string>;
  /** The sealed drawing version this quote names, and when it was issued. Null = not issued yet,
   *  which prints as a draft rather than as a document with an invented number on it. */
  documentVersion: number | null;
  issuedAt: number | null;
  unpriced: number;
  /** Present on the editing surface, absent wherever the sheet is only being read. */
  onToggleHide?: (variantId: string) => void;
  onToggleMerge?: (categoryId: string) => void;
}

const DAY_MS = 86_400_000;

export function QuoteSheet({
  settings,
  event,
  groups,
  totals,
  vatRate,
  images,
  merged,
  documentVersion,
  issuedAt,
  unpriced,
  onToggleHide,
  onToggleMerge,
}: QuoteSheetProps) {
  // A reference the studio and the client can both quote back at each other, built from what is
  // already true rather than from a counter that would need its own table: the event, and the
  // sealed drawing version this quote was made from.
  const ref = event && documentVersion !== null ? `${event.id.slice(0, 6).toUpperCase()}-${documentVersion}` : null;
  const issued = issuedAt !== null ? new Date(issuedAt) : null;
  const validDays = settings?.quoteValidityDays ?? 0;
  const validUntil = issued && validDays > 0 ? new Date(issued.getTime() + validDays * DAY_MS) : null;
  const he = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });

  const photosOf = (g: QuoteGroup) => {
    const products = new Set(g.lines.map((l) => l.productId));
    // Only real photographs. The coloured tile that stands in for a missing one is an empty state
    // for the gallery screen; in a client's PDF it is a coloured rectangle with no meaning.
    return images.filter((i) => i.imageUrl && products.has(i.productId)).slice(0, 4);
  };
  // "להמחשה בלבד" belongs beside the photographs it disclaims, and once — not stranded on a last
  // page after the price, which is where a Word file always ends up putting it.
  const firstWithPhotos = groups.find((g) => photosOf(g).length > 0)?.categoryId;

  const terms = (settings?.quoteTerms ?? "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <article className="space-y-7">
      {/* ── Letterhead ─────────────────────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
        <div className="min-w-0">
          {settings?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
            <img src={settings.logoUrl} alt="" className="mb-2 h-14 w-auto max-w-44 object-contain object-right" />
          )}
          <p className="font-display text-h2 leading-tight text-ink">{settings?.businessName}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {[settings?.ownerName, settings?.businessNumber && `ע.מ ${settings.businessNumber}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="nums mt-0.5 text-sm text-muted" dir="ltr">
            {[settings?.phone, settings?.email].filter(Boolean).join("  ·  ")}
          </p>
          {settings?.address && <p className="text-sm text-muted">{settings.address}</p>}
        </div>

        <div className="shrink-0 text-end">
          <p className="font-display text-h2 leading-tight text-ink">הצעת מחיר</p>
          <dl className="mt-2 space-y-0.5 text-caption">
            {ref ? (
              <Meta label="מס׳ הצעה" value={<span className="nums" dir="ltr">{ref}</span>} />
            ) : (
              <Meta label="מצב" value={<span className="text-warn-ink">טיוטה — טרם הופקה</span>} />
            )}
            {issued && <Meta label="תאריך" value={<span className="nums">{he(issued)}</span>} />}
            {validUntil && <Meta label="בתוקף עד" value={<span className="nums">{he(validUntil)}</span>} />}
          </dl>
        </div>
      </header>

      {/* ── Who it is for, and for what ────────────────────────────────────────────────────── */}
      {event && (
        <section className="grid grid-cols-2 gap-x-8 gap-y-1 rounded-md border border-inset-border bg-inset px-5 py-4 text-sm">
          <div>
            <p className="text-caption font-semibold text-accent">לכבוד</p>
            <p className="mt-1 font-semibold text-ink">{event.clientName}</p>
            {event.contactName && <p className="text-ink-soft">{event.contactName}</p>}
            {event.phone && (
              <p className="nums text-ink-soft" dir="ltr">
                {event.phone}
              </p>
            )}
            {event.contact2Name && (
              <p className="text-muted">
                {event.contact2Name}
                {event.contact2Phone && (
                  <span className="nums" dir="ltr">
                    {" · "}
                    {event.contact2Phone}
                  </span>
                )}
              </p>
            )}
          </div>
          <div>
            <p className="text-caption font-semibold text-accent">האירוע</p>
            <p className="nums mt-1 font-semibold text-ink">
              {formatEventDate(event.date)}
              {event.time && <span> · {event.time}</span>}
            </p>
            <p className="text-ink-soft">{zonesLabelOf(event)}</p>
            {event.guests > 0 && (
              <p className="nums text-muted">
                {event.guests} אורחים <span className="text-faint">(הערכה)</span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── The מפרט: one block per zone — photographs, then what is in it, then its price ──── */}
      {groups.map((g) => {
        const photos = photosOf(g);
        const isMerged = merged.has(g.categoryId);
        return (
          <section key={g.categoryId} className="break-inside-avoid">
            <div className="mb-2.5 flex items-baseline justify-between gap-3 border-b border-ink pb-1.5">
              <h3 className="text-base font-semibold text-ink">{g.label}</h3>
              <div className="flex items-baseline gap-2">
                {onToggleMerge && (
                  <button
                    type="button"
                    onClick={() => onToggleMerge(g.categoryId)}
                    aria-pressed={isMerged}
                    className="no-print inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
                    title={isMerged ? "פירוק לשורות" : "איחוד לשורה אחת"}
                  >
                    <Merge className="h-3.5 w-3.5" strokeWidth={2} />
                    {isMerged ? "פירוק" : "איחוד"}
                  </button>
                )}
                <span className="nums text-sm font-semibold text-ink">{formatPrice(g.subtotal)}</span>
              </div>
            </div>

            {photos.length > 0 && (
              <div className="mb-3 break-inside-avoid">
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((img) => (
                    <Photo
                      key={img.id}
                      image={img}
                      className="aspect-[4/3] w-full rounded-sm border border-border object-cover"
                    />
                  ))}
                </div>
                {g.categoryId === firstWithPhotos && (
                  <p className="mt-1.5 text-[11px] text-muted">התמונות להמחשה בלבד.</p>
                )}
              </div>
            )}

            {/* The spec always prints. Collapsing a zone to one price hides the PRICES, not the
                work — a client who cannot see what the 12,000 ₪ buys has nothing to say yes to,
                which is the failure mode of every bottom-line quote. */}
            {isMerged ? (
              <ul className="space-y-1 text-sm">
                {g.lines.map((l) => (
                  <li key={l.variantId} className="flex items-baseline gap-2">
                    <span aria-hidden className="text-faint">
                      ·
                    </span>
                    <span className="text-ink">{l.label}</span>
                    <span className="nums text-muted">{formatAmount(l.quantity, l.priceUnit)}</span>
                    {onToggleHide && <HideButton label={l.label} onClick={() => onToggleHide(l.variantId)} />}
                  </li>
                ))}
              </ul>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted">
                    <th className="py-1.5 text-start font-medium">פריט</th>
                    <th className="w-16 py-1.5 text-start font-medium">כמות</th>
                    <th className="w-24 py-1.5 text-start font-medium">מחיר ליח׳</th>
                    <th className="w-28 py-1.5 text-end font-medium">סה״כ</th>
                    {onToggleHide && <th className="no-print w-9" />}
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l.variantId} className="border-t border-border">
                      <td className="py-2 text-ink">{l.label}</td>
                      <td className="nums py-2 text-ink">{formatAmount(l.quantity, l.priceUnit)}</td>
                      <td className="nums py-2 text-ink-soft">
                        {l.priced ? (
                          formatUnitPrice(l.unitPrice, l.priceUnit)
                        ) : (
                          <span className="text-warn-ink">ללא מחיר</span>
                        )}
                      </td>
                      <td className="nums py-2 text-end font-semibold text-ink">
                        {l.priced ? formatPrice(l.lineTotal) : "—"}
                      </td>
                      {onToggleHide && (
                        <td className="no-print py-2 text-end">
                          <HideButton label={l.label} onClick={() => onToggleHide(l.variantId)} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      {unpriced > 0 && (
        <p className="no-print inline-flex items-center gap-1.5 text-caption text-warn-ink">
          <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="nums">{unpriced}</span> פריטים ללא מחיר אינם נכללים בסכום — הוסיפו מחיר בקטלוג.
        </p>
      )}

      {/* ── Totals. VAT on its own line, always: "85,000 ₪" with no rate beside it is the single
             most argued-about line on a quote in this country. ─────────────────────────────── */}
      <section className="ms-auto max-w-sm space-y-1.5 break-inside-avoid border-t-2 border-ink pt-4 text-sm">
        <Row label="סכום ביניים" value={formatPrice(totals.subtotal)} />
        {totals.discount > 0 && (
          <>
            <Row label="הנחה" value={`−${formatPrice(totals.discount)}`} />
            <Row label="לאחר הנחה" value={formatPrice(totals.afterDiscount)} muted />
          </>
        )}
        <Row label={`מע״מ ${Math.round(vatRate * 100)}%`} value={formatPrice(totals.vat)} muted />
        <div className="flex items-baseline justify-between border-t border-ink pt-2.5">
          <span className="font-semibold text-ink">סה״כ לתשלום כולל מע״מ</span>
          <span className="nums text-lede font-semibold text-ink">{formatPrice(totals.total)}</span>
        </div>
      </section>

      {/* ── Terms ──────────────────────────────────────────────────────────────────────────── */}
      {terms.length > 0 && (
        <section className="break-inside-avoid rounded-md border border-inset-border bg-inset px-5 py-4">
          <h4 className="text-sm font-semibold text-ink">תנאי ההצעה</h4>
          <ul className="mt-2 space-y-1 text-caption leading-relaxed text-ink-soft">
            {terms.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-faint">
                  ·
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Acceptance. The line that turns an offer into an agreement, and the one a Word file
             almost never has. ─────────────────────────────────────────────────────────────── */}
      <section className="break-inside-avoid">
        <p className="text-sm text-ink">
          אני מאשר/ת את ההצעה על פרטיה ותנאיה
          {validUntil && <span className="nums text-muted"> (בתוקף עד {he(validUntil)})</span>}.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-8">
          <SignLine role="הלקוח/ה" name={event?.clientName} />
          <SignLine role="הסטודיו" name={settings?.ownerName || settings?.businessName} />
        </div>
      </section>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted">{label}</span>
      <span className={"nums " + (muted ? "text-ink-soft" : "text-ink")}>{value}</span>
    </div>
  );
}

function HideButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`הסתרת "${label}" מההצעה`}
      title="הסתרה מההצעה"
      className="no-print rounded-md p-1 text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
    >
      <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}

function SignLine({ role, name }: { role: string; name?: string }) {
  return (
    <div>
      <div className="h-9 border-b border-ink" />
      <p className="mt-1 text-caption text-muted">
        {role}
        {name ? ` — ${name}` : ""} · חתימה ותאריך
      </p>
    </div>
  );
}
