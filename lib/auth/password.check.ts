// npm run check:password — the self-check of ./password.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { hashPassword, passwordProblem, verifyPassword } from "./password";

// ── self-check ─────────────────────────────────────────────────────────────────────────────────
// npm run check:password
//
// Wrapped in an async IIFE rather than written with top-level await: tsx compiles this project's
// modules to CommonJS (there is no "type": "module"), and top-level await is an ESM-only feature.
// Every other self-check in lib/ is synchronous and never met this edge.
void (async () => {
let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failed++;
};

const secret = "סיסמה-חזקה-1234";
const stored = await hashPassword(secret);

check("the encoding is scrypt$N$r$p$salt$hash", stored.split("$").length === 6 && stored.startsWith("scrypt$"), stored.slice(0, 24));
check("the right password verifies", await verifyPassword(secret, stored));
check("a wrong password does not", !(await verifyPassword(secret + "x", stored)));
// Latin on purpose: uppercasing the Hebrew password above returns it UNCHANGED — Hebrew is
// caseless — so it would have verified and the assertion would have been backwards.
const latin = "CorrectHorse7";
check("verification is case-sensitive", !(await verifyPassword(latin.toLowerCase(), await hashPassword(latin))));

// The salt is why: two people who chose the same password must not share a hash, or cracking one
// cracks every account that reused it.
const again = await hashPassword(secret);
check("the same password hashes differently every time", again !== stored);
check("…and both still verify", await verifyPassword(secret, again));

// An invited member has NULL here. It must read as "wrong password", not as an error and not as
// a pass — a null hash that verified would be an account anyone could walk into.
check("a null hash never verifies", !(await verifyPassword("anything", null)));
check("an empty hash never verifies", !(await verifyPassword("anything", "")));
check("a garbage hash never verifies", !(await verifyPassword("anything", "not-a-hash")));
check("a truncated hash never verifies", !(await verifyPassword(secret, stored.split("$").slice(0, 4).join("$"))));

// Hebrew and emoji survive the trip: the password box is on an RTL page, and NFKC normalisation
// has to be applied identically on both sides or a password typed on a different keyboard layout
// stops working.
const unicode = "אבג😀-שמונה";
const uHash = await hashPassword(unicode);
check("a Hebrew password round-trips", await verifyPassword(unicode, uHash));
check("normalisation is applied on both sides", await verifyPassword(unicode.normalize("NFD"), uHash));

check("7 characters is refused", passwordProblem("1234567") !== null);
check("8 characters is accepted", passwordProblem("12345678") === null);

console.log(failed === 0 ? "\nALL PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
})();
