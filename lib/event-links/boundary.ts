// The line the venue ↔ designer join must not cross, asserted rather than remembered.
//
// lib/event-links/ is the second module (after lib/marketplace/) allowed to read another
// organisation's rows. What it may carry is in ./types.ts: the booking card minus the money one way,
// the plain hall sketch the other. This scan fails the build the day a file in that folder imports a
// table that holds money, or names a price column — a package's prices, a catalog row's price or
// cost — outside a comment.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMain } from "../self-check";

/** Tables that hold money or the studio's purchasing — never imported here. */
export const FORBIDDEN_TABLES = [
  "billingDocuments",
  "documentCounters",
  "issuedQuotes",
  "quoteDrafts",
  "expenses",
  "orders",
  "orderLines",
  "suppliers",
  "packingSpares",
];

/** Price columns, by the names the code spells them. */
export const FORBIDDEN_FIELDS = ["priceAdult", "priceChild", "priceVendor", "unitPrice", "costPrice"];

export interface Violation {
  file: string;
  line: number;
  why: string;
}

export function scanLinks(dir: string): Violation[] {
  const out: Violation[] = [];
  // verify.ts is the round trip that PROVES no price crosses, so it names them on purpose.
  const files = readdirSync(dir).filter((f) => /\.ts$/.test(f) && f !== "boundary.ts" && f !== "verify.ts");
  const table = new RegExp(`\\b(${FORBIDDEN_TABLES.join("|")})\\b`);
  const field = new RegExp(`\\b(${FORBIDDEN_FIELDS.join("|")})\\b`);
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    text.split("\n").forEach((raw, i) => {
      const line = raw.trim();
      if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) return;
      if (/^import\b/.test(line) && table.test(line)) out.push({ file, line: i + 1, why: `imports ${line.match(table)![1]}` });
      if (field.test(line)) out.push({ file, line: i + 1, why: `names ${line.match(field)![1]}` });
    });
  }
  return out;
}

// ponytail: self-check. Run: npm run check:event-links
if (isMain(import.meta.url)) {
  const dir = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const found = scanLinks(dir);
  for (const v of found) console.error(`FAIL: lib/event-links/${v.file}:${v.line} ${v.why}`);
  if (found.length) process.exit(1);
  console.log("  ok   no money table or price column in lib/event-links/");
  console.log("event links boundary self-check passed");
}
