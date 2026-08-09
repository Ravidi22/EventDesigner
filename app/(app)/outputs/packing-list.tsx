"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { packingList } from "@/lib/outputs/aggregate";
import { itemLookup, measureContext } from "@/lib/outputs/lookup";
import { activeEvent } from "@/lib/events/storage";
import { eventPlan } from "@/lib/events/plan";
import type { VenueStructure } from "@/lib/venues/structure";
import { fetchVenueGeometry } from "@/lib/venues/actions";
import { loadSpares, saveSpare, type Spares } from "@/lib/outputs/storage";
import { formatAmount } from "@/lib/catalog/format";
import { NumberField } from "@/components/number-field";

const round1 = (n: number) => Math.round(n * 10) / 10;

// F-6.3: manual spares per row, persisted with the event — so the "no manual fixes" success
// metric covers reserves too, instead of pen-on-paper additions.
export function PackingList({ doc, eventId }: { doc: DesignDocumentContent; eventId: string | null }) {
  const [spares, setSpares] = useState<Spares>({});
  // Same reason as the quote: a drape's metres come from the wall it hangs on, which lives at the
  // venue rather than in the document the crew's list is aggregated from.
  const [structure, setStructure] = useState<VenueStructure | undefined>(undefined);

  useEffect(() => {
    let live = true;
    if (eventId) setSpares(loadSpares(eventId));
    const ev = activeEvent();
    void fetchVenueGeometry(ev?.venueId).then((geometry) => {
      if (live) setStructure(eventPlan(ev, geometry).structure);
    });
    return () => {
      live = false;
    };
  }, [eventId]);

  const setSpare = (variantId: string, v: number) => {
    if (!eventId) return;
    setSpares(saveSpare(eventId, variantId, v, spares));
  };

  const groups = packingList(doc, itemLookup, measureContext(structure));
  // Countable rows only: metres of drape and square metres of carpet are not "items", and adding
  // them into one headline number would make it mean nothing.
  const total = groups.reduce(
    (s, g) => s + g.rows.reduce((n, r) => (r.unit === "unit" ? n + r.quantity + (spares[r.variantId] ?? 0) : n), 0),
    0,
  );

  if (groups.length === 0) {
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
      <p className="nums text-sm text-muted">סה״כ {total} פריטים (כולל רזרבה)</p>
      {groups.map((g) => (
        <section key={g.categoryId} className="break-inside-avoid">
          <h3 className="mb-2 border-b border-ink pb-1 text-base font-semibold text-ink">{g.label}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1.5 text-start font-medium">פריט</th>
                <th className="w-16 py-1.5 text-start font-medium">כמות</th>
                <th className="w-20 py-1.5 text-start font-medium">רזרבה</th>
                <th className="w-20 py-1.5 text-start font-medium">סה״כ</th>
                <th className="w-14 py-1.5 text-center font-medium">נארז</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => {
                const spare = spares[r.variantId] ?? 0;
                // Multiplier math covers spares too: candles = holders × arms (F-6.2).
                const derivedTotal = r.derived ? Math.round((r.derived.quantity / r.quantity) * (r.quantity + spare)) : 0;
                return (
                  <tr key={r.variantId} className="border-t border-border">
                    <td className="py-2 text-ink">
                      {r.label}
                      {r.derived && (
                        <span className="mt-0.5 block text-xs text-muted">
                          כולל <span className="nums">{derivedTotal}</span> {r.derived.label}
                        </span>
                      )}
                    </td>
                    <td className="nums py-2 text-ink">{formatAmount(r.quantity, r.unit)}</td>
                    <td className="py-2">
                      <NumberField
                        size="sm"
                        decimals={0}
                        min={0}
                        hideZero
                        value={spare}
                        onChange={(v) => setSpare(r.variantId, v)}
                        placeholder="0"
                        aria-label={`רזרבה עבור ${r.label}`}
                        className="w-14 print:border-transparent"
                      />
                    </td>
                    <td className="nums py-2 font-semibold text-ink">{formatAmount(round1(r.quantity + spare), r.unit)}</td>
                    <td className="py-2 text-center">
                      <span className="inline-block h-4 w-4 rounded-[3px] border border-ink-soft align-middle" aria-hidden="true" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
