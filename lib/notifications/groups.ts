// The bell's sheet reads its feed BY EVENT (the "Dashboard structure design" board, 2b): one card
// per event, newest activity first, under a "when" heading — a designer scanning the bell asks
// "what happened with Michal and Daniel", not "what happened at 14:02".
//
// PURE: no I/O, no React. The icons are plain component references, so this stays importable from
// the self-check under Node.
import { Building2, type LucideIcon, PenTool, Share2, UserCheck, UserMinus } from "lucide-react";
import { KIND_SIDE, type AppNotification, type NotificationKind } from "./types";

export type WhenBucket = "היום" | "אתמול" | "מוקדם יותר";

export interface NotificationGroup {
  /** Null = the notifications about no event of the recipient's own (an invitation not yet linked). */
  eventId: string | null;
  /** The event as the newest notification named it, else "כללי". */
  label: string;
  /** Bucketed from the group's NEWEST notification. */
  when: WhenBucket;
  /** ISO of the newest notification — what the groups are ordered by. */
  newest: string;
  /** Newest first. */
  items: AppNotification[];
}

/** The glyph a row wears — the subject, not the verb: a proposal either way, a person, a share, a hall. */
export const NOTIFICATION_ICON: Record<NotificationKind, LucideIcon> = {
  "proposal.submitted": PenTool,
  "proposal.resolved": PenTool,
  "client.joined": UserCheck,
  "event.shared": Share2,
  "link.invited": Building2,
  "link.accepted": Building2,
  "link.declined": Building2,
  "link.updated": Building2,
  "link.venue_closed": Building2,
  "member.left": UserMinus,
  "client.left": UserMinus,
};

const ms = (iso: string) => Date.parse(iso);

/** By the recipient's own clock — "אתמול" is the calendar day before, not 24 hours ago. */
function whenOf(iso: string, now: Date): WhenBucket {
  const t = ms(iso);
  if (t >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) return "היום";
  return t >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime() ? "אתמול" : "מוקדם יותר";
}

/** One group per event (and one for the eventless), the most recently active first. A filter is
 *  applied to the FEED before this, never to the groups after, so a group's order and its `when`
 *  are always those of what it shows. */
export function groupNotifications(items: readonly AppNotification[], now: Date): NotificationGroup[] {
  const sorted = [...items].sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  // A Map keeps insertion order, and each group is inserted at its newest notification — so the
  // groups come out newest-active first with no second sort.
  const byEvent = new Map<string | null, AppNotification[]>();
  for (const n of sorted) {
    const list = byEvent.get(n.eventId);
    if (list) list.push(n);
    else byEvent.set(n.eventId, [n]);
  }
  return [...byEvent].map(([eventId, list]) => ({
    eventId,
    // The eventless group mixes invitations to different evenings, so no one label speaks for it.
    label: (eventId && list.find((n) => n.payload.eventLabel)?.payload.eventLabel) || "כללי",
    when: whenOf(list[0].createdAt, now),
    newest: list[0].createdAt,
    items: list,
  }));
}

/** "עכשיו", "לפני 5 דק׳", "לפני 3 שע׳", then the day and month ("8.11"). */
export function timeAgo(iso: string, now: Date): string {
  const s = (now.getTime() - ms(iso)) / 1000;
  if (s < 60) return "עכשיו";
  if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`;
  if (s < 86400) return `לפני ${Math.floor(s / 3600)} שע׳`;
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

/** Where a group's header opens: the event in its recipient's own world, which the kind says
 *  (KIND_SIDE) — the studio's drawer, the hall's booking, the client's page. Null for the eventless. */
export function groupHref(g: Pick<NotificationGroup, "eventId" | "items">): string | null {
  if (!g.eventId || g.items.length === 0) return null;
  switch (KIND_SIDE[g.items[0].kind]) {
    case "venue":
      return `/bookings?event=${g.eventId}`;
    case "client":
      return `/client/events/${g.eventId}`;
    case "studio":
      return `/dashboard?event=${g.eventId}`;
  }
}

/** A card in the sheet's pinned "דורש פעולה" — news the sheet can answer itself. */
export type PendingAction = { kind: "proposal"; proposalId: string } | { kind: "invite"; hostName: string; clientName: string };

/** The notifications a pinned card already says. While the card stands, its rows stay out of the
 *  groups — the same news twice, once with a verb and once without, reads as two things (the board
 *  shows them once). Answered, the card goes and the rows are history in their group again.
 *  An invitation's row is written before the studio has an event (eventId null), so it is matched
 *  by the two names it froze — the hall's business and the booking's client, the same reads the
 *  link's own card makes. */
export function notificationsOf(action: PendingAction, items: readonly AppNotification[]): AppNotification[] {
  return items.filter((n) =>
    action.kind === "proposal"
      ? n.kind === "proposal.submitted" && n.payload.proposalId === action.proposalId
      : n.kind === "link.invited" && (n.payload.actorName ?? "") === action.hostName && (n.payload.eventLabel ?? "") === action.clientName,
  );
}
