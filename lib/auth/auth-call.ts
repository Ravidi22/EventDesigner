// Call one of Better Auth's endpoints FROM A SERVER ACTION, through its router.
//
// WHY NOT auth().api.signInEmail(...): the direct API skips the router, and the router is where the
// rate limit runs (better-auth/dist/api/index.mjs, onRequest). A sign-in form whose action called the
// API directly would be a sign-in with no brute-force protection at all. So the actions build the
// same HTTP request a browser would send, hand it to auth().handler, and copy the Set-Cookie headers
// that come back into Next's cookie store — the same thing the nextCookies plugin does for the API.
//
// The client's IP and user agent are forwarded so the limit counts the person, not the server.
// Origin is set to the app's own: the server action itself has already been origin-checked by Next,
// and this request never left the process.
//
// ⚠ SERVER ONLY.
import { cookies, headers } from "next/headers";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { AUTH_BASE_PATH, auth, authOrigin } from "./auth";

const FORWARDED = ["cookie", "user-agent", "x-forwarded-for", "x-real-ip", "accept-language"];

export type AuthCall<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

export async function callAuth<T = unknown>(path: string, body: Record<string, unknown>): Promise<AuthCall<T>> {
  const incoming = await headers();
  const outgoing = new Headers({ "content-type": "application/json", origin: authOrigin() });
  for (const name of FORWARDED) {
    const value = incoming.get(name);
    if (value) outgoing.set(name, value);
  }

  const response = await auth().handler(
    new Request(`${authOrigin()}${AUTH_BASE_PATH}${path}`, {
      method: "POST",
      headers: outgoing,
      body: JSON.stringify(body),
    }),
  );

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    const store = await cookies();
    for (const [name, attributes] of parseSetCookieHeader(setCookie)) {
      const options = toCookieOptions(attributes);
      store.set(name, attributes.value, {
        ...options,
        sameSite: options.sameSite as "lax" | "strict" | "none" | undefined,
      });
    }
  }

  const payload = (await response.json().catch(() => null)) as (T & { code?: string }) | null;
  if (!response.ok) return { ok: false, status: response.status, code: payload?.code ?? null };
  return { ok: true, data: payload as T };
}
