"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff, Merge, Send, Share2, TriangleAlert } from "lucide-react";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { quoteGroups, quoteTotals, type DiscountType } from "@/lib/outputs/quote";
import { measureContext, priceLookup } from "@/lib/outputs/lookup";
import { eventPlan } from "@/lib/events/plan";
import type { VenueStructure } from "@/lib/venues/structure";
import { fetchVenueGeometry } from "@/lib/venues/actions";
import { formatAmount, formatPrice, formatUnitPrice } from "@/lib/catalog/format";
import { fetchSettings } from "@/lib/settings/actions";
import type { BusinessSettings } from "@/lib/settings/types";
import { fetchIssuedQuote, issueQuote, type IssuedQuote } from "@/lib/quotes/actions";
import { fetchDocument } from "@/lib/studio/actions";
import { activeEvent } from "@/lib/events/storage";
import { patchEvent } from "@/lib/events/actions";
import { formatEventDate, zonesLabelOf, type EventSummary } from "@/lib/events/types";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { VenueAccessNotice } from "@/components/venue-access-notice";

// F-7.1–F-7.4: the quote — a renderer over the design document. Variant-level rows, category
// subtotals, hide/merge before showing, discount, VAT from settings, version lock + re-issue.
export function Quote({ doc }: { doc: DesignDocumentContent }) {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [issued, setIssued] = useState<IssuedQuote | null>(null);
  // The version the drawing is on NOW. F-7.4 is the comparison between this and the version the
  // quote was sealed at — two integers, where it used to be two serialised documents.
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueFailed, setIssueFailed] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [merged, setMerged] = useState<Set<string>>(new Set());
  // The walls the drapes hang on: a per-metre line charges for the run it actually covers, and the
  // wall that decides that length lives at the venue, not in this document (lib/.../measure.ts).
  const [structure, setStructure] = useState<VenueStructure | undefined>(undefined);
  // …and when those walls are unreachable, every per-metre line falls back to a catalog width and
  // this quote under-charges. That is a price being wrong, so it is said out loud.
  const [venueDenied, setVenueDenied] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchSettings().then((loaded) => {
      if (live) setSettings(loaded);
    });
    void (async () => {
      const ev = await activeEvent();
      if (!live) return;
      setEvent(ev);
      if (ev) {
        const [q, stored] = await Promise.all([fetchIssuedQuote(ev.id), fetchDocument(ev.id)]);
        if (!live) return;
        setCurrentVersion(stored?.version ?? null);
        setIssued(q);
        if (q) {
          setDiscountType(q.discountType);
          setDiscountValue(q.discountValue);
          setHidden(new Set(q.hiddenVariantIds));
          setMerged(new Set(q.mergedCategoryIds));
        }
      }
      const geometry = await fetchVenueGeometry(ev?.venueId);
      if (live) {
        setStructure(eventPlan(ev, geometry).structure);
        setVenueDenied(geometry.access === "denied");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const vatRate = settings?.vatRate ?? 0.18;
  const allGroups = useMemo(() => quoteGroups(doc, priceLookup, measureContext(structure)), [doc, structure]);

  // F-7.1: hidden rows are dropped (and not charged); merged categories collapse to one line.
  const groups = useMemo(
    () =>
      allGroups
        .map((g) => {
          const lines = g.lines.filter((l) => !hidden.has(l.variantId));
          const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
          return { ...g, lines, subtotal: Math.round(subtotal * 100) / 100 };
        })
        .filter((g) => g.lines.length > 0),
    [allGroups, hidden],
  );

  const subtotal = groups.reduce((s, g) => s + g.subtotal, 0);
  const unpriced = groups.reduce((n, g) => n + g.lines.filter((l) => !l.priced).length, 0);
  const totals = quoteTotals(subtotal, { discountType, discountValue, vatRate });

  // F-7.4: the design moved on if the drawing is on a later version than the one this quote was
  // sealed at. Unknown until both have loaded — and "unknown" must not light the warning, since a
  // designer who learns to distrust the indicator has lost it.
  const changed = issued !== null && currentVersion !== null && currentVersion !== issued.documentVersion;

  const issue = async () => {
    if (!event || issuing) return;
    setIssuing(true);
    setIssueFailed(false);
    try {
      const record = await issueQuote(event.id, {
        discountType,
        discountValue,
        hiddenVariantIds: [...hidden],
        mergedCategoryIds: [...merged],
        total: totals.total,
      });
      setIssued(record);
      // Issuing SEALED the drawing at this version, so the two now agree by definition — until the
      // next edit in the studio opens the next version and lights the indicator above.
      setCurrentVersion(record.documentVersion);
      // F-1.9: the stamp that moves the event to "נשלחה הצעה" on every list in the app.
      void patchEvent(event.id, { quoteSentAt: record.issuedAt });
    } catch {
      // Said out loud rather than swallowed: a designer who believes a quote was issued, and a
      // client who never receives one, is the worst outcome this screen has.
      setIssueFailed(true);
    } finally {
      setIssuing(false);
    }
  };

  const share = async () => {
    // F-7.3: OS share / download only — no send integrations in phase 1.
    const text = `הצעת מחיר — ${event?.clientName ?? ""}: ${formatPrice(totals.total)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "הצעת מחיר", text });
      } catch {
        // user cancelled — fine
      }
    } else window.print();
  };

  const toggleHide = (variantId: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  const toggleMerge = (categoryId: string) =>
    setMerged((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });

  if (allGroups.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-ink-soft">עדיין אין פריטים בעיצוב.</p>
        <Link href="/studio" className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent-hover">
          חזרה לסטודיו →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {venueDenied && <VenueAccessNotice tone="measure" className="no-print" />}

      {/* F-7.2: business + client header */}
      <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="font-display text-h2 text-ink">{settings?.businessName}</p>
          <p className="mt-0.5 text-sm text-muted">
            {[settings?.ownerName, settings?.phone, settings?.address].filter(Boolean).join(" · ")}
          </p>
        </div>
        {event && (
          <div className="text-end text-sm">
            <p className="font-semibold text-ink">{event.clientName}</p>
            <p className="mt-0.5 text-muted">
              {zonesLabelOf(event)} · {formatEventDate(event.date)}
              {event.phone && <span className="nums" dir="ltr"> · {event.phone}</span>}
            </p>
          </div>
        )}
      </header>

      {/* F-7.4: version lock indicator + one-click re-issue (no itemized diff in phase 1) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        {issued ? (
          changed ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-warn-ink">
              <TriangleAlert className="h-4 w-4" strokeWidth={2} />
              העיצוב השתנה מאז ההצעה האחרונה ({new Date(issued.issuedAt).toLocaleDateString("he-IL")})
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
              <Check className="h-4 w-4 text-accent" strokeWidth={2.5} />
              הצעה הופקה {new Date(issued.issuedAt).toLocaleDateString("he-IL")} · תואמת לעיצוב הנוכחי
            </p>
          )
        ) : (
          <p className="text-sm text-muted">טרם הופקה הצעה לאירוע הזה.</p>
        )}
        <div className="flex items-center gap-2">
          {issueFailed && (
            <p className="inline-flex items-center gap-1.5 text-sm text-warn-ink">
              <TriangleAlert className="h-4 w-4" strokeWidth={2} />
              ההפקה נכשלה — נסו שוב
            </p>
          )}
          <Button variant="ghost" onClick={share}>
            <Share2 className="h-4 w-4" strokeWidth={2} />
            שיתוף
          </Button>
          <Button onClick={issue} disabled={!event || issuing}>
            <Send className="h-4 w-4" strokeWidth={2} />
            {issuing ? "מפיק…" : issued ? (changed ? "הפקת הצעה עדכנית" : "הפקה מחדש") : "הפקת ההצעה"}
          </Button>
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.categoryId} className="break-inside-avoid">
          <div className="mb-2 flex items-center justify-between border-b border-ink pb-1">
            <h3 className="text-base font-semibold text-ink">{g.label}</h3>
            <button
              type="button"
              onClick={() => toggleMerge(g.categoryId)}
              aria-pressed={merged.has(g.categoryId)}
              className="no-print inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
              title={merged.has(g.categoryId) ? "פירוק לשורות" : "איחוד לשורה אחת"}
            >
              <Merge className="h-3.5 w-3.5" strokeWidth={2} />
              {merged.has(g.categoryId) ? "פירוק" : "איחוד"}
            </button>
          </div>

          {merged.has(g.categoryId) ? (
            <div className="flex items-center justify-between border-t border-border py-2 text-sm">
              <span className="text-ink">{g.label} — מקובץ</span>
              <span className="nums font-semibold text-ink">{formatPrice(g.subtotal)}</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="py-1.5 text-start font-medium">פריט</th>
                  <th className="w-16 py-1.5 text-start font-medium">כמות</th>
                  <th className="w-24 py-1.5 text-start font-medium">מחיר ליח׳</th>
                  <th className="w-28 py-1.5 text-end font-medium">סה״כ</th>
                  <th className="no-print w-9" />
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => (
                  <tr key={l.variantId} className="border-t border-border">
                    <td className="py-2 text-ink">{l.label}</td>
                    <td className="nums py-2 text-ink">{formatAmount(l.quantity, l.priceUnit)}</td>
                    <td className="nums py-2 text-ink-soft">
                      {l.priced ? formatUnitPrice(l.unitPrice, l.priceUnit) : <span className="text-warn-ink">ללא מחיר</span>}
                    </td>
                    <td className="nums py-2 text-end font-semibold text-ink">{l.priced ? formatPrice(l.lineTotal) : "—"}</td>
                    <td className="no-print py-2 text-end">
                      <button
                        type="button"
                        onClick={() => toggleHide(l.variantId)}
                        aria-label={`הסתרת "${l.label}" מההצעה`}
                        title="הסתרה מההצעה"
                        className="rounded-md p-1 text-muted transition-colors hover:bg-accent-tint hover:text-accent-hover"
                      >
                        <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td colSpan={3} className="py-2 text-end text-muted">סכום ביניים — {g.label}</td>
                  <td className="nums py-2 text-end font-semibold text-ink">{formatPrice(g.subtotal)}</td>
                  <td className="no-print" />
                </tr>
              </tbody>
            </table>
          )}
        </section>
      ))}

      {hidden.size > 0 && (
        <button
          type="button"
          onClick={() => setHidden(new Set())}
          className="no-print inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
        >
          <Eye className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="nums">{hidden.size}</span> שורות מוסתרות — החזרת הכול
        </button>
      )}

      {unpriced > 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs text-warn-ink">
          <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="nums">{unpriced}</span> פריטים ללא מחיר אינם נכללים בסכום — הוסיפו מחיר בקטלוג.
        </p>
      )}

      {/* Totals */}
      <section className="ms-auto max-w-sm space-y-2 border-t border-ink pt-4">
        <Row label="סכום ביניים" value={formatPrice(totals.subtotal)} />

        <div className="flex items-center justify-between gap-3 py-1">
          <div className="flex items-center gap-1.5">
            <span className="text-muted">הנחה</span>
            <div className="no-print flex items-center gap-0.5 rounded-md border border-border p-0.5">
              {(["percent", "amount"] as DiscountType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDiscountType(t)}
                  aria-pressed={discountType === t}
                  className={"rounded-[5px] px-2 py-0.5 text-xs transition-colors " + (discountType === t ? "bg-accent-tint font-medium text-ink" : "text-muted hover:text-ink")}
                >
                  {t === "percent" ? "%" : settings?.currency ?? "₪"}
                </button>
              ))}
            </div>
            <NumberField
              min={0}
              value={discountValue}
              onChange={setDiscountValue}
              aria-label="ערך ההנחה"
              className="no-print w-20"
            />
            {discountType === "percent" && <span className="nums text-muted">{discountValue}%</span>}
          </div>
          <span className="nums text-ink">−{formatPrice(totals.discount)}</span>
        </div>

        <Row label="לאחר הנחה" value={formatPrice(totals.afterDiscount)} muted />
        <Row label={`מע״מ ${Math.round(vatRate * 100)}%`} value={formatPrice(totals.vat)} muted />
        <div className="flex items-center justify-between border-t border-ink pt-2.5">
          <span className="font-semibold text-ink">סה״כ לתשלום</span>
          <span className="nums text-lede font-semibold text-ink">{formatPrice(totals.total)}</span>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted">{label}</span>
      <span className={"nums " + (muted ? "text-ink-soft" : "text-ink")}>{value}</span>
    </div>
  );
}
