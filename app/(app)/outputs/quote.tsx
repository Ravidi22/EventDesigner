"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Banknote, Building2, Check, Download, Eye, EyeOff, ListPlus, PencilRuler, Printer, Share2, TriangleAlert, Type } from "lucide-react";
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
  CONCEPT_PHOTO,
  COVER_PHOTO,
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
import { panelGroup as G, type PanelGroup } from "@/components/end-panel";
import { GroupLine } from "@/components/doc-shell";
import { NumberField } from "@/components/number-field";
import { TextField } from "@/components/text-field";
import { Segmented } from "@/components/segmented";
import { SwitchRow } from "@/components/toggle";
import { VenueAccessNotice } from "@/components/venue-access-notice";
import { QuoteDocument, type QuotePalette, type QuotePhoto, type QuoteSketch } from "./quote-document";
import { QuotePhotoPicker } from "./quote-photo-picker";
import { QuoteExtras } from "./quote-extras";
import { QuoteStudioDetails, missingDetails } from "./quote-studio-details";
import { PlacementMap, mapWorld } from "./placement-map";
import { buildQuotePdf, downloadFile, quoteFileName, shareFile } from "./quote-pdf";
import type { DocParts } from "./doc-parts";

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
  client,
  onStatus,
  children,
}: {
  doc: DesignDocumentContent;
  meeting?: boolean;
  event: EventSummary | null;
  plan: EventPlan;
  /** The drawing split by zone (lib/outputs/zone-sheets.ts) — sections and sketch pages both. */
  zonePlans: ZoneSheet[];
  /** The version the drawing is on now — F-7.4 compares it with the issued quote's. */
  documentVersion: number | null;
  /** The client view (the screen's "תצוגת לקוח"): the pages alone, no tools in their margins. */
  client: boolean;
  /** Where the quote stands, for the rail's line — kept by the screen while another document is open. */
  onStatus?: (s: { meta: string; warn: boolean }) => void;
  /** The screen's shell, handed this document's parts (./doc-parts.ts). */
  children: (parts: DocParts) => ReactNode;
}) {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [issued, setIssued] = useState<IssuedQuote | null>(null);
  const [layout, setLayout] = useState<QuoteLayout>(DEFAULT_LAYOUT);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [venueName, setVenueName] = useState<string>();
  const editing = !client;
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
      ctx: measureContext(plan.structure, doc),
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
      return {
        key: z.zone?.zone.id ?? "all",
        title: shown.length > 1 ? (z.zone?.zone.name ?? "") : "",
        aspect: world.heightMm / Math.max(1, world.widthMm),
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

  // The pages that are not sections. The cover and the concept take the event's own photographs by
  // default — liked ones first, then any of a section's — never a bare catalog shot; the closing
  // photo is only ever chosen.
  const eventPhotos = useMemo(() => {
    const pids = new Set(raw.flatMap((s) => s.lines.map((l) => l.productId)).filter(Boolean));
    const likedFirst = liked.map((id) => photoPool.byId.get(id)).filter((p): p is PickablePhoto => !!p && !p.id.startsWith("product:"));
    const related = photoPool.gallery.filter((p) => pids.has(p.productId) && !likedFirst.includes(p));
    return [...likedFirst, ...related];
  }, [raw, liked, photoPool]);
  const pagePhoto = (key: string): QuotePhoto | null => {
    const chosen = layout.photos[key];
    if (chosen) return chosen.map((id) => photoPool.byId.get(id)).find((p): p is PickablePhoto => !!p) ?? null;
    if (key === COVER_PHOTO) return eventPhotos[0] ?? null;
    if (key === CONCEPT_PHOTO) return eventPhotos[1] ?? null;
    return null;
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
    } catch (e) {
      console.error("quote PDF failed", e);
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
    pagePhotoPanel: (key: string) => {
      const p = pagePhoto(key);
      return (
        <QuotePhotoPicker
          chosen={p ? [p] : []}
          isDefault={!layout.photos[key]}
          related={eventPhotos}
          liked={liked.map((id) => photoPool.byId.get(id)).filter((x): x is PickablePhoto => !!x)}
          all={photoPool.gallery}
          max={1}
          onChange={(ids) => update((l) => ({ photos: setMapEntry(l.photos, key, ids) }))}
        />
      );
    },
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

  // ── The parts the screen's shell draws (2026-11-11, the "Outputs and 3D Drawers" board): the pages
  // on the light table, the controls as end-panel groups, share / download / print at the foot ──
  const issuedOn = issued ? new Date(issued.issuedAt).toLocaleDateString("he-IL") : "";
  const status = statusOf(!!issued, drawingChanged, layoutChanged, issuedOn);
  const working = busy === "issue" ? "מפיק את ההצעה…" : busy === "pdf" ? "מכין PDF…" : busy === "print" ? "מכין להדפסה…" : null;
  const empty = raw.length === 0;
  const off = !event || !!busy || empty;
  const foot: DocParts["foot"] = {
    info: working ?? notice?.text ?? status.short,
    warn: !working && (notice ? notice.tone === "warn" : status.warn),
    side: currentVersion !== null ? `גרסה ${currentVersion}` : undefined,
    action: { label: working ?? "שיתוף PDF", icon: Share2, onClick: share, disabled: off, title: "מפיק את ההצעה, חותם את גרסת העיצוב ופותח את חלון השיתוף" },
    extras: [
      { label: "הורדת PDF", icon: Download, onClick: download, disabled: off },
      { label: "הדפסה", icon: Printer, onClick: print, disabled: off },
    ],
  };

  // The rail's line under "הצעת מחיר" — kept by the screen while another document is open.
  const railKey = `${status.rail}|${status.warn}`;
  useEffect(() => {
    onStatus?.({ meta: status.rail, warn: status.warn });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railKey]);

  if (empty) {
    // eslint-disable-next-line react-hooks/refs -- the parts carry event handlers (share, print), called on a press, never while rendering
    return children({
      pages: (
        <div className="bg-canvas px-10 py-20 text-center shadow-lifted" style={{ width: "210mm" }}>
          <p className="text-sm text-ink-soft">עדיין אין פריטים בעיצוב.</p>
          <BackToStudio meeting={meeting} className="mt-3 inline-block text-sm" />
        </div>
      ),
      groups: [],
      foot,
    });
  }

  const missing = missingDetails(settings);
  const todo: { text: string; href?: string; link: string }[] = [
    ...(!event?.eventType ? [{ text: "סוג האירוע לא צוין", href: event && !meeting ? `/dashboard?event=${event.id}` : undefined, link: "לפרטי האירוע" }] : []),
    ...(figures.unpriced > 0 ? [{ text: `${figures.unpriced} פריטים ללא מחיר (או מחיר חלקי)`, href: meeting ? undefined : "/catalog", link: "לקטלוג" }] : []),
    ...(settings && !settings.quoteTerms ? [{ text: "לא הוגדרו תנאי הצעה", href: meeting ? undefined : "/settings", link: "להגדרות ↗" }] : []),
  ];
  const priceLabel = PRICE_MODES.find((m) => m.id === layout.priceMode)?.label ?? "";
  const extrasSum = layout.extras.reduce((n, e) => n + (e.price || 0), 0);
  const texts = [layout.concept.trim() && "קונספט", layout.paletteNote.trim() && "פלטה", layout.closing.trim() ? "ברכה אישית" : "ברכת ברירת מחדל"].filter(Boolean).join(" · ");

  const groups: PanelGroup[] = [
    ...(todo.length
      ? [
          G(
            "missing",
            TriangleAlert,
            "חסר בהצעה",
            todo.length === 1 ? "דבר אחד" : `${todo.length} דברים`,
            <div className="flex flex-col gap-2">
              {todo.map((t) => (
                <GroupLine key={t.text} action={t.href ? <Link href={t.href} className="hover:text-accent-hover">{t.link}</Link> : undefined}>
                  <span className="nums">{t.text}</span>
                </GroupLine>
              ))}
            </div>,
            true,
          ),
        ]
      : []),
    G(
      "price",
      Banknote,
      "מחירים",
      <span className="nums">{`${priceLabel} · ${formatPrice(figures.total)}`}</span>,
      <div className="flex flex-col gap-3.5">
        <Segmented<PriceMode> label="הצגת מחירים ללקוח" value={layout.priceMode} options={PRICE_MODES.map((m) => [m.id, m.label] as const)} onChange={(priceMode) => update({ priceMode })} />
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
      </div>,
    ),
    G(
      "sketch",
      PencilRuler,
      "סקיצה",
      sketches.length === 0 ? "אין מה לשרטט" : layout.sketch ? (sketches.length > 1 ? `מוצגת · ${sketches.length} אזורים` : "מוצגת") : "לא מוצגת",
      <SwitchRow
        checked={layout.sketch}
        onChange={(sketch) => update({ sketch })}
        disabled={sketches.length === 0}
        label="סקיצה של האולם"
        hint={sketches.length ? "תוכנית ההצבה מתוך העיצוב — שולחנות, במה ובר, בלי מידות ובלי מחירים." : "אין עדיין מה לשרטט."}
      />,
    ),
    G(
      "text",
      Type,
      "טקסטים",
      texts,
      <div className="flex flex-col gap-3">
        <TextField
          label="הקונספט"
          multiline
          rows={4}
          value={layout.concept}
          onChange={(concept) => update({ concept })}
          placeholder="למשל: ערב רך בגווני שמנת וורוד עתיק, עם ירוק מרווה שמחבר בין האולם לגן…"
        />
        <TextField
          label="חומרים ופלטה — שורה אחת"
          multiline
          rows={2}
          value={layout.paletteNote}
          onChange={(paletteNote) => update({ paletteNote })}
          placeholder="למשל: כל הפרחים בגווני שמנת-לבן עם נגיעות ירוק עדין"
        />
        <TextField label="ברכת סיום" multiline rows={2} value={layout.closing} onChange={(closing) => update({ closing })} placeholder={DEFAULT_CLOSING} />
        <p className="text-xs leading-relaxed text-muted">
          גווני האירוע וסוג האירוע נקבעים בפרטי האירוע{(event?.shades?.length ?? 0) === 0 && " — כרגע הפלטה נלקחת מהפריטים שבעיצוב"}.
        </p>
      </div>,
    ),
    G(
      "extras",
      ListPlus,
      "תוספות",
      layout.extras.length ? <span className="nums">{`${layout.extras.length} ${layout.extras.length === 1 ? "שורה" : "שורות"} · ${formatPrice(extrasSum)}`}</span> : "אין",
      <QuoteExtras extras={layout.extras} onChange={(extras) => update({ extras })} />,
    ),
    ...(hiddenCount > 0
      ? [
          G(
            "hidden",
            EyeOff,
            "שורות מוסתרות",
            <span className="nums">{hiddenCount}</span>,
            <GroupLine
              action={
                <button type="button" onClick={() => update({ hidden: [] })} className="inline-flex items-center gap-1.5 hover:text-accent-hover">
                  <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                  החזרת הכול
                </button>
              }
            >
              <span className="nums">{hiddenCount === 1 ? "שורה אחת מוסתרת מהלקוח" : `${hiddenCount} שורות מוסתרות מהלקוח`}</span>
            </GroupLine>,
          ),
        ]
      : []),
    ...(settings
      ? [
          G(
            "studio",
            Building2,
            "פרטי הסטודיו",
            missing.length ? `חסרים ${missing.length}` : "מלאים",
            <QuoteStudioDetails settings={settings} onChange={setSettings} />,
            missing.length > 0,
          ),
        ]
      : []),
  ];

  // eslint-disable-next-line react-hooks/refs -- as above: handlers, not reads
  return children({
    pages: (
      <>
        {editing && plan.access === "denied" && (
          <div className="no-print" style={{ width: "210mm" }}>
            <VenueAccessNotice tone="measure" />
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
          pagePhoto={pagePhoto}
          palette={palette}
          seating={seating}
          sketches={sketches}
          reference={reference}
          issuedAt={reference ? (issued?.issuedAt ?? null) : null}
          edit={editing ? edit : undefined}
        />
      </>
    ),
    lead: (
      <p className={"flex items-start gap-1.5 px-4 pb-3 text-[13px] leading-snug " + (status.warn ? "text-warn-ink" : "text-muted")}>
        {status.warn ? <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} /> : issued ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2.5} /> : null}
        {status.long}
      </p>
    ),
    after: <p className="border-t border-border-soft px-4 py-3 text-xs leading-relaxed text-muted">כותרות, הערות, תמונות וסדר — בכלים שמעל כל אזור בעמוד. מתנה או הסתרה — ב״…״ שליד כל שורה.</p>,
    groups,
    foot,
    defaultOpen: ["missing", "price"],
  });
}

/** Where the quote stands, in three lengths: the panel's line, the foot's, the rail's. */
export function statusOf(issued: boolean, drawingChanged: boolean, layoutChanged: boolean, on: string): { long: string; short: string; rail: string; warn: boolean } {
  if (!issued) return { long: "טיוטה — טרם נשלחה ללקוח.", short: "טיוטה · טרם נשלחה", rail: "טיוטה · טרם נשלחה", warn: false };
  if (drawingChanged) return { long: `העיצוב השתנה מאז ההצעה ששלחת (${on})`, short: "העיצוב השתנה מאז ההצעה", rail: "העיצוב השתנה מאז", warn: true };
  if (layoutChanged) return { long: `יש שינויים בהצעה שטרם נשלחו (נשלחה ${on})`, short: "טיוטה · שינויים שטרם נשלחו", rail: "שינויים שטרם נשלחו", warn: true };
  return { long: `נשלחה ${on} · תואמת לעיצוב הנוכחי`, short: `נשלחה ${on} · תואמת לעיצוב`, rail: `נשלחה ${on}`, warn: false };
}

