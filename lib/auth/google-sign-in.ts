// "המשך עם Google" on the sign-in screen: Google says which address this person owns, and the
// account with that address is signed in.
//
// ⚠ SERVER ONLY. It handles the client secret.
//
// NOT THE CALENDAR CONNECTION, though it borrows its Cloud project and its token exchange.
// lib/google/ connects a calendar to someone ALREADY signed in, asks for calendar scopes, and keeps
// a refresh token. This asks for an identity and keeps nothing: one access token, used once to read
// an email address, then dropped. So it has its own scopes and its own `state`.
//
// IT RETURNS TO THE CALENDAR'S CALLBACK, deliberately. Google only sends a browser back to a URI
// registered on the Cloud project in advance, and a second URI for this flow was a second thing to
// register on every deployment — forgotten once already, where it surfaced as Google's own
// redirect_uri_mismatch page with nothing here to explain it. So both flows come home through
// GOOGLE_REDIRECT_URI, and app/api/google/callback tells them apart by the state's prefix.
//
// IT SIGNS IN; IT NEVER SIGNS UP. An address with no account is sent back to the form with a line
// saying so — opening a studio needs a business name and a kind, which Google does not know.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { GoogleConfig } from "@/lib/google/config";
import { isMain } from "@/lib/self-check";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

/** Identity only. Neither is a "sensitive" scope, so this half needs no verification from Google. */
const SIGN_IN_SCOPES = ["openid", "email"] as const;

/** What marks a `state` as this flow's. ":" cannot occur in the calendar's base64url states. */
const STATE_PREFIX = "signin:";
/** The browser's half of the `state` — see signSignInState. */
export const SIGN_IN_NONCE_COOKIE = "eve_google_signin";
/** Long enough to pick between two Google accounts; short enough that a stale tab is dead. */
export const SIGN_IN_TTL_MS = 10 * 60 * 1000;

/** The nonce cookie rides only the one request it is for: the callback's own path. */
export function signInCookiePath(config: GoogleConfig): string {
  return new URL(config.redirectUri).pathname;
}

/** Is this the sign-in flow coming home, rather than a calendar connection? Read off the prefix
 *  BEFORE anything is verified, so an expired or forged sign-in state is still answered as a failed
 *  sign-in and not as a calendar connection attempted by someone signed out. */
export function isSignInState(state: string): boolean {
  return state.startsWith(STATE_PREFIX);
}

/**
 * Only ever a PATH on this site. `?next=https://elsewhere` and `//elsewhere` must not turn a
 * sign-in into a redirect off it — the same rule the password form applies.
 */
export function safeNext(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : null;
}

export interface SignInState {
  /** Must equal the nonce cookie on the browser that comes back. */
  nonce: string;
  /** "זכור אותי", as it stood when the button was pressed. */
  remember: boolean;
  /** Where the guard sent them from, if anywhere. */
  next: string | null;
}

/**
 * A signed, expiring `state`, bound to the BROWSER that started the flow.
 *
 * The calendar's state is bound to a user id; here there is no user yet, so it is bound to a nonce
 * that also sits in an httpOnly cookie. What that stops is sign-in CSRF: an attacker finishes
 * consent with THEIR Google account and gets a designer to load the resulting callback URL, after
 * which the designer is working — and typing clients and prices — inside the attacker's studio. The
 * attacker's state carries the attacker's nonce, and the designer's browser does not have it.
 *
 * The "signin:" prefix keeps the two flows apart under the one key: a calendar state can never be
 * replayed here, nor this one there.
 */
export function signSignInState(
  input: { remember: boolean; next: string | null },
  config: GoogleConfig,
  now: number = Date.now(),
): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const payload = JSON.stringify({ n: nonce, e: now + SIGN_IN_TTL_MS, r: input.remember, p: input.next });
  const body = Buffer.from(payload, "utf8").toString("base64url");
  return { state: `${STATE_PREFIX}${body}.${hmac(body, config)}`, nonce };
}

/** What the state carried, or null when it is forged, tampered with, or expired. The caller still
 *  has to compare `nonce` with the cookie — this only proves WE minted it. */
export function readSignInState(prefixed: string, config: GoogleConfig, now: number = Date.now()): SignInState | null {
  if (!isSignInState(prefixed)) return null;
  const state = prefixed.slice(STATE_PREFIX.length);
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = state.slice(0, dot);
  const expected = Buffer.from(hmac(body, config), "utf8");
  const given = Buffer.from(state.slice(dot + 1), "utf8");
  if (expected.byteLength !== given.byteLength || !timingSafeEqual(expected, given)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      n?: unknown;
      e?: unknown;
      r?: unknown;
      p?: unknown;
    };
    if (typeof parsed.n !== "string" || !parsed.n || typeof parsed.e !== "number") return null;
    if (parsed.e < now) return null;
    return { nonce: parsed.n, remember: parsed.r === true, next: safeNext(parsed.p) };
  } catch {
    return null;
  }
}

