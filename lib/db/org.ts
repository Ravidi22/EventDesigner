// Which studio the caller is acting as (ADR-2).
//
// Every table carries organizationId and every query filters by it — so every server action starts
// by asking this one function. It existed before auth for exactly this day: the alternative was a
// literal org id sprinkled through forty queries, and then a forty-file change when sign-in landed.
// It was a one-file change.
//
// It reads the session now, and THROWS when there isn't one. No fallback org, ever: a fallback is
// how one studio quietly ends up reading another's events, and it fails open — the failure mode
// where nothing looks wrong.
//
// ⚠ SERVER ONLY. This decides what data a request may see, so it must never be imported into a
// "use client" module — a tenant check that runs in the browser is a tenant check the browser can
// edit. It imports next/headers (through the session module), which is itself an error in a client
// bundle.
import { currentSession } from "@/lib/auth/session";

/** The organization the seed creates, and the one the verification script acts as.
 *
 *  It is NOT a studio anybody signs into. It exists so that `npm run db:verify` — which runs as a
 *  plain Node script, outside any HTTP request, with no cookie to read — has an organisation to
 *  scope its fixtures to. See `actAsOrgForScript`. */
export const SINGLE_ORG_ID = "00000000-0000-0000-0000-000000000001";

/** Set by scripts that run OUTSIDE a request. Null in the app, always. */
let scriptOrg: string | null = null;

/**
 * Let a command-line script act as one organisation.
 *
 * `npm run db:verify` calls the same server actions the app does, and those actions must be the
 * real ones — a verification that exercised a special test path would be verifying the test path.
 * But there is no request and no cookie out there, so `cookies()` throws. This is the one seam that
 * lets a script say which studio it is.
 *
 * ⚠ Refuses to run in production. This function would otherwise be a way to become any studio, so
 * it is not enough that nothing in the app calls it — it must be unable to work if something did.
 */
export function actAsOrgForScript(organizationId: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("actAsOrgForScript is not available in production");
  }
  scriptOrg = organizationId;
}

/**
 * The organization the current request belongs to.
 *
 * @throws when there is no signed-in user. Callers do not catch this: a server action that cannot
 * say whose data it is being asked for has nothing safe to return.
 */
export async function currentOrg(): Promise<string> {
  if (scriptOrg) return scriptOrg;
  const session = await currentSession();
  if (!session) throw new Error("not signed in");
  return session.organizationId;
}
