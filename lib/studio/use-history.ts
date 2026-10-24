import { useCallback, useEffect, useRef, useState } from "react";
import { isTypingTarget } from "@/lib/keyboard";

// A generic snapshot undo stack, for state that isn't an outline.
//
// lib/studio/use-outline-editor.ts already owns history for the hall's outline + doors + fixtures,
// but it is welded to that one shape of state. The venue plan's history has to cover a wall *graph*
// and the zone list together — one Ctrl+Z should take back "I named that room" exactly as readily as
// "I dragged that wall", and the two are constantly interleaved — so it needs its own. The honest
// way to share is a stack that knows nothing about what it holds.

const MAX_HISTORY = 50;

interface Stack<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface History<T> {
  present: T;
  /** A discrete edit — pushes the previous state and opens a fresh entry. */
  set: (next: T | ((prev: T) => T)) => void;
  /** A continuing gesture (a drag): the first call pushes, every later one overwrites, so fifty
   *  pointermoves collapse into one undo step. `commit` closes it. */
  amend: (next: T | ((prev: T) => T)) => void;
  commit: () => void;
  /** Swaps the timeline out wholesale — a venue switch, not an edit. History does not survive it,
   *  by design: undoing across two different properties would be nonsense. */
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: T | (() => T), opts: { keyboard?: boolean } = {}): History<T> {
  const [stack, setStack] = useState<Stack<T>>(() => ({
    past: [],
    present: typeof initial === "function" ? (initial as () => T)() : initial,
    future: [],
  }));
  // Whether a gesture is open. A ref rather than state: it is read and written within a single
  // pointermove and must not wait for a render to take effect.
  const open = useRef(false);

  const apply = (next: T | ((prev: T) => T), prev: T): T =>
    typeof next === "function" ? (next as (p: T) => T)(prev) : next;
  const push = (past: T[], present: T) => [...past, present].slice(-MAX_HISTORY);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    open.current = false;
    setStack((s) => ({ past: push(s.past, s.present), present: apply(next, s.present), future: [] }));
  }, []);

  const amend = useCallback((next: T | ((prev: T) => T)) => {
    // The flag flips outside the updater: React may invoke an updater twice, and the second run
    // must not see a gesture the first one opened and conclude it has already pushed.
    const wasOpen = open.current;
    open.current = true;
    setStack((s) =>
      wasOpen
        ? { ...s, present: apply(next, s.present) }
        : { past: push(s.past, s.present), present: apply(next, s.present), future: [] },
    );
  }, []);

  const commit = useCallback(() => {
    open.current = false;
  }, []);

  const reset = useCallback((next: T) => {
    open.current = false;
    setStack({ past: [], present: next, future: [] });
  }, []);

  const undo = useCallback(() => {
    open.current = false;
    setStack((s) =>
      s.past.length === 0
        ? s
        : { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] },
    );
  }, []);

  const redo = useCallback(() => {
    open.current = false;
    setStack((s) =>
      s.future.length === 0 ? s : { past: push(s.past, s.present), present: s.future[0], future: s.future.slice(1) },
    );
  }, []);

  // Ctrl/Cmd+Z and Ctrl+Y / Ctrl+Shift+Z, matching the outline editor's own bindings so the two
  // editors don't disagree about what undo's shortcut is.
  const keyboard = opts.keyboard ?? false;
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTypingTarget()) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, undo, redo]);

  return {
    present: stack.present,
    set,
    amend,
    commit,
    reset,
    undo,
    redo,
    canUndo: stack.past.length > 0,
    canRedo: stack.future.length > 0,
  };
}
