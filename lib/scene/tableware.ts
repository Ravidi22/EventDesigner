// A place setting at every seat of a table: charger, plate, a folded napkin, a water glass and a
// wine glass, a knife and a fork. Seen on plan A in a browser (2026-10-23): a dressed table with
// no settings reads as a table nobody is coming to; the eye looks for the plates before it looks
// at the flowers.
//
// ⚠ ILLUSTRATION, NOT INVENTORY. Nothing here is in the design document or the catalog: these are
// not counted, quoted, packed or ordered — a venue supplies its own dishes, and a designer who
// rents chargers places them as catalog items like any other. That is why the setting is generic
// (white plate, champagne charger, silver), why it is one switch on the event's camera work
// (SceneSettings.tableware — on unless switched off), and why it lives here and not in items.ts.
//
// One geometry for every seat in the room: a single instanced body however many guests.
import type { Seat } from "@/lib/studio/seating";
import { CHAIR_OFFSET_MM } from "@/lib/studio/seating";
import type { SceneCollector, InstanceRequest } from "./collect";
import { compose, seatTransform } from "./frame";
import { glassMaterial, glossMaterial, metalMaterial, clothMaterial } from "./materials";
import { type MaterialRef, type Part, type Transform, transform, vec3 } from "./types";

/** From a chair's centre to its plate's: the chair stands CHAIR_OFFSET_MM outside the table's edge
 *  and the plate sits PLATE_IN_MM inside it. */
export const PLATE_IN_MM = 230;
export const SETTING_REACH_MM = CHAIR_OFFSET_MM + PLATE_IN_MM;

/** Champagne, matte: a glossy charger mirrored the dark floor and read grey (2026-10-23). */
const CHARGER: MaterialRef = { colour: "#d8c7a2", kind: "matte" };
const PLATE = glossMaterial("#fbfbfa");
const NAPKIN = clothMaterial("#f6f3ee");
const SILVER = metalMaterial("#cfcfd4");
const GLASS = glassMaterial("#eef4f7");

/** One setting in its own frame: the diner at −y, the table's middle at +y, the table top at z 0. */
export function settingParts(): Part[] {
  return [
    { shape: "cylinder", rTop: 158, rBottom: 158, h: 6, at: vec3(0, 0, 0), segments: 40, material: CHARGER },
    { shape: "lathe", profile: [{ r: 0, z: 0 }, { r: 95, z: 0 }, { r: 112, z: 6 }, { r: 128, z: 14 }, { r: 132, z: 16 }, { r: 120, z: 12 }, { r: 0, z: 9 }], at: vec3(0, 0, 6), segments: 40, material: PLATE },
    { shape: "box", w: 100, d: 150, h: 10, at: vec3(0, -10, 18), material: NAPKIN },
    { shape: "box", w: 16, d: 215, h: 3, at: vec3(185, 0, 0), material: SILVER },
    { shape: "box", w: 22, d: 200, h: 3, at: vec3(-185, 0, 0), material: SILVER },
    // A water glass and a wine glass, up and to the diner's right.
    { shape: "lathe", profile: [{ r: 0, z: 0 }, { r: 34, z: 0 }, { r: 34, z: 3 }, { r: 6, z: 8 }, { r: 5, z: 70 }, { r: 30, z: 88 }, { r: 40, z: 130 }, { r: 38, z: 185 }, { r: 35, z: 185 }, { r: 0, z: 182 }], at: vec3(120, 215, 0), segments: 20, material: GLASS },
    { shape: "lathe", profile: [{ r: 0, z: 0 }, { r: 30, z: 0 }, { r: 30, z: 3 }, { r: 5, z: 8 }, { r: 4, z: 85 }, { r: 26, z: 100 }, { r: 36, z: 135 }, { r: 30, z: 170 }, { r: 28, z: 170 }, { r: 0, z: 167 }], at: vec3(200, 160, 0), segments: 20, material: GLASS },
  ];
}

const REQUEST: Omit<InstanceRequest, "at"> = {
  key: "tableware:setting",
  parts: settingParts(),
  material: PLATE,
  tag: { type: "tableware", label: "כלי שולחן להמחשה" },
  castShadow: false,
};

/** A setting at each seat of a ring, on the table top `topMm` above the frame's floor. `frame` is
 *  the table's (or block's) room transform, as the chairs were placed in. */
export function placeSettings(seats: readonly Seat[], frame: Transform, topMm: number, out: SceneCollector): void {
  for (const seat of seats) {
    // The chair's transform puts its +y at the table; the setting is SETTING_REACH_MM further in.
    const chair = seatTransform(frame, seat);
    out.instance({ ...REQUEST, at: compose(chair, transform(vec3(0, SETTING_REACH_MM, topMm), 0)) });
  }
}
