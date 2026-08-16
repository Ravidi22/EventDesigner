"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, PackageSearch, ShoppingCart, Truck } from "lucide-react";
import { fetchProcurement } from "@/lib/suppliers/actions";
import type { ProcurementReport, RentalLine, SupplierGroup } from "@/lib/suppliers/procurement";
import { formatPrice } from "@/lib/catalog/format";
import { DateField } from "@/components/date-field";
import { EmptyState } from "@/components/empty-state";
import { Select } from "@/components/select";

// ── The window ─────────────────────────────────────────────────────────────────────────────────
// Local calendar days throughout, never UTC: `toISOString().slice(0,10)` is yesterday for anyone
// working after 9pm in Israel, and a forecast that silently starts a day early is exactly the kind
// of wrong that looks right.
const iso = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shift = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

type Preset = "week" | "month" | "next30" | "custom";

const PRESET_LABEL: Record<Preset, string> = {
  week: "השבוע",
  month: "החודש",
  next30: "30 הימים הקרובים",
  custom: "טווח מותאם",
};

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  if (preset === "week") {
    // The Israeli week starts on Sunday, which is getDay() === 0 — so the offset IS getDay().
    const start = shift(now, -now.getDay());
    return { from: iso(start), to: iso(shift(start, 6)) };
  }
  if (preset === "month") {
    return {
      from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  return { from: iso(now), to: iso(shift(now, 30)) };
}

// ── Pieces ─────────────────────────────────────────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  title,
  hint,
  trailing,
}: {
  icon: typeof ShoppingCart;
  title: string;
  hint: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
        <h3 className="font-display text-base text-ink">{title}</h3>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      {trailing}
    </div>
  );
}

function GroupCard({
  group,
  children,
}: {
  group: Pick<SupplierGroup, "supplierId" | "supplierName" | "cost" | "partial">;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className={"text-sm font-semibold " + (group.supplierId ? "text-ink" : "text-muted")}>
          {group.supplierName}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="nums text-sm font-bold text-ink">{formatPrice(group.cost)}</span>
          {/* A total assembled from lines that have no cost is a FLOOR, and saying so is the whole
              difference between an estimate and a wrong number. */}
          {group.partial && <span className="text-xs text-muted">ומעלה — חסרות עלויות</span>}
        </span>
      </div>
      {children}
    </div>
  );
}

const rowClass = "border-b border-border-soft last:border-0";

