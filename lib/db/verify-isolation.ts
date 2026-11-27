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
import { cleanup, rowsOfA, seed, snapshot, sweep, type Actor, type Fixture } from "./isolation/fixture";
import { missingCases, serverActions } from "./isolation/inventory";
import { judge, newRefs } from "./isolation/judge";

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

  const swept = await sweep();
  if (swept) console.log(`swept ${swept} organisations an earlier run left behind`);
  if (seedOnly) {
    await withFixture(async () => 0);
    console.log("seed and cleanup ok");
    process.exit(0);
  }

  const only = process.argv.find((a) => a === "--only-b" || a === "--only-control");
  let leaks = 0;
  let vacuous = 0;
  if (only !== "--only-control") {
    console.log("── B calls every action with A's ids ──");
    leaks = await withFixture((f) => outsiderPass(actions, f));
  }
  if (only !== "--only-b") {
    console.log("\n── the positive control: A's own people make the same calls, which must WORK ──");
    vacuous = await withFixture((f) => controlPass(actions, f));
  }
  console.log(`\n${actions.length} actions: ${leaks} leaks, ${vacuous} cases that prove nothing (A's own call did nothing either)`);
  process.exit(leaks || vacuous ? 1 : 0);
}

/** Seed, run, and always clean up — a fresh fixture per pass, so one pass's writes never feed the other. */
async function withFixture(run: (f: Fixture) => Promise<number>): Promise<number> {
  let fixture: Fixture | null = null;
  try {
    fixture = await seed();
    console.log(`seeded: studio A ${fixture.orgA}, ${fixture.aIds.length} ids and ${fixture.aText.length} private strings on A's side\n`);
    return await run(fixture);
  } finally {
    if (fixture) {
      const f = fixture;
      await cleanup([...f.aOrgs, f.orgB, f.orgB2, f.orgB3], [f.clientC, f.users.clientB], f.filePath);
    } else {
      await sweep();
    }
  }
}

async function call(f: Fixture, userId: string, run: (a: Fixture) => Promise<unknown>): Promise<unknown> {
  actAsUserForScript(userId);
  try {
    return await withTimeout(run(f));
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  } finally {
    actAsUserForScript(null);
  }
}

/** Which of A's people stands in for each of B's. */
function counterpart(f: Fixture, actor: Actor): string {
  return { studioB: f.ownerA, supplierB: f.supplierUserS, venueB: f.venueUserV, clientB: f.clientC }[actor];
}

/** An action whose call removes or ends something runs LAST in the control pass, so A's own delete
 *  does not leave the cases after it with nothing to act on. */
const ENDS = /#(delete|remove|archive|revoke|unshare|cancel|unlink|discard|withdraw|decline|markEventLost)/;

/** Every case called again as A's own person: it must WORK — A's data comes back, A's rows change, the
 *  `expect` flips or the `verify` fails — or B's refusal of it proves nothing (round-1 review). */
async function controlPass(actions: string[], f: Fixture): Promise<number> {
  let vacuous = 0;
  const order = [...actions.filter((k) => !ENDS.test(k)), ...actions.filter((k) => ENDS.test(k))];
  for (const key of order) {
    const c = CASES[key];
    if (!c.call) continue;
    if (c.control) {
      console.log(`  --   ${key}  (control: ${c.control})`);
      continue;
    }
    const before = await snapshot(f);
    const result = await call(f, counterpart(f, c.as ?? "studioB"), c.call);
    const after = await snapshot(f);
    const returned = !judge(result, [...f.aIds, ...f.aText]).refused;
    const flipped = (c.expect && !c.expect(result, f)) || (c.verify && !(await c.verify(f)));
    const changed = before.a !== after.a;
    if (returned || flipped || changed) {
      console.log(`  ok   ${key}  works for A (${[returned && "returns A's data", changed && "changes A's rows", flipped && "the check flips"].filter(Boolean).join(", ")})`);
    } else {
      vacuous++;
      const answer = result instanceof Error ? `threw: ${result.message.slice(0, 160)}` : JSON.stringify(result)?.slice(0, 200);
      console.error(`  VACUOUS ${key}  — A's own call did nothing either, so B's refusal proves nothing. A got: ${answer}`);
    }
  }
  return vacuous;
}

/** B's people call every action with A's ids: nothing of A's may come back, change, or be pointed at. */
async function outsiderPass(actions: string[], f: Fixture): Promise<number> {
  let leaks = 0;
  let called = 0;
  let skipped = 0;
  {
    for (const key of actions) {
      const c = CASES[key];
      if (!c.call) {
        skipped++;
        console.log(`  --   ${key}  (not called: ${c.reason})`);
        continue;
      }
      called++;
      const actor = c.as ?? "studioB";
      const before = await snapshot(f);
      const result = await call(f, f.users[actor], c.call);
      const after = await snapshot(f);
      const allowed = new Set([...f.shared, ...(c.allow?.(f) ?? [])]);
      // A's ids and A's private text (its people's emails, the marker on its private names).
      const verdict = judge(result, [...f.aIds.filter((id) => !allowed.has(id)), ...f.aText]);
      const expected = c.expect ? c.expect(result, f) : true;
      const kept = c.verify ? await c.verify(f) : true;
      const changed = before.a !== after.a;
      // B's rows that started pointing at A during the call; A's venue and zones are shared by design.
      const linked = newRefs(before.bRefs, after.bRefs, allowed);
      if (verdict.refused && expected && kept && !changed && linked.length === 0) {
        console.log(`  ok   ${key}  [${actor}] ${verdict.why}`);
      } else {
        leaks++;
        const reasons = [
          !verdict.refused && verdict.why,
          !expected && "the answer was not what an outsider may get",
          !kept && "A's data outside the database changed",
          changed && "A's rows CHANGED",
          linked.length > 0 && `B's rows now point at A's data: ${linked.slice(0, 3).join("; ")}`,
        ].filter(Boolean);
        console.error(`  LEAK ${key}  [${actor}] ${reasons.join("; ")}`);
        if (changed) for (const row of (await rowsOfA(f)).slice(0, 5)) console.error(`         ${row.slice(0, 300)}`);
        if (!(result instanceof Error)) console.error(`         answer: ${JSON.stringify(result)?.slice(0, 300)}`);
      }
    }
  }
  console.log(`\n${called} called as B, ${skipped} not callable from a script (reasons above), ${leaks} leaks`);
  return leaks;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
