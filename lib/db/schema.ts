// Data model — the tables behind lib/*/actions.ts.
//
// THE RULE OF THIS FILE: the TypeScript types in lib/*/types.ts are the source of truth, and every
// column here exists to hold one of them. When the two disagree, this file is what's wrong — the
// app has been maintained continuously and the schema had not, which is how it drifted a whole
// product model behind (a PDF-import table that no longer has a feature, an events table missing
// ten of the fields the meeting form collects, and no table at all for the gallery). Each block
// below names the type it carries, so the next drift is visible instead of silent.
//
// ADR-2: every table carries organizationId and every query filters by it. The one deliberate
// exception is venue_grants, which exists to cross that line — see its own note.
//
// Three decisions worth stating, because each one departs from a default:
//
//  1. PRIMARY KEYS ARE UUIDv4, NOT `bigint identity`. Postgres guidance prefers sequential keys
//     (random UUIDs fragment the index), and it is right for tables that grow to millions. It
//     loses here because Eve's ids are minted in the BROWSER: the canvas creates a table, selects
//     it, and lets the designer drag it before any server round-trip has happened
//     (crypto.randomUUID() in studio-screen.tsx). Server-assigned ids would mean a placeholder id
//     and a reconciliation pass on every optimistic edit. The tables this touches top out in the
//     tens of thousands of rows for a studio, where the fragmentation cost is not measurable.
//
//  2. NO GIN INDEXES ON THE BIG JSONB COLUMNS (design_documents.content, venues.plan,
//     venue_structures.structure). GIN pays off when you query INTO a document; every one of these
//     is read and written whole, as one value, by exactly one screen. An index would be write cost
//     with no read to earn it back. If a query ever reaches inside one of them, that is the moment
//     to add the index — not now.
//
//  3. RLS IS NOT DEFINED HERE YET. Row-level security is how ADR-2 actually gets enforced, and its
//     policies key on the signed-in user — which does not exist until auth lands. A policy written
//     against an auth function that isn't wired yet cannot be tested, and an untested RLS policy is
//     a data leak with a false sense of safety. So: policies land WITH auth, in the same change, on
//     these tables. ⚠ Until then the org filter in the server actions is the ONLY tenant boundary,
//     which is precisely the "application-level filtering only" anti-pattern — acceptable strictly
//     because there is one organization and no public signup, and not a day longer.
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  date,
  time,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { MapAppearance } from "@/lib/catalog/types";
import type { VenuePlan } from "@/lib/venues/types";
import type { VenueStructure } from "@/lib/venues/structure";
import type { ZoneSource, ZoneCapacity } from "@/lib/venues/zone";
import type { ElementStyle } from "@/lib/element-style";
import type { MeetingStepId } from "@/lib/meeting/steps";

// ── Enums ──────────────────────────────────────────────────────────────────────────────────────
// Which layer of the room a product lives on (Product.layer).
export const layerEnum = pgEnum("layer", ["table", "floor", "ceiling"]);
// What a price is per (Product.priceUnit) — a drape sold by the running metre is not "one unit".
export const priceUnitEnum = pgEnum("price_unit", ["unit", "m", "m2"]);
// Who may see a catalog item (Product.visibility). `private` is the whole catalog today: the
// column exists so that publishing an item is a per-product decision the designer makes
// deliberately, never a side effect of some other setting.
export const visibilityEnum = pgEnum("product_visibility", ["private", "public"]);
// What a named region of a venue is (lib/venues/zone.ts).
export const zoneKindEnum = pgEnum("zone_kind", ["hall", "canopy", "open", "service"]);
// What kind of entry occupies a day in the diary (lib/appointments/types.ts). The first three are
// sit-downs with a client; the middle four are not — a blocked date, a holiday, a delivery, a
// personal errand — and they carry no client, no phone and no event. They share one enum, and one
// table, because they all answer "what is on the 12th?".
//
// ⚠ APPEND ONLY. Postgres can add a value to an enum but cannot remove one, and the four non-client
// kinds were added in migration 0004 for exactly that reason: reordering this list would generate a
// migration that drops and recreates the type, taking the column's data with it.
export const appointmentKindEnum = pgEnum("appointment_kind", [
  "consultation",
  "followup",
  "walkthrough",
  "other",
  "constraint",
  "vacation",
  "supply",
  "personal",
]);
export const exportTypeEnum = pgEnum("export_type", ["placement_map", "packing_list", "quote"]);
export const discountTypeEnum = pgEnum("discount_type", ["amount", "percent"]);
// What KIND of stock a catalog item is (Product.stockKind) — the one column the whole procurement
// forecast turns on, because the three kinds want three different reductions over the same data:
//
//   owned      — the studio has it and lays it again at every event. The question is "do I own
//                enough for the busiest day", so the reduction is PEAK CONCURRENT demand across
//                overlapping events, compared to stock_qty. Summing it monthly is meaningless: one
//                30m carpet used at four events is 30m of asset, not 120m of purchasing.
//   consumable — used up. The monthly SUM is exactly the right number: it is what to buy.
//   rented     — brought in per event and returned. Neither summed nor peaked: it is a list of
//                order lines, one per event and date, grouped by supplier.
export const stockKindEnum = pgEnum("stock_kind", ["owned", "consumable", "rented"]);
// Which SIDE of the product an account is on, and the one distinction that is not a role.
//
// A `studio` account is a designer or supplier: they own an organisation and everything in it —
// venues, catalog, events, prices. A `client` account is the couple whose wedding it is. They own
// no organisation at all; they are shown things, by the studio, about their own event.
//
// It is deliberately NOT a value of studioRoleEnum. owner/designer/crew are rungs of one ladder,
// where each can do everything the one below can; a client is not a smaller designer, and modelling
// them as the bottom rung is how "crew can't see prices" quietly becomes the rule that is supposed
// to be keeping a client out of the whole studio.
export const accountKindEnum = pgEnum("account_kind", ["studio", "client"]);
// People. Two ladders, because they answer two different questions: what you are inside this
// studio (lib/team/types.ts), and what you may do to one property (lib/venues/access.ts).
export const studioRoleEnum = pgEnum("studio_role", ["owner", "designer", "crew"]);
export const venueRoleEnum = pgEnum("venue_role", ["viewer", "editor", "manager"]);
export const grantKindEnum = pgEnum("grant_kind", ["member", "guest"]);
// One state, two words in the app: StudioMember calls it "invited", VenueGrant calls it "pending".
// They mean the same thing — invitation sent, not yet accepted — so there is one enum, and the
// mapping layer picks the word its screen uses.
export const inviteStateEnum = pgEnum("invite_state", ["pending", "active"]);

