// The line cost must not cross, asserted rather than remembered.
//
// This app holds two prices for the same object: `products.unitPrice`, which the client pays and
// which a quote is built from, and `products.costPrice`, which the studio pays and which nobody
// outside the studio may ever see. They sit two fields apart in one drawer. Every other rule in
// this codebase that matters this much has a check — the guest scope has `check:access`, the upload
// allowlist has `check:files` — and this one is easier to break than either, because breaking it
// looks like adding a helpful column.
//
// So the boundary is a list of paths and a list of forbidden references, and `npm run check:costs`
// walks the source. It is a static scan on purpose: the failure it guards against is a future edit
// to a file that renders for a client, and no runtime test of today's code would catch that.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isMain } from "../self-check";

/** Every surface a client, or a room with a client in it, can see.
 *
 *  `/present` and the client portal are obvious. The other two are the ones worth writing down:
 *  `app/(app)/outputs` is a PRINTING surface — its quote and packing list become paper that leaves
 *  the studio — and `app/meeting` is rendered on a screen the client is sitting in front of. */
export const CLIENT_FACING = [
  "app/present",
  "app/client",
  "app/meeting",
  "app/(app)/outputs",
  "lib/client-portal",
];

/** What none of them may reference. Import paths and identifiers, not loose words: matching the
 *  word "עלות" in a sentence would make this fail on a comment and get switched off within a month,
 *  which is how a check stops protecting anything. */
export const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  // One import rule covering both spellings — `@/lib/suppliers/…` and any relative path that
  // reaches it — so a violation is reported once, with one reason.
  { pattern: /from\s+["'][^"']*\/suppliers\//, why: "imports the cost domain" },
  { pattern: /\bcostPrice\b/, why: "reads the studio's cost" },
  { pattern: /\bcost_price\b/, why: "reads the studio's cost column" },
  { pattern: /\bfetchEventMargin\b/, why: "reads the event's margin" },
  { pattern: /\bfetchProcurement\b/, why: "reads the procurement forecast" },
];

const SOURCE = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a listed path that does not exist yet is not a violation
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(entry)) out.push(full);
  }
  return out;
}

export interface Violation {
  file: string;
  why: string;
  line: number;
}

/** Scan the client-facing surfaces for references to the cost side. `root` is the repo root. */
export function scanCostBoundary(root: string): Violation[] {
  const violations: Violation[] = [];
  for (const area of CLIENT_FACING) {
    for (const file of walk(join(root, ...area.split("/")))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(text)) {
            violations.push({ file: relative(root, file).split(sep).join("/"), why, line: i + 1 });
          }
        }
      });
    }
  }
  return violations;
}

// ponytail: self-check. Run: npm run check:costs
if (isMain(import.meta.url)) {
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
}
