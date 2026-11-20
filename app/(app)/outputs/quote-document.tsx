"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, EyeOff, Gift, ImagePlus, PencilLine } from "lucide-react";
import type { BusinessSettings } from "@/lib/settings/types";
import type { EventSummary } from "@/lib/events/types";
import { formatAmount, formatPrice, formatUnitPrice } from "@/lib/catalog/format";
import {
  CLOSING_PHOTO,
  CONCEPT_PHOTO,
  COVER_PHOTO,
  DEFAULT_CLOSING,
  discountShown,
  quoteTitle,
  type QuoteFigures,
  type QuoteLayout,
  type ResolvedLine,
  type ResolvedSection,
} from "@/lib/quotes/layout";
import { paginate } from "@/lib/outputs/paginate";
import { monogram, type DocStyle, type DocStyleSetting } from "@/lib/documents/style";
import { docTheme, type DocTheme } from "@/lib/documents/theme";
import { Popover } from "@/components/popover";
import { Menu, type MenuItem } from "@/components/menu";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/button";
import { NO_CAPTURE } from "./quote-pdf";
import { Credit, Ornament, Palette, Paper, PhotoFrame, PhotoSet, SectionHeading, StudioMark, chapter, logoJustify, type DocPhoto, type DocShade } from "./doc-kit";

// THE QUOTE AS A CLIENT RECEIVES IT — A4 pages, the same on screen, on paper and in the PDF.
//
// Drawn in the studio's DIRECTION (lib/documents/style.ts — the user's claude.ai/design board
// "Documents", 2026-11-10): הזמנה (fine stationery), לוקבוק (fashion lookbook) or סטודיו
// (architectural), each its own hand-made layout, and inside it the studio's twelve settings —
// logo place, accent, faces, cover, section headers, photos, price table, paper, density, footer,
// signature. The pages, in order:
//
//   1  the cover                 — a page of its own; its photo is `photos[COVER_PHOTO]`
//   2  the concept               — the idea in a paragraph, a photo, the palette (when there is one)
//   3  the sketch(es)            — the floor plan, from the drawing, no measurements
//   4  the event AREA by area    — "עיצוב 17 שולחנות מלבניים", photographs, "על כל שולחן:" …
//   5  the price                 — per area or the total, the discount, the VAT
//   6  terms, greeting, signatures
//
// Airy density opens every area on a page of its own (the board's rhythm); compact lets them flow.
// Every number is still derived from the one drawing (lib/outputs/quote-sections.ts).
//
// The pages are REAL ELEMENTS, not a print-time flow: the PDF is built from images of them
// (./quote-pdf.ts), so the breaks are decided here — every flowing block is measured once in an
// invisible column at the page's own width, and lib/outputs/paginate.ts packs the heights into
// pages. The cover and the concept are composed for a whole page and are never measured.
//
// The designer's tools (edit mode only) are `no-print` AND carry NO_CAPTURE, so neither the printer
// nor the PDF ever sees them. A section's tools sit in the gap ABOVE its title; a line's "…" in the
// page's end margin beside it; a whole page's photo tool in its top corner.
//
// ⚠ Client-facing surface. Prices yes — costs, margins and supplier data never (npm run check:costs).

export type QuotePhoto = DocPhoto;

export interface QuotePalette {
  shades: DocShade[];
  cloths: string[];
}

/** A floor plan for the sketch page — drawn by the caller, which holds the plan and the zones. */
export interface QuoteSketch {
  key: string;
  title: string;
  /** Height ÷ width of the drawing. The page decides the width; the height follows, capped. */
  aspect: number;
  render: (widthMm: number, heightMm: number) => ReactNode;
}

