// npm run check:event-links — the self-check of ./types.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { changedFacts, followedPatch, SHARED_FACTS } from "./types";

// ponytail: self-check. Run: npm run check:event-links
const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};
const a = { date: "2026-12-01", time: "19:30", venueId: "v", zoneIds: ["z1", "z2"], guests: 300 };
assert(changedFacts(a, { ...a }).length === 0, "nothing moved, nothing said");
assert(changedFacts(a, { ...a, guests: 320, date: "2026-12-02" }).join() === "date,guests", "each moved fact is named once");
assert(changedFacts(a, { ...a, zoneIds: ["z2", "z1"] }).join() === "zoneIds", "the zones' order is the venue's and counts");
const patch = followedPatch({ ...a, zonesLabel: "אולם · חופה" });
assert(Object.keys(patch).sort().join() === "date,guests,time,venueId,zoneIds,zonesLabel", "the follow writes the shared facts and nothing else");
assert(SHARED_FACTS.every((f) => f in patch), "every shared fact is in the patch");
console.log("event links self-check passed");
