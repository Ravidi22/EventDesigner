// npm run check:item-scene — the self-check of ./item-scene.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "@/lib/catalog/types";
import { emptyDocument } from "@/lib/design-document/types";
import { resolve, withResolved } from "@/lib/studio/catalog-resolver";
import { ceilingUndersideMm } from "./overhead";
import { type BodyNode, type Viewpoint } from "./types";
import { CLOSE_UP, closeUp, compositionScene, compositionSceneKey, ITEM_ID, ITEM_ROOM_MARGIN_MM, itemBaseZ, itemScene } from "./item-scene";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
// A small piece is looked at from close by; a big one from where the portrait stands.
const far: Viewpoint = { id: "f", name: "f", eye: { x: 0, y: 2000, z: 1750 }, look: { x: 0, y: 0, z: 250 }, fovDeg: 50 };
const near = closeUp(far, 500);
const dist = (v: Viewpoint) => Math.hypot(v.eye.x - v.look.x, v.eye.y - v.look.y, v.eye.z - v.look.z);
assert(Math.abs(dist(near) - 1300) < 1 && near.look === far.look && Math.abs(near.eye.y / (near.eye.z - 250) - 2000 / 1500) < 1e-9, "a 50 cm piece is looked at from 1.3 m, on the same bearing and pitch");
assert(closeUp(far, 3000) === far && Math.abs(dist(closeUp(far, 100)) - CLOSE_UP.nearestMm) < 1, "a big piece keeps the portrait; the eye never comes nearer than 65 cm");
const row = (over: Partial<Product>): Product => ({ id: "draft", name: "בר עם גב", category: "other", layer: "floor", dimensions: { widthMm: 3000, depthMm: 600, heightMm: 1100 }, categoryFields: {}, styleTags: [], variants: [], ...over });

// The bar of the spec's first proving item, unsaved: a counter, a back-bar 2 m high, a shelf a
// metre up it — drawn through the element model's fallback, found by the builder though it is in
// no catalog.
const bar = row({
  appearance: {
    shape: "rect",
    content: "none",
    parts: [
      { id: "back", shape: "rect", widthMm: 3000, depthMm: 400, x: 0, y: -900, rotation: 0, heightMm: 2000 },
      { id: "shelf", shape: "rect", widthMm: 3000, depthMm: 250, x: 0, y: -800, rotation: 0, zMm: 1000, heightMm: 40 },
    ],
  },
});
const { scene, focus } = itemScene(bar);
const bodies = scene.nodes.filter((n): n is BodyNode => n.kind === "body");
const item = bodies.filter((b) => b.tag.id === ITEM_ID);
assert(item.length === 1 && item[0].parts.length === 3, `the unsaved bar is in the room as one body of three parts (${item.length} bodies, ${item[0]?.parts.length} parts)`);
const tops = item[0].parts.map((q) => q.at.z + ("h" in q ? q.h : 0));
assert(tops.includes(1100) && tops.includes(2000) && tops.includes(1040), `…the counter 1.1 m, the back-bar 2 m, the shelf's top at 1.04 m (${tops})`);
assert(bodies.some((b) => b.tag.type === "ground"), "a ground to stand on");
assert(scene.bounds.widthMm === 3000 + 2 * ITEM_ROOM_MARGIN_MM && scene.bounds.heightMm === 1400 + 2 * ITEM_ROOM_MARGIN_MM, "the floor is the item plus the margin");
assert(!!focus && focus.look.z > 0 && focus.eye.z > focus.look.z, "a place to look at it from, above it");

// SH-1 (QA 2026-11-20): a NEW table — no id yet, no shade — is built as drawn. Its variant id was
// "", which every table reader reads as "no catalog row", so the room drew a 160×90 timber
// rectangle at 75 cm whatever the editor said (a 120 cm hexagon here).
const fresh = row({ id: "", name: "", category: "tables", dimensions: { widthMm: 1600, depthMm: 900, heightMm: 1200 }, appearance: { shape: "hexagon", content: "none" } });
const freshBody = itemScene(fresh).scene.nodes.find((n): n is BodyNode => n.kind === "body" && n.tag.type === "table")!;
const freshTop = freshBody?.parts.find((q): q is Extract<typeof q, { shape: "extrude" }> => q.shape === "extrude");
assert(!!freshTop && freshTop.outline.outline.length === 6 && freshTop.at.z === 1200 - 30, `an unsaved table stands as drawn: a hexagon, 120 cm high (${freshTop?.outline.outline.length} corners at ${freshTop?.at.z})`);
assert(resolve("") === undefined, "…and nothing of it is left in the resolver");

