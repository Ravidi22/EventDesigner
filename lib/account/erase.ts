// The erase (EVE-22, spec §5.4–5.5): what happens to a closed business after its grace period, and to
// its retained records when their years are over. A PLAIN module, never "use server" — it takes
// organisation ids and trusts them; it runs from `npm run accounts:erase-due` until a timer exists
// (EVE-53, parked with the environment), never from a request.
//
// One sweep, in order:
//   1. every DUE business is erased — one transaction each: what is retained is found and kept, the
//      issuer and the printed facts are snapshotted onto the closure BEFORE the rows they come from
//      go, and every other row of the business is deleted in lib/account/tables.ts's ERASE_ORDER
//      (the billing trigger and every foreign key stay on — never session_replication_role);
//   2. an erased business whose retention is over loses its documents and their events;
//   3. a kept venue no event stands in any more goes;
//   4. the files: everything under the business's prefix but what is kept;
//   5. a business with nothing left is gone — its closure and organisation rows too.
// Every step is idempotent: a sweep that dies half-way is finished by the next one.
import { and, eq, inArray, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  billingDocuments,
  designDocuments,
  eventLinks,
  events,
  organizationClosures,
  orders,
  organizations,
  studioSettings,
  suppliers,
  users,
  venueStructures,
  venues,
  zones,
} from "@/lib/db/schema";
import { fileDriver, type FileDriver } from "@/lib/files/driver";
import { keyFromUrl } from "@/lib/files/keys";
import { disconnect } from "@/lib/google/sync";
import { notify, studioRecipients } from "@/lib/notifications/write";
import { ACCOUNT_TABLES, ERASE_ORDER } from "./tables";
import { retainUntilOf, retentionOver, skeletonPatch, type IssuerSnapshot, type PrintedFacts } from "./rules";

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];
type Files = Pick<FileDriver, "list" | "remove">;

export interface SweepReport {
  erased: string[];
  retentionOver: string[];
  venuesGone: string[];
  filesPending: string[];
  gone: string[];
  /** A dry run: per business, the rows the erase would delete and keep, by table. */
  plan?: Record<string, { delete: Record<string, number>; keep: Record<string, number> }>;
}

class DryRun extends Error {}

export async function sweepAccounts(input: { now: Date; dryRun: boolean; files?: Files }): Promise<SweepReport> {
  const { now, dryRun } = input;
  const files = input.files ?? fileDriver();
  const report: SweepReport = { erased: [], retentionOver: [], venuesGone: [], filesPending: [], gone: [] };

  // 1. Due businesses.
  const due = await db()
    .select({ id: organizationClosures.organizationId })
    .from(organizationClosures)
    .where(and(isNull(organizationClosures.erasedAt), lte(organizationClosures.eraseAfter, now)));
  for (const { id } of due) {
    if (dryRun) {
      (report.plan ??= {})[id] = await planOf(id, now);
      continue;
    }
    if (await eraseBusiness(id, now)) report.erased.push(id);
  }
  if (dryRun) return report;

  // 2. Retention over.
  const retained = await db()
    .select({ id: organizationClosures.organizationId, until: organizationClosures.retainUntil })
    .from(organizationClosures)
    .where(and(isNotNull(organizationClosures.erasedAt), isNotNull(organizationClosures.retainUntil)));
  for (const r of retained) {
    if (!retentionOver(r.until, now)) continue;
    await expireRetention(r.id, files);
    report.retentionOver.push(r.id);
  }

  // 3. Kept venues no event stands in any more.
  report.venuesGone.push(...(await sweepVenues(files)));

  // 4. Files.
  const pending = await db()
    .select({ id: organizationClosures.organizationId })
    .from(organizationClosures)
    .where(and(isNotNull(organizationClosures.erasedAt), isNull(organizationClosures.filesErasedAt)));
  for (const { id } of pending) {
    // One business's storage failing (a list that throws) leaves its files for the next run and
    // never stops the sweep for the others.
    const done = await eraseFiles(id, files).catch((e) => {
      console.error("files of", id, e);
      return false;
    });
    if (!done) report.filesPending.push(id);
  }

  // 5. Nothing left.
  const erased = await db()
    .select({ id: organizationClosures.organizationId })
    .from(organizationClosures)
    .where(and(isNotNull(organizationClosures.erasedAt), isNotNull(organizationClosures.filesErasedAt)));
  for (const { id } of erased) {
    const gone = await goneIfNothingLeft(id, files).catch((e) => {
      console.error("could not finish", id, e);
      return false;
    });
    if (gone) report.gone.push(id);
  }

  return report;
}

