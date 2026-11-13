"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Banknote, BookImage, Check, File, Heading, Image as ImageIcon, Images, Palette as PaletteIcon, Rows3, Signature, Type } from "lucide-react";
import { saveDocStyle, saveSettings } from "@/lib/settings/actions";
import type { BusinessSettings } from "@/lib/settings/types";
import {
  ACCENT_SWATCHES,
  BODY_FONTS,
  DIRECTIONS,
  DIRECTION_DEFAULTS,
  HEAD_FONTS,
  TOKEN_LABELS,
  changedCount,
  normalizeDocStyle,
  resolveDocStyle,
  withToken,
  type DocDirection,
  type DocFont,
  type DocStyleSetting,
  type DocTokens,
  type EnumToken,
} from "@/lib/documents/style";
import { docTheme, fontStack } from "@/lib/documents/theme";
import { FoldRow } from "@/components/fold-row";
import { ImageField } from "@/components/image-field";
import { segmentClass, segmentFrameClass } from "@/components/segmented";
import { fieldLabelClassName } from "@/components/control";
import { QuoteDocument } from "../outputs/quote-document";
import { CrewFooter, CrewHeader, CrewSection, Tick } from "../outputs/crew-doc";
import { SAMPLE_PACKING, sampleQuote } from "./doc-sample";

// Settings → מיתוג מסמכים — the studio's documents, set once (the user's claude.ai/design board
// "Documents", frame 3c, with turn 4's three directions in its template row). Pick a direction, then
// any of the groups; every change saves at once and shows on the live A4 preview beside it, which
// jumps to the page the setting changes. The preview is the REAL quote (../outputs/quote-document)
// on a sample event, and a crew sheet in the same direction, in ink.
//
// Saved through `saveDocStyle` alone — never through the letterhead's `saveSettings`, whose whole-row
// autosave would write back a stale copy (lib/settings/actions.ts). The logo is the letterhead's own
// field, shown here too because it is half of what a document looks like.

const SAVE_DELAY_MS = 300;

type PreviewPage = "cover" | "concept" | "sketch" | "section" | "price" | "terms" | "crew";
const QUOTE_PAGES: [PreviewPage, string][] = [
  ["cover", "שער"],
  ["concept", "קונספט"],
  ["sketch", "סקיצה"],
  ["section", "אזור"],
  ["price", "מחיר"],
  ["terms", "תנאים"],
];
/** The page a setting is seen on — where the preview jumps when it changes. */
const PAGE_OF: Partial<Record<keyof DocTokens, PreviewPage>> = {
  logoPos: "cover",
  cover: "cover",
  headFont: "cover",
  bodyFont: "concept",
  accent: "concept",
  section: "section",
  photos: "section",
  density: "section",
  prices: "price",
  paper: "concept",
  footer: "concept",
  sign: "terms",
};
const PAGE_SELECTOR: Record<Exclude<PreviewPage, "crew">, string> = {
  cover: '[data-page-key="cover"]',
  concept: '[data-page-key="concept"]',
  sketch: '[data-page-key^="sketch:"]',
  section: '[data-page-key^="head:"]',
  price: '[data-page-key="summary"]',
  terms: '[data-page-key="terms"]',
};

type GroupId = "logo" | "color" | "fonts" | "cover" | "section" | "photos" | "prices" | "paper" | "density" | "footer";

