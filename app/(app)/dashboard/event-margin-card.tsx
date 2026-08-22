"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Plus } from "lucide-react";
import { fetchEventMargin } from "@/lib/suppliers/actions";
import type { EventMargin } from "@/lib/suppliers/types";
import { formatPrice } from "@/lib/catalog/format";

// ⚠ INTERNAL, and it lives HERE rather than on the outputs screen on purpose. The outputs screen
// is a printing surface — its three views become paper that goes to a crew and to a client — and a
// cost column has no business being one keystroke away from a quote. The event drawer is never
// printed, never shown in a meeting, and is exactly where "was this job worth it" gets asked.
export function EventMarginCard({ eventId }: { eventId: string }) {
  const [margin, setMargin] = useState<EventMargin | null>(null);

  useEffect(() => {
    let live = true;
    fetchEventMargin(eventId)
      .then((m) => {
        if (live) setMargin(m);
      })
      // Silent: the drawer's job is the event, and a costing panel that failed to load must not
      // put an error banner over the client's phone number.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [eventId]);

  if (!margin) return null;

  const { quoted, spent, profit, ratio } = margin;
  // Nothing quoted and nothing spent is not a zero-margin event, it is an event with no money in it
  // yet — and a card full of ₪0 would read as a fact rather than as an absence.
  if (quoted === undefined && spent === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted">רווחיות</h3>
        <Link
          href={`/suppliers?tab=expenses&event=${eventId}`}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          רישום הוצאה
        </Link>
      </div>

      <div className="rounded-md border border-border bg-surface p-4 text-sm">
        <div className="flex items-center justify-between gap-2.5 text-ink-soft">
          <span className="flex items-center gap-2.5">
            <Coins className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
            הצעת מחיר
          </span>
          <span className="nums font-medium text-ink">
            {quoted === undefined ? <span className="text-muted">טרם הונפקה</span> : formatPrice(quoted)}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2.5 border-t border-border-soft pt-3 text-ink-soft">
          <span>הוצאות</span>
          <span className="nums font-medium text-ink">{formatPrice(spent)}</span>
        </div>

        {profit !== undefined && (
          <div className="mt-3 flex items-baseline justify-between gap-2.5 border-t border-border-soft pt-3">
            <span className="text-ink-soft">רווח</span>
            <span className="flex items-baseline gap-1.5">
              <span className={"nums text-lg font-bold " + (profit < 0 ? "text-alert" : "text-ink")}>
                {formatPrice(profit)}
              </span>
              {ratio !== undefined && (
                <span className="nums text-xs text-muted">{Math.round(ratio * 100)}%</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