// ── 1. The erase ─────────────────────────────────────────────────────────────────────────────────

interface Retained {
  docEvents: string[];
  docDates: string[];
  designs: string[];
  venueIds: string[];
}

/** What stays of a business (spec §5.4 step 1). */
export async function retainedOf(database: Tx | ReturnType<typeof db>, organizationId: string): Promise<Retained> {
  const docs = await database
    .select({ eventId: billingDocuments.eventId, date: billingDocuments.documentDate, design: billingDocuments.designDocumentId })
    .from(billingDocuments)
    .where(eq(billingDocuments.organizationId, organizationId));
  // A venue another business's event stands in — by its venue, or by one of its zones.
  const used = await database.execute(sql`
    select v.id from venues v
    where v.organization_id = ${organizationId}
      and (exists (select 1 from events e where e.venue_id = v.id and e.organization_id <> ${organizationId})
        or exists (select 1 from event_zones ez join zones z on z.id = ez.zone_id join events e on e.id = ez.event_id
                   where z.venue_id = v.id and e.organization_id <> ${organizationId}))`);
  return {
    docEvents: [...new Set(docs.map((d) => d.eventId))],
    docDates: docs.map((d) => d.date),
    designs: [...new Set(docs.map((d) => d.design).filter((x): x is string => !!x))],
    venueIds: (used as unknown as { id: string }[]).map((r) => r.id),
  };
}

const notIn = (column: string, ids: readonly string[]): SQL =>
  ids.length ? sql`${sql.identifier(column)} not in ${ids}` : sql`true`;

/** The WHERE that names this business's rows of `table` (lib/account/tables.ts `reach`), less what
 *  is retained. */
function rowsOf(table: string, organizationId: string, keep: Retained): SQL | null {
  const reach = ACCOUNT_TABLES[table].reach;
  let where: SQL;
  if (reach === "org") where = sql`organization_id = ${organizationId}`;
  else if (typeof reach === "object" && "orgColumns" in reach) {
    where = sql.join(reach.orgColumns.map((c) => sql`${sql.identifier(c)} = ${organizationId}`), sql` or `);
    where = sql`(${where})`;
  } else if (typeof reach === "object" && "via" in reach) {
    const [parent, column] = reach.via.split(".");
    where = sql`${sql.identifier(column)} in (select id from ${sql.identifier(parent)} where organization_id = ${organizationId})`;
  } else return null;
  if (table === "events") return sql`${where} and ${notIn("id", keep.docEvents)}`;
  if (table === "design_documents") return sql`${where} and ${notIn("id", keep.designs)}`;
  if (table === "venues") return sql`${where} and ${notIn("id", keep.venueIds)}`;
  if (table === "zones" || table === "venue_structures") return sql`${where} and ${notIn("venue_id", keep.venueIds)}`;
  return where;
}

/** What the retained documents' page reads from settings, written onto the closure. */
async function issuerOf(tx: Tx, organizationId: string, fallbackName: string): Promise<IssuerSnapshot> {
  const [s] = await tx.select().from(studioSettings).where(eq(studioSettings.organizationId, organizationId)).limit(1);
  return {
    businessName: s?.businessName || fallbackName,
    ownerName: s?.ownerName ?? "",
    businessNumber: s?.businessNumber ?? "",
    address: s?.address ?? "",
    phone: s?.phone ?? "",
    email: s?.email ?? "",
    vatStatus: s?.vatStatus ?? "licensed",
    vatRate: s?.vatRate ?? "0.18",
    currency: s?.currency ?? "₪",
    bankDetails: s?.bankDetails ?? "",
    instagram: s?.instagram ?? "",
    showBsd: s?.showBsd ?? false,
    logoKey: keyFromUrl(s?.logoUrl),
    signatureKey: keyFromUrl(s?.signatureUrl),
  };
}

