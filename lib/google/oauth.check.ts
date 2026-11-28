// npm run check:google — the self-check of ./oauth.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type GoogleConfig } from "./config";
import { authorizationUrl, isRevoked, readState, signState, STATE_TTL_MS } from "./oauth";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

const config: GoogleConfig = {
  clientId: "id",
  clientSecret: "secret",
  redirectUri: "https://studio.example/api/google/callback",
  tokenKey: Buffer.alloc(32, 3),
};
const otherKey: GoogleConfig = { ...config, tokenKey: Buffer.alloc(32, 9) };
const user = "22222222-2222-4222-8222-222222222222";

const state = signState(user, config);
assert(readState(state, config) === user, "a state round-trips to the user who started the flow");
assert(readState(state, otherKey) === null, "a state signed with another key is refused");
assert(readState(state + "x", config) === null, "a tampered signature is refused");
assert(readState("nonsense", config) === null, "a malformed state is refused");
assert(readState("", config) === null, "an empty state is refused");

// The attack this actually stops: a state minted for the attacker must not validate as the
// victim. The callback compares the returned id against the session's, so two different users
// must never produce interchangeable states.
assert(readState(signState("attacker", config), config) === "attacker", "the state names its own minter");
assert(readState(signState("attacker", config), config) !== user, "and never someone else");

assert(signState(user, config) !== signState(user, config), "a nonce per call — two states are never equal");

const past = Date.now() - STATE_TTL_MS - 1000;
assert(readState(signState(user, config, past), config) === null, "an expired state is refused");
assert(readState(signState(user, config, past), config, past + 1000) === user, "and was valid at the time");

// A forged payload with a far-future expiry must fail on the SIGNATURE, not squeak through
// because the expiry looked fine — this is why the signature is checked first.
const forged = Buffer.from(JSON.stringify({ u: user, e: Date.now() + 1e9, n: "x" }), "utf8").toString("base64url");
assert(readState(`${forged}.notasignature`, config) === null, "an unsigned payload is refused however good it looks");

const url = new URL(authorizationUrl(state, config));
assert(url.searchParams.get("access_type") === "offline", "offline access, or there is no refresh token at all");
assert(url.searchParams.get("prompt") === "consent", "forced consent, or a reconnect returns no refresh token");
assert(url.searchParams.get("state") === state, "the state travels");
assert(url.searchParams.get("redirect_uri") === config.redirectUri, "the redirect is the configured one, never a host header");
assert(url.searchParams.get("scope")?.includes("calendar.app.created") === true, "the narrow write scope is asked for");
assert(url.searchParams.get("response_type") === "code", "authorization-code flow");

assert(isRevoked(new Error("google token refresh failed: invalid_grant")), "a revoked connection is recognised");
assert(!isRevoked(new Error("google token refresh failed: 503")), "a server error is not a revocation");
assert(!isRevoked("invalid_grant"), "a non-Error is not a revocation");

console.log("google oauth self-check passed");
