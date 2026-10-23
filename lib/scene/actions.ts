"use server";
// The designer's camera work on an event: its viewpoints, its guided tour, its mood — the one part
// of the 3D view that is a decision rather than a derivation (spec §7). The scene itself is built
// from the design document on every read and never stored; this module writes nothing else.
//
// Same rules as every action module: every export starts with currentActor(), which throws for a
// client account; an event id is checked against the actor's studio before anything is read; what
// arrives is cleaned by ./clean.ts. A failure the designer can fix comes back as `{ error }`.
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/db/org";
import { eventScenes, events, sceneLinks } from "@/lib/db/schema";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { randomBytes } from "node:crypto";
import { cleanSceneSettings } from "./clean";
import { DEFAULT_SETTINGS, type SceneSettings } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The actor's studio, once the event is known to be one of its own. */
async function ownEvent(eventId: string): Promise<string> {
  if (typeof eventId !== "string" || !UUID.test(eventId)) throw new Error("eventId must be a uuid");
  const actor = await currentActor();
  const [row] = await db()
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.organizationId, actor.organizationId)))
    .limit(1);
  if (!row) throw new Error("no such event");
  return actor.organizationId;
}

/** The event's camera work, or the defaults when the designer has saved none — which is also what
 *  an event with no row has always meant (the viewpoints then come from the plan). */
export async function fetchSceneSettings(eventId: string): Promise<SceneSettings> {
  await ownEvent(eventId);
  const [row] = await db().select({ settings: eventScenes.settings }).from(eventScenes).where(eq(eventScenes.eventId, eventId)).limit(1);
  if (!row) return DEFAULT_SETTINGS;
  // A row written by an older shape is read through the same cleaner the write uses.
  const clean = cleanSceneSettings(row.settings);
  return "error" in clean ? DEFAULT_SETTINGS : clean;
}

/** Save the camera work. Crew may look at the 3D view but not curate what a client is shown. */
export async function saveSceneSettings(eventId: string, input: unknown): Promise<SceneSettings | { error: string }> {
  const organizationId = await ownEvent(eventId);
  const actor = await currentActor();
  if (actor.role === "crew") throw new Error("crew cannot curate the client's views");
  const clean = cleanSceneSettings(input);
  if ("error" in clean) return clean;
  await db()
    .insert(eventScenes)
    .values({ eventId, organizationId, settings: clean, updatedAt: new Date() })
    .onConflictDoUpdate({ target: eventScenes.eventId, set: { settings: clean, updatedAt: new Date() } });
  return clean;
}

// ── the no-login link (spec §6.4, F-9.2) ─────────────────────────────────────────────────────────

/** How long a link stays open, and the most a designer may choose (DECIDE 4: 30 days). */
const LINK_DAYS = 30;
const MAX_LINK_DAYS = 365;

export interface SceneLinkRow {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  openedCount: number;
  lastOpenedAt: string | null;
  createdAt: string;
  /** Unexpired and unrevoked. */
  live: boolean;
}

const sceneLinkPath = (token: string) => `/v/${token}`;

async function linksOf(eventId: string): Promise<SceneLinkRow[]> {
  const now = Date.now();
  const rows = await db().select().from(sceneLinks).where(eq(sceneLinks.eventId, eventId)).orderBy(desc(sceneLinks.createdAt)).limit(20);
  return rows.map((r) => ({
    id: r.id,
    expiresAt: r.expiresAt.toISOString(),
    revokedAt: r.revokedAt?.toISOString() ?? null,
    openedCount: r.openedCount,
    lastOpenedAt: r.lastOpenedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    live: !r.revokedAt && r.expiresAt.getTime() > now,
  }));
}

/** The event's links, newest first — what the share panel lists. */
export async function fetchSceneLinks(eventId: string): Promise<SceneLinkRow[]> {
  await ownEvent(eventId);
  return linksOf(eventId);
}

/** A new link for the event. One live link per event (DECIDE 4): minting revokes the one before, so
 *  "send a new link" is also how a designer takes back one sent to the wrong number. The token is
 *  returned ONCE, as a path; only its hash is kept. */
export async function mintSceneLink(eventId: string, days: number = LINK_DAYS): Promise<{ path: string; links: SceneLinkRow[] }> {
  const organizationId = await ownEvent(eventId);
  const actor = await currentActor();
  if (actor.role === "crew") throw new Error("crew cannot share events");
  const span = Number.isFinite(days) ? Math.round(Math.min(MAX_LINK_DAYS, Math.max(1, days))) : LINK_DAYS;
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx
      .update(sceneLinks)
      .set({ revokedAt: now })
      .where(and(eq(sceneLinks.eventId, eventId), isNull(sceneLinks.revokedAt), gt(sceneLinks.expiresAt, now)));
    await tx.insert(sceneLinks).values({
      organizationId,
      eventId,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(now.getTime() + span * 24 * 60 * 60 * 1000),
      createdBy: actor.userId,
    });
  });
  return { path: sceneLinkPath(token), links: await linksOf(eventId) };
}

/** Take a link back. Idempotent: revoking a revoked or expired link changes nothing. */
export async function revokeSceneLink(eventId: string, linkId: string): Promise<SceneLinkRow[]> {
  await ownEvent(eventId);
  const actor = await currentActor();
  if (actor.role === "crew") throw new Error("crew cannot share events");
  if (typeof linkId !== "string" || !UUID.test(linkId)) throw new Error("linkId must be a uuid");
  await db()
    .update(sceneLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(sceneLinks.id, linkId), eq(sceneLinks.eventId, eventId), isNull(sceneLinks.revokedAt)));
  return linksOf(eventId);
}
