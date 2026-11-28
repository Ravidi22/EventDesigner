// What the export route hands the browser (EVE-51, spec §5.8). Shared by the server's assembly
// (./export.ts) and the browser's zip (./export-zip.ts, ./export-csv.ts).
import type { OrgKind } from "@/lib/auth/kinds";

export type Row = Record<string, unknown>;

export interface ExportData {
  meta: { business: string; kind: OrgKind; at: string; app: string };
  /** Every table's rows of this business, by SQL table name, with the columns lib/account/tables.ts
   *  lets leave (never a secret). */
  tables: Record<string, Row[]>;
  /** The client accounts its events are shared with — the people behind its customers' logins. */
  clientAccounts: { eventId: string; name: string | null; email: string; role: string }[];
  /** Venues its events stand in that another business owns: read-only copies, so its drawings mean
   *  something outside Eve. */
  venuesUsed: { id: string; name: string; structure: unknown; zones: Row[] }[];
  /** Every stored file of the business, by key (`<org>/<kind>/<name>`). */
  files: string[];
}
