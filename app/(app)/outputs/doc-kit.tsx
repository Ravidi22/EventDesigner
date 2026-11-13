"use client";

import type { CSSProperties, ReactNode } from "react";
import type { DocTheme } from "@/lib/documents/theme";
import { hebrewNumeral, type PhotosKind } from "@/lib/documents/style";

// The pieces every page of a studio's document is made of, in its direction (lib/documents/theme.ts):
// the paper, the frame, a section's heading, a photograph in its frame, the palette, the "הופק ב-Eve."
// credit. The Documents board (claude.ai/design, 2026-11-10) drew each direction by hand; these are
// its recurring parts, so the quote (./quote-document.tsx) and the settings preview read one set.
//
// Sizes are CSS px at 96/in on an A4 box in mm — the board's own units, and the same numbers on
// screen, on paper and in the PDF (./quote-pdf.ts photographs these boxes).

export interface DocPhoto {
  id: string;
  src: string;
  name: string;
}

/** The chapter mark: "א" in stationery, "01" elsewhere. */
export const chapter = (t: DocTheme, n: number) => (t.dir === "stationery" ? hebrewNumeral(n) : String(n).padStart(2, "0"));

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** The stock: its colour, the grain, the frame — under everything on the page. `bare` leaves the
 *  frame off (a full-bleed cover). */
export function Paper({ t, bare }: { t: DocTheme; bare?: boolean }) {
  const s = t.style;
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: t.paper }} />
      {s.paper === "grain" && !t.ink && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[3]" style={{ backgroundImage: NOISE, opacity: 0.16, mixBlendMode: "multiply" }} />
      )}
      {s.paper === "frame" && !bare && <Frame t={t} />}
    </>
  );
}

function Frame({ t }: { t: DocTheme }) {
  if (t.dir === "stationery")
    return (
      <>
        <div aria-hidden className="pointer-events-none absolute z-[3]" style={{ inset: "9mm", border: `0.7px solid ${t.accent}` }} />
        <div aria-hidden className="pointer-events-none absolute z-[3]" style={{ inset: "10.6mm", border: `0.35px solid ${t.accent}` }} />
      </>
    );
  if (t.dir === "lookbook")
    return <div aria-hidden className="pointer-events-none absolute z-[3]" style={{ inset: "6mm", border: `1.4px solid ${t.text}` }} />;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-[3]"
      style={{ inset: "7mm", border: `1px solid ${t.accent}`, outline: `0.5px solid ${t.soft2}`, outlineOffset: "-2.2mm" }}
    />
  );
}

/** "הופק ב-Eve." — on every page of every document. */
export function Credit({ t, onDark, style }: { t: DocTheme; onDark?: boolean; style?: CSSProperties }) {
  return (
    <span className="flex items-baseline gap-[3px]" style={{ fontFamily: t.body, fontSize: 8.5, color: onDark ? "rgba(255,255,255,.72)" : t.muted, ...style }}>
      הופק ב-
      <span dir="ltr" className="wordmark" style={{ fontSize: 10, letterSpacing: "-0.4px", color: onDark ? "#fff" : t.soft }}>
        Eve<span style={{ color: onDark ? "rgba(255,255,255,.6)" : t.accent }}>.</span>
      </span>
    </span>
  );
}

/** The stationery ornament: a rule, a diamond, a rule. */
export function Ornament({ t, width = 18, style }: { t: DocTheme; width?: number; style?: CSSProperties }) {
  return (
    <div aria-hidden className="flex items-center justify-center gap-[10px]" style={style}>
      <span style={{ width: `${width}mm`, height: 0.7, background: t.accent }} />
      <span style={{ width: 5, height: 5, transform: "rotate(45deg)", border: `0.8px solid ${t.accent}` }} />
      <span style={{ width: `${width}mm`, height: 0.7, background: t.accent }} />
    </div>
  );
}

/** A photograph in its frame — or, with none chosen, the frame in a tone of the palette with what
 *  belongs there written in it (the board's rule: pages read before photos are added). A catalog
 *  photo is a product shot and is shown whole on white; a gallery photo is a room and fills. */
