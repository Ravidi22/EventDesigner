"use server";
// The studio's own settings row: the letterhead, the VAT rate, and the shape of its client meeting.
//
// ONE ROW, ONE OWNER. studio_settings is keyed by organization id — a studio has one letterhead and
// one meeting shape, and a table that could hold two invites the question of which is live. The
// meeting flow is a column on it, so this module owns that too rather than letting lib/meeting write
// the same row from a second place. That is why the flow functions live here and not next to
// lib/meeting/steps.ts: the flow is a studio SETTING, configured on the settings screen, and the
// alternative was two modules upserting one row and having to agree forever about which columns
// each may touch.
//
// Same rules as every other action module: every export starts with currentOrg(), which throws for
// a client account, and nothing trusts what it was handed.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { revalidateProduction, revalidateSettings, revalidateShell } from "@/lib/db/revalidate";
import { studioSettings } from "@/lib/db/schema";
import { ownedFileUrl, removeReplacedFile } from "@/lib/files/owned";
import { DEFAULT_FLOW, normalizeFlow, type MeetingStepId } from "@/lib/meeting/steps";
import {
  DEFAULT_OFFSETS,
  normalizeOffsets,
  type CheckpointOffsets,
} from "@/lib/production/runway";
import { DEFAULT_SETTINGS, type BusinessSettings } from "./types";
import type { Point, StageTemplate, TableDesign } from "@/lib/design-document/types";

/** Postgres `numeric` arrives as a string — arbitrary precision, so the driver will not silently
 *  narrow it. A VAT rate is a small decimal well inside what a double holds exactly. */
const toRate = (v: string | null): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : DEFAULT_SETTINGS.vatRate;
};

function clean(value: unknown, max = 200): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export async function fetchSettings(): Promise<BusinessSettings> {
  const organizationId = await currentOrg();
  const [row] = await db()
    .select()
    .from(studioSettings)
    .where(eq(studioSettings.organizationId, organizationId))
    .limit(1);

  // Sign-up writes this row, so its absence means an organisation created some other way (the seed,
  // a migration). Defaults rather than an error: a studio with no settings yet is a studio that has
  // not filled them in.
  if (!row) return DEFAULT_SETTINGS;

  return {
    businessName: row.businessName,
    ownerName: row.ownerName,
    phone: row.phone,
    address: row.address,
    businessNumber: row.businessNumber,
    email: row.email,
    logoUrl: row.logoUrl ?? undefined,
    vatRate: toRate(row.vatRate),
    currency: row.currency,
    quoteValidityDays: row.quoteValidityDays,
    quoteTerms: row.quoteTerms,
  };
}

/**
 * Write the settings.
 *
 * ⚠ Callers must debounce. The settings form autosaves on every keystroke — against localStorage
 * that was free, against a database it is one request per character typed into "שם העסק".
 */
export async function saveSettings(input: BusinessSettings): Promise<BusinessSettings> {
  if (!input || typeof input !== "object") throw new Error("settings must be an object");
  const organizationId = await currentOrg();

  // A percentage, stored as a fraction. Clamped rather than rejected: the field is a number input
  // and 0 is a legitimate answer (a business not registered for VAT), while a rate above 1 is
  // someone who typed 18 where 0.18 was meant and should not be able to multiply every quote by 18.
  const rate = Number(input.vatRate);
  const vatRate = Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : DEFAULT_SETTINGS.vatRate;

  // The letterhead logo is an uploaded object now, so it gets the same two guarantees as every
  // other image column (lib/files/owned.ts): only a URL this studio uploaded may be stored, and
  // replacing one deletes the object it replaced.
  //
  // ⚠ Read BEFORE the write — an upsert answers with the new row. And it matters more here than
  // elsewhere: this form AUTOSAVES on a 600ms debounce, so a designer who picks a logo and then
  // edits the business name writes twice, and the second write must not think the first one's file
  // is a stale one to delete. Comparing previous to next is what makes the no-op a no-op.
  const [before] = await db()
    .select({ logoUrl: studioSettings.logoUrl })
    .from(studioSettings)
    .where(eq(studioSettings.organizationId, organizationId))
    .limit(1);
  const logoUrl = ownedFileUrl(input.logoUrl, organizationId);

  const values = {
    businessName: clean(input.businessName),
    ownerName: clean(input.ownerName),
    phone: clean(input.phone, 40),
    address: clean(input.address, 300),
    businessNumber: clean(input.businessNumber, 40),
    email: clean(input.email, 120),
    logoUrl,
    vatRate: String(vatRate),
    // Clamped, not rejected, for the same reason as the VAT rate: it is a number input on an
    // autosaving form, so it passes through 0 and through half-typed values on the way to 30.
    // A quote in force for a negative number of days is not a state a client should ever see.
    quoteValidityDays: Number.isFinite(Number(input.quoteValidityDays))
      ? Math.min(Math.max(Math.round(Number(input.quoteValidityDays)), 0), 365)
      : DEFAULT_SETTINGS.quoteValidityDays,
    quoteTerms: clean(input.quoteTerms, 4000),
    // Not taken from the caller: phase 1 is shekels, the field is read-only on the screen, and a
    // currency symbol that can be set to anything is a quote that can be made to say anything.
    currency: DEFAULT_SETTINGS.currency,
    updatedAt: new Date(),
  };

  await db()
    .insert(studioSettings)
    .values({ organizationId, ...values })
    // Insert-or-update rather than update: see fetchSettings on why the row may not exist. Note
    // `meetingFlow` is absent from both halves, so writing the letterhead cannot wipe the meeting.
    .onConflictDoUpdate({ target: studioSettings.organizationId, set: values });

  await removeReplacedFile(before?.logoUrl, logoUrl, organizationId);

  revalidateSettings();
  return fetchSettings();
}

