// The audit log's vocabulary (EVE-52; spec §5.9). Shared by the writer, the reader and the screen.

/** Every sensitive action the log records. A new one needs a group and a writer (`check:audit`). */
export type AuditAction =
  | "member.invited"
  | "member.role_changed"
  | "member.removed"
  | "member.self_deleted"
  | "client.access_granted"
  | "client.access_revoked"
  | "venue.grant_changed"
  | "venue.deleted"
  | "billing.issued"
  | "billing.cancelled"
  | "billing.credited"
  | "billing.original_marked"
  | "event.deleted"
  | "product.deleted"
  | "export.downloaded"
  | "business.closed"
  | "business.reopened"
  | "security.password_changed";

/** Every action, in the order the screen's groups list them. */
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  "member.invited",
  "member.role_changed",
  "member.removed",
  "member.self_deleted",
  "client.access_granted",
  "client.access_revoked",
  "venue.grant_changed",
  "venue.deleted",
  "billing.issued",
  "billing.cancelled",
  "billing.credited",
  "billing.original_marked",
  "event.deleted",
  "product.deleted",
  "export.downloaded",
  "business.closed",
  "business.reopened",
  "security.password_changed",
];

/** The screen's filter chips (spec §5.9). */
export type AuditGroup = "people" | "places" | "documents" | "deletions" | "account";

export const AUDIT_GROUP: Record<AuditAction, AuditGroup> = {
  "member.invited": "people",
  "member.role_changed": "people",
  "member.removed": "people",
  "member.self_deleted": "people",
  "client.access_granted": "people",
  "client.access_revoked": "people",
  "venue.grant_changed": "places",
  "venue.deleted": "places",
  "billing.issued": "documents",
  "billing.cancelled": "documents",
  "billing.credited": "documents",
  "billing.original_marked": "documents",
  "event.deleted": "deletions",
  "product.deleted": "deletions",
  "export.downloaded": "account",
  "business.closed": "account",
  "business.reopened": "account",
  "security.password_changed": "account",
};

export const AUDIT_GROUP_LABEL: Record<AuditGroup, string> = {
  people: "אנשים",
  places: "מקומות",
  documents: "מסמכים",
  deletions: "מחיקות",
  account: "חשבון",
};

/** The people a row's line names, as they were when it was written. A person is never written into
 *  `summary` by name — only as a `{{p:<id>}}` token — so deleting them is one wipe of `name` here. */
export type AuditPeople = Record<string, { name: string | null; kind: "member" | "client" }>;

/** What a writer hands `recordAudit` (lib/audit/write.ts). */
export interface AuditEntry {
  organizationId: string;
  /** Null for a script. */
  actorUserId: string | null;
  action: AuditAction;
  target?: { kind: string; id: string };
  /** The Hebrew line; a person only as `personToken(id)` (./render.ts), never by name. */
  summary: string;
  /** Every person the line names, the actor included, as they are now. */
  people: AuditPeople;
  details?: Record<string, unknown>;
}

/** One row as the owner's screen draws it. */
export interface AuditRow {
  id: string;
  at: string;
  action: AuditAction;
  group: AuditGroup;
  actor: string;
  line: string;
}
