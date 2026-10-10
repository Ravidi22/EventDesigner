// One pointer gesture, driven from the WINDOW — the way every drag library does it (dnd-kit,
// react-flow, tldraw), and for the same reason.
//
// Every draggable thing on the plan used to listen for its own pointermove/pointerup, holding the
// pointer with setPointerCapture. That breaks the moment the element it was set on moves in the
// DOM: Chrome releases the capture when a captured node is removed, and React removes and
// re-inserts a node to reorder it — which is exactly what the studio does on the FIRST frame of a
// drag (the carried item is painted last, see `lifted` in canvas-stage.tsx). From then on the
// browser hit-tests every move against whatever is under the pointer, so the drag either stopped
// dead or, worse, the table underneath picked it up: its own onPointerMove found the gesture's
// origin in a module-level map keyed only by pointerId and started moving ITSELF. Those were the
// "drag exits on its own" and "the drag jumps to another element" reports.
//
// Here the press installs pointermove/pointerup/pointercancel listeners on the window, in the
// capture phase, and removes them on release. Nothing on the way to the window can intercept them,
// the element may be reordered, re-keyed or unmounted mid-gesture, and no other element has a
// handler that could adopt the pointer. Capture is still taken on the pressed element as a
// courtesy (it keeps hover states off other things while dragging) but nothing depends on it.
//
// The click that follows a drag — browsers fire pointerdown → pointerup → click for every press —
// is swallowed at the window too, before React's root listener can see it, so a drag never ends by
// re-selecting the thing under the pointer and collapsing the group it just moved.

export interface PointerGesture {
  /** The press has travelled past the threshold: this is a drag, not a click. Once. */
  onStart?: (e: PointerEvent) => void;
  /** Every move after that. The native event: clientX/Y, altKey, shiftKey, buttons. */
  onMove: (e: PointerEvent) => void;
  /** The release (or a cancel, or the button found already up). `moved` says whether the
   *  threshold was ever crossed — a press that never became a drag changed nothing. */
  onEnd?: (e: PointerEvent, moved: boolean) => void;
}

export interface GestureOptions {
  /** Pointer travel, in screen px, before a press turns into a drag. A click that drifts a pixel
   *  under the finger must select, never nudge. */
  thresholdPx?: number;
  /** Take pointer capture on this element (best effort — see above). Defaults to the event's
   *  currentTarget when a React event is passed. */
  capture?: Element | null;
}

const DEFAULT_THRESHOLD_PX = 4;

/** The one gesture per pointer that may be live. Starting another on the same pointer ends the
 *  first — a stale gesture must never outlive the press that started it. */
const live = new Map<number, () => void>();

type AnyPointerEvent = PointerEvent | { nativeEvent: PointerEvent; currentTarget: EventTarget & Element };

export function startPointerGesture(down: AnyPointerEvent, g: PointerGesture, opts: GestureOptions = {}): void {
  const native = "nativeEvent" in down ? down.nativeEvent : down;
  const threshold = opts.thresholdPx ?? DEFAULT_THRESHOLD_PX;
  const target = opts.capture !== undefined ? opts.capture : "nativeEvent" in down ? down.currentTarget : (native.target as Element | null);
  const pointerId = native.pointerId;
  const x0 = native.clientX;
  const y0 = native.clientY;
  let moved = false;
  let done = false;

  live.get(pointerId)?.();

  if (target && typeof target.setPointerCapture === "function") {
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Not connected, or the pointer is gone — the window listeners carry the gesture anyway.
    }
  }

  const finish = (e: PointerEvent) => {
    if (done) return;
    done = true;
    live.delete(pointerId);
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
    window.removeEventListener("blur", onBlur);
    if (target && typeof target.hasPointerCapture === "function") {
      try {
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      } catch {
        // already gone
      }
    }
    // The click that always follows a drag's release must not reach anything — it would be read as
    // "select just this" (or, on empty canvas, "clear the selection") the instant the drag ends.
    if (moved) swallowNextClick();
    g.onEnd?.(e, moved);
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    // The button is already up and we never heard the release — let go of the press as it was,
    // rather than keep dragging something behind a pointer that is no longer holding it.
    if ((e.buttons & 1) === 0) {
      finish(e);
      return;
    }
    if (!moved) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < threshold) return;
      moved = true;
      g.onStart?.(e);
    }
    g.onMove(e);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    finish(e);
  };
  // The window lost focus mid-press (alt-tab, a dialog): the release will never arrive here.
  const onBlur = () => finish(new PointerEvent("pointercancel", { pointerId }));

  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("blur", onBlur);
  live.set(pointerId, () => finish(new PointerEvent("pointercancel", { pointerId })));
}

/** Is any gesture holding the pointer right now? The canvas reads it to know a move with the
 *  button down is a drag and not a hover. */
export function gestureActive(): boolean {
  return live.size > 0;
}

let swallowing: (() => void) | null = null;

/** Eat the next click, wherever it lands — in the capture phase on the window, ahead of React's own
 *  root listener, so no onClick anywhere fires for it. Armed by a finished drag; disarmed by the
 *  click itself, or after a short while when none comes (a press released outside the window). */
export function swallowNextClick(windowMs = 150): void {
  swallowing?.();
  let timer = 0;
  const off = () => {
    window.removeEventListener("click", swallow, true);
    window.clearTimeout(timer);
    if (swallowing === off) swallowing = null;
  };
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    off();
  };
  window.addEventListener("click", swallow, true);
  timer = window.setTimeout(off, windowMs);
  swallowing = off;
}
