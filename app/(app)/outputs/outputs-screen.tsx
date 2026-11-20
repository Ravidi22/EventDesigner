"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  File as FileIcon,
  Flower2,
  Layers,
  Link2,
  Map as MapIcon,
  MapPin,
  Package,
  PackagePlus,
  PencilLine,
  Printer,
  ReceiptText,
  RotateCw,
  Share2,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { emptyDocument } from "@/lib/design-document/types";
import { loadScratch } from "@/lib/studio/storage";
import { EMPTY_PLAN, eventPlan, type EventPlan } from "@/lib/events/plan";
import { useEventWorkspace } from "@/lib/events/use-workspace";
import { recordExport, type ExportType, type Spares } from "@/lib/outputs/actions";
import { PLAN_SHEETS, sheetHasContent } from "@/lib/outputs/sheets";
import { resolve } from "@/lib/studio/catalog-resolver";
import { vesselOf } from "@/lib/catalog/vessel";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { loadProducts } from "@/lib/catalog/storage";
import type { Product } from "@/lib/catalog/types";
import { chairOf, defaultChair } from "@/lib/catalog/chairs";
import { zoneSheets } from "@/lib/outputs/zone-sheets";
import { kitLetters, seatingSummary, tableKits, tablesPhrase } from "@/lib/outputs/table-kits";
import { itemLookup, measureContext } from "@/lib/outputs/lookup";
import { packingList } from "@/lib/outputs/aggregate";
import { numberedUnits } from "@/lib/design-document/groups";
import type { StagePlacement } from "@/lib/design-document/stage";
import { nearestWall } from "@/lib/studio/anchor";
import { fetchSettings, fetchStageRules } from "@/lib/settings/actions";
import { fetchIssuedQuote } from "@/lib/quotes/actions";
import type { LoadInFacts } from "@/lib/production/actions";
import { zonesLabelOf } from "@/lib/events/types";
import { Button } from "@/components/button";
import { Skeleton } from "@/components/skeleton";
import { Segmented } from "@/components/segmented";
import { SwitchRow } from "@/components/toggle";
import { EndPanel, PanelGroups, PanelGroupsHeader, panelGroup as G } from "@/components/end-panel";
import { CheckRow, CollapsedAction, PanelFoot, PanelSkeleton } from "@/components/doc-shell";
import { PackingList } from "./packing-list";
import { LoadInSheet } from "./load-in-sheet";
import { KitSchedule, PlacementMap, StageSchedule, mapWorld } from "./placement-map";
import { TableDetail, detailWorld } from "./table-detail";
import { sheetScale } from "./sheet-frame";
import { SetCover, type SetEntry } from "./set-cover";
import { CrewFooter, CrewHeader } from "./crew-doc";
import { docTheme } from "@/lib/documents/theme";
import type { DocStyleSetting } from "@/lib/documents/style";
import { VenueAccessNotice } from "@/components/venue-access-notice";
import { WorkspaceFailed } from "@/components/workspace-failed";
import { Quote, statusOf } from "./quote";
import { buildQuotePdf, quoteFileName, shareFile } from "./quote-pdf";
import { DocRail, type RailDoc } from "./doc-rail";
import { SheetStage } from "./sheet-stage";
import type { DocParts } from "./doc-parts";

import { TITLES, type View } from "./views";
export type { View } from "./views";
/** Rail order, and it is not TITLES' key order by accident: the quote is first because it is what
 *  this screen opens on — this is the stage that CLOSES a meeting, and the crew sheets are prepared
 *  afterwards, with nobody else in the room. The load-in sheet is last: it is the page on top of
 *  the folder, made once the rest of it exists. */
const VIEWS: { id: View; icon: LucideIcon }[] = [
  { id: "quote", icon: ReceiptText },
  { id: "map", icon: MapIcon },
  { id: "packing", icon: ClipboardList },
  { id: "loadin", icon: Truck },
];
/** Which kind of sheet each view produces, for the export log (F-6.4). The load-in sheet records
 *  nothing: it is a cover over the other three, and no checkpoint reads it. */
const EXPORT_OF: Partial<Record<View, ExportType>> = {
  packing: "packing_list",
  map: "placement_map",
  quote: "quote",
};

type Paper = "A4" | "A3";
/** "auto" lets each drawing sheet take the orientation that prints ITS zone larger — a deep room
 *  portrait, a long one landscape, in one booklet (CSS named pages). Text pages stay portrait. */
type Orient = "auto" | "portrait" | "landscape";

/** Trim sizes in millimetres. The preview is drawn at these exact dimensions — mm is a real CSS
 *  unit on screen — so what a designer reads here breaks its lines where the PDF will break them.
 *  A preview at "roughly a page's width" is the one thing worse than no preview. */
const TRIM: Record<Paper, [number, number]> = { A4: [210, 297], A3: [297, 420] };
/** Matches `@page { margin: 16mm }` in globals.css, so the white border around the sheet on screen
 *  is the same white border the printer leaves. Keep the two in step. */
const MARGIN_MM = 16;

