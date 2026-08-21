"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Eye, Send, Share2, TriangleAlert } from "lucide-react";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { quoteGroups, quoteTotals, type DiscountType } from "@/lib/outputs/quote";
import { measureContext, priceLookup } from "@/lib/outputs/lookup";
import { eventPlan } from "@/lib/events/plan";
import type { VenueStructure } from "@/lib/venues/structure";
import { fetchVenueGeometry } from "@/lib/venues/actions";
import { formatPrice } from "@/lib/catalog/format";
import { fetchSettings } from "@/lib/settings/actions";
import type { BusinessSettings } from "@/lib/settings/types";
import { fetchIssuedQuote, issueQuote, type IssuedQuote } from "@/lib/quotes/actions";
import { fetchDocument } from "@/lib/studio/actions";
import { activeEvent } from "@/lib/events/storage";
import { patchEvent } from "@/lib/events/actions";
import type { EventSummary } from "@/lib/events/types";
import { fetchImages } from "@/lib/gallery/actions";
import type { GalleryImage } from "@/lib/gallery/types";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { VenueAccessNotice } from "@/components/venue-access-notice";
import { QuoteSheet } from "./quote-sheet";

// F-7.1–F-7.4: the quote — a renderer over the design document. Variant-level rows, category
// subtotals, hide/merge before showing, discount, VAT from settings, version lock + re-issue.
//
// This file is the CONTROLS and the state. The sheet a client receives is ./quote-sheet.tsx, which
// takes what is resolved here and renders it as a document — letterhead, מפרט, photographs, totals,
// terms, signature. Everything on this screen that is not part of that document is `no-print`.
export function Quote({ doc }: { doc: DesignDocumentContent }) {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [issued, setIssued] = useState<IssuedQuote | null>(null);
  // The photographs the sheet illustrates each zone with. Loaded whole and matched in the sheet by
  // product — a studio's gallery is a few hundred rows, and the alternative is a query per zone.
  const [images, setImages] = useState<GalleryImage[]>([]);
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
    // Photographs are illustration, never the document's substance: if the gallery is unreachable
    // the quote still prints, with its מפרט and its prices intact.
    void fetchImages()
      .then((loaded) => {
        if (live) setImages(loaded);
      })
      .catch(() => {});
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

      {/* Everything the DESIGNER needs and the client never sees: the version lock, the discount,
          what is hidden, and the two buttons. Kept above the sheet and out of it, so the document
          below is exactly what comes out of the printer. */}
      <div className="no-print space-y-3 rounded-md border border-border bg-inset px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* F-7.4: version lock indicator + one-click re-issue (no itemized diff in phase 1) */}
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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted">הנחה</span>
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5">
              {(["percent", "amount"] as DiscountType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDiscountType(t)}
                  aria-pressed={discountType === t}
                  className={
                    "rounded-sm px-2 py-0.5 text-caption transition-colors " +
                    (discountType === t ? "bg-accent-tint font-medium text-ink" : "text-muted hover:text-ink")
                  }
                >
                  {t === "percent" ? "%" : (settings?.currency ?? "₪")}
                </button>
              ))}
            </div>
            <NumberField min={0} value={discountValue} onChange={setDiscountValue} aria-label="ערך ההנחה" className="w-20" />
            {totals.discount > 0 && <span className="nums text-sm text-ink-soft">−{formatPrice(totals.discount)}</span>}
          </div>

          {hidden.size > 0 && (
            <button
              type="button"
              onClick={() => setHidden(new Set())}
              className="inline-flex items-center gap-1.5 text-caption text-muted transition-colors hover:text-ink"
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="nums">{hidden.size}</span> שורות מוסתרות — החזרת הכול
            </button>
          )}

          {!settings?.quoteTerms && (
            <Link href="/settings" className="ms-auto text-caption text-warn-ink underline-offset-2 hover:underline">
              לא הוגדרו תנאי הצעה — לוח תשלומים, ביטול ומה שאינו כלול ↗
            </Link>
          )}
        </div>
      </div>

      {/* What the client receives. */}
      <QuoteSheet
        settings={settings}
        event={event}
        groups={groups}
        totals={totals}
        vatRate={vatRate}
        images={images}
        merged={merged}
        documentVersion={issued?.documentVersion ?? null}
        issuedAt={issued?.issuedAt ?? null}
        unpriced={unpriced}
        onToggleHide={toggleHide}
        onToggleMerge={toggleMerge}
      />
    </div>
  );
}
