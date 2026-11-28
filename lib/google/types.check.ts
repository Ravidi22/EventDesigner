// npm run check:google — the self-check of ./types.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { busyKey, STUDIO_TIMEZONE } from "./types";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

assert(busyKey("abc", "primary").startsWith("g:"), "a google key is namespaced away from a uuid");
assert(busyKey("a", "c1") !== busyKey("a", "c2"), "the same event id on two calendars is two keys");
assert(STUDIO_TIMEZONE === "Asia/Jerusalem", "the studio clock is Israel's");

console.log("google types self-check passed");
