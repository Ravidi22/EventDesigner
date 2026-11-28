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
import { appOrigin } from "@/lib/app-url";

export interface EmailConfig {
  apiKey: string;
  /** A bare address on the verified sending domain, e.g. noreply@eve.studio. The display name is
   *  added per message (the studio's name, or "Eve") — see fromHeader in send.ts. */
  fromAddress: string;
  /** Where the app answers, with no trailing slash: every link in a message starts here. */
  appUrl: string;
}

const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/**
 * The configuration, or null when email has not been set up for this deployment.
 *
 * Read per call, never cached, so that a deployment which adds the variables needs no code change,
 * and so that the check scripts — which run with none of them set — see the same null the app does.
 */
export function emailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.EMAIL_FROM?.trim().toLowerCase();
  const appUrl = appOrigin();
  if (!apiKey || !fromAddress || !ADDRESS.test(fromAddress) || !appUrl) return null;
  return { apiKey, fromAddress, appUrl };
}

/** For screens and actions that need the answer without the secrets. */
export function emailEnabled(): boolean {
  return emailConfig() !== null;
}
