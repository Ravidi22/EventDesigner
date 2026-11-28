// Venues (shared plans, owned rights), the venue owner's bookings and menus, the link between a venue's
// evening and a studio's event, and the client portal.
import { emptyStructure } from "@/lib/venues/structure";
import {
  createVenue,
  deleteVenue,
  fetchVenueDirectory,
  fetchVenueGeometry,
  fetchVenueGrants,
  fetchVenuePlan,
  fetchVenues,
  followVenue,
  renameVenue,
  revokeGrant,
  saveVenue,
  saveVenuePlan,
  setGrantRole,
  setVenueLogo,
  shareVenue,
} from "@/lib/venues/actions";
import { closeFinalCount, fetchBookings, saveBooking } from "@/lib/hosting/actions";
import { emptyHosting } from "@/lib/hosting/types";
import { archiveDish, archiveMenuPackage, fetchMenu, saveDish, saveMenuPackage } from "@/lib/menus/actions";
import { acceptLinkInvite, cancelDesignerLink, declineLinkInvite, fetchDesignerSketch, fetchHostingForEvent, fetchStudioLinks, inviteDesigner, unlinkFromVenue } from "@/lib/event-links/actions";
import { discardProposal, fetchClientScene, fetchClientSketch, fetchMyEvents, saveProposal, startProposal, submitProposal, withdrawProposal } from "@/lib/client-portal/actions";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Fixture } from "../fixture";
import type { Cases } from "./types";

const stray = (who: string) => `isolation-stray-${who}-${Date.now()}@example.test`;
/** Every business opens every venue's PLAN (2026-10-30): the venue and its zones, never its events. */
const THE_PLAN = (a: Fixture) => [a.venueId, a.zoneId];
const SHARED = "every signed-in business may open every venue's plan (2026-10-30) — the plan, never events, clients or prices";

