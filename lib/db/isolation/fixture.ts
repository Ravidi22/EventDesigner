// The two sides of the isolation test (EVE-23): everything "A" owns, built through the real actions as
// A's own people, and the "B" businesses that will try to reach it.
//
// A's side is a studio with a venue, an event and everything that hangs off one — a drawing, a quote,
// a billing document, a client and her proposal, crew, gallery, procurement, an order to a linked
// supplier — plus that supplier (a published and a private product) and a venue owner (a booking,
// a menu, a designer invitation to studio A). B's side is one business of each kind, and a client of
// B's own event.
//
// Throwaway: every organisation is minted here and deleted in `cleanup`, by organisation, in an order
// the foreign keys accept. Names carry "(בדיקת בידוד)" so a leftover is obvious.
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { actAsUserForScript } from "@/lib/auth/session";
import { emptyStructure } from "@/lib/venues/structure";
import type { Zone } from "@/lib/venues/zone";
import { saveProduct } from "@/lib/catalog/actions";
import type { Product } from "@/lib/catalog/types";
import { fetchEvents, saveEvent } from "@/lib/events/actions";
import type { EventSummary } from "@/lib/events/types";
import { saveDocument } from "@/lib/studio/actions";
import { issueQuote, saveQuoteDraft } from "@/lib/quotes/actions";
import { DEFAULT_LAYOUT } from "@/lib/quotes/layout";
import { issueOrder } from "@/lib/billing/actions";
import { defaultSchedule } from "@/lib/billing/rules";
import { saveAppointment } from "@/lib/appointments/actions";
import type { Appointment } from "@/lib/appointments/types";
import { saveImage, savePresentation, toggleLike } from "@/lib/gallery/actions";
import type { GalleryImage, Presentation } from "@/lib/gallery/types";
import { saveExpense, saveSupplier } from "@/lib/suppliers/actions";
import type { Expense, Supplier } from "@/lib/suppliers/types";
import { fetchOrders, sendOrder } from "@/lib/orders/actions";
import { recordExport, saveSpare } from "@/lib/outputs/actions";
import { mintSceneLink, saveSceneSettings } from "@/lib/scene/actions";
import { saveSketchTemplate } from "@/lib/studio/sketch-actions";
import { setEventCrew } from "@/lib/production/actions";
import { inviteMember } from "@/lib/team/actions";
import { shareEventWithClient } from "@/lib/events/client-actions";
import { saveProposal, startProposal, submitProposal } from "@/lib/client-portal/actions";
import { fetchPendingProposals } from "@/lib/proposals/actions";
import { saveBooking } from "@/lib/hosting/actions";
import { emptyHosting } from "@/lib/hosting/types";
import { saveDish, saveMenuPackage } from "@/lib/menus/actions";
import type { Dish, MenuPackage } from "@/lib/menus/types";
import { acceptLinkInvite, inviteDesigner } from "@/lib/event-links/actions";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { stable } from "./judge";

export type Actor = "studioB" | "supplierB" | "venueB" | "clientB";

export interface Fixture {
  // ── A's side ──
  orgA: string;
  orgS: string;
  orgV: string;
  ownerA: string;
  ownerAEmail: string;
  memberA: string;
  pendingMemberA: string;
  supplierUserS: string;
  venueUserV: string;
  clientC: string;
  venueId: string;
  zoneId: string;
  grantId: string;
  eventId: string;
  event: EventSummary;
  linkedEventId: string;
  bookingEventId: string;
  booking: EventSummary;
  linkId: string;
  product: Product;
  productId: string;
  variantId: string;
  publicProductS: string;
  publicVariantS: string;
  /** A uuid written into A's rows that carry no id of their own (the quote draft's palette note), so
   *  a leak of one is still seen by the judge. */
  marker: string;
  privateProductS: string;
  appointment: Appointment;
  image: GalleryImage;
  presentation: Presentation;
  supplier: Supplier;
  expense: Expense;
  orderId: string;
  billingDocId: string;
  proposalId: string;
  sceneLinkId: string;
  sketchTemplateId: string;
  notificationIds: string[];
  dish: Dish;
  pkg: MenuPackage;
  fileKey: string;
  filePath: string;
  // ── B's side ──
  orgB: string;
  orgB2: string;
  orgB3: string;
  users: Record<Actor, string>;
  eventB: string;
  // ── for the judge ──
  aOrgs: string[];
  aIds: string[];
}

