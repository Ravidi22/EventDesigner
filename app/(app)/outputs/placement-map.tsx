import { BackToStudio } from "./back-to-studio";
import { Fragment } from "react";
import type { DesignDocumentContent, DesignTable, Placement } from "@/lib/design-document/types";
import { numberedUnits, groupSeats } from "@/lib/design-document/groups";
import { standaloneBench } from "@/lib/design-document/bench";
import { productName } from "@/lib/outputs/lookup";
import {
  absoluteControlPoints,
  doorGeometry,
  fromLocalFrame,
  outlinePathD,
  wallLengthMm,
  wallSegmentD,
} from "@/lib/studio/geometry";
import type { EventPlan } from "@/lib/events/plan";
import { featureFootprint, isDoor, isWindow, nodeMap, plantSpecies, surfaceMaterial, wallPoints, type StructureFeature } from "@/lib/venues/structure";
import { WindowGlazing } from "@/components/window-glazing";
import { CURTAIN_DEPTH_MM, CURTAIN_FILL, curtainPieces, type CurtainPiece } from "@/lib/venues/curtain";
import { CurtainCloth, DrapePleatsAlong, polygonD } from "@/components/curtain-cloth";
import { detectFaces, wallInteriorHint } from "@/lib/venues/faces";
import { featureEdgeShapes } from "@/lib/venues/stage-edges";
import { isClimb } from "@/lib/venues/climb";
import { ClimbGlyph, WalkingLine, slopeTextSize } from "@/components/climb-glyph";
import { footprintPolygons } from "@/lib/studio/proximity";
import { isDark, resolveStyle } from "@/lib/element-style";
import { anySurface } from "@/lib/catalog/textures";
import { PlantGlyph } from "@/components/plant-glyph";
import { ItemSurface, SurfaceFill, ZoneSurface } from "@/components/surface-fill";
import { FootprintShape, blockLabelRoom, dressBlockOf, dressingSpots, tableBlock, tableBlockedSides, tableFootprint, tableLabelPoint, placementFootprint, productStyle, OVERHEAD_DASH } from "@/components/footprint-shape";
import { blockSeats } from "@/lib/design-document/block";
import { ClothDrape, ItemSymbol, RugPattern, SeatChair, SofaCushions } from "@/components/item-symbol";
import { chairStyleOf, drawStyleOf, symbolCount, symbolOf } from "@/lib/catalog/symbols";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { climbRise } from "@/lib/studio/climb-item";
import { bowedRug, bowsOf, rugPolygon } from "@/lib/studio/rug-shape";
import { arrangedStructure } from "@/lib/design-document/features";
import { autoStack, floorStack, type StackBox } from "@/lib/design-document/stacking";
import { benchOf, chairBlockOf, deckOf, resolve, type Resolved } from "@/lib/studio/catalog-resolver";
import { ChairBlock, SeatingGlyph } from "@/components/chair-block";
import { ColumnGlyph } from "@/components/column-glyph";
import { seatingOf } from "@/lib/venues/seating";
import {
  benchInRoom,
  edgeGaps,
  edgeItemInRoom,
  edgeItemShape,
  layStage,
  stageAreaMm2,
  stageBox,
  stageCorners,
  stageShapeOf,
  missingByShape,
  railingRuns,
  skirtMm,
  stageHeight,
  stageRect,
  type EdgeRun,
  type StagePlacement,
  type WallDistance,
} from "@/lib/design-document/stage";
import { pieceName } from "@/lib/studio/stage-rim";
import { joinEdgeRuns, joinedItemIds, type JoinedRun } from "@/lib/design-document/edge-runs";
import { uprightTransform } from "@/lib/design-document/mirror";
import { darkFill, deckLabel, heightColour } from "@/lib/outputs/deck-colours";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { resolveFootprint, footprintBounds, type Footprint } from "@/lib/studio/footprint";
import { nearestWall, resolveSpan, spanBand } from "@/lib/studio/anchor";
import { seatsAround, CHAIR_D_MM, CHAIR_W_MM, type Seat } from "@/lib/studio/seating";
import { measurements, type Dim, type DimKind, type Leader, type MeasureInput, type MeasureOptions, type Solid } from "@/lib/outputs/measurements";
import { placeLabels, type Box } from "@/lib/outputs/labels";
import { formatHang, hangHeightOf, wallRuns } from "@/lib/studio/hang";
import { hangCentreOf, hangPointOf, hangTargetsOf } from "../studio/hang-targets";
import { tablesPhrase, type TableKit } from "@/lib/outputs/table-kits";
import { chairOf, defaultChair } from "@/lib/catalog/chairs";
import { pointInPolygon } from "@/lib/venues/faces";
import type { Extent } from "@/lib/outputs/scale";
import { vesselOf } from "@/lib/catalog/vessel";
import { VesselMark } from "@/components/vessel-mark";
import { sheetById, type PlanSheet } from "@/lib/outputs/sheets";
import { SheetFrame, LINE_WEIGHTS, type SheetFrameProps, type LegendRow } from "./sheet-frame";

// The B&W print ink — matches SheetFrame's own tokens, so the drawing and the frame around it read
// as one document rather than two components that each remembered the palette separately.
const INK = "#1b1725";
/** COLOUR MODE (the quote's sketch, shown to a client): the studio's own zone tints — the same
 *  kinds-by-fill venue-plan.tsx's ZoneRegions uses, as literal colours. */
const ZONE_TINT: Record<string, string> = { hall: "#faf9fd", canopy: "#e8f1fb", open: "#dcefe5", service: "#eeedf3" };
const INK_SOFT = "#4a4658";
const MUTED = "#7c7889";
/** THE B&W BOOKLET (outputs → צבע: שחור-לבן): every element FILLED with a flat grey chosen by what it
 *  IS, never by its real colour — so a table, a stage, a bar each read as a solid shape and their
 *  lengths and sizes show at a glance, where hollow outlines on white made the eye trace every edge.
 *  Paler the lower it stands — the ground, then the stage, then what stands on it — so the furniture
 *  is the darkest thing on the page and black numbers stay legible on it. What stands ON a table is
 *  left white, to read against the table's grey top. */
const MONO = {
  ground: "#f3f3f3",
  feature: "#ebebeb",
  rug: "#eeeeee",
  drape: "#e4e4e4",
  stage: "#e2e2e2",
  chair: "#dcdcdc",
  item: "#cfcfcf",
  table: "#c4c4c4",
} as const;

// Table numbers into ranges ("1–3, 5") and table units into words — pure, self-checked in
// lib/outputs/table-kits.ts (npm run check:table-kits).
export { formatTables, tablesPhrase } from "@/lib/outputs/table-kits";

// How a block of pushed-together tables reads for the derived chair ring: one bounding box, through
// each member's own rotation, exactly the way the studio canvas boxes a group (canvas-stage.tsx).
// Duplicated rather than imported because that version lives inside a client component's useMemo
// chain, coupled to selection state this static print pass has no use for.
/** Every block of tables on the plan as the one table it is — its frame, and its chairs, the same
 *  ring the studio draws (lib/design-document/block.ts). */
