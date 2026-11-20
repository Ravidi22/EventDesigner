// A ROOM OF ITS OWN — the scenes the catalog's editors' 3D pane shows (app/(app)/catalog/
// scene-pane.tsx; the element model, spec 2026-11-07-element-model §7 Stage 2): ONE ITEM for the
// shape editor (`itemScene`), a whole ARRANGEMENT for the composite editor (`compositionScene`). The
// studio's own picture: `buildScene` over a small document on an empty plan whose floor is the
// subject and a margin, framed as the /scene tab frames a table (./focus.ts). The shape editor's
// row may be UNSAVED — a draft being drawn — so the builder's resolves see it through
// `withResolved`, over the catalog, for the span of the build and no longer; a composite's parts
// are catalog rows already.
//
// Pure. Run: npm run check:item-scene
import type { Product } from "@/lib/catalog/types";
import { emptyDocument, type DesignDocumentContent, type DesignTable, type Placement } from "@/lib/design-document/types";
import { EMPTY_PLAN, type EventPlan } from "@/lib/events/plan";
import { defaultVariantId, resolve, withResolved } from "@/lib/studio/catalog-resolver";
import { footprintBounds, resolveFootprint, type Footprint } from "@/lib/studio/footprint";
import type { Point } from "@/lib/studio/hall";
import { placementFootprint, tableFootprint } from "@/components/footprint-shape";
import { isMain } from "../self-check";
import { hangHeightOf } from "@/lib/studio/hang";
import { buildScene } from "./build";
import { ceilingUndersideMm } from "./overhead";
import { focusViewpoint, type FocusRef } from "./focus";
import { DEFAULT_SETTINGS, type BodyNode, type Scene, type SceneSettings, type Viewpoint } from "./types";

/** Floor round the item, each side. */
export const ITEM_ROOM_MARGIN_MM = 1500;
export const ITEM_ID = "shape-editor-item";
/** Daylight: a shape is judged by its form, not by its candles. */
export const ITEM_SCENE_SETTINGS: SceneSettings = { ...DEFAULT_SETTINGS, mood: "day" };

/** The one-item drawing. A table row is a table (its seats round it, as the room seats every
 *  table); a ceiling row hangs at its row's hang height under open sky; anything else — a table
 *  item too, whose own shape is what is being judged — stands on the floor at the origin. */
export function itemDocument(product: Product): DesignDocumentContent {
  const doc = emptyDocument();
  if (product.category === "tables") {
    const d = product.dimensions;
    const seats = Number(product.categoryFields?.seats);
    const table: DesignTable = {
      id: ITEM_ID,
      type: product.name,
      number: 1,
      position: { x: 0, y: 0 },
      rotation: 0,
      variantId: defaultVariantId(product),
      ...(d.diameterMm ? { diameterMm: d.diameterMm } : { widthMm: d.widthMm ?? 0, depthMm: d.depthMm ?? 0 }),
      ...(seats > 0 ? { seats } : {}),
    };
    doc.tables.push(table);
    return doc;
  }
  const p: Placement = {
    id: ITEM_ID,
    variantId: defaultVariantId(product),
    layer: product.layer === "ceiling" ? "ceiling" : "floor",
    quantity: 1,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
  };
  doc.placements.push(p);
  return doc;
}

/** An empty plan whose floor is the item and a margin round it. */
export function itemPlan(product: Product): EventPlan {
  const b = footprintBounds(resolveFootprint(product));
  const hw = b.w / 2 + ITEM_ROOM_MARGIN_MM;
  const hh = b.h / 2 + ITEM_ROOM_MARGIN_MM;
  return { ...EMPTY_PLAN, bounds: { minX: -hw, minY: -hh, maxX: hw, maxY: hh, widthMm: 2 * hw, heightMm: 2 * hh } };
}

/** What the one-item room is built from — a change to anything else (a selection, a hover) builds
 *  nothing. */
export function itemSceneKey(p: Product): string {
  return JSON.stringify([p.name, p.category, p.layer, p.dimensions, p.appearance, p.categoryFields, p.imageUrl, p.variants.map((v) => [v.id, v.swatch, v.archived])]);
}

/** How many of its own sizes back a SMALL piece is looked at from in its own pane, and the nearest
 *  the eye comes. The sketch's portrait stands 1.7 m back at eye height — right for a table in a
 *  room, and a 30 cm lamp or a candlestick was a dozen pixels in the middle of the pane (seen
 *  headless, 2026-11-13). */
export const CLOSE_UP = { sizes: 2.6, nearestMm: 650 } as const;

/** `focus` brought in toward what it looks at, for a piece `sizeMm` across (its footprint's diagonal
 *  or its height, whichever is more): the same bearing and pitch, the eye `CLOSE_UP.sizes` of the
 *  piece away. A piece big enough to fill the portrait is left as it was. */
export function closeUp(focus: Viewpoint, sizeMm: number): Viewpoint {
  const d = { x: focus.eye.x - focus.look.x, y: focus.eye.y - focus.look.y, z: focus.eye.z - focus.look.z };
  const len = Math.hypot(d.x, d.y, d.z);
  const want = Math.max(CLOSE_UP.nearestMm, sizeMm * CLOSE_UP.sizes);
  if (!(len > want)) return focus;
  const k = want / len;
  return { ...focus, eye: { x: focus.look.x + d.x * k, y: focus.look.y + d.y * k, z: focus.look.z + d.z * k } };
}

