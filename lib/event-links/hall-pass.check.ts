// npm run check:event-links — the self-check of ./hall-pass.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { hallPassOf } from "./hall-pass";

// ponytail: self-check. Run: npm run check:event-links
const assert = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
  console.log(`  ok   ${what}`);
};
const base = { layer: "floor" as const, quantity: 1, position: { x: 0, y: 0 } };
const doc = {
  calibration: { mmPerUnit: 1 },
  tables: [{ id: "t1" }],
  placements: [
    { ...base, id: "bar", variantId: "v-bar" },
    { ...base, id: "cloth", variantId: "v-cloth", layer: "table" as const, tableId: "t1" },
    { ...base, id: "chuppah", variantId: "v-chuppah" },
    { ...base, id: "ghost", variantId: "v-unknown" },
    { ...base, id: "stage", variantId: "v-chuppah", stage: { outline: [] } },
  ],
  exceptions: [{ secret: true }],
} as unknown as DesignDocumentContent;
const cat: Record<string, string> = { "v-bar": "bars", "v-cloth": "tablecloths", "v-chuppah": "chuppahs" };
const out = hallPassOf(doc, (v) => cat[v]);
const ids = out.placements.map((p) => p.id).join();
assert(ids === "bar,stage", "furniture and stages stay; dressing, design items and unknown rows go");
assert(out.tables.length === 1, "every table stays");
assert(!("exceptions" in out), "nothing beyond the drawing crosses");
console.log("hall pass self-check passed");
