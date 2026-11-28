// The security headers every response carries (EVE-11; spec docs/superpowers/specs/2026-11-27-platform-round-1-design.md §1).
//
// IMPORTS NOTHING. next.config.ts reads this by relative path at build time, where the `@/` alias
// and anything server-only are out of reach — keep it plain data and string building.
//
// Two policies, on purpose:
//
//  - ENFORCED: only the three directives that cannot break a page — nobody may frame us (the
//    clickjacking that let any site put /billing in an iframe), no plugins, no <base> hijack.
//
//  - REPORT-ONLY: the whole policy. It blocks nothing; the browser posts what it WOULD have
//    blocked to /api/csp-report. A week of that from real use is what tells us the policy is right
//    before it is enforced — the 3D viewer, the quote PDF builder and the image hosts all reach for
//    things a guessed policy would cut off.
//
// The storage hosts come from the variables lib/files/driver.ts already reads, so whatever storage
// is chosen later, the policy follows it — nothing here names a vendor's public domain.
//
// `'unsafe-inline'` for scripts is approach A of the spec (DECIDE-1): a per-request nonce would make
// every page — the landing too — render per request, and the canvas's inline `style={…}`
// attributes need `'unsafe-inline'` for styles whatever is done for scripts.

export interface HeaderEnv {
  /** `next dev`: React's dev tooling needs eval, and HMR talks over a websocket. */
  dev: boolean;
  /** NEXT_PUBLIC_R2_PUBLIC_URL — where uploaded files are served from. */
  filePublicUrl?: string;
  /** R2_ACCOUNT_ID — names the host a presigned upload PUTs to. */
  r2AccountId?: string;
  /** R2_JURISDICTION — "eu", "fedramp" or unset. */
  r2Jurisdiction?: string;
}

export function headerEnvFromProcess(): HeaderEnv {
  return {
    dev: process.env.NODE_ENV === "development",
    filePublicUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    r2AccountId: process.env.R2_ACCOUNT_ID,
    r2Jurisdiction: process.env.R2_JURISDICTION,
  };
}

export const ENFORCED_POLICY = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";

/** The host a presigned upload is PUT to — the same `<account>.<jurisdiction>.r2.cloudflarestorage.com`
 *  that lib/files/driver.ts builds. */
export function uploadOrigin(accountId?: string, jurisdiction?: string): string | undefined {
  const account = accountId?.trim();
  if (!account) return undefined;
  const region = jurisdiction?.trim().toLowerCase();
  return `https://${account}.${region ? `${region}.` : ""}r2.cloudflarestorage.com`;
}

/** The origin of a URL, or undefined when it is not one. Never throws: this runs for every response. */
function originOf(url?: string): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    const { origin } = new URL(url.trim());
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
}

export function reportOnlyPolicy(env: HeaderEnv): string {
  const files = originOf(env.filePublicUrl);
  const upload = uploadOrigin(env.r2AccountId, env.r2Jurisdiction);
  const list = (...sources: (string | false | undefined)[]) => sources.filter(Boolean).join(" ");

  const directives = [
    "default-src 'self'",
    `script-src ${list("'self'", "'unsafe-inline'", env.dev && "'unsafe-eval'")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${list("'self'", "data:", "blob:", files)}`,
    "font-src 'self' data:",
    // data: and blob: because the quote / billing / booklet PDF builder fetch()es every page's data
    // URL from html-to-image (app/(app)/outputs/quote-pdf.ts) — found by the round-1 review.
    `connect-src ${list("'self'", "data:", "blob:", files, upload, env.dev && "ws:")}`,
    `media-src ${list("'self'", "blob:", files)}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "form-action 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    !env.dev && "upgrade-insecure-requests",
    "report-uri /api/csp-report",
  ];
  return directives.filter(Boolean).join("; ");
}

export function securityHeaders(env: HeaderEnv): { key: string; value: string }[] {
  return [
    // No includeSubDomains / preload until the domain exists (EVE-15): both are promises about every
    // subdomain, and preload is close to irreversible.
    { key: "Strict-Transport-Security", value: "max-age=63072000" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // A /join/<token> or /v/<token> URL never leaves this origin as a referrer.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // The app uses fullscreen (/present), the share sheet and the clipboard (allowed by default on
    // this origin) — and nothing else here.
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), fullscreen=(self), web-share=(self)",
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: ENFORCED_POLICY },
    { key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy(env) },
  ];
}
