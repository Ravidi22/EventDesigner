"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { TriangleAlert, type LucideIcon } from "lucide-react";
import { Button } from "./button";
import { MODAL_CLASS, ModalFooter, ModalHeader } from "./modal-frame";

// The question asked before something is destroyed — or issued for good.
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
//
// TWO TONES (2026-11-10, the "Modals & popups" board, 4c: "the tile turns alert-tint for
// destructive questions only"). `danger` — a delete: the tile in the alert tint, the verb in alert
// ink. `neutral` — a final act that destroys nothing (issuing a numbered billing document): the
// accent tile and an accent verb. Either way ביטול is the filled answer.
export function ConfirmDialog({
  open,
  title,
  facts,
  body,
  confirmLabel,
  confirmIcon: ConfirmIcon,
  icon: Icon = TriangleAlert,
  tone = "danger",
  hideConfirm = false,
  wide = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** The question, in full — "למחוק את עגול 180?", not "אישור מחיקה". It is the only line someone
   *  is guaranteed to read. */
  title: string;
  /** What it is about, under the title — "חתונה · 12 בנוב׳ · בעיצוב". */
  facts?: ReactNode;
  /** What will actually happen, when that is not obvious from the title. */
  body?: ReactNode;
  confirmLabel: string;
  confirmIcon?: LucideIcon;
  icon?: LucideIcon;
  tone?: "danger" | "neutral";
  /** The act cannot happen (the body says why) — only ביטול is offered. */
  hideConfirm?: boolean;
  /** 440px instead of 400 — for a body that lists things. */
  wide?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const danger = tone === "danger";

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} className={MODAL_CLASS}>
      <div className={`${wide ? "w-[min(92vw,27.5rem)]" : "w-[min(92vw,25rem)]"} text-right`}>
        {/* tabIndex -1 on the ✕: showModal() focuses the first focusable element, and that must stay
            ביטול (see the footer). The ✕ is for the pointer; Escape is the keyboard's way out. */}
        <ModalHeader
          tile={<Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          tileClassName={danger ? "bg-alert-tint text-alert-ink" : "bg-accent-tint text-accent"}
          title={<span className="whitespace-normal leading-snug">{title}</span>}
          facts={facts}
          onClose={onClose}
          closeTabIndex={-1}
        />
        {body && <div className="flex flex-col gap-3.5 px-5 pb-5 pt-[18px] text-sm leading-relaxed text-ink-soft">{body}</div>}

        {/* ⚠ THE ORDER IS LOAD-BEARING. showModal() focuses the first focusable element, so ביטול is
            first — a dialog that appears under someone's hands must not be able to destroy anything
            with one Enter. The SAFE answer is the prominent one: ביטול is the dialog's one filled
            CTA, so the eye and the Enter key both land on it. The destructive choice is borderless
            text at the far end — readable, deliberate to reach, never the thing that looks like
            "continue". */}
        <ModalFooter>
          <Button size="sm" variant="primary" onClick={onClose}>
            ביטול
          </Button>
          {!hideConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              className={`ms-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-pill px-4 text-[13px] font-bold transition-colors ${
                danger ? "text-alert-ink hover:bg-alert-tint" : "text-accent hover:bg-accent-tint"
              }`}
            >
              {ConfirmIcon && <ConfirmIcon className="h-[15px] w-[15px]" strokeWidth={2} />}
              {confirmLabel}
            </button>
          )}
        </ModalFooter>
      </div>
    </dialog>
  );
}