export const VENUE_CASES: Cases = {
  // ── venues: everyone READS a plan; editing, sharing and deleting are the owner's and its grants' ──
  "lib/venues/actions.ts#fetchVenues": { call: () => fetchVenues(), allow: THE_PLAN, reason: "B may have followed A's venue (followVenue) — then it is on B's list" },
  "lib/venues/actions.ts#fetchVenueDirectory": {
    call: () => fetchVenueDirectory(),
    allow: (a) => [...THE_PLAN(a), a.orgA],
    reason: SHARED,
    control: "the directory lists OTHER businesses' venues — A's own are not in A's; B's pass is where A's venue shows, by design",
  },
  "lib/venues/actions.ts#followVenue": { call: (a) => followVenue(a.venueId), allow: (a) => [...THE_PLAN(a), a.orgA], reason: "following a venue is a viewer grant to B's own organisation, by design" },
  "lib/venues/actions.ts#fetchVenuePlan": { call: (a) => fetchVenuePlan(a.venueId), allow: THE_PLAN, reason: SHARED },
  "lib/venues/actions.ts#fetchVenueGeometry": { call: (a) => fetchVenueGeometry(a.venueId), allow: THE_PLAN, reason: SHARED },
  "lib/venues/actions.ts#saveVenuePlan": { call: (a) => saveVenuePlan(a.venueId, emptyStructure(), []) },
  "lib/venues/actions.ts#createVenue": { call: () => createVenue() },
  "lib/venues/actions.ts#renameVenue": { call: (a) => renameVenue(a.venueId, "B was here") },
  "lib/venues/actions.ts#setVenueLogo": { call: (a) => setVenueLogo(a.venueId, null) },
  // A's spare venue: one with events on it is refused even to its owner.
  "lib/venues/actions.ts#deleteVenue": { call: (a) => deleteVenue(a.spareVenueId) },
  "lib/venues/actions.ts#saveVenue": { call: (a) => saveVenue({ ...a.venue, name: "B was here" }) },
  "lib/venues/actions.ts#fetchVenueGrants": { call: (a) => fetchVenueGrants(a.venueId) },
  "lib/venues/actions.ts#shareVenue": { call: (a) => shareVenue({ venueId: a.venueId, name: "B", email: stray("share-venue"), kind: "guest" as never, role: "editor" as never }) },
  "lib/venues/actions.ts#setGrantRole": { call: (a) => setGrantRole(a.grantId, "manager" as never) },
  "lib/venues/actions.ts#revokeGrant": { call: (a) => revokeGrant(a.grantId) },

  // ── a venue owner's book: B's VENUE tries V's evening and menu ──
  "lib/hosting/actions.ts#fetchBookings": { as: "venueB", call: () => fetchBookings() },
  "lib/hosting/actions.ts#saveBooking": { as: "venueB", call: (a) => saveBooking({ ...a.booking, clientName: "B was here" }, emptyHosting()) },
  "lib/hosting/actions.ts#closeFinalCount": { as: "venueB", call: (a) => closeFinalCount(a.bookingEventId, 99) },
  "lib/menus/actions.ts#fetchMenu": { as: "venueB", call: () => fetchMenu() },
  "lib/menus/actions.ts#saveDish": { as: "venueB", call: (a) => saveDish({ ...a.dish, name: "B was here" }) },
  "lib/menus/actions.ts#archiveDish": { as: "venueB", call: (a) => archiveDish(a.dish.id) },
  "lib/menus/actions.ts#saveMenuPackage": { as: "venueB", call: (a) => saveMenuPackage({ ...a.pkg, name: "B was here" }) },
  "lib/menus/actions.ts#archiveMenuPackage": { as: "venueB", call: (a) => archiveMenuPackage(a.pkg.id) },

  // ── the link between V's evening and A's event ──
  // V's evening with no designer yet (one already linked refuses a second, even to V).
  "lib/event-links/actions.ts#inviteDesigner": { as: "venueB", call: (a) => inviteDesigner(a.freeBookingId, stray("designer")) },
  // V's evening whose invitation A accepts first in the control (an "ending" action runs last).
  "lib/event-links/actions.ts#cancelDesignerLink": { as: "venueB", call: (a) => cancelDesignerLink(a.pendingBookingId) },
  // Carries A's studio name and A's drawing for V's evening — never for another venue.
  "lib/event-links/actions.ts#fetchDesignerSketch": { as: "venueB", call: (a) => fetchDesignerSketch(a.bookingEventId), expect: (r) => !JSON.stringify(r ?? null).includes("סטודיו א") },
  "lib/event-links/actions.ts#fetchStudioLinks": { call: () => fetchStudioLinks() },
  // PENDING invitations to A — one accepted, one declined is not something anyone can do again.
  "lib/event-links/actions.ts#acceptLinkInvite": { call: (a) => acceptLinkInvite(a.pendingLinkId, null) },
  "lib/event-links/actions.ts#declineLinkInvite": { call: (a) => declineLinkInvite(a.declineLinkId) },
  "lib/event-links/actions.ts#fetchHostingForEvent": { call: (a) => fetchHostingForEvent(a.linkedEventId) },
  "lib/event-links/actions.ts#unlinkFromVenue": { call: (a) => unlinkFromVenue(a.linkedEventId) },

  // ── the client portal: a client of B's event tries A's ──
  "lib/client-portal/actions.ts#fetchMyEvents": { as: "clientB", call: () => fetchMyEvents() },
  "lib/client-portal/actions.ts#fetchClientSketch": { as: "clientB", call: (a) => fetchClientSketch(a.eventId) },
  "lib/client-portal/actions.ts#fetchClientScene": { as: "clientB", call: (a) => fetchClientScene(a.eventId) },
  "lib/client-portal/actions.ts#startProposal": { as: "clientB", call: (a) => startProposal(a.eventId) },
  // A's DRAFT, at the revision it really has now — so only the membership check stands in B's way.
  "lib/client-portal/actions.ts#saveProposal": { as: "clientB", call: async (a) => saveProposal(a.draftEventId, MOVED, await revisionOf(a.draftEventId)) },
  "lib/client-portal/actions.ts#submitProposal": { as: "clientB", call: async (a) => submitProposal(a.draftEventId, "B", await revisionOf(a.draftEventId)) },
  "lib/client-portal/actions.ts#withdrawProposal": { as: "clientB", call: (a) => withdrawProposal(a.withdrawEventId) },
  "lib/client-portal/actions.ts#discardProposal": { as: "clientB", call: (a) => discardProposal(a.discardEventId) },
};

/** The open proposal's revision on an event, read at call time (the control's own save moves it). */
async function revisionOf(eventId: string): Promise<number> {
  const rows = (await db().execute(sql`select revision from sketch_proposals where event_id = ${eventId} order by updated_at desc limit 1`)) as unknown as { revision: number }[];
  return rows[0]?.revision ?? 0;
}

/** The client's drawing with its table moved a little further. */
const MOVED = {
  calibration: { mmPerUnit: 1 },
  tables: [{ id: "t-1", type: "שולחן", number: 1, position: { x: 2500, y: 0 }, rotation: 0, diameterMm: 1800, seats: 10 }],
  placements: [],
};
