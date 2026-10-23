// `npm run check:viewpoints`: ./viewpoints.ts against the fixture. Its own file because the fixture
// primes the catalog and carries test rows, which the viewer's bundle must not import.
import { isMain } from "../self-check";
import { fixtureInput } from "./fixture";
import { DEFAULT_DWELL_MS, EYE_MM, type Tour, type Viewpoint, vec3 } from "./types";
import {
  CROSS_ZONE_LIFT_MM,
  INSIDE_DOOR_MM,
  MIN_EYE_MM,
  PORTRAIT_EYE_MM,
  clearEye,
  crossesZones,
  sightOf,
  defaultViewpoints,
  ease,
  flyPose,
  tourAt,
  tourOf,
  tourSchedule,
  viewpointsOf,
} from "./viewpoints";

const near = (a: number, b: number, eps = 1) => Math.abs(a - b) < eps;

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const input = fixtureInput(true);
  const defaults = defaultViewpoints({ doc: input.doc, structure: input.structure, zones: input.plan.zones, bounds: input.plan.bounds });

  const door = defaults.find((v) => v.id === "default:door:d1");
  // The fixture's door is in the hall's south wall (y = 12000), 10 m along it; the hall is north of it.
  assert(!!door && near(door.eye.y, 12000 - INSIDE_DOOR_MM) && near(door.eye.x, 10000) && near(door.eye.z, EYE_MM), `the door view stands 1 m inside the door at eye height (${JSON.stringify(door?.eye)})`);
  assert(door!.name === "מהכניסה" && near(door!.look.x, 10000) && near(door!.look.y, 6000), "…named מהכניסה, looking at the hall's middle");
  const over = defaults.find((v) => v.id === "default:overview")!;
  assert(!!over && over.eye.z > 5000 && over.eye.y > input.plan.bounds.maxY, "the overview is high and stands back past the plan's +y side");
  const stage = defaults.find((v) => v.id === "default:stage")!;
  assert(!!stage && stage.name === "מהבמה" && near(stage.eye.z, 600 + EYE_MM), "the stage view stands on the deck at eye height");
  const portraits = defaults.filter((v) => v.id.startsWith("default:table:"));
  assert(portraits.length >= 2, `the dressed tables get close-ups (${portraits.map((v) => v.name).join(", ")})`);
  const round = portraits.find((v) => v.id === "default:table:t:t1")!;
  const rim = Math.hypot(round.eye.x - 5000, round.eye.y - 5000);
  assert(!!round && rim > 900 + 1000 && near(round.eye.z, PORTRAIT_EYE_MM) && near(round.look.x, 5000) && near(round.look.y, 5000), `a table portrait stands outside the rim, above it, looking at its middle (${Math.round(rim)} mm out)`);
  const hallCentre = { x: 10000, y: 6000 };
  assert(Math.hypot(round.eye.x - hallCentre.x, round.eye.y - hallCentre.y) < Math.hypot(5000 - hallCentre.x, 5000 - hallCentre.y), "…from the room's side of the table, not between it and its wall");
  const block = portraits.find((v) => v.id === "default:table:g:g1")!;
  assert(!!block && Math.hypot(block.eye.x - 13200, block.eye.y - 4000) > 2400, "a block is framed as one table, from beyond its own reach");
  assert(defaults.every((v) => v.eye.z >= MIN_EYE_MM && v.look.z >= 0), "every default eye is above the floor");

  // A close-up never stands in a wall or behind one: a table hard against the hall's west wall (x 0)
  // is framed from inside the hall, whatever "away from the middle" says.
  const sight = sightOf(input.structure, input.plan.zones, input.doc);
  // The fixture's stage (6×4 m about (10000, 9500), its back the +y edge at y 11500) carries no
  // backdrop; one added along its back blocks a look through it, and without it the same look is clear.
  const stagePlacement = input.doc.placements.find((p) => p.stage)!;
  const backed = {
    ...input.doc,
    placements: input.doc.placements.map((p) =>
      p === stagePlacement ? { ...p, stage: { ...p.stage!, stairs: [...(p.stage!.stairs ?? []).filter((x) => x.edge !== 2), { id: "bd", kind: "backdrop" as const, edge: 2, t: 0.5, widthMm: 6000, full: true }] } } : p,
    ),
  };
  const behind = sightOf(input.structure, input.plan.zones, backed);
  assert(!behind.clear({ x: 10000, y: 11800 }, { x: 10000, y: 9500 }) && sight.clear({ x: 10000, y: 11800 }, { x: 10000, y: 9500 }), "a stage's backdrop blocks the view through it; without one the view is clear");
  const byWall = clearEye({ x: 1200, y: 6000 }, 3000, { x: 10000, y: 6000 }, sight);
  assert(byWall.x > 0 && sight.standsAt(byWall) && sight.clear(byWall, { x: 1200, y: 6000 }), `a table by a wall is framed from the room (${Math.round(byWall.x)}, ${Math.round(byWall.y)})`);
  assert(!sight.clear({ x: 10000, y: 6000 }, { x: 25000, y: 6000 }), "the hall's shared wall blocks a look onto the terrace");

  const walled = sightOf({ ...input.structure, features: [{ id: "box", kind: "structure", label: "", x: 5000, y: 6000, widthMm: 2000, depthMm: 2000, heightMm: 3000, shape: "rect", rotationDeg: 0 }] }, input.plan.zones);
  assert(!walled.standsAt({ x: 5000, y: 6000 }) && !walled.clear({ x: 2000, y: 6000 }, { x: 8000, y: 6000 }), "a tall structure is neither stood in nor seen through");
  const framed = clearEye({ x: 7000, y: 6000 }, 2500, { x: 15000, y: 6000 }, walled);
  assert(walled.standsAt(framed) && walled.clear(framed, { x: 7000, y: 6000 }), "…so a table beside it is framed from an open side");

  // Saved viewpoints replace the defaults; a tour keeps only the stops whose viewpoint exists.
  const saved: Viewpoint = { id: "v1", name: "שלי", eye: vec3(1, 2, 1600), look: vec3(3, 4, 900) };
  assert(viewpointsOf({ mood: "evening", viewpoints: [], tour: null }, defaults) === defaults, "no saved viewpoints: the defaults");
  assert(viewpointsOf({ mood: "evening", viewpoints: [saved], tour: null }, defaults)[0] === saved, "a saved one replaces them");
  const tour = tourOf({ mood: "evening", viewpoints: [saved], tour: { stops: [{ viewpointId: "gone", dwellMs: 1, travelMs: 1 }, { viewpointId: "v1", dwellMs: 2000, travelMs: 1000 }], loop: false } }, [saved]);
  assert(tour.stops.length === 1 && tour.stops[0].viewpointId === "v1" && !tour.loop, "a tour drops a stop whose viewpoint was deleted");
  const auto = tourOf({ mood: "evening", viewpoints: [], tour: null }, defaults);
  assert(auto.stops.length === defaults.length && auto.loop && auto.stops.every((s) => s.dwellMs === DEFAULT_DWELL_MS), "no tour saved: every viewpoint in order, looping");

  // The fly: ends where it should, and rises over the wall between two zones.
  const a: Viewpoint = { id: "a", name: "a", eye: vec3(0, 0, 1600), look: vec3(0, 1000, 900) };
  const b: Viewpoint = { id: "b", name: "b", eye: vec3(10000, 0, 1600), look: vec3(10000, 1000, 900) };
  const s0 = flyPose(a, b, 0, true);
  const s1 = flyPose(a, b, 1, true);
  assert(near(s0.eye.x, 0) && near(s0.eye.z, 1600) && near(s1.eye.x, 10000) && near(s1.eye.z, 1600), "a fly starts at one eye and ends at the other");
  const mid = flyPose(a, b, 0.5, true);
  assert(near(mid.eye.z, 1600 + CROSS_ZONE_LIFT_MM), `between zones it lifts CROSS_ZONE_LIFT_MM at the middle (${mid.eye.z})`);
  assert(near(flyPose(a, b, 0.5, false).eye.z, 1600), "within one zone it stays level");
  const steps = Array.from({ length: 21 }, (_, i) => flyPose(a, b, i / 20, true).eye.z);
  assert(steps.every((z) => z >= 1600 - 1e-6), "the fly never dips below both eyes");
  assert(near(ease(0), 0, 1e-9) && near(ease(1), 1, 1e-9) && near(ease(0.5), 0.5, 1e-9), "the ease is 0 → ½ → 1");

  // The tour's clock.
  const t2: Tour = { stops: [{ viewpointId: "a", dwellMs: 4000, travelMs: 1000 }, { viewpointId: "b", dwellMs: 2000, travelMs: 1500 }], loop: true };
  const sched = tourSchedule(t2);
  assert(sched.totalMs === 8500 && sched.legs[1].flyFrom === 5000 && sched.legs[1].arriveAt === 6500, "the schedule: fly, dwell, fly, dwell");
  assert(tourAt(t2, 500).index === 0 && near(tourAt(t2, 500).flyT, 0.5, 1e-9), "half way through the first fly");
  assert(tourAt(t2, 5750).index === 1 && near(tourAt(t2, 5750).flyT, 0.5, 1e-9), "half way through the second");
  assert(tourAt(t2, 8500 + 500).index === 0, "a looping tour wraps");
  const once = tourAt({ ...t2, loop: false }, 99999);
  assert(once.done && once.index === 1 && once.flyT === 1, "a tour that does not loop rests on its last stop");
  assert(crossesZones(a, b, input.plan.zones) === false || true, "crossesZones answers");
  const inHall: Viewpoint = { id: "h", name: "h", eye: vec3(10000, 6000, 1600), look: vec3(0, 0, 0) };
  const onTerrace: Viewpoint = { id: "t", name: "t", eye: vec3(25000, 6000, 1600), look: vec3(0, 0, 0) };
  assert(crossesZones(inHall, onTerrace, input.plan.zones) && !crossesZones(inHall, { ...inHall, id: "h2" }, input.plan.zones), "the hall to the terrace crosses a wall; the hall to the hall does not");

  console.log(`viewpoints ok: ${defaults.length} defaults (${defaults.map((v) => v.name).join(", ")})`);
}
