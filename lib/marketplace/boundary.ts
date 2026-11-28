// The line the marketplace must not cross, asserted rather than remembered.
//
// lib/marketplace/ is the one module allowed to read another organisation's rows. The permission is
// narrow — a SUPPLIER's PUBLISHED products and their public profile — and the way it stays narrow
// is that nothing else of theirs is ever joined. This scan fails the build the day a query in that
// folder names an event, a venue, a quote, an expense, a drawing or a person.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Table identifiers no marketplace query may touch. Identifiers, not words: matching "event" in
 *  a comment would make this fail on prose and get switched off. */
export const FORBIDDEN_TABLES = [
  "events",
  "eventZones",
  "eventClients",
  "venues",
  "venueStructures",
  "zones",
  "issuedQuotes",
  "quoteDrafts",
  "expenses",
  "designDocuments",
  "appointments",
  "users",
  "sessions",
  "orders",
  "orderLines",
];

/** The three conditions every published read carries, as they are spelled in actions.ts. */
export const REQUIRED = ['eq(organizations.kind, "supplier")', 'eq(products.visibility, "public")', "eq(products.archived, false)"];

export interface Violation {
  file: string;
  line: number;
  why: string;
}

export function scanMarketplace(dir: string): Violation[] {
  const out: Violation[] = [];
  const files = readdirSync(dir).filter((f) => /\.ts$/.test(f) && f !== "boundary.ts");
  const forbidden = new RegExp(`\\b(${FORBIDDEN_TABLES.join("|")})\\b`);
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    text.split("\n").forEach((line, i) => {
      // Imports are where a table enters a file; a bare mention in a comment is not a query.
      if (/^import\b/.test(line.trim()) && forbidden.test(line)) {
        out.push({ file, line: i + 1, why: `imports ${line.match(forbidden)![1]}` });
      }
    });
    if (file === "actions.ts") {
      for (const needle of REQUIRED) {
        if (!text.includes(needle)) out.push({ file, line: 0, why: `the published() filter lost ${needle}` });
      }
    }
  }
  return out;
}
