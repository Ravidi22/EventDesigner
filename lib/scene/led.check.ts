// npm run check:scene-led — the self-check of ./led.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { BEZEL_MM, ledStripBody, SCREEN_FRAME, screenBody, STRIP_FLOOR_MM, STRIP_H_MM, STRIP_UNDER_TOP_MM, stripBaseMm } from "./led";

// ponytail: self-check. Run: npm run check:scene-led
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const strip = ledStripBody([{ x: 0, y: 0 }, { x: 4000, y: 0 }], 600, "#ff8800");
const rib = strip.parts[0];
assert(strip.parts.length === 1 && rib.shape === "ribbon" && rib.h === STRIP_H_MM && rib.at.z === 600, "a strip is one thin ribbon at its height");
assert(strip.material.kind === "glow" && strip.material.colour === "#ff8800", "…glowing in its colour");
assert(strip.emitters.length === 0, "…and no emitter: it never asks the viewer for a light");
assert(ledStripBody([{ x: 0, y: 0 }], 0, "#fff").parts.length === 0, "a strip of one point is nothing");
assert(stripBaseMm(0, false) === STRIP_FLOOR_MM && stripBaseMm(1200, false) === 1200, "at the floor line it stands just clear; typed, where typed");
assert(stripBaseMm(400, true) === 400 - STRIP_H_MM - STRIP_UNDER_TOP_MM && stripBaseMm(10, true) === 0, "along a 40 cm deck it runs just under the deck's top");
const screen = screenBody({ widthMm: 4000, depthMm: 100, heightMm: 2500, tone: "" });
const [box, face] = screen.parts;
assert(box.shape === "box" && box.w === 4000 && box.h === 2500 && screen.material.colour === SCREEN_FRAME && screen.material.kind === "matte", "a screen is its dark box, its full size");
assert(face.shape === "box" && face.material?.kind === "glow" && face.at.y > 50 && face.at.z === BEZEL_MM && face.h === 2500 - 2 * BEZEL_MM, "…its face proud of the FRONT (+y), inset by the bezel, glowing");
assert(screen.emitters.length === 0, "…and no emitter either");
console.log("scene led ok");
