"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Presentation } from "lucide-react";
import type { Booking } from "@/lib/hosting/actions";
import type { Dish, MenuPackage } from "@/lib/menus/types";
import { Button } from "@/components/button";
import { CloseButton } from "@/components/close-button";
import { BOOKING_STEP_LABEL, BookingStep, DIALOG_STEPS, StepRail, useBookingDraft, type BookingSeed } from "./booking-form";

export type { BookingSeed } from "./booking-form";

/**
 * A venue's booking, created or edited in one dialog — in STEPS (./booking-form.tsx): the event,
 * the menu, the evening, the notes. Only the client's name is required, so the booking can be
 * opened from any step; "הבא" walks on. The client's answer (הוזמן / לא נסגר) and the closed count
 * are NOT here — the drawer owns those, as single actions.
 */
export function BookingDialog({
  open,
  onClose,
  booking,
  seed,
  dishes,
  packages,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  booking: Booking | null;
  seed?: BookingSeed;
  dishes: Dish[];
  packages: MenuPackage[];
  onSaved: (list: Booking[], id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      // No display utility on the <dialog> itself — see components/event-dialog.tsx.
      className="modal m-auto max-h-none w-[92vw] max-w-2xl rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog"
    >
      {open && <BookingDialogForm booking={booking} seed={seed} dishes={dishes} packages={packages} onCancel={onClose} onSaved={onSaved} />}
    </dialog>
  );
}

function BookingDialogForm({
  booking,
  seed,
  dishes,
  packages,
  onCancel,
  onSaved,
}: {
  booking: Booking | null;
  seed?: BookingSeed;
  dishes: Dish[];
  packages: MenuPackage[];
  onCancel: () => void;
  onSaved: (list: Booking[], id: string) => void;
}) {
  const router = useRouter();
  const draft = useBookingDraft(booking, seed);
  const [at, setAt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = DIALOG_STEPS[at];
  const last = at === DIALOG_STEPS.length - 1;
  const named = !!draft.event.clientName.trim();

  const submit = async (then?: "meeting") => {
    if (!named || saving) return;
    setSaving(true);
    setError(null);
    try {
      const list = await draft.save();
      if (then === "meeting") {
        router.push(`/meeting?event=${draft.event.id}`);
        return;
      }
      onSaved(list, draft.event.id);
    } catch {
      setError("לא ניתן לשמור כרגע. נסו שוב.");
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex max-h-[calc(100dvh-2rem)] flex-col"
    >
      <header className="flex shrink-0 flex-col gap-3 border-b border-border px-5 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">{booking ? booking.event.clientName || "פרטי האירוע" : "אירוע חדש באולם"}</h2>
          <CloseButton label="סגירה" onClick={onCancel} />
        </div>
        <StepRail steps={DIALOG_STEPS} current={at} onJump={setAt} className="self-start" />
      </header>

      {/* One step at a time, so the body rarely scrolls; its floor keeps the dialog from jumping
          height as the steps change. */}
      <div className="min-h-[24rem] flex-1 overflow-y-auto px-5 py-5">
        <BookingStep step={step} draft={draft} dishes={dishes} packages={packages} frame="dialog" autoFocus={!booking} />
        {error && <p className="mt-4 rounded-md bg-alert-tint px-3 py-2 text-sm text-alert-ink">{error}</p>}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-4">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          ביטול
        </Button>
        {/* The same steps, full-screen in front of the couple: the menu as photographs, a summary
            to close on (app/meeting/hall-meeting-screen.tsx). Saves first — the meeting opens a
            booking that exists. */}
        <Button type="button" variant="outline" size="sm" onClick={() => void submit("meeting")} disabled={saving || !named}>
          <Presentation className="h-4 w-4" strokeWidth={1.75} />
          מצב פגישה
        </Button>
        <div className="ms-auto flex items-center gap-2">
          {at > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAt(at - 1)} disabled={saving}>
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
              {BOOKING_STEP_LABEL[DIALOG_STEPS[at - 1]]}
            </Button>
          )}
          {!last && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAt(at + 1)} disabled={saving}>
              {BOOKING_STEP_LABEL[DIALOG_STEPS[at + 1]]}
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            </Button>
          )}
          <Button type="submit" size="sm" disabled={saving || !named}>
            {saving ? "שומר…" : booking ? "שמירה" : "פתיחת האירוע"}
          </Button>
        </div>
      </footer>
    </form>
  );
}