// ── Column helpers ─────────────────────────────────────────────────────────────────────────────
const orgId = () => uuid("organization_id").notNull();
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ── The tenant and its people ──────────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  createdAt: created(),
});

/** Everyone with an account: the studio's own people (StudioMember, lib/team/types.ts) and the
 *  clients whose events they are designing.
 *
 *  ONE table, not two, because a person has one set of credentials. Two tables would mean two
 *  password columns, two sign-in paths and two places to get a lockout or a reset wrong — and the
 *  day a designer is also somebody else's client, two rows fighting over one email. What differs
 *  between the two kinds is not how they sign in; it is what they are attached to. */
export const users = pgTable(
  "users",
  {
    id: id(),
    /** ⚠ NULL for client accounts, and that is the whole point: a client belongs to no studio.
     *
     *  Note this is the one organizationId in the schema that is nullable — everywhere else it is
     *  the tenant key and NOT NULL. Here it answers "which studio is this person OF", and for a
     *  client the honest answer is none. Which events they may see is a different question, with
     *  its own table (event_clients) — a client of one studio must not become a member of it. */
    organizationId: uuid("organization_id"),
    /** studio (designer/supplier) or client. See accountKindEnum. */
    kind: accountKindEnum("kind").notNull().default("studio"),
    email: text("email").notNull().unique(),
    name: text("name"),
    /** Meaningful only for studio accounts; a client is not a rung on this ladder. */
    role: studioRoleEnum("role").notNull().default("designer"),
    state: inviteStateEnum("state").notNull().default("pending"),
    /** scrypt, salted per user — see lib/auth/password.ts for the encoding.
     *
     *  NULLABLE, and that is the whole difference between the two rows this table holds: someone
     *  who signed up has a hash, someone who was INVITED is a real row with a real email and no
     *  password until they accept. A NOT NULL column would force an invitation to invent a
     *  credential nobody chose, which is a credential that can be guessed. */
    passwordHash: text("password_hash"),
    /** The invitation, when this row is one.
     *
     *  ⚠ A HASH of the token, never the token — same rule as sessions, for the same reason: this
     *  link IS an account, so a leaked database dump must not be a way to walk into a studio. The
     *  consequence is deliberate and visible in the UI: the link can be SHOWN once, when it is
     *  minted. A designer who loses it generates a new one, which invalidates the old.
     *
     *  Cleared on acceptance, so a used link stops working — the row keeps no memory of it. */
    inviteTokenHash: text("invite_token_hash"),
    /** Invitations expire. An address that was invited and never joined must not stay claimable
     *  forever, because the row also blocks that address from signing up on its own. */
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    /** The day they joined the studio, as the settings list prints it — a calendar date, not the
     *  instant the row was written, which is what createdAt already says. */
    joinedAt: date("joined_at"),
    createdAt: created(),
  },
  (t) => [
    index("users_org_idx").on(t.organizationId),
    // The join screen's only lookup: one token, one row.
    uniqueIndex("users_invite_token_key").on(t.inviteTokenHash),
  ],
);