const TAG = "(בדיקת בידוד)";
const ISO = (d: Date) => d.toISOString().slice(0, 10);

function square(x: number) {
  return [
    { x, y: 0 },
    { x: x + 10000, y: 0 },
    { x: x + 10000, y: 8000 },
    { x, y: 8000 },
  ];
}

function anEvent(id: string, name: string, extra: Partial<EventSummary> = {}): EventSummary {
  return {
    id,
    clientName: `${name} ${TAG}`,
    phone: "050-0000000",
    date: "2027-06-01",
    zoneIds: [],
    zonesLabel: "",
    guests: 120,
    step: 0,
    createdAt: Date.now(),
    ...extra,
  } as EventSummary;
}

function aProduct(name: string, extra: Partial<Product> = {}): Product {
  return {
    id: randomUUID(),
    name: `${name} ${TAG}`,
    category: "tablecloths",
    layer: "table",
    dimensions: { widthMm: 3200, depthMm: 3200, heightMm: 5 },
    unitPrice: 45,
    styleTags: [],
    variants: [{ id: randomUUID(), name: "זהב", swatch: "#c9a227" }],
    ...extra,
  } as Product;
}

/** Throw if an action answered with an error while SEEDING — a broken fixture proves nothing. */
function ok<T>(value: T | { error: string }, what: string): T {
  if (value && typeof value === "object" && "error" in value && typeof (value as { error: unknown }).error === "string") {
    throw new Error(`fixture: ${what} — ${(value as { error: string }).error}`);
  }
  return value as T;
}

const step = (name: string) => {
  if (process.env.ISOLATION_DEBUG) console.log(`seed: ${name}`);
};

