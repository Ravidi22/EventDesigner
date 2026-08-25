// The work itself: which connections receive a push, how a token is kept fresh, what comes back.
//
// ⚠ SERVER ONLY, and NOT a "use server" module — the same rule as lib/db/revalidate.ts. These are
// helpers called from inside actions, not endpoints of their own. Exporting `pushAppointment` from
// a "use server" file would publish "write this into every connected designer's Google calendar" as
// something any caller could POST, with an appointment body of their choosing.
//
// THE PUSH IS BEST-EFFORT, ALWAYS. Every entry point here swallows its failures into the
// connection's `lastError` column and returns. That is a deliberate inversion of this codebase's
// usual rule that a failed write throws: the appointment has ALREADY been committed to Postgres by
// the time any of this runs, the designer is looking at a screen that correctly shows their meeting,
// and Google being slow, rate-limited or revoked is not a reason to tell them their booking failed.
// What it IS a reason for is a visible line in settings, which is what `lastError` becomes.
import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { appointments, googleConnections, googleEventLinks } from "@/lib/db/schema";
import { toAppointment } from "@/lib/appointments/db-mapping";
import type { Appointment } from "@/lib/appointments/types";
import { googleConfig, requireGoogleConfig } from "./config";
import { open, seal } from "./secret-box";
import { exchangeCode, fetchGoogleEmail, isRevoked, refreshAccessToken } from "./oauth";
import { GoogleApiError, calendarExists, createCalendar, deleteEvent, insertEvent, listCalendars, listEvents, patchEvent } from "./api";
import { toBusyBlocks, toGoogleEvent, addMonths } from "./mapping";
import type { BusyBlock } from "./types";
import { BUSY_WINDOW_BACK_MONTHS, BUSY_WINDOW_FORWARD_MONTHS, STUDIO_TIMEZONE } from "./types";

type ConnectionRow = typeof googleConnections.$inferSelect;

/** The name given to the calendar this app creates. Latin-cased "Eve" to match the wordmark, and a
 *  Hebrew word after it because it is read in a Hebrew calendar sidebar. */
export const EVE_CALENDAR_NAME = "Eve · פגישות";

/** How many of the designer's calendars the pull will read. Nearly everyone has one or two; the cap
 *  exists for the account with fifteen, where an uncapped pull turns one dashboard render into
 *  fifteen sequential round trips to Google. */
const MAX_PULL_CALENDARS = 8;

// ── Tokens ─────────────────────────────────────────────────────────────────────────────────────

/**
 * A usable access token for this connection, refreshing and re-storing it when needed.
 *
 * THE CACHE IS THE POINT. A token is good for an hour; without storing it, every dashboard render
 * and every appointment write would spend a round trip to Google's token endpoint before doing any
 * actual work. The stored copy is sealed for the same reason the refresh token is — an access token
 * in a leaked dump is an hour of somebody's calendar.
 */
async function accessTokenFor(row: ConnectionRow): Promise<string> {
  const config = requireGoogleConfig();

  if (row.accessToken && row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() > Date.now()) {
    const cached = open(row.accessToken, config.tokenKey);
    // A cached token that will not open means the key changed under it. Fall through and mint a new
    // one rather than failing — the refresh token is sealed with the same key and will fail loudly
    // just below if it is genuinely unreadable.
    if (cached) return cached;
  }

  const refresh = open(row.refreshToken, config.tokenKey);
  if (!refresh) throw new Error("invalid_grant: stored refresh token cannot be opened");

  const tokens = await refreshAccessToken(refresh, config);
  await db()
    .update(googleConnections)
    .set({
      accessToken: seal(tokens.accessToken, config.tokenKey),
      accessTokenExpiresAt: new Date(tokens.expiresAt),
      updatedAt: new Date(),
    })
    .where(eq(googleConnections.id, row.id));

  return tokens.accessToken;
}

/** The Hebrew line the settings screen shows when a push failed. Written for the designer, not for
 *  an operator: each one names something they can actually do. */
