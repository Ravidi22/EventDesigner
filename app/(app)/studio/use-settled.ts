"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** `value` as it stood `ms` after it last changed — and never while a pointer button is held
 *  anywhere on the page. A drag is a stream of values; a reader that is expensive (laying a stage's
 *  decks, lib/design-document/stage.ts layStage) waits for the hand to lift and the value to rest,
 *  instead of running on every frame of the gesture. The 3D pane's rule (scene-preview.tsx), for
 *  one value: the first render returns the value itself, so a reader never starts empty. */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  const latest = useRef(value);
  const held = useRef(false);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const schedule = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      // Held: the release schedules again.
      if (held.current) return;
      dirty.current = false;
      setSettled(latest.current);
    }, ms);
  }, [ms]);
  useEffect(() => {
    latest.current = value;
    dirty.current = true;
    schedule();
  }, [value, schedule]);
  useEffect(() => {
    const down = () => {
      held.current = true;
    };
    const up = (e: PointerEvent) => {
      if (e.buttons !== 0) return;
      held.current = false;
      if (dirty.current) schedule();
    };
    const blur = () => {
      held.current = false;
      if (dirty.current) schedule();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", blur);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, [schedule]);
  return settled;
}

/** How long a stage's outline rests before its decks are laid again. */
export const STAGE_SETTLE_MS = 150;

/** Whether a press that STARTED inside `area` is being dragged: true from its first move with the
 *  button still down, false when the button lifts (or the window loses focus). The held-pointer
 *  signal above, for a whole subtree — the end panel holds still on it (./hold-while-dragging.tsx).
 *  A state write on those two edges only, never per move. A press elsewhere — a field or a slider in
 *  the panel itself — is not a drag in the area, so a control being dragged is never frozen. */
export function useDragIn(area: RefObject<HTMLElement | null>): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let pressed = false;
    let on = false;
    const stop = () => {
      pressed = false;
      if (!on) return;
      on = false;
      setDragging(false);
    };
    const down = (e: PointerEvent) => {
      const el = area.current;
      pressed = !!el && e.target instanceof Node && el.contains(e.target);
    };
    const move = (e: PointerEvent) => {
      if (!pressed || on || e.buttons === 0) return;
      on = true;
      setDragging(true);
    };
    const up = (e: PointerEvent) => {
      if (e.buttons === 0) stop();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", stop);
    };
  }, [area]);
  return dragging;
}
