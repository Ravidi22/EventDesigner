// A hand-made Scene for mounting the viewer before the builder lands — and the tab's stand-in when
// a document is empty: a 10×8 m paved floor on a lawn, one wall with a pleated curtain, a round
// table in a cloth with eight chairs, an arrangement in a vase, a candle. Every part shape and the
// instanced path are exercised once. No builder, no document, no catalog — plain Scene data.
import { type MaterialRef, type Scene, type SceneNode, body, emitter, transform, vec3 } from "@/lib/scene/types";

const ROOM_W = 10000;
const ROOM_D = 8000;
const TABLE_R = 900;
const TABLE_H = 750;
const CHAIRS = 8;
const CHAIR_RING = TABLE_R + 330;

const rect = (w: number, d: number) => ({
  outline: [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ],
});

const paving: MaterialRef = { colour: "#d9d3c7", kind: "matte", texture: "paving" };
const grass: MaterialRef = { colour: "#72a552", kind: "matte", texture: "grass" };
const wall: MaterialRef = { colour: "#efece6", kind: "matte" };
const ceiling: MaterialRef = { colour: "#f7f5f1", kind: "matte" };
const curtain: MaterialRef = { colour: "#cfc4e6", kind: "fabric" };
const wood: MaterialRef = { colour: "#b98a5e", kind: "matte", texture: "wood" };
const cloth: MaterialRef = { colour: "#f3eee4", kind: "fabric" };
const chair: MaterialRef = { colour: "#c9a27a", kind: "matte" };
const glass: MaterialRef = { colour: "#e8f0f5", kind: "glass", opacity: 0.35 };
const petals: MaterialRef = { colour: "#d98aa6", kind: "matte" };
const leaves: MaterialRef = { colour: "#5f8f4e", kind: "foliage" };
const wax: MaterialRef = { colour: "#f6f1e3", kind: "matte" };
const brass: MaterialRef = { colour: "#b8923f", kind: "metal" };

