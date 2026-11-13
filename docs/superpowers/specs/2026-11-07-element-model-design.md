# "Any structure" — one element model under every drawing — the end state and the stages to it — design

Version 1.0 | 2026-11-07 | **Decided the same day on the recommended answers** (Ravid: *"do your recommendations — create a branch for it"*); Stages 0–2 begun on branch `feat/2026-11-07-element-model` — see §13 for exactly what is built. A definition, written to be argued with. Each **DECIDE** is a call only Ravid makes; the answer this document assumes comes first. Companion to [2026-07-20 catalog item map appearance](2026-07-20-catalog-item-map-appearance-design.md) (where `MapAppearance` was born), [2026-10-23 3D scene](2026-10-23-3d-scene-design.md) (the `Part` vocabulary) and [2026-11-07 venue heights, rails and covers](2026-11-07-venue-heights-rails-and-covers-design.md) (the round that is half built as this is written).

Ravid, 2026-11-07: *"my goal in the app is to be able to create any structure… the end result is also to publish the app for architects that will also use the app for design houses. But for the first stage I want to be able to create any structure that can be in real life. Need to redefine the creation of an element; the drawing of the product on the selected shape needs to be better, more generic and customisable. I want to be able to create complex products. Think outside the box, don't be afraid to suggest any refactor or redesign. I am not trying to replace Revit."*

---

## 0. What exists — the honest inventory

Read off the source on 2026-11-07 (line numbers ±1). The point of this section is not blame — every piece below was the right call in its round — but to see the SHAPE of the problem before proposing the shape of the answer.

### 0.1 One thing, three vocabularies

A real-world object (a bar, a column, a stage, a pergola) is described three different ways, by three different code paths, and none of the three knows the other two.

| | Catalog product | Venue feature | 3D body |
| --- | --- | --- | --- |
| Type | `MapAppearance` (lib/catalog/types.ts:243) | `StructureFeature` (lib/venues/structure.ts:261) | `Part[]` via `ItemBuild` (lib/scene/types.ts:72, collect.ts:40) |
| Shape | 19 `MapShape`s + `parts: ShapePart[]` (flat: x, y, rotation, texture — **no z, no height**) + `hollow`/`ring`/`arc` + a custom outline with bows | ONE outline (`shape` + `outline`, scaled to width × depth), 13 `FeatureKind`s each with its own sub-object (`column`, `curtain`, `seating`, `climb`, `rim`, `plant`, `surface`, `edgeItems`, `fillsFace`) | 13 primitives (box, cylinder, sphere, torus, extrude, lathe, plane, ribbon, drape, blob, frond, leaves, bloom) — **a good generic solid vocabulary already** |
| Height | one number for the whole item (`dimensions.heightMm`) | one number for the whole feature | every part has z and h |
| How a kind is chosen | category → `SymbolKind` (`SYMBOL_BY_CATEGORY`, symbols.ts:48) | `kind` typed at creation | category → `SymbolKind` → `itemBody` switch (items.ts:226) |
| Parts | add only, never subtract (types.ts:162) | **dropped** when placed from a catalog row (structure.ts:891: "the parts are the catalog's, not the property's") | per-part textures **never reach 3D** (`surfaceLayers` unreferenced in lib/scene) |
| Stretch | a composite is **scaled whole, band and all** (footprint.ts:1607) | the outline is scaled | n/a |
| Link | — | `newFeatureFromProduct` keeps **no link back** to the row | — |

### 0.2 The symbol gate — the exact complaint

`symbolOf` (lib/catalog/symbols.ts:87) hands a product its picture only when the footprint is a `rect`, `circle` or `ellipse` (a bar excepted, a bench "not a circle", stairs/ramp rect only). Every derived shape — hexagon, stadium, trapezoid, a ח, a hollow band, a custom outline, anything with `parts` — resolves to `custom` or `multi` in `solidFootprint`/`composePieces`, so it falls back to outline + icon/name. A sofa drawn as a ח is a bare outline. A column with a plinth part loses its column picture. **"The drawing of the product on the selected shape" is this gate**, and it exists because every picture is hand-drawn for one box.

In 3D the same gate: a product of a symbol category that has parts or is hollow **loses its recipe** and becomes `fallbackBody` — the footprint extruded to its height with the photo stretched over it (item-context.ts:57). A bar is the one shape-aware recipe (`shapedBar`, floor-kinds.ts:665).

### 0.3 Hand-written pictures, hand-written bodies

- **2D**: components/item-symbol.tsx is 2,183 lines — 20 `SymbolKind`s, each a function of (w, h, tone, count, style). `SYMBOL_STYLES` (symbols.ts:240) holds 11 kinds × 2–7 styles, plus `CHAIR_STYLES` (8), `CANDLE_STYLES` (10), `FLOWER_FORMS` (6). Separate glyph components for the venue's things: `ColumnGlyph`, `PlantGlyph`, `ClimbGlyph`, `CurtainCloth`, `SeatingGlyph`, `EdgeItemsDrawing`, `RimFill`.
- **3D**: about 60 recipes, ~2,500 lines in items.ts / floor-kinds.ts / overhead.ts / tables.ts / plants.ts / stage.ts, plus ~1,100 lines of envelope and feature geometry. Each cites the item-symbol.tsx line it lifted its proportions from — the 2D and 3D of one kind are two hand copies of one idea.
- **Most 2D styles never reach the room**: lamp (4 styles), vase (6 — 3D reads a regex on the product NAME instead), sofa (6), column (4), tree (7), chandelier (7), fountain (4), arch (4) are all drawn one way in 3D.
- **The same thing drawn twice**: a venue column (`ColumnGlyph` + envelope.ts:662 `columnBody`) and a catalog column (`column()` + floor-kinds.ts:380); a venue plant (`PlantGlyph` + `plantParts`) and a catalog tree (`tree()` + `treeBody`); a venue bar is a plain outline (venue-plan.tsx:1225, `extrudedFeature`) while the catalog bar it was placed from has counters, shelf and bottles; a stage is drawn in **four** places (canvas-stage `StageMarks`, stage-edge-handles `EdgeItemsDrawing`, placement-map `StageGlyph`, placement-map `ColourFeature`).

### 0.4 The dispatch is copied

"Which drawing does this placement get" — `symbolOf` + `chairBlockOf` + `climbRise` + `standaloneBench` + `flowerDrawSpecOf` + `vesselOf` + `ItemSurface` + `RugPattern` — is assembled in **five** places: canvas-stage `PlacementNodeView` (:4340–4530), placement-map `PlacementGlyph` (:1640, twice: colour and print), composition-drawing `Piece` (:165), plan-glyph `PlanGlyph`, appearance-preview. The venue's per-kind ternary chain (venue-plan.tsx:1089–1227) is copied twice more in placement-map `ColourFeature` (:1445 mono, :1535 colour), label-exclusion predicate included. `category === "…"` appears 62 times in 29 files.

### 0.5 What is right and must be kept

- The **`Part` vocabulary** of lib/scene/types.ts: small, closed, in plan mm with z up, every `at` a base centre, one mapping into three. It is already the "any structure" solid model — it is just only reachable through code.
- **footprint.ts's profile machinery**: `buildHollow`'s band offsets (curves kept, keyhole outlines), bezier edges, `shapedOutline` (bows + corner radii), `flattenOutline`, `labelAnchor`, `footprintSpine`. This is the 2D profile engine the new model builds on, not replaces.
- **The project's own rules**: derived, never typed; pure modules with a `check:*` each; every reader through one resolver; legacy fields read into the new form and dropped on first edit (`stairs` → `edgeItems`, `span` → `rail`, `table_designs` → composites — three times now); no three.js outside components/scene; no price near a client surface.
- **The 2026-11-07 round is the template for the move**: the `Rail` generalised the STORAGE of "cloth along a line" (wall, side, rod, run, canopy, sail) and left every READER alone, each going through `resolveRail`. This document proposes the same move for the whole element.

