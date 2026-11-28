// npm run check:isolation-env — the isolation test creates and deletes organisations with foreign keys
// switched off, so it runs only against a database on this machine (CI's service container is
// localhost too). Nothing about the environment — not CI=true — lets it reach another host.
import { refusal } from "./env";

const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

assert(refusal("postgres://eve:eve@127.0.0.1:55432/eve", false) === null, "127.0.0.1 is allowed");
assert(refusal("postgres://eve:eve@localhost:5432/eve", true) === null, "localhost in CI is allowed (the service container)");
assert(refusal(undefined, false) !== null, "no DATABASE_URL is refused");
assert(refusal("not a url", false) !== null, "a non-URL is refused");
assert(refusal("postgres://u:p@ep-cool-1.eu-central-1.aws.neon.tech/neondb", false) !== null, "a remote host is refused");
assert(
  refusal("postgres://u:p@ep-cool-1.eu-central-1.aws.neon.tech/neondb", true) !== null,
  "a remote host is refused in CI too (PR #2 review: CI=true used to switch the check off)",
);

console.log("isolation env self-check passed");