/** Erase one due business. False when it was not due after all (reopened, or erased by another
 *  sweep). Throws `DryRun` with the plan when `planOnly`. */
async function eraseBusiness(organizationId: string, now: Date, planOnly = false): Promise<boolean> {
  // Best effort, outside the transaction: revoke every member's Google connection.
  if (!planOnly) {
    const members = await db().select({ id: users.id }).from(users).where(eq(users.organizationId, organizationId));
    for (const m of members) await disconnect(m.id, organizationId).catch((e) => console.error("google disconnect on erase failed", e));
  }

  const bells: { recipients: string[]; studioOrg: string; studioEvent: string; label: string; venueName: string }[] = [];
  const done = await db().transaction(async (tx) => {
    const [closure] = await tx
      .select()
      .from(organizationClosures)
      .where(and(eq(organizationClosures.organizationId, organizationId), isNull(organizationClosures.erasedAt), lte(organizationClosures.eraseAfter, now)))
      .for("update");
    if (!closure) return false;
    const keep = await retainedOf(tx, organizationId);
    const plan: { delete: Record<string, number>; keep: Record<string, number> } = {
      delete: {},
      keep: { billing_documents: (await tx.select({ id: billingDocuments.id }).from(billingDocuments).where(eq(billingDocuments.organizationId, organizationId))).length, events: keep.docEvents.length, design_documents: keep.designs.length, venues: keep.venueIds.length },
    };

    // Snapshots first, while the rows they read still exist.
    const issuer = keep.docEvents.length ? await issuerOf(tx, organizationId, closure.name) : null;
    const printed: Record<string, PrintedFacts> = {};
    if (keep.docEvents.length) {
      const rows = await tx
        .select({ id: events.id, venueName: venues.name })
        .from(events)
        .leftJoin(venues, eq(venues.id, events.venueId))
        .where(inArray(events.id, keep.docEvents));
      for (const r of rows) printed[r.id] = { venueName: r.venueName ?? "" };
    }

    // A venue business's bookings take their links with them: the designer hears it first.
    const links = await tx
      .select({ studioOrg: eventLinks.studioOrgId, studioEvent: eventLinks.studioEventId, label: events.clientName })
      .from(eventLinks)
      .innerJoin(events, eq(events.id, eventLinks.venueEventId))
      .where(and(eq(events.organizationId, organizationId), eq(eventLinks.state, "active"), isNotNull(eventLinks.studioEventId)));
    for (const l of links) {
      if (l.studioOrg && l.studioEvent) {
        bells.push({ recipients: await studioRecipients(l.studioOrg), studioOrg: l.studioOrg, studioEvent: l.studioEvent, label: l.label, venueName: closure.name });
      }
    }

    // Client invitations the business sent that nobody accepted, and that no other business shares.
    const pending = await tx.execute(sql`
      select u.id from users u
      where u.kind = 'client' and u.state = 'pending'
        and exists (select 1 from event_clients ec join events e on e.id = ec.event_id where ec.user_id = u.id and e.organization_id = ${organizationId})
        and not exists (select 1 from event_clients ec join events e on e.id = ec.event_id where ec.user_id = u.id and e.organization_id <> ${organizationId})`);
    const pendingClients = (pending as unknown as { id: string }[]).map((r) => r.id);

    for (const table of ERASE_ORDER) {
      const where = rowsOf(table, organizationId, keep);
      if (!where) continue;
      if (table === "events" && keep.docEvents.length) {
        // The retained events become skeletons BEFORE the rest go: their venue link must be cut
        // before the venues are deleted (events.venue_id is RESTRICT).
        const columns = getTableConfig(events).columns.map((c) => ({ name: c.name, notNull: c.notNull, dataType: c.dataType }));
        const patch = skeletonPatch(columns);
        const sets = sql.join(
          Object.entries(patch).map(([col, v]) => sql`${sql.identifier(col)} = ${v}`),
          sql`, `,
        );
        await tx.execute(sql`update events set ${sets} where ${inArray(events.id, keep.docEvents)}`);
      }
      const result = await tx.execute(sql`delete from ${sql.identifier(table)} where ${where}`);
      plan.delete[table] = (result as unknown as { count?: number }).count ?? 0;
    }
    if (pendingClients.length) await tx.delete(users).where(inArray(users.id, pendingClients));
    plan.delete.pending_clients = pendingClients.length;

    // Other businesses' links to this one: the organisation row stays as a tombstone, so the foreign
    // keys' SET NULL never fires by itself — an order sent to an erased supplier would land in an
    // inbox nobody reads. Cut them here (the anti-goal's one allowance: a link to what is gone).
    await tx.update(suppliers).set({ linkedOrgId: null }).where(eq(suppliers.linkedOrgId, organizationId));
    await tx.update(orders).set({ supplierOrgId: null }).where(eq(orders.supplierOrgId, organizationId));
    // A hall's link to an erased designer ends for good and lets go of the designer's event — a
    // retained skeleton must never follow the booking again (its documents print it as issued), and
    // the hall may link another designer.
    await tx.update(eventLinks).set({ state: "ended", studioEventId: null }).where(eq(eventLinks.studioOrgId, organizationId));

    if (planOnly) throw Object.assign(new DryRun(), { plan });

    await tx
      .update(organizationClosures)
      .set({ erasedAt: now, issuer, printed: keep.docEvents.length ? printed : null, retainUntil: retainUntilOf(keep.docDates) })
      .where(eq(organizationClosures.organizationId, organizationId));
    return true;
  });

  // After the commit: the designers whose linked venue went.
  for (const b of bells) {
    await notify(b.recipients, { kind: "link.venue_closed", organizationId: b.studioOrg, eventId: b.studioEvent, payload: { actorName: b.venueName, eventLabel: b.label } });
  }
  return done;
}

