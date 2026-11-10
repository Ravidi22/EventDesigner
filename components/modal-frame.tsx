"use client";

import type { ReactNode } from "react";
import { CloseButton } from "./close-button";

// THE MODAL'S FRAME (2026-11-09, the user's "Studio + Halls" board; extended 2026-11-10 by the
// "Modals & popups" board, which puts EVERY dashboard window in it): the one look of every window
// that opens over a screen for the long-form settings of a named thing — a zone, the underlay crop,
// a delete question, an event, a meeting, a billing document. `rounded-lg` (22), `shadow-dialog`, on
// the shared `.modal` scrim; a header of a 36px tile, the title, its facts and the ✕; a footer whose
// PRIMARY comes first, then the secondary, then a status at the far end.
//
// Parts, not a component that owns the <dialog>: each dialog keeps its own lifecycle (when it calls
// showModal, what Enter does, where focus must land — ConfirmDialog's ביטול), and wears these.
//
// ⚠ NEVER PUT A `display` UTILITY ON THE <dialog> ITSELF — see components/event-dialog.tsx.
export const MODAL_CLASS = "modal m-auto max-h-none rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog";

/** The header: what the window is about — a tile (its kind's dot, an icon), its name and its facts —
 *  and the ✕. `closeTabIndex={-1}` where showModal() must not put focus on the ✕.
 *
 *  `tileClassName` is the tile's ground and ink: the accent tint by default, the ALERT tint for a
 *  destructive question only (board 4c), a diary kind's own tint on the meeting dialog (4b). No
 *  `onClose` = no ✕ — the event form inside the meeting's card has nothing to close. */
export function ModalHeader({
  tile,
  title,
  titleId,
  facts,
  onClose,
  closeTabIndex,
  tileClassName = "bg-accent-tint text-accent",
}: {
  tile: ReactNode;
  title: ReactNode;
  titleId?: string;
  facts?: ReactNode;
  onClose?: () => void;
  closeTabIndex?: number;
  tileClassName?: string;
}) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${tileClassName}`}>{tile}</span>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="truncate text-sm font-semibold text-ink">
          {title}
        </h2>
        {facts && <p className="nums truncate text-xs text-muted">{facts}</p>}
      </div>
      {onClose && <CloseButton tabIndex={closeTabIndex} onClick={onClose} />}
    </header>
  );
}

/** The footer: the primary first, then the secondary, then a `ModalStatus` at the far end. */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-3.5">{children}</footer>;
}

/** The footer's far end: what the window wants you to know before you press — "חובה: שם הלקוח
 *  ותאריך", "מספר המסמך סופי — תיקון בזיכוי", "תופיע גם ב־Google". `alert` for a failure. */
export function ModalStatus({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "alert" }) {
  return (
    <span
      role={tone === "alert" ? "alert" : undefined}
      className={`ms-auto inline-flex min-w-0 items-center gap-1.5 text-xs ${tone === "alert" ? "font-medium text-alert-ink" : "text-muted"}`}
    >
      {children}
    </span>
  );
}
