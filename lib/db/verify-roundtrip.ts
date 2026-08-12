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

import { eq } from "drizzle-orm";
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
  fetchSettings,
  saveSettings,
  fetchMeetingFlow,
  saveMeetingFlow,
  resetMeetingFlow,
} from "@/lib/settings/actions";
import { DEFAULT_FLOW } from "@/lib/meeting/steps";
import { db } from "@/lib/db";
import { venues, events } from "@/lib/db/schema";

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
  await verifySettings();

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

  check("an absent venue yields empty geometry, not an error", (await fetchVenueGeometry(undefined)).zones.length === 0);

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
    meetingDate: "2026-06-01",
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
    check("the meeting date is its own date", returned.meetingDate === "2026-06-01", String(returned.meetingDate));
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
