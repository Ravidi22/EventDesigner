// npm run check:meeting — the self-check of ./steps.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { DEFAULT_FLOW, normalizeFlow, resumeIndex, toggleStep } from "./steps";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const flow = DEFAULT_FLOW; // details, start, hall, gallery, design, quote
assert(resumeIndex(flow, 3, null) === 3, "no ?stage: the furthest reached");
assert(resumeIndex(flow, 3, "hall") === 2, "?stage wins when it was reached");
assert(resumeIndex(flow, 3, "gallery") === 3, "?stage at the furthest");
assert(resumeIndex(flow, 1, "quote") === 1, "a stage not reached yet is not opened");
assert(resumeIndex(flow, 3, "nonsense") === 3, "an unknown id falls back");
assert(resumeIndex(["details", "design"], 4, "gallery") === 1, "a stage the flow dropped falls back, clamped");
assert(resumeIndex(flow, -2, "hall") === 0, "a negative step clamps to the first stage");
// סקיצת פתיחה: right after the details, in the default flow and wherever it is turned back on.
assert(flow[1] === "start", "the sketch pick follows the details");
assert(toggleStep(["details", "hall", "quote"], "start").join(",") === "details,start,hall,quote", "turned on, it lands right after the details");
// The optional 3D stage: off by default, and turned on it lands between the design and the quote.
assert(!flow.includes("scene"), "the 3D stage is not in the default flow");
const withScene = toggleStep(flow, "scene");
assert(withScene.join(",") === "details,start,hall,gallery,design,scene,quote", `turned on, it sits after the design (${withScene.join(",")})`);
assert(toggleStep(["details", "quote"], "scene").join(",") === "details,scene,quote", "…and before the quote in a short flow");
assert(toggleStep(withScene, "scene").join(",") === flow.join(","), "turned off, the flow is as it was");
assert(normalizeFlow(["details", "scene", "quote"]).join(",") === "details,scene,quote", "a saved flow holding it survives normalisation");
assert(resumeIndex(withScene, 6, "scene") === 5, "a meeting reopens on it by ?stage=scene");
assert(toggleStep(flow, "gallery").join(",") === "details,start,hall,design,quote" && toggleStep(["details", "start", "hall", "design", "quote"], "gallery").join(",") === flow.join(","), "the other stages still go back where they were");
console.log("meeting steps: ok");