export async function seed(): Promise<Fixture> {
  const database = db();
  const stamp = Date.now();
  const mail = (who: string) => `isolation-${who}-${stamp}@example.test`;
  const id = () => randomUUID();

  const orgA = id(), orgS = id(), orgV = id(), orgB = id(), orgB2 = id(), orgB3 = id();
  await database.insert(schema.organizations).values([
    { id: orgA, name: `סטודיו א ${TAG}`, kind: "studio" },
    { id: orgS, name: `ספק א ${TAG}`, kind: "supplier" },
    { id: orgV, name: `אולם א ${TAG}`, kind: "venue" },
    { id: orgB, name: `סטודיו ב ${TAG}`, kind: "studio" },
    { id: orgB2, name: `ספק ב ${TAG}`, kind: "supplier" },
    { id: orgB3, name: `אולם ב ${TAG}`, kind: "venue" },
  ]);
  await database.insert(schema.studioSettings).values([
    { organizationId: orgA, businessName: `סטודיו א ${TAG}`, businessNumber: "123456789", address: "רחוב א 1", vatRate: "0.18", pricesIncludeVat: true },
    { organizationId: orgB, businessName: `סטודיו ב ${TAG}`, businessNumber: "987654321", address: "רחוב ב 2", vatRate: "0.18", pricesIncludeVat: true },
  ]);

  const ownerA = id(), memberA = id(), supplierUserS = id(), venueUserV = id();
  const ownerB = id(), supplierUserB = id(), venueUserB = id();
  const person = (uid: string, org: string, who: string, role: "owner" | "designer") =>
    ({ id: uid, organizationId: org, kind: "studio" as const, email: mail(who), name: who, role, state: "active" as const });
  await database.insert(schema.users).values([
    person(ownerA, orgA, "owner-a", "owner"),
    person(memberA, orgA, "member-a", "designer"),
    person(supplierUserS, orgS, "supplier-s", "owner"),
    person(venueUserV, orgV, "venue-v", "owner"),
    person(ownerB, orgB, "owner-b", "owner"),
    person(supplierUserB, orgB2, "supplier-b", "owner"),
    person(venueUserB, orgB3, "venue-b", "owner"),
  ]);

  step("supplier catalog");
  // ── the supplier's catalog: one published row, one private ──
  actAsUserForScript(supplierUserS);
  const publicS = aProduct("מפה מפורסמת", { visibility: "public" } as Partial<Product>);
  const privateS = aProduct("מפה פרטית", { visibility: "private" } as Partial<Product>);
  ok(await saveProduct(publicS), "the supplier's public row");
  ok(await saveProduct(privateS), "the supplier's private row");

  step("studio A venue");
  // ── studio A ──
  actAsUserForScript(ownerA);
  // Inserted as lib/event-links/verify.ts does: the venue actions are the CASES here, not the seed.
  const venueId = id();
  const zone = { id: id(), venueId, name: `אולם ${TAG}`, kind: "hall", source: { type: "region", boundary: square(0) }, ceilingHeightMm: 0 } as unknown as Zone;
  await database.insert(schema.venues).values({ id: venueId, organizationId: orgA, name: `מתחם ${TAG}`, plan: { mmPerUnit: 1 } } as never);
  await database.insert(schema.venueStructures).values({ venueId, organizationId: orgA, structure: emptyStructure() } as never);
  await database.insert(schema.zones).values({ id: zone.id, organizationId: orgA, venueId, name: zone.name, kind: zone.kind, source: zone.source, ceilingHeightMm: 0 } as never);

  step("A product");
  const product = aProduct("מפת קטיפה");
  ok(await saveProduct(product), "A's product");
  const variantId = product.variants![0].id;

  step("A event");
  const eventId = id();
  await saveEvent(anEvent(eventId, "אירוע א", { venueId, zoneIds: [zone.id] } as Partial<EventSummary>));
  const content = {
    calibration: { mmPerUnit: 1 },
    tables: [],
    placements: [{ id: id(), variantId, layer: "floor", quantity: 1, position: { x: 1000, y: 1000 }, rotation: 0, scale: 1 }],
  } as unknown as DesignDocumentContent;
  await saveDocument(eventId, content);
  step("quote");
  await issueQuote(eventId, { layout: { ...DEFAULT_LAYOUT, finalPrice: 11800 }, total: 11800, discount: 0 } as never);
  const marker = id();
  await saveQuoteDraft(eventId, { ...DEFAULT_LAYOUT, paletteNote: `סימון ${marker}` });
  step("billing order");
  const today = ISO(new Date());
  const line = { key: "design", label: "עיצוב", quantity: 1, unit: "unit" as const, unitPrice: 11800, total: 11800 };
  const order = ok(
    await issueOrder(eventId, { customer: { name: "לקוח א", address: "רחוב 2", number: "012345678" }, lines: [line], schedule: defaultSchedule(11800, "2027-06-01", today) } as never),
    "A's billing order",
  );
  const billingDocId = (order as { id: string }).id;

  step("appointment");
  const appointment: Appointment = { id: id(), eventId, clientName: `פגישה ${TAG}`, phone: "050-0000000", date: "2027-01-10", time: "10:00", durationMin: 60, kind: "consultation", note: "", createdAt: Date.now() };
  await saveAppointment(appointment);

  step("gallery");
  const image: GalleryImage = { id: id(), name: `תמונה ${TAG}`, productId: product.id, productName: product.name };
  await saveImage(image);
  const presentation: Presentation = { id: id(), name: `מצגת ${TAG}`, imageIds: [image.id], createdAt: Date.now() };
  await savePresentation(presentation);
  await toggleLike(eventId, image.id);

  step("supplier + expense");
  const supplier: Supplier = { id: id(), name: `ספק של א ${TAG}`, phone: "050-1111111" };
  await saveSupplier(supplier);
  await database.update(schema.suppliers).set({ linkedOrgId: orgS } as never).where(eq(schema.suppliers.id, supplier.id));
  const expense: Expense = { id: id(), supplierId: supplier.id, eventId, description: `הוצאה ${TAG}`, amount: 500, spentAt: today, paid: false };
  await saveExpense(expense);
  step("order");
  await sendOrder({ supplierId: supplier.id, windowFrom: "2027-05-01", windowTo: "2027-06-30", lines: [{ variantId, description: "מפות", quantity: 10, unitLabel: "יח׳", unitCost: 20 }] });
  const orderId = (await fetchOrders()).find((o) => o.supplierId === supplier.id)?.id;
  if (!orderId) throw new Error("fixture: A's order to its supplier was not written");

  step("export, spares, scene, sketch, crew, invite");
  await recordExport(eventId, "quote" as never);
  await saveSpare(eventId, variantId, 2);
  await saveSceneSettings(eventId, { tableware: false });
  const { links } = await mintSceneLink(eventId);
  const sceneLinkId = links[0]?.id;
  const sketches = ok(await saveSketchTemplate({ name: `סקיצה ${TAG}`, venueId, content }), "A's saved sketch");
  const sketchTemplateId = sketches[0]?.id;
  await setEventCrew(eventId, [memberA]);
  const invited = await inviteMember(`מוזמנת ${TAG}`, mail("pending-a"), "designer");
  const pendingMemberA = invited.members.find((m) => m.status === "invited")?.id;

  step("grant");
  const grantId = id();
  await database.insert(schema.venueGrants).values({ id: grantId, venueId, grantorOrgId: orgA, granteeOrgId: orgS, granteeEmail: mail("supplier-s"), granteeName: "ספק א", kind: "guest", role: "viewer", state: "active" } as never);

  step("client + proposal");
  // A's client, and her proposal (it notifies A's owner and designer).
  const share = await shareEventWithClient(eventId, { name: `לקוחה ${TAG}`, email: mail("client-c") });
  const clientC = share.userId ?? share.clients[0]?.userId;
  if (!clientC) throw new Error(`fixture: A's client was not shared (${share.error ?? "no id"})`);
  await database.update(schema.users).set({ state: "active" }).where(eq(schema.users.id, clientC));
  actAsUserForScript(clientC);
  const draft = await startProposal(eventId);
  if ("error" in draft) throw new Error(`fixture: proposal — ${draft.error}`);
  const saved = await saveProposal(eventId, content, draft.revision);
  await submitProposal(eventId, "נא לאשר", "revision" in saved ? saved.revision : draft.revision);
  actAsUserForScript(ownerA);
  const proposalId = (await fetchPendingProposals()).find((p) => p.eventId === eventId)?.id ??
    (await database.select({ id: schema.sketchProposals.id }).from(schema.sketchProposals).where(eq(schema.sketchProposals.eventId, eventId)))[0]?.id;

  step("venue V");
  // ── venue V: a booking, a menu, and studio A invited onto the evening ──
  actAsUserForScript(venueUserV);
  const bookingEventId = id();
  const booking = anEvent(bookingEventId, "הזמנה באולם");
  await saveBooking(booking, emptyHosting());
  const dish: Dish = { id: id(), name: `מנה ${TAG}`, course: "main" as Dish["course"], description: "", tags: [], position: 0 };
  await saveDish(dish);
  const pkg: MenuPackage = { id: id(), name: `חבילה ${TAG}`, description: "", priceAdult: 300, priceChild: 150, priceVendor: 100, minGuests: 100, courses: [], extras: [] };
  await saveMenuPackage(pkg);
  const link = ok(await inviteDesigner(bookingEventId, mail("owner-a")), "V's invitation to studio A");
  const linkId = (link as { id: string }).id;
  actAsUserForScript(ownerA);
  const accepted = ok(await acceptLinkInvite(linkId, null), "studio A accepting V's invitation");
  const linkedEventId = accepted.eventId;
  const event = (await fetchEvents()).find((e) => e.id === eventId)!;

  step("file");
  // A file of A's on the local driver (the run has no bucket).
  const fileKey = `${orgA}/gallery/${id()}.jpg`;
  const filePath = resolve(process.cwd(), ".uploads", fileKey);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  step("B side");
  // ── B's side: its own event and its own client ──
  actAsUserForScript(ownerB);
  const eventB = id();
  await saveEvent(anEvent(eventB, "אירוע ב"));
  const shareB = await shareEventWithClient(eventB, { name: `לקוח ב ${TAG}`, email: mail("client-b") });
  const clientB = shareB.userId ?? shareB.clients[0]?.userId;
  if (!clientB) throw new Error("fixture: B's client was not shared");
  await database.update(schema.users).set({ state: "active" }).where(eq(schema.users.id, clientB));
  actAsUserForScript(null);

  const notificationIds = (
    await database.select({ id: schema.notifications.id }).from(schema.notifications).where(inArray(schema.notifications.organizationId, [orgA, orgS, orgV]))
  ).map((r) => r.id);

  const required = { pendingMemberA, sceneLinkId, sketchTemplateId, proposalId };
  for (const [name, value] of Object.entries(required)) if (!value) throw new Error(`fixture: ${name} was not created`);

  const aOrgs = [orgA, orgS, orgV];
  const aIds = [
    ...aOrgs,
    ownerA, memberA, pendingMemberA!, supplierUserS, venueUserV, clientC,
    venueId, zone.id, grantId, eventId, linkedEventId, bookingEventId, linkId,
    marker, product.id, variantId, publicS.id, publicS.variants![0].id, privateS.id, privateS.variants![0].id,
    appointment.id, image.id, presentation.id, supplier.id, expense.id, orderId, billingDocId,
    proposalId!, sceneLinkId!, sketchTemplateId!, dish.id, pkg.id, ...notificationIds,
  ];

  return {
    orgA, orgS, orgV, ownerA, ownerAEmail: mail("owner-a"), memberA, pendingMemberA: pendingMemberA!, supplierUserS, venueUserV, clientC,
    venueId, zoneId: zone.id, grantId, eventId, event, linkedEventId, bookingEventId, booking, linkId,
    product, productId: product.id, variantId, publicProductS: publicS.id, publicVariantS: publicS.variants![0].id, marker, privateProductS: privateS.id,
    appointment, image, presentation, supplier, expense, orderId, billingDocId,
    proposalId: proposalId!, sceneLinkId: sceneLinkId!, sketchTemplateId: sketchTemplateId!, notificationIds,
    dish, pkg, fileKey, filePath,
    orgB, orgB2, orgB3, users: { studioB: ownerB, supplierB: supplierUserB, venueB: venueUserB, clientB }, eventB,
    aOrgs, aIds,
  };
}