export function BrandingSection({ initialSettings }: { initialSettings: BusinessSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [setting, setSetting] = useState<DocStyleSetting>(() => normalizeDocStyle(initialSettings.docStyle));
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState<Set<GroupId>>(() => new Set<GroupId>(["color", "cover"]));
  const [page, setPage] = useState<PreviewPage>("cover");
  const style = resolveDocStyle(setting);

  // ── Saving: debounced on the setting itself (a colour picker dragged is one write, not fifty) ──
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => {
      void saveDocStyle(setting).then(
        () => setSaved(true),
        () => setSaved(false),
      );
    }, SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [setting, dirty]);
  const commit = (next: DocStyleSetting, show?: PreviewPage) => {
    setSetting(next);
    setDirty(true);
    setSaved(false);
    if (show) setPage((p) => (p === "crew" && show !== "crew" ? p : show));
  };
  const set = <K extends keyof DocTokens>(key: K, value: DocTokens[K]) => commit(withToken(setting, key, value), PAGE_OF[key]);
  const pickDirection = (direction: DocDirection) => commit({ direction, overrides: {} }, "cover");

  const setLogo = (logoUrl: string | undefined) => {
    const next = { ...settings, logoUrl };
    setSettings(next);
    void saveSettings(next).then((s) => setSettings(s));
    setPage("cover");
  };

  const toggle = (id: GroupId) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const changed = changedCount(setting);
  const seg = <K extends EnumToken>(label: string, key: K) => (
    <SegRow label={label} value={String(style[key])} options={Object.entries(TOKEN_LABELS[key])} onPick={(v) => set(key, v as DocTokens[K])} />
  );
  const group = (id: GroupId, icon: typeof Type, title: string, summary: React.ReactNode, body: React.ReactNode) => (
    <FoldRow key={id} variant="panel" icon={icon} title={title} summary={summary} open={open.has(id)} onToggle={() => toggle(id)}>
      <div className="space-y-3 pb-1">{body}</div>
    </FoldRow>
  );

  return (
    <section className="flex h-[calc(100dvh-140px)] min-h-[620px] flex-col overflow-hidden rounded-md border border-border bg-surface">
      <header className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
        <div className="min-w-0">
          <h2 className="font-display text-h2 text-ink">מיתוג מסמכים</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">
            איך נראים ההצעה, חוברת ההפקה ודפי הצוות — בכל האירועים. השינויים נשמרים מיד ונכנסים למסמך הבא שמפיקים.
          </p>
        </div>
        <span className={"inline-flex shrink-0 items-center gap-1.5 text-caption text-muted transition-opacity " + (saved ? "opacity-100" : "opacity-0")}>
          <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
          נשמר
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="w-[340px] shrink-0 overflow-y-auto overflow-x-hidden border-e border-border">
          <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3.5">
            <span className="text-caption font-semibold text-muted">כיוון עיצובי</span>
            <div className="grid grid-cols-3 gap-2">
              {DIRECTIONS.map((d) => (
                <DirectionTile key={d.id} id={d.id} name={d.name} desc={d.desc} on={setting.direction === d.id} onPick={() => pickDirection(d.id)} />
              ))}
            </div>
            {changed > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-sm border border-border-soft bg-bg px-2.5 py-1.5 text-caption text-ink-soft">
                <span className="nums">מותאם אישית · שונו {changed} הגדרות</span>
                <button type="button" onClick={() => commit({ direction: setting.direction, overrides: {} })} className="font-semibold text-accent hover:underline">
                  חזרה לכיוון
                </button>
              </div>
            )}
          </div>

          {group(
            "logo",
            ImageIcon,
            "לוגו",
            TOKEN_LABELS.logoPos[style.logoPos],
            <>
              <ImageField value={settings.logoUrl} onChange={setLogo} kind="logo" className="h-[72px] w-full" />
              {seg("מיקום", "logoPos")}
            </>,
          )}
          {group(
            "color",
            PaletteIcon,
            "צבע",
            <span className="inline-flex items-center gap-1.5" dir="ltr">
              <span className="h-3 w-3 rounded-full" style={{ background: style.accent }} />
              {style.accent}
            </span>,
            <>
              <div className="flex flex-wrap gap-2">
                {ACCENT_SWATCHES.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.name}
                    aria-label={c.name}
                    aria-pressed={style.accent === c.hex}
                    onClick={() => set("accent", c.hex)}
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2"
                    style={{ borderColor: style.accent === c.hex ? "var(--color-ink)" : "transparent" }}
                  >
                    <span className="h-[26px] w-[26px] rounded-full" style={{ background: c.hex }} />
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2">
                <span className="shrink-0 text-caption font-medium text-ink-soft">גוון מדויק</span>
                <span className="flex h-8 flex-1 items-center gap-2 rounded-sm border border-border px-2.5" dir="ltr">
                  <input type="color" value={style.accent} onChange={(e) => set("accent", e.target.value)} className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" aria-label="בחירת גוון" />
                  <span className="nums text-sm text-ink">{style.accent}</span>
                </span>
              </label>
              <p className="text-caption leading-relaxed text-muted">בדפי הצוות הצבע הופך לדיו — הם מודפסים בשחור-לבן.</p>
            </>,
          )}
          {group(
            "fonts",
            Type,
            "גופנים",
            <span dir="ltr">
              {style.headFont} · {style.bodyFont}
            </span>,
            <>
              <FontList label="כותרות" fonts={HEAD_FONTS} value={style.headFont} sample="מיכל ודניאל" size={20} onPick={(f) => set("headFont", f)} />
              <FontList label="טקסט" fonts={BODY_FONTS} value={style.bodyFont} sample="הצעה לעיצוב החתונה" size={15} onPick={(f) => set("bodyFont", f)} />
            </>,
          )}
          {group(
            "cover",
            BookImage,
            "שער ההצעה",
            TOKEN_LABELS.cover[style.cover],
            <>
              {seg("סגנון", "cover")}
              {style.cover === "photo" && <p className="text-caption leading-relaxed text-muted">התמונה נבחרת בכל הצעה — מהגלריה של האירוע.</p>}
            </>,
          )}
          {group("section", Heading, "כותרות אזור", TOKEN_LABELS.section[style.section], seg("סגנון", "section"))}
          {group("photos", Images, "תמונות", TOKEN_LABELS.photos[style.photos], seg("פריסה", "photos"))}
          {group(
            "prices",
            Banknote,
            "טבלת מחירים",
            TOKEN_LABELS.prices[style.prices],
            <>
              {seg("סגנון", "prices")}
              <p className="text-caption leading-relaxed text-muted">האם להציג מחירים לפי אזור — נקבע בכל הצעה, בעריכת ההצעה.</p>
            </>,
          )}
          {group("paper", File, "נייר", TOKEN_LABELS.paper[style.paper], seg("רקע", "paper"))}
          {group(
            "density",
            Rows3,
            "מרווחים",
            TOKEN_LABELS.density[style.density],
            <>
              {seg("צפיפות", "density")}
              <p className="text-caption leading-relaxed text-muted">באוורירי כל אזור פותח עמוד משלו.</p>
            </>,
          )}
          {group(
            "footer",
            Signature,
            "תחתית וחתימה",
            `${TOKEN_LABELS.footer[style.footer]} · ${TOKEN_LABELS.sign[style.sign]}`,
            <>
              {seg("תחתית עמוד", "footer")}
              {seg("חתימה", "sign")}
            </>,
          )}
        </div>

        <Preview settings={settings} setting={setting} page={page} onPage={setPage} />
      </div>
    </section>
  );
}

