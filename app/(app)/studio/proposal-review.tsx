"use client";
// The designer's review of a client's sketch proposal — the delta, drawn on the room, and a list to
// tick (docs/superpowers/specs/2026-10-16-client-side-design.md §2.7–2.8).
//
// It lies OVER the studio's canvas as its own read-only CanvasStage, rather than as a mode threaded
// through the studio's handlers: nothing on the plan can be dragged while a decision is being made,
// and the studio screen learns exactly two things — that there is a proposal, and the drawing to put
// into its history when the designer says yes (one `loadDocument` entry, so Ctrl+Z takes an approval
// back like any other edit).
//
// What is drawn is the designer's CURRENT drawing with the ticked changes merged in
// (lib/design-document/delta.ts mergeChanges) — so unticking a move puts the table back, and the
// room can be seen both ways before anything is decided. A change to something the designer has
// also changed since the client forked the sketch is a CONFLICT: flagged, unticked by default, and
// ticking it takes the client's version over the designer's.
import { useCallback, useMemo, useState } from "react";
import { Check, MessageSquareText } from "lucide-react";
import { CanvasStage } from "./canvas-stage";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { EventPlan } from "@/lib/events/plan";
import { diffDocuments, mergeChanges } from "@/lib/design-document/delta";
import { CONFLICT_WORD, describeChange } from "@/lib/proposals/describe";
import { deltaMarks } from "@/lib/proposals/marks";
import type { SubmittedProposal } from "@/lib/proposals/actions";
import { SketchDelta } from "@/components/sketch-delta";
import { CloseButton } from "@/components/close-button";
import { Button } from "@/components/button";
import { ALL_PLANES_VISIBLE } from "@/lib/studio/planes";

const NOOP = () => {};
const NO_CLEARANCE = { subjects: [], issues: [] };

