// Where this deployment answers, as CONFIGURED — never as the request says.
//
// Two features build absolute links and both must not take them from the incoming Host header,
// which the caller controls: a link in an email (lib/email/) and the base URL the auth library
// checks origins and builds callbacks against (lib/auth/auth.ts). A reset link minted from Host is
// "password reset poisoning"; an auth base URL taken from Host trusts whatever origin asked.
//
// APP_URL, origin only: a path or a trailing slash in the variable would double up in every link.

/** The origin of APP_URL, or null when it is unset or not an absolute http(s) URL. */
export function appOrigin(raw: string | undefined = process.env.APP_URL): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}
