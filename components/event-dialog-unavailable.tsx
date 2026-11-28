"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { ConfirmDialog } from "./confirm-dialog";

// What "+ יצירת אירוע חדש" opens when the event dialog's own code could not be downloaded (PR #3
// review). The dialog is a lazy chunk (components/app-shell.tsx), and a chunk can fail: a tab left open
// across a deploy asks for a file the new build no longer has, or a phone's connection drops. Without
// this the failure went up past (app)/error.tsx to the root error page, and the whole studio — nav,
// header, the page being worked on — was replaced by it for one button.
export function EventDialogUnavailable({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ConfirmDialog
      open={open}
      tone="neutral"
      icon={WifiOff}
      title="לא הצלחנו לפתוח את הטופס"
      body="ייתכן שהאפליקציה עודכנה מאז שהדף נפתח, או שהחיבור נקטע. רענון הדף יטען אותה מחדש."
      confirmLabel="רענון הדף"
      confirmIcon={RefreshCw}
      onConfirm={() => window.location.reload()}
      onClose={onClose}
    />
  );
}

/** Shown while the dialog's chunk downloads — usually never seen, it is fetched when the button is
 *  hovered or focused. Fixed, so it takes no room in the shell's column. */
export function EventDialogLoading() {
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-pill bg-surface px-4 py-2 text-sm font-semibold text-ink-soft shadow-floating"
    >
      פותחים את הטופס…
    </div>
  );
}
