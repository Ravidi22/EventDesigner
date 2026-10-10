"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Download, Eye, PencilLine, Printer, Share2, TriangleAlert } from "lucide-react";
import { BackToStudio } from "./back-to-studio";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { EventPlan } from "@/lib/events/plan";
import type { EventSummary } from "@/lib/events/types";
import { numberedUnits } from "@/lib/design-document/groups";
import { quoteSections } from "@/lib/outputs/quote-sections";
import type { ZoneSheet } from "@/lib/outputs/zone-sheets";
import type { PlanSheet } from "@/lib/outputs/sheets";
import { measureContext, priceLookup } from "@/lib/outputs/lookup";
import { recordExport } from "@/lib/outputs/actions";
import {
  DEFAULT_CLOSING,
  DEFAULT_LAYOUT,
  PRICE_MODES,
  extrasSection,
  layoutSignature,
  quoteFigures,
  quoteTitle,
  resolveSections,
  type PriceMode,
  type QuoteLayout,
  type ResolvedSection,
} from "@/lib/quotes/layout";
import { fetchIssuedQuote, fetchQuoteDraft, issueQuote, saveQuoteDraft, type IssuedQuote } from "@/lib/quotes/actions";
import { fetchSettings } from "@/lib/settings/actions";
import type { BusinessSettings } from "@/lib/settings/types";
import { patchEvent } from "@/lib/events/actions";
import { fetchFolder, fetchImages } from "@/lib/gallery/actions";
import type { GalleryImage } from "@/lib/gallery/types";
import { fetchVenues } from "@/lib/venues/actions";
import { loadProducts } from "@/lib/catalog/storage";
import { chairOf, defaultChair } from "@/lib/catalog/chairs";
import { catalogShades, shadeKey } from "@/lib/catalog/shades";
import { isRunner } from "@/lib/catalog/categories";
import { resolve } from "@/lib/studio/catalog-resolver";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { TextField } from "@/components/text-field";
import { Segmented } from "@/components/segmented";
import { SwitchRow } from "@/components/toggle";
import { VenueAccessNotice } from "@/components/venue-access-notice";
import { CONTENT_W, QuoteDocument, SKETCH_MAX_H, type QuotePalette, type QuotePhoto, type QuoteSketch } from "./quote-document";
import { QuotePhotoPicker } from "./quote-photo-picker";
import { QuoteExtras } from "./quote-extras";
import { QuoteStudioDetails, missingDetails } from "./quote-studio-details";
import { PlacementMap, mapWorld } from "./placement-map";
import { buildQuotePdf, downloadFile, quoteFileName, shareFile } from "./quote-pdf";

// F-7.1–F-7.4: the quote — the CONTROLS and the state. The document a client receives is
// ./quote-document.tsx (A4 pages), its sections are derived from the drawing by
// lib/outputs/quote-sections.ts, and what the designer decides about it (price mode, the agreed
// price, extras, gifts, titles, notes, photographs, order, palette sentence, greeting, sketch) is a
// QuoteLayout (lib/quotes/layout.ts), autosaved as a draft and copied into the issued record when
// the quote goes out.
//
// TWO MODES, because the client is usually sitting beside the designer looking at this screen. The
// CLIENT VIEW (the default) is the pages and the share button — nothing the client should not read:
// no price-list sum, no discount arithmetic, no "unpriced item" warnings, no tools. "עריכת ההצעה"
// opens the designer's panel and the tools in the page margins.
//
// ONE ACTION SENDS IT: "שיתוף PDF" issues the quote when it has not been issued or has changed since
// (sealing the drawing it was made from), builds the PDF in the browser (./quote-pdf.ts) and opens
// the device's share sheet. A draft never leaves the studio, because nothing else sends anything.