/** Present in edit mode only. */
export interface QuoteEdit {
  photoPanel: (section: ResolvedSection) => ReactNode;
  /** The picker for a page's own photo (COVER_PHOTO, CONCEPT_PHOTO, CLOSING_PHOTO). */
  pagePhotoPanel: (key: string) => ReactNode;
  onTitle: (key: string, title: string) => void;
  onNote: (key: string, note: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onHide: (lineKey: string) => void;
  onGift: (lineKey: string, gift: boolean) => void;
}

export interface QuoteDocumentProps {
  settings: BusinessSettings | null;
  event: EventSummary | null;
  venueName?: string;
  layout: QuoteLayout;
  sections: ResolvedSection[];
  figures: QuoteFigures;
  photosOf: (section: ResolvedSection) => QuotePhoto[];
  /** A page's own photo (COVER_PHOTO…), chosen or picked by default; null = none. */
  pagePhoto: (key: string) => QuotePhoto | null;
  palette: QuotePalette;
  /** Tables as the client counts them (a joined block is one) and everyone who sits — at the tables,
   *  on the banquettes, on the sofas (lib/design-document/seat-count.ts). */
  seating: { tables: number; seats: number };
  sketches: QuoteSketch[];
  /** "A1B2C3-4" once issued; null = not issued (nothing printed in its place). */
  reference: string | null;
  issuedAt: number | null;
  edit?: QuoteEdit;
  pagesRef?: Ref<HTMLDivElement>;
  /** The look. Absent = the studio's (settings.docStyle). The settings screen passes its draft. */
  style?: DocStyleSetting | DocStyle;
}

type Parts = Omit<QuoteDocumentProps, "pagesRef"> & { t: DocTheme; g: Geometry };

// ── Page geometry, in mm (a real CSS unit — the screen draws the page at its true trim) ─────────
const PAGE_W = 210;
const PAGE_H = 297;
const PX_PER_MM = 96 / 25.4;

interface Geometry {
  /** Inline margin. */
  m: number;
  /** Where the flowing content starts and how far from the foot it stops. */
  top: number;
  bottom: number;
  /** The content box. */
  w: number;
  h: number;
}

function geometry(t: DocTheme): Geometry {
  const m = t.margin;
  // Studio wears its metadata bar on every page; stationery's foot carries the number, a rule pair
  // and the credit stacked.
  const top = t.dir === "studio" ? m + 16 : m;
  const bottom = t.dir === "stationery" ? 26 : t.dir === "studio" ? 19 : 18;
  return { m, top, bottom, w: PAGE_W - 2 * m, h: PAGE_H - top - bottom };
}

/** A flowing block (measured), or a page composed whole (the cover, the concept). */
type Block =
  | { kind: "flow"; key: string; keep?: boolean; start?: boolean; render: (live: boolean) => ReactNode }
  | { kind: "page"; key: string; cover?: boolean; render: () => ReactNode; tools?: ReactNode };

type Page = { kind: "flow"; blocks: number[] } | { kind: "page"; block: number };

const DAY_MS = 86_400_000;
const longDate = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
const shortDate = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

export function QuoteDocument({ pagesRef, ...props }: QuoteDocumentProps) {
  const t = docTheme(props.style ?? props.settings?.docStyle);
  const g = geometry(t);
  const p: Parts = { ...props, t, g };
  const blocks = buildBlocks(p);
  const flowIdx = blocks.flatMap((b, i) => (b.kind === "flow" ? [i] : []));

  // Measure every flowing block in an invisible column at the page's width; pack the heights.
  const measurer = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<number[] | null>(null);
  useLayoutEffect(() => {
    const el = measurer.current;
    if (!el) return;
    const read = () => {
      // In layout px: the screen may show the pages scaled (the outputs stage's zoom is a transform
      // on an ancestor), and a rect is read AFTER transforms — divided back by the column's own scale.
      const k = el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth || 1 : 1;
      const hs = [...el.children].map((c) => c.getBoundingClientRect().height / k);
      // A measurer that is not laid out (display:none somewhere up the tree) reads all zeros — not
      // a document with nothing in it.
      if (hs.length > 0 && hs.every((h) => h === 0)) return;
      setHeights((prev) => (prev && prev.length === hs.length && prev.every((h, i) => Math.abs(h - hs[i]) < 0.5) ? prev : hs));
    };
    read();
    const ro = new ResizeObserver(read);
    for (const c of el.children) ro.observe(c);
    void document.fonts?.ready.then(read);
    return () => ro.disconnect();
  });
  const measured = heights && heights.length === flowIdx.length ? heights : null;
  const heightOf = new Map(flowIdx.map((bi, j) => [bi, measured ? measured[j] : 0]));
  const pages = layOut(blocks, heightOf, g.h * PX_PER_MM - 1);
  const total = pages.length;
  const { settings } = props;

  return (
    <div ref={pagesRef} className="flex flex-col items-center gap-5 print:block">
      <div aria-hidden className="no-print h-0 overflow-hidden" {...{ [NO_CAPTURE]: "" }}>
        <div ref={measurer} className="invisible" style={{ width: `${g.w}mm`, fontFamily: t.body, color: t.text }}>
          {flowIdx.map((bi) => {
            const b = blocks[bi] as Extract<Block, { kind: "flow" }>;
            return <div key={b.key}>{b.render(false)}</div>;
          })}
        </div>
      </div>

      {pages.map((page, n) => {
        const whole = page.kind === "page" ? (blocks[page.block] as Extract<Block, { kind: "page" }>) : null;
        return (
          <section
            key={whole?.key ?? `p${n}`}
            data-quote-page=""
            data-page-key={whole?.key ?? (blocks[(page as Extract<Page, { kind: "flow" }>).blocks[0]]?.key || `p${n}`)}
            className="quote-page relative shrink-0 overflow-hidden shadow-lifted"
            style={{ width: `${PAGE_W}mm`, height: `${PAGE_H}mm`, fontFamily: t.body, color: t.text, background: t.paper }}
          >
            <Paper t={t} bare={!!whole?.cover && t.style.cover !== "plain"} />
            {settings?.showBsd && (
              <span className="absolute z-[4] text-[11px] font-semibold" style={{ top: "4.5mm", insetInlineStart: `${g.m}mm`, color: whole?.cover && t.dir === "lookbook" ? "#fff" : t.soft }}>
                בס״ד
              </span>
            )}
            {whole ? (
              <>
                {whole.render()}
                {whole.tools}
              </>
            ) : (
              <>
                <div className="absolute z-[2]" style={{ top: `${g.top}mm`, insetInline: `${g.m}mm`, height: `${g.h}mm` }}>
                  {(page as Extract<Page, { kind: "flow" }>).blocks.map((bi) => {
                    const b = blocks[bi] as Extract<Block, { kind: "flow" }>;
                    return <div key={b.key}>{b.render(true)}</div>;
                  })}
                </div>
              </>
            )}
            {!(whole?.cover && t.dir !== "studio") && <RunningHead p={p} n={n} total={total} />}
            {!whole?.cover ? <Foot p={p} n={n} total={total} /> : <CoverFoot p={p} n={n} total={total} />}
          </section>
        );
      })}
    </div>
  );
}

/** Whole pages stand alone; flowing blocks run between them, broken where a block asks to start a
 *  page, and packed by height inside each run. */
function layOut(blocks: Block[], heightOf: Map<number, number>, capacity: number): Page[] {
  const pages: Page[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const packed = paginate(
      run.map((i) => heightOf.get(i) ?? 0),
      run.map((i) => !!(blocks[i] as Extract<Block, { kind: "flow" }>).keep),
      () => capacity,
    );
    for (const pg of packed) if (pg.length) pages.push({ kind: "flow", blocks: pg.map((j) => run[j]) });
    run = [];
  };
  blocks.forEach((b, i) => {
    if (b.kind === "page") {
      flush();
      pages.push({ kind: "page", block: i });
    } else {
      if (b.start) flush();
      run.push(i);
    }
  });
  flush();
  return pages;
}

// ── The blocks, in reading order ─────────────────────────────────────────────────────────────

function eventFacts({ event, venueName, seating }: Parts) {
  const date = event?.date ? new Date(`${event.date}T12:00:00`) : null;
  const zones = event?.zonesLabel ?? "";
  const place = [venueName, zones && zones !== venueName ? zones : null].filter(Boolean).join(" · ");
  const guests = event?.guests ?? 0;
  const tables = [seating.tables > 0 ? `${seating.tables} ${seating.tables === 1 ? "שולחן" : "שולחנות"}` : "", seating.seats > 0 ? `${seating.seats} מקומות` : ""].filter(Boolean).join(" · ");
  return {
    client: event?.clientName?.trim() ?? "",
    date,
    dateLong: date ? `${longDate(date)}${event?.time ? ` · ${event.time}` : ""}` : "",
    dateShort: date ? shortDate(date) : "",
    venue: venueName ?? "",
    place,
    guests: guests > 0 ? `${guests} אורחים` : "",
    tables,
    type: event?.eventType ?? "",
  };
}

function buildBlocks(p: Parts): Block[] {
  const { layout, sections, edit, t, g } = p;
  const priced = layout.priceMode !== "total";
  const itemized = layout.priceMode === "itemized";
  const blocks: Block[] = [];
  let chapterNo = 0;

  blocks.push({
    kind: "page",
    key: "cover",
    cover: true,
    render: () => <Cover {...p} />,
    tools: edit && t.style.cover === "photo" ? <PageTools label="תמונת השער">{edit.pagePhotoPanel(COVER_PHOTO)}</PageTools> : undefined,
  });

  const conceptPhoto = p.pagePhoto(CONCEPT_PHOTO);
  if (layout.concept.trim() || p.palette.shades.length > 0 || conceptPhoto) {
    const n = ++chapterNo;
    blocks.push({
      kind: "page",
      key: "concept",
      render: () => <Concept {...p} n={n} photo={conceptPhoto} />,
      tools: edit ? <PageTools label="תמונת הקונספט">{edit.pagePhotoPanel(CONCEPT_PHOTO)}</PageTools> : undefined,
    });
  }

  if (layout.sketch && p.sketches.length > 0) {
    const n = ++chapterNo;
    p.sketches.forEach((sk, i) => {
      // Room under the drawing for its heading and its legend.
      const maxH = g.h - (t.dir === "lookbook" ? 62 : 52);
      const frameIn = t.dir === "stationery" ? 7 : 0;
      const w = g.w - frameIn;
      const h = Math.max(50, Math.min(maxH, w * sk.aspect));
      blocks.push({
        kind: "flow",
        key: `sketch:${sk.key}`,
        start: true,
        // The measuring column gets a box of the drawing's height, never the drawing: its plants and
        // textures carry SVG ids, and a second copy earlier in the page is the one url(#…) finds.
        render: (live) => <SketchBlock {...p} n={i === 0 ? n : null} title={sk.title} w={w} h={h}>{live && sk.render(w, h)}</SketchBlock>,
      });
    });
  }

  sections.forEach((s, si) => {
    const n = ++chapterNo;
    const photos = p.photosOf(s);
    const perTable = !!s.perTable && !itemized;
    blocks.push({
      kind: "flow",
      key: `head:${s.key}`,
      keep: true,
      start: t.airy,
      render: (live) => (
        <div className="relative" style={{ paddingTop: `${(si === 0 || t.airy ? 2 : 10) * t.k}mm` }}>
          {live && edit && <SectionTools section={s} edit={edit} first={si === 0} last={si === sections.length - 1} />}
          <SectionOpener p={p} s={s} n={n} photos={photos} priced={priced} perTable={perTable} itemized={itemized} />
        </div>
      ),
    });
    s.lines.forEach((l, li) =>
      blocks.push({
        kind: "flow",
        key: `line:${l.key}`,
        render: (live) => (
          <div className="relative">
            {live && edit && <LineTools line={l} edit={edit} margin={g.m} />}
            {itemized ? <ItemizedLine t={t} line={l} /> : <SpecLine t={t} line={l} perTable={perTable} index={li} />}
          </div>
        ),
      }),
    );
    if (s.seating?.length) {
      blocks.push({
        kind: "flow",
        key: `seating:${s.key}`,
        render: () => (
          <p style={{ paddingTop: "2mm", fontFamily: t.body, fontSize: 13, color: t.text, textAlign: t.dir === "stationery" ? "center" : "start" }}>
            <span style={{ fontWeight: 700 }}>כסאות: </span>
            {s.seating!.join(", ")}
          </p>
        ),
      });
    }
  });

  const priceNo = ++chapterNo;
  blocks.push({ kind: "flow", key: "summary", start: true, render: () => <Summary {...p} n={priceNo} /> });

  const terms = (p.settings?.quoteTerms ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const termsNo = ++chapterNo;
  const closingPhoto = p.pagePhoto(CLOSING_PHOTO);
  blocks.push({
    kind: "flow",
    key: "terms",
    start: t.airy,
    keep: true,
    render: (live) => (
      <div className="relative" style={{ paddingTop: `${(t.airy ? 0 : 10) * t.k}mm` }}>
        {live && edit && (
          <div className="no-print absolute end-0 top-0 z-10 flex items-center gap-0.5 rounded-pill bg-inset px-1" {...toolsProps}>
            <Popover label="תמונת הסיום" icon={ImagePlus} trigger="icon" side="bottom" panelClassName="w-[380px]">
              {edit.pagePhotoPanel(CLOSING_PHOTO)}
            </Popover>
          </div>
        )}
        {closingPhoto && (
          <PhotoFrame
            t={t}
            photo={closingPhoto}
            shape={t.dir === "stationery" ? "arch" : "rect"}
            outline={t.dir === "stationery"}
            style={{
              height: `${(t.dir === "lookbook" ? 96 : 70) * t.k}mm`,
              width: t.dir === "stationery" ? "70mm" : "auto",
              margin: t.dir === "stationery" ? "0 auto 9mm" : "0 0 8mm",
              ...(t.dir === "lookbook" ? { marginInline: `-${g.m}mm` } : {}),
            }}
          />
        )}
        <SectionHeading t={t} n={termsNo} title={terms.length ? "תנאים ואישור" : "אישור ההצעה"} />
      </div>
    ),
  });
  if (terms.length) blocks.push({ kind: "flow", key: "terms:list", render: () => <Terms t={t} terms={terms} /> });
  blocks.push({ kind: "flow", key: "sign", render: () => <Signatures {...p} /> });
  return blocks;
}

// ── Page furniture: the running head, the foot ─────────────────────────────────────────────────

function RunningHead({ p, n, total }: { p: Parts; n: number; total: number }) {
  const { t, g, settings } = p;
  if (t.dir !== "studio") return null;
  const f = eventFacts(p);
  const cells: [string, string][] = [
    ["סטודיו", settings?.businessName ?? ""],
    ["לקוח", f.client],
    ["אירוע", [f.type, f.dateShort].filter(Boolean).join(" · ")],
    ["עמוד", `${String(n + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`],
  ];
  return (
    <header
      className="absolute z-[4] grid"
      style={{ top: `${g.m - 2}mm`, insetInline: `${g.m}mm`, gridTemplateColumns: "1.2fr 1.2fr 1.2fr .8fr", borderTop: `1.2px solid ${t.text}`, borderBottom: `0.5px solid ${t.rule}` }}
    >
      {cells.map(([k, v], i) => (
        <div key={k} className="flex min-w-0 flex-col" style={{ gap: 1, padding: "2mm 3mm 2mm 0", paddingInlineStart: i ? "3mm" : 0, borderInlineStart: i ? `0.5px solid ${t.rule}` : "none" }}>
          <span style={{ fontSize: 8, color: t.muted }}>{k}</span>
          <span className="nums truncate" style={{ fontSize: 10.5, fontWeight: 500 }}>
            {v}
          </span>
        </div>
      ))}
    </header>
  );
}

function contactLine(settings: BusinessSettings | null) {
  return [settings?.phone, settings?.email, settings?.instagram && `@${settings.instagram}`].filter(Boolean).join("   ·   ");
}

/** "כל התמונות להמחשה בלבד" and the reference — on every page, the way the old quote had them. */
function notice(reference: string | null) {
  return ["כל התמונות להמחשה בלבד", reference ? `הצעה ${reference}` : null].filter(Boolean).join(" · ");
}

function Foot({ p, n, total }: { p: Parts; n: number; total: number }) {
  const { t, g, settings, reference, event } = p;
  const contact = t.style.footer === "contact" ? contactLine(settings) : "";
  const num = `${n + 1} / ${total}`;
  if (t.dir === "stationery")
    return (
      <footer className="absolute inset-x-0 z-[4] flex flex-col items-center" style={{ bottom: "3.4mm", gap: "1.6mm", fontFamily: t.body }}>
        {contact && (
          <p className="nums" dir="ltr" style={{ fontSize: 9.5, color: t.soft }}>
            {contact}
          </p>
        )}
        <div className="nums flex items-center gap-2" style={{ fontFamily: t.head, fontSize: 13, color: t.accent }}>
          <span style={{ width: "6mm", height: 0.5, background: t.accent }} />
          {n + 1}
          <span style={{ width: "6mm", height: 0.5, background: t.accent }} />
        </div>
        <p className="nums" style={{ fontSize: 8, color: t.muted }}>
          {notice(reference)}
        </p>
        <Credit t={t} />
      </footer>
    );
  if (t.dir === "lookbook")
    return (
      <footer className="absolute z-[4] flex items-end justify-between gap-4" style={{ bottom: "6mm", insetInline: `${g.m}mm`, fontFamily: t.body }}>
        <div className="flex flex-col" style={{ gap: 1 }}>
          {contact && (
            <span className="nums" dir="ltr" style={{ fontSize: 9, color: t.soft, textAlign: "right" }}>
              {contact}
            </span>
          )}
          <span className="nums" style={{ fontSize: 9.5, fontWeight: 500 }}>
            {[event?.clientName, quoteTitle(event?.eventType)].filter(Boolean).join(" — ")} · {num}
          </span>
        </div>
        <div className="flex flex-col items-end" style={{ gap: 1 }}>
          <span className="nums" style={{ fontSize: 8, color: t.muted }}>
            {notice(reference)}
          </span>
          <Credit t={t} />
        </div>
      </footer>
    );
  return (
    <footer
      className="absolute z-[4] flex items-baseline justify-between gap-4"
      style={{ bottom: "7mm", insetInline: `${g.m}mm`, paddingTop: "2mm", borderTop: `0.5px solid ${t.rule}`, fontFamily: t.body, fontSize: 8.5, color: t.muted }}
    >
      <span className="nums" dir={contact ? "ltr" : undefined}>
        {contact || settings?.businessName}
      </span>
      <span className="nums">{notice(reference)}</span>
      <span className="flex items-baseline gap-3">
        {t.style.footer === "minimal" && <span className="nums">{num}</span>}
        <Credit t={t} />
      </span>
    </footer>
  );
}

function CoverFoot({ p, n, total }: { p: Parts; n: number; total: number }) {
  const { t, g } = p;
  if (t.dir === "studio") return <Foot p={p} n={n} total={total} />;
  const dark = t.dir === "lookbook" && p.t.style.cover !== "plain";
  return (
    <div className="absolute z-[4] flex" style={{ bottom: t.dir === "stationery" ? "3.4mm" : "6mm", insetInline: `${g.m}mm`, justifyContent: t.dir === "stationery" ? "center" : "flex-end" }}>
      <Credit t={t} onDark={dark} />
    </div>
  );
}

// ── The cover ──────────────────────────────────────────────────────────────────────────────────

function Cover(p: Parts) {
  const { t, pagePhoto, edit } = p;
  const photo = t.style.cover === "photo" ? pagePhoto(COVER_PHOTO) : null;
  // A photo cover with no photo: the designer sees the slot to fill; the client the plain cover.
  const kind = t.style.cover === "photo" && !photo && !edit ? "plain" : t.style.cover;
  if (kind === "gradient") return <GradientCover {...p} />;
  if (t.dir === "lookbook") return <LookbookCover {...p} photo={kind === "photo" ? photo : undefined} />;
  if (t.dir === "studio") return <StudioCover {...p} photo={kind === "photo" ? photo : undefined} />;
  return <StationeryCover {...p} photo={kind === "photo" ? photo : undefined} />;
}

/** `photo`: undefined = no photo on this cover; null = a photo cover still waiting for its photo. */
type CoverProps = Parts & { photo?: DocPhoto | null };

function coverMeta(p: Parts) {
  const { settings, reference, issuedAt } = p;
  const issued = issuedAt !== null ? new Date(issuedAt) : null;
  const validDays = settings?.quoteValidityDays ?? 0;
  const validUntil = issued && validDays > 0 ? new Date(issued.getTime() + validDays * DAY_MS) : null;
  return {
    issued,
    validUntil,
    line: [reference && `הצעה ${reference}`, issued && longDate(issued), validUntil && `בתוקף עד ${longDate(validUntil)}`].filter(Boolean).join(" · "),
  };
}

function StationeryCover({ t, photo, ...p }: CoverProps) {
  const f = eventFacts({ t, ...p } as Parts);
  const meta = coverMeta({ t, ...p } as Parts);
  const letters = monogram(f.client);
  const centre = t.style.logoPos === "center";
  return (
    <div className="absolute inset-0 z-[2] flex flex-col items-center text-center" style={{ padding: `${30 * t.k}mm 24mm 22mm` }}>
      <div className="flex w-full flex-col" style={{ alignItems: logoJustify(t), gap: 3 }}>
        <StudioMark t={t} logoUrl={p.settings?.logoUrl} name={p.settings?.businessName} heightMm={13} />
        {!p.settings?.logoUrl && p.settings?.businessNumber && <span className="nums" style={{ fontSize: 9, color: t.muted }}>ע.מ {p.settings.businessNumber}</span>}
      </div>
      {photo !== undefined ? (
        <PhotoFrame t={t} photo={photo} placeholder="תמונת השער — בכלי שבראש העמוד" shape="arch" outline style={{ marginTop: `${16 * t.k}mm`, width: "84mm", height: `${100 * t.k}mm` }} />
      ) : (
        letters.length > 0 && (
          <div
            className="flex items-center justify-center"
            style={{ marginTop: `${20 * t.k}mm`, width: "74mm", height: "74mm", borderRadius: "50%", border: `0.7px solid ${t.accent}`, outline: `0.35px solid ${t.accent}`, outlineOffset: "1.6mm", gap: "7mm" }}
          >
            <span style={{ fontFamily: t.head, fontSize: 88, lineHeight: 1, color: t.text }}>{letters[0]}</span>
            {letters[1] && (
              <>
                <span style={{ width: 0.7, height: "36mm", background: t.accent, transform: "rotate(18deg)" }} />
                <span style={{ fontFamily: t.head, fontSize: 88, lineHeight: 1, color: t.text }}>{letters[1]}</span>
              </>
            )}
          </div>
        )
      )}
      <h1 style={{ marginTop: `${16 * t.k}mm`, fontFamily: t.head, fontWeight: t.wLight, fontSize: f.client.length > 16 ? 44 : 58, lineHeight: 1.1, textWrap: "balance" }}>{f.client || quoteTitle(f.type)}</h1>
      <Ornament t={t} width={24} style={{ marginTop: "7mm" }} />
      <p style={{ marginTop: "7mm", fontFamily: t.head, fontSize: 21, color: t.soft }}>{quoteTitle(f.type)}</p>
      <p className="nums" style={{ marginTop: "3mm", fontSize: 14.5, color: t.muted }}>
        {[f.dateLong, f.place].filter(Boolean).join(" · ")}
      </p>
      {(f.guests || f.tables) && (
        <p className="nums" style={{ marginTop: "1.5mm", fontSize: 12.5, color: t.muted }}>
          {[f.guests, f.tables].filter(Boolean).join(" · ")}
        </p>
      )}
      <span className="flex-1" />
      <p style={{ fontFamily: t.head, fontSize: 15, color: t.soft }}>הוכן במיוחד עבורכם</p>
      {meta.line && (
        <p className="nums" style={{ marginTop: "2mm", fontSize: 11, color: t.muted }}>
          {meta.line}
        </p>
      )}
      {!centre && null}
    </div>
  );
}

/** "מיכל ודניאל" → ["מיכל", "ודניאל"] — a couple on two lines, the way the lookbook sets them. */
function nameLines(name: string): string[] {
  const at = name.search(/\s+(?=ו\S)|\s*&\s*/);
  return at > 0 ? [name.slice(0, at).trim(), name.slice(at).trim()] : [name];
}

function LookbookCover({ t, g, photo, ...p }: CoverProps) {
  const f = eventFacts({ t, g, ...p } as Parts);
  const meta = coverMeta({ t, g, ...p } as Parts);
  const lines = nameLines(f.client || quoteTitle(f.type));
  const longest = Math.max(4, ...lines.map((l) => [...l].length));
  const size = Math.min(210, Math.floor((g.w * PX_PER_MM) / (longest * 0.4)));
  const onPhoto = photo !== undefined;
  const fg = onPhoto ? "#fff" : t.text;
  return (
    <div className="absolute inset-0 z-[2]">
      {onPhoto && (
        <>
          <PhotoFrame t={t} photo={photo} placeholder="תמונת שער מלאה — בכלי שבראש העמוד" style={{ position: "absolute", inset: 0 }} />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.28) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 48%, rgba(0,0,0,.62) 100%)" }} />
        </>
      )}
      <div className="absolute flex items-start justify-between" style={{ top: "13mm", insetInline: `${g.m + 1}mm`, color: fg, fontSize: 11, fontWeight: 500 }}>
        <div className="flex w-full" style={{ justifyContent: logoJustify(t) }}>
          <StudioMark t={t} logoUrl={p.settings?.logoUrl} name={p.settings?.businessName} heightMm={10} onDark={onPhoto} style={{ fontFamily: t.body, fontSize: 11, fontWeight: 500 }} />
        </div>
        <span className="nums shrink-0">{[quoteTitle(f.type).replace("הצעת מחיר ל", "הצעה ל"), f.date?.getFullYear()].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="absolute" style={{ insetInline: `${g.m - 1}mm`, bottom: "20mm", color: fg }}>
        {lines.map((l, i) => (
          <h1 key={i} style={{ fontFamily: t.head, fontWeight: i === 0 ? t.wHead : t.wLight, fontSize: size, lineHeight: 0.78 }}>
            {l}
          </h1>
        ))}
        <div className="nums flex flex-wrap" style={{ marginTop: "7mm", gap: "4mm", fontSize: 13, fontWeight: 300, opacity: 0.9 }}>
          {[f.dateShort, f.place, f.guests].filter(Boolean).map((x, i) => (
            <span key={i} className="flex gap-[4mm]">
              {i > 0 && <span>—</span>}
              {x}
            </span>
          ))}
        </div>
        {meta.line && (
          <p className="nums" style={{ marginTop: "3mm", fontSize: 10, opacity: 0.7 }}>
            {meta.line}
          </p>
        )}
      </div>
      {!onPhoto && p.palette.shades.length > 0 && (
        <div className="absolute flex" style={{ top: "34mm", insetInline: `${g.m}mm`, height: "9mm" }}>
          {p.palette.shades.map((s) => (
            <span key={s.name} className="flex-1" style={{ background: s.swatch ?? "#fff", borderBlock: `0.5px solid ${t.hair}` }} />
          ))}
        </div>
      )}
    </div>
  );
}

function StudioCover({ t, g, photo, ...p }: CoverProps) {
  const f = eventFacts({ t, g, ...p } as Parts);
  const meta = coverMeta({ t, g, ...p } as Parts);
  const facts: [string, string][] = (
    [
      ["תאריך", f.dateShort],
      ["מקום", f.venue],
      ["אזורים", p.event?.zonesLabel && p.event.zonesLabel !== f.venue ? p.event.zonesLabel : ""],
      ["אורחים", p.event?.guests ? String(p.event.guests) : ""],
      [p.seating.tables > 0 ? "שולחנות" : "מקומות", f.tables],
    ] as [string, string][]
  ).filter(([, v]) => v);
  const lines = nameLines(f.client || "");
  return (
    <div className="absolute z-[2] grid" style={{ top: `${g.top + 4}mm`, bottom: `${g.bottom + 2}mm`, insetInline: `${g.m}mm`, gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridTemplateRows: "auto minmax(0, 1fr) auto", columnGap: "4mm" }}>
      <div className="flex flex-col" style={{ gridColumn: "1 / 9" }}>
        <div className="flex" style={{ justifyContent: logoJustify(t), marginBottom: "6mm" }}>
          <StudioMark t={t} logoUrl={p.settings?.logoUrl} name={p.settings?.businessName} heightMm={11} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 500, color: t.accent }}>{quoteTitle(f.type)}</span>
        <h1 style={{ marginTop: "4mm", fontFamily: t.head, fontWeight: t.wLight, fontSize: lines.some((l) => l.length > 9) ? 64 : 92, lineHeight: 0.95, letterSpacing: -1 }}>
          {lines.map((l, i) => (
            <span key={i} className="block">
              {l}
            </span>
          ))}
        </h1>
      </div>
      <dl className="flex flex-col self-end" style={{ gridColumn: "9 / 13", borderTop: `0.5px solid ${t.rule}` }}>
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between" style={{ gap: "3mm", borderBottom: `0.5px solid ${t.rule}`, padding: "2.4mm 0", fontSize: 11 }}>
            <dt style={{ color: t.muted }}>{k}</dt>
            <dd className="nums text-end" style={{ fontWeight: 500 }}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid min-h-0" style={{ gridColumn: "1 / 13", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", columnGap: "4mm", marginTop: "12mm" }}>
        {photo !== undefined ? (
          <>
            <div style={{ gridColumn: "1 / 3" }}>
              <Palette t={t} shades={p.palette.shades} form="squares" />
            </div>
            <PhotoFrame t={t} photo={photo} placeholder="תמונת שער — בכלי שבראש העמוד" style={{ gridColumn: p.palette.shades.length ? "3 / 13" : "1 / 13", height: "100%" }} />
          </>
        ) : (
          <div className="self-end" style={{ gridColumn: "1 / 13" }}>
            <Palette t={t} shades={p.palette.shades} form="chips" />
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between" style={{ gridColumn: "1 / 13", marginTop: "6mm", fontSize: 10, color: t.soft }}>
        <span>{p.settings?.businessName}</span>
        <span dir="ltr" className="nums" style={{ fontFamily: t.mono, fontSize: 9.5 }}>
          {meta.line}
        </span>
      </div>
    </div>
  );
}

