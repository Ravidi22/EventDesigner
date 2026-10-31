"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, CalendarCheck, PackageSearch, Send, ShoppingCart, Truck, Warehouse } from "lucide-react";
import {
  assignSupplier,
  assignSupplierMany,
  fetchProcurement,
  fetchProcurementSetup,
  type ProcurementSetup,
} from "@/lib/suppliers/actions";
import { useSupplierPicker } from "@/lib/suppliers/use-suppliers";
import type { OrderLine, ProcurementReport, RentalLine, SupplierGroup } from "@/lib/suppliers/procurement";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { EmptyState } from "@/components/empty-state";
import { Select } from "@/components/select";
import { OrderDrawer, type OrderDraft } from "./order-drawer";
import { SupplierSelect } from "./supplier-select";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  onSend,
  children,
}: {
  group: Pick<SupplierGroup, "supplierId" | "supplierName" | "cost" | "partial">;
  /** The one verb a sourced group has: this is the order, send it. Absent on "ללא ספק". */
  onSend?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className={"text-sm font-semibold " + (group.supplierId ? "text-ink" : "text-muted")}>
          {group.supplierName}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-baseline gap-1.5">
            <span className="nums text-sm font-bold text-ink">{formatPrice(group.cost)}</span>
            {/* A total assembled from lines that have no cost is a FLOOR, and saying so is the whole
                difference between an estimate and a wrong number. */}
            {group.partial && <span className="text-xs text-muted">ומעלה — חסרות עלויות</span>}
          </span>
          {onSend && (
            <Button size="sm" variant="outline" onClick={onSend}>
              <Send className="h-3.5 w-3.5" strokeWidth={2} />
              שליחת הזמנה
            </Button>
          )}
        </span>
      </div>
      {children}
    </div>
  );
}

/** The "ללא ספק" group's fix, one line at a time: name who sells it, and the forecast regroups.
 *  A derived consumable (candles off a candlestick) has no row of its own and gets no select. */
function SupplierPick({ line, onPick }: { line: OrderLine; onPick: (variantId: string, supplierId: string) => void }) {
  const { suppliers, add } = useSupplierPicker(true);
  if (!UUID.test(line.variantId)) return <span className="text-xs text-muted">נגזר — אין שורה בקטלוג</span>;
  return (
    <SupplierSelect
      aria-label={`ספק ל${line.label}`}
      value=""
      suppliers={suppliers}
      noneLabel={null}
      placeholder="בחירת ספק…"
      onChange={(v) => v && onPick(line.variantId, v)}
      onCreate={add}
      className="w-44"
    />
  );
}

/** The "ללא ספק" group's fix for all of it at once — one florist for every stem on the list. The
 *  derived lines (candles off a candlestick) are passed over: they have no row to name a supplier on. */
function GroupSupplierPick({ group, onPick }: { group: SupplierGroup<OrderLine>; onPick: (variantIds: string[], supplierId: string) => void }) {
  const { suppliers, add } = useSupplierPicker(true);
  const ids = group.lines.map((l) => l.variantId).filter((id) => UUID.test(id));
  if (ids.length === 0) return null;
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      <span>שיוך כל השורות ל…</span>
      <SupplierSelect
        aria-label="ספק לכל השורות ללא ספק"
        value=""
        suppliers={suppliers}
        noneLabel={null}
        placeholder="בחירת ספק…"
        onChange={(v) => v && onPick(ids, v)}
        onCreate={add}
        className="w-44"
      />
    </span>
  );
}

/** What stands between the catalog and a forecast that says something — read off the catalog and
 *  the events, each line a way to fix it. The tab used to open on a table of "לא נספר" with no
 *  word why (2026-10-30); nothing here is a warning about the forecast's own arithmetic, that is
 *  `notices` below. Silent when there is nothing to fix. */
