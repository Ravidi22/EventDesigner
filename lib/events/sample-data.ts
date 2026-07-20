// Seed events for the dashboard (stands in for the DB `events` table), one per flow stage
// so the derived statuses all show. The first one is the "live" sample the studio works on.
import type { EventSummary } from "./types";

export const SAMPLE_EVENTS: EventSummary[] = [
  { id: "ev-noa-itai", clientName: "נועה ואיתי", phone: "052-1234567", date: "2026-08-14", hallName: "אולם לה־וידה", guests: 240, step: 5, createdAt: Date.parse("2026-06-20") },
  { id: "ev-shira-roi", clientName: "שירה ורועי", phone: "054-7654321", date: "2026-09-02", hallName: "אחוזת הדר", guests: 180, step: 6, quoteSentAt: Date.parse("2026-07-01"), createdAt: Date.parse("2026-06-28") },
  { id: "ev-yael-bat", clientName: "בת מצווה — יעל", phone: "050-9998877", date: "2026-09-21", hallName: "אולם לה־וידה", guests: 120, step: 2, createdAt: Date.parse("2026-07-05") },
  { id: "ev-mor-alon", clientName: "מור ואלון", phone: "053-2211334", date: "2026-10-09", hallName: "גן הזית", guests: 300, step: 1, createdAt: Date.parse("2026-07-10") },
];