/** The colour cover — the accent as a lit field with grain, the same in every direction but its
 *  type. */
function GradientCover({ t, g, ...p }: Parts) {
  const f = eventFacts({ t, g, ...p } as Parts);
  const meta = coverMeta({ t, g, ...p } as Parts);
  const a = t.style.accent;
  const centre = t.style.logoPos === "center" || t.dir === "stationery";
  const big = t.dir === "lookbook" ? 150 : t.dir === "studio" ? 76 : 60;
  return (
    <div className="absolute inset-0 z-[2] overflow-hidden" style={{ background: `radial-gradient(70% 50% at 12% 8%, ${mixHex(a, "#f6e7c8", 0.62)} 0%, transparent 68%), radial-gradient(80% 60% at 92% 100%, ${mixHex(a, "#000000", 0.38)} 0%, transparent 70%), linear-gradient(170deg, ${mixHex(a, "#ffffff", 0.22)} 0%, ${a} 55%, ${mixHex(a, "#000000", 0.18)} 100%)` }}>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", opacity: 0.24, mixBlendMode: "overlay" }}
      />
      <div
        className="absolute inset-0 flex flex-col"
        style={{ gap: 10, padding: `${g.m + 4}mm ${g.m + 2}mm ${g.m + 4}mm`, background: "linear-gradient(to bottom, rgba(20,14,10,.18), rgba(20,14,10,0) 30%, rgba(20,14,10,.08) 55%, rgba(20,14,10,.45))", alignItems: centre ? "center" : "stretch", textAlign: centre ? "center" : "start", color: "#fff" }}
      >
        <div className="flex w-full" style={{ justifyContent: logoJustify(t) }}>
          <StudioMark t={t} logoUrl={p.settings?.logoUrl} name={p.settings?.businessName} heightMm={13} onDark />
        </div>
        <span className="flex-1" />
        <span style={{ fontFamily: t.body, fontSize: 13, fontWeight: 600, opacity: 0.9 }}>{quoteTitle(f.type)}</span>
        <h1 style={{ fontFamily: t.head, fontWeight: t.wLight, fontSize: big, lineHeight: t.dir === "lookbook" ? 0.82 : 1.05, textWrap: "balance" }}>{f.client}</h1>
        <p className="nums" style={{ fontFamily: t.head, fontWeight: t.wLight, fontSize: 18, lineHeight: 1.5, opacity: 0.88 }}>
          {[f.dateLong, f.place, f.guests].filter(Boolean).join(" · ")}
        </p>
        <span style={{ flex: 0.35 }} />
        <div className="nums flex w-full justify-between" style={{ gap: 12, borderTop: "1px solid rgba(255,255,255,.35)", paddingTop: 10, fontFamily: t.body, fontSize: 11.5, opacity: 0.85 }}>
          <span>{p.settings?.businessName}</span>
          <span>{meta.line}</span>
        </div>
      </div>
    </div>
  );
}

