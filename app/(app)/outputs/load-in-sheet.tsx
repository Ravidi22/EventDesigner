"use client";

import { useEffect, useState } from "react";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { EventSummary } from "@/lib/events/types";
import { formatEventDate, zonesLabelOf } from "@/lib/events/types";
import { fetchLoadIn, type LoadInFacts } from "@/lib/production/actions";
import { packingList } from "@/lib/outputs/aggregate";
import { itemLookup } from "@/lib/outputs/lookup";
import { seatingSummary } from "@/lib/outputs/table-kits";
import { chairOf, defaultChair } from "@/lib/catalog/chairs";
import { formatAmount } from "@/lib/catalog/format";
import { useVenues } from "@/lib/venues/use-venues";
import type { DocTheme } from "@/lib/documents/theme";
import { IndexRow, type SetEntry } from "./set-cover";
import { CrewSection, Tick, crewBody, crewNums } from "./crew-doc";
import { BackToStudio } from "./back-to-studio";

// THE LOAD-IN SHEET — the one page the crew lead reads in the van.
//
// Everything on it already exists somewhere else in the app: the brief (the event), the people
// (event_crew), the deliveries (orders and their answers), the counts (the packing list), the set
// (the map booklet's index). What did not exist was ONE page with all of it, and a crew with the
// right packing list and the wrong phone number is a crew that waits in a car park. Black ink on
// white, like every sheet, set in the studio's document direction (./crew-doc.tsx); counts only, never a price (npm run check:costs).
//
// Deliberately absent, because the app does not hold them yet: the load-in HOUR, the venue's
// access hours and site contact. The sheet leaves ruled space for them to be written by hand,
// which is honest about where that knowledge lives today.
export function LoadInSheet({
  theme: t,
  event,
  doc,
  entries,
  meeting = false,
  onFacts,
}: {
  theme: DocTheme;
  event: EventSummary | null;
  doc: DesignDocumentContent;
  /** The map booklet's index — what is in the folder, in order. */
  entries: SetEntry[];
  meeting?: boolean;
  /** The crew and the deliveries as read, for the end panel's "מאיפה הדף נבנה" (outputs-screen). */
  onFacts?: (facts: LoadInFacts) => void;
}) {
  const [facts, setFacts] = useState<LoadInFacts | null>(null);
  useEffect(() => {
    if (facts) onFacts?.(facts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts]);
  const { venues } = useVenues();
  const venueName = event?.venueId ? venues.find((v) => v.id === event.venueId)?.name : undefined;

  useEffect(() => {
    let live = true;
    if (!event) return;
    fetchLoadIn(event.id)
      .then((f) => live && setFacts(f))
      .catch(() => live && setFacts({ crew: [], deliveries: [] }));
    return () => {
      live = false;
    };
  }, [event]);

  if (!event) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-ink-soft">אין אירוע פתוח להפיק לו דף הקמה.</p>
        <BackToStudio meeting={meeting} className="mt-3 inline-block text-sm" />
      </div>
    );
  }

  const groups = packingList(doc, itemLookup, undefined, (t) => chairOf(t, defaultChair()));
  const items = groups.reduce((s, g) => s + g.rows.reduce((n, r) => (r.unit === "unit" ? n + r.quantity : n), 0), 0);
  const place = [venueName, zonesLabelOf(event)].filter(Boolean).join(" · ");
  const contacts = [
    { name: event.contactName || event.clientName, phone: event.phone },
    ...(event.contact2Name || event.contact2Phone ? [{ name: event.contact2Name || "איש קשר נוסף", phone: event.contact2Phone ?? "" }] : []),
  ].filter((c) => c.phone || c.name);

  const facts2: [string, string][] = [
    ["תאריך האירוע", event.date ? `${formatEventDate(event.date)}${event.time ? ` · ${event.time}` : ""}` : "טרם נקבע"],
    ["יום ההקמה", event.setupDate ? formatEventDate(event.setupDate) : "ביום האירוע"],
    ["מקום", place || "—"],
    ["אורחים", event.guests ? String(event.guests) : "—"],
    ...(seatingSummary(doc) ? ([["שולחנות ומקומות", seatingSummary(doc)]] as [string, string][]) : []),
    ...(event.eventType ? ([["סוג האירוע", event.eventType]] as [string, string][]) : []),
  ];

  // Sections are counted as they are drawn — the booklet index is there only when there is a booklet.
  let n = 0;
  const S = (title: string, children: React.ReactNode) => (
    <CrewSection t={t} n={++n} title={title}>
      {children}
    </CrewSection>
  );
  const quiet = { fontSize: 13, color: t.soft } as const;
  const rowLine = `0.5px solid ${t.hair}`;

  return (
    <div className="flex flex-col" style={{ ...crewBody(t), gap: 26 * t.k }}>
      <dl className={`grid grid-cols-2 ${t.dir === "stationery" ? "text-center" : ""}`} style={{ columnGap: 32, rowGap: 12 * t.k }}>
        {facts2.map(([k, v]) => (
          <div key={k} style={{ borderBottom: rowLine, paddingBottom: 6 }}>
            <dt style={{ fontSize: 10.5, color: t.muted, fontFamily: t.dir === "studio" ? t.mono : undefined }}>{k}</dt>
            <dd style={{ ...crewNums(t), fontSize: 14.5, fontWeight: 500, marginTop: 2 }}>{v}</dd>
          </div>
        ))}
        {/* The two facts the app does not hold yet, left as lines to be written by hand. */}
        <Blank t={t} label="שעת הגעה לאולם" />
        <Blank t={t} label="איש קשר באולם" />
      </dl>

      {S(
        "אנשי קשר",
        contacts.length === 0 ? (
          <p style={quiet}>לא נרשמו אנשי קשר.</p>
        ) : (
          <ul style={{ fontSize: 13 }}>
            {contacts.map((c, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4" style={{ padding: "5px 0", borderTop: i > 0 ? rowLine : undefined }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <span dir="ltr" style={crewNums(t)}>
                  {c.phone}
                </span>
              </li>
            ))}
          </ul>
        ),
      )}

      {S(
        "צוות הקמה",
        !facts ? (
          <p style={quiet}>טוען…</p>
        ) : facts.crew.length === 0 ? (
          <p style={quiet}>לא נבחר צוות לאירוע.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-8 gap-y-1" style={{ fontSize: 13 }}>
            {facts.crew.map((c, i) => (
              <li key={i} className="flex items-center gap-2 py-0.5">
                <Tick t={t} />
                <span style={{ fontWeight: 600 }}>{c.name}</span>
              </li>
            ))}
          </ul>
        ),
      )}

      {S(
        "אספקות מספקים",
        !facts ? (
          <p style={quiet}>טוען…</p>
        ) : facts.deliveries.length === 0 ? (
          <p style={quiet}>אין הזמנות לספקים לתאריך הזה — הכול מהמלאי.</p>
        ) : (
          <ul className="space-y-3">
            {facts.deliveries.map((d, i) => (
              <li key={i} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-4" style={{ fontSize: 13 }}>
                  <span>
                    <span style={{ fontWeight: 600 }}>{d.supplierName}</span>
                    {d.contactName && <span style={{ color: t.soft }}> · {d.contactName}</span>}
                    {d.phone && (
                      <span dir="ltr" style={{ ...crewNums(t), color: t.soft }}>
                        {" "}
                        · {d.phone}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0" style={{ color: t.soft }}>
                    {d.statusLabel}
                  </span>
                </div>
                <ul className="mt-1 ps-4" style={{ fontSize: 13 }}>
                  {d.lines.map((l, j) => (
                    <li key={j} className="flex items-center gap-2 py-0.5">
                      <Tick t={t} size={12} />
                      <span className="min-w-0 flex-1">{l.description}</span>
                      <span className="shrink-0" style={crewNums(t)}>
                        {formatAmount(l.quantity, "unit")} {l.unitLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ),
      )}

      {S(
        "ציוד",
        groups.length === 0 ? (
          <p style={quiet}>עדיין אין פריטים בעיצוב.</p>
        ) : (
          <>
            <p style={{ ...crewNums(t), fontSize: 13 }}>
              סה״כ {items} פריטים ב־{groups.length} קטגוריות — הפירוט ברשימת הציוד.
            </p>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-8" style={{ fontSize: 13 }}>
              {groups.map((g) => (
                <li key={g.categoryId} className="flex items-baseline justify-between gap-4 py-1" style={{ borderBottom: rowLine }}>
                  <span>{g.label}</span>
                  <span style={{ ...crewNums(t), color: t.soft }}>{g.rows.length} שורות</span>
                </li>
              ))}
            </ul>
          </>
        ),
      )}

      {entries.length > 0 &&
        S(
          "בחוברת המפות",
          <ol>
            {entries.map((e, i) => (
              <IndexRow key={i} t={t} e={e} />
            ))}
          </ol>,
        )}

      {S(
        "הערות",
        <div aria-hidden className="space-y-6 pt-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ borderBottom: `0.5px solid ${t.soft2}` }} />
          ))}
        </div>,
      )}
    </div>
  );
}

/** A fact to be written by hand: its name over a rule. */
function Blank({ t, label }: { t: DocTheme; label: string }) {
  return (
    <div style={{ borderBottom: `1px solid ${t.rule}`, paddingBottom: 6 }}>
      <dt style={{ fontSize: 10.5, color: t.muted, fontFamily: t.dir === "studio" ? t.mono : undefined }}>{label}</dt>
      <dd className="mt-0.5 h-6" aria-hidden />
    </div>
  );
}
