// Where each thing on the event sketch actually IS, as outlines in world millimetres — the one
// answer the tape, the safety-distance check and the spacing command all measure with, so the three
// can never disagree about how far apart two tables are.
//
// Deliberately beside the screen rather than in lib/: it reads the catalog through the synchronous
// resolver and the footprint helpers the canvas draws with, which is exactly what makes it agree
// with what is drawn. The geometry itself (distances, breaches, spacing) is pure and lives in
// lib/studio/proximity.ts, self-checked there.
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import type { Point } from "@/lib/studio/hall";
import type { Plane } from "@/lib/studio/planes";
import { deckOf, resolve } from "@/lib/studio/catalog-resolver";
import { catalogVersion } from "@/lib/catalog/storage";
import { edgeItemShape, toRoom } from "@/lib/design-document/stage";
import { resolveSpan } from "@/lib/studio/anchor";
import { footprintBounds, resolveFootprint } from "@/lib/studio/footprint";
import { bowsOf, rugPolygon } from "@/lib/studio/rug-shape";
import { featureFootprint, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import { placementFootprint, tableFootprint } from "@/components/footprint-shape";
import { tableLabel } from "@/lib/design-document/groups";
import { bandPolygon, footprintPolygons, polysBox, type CentredBox, type ClearanceSubject, type Poly } from "@/lib/studio/proximity";

/** The drawn thickness of a drape's band — the same number canvas-stage.tsx draws it at, so a drape
 *  measured here is the band the designer can see. */
export const DRAPE_BAND_MM = 220;

export type GeoKind = "table" | "placement" | "feature";
export interface GeoRef {
  kind: GeoKind;
  id: string;
}

export interface ItemGeometry {
  ref: GeoRef;
  /** What the designer calls it — for the breach list and the tape. */
  label: string;
  /** Where it stands now. */
  centre: Point;
  /** Its outline with its centre moved to `c` — how the spacing command tries a position on. */
  polysAt: (c: Point) => Poly[];
  /** Its turned box right now (the SnapBox the rest of the canvas measures with). */
  box: CentredBox;
  clearanceMm: number;
  groupId?: string;
  solid?: string;
  /** Can a shared delta move it? False for a drape (its wall owns it). */
  movable: boolean;
}

const boxOf = (polys: Poly[]): CentredBox => {
  const b = polysBox(polys);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, widthMm: b.maxX - b.minX, depthMm: b.maxY - b.minY };
};

/** A stretch item's rectangle before anyone has stretched it — the catalog's own footprint. Same
 *  fallback canvas-stage.tsx draws a fresh carpet at. */
function stretchSize(p: Placement): { widthMm: number; depthMm: number } {
  if (p.sizeMm) return p.sizeMm;
  const r = resolve(p.variantId);
  const b = r ? footprintBounds(resolveFootprint(r.product)) : null;
  return { widthMm: b?.w || 2000, depthMm: b?.h || 1400 };
}

// ── Remembered per item ────────────────────────────────────────────────────────────────────────
//
// The safety-distance check asks for the geometry of EVERYTHING on the plan — every table, every
// floor item, every one of a landscaped venue's hundreds of features — on every frame of a drag,
// because it is memoised on the document and a drag writes the document per frame. The answer only
// changes for the thing that moved: a reducer copies the one row it touched, so every other table,
// placement and feature is the same object as last frame, and its geometry can be the same object
// too. Keyed on the item itself (a WeakMap, so a deleted row takes its entry with it) plus whatever
// else the answer reads: the catalog's version (a footprint comes from the row), the groups (a
// table's label is its block's number) and, for a drape, the walls it hangs between.
//
// The id lookups are indexed per document as well — `find` over a few hundred rows, once per row,
// was a quadratic walk on every frame.