/** Tables with no organization_id: which column ties a row to its owner's side. */
const OWNED_BY: Record<string, string[]> = {
  event_clients: ["event_id"],
  event_liked_images: ["event_id"],
  event_zones: ["event_id"],
  packing_spares: ["event_id"],
  presentation_images: ["presentation_id"],
  order_lines: ["order_id"],
  event_links: ["id", "venue_event_id", "studio_event_id"],
  organizations: ["id"],
};

/**
 * A fingerprint of everything on A's side: every row owned by A's organisations, and the link rows that
 * hang off A's events, orders and presentations. A grant on A's venue is A's too — except a VIEWER
 * grant one of B's businesses gave itself by following the venue, which is open to everyone by design.
 */
export async function snapshotA(f: Fixture): Promise<string> {
  const database = db();
  const tables = (await database.execute(sql`
    select table_name, bool_or(column_name = 'organization_id') as owned
    from information_schema.columns
    where table_schema = 'public'
    group by table_name order by table_name`)) as unknown as { table_name: string; owned: boolean }[];
  const ids = new Set(f.aIds);
  const orgs = new Set(f.aOrgs);
  const bOrgs = new Set([f.orgB, f.orgB2, f.orgB3]);
  const lines: string[] = [];
  for (const { table_name: table, owned } of tables) {
    if (table.startsWith("auth_")) continue;
    const rows = (await database.execute(sql.raw(`select * from "${table}"`))) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      let mine: boolean;
      // A row of B's that points at one of A's EVENTS is a leak as well (a crew row, a scene link) —
      // events are never shared; venues are, so a reference to A's venue is not counted.
      if (owned) mine = orgs.has(String(row.organization_id)) || ids.has(String(row.id)) || ids.has(String(row.event_id));
      else if (table === "venue_grants") {
        mine = ids.has(String(row.venue_id)) && !(bOrgs.has(String(row.grantee_org_id)) && row.role === "viewer");
      } else mine = (OWNED_BY[table] ?? []).some((col) => ids.has(String(row[col])));
      if (mine) lines.push(`${table} ${stable(row)}`);
    }
  }
  lines.sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** A readable list of A's rows, for the report when a snapshot changes. */