/** A signed-in browser.
 *
 *  Sessions live in the database rather than in a signed cookie so that they can be REVOKED — a
 *  stolen laptop, a member removed from the studio, a password changed. A self-contained signed
 *  token is valid until it expires no matter what happens on this end, and "log out everywhere"
 *  cannot be built on top of one.
 *
 *  ⚠ The column holds a HASH of the token, never the token. The cookie the browser carries is the
 *  only copy of the secret itself, so a leaked database dump cannot be replayed as a login. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: created(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** BusinessSettings (lib/settings/types.ts) + the configured meeting flow
 *  (lib/meeting/steps.ts). Both are written by lib/settings/actions.ts — see the note there on why
 *  one module owns both halves. One row per organization, so the organization id IS the key: a studio
 *  has one letterhead and one meeting shape, and a table that can hold two of either invites the
 *  question of which one is live. */
export const studioSettings = pgTable("studio_settings", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull().default(""),
  ownerName: text("owner_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  logoUrl: text("logo_url"),
  /** ע.מ / ח.פ. A quote from a business with no registration number on it is an offer from an
   *  Instagram handle — the one field a client's accountant looks for first. */
  businessNumber: text("business_number").notNull().default(""),
  email: text("email").notNull().default(""),
  /** How long an issued quote holds its price. Without it the price is open forever. */
  quoteValidityDays: integer("quote_validity_days").notNull().default(14),
  /** Payment schedule, cancellation, what is excluded — free text, one line per clause, printed
   *  at the foot of every quote. Free text rather than columns because the clauses themselves
   *  differ per studio and none of them is ever queried into. */
  quoteTerms: text("quote_terms").notNull().default(""),
  /** 0.18 = 18%. numeric, never float — this multiplies money. */
  vatRate: numeric("vat_rate", { precision: 5, scale: 4 }).notNull().default("0.18"),
  currency: text("currency").notNull().default("₪"),
  /** The stages this studio's meeting has, in order (MeetingStepId[]). Ordered and rewritten
   *  whole by the settings screen, never queried into — an array column says exactly that. */
  meetingFlow: text("meeting_flow").array().$type<MeetingStepId[]>().notNull().default([]),
  updatedAt: updated(),
});

