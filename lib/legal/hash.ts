// The section an address's #fragment names, for the legal pages' contents lists. Pure.

/** The fragment decoded — or as written, when it is not valid percent-encoding. decodeURIComponent
 *  throws on `#%E0` or a lone `#%` (a link a chat app mangled), and the contents list ran it inside an
 *  effect, so the visitor got the error page instead of the legal text (PR #4 review). */
export function hashTarget(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