function SetupStrip({ setup, windowTo }: { setup: ProcurementSetup; windowTo: string }) {
  const rows: { icon: typeof ShoppingCart; text: string; href: string; action: string; tone: "warn" | "quiet" }[] = [];
  if (setup.unsourced > 0) {
    rows.push({
      icon: Truck,
      tone: "warn",
      text: `${setup.unsourced} פריטים שקונים או שוכרים — בלי ספק. בלי ספק הם לא יגיעו לשום הזמנה.`,
      href: "/catalog?sourcing=unsourced",
      action: "שיוך ספק",
    });
  }
  if (setup.awaitingClient > 0) {
    rows.push({
      icon: CalendarCheck,
      tone: "quiet",
      text: `${setup.awaitingClient} אירועים עם הצעת מחיר שיצאה, ממתינים לאישור הלקוח. רק אירוע מאושר נכנס להזמנה.`,
      href: "/production",
      action: "לאישור",
    });
  }
  if (setup.confirmedBeyond > 0) {
    rows.push({
      icon: CalendarCheck,
      tone: "quiet",
      text: `עוד ${setup.confirmedBeyond} אירועים מאושרים אחרי ${windowTo} — הרחיבו את הטווח כדי לראות אותם.`,
      href: "",
      action: "",
    });
  }
  if (setup.uncounted > 0) {
    rows.push({
      icon: Warehouse,
      tone: "quiet",
      text: `${setup.uncounted} פריטים מהמחסן שלא נספרו — מותר, אבל בלי ספירה אין מי שיגיד שחסר.`,
      href: "/catalog?sourcing=uncounted",
      action: "לספור",
    });
  }
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li
          key={r.text}
          className={
            "flex items-center gap-2 rounded-md border px-4 py-2 text-sm leading-relaxed " +
            (r.tone === "warn" ? "border-alert bg-alert-tint text-ink" : "border-border bg-surface text-ink-soft")
          }
        >
          <r.icon className={"h-4 w-4 shrink-0 " + (r.tone === "warn" ? "text-alert" : "text-accent")} strokeWidth={2} />
          <span className="min-w-0 flex-1">{r.text}</span>
          {r.href && (
            <Link href={r.href} className="shrink-0 text-sm font-semibold text-accent transition-colors hover:text-accent-hover">
              {r.action} ←
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

const rowClass = "border-b border-border-soft last:border-0";

/** The spare share of a line, as the florist will read it: "+14 (10% פחת)". */
function SpareNote({ line }: { line: OrderLine }) {
  if (!line.spare || line.spare.units <= 0) return null;
  return (
    <span className="nums ms-2 text-xs text-muted">
      +{line.spare.units} ({line.spare.rate}% פחת)
    </span>
  );
}

export function ProcurementTab() {
  // The next thirty days, not the calendar month: a confirmed wedding is usually weeks out, and a
  // tab that opened on "this month" opened empty for most of every month.
  const [preset, setPreset] = useState<Preset>("next30");
  const [range, setRange] = useState(() => presetRange("next30"));
  const [report, setReport] = useState<ProcurementReport | null>(null);
  const [setup, setSetup] = useState<ProcurementSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped after a send or a supplier pick, so the forecast is re-read against what changed.
  const [nonce, setNonce] = useState(0);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pick = async (variantId: string, supplierId: string) => {
    try {
      await assignSupplier(variantId, supplierId);
      setNonce((n) => n + 1);
    } catch {
      setError("לא ניתן לשייך ספק");
    }
  };

  const pickMany = async (variantIds: string[], supplierId: string) => {
    try {
      await assignSupplierMany(variantIds, supplierId);
      setNonce((n) => n + 1);
    } catch {
      setError("לא ניתן לשייך ספק");
    }
  };

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
        // The setup strip is a second, cheaper read; a failure there costs the strip, not the
        // forecast.
        const [next, s] = await Promise.all([
          fetchProcurement(range.from, range.to),
          fetchProcurementSetup(range.to).catch(() => null),
        ]);
        if (live) {
          setReport(next);
          setSetup(s);
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
  }, [range.from, range.to, nonce]);

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
        text: `${report.potential.events} אירועים בטווח שהלקוח עוד לא אישר. הם לא נכללים בהזמנה${
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
      {notice && (
        <p className="rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-ink-soft" role="status">
          {notice}
        </p>
      )}

      {setup && <SetupStrip setup={setup} windowTo={range.to} />}

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
          body="הרכש נגזר מהתוכניות עצמן: אירוע שהלקוח אישר (הכפתור 'הלקוח אישר' בהפקה) ושיש לו תוכנית מצוירת מזין את הרשימה אוטומטית. אין כאן מה למלא ביד — צריך אירוע מאושר בטווח, ופריטים שאומרים מאיפה הם מגיעים."
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
                    <GroupCard
                      key={g.supplierId ?? "none"}
                      group={g}
                      onSend={g.supplierId ? () => setDraft({ group: g, windowFrom: range.from, windowTo: range.to }) : undefined}
                    >
                      {!g.supplierId && (
                        <div className="border-b border-border-soft px-4 py-2">
                          <GroupSupplierPick group={g} onPick={pickMany} />
                        </div>
                      )}
                      <table className="w-full text-sm">
                        <tbody>
                          {g.lines.map((l) => (
                            <tr key={l.variantId} className={rowClass}>
                              <td className="px-4 py-2 text-ink">
                                {l.label}
                                {!g.supplierId && (
                                  <span className="ms-3 inline-block align-middle">
                                    <SupplierPick line={l} onPick={pick} />
                                  </span>
                                )}
                              </td>
                              <td className="nums w-48 px-4 py-2 text-start font-semibold text-ink">
                                {l.quantity} {l.unitLabel}
                                <SpareNote line={l} />
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
                    <GroupCard
                      key={g.supplierId ?? "none"}
                      group={g}
                      onSend={g.supplierId ? () => setDraft({ group: g, windowFrom: range.from, windowTo: range.to }) : undefined}
                    >
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

      {draft && (
        <OrderDrawer
          draft={draft}
          onSent={(text) => {
            setNotice(text);
            setNonce((n) => n + 1);
          }}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}
