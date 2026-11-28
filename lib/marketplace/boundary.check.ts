// npm run check:marketplace — the self-check of ./boundary.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { join } from "node:path";
import { FORBIDDEN_TABLES, scanMarketplace } from "./boundary";

// ponytail: self-check. Run: npm run check:marketplace
const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};
const forbidden = new RegExp(`\\b(${FORBIDDEN_TABLES.join("|")})\\b`);
assert(forbidden.test('import { events, products } from "@/lib/db/schema";'), "an import of events is caught");
assert(!forbidden.test('import { organizations, products } from "@/lib/db/schema";'), "organizations and products are allowed");
const violations = scanMarketplace(join(process.cwd(), "lib", "marketplace"));
for (const v of violations) console.error(`FAIL: ${v.file}:${v.line} — ${v.why}`);
assert(violations.length === 0, "the marketplace reads only published supplier rows and their profile");
console.log("marketplace boundary self-check passed");
