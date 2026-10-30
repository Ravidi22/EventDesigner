// One evening, two businesses (docs/superpowers/specs/2026-10-30-venue-owners-design.md §3.3–3.4).
//
// The venue's booking and the designer's event are two `events` rows in two organisations, joined
// by one `event_links` row. What crosses the join is decided HERE, as data, so a screen can ask:
//
//   venue → designer  the whole booking card EXCEPT the money: times, the run of the evening, the
//                     head counts, special meals, the menu as dish names, the vendors, the notes,
//                     the venue's manager on the night. And the facts both cards hold — date,
//                     start time, zones, guests — which the designer's event FOLLOWS (§SHARED).
//   designer → venue  the plain hall sketch: tables, chairs, stage, bars — never the design pass,
//                     never a price.
//   never             either side's money: the venue's package prices, deposits and documents; the
//                     designer's quote, catalog prices, costs and orders.
//
// PURE: no I/O. Safe in a client component.
import { isMain } from "../self-check";

export type LinkState = "pending" | "active" | "declined" | "ended";

export const LINK_STATE_LABEL: Record<LinkState, string> = {
  pending: "ממתין לאישור המעצב",
  active: "מקושר",
  declined: "המעצב דחה",
  ended: "הקישור בוטל",
};

/** The facts both cards hold, and the venue is the authority on — the date is the hall's, and so are
 *  the rooms and the head count it cooks for. While a link is active the designer's event FOLLOWS
 *  them: every save of the booking writes them onto the linked event (lib/event-links/sync.ts), and
 *  the designer's form shows them as the venue's. Nothing else on the designer's event is touched. */
export const SHARED_FACTS = ["date", "time", "venueId", "zoneIds", "guests"] as const;
export type SharedFact = (typeof SHARED_FACTS)[number];

export const SHARED_FACT_LABEL: Record<SharedFact, string> = {
  date: "תאריך",
  time: "שעה",
  venueId: "מתחם",
  zoneIds: "אזורים",
  guests: "אורחים",
};

/** What a venue sees of the link from its booking. */
export interface VenueSideLink {
  id: string;
  state: LinkState;
  invitedEmail: string;
  /** The designer's business name, once there is an account behind the address. */
  studioName?: string;
  /** The designer's event, for the hall-sketch view. Set only while active. */
  studioEventId?: string;
}

/** What a designer sees of a link: an invitation to accept, or the venue behind an event. */
export interface StudioSideLink {
  id: string;
  state: LinkState;
  venueName: string;
  /** The hall's business name. */
  hostName: string;
  venueEventId: string;
  studioEventId?: string;
  /** The booking's own label, for an invitation not yet accepted: client · date. */
  clientName: string;
  date: string;
  guests: number;
  zonesLabel: string;
}

/** The booking card as a designer reads it — hand-built, never the venue's types with fields
 *  stripped (the client portal's rule: a narrower type cannot leak a field nobody remembered). */
export interface HostingForDesigner {
  hostName: string;
  hostPhone: string;
  onSiteName: string;
  onSitePhone: string;
  clientName: string;
  eventType: string;
  date: string;
  time?: string;
  zonesLabel: string;
  slot: string;
  guests: number;
  finalGuests?: number;
  children: number;
  vendorMeals: number;
  specialMeals: { label: string; count: number }[];
  specialNote: string;
  serviceStyle?: string;
  runOfShow: { time: string; label: string }[];
  /** The menu as served: course label → dish names. No package name, no price. */
  menu: { course: string; dishes: string[] }[];
  vendors: { role: string; name: string; phone: string; arrival: string }[];
  floorNotes: string;
}

/** The fields of a designer's event a booking save may write, given the link is active. */
export function followedPatch(booking: {
  date: string;
  time?: string;
  venueId?: string;
  zoneIds: string[];
  zonesLabel: string;
  guests: number;
}): { date: string; time?: string; venueId?: string; zoneIds: string[]; zonesLabel: string; guests: number } {
  return {
    date: booking.date,
    time: booking.time,
    venueId: booking.venueId,
    zoneIds: [...booking.zoneIds],
    zonesLabel: booking.zonesLabel,
    guests: booking.guests,
  };
}

/** Which shared facts differ between the two — the line the designer's notification says. */
export function changedFacts(
  before: { date: string; time?: string; venueId?: string; zoneIds: string[]; guests: number },
  after: { date: string; time?: string; venueId?: string; zoneIds: string[]; guests: number },
): SharedFact[] {
  const out: SharedFact[] = [];
  if (before.date !== after.date) out.push("date");
  if ((before.time ?? "") !== (after.time ?? "")) out.push("time");
  if ((before.venueId ?? "") !== (after.venueId ?? "")) out.push("venueId");
  if (before.zoneIds.join() !== after.zoneIds.join()) out.push("zoneIds");
  if (before.guests !== after.guests) out.push("guests");
  return out;
}

// ponytail: self-check. Run: npm run check:event-links
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) {
      console.error(`FAIL: ${what}`);
      process.exit(1);
    }
    console.log(`  ok   ${what}`);
  };
  const a = { date: "2026-12-01", time: "19:30", venueId: "v", zoneIds: ["z1", "z2"], guests: 300 };
  assert(changedFacts(a, { ...a }).length === 0, "nothing moved, nothing said");
  assert(changedFacts(a, { ...a, guests: 320, date: "2026-12-02" }).join() === "date,guests", "each moved fact is named once");
  assert(changedFacts(a, { ...a, zoneIds: ["z2", "z1"] }).join() === "zoneIds", "the zones' order is the venue's and counts");
  const patch = followedPatch({ ...a, zonesLabel: "אולם · חופה" });
  assert(Object.keys(patch).sort().join() === "date,guests,time,venueId,zoneIds,zonesLabel", "the follow writes the shared facts and nothing else");
  assert(SHARED_FACTS.every((f) => f in patch), "every shared fact is in the patch");
  console.log("event links self-check passed");
}

/** The designer's plain hall sketch, as the venue sees it (lib/event-links/hall-pass.ts): tables,
 *  chairs, stages and bars on the venue's own plan — never the design pass, never a price. */
export interface HallSketch {
  studioName: string;
  venueId: string | null;
  zoneIds: string[];
  geometry: import("@/lib/venues/types").VenueGeometry;
  content: import("@/lib/design-document/types").DesignDocumentContent;
  /** Client-safe rows (lib/client-portal/safe-product.ts) — what the sketch draws with. */
  products: import("@/lib/catalog/types").Product[];
  /** When the designer last changed the drawing (ISO), or null before they drew. */
  updatedAt: string | null;
}
