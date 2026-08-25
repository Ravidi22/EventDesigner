// Calendar API v3, as far as this app uses it. Six calls, hand-written over `fetch`.
//
// NO CLIENT LIBRARY, and it is the same reasoning that kept Konva out (ADR-8) and scrypt in
// (lib/auth/password.ts): `googleapis` is a very large dependency that generates every Google
// product's surface, and what is needed here is six REST calls with a bearer token. The whole of
// this file is smaller than that package's type definitions for Calendar alone.
//
// ⚠ SERVER ONLY. Every call carries an access token.
import type { GoogleEvent } from "./mapping";
import { isMain } from "@/lib/self-check";

const BASE = "https://www.googleapis.com/calendar/v3";

/** What a call can fail as, in the two ways the caller acts on differently. */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Google's machine-readable reason, when it gave one — "rateLimitExceeded", "notFound". */
    readonly reason?: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }

  /** The remote event is not there. On a PATCH or DELETE this is not an error to report but a fact
   *  to act on: the designer deleted the event by hand in Google, and the push should re-create it
   *  (or, on a delete, consider the job already done). */
  get isGone(): boolean {
    return this.status === 404 || this.status === 410;
  }

  /** Worth trying again in a moment; not worth telling anyone about. */
  get isTransient(): boolean {
    return this.status === 429 || this.status >= 500 || this.reason === "rateLimitExceeded" || this.reason === "userRateLimitExceeded";
  }
}

/**
 * One authenticated request.
 *
 * ONE RETRY, ON TRANSIENT FAILURES ONLY. Google's per-user quota is generous but bursty writes hit
 * it — pushing a diary of forty meetings is forty requests in a second — and a single backoff turns
 * the common case of "one of them was unlucky" into a success. More than one retry belongs to a job
 * queue, which this app deliberately does not have (docs/02 §8); the push is best-effort by design
 * and the next write re-pushes anything that failed.
 */
async function call<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    // A calendar read must never be served from a cache: the whole point is that it is current.
    cache: "no-store",
  });

  if (response.ok) {
    // 204 on DELETE — no body to parse, and `.json()` on an empty body throws.
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string; errors?: { reason?: string }[] };
  } | null;
  const reason = body?.error?.errors?.[0]?.reason;
  const error = new GoogleApiError(
    body?.error?.message ?? `google calendar ${response.status}`,
    response.status,
    reason,
  );

  if (error.isTransient && attempt === 0) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return call<T>(path, accessToken, init, attempt + 1);
  }
  throw error;
}

// ── Calendars ──────────────────────────────────────────────────────────────────────────────────

/** Create the calendar this app owns inside the designer's account.
 *
 *  A SECONDARY CALENDAR, never the primary. It is what makes the narrow `calendar.app.created`
 *  scope sufficient (lib/google/config.ts), and it is what makes the integration reversible in one
 *  click from the designer's side: deleting this calendar in Google removes every meeting this app
 *  ever wrote and touches nothing they made themselves. */
export async function createCalendar(name: string, timeZone: string, accessToken: string): Promise<string> {
  const created = await call<{ id: string }>("/calendars", accessToken, {
    method: "POST",
    body: JSON.stringify({ summary: name, timeZone }),
  });
  return created.id;
}

/** Does this calendar still exist and can we still see it? Cheap check used before a push, so a
 *  calendar the designer deleted by hand is noticed and re-created rather than pushed into. */
export async function calendarExists(calendarId: string, accessToken: string): Promise<boolean> {
  try {
    await call<unknown>(`/calendars/${encodeURIComponent(calendarId)}`, accessToken);
    return true;
  } catch (error) {
    if (error instanceof GoogleApiError && error.isGone) return false;
    throw error;
  }
}

/**
 * The designer's own calendars, for the pull.
 *
 * ⚠ `minAccessRole=writer`, NOT `reader`, and this one line is the difference between a useful
 * feature and an unusable screen. A typical Google account is subscribed to several calendars it
 * can only read: "חגים בישראל", a football fixture list, a family calendar someone shared. Pulled
 * in as busy blocks, the holiday feed alone would stamp something onto most of the interesting days
 * of the year — days this app ALREADY annotates properly, from its own Hebrew calendar
 * (lib/calendar/hebrew.ts), with the distinction that actually matters to an event designer:
 * whether a day is bookable, not merely whether it is named.
 *
 * Writable calendars are the ones holding this person's own commitments, which is exactly what
 * "when am I busy" means. Filtering by role rather than by matching Google's holiday-calendar id
 * patterns also keeps working when those patterns change.
 *
 * Excludes the calendar this app created: reading back what we wrote is the feedback loop
 * `EVE_SOURCE` guards against, and skipping it here saves the request entirely.
 */
