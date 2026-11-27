// What /api/health answers (EVE-24): is the app up AND can it reach its database.
//
// Pure: the route hands in the ping, so up / down / hanging are all checked without a database
// (check:health). The body never carries an error's text — a monitor needs "down", and the text of a
// connection error names hosts and users that are nobody's business on a public route.

export interface HealthAnswer {
  status: 200 | 503;
  body: { status: "ok"; db: "ok"; ms: number } | { status: "error"; db: "down" };
}

export async function probe(ping: () => Promise<unknown>, timeoutMs: number): Promise<HealthAnswer> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    await Promise.race([ping(), timeout]);
    return { status: 200, body: { status: "ok", db: "ok", ms: Math.round(Date.now() - started) } };
  } catch {
    return { status: 503, body: { status: "error", db: "down" } };
  } finally {
    clearTimeout(timer);
  }
}
