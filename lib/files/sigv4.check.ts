// npm run check:sigv4 — the self-check of ./sigv4.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { createHmac } from "node:crypto";
import { amzDates, presign, sha256Hex, uriEncode, type PresignInput } from "./sigv4";

// ponytail: self-check. Run: npm run check:sigv4
//
// ⚠ WHAT THIS CAN AND CANNOT PROVE. It checks the primitives against published constants, and the
// structure and determinism of everything built on them. It does NOT prove R2 will accept the
// result — no test without a bucket can. Read it as "the algorithm is implemented as written",
// not as "uploads work".
const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

// The one universally published constant in this whole file: SHA-256 of the empty string. If the
// hashing helper is wrong, everything above it is wrong in a way nothing else here would catch.
assert(
  sha256Hex("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "sha256 of the empty string matches the published digest",
);
// RFC 4231 test case 1 for HMAC-SHA256 — key of twenty 0x0b bytes over "Hi There".
assert(
  createHmac("sha256", Buffer.alloc(20, 0x0b)).update("Hi There").digest("hex") ===
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
  "HMAC-SHA256 matches RFC 4231 test case 1",
);

// The encoder, which is where hand-rolled SigV4 usually goes wrong.
assert(uriEncode("a b") === "a%20b", "space encodes as %20, never +");
assert(uriEncode("hi!'()*") === "hi%21%27%28%29%2A", "encodes the characters encodeURIComponent leaves alone");
assert(uriEncode("a/b") === "a%2Fb" && uriEncode("a/b", false) === "a/b", "slashes are encoded in a query, literal in a path");
assert(uriEncode("-._~") === "-._~", "unreserved characters pass through");
assert(uriEncode("שלום").startsWith("%D7"), "utf-8 is encoded byte by byte, not char by char");

const { amzDate, dateStamp } = amzDates(new Date("2026-08-13T10:15:30.123Z"));
assert(amzDate === "20260813T101530Z", `amz date is basic-format ISO — got ${amzDate}`);
assert(dateStamp === "20260813", "the date stamp is its first eight characters");

const base: PresignInput = {
  method: "PUT",
  endpoint: "https://acct.r2.cloudflarestorage.com/eve-media",
  key: "00000000-0000-0000-0000-000000000001/gallery/abc.jpg",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "auto",
  expiresIn: 300,
  now: new Date("2026-08-13T10:15:30Z"),
};

const url = presign(base);
assert(url.startsWith("https://acct.r2.cloudflarestorage.com/eve-media/"), "the URL points at the object");
for (const param of ["X-Amz-Algorithm", "X-Amz-Credential", "X-Amz-Date", "X-Amz-Expires", "X-Amz-SignedHeaders", "X-Amz-Signature"]) {
  assert(url.includes(`${param}=`), `carries ${param}`);
}
assert(/X-Amz-Signature=[0-9a-f]{64}$/.test(url), "the signature is 64 hex characters and comes last");
assert(url.includes("X-Amz-Credential=AKIDEXAMPLE%2F20260813%2Fauto%2Fs3%2Faws4_request"), "the credential scope is encoded into the query");

// Deterministic in, deterministic out — a signature that varied per call could never be debugged.
assert(presign(base) === url, "signing the same request twice gives the same URL");
assert(presign({ ...base, method: "GET" }) !== url, "the method is signed");
assert(presign({ ...base, key: base.key.replace("abc", "abd") }) !== url, "the key is signed");
assert(presign({ ...base, expiresIn: 600 }) !== url, "the expiry is signed");
assert(presign({ ...base, secretAccessKey: "other" }) !== url, "the secret is signed");
assert(presign({ ...base, now: new Date("2026-08-14T10:15:30Z") }) !== url, "the date is signed");

// The query must be in sorted order, because that is the order the server rebuilds it in.
const query = url.split("?")[1].split("&").map((p) => p.split("=")[0]);
const withoutSignature = query.slice(0, -1);
assert(
  withoutSignature.join() === [...withoutSignature].sort().join(),
  `canonical query is sorted — got ${withoutSignature.join()}`,
);

assert(!url.includes(base.secretAccessKey), "the secret key never appears in the URL");

console.log("files/sigv4 self-check passed");
