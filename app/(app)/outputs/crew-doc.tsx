import type { CSSProperties, ReactNode } from "react";
import { chapterLabel, type DocTheme } from "@/lib/documents/theme";
import { hebrewNumeral } from "@/lib/documents/style";

// THE CREW SHEETS' TYPE — the pieces the booklet cover, the packing list and the load-in sheet share,
// set in the studio's document direction (the user's claude.ai/design board "CrewSheet": the same
// four crew pages in each of the three directions). The direction gives the TYPE and the STRUCTURE —
// stationery: centred Bellefair title over a hairline, unnumbered sections, round tick boxes;
// lookbook: a huge Karantina title flush on a 1.4px rule with the facts at its end, big section
// numbers; studio: a ruled four-cell facts bar over a light Plex title, Plex Mono numbers. Never its
// colour: every theme here is `docTheme(…, { ink: true })` — black ink on white, photocopied in a van.

/** The wrapper every crew page sets its body in. */
export const crewBody = (t: DocTheme): CSSProperties => ({ fontFamily: t.body, color: t.text });
/** Figures: Plex Mono in the studio direction, the body face elsewhere. */
export const crewNums = (t: DocTheme): CSSProperties => ({ fontFamily: t.mono });
/** A face that is only one weight answers the heading weight with its regular — never faux-bold. */
const headStyle = (t: DocTheme, weight: number, size: number, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: t.head,
  fontWeight: weight,
  fontSize: size,
  color: t.text,
  ...extra,
});

export interface CrewFact {
  label: string;
  value: string;
}

