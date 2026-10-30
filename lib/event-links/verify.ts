// The venue-owner round trip, against a real Postgres (the one .env.local names):
//
//   npm run db:verify:venue
//
// A venue organisation draws a hall, writes a menu, books an evening → names a designer by address
// → the designer accepts onto a new event that takes the booking's date, rooms and head count → the
// designer reads the hall's card with no price in it → the venue moves the date and the guests, the
// designer's event follows and its bell says so → everybody sees the venue, nobody but a grant edits
// it, and a guest editor's save stays in the owner's tenant → the venue sees the designer's PLAIN
// hall sketch: tables, never the cloth, never a price → the designer unlinks and the sketch is gone.
//
// Builds two THROWAWAY organisations (a venue, a designer's studio) with one person each, and
// deletes everything in a `finally`. The real studio's rows are never touched.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq, inArray } from "drizzle-orm";
import { actAsUserForScript } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { eventLinks, events, menuDishes, menuPackages, notifications, organizations, products, users, venueStructures, venues, zones } from "@/lib/db/schema";
import { emptyStructure } from "@/lib/venues/structure";
import { fetchVenuePlan, fetchVenues, saveVenuePlan, shareVenue } from "@/lib/venues/actions";
import { fetchBookings, saveBooking } from "@/lib/hosting/actions";
import { emptyHosting } from "@/lib/hosting/types";
import { fetchMenu, saveDish, saveMenuPackage } from "@/lib/menus/actions";
import { acceptLinkInvite, fetchDesignerSketch, fetchHostingForEvent, fetchStudioLinks, inviteDesigner, unlinkFromVenue } from "./actions";
import { fetchEvent } from "@/lib/events/actions";
import { saveDocument } from "@/lib/studio/actions";
import type { EventSummary } from "@/lib/events/types";
import type { Zone } from "@/lib/venues/zone";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const SECRET_PRICE = 333.33;
const SECRET_COST = 999.99;
const SECRET_KITCHEN = "סוד-המטבח";

