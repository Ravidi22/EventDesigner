"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ChevronRight, LogOut } from "lucide-react";
import { type EventSummary, formatEventDate, zonesLabelOf } from "@/lib/events/types";
import { activeEvent } from "@/lib/events/storage";
import { reachStep } from "@/lib/events/actions";
import { DEFAULT_FLOW, STEP_BY_ID, resumeIndex, type MeetingStepId } from "@/lib/meeting/steps";
import { fetchMeetingFlow } from "@/lib/settings/actions";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EventForm } from "@/components/event-form";
import { MeetingGalleryScreen } from "@/app/(app)/gallery/meeting-gallery";
import { StudioScreen } from "@/app/(app)/studio/studio-screen";
import { OutputsScreen } from "@/app/(app)/outputs/outputs-screen";
import { SceneScreen } from "@/app/(app)/scene/scene-screen";

// The guided client-meeting flow (F-1.1–F-1.9). One resumable stepper: every stage autosaves,
// exiting mid-flow is always safe, and an existing event re-enters at the stage in the URL
// (?stage=<id>), else at its furthest stage.
//
// The stages themselves are not written here — they come from the studio's configured flow
// (Settings → מצב פגישה, lib/meeting/*). This screen only knows how to render each stage id and how
// to walk a list, so a designer who drops the gallery or swaps the two sketches gets exactly that
// meeting, and `event.step` keeps meaning "furthest reached" against whatever the list says today.
//
// MEETING-MODE RULE: no prices or internal data on any stage except the quote.
//
// SHAPE: the app shell's own geometry, minus the sidebar — floating `rounded-md` cards on the `bg`
// plane with a `p-3`/`gap-3` gutter, not flush bars with a hairline under them. Both bars stay
// white: the one saturated thing on this screen is the footer's gradient CTA, which is the whole
// brand budget a screen gets (DESIGN.md — one saturated surface, one filled CTA). A violet header
// was tried and pulled; it read as the tool talking over the meeting.
//
// That also settles where glass can go, which is nowhere here — `.glass` is only ever legal over
// the mesh or the accent gradient, and over a flat white bar it is decoration.
export function MeetingScreen() {
  const router = useRouter();
  const params = useSearchParams();
  // ⚠ DERIVE PRIMITIVES FROM `params`, NEVER DEPEND ON THE OBJECT. In dev, useSearchParams() hands
  // back a NEW object whenever the router's tree changes — and every server action that calls
  // revalidatePath (reachStep on each "continue", the details save, a quote's stamp, a catalog
  // write from the rail) re-renders this page and replaces the tree, URL unchanged. The load effect
  // below used to depend on `params` itself, so each of those re-ran it and re-set the stage to
  // `event.step` — the meeting jumped to the furthest stage (the one with the check marks) instead
  // of staying where the designer was.
  const isNew = params.get("new") !== null;
  // The stage the designer is ON lives in the URL (?stage=<id>), so it survives a reload, a remount
  // and a re-render alike. Read once, when the screen opens; after that `view` is the truth and the
  // URL follows it (go(), below). `event.step` stays what it always was — the furthest reached,
  // for the check marks, and where a meeting opened without ?stage resumes.
  const stageAtOpen = useRef(params.get("stage"));
  const [flow, setFlow] = useState<MeetingStepId[]>(DEFAULT_FLOW);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [view, setView] = useState(0);
  const [ready, setReady] = useState(false);
  // The event this screen already holds, for the load effect to ask "do I need to read at all?".
  const held = useRef<EventSummary | null>(null);
  useEffect(() => {
    held.current = event;
  }, [event]);
  // `view`, readable from callbacks that must not re-create on every stage change.
  const viewRef = useRef(0);
  // Where the designer stepped BACK to the details stage from, so its "שמירה והמשך" returns them
  // there. Fixing the couple's phone number from the design sketch used to march the meeting back
  // through the hall sketch — the stage after details — as if the event had just been opened.
  const cameFrom = useRef<number | null>(null);
  // The drawing stages' autosave, as the studio reports it (StudioScreen.onSaveState). Only "error"
  // is acted on: leaving a stage with an edit that failed to save asks first — the unmount flush
  // retries once, and if that fails too the edit is gone with nobody told, in front of the client.
  const [sketchSave, setSketchSave] = useState<"saving" | "saved" | "error">("saved");
  // The move being held back by that question, until it is answered.
  const [leaving, setLeaving] = useState<(() => void) | null>(null);

  /** Move to stage `i`, and write it into the URL. replaceState rather than router.replace: the
   *  native call is synced into useSearchParams without a server round trip (Next's own history
   *  integration), and a stage change is not a navigation — nothing on the server depends on it. */
  const go = useCallback(
    (i: number) => {
      const from = viewRef.current;
      cameFrom.current = i === 0 && from > 0 ? from : null;
      viewRef.current = i;
      setView(i);
      // A new stage starts clean: the studio that reported the error is being unmounted, and its
      // last retry runs on its own from here — see the flush-on-unmount note in studio-screen.
      setSketchSave("saved");
      const id = flow[Math.min(Math.max(i, 0), flow.length - 1)];
      if (id) window.history.replaceState(null, "", `/meeting?stage=${id}`);
    },
    [flow],
  );

  /** Run `action` now — or, when the stage being left has an edit the autosave could not land,
   *  after the designer has said so. Every way out of a stage goes through here: the footer, the
   *  stepper, and יציאה. */
  const guarded = useCallback(
    (action: () => void) => {
      if (sketchSave === "error") setLeaving(() => action);
      else action();
    },
    [sketchSave],
  );

  // The flow is read here rather than from the (app) layout's context: /meeting sits outside that
  // group, and resuming has to land on the right stage on the first paint — which needs the list
  // and the event in the same pass, since the stage to resume at is `event.step` clamped to the
  // flow's length. Fetched together, for that reason.
  //
  // Runs on mount, and again only when ?new appears (a blank form wanted). `?new` going AWAY is this
  // screen's own doing — advanceFor drops it once the event exists — and must not reload what it
  // has just created. The same guard keeps a dev Fast Refresh, which re-runs every effect whatever
  // its dependencies, from re-resolving the stage.
  useEffect(() => {
    if (!isNew && held.current) return;
    let live = true;
    // `ready` gates the first paint deliberately: a meeting that flickered through the details form
    // on its way to the stage the designer left off at would do it in front of the client.
    void Promise.all([fetchMeetingFlow(), isNew ? Promise.resolve(null) : activeEvent()])
      .then(([saved, ev]) => {
        if (!live) return;
        setFlow(saved);
        setEvent(ev);
        const at = ev ? resumeIndex(saved, ev.step, stageAtOpen.current) : 0;
        viewRef.current = at;
        setView(at);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [isNew]);

  const advance = useCallback(
    (next: number) => {
      // The stage moves NOW and the record catches up: the designer clicked "continue" with a client
      // watching, and a stage that waits on a round trip to change is a stage that looks broken.
      go(next);
      if (event) {
        setEvent({ ...event, step: Math.max(event.step, next) });
        void reachStep(event.id, next);
      }
    },
    [event, go],
  );

  if (!ready) return null;

  const furthest = event?.step ?? 0;
  const at = Math.min(view, flow.length - 1);
  const step = STEP_BY_ID[flow[at]];
  const prevStep = at > 0 ? STEP_BY_ID[flow[at - 1]] : null;
  const nextStep = flow[at + 1] ? STEP_BY_ID[flow[at + 1]] : null;
  // The stages that fill their card edge to edge and scroll nothing — the two drawing passes, and
  // now the closing stage too, which is the outputs screen and owns its own scrolling rail and
  // sheet column. Every other stage is a document on the plane and scrolls normally.
  const isCanvas = step.id === "hall" || step.id === "design" || step.id === "scene" || step.id === "quote";

  return (
    <div dir="rtl" className="flex h-dvh flex-col gap-3 bg-bg p-3 print:block print:h-auto print:p-0">
      {/* Quiet chrome, matching the app shell's own top bar: a white floating card on the `bg`
          plane. This screen's saturated moment is the footer's single gradient CTA and nothing
          else — a violet bar across a meeting run in front of a client is the tool talking over
          the work, which is the one thing PRODUCT.md says it must not do. */}
      <header className="no-print flex h-16 shrink-0 items-center gap-4 rounded-md bg-surface px-4 shadow-floating sm:px-5">
        <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
          <span className="truncate font-display text-h2 text-ink">
            {event ? event.clientName : "אירוע חדש"}
          </span>
          {event && (
            <span className="truncate text-xs text-muted">
              {zonesLabelOf(event)} · {formatEventDate(event.date)}
            </span>
          )}
        </div>

        <Stepper flow={flow} current={at} furthest={furthest} onJump={(i) => guarded(() => go(i))} />

        {/* Below md the rail is hidden. Without this the meeting would show no progress at all on
            a tablet — which is exactly the device it gets run on in front of a client. */}
        <span className="shrink-0 text-xs font-semibold text-muted md:hidden">
          {step.label} · {at + 1}/{flow.length}
        </span>

        <div className="flex flex-1 justify-end">
          <Link
            href="/dashboard"
            onClick={(e) => {
              // Same question as the footer asks, for the one exit that is a plain link.
              if (sketchSave !== "error") return;
              e.preventDefault();
              setLeaving(() => () => router.push("/dashboard"));
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">יציאה</span>
          </Link>
        </div>
      </header>

      <main className={"min-h-0 flex-1 print:block print:overflow-visible " + (isCanvas ? "overflow-hidden" : "overflow-auto")}>
        {step.id === "details" && <DetailsStep event={event} onSaved={(ev) => { setEvent(ev); advanceFor(ev); }} />}
        {/* Both sketches are the same document on the same canvas — a narrower set of tools each
            (StudioMode), not a second drawing. */}
        {step.id === "hall" && (
          <CanvasCard>
            <StudioScreen mode="hall" onSaveState={setSketchSave} />
          </CanvasCard>
        )}
        {step.id === "gallery" && <MeetingGalleryScreen />}
        {step.id === "design" && (
          <CanvasCard>
            <StudioScreen mode="design" onSaveState={setSketchSave} />
          </CanvasCard>
        )}
        {/* The room the client is about to be quoted for, from the inside (F-9.1): the designer's
            /scene tab in its meeting frame — the curated camera and the client's bar, the
            viewpoints a popover away. It edits nothing, so there is nothing for guarded() to keep
            the designer from leaving with unsaved. Only in a flow that turned it on (DEFAULT_FLOW
            does not list it). */}
        {step.id === "scene" && event && (
          <CanvasCard>
            <SceneScreen frame="meeting" />
          </CanvasCard>
        )}
        {/* F-1.9 closes the meeting, and it closes it on the SAME screen /outputs is — one component
            in two frames, exactly as the two sketch stages are StudioScreen in this frame and
            /studio in the other. It opens on the quote, which is what this stage is for; the
            placement map and the packing list are the same event's other documents, one rail row
            away, for when the client has gone and the crew's sheets get prepared.
            This used to be a quote rendered here PLUS a link out to a separate screen that rendered
            the very same <Quote /> again — the one document in the app that existed in two frames
            with two different shapes. */}
        {step.id === "quote" && event && (
          <CanvasCard>
            <OutputsScreen frame="meeting" />
          </CanvasCard>
        )}
      </main>

      {/* The details form advances from its own submit button; every other stage advances from here. */}
      {step.id !== "details" && !!event && (
        <FlowFooter
          backLabel={prevStep?.label ?? null}
          nextLabel={nextStep ? `השלב הבא: ${nextStep.label}` : null}
          onBack={() => guarded(() => go(at - 1))}
          onContinue={() => guarded(() => advance(at + 1))}
          onFinish={() => guarded(() => router.push("/dashboard"))}
        />
      )}

      {/* The drawing's last edit did not reach the server (the toolbar says "לא נשמר · נסה שוב").
          Staying is the safe answer and so the filled one; going on is spelled out as what it is. */}
      <ConfirmDialog
        open={leaving !== null}
        title="הסקיצה לא נשמרה"
        body="השינוי האחרון לא הגיע לשרת. אפשר להישאר ולנסות שוב מסרגל הכלים — או להמשיך, והשינוי עלול ללכת לאיבוד."
        confirmLabel="להמשיך בכל זאת"
        onConfirm={() => {
          const action = leaving;
          setLeaving(null);
          action?.();
        }}
        onClose={() => setLeaving(null)}
      />
    </div>
  );

  // A freshly created event opens on whatever the studio put after the details stage. An existing
  // one whose details were fixed mid-meeting goes back to the stage it was fixed FROM (cameFrom) —
  // it has already reached it, so the stepper would allow the jump anyway.
  function advanceFor(ev: EventSummary) {
    const next = Math.min(cameFrom.current ?? 1, flow.length - 1);
    setEvent({ ...ev, step: Math.max(ev.step, next) });
    // go() also drops ?new — the URL becomes ?stage=<next> — so a refresh resumes the event, not
    // the blank form. It used to be router.replace("/meeting"), a server round trip that, through
    // the load effect's old `params` dependency, re-read the event — racing the reachStep below.
    go(next);
    void reachStep(ev.id, next);
  }
}

/** The drawing stages get the same white sheet the rest of the app's content sits on, clipped to
 *  the radius the chrome above and below it already uses. */
function CanvasCard({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-hidden rounded-md bg-surface shadow-floating print:h-auto print:overflow-visible print:rounded-none print:shadow-none">{children}</div>;
}

function Stepper({
  flow,
  current,
  furthest,
  onJump,
}: {
  flow: MeetingStepId[];
  current: number;
  furthest: number;
  onJump: (i: number) => void;
}) {
  return (
    // Recessed rail, so the stages read as one control rather than five loose chips; the current
    // stage wears the app's own active-nav treatment (bold accent on accent-tint).
    <ol className="hidden shrink-0 items-center gap-0.5 rounded-pill bg-inset p-1 md:flex">
      {flow.map((id, i) => {
        const reachable = i <= furthest;
        const state = i === current ? "current" : reachable ? "done" : "todo";
        return (
          <li key={id}>
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onJump(i)}
              aria-current={state === "current" ? "step" : undefined}
              className={
                "inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-caption transition-colors " +
                (state === "current"
                  ? "bg-accent-tint font-bold text-accent"
                  : state === "done"
                    ? "font-semibold text-ink-soft hover:bg-surface hover:text-ink"
                    : "text-muted")
              }
            >
              {state === "done" && <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />}
              {STEP_BY_ID[id].label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function FlowFooter({
  backLabel,
  nextLabel,
  onBack,
  onContinue,
  onFinish,
}: {
  backLabel: string | null;
  nextLabel: string | null;
  onBack: () => void;
  onContinue: () => void;
  onFinish: () => void;
}) {
  return (
    <footer className="no-print flex h-16 shrink-0 items-center justify-between gap-4 rounded-md bg-surface px-4 shadow-floating sm:px-5">
      <Button variant="ghost" onClick={onBack} disabled={!backLabel}>
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
        {backLabel ? `חזרה ל${backLabel}` : "לשלב הקודם"}
      </Button>
      {nextLabel ? (
        <Button onClick={onContinue}>
          {nextLabel}
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
        </Button>
      ) : (
        // The last stage used to leave this slot empty, which left the flow with no ending — the
        // only way out of a finished meeting was the exit in the corner. It closes here instead.
        // A push rather than a wrapping <Link>: a <button> inside an <a> is invalid nesting.
        <Button onClick={onFinish}>
          סיום הפגישה
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
        </Button>
      )}
    </footer>
  );
}

// F-1.3: the event's own details, as a stage of the meeting rather than as the dialog that CREATES
// an event (components/event-dialog.tsx). Same form either way — components/event-form.tsx — so a
// field added to one frame cannot go missing from the other.
//
// Reached by stepping back to it mid-meeting, which is how the couple's phone number gets fixed.
// A blank one still creates, for /meeting?new and for a browser with no active event.
function DetailsStep({ event, onSaved }: { event: EventSummary | null; onSaved: (ev: EventSummary) => void }) {
  return (
    // max-w-3xl: the form is six two-up rows, and at the dialog's old 512px it sat as a narrow
    // column in the middle of a wide screen.
    <div className="mx-auto w-full max-w-3xl py-6">
      {/* No `overflow-hidden` on this card, deliberately: it clips the date popover flat. The body
          does not scroll here either — `main` is the scroller on this screen, so the form keeps its
          full height and the popovers keep their room. */}
      <div className="rounded-lg bg-surface shadow-floating">
        <EventForm event={event} onSaved={onSaved} />
      </div>
    </div>
  );
}
