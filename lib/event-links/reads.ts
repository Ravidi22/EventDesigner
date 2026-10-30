// The reads across the venue ↔ designer join (lib/event-links/types.ts says what may cross).
//
// ⚠ A PLAIN MODULE ON PURPOSE, never "use server": every function here takes an id and TRUSTS it.
// As a server action each would hand any business's booking or drawing to whoever names an id. The
// callers prove which side of an active link they stand on first (./actions.ts, through the
// organisation on the link row), and only then call in here. Never import this from a client
// component.
//
// The other rule, and `npm run check:event-links` holds it: nothing here touches money. No billing,
// quote, order, expense or supplier table is imported, and the menu is read for its courses and its
// dishes' NAMES — never a package's prices.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventHosting, eventLinks, eventZones, events, menuDishes, menuPackages, organizations, studioSettings, venues } from "@/lib/db/schema";
import { toHosting } from "@/lib/hosting/db-mapping";
import { SERVICE_STYLE_LABEL, SLOT_LABEL, SPECIAL_MEALS, SPECIAL_MEAL_LABEL } from "@/lib/hosting/types";
import { COURSE_LABEL, isDishTag, servedDishes, type Dish } from "@/lib/menus/types";
import { WHOLE_CATEGORIES, catalogOf, designerDocument, eventGeometry, variantIdsOf } from "@/lib/client-portal/reads";
import { clientProduct } from "@/lib/client-portal/safe-product";
import { hallPassOf } from "./hall-pass";
import type { HallSketch, HostingForDesigner, StudioSideLink, VenueSideLink } from "./types";

type LinkRow = typeof eventLinks.$inferSelect;

/** A business's public name: its settings' business name, else the organisation's own. */
export async function businessName(organizationId: string): Promise<{ name: string; phone: string }> {
  const [row] = await db()
    .select({ business: studioSettings.businessName, phone: studioSettings.phone, org: organizations.name })
    .from(organizations)
    .leftJoin(studioSettings, eq(studioSettings.organizationId, organizations.id))
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return { name: row?.business || row?.org || "", phone: row?.phone ?? "" };
}

export async function linkRowOf(venueEventId: string): Promise<LinkRow | null> {
  const [row] = await db().select().from(eventLinks).where(eq(eventLinks.venueEventId, venueEventId)).limit(1);
  return row ?? null;
}

/** The venue's view of the links on its bookings, by booking id. */
export async function venueSideLinks(venueEventIds: string[]): Promise<Map<string, VenueSideLink>> {
  const out = new Map<string, VenueSideLink>();
  if (venueEventIds.length === 0) return out;
  const rows = await db()
    .select({ link: eventLinks, studioOrg: organizations.name, business: studioSettings.businessName })
    .from(eventLinks)
    .leftJoin(organizations, eq(organizations.id, eventLinks.studioOrgId))
    .leftJoin(studioSettings, eq(studioSettings.organizationId, eventLinks.studioOrgId))
    .where(inArray(eventLinks.venueEventId, venueEventIds));
  for (const { link, studioOrg, business } of rows) {
    out.set(link.venueEventId, {
      id: link.id,
      state: link.state,
      invitedEmail: link.invitedEmail,
      studioName: business || studioOrg || undefined,
      studioEventId: link.state === "active" ? (link.studioEventId ?? undefined) : undefined,
    });
  }
  return out;
}

