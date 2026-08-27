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
import { isMain } from "@/lib/self-check";

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
const KEY_BYTES = 32;

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

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };

  const saved = { ...process.env };
  const set = (vars: Record<string, string | undefined>) => {
    for (const [k, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[k];
      else process.env[k] = value;
    }
  };

  set({
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    GOOGLE_REDIRECT_URI: undefined,
    GOOGLE_TOKEN_KEY: undefined,
  });
  assert(googleConfig() === null, "nothing set means not configured");

  const key = Buffer.alloc(KEY_BYTES, 7).toString("base64");
  set({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REDIRECT_URI: "https://x/cb" });
  assert(googleConfig() === null, "three of four is still not configured — partial is the worst case");

  set({ GOOGLE_TOKEN_KEY: key });
  assert(googleConfig() !== null, "all four is configured");
  assert(googleConfig()!.tokenKey.byteLength === KEY_BYTES, "the key decodes to 32 bytes");

  set({ GOOGLE_TOKEN_KEY: Buffer.alloc(16, 7).toString("base64") });
  assert(googleConfig() === null, "a 16-byte key is refused rather than stretched");

  set({ GOOGLE_TOKEN_KEY: "!!!!" });
  assert(googleConfig() === null, "a mangled key is refused, not silently truncated");

  set({ GOOGLE_TOKEN_KEY: key });
  let threw = false;
  try {
    requireGoogleConfig();
  } catch {
    threw = true;
  }
  assert(!threw, "requireGoogleConfig passes when configured");

  set({ GOOGLE_CLIENT_ID: undefined });
  threw = false;
  try {
    requireGoogleConfig();
  } catch {
    threw = true;
  }
  assert(threw, "requireGoogleConfig throws when the variables vanish under live rows");

  assert(
    GOOGLE_SCOPES.includes("https://www.googleapis.com/auth/calendar.app.created"),
    "the push scope is the narrow one",
  );
  // Cast to string[] because the literal union already proves this — the assertion is here so the
  // rule survives someone widening the array later, when the type would stop proving it.
  assert(
    !(GOOGLE_SCOPES as readonly string[]).includes("https://www.googleapis.com/auth/calendar"),
    "the full calendar scope is NOT requested",
  );

  process.env = saved;
  console.log("google config self-check passed");
}