const docIndex = new WeakMap<DesignDocumentContent, { tables: Map<string, DesignTable>; placements: Map<string, Placement> }>();
function indexOf(doc: DesignDocumentContent) {
  let i = docIndex.get(doc);
  if (!i) {
    i = { tables: new Map(doc.tables.map((t) => [t.id, t])), placements: new Map(doc.placements.map((p) => [p.id, p])) };
    docIndex.set(doc, i);
  }
  return i;
}
const featureIndex = new WeakMap<VenueStructure, Map<string, StructureFeature>>();
function featureOf(structure: VenueStructure, id: string): StructureFeature | undefined {
  let m = featureIndex.get(structure);
  if (!m) {
    m = new Map(structure.features.map((f) => [f.id, f]));
    featureIndex.set(structure, m);
  }
  return m.get(id);
}
const geoCache = new WeakMap<object, { key: readonly unknown[]; geo: ItemGeometry }>();
function remembered(subject: object, key: readonly unknown[], make: () => ItemGeometry): ItemGeometry {
  const hit = geoCache.get(subject);
  if (hit && hit.key.length === key.length && hit.key.every((k, i) => Object.is(k, key[i]))) return hit.geo;
  const geo = make();
  geoCache.set(subject, { key, geo });
  return geo;
}

/** One thing's geometry, or null for what has no place of its own on the floor plan — a cloth or a
 *  centrepiece on a table (it is its table's), or a drape whose wall was deleted. `structure` is the
 *  ARRANGED one (features where this event stood them); `property` is the venue as drawn, which is
 *  what walls are read from — no per-event arrangement moves one. */
export function itemGeometry(doc: DesignDocumentContent, structure: VenueStructure, property: VenueStructure, ref: GeoRef): ItemGeometry | null {
  if (ref.kind === "table") {
    const t = indexOf(doc).tables.get(ref.id);
    if (!t) return null;
    // A grouped table's label is read off its siblings (the block's lowest number), so it follows
    // the table list; a lone table's answer is its own.
    return remembered(t, [catalogVersion, doc.groups, t.groupId ? doc.tables : null], () => {
      const f = tableFootprint(t);
      const polysAt = (c: Point) => footprintPolygons(f, c, t.rotation || 0, !!t.mirrored);
      const product = t.variantId ? resolve(t.variantId)?.product : undefined;
      return {
        ref,
        // What the plan calls it — a block's number, not the one hidden under it; none for an unnumbered table.
        label: tableLabel(doc, t),
        centre: t.position,
        polysAt,
        box: boxOf(polysAt(t.position)),
        clearanceMm: product?.clearanceMm ?? 0,
        groupId: t.groupId,
        solid: "table",
        movable: true,
      };
    });
  }

  if (ref.kind === "feature") {
    const f = featureOf(structure, ref.id);
    if (!f) return null;
    return remembered(f, [], () => {
      const fp = featureFootprint(f);
      const polysAt = (c: Point) => footprintPolygons(fp, c, f.rotationDeg ?? 0);
      const centre = { x: f.x, y: f.y };
      return {
        ref,
        label: f.label,
        centre,
        polysAt,
        box: boxOf(polysAt(centre)),
        clearanceMm: 0,
        solid: f.kind === "stage" || f.kind === "bar" || f.kind === "pool" ? f.kind : undefined,
        movable: true,
      };
    });
  }

  const p = indexOf(doc).placements.get(ref.id);
  if (!p || p.tableId) return null;
  const r = resolve(p.variantId);

  if (r?.anchor === "wall") {
    const run = p.span ? resolveSpan(property, p.span) : null;
    if (!run) return null;
    return remembered(p, [catalogVersion, property], () => {
      // One band per stretch of the run, so a drape round a bowed wall is the curved strip it is
      // (each piece convex), not a rectangle across the bow.
      const band = run.path.slice(1).map((q, i) => bandPolygon(run.path[i], q, DRAPE_BAND_MM));
      const centre = run.path.length > 2 ? run.path[Math.floor(run.path.length / 2)] : { x: (run.from.x + run.to.x) / 2, y: (run.from.y + run.to.y) / 2 };
      return { ref, label: r.product.name, centre, polysAt: () => band, box: boxOf(band), clearanceMm: r.product.clearanceMm ?? 0, groupId: p.groupId, movable: false };
    });
  }

  return remembered(p, [catalogVersion], () => {
    const label = r?.product.name ?? "פריט";
    const clearanceMm = r?.product.clearanceMm ?? 0;
    const centre = p.position;
    // A stage's flights and banquettes stand on the floor as much as its decks do: the aisle a table
    // keeps clear is kept clear of them too, and the tape measures to their foot. (A barrier stands on
    // the stage, inside its outline.)
    const stairPolys = (c: Point): Poly[] =>
      (p.stage?.stairs ?? []).flatMap((st) => {
        const shape = p.stage ? edgeItemShape(p.stage, st, deckOf) : null;
        return shape && shape.kind !== "barrier" && shape.kind !== "backdrop" ? [shape.polygon.map((q) => toRoom({ position: c, rotation: p.rotation, mirrored: p.mirrored }, q))] : [];
      });
    // A rug with curved sides is measured along its curves; the rectangle it was is only its box.
    const bows = bowsOf(p);
    const polysAt =
      r?.sizing === "stretch"
        ? bows
          ? (c: Point): Poly[] => {
              const s = stretchSize(p);
              return [rugPolygon(s.widthMm, s.depthMm, bows).map((q) => toRoom({ position: c, rotation: p.rotation }, q))];
            }
          : (c: Point) => footprintPolygons({ kind: "rect", ...stretchSize(p) }, c, p.rotation || 0)
        : (c: Point) => [...footprintPolygons(placementFootprint(p), c, p.rotation || 0, !!p.mirrored, p.scale || 1), ...stairPolys(c)];
    return {
      ref,
      label,
      centre,
      polysAt,
      box: boxOf(polysAt(centre)),
      clearanceMm,
      groupId: p.groupId,
      solid: r?.solid,
      movable: true,
    };
  });
}