export function ProposalReview({
  proposal,
  current,
  plan,
  onApply,
  onClose,
}: {
  proposal: SubmittedProposal;
  current: DesignDocumentContent;
  plan: EventPlan;
  /** Accepted = what to put into the drawing (`merged`); the rest are answered as not taken. */
  onApply: (merged: DesignDocumentContent, accepted: string[], rejected: string[], reply: string) => Promise<void>;
  onClose: () => void;
}) {
  const changes = useMemo(() => diffDocuments(proposal.base, proposal.content), [proposal]);
  // What the designer has ALSO changed since the fork — read once, merging everything unforced.
  const conflicts = useMemo(() => {
    const r = mergeChanges(current, proposal.base, proposal.content);
    const byKey = new Map<string, string[]>();
    for (const c of r.conflicts) byKey.set(c.key, [...(byKey.get(c.key) ?? []), CONFLICT_WORD[c.reason]]);
    return byKey;
  }, [current, proposal]);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(changes.filter((c) => !conflicts.has(c.key)).map((c) => c.key)));
  const [reply, setReply] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const merged = useMemo(
    () => mergeChanges(current, proposal.base, proposal.content, { accept: ticked, force: [...ticked].filter((k) => conflicts.has(k)) }),
    [current, proposal, ticked, conflicts],
  );
  const marks = useMemo(() => {
    const held = new Set(changes.filter((c) => !ticked.has(c.key)).map((c) => c.key));
    const stillConflicting = new Set([...conflicts.keys()].filter((k) => !ticked.has(k)));
    return deltaMarks(changes, merged.doc, { held, conflicts: stillConflicting, focused });
  }, [changes, ticked, conflicts, merged, focused]);
  const extraOverlay = useCallback((ctx: { mm: (px: number) => number }) => <SketchDelta marks={marks} mm={ctx.mm} />, [marks]);

  const toggle = (key: string) =>
    setTicked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const answer = async (accept: boolean) => {
    setBusy(true);
    try {
      const accepted = accept ? changes.filter((c) => ticked.has(c.key)).map((c) => c.key) : [];
      const rejected = changes.map((c) => c.key).filter((k) => !accepted.includes(k));
      await onApply(merged.doc, accepted, rejected, reply);
    } finally {
      setBusy(false);
    }
  };

  const date = proposal.submittedAt ? new Date(proposal.submittedAt).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="absolute inset-0 z-30 flex gap-3 bg-bg/70 p-3 backdrop-blur-[1px]">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-md bg-surface shadow-floating">
        <CanvasStage
          doc={merged.doc}
          plan={plan}
          selection={[]}
          layerVisible={ALL_PLANES_VISIBLE}
          spin="together"
          activeLayer={null}
          focusZoneId={null}
          onSelect={NOOP}
          onSelectMany={NOOP}
          onMoveTable={NOOP}
          onMovePlacement={NOOP}
          onMoveFeature={NOOP}
          onMoveMany={NOOP}
          onRotateMany={NOOP}
          onEndDrag={NOOP}
          onResizePlacement={NOOP}
          onSpanPlacement={NOOP}
          onDropProduct={NOOP}
          clearance={NO_CLEARANCE}
          showClearance={false}
          onToggleClearance={NOOP}
          onResizeTable={NOOP}
          stageFillActive={false}
          onStageFill={NOOP}
          drawArea={false}
          onArea={NOOP}
          onCancelArea={NOOP}
          areaPreview={null}
          onPickFront={NOOP}
          showTableNumbers
          extraOverlay={extraOverlay}
        />
        <p className="pointer-events-none absolute inset-x-3 top-3 text-center">
          <span className="rounded-pill bg-surface/95 px-3 py-1.5 text-xs font-semibold text-ink-soft shadow-lifted">
            כך תיראה הסקיצה עם השינויים המסומנים · קו מקווקו = איפה שזה היה
          </span>
        </p>
      </div>

      <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-md bg-surface shadow-floating">
        <div className="flex items-center gap-2 border-b border-border-soft py-2 ps-4 pe-2">
          <h2 className="min-w-0 flex-1 text-sm font-bold text-ink">שינויים מהלקוח</h2>
          <CloseButton label="סגירה — להחליט אחר כך" onClick={onClose} />
        </div>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-4">
          <p className="text-[13px] text-muted">
            {proposal.submittedBy}
            {date ? ` · ${date}` : ""}
          </p>
          {proposal.note && (
            <p className="mt-2 flex gap-2 rounded-sm bg-inset px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
              {proposal.note}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-[13px] font-bold text-ink">{changes.length === 1 ? "שינוי אחד" : `${changes.length} שינויים`}</h3>
            <div className="flex gap-3 text-xs font-semibold">
              <button type="button" className="text-accent hover:underline" onClick={() => setTicked(new Set(changes.map((c) => c.key)))}>
                סימון הכל
              </button>
              <button type="button" className="text-muted hover:underline" onClick={() => setTicked(new Set())}>
                ניקוי
              </button>
            </div>
          </div>
          <ul className="mt-1 flex flex-col">
            {changes.map((c) => {
              const w = describeChange(c, proposal.base, proposal.content);
              const why = conflicts.get(c.key);
              const on = ticked.has(c.key);
              return (
                <li key={c.key} className="border-b border-border-soft last:border-b-0">
                  <label
                    className="flex cursor-pointer items-start gap-2.5 py-2"
                    onPointerEnter={() => setFocused(c.key)}
                    onPointerLeave={() => setFocused((f) => (f === c.key ? null : f))}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(c.key)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink">{w.title}</span>
                      <span className="block text-xs text-muted">{w.detail}</span>
                      {why && <span className="mt-0.5 block text-xs font-semibold text-warn-ink">{why[0]}{on ? " — יוחלף בגרסת הלקוח" : ""}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {merged.renumbered.length > 0 && (
            <p className="mt-2 text-xs text-muted">שולחן חדש קיבל מספר אחר — המספר שבחר הלקוח כבר תפוס.</p>
          )}

          <label htmlFor="proposal-reply" className="mt-4 block text-[13px] font-semibold text-ink">
            תשובה ללקוח (לא חובה)
          </label>
          <textarea
            id="proposal-reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="למשל: הזזנו את הבר — שולחן 12 נשאר ליד הרחבה בגלל המעבר"
            className="mt-1.5 w-full resize-none rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink placeholder:text-quiet focus-visible:border-accent focus-visible:outline-none"
          />
        </div>
        <div className="flex flex-col gap-2 border-t border-border-soft p-4">
          <Button onClick={() => void answer(true)} disabled={busy || ticked.size === 0} className="w-full">
            <Check className="h-4 w-4" strokeWidth={2} />
            {ticked.size === changes.length ? "אישור כל השינויים" : `אישור ${ticked.size} מתוך ${changes.length}`}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void answer(false)} disabled={busy} className="w-full">
            לא לאשר אף שינוי
          </Button>
          <p className="text-center text-xs text-muted">האישור נכנס לסקיצה כפעולה אחת — Ctrl+Z מבטל אותו.</p>
        </div>
      </aside>
    </div>
  );
}
