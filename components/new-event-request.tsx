"use client";

import { useEffect, useRef } from "react";

// The header's "+ יצירת אירוע חדש" for a HALL (components/app-shell.tsx). A designer's opens the
// shell's own EventDialog; a hall's booking dialog needs the page's menu and hands its saved list
// back to the page's own state, so the shell does not open it — it ASKS, and the page on screen
// (the dashboard, /bookings) answers with its dialog. A window event, the same seam the venue
// switcher uses to tell its readers the active venue moved (lib/venues/storage.ts).
const NEW_EVENT_REQUEST = "eve:new-event";

export function requestNewEvent(): void {
  window.dispatchEvent(new Event(NEW_EVENT_REQUEST));
}

/** Opens this page's own new-event dialog when the header asks. */
export function useNewEventRequest(open: () => void): void {
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  });
  useEffect(() => {
    const on = () => latest.current();
    window.addEventListener(NEW_EVENT_REQUEST, on);
    return () => window.removeEventListener(NEW_EVENT_REQUEST, on);
  }, []);
}
