// A saved sketch — a whole design document kept under a name, to be started from again — and what
// has to happen to one before it can be drawn into a different room.
//
// The actions that store them are in ./sketch-actions.ts; this is the pure half, so it runs under
// node and the rule below is self-checked: `npm run check:sketches`.
import type { DesignDocumentContent, Placement } from "@/lib/design-document/types";
import { pruneGroups } from "@/lib/design-document/actions";
import { CATEGORY_BY_ID, categoryInPass } from "@/lib/catalog/categories";
import { isMain } from "../self-check";

/** A saved sketch as the pickers list it — never its content, which can be hundreds of placements
 *  and is fetched only when one is actually loaded. */
export interface SketchTemplateSummary {
  id: string;
  name: string;
  /** The property it was drawn in, or null when it was drawn without one (or the venue is gone). */
  venueId: string | null;
  tables: number;
  items: number;
  /** A photograph of the real event, the card's cover in the meeting's סקיצת פתיחה. */
  photoUrl: string | null;
  createdAt: number;
}

/**
 * What the meeting's סקיצת פתיחה lets the designer take from a sketch — four boxes, and every element
 * of a sketch in exactly ONE of them (spec 2026-11-01-meeting-sketch-pick-design.md). They follow the
 * catalog's own hall/design split (categoryInPass) rather than the studio's planes: the floor plane
 * holds a rug and a chuppah alike, and a designer keeping the hall drops the one and keeps the other.
 */
export type SketchLayer = "tables" | "stages" | "design" | "ceiling";

export const SKETCH_LAYERS: { id: SketchLayer; label: string }[] = [
  { id: "tables", label: "שולחנות וריהוט" },
  { id: "stages", label: "במות" },
  { id: "design", label: "עיצוב" },
  { id: "ceiling", label: "תקרה" },
];

export const ALL_SKETCH_LAYERS: Record<SketchLayer, boolean> = { tables: true, stages: true, design: true, ceiling: true };

/** The box a placement is taken in. Tables, groups and the venue-feature moves are always `tables`. */
export function layerOf(p: Placement, categoryOf: (variantId: string) => string | undefined): SketchLayer {
  if (p.layer === "ceiling") return "ceiling";
  if (p.stage) return "stages";
  if (p.perch || p.layer === "table") return "design";
  const category = categoryOf(p.variantId);
  if (category && CATEGORY_BY_ID[category]?.group === "grp-stages") return "stages";
  return categoryInPass(category, "hall") ? "tables" : "design";
}

/**
 * The sketch less the boxes left unticked — and less what cannot stand without one of them: an item
 * on a table goes with the tables, a perched item with its stage. A ceiling item hung over a table
 * that stays behind keeps hanging where it is, unlinked (`over` would name nothing). The exceptions
 * (F-5.3: "this table deliberately has no X") are about dressing a table, so they need both.
 */
export function takeLayers(
  doc: DesignDocumentContent,
  take: Record<SketchLayer, boolean>,
  categoryOf: (variantId: string) => string | undefined,
): DesignDocumentContent {
  const tables = take.tables ? doc.tables : [];
  const tableIds = new Set(tables.map((t) => t.id));
  const kept = doc.placements.filter((p) => take[layerOf(p, categoryOf)]);
  const stageIds = new Set(kept.filter((p) => p.stage).map((p) => p.id));
  const placements = kept
    .filter((p) => (p.tableId ? tableIds.has(p.tableId) : true) && (p.perch ? stageIds.has(p.perch.stageId) : true))
    .map((p) => (p.over && !tableIds.has(p.over) ? { ...p, over: undefined } : p));
  const { features, exceptions, ...rest } = doc;
  return pruneGroups({
    ...rest,
    tables,
    placements,
    ...(take.tables && features ? { features } : {}),
    ...(take.tables && take.design && exceptions ? { exceptions: exceptions.filter((x) => tableIds.has(x.tableId)) } : {}),
  });
}

/** Caps on a saved sketch — the same ceilings design_documents keeps (lib/studio/actions.ts), for
 *  the same reason: a JSONB column arriving over HTTP has to have one. */
export const MAX_SKETCH_TABLES = 2_000;
export const MAX_SKETCH_PLACEMENTS = 20_000;
export const MAX_SKETCHES = 60;
export const MAX_SKETCH_NAME = 80;

/**
 * A sketch as it will be drawn into a room: the same drawing when the room is the one it was drawn
 * in, and otherwise the drawing less what belonged to the OTHER room.
 *
 * A drape is a run along a named wall of a named property, and a feature arrangement is an offset
 * from where THAT property keeps its bar; in another venue the wall id resolves to nothing and the
 * bar is not there to move. Carried across anyway, a drape would draw nothing and still bill the
 * client for its metres (the dangling-wall contract in lib/studio/anchor.ts), which is the one
 * outcome worse than losing it. Everything with a position of its own — tables, stages, rugs,
 * items — keeps its millimetres: the designer puts the room right by dragging, which is what a
 * sketch is for. `sameVenue` is the caller's answer to "is this the room it was drawn in"; a sketch
 * drawn with no venue at all is in no room, so nothing is the same room as it.
 */
