"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, EyeOff, Gift, ImagePlus, PencilLine } from "lucide-react";
import type { BusinessSettings } from "@/lib/settings/types";
import type { EventSummary } from "@/lib/events/types";
import { formatAmount, formatPrice, formatUnitPrice } from "@/lib/catalog/format";
import {
  DEFAULT_CLOSING,
  discountShown,
  quoteTitle,
  type QuoteFigures,
  type QuoteLayout,
  type ResolvedLine,
  type ResolvedSection,
} from "@/lib/quotes/layout";
import { paginate } from "@/lib/outputs/paginate";
import { Popover } from "@/components/popover";
import { Menu, type MenuItem } from "@/components/menu";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/button";
import { NO_CAPTURE } from "./quote-pdf";

// THE QUOTE AS A CLIENT RECEIVES IT — A4 pages, the same on screen, on paper and in the PDF.
//
// Written for someone who does not speak design. Modelled on two studios' own Word quotes and
// keeping what works in them: a cover with the event's facts (who, when, what kind of event, where,
// how many guests, how many tables) and its colour palette; the floor-plan sketch; then the event
// AREA by area — "עיצוב 17 שולחנות מלבניים", photographs, "על כל שולחן:" and what stands on it, which
// chairs — the extras the drawing cannot know (הובלה…), the price, the terms, a greeting and the
// studio's signature. Contact details and "התמונות להמחשה בלבד" ride on every page's footer.
// What those Word files got wrong — a spec and a price list that disagree — cannot happen here:
// every number is derived from the one drawing (lib/outputs/quote-sections.ts).
//
// The pages are REAL ELEMENTS, not a print-time flow: the PDF is built from images of them
// (./quote-pdf.ts), so the breaks are decided here — every block is measured once in an invisible
// column at the page's own width, and lib/outputs/paginate.ts packs the heights into pages.
//
// The designer's tools (edit mode only) are `no-print` AND carry NO_CAPTURE, so neither the printer
// nor the PDF ever sees them. A section's tools sit in the gap ABOVE its title; a line's "…" in the
// page's end margin beside it — never stacked in one column, where they ran into each other.
//
// ⚠ Client-facing surface. Prices yes — costs, margins and supplier data never (npm run check:costs).

export interface QuotePhoto {
  id: string;
  src: string;
  name: string;
}

export interface QuotePalette {
  shades: { name: string; swatch?: string }[];
  cloths: string[];
}

/** A floor plan for the sketch page — drawn by the caller, which holds the plan and the zones. */
export interface QuoteSketch {
  key: string;
  title: string;
  /** Height the drawing takes at the page's content width, in mm. */
  heightMm: number;
  render: (widthMm: number, heightMm: number) => ReactNode;
}

/** Present in edit mode only. */
export interface QuoteEdit {
  photoPanel: (section: ResolvedSection) => ReactNode;
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
  palette: QuotePalette;
  /** Tables as the client counts them (a joined block is one) and the seats round them. */
  seating: { tables: number; seats: number };
  sketches: QuoteSketch[];
  /** "A1B2C3-4" once issued; null = not issued (nothing printed in its place). */
  reference: string | null;
  issuedAt: number | null;
  edit?: QuoteEdit;
  pagesRef?: Ref<HTMLDivElement>;
}

type Parts = Omit<QuoteDocumentProps, "pagesRef">;

// ── Page geometry, in mm (a real CSS unit — the screen draws the page at its true trim) ─────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const HEADER = 12; // the running header on every page after the first
export const CONTENT_W = PAGE_W - 2 * MARGIN;
/** The tallest a sketch may be and still share no page with anything but its own heading. */
export const SKETCH_MAX_H = PAGE_H - 2 * MARGIN - HEADER - 22;
const PX_PER_MM = 96 / 25.4;
/** What a page's body holds. A millimetre of slack absorbs sub-pixel rounding between the
 *  measuring column and the page. */
