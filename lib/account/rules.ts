// The account lifecycle's rules (EVE-22; docs/superpowers/specs/2026-11-27-account-lifecycle-design.md).
// PURE — no database, no clock of its own: every function is handed `now`. `check:account` holds it.
import type { VatStatus } from "@/lib/billing/types";

/** What a retained billing document's page reads from `studio_settings`, written into the closure at
 *  ERASE (§5.4) so the document still prints as it printed after the settings row is gone. */
export interface IssuerSnapshot {
  businessName: string;
  ownerName: string;
  businessNumber: string;
  address: string;
  phone: string;
  email: string;
  vatStatus: VatStatus;
  vatRate: string;
  currency: string;
  bankDetails: string;
  instagram: string;
  showBsd: boolean;
  logoKey: string | null;
  signatureKey: string | null;
}

/** What a retained document's page reads about its event through ANOTHER row — the venue's name —
 *  snapshotted per retained event at erase (the venue may go before the documents do). The zones
 *  label is the event's own column and stays on the skeleton. */
export interface PrintedFacts {
  venueName: string;
}

/** The grace period: a closed business may be reopened for this long (decision 1). */
export const CLOSE_GRACE_DAYS = 30;

/** How long issued billing documents are kept after the latest one's tax year ends. ⚠ A PLACEHOLDER
 *  until the accountant confirms it — EVE-84 owes the same number as the legal fact `taxRecordsYears`. */
export const TAX_RECORDS_YEARS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function eraseAfterOf(closedAt: Date): Date {
  return new Date(closedAt.getTime() + CLOSE_GRACE_DAYS * DAY_MS);
}

export type ClosureState = "open" | "closed" | "due" | "erased";

/** Where a business stands: no closure row = open; erased once the sweep has run; otherwise closed
 *  until `eraseAfter`, then due (still reopenable until the sweep actually runs — DECIDE-2). */
export function closureState(
  c: { closedAt: Date; eraseAfter: Date; erasedAt: Date | null } | null,
  now: Date,
): ClosureState {
  if (!c) return "open";
  if (c.erasedAt) return "erased";
  return now.getTime() >= c.eraseAfter.getTime() ? "due" : "closed";
}

/** The last day the retained documents must be kept: the end of the tax year of the LATEST document
 *  date, plus TAX_RECORDS_YEARS. Null when nothing is retained. */
export function retainUntilOf(documentDates: readonly string[]): string | null {
  if (documentDates.length === 0) return null;
  const latest = documentDates.reduce((a, b) => (b > a ? b : a));
  return `${Number(latest.slice(0, 4)) + TAX_RECORDS_YEARS}-12-31`;
}

/** True once `now`'s calendar date (UTC) is past `retainUntil`. Nothing retained is never "over" —
 *  there is nothing to let go. */
export function retentionOver(retainUntil: string | null, now: Date): boolean {
  if (!retainUntil) return false;
  return now.toISOString().slice(0, 10) > retainUntil;
}

// Direction marks and isolates (LRM, RLM, LRE…RLO, LRI…PDI) are invisible: a name copied off a
// label that isolates it carries them, and they say nothing about the name.
const squeeze = (s: string) => s.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().replace(/\s+/g, " ");

/** The owner types the business's name to close it. Surrounding and doubled spaces are forgiven;
 *  anything else — a letter, niqqud, case — must match. A blank name never confirms. */
export function nameConfirms(typed: string, name: string): boolean {
  const a = squeeze(String(typed ?? ""));
  return a.length > 0 && a === squeeze(String(name ?? ""));
}

/** The columns a retained event keeps (DECIDE-5): what its documents print — the date, the type, the
 *  client's name and the zones label — and what makes it a row. */
export const EVENT_SKELETON_KEEP = [
  "id",
  "organization_id",
  "event_date",
  "event_type",
  "client_name",
  "zones_label",
  "created_at",
] as const;

export interface ColumnInfo {
  name: string;
  notNull: boolean;
  /** Drizzle's `column.dataType`: "string" for text, uuid, date and time; "number", "boolean",
   *  "date" (a timestamp), "array", "json"… */
  dataType: string;
}

/** The UPDATE that turns an event into its skeleton: every text-like column not kept is blanked —
 *  '' when it is NOT NULL, null otherwise (the venue link included: the venue may go first). Numbers,
 *  switches, timestamps and the palette say nothing about anybody and stay. */
export function skeletonPatch(columns: readonly ColumnInfo[]): Record<string, null | ""> {
  const keep = new Set<string>(EVENT_SKELETON_KEEP);
  const patch: Record<string, null | ""> = {};
  for (const col of columns) {
    if (keep.has(col.name) || col.dataType !== "string") continue;
    patch[col.name] = col.notNull ? "" : null;
  }
  return patch;
}

/** Why the erase script must not run against production as asked — null when it may. The local
 *  folder there would list nothing and stamp the files done while every object stays in the bucket;
 *  a made-up clock (--now) would erase businesses still inside their grace period. */
export function eraseRunRefusal(input: { prod: boolean; driver: "local" | "r2"; nowGiven: boolean }): string | null {
  if (!input.prod) return null;
  if (input.driver !== "r2") return "production needs the R2 file driver (its variables are not set here): the local folder would list nothing and leave every file in the bucket";
  if (input.nowGiven) return "--now is for local runs only: in production it would erase businesses still inside their 30 days";
  return null;
}
