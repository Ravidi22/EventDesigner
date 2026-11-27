// npm run check:zone-selection — the self-check of ./zone-selection.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { zoneSelection } from "./zone-selection";

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
