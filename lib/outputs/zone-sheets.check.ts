// npm run check:zone-sheets — the self-check of ./zone-sheets.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { EventPlan } from "@/lib/events/plan";
import type { ResolvedZone } from "@/lib/venues/zone";
import { zonesBounds } from "@/lib/venues/zone";
import type { Point } from "@/lib/studio/hall";
import { zoneSheets } from "./zone-sheets";

// ponytail: self-check. Run: npm run check:zone-sheets
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const square = (x: number, y: number, s: number): Point[] => [
  { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
];
const zone = (id: string, boundary: Point[]) =>
  ({ zone: { id, name: id } as unknown as ResolvedZone["zone"], boundary, detached: false }) as ResolvedZone;
const hall = zone("hall", square(0, 0, 10000));
const garden = zone("garden", square(20000, 0, 10000));
const terrace = zone("terrace", square(0, 40000, 5000));
const plan = { zones: [hall, garden, terrace], bounds: zonesBounds([hall, garden, terrace]), structure: { nodes: [], walls: [], entrances: [], features: [] } } as unknown as EventPlan;
const table = (id: string, x: number, y: number, groupId?: string) =>
  ({ id, number: Number(id.slice(1)), position: { x, y }, rotation: 0, groupId }) as unknown as DesignDocumentContent["tables"][number];
const doc = {
  tables: [table("t1", 2000, 2000), table("t2", 25000, 5000), table("t3", 15500, 5000)],
  groups: [],
  placements: [
    { id: "bar", layer: "floor", position: { x: 26000, y: 1000 } },
    { id: "vase", layer: "table", tableId: "t1", position: { x: 99999, y: 99999 } },
  ],
} as unknown as DesignDocumentContent;

const sheets = zoneSheets(doc, plan);
assert(sheets.length === 2, "the empty terrace prints no sheet");
const [h, g] = sheets;
assert(h.zone?.zone.id === "hall" && g.zone?.zone.id === "garden", "sheets follow the event's own zone order");
assert(h.doc.tables.map((t) => t.id).join() === "t1", "the hall carries its own table");
assert(g.doc.tables.map((t) => t.id).sort().join() === "t2,t3", "a table outside every zone goes to the nearest one");
assert(g.doc.tables.find((t) => t.id === "t3")!.number === 3, "a table keeps its number on its zone's sheet");
assert(h.doc.placements.some((p) => p.id === "vase"), "a table's dressing goes where its table is, not where its own position says");
assert(g.doc.placements.some((p) => p.id === "bar"), "a floor item goes to the zone it stands in");
assert(h.bounds.widthMm === 10000 && h.bounds.heightMm === 10000, "a sheet frames its own zone, not the union");
assert(g.bounds.minX === 15500, "…grown to take in what was assigned to it from outside");

const one = zoneSheets(doc, { ...plan, zones: [hall] } as EventPlan);
assert(one.length === 1 && one[0].doc === doc, "a single-zone event prints its whole document on one sheet");
const none = zoneSheets({ ...doc, tables: [], placements: [] }, plan);
assert(none.length === 3, "with nothing drawn yet every zone still prints its room");
console.log("zone-sheets self-check passed");