export function adoptSketch(content: DesignDocumentContent, sameVenue: boolean): DesignDocumentContent {
  if (sameVenue) return content;
  const { features: _theirs, ...rest } = content;
  return { ...rest, placements: content.placements.filter((p) => !p.span) };
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const base = (): DesignDocumentContent => ({
    calibration: { mmPerUnit: 1 },
    tables: [{ id: "t", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0, diameterMm: 1800 }],
    placements: [
      { id: "rug", variantId: "v", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: "drape", variantId: "d", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, span: { wallId: "w", from: 0, to: 1 } },
    ],
    features: [{ featureId: "bar", dx: 100, dy: 0 }],
  });
  const same = adoptSketch(base(), true);
  assert(same.placements.length === 2 && same.features?.length === 1, "in the room it was drawn in, a sketch is the drawing as saved");
  const other = adoptSketch(base(), false);
  assert(other.placements.length === 1 && other.placements[0].id === "rug", "in another room the drapes are left behind…");
  assert(other.features === undefined, "…and so are the arrangements of the other room's own furniture");
  assert(other.tables.length === 1 && other.tables[0].position.x === 0, "…while everything with a place of its own keeps it");

  // ── takeLayers ──
  const at = { x: 0, y: 0 };
  const put = (id: string, variantId: string, extra: Partial<Placement> = {}): Placement => ({
    id, variantId, layer: "floor", quantity: 1, position: at, rotation: 0, scale: 1, ...extra,
  });
  const CAT: Record<string, string> = { rug: "rugs", bar: "bars", chuppah: "chuppahs", cp: "centerpieces", ch: "chandeliers", stg: "stages", bench: "stage-benches" };
  const cat = (v: string) => CAT[v];
  const room = (): DesignDocumentContent => ({
    calibration: { mmPerUnit: 1 },
    tables: [
      { id: "t1", type: "עגול", number: 1, position: at, rotation: 0, diameterMm: 1800, groupId: "g" },
      { id: "t2", type: "עגול", number: 2, position: at, rotation: 0, diameterMm: 1800 },
    ],
    groups: [{ id: "g" }, { id: "g2" }],
    placements: [
      put("rug", "rug"),
      put("bar", "bar"),
      put("chuppah", "chuppah"),
      put("cp", "cp", { layer: "table", tableId: "t1" }),
      put("ch", "ch", { layer: "ceiling", over: "t2", groupId: "g" }),
      put("stage", "stg", { stage: {} as never }),
      put("loose-bench", "bench"),
      put("perched", "cp", { perch: { stageId: "stage", itemId: "b" } }),
      put("drape", "x", { layer: "ceiling", span: { wallId: "w", from: 0, to: 1 }, groupId: "g2" }),
    ],
    exceptions: [{ tableId: "t1", variantId: "cp" }],
    features: [{ featureId: "f", dx: 1, dy: 0 }],
  });
  const ids = (d: DesignDocumentContent) => d.placements.map((p) => p.id).sort().join(",");
  const only = (l: SketchLayer) => takeLayers(room(), { tables: false, stages: false, design: false, ceiling: false, [l]: true }, cat);

  const whole = takeLayers(room(), ALL_SKETCH_LAYERS, cat);
  assert(ids(whole) === ids(room()) && whole.tables.length === 2, "all four boxes give back the whole sketch");
  assert(whole.features?.length === 1 && whole.exceptions?.length === 1, "…features and exceptions included");

  assert(only("tables").tables.length === 2 && ids(only("tables")) === "bar,rug", "tables: the tables, the bar and the rug");
  assert(only("tables").features?.length === 1, "…and the moves of the venue's own furniture");
  assert(ids(only("stages")) === "loose-bench,stage" && only("stages").tables.length === 0, "stages: the stage and loose stage pieces");
  assert(ids(only("design")) === "chuppah", "design alone: the floor design — the table item has no table, the perched item no stage");
  assert(ids(only("ceiling")) === "ch,drape", "ceiling: everything overhead, drapes included");
  assert(only("ceiling").placements.find((p) => p.id === "ch")?.over === undefined, "…a chandelier whose table stayed behind keeps hanging, unlinked");
  assert(!only("design").exceptions && !only("tables").exceptions, "exceptions need the tables AND the design");

  const usual = takeLayers(room(), { tables: true, stages: true, design: false, ceiling: false }, cat);
  assert(ids(usual) === "bar,loose-bench,rug,stage", "the designer's usual: the hall and the stages, nothing designed");
  assert(!usual.groups?.length && usual.tables.every((t) => !t.groupId), "a group left with one member is dropped and its id cleared");
  const dressed = takeLayers(room(), { tables: true, stages: true, design: true, ceiling: false }, cat);
  assert(ids(dressed).includes("cp") && ids(dressed).includes("perched"), "with tables and stages, what stands on them comes too");
  console.log("sketches self-check passed");
}
