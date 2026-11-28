// npm run check:google (this file is its last part) — revoking refresh tokens at Google is best
// effort and BOUNDED: a Google endpoint that never answers must not stall the erase sweep or a
// disconnect (PR #5 re-review).
import { revokeRefreshTokens } from "./sync";

const assert = (ok: unknown, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

async function main() {
  // Google's revoke endpoint, hung: a fetch that ends only when it is aborted. The network is the one
  // thing this check cannot use, so fetch is the one thing stubbed.
  const asked: string[] = [];
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    asked.push(String(new URLSearchParams(String(init?.body ?? "")).get("token")));
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")));
    });
  }) as typeof fetch;

  // If the revoke waits on the hung endpoint, this fires first and fails the check.
  const guard = setTimeout(() => {
    console.error("FAIL: revokeRefreshTokens waited on a Google endpoint that never answers");
    process.exit(1);
  }, 3000);

  const started = Date.now();
  await revokeRefreshTokens(["first", "second"], 200);
  clearTimeout(guard);
  const took = Date.now() - started;

  assert(asked.join(",") === "first,second", `every token is still tried, in order (${asked.join(",")})`);
  assert(took < 1500, `each try gives up after its timeout (${took} ms for two)`);
  console.log("google sync self-check passed");
}

void main();
