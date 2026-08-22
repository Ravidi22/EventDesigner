"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Lock, RotateCcw } from "lucide-react";
import {
  DEFAULT_FLOW,
  MEETING_STEPS,
  moveStep,
  toggleStep,
  type MeetingStepId,
} from "@/lib/meeting/steps";
import { resetMeetingFlow, saveMeetingFlow } from "@/lib/settings/actions";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Panel, SavedFlag, Switch } from "./ui";

// The shape of a client meeting (F-1.1), as the designer runs it — not as we imagined it. Which
// stages exist and in what order is a studio-level setting; /meeting renders whatever this list
// says (lib/meeting/steps.ts).
//
// One list, in meeting order, with the stages that are switched off greyed in place rather than
// exiled to a second "available" column: the designer is deciding what their meeting looks like, and
// seeing the skipped stage sitting between the two it used to join is the whole point. פרטי האירוע
// can't be switched off or moved — every later stage reads the event it creates.
export function MeetingSection() {
  const router = useRouter();
  // The studio's flow already came down with the (app) layout, through MeetingFlowProvider — this
  // section used to fetch it a second time on mount, opening on DEFAULT_FLOW and correcting itself
  // when the answer landed, which showed the designer a meeting shape that was not theirs.
  //
  // Local state on top of it, because edits here are optimistic: the list moves the instant a stage
  // is switched off, and the write follows. The effect re-syncs whenever the layout's copy changes,
  // which is what router.refresh() below causes after a save.
  const studioFlow = useMeetingFlow();
  const [flow, setFlow] = useState<MeetingStepId[]>(studioFlow);
  const [seed, setSeed] = useState(studioFlow);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  if (studioFlow !== seed) {
    setSeed(studioFlow);
    setFlow(studioFlow);
  }

  const flash = () => {
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1600);
  };

  // No debounce here, unlike the business form: each change is a whole deliberate act — a stage
  // switched off, a stage moved one place — not a keystroke, and there is no burst to collapse.
  //
  // The list moves immediately and the write follows. The server normalises what it stores (the
  // details stage stays first and required), so the answer is adopted when it lands rather than
  // assumed. router.refresh() re-runs the (app) layout, which is where every other screen reads
  // this flow from — without it the dashboard would keep measuring progress against the old list
  // until a full reload.
  const commit = (next: MeetingStepId[]) => {
    setFlow(next);
    flash();
    void saveMeetingFlow(next).then((stored) => {
      setFlow(stored);
      router.refresh();
    });
  };

  // Not commit(DEFAULT_FLOW): reset stores an EMPTY list, so a studio that never customised its
  // meeting keeps following the app's default if that default ever changes.
  const reset = () => {
    flash();
    void resetMeetingFlow().then((stored) => {
      setFlow(stored);
      router.refresh();
    });
  };

  const isDefault = flow.length === DEFAULT_FLOW.length && flow.every((id, i) => id === DEFAULT_FLOW[i]);

  // Order the whole catalogue by the flow, with the switched-off stages parked where the default
  // flow has them — a stage you turn back on reappears exactly where it sat in this list.
  const rank = (id: MeetingStepId) => {
    const on = flow.indexOf(id);
    return on === -1 ? DEFAULT_FLOW.indexOf(id) - 0.5 : on;
  };
  const rows = [...MEETING_STEPS].sort((a, b) => rank(a.id) - rank(b.id));

  return (
    <Panel
      title="מצב פגישה"
      hint="השלבים שהפגישה עוברת, בסדר שבו הם מופיעים. אירוע שנפתח לפני שינוי ממשיך מהשלב שבו עצר — לפי הסדר החדש."
      action={<SavedFlag shown={saved} />}
    >
      <ol className="max-w-3xl">
        {rows.map((step) => {
          const at = flow.indexOf(step.id);
          const on = at !== -1;
          const locked = !!step.required;
          return (
            <li
              key={step.id}
              className="flex items-start gap-3 border-b border-border-soft py-3.5 last:border-0"
            >
              <span
                aria-hidden
                className={
                  "nums mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] font-bold " +
                  (on ? "bg-accent-tint text-accent" : "bg-inset text-faint")
                }
              >
                {on ? at + 1 : "—"}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={"text-sm font-semibold " + (on ? "text-ink" : "text-muted")}>{step.label}</span>
                  {locked && (
                    <span className="inline-flex items-center gap-1 text-xs text-faint" title="שלב קבוע — פותח את האירוע">
                      <Lock className="h-3 w-3" strokeWidth={2} />
                      קבוע
                    </span>
                  )}
                </div>
                <p className={"mt-0.5 text-[13px] leading-relaxed " + (on ? "text-ink-soft" : "text-muted")}>
                  {step.hint}
                </p>
              </div>

              {/* Reorder sits next to the switch, not on a drag handle: five rows do not need a
                  drag-and-drop implementation, and two buttons are reachable by keyboard for free.
                  Up = earlier in the meeting, which in an RTL column is still up. */}
              <div className="flex shrink-0 items-center gap-1">
                <MoveButton
                  label={`הקדמת "${step.label}" בסדר הפגישה`}
                  icon={ChevronUp}
                  disabled={!on || locked || at <= 1}
                  onClick={() => commit(moveStep(flow, step.id, -1))}
                />
                <MoveButton
                  label={`דחיית "${step.label}" בסדר הפגישה`}
                  icon={ChevronDown}
                  disabled={!on || locked || at === flow.length - 1}
                  onClick={() => commit(moveStep(flow, step.id, 1))}
                />
                <Switch
                  checked={on}
                  onChange={() => commit(toggleStep(flow, step.id))}
                  disabled={locked}
                  label={`${step.label} — שלב בפגישה`}
                  className="ms-1.5"
                />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-xs leading-relaxed text-muted">
          מחירים מוצגים בשלב הצעת המחיר בלבד — גם אם שינית את הסדר.
        </p>
        <Button variant="ghost" onClick={reset} disabled={isDefault}>
          <RotateCcw className="h-4 w-4" strokeWidth={2} />
          חזרה לסדר המקורי
        </Button>
      </div>
    </Panel>
  );
}

function MoveButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof ChevronUp;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-border p-1.5 text-muted transition-colors hover:border-accent-line hover:bg-accent-tint hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:bg-transparent disabled:hover:text-muted"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}
