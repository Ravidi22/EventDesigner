"use server";
// What a CLIENT may see and do: their own events, and nothing else.
//
// This is the mirror of the studio's actions and the rules are inverted. Those start with
// currentOrg() and scope by organisation; a client has no organisation, so currentOrg() throws for
// them by design. Here the scope is the event_clients table — the rows a designer created when they
// deliberately shared an event — and it is applied as a JOIN rather than a filter added afterwards,
// so there is no version of these queries that forgets it.
//
// ⚠ WHAT IS RETURNED IS CLIENT-FACING. The same rule as /present and meeting mode: no prices, no
// costs, no quantities on hand, no other client's anything. That is why this returns hand-built
// shapes (./types.ts) rather than the studio's EventSummary, and products through clientProduct()
// (./safe-product.ts), an allow-list.
//
// ⚠ AND WHAT IS WRITTEN IS A PROPOSAL, never the drawing. A client's edits land in sketch_proposals
// (see the schema note); the designer's design_documents row is not touched by anything here.
// Every save is re-derived through the delta filter (lib/design-document/delta.ts), so a field a
// client may not change cannot reach the row whatever the browser sent.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentSession, type Session } from "@/lib/auth/session";
import {
  eventClients,
  eventZones,
  events,
  organizations,
  sketchProposals,
  venues,
} from "@/lib/db/schema";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { diffDocuments, mergeChanges, rebaseDraft } from "@/lib/design-document/delta";
import { notify, studioRecipients } from "@/lib/notifications/write";
import { catalogOf, clientCatalog, designerDocument, eventGeometry, studioContact, variantIdsOf } from "./reads";
import { clientSceneFor } from "@/lib/scene/reads";
import type { ClientScene } from "@/lib/scene/client";
import type { ClientError, ClientEvent, ClientEventDetail, ClientRole, ClientSketch, ProposalOutcome, ProposalView } from "./types";

export type { ClientEvent } from "./types";

/** A client may add at most this many tables in one proposal — a hall, not a stress test. */
const MAX_ADDED_TABLES = 200;
const MAX_NOTE = 2000;
const MAX_CONTENT_BYTES = 2_000_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`${field} must be a uuid`);
}

/**
 * The events shared with the signed-in client, soonest first.
 *
 * Returns an empty list for anyone who is not a client — a studio account calling this is not an
 * error, it simply has no events *as a client*, and throwing would make the shared header awkward
 * for no security gain.
 */
