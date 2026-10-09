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
import { isMain } from "../self-check";

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

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const hall = { id: "z1", name: "אולם" };
  const garden = { id: "z2", name: "גן" };
  const event = { venueId: "v1", zoneIds: ["z1", "z2"], zonesLabel: "אולם · גן" };

  const picked = zoneSelection(["z2", "z1"], [hall, garden], "v1", event);
  assert(picked.zoneIds.join() === "z2,z1" && picked.zonesLabel === "גן · אולם", "loaded: the picks, in the designer's order");
  assert(zoneSelection(["z1", "gone"], [hall, garden], "v1", event).zoneIds.join() === "z1", "loaded: an id the venue no longer has is dropped");
  assert(zoneSelection([], [hall, garden], "v1", event).zoneIds.length === 0, "loaded: clearing every zone is a real answer");

  const kept = zoneSelection(["z1", "z2"], null, "v1", event);
  assert(kept.zoneIds.join() === "z1,z2" && kept.zonesLabel === "אולם · גן", "not loaded, same venue: the event's zones stand");
  assert(zoneSelection([], null, "v2", event).zoneIds.length === 0, "not loaded, venue changed: nothing is carried over");
  assert(zoneSelection([], null, "v1", null).zoneIds.length === 0, "not loaded, creating: nothing to keep");
  assert(zoneSelection([], [], "", { ...event, venueId: undefined }).zonesLabel === "", "no venue: no zones");
  assert(zoneSelection([], null, "", { ...event, venueId: undefined, zoneIds: [], zonesLabel: "" }).zoneIds.length === 0, "no venue on either side: nothing");

  console.log("zone selection: ok");
}