export async function rowsOfA(f: Fixture): Promise<string[]> {
  const database = db();
  const out: string[] = [];
  for (const table of ["events", "products", "venues", "zones", "billing_documents", "orders", "users", "suppliers", "expenses"]) {
    const rows = (await database.execute(sql.raw(`select * from "${table}" where organization_id in (${f.aOrgs.map((o) => `'${o}'`).join(",")})`))) as unknown as Record<string, unknown>[];
    for (const row of rows) out.push(`${table} ${JSON.stringify(row)}`);
  }
  return out;
}

/** Removes what an earlier run left — a seed that threw half-way never reached `cleanup`. Its
 *  organisations carry the tag in their name, its people an isolation-…@example.test address. */
export async function sweep(): Promise<number> {
  const database = db();
  const orgs = (await database.execute(sql`select id from organizations where name like ${`%${TAG}%`}`)) as unknown as { id: string }[];
  const strays = (await database.execute(sql`select id from users where email like 'isolation-%@example.test'`)) as unknown as { id: string }[];
  if (orgs.length || strays.length) await cleanup(orgs.map((o) => o.id), strays.map((u) => u.id));
  return orgs.length;
}

/** Deletes every throwaway organisation and what hangs off it. Never throws. */
export async function cleanup(orgIds: string[], extraUserIds: string[] = [], filePath?: string): Promise<void> {
  const database = db();
  if (filePath && existsSync(filePath)) rmSync(filePath, { force: true });
  // One transaction: `set local` holds for its statements only, on the one connection they share — a
  // plain `set` would land on whichever pooled connection ran it. Replica mode lets the deletes go in
  // any order past the foreign keys (billing documents RESTRICT their event).
  await database.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await purge(tx as unknown as ReturnType<typeof db>, orgIds, extraUserIds);
  }).catch((e) => console.error("cleanup failed:", e));
}

