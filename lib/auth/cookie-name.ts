/** The session cookie's name, alone in a file that imports NOTHING.
 *
 *  Both the session module and the route guard need it, and they run in different worlds: the guard
 *  is a Proxy (Next 16's renamed Middleware) on the edge runtime, where node:crypto and a Postgres
 *  driver do not exist. Importing the name from lib/auth/session.ts would drag the whole session
 *  implementation — crypto, drizzle, the connection pool — into that bundle. A string constant with
 *  no imports is the seam. */
export const SESSION_COOKIE = "eve_session";
