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
import { events, sketchTemplates } from "@/lib/db/schema";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { emptyDocument } from "@/lib/design-document/types";
import { saveDocument } from "./actions";
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
  await db()
    .delete(sketchTemplates)
    .where(and(eq(sketchTemplates.id, id), eq(sketchTemplates.organizationId, organizationId)));
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
 * A new event's first drawing, from a saved sketch — what "התחלה מסקיצה" in the event form does.
 *
 * Reads the event's own venue to decide what the sketch keeps, and writes the document through the
 * same saveDocument every autosave goes through, so the row it opens is an ordinary v1. A sketch
 * that has since been deleted seeds an empty document rather than failing the event: the event is
 * the thing being made, the sketch was a head start.
 */
export async function seedDocumentFromTemplate(eventId: string, templateId: unknown, mmPerUnit: number): Promise<void> {
  const organizationId = await currentOrg();
  if (!isId(eventId)) throw new Error("eventId must be a uuid");
  const scale = Number.isFinite(mmPerUnit) && mmPerUnit > 0 ? mmPerUnit : 1;
  const [ev] = await db()
    .select({ venueId: events.venueId })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.organizationId, organizationId)))
    .limit(1);
  if (!ev) throw new Error("event not found");
  const sketch = isId(templateId) ? await fetchSketchTemplateContent(templateId, ev.venueId ?? null) : null;
  await saveDocument(eventId, sketch ? { ...sketch, calibration: { mmPerUnit: scale } } : emptyDocument(scale));
}
