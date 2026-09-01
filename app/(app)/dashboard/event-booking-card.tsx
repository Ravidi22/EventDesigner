"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ReceiptText } from "lucide-react";
import { confirmEvent } from "@/lib/events/actions";
import type { EventSummary } from "@/lib/events/types";
import { formatEventDate } from "@/lib/events/types";
import { fetchIssuedQuote, type IssuedQuote } from "@/lib/quotes/actions";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";

// The money the CLIENT sees, and the one answer the client gives — in one card, because they are
// one conversation: you send a number, and then you find out.
//
// ⚠ THIS IS NOT THE MARGIN CARD THAT USED TO SIT HERE. That one showed what the studio SPENT
// (lib/suppliers/), which is why `npm run check:costs` exists and why it was never allowed near
// /outputs. Everything here is `issued_quotes.total` — the price on the sheet the client was
// handed — so it is legal on any internal surface. Do not grow a cost or a profit line into it.
//
// ── WHY THE CONFIRMATION LIVES HERE ────────────────────────────────────────────────────────────
// `events.confirmedAt` is the one fact in this app nobody can derive (CLAUDE.md), and until now the
// only button that set it was on /production — a screen about DEADLINES. But "the client said yes"
// is not something you learn from a runway, it is something you are told on the phone while the
// event's own drawer is open, and it is only meaningful next to the number they said yes TO.
// `confirmEvent` refuses before a quote has gone out and says so, so the button appears only where
// it can succeed, and the refusal is still rendered if the server disagrees.
export function EventBookingCard({ event, onConfirmed }: { event: EventSummary; onConfirmed: () => void }) {
  const [quote, setQuote] = useState<IssuedQuote | null>(null);
  // Seeded from the event and then owned here: the confirmation has to show the moment it lands,
  // and the screen's own list arrives a round trip later. Mounted with key={event.id} by the
  // drawer, so opening another event is a fresh card rather than this one's answer carried over.
  const [confirmedAt, setConfirmedAt] = useState(event.confirmedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchIssuedQuote(event.id)
      .then((q) => {
        if (live) setQuote(q);
      })
      // Silent, like the card that stood here before it: a panel that failed to load must not put
      // an error banner over the client's phone number.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [event.id]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await confirmEvent(event.id);
      if (outcome.error) setError(outcome.error);
      else {
        setConfirmedAt(outcome.event.confirmedAt);
        onConfirmed();
      }
    } catch {
      setError("האישור לא נשמר — נסו שוב");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-muted">הצעת מחיר</h3>
      <div className="rounded-md border border-border bg-surface p-4 text-sm">
        <div className="flex items-center justify-between gap-2.5 text-ink-soft">
          <span className="flex items-center gap-2.5">
            <ReceiptText className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
            סכום
          </span>
          <span className="nums font-medium text-ink">
            {quote ? formatPrice(quote.total) : <span className="text-muted">טרם הונפקה</span>}
          </span>
        </div>

        {quote && (
          <p className="nums mt-1.5 text-xs text-muted">
            הונפקה {formatEventDate(new Date(quote.issuedAt).toISOString().slice(0, 10))} · גרסה{" "}
            {quote.documentVersion}
          </p>
        )}

        {confirmedAt ? (
          // A fact, not a control. Confirming twice cannot move the date (COALESCE, see
          // confirmEvent), and un-confirming is a different question — it lives on /production
          // with the loss and the archive, which are its neighbours.
          <p className="mt-3 flex items-center gap-2 border-t border-border-soft pt-3 font-medium text-success-ink">
            <BadgeCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="nums">
              ההזמנה אושרה · {formatEventDate(new Date(confirmedAt).toISOString().slice(0, 10))}
            </span>
          </p>
        ) : (
          event.quoteSentAt && (
            <div className="mt-3 border-t border-border-soft pt-3">
              <Button variant="outline" className="w-full" onClick={() => void confirm()} disabled={busy}>
                <BadgeCheck className="h-4 w-4" strokeWidth={2} />
                הלקוח אישר
              </Button>
            </div>
          )
        )}

        {error && (
          <p role="status" className="mt-3 text-xs font-medium text-alert-ink">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
