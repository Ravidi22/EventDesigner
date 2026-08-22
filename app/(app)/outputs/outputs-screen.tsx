"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { emptyDocument } from "@/lib/design-document/types";
import { fetchDocument } from "@/lib/studio/actions";
import { loadScratch } from "@/lib/studio/storage";
import { EMPTY_PLAN, eventPlan, type EventPlan } from "@/lib/events/plan";
import { activeEvent } from "@/lib/events/storage";
import { fetchVenueGeometry } from "@/lib/venues/actions";
import { fetchNextExportNumber, recordExport, type ExportType } from "@/lib/outputs/actions";
import { zonesLabelOf, type EventSummary } from "@/lib/events/types";
import { Button } from "@/components/button";
import { PackingList } from "./packing-list";
import { PlacementMap } from "./placement-map";
import { VenueAccessNotice } from "@/components/venue-access-notice";
import { Quote } from "./quote";

type View = "packing" | "map" | "quote";
const TITLES: Record<View, string> = { packing: "רשימת ציוד", map: "מפת הצבה", quote: "הצעת מחיר" };
/** Which kind of sheet each view produces, for the export log (F-6.4). */
const EXPORT_OF: Record<View, ExportType> = {
  packing: "packing_list",
  map: "placement_map",
  quote: "quote",
};

type Paper = "A4" | "A3";
type Orient = "portrait" | "landscape";

export function OutputsScreen() {
  // Empty until the event's real document loads. A packing list is the one screen that must never
  // show invented numbers — a crew reading a sample plan would pack for an event that doesn't exist.
  const [doc, setDoc] = useState<DesignDocumentContent>(() => emptyDocument());
  const [plan, setPlan] = useState<EventPlan>(EMPTY_PLAN);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [view, setView] = useState<View>("packing");
  const [paper, setPaper] = useState<Paper>("A4");
  const [orient, setOrient] = useState<Orient>("landscape");
  const [version, setVersion] = useState(1);

  // Read the design document the studio autosaved (keeps SSR deterministic), and resolve the plan
  // it sits on from the event's venue + zones — the same geometry the studio drew it against.
  useEffect(() => {
    let live = true;
    void (async () => {
      const ev = await activeEvent();
      if (!live) return;
      // A studio with no events at all can still have a scratch drawing (lib/studio/storage.ts);
      // everything that belongs to an event comes from the server.
      const saved = ev ? (await fetchDocument(ev.id))?.content : loadScratch();
      if (!live) return;
      if (saved) setDoc(saved);
      setEvent(ev);
      if (ev) {
        const next = await fetchNextExportNumber(ev.id);
        if (live) setVersion(next);
      }
      const geometry = await fetchVenueGeometry(ev?.venueId);
      if (live) setPlan(eventPlan(ev, geometry));
    })();
    return () => {
      live = false;
    };
  }, []);

  // F-6.4: every export carries a date and a running number — and now a ROW, which also seals the
  // drawing it was made from, so a sheet in a crew's hands stays checkable against the design it
  // came from rather than merely being numbered.
  const print = async () => {
    if (!event) {
      window.print();
      return;
    }
    let printed = version;
    try {
      printed = await recordExport(event.id, EXPORT_OF[view]);
    } catch {
      // Recording failed. The sheet still prints: a crew waiting on paper is not helped by a failed
      // log write. It simply doesn't enter the history, which is the honest outcome.
    }
    setVersion(printed);
    // Let React paint the number before the print dialog freezes the page — the sheet has to carry
    // the number that was actually recorded, not the one it was showing a moment ago.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.print();
    setVersion(printed + 1);
  };

  const today = new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="flex min-h-full flex-col">
      {/* F-6.1: page setup applies when printing */}
      <style>{`@media print { @page { size: ${paper} ${orient}; } }`}</style>

      <div className="no-print flex flex-wrap items-center gap-3 border-b border-border bg-surface px-8 py-3">
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {(Object.keys(TITLES) as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={
                "rounded-[5px] px-3 py-1.5 text-sm transition-colors " +
                (view === v ? "bg-accent-tint font-medium text-ink" : "text-ink-soft hover:text-ink")
              }
            >
              {TITLES[v]}
            </button>
          ))}
        </div>

        {/* F-6.1: paper + orientation for the printed output */}
        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 text-xs">
          {(["A4", "A3"] as Paper[]).map((p) => (
            <SegSmall key={p} active={paper === p} onClick={() => setPaper(p)}>
              {p}
            </SegSmall>
          ))}
          <span className="mx-0.5 h-4 w-px bg-border" />
          <SegSmall active={orient === "portrait"} onClick={() => setOrient("portrait")}>
            לאורך
          </SegSmall>
          <SegSmall active={orient === "landscape"} onClick={() => setOrient("landscape")}>
            לרוחב
          </SegSmall>
        </div>

        <Button onClick={print} className="ms-auto">
          <Printer className="h-4 w-4" strokeWidth={2} />
          הדפסה / PDF
        </Button>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-8 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 flex items-baseline justify-between border-b border-ink pb-3">
          <div>
            <h2 className="font-display text-h2 text-ink">{TITLES[view]}</h2>
            {event && <p className="mt-0.5 text-sm text-muted">{event.clientName} · {zonesLabelOf(event)}</p>}
          </div>
          {/* F-6.4: date + version stamp — on screen and in print */}
          <p className="nums text-sm text-muted">
            {today} · גרסה {version}
          </p>
        </div>
        {/* The map's own case: no walls, no room to draw one on. The list and the quote carry their
            own notice instead of being told from here, because both are rendered straight from the
            meeting flow too, where this screen is nowhere in the tree.
            `no-print` on purpose — this explains the sheet to whoever is producing it; it is not
            part of what a client or a crew receives. */}
        {view === "map" && plan.access === "denied" && (
          <VenueAccessNotice tone="plan" className="no-print mb-6" />
        )}
        {view === "packing" ? (
          <PackingList doc={doc} eventId={event?.id ?? null} />
        ) : view === "map" ? (
          <PlacementMap doc={doc} plan={plan} />
        ) : (
          <Quote doc={doc} />
        )}
      </main>
    </div>
  );
}

function SegSmall({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-[5px] px-2 py-1 transition-colors " +
        (active ? "bg-accent-tint font-medium text-ink" : "text-muted hover:text-ink")
      }
    >
      {children}
    </button>
  );
}