// Access to one venue, granted by the studio that drew its plan (VenueGrant, lib/venues/access.ts).
//
// The one table in this file that is NOT scoped to a single organization, and deliberately: its
// entire purpose is to cross the boundary ADR-2 draws everywhere else. A venue is a physical
// property, so two studios can legitimately work the same hall off the same plan — grantor and
// grantee are therefore separate columns, and the RLS policy for venues will read this table
// rather than the plain organizationId check that governs everything else.
//
// What a grant conveys is decided by `kind`, not by role: a `guest` gets the plan and anonymous
// availability, never the events, clients or prices at that venue. The authority for that rule is
// grantScope() in lib/venues/access.ts; this table only records which side of it a row is on.
export const venueGrants = pgTable(
  "venue_grants",
  {
    id: id(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
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
    invitedAt: date("invited_at"),
    createdAt: created(),
  },
  (t) => [
    index("venue_grants_venue_idx").on(t.venueId),
    index("venue_grants_grantor_idx").on(t.grantorOrgId),
    index("venue_grants_grantee_org_idx").on(t.granteeOrgId),
    index("venue_grants_grantee_user_idx").on(t.granteeUserId),
    // One person, one grant per venue — re-inviting updates the row instead of stacking a second.
    uniqueIndex("venue_grants_venue_email_key").on(t.venueId, t.granteeEmail),
  ],
);

// ── Catalog ────────────────────────────────────────────────────────────────────────────────────

/** Product (lib/catalog/types.ts). Dimensions stay flat columns rather than a nested jsonb blob:
 *  height is required for phase-2 3D (R-3) and a NOT NULL column is how you actually enforce that,
 *  and "every product taller than 2m" is a query someone will eventually write. */
export const products = pgTable(
  "products",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    layer: layerEnum("layer").notNull(),
    category: text("category").notNull(), // CategoryDef id
    // Dimensions, in millimetres. A stretch product (a drape, a carpet) carries no width or depth —
    // it is cut to whatever it must cover, so its size belongs to the placement, not the catalog.
    diameterMm: integer("diameter_mm"),
    widthMm: integer("width_mm"),
    depthMm: integer("depth_mm"),
    heightMm: integer("height_mm").notNull(),
    /** Structured fields exist ONLY where they multiply quantities (candle arms, standard seats);
     *  every other trait is free text in `spec`. */
    categoryFields: jsonb("category_fields")
      .$type<Record<string, string | number>>()
      .notNull()
      .default({}),
    spec: text("spec"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
    priceUnit: priceUnitEnum("price_unit").notNull().default("unit"),
    styleTags: text("style_tags").array().notNull().default([]),
    /** How the item draws on the plan; absent means "derive it from the dimensions above". */
    appearance: jsonb("appearance").$type<MapAppearance>(),
    /** F-4.5: a product that is placed in any event is archived, never deleted — a design document
     *  must never point at nothing. */
    archived: boolean("archived").notNull().default(false),
    /** Private (the default) means this item exists only in its own studio's catalog. Public means
     *  other studios may see it.
     *
     *  DEFAULTS CLOSED, and the default is enforced here rather than in the app: a product that
     *  somehow arrives without an opinion about who may see it must not become visible to strangers
     *  because of a missing field. Publishing is always an explicit act.
     *
     *  ⚠ The column is written and read today, but NOTHING CROSSES ORGANISATIONS YET — every query
     *  in lib/catalog/actions.ts is still scoped to one studio. That is deliberate: a cross-org read
     *  needs decisions this flag alone does not answer (may another studio PLACE a public item, and
     *  what happens to their design when the owner archives it?) and it needs RLS, which arrives
     *  with auth. The flag is recorded now so the day those land, the data is already there. */
    visibility: visibilityEnum("visibility").notNull().default("private"),

    // ── Procurement (lib/suppliers/) ───────────────────────────────────────────────────────────
    /** Who this item is bought or rented from. ONE supplier, not a join table: a many-to-many with
     *  a price per supplier buys exactly one thing — supplier comparison — that nobody has asked
     *  for, and costs a second place for cost to live. Expenses may name any supplier freely, so
     *  buying a batch from someone else is already expressible without this column moving. */
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    /** What the STUDIO pays, as opposed to `unitPrice`, which is what the CLIENT pays.
     *
     *  ⚠ INTERNAL. This is the first cost number in the product and it must never reach /present,
     *  the client portal, a quote or a packing list. `npm run check:costs` asserts that line the
     *  same way check:access asserts the guest one. Per `priceUnit`, like unitPrice — a drape's
     *  cost is per metre because that is how it is bought. */
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
    /** owned / consumable / rented — see stockKindEnum. Seeded from the category's default on
     *  create, then owned by the product: a studio that rents its chairs must be able to say so
     *  without the category disagreeing, so this is a stored value and not a lookup. */
    stockKind: stockKindEnum("stock_kind").notNull().default("owned"),
    /** How many the studio owns. Meaningful only when stockKind = 'owned', and NULLABLE on purpose:
     *  a count is only useful while someone keeps it true (R-7), so an owned product without one
     *  shows demand and claims no shortfall rather than inventing a confident wrong number. */
    stockQty: integer("stock_qty"),
    /** The unit the SUPPLIER sells in ("גבעולים", "מטרים") when it differs from the unit the plan
     *  measures in. A florist prices stems; the plan places centrepieces. */
    orderUnit: text("order_unit"),
    /** Order-units per placed unit — 7 stems per centrepiece. NULL means 1, which is right for most
     *  of the catalog. Generalises the `arms` multiplier the packing list already applies. */
    orderFactor: numeric("order_factor", { precision: 10, scale: 3 }),

    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("products_org_idx").on(t.organizationId),
    // "What do I buy from this supplier?" — the supplier card's own count, and the join the
    // procurement list makes for every row it groups.
    index("products_supplier_idx").on(t.supplierId),
    // The catalog screen's default read is "this org's live products" — the partial index serves it
    // without carrying the archived rows nobody lists.
    index("products_org_live_idx")
      .on(t.organizationId, t.category)
      .where(sql`${t.archived} = false`),
  ],
);

/** Variant (lib/catalog/types.ts) — a shade or version. Every placement references a VARIANT, not
 *  a product, so the packing list and quote separate "מפה זהב ×40" from "מפה שמנת ×12". */
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    organizationId: orgId(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // "זהב", "שמנת"
    /** The actual colour, for the picker and the plan. Absent = a version that isn't a colour. */
    swatch: text("swatch"),
    imageUrl: text("image_url"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }), // inherits the product when null
    archived: boolean("archived").notNull().default(false),
    /** The order the designer put them in; the first is the default a drop lands on. */
    position: integer("position").notNull().default(0),
    createdAt: created(),
  },
  (t) => [
    index("variants_org_idx").on(t.organizationId),
    // FK columns are not indexed automatically, and this one is joined on every catalog read.
    index("variants_product_idx").on(t.productId, t.position),
  ],
);

// ── The property ───────────────────────────────────────────────────────────────────────────────

