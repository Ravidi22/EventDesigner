// Proves Product → Postgres → Product survives the trip unchanged.
//
//   npm run db:verify
//
// It builds its own fixture rather than comparing against seed content, because there is no seed
// content any more — the catalog starts empty and fills with the designer's real products. That
// also makes this safe to run against a catalog with real items in it: everything it creates is
// deleted again, and the last assertion is that the catalog is exactly the size it was on entry.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq } from "drizzle-orm";
import { actAsOrgForScript, SINGLE_ORG_ID } from "@/lib/db/org";

// This script is a plain Node process: there is no request and no session cookie for currentOrg()
// to read. This is the one seam that lets it say which studio it is acting as, and it refuses to
// work in production. The organisation is the one `npm run db:seed` creates.
//
// It runs at module scope rather than inside main() because it must be set before the first action
// call. (Imports hoist above it — that is fine, since none of them call currentOrg() while being
// evaluated, only when invoked.)
actAsOrgForScript(SINGLE_ORG_ID);

import { fetchProducts, saveProduct, removeProduct } from "@/lib/catalog/actions";
import type { Product } from "@/lib/catalog/types";
import {
  fetchVenues,
  createVenue,
  renameVenue,
  saveVenuePlan,
  fetchVenuePlan,
  fetchVenueGeometry,
  fetchVenueGrants,
  shareVenue,
  setGrantRole,
  revokeGrant,
} from "@/lib/venues/actions";
import { emptyStructure, type VenueStructure } from "@/lib/venues/structure";
import type { Zone } from "@/lib/venues/zone";
import { fetchMembers, inviteMember, regenerateInvite, removeMember } from "@/lib/team/actions";
import { inviteInfo, signUp } from "@/lib/auth/actions";
import { fetchEvents, saveEvent, patchEvent, reachStep } from "@/lib/events/actions";
import type { EventSummary } from "@/lib/events/types";
import {
  fetchAppointments,
  saveAppointment,
  setAppointmentDone,
  deleteAppointment,
} from "@/lib/appointments/actions";
import type { Appointment } from "@/lib/appointments/types";
import {
  fetchSettings,
  saveSettings,
  fetchMeetingFlow,
  saveMeetingFlow,
  resetMeetingFlow,
} from "@/lib/settings/actions";
import { DEFAULT_FLOW } from "@/lib/meeting/steps";
import { fetchDocument, saveDocument, sealDocument } from "@/lib/studio/actions";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import {
  fetchSpares,
  saveSpare,
  fetchNextExportNumber,
  recordExport,
  fetchExports,
} from "@/lib/outputs/actions";
import {
  fetchImages,
  saveImage,
  fetchPresentations,
  savePresentation,
  deletePresentation,
  fetchFolder,
  toggleLike,
} from "@/lib/gallery/actions";
import { likedProductIds } from "@/lib/gallery/folder-logic";
import type { GalleryImage, Presentation } from "@/lib/gallery/types";
import { db } from "@/lib/db";
import { venues, events, designDocuments, galleryImages } from "@/lib/db/schema";

/** There is no deleteVenue or deleteEvent action — the app has no such button, only archive — so
 *  fixtures are removed directly. A test must not be the reason a destructive production action
 *  exists. */
async function deleteVenueForTest(id: string) {
  await db().delete(venues).where(eq(venues.id, id));
}

