// THE COVER OF A PRODUCTION SET — what the crew lead reads before unclipping anything: whose event,
// when, where, how big, and what is in the folder in what order. A set of nine sheets with no index
// is nine loose drawings; with one, a missing page is noticed in the van rather than in the hall.
//
// Black ink on white, like every sheet behind it — this page is photocopied with the rest. Counts
// only: a printing surface never carries a price (npm run check:costs).

export interface SetEntry {
  /** The framed sheet's number ("גיליון 3 / 9"), or null for a schedule page (they are unnumbered). */
  sheet: number | null;
  label: string;
  /** The zone it covers, when it is one zone's sheet. */
  zone?: string;
}

export function SetCover({
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
  return (
    <div className="flex h-full flex-col text-ink">
      <header className="border-b-2 border-ink pb-4">
        {studio && <p className="text-sm font-semibold text-ink-soft">{studio}</p>}
        <h1 className="mt-6 text-[34px] font-bold leading-tight">חוברת הפקה</h1>
        <p className="mt-1 text-xl font-semibold">{client || "אירוע ללא שם"}</p>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
        {facts.map(([k, v]) => (
          <div key={k} className="border-b border-border pb-2">
            <dt className="text-caption text-muted">{k}</dt>
            <dd className="nums mt-0.5 text-base font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-8">
        <h2 className="mb-2 border-b border-ink pb-1 text-base font-semibold">תוכן החוברת</h2>
        <ol className="divide-y divide-border">
          {entries.map((e, i) => (
            <li key={i} className="flex items-baseline gap-3 py-1.5 text-sm">
              <span className="nums w-12 shrink-0 text-ink-soft">{e.sheet ? `גיליון ${e.sheet}` : "נספח"}</span>
              <span className="font-semibold">{e.label}</span>
              {e.zone && <span className="text-ink-soft">· {e.zone}</span>}
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-auto pt-6 text-caption text-muted">
        השרטוטים בקנה מידה מוצהר — סרגל הקנה בכל גיליון נשאר נכון גם בצילום מוקטן. אותיות בעיגול ליד מספרי השולחנות מפנות לערכת העיצוב ולפרט השולחן שלה.
      </p>
    </div>
  );
}