/** Venue (lib/venues/types.ts). One site plan per venue: a single millimetre plane every zone on
 *  the property is drawn in, plus the calibration measured off it once. */
export const venues = pgTable(
  "venues",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    /** mmPerUnit, the property line, and the placed plan underlay. */
    plan: jsonb("plan").$type<VenuePlan>().notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("venues_org_idx").on(t.organizationId)],
);

/** The venue's ONE wall graph — nodes, walls, doors, fixed features (lib/venues/structure.ts).
 *  One row per venue, held whole: it is read and written as a unit by the plan editor, and the
 *  graph's whole value is that a wall shared by two rooms exists exactly once inside it. */
export const venueStructures = pgTable(
  "venue_structures",
  {
    venueId: uuid("venue_id")
      .primaryKey()
      .references(() => venues.id, { onDelete: "cascade" }),
    organizationId: orgId(),
    structure: jsonb("structure").$type<VenueStructure>().notNull(),
    updatedAt: updated(),
  },
  (t) => [index("venue_structures_org_idx").on(t.organizationId)],
);

/** Zone (lib/venues/zone.ts) — a named region of that structure. Carries no geometry of its own
 *  beyond the anchor or freehand boundary in `source`: the region is re-derived from the walls, so
 *  a wall that moves reshapes the zone instead of leaving a stale copy behind. */
export const zones = pgTable(
  "zones",
  {
    id: id(),
    organizationId: orgId(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: zoneKindEnum("kind").notNull(),
    source: jsonb("source").$type<ZoneSource>().notNull(),
    ceilingHeightMm: integer("ceiling_height_mm").notNull().default(0), // 0 = open to the sky
    capacity: jsonb("capacity").$type<ZoneCapacity>(),
    style: jsonb("style").$type<ElementStyle>(),
    createdAt: created(),
  },
  (t) => [index("zones_venue_idx").on(t.venueId), index("zones_org_idx").on(t.organizationId)],
);

// ── Events ─────────────────────────────────────────────────────────────────────────────────────

/** EventSummary (lib/events/types.ts). Status is DERIVED from `step` — the furthest stage the
 *  meeting flow reached — so there is no status column and no second state machine to keep honest.
 *
 *  `eventDate` is a `date`, not a timestamptz: a wedding on 09/08/2026 is that calendar day
 *  everywhere, and storing it as an instant would let a timezone move the wedding. */
export const events = pgTable(
  "events",
  {
    id: id(),
    organizationId: orgId(),
    clientName: text("client_name").notNull(),
    phone: text("phone").notNull().default(""),
    /** The primary contact's own name, when it differs from clientName (the couple). */
    contactName: text("contact_name"),
    /** A second contact, if the couple gave one — a parent, a planner. */
    contact2Name: text("contact2_name"),
    contact2Phone: text("contact2_phone"),
    eventDate: date("event_date"),
    startTime: time("start_time"),
    // ⚠ `meeting_date` used to live here — one nullable date, i.e. exactly one scheduled meeting per
    // event, ever. It moved out to its own table; see `appointments` below for why.
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "restrict" }),
    /** The zones' names, joined — denormalised for lists, headers and the quote, which need a label
     *  without loading the venue plan. Rewritten whenever the selection changes. */
    zonesLabel: text("zones_label").notNull().default(""),
    guests: integer("guests").notNull().default(0),
    /** Furthest meeting stage reached: an index into the studio's CONFIGURED flow
     *  (studio_settings.meetingFlow), not into a fixed list. Always clamped on read. */
    step: integer("step").notNull().default(0),
    quoteSentAt: timestamp("quote_sent_at", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
    createdAt: created(),
  },
  (t) => [
    index("events_org_idx").on(t.organizationId),
    index("events_venue_idx").on(t.venueId),
    // The dashboard and Gantt both read "this org's live events, soonest first".
    index("events_org_date_idx").on(t.organizationId, t.eventDate),
  ],
);

/** The zones an event occupies, in the designer's own order — the ceremony's חופה and the hall it
 *  opens off are one event.
 *
 *  ⚠ CHANGED FROM the previous `events.zoneIds jsonb` column, whose note argued a join table "would
 *  need its own position column to say the same thing". It says two more things that turned out to
 *  matter: a foreign key, so a deleted zone cannot leave a dangling id inside a JSON array; and the
 *  reverse lookup — "which events stand on this zone?" — which the venue editor needs before it
 *  lets someone delete a region that four events are booked into. */
export const eventZones = pgTable(
  "event_zones",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.zoneId] }),
    index("event_zones_zone_idx").on(t.zoneId),
  ],
);

