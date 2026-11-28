// npm run check:appointments — the self-check of ./types.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { APPOINTMENT_KIND_LABEL, APPOINTMENT_KINDS, appointmentEnd, appointmentLabel, appointmentTimeLabel, byDate, byStartTime, hasPassed, isAppointmentKind, isClientKind, minutesOfDay, type Appointment } from "./types";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const at = (time: string | undefined, durationMin = 60): Appointment => ({
  id: "a",
  clientName: "",
  phone: "",
  date: "2026-08-16",
  time,
  durationMin,
  kind: "consultation",
  note: "",
  createdAt: 0,
});

assert(minutesOfDay("17:00") === 1020, "17:00 is 1020 minutes in");
assert(minutesOfDay("00:00") === 0, "midnight is zero, not falsy-null");
assert(minutesOfDay(undefined) === null, "no time is null");
assert(minutesOfDay("25:00") === null, "an impossible hour is null, not 1500");
assert(minutesOfDay("7:5") === null, "unpadded is refused rather than guessed at");

assert(appointmentEnd(at("17:00", 90)) === "18:30", "an hour and a half later");
assert(appointmentEnd(at("17:00", 60)) === "18:00", "on the hour");
assert(appointmentEnd(at("09:05", 20)) === "09:25", "both halves stay padded");
assert(appointmentEnd(at(undefined)) === undefined, "no start, no end");
assert(appointmentEnd(at("23:30", 120)) === "23:59", "past midnight clamps, never wraps to 01:30");

assert(appointmentTimeLabel(at("17:00", 90)) === "‎17:00–18:30", "a range");
assert(appointmentTimeLabel(at("17:00", 0)) === "‎17:00", "no duration, no dash");
assert(appointmentTimeLabel(at(undefined)) === "", "a day without an hour prints nothing");

assert(appointmentLabel({ clientName: "  ", kind: "consultation" }) === "פגישת היכרות", "a blank name falls back to the kind");
assert(appointmentLabel({ clientName: "", kind: "vacation" }) === "חופשה", "a nameless kind names itself");
assert(appointmentLabel({ clientName: "נועה ואיתי", kind: "followup" }) === "נועה ואיתי", "a real name is used");

assert(hasPassed(at("09:00", 60), 10 * 60), "an hour that ended is behind us");
assert(!hasPassed(at("09:00", 60), 9 * 60 + 59), "one minute short is not");
assert(hasPassed(at("09:00", 60), 10 * 60) && !hasPassed(at("09:00", 90), 10 * 60), "the DURATION decides, not the start");
assert(!hasPassed(at(undefined), 23 * 60), "an entry with no hour never passes");
assert(hasPassed(at("00:00", 0), 0), "a zero-length entry passes at its own minute");

const day = [at("17:00"), at(undefined), at("09:00")];
const sorted = [...day].sort(byStartTime);
assert(sorted[0].time === "09:00" && sorted[1].time === "17:00", "the day runs in clock order");
assert(sorted[2].time === undefined, "an hourless meeting sits at the end, not at 00:00");

const grouped = byDate([{ ...at("17:00"), date: "2026-08-17" }, at("09:00"), at("08:00")]);
assert(grouped.size === 2, "two dates, two buckets");
assert(grouped.get("2026-08-16")?.[0].time === "08:00", "each bucket is sorted");

assert(isAppointmentKind("walkthrough") && isAppointmentKind("vacation") && !isAppointmentKind("dinner"), "the kind guard holds");
assert(APPOINTMENT_KINDS.every((k) => APPOINTMENT_KIND_LABEL[k]), "every kind has a Hebrew label");
assert(!isClientKind("vacation") && isClientKind("other"), "only the client kinds ask for a client");

console.log("appointments self-check passed");
