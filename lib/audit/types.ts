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

/** The people a row's line names, as they were when it was written. A person is never written into
 *  `summary` by name — only as a `{{p:<id>}}` token — so deleting them is one wipe of `name` here. */
export type AuditPeople = Record<string, { name: string | null; kind: "member" | "client" }>;