/** Constant-time, like the signature: the nonce is the secret half of the pair. */
export function nonceMatches(state: SignInState, cookie: string | undefined): boolean {
  if (!cookie) return false;
  const a = Buffer.from(state.nonce, "utf8");
  const b = Buffer.from(cookie, "utf8");
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

function hmac(body: string, config: GoogleConfig): string {
  return createHmac("sha256", config.tokenKey).update(`signin:${body}`).digest("base64url");
}

/**
 * Where to send the browser to begin.
 *
 * `prompt=select_account` and not the calendar's `consent`: there is no refresh token to win here,
 * and a designer with a private and a business Google account must be ASKED which one — Google
 * otherwise picks silently, and the wrong pick ends on "no such account" with no way to choose again.
 */
export function signInUrl(state: string, config: GoogleConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SIGN_IN_SCOPES.join(" "),
    prompt: "select_account",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * The address Google vouches for, or null.
 *
 * ⚠ `email_verified` IS THE WHOLE CHECK. This flow signs someone into whichever account carries the
 * address, so an address Google has not confirmed the person controls is a way into a stranger's
 * studio. Anything but a literal true is a no.
 */
export async function fetchVerifiedGoogleEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return verifiedEmail(await response.json().catch(() => null));
}

/** Lowercased, because that is how accounts are stored — see normalizeEmail in ./actions.ts. */
export function verifiedEmail(body: unknown): string | null {
  const info = body as { email?: unknown; email_verified?: unknown } | null;
  if (!info || info.email_verified !== true || typeof info.email !== "string") return null;
  return info.email.trim().toLowerCase() || null;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };

  const config: GoogleConfig = {
    clientId: "id",
    clientSecret: "secret",
    redirectUri: "https://studio.example/api/google/callback",
    tokenKey: Buffer.alloc(32, 3),
  };
  const otherKey: GoogleConfig = { ...config, tokenKey: Buffer.alloc(32, 9) };

  assert(signInCookiePath(config) === "/api/google/callback", "the nonce is scoped to the callback's own path");

  const { state, nonce } = signSignInState({ remember: true, next: "/catalog?q=1" }, config);
  const read = readSignInState(state, config);
  assert(read !== null && read.nonce === nonce, "a state round-trips its nonce");
  assert(read!.remember === true && read!.next === "/catalog?q=1", "and what the form asked for");
  assert(readSignInState(state, otherKey) === null, "a state signed with another key is refused");
  assert(readSignInState(state + "x", config) === null, "a tampered signature is refused");
  assert(readSignInState("nonsense", config) === null, "a malformed state is refused");
  assert(readSignInState("", config) === null, "an empty state is refused");
  assert(isSignInState(state), "a sign-in state says so on its face");
  assert(!isSignInState(state.slice("signin:".length)), "and a calendar-shaped one does not");
  assert(isSignInState(state + "x") && readSignInState(state + "x", config) === null, "a bad one is still THIS flow's failure");

  assert(nonceMatches(read!, nonce), "the browser that started the flow finishes it");
  assert(!nonceMatches(read!, undefined), "a browser with no cookie does not");
  const attacker = signSignInState({ remember: false, next: null }, config);
  assert(!nonceMatches(readSignInState(attacker.state, config)!, nonce), "nor does someone else's state");

  // The two flows share a key and must not share states: the prefix alone is not what tells them
  // apart to the HMAC.
  const calendarStyle = (() => {
    const body = Buffer.from(JSON.stringify({ n: "x", e: Date.now() + 1e6, r: true, p: null }), "utf8").toString("base64url");
    return `signin:${body}.${createHmac("sha256", config.tokenKey).update(body).digest("base64url")}`;
  })();
  assert(readSignInState(calendarStyle, config) === null, "a state signed without the flow prefix is refused");

  const past = Date.now() - SIGN_IN_TTL_MS - 1000;
  const old = signSignInState({ remember: false, next: null }, config, past);
  assert(readSignInState(old.state, config) === null, "an expired state is refused");
  assert(readSignInState(old.state, config, past + 1000) !== null, "and was valid at the time");

  const off = signSignInState({ remember: false, next: "https://elsewhere.example" }, config);
  assert(readSignInState(off.state, config)!.next === null, "a next that leaves the site is dropped");
  assert(safeNext("//elsewhere.example") === null, "a protocol-relative next is not a path");
  assert(safeNext("/\\elsewhere.example") === null, "nor is the backslash spelling of one");
  assert(safeNext("/dashboard") === "/dashboard", "a path is a path");

  const url = new URL(signInUrl(state, config));
  assert(url.searchParams.get("redirect_uri") === config.redirectUri, "the redirect is the registered one, verbatim");
  assert(url.searchParams.get("scope") === "openid email", "identity only — no calendar scope is asked for");
  assert(url.searchParams.get("access_type") === null, "and no offline access: nothing is kept");
  assert(url.searchParams.get("prompt") === "select_account", "the person chooses which Google account");
  assert(url.searchParams.get("state") === state, "the state travels");

  assert(verifiedEmail({ email: "Noa@Studio.co.il", email_verified: true }) === "noa@studio.co.il", "lowercased");
  assert(verifiedEmail({ email: "noa@studio.co.il", email_verified: false }) === null, "unverified is a no");
  assert(verifiedEmail({ email: "noa@studio.co.il", email_verified: "true" }) === null, "only a literal true");
  assert(verifiedEmail({ email: "noa@studio.co.il" }) === null, "absent is a no");
  assert(verifiedEmail(null) === null, "no body is a no");

  console.log("google sign-in self-check passed");
}
