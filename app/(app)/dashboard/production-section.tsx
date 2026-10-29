"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, TriangleAlert } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { fetchEventProduction, type EventProduction, type ExportStamp } from "@/lib/production/actions";
import type { OrderStatus } from "@/lib/orders/types";
import { ORDER_STATUS_LABEL } from "@/lib/orders/types";
import { formatAmount } from "@/lib/catalog/format";
import { CrewDialog } from "@/components/crew-dialog";
import { Skeleton } from "@/components/skeleton";
import { StatusChip } from "@/components/status-chip";
import { DrawerSection, SectionAction } from "./drawer-section";

// THE PRODUCTION OF ONE EVENT — the drawer's answer to "is this going to be there on the day".
//
// Shown once the client has said yes (the drawer's booking card is the surface before that). Five
// facts, every one derived from rows the studio already produced by doing the work, read in one
// call when the drawer opens (fetchEventProduction):
//
//   צוות    who is on the truck — the one typed fact, edited from here
//   ציוד    the drawing's owned items against the stock on that day, and its rented/consumable
//           lines against the orders sent for it
//   הזמנות  each order whose window covers the day, with the supplier's answer
//   פלטים   the latest packing list and map set, and whether the drawing moved since
//   לקוח    changes the client sent and nobody answered
//
// No price anywhere in it: equipment is counted, orders are counted, and the cost of either stays
// on the suppliers screen. Quiet when nothing is wrong — alert ink only where something is short,
// missing, refused, or stale.
export function ProductionSection({ event, onChanged }: { event: EventSummary; onChanged: () => void }) {
  const [data, setData] = useState<EventProduction | null>(null);
  const [error, setError] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);
  // Bumped after the crew is saved, so the section re-reads itself without the drawer remounting.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    fetchEventProduction(event.id)
      .then((d) => {
        if (!live) return;
        setError(false);
        setData(d);
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [event.id, tick]);

  return (
    <>
      <DrawerSection
        title="הפקה"
        action={
          <SectionAction icon={Pencil} onClick={() => setCrewOpen(true)}>
            צוות הקמה
          </SectionAction>
        }
      >
        {error ? (
          <p className="text-ink-soft">לא ניתן לטעון את פרטי ההפקה.</p>
        ) : !data ? (
          <div className="space-y-3" role="status" aria-label="טוען">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ) : (
          <dl className="space-y-4">
            <Row label="צוות">
              {data.crew.length ? data.crew.map((c) => c.name).join(", ") : <Quiet>עוד לא נבחר צוות</Quiet>}
            </Row>

            <Equipment data={data} />

            <Row label="הזמנות">
              {data.orders.length === 0 ? (
                <Quiet>לא נשלחו הזמנות לספקים לתאריך הזה</Quiet>
              ) : (
                <ul className="space-y-1.5">
                  {data.orders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {o.supplierName}
                        <span className="nums text-muted"> · {o.lines} שורות</span>
                      </span>
                      <StatusChip tone={TONE[o.status]} className="shrink-0">
                        {ORDER_STATUS_LABEL[o.status]}
                      </StatusChip>
                    </li>
                  ))}
                </ul>
              )}
              <Go href="/suppliers?tab=orders">להזמנות</Go>
            </Row>

            <Row label="פלטים">
              <ul className="space-y-1">
                <li>
                  <Printed label="רשימת ציוד" stamp={data.outputs.packing} current={data.outputs.currentVersion} />
                </li>
                <li>
                  <Printed label="מפות הצבה" stamp={data.outputs.map} current={data.outputs.currentVersion} />
                </li>
              </ul>
            </Row>

            {data.proposalSince !== undefined && (
              <Row label="לקוח">
                <Warn>הלקוח שלח שינויים לסקיצה {sinceLabel(data.proposalSince)} — ממתינים לתשובה</Warn>
              </Row>
            )}
          </dl>
        )}
      </DrawerSection>

      {crewOpen && (
        <CrewDialog
          eventId={event.id}
          clientName={event.clientName}
          crewIds={(data?.crew ?? []).map((c) => c.id)}
          onSaved={() => {
            setTick((t) => t + 1);
            onChanged();
          }}
          onClose={() => setCrewOpen(false)}
        />
      )}
    </>
  );
}

const TONE: Record<OrderStatus, "neutral" | "success" | "warn" | "alert"> = {
  sent: "warn",
  confirmed: "success",
  partial: "warn",
  delivered: "success",
  declined: "alert",
};