export function PhotoFrame({
  t,
  photo,
  placeholder,
  shape = "rect",
  style,
  outline,
}: {
  t: DocTheme;
  photo: DocPhoto | null | undefined;
  placeholder?: string;
  shape?: "rect" | "arch" | "oval";
  style?: CSSProperties;
  /** The stationery's offset hairline round the frame. */
  outline?: boolean;
}) {
  // A photo with no source is a SLOT (the settings preview's sample pages): its name is the caption.
  if (photo && !photo.src) {
    placeholder = photo.name;
    photo = null;
  }
  const radius = shape === "oval" ? "50%" : shape === "arch" ? "999px 999px 0 0" : t.dir === "stationery" ? 2 : 0;
  const product = photo?.id.startsWith("product:");
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{
        borderRadius: radius,
        background: photo ? (product ? "#fff" : t.slot) : t.slot,
        outline: outline ? `0.7px solid ${t.accent}` : undefined,
        outlineOffset: outline ? "2mm" : undefined,
        ...style,
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
        <img src={photo.src} alt={photo.name} className="absolute inset-0 h-full w-full" style={{ objectFit: product ? "contain" : "cover", padding: product ? "4%" : 0 }} />
      ) : (
        placeholder && (
          <span className="absolute inset-0 flex items-center justify-center p-3 text-center" style={{ fontFamily: t.body, fontSize: 12, color: t.slotInk }}>
            {placeholder}
          </span>
        )
      )}
    </div>
  );
}

/** A section's photographs, laid out by the studio's "תמונות" setting in the direction's frames.
 *  Fewer photos than the layout wants → the layout one step simpler (grid → pair → hero). */
export function PhotoSet({ t, photos, widthMm, bleedMm = 0 }: { t: DocTheme; photos: DocPhoto[]; widthMm: number; bleedMm?: number }) {
  if (photos.length === 0) return null;
  const want: PhotosKind = t.style.photos;
  const kind: PhotosKind = want === "grid" && photos.length >= 3 ? "grid" : want !== "hero" && photos.length >= 2 ? "pair" : "hero";
  const k = t.k;

  if (t.dir === "stationery") {
    if (kind === "hero") {
      const w = Math.min(104, widthMm * 0.66);
      return (
        <div className="flex justify-center" style={{ paddingTop: "3mm", paddingBottom: "3mm" }}>
          <PhotoFrame t={t} photo={photos[0]} shape="arch" outline style={{ width: `${w}mm`, height: `${w * 1.18 * k}mm` }} />
        </div>
      );
    }
    const n = kind === "grid" ? 3 : 2;
    const gap = 9;
    const w = Math.min(62, (widthMm - gap * (n - 1) - 6) / n);
    return (
      <div className="flex justify-center" style={{ gap: `${gap}mm`, paddingTop: "3mm", paddingBottom: "3mm" }}>
        {photos.slice(0, n).map((p) => (
          <PhotoFrame key={p.id} t={t} photo={p} shape="oval" outline style={{ width: `${w}mm`, height: `${w * 1.32 * k}mm` }} />
        ))}
      </div>
    );
  }

  const h = (t.dir === "lookbook" ? 118 : 100) * k;
  const bleed: CSSProperties = bleedMm ? { marginInline: `-${bleedMm}mm` } : {};
  if (kind === "hero") return <PhotoFrame t={t} photo={photos[0]} style={{ width: "auto", height: `${h}mm`, ...bleed }} />;
  if (kind === "pair")
    return (
      <div className="grid grid-cols-2" style={{ gap: t.dir === "lookbook" ? "3mm" : "4mm", height: `${h * 0.8}mm`, ...bleed }}>
        {photos.slice(0, 2).map((p) => (
          <PhotoFrame key={p.id} t={t} photo={p} style={{ height: "100%" }} />
        ))}
      </div>
    );
  return (
    <div className="grid" style={{ gridTemplateColumns: "2fr 1fr", gridTemplateRows: "1fr 1fr", gap: "4mm", height: `${h}mm`, ...bleed }}>
      <PhotoFrame t={t} photo={photos[0]} style={{ gridRow: "1 / 3", height: "100%" }} />
      <PhotoFrame t={t} photo={photos[1]} style={{ height: "100%" }} />
      <PhotoFrame t={t} photo={photos[2]} style={{ height: "100%" }} />
    </div>
  );
}

