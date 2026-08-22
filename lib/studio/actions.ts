"use server";
// The design document, in Postgres. The last thing of real value that lived in a browser profile.
//
// Events and the catalog survived a lost laptop; the plans themselves did not, and the only backup
// was a "download JSON" button. This module is the crossing — the seam was cut long ago
// (lib/studio/storage.ts held it), so no screen above it changed shape, only its awaits.
//
// ── WHAT A VERSION MEANS ───────────────────────────────────────────────────────────────────────
// The schema was written expecting a row per save, and the studio autosaves every 500ms with no
// save button (F-3.5). A row per save is therefore a row per half-second of dragging: thousands of
// near-identical copies of a document, which is a storage bill rather than history.
//
// So the working drawing is ONE row, updated in place, and a version is minted only when an output
// PINS the drawing it was made from:
//
//   saveDocument()  → updates the current unsealed row (or opens v1, or opens v+1 after a seal)
//   sealDocument()  → freezes the current row and hands back its id + version, for a quote (F-7.4)
//                     or an export (F-6.4) to point at
//
// A sealed row is never written again, which is what makes "העיצוב השתנה מאז ההצעה האחרונה" a
// comparison of two integers instead of two serialised blobs — and what keeps the drawing a quote
// was made from actually on disk, which the old JSON-string comparison never did.
//
// Same rules as every other action module: every export is a public POST endpoint, so every one
// starts with currentOrg() and scopes every statement by it, and nothing trusts an id it was handed.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { designDocuments } from "@/lib/db/schema";
import { assertEventOwned } from "@/lib/events/ownership";
import type { DesignDocumentContent, StoredDocument } from "@/lib/design-document/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

/** Ceilings on what one document may contain.
 *
 *  Not an opinion about design — 400 tables is a wedding hall twice over, and 20,000 placements is
 *  more items than a studio owns. They are here because `content` is a JSONB blob arriving over
 *  HTTP from whoever chose to POST it, and a column with no ceiling is a way to fill the disk. */
const MAX_TABLES = 2_000;
const MAX_PLACEMENTS = 20_000;

/**
 * Structural validation of a document, and deliberately no more.
 *
 * It checks the shape the renderers destructure — the arrays exist, the calibration is a usable
 * number, the collection sizes are sane — and does NOT walk every placement validating every field.
 *
 * That is a judgement, so it is worth stating: the content is opaque to the database, read and
 * written whole by one canvas, and a malformed placement inside it can only break the drawing of
 * the studio that sent it. The two things that are NOT that studio's own business — writing onto
 * another studio's event, and unbounded size — are handled by the ownership check and the ceilings
 * above. A per-placement walk on a 500ms autosave would cost real CPU to re-prove something the
 * client's own type system already promised about its own data.
 */
function assertContent(value: unknown): asserts value is DesignDocumentContent {
  if (!value || typeof value !== "object") throw new Error("content must be an object");
  const doc = value as Partial<DesignDocumentContent>;
  if (!Array.isArray(doc.tables)) throw new Error("content.tables must be an array");
  if (!Array.isArray(doc.placements)) throw new Error("content.placements must be an array");
  if (doc.tables.length > MAX_TABLES) throw new Error("content.tables is too large");
  if (doc.placements.length > MAX_PLACEMENTS) throw new Error("content.placements is too large");
  const mmPerUnit = doc.calibration?.mmPerUnit;
  if (typeof mmPerUnit !== "number" || !Number.isFinite(mmPerUnit) || mmPerUnit <= 0) {
    throw new Error("content.calibration.mmPerUnit must be a positive number");
  }
}

/** The current row for an event — the highest version, sealed or not.
 *
 *  Note what this doubles as: the read is scoped by organisation, so a row coming back PROVES the
 *  event is ours. That is why assertEventOwned() below is called only on the paths where no row
 *  exists yet — the ones not standing on a scoped read. */
async function currentRow(organizationId: string, eventId: string) {
  const [row] = await db()
    .select({
      id: designDocuments.id,
      version: designDocuments.version,
      content: designDocuments.content,
      sealed: designDocuments.sealed,
    })
    .from(designDocuments)
    .where(
      and(
        eq(designDocuments.eventId, eventId),
        eq(designDocuments.organizationId, organizationId),
      ),
    )
    .orderBy(desc(designDocuments.version))
    .limit(1);
  return row ?? null;
}

/**
 * The drawing for an event, or null when none has been saved yet.
 *
 * Null is a real answer, not an error: an event created before its hall-sketch stage has no
 * document, and the studio opens on an empty one — which is exactly what it already rendered for
 * the moment before the restore landed.
 */
export async function fetchDocument(eventId: string): Promise<StoredDocument | null> {
  assertId(eventId, "eventId");
  const organizationId = await currentOrg();
  const row = await currentRow(organizationId, eventId);
  if (!row) return null;
  return { version: row.version, content: row.content, sealed: row.sealed };
}