export function previewScene(): Scene {
  const nodes: SceneNode[] = [];
  const at = (x: number, y: number, deg = 0, mirrored = false) => transform(vec3(x, y, 0), deg, mirrored);

  nodes.push(body("ground", { type: "ground" }, grass, [{ shape: "plane", outline: rect(ROOM_W + 40000, ROOM_D + 40000), at: vec3(0, 0, -20) }], [at(0, 0)]));
  nodes.push(body("floor", { type: "floor" }, paving, [{ shape: "plane", outline: rect(ROOM_W, ROOM_D), at: vec3(0, 0, 0) }], [at(0, 0)]));
  nodes.push(body("ceiling", { type: "ceiling" }, ceiling, [{ shape: "plane", outline: rect(ROOM_W, ROOM_D), at: vec3(0, 0, 3000), side: "down" }], [at(0, 0)], { castShadow: false }));
  nodes.push(body("wall-n", { type: "wall" }, wall, [{ shape: "box", w: ROOM_W, d: 200, h: 3000, at: vec3(0, -ROOM_D / 2, 0) }], [at(0, 0)]));
  nodes.push(
    body(
      "curtain",
      { type: "item", label: "וילון" },
      curtain,
      [
        {
          shape: "ribbon",
          path: [
            { x: -3000, y: -ROOM_D / 2 + 180 },
            { x: 3000, y: -ROOM_D / 2 + 180 },
          ],
          h: 2960,
          at: vec3(0, 0, 0),
          pleatMm: 150,
          amplitudeMm: 40,
        },
      ],
      [at(0, 0)],
      { castShadow: false },
    ),
  );

  nodes.push(
    body(
      "table",
      { type: "table", label: "שולחן עגול 180" },
      wood,
      [
        { shape: "cylinder", rTop: TABLE_R, rBottom: TABLE_R, h: 30, at: vec3(0, 0, TABLE_H - 30) },
        { shape: "cylinder", rTop: 60, rBottom: 60, h: TABLE_H - 30, at: vec3(0, 0, 40), material: brass },
        { shape: "cylinder", rTop: 200, rBottom: 360, h: 40, at: vec3(0, 0, 0), material: brass },
      ],
      [at(0, 0)],
    ),
  );
  nodes.push(
    body(
      "cloth",
      { type: "cloth" },
      cloth,
      [
        {
          shape: "lathe",
          profile: [
            { r: TABLE_R + 150, z: 0 },
            { r: TABLE_R + 130, z: 250 },
            { r: TABLE_R + 95, z: TABLE_H - 10 },
            { r: TABLE_R + 90, z: TABLE_H + 8 },
            { r: TABLE_R + 40, z: TABLE_H + 10 },
            { r: 0, z: TABLE_H + 10 },
          ],
          at: vec3(0, 0, 0),
          segments: 48,
        },
      ],
      [at(0, 0)],
    ),
  );

  // A chair's front is +y; at angle a round the table it turns a + 90° to face the centre
  // (lib/scene/frame.ts seatTransform: facing − 90, where the facing is a + 180). The fifth is
  // mirrored, to exercise the negative-scale path — a symmetric chair looks the same.
  const ring = Array.from({ length: CHAIRS }, (_, i) => {
    const a = (360 / CHAIRS) * i;
    const r = (a * Math.PI) / 180;
    return at(Math.cos(r) * CHAIR_RING, Math.sin(r) * CHAIR_RING, a + 90, i === 4);
  });
  nodes.push(
    body(
      "chairs",
      { type: "chair", label: "כיסא" },
      chair,
      [
        { shape: "box", w: 440, d: 440, h: 40, at: vec3(0, 0, 420) },
        { shape: "box", w: 440, d: 36, h: 460, at: vec3(0, -202, 440) },
        { shape: "box", w: 30, d: 30, h: 420, at: vec3(-195, -195, 0) },
        { shape: "box", w: 30, d: 30, h: 420, at: vec3(195, -195, 0) },
        { shape: "box", w: 30, d: 30, h: 420, at: vec3(-195, 195, 0) },
        { shape: "box", w: 30, d: 30, h: 420, at: vec3(195, 195, 0) },
      ],
      ring,
      { castShadow: false },
    ),
  );

  nodes.push(
    body(
      "vase",
      { type: "item", label: "אגרטל" },
      glass,
      [
        {
          shape: "lathe",
          profile: [
            { r: 55, z: 0 },
            { r: 95, z: 110 },
            { r: 60, z: 240 },
            { r: 75, z: 300 },
          ],
          at: vec3(0, 0, TABLE_H + 10),
          segments: 32,
        },
      ],
      [at(0, 0)],
      { castShadow: false },
    ),
  );
  const heads = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2;
    const d = i === 0 ? 0 : 110;
    return transform(vec3(Math.cos(a) * d, Math.sin(a) * d, TABLE_H + 10 + 300 + (i === 0 ? 120 : 70)), 0);
  });
  nodes.push(body("heads", { type: "flowers" }, petals, [{ shape: "sphere", r: 48, at: vec3(0, 0, 0), segments: 12 }], heads, { castShadow: false }));
  nodes.push(
    body(
      "leaves",
      { type: "flowers" },
      leaves,
      [{ shape: "plane", outline: { outline: [{ x: 0, y: -25 }, { x: 150, y: -60 }, { x: 230, y: 0 }, { x: 150, y: 60 }, { x: 0, y: 25 }] }, at: vec3(0, 0, 0), side: "both" }],
      Array.from({ length: 6 }, (_, i) => transform(vec3(0, 0, TABLE_H + 10 + 300 + 20), i * 60)),
      { castShadow: false },
    ),
  );

  nodes.push(
    body(
      "candle",
      { type: "item", label: "נר" },
      wax,
      [
        { shape: "cylinder", rTop: 40, rBottom: 40, h: 8, at: vec3(0, 0, 0), material: brass },
        { shape: "cylinder", rTop: 22, rBottom: 22, h: 240, at: vec3(0, 0, 8) },
      ],
      [transform(vec3(420, 0, TABLE_H + 10), 0)],
      { castShadow: false },
    ),
  );
  nodes.push(emitter("candle-flame", vec3(420, 0, TABLE_H + 10 + 262), 45, "#f2b544", 0.4));

  const bodies = nodes.filter((n): n is Extract<SceneNode, { kind: "body" }> => n.kind === "body");
  return {
    nodes,
    bounds: { minX: -ROOM_W / 2, minY: -ROOM_D / 2, maxX: ROOM_W / 2, maxY: ROOM_D / 2, widthMm: ROOM_W, heightMm: ROOM_D },
    roofedMm: 3000,
    stats: {
      bodies: bodies.length,
      instances: bodies.reduce((n, b) => n + b.instances.length, 0),
      emitters: nodes.filter((n) => n.kind === "emitter").length,
    },
  };
}
