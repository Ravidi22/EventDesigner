// The client meeting, as data (F-1.1–F-1.9).
//
// Which stages a meeting has — and in what order — is the designer's call, not ours: the flow is
// configured in Settings → מצב פגישה and stored per studio (lib/meeting/storage.ts). So nothing may
// assume a fixed length or a fixed index. /meeting renders whatever the saved flow lists, and an
// event's `step` is an index into THAT list, clamped on read.
//
// MEETING-MODE RULE: no prices, costs or internal data on any stage except the closing quote.

/** What the dashboard calls an event parked on a stage. Fewer values than there are stages — the
 *  two drawing passes are both "בעיצוב" to anyone reading a status chip. */
export type StepStatus = "details" | "gallery" | "design";

export type MeetingStepId = "details" | "hall" | "gallery" | "design" | "quote";

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
    id: "quote",
    label: "הצעת מחיר",
    hint: "סגירת הפגישה. השלב היחיד שבו מוצגים מחירים ללקוח.",
    status: "design",
  },
];

export const STEP_BY_ID: Record<MeetingStepId, MeetingStep> = Object.fromEntries(
  MEETING_STEPS.map((s) => [s.id, s]),
) as Record<MeetingStepId, MeetingStep>;

/** The flow a studio gets before it configures anything. */
export const DEFAULT_FLOW: MeetingStepId[] = ["details", "hall", "gallery", "design", "quote"];

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

/** Turning a stage back on puts it back where the default flow has it, relative to the stages that
 *  are already on — appending it after the quote would be technically fine and practically wrong. */
export function toggleStep(flow: readonly MeetingStepId[], id: MeetingStepId): MeetingStepId[] {
  if (STEP_BY_ID[id].required) return [...flow];
  if (flow.includes(id)) return flow.filter((s) => s !== id);
  const rank = (s: MeetingStepId) => DEFAULT_FLOW.indexOf(s);
  const at = flow.findIndex((s) => rank(s) > rank(id));
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
