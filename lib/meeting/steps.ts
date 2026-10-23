// The client meeting, as data (F-1.1–F-1.9).
//
// Which stages a meeting has — and in what order — is the designer's call, not ours: the flow is
// configured in Settings → מצב פגישה and stored per studio (lib/meeting/storage.ts). So nothing may
// assume a fixed length or a fixed index. /meeting renders whatever the saved flow lists, and an
// event's `step` is an index into THAT list, clamped on read.
//
// MEETING-MODE RULE: no prices, costs or internal data on any stage except the closing quote.
import { isMain } from "../self-check";

/** What the dashboard calls an event parked on a stage. Fewer values than there are stages — the
 *  two drawing passes are both "בעיצוב" to anyone reading a status chip. */
export type StepStatus = "details" | "gallery" | "design";

export type MeetingStepId = "details" | "hall" | "gallery" | "design" | "scene" | "quote";

export interface MeetingStep {
  id: MeetingStepId;
  /** The stepper chip, and the "next stage" promise in the footer. */
  label: string;
  /** One line, for the settings list: what happens here, in the designer's words. */
  hint: string;
  status: StepStatus;
  /** Always on, always first: every later stage reads the event this one creates. */
  required?: boolean;
}

export const MEETING_STEPS: MeetingStep[] = [
  {
    id: "details",
    label: "פרטי האירוע",
    hint: "לקוח, איש קשר, תאריך, מתחם ואזורים. הכותרת של כל השאר — ולכן תמיד ראשון.",
    status: "details",
    required: true,
  },
  {
    id: "hall",
    label: "סקיצת אולם",
    hint: "שולחנות, כסאות ובמות על תוכנית המתחם — הפריסה הפיזית, לפני העיצוב.",
    status: "design",
  },
  {
    id: "gallery",
    label: "גלריה",
    hint: "מעבר על התצוגות עם הלקוח; מה שסומן ♥ נאסף לתיק האירוע ומחכה בראש מסילת הקטלוג.",
    status: "gallery",
  },
  {
    id: "design",
    label: "סקיצה עיצובית",
    hint: "עיצוב השולחן, התקרה והחופה — מעל הפריסה שנקבעה בסקיצת האולם.",
    status: "design",
  },
  {
    id: "scene",
    label: "תלת-ממד",
    hint: "הלקוח רואה את האולם מבפנים — נקודות המבט והסיור המודרך שהוכנו מראש. לא חלק מהפגישה עד שמפעילים אותו.",
    status: "design",
  },
  {
    id: "quote",
    label: "הצעת מחיר",
    hint: "סגירת הפגישה — הצעת המחיר, ולצידה מפת ההצבה ורשימת הציוד. השלב היחיד שבו מוצגים מחירים ללקוח.",
    status: "design",
  },
];

export const STEP_BY_ID: Record<MeetingStepId, MeetingStep> = Object.fromEntries(
  MEETING_STEPS.map((s) => [s.id, s]),
) as Record<MeetingStepId, MeetingStep>;

/** The flow a studio gets before it configures anything. The 3D stage (`scene`) is NOT in it: a
 *  studio turns it on in settings (spec 2026-10-23-3d-scene-design.md DECIDE 10), so a studio that
 *  never asked for it never meets an extra stage. */
export const DEFAULT_FLOW: MeetingStepId[] = ["details", "hall", "gallery", "design", "quote"];

/** Where a stage sits among all of them — MEETING_STEPS' order, which is where a stage turned on
 *  lands and how the settings list sorts. Not DEFAULT_FLOW's: a stage left out of the default flow
 *  would rank −1 there, ahead of `details`. */
export const stepRank = (id: MeetingStepId): number => MEETING_STEPS.findIndex((s) => s.id === id);

const REQUIRED_STEPS: MeetingStepId[] = MEETING_STEPS.filter((s) => s.required).map((s) => s.id);

/** Whatever came out of storage — or out of an older version of this app — made safe to render:
 *  known ids only, no duplicates, required stages present, `details` first. */
