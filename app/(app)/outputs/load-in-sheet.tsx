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
import type { SetEntry } from "./set-cover";
import { BackToStudio } from "./back-to-studio";

// THE LOAD-IN SHEET — the one page the crew lead reads in the van.
//
// Everything on it already exists somewhere else in the app: the brief (the event), the people
// (event_crew), the deliveries (orders and their answers), the counts (the packing list), the set
// (the map booklet's index). What did not exist was ONE page with all of it, and a crew with the
// right packing list and the wrong phone number is a crew that waits in a car park. Black ink on
// white, like every sheet; counts only, never a price (npm run check:costs).
//
// Deliberately absent, because the app does not hold them yet: the load-in HOUR, the venue's
// access hours and site contact. The sheet leaves ruled space for them to be written by hand,
// which is honest about where that knowledge lives today.
export function LoadInSheet({
  event,
  doc,
  entries,
  meeting = false,
}: {
  event: EventSummary | null;
  doc: DesignDocumentContent;
  /** The map booklet's index — what is in the folder, in order. */
  entries: SetEntry[];
  meeting?: boolean;
}) {
  const [facts, setFacts] = useState<LoadInFacts | null>(null);
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

  return (
    <div className="space-y-7 text-ink">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
        {facts2.map(([k, v]) => (
          <div key={k} className="border-b border-border pb-2">
            <dt className="text-caption text-muted">{k}</dt>
            <dd className="nums mt-0.5 text-base font-semibold">{v}</dd>
          </div>
        ))}
        {/* The two facts the app does not hold yet, left as lines to be written by hand. */}
        <Blank label="שעת הגעה לאולם" />
        <Blank label="איש קשר באולם" />
      </dl>

      <Section title="אנשי קשר">
        {contacts.length === 0 ? (
          <p className="text-sm text-ink-soft">לא נרשמו אנשי קשר.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {contacts.map((c, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 py-1.5">
                <span className="font-semibold">{c.name}</span>
                <span className="nums" dir="ltr">
                  {c.phone}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="צוות הקמה">
        {!facts ? (
          <p className="text-sm text-ink-soft">טוען…</p>
        ) : facts.crew.length === 0 ? (
          <p className="text-sm text-ink-soft">לא נבחר צוות לאירוע.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            {facts.crew.map((c, i) => (
              <li key={i} className="flex items-center gap-2 py-0.5">
                <Box />
                <span className="font-semibold">{c.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="אספקות מספקים">
        {!facts ? (
          <p className="text-sm text-ink-soft">טוען…</p>
        ) : facts.deliveries.length === 0 ? (
          <p className="text-sm text-ink-soft">אין הזמנות לספקים לתאריך הזה — הכול מהמלאי.</p>
        ) : (
          <ul className="space-y-3">
            {facts.deliveries.map((d, i) => (
              <li key={i} className="break-inside-avoid">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span>
                    <span className="font-semibold">{d.supplierName}</span>
                    {d.contactName && <span className="text-ink-soft"> · {d.contactName}</span>}
                    {d.phone && (
                      <span className="nums text-ink-soft" dir="ltr">
                        {" "}
                        · {d.phone}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-ink-soft">{d.statusLabel}</span>
                </div>
                <ul className="mt-1 ps-4 text-sm">
                  {d.lines.map((l, j) => (
                    <li key={j} className="flex items-center gap-2 py-0.5">
                      <Box />
                      <span className="min-w-0 flex-1">{l.description}</span>
                      <span className="nums shrink-0">
                        {formatAmount(l.quantity, "unit")} {l.unitLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="ציוד">
        {groups.length === 0 ? (
          <p className="text-sm text-ink-soft">עדיין אין פריטים בעיצוב.</p>
        ) : (
          <>
            <p className="nums text-sm">
              סה״כ {items} פריטים ב־{groups.length} קטגוריות — הפירוט ברשימת הציוד.
            </p>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-8 text-sm">
              {groups.map((g) => (
                <li key={g.categoryId} className="flex items-baseline justify-between gap-4 border-b border-border py-1">
                  <span>{g.label}</span>
                  <span className="nums text-ink-soft">{g.rows.length} שורות</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {entries.length > 0 && (
        <Section title="בחוברת המפות">
          <ol className="divide-y divide-border text-sm">
            {entries.map((e, i) => (
              <li key={i} className="flex items-baseline gap-3 py-1">
                <span className="nums w-12 shrink-0 text-ink-soft">{e.sheet ? `גיליון ${e.sheet}` : "נספח"}</span>
                <span className="font-semibold">{e.label}</span>
                {e.zone && <span className="text-ink-soft">· {e.zone}</span>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section title="הערות">
        <div aria-hidden className="space-y-6 pt-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-b border-border" />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-2 border-b border-ink pb-1 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** A fact to be written by hand: its name over a rule. */
function Blank({ label }: { label: string }) {
  return (
    <div className="border-b border-ink pb-2">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="mt-0.5 h-6" aria-hidden />
    </div>
  );
}

/** A printed tick box, like the packing list's "נארז" column. */
function Box() {
  return <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-ink-soft" aria-hidden />;
}
