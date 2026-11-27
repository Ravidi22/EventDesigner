// npm run check:google — the self-check of ./secret-box.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { randomBytes, timingSafeEqual } from "node:crypto";
import { open, seal } from "./secret-box";

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
