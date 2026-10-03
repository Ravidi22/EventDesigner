"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Map, Printer, ReceiptText, type LucideIcon } from "lucide-react";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { emptyDocument } from "@/lib/design-document/types";
import { loadScratch } from "@/lib/studio/storage";
import { EMPTY_PLAN, eventPlan, type EventPlan } from "@/lib/events/plan";
import { useEventWorkspace } from "@/lib/events/use-workspace";
import { recordExport, type ExportType } from "@/lib/outputs/actions";
import { PLAN_SHEETS } from "@/lib/outputs/sheets";
import { fetchStageRules } from "@/lib/settings/actions";
import { zonesLabelOf } from "@/lib/events/types";
import { Button } from "@/components/button";
import { PackingList } from "./packing-list";
import { PlacementMap } from "./placement-map";
import { VenueAccessNotice } from "@/components/venue-access-notice";
import { Quote } from "./quote";

type View = "packing" | "map" | "quote";
const TITLES: Record<View, string> = { packing: "רשימת ציוד", map: "מפת הצבה", quote: "הצעת מחיר" };
/** Rail order, and it is not TITLES' key order by accident: the quote is first because it is what
 *  this screen opens on — this is the stage that CLOSES a meeting, and the two crew sheets are
 *  prepared afterwards, with nobody else in the room. */
