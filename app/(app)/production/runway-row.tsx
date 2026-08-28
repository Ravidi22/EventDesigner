"use client";

import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import type { Checkpoint, RunwayRow } from "@/lib/production/runway";
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
// ── SILENT WHEN NOTHING IS WRONG ───────────────────────────────────────────────────────────────
//
// A row on schedule is a white card, a date, a name and six quiet dots. Alert ink appears in
// exactly two places on this screen — a late checkpoint and a collision — and nowhere else. If the
// designer opens this and everything is on time, the screen is a list of dates and names, and that
// is the intended aesthetic, not an unfinished one.
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
  notes,
  showMoney,
  weekAnchor,
  busy,
}: {
  row: RunwayRow;
  /** Built by the screen, so every row's menu is assembled in one place and the confirmations they
   *  raise are owned by one dialog rather than one per card. */
  actions: MenuItem[];
  /** The row's one primary click, on the client's name. */
  onOpen: () => void;
  /** Collision warnings whose other half a filter has separated from this row — see planCollisions. */
  notes: string[];
  /** Whether any visible row has a quote total. When none does, the money column is not reserved;
   *  when one does, every row reserves it so the figures line up down the page (The Tabular Count
   *  Rule is about columns, and a column that only exists on some rows is not one). */
  showMoney: boolean;
  /** Set on the first row of each week — the target `LoadRibbon` scrolls to. */
  weekAnchor?: string;
  busy: boolean;
}) {
  const e = row.event;
  // The open panel hangs past the bottom of this card and the next row is later in the DOM, so
  // without lifting this one it is painted underneath its neighbour. Same fix, same reason, as
  // app/(app)/catalog/product-card.tsx.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <li
      data-week={weekAnchor}
      // Clears the sticky month header when the ribbon scrolls this row into view. scrollIntoView
      // honours scroll-margin; without it the row lands underneath the header that named its month.
      className={`scroll-mt-11 relative ${menuOpen ? "z-30" : ""} ${busy ? "opacity-60" : ""}`}
    >
      <article className="rounded-md border border-border bg-surface px-4 py-3.5 transition-shadow duration-150 ease-fluid hover:shadow-floating">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
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
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpen}
              aria-label={`פתיחת ${e.clientName} בסטודיו`}
              className="block max-w-full truncate rounded-sm text-start text-sm font-bold text-ink transition-colors hover:text-accent-hover"
            >
              {e.clientName}
            </button>
            <div className="nums mt-0.5 truncate text-[13px] text-muted">
              {zonesLabelOf(e)} · {e.guests || "—"} אורחים
            </div>
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

          <ReadinessStrip checkpoints={row.checkpoints} />

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
        {row.alert && <AlertBand text={row.alert} />}
        {notes.map((note) => (
          <AlertBand key={note} text={note} />
        ))}
      </article>
    </li>
  );
}

/** The one place alert ink is allowed on a row. A tint wash, never a coloured side-stripe — that
 *  is banned outright (DESIGN.md § Don't) — and always with its glyph and its words, so it survives
 *  a black-and-white print and a colour-blind reader alike. */
function AlertBand({ text }: { text: string }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-sm bg-alert-tint px-3 py-2 text-[13px] leading-snug font-semibold text-alert-ink">
      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      {text}
    </p>
  );
}

// ── The readiness strip ────────────────────────────────────────────────────────────────────────

/** The three states a checkpoint can be in on screen, and what each one is drawn as.
 *
 *  ⚠ SHAPE FIRST, THEN INK. Every operational surface in this product has to survive black-and-white
 *  printing (The Print Rule), and a strip of six dots that differ only in hue is exactly the thing
 *  that does not. So: hollow ring = not yet, filled + tick = done, filled + triangle = late — three
 *  silhouettes that stay three silhouettes in greyscale. The label under each is always there and
 *  always says which checkpoint it is, so nothing here needs a legend either. */
const STATE = {
  pending: {
    disc: "border border-border bg-canvas",
    label: "text-quiet",
    word: "טרם",
  },
  done: {
    disc: "bg-accent-tint text-accent",
    label: "text-muted",
    word: "הושלם",
  },
  late: {
    disc: "bg-alert-tint text-alert-ink",
    label: "text-alert-ink font-semibold",
    word: "באיחור",
  },
} as const;

function ReadinessStrip({ checkpoints }: { checkpoints: Checkpoint[] }) {
  return (
    // A list, not a bar: six named things, each with a state, is a list — and that is also what
    // makes it navigable by a screen reader instead of being one opaque graphic.
    <ul className="flex shrink-0 items-start gap-1.5" aria-label="מוכנות האירוע">
      {checkpoints.map((c) => {
        const state = c.late ? "late" : c.done ? "done" : "pending";
        const s = STATE[state];
        return (
          <li
            key={c.id}
            // The due date is the one fact the visible label has no room for, so the tooltip
            // carries it. Not the only place it lives — a late checkpoint is also what `row.alert`
            // is built from, in words, right underneath.
            title={c.dueDate ? `${c.label} · ${s.word} · יעד ${rowDateLabel(c.dueDate)}` : `${c.label} · ${s.word}`}
            className="flex w-[46px] flex-col items-center gap-1"
          >
            <span
              aria-hidden
              className={`flex h-5 w-5 items-center justify-center rounded-full ${s.disc}`}
            >
              {state === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
              {state === "late" && <TriangleAlert className="h-3 w-3" strokeWidth={2.25} />}
            </span>
            <span className={`w-full truncate text-center text-[11px] leading-none ${s.label}`}>
              {c.label}
            </span>
            <span className="sr-only">{s.word}</span>
          </li>
        );
      })}
    </ul>
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