/** How many photographs a section shows before the designer picks. */
const DEFAULT_PHOTOS = 2;
/** Furniture photos are offered but never picked by default — a bare table is not a design. */
const NOT_BY_DEFAULT = new Set(["tables", "chairs"]);
/** Categories whose colour is not the event's palette — furniture and construction. */
const NOT_PALETTE = new Set(["tables", "chairs", "stages", "stage-decks", "stage-stairs", "stage-skirts", "stage-benches", "stage-barriers", "stage-backdrops", "stage-ramps", "stage-surfaces"]);
const SAVE_DELAY_MS = 700;

/** The sketch: what stands on the floor, numbered, with chairs and each table's people count, in the
 *  studio's colours — and no measurements, which are the crew's (lib/outputs/sheets.ts has the set). */
const SKETCH_SHEET: PlanSheet = { id: "quote-sketch", label: "סקיצה", layers: ["floor"], tables: "full", chairs: true, numbers: true };

interface PickablePhoto extends QuotePhoto {
  productId: string;
  category?: string;
}

export function Quote({
  doc,
  meeting = false,
  event,
  plan,
  zonePlans,
  documentVersion,
}: {
  doc: DesignDocumentContent;
  meeting?: boolean;
  event: EventSummary | null;
  plan: EventPlan;
  /** The drawing split by zone (lib/outputs/zone-sheets.ts) — sections and sketch pages both. */
  zonePlans: ZoneSheet[];
  /** The version the drawing is on now — F-7.4 compares it with the issued quote's. */
  documentVersion: number | null;
}) {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [issued, setIssued] = useState<IssuedQuote | null>(null);
  const [layout, setLayout] = useState<QuoteLayout>(DEFAULT_LAYOUT);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [venueName, setVenueName] = useState<string>();
  const [editing, setEditing] = useState(false);
  // Seeded from the workspace, then moved by issuing (which seals this version) — render-time
  // derivation, React's pattern for state that follows a prop.
  const [currentVersion, setCurrentVersion] = useState(documentVersion);
  const [versionFrom, setVersionFrom] = useState(documentVersion);
  if (documentVersion !== versionFrom) {
    setVersionFrom(documentVersion);
    setCurrentVersion(documentVersion);
  }

  useEffect(() => {
    let live = true;
    void fetchSettings().then((s) => live && setSettings(s));
    // Photographs illustrate; they are never the substance. An unreachable gallery still quotes.
    void fetchImages()
      .then((loaded) => live && setImages(loaded))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const eventId = event?.id;
  useEffect(() => {
    if (!eventId) return;
    let live = true;
    void (async () => {
      const [q, draft, folder] = await Promise.all([fetchIssuedQuote(eventId), fetchQuoteDraft(eventId), fetchFolder(eventId).catch(() => [])]);
      if (!live) return;
      setIssued(q);
      setLiked(folder);
      setLayout(draft ?? q?.layout ?? DEFAULT_LAYOUT);
    })();
    return () => {
      live = false;
    };
  }, [eventId]);

  const venueId = event?.venueId;
  useEffect(() => {
    if (!venueId) return;
    let live = true;
    void fetchVenues()
      .then((vs) => live && setVenueName(vs.find((v) => v.id === venueId)?.name))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [venueId]);

  // ── The draft autosaves, debounced; a pending write is flushed on the way out ────────────────
  const pending = useRef<{ eventId: string; layout: QuoteLayout } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = () => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    return p ? saveQuoteDraft(p.eventId, p.layout).catch(() => {}) : Promise.resolve();
  };
  useEffect(
    () => () => {
      void flush();
    },
    [],
  );
  const update = (patch: Partial<QuoteLayout> | ((l: QuoteLayout) => Partial<QuoteLayout>)) => {
    setLayout((prev) => {
      const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      if (eventId) {
        pending.current = { eventId, layout: next };
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
      }
      return next;
    });
  };

  // ── What the drawing says ────────────────────────────────────────────────────────────────────
  const zones = useMemo(
    () => zonePlans.flatMap((z) => (z.zone ? [{ id: z.zone.zone.id, name: z.zone.zone.name, doc: z.doc }] : [])),
    [zonePlans],
  );
  const raw = useMemo(() => {
    const fallback = defaultChair();
    return quoteSections(doc, {
      lookup: priceLookup,
      ctx: measureContext(plan.structure),
      zones,
      chairOf: (t) => chairOf(t, fallback),
    });
  }, [doc, plan.structure, zones]);
  const extras = useMemo(() => extrasSection(layout), [layout]);
  const allRaw = useMemo(() => (extras ? [...raw, extras] : raw), [raw, extras]);
  const sections = useMemo(() => resolveSections(allRaw, layout), [allRaw, layout]);
  const allKeys = useMemo(() => new Set(allRaw.flatMap((s) => s.lines.map((l) => l.key))), [allRaw]);
  const hiddenCount = layout.hidden.filter((k) => allKeys.has(k)).length;
  const figures = quoteFigures(sections, layout, {
    vatRate: settings?.vatRate ?? 0.18,
    vatIncluded: settings?.pricesIncludeVat ?? true,
    hidden: hiddenCount,
  });
  const seating = useMemo(() => ({ tables: numberedUnits(doc).length, seats: doc.tables.reduce((n, t) => n + (t.seats ?? 0), 0) }), [doc]);

  // ── The sketch: one drawing per zone with something in it ─────────────────────────────────────
  const sketches: QuoteSketch[] = useMemo(() => {
    const shown = zonePlans.filter((z) => z.doc.tables.length > 0 || z.doc.placements.some((p) => p.layer === "floor"));
    return shown.map((z) => {
      const world = mapWorld(z.bounds);
      const heightMm = Math.min(SKETCH_MAX_H, Math.max(60, (CONTENT_W * world.heightMm) / Math.max(1, world.widthMm)));
      return {
        key: z.zone?.zone.id ?? "all",
        title: shown.length > 1 ? (z.zone?.zone.name ?? "") : "",
        heightMm,
        render: (widthMm: number, h: number) => (
          <PlacementMap
            doc={z.doc}
            plan={{ ...plan, zones: z.zone ? [z.zone] : plan.zones, bounds: z.bounds }}
            sheet={SKETCH_SHEET}
            paper={{ widthMm, heightMm: h }}
            marginMm={0}
            bare
            colour
            seatCounts
            title=""
          />
        ),
      };
    });
  }, [zonePlans, plan]);

  // ── Photographs ─────────────────────────────────────────────────────────────────────────────
  const products = loadProducts();
  const photoPool = useMemo(() => {
    const gallery: PickablePhoto[] = images
      .filter((i) => i.imageUrl || i.productImageUrl)
      .map((i) => ({ id: i.id, src: (i.imageUrl || i.productImageUrl)!, name: i.name || i.productName, productId: i.productId }));
    const catalog: PickablePhoto[] = products
      .filter((p) => p.imageUrl && !p.archived)
      .map((p) => ({ id: `product:${p.id}`, src: p.imageUrl!, name: p.name, productId: p.id, category: p.category }));
    return { gallery, catalog, byId: new Map([...gallery, ...catalog].map((p) => [p.id, p])) };
  }, [images, products]);
  const likedSet = useMemo(() => new Set(liked), [liked]);
  const relatedOf = (s: ResolvedSection): PickablePhoto[] => {
    const pids = new Set(s.lines.map((l) => l.productId).filter(Boolean));
    const gallery = photoPool.gallery.filter((p) => pids.has(p.productId));
    gallery.sort((a, b) => Number(likedSet.has(b.id)) - Number(likedSet.has(a.id)));
    return [...gallery, ...photoPool.catalog.filter((p) => pids.has(p.productId))];
  };
  const photosOf = (s: ResolvedSection): QuotePhoto[] => {
    const chosen = layout.photos[s.key];
    if (chosen) return chosen.map((id) => photoPool.byId.get(id)).filter((p): p is PickablePhoto => !!p);
    if (s.kind === "chairs" || s.kind === "extras") return [];
    return relatedOf(s)
      .filter((p) => !p.category || !NOT_BY_DEFAULT.has(p.category))
      .slice(0, DEFAULT_PHOTOS);
  };

  // ── The palette: the event's shades — or, when none were picked, the drawing's own ─────────────
  const palette: QuotePalette = useMemo(() => {
    const known = catalogShades(products);
    let shades = (event?.shades ?? []).map((name) => ({ name, swatch: known.find((k) => shadeKey(k.name) === shadeKey(name))?.swatch }));
    const cloths = new Set<string>();
    const used = new Map<string, { name: string; swatch?: string; n: number }>();
    for (const p of doc.placements) {
      const r = resolve(p.variantId);
      if (!r) continue;
      if (r.product.category === "tablecloths" && !isRunner(r.product)) cloths.add(r.variant?.name || r.product.name);
      if (!r.variant?.swatch || NOT_PALETTE.has(r.product.category)) continue;
      const key = shadeKey(r.variant.name);
      const u = used.get(key) ?? { name: r.variant.name, swatch: r.variant.swatch, n: 0 };
      u.n += p.quantity;
      used.set(key, u);
    }
    if (shades.length === 0) shades = [...used.values()].sort((a, b) => b.n - a.n).slice(0, 5).map(({ name, swatch }) => ({ name, swatch }));
    return { shades, cloths: [...cloths] };
  }, [products, event?.shades, doc]);

  // ── Issued, changed since, or never sent ─────────────────────────────────────────────────────
  const layoutKey = layoutSignature(layout);
  const drawingChanged = !!issued && currentVersion !== null && currentVersion !== issued.documentVersion;
  const layoutChanged = !!issued && (!issued.layout || layoutSignature(issued.layout) !== layoutKey || Math.abs(issued.total - figures.total) > 0.005);
  const needsIssue = !issued || drawingChanged || layoutChanged;
  const reference = event && issued && !needsIssue ? `${event.id.slice(0, 6).toUpperCase()}-${issued.documentVersion}` : null;

  const issue = async () => {
    if (!event) return;
    await flush();
    const record = await issueQuote(event.id, { layout, total: figures.total, discount: figures.discount });
    setIssued(record);
    // Issuing SEALED the drawing at this version, so the two agree by definition — until the next
    // edit in the studio opens the next version.
    setCurrentVersion(record.documentVersion);
    // F-1.9: the stamp that moves the event to "נשלחה הצעה" on every list in the app.
    void patchEvent(event.id, { quoteSentAt: record.issuedAt });
  };

  // ── The file ───────────────────────────────────────────────────────────────────────────────────
  const pagesRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "issue" | "pdf" | "print">(null);
  const [ready, setReady] = useState<{ doc: DesignDocumentContent; key: string; file: File } | null>(null);
  const readyFile = ready && ready.doc === doc && ready.key === layoutKey && !needsIssue ? ready.file : null;
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  /** Wait until the pages show what was just issued: the reference, re-measured, fonts in. */
  const settle = async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    await document.fonts?.ready;
    await frame();
    await frame();
    await new Promise((r) => setTimeout(r, 150));
    await frame();
  };

  const makeFile = async (): Promise<File> => {
    if (needsIssue) {
      setBusy("issue");
      await issue();
    }
    setBusy("pdf");
    await settle();
    const pages = [...(pagesRef.current?.querySelectorAll<HTMLElement>("[data-quote-page]") ?? [])];
    const file = await buildQuotePdf(pages, quoteFileName(event?.clientName, event?.date), {
      title: quoteTitle(event?.eventType),
      author: settings?.businessName,
    });
    setReady({ doc, key: layoutKey, file });
    if (event) void recordExport(event.id, "quote").catch(() => {});
    return file;
  };

  const run = async (deliver: (file: File) => Promise<void>) => {
    if (busy || !event) return;
    setNotice(null);
    try {
      const file = readyFile ?? (await makeFile());
      setBusy(null);
      await deliver(file);
    } catch {
      // Said out loud rather than swallowed: a designer who believes a quote went out, and a
      // client who never received one, is the worst outcome this screen has.
      setNotice({ tone: "warn", text: "הפקת ה-PDF נכשלה — נסו שוב" });
    } finally {
      setBusy(null);
    }
  };

  const share = () =>
    run(async (file) => {
      const outcome = await shareFile(file, [quoteTitle(event?.eventType), event?.clientName?.trim()].filter(Boolean).join(" — "));
      if (outcome === "shared") setNotice({ tone: "ok", text: "ההצעה שותפה" });
      else if (outcome === "downloaded") setNotice({ tone: "ok", text: "הדפדפן לא תומך בשיתוף קבצים — ה-PDF הורד" });
      else if (outcome === "blocked") setNotice({ tone: "warn", text: "ה-PDF מוכן — לחצו שוב על שיתוף" });
    });
  const download = () =>
    run(async (file) => {
      downloadFile(file);
      setNotice({ tone: "ok", text: "ה-PDF הורד" });
    });
  const print = async () => {
    if (busy || !event) return;
    try {
      if (needsIssue) {
        setBusy("issue");
        await issue();
      }
      setBusy("print");
      await settle();
      void recordExport(event.id, "quote").catch(() => {});
      window.print();
    } catch {
      setNotice({ tone: "warn", text: "ההפקה נכשלה — נסו שוב" });
    } finally {
      setBusy(null);
    }
  };

  // ── Edits from the page margin ───────────────────────────────────────────────────────────────
  const setMapEntry = <T,>(map: Record<string, T>, key: string, value: T | undefined): Record<string, T> => {
    const next = { ...map };
    if (value === undefined) delete next[key];
    else next[key] = value;
    return next;
  };
  const edit = {
    photoPanel: (s: ResolvedSection) => (
      <QuotePhotoPicker
        chosen={photosOf(s)}
        isDefault={!layout.photos[s.key]}
        related={relatedOf(s)}
        liked={liked.map((id) => photoPool.byId.get(id)).filter((p): p is PickablePhoto => !!p)}
        all={photoPool.gallery}
        onChange={(ids) => update((l) => ({ photos: setMapEntry(l.photos, s.key, ids) }))}
      />
    ),
    onTitle: (key: string, title: string) => {
      const def = allRaw.find((s) => s.key === key)?.title;
      update((l) => ({ titles: setMapEntry(l.titles, key, title.trim() && title !== def ? title : undefined) }));
    },
    onNote: (key: string, note: string) => update((l) => ({ notes: setMapEntry(l.notes, key, note.trim() ? note : undefined) })),
    onMove: (key: string, dir: -1 | 1) => {
      const keys = sections.map((s) => s.key);
      const i = keys.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= keys.length) return;
      [keys[i], keys[j]] = [keys[j], keys[i]];
      update({ order: keys });
    },
    onHide: (lineKey: string) => update((l) => ({ hidden: [...l.hidden, lineKey] })),
    onGift: (lineKey: string, gift: boolean) => update((l) => ({ gifts: gift ? [...l.gifts, lineKey] : l.gifts.filter((k) => k !== lineKey) })),
  };

  if (raw.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-ink-soft">עדיין אין פריטים בעיצוב.</p>
        <BackToStudio meeting={meeting} className="mt-3 inline-block text-sm" />
      </div>
    );
  }

  const issuedOn = issued ? new Date(issued.issuedAt).toLocaleDateString("he-IL") : "";
  const working = busy === "issue" ? "מפיק את ההצעה…" : busy === "pdf" ? "מכין PDF…" : busy === "print" ? "מכין להדפסה…" : null;
  const missing = missingDetails(settings);
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
        {editing ? <Eye className="h-4 w-4" strokeWidth={2} /> : <PencilLine className="h-4 w-4" strokeWidth={2} />}
        {editing ? "תצוגת לקוח" : "עריכת ההצעה"}
      </Button>
      {editing && (
        <Button variant="outline" size="sm" onClick={print} disabled={!event || !!busy}>
          <Printer className="h-4 w-4" strokeWidth={2} />
          הדפסה
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={download} disabled={!event || !!busy}>
        <Download className="h-4 w-4" strokeWidth={2} />
        הורדת PDF
      </Button>
      <Button size="sm" onClick={share} disabled={!event || !!busy} title="מפיק את ההצעה, חותם את גרסת העיצוב ופותח את חלון השיתוף">
        <Share2 className="h-4 w-4" strokeWidth={2} />
        {working ?? "שיתוף PDF"}
      </Button>
    </div>
  );

  return (
    <div className="flex w-full flex-col items-center gap-5">
      {editing && plan.access === "denied" && (
        <div className="no-print w-full" style={{ maxWidth: "210mm" }}>
          <VenueAccessNotice tone="measure" />
        </div>
      )}

      {!editing ? (
        // The client view: the pages, and the one thing the designer does from here.
        <div className="no-print flex w-full flex-wrap items-center justify-between gap-3" style={{ maxWidth: "210mm" }}>
          {notice ? <Notice notice={notice} /> : <span />}
          {actions}
        </div>
      ) : (
        <div className="no-print w-full space-y-4 rounded-md border border-border bg-surface px-5 py-4 shadow-floating" style={{ maxWidth: "210mm" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Status issued={!!issued} drawingChanged={drawingChanged} layoutChanged={layoutChanged} on={issuedOn} />
            {actions}
          </div>
          {notice && <Notice notice={notice} />}

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
            <Segmented<PriceMode>
              label="הצגת מחירים ללקוח"
              value={layout.priceMode}
              options={PRICE_MODES.map((m) => [m.id, m.label] as const)}
              onChange={(priceMode) => update({ priceMode })}
            />
            <div>
              <NumberField
                label="מחיר סופי ללקוח"
                min={0}
                decimals={0}
                hideZero
                value={layout.finalPrice ?? 0}
                placeholder={figures.catalogSum.toLocaleString("he-IL")}
                onChange={(v) => update({ finalPrice: v > 0 ? v : null })}
                commitOnBlur
              />
              <p className="nums mt-1 text-caption text-muted">
                לפי מחירון: {formatPrice(figures.catalogSum)}
                {settings && (settings.pricesIncludeVat ? " · כולל מע״מ" : " · לפני מע״מ")}
                {layout.finalPrice !== null && (
                  <button type="button" onClick={() => update({ finalPrice: null })} className="ms-2 text-accent hover:underline">
                    חזרה למחירון
                  </button>
                )}
              </p>
            </div>
            <SwitchRow
              checked={layout.priceMode !== "total" || layout.showDiscount}
              onChange={(showDiscount) => update({ showDiscount })}
              disabled={layout.priceMode !== "total" || figures.discount <= 0}
              label="הצגת ההנחה ללקוח"
              hint={
                layout.priceMode !== "total"
                  ? "כשמוצגים מחירים, ההפרש מהמחירון מודפס תמיד — כדי שהסכומים יסתכמו."
                  : figures.discount > 0
                    ? `הנחה של ${formatPrice(figures.discount)} מהמחירון.`
                    : "אין הנחה — המחיר הסופי שווה למחירון או גבוה ממנו."
              }
            />
            <SwitchRow
              checked={layout.sketch}
              onChange={(sketch) => update({ sketch })}
              disabled={sketches.length === 0}
              label="סקיצה של האולם"
              hint={sketches.length ? "תוכנית ההצבה מתוך העיצוב — שולחנות, במה ובר, בלי מידות ובלי מחירים." : "אין עדיין מה לשרטט."}
            />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
            <TextField
              label="משפט על הפלטה"
              multiline
              rows={2}
              value={layout.paletteNote}
              onChange={(paletteNote) => update({ paletteNote })}
              placeholder="למשל: כל הפרחים בגווני שמנת-לבן עם נגיעות ירוק עדין"
            />
            <TextField label="ברכת סיום" multiline rows={2} value={layout.closing} onChange={(closing) => update({ closing })} placeholder={DEFAULT_CLOSING} />
          </div>
          <p className="-mt-2 text-caption text-muted">
            גווני האירוע וסוג האירוע נקבעים בפרטי האירוע{(event?.shades?.length ?? 0) === 0 && " — כרגע הפלטה נלקחת מהפריטים שבעיצוב"}.
          </p>

          <div className="border-t border-border pt-4">
            <QuoteExtras extras={layout.extras} onChange={(extras) => update({ extras })} />
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-caption">
            {settings && <QuoteStudioDetails settings={settings} onChange={setSettings} />}
            {missing.length > 0 && <span className="text-warn-ink">חסרים בהצעה: {missing.join(", ")}</span>}
            {!event?.eventType && <span className="text-warn-ink">סוג האירוע לא צוין — בפרטי האירוע</span>}
            {hiddenCount > 0 && (
              <button type="button" onClick={() => update({ hidden: [] })} className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-ink">
                <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                <span className="nums">{hiddenCount}</span> שורות מוסתרות — החזרת הכול
              </button>
            )}
            {figures.unpriced > 0 && (
              <span className="inline-flex items-center gap-1.5 text-warn-ink">
                <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
                <span className="nums">{figures.unpriced}</span> פריטים ללא מחיר (או מחיר חלקי) — הוסיפו מחיר בקטלוג
              </span>
            )}
            {settings && !settings.quoteTerms && (
              <Link href="/settings" className="text-warn-ink underline-offset-2 hover:underline">
                לא הוגדרו תנאי הצעה ↗
              </Link>
            )}
          </div>
          <p className="text-caption text-muted">כותרות, הערות, תמונות וסדר — בכלים שמעל כל אזור בעמוד. מתנה או הסתרה — ב״…״ שליד כל שורה.</p>
        </div>
      )}

      <QuoteDocument
        pagesRef={pagesRef}
        settings={settings}
        event={event}
        venueName={venueName}
        layout={layout}
        sections={sections}
        figures={figures}
        photosOf={photosOf}
        palette={palette}
        seating={seating}
        sketches={sketches}
        reference={reference}
        issuedAt={reference ? (issued?.issuedAt ?? null) : null}
        edit={editing ? edit : undefined}
      />
    </div>
  );
}

function Notice({ notice }: { notice: { tone: "ok" | "warn"; text: string } }) {
  return (
    <p className={"inline-flex items-center gap-1.5 text-sm " + (notice.tone === "warn" ? "text-warn-ink" : "text-success-ink")}>
      {notice.tone === "warn" ? <TriangleAlert className="h-4 w-4" strokeWidth={2} /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
      {notice.text}
    </p>
  );
}

function Status({ issued, drawingChanged, layoutChanged, on }: { issued: boolean; drawingChanged: boolean; layoutChanged: boolean; on: string }) {
  if (!issued) return <p className="text-sm text-muted">טיוטה — טרם נשלחה ללקוח.</p>;
  if (drawingChanged)
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-warn-ink">
        <TriangleAlert className="h-4 w-4" strokeWidth={2} />
        העיצוב השתנה מאז ההצעה ששלחת ({on})
      </p>
    );
  if (layoutChanged)
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-warn-ink">
        <TriangleAlert className="h-4 w-4" strokeWidth={2} />
        יש שינויים בהצעה שטרם נשלחו (נשלחה {on})
      </p>
    );
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
      <Check className="h-4 w-4 text-accent" strokeWidth={2.5} />
      נשלחה {on} · תואמת לעיצוב הנוכחי
    </p>
  );
}
