// Where browsers post what the report-only Content-Security-Policy WOULD have blocked (EVE-11).
//
// Public by necessity — a signed-out visitor's page reports too (proxy.ts lists it) — so the body is
// hostile: capped, parsed in a try, reduced by reportLines() to one short line per violation with no
// query strings and no tokens, and answered 204 whatever it held. The lines go to the server log
// until an error-monitoring service is chosen (EVE-12).
import { reportLines } from "@/lib/security/csp-report";

const MAX_BODY = 8192;

export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });

  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }
  for (const line of reportLines(body)) console.warn(line);
  return new Response(null, { status: 204 });
}
