// npm run check:costs — the self-check of ./cost-boundary.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { CLIENT_FACING, FORBIDDEN, scanCostBoundary } from "./cost-boundary";

// ponytail: self-check. Run: npm run check:costs
const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};

// The scanner itself has to work, or a green run means nothing. Check it against strings that
// stand in for the edits this is meant to catch.
const catches = (line: string) => FORBIDDEN.some((f) => f.pattern.test(line));
assert(catches('import { fetchEventMargin } from "@/lib/suppliers/actions";'), "an import of the cost domain is caught");
assert(catches("const c = product.costPrice ?? 0;"), "a read of costPrice is caught");
assert(catches('import { x } from "../../lib/suppliers/types";'), "a relative import of the cost domain is caught");
assert(!catches('import { formatPrice } from "@/lib/catalog/format";'), "the client PRICE is not the studio's cost");
assert(!catches("// the cost of drawing a hall is one-off per venue"), "prose about cost is not a violation");

const root = process.cwd();
const violations = scanCostBoundary(root);
for (const v of violations) console.error(`FAIL: ${v.file}:${v.line} — ${v.why}`);
assert(violations.length === 0, `no client-facing surface reads the studio's cost (${CLIENT_FACING.length} areas scanned)`);

console.log("cost boundary self-check passed");
