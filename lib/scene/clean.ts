// What `saveSceneSettings` accepts. Every export of a "use server" module is a public POST endpoint
// (CLAUDE.md), so the settings it is handed are whatever a browser chose to send: this is the one
// place they are turned into a SceneSettings or refused. Plain module (not "use server") so the
// rules are checked here under Node — `npx tsx lib/scene/clean.ts`.
import { isMain } from "../self-check";
import { MAX_VIEWPOINTS, MOODS, type Mood, type SceneSettings, type Tour, type TourStop, type Viewpoint } from "./types";

export const MAX_TOUR_STOPS = 100;
export const MAX_NAME = 60;
export const MAX_ID = 64;
/** A coordinate further than this (100 km) is not a place in a venue. */
const MAX_COORD_MM = 100_000_000;
export const DWELL_RANGE = { min: 0, max: 60_000 } as const;
export const TRAVEL_RANGE = { min: 200, max: 20_000 } as const;
export const FOV_RANGE = { min: 20, max: 100 } as const;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function cleanVec(v: unknown): { x: number; y: number; z: number } | null {
  if (!isObj(v) || !finite(v.x) || !finite(v.y) || !finite(v.z)) return null;
  if ([v.x, v.y, v.z].some((n) => Math.abs(n as number) > MAX_COORD_MM)) return null;
  return { x: v.x, y: v.y, z: v.z };
}

function cleanViewpoint(v: unknown): Viewpoint | null {
  if (!isObj(v)) return null;
  if (typeof v.id !== "string" || !v.id || v.id.length > MAX_ID) return null;
  if (typeof v.name !== "string") return null;
  const name = v.name.trim().slice(0, MAX_NAME);
  if (!name) return null;
  const eye = cleanVec(v.eye);
  const look = cleanVec(v.look);
  if (!eye || !look) return null;
  const out: Viewpoint = { id: v.id, name, eye, look };
  if (finite(v.fovDeg)) out.fovDeg = clamp(v.fovDeg, FOV_RANGE.min, FOV_RANGE.max);
  return out;
}

function cleanStop(s: unknown, known: (id: string) => boolean): TourStop | null {
  if (!isObj(s) || typeof s.viewpointId !== "string" || !known(s.viewpointId)) return null;
  const dwellMs = finite(s.dwellMs) ? Math.round(clamp(s.dwellMs, DWELL_RANGE.min, DWELL_RANGE.max)) : null;
  const travelMs = finite(s.travelMs) ? Math.round(clamp(s.travelMs, TRAVEL_RANGE.min, TRAVEL_RANGE.max)) : null;
  if (dwellMs === null || travelMs === null) return null;
  return { viewpointId: s.viewpointId, dwellMs, travelMs };
}

/** The settings as the browser sent them, kept to what a SceneSettings may hold: a known mood, at
 *  most MAX_VIEWPOINTS named viewpoints with real coordinates (duplicate ids keep the first), and a
 *  tour whose stops name a saved viewpoint or one of the generated defaults (`default:…` — a tour
 *  may be built on them before anything is saved), with dwell and travel clamped. Anything that
 *  is not even an object is refused. */
export function cleanSceneSettings(input: unknown): SceneSettings | { error: string } {
  if (!isObj(input)) return { error: "הגדרות התצוגה אינן תקינות" };
  const mood: Mood = MOODS.includes(input.mood as Mood) ? (input.mood as Mood) : "evening";
  const raw = Array.isArray(input.viewpoints) ? input.viewpoints : [];
  if (raw.length > MAX_VIEWPOINTS) return { error: `אפשר לשמור עד ${MAX_VIEWPOINTS} נקודות מבט` };
  const seen = new Set<string>();
  const viewpoints: Viewpoint[] = [];
  for (const v of raw) {
    const c = cleanViewpoint(v);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    viewpoints.push(c);
  }
  let tour: Tour | null = null;
  if (isObj(input.tour) && Array.isArray(input.tour.stops)) {
    const known = (id: string) => seen.has(id) || (id.startsWith("default:") && id.length <= MAX_ID);
    const stops = input.tour.stops
      .slice(0, MAX_TOUR_STOPS)
      .map((s) => cleanStop(s, known))
      .filter((s): s is TourStop => !!s);
    tour = { stops, loop: input.tour.loop !== false };
  }
  const out: SceneSettings = { mood, viewpoints, tour };
  if (input.tableware === false) out.tableware = false;
  return out;
}

if (isMain(import.meta.url)) {
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
}