---

## 1. The one idea

> **An element is a DEFINITION — a parametrised assembly of parts with heights — and every reader (plan, print, 3D, measure) reads the same definition. A kind is a preset, not a code path.**

Eight principles follow from it. They are stated once here and every stage is measured against them.

1. **One definition, four readers.** The canvas, the printed map (colour and mono), the 3D room and the quote's measurer all read `elementGeometry(definition, params, size)`. Today the document has "four renderers" (the 3D spec's phrase) each with its own idea of what a column is; tomorrow they have one.
2. **Kinds are data.** Every built-in picture (chair, column, bar, fountain, pergola…) becomes a **seed definition** shipped as data, like `lib/catalog/standard/` ships tables. A designer forks one ("שכפול לפריט חדש" on a column gives an editable column) and edits parts, not code. A new real-world thing is a new definition; Claude is not in the loop.
3. **Height is first-class.** Every part has `z` and `h`. The plan symbol is the TOP VIEW of the parts under declared conventions (hidden lines, dashed overhead, centre-lines); the room is the parts themselves. Today's 2D is hand-drawn and 3D copies it; tomorrow 3D-ish parts are the truth and 2D is projected — with an escape hatch per kind until the projection is judged as good.
4. **Parameters, not sizes.** Width, depth, height are three parameters among others (seats, arms, posts, slat spacing, counter depth). A part's position and size BIND to parameters — pinned to an edge, proportional, fixed, filling — so stretching a pergola keeps its posts at the corners and its slats at their spacing. `sizedFootprint`'s "scale the composite whole" becomes "evaluate the bindings".
5. **Slots say how things attach.** A definition declares where other things go: a `top` (table items stand on it), a `side` (a curtain hangs on it, a flight climbs it), a `rim` (a pool's), a `hang` point (a chandelier), a `line` (a rail), an `inside` (an arrangement in a vase). Today's `vessel`, `perch`, `over`, `edgeItems`, `rail`, `cover` and `tableId` are seven hand-made attachments; tomorrow they are one mechanism with seven presets.
6. **The owner is orthogonal to the shape.** A venue's fixed column and a hired column are instances of the same definition, one owned by the property and one by the event. Who counts it, prices it, may move it in a sketch — these are questions of OWNER and LIFECYCLE, never of shape. `StructureFeature` and `Placement` become one `ElementInstance` with two owners (behind read adapters, so nothing moves on day one).
7. **Domain logic stays domain logic.** Seating a table, filling a stage with decks, laying a table's dressing, joining edge runs, quoting by kit — none of that is "drawing". Those modules keep deciding and read GEOMETRY from the element model (outline, spine, edges, top surface). The model draws and measures; it never decides.
8. **Architecture is the same model plus levels.** A house is walls with thickness, height and material (the 11-07 round typed the first height), openings as elements in a wall slot, slabs, roofs, storeys and a staircase between them. The venue editor already has the wall graph with face detection; what it lacks is a `Level` and a roof shape. Not BIM: no IFC, no MEP, no structural, no construction details — a plan with heights a client understands and a crew (or a builder) can build from, the same promise the event sketch makes today.

---

## 2. The element model — the vocabulary

A TypeScript sketch, written to be argued with. `lib/element/` is a PURE folder (like lib/scene and lib/studio/rail.ts): no React, no DB, `check:element` over a fixture.

### 2.1 Definition, params, parts

```ts
// lib/element/types.ts — pure, check:element
export interface ElementDefinition {
  id: string;                  // uuidv5 over (origin, key) for built-ins; uuid for a designer's
  version: number;             // bumped on every save; instances pin nothing (they follow — see §2.6)
  name: string;
  params: ParamDef[];          // width · depth · height ALWAYS present; then the definition's own
  parts: ElementPart[];
  slots?: Slot[];              // §2.4
  plan?: PlanHints;            // §2.5
  origin: "builtin" | "studio" | "market";
  forkedFrom?: { id: string; version: number };
}

export interface ParamDef {
  key: string;                 // "width" | "depth" | "height" | "seats" | "arms" | "postMm" | "roof" …
  label: string;               // Hebrew, what the bar/drawer shows
  unit: "mm" | "count" | "deg" | "choice" | "colour" | "bool" | "percent";
  default: number | string | boolean;
  min?: number; max?: number; step?: number;
  choices?: { value: string; label: string }[];      // unit "choice" — what SYMBOL_STYLES is today
  derived?: Derivation;        // read-only on screen, computed from the others (a flight's riser count)
}

/** A length or an angle in a part, bound to the element's parameters. A bare number is fixed mm. */
export type Bound =
  | number
  | { param: string; factor?: number; plus?: number }          // 0.5 × width − 100
  | { fill: true; minus?: number };                             // whatever is left in the parent axis

/** Where a part's box sits in its parent's frame — Figma's constraints, no formula language. */
export interface Pin {
  x: "start" | "end" | "center" | "stretch" | "scale";   // start/end = pinned to that edge at a fixed inset
  y: "start" | "end" | "center" | "stretch" | "scale";
  z: "floor" | "top" | "stretch" | "scale";               // floor = sits at parent z; top = hangs from parent top
}

export interface ElementPart {
  id: string;
  name?: string;               // "דלפק", "מדף אחורי", "עמוד" — the editor's layer name
  role?: PartRole;             // "frame" | "surface" | "cloth" | "glass" | "ground" | "seat" | "detail" | "light" — materials and the mono greys key on it
  op: PartOp;                  // §2.2
  box: { x: Bound; y: Bound; z: Bound; w: Bound; d: Bound; h: Bound; pin?: Pin };
  rotDeg?: Bound; tiltDeg?: Bound; mirrored?: boolean;
  material?: MaterialSpec;     // kind + colour: fixed | { shade: true } (follows the variant) | { param: "frameColour" }
  plane?: "floor" | "table" | "ceiling";   // dimmed with that plane on the sketch; absent = the element's layer
  plan?: PartPlanHint;         // §2.5
  when?: Condition;            // { param: "roof", is: "slats" } | { param: "height", gt: 300 }
  repeat?: Repeat;             // §2.3
  cut?: true;                  // a BOOLEAN SUBTRACT from the parts under it — holes, hollow bands, a pool in a slab
}
```

### 2.2 Operations — what a part is made by

```ts
export type PartOp =
  | { kind: "extrude"; profile: Profile }                   // a prism: the base of almost everything
  | { kind: "revolve"; profile: RevolveProfile }            // the lathe: vases, bowls, a column's shaft, a fountain's tiers
  | { kind: "sweep"; profile: Profile; path: PathRef }      // a profile along a line: beams, rods, rails, mouldings, hedges, kerbs — and WALLS
  | { kind: "sheet"; sag?: Bound }                          // a plane: a slab, a sail, a glass pane, a roof pitch
  | { kind: "ribbon"; pleat?: PleatSpec }                   // the curtain's and skirt's strip (today's Part)
  | { kind: "drape"; … }                                    // today's cloth fall
  | { kind: "organic"; what: "blob" | "frond" | "leaves" | "bloom"; … }   // the procedural masses, kept as they are
  | { kind: "engine"; engine: EngineId; input: Record<string, Bound> }    // §2.3 — a PROCEDURAL part
  | { kind: "ref"; definitionId: string; params?: Record<string, Bound> } // a nested element (a chair in a seating block)
  | { kind: "mesh"; url: string }                            // phase E of the 3D spec: a real model, projected to plan

/** TODAY'S SHAPE VOCABULARY, EXACTLY: MapShape + custom outline + bows + corners + hollow/ring/arc.
 *  footprint.ts stays the engine that builds it. New: a profile may be `cut` from the one under it. */
export interface Profile { shape: MapShape; outline?: Point[]; edgeCurves?: …; corners?: …; arc?; ring?; hollow?; }
```

The seven ops cover what the catalog and the venue draw today and what a house needs: a wall is a `sweep` of a rectangle along the wall line; a pitched roof is two `sheet`s; a staircase is an `engine` (treads from rise, the climb rule); a column is a `revolve` on an `extrude` plinth; a pergola is `extrude` posts × `repeat corners`, `sweep` beams along edges, `extrude` slats × `repeat area`.

### 2.3 Repeats and engines — where the "complex product" comes from

```ts
export interface Repeat {
  along: "edge" | "edges" | "corners" | "ring" | "path" | "grid" | "area" | "spine";
  side?: number | "all" | "open";          // which edge(s) of the parent profile
  spacing?: Bound; count?: Bound;          // one or the other; "fit" spreads to the length
  fit?: "spread" | "fill" | "center";      // how the run meets the ends
  margin?: Bound;                           // inset from the ends
  phase?: Bound;                            // the first one's offset
  alternate?: { every: number; variant: string };   // two heights along a run (HeightWave)
}
```

Chairs round a table, bottles every 26 cm on a bar's shelf, balusters on a railing, posts at a pergola's corners, columns down a colonnade, slats across a roof, chairs in rows, pendants along a row of tables, treads up a flight, steps of an LED run — **one operator**. Today each is its own code (`seatsAround`, `BOTTLE_PITCH_MM`, `chairRowsLayout`, `layHung`, `alongSpine`). Those that are domain logic (seating decides who sits where) stay domain logic and HAND the repeat its slots; those that are drawing (bottles, slats, balusters) become data.

An **engine** is code that emits parts from parameters — the bridge that lets the sixty hand-written recipes become citizens of the model WITHOUT a rewrite: `flowers` (today's `composeFlowers` + `flowerBuild`), `plant` (`treeParts`/`palmParts`…), `bar-strips` (`barDrawing`), `climb` (treads and the walking line), `chair-ring`, `drape-pleats`, `tableware`. Each engine already exists as a pure function; wrapping it is a signature. Over time an engine can be decomposed into primitives + repeats (a bar's strips can, a rose's petals never will) — or never, and that is fine.

### 2.4 Slots — how things attach

```ts
export interface Slot {
  id: string;
  kind: "top" | "side" | "rim" | "hang" | "line" | "inside" | "edge" | "wall";
  on?: string;                              // the part whose face it is; absent = the element's own box
  side?: number | "all" | "open";           // for side/edge/line: which edge(s)
  accepts: AttachKind[];                    // "table-item" | "cloth" | "curtain" | "led" | "flight" | "banquette" | "barrier" | "arrangement" | "opening" | "stair-landing"
  rules?: { minHeightMm?: number; maxHeightMm?: number; minRunMm?: number };   // takesEdgeItems' 30–150 cm, ≥1.2 m
}
```

| Today | Tomorrow |
| --- | --- |
| `Placement.tableId` + `dressingSpots` | the table's `top` slot (the layout engine still lays the items) |
| `Placement.vessel` (an arrangement IN a vase) | the vase's `inside` slot |
| `Placement.perch` (an item on a banquette) | the banquette's `top` slot |
| `Placement.over` (a pendant hung over a table) | the table's `hang` slot |
| `StageBuild.stairs` / `StructureFeature.edgeItems` | the stage's `edge` slot, `accepts: flight/banquette/barrier/backdrop/ramp` |
| `Rail` (wall · side · rod · run · canopy · sail) | a `line` slot on a wall, a side, a rod element — the rail IS the first slot already built |
| `Placement.cover` (planned, 11-07 §8) | a surface's or stage's `top` slot accepting a `rug` |
| `StructureEntrance` on a wall | the wall's `wall` slot accepting an `opening` (§6) |
| `takesEdgeItems` (stage-edges.ts:57) | the `edge` slot's `rules` |

A user-made element declares its slots in the editor ("things can stand on this" / "a curtain can hang on this side" / "stairs can climb this edge"). The sixty readers that today know what `perch` means go on reading `perch` through an adapter until each is moved.

### 2.5 The plan symbol — projection plus conventions

`projectToPlan(parts, hints) → PlanDrawing` is the one NEW engine this document asks for. It replaces the hand-drawn glyphs kind by kind, never all at once.

- **Default**: every part's top-down outline, painted bottom-up by z (what is higher covers what is lower), filled by its material's colour at the sketch's tint, stroked in ink. A flat extrude of a rectangle projects to exactly today's rectangle, so every plain item is pixel-identical on day one.
- **Hidden-line conventions** (per part, `PartPlanHint`): `outline` (no fill — a chandelier's lines-only picture), `dashed` (overhead: anything in the ceiling plane, or a part flagged so — the vase rim's dashed-over-the-flowers rule), `hidden` (never on the plan: a table's legs), `centerline` (rods, beams, LED runs), `fill-only` (ground), `detail` (joins the `.fl-d` LOD class and vanishes past 12 mm/px), `label` (text on the plan: a ramp's "1:12", "LED").
- **Roles decide the mono greys**: the booklet's `MONO` map keys on `PartRole` (table darkest … ground palest) instead of on kind.
- **Escape hatch**: `PlanHints.symbol: "projection" | "legacy:<SymbolKind>"`. A built-in definition whose projection is not yet as good as its hand glyph says `legacy:chair`, and item-symbol.tsx keeps drawing it. A kind is retired when Ravid approves its **parity sheet** (§9) and the hint flips. The hint is the migration's throttle.

### 2.6 Instances — one, with two owners

```ts
export interface ElementInstance {
  id: string;
  definition: { ref: string } | { inline: ElementDefinition };   // a catalog row references; a one-off venue feature may inline
  variantId?: string;              // the shade (a product's)
  params?: Record<string, number | string | boolean>;   // overrides of the definition's defaults — width/depth/height among them
  transform: { x: number; y: number; z?: number; rotationDeg: number; mirrored?: boolean };
  attached?: { instanceId: string; slotId: string; at?: SlotPlace };   // what it stands on / hangs from / is cut into
  materials?: Record<PartRole, MaterialSpec>;   // per-instance recolour by ROLE (the frame gold, the cloth ivory)
  locked?: boolean;
}
// The OWNER is where the instance is stored: VenueStructure.elements (the property's) or DesignDocument.elements (the event's).
// FeaturePlacement (an event's move/removal of the venue's) is unchanged.
```

`Placement` and `StructureFeature` are read INTO this through `instanceOf(placement)` / `instanceOf(feature)` and the per-kind fields (`column`, `curtain`, `climb`, `bench`, `rows`, `stage`…) are read into params of the matching built-in definition — the `stairs` → `edgeItems` pattern. `DesignTable` stays what it is (a table is the seating module's object; its DRAWING goes through a built-in "table" definition).

**Follow or pin?** An instance follows its definition's current version (a redrawn column redraws everywhere — the catalog's rule today: "the plan redraws from the primed cache"). A sealed document is already a snapshot (`sealDocument`); the definition's version is written into the seal so a quote's drawing stays what it was. DECIDE 2.

### 2.7 Today → tomorrow, field by field

| Today | Tomorrow |
| --- | --- |
| `MapAppearance.shape` + `dimensions` | the base part: `extrude` of that profile, `h = height`, `pin: stretch/stretch/scale` |
| `MapAppearance.parts: ShapePart[]` (flat) | `ElementPart[]` with `z: 0, h: height` on read; z/h editable from Stage 2 |
| `hollow` / `ring` / `arc` | a `Profile` field (unchanged) — or a `cut` part, which is what a hollow band IS |
| `symbolStyle` (chair chiavari, vase urn…) | a `choice` param on the built-in definition; parts carry `when` |
| `categoryFields.arms` / `seats` | `count` params (arms drives a `repeat ring`; seats stays the seating module's) |
| `texture` / `textureImage` / `style.fill` | the part's `material` — and it REACHES 3D, per part |
| `content: icon / name` | a `label` plan hint on the base part |
| `blockedSides` | the table's `edge` slot's blocked list |
| `border` (rug/cloth contour) | a `detail` part laid by `repeat along edges`, or the `rug` engine — unchanged for the user |
| `StructureFeature.column: { shaftMm, baseMm, square }` | built-in "column": params `shaft`, `base`, `section` |
| `.curtain: { rail, style, drop }` | built-in "curtain" attached to a `line` slot; `style` a choice, `drop` a param |
| `.seating: ChairRows` | built-in "seating": a `ref` to the chair definition × `repeat grid` (rows, perRow, gaps, aisle as params) |
| `.climb: { reversed, risers }` + kind stairs/ramp | built-in "stairs" / "ramp": `engine: climb`, `risers` a derived param |
| `.rim` (pool, surface) | a `cut` part (the water) inside an `extrude` (the rim) — one definition "pool" with params `rimWidth`, `rimMaterial`, `raised` |
| `.fillsFace` (surface, building) | a `face` binding on the instance (the profile is the face's, re-laid by `syncFaceSurfaces` as today) |
| `.plant: PlantSpecies` | built-in plants: `engine: plant` with `species` a choice |
| `.edgeItems` / `StageBuild.stairs` | the `edge` slot's occupants — each a built-in flight/banquette/barrier/backdrop/ramp instance |
| `Placement.scale` (drawing scale) | an instance param `drawScale` the plan reads and the quote never does (unchanged) |
| `Placement.bench`, `.rows`, `.climb` | params of their built-ins |
| `Placement.stage: StageBuild` | **unchanged** — the stage is domain logic (fill, levels, pieces, holes); it exposes outline/edges/top to the model and its DRAWING goes through the built-in "stage" definition's engine |
| `SYMBOL_BY_CATEGORY` | `CategoryDef.defaultDefinition` — the seed a new row of that category starts from (category keeps its business semantics: seats, flowers, stock, hall pass) |
| `FeatureKind` (13) | gone; the 13 are built-in definitions tagged `venue: true` in the library; `/halls`' add list is the library filtered |
| `SymbolKind` (20) | gone when the last `legacy:` hint flips; until then the escape hatch |

---

## 3. The readers — one contract

```ts
// lib/element/geometry.ts — pure, memoised per (definition.id, definition.version, params hash, variant)
export function elementGeometry(def, params, variant, ctx): ElementGeometry;
export interface ElementGeometry {
  parts: ResolvedPart[];        // every binding evaluated, every repeat unrolled, every engine run, every cut applied — in the element's frame, mm, z up
  footprint: Footprint;         // the FLOOR CONTACT (what clearance, snap, hit-test, align and the printed measurements read) — today's Footprint type, unchanged
  box: Bounds;                  // the plan box (what a label's anchor and the drag image frame)
  slots: ResolvedSlot[];        // in the element's frame
  plan: PlanDrawing;            // §2.5 — path strings with fill/stroke/dash/class, ready for ANY SVG surface
  measures: { areaMm2; runMm; countsByRole };   // what per-m², per-m and per-unit pricing read; what packing counts
}
```

| Reader | Today | Tomorrow |
| --- | --- | --- |
| Sketch canvas (`PlacementNodeView`), print (`PlacementGlyph` ×2), drag image (`PlanGlyph`), composition drawing (`Piece`), catalog preview | five assemblies of per-kind props | ONE component `<ElementGlyph geometry look="canvas" \| "colour" \| "mono" \| "print" />` |
| /halls' `FeatureNode` chain (10 branches) + placement-map `ColourFeature` (×2) | per-kind | the same `ElementGlyph` |
| 3D `itemBody` switch + `floorKindBody` + `overheadKindBody` + `featureBodies` | per-kind recipes | `geometry.parts` → `ItemBuild` (the `Part` type is already the output; repeats become `InstanceRequest`s — the collector already merges them) |
| Clearance, snap, align, hit-test, printed measurements | `placementFootprint` / `featureFootprint` | `geometry.footprint` (same type, same callers) |
| Quote, packing, procurement | `MeasureContext.*Of` lookups | `geometry.measures` (per m² / per m / per unit) + the domain's own counts — **no price ever enters lib/element** (`check:costs` scans it) |
| Dims layer, label anchor, spine | footprint.ts | unchanged — they read the footprint |
| **New, for free once z exists**: elevation / section view | — | `projectToPlan` turned 90° — an "elevation sheet" (backdrop heights, curtain drops, stage levels) for crews, and the architect's four elevations |

---

## 4. The editor — from "shape editor" to עורך אלמנטים

The appearance modal (app/(app)/catalog/appearance-modal.tsx, 2,081 lines) already IS the element editor's skeleton: a `PlanCanvas` where every shape is a `ShapePart` rendered through the /halls feature layer (`featureOf` :1464), with move/rotate/resize handles, a shape rail, a chips bar, undo, marquee, align. What it cannot say today (confirmed): a height or z per part, a side view, a repeat, a binding, a cut, a slot.

- **Three views of one draft**: תוכנית (today's canvas) · חזית/צד (a NEW orthographic side view of the parts — cheap once parts have z/h: `projectToPlan` with the axes swapped; drag a part's z or h there) · תלת-ממד (the pane that already sits beside the sketch, `scene-preview.tsx`, fed `geometry.parts`).
- **Parts as layers**: a list at the side (name, role, material swatch, eye, lock), z/h fields on the selected part's bar beside today's מידות/מיקום. Reorder = z-order on the plan.
- **Pins, not formulas** (DECIDE 3): a part's bar gets Figma's constraint widget — pinned to start / end / both (stretch) / centre / scale per axis, plus "fixed" vs "follows width/depth/height" on a size. That is the whole binding language the user sees; `Bound` is what it stores.
- **Repeat chip**: "חזרה" on a part — along which edge/ring/grid/area, spacing or count, fit, margin. The preview re-lays live.
- **Cut toggle**: "חיתוך" on a part — subtract from what is under it (a hollow, a hole, a pool in a deck).
- **Slots chip**: "חיבורים" on the element — things stand on this top / a curtain hangs on this side / stairs climb this edge / an arrangement goes inside.
- **Params panel**: declare a param (name, unit, range, choices) and the drawer's and the bar's fields are GENERATED from it — the per-kind panels at /halls (`ClimbFields`, `VenueRailFields`, the column chip, the rim chip) become the generic "פרמטרים" panel, with hand-made panels kept only where the gesture is special (a rail's from/to, a flight's side pick).
- **Simple mode is unchanged**: pick a shape, type a size, pick a style — ninety percent of items never open the advanced bar. Advanced is progressive ("מתקדם"), never a second editor.
- **Fork a built-in**: "שכפול לפריט חדש" on a column / bar / pergola opens its definition with every part editable. This is how a designer makes a baluster out of a column and a reception desk out of a bar. A row of the BUILT-IN KIT (spec 2026-11-07-built-in-kit, `Product.builtIn`) is never duplicated as a row — `canDuplicate` refuses, because the one row IS its category — so a fork of one is a NEW definition saved as a row in a creatable category (`other` unless chosen), never a second kit row; the kit's rows are the first seed definitions.
- **The same editor at /halls**: a venue element IS an element. A fixed bar at אמרה opens in the same editor (owned by the venue).
- **Text form** (later, DECIDE 9): the definition as JSON in a "מתקדם" tab — copy, paste, share; and the door an LLM-assisted "describe it" entry could walk through one day ("פרגולה 4×4, עמודים 15, קורות 20×10, לוחות כל 30 ס"מ") — the data model makes it possible; nothing in this document depends on it.

---

## 5. The venue and the event — one model, two owners

Today the venue's 13 kinds and the catalog's categories describe the same things twice, draw them twice, and the placement loses the link to the row it came from (structure.ts:888). The merge (Stage 6) is the largest refactor in this document and the one that pays most: every venue drawing bug fixed once, the /halls add list = the library, a hall owner (בעל אולם, an organisation since 10-30) drawing their property with the designer's catalog pictures.

- `VenueStructure.elements: ElementInstance[]` beside `features` (read-adapted until the writers move). The wall graph (`nodes`, `walls`, `entrances`) STAYS the venue's own: faces, zones, doors, the sketch's clearance and the quote's wall-arc all depend on it. Walls gain params (thickness, height — typed 11-07 — material) and are drawn through a built-in "wall" definition (`sweep`), so an elevation sheet shows them.
- Which definitions /halls offers: those tagged `venue: true` (column, pool, surface, plants, seating, fountain, stairs, ramp, pergola, LED, screen, structure, other) PLUS any catalog row of the venue owner's or the designer's — placed, it keeps its `definition.ref`, so a ח bar at a venue finally draws as a bar.
- `featureMovable`, counting, pricing, `removeFeatures`/`restoreFeatures`, `FeaturePlacement` — all unchanged: they are owner/lifecycle rules and read the instance's OWNER, not its kind.
- A venue instance may `inline` its definition (a one-off traced bed) — nothing forces a row.

---

## 6. Architecture — houses, with the same model

What an architect designing a house needs that the event studio lacks, in the order it unblocks:

1. **Levels** (`Level { id; name; elevationMm; heightMm }` on the venue/property): every wall, element and zone belongs to one; the plan is drawn per level; the 3D stacks them. The event document names the level it is on (one, today's single floor = level 0).
2. **Walls as elements**: thickness, height (done 11-07), material per face, a wall TYPE picked from a small list (block 20, stud 10, partition 7) — `sweep` along the graph. Face detection unchanged.
3. **Openings as elements in the `wall` slot**: `StructureEntrance` (door/window, sill/head, width, leaves, swing) is already that; it gains a definition ref so a door is a door TYPE (a double, a sliding, a French) with its own plan swing and 3D leaf.
4. **Slabs**: a face's floor and ceiling as `extrude`s of the face with thickness; a stairwell is a `cut`.
5. **A staircase between levels**: the `climb` engine with a `stair-landing` slot at each end bound to two levels; straight, L, U, spiral as choices — the sketch's flight is the same engine with one level.
6. **Roofs**: flat (exists as `roofBody`), shed, gable, hip, pergola — a `roof` engine over a face with pitch and overhang params. Not every roof in the world; the five that cover houses.
7. **Outputs**: plans per level (the printed map, per level), four elevations and a section (§3's free reader), an area schedule per level (faces already have areas), door/window and element counts (the packing list's machinery). The 3D walkthrough exists.
8. **A "project" is the owner**: an event is one kind of project; a house is another with no quote, no kits, no seating. The runway, billing and client portal already hang off the event; a project type chooses which of them apply. (Later; named here so Stage 7 does not paint itself into "event".)

**Out of scope, deliberately** (the "not Revit" line): IFC/BIM semantics and schedules beyond counts and areas; MEP; structural; energy; construction details and shop drawings; free-form NURBS; terrain modelling beyond a flat site (a sloped site is a later DECIDE); rendering beyond the existing viewer; real-time co-editing.

---

## 7. The stages — each a Definition of Done, not a topic

Following docs/01 §4: a stage is done when it worked on a real item, in a browser, on develop. Sizes are relative (S · M · L · XL) and honest about the unknown. Dependencies are stated; stages 4 and 5 can run side by side after 3.

### Stage 0 — Define (S)
Answer the DECIDEs below; write the glossary; pick the **three proving items** (DECIDE 5 — recommended: a bar with a raised back-bar and a shelf; a tiered fountain in a hexagonal basin; a pergola with posts, beams and slats); build the **parity harness** (§9) so every later stage can be approved by eye.
**Done when**: this document is v1.0 and the three items are named with their real sizes.

### Stage 1 — The geometry core, under everything, changing nothing visible (M)
`lib/element/` with `Profile` (= today's shapes, engine footprint.ts), `ElementPart` with z/h, ops extrude · revolve · sweep · sheet · cut, `elementGeometry`, `projectToPlan`, memoisation; `definitionOf(product)` reads `MapAppearance` into a definition (base part + parts at z 0, h height); `instanceOf(placement)`; `<ElementGlyph>`; the 3D fallback becomes `geometry.parts`.
**Done when**: every product on develop renders through the adapter with a pixel-identical plan (a flat extrude projects to today's outline — `check:element-parity` compares SVG path strings over the whole catalog), AND a hollow/ח/hexagonal item has a real body in the room with its per-part textures (the first visible win, with no editor change). Checks: `check:element`, `check:element-parity`.

### Stage 2 — Height per part, and the side view (M)
`ShapePart` gains `zMm`/`heightMm` (jsonb, no migration); the editor gets the parts list, the z/h fields and the חזית view; the 3D pane in the editor.
**Done when**: Ravid builds proving item 1 (the bar with its back-bar and shelf) in the editor, with no code, and it draws right on the sketch, the print and in the room. Proving item 2 (the fountain) needs `revolve` in the editor's shape rail — a profile drawn in the side view.

### Stage 3 — Parameters, pins and repeats (L)
`ParamDef`, `Bound`, `Pin`, `Repeat`, `when`, the params panel, the generated fields; `sizedFootprint`'s whole-scale replaced by binding evaluation (a definition with no pins scales as today — nothing changes for existing rows); `Placement.sizeMm` becomes width/depth params.
**Done when**: proving item 3 (the pergola) is built in the editor — posts at the corners, beams along the edges, slats across at a spacing, a `roof` choice — and stretching it on the sketch keeps posts at the corners and the spacing; a bar's bottles are a repeat; chair rows are a `ref` to the chair × grid. The 11-07 round's pergola (§5 there) is then DATA, not a new `FeatureKind` + glyph + body.

### Stage 4 — Engines, seed definitions, and retiring kinds one by one (XL, spread out)
Wrap each recipe as an engine; author every `SymbolKind` as a built-in definition (styles → choice params, `legacy:` hint on); flip each hint when its parity sheet is approved; delete the five dispatch copies (`<ElementGlyph>` everywhere), the venue/catalog duplicates (column, tree, bar, stage ×4), `SYMBOL_BY_CATEGORY`, the `itemBody` switch. `catalog:standard`-style seeding of the built-ins; "שכפול לפריט חדש" on a built-in forks it.
**Done when**: a designer forks the column into a baluster without code; item-symbol.tsx is under a quarter of its size or gone; `check:no-new-kinds` (a scan like `check:costs`) forbids a new per-kind branch outside lib/element's engines.

### Stage 5 — Slots (L)
`Slot`, `ResolvedSlot`, `attached` on the instance; adapters read `tableId`/`vessel`/`perch`/`over`/`edgeItems`/`rail`/`cover` as slot attachments; the editor's חיבורים chip; `takesEdgeItems` becomes slot rules.
**Done when**: a user-made element with a `top` slot takes table items and dresses in focus mode; a user-made frame with a `side` slot takes a curtain from the flyout; stairs click onto any element's `edge` ≥ 30 cm; the 11-07 cover (§8 there) is a `top` slot accepting a rug.

### Stage 6 — One instance, two owners (XL)
`ElementInstance`; `VenueStructure.elements`; `DesignDocument.elements`; the writers move kind by kind (read adapters first, the `stairs` → `edgeItems` pattern); the /halls add list = the library; the /halls bar's per-kind chips = the generated params panel + the kept gesture panels; `newFeatureFromProduct` keeps the ref.
**Done when**: אמרה on develop reads unchanged through the adapters (its 24 columns, 12 curtains, pools, plants, seating), a ח bar placed at a venue draws as a bar, the venue column and the catalog column are one definition, and `db:verify:venue`/`check:structure` are green.

### Stage 7 — Levels and the building elements (XL)
`Level`; walls as sweeps with types; openings as definitions in the `wall` slot; slabs; the inter-level staircase; the five roofs; plans per level, elevations and a section as outputs; the "project" owner.
**Done when**: a two-storey house with a staircase is drawn at /halls, printed as two plans and four elevations, and walked in 3D by a client link — with no event, no quote, no seating.

### Stage 8 — Library and marketplace (M)
`element_definitions` rows (versioned, forkable, `origin`); a published product carries its definition (the marketplace copies rows already — the definition rides along); JSON import/export; `mesh` parts (glTF, 3D spec phase E) with a projected plan symbol.
**Done when**: a supplier's pergola bought on the marketplace draws and stands in the room with no code on either side.

**What unblocks what**: 1 → 2 → 3; 4 and 5 after 3, in parallel; 6 after 4 and 5; 7 after 6; 8 any time after 4 (sooner if a supplier asks). The three proving items are deliberately spread over stages 2, 2 and 3 so the model is proved on real things before any kind is retired.

---

## 8. Outside the box — the suggestions that are not the obvious refactor

1. **Invert the source of truth.** Parts with heights are the truth; the plan is projected. The project has spent three weeks making 3D copy 2D by hand; the reverse direction is a function.
2. **Kinds are data, and built-ins are forkable.** The end of "ask Claude for a new FeatureKind". The library of built-ins becomes a product surface (a browsable catalogue of structures), not a code folder.
3. **Engines are the bridge, not a compromise.** Sixty recipes become sixty one-line wrappers on day one of Stage 4, and each is decomposed or kept on its own merits. No big bang, no freeze.
4. **The parity sheet is a tool, not a test.** A generated contact sheet — every catalog row and every אמרה feature, old glyph beside new projection, colour and mono, canvas and print — rendered by Playwright into one HTML page Ravid scrolls and approves. The project has no browser in its check loop for drawings; this round needs one, and it is cheap.
5. **Pins, not formulas.** Figma's constraints are a binding language every designer already knows. A formula language would be more powerful and used by nobody. (DECIDE 3.)
6. **Materials by role, shades by role.** A variant today is one swatch. A pergola is wood AND fabric; a chair is a frame AND a seat. `PartRole` lets one shade recolour the cloth and a second param the frame — and lets the mono booklet grey things by what they ARE.
7. **The elevation sheet is a free output for EVENTS too.** Backdrop heights, curtain drops, stage levels, chandelier hang heights — the crew asks for them today in words; once parts have z, a side view costs one sheet in outputs-screen.tsx.
8. **One cut operator retires four special cases**: hollow bands, pool rims, stage holes, a stairwell in a slab are all "subtract this profile from what is under it".
9. **The venue and the event are the same model.** The hall owner (an organisation since 10-30) draws their property with the designer's pictures; the designer sketches with the venue's structures as first-class elements. Two owners, one geometry.
10. **A text form of the element** (JSON in a מתקדם tab) is cheap, shareable, and the door to describing an element in words one day. Named here so the storage does not close it; not built in any stage above.

---

## 9. The parity harness — how drawings get approved

Nothing in lib/element is drawn by hand, so nothing can be judged by a `check:*` alone. Stage 0 builds:

- `scripts/parity-sheet.ts`: for every product on develop and every feature of a named venue, render the CURRENT drawing (ItemSymbol / FeatureNode) and the NEW `ElementGlyph` side by side at the sketch's scale, in colour, mono and print, into one static HTML page (SVG inline), plus a 3D thumbnail per item from the pure builder's bounds (no GPU needed for the count and the silhouette; a Playwright screenshot of the viewer for the twenty that matter).
- `check:element-parity`: the mechanical half — base shapes must produce identical SVG path strings; everything else must stay inside its old box and keep its label anchor within 2 mm.
- Approval is Ravid's eye on the sheet, per kind, recorded as the flip of that definition's `legacy:` hint in the seed data (a one-line commit per kind — the history of what was approved when).

---

## 10. Risks, and what answers each

| Risk | Answer |
| --- | --- |
| **A generic interpreter is slower than sixty hand-tuned glyphs** (אמרה is 500+ features, 125 plants) | Compile once: `elementGeometry` memoised per (definition version, params, variant); `plan` is path STRINGS, so a node re-renders with no recomputation; repeats become instances for the 3D collector; `.fl-d`/`detail` LOD by CSS as today; the parts list is flat after evaluation. The React-profiler rule in CLAUDE.md (a pan is zero commits) is the acceptance test, unchanged. |
| **The crew's conventions regress** (a chair must read as a chair at 1:100) | Projection-first WITH the `legacy:` hint per kind and the parity sheet. No kind flips without Ravid's approval. |
| **The editor becomes a CAD nobody opens** | Simple mode unchanged and default; pins not formulas; the params panel generated, not designed per kind; the three proving items are the UX test — if Ravid cannot build the pergola in an afternoon, Stage 3 is not done. |
| **Two systems for a year** | Adapters are READ-only and pure; `check:no-new-kinds` forbids a new per-kind branch outside the engines from Stage 4 on; each stage ends with a kind count that went DOWN. |
| **Domain logic leaks into "parts"** (stage fill, seating, dressing as parts) | §1 principle 7 and a scan: lib/element imports nothing from lib/design-document or lib/studio except types and footprint.ts; `Placement.stage` and `DesignTable` stay theirs. |
| **Storage** | `products.appearance`, `venue_structures.structure` and `design_documents.content` are jsonb — Stages 1–7 need **no migration**; `element_definitions` arrives at Stage 8 when versions and sharing need rows. |
| **The 11-07 round landed on the old pattern before this was decided** | It is fully built (walls, rims, shaped outlines, rails, contours, pergola, sails, ceiling drapes, LED, covers — and, the same day, the built-in kit and the dance floor). Nothing is undone: each is a well-shaped kind whose definition the model absorbs at Stage 4 (pergola, LED strip and screen, dance floor as engines and seed definitions) and Stage 5 (the cover as a `top` slot). DECIDE 8 is overtaken. |

---

## 11. DECIDEs — the calls only Ravid makes (recommended answer first)

**Decided 2026-11-07: every DECIDE on its recommended answer**, except 8, which the day overtook (the whole round landed). The three proving items are fixed in §13.

1. **Projection-first symbols with a `legacy:` escape per kind** — or keep hand glyphs forever and add the model only for new things. *Recommended: projection-first.* The escape hatch means no regression is forced; the gain is one drawing per thing.
2. **Instances FOLLOW their definition's version; a sealed document records the version it was sealed at.** Alternative: pin every instance (a redrawn column redraws nowhere). *Recommended: follow.*
3. **Pins (Figma constraints) and no formula language.** Alternative: expressions (`min(w, d) * 0.08`). *Recommended: pins*; `Bound` is a tiny linear form so a formula can be added under it later without storage change.
4. **Merge venue features and placements into one `ElementInstance` (Stage 6)** — or keep two instance types over one definition type. *Recommended: merge, behind read adapters.* The duplicate drawings and the lost link are the cost of two.
5. **The three proving items.** *Recommended: a bar with a raised back-bar and shelf (Stage 2), a tiered fountain in a hexagonal basin (Stage 2, needs revolve), a pergola with posts, beams and slats (Stage 3).* Ravid may swap any for something from his own catalog or from אמרה.
6. **Levels belong to the property (venue), and an event names the level it is on.** Alternative: levels on the document. *Recommended: property.*
7. **The architect boundary**: plans per level, elevations, a section, 3D walkthrough, areas, element/door/window counts — nothing else. *Recommended: yes, and written into docs/01 §9.*
8. **The 11-07 round**: ~~finish rails, sails and ceiling drapes as specified; hold pergola, LED strip/screen and covers for Stages 3 and 5~~ — overtaken: the whole round, the built-in kit and the dance floor landed the same day. *Decided: keep them as built; pergola, LED and the dance floor are Stage 4's first engines, the cover Stage 5's first slot.*
9. **A `category` stays required on every element** (business semantics: seats, flowers, stock, hall pass, quote sections), while the DRAWING no longer depends on it; `other` is the default for a user-made structure. *Recommended: yes.*
10. **Where the editor lives**: the appearance modal grows into the element editor (same file, progressive). Alternative: a new route `/elements`. *Recommended: grow the modal*; a route can wrap it later.
11. **Materials by role**: the variant's swatch recolours the `cloth`/`surface` role by default; other roles take the definition's fixed material unless a `colour` param is declared. *Recommended: yes.*
12. **The text (JSON) form of a definition in a מתקדם tab** — now, or never promised. *Recommended: Stage 8, read-only first.*

---

## 12. Glossary — the words this document uses (and the UI should)

| Hebrew | English | Meaning |
| --- | --- | --- |
| אלמנט | element | a thing with a definition and a place |
| הגדרה | definition | the parametrised assembly a kind or a product IS |
| חלק | part | one solid in the definition, with z and h |
| פרופיל | profile | the 2D shape a part is made from (today's `MapShape` + custom) |
| הבלטה · סיבוב · גרירה · משטח | extrude · revolve · sweep · sheet | the four ways a profile becomes a solid |
| חיתוך | cut | a part that subtracts |
| פרמטר | parameter | a named number/choice the definition exposes |
| הצמדה | pin | how a part follows the element's size (start/end/stretch/centre/scale) |
| חזרה | repeat | one part laid many times along an edge, ring, path, grid or area |
| מנוע | engine | code that emits parts from parameters (flowers, plants, treads) |
| חיבור | slot | where another element attaches (top, side, rim, hang, line, inside, edge, wall) |
| מופע | instance | a definition placed, owned by the venue or the event |
| הטלה | projection | the plan symbol derived from the parts |
| קומה | level | a storey, with its elevation and height |
| ספריית אלמנטים | element library | built-in, studio and marketplace definitions |

---

## 13. Status — what is built (branch `feat/2026-11-07-element-model`, 2026-11-07)

**The three proving items** (DECIDE 5, as recommended — Ravid may swap any for a row of his own):

1. **A bar with a back-bar and a shelf** — counter 300×60, h 110 (the row); back-bar 300×40 standing 90 cm behind the counter's middle, on the floor, h 200; a shelf 300×25 on the back-bar's face at 100 cm, 4 cm thick. Built in the editor from three rectangles with the גובה panel (Stage 2).
2. **A tiered fountain in a hexagonal basin** — basin a hexagon ⌀300, h 60; a tier ⌀160 standing at 60, h 50; a top tier ⌀80 at 110, h 40. Needs `revolve` in the editor (Stage 2b) for the tiers' bowls; as stacked extrudes it already stands.
3. **A pergola 400×400** — posts 12×12 at the corners, beams 15×20 along the edges at 240, slats 5×10 across every 30 cm. Stage 3 (pins and repeats).

**Stage 0 — done.** The DECIDEs are answered in §11; the glossary is §12; the parity harness exists: `npm run check:element-parity` (lib/element/parity.ts — the base library and a matrix of every shape × solid/hollow/ring/arc/textured × alone/with parts × three sizes agree with `sizedFootprint` to the SVG path string) and `npm run parity-sheet` (scripts/parity-sheet.ts — the same rows drawn side by side, current and new, with the 3D parts the model would build, into `parity-sheet.html`; `--org <id>` draws a studio's real catalog).

**Stage 1 — done.** `lib/element/types.ts` (Profile, ElementPart with z/h, PartOp extrude · sheet · revolve, ParamDef, ElementDefinition), `lib/element/adapter.ts` (`definitionOf(product)` reads a row's MapAppearance; `elementSizeOf`), `lib/element/geometry.ts` (`elementGeometry(def, size)` → footprint · box · parts · plan paths bottom-up · top; `check:element`), `components/element-glyph.tsx` (the one plan drawing — a flat element IS `FootprintShape`, a raised one is layered), `lib/scene/element-body.ts` (`elementParts` / `elementBody`; `check:scene-element`). The ADR-5 fallback body (`fallbackBody`) now builds through the element model: a row with no heights is exactly the extrude it was; a composite with per-part textures stands in them. `composePieces` is exported from footprint.ts so the model composes exactly as the plan does. Nothing a user sees changed; every existing check is green.

**Stage 2 — begun.** `ShapePart.zMm` / `heightMm` (jsonb, no migration; carried through `baked`, `upright`, `lookOf`); the shape editor's bar has a **גובה** panel — the first shape edits the item's height, any other its own height and height from the floor, with a **חזית** view (`app/(app)/catalog/elevation-view.tsx`) drawn live; the 3D bar recipe stands a back piece that carries its own z/height where it says (bottles on its top), and the fallback does the same for every other category. **`revolve` is in** (lib/element/revolve.ts, `check:revolve`): a round shape (circle, ellipse; not a band, not a slice) may carry a SIDE PROFILE — `ShapePart.revolve` / `MapAppearance.revolve`, `RevolvePoint[]` as FRACTIONS of the shape's radius and height (r = 1 the rim the plan draws, z = 1 the top), so a bowl typed wider stays a bowl — picked from preset tiles (קערה · אגן · אגרטל · כד · באלוסטר · חרוט · כיפה, or גליל = none) and dragged point by point in the bar's **גוף** panel (`app/(app)/catalog/revolve-editor.tsx`: a click on the outline adds a point, a double-click removes one, the foot and the top slide only sideways — `movedPoint`/`addedPoint`/`removedPoint` keep it sound); drawn as its silhouette in the חזית view, turned as a `lathe` in the room (`revolveProfileMm` off the piece as it stands, an ellipse the same body stretched). **A row whose shapes say anything about their own bodies is BUILT BY THE ELEMENT MODEL in the room, whatever its category** (`hasOwnBody` in the adapter; `itemBody` checks it first — a vase whose designer drew its profile is that profile, not the category's guess from its name; the bar keeps its recipe, which honours heights itself). **A category's recipe meets the model** (`ownBodyParts` in lib/scene/element-body.ts, `ElementPart.own`): a table row's shape with its own height is built by the model BESIDE the table's top, which stays the recipe's (its legs and cloth on the rest) — before this a table extruded every shape as tabletop and a shelf typed a metre up showed nothing (Ravid, same day: "the 3D doesn't seem to listen to the changes"). **Seen in a browser (headless system Chrome through Playwright, 2026-11-07):** the pane builds on open, after a shape is added, after a mouse drag, after a typed height and after a revolve pick, no console errors. **Still open in Stage 2**: proving items 1 and 2 built by Ravid's own hand. **The 3D pane inside the editor is built** (Ravid, same day: "add an option to see the 3D in the shape editor"): the header's Box button — in the shape editor AND the composite editor (Ravid: "also to the multi element product") — opens `app/(app)/catalog/scene-pane.tsx` in the canvas's corner, fed a SUBJECT (a key naming what the room is built from, and the build) — `lib/scene/item-scene.ts` (`check:item-scene`) builds the studio's own scene on an empty plan, framed by `focusViewpoint`: `itemScene` over a one-item document (a table row with its seats, anything else at the origin, daylight), `compositionScene` over the composite's whole arrangement (every piece where the editor stands it, framed together); the UNSAVED draft resolves for the span of the build through `withResolved` (lib/studio/catalog-resolver.ts — an overlay over the catalog, never a prime, so no canvas cache is emptied for a row nobody saved); the studio pane's rules hold (settle, hide-never-unmount, memo'd viewer).

**Stage 3 — begun (2026-11-07, Ravid: "continue").** **Pins and repeats are in the one footprint engine** (lib/studio/footprint.ts — `composeShapes`, `sizedShapes`, `repeatCopies`, `hasBindings`; `check:footprint`), so the sketch, the printed map, the clearance check, the catalog card and the element model's geometry all lay the same copies in the same places: `ShapePart.pin` (`Pin` — per axis `scale` (the default, what every part did) · `start` · `end` · `center` · `stretch`, against the FIRST shape's box: Figma's constraints, no formula language — DECIDE 2 as recommended) and `ShapePart.repeat` (`Repeat` — `corners` · `edges` · `row` (a spacing, struck from the middle, each copy spanning the base where it stands, cut to a hexagon's or a hand-drawn outline's chord) · `grid` (copies of the prototype's size whose centres lie inside), with `spacingMm`/`spacingYMm`/`marginMm`/`axis`; the drawn shape is the PROTOTYPE, its thin side the copies' section). A stretched item with any pinned or repeated shape is sized by them — the base re-derived at the new size, each shape put by its pin, the repeats laid again — and one with neither is scaled whole, bit for bit as before (`check:element-parity` now holds pinned, repeated and outline-only rows too, 227 rows × 3 sizes). **A shape may be an OUTLINE ONLY** (`ShapePart.body` / `MapAppearance.body` = `none`, `PartOp` `none`): the item's reach on the plan, nothing in the room — so a pergola's first shape is the roof's line and the parts are its body; `hasOwnBody` counts it. **lib/element reads it all through the engine**: `definitionOf` carries pin/repeat/body, `elementGeometry` asks `composeShapes`/`sizedShapes` (its own copy of the three readings is gone), a repeated part's `pieces` are its copies, `elementParts` skips an outline-only part. **The editor**: every non-first shape's bar has **עיגון** (two selects, horizontal and vertical) and **חזרה** (ללא · בפינות · לאורך הצלעות · בשורה · ברשת, with spacing, vertical spacing, direction and margins), the copies drawn faint and dashed under the shapes as the prototype is dragged (`drawnPieces` in shape-list.ts — the item's box on the canvas is the plan's), and the first shape's **גובה** panel has "מתאר בלבד — בלי גוף בתלת־ממד"; the חזית view draws an outline-only shape dashed. **Proving item 3 is held by the checks** (`check:element`, `check:scene-element`): a 4×4 roof outline, 12×12 posts at the corners 2.2 m to the beams, 15×20 beams along the edges, 5×10 slats every 30 cm — 4 + 4 + 13 bodies and no roof slab; laid 6×4 it is 4 posts in the new corners, 6 m beams and 19 slats at the same 30 cm. **Not in Stage 3 yet**: a definition's own parameters and `when` (the `roof` choice — the slats' repeat is simply there or deleted for now), z-pins (`floor` · `top` · `stretch` — a part's z and height are stored absolute, so a taller item does not yet lift a shelf pinned to the top), a bar's bottles and chair rows as repeats/refs, `Placement.sizeMm` as width/depth params. **Still open**: proving items 1–3 by Ravid's own hand in the browser.

**A drawn body COMBINES with the category's picture (2026-11-08, Ravid: "the גוף you added is good but it doesn't combine the shape with the draw").** `itemBody` no longer hands a row with own bodies to the element model alone: `ownBodyParts` (the base's `revolve` counted as own, the base's pieces kept in the rest) splits the row, the recipe draws its picture on the rest, and the model's parts are added — a chandelier keeps its arms, bulbs and crystal round the lathe its designer drew at its heart. Only `BODY_REPLACES_PICTURE` (vase · column · fountain · lamp) is the model alone. This is the Stage 4 direction in miniature: the recipe is an ENGINE the definition's parts stand beside, until the recipe itself is data. The first engine to grow parameters is the chandelier (lib/catalog/chandelier.ts: tiers · crystals · strands, one layout for the plan and the room, every style built in 3D) — Ravid, same day: "need to be more customisable, קומות, חרוזי קריסטל".

**The photographs (2026-11-08, Ravid: seven pictures of אמרה's chandeliers, "this is how it should be").** Three styles were added to the one layout: `drums` (stacked drum shades), `prisms` (a cascade of crystal rods), `empire` (a basket of bead strands) — the first two CASCADES whose tiers widen upward (`CASCADE`), each tier a band with its lamps inside, the third the `EMPIRE` constants (crown, wide ring, strands sweeping in to a small ring, a drop cluster). The plan draws a cascade's rods as dots under the `fl-d` LOD class and a basket's strands as dotted radials; the room builds lit drums (emissive, a darker cut of the tone), glass bars, glass beads. The photographs' COMBINATION — a patterned drum with a cascade under it — is what Ravid called "a product of a couple of products": a composite of two ceiling rows on one point, each at its own hang height, so the composite editor's bar gained the studio's hang-height popover for a ceiling item and `check:item-scene` holds the stacked pair. The photographs' ceiling curtain (sheer runs crossing the dance floor with lights in them) was already a run with one scallop and a deep sag; the lights are `RunRail.lights` → `runLights`, drawn on the plan and in the room, never counted. The pane's framing of a ceiling item moved from its underside to its middle, backing off for its height. All three styles were SEEN in headless Chrome (plan and pane) on an unsaved draft.

**Next**: Ravid builds the pergola (and the bar and the fountain) in the editor; then the rest of Stage 3 (custom params + `when`, z-pins), then Stage 4. The built-in kit (spec 2026-11-07-built-in-kit) is the first seed library: a kit row is never duplicated as a ROW, so "fork a built-in" (Stage 4) makes a NEW definition in a creatable category, never a second kit row.
