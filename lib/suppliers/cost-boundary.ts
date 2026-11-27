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
  // What the client's sketch draws its delta and its change list with — shared with the studio's
  // review, and read on a client's phone.
  "lib/proposals",
  "lib/notifications",
  // The 3D scene: built once, drawn on the designer's tab, the meeting, the client portal and the
  // no-login share link — the same builder for all four, so the builder itself is client-facing.
  "lib/scene",
  "components/scene",
  "app/(app)/scene",
  "app/v",
  // The element model: one definition read by the sketch, the print, the room and the client's
  // surfaces alike (spec 2026-11-07-element-model §3) — no price may ever enter it.
  "lib/element",
];

/** What none of them may reference. Import paths and identifiers, not loose words: matching the
 *  word "עלות" in a sentence would make this fail on a comment and get switched off within a month,
 *  which is how a check stops protecting anything. */
export const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  // One import rule covering both spellings — `@/lib/suppliers/…` and any relative path that
  // reaches it — so a violation is reported once, with one reason.
  { pattern: /from\s+["'][^"']*\/suppliers\//, why: "imports the cost domain" },
  { pattern: /from\s+["'][^"']*\/orders\//, why: "imports the orders (cost side)" },
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
