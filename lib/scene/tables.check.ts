// npm run check:tables — the self-check of ./tables.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "@/lib/catalog/types";
import type { DesignDocumentContent, Placement } from "@/lib/design-document/types";
import { CHAIR_D_MM } from "@/lib/studio/seating";
import { resolve } from "@/lib/studio/catalog-resolver";
import { CLOTH_DROP_MM } from "@/lib/catalog/symbols";
import { DEFAULT_TONE } from "@/components/item-symbol";
import { primeCatalog } from "@/lib/catalog/storage";
import { SceneCollector } from "./collect";
import { applyTransform } from "./frame";
import { type BodyNode, type LabelNode, transform, vec3 } from "./types";
import { BARE_TABLE_TONE, CLOTH_THICK_MM, clothHemParts, clothParts, hemBands, itemContextOf, LEG_INSET_MM, LEG_MM, offsetOutline, polySize, tableNodes } from "./tables";

// ponytail: self-check. Run: npx tsx lib/scene/tables.ts
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const isBody = (n: { kind: string }): n is BodyNode => n.kind === "body";
const isLabel = (n: { kind: string }): n is LabelNode => n.kind === "label";

{
  const round: Product = { id: "tbl-round", name: "שולחן עגול 180", category: "tables", layer: "floor", dimensions: { diameterMm: 1800, heightMm: 750 }, categoryFields: { seats: 10 }, styleTags: [], variants: [] };
  const rect: Product = { id: "tbl-rect", name: "שולחן מלבן 240×120", category: "tables", layer: "floor", dimensions: { widthMm: 2400, depthMm: 1200, heightMm: 750 }, categoryFields: { seats: 8 }, styleTags: [], variants: [] };
  const chair: Product = {
    id: "chair",
    name: "כיסא נפוליאון",
    category: "chairs",
    layer: "floor",
    dimensions: { widthMm: 450, depthMm: 500, heightMm: 900 },
    categoryFields: {},
    styleTags: [],
    variants: [{ id: "chair-ivory", name: "שנהב", swatch: "#f7f6fc" }],
    appearance: { shape: "rect", content: "none", symbolStyle: "chiavari" },
  };
  const cloth: Product = { id: "cloth", name: "מפה עגולה", category: "tablecloths", layer: "table", dimensions: { diameterMm: 3000, heightMm: 0 }, categoryFields: {}, styleTags: [], variants: [{ id: "cloth-plum", name: "חציל", swatch: "#4b3a6e" }] };
  const candle: Product = { id: "candle", name: "פמוט 5 קנים", category: "candlesticks", layer: "table", dimensions: { widthMm: 300, depthMm: 300, heightMm: 600 }, categoryFields: { arms: 5 }, styleTags: [], variants: [] };
  primeCatalog([round, rect, chair, cloth, candle]);

  const onTable = (id: string, variantId: string, tableId: string): Placement => ({ id, variantId, layer: "table", quantity: 1, tableId, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });

  // One round table, dressed: a cloth and two candlesticks.
  const doc: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [{ id: "t1", type: "round", number: 1, position: { x: 5000, y: 5000 }, rotation: 0, seats: 10, variantId: "tbl-round" }],
    placements: [onTable("p-cloth", "cloth-plum", "t1"), onTable("p-c1", "candle", "t1"), onTable("p-c2", "candle", "t1")],
  };
  const out = new SceneCollector();
  tableNodes({ doc, author: true }, out, () => 0);
  const nodes = out.nodes();
  const bodies = nodes.filter(isBody);

  const chairs = bodies.filter((b) => b.tag.type === "chair");
  assert(chairs.length === 1, `ten chairs of one style and shade are ONE body (got ${chairs.length})`);
  assert(chairs[0].id.startsWith("i:chair:chiavari:#f7f6fc"), `the chair body is keyed by style and shade (${chairs[0].id})`);
  assert(chairs[0].instances.length === 10, `…with ten instances (got ${chairs[0].instances.length})`);
  for (const inst of chairs[0].instances) {
    const front = applyTransform(transform(vec3(0, 0, 0), inst.rotationDeg, !!inst.mirrored), vec3(0, 1, 0));
    const toCentre = { x: 5000 - inst.at.x, y: 5000 - inst.at.y };
    const len = Math.hypot(toCentre.x, toCentre.y);
    const cos = (front.x * toCentre.x + front.y * toCentre.y) / len;
    assert(cos > Math.cos((2 * Math.PI) / 180), `every chair's front (+y in its frame) points at the table centre within 2° (chair at ${Math.round(inst.at.x)},${Math.round(inst.at.y)} turned ${inst.rotationDeg.toFixed(1)}°)`);
    assert(near(inst.at.z, 0), "a chair stands on the floor");
    assert(near(len, 900 + CHAIR_D_MM / 2 - 110, 15), "…tucked under the rim as the plan tucks it (CHAIR_OFFSET_MM out from the edge)");
  }

  const table = bodies.find((b) => b.tag.type === "table");
  assert(!!table && table.instances.length === 1 && near(table.instances[0].at.x, 5000) && near(table.instances[0].at.y, 5000), "the table body stands at the table's position");
  const top = table!.parts.find((p) => p.shape === "extrude");
  assert(!!top && top.shape === "extrude" && near(top.at.z, 720) && near(top.h, 30 - CLOTH_THICK_MM), "the top is extruded from 720 — its face at the table height, a fabric's thickness under the cloth");
  assert(table!.parts.filter((p) => p.shape === "cylinder").length === 2, "a round table stands on a pedestal and its foot");
  assert(table!.material.texture === "wood" && table!.material.colour === BARE_TABLE_TONE, "a bare table is timber");

  const clothBody = bodies.find((b) => b.tag.type === "cloth");
  assert(!!clothBody && clothBody.tag.id === "p-cloth" && clothBody.material.kind === "fabric" && clothBody.material.colour === "#4b3a6e", "the cloth is a fabric body in the variant's swatch, tagged by the cover placement");
  const [sheet, fall] = clothBody!.parts;
  assert(sheet.shape === "extrude" && near(sheet.at.z + sheet.h, 750), "a round table's cloth: a sheet over the top at the table height");
  assert(fall.shape === "drape" && near(fall.at.z, 0) && near(fall.h, 750), "…and a drape from the rim to the floor (DECIDE 2)");
  const rimR = fall.shape === "drape" ? Math.max(...fall.outline.map((q) => Math.hypot(q.x, q.y))) : 0;
  assert(near(rimR, 900 + CLOTH_DROP_MM, 2), `…its rim CLOTH_DROP_MM past the top (${Math.round(rimR)})`);
  assert(fall.shape === "drape" && fall.foldDepthMm! > 0 && fall.flareMm! > 0, "…folding and flaring as it falls");

  const candles = bodies.filter((b) => b.id === "p-c1" || b.id === "p-c2");
  assert(candles.length === 2, `the two candlesticks are two bodies (got ${candles.length})`);
  for (const c of candles) {
    assert(c.tag.type === "item" && near(c.instances[0].at.z, 750), "a candlestick stands on the top face, at the table height");
    const d = Math.hypot(c.instances[0].at.x - 5000, c.instances[0].at.y - 5000);
    assert(d < 900, "…inside the table's rim, where dressingSpots put it");
  }
  assert(candles[0].instances[0].at.x !== candles[1].instances[0].at.x || candles[0].instances[0].at.y !== candles[1].instances[0].at.y, "…and not on the same spot");

  const labels = nodes.filter(isLabel);
  assert(labels.length === 0, "no table number floats over a table, even for the author");
  const quiet = new SceneCollector();
  tableNodes({ doc, author: false }, quiet, () => 0);
  assert(!quiet.nodes().some((n) => n.kind === "label"), "…and the client sees no label");

  // Two rectangles pushed into a head table: one ring, the block's; four legs each; one number.
  const block: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [
      { id: "a", type: "rect", number: 3, position: { x: 10000, y: 5000 }, rotation: 0, seats: 8, variantId: "tbl-rect", groupId: "g1" },
      { id: "b", type: "rect", number: 4, position: { x: 12400, y: 5000 }, rotation: 0, seats: 8, variantId: "tbl-rect", groupId: "g1" },
    ],
    placements: [onTable("p-c3", "candle", "a")],
    groups: [{ id: "g1", number: 2 }],
  };
  const out2 = new SceneCollector();
  tableNodes({ doc: block, author: true }, out2, () => 0);
  const nodes2 = out2.nodes();
  const bodies2 = nodes2.filter(isBody);
  const ring = bodies2.filter((n) => n.tag.type === "chair");
  assert(ring.length === 1 && ring[0].instances.length === 16, `a block's chairs are one ring of what its members seat (got ${ring.map((r) => r.instances.length).join("+") || 0})`);
  assert(ring[0].tag.id === "g1", "…tagged with the group");
  const seam = ring[0].instances.filter((i) => Math.abs(i.at.x - 11200) < 300 && Math.abs(i.at.y - 5000) < 500);
  assert(seam.length === 0, "no chair sits in the seam between the two tables");
  const rects = bodies2.filter((n) => n.tag.type === "table");
  assert(rects.length === 2 && rects.every((r) => r.parts.filter((p) => p.shape === "box").length === 4), "a long table stands on four legs");
  const leg = rects[0].parts.find((p) => p.shape === "box");
  assert(!!leg && leg.shape === "box" && near(Math.abs(leg.at.x), 1200 - LEG_INSET_MM - LEG_MM / 2) && near(Math.abs(leg.at.y), 600 - LEG_INSET_MM - LEG_MM / 2) && near(leg.h, 720), "…inset 80 from the corners, up to the top's underside");
  const labels2 = nodes2.filter(isLabel);
  assert(labels2.length === 0, "…nor over a block");
  const candle3 = bodies2.find((n) => n.id === "p-c3");
  assert(!!candle3 && near(candle3.instances[0].at.z, 750) && near(candle3.instances[0].at.x, 11200, 1), "a lone item on an auto-laid block stands on the block's middle — the seam — at the top height");

  // A cloth's contour in the room (lib/catalog/border.ts): the band at its edge is the bottom of the
  // fall, the second band above it past the gap, never above the table; each the same fall cut.
  const hemmed = hemBands({ widthMm: 80, colour: "#c9a24a", inner: { widthMm: 40, gapMm: 50, colour: "#ffffff" } }, 750);
  assert(hemmed.length === 2 && hemmed[0].range[0] === 0 && hemmed[0].range[1] === 80 && hemmed[1].range[0] === 130 && hemmed[1].range[1] === 170, "a contour is the hem at the floor and a band above it");
  assert(hemBands({ widthMm: 900, colour: "#000000" }, 750)[0].range[1] === 750, "…never higher than the table");
  const hemFall = clothHemParts({ kind: "circle", diameterMm: 1800 }, 750, [0, 80]);
  assert(hemFall.length === 1 && hemFall[0].shape === "drape" && hemFall[0].h === 750 && hemFall[0].band?.[1] === 80, "…a stretch of the very fall the cloth is (its folds, its height)");

  // A cloth on a rectangle: the outline grown by the drop, rounded at the corners, to the floor.
  const rectCloth = clothParts({ kind: "rect", widthMm: 2400, depthMm: 1200 }, 750);
  assert(rectCloth.length === 2 && rectCloth[0].shape === "extrude" && rectCloth[1].shape === "drape", "a rectangle's cloth is a sheet over the top and a drape to the floor");
  const fallR = rectCloth[1];
  assert(fallR.shape === "drape" && near(fallR.at.z, 0) && near(fallR.h, 750), "…the drape from the floor to the table height");
  const rimSize = fallR.shape === "drape" ? polySize(fallR.outline) : { w: 0, h: 0 };
  assert(near(rimSize.w, 2400 + 2 * CLOTH_DROP_MM) && near(rimSize.h, 1200 + 2 * CLOTH_DROP_MM), "…its rim the top grown by the drop all round");
  // Every point of the rim is exactly the drop from the top's edge — a mitred corner would stand
  // √2 times that out at the diagonal.
  const reach = fallR.shape === "drape" ? fallR.outline.reduce((m, p) => Math.max(m, Math.hypot(Math.max(Math.abs(p.x) - 1200, 0), Math.max(Math.abs(p.y) - 600, 0))), 0) : 0;
  assert(near(reach, CLOTH_DROP_MM, 0.5) && fallR.shape === "drape" && fallR.outline.length > 8, "…with corners rounded at the drop, not mitred");

  // A hollow ח (a notch): the concave corners mitre, the convex ones round.
  const notch = offsetOutline({ outline: [{ x: -1000, y: -500 }, { x: 1000, y: -500 }, { x: 1000, y: 500 }, { x: 300, y: 500 }, { x: 300, y: 0 }, { x: -300, y: 0 }, { x: -300, y: 500 }, { x: -1000, y: 500 }] }, 90);
  assert(notch.some((p) => near(p.x, 210) && near(p.y, 90)), "a concave corner of a ח moves to its mitre, 90 in from both sides");
  assert(!notch.some((p) => p.y > 590.5), "nothing grows further than the drop past the shape");

  // itemContextOf: the canvas's colour rule, the count, the style.
  const ctx = itemContextOf(onTable("x", "candle", "t1"), candle, resolve("candle"), { kind: "rect", widthMm: 300, depthMm: 300 }, false);
  assert(ctx.count === 5 && ctx.tone === DEFAULT_TONE.candlestick.toLowerCase() && ctx.heightMm === 600 && !ctx.flowers, "a candlestick's context: its arms, the kind's tone when it has no shade, its height");
  const chairCtx = itemContextOf(onTable("y", "chair-ivory", "t1"), chair, resolve("chair-ivory"), { kind: "rect", widthMm: 450, depthMm: 500 }, false);
  assert(chairCtx.tone === "#f7f6fc" && chairCtx.chairStyle === "chiavari", "a chair's context: its variant's swatch and its style");

  console.log("scene tables ok");
}
