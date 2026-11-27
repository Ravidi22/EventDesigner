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
import { defaultVariantId, withResolved } from "@/lib/studio/catalog-resolver";
import { footprintBounds, resolveFootprint, type Footprint } from "@/lib/studio/footprint";
import type { Point } from "@/lib/studio/hall";
import { placementFootprint, tableFootprint } from "@/components/footprint-shape";
import { hangHeightOf } from "@/lib/studio/hang";
import { buildScene } from "./build";
import { ceilingUndersideMm } from "./overhead";
import { focusViewpoint, type FocusRef } from "./focus";
import { DEFAULT_SETTINGS, type Scene, type SceneSettings, type Viewpoint } from "./types";

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