export async function fetchMyEvents(): Promise<ClientEvent[]> {
  const session = await currentSession();
  if (!session || session.kind !== "client") return [];

  const rows = await db()
    .select({
      id: events.id,
      date: events.eventDate,
      time: events.startTime,
      where: events.zonesLabel,
      guests: events.guests,
      venueName: venues.name,
      studioName: organizations.name,
    })
    .from(eventClients)
    // The join IS the permission check. An event with no row in event_clients for this user simply
    // does not appear — there is no branch that could skip the test.
    .innerJoin(events, eq(events.id, eventClients.eventId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .leftJoin(organizations, eq(organizations.id, events.organizationId))
    .where(and(eq(eventClients.userId, session.userId), eq(events.archived, false)))
    .orderBy(asc(events.eventDate));

  return rows.map((r) => ({
    id: r.id,
    date: r.date ?? "",
    time: r.time ? r.time.slice(0, 5) : undefined,
    where: r.where,
    guests: r.guests,
    venueName: r.venueName ?? undefined,
    studioName: r.studioName ?? "",
  }));
}

// ── access ──────────────────────────────────────────────────────────────────────────────────────

interface Shared {
  session: Session;
  event: {
    id: string;
    organizationId: string;
    venueId: string | null;
    clientName: string;
    detail: Omit<ClientEventDetail, "studio">;
  };
}

/** The event, if it is shared with the signed-in client. THROWS otherwise — an authorization
 *  failure is not something the client can correct, so it is not returned as `{ error }`. */
async function sharedEvent(eventId: string): Promise<Shared> {
  assertId(eventId, "eventId");
  const session = await currentSession();
  if (!session || session.kind !== "client") throw new Error("not a client account");
  const [row] = await db()
    .select({
      id: events.id,
      organizationId: events.organizationId,
      venueId: events.venueId,
      clientName: events.clientName,
      date: events.eventDate,
      time: events.startTime,
      where: events.zonesLabel,
      guests: events.guests,
      role: eventClients.role,
      venueName: venues.name,
      studioName: organizations.name,
    })
    .from(eventClients)
    .innerJoin(events, eq(events.id, eventClients.eventId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .leftJoin(organizations, eq(organizations.id, events.organizationId))
    .where(and(eq(eventClients.userId, session.userId), eq(eventClients.eventId, eventId), eq(events.archived, false)))
    .limit(1);
  if (!row) throw new Error("this event is not shared with you");
  return {
    session,
    event: {
      id: row.id,
      organizationId: row.organizationId,
      venueId: row.venueId,
      clientName: row.clientName,
      detail: {
        id: row.id,
        date: row.date ?? "",
        time: row.time ? row.time.slice(0, 5) : undefined,
        where: row.where,
        guests: row.guests,
        venueName: row.venueName ?? undefined,
        studioName: row.studioName ?? "",
        role: row.role as ClientRole,
      },
    },
  };
}

// ── proposals ───────────────────────────────────────────────────────────────────────────────────

type ProposalRow = typeof sketchProposals.$inferSelect;

async function openProposal(eventId: string): Promise<ProposalRow | undefined> {
  const [row] = await db()
    .select()
    .from(sketchProposals)
    .where(and(eq(sketchProposals.eventId, eventId), inArray(sketchProposals.status, ["draft", "submitted"])))
    .limit(1);
  return row;
}

function toView(row: ProposalRow, dropped: ProposalView["dropped"] = []): ProposalView {
  return {
    id: row.id,
    status: row.status === "submitted" ? "submitted" : "draft",
    base: row.base,
    content: row.content,
    revision: row.revision,
    note: row.note,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    dropped,
  };
}

/**
 * Everything the client's event page needs to draw the sketch and edit it.
 *
 * An open DRAFT forked from an older drawing is carried onto the designer's current one here (the
 * spec's "drift" rule): what still applies is kept, a change to something the designer has since
 * changed is dropped and returned in `proposal.dropped` so the page can say which. A SUBMITTED
 * proposal is never rebased — the designer reviews it against what the client actually saw.
 */
export async function fetchClientSketch(eventId: string): Promise<ClientSketch> {
  const { event } = await sharedEvent(eventId);
  const [designer, geometry, zoneRows, studio, open, [last]] = await Promise.all([
    designerDocument(event.organizationId, event.id),
    eventGeometry(event.organizationId, event.venueId),
    db().select({ id: eventZones.zoneId }).from(eventZones).where(eq(eventZones.eventId, event.id)).orderBy(asc(eventZones.position)),
    studioContact(event.organizationId, event.detail.studioName),
    openProposal(event.id),
    db()
      .select()
      .from(sketchProposals)
      .where(and(eq(sketchProposals.eventId, event.id), eq(sketchProposals.status, "resolved")))
      .orderBy(desc(sketchProposals.resolvedAt))
      .limit(1),
  ]);

  let proposal: ProposalView | null = open ? toView(open) : null;
  const moved = designer.updatedAt && (!open?.baseUpdatedAt || designer.updatedAt.getTime() > open.baseUpdatedAt.getTime());
  if (open && open.status === "draft" && moved) {
    const { content, dropped } = rebaseDraft(open.base, open.content, designer.content);
    const [row] = await db()
      .update(sketchProposals)
      .set({
        base: designer.content,
        baseVersion: designer.version,
        baseUpdatedAt: designer.updatedAt,
        content,
        revision: open.revision + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(sketchProposals.id, open.id), eq(sketchProposals.revision, open.revision)))
      .returning();
    // Another device rebased it first: what it wrote is as good, minus the note about what dropped.
    proposal = row ? toView(row, dropped) : toView((await openProposal(event.id)) ?? open);
  }

  const outcome: ProposalOutcome | null = last
    ? { id: last.id, resolvedAt: last.resolvedAt?.toISOString() ?? "", accepted: last.accepted.length, total: last.accepted.length + last.rejected.length, reply: last.reply }
    : null;

  return {
    event: { ...event.detail, studio },
    venueId: event.venueId,
    geometry,
    zoneIds: zoneRows.map((z) => z.id),
    designer: { content: designer.content, version: designer.version },
    products: await clientCatalog(event.organizationId, designer.content, ...(proposal ? [proposal.content] : [])),
    proposal,
    outcome,
  };
}

/** The event in 3D, for the client it is shared with (spec §6.3): the designer's live drawing, the
 *  venue, the allow-listed catalog and the designer's viewpoints and tour — the same assembly the
 *  no-login link reads (lib/scene/reads.ts), so the portal and the link never differ. A viewer and
 *  an editor see the same thing: the 3D view edits nothing. */
export async function fetchClientScene(eventId: string): Promise<ClientScene> {
  const { event } = await sharedEvent(eventId);
  const d = event.detail;
  return clientSceneFor(
    event.organizationId,
    event.venueId,
    { id: event.id, title: event.clientName, date: d.date, time: d.time, where: d.where, venueName: d.venueName },
    d.studioName,
  );
}

/** Open a draft on the designer's current drawing — or hand back the one already open. */
export async function startProposal(eventId: string): Promise<ProposalView | ClientError> {
  const { session, event } = await sharedEvent(eventId);
  if (event.detail.role !== "editor") return { error: "אפשר לצפות בסקיצה, אבל לא להציע בה שינויים. בקשו מהמעצב הרשאת עריכה." };
  const existing = await openProposal(event.id);
  if (existing) return toView(existing);
  const designer = await designerDocument(event.organizationId, event.id);
  await db()
    .insert(sketchProposals)
    .values({
      organizationId: event.organizationId,
      eventId: event.id,
      base: designer.content,
      baseVersion: designer.version,
      baseUpdatedAt: designer.updatedAt,
      content: designer.content,
      createdBy: session.userId,
    })
    // The partner opened one on the other phone a moment ago: theirs is the one.
    .onConflictDoNothing();
  const row = await openProposal(event.id);
  if (!row) throw new Error("could not open a proposal");
  return toView(row);
}

function assertContent(value: unknown): asserts value is DesignDocumentContent {
  if (!value || typeof value !== "object") throw new Error("content must be an object");
  const doc = value as Partial<DesignDocumentContent>;
  if (!Array.isArray(doc.tables) || !Array.isArray(doc.placements)) throw new Error("content must have tables and placements");
  if (JSON.stringify(value).length > MAX_CONTENT_BYTES) throw new Error("content is too large");
}

/**
 * What of `sent` a client may keep, carried onto `base`: every table change the delta knows, minus
 * a table of a type that is not one of the studio's own tables and an added table whose dressing
 * names anything the base drawing does not already use (a client copies a dressed table; they never
 * pick a centrepiece). The merge then copies only the fields of the aspects it applies.
 */
function sanitize(base: DesignDocumentContent, sent: DesignDocumentContent, tableVariants: Set<string>): DesignDocumentContent {
  const baseVariants = variantIdsOf(base);
  const okTable = (variantId: string | undefined) => !variantId || tableVariants.has(variantId) || baseVariants.has(variantId);
  let added = 0;
  const accept = diffDocuments(base, sent)
    .filter((c) => {
      if (c.kind === "group") return true;
      if (c.op === "remove") return true;
      if (!okTable(c.after?.variantId)) return false;
      if (c.op === "add") {
        if (++added > MAX_ADDED_TABLES) return false;
        return sent.placements.filter((p) => p.tableId === c.id || p.over === c.id).every((p) => baseVariants.has(p.variantId));
      }
      return true;
    })
    .map((c) => c.key);
  return mergeChanges(base, base, sent, { accept }).doc;
}

/** Autosave the client's draft. `revision` is the one this device last saw. */
export async function saveProposal(eventId: string, content: unknown, revision: number): Promise<{ revision: number } | ClientError> {
  const { event } = await sharedEvent(eventId);
  if (event.detail.role !== "editor") return { error: "אין לכם הרשאה להציע שינויים בסקיצה הזאת" };
  assertContent(content);
  const open = await openProposal(event.id);
  if (!open) return { error: "ההצעה כבר לא פתוחה", stale: true };
  if (open.status === "submitted") return { error: "השינויים נשלחו למעצב וממתינים לאישור", stale: true };
  if (open.revision !== revision) return { error: "השינויים נשמרו ממכשיר אחר", stale: true };

  const tableVariants = new Set(
    // A row with no variants is placed under its own id (defaultVariantId) — both count.
    (await catalogOf(event.organizationId)).filter((p) => p.category === "tables" && !p.archived).flatMap((p) => [p.id, ...p.variants.map((v) => v.id)]),
  );
  const [row] = await db()
    .update(sketchProposals)
    .set({ content: sanitize(open.base, content, tableVariants), revision: revision + 1, updatedAt: new Date() })
    .where(and(eq(sketchProposals.id, open.id), eq(sketchProposals.revision, revision), eq(sketchProposals.status, "draft")))
    .returning({ revision: sketchProposals.revision });
  if (!row) return { error: "השינויים נשמרו ממכשיר אחר", stale: true };
  return { revision: row.revision };
}

/** Send the draft to the designer. */
export async function submitProposal(eventId: string, note: string, revision: number): Promise<ProposalView | ClientError> {
  const { session, event } = await sharedEvent(eventId);
  if (event.detail.role !== "editor") return { error: "אין לכם הרשאה להציע שינויים בסקיצה הזאת" };
  const open = await openProposal(event.id);
  if (!open || open.status !== "draft") return { error: "אין טיוטה פתוחה לשליחה", stale: true };
  if (open.revision !== revision) return { error: "השינויים נשמרו ממכשיר אחר", stale: true };
  const changes = diffDocuments(open.base, open.content).length;
  if (changes === 0) return { error: "עדיין לא שיניתם דבר בסקיצה" };

  const [row] = await db()
    .update(sketchProposals)
    .set({
      status: "submitted",
      note: String(note ?? "").trim().slice(0, MAX_NOTE),
      submittedBy: session.userId,
      submittedAt: new Date(),
      revision: revision + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(sketchProposals.id, open.id), eq(sketchProposals.revision, revision), eq(sketchProposals.status, "draft")))
    .returning();
  if (!row) return { error: "השינויים נשמרו ממכשיר אחר", stale: true };

  await notify(await studioRecipients(event.organizationId), {
    kind: "proposal.submitted",
    organizationId: event.organizationId,
    eventId: event.id,
    payload: { proposalId: row.id, actorName: session.name || session.email, eventLabel: event.clientName, changes },
  });
  return toView(row);
}

/** Take a sent proposal back to a draft, before the designer has answered it. */
export async function withdrawProposal(eventId: string): Promise<ProposalView | ClientError> {
  const { event } = await sharedEvent(eventId);
  if (event.detail.role !== "editor") return { error: "אין לכם הרשאה להציע שינויים בסקיצה הזאת" };
  const [row] = await db()
    .update(sketchProposals)
    .set({ status: "draft", submittedAt: null, submittedBy: null, updatedAt: new Date() })
    .where(and(eq(sketchProposals.eventId, event.id), eq(sketchProposals.status, "submitted")))
    .returning();
  if (!row) return { error: "המעצב כבר השיב על ההצעה", stale: true };
  // The bump makes any device still holding the submitted copy re-read before it saves.
  const [bumped] = await db()
    .update(sketchProposals)
    .set({ revision: row.revision + 1 })
    .where(eq(sketchProposals.id, row.id))
    .returning();
  return toView(bumped ?? row);
}

/** Throw the draft away — back to the designer's sketch. */
export async function discardProposal(eventId: string): Promise<void> {
  const { event } = await sharedEvent(eventId);
  if (event.detail.role !== "editor") return;
  await db().delete(sketchProposals).where(and(eq(sketchProposals.eventId, event.id), eq(sketchProposals.status, "draft")));
}
