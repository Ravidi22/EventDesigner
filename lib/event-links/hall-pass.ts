// The designer's sketch as the VENUE may see it: the plain hall sketch, not the design one
// (2026-10-30, the user: "the בעל האולם can see the sketch — not the design one — the plain sketch
// that the designer did").
//
// Exactly the studio's hall pass (HALL_PASS_GROUPS, the same rule studio-screen's `shownInPass`
// draws by): tables and their chairs, stages, bars — the room's furniture, which is what a hall
// sets out and staffs. Every design item is DROPPED from the document, not hidden: a cloth, a
// centrepiece, a chandelier or a chuppah is the designer's work and never leaves the studio. A
// placement whose row is unknown here is dropped too — on this side of the line, unknown is not
// furniture. The tables keep their own fields; table-wide design (a chosen chair, a cloth's look)
// is not on the table row but in what this removes.
//
// PURE. Safe anywhere.
import { CATEGORY_BY_ID, HALL_PASS_GROUPS } from "@/lib/catalog/categories";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { isMain } from "../self-check";

export function hallPassOf(doc: DesignDocumentContent, categoryOf: (variantId: string) => string | undefined): DesignDocumentContent {
  return {
    calibration: doc.calibration,
    tables: doc.tables,
    groups: doc.groups,
    features: doc.features,
    placements: doc.placements.filter((p) => {
      if (p.stage) return true;
      if (p.tableId || p.perch) return false;
      const category = categoryOf(p.variantId);
      const group = category ? CATEGORY_BY_ID[category]?.group : undefined;
      return !!group && HALL_PASS_GROUPS.includes(group);
    }),
  };
}

// ponytail: self-check. Run: npm run check:event-links
if (isMain(import.meta.url)) {
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
}
