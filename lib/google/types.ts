// What the app knows about a Google Calendar connection, and what it gets back from one.
//
// TWO DIRECTIONS, AND THEY ARE NOT SYMMETRICAL. The studio's diary is PUSHED into a calendar this
// app creates inside the designer's Google account; the designer's own calendars are PULLED back as
// read-only busy blocks. Neither side ever edits the other's entries, which is why there is no
// conflict resolution anywhere in lib/google/ and no "last writer wins" rule to get subtly wrong:
// every row has exactly one owner. A true two-way sync — where moving a meeting in Google moves the
// appointment here — would need sync tokens, tombstones and a renewal job for watch channels that
// expire weekly, and this app has no scheduler to run one (docs/02 §8, "no worker and no queue").
//
// ⚠ ONE GOOGLE ACCOUNT PER USER, NOT PER STUDIO. The diary is studio-wide, so if two members
// connect, both get the whole diary in their own calendar. That is the intent — a shared diary that
// reaches each person's phone — and it is why the link table below is keyed by CONNECTION as well
// as by appointment: one appointment becomes a different Google event in each member's calendar.
import { isMain } from "@/lib/self-check";

/** A connection as the settings screen needs to describe it. Deliberately carries no tokens: this
 *  crosses to a client component, and a refresh token in an RSC payload is a refresh token in the
 *  page source. */
export interface GoogleConnection {
  /** Which Google account, so the designer can tell a personal one from the business one. */
  email: string;
  /** The calendar this app created and writes to. Named, not just id'd, because the whole point of
   *  a dedicated calendar is that the designer can find and toggle it in Google's sidebar. */
  calendarName: string;
  /** Diary → Google. */
  pushEnabled: boolean;
  /** Google → busy blocks here. */
  pullEnabled: boolean;
  /** Epoch ms of the last successful push, or absent if none has succeeded yet. */
  lastPushAt?: number;
  /** The last push error, in Hebrew, if the most recent attempt failed. Surfaced in settings so a
   *  revoked token is visible as something other than "meetings stopped appearing on my phone". */
  lastError?: string;
}

/**
 * Whether `GOOGLE_REDIRECT_URI` can work from the deployment that is running.
 *
 * Lives here rather than beside the check itself (lib/google/config.ts, which reads the client
 * secret and is server-only) because the settings screen is a client component and has to render
 * this. The verdict carries no secret — two hostnames and a name for what is wrong with them.
 */
export type RedirectVerdict =
  /** The configured URI can work from here. Also the answer during local development, where the
   *  developer owns their own URL and no platform variable can second-guess it. */
  | { state: "ok" }
  /** A loopback URI on a hosted deployment. This one is a CERTAINTY, not a suspicion — no browser
   *  redirected to localhost from a deployed app reaches that app — so it is the one that blocks. */
  | { state: "local-in-production"; configured: string; deployment: string }
  /** A preview deployment. Its hostname carries a per-deployment hash, so it can never be one of
   *  the URIs registered on the Cloud project, and pointing it at production's URI would complete
   *  the flow against a different origin than the one holding the session cookie. */
  | { state: "preview"; configured: string; deployment: string }
  /** The host differs from the platform's production domain. WARNS RATHER THAN BLOCKS: a project
   *  may legitimately serve several custom domains and have OAuth registered on one of them, and
   *  refusing that would break a working studio to prevent a guess. */
  | { state: "host-differs"; configured: string; deployment: string };

/** May the connect flow start at all? `host-differs` is deliberately absent — it is shown and not
 *  enforced, for the multi-domain reason on the type above. */
export function redirectUriBlocks(verdict: RedirectVerdict): boolean {
  return verdict.state === "local-in-production" || verdict.state === "preview";
}

/** An entry from one of the designer's OWN Google calendars, flattened to the shape the dashboard
 *  grid already draws appointments in.
 *
 *  A CLOCK FACE, NOT AN INSTANT — the same decision as Appointment (lib/appointments/types.ts) and
 *  for the same reason: the calendar grid asks "which cell", and an instant lets a timezone move a
 *  17:00 meeting into the previous day's cell for anyone west of Jerusalem. lib/google/mapping.ts
 *  is where the conversion happens, once. */
export interface BusyBlock {
  /** Google's event id, prefixed — see `busyKey`. Only ever a React key here. */
  id: string;
  /** yyyy-mm-dd, in the studio's timezone. */
  date: string;
  /** HH:mm, absent when the entry is all-day. */
  time?: string;
  /** HH:mm, absent when the entry is all-day. */
  endTime?: string;
  /** The event's title, or a placeholder when Google returned none (a private entry on a shared
   *  calendar comes back with no summary at all). */
  title: string;
  /** Which of the designer's calendars it came from, for the tooltip. */
  calendarName: string;
}

/** The studio's timezone. ONE CONSTANT, NOT A SETTING, and that is a real decision rather than a
 *  shortcut: this product is Hebrew-first and sells to Israeli event designers (PRODUCT.md), the
 *  Hebrew calendar in lib/calendar/ is generated against Israeli holiday dates, and every existing
 *  date column already means "the day in the room where the event happens". A timezone setting
 *  would be a second source of truth for something the rest of the app has already decided.
 *
 *  It is exported rather than inlined so that the day a studio outside Israel signs up, `grep`
 *  finds every place that assumed this. */
export const STUDIO_TIMEZONE = "Asia/Jerusalem";

/** How far back and forward the pull looks by default, in months. Bounded on purpose: `events.list`
 *  with no window would drag a decade of a busy person's calendar across the wire to fill a grid
 *  showing one month. */
export const BUSY_WINDOW_BACK_MONTHS = 1;
export const BUSY_WINDOW_FORWARD_MONTHS = 3;

/** Namespaced so a Google id can never collide with an Appointment uuid in a keyed list — the two
 *  are rendered into the same day cell. */
export function busyKey(googleEventId: string, calendarId: string): string {
  return `g:${calendarId}:${googleEventId}`;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };

  assert(busyKey("abc", "primary").startsWith("g:"), "a google key is namespaced away from a uuid");
  assert(busyKey("a", "c1") !== busyKey("a", "c2"), "the same event id on two calendars is two keys");
  assert(STUDIO_TIMEZONE === "Asia/Jerusalem", "the studio clock is Israel's");

  console.log("google types self-check passed");
}
