"use server";
// Google Calendar, as the screens reach it. Thin on purpose — the work is in ./sync.ts, which is a
// plain module precisely so that "push this into every connected calendar" is NOT a public POST
// endpoint. Same split as lib/db/revalidate.ts.
//
// Every export here starts with currentActor(), because this is the one feature in the app where
// currentOrg() is not enough: the diary is the studio's, but a Google account is a PERSON's. The
// push reads the whole studio's connections; the pull, the settings screen and the connect flow all
// read the acting user's and no one else's.
//
// User-correctable failures return `{ error }`; authorization failures throw. Next redacts thrown
// messages in production, and "התחבר מחדש" is not something to redact.
import { afterResponse } from "@/lib/after";
import { currentActor } from "@/lib/db/org";
import { revalidateAppointments, revalidateSettings } from "@/lib/db/revalidate";
import { checkRedirectUri, googleConfig } from "./config";
import { authorizationUrl, signState } from "./oauth";
import { busyBlocks, connectionFor, disconnect, pushAllAppointments, setDirections } from "./sync";
import { redirectUriBlocks, type BusyBlock, type GoogleConnection, type RedirectVerdict } from "./types";

/** What the settings screen renders from. `configured` and `connection` are two different noes: one
 *  is "this deployment has no Google credentials", the other is "you have not connected yet", and
 *  showing a connect button for the first would be a button that cannot work. */
export interface GoogleStatus {
  configured: boolean;
  connection: GoogleConnection | null;
  /** Whether GOOGLE_REDIRECT_URI can work from the deployment this is running on. A THIRD kind of
   *  no, and the one that used to be invisible: the credentials are all present, so `configured` is
   *  true and the connect button renders — and consent then redirects the designer somewhere this
   *  app is not. See checkRedirectUri in ./config.ts. `{ state: "ok" }` when unconfigured, so the
   *  screen has one thing to say at a time. */
  redirect: RedirectVerdict;
}

export async function fetchGoogleStatus(): Promise<GoogleStatus> {
  const { userId, organizationId } = await currentActor();
  const config = googleConfig();
  const configured = config !== null;
  const redirect: RedirectVerdict = config ? checkRedirectUri(config) : { state: "ok" };
  if (!configured || !userId) return { configured, connection: null, redirect };

  const row = await connectionFor(userId, organizationId);
  if (!row) return { configured, connection: null, redirect };

  return {
    configured,
    redirect,
    connection: {
      email: row.googleEmail,
      calendarName: row.calendarName,
      pushEnabled: row.pushEnabled,
      pullEnabled: row.pullEnabled,
      lastPushAt: row.lastPushAt?.getTime(),
      lastError: row.lastError ?? undefined,
    },
  };
}

/**
 * Where to send the browser to begin consent.
 *
 * RETURNS THE URL RATHER THAN REDIRECTING. A server action that called redirect() would send the
 * fetch layer to accounts.google.com, not the top-level window — the browser would follow it inside
 * the action's own POST and hand back an HTML consent page as an action result. The client sets
 * window.location itself.
 */
export async function startGoogleConnect(): Promise<{ url: string } | { error: string }> {
  const { userId } = await currentActor();
  const config = googleConfig();
  if (!config) return { error: "Google Calendar לא מוגדר בשרת." };
  if (!userId) return { error: "אין משתמש מחובר." };

  // ⚠ REFUSED BEFORE THE BROWSER LEAVES, and that is the whole point of the check. A redirect URI
  // this deployment cannot be reached at does not fail here — it fails after the designer has read
  // Google's consent screen and pressed אישור, on a page this app never sees. Asking for consent we
  // already know we cannot collect is worse than not offering the button.
  const verdict = checkRedirectUri(config);
  if (redirectUriBlocks(verdict)) return { error: redirectError(verdict) };

  return { url: authorizationUrl(signState(userId, config), config) };
}

/** The blocking verdicts, in Hebrew, each naming the thing to change rather than reporting a state.
 *  A designer is not the person who fixes either of these — but they are the person who has to know
 *  why the button did nothing, and "נסה שוב" would send them around the same loop. */
function redirectError(verdict: RedirectVerdict): string {
  if (verdict.state === "preview") {
    return "חיבור ל-Google Calendar אינו זמין בפריסת תצוגה מקדימה. יש להתחבר מהכתובת הראשית של המערכת.";
  }
  if (verdict.state === "local-in-production") {
    return "כתובת החזרה של Google מוגדרת לכתובת מקומית, והמערכת רצה על שרת. יש לעדכן את GOOGLE_REDIRECT_URI ולרשום את הכתובת בפרויקט ב-Google Cloud.";
  }
  return "לא ניתן להתחיל את החיבור ל-Google.";
}

export async function disconnectGoogle(): Promise<GoogleStatus> {
  const { userId, organizationId } = await currentActor();
  if (userId) await disconnect(userId, organizationId);
  revalidateSettings();
  revalidateAppointments();
  return fetchGoogleStatus();
}

/** Switch the two directions. Both are booleans from a client component, so both are checked. */
export async function setGoogleDirections(push: boolean, pull: boolean): Promise<GoogleStatus> {
  if (typeof push !== "boolean" || typeof pull !== "boolean") throw new Error("directions must be booleans");
  const { userId, organizationId } = await currentActor();
  if (!userId) throw new Error("not signed in");

  await setDirections(userId, organizationId, push, pull);
  revalidateSettings();
  revalidateAppointments();

  // Turning push back on after it was off leaves the calendar behind by however many meetings
  // changed meanwhile. Catching up is the whole point of the switch, and deferring keeps the click
  // instant — the settings screen has already re-rendered by the time this runs.
  if (push) afterResponse(() => pushAllAppointments(organizationId));
  return fetchGoogleStatus();
}

/**
 * Push the whole diary now — the "סנכרן עכשיו" button.
 *
 * AWAITED, unlike every other push in this feature. Everywhere else the push is a side effect of
 * saving a meeting and belongs in afterResponse(); here it IS the thing the designer asked for, and a
 * button that returns before doing the work has no result to report. This is also the one path that
 * surfaces a count, which is what makes "did it work" answerable.
 */
export async function syncGoogleNow(): Promise<{ pushed: number; failed: number } | { error: string }> {
  const { userId, organizationId } = await currentActor();
  if (!googleConfig()) return { error: "Google Calendar לא מוגדר בשרת." };
  if (!userId) return { error: "אין משתמש מחובר." };

  const connection = await connectionFor(userId, organizationId);
  if (!connection) return { error: "אין חיבור ל-Google." };

  const result = await pushAllAppointments(organizationId);
  revalidateSettings();
  return result;
}

/**
 * The signed-in designer's own Google entries as busy blocks, for a window the calendar is showing.
 *
 * The window is validated but generous — the dashboard asks for whatever month the designer
 * navigated to, and there is nothing sensitive about a date range. What it must not be is unbounded
 * or malformed, since it goes into a URL sent to Google.
 */
export async function fetchGoogleBusy(fromISO: string, toISO: string): Promise<BusyBlock[]> {
  const { userId, organizationId } = await currentActor();
  if (!userId) return [];

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!ISO_DATE.test(fromISO) || !ISO_DATE.test(toISO)) throw new Error("window must be yyyy-mm-dd");
  if (fromISO > toISO) throw new Error("window runs backwards");

  return busyBlocks(userId, organizationId, fromISO, toISO);
}
