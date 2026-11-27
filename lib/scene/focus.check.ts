// npm run check:scene-focus — the self-check of ./focus.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import { type Bounds } from "@/lib/studio/geometry";
import { type VenueStructure } from "@/lib/venues/structure";
import type { ResolvedZone } from "@/lib/venues/zone";
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { PORTRAIT_BACK_MM, PORTRAIT_EYE_MM } from "./viewpoints";
import { focusViewpoint, TABLE_TOP_MM, type FocusRef } from "./focus";

// --- self-check -------------------------------------------------------------------------------------
const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    console.error(`check:scene-focus FAILED — ${msg}`);
    process.exit(1);
  }
};
const near = (a: number, b: number, eps = 1) => Math.abs(a - b) < eps;
const room: Point[] = [
  { x: 0, y: 0 },
  { x: 10000, y: 0 },
  { x: 10000, y: 10000 },
  { x: 0, y: 10000 },
];
const bounds: Bounds = { minX: 0, minY: 0, maxX: 10000, maxY: 10000, widthMm: 10000, heightMm: 10000 };
const zones = [{ zone: { id: "z", name: "אולם" }, boundary: room } as unknown as ResolvedZone];
const structure = { nodes: [], walls: [], entrances: [], features: [] } as unknown as VenueStructure;
const table = (id: string, x: number, y: number, groupId?: string): DesignTable =>
  ({ id, type: "round", number: 1, position: { x, y }, rotation: 0, diameterMm: 1800, seats: 10, ...(groupId ? { groupId } : {}) }) as DesignTable;
const placement = (id: string, extra: Partial<Placement>): Placement =>
  ({ id, variantId: "v-unknown", layer: "floor", quantity: 1, position: { x: 5000, y: 5000 }, rotation: 0, scale: 1, ...extra }) as Placement;
const doc = {
  tables: [table("t1", 2000, 2000), table("t2", 8000, 5000), table("h1", 4000, 8000, "g"), table("h2", 6000, 8000, "g")],
  placements: [
    placement("c1", { layer: "table", tableId: "t2", position: { x: 0, y: 0 } }),
    placement("ch", { layer: "ceiling", position: { x: 5000, y: 5000 }, hangHeightMm: 2800 }),
    // A swag from (1,1) to (9,7) m, 4 m down to 3 m, a metre deep — its placement left at a corner.
    placement("sw", { layer: "ceiling", position: { x: 500, y: 500 }, rail: { type: "run", a: { x: 1000, y: 1000 }, b: { x: 9000, y: 7000 }, heightMm: 4000, heightBMm: 3000, waves: 1, sagMm: 1000 } }),
    placement("s1", {
      position: { x: 5000, y: 2000 },
      stage: {
        outline: [
          { x: -2000, y: -1000 },
          { x: 2000, y: -1000 },
          { x: 2000, y: 1000 },
          { x: -2000, y: 1000 },
        ],
        front: 2,
        decks: [],
        heightMm: 400,
      } as unknown as Placement["stage"],
    }),
  ],
  groups: [],
} as unknown as DesignDocumentContent;
const at = (selection: FocusRef[]) => focusViewpoint({ doc, structure, zones, bounds, selection });

// One table: the tab's portrait — on the room's side of it, at standing height, looking at its top.
const one = at([{ kind: "table", id: "t1" }]);
assert(one && one.id === "focus:t1", "one table: id is the selection");
assert(one && near(one.look.x, 2000) && near(one.look.y, 2000) && near(one.look.z, TABLE_TOP_MM), "one table: looks at its top");
assert(one && near(one.eye.z, PORTRAIT_EYE_MM), "one table: eye at portrait height");
assert(one && one.eye.x > 2000 && one.eye.y > 2000, "one table: the eye is between the table and the room's middle");
// Its reach is the half-diagonal of its box, as the tab's portrait reads it (tablePortraits).
assert(one && near(Math.hypot(one.eye.x - 2000, one.eye.y - 2000), Math.hypot(1800, 1800) / 2 + PORTRAIT_BACK_MM, 2), "one table: stands reach + back off its centre");

// Two tables apart: framed together, from further back and higher.
const two = at([{ kind: "table", id: "t1" }, { kind: "table", id: "t2" }]);
assert(two && two.id === "focus:t1,t2", "two tables: both ids, sorted");
assert(two && near(two.look.x, 5000) && near(two.look.y, 3500), "two tables: looks at the middle of both");
assert(two && two.eye.z > PORTRAIT_EYE_MM, "two tables: the eye rises");
assert(
  two && one && Math.hypot(two.eye.x - 5000, two.eye.y - 3500) > Math.hypot(one.eye.x - 2000, one.eye.y - 2000),
  "two tables: stands further back",
);

// A block selected by two members is one subject, with the block's reach.
const block = at([{ kind: "table", id: "h1" }, { kind: "table", id: "h2" }]);
assert(block && block.id === "focus:h1,h2" && near(block.look.x, 5000) && near(block.look.y, 8000), "a block: one subject at the block's centre");
const member = at([{ kind: "table", id: "h1" }]);
assert(member && near(member.look.x, 5000) && near(member.look.y, 8000), "one member of a block: the whole block");

// An item on a table is the table.
const dressing = at([{ kind: "placement", id: "c1" }]);
assert(dressing && near(dressing.look.x, 8000) && near(dressing.look.y, 5000) && near(dressing.look.z, TABLE_TOP_MM), "an item on a table: the table's portrait");

// A chandelier is looked at where it hangs, from standing height.
const hung = at([{ kind: "placement", id: "ch" }]);
assert(hung && near(hung.look.z, 2800) && near(hung.eye.z, PORTRAIT_EYE_MM), "a ceiling item: looked at at its hang height");

// A swag is looked at where its rail is — its middle, between its line and its lowest point — from
// far enough back to hold its length.
const swag = at([{ kind: "placement", id: "sw" }]);
assert(swag && near(swag.look.x, 5000) && near(swag.look.y, 4000) && swag.look.z > 2500 && swag.look.z < 3500, `a swag: looked at at its rail's middle, under its line (${swag?.look.z})`);
assert(swag && Math.hypot(swag.eye.x - 5000, swag.eye.y - 4000) >= 5000, "…from at least its half-length away");

// A stage at its deck.
const stage = at([{ kind: "placement", id: "s1" }]);
assert(stage && near(stage.look.z, 400), "a stage: looked at at its deck");

// Nothing to look at.
assert(at([]) === null, "empty selection: null");
assert(at([{ kind: "table", id: "nope" }, { kind: "feature", id: "nope" }]) === null, "unknown ids: null");

console.log("check:scene-focus ok");
