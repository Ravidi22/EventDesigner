"use client";
// The client's bar (spec §5.1): the viewpoints as chips, ▶ for the guided tour, the three moods and
// fullscreen — floating at the bottom centre of the viewer's box, the only thing on the 3D view
// that takes a press besides the room itself. Plain DOM, no three: it sits OVER the canvas as a
// sibling, so its wheel and presses never reach the camera.
//
// The look is the event rail's (components/event-surface.tsx Tab): a `rounded-pill bg-inset p-1`
// rail, the active chip `bg-accent-tint font-bold text-accent`. The chip strip is the one place a
// sideways scroll is acceptable — a strip of names — and it scrolls inside the bar, which is held
// to the viewer's width; the lit chip is kept in view as a tour moves on.
//
// Keyboard, on the whole bar: ←/→ move between viewpoints and fly there — in RTL → is the PREVIOUS
// one and ← the NEXT (the chips run right to left); Space plays or pauses the tour. Focus is
// roving: one chip is in the tab order (the lit one), the arrows carry focus with the choice.
import { type KeyboardEvent, type RefObject, type WheelEvent, useEffect, useRef, useSyncExternalStore } from "react";
import { Maximize, Minimize, Moon, Pause, Play, Sun, Sunset } from "lucide-react";
import { MOODS, MOOD_LABEL, type Mood, type Viewpoint } from "@/lib/scene/types";

export interface SceneBarProps {
  viewpoints: Viewpoint[];
  activeId: string | null;
  /** A chip chosen (tap, Enter, or an arrow key). The screen stops a playing tour and flies. */
  onActive: (id: string) => void;
  playing: boolean;
  /** ▶ / ⏸ — the screen flips `playing`. */
  onPlay: () => void;
  /** False when the tour has nothing to play. */
  canPlay?: boolean;
  mood: Mood;
  onMood: (mood: Mood) => void;
  /** What fullscreen takes over: the viewer's box, bar included. */
  fullscreenTarget: RefObject<HTMLElement | null>;
}

const MOOD_ICON = { day: Sun, evening: Sunset, night: Moon } as const;

const chipClass = (active: boolean) =>
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-pill px-3.5 py-1.5 text-caption transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent " +
  (active ? "bg-accent-tint font-bold text-accent" : "font-semibold text-ink-soft hover:bg-surface hover:text-ink");

const iconClass = (active: boolean) =>
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-pill transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 " +
  (active ? "bg-accent-tint text-accent" : "text-ink-soft hover:bg-surface hover:text-ink");

// Fullscreen is read from the document, not kept in state: Escape leaves it natively, and that
// must light the button off just the same.
const onFullscreenChange = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
};
const noSubscribe = () => () => {};

export function SceneBar({ viewpoints, activeId, onActive, playing, onPlay, canPlay = true, mood, onMood, fullscreenTarget }: SceneBarProps) {
  const strip = useRef<HTMLDivElement>(null);
  const full = useSyncExternalStore(
    onFullscreenChange,
    () => !!document.fullscreenElement && document.fullscreenElement === fullscreenTarget.current,
    () => false,
  );
  // iPhone Safari has no element fullscreen; the button is not offered where it cannot work.
  const canFull = useSyncExternalStore(noSubscribe, () => document.fullscreenEnabled === true, () => false);
  const activeIndex = viewpoints.findIndex((v) => v.id === activeId);

  // Keep the lit chip inside the strip — a tour lights them one after another. A physical delta
  // through scrollBy, so it is right in RTL without reading the browser's scrollLeft convention.
  useEffect(() => {
    const s = strip.current;
    if (!s || activeIndex < 0) return;
    const chip = s.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!chip) return;
    const sr = s.getBoundingClientRect();
    const cr = chip.getBoundingClientRect();
    const pad = 8;
    if (cr.left < sr.left) s.scrollBy({ left: cr.left - sr.left - pad, behavior: "smooth" });
    else if (cr.right > sr.right) s.scrollBy({ left: cr.right - sr.right + pad, behavior: "smooth" });
  }, [activeIndex]);

  const choose = (index: number) => {
    const v = viewpoints[index];
    if (!v) return;
    onActive(v.id);
    strip.current?.querySelector<HTMLButtonElement>(`[data-index="${index}"]`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Spacebar") {
      // Space means the tour anywhere on the bar — never "press the focused chip".
      e.preventDefault();
      if (canPlay) onPlay();
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const n = viewpoints.length;
    if (!n) return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const forward = rtl ? e.key === "ArrowLeft" : e.key === "ArrowRight";
    const next = activeIndex < 0 ? (forward ? 0 : n - 1) : (activeIndex + (forward ? 1 : -1) + n) % n;
    choose(next);
  };
  // Space's keyup is where a focused button would fire its click: stopped here as well.
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " || e.key === "Spacebar") e.preventDefault();
  };

  // A mouse wheel over the strip scrolls it sideways (its scrollbar is hidden; a trackpad and a
  // finger scroll it natively). Down = onward, which in RTL is to the left.
  const onStripWheel = (e: WheelEvent<HTMLDivElement>) => {
    const s = e.currentTarget;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || s.scrollWidth <= s.clientWidth) return;
    const rtl = getComputedStyle(s).direction === "rtl";
    s.scrollBy({ left: rtl ? -e.deltaY : e.deltaY });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    const el = fullscreenTarget.current;
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => {});
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
      <div
        role="toolbar"
        aria-label="נקודות מבט ותצוגה"
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        className="pointer-events-auto flex max-w-[calc(100%-2rem)] items-center gap-1 rounded-pill bg-inset p-1 shadow-lifted"
      >
        {viewpoints.length > 0 && (
          <>
            <div
              ref={strip}
              onWheel={onStripWheel}
              className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {viewpoints.map((v, i) => {
                const active = i === activeIndex;
                return (
                  <button
                    key={v.id}
                    type="button"
                    data-index={i}
                    aria-pressed={active}
                    tabIndex={active || (activeIndex < 0 && i === 0) ? 0 : -1}
                    onClick={() => onActive(v.id)}
                    className={chipClass(active)}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
            <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          </>
        )}
        <button
          type="button"
          onClick={onPlay}
          disabled={!canPlay}
          aria-pressed={playing}
          aria-label={playing ? "עצירה" : "סיור מודרך"}
          title={playing ? "עצירה" : "סיור מודרך"}
          className={iconClass(playing)}
        >
          {playing ? <Pause className="h-4 w-4" strokeWidth={1.75} /> : <Play className="h-4 w-4" strokeWidth={1.75} />}
        </button>
        <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
        <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="תאורה">
          {MOODS.map((m) => {
            const Icon = MOOD_ICON[m];
            const active = m === mood;
            return (
              <button key={m} type="button" aria-pressed={active} aria-label={MOOD_LABEL[m]} title={MOOD_LABEL[m]} onClick={() => onMood(m)} className={iconClass(active)}>
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </button>
            );
          })}
        </div>
        {canFull && (
          <>
            <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={full}
              aria-label={full ? "יציאה ממסך מלא" : "מסך מלא"}
              title={full ? "יציאה ממסך מלא" : "מסך מלא"}
              className={iconClass(false)}
            >
              {full ? <Minimize className="h-4 w-4" strokeWidth={1.75} /> : <Maximize className="h-4 w-4" strokeWidth={1.75} />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
