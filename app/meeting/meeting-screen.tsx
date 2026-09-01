"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ChevronRight, LogOut } from "lucide-react";
import { type EventSummary, formatEventDate, zonesLabelOf } from "@/lib/events/types";
import { activeEvent } from "@/lib/events/storage";
import { reachStep } from "@/lib/events/actions";
import { DEFAULT_FLOW, STEP_BY_ID, type MeetingStepId } from "@/lib/meeting/steps";
import { fetchMeetingFlow } from "@/lib/settings/actions";
import { Button } from "@/components/button";
import { EventForm } from "@/components/event-form";
import { MeetingGalleryScreen } from "@/app/(app)/gallery/meeting-gallery";
import { StudioScreen } from "@/app/(app)/studio/studio-screen";
import { OutputsScreen } from "@/app/(app)/outputs/outputs-screen";

// The guided client-meeting flow (F-1.1–F-1.9). One resumable stepper: every stage autosaves,
// exiting mid-flow is always safe, and an existing event re-enters at its furthest stage.
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
  const [flow, setFlow] = useState<MeetingStepId[]>(DEFAULT_FLOW);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [view, setView] = useState(0);
  const [ready, setReady] = useState(false);

  // The flow is read here rather than from the (app) layout's context: /meeting sits outside that
  // group, and resuming has to land on the right stage on the first paint — which needs the list
  // and the event in the same pass, since the stage to resume at is `event.step` clamped to the
  // flow's length. Fetched together, for that reason.
  useEffect(() => {
    let live = true;
    const isNew = params.get("new") !== null;
    // `ready` gates the first paint deliberately: a meeting that flickered through the details form
    // on its way to the stage the designer left off at would do it in front of the client.
    void Promise.all([fetchMeetingFlow(), isNew ? Promise.resolve(null) : activeEvent()])
      .then(([saved, ev]) => {
        if (!live) return;
        setFlow(saved);
        setEvent(ev);
        setView(ev ? Math.min(ev.step, saved.length - 1) : 0);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [params]);

  const advance = useCallback(
    (next: number) => {
      // The stage moves NOW and the record catches up: the designer clicked "continue" with a client
      // watching, and a stage that waits on a round trip to change is a stage that looks broken.
      setView(next);
      if (event) {
        setEvent({ ...event, step: Math.max(event.step, next) });
        void reachStep(event.id, next);
      }
    },
    [event],
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
  const isCanvas = step.id === "hall" || step.id === "design" || step.id === "quote";

  return (
    <div dir="rtl" className="flex h-dvh flex-col gap-3 bg-bg p-3">
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

        <Stepper flow={flow} current={at} furthest={furthest} onJump={setView} />

        {/* Below md the rail is hidden. Without this the meeting would show no progress at all on
            a tablet — which is exactly the device it gets run on in front of a client. */}
        <span className="shrink-0 text-xs font-semibold text-muted md:hidden">
          {step.label} · {at + 1}/{flow.length}
        </span>

        <div className="flex flex-1 justify-end">
          <Link
            href="/dashboard"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">יציאה</span>
          </Link>
        </div>
      </header>

      <main className={"min-h-0 flex-1 " + (isCanvas ? "overflow-hidden" : "overflow-auto")}>
        {step.id === "details" && <DetailsStep event={event} onSaved={(ev) => { setEvent(ev); advanceFor(ev); }} />}
        {/* Both sketches are the same document on the same canvas — a narrower set of tools each
            (StudioMode), not a second drawing. */}
        {step.id === "hall" && (
          <CanvasCard>
            <StudioScreen mode="hall" />
          </CanvasCard>
        )}
        {step.id === "gallery" && <MeetingGalleryScreen />}
        {step.id === "design" && (
          <CanvasCard>
            <StudioScreen mode="design" />
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
            <OutputsScreen />
          </CanvasCard>
        )}
      </main>

      {/* The details form advances from its own submit button; every other stage advances from here. */}
      {step.id !== "details" && !!event && (
        <FlowFooter
          backLabel={prevStep?.label ?? null}
          nextLabel={nextStep ? `השלב הבא: ${nextStep.label}` : null}
          onBack={() => setView(at - 1)}
          onContinue={() => advance(at + 1)}
          onFinish={() => router.push("/dashboard")}
        />
      )}
    </div>
  );

  // A freshly created event opens on whatever the studio put after the details stage.
  function advanceFor(ev: EventSummary) {
    const next = Math.min(1, flow.length - 1);
    setEvent({ ...ev, step: Math.max(ev.step, next) });
    setView(next);
    void reachStep(ev.id, next);
    router.replace("/meeting"); // drop ?new so a refresh resumes the event, not the blank form
  }
}

/** The drawing stages get the same white sheet the rest of the app's content sits on, clipped to
 *  the radius the chrome above and below it already uses. */
function CanvasCard({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-hidden rounded-md bg-surface shadow-floating">{children}</div>;
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
    <div className="mx-auto w-full max-w-lg py-6">
      {/* No `overflow-hidden` on this card, deliberately: it clips the date popover flat. The body
          does not scroll here either — `main` is the scroller on this screen, so the form keeps its
          full height and the popovers keep their room. */}
      <div className="rounded-lg bg-surface shadow-floating">
        <EventForm event={event} onSaved={onSaved} />
      </div>
    </div>
  );
}
