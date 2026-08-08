// Data model — core entities (docs/02 §4). Every table carries organizationId (ADR-2).
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { DesignDocumentContent } from "@/lib/design-document/types";

// Which layer of the room a product lives on (F-2.2).
export const layerEnum = pgEnum("layer", ["table", "floor", "ceiling"]);
export const mapSourceEnum = pgEnum("map_source", ["template", "pdf"]);
// What a named region of a venue is (lib/venues/zone.ts).
export const zoneKindEnum = pgEnum("zone_kind", ["hall", "canopy", "open", "service"]);
export const exportTypeEnum = pgEnum("export_type", ["placement_map", "packing_list", "quote"]);
export const verificationEnum = pgEnum("verification_state", ["draft", "verified"]);
// People (F-8.2). Two ladders, because they answer two different questions: what you are inside
// this studio (lib/team/storage.ts), and what you may do to one property (lib/venues/access.ts).
export const studioRoleEnum = pgEnum("studio_role", ["owner", "designer", "crew"]);
export const venueRoleEnum = pgEnum("venue_role", ["viewer", "editor", "manager"]);
export const grantKindEnum = pgEnum("grant_kind", ["member", "guest"]);
export const inviteStateEnum = pgEnum("invite_state", ["pending", "active"]);

const orgId = () => uuid("organization_id").notNull();
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  createdAt: created(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    organizationId: orgId(),
    email: text("email").notNull().unique(),
    name: text("name"),
    role: studioRoleEnum("role").notNull().default("designer"),
    state: inviteStateEnum("state").notNull().default("pending"),
    createdAt: created(),
  },
  (t) => [index("users_org_idx").on(t.organizationId)],
);

// Access to one venue, granted by the studio that drew its plan (F-8.3).
//
// The one table in this file that is NOT scoped to a single organization, and deliberately: its
// entire purpose is to cross the boundary ADR-2 draws everywhere else. A venue is a physical
// property, so two studios can legitimately work the same hall off the same plan — grantor and
// grantee are therefore separate columns, and row-level security reads this table rather than
// the plain organizationId check that governs everything else.
//
// What a grant conveys is decided by `kind`, not by role: a `guest` gets the plan and anonymous
// availability, never the events, clients or prices at that venue. The authority for that rule is
// grantScope() in lib/venues/access.ts; this table only records which side of it a row is on.
//
// venueId has no FK yet — venues arrived after this schema and still live in lib/venues.
export const venueGrants = pgTable(
  "venue_grants",
  {
    id: id(),
    venueId: uuid("venue_id").notNull(),
    /** The studio that owns the plan and issued the grant. */
    grantorOrgId: uuid("grantor_org_id").notNull(),
    /** Null until an invited address becomes an account (phase 3). */
    granteeOrgId: uuid("grantee_org_id"),
    granteeUserId: uuid("grantee_user_id").references(() => users.id, { onDelete: "cascade" }),
    granteeEmail: text("grantee_email").notNull(),
    granteeName: text("grantee_name"),
    kind: grantKindEnum("kind").notNull(),
    role: venueRoleEnum("role").notNull().default("viewer"),
    state: inviteStateEnum("state").notNull().default("pending"),
    createdAt: created(),
  },
  (t) => [
    index("venue_grants_venue_idx").on(t.venueId),
    index("venue_grants_grantor_idx").on(t.grantorOrgId),
    index("venue_grants_grantee_idx").on(t.granteeOrgId),
  ],
);

// Catalog item (F-2.1, F-2.5, F-2.6, F-2.7). Height is required for phase-2 3D (R-3).
export const products = pgTable(
  "products",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    layer: layerEnum("layer").notNull(),
    category: text("category").notNull(),
    // dimensions in millimetres
    diameterMm: integer("diameter_mm"),
    widthMm: integer("width_mm"),
    depthMm: integer("depth_mm"),
    heightMm: integer("height_mm").notNull(),
    // per-category fields (F-2.5): candle arms, stage modules, seat type/colour...
    categoryFields: jsonb("category_fields").$type<Record<string, unknown>>().notNull().default({}),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
    styleTags: text("style_tags").array().notNull().default([]),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("products_org_idx").on(t.organizationId)],
);

