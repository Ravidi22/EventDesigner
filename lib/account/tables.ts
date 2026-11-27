// Every table the schema has, and what the account lifecycle does with it (EVE-22, EVE-51; spec §4).
//
// ONE registry for the export and the erase: which rows are the business's (`reach`), which of their
// columns may leave in an export (`export`), and what the erase does to them (`erase`).
// `check:account-tables` fails when the schema gains a table this file does not classify — the erase
// never deletes by guessing, and a new table cannot silently stay behind after a business is erased
// or be missing from its export. The operator script scripts/delete-organization.ts keeps its own
// run-time discovery; it is the operator's tool, not the app's.

/** Which rows are the business's.
 *  - "org": `organization_id` is the business.
 *  - "self": the organisations table itself (its id).
 *  - "global": nobody's (rate limits, verification tokens).
 *  - orgColumns: any of these columns is the business (a grant names grantor and grantee).
 *  - via: "<parent table>.<this table's column>" — rows whose parent row is the business's.
 *  - user: rows of the business's people, by this column. */
export type Reach =
  | "org"
  | "self"
  | "global"
  | { orgColumns: readonly string[] }
  | { via: string }
  | { user: string };

/** What an export carries: every column, every column but some, or nothing (and why). */
export type ExportRule = "all" | { omit: readonly string[] } | { skip: string };

/** What the erase does (spec §5.4).
 *  - "delete": every row of the business goes, explicitly, in ERASE_ORDER.
 *  - "cascade": goes with a parent the erase deletes outright, by its ON DELETE CASCADE key.
 *  - "retain-billing": kept until retention is over (§5.5).
 *  - "retain-event": an event a kept document names stays as a skeleton; the rest go.
 *  - "retain-design": a sealed drawing an order names stays; the rest go.
 *  - "retain-venue": a venue another business's event stands in stays (with its structure and
 *    zones); the rest go.
 *  - skip: the erase leaves it (and why). */
export type EraseRule =
  | "delete"
  | "cascade"
  | "retain-billing"
  | "retain-event"
  | "retain-design"
  | "retain-venue"
  | { skip: string };

export interface TableRule {
  reach: Reach;
  export: ExportRule;
  erase: EraseRule;
}

const org = (erase: EraseRule = "delete", exp: ExportRule = "all"): TableRule => ({ reach: "org", export: exp, erase });
const viaEvent = (column = "event_id"): TableRule => ({ reach: { via: `events.${column}` }, export: "all", erase: "delete" });

export const ACCOUNT_TABLES: Record<string, TableRule> = {
  // ── the business and its people ──
  organizations: { reach: "self", export: "all", erase: { skip: "the tombstone — lib/account/erase.ts" } },
  organization_closures: org({ skip: "the tombstone — lib/account/erase.ts" }),
  studio_settings: org(),
  users: org("delete", { omit: ["password_hash", "invite_token_hash", "invite_expires_at"] }),
  legal_acceptances: { reach: { user: "user_id" }, export: "all", erase: "cascade" },
  auth_sessions: { reach: { user: "user_id" }, export: { skip: "sessions" }, erase: "cascade" },
  auth_accounts: { reach: { user: "user_id" }, export: { skip: "credentials" }, erase: "cascade" },
  auth_verifications: { reach: "global", export: { skip: "not the business's" }, erase: { skip: "not the business's" } },
  auth_rate_limits: { reach: "global", export: { skip: "not the business's" }, erase: { skip: "not the business's" } },
  audit_log: org(),
  notifications: org(),
  google_connections: org("delete", { omit: ["refresh_token", "access_token", "access_token_expires_at"] }),
  google_event_links: org(),

  // ── events and everything that hangs off one ──
  events: org("retain-event"),
  event_clients: viaEvent(),
  event_zones: viaEvent(),
  event_liked_images: viaEvent(),
  packing_spares: viaEvent(),
  // The rows of the business's own bookings (a venue). A link where the business is the DESIGNER is the
  // venue's row: it only loses its studio_event_id (ON DELETE SET NULL) and reads as ended.
  event_links: viaEvent("venue_event_id"),
  event_crew: org(),
  event_hosting: org(),
  event_scenes: org(),
  scene_links: org("delete", { omit: ["token_hash"] }),
  sketch_proposals: org(),
  design_documents: org("retain-design"),
  quote_drafts: org(),
  issued_quotes: org(),
  exports: org(),
  appointments: org(),

  // ── money ──
  billing_documents: org("retain-billing"),
  document_counters: org(),
  expenses: org(),
  orders: org(),
  order_lines: { reach: { via: "orders.order_id" }, export: "all", erase: "cascade" },
  suppliers: org(),

  // ── catalog, gallery, menus ──
  products: org(),
  product_variants: org(),
  gallery_images: org(),
  presentations: org(),
  presentation_images: { reach: { via: "presentations.presentation_id" }, export: "all", erase: "cascade" },
  sketch_templates: org(),
  menu_dishes: org(),
  menu_packages: org(),

  // ── places ──
  venues: org("retain-venue"),
  venue_structures: org("retain-venue"),
  zones: org("retain-venue"),
  // Grants on the business's venues (it is the grantor) and grants it holds on other businesses'
  // venues (the grantee) — both go: nobody may edit a venue that stays, and the business is gone.
  venue_grants: { reach: { orgColumns: ["grantor_org_id", "grantee_org_id"] }, export: "all", erase: "delete" },
};

/** The tables the erase deletes from, children before parents (`check:account-tables` holds it to
 *  every foreign key). Never relies on session_replication_role: the billing trigger and every key
 *  stay on. */
export const ERASE_ORDER: readonly string[] = [
  "google_event_links",
  "google_connections",
  "notifications",
  "audit_log",
  "event_clients",
  "event_liked_images",
  "event_zones",
  "packing_spares",
  "event_crew",
  "event_hosting",
  "event_scenes",
  "event_links",
  "scene_links",
  "sketch_proposals",
  "quote_drafts",
  "issued_quotes",
  "exports",
  "appointments",
  "expenses",
  "orders",
  "document_counters",
  "design_documents",
  "events",
  "presentations",
  "gallery_images",
  "product_variants",
  "products",
  "suppliers",
  "sketch_templates",
  "menu_packages",
  "menu_dishes",
  "venue_grants",
  "zones",
  "venue_structures",
  "venues",
  "studio_settings",
  "users",
];

/** A column that signs somebody in or proves a link: never exported, whatever the registry says. */
export function isSecretColumn(name: string): boolean {
  return /(^|_)(password|token|secret)(_|$)/.test(name);
}

/** The columns of `table` an export carries, by its rule. Does NOT strip secrets on its own —
 *  `check:account-tables` fails if a rule lets one through, so the registry has to say so. */
export function exportedColumns(table: string, columns: readonly string[]): string[] {
  const rule = ACCOUNT_TABLES[table]?.export;
  if (!rule || (typeof rule === "object" && "skip" in rule)) return [];
  if (rule === "all") return [...columns];
  const omit = new Set(rule.omit);
  return columns.filter((c) => !omit.has(c));
}