/** Which client accounts may see which event.
 *
 *  This is the whole permission model for the client side, and it is a table rather than a column on
 *  either end for two reasons. A wedding has more than one client — the couple, sometimes a parent
 *  paying for it — and each of them signs in as themselves. And an event is shared DELIBERATELY, by
 *  the designer, at a moment of their choosing: a client seeing a plan is a decision, not a
 *  consequence of the record existing. A row here is that decision, and deleting it is how it is
 *  taken back.
 *
 *  ⚠ It does NOT make the client a member of the studio. It grants sight of one event and nothing
 *  else — never the catalog, never the studio's other clients, and never the internal columns of
 *  this event. What may be rendered for a client stays the /present rule: no prices, no costs, no
 *  quantities on hand.
 */
export const eventClients = pgTable(
  "event_clients",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** When it was shared. There is no separate createdAt: the row IS the sharing. */
    sharedAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    // "which events may this person see" is the only read the client side ever does.
    index("event_clients_user_idx").on(t.userId),
  ],
);

/** Appointment (lib/appointments/types.ts) — a meeting with a client, on the calendar.
 *
 *  ⚠ NAMED `appointments`, NOT `meetings`, while every string on screen still says "פגישה". The word
 *  "meeting" was already spent: lib/meeting/ and /meeting are the guided MEETING FLOW, the stages a
 *  designer walks a client through. A `lib/meetings/` sitting one character from `lib/meeting/` is a
 *  mis-import waiting to happen, so the scheduled thing takes a different word in code and keeps the
 *  Hebrew one in the UI.
 *
 *  ⚠ REPLACES `events.meeting_date` (migration 0001, which copies every non-null one in here before
 *  dropping it). That column held one date on the event row, which is one meeting per event for the
 *  life of the event — and docs/01 §מצב פגישה says the opposite in as many words: "פגישה שנייה
 *  ושינויים הם חלק מהתהליך, לא חריגה ממנו". It also could not exist before its event did, so the
 *  first meeting — the one where you find out whether there is an event at all — had nowhere to go.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    organizationId: orgId(),
    /** The event this is about — NULL while the couple is still a prospect. That is the whole point
     *  of the table: a meeting may precede its event, or never acquire one. */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    /** Who it is with, as typed. Denormalised on purpose — same trade as events.zonesLabel: a
     *  prospect has no event to read a name off, and the calendar wants a label without a join. */
    clientName: text("client_name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    /** Which property this concerns — the dashboard scopes to one at a time. NULL means "not tied to
     *  a property yet", and such a meeting shows on EVERY venue's calendar rather than on none;
     *  a prospect meeting that is invisible everywhere is worse than one that is visible twice.
     *  `set null` on delete, not `restrict` like events.venue_id: a property with ten years of past
     *  meetings against it should still be deletable, and losing the association is not losing the
     *  meeting. */
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    /** A `date` plus a `time`, never a timestamptz — the same reasoning as events.event_date. A
     *  meeting at 17:00 is at 17:00 in the room where it happens; an instant lets a timezone move it. */
    date: date("date").notNull(),
    startTime: time("start_time"),
    durationMin: integer("duration_min").notNull().default(60),
    kind: appointmentKindEnum("kind").notNull().default("consultation"),
    note: text("note").notNull().default(""),
    /** It was actually held. NOT derived from the date being past: a meeting that was booked and
     *  never happened is a different fact from one that has come and gone, and only the designer
     *  knows which. */
    done: boolean("done").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    // The one read the dashboard does: this studio's meetings, in date order.
    index("appointments_org_date_idx").on(t.organizationId, t.date),
    index("appointments_event_idx").on(t.eventId),
    index("appointments_venue_idx").on(t.venueId),
  ],
);

/** DesignDocumentContent (lib/design-document/types.ts) — the heart of the system (ADR-4).
 *  Placements live as JSONB because the canvas reads and writes them as one value.
 *
 *  ⚠ A VERSION IS NOT A SAVE. The comment here used to say "each save is a new row", and that is
 *  what the schema was built for — but the studio autosaves on a 500ms debounce with no save button
 *  (F-3.5), so a row per save is a row every half-second a designer is dragging. An evening's work
 *  would be thousands of copies of a document that is tens of kilobytes each, which is a bill and a
 *  backup problem rather than history anybody asked for.
 *
 *  So a row is minted when something PINS it, and `sealed` is that mark:
 *
 *    • autosave UPDATES the current unsealed row in place — the working drawing, one row per event;
 *    • issuing a quote or producing an export SEALS it (lib/studio/actions.ts `sealDocument`),
 *      freezing that content forever and pinning the output's `document_version` to it;
 *    • the next edit after a seal opens version + 1, because the sealed row may never move again.
 *
 *  That is what F-6.4 and F-7.4 actually need: a quote compares two integers, and the drawing it was
 *  made from is still on disk to compare against. Versions therefore count issued outputs, not
 *  keystrokes. */
