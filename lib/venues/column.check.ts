// npm run check:column — the self-check of ./column.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type StructureFeature, type VenueStructure } from "./structure";
import { canDefineColumns, columnFromStack, columnOf, columnPatch, columnStacks, defineColumns } from "./column";

// ponytail: self-check. Run: npm run check:column
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
// A new column: a 60cm plinth, a ⌀50 base, a ⌀40 shaft.
const fresh = columnOf({ widthMm: 600, depthMm: 600 });
assert(fresh.plinth && fresh.baseMm === 500 && fresh.shaftMm === 400 && !fresh.square, "a new column has a plinth, a base and a round shaft");
assert(columnOf({ widthMm: 400, depthMm: 400, column: { shaftMm: 900 } }).shaftMm === 400 && !columnOf({ widthMm: 400, depthMm: 400, column: { shaftMm: 900 } }).plinth, "a shaft is never wider than its plinth — filling it, there is no plinth");
assert(columnOf({ widthMm: 600, depthMm: 600, column: { shaftMm: 400, baseMm: 300 } }).baseMm === null, "a base no wider than the shaft is none");
assert(columnPatch({ widthMm: 600, depthMm: 600 }, { baseMm: 0 }).column.baseMm === undefined, "…and clearing it stores none");
assert(columnPatch({ widthMm: 600, depthMm: 600 }, { shaftMm: 333.3, square: true }).column.shaftMm === 333 && columnPatch({ widthMm: 600, depthMm: 600 }, { square: true }).column.square === true, "a patch writes whole mm and the square switch");

// אמרה's way of drawing one: a 2m square turned 96°, a ⌀1.5 round, a ⌀0.8 round, all 9m — and a
// ring-beam piece and a wall nearby that are not columns.
const base = { kind: "structure" as const, label: "", heightMm: 9000, rotationDeg: 0 };
const stack: StructureFeature[] = [
  { ...base, id: "p", x: 1000, y: 1000, widthMm: 2000, depthMm: 2000, shape: "rect", rotationDeg: 96, locked: true, style: { fill: "#fbf9f4" } },
  { ...base, id: "b", x: 1000, y: 1000, widthMm: 1500, depthMm: 1500, shape: "circle", locked: true },
  { ...base, id: "s", x: 1001, y: 999, widthMm: 800, depthMm: 800, shape: "circle", locked: true },
];
const beam: StructureFeature = { ...base, id: "beam", x: 1000, y: 1000, widthMm: 6000, depthMm: 1400, shape: "rect" };
const wall: StructureFeature = { ...base, id: "wall", x: 8000, y: 0, widthMm: 400, depthMm: 400, shape: "rect", heightMm: 1000 };
const pool: StructureFeature = { ...base, id: "pool", kind: "pool", x: 1000, y: 1000, widthMm: 3000, depthMm: 3000, shape: "circle", heightMm: 0 };
const stacks = columnStacks([...stack, beam, wall, pool]);
assert(stacks.length === 1 && stacks[0].members.map((m) => m.id).join() === "p,b,s", `one stack, biggest first (${stacks.map((s) => s.members.map((m) => m.id).join()).join(" | ")})`);
const col = columnFromStack(stacks[0].members);
assert(col.kind === "column" && col.rotationDeg === 96 && col.widthMm === 2000 && col.shape === "rect", "the column is the plinth's place, turn and size");
assert(col.column?.shaftMm === 800 && col.column.baseMm === 1500 && !col.column.square && col.heightMm === 9000, "…its shaft and base read off the rounds");
assert(col.locked === true && col.style?.fill === "#fbf9f4", "…its lock and look carried");

const s: VenueStructure = { nodes: [], walls: [], entrances: [], features: [pool, ...stack, beam, wall] };
const defined = defineColumns(s, ["p", "b", "s", "beam", "pool"]);
assert(defined.ids.join() === "p" && defined.structure.features.map((f) => f.id).join() === "pool,p,beam,wall", `the stack becomes one column where its plinth stood, under its id; the rest stays (${defined.structure.features.map((f) => f.id).join()})`);
assert(defined.structure.features.find((f) => f.id === "p")?.kind === "column", "…and it is a column");
assert(canDefineColumns([stack[0], stack[2]]) && !canDefineColumns([beam, pool]) && canDefineColumns([wall]), "define is offered for a stack, or one built piece alone");
const one = defineColumns(s, ["wall"]);
const lone = one.structure.features.find((f) => f.id === "wall")!;
assert(lone.kind === "column" && !columnOf(lone).plinth && lone.column?.square === true, "one square piece alone is a plain square pillar");
assert(defineColumns(s, ["beam", "pool"]).ids.length === 0, "…and nothing that is not a stack changes");
console.log("venue columns ok");
