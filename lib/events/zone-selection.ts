// What the details form hands the server for the event's zones (components/event-form.tsx).
//
// The form resolves the ids the designer picked against the zone list it has LOADED for the venue,
// and that load is a round trip. A designer who stepped back to the details stage to fix a phone
// number and pressed שמירה והמשך before the list landed used to hand back an empty selection — every
// zone the event had, wiped, with the client watching, and nothing on screen to say so. So an
// unloaded list is not an empty one: while the venue is still the event's own, the event's zones
// stand as they are; only a venue change (which already cleared the picks) saves none.
//
// Pure, so the rule can be asserted without a browser: `npm run check:zone-selection`.

/** The two fields the event row stores for its zones — the ids, and their names joined. */
export interface ZoneSelection {
  zoneIds: string[];
  zonesLabel: string;
}

/** The label stored on the event (EventSummary.zonesLabel) — one place builds it, so the details
 *  form and any later caller can't disagree about the separator. */
export function labelForZones(zones: readonly { name: string }[]): string {
  return zones.map((z) => z.name).join(" · ");
}

/**
 * @param picked  the ids the designer has on in the picker
 * @param loaded  the venue's zones, or null while they are still being fetched
 * @param venueId the venue the form currently names ("" = none)
 * @param event   the event being edited, or null when the form is creating one
 */
export function zoneSelection(
  picked: readonly string[],
  loaded: readonly { id: string; name: string }[] | null,
  venueId: string,
  event: { venueId?: string; zoneIds: readonly string[]; zonesLabel: string } | null,
): ZoneSelection {
  if (loaded) {
    const zones = picked.map((id) => loaded.find((z) => z.id === id)).filter((z): z is { id: string; name: string } => !!z);
    return { zoneIds: zones.map((z) => z.id), zonesLabel: labelForZones(zones) };
  }
  if (event && (event.venueId ?? "") === venueId) return { zoneIds: [...event.zoneIds], zonesLabel: event.zonesLabel };
  return { zoneIds: [], zonesLabel: "" };
}