export async function listCalendars(
  accessToken: string,
  excludeId?: string,
): Promise<{ id: string; name: string }[]> {
  const body = await call<{ items?: { id: string; summary?: string; selected?: boolean; deleted?: boolean }[] }>(
    "/users/me/calendarList?minAccessRole=writer&showDeleted=false",
    accessToken,
  );
  return (body.items ?? [])
    .filter((c) => !c.deleted && c.id !== excludeId)
    .map((c) => ({ id: c.id, name: c.summary?.trim() || c.id }));
}

// ── Events ─────────────────────────────────────────────────────────────────────────────────────

export async function insertEvent(calendarId: string, event: GoogleEvent, accessToken: string): Promise<string> {
  const created = await call<{ id: string }>(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, {
    method: "POST",
    body: JSON.stringify(event),
  });
  return created.id;
}

/** PATCH rather than PUT: a full update would blank any field this app does not send, and the
 *  designer may legitimately have added a Google Meet link or a reminder to the event on their
 *  phone. Those are theirs; the fields in `toGoogleEvent` are ours. */
export async function patchEvent(
  calendarId: string,
  eventId: string,
  event: GoogleEvent,
  accessToken: string,
): Promise<void> {
  await call<unknown>(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify(event) },
  );
}

/** Remove the remote copy. A 404/410 is success, not failure — something already removed is in the
 *  state this call exists to reach. */
export async function deleteEvent(calendarId: string, eventId: string, accessToken: string): Promise<void> {
  try {
    await call<unknown>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      accessToken,
      { method: "DELETE" },
    );
  } catch (error) {
    if (error instanceof GoogleApiError && error.isGone) return;
    throw error;
  }
}

/**
 * Every event in a window, following Google's pagination.
 *
 * `singleEvents=true` EXPANDS RECURRENCE. Without it a weekly standing appointment comes back once,
 * as a rule with an RRULE string this app would have to interpret — and a designer's Tuesday
 * morning block is exactly the kind of thing that is recurring. Expanded, each occurrence is an
 * ordinary event with a real date, which is what the grid needs.
 *
 * ⚠ NO `syncToken` HERE, and it is not an omission. Incremental sync is the efficient way to do
 * this, and Google forbids combining a sync token with `timeMin`/`timeMax` — the token means "what
 * changed since", the window means "this stretch of the calendar", and a screen showing one month
 * at a time needs the window. The cost is bounded by the window rather than by the size of the
 * designer's history, which is the property that actually matters.
 *
 * PAGES ARE CAPPED. A window of a few months holds tens of events for a person and thousands for a
 * shared room calendar somebody happens to subscribe to; the cap keeps one unlucky account from
 * turning a dashboard render into fifty sequential round trips.
 */
export async function listEvents(
  calendarId: string,
  timeMin: string,
  timeMax: string,
  accessToken: string,
  maxPages = 5,
): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const body = await call<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      accessToken,
    );
    events.push(...(body.items ?? []));
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }

  return events;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };

  const gone = new GoogleApiError("not found", 404, "notFound");
  assert(gone.isGone, "404 is gone");
  assert(new GoogleApiError("deleted", 410).isGone, "410 is gone");
  assert(!gone.isTransient, "a missing event is not worth retrying");

  assert(new GoogleApiError("slow down", 429).isTransient, "429 is transient");
  assert(new GoogleApiError("boom", 503).isTransient, "5xx is transient");
  assert(new GoogleApiError("quota", 403, "rateLimitExceeded").isTransient, "a 403 for rate limiting is transient");
  assert(!new GoogleApiError("forbidden", 403, "insufficientPermissions").isTransient, "a 403 for scope is NOT — retrying cannot fix a missing scope");
  assert(!new GoogleApiError("bad", 400).isTransient, "400 is our bug, not Google's mood");
  assert(new GoogleApiError("x", 401).isTransient === false, "401 is handled by refreshing, not retrying");

  assert(gone instanceof Error, "it is a real Error so it survives a rethrow");
  assert(gone.status === 404 && gone.reason === "notFound", "status and reason are carried for the caller");

  // Calendar ids are email-shaped and contain @ and dots; event ids are opaque. Both go in a path
  // segment, so both must be encoded — this is the difference between a working delete and a 404
  // that silently leaves an event behind.
  assert(encodeURIComponent("a b@x.com") === "a%20b%40x.com", "path segments are encoded");

  console.log("google api self-check passed");
}