/** Everything the safety-distance rule looks at, on the planes that are showing.
 *
 *  Three kinds are left out on purpose, each because it is not standing in anyone's way: a RUG is
 *  laid under things, anything ON a table is its table's, and anything hanging from the CEILING is
 *  over people's heads. A DRAPE stays in, though it hangs from the ceiling too — it comes down to the
 *  floor, and keeping candles away from one is the rule a designer most wants checked. */
export function clearanceSubjects(
  doc: DesignDocumentContent,
  structure: VenueStructure,
  property: VenueStructure,
  visible: Record<Plane, boolean>,
): (ClearanceSubject & { label: string })[] {
  const out: (ClearanceSubject & { label: string })[] = [];
  const add = (ref: GeoRef) => {
    const g = itemGeometry(doc, structure, property, ref);
    if (g) out.push({ key: `${ref.kind}:${ref.id}`, polys: g.polysAt(g.centre), clearanceMm: g.clearanceMm, groupId: g.groupId, solid: g.solid, label: g.label });
  };
  if (visible.tables) for (const t of doc.tables) add({ kind: "table", id: t.id });
  for (const p of doc.placements) {
    if (p.tableId) continue;
    const r = resolve(p.variantId);
    if (r?.anchor === "wall") {
      if (visible.ceiling) add({ kind: "placement", id: p.id });
      continue;
    }
    if (p.layer !== "floor" || r?.sizing === "stretch" || !visible.floor) continue;
    add({ kind: "placement", id: p.id });
  }
  // The venue's own furniture asks for nothing, but a table that asked for aisle room is as much in
  // breach against the house bar as against a hired one.
  // Not the ground: a table is SET on a lawn, and one standing near a lawn's edge (or across it) was
  // reported as too close to it, as though the grass were a wall.
  // Nor a curtain: it is the wall's own face, and a table may stand as near it as near the wall.
  if (visible.floor) for (const f of structure.features) if (f.kind !== "surface" && f.kind !== "curtain") add({ kind: "feature", id: f.id });
  return out;
}