async function purge(database: ReturnType<typeof db>, orgIds: string[], extraUserIds: string[]): Promise<void> {
  {
    const tables = (await database.execute(sql`
      select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'organization_id' group by table_name`)) as unknown as { table_name: string }[];
    const users = (
      await database.select({ id: schema.users.id }).from(schema.users).where(or(inArray(schema.users.organizationId, orgIds), inArray(schema.users.id, extraUserIds.length ? extraUserIds : [randomUUID()])))
    ).map((u) => u.id);
    const events = (await database.select({ id: schema.events.id }).from(schema.events).where(inArray(schema.events.organizationId, orgIds))).map((e) => e.id);
    const list = (xs: string[]) => (xs.length ? xs.map((x) => `'${x}'`).join(",") : "null");
    for (const stmt of [
      `delete from event_clients where event_id in (${list(events)}) or user_id in (${list(users)})`,
      `delete from event_liked_images where event_id in (${list(events)})`,
      `delete from event_zones where event_id in (${list(events)})`,
      `delete from packing_spares where event_id in (${list(events)})`,
      `delete from event_links where venue_org_id in (${list(orgIds)}) or studio_org_id in (${list(orgIds)})`,
      `delete from venue_grants where grantor_org_id in (${list(orgIds)}) or grantee_org_id in (${list(orgIds)})`,
      `delete from order_lines where order_id in (select id from orders where organization_id in (${list(orgIds)}))`,
      `delete from presentation_images where presentation_id in (select id from presentations where organization_id in (${list(orgIds)}))`,
      `delete from auth_sessions where user_id in (${list(users)})`,
      `delete from auth_accounts where user_id in (${list(users)})`,
    ]) await database.execute(sql.raw(stmt));
    for (const { table_name } of tables) {
      if (table_name === "users") continue;
      await database.execute(sql.raw(`delete from "${table_name}" where organization_id in (${list(orgIds)})`));
    }
    await database.execute(sql.raw(`delete from users where id in (${list(users)})`));
    await database.execute(sql.raw(`delete from organizations where id in (${list(orgIds)})`));
  }
}
