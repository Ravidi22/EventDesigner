"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { reachStep } from "@/lib/events/actions";
import { EventForm } from "./event-form";

/**
 * Open a NEW event from wherever you are, then walk straight into the meeting it starts.
 *
 * Creating an event used to BE the meeting flow's first stage (`/meeting?new`): clicking "אירוע
 * חדש" threw you out of the screen you were on and into a full-screen stepper whose first step was
 * a six-field form. It is a dialog now, for the same reason booking a meeting is one — you answer
 * the questions where you stand, and the stepper opens on the stage that actually needs the room.
 *
 * `details` STAYS in the flow — lib/meeting/steps.ts marks it required and first, and jumping back
 * to it mid-meeting is how the couple's phone number gets fixed. This dialog only takes over the
 * CREATE half, which is why it hands the meeting an event already stepped past that stage.
 */
export function EventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

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
      // ⚠ NEVER PUT A `display` UTILITY ON THE <dialog> ITSELF — no `flex`, no `grid`, no `block`.
      // A closed dialog is hidden by the UA's own `dialog:not([open]) { display: none }`, and a
      // Tailwind display class outranks it, so the dialog renders permanently, in normal flow,
      // wherever it happens to sit in the tree. See app/(app)/dashboard/appointment-dialog.tsx.
      //
      // `max-h-none` clears the UA's own cap so the form's is the only one. No `overflow-hidden`:
      // the body already scrolls, and a second clip is one more edge for the date popover to die
      // against.
      className="modal m-auto max-h-none w-[92vw] max-w-lg rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog"
    >
      {/* Mounted only while open, so every opening starts on a blank form — the dialog element
          itself stays put for showModal(), but its contents do not survive a close. */}
      {open && (
        <EventForm
          event={null}
          onCancel={onClose}
          onSaved={async (ev) => {
            // AWAITED, not fired off. /meeting resumes at `event.step`, so a step write still in
            // flight when the route changes drops the designer back onto the details form they
            // just filled in. Step 1 is whatever the studio put after `details`; the meeting screen
            // clamps it to the configured flow's length on read.
            await reachStep(ev.id, 1);
            // Closed BEFORE the push, which unmounts the form: navigation is not instant, and a
            // live submit button over a route change is how one couple gets two events.
            onClose();
            router.push("/meeting");
          }}
          // dvh, not vh, so a mobile URL bar sliding away doesn't strand the footer under it.
          className="flex max-h-[calc(100dvh-2rem)] flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto"
        />
      )}
    </dialog>
  );
}