const VIEWS: { id: View; icon: LucideIcon }[] = [
  { id: "quote", icon: ReceiptText },
  { id: "map", icon: Map },
  { id: "packing", icon: ClipboardList },
];
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
  const [view, setView] = useState<View>("quote");
  const [paper, setPaper] = useState<Paper>("A4");
  const [orient, setOrient] = useState<Orient>("landscape");
  const [version, setVersion] = useState(1);
  // The studio's railing rule, for the stage sheet (settings → במות). Off until read, and off if
  // the read fails — the sheet then simply marks no railing, which is what an unset rule means.
  const [railingAboveMm, setRailingAboveMm] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetchStageRules()
      .then((r) => live && setRailingAboveMm(r.railingAboveMm))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  // Which plan sheets print, in the "map" view — a crew does not read one drawing with everything
  // on it (lib/outputs/sheets.ts). Defaults to the hall plan alone; ids rather than PlanSheet
  // objects so the selection survives fine even if PLAN_SHEETS is ever reordered.
  const [sheetIds, setSheetIds] = useState<string[]>(["hall"]);
  const toggleSheet = (id: string) =>
    setSheetIds((ids) =>
      ids.includes(id) ? (ids.length > 1 ? ids.filter((x) => x !== id) : ids) : [...ids, id],
    );
  // PLAN_SHEETS' own order, not the order ticked — sheet numbering ("2 / 3") has to be stable
  // regardless of the sequence a designer happened to click them in.
  const selectedSheets = PLAN_SHEETS.filter((s) => sheetIds.includes(s.id));
  // EventSurface resolved all of this in one call for the whole surface.
  const { workspace, ready } = useEventWorkspace();

  // The document, the event, the sheet number and the geometry all arrive together, from the one
  // read EventSurface makes for this whole surface (lib/events/workspace.ts). This used to be a
  // four-step chain of server actions — resolve the event, then its document, then its export
  // number, then its venue geometry — each a separate POST that could not start until the previous
  // one had landed.
  //
  // Three of the four are DERIVED here rather than copied into state, because nothing on this screen
  // ever changes them: outputs renders a drawing, it does not edit one. State plus an effect to fill
  // it would have been a second copy that can only ever go stale.
  const event = workspace?.event ?? null;

  // Empty until the event's real document loads. A packing list is the one screen that must never
  // show invented numbers — a crew reading a sample plan would pack for an event that doesn't exist.
  // A studio with no events at all can still have a scratch drawing (lib/studio/storage.ts);
  // everything that belongs to an event comes from the server.
  const doc: DesignDocumentContent = useMemo(() => {
    if (!ready) return emptyDocument();
    return (event ? workspace?.document?.content : loadScratch()) ?? emptyDocument();
  }, [ready, event, workspace]);

  const plan: EventPlan = useMemo(
    () => (workspace ? eventPlan(event, workspace.geometry) : EMPTY_PLAN),
    [workspace, event],
  );

  // The sheet number is the one that IS state: printing bumps it (see `print` below), so it is not a
  // pure function of what the server sent. Seeded from the workspace during render rather than in an
  // effect — React's own pattern for state derived from a prop.
  const [numberedFrom, setNumberedFrom] = useState(workspace);
  if (workspace !== numberedFrom) {
    setNumberedFrom(workspace);
    if (workspace) setVersion(workspace.nextExportNumber);
  }

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
  // The quote prints its own letterhead (./quote-sheet.tsx) and a plan sheet carries a proper
  // drafting title block (sheet-frame.tsx) — only the packing list has neither, so it's the one
  // view that needs this generic stamp above it.
  const stamped = view === "packing";

  return (
    <div className="flex h-full min-h-0 print:block">
      {/* F-6.1: page setup applies when printing.
          A PLAN SHEET OWNS ITS OWN MARGIN. sheet-frame.tsx draws the border, the title block and
          the scale bar inside a full-trim page (210x297 for A4), so globals.css's
          `@page { margin: 16mm }` would shrink the printable box to 178x265 and the sheet would be
          clipped sideways — browsers do not paginate horizontally — and split down the page, putting
          the title block alone on a second sheet. Three ticked sheets printed six pages. This block
          cascades after globals.css and so wins. The packing list and the quote keep the 16mm page
          margin, which is the only margin they have. */}
      <style>{`@media print { @page { size: ${paper} ${orient}; ${view === "map" ? "margin: 0;" : ""} } }`}</style>

      {/* THE SHAPE IS THE STUDIO'S, deliberately: a rail of things to work on down the start edge,
          the work itself filling the rest. This used to be one horizontal strip doing four unrelated
          jobs at once — which document, which plan sheets, what paper, and print — and at that
          density the document you were choosing read as the same kind of control as the paper size.
          The rail separates them by position instead of by punctuation: WHAT prints up top, HOW it
          prints under the rule beneath.

          It is narrower than the studio's catalog rail (212px against 256) and its two halves are
          stacked tight rather than pushed apart with `mt-auto`. The rail holds three short rows and
          two switches — given a full column's height to spread across, the page setup ended up
          marooned at the bottom of the screen and each of its rows read as a label at one end of
          the panel and a control at the other.

          `no-print` on the whole rail. What is left when it goes is the sheet column, which is the
          deliverable. */}
      <aside className="no-print flex w-[212px] shrink-0 flex-col border-s border-border bg-surface">
        <nav className="flex flex-col gap-[3px] p-2.5" aria-label="מסמכי האירוע">
          {VIEWS.map(({ id, icon: Icon }) => (
            <div key={id}>
              {/* The app's own active-nav treatment, because that is what these are — the sidebar's
                  geometry and inks (CLAUDE.md § Design System Guidelines), not a second vocabulary
                  invented for this screen. */}
              <button
                type="button"
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
                className={
                  "flex w-full items-center gap-3 rounded-md px-3.5 py-[11px] text-sm transition-colors " +
                  (view === id
                    ? "bg-accent-tint font-bold text-accent"
                    : "font-semibold text-muted hover:bg-accent-tint hover:text-accent-hover")
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.4} />
                {TITLES[id]}
              </button>

              {/* F-6.x: which plan sheets print — a crew wants the ceiling plan without the seating
                  chart drawn over it. Nested UNDER the map rather than beside it in a strip: they
                  are that document's pages, and several can be lit at once where the rows above are
                  exclusive. Only shown while the map is the open document, so the rail never asks a
                  question about a sheet nobody is looking at. */}
              {id === "map" && view === "map" && (
                <ul className="mt-[3px] flex flex-col gap-[3px] ps-4">
                  {PLAN_SHEETS.map((sheet) => {
                    const on = sheetIds.includes(sheet.id);
                    return (
                      <li key={sheet.id}>
                        <button
                          type="button"
                          onClick={() => toggleSheet(sheet.id)}
                          aria-pressed={on}
                          className={
                            "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-caption transition-colors " +
                            (on ? "font-semibold text-accent" : "text-muted hover:text-ink-soft")
                          }
                        >
                          <span
                            aria-hidden
                            className={
                              "h-2 w-2 shrink-0 rounded-full border " +
                              (on ? "border-accent bg-accent" : "border-border")
                            }
                          />
                          {sheet.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </nav>

        {/* Page setup and the print itself, under the rule — you touch these once, after you have
            decided what you are printing. F-6.1. */}
        <div className="flex flex-col gap-2.5 border-t border-border p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-muted">גיליון</span>
            <Seg>
              {(["A4", "A3"] as Paper[]).map((pp) => (
                <SegItem key={pp} active={paper === pp} onClick={() => setPaper(pp)} small>
                  <span className="nums" dir="ltr">
                    {pp}
                  </span>
                </SegItem>
              ))}
            </Seg>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-muted">כיוון</span>
            <Seg>
              <SegItem active={orient === "portrait"} onClick={() => setOrient("portrait")} small>
                לאורך
              </SegItem>
              <SegItem active={orient === "landscape"} onClick={() => setOrient("landscape")} small>
                לרוחב
              </SegItem>
            </Seg>
          </div>

          <Button onClick={print} className="w-full">
            <Printer className="h-4 w-4" strokeWidth={2} />
            הדפסה / PDF
          </Button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg print:block">
      {/* The light table: the sheet floats on the app's own lavender plane at its true trim size,
          so this IS the preview. Scrolling lives here rather than on <main>, which keeps the
          toolbar pinned while a long document runs past it. */}
        <div className="min-h-0 flex-1 overflow-auto print:overflow-visible">
          <div className="flex flex-col items-center gap-4 p-5 print:block print:p-0">
          {/* `no-print` on purpose — this explains the sheet to whoever is producing it; it is not
              part of what a client or a crew receives. The list and the quote carry their own
              notice, because both are rendered straight from the meeting flow too, where this
              screen is nowhere in the tree. */}
          {view === "map" && plan.access === "denied" && (
            <VenueAccessNotice tone="plan" className="no-print w-full max-w-3xl" />
          )}

          {view === "map" ? (
            // One <article className="sheet"> per ticked sheet — each is its own printed page
            // (globals.css: .sheet breaks after itself), each carries its OWN drafting title block
            // (sheet-frame.tsx: venue/client, sheet name, "n / total", scale, date, version) instead
            // of the generic header above, so `stamped` is never used here.
            selectedSheets.map((sheet, i) => (
              <article key={sheet.id} className="sheet bg-canvas shadow-lifted">
                <PlacementMap
                  doc={doc}
                  plan={plan}
                  sheet={sheet}
                  title={event ? zonesLabelOf(event) : ""}
                  subtitle={event?.clientName}
                  sheetNumber={i + 1}
                  sheetCount={selectedSheets.length}
                  version={version}
                  date={today}
                  paper={{ widthMm: w, heightMm: h }}
                  marginMm={MARGIN_MM}
                  railingAboveMm={railingAboveMm}
                />
              </article>
            ))
          ) : (
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

              {view === "packing" ? <PackingList doc={doc} eventId={event?.id ?? null} /> : <Quote doc={doc} />}
            </article>
            )}
          </div>
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