/**
 * The stages this studio's meeting has, in order.
 *
 * An EMPTY column means "never customised", and is answered with the flow the app ships. That is
 * the same meaning the old localStorage version gave to an absent key, and it is worth keeping: a
 * studio that never touched this screen should follow DEFAULT_FLOW even after DEFAULT_FLOW changes,
 * rather than being frozen at whatever the default happened to be on the day they signed up.
 */
export async function fetchMeetingFlow(): Promise<MeetingStepId[]> {
  const organizationId = await currentOrg();
  const [row] = await db()
    .select({ meetingFlow: studioSettings.meetingFlow })
    .from(studioSettings)
    .where(eq(studioSettings.organizationId, organizationId))
    .limit(1);

  const saved = row?.meetingFlow;
  // normalizeFlow on READ as well as write: a flow stored before a stage was renamed or removed
  // would otherwise hand /meeting a stage id it cannot render.
  return saved?.length ? normalizeFlow(saved) : [...DEFAULT_FLOW];
}

/** Normalises before writing, so an impossible meeting can never be persisted in the first place —
 *  the details stage stays first and required, and unknown ids are dropped. */
export async function saveMeetingFlow(flow: readonly MeetingStepId[]): Promise<MeetingStepId[]> {
  if (!Array.isArray(flow)) throw new Error("flow must be an array");
  const organizationId = await currentOrg();
  const next = normalizeFlow(flow);

  await db()
    .insert(studioSettings)
    .values({ organizationId, meetingFlow: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: studioSettings.organizationId,
      set: { meetingFlow: next, updatedAt: new Date() },
    });

  revalidateShell();
  return next;
}

/** Back to the flow the app ships with. Stores an EMPTY list rather than a copy of DEFAULT_FLOW —
 *  see fetchMeetingFlow: "never customised" has to stay distinguishable from "customised to
 *  something that currently matches the default". */
export async function resetMeetingFlow(): Promise<MeetingStepId[]> {
  const organizationId = await currentOrg();
  await db()
    .insert(studioSettings)
    .values({ organizationId, meetingFlow: [], updatedAt: new Date() })
    .onConflictDoUpdate({
      target: studioSettings.organizationId,
      set: { meetingFlow: [], updatedAt: new Date() },
    });
  revalidateShell();
  return [...DEFAULT_FLOW];
}

/**
 * When each production checkpoint is due, in days before the event (lib/production/runway.ts).
 *
 * Same shape as the meeting flow above, and for the same reason: it is a studio SETTING that one
 * screen rewrites whole. A NULL column means "never configured" and is answered with the defaults —
 * so a studio that never opened this screen follows the app's schedule even after that schedule
 * changes, rather than being frozen at whatever it was on the day they signed up.
 */
export async function fetchCheckpointOffsets(): Promise<CheckpointOffsets> {
  const organizationId = await currentOrg();
  const [row] = await db()
    .select({ checkpointOffsets: studioSettings.checkpointOffsets })
    .from(studioSettings)
    .where(eq(studioSettings.organizationId, organizationId))
    .limit(1);

  // normalizeOffsets on READ as well as write: a record stored before a checkpoint was added would
  // otherwise hand the runway an offset it has no key for.
  return normalizeOffsets(row?.checkpointOffsets);
}

/** Normalises before writing, so an impossible schedule cannot be persisted: unknown ids dropped,
 *  negatives and fractions refused. A checkpoint due AFTER the event is the one thing this cannot
 *  catch and does not try to — a studio that wants the packing list due on the day itself is
 *  entitled to say so with a 0. */
