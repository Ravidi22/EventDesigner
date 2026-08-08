// Seed events for the dashboard (stands in for the DB `events` table), spread across the stages of
// the default meeting flow (lib/meeting/steps.ts) so the derived statuses all show. `step` is an
// index into that flow — a studio that reorders its own meeting just reads these marks differently.
// The first one is the "live" sample the studio works on.
// zoneIds are the real reference (lib/venues); zonesLabel mirrors their names at save time.
//
// Deliberately includes, so the Gantt room chart, Dashboard, and calendar have something to show:
// - noa-itai: spans TWO zones of חוות רונית — the חופה for the ceremony, the big hall for the
//   dinner. The multi-zone case the venue plane exists for, and what the studio opens on. Also
//   the one event carrying a second contact, so the drawer's contact block has a full case.
// - tamar-eyal: the big hall on the same date — the double-booking the Gantt chart exists to catch.
// - yael-bat: a second zone under venue-ronit, so that venue has two rows.
// - dana-cohen: no zones yet (not chosen in the details step) — shows on the Dashboard, correctly
//   absent from the Gantt, which only has rows for chosen zones.
// - liran-noy: archived — shows the archive filter still works alongside the rest.
// - keren-omri: a genuinely past, completed wedding that was never archived — the ordinary
//   "already happened" case, distinct from liran-noy's explicit archiving.
// - adi-noam: a wedding on today's sample "now" — Today's Focus's "אירועים" tab and the
//   calendar's "present" case both need a real event landing on the current date.
// - noa-itai + yael-bat also carry a meetingDate on that same "now", so Today's Focus's
//   "פגישות" tab has something real to show without touching the event date itself.
import type { EventSummary } from "./types";

export const SAMPLE_EVENTS: EventSummary[] = [
  { id: "ev-noa-itai", clientName: "נועה ואיתי", phone: "052-1234567", contactName: "נועה", contact2Name: "אמא של נועה - רונית", contact2Phone: "054-8887766", date: "2026-08-14", time: "20:00", meetingDate: "2026-07-31", venueId: "venue-ronit", zoneIds: ["z-ronit-big", "z-ronit-big-canopy"], zonesLabel: "אולם גדול · חופה אולם גדול", guests: 240, step: 3, createdAt: Date.parse("2026-06-20") },
  { id: "ev-tamar-eyal", clientName: "תמר ואייל", phone: "058-3334455", date: "2026-08-14", time: "20:00", venueId: "venue-ronit", zoneIds: ["z-ronit-big"], zonesLabel: "אולם גדול", guests: 160, step: 2, createdAt: Date.parse("2026-05-15") },
  { id: "ev-shira-roi", clientName: "שירה ורועי", phone: "054-7654321", date: "2026-09-02", time: "19:30", venueId: "venue-hadar", zoneIds: ["z-hadar-hall"], zonesLabel: "אולם ראשי", guests: 180, step: 4, quoteSentAt: Date.parse("2026-07-01"), createdAt: Date.parse("2026-06-28") },
  { id: "ev-yael-bat", clientName: "בת מצווה — יעל", phone: "050-9998877", date: "2026-09-21", meetingDate: "2026-07-31", venueId: "venue-ronit", zoneIds: ["z-ronit-small"], zonesLabel: "אולם קטן", guests: 120, step: 2, createdAt: Date.parse("2026-07-05") },
  { id: "ev-mor-alon", clientName: "מור ואלון", phone: "053-2211334", date: "2026-10-09", venueId: "venue-hadar", zoneIds: ["z-hadar-garden"], zonesLabel: "גן", guests: 300, step: 1, createdAt: Date.parse("2026-07-10") },
  { id: "ev-dana-cohen", clientName: "דנה כהן", phone: "052-7778899", date: "2026-11-02", zoneIds: [], zonesLabel: "", guests: 80, step: 0, createdAt: Date.parse("2026-07-20") },
  { id: "ev-adi-noam", clientName: "עדי ונועם", phone: "052-3312211", date: "2026-07-31", time: "19:00", venueId: "venue-ronit", zoneIds: ["z-ronit-small"], zonesLabel: "אולם קטן", guests: 140, step: 4, quoteSentAt: Date.parse("2026-07-15"), createdAt: Date.parse("2026-06-01") },
  { id: "ev-keren-omri", clientName: "קרן ועומרי", phone: "050-4445566", date: "2026-07-18", time: "18:30", venueId: "venue-ronit", zoneIds: ["z-ronit-big"], zonesLabel: "אולם גדול", guests: 200, step: 4, quoteSentAt: Date.parse("2026-06-10"), createdAt: Date.parse("2026-05-01") },
  { id: "ev-liran-noy", clientName: "לירן ונוי", phone: "054-1112233", date: "2026-07-05", venueId: "venue-hadar", zoneIds: ["z-hadar-hall"], zonesLabel: "אולם ראשי", guests: 140, step: 4, quoteSentAt: Date.parse("2026-06-01"), archived: true, createdAt: Date.parse("2026-05-20") },
];