/** A dry run of the erase: the same code, rolled back, its counts returned. */
async function planOf(organizationId: string, now: Date) {
  try {
    await eraseBusiness(organizationId, now, true);
  } catch (e) {
    if (e instanceof DryRun) return (e as DryRun & { plan: { delete: Record<string, number>; keep: Record<string, number> } }).plan;
    throw e;
  }
  return { delete: {}, keep: {} };
}

// ── 2. Retention over ────────────────────────────────────────────────────────────────────────────

async function expireRetention(organizationId: string, files: Files): Promise<void> {
  await db().transaction(async (tx) => {
    // The trigger guards UPDATE only: deleting a document whose years are over is allowed.
    await tx.delete(billingDocuments).where(eq(billingDocuments.organizationId, organizationId));
    await tx.delete(designDocuments).where(eq(designDocuments.organizationId, organizationId));
    await tx.delete(events).where(eq(events.organizationId, organizationId));
    await tx
      .update(organizationClosures)
      .set({ retainUntil: null, printed: null })
      .where(eq(organizationClosures.organizationId, organizationId));
  });
  await removeIssuerFiles(organizationId, files);
}

async function removeIssuerFiles(organizationId: string, files: Files): Promise<void> {
  const [c] = await db().select({ issuer: organizationClosures.issuer }).from(organizationClosures).where(eq(organizationClosures.organizationId, organizationId));
  for (const key of [c?.issuer?.logoKey, c?.issuer?.signatureKey]) {
    if (key) await files.remove(key).catch((e) => console.error("issuer file", key, e));
  }
  await db().update(organizationClosures).set({ issuer: null }).where(eq(organizationClosures.organizationId, organizationId));
}

// ── 3. Kept venues no event stands in ────────────────────────────────────────────────────────────