export const designDocuments = pgTable(
  "design_documents",
  {
    id: id(),
    organizationId: orgId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    content: jsonb("content").$type<DesignDocumentContent>().notNull(),
    /** Pinned by an output, and immutable from then on — see the note above. */
    sealed: boolean("sealed").notNull().default(false),
    createdAt: created(),
    /** When the drawing last changed. `createdAt` stops meaning that the moment autosave updates a
     *  row in place, and "when was this last touched" is the one a designer would ask for. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("design_documents_org_idx").on(t.organizationId),
    // "the current document for this event" = the highest version, which is the only read the
    // studio ever does on open.
    uniqueIndex("design_documents_event_version_key").on(t.eventId, t.version),
  ],
);

// ── Gallery ────────────────────────────────────────────────────────────────────────────────────

/** GalleryImage (lib/gallery/types.ts) — a PHOTO, linked to exactly ONE catalog product. A product
 *  can have many photos, from different events; that link is the bridge into the studio rail.
 *  `imageUrl` is null until file storage exists; `tone` is the placeholder tile standing in for it
 *  and can be dropped once real files land. */
export const galleryImages = pgTable(
  "gallery_images",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    description: text("description"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    imageUrl: text("image_url"),
    tone: text("tone"),
    createdAt: created(),
  },
  (t) => [
    index("gallery_images_org_idx").on(t.organizationId),
    index("gallery_images_product_idx").on(t.productId),
  ],
);

/** Presentation (lib/gallery/types.ts) — a curated, manually ordered series shown to a client. */
export const presentations = pgTable(
  "presentations",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(), // "חופה קלאסית בזהב"
    createdAt: created(),
  },
  (t) => [index("presentations_org_idx").on(t.organizationId)],
);

/** The photos in a presentation, in the order the designer set (F-2.1). A join table rather than an
 *  id array: a photo appears in several presentations, and deleting one has to know where it is
 *  showing. */
export const presentationImages = pgTable(
  "presentation_images",
  {
    presentationId: uuid("presentation_id")
      .notNull()
      .references(() => presentations.id, { onDelete: "cascade" }),
    imageId: uuid("image_id")
      .notNull()
      .references(() => galleryImages.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.presentationId, t.imageId] }),
    index("presentation_images_image_idx").on(t.imageId),
  ],
);

/** תיק האירוע — the photos the client ♥'d during a meeting (F-2.3). The products behind them are
 *  derived from this and pinned to the top of the studio's catalog rail. A row per like, so the
 *  toggle is an insert or a delete rather than a read-modify-write of a JSON array while a client
 *  is watching. */
export const eventLikedImages = pgTable(
  "event_liked_images",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    imageId: uuid("image_id")
      .notNull()
      .references(() => galleryImages.id, { onDelete: "cascade" }),
    likedAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.imageId] }),
    index("event_liked_images_image_idx").on(t.imageId),
  ],
);

// ── Outputs ────────────────────────────────────────────────────────────────────────────────────

/** F-6.3: the manual spare quantity a designer adds to a packing-list row before printing. Stored
 *  so the "no hand-corrections" success metric covers reserves too, instead of them being added in
 *  pen on the printed page.
 *
 *  ⚠ `variant_id` HAS NO FOREIGN KEY, and that is not an oversight. Throughout the app a
 *  "variantId" is a variant's id OR — for a product with no variants — the PRODUCT's own id: the
 *  implicit default a drop lands on (`defaultVariantId`, lib/studio/catalog-resolver.ts). A
 *  reference to product_variants would therefore reject a spare on any un-varianted product, which
 *  is most of a real catalog. A key that can name a row in either of two tables cannot be a foreign
 *  key, so it is a plain uuid, resolved the same way every placement in a design document is.
 *  issued_quotes.hidden_variant_ids holds the same kind of id, for the same reason. */
export const packingSpares = pgTable(
  "packing_spares",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.variantId] }),
    index("packing_spares_variant_idx").on(t.variantId),
  ],
);

/** A produced output (F-6.4): map / packing list / quote, pinned to the document version it was
 *  made from, and numbered per event so the crew can tell whether the sheet in their hand is the
 *  current one. */
export const exports = pgTable(
  "exports",
  {
    id: id(),
    organizationId: orgId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    designDocumentId: uuid("design_document_id").references(() => designDocuments.id, {
      onDelete: "set null",
    }),
    type: exportTypeEnum("type").notNull(),
    /** The running export number for this event — what gets printed on the sheet. */
    number: integer("number").notNull(),
    documentVersion: integer("document_version").notNull(),
    fileUrl: text("file_url"),
    createdAt: created(),
  },
  (t) => [
    index("exports_org_idx").on(t.organizationId),
    index("exports_document_idx").on(t.designDocumentId),
    uniqueIndex("exports_event_number_key").on(t.eventId, t.number),
  ],
);

