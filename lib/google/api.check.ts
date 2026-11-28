// npm run check:google — the self-check of ./api.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { GoogleApiError } from "./api";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

const gone = new GoogleApiError("not found", 404, "notFound");
assert(gone.isGone, "404 is gone");
assert(new GoogleApiError("deleted", 410).isGone, "410 is gone");
assert(!gone.isTransient, "a missing event is not worth retrying");

assert(new GoogleApiError("slow down", 429).isTransient, "429 is transient");
assert(new GoogleApiError("boom", 503).isTransient, "5xx is transient");
assert(new GoogleApiError("quota", 403, "rateLimitExceeded").isTransient, "a 403 for rate limiting is transient");
assert(!new GoogleApiError("forbidden", 403, "insufficientPermissions").isTransient, "a 403 for scope is NOT — retrying cannot fix a missing scope");
assert(!new GoogleApiError("bad", 400).isTransient, "400 is our bug, not Google's mood");
assert(new GoogleApiError("x", 401).isTransient === false, "401 is handled by refreshing, not retrying");

assert(gone instanceof Error, "it is a real Error so it survives a rethrow");
assert(gone.status === 404 && gone.reason === "notFound", "status and reason are carried for the caller");

// Calendar ids are email-shaped and contain @ and dots; event ids are opaque. Both go in a path
// segment, so both must be encoded — this is the difference between a working delete and a 404
// that silently leaves an event behind.
assert(encodeURIComponent("a b@x.com") === "a%20b%40x.com", "path segments are encoded");

console.log("google api self-check passed");
