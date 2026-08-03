// Seed events for the dashboard (stands in for the DB `events` table), one per flow stage
// so the derived statuses all show. The first one is the "live" sample the studio works on.
// hallTemplateId is the real reference (lib/setup); hallName mirrors the resolved template's
// name at save time.
//
// Deliberately includes, so the Gantt, Dashboard, and calendar have something to show:
// - noa-itai + tamar-eyal: same hall (hall-ronit-big), same date — a double-booking.
// - yael-bat: a second hall under venue-ronit (hall-ronit-small), so that venue has two rows.
// - dana-cohen: no hallTemplateId yet (hall not chosen in the details step) — since Gantt and
//   the Dashboard both scope to "the active venue" via the event's hall, she correctly doesn't
//   appear under ANY venue until a hall is picked (there's no venue to resolve her into yet).
// - liran-noy: archived — shows the archive filter still works alongside the rest.
// - keren-omri: a genuinely past, completed wedding that was never archived — the ordinary
//   "already happened" case, distinct from liran-noy's explicit archiving.
// - adi-noam: a wedding on today's sample "now" — Today's Focus's "אירועים" tab and the
//   calendar's "present" case both need a real event landing on the actual current date.
// - noa-itai + yael-bat also carry a meetingDate on today — one consultation per hall within
//   venue-ronit, so the "פגישות" tab has something real to show across the venue's two halls.
import type { EventSummary } from "./types";

export const SAMPLE_EVENTS: EventSummary[] = [
  { id: "ev-keren-omri", clientName: "קרן ועומרי", phone: "050-4445566", date: "2026-07-18", time: "18:30", hallTemplateId: "hall-ronit-big", hallName: "אולם גדול", guests: 200, step: 6, quoteSentAt: Date.parse("2026-06-10"), createdAt: Date.parse("2026-05-01") },
  { id: "ev-adi-noam", clientName: "עדי ונועם", phone: "052-3312211", date: "2026-07-31", time: "19:00", hallTemplateId: "hall-ronit-small", hallName: "אולם קטן", guests: 140, step: 6, quoteSentAt: Date.parse("2026-07-15"), createdAt: Date.parse("2026-06-01") },
  { id: "ev-noa-itai", clientName: "נועה ואיתי", phone: "052-1234567", contactName: "נועה", contact2Name: "אמא של נועה - רונית", contact2Phone: "054-8887766", date: "2026-08-14", time: "20:00", meetingDate: "2026-07-31", hallTemplateId: "hall-ronit-big", hallName: "אולם גדול", guests: 240, step: 5, createdAt: Date.parse("2026-06-20") },
  { id: "ev-tamar-eyal", clientName: "תמר ואייל", phone: "058-3334455", date: "2026-08-14", time: "20:00", hallTemplateId: "hall-ronit-big", hallName: "אולם גדול", guests: 160, step: 3, createdAt: Date.parse("2026-05-15") },
  { id: "ev-shira-roi", clientName: "שירה ורועי", phone: "054-7654321", date: "2026-09-02", time: "19:30", hallTemplateId: "hall-hadar-main", hallName: "אולם הדר", guests: 180, step: 6, quoteSentAt: Date.parse("2026-07-01"), createdAt: Date.parse("2026-06-28") },
  { id: "ev-yael-bat", clientName: "בת מצווה — יעל", phone: "050-9998877", date: "2026-09-21", meetingDate: "2026-07-31", hallTemplateId: "hall-ronit-small", hallName: "אולם קטן", guests: 120, step: 2, createdAt: Date.parse("2026-07-05") },
  { id: "ev-mor-alon", clientName: "מור ואלון", phone: "053-2211334", date: "2026-10-09", hallTemplateId: "hall-zayit-chuppah", hallName: "חופה", guests: 300, step: 1, createdAt: Date.parse("2026-07-10") },
  { id: "ev-dana-cohen", clientName: "דנה כהן", phone: "052-7778899", date: "2026-11-02", hallName: "טרם נבחר", guests: 80, step: 0, createdAt: Date.parse("2026-07-20") },
  { id: "ev-liran-noy", clientName: "לירן ונוי", phone: "054-1112233", date: "2026-07-05", hallTemplateId: "hall-hadar-main", hallName: "אולם הדר", guests: 140, step: 6, quoteSentAt: Date.parse("2026-06-01"), archived: true, createdAt: Date.parse("2026-05-20") },
];
