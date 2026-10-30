"use client";

import { useState } from "react";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import {
  CLOSED_LABEL,
  closedReason,
  ordersLine,
  type ActionTarget,
  type Checkpoint,
  type RunwayRow,
} from "@/lib/production/runway";
import { formatPrice } from "@/lib/catalog/format";
import { zonesLabelOf } from "@/lib/events/types";
import { Menu, type MenuItem } from "@/components/menu";
import { daysUntilLabel, rowDateLabel } from "./view-utils";

// One event on the runway.
//
// ── ONE CARD SHAPE, ONE DENSITY ────────────────────────────────────────────────────────────────
//
// This component is the ONLY thing this screen draws an event as. The board it replaces had two —
// a compact card on the pipeline and a roomier one in the archive — for the same object, so an
// event changed size and shape depending on which tab you were on and nothing about the two views
// could be compared. There is no `variant` prop here and there should never be one.
//
// ── SILENT WHEN NOTHING IS WRONG — AND NOTHING WHEN NOTHING IS LEFT ────────────────────────────
//
// A row on schedule is a white card, a date, a name, and the checkpoints STILL OPEN as quiet chips.
// A row with nothing open shows no chips at all. It used to draw every checkpoint, done ones as
// lavender ticks — which on the production lane was five ticks and a ring on every row, the exact
// opposite of F-10.6's "quiet when nothing is wrong". What is done is history; what is open is the
// work; only the open is drawn.
//
// Alert ink appears in exactly two places on this screen — a late checkpoint and a collision — and
// nowhere else. The alert is also the row's one BUTTON: runway.ts names the slip and the verb that
// fixes it (`row.action`), and the verb sits at the end of the band, so the designer never has to
// go looking for "where do I do that" in a menu.
//
// ── NO HOVER-REVEALED ACTIONS ──────────────────────────────────────────────────────────────────
//
// The actions are behind the "…" (components/menu.tsx), always visible, at muted weight. The old
// screen faded three icon buttons in on hover, which said nothing at all on the tablet this app is
// meant to be usable from and had nowhere to put a fourth. See the note at the top of menu.tsx.
export function RunwayRowCard({
  row,
  actions,
  onOpen,
  onAction,
  notes,
  showMoney,
  busy,
}: {
  row: RunwayRow;
  /** Built by the screen, so every row's menu is assembled in one place and the confirmations they
   *  raise are owned by one dialog rather than one per card. */
  actions: MenuItem[];
  /** The row's one primary click, on the client's name: the event's drawer. */
  onOpen: () => void;
  /** The alert's button — where `row.action` points. The screen decides how each target is reached. */
  onAction: (target: ActionTarget) => void;
  /** Collision warnings whose other half a filter has separated from this row — see planCollisions. */
  notes: string[];
  /** Whether any visible row has a quote total. When none does, the money column is not reserved;
   *  when one does, every row reserves it so the figures line up down the page (The Tabular Count
   *  Rule is about columns, and a column that only exists on some rows is not one). */
  showMoney: boolean;
  busy: boolean;
}) {
  const e = row.event;
  // The open panel hangs past the bottom of this card and the next row is later in the DOM, so
  // without lifting this one it is painted underneath its neighbour. Same fix, same reason, as
  // app/(app)/catalog/product-card.tsx.
  const [menuOpen, setMenuOpen] = useState(false);

  const open = row.checkpoints.filter((c) => !c.done);

  return (
    <li className={`relative ${menuOpen ? "z-30" : ""} ${busy ? "opacity-60" : ""}`}>
      {/* No hover lift: only the name is a target, and a card that rises under the cursor promises
          a click the card itself does not answer. */}
      <article className="rounded-md border border-border bg-surface px-4 py-3.5">
        {/* The chips wrap to a line of their own under the name on a narrow screen (`order-last
            basis-full`) and sit in the row on a wide one; the "…" stays on the first line either
            way, so the row's end never moves. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* WHEN. First in the reading order because the date is the deadline that never moved,
              and the days-until under it is the question this whole screen exists to answer. */}
          <div className="w-[104px] shrink-0">
            <div className="nums text-sm leading-tight font-bold text-ink">{rowDateLabel(e.date)}</div>
            <div className="nums mt-0.5 text-[11px] leading-tight text-muted">
              {daysUntilLabel(row.daysUntil)}
            </div>
          </div>

          <span className="h-9 w-px shrink-0 bg-border-soft" aria-hidden />

          {/* WHO, and how big. The name is the row's one primary target; everything else here is
              text, so there is no interactive element nested inside another one — the old board
              had role="button" spans inside a <button> and it was unusable from a keyboard. */}
          <div className="min-w-[180px] flex-1">
            <button
              type="button"
              onClick={onOpen}
              aria-label={`פתיחת האירוע של ${e.clientName}`}
              className="block max-w-full truncate rounded-sm text-start text-sm font-bold text-ink transition-colors hover:text-accent-hover"
            >
              {e.clientName}
            </button>
            <div className="nums mt-0.5 truncate text-[13px] text-muted">
              {zonesLabelOf(e)} · {e.guests || "—"} אורחים
            </div>
            {/* Two quiet facts about the production itself, only when there are any: who is on the
                truck, and what the suppliers have answered. Muted, one line, no colour — a declined
                order speaks through `row.alert` below, not here. */}
            {(e.crew?.length || e.orders) && (
              <div className="nums mt-0.5 truncate text-[12px] text-muted">
                {[e.crew?.length ? `צוות: ${e.crew.map((c) => c.name).join(", ")}` : null, ordersLine(e.orders)]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>

          {/* HOW MUCH. Owner-visible only, and it is a PRICE — what the client pays, off the last
              issued quote. No cost, no margin: those belong to the dashboard's event drawer, and
              `npm run check:costs` is what keeps them out of the printing surfaces. */}
          {showMoney && (
            <div className="w-[88px] shrink-0 text-end">
              {e.quoteTotal != null && (
                <span className="nums text-sm font-semibold text-ink-soft">{formatPrice(e.quoteTotal)}</span>
              )}
            </div>
          )}

          <div className="order-last flex basis-full flex-wrap items-center gap-1.5 lg:order-none lg:basis-auto">
            {row.lane === "closed" ? <ClosedWord row={row} /> : <OpenChips checkpoints={open} />}
          </div>

          <Menu
            label={`אפשרויות ל${e.clientName}`}
            items={actions}
            onOpenChange={setMenuOpen}
            // -me-1 pulls the icon button's own padding back out so the dot lines up with the
            // card's content edge rather than sitting a button's worth of air inside it.
            className="-me-1 shrink-0"
          />
        </div>

        {/* THE one line, when there is one. `alert` is already the single most urgent thing about
            this row — runway.ts picks the earliest-due slip, because that is the one whose delay
            made everything after it late — so this never becomes a list. */}
        {row.alert && (
          <AlertBand text={row.alert}>
            {row.action && (
              <button
                type="button"
                onClick={() => onAction(row.action!.target)}
                disabled={busy}
                className="ms-auto inline-flex shrink-0 items-center gap-1 rounded-sm bg-surface px-2.5 py-1 text-[12px] font-bold text-alert-ink transition-colors hover:bg-canvas disabled:opacity-50"
              >
                {row.action.label}
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </button>
            )}
          </AlertBand>
        )}
        {notes.map((note) => (
          <AlertBand key={note} text={note} />
        ))}
      </article>
    </li>
  );
}

/** The one place alert ink is allowed on a row. A tint wash, never a coloured side-stripe — that
 *  is banned outright (DESIGN.md § Don't) — and always with its glyph and its words, so it survives
 *  a black-and-white print and a colour-blind reader alike. `children` is the band's one button. */
function AlertBand({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-sm bg-alert-tint px-3 py-1.5 text-[13px] leading-snug font-semibold text-alert-ink">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <p className="min-w-0 py-0.5">{text}</p>
      {children}
    </div>
  );
}

// ── What is still open ─────────────────────────────────────────────────────────────────────────

/** The checkpoints not yet done, as chips — a late one in alert ink with its glyph, the rest quiet.
 *  Nothing when nothing is open: that row is complete, and silence is the message.
 *
 *  ⚠ SHAPE FIRST, THEN INK. The late chip differs from a pending one by its glyph, not only its
 *  hue, so the two stay two in greyscale (The Print Rule). The due date is the one fact the chip
 *  has no room for, so the tooltip carries it. */
function OpenChips({ checkpoints }: { checkpoints: Checkpoint[] }) {
  if (checkpoints.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="מה עוד פתוח">
      {checkpoints.map((c) => (
        <li
          key={c.id}
          title={c.dueDate ? `${c.label} · יעד ${rowDateLabel(c.dueDate)}` : c.label}
          className={
            "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[12px] leading-tight " +
            (c.late ? "bg-alert-tint font-semibold text-alert-ink" : "bg-inset font-medium text-muted")
          }
        >
          {c.late && <TriangleAlert className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
          {c.label}
          <span className="sr-only">{c.late ? "באיחור" : "טרם"}</span>
        </li>
      ))}
    </ul>
  );
}

/** A closed row says which ending it had. Three endings share the one lane (runway.ts
 *  `closedReason`), and "it happened" next to "they said no" should not look the same. */
function ClosedWord({ row }: { row: RunwayRow }) {
  return (
    <span className="inline-flex items-center rounded-sm bg-inset px-2 py-0.5 text-[12px] font-medium leading-tight text-muted">
      {CLOSED_LABEL[closedReason(row.event)]}
    </span>
  );
}

// ── The collision band ─────────────────────────────────────────────────────────────────────────

/**
 * Two events close enough together to be one problem, drawn as a band BETWEEN the two rows it
 * names rather than as a row of its own.
 *
 * It is deliberately not a card: a third card would read as a third event. It sits in the gap the
 * list already leaves between rows, inset from both edges, so it reads as a bracket joining the
 * pair above and below it — which is the only thing that makes "these two" legible without a line
 * being drawn from it to each of them.
 *
 * And it is NAMED, not charted. A Gantt makes you spot an overlap and then work out what it means;
 * `collisionsIn` has already worked it out and written the sentence — see the note on `Collision`.
 */
export function CollisionBand({ message }: { message: string }) {
  return (
    <li className="-my-1 flex justify-center px-10">
      <p
        role="note"
        className="inline-flex items-center gap-2 rounded-sm bg-alert-tint px-3 py-1 text-center text-[12px] leading-snug font-semibold text-alert-ink"
      >
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        {message}
      </p>
    </li>
  );
}