export function ProcurementTab() {
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState(() => presetRange("month"));
  const [report, setReport] = useState<ProcurementReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setPresetAndRange = (next: Preset) => {
    setPreset(next);
    if (next !== "custom") setRange(presetRange(next));
  };

  // Refetches whenever the window changes — including while a custom range is half-typed, which is
  // why an incomplete or inverted range returns early rather than asking the server about it.
  useEffect(() => {
    if (range.from === "" || range.to === "" || range.from > range.to) return;
    let live = true;
    void (async () => {
      setLoading(true);
      try {
        const next = await fetchProcurement(range.from, range.to);
        if (live) {
          setReport(next);
          setError(null);
        }
      } catch {
        if (live) setError("לא ניתן לחשב את הרכש");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [range.from, range.to]);

  const notices = useMemo(() => {
    if (!report) return [];
    const list: { tone: "warn" | "quiet"; text: string }[] = [];
    const c = report.coverage;
    if (c.undrawn > 0) {
      list.push({
        tone: "warn",
        text: `${c.undrawn} מתוך ${c.events} האירועים בטווח עדיין לא תוכננו — מה שצריך עבורם לא נספר כאן.`,
      });
    }
    if (c.unmeasured > 0) {
      list.push({
        tone: "warn",
        text: `${c.unmeasured} אירועים נספרו לפי מידות הקטלוג ולא לפי תוכנית המתחם — כמויות של וילונות ושטיחים שם הן הערכת מינימום.`,
      });
    }
    if (report.potential.events > 0) {
      list.push({
        tone: "quiet",
        text: `${report.potential.events} אירועים בטווח עדיין ללא הצעת מחיר חתומה. הם לא נכללים בהזמנה${
          report.potential.cost > 0 ? ` — היו מוסיפים כ־${formatPrice(report.potential.cost)}` : ""
        }.`,
      });
    }
    return list;
  }, [report]);

  const empty =
    report && report.order.length === 0 && report.rentals.length === 0 && report.stock.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5">
        <Select
          value={preset}
          onChange={(v) => setPresetAndRange(v as Preset)}
          aria-label="טווח תאריכים"
          options={(Object.keys(PRESET_LABEL) as Preset[]).map((p) => ({ value: p, label: PRESET_LABEL[p] }))}
          className="w-44 shrink-0"
        />
        <DateField
          value={range.from}
          onChange={(from) => {
            setPreset("custom");
            setRange((r) => ({ ...r, from }));
          }}
          aria-label="מתאריך"
          className="w-36"
        />
        <span className="text-sm text-muted">עד</span>
        <DateField
          value={range.to}
          min={range.from || undefined}
          onChange={(to) => {
            setPreset("custom");
            setRange((r) => ({ ...r, to }));
          }}
          aria-label="עד תאריך"
          className="w-36"
        />

        {report && (
          <span className="ms-auto flex shrink-0 items-baseline gap-1.5">
            <span className="text-sm text-muted">הערכת עלות</span>
            <span className="nums text-lg font-bold text-ink">{formatPrice(report.cost)}</span>
            {report.costPartial && <span className="text-xs text-muted">ומעלה</span>}
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-alert bg-alert-tint px-4 py-2.5 text-sm text-ink" role="alert">
          {error}
        </p>
      )}

      {notices.map((n) => (
        <p
          key={n.text}
          role="status"
          className={
            "flex items-start gap-2 rounded-md border px-4 py-2.5 text-sm leading-relaxed " +
            (n.tone === "warn"
              ? "border-alert bg-alert-tint text-ink"
              : "border-border bg-surface text-ink-soft")
          }
        >
          {n.tone === "warn" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert" strokeWidth={2} />}
          {n.text}
        </p>
      ))}

      {loading && !report ? (
        <p className="py-20 text-center text-sm text-muted" aria-busy="true">
          מחשב את הרכש…
        </p>
      ) : empty ? (
        <EmptyState
          icon={PackageSearch}
          title="אין מה להזמין בטווח הזה"
          body="הרכש נגזר מהתוכניות עצמן: אירוע שיש לו הצעת מחיר חתומה ותוכנית מצוירת מזין את הרשימה אוטומטית. אין כאן מה למלא ביד — צריך אירוע סגור בטווח."
        />
      ) : (
        report && (
          <div className="flex flex-col gap-6">
            {report.order.length > 0 && (
              <section>
                <SectionHeading
                  icon={ShoppingCart}
                  title="להזמין"
                  hint="פריטים מתכלים — הסכום של כל האירועים הסגורים בטווח"
                />
                <div className="flex flex-col gap-3">
                  {report.order.map((g) => (
                    <GroupCard key={g.supplierId ?? "none"} group={g}>
                      <table className="w-full text-sm">
                        <tbody>
                          {g.lines.map((l) => (
                            <tr key={l.variantId} className={rowClass}>
                              <td className="px-4 py-2 text-ink">{l.label}</td>
                              <td className="nums w-40 px-4 py-2 text-start font-semibold text-ink">
                                {l.quantity} {l.unitLabel}
                              </td>
                              <td className="nums w-28 px-4 py-2 text-start text-ink-soft">
                                {l.cost === undefined ? (
                                  <span className="text-muted">ללא עלות</span>
                                ) : (
                                  formatPrice(l.cost)
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </GroupCard>
                  ))}
                </div>
              </section>
            )}

            {report.rentals.length > 0 && (
              <section>
                <SectionHeading
                  icon={Truck}
                  title="השכרות"
                  hint="שורת הזמנה לכל אירוע בנפרד — מגיע ליום אחד וחוזר"
                />
                <div className="flex flex-col gap-3">
                  {report.rentals.map((g) => (
                    <GroupCard key={g.supplierId ?? "none"} group={g}>
                      <table className="w-full text-sm">
                        <tbody>
                          {g.lines.map((l: RentalLine) => (
                            <tr key={`${l.eventId}-${l.variantId}`} className={rowClass}>
                              <td className="nums w-28 px-4 py-2 text-ink-soft" dir="ltr">
                                {l.date}
                              </td>
                              <td className="px-4 py-2 text-ink-soft">{l.eventLabel}</td>
                              <td className="px-4 py-2 text-ink">{l.label}</td>
                              <td className="nums w-32 px-4 py-2 text-start font-semibold text-ink">
                                {l.quantity} {l.unitLabel}
                              </td>
                              <td className="nums w-28 px-4 py-2 text-start text-ink-soft">
                                {l.cost === undefined ? (
                                  <span className="text-muted">ללא עלות</span>
                                ) : (
                                  formatPrice(l.cost)
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </GroupCard>
                  ))}
                </div>
              </section>
            )}

            {report.stock.length > 0 && (
              <section>
                <SectionHeading
                  icon={Boxes}
                  title="מלאי"
                  hint="מה שיש לך — לא סכום חודשי אלא היום העמוס ביותר"
                />
                <div className="overflow-hidden rounded-lg border border-border bg-surface">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted">
                        <th className="px-4 py-2.5 text-start font-medium">פריט</th>
                        <th className="px-4 py-2.5 text-start font-medium">שיא ביום אחד</th>
                        <th className="px-4 py-2.5 text-start font-medium">מתי</th>
                        <th className="px-4 py-2.5 text-start font-medium">יש לך</th>
                        <th className="px-4 py-2.5 text-start font-medium">חסר</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.stock.map((s) => (
                        <tr key={s.variantId} className={rowClass}>
                          <td className="px-4 py-2.5 text-ink">{s.label}</td>
                          <td className="nums px-4 py-2.5 font-semibold text-ink">
                            {s.peak} {s.unitLabel}
                          </td>
                          <td className="px-4 py-2.5 text-ink-soft">
                            <span className="nums" dir="ltr">
                              {s.peakDate}
                            </span>
                            {s.peakEvents > 1 && (
                              <span className="text-muted"> · {s.peakEvents} אירועים באותו יום</span>
                            )}
                          </td>
                          <td className="nums px-4 py-2.5 text-ink-soft">
                            {s.stockQty ?? <span className="text-muted">לא נספר</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {s.shortfall !== undefined ? (
                              <span className="nums inline-flex items-center gap-1 rounded-pill bg-alert-tint px-2 py-0.5 text-xs font-semibold text-alert">
                                <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                                {s.shortfall}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 px-1 text-xs leading-relaxed text-muted">
                  &quot;לא נספר&quot; הוא מצב אמיתי ולא שדה חסר: פריט שלא רשמת כמה יש לך מציג ביקוש
                  ולא טוען שחסר. זמן החזרה מאירוע לאירוע לא מחושב — השיא נמדד לפי יום קלנדרי.
                </p>
              </section>
            )}
          </div>
        )
      )}
    </div>
  );
}
