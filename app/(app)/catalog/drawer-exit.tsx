"use client";

import { useRef, useState } from "react";
import type { Product } from "@/lib/catalog/types";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** What a catalog drawer's `onSave` answers: nothing or true — saved, the drawer closes; false —
 *  refused with nothing more to say; a string — refused, and why. */
export type DrawerSaveAnswer = void | boolean | string;
export type DrawerOnSave = (p: Product) => DrawerSaveAnswer | Promise<DrawerSaveAnswer>;

/** What the drawer says when a save did not take and the screen gave no reason. */
const SAVE_FAILED = "השמירה נכשלה — השינויים נשארו בטופס. נסו שוב.";

/**
 * A catalog drawer's ways OUT (the product drawer and the composite drawer — QA 2026-11-20):
 *
 *  • the SAVE closes the drawer only once the screen's `onSave` answered that it took. It used to
 *    close in the same click, before the answer came back, so a refused save (a stock count of 2.5 —
 *    PR-2) threw the whole draft away under a banner that said only "השמירה נכשלה". Now the drawer
 *    stays on the draft and says why (`error`), and the id a NEW row is saved under is minted once
 *    (`idFor`), so a retry writes that same row rather than a second one.
 *  • a CLOSE of a changed draft — Esc, the ✕, ביטול — asks first (PR-10): `canClose` for the
 *    Drawer's own, `cancel` for the footer's ביטול, `question` rendered inside the Drawer.
 *
 * `reset` is for a drawer that stays mounted from one row to the next (the product drawer resets
 * while rendering, on a new row): it forgets the last row's answer, question and minted id.
 */
export function useDrawerExit({ dirty, onSave, onClose }: { dirty: boolean; onSave: DrawerOnSave; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [minted, setMinted] = useState<string | null>(null);
  // A second click while the first save is in the air must not send it twice — read in the handler,
  // where the `saving` it closed over can still be the render's before the first click.
  const inFlight = useRef(false);

  /** The id `p` is saved under: its own, else one minted for this draft and kept for its retries. */
  const idFor = (p: Pick<Product, "id">): string => {
    if (p.id) return p.id;
    const id = minted ?? crypto.randomUUID();
    if (!minted) setMinted(id);
    return id;
  };

  const save = async (p: Product) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setSaving(true);
    let answer: DrawerSaveAnswer;
    try {
      answer = await onSave(p);
    } catch {
      answer = false;
    }
    inFlight.current = false;
    setSaving(false);
    if (answer === false || typeof answer === "string") {
      setError(typeof answer === "string" && answer ? answer : SAVE_FAILED);
      return;
    }
    onClose();
  };

  /** May the drawer close now? A changed draft asks first, and answers no until the question is
   *  answered; a save in the air holds it open. */
  const canClose = (): boolean => {
    if (inFlight.current) return false;
    if (!dirty) return true;
    setAsking(true);
    return false;
  };

  const reset = () => {
    setSaving(false);
    setError(null);
    setAsking(false);
    setMinted(null);
  };

  const question = (
    <ConfirmDialog
      open={asking}
      title="לסגור בלי לשמור?"
      body="השינויים שעשיתם כאן לא יישמרו."
      confirmLabel="סגירה בלי שמירה"
      onConfirm={() => {
        setAsking(false);
        onClose();
      }}
      onClose={() => setAsking(false)}
    />
  );

  return {
    saving,
    error,
    setError,
    save,
    canClose,
    /** The footer's ביטול: closes, unless the draft changed — then asks. */
    cancel: () => {
      if (canClose()) onClose();
    },
    idFor,
    reset,
    question,
  };
}

/** The line over a drawer's footer that says why a save did not take. */
export function SaveError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-t border-alert-tint bg-alert-tint px-5 py-2 text-xs font-semibold leading-relaxed text-alert-ink">
      {message}
    </p>
  );
}
