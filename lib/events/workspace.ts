"use server";
// Everything the two event surfaces — the studio and the outputs sheets — need to open, in ONE
// dispatch.
//
// WHY THIS EXISTS. Both screens are about the same event, and both used to assemble it a piece at a
// time from the client: resolve the active event, then read its document, then its venue geometry,
// then (on outputs) the next export number. Four server actions, and because Next dispatches them
// one at a time per client, four strictly sequential POSTs — each one waiting for the last to land
// before it was even sent, each re-reading the session on arrival. On top of that the event itself
// was resolved TWICE, because the surface header (components/event-surface.tsx) needed it as well.
//
// The docs are explicit about the remedy: if you need parallel work, do it inside a single Server
// Action. That is this file.
//
// WHY IT STILL TAKES A `storedId` FROM THE CLIENT. Which event this device has open is a per-device
// pointer in localStorage (lib/events/storage.ts), and deliberately not studio data — so the server
// cannot know it without being told. It is resolved against what exists rather than trusted:
// fetchActiveEvent scopes the lookup to this organisation and falls back to the newest event, so an
// id naming another studio's event, or one archived on another device, resolves to something this
// caller may actually see or to nothing at all.
import { fetchActiveEvent } from "./actions";
import type { EventSummary } from "./types";
import { fetchDocument } from "@/lib/studio/actions";
import { fetchNextExportNumber } from "@/lib/outputs/actions";
import { fetchVenueGeometry } from "@/lib/venues/actions";
import type { StoredDocument } from "@/lib/design-document/types";
import { emptyStructure } from "@/lib/venues/structure";
import type { VenueGeometry } from "@/lib/venues/types";

export interface EventWorkspace {
  /** Null for a studio with no events at all — a real state, and the one the scratch drawing in
   *  lib/studio/storage.ts exists for. */
  event: EventSummary | null;
  /** Null for an event created before its hall-sketch stage: the studio opens on an empty document
   *  rather than on a fabricated one. */
  document: StoredDocument | null;
  geometry: VenueGeometry;
  /** The number the next sheet will carry (F-6.4). 1 when no event is open, which is what an
   *  unnumbered sheet would have said anyway. */
  nextExportNumber: number;
}

/**
 * Resolve the open event and everything hanging off it.
 *
 * Two waves, not four: the event has to be known before anything can be read about it, and then the
 * three reads that depend on it go out together. Against a hosted database the round trip is the
 * expensive part, so three concurrent queries cost about what one costs.
 *
 * The export number is fetched for the studio screen too, which does not use it. That is deliberate:
 * it rides along inside a wave that is already in flight, so it is free, and paying for it here
 * keeps both surfaces on one call instead of giving outputs a second dispatch of its own.
 */
export async function fetchEventWorkspace(storedId: string | null): Promise<EventWorkspace> {
  const event = await fetchActiveEvent(storedId);
  if (!event) {
    return {
      event: null,
      document: null,
      geometry: { structure: emptyStructure(), zones: [], mmPerUnit: 1, access: "none" },
      nextExportNumber: 1,
    };
  }

  const [document, geometry, nextExportNumber] = await Promise.all([
    fetchDocument(event.id),
    fetchVenueGeometry(event.venueId),
    fetchNextExportNumber(event.id),
  ]);

  return { event, document, geometry, nextExportNumber };
}
