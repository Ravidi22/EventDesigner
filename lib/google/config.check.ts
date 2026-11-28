// npm run check:google — the self-check of ./config.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { redirectUriBlocks } from "./types";
import { checkRedirectUri, GOOGLE_SCOPES, googleConfig, KEY_BYTES, requireGoogleConfig, type GoogleConfig } from "./config";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

const saved = { ...process.env };
const set = (vars: Record<string, string | undefined>) => {
  for (const [k, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[k];
    else process.env[k] = value;
  }
};

set({
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  GOOGLE_REDIRECT_URI: undefined,
  GOOGLE_TOKEN_KEY: undefined,
});
assert(googleConfig() === null, "nothing set means not configured");

const key = Buffer.alloc(KEY_BYTES, 7).toString("base64");
set({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REDIRECT_URI: "https://x/cb" });
assert(googleConfig() === null, "three of four is still not configured — partial is the worst case");

set({ GOOGLE_TOKEN_KEY: key });
assert(googleConfig() !== null, "all four is configured");
assert(googleConfig()!.tokenKey.byteLength === KEY_BYTES, "the key decodes to 32 bytes");

set({ GOOGLE_TOKEN_KEY: Buffer.alloc(16, 7).toString("base64") });
assert(googleConfig() === null, "a 16-byte key is refused rather than stretched");

set({ GOOGLE_TOKEN_KEY: "!!!!" });
assert(googleConfig() === null, "a mangled key is refused, not silently truncated");

set({ GOOGLE_TOKEN_KEY: key });
let threw = false;
try {
  requireGoogleConfig();
} catch {
  threw = true;
}
assert(!threw, "requireGoogleConfig passes when configured");

set({ GOOGLE_CLIENT_ID: undefined });
threw = false;
try {
  requireGoogleConfig();
} catch {
  threw = true;
}
assert(threw, "requireGoogleConfig throws when the variables vanish under live rows");

assert(
  GOOGLE_SCOPES.includes("https://www.googleapis.com/auth/calendar.app.created"),
  "the push scope is the narrow one",
);
// Cast to string[] because the literal union already proves this — the assertion is here so the
// rule survives someone widening the array later, when the type would stop proving it.
assert(
  !(GOOGLE_SCOPES as readonly string[]).includes("https://www.googleapis.com/auth/calendar"),
  "the full calendar scope is NOT requested",
);


// ── checkRedirectUri ─────────────────────────────────────────────────────────────────────────
const at = (redirectUri: string): GoogleConfig => ({
  clientId: "id",
  clientSecret: "secret",
  redirectUri,
  tokenKey: Buffer.alloc(KEY_BYTES, 7),
});
const LOCAL = "http://localhost:3000/api/google/callback";
const LIVE = "https://eve.example/api/google/callback";

const onPlatform = (vars: Record<string, string | undefined>) =>
  set({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "eve.example", VERCEL_URL: undefined, ...vars });

set({ VERCEL: undefined, VERCEL_ENV: undefined, VERCEL_PROJECT_PRODUCTION_URL: undefined, VERCEL_URL: undefined });
assert(checkRedirectUri(at(LOCAL)).state === "ok", "off-platform, localhost is the correct answer and not a finding");

onPlatform({});
assert(checkRedirectUri(at(LIVE)).state === "ok", "the production domain matches itself");

// THE BUG THIS WAS BUILT FOR: the dev value shipped to production.
const shipped = checkRedirectUri(at(LOCAL));
assert(shipped.state === "local-in-production", "a loopback URI on a hosted deployment is caught");
assert(redirectUriBlocks(shipped), "and it blocks — consent must not be asked for at all");
assert(
  shipped.state === "local-in-production" && shipped.deployment === "eve.example",
  "the verdict names where the deployment actually is, so the message can be acted on",
);

assert(checkRedirectUri(at("127.0.0.1:3000/cb")).state === "local-in-production", "an unparseable URI blocks too");
assert(checkRedirectUri(at("http://127.0.0.1:3000/cb")).state === "local-in-production", "127.0.0.1 is loopback");

onPlatform({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: undefined, VERCEL_URL: "eve-git-x-y.vercel.app" });
const preview = checkRedirectUri(at(LIVE));
assert(preview.state === "preview", "a preview deployment is its own answer, not a mismatch");
assert(redirectUriBlocks(preview), "and it blocks: a per-deployment hostname can never be a registered URI");

// A second custom domain is not a misconfiguration — it is reported and NOT enforced.
onPlatform({ VERCEL_PROJECT_PRODUCTION_URL: "www.eve.example" });
const differs = checkRedirectUri(at(LIVE));
assert(differs.state === "host-differs", "a different host is noticed");
assert(!redirectUriBlocks(differs), "but never blocks — a project may serve several domains");

// The scheme is part of the match, but only the host decides: an https deployment configured with
// an http URI of the same host is a real problem Google itself will refuse, and it must not read
// as "ok" merely because the hostnames agree.
onPlatform({ VERCEL_PROJECT_PRODUCTION_URL: "eve.example" });
assert(
  checkRedirectUri(at("https://eve.example:8443/api/google/callback")).state === "host-differs",
  "a port that the deployment does not answer on is a difference, because host includes it",
);

set({ VERCEL: undefined, VERCEL_ENV: undefined, VERCEL_PROJECT_PRODUCTION_URL: undefined, VERCEL_URL: undefined });

process.env = saved;
console.log("google config self-check passed");
