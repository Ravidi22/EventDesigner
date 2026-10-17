/** The session cookie's names, alone in a file that imports NOTHING.
 *
 *  The route guard (proxy.ts) runs before anything else and must stay tiny: importing the auth
 *  library to learn a cookie's name would drag it, the database driver and node:crypto into that
 *  bundle. Better Auth names the cookie `<prefix>.session_token` (prefix "eve", lib/auth/auth.ts),
 *  and over HTTPS it adds the `__Secure-` prefix, so there are two names to look for.
 *
 *  ⚠ This only says a cookie EXISTS. It is not the auth check — currentSession() is. */
export const SESSION_COOKIES = ["eve.session_token", "__Secure-eve.session_token"] as const;
