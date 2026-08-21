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

/** Trim sizes in millimetres. The preview is drawn at these exact dimensions — mm is a real CSS
 *  unit on screen — so what a designer reads here breaks its lines where the PDF will break them.
 *  A preview at "roughly a page's width" is the one thing worse than no preview. */
const TRIM: Record<Paper, [number, number]> = { A4: [210, 297], A3: [297, 420] };
/** Matches `@page { margin: 16mm }` in globals.css, so the white border around the sheet on screen
 *  is the same white border the printer leaves. Keep the two in step. */
const MARGIN_MM = 16;

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
  const [w, h] = orient === "portrait" ? TRIM[paper] : [TRIM[paper][1], TRIM[paper][0]];
  // The quote prints its own letterhead — business, client, number, date (./quote-sheet.tsx). The
  // crew's two sheets have no letterhead of their own, so the stamp above them is theirs.
  const stamped = view !== "quote";

  return (
    <div className="flex h-full flex-col gap-3">
      {/* F-6.1: page setup applies when printing */}
      <style>{`@media print { @page { size: ${paper} ${orient}; } }`}</style>

      {/* The toolbar is a floating card on the plane, matching the sidebar and the top bar above
          it — same 14px corner, same violet-cast lift, same gutter. It used to be a flush bordered
          strip, which is the one chrome idiom this shell doesn't use anywhere else. */}
      <div className="no-print flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-surface px-5 py-2.5 shadow-floating">
        <Seg>
          {(Object.keys(TITLES) as View[]).map((v) => (
            <SegItem key={v} active={view === v} onClick={() => setView(v)}>
              {TITLES[v]}
            </SegItem>
          ))}
        </Seg>

        <span aria-hidden className="h-6 w-px bg-border" />

        {/* F-6.1: paper + orientation. Secondary to the view above — page setup is something you
            touch once, so it reads as settings rather than as the screen's subject. */}
        <div className="flex items-center gap-2">
          <span className="text-caption text-muted">גיליון</span>
          <Seg>
            {(["A4", "A3"] as Paper[]).map((p) => (
              <SegItem key={p} active={paper === p} onClick={() => setPaper(p)} small>
                <span className="nums" dir="ltr">
                  {p}
                </span>
              </SegItem>
            ))}
          </Seg>
          <Seg>
            <SegItem active={orient === "portrait"} onClick={() => setOrient("portrait")} small>
              לאורך
            </SegItem>
            <SegItem active={orient === "landscape"} onClick={() => setOrient("landscape")} small>
              לרוחב
            </SegItem>
          </Seg>
        </div>

        <Button onClick={print} className="ms-auto">
          <Printer className="h-4 w-4" strokeWidth={2} />
          הדפסה / PDF
        </Button>
      </div>

      {/* The light table: the sheet floats on the app's own lavender plane at its true trim size,
          so this IS the preview. Scrolling lives here rather than on <main>, which keeps the
          toolbar pinned while a long document runs past it. */}
      <div className="min-h-0 flex-1 overflow-auto print:overflow-visible">
        <div className="flex flex-col items-center gap-4 pb-10 print:block print:pb-0">
          {/* `no-print` on purpose — this explains the sheet to whoever is producing it; it is not
              part of what a client or a crew receives. The list and the quote carry their own
              notice, because both are rendered straight from the meeting flow too, where this
              screen is nowhere in the tree. */}
          {view === "map" && plan.access === "denied" && (
            <VenueAccessNotice tone="plan" className="no-print w-full max-w-3xl" />
          )}

          <article
            className="sheet w-full bg-canvas shadow-lifted"
            style={{ maxWidth: `${w}mm`, minHeight: `${h}mm`, padding: `${MARGIN_MM}mm` }}
          >
            {stamped && (
              <header className="mb-6 flex items-baseline justify-between gap-4 border-b border-ink pb-3">
                <div className="min-w-0">
                  <h2 className="font-display text-h2 text-ink">{TITLES[view]}</h2>
                  {event && (
                    <p className="mt-0.5 text-caption text-muted">
                      {event.clientName} · {zonesLabelOf(event)}
                    </p>
                  )}
                </div>
                {/* F-6.4: date + version stamp — on screen and in print */}
                <p className="nums shrink-0 text-caption text-muted">
                  {today} · גרסה {version}
                </p>
              </header>
            )}

            {view === "packing" ? (
              <PackingList doc={doc} eventId={event?.id ?? null} />
            ) : view === "map" ? (
              <PlacementMap doc={doc} plan={plan} />
            ) : (
              <Quote doc={doc} />
            )}
          </article>
        </div>
      </div>
    </div>
  );
}

/** A segmented control: hairline tray, one filled thumb. The same vocabulary as the discount
 *  switch on the quote, so the screen has one kind of switch rather than two. */
function Seg({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">{children}</div>;
}

function SegItem({
  active,
  onClick,
  small,
  children,
}: {
  active: boolean;
  onClick: () => void;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-sm transition-colors " +
        (small ? "px-2.5 py-1 text-caption " : "px-3.5 py-1.5 text-sm ") +
        (active ? "bg-accent-tint font-semibold text-accent" : "text-muted hover:bg-accent-tint hover:text-accent-hover")
      }
    >
      {children}
    </button>
  );
}