function SegRow({ label, value, options, onPick }: { label: string; value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <div>
      <span className={fieldLabelClassName}>{label}</span>
      <div role="group" aria-label={label} className={segmentFrameClass(false)}>
        {options.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onPick(v)} className={segmentClass(value === v, false) + " flex-1"}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function DirectionTile({ id, name, desc, on, onPick }: { id: DocDirection; name: string; desc: string; on: boolean; onPick: () => void }) {
  const d = DIRECTION_DEFAULTS[id];
  const t = docTheme({ direction: id, overrides: {} });
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={"block w-full rounded-md p-1.5 text-start transition-colors " + (on ? "border-[1.5px] border-accent bg-bg" : "border border-border bg-surface hover:bg-bg")}
    >
      <span className="flex h-14 items-end overflow-hidden rounded-sm px-2 pb-1.5" style={{ background: t.paper, borderBottom: `3px solid ${d.accent}` }}>
        <span style={{ fontFamily: fontStack(d.headFont), fontWeight: t.wHead, fontSize: id === "lookbook" ? 32 : 24, lineHeight: 1, color: id === "studio" ? t.text : d.accent }}>אבג</span>
      </span>
      <span className="mt-1.5 block text-[13px] font-bold text-ink">{name}</span>
      <span className="block text-[11px] leading-snug text-muted">{desc}</span>
    </button>
  );
}

function FontList({ label, fonts, value, sample, size, onPick }: { label: string; fonts: DocFont[]; value: DocFont; sample: string; size: number; onPick: (f: DocFont) => void }) {
  return (
    <div>
      <span className={fieldLabelClassName}>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-col gap-0.5">
        {fonts.map((f) => {
          const on = f === value;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(f)}
              className={"flex min-h-[38px] w-full items-center gap-2.5 rounded-sm px-2 text-start " + (on ? "bg-accent-tint" : "hover:bg-bg")}
            >
              <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-surface" style={{ border: on ? "4.5px solid var(--color-accent)" : "1.5px solid var(--color-faint)" }} />
              <span className="min-w-0 flex-1 truncate text-ink" style={{ fontFamily: fontStack(f), fontSize: size }}>
                {sample}
              </span>
              <span dir="ltr" className="shrink-0 text-[11px] text-muted">
                {f}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── The preview ────────────────────────────────────────────────────────────────────────────────

const A4_PX = 210 * (96 / 25.4);

function Preview({ settings, setting, page, onPage }: { settings: BusinessSettings; setting: DocStyleSetting; page: PreviewPage; onPage: (p: PreviewPage) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.6);
  const sample = useMemo(() => sampleQuote(settings), [settings]);
  const crew = page === "crew";

  // The page fits the column's width.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setZoom(Math.max(0.3, Math.min(1, Math.floor(((el.clientWidth - 56) / A4_PX) * 100) / 100)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Jump to the page — after the document has laid itself out.
  useEffect(() => {
    if (crew) {
      scroller.current?.scrollTo({ top: 0 });
      return;
    }
    const id = requestAnimationFrame(() => {
      const el = scroller.current?.querySelector<HTMLElement>(PAGE_SELECTOR[page]);
      if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop * zoom - 64, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [page, crew, zoom, setting]);

  const chip = (on: boolean) => "inline-flex shrink-0 items-center whitespace-nowrap rounded-pill px-3 py-1.5 text-[13px] " + (on ? "bg-accent-tint font-bold text-accent" : "font-semibold text-ink-soft hover:text-ink");

  return (
    <div ref={box} className="relative min-w-0 flex-1 bg-bg">
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-pill bg-surface p-1 shadow-floating">
          {QUOTE_PAGES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => onPage(id)} className={chip(page === id)}>
              {label}
            </button>
          ))}
          <span className="mx-0.5 h-5 w-px bg-border" />
          <button type="button" onClick={() => onPage("crew")} className={chip(crew)}>
            לצוות
          </button>
        </div>
      </div>
      <div ref={scroller} className="absolute inset-0 overflow-y-auto overflow-x-hidden">
        <div className="flex justify-center" style={{ zoom, padding: `${Math.round(72 / zoom)}px 0 ${Math.round(40 / zoom)}px` }}>
          {crew ? <CrewSample setting={setting} settings={settings} /> : <QuoteDocument {...sample} style={setting} />}
        </div>
      </div>
    </div>
  );
}

/** A packing list in the studio's direction, in ink — the crew sheets' one shared look. */
function CrewSample({ setting, settings }: { setting: DocStyleSetting; settings: BusinessSettings }) {
  const t = docTheme(setting, { ink: true });
  const studio = settings.businessName || "סטודיו לביא";
  return (
    <article className="relative flex shrink-0 flex-col bg-white shadow-lifted" style={{ width: "210mm", minHeight: "297mm", padding: `${t.dir === "stationery" ? 16 : 13}mm`, fontFamily: t.body, color: t.text }}>
      <CrewHeader
        t={t}
        title="רשימת ציוד"
        kicker={`${studio} · מיכל ודניאל · 14 במאי 2027`}
        meta={[
          { label: "לקוח", value: "מיכל ודניאל" },
          { label: "אירוע", value: "חתונה · 14.05.2027" },
          { label: "גרסה", value: "4" },
        ]}
      />
      <div className="flex flex-col" style={{ gap: `${7 * t.k}mm` }}>
        {SAMPLE_PACKING.map((g, i) => (
          <CrewSection key={g.label} t={t} n={i + 1} title={g.label}>
            <div className="flex gap-2 py-1 text-[10px] font-medium" style={{ color: t.muted }}>
              <span className="flex-1">פריט</span>
              <span className="w-[15mm]">כמות</span>
              <span className="w-[15mm]">רזרבה</span>
              <span className="w-[15mm]">סה״כ</span>
              <span className="w-[11mm] text-center">נארז</span>
            </div>
            {g.rows.map(([label, qty, spare, total]) => (
              <div key={label} className="flex items-center gap-2 text-[12px]" style={{ padding: `${(t.dir === "stationery" ? 2.2 : 1.9) * t.k}mm 0`, borderBottom: `0.6px solid ${t.hair}` }}>
                <span className="min-w-0 flex-1">{label}</span>
                <span className="nums w-[15mm]" style={{ fontFamily: t.mono }}>
                  {qty}
                </span>
                <span className="nums w-[15mm]" style={{ fontFamily: t.mono, color: t.soft }}>
                  {spare}
                </span>
                <span className="nums w-[15mm] font-bold" style={{ fontFamily: t.mono }}>
                  {total}
                </span>
                <span className="flex w-[11mm] justify-center">
                  <Tick t={t} />
                </span>
              </div>
            ))}
          </CrewSection>
        ))}
      </div>
      <span className="flex-1" />
      <CrewFooter t={t} printed="10.11.2026" studio={t.style.footer === "contact" ? `${studio} · ${settings.phone || "052-555-0101"}` : studio} className="mt-8" />
    </article>
  );
}
