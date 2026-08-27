"use client";
// The designer's own Google entries, as the calendar grid needs them: grouped by day, and widened
// when they navigate past what has been loaded.
//
// ⚠ AN OVERLAY, NOT DATA. Every failure path here ends in "keep whatever we have and say nothing".
// That is the opposite of useAppointments, whose writes throw so a designer never loses a meeting —
// and the difference is that nothing here is the studio's record of anything. These blocks are a
// convenience drawn on top of the diary; if Google is slow, revoked or switched off, the correct
// behaviour is a calendar with no grey blocks on it, not an error the designer has to dismiss.
//
// ⚠ PASS `initial` FROM THE SERVER, as the dashboard's page.tsx does — the blocks are then on screen
// in the first paint rather than appearing a beat later, which on a month grid reads as the layout
// twitching.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGoogleBusy } from "./actions";
import type { BusyBlock } from "./types";

export interface BusyHandle {
  /** Grouped by ISO date — the shape the grid reads, so no cell filters the whole list. */
  byDate: Map<string, BusyBlock[]>;
  /** Ask for a range. Cheap and idempotent: returns immediately unless the range reaches outside
   *  what is already loaded, so a component may call it on every render of a month. */
  ensureRange: (fromISO: string, toISO: string) => void;
}

/** @param connected whether this designer has a Google connection with the pull switched on. When
 *  false the hook is inert and `ensureRange` never fires — the server would answer every one of
 *  those requests with an empty list, and month navigation would spend a round trip per click to
 *  be told nothing, forever. */
export function useBusy(
  initial: BusyBlock[],
  initialWindow: { from: string; to: string },
  connected: boolean,
): BusyHandle {
  const [blocks, setBlocks] = useState(initial);
  const [seed, setSeed] = useState(initial);

  // The loaded window, in a ref rather than state: `ensureRange` is called from a render path and
  // must be able to read the CURRENT window without the identity of the callback changing every
  // time it moves — a dependency loop that would refetch forever.
  const loaded = useRef(initialWindow);
  // Guards against firing the same widen twice while the first is still in the air, which is what
  // clicking "next month" three times quickly would otherwise do.
  const inFlight = useRef(false);

  // A newer list from the server wins, same rule as useAppointments — adjusted during render.
  if (initial !== seed) {
    setSeed(initial);
    setBlocks(initial);
  }

  // The window that came with it, resynced in an EFFECT rather than in the block above. Writing a
  // ref during render is what `react-hooks/refs` forbids, and the rule is right here for a concrete
  // reason: React may render this component without committing, and a ref moved during a render
  // that gets thrown away would leave the hook believing it holds a window it never fetched.
  const { from: windowFrom, to: windowTo } = initialWindow;
  useEffect(() => {
    loaded.current = { from: windowFrom, to: windowTo };
  }, [windowFrom, windowTo]);

  const ensureRange = useCallback(
    (fromISO: string, toISO: string) => {
    if (!connected) return;
    const have = loaded.current;
    if (fromISO >= have.from && toISO <= have.to) return;
    if (inFlight.current) return;

    // Widen to the UNION and refetch the whole thing rather than fetching only the missing strip
    // and merging. A merge would have to reconcile two lists that can legitimately disagree about
    // the same day — an all-day event expands into one block per day (lib/google/mapping.ts), so a
    // partial fetch returns a partial expansion of any event straddling the seam. One request for
    // the whole window is a few hundred milliseconds and cannot produce a half-drawn holiday.
    const from = fromISO < have.from ? fromISO : have.from;
    const to = toISO > have.to ? toISO : have.to;

    inFlight.current = true;
    fetchGoogleBusy(from, to)
      .then((next) => {
        setBlocks(next);
        loaded.current = { from, to };
      })
      .catch(() => {
        // Deliberately silent — see the note at the top. Keeps the blocks already on screen.
      })
      .finally(() => {
        inFlight.current = false;
      });
    },
    [connected],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, BusyBlock[]>();
    for (const block of blocks) {
      const day = map.get(block.date);
      if (day) day.push(block);
      else map.set(block.date, [block]);
    }
    // Timed entries in clock order, all-day ones first — an all-day חופשה is a statement about the
    // whole cell and belongs above the hours inside it.
    for (const day of map.values()) {
      day.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    }
    return map;
  }, [blocks]);

  // ONE STABLE OBJECT. The grid calls `ensureRange` from an effect keyed on this handle, so a fresh
  // object literal per render would re-run that effect on every render of the dashboard — harmless,
  // because ensureRange returns early on a loaded range, but it is the kind of harmless that stops
  // being harmless the first time somebody adds work to it.
  return useMemo(() => ({ byDate, ensureRange }), [byDate, ensureRange]);
}
