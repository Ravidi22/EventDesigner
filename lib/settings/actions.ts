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
import { revalidateSettings, revalidateShell } from "@/lib/db/revalidate";
import { studioSettings } from "@/lib/db/schema";
import { ownedFileUrl, removeReplacedFile } from "@/lib/files/owned";
import { DEFAULT_FLOW, normalizeFlow, type MeetingStepId } from "@/lib/meeting/steps";
import { DEFAULT_SETTINGS, type BusinessSettings } from "./types";

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