/** A section's heading, in the direction's type, decorated by the studio's "כותרות אזור" setting
 *  (a rule, a number, a band of the accent's tint). `amount` is the section's price when the quote
 *  shows prices per area. */
export function SectionHeading({
  t,
  n,
  title,
  sub,
  amount,
  size = "lg",
}: {
  t: DocTheme;
  n: number | null;
  title: ReactNode;
  sub?: ReactNode;
  amount?: string;
  size?: "lg" | "sm";
}) {
  const kind = t.style.section;
  const sm = size === "sm";
  const mark = n !== null ? chapter(t, n) : null;
  const band: CSSProperties = kind === "band" ? { background: t.tint, padding: `${3 * t.k}mm 4mm`, marginInline: "-4mm" } : {};

  if (t.dir === "stationery") {
    return (
      <div className="flex flex-col items-center text-center" style={band}>
        {mark && kind !== "band" && (
          <span style={{ fontFamily: t.head, fontSize: kind === "numbered" ? (sm ? 26 : 40) : sm ? 15 : 20, lineHeight: 1, color: t.accent }}>{mark}</span>
        )}
        <h2 style={{ marginTop: "1mm", fontFamily: t.head, fontWeight: t.wLight, fontSize: (sm ? 22 : 36) * t.k, lineHeight: 1.1, color: kind === "band" ? t.deep : t.text }}>
          {kind === "band" && mark ? <span style={{ color: t.accent }}>{mark} · </span> : null}
          {title}
        </h2>
        {sub && <p className="nums" style={{ marginTop: "2mm", fontFamily: t.body, fontSize: 13, color: t.muted }}>{sub}</p>}
        {kind === "rule" && <Ornament t={t} style={{ marginTop: "4mm" }} />}
        {amount && <p className="nums" style={{ marginTop: "2mm", fontFamily: t.body, fontSize: 15, color: t.text }}>{amount}</p>}
      </div>
    );
  }

  if (t.dir === "lookbook") {
    const big = (sm ? 44 : 92) * t.k;
    return (
      <div style={kind === "band" ? band : { borderBottom: kind === "rule" ? `1.4px solid ${t.text}` : undefined, padding: kind === "rule" ? "0 0 3mm" : 0 }}>
        <div className="flex items-end justify-between gap-4">
          <h2 style={{ fontFamily: t.head, fontWeight: t.wHead, fontSize: big, lineHeight: 0.82, color: kind === "band" ? t.deep : t.text, textWrap: "balance" }}>{title}</h2>
          {mark && kind === "numbered" && (
            <span className="nums" style={{ fontFamily: t.head, fontSize: sm ? 28 : 44, lineHeight: 1, color: t.accent }}>
              {mark}
            </span>
          )}
        </div>
        {(sub || amount) && (
          <p className="nums" style={{ marginTop: "3mm", fontFamily: t.body, fontSize: 11, fontWeight: 500, color: t.accent }}>
            {[sub, amount].filter(Boolean).map((x, i) => (
              <span key={i}>
                {i > 0 && " / "}
                {x}
              </span>
            ))}
          </p>
        )}
      </div>
    );
  }

  // studio
  return (
    <div
      className="flex items-baseline"
      style={{ gap: "5mm", ...(kind === "band" ? band : { padding: "0 0 3mm", borderBottom: `1.2px solid ${t.text}` }) }}
    >
      {mark && kind !== "rule" && (
        <span dir="ltr" style={{ fontFamily: t.mono, fontSize: sm ? 11 : 13, color: t.accent }}>
          {mark}
        </span>
      )}
      <h2 style={{ fontFamily: t.head, fontWeight: t.wHead, fontSize: (sm ? 17 : 28) * (t.airy ? 1 : 0.92), lineHeight: 1.1, color: t.text }}>{title}</h2>
      <span className="nums" style={{ marginInlineStart: "auto", fontFamily: t.body, fontSize: 10.5, color: t.muted, whiteSpace: "nowrap" }}>
        {sub}
      </span>
      {amount && (
        <span dir="ltr" className="nums" style={{ fontFamily: t.mono, fontSize: 13, color: t.text }}>
          {amount}
        </span>
      )}
    </div>
  );
}

