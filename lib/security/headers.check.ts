// npm run check:headers — what every response from this app carries, and why each value is what it is.
// A sibling *.check.ts rather than an isMain block, so none of it can reach a browser bundle (EVE-54).
import {
  ENFORCED_POLICY,
  reportOnlyPolicy,
  securityHeaders,
  uploadOrigin,
  type HeaderEnv,
} from "./headers";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

const valueOf = (env: HeaderEnv, key: string) => securityHeaders(env).find((h) => h.key === key)?.value ?? "";
/** One directive of a policy, e.g. `img-src 'self' data: blob:`. */
const directive = (policy: string, name: string) =>
  policy.split(";").map((d) => d.trim()).find((d) => d === name || d.startsWith(`${name} `)) ?? "";

const prod: HeaderEnv = { dev: false };
const keys = securityHeaders(prod).map((h) => h.key).sort();
assert(
  JSON.stringify(keys) ===
    JSON.stringify(
      [
        "Content-Security-Policy",
        "Content-Security-Policy-Report-Only",
        "Permissions-Policy",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
      ].sort(),
    ),
  "exactly the seven headers",
);

assert(valueOf(prod, "Strict-Transport-Security") === "max-age=63072000", "HSTS is two years, no subdomains or preload until the domain exists");
assert(valueOf(prod, "X-Content-Type-Options") === "nosniff", "nosniff");
assert(valueOf(prod, "Referrer-Policy") === "strict-origin-when-cross-origin", "a token URL never leaves as a referrer");
assert(
  valueOf(prod, "Permissions-Policy") ===
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), fullscreen=(self), web-share=(self)",
  "permissions: only fullscreen and share, on this origin",
);
assert(valueOf(prod, "X-Frame-Options") === "DENY", "no framing (older browsers)");
assert(valueOf(prod, "Content-Security-Policy") === ENFORCED_POLICY, "the enforced policy is the three safe directives");
assert(ENFORCED_POLICY === "frame-ancestors 'none'; object-src 'none'; base-uri 'self'", "…which are frame-ancestors, object-src, base-uri");

const bare = reportOnlyPolicy(prod);
assert(valueOf(prod, "Content-Security-Policy-Report-Only") === bare, "the report-only header is reportOnlyPolicy()");
assert(directive(bare, "img-src") === "img-src 'self' data: blob:", "no storage host: images from this origin, data: and blob:");
assert(
  directive(bare, "connect-src") === "connect-src 'self' data: blob:",
  "no storage host: this origin, plus data: and blob: — the quote PDF fetch()es each page's data URL (quote-pdf.ts)",
);
assert(directive(bare, "report-uri") === "report-uri /api/csp-report", "reports go to /api/csp-report");
assert(bare.includes("upgrade-insecure-requests"), "production upgrades http subresources");
assert(!bare.includes("'unsafe-eval'"), "production never allows eval");
assert(directive(bare, "script-src") === "script-src 'self' 'unsafe-inline'", "scripts: this origin and inline (approach A)");
assert(directive(bare, "frame-src") === "frame-src 'none'", "nothing is framed in");
assert(directive(bare, "worker-src") === "worker-src 'self' blob:", "workers from this origin and blob:");

const dev = reportOnlyPolicy({ dev: true });
assert(directive(dev, "script-src").includes("'unsafe-eval'"), "dev allows eval (React's error overlay needs it)");
assert(directive(dev, "connect-src").split(" ").includes("ws:"), "dev allows the HMR websocket");
assert(!dev.includes("upgrade-insecure-requests"), "dev on http is not upgraded");

const withStorage: HeaderEnv = {
  dev: false,
  filePublicUrl: "https://media.example.com/x",
  r2AccountId: "acct",
  r2Jurisdiction: "eu",
};
const stored = reportOnlyPolicy(withStorage);
assert(directive(stored, "img-src").split(" ").includes("https://media.example.com"), "images from the file host's ORIGIN");
assert(!stored.includes("https://media.example.com/x"), "…never its path");
assert(directive(stored, "media-src").split(" ").includes("https://media.example.com"), "media from the file host");
const connect = directive(stored, "connect-src").split(" ");
assert(connect.includes("https://media.example.com"), "connections to the file host");
assert(connect.includes("https://acct.eu.r2.cloudflarestorage.com"), "connections to the upload host (presigned PUT)");

assert(uploadOrigin("acct") === "https://acct.r2.cloudflarestorage.com", "the upload host with no jurisdiction");
assert(uploadOrigin("acct", "eu") === "https://acct.eu.r2.cloudflarestorage.com", "the upload host in a jurisdiction");
assert(uploadOrigin() === undefined, "no account, no upload host");
assert(uploadOrigin("  ") === undefined, "a blank account is no account");

let threw = false;
let broken = "";
try {
  broken = reportOnlyPolicy({ dev: false, filePublicUrl: "not a url" });
} catch {
  threw = true;
}
assert(!threw, "a malformed file host never throws (it would take down every response)");
assert(directive(broken, "img-src") === "img-src 'self' data: blob:", "…it is ignored");

console.log("headers self-check passed");
