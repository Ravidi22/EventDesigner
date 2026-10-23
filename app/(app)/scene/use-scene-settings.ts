"use client";
// The event's camera work (viewpoints, the tour, the mood) as the scene screen holds it: read once
// per event through `fetchSceneSettings`, edited locally, and written back through
// `saveSceneSettings` 600 ms after the last change.
//
// The writes are SEQUENCED, the way the studio's autosave is (flush() in
// app/(app)/studio/studio-screen.tsx): at most one request in the air, the newest settings waiting
// in `pending` — two saves that overtook each other would leave the older list on the server with
// "נשמר" on screen. A pending write carries its own event id, so switching events mid-debounce can
// never write one event's viewpoints onto another, and it is flushed (not dropped) when the screen
// unmounts or the event changes.
//
// NOTHING IS WRITTEN BEFORE THE READ LANDS. Until the event's saved settings are here, the screen
// shows the defaults and editing is held (`ready`): a change made against the defaults and saved
// would replace the designer's real list. A failed read stays not-ready, with a retry.
//
// With no event (a scratch drawing) everything is local and nothing is ever sent.
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSceneSettings, saveSceneSettings } from "@/lib/scene/actions";
import { DEFAULT_SETTINGS, type SceneSettings } from "@/lib/scene/types";

/** local: no event, nothing is saved · loading / load-error: the event's settings are not here
 *  yet · idle / saving / saved / error: the write's state. */
export type SceneSaveStatus = "local" | "loading" | "load-error" | "idle" | "saving" | "saved" | "error";

export const SAVE_DEBOUNCE_MS = 600;

export function useSceneSettings(eventId: string | null) {
  const [settings, setSettings] = useState<SceneSettings>(DEFAULT_SETTINGS);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [attempt, setAttempt] = useState(0);
  // Another event: back to the defaults until its own settings land (adjusted during render, so
  // the old event's viewpoints are never shown for a frame under the new one's name).
  const [shownFor, setShownFor] = useState(eventId);
  if (shownFor !== eventId) {
    setShownFor(eventId);
    setSettings(DEFAULT_SETTINGS);
    setSaveState("idle");
  }

  /** The settings known to be on the server (or just read from it) — the save effect skips them. */
  const persisted = useRef<SceneSettings | null>(null);
  const pending = useRef<{ eventId: string; settings: SceneSettings } | null>(null);
  const inFlight = useRef(false);

  const flush = useCallback(async () => {
    if (inFlight.current) return; // the running save picks up whatever is pending when it lands
    inFlight.current = true;
    try {
      // One write at a time; a change that arrived while one was in the air goes next.
      for (let next = pending.current; next; next = pending.current) {
        setSaveState("saving");
        let ok = true;
        try {
          const result = await saveSceneSettings(next.eventId, next.settings);
          ok = !("error" in result);
        } catch {
          // Authorization throws (a crew member may look but not curate) — said the same way.
          ok = false;
        }
        if (!ok) {
          // `pending` keeps the settings: the retry and the next change both resend them.
          setSaveState("error");
          return;
        }
        persisted.current = next.settings;
        if (pending.current === next) {
          pending.current = null;
          setSaveState("saved");
        }
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  // The read, once per event (and again on a retry). Flushes the previous event's pending write
  // on the way out — including when the screen unmounts.
  useEffect(() => {
    if (!eventId) return;
    let live = true;
    fetchSceneSettings(eventId)
      .then((s) => {
        if (!live) return;
        persisted.current = s;
        setSettings(s);
        setLoadedFor(eventId);
        setFailedFor(null);
      })
      .catch(() => {
        if (live) setFailedFor(eventId);
      });
    return () => {
      live = false;
      if (pending.current) void flush();
    };
  }, [eventId, attempt, flush]);

  // The debounce: every change, 600 ms after the last.
  const ready = !eventId || loadedFor === eventId;
  useEffect(() => {
    if (!eventId || loadedFor !== eventId) return;
    if (settings === persisted.current) return;
    pending.current = { eventId, settings };
    setSaveState("saving");
    const t = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [settings, eventId, loadedFor, flush]);

  const status: SceneSaveStatus = !eventId ? "local" : failedFor === eventId ? "load-error" : loadedFor !== eventId ? "loading" : saveState;

  const retry = useCallback(() => {
    if (status === "load-error") {
      setFailedFor(null);
      setAttempt((a) => a + 1);
    } else void flush();
  }, [status, flush]);

  return { settings, setSettings, ready, status, retry };
}
