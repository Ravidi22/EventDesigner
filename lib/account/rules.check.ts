// npm run check:account — the self-check of ./rules.ts (EVE-22), kept beside it so it never ships in
// the browser bundle (EVE-54).
import {
  CLOSE_GRACE_DAYS,
  EVENT_SKELETON_KEEP,
  TAX_RECORDS_YEARS,
  closureState,
  eraseAfterOf,
  nameConfirms,
  retainUntilOf,
  retentionOver,
  eraseRunRefusal,
  skeletonPatch,
} from "./rules";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

// ── Grace ────────────────────────────────────────────────────────────────────────────────────────
assert(CLOSE_GRACE_DAYS === 30 && TAX_RECORDS_YEARS === 7, "the spec's two numbers");
const at = new Date("2026-11-27T10:00:00Z");
assert(eraseAfterOf(at).toISOString() === "2026-12-27T10:00:00.000Z", "30 days");
const c = { closedAt: at, eraseAfter: eraseAfterOf(at), erasedAt: null };
assert(closureState(null, at) === "open", "no row = open");
assert(closureState(c, new Date("2026-12-27T09:59:59Z")) === "closed", "inside grace");
assert(closureState(c, new Date("2026-12-27T10:00:00Z")) === "due", "due at the minute");
assert(closureState({ ...c, erasedAt: at }, at) === "erased", "erased wins");

// ── Retention ────────────────────────────────────────────────────────────────────────────────────
assert(retainUntilOf([]) === null, "nothing retained");
assert(retainUntilOf(["2025-03-01", "2026-11-20"]) === "2033-12-31", "latest year + 7, year end");
assert(retainUntilOf(["2026-11-20", "2025-03-01"]) === "2033-12-31", "order does not matter");
assert(!retentionOver("2033-12-31", new Date("2033-12-31T23:00:00Z")), "not on the last day");
assert(retentionOver("2033-12-31", new Date("2034-01-01T00:00:00Z")), "over the day after");
assert(!retentionOver(null, new Date("2099-01-01T00:00:00Z")), "nothing retained is never 'over'");

// ── Typing the name to close ────────────────────────────────────────────────────────────────────
assert(nameConfirms("  אירית   עיצובים ", "אירית עיצובים"), "spaces forgiven");
assert(!nameConfirms("אירית עיצוב", "אירית עיצובים"), "a different name refused");
assert(!nameConfirms("", "אירית עיצובים"), "empty refused");
assert(!nameConfirms("   ", "   "), "a blank name never confirms");
assert(!nameConfirms("Eve Studio", "eve studio"), "case counts");

// ── A retained event's skeleton ──────────────────────────────────────────────────────────────────
for (const kept of ["id", "organization_id", "event_date", "event_type", "client_name", "zones_label"]) {
  assert((EVENT_SKELETON_KEEP as readonly string[]).includes(kept), `${kept} is printed, so it is kept`);
}
const patch = skeletonPatch([
  { name: "id", notNull: true, dataType: "string" },
  { name: "client_name", notNull: true, dataType: "string" },
  { name: "phone", notNull: true, dataType: "string" },
  { name: "contact_name", notNull: false, dataType: "string" },
  { name: "venue_id", notNull: false, dataType: "string" },
  { name: "guests", notNull: true, dataType: "number" },
  { name: "archived", notNull: true, dataType: "boolean" },
]);
assert(patch.phone === "", "a NOT NULL text is blanked to ''");
assert(patch.contact_name === null, "a nullable text is blanked to null");
assert(patch.venue_id === null, "the venue link is cut (the venue may go)");
assert(!("id" in patch) && !("client_name" in patch), "kept columns are not in the patch");
assert(!("guests" in patch) && !("archived" in patch), "numbers and switches are not personal and stay");

// A name copied off the screen carries the isolate marks the label wraps it in (FSI … PDI).
assert(nameConfirms(`\u2068סטודיו (בדיקה)\u2069`, "סטודיו (בדיקה)"), "a pasted name with its isolate marks confirms");
assert(nameConfirms(`\u200fסטודיו\u200e`, "סטודיו"), "and so do stray direction marks");
assert(!nameConfirms(`\u2068\u2069`, "סטודיו"), "marks alone are still blank");

// The erase script against production: only with the bucket's driver, and never with a made-up clock.
assert(eraseRunRefusal({ prod: true, driver: "local", nowGiven: false }) !== null, "production with the local folder is refused");
assert(eraseRunRefusal({ prod: true, driver: "r2", nowGiven: true }) !== null, "production with --now is refused");
assert(eraseRunRefusal({ prod: true, driver: "r2", nowGiven: false }) === null, "production with the bucket runs");
assert(eraseRunRefusal({ prod: false, driver: "local", nowGiven: true }) === null, "a local run may use --now and the folder");

console.log("check:account — ok");
