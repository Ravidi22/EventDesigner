"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chairOf, defaultChair } from "@/lib/catalog/chairs";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { BackToStudio } from "./back-to-studio";
import { packingList, UNTYPED_CHAIRS } from "@/lib/outputs/aggregate";
import { itemLookup, measureContext } from "@/lib/outputs/lookup";
import { activeEvent } from "@/lib/events/storage";
import { eventPlan } from "@/lib/events/plan";
import type { VenueStructure } from "@/lib/venues/structure";
import { fetchVenueGeometry } from "@/lib/venues/actions";
import { fetchSpares, saveSpare, type Spares } from "@/lib/outputs/actions";
import { formatAmount } from "@/lib/catalog/format";
import { NumberField } from "@/components/number-field";
import { VenueAccessNotice } from "@/components/venue-access-notice";
import type { DocTheme } from "@/lib/documents/theme";
import { CrewSection, Tick, crewBody, crewNums } from "./crew-doc";

const round1 = (n: number) => Math.round(n * 10) / 10;

// F-6.3: manual spares per row, persisted with the event — so the "no manual fixes" success
// metric covers reserves too, instead of pen-on-paper additions.
/** `meeting`: see Quote — the empty state points back into the flow rather than out to /studio. */
/** `theme`: the studio's document direction, in ink (./crew-doc.tsx). */
/** `onSpares`: the reserves as saved and typed, for the end panel's "רזרבה" group (outputs-screen). */
export function PackingList({
  theme: t,
  doc,
  eventId,
  meeting = false,
  onSpares,
}: {
  theme: DocTheme;
  doc: DesignDocumentContent;
  eventId: string | null;
  meeting?: boolean;
  onSpares?: (spares: Spares) => void;
}) {
  const [spares, setSpares] = useState<Spares>({});
  const spareKey = JSON.stringify(spares);
  useEffect(() => {
    onSpares?.(spares);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spareKey]);
  // Same reason as the quote: a drape's metres come from the wall it hangs on, which lives at the
  // venue rather than in the document the crew's list is aggregated from — so the same unreachable
  // property makes the same rows fall back to catalog sizes, and the crew packs to the wrong length.
  const [structure, setStructure] = useState<VenueStructure | undefined>(undefined);
  const [venueDenied, setVenueDenied] = useState(false);

  // A reserve is written per keystroke by the field below. Against localStorage that was free;
  // against a database it is a request per digit typed into "רזרבה", so each row's write waits for
  // the typing to stop. Per variant, because two rows can be edited in the same breath.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, number>());

  const flush = useCallback(
    (id: string, variantId: string) => {
      const quantity = pending.current.get(variantId);
      if (quantity === undefined) return;
      pending.current.delete(variantId);
      timers.current.delete(variantId);
      // The screen already shows this number (set optimistically below); the answer is the whole
      // map, which also picks up anything another device changed in the meantime.
      void saveSpare(id, variantId, quantity)
        .then(setSpares)
        .catch(() => {
          // Leave the typed number on screen rather than yanking it back mid-print-prep. The next
          // edit retries, and a reload shows what actually landed.
        });
    },
    [],
  );

  useEffect(() => {
    let live = true;
    if (eventId) {
      void fetchSpares(eventId).then((saved) => {
        if (live) setSpares(saved);
      });
    }
    void (async () => {
      const ev = await activeEvent();
      const geometry = await fetchVenueGeometry(ev?.venueId);
      if (live) {
        setStructure(eventPlan(ev, geometry).structure);
        setVenueDenied(geometry.access === "denied");
      }
    })();
    return () => {
      live = false;
    };
  }, [eventId]);

  // Whatever is still waiting on its debounce when this screen closes goes out now — a reserve
  // typed and then navigated away from is exactly the hand-correction this field exists to prevent.
  useEffect(() => {
    const scheduled = timers.current;
    const waiting = pending.current;
    return () => {
      if (!eventId) return;
      for (const timer of scheduled.values()) clearTimeout(timer);
      scheduled.clear();
      for (const [variantId, quantity] of waiting) void saveSpare(eventId, variantId, quantity);
      waiting.clear();
    };
  }, [eventId]);

  const setSpare = (variantId: string, v: number) => {
    if (!eventId) return;
    const quantity = Math.max(0, Math.round(v));
    // Optimistic, so the field never lags a keystroke behind the finger typing into it.
    setSpares((prev) => {
      const next = { ...prev };
      if (quantity > 0) next[variantId] = quantity;
      else delete next[variantId];
      return next;
    });
    pending.current.set(variantId, quantity);
    clearTimeout(timers.current.get(variantId));
    timers.current.set(
      variantId,
      setTimeout(() => flush(eventId, variantId), 400),
    );
  };

  const chairDefault = defaultChair();
  const groups = packingList(doc, itemLookup, measureContext(structure, doc), (t) => chairOf(t, chairDefault));
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
        <BackToStudio meeting={meeting} className="mt-3 inline-block text-sm" />
      </div>
    );
  }

  const th = "pb-1.5 text-start";
  const thStyle = { fontWeight: 500, fontSize: 10.5, color: t.muted, fontFamily: t.dir === "studio" ? t.mono : undefined };
  const rowLine = `0.5px solid ${t.hair}`;
  return (
    <div className="flex flex-col" style={{ ...crewBody(t), gap: 28 * t.k }}>
      {venueDenied && <VenueAccessNotice tone="measure" className="no-print" />}
      <p style={{ ...crewNums(t), fontSize: 13, color: t.soft, textAlign: t.dir === "stationery" ? "center" : undefined }}>
        סה״כ {total} פריטים (כולל רזרבה)
      </p>
      {groups.map((g, gi) => (
        <CrewSection key={g.categoryId} t={t} n={gi + 1} title={g.label}>
          <table className="w-full" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th className={th} style={thStyle}>פריט</th>
                <th className={`w-16 ${th}`} style={thStyle}>כמות</th>
                <th className={`w-20 ${th}`} style={thStyle}>רזרבה</th>
                <th className={`w-20 ${th}`} style={thStyle}>סה״כ</th>
                <th className="w-14 pb-1.5 text-center" style={thStyle}>נארז</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => {
                const spare = spares[r.variantId] ?? 0;
                // Multiplier math covers spares too: candles = holders × arms (F-6.2).
                const withSpare = (perPlan: number) => Math.round((perPlan / r.quantity) * (r.quantity + spare));
                const derivedTotal = r.derived ? withSpare(r.derived.quantity) : 0;
                return (
                  <tr key={r.variantId} style={{ borderTop: rowLine }}>
                    <td className="py-2">
                      {r.label}
                      {r.derived && (
                        <span className="mt-0.5 block" style={{ fontSize: 11, color: t.muted }}>
                          כולל <span style={crewNums(t)}>{derivedTotal}</span> {r.derived.label}
                          {/* The flower spec, totalled for the whole event: what the florist is
                              asked for, flower by flower, under the stem total it adds up to. */}
                          {r.breakdown && (
                            <span className="block" style={crewNums(t)}>
                              {r.breakdown.map((b, i) => (
                                <span key={`${b.label}-${i}`}>
                                  {i > 0 && " · "}
                                  {b.label} ×{withSpare(b.quantity)}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-2" style={crewNums(t)}>{formatAmount(r.quantity, r.unit)}</td>
                    <td className="py-2">
                      {/* No spares on the untyped chairs row: a spare is stored against a catalog
                          variant, and this row has none until the studio adds a chair. */}
                      {r.variantId !== UNTYPED_CHAIRS && (
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
                      )}
                    </td>
                    <td className="py-2" style={{ ...crewNums(t), fontWeight: 600 }}>{formatAmount(round1(r.quantity + spare), r.unit)}</td>
                    <td className="py-2 text-center">
                      <Tick t={t} size={15} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CrewSection>
      ))}
    </div>
  );
}
