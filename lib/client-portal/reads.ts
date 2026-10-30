// The reads a client-facing view of an event is made of — the designer's current drawing, the
// venue as a plan, the studio's contact line, and the catalog rows the drawing uses, each through
// the clientProduct allow-list. Moved out of ./actions.ts (2026-10-23) so the 3D scene's no-login
// link (lib/scene/share-read.ts) reads exactly what the client portal reads.
//
// ⚠ A PLAIN MODULE ON PURPOSE, never "use server": every function here takes an organisation id
// and trusts it. As a server action each would be a public POST endpoint handing any studio's
// drawing to whoever names its id. The callers prove access first — ./actions.ts through the
// event_clients join, lib/scene/share-read.ts through a hashed, unexpired, unrevoked token — and
// only then call in here. Never import this from a client component.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { designDocuments, productVariants, products, studioSettings, venueStructures, venues, zones } from "@/lib/db/schema";
import { toProducts } from "@/lib/catalog/db-mapping";
import { toZone } from "@/lib/venues/db-mapping";
import { emptyStructure, type VenueStructure } from "@/lib/venues/structure";
import type { VenueGeometry } from "@/lib/venues/types";
import { emptyDocument, type DesignDocumentContent } from "@/lib/design-document/types";
import { clientProduct } from "./safe-product";

/** Categories a client's canvas needs whole, whatever the plan uses today: the table types they may
 *  pick from, the studio's chairs (the default chair round every table is its first row), and the
 *  pieces a stage is laid from — the canvas lays a stage's decks from the primed catalog. */
export const WHOLE_CATEGORIES = ["tables", "chairs", "stages", "stage-decks", "stage-stairs", "stage-skirts", "stage-benches", "stage-barriers", "stage-ramps", "stage-surfaces"];

/** The studio's public contact line: what a client (or anyone a link was forwarded to) may see. */
export async function studioContact(organizationId: string, fallbackName: string) {
  const [s] = await db()
    .select({ name: studioSettings.businessName, phone: studioSettings.phone, email: studioSettings.email, instagram: studioSettings.instagram })
    .from(studioSettings)
    .where(eq(studioSettings.organizationId, organizationId))
    .limit(1);
  return { name: s?.name || fallbackName, phone: s?.phone ?? "", email: s?.email ?? "", instagram: s?.instagram ?? "" };
}

// ── the reads a sketch needs ────────────────────────────────────────────────────────────────────

/** The designer's current drawing — the highest version, sealed or not; an empty one before any. */
export async function designerDocument(organizationId: string, eventId: string) {
  const [row] = await db()
    .select({ content: designDocuments.content, version: designDocuments.version, updatedAt: designDocuments.updatedAt })
    .from(designDocuments)
    .where(and(eq(designDocuments.eventId, eventId), eq(designDocuments.organizationId, organizationId)))
    .orderBy(desc(designDocuments.version))
    .limit(1);
  return row ?? { content: emptyDocument(), version: 0, updatedAt: null };
}

/** The event's venue as a plan: walls, doors, features, zones. Only ever the event's own venue — the
 *  join that got us here is what entitles the reader to it. Read by venue alone, not by the studio:
 *  a property is one shared plan whoever owns it (lib/venues/access.ts resolveVenueRole), and an
 *  event may stand on a venue another business drew. */
export async function eventGeometry(organizationId: string, venueId: string | null): Promise<VenueGeometry> {
  void organizationId;
  if (!venueId) return { structure: emptyStructure(), zones: [], mmPerUnit: 1, access: "none" };
  const database = db();
  const [[venueRow], [structureRow], zoneRows] = await Promise.all([
    database.select({ plan: venues.plan }).from(venues).where(eq(venues.id, venueId)).limit(1),
    database.select({ structure: venueStructures.structure }).from(venueStructures).where(eq(venueStructures.venueId, venueId)).limit(1),
    database.select().from(zones).where(eq(zones.venueId, venueId)).orderBy(asc(zones.createdAt)),
  ]);
  return {
    structure: (structureRow?.structure as VenueStructure) ?? emptyStructure(),
    zones: zoneRows.map(toZone),
    mmPerUnit: (venueRow?.plan as { mmPerUnit?: number } | undefined)?.mmPerUnit ?? 1,
    access: "granted",
  };
}

/** Every variant id a drawing names. */
export function variantIdsOf(...docs: DesignDocumentContent[]): Set<string> {
  const ids = new Set<string>();
  for (const d of docs) {
    for (const t of d.tables) {
      if (t.variantId) ids.add(t.variantId);
      if (t.chairVariantId) ids.add(t.chairVariantId);
    }
    for (const p of d.placements) ids.add(p.variantId);
  }
  return ids;
}

/** The studio's catalog, server-side, by organisation — the caller has already proven access. */
export async function catalogOf(organizationId: string) {
  const database = db();
  const rows = await database.select().from(products).where(eq(products.organizationId, organizationId));
  if (rows.length === 0) return [];
  const variantRows = await database
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.organizationId, organizationId), inArray(productVariants.productId, rows.map((r) => r.id))));
  return toProducts(rows, variantRows);
}

/** What the client's canvas is sent: the rows the drawings use, plus WHOLE_CATEGORIES — each one
 *  through the allow-list. */
export async function clientCatalog(organizationId: string, ...docs: DesignDocumentContent[]) {
  const used = variantIdsOf(...docs);
  return (await catalogOf(organizationId))
    // A row with no variants is placed under its OWN id (defaultVariantId), so both are looked for.
    .filter((p) => used.has(p.id) || p.variants.some((v) => used.has(v.id)) || (WHOLE_CATEGORIES.includes(p.category) && !p.archived))
    .map(clientProduct);
}