export function normalizeFlow(ids: readonly unknown[]): MeetingStepId[] {
  const known = ids.filter((id): id is MeetingStepId => typeof id === "string" && id in STEP_BY_ID);
  const unique = [...new Set(known)];
  const missing = REQUIRED_STEPS.filter((id) => !unique.includes(id));
  const all = [...missing, ...unique];
  return ["details", ...all.filter((id) => id !== "details")];
}

/** The stage an event's furthest-reached index lands on, clamped: a flow the designer shortened
 *  after the event was opened must not read past its end. */
export function stepAt(flow: readonly MeetingStepId[], index: number): MeetingStep {
  const safe = Math.min(Math.max(index, 0), flow.length - 1);
  return STEP_BY_ID[flow[safe]] ?? STEP_BY_ID.details;
}

/** Where a meeting opens: the stage named in the URL (?stage=<id>) when the flow has it and the
 *  event has already reached it, else the furthest stage reached — clamped, like stepAt. The URL
 *  carries the stage the designer was ON, so a reload or a remount puts them back there rather than
 *  on the furthest one; a stage past the furthest is not reachable from the stepper either. */
export function resumeIndex(flow: readonly MeetingStepId[], furthest: number, stage: string | null): number {
  const reached = Math.min(Math.max(furthest, 0), flow.length - 1);
  const at = stage ? flow.indexOf(stage as MeetingStepId) : -1;
  return at >= 0 && at <= reached ? at : reached;
}

/** Turning a stage back on puts it back where the default flow has it, relative to the stages that
 *  are already on — appending it after the quote would be technically fine and practically wrong. */
export function toggleStep(flow: readonly MeetingStepId[], id: MeetingStepId): MeetingStepId[] {
  if (STEP_BY_ID[id].required) return [...flow];
  if (flow.includes(id)) return flow.filter((s) => s !== id);
  const at = flow.findIndex((s) => stepRank(s) > stepRank(id));
  return at === -1 ? [...flow, id] : [...flow.slice(0, at), id, ...flow.slice(at)];
}

/** delta -1 = earlier in the meeting, +1 = later. Index 0 is `details`' seat: it never moves, and
 *  nothing moves in front of it. */
export function moveStep(flow: readonly MeetingStepId[], id: MeetingStepId, delta: -1 | 1): MeetingStepId[] {
  const from = flow.indexOf(id);
  const to = from + delta;
  if (from < 1 || to < 1 || to >= flow.length) return [...flow];
  const next = [...flow];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const flow = DEFAULT_FLOW; // details, hall, gallery, design, quote
  assert(resumeIndex(flow, 3, null) === 3, "no ?stage: the furthest reached");
  assert(resumeIndex(flow, 3, "hall") === 1, "?stage wins when it was reached");
  assert(resumeIndex(flow, 3, "design") === 3, "?stage at the furthest");
  assert(resumeIndex(flow, 1, "quote") === 1, "a stage not reached yet is not opened");
  assert(resumeIndex(flow, 3, "nonsense") === 3, "an unknown id falls back");
  assert(resumeIndex(["details", "design"], 4, "gallery") === 1, "a stage the flow dropped falls back, clamped");
  assert(resumeIndex(flow, -2, "hall") === 0, "a negative step clamps to the first stage");
  // The optional 3D stage: off by default, and turned on it lands between the design and the quote.
  assert(!flow.includes("scene"), "the 3D stage is not in the default flow");
  const withScene = toggleStep(flow, "scene");
  assert(withScene.join(",") === "details,hall,gallery,design,scene,quote", `turned on, it sits after the design (${withScene.join(",")})`);
  assert(toggleStep(["details", "quote"], "scene").join(",") === "details,scene,quote", "…and before the quote in a short flow");
  assert(toggleStep(withScene, "scene").join(",") === flow.join(","), "turned off, the flow is as it was");
  assert(normalizeFlow(["details", "scene", "quote"]).join(",") === "details,scene,quote", "a saved flow holding it survives normalisation");
  assert(resumeIndex(withScene, 5, "scene") === 4, "a meeting reopens on it by ?stage=scene");
  assert(toggleStep(flow, "gallery").join(",") === "details,hall,design,quote" && toggleStep(["details", "hall", "design", "quote"], "gallery").join(",") === flow.join(","), "the other stages still go back where they were");
  console.log("meeting steps: ok");
}
