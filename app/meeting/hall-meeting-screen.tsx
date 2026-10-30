"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, LogOut } from "lucide-react";
import type { Booking } from "@/lib/hosting/actions";
import type { Dish, MenuPackage } from "@/lib/menus/types";
import { formatEventDate } from "@/lib/events/types";
import { Button } from "@/components/button";
import {
  BOOKING_STEP_LABEL,
  BookingStep,
  MEETING_STEPS,
  StepRail,
  useBookingDraft,
  type BookingSeed,
} from "@/app/(app)/bookings/booking-form";

/**
 * The hall's meeting mode (the user, 2026-10-30: "might be also good for the owner — a meeting
 * mode"): the booking's own steps (app/(app)/bookings/booking-form.tsx) full-screen in front of the
 * couple, in the designer's meeting frame (./meeting-screen.tsx) — a quiet header with the steps, one
 * white card, a footer that walks on. The menu is chosen from the dishes' photographs and the
 * meeting closes on a summary of what was agreed and what it comes to.
 *
 * Every step forward is WRITTEN — a meeting cut short keeps what was agreed — once the booking has
 * a name, the one thing it needs to exist. The kitchen's notes are not a step here: they are the
 * office's, written from the dialog afterwards.
 */
export function HallMeetingScreen({
  booking,
  seed,
  dishes,
  packages,
}: {
  booking: Booking | null;
  seed?: BookingSeed;
  dishes: Dish[];
  packages: MenuPackage[];
}) {
  const router = useRouter();
  const draft = useBookingDraft(booking, seed);
  const [at, setAt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = MEETING_STEPS[at];
  const prev = at > 0 ? MEETING_STEPS[at - 1] : null;
  const next = MEETING_STEPS[at + 1] ?? null;
  const named = !!draft.event.clientName.trim();
  const { event } = draft;
  const back = draft.saved ? `/bookings?event=${event.id}` : "/dashboard";

  const write = async (): Promise<boolean> => {
    if (!named) return true;
    setSaving(true);
    setError(null);
    try {
      await draft.save();
      return true;
    } catch {
      setError("השינויים לא נשמרו — נסו שוב");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const go = async (i: number) => {
    if (i === at || saving) return;
    if (await write()) setAt(i);
  };

  const finish = async () => {
    if (await write()) router.push(`/bookings?event=${event.id}`);
  };

  return (
    <div dir="rtl" className="flex h-dvh flex-col gap-3 bg-bg p-3">
      <header className="flex h-16 shrink-0 items-center gap-4 rounded-md bg-surface px-4 shadow-floating sm:px-5">
        <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
          <span className="truncate font-display text-h2 text-ink">{event.clientName || "אירוע חדש"}</span>
          {event.date && (
            <span className="truncate text-xs text-muted">
              {formatEventDate(event.date)}
              {event.zonesLabel ? ` · ${event.zonesLabel}` : ""}
            </span>
          )}
        </div>

        <div className="hidden shrink-0 md:block">
          <StepRail steps={MEETING_STEPS} current={at} onJump={(i) => void go(i)} />
        </div>
        <span className="shrink-0 text-xs font-semibold text-muted md:hidden">
          {BOOKING_STEP_LABEL[step]} · {at + 1}/{MEETING_STEPS.length}
        </span>

        <div className="flex flex-1 justify-end">
          <Link
            href={back}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">יציאה</span>
          </Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-4xl py-6">
          {/* No overflow-hidden: it would clip the date and select popovers flat. */}
          <div className="rounded-lg bg-surface p-6 shadow-floating sm:p-8">
            <h2 className="mb-6 font-display text-h2 text-ink">{BOOKING_STEP_LABEL[step]}</h2>
            <BookingStep step={step} draft={draft} dishes={dishes} packages={packages} frame="meeting" autoFocus={!booking && at === 0} />
          </div>
        </div>
      </main>

      <footer className="flex h-16 shrink-0 items-center justify-between gap-4 rounded-md bg-surface px-4 shadow-floating sm:px-5">
        <Button variant="ghost" onClick={() => prev && void go(at - 1)} disabled={!prev || saving}>
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
          {prev ? `חזרה ל${BOOKING_STEP_LABEL[prev]}` : "לשלב הקודם"}
        </Button>
        {error && (
          <p role="alert" className="text-sm font-medium text-alert-ink">
            {error}
          </p>
        )}
        {next ? (
          <Button onClick={() => void go(at + 1)} disabled={saving}>
            {`השלב הבא: ${BOOKING_STEP_LABEL[next]}`}
            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
          </Button>
        ) : (
          <Button onClick={() => void finish()} disabled={saving || !named}>
            סיום הפגישה
            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
          </Button>
        )}
      </footer>
    </div>
  );
}
