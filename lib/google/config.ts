// Whether Google Calendar is configured at all, and with what.
//
// THE SAME SEAM SHAPE AS lib/files/driver.ts, for the same reason: the feature is built, and it is
// OFF until four environment variables exist. Nothing above this file learns which state it is in —
// the settings screen asks `googleConfig() !== null` and shows either a connect button or a line
// explaining that the studio has not set it up. No half-built branch, no dead screen.
//
// ALL FOUR OR NOTHING, and this one matters more than R2's five. A client id without its secret
// produces an OAuth redirect that sends the designer to Google, gets consent, and then fails on the
// token exchange — after the consent screen has already been granted. That is the worst possible
// place to fail: the user has done the work and the app has nothing to show for it.
//
// ⚠ SERVER ONLY. It reads secrets. None of these may ever become NEXT_PUBLIC_ — the client secret
// and the token key are the two values that make the stored refresh tokens worth stealing.
import { type RedirectVerdict } from "./types";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** Where Google sends the browser back. Must match a redirect URI registered on the Cloud
   *  project EXACTLY — scheme, host, port and path, no trailing slash.
   *
   *  EXPLICIT RATHER THAN DERIVED FROM THE REQUEST. Building it from the incoming Host header would
   *  save a variable and introduce a real hole: Host is attacker-controlled, so a request forged
   *  with someone else's host would mint an authorization URL that returns the code to them. */
  redirectUri: string;
  /** 32 bytes, base64, for AES-256-GCM over the stored refresh token. See lib/google/secret-box.ts
   *  for why a refresh token is not stored in plaintext even inside our own database. */
  tokenKey: Buffer;
}

/**
 * The scopes asked for at consent — the narrowest pair that does the job.
 *
 * `calendar.app.created` — create and manage calendars THIS APP created, and nothing else. The push
 *   direction never touches the designer's primary calendar, so it never asks for the right to. If
 *   the connection is later revoked or the app misbehaves, the blast radius is one calendar the
 *   designer can delete in a click.
 *
 * `calendar.readonly` — read the designer's own calendars, for the busy blocks. This is the broader
 *   of the two and the one that makes the app "sensitive" for Google's verification purposes.
 *
 *   ⚠ THE NARROWER ALTERNATIVE, deliberately not taken: `calendar.freebusy` returns busy INTERVALS
 *   with no titles, which is enough to grey out a day and not enough to answer "busy with what?".
 *   A designer looking at their own diary wants to see "רופא שיניים", not an anonymous grey bar —
 *   the privacy that would buy is privacy from themselves. If a studio ever objects to the broader
 *   scope, freebusy is a drop-in for the pull half: lib/google/mapping.ts is the only file that
 *   would change, and BusyBlock.title is the only field that would go empty.
 *
 * ⚠ IF GOOGLE REFUSES `calendars.insert` UNDER app.created, widen this to the full
 * `https://www.googleapis.com/auth/calendar` scope and re-consent. Scope behaviour is Google's to
 * change, and this constant is the one place it is written down.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.readonly",
  // Identifies WHICH account was connected, so settings can show it. Cheap, non-sensitive, and the
  // difference between "Google is connected" and "connected as the business account".
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

/** 32 bytes is AES-256's key length; anything else is a configuration error worth failing loudly on
 *  rather than padding into something that decrypts nothing. */
export const KEY_BYTES = 32;

function readKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  // Node's base64 decoding is permissive — it drops invalid characters rather than throwing, so a
  // truncated or hand-mangled value silently becomes a short key. The length check is what catches
  // that, and it is why this returns null instead of a Buffer of whatever fell out.
  const key = Buffer.from(raw, "base64");
  return key.byteLength === KEY_BYTES ? key : null;
}

/**
 * The configuration, or null when Google Calendar has not been set up for this deployment.
 *
 * NOT CACHED IN A MODULE CONSTANT. `process.env` is read per call so that a deployment which adds
 * the variables does not need a code change to notice, and so that the check scripts — which import
 * this module with none of them set — see the same null the app would.
 */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const tokenKey = readKey(process.env.GOOGLE_TOKEN_KEY);

  if (!clientId || !clientSecret || !redirectUri || !tokenKey) return null;
  return { clientId, clientSecret, redirectUri, tokenKey };
}

/** For screens and actions that need the answer without the secrets. */
export function isGoogleConfigured(): boolean {
  return googleConfig() !== null;
}

/** The configuration or a thrown error — for code paths that only run once a connection exists,
 *  where a null config means the variables were removed out from under live rows. */
export function requireGoogleConfig(): GoogleConfig {
  const config = googleConfig();
  if (!config) throw new Error("Google Calendar is not configured on this deployment");
  return config;
}

// ── Does the configured redirect URI match the deployment it is running on? ─────────────────────

/**
 * Where this deployment actually answers, according to the PLATFORM — never according to the request.
 *
 * ⚠ THE DISTINCTION THAT MAKES THIS SAFE, and it is the same one `GoogleConfig.redirectUri` is
 * documented against. Building a redirect URI out of the incoming `Host` header would be a real
 * hole: Host is attacker-controlled, so a forged request would mint an authorization URL that
 * returns the code somewhere else. These variables are different in kind — Vercel injects them into
 * the runtime, so they describe where the deployment lives without asking the caller. That makes
 * them safe to CHECK AGAINST, and checking is all they are used for: the `redirect_uri` sent to
 * Google is still the configured one, verbatim, exactly as before.
 */
function deploymentHost(): { host: string; env: string } | null {
  // Unset off-platform. Local `next dev` therefore returns null and every verdict below is "ok",
  // which is right: on a developer's machine the configured URI is the only thing that knows where
  // the app is answering.
  if (!process.env.VERCEL) return null;
  const env = process.env.VERCEL_ENV ?? "production";
  // Prefers a custom domain when the project has one; falls back to the deployment URL.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return host ? { host, env } : null;
}

/** True for the hostnames that only ever mean "this same machine". */
function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * The verdict on `GOOGLE_REDIRECT_URI` for the deployment currently running.
 *
 * WHY THIS EXISTS. The redirect URI is the one piece of Google's configuration that is correct in
 * development and wrong in production by default, and it fails at the worst moment available: the
 * designer clicks חבר, reads the consent screen, presses אישור — and Google then redirects their
 * browser to `http://localhost:3000`, which on their machine is either nothing at all or their own
 * dev server holding a session that did not start this flow. Consent has been granted, an
 * authorization code has been handed to whatever is listening on their loopback, and the app has
 * nothing to show for it. Every part of that is invisible from the server, so nothing here would
 * ever record that it happened.
 *
 * So the check happens BEFORE the browser leaves for Google, and it is the reason `startGoogleConnect`
 * can refuse.
 */
export function checkRedirectUri(config: GoogleConfig): RedirectVerdict {
  const deployment = deploymentHost();
  if (!deployment) return { state: "ok" };

  let configured: URL;
  try {
    configured = new URL(config.redirectUri);
  } catch {
    // An unparseable URI cannot match anything and cannot be sent to Google either. Reported as the
    // blocking kind, because that is what it is.
    return { state: "local-in-production", configured: config.redirectUri, deployment: deployment.host };
  }

  const found = { configured: configured.origin, deployment: deployment.host };

  if (isLoopback(configured.hostname)) return { state: "local-in-production", ...found };
  if (deployment.env === "preview") return { state: "preview", ...found };
  if (configured.host !== deployment.host) return { state: "host-differs", ...found };
  return { state: "ok" };
}
