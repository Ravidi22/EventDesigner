"use server";
// Saved sketches, in Postgres (sketch_templates) — whole design documents under a name, to be
// started from again: picked when an event is opened (components/event-form.tsx), or loaded into
// any sketch from the studio's toolbar (replacing it, or added to it).
//
// Same rules as every other action module: every export is a public POST endpoint, so every one
// starts with currentOrg() and scopes every statement by it, and nothing trusts an id it was
// handed. The content caps are design_documents' own — see assertContent in ./actions.ts.
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { sketchTemplates } from "@/lib/db/schema";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { emptyDocument } from "@/lib/design-document/types";
import { ownedFileUrl, removeReplacedFile } from "@/lib/files/owned";
import { fetchProducts } from "@/lib/catalog/actions";
import { fetchEvent } from "@/lib/events/actions";
import { eventPlan } from "@/lib/events/plan";
import { fetchVenueGeometry } from "@/lib/venues/actions";
import { featureFootprint } from "@/lib/venues/structure";
import { wantsLayout, withLayout } from "@/lib/venues/venue-table";
import { fetchDocument, saveDocument } from "./actions";
import {
  adoptSketch,
  MAX_SKETCHES,
  MAX_SKETCH_NAME,
  MAX_SKETCH_PLACEMENTS,
  MAX_SKETCH_TABLES,
  type SketchTemplateSummary,
} from "./sketches";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Structural validation only, like design_documents': the arrays exist, the sizes are sane. */
function cleanContent(value: unknown): DesignDocumentContent | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Partial<DesignDocumentContent>;
  if (!Array.isArray(doc.tables) || !Array.isArray(doc.placements)) return null;
  if (doc.tables.length > MAX_SKETCH_TABLES || doc.placements.length > MAX_SKETCH_PLACEMENTS) return null;
  const mmPerUnit = doc.calibration?.mmPerUnit;
  if (typeof mmPerUnit !== "number" || !Number.isFinite(mmPerUnit) || mmPerUnit <= 0) return null;
  return doc as DesignDocumentContent;
}

/** The list, newest first — names and counts, never the drawings themselves. The counts are read
 *  off the JSON in the database rather than by loading sixty documents to count their arrays. */
export async function fetchSketchTemplates(): Promise<SketchTemplateSummary[]> {
  const organizationId = await currentOrg();
  const rows = await db()
    .select({
      id: sketchTemplates.id,
      name: sketchTemplates.name,
      venueId: sketchTemplates.venueId,
      tables: sql<number>`jsonb_array_length(${sketchTemplates.content}->'tables')`,
      items: sql<number>`jsonb_array_length(${sketchTemplates.content}->'placements')`,
      photoUrl: sketchTemplates.photoUrl,
      createdAt: sketchTemplates.createdAt,
    })
    .from(sketchTemplates)
    .where(eq(sketchTemplates.organizationId, organizationId))
    .orderBy(desc(sketchTemplates.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    venueId: r.venueId ?? null,
    tables: Number(r.tables) || 0,
    items: Number(r.items) || 0,
    photoUrl: r.photoUrl ?? null,
    createdAt: r.createdAt.getTime(),
  }));
}

