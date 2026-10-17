"use server";
// The STUDIO's side of a client's sketch proposal: read what was sent, and answer it.
//
// Scoped by organisation like every studio action (currentOrg / currentActor). The client's side —
// opening, saving and sending a draft — is lib/client-portal/actions.ts, scoped by event_clients.
// A draft is the client's own until they press send: nothing here reads a `draft` row.
//
// The merge itself happens in the studio, in the browser (lib/design-document/delta.ts
// mergeChanges onto the designer's LIVE drawing, one history entry so Ctrl+Z takes an approval
// back). resolveProposal is handed the result and writes it through saveDocument — the same path,
// the same sealed-version rules, as every autosave — before it marks the proposal answered.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor, currentOrg } from "@/lib/db/org";
import { events, organizations, sketchProposals, users, venues } from "@/lib/db/schema";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { diffDocuments } from "@/lib/design-document/delta";
import { saveDocument } from "@/lib/studio/actions";
import { eventClientRecipients, notify } from "@/lib/notifications/write";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new Error(`${field} must be a uuid`);
}

/** A proposal waiting for the designer, as the review mode needs it. */
export interface SubmittedProposal {
  id: string;
  eventId: string;
  base: DesignDocumentContent;
  content: DesignDocumentContent;
  note: string;
  submittedAt: string;
  /** Who pressed send, as a name to print. */
  submittedBy: string;
}

/** The event's proposal waiting for review, if there is one. */
export async function fetchSubmittedProposal(eventId: string): Promise<SubmittedProposal | null> {
  assertId(eventId, "eventId");
  const organizationId = await currentOrg();
  const [row] = await db()
    .select({ p: sketchProposals, name: users.name, email: users.email })
    .from(sketchProposals)
    .leftJoin(users, eq(users.id, sketchProposals.submittedBy))
    .where(and(eq(sketchProposals.eventId, eventId), eq(sketchProposals.organizationId, organizationId), eq(sketchProposals.status, "submitted")))
    .limit(1);
  if (!row) return null;
  return {
    id: row.p.id,
    eventId: row.p.eventId,
    base: row.p.base,
    content: row.p.content,
    note: row.p.note,
    submittedAt: row.p.submittedAt?.toISOString() ?? "",
    submittedBy: row.name || row.email || "הלקוח",
  };
}

/** One line per event with changes waiting — the dashboard and the studio's banner. */
export interface PendingProposal {
  id: string;
  eventId: string;
  clientName: string;
  submittedAt: string;
  changes: number;
}

export async function fetchPendingProposals(): Promise<PendingProposal[]> {
  const organizationId = await currentOrg();
  const rows = await db()
    .select({ id: sketchProposals.id, eventId: sketchProposals.eventId, base: sketchProposals.base, content: sketchProposals.content, submittedAt: sketchProposals.submittedAt, clientName: events.clientName })
    .from(sketchProposals)
    .innerJoin(events, eq(events.id, sketchProposals.eventId))
    .where(and(eq(sketchProposals.organizationId, organizationId), eq(sketchProposals.status, "submitted"), eq(events.archived, false)))
    .orderBy(desc(sketchProposals.submittedAt));
  return rows.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    clientName: r.clientName,
    submittedAt: r.submittedAt?.toISOString() ?? "",
    changes: diffDocuments(r.base, r.content).length,
  }));
}

export interface Resolution {
  /** Change keys taken (lib/design-document/delta.ts) and the ones left. */
  accepted: string[];
  rejected: string[];
  /** A line back to the client. */
  reply: string;
  /** The designer's drawing with the accepted changes merged in — written before the proposal is
   *  marked. Absent when nothing was accepted. */
  content?: DesignDocumentContent;
}

/** Answer a proposal. Refuses one already answered (two designers, one bell) with `{ error }`. */
export async function resolveProposal(id: string, resolution: Resolution): Promise<{ ok: true } | { error: string }> {
  assertId(id, "id");
  const actor = await currentActor();
  const database = db();
  const [p] = await database
    .select({ status: sketchProposals.status })
    .from(sketchProposals)
    .where(and(eq(sketchProposals.id, id), eq(sketchProposals.organizationId, actor.organizationId)))
    .limit(1);
  if (!p) throw new Error("no such proposal");
  if (p.status !== "submitted") return { error: "ההצעה הזאת כבר נענתה" };

  const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string").slice(0, 2000) : []);
  const accepted = keys(resolution?.accepted);
  const rejected = keys(resolution?.rejected);

  // MARKED FIRST, conditionally, so a client withdrawing at the same moment (or a colleague answering)
  // wins cleanly — and only then is the drawing written. A save that fails puts the proposal back to
  // waiting, so the studio's error and the client's page agree that nothing was decided.
  const [row] = await database
    .update(sketchProposals)
    .set({
      status: "resolved",
      resolvedBy: actor.userId,
      resolvedAt: new Date(),
      reply: String(resolution?.reply ?? "").trim().slice(0, 2000),
      accepted,
      rejected,
      updatedAt: new Date(),
    })
    .where(and(eq(sketchProposals.id, id), eq(sketchProposals.organizationId, actor.organizationId), eq(sketchProposals.status, "submitted")))
    .returning({ eventId: sketchProposals.eventId });
  if (!row) return { error: "ההצעה הזאת כבר נענתה" };
  if (accepted.length && resolution.content) {
    try {
      await saveDocument(row.eventId, resolution.content);
    } catch (err) {
      await database
        .update(sketchProposals)
        .set({ status: "submitted", resolvedBy: null, resolvedAt: null, reply: "", accepted: [], rejected: [] })
        .where(eq(sketchProposals.id, id));
      throw err;
    }
  }

  const [label] = await database
    .select({ venue: venues.name, studio: organizations.name })
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .leftJoin(organizations, eq(organizations.id, events.organizationId))
    .where(eq(events.id, row.eventId))
    .limit(1);
  await notify(await eventClientRecipients(row.eventId), {
    kind: "proposal.resolved",
    organizationId: actor.organizationId,
    eventId: row.eventId,
    payload: { proposalId: id, actorName: label?.studio ?? "", eventLabel: label?.venue ?? "", changes: accepted.length + rejected.length, accepted: accepted.length },
  });
  return { ok: true };
}
