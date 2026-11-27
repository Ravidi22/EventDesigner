// npm run check:envelope — the self-check of ./envelope.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import { bulgeToCurve } from "@/lib/studio/geometry";
import { type BuiltOutline } from "@/lib/studio/footprint";
import { setWallHeight, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import { buildingFromBoundary } from "@/lib/venues/face-surfaces";
import { eventPlan } from "@/lib/events/plan";
import { emptyDocument } from "@/lib/design-document/types";
import { SceneCollector } from "./collect";
import { ENVELOPE } from "./materials";
import { hedgeParts, potParts, shrubParts, treeParts } from "./plants";
import { elevationOf } from "./elevation";
import { DEFAULT_SETTINGS, DOOR_HEIGHT_MM, DOOR_LEAF_MM, GARDEN_WALL_MM, GROUND_MARGIN_MM, KERB_MM, KERB_THICK_MM, WALL_THICK_MM, WATER_DEPTH_MM, type Part } from "./types";
import { BASIN_MATERIAL, BASIN_RIM_MM, BASIN_WATER_MM, BED_SOIL_MM, closedPolyline, COPING_HIGH_MM, COPING_MATERIAL, COPING_MM, envelopeNodes, FENCE_THICK_MM, FRAME_PROUD_MM, FRAME_TRIM_MM, GLASS_MM, inwardSide, MAX_HEADS, PLANT_FILL, plantInstance, ROOF_SLAB_MM, ROOF_UNDER_MM, tinted, type FloorOf } from "./envelope";

// ponytail: self-check. Run: npx tsx lib/scene/envelope.ts
{
  const assert = (ok: boolean, msg: string) => {
    if (!ok) {
      console.error("FAIL", msg);
      process.exit(1);
    }
  };
  const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

  // A hall (roofed, 4 m) and a terrace (open sky) sharing the wall n2–n3; the terrace's top wall
  // bows outward, its bottom is a kerb; one door on the hall's left wall swinging in, a double
  // gate in the terrace's garden wall swinging out. A pool on the terrace, in its lawn.
  //   n1 ──── n2 ──(bow)── n5
  //    │  hall │  terrace   │
  //   n4 ──── n3 ══kerb═══ n6
  const structure: VenueStructure = {
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 6000, y: 0 },
      { id: "n3", x: 6000, y: 4000 },
      { id: "n4", x: 0, y: 4000 },
      { id: "n5", x: 10000, y: 0 },
      { id: "n6", x: 10000, y: 4000 },
      // A shed under the hall: a third face, filled by a BUILDING rather than named a zone.
      { id: "n7", x: 0, y: 7000 },
      { id: "n8", x: 6000, y: 7000 },
    ],
    walls: [
      { id: "w-top-a", a: "n1", b: "n2", kind: "wall" },
      { id: "w-shared", a: "n2", b: "n3", kind: "wall" },
      { id: "w-bot-a", a: "n3", b: "n4", kind: "wall" },
      { id: "w-left", a: "n4", b: "n1", kind: "wall" },
      { id: "w-top-b", a: "n2", b: "n5", kind: "wall", curve: bulgeToCurve({ x: 6000, y: 0 }, { x: 10000, y: 0 }, { x: 8000, y: -500 }) },
      { id: "w-right", a: "n5", b: "n6", kind: "wall" },
      { id: "w-bot-b", a: "n6", b: "n3", kind: "edge" },
      { id: "w-left-c", a: "n4", b: "n7", kind: "wall" },
      { id: "w-bot-c", a: "n7", b: "n8", kind: "wall" },
      { id: "w-right-c", a: "n8", b: "n3", kind: "wall" },
    ],
    entrances: [
      { id: "door-1", wallId: "w-left", distanceMm: 2000, widthMm: 1000, swingInward: true, doubleDoor: false },
      { id: "gate-1", wallId: "w-right", distanceMm: 2000, widthMm: 1200, swingInward: false, doubleDoor: true },
      // A window on the hall's bottom wall: a sill at 900, a head at 2100.
      { id: "win-1", wallId: "w-bot-a", distanceMm: 1500, widthMm: 1200, swingInward: false, doubleDoor: false, kind: "window", sillMm: 900, headMm: 2100 },
    ],
    features: [
      { id: "col-1", kind: "structure", label: "עמוד", x: 1000, y: 1000, widthMm: 500, depthMm: 500, heightMm: 3000, shape: "rect", rotationDeg: 0 },
      { id: "kiosk-1", kind: "structure", label: "קיוסק", x: 4000, y: 1500, widthMm: 2000, depthMm: 1500, heightMm: 2500, shape: "rect", rotationDeg: 0 },
      { id: "lawn-1", kind: "surface", label: "דשא", x: 8000, y: 2000, widthMm: 2000, depthMm: 2000, heightMm: 0, shape: "rect", rotationDeg: 0, surface: "grass" },
      { id: "pool-1", kind: "pool", label: "בריכה", x: 8000, y: 2200, widthMm: 1600, depthMm: 1000, heightMm: 0, shape: "ellipse", rotationDeg: 0 },
      { id: "fount-1", kind: "fountain", label: "מזרקה", x: 8000, y: 2200, widthMm: 600, depthMm: 500, heightMm: 1200, shape: "ellipse", rotationDeg: 0 },
      { id: "tree-1", kind: "plant", label: "עץ", x: 7000, y: 1200, widthMm: 3500, depthMm: 3500, heightMm: 4000, shape: "circle", rotationDeg: 0, plant: "tree" },
      { id: "tree-2", kind: "plant", label: "עץ", x: 9000, y: 3000, widthMm: 3500, depthMm: 3500, heightMm: 4000, shape: "circle", rotationDeg: 0, plant: "tree" },
      { id: "palm-1", kind: "plant", label: "דקל", x: 9000, y: 1000, widthMm: 4500, depthMm: 4500, heightMm: 6000, shape: "circle", rotationDeg: 0, plant: "palm" },
      { id: "hedge-1", kind: "plant", label: "גדר חיה", x: 8000, y: 3600, widthMm: 4000, depthMm: 800, heightMm: 1200, shape: "rect", rotationDeg: 0, plant: "hedge" },
      { id: "bed-1", kind: "plant", label: "ערוגה", x: 2000, y: 500, widthMm: 3000, depthMm: 1200, heightMm: 400, shape: "rect", rotationDeg: 0, plant: "flowers" },
      { id: "seats-1", kind: "seating", label: "שורות כיסאות", x: 4500, y: 1200, widthMm: 1950, depthMm: 2400, heightMm: 900, shape: "rect", rotationDeg: 90, seating: { rows: 3, perRow: 4 } },
      { id: "stage-1", kind: "stage", label: "במה", x: 2000, y: 3000, widthMm: 4000, depthMm: 2000, heightMm: 600, shape: "rect", rotationDeg: 0 },
      { ...buildingFromBoundary([{ x: 0, y: 4000 }, { x: 6000, y: 4000 }, { x: 6000, y: 7000 }, { x: 0, y: 7000 }], 3000), fillsFace: true, id: "shed-1" },
    ],
  };
  const zone = (id: string, name: string, kind: "hall" | "open", anchor: Point, ceilingHeightMm: number) => ({ id, venueId: "v", name, kind, source: { type: "face" as const, anchor }, ceilingHeightMm, createdAt: 0 });
  const plan = eventPlan({ venueId: "v", zoneIds: ["z-hall"] }, {
    structure,
    zones: [zone("z-hall", "אולם", "hall", { x: 3000, y: 2000 }, 4000), zone("z-terrace", "מרפסת", "open", { x: 8000, y: 2000 }, 0)],
    mmPerUnit: 1,
    access: "granted",
  });
  assert(plan.all.length === 2 && plan.all.every((z) => !z.detached), "both zones resolve to their faces through the real face detection");

  const out = new SceneCollector();
  const { roofedMm } = envelopeNodes({ doc: emptyDocument(), plan, structure, settings: DEFAULT_SETTINGS, author: true }, out);
  const nodes = out.nodes();
  const bodies = nodes.filter((n): n is Extract<typeof n, { kind: "body" }> => n.kind === "body");
  const byId = (id: string) => bodies.find((b) => b.id === id);
  const boxH = (id: string) => {
    const b = byId(id);
    assert(!!b, `${id} is in the scene`);
    const hs = b!.parts.map((p) => (p.shape === "box" ? p.h : NaN));
    assert(hs.length > 0 && hs.every((h) => h === hs[0]), `${id} is boxes of one height`);
    return hs[0];
  };

  assert(bodies.filter((b) => b.tag.type === "floor").length === 2, "floors = 2 (every zone on the property)");
  assert(roofedMm === 4000, `roofedMm is the hall's 4000 (got ${roofedMm})`);
  const ceilings = bodies.filter((b) => b.tag.type === "ceiling");
  assert(ceilings.length === 1, "one ceiling plane — the terrace is open sky");
  const ceil = ceilings[0].parts[0];
  assert(ceil.shape === "plane" && ceil.at.z === 4000 && ceil.side === "down", "the ceiling is a plane at 4000 facing down");

  assert(boxH("wall:w-shared") === 4000, "the wall between hall and terrace takes the hall's 4000");
  assert(boxH("wall:w-top-a") === 4000, "the hall's outer walls are 4000");
  // The building: its walls stand to ITS height (not a garden wall's), and it is drawn as a roof
  // slab alone, under their tops — never a solid that doubles every wall.
  assert(boxH("wall:w-bot-c") === 3000 && boxH("wall:w-left-c") === 3000, "a wall bordering a building, and no roofed zone, stands to the building's height");
  const shed = byId("feature:shed-1")!;
  const roof = shed?.parts[0];
  assert(!!shed && shed.parts.length === 1 && roof.shape === "extrude" && roof.h === ROOF_SLAB_MM && near(roof.at.z + roof.h, 3000 - ROOF_UNDER_MM), "a building is its roof slab, its top a hair under the walls round it");
  // A bed: soil, a run of leafy blobs over it, and heads of several sizes and two tones scattered
  // on the foliage — none outside the bed.
  const bedNode = bodies.find((b) => b.id.startsWith("i:plant:flowers:"));
  assert(!!bedNode, "the bed is an instanced plant body");
  const bedParts = bedNode!.parts;
  const blobs = bedParts.filter((p) => p.shape === "blob");
  const bedHeads = bedParts.filter((p): p is Extract<Part, { shape: "sphere" }> => p.shape === "sphere");
  assert(blobs.length >= 3 && blobs.every((p) => p.material?.kind === "foliage"), `a 3 m bed carries a run of leafy blobs (${blobs.length})`);
  assert(bedHeads.length > 50 && new Set(bedHeads.map((p) => Math.round(p.r))).size >= 3 && new Set(bedHeads.map((p) => p.material?.colour)).size === 2, "…and bedHeads of several sizes in two tones");
  assert(bedHeads.every((p) => Math.abs(p.at.x) <= 1500 && Math.abs(p.at.y) <= 600 && p.at.z > BED_SOIL_MM + 60), "…every head inside the bed, standing on the foliage");
  // The window: the wall split into two full jambs and the piece under the sill, a lintel over it
  // from its head to the top, a glass pane between, a frame on four sides — and no leaf.
  const bot = byId("wall:w-bot-a")!;
  const botH = bot.parts.map((p) => (p.shape === "box" ? p.h : NaN)).sort((p, q) => p - q);
  assert(botH.join() === "900,4000,4000", `a windowed wall is two full jambs and the piece under the sill (got ${botH.join()})`);
  const winLintel = byId("door:win-1")!;
  assert(!!winLintel && winLintel.tag.type === "window" && winLintel.parts[0].shape === "box" && winLintel.parts[0].at.z === 2100 && winLintel.parts[0].h === 1900, "…the wall over the window from its head to the top, tagged window");
  const pane = byId("window:win-1")!;
  const glass = pane?.parts[0];
  assert(!!pane && pane.material.kind === "glass" && pane.parts.length === 1 && glass.shape === "box" && glass.at.z === 900 && glass.h === 1200 && near(glass.w, 1200) && glass.d === GLASS_MM, "…a GLASS_MM pane of glass from the sill to the head, the opening wide");
  const winFrame = byId("window-frame:win-1")!;
  assert(!!winFrame && winFrame.parts.length === 4 && winFrame.material.colour === ENVELOPE.doorFrame && winFrame.parts.every((p) => p.shape === "box" && p.at.z >= 900 && p.at.z + p.h <= 2100 + 1e-6), "…framed on four sides between the sill and the head");
  assert(!byId("door-leaf:win-1") && !byId("door-frame:win-1"), "…and no leaf, no door frame");
  // The fountain set in the pool stands on its water, as the catalog's fountain body.
  const fount = byId("feature:fount-1")!;
  assert(!!fount && near(fount.instances[0].at.z, -WATER_DEPTH_MM) && fount.parts.some((p) => p.shape === "plane" && p.material?.kind === "water") && fount.parts.some((p) => p.shape === "lathe"), "a fountain set in a pool stands on the pool's water: the basin, the bowl on its stem (./floor-kinds.ts)");
  assert(boxH("wall:w-right") === GARDEN_WALL_MM, "the terrace's outer wall, bordering no roofed zone, is a garden wall");
  assert(boxH("wall:w-top-b") === GARDEN_WALL_MM, "…and so is its bowed one");
  assert(byId("wall:w-top-b")!.parts.length >= 8, `a bowed wall is many chords (got ${byId("wall:w-top-b")!.parts.length})`);
  const kerb = byId("wall:w-bot-b")!;
  assert(boxH("wall:w-bot-b") === KERB_MM && kerb.parts.every((p) => p.shape === "box" && p.d === KERB_THICK_MM), "an edge kind is a kerb, KERB_MM high and KERB_THICK_MM thick");
  assert(kerb.material.colour === ENVELOPE.kerb, "…in the kerb's tone");
  const shared = byId("wall:w-shared")!.parts[0];
  assert(shared.shape === "box" && shared.d === WALL_THICK_MM && near(shared.at.x, 6000) && near(shared.at.y, 2000) && near(shared.w, 4000), "a wall box is centred on its chord, WALL_THICK_MM thick, the chord long");

  // The door: two jambs, a lintel, a frame of two trims, and one leaf standing open INTO the hall.
  const left = byId("wall:w-left")!;
  assert(left.parts.length === 2, `the door splits its wall into two jambs (got ${left.parts.length})`);
  assert(left.parts.every((p) => p.shape === "box" && p.h === 4000 && near(p.w, 1500)), "each jamb is full height and 1500 long (4000 − 1000, split either side of a door 2000 from n4)");
  const lintel = byId("door:door-1");
  assert(!!lintel && lintel.tag.type === "door" && lintel.parts.length === 1, "the door is one lintel body tagged door");
  const l = lintel!.parts[0];
  assert(l.shape === "box" && l.at.z === DOOR_HEIGHT_MM && l.h === 4000 - DOOR_HEIGHT_MM && near(l.w, 1000) && near(l.at.y, 2000) && near(l.at.x, 0), "the lintel spans the opening from DOOR_HEIGHT_MM to the wall top, over the door's middle");
  const wallRot = (l as Extract<Part, { shape: "box" }>).rotDeg!;
  const frame = byId("door-frame:door-1");
  assert(!!frame && frame.tag.type === "door" && frame.tag.id === "door-1" && frame.parts.length === 2, "the door has a frame of two trims, tagged door");
  assert(frame!.parts.every((p) => p.shape === "box" && p.w === FRAME_TRIM_MM && p.d === WALL_THICK_MM + 2 * FRAME_PROUD_MM && p.h === DOOR_HEIGHT_MM && near(p.at.x, 0)), "…each 40 wide, proud of both faces, door height, on the wall's line");
  const trimYs = frame!.parts.map((p) => p.at.y).sort((a, b) => a - b);
  assert(near(trimYs[0], 1500) && near(trimYs[1], 2500), "…one on each jamb of the opening");
  assert(frame!.material.colour === ENVELOPE.doorFrame, "…in the frame's tone");
  const leafBody = byId("door-leaf:door-1");
  assert(!!leafBody && leafBody.tag.type === "door" && leafBody.parts.length === 1 && leafBody.material.colour === ENVELOPE.doorLeaf, "a single door has one leaf, tagged door, in the leaf's tone");
  const leaf = leafBody!.parts[0] as Extract<Part, { shape: "box" }>;
  assert(leaf.shape === "box" && leaf.d === DOOR_LEAF_MM && near(leaf.w, 1000) && leaf.h === DOOR_HEIGHT_MM, "the leaf is DOOR_LEAF_MM thick, the opening wide, the door high");
  assert(((((leaf.rotDeg ?? 0) - wallRot) % 180) + 180) % 180 === 90, "…standing perpendicular to its wall (open at 90°)");
  assert(leaf.at.x > WALL_THICK_MM / 2 && near(leaf.at.x, WALL_THICK_MM / 2 + 500), "…on the INWARD side — into the roofed hall, from the wall's face out");
  assert(Math.abs(leaf.at.y - 2500) < DOOR_LEAF_MM, "…hinged at the jamb nearer node a, its thickness just inside the opening");
  assert(inwardSide({ x: 0, y: 2000 }, { x: 1, y: 0 }, plan.all) === 1 && inwardSide({ x: 0, y: 2000 }, { x: -1, y: 0 }, plan.all) === -1, "the inward side of the hall's left wall is +x whichever way its normal is handed");

  // The gate: a double door in a garden wall swinging OUT — two half leaves, the wall's height.
  const gate = byId("door-leaf:gate-1");
  assert(!!gate && gate.parts.length === 2, "a double door has two leaves");
  assert(gate!.parts.every((p) => p.shape === "box" && near(p.w, 600) && p.h === GARDEN_WALL_MM && p.at.x > 10000), "…each half the opening wide, no taller than the garden wall, standing OUTSIDE the terrace (swingInward false)");
  assert(!byId("door:gate-1") && byId("door-frame:gate-1")!.parts.every((p) => p.shape === "box" && p.h === GARDEN_WALL_MM), "a gate lower than a door has no lintel and a frame the wall's height");

  // The ground: a plane past the plan's bounds, with the pool cut out of it.
  const ground = byId("ground")!;
  const g = ground.parts[0];
  assert(g.shape === "plane" && g.at.z === -1 && near(Math.min(...g.outline.outline.map((p) => p.x)), plan.bounds.minX - GROUND_MARGIN_MM), "the ground is a plane at −1 grown GROUND_MARGIN_MM past the plan's bounds");
  assert(g.shape === "plane" && g.holes?.length === 1, "…with the one well cut out of it");

  const col = byId("feature:col-1")!;
  const colTop = Math.max(...col.parts.map((q) => (q.shape === "extrude" || q.shape === "cylinder" ? q.at.z + q.h : q.at.z)));
  assert(col.instances[0].at.x === 1000 && col.parts.length === 3 && near(colTop, 3000), "a slender pillar is a column: a base, its shaft and a capital, to its height (./structures.ts)");
  const kiosk = byId("feature:kiosk-1")!;
  assert(kiosk.parts[0].shape === "extrude" && kiosk.parts[0].h === 2500 && kiosk.instances[0].at.x === 4000, "any other structure is its footprint extruded to its height, at its place");

  // The pool: a hole in the terrace floor (not the hall's) and in the lawn it lies on, the water
  // plane recessed in its well, a coping round its rim.
  const pool = byId("feature:pool-1")!;
  const water = pool.parts.find((p) => p.shape === "plane" && p.material?.kind === "water");
  assert(!!water && water.at.z === -WATER_DEPTH_MM, "a pool is a water plane recessed WATER_DEPTH_MM");
  assert(pool.parts.some((p) => p.shape === "ribbon") && pool.material.kind === "matte", "…inside a well with matte walls");
  const coping = pool.parts.find((p): p is Extract<Part, { shape: "extrude" }> => p.shape === "extrude" && p.material?.colour === COPING_MATERIAL.colour);
  assert(!!coping && coping.h === COPING_HIGH_MM && coping.at.z === 0 && coping.holes?.length === 1, "…and a coping kerb on the floor round the rim, the rim its hole");
  assert(Math.max(...coping!.outline.outline.map((p) => p.x)) > 800 + COPING_MM - 1, "…COPING_MM wide outside the water");
  const terrace = byId("floor:z-terrace")!.parts[0] as Extract<Part, { shape: "plane" }>;
  assert(terrace.holes?.length === 1, "the terrace floor carries one hole");
  const hole = terrace.holes![0];
  const holePoly = closedPolyline(hole);
  assert(holePoly.length >= 8 && hole.edgeCurves?.length === 4, "…an ellipse: four bowed edges, many points once flattened");
  assert(holePoly.every((p) => Math.abs(p.x - 8000) <= 800 + 1e-6 && Math.abs(p.y - 2200) <= 500 + 1e-6), "…matching the pool's footprint, in room mm");
  assert(holePoly.some((p) => near(p.x, 8800)) && holePoly.some((p) => near(p.y, 2700)), "…reaching the pool's rim both ways");
  const hall = byId("floor:z-hall")!.parts[0] as Extract<Part, { shape: "plane" }>;
  assert(!hall.holes, "the hall's floor, with no well on it, is whole");
  const lawn = byId("feature:lawn-1")!;
  const lawnPlane = lawn.parts[0] as Extract<Part, { shape: "plane" }>;
  assert(lawnPlane.shape === "plane" && lawnPlane.at.z === 1 && lawn.material.texture === "grass", "a surface feature is a plane a hair above the floor in its material");
  assert(lawnPlane.holes?.length === 1, "…with the pool on it cut out");
  const lawnHole = lawnPlane.holes![0].outline;
  const cx = lawnHole.reduce((s, p) => s + p.x, 0) / lawnHole.length;
  const cy = lawnHole.reduce((s, p) => s + p.y, 0) / lawnHole.length;
  assert(near(cx, 0) && near(cy, 200), "…in the lawn's OWN frame (the pool stands 200 below the lawn's middle)");

  // Plants: shared per species and size; the shapes are ./plants.ts's (check:plants).
  const trees = bodies.filter((b) => b.id.startsWith("i:plant:tree:"));
  assert(trees.length === 1 && trees[0].instances.length === 2, "two trees of one size are one shared body with two instances");
  assert(JSON.stringify(trees[0].parts) === JSON.stringify(treeParts(1750, 1750, 4000, PLANT_FILL.tree)), "…built by treeParts");
  assert(trees[0].instances[0].rotationDeg !== trees[0].instances[1].rotationDeg, "…each turned its own way (a round crown turns by its id)");
  const palm = bodies.find((b) => b.id.startsWith("i:plant:palm:"))!;
  assert(!!palm && palm.instances.length === 1 && palm.parts.some((q) => q.shape === "frond"), "the palm is its own shared body, crowned with fronds");
  const hedge = bodies.find((b) => b.id.startsWith("i:plant:hedge:"))!;
  assert(!!hedge && JSON.stringify(hedge.parts) === JSON.stringify(hedgeParts(4000, 800, 1200)) && hedge.instances[0].rotationDeg === 0, "a hedge is hedgeParts, along the plan's turn");

  const bed = bodies.find((b) => b.id.startsWith("i:plant:flowers:"))!;
  assert(!!bed, "the bed is its own shared body");
  const soil = bed.parts.find((p) => p.shape === "extrude");
  assert(!!soil && soil.h === BED_SOIL_MM && soil.material?.texture === "soil", "a bed has a soil slab BED_SOIL_MM high");
  const heads = bed.parts.filter((p): p is Extract<Part, { shape: "sphere" }> => p.shape === "sphere");
  assert(heads.length > 0 && heads.length <= MAX_HEADS, `…and heads, at most MAX_HEADS (got ${heads.length})`);
  assert(heads.every((p) => Math.abs(p.at.x) <= 1500 && Math.abs(p.at.y) <= 600), "…every head inside the bed's outline");
  assert(heads.every((p) => p.at.z >= BED_SOIL_MM && p.at.z <= 400), "…between the soil and the bed's top");
  assert(bed.material.colour === PLANT_FILL.flowers && heads.every((p) => p.material?.colour === PLANT_FILL.flowers || p.material?.colour === tinted(PLANT_FILL.flowers, 0.38)), "…in the bed's own colour and a paler tint of it");
  const bigBed: StructureFeature = { id: "bed-2", kind: "plant", label: "ערוגה", x: 0, y: 0, widthMm: 12000, depthMm: 3000, heightMm: 400, shape: "rect", rotationDeg: 0, plant: "flowers" };
  const big = new SceneCollector();
  plantInstance(bigBed, big);
  const bigHeads = (big.nodes()[0] as Extract<(typeof nodes)[number], { kind: "body" }>).parts.filter((p) => p.shape === "sphere");
  assert(bigHeads.length <= MAX_HEADS && bigHeads.length > 300 && bigHeads.some((p) => p.at.x > 5000) && bigHeads.some((p) => p.at.x < -5000), "a long bed thins its grid to MAX_HEADS and still reaches both ends");

  const shrubbery = new SceneCollector();
  plantInstance({ id: "pot-1", kind: "plant", label: "עציץ", x: 0, y: 0, widthMm: 700, depthMm: 700, heightMm: 900, shape: "circle", rotationDeg: 0, plant: "pot" }, shrubbery);
  plantInstance({ id: "shrub-1", kind: "plant", label: "שיח", x: 0, y: 0, widthMm: 1200, depthMm: 1200, heightMm: 1000, shape: "circle", rotationDeg: 0 }, shrubbery);
  const [potBody, shrubBody] = shrubbery.nodes() as Extract<(typeof nodes)[number], { kind: "body" }>[];
  assert(potBody.id.startsWith("i:plant:pot:") && JSON.stringify(potBody.parts) === JSON.stringify(potParts(350, 350, 900, PLANT_FILL.pot)), "a pot is potParts");
  assert(shrubBody.id.startsWith("i:plant:shrub:") && JSON.stringify(shrubBody.parts) === JSON.stringify(shrubParts(600, 600, 0, 1000, PLANT_FILL.shrub)), "a plant with no species is a shrub");

  // The venue's chairs in rows: twelve chairs, one instanced body, facing the block's +y.
  const seats = bodies.filter((b) => b.tag.type === "chair");
  assert(seats.length === 1 && seats[0].id.startsWith("i:chair:dining:") && seats[0].tag.id === "seats-1", "3 × 4 venue chairs are one instanced body of the default dining chair");
  assert(seats[0].instances.length === 12, `…twelve instances (got ${seats[0].instances.length})`);
  assert(seats[0].instances.every((t) => near(t.rotationDeg, 90)), "…each facing the block's +y (the block is turned 90°, so every chair is)");
  assert(seats[0].instances.every((t) => Math.abs(t.at.x - 4500) <= 1200 && Math.abs(t.at.y - 1200) <= 975), "…standing inside the turned block's box");
  const seatXs = seats[0].instances.map((t) => Math.round(t.at.x));
  assert(new Set(seatXs).size === 3, "…in three rows across the turned block");

  assert(!byId("feature:stage-1"), "a venue stage is left to phase B");

  // On a platform (a 1m built terrace, 8×8m): a pool is a raised basin on its top, a column
  // stands on it to its own height, and a palm beside it — its crown more than half over the
  // terrace, its trunk off it — stands on the ground.
  {
    const terrace: StructureFeature = { id: "terrace", kind: "structure", label: "", x: 0, y: 0, widthMm: 8000, depthMm: 8000, heightMm: 1000, shape: "rect", rotationDeg: 0 };
    const basin: StructureFeature = { id: "basin", kind: "pool", label: "", x: 0, y: -2000, widthMm: 3000, depthMm: 1500, heightMm: 0, shape: "rect", rotationDeg: 0 };
    const column: StructureFeature = { id: "pillar", kind: "column", label: "עמוד", x: 2000, y: 2000, widthMm: 600, depthMm: 600, heightMm: 3000, shape: "rect", rotationDeg: 0, column: { shaftMm: 400, baseMm: 500 } };
    const palm: StructureFeature = { id: "palm-2", kind: "plant", label: "דקל", x: 4300, y: 0, widthMm: 7000, depthMm: 7000, heightMm: 6000, shape: "circle", rotationDeg: 0, plant: "palm" };
    const raised: VenueStructure = { nodes: [], walls: [], entrances: [], features: [terrace, basin, column, palm] };
    const floorOf = elevationOf(emptyDocument(), raised).floorUnder;
    const at = new SceneCollector();
    const rPlan = eventPlan({ venueId: "v", zoneIds: [] }, { structure: raised, zones: [], mmPerUnit: 1, access: "granted" });
    envelopeNodes({ doc: emptyDocument(), plan: rPlan, structure: raised, settings: DEFAULT_SETTINGS, author: true }, at, floorOf);
    const rb = at.nodes().filter((n): n is Extract<typeof n, { kind: "body" }> => n.kind === "body");
    const b = rb.find((n) => n.id === "feature:basin")!;
    assert(!!b && b.instances[0].at.z === 1000, "a pool on a platform stands on its top");
    assert(!b.parts.some((q) => q.shape === "ribbon") && b.parts.some((q) => q.shape === "extrude" && q.h === BASIN_RIM_MM && q.material === BASIN_MATERIAL), "…a raised basin: a stone wall BASIN_RIM_MM high, no sunken well");
    assert(b.parts.some((q) => q.shape === "plane" && q.material?.kind === "water" && q.at.z === BASIN_RIM_MM - BASIN_WATER_MM), "…the water just under the wall's top");
    const g2 = rb.find((n) => n.id === "ground")!.parts[0];
    assert(g2.shape === "plane" && !g2.holes, "…and nothing is cut out of the ground under the platform");
    const c = rb.find((n) => n.id === "feature:pillar")!;
    const cTop = Math.max(...c.parts.map((q) => (q.shape === "extrude" || q.shape === "cylinder" || q.shape === "lathe" ? q.at.z + (q.shape === "lathe" ? Math.max(...q.profile.map((r) => r.z)) : q.h) : q.at.z)));
    assert(!!c && c.instances[0].at.z === 1000 && near(cTop, 3000), `a column stands on the platform, its own height above it (top ${cTop})`);
    assert(c.parts.some((q) => q.shape === "lathe") && c.parts.some((q) => q.shape === "torus"), "…a round shaft over a base ring");
    const palms = rb.find((n) => n.id.startsWith("i:plant:palm:"))!;
    assert(palms.instances[0].at.z === 0, "a palm whose trunk is off the platform stands on the ground, whatever its crown overhangs");
  }

  // A POOL WITH A HEIGHT OF ITS OWN (2026-11-20): its wall stands that high over the ground and
  // nothing is cut out of the ground; a fountain set in it stands on its water; a rimmed one is
  // walled by its rim, raised to the same height.
  {
    const pond: StructureFeature = { id: "pond", kind: "pool", label: "", x: 0, y: 0, widthMm: 4000, depthMm: 2000, heightMm: 600, shape: "rect", rotationDeg: 0 };
    const jet: StructureFeature = { id: "jet", kind: "fountain", label: "", x: 0, y: 0, widthMm: 800, depthMm: 800, heightMm: 1200, shape: "circle", rotationDeg: 0 };
    const build = (features: StructureFeature[]) => {
      const st: VenueStructure = { nodes: [], walls: [], entrances: [], features };
      const col = new SceneCollector();
      envelopeNodes({ doc: emptyDocument(), plan: eventPlan({ venueId: "v", zoneIds: [] }, { structure: st, zones: [], mmPerUnit: 1, access: "granted" }), structure: st, settings: DEFAULT_SETTINGS, author: true }, col);
      return col.nodes();
    };
    const nodes2 = build([pond, jet]);
    const pb = nodes2.find((n) => n.kind === "body" && n.id === "feature:pond") as Extract<(typeof nodes2)[number], { kind: "body" }>;
    assert(!!pb && pb.parts.some((q) => q.shape === "extrude" && q.h === 600 && q.material === BASIN_MATERIAL) && !pb.parts.some((q) => q.shape === "ribbon"), "a pool 60 cm high is a basin whose stone wall stands 60 cm over the ground, not a well");
    assert(pb.parts.some((q) => q.shape === "plane" && q.material?.kind === "water" && q.at.z === 600 - BASIN_WATER_MM), "…its water just under the wall's top");
    const ground = nodes2.find((n) => n.kind === "body" && n.id === "ground") as Extract<(typeof nodes2)[number], { kind: "body" }>;
    assert(!!ground && ground.parts[0].shape === "plane" && !ground.parts[0].holes, "…and the ground under it is whole");
    const fj = nodes2.find((n) => n.kind === "body" && n.id === "feature:jet") as Extract<(typeof nodes2)[number], { kind: "body" }> | undefined;
    const fz = fj ? fj.instances[0].at.z : NaN;
    assert(near(fz, 600 - BASIN_WATER_MM), `a fountain in it stands on its water (z ${fz})`);
    const sunk = build([{ ...pond, heightMm: 0 }]).find((n) => n.kind === "body" && n.id === "feature:pond") as Extract<(typeof nodes2)[number], { kind: "body" }>;
    assert(sunk.parts.some((q) => q.shape === "ribbon"), "a pool of height 0 is still sunk in the floor");
    const rimmed = build([{ ...pond, rim: { widthMm: 300, material: "paving" } }]);
    const rimNode = rimmed.find((n) => n.kind === "body" && n.id === "rim:pond") as Extract<(typeof nodes2)[number], { kind: "body" }>;
    const rimPool = rimmed.find((n) => n.kind === "body" && n.id === "feature:pond") as Extract<(typeof nodes2)[number], { kind: "body" }>;
    assert(!!rimNode && rimNode.parts.every((q) => q.shape === "extrude" && q.h === 600), "a rimmed raised pool's rim is its wall, 60 cm high");
    assert(!rimPool.parts.some((q) => q.material === BASIN_MATERIAL), "…with no stone wall beside it");
  }

  // TYPED WALL HEIGHTS (Wall.heightMm, spec 2026-11-07 §2): a typed height wins over the room —
  // lower than the hall's 4 m ceiling, the wall stops under the roof, which does not move; on an
  // edge, a fence of that height in the wall's tone; a wall nobody typed reads exactly as before.
  {
    let typed = setWallHeight(structure, "w-top-a", 1200);
    typed = setWallHeight(typed, "w-bot-b", 2000); // the terrace's kerb, made a 2 m fence
    typed = setWallHeight(typed, "w-left", 1800); // the hall's door wall, lower than the 2.1 m door
    typed = setWallHeight(typed, "w-bot-a", 1500); // the window wall, under the window's 2.1 m head
    const tPlan = eventPlan({ venueId: "v", zoneIds: ["z-hall"] }, {
      structure: typed,
      zones: [zone("z-hall", "אולם", "hall", { x: 3000, y: 2000 }, 4000), zone("z-terrace", "מרפסת", "open", { x: 8000, y: 2000 }, 0)],
      mmPerUnit: 1,
      access: "granted",
    });
    const t = new SceneCollector();
    const tRoof = envelopeNodes({ doc: emptyDocument(), plan: tPlan, structure: typed, settings: DEFAULT_SETTINGS, author: true }, t).roofedMm;
    const tb = t.nodes().filter((n): n is Extract<typeof n, { kind: "body" }> => n.kind === "body");
    const tById = (id: string) => tb.find((b) => b.id === id);
    const heights = (id: string) => [...new Set(tById(id)!.parts.map((p) => (p.shape === "box" ? p.h : NaN)))];
    assert(heights("wall:w-top-a").join() === "1200", `a wall typed 1.2 m stands 1.2 m inside a 4 m hall (got ${heights("wall:w-top-a").join()})`);
    const tCeil = tb.find((b) => b.id === "ceiling:z-hall")!.parts[0];
    assert(tRoof === 4000 && tCeil.shape === "plane" && tCeil.at.z === 4000, "…and the hall's roof stays at 4 m over it");
    assert(heights("wall:w-shared").join() === "4000", "a wall nobody typed is derived exactly as before");
    const fence = tById("wall:w-bot-b")!;
    assert(heights("wall:w-bot-b").join() === "2000" && fence.parts.every((p) => p.shape === "box" && p.d === FENCE_THICK_MM), "an edge typed 2 m is a 2 m fence, half a wall thick — no kerb");
    assert(fence.material.colour === ENVELOPE.wall, "…in the wall's tone, not the kerb's");
    assert(!tById("door:door-1"), "a door in a wall lower than the door has no lintel: the opening is cut to the wall's top");
    assert(heights("wall:w-left").join() === "1800" && tById("door-frame:door-1")!.parts.every((p) => p.shape === "box" && p.h === 1800), "…the jambs and the frame stop at the wall's 1.8 m");
    assert(tById("door-leaf:door-1")!.parts.every((p) => p.shape === "box" && p.h === 1800), "…and so does the leaf");
    const tPane = tById("window:win-1")!.parts[0];
    assert(tPane.shape === "box" && tPane.at.z === 900 && tPane.h === 600 && !tById("door:win-1"), "a window's head is held under its wall's typed 1.5 m: glass from 900 to 1500, nothing over it");
  }

  // A POOL'S RIM (StructureFeature.rim, lib/venues/rim.ts, spec 2026-11-07 §9): the floor is cut to
  // the WATER (the rim is floor), the water is the inner outline, the band a slab in its material,
  // flush over the ground or raised, and no coping kerb outside it. A surface's edging the same.
  {
    const withRims: VenueStructure = {
      ...structure,
      features: structure.features.map((f) =>
        f.id === "pool-1" ? { ...f, rim: { widthMm: 200, material: "tile" as const } } : f.id === "lawn-1" ? { ...f, rim: { widthMm: 200, material: "paving" as const, raisedMm: 100 } } : f,
      ),
    };
    const rPlan = eventPlan({ venueId: "v", zoneIds: ["z-hall"] }, {
      structure: withRims,
      zones: [zone("z-hall", "אולם", "hall", { x: 3000, y: 2000 }, 4000), zone("z-terrace", "מרפסת", "open", { x: 8000, y: 2000 }, 0)],
      mmPerUnit: 1,
      access: "granted",
    });
    const r = new SceneCollector();
    envelopeNodes({ doc: emptyDocument(), plan: rPlan, structure: withRims, settings: DEFAULT_SETTINGS, author: true }, r);
    const rb = r.nodes().filter((n): n is Extract<typeof n, { kind: "body" }> => n.kind === "body");
    const rById = (id: string) => rb.find((b) => b.id === id);
    const spanOf = (o: BuiltOutline) => {
      const poly = closedPolyline(o);
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    const floorHole = (rById("floor:z-terrace")!.parts[0] as Extract<Part, { shape: "plane" }>).holes?.[0];
    assert(!!floorHole && near(spanOf(floorHole).w, 1200, 1) && near(spanOf(floorHole).h, 600, 1), "the floor is cut to the WATER: a 1.6 × 1.0 pool with a 20 cm rim leaves a 1.2 × 0.6 hole");
    const rPool = rById("feature:pool-1")!;
    const rWater = rPool.parts.find((p): p is Extract<Part, { shape: "plane" }> => p.shape === "plane" && p.material?.kind === "water")!;
    assert(!!rWater && near(spanOf(rWater.outline).w, 1200, 1) && near(spanOf(rWater.outline).h, 600, 1), "…the water is the inner outline");
    assert(!rPool.parts.some((p) => p.material?.colour === COPING_MATERIAL.colour), "…and no coping kerb stands outside a rimmed pool");
    const band = rById("rim:pool-1")!;
    const bandPart = band?.parts[0];
    assert(!!band && band.parts.length === 1 && bandPart.shape === "plane" && bandPart.holes?.length === 1 && near(spanOf(bandPart.outline).w, 1600, 1), "the rim is a band over the pool's whole outline, the water cut out of it");
    assert(bandPart.shape === "plane" && bandPart.at.z === 3 && band.material.texture === "tile", "…flush: a plane over every ground plane (one surface on the plan → z 3), in its own material");
    const kerb = rById("rim:lawn-1")!;
    const kerbPart = kerb?.parts[0];
    assert(!!kerb && kerbPart.shape === "extrude" && kerbPart.h === 100 && kerbPart.holes?.length === 1 && kerb.material.texture === "paving", "a lawn's raised edging is a 10 cm slab in its material, the lawn inside it");
    const lawnIn = rById("feature:lawn-1")!.parts[0] as Extract<Part, { shape: "plane" }>;
    assert(near(spanOf(lawnIn.outline).w, 1600, 1) && near(spanOf(lawnIn.outline).h, 1600, 1), "…the grass laid inside the edging, 1.6 m of a 2 m lawn");
    // All rim: a band as deep as the pool leaves no water, cuts nothing, and is one solid slab.
    const allRim: VenueStructure = { ...structure, features: structure.features.map((f) => (f.id === "pool-1" ? { ...f, rim: { widthMm: 900, material: "paving" as const } } : f)) };
    const a = new SceneCollector();
    envelopeNodes({ doc: emptyDocument(), plan: eventPlan({ venueId: "v", zoneIds: ["z-hall"] }, { structure: allRim, zones: [zone("z-hall", "אולם", "hall", { x: 3000, y: 2000 }, 4000), zone("z-terrace", "מרפסת", "open", { x: 8000, y: 2000 }, 0)], mmPerUnit: 1, access: "granted" }), structure: allRim, settings: DEFAULT_SETTINGS, author: true }, a);
    const ab = a.nodes().filter((n): n is Extract<typeof n, { kind: "body" }> => n.kind === "body");
    assert(!ab.some((b) => b.id === "feature:pool-1") && !(ab.find((b) => b.id === "floor:z-terrace")!.parts[0] as Extract<Part, { shape: "plane" }>).holes, "a rim deeper than the pool leaves no water and no hole in the floor");
    const solid = ab.find((b) => b.id === "rim:pool-1")!.parts[0];
    assert(solid.shape === "plane" && !solid.holes, "…the band is the whole outline");
  }

  // A PERGOLA (lib/venues/pergola.ts): the catalog's own body (./floor-kinds.ts pergolaBody), turned
  // with the feature, its four posts up from the floor under it to the beams, its slats ending at
  // its height, a lattice on its closed side — and on a raised floor it stands on that floor.
  {
    const perg: StructureFeature = { id: "perg-1", kind: "pergola", label: "פרגולה", x: 8000, y: 2000, widthMm: 3000, depthMm: 2000, heightMm: 2600, shape: "rect", rotationDeg: 30, pergola: { postMm: 150, roof: "slats", closedSides: [1] } };
    const withPergola: VenueStructure = { ...structure, features: [...structure.features, perg] };
    const built = (floorOf?: FloorOf) => {
      const c = new SceneCollector();
      envelopeNodes({ doc: emptyDocument(), plan, structure: withPergola, settings: DEFAULT_SETTINGS, author: true }, c, floorOf);
      return c.nodes().find((n): n is Extract<typeof n, { kind: "body" }> => n.kind === "body" && n.id === "feature:perg-1");
    };
    const pb = built();
    const tops = (pb?.parts ?? []).map((p) => (p.shape === "box" ? p.at.z + p.h : p.shape === "extrude" ? p.at.z + p.h : p.at.z));
    assert(!!pb && pb.parts.filter((p) => p.shape === "box" && p.w === 150 && p.d === 150).length === 4, "a venue pergola stands on its four posts");
    assert(near(Math.max(...tops), 2600) && pb!.instances[0].at.z === 0 && near(pb!.instances[0].rotationDeg, 30), "…its top at its height, on the floor, turned with it");
    assert(pb!.parts.filter((p) => p.shape === "box" && p.w === 30).length > 10, "…its closed side a lattice of battens");
    const raised = built((_, id) => (id === "feature:perg-1" ? 600 : 0));
    assert(!!raised && raised.instances[0].at.z === 600, "…and built on a 60 cm terrace it stands on the terrace");
  }

  const total = out.stats();
  console.log(`scene envelope ok: ${total.bodies} bodies, ${total.instances} instances; roofed ${roofedMm}`);
}
