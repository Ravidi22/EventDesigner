// A saved sketch — a whole design document kept under a name, to be started from again — and what
// has to happen to one before it can be drawn into a different room.
//
// The actions that store them are in ./sketch-actions.ts; this is the pure half, so it runs under
// node and the rule below is self-checked: `npm run check:sketches`.
import type { DesignDocumentContent, Placement } from "@/lib/design-document/types";
import { pruneGroups } from "@/lib/design-document/actions";
import { CATEGORY_BY_ID, categoryInPass } from "@/lib/catalog/categories";
import { railNamesVenue, railOf } from "./rail";
import { detachCover } from "./cover";

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
    .map((p) => (p.over && !tableIds.has(p.over) ? { ...p, over: undefined } : p))
    // A carpet over a stage left behind stays where it lay, let go (lib/studio/cover.ts).
    .map((p) => (p.cover?.stageId && !stageIds.has(p.cover.stageId) ? detachCover(p) : p));
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
  // Since rails (lib/studio/rail.ts): what names the OTHER room is a drape on its wall or on one of
  // its features; a drape on a hired stage of this very sketch, or on a free-standing rod, comes along.
  const own = new Set(content.placements.map((p) => p.id));
  return { ...rest, placements: content.placements.filter((p) => {
    const rail = railOf(p);
    return !rail || !railNamesVenue(rail, own);
  })
    // A carpet laid over one of the OTHER room's surfaces (lib/studio/cover.ts) comes along let go —
    // the shape it was laid in, where it was — rather than linked to a feature id this room lacks.
    .map((p) => (p.cover?.featureId ? detachCover(p) : p)) };
}
