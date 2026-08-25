// Encrypting a Google refresh token at rest.
//
// WHY THIS EXISTS WHEN THE DATABASE IS ALREADY PRIVATE. A refresh token is not a password hash and
// cannot be one: the app has to send the ORIGINAL value back to Google, so it must be recoverable,
// which rules out scrypt (lib/auth/password.ts) and everything else one-way. It is also long-lived
// and does not expire on its own — a leaked dump of this column is standing read access to every
// connected designer's calendar until each of them notices and revokes it by hand.
//
// So the threat this closes is narrow and real: a database dump that reaches somewhere the
// application's environment does not. A Neon snapshot in the wrong bucket, a backup on a laptop, a
// support export. In all of those the ciphertext is inert, because GOOGLE_TOKEN_KEY lives in the
// deployment's environment and not in the database. It does NOT protect against an attacker who
// already has the running server — nothing at this layer could, since that process must be able to
// decrypt by definition.
//
// AES-256-GCM FROM node:crypto, no library — the same reasoning as password.ts. It is authenticated
// encryption, so a tampered ciphertext fails to open rather than decrypting to garbage that then
// gets sent to Google as a token.
//
// ⚠ SERVER ONLY. It reads the key.
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { isMain } from "@/lib/self-check";

/** GCM's standard nonce length. 12 bytes is what the mode is specified around; other lengths are
 *  legal and slower, and none of them buy anything here. */
const IV_BYTES = 12;
/** GCM's authentication tag. */
const TAG_BYTES = 16;

/** Version prefix on every stored value.
 *
 *  It costs two characters and it is what makes the key rotatable: the day GOOGLE_TOKEN_KEY has to
 *  change, `open()` can branch on this to try the old key for `v1` rows while writing `v2`. Without
 *  it, rotation means "every connection breaks at once and every designer re-consents", which is
 *  the kind of migration that does not get done and so the key never gets rotated. */
const VERSION = "v1";

/**
 * Encrypt a token for storage. Output is `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 *
 * The IV is random per call and stored alongside — that is its job, not a secret. Reusing one under
 * the same key is the single catastrophic mistake available in GCM (it leaks the XOR of two
 * plaintexts and, worse, the authentication subkey), which is why it is minted here on every call
 * rather than derived from anything about the row.
 */
export function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, b64(iv), b64(tag), b64(ciphertext)].join(".");
}

/**
 * Decrypt a stored token, or null if it cannot be opened.
 *
 * NULL RATHER THAN A THROW, because every caller's answer to "this did not open" is the same and it
 * is not an exception: the connection is broken and the designer has to reconnect. That happens for
 * ordinary operational reasons — the key was rotated, the row was restored from a backup taken
 * under a different key — and it should surface in the settings screen as "התחבר מחדש", not as a
 * 500 out of a server action.
 */
export function open(stored: string, key: Buffer): string | null {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const iv = unb64(parts[1]);
    const tag = unb64(parts[2]);
    const ciphertext = unb64(parts[3]);
    if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES) return null;

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // `final()` throws when the tag does not verify — a tampered or truncated row, or the wrong key.
    return null;
  }
}

/** base64url, so the value is safe in a log line, a URL and a JSON string without escaping. */
const b64 = (b: Buffer): string => b.toString("base64url");
const unb64 = (s: string): Buffer => Buffer.from(s, "base64url");

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };

  const key = randomBytes(32);
  const other = randomBytes(32);
  const token = "1//0gAbCdEfGhIjKlMnOpQrStUvWxYz-a_refresh_token";

  const sealed = seal(token, key);
  assert(open(sealed, key) === token, "a sealed token opens back to itself");
  assert(sealed.startsWith("v1."), "the stored form is versioned so the key can be rotated later");
  assert(!sealed.includes(token), "the token does not appear in its own ciphertext");

  assert(seal(token, key) !== seal(token, key), "a fresh IV per call — the same token seals differently twice");

  assert(open(sealed, other) === null, "the wrong key opens nothing");
  assert(open("v1.a.b.c", key) === null, "a malformed value opens nothing");
  assert(open("garbage", key) === null, "a value that is not even shaped right opens nothing");
  assert(open("v2." + sealed.slice(3), key) === null, "an unknown version is refused rather than guessed at");

  // Tamper with one character of the ciphertext and confirm the tag catches it. This is the
  // property a plain AES-CBC would NOT have — there the row would decrypt to rubbish and get sent
  // to Google as a token.
  const parts = sealed.split(".");
  const bytes = Buffer.from(parts[3], "base64url");
  bytes[0] ^= 0xff;
  parts[3] = bytes.toString("base64url");
  assert(open(parts.join("."), key) === null, "a flipped bit fails authentication rather than decrypting");

  // An empty string is a legal plaintext and must round-trip: a token that came back empty is a
  // different bug from one that failed to decrypt, and conflating them hides the first.
  assert(open(seal("", key), key) === "", "an empty token round-trips as empty, not as null");

  // Non-ASCII, because Hebrew reaches other columns in this app and a utf8 slip here would be found
  // in production rather than in a test.
  assert(open(seal("שלום-token", key), key) === "שלום-token", "utf8 survives the round trip");

  assert(timingSafeEqual(key, key), "sanity: the key buffers compare");

  console.log("google secret-box self-check passed");
}
