// AWS Signature Version 4, presigned-URL flavour — the one thing standing between this app and
// Cloudflare R2, written by hand.
//
// WHY NOT THE SDK. `@aws-sdk/client-s3` plus `@aws-sdk/s3-request-presigner` is roughly 15MB of
// dependency to produce one signed URL, in a project that removed `pdfjs-dist` for being unused and
// whose whole architecture note (ADR-7, docs/02) is about not renting a fourth thing. The signature
// is a documented HMAC chain and fits on a page; the SDK's value is the other 200 S3 operations
// this app will never call.
//
// WHAT A PRESIGNED URL IS. A URL that carries its own authorisation in the query string, so the
// BROWSER can PUT bytes straight into the bucket without them passing through this Node process —
// which is the reason photographs are cheap here: egress out of R2 is free, and a request that
// never reaches the server costs nothing to serve.
//
// ⚠ UNVERIFIED AGAINST A REAL BUCKET. Everything below is exercised by the self-check, and the
// hashing primitives are checked against published constants — but nobody has yet watched a byte
// land in R2, because that needs an account. The first real upload is the test that matters; if it
// returns 403, the canonical request is where to look (log it and compare against the string R2
// echoes back in the error).
import { createHash, createHmac } from "node:crypto";
import { isMain } from "../self-check";

const ALGORITHM = "AWS4-HMAC-SHA256";
/** Presigned PUTs do not sign the body — the browser holds it and we never see it. */
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value, "utf8").digest();

/**
 * RFC 3986 percent-encoding, which is NOT what encodeURIComponent does.
 *
 * `encodeURIComponent` leaves `!'()*` alone. S3 requires them encoded, and a signature computed
 * over a differently-encoded string is simply wrong — this is the single most common reason a
 * hand-rolled SigV4 returns 403 on exactly the files whose names contain a bracket.
 *
 * `encodeSlash` is false for object keys, whose `/` separators stay literal in the canonical path.
 */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const char of Buffer.from(value, "utf8")) {
    const c = String.fromCharCode(char);
    if (/[A-Za-z0-9\-._~]/.test(c)) out += c;
    else if (c === "/") out += encodeSlash ? "%2F" : "/";
    else out += "%" + char.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

/** `20260813T101530Z` and `20260813` — the two forms every part of the signature wants. */
export function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/** The four-step key derivation. Each round narrows the key to one day, one region, one service —
 *  which is what makes a leaked signature useless tomorrow, elsewhere, or for anything but S3. */
export function signingKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export interface PresignInput {
  method: "PUT" | "GET" | "DELETE";
  /** The bucket endpoint, e.g. `https://<account>.r2.cloudflarestorage.com/<bucket>`. */
  endpoint: string;
  /** The object key, unencoded. */
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** Seconds the URL stays valid. Short on purpose: it is a bearer credential in a query string. */
  expiresIn: number;
  now?: Date;
}

/**
 * A presigned URL for one object and one method.
 *
 * The canonical request is built in the exact order AWS specifies — method, path, query, headers,
 * signed-header list, payload hash — because the server rebuilds the same string from the request
 * it receives and compares signatures. Any disagreement about ordering, encoding or whitespace
 * shows up as 403 with no explanation of which byte differed.
 */
export function presign(input: PresignInput): string {
  const url = new URL(input.endpoint.replace(/\/$/, "") + "/" + input.key.replace(/^\//, ""));
  const { amzDate, dateStamp } = amzDates(input.now ?? new Date());
  const scope = `${dateStamp}/${input.region}/s3/aws4_request`;

  // `host` is the only signed header. Every other header the browser sends is therefore free to
  // vary, which matters because we do not control what a browser attaches to a PUT.
  const query: [string, string][] = [
    ["X-Amz-Algorithm", ALGORITHM],
    ["X-Amz-Credential", `${input.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(input.expiresIn)],
    ["X-Amz-SignedHeaders", "host"],
  ];

  // Sorted by encoded key — AWS compares byte order, not insertion order.
  const canonicalQuery = query
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalPath = uriEncode(decodeURIComponent(url.pathname), false);
  const canonicalRequest = [
    input.method,
    canonicalPath,
    canonicalQuery,
    `host:${url.host}\n`,
    "host",
    UNSIGNED_PAYLOAD,
  ].join("\n");

  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(
    signingKey(input.secretAccessKey, dateStamp, input.region, "s3"),
    stringToSign,
  ).toString("hex");

  return `${url.origin}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ponytail: self-check. Run: npm run check:sigv4
//
// ⚠ WHAT THIS CAN AND CANNOT PROVE. It checks the primitives against published constants, and the
// structure and determinism of everything built on them. It does NOT prove R2 will accept the
// result — no test without a bucket can. Read it as "the algorithm is implemented as written",
// not as "uploads work".
if (isMain(import.meta.url)) {
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
}
