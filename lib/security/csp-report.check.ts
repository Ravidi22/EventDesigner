// npm run check:csp-report — what a browser's CSP report becomes in the server log, and what it never carries.
import { reportLines } from "./csp-report";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The legacy report-uri format (Firefox, Safari): one object under "csp-report".
const legacy = {
  "csp-report": {
    "effective-directive": "img-src",
    "blocked-uri": "https://evil.example/a.png?x=1",
    "document-uri": "https://app.test/join/abcDEF1234567890abcdef?y=2",
  },
};
assert(
  same(reportLines(legacy), ["[csp] img-src blocked https://evil.example on /join/…"]),
  "a legacy report: directive, the blocked ORIGIN, the page's path with its token masked",
);

// The Reporting API format (Chrome): an array of reports, each with a body.
const modern = [
  {
    type: "csp-violation",
    body: {
      effectiveDirective: "script-src-elem",
      blockedURL: "inline",
      documentURL: "https://app.test/v/Zz9-xYw_1234567890abcd",
    },
  },
];
assert(same(reportLines(modern), ["[csp] script-src-elem blocked inline on /v/…"]), "a Reporting-API report, keyword kept as is");

// The older legacy key, "violated-directive", when "effective-directive" is absent.
assert(
  same(
    reportLines({ "csp-report": { "violated-directive": "font-src 'self'", "blocked-uri": "data", "document-uri": "https://app.test/login" } }),
    ["[csp] font-src blocked data on /login"],
  ),
  "violated-directive is read to its first word",
);

// Masking is by segment shape, not by route name: a long opaque segment is a token or an id.
assert(
  same(
    reportLines({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "blob", "document-uri": "https://app.test/billing/123" } }),
    ["[csp] img-src blocked blob on /billing/123"],
  ),
  "a short segment stays",
);
assert(
  same(
    reportLines({
      "csp-report": {
        "effective-directive": "img-src",
        "blocked-uri": "blob",
        "document-uri": "https://app.test/client/events/0f1e2d3c-4b5a-6978-8091-a2b3c4d5e6f7/scene",
      },
    }),
    ["[csp] img-src blocked blob on /client/events/…/scene"],
  ),
  "a uuid segment is masked too",
);
assert(
  same(
    reportLines({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "https://x.test/a", "document-uri": "about:blank" } }),
    ["[csp] img-src blocked https://x.test on ?"],
  ),
  "a page that is not a URL with a path is '?'",
);

// Junk in, nothing out — the endpoint is public, anything can be posted to it.
assert(same(reportLines(null), []), "null → nothing");
assert(same(reportLines("hello"), []), "a string → nothing");
assert(same(reportLines({}), []), "an empty object → nothing");
assert(same(reportLines([{ type: "deprecation", body: { id: "x" } }]), []), "a non-CSP report → nothing");
assert(same(reportLines([{ type: "csp-violation" }]), []), "a CSP report with no body → nothing");

const flood = Array.from({ length: 50 }, () => modern[0]);
assert(reportLines(flood).length === 20, "at most 20 lines per body");

// A directive or blocked value is never more than a short token: nothing a poster sends is echoed at length.
const long = reportLines({
  "csp-report": { "effective-directive": "x".repeat(500), "blocked-uri": "y".repeat(500), "document-uri": "https://app.test/" },
});
assert(long.length === 1 && long[0].length < 200, "long fields are cut short");

console.log("csp-report self-check passed");