const capacityPx = (page: number) => (PAGE_H - 2 * MARGIN - (page === 0 ? 0 : HEADER) - 1) * PX_PER_MM;

interface Atom {
  key: string;
  /** Never ends a page — carried over with what follows it (a section's heading). */
  keep?: boolean;
  render: (live: boolean) => ReactNode;
}

const DAY_MS = 86_400_000;
const longDate = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });

export function QuoteDocument({ pagesRef, ...props }: QuoteDocumentProps) {
  const { settings, event, reference } = props;
  const atoms = buildAtoms(props);

  // Measure every block in an invisible column at the page's width; pack the heights into pages.
  const measurer = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<number[] | null>(null);
  useLayoutEffect(() => {
    const el = measurer.current;
    if (!el) return;
    const read = () => {
      const hs = [...el.children].map((c) => c.getBoundingClientRect().height);
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
  const measured = heights && heights.length === atoms.length ? heights : null;
  const pages = measured ? paginate(measured, atoms.map((a) => !!a.keep), capacityPx) : [atoms.map((_, i) => i)];

  const contact = [settings?.phone, settings?.email, settings?.instagram && `@${settings.instagram}`].filter(Boolean);
  const pageLine = (n: number) =>
    ["כל התמונות להמחשה בלבד", reference ? `הצעה ${reference}` : null, pages.length > 1 ? `עמוד ${n + 1} מתוך ${pages.length}` : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <div ref={pagesRef} className="flex flex-col items-center gap-5 print:block">
      <div aria-hidden className="no-print h-0 overflow-hidden" {...{ [NO_CAPTURE]: "" }}>
        <div ref={measurer} className="invisible" style={{ width: `${CONTENT_W}mm` }}>
          {atoms.map((a) => (
            <div key={a.key}>{a.render(false)}</div>
          ))}
        </div>
      </div>

      {pages.map((indices, n) => (
        <section
          key={n}
          data-quote-page=""
          className="quote-page relative shrink-0 bg-canvas text-ink shadow-lifted"
          style={{ width: `${PAGE_W}mm`, height: `${PAGE_H}mm`, padding: `${MARGIN}mm` }}
        >
          {settings?.showBsd && (
            <span className="absolute text-[11px] font-semibold text-ink-soft" style={{ top: "6mm", insetInlineStart: `${MARGIN}mm` }}>
              בס״ד
            </span>
          )}
          {n > 0 && (
            <header className="flex items-start justify-between gap-4 border-b border-border text-[11px]" style={{ height: `${HEADER - 4}mm`, marginBottom: "4mm" }}>
              <span className="font-semibold text-ink-soft">{settings?.businessName}</span>
              <span className="text-muted">
                {quoteTitle(event?.eventType)}
                {event?.clientName ? ` · ${event.clientName}` : ""}
              </span>
            </header>
          )}
          {indices.map((i) => (
            <div key={atoms[i].key}>{atoms[i].render(true)}</div>
          ))}
          <footer className="absolute inset-x-0 text-center leading-snug" style={{ bottom: "4.5mm", paddingInline: `${MARGIN}mm` }}>
            {contact.length > 0 && (
              <p className="nums text-[10.5px] font-semibold text-ink-soft" dir="ltr">
                {contact.join("   ·   ")}
              </p>
            )}
            <p className="nums text-[10px] text-muted">{pageLine(n)}</p>
          </footer>
        </section>
      ))}
    </div>
  );
}

// ── The blocks, in reading order ─────────────────────────────────────────────────────────────

function buildAtoms(p: Parts): Atom[] {
  const { layout, sections, edit } = p;
  const priced = layout.priceMode !== "total";
  const itemized = layout.priceMode === "itemized";
  const atoms: Atom[] = [{ key: "cover", render: () => <Cover {...p} /> }];

  if (layout.sketch) {
    p.sketches.forEach((sk, i) =>
      atoms.push({
        key: `sketch:${sk.key}`,
        // The measuring column gets a box of the drawing's height, never the drawing: its plants and
        // textures carry SVG ids, and a second copy earlier in the page is the one url(#…) finds.
        render: (live) => (
          <div className="pt-6">
            <h2 className="border-b-[1.5px] border-ink pb-1.5 text-[17px] font-bold text-ink">
              {i === 0 ? "סקיצה" : sk.title}
              {i === 0 && sk.title && <span className="font-semibold text-ink-soft"> · {sk.title}</span>}
            </h2>
            <div className="mt-3 flex justify-center" style={{ height: `${sk.heightMm}mm` }}>
              {live && sk.render(CONTENT_W, sk.heightMm)}
            </div>
          </div>
        ),
      }),
    );
  }

  sections.forEach((s, si) => {
    const photos = p.photosOf(s);
    const perTable = !!s.perTable && !itemized;
    atoms.push({
      key: `head:${s.key}`,
      keep: true,
      render: (live) => (
        <div className="relative pt-9">
          {live && edit && <SectionTools section={s} edit={edit} first={si === 0} last={si === sections.length - 1} />}
          <div className="flex items-baseline justify-between gap-3 border-b-[1.5px] border-ink pb-1.5">
            <h2 className="text-[17px] font-bold leading-snug text-ink">{s.title}</h2>
            {priced && <span className="nums shrink-0 text-[14px] font-semibold text-ink">{formatPrice(s.subtotal)}</span>}
          </div>
          {photos.length > 0 && <PhotoBoard photos={photos} />}
          {s.note && <p className="mt-2.5 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft">{s.note}</p>}
          {perTable && <p className="mt-2.5 text-[13.5px] font-bold text-ink">על כל שולחן:</p>}
          {itemized && (
            <div className="mt-2 flex gap-2 border-b border-border pb-1 text-[11.5px] font-medium text-muted">
              <span className="min-w-0 flex-1">פריט</span>
              <span className="shrink-0 text-start" style={{ width: "20mm" }}>
                כמות
              </span>
              <span className="shrink-0 text-start" style={{ width: "26mm" }}>
                מחיר ליח׳
              </span>
              <span className="shrink-0 text-end" style={{ width: "24mm" }}>
                סה״כ
              </span>
            </div>
          )}
          <div className="h-1" />
        </div>
      ),
    });
    for (const l of s.lines) {
      atoms.push({
        key: `line:${l.key}`,
        render: (live) => (
          <div className="relative">
            {live && edit && <LineTools line={l} edit={edit} />}
            {itemized ? <ItemizedLine line={l} /> : <BulletLine line={l} perTable={perTable} />}
          </div>
        ),
      });
    }
    if (s.seating?.length) {
      atoms.push({
        key: `seating:${s.key}`,
        render: () => (
          <p className="pt-1.5 text-[13.5px] text-ink">
            <span className="font-bold">כסאות: </span>
            {s.seating!.join(", ")}
          </p>
        ),
      });
    }
  });

  atoms.push({ key: "summary", render: () => <Summary {...p} /> });
  const terms = (p.settings?.quoteTerms ?? "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  if (terms.length) atoms.push({ key: "terms", render: () => <Terms terms={terms} /> });
  atoms.push({ key: "sign", render: () => <Signatures {...p} /> });
  return atoms;
}

function Cover({ settings, event, venueName, palette, seating, layout, reference, issuedAt }: Parts) {
  const issued = issuedAt !== null ? new Date(issuedAt) : null;
  const validDays = settings?.quoteValidityDays ?? 0;
  const validUntil = issued && validDays > 0 ? new Date(issued.getTime() + validDays * DAY_MS) : null;
  const zones = event?.zonesLabel ?? "";
  const place = [venueName, zones && zones !== venueName ? zones : null].filter(Boolean).join(" · ");
  const guests = event?.guests ?? 0;
  const facts: [string, ReactNode][] = [];
  if (event) {
    facts.push(["לכבוד", <span key="c" className="font-bold">{event.clientName}</span>]);
    if (event.phone)
      facts.push([
        "טלפון",
        <span key="p" className="nums" dir="ltr">
          {event.phone}
        </span>,
      ]);
    if (event.date)
      facts.push([
        "תאריך האירוע",
        <span key="d" className="nums">
          {longDate(new Date(`${event.date}T12:00:00`))}
          {event.time ? ` · ${event.time}` : ""}
        </span>,
      ]);
    if (event.eventType) facts.push(["סוג האירוע", event.eventType]);
    if (place) facts.push(["מיקום", place]);
    if (guests > 0)
      facts.push([
        "כמות מוזמנים",
        <span key="g" className="nums">
          {guests}
        </span>,
      ]);
    if (seating.tables > 0)
      facts.push([
        "שולחנות",
        <span key="t" className="nums">
          {seating.tables} {seating.tables === 1 ? "שולחן" : "שולחנות"}
          {seating.seats > 0 ? ` · ${seating.seats} מקומות ישיבה` : ""}
        </span>,
      ]);
  }
  const meta = [reference && `הצעה מס׳ ${reference}`, issued && `מיום ${longDate(issued)}`, validUntil && `בתוקף עד ${longDate(validUntil)}`].filter(Boolean);

  return (
    <div>
      {/* Letterhead: the studio's mark centred, as on their own paper. */}
      <header className="flex flex-col items-center pt-2 text-center">
        {settings?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
          <img src={settings.logoUrl} alt={settings.businessName} className="h-[26mm] w-auto max-w-[80mm] object-contain" />
        ) : (
          <p className="font-display text-[30px] font-bold leading-tight text-ink">{settings?.businessName}</p>
        )}
        {settings?.businessNumber && <p className="nums mt-1 text-[11px] text-muted">ע.מ {settings.businessNumber}</p>}
      </header>

      <h1 className="mt-7 text-center font-display text-[27px] font-bold leading-tight text-ink">{quoteTitle(event?.eventType)}</h1>

      {facts.length > 0 && (
        <dl className="mx-auto mt-5 grid max-w-[140mm] grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-md border border-border px-7 py-5 text-[14.5px]">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {meta.length > 0 && <p className="nums mt-2 text-center text-[11.5px] text-muted">{meta.join(" · ")}</p>}

      {(palette.shades.length > 0 || layout.paletteNote || palette.cloths.length > 0) && (
        <div className="mt-8 text-center">
          <h2 className="text-[17px] font-bold text-ink">פלטת הצבעים</h2>
          {layout.paletteNote && <p className="mx-auto mt-2 max-w-[150mm] whitespace-pre-line text-[13.5px] leading-relaxed text-ink-soft">{layout.paletteNote}</p>}
          {palette.shades.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-3">
              {palette.shades.map((s) => (
                <div key={s.name} className="flex w-[22mm] flex-col items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-[14mm] w-[14mm] rounded-full border border-ink/25 shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
                    style={{ background: s.swatch ?? "#ffffff" }}
                  />
                  <span className="text-[12px] leading-tight text-ink-soft">{s.name}</span>
                </div>
              ))}
            </div>
          )}
          {palette.cloths.length > 0 && (
            <p className="mt-3 text-[13px] text-ink-soft">
              <span className="font-semibold text-ink">מפות: </span>
              {palette.cloths.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoBoard({ photos }: { photos: QuotePhoto[] }) {
  const n = photos.length;
  const cols = n === 1 ? "grid-cols-1" : n === 2 ? "grid-cols-2" : "grid-cols-3";
  const aspect = n === 1 ? "aspect-[16/9]" : n === 2 ? "aspect-[4/3]" : "aspect-[3/4]";
  return (
    <div className={`mt-3 grid gap-2 ${cols}`}>
      {photos.map((ph) => (
        // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
        <img key={ph.id} src={ph.src} alt={ph.name} className={`${aspect} w-full rounded-sm border border-border bg-inset object-cover`} />
      ))}
    </div>
  );
}

function GiftMark() {
  return <span className="ms-2 inline-block rounded-sm border border-ink px-1.5 text-[11px] font-semibold leading-[1.45] text-ink">מתנה</span>;
}

/** A spec line in the client's words. In a kit it reads per table ("2 פמוטי פלורידה" under
 *  "על כל שולחן:"); elsewhere it reads the whole amount ("6 שנדליר פרנזים", "וילון · 14.0 מ׳"). */
function BulletLine({ line: l, perTable }: { line: ResolvedLine; perTable: boolean }) {
  const amount = perTable ? (l.perUnit ?? l.quantity) : l.quantity;
  const counted = l.priceUnit === "unit";
  const lead = counted && amount !== 1 ? String(amount) : undefined;
  const tail = counted ? undefined : formatAmount(amount, l.priceUnit);
  return (
    <div className="flex items-baseline gap-2 py-[3px] text-[14px] leading-snug">
      <span aria-hidden className="text-faint">
        •
      </span>
      <span className="min-w-0 flex-1 text-ink">
        {lead && <span className="nums me-1.5 font-semibold">{lead}</span>}
        {l.label}
        {tail && <span className="nums text-ink-soft"> · {tail}</span>}
        {l.detail && <span className="text-ink-soft"> — {l.detail}</span>}
        {l.gift && <GiftMark />}
      </span>
    </div>
  );
}

function ItemizedLine({ line: l }: { line: ResolvedLine }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-border-soft py-[5px] text-[13px] leading-snug">
      <span className="min-w-0 flex-1 text-ink">
        {l.label}
        {l.detail && <span className="text-muted"> — {l.detail}</span>}
        {l.perUnit !== undefined && l.perUnit !== 1 && (
          <span className="nums text-muted"> · {l.priceUnit === "unit" ? l.perUnit : formatAmount(l.perUnit, l.priceUnit)} לשולחן</span>
        )}
      </span>
      <span className="nums shrink-0 text-ink" style={{ width: "20mm" }}>
        {l.priceUnit === "unit" ? l.quantity : formatAmount(l.quantity, l.priceUnit)}
      </span>
      <span className="nums shrink-0 text-ink-soft" style={{ width: "26mm" }}>
        {l.priced ? formatUnitPrice(l.unitPrice, l.priceUnit) : "—"}
      </span>
      <span className="nums shrink-0 text-end font-semibold text-ink" style={{ width: "24mm" }}>
        {l.gift ? "מתנה" : l.priced ? formatPrice(l.lineTotal) : "—"}
      </span>
    </div>
  );
}

function Summary({ layout, sections, figures }: Parts) {
  const pct = Math.round(figures.vatRate * 100);
  const gifts = sections.flatMap((s) => s.lines.filter((l) => l.gift).map((l) => l.label));
  const showDiscount = discountShown(layout, figures);
  return (
    <div className="pt-9">
      <div className="rounded-md border-[1.5px] border-ink px-5 py-4">
        <h2 className="text-[17px] font-bold text-ink">סיכום מחיר</h2>
        <div className="mt-2 space-y-1 text-[13.5px]">
          {layout.priceMode !== "total" && sections.map((s) => <Row key={s.key} label={s.title} value={formatPrice(s.subtotal)} />)}
          {showDiscount && (
            <>
              <Row label="סה״כ לפני הנחה" value={formatPrice(figures.catalogSum)} muted />
              <Row label={figures.discount > 0 ? "הנחה" : "תוספת"} value={`${figures.discount > 0 ? "−" : "+"}${formatPrice(Math.abs(figures.discount))}`} />
            </>
          )}
          {!figures.vatIncluded && figures.vatRate > 0 && (
            <>
              <Row label="לפני מע״מ" value={formatPrice(figures.net)} muted />
              <Row label={`מע״מ ${pct}%`} value={formatPrice(figures.vat)} muted />
            </>
          )}
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-ink pt-3">
          <span className="text-[15px] font-bold text-ink">{showDiscount ? "סה״כ לתשלום לאחר הנחה" : "סה״כ לתשלום"}</span>
          <span className="nums text-[24px] font-bold text-ink">{formatPrice(figures.total)}</span>
        </div>
        {figures.vatIncluded && figures.vatRate > 0 && (
          <p className="nums mt-0.5 text-end text-[12px] text-muted">
            המחיר כולל מע״מ {pct}% ({formatPrice(figures.vat)})
          </p>
        )}
        {gifts.length > 0 && <p className="mt-2 text-[12.5px] text-ink-soft">מתנה מהסטודיו, ללא חיוב: {gifts.join(", ")}</p>}
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={muted ? "text-muted" : "text-ink-soft"}>{label}</span>
      <span className={"nums " + (muted ? "text-ink-soft" : "text-ink")}>{value}</span>
    </div>
  );
}

function Terms({ terms }: { terms: string[] }) {
  return (
    <div className="pt-7">
      <h3 className="text-[14px] font-bold text-ink">תנאי ההצעה</h3>
      <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-ink-soft">
        {terms.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-faint">
              •
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The greeting, the studio's signature, and the line the client signs. */
function Signatures({ settings, event, layout }: Parts) {
  const studioName = settings?.ownerName || settings?.businessName;
  return (
    <div className="pt-7">
      <p className="text-[13.5px] text-ink">{layout.closing.trim() || DEFAULT_CLOSING}</p>
      {studioName && <p className="text-[13.5px] font-bold text-ink">{studioName}</p>}
      <div className="mt-6 grid grid-cols-2 items-end gap-10">
        <div>
          <p className="mb-1 text-[12px] text-ink-soft">אני מאשר/ת את ההצעה על פרטיה ותנאיה.</p>
          <div className="h-[16mm] border-b border-ink" />
          <p className="mt-1 text-[11.5px] text-muted">
            הלקוח/ה{event?.clientName ? ` — ${event.clientName}` : ""} · חתימה ותאריך
          </p>
        </div>
        <div>
          <div className="flex h-[16mm] items-end justify-center border-b border-ink">
            {settings?.signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
              <img src={settings.signatureUrl} alt="חתימת הסטודיו" className="max-h-[15mm] w-auto max-w-[60mm] object-contain" />
            )}
          </div>
          <p className="mt-1 text-[11.5px] text-muted">הסטודיו{studioName ? ` — ${studioName}` : ""}</p>
        </div>
      </div>
    </div>
  );
}

// ── The designer's tools (edit mode) ─────────────────────────────────────────────────────────────

const toolsProps = { [NO_CAPTURE]: "" };

/** A section's tools: a row in the gap ABOVE its title, at the end side — clear of the line menus. */
function SectionTools({ section: s, edit, first, last }: { section: ResolvedSection; edit: QuoteEdit; first: boolean; last: boolean }) {
  const order: MenuItem[] = [
    ...(first ? [] : [{ label: "הזזה למעלה", icon: ArrowUp, onSelect: () => edit.onMove(s.key, -1) }]),
    ...(last ? [] : [{ label: "הזזה למטה", icon: ArrowDown, onSelect: () => edit.onMove(s.key, 1) }]),
  ];
  return (
    <div className="no-print absolute end-0 top-0 flex items-center gap-0.5 rounded-pill bg-inset px-1" {...toolsProps}>
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

function LineTools({ line: l, edit }: { line: ResolvedLine; edit: QuoteEdit }) {
  return (
    <div className="no-print absolute top-0" style={{ insetInlineEnd: `-${MARGIN - 1.5}mm` }} {...toolsProps}>
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
