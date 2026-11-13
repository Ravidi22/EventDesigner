// THE COVER OF A PRODUCTION SET — what the crew lead reads before unclipping anything: whose event,
// when, where, how big, and what is in the folder in what order. A set of nine sheets with no index
// is nine loose drawings; with one, a missing page is noticed in the van rather than in the hall.
//
// Black ink on white, like every sheet behind it — this page is photocopied with the rest. Set in the
// studio's document direction (./crew-doc.tsx): its faces and structure, never its colour. Counts
// only: a printing surface never carries a price (npm run check:costs).
import type { DocTheme } from "@/lib/documents/theme";
import { CrewFooter, CrewSection, crewBody, crewNums } from "./crew-doc";

export interface SetEntry {
  /** The framed sheet's number ("גיליון 3 / 9"), or null for a schedule page (they are unnumbered). */
  sheet: number | null;
  label: string;
  /** The zone it covers, when it is one zone's sheet. */
  zone?: string;
}

export function SetCover({
  theme: t,
  studio,
  client,
  eventDate,
  zones,
  guests,
  summary,
  kits,
  version,
  printed,
  entries,
}: {
  theme: DocTheme;
  studio?: string;
  client: string;
  eventDate?: string;
  zones: string;
  guests?: number;
  summary: string;
  kits: number;
  version: number;
  printed: string;
  entries: SetEntry[];
}) {
  const facts: [string, string][] = [
    ["תאריך האירוע", eventDate || "—"],
    ["מקום", zones || "—"],
    ...(guests ? ([["אורחים (הערכה)", String(guests)]] as [string, string][]) : []),
    ...(summary ? ([["שולחנות ומקומות", summary]] as [string, string][]) : []),
    ...(kits ? ([["ערכות עיצוב", String(kits)]] as [string, string][]) : []),
    ["גרסה", `גרסה ${version} · הופק ${printed}`],
  ];
  const sheets = entries.filter((e) => e.sheet).length;
  const name = client || "אירוע ללא שם";
  const k = t.k;

  return (
    <div className="flex h-full flex-col" style={crewBody(t)}>
      {t.dir === "lookbook" ? (
        <header>
          {studio && <p style={{ fontSize: 13, color: t.soft }}>{studio}</p>}
          <h1 style={{ fontFamily: t.head, fontWeight: t.wHead, fontSize: 112, lineHeight: 0.8, marginTop: 28 * k }}>חוברת הפקה</h1>
          <div style={{ borderTop: `1.4px solid ${t.rule}`, marginTop: 10 }} />
          <div className="flex items-baseline justify-between gap-6" style={{ marginTop: 8 }}>
            <p style={{ fontFamily: t.head, fontWeight: t.wHead, fontSize: 40, lineHeight: 0.95 }}>{name}</p>
            <p className="shrink-0" style={{ ...crewNums(t), fontSize: 11, color: t.muted }}>
              {sheets} גיליונות · גרסה {version}
            </p>
          </div>
        </header>
      ) : t.dir === "studio" ? (
        <header>
          <dl className="grid grid-cols-4" style={{ borderTop: `1px solid ${t.rule}`, borderBottom: `1px solid ${t.rule}` }}>
            {(
              [
                ["סטודיו", studio || "—"],
                ["תאריך", eventDate || "—"],
                ["גרסה", String(version).padStart(2, "0")],
                ["גיליונות", String(sheets).padStart(2, "0")],
              ] as [string, string][]
            ).map(([label, value], i) => (
              <div key={label} style={{ padding: "6px 8px", borderInlineStart: i > 0 ? `0.5px solid ${t.hair}` : undefined }}>
                <dt style={{ fontFamily: t.mono, fontSize: 8.5, color: t.muted }}>{label}</dt>
                <dd className="truncate" style={{ ...crewNums(t), fontSize: 11.5, fontWeight: 500, marginTop: 2 }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <h1 style={{ fontFamily: t.head, fontWeight: t.wLight, fontSize: 56, lineHeight: 1, marginTop: 40 * k }}>חוברת הפקה</h1>
          <p style={{ fontFamily: t.head, fontWeight: t.wLight, fontSize: 24, marginTop: 6, color: t.soft }}>{name}</p>
        </header>
      ) : (
        // Stationery: a centred title page — the studio, the title, a hairline, whose event.
        <header className="text-center">
          {studio && <p style={{ fontSize: 13, color: t.soft, marginTop: 18 * k }}>{studio}</p>}
          <h1 style={{ fontFamily: t.head, fontWeight: t.wHead, fontSize: 58, lineHeight: 1.05, marginTop: 30 * k }}>חוברת הפקה</h1>
          <div style={{ width: 96, borderTop: `0.5px solid ${t.rule}`, margin: "16px auto" }} />
          <p style={{ fontFamily: t.head, fontWeight: t.wHead, fontSize: 26 }}>{name}</p>
        </header>
      )}

      {/* The facts — two columns of label over value; the studio direction rules them as a table. */}
      <dl
        className={`grid ${t.dir === "lookbook" ? "grid-cols-3" : "grid-cols-2"} ${t.dir === "stationery" ? "text-center" : ""}`}
        style={{ marginTop: 34 * k, columnGap: 28, rowGap: 12 * k }}
      >
        {facts.map(([label, v]) => (
          <div key={label} style={{ borderBottom: t.dir === "stationery" ? undefined : `0.5px solid ${t.hair}`, paddingBottom: 6 }}>
            <dt style={{ fontSize: 10.5, color: t.muted, fontFamily: t.dir === "studio" ? t.mono : undefined }}>{label}</dt>
            <dd style={{ ...crewNums(t), fontSize: 14.5, fontWeight: 500, marginTop: 2 }}>{v}</dd>
          </div>
        ))}
      </dl>

      <CrewSection t={t} n={1} title="תוכן החוברת" className="mt-9">
        <ol>
          {entries.map((e, i) => (
            <IndexRow key={i} t={t} e={e} />
          ))}
        </ol>
      </CrewSection>

      <p className="mt-auto pt-6" style={{ fontSize: 10, color: t.muted, textAlign: t.dir === "stationery" ? "center" : undefined }}>
        השרטוטים בקנה מידה מוצהר — סרגל הקנה בכל גיליון נשאר נכון גם בצילום מוקטן. אותיות בעיגול ליד מספרי השולחנות מפנות לערכת העיצוב ולפרט השולחן שלה.
      </p>
      <CrewFooter t={t} printed={printed} studio={studio} className="mt-4" />
    </div>
  );
}

/** One line of the index — a sheet and its number in the set, in the direction's manner. */
export function IndexRow({ t, e }: { t: DocTheme; e: SetEntry }) {
  const zone = e.zone && <span style={{ color: t.soft }}> · {e.zone}</span>;
  if (t.dir === "stationery") {
    // A menu card's line: the sheet, a dotted leader, its number.
    return (
      <li className="flex items-baseline gap-2" style={{ fontSize: 13, padding: `${3 * t.k}px 0` }}>
        <span>
          {e.label}
          {zone}
        </span>
        <span className="flex-1" style={{ borderBottom: `1px dotted ${t.soft2}` }} />
        <span style={{ ...crewNums(t), color: t.soft }}>{e.sheet ? `גיליון ${e.sheet}` : "נספח"}</span>
      </li>
    );
  }
  if (t.dir === "lookbook") {
    return (
      <li className="flex items-baseline gap-3" style={{ fontSize: 13, padding: `${3 * t.k}px 0`, borderBottom: `0.5px solid ${t.hair}` }}>
        <span className="w-10 shrink-0" style={{ fontFamily: t.head, fontWeight: t.wHead, fontSize: 26, lineHeight: 0.9 }}>
          {e.sheet ? String(e.sheet).padStart(2, "0") : "—"}
        </span>
        <span style={{ fontWeight: 500 }}>{e.label}</span>
        {zone}
      </li>
    );
  }
  return (
    <li className="flex items-baseline gap-3" style={{ fontSize: 12.5, padding: `${3 * t.k}px 0`, borderBottom: `0.5px solid ${t.hair}` }}>
      <span className="w-12 shrink-0" style={{ fontFamily: t.mono, fontSize: 10.5, color: t.muted }}>
        {e.sheet ? String(e.sheet).padStart(2, "0") : "נספח"}
      </span>
      <span style={{ fontWeight: 500 }}>{e.label}</span>
      {zone}
    </li>
  );
}