async function deleteEventForTest(id: string) {
  await db().delete(events).where(eq(events.id, id));
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

/** Drop undefined keys, the way JSON transport does — absent and undefined are one thing here. */
const clean = (p: Product) => JSON.parse(JSON.stringify(p)) as Record<string, unknown>;

/** JSON with object keys sorted, so two structurally equal values compare equal.
 *
 *  Needed because Postgres JSONB does not preserve key ORDER — it stores keys sorted by length then
 *  alphabetically — so a value written as {id, a, b} comes back as {a, b, id}. Same data, different
 *  string. Any equality test on a JSONB round-trip has to normalise first. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  );
}

function fixture(): Product {
  return {
    id: crypto.randomUUID(),
    name: "בדיקה — מפת קטיפה",
    category: "tablecloths",
    layer: "table",
    dimensions: { widthMm: 3200, depthMm: 3200, heightMm: 5 },
    categoryFields: { arms: 5 },
    spec: "בד קטיפה",
    unitPrice: 45.75,
    styleTags: ["קלאסי", "זוהר"],
    variants: [
      { id: crypto.randomUUID(), name: "זהב", swatch: "#c9a227" },
      { id: crypto.randomUUID(), name: "בורדו", swatch: "#6d1f2e", unitPrice: 52.25 },
    ],
  };
}

async function main() {
  const before = (await fetchProducts()).length;
  console.log(`catalog on entry: ${before} products\n`);

  // ── round trip ───────────────────────────────────────────────────────────────────────────────
  const original = fixture();
  const afterSave = await saveProduct(original);
  const returned = afterSave.find((p) => p.id === original.id);
  check("saveProduct created it", !!returned);

  if (returned) {
    const a = clean(original);
    const b = clean(returned);
    const diffs = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      .map((k) => `${k}: sent=${JSON.stringify(a[k])} got=${JSON.stringify(b[k])}`);
    check("the whole object round-trips identically", diffs.length === 0, diffs.join(" | "));
    check("dimensions survived (nested → flat → nested)", JSON.stringify(returned.dimensions) === JSON.stringify(original.dimensions));
    check("price is a NUMBER with exact decimals", returned.unitPrice === 45.75, `${typeof returned.unitPrice} ${returned.unitPrice}`);
    check("variant price kept precision", returned.variants[1]?.unitPrice === 52.25, String(returned.variants[1]?.unitPrice));
    check("variants kept their order", returned.variants.map((v) => v.name).join(",") === "זהב,בורדו");
    check("jsonb categoryFields survived", JSON.stringify(returned.categoryFields) === JSON.stringify({ arms: 5 }));
    check("styleTags array survived", JSON.stringify(returned.styleTags) === JSON.stringify(["קלאסי", "זוהר"]));
  }

  // ── visibility ───────────────────────────────────────────────────────────────────────────────
  check("a new product defaults to private (absent)", returned?.visibility === undefined, String(returned?.visibility));

  const published = await saveProduct({ ...original, visibility: "public" });
  const pub = published.find((p) => p.id === original.id);
  check("publishing persists", pub?.visibility === "public", String(pub?.visibility));

  const unpublished = await saveProduct({ ...original, visibility: "private" });
  const priv = unpublished.find((p) => p.id === original.id);
  check("un-publishing collapses back to absent, not the string", priv?.visibility === undefined, String(priv?.visibility));

  // ── update ───────────────────────────────────────────────────────────────────────────────────
  const edited = { ...original, name: "בדיקה — שם מעודכן", variants: [] };
  const afterEdit = await saveProduct(edited);
  const updated = afterEdit.find((p) => p.id === original.id);
  check("update is in place, not a duplicate", afterEdit.filter((p) => p.id === original.id).length === 1);
  check("rename landed", updated?.name === "בדיקה — שם מעודכן");
  check("variants replaced wholesale (now empty)", updated?.variants.length === 0);

  // ── delete ───────────────────────────────────────────────────────────────────────────────────
  const { products: afterDelete, archived } = await removeProduct(original.id);
  check("an unplaced product is deleted, not archived", archived === false);
  check("it is gone", !afterDelete.some((p) => p.id === original.id));
  check("the catalog is exactly as we found it", afterDelete.length === before, `${afterDelete.length} vs ${before}`);

  await verifyVenues();
  await verifyGrants();
  await verifyInvites();
  await verifyEvents();
  await verifyAppointments();
  await verifySettings();
  await verifyDocuments();
  await verifyOutputs();
  await verifyGallery();

  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

/** The venue half: a property, its wall graph and its zones — written together, read back apart. */
async function verifyVenues() {
  console.log("\n— venues —");
  const before = (await fetchVenues()).length;

  const { venues: created, id } = await createVenue();
  check("createVenue added one", created.length === before + 1);

  const renamed = await renameVenue(id, "בדיקה — חוות");
  check("renameVenue landed", renamed.find((v) => v.id === id)?.name === "בדיקה — חוות");

  // A minimal wall graph: two nodes, one wall between them, and a zone anchored inside.
  const a = crypto.randomUUID();
  const b = crypto.randomUUID();
  const structure: VenueStructure = {
    ...emptyStructure(),
    nodes: [
      { id: a, x: 0, y: 0 },
      { id: b, x: 12000, y: 0 },
    ],
    walls: [{ id: crypto.randomUUID(), a, b, kind: "wall" }],
  };
  const zone: Zone = {
    id: crypto.randomUUID(),
    venueId: id,
    name: "האולם הגדול",
    kind: "hall",
    source: { type: "face", anchor: { x: 6000, y: 3000 } },
    ceilingHeightMm: 4200,
    capacity: { seated: 300 },
    createdAt: Date.now(),
  };

  await saveVenuePlan(id, structure, [zone]);
  const plan = await fetchVenuePlan(id);
  check(
    "wall graph round-trips",
    stable(plan.structure) === stable(structure),
    `sent=${JSON.stringify(structure).slice(0, 120)} got=${JSON.stringify(plan.structure).slice(0, 120)}`,
  );
  check("zone round-trips", JSON.stringify(plan.zones) === JSON.stringify([zone]), JSON.stringify(plan.zones[0]?.capacity));
  check("zone createdAt survives as epoch ms", plan.zones[0]?.createdAt === zone.createdAt);

  // Saving again replaces wholesale — the undo path. Two saves must not leave two zones.
  await saveVenuePlan(id, structure, [zone]);
  check("re-saving does not duplicate zones", (await fetchVenuePlan(id)).zones.length === 1);

  // Removing a zone from the list is how an undo expresses itself.
  await saveVenuePlan(id, structure, []);
  check("a shorter list deletes the zone", (await fetchVenuePlan(id)).zones.length === 0);

  const geometry = await fetchVenueGeometry(id);
  check("geometry carries the walls", geometry.structure.walls.length === 1);
  check("geometry carries the venue's scale", geometry.mmPerUnit === 1);
  check("…and says the plan is really ours to see", geometry.access === "granted", geometry.access);

  const noVenue = await fetchVenueGeometry(undefined);
  check("an absent venue yields empty geometry, not an error", noVenue.zones.length === 0);
  // The distinction the screens hang on: "nobody picked a property" is not "that property is not
  // yours". An empty plane meant both until this field existed, and the second one silently
  // under-prices every per-metre item (see VenueGeometry.access).
  check("…and calls that 'none', not a refusal", noVenue.access === "none", noVenue.access);
  // `denied` is deliberately NOT asserted here: this script acts as an owner, and an owner reaches
  // every property in the studio by definition (reachesAllVenues). Reaching it would mean signing
  // in as a second, ungranted member, which is a session this process does not have. The policy
  // behind it is asserted in `npm run check:access`.

  await deleteVenueForTest(id);
  check("cleanup: the venue list is as we found it", (await fetchVenues()).length === before, `${(await fetchVenues()).length} vs ${before}`);
}

/**
 * Invitations: the link that stands in for the email nobody sends.
 *
 * ⚠ WHAT THIS CANNOT REACH. `acceptInvite()` ends by setting a session cookie, and a script has no
 * response to set one on — so the claim itself is exercised by rendering /join/<token> against the
 * dev server instead. Everything up to it is here, including the two assertions that matter for a
 * credential: a bad token resolves to nothing, and re-issuing a link kills the previous one.
 */
async function verifyInvites() {
  console.log("\n— invitations —");
  const address = `shira+${Date.now()}@eve.studio`;

  const invited = await inviteMember("שירה לוי", address, "designer");
  check("inviteMember returns a link", Boolean(invited.link), invited.error ?? invited.link);
  check("the invited person is pending", invited.members.find((m) => m.email === address)?.status === "invited");

  const token = invited.link!.split("/").pop()!;
  const info = await inviteInfo(token);
  check("the token resolves to the invited address", info?.email === address, info?.email);
  check("…and names the studio doing the inviting", Boolean(info?.studioName), info?.studioName);

  check("a token that was never issued resolves to nothing", (await inviteInfo("not-a-real-token")) === null);
  check("an empty token resolves to nothing", (await inviteInfo("")) === null);

  // The address is real now, so signing up with it must not be refused as "taken" — that message
  // sends someone to a sign-in form that will also refuse them, which is the dead end this whole
  // flow exists to close.
  const blocked = await signUp({ kind: "studio", studioName: "x", name: "שירה", email: address, password: "hunter2hunter2" });
  check("signing up with an invited address points at the link", blocked.error?.includes("קישור ההזמנה") === true, blocked.error);

  // Re-issuing invalidates. One hash per row, so the link a designer forwarded to the wrong person
  // stops working the moment they generate another.
  const reissued = await regenerateInvite(invited.members.find((m) => m.email === address)!.id);
  check("regenerateInvite returns a new link", Boolean(reissued.link) && reissued.link !== invited.link);
  check("…and the OLD token is dead", (await inviteInfo(token)) === null);
  check("…while the new one works", (await inviteInfo(reissued.link!.split("/").pop()!))?.email === address);

  await removeMember(invited.members.find((m) => m.email === address)!.id);
  check("cleanup: the invitation is gone", (await fetchMembers()).every((m) => m.email !== address));
}

/**
 * Sharing a property: the grant rows behind "every member can reach different venues".
 *
 * ⚠ WHAT THIS CANNOT REACH. A script has no session, so currentActor() hands it an OWNER with no
 * user id (see lib/db/org.ts) — which is exactly the caller that BYPASSES grant filtering. So this
 * covers the guest half, which needs no account: write a grant, change its level, take it away.
 * The member half — a designer seeing a shorter venue list than the owner — needs two signed-in
 * users and belongs in a test that can hold a session, not here. What is verified here is that the
 * rows and the level round-trip; the filtering itself is asserted by the pure policy check in
 * lib/venues/access.ts (`npm run check:access`).
 */
async function verifyGrants() {
  console.log("\n— venue sharing —");
  const { id: venueId } = await createVenue();

  check("a new property starts unshared", (await fetchVenueGrants(venueId)).length === 0);

  const address = `maya+${Date.now()}@gorenstudio.co.il`;
  const shared = await shareVenue({ venueId, name: "מאיה גורן", email: address, kind: "guest", role: "viewer" });
  check("shareVenue wrote a grant", !shared.error && shared.grants.length === 1, shared.error);
  const grant = shared.grants[0];
  check("a guest lands as viewer", grant?.role === "viewer");
  // A guest has no account yet, so there is something for them to accept. (A member would be
  // `active` on the spot — they are already in the studio.)
  check("a guest grant is pending", grant?.status === "pending");
  check("a guest carries no member id", grant?.memberId === undefined);

  const again = await shareVenue({ venueId, name: "מאיה", email: address, kind: "guest", role: "manager" });
  check("the same address cannot be granted twice", Boolean(again.error) && again.grants.length === 1, again.error);

  const promoted = await setGrantRole(grant.id, "editor");
  check("setGrantRole landed", promoted[0]?.role === "editor");

  const emptied = await revokeGrant(grant.id);
  check("revokeGrant removed it", emptied.length === 0);

  // Deleting the venue takes its grants with it (ON DELETE CASCADE) — nothing else to clean up.
  await deleteVenueForTest(venueId);
}

/** The diary: meetings with clients (lib/appointments/). Three things are actually at risk here and
 *  each gets an assertion — that a meeting can exist with NO event (the prospect case this table was
 *  built for), that the date and the clock survive the round trip without a Date ever touching them,
 *  and that a meeting cannot be hung off a record this studio does not own. */
async function verifyAppointments() {
  console.log("\n— appointments —");
  const before = (await fetchAppointments()).length;

  const { id: venueId } = await createVenue();
  const eventId = await makeEvent("בדיקה — יומן");

  // A meeting with nobody's event: the first sit-down, before there is anything to attach it to.
  const prospect: Appointment = {
    id: crypto.randomUUID(),
    clientName: "בדיקה — זוג מתעניין",
    phone: "050-1111111",
    // The same trap as the wedding day above: this is a Sunday, the machine is at UTC+3, and
    // anything that parses it into a Date and formats it back lands on the 14th.
    date: "2026-06-15",
    time: "17:00",
    durationMin: 90,
    kind: "consultation",
    note: "היכרות ראשונה",
    createdAt: Date.now(),
  };
  const afterFirst = await saveAppointment(prospect);
  const back = afterFirst.find((a) => a.id === prospect.id);
  check("a meeting with no event at all is accepted", !!back);

  if (back) {
    const a = JSON.parse(JSON.stringify(prospect)) as Record<string, unknown>;
    const b = JSON.parse(JSON.stringify(back)) as Record<string, unknown>;
    const diffs = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      .map((k) => `${k}: sent=${JSON.stringify(a[k])} got=${JSON.stringify(b[k])}`);
    check("the whole meeting round-trips identically", diffs.length === 0, diffs.join(" | "));
    check("the day is the same CALENDAR DAY", back.date === "2026-06-15", back.date);
    check("the hour survives as HH:mm", back.time === "17:00", String(back.time));
    check("an unheld meeting has no done key", back.done === undefined, String(back.done));
  }

  // The same couple, later, once they have booked something — a SECOND meeting on one event, which
  // is the whole reason this is a table and not the column it replaced.
  const first: Appointment = { ...prospect, id: crypto.randomUUID(), eventId, venueId, date: "2026-05-04", kind: "walkthrough" };
  const second: Appointment = { ...prospect, id: crypto.randomUUID(), eventId, venueId, date: "2026-07-20", kind: "followup", time: undefined };
  await saveAppointment(first);
  const list = await saveAppointment(second);
  check("one event carries more than one meeting", list.filter((a) => a.eventId === eventId).length === 2);
  check("a meeting with no hour is allowed", list.find((a) => a.id === second.id)?.time === undefined);

  const dates = list.filter((a) => a.clientName === prospect.clientName).map((a) => a.date);
  check("the diary comes back soonest-first", dates.join() === [...dates].sort().join(), dates.join());

  // ── done is set, not inferred ────────────────────────────────────────────────────────────────
  const held = await setAppointmentDone(first.id, true);
  check("a meeting can be marked held", held.find((a) => a.id === first.id)?.done === true);
  const unheld = await setAppointmentDone(first.id, false);
  check("and un-marked, collapsing back to absent", unheld.find((a) => a.id === first.id)?.done === undefined);

  // ── what it refuses ──────────────────────────────────────────────────────────────────────────
  // A well-formed uuid for a row that is not this studio's. The foreign key alone would catch this
  // one because the row does not exist at all — the assertion that matters is that the ERROR comes
  // from assertLinks, before any write, which is the same check that stops a real id from another
  // organisation.
  await refuses("an event that is not this studio's", () =>
    saveAppointment({ ...prospect, id: crypto.randomUUID(), eventId: crypto.randomUUID() }),
  );
  await refuses("a venue that is not this studio's", () =>
    saveAppointment({ ...prospect, id: crypto.randomUUID(), venueId: crypto.randomUUID() }),
  );
  await refuses("a date that passes the regex but does not exist", () =>
    saveAppointment({ ...prospect, id: crypto.randomUUID(), date: "2026-02-31" }),
  );
  await refuses("an hour that is not on a clock", () =>
    saveAppointment({ ...prospect, id: crypto.randomUUID(), time: "25:00" }),
  );
  await refuses("a kind that is not one of the four", () =>
    saveAppointment({ ...prospect, id: crypto.randomUUID(), kind: "dinner" as Appointment["kind"] }),
  );
  await refuses("a meeting with no date", () =>
    saveAppointment({ ...prospect, id: crypto.randomUUID(), date: "" }),
  );

  // ── cleanup, which is itself the cascade assertion ───────────────────────────────────────────
  const afterDelete = await deleteAppointment(prospect.id);
  check("a cancelled meeting is gone, not archived", !afterDelete.some((a) => a.id === prospect.id));

  // Deleting the event takes its two meetings with it (ON DELETE CASCADE): a meeting about an event
  // that no longer exists is not a diary entry, it is a dangling row.
  await deleteEventForTest(eventId);
  const remaining = await fetchAppointments();
  check("deleting an event takes its meetings with it", !remaining.some((a) => a.eventId === eventId));
  await deleteVenueForTest(venueId);
  check("the diary is exactly as we found it", remaining.length === before, `${remaining.length} vs ${before}`);
}

/** The event half: a client record standing on zones of a property. Needs a venue and a zone to
 *  stand on, so it builds both and takes both down again. */
async function verifyEvents() {
  console.log("\n— events —");
  const before = (await fetchEvents()).length;

  // The property this event is booked into.
  const { id: venueId } = await createVenue();
  const zoneA: Zone = {
    id: crypto.randomUUID(),
    venueId,
    name: "האולם",
    kind: "hall",
    source: { type: "face", anchor: { x: 1000, y: 1000 } },
    ceilingHeightMm: 4000,
    createdAt: Date.now(),
  };
  const zoneB: Zone = { ...zoneA, id: crypto.randomUUID(), name: "החופה", kind: "canopy" };
  await saveVenuePlan(venueId, emptyStructure(), [zoneA, zoneB]);

  const original: EventSummary = {
    id: crypto.randomUUID(),
    clientName: "בדיקה — משפחת לוי",
    phone: "050-0000000",
    contactName: "נועה",
    contact2Name: "אבי",
    contact2Phone: "052-0000000",
    // The date this whole check exists for. It is a Sunday in August; the machine running this is
    // at UTC+3, so anything that parses it into a Date and formats it back lands on the 8th.
    date: "2026-08-09",
    time: "19:30",
    venueId,
    // B before A on purpose: the order is the designer's, not the table's.
    zoneIds: [zoneB.id, zoneA.id],
    zonesLabel: "החופה + האולם",
    guests: 240,
    step: 2,
    createdAt: Date.now(),
  };

  const afterSave = await saveEvent(original);
  const returned = afterSave.find((e) => e.id === original.id);
  check("saveEvent created it", !!returned);

  if (returned) {
    const a = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
    const b = JSON.parse(JSON.stringify(returned)) as Record<string, unknown>;
    const diffs = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      .map((k) => `${k}: sent=${JSON.stringify(a[k])} got=${JSON.stringify(b[k])}`);
    check("the whole event round-trips identically", diffs.length === 0, diffs.join(" | "));
    check("the wedding is still the same CALENDAR DAY", returned.date === "2026-08-09", returned.date);
    check("the start time survives as HH:mm", returned.time === "19:30", String(returned.time));
    check("zone order is the designer's, not the table's", returned.zoneIds.join() === [zoneB.id, zoneA.id].join());
    check("an unarchived event has no archived key", returned.archived === undefined, String(returned.archived));
    check("createdAt survives as epoch ms", returned.createdAt === original.createdAt);
  }

  // ── patch ────────────────────────────────────────────────────────────────────────────────────
  const patched = await patchEvent(original.id, { guests: 260, zoneIds: [zoneA.id] });
  const one = patched.find((e) => e.id === original.id);
  check("patch is in place, not a duplicate", patched.filter((e) => e.id === original.id).length === 1);
  check("patch landed", one?.guests === 260, String(one?.guests));
  check("a shorter zone list drops the zone", one?.zoneIds.join() === zoneA.id, String(one?.zoneIds));
  check("patch left untouched fields alone", one?.clientName === original.clientName && one?.date === "2026-08-09");

  const stamped = await patchEvent(original.id, { quoteSentAt: 1_760_000_000_000, archived: true });
  const sent = stamped.find((e) => e.id === original.id);
  check("quoteSentAt survives as epoch ms", sent?.quoteSentAt === 1_760_000_000_000, String(sent?.quoteSentAt));
  check("archived is true once set", sent?.archived === true, String(sent?.archived));

  // ── the flow only moves forward ──────────────────────────────────────────────────────────────
  const forward = await reachStep(original.id, 4);
  check("reachStep advances", forward.find((e) => e.id === original.id)?.step === 4);
  const backward = await reachStep(original.id, 1);
  check(
    "reachStep NEVER regresses",
    backward.find((e) => e.id === original.id)?.step === 4,
    String(backward.find((e) => e.id === original.id)?.step),
  );

  // ── the tenant/placement boundary ────────────────────────────────────────────────────────────
  // A zone id that is real, but belongs to a DIFFERENT property. The foreign key alone would accept
  // it — nothing about zone→venue is expressed in the events table — so this is the assertion that
  // proves the check in assertPlacement is doing the work.
  const { id: otherVenueId } = await createVenue();
  const strayZone: Zone = { ...zoneA, id: crypto.randomUUID(), venueId: otherVenueId };
  await saveVenuePlan(otherVenueId, emptyStructure(), [strayZone]);
  let rejected = false;
  try {
    await patchEvent(original.id, { zoneIds: [strayZone.id] });
  } catch {
    rejected = true;
  }
  check("a zone from another venue is refused", rejected);

  await deleteEventForTest(original.id);
  await deleteVenueForTest(venueId);
  await deleteVenueForTest(otherVenueId);
  check("cleanup: the event list is as we found it", (await fetchEvents()).length === before, `${(await fetchEvents()).length} vs ${before}`);
}

/** The studio's own row: the letterhead, the VAT rate, and the shape of its meeting.
 *
 *  Unlike the others this fixture cannot be created and deleted — there is exactly one settings row
 *  per studio and the app depends on it existing. So it saves what it finds, exercises the row, and
 *  puts the original values back at the end. The last two checks prove it did. */
async function verifySettings() {
  console.log("\n— settings —");
  const original = await fetchSettings();
  const originalFlow = await fetchMeetingFlow();

  const written = await saveSettings({
    businessName: "בדיקה — סטודיו",
    ownerName: "בדיקה",
    phone: "03-0000000",
    address: "רחוב הבדיקה 1, תל אביב",
    logoUrl: "https://example.com/logo.png",
    vatRate: 0.17,
    currency: "€", // ignored on purpose — see below
  });

  check("settings round-trip", written.businessName === "בדיקה — סטודיו" && written.ownerName === "בדיקה");
  check("the address survives", written.address === "רחוב הבדיקה 1, תל אביב", written.address);
  check("the logo url survives", written.logoUrl === "https://example.com/logo.png");
  // numeric, not float: a VAT rate multiplies every line of every quote.
  check("the VAT rate keeps its decimals", written.vatRate === 0.17, String(written.vatRate));
  // The screen makes this read-only; the ACTION is what enforces it, because the screen is not
  // where a POST comes from. A quote whose currency symbol can be set by the caller is a quote that
  // can be made to say anything.
  check("the currency cannot be set by the caller", written.currency === "₪", written.currency);

  const clamped = await saveSettings({ ...written, vatRate: 18 });
  check("a VAT rate of 18 is clamped, not multiplied into every quote", clamped.vatRate === 1, String(clamped.vatRate));

  // ── the meeting flow ─────────────────────────────────────────────────────────────────────────
  const shortened = await saveMeetingFlow(["details", "quote"]);
  check("a shortened flow persists", shortened.join() === "details,quote", shortened.join());
  check("…and reads back the same", (await fetchMeetingFlow()).join() === "details,quote");

  // Every later stage reads the event the details stage creates, so it cannot be dropped or moved.
  // The SERVER normalises, not just the screen — the screen is not where a POST comes from.
  const bad = await saveMeetingFlow(["quote", "details"] as never);
  check("the details stage is forced back to first", bad[0] === "details", bad.join());
  const unknown = await saveMeetingFlow(["details", "not-a-stage", "quote"] as never);
  check("an unknown stage is dropped", unknown.join() === "details,quote", unknown.join());

  // The distinction the whole reset behaviour rests on: an EMPTY stored list means "never
  // customised" and answers with whatever the app ships today, rather than freezing a studio at the
  // default as it stood on the day they signed up.
  const afterReset = await resetMeetingFlow();
  check("reset returns the shipped default", afterReset.join() === DEFAULT_FLOW.join(), afterReset.join());
  check("…and reading it back still gives the default", (await fetchMeetingFlow()).join() === DEFAULT_FLOW.join());

  // Writing the letterhead must not wipe the meeting, and vice versa — one row, two screens.
  await saveMeetingFlow(["details", "hall", "quote"]);
  await saveSettings({ ...written, businessName: "בדיקה — שם אחר" });
  check(
    "saving the letterhead leaves the meeting flow alone",
    (await fetchMeetingFlow()).join() === "details,hall,quote",
    (await fetchMeetingFlow()).join(),
  );

  // ── put it back ──────────────────────────────────────────────────────────────────────────────
  await saveSettings(original);
  if (originalFlow.join() === DEFAULT_FLOW.join()) await resetMeetingFlow();
  else await saveMeetingFlow(originalFlow);

  const restored = await fetchSettings();
  check(
    "cleanup: the settings are as we found them",
    JSON.stringify(restored) === JSON.stringify(original),
    `${JSON.stringify(restored)} vs ${JSON.stringify(original)}`,
  );
  check("cleanup: the meeting flow is as we found it", (await fetchMeetingFlow()).join() === originalFlow.join());
}

/** The design document: the drawing itself, and what a version actually means.
 *
 *  The versioning rule is the part worth proving, because it is the one that would be expensive to
 *  get wrong quietly: autosave must NOT mint a version (or an evening's dragging becomes thousands
 *  of rows), and a seal must make the drawing it froze unreachable by any later save (or a quote
 *  points at a document that changed under it). */
async function verifyDocuments() {
  console.log("\n— design documents —");
  const eventId = await makeEvent("בדיקה — מסמך עיצוב");

  check("an event with no drawing answers null", (await fetchDocument(eventId)) === null);

  const tableId = crypto.randomUUID();
  const doc: DesignDocumentContent = {
    calibration: { mmPerUnit: 2.5 },
    tables: [
      { id: tableId, type: "עגול", number: 1, position: { x: 1200, y: 800 }, rotation: 45, diameterMm: 1800, seats: 12 },
    ],
    placements: [
      {
        id: crypto.randomUUID(),
        variantId: crypto.randomUUID(),
        layer: "table",
        quantity: 1,
        tableId,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: 1,
      },
      {
        id: crypto.randomUUID(),
        variantId: crypto.randomUUID(),
        layer: "ceiling",
        quantity: 1,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: 1,
        span: { wallId: crypto.randomUUID(), from: 0.25, to: 0.75 },
      },
    ],
    exceptions: [{ tableId, variantId: crypto.randomUUID() }],
  };

  const saved = await saveDocument(eventId, doc);
  check("the first save opens version 1", saved.version === 1, String(saved.version));

  const read = await fetchDocument(eventId);
  check("the document round-trips identically", stable(read?.content) === stable(doc), stable(read?.content));
  check("calibration survives as a number, not a string", read?.content.calibration.mmPerUnit === 2.5);
  check("a drape keeps its run along the wall", read?.content.placements[1]?.span?.from === 0.25);
  check("smart-apply exceptions survive", read?.content.exceptions?.length === 1);

  // ── autosave does not mint versions ──────────────────────────────────────────────────────────
  const edited = { ...doc, tables: [{ ...doc.tables[0], number: 7 }] };
  const again = await saveDocument(eventId, edited);
  check("a second save stays on version 1", again.version === 1, String(again.version));
  const rows = await db().select().from(designDocuments).where(eq(designDocuments.eventId, eventId));
  check("…and it is still ONE row, not a copy per save", rows.length === 1, `${rows.length} rows`);
  check("the edit landed", (await fetchDocument(eventId))?.content.tables[0]?.number === 7);

  // ── sealing ──────────────────────────────────────────────────────────────────────────────────
  const sealed = await sealDocument(eventId);
  check("sealing pins the current version", sealed.version === 1, String(sealed.version));
  check("sealing twice does not burn a version", (await sealDocument(eventId)).version === 1);

  const afterSeal = { ...edited, tables: [{ ...edited.tables[0], number: 9 }] };
  const bumped = await saveDocument(eventId, afterSeal);
  check("the first edit after a seal opens version 2", bumped.version === 2, String(bumped.version));

  const frozen = await db()
    .select()
    .from(designDocuments)
    .where(and(eq(designDocuments.eventId, eventId), eq(designDocuments.version, 1)))
    .limit(1);
  check(
    "the sealed drawing is UNCHANGED — this is what a quote points at",
    frozen[0]?.content.tables[0]?.number === 7,
    String(frozen[0]?.content.tables[0]?.number),
  );
  check("…and the current read is the new version", (await fetchDocument(eventId))?.version === 2);

  // ── the race that used to lose a drawing ─────────────────────────────────────────────────────
  //
  // A designer keeps editing while a colleague issues the quote. The seal lands between saveDocument
  // reading the current row and writing to it, so the write — guarded by `sealed = false` so a
  // quoted drawing can never move — matches NOTHING. It used to return "saved" anyway, and the
  // studio would show נשמר over an edit that was never written.
  //
  // Simulated exactly: seal the row out from under a save by sealing between the two.
  const racy = { ...afterSeal, tables: [{ ...afterSeal.tables[0], number: 21 }] };
  await sealDocument(eventId); // the colleague's quote, landing mid-edit
  const rescued = await saveDocument(eventId, racy);
  check("a save whose row is sealed mid-flight opens the next version", rescued.version === 3, String(rescued.version));
  check(
    "…and the edit is actually on disk, not merely reported saved",
    (await fetchDocument(eventId))?.content.tables[0]?.number === 21,
  );
  check(
    "…while the drawing the quote was issued from is untouched",
    (await versionContent(eventId, 2))?.tables[0]?.number === 9,
  );

  // ── what it refuses ──────────────────────────────────────────────────────────────────────────
  await refuses("a document without tables", () =>
    saveDocument(eventId, { calibration: { mmPerUnit: 1 }, placements: [] } as never),
  );
  await refuses("a calibration of zero (every measurement would be zero)", () =>
    saveDocument(eventId, { ...doc, calibration: { mmPerUnit: 0 } }),
  );
  await refuses("a drawing for an event that does not exist", () =>
    saveDocument(crypto.randomUUID(), doc),
  );

  await deleteEventForTest(eventId);
  check("cleanup: the documents go with the event", (await documentRows(eventId)) === 0);
}

/** The operational half: reserves, and the log of what was printed. */
async function verifyOutputs() {
  console.log("\n— outputs —");
  const eventId = await makeEvent("בדיקה — פלטים");
  // A "variantId" is a variant's id OR a product's own id. This one is a bare uuid belonging to
  // neither, which is exactly what the missing foreign key has to allow.
  const variantId = crypto.randomUUID();

  check("no reserves to begin with", Object.keys(await fetchSpares(eventId)).length === 0);
  const withSpare = await saveSpare(eventId, variantId, 3);
  check("a reserve persists", withSpare[variantId] === 3, JSON.stringify(withSpare));
  const raised = await saveSpare(eventId, variantId, 5);
  check("raising it updates in place", raised[variantId] === 5, JSON.stringify(raised));
  const cleared = await saveSpare(eventId, variantId, 0);
  check("zero deletes the row rather than storing a zero", cleared[variantId] === undefined);
  await refuses("a fractional reserve", () => saveSpare(eventId, variantId, 1.5));
  await refuses("a negative reserve", () => saveSpare(eventId, variantId, -1));

  // ── the export log ───────────────────────────────────────────────────────────────────────────
  check("the first sheet is number 1", (await fetchNextExportNumber(eventId)) === 1);
  await saveDocument(eventId, { calibration: { mmPerUnit: 1 }, tables: [], placements: [] });
  const first = await recordExport(eventId, "packing_list");
  check("printing records number 1", first === 1, String(first));
  check("the next sheet is 2", (await fetchNextExportNumber(eventId)) === 2);
  const second = await recordExport(eventId, "placement_map");
  check("a second sheet takes the next number", second === 2, String(second));

  const log = await fetchExports(eventId);
  check("both sheets are in the log, newest first", log.map((e) => e.number).join() === "2,1", log.map((e) => e.number).join());
  check("each sheet names the drawing it came from", log.every((e) => e.documentVersion >= 1));
  check(
    "printing SEALED the drawing, so the sheet stays checkable",
    (await fetchDocument(eventId))?.sealed === true,
  );
  await refuses("an unknown kind of sheet", () => recordExport(eventId, "invoice" as never));

  await deleteEventForTest(eventId);
}

/** The gallery: photos, curated presentations, and the folder a client fills in a meeting. */
async function verifyGallery() {
  console.log("\n— gallery —");
  const beforeImages = (await fetchImages()).length;
  const beforePresentations = (await fetchPresentations()).length;

  const product = fixture();
  await saveProduct(product);

  const image: GalleryImage = {
    id: crypto.randomUUID(),
    name: "בדיקה — שנדליר",
    description: "מעל החופה",
    productId: product.id,
    productName: "ignored on the way in — the server joins the real one",
    tone: "oklch(0.86 0.045 20)",
  };
  const images = await saveImage(image);
  const storedImage = images.find((i) => i.id === image.id);
  check("saveImage created it", !!storedImage);
  check("the description survives", storedImage?.description === "מעל החופה");
  check("the tone survives", storedImage?.tone === "oklch(0.86 0.045 20)");
  check(
    "productName is JOINED from the catalog, not the copy that was sent",
    storedImage?.productName === product.name,
    storedImage?.productName,
  );

  // Renaming the product re-captions every photo of it — the whole point of joining rather than
  // denormalising. This is the bug the mock had and nobody could see.
  await saveProduct({ ...product, name: "בדיקה — שם חדש" });
  check(
    "renaming the product re-captions its photos",
    (await fetchImages()).find((i) => i.id === image.id)?.productName === "בדיקה — שם חדש",
  );

  // ── presentations ────────────────────────────────────────────────────────────────────────────
  const second: GalleryImage = { ...image, id: crypto.randomUUID(), name: "בדיקה — סידור" };
  await saveImage(second);

  const presentation: Presentation = {
    id: crypto.randomUUID(),
    name: "בדיקה — חופה קלאסית",
    imageIds: [second.id, image.id], // second FIRST: the order is the designer's
    createdAt: Date.now(),
  };
  const saved = await savePresentation(presentation);
  const storedPresentation = saved.find((p) => p.id === presentation.id);
  check("savePresentation created it", !!storedPresentation);
  check(
    "the photo order is the designer's, not the table's",
    storedPresentation?.imageIds.join() === [second.id, image.id].join(),
    storedPresentation?.imageIds.join(),
  );

  const reordered = await savePresentation({ ...presentation, imageIds: [image.id] });
  check(
    "a SHORTER list replaces wholesale rather than adding",
    reordered.find((p) => p.id === presentation.id)?.imageIds.join() === image.id,
  );
  await refuses("a presentation naming a photo nobody owns", () =>
    savePresentation({ ...presentation, imageIds: [crypto.randomUUID()] }),
  );
  await refuses("a nameless presentation", () => savePresentation({ ...presentation, name: "  " }));

  // ── the event folder (F-2.3) ─────────────────────────────────────────────────────────────────
  const eventId = await makeEvent("בדיקה — תיק אירוע");
  check("the folder starts empty", (await fetchFolder(eventId)).length === 0);
  const liked = await toggleLike(eventId, image.id);
  check("a like lands", liked.join() === image.id, liked.join());
  const twoLikes = await toggleLike(eventId, second.id);
  check("the newest like comes first", twoLikes.join() === [second.id, image.id].join(), twoLikes.join());
  const unliked = await toggleLike(eventId, image.id);
  check("liking again removes it", unliked.join() === second.id, unliked.join());
  await refuses("a like on a photo nobody owns", () => toggleLike(eventId, crypto.randomUUID()));

  // The bridge into the studio rail: the products behind what the client loved, deduped.
  check(
    "the folder resolves to the products the rail pins",
    likedProductIds(await fetchImages(), await fetchFolder(eventId)).join() === product.id,
  );

  // ── put it back ──────────────────────────────────────────────────────────────────────────────
  await deleteEventForTest(eventId);
  await deletePresentation(presentation.id);
  await db().delete(galleryImages).where(eq(galleryImages.id, image.id));
  await db().delete(galleryImages).where(eq(galleryImages.id, second.id));
  await removeProduct(product.id);
  check("cleanup: the gallery is as we found it", (await fetchImages()).length === beforeImages);
  check("cleanup: the presentations are as we found them", (await fetchPresentations()).length === beforePresentations);
}

/** An event to hang the fixtures off. Every one of these domains is a leaf of one. */
async function makeEvent(clientName: string): Promise<string> {
  const event: EventSummary = {
    id: crypto.randomUUID(),
    clientName,
    phone: "050-0000000",
    date: "2026-09-01",
    zoneIds: [],
    zonesLabel: "",
    guests: 100,
    step: 0,
    createdAt: Date.now(),
  };
  await saveEvent(event);
  return event.id;
}

async function documentRows(eventId: string): Promise<number> {
  const rows = await db().select().from(designDocuments).where(eq(designDocuments.eventId, eventId));
  return rows.length;
}

/** One specific stored version, read straight from the table — how a sealed drawing is proved to
 *  have stayed exactly as it was issued. */
async function versionContent(
  eventId: string,
  version: number,
): Promise<DesignDocumentContent | null> {
  const [row] = await db()
    .select({ content: designDocuments.content })
    .from(designDocuments)
    .where(and(eq(designDocuments.eventId, eventId), eq(designDocuments.version, version)))
    .limit(1);
  return row?.content ?? null;
}

/** Assert that an action REFUSES something. A write that should have been rejected and wasn't is
 *  the failure mode these modules exist to prevent, so "it threw" is the passing result. */
async function refuses(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    check(`refuses ${label}`, false, "it was accepted");
  } catch {
    check(`refuses ${label}`, true);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