export async function saveCheckpointOffsets(input: unknown): Promise<CheckpointOffsets> {
  const organizationId = await currentOrg();
  const next = normalizeOffsets(input);

  await db()
    .insert(studioSettings)
    .values({ organizationId, checkpointOffsets: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: studioSettings.organizationId,
      set: { checkpointOffsets: next, updatedAt: new Date() },
    });

  // Both screens, because this write changes one and is READ BY the other. A schedule saved here
  // that /production keeps computing against for another thirty seconds (next.config.ts staleTimes)
  // is the worst version of this feature: the designer sets a number precisely to make an alert go
  // away, switches tab, and it is still there.
  revalidateSettings();
  revalidateProduction();
  return next;
}

/** Back to the schedule the app ships with. Writes NULL rather than a copy of DEFAULT_OFFSETS, so
 *  "never configured" stays distinguishable from "configured to match the current default" — the
 *  same argument resetMeetingFlow makes for its empty array. */
export async function resetCheckpointOffsets(): Promise<CheckpointOffsets> {
  const organizationId = await currentOrg();
  await db()
    .insert(studioSettings)
    .values({ organizationId, checkpointOffsets: null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: studioSettings.organizationId,
      set: { checkpointOffsets: null, updatedAt: new Date() },
    });
  revalidateSettings();
  revalidateProduction();
  return { ...DEFAULT_OFFSETS };
}

// ── Stage rules ──────────────────────────────────────────────────────────────────────────────────

/** How a studio wants its stages checked (lib/design-document/stage.ts). One rule today: above what
 *  height the open sides of a stage need a railing — null when the studio has not said, which is the
 *  default and means no railing is ever asked for. */
export interface StageRules {
  railingAboveMm: number | null;
}

/** Its own read, like the checkpoint schedule: one column off the settings row, asked for by the
 *  studio (which draws the railing), the stage plan (which prints it) and the settings screen. */
export async function fetchStageRules(): Promise<StageRules> {
  const organizationId = await currentOrg();
  const [row] = await db()
    .select({ railingAboveMm: studioSettings.stageRailingAboveMm })
    .from(studioSettings)
    .where(eq(studioSettings.organizationId, organizationId))
    .limit(1);
  return { railingAboveMm: row?.railingAboveMm ?? null };
}

/** Null turns the rule off. A number is clamped to 10cm–3m and whole millimetres — anything else is
 *  a typo, not a rule. */
export async function saveStageRules(input: unknown): Promise<StageRules> {
  const organizationId = await currentOrg();
  const raw = input && typeof input === "object" ? (input as { railingAboveMm?: unknown }).railingAboveMm : null;
  const railingAboveMm =
    typeof raw === "number" && Number.isFinite(raw) ? Math.round(Math.min(3000, Math.max(100, raw))) : null;
  await db()
    .insert(studioSettings)
    .values({ organizationId, stageRailingAboveMm: railingAboveMm, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: studioSettings.organizationId,
      set: { stageRailingAboveMm: railingAboveMm, updatedAt: new Date() },
    });
  revalidateSettings();
  return { railingAboveMm };
}

// ── Stage templates ──────────────────────────────────────────────────────────────────────────────

const MAX_TEMPLATES = 40;
const MAX_TEMPLATE_BYTES = 60_000;

/** A template as it arrived over the wire, checked enough to keep garbage out of the row: an id and a
 *  name, a stage with an outline of real points, and a size cap. Every POST reaches here. */
function cleanTemplate(input: unknown): StageTemplate | null {
  if (!input || typeof input !== "object") return null;
  const t = input as Partial<StageTemplate>;
  const point = (q: unknown) => !!q && typeof q === "object" && Number.isFinite((q as Point).x) && Number.isFinite((q as Point).y);
  if (typeof t.id !== "string" || t.id.length > 64) return null;
  if (typeof t.name !== "string" || !t.name.trim()) return null;
  const st = t.stage;
  if (!st || !Array.isArray(st.outline) || st.outline.length < 3 || st.outline.length > 200 || !st.outline.every(point)) return null;
  if (!Array.isArray(st.decks) || typeof st.front !== "number") return null;
  const clean: StageTemplate = {
    id: t.id,
    name: t.name.trim().slice(0, 60),
    stage: st,
    ...(Array.isArray(t.dressing) ? { dressing: t.dressing.slice(0, 200) } : {}),
  };
  return JSON.stringify(clean).length <= MAX_TEMPLATE_BYTES ? clean : null;
}

