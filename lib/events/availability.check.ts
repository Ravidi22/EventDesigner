// npm run check:availability — the self-check of ./availability.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { EventSummary } from "./types";
import { availabilityLine } from "./availability";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const ev = (id: string, patch: Partial<EventSummary>): EventSummary => ({
  id,
  clientName: id,
  phone: "",
  date: "",
  zoneIds: [],
  zonesLabel: "",
  guests: 0,
  step: 0,
  createdAt: 0,
  ...patch,
});
const base = { date: "2026-11-12", venueId: "v1", zoneIds: ["hall"], place: "אולם גדול" };
const line = (events: EventSummary[], over: Partial<typeof base> & { selfId?: string } = {}) =>
  availabilityLine({ ...base, ...over, events });

// No date, nothing to say.
assert(line([ev("נועה ואיתי", { date: "2026-11-12", venueId: "v1", zoneIds: ["hall"] })], { date: "" }) === null, "no date: null");

// The same day, the same venue, a zone in common: the room is taken.
const clash = line([ev("נועה ואיתי", { date: "2026-11-12", venueId: "v1", zoneIds: ["hall", "garden"], zonesLabel: "אולם גדול · גן" })]);
assert(clash?.tone === "busy", "shared zone: busy");
assert(!!clash?.text.startsWith("ביום הזה כבר: נועה ואיתי"), "shared zone: names the client — " + clash?.text);

// The same day, the same venue, another part of it.
const beside = line([ev("נועה ואיתי", { date: "2026-11-12", venueId: "v1", zoneIds: ["garden"], zonesLabel: "גן" })]);
assert(beside?.tone === "info", "same venue, no shared zone: info");
assert(beside?.text === "ביום הזה גם: נועה ואיתי · גן", "same venue, no shared zone: client and zones — " + beside?.text);

// The same day somewhere else.
const elsewhere = line([ev("נועה ואיתי", { date: "2026-11-12", venueId: "v2", zoneIds: ["hall"], zonesLabel: "אולם" })]);
assert(elsewhere?.tone === "info", "another venue the same day: info");
assert(!!elsewhere?.text.startsWith("ביום הזה גם: נועה ואיתי"), "another venue: names the client — " + elsewhere?.text);

// A free day says so, in the place's own words.
const free = line([ev("נועה ואיתי", { date: "2026-11-20", venueId: "v1", zoneIds: ["hall"] })]);
assert(free?.tone === "free" && free.text === "אולם גדול פנוי ביום הזה", "free: the place is free — " + free?.text);
assert(line([], { place: "" })?.text === "אין אירוע אחר ביום הזה", "free with no place: nothing else that day");
assert(line([], { place: "אולם גדול · חופה", zoneIds: ["hall", "chuppah"] })?.text === "אולם גדול · חופה פנויים ביום הזה", "free, several zones: plural");

// The evening before (one or two days), in the same venue.
const eve = line([ev("נועה ואיתי", { date: "2026-11-10", venueId: "v1", zoneIds: ["hall"] })]);
assert(eve?.tone === "free" && eve.text === "אולם גדול פנוי ביום הזה · ערב קודם: נועה ואיתי (10.11)", "two days before: the eve — " + eve?.text);
assert(!!line([ev("א", { date: "2026-11-11", venueId: "v1" })])?.text.endsWith(" · ערב קודם: א (11.11)"), "the day before: the eve");
assert(!line([ev("א", { date: "2026-11-09", venueId: "v1" })])?.text.includes("ערב קודם"), "three days before: not the eve");
assert(!line([ev("א", { date: "2026-11-11", venueId: "v2" })])?.text.includes("ערב קודם"), "the eve at another venue does not count");
assert(!!line([ev("א", { date: "2026-11-11", venueId: "v2" })], { venueId: "", zoneIds: [], place: "" })?.text.includes("ערב קודם: א (11.11)"), "no venue picked: any venue's eve counts");
assert(!line([ev("א", { date: "2026-11-13", venueId: "v1" })])?.text.includes("ערב קודם"), "the day after is not the eve");
assert(
  !!line([ev("א", { date: "2026-11-30", venueId: "v1" })], { date: "2026-12-01" })?.text.endsWith(" · ערב קודם: א (30.11)"),
  "the eve across a month",
);
const busyEve = line([
  ev("ב", { date: "2026-11-12", venueId: "v1", zoneIds: ["hall"] }),
  ev("א", { date: "2026-11-11", venueId: "v1" }),
]);
assert(busyEve?.tone === "busy" && busyEve.text === "ביום הזה כבר: ב · ערב קודם: א (11.11)", "busy with an eve — " + busyEve?.text);

// What never counts: archived, lost, the event itself.
const sameDay = { date: "2026-11-12", venueId: "v1", zoneIds: ["hall"] };
assert(line([ev("א", { ...sameDay, archived: true })])?.tone === "free", "archived does not count");
assert(line([ev("א", { ...sameDay, lostAt: 1 })])?.tone === "free", "lost does not count");
assert(line([ev("self", sameDay)], { selfId: "self" })?.tone === "free", "the event itself does not count");
assert(!line([ev("א", { date: "2026-11-11", venueId: "v1", archived: true })])?.text.includes("ערב קודם"), "an archived eve does not count");
assert(!line([ev("self", { date: "2026-11-11", venueId: "v1" })], { selfId: "self" })?.text.includes("ערב קודם"), "the event itself is no eve");

console.log("availability: ok");