/** Every key of ours inside a value (a row, a structure, a zone list) under this business's prefix. */
function keysIn(value: unknown, organizationId: string, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    const key = keyFromUrl(value);
    if (key && key.startsWith(`${organizationId}/`)) out.add(key);
  } else if (Array.isArray(value)) for (const v of value) keysIn(v, organizationId, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) keysIn(v, organizationId, out);
  return out;
}

async function venueFiles(venueIds: readonly string[], organizationId: string): Promise<Set<string>> {
  if (venueIds.length === 0) return new Set();
  const [vs, ss, zs] = await Promise.all([
    db().select().from(venues).where(inArray(venues.id, [...venueIds])),
    db().select().from(venueStructures).where(inArray(venueStructures.venueId, [...venueIds])),
    db().select().from(zones).where(inArray(zones.venueId, [...venueIds])),
  ]);
  return keysIn([vs, ss, zs], organizationId);
}

async function sweepVenues(files: Files): Promise<string[]> {
  const rows = (await db().execute(sql`
    select v.id, v.organization_id from venues v
    join organization_closures c on c.organization_id = v.organization_id and c.erased_at is not null
    where not exists (select 1 from events e where e.venue_id = v.id)
      and not exists (select 1 from event_zones ez join zones z on z.id = ez.zone_id where z.venue_id = v.id)`)) as unknown as { id: string; organization_id: string }[];
  for (const v of rows) {
    const keys = await venueFiles([v.id], v.organization_id);
    await db().delete(venues).where(eq(venues.id, v.id));
    for (const key of keys) await files.remove(key).catch((e) => console.error("venue file", key, e));
  }
  return rows.map((r) => r.id);
}

// ── 4. Files ─────────────────────────────────────────────────────────────────────────────────────

/** Everything under the business's prefix but the KEEP list. True when nothing failed (stamped). */
async function eraseFiles(organizationId: string, files: Files): Promise<boolean> {
  const [c] = await db().select().from(organizationClosures).where(eq(organizationClosures.organizationId, organizationId));
  const keep = new Set<string>([c?.issuer?.logoKey, c?.issuer?.signatureKey].filter((k): k is string => !!k));
  const kept = await db().select({ id: venues.id }).from(venues).where(eq(venues.organizationId, organizationId));
  for (const key of await venueFiles(kept.map((v) => v.id), organizationId)) keep.add(key);
  const { failed } = await removePrefix(files, `${organizationId}/`, keep);
  if (failed > 0) return false;
  await db().update(organizationClosures).set({ filesErasedAt: new Date() }).where(eq(organizationClosures.organizationId, organizationId));
  return true;
}

export async function removePrefix(files: Files, prefix: string, keep: ReadonlySet<string>): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const key of await files.list(prefix)) {
    if (keep.has(key)) continue;
    try {
      await files.remove(key);
      removed++;
    } catch (e) {
      failed++;
      console.error("could not remove", key, e);
    }
  }
  return { removed, failed };
}

// ── 5. Gone ──────────────────────────────────────────────────────────────────────────────────────

async function goneIfNothingLeft(organizationId: string, files: Files): Promise<boolean> {
  const [doc] = await db().select({ id: billingDocuments.id }).from(billingDocuments).where(eq(billingDocuments.organizationId, organizationId)).limit(1);
  const [venue] = await db().select({ id: venues.id }).from(venues).where(eq(venues.organizationId, organizationId)).limit(1);
  if (doc || venue) return false;
  await removeIssuerFiles(organizationId, files);
  // Whatever is still under the prefix — a kept venue's file or an issuer's logo whose delete failed
  // earlier, with no row left to name it — goes now; the business stays until it has.
  const { failed } = await removePrefix(files, `${organizationId}/`, new Set());
  if (failed > 0) return false;
  await db().transaction(async (tx) => {
    // A skeleton event cannot be left without its documents (they went with retention), but say so.
    await tx.delete(events).where(eq(events.organizationId, organizationId));
    await tx.delete(organizationClosures).where(eq(organizationClosures.organizationId, organizationId));
    await tx.delete(organizations).where(eq(organizations.id, organizationId));
  });
  return true;
}
