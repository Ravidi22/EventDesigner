// npm run db:verify:isolation — can one business reach another's data through a server action? (EVE-23)
//
//   DATABASE_URL=postgres://eve:eve@127.0.0.1:5432/eve npm run db:verify:isolation
//
// There is no row-level security: isolation rests on every action filtering by the caller's
// organisation. This builds a studio "A" with everything that hangs off an event, a supplier and a
// venue owner on A's side (lib/db/isolation/fixture.ts), and four businesses on B's side; then, acting
// as B's people, calls EVERY exported server action with A's ids and checks two things each time:
// nothing of A's came back (judge.ts), and nothing of A's changed (a fingerprint of A's rows before and
// after). Every action needs a case in lib/db/isolation/cases/ — an action without one fails the run.
//
// Reads no .env file and reaches no outside service (./isolation/env.ts). Refuses any database that is
// not this machine's or CI's: it creates and deletes organisations.
import { LOCAL_HOSTS, refusal } from "./isolation/env";
import { actAsUserForScript } from "@/lib/auth/session";
import { CASES } from "./isolation/cases";
import { cleanup, rowsOfA, seed, snapshotA, sweep, type Fixture } from "./isolation/fixture";
import { missingCases, serverActions } from "./isolation/inventory";
import { judge } from "./isolation/judge";

const TIMEOUT_MS = 15000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS))]);
}

async function main() {
  const why = refusal(process.env.DATABASE_URL, process.env.CI === "true");
  if (why) {
    console.error(why);
    process.exit(2);
  }
  void LOCAL_HOSTS;

  const seedOnly = process.argv.includes("--seed-only");
  const actions = serverActions(process.cwd());
  const missing = missingCases(actions, CASES);
  const stale = Object.keys(CASES).filter((k) => !actions.includes(k));
  if (!seedOnly && (missing.length || stale.length)) {
    for (const key of missing) console.error(`MISSING a case: ${key}`);
    for (const key of stale) console.error(`STALE case (no such action): ${key}`);
    process.exit(1);
  }

  let fixture: Fixture | null = null;
  let leaks = 0;
  let called = 0;
  let skipped = 0;
  const swept = await sweep();
  if (swept) console.log(`swept ${swept} organisations an earlier run left behind`);
  try {
    fixture = await seed();
    const f = fixture;
    console.log(`seeded: studio A ${f.orgA}, ${f.aIds.length} ids on A's side\n`);
    if (seedOnly) return;

    for (const key of actions) {
      const c = CASES[key];
      if (!c.call) {
        skipped++;
        console.log(`  --   ${key}  (not called: ${c.reason})`);
        continue;
      }
      called++;
      const actor = c.as ?? "studioB";
      const before = await snapshotA(f);
      actAsUserForScript(f.users[actor]);
      let result: unknown;
      try {
        result = await withTimeout(c.call(f));
      } catch (e) {
        result = e instanceof Error ? e : new Error(String(e));
      } finally {
        actAsUserForScript(null);
      }
      const after = await snapshotA(f);
      const allowed = new Set(c.allow?.(f) ?? []);
      const verdict = judge(result, f.aIds.filter((id) => !allowed.has(id)));
      const expected = c.expect ? c.expect(result, f) : true;
      const kept = c.verify ? await c.verify(f) : true;
      const changed = before !== after;
      if (verdict.refused && expected && kept && !changed) {
        console.log(`  ok   ${key}  [${actor}] ${verdict.why}`);
      } else {
        leaks++;
        const reasons = [
          !verdict.refused && verdict.why,
          !expected && "the answer was not what an outsider may get",
          !kept && "A's data outside the database changed",
          changed && "A's rows CHANGED",
        ].filter(Boolean);
        console.error(`  LEAK ${key}  [${actor}] ${reasons.join("; ")}`);
        if (changed) for (const row of (await rowsOfA(f)).slice(0, 5)) console.error(`         ${row.slice(0, 300)}`);
        if (!(result instanceof Error)) console.error(`         answer: ${JSON.stringify(result)?.slice(0, 300)}`);
      }
    }
  } finally {
    if (fixture) {
      const f = fixture;
      await cleanup([...f.aOrgs, f.orgB, f.orgB2, f.orgB3], [f.clientC, f.users.clientB], f.filePath);
    } else {
      await sweep();
    }
  }
  if (seedOnly) {
    console.log("seed and cleanup ok");
    process.exit(0);
  }
  console.log(`\n${actions.length} actions: ${called} called as B, ${skipped} not callable from a script (reasons above), ${leaks} leaks`);
  process.exit(leaks ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
