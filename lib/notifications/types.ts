// What the bell says. One row per RECIPIENT (lib/db/schema.ts `notifications`), written when the
// thing happens — never computed from proposals on read: "has this person seen it" is a fact about
// the person, and the kinds below are not all about proposals.
//
// Shared by both sides of the product: a designer's bell in the top bar and a client's on /client
// read the same rows through the same actions (./actions.ts), scoped by the signed-in user.

export type NotificationKind =
  /** To the studio's owners and designers: a client sent changes to the sketch. */
  | "proposal.submitted"
  /** To the event's clients: the designer answered a proposal. */
  | "proposal.resolved"
  /** To the studio: a client accepted the invitation and has an account now. */
  | "client.joined"
  /** To a client who already had an account: another event was shared with them. */
  | "event.shared"
  /** To a designer's studio: a venue named them the designer of one of its evenings (lib/event-links). */
  | "link.invited"
  /** To the venue: the designer accepted, or declined. */
  | "link.accepted"
  | "link.declined"
  /** To the designer's studio: the venue moved a fact the linked event follows (date, rooms, guests). */
  | "link.updated";

/** Whose bell a notification rings in. Every kind is written to exactly ONE side, so a notification's
 *  event id names an event in that side's own world — the studio's event, the hall's booking, the
 *  client's page — and where it opens follows from the kind alone. */
export type NotificationSide = "studio" | "venue" | "client";

export const KIND_SIDE: Record<NotificationKind, NotificationSide> = {
  "proposal.submitted": "studio",
  "client.joined": "studio",
  "link.invited": "studio",
  "link.updated": "studio",
  "link.accepted": "venue",
  "link.declined": "venue",
  "proposal.resolved": "client",
  "event.shared": "client",
};

/** Facts frozen at the moment of writing, so the line still reads right after a rename. Small on
 *  purpose — everything else is one click away on the page the notification opens. */
export interface NotificationPayload {
  proposalId?: string;
  /** Who did it, as a name to print ("דנה", "אירית עיצובים"). */
  actorName?: string;
  /** The event as the recipient knows it — the couple's name for the studio, the venue for a client. */
  eventLabel?: string;
  /** How many changes were sent (submitted) or answered (resolved). */
  changes?: number;
  /** Of those, how many were accepted (resolved). */
  accepted?: number;
  /** link.updated: which shared facts moved, as their Hebrew names. */
  facts?: string[];
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  eventId: string | null;
  payload: NotificationPayload;
  /** ISO. Null = unread. */
  readAt: string | null;
  createdAt: string;
}

const count = (n: number | undefined, one: string, many: string) => (n === 1 ? one : `${n ?? 0} ${many}`);

/** "מ" + a name: joined to a Hebrew word ("מדנה"), through a maqaf to anything else ("מ־Dana"). */
const fromName = (name: string) => (/^[א-ת]/.test(name) ? `מ${name}` : `מ־${name}`);

/** The line in the bell.
 *
 *  The payload carries a name and never a gender, so no line conjugates a verb for its actor (the
 *  2b board's note: "שירה הצטרף" was every client). The actor stands where Hebrew asks no agreement
 *  — after "מ", before a colon — or takes the plural, which also speaks for a business. "המעצב" in
 *  proposal.resolved names the ROLE, the way the client's own page does. */
export function notificationText(n: Pick<AppNotification, "kind" | "payload">): { title: string; detail?: string } {
  const p = n.payload;
  switch (n.kind) {
    case "proposal.submitted":
      return {
        title: `${count(p.changes, "שינוי אחד", "שינויים")} בסקיצה ${fromName(p.actorName || "הלקוח")}`,
        detail: p.eventLabel,
      };
    case "proposal.resolved":
      if (!p.accepted) return { title: "המעצב השיב על השינויים שהצעתם", detail: p.eventLabel };
      return {
        title:
          p.accepted === p.changes
            ? `המעצב אישר את ${count(p.changes, "השינוי", "השינויים")} שהצעתם`
            : `המעצב אישר ${p.accepted} מתוך ${p.changes} שינויים`,
        detail: p.eventLabel,
      };
    case "client.joined":
      return { title: `${p.actorName || "הלקוח"} בפנים — אפשר להציע שינויים`, detail: p.eventLabel };
    case "event.shared":
      return { title: p.actorName ? `${p.actorName} שיתפו אתכם באירוע` : "אירוע חדש שותף איתכם", detail: p.eventLabel };
    case "link.invited":
      return { title: `הזמנה לעצב אירוע ${fromName(p.actorName || "אולם")}`, detail: p.eventLabel };
    case "link.accepted":
      return { title: `${p.actorName || "הסטודיו"}: הקישור אושר`, detail: p.eventLabel };
    case "link.declined":
      return { title: `${p.actorName || "הסטודיו"}: הקישור נדחה`, detail: p.eventLabel };
    case "link.updated":
      return {
        title: `עדכון ${fromName(p.actorName || "האולם")}: ${p.facts?.length ? p.facts.join(", ") : "פרטי האירוע"}`,
        detail: p.eventLabel,
      };
  }
}

/** Where a notification opens. A studio notification about an event opens it in the studio (the
 *  caller sets the active event first); a client's opens their event page. */
export function notificationHref(n: Pick<AppNotification, "kind" | "eventId" | "payload">): string {
  switch (n.kind) {
    case "proposal.submitted":
      return n.payload.proposalId ? `/studio?review=${n.payload.proposalId}` : "/studio";
    // The dashboard opens an event's drawer from `?event=`.
    case "client.joined":
    case "link.updated":
      return n.eventId ? `/dashboard?event=${n.eventId}` : "/dashboard";
    case "proposal.resolved":
    case "event.shared":
      return n.eventId ? `/client/events/${n.eventId}` : "/client";
    // Answered in the bell's own sheet, while pending. The row is written before the studio has an
    // event to name, so once answered it can only open the dashboard.
    case "link.invited":
      return "/dashboard";
    case "link.accepted":
    case "link.declined":
      return n.eventId ? `/bookings?event=${n.eventId}` : "/bookings";
  }
}
