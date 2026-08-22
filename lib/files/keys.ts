// What a stored file is CALLED, and what may be stored at all.
//
// Pure, no I/O, no imports beyond the self-check helper — so this runs under plain node and so the
// rules below are testable without a bucket, a database or a session. That matters more here than
// in most of the app: two of these functions are the only thing standing between a filename chosen
// by whoever is uploading and a path on a disk.
//
// THE KEY IS THE TENANT BOUNDARY. Every object lives under `<organizationId>/…`, so one studio's
// files cannot be named by another even if a key leaks: the prefix is written by the server from
// the session, never taken from the caller. A driver that trusted a caller-supplied key would hand
// the whole bucket to anyone who could guess an id.
import { isMain } from "../self-check";

/** What a file is FOR. It decides the folder and, later, which sizes get generated — not who may
 *  read it, which is the key prefix's job. */
export type FileKind = "gallery" | "product" | "underlay" | "logo";

export const FILE_KINDS: FileKind[] = ["gallery", "product", "underlay", "logo"];

export function isFileKind(value: unknown): value is FileKind {
  return typeof value === "string" && (FILE_KINDS as string[]).includes(value);
}

/**
 * What may be uploaded.
 *
 * An ALLOWLIST, not a blocklist, and extensions are derived FROM it rather than taken from the
 * filename — a file called `plan.jpg.svg` is an SVG, and an SVG is a script that runs on whatever
 * origin serves it. None of these can be.
 *
 * PDF is deliberately absent. Plan underlays are photographs or scans; the PDF import path was
 * cancelled (ADR-3) and re-admitting the file type is how it grows back by accident.
 */
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function isAllowedType(contentType: unknown): contentType is string {
  return typeof contentType === "string" && contentType in ALLOWED_TYPES;
}

/** 25 MB. A photograph off a phone is 2–8MB and a scanned hall plan can be larger; beyond this
 *  someone is uploading a raw file that will never render in a browser anyway. Enforced by the
 *  ticket AND by whatever accepts the bytes — a limit only the issuer checks is a suggestion. */
export const MAX_BYTES = 25 * 1024 * 1024;

/** Keys are built from an id we mint, never from the uploaded filename.
 *
 *  A filename is attacker-chosen text: it can contain `../`, a null byte, a 4,000-character name,
 *  a right-to-left override, or the name of a file that already exists. None of that is worth
 *  sanitising when the alternative is not using it — the original name, if it is ever wanted for a
 *  download prompt, belongs in a database column where it is data rather than a path. */
export function buildKey(organizationId: string, kind: FileKind, contentType: string): string {
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) throw new Error("unsupported file type");
  return `${organizationId}/${kind}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Is this a key this app could have produced?
 *
 * The local driver turns a key into a path on disk, so this is a path-traversal gate and is written
 * as an allowlist of shape: three segments, each from a small character set, and a `..` segment can
 * never match because a dot is only allowed inside the final filename and never alone.
 *
 * ⚠ It answers "is this well-formed", NOT "may you read it". The organisation prefix is compared
 * separately, by the caller that knows whose request it is.
 */
export function isSafeKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return false;
  const parts = value.split("/");
  if (parts.length !== 3) return false;
  const [org, kind, file] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(org)) return false;
  if (!isFileKind(kind)) return false;
  // uuid.ext, and nothing else — no dots outside the one before the extension.
  return /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(file);
}

/** The organisation a well-formed key belongs to. Null when the key is not one of ours. */
export function orgOfKey(key: string): string | null {
  return isSafeKey(key) ? key.split("/")[0] : null;
}

// ponytail: self-check. Run: npm run check:files
if (isMain(import.meta.url)) {
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
}
