// npm run check:notification-groups — the self-check of ./groups.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { notificationText, type AppNotification } from "./types";
import { groupHref, groupNotifications, notificationsOf, timeAgo } from "./groups";

// ponytail: self-check. Run: npm run check:notification-groups
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
