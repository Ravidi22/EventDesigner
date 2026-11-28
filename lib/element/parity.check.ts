// npm run check:element-parity — the self-check of ./parity.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { STANDARD_ITEMS, standardProduct } from "@/lib/catalog/standard/items";
import { matrix, parityFailures, SIZES } from "./parity";

const library = STANDARD_ITEMS.map((i) => standardProduct(i, `id-${i.key}`));
const rows = [...library, ...matrix()];
const failures = parityFailures(rows);
for (const f of failures) console.error("  FAIL " + f);
if (failures.length) {
  console.error(`element parity: ${failures.length} disagreement(s) over ${rows.length} rows`);
  process.exit(1);
}
console.log(`element parity: ${rows.length} rows (${library.length} of the base library, ${rows.length - library.length} of the matrix) × ${SIZES.length} sizes agree to the path string`);