/** Save the drawing under a name. A bad shape or a full shelf is a user-correctable failure. */
export async function saveSketchTemplate(input: {
  name: string;
  venueId?: string | null;
  content: DesignDocumentContent;
}): Promise<SketchTemplateSummary[] | { error: string }> {
  const organizationId = await currentOrg();
  const name = typeof input?.name === "string" ? input.name.trim().slice(0, MAX_SKETCH_NAME) : "";
  if (!name) return { error: "לסקיצה צריך שם" };
  const content = cleanContent(input?.content);
  if (!content) return { error: "לא ניתן לשמור את הסקיצה" };
  if (content.tables.length + content.placements.length === 0) return { error: "הסקיצה ריקה — אין מה לשמור" };
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)` })
    .from(sketchTemplates)
    .where(eq(sketchTemplates.organizationId, organizationId));
  if (Number(n) >= MAX_SKETCHES) return { error: `אפשר לשמור עד ${MAX_SKETCHES} סקיצות` };
  await db()
    .insert(sketchTemplates)
    .values({ organizationId, name, venueId: isId(input.venueId) ? input.venueId : null, content });
  return fetchSketchTemplates();
}

export async function deleteSketchTemplate(id: unknown): Promise<SketchTemplateSummary[]> {
  const organizationId = await currentOrg();
  if (!isId(id)) throw new Error("id must be a uuid");
  const [gone] = await db()
    .delete(sketchTemplates)
    .where(and(eq(sketchTemplates.id, id), eq(sketchTemplates.organizationId, organizationId)))
    .returning({ photoUrl: sketchTemplates.photoUrl });
  await removeReplacedFile(gone?.photoUrl, null, organizationId);
  return fetchSketchTemplates();
}

/** The photograph a sketch's card wears in the meeting — a URL this studio uploaded (lib/files), or
 *  null to take it off. Anything else is dropped like every other stored file URL (ownedFileUrl). */
export async function setSketchPhoto(id: unknown, url: unknown): Promise<SketchTemplateSummary[]> {
  const organizationId = await currentOrg();
  if (!isId(id)) throw new Error("id must be a uuid");
  const next = ownedFileUrl(url, organizationId);
  const where = and(eq(sketchTemplates.id, id), eq(sketchTemplates.organizationId, organizationId));
  const [row] = await db().select({ photoUrl: sketchTemplates.photoUrl }).from(sketchTemplates).where(where).limit(1);
  if (!row) return fetchSketchTemplates();
  await db().update(sketchTemplates).set({ photoUrl: next, updatedAt: new Date() }).where(where);
  await removeReplacedFile(row.photoUrl, next, organizationId);
  return fetchSketchTemplates();
}

/** One sketch, ready to be drawn into the room `venueId` names (lib/studio/sketches.ts adoptSketch).
 *  Null when it is gone. */
export async function fetchSketchTemplateContent(id: unknown, venueId?: string | null): Promise<DesignDocumentContent | null> {
  const organizationId = await currentOrg();
  if (!isId(id)) throw new Error("id must be a uuid");
  const [row] = await db()
    .select({ content: sketchTemplates.content, venueId: sketchTemplates.venueId })
    .from(sketchTemplates)
    .where(and(eq(sketchTemplates.id, id), eq(sketchTemplates.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  return adoptSketch(row.content, !!venueId && venueId === row.venueId);
}

/**
 * A NEW event's first drawing (lib/events/begin.ts) — written once.
 *
 * From a saved sketch when one was picked ("התחלה מסקיצה" in the event form): read against the
 * event's own venue to decide what the sketch keeps. Else empty — and an empty drawing starts with
 * the venue's DEFAULT TABLE LAYOUT in it as its own tables (lib/venues/venue-table.ts), matched to
 * this studio's rows here (QA 2026-11-20, SK-8: they used to be copied in only when the studio first
 * opened the drawing, so the client's view, outputs, the 3D tab, procurement and the venue's view of
 * the sketch all saw an empty hall until then — and a client's proposal made on that empty hall
 * was later merged on top of the venue's tables). Written through the same saveDocument every
 * autosave goes through, so the row it opens is an ordinary v1. A sketch that has since been
 * deleted seeds an empty drawing rather than failing the event: the event is the thing being made,
 * the sketch was a head start.
 *
 * IDEMPOTENT (SK-6): an event that already has a drawing is left as it is. A create is retried with
 * the same id after a failure, and a seed whose answer was lost on the way back may have landed —
 * writing again would lay the sketch or the tables over it a second time.
 */
export async function seedEventDocument(eventId: string, templateId: unknown, mmPerUnit: number): Promise<void> {
  if (!isId(eventId)) throw new Error("eventId must be a uuid");
  const scale = Number.isFinite(mmPerUnit) && mmPerUnit > 0 ? mmPerUnit : 1;
  // Both scoped to this organisation: an event of another studio is simply not found.
  const [event, existing] = await Promise.all([fetchEvent(eventId), fetchDocument(eventId)]);
  if (!event) throw new Error("event not found");
  if (existing) return;
  const sketch = isId(templateId) ? await fetchSketchTemplateContent(templateId, event.venueId ?? null) : null;
  let content: DesignDocumentContent = sketch ? { ...sketch, calibration: { mmPerUnit: scale } } : emptyDocument(scale);
  if (event.venueId && wantsLayout(content)) {
    const [geometry, products] = await Promise.all([fetchVenueGeometry(event.venueId), fetchProducts()]);
    const plan = eventPlan(event, geometry);
    if (plan.layoutTables.length) {
      content = withLayout(content, plan.layoutTables, products, { newId: () => crypto.randomUUID(), shades: event.shades, footprintOf: featureFootprint }).content;
    }
  }
  await saveDocument(eventId, content);
}