/** `frame`: which screen this is a page of. The same component closes the meeting (app/meeting) and
 *  is /outputs on its own; the one thing that differs is where "nothing to print yet" sends the
 *  designer — back into the stepper, or out to the studio (./back-to-studio.tsx).
 *  `initialProducts`: the catalog, read on the server by /outputs (the meeting has none to hand).
 *  `initialView`: the document to open on (`?view=`, from the runway's alert buttons); the quote
 *  otherwise — this is the stage that closes a meeting. */
export function OutputsScreen({
  frame = "studio",
  initialProducts,
  initialView,
}: {
  frame?: "studio" | "meeting";
  initialProducts?: Product[];
  initialView?: View;
}) {
  const meeting = frame === "meeting";
  const [view, setView] = useState<View>(initialView ?? "quote");
  const [paper, setPaper] = useState<Paper>("A4");
  const [orient, setOrient] = useState<Orient>("auto");
  // The booklet in colour (the venue's lawn, pool, trees) or in black and white for a crew that gets
  // photocopies. B&W is its own drawing, not the colour one greyed: every element filled with its
  // kind's flat grey whatever its real colour, so sizes read at a glance (MONO in placement-map.tsx).
  // The CSS grayscale stays on as a net under it — the text pages' photos, anything still in colour.
  const [mono, setMono] = useState(false);
  const [version, setVersion] = useState(1);
  // The studio's railing rule, for the stage sheet (settings → במות). Off until read, and off if
  // the read fails — the sheet then simply marks no railing, which is what an unset rule means.
  const [railingAboveMm, setRailingAboveMm] = useState<number | null>(null);
  // The studio's name, for the title block and the cover — it used to print an empty "סטודיו" cell.
  const [studioName, setStudioName] = useState("");
  const [studioPhone, setStudioPhone] = useState("");
  // The studio's document direction (settings → מסמכים): the crew sheets take its type and
  // structure, in ink. Null until read — `docTheme` then answers the default, stationery.
  const [docStyle, setDocStyle] = useState<DocStyleSetting | null>(null);
  const crewTheme = useMemo(() => docTheme(docStyle, { ink: true }), [docStyle]);
  useEffect(() => {
    let live = true;
    fetchStageRules()
      .then((r) => live && setRailingAboveMm(r.railingAboveMm))
      .catch(() => {});
    fetchSettings()
      .then((r) => {
        if (!live) return;
        setStudioName(r.businessName);
        setStudioPhone(r.phone);
        setDocStyle(r.docStyle);
      })
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
  // ...and only the ones that would draw something: a ceiling plan with nothing on the ceiling is
  // offered as empty in the rail and never printed.
  const categoryOf = (variantId: string) => {
    const cat = resolve(variantId)?.product.category;
    return cat ? { category: cat, group: CATEGORY_BY_ID[cat]?.group } : undefined;
  };
  // EventSurface resolved all of this in one call for the whole surface.
  const { workspace, ready, failed: workspaceFailed, retry: retryWorkspace } = useEventWorkspace();

  // THE CATALOG, which every sheet here resolves its items against, synchronously, while rendering
  // (lib/catalog/storage.ts). Nothing on this screen used to load it, so the quote and the packing
  // list said "עדיין אין פריטים בעיצוב" over a full drawing until the designer opened a sketch —
  // the studio primes the cache, and these sheets were only ever borrowing it. /outputs reads it on
  // the server, as the studio does; inside the meeting the sketch stages have usually primed it
  // already (captured once, in the browser only — the server's module cache is not this studio's),
  // and it is fetched when they have not.
  const [warm] = useState(() => (typeof window !== "undefined" && loadProducts().length > 0 ? loadProducts() : undefined));
  const catalog = useCatalog(initialProducts ?? warm);
  // Neither half of "what is there to print" has arrived — the drawing (the workspace) or what its
  // items are (the catalog). Until both have, the sheets show a sheet-shaped placeholder: an empty
  // document read before its data lands is exactly the "no items" this screen used to show.
  const loading = !ready || !catalog.ready;

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

  // One sheet per zone the event occupies and has something in (lib/outputs/zone-sheets.ts) — each
  // framed on its own room instead of all of them on one page at whatever scale the union fits.
  const zonePlans = useMemo(() => zoneSheets(doc, plan), [doc, plan]);
  const hasContent = (sheet: (typeof PLAN_SHEETS)[number]) => sheetHasContent(sheet, doc, categoryOf);
  const selectedSheets = PLAN_SHEETS.filter((s) => sheetIds.includes(s.id) && hasContent(s));
  // Zones the designer has switched OFF, rather than on: a zone that gains its first table since is
  // printed by default, not silently left out of the set.
  const [hiddenZones, setHiddenZones] = useState<string[]>([]);
  const shownZones = zonePlans.filter((z) => !z.zone || !hiddenZones.includes(z.zone.zone.id));
  const toggleZone = (id: string) =>
    setHiddenZones((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : shownZones.length > 1 ? [...ids, id] : ids,
    );

  // THE SET. The map view is no longer "the plan, once per ticked sheet" — it is the production
  // booklet the crew gets: a cover with the index, every ticked layer for every zone, the stage
  // build, a detail sheet for each chosen design kit, and the one schedule of which table carries
  // what. One print, one PDF, in an order a crew lead can check off.
  //
  // Kits are figured over the WHOLE event (lib/outputs/table-kits.ts), never per zone, so kit ב on
  // the garden's plan is the same ב as on the hall's.
  // The vase each arrangement stands in is part of its kit (lib/catalog/vessel.ts).
  const kits = useMemo(() => tableKits(doc, (p) => vesselOf(p, (id) => resolve(id)?.product)), [doc]);
  const letters = useMemo(() => kitLetters(kits), [kits]);
  // Which kits get a detail sheet. Overrides over the suggestion rather than a list of ids, so a
  // kit the designer never touched follows `recommended` as the drawing changes.
  const [detailPick, setDetailPick] = useState<Record<string, boolean>>({});
  const detailOn = (k: (typeof kits)[number]) => detailPick[k.key] ?? k.recommended;
  const [withCover, setWithCover] = useState(true);
  const [withKits, setWithKits] = useState(true);
  const stages = doc.placements.filter((p): p is StagePlacement => !!p.stage);
  const kitted = new Set(kits.flatMap((k) => k.units.map((u) => u.id)));
  const undressed = numberedUnits(doc).filter((u) => !kitted.has(u.id));

  // Each drawing sheet's own paper: in "auto", whichever orientation fits its drawing at the larger
  // scale (a tie goes landscape — the title block reads better on a wide sheet).
  const flip = ([a, b]: [number, number]): [number, number] => [b, a];
  const sizeOf = (o: "portrait" | "landscape"): [number, number] => (o === "portrait" ? TRIM[paper] : flip(TRIM[paper]));
  const textOrient: "portrait" | "landscape" = orient === "auto" ? "portrait" : orient;
  const orientFor = (world: { widthMm: number; heightMm: number }, notes = false): "portrait" | "landscape" => {
    if (orient !== "auto") return orient;
    const at = (o: "portrait" | "landscape") => {
      const [pw, ph] = sizeOf(o);
      return sheetScale(world, { widthMm: pw, heightMm: ph }, MARGIN_MM, notes);
    };
    return at("portrait") < at("landscape") ? "portrait" : "landscape";
  };
  type SetPage =
    | { kind: "cover" }
    | { kind: "map"; sheet: (typeof selectedSheets)[number]; z: (typeof shownZones)[number]; n: number; o: "portrait" | "landscape" }
    | { kind: "stages" }
    | { kind: "detail"; kit: (typeof kits)[number]; n: number; o: "portrait" | "landscape" }
    | { kind: "kits" };
  const setPages: SetPage[] = [];
  let framed = 0;
  // Grouped by LAYER, then zone: the sets are handed out by trade (the rigger takes every ceiling
  // plan), so all of one trade's pages come off the printer together.
  for (const sheet of selectedSheets) {
    for (const z of shownZones) setPages.push({ kind: "map", sheet, z, n: ++framed, o: orientFor(mapWorld(z.bounds)) });
    if (sheet.id === "stage" && stages.length > 0) setPages.push({ kind: "stages" });
  }
  for (const kit of kits) if (detailOn(kit)) setPages.push({ kind: "detail", kit, n: ++framed, o: orientFor(detailWorld(kit, doc), true) });
  if (withKits && (kits.length > 0 || undressed.length > 0)) setPages.push({ kind: "kits" });
  if (withCover) setPages.unshift({ kind: "cover" });
  const sheetTotal = framed;
  const entries: SetEntry[] = setPages.flatMap((pg): SetEntry[] =>
    pg.kind === "map"
      ? [{ sheet: pg.n, label: pg.sheet.label, zone: pg.z.zone?.zone.name }]
      : pg.kind === "detail"
        ? [{ sheet: pg.n, label: `פרט שולחן — ערכה ${pg.kit.letter}` }]
        : pg.kind === "stages"
          ? [{ sheet: null, label: "פירוט במות" }]
          : pg.kind === "kits"
            ? [{ sheet: null, label: "ערכות עיצוב לשולחנות" }]
            : [],
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
  // Records the export and paints its number on the sheets before they leave — print or share.
  const stamp = async () => {
    const type = EXPORT_OF[view];
    if (!event || !type) return;
    let printed = version;
    try {
      printed = await recordExport(event.id, type);
    } catch {
      // Recording failed. The sheet still prints: a crew waiting on paper is not helped by a failed
      // log write. It simply doesn't enter the history, which is the honest outcome.
    }
    setVersion(printed);
    // Let React paint the number before the print dialog freezes the page — the sheet has to carry
    // the number that was actually recorded, not the one it was showing a moment ago.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return () => setVersion(printed + 1);
  };
  const print = async () => {
    const done = await stamp();
    window.print();
    done?.();
  };

  // THE BOOKLET AS A FILE, for WhatsApp — the quote's own path (./quote-pdf.ts): every sheet
  // photographed at its true size and bound in the browser. A share the browser refuses for a stale
  // tap keeps the file, and the next tap shares it — as long as the set has not changed since.
  const sheetsRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const pending = useRef<{ key: string; file: File } | null>(null);
  const setKey = JSON.stringify([entries, paper, orient, mono]);
  const shareTitle = ["חוברת הפקה", event?.clientName?.trim()].filter(Boolean).join(" — ");
  const share = async () => {
    if (sharing) return;
    setShareNote(null);
    setSharing(true);
    try {
      let file = pending.current?.key === setKey ? pending.current.file : null;
      let done: (() => void) | undefined;
      if (!file) {
        done = await stamp();
        const pages = [...(sheetsRef.current?.querySelectorAll<HTMLElement>("article.sheet") ?? [])];
        file = await buildQuotePdf(pages, quoteFileName(event?.clientName, event?.date, "חוברת הפקה"), {
          title: shareTitle,
          author: studioName || undefined,
          trueSize: true,
        });
      }
      const outcome = await shareFile(file, shareTitle);
      if (outcome === "blocked") {
        pending.current = { key: setKey, file };
        setShareNote("ה-PDF מוכן — לחצו שוב על שיתוף");
      } else {
        pending.current = null;
        if (outcome === "downloaded") setShareNote("הדפדפן לא תומך בשיתוף קבצים — ה-PDF הורד");
      }
      done?.();
    } catch (e) {
      console.error("booklet PDF failed", e);
      setShareNote("הפקת ה-PDF נכשלה — נסו שוב");
    } finally {
      setSharing(false);
    }
  };

  const today = new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
  const [w, h] = sizeOf(textOrient);
  // The quote prints its own letterhead (./quote-sheet.tsx) and a plan sheet carries a proper
  // drafting title block (sheet-frame.tsx) — the packing list and the load-in sheet have neither,
  // so they are the two views that need this generic stamp above them.
  const stamped = view === "packing" || view === "loadin";

  // ── What the rail says under each document, read whichever is open ────────────────────────────
  const [quoteMeta, setQuoteMeta] = useState<{ meta: string; warn: boolean } | null>(null);
  // Until the quote has been opened once, its line is read from the issued record alone.
  const eventId = event?.id;
  const docVersion = workspace?.document?.version ?? null;
  useEffect(() => {
    if (!eventId) return;
    let live = true;
    fetchIssuedQuote(eventId)
      .then((q) => {
        if (!live) return;
        const on = q ? new Date(q.issuedAt).toLocaleDateString("he-IL") : "";
        const s = statusOf(!!q, !!q && docVersion !== null && q.documentVersion !== docVersion, false, on);
        setQuoteMeta((prev) => prev ?? { meta: s.rail, warn: s.warn });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [eventId, docVersion]);
  const packGroups = useMemo(
    () => (loading ? [] : packingList(doc, itemLookup, measureContext(plan.structure, doc), (t) => chairOf(t, defaultChair()))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, doc, plan.structure, catalog.products],
  );
  const [spares, setSpares] = useState<Spares>({});
  const packItems = packGroups.reduce((s, g) => s + g.rows.reduce((n, r) => (r.unit === "unit" ? n + r.quantity + (spares[r.variantId] ?? 0) : n), 0), 0);
  const [loadFacts, setLoadFacts] = useState<LoadInFacts | null>(null);

  const railDocs: RailDoc<View>[] = VIEWS.filter(({ id }) => !meeting || id !== "loadin").map(({ id, icon }) => ({
    id,
    icon,
    title: TITLES[id],
    audience: id === "quote" ? "client" : "crew",
    meta:
      loading ? "…"
      : id === "quote" ? (quoteMeta?.meta ?? "טיוטה")
      : id === "map" ? `חוברת · ${setPages.length} ${setPages.length === 1 ? "עמוד" : "עמודים"}`
      : id === "packing" ? `${packItems} פריטים · ${packGroups.length} קטגוריות`
      : "עמוד אחד לראש הצוות",
    warn: !loading && id === "quote" && !!quoteMeta?.warn,
  }));

  // ── THE CLIENT VIEW: both drawers put away, the pages alone (and the quote without its tools).
  // The meeting opens on it — the client sits beside the designer there. ──
  const [client, setClient] = useState(meeting);
  const leaveClient = useMemo(() => ({ onOpen: () => setClient(false) }), []);

  // ── The page setup, one group for every crew document ──
  const orientLabel = { auto: "אוטו׳", portrait: "לאורך", landscape: "לרוחב" } as const;
  const paperGroup = G(
    "paper",
    FileIcon,
    "דף",
    <span dir="rtl">{view === "map" ? `${paper} · ${orientLabel[orient]} · ${mono ? "שחור-לבן" : "צבעוני"}` : `${paper} · ${orientLabel[textOrient]}`}</span>,
    <div className="flex flex-col gap-3">
      <Segmented<Paper> label="גודל" value={paper} options={[["A4", "A4"], ["A3", "A3"]]} onChange={setPaper} />
      <Segmented<Orient>
        label="כיוון"
        value={view === "map" ? orient : textOrient}
        // "Auto" only means something where a booklet mixes sheets; elsewhere it is portrait.
        options={view === "map" ? [["auto", "אוטו׳"], ["portrait", "לאורך"], ["landscape", "לרוחב"]] : [["portrait", "לאורך"], ["landscape", "לרוחב"]]}
        onChange={setOrient}
      />
      {view === "map" && <Segmented<"color" | "mono"> label="צבע" value={mono ? "mono" : "color"} options={[["color", "צבעוני"], ["mono", "שחור-לבן"]]} onChange={(v) => setMono(v === "mono")} />}
    </div>,
  );
  const printAction = (label: string) => ({ label, icon: Printer, onClick: () => void print(), disabled: loading });

  // ── The crew documents' parts (the quote builds its own, ./quote.tsx) ──────────────────────────
  const crewParts = (): DocParts => {
    if (view === "map") {
      const sheets = selectedSheets.length * shownZones.length;
      return {
        pages: (
          <>
            {plan.access === "denied" && <VenueAccessNotice tone="plan" className="no-print" />}
            {mapPages()}
          </>
        ),
        groups: [
          G(
            "layers",
            Layers,
            "שכבות",
            <span className="nums">{`${selectedSheets.length} ${selectedSheets.length === 1 ? "שכבה" : "שכבות"} · ${sheets} ${sheets === 1 ? "גיליון" : "גיליונות"}`}</span>,
            <div className="-mx-1.5 flex flex-col gap-px">
              {PLAN_SHEETS.map((sheet) => {
                const empty = !hasContent(sheet);
                const on = !empty && sheetIds.includes(sheet.id);
                return (
                  <CheckRow key={sheet.id} on={on} disabled={empty} chip={empty ? "ריק" : undefined} meta={on ? `${shownZones.length} גיל׳` : undefined} onClick={() => toggleSheet(sheet.id)}>
                    {sheet.label}
                  </CheckRow>
                );
              })}
            </div>,
          ),
          // Only when the event spans more than one zone with something in it. Each zone is its own
          // page of every ticked layer.
          ...(zonePlans.length > 1
            ? [
                G(
                  "zones",
                  MapPin,
                  "אזורים",
                  <span className="nums">{`${shownZones.length} מתוך ${zonePlans.length}`}</span>,
                  <div className="-mx-1.5 flex flex-col gap-px">
                    {zonePlans.map(({ zone }) => {
                      if (!zone) return null;
                      const on = !hiddenZones.includes(zone.zone.id);
                      return (
                        <CheckRow key={zone.zone.id} on={on} meta={on ? `${selectedSheets.length} גיל׳` : undefined} onClick={() => toggleZone(zone.zone.id)}>
                          {zone.zone.name || "אזור ללא שם"}
                        </CheckRow>
                      );
                    })}
                  </div>,
                ),
              ]
            : []),
          // One detail per KIT, not per table — the suggested ones (a head table, a block, anything
          // with a real arrangement on it) start lit.
          ...(kits.length > 0
            ? [
                G(
                  "kits",
                  Flower2,
                  "פרטי שולחן",
                  <span className="nums">{`${kits.filter(detailOn).length} מתוך ${kits.length}`}</span>,
                  <div className="-mx-1.5 flex flex-col gap-px">
                    {kits.map((k) => (
                      <CheckRow key={k.key} on={detailOn(k)} chip={k.recommended ? "מומלץ" : undefined} onClick={() => setDetailPick((m) => ({ ...m, [k.key]: !detailOn(k) }))}>
                        <span className="font-bold">ערכה {k.letter}</span>
                        <span className="nums font-normal"> · {k.units.length === 1 ? tablesPhrase(k.units) : `${k.units.length} שולחנות`}</span>
                      </CheckRow>
                    ))}
                  </div>,
                ),
              ]
            : []),
          G(
            "book",
            BookOpen,
            "בחוברת",
            [withCover && "שער", withKits && "טבלת ערכות"].filter(Boolean).join(" · ") || "שרטוטים בלבד",
            <div className="flex flex-col gap-2.5">
              <SwitchRow checked={withCover} onChange={setWithCover} label="שער ותוכן עניינים" />
              <SwitchRow checked={withKits} onChange={setWithKits} label="טבלת ערכות" />
            </div>,
          ),
          paperGroup,
        ],
        foot: {
          info: sharing ? "מכין PDF…" : (shareNote ?? `${setPages.length} ${setPages.length === 1 ? "עמוד" : "עמודים"} · ${sheetTotal} ${sheetTotal === 1 ? "גיליון" : "גיליונות"}`),
          side: `גרסה ${version}`,
          action: printAction("הפקת חוברת PDF"),
          // eslint-disable-next-line react-hooks/refs -- a handler for the press, never read while rendering
          extras: [{ label: "שיתוף החוברת", icon: Share2, onClick: () => void share(), disabled: loading || sharing || setPages.length === 0 }],
        },
        defaultOpen: ["layers"],
      };
    }

    const sheet = (
      <article className="sheet flex flex-col bg-canvas shadow-lifted" style={{ width: `${w}mm`, minHeight: `${h}mm`, padding: `${MARGIN_MM}mm` }}>
        {/* F-6.4: date + version stamp — on screen and in print, in the studio's document direction.
            The load-in sheet is not an export of its own, so it carries no version. */}
        {stamped && (
          <CrewHeader
            t={crewTheme}
            title={TITLES[view]}
            kicker={studioName || undefined}
            meta={[
              ...(event ? [{ label: "אירוע", value: event.clientName || "—" }, { label: "מקום", value: zonesLabelOf(event) || "—" }] : []),
              { label: "תאריך", value: today },
              ...(view === "loadin" ? [] : [{ label: "גרסה", value: String(version) }]),
            ]}
          />
        )}
        <div className="flex-1">
          {view === "loadin" ? (
            <LoadInSheet theme={crewTheme} event={event} doc={doc} entries={entries} meeting={meeting} onFacts={setLoadFacts} />
          ) : (
            <PackingList theme={crewTheme} doc={doc} eventId={event?.id ?? null} meeting={meeting} onSpares={setSpares} />
          )}
        </div>
        {stamped && (
          <CrewFooter
            t={crewTheme}
            printed={today}
            studio={[studioName, crewTheme.style.footer === "contact" ? studioPhone : ""].filter(Boolean).join(" · ") || undefined}
            className="mt-8"
          />
        )}
      </article>
    );

    if (view === "packing") {
      // The reserves are typed on the sheet itself, beside each row; the panel reads them back so
      // they are checked before printing.
      const label = new Map(packGroups.flatMap((g) => g.rows.map((r) => [r.variantId, r.label] as const)));
      const rows = Object.entries(spares)
        .filter(([id, n]) => n > 0 && label.has(id))
        .map(([id, n]) => ({ id, label: label.get(id)!, n }))
        .sort((a, b) => b.n - a.n);
      const sum = rows.reduce((s, r) => s + r.n, 0);
      return {
        pages: sheet,
        groups: [
          G(
            "spares",
            PackagePlus,
            "רזרבה",
            rows.length ? <span className="nums">{`${sum} פריטים ב־${rows.length} ${rows.length === 1 ? "שורה" : "שורות"}`}</span> : "אין רזרבה",
            <div className="flex flex-col gap-0.5">
              {rows.map((r) => (
                <div key={r.id} className="flex min-h-[30px] items-center justify-between gap-2 text-[13px] text-ink">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="nums shrink-0 font-semibold text-ink-soft" dir="ltr">
                    +{r.n}
                  </span>
                </div>
              ))}
              <p className="mt-1.5 text-xs leading-relaxed text-muted">רזרבה מזינים בעמודת ״רזרבה״ שבגיליון — היא נשמרת עם האירוע ונכללת בסה״כ.</p>
            </div>,
          ),
          paperGroup,
        ],
        foot: { info: `${packItems} פריטים · כולל רזרבה`, side: `גרסה ${version}`, action: printAction("הדפסה / PDF") },
        defaultOpen: ["spares"],
      };
    }

    // The load-in sheet: assembled from elsewhere — the panel says from where, and what is left to
    // write by hand.
    const edit = (href: string, text: string) => (meeting ? undefined : <Link href={href} className="hover:text-accent-hover">{text}</Link>);
    const crew = loadFacts?.crew.length ?? 0;
    const suppliers = loadFacts?.deliveries.length ?? 0;
    const sources: { icon: LucideIcon; label: string; value: string; link?: React.ReactNode }[] = [
      { icon: CalendarDays, label: "פרטי האירוע", value: "תאריך, מקום, אנשי קשר", link: event ? edit(`/dashboard?event=${event.id}`, "עריכה") : undefined },
      { icon: Users, label: "צוות הקמה", value: !loadFacts ? "…" : crew ? `${crew} ${crew === 1 ? "איש" : "אנשים"}` : "לא שובץ צוות", link: event ? edit(`/dashboard?event=${event.id}`, "עריכה") : undefined },
      { icon: Package, label: "אספקות מספקים", value: !loadFacts ? "…" : suppliers ? `${suppliers} ${suppliers === 1 ? "ספק" : "ספקים"}` : "אין אספקות ביום הזה", link: edit("/suppliers", "להזמנות") },
      {
        icon: MapIcon,
        label: "חוברת המפות",
        value: `${setPages.length} ${setPages.length === 1 ? "עמוד" : "עמודים"}`,
        link: (
          <button type="button" onClick={() => setView("map")} className="hover:text-accent-hover">
            פתיחה
          </button>
        ),
      },
    ];
    return {
      pages: sheet,
      groups: [
        G(
          "manual",
          PencilLine,
          "ימולא ביד",
          "2 שדות",
          <div className="flex flex-col gap-1.5">
            {["שעת הגעה לאולם", "איש קשר באולם"].map((f) => (
              <div key={f} className="flex items-center gap-2 text-[13px] text-ink">
                <PencilLine className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
                {f}
              </div>
            ))}
            <p className="mt-1 text-xs leading-relaxed text-muted">האפליקציה לא שומרת אותם עדיין — הדף משאיר להם שורה ריקה לכתיבה ביד.</p>
          </div>,
          true,
        ),
        G(
          "sources",
          Link2,
          "מאיפה הדף נבנה",
          `${sources.length} מקורות`,
          <div className="-mx-1.5 flex flex-col gap-px">
            {sources.map((s) => (
              <div key={s.label} className="flex min-h-[38px] items-center gap-2 rounded-sm px-1.5">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-sm bg-inset text-muted">
                  <s.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[13px] font-semibold text-ink">{s.label}</span>
                  <span className="nums block text-xs text-muted">{s.value}</span>
                </span>
                {s.link && <span className="shrink-0 text-xs font-semibold text-accent">{s.link}</span>}
              </div>
            ))}
          </div>,
        ),
        paperGroup,
      ],
      foot: { info: "עמוד אחד · לא נרשם ביומן הייצוא", side: today, action: printAction("הדפסה / PDF") },
      defaultOpen: ["manual", "sources"],
    };
  };

  // One <article className="sheet"> per page of the set — each is its own printed page (globals.css:
  // .sheet breaks after itself), each drawing carrying its OWN drafting title block (sheet-frame.tsx).
  const mapPages = () =>
    setPages.map((pg) => {
      const paperOf = (o: "portrait" | "landscape") => {
        const [pw, ph] = sizeOf(o);
        return { widthMm: pw, heightMm: ph };
      };
      const frame = {
        subtitle: event?.clientName,
        studio: studioName || undefined,
        sheetCount: sheetTotal,
        version,
        date: today,
        marginMm: MARGIN_MM,
        theme: crewTheme,
      };
      const pageOf = (o: "portrait" | "landscape") => ({ page: o === "portrait" ? "sheet-portrait" : "sheet-landscape" });
      // A text page of the set (cover, schedules): the page's own margin, because the map view
      // prints at `@page { margin: 0 }` — the drawing sheets own theirs inside the SVG. `sheet-text`
      // keeps that padding ON PAPER: print CSS strips every sheet's padding and gives it back to
      // this class alone (globals.css).
      const textPage = (key: string, body: React.ReactNode, fixed = false) => (
        <article
          key={key}
          className={`sheet sheet-text bg-canvas shadow-lifted${mono ? " grayscale" : ""}`}
          style={{ ...pageOf(textOrient), width: `${w}mm`, [fixed ? "height" : "minHeight"]: `${h}mm`, padding: `${MARGIN_MM}mm` }}
        >
          {body}
        </article>
      );
      if (pg.kind === "cover")
        return textPage(
          "cover",
          <SetCover
            theme={crewTheme}
            studio={studioName || undefined}
            client={event?.clientName ?? ""}
            eventDate={event?.date ? new Date(event.date).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }) : undefined}
            zones={event ? zonesLabelOf(event) : ""}
            guests={event?.guests}
            summary={seatingSummary(doc)}
            kits={kits.length}
            version={version}
            printed={today}
            entries={entries}
          />,
          true,
        );
      if (pg.kind === "stages")
        return textPage(
          "stages",
          <StageSchedule stages={stages} railingAboveMm={railingAboveMm} wallDistance={(pt) => nearestWall(plan.structure, pt)?.distanceMm ?? Infinity} doc={doc} />,
        );
      if (pg.kind === "kits")
        return textPage(
          "kits",
          <KitSchedule kits={kits} undressed={undressed} lookup={itemLookup} details={new Set(kits.filter(detailOn).map((k) => k.key))} meeting={meeting} />,
        );
      if (pg.kind === "detail")
        return (
          <article key={`detail-${pg.kit.key}`} className={`sheet bg-canvas shadow-lifted${mono ? " grayscale" : ""}`} style={pageOf(pg.o)}>
            <TableDetail kit={pg.kit} doc={doc} lookup={itemLookup} mono={mono} title={event ? zonesLabelOf(event) : ""} sheetNumber={pg.n} paper={paperOf(pg.o)} {...frame} />
          </article>
        );
      const { sheet, z } = pg;
      return (
        <article key={`${sheet.id}-${z.zone?.zone.id ?? "all"}`} className={`sheet bg-canvas shadow-lifted${mono ? " grayscale" : ""}`} style={pageOf(pg.o)}>
          <PlacementMap
            doc={z.doc}
            plan={{ ...plan, zones: z.zone ? [z.zone] : plan.zones, bounds: z.bounds }}
            sheet={sheet}
            title={z.zone?.zone.name || (event ? zonesLabelOf(event) : "")}
            sheetNumber={pg.n}
            railingAboveMm={railingAboveMm}
            letters={sheet.tables === "full" ? letters : undefined}
            summary={sheet.tables === "full" ? seatingSummary(z.doc) || undefined : undefined}
            mono={mono}
            // Colour = every element filled by its kind, named in the sheet's legend (KEY in
            // placement-map.tsx); B&W = the same by grey.
            keyed={!mono}
            paper={paperOf(pg.o)}
            {...frame}
          />
        </article>
      );
    });

  const HEADS: Record<View, { title: string; sub: string }> = {
    quote: { title: "הצעת מחיר", sub: "ללקוח · נבנית מהעיצוב" },
    map: { title: "מפת הצבה", sub: "חוברת הפקה לצוות" },
    packing: { title: "רשימת ציוד", sub: "לצוות · כמויות בלבד, בלי מחירים" },
    loadin: { title: "דף הקמה", sub: "לצוות · מסכם את כל השאר" },
  };

  // THE SHELL (the "Outputs and 3D Drawers" board, turn 2): WHICH document on the start rail, the
  // pages on the light table between, HOW it prints in the end panel — its groups, and the one
  // outward action pinned at the panel's foot. The same EndPanel and FoldRow groups as the studio,
  // so the three event screens share one drawer. Neither drawer prints; what is left is the pages.
  const shell = (parts: DocParts | null) => {
    const head = HEADS[view];
    const failed = !loading && catalog.error;
    return (
      <div className="flex h-full min-h-0 print:block print:h-auto">
        {/* F-6.1: page setup applies when printing. A PLAN SHEET OWNS ITS OWN MARGIN (sheet-frame.tsx
            draws the border and title block inside a full-trim page), so the map and the quote print
            at `margin: 0`; named pages carry each drawing sheet's own orientation into the PDF. */}
        <style>{`@media print { @page { size: ${view === "quote" ? "A4 portrait" : `${paper} ${textOrient}`}; ${view === "map" || view === "quote" ? "margin: 0;" : ""} } @page sheet-portrait { size: ${paper} portrait; margin: 0; } @page sheet-landscape { size: ${paper} landscape; margin: 0; } }`}</style>

        <DocRail docs={railDocs} active={view} onSelect={setView} forcedClosed={client ? leaveClient : undefined} />

        <SheetStage pageSelector={view === "quote" ? "[data-quote-page]" : "article.sheet"} client={client} onClient={setClient} contentRef={sheetsRef} resetKey={view}>
          {workspaceFailed ? (
            // The event could not be read (SK-2): still loading as far as every sheet is concerned —
            // nothing is printed off a drawing that never arrived — and said, with a retry.
            <div className="no-print bg-canvas shadow-lifted" style={{ width: `${TRIM.A4[0]}mm` }}>
              <WorkspaceFailed onRetry={retryWorkspace} body="לא ניתן לטעון את האירוע, ולכן אי אפשר להציג את הפלטים." />
            </div>
          ) : loading ? (
            <SheetLoading widthMm={view === "quote" ? TRIM.A4[0] : w} heightMm={view === "quote" ? TRIM.A4[1] : h} />
          ) : failed ? (
            // A catalog that failed to load would print every sheet empty — say so instead.
            <div role="alert" className="no-print flex flex-col items-center gap-3 bg-canvas px-10 py-20 text-center shadow-lifted" style={{ width: `${TRIM.A4[0]}mm` }}>
              <p className="text-sm text-ink-soft">לא ניתן לטעון את הקטלוג, ולכן אי אפשר להציג את פריטי העיצוב.</p>
              <Button variant="outline" size="sm" onClick={() => void catalog.reload()}>
                <RotateCw className="h-4 w-4" strokeWidth={2} />
                נסו שוב
              </Button>
            </div>
          ) : (
            parts?.pages
          )}
        </SheetStage>

        <EndPanel
          screen="outputs"
          collapsible
          forcedClosed={client ? leaveClient : undefined}
          foot={parts ? <PanelFoot {...parts.foot} /> : <PanelFoot info={loading ? "טוען…" : "אין מה להפיק"} action={{ label: view === "quote" ? "שיתוף PDF" : "הדפסה / PDF", icon: view === "quote" ? Share2 : Printer, disabled: true }} />}
          collapsedFoot={parts?.foot.action ? <CollapsedAction action={parts.foot.action} /> : undefined}
        >
          {parts ? (
            <>
              <PanelGroups kind={`outputs:${view}`} title={head.title} sub={head.sub} groups={parts.groups} lead={parts.lead} defaultOpen={parts.defaultOpen} first />
              {parts.after}
            </>
          ) : (
            <>
              <PanelGroupsHeader title={head.title} sub={head.sub} />
              {loading && !workspaceFailed && <PanelSkeleton />}
            </>
          )}
        </EndPanel>
      </div>
    );
  };

  if (loading || catalog.error) return shell(null);
  if (view === "quote")
    return (
      // The quote is its own A4 pages (./quote-document.tsx) — the same boxes the PDF is built from —
      // and it owns its state, so it hands the shell its parts.
      <Quote
        doc={doc}
        meeting={meeting}
        event={event}
        plan={plan}
        zonePlans={zonePlans}
        documentVersion={workspace?.document?.version ?? null}
        client={client}
        onStatus={setQuoteMeta}
      >
        {shell}
      </Quote>
    );
  return shell(crewParts());
}

/** The sheet before its data lands: the page at its own trim size with a few bars on it, pulsing —
 *  "it is arriving" and nothing that reads as content (components/skeleton.tsx's rule). */
function SheetLoading({ widthMm, heightMm }: { widthMm: number; heightMm: number }) {
  return (
    <div
      role="status"
      aria-label="טוען את האירוע"
      className="no-print flex flex-col gap-3 bg-canvas shadow-lifted"
      style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, padding: `${MARGIN_MM}mm` }}
    >
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-3.5 w-1/2" />
      <Skeleton className="mt-6 h-48 w-full rounded-md" />
      <Skeleton className="mt-2 h-3.5 w-full" />
      <Skeleton className="h-3.5 w-5/6" />
      <Skeleton className="h-3.5 w-2/3" />
    </div>
  );
}