// A table row seats its chairs round it.
const table = row({ id: "tbl", name: "עגול 180", category: "tables", dimensions: { diameterMm: 1800, heightMm: 750 }, categoryFields: { seats: 10 } });
const t = itemScene(table);
const tb = t.scene.nodes.filter((n): n is BodyNode => n.kind === "body");
assert(tb.some((b) => b.tag.type === "table"), "a table row is a table");
assert(tb.filter((b) => b.tag.type === "chair").reduce((n, b) => n + b.instances.length, 0) === 10, "…with its ten chairs");

// A composite's arrangement: two tables apart, framed together, on a floor round both.
const two = emptyDocument();
two.tables.push({ id: "a", type: "עגול 180", number: 1, position: { x: 0, y: 0 }, rotation: 0, diameterMm: 1800, seats: 10 });
two.tables.push({ id: "b", type: "עגול 180", number: 2, position: { x: 4000, y: 0 }, rotation: 0, diameterMm: 1800, seats: 10 });
const c = compositionScene(two)!;
assert(c !== null && c.scene.nodes.filter((n): n is BodyNode => n.kind === "body" && n.tag.type === "table").length === 2, "a composite of two tables stands both in the room");
assert(c.scene.bounds.widthMm === 4000 + 1800 + 2 * ITEM_ROOM_MARGIN_MM && Math.abs((c.scene.bounds.minX + c.scene.bounds.maxX) / 2 - 2000) < 1e-6, "…on a floor round the lot, centred on it");
assert(!!c.focus && Math.abs(c.focus.look.x - 2000) < 600, `…looked at about the middle of the two (${c.focus?.look.x})`);
assert(compositionScene(emptyDocument()) === null, "an empty arrangement is no room");
assert(compositionSceneKey(two) !== compositionSceneKey(emptyDocument()), "the key names the pieces");

