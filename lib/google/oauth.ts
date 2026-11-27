// The OAuth 2.0 dance: send the designer to Google, take back a code, turn it into tokens.
//
// ⚠ SERVER ONLY. It handles the client secret and the refresh token.
//
// WHY A ROUTE HANDLER AND NOT A SERVER ACTION does the receiving: Google redirects a BROWSER back
// with the code in the query string. That is a GET navigation, and a server action is a POST that
// only React can dispatch — there is nothing for Google to redirect to. See
// app/api/google/callback/route.ts, which is deliberately the only route handler this feature adds.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { GOOGLE_SCOPES, requireGoogleConfig, type GoogleConfig } from "./config";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

/** How long a started connection has to finish. Long enough to read a consent screen carefully and
 *  pick between two Google accounts; short enough that a stale link in a browser history is dead. */
export const STATE_TTL_MS = 15 * 60 * 1000;

export interface GoogleTokens {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  /** ⚠ ABSENT on a re-consent Google decides is redundant — see `exchangeCode`. */
  refreshToken?: string;
}

// ── The `state` parameter ──────────────────────────────────────────────────────────────────────

/**
 * A signed, expiring `state`, bound to the user who started the flow.
 *
 * WHAT IT DEFENDS AGAINST, and it is not the obvious one. The textbook answer is CSRF, but the real
 * attack on an OAuth *connect* flow runs the other way: an attacker completes consent with THEIR
 * Google account, captures the resulting `code`, and gets a victim to load the callback URL. Without
 * a bound state the victim's account is now connected to the attacker's calendar — so the studio's
 * whole diary, client names and phone numbers included, is pushed to a stranger's phone.
 *
 * Binding the userId into the signature closes it: the callback checks that the state it was handed
 * was minted for the user whose session cookie is on the request, and refuses when they differ.
 *
 * SIGNED RATHER THAN STORED — no table, no cleanup job, no row left behind by every abandoned
 * connect. The key is the one already required for token sealing, used through HMAC here rather
 * than as a cipher; the payload is not secret, only unforgeable.
 */
export function signState(userId: string, config: GoogleConfig, now: number = Date.now()): string {
  const payload = JSON.stringify({ u: userId, e: now + STATE_TTL_MS, n: randomBytes(8).toString("base64url") });
  const body = Buffer.from(payload, "utf8").toString("base64url");
  return `${body}.${hmac(body, config)}`;
}

/** The userId the state was minted for, or null when it is forged, tampered with, or expired. */
export function readState(state: string, config: GoogleConfig, now: number = Date.now()): string | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = state.slice(0, dot);
  const signature = state.slice(dot + 1);

  // Constant-time, so the comparison does not leak how much of a forged signature was correct.
  const expected = Buffer.from(hmac(body, config), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (expected.byteLength !== given.byteLength || !timingSafeEqual(expected, given)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: unknown; e?: unknown };
    if (typeof parsed.u !== "string" || typeof parsed.e !== "number") return null;
    // Checked AFTER the signature: an expiry read out of an unverified payload is a number the
    // attacker chose.
    if (parsed.e < now) return null;
    return parsed.u;
  } catch {
    return null;
  }
}

function hmac(body: string, config: GoogleConfig): string {
  return createHmac("sha256", config.tokenKey).update(body).digest("base64url");
}

// ── The three calls ────────────────────────────────────────────────────────────────────────────

/**
 * Where to send the browser to begin.
 *
 * `access_type=offline` is what asks for a REFRESH token at all — without it the app gets an hour of
 * access and then silently stops working, which is the single most common way this integration is
 * built wrong.
 *
 * `prompt=consent` forces the consent screen even for an account that has already granted these
 * scopes. That is deliberate and it costs a click: Google issues a refresh token only on a FIRST
 * consent, so a designer who disconnects and reconnects — or who was connected before a wipe —
 * would otherwise come back through this flow and receive an access token with no refresh token
 * behind it. Reconnecting has to be the thing that fixes a broken connection, not a way to create a
 * subtler one.
 */
export function authorizationUrl(state: string, config: GoogleConfig = requireGoogleConfig()): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * The authorization code, exchanged for tokens.
 *
 * ⚠ `refreshToken` MAY BE ABSENT even here. `prompt=consent` above makes that unlikely rather than
 * impossible, and the caller must treat a missing one as a failed connection rather than storing a
 * row that works for an hour — see `connectGoogle` in ./actions.ts.
 */
export async function exchangeCode(code: string, config: GoogleConfig = requireGoogleConfig()): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    // Never cached: this is a one-time code and a token response.
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !body?.access_token) {
    throw new Error(`google token exchange failed: ${body?.error_description ?? body?.error ?? response.status}`);
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: expiryFrom(body.expires_in),
  };
}

/** A fresh access token from the stored refresh token. */
export async function refreshAccessToken(
  refreshToken: string,
  config: GoogleConfig = requireGoogleConfig(),
): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !body?.access_token) {
    // `invalid_grant` is the one worth recognising by name: it means the designer revoked access in
    // their Google account, or the token went unused past Google's inactivity window. It is not
    // retryable and the only cure is reconnecting, which is what the caller tells them.
    const reason = body?.error === "invalid_grant" ? "invalid_grant" : (body?.error_description ?? body?.error ?? response.status);
    throw new Error(`google token refresh failed: ${reason}`);
  }

  return { accessToken: body.access_token, expiresAt: expiryFrom(body.expires_in) };
}

/** Which account consented. Used once, at connect time, so settings can name it. */
export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return "";
  const body = (await response.json().catch(() => null)) as { email?: string } | null;
  return body?.email ?? "";
}

/** Sixty seconds of slack, so a token that expires mid-request is treated as already expired rather
 *  than sent and rejected. `expires_in` is nominally always present; the fallback is the documented
 *  one-hour default. */
function expiryFrom(expiresIn: number | undefined): number {
  const seconds = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 3600;
  return Date.now() + (seconds - 60) * 1000;
}

/** Is this the error that means "the designer revoked us"? The push path turns it into a Hebrew
 *  line in settings rather than a retry that can never succeed. */
export function isRevoked(error: unknown): boolean {
  return error instanceof Error && error.message.includes("invalid_grant");
}
