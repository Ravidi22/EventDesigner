// npm run check:files — the self-check of ./keys.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { buildKey, isAllowedType, isSafeKey, orgOfKey } from "./keys";

// ponytail: self-check. Run: npm run check:files
const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

const org = "00000000-0000-0000-0000-000000000001";

const key = buildKey(org, "gallery", "image/jpeg");
assert(key.startsWith(`${org}/gallery/`) && key.endsWith(".jpg"), "a key is org / kind / uuid.ext");
assert(isSafeKey(key), "…and the key we build is a key we accept");
assert(buildKey(org, "underlay", "image/png").endsWith(".png"), "the extension comes from the TYPE");

// The whole point of minting the name: none of this can reach a path.
assert(!isSafeKey(`${org}/gallery/../../etc/passwd`), "rejects traversal");
assert(!isSafeKey(`../${org}/gallery/a.jpg`), "rejects a leading ..");
assert(!isSafeKey(`/${org}/gallery/a.jpg`), "rejects an absolute path");
assert(!isSafeKey(`${org}/gallery/..`), "rejects a bare .. as the filename");
assert(!isSafeKey(`${org}/gallery/a.jpg/b.jpg`), "rejects extra segments");
assert(!isSafeKey(`${org}/gallery/a.jpg\0.png`), "rejects a null byte");
assert(!isSafeKey(`${org}/notakind/a.jpg`), "rejects an unknown kind");
assert(!isSafeKey(`not-an-org/gallery/a.jpg`), "rejects a prefix that is not an org id");
assert(!isSafeKey(""), "rejects empty");
assert(!isSafeKey(`${org}/gallery/${"a".repeat(300)}.jpg`), "rejects an absurd length");

assert(orgOfKey(key) === org, "orgOfKey reads the tenant prefix back");
assert(orgOfKey("nonsense") === null, "…and refuses a key that is not ours");

// The allowlist. An SVG is a script; a PDF is the cancelled import path (ADR-3).
assert(isAllowedType("image/jpeg") && isAllowedType("image/webp"), "photographs are allowed");
assert(!isAllowedType("image/svg+xml"), "SVG is NOT allowed — it executes where it is served");
assert(!isAllowedType("application/pdf"), "PDF is not allowed — ADR-3 stays cancelled");
assert(!isAllowedType("text/html") && !isAllowedType(""), "nothing else is allowed");

let threw = false;
try {
  buildKey(org, "gallery", "image/svg+xml");
} catch {
  threw = true;
}
assert(threw, "buildKey refuses a type the allowlist does not carry");

console.log("files/keys self-check passed");