/**
 * Persist the working drawing. Returns the version it landed on, so the caller can tell a quote's
 * pinned version from the current one without a second read.
 *
 * ⚠ Callers must debounce — the studio already does (500ms, F-3.5). Against localStorage a save per
 * pointer-move was free; against a database it is a request per frame of a drag.
 */
export async function saveDocument(
  eventId: string,
  content: DesignDocumentContent,
): Promise<StoredDocument> {
  assertId(eventId, "eventId");
  assertContent(content);
  const organizationId = await currentOrg();

  // ⚠ EVERY WRITE BELOW COUNTS THE ROWS IT TOUCHED, and the loop is why.
  //
  // Each one is guarded by `sealed = false`, because a sealed row is what a quote points at and it
  // must never move. But a guarded write that matches nothing is SILENT — and the state it guards
  // against is reachable: a designer edits while a colleague issues the quote, the seal lands
  // between the read and the write, the UPDATE matches no row, and this function used to return
  // "saved" to a studio screen that would then show נשמר over an edit that was never written.
  //
  // Losing a plan quietly is the exact failure this whole application exists to prevent, so a write
  // that touched nothing re-reads and tries again — where it now finds the seal and opens the next
  // version, which is what it should have done in the first place. Two passes is enough for one
  // seal; the third is there so a pathological race ends in an error rather than a lie.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await currentRow(organizationId, eventId);

    // No document yet — this is the only path that has to prove the event is ours, because it is
    // the only one not standing on an organisation-scoped read.
    if (!current) {
      await assertEventOwned(organizationId, eventId);
      const written = await db()
        .insert(designDocuments)
        .values({ organizationId, eventId, version: 1, content })
        // Two devices in one meeting can both open v1. The unique index turns that into a conflict
        // rather than a duplicate, and last-write-wins on a drawing they are both looking at is the
        // same answer either of them would have got by typing a moment later.
        .onConflictDoUpdate({
          target: [designDocuments.eventId, designDocuments.version],
          setWhere: and(
            eq(designDocuments.organizationId, organizationId),
            eq(designDocuments.sealed, false),
          ),
          set: { content, updatedAt: new Date() },
        })
        .returning({ version: designDocuments.version });
      if (written.length) return { version: 1, content, sealed: false };
      continue;
    }

    // The ordinary path: the working row moves under the designer's hand.
    if (!current.sealed) {
      const written = await db()
        .update(designDocuments)
        .set({ content, updatedAt: new Date() })
        .where(
          and(
            eq(designDocuments.id, current.id),
            eq(designDocuments.organizationId, organizationId),
            eq(designDocuments.sealed, false),
          ),
        )
        .returning({ version: designDocuments.version });
      if (written.length) return { version: current.version, content, sealed: false };
      continue;
    }

    // The first edit after a quote or an export: the sealed row keeps the drawing that was issued,
    // and the next version opens on top of it.
    const version = current.version + 1;
    const written = await db()
      .insert(designDocuments)
      .values({ organizationId, eventId, version, content })
      .onConflictDoUpdate({
        target: [designDocuments.eventId, designDocuments.version],
        setWhere: and(
          eq(designDocuments.organizationId, organizationId),
          eq(designDocuments.sealed, false),
        ),
        set: { content, updatedAt: new Date() },
      })
      .returning({ version: designDocuments.version });
    if (written.length) return { version, content, sealed: false };
  }

  // Three passes, nothing written. Throwing is the point: the studio shows its save indicator in
  // error and offers a retry, which is the truth. Returning a version here would be a lie.
  throw new Error("could not save the drawing");
}

/**
 * Freeze the current drawing and hand back what an output should pin itself to (F-6.4, F-7.4).
 *
 * Creates the row when an event has none: a packing list printed for an event nobody drew is still
 * a sheet that went out of the door, and it should be able to say which drawing it came from — an
 * empty one.
 *
 * Idempotent. Sealing an already-sealed row returns it unchanged, so re-issuing a quote that
 * nothing has changed since does not burn a version number.
 */
export async function sealDocument(eventId: string): Promise<{ id: string; version: number }> {
  assertId(eventId, "eventId");
  const organizationId = await currentOrg();
  const current = await currentRow(organizationId, eventId);

  if (!current) {
    await assertEventOwned(organizationId, eventId);
    const empty: DesignDocumentContent = { calibration: { mmPerUnit: 1 }, tables: [], placements: [] };
    const [row] = await db()
      .insert(designDocuments)
      .values({ organizationId, eventId, version: 1, content: empty, sealed: true })
      .onConflictDoUpdate({
        target: [designDocuments.eventId, designDocuments.version],
        setWhere: eq(designDocuments.organizationId, organizationId),
        set: { sealed: true },
      })
      .returning({ id: designDocuments.id, version: designDocuments.version });
    return row;
  }

  if (!current.sealed) {
    await db()
      .update(designDocuments)
      .set({ sealed: true })
      .where(
        and(
          eq(designDocuments.id, current.id),
          eq(designDocuments.organizationId, organizationId),
        ),
      );
  }
  return { id: current.id, version: current.version };
}
