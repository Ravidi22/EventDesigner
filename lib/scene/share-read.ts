// The one read in the app keyed by a TOKEN rather than a session (spec §6.4, F-9.2): the 3D view a
// client forwards to family, opened at /v/<token> by someone with no account.
//
// ⚠ A PLAIN MODULE, called by the /v page's server component — deliberately not a "use server"
// action. As an action it would be a POST endpoint anyone could call in a loop; as a function the
// page awaits, the only way in is a GET of the page, and the token is 256 random bits. The token is
// compared by its SHA-256 (the invitation scheme, lib/auth/invite-token.ts): only the hash is
// stored, so a leaked database row opens nothing. A link is live while it is unexpired, unrevoked
// and its event is not archived; every successful open is counted for the designer's panel.
//
// What it returns is the client portal's shape exactly (./reads.ts clientSceneFor): products
// through clientProduct, the studio's public contact line, no price anywhere. `check:scene-share`
// holds what this file and app/v may import.
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, organizations, sceneLinks, venues } from "@/lib/db/schema";
import { hashInviteToken } from "@/lib/auth/invite-token";
import type { ClientScene } from "./client";
import { clientSceneFor } from "./reads";

/** A minted token is 32 random bytes in base64url: 43 characters. Anything else is not one. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** The scene a live link opens, or null — for a malformed, unknown, expired or revoked token, or an
 *  archived event. The page says the same thing for all of them ("הקישור אינו פעיל"): telling them
 *  apart would tell a guesser which tokens once existed. */
export async function sceneByToken(token: string): Promise<ClientScene | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const now = new Date();
  const [row] = await db()
    .select({
      linkId: sceneLinks.id,
      organizationId: events.organizationId,
      eventId: events.id,
      venueId: events.venueId,
      title: events.clientName,
      date: events.eventDate,
      time: events.startTime,
      where: events.zonesLabel,
      venueName: venues.name,
      studioName: organizations.name,
    })
    .from(sceneLinks)
    .innerJoin(events, and(eq(events.id, sceneLinks.eventId), eq(events.organizationId, sceneLinks.organizationId)))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .leftJoin(organizations, eq(organizations.id, events.organizationId))
    .where(and(eq(sceneLinks.tokenHash, hashInviteToken(token)), isNull(sceneLinks.revokedAt), gt(sceneLinks.expiresAt, now), eq(events.archived, false)))
    .limit(1);
  if (!row) return null;
  await db()
    .update(sceneLinks)
    .set({ openedCount: sql`${sceneLinks.openedCount} + 1`, lastOpenedAt: now })
    .where(eq(sceneLinks.id, row.linkId));
  return clientSceneFor(
    row.organizationId,
    row.venueId,
    {
      id: row.eventId,
      title: row.title,
      date: row.date ?? "",
      time: row.time ? row.time.slice(0, 5) : undefined,
      where: row.where,
      venueName: row.venueName ?? undefined,
    },
    row.studioName ?? "",
  );
}
