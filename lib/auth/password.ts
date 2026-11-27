// Password hashing, with scrypt from Node's own crypto.
//
// ⚠ SERVER ONLY — same rule as lib/db/org.ts. It imports node:crypto, which is itself a hard error
// in a browser bundle, so this one enforces itself.
//
// WHY scrypt AND NOT A LIBRARY: bcrypt and argon2 are native addons — a compiler on every machine
// that installs this, and a rebuild on every Node upgrade. scrypt is in the standard library, is a
// memory-hard KDF designed for exactly this, and is what Node's own documentation points at for
// password storage. There is nothing to install and nothing to keep up to date.
//
// WHY THE PARAMETERS ARE IN THE STORED STRING: the cost of a hash has to rise as hardware does, and
// a stored hash has to stay verifiable while it does. Writing N/r/p into each record means today's
// passwords keep working after the cost goes up, and each one can be re-hashed at its owner's next
// sign-in rather than in a migration that cannot possibly know anyone's password.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** N=16384 (2^14) is Node's own default and the usual interactive-login setting: roughly 16MB of
 *  memory and ~50–100ms per hash on a laptop. Slow enough to make a stolen table expensive to
 *  attack, fast enough that signing in does not feel like waiting. */
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** scrypt refuses to allocate past maxmem, whose default (32MB) sits close enough to what N=16384
 *  needs that a future bump to N would fail at runtime instead of at review. Stated explicitly. */
const MAX_MEM = 64 * 1024 * 1024;

/** `scrypt$N$r$p$salt$hash`, all base64 — one self-describing string, one column. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Whether `password` produced `stored`.
 *
 * Returns false for a malformed or absent hash rather than throwing: an invited member who has not
 * set a password yet has NULL here, and "there is no password on this account" must look exactly
 * like "that is the wrong password" from the outside. Anything else is an oracle telling a stranger
 * which of your emails are real accounts and which are pending invitations.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const N = Number(n);
  const rr = Number(r);
  const pp = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(rr) || !Number.isInteger(pp)) return false;

  const expected = Buffer.from(hashB64, "base64");
  let derived: Buffer;
  try {
    derived = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
      N,
      r: rr,
      p: pp,
      maxmem: MAX_MEM,
    });
  } catch {
    return false;
  }
  // Constant-time: a plain === leaks how many leading bytes matched, one timing sample at a time.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** The one password rule this app enforces, in one place so the form and the server agree.
 *
 *  Length only, deliberately. Composition rules ("one capital, one digit, one symbol") push people
 *  toward Password1! and are no longer recommended by anyone who measures the result; length is
 *  what actually costs an attacker. Returns a Hebrew message or null. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "הסיסמה חייבת להכיל לפחות 8 תווים";
  if (password.length > 200) return "הסיסמה ארוכה מדי";
  return null;
}