/** A designer studio's links: the invitations waiting for it and the bookings behind its events. */
export async function studioSideLinks(studioOrgId: string): Promise<StudioSideLink[]> {
  const rows = await db()
    .select({
      link: eventLinks,
      clientName: events.clientName,
      date: events.eventDate,
      guests: events.guests,
      zonesLabel: events.zonesLabel,
      venueName: venues.name,
      hostOrg: organizations.name,
      hostBusiness: studioSettings.businessName,
    })
    .from(eventLinks)
    .innerJoin(events, eq(events.id, eventLinks.venueEventId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .leftJoin(organizations, eq(organizations.id, eventLinks.venueOrgId))
    .leftJoin(studioSettings, eq(studioSettings.organizationId, eventLinks.venueOrgId))
    .where(and(eq(eventLinks.studioOrgId, studioOrgId), inArray(eventLinks.state, ["pending", "active"])))
    .orderBy(asc(events.eventDate));
  return rows.map((r) => ({
    id: r.link.id,
    state: r.link.state,
    venueName: r.venueName ?? "",
    hostName: r.hostBusiness || r.hostOrg || "",
    venueEventId: r.link.venueEventId,
    studioEventId: r.link.studioEventId ?? undefined,
    clientName: r.clientName,
    date: r.date ?? "",
    guests: r.guests,
    zonesLabel: r.zonesLabel,
  }));
}

/** The booking card as the linked designer reads it — every detail but the money. */
export async function hostingForDesigner(venueEventId: string, venueOrgId: string): Promise<HostingForDesigner | null> {
  const database = db();
  const [[event], [hostingRow], host] = await Promise.all([
    database
      .select({
        clientName: events.clientName,
        eventType: events.eventType,
        date: events.eventDate,
        time: events.startTime,
        zonesLabel: events.zonesLabel,
        guests: events.guests,
      })
      .from(events)
      .where(and(eq(events.id, venueEventId), eq(events.organizationId, venueOrgId)))
      .limit(1),
    database.select().from(eventHosting).where(eq(eventHosting.eventId, venueEventId)).limit(1),
    businessName(venueOrgId),
  ]);
  if (!event) return null;
  const h = toHosting(hostingRow);

  // The menu as served: the package's courses and the dishes chosen for each — read for the
  // COURSES column alone, never a price.
  let menu: HostingForDesigner["menu"] = [];
  if (h.packageId) {
    const [[pkg], dishRows] = await Promise.all([
      database
        .select({ courses: menuPackages.courses })
        .from(menuPackages)
        .where(and(eq(menuPackages.id, h.packageId), eq(menuPackages.organizationId, venueOrgId)))
        .limit(1),
      database
        .select({ id: menuDishes.id, name: menuDishes.name, course: menuDishes.course, archived: menuDishes.archived, tags: menuDishes.tags })
        .from(menuDishes)
        .where(eq(menuDishes.organizationId, venueOrgId)),
    ]);
    const dishes: Dish[] = dishRows.map((d) => ({
      id: d.id,
      name: d.name,
      course: d.course,
      description: "",
      tags: (d.tags ?? []).filter(isDishTag),
      position: 0,
      archived: d.archived || undefined,
    }));
    menu = (pkg?.courses ?? [])
      .map((c) => ({ course: COURSE_LABEL[c.course], dishes: servedDishes(c, h.menuChoices[c.id], dishes).map((d) => d.name) }))
      .filter((c) => c.dishes.length > 0);
  }

  return {
    hostName: host.name,
    hostPhone: host.phone,
    onSiteName: h.onSiteName,
    onSitePhone: h.onSitePhone,
    clientName: event.clientName,
    eventType: event.eventType,
    date: event.date ?? "",
    time: event.time?.slice(0, 5) || undefined,
    zonesLabel: event.zonesLabel,
    slot: SLOT_LABEL[h.slot],
    guests: event.guests,
    finalGuests: h.finalGuests,
    children: h.children,
    vendorMeals: h.vendorMeals,
    specialMeals: SPECIAL_MEALS.filter((k) => h.specialMeals[k]).map((k) => ({ label: SPECIAL_MEAL_LABEL[k], count: h.specialMeals[k] ?? 0 })),
    specialNote: h.specialNote,
    serviceStyle: h.serviceStyle ? SERVICE_STYLE_LABEL[h.serviceStyle] : undefined,
    runOfShow: h.runOfShow,
    menu,
    vendors: h.vendors.map((v) => ({ role: v.role, name: v.name, phone: v.phone, arrival: v.arrival })),
    floorNotes: h.floorNotes,
  };
}

/** The designer's plain hall sketch on the venue's plan (./hall-pass.ts), for the venue. */
export async function designerHallSketch(studioOrgId: string, studioEventId: string): Promise<HallSketch | null> {
  const database = db();
  const [[event], doc, studio] = await Promise.all([
    database
      .select({ venueId: events.venueId })
      .from(events)
      .where(and(eq(events.id, studioEventId), eq(events.organizationId, studioOrgId)))
      .limit(1),
    designerDocument(studioOrgId, studioEventId),
    businessName(studioOrgId),
  ]);
  if (!event) return null;
  const zoneRows = await database
    .select({ zoneId: eventZones.zoneId })
    .from(eventZones)
    .where(eq(eventZones.eventId, studioEventId))
    .orderBy(asc(eventZones.position));

  const catalog = await catalogOf(studioOrgId);
  const categoryByVariant = new Map<string, string>();
  for (const p of catalog) {
    categoryByVariant.set(p.id, p.category);
    for (const v of p.variants) categoryByVariant.set(v.id, p.category);
  }
  const content = hallPassOf(doc.content, (v) => categoryByVariant.get(v));
  // Only what the sketch draws with, each through the client allow-list — no price leaves here.
  const used = variantIdsOf(content);
  const products = catalog
    .filter((p) => used.has(p.id) || p.variants.some((v) => used.has(v.id)) || (WHOLE_CATEGORIES.includes(p.category) && !p.archived))
    .map(clientProduct);

  return {
    studioName: studio.name,
    venueId: event.venueId,
    zoneIds: zoneRows.map((z) => z.zoneId),
    geometry: await eventGeometry(studioOrgId, event.venueId),
    content,
    products,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}