/** The id an UNSAVED row is built under. A new draft's id is "" and, with no shade, so is the variant
 *  id the drawing points it by — which every table reader (tables.ts, footprint-shape.tsx
 *  tableFootprint) takes for "no catalog row": a new table was built as a 160×90 timber rectangle at
 *  75 cm whatever the editor drew (SH-1, QA 2026-11-20). */
export const DRAFT_ITEM_ID = "shape-editor-draft";

/** The room and the place to look at it from, for `product` as it stands. */
export function itemScene(draft: Product): { scene: Scene; focus: Viewpoint | null } {
  const product = draft.id ? draft : { ...draft, id: DRAFT_ITEM_ID };
  const doc = itemDocument(product);
  const plan = itemPlan(product);
  return withResolved([product], () => {
    const scene = buildScene({ doc, plan, structure: plan.structure, settings: ITEM_SCENE_SETTINGS, author: true, railingAboveMm: null });
    const focus = focusViewpoint({
      doc,
      structure: plan.structure,
      zones: [],
      bounds: scene.bounds,
      selection: [{ kind: product.category === "tables" ? "table" : "placement", id: ITEM_ID }],
    });
    // A small piece standing by itself (a lamp, a vase, a candlestick) is looked at from close by.
    if (!focus || product.category === "tables" || product.layer === "ceiling") return { scene, focus };
    const b = footprintBounds(resolveFootprint(product));
    return { scene, focus: closeUp(focus, Math.max(Math.hypot(b.w, b.h), product.dimensions.heightMm ?? 0)) };
  });
}

/** The height the item's own floor stands at in its room: 0, or for a ceiling row its underside —
 *  exactly where lib/scene/build.ts ceilingPlacement hangs a placement with no hang height of its own
 *  under open sky (itemPlan has no roof). The shape editor's side views (lib/element/elevation.ts)
 *  put their z 0 there, so the boxes stand on the picture. */
export function itemBaseZ(product: Product): number {
  if (product.layer !== "ceiling") return 0;
  return hangHeightOf({}, product) ?? ceilingUndersideMm(null, product.dimensions.heightMm ?? 0);
}

// ── a composite's arrangement ─────────────────────────────────────────────────────────────────────

/** The box round everything on the floor of `doc` — each table's and each floor placement's
 *  footprint where it stands, turned (a thing on a table is inside its table's). */
function floorBox(doc: DesignDocumentContent): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const take = (at: Point, f: Footprint, rotation: number) => {
    const b = footprintBounds(f);
    const t = (rotation * Math.PI) / 180;
    const w = Math.abs(b.w * Math.cos(t)) + Math.abs(b.h * Math.sin(t));
    const h = Math.abs(b.w * Math.sin(t)) + Math.abs(b.h * Math.cos(t));
    box.minX = Math.min(box.minX, at.x - w / 2);
    box.maxX = Math.max(box.maxX, at.x + w / 2);
    box.minY = Math.min(box.minY, at.y - h / 2);
    box.maxY = Math.max(box.maxY, at.y + h / 2);
  };
  for (const t of doc.tables) take(t.position, tableFootprint(t), t.rotation);
  for (const p of doc.placements) if (!p.tableId && p.layer !== "table") take(p.position, placementFootprint(p), p.rotation);
  return Number.isFinite(box.minX) ? box : null;
}

/** What a composite's room is built from: its pieces, where they stand. */
export function compositionSceneKey(doc: DesignDocumentContent): string {
  return JSON.stringify([doc.tables, doc.placements, doc.groups ?? []]);
}

/** A composite's arrangement in a room of its own: every piece where the editor stands it, on a
 *  floor the size of the lot plus the margin, looked at from a place that frames them all. Null for
 *  an empty arrangement. */
export function compositionScene(doc: DesignDocumentContent): { scene: Scene; focus: Viewpoint | null } | null {
  const b = floorBox(doc);
  if (!b) return null;
  const hw = (b.maxX - b.minX) / 2 + ITEM_ROOM_MARGIN_MM;
  const hh = (b.maxY - b.minY) / 2 + ITEM_ROOM_MARGIN_MM;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const plan: EventPlan = { ...EMPTY_PLAN, bounds: { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh, widthMm: 2 * hw, heightMm: 2 * hh } };
  const scene = buildScene({ doc, plan, structure: plan.structure, settings: ITEM_SCENE_SETTINGS, author: true, railingAboveMm: null });
  const selection: FocusRef[] = [
    ...doc.tables.map((t): FocusRef => ({ kind: "table", id: t.id })),
    ...doc.placements.filter((p) => !p.tableId && p.layer !== "table").map((p): FocusRef => ({ kind: "placement", id: p.id })),
  ];
  const focus = focusViewpoint({ doc, structure: plan.structure, zones: [], bounds: scene.bounds, selection });
  return { scene, focus };
}

if (isMain(import.meta.url)) {
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
}