export function tableGroupBoxes(doc: DesignDocumentContent) {
  return (doc.groups ?? [])
    .map((g) => {
      const block = tableBlock(doc.tables.filter((t) => t.groupId === g.id));
      if (!block) return null; // a group of stages is not a table and has no chairs
      const seats = groupSeats(doc, g.id);
      return {
        id: g.id,
        centre: block.centre,
        rotation: block.rotation,
        widthMm: block.widthMm,
        depthMm: block.depthMm,
        seats,
        /** The ring, in the block's frame — drawn under `transform`. */
        chairs: blockSeats(block, seats),
        transform: `translate(${block.centre.x} ${block.centre.y})${block.rotation ? ` rotate(${block.rotation})` : ""}`,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);
}

const DRAPE_MM = 220; // a curtain's drawn thickness, matching canvas-stage's own band

/** Where a table or item stands, which way it faces, and whether it is drawn flipped
 *  (Placement.mirrored) — the same translate · rotate · flip the studio canvas draws with, so a
 *  corner sofa turned over on screen is turned over on the crew's page too. */
const placed = (at: { x: number; y: number }, rotation: number, mirrored?: boolean) =>
  `translate(${at.x} ${at.y})${rotation ? ` rotate(${rotation})` : ""}${mirrored ? " scale(-1 1)" : ""}`;

/** A carpet or drape with no catalog size of its own falls back to a plausible box — the same
 *  fallback the studio canvas uses (canvas-stage.tsx's fallbackSize), so a stretch item with nothing
 *  typed yet still draws something rather than a zero-size shape nobody can see. */
function fallbackSize(r?: Resolved): { widthMm: number; depthMm: number } {
  const b = r ? footprintBounds(resolveFootprint(r.product)) : null;
  return { widthMm: b?.w || 2000, depthMm: b?.h || 1400 };
}

/** World mm round the framed zone: room for the overall dimensions (900mm off the room) and their
 *  figures to land inside the clip rather than be cut by it. */
export const MAP_PAD_MM = 1600;

/** The extent a map sheet draws for a frame — exported so the set can pick each sheet's paper
 *  orientation from the same numbers the sheet will fit itself to. */
export function mapWorld(bounds: { widthMm: number; heightMm: number }): Extent {
  return { widthMm: bounds.widthMm + MAP_PAD_MM * 2, heightMm: bounds.heightMm + MAP_PAD_MM * 2 };
}

type Pt = { x: number; y: number };

/** A footprint's outline in its own frame, for measuring. Circles and ellipses as 24-gons (a gap to a
 *  round table is measured to the round, not to its bounding square); a custom or multi-part shape
 *  by its bounding box, which is what its width × depth state. */
function outlineOf(fp: Footprint): Pt[] {
  const ring = (rx: number, ry: number) => Array.from({ length: 24 }, (_, i) => ({ x: rx * Math.cos((i / 24) * Math.PI * 2), y: ry * Math.sin((i / 24) * Math.PI * 2) }));
  if (fp.kind === "circle") return ring(fp.diameterMm / 2, fp.diameterMm / 2);
  if (fp.kind === "ellipse") return ring(fp.widthMm / 2, fp.depthMm / 2);
  const b = footprintBounds(fp);
  return [
    { x: -b.w / 2, y: -b.h / 2 },
    { x: b.w / 2, y: -b.h / 2 },
    { x: b.w / 2, y: b.h / 2 },
    { x: -b.w / 2, y: b.h / 2 },
  ];
}

/** Into the room through the same translate · rotate · flip `placed` draws with. */
function toWorld(pts: Pt[], at: Pt, rotation: number, mirrored?: boolean, scale = 1): Pt[] {
  return pts.map((q) => fromLocalFrame({ x: (mirrored ? -q.x : q.x) * scale, y: q.y * scale }, at, rotation || 0));
}

export function PlacementMap({
  doc,
  plan,
  sheet = sheetById("hall")!,
  title = "",
  subtitle,
  studio,
  sheetNumber = 1,
  sheetCount = 1,
  version = 1,
  date = new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }),
  north,
  legend: legendRows,
  paper,
  marginMm,
  railingAboveMm = null,
  letters,
  summary,
  bare,
  colour = false,
  mono = false,
  seatCounts = false,
}: {
  doc: DesignDocumentContent;
  plan: EventPlan;
  /** Draw it as the studio does — zone tints, plants as plants, ground textures, each table in its
   *  cloth's colour, items in their shades. For a CLIENT (the quote's sketch); every crew sheet is
   *  ink on white, which is what survives a photocopier. */
  colour?: boolean;
  /** The B&W booklet: every element filled with its kind's flat grey (MONO), the venue flattened. */
  mono?: boolean;
  /** Write each table's people count under its number ("12 איש"). */
  seatCounts?: boolean;
  sheet?: PlanSheet;
  /** The studio's railing rule (settings → במות) — null when it is off. */
  railingAboveMm?: number | null;
  /** Table id → its design kit's letter (lib/outputs/table-kits.ts), printed under the number. */
  letters?: Map<string, string>;
} & Partial<Omit<SheetFrameProps, "world" | "children" | "sheet">>) {
  // `sheet` and the rest of SheetFrame's own props are optional here, defaulting to the hall plan
  // at page one of one, so the component stays correct and self-contained for any caller that only
  // wants "the plan" without choosing a sheet.
  //
  // Only the DRAWING. The table schedule and the stage build used to be rendered here as extra pages
  // after every sheet, so a set of five sheets over two zones printed the same schedule ten times;
  // the set (outputs-screen.tsx) now places each once (KitSchedule, StageSchedule below).
  const pad = MAP_PAD_MM;
  // Framed on the zones this event occupies. Walls, doors and features are all drawn from the venue
  // structure, and the frame is what keeps the rest of the property off the crew's page — an
  // adjacent room's wall crops at the edge instead of being special-cased out.
  const box = plan.bounds;
  // The property AS THIS EVENT ARRANGED IT. The crew is handed this page to set a room up from, so a
  // bar the designer pushed across the floor has to be drawn where they pushed it — a map showing
  // the bar where the venue keeps it is a map of a room nobody is building. Walls, doors and zones
  // are the property's and are unchanged; only the features move (lib/design-document/features.ts).
  const structure = arrangedStructure(plan.structure, doc);
  const nodes = nodeMap(structure);
  // Which side of each wall is inside, so a door swings into the room it belongs to.
  const faces = detectFaces(structure);
  // A feature counts as on this sheet when it stands inside the frame — the sheet frames one zone
  // and clips the rest of the property, so a pool two courtyards away is not in its key.
  const inFrame = (pt: { x: number; y: number }) =>
    pt.x >= box.minX - pad && pt.x <= box.maxX + pad && pt.y >= box.minY - pad && pt.y <= box.maxY + pad;
  const framedFeatures = structure.features.filter((f) => inFrame(f));

  // SheetFrame draws children in WORLD millimetres with the drawing's own bounding box's top-left at
  // (0,0) — every wall, table and placement below is still authored in the venue's own absolute mm,
  // so the whole drawing is shifted once here rather than every coordinate being rebased by hand.
  const offsetX = pad - box.minX;
  const offsetY = pad - box.minY;

  /** The symbol key, built from what THIS sheet actually draws rather than from a fixed list — a
   *  key that names a pool on a sheet with no pool in it teaches the reader to stop trusting it.
   *  Only used when the caller has not supplied its own rows. */
  // WHICH CHAIR, on the chairs sheet. Most rooms are one chair, and then the key says so once
  // ("כיסאות: נפוליאון זהב") and the drawing carries nothing more. Only when tables differ does each
  // table get a numbered square naming its chair, numbered by how many tables take it — the default,
  // usually most of the room, is 1.
  const chairSheet = sheet.id === "chairs";
  const chairDefault = chairSheet ? defaultChair() : undefined;
  const seatedTables = chairSheet ? doc.tables.filter((t) => (t.seats ?? 0) > 0) : [];
  const chairCount = new Map<string, number>();
  for (const t of seatedTables) {
    const ch = chairOf(t, chairDefault) ?? "";
    chairCount.set(ch, (chairCount.get(ch) ?? 0) + (t.seats ?? 0));
  }
  const chairKinds = [...chairCount.entries()].sort((a, b) => b[1] - a[1]);
  const chairName = (id: string) => (id ? (resolve(id)?.label ?? "כיסא") : "כיסא (לא נבחר בקטלוג)");
  const chairMark = new Map(chairKinds.map(([id], i) => [id, String(i + 1)]));
  const chairKey: LegendRow[] =
    chairKinds.length === 1
      ? [{ label: `כיסאות: ${chairName(chairKinds[0][0])} · ${chairKinds[0][1]}`, swatch: "outline" }]
      : chairKinds.map(([id, n]) => ({ label: `${chairName(id)} · ${n}`, swatch: "mark" as const, mark: chairMark.get(id) }));

  // The stage sheet's key is the crew's: one row per height the decks on it stand at, in its colour.
  const deckHeights =
    sheet.id === "stage" && !mono
      ? [...new Set(doc.placements.flatMap((p) => (p.stage ? layStage(p.stage, deckOf).decks.map((d) => Math.round(d.heightMm / 10)) : [])))].sort((a, b) => a - b)
      : [];
  const symbolKey: LegendRow[] = [
    ...deckHeights.map((h) => ({ label: `${h} ס״מ`, swatch: "fill" as const, color: heightColour(h * 10) })),
    ...(chairSheet ? chairKey : []),
    ...(mono && framedFeatures.some((f) => f.kind === "stage") ? [{ label: "במה", swatch: "hatch-diagonal" as const }] : []),
    ...(mono && framedFeatures.some((f) => f.kind === "pool") ? [{ label: "בריכה", swatch: "hatch-cross" as const }] : []),
    ...(sheet.tables === "ghost" ? [{ label: "שולחן (להתמצאות בלבד)", swatch: "dot-ghost" as const }] : []),
    ...(sheet.layers.includes("ceiling") ? [{ label: "מעל גובה החתך", swatch: "overhead" as const }] : []),
  ];
  const world: Extent = mapWorld(box);

  // Placements filtered on the SHEET, never on a hard-coded category: `layers` picks which of the
  // document's placements belong on this drawing at all, and `groups` (when the sheet sets one)
  // narrows that further to one catalog department — the stage sheet's floor-layer filter would
  // otherwise draw every table and bar standing on the same floor.
  const shown = doc.placements.filter((p) => {
    if (!sheet.layers.includes(p.layer)) return false;
    if (sheet.categories) {
      const cat = resolve(p.variantId)?.product.category;
      if (!cat || !sheet.categories.includes(cat)) return false;
    }
    if (sheet.groups) {
      const cat = resolve(p.variantId)?.product.category;
      const group = cat ? CATEGORY_BY_ID[cat]?.group : undefined;
      if (!group || !sheet.groups.includes(group)) return false;
    }
    return true;
  });
  const shownIds = new Set(shown.map((p) => p.id));

  // Sorted by what they ARE, same split the studio canvas makes (canvas-stage.tsx): a cover is the
  // table's own surface and draws nothing separate, a drape hangs on a wall, a table-layer item
  // clusters on its table, a ceiling item is drawn overhead, and everything else is a free object on
  // the floor.
  const drapes: Placement[] = [];
  const ceilingItems: Placement[] = [];
  const floorItems: Placement[] = [];
  const chipsByTable = new Map<string, Placement[]>();
  const tableById = new Map(doc.tables.map((t) => [t.id, t]));
  const perched: Placement[] = [];
  for (const p of shown) {
    const r = resolve(p.variantId);
    if (p.perch) {
      perched.push(p); // on a stage's banquette — drawn there, below
      continue;
    }
    if (r?.anchor === "table") continue; // the table's own cloth — drawn as the table's surface
    if (r?.anchor === "wall") {
      drapes.push(p);
    } else if (p.layer === "table" && p.tableId) {
      chipsByTable.set(p.tableId, [...(chipsByTable.get(p.tableId) ?? []), p]);
    } else if (p.layer === "ceiling") {
      ceilingItems.push(p);
    } else {
      floorItems.push(p);
    }
  }

  // The cover each table wears, for the colour mode — read off the whole document, because a sheet
  // that shows only the floor still has tables wearing cloths.
  const clothOf = new Map<string, string>();
  if (colour) {
    for (const p of doc.placements) {
      if (p.layer !== "table" || !p.tableId) continue;
      const r = resolve(p.variantId);
      if (r?.anchor === "table") clothOf.set(p.tableId, r.swatch ?? "#f2eefb");
    }
  }

  const tableGroups = sheet.chairs ? tableGroupBoxes(doc) : [];
  const groupBox = new Map(tableGroups.map((g) => [g.id, g]));

  // STAGES. On every sheet they stand on, a stage is its outline, its raised levels (hatched, the
  // same ink the venue's own staging wears) and its flights of stairs. On the STAGE sheet it is also
  // the build: every deck, numbered front to back, and where a railing is needed — the drawing a
  // crew lays the decks from.
  const wallDistance: WallDistance = (pt) => nearestWall(plan.structure, pt)?.distanceMm ?? Infinity;
  const stages = floorItems.filter((p): p is StagePlacement => !!p.stage);
  // Stairs of two flush stages that run on into each other print as ONE run (edge-runs.ts), each
  // stage leaving its share out of its own glyph — the same rule the studio canvas draws by.
  const joinedRuns =
    stages.length > 1
      ? joinEdgeRuns(
          stages.flatMap((p) =>
            (p.stage.stairs ?? []).flatMap((st) => {
              const shape = edgeItemShape(p.stage, st, deckOf);
              return shape ? [{ stageId: p.id, itemId: st.id, shape: edgeItemInRoom(p, shape) }] : [];
            }),
          ),
        )
      : [];
  const joinedIds = joinedItemIds(joinedRuns);
  // Design items on a banquette, spread along it as the studio draws them.
  const perchedSpots = (() => {
    const out: { p: Placement; at: { x: number; y: number } }[] = [];
    const groups = new Map<string, Placement[]>();
    for (const p of perched) groups.set(`${p.perch!.stageId}|${p.perch!.itemId}`, [...(groups.get(`${p.perch!.stageId}|${p.perch!.itemId}`) ?? []), p]);
    for (const [k, list] of groups) {
      const [stageId, itemId] = k.split("|");
      const st = doc.placements.find((x) => x.id === stageId);
      const bench = st?.stage ? benchInRoom(st as StagePlacement, itemId, deckOf) : null;
      if (!bench) continue;
      list.forEach((p, i) => out.push({ p, at: bench.along((i + 0.5) / list.length - 0.5) }));
    }
    return out;
  })();
  const buildSheet = sheet.id === "stage";

  // ONE FLOOR STACK, back to front, in the studio's own order (lib/design-document/stacking.ts).
  // Tables and floor items used to be two fixed passes — every table, then every stage — so a stage
  // painted its white deck over the tables standing on it and only their numbers showed. Whatever the
  // studio draws on top is drawn on top here. A table's chairs are painted immediately under it, and
  // a block's ring under the first of its members.
  //
  // And the studio's own rule — the smaller thing stands on the bigger one (autoStack) — applied to
  // the WHOLE floor here, not only to what was last dragged. In the studio it runs on a drag; a
  // table that came to be on a stage any other way (the stage drawn round the tables, a sketch
  // loaded in) keeps the order it had, and a printed plan with a row of numbers floating on a blank
  // stage is the result. Nothing is written back: this only decides what is painted over what.
  const floorIds = new Set(floorItems.map((p) => p.id));
  const rawStack = floorStack(doc, (p) => (floorIds.has(p.id) ? (resolve(p.variantId)?.sizing === "stretch" ? "carpet" : "item") : undefined));
  const boxOf = (pts: Pt[]): StackBox => {
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, widthMm: maxX - minX, depthMm: maxY - minY };
  };
  const stackBoxes = new Map<string, StackBox>();
  for (const t of doc.tables) stackBoxes.set(`table:${t.id}`, boxOf(toWorld(outlineOf(tableFootprint(t)), t.position, t.rotation, t.mirrored)));
  for (const p of floorItems) {
    const r = resolve(p.variantId);
    const outline = p.stage ? p.stage.outline : outlineOf(r?.sizing === "stretch" ? { kind: "rect", ...(p.sizeMm ?? fallbackSize(r)) } : placementFootprint(p));
    stackBoxes.set(`placement:${p.id}`, boxOf(toWorld(outline, p.position, p.rotation, p.mirrored, p.stage ? 1 : p.scale || 1)));
  }
  const risen = new Map(autoStack(rawStack, stackBoxes, rawStack.map((e) => e.ref)).map((a) => [`${a.kind}:${a.id}`, a.order]));
  const stackOrder = rawStack
    .map((e) => ({ ...e, order: risen.get(`${e.ref.kind}:${e.ref.id}`) ?? e.order }))
    .sort((a, b) => a.order - b.order || a.seq - b.seq);
  const firstOfGroup = new Map<string, string>();
  for (const e of stackOrder) {
    if (e.ref.kind !== "table") continue;
    const g = tableById.get(e.ref.id)?.groupId;
    if (g && !firstOfGroup.has(g)) firstOfGroup.set(g, e.ref.id);
  }
  const placementById = new Map(floorItems.map((p) => [p.id, p]));

  // THE MEASURED THINGS, as world polygons (lib/outputs/measurements.ts): every table without its
  // chairs, and every element the crew places by tape — a stage, a rug, anything with a side of
  // 1.5m or more. Built once here; which figures are drawn from them is the sheet's choice.
  const solids: Solid[] = [];
  if (sheet.tables !== "none") {
    for (const t of doc.tables) solids.push({ id: t.id, kind: "table", polygon: toWorld(outlineOf(tableFootprint(t)), t.position, t.rotation, t.mirrored) });
  }
  for (const p of floorItems) {
    if (p.stage) {
      solids.push({ id: p.id, kind: "stage", polygon: toWorld(p.stage.outline, p.position, p.rotation, p.mirrored) });
      continue;
    }
    const r = resolve(p.variantId);
    const fp: Footprint = r?.sizing === "stretch" ? { kind: "rect", ...(p.sizeMm ?? fallbackSize(r)) } : placementFootprint(p);
    const b = footprintBounds(fp);
    const rug = r?.product.category === "rugs";
    if (!rug && Math.max(b.w, b.h) * (p.scale || 1) < 1500) continue;
    // A rug with curved sides is measured along them (lib/studio/rug-shape.ts), not by its box.
    const bows = rug && r?.sizing === "stretch" ? bowsOf(p) : undefined;
    const curved = bows && fp.kind === "rect" ? rugPolygon(fp.widthMm, fp.depthMm, bows) : null;
    solids.push({ id: p.id, kind: rug ? "rug" : "item", polygon: toWorld(curved ?? outlineOf(fp), p.position, p.rotation, p.mirrored, p.scale || 1) });
  }
  // The venue's own stairs and ramps (lib/venues/climb.ts). Nobody on the crew places them, so they
  // are never sized or tied — but a table has to keep their foot and head clear, so the gap to the
  // nearest table is measured and flagged, and no figure is written across them. By their real
  // outline: a curved flight is a band of a ring, not the box round it.
  for (const f of structure.features) {
    if (!isClimb(f.kind)) continue;
    const [polygon] = footprintPolygons(featureFootprint(f), { x: f.x, y: f.y }, f.rotationDeg ?? 0);
    if (polygon?.length >= 3) solids.push({ id: f.id, kind: "fixed", polygon });
  }
  const unitCentres = numberedUnits(doc).map((u) => {
    const members = doc.tables.filter((t) => u.tableIds.includes(t.id));
    return {
      x: members.reduce((n, t) => n + t.position.x, 0) / (members.length || 1),
      y: members.reduce((n, t) => n + t.position.y, 0) / (members.length || 1),
    };
  });
  // Walls as straight runs — a bowed wall sampled, so a stage is measured to where the wall IS. The
  // same runs the sketch ties a selected ceiling item to (lib/studio/hang.ts), so the live figure
  // and the printed one cannot come off different walls; the zone outlines go in as walls on both
  // sides too — measurements() adds `boundaries`, canvas-stage's hangWalls the zones.
  const walls = wallRuns(structure);
  const roomZones = plan.zones.filter((z) => z.boundary.length >= 3);
  // CEILING ITEMS by their hang point (the shape's visual centre), and the middle of the table or
  // element each hangs over — read off the whole document, not this sheet's filter, because the
  // ceiling sheet shows no floor items and a chandelier is still hung over the bar (lib/studio/hang.ts).
  const hangTargets = ceilingItems.length ? hangTargetsOf(doc, structure) : [];
  const hung = ceilingItems.map((p) => {
    const at = hangPointOf(p);
    const polygon = toWorld(outlineOf(placementFootprint(p)), p.position, p.rotation, p.mirrored, p.scale || 1);
    // Off the table it is LINKED to (Placement.over), even hanging past its rim — else what is under it.
    return { p, at, over: hangCentreOf(p, doc, hangTargets) ?? undefined, polygon, height: hangHeightOf(p, resolve(p.variantId)?.product) };
  });
  // Each item's height beside it, placed with the figures so none lands on another.
  const hangNotes = hung.flatMap(({ polygon, height }) => {
    if (height === undefined) return [];
    const xs = polygon.map((q) => q.x), maxY = Math.max(...polygon.map((q) => q.y));
    return [{ a: { x: Math.min(...xs), y: maxY }, b: { x: Math.max(...xs), y: maxY }, text: formatHang(height) }];
  });
  const measureInput: MeasureInput = {
    boundaries: roomZones.map((z) => z.boundary),
    walls,
    solids,
    centres: unitCentres,
    hung: hung.map(({ p, at, over }) => ({ id: p.id, at, over })),
  };
  const roomCentre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };

  // Doors, resolved once: drawn below, and an obstacle every figure on the sheet steps around.
  const doors = structure.entrances.flatMap((e) => {
    const wall = structure.walls.find((w) => w.id === e.wallId);
    const pts = wall ? wallPoints(structure, wall, nodes) : null;
    if (!wall || !pts) return [];
    const door = doorGeometry(pts.a, pts.b, e.distanceMm, e.widthMm, e.swingInward, wallInteriorHint(faces, pts.a, pts.b, wall.a, wall.b), e.doubleDoor, wall.curve ?? null);
    return [{ e, wall, pts, door }];
  });
  // The whole swing, both sides of the wall: a figure must not sit in the doorway either way. A
  // window sweeps nothing and stops no figure.
  const doorBoxes: Box[] = doors.filter(({ e }) => isDoor(e)).map(({ door, e }) => {
    const pts = [door.gapStart, door.gapEnd, ...door.leaves.flatMap((l) => [l.tip, l.arcTo])];
    const r = e.widthMm * 0.15;
    return {
      minX: Math.min(...pts.map((q) => q.x)) - r,
      minY: Math.min(...pts.map((q) => q.y)) - r,
      maxX: Math.max(...pts.map((q) => q.x)) + r,
      maxY: Math.max(...pts.map((q) => q.y)) + r,
    };
  });
  // Furniture keeps figures beside a line off it — tables with their chairs' reach. Elements (a
  // stage, a rug, a bar) are handed to the placer as their real OUTLINES instead (elementShapes): an
  // L-shaped stage's bounding box covers the empty corner where its own figures belong, and pushed
  // them off past the stage's end.
  const elementShapes = solids.filter((sd) => sd.kind !== "table").map((sd) => sd.polygon);
  const furnitureBoxes: Box[] = solids.filter((sd) => sd.kind === "table").map((sd) => {
    const grow = sd.kind === "table" && sheet.chairs ? CHAIR_D_MM + 80 : 0;
    return {
      minX: Math.min(...sd.polygon.map((q) => q.x)) - grow,
      minY: Math.min(...sd.polygon.map((q) => q.y)) - grow,
      maxX: Math.max(...sd.polygon.map((q) => q.x)) + grow,
      maxY: Math.max(...sd.polygon.map((q) => q.y)) + grow,
    };
  });

  return (
      <SheetFrame
        world={world}
        sheet={sheet}
        title={title}
        subtitle={subtitle}
        studio={studio}
        sheetNumber={sheetNumber}
        sheetCount={sheetCount}
        version={version}
        date={date}
        north={north}
        legend={legendRows ?? symbolKey}
        summary={summary}
        paper={paper}
        marginMm={marginMm}
        bare={bare}
      >
        {/* A function of the fitted scale, so every figure below is sized in PRINTED millimetres
            (`den * mm`) — the crew reads the page, and a number authored in room millimetres is a
            smudge at 1:500 and a headline at 1:50. */}
        {(den: number) => (
        <g transform={`translate(${offsetX} ${offsetY})`}>
          {/* Zone floors — white ground for the rooms being set up */}
          {plan.zones
            .filter((r) => r.boundary.length >= 3)
            .map((r) => (
              <g key={r.zone.id}>
                <path
                  d={outlinePathD(r.boundary)}
                  fill={
                    r.zone.surface && mono
                      ? MONO.ground
                      : colour
                        ? resolveStyle(r.zone.style, "screen", { fill: ZONE_TINT[r.zone.kind] ?? "#ffffff", stroke: "none", strokeWidth: 0 }).fill
                        : "#ffffff"
                  }
                  stroke="none"
                />
                {/* A zone laid in a material (Zone.surface) prints it, as a ground feature does —
                    flattened to the ground's pale tone in the B&W booklet, above. */}
                {r.zone.surface && !mono && <ZoneSurface boundary={r.boundary} material={r.zone.surface} id={`q-${r.zone.id}`} color={r.zone.style?.fill && /^#[0-9a-f]{6}$/i.test(r.zone.style.fill) ? r.zone.style.fill : undefined} />}
              </g>
            ))}
          {/* Walls. An "edge" (a terrace lip, a rim) prints lighter and dashed — never as something
              the crew would read as a wall they cannot carry a table through. */}
          {structure.walls.map((w) => {
            const pts = wallPoints(structure, w, nodes);
            if (!pts) return null;
            const isEdge = w.kind === "edge";
            const common = {
              fill: "none",
              stroke: isEdge ? MUTED : INK,
              strokeWidth: isEdge ? LINE_WEIGHTS.feature : LINE_WEIGHTS.wall,
              strokeDasharray: isEdge ? "220 160" : undefined,
              vectorEffect: "non-scaling-stroke" as const,
            };
            if (w.curve) {
              const { c1, c2 } = absoluteControlPoints(pts.a, pts.b, w.curve);
              return <path key={w.id} d={`M ${pts.a.x} ${pts.a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${pts.b.x} ${pts.b.y}`} {...common} />;
            }
            return <line key={w.id} x1={pts.a.x} y1={pts.a.y} x2={pts.b.x} y2={pts.b.y} {...common} />;
          })}
          {/* Doors — the gap struck through the wall, and the leaf with its swing, exactly as the
              studio and the hall editor draw them (doorGeometry). It used to be the gap and the
              word "כניסה" underneath — always underneath, whatever way the wall ran, so on a side
              wall it sat inside the room among the tables. The symbol says which way the door
              opens and how far into the room it sweeps, which is what a crew laying a row next to
              it needs; the word said neither. */}
          {doors.map(({ e, wall, pts, door }) => {
            const len = wallLengthMm(pts.a, pts.b) || 1;
            const half = e.widthMm / 2;
            return (
              <g key={e.id}>
                {/* Struck along the wall as drawn — on a bowed wall a straight chord would print the
                    gap beside the wall instead of through it. Wider than the wall's own weight so it
                    fully erases the line underneath at any scale. */}
                <path
                  d={wallSegmentD(pts.a, pts.b, wall.curve ?? null, Math.max(0, (e.distanceMm - half) / len), Math.min(1, (e.distanceMm + half) / len))}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={LINE_WEIGHTS.wall * 2}
                  vectorEffect="non-scaling-stroke"
                />
                {/* A window: the glazing across the gap, a printed millimetre either side of the wall. */}
                {isWindow(e) && <WindowGlazing a={door.gapStart} b={door.gapEnd} offsetMm={0.9 * den} stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} glassWidth={LINE_WEIGHTS.annotation * 0.7} />}
                {!isWindow(e) && door.leaves.map((leaf, i) => (
                  <g key={i}>
                    <line x1={leaf.hinge.x} y1={leaf.hinge.y} x2={leaf.tip.x} y2={leaf.tip.y} stroke={INK} strokeWidth={LINE_WEIGHTS.furniture} vectorEffect="non-scaling-stroke" />
                    <path
                      d={`M ${leaf.tip.x} ${leaf.tip.y} A ${leaf.lenMm} ${leaf.lenMm} 0 0 ${leaf.sweepFlag} ${leaf.arcTo.x} ${leaf.arcTo.y}`}
                      fill="none"
                      stroke={INK_SOFT}
                      strokeWidth={LINE_WEIGHTS.annotation}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                ))}
              </g>
            );
          })}
          {/* Venue features in their own colours, as the quote and the studio draw them — the crew
              sheets too: a lawn, a palm and a pool read faster in colour than as labelled outlines.
              Flattened to one pale tone each in the B&W booklet (`mono`). */}
          {groundFirst(structure.features).map((f) => <ColourFeature key={f.id} f={f} den={den} mono={mono} pieces={f.kind === "curtain" ? curtainPieces(structure, f) : undefined} />)}

          {/* THE FLOOR, back to front (stackOrder). Tables: "full" is the studio's own shape and style;
              "ghost" flattens every table to the same faint dot pattern, numbered only where the
              sheet asks (the chairs sheet) — a rigger needs to know which table is under a
              chandelier, not read the room's seating plan;
              "none" skips them outright. Chairs are derived from each table's own seat count (the
              rule lib/studio/seating.ts draws by) and painted just under their table, so its white
              top covers the front of every chair tucked under it. A block's ring goes round the
              outside of the whole block, not one ring per member. */}
          {stackOrder.map((entry) => {
            if (entry.ref.kind === "placement") {
              const p = placementById.get(entry.ref.id);
              if (!p) return null;
              return p.stage ? (
                <StageGlyph
                  key={p.id}
                  p={p as StagePlacement}
                  build={buildSheet}
                  railing={buildSheet ? railingRuns(p as StagePlacement, deckOf, railingAboveMm, wallDistance) : []}
                  label={stages.length > 1 ? `במה ${stages.indexOf(p as StagePlacement) + 1}` : undefined}
                  carries={doc.tables.some((t) => pointInPolygon(t.position, toWorld(p.stage!.outline, p.position, p.rotation, p.mirrored)))}
                  den={den}
                  skip={joinedIds.size ? joinedIds : undefined}
                  mono={mono}
                />
              ) : (
                <PlacementGlyph key={p.id} placement={p} x={p.position.x} y={p.position.y} colour={colour} mono={mono} textMm={2.6 * den} chairs={sheet.chairs} />
              );
            }
            if (sheet.tables === "none") return null;
            const t = tableById.get(entry.ref.id);
            if (!t) return null;
            const ring = sheet.chairs && t.groupId && firstOfGroup.get(t.groupId) === t.id ? groupBox.get(t.groupId) : undefined;
            return (
              <Fragment key={t.id}>
                {ring && ring.seats > 0 && (
                  <g transform={ring.transform}>
                    {ring.chairs.map((st, i) => (
                      <ChairGlyph key={i} seat={st} colour={colour} mono={mono} />
                    ))}
                  </g>
                )}
                {sheet.chairs && !t.groupId && t.seats ? (
                  <g transform={placed(t.position, t.rotation, t.mirrored)}>
                    {seatsAround(tableFootprint(t), t.seats, undefined, tableBlockedSides(t)).map((st, i) => (
                      <ChairGlyph key={i} seat={st} colour={colour} mono={mono} />
                    ))}
                  </g>
                ) : null}
                {sheet.tables === "ghost" ? <GhostTable t={t} /> : <TableGlyph t={t} colour={colour} mono={mono} cloth={clothOf.get(t.id)} />}
              </Fragment>
            );
          })}

          {/* Numbers are drawn per NUMBERED UNIT, not per table: a block of four pushed together
              carries one number, in the middle of the block, exactly as it does on the studio plan.
              On every sheet that numbers its tables — the chairs sheet's ghosted ones too, which is
              where the crew setting chairs reads both the number and how many chairs go round it.
              Under the number, in ONE stack centred on the table so nothing lands on anything else:
              the count, the kit letter, the chair-type mark. */}
          {sheet.tables !== "none" &&
            sheet.numbers &&
            numberedUnits(doc, benchOf).map((unit) => {
              // A standalone banquette somebody sits at is numbered like a table, at its centre (the
              // strip is a rectangle, whose label point IS its centre); it wears no kit letter. Only
              // where this sheet draws it — the chairs sheet draws no placements.
              const benchP = unit.kind === "bench" ? doc.placements.find((x) => x.id === unit.id) : undefined;
              if (benchP && !shownIds.has(benchP.id)) return null;
              const bench = benchP ? standaloneBench(benchP, benchOf) : null;
              const members = doc.tables.filter((x) => unit.tableIds.includes(x.id));
              if (members.length === 0 && !bench) return null;
              // Numbered where the studio numbers it — a lone table at its shape's own label point
              // (tableLabelPoint: the middle of the band on an arc, not the box centre out in the air
              // the ring curves round), a block at the visual centre of the one outline its tables
              // make (blockLabelRoom — on the top run of a ח of three, not between its legs).
              const blk = members.length > 1 ? tableBlock(members) : null;
              const at = benchP
                ? benchP.position
                : blk
                  ? blockLabelRoom(blk)
                  : tableLabelPoint(members[0]);
              // As big as the table allows, between 2.4mm (still legible held at arm's length) and
              // 4mm on paper (a numeral the crew can find across the room once the sheet is taped
              // to a wall). The table's own short side is the ceiling, so a number stays inside it.
              const short = bench
                ? bench.depthMm
                : Math.max(...members.map((x) => {
                    const b = footprintBounds(tableFootprint(x));
                    return Math.min(b.w, b.h);
                  }));
              const size = Math.max(2.4 * den, Math.min(4 * den, short * 0.42));
              // The kit letter rides under the number in a ring — "which arrangement goes on this
              // table" answered at the table, with the detail sheet of that letter behind it.
              const letter = members[0] ? letters?.get(members[0].id) : undefined;
              // How many people sit at it ("12 איש", the quote's sketch) or how many chairs go round
              // it ("12 כיסאות", the chairs sheet) — a block counts as the one table it is
              // (groupSeats). A banquette's sofa side seats people but takes no chairs.
              const seated = bench ? bench.seats : members.length > 1 && members[0].groupId ? groupSeats(doc, members[0].groupId) : members.reduce((n, x) => n + (x.seats ?? 0), 0);
              const count = seatCounts ? seated : sheet.chairCounts ? (bench ? bench.chairs.length : seated) : 0;
              const countText = seatCounts ? `${count} איש` : count === 1 ? "כיסא אחד" : `${count} כיסאות`;
              // On the chairs sheet the count IS the content, so it never drops under 2mm on paper.
              const countSize = sheet.chairCounts ? Math.max(2 * den, size * 0.6) : size * 0.56;
              // On a coloured cloth, or over a ghosted table's dots and the chairs round it, a figure
              // needs a white halo to stay readable.
              const haloed = colour || sheet.tables === "ghost";
              const halo = (width: number) => (haloed ? { stroke: "#ffffff", strokeWidth: width, strokeLinejoin: "round" as const, paintOrder: "stroke" } : {});
              // Which chair goes round it, when the room has more than one kind — one square per kind
              // its seated members take (a block may mix them).
              const marks =
                chairSheet && chairKinds.length > 1 && count > 0
                  ? [...new Set(members.filter((x) => (x.seats ?? 0) > 0).map((x) => chairMark.get(chairOf(x, chairDefault) ?? "")))].filter((m): m is string => !!m)
                  : [];
              const k = 3.4 * den;
              const rows: { key: string; h: number; draw: (y: number) => React.ReactNode }[] = [];
              if (!unit.unnumbered)
                rows.push({
                  key: "number",
                  h: size,
                  draw: (y) => (
                    <text x={at.x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={700} fontFamily="Assistant, sans-serif" fill={INK} {...halo(size * 0.16)}>
                      {unit.number > 0 ? unit.number : "ראש"}
                    </text>
                  ),
                });
              if (count > 0)
                rows.push({
                  key: "count",
                  h: countSize * 1.1,
                  draw: (y) => (
                    <text x={at.x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={countSize} fontWeight={600} fontFamily="Assistant, sans-serif" fill={INK_SOFT} direction="rtl" {...halo(countSize * 0.18)}>
                      {countText}
                    </text>
                  ),
                });
              if (letter)
                rows.push({
                  key: "letter",
                  h: size * 1.08,
                  draw: (y) => (
                    <g transform={`translate(${at.x} ${y})`}>
                      <circle r={size * 0.38} fill="#ffffff" stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
                      <text textAnchor="middle" dominantBaseline="central" fontSize={size * 0.5} fontWeight={700} fontFamily="Assistant, sans-serif" fill={INK}>
                        {letter}
                      </text>
                    </g>
                  ),
                });
              if (marks.length > 0)
                rows.push({
                  key: "chair",
                  h: k * 1.25,
                  draw: (y) =>
                    marks.map((m, i) => (
                      <g key={m} transform={`translate(${at.x + (i - (marks.length - 1) / 2) * k * 1.2} ${y})`}>
                        <rect x={-k / 2} y={-k / 2} width={k} height={k} rx={0.5 * den} fill="#ffffff" stroke={INK} strokeWidth={LINE_WEIGHTS.furniture} vectorEffect="non-scaling-stroke" />
                        <text textAnchor="middle" dominantBaseline="central" fontSize={k * 0.62} fontWeight={700} fontFamily="Assistant, sans-serif" fill={INK} className="nums">
                          {m}
                        </text>
                      </g>
                    )),
                });
              const total = rows.reduce((n, r) => n + r.h, 0);
              const tops = rows.map((_, i) => rows.slice(0, i).reduce((n, r) => n + r.h, 0));
              return (
                <Fragment key={unit.id}>
                  {rows.map((r, i) => (
                    <Fragment key={r.key}>{r.draw(at.y - total / 2 + tops[i] + r.h / 2)}</Fragment>
                  ))}
                </Fragment>
              );
            })}

          {/* Edge items that run on from one stage onto the next, printed once as the one run they are
              (each stage left its share out of its own glyph above). */}
          {joinedRuns.map((r, i) => (
            <JoinedRunGlyph key={`run-${i}`} run={r} />
          ))}

          {/* Table-layer items — clustered on their table, like the studio canvas draws them. */}
          {[...chipsByTable.entries()].flatMap(([tableId, chips]) => {
            const t = tableById.get(tableId);
            if (!t) return [];
            // A block laid out automatically is laid out as one, as on screen (dressBlockOf).
            return dressingSpots(t, chips, dressBlockOf(doc.tables, t, (id) => chipsByTable.get(id) ?? [])).map(({ p, at, rotation, footprint }) => (
              <PlacementGlyph key={p.id} placement={{ ...p, rotation }} x={at.x} y={at.y} shape={footprint} colour={colour} />
            ));
          })}

          {perchedSpots.map(({ p, at }) => (
            <PlacementGlyph key={p.id} placement={p} x={at.x} y={at.y} colour={colour} />
          ))}

          {/* Drapes — a band along the wall they hang on. */}
          {drapes.map((p) => {
            if (!p.span) return null;
            // The property's own walls, not the arranged copy — nothing on this surface moves a
            // wall, so a drape always measures itself against the real one.
            const resolved = resolveSpan(plan.structure, p.span);
            if (!resolved) return null;
            // Centred on the wall's own line — round the bow on a curved wall (lib/studio/anchor.ts).
            return (
              <g key={p.id}>
                <path
                  d={polygonD(spanBand(resolved.track, resolved.t0, resolved.t1, -DRAPE_MM / 2, DRAPE_MM / 2))}
                  fill={colour ? (resolve(p.variantId)?.swatch ?? "#efe9df") : mono ? MONO.drape : "none"}
                  stroke={INK}
                  strokeWidth={LINE_WEIGHTS.overhead}
                  strokeDasharray={OVERHEAD_DASH}
                  vectorEffect="non-scaling-stroke"
                />
                <DrapePleatsAlong line={resolved.path} depthMm={DRAPE_MM} ink={INK} opacity={0.6} />
              </g>
            );
          })}

          {/* Ceiling items — overhead, so drawn (never filled) and dashed by FootprintShape's own
              `overhead` prop, the one convention every surface that draws this plan shares. */}
          {ceilingItems.map((p) => (
            <PlacementGlyph key={p.id} placement={p} x={p.position.x} y={p.position.y} overhead colour={colour} />
          ))}

          {/* Every figure on the sheet — the room's overall size and whatever this sheet measures —
              through one placer that keeps numbers off doors, furniture and each other. */}
          <MeasureLayer
            input={measureInput}
            opts={{ overall: !bare, ...sheet.measure, offsetMm: 900 }}
            den={den}
            obstacles={doorBoxes}
            furniture={furnitureBoxes}
            shapes={[...elementShapes, ...hung.map((h) => h.polygon)]}
            roomCentre={roomCentre}
            notes={hangNotes}
          />
        </g>
        )}
      </SheetFrame>
  );
}

/** Adjustable legs under one deck — the ordinary staging deck stands on four. */
const LEGS_PER_DECK = 4;

/** The size a stage ramp's slope is printed at: the sheet's 2.6 printed mm, or what the ramp has
 *  room for, and nothing at all under 1.5 printed mm — a figure that cannot be read is a smudge. */
function slopeSize(widthMm: number, depthMm: number, den: number): number | undefined {
  const size = Math.min(2.6 * den, slopeTextSize(widthMm, depthMm));
  return size >= 1.5 * den ? size : undefined;
}

/** A run of stairs (a banquette, a barrier) across two stages (edge-runs.ts), in room coordinates. */
function JoinedRunGlyph({ run }: { run: JoinedRun }) {
  const points = run.polygon.map((q) => `${q.x},${q.y}`).join(" ");
  if (run.kind === "barrier" || run.kind === "backdrop") {
    return (
      <polygon
        points={points}
        fill={run.kind === "backdrop" ? "url(#hatch-diagonal)" : INK}
        stroke={INK}
        strokeWidth={LINE_WEIGHTS.furniture * (run.kind === "backdrop" ? 2 : 1)}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  return (
    <g>
      <polygon points={points} fill="#ffffff" stroke={INK} strokeWidth={LINE_WEIGHTS.furniture} vectorEffect="non-scaling-stroke" />
      {run.treads.map(([u, v], k) => (
        <line key={k} x1={u.x} y1={u.y} x2={v.x} y2={v.y} stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
      ))}
      {/* One walking line up the whole run, as the venue's own stairs print theirs. */}
      {run.arrow && <WalkingLine arrow={run.arrow} ink={INK} lineWidth={LINE_WEIGHTS.annotation} fill="#ffffff" textFill={INK} alertFill={INK} />}
      {run.kind === "bench" && (
        <polyline
          points={run.midline.map((q) => `${q.x},${q.y}`).join(" ")}
          fill="none"
          stroke={INK_SOFT}
          strokeWidth={LINE_WEIGHTS.annotation}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

/** A stage on the drawing, in its own frame (the same one the studio lays its decks in). `skip`
 *  names the edge items printed as part of a run with another stage's (JoinedRunGlyph) — only
 *  their chairs are this glyph's. */
function StageGlyph({ p, build, railing, label, carries, den, skip, mono = false }: { p: StagePlacement; build: boolean; railing: EdgeRun[]; label?: string; carries?: boolean; den: number; skip?: ReadonlySet<string>; mono?: boolean }) {
  const stage = p.stage;
  const laid = build ? layStage(stage, deckOf) : null;
  const upright = uprightTransform(p.rotation, p.mirrored);
  const a = stage.outline[stage.front];
  const b = stage.outline[(stage.front + 1) % stage.outline.length];
  // "קהל" just outside the middle of the front, so the page says which way the stage faces.
  const mid = a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) || 1 : 1;
  const out = a && b ? { x: (b.y - a.y) / len, y: -(b.x - a.x) / len } : { x: 0, y: -1 };
  // The outward side of the front: away from the stage's middle (its frame's origin).
  const flip = mid && mid.x * out.x + mid.y * out.y < 0 ? -1 : 1;
  const audience = mid ? { x: mid.x + out.x * flip * 700, y: mid.y + out.y * flip * 700 } : null;
  const text = (x: number, y: number, body: string, size: number, weight = 400, fill = INK) => (
    <g transform={`translate(${x} ${y})`}>
      <text transform={upright} textAnchor="middle" dominantBaseline="central" fontFamily="Assistant, sans-serif" fontSize={size} fontWeight={weight} fill={fill}>
        {body}
      </text>
    </g>
  );
  return (
    <g transform={placed(p.position, p.rotation, p.mirrored)}>
      <polygon
        points={stage.outline.map((q) => `${q.x},${q.y}`).join(" ")}
        fill={mono ? MONO.stage : "#ffffff"}
        stroke={INK}
        strokeWidth={LINE_WEIGHTS.furniture}
        vectorEffect="non-scaling-stroke"
      />
      {/* A level is told by its decks' colour on the build sheet; elsewhere it is hatched. */}
      {(stage.levels ?? []).map((l) => (
        <polygon
          key={l.id}
          points={l.outline.map((q) => `${q.x},${q.y}`).join(" ")}
          fill={build ? "none" : "url(#hatch-diagonal)"}
          fillOpacity={0.35}
          stroke={INK}
          strokeWidth={LINE_WEIGHTS.furniture}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* The crew's drawing (the אמארה plan of 26.10): every deck in the colour of its height
          (lib/outputs/deck-colours.ts) and named by its size along its long side — "122-244". In
          black and white the colour is gone, so the height is written under the size instead. */}
      {laid?.decks.map((d, i) => {
        const fill = mono ? "#ffffff" : heightColour(d.heightMm);
        const ink = darkFill(fill) ? "#ffffff" : INK;
        const short = Math.min(d.widthMm, d.depthMm);
        const long = Math.max(d.widthMm, d.depthMm);
        // The size, as large as the deck's short side allows and a long one holds, never over 2.4
        // printed mm — a strip's too, small (the crew zooms the PDF) — and left off under 0.6mm.
        const size = Math.min(short * 0.42, long / 4.6, 2.2 * den);
        const along = d.rotation + (d.widthMm >= d.depthMm ? 0 : 90);
        const onPage = (((p.mirrored ? (p.rotation || 0) + 180 - along : (p.rotation || 0) + along) % 180) + 270) % 180 - 90;
        return (
          <g key={i}>
            {/* A piece standing whole (a disc, a half-round) is drawn as the shape it is; on a stage
                that IS the piece, that line is the stage's own outline. */}
            {d.outline ? (
              <polygon points={d.outline.map((q) => `${q.x},${q.y}`).join(" ")} fill={fill} stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
            ) : d.round ? (
              <ellipse cx={d.centre.x} cy={d.centre.y} rx={d.widthMm / 2} ry={d.depthMm / 2} transform={`rotate(${d.rotation} ${d.centre.x} ${d.centre.y})`} fill={fill} stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
            ) : (
              <rect
                x={-d.widthMm / 2}
                y={-d.depthMm / 2}
                width={d.widthMm}
                height={d.depthMm}
                transform={`translate(${d.centre.x} ${d.centre.y}) rotate(${d.rotation})`}
                fill={fill}
                stroke={INK}
                strokeWidth={LINE_WEIGHTS.annotation}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {size >= 0.6 * den && (
              <g transform={`translate(${d.centre.x} ${d.centre.y})${upright ? ` ${upright}` : ""} rotate(${onPage})`}>
                <text textAnchor="middle" dominantBaseline="central" y={mono ? -size * 0.45 : 0} fontFamily="Assistant, sans-serif" fontSize={size} fontWeight={500} fill={ink} direction="ltr" className="nums">
                  {deckLabel(d.widthMm, d.depthMm)}
                </text>
                {mono && (
                  <text textAnchor="middle" dominantBaseline="central" y={size * 0.65} fontFamily="Assistant, sans-serif" fontSize={size * 0.8} fill={INK_SOFT} direction="ltr" className="nums">
                    {`h${Math.round(d.heightMm / 10)}`}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}
      {/* A rim piece the studio does not have yet (a quarter-round, a curved deck): where it goes,
          dashed, and said — the crew is not handed a stage with an unexplained hole in it. */}
      {laid?.missing.map((m, i) => {
        const xs = m.outline.map((q) => q.x);
        const ys = m.outline.map((q) => q.y);
        const cx = m.outline.reduce((s, q) => s + q.x, 0) / m.outline.length;
        const cy = m.outline.reduce((s, q) => s + q.y, 0) / m.outline.length;
        const size = Math.min(260, Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.35);
        return (
          <g key={`missing-${i}`}>
            <polygon
              points={m.outline.map((q) => `${q.x},${q.y}`).join(" ")}
              fill="url(#hatch-diagonal)"
              fillOpacity={0.25}
              stroke={INK}
              strokeWidth={LINE_WEIGHTS.annotation}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            {size >= 60 && text(cx, cy, "חסר", size, 600)}
          </g>
        );
      })}
      {(stage.stairs ?? []).map((st) => {
        const shape = edgeItemShape(stage, st, deckOf);
        if (!shape) return null;
        if (skip?.has(st.id)) {
          return shape.chairs.length ? (
            <g key={st.id}>
              {shape.chairs.map((seat, k) => (
                <ChairGlyph key={`chair-${k}`} seat={seat} mono={mono} />
              ))}
            </g>
          ) : null;
        }
        // A barrier is solid ink along the inside of its edge; a banquette a plain strip with a
        // centre line (a seat, in plan); a flight with a line across each tread.
        if (shape.kind === "barrier" || shape.kind === "backdrop") {
          // On the edge, in solid ink — a backdrop twice a barrier's weight, and hatched.
          return (
            <polygon
              key={st.id}
              points={shape.polygon.map((q) => `${q.x},${q.y}`).join(" ")}
              fill={shape.kind === "backdrop" ? "url(#hatch-diagonal)" : INK}
              stroke={INK}
              strokeWidth={LINE_WEIGHTS.furniture * (shape.kind === "backdrop" ? 2 : 1)}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        return (
          <g key={st.id}>
            {shape.chairs.map((seat, k) => (
              <ChairGlyph key={`chair-${k}`} seat={seat} mono={mono} />
            ))}
            <polygon
              points={shape.polygon.map((q) => `${q.x},${q.y}`).join(" ")}
              fill="#ffffff"
              stroke={INK}
              strokeWidth={LINE_WEIGHTS.furniture}
              vectorEffect="non-scaling-stroke"
            />
            {shape.treads.map(([u, v], k) => (
              <line key={k} x1={u.x} y1={u.y} x2={v.x} y2={v.y} stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
            ))}
            {/* A flight's or a ramp's walking line and a ramp's slope, as the venue's own stairs
                print theirs (components/climb-glyph.tsx) — the slope at the sheet's text size, or
                smaller where the ramp has no room for it, and left off where it would not read. */}
            {shape.climb && (
              <WalkingLine
                arrow={shape.climb.arrow}
                slope={shape.climb.slope}
                ink={INK}
                lineWidth={LINE_WEIGHTS.annotation}
                fill="#ffffff"
                textSize={slopeSize(shape.widthMm, shape.depthMm, den)}
                textFill={INK}
                alertFill={INK}
                turnDeg={p.rotation}
                mirrored={p.mirrored}
              />
            )}
            {shape.kind === "bench" && (
              <polyline
                points={shape.midline.map((q) => `${q.x},${q.y}`).join(" ")}
                fill="none"
                stroke={INK_SOFT}
                strokeWidth={LINE_WEIGHTS.annotation}
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* A sofa side: its cushions inside the strip, the backrest toward the other half. */}
            {shape.kind === "bench" && <SofaCushions cushions={shape.cushions} backs={shape.backs} ink={INK} print />}
          </g>
        );
      })}
      {/* Corner pieces where two runs meet outside a corner. */}
      {stageCorners(stage, deckOf).map((c, i) => (
        <g key={`corner-${i}`}>
          <polygon points={c.polygon.map((q) => `${q.x},${q.y}`).join(" ")} fill="#ffffff" stroke={INK} strokeWidth={LINE_WEIGHTS.furniture} vectorEffect="non-scaling-stroke" />
          {c.treads.map(([u, v], k) => (
            <line key={k} x1={u.x} y1={u.y} x2={v.x} y2={v.y} stroke={INK} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ))}
      {railing.map((r, i) => (
        <polyline
          key={`rail-${i}`}
          points={r.path.map((q) => `${q.x},${q.y}`).join(" ")}
          fill="none"
          stroke={INK}
          strokeWidth={LINE_WEIGHTS.furniture * 2.5}
          strokeDasharray="1 3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {build && audience && text(audience.x, audience.y, "קהל", 2.4 * den, 600, INK_SOFT)}
      {/* The stage's name at its middle — not on a stage that carries tables: there it lands under
          their numbers, and moved outside it collides with the stage's own figures. A stage with
          tables on it is named by them, and by its sizes and chains. */}
      {label && !build && !carries && text(0, 0, label, 2.8 * den, 600, INK_SOFT)}
    </g>
  );
}

/** The build of every stage on the sheet, as a table a crew can tick off: the size, the height of
 *  the base and of each level, the decks per level, the flights (with their steps), the skirt, and
 *  the railing when the studio's rule asks for one. Counts only — this is a printing surface, and a
 *  price never goes near it (npm run check:costs). */
export function StageSchedule({
  stages,
  railingAboveMm,
  wallDistance,
  doc,
}: {
  stages: StagePlacement[];
  railingAboveMm: number | null;
  wallDistance: WallDistance;
  doc: DesignDocumentContent;
}) {
  const m = (mm: number) => (Math.round(mm / 10) / 100).toString();
  const cm = (mm: number) => Math.round(mm / 10);
  return (
    <section>
      <h3 className="mb-2 border-b border-ink pb-1 text-base font-semibold text-ink">פירוט במות</h3>
      {stages.map((p, i) => {
        const stage = p.stage;
        const laid = layStage(stage, deckOf);
        // A rounded or bowed rectangle is sized by its box, like a plain one by its sides.
        const size = stageRect(stage) ?? (stageShapeOf(stage) ? stageBox(stage) : null);
        // Rim pieces the studio does not have yet, by shape — said, so the crew knows what to bring.
        const missing = missingByShape(laid.missing);
        const baseH = stageHeight(stage, deckOf);
        const parts = [
          { id: undefined as string | undefined, label: "בסיס", heightMm: baseH },
          ...(stage.levels ?? []).map((l, k) => ({ id: l.id as string | undefined, label: `מפלס ${k + 1}`, heightMm: l.heightMm })),
        ];
        const rows = parts.map((part) => {
          const decks = laid.decks.filter((d) => d.level === part.id);
          // By the size the drawing writes on each deck ("122-244"), largest first.
          const bySize = new Map<string, { n: number; area: number; name?: string }>();
          for (const d of decks) {
            const k = d.outline ? (productName(d.typeId) ?? "פלטה בצורה") : deckLabel(d.widthMm, d.depthMm);
            const was = bySize.get(k);
            bySize.set(k, { n: (was?.n ?? 0) + 1, area: d.widthMm * d.depthMm, name: productName(d.typeId) ?? undefined });
          }
          const sizes = [...bySize.entries()].sort((a, b) => b[1].area - a[1].area);
          return { ...part, sizes, count: decks.length };
        });
        const shapes = (stage.stairs ?? []).map((st) => edgeItemShape(stage, st, deckOf)).filter((x) => !!x);
        const flights = shapes.filter((x) => x.kind === "stairs");
        const benchMm = shapes.filter((x) => x.kind === "bench").reduce((t, x) => t + x.widthMm, 0);
        const benchChairs = shapes.filter((x) => x.kind === "bench").reduce((t, x) => t + x.chairs.length, 0);
        const sofaSeats = shapes.filter((x) => x.kind === "bench").reduce((t, x) => t + x.sofaSeats, 0);
        const barrierMm = shapes.filter((x) => x.kind === "barrier").reduce((t, x) => t + x.widthMm, 0);
        const backdropMm = shapes.filter((x) => x.kind === "backdrop").reduce((t, x) => t + x.widthMm, 0);
        const ramps = shapes.filter((x) => x.kind === "ramp");
        const corners = stageCorners(stage, deckOf);
        const surface = stage.surfaceVariant ? productName(stage.surfaceVariant) : null;
        const bare = edgeGaps(p, deckOf, wallDistance).reduce((t, g) => t + g.lengthMm, 0);
        const dressing = doc.placements.filter((x) => x.perch?.stageId === p.id);
        const skirt = skirtMm(p, deckOf, wallDistance);
        const rail = railingRuns(p, deckOf, railingAboveMm, wallDistance).reduce((s, r) => s + r.lengthMm, 0);
        return (
          <div key={p.id} className="break-inside-avoid py-3">
            <p className="text-sm font-semibold text-ink">
              {stages.length > 1 ? `במה ${i + 1}` : "במה"}
              {size && <span className="nums ms-2 font-normal text-ink-soft">{`${m(size.widthMm)}×${m(size.depthMm)} מ׳`}</span>}
              <span className="nums ms-2 font-normal text-ink-soft">{laid.decks.length} פלטות</span>
              {missing.length > 0 && <span className="nums ms-2 font-normal text-ink-soft">{`חסרות בקטלוג: ${missing.map((g) => `${pieceName(g.info)} ×${g.count}`).join(" · ")}`}</span>}
            </p>
            <table className="mt-1.5 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs text-muted">
                  <th className="py-1 text-start font-medium">חלק</th>
                  <th className="py-1 text-start font-medium">גובה</th>
                  <th className="py-1 text-start font-medium">פלטות</th>
                  <th className="py-1 text-start font-medium">רגליים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td className="py-1.5 text-ink">{r.label}</td>
                    <td className="nums py-1.5 text-ink">
                      {/* The drawing's colour for this height — the key the crew reads the plan by. */}
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="inline-block h-3 w-3 rounded-[2px] border border-ink" style={{ background: heightColour(r.heightMm) }} />
                        {cm(r.heightMm)} ס״מ
                      </span>
                    </td>
                    <td className="py-1.5 text-ink">
                      {r.sizes.map(([label, x], k) => (
                        <span key={label} title={x.name}>
                          {k > 0 && " · "}
                          <span className="nums" dir="ltr">{label}</span> ×{x.n}
                        </span>
                      ))}
                      {r.sizes.length === 0 && "—"}
                    </td>
                    {/* Four adjustable legs to a deck, set to the part's height — what the crew
                        counts out and dials in before a deck goes down. */}
                    <td className="nums py-1.5 text-ink-soft">{r.count > 0 ? `${r.count * LEGS_PER_DECK} × ${cm(r.heightMm)} ס״מ` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-sm text-ink-soft">
              {flights.length > 0
                ? `מדרגות: ${flights.length} ${flights.length === 1 ? "גרם" : "גרמים"} — ${flights.map((f) => `${m(f.widthMm)} מ׳, ${f.risers} רומים של ${cm(f.riserMm)} ס״מ${f.inner ? " (שקועות בבמה)" : ""}`).join("; ")}`
                : "מדרגות: אין"}
              {benchMm > 0 ? ` · בנקט: ${m(benchMm)} מ׳ (${[benchChairs > 0 ? `${benchChairs} כיסאות` : null, sofaSeats > 0 ? `${sofaSeats} על ספה` : null].filter(Boolean).join(", ") || "ללא ישיבה"})` : ""}
              {barrierMm > 0 ? ` · מחסום: ${m(barrierMm)} מ׳` : ""}
              {backdropMm > 0 ? ` · קיר רקע: ${m(backdropMm)} מ׳` : ""}
              {ramps.length > 0 ? ` · רמפה: ${ramps.map((r) => `${m(r.depthMm)} מ׳ אורך`).join(", ")}` : ""}
              {corners.length > 0 ? ` · פינות: ${corners.length}` : ""}
              {surface ? ` · משטח: ${surface} (${m(stageAreaMm2(stage, deckOf) / 1000)} מ״ר)` : ""}
              {bare > 0 ? ` · ⚠ ${m(bare)} מ׳ שפה פתוחה` : ""}
              {" · "}
              {`חצאית: ${m(skirt)} מ׳`}
              {railingAboveMm ? ` · מעקה: ${rail > 0 ? `${m(rail)} מ׳ חסרים (קו מנוקד בשרטוט)` : "תקין"}` : ""}
            </p>
            {dressing.length > 0 && (
              <p className="mt-1 text-sm text-ink-soft">
                {`על הבנקט: ${dressing.map((x) => `${productName(x.variantId) ?? "פריט"}${x.quantity > 1 ? ` ×${x.quantity}` : ""}`).join(" · ")}`}
              </p>
            )}
          </div>
        );
      })}
      <p className="mt-2 text-xs text-muted">על כל פלטה בשרטוט כתובה מידתה בס״מ (122-244), וצבעה הוא צבע הגובה שלה. חזית הבמה היא הצד שמסומן ״קהל״.</p>
    </section>
  );
}

export function TableGlyph({ t, colour = false, mono = false, cloth }: { t: DesignTable; colour?: boolean; mono?: boolean; cloth?: string }) {
  // The catalog row's look under the table's own — the studio's merge (productStyle). Colour never
  // survives to print, but a dash or a weight chosen for the row has to: on paper they are what
  // carries the meaning the colour did on screen.
  const product = t.variantId ? resolve(t.variantId)?.product : undefined;
  const resolved = resolveStyle(productStyle(product, t.style), "monochrome", { fill: "#ffffff", stroke: INK, strokeWidth: LINE_WEIGHTS.furniture });
  const dash = resolved.dashArray.length ? resolved.dashArray.join(" ") : undefined;
  if (colour) {
    // As the studio draws it (canvas-stage.tsx, TableNode): a dressed table is its cloth — fabric
    // past the edge, the top in the cloth's colour, the table's own edge only a crease under it;
    // a bare one shows its row's fill and what it is made of.
    const screen = resolveStyle(productStyle(product, t.style), "screen", { fill: "#ffffff", stroke: INK, strokeWidth: LINE_WEIGHTS.furniture });
    const footprint = tableFootprint(t);
    const surfaced = !cloth && anySurface(product?.appearance);
    return (
      <g transform={placed(t.position, t.rotation, t.mirrored)}>
        {cloth && <ClothDrape footprint={footprint} colour={cloth} />}
        <FootprintShape
          footprint={footprint}
          fill={cloth ?? screen.fill}
          fillOpacity={cloth ? 1 : screen.fillOpacity}
          stroke={INK}
          strokeOpacity={cloth ? 0.25 : 1}
          strokeWidth={LINE_WEIGHTS.furniture}
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
        />
        {surfaced && <ItemSurface appearance={product?.appearance} footprint={footprint} color={t.style?.fill ?? product?.appearance?.style?.fill} seed={t.id} />}
      </g>
    );
  }
  return (
    <g>
      {/* The same outline the studio drew, through the same component — a table that carries a
          catalog row draws that row's real shape, so the חצי עיגול capping the head table is an arc
          on the crew's page too and not the 120×60 box its dimensions describe. */}
      {/* Through the table's own rotation as well as its position. Turning a table is new — nothing
          could set DesignTable.rotation until there was a handle for it — and a printed map that
          drew every table square while the studio showed them angled would send the crew to lay a
          room that is not the room on screen. */}
      <g transform={placed(t.position, t.rotation, t.mirrored)}>
        <FootprintShape
          footprint={tableFootprint(t)}
          fill={mono ? MONO.table : resolved.fill}
          stroke={resolved.stroke}
          strokeWidth={resolved.strokeWidth}
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </g>
  );
}

/** The ground first, so a lawn laid after the palms never buries them (venue-plan.tsx's rule). */
function groundFirst(features: StructureFeature[]): StructureFeature[] {
  return [...features.filter((f) => f.kind === "surface"), ...features.filter((f) => f.kind !== "surface")];
}

/** A venue feature as the studio draws it (venue-plan.tsx, FeatureNode): a plant is its picture, a
 *  surface its material, anything else its outline in its own style with its name. Every sheet —
 *  crew and quote — draws the venue this way.
 *
 *  `mono` (the B&W booklet) flattens it instead of greying its colours: the ground one pale tone, a
 *  plant its canopy's outline, a stage and a pool the hatches the key names, any other fixture one
 *  light grey whatever it is painted — so the furniture is what the eye finds, not a dark lawn. */
function ColourFeature({ f, den, mono = false, pieces }: { f: StructureFeature; den: number; mono?: boolean; pieces?: CurtainPiece[] }) {
  // The stage's flights and ramps — the sketch's own edge items, in the room (lib/venues/stage-edges.ts).
  const edges = featureEdgeShapes(f);
  const style = resolveStyle(f.style, "screen", { fill: "#ffffff", stroke: MUTED, strokeWidth: LINE_WEIGHTS.feature });
  if (mono) {
    const fp = featureFootprint(f);
    const round = fp.kind === "circle" || fp.kind === "ellipse";
    const dash = style.dashArray.length ? style.dashArray.join(" ") : undefined;
    return (
      <g>
        {edges.map(({ item, shape }) => (
          <g key={item.id}>
            <polygon points={shape.polygon.map((q) => `${q.x},${q.y}`).join(" ")} fill="#ffffff" stroke={MUTED} strokeWidth={LINE_WEIGHTS.feature} vectorEffect="non-scaling-stroke" />
            {shape.treads.map(([p, q], i) => (
              <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={MUTED} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
            ))}
            {shape.climb && <WalkingLine arrow={shape.climb.arrow} slope={shape.climb.slope} ink={INK_SOFT} lineWidth={LINE_WEIGHTS.annotation} fill="#ffffff" textSize={slopeSize(shape.widthMm, shape.depthMm, den)} textFill={INK_SOFT} alertFill={INK} turnDeg={f.rotationDeg} />}
          </g>
        ))}
        <g transform={f.rotationDeg ? `rotate(${f.rotationDeg} ${f.x} ${f.y})` : undefined}>
          <g transform={`translate(${f.x} ${f.y})`}>
            {f.kind === "surface" ? (
              <FootprintShape footprint={fp} fill={MONO.ground} stroke={MUTED} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
            ) : isClimb(f.kind) ? (
              <ClimbGlyph
                f={f}
                turnDeg={f.rotationDeg}
                fill="#ffffff"
                stroke={MUTED}
                strokeWidth={LINE_WEIGHTS.feature}
                lineWidth={LINE_WEIGHTS.annotation}
                ink={INK_SOFT}
                textSize={2.6 * den}
                textFill={INK_SOFT}
                alertFill={INK}
              />
            ) : f.kind === "seating" ? (
              // The venue's chairs in rows, as a sketch's block prints: each chair in the chairs'
              // grey, and round them the line the crew sets them out by, at a note's weight.
              <>
                <SeatingGlyph spec={seatingOf(f)} tone={MONO.chair} ink={INK} print />
                <FootprintShape footprint={fp} fill="none" stroke={MUTED} strokeWidth={LINE_WEIGHTS.annotation} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              </>
            ) : f.kind === "curtain" ? (
              // The venue's curtain as a hired drape prints: the band in the elements' grey, pleated,
              // in the pieces its doors leave it, round the bow on a curved wall.
              <CurtainCloth pieces={pieces ?? []} depthMm={CURTAIN_DEPTH_MM} fill={MONO.feature} ink={INK} opacity={0.6} />
            ) : f.kind === "fountain" ? (
              // A fountain as the catalog's prints: white basin, ink lines.
              <ItemSymbol kind="fountain" footprint={fp} count={1} print ink={INK} tone="#ffffff" />
            ) : f.kind === "column" ? (
              // A column: its plinth white, the shaft in the elements' grey so it reads solid.
              <ColumnGlyph f={f} fill="#ffffff" stroke={MUTED} strokeWidth={style.strokeWidth} shaftFill={MONO.feature} />
            ) : f.kind === "plant" ? (
              // The plan symbol for a tree: its canopy's edge and the trunk at its middle.
              <>
                <FootprintShape footprint={fp} fill="none" stroke={MUTED} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
                {round && <circle r={Math.min(f.widthMm, f.depthMm) * 0.06} fill={MUTED} />}
              </>
            ) : (
              <FootprintShape
                footprint={fp}
                fill={f.kind === "stage" ? "url(#hatch-diagonal)" : f.kind === "pool" ? "url(#hatch-cross)" : MONO.feature}
                stroke={MUTED}
                strokeWidth={style.strokeWidth}
                strokeDasharray={dash}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        </g>
        {f.kind !== "plant" && f.kind !== "surface" && f.kind !== "seating" && f.kind !== "column" && f.kind !== "fountain" && f.kind !== "curtain" && !isClimb(f.kind) && f.label && (
          <text x={f.x} y={f.y} textAnchor="middle" dominantBaseline="central" fontSize={2.6 * den} fontFamily="Assistant, sans-serif" fill={INK_SOFT} stroke="#ffffff" strokeWidth={0.5 * den} strokeLinejoin="round" paintOrder="stroke">
            {f.label}
          </text>
        )}
      </g>
    );
  }
  return (
    <g>
      {edges.map(({ item, shape }) => (
        <g key={item.id}>
          <polygon points={shape.polygon.map((q) => `${q.x},${q.y}`).join(" ")} fill="#f7f6fa" stroke={MUTED} strokeWidth={LINE_WEIGHTS.feature} vectorEffect="non-scaling-stroke" />
          {shape.treads.map(([p, q], i) => (
            <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={MUTED} strokeWidth={LINE_WEIGHTS.annotation} vectorEffect="non-scaling-stroke" />
          ))}
          {shape.climb && <WalkingLine arrow={shape.climb.arrow} slope={shape.climb.slope} ink={INK_SOFT} lineWidth={LINE_WEIGHTS.annotation} fill="#f7f6fa" textSize={slopeSize(shape.widthMm, shape.depthMm, den)} textFill={INK_SOFT} alertFill={INK} turnDeg={f.rotationDeg} />}
        </g>
      ))}
      <g transform={f.rotationDeg ? `rotate(${f.rotationDeg} ${f.x} ${f.y})` : undefined}>
        <g transform={`translate(${f.x} ${f.y})`}>
          {f.kind === "surface" || f.kind === "pool" ? (
            // The pool is water (the same texture the screen draws it in); the booklet's mono look
            // above hatches it instead, as its key says.
            <SurfaceFill material={f.kind === "pool" ? "water" : surfaceMaterial(f)} footprint={featureFootprint(f)} w={f.widthMm} d={f.depthMm} id={`q-${f.id}`} color={f.style?.fill} opacity={f.style?.fillOpacity} />
          ) : isClimb(f.kind) ? (
            <ClimbGlyph
              f={f}
              turnDeg={f.rotationDeg}
              fill={f.style?.fill ?? "#f7f6fa"}
              stroke={MUTED}
              strokeWidth={LINE_WEIGHTS.feature}
              lineWidth={LINE_WEIGHTS.annotation}
              ink={INK_SOFT}
              textSize={2.6 * den}
              textFill={INK_SOFT}
              alertFill={INK}
            />
          ) : f.kind === "plant" ? (
            <PlantGlyph species={plantSpecies(f)} w={f.widthMm} d={f.depthMm} id={`q-${f.id}`} color={f.style?.fill} opacity={f.style?.fillOpacity} />
          ) : f.kind === "seating" ? (
            <SeatingGlyph spec={seatingOf(f)} tone={f.style?.fill} ink={MUTED} />
          ) : f.kind === "column" ? (
            <ColumnGlyph f={f} fill={style.fill} fillOpacity={style.fillOpacity} stroke={style.stroke} strokeWidth={style.strokeWidth} />
          ) : f.kind === "fountain" ? (
            <ItemSymbol kind="fountain" footprint={featureFootprint(f)} count={1} tone={f.style?.fill} ink={INK_SOFT} />
          ) : f.kind === "curtain" ? (
            <CurtainCloth
              pieces={pieces ?? []}
              depthMm={CURTAIN_DEPTH_MM}
              fill={f.style?.fill ?? CURTAIN_FILL}
              fillOpacity={f.style?.fillOpacity}
              ink={isDark(f.style?.fill ?? CURTAIN_FILL) ? "#ffffff" : INK}
              opacity={0.5}
            />
          ) : (
            <FootprintShape
              footprint={featureFootprint(f)}
              fill={style.fill}
              fillOpacity={style.fillOpacity}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              strokeDasharray={style.dashArray.length ? style.dashArray.join(" ") : undefined}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
      </g>
      {/* Upright, outside the turn — a name drawn at the feature's angle reads as a mark. */}
      {f.kind !== "plant" && f.kind !== "surface" && f.kind !== "seating" && f.kind !== "column" && f.kind !== "fountain" && f.kind !== "curtain" && !isClimb(f.kind) && f.label && (
        <text x={f.x} y={f.y} textAnchor="middle" dominantBaseline="central" fontSize={2.6 * den} fontFamily="Assistant, sans-serif" fill={INK_SOFT}>
          {f.label}
        </text>
      )}
    </g>
  );
}

/** A table drawn faint and unnumbered — a sheet that is not about the tables still has to show a
 *  rigger or a stage crew which one is under them. */
function GhostTable({ t }: { t: DesignTable }) {
  return (
    <g transform={placed(t.position, t.rotation, t.mirrored)}>
      <FootprintShape
        footprint={tableFootprint(t)}
        fill="url(#dot-ghost)"
        stroke={INK}
        strokeWidth={LINE_WEIGHTS.annotation}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

/** A banquet chair, drawn exactly as the studio canvas draws it (canvas-stage.tsx's own Chair) — the
 *  seat's own rotation already points +x at the table, so this needs no further geometry. */
export function ChairGlyph({ seat, colour = false, mono = false }: { seat: Seat; colour?: boolean; mono?: boolean }) {
  return (
    <g transform={`translate(${seat.x} ${seat.y}) rotate(${seat.facingDeg})`}>
      {colour ? <SeatChair widthMm={CHAIR_W_MM} depthMm={CHAIR_D_MM} ink={MUTED} /> : <SeatChair widthMm={CHAIR_W_MM} depthMm={CHAIR_D_MM} ink={INK} print tone={mono ? MONO.chair : undefined} />}
    </g>
  );
}

/** One free-standing placement: a stage, a bar, a chandelier, a loose chair — whatever the catalog
 *  says its shape is, outlined at furniture weight. `overhead` forces it unfilled and dashed
 *  (components/footprint-shape.tsx), the one convention every surface that draws this plan shares. */
export function PlacementGlyph({
  placement,
  x,
  y,
  overhead,
  shape,
  colour = false,
  mono = false,
  textMm,
  chairs = true,
}: {
  placement: Placement;
  x: number;
  y: number;
  overhead?: boolean;
  shape?: Footprint;
  colour?: boolean;
  /** The B&W booklet's flat grey (MONO): a rug its pale one, anything else standing on the floor the
   *  item grey. Never passed for what stands ON a table, which stays white against the table's top. */
  mono?: boolean;
  /** The sheet's text size in room mm (`den * printed mm`), for the words a picture writes — a ramp's
   *  slope. Absent = sized off the item. */
  textMm?: number;
  /** Whether a banquette's chairs are drawn — off on a sheet that hides every chair. */
  chairs?: boolean;
}) {
  const r = resolve(placement.variantId);
  // A rug with curved sides (lib/studio/rug-shape.ts) is drawn through its bowed outline. The seams
  // that draw a custom footprint recentre it on its bounds, so `lift` carries it back onto the
  // rectangle's centre — which is where the rug is.
  const stretched = r?.sizing === "stretch" ? (placement.sizeMm ?? fallbackSize(r)) : undefined;
  const bows = stretched && !shape ? bowsOf(placement) : undefined;
  const bowed = bows && stretched ? bowedRug(stretched.widthMm, stretched.depthMm, bows) : null;
  const lift = bowed ? `translate(${bowed.centre.x} ${bowed.centre.y})` : undefined;
  const footprint: Footprint = shape ?? (
    stretched
      ? (bowed?.footprint ?? { kind: "rect", ...stretched })
      : placementFootprint(placement)); // at the size it was stretched to, when its row allows that
  // The rectangle a rug's border and fringe are laid in: its footprint, or — curved — the box it bows from.
  const patternBox = footprint.kind === "rect" ? { w: footprint.widthMm, h: footprint.depthMm } : bowed && stretched ? { w: stretched.widthMm, h: stretched.depthMm } : null;
  const scale = placement.scale || 1;
  // The row's own weight and dash, collapsed to ink-on-paper (TableGlyph's reason). A stage keeps the
  // sheet's furniture weight whatever deck it was built from, as it does on screen.
  const style = resolveStyle(placement.stage ? undefined : productStyle(r?.product), "monochrome", { fill: "#ffffff", stroke: INK, strokeWidth: LINE_WEIGHTS.furniture });
  // The category's picture, in ink — the same one the studio draws, so the crew sees a chair where
  // the designer put a chair (lib/catalog/symbols.ts). A block of chairs in rows is every one of its
  // chairs, where the studio puts them (lib/design-document/chair-rows.ts).
  const block = chairBlockOf(placement);
  const symbol = placement.stage || block ? null : symbolOf(r?.product, footprint);
  // A flight or a ramp on its own: the step it covers on this plan, its slope kept upright.
  const rise = symbol === "stairs" || symbol === "ramp" ? climbRise(r?.product, placement.climb) : undefined;
  const climbProps = rise ? { rise, turnDeg: placement.rotation, mirrored: placement.mirrored, textMm } : {};
  // A standalone banquette as THIS plan laid it — which side is chairs, which a sofa, how many
  // (lib/design-document/bench.ts) — drawn by the same picture the studio draws.
  const bench = symbol === "bench" ? (standaloneBench(placement, benchOf) ?? undefined) : undefined;
  const benchProps = symbol === "bench" ? { bench, chairs } : {};
  // An arrangement's flowers, from its row (lib/catalog/flower-spec.ts), in the shade of this
  // placement; their inner detail only where the sheet is large enough to print it (1:50 and
  // closer — `textMm` is 2.6 printed mm in room mm, so it carries the scale).
  const flowerProps =
    r && (symbol === "flowers" || symbol === "centerpiece")
      ? { flowers: flowerDrawSpecOf(r.product, footprint, r.swatch ?? r.product.appearance?.style?.fill), detail: textMm === undefined || textMm <= 2.6 * 50 }
      : {};
  // The vase it stands in (lib/catalog/vessel.ts): under the flowers, its rim dashed over them.
  const vessel = symbol === "flowers" || symbol === "centerpiece" ? vesselOf(placement, (id) => resolve(id)?.product) : undefined;
  if (colour) {
    // The studio's PlacementNode, without the pointer: the shade picked for this placement over the
    // row's own fill, the category's picture in that shade, a material where the row has one.
    const screen = resolveStyle(placement.stage ? undefined : productStyle(r?.product), "screen", { fill: "#ffffff", stroke: MUTED, strokeWidth: LINE_WEIGHTS.furniture });
    const own = placement.stage ? undefined : (r?.swatch ?? r?.product.appearance?.style?.fill);
    const surfaced = !symbol && !block && !overhead && anySurface(r?.product.appearance);
    const dark = !!own && isDark(own);
    return (
      <g transform={`${placed({ x, y }, placement.rotation, placement.mirrored)}${scale !== 1 ? ` scale(${scale})` : ""}`}>
        {block && <ChairBlock product={block.product} spec={block.spec} tone={own} ink={MUTED} />}
        {vessel && <VesselMark variantId={vessel} pass="under" holder={footprint} ink={MUTED} />}
        {symbol && r && <ItemSymbol kind={symbol} footprint={footprint} count={symbolCount(r.product, symbol)} tone={own} overhead={overhead} chairStyle={chairStyleOf(r.product)} drawStyle={drawStyleOf(r.product)} {...climbProps} {...benchProps} {...flowerProps} />}
        {vessel && <VesselMark variantId={vessel} pass="over" holder={footprint} ink={MUTED} />}
        {!symbol && !block && (
          <g transform={lift}>
            <FootprintShape
              footprint={footprint}
              overhead={overhead}
              fill={own ?? screen.fill}
              fillOpacity={own ? 1 : screen.fillOpacity}
              stroke={placement.stage ? INK : screen.stroke}
              strokeWidth={screen.strokeWidth}
              strokeDasharray={screen.dashArray.length ? screen.dashArray.join(" ") : undefined}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
        {surfaced && (
          <g transform={lift}>
            <ItemSurface appearance={r?.product.appearance} footprint={footprint} color={own} seed={placement.id} />
          </g>
        )}
        {r?.product.category === "rugs" && patternBox && <RugPattern w={patternBox.w} h={patternBox.h} bows={bows} ink={dark ? "#ffffff" : INK} opacity={0.5} />}
      </g>
    );
  }
  const rug = r?.product.category === "rugs";
  const flat = mono && !overhead ? (rug ? MONO.rug : MONO.item) : undefined;
  return (
    <g transform={`${placed({ x, y }, placement.rotation, placement.mirrored)}${scale !== 1 ? ` scale(${scale})` : ""}`}>
      {block && <ChairBlock product={block.product} spec={block.spec} tone={flat} ink={INK} print />}
      {vessel && <VesselMark variantId={vessel} pass="under" holder={footprint} ink={INK} print tone={flat} />}
      {symbol && r && <ItemSymbol kind={symbol} footprint={footprint} count={symbolCount(r.product, symbol)} tone={flat} ink={INK} print overhead={overhead} chairStyle={chairStyleOf(r.product)} drawStyle={drawStyleOf(r.product)} {...climbProps} {...benchProps} {...flowerProps} />}
      {vessel && <VesselMark variantId={vessel} pass="over" holder={footprint} ink={INK} print />}
      {/* A block's chairs are each outlined; round them all goes the line the crew sets the block
          out by, at the weight of a note. */}
      <g transform={lift}>
        <FootprintShape
          footprint={footprint}
          overhead={overhead}
          fill={symbol || block ? "none" : (flat ?? style.fill)}
          stroke={style.stroke}
          strokeWidth={block ? LINE_WEIGHTS.annotation : style.strokeWidth}
          strokeDasharray={block ? "4 3" : style.dashArray.length ? style.dashArray.join(" ") : undefined}
          vectorEffect="non-scaling-stroke"
        />
      </g>
      {/* Over the fill — drawn before it, the rug's own white covered its border and fringe. */}
      {rug && patternBox && <RugPattern w={patternBox.w} h={patternBox.h} bows={bows} ink={INK} opacity={0.8} />}
    </g>
  );
}

/** The kit schedule — the set's one page of "which tables carry what": each kit's letter (the one
 *  printed on the plan), its tables, and what one table of it carries, with the components a
 *  florist is phoned with. Undressed tables are listed last so a table missing from every kit is
 *  visibly missing, not silently absent. Counts only: a printing surface (npm run check:costs). */
export function KitSchedule({
  kits,
  undressed,
  lookup,
  details,
  meeting = false,
}: {
  kits: TableKit[];
  /** The table units that carry nothing. */
  undressed: { number: number; unnumbered?: boolean }[];
  lookup: (variantId: string) => { variantLabel: string; components?: { label: string; count: number }[]; imageUrl?: string } | undefined;
  /** Kit keys that have a detail sheet in this set — so the row can say "ראו פרט". */
  details: Set<string>;
  /** Printed from the meeting's closing stage: the empty note points back into the flow. */
  meeting?: boolean;
}) {
  return (
    <section>
      <h3 className="mb-2 border-b border-ink pb-1 text-base font-semibold text-ink">ערכות עיצוב לשולחנות</h3>
      <dl className="divide-y divide-border">
        {kits.map((k) => (
          <div key={k.key} className="flex items-baseline gap-3 break-inside-avoid py-2 text-sm">
            <dt className="flex w-44 shrink-0 items-baseline gap-2">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink text-sm font-bold text-ink">{k.letter}</span>
              <span className="nums font-semibold text-ink">
                {tablesPhrase(k.units)}
              </span>
            </dt>
            <dd className="min-w-0 flex-1 text-ink-soft">
              {/* Each piece with its photo when the catalog has one — the crew unpacking a crate
                  matches a picture faster than a name. A plain <img>: the print engine prints it. */}
              <ul className="flex flex-wrap gap-x-4 gap-y-2">
                {k.items.map((i) => {
                  const info = lookup(i.variantId);
                  const name = info?.variantLabel ?? productName(i.variantId) ?? "פריט";
                  return (
                    <li key={i.variantId} className="flex items-center gap-2">
                      {info?.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- a print sheet: the file is printed as-is, not optimised for a viewport
                        <img src={info.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-sm border border-border object-cover" />
                      )}
                      <span>{i.quantity > 1 ? `${name} ×${i.quantity}` : name}</span>
                    </li>
                  );
                })}
              </ul>
              {details.has(k.key) && <p className="mt-1 text-caption text-muted">ראו פרט {k.letter}</p>}
            </dd>
          </div>
        ))}
        {undressed.length > 0 && (
          <div className="flex items-baseline gap-3 py-2 text-sm">
            <dt className="nums w-44 shrink-0 ps-8 font-semibold text-ink">
              {tablesPhrase(undressed)}
            </dt>
            <dd className="text-muted">ללא עיצוב</dd>
          </div>
        )}
      </dl>
      {kits.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          עדיין לא שובצו פריטים על השולחנות.{" "}
          <BackToStudio meeting={meeting} />
        </p>
      )}
    </section>
  );
}

const INLINE_KINDS: DimKind[] = ["tie", "gap", "aisle", "offset"];

/** The figures. Each dimension is a line with a tick at both ends — witness lines back to what it
 *  measures when it is drawn off it — and its number, placed by lib/outputs/labels.ts and haloed in
 *  white so no line runs through a digit. A gap under the walkway minimum prints ⚠ and dashed. */
function MeasureLayer({
  input,
  opts,
  den,
  obstacles,
  furniture,
  shapes,
  roomCentre,
  notes = [],
}: {
  input: MeasureInput;
  opts: MeasureOptions;
  den: number;
  obstacles: Box[];
  furniture: Box[];
  shapes: Pt[][];
  roomCentre: Pt;
  /** Text that belongs beside a line but measures nothing — a ceiling item's hang height under its
   *  bottom edge. Placed in the same pass as the figures, after them, so it steps off them too. */
  notes?: { a: Pt; b: Pt; text: string }[];
}) {
  const { dims, leaders } = measurements(input, opts);
  const font = (d: Dim) => (d.kind === "overall" ? 2.4 : 2.2) * den;
  const label = (d: Dim) => `${d.warn ? "⚠ " : ""}${d.diameter ? "⌀" : ""}${(d.mm / 1000).toFixed(2)}`;
  const lines = dims.map((d) => {
    const pa = { x: d.a.x + d.offset.x, y: d.a.y + d.offset.y };
    const pb = { x: d.b.x + d.offset.x, y: d.b.y + d.offset.y };
    const L = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    const u = { x: (pb.x - pa.x) / L, y: (pb.y - pa.y) / L };
    const n = { x: -u.y, y: u.x };
    // Which side the figure prefers: away from what it measures (an offset line), away from the
    // room (a chain along its edge), either (a figure in an aisle sits on its own line).
    const away = d.offset.x || d.offset.y ? d.offset : { x: (pa.x + pb.x) / 2 - roomCentre.x, y: (pa.y + pb.y) / 2 - roomCentre.y };
    const side: 1 | -1 = n.x * away.x + n.y * away.y >= 0 ? 1 : -1;
    // A figure on an upright line is turned to read up it, as drawings set them — it then needs
    // only its own height beside the line, which is what fits a chain down a narrow stage.
    const vertical = Math.abs(u.y) > Math.abs(u.x);
    return { d, pa, pb, u, n, side, vertical };
  });
  const noteFont = 2.2 * den;
  const placed = placeLabels(
    [
      ...lines.map(({ d, pa, pb, side, vertical }) => {
        const f = font(d);
        const long = label(d).length * f * 0.56 + f * 0.4;
        const tall = f * 1.15;
        return { a: pa, b: pb, w: vertical ? tall : long, h: vertical ? long : tall, gap: 0.7 * den, side, inline: INLINE_KINDS.includes(d.kind) };
      }),
      // Under its line (the item's bottom edge, drawn left to right: +1 is down the page).
      ...notes.map((n) => ({ a: n.a, b: n.b, w: n.text.length * noteFont * 0.56 + noteFont * 0.4, h: noteFont * 1.15, gap: 0.7 * den, side: 1 as const })),
    ],
    obstacles,
    furniture,
    shapes,
  );
  const at = placed.slice(0, lines.length);
  const noteAt = placed.slice(lines.length);
  const tick = 1.3 * den;
  const ink = { stroke: INK, strokeWidth: LINE_WEIGHTS.annotation, vectorEffect: "non-scaling-stroke" as const };
  return (
    <g>
      {leaders.map((l: Leader, i) => (
        <line key={`l${i}`} x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} stroke={MUTED} strokeWidth={LINE_WEIGHTS.annotation} strokeDasharray="1 3" vectorEffect="non-scaling-stroke" />
      ))}
      {lines.map(({ d, pa, pb, u, n, vertical }, i) => {
        const off = Math.hypot(d.offset.x, d.offset.y);
        const o = off ? { x: d.offset.x / off, y: d.offset.y / off } : null;
        const slash = { x: ((u.x + n.x) / Math.SQRT2) * (tick / 2), y: ((u.y + n.y) / Math.SQRT2) * (tick / 2) };
        return (
          <g key={`d${i}`}>
            {o && (
              <>
                <line x1={d.a.x + o.x * 0.6 * den} y1={d.a.y + o.y * 0.6 * den} x2={pa.x + o.x * den} y2={pa.y + o.y * den} {...ink} stroke={MUTED} />
                <line x1={d.b.x + o.x * 0.6 * den} y1={d.b.y + o.y * 0.6 * den} x2={pb.x + o.x * den} y2={pb.y + o.y * den} {...ink} stroke={MUTED} />
              </>
            )}
            <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} {...ink} strokeDasharray={d.warn ? "3 2" : undefined} />
            {[pa, pb].map((q, k) => (
              <line key={k} x1={q.x - slash.x} y1={q.y - slash.y} x2={q.x + slash.x} y2={q.y + slash.y} {...ink} />
            ))}
            <text
              x={at[i].x}
              y={at[i].y}
              transform={vertical ? `rotate(-90 ${at[i].x} ${at[i].y})` : undefined}
              textAnchor="middle"
              dominantBaseline="central"
              direction="ltr"
              fontSize={font(d)}
              fontWeight={d.warn || d.kind === "overall" ? 700 : 500}
              fontFamily="Assistant, sans-serif"
              fill={INK}
              stroke="#ffffff"
              strokeWidth={0.6 * den}
              strokeLinejoin="round"
              paintOrder="stroke"
              className="nums"
            >
              {label(d)}
            </text>
          </g>
        );
      })}
      {notes.map((n, i) => (
        <text
          key={`n${i}`}
          x={noteAt[i].x}
          y={noteAt[i].y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={noteFont}
          fontWeight={600}
          fontFamily="Assistant, sans-serif"
          fill={INK}
          stroke="#ffffff"
          strokeWidth={0.6 * den}
          strokeLinejoin="round"
          paintOrder="stroke"
          className="nums"
        >
          {n.text}
        </text>
      ))}
    </g>
  );
}
