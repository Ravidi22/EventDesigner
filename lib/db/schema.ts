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
export const exportTypeEnum = pgEnum("export_type", ["placement_map", "packing_list", "quote"]);
export const verificationEnum = pgEnum("verification_state", ["draft", "verified"]);

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
    createdAt: created(),
  },
  (t) => [index("users_org_idx").on(t.organizationId)],
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

// Reusable calibrated hall (F-1.6) — the primary phase-1 flow.
export const hallTemplates = pgTable(
  "hall_templates",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    // calibrated geometry: shape, dimensions, obstacles (columns), typical table layout
    geometry: jsonb("geometry").$type<Record<string, unknown>>().notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("hall_templates_org_idx").on(t.organizationId)],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    organizationId: orgId(),
    clientName: text("client_name").notNull(),
    eventDate: timestamp("event_date", { withTimezone: true }),
    hallName: text("hall_name"),
    mapSource: mapSourceEnum("map_source").notNull(),
    createdAt: created(),
  },
  (t) => [index("events_org_idx").on(t.organizationId)],
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