// A composite of two CEILING items on one point — a drum shade with a crystal cascade under it (the
// user's photograph, 2026-11-08: "a combination of a couple of products") — hangs each at its own
// height: this placement's hang height, else its row's, so one stands under the other.
const drum = row({ id: "drum", name: "אהיל תוף 120", category: "chandeliers", layer: "ceiling", dimensions: { diameterMm: 1200, heightMm: 300 }, categoryFields: { arms: 6, hangHeightMm: 3000 }, appearance: { shape: "circle", content: "none", symbolStyle: "drums", chandelier: { tiers: 1 } } });
const cascade = row({ id: "cascade", name: "מפל קריסטל 90", category: "chandeliers", layer: "ceiling", dimensions: { diameterMm: 900, heightMm: 900 }, categoryFields: { arms: 8 }, appearance: { shape: "circle", content: "none", symbolStyle: "prisms" } });
const stacked = emptyDocument();
stacked.placements.push({ id: "p-drum", variantId: "drum", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
stacked.placements.push({ id: "p-cascade", variantId: "cascade", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, hangHeightMm: 2100 });
const pair = withResolved([drum, cascade], () => compositionScene(stacked))!;
const hung = (id: string) => pair.scene.nodes.find((n): n is BodyNode => n.kind === "body" && n.tag.id === id)!;
assert(!!hung("p-drum") && !!hung("p-cascade"), "a composite of two ceiling items on one point builds both");
assert(hung("p-drum").instances[0].at.z === 3000 && hung("p-cascade").instances[0].at.z === 2100, `…the drum at its row's 3 m, the cascade at this placement's 2.1 m under it (${hung("p-drum").instances[0].at.z}, ${hung("p-cascade").instances[0].at.z})`);
assert(hung("p-drum").parts.some((q) => q.shape === "cylinder" && q.material?.kind === "emissive") && hung("p-cascade").parts.some((q) => q.shape === "cylinder" && q.material?.kind === "crystal"), "…each in its own style: a lit drum, rods of cut crystal");

// A chandelier whose first shape has a BODY (the "גוף" chip, an urn): the body is its silhouette —
// its tiers follow it — and never a solid. Before 2026-11-08 the room built an opaque urn the size
// of the whole piece and the arms, the candles and the crystal vanished inside it.
const urn = [{ r: 0.45, z: 0 }, { r: 0.4, z: 0.08 }, { r: 0.95, z: 0.4 }, { r: 1, z: 0.6 }, { r: 0.75, z: 0.9 }, { r: 0.85, z: 1 }];
const bodied = row({ id: "urn-ch", name: "שנדליר עם גוף", category: "chandeliers", layer: "ceiling", dimensions: { diameterMm: 1000, heightMm: 900 }, categoryFields: { arms: 8 }, appearance: { shape: "circle", content: "none", revolve: urn, chandelier: { tiers: 3 } } });
const ub = itemScene(bodied).scene.nodes.find((n): n is BodyNode => n.kind === "body" && n.tag.id === ITEM_ID)!;
assert(!!ub && !ub.parts.some((q) => q.shape === "lathe" && Math.max(...q.profile.map((p) => p.r)) > 500 * 0.5), "a chandelier's body is no solid in the room");
const candles = ub.parts.filter((q) => q.shape === "cylinder" && q.material?.colour === "#f4efe4");
assert(candles.length > 8 && new Set(candles.map((q) => Math.round(Math.hypot(q.at.x, q.at.y)))).size === 3, `…its three tiers of candles stand, each at the silhouette's width (${candles.length})`);

// The same for a flower arrangement and a chuppah (2026-11-09): the body is the arrangement's
// envelope, the chuppah's roof — never an opaque lathe the size of the piece with the flowers, the
// posts and the cloth inside it.
const solidOf = (b: BodyNode, R: number) => b.parts.some((q) => q.shape === "lathe" && Math.max(...q.profile.map((p) => p.r)) > R * 0.5);
const bodyOf = (p: Product) => itemScene(p).scene.nodes.filter((n): n is BodyNode => n.kind === "body" && n.tag.id === ITEM_ID);
const arrangement = row({ id: "urn-fl", name: "סידור עם גוף", category: "flower-arrangements", layer: "table", dimensions: { diameterMm: 600, heightMm: 700 }, categoryFields: {}, appearance: { shape: "circle", content: "none", revolve: urn } });
const fb = bodyOf(arrangement);
assert(fb.length > 0 && !fb.some((b) => solidOf(b, 300)), "an arrangement's body is its envelope, never a solid");
const chuppahRow = row({ id: "urn-chp", name: "חופה עם גוף", category: "chuppahs", layer: "floor", dimensions: { diameterMm: 3000, heightMm: 2800 }, categoryFields: {}, appearance: { shape: "circle", content: "none", revolve: urn } });
const cb = bodyOf(chuppahRow);
assert(cb.length > 0 && !cb.some((b) => solidOf(b, 1500)) && cb.some((b) => b.parts.some((q) => q.shape === "sheet")), "a chuppah's body is its roof's section — a cloth sheet over the posts, never a solid");

// A table row with a shape that has a height of its own: the top is the recipe's, the raised
// shape the element model's, beside it — in the same body, at its own z.
const shelfTable = row({
  id: "tbl2",
  name: "שולחן עם מדף",
  category: "tables",
  dimensions: { widthMm: 1800, depthMm: 800, heightMm: 750 },
  categoryFields: { seats: 6 },
  appearance: { shape: "rect", content: "none", parts: [{ id: "shelf", shape: "rect", widthMm: 1800, depthMm: 300, x: 0, y: -700, rotation: 0, zMm: 1200, heightMm: 40 }] },
});
const st = itemScene(shelfTable);
const tableBody = st.scene.nodes.find((n): n is BodyNode => n.kind === "body" && n.tag.type === "table")!;
const shelf = tableBody.parts.find((q) => q.at.z === 1200);
assert(!!shelf && shelf.shape === "extrude" && (shelf as { h: number }).h === 40, "a table's raised shape stands at its own height in the table's body");
assert(tableBody.parts.filter((q) => q.shape === "extrude" && q.at.z === 750 - 30).length === 1, "…and the top is the table's own shape alone, not the shelf's too");

// SH-2 (QA 2026-11-20): a table's shapes keep the look and the body they were given. The top was
// built of every shape in the table's timber — a shape's own colour or texture, and "מתאר בלבד"
// on the first shape, never reached the room.
const topOf = (p: Product) => itemScene(p).scene.nodes.find((n): n is BodyNode => n.kind === "body" && n.tag.type === "table")!.parts.filter((q) => q.shape === "extrude" && q.at.z === 750 - 30);
const painted = row({
  id: "tbl3",
  category: "tables",
  dimensions: { widthMm: 1800, depthMm: 900, heightMm: 750 },
  appearance: { shape: "rect", content: "none", baseStyle: { fill: "#111111" }, parts: [{ id: "end", shape: "circle", diameterMm: 900, x: 900, y: 0, rotation: 0, texture: "marble" }] },
});
const paintedTop = topOf(painted);
assert(paintedTop.length === 2 && paintedTop[0].material?.colour === "#111111" && paintedTop[1].material?.texture === "marble", `each shape of the top in its own look: the black counter, the marble end (${JSON.stringify(paintedTop.map((q) => q.material))})`);
const plainBlack = row({ id: "tbl4", category: "tables", dimensions: { widthMm: 1800, depthMm: 900, heightMm: 750 }, appearance: { shape: "rect", content: "none", baseStyle: { fill: "#111111" } } });
const plainBlackBody = itemScene(plainBlack).scene.nodes.find((n): n is BodyNode => n.kind === "body" && n.tag.type === "table")!;
assert(plainBlackBody.parts.filter((q) => q.shape === "box" || q.shape === "cylinder").length >= 4, "…a plain rectangle in its own colour still stands on its four legs");
const outlineOnly = row({
  id: "tbl5",
  category: "tables",
  dimensions: { widthMm: 2400, depthMm: 1200, heightMm: 750 },
  appearance: { shape: "rect", content: "none", body: "none", parts: [{ id: "top", shape: "circle", diameterMm: 1000, x: 0, y: 0, rotation: 0 }] },
});
const outlineTop = topOf(outlineOnly);
assert(outlineTop.length === 1 && outlineTop[0].shape === "extrude" && Math.abs(Math.max(...outlineTop[0].outline.outline.map((v) => v.x)) - Math.min(...outlineTop[0].outline.outline.map((v) => v.x)) - 1000) < 1, `an outline-only first shape is no top: the round is (${outlineTop.length} tops)`);

// Where the item's own floor stands in its room — the side views' z 0 (lib/element/elevation.ts
// orthoFrame): the floor for a floor row, a hung row's underside — its row's hang height, else
// the open sky's default — so the boxes and the room under them line up.
assert(itemBaseZ(bar) === 0, "a floor row's own floor is the room's");
assert(itemBaseZ(drum) === 3000, "a hung row's own floor is its hang height");
assert(itemBaseZ(cascade) === ceilingUndersideMm(null, 0), "…else the open sky's default underside");

// Nothing of the draft is left in the resolver afterwards.
assert(resolve("draft") === undefined && resolve("tbl") === undefined, "the draft resolves only for the span of the build");
// AN AISLE (2026-11-13, lib/catalog/aisle.ts): its runner, and the piece that lines it built at every
// spot as its own row — six columns a side on an 8 m walk, the far side turned to look back.
const post = row({ id: "aisle-post", name: "עמוד", category: "columns", dimensions: { diameterMm: 400, heightMm: 1800 }, appearance: { shape: "circle", content: "none" } });
const walk = row({ id: "aisle-walk", name: "שדרה", category: "aisles", dimensions: { widthMm: 8000, depthMm: 3000, heightMm: 0 }, categoryFields: { piece: "aisle-post" }, appearance: { shape: "rect", content: "none" } });
const walked = withResolved([post], () => itemScene(walk)).scene.nodes.filter((n): n is BodyNode => n.kind === "body");
const idOf = (n: BodyNode) => ("id" in n.tag && typeof n.tag.id === "string" ? n.tag.id : "");
const lined = new Set(walked.map(idOf).filter((id) => id.startsWith(`${ITEM_ID}~`)));
assert(lined.size === 12, `an aisle builds its piece at every spot (${lined.size})`);
const ys = walked.filter((n) => lined.has(idOf(n))).flatMap((n) => n.instances.map((t) => Math.round(t.at.y)));
assert(Math.min(...ys) === -1300 && Math.max(...ys) === 1300, `…down both sides, inside its long edges (${Math.min(...ys)}…${Math.max(...ys)})`);
assert(walked.some((n) => n.parts.some((q) => q.shape === "box" && q.w === 8000 && q.material?.kind === "fabric")), "…with its runner down the walk");
const bare = itemScene(row({ ...walk, id: "aisle-bare", categoryFields: {} })).scene.nodes.filter((n): n is BodyNode => n.kind === "body");
assert(bare.some((n) => idOf(n) === ITEM_ID) && !bare.some((n) => idOf(n).startsWith(`${ITEM_ID}~`)), "an aisle with no piece chosen is its runner alone");

console.log("item scene self-check passed");
