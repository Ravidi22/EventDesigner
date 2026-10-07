"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";
import { CloseButton } from "./close-button";

// The question asked before something is destroyed.
//
// A native <dialog> with the app's shared `.modal` scrim and entrance (app/globals.css), like the
// shape editor — not a hand-rolled overlay. The platform already gives a modal dialog the three
// things a hand-rolled one has to reimplement badly: the page behind it goes inert, Escape closes
// it, and focus is trapped inside.
//
// WHAT IT DOES NOT DO, deliberately: it does not report failure, and it does not wait. `onConfirm`
// fires and the dialog closes. The screens that use it already own the outcome — the catalog shows
// its own notice when a delete turns into an archive — and a confirmation that stayed open with a
// spinner would be a second place for the same error to be handled.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** The question, in full — "למחוק את עגול 180?", not "אישור מחיקה". It is the only line someone
   *  is guaranteed to read. */
  title: string;
  /** What will actually happen, when that is not obvious from the title. */
  body?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
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
      className="modal m-auto max-h-none rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog"
    >
      <div className="w-[min(92vw,25rem)] p-5 text-right">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-base leading-snug text-ink">{title}</h2>
          {/* tabIndex -1: showModal() focuses the first focusable element, and that must stay
              ביטול (see the footer). The ✕ is for the pointer; Escape is the keyboard's way out. */}
          <CloseButton tabIndex={-1} className="-me-1 -mt-1" onClick={onClose} />
        </div>
        {body && <div className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</div>}

        {/* ⚠ THE ORDER IS LOAD-BEARING. showModal() focuses the first focusable element, so ביטול is
            first — a dialog that appears under someone's hands must not be able to destroy anything
            with one Enter. The destructive button is pushed to the far end, the same shape the edit
            drawer's footer already has. */}
        <div className="mt-5 flex items-center gap-2">
          {/* The SAFE answer is the prominent one: ביטול is the dialog's one filled CTA, so the eye
              and the Enter key both land on it. The destructive choice is borderless alert text —
              readable, deliberate to reach, and never the thing that looks like "continue". */}
          <Button size="sm" variant="primary" onClick={onClose}>
            ביטול
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className="ms-auto inline-flex h-9 items-center justify-center rounded-pill px-4 text-[13px] font-bold text-alert transition-colors hover:bg-alert-tint"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
