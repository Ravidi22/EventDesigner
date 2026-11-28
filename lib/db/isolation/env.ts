// Imported FIRST by lib/db/verify-isolation.ts: the run reaches no outside service. No mail is sent, no
// bucket or calendar is touched — files go to the local driver's folder, and every vendor seam reads
// "not configured". The database is the one given in DATABASE_URL, and the runner refuses anything
// that is not this machine — CI's service container is localhost too. Nothing in the environment
// switches that off: CI=true used to, and one workflow that read DATABASE_URL from a secret would have
// run this against a real database (PR #2 review).
for (const key of [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_JURISDICTION",
  "NEXT_PUBLIC_R2_PUBLIC_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_TOKEN_KEY",
]) {
  delete process.env[key];
}
process.env.BETTER_AUTH_SECRET ??= "isolation-test-only-not-a-secret-0123456789";

export const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

/** Why this database must not be used, or null. `ci` is only for the message: it allows nothing. */
export function refusal(url: string | undefined, ci: boolean): string | null {
  if (!url) return "DATABASE_URL is not set — point it at a local Postgres (see the script's header).";
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return "DATABASE_URL is not a URL.";
  }
  if (LOCAL_HOSTS.includes(host)) return null;
  return `DATABASE_URL points at ${host}. This test creates and deletes organisations: it runs only against a Postgres on this machine${ci ? " (CI's service container is localhost)" : ""}.`;
}
