// npm run check:hosting — the self-check of ./types.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { MenuPackage } from "@/lib/menus/types";
import { bookingStatus, emptyHosting, linesTotal, occupies, packageLines } from "./types";

// ponytail: self-check. Run: npm run check:hosting
const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};
const today = "2026-10-30";
const ev = { date: "2026-12-01" };
assert(bookingStatus(ev, null, today) === "inquiry", "nothing typed is an inquiry");
assert(bookingStatus(ev, { holdUntil: "2026-11-05" }, today) === "hold", "a hold in force holds");
assert(bookingStatus(ev, { holdUntil: "2026-10-29" }, today) === "hold_expired", "a hold past its day is expired");
assert(!occupies("hold_expired") && occupies("hold"), "an expired hold frees the date");
assert(bookingStatus({ ...ev, confirmedAt: 1 }, { holdUntil: "2026-10-29" }, today) === "booked", "an order outranks the hold");
assert(bookingStatus({ ...ev, confirmedAt: 1 }, { finalClosedAt: 2 }, today) === "closed", "a closed count reads as closed");
assert(bookingStatus({ date: "2026-10-01", confirmedAt: 1 }, null, today) === "held", "a booked date in the past was held");
assert(bookingStatus({ ...ev, lostAt: 1, confirmedAt: 1 }, null, today) === "lost", "lost outranks booked");

const pkg: MenuPackage = {
  id: "p",
  name: "זהב",
  description: "",
  priceAdult: 300,
  priceChild: 150,
  priceVendor: 90,
  minGuests: 250,
  courses: [],
  extras: [
    { id: "sushi", name: "עמדת סושי", price: 20, per: "guest" },
    { id: "dj", name: "תאורה", price: 1500, per: "event" },
  ],
};
const h = { ...emptyHosting(), children: 20, vendorMeals: 10, extraIds: ["sushi", "dj"] };
const lines = packageLines(pkg, h, 300);
assert(lines[0].qty === 280 && lines[0].total === 84000, "adults are the head count less the children");
assert(lines[1].qty === 20 && lines[2].qty === 10, "children and vendor meals at their own price");
assert(lines[3].qty === 300 && lines[4].qty === 1, "a per-guest extra counts every head, a per-event one once");
assert(linesTotal(lines) === 84000 + 3000 + 900 + 6000 + 1500, "the total is the sum of the lines");
const low = packageLines(pkg, { ...h, finalGuests: 200 }, 300);
assert(low[0].qty === 250 && low[0].label.includes("מינימום"), "a final count under the minimum bills the minimum, and says so");
const own = packageLines(pkg, { ...h, finalGuests: 200, guaranteedMin: 180 }, 300);
assert(own[0].qty === 180, "the booking's own minimum overrides the package's");
console.log("hosting self-check passed");
