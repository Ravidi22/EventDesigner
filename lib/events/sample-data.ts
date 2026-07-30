// Seed events for the dashboard (stands in for the DB `events` table), one per flow stage
// so the derived statuses all show. The first one is the "live" sample the studio works on.
// hallTemplateId is the real reference (lib/setup); hallName mirrors the resolved template's
// name at save time.
//
// Deliberately includes, so the Gantt room chart and Dashboard have something to show:
// - noa-itai + tamar-eyal: same hall (hall-ronit-big), same date — the double-booking the
//   Gantt room chart exists to catch.
// - yael-bat: a second hall under venue-ronit (hall-ronit-small), so that venue has two rows.
// - dana-cohen: no hallTemplateId yet (hall not chosen in the details step) — shows on the
//   Dashboard, correctly absent from the Gantt (which only has rows for chosen halls).
// - liran-noy: archived — shows the archive filter still works alongside the rest.
import type { EventSummary } from "./types";

export const SAMPLE_EVENTS: EventSummary[] = [
  { id: "ev-noa-itai", clientName: "נועה ואיתי", phone: "052-1234567", date: "2026-08-14", hallTemplateId: "hall-ronit-big", hallName: "אולם גדול", guests: 240, step: 5, createdAt: Date.parse("2026-06-20") },
  { id: "ev-tamar-eyal", clientName: "תמר ואייל", phone: "058-3334455", date: "2026-08-14", hallTemplateId: "hall-ronit-big", hallName: "אולם גדול", guests: 160, step: 3, createdAt: Date.parse("2026-05-15") },
  { id: "ev-shira-roi", clientName: "שירה ורועי", phone: "054-7654321", date: "2026-09-02", hallTemplateId: "hall-hadar-main", hallName: "אולם הדר", guests: 180, step: 6, quoteSentAt: Date.parse("2026-07-01"), createdAt: Date.parse("2026-06-28") },
  { id: "ev-yael-bat", clientName: "בת מצווה — יעל", phone: "050-9998877", date: "2026-09-21", hallTemplateId: "hall-ronit-small", hallName: "אולם קטן", guests: 120, step: 2, createdAt: Date.parse("2026-07-05") },
  { id: "ev-mor-alon", clientName: "מור ואלון", phone: "053-2211334", date: "2026-10-09", hallTemplateId: "hall-zayit-chuppah", hallName: "חופה", guests: 300, step: 1, createdAt: Date.parse("2026-07-10") },
  { id: "ev-dana-cohen", clientName: "דנה כהן", phone: "052-7778899", date: "2026-11-02", hallName: "טרם נבחר", guests: 80, step: 0, createdAt: Date.parse("2026-07-20") },
  { id: "ev-liran-noy", clientName: "לירן ונוי", phone: "054-1112233", date: "2026-07-05", hallTemplateId: "hall-hadar-main", hallName: "אולם הדר", guests: 140, step: 6, quoteSentAt: Date.parse("2026-06-01"), archived: true, createdAt: Date.parse("2026-05-20") },
];
