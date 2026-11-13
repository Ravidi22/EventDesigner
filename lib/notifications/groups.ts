// The bell's sheet reads its feed BY EVENT (the "Dashboard structure design" board, 2b): one card
// per event, newest activity first, under a "when" heading — a designer scanning the bell asks
// "what happened with Michal and Daniel", not "what happened at 14:02".
//
// PURE: no I/O, no React. The icons are plain component references, so this stays importable from
// the self-check under Node.
import { Building2, PenTool, Share2, UserCheck, type LucideIcon } from "lucide-react";
import { isMain } from "../self-check";
import { KIND_SIDE, notificationText, type AppNotification, type NotificationKind } from "./types";

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

// ponytail: self-check. Run: npm run check:notification-groups
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) {
      console.error(`FAIL: ${what}`);
      process.exit(1);
    }
    console.log(`  ok   ${what}`);
  };
  const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).toISOString();
  const n = (id: string, eventId: string | null, createdAt: string, label?: string, readAt: string | null = null): AppNotification => ({
    id,
    kind: eventId ? "client.joined" : "link.invited",
    eventId,
    payload: label ? { eventLabel: label, actorName: "דנה" } : { actorName: "דנה" },
    readAt,
    createdAt,
  });
  // Half past midnight on the 11th: ten to midnight was "yesterday", ten past is "today".
  const now = new Date(2026, 10, 11, 0, 30);
  const feed = [
    n("a2", "A", at(9, 10, 0), "מיכל ודניאל", at(9, 11, 0)),
    n("g1", null, at(5, 12, 0), "יעל ואביב"),
    n("b2", "B", at(10, 9, 0), "שירה ועומר (הישן)"),
    n("a1", "A", at(10, 23, 50), "מיכל ודניאל"),
    n("b1", "B", at(11, 0, 10), "שירה ועומר"),
  ];
  const frozen = feed.map((x) => x.id).join();
  const groups = groupNotifications(feed, now);
  assert(groups.length === 3, "two events and one eventless notification make three groups");
  assert(groups.map((g) => g.eventId ?? "-").join() === "B,A,-", "the group with the newest activity comes first");
  assert(groups.map((g) => g.when).join() === "היום,אתמול,מוקדם יותר", "`when` is bucketed across midnight by the group's newest");
  assert(groups[1].items.map((x) => x.id).join() === "a1,a2" && groups[0].items.map((x) => x.id).join() === "b1,b2", "within a group, newest first");
  assert(groups[0].newest === at(11, 0, 10), "`newest` is the group's newest notification");
  assert(groups[0].label === "שירה ועומר", "the label is the newest one written, after a rename");
  assert(groups[2].label === "כללי", "the eventless group is כללי");
  assert(groupNotifications([n("x", "X", at(1, 8, 0))], now)[0].label === "כללי", "an event nobody labelled falls back to כללי");
  assert(feed.map((x) => x.id).join() === frozen, "the feed is not reordered in place");
  assert(groupNotifications([n("t", "T", at(11, 0, 0))], now)[0].when === "היום", "midnight itself is today");
  assert(groupNotifications([n("y", "Y", at(9, 23, 59))], now)[0].when === "מוקדם יותר", "the day before yesterday is earlier");
  assert(groupNotifications([], now).length === 0, "an empty feed is no groups");
  const unread = groupNotifications(
    feed.filter((x) => !x.readAt),
    now,
  );
  assert(unread.map((g) => `${g.eventId ?? "-"}:${g.items.length}`).join() === "B:2,A:1,-:1", "filtering the feed first drops read rows, and the groups follow");

  assert(timeAgo(new Date(2026, 10, 11, 0, 29, 30).toISOString(), now) === "עכשיו", "under a minute is now");
  assert(timeAgo(at(11, 0, 18), now) === "לפני 12 דק׳" && timeAgo(at(10, 21, 30), now) === "לפני 3 שע׳", "minutes, then hours");
  assert(timeAgo(at(8, 9, 0), now) === "8.11", "past a day, the day and month");

  const g = (kind: AppNotification["kind"], eventId: string | null) => ({ eventId, items: [{ ...n("h", eventId, at(1, 1, 1)), kind }] });
  assert(groupHref(g("client.joined", "E")) === "/dashboard?event=E", "a studio's group opens the event's drawer");
  assert(groupHref(g("link.accepted", "E")) === "/bookings?event=E", "a hall's group opens its booking");
  assert(groupHref(g("event.shared", "E")) === "/client/events/E", "a client's group opens their event page");
  assert(groupHref(g("link.invited", null)) === null, "the eventless group opens nothing");

  const invite = { ...n("i1", null, at(10, 9, 0)), payload: { actorName: "אולמי הגן", eventLabel: "יעל ואביב" } };
  const other = { ...n("i2", null, at(10, 9, 0)), payload: { actorName: "אולמי הגן", eventLabel: "נועה ואיתי" } };
  const proposal: AppNotification = { ...n("p1", "A", at(10, 9, 0)), kind: "proposal.submitted", payload: { proposalId: "P", changes: 3 } };
  const pinned = [proposal, invite, other, n("c", "A", at(10, 9, 0))];
  assert(notificationsOf({ kind: "proposal", proposalId: "P" }, pinned).map((x) => x.id).join() === "p1", "a proposal card says its own proposal's row");
  assert(notificationsOf({ kind: "proposal", proposalId: "Q" }, pinned).length === 0, "and no other proposal's");
  assert(
    notificationsOf({ kind: "invite", hostName: "אולמי הגן", clientName: "יעל ואביב" }, pinned).map((x) => x.id).join() === "i1",
    "an invitation card says the row of the same hall AND the same evening",
  );

  // The copy (lib/notifications/types.ts): no verb agrees with an actor whose gender is unknown.
  const t = (kind: AppNotification["kind"], payload: AppNotification["payload"]) => notificationText({ kind, payload }).title;
  assert(t("proposal.submitted", { actorName: "דנה", changes: 3 }) === "3 שינויים בסקיצה מדנה", "submitted, many");
  assert(t("proposal.submitted", { actorName: "Dana", changes: 1 }) === "שינוי אחד בסקיצה מ־Dana", "submitted, one — a Latin name takes a maqaf");
  assert(t("client.joined", { actorName: "שירה" }) === "שירה בפנים — אפשר להציע שינויים", "joined");
  assert(t("link.invited", { actorName: "אולמי הגן" }) === "הזמנה לעצב אירוע מאולמי הגן", "invited");
  assert(t("link.accepted", { actorName: "אירית עיצובים" }) === "אירית עיצובים: הקישור אושר", "accepted");
  assert(t("link.declined", {}) === "הסטודיו: הקישור נדחה", "declined, nameless");
  assert(t("link.updated", { actorName: "חוות רונית", facts: ["תאריך", "אורחים"] }) === "עדכון מחוות רונית: תאריך, אורחים", "updated");
  assert(t("event.shared", { actorName: "אירית עיצובים" }) === "אירית עיצובים שיתפו אתכם באירוע", "shared");
  // Whole words only (JS's \b knows no Hebrew letters): "נדחה" is the LINK declined, not the actor.
  const gendered = /(^|\s)(הציע|הציעה|הצטרף|הצטרפה|הזמין|הזמינה|שיתף|שיתפה|עדכן|עדכנה|דחה|דחתה|אישר|אישרה)(\s|$)/;
  const kinds: AppNotification["kind"][] = ["proposal.submitted", "client.joined", "event.shared", "link.invited", "link.accepted", "link.declined", "link.updated"];
  assert(kinds.every((k) => !gendered.test(t(k, { actorName: "נוי", changes: 2, facts: ["תאריך"] })) && !gendered.test(t(k, {}))), "no actor's line conjugates a singular verb");
  console.log("notification groups self-check passed");
}
