// npm run check:structures — the self-check of ./structures.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type StructureFeature } from "@/lib/venues/structure";
import { readStructures, shaftTopOf } from "./structures";

// ponytail: self-check. Run: npx tsx lib/scene/structures.ts
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
// A ring colonnade: 8 columns (a square plinth, a round base, a round shaft) on a 10m circle,
// under a ring beam of 8 band pieces — all 6m, as a venue draws it.
const fs: StructureFeature[] = [];
const base = { kind: "structure" as const, label: "", heightMm: 6000, rotationDeg: 0 };
const R = 10000;
for (let k = 0; k < 8; k++) {
  const a = (k * Math.PI) / 4;
  const x = R * Math.cos(a);
  const y = R * Math.sin(a);
  fs.push({ ...base, id: `p${k}`, x, y, widthMm: 1600, depthMm: 1600, shape: "rect", rotationDeg: k * 22.5 + 10 });
  fs.push({ ...base, id: `b${k}`, x: x + 3, y: y - 2, widthMm: 1200, depthMm: 1200, shape: "circle" });
  fs.push({ ...base, id: `s${k}`, x, y, widthMm: 700, depthMm: 700, shape: "circle" });
  // A band piece from this column's bearing to the next, 1.4m wide, as a custom outline.
  const a1 = a - Math.PI / 8;
  const a2 = a + Math.PI / 8;
  const ring = (r: number, t: number) => ({ x: r * Math.cos(t), y: r * Math.sin(t) });
  const arc = (r: number, from: number, to: number) => Array.from({ length: 7 }, (_, i) => ring(r, from + ((to - from) * i) / 6));
  const pts = [...arc(R + 700, a1, a2), ...arc(R - 700, a2, a1)];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const d = Math.max(...ys) - Math.min(...ys);
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const my = (Math.max(...ys) + Math.min(...ys)) / 2;
  fs.push({ ...base, id: `r${k}`, x: mx, y: my, widthMm: w, depthMm: d, shape: "custom", outline: pts.map((p) => ({ x: p.x - mx, y: p.y - my })) });
}
// A 1m garden wall with 3m pillars rising from it: a wall, not a beam.
fs.push({ ...base, id: "lowwall", x: -30000, y: 0, widthMm: 7000, depthMm: 900, shape: "rect", heightMm: 1000 });
fs.push({ ...base, id: "gatepost", x: -33000, y: 0, widthMm: 800, depthMm: 800, shape: "circle", heightMm: 3000 });
// And a plain wall that holds nothing, and a lone slender pillar.
fs.push({ ...base, id: "wall", x: 30000, y: 0, widthMm: 6000, depthMm: 200, shape: "rect" });
fs.push({ ...base, id: "pillar", x: 30000, y: 5000, widthMm: 500, depthMm: 500, shape: "circle", heightMm: 4000 });
// A venue column of its own (FeatureKind "column"): a 60cm plinth, a ⌀50 base, a ⌀40 shaft.
fs.push({ ...base, id: "col", kind: "column", x: 30000, y: 9000, widthMm: 600, depthMm: 600, shape: "rect", heightMm: 3000, column: { shaftMm: 400, baseMm: 500 } });
const r = readStructures(fs);
assert(r.columns.length === 11, `eight stacked columns, the gate post, the lone pillar and the venue's column (${r.columns.length})`);
const c0 = r.columns.find((c) => c.ids.includes("s0"))!;
assert(c0.ids.join() === "p0,b0,s0", `a stack reads plinth, base, shaft — biggest first (${c0.ids.join()})`);
assert(r.beams.length === 1 && r.beams[0].ids.length === 8, `the eight band pieces are ONE beam (${r.beams.map((b) => b.ids.length).join()} / roles ${[...r.role].map(([id, x]) => id + ":" + x.kind).join(" ")})`);
assert(r.beams[0].toMm === 6000 && r.beams[0].fromMm === 6000 - 660, "…the top 11% of their height");
assert(r.beams[0].columns.length === 8 && c0.beam === r.beams[0], "…carried by the eight columns under it");
assert(!r.role.has("wall"), "a wall that holds no column stays a solid");
assert(!r.role.has("lowwall") && r.role.get("gatepost")?.kind === "column", "a low garden wall stays a wall though a pillar rises from it");
assert(r.columns.every((c) => !c.ids.some((id) => id.startsWith("r"))), "no band piece of the ring is read as part of a column");
assert(shaftTopOf(c0) === 6000 - 660, "a column's shaft rises to the beam's underside");
const pillar = r.columns.find((c) => c.ids[0] === "pillar")!;
assert(!!pillar && shaftTopOf(pillar) === 4000, "a lone pillar stands to its own height");
const col = r.columns.find((c) => c.ids[0] === "col")!;
assert(!!col && col.members.map((m) => `${m.id}:${m.shape}:${m.widthMm}`).join() === "col:rect:600,col:base:circle:500,col:shaft:circle:400", `a venue column is its plinth, base and shaft (${col?.members.map((m) => m.id).join()})`);
assert(r.role.get("col")?.kind === "column" && shaftTopOf(col) === 3000, "…one column, to its own height");
const plain = readStructures([{ ...base, id: "plain", kind: "column", x: 0, y: 0, widthMm: 400, depthMm: 400, shape: "circle", heightMm: 3000, column: { shaftMm: 400 } }]).columns[0];
assert(plain.members.length === 1 && plain.members[0].id === "plain", "a column whose shaft fills it has no plinth");
console.log("scene structures ok");
