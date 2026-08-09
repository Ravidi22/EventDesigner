// Which studio the caller is acting as (ADR-2).
//
// Every table carries organizationId and every query filters by it — so every server action starts
// by asking this one function. It exists now, before auth, for a single reason: the alternative is
// a literal org id sprinkled through forty queries, and then a forty-file change on the day sign-in
// lands. One function means that day is a one-file change.
//
// TODAY it answers with a constant, because there is one studio and no way to sign in.
// LATER it reads the session and throws when there isn't one.
//
// It is ASYNC from the first line even though the constant needs no awaiting: reading a session is
// asynchronous, and a synchronous version would have to be re-plumbed through every caller the day
// it stops being a constant. Paying that now costs one keyword per call site and nothing else.
//
// ⚠ SERVER ONLY. This decides what data a request may see, so it must never be imported into a
// "use client" module — a tenant check that runs in the browser is a tenant check the browser can
// edit. When auth lands this file gets `import "server-only"` at the top to make that a build error
// instead of a code-review question.

/** The single studio, until sign-up exists. Matches the organizations row the seed inserts. */
export const SINGLE_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * The organization the current request belongs to.
 *
 * @throws once auth lands, when there is no signed-in user — callers should not paper over that
 * with a fallback org, which would silently hand one studio another's data.
 */
export async function currentOrg(): Promise<string> {
  return SINGLE_ORG_ID;
}