function describe(error: unknown): string {
  if (isRevoked(error) || (error instanceof Error && error.message.includes("invalid_grant"))) {
    return "החיבור ל-Google בוטל. יש להתחבר מחדש.";
  }
  if (error instanceof GoogleApiError) {
    if (error.status === 403) return "Google דחה את הבקשה (הרשאות או מכסה). נסה להתחבר מחדש.";
    if (error.isTransient) return "Google לא זמין כרגע. הפגישות יסונכרנו בשמירה הבאה.";
  }
  return "הסנכרון ל-Google נכשל. הפגישות יסונכרנו בשמירה הבאה.";
}

async function recordFailure(connectionId: string, error: unknown): Promise<void> {
  await db()
    .update(googleConnections)
    .set({ lastError: describe(error), updatedAt: new Date() })
    .where(eq(googleConnections.id, connectionId));
}

async function recordSuccess(connectionId: string): Promise<void> {
  await db()
    .update(googleConnections)
    .set({ lastError: null, lastPushAt: new Date(), updatedAt: new Date() })
    .where(eq(googleConnections.id, connectionId));
}

// ── Which connections ──────────────────────────────────────────────────────────────────────────

/** Every connection in this studio that wants the diary.
 *
 *  THE WHOLE STUDIO, not the person who happened to make the edit. The diary is shared — a meeting
 *  the owner books belongs on the designer's phone too — so a write by anyone pushes to everyone
 *  who has connected and left push on. */
async function pushTargets(organizationId: string): Promise<ConnectionRow[]> {
  if (!googleConfig()) return [];
  return db()
    .select()
    .from(googleConnections)
    .where(and(eq(googleConnections.organizationId, organizationId), eq(googleConnections.pushEnabled, true)));
}

/** A fingerprint of what would be sent, so an unchanged meeting costs nothing.
 *
 *  Over the MAPPED event rather than the appointment row: two appointments differing only in a
 *  field the push does not carry (`done`, `venueId`, `updatedAt`) produce identical Google events,
 *  and re-sending those is exactly the waste this exists to avoid. */
function fingerprint(appointment: Appointment): string {
  return createHash("sha256").update(JSON.stringify(toGoogleEvent(appointment))).digest("base64url").slice(0, 32);
}

// ── Push ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Make one connection's calendar agree with one appointment.
 *
 * FOUR OUTCOMES, and the third is the one worth reading. No link and nothing to do; no link, so
 * insert and record; a link whose remote event the designer deleted by hand, which comes back as
 * `isGone` and is re-inserted rather than reported; and a link whose content hash already matches,
 * which returns without a request.
 */
