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

const ALGORITHM = "AWS4-HMAC-SHA256";
/** Presigned PUTs do not sign the body — the browser holds it and we never see it. */
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

export const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
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
  /** Extra query parameters, signed with the rest — a bucket-level ListObjectsV2 (`key: ""`). */
  params?: readonly (readonly [string, string])[];
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
  const bucket = input.endpoint.replace(/\/$/, "");
  const url = new URL(input.key ? bucket + "/" + input.key.replace(/^\//, "") : bucket);
  const { amzDate, dateStamp } = amzDates(input.now ?? new Date());
  const scope = `${dateStamp}/${input.region}/s3/aws4_request`;

  // `host` is the only signed header. Every other header the browser sends is therefore free to
  // vary, which matters because we do not control what a browser attaches to a PUT.
  const query: (readonly [string, string])[] = [
    ["X-Amz-Algorithm", ALGORITHM],
    ["X-Amz-Credential", `${input.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(input.expiresIn)],
    ["X-Amz-SignedHeaders", "host"],
    ...(input.params ?? []),
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
