// npm run check:scene-settings — the self-check of ./clean.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { MAX_VIEWPOINTS } from "./types";
import { cleanSceneSettings, FOV_RANGE, TRAVEL_RANGE } from "./clean";

const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
const vp = (id: string, extra: object = {}) => ({ id, name: ` ${id} `, eye: { x: 1, y: 2, z: 1600 }, look: { x: 3, y: 4, z: 900 }, ...extra });
assert("error" in cleanSceneSettings(null) && "error" in cleanSceneSettings("x") && "error" in cleanSceneSettings([]), "not an object: refused");
const ok = cleanSceneSettings({ mood: "night", viewpoints: [vp("a"), vp("b", { fovDeg: 500 })], tour: { stops: [{ viewpointId: "a", dwellMs: 4000, travelMs: 1500 }], loop: false } });
assert(!("error" in ok), "a good one passes");
if (!("error" in ok)) {
  assert(ok.mood === "night" && ok.viewpoints.length === 2 && ok.viewpoints[0].name === "a", "names are trimmed");
  assert(ok.viewpoints[1].fovDeg === FOV_RANGE.max, "a field of view is clamped");
  assert(!!ok.tour && ok.tour.stops.length === 1 && ok.tour.loop === false, "the tour is kept, loop as sent");
}
const odd = cleanSceneSettings({ mood: "dusk", viewpoints: [vp("a"), vp("a"), { id: "b", name: "  ", eye: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } }, vp("c", { eye: { x: NaN, y: 0, z: 0 } }), vp("d", { eye: { x: 1e12, y: 0, z: 0 } })], tour: { stops: [{ viewpointId: "zz", dwellMs: 1, travelMs: 1 }, { viewpointId: "default:overview", dwellMs: -5, travelMs: 99999999 }] } });
assert(!("error" in odd), "junk inside is dropped, not refused");
if (!("error" in odd)) {
  assert(odd.mood === "evening", "an unknown mood is the default");
  assert(odd.viewpoints.length === 1 && odd.viewpoints[0].id === "a", "a duplicate id, a blank name, a NaN and a coordinate past 100 km are all dropped");
  assert(odd.tour!.stops.length === 1 && odd.tour!.stops[0].viewpointId === "default:overview", "a stop must name a saved viewpoint or a default");
  assert(odd.tour!.stops[0].dwellMs === 0 && odd.tour!.stops[0].travelMs === TRAVEL_RANGE.max && odd.tour!.loop === true, "dwell and travel are clamped; loop defaults to on");
}
const many = cleanSceneSettings({ viewpoints: Array.from({ length: MAX_VIEWPOINTS + 1 }, (_, i) => vp(`v${i}`)) });
assert("error" in many, `more than ${MAX_VIEWPOINTS} viewpoints is refused with a reason`);
const bare = cleanSceneSettings({});
assert(!("error" in bare) && bare.viewpoints.length === 0 && bare.tour === null, "an empty object is the defaults");
console.log("scene settings clean ok");