/** Black or white text on a swatch, by its lightness. */
export function inkOn(hex: string | undefined): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "#111";
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum < 140 ? "#fff" : "#111";
}

export interface DocShade {
  name: string;
  swatch?: string;
}

/** The event's palette in the direction's form: circles (stationery), bands (lookbook), chips
 *  with their names (studio). */
export function Palette({ t, shades, form }: { t: DocTheme; shades: DocShade[]; form?: "bands" | "chips" | "circles" | "squares" }) {
  if (shades.length === 0) return null;
  const f = form ?? (t.dir === "stationery" ? "circles" : t.dir === "lookbook" ? "bands" : "chips");
  const fill = (s: DocShade) => s.swatch ?? "#ffffff";
  const edge = (s: DocShade) => (inkOn(s.swatch) === "#111" ? `0.6px solid ${t.hair}` : "none");
  if (f === "circles")
    return (
      <div className="flex flex-wrap justify-center" style={{ gap: "8mm" }}>
        {shades.map((s) => (
          <div key={s.name} className="flex flex-col items-center gap-[6px]">
            <span style={{ width: "14mm", height: "14mm", borderRadius: "50%", background: fill(s), border: `0.7px solid ${t.hair}` }} />
            <span style={{ fontFamily: t.body, fontSize: 11.5, color: t.soft, whiteSpace: "nowrap" }}>{s.name}</span>
          </div>
        ))}
      </div>
    );
  if (f === "bands")
    return (
      <div className="flex flex-col">
        {shades.map((s) => (
          <div key={s.name} className="flex items-center justify-between" style={{ height: "14mm", padding: "0 5mm", background: fill(s), color: inkOn(s.swatch), borderBlock: edge(s) }}>
            <span style={{ fontFamily: t.head, fontWeight: t.wHead, fontSize: 24, lineHeight: 1 }}>{s.name}</span>
            {s.swatch && (
              <span dir="ltr" style={{ fontFamily: t.body, fontSize: 9.5, letterSpacing: 1, opacity: 0.7 }}>
                {s.swatch.toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  if (f === "squares")
    return (
      <div className="flex h-full flex-col" style={{ gap: "2mm" }}>
        {shades.map((s) => (
          <span key={s.name} title={s.name} style={{ flex: 1, minHeight: "8mm", background: fill(s), border: edge(s) }} />
        ))}
      </div>
    );
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(5, shades.length)}, minmax(0, 1fr))`, gap: "2mm" }}>
      {shades.map((s) => (
        <div key={s.name} className="flex flex-col" style={{ gap: "1.5mm" }}>
          <span style={{ height: `${22 * t.k}mm`, background: fill(s), border: edge(s) }} />
          <span style={{ fontFamily: t.body, fontSize: 10.5, fontWeight: 500, color: t.text }}>{s.name}</span>
          {s.swatch && (
            <span dir="ltr" style={{ fontFamily: t.mono, fontSize: 8.5, color: t.muted, textAlign: "right" }}>
              {s.swatch.toUpperCase()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** The studio's mark: its logo, or its name set in the heading face. */
export function StudioMark({ t, logoUrl, name, heightMm = 12, onDark, style }: { t: DocTheme; logoUrl?: string; name?: string; heightMm?: number; onDark?: boolean; style?: CSSProperties }) {
  if (logoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
      <img src={logoUrl} alt={name ?? ""} style={{ height: `${heightMm}mm`, width: "auto", maxWidth: "70mm", objectFit: "contain", ...(onDark ? { background: "#fff", padding: "2mm", borderRadius: 2 } : {}), ...style }} />
    );
  if (!name) return null;
  return <span style={{ fontFamily: t.head, fontWeight: t.wHead, fontSize: 17, color: onDark ? "#fff" : t.soft, ...style }}>{name}</span>;
}

/** Where the logo row sits — the studio's "מיקום" setting. In RTL, "start" is the right edge. */
export const logoJustify = (t: DocTheme) => ({ center: "center", start: "flex-start", corner: "flex-end" })[t.style.logoPos];