/** The equipment line, and under it only what is wrong: the owned items the day is short of, and
 *  the sourced lines no confirmed order covers. Covered lines are a count, not a list. */
function Equipment({ data }: { data: EventProduction }) {
  const r = data.readiness;
  if (!r) {
    return (
      <Row label="ציוד">
        <Quiet>אין עדיין סקיצה לספור ממנה</Quiet>
      </Row>
    );
  }
  const s = r.summary;
  const ownedLine = [
    s.ownedOk ? `${s.ownedOk} מכוסים` : null,
    s.ownedShort ? `${s.ownedShort} חסרים` : null,
    s.ownedUncounted ? `${s.ownedUncounted} ללא ספירת מלאי` : null,
  ].filter(Boolean);
  const sourcedLine = [
    s.sourcedCovered ? `${s.sourcedCovered} אושרו` : null,
    s.sourcedOpen ? `${s.sourcedOpen} ממתינים לתשובה` : null,
    s.sourcedMissing ? `${s.sourcedMissing} ללא הזמנה` : null,
  ].filter(Boolean);
  const short = r.owned.filter((l) => l.shortfall !== undefined);
  const missing = r.sourced.filter((l) => l.state === "none" || l.state === "declined");

  return (
    <Row label="ציוד">
      {r.owned.length > 0 && (
        <p className="nums">
          מהמלאי: {ownedLine.join(" · ")}
        </p>
      )}
      {r.sourced.length > 0 && (
        <p className="nums">
          מספקים: {sourcedLine.join(" · ")}
        </p>
      )}
      {r.owned.length === 0 && r.sourced.length === 0 && <Quiet>אין פריטים בסקיצה</Quiet>}
      {!data.measured && <Quiet>כמויות הווילונות נספרו לפי הקטלוג — תוכנית המתחם לא נגישה.</Quiet>}
      {short.length > 0 && (
        <ul className="mt-2 space-y-1">
          {short.map((l) => (
            <li key={l.variantId}>
              <Warn>
                {l.label}: <span className="nums">חסרים {formatAmount(l.shortfall!, "unit")}</span>
                <span className="nums font-normal">
                  {" "}
                  ({formatAmount(l.needed, "unit")} כאן{l.elsewhere ? ` + ${formatAmount(l.elsewhere, "unit")} באירוע אחר` : ""}, במלאי {formatAmount(l.stockQty ?? 0, "unit")})
                </span>
              </Warn>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <ul className="mt-2 space-y-1">
          {missing.map((l) => (
            <li key={l.variantId}>
              <Warn>
                {l.label}: <span className="nums">{formatAmount(l.needed, "unit")} {l.unitLabel}</span>
                {l.state === "declined" ? " — הספק דחה" : " — ללא הזמנה"}
                {l.supplierName && <span className="font-normal"> ({l.supplierName})</span>}
              </Warn>
            </li>
          ))}
        </ul>
      )}
      <Go href="/suppliers?tab=procurement">לרכש</Go>
    </Row>
  );
}

/** "גרסה 3 · 12 באוק׳", and whether the drawing has moved since it was printed. */
function Printed({ label, stamp, current }: { label: string; stamp?: ExportStamp; current?: number }) {
  if (!stamp) {
    return (
      <span>
        {label}: <Quiet inline>לא הופק</Quiet>
      </span>
    );
  }
  const stale = current !== undefined && current > stamp.documentVersion;
  const at = new Date(stamp.at).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  return (
    <span className="nums">
      {label}: גרסה {stamp.number} · {at}
      {stale && (
        <span className="ms-1.5 inline-flex items-center gap-1 text-alert-ink">
          <TriangleAlert className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          השרטוט השתנה מאז
        </span>
      )}
    </span>
  );
}

function sinceLabel(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000);
  return days <= 0 ? "היום" : days === 1 ? "אתמול" : `לפני ${days} ימים`;
}

/** One fact of the production: its name over its value, like the brief's `Fact`. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 space-y-1 font-medium text-ink">{children}</dd>
    </div>
  );
}

function Quiet({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return <span className={"font-normal text-ink-soft " + (inline ? "" : "block")}>{children}</span>;
}

/** The one place alert ink is allowed in this section — with its glyph, so it survives greyscale. */
function Warn({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-1.5 text-[13px] font-semibold leading-snug text-alert-ink">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

function Go({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-accent-hover">
      {children}
      <ArrowLeft className="h-3 w-3" strokeWidth={2.25} aria-hidden />
    </Link>
  );
}
