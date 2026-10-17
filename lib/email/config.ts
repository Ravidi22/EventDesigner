// Whether email is configured at all, and with what.
//
// THE SAME SEAM SHAPE AS lib/google/config.ts: the feature is built and it is OFF until every
// variable exists. Nothing above this file learns which state it is in — a screen asks
// `emailEnabled()` and either offers "send by email" or does not. No half-built branch.
//
// THREE VARIABLES, NOT TWO. Besides the Resend key and the sender, a message that carries a link
// (a password reset, an invitation, an email verification) needs the address the app answers on,
// and that address must NOT be built from the request. A reset link minted from the incoming Host
// header is the textbook "password reset poisoning" hole: an attacker requests a reset for the
// victim with their own Host, and the victim receives a genuine email whose link hands the token to
// the attacker's server. So the origin is configured, like GOOGLE_REDIRECT_URI, and never derived.
//
// ⚠ SERVER ONLY. RESEND_API_KEY sends mail as the studio's domain; it must never become NEXT_PUBLIC_.
import { isMain } from "@/lib/self-check";

export interface EmailConfig {
  apiKey: string;
  /** A bare address on the verified sending domain, e.g. noreply@eve.studio. The display name is
   *  added per message (the studio's name, or "Eve") — see fromHeader in send.ts. */
  fromAddress: string;
  /** Where the app answers, with no trailing slash: every link in a message starts here. */
  appUrl: string;
}

const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** The origin of APP_URL, or null when it is not an absolute http(s) URL. Origin only: a path or a
 *  trailing slash in the variable would otherwise double up in every link built on it. */
function readOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The configuration, or null when email has not been set up for this deployment.
 *
 * Read per call, never cached, so that a deployment which adds the variables needs no code change,
 * and so that the check scripts — which run with none of them set — see the same null the app does.
 */
export function emailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.EMAIL_FROM?.trim().toLowerCase();
  const appUrl = readOrigin(process.env.APP_URL);
  if (!apiKey || !fromAddress || !ADDRESS.test(fromAddress) || !appUrl) return null;
  return { apiKey, fromAddress, appUrl };
}

/** For screens and actions that need the answer without the secrets. */
export function emailEnabled(): boolean {
  return emailConfig() !== null;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const saved = { ...process.env };
  const set = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };

  set({ RESEND_API_KEY: undefined, EMAIL_FROM: undefined, APP_URL: undefined });
  assert(emailConfig() === null, "nothing set means off");

  set({ RESEND_API_KEY: "re_x", EMAIL_FROM: "noreply@eve.studio" });
  assert(emailConfig() === null, "two of three is still off: a link with no origin cannot be sent");

  set({ APP_URL: "https://eve.studio/" });
  const on = emailConfig();
  assert(on !== null, "all three is on");
  assert(on!.appUrl === "https://eve.studio", "the trailing slash is dropped");

  set({ APP_URL: "https://eve.studio/app/" });
  assert(emailConfig()!.appUrl === "https://eve.studio", "a path is dropped too: links are built from the origin");

  set({ APP_URL: "eve.studio" });
  assert(emailConfig() === null, "an origin with no scheme is refused, not guessed");

  set({ APP_URL: "javascript:alert(1)" });
  assert(emailConfig() === null, "only http(s)");

  set({ APP_URL: "https://eve.studio", EMAIL_FROM: "Eve <noreply@eve.studio>" });
  assert(emailConfig() === null, "EMAIL_FROM is a bare address; the display name is added per message");

  set({ EMAIL_FROM: "  NoReply@Eve.Studio " });
  assert(emailConfig()!.fromAddress === "noreply@eve.studio", "the sender is trimmed and lowercased");

  process.env = saved;
  console.log("email config self-check passed");
}
