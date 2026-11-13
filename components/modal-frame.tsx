"use client";

import type { ReactNode } from "react";
import { CloseButton } from "./close-button";

// THE MODAL'S FRAME (2026-11-09, the user's "Studio + Halls" board): the one look of every window
// that opens over a screen for the long-form settings of a named thing — a zone, the underlay crop,
// a delete question. `rounded-lg` (22), `shadow-dialog`, on the shared `.modal` scrim; a header of a
// 36px tile, the title, its facts and the ✕; a footer whose PRIMARY comes first, then the secondary,
// then a status at the far end.
//
// Parts, not a component that owns the <dialog>: each dialog keeps its own lifecycle (when it calls
// showModal, what Enter does, where focus must land — ConfirmDialog's ביטול), and wears these.
//
// ⚠ NEVER PUT A `display` UTILITY ON THE <dialog> ITSELF — see components/event-dialog.tsx.
export const MODAL_CLASS = "modal m-auto max-h-none rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog";

/** The header: what the window is about — a tile (its kind's dot, an icon), its name and its facts —
 *  and the ✕. `closeTabIndex={-1}` where showModal() must not put focus on the ✕. */
export function ModalHeader({
  tile,
  title,
  titleId,
  facts,
  onClose,
  closeTabIndex,
}: {
  tile: ReactNode;
  title: ReactNode;
  titleId?: string;
  facts?: ReactNode;
  onClose: () => void;
  closeTabIndex?: number;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-5 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-accent-tint text-accent">{tile}</span>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="truncate text-sm font-semibold text-ink">
          {title}
        </h2>
        {facts && <p className="truncate text-xs text-muted">{facts}</p>}
      </div>
      <CloseButton tabIndex={closeTabIndex} onClick={onClose} />
    </header>
  );
}

/** The footer: the primary first, then the secondary, then (after a spacer the caller places) a
 *  status — "נשמר תוך כדי עריכה" on a live-edit window. */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3.5">{children}</footer>;
}