function mixHex(a: string, b: string, k: number) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (v: number, s: number) => (v >> s) & 255;
  return "#" + [16, 8, 0].map((s) => Math.round(ch(x, s) + (ch(y, s) - ch(x, s)) * k).toString(16).padStart(2, "0")).join("");
}

// ── The concept ────────────────────────────────────────────────────────────────────────────────

function Concept(p: Parts & { n: number; photo: DocPhoto | null }) {
  const { t, g, layout, palette, photo, n, edit } = p;
  const text = layout.concept.trim();
  const shown = photo ?? (edit ? null : undefined);
  const materials = [layout.paletteNote.trim(), palette.cloths.length ? `מפות: ${palette.cloths.join(", ")}` : ""].filter(Boolean);
  const box: CSSProperties = { top: `${g.top}mm`, bottom: `${g.bottom}mm`, insetInline: `${g.m}mm` };

  if (t.dir === "stationery")
    return (
      <div className="absolute z-[2] flex flex-col items-center text-center" style={box}>
        <SectionHeading t={t} n={n} title="הקונספט" />
        {text && <p style={{ marginTop: "7mm", maxWidth: "132mm", fontFamily: t.head, fontSize: text.length > 380 ? 16 : 19.5, lineHeight: 1.75, color: t.soft, textWrap: "pretty", whiteSpace: "pre-line" }}>{text}</p>}
        {shown !== undefined && <PhotoFrame t={t} photo={shown} placeholder="תמונת השראה — בכלי שבראש העמוד" shape="arch" outline style={{ marginTop: "10mm", width: "92mm", flex: "1 1 0", minHeight: "40mm", maxHeight: "122mm" }} />}
        {shown === undefined && <span className="flex-1" />}
        <div style={{ marginTop: "10mm" }}>
          <Palette t={t} shades={palette.shades} />
        </div>
        {materials.map((m) => (
          <p key={m} style={{ marginTop: "5mm", fontSize: 13.5, color: t.muted }}>
            {m}
          </p>
        ))}
      </div>
    );

  if (t.dir === "lookbook") {
    const withPhoto = shown !== undefined;
    return (
      <div className="absolute inset-0 z-[2]">
        {withPhoto && <PhotoFrame t={t} photo={shown} placeholder="השראה — לאורך כל העמוד" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "47%" }} />}
        <div className="absolute flex flex-col" style={{ top: `${g.top + 1}mm`, bottom: `${g.bottom + 2}mm`, right: `${g.m - 1}mm`, left: withPhoto ? "calc(47% + 10mm)" : `${g.m}mm` }}>
          <span className="nums" style={{ fontFamily: t.head, fontSize: 44, lineHeight: 1, color: t.accent }}>
            {chapter(t, n)}
          </span>
          <h2 style={{ marginTop: "2mm", fontFamily: t.head, fontWeight: t.wHead, fontSize: 96, lineHeight: 0.82 }}>הקונספט</h2>
          {text && <p style={{ marginTop: "8mm", fontSize: text.length > 420 ? 12.5 : 14.5, fontWeight: 300, lineHeight: 1.75, color: t.soft, textWrap: "pretty", whiteSpace: "pre-line" }}>{text}</p>}
          <span className="flex-1" />
          {palette.shades.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 500, color: t.muted, marginBottom: "3mm" }}>סיפור הצבע</span>}
          <Palette t={t} shades={palette.shades.slice(0, 6)} />
          {materials.map((m) => (
            <p key={m} style={{ marginTop: "4mm", fontSize: 11.5, fontWeight: 300, color: t.soft, lineHeight: 1.6 }}>
              {m}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute z-[2] grid content-start" style={{ ...box, gridTemplateColumns: "repeat(12, minmax(0, 1fr))", columnGap: "4mm" }}>
      <div style={{ gridColumn: "1 / 13" }}>
        <SectionHeading t={t} n={n} title="קונספט" sub="פלטה, חומרים ותחושה" />
      </div>
      {text && <p style={{ gridColumn: shown !== undefined ? "1 / 8" : "1 / 13", marginTop: "8mm", fontWeight: 300, fontSize: text.length > 420 ? 14 : 17, lineHeight: 1.65, textWrap: "pretty", whiteSpace: "pre-line" }}>{text}</p>}
      {shown !== undefined && <PhotoFrame t={t} photo={shown} placeholder="השראה" style={{ gridColumn: "8 / 13", gridRow: text ? "2 / 4" : "2 / 3", marginTop: "8mm", height: "118mm" }} />}
      <div style={{ gridColumn: shown !== undefined ? "1 / 8" : "1 / 13", marginTop: "10mm" }}>
        <Palette t={t} shades={palette.shades} />
      </div>
      {materials.length > 0 && (
        <div className="flex flex-col" style={{ gridColumn: "1 / 13", marginTop: "12mm", borderTop: `1.2px solid ${t.text}` }}>
          {materials.map((m) => (
            <p key={m} style={{ padding: "2.6mm 0", fontSize: 11.5, borderBottom: `0.5px solid ${t.rule}` }}>
              {m}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── The sketch ─────────────────────────────────────────────────────────────────────────────────

function SketchBlock({ t, seating, n, title, w, h, children }: Parts & { n: number | null; title: string; w: number; h: number; children: ReactNode }) {
  const heading = t.dir === "lookbook" ? "הסידור" : t.dir === "studio" ? "תוכנית הצבה" : "סידור האולם";
  const legend = [seating.tables > 0 ? `${seating.tables} ${seating.tables === 1 ? "שולחן" : "שולחנות"}` : "", seating.seats > 0 ? `${seating.seats} מקומות ישיבה` : ""].filter(Boolean);
  const frame: CSSProperties =
    t.dir === "stationery" ? { border: `0.7px solid ${t.accent}`, padding: "3mm", background: "#fff" } : t.dir === "studio" ? { border: `0.8px solid ${t.text}`, background: "#fbfaf7" } : {};
  return (
    <div className={t.dir === "stationery" ? "flex flex-col items-center text-center" : ""}>
      <SectionHeading t={t} n={n} title={n !== null ? heading : title} sub={n !== null ? title || (t.dir === "studio" ? "ללא קנה מידה" : "מתוך העיצוב") : undefined} size={n !== null ? "lg" : "sm"} />
      <div className="flex justify-center" style={{ marginTop: "7mm", ...frame }}>
        <div style={{ width: `${w}mm`, height: `${h}mm` }}>{children}</div>
      </div>
      {legend.length > 0 && (
        <p className="nums" style={{ marginTop: "5mm", fontSize: 13, color: t.soft }}>
          {legend.join(" · ")}
        </p>
      )}
      <p style={{ marginTop: "1.5mm", fontSize: 11, color: t.muted }}>הסקיצה להמחשה — המיקום הסופי ייקבע מול האולם.</p>
    </div>
  );
}

// ── An area ────────────────────────────────────────────────────────────────────────────────────

function SectionOpener({ p, s, n, photos, priced, perTable, itemized }: { p: Parts; s: ResolvedSection; n: number; photos: DocPhoto[]; priced: boolean; perTable: boolean; itemized: boolean }) {
  const { t, g } = p;
  const amount = priced ? formatPrice(s.subtotal) : undefined;
  const items = s.lines.length;
  const sub = s.kind === "kit" ? (perTable ? `${items} פריטים על כל שולחן` : `${items} פריטים`) : `${items} ${items === 1 ? "פריט" : "פריטים"}`;
  const heading = <SectionHeading t={t} n={n} title={s.title} sub={sub} amount={amount} />;
  const set = <PhotoSet t={t} photos={photos} widthMm={g.w} bleedMm={t.dir === "lookbook" ? g.m : 0} />;
  const note = s.note && (
    <p style={{ marginTop: "5mm", fontSize: t.dir === "stationery" ? 15 : 13.5, fontWeight: t.dir === "stationery" ? 400 : 300, lineHeight: 1.7, color: t.soft, whiteSpace: "pre-line", textWrap: "pretty", textAlign: t.dir === "stationery" ? "center" : "start", maxWidth: t.dir === "stationery" ? "128mm" : undefined, marginInline: t.dir === "stationery" ? "auto" : undefined }}>
      {s.note}
    </p>
  );
  const gap = <div style={{ height: `${6 * t.k}mm` }} />;

  let listHead: ReactNode = null;
  if (itemized) listHead = <ItemizedHead t={t} />;
  else if (t.dir === "stationery") {
    listHead = (
      <div className="flex items-center justify-center gap-[10px]" style={{ marginTop: "7mm", marginBottom: "3mm" }}>
        <span style={{ width: "14mm", height: 0.7, background: t.accent }} />
        <span style={{ fontSize: 12, color: t.accent }}>{perTable ? "על כל שולחן" : "מה כולל"}</span>
        <span style={{ width: "14mm", height: 0.7, background: t.accent }} />
      </div>
    );
  } else if (t.dir === "studio") {
    listHead = (
      <div className="grid" style={{ marginTop: "7mm", gridTemplateColumns: ".6fr 5fr 2fr 4fr", gap: "4mm", padding: "2mm 0", fontSize: 8.5, color: t.muted, borderTop: `1.2px solid ${t.text}`, borderBottom: `0.5px solid ${t.rule}` }}>
        <span>#</span>
        <span>{perTable ? "פריט — לכל שולחן" : "פריט"}</span>
        <span>כמות</span>
        <span>גוון / גימור</span>
      </div>
    );
  } else {
    listHead = <p style={{ marginTop: "7mm", marginBottom: "1mm", fontSize: 10.5, fontWeight: 500, color: t.muted }}>{perTable ? "על כל שולחן" : "מה כולל"}</p>;
  }

  if (t.dir === "lookbook")
    return (
      <div>
        {photos.length > 0 && (
          <>
            {set}
            {gap}
          </>
        )}
        {heading}
        {note}
        {listHead}
      </div>
    );
  return (
    <div>
      {heading}
      {photos.length > 0 && <div style={{ marginTop: `${6 * t.k}mm` }}>{set}</div>}
      {note}
      {listHead}
    </div>
  );
}

/** A spec line in the client's words. In a kit it reads per table ("2 פמוטי פלורידה" under
 *  "על כל שולחן"); elsewhere the whole amount ("6 שנדליר פרנזים", "וילון · 14.0 מ׳"). */
function SpecLine({ t, line: l, perTable, index }: { t: DocTheme; line: ResolvedLine; perTable: boolean; index: number }) {
  const amount = perTable ? (l.perUnit ?? l.quantity) : l.quantity;
  const counted = l.priceUnit === "unit";
  const qty = counted ? (amount !== 1 ? String(amount) : "") : formatAmount(amount, l.priceUnit);
  const gift = l.gift && <GiftMark t={t} />;

  if (t.dir === "stationery")
    return (
      <div className="flex flex-col items-center text-center" style={{ padding: `${1.6 * t.k}mm 0` }}>
        <span style={{ fontFamily: t.head, fontSize: 19 * (t.airy ? 1 : 0.92), lineHeight: 1.2 }}>
          {l.label}
          {gift}
        </span>
        {(qty || l.detail) && (
          <span className="nums" style={{ fontSize: 12.5, color: t.muted }}>
            {[counted && qty ? `× ${qty}` : qty, l.detail].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
    );
  if (t.dir === "lookbook")
    return (
      <div className="flex items-baseline" style={{ gap: "4mm", borderTop: `0.7px solid ${t.text}`, padding: `${2.2 * t.k}mm 0`, fontSize: 12 }}>
        <span className="nums" style={{ width: "7mm", fontFamily: t.head, fontSize: 18, lineHeight: 1, color: t.accent }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1" style={{ fontWeight: 500 }}>
          {l.label}
          {gift}
        </span>
        <span className="nums" style={{ fontWeight: 300, color: t.muted }}>
          {[l.detail, qty && (counted ? `× ${qty}` : qty)].filter(Boolean).join(" · ")}
        </span>
      </div>
    );
  return (
    <div className="grid items-baseline" style={{ gridTemplateColumns: ".6fr 5fr 2fr 4fr", gap: "4mm", padding: `${2.6 * t.k}mm 0`, fontSize: 11.5, borderBottom: `0.5px solid ${t.rule}` }}>
      <span dir="ltr" style={{ fontFamily: t.mono, fontSize: 10, color: t.muted, textAlign: "right" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span style={{ fontWeight: 500 }}>
        {l.label}
        {gift}
      </span>
      <span className="nums">{qty || "1"}</span>
      <span style={{ color: t.soft }}>{l.detail}</span>
    </div>
  );
}

function GiftMark({ t }: { t: DocTheme }) {
  return (
    <span className="ms-2 inline-block align-middle" style={{ border: `1px solid ${t.accent}`, color: t.accent, padding: "0 6px", fontFamily: t.body, fontSize: 10.5, fontWeight: 700, lineHeight: "17px", borderRadius: t.dir === "stationery" ? 999 : 0 }}>
      מתנה
    </span>
  );
}

const ITEM_COLS = "minmax(0,1fr) 20mm 26mm 24mm";

function ItemizedHead({ t }: { t: DocTheme }) {
  return (
    <div className="grid" style={{ marginTop: "6mm", gridTemplateColumns: ITEM_COLS, gap: "2mm", padding: "1.6mm 0", fontSize: 10.5, fontWeight: 600, color: t.muted, borderBottom: `${t.dir === "stationery" ? 0.7 : 1.2}px solid ${t.text}` }}>
      <span>פריט</span>
      <span>כמות</span>
      <span>מחיר ליח׳</span>
      <span className="text-end">סה״כ</span>
    </div>
  );
}

function ItemizedLine({ t, line: l }: { t: DocTheme; line: ResolvedLine }) {
  return (
    <div className="grid items-baseline" style={{ gridTemplateColumns: ITEM_COLS, gap: "2mm", padding: `${1.5 * t.k}mm 0`, fontSize: 12.5, borderBottom: `0.5px solid ${t.hair}` }}>
      <span className="min-w-0">
        {l.label}
        {l.detail && <span style={{ color: t.muted }}> — {l.detail}</span>}
        {l.perUnit !== undefined && l.perUnit !== 1 && (
          <span className="nums" style={{ color: t.muted }}>
            {" "}
            · {l.priceUnit === "unit" ? l.perUnit : formatAmount(l.perUnit, l.priceUnit)} לשולחן
          </span>
        )}
      </span>
      <span className="nums">{l.priceUnit === "unit" ? l.quantity : formatAmount(l.quantity, l.priceUnit)}</span>
      <span className="nums" style={{ color: t.soft }}>
        {l.priced ? formatUnitPrice(l.unitPrice, l.priceUnit) : "—"}
      </span>
      <span className="nums text-end" style={{ fontWeight: 600 }}>
        {l.gift ? "מתנה" : l.priced ? formatPrice(l.lineTotal) : "—"}
      </span>
    </div>
  );
}

// ── The price ──────────────────────────────────────────────────────────────────────────────────

function Summary({ t, layout, sections, figures, settings, issuedAt, n }: Parts & { n: number }) {
  const pct = Math.round(figures.vatRate * 100);
  const gifts = sections.flatMap((s) => s.lines.filter((l) => l.gift).map((l) => l.label));
  const showDiscount = discountShown(layout, figures);
  // Per-area amounts only when the quote shows prices; "total" lists what the price includes.
  const style = layout.priceMode === "total" ? "totals" : t.style.prices;
  const rows = sections.map((s, i) => ({ key: s.key, n: String(i + 1).padStart(2, "0"), name: s.title, sub: `${s.lines.length} ${s.lines.length === 1 ? "פריט" : "פריטים"}`, items: s.lines.length, amt: formatPrice(s.subtotal) }));
  const validDays = settings?.quoteValidityDays ?? 0;
  const validUntil = issuedAt !== null && validDays > 0 ? new Date(issuedAt + validDays * DAY_MS) : null;
  const vatLine = [
    figures.vatRate > 0 ? (figures.vatIncluded ? `כולל מע״מ ${pct}% (${formatPrice(figures.vat)})` : `מע״מ ${pct}% נוסף על המחיר`) : null,
    validUntil ? `ההצעה בתוקף עד ${longDate(validUntil)}` : validDays > 0 ? `ההצעה בתוקף ${validDays} יום` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const breakdown: [string, string][] = [];
  if (showDiscount) {
    breakdown.push(["לפי מחירון", formatPrice(figures.catalogSum)]);
    breakdown.push([figures.discount > 0 ? "הנחה" : "תוספת", `${figures.discount > 0 ? "−" : "+"}${formatPrice(Math.abs(figures.discount))}`]);
  }
  if (!figures.vatIncluded && figures.vatRate > 0) {
    breakdown.push(["לפני מע״מ", formatPrice(figures.net)]);
    breakdown.push([`מע״מ ${pct}%`, formatPrice(figures.vat)]);
  }
  const center = t.dir === "stationery";
  const heading = t.dir === "lookbook" ? "ההשקעה" : t.dir === "studio" ? "תמחור" : "ההצעה";

  const list =
    style === "totals" ? (
      <div className="flex flex-col" style={{ gap: 2, alignItems: center ? "center" : "stretch" }}>
        <span style={{ fontSize: 11.5, color: t.muted, marginBottom: "2mm" }}>ההצעה כוללת:</span>
        {rows.map((r) => (
          <div key={r.key} className="flex items-baseline" style={{ gap: 10, padding: `${1.4 * t.k}mm 0`, fontFamily: t.head, fontWeight: t.dir === "lookbook" ? t.wHead : t.wLight, fontSize: t.dir === "lookbook" ? 26 : 17 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.accent, transform: "translateY(-3px)", flexShrink: 0 }} />
            {r.name}
          </div>
        ))}
      </div>
    ) : style === "dots" ? (
      <div className="flex flex-col" style={{ gap: `${4.5 * t.k}mm` }}>
        {rows.map((r) => (
          <div key={r.key} className="flex items-baseline" style={{ gap: 10 }}>
            <span className="flex flex-col">
              <span style={{ fontFamily: t.head, fontWeight: t.wHead, fontSize: t.dir === "lookbook" ? 24 : 19, lineHeight: 1.15 }}>{r.name}</span>
              <span className="nums" style={{ fontSize: 11.5, color: t.muted }}>
                {r.sub}
              </span>
            </span>
            <span className="flex-1" style={{ borderBottom: `1px dotted ${t.soft2}`, transform: "translateY(-6px)" }} />
            <span className="nums" style={{ fontSize: 16 }}>
              {r.amt}
            </span>
          </div>
        ))}
      </div>
    ) : t.dir === "lookbook" ? (
      <div className="flex flex-col" style={{ borderBottom: `0.7px solid ${t.text}` }}>
        {rows.map((r) => (
          <div key={r.key} className="flex items-center" style={{ gap: "5mm", borderTop: `0.7px solid ${t.text}`, padding: `${3.6 * t.k}mm 0` }}>
            <span className="nums" style={{ width: "9mm", fontFamily: t.head, fontSize: 22, lineHeight: 1, color: t.accent }}>
              {r.n}
            </span>
            <span className="flex flex-1 flex-col">
              <span style={{ fontSize: 15, fontWeight: 500 }}>{r.name}</span>
              <span className="nums" style={{ fontSize: 11, fontWeight: 300, color: t.muted }}>
                {r.sub}
              </span>
            </span>
            <span className="nums" style={{ fontFamily: t.head, fontSize: 34, lineHeight: 1 }}>
              {r.amt}
            </span>
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-col">
        <div className="grid" style={{ gridTemplateColumns: ".6fr 5fr 2fr 2.4fr", gap: "4mm", padding: "2.2mm 0", fontSize: 8.5, color: t.muted, borderBottom: `0.5px solid ${t.rule}`, ...(t.dir !== "studio" ? { background: t.tint, padding: "2.2mm 3mm" } : {}) }}>
          <span>#</span>
          <span>אזור</span>
          <span>פריטים</span>
          <span className="text-end">סכום</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className="grid items-baseline" style={{ gridTemplateColumns: ".6fr 5fr 2fr 2.4fr", gap: "4mm", padding: `${3.2 * t.k}mm ${t.dir !== "studio" ? "3mm" : "0"}`, borderBottom: `0.5px solid ${t.rule}` }}>
            <span dir="ltr" style={{ fontFamily: t.mono, fontSize: 10, color: t.muted, textAlign: "right" }}>
              {r.n}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</span>
            <span className="nums" style={{ fontSize: 12, color: t.soft }}>
              {r.items}
            </span>
            <span className="nums text-end" style={{ fontFamily: t.mono, fontSize: 13 }}>
              {r.amt}
            </span>
          </div>
        ))}
      </div>
    );

  const giftLine = gifts.length > 0 && (
    <p style={{ marginTop: "5mm", fontSize: 12.5, color: t.soft, textAlign: center ? "center" : "start" }}>
      {t.dir === "stationery" ? "ומאיתנו, במתנה: " : "מתנה מהסטודיו, ללא חיוב: "}
      {gifts.join(", ")}
    </p>
  );

  let totalBlock: ReactNode;
  if (t.dir === "stationery")
    totalBlock = (
      <div className="flex flex-col items-center text-center" style={{ marginTop: `${14 * t.k}mm` }}>
        <Ornament t={t} width={30} />
        {breakdown.length > 0 && (
          <p className="nums" style={{ marginTop: "5mm", fontSize: 12.5, color: t.muted }}>
            {breakdown.map(([k, v]) => `${k} ${v}`).join(" · ")}
          </p>
        )}
        <p style={{ marginTop: "3mm", fontSize: 14, color: t.soft }}>{showDiscount ? "סך הכול לתשלום לאחר הנחה" : "סך הכול לתשלום"}</p>
        <p className="nums" style={{ marginTop: "1mm", fontFamily: t.head, fontSize: 58, lineHeight: 1, color: t.text }}>
          {formatPrice(figures.total)}
        </p>
        {vatLine && <p style={{ marginTop: "3mm", fontSize: 11.5, color: t.muted }}>{vatLine}</p>}
      </div>
    );
  else if (t.dir === "lookbook")
    totalBlock = (
      <div className="flex items-end justify-between" style={{ marginTop: `${16 * t.k}mm`, gap: "8mm" }}>
        <div className="nums flex flex-col" style={{ gap: "1.5mm", fontSize: 11.5, fontWeight: 300, color: t.soft, paddingBottom: "4mm" }}>
          {breakdown.map(([k, v]) => (
            <span key={k}>
              {k} {v}
            </span>
          ))}
          {vatLine && <span>{vatLine}</span>}
        </div>
        <div className="flex flex-col items-end">
          <span style={{ fontSize: 12, fontWeight: 500 }}>סך הכול</span>
          <span className="nums" style={{ fontFamily: t.head, fontWeight: t.wLight, fontSize: formatPrice(figures.total).length > 9 ? 110 : 150, lineHeight: 0.8, color: t.accent }}>
            {formatPrice(figures.total)}
          </span>
        </div>
      </div>
    );
  else
    totalBlock = (
      <>
        {breakdown.map(([k, v]) => (
          <div key={k} className="grid" style={{ gridTemplateColumns: ".6fr 5fr 2fr 2.4fr", gap: "4mm", padding: "2mm 0", fontSize: 11.5, color: k === "הנחה" ? t.accent : t.soft }}>
            <span />
            <span>{k}</span>
            <span />
            <span className="nums text-end" style={{ fontFamily: t.mono }}>
              {v}
            </span>
          </div>
        ))}
        <div className="grid" style={{ marginTop: `${10 * t.k}mm`, gridTemplateColumns: "repeat(12, minmax(0, 1fr))", columnGap: "4mm" }}>
          <div className="flex flex-col justify-between" style={{ gridColumn: "6 / 13", background: t.text, color: t.paper, padding: "6mm 6mm 5mm", minHeight: "44mm", gap: "3mm" }}>
            <span style={{ fontSize: 11 }}>{showDiscount ? "סך הכול לתשלום לאחר הנחה" : "סך הכול לתשלום"}</span>
            <span dir="ltr" className="nums" style={{ fontFamily: t.head, fontWeight: t.wLight, fontSize: 56, lineHeight: 1, textAlign: "left" }}>
              {formatPrice(figures.total)}
            </span>
            {vatLine && <span style={{ fontSize: 9.5, opacity: 0.7 }}>{vatLine}</span>}
          </div>
        </div>
      </>
    );

  return (
    <div style={{ paddingTop: `${(t.airy ? 0 : 10) * t.k}mm` }}>
      <SectionHeading t={t} n={n} title={heading} sub={t.dir === "studio" ? (figures.vatIncluded ? "מחירים בשקלים, כולל מע״מ" : "מחירים בשקלים, לפני מע״מ") : undefined} />
      <div style={{ marginTop: `${9 * t.k}mm` }}>{list}</div>
      {giftLine}
      {totalBlock}
    </div>
  );
}

// ── Terms, the greeting, the signatures ──────────────────────────────────────────────────────

function Terms({ t, terms }: { t: DocTheme; terms: string[] }) {
  const two = t.dir !== "stationery" && terms.length > 3;
  return (
    <ol
      className={two ? "grid" : "flex flex-col"}
      style={{ marginTop: `${8 * t.k}mm`, listStyle: "none", padding: 0, gap: two ? "4mm 8mm" : `${3 * t.k}mm`, gridTemplateColumns: two ? "1fr 1fr" : undefined, maxWidth: t.dir === "stationery" ? "140mm" : undefined, marginInline: t.dir === "stationery" ? "auto" : undefined }}
    >
      {terms.map((x, i) => (
        <li key={i} className="flex" style={{ gap: "3mm", fontSize: t.dir === "stationery" ? 14 : 12.5, fontWeight: t.dir === "lookbook" ? 300 : 400, lineHeight: 1.6, color: t.soft, ...(t.dir === "studio" ? { borderTop: `0.5px solid ${t.rule}`, paddingTop: "2.4mm" } : {}) }}>
          <span className="nums shrink-0" style={{ width: t.dir === "stationery" ? "6mm" : undefined, fontFamily: t.dir === "studio" ? t.mono : t.head, fontSize: t.dir === "studio" ? 10 : 16, lineHeight: t.dir === "studio" ? 1.9 : 1.2, color: t.accent }}>
            {chapter(t, i + 1)}
          </span>
          <span>{x}</span>
        </li>
      ))}
    </ol>
  );
}

function Signatures({ t, settings, event, layout }: Parts) {
  const studioName = settings?.ownerName || settings?.businessName;
  const closing = layout.closing.trim() || DEFAULT_CLOSING;
  const client = event?.clientName ?? "";
  const center = t.dir === "stationery";
  const sigImg = settings?.signatureUrl && (
    // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
    <img src={settings.signatureUrl} alt="חתימת הסטודיו" style={{ maxHeight: "14mm", width: "auto", maxWidth: "58mm", objectFit: "contain" }} />
  );
  const signers = [
    { title: "הלקוח", name: client, note: "אני מאשר/ת את ההצעה על פרטיה ותנאיה.", img: null as ReactNode },
    { title: "הסטודיו", name: [studioName, settings?.businessName !== studioName ? settings?.businessName : null].filter(Boolean).join(" — "), note: settings?.businessNumber ? `ע.מ ${settings.businessNumber}` : "", img: sigImg },
  ];

  const greeting = (
    <div className={center ? "flex flex-col items-center text-center" : "flex flex-col"} style={{ marginTop: `${14 * t.k}mm` }}>
      <p style={{ fontFamily: t.head, fontWeight: t.wLight, fontSize: t.dir === "lookbook" ? 64 : t.dir === "studio" ? 22 : 32, lineHeight: t.dir === "lookbook" ? 0.9 : 1.25, maxWidth: t.dir === "studio" ? "120mm" : undefined }}>{closing}</p>
      {studioName && <p style={{ marginTop: "2mm", fontFamily: t.head, fontSize: t.dir === "lookbook" ? 18 : 19, color: t.accent }}>{studioName}</p>}
    </div>
  );

  const box = t.style.sign === "box";
  return (
    <div>
      {greeting}
      <div className="grid" style={{ marginTop: `${12 * t.k}mm`, gridTemplateColumns: "1fr 1fr", gap: box ? "5mm" : "14mm", ...(t.dir === "studio" && !box ? { borderTop: `1.2px solid ${t.text}`, paddingTop: "4mm" } : {}) }}>
        {signers.map((s) =>
          box ? (
            <div key={s.title} className="flex flex-col" style={{ gap: "2mm", minHeight: "40mm", border: `0.7px solid ${t.rule}`, background: t.tint, padding: "4mm" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.accent }}>{s.title}</span>
              <span style={{ fontSize: 11, color: t.soft }}>{s.name}</span>
              {s.note && <span style={{ fontSize: 10, color: t.muted }}>{s.note}</span>}
              <span className="flex-1" />
              <div className="grid items-end" style={{ gridTemplateColumns: "14mm 1fr", rowGap: "4mm", fontSize: 9.5, color: t.muted }}>
                <span>חתימה</span>
                <span className="flex items-end justify-center" style={{ height: "12mm", borderBottom: `0.5px solid ${t.text}` }}>
                  {s.img}
                </span>
                <span>תאריך</span>
                <span style={{ height: "6mm", borderBottom: `0.5px solid ${t.text}` }} />
              </div>
            </div>
          ) : (
            <div key={s.title}>
              {s.title === "הלקוח" && <p style={{ fontSize: 11, color: t.muted, marginBottom: "1mm" }}>{s.note}</p>}
              {s.title !== "הלקוח" && <p style={{ fontSize: 11, marginBottom: "1mm" }}>&nbsp;</p>}
              <div className="flex items-end justify-center" style={{ height: "14mm", borderBottom: `0.7px solid ${t.text}` }}>
                {s.img}
              </div>
              <p style={{ marginTop: "2mm", fontSize: 11.5, color: t.muted }}>
                {s.title === "הלקוח" ? `${s.name || "הלקוח/ה"} · חתימה ותאריך` : s.name || "הסטודיו"}
              </p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

// ── The designer's tools (edit mode) ─────────────────────────────────────────────────────────────

const toolsProps = { [NO_CAPTURE]: "" };

/** A whole page's photo, from its top corner. */
function PageTools({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="no-print absolute end-3 top-3 z-20 flex items-center gap-0.5 rounded-pill bg-surface/90 px-1 shadow-floating" {...toolsProps}>
      <Popover label={label} icon={ImagePlus} trigger="icon" side="bottom" panelClassName="w-[380px]">
        {children}
      </Popover>
    </div>
  );
}

/** A section's tools: a row in the gap ABOVE its title, at the end side — clear of the line menus. */
function SectionTools({ section: s, edit, first, last }: { section: ResolvedSection; edit: QuoteEdit; first: boolean; last: boolean }) {
  const order: MenuItem[] = [
    ...(first ? [] : [{ label: "הזזה למעלה", icon: ArrowUp, onSelect: () => edit.onMove(s.key, -1) }]),
    ...(last ? [] : [{ label: "הזזה למטה", icon: ArrowDown, onSelect: () => edit.onMove(s.key, 1) }]),
  ];
  return (
    <div className="no-print absolute end-0 top-0 z-10 flex items-center gap-0.5 rounded-pill bg-inset px-1" style={{ transform: "translateY(-100%)" }} {...toolsProps}>
      {s.kind !== "extras" && (
        <Popover label={`תמונות — ${s.title}`} icon={ImagePlus} trigger="icon" side="bottom" panelClassName="w-[380px]">
          {edit.photoPanel(s)}
        </Popover>
      )}
      <Popover label={`כותרת והערה — ${s.title}`} icon={PencilLine} trigger="icon" side="bottom" panelClassName="w-80">
        <div className="space-y-3">
          <TextField label="כותרת" value={s.title} onChange={(v) => edit.onTitle(s.key, v)} />
          <TextField
            label="הערה ללקוח"
            multiline
            rows={4}
            value={s.note}
            onChange={(v) => edit.onNote(s.key, v)}
            placeholder="למשל: חופת יוקרה בעיצוב קלאסי, עם וילונות בד רכים"
          />
          {s.title !== s.defaultTitle && (
            <Button variant="outline" size="sm" className="w-full justify-center" onClick={() => edit.onTitle(s.key, "")}>
              חזרה לכותרת המקורית
            </Button>
          )}
        </div>
      </Popover>
      {order.length > 0 && <Menu label={`סדר — ${s.title}`} icon={ArrowUpDown} items={order} />}
    </div>
  );
}

function LineTools({ line: l, edit, margin }: { line: ResolvedLine; edit: QuoteEdit; margin: number }) {
  return (
    <div className="no-print absolute top-0" style={{ insetInlineEnd: `-${margin - 1.5}mm` }} {...toolsProps}>
      <Menu
        label={`אפשרויות — ${l.label}`}
        items={[
          { label: l.gift ? "ביטול מתנה" : "סימון כמתנה (ללא חיוב)", icon: Gift, onSelect: () => edit.onGift(l.key, !l.gift) },
          { label: "הסתרה מההצעה", icon: EyeOff, onSelect: () => edit.onHide(l.key) },
        ]}
      />
    </div>
  );
}
