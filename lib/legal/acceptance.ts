// The sign-up acceptance rule (EVE-9). Pure — `signUp` (lib/auth/actions.ts) asks it and writes what it
// answers onto the new user (`users.terms_version`, `users.terms_accepted_at`).
import type { LegalStatus } from "./status";

/** Claude Design board ב2's wording — the impersonal voice of the form's other errors. */
export const TERMS_REQUIRED = "כדי לפתוח חשבון יש לאשר את תנאי השימוש ואת מדיניות הפרטיות.";

export type TermsAcceptance = { error: string } | { version: string; at: Date } | null;

/**
 * While the texts are drafts nobody is asked to accept them: nothing is required and nothing is
 * stored, whatever the form sent. Once published the box must have been ticked — a literal `true`,
 * since the form posts whatever a browser the person owns makes it post.
 */
export function termsAcceptance(input: {
  status: LegalStatus;
  accepted: unknown;
  version: string;
  now: Date;
}): TermsAcceptance {
  if (input.status !== "published") return null;
  if (input.accepted !== true) return { error: TERMS_REQUIRED };
  return { version: input.version, at: input.now };
}
