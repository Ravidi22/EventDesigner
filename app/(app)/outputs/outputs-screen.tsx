"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { storageKey } from "@/lib/storage-keys";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { sampleDoc } from "@/lib/studio/sample-doc";
import { loadDoc, loadHall } from "@/lib/studio/storage";
import { SAMPLE_HALL, type Hall } from "@/lib/studio/hall";
import { activeEvent } from "@/lib/events/storage";
import type { EventSummary } from "@/lib/events/types";
import { Button } from "@/components/button";
import { PackingList } from "./packing-list";
import { PlacementMap } from "./placement-map";
import { Quote } from "./quote";

type View = "packing" | "map" | "quote";
const TITLES: Record<View, string> = { packing: "רשימת ציוד", map: "מפת הצבה", quote: "הצעת מחיר" };

type Paper = "A4" | "A3";
type Orient = "portrait" | "landscape";

const exportKey = (eventId: string) => storageKey(`exports.${eventId}`);

export function OutputsScreen() {
  const [doc, setDoc] = useState<DesignDocumentContent>(() => sampleDoc());
  const [hall, setHall] = useState<Hall>(SAMPLE_HALL);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [view, setView] = useState<View>("packing");
  const [paper, setPaper] = useState<Paper>("A4");
  const [orient, setOrient] = useState<Orient>("landscape");
  const [version, setVersion] = useState(1);

  // Read the current design document + hall the studio autosaved (keeps SSR deterministic).
  useEffect(() => {
    const saved = loadDoc();
    if (saved) setDoc(saved);
    const savedHall = loadHall();
    if (savedHall) setHall(savedHall);
    const ev = activeEvent();
    setEvent(ev);
    if (ev) {
      try {
        setVersion(Number(window.localStorage.getItem(exportKey(ev.id)) ?? 0) + 1);
      } catch {
        // stays at 1
      }
    }
  }, []);

  // F-6.4: every export carries date + a running version number, bumped per print.
  const print = () => {
    if (event) {
      try {
        window.localStorage.setItem(exportKey(event.id), String(version));
      } catch {
        // non-fatal
      }
      setVersion((v) => v + 1);
    }
    // Print the just-stamped version (state updates after; the stamp below uses `version`).
    window.print();
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
            {event && <p className="mt-0.5 text-sm text-muted">{event.clientName} · {event.hallName}</p>}
          </div>
          {/* F-6.4: date + version stamp — on screen and in print */}
          <p className="nums text-sm text-muted">
            {today} · גרסה {version}
          </p>
        </div>
        {view === "packing" ? (
          <PackingList doc={doc} eventId={event?.id ?? null} />
        ) : view === "map" ? (
          <PlacementMap doc={doc} hall={hall} />
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