/** IssuedQuote (lib/quotes/actions.ts) — F-7.4: a quote locks to the design-document version it was
 *  produced from, so a later edit lights the "העיצוב השתנה מאז ההצעה האחרונה" indicator.
 *
 *  One row per event, matching what the app does: re-issuing overwrites. The mock compared
 *  serialised JSON to detect a change; it compares two integers now — and because issuing SEALS the
 *  document version it names, the drawing the client was shown is still on disk to be compared
 *  against, which the string snapshot could never manage. */
export const issuedQuotes = pgTable(
  "issued_quotes",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => events.id, { onDelete: "cascade" }),
    organizationId: orgId(),
    designDocumentId: uuid("design_document_id").references(() => designDocuments.id, {
      onDelete: "set null",
    }),
    documentVersion: integer("document_version").notNull(),
    discountType: discountTypeEnum("discount_type").notNull().default("amount"),
    discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Rows the designer hid, and categories collapsed to one line, before showing the client. */
    hiddenVariantIds: uuid("hidden_variant_ids").array().notNull().default([]),
    mergedCategoryIds: text("merged_category_ids").array().notNull().default([]),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    issuedAt: created(),
  },
  (t) => [
    index("issued_quotes_org_idx").on(t.organizationId),
    index("issued_quotes_document_idx").on(t.designDocumentId),
  ],
);

// ── Suppliers and what they cost ───────────────────────────────────────────────────────────────

/** Supplier (lib/suppliers/types.ts) — who the studio buys from.
 *
 *  Deliberately NOT a contact-management record: name, one contact person, one phone, what they
 *  supply, a note. No addresses, no second contact, no tags, no activity. The studio's own people
 *  are `users` and its clients are `event_clients`; this is the third kind of person in the product
 *  and it earns the fewest fields of the three, because everything it is for is answered by "what
 *  do I buy from them and what do I owe them". */
export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    /** Free text — what they supply. Not a category list: a florist who also does drapes is one
     *  sentence, and forcing it into the catalog's taxonomy would be a taxonomy for the wrong
     *  thing (what the studio SELLS, not what a supplier stocks). */
    supplies: text("supplies"),
    note: text("note"),
    /** Archived, never deleted, for the same reason as a product: an expense must not lose who it
     *  was paid to, and a supplier who stops trading is still part of last year's costs. */
    archived: boolean("archived").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("suppliers_org_idx").on(t.organizationId),
    index("suppliers_org_live_idx")
      .on(t.organizationId, t.name)
      .where(sql`${t.archived} = false`),
  ],
);

/** Expense (lib/suppliers/types.ts) — money paid to a supplier.
 *
 *  Scope, stated here because this is the table that would otherwise grow forever: it answers TWO
 *  questions and no others — what did this event cost me, and what do I owe this supplier. It is
 *  not bookkeeping. No invoice number, no VAT breakdown, no receipt, no payment reconciliation, no
 *  aged debt. The studio has an accountant and this is not their system; a column added here to be
 *  "nearly" an accounting record is worse than none, because it invites a reconciliation nobody can
 *  finish. */
export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    organizationId: orgId(),
    /** RESTRICT, not cascade: deleting a supplier must not silently delete what was paid to them.
     *  The screen archives instead, and archiving keeps the history readable. */
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    /** ⚠ NULLABLE ON PURPOSE, the same way appointments.event_id is: a bulk purchase of 500 candles
     *  belongs to no event, and forcing one would make the designer invent a fake booking to record
     *  a real cost. `set null` rather than cascade for the same reason — a deleted event must not
     *  take the money that was spent on it out of the year's totals. */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    /** Which catalog item this was for, when it was for one.
     *
     *  ⚠ NO FOREIGN KEY, and it is the same reason written on packing_spares: a "variantId" is a
     *  PRODUCT's id whenever that product has no variants, so a key into product_variants would
     *  reject an expense against most of a real catalog. Resolved the way every placement is. */
    variantId: uuid("variant_id"),
    description: text("description").notNull().default(""),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    /** The date the money was spent, which is not the date the row was written — a receipt gets
     *  typed in a week late and still belongs to the week it happened. */
    spentAt: date("spent_at").notNull(),
    paid: boolean("paid").notNull().default(false),
    createdAt: created(),
  },
  (t) => [
    // The ledger's own read: this studio's expenses over a date window, newest first.
    index("expenses_org_date_idx").on(t.organizationId, t.spentAt),
    index("expenses_supplier_idx").on(t.supplierId),
    // "What did this event cost?" — the margin line on the event drawer and the outputs screen.
    index("expenses_event_idx").on(t.eventId),
  ],
);
