// GET/HEAD /api/health — for an uptime monitor (EVE-24): 200 when the app answers AND reaches its
// database within 3 s, 503 otherwise. Public (proxy.ts lists it): a monitor has no session. The body
// says nothing about versions, regions or errors — see lib/health/probe.ts.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { probe } from "@/lib/health/probe";

const TIMEOUT_MS = 3000;
const NO_STORE = { "Cache-Control": "no-store" };

async function answer() {
  return probe(() => db().execute(sql`select 1`), TIMEOUT_MS);
}

export async function GET(): Promise<Response> {
  const { status, body } = await answer();
  return Response.json(body, { status, headers: NO_STORE });
}

export async function HEAD(): Promise<Response> {
  const { status } = await answer();
  return new Response(null, { status, headers: NO_STORE });
}