/** A page's head: its name, who it is for, and up to four facts. */
export function CrewHeader({ t, title, kicker, meta }: { t: DocTheme; title: string; kicker?: string; meta: CrewFact[] }) {
  if (t.dir === "lookbook") {
    return (
      <header style={{ marginBottom: 26 * t.k }}>
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            {kicker && <p style={{ fontSize: 12, color: t.soft, marginBottom: 4 }}>{kicker}</p>}
            <h2 style={headStyle(t, t.wHead, 84, { lineHeight: 0.82 })}>{title}</h2>
          </div>
          {/* The facts at the title's END — the left, on a Hebrew page — flush with its foot. */}
          <dl className="shrink-0 text-end" style={{ fontSize: 11, lineHeight: 1.5 }}>
            {meta.map((m) => (
              <div key={m.label}>
                <dt className="inline" style={{ color: t.muted }}>
                  {m.label}{" "}
                </dt>
                <dd className="inline" style={{ ...crewNums(t), fontWeight: 500 }}>
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div style={{ borderTop: `1.4px solid ${t.rule}`, marginTop: 8 }} />
      </header>
    );
  }
  if (t.dir === "studio") {
    return (
      <header style={{ marginBottom: 24 * t.k }}>
        {/* The project bar: ruled cells, a mono label over each value. */}
        <dl className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, meta.length)}, minmax(0, 1fr))`, borderTop: `1px solid ${t.rule}`, borderBottom: `1px solid ${t.rule}` }}>
          {meta.map((m, i) => (
            <div key={m.label} style={{ padding: "6px 8px", borderInlineStart: i > 0 ? `0.5px solid ${t.hair}` : undefined }}>
              <dt style={{ fontFamily: t.mono, fontSize: 8.5, color: t.muted }}>{m.label}</dt>
              <dd className="truncate" style={{ ...crewNums(t), fontSize: 11.5, fontWeight: 500, marginTop: 2 }}>
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
        {kicker && <p style={{ fontFamily: t.mono, fontSize: 9, color: t.muted, marginTop: 14 * t.k }}>{kicker}</p>}
        <h2 style={headStyle(t, t.wLight, 38, { lineHeight: 1.05, marginTop: kicker ? 2 : 14 * t.k })}>{title}</h2>
      </header>
    );
  }
  // Stationery: centred, the title over a short hairline, the facts in one quiet line under it.
  return (
    <header className="text-center" style={{ marginBottom: 26 * t.k }}>
      {kicker && <p style={{ fontSize: 12, color: t.soft }}>{kicker}</p>}
      <h2 style={headStyle(t, t.wHead, 36, { lineHeight: 1.1, marginTop: kicker ? 6 : 0 })}>{title}</h2>
      <div className="mx-auto" style={{ width: 72, borderTop: `0.5px solid ${t.rule}`, margin: "10px auto" }} />
      <p style={{ fontSize: 12, color: t.soft }}>
        {meta.map((m, i) => (
          <span key={m.label}>
            {i > 0 && <span style={{ color: t.muted }}> · </span>}
            <span style={{ color: t.muted }}>{m.label} </span>
            <span style={crewNums(t)}>{m.value}</span>
          </span>
        ))}
      </p>
    </header>
  );
}

/** Whether a section heading wears its number: the studio's `section` setting, read per direction
 *  (a band shows it outside stationery, whose band is a plain strip). */
const numbered = (t: DocTheme) => t.style.section === "numbered" || (t.style.section === "band" && t.dir !== "stationery");

/** One section of a crew page. `n` counts from 1. */
export function CrewSection({ t, n, title, children, className = "" }: { t: DocTheme; n: number; title: string; children: ReactNode; className?: string }) {
  const num = numbered(t) ? chapterLabel(t, n, hebrewNumeral) : null;
  const band = t.style.section === "band";
  let head: ReactNode;
  if (t.dir === "lookbook") {
    head = (
      <div className="flex items-end gap-3" style={{ borderBottom: band ? undefined : `1.4px solid ${t.rule}`, background: band ? t.tint : undefined, padding: band ? "4px 8px" : "0 0 4px" }}>
        {num && <span style={headStyle(t, t.wHead, 22, { lineHeight: 1 })}>{num}</span>}
        <h3 style={headStyle(t, t.wHead, 30, { lineHeight: 1.05 })}>{title}</h3>
      </div>
    );
  } else if (t.dir === "studio") {
    head = (
      <div className="flex items-baseline gap-2.5" style={{ borderBottom: band ? undefined : `0.5px solid ${t.rule}`, background: band ? t.tint : undefined, padding: band ? "4px 8px" : "0 0 4px" }}>
        {num && <span style={{ fontFamily: t.mono, fontSize: 10, color: t.muted }}>{num}</span>}
        <h3 style={headStyle(t, t.wHead, 14)}>{title}</h3>
      </div>
    );
  } else {
    // Stationery: the title centred between two hairlines — or on a pale strip, as a band.
    head = band ? (
      <div className="text-center" style={{ background: t.tint, padding: "4px 8px" }}>
        {num && <span style={{ fontSize: 11, color: t.muted, marginInlineEnd: 6 }}>{num}</span>}
        <h3 className="inline" style={headStyle(t, t.wHead, 19)}>{title}</h3>
      </div>
    ) : (
      <div className="flex items-center gap-3">
        <span className="h-0 flex-1" style={{ borderTop: `0.5px solid ${t.rule}` }} />
        <h3 style={headStyle(t, t.wHead, 19, { lineHeight: 1.2 })}>
          {num && <span style={{ fontSize: 12, color: t.muted, marginInlineEnd: 6 }}>{num}</span>}
          {title}
        </h3>
        <span className="h-0 flex-1" style={{ borderTop: `0.5px solid ${t.rule}` }} />
      </div>
    );
  }
  return (
    <section className={`break-inside-avoid ${className}`}>
      <div style={{ marginBottom: 8 * t.k }}>{head}</div>
      {children}
    </section>
  );
}

/** A printed tick box — round in stationery, square elsewhere. */
export function Tick({ t, size = 14 }: { t: DocTheme; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 align-middle"
      style={{ width: size, height: size, border: `1px solid ${t.soft}`, borderRadius: t.dir === "stationery" ? "9999px" : 0 }}
    />
  );
}

/** The foot of every crew page (the board's CrewSheet): the studio — with its phone when the
 *  studio's footer setting is "פרטי קשר" — and when it was printed at the start, "הופק ב-Eve." at
 *  the end. */
export function CrewFooter({ t, printed, studio, className = "" }: { t: DocTheme; printed: string; studio?: string; className?: string }) {
  const mark = (
    <span className="flex items-baseline gap-[3px]" style={{ color: t.muted }}>
      הופק ב-
      <span dir="ltr" className="wordmark" style={{ fontSize: 11, letterSpacing: "-0.4px", color: t.text }}>
        Eve.
      </span>
    </span>
  );
  const when = (
    <span style={{ ...crewNums(t), color: t.muted }}>
      {[studio, `הודפס ${printed}`].filter(Boolean).join(" · ")}
    </span>
  );
  return (
    <footer
      className={`flex items-center gap-3 ${t.dir === "stationery" ? "justify-center" : "justify-between"} ${className}`}
      style={{ fontSize: 9.5, borderTop: t.dir === "stationery" ? undefined : `0.5px solid ${t.hair}`, paddingTop: 6 }}
    >
      {when}
      {t.dir === "stationery" && <span style={{ color: t.muted }}>·</span>}
      {mark}
    </footer>
  );
}
