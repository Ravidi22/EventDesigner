// What a browser's CSP violation report becomes in the server log (EVE-11).
//
// The endpoint is PUBLIC (a signed-out visitor's page reports too), so everything here treats the
// body as hostile: unknown shapes give nothing, every field is cut short, and the page's address is
// reduced to its PATH with any long opaque segment masked — /join/<token> and /v/<token> are
// credentials, and a log line is no place for one. The query string is never read at all.
//
// Two formats reach us:
//   - report-uri (Firefox, Safari):  { "csp-report": { "effective-directive", "blocked-uri", "document-uri" } }
//   - Reporting API (Chrome):        [ { "type": "csp-violation", "body": { effectiveDirective, blockedURL, documentURL } } ]

/** At most this many lines from one POST — a page can batch reports, a poster can batch thousands. */
const MAX_LINES = 20;

/** A path segment this long and this shape is a token or an id, never a route name. */
const OPAQUE = /^[A-Za-z0-9_-]{20,}$/;

interface Violation {
  directive: string;
  blocked: string;
  page: string;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The directive's own name: `"font-src 'self'"` (violated-directive) → `font-src`. */
function directiveName(value: string): string {
  return value.trim().split(/\s+/)[0].slice(0, 60);
}

/** A blocked URL is reduced to its origin; a keyword (`inline`, `eval`, `data`, `blob`) stays itself. */
function blockedSource(value: string): string {
  const raw = value.trim();
  try {
    const url = new URL(raw);
    if (/^(https?|wss?):$/.test(url.protocol)) return url.origin;
    return url.protocol.replace(/:$/, "").slice(0, 40);
  } catch {
    return raw.slice(0, 40);
  }
}

/** The page's path, opaque segments masked; `?` for anything that is not an http(s) page. */
function pagePath(value: string): string {
  try {
    const url = new URL(value.trim());
    if (!/^https?:$/.test(url.protocol)) return "?";
    const path = url.pathname
      .split("/")
      .map((segment) => (OPAQUE.test(segment) ? "…" : segment.slice(0, 40)))
      .join("/");
    return path.slice(0, 120) || "/";
  } catch {
    return "?";
  }
}

function violationsOf(body: unknown): Violation[] {
  if (Array.isArray(body)) {
    return body.flatMap((report) => {
      if (!report || typeof report !== "object") return [];
      const r = report as { type?: unknown; body?: unknown };
      if (r.type !== "csp-violation" || !r.body || typeof r.body !== "object") return [];
      const b = r.body as Record<string, unknown>;
      return [{ directive: str(b.effectiveDirective), blocked: str(b.blockedURL), page: str(b.documentURL) }];
    });
  }
  if (body && typeof body === "object" && "csp-report" in body) {
    const r = (body as Record<string, unknown>)["csp-report"];
    if (!r || typeof r !== "object") return [];
    const b = r as Record<string, unknown>;
    return [
      {
        directive: str(b["effective-directive"]) || str(b["violated-directive"]),
        blocked: str(b["blocked-uri"]),
        page: str(b["document-uri"]),
      },
    ];
  }
  return [];
}

/** One log line per violation in a parsed report body — `[csp] img-src blocked https://x.test on /join/…`. */
export function reportLines(body: unknown): string[] {
  return violationsOf(body)
    .filter((v) => v.directive)
    .slice(0, MAX_LINES)
    .map((v) => `[csp] ${directiveName(v.directive)} blocked ${blockedSource(v.blocked) || "?"} on ${pagePath(v.page)}`);
}