async function main() {
  const database = db();
  const stamp = Date.now();
  const venueOrg = crypto.randomUUID();
  const studioOrg = crypto.randomUUID();
  const venueUser = crypto.randomUUID();
  const studioUser = crypto.randomUUID();
  const venueId = crypto.randomUUID();
  const designerEmail = `verify-designer-${stamp}@example.test`;
  const square = (x: number) => [
    { x, y: 0 },
    { x: x + 10000, y: 0 },
    { x: x + 10000, y: 8000 },
    { x, y: 8000 },
  ];
  const hall: Zone = { id: crypto.randomUUID(), venueId, name: "אולם בדיקה", kind: "hall", source: { type: "region", boundary: square(0) }, ceilingHeightMm: 0 } as Zone;
  const canopy: Zone = { id: crypto.randomUUID(), venueId, name: "חופת בדיקה", kind: "canopy", source: { type: "region", boundary: square(12000) }, ceilingHeightMm: 0 } as Zone;

  await database.insert(organizations).values([
    { id: venueOrg, name: "אולם בדיקה", kind: "venue" },
    { id: studioOrg, name: "סטודיו בדיקה", kind: "studio" },
  ]);
  await database.insert(users).values([
    { id: venueUser, organizationId: venueOrg, kind: "studio", email: `verify-venue-${stamp}@example.test`, name: "בעלת האולם", role: "owner", state: "active" },
    { id: studioUser, organizationId: studioOrg, kind: "studio", email: designerEmail, name: "המעצבת", role: "owner", state: "active" },
  ]);
  await database.insert(venues).values({ id: venueId, organizationId: venueOrg, name: "מתחם בדיקה", plan: { mmPerUnit: 1 } });
  await database.insert(venueStructures).values({ venueId, organizationId: venueOrg, structure: emptyStructure() });
  await database.insert(zones).values([hall, canopy].map((z) => ({ id: z.id, organizationId: venueOrg, venueId, name: z.name, kind: z.kind, source: z.source, ceilingHeightMm: 0 })));

  try {
    // ── the venue's own book ──
    actAsUserForScript(venueUser);
    const firstA = crypto.randomUUID();
    const firstB = crypto.randomUUID();
    const mainDish = crypto.randomUUID();
    await saveDish({ id: firstA, name: "סלט סלק", course: "first", description: "", tags: ["vegan"], position: 0 });
    await saveDish({ id: firstB, name: "קרפצ׳יו", course: "first", description: "", tags: ["meat"], position: 1 });
    await saveDish({ id: mainDish, name: "פילה בקר", course: "main", description: "", tags: ["meat"], position: 0 });
    const pkgId = crypto.randomUUID();
    const firstCourse = crypto.randomUUID();
    await saveMenuPackage({
      id: pkgId,
      name: "זהב",
      description: "",
      priceAdult: SECRET_PRICE,
      priceChild: 150,
      priceVendor: 90,
      minGuests: 250,
      courses: [
        { id: firstCourse, course: "first", choose: 1, dishIds: [firstA, firstB, crypto.randomUUID()] },
        { id: crypto.randomUUID(), course: "main", choose: 0, dishIds: [mainDish] },
      ],
      extras: [{ id: "sushi", name: "עמדת סושי", price: 25, per: "guest" }],
    });
    const menu = await fetchMenu();
    check("a package keeps only the venue's own dishes", menu.packages[0]?.courses[0]?.dishIds.length === 2);

    const bookingId = crypto.randomUUID();
    const event: EventSummary = {
      id: bookingId,
      clientName: "משפחת בדיקה",
      phone: "050-0000000",
      date: "2027-03-14",
      time: "19:30",
      venueId,
      zoneIds: [hall.id, canopy.id],
      zonesLabel: "אולם בדיקה · חופת בדיקה",
      guests: 300,
      step: 0,
      createdAt: Date.now(),
    };
    const hosting = {
      ...emptyHosting(),
      packageId: pkgId,
      menuChoices: { [firstCourse]: [firstA] },
      children: 20,
      vendorMeals: 12,
      specialMeals: { vegan: 4 },
      runOfShow: [{ time: "20:15", label: "חופה" }],
      vendors: [{ id: "dj", role: "תקליטן", name: "דני", phone: "052-1", arrival: "17:00" }],
      kitchenNotes: SECRET_KITCHEN,
      onSiteName: "רונית",
    };
    const saved = await saveBooking(event, hosting);
    const b = saved.find((x) => x.event.id === bookingId);
    check("a booking saves its event and its hosting together", b?.hosting.vendorMeals === 12 && b.hosting.runOfShow.length === 1 && b.event.zoneIds.length === 2);

    // ── the link ──
    const invited = await inviteDesigner(bookingId, designerEmail);
    check("naming a designer by address finds their studio", !("error" in invited) && invited.state === "pending");

    actAsUserForScript(studioUser);
    const links = await fetchStudioLinks();
    const invite = links.find((l) => l.venueEventId === bookingId);
    check("the designer sees the invitation", invite?.state === "pending" && invite.clientName === "משפחת בדיקה");
    const accepted = await acceptLinkInvite(invite!.id, null);
    const studioEventId = "eventId" in accepted ? accepted.eventId : "";
    const followed = studioEventId ? await fetchEvent(studioEventId) : null;
    check(
      "accepting opens an event that takes the booking's date, rooms and guests",
      followed?.date === "2027-03-14" && followed.guests === 300 && followed.zoneIds.join() === [hall.id, canopy.id].join() && followed.venueId === venueId,
    );

    const card = await fetchHostingForEvent(studioEventId);
    const cardText = JSON.stringify(card);
    check("the designer reads the hall's card", !!card && card.menu.some((c) => c.dishes.includes("סלט סלק")) && card.vendors.length === 1 && card.onSiteName === "רונית");
    check("…with no price in it", !cardText.includes(String(SECRET_PRICE)) && !cardText.includes("priceAdult"));
    check("…and not the kitchen's own notes", !cardText.includes(SECRET_KITCHEN));
    check("the menu shows what was CHOSEN, not every dish offered", !!card && !card.menu.some((c) => c.dishes.includes("קרפצ׳יו")));

    // ── the venue moves the date and the guests; the designer's event follows ──
    actAsUserForScript(venueUser);
    await saveBooking({ ...event, date: "2027-03-21", guests: 320 }, hosting);
    actAsUserForScript(studioUser);
    const after = await fetchEvent(studioEventId);
    check("the designer's event follows the hall's date and head count", after?.date === "2027-03-21" && after.guests === 320);
    const bell = await database.select({ kind: notifications.kind, payload: notifications.payload }).from(notifications).where(eq(notifications.userId, studioUser));
    check("…and the designer's bell says what moved", bell.some((n) => n.kind === "link.updated" && (n.payload.facts ?? []).length === 2));

    // ── everybody sees the venue; a grant edits it ──
    const plan = await fetchVenuePlan(venueId);
    check("the designer sees the venue's plan", plan.zones.length === 2 && plan.role === "viewer");
    let refused = false;
    try {
      await saveVenuePlan(venueId, plan.structure, plan.zones);
    } catch {
      refused = true;
    }
    check("…and may not edit it without a grant", refused);
    const mine = await fetchVenues();
    check("the venue is on the designer's list, as somebody else's", mine.some((v) => v.id === venueId && v.owned === false && v.ownerName === "אולם בדיקה"));

    actAsUserForScript(venueUser);
    const share = await shareVenue({ venueId, name: "המעצבת", email: designerEmail, kind: "guest", role: "editor" });
    check("the venue grants the designer's studio edit", !share.error && share.grants.some((g) => g.email === designerEmail && g.status === "active" && g.role === "editor"));
    actAsUserForScript(studioUser);
    const editable = await fetchVenuePlan(venueId);
    check("…and the designer may edit now", editable.role === "editor");
    await saveVenuePlan(venueId, editable.structure, editable.zones.map((z) => (z.id === hall.id ? { ...z, name: "אולם בדיקה (נערך)" } : z)));
    const zoneRows = await database.select({ org: zones.organizationId, name: zones.name }).from(zones).where(eq(zones.venueId, venueId));
    check("a guest editor's save stays in the owner's tenant", zoneRows.length === 2 && zoneRows.every((z) => z.org === venueOrg) && zoneRows.some((z) => z.name === "אולם בדיקה (נערך)"));

    // ── the venue sees the designer's PLAIN hall sketch ──
    const tableId = crypto.randomUUID();
    const clothId = crypto.randomUUID();
    await database.insert(products).values([
      { id: tableId, organizationId: studioOrg, name: "עגול 180", layer: "floor", category: "tables", diameterMm: 1800, heightMm: 750, unitPrice: String(SECRET_COST) },
      { id: clothId, organizationId: studioOrg, name: "מפת פשתן", layer: "table", category: "tablecloths", diameterMm: 3000, heightMm: 5, unitPrice: String(SECRET_COST) },
    ]);
    const t1 = crypto.randomUUID();
    await saveDocument(studioEventId, {
      calibration: { mmPerUnit: 1 },
      tables: [{ id: t1, type: "עגול 180", variantId: tableId, number: 1, position: { x: 2000, y: 2000 }, rotation: 0, diameterMm: 1800, seats: 10 }],
      placements: [{ id: crypto.randomUUID(), variantId: clothId, layer: "table", quantity: 1, tableId: t1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 }],
    });

    actAsUserForScript(venueUser);
    const sketch = await fetchDesignerSketch(bookingId);
    const sketchText = JSON.stringify(sketch);
    check("the venue sees the designer's tables", sketch?.content.tables.length === 1 && sketch.studioName === "סטודיו בדיקה");
    check("…but not the design on them", sketch?.content.placements.length === 0);
    check("…and no price or cost", !sketchText.includes(String(SECRET_COST)));
    const bookings = await fetchBookings();
    check("the booking shows the link as active", bookings.find((x) => x.event.id === bookingId)?.link?.state === "active");

    // ── the designer lets go ──
    actAsUserForScript(studioUser);
    await unlinkFromVenue(studioEventId);
    actAsUserForScript(venueUser);
    check("after unlinking the venue sees no sketch", (await fetchDesignerSketch(bookingId)) === null);
  } finally {
    actAsUserForScript(null);
    const orgs = [venueOrg, studioOrg];
    const eventRows = await database.select({ id: events.id }).from(events).where(inArray(events.organizationId, orgs));
    const ids = eventRows.map((e) => e.id);
    if (ids.length) {
      await database.delete(eventLinks).where(inArray(eventLinks.venueEventId, ids));
      await database.delete(events).where(inArray(events.id, ids));
    }
    await database.delete(notifications).where(inArray(notifications.organizationId, orgs));
    await database.delete(products).where(eq(products.organizationId, studioOrg));
    await database.delete(menuPackages).where(eq(menuPackages.organizationId, venueOrg));
    await database.delete(menuDishes).where(eq(menuDishes.organizationId, venueOrg));
    await database.delete(venues).where(eq(venues.id, venueId));
    await database.delete(zones).where(eq(zones.venueId, venueId));
    await database.delete(users).where(inArray(users.id, [venueUser, studioUser]));
    await database.delete(organizations).where(inArray(organizations.id, orgs));
  }

  if (failures) {
    console.error(`\nvenue-owner verification: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nvenue-owner verification passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
