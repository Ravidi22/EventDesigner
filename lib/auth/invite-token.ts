// The secret behind an invitation link.
//
// ⚠ SERVER ONLY. Imports node:crypto, and mints credentials.
//
// An invite link is a credential: whoever holds it becomes a member of the studio. So it is treated
// like the session cookie rather than like an id — 256 bits from the CSPRNG, and the DATABASE only
// ever stores a SHA-256 of it. The consequences of that choice, both intended:
//
//   1. A leaked database dump cannot be replayed into an account.
//   2. The link exists in readable form exactly once, in the response that created it. It cannot be
//      looked up again, which is why the team screen offers "generate a new link" rather than
//      "show me the link again" — the second is not implementable, and a UI that implied otherwise
//      would be lying about where the secret lives.
//
// Not a "use server" module: those may export only async functions, and these are synchronous.
import { createHash, randomBytes } from "node:crypto";

/** How long an invitation stays claimable. Long enough for someone on holiday, short enough that a
 *  forgotten invite stops blocking its own address from signing up (see the schema note). */
const TTL_DAYS = 14;

export interface MintedInvite {
  /** Show this once, then forget it. It is the only readable copy. */
  token: string;
  /** What the row stores. */
  tokenHash: string;
  expiresAt: Date;
}

export function mintInviteToken(): MintedInvite {
  // base64url so it survives a URL path segment, a WhatsApp message and a copy-paste without
  // escaping — this string is going to be pasted by hand more often than not.
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The link a designer copies. Relative on purpose — the app does not know its own public hostname
 *  until it is deployed, and an env var that is wrong in development would produce links that look
 *  right and go nowhere. The screen prepends `window.location.origin`, which is always correct for
 *  whoever is looking at it. */
export function invitePath(token: string): string {
  return `/join/${token}`;
}
