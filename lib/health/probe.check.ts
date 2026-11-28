// npm run check:health — what /api/health answers when the database is up, down, or hanging.
import { probe } from "./probe";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

async function main() {
  const up = await probe(async () => "row", 1000);
  assert(up.status === 200, "a database that answers → 200");
  assert(up.body.status === "ok" && up.body.db === "ok", "…body says ok");
  const ms = "ms" in up.body ? up.body.ms : -1;
  assert(Number.isInteger(ms) && ms >= 0, "…with whole milliseconds");

  const down = await probe(async () => {
    throw new Error("password authentication failed for user eve at db.internal:5432");
  }, 1000);
  assert(down.status === 503, "a database that throws → 503");
  assert(JSON.stringify(down.body) === JSON.stringify({ status: "error", db: "down" }), "…and the body never carries the error text");

  const started = Date.now();
  const hung = await probe(() => new Promise(() => {}), 200);
  const took = Date.now() - started;
  assert(hung.status === 503, "a database that never answers → 503");
  assert(took >= 180 && took < 1000, `…after the timeout, not forever (${took}ms)`);

  console.log("health self-check passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