export async function fetchStageTemplates(): Promise<StageTemplate[]> {
  const organizationId = await currentOrg();
  const [row] = await db()
    .select({ templates: studioSettings.stageTemplates })
    .from(studioSettings)
    .where(eq(studioSettings.organizationId, organizationId))
    .limit(1);
  return row?.templates ?? [];
}

async function writeTemplates(organizationId: string, templates: StageTemplate[]): Promise<StageTemplate[]> {
  await db()
    .insert(studioSettings)
    .values({ organizationId, stageTemplates: templates, updatedAt: new Date() })
    .onConflictDoUpdate({ target: studioSettings.organizationId, set: { stageTemplates: templates, updatedAt: new Date() } });
  return templates;
}

/** Save (or replace, by id) one template. A bad shape is a user-correctable failure, not a throw. */
export async function saveStageTemplate(input: unknown): Promise<StageTemplate[] | { error: string }> {
  const organizationId = await currentOrg();
  const t = cleanTemplate(input);
  if (!t) return { error: "לא ניתן לשמור את הבמה כתבנית" };
  const current = await fetchStageTemplates();
  const next = [...current.filter((x) => x.id !== t.id), t];
  if (next.length > MAX_TEMPLATES) return { error: `אפשר לשמור עד ${MAX_TEMPLATES} תבניות במה` };
  return writeTemplates(organizationId, next);
}

export async function deleteStageTemplate(id: unknown): Promise<StageTemplate[]> {
  const organizationId = await currentOrg();
  if (typeof id !== "string") throw new Error("id must be a string");
  const current = await fetchStageTemplates();
  return writeTemplates(organizationId, current.filter((x) => x.id !== id));
}

// ── Table designs ────────────────────────────────────────────────────────────────────────────────

const MAX_DESIGNS = 60;

/** A design as it arrived over the wire: an id, a name, and items that are each a variant id with a
 *  real position, a count and a size. Anything else is dropped rather than stored. */
function cleanDesign(input: unknown): TableDesign | null {
  if (!input || typeof input !== "object") return null;
  const d = input as Partial<TableDesign>;
  if (typeof d.id !== "string" || d.id.length > 64) return null;
  if (typeof d.name !== "string" || !d.name.trim()) return null;
  if (!Array.isArray(d.items) || d.items.length === 0 || d.items.length > 60) return null;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const items: TableDesign["items"] = [];
  for (const it of d.items) {
    if (!it || typeof it !== "object" || typeof it.variantId !== "string" || it.variantId.length > 64) return null;
    const at = it.position as Point | undefined;
    items.push({
      variantId: it.variantId,
      quantity: Math.max(1, Math.round(num(it.quantity, 1))),
      position: { x: Math.round(num(at?.x, 0)), y: Math.round(num(at?.y, 0)) },
      rotation: num(it.rotation, 0),
      scale: Math.min(3, Math.max(0.3, num(it.scale, 1))),
    });
  }
  return { id: d.id, name: d.name.trim().slice(0, 60), ...(d.arranged ? { arranged: true } : {}), items };
}

export async function fetchTableDesigns(): Promise<TableDesign[]> {
  const organizationId = await currentOrg();
  const [row] = await db()
    .select({ designs: studioSettings.tableDesigns })
    .from(studioSettings)
    .where(eq(studioSettings.organizationId, organizationId))
    .limit(1);
  return row?.designs ?? [];
}

async function writeDesigns(organizationId: string, designs: TableDesign[]): Promise<TableDesign[]> {
  await db()
    .insert(studioSettings)
    .values({ organizationId, tableDesigns: designs, updatedAt: new Date() })
    .onConflictDoUpdate({ target: studioSettings.organizationId, set: { tableDesigns: designs, updatedAt: new Date() } });
  return designs;
}

/** Save (or replace, by id) one table design. */
export async function saveTableDesign(input: unknown): Promise<TableDesign[] | { error: string }> {
  const organizationId = await currentOrg();
  const d = cleanDesign(input);
  if (!d) return { error: "לא ניתן לשמור את עיצוב השולחן" };
  const current = await fetchTableDesigns();
  const next = [...current.filter((x) => x.id !== d.id), d];
  if (next.length > MAX_DESIGNS) return { error: `אפשר לשמור עד ${MAX_DESIGNS} עיצובי שולחן` };
  return writeDesigns(organizationId, next);
}

export async function deleteTableDesign(id: unknown): Promise<TableDesign[]> {
  const organizationId = await currentOrg();
  if (typeof id !== "string") throw new Error("id must be a string");
  const current = await fetchTableDesigns();
  return writeDesigns(organizationId, current.filter((x) => x.id !== id));
}