// A shade/version of a product (F-2.4). Every placement references a variant.
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    organizationId: orgId(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. "זהב", "שמנת"
    imageUrl: text("image_url"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }), // inherits product if null
    createdAt: created(),
  },
  (t) => [index("variants_org_idx").on(t.organizationId)],
);

// The property (F-3.1). One site plan per venue: a single millimetre plane every zone on it is
// drawn in, plus the calibration measured off it once. Replaces the old `hall_templates`, where
// each hall was its own drawing starting at (0,0) and two rooms of one property could not be
// positioned relative to each other. See lib/venues/types.ts.
export const venues = pgTable(
  "venues",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    /** VenuePlan: mmPerUnit, the property line, and the placed plan underlay. */
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("venues_org_idx").on(t.organizationId)],
);

// The venue's ONE wall graph — nodes, walls, doors, fixed features (lib/venues/structure.ts).
// One row per venue, held whole: it is read and written as a unit by the plan editor, and the
// graph's value is that a wall shared by two rooms exists exactly once inside it.
export const venueStructures = pgTable(
  "venue_structures",
  {
    id: id(),
    organizationId: orgId(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    structure: jsonb("structure").$type<Record<string, unknown>>().notNull(),
    updatedAt: updated(),
  },
  (t) => [index("venue_structures_venue_idx").on(t.venueId)],
);

// A named region of that structure (lib/venues/zone.ts). Carries no geometry of its own beyond the
// anchor or freehand boundary in `source` — the region itself is re-derived from the walls, so a
// wall that moves reshapes the zone instead of leaving a stale copy behind.
export const zones = pgTable(
  "zones",
  {
    id: id(),
    organizationId: orgId(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: zoneKindEnum("kind").notNull(),
    source: jsonb("source").$type<Record<string, unknown>>().notNull(),
    ceilingHeightMm: integer("ceiling_height_mm").notNull().default(0), // 0 = open to the sky
    capacity: jsonb("capacity").$type<Record<string, number>>(),
    style: jsonb("style").$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [index("zones_venue_idx").on(t.venueId)],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    organizationId: orgId(),
    clientName: text("client_name").notNull(),
    eventDate: timestamp("event_date", { withTimezone: true }),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "restrict" }),
    /** The zones this event occupies, in the designer's own order — the ceremony's חופה and the
     *  hall it opens off are one event. Ordered, so a join table would need its own position
     *  column to say the same thing. */
    zoneIds: jsonb("zone_ids").$type<string[]>().notNull().default([]),
    /** Denormalised zone names for lists and the quote header (EventSummary.zonesLabel). */
    zonesLabel: text("zones_label"),
    mapSource: mapSourceEnum("map_source").notNull(),
    createdAt: created(),
  },
  (t) => [index("events_org_idx").on(t.organizationId), index("events_venue_idx").on(t.venueId)],
);

// Import result (F-1.x): PDF ref, calibration, detected/placed tables, verification state.
export const floorPlans = pgTable(
  "floor_plans",
  {
    id: id(),
    organizationId: orgId(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    pdfUrl: text("pdf_url"),
    mmPerUnit: numeric("mm_per_unit", { precision: 12, scale: 4 }), // calibration (F-1.4)
    tables: jsonb("tables").$type<unknown[]>().notNull().default([]),
    verificationState: verificationEnum("verification_state").notNull().default("draft"),
    createdAt: created(),
  },
  (t) => [index("floor_plans_org_idx").on(t.organizationId)],
);

// The heart of the system (ADR-4). Placements live as JSONB; each save is a version (F-4.3).
export const designDocuments = pgTable(
  "design_documents",
  {
    id: id(),
    organizationId: orgId(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    content: jsonb("content").$type<DesignDocumentContent>().notNull(),
    createdAt: created(),
  },
  (t) => [index("design_documents_org_idx").on(t.organizationId)],
);

// A produced output (F-4.x): map / packing list / quote, pinned to a document version.
export const exports = pgTable(
  "exports",
  {
    id: id(),
    organizationId: orgId(),
    designDocumentId: uuid("design_document_id").notNull().references(() => designDocuments.id, { onDelete: "cascade" }),
    type: exportTypeEnum("type").notNull(),
    documentVersion: integer("document_version").notNull(),
    fileUrl: text("file_url"),
    createdAt: created(),
  },
  (t) => [index("exports_org_idx").on(t.organizationId)],
);