async function pushOne(row: ConnectionRow, appointment: Appointment, organizationId: string): Promise<void> {
  const token = await accessTokenFor(row);
  const calendarId = await ensureCalendar(row, token);
  const event = toGoogleEvent(appointment);
  const hash = fingerprint(appointment);

  const [link] = await db()
    .select()
    .from(googleEventLinks)
    .where(
      and(
        eq(googleEventLinks.connectionId, row.id),
        eq(googleEventLinks.appointmentId, appointment.id),
        eq(googleEventLinks.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (link) {
    if (link.contentHash === hash) return;
    try {
      await patchEvent(calendarId, link.googleEventId, event, token);
      await db()
        .update(googleEventLinks)
        .set({ contentHash: hash, updatedAt: new Date() })
        .where(eq(googleEventLinks.id, link.id));
      return;
    } catch (error) {
      // Deleted in Google by hand. Fall through to a fresh insert; anything else is a real failure.
      if (!(error instanceof GoogleApiError && error.isGone)) throw error;
    }
  }

  const googleEventId = await insertEvent(calendarId, event, token);
  await db()
    .insert(googleEventLinks)
    .values({ organizationId, connectionId: row.id, appointmentId: appointment.id, googleEventId, contentHash: hash })
    .onConflictDoUpdate({
      target: [googleEventLinks.connectionId, googleEventLinks.appointmentId],
      set: { googleEventId, contentHash: hash, updatedAt: new Date() },
    });
}

/** The calendar id to write to, re-creating it if the designer deleted it in Google.
 *
 *  Deleting the calendar is the documented way to switch this integration off from Google's side,
 *  so re-creating it on the next push would be obnoxious — except that the app's own switch is the
 *  `pushEnabled` column, and this code only runs when that is on. Someone who deleted the calendar
 *  while leaving the sync enabled has made two contradictory statements, and honouring the one in
 *  this app is the recoverable reading: the alternative is a connection that silently writes into
 *  nothing forever. Turning push off in settings stops it for good. */
async function ensureCalendar(row: ConnectionRow, token: string): Promise<string> {
  if (await calendarExists(row.calendarId, token)) return row.calendarId;

  const calendarId = await createCalendar(EVE_CALENDAR_NAME, STUDIO_TIMEZONE, token);
  await db()
    .update(googleConnections)
    .set({ calendarId, calendarName: EVE_CALENDAR_NAME, updatedAt: new Date() })
    .where(eq(googleConnections.id, row.id));

  // Every link pointed into the calendar that no longer exists. Dropping them turns the next push
  // into a clean re-insert instead of a run of 404s that each cost a request to discover.
  await db().delete(googleEventLinks).where(eq(googleEventLinks.connectionId, row.id));
  return calendarId;
}

/** Push one appointment to every connection in the studio. Never throws. */
export async function pushAppointment(appointment: Appointment, organizationId: string): Promise<void> {
  for (const row of await pushTargets(organizationId)) {
    try {
      await pushOne(row, appointment, organizationId);
      await recordSuccess(row.id);
    } catch (error) {
      await recordFailure(row.id, error);
    }
  }
}

/**
 * Push the studio's whole diary — used on first connect, and by the "סנכרן עכשיו" button.
 *
 * FUTURE AND RECENT PAST ONLY. A studio with four years of history has no use for 2022's meetings
 * on a phone, and pushing them would spend hundreds of requests to fill a calendar nobody scrolls
 * back through. The window matches the pull's, so the two directions describe the same stretch of
 * time.
 */
export async function pushAllAppointments(organizationId: string): Promise<{ pushed: number; failed: number }> {
  const targets = await pushTargets(organizationId);
  if (targets.length === 0) return { pushed: 0, failed: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const rows = await db()
    .select()
    .from(appointments)
    .where(eq(appointments.organizationId, organizationId));

  const from = addMonths(today, -BUSY_WINDOW_BACK_MONTHS);
  const inWindow = rows.map(toAppointment).filter((a) => a.date >= from);

  let pushed = 0;
  let failed = 0;
  for (const row of targets) {
    try {
      for (const appointment of inWindow) {
        await pushOne(row, appointment, organizationId);
        pushed++;
      }
      await recordSuccess(row.id);
    } catch (error) {
      failed++;
      await recordFailure(row.id, error);
    }
  }
  return { pushed, failed };
}

/** The link rows for an appointment, read BEFORE it is deleted.
 *
 *  ⚠ THE ORDER IS THE WHOLE POINT. `google_event_links.appointment_id` cascades, so the moment the
 *  appointment row goes, so does every record of which Google event it became — and the remote
 *  copies become unreachable, sitting in each designer's calendar forever with nothing in this app
 *  able to name them. So the caller reads these first, deletes, then hands them here. */
export async function linksForAppointment(
  appointmentId: string,
  organizationId: string,
): Promise<{ connectionId: string; googleEventId: string }[]> {
  if (!googleConfig()) return [];
  return db()
    .select({ connectionId: googleEventLinks.connectionId, googleEventId: googleEventLinks.googleEventId })
    .from(googleEventLinks)
    .where(and(eq(googleEventLinks.appointmentId, appointmentId), eq(googleEventLinks.organizationId, organizationId)));
}

/** Remove the remote copies of a deleted appointment. Never throws — see the note at the top. */
export async function removeFromGoogle(
  links: { connectionId: string; googleEventId: string }[],
  organizationId: string,
): Promise<void> {
  if (links.length === 0 || !googleConfig()) return;

  const rows = await db()
    .select()
    .from(googleConnections)
    .where(
      and(
        eq(googleConnections.organizationId, organizationId),
        inArray(googleConnections.id, links.map((l) => l.connectionId)),
      ),
    );

  for (const row of rows) {
    const mine = links.filter((l) => l.connectionId === row.id);
    try {
      const token = await accessTokenFor(row);
      for (const link of mine) await deleteEvent(row.calendarId, link.googleEventId, token);
    } catch (error) {
      await recordFailure(row.id, error);
    }
  }
}

// ── Pull ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The signed-in designer's own Google entries, as busy blocks, over a window.
 *
 * THIS ONE IS PER-PERSON, unlike the push. "When am I busy" is a question about the person looking
 * at the screen — the owner's dentist appointment is not the studio's business and must not appear
 * on a colleague's dashboard. So it reads the connection belonging to `userId` and no other.
 *
 * Returns an empty array for every ordinary "no" — not configured, not connected, pull switched
 * off, Google unreachable. The dashboard renders the diary either way; busy blocks are an overlay,
 * and an overlay that fails must not take a screen with it.
 */
export async function busyBlocks(
  userId: string,
  organizationId: string,
  fromISO?: string,
  toISO?: string,
): Promise<BusyBlock[]> {
  if (!googleConfig()) return [];

  const [row] = await db()
    .select()
    .from(googleConnections)
    .where(
      and(
        eq(googleConnections.userId, userId),
        eq(googleConnections.organizationId, organizationId),
        eq(googleConnections.pullEnabled, true),
      ),
    )
    .limit(1);
  if (!row) return [];

  const today = new Date().toISOString().slice(0, 10);
  const from = fromISO ?? addMonths(today, -BUSY_WINDOW_BACK_MONTHS);
  const to = toISO ?? addMonths(today, BUSY_WINDOW_FORWARD_MONTHS);

  try {
    const token = await accessTokenFor(row);
    const calendars = (await listCalendars(token, row.calendarId)).slice(0, MAX_PULL_CALENDARS);

    // In parallel: these are independent reads and a designer with four calendars should not wait
    // four round trips. `allSettled`, so one calendar that 403s does not empty the whole overlay.
    const results = await Promise.allSettled(
      calendars.map(async (calendar) => {
        // Google wants RFC3339 instants for the window. Midnight-to-midnight UTC is deliberately
        // wider than the local day at both ends — the alternative is clipping an event off the edge
        // of the range, and a couple of extra hours costs nothing.
        const events = await listEvents(calendar.id, `${from}T00:00:00Z`, `${to}T23:59:59Z`, token);
        return events.flatMap((event) => toBusyBlocks(event, calendar.id, calendar.name));
      }),
    );

    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  } catch (error) {
    await recordFailure(row.id, error);
    return [];
  }
}

// ── Connect / disconnect ───────────────────────────────────────────────────────────────────────

/**
 * Turn an authorization code into a stored connection. Called from the OAuth callback route.
 *
 * ⚠ REFUSES A CODE THAT CAME BACK WITHOUT A REFRESH TOKEN, rather than storing what it got. An
 * access token alone works beautifully for one hour and then stops, and the failure arrives later,
 * silently, as "my meetings stopped syncing" — with a row in the database that looks connected. A
 * connection that cannot survive the hour is not a connection, so this fails now, loudly, where the
 * designer is still standing in the flow and can be told to try again.
 *
 * REPLACES rather than accumulates: `google_connections.user_id` is unique, so re-connecting the
 * same person overwrites their row. The old calendar's links are dropped with it (cascade), and the
 * caller re-pushes, which is what makes "reconnect" the cure for a broken connection.
 */
export async function completeConnect(
  userId: string,
  organizationId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = requireGoogleConfig();

  let tokens;
  try {
    tokens = await exchangeCode(code, config);
  } catch {
    return { ok: false, error: "Google דחה את הבקשה. נסה שוב." };
  }

  if (!tokens.refreshToken) {
    return {
      ok: false,
      error: "Google לא החזיר הרשאה מתמשכת. נתק את Eve בהגדרות החשבון ב-Google ונסה שוב.",
    };
  }

  const email = await fetchGoogleEmail(tokens.accessToken).catch(() => "");

  let calendarId: string;
  try {
    calendarId = await createCalendar(EVE_CALENDAR_NAME, STUDIO_TIMEZONE, tokens.accessToken);
  } catch {
    // The one failure worth naming precisely: consent succeeded but the app cannot create its own
    // calendar, which in practice means the app.created scope was refused or is not enabled on the
    // Cloud project. See the scope note in lib/google/config.ts.
    return { ok: false, error: "לא ניתן ליצור יומן ב-Google. בדוק את הרשאות היישום." };
  }

  // Delete-then-insert rather than an upsert: reconnecting must not inherit the previous
  // connection's calendar id, link rows or stale error. Cascade takes the links with it.
  await db()
    .delete(googleConnections)
    .where(and(eq(googleConnections.userId, userId), eq(googleConnections.organizationId, organizationId)));

  await db().insert(googleConnections).values({
    organizationId,
    userId,
    googleEmail: email,
    refreshToken: seal(tokens.refreshToken, config.tokenKey),
    accessToken: seal(tokens.accessToken, config.tokenKey),
    accessTokenExpiresAt: new Date(tokens.expiresAt),
    calendarId,
    calendarName: EVE_CALENDAR_NAME,
  });

  return { ok: true };
}

/**
 * Forget the connection.
 *
 * ⚠ THE REMOTE CALENDAR IS LEFT IN PLACE, deliberately. Deleting it would erase every meeting this
 * app ever wrote from a designer's phone the instant they unticked a box — including the ones they
 * are relying on next week. Disconnecting stops the sync; what has already been delivered stays
 * delivered, and the calendar is one item in their Google sidebar that they can delete themselves
 * if they want it gone. The token is revoked at Google so nothing can write to it again.
 */
export async function disconnect(userId: string, organizationId: string): Promise<void> {
  const config = googleConfig();
  const [row] = await db()
    .select()
    .from(googleConnections)
    .where(and(eq(googleConnections.userId, userId), eq(googleConnections.organizationId, organizationId)))
    .limit(1);
  if (!row) return;

  // Best-effort revocation before the row goes: once it is deleted there is no token left to revoke
  // with, and a refresh token that outlives the connection it belonged to is exactly the kind of
  // credential that turns up in an audit years later.
  if (config) {
    const refresh = open(row.refreshToken, config.tokenKey);
    if (refresh) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refresh }),
        cache: "no-store",
      }).catch(() => {
        // Revocation is a courtesy to the designer's account, not a precondition for forgetting the
        // row here. A network failure must not leave them unable to disconnect.
      });
    }
  }

  await db().delete(googleConnections).where(eq(googleConnections.id, row.id));
}

/** The connection as the settings screen needs it — no tokens, ever. This return value crosses into
 *  a client component, so what is not selected here cannot leak into the page source. */
export async function connectionFor(userId: string, organizationId: string) {
  if (!googleConfig()) return null;
  const [row] = await db()
    .select({
      googleEmail: googleConnections.googleEmail,
      calendarName: googleConnections.calendarName,
      pushEnabled: googleConnections.pushEnabled,
      pullEnabled: googleConnections.pullEnabled,
      lastPushAt: googleConnections.lastPushAt,
      lastError: googleConnections.lastError,
    })
    .from(googleConnections)
    .where(and(eq(googleConnections.userId, userId), eq(googleConnections.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/** Switch a direction on or off. Returns false when there is no connection to switch. */
export async function setDirections(
  userId: string,
  organizationId: string,
  push: boolean,
  pull: boolean,
): Promise<boolean> {
  const result = await db()
    .update(googleConnections)
    .set({ pushEnabled: push, pullEnabled: pull, updatedAt: new Date() })
    .where(and(eq(googleConnections.userId, userId), eq(googleConnections.organizationId, organizationId)))
    .returning({ id: googleConnections.id });
  return result.length > 0;
}
