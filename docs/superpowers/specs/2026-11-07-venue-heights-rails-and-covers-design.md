# Wall heights, curved outlines, rails, LED, covers and edgings — the venue-plan round of 2026-11-07 — design

Version 0.1 | 2026-11-07 | **Not built.** A definition, written to be argued with, from Ravid's list and his answers to the first round of questions. Each **DECIDE** is a point he left open ("IDK", "your recommendation") and the answer this document assumes; change it here before anything is built. Companion to [2026-10-23 3D scene](2026-10-23-3d-scene-design.md) (every new thing here has a body in the room) and to the /halls notes in CLAUDE.md (the rounds of 10-16, 10-17, 10-24 and 10-30, whose patterns this round reuses on purpose).

Ravid, 2026-11-07: *"in venue plan, I want to be able to define walls height (not must to be an area), height of windows… curve edges any shape (like pool, and more)… category of פרגולה… put curtain both on wall and not (like on פרגולה / element with height… can also be as מפרש… can be on a מוט like an ר shape)… define the curtain texture like waves… a curtain that is like waves on the ceiling… option to add LED… click on surface in design and put on it carpet (from the catalog or custom)… add to pool שפה like a stroke… in carpet separately color the קונטור and define its width… more texture combination like cross, lines."* Textures (the last item) he deferred: "let's do it later".

## 0. What exists

- **Wall height is derived, never typed.** `wallHeightMm` (lib/scene/envelope.ts) reads a wall as tall as the tallest ROOFED zone or building it borders, a kerb for the `edge` kind (`KERB_MM`), a garden wall when it borders neither. `Wall` (lib/venues/structure.ts) has `id`, `a`, `b`, `kind`, `curve` and nothing about height. Nothing on the plan or on paper shows a height.
- **Window heights exist** (`StructureEntrance.sillMm`/`headMm`, `windowHeights`, `isVitrine`; the opening bar's "זכוכית" panel at /halls). Ravid's ask is the WORDING: "height from the ground" and "height of the window", not sill and head.
- **Curves exist in two places.** A wall bows (`Wall.curve`, the diamond at its midpoint, the bar's "עיקום (ס״מ)"). A catalog custom shape bows its sides (`MapAppearance.edgeCurves`, the shape editor). A `StructureFeature` CARRIES `edgeCurves` (a catalog row placed at /halls keeps its bows), but /halls' own outline editor (`RegionOutlineEditor`, components/venue-plan.tsx — the zone's "עריכת הקווים", a free surface's, a pool's) passes `edgeCurves={[]}`: it moves, inserts and removes corners only. A zone `region` (`ZoneSource`, lib/venues/zone.ts) is `boundary: Point[]` with no curves at all. Rounded corners exist on a rug alone (`Placement.corners`, lib/studio/rug-shape.ts).
- **A curtain hangs on a WALL, in both worlds.** The sketch's drape is `Placement.span: WallSpan` (`wallId`, `from`, `to`), the venue's is `StructureFeature.curtain: FeatureCurtain` (the span + `side`); both resolve through `wallTrack`/`resolveSpan` (lib/studio/anchor.ts) to a `path` every reader draws along — canvas, print, clearance, 3D (`curtainBody` in lib/scene/overhead.ts, `venueCurtain` in build.ts), the quote by arc length. `DrapePleats` is the one cloth drawing: one wave. The category `curtains` is `anchor: "wall"`, `sizing: "stretch"`.
- **Nothing hangs from anything but a wall or the zone's ceiling.** A chandelier's chain and a curtain's top read `zone.ceilingHeightMm` (build.ts:168/184), 0 = open sky; an open zone has no roof to hang from.
- **No pergola, no LED, no screen, no rim, no cover.** `FeatureKind` is pool · stage · bar · structure · column · other · plant · surface · stairs · ramp · seating · fountain · curtain. The catalog has `chandeliers`, `lamps`, `candlesticks` and nothing that is a line of light or a panel. A pool is a `pool` feature drawn in the `water` material to its outline's edge.
- **Rugs** are `rugs` rows (`sizing: "stretch"`), drawn by `RugPattern` (components/item-symbol.tsx): an inset border LINE at 30% ink and a fringe on the short ends, following the rug's bows and corners (`rugInset`, `rugFringe`). No colour, no width. `ClothDrape` draws a cloth's hem the same way.
- **Pricing units exist**: `Product.priceUnit` is `unit | m | m2` (lib/catalog/types.ts); a stage surface is priced per m² of `stageAreaMm2`, a drape per m of its arc, a bench per m. A stage's stairs/skirt/bench reach the quote from rows the studio owns (`MeasureContext.stagePart`, `stairsVariant`…) and the line is `partial` when a row is missing — the pattern a rod follows here.
- **Storage is JSONB everywhere this round touches**: `venue_structures.structure` (walls, features), `zones.source`, `products.appearance`, `design_documents.content`. **No migration in this round.** New categories are code (`lib/catalog/categories.ts`).
- **The one way everything new reaches the room**: `lib/scene` is a pure builder over the document and the structure; a new kind is a recipe there plus a `check:*` fixture, never a three.js import outside `components/scene` (`check:scene-boundary`).

## 1. The one idea of this round: a RAIL

Four of the asks — a curtain on a pergola, a curtain on a free-standing rod, an LED strip along a stage edge or a bar's counter, a run of cloth across the ceiling — are the same thing: **cloth or light hung along a LINE that is not a wall.** Today the line is a `WallSpan`, and every reader (canvas, print, clearance, quote, 3D) reads it through one resolver into a `path` at a height. The round therefore generalises the span, not the readers:

```ts
// lib/studio/rail.ts — pure, check:rail
export type Rail =
  | { type: "wall"; wallId: string; from: number; to: number; side?: 1 | -1; heightMm?: number }
  // a stretch of a wall — WallSpan + the venue curtain's side; `heightMm` only for an LED
  // strip (0 = the floor line, absent = the top of the wall); a curtain ignores it
  | { type: "side"; featureId: string; side: number; from: number; to: number; out: 1 | -1 }
  // a stretch of one SIDE of a venue feature or a sketch item with height — a pergola's
  // beam, a building's face, a stage's edge, a bar's counter; `side` indexes the thing's
  // outline as edge items index a stage's (`stageSide`); the height is the thing's own
  | { type: "rod"; points: Point[]; heightMm: number; cantilever?: "start" | "end" }
  // a free-standing rod: a polyline in plan at one height (two points = straight, three =
  // an L or a ח round a corner), a post at every end and bend — except a `cantilever` end,
  // which is the ר: the arm stands out from its one post, no post under its far end
  | { type: "run"; a: Point; b: Point; heightMm: number; sagMm?: number }
  // a straight line in the air: a swag across the ceiling, an LED line between two points
  | { type: "canopy"; outline: Point[]; heightMm: number; directionDeg: number; spacingMm: number; sagMm?: number }
  // an AREA of parallel runs — a draped ceiling — the runs derived on every read
  | { type: "sail"; ties: SailTie[]; sagMm?: number };
  // a sheet stretched between 3–4 tie points, each at its own height
export interface SailTie { p: Point; heightMm: number; to?: TieTarget }
export type TieTarget = { kind: "wall"; wallId: string; t: number } | { kind: "feature"; featureId: string; corner: number } | { kind: "post" };
```

`resolveRail(rail, ctx)` returns **lines** (`RailLine[]`: each a `path: Point[]`, `lengthMm` along it, `topMm`, and the hang side) for wall / side / rod / run / canopy (a canopy is N lines), or a **sheet** (`RailSheet`: the polygon and a height at each corner) for a sail. `ctx` is the structure and, in the sketch, the document's items — a `side` rail on a sketch item (a hired backdrop, a stage) resolves through `itemGeometry`, on a venue feature through `featureWorldOutline`; a dangling id resolves to null and the caller survives it exactly as it survives a deleted wall today.

**What changes and what does not.** `WallSpan` stays as the legacy form: `Placement.span` and `FeatureCurtain.wallId/from/to/side` are read into a `wall` rail by `railOf(p)` / `curtainRail(f)` and nothing new writes them (the `stairs` → `edgeItems` pattern). New fields: `Placement.rail?: Rail`, `FeatureCurtain.rail?: Rail`. `wallTrack` is unchanged and is what a `wall` rail resolves through, so a bowed wall's curtain and its door-parting (`curtainPieces`) are untouched. Which rails a row may take is the CATEGORY's (`CategoryDef.rails?: RailType[]`, replacing `anchor: "wall"` for these rows — "which of those it is comes from the product's category, never from guessing"):

| Category | Hebrew | Group | rails | priceUnit default |
| --- | --- | --- | --- | --- |
| `curtains` (exists) | ווילונות | grp-accessories | wall · side · rod | m |
| `curtain-rods` (new) | מוטות וילון | grp-accessories | — (never placed; the rod a `rod` rail is billed as, §6.2) | m |
| `sails` (new) | מפרשים | grp-ceiling-design | sail | m2 |
| `ceiling-drapes` (new) | בדי תקרה | grp-ceiling-design | run · canopy | m |
| `led-strips` (new) | פסי לד | grp-accessories | wall · side · run | m |

The quote bills a line rail by the sum of its lines' `lengthMm` (the drape's rule today, through `MeasureContext`), a sheet by its polygon's area when the row is per m², else per unit. The venue's own curtain and LED (§6.6, §7.3) carry the same `Rail` on the feature.

## 2. Wall height

- **`Wall.heightMm?: number`** — absent = derived as today. Typed, it WINS over the zone's ceiling in every direction: higher (a parapet above an open terrace) or lower (a half wall, a מחיצה inside a hall — "the ceiling does not have one height, think of the real world"). The roof is unchanged: a wall lower than its zone's ceiling stops under it; `inwardSide` and face detection do not read heights.
- **An `edge` wall takes one too**: typed, a kerb becomes a fence or a low garden wall of that height in 3D (a thin wall, `WALL_THICK_MM`/2, no kerb cap); on the plan it stays the boundary line it is.
- **Readers**: `wallHeightMm(wall, …)` returns `wall.heightMm` first; `windowHeights` is already capped by it; the venue curtain's top (0 = the zone's ceiling) becomes `min(ceiling, wall height)` on that wall; `doorPieces` lintels follow (a 2.1 m door in a 1.8 m wall has no lintel — the door is cut to the wall, `check:envelope`).
- **Typed per wall** in the wall bar's panel, a "גובה (ס״מ)" `NumberField` under "עיקום", blank = "לפי החדר" (placeholder shows the derived figure). No "all walls of the room" button (Ravid: per wall), no figure on the plan or on paper.
- `check:envelope`: a 1.2 m wall inside a 4 m hall — the roof stays, the wall stops at 1.2; a 2 m fence on an `edge`.

## 3. Windows: the wording

Storage unchanged. The "זכוכית" panel's two fields become **"גובה מהרצפה"** (= `sillMm`) and **"גובה החלון"** (= `headMm − sillMm`, written back as `headMm = sillMm + height`); a ויטרינה shows the second blank with the placeholder "עד הקיר". No door height (fixed `DOOR_HEIGHT_MM` stays), nothing printed.

## 4. Curves and corners on any outline

**Every outline the designer draws by hand may bow its sides and round its corners: a pool, a free surface, a building, a traced zone, any custom-shaped feature.** DECIDE 1: the curve is the WALL's bow (one depth per side, dragged on the midpoint diamond or typed in cm), not a free two-handle bezier — it is what the walls and the shape editor already do, it types as one number, and since `EdgeCurve` is a cubic underneath (`bulgeToCurve`), a free handle can be offered later with no storage change. "Smooth the whole shape" (a kidney pool) is a one-click fill of the corner radii (§4.3), not a spline.

### 4.1 Storage
- `StructureFeature.edgeCurves` already exists; it gains `corners?: (number | null)[]` (a radius per vertex, mm, aligned to `outline`).
- `ZoneSource` `region` gains `edgeCurves?` and `corners?` the same way.
- Features placed from a catalog row keep carrying the row's bows; a venue `stage` feature with curves reads into its `StageBuild` as chords (`footprintStageOutline` → `smooth` sides, the sketch's own rule) so its edge items follow the curve.

### 4.2 One module, two readers
`lib/studio/shaped-outline.ts` (`check:shaped-outline`):
- `shapedOutline(outline, edgeCurves, corners) → { outline, edgeCurves }` — each rounded corner replaced by its two tangent points and one arc edge (a cubic at κ = 0.5523, exact enough at 25 cm); radii clamped to half the shorter adjacent side and to what the neighbours leave (`fitCorners`' rule, generalised). A bowed side keeps its bow between the tangent points.
- `flattenOutline(outline, edgeCurves, tolMm) → Point[]` — the POLYGON every geometric reader walks: `detectFaces`, `pointInPolygon`, areas, hulls (`feature-zones`), clearance, print measurements (`asRound` still recognises a circle traced this way), the 3D extrude. `sampledBounds` is this at the bounds.
- The rule, held by a scan check like `check:face-surfaces`: a reader that walks `outline` as straight sides goes through `flattenOutline`; a reader that DRAWS goes through `outlinePathD(outline, edgeCurves)` (exists). `ResolvedZone.boundary` stays a polygon (flattened on resolve); `ResolvedZone.shape?` carries the true curves for `ZoneRegions`, the printed map and the zone's halo.
- lib/studio/rug-shape.ts is left alone (it is a rectangle's special case and works); a later pass may rebase `rugOutline` on `shapedOutline`.

### 4.3 The editor
`RegionOutlineEditor` gains what the wall and the rug already have, both through `startPointerGesture`:
- the bow diamond at each side's midpoint (`onBowSide(index, depthMm)`), the depth pulled to the zoom's grid step, Alt frees, 0 straightens;
- the rug's round grip inside each corner on its diagonal (`onCorner(index, radiusMm)`; Alt = every corner; double-click squares it);
- the "עריכת הקווים" bar: the selected side's "עיקום (ס״מ)", the selected corner's "רדיוס (ס״מ)", "כל הפינות", and **"החלקה"** — every corner's radius set to a third of its shorter side in one entry (the kidney in one click).
Both /halls hosts (a feature's outline, a zone region's) and the catalog's shape editor read the same editor; the shape editor already bows, it gains corners.

### 4.4 Pool presets and the water
The flyout's pool offers a shape first: **מלבן · אליפסה · כליה · ר · חופשי** (`poolOutline(preset, w, d)` in a new lib/venues/pool.ts, the kidney and the L as custom outlines with bows and corners already set — a kidney is two unequal lobes, not an oval). "חופשי" is the surface trace in the `water` material (exists).

## 5. פרגולה

**Both worlds** (Ravid: "might be both"): the venue's fixed pergola is a feature, a hired one a catalog row. ONE definition, one drawing, one body.

### 5.1 Definition
Posts at the corners of its outline, beams along its sides, and a roof across them.
```ts
export interface Pergola {
  postMm: number;                       // a post's square, default 150
  roof: "slats" | "solid" | "fabric" | "none";   // slats: open lattice; solid: a deck; fabric: a stretched cloth; none: beams only
  slatDirectionDeg?: number;            // slats run this way in the pergola's frame; absent = across the long side
  slatSpacingMm?: number;               // default 300
  closedSides?: number[];               // sides carrying a lattice panel (DECIDE 10); absent = all open
}
```
- Venue: `FeatureKind` gains `pergola`; `StructureFeature.pergola?: Pergola`; `FEATURE_DEFAULTS.pergola` 4000 × 4000 × 2600, `shape: "rect"`, any outline (a custom one, bowed sides too — a round pergola's posts stand on its corners as drawn); not movable by default; locked like a column once placed. Added from /halls' add list, section "מבנה", "פרגולה".
- Catalog: category **`pergolas`** ("פרגולות", grp-chuppahs beside the חופות it stands in for — DECIDE 11), `dims: "box"`, height required, `placeOnce` no. The roof and slats are the row's `MapAppearance.symbolStyle` through `SYMBOL_STYLES.pergola` (slats / solid / fabric / beams only), `postMm` a `categoryFields` number. Stretches (`sizing: "stretch"`): a 4 × 4 row laid 6 × 4 keeps its post size and slat spacing.

### 5.2 Drawing and body
- Plan (`components/pergola-glyph.tsx`, shared by /halls, the sketch, the add card, both printed looks, as `column-glyph` is): the outline in a light line, a filled square at each post, the slats as thin lines at their spacing (solid: a faint hatch; fabric: a dashed diagonal; none: the beams only), a lattice side drawn as a hatched edge. No name on the venue's.
- 3D (`pergolaBody` in lib/scene/floor-kinds.ts for the row, `featureBodies` for the feature — one function): posts, a beam along every side at the top, slats as thin boxes at their spacing (solid: one slab; fabric: a `plane` in the row's shade), lattice panels on the closed sides. `check:floor-kinds`.

### 5.3 A pergola is a ROOF
Ravid: yes. `lib/venues/roofs.ts` (`check:roofs`): `roofAt(point, structure, zones) → { heightMm; kind: "zone" | "building" | "pergola" } | null` — the zone's ceiling when roofed, else the building the point is in, else the pergola it is under (the sketch's pergola items count too, through the same function with the document's items), else null (open sky). Readers: the chandelier's chain and the curtain's top in build.ts (lines 168/184 read `zone.ceilingHeightMm` today), the venue curtain's default height, the sail's and the ceiling drape's default `heightMm` when placed, the sketch's hang-height placeholder. In 3D the slats shade what is under them by being geometry; nothing else to do.

## 6. Curtains: rails, sails, ceiling runs, styles

### 6.1 On a side of an element (`side` rail)
Click near a side of a thing with height — a pergola, a building, a backdrop, a stage, a bar — and the flyout's "וילון" hangs on that side, the whole side, on the side of it the click fell (`out`), from the thing's own height down to the floor; the "קטע" panel types the stretch (`from`/`to` as a drape on a wall) and flips the side. A hired drape on a VENUE pergola is a `side` rail onto `structure.features`; on a hired pergola, onto the document's item (`featureId` is a placement id then — the resolver tries the document first). A curtain on a round pergola follows its rim as it follows a bowed wall (`path`). Which things offer a side: any with `heightMm ≥ 1000` and an outline — `pergola`, `structure`, `stage`, `bar`, `other`; not a `column` (a post, not a side).

### 6.2 On a free-standing rod (`rod` rail)
Placed from the flyout as **"וילון על מוט"**: the first click puts the first post, each further click a bend, Enter/double-click ends it (the stage area tool's gesture, the same 45° steps from the first side, Alt frees); a height field defaults to the roof at the first point (§5.3) or 2.4 m under open sky. **ר** is the end grip's "ללא עמוד" toggle (`cantilever`): a post at one end only, the arm's reach capped at 3 m. **DECIDE 2: one placement, not two.** The rod is part of the curtain placement and reaches the quote as a stage's stairs do: `MeasureContext.rodOf` → the studio's first `curtain-rods` row (new category, "מוטות וילון", per m), the drape's quote line saying "כולל מוט 6 מ׳" in words, `partial` when the studio has no rod row. Nothing is placed from `curtain-rods` directly (like `stage-skirts`). Drawn: the rod as a hairline along the path with a small filled square at each post (none at a cantilevered end), the cloth as today's pleated band on the hang side. 3D: a pipe at `heightMm` on square posts; the cloth `curtainBody` off it.

### 6.3 A sail (`sail` rail) — מפרש
Category `sails` ("מפרשים", grp-ceiling-design, DECIDE 4: per m² of the polygon). Placed by three or four clicks, each click a tie: on a wall (`to: wall`, slid along it), on a corner of a feature or a sketch item (`to: feature`, carried when it moves), or on open ground (`to: post` — the sail brings a pole, drawn as a post). Each tie's height is typed in the bar (default: the roof at that point, else 3 m); `sagMm` default 8 % of the longest diagonal. Drawn in the CEILING plane: a light fill, a dashed outline, a circle at each tie with its height in the dims layer. 3D: a `plane` sagging to a centre point (`sagMm` below the ties' mean height), two-sided, in the row's shade. Clearance: none (overhead). Quote: area × price.

### 6.4 Ceiling waves — a run and a canopy (`run` / `canopy` rails)
Category `ceiling-drapes` ("בדי תקרה", grp-ceiling-design, per m). Ravid: "do both".
- **A run**: two clicks A → B at a height (default the roof's), a `widthMm` (the cloth's width across the line, default 1.2 m), `sagMm` (how low its middle hangs, default 30 cm), `waves` (how many scallops along it, default from the length at 1.5 m each). One line.
- **A canopy**: an area (the stage area tool's gesture, any outline), a direction, a spacing (default = the width, edge to edge); `canopyRuns(rail) → run[]` clips parallel runs across the polygon on every read — move the area and every run moves. The quote bills the sum of the runs' lengths; the canvas and print draw each run as a wavy band (`DrapePleatsAlong` on its path with a scallop at the wave pitch); 3D a `ribbon` per run, sagging between its ends to `sagMm`, scalloped along `waves`.
- Both drawn in the ceiling plane, dimmed with it; both hang over tables as a chandelier does (`hangTargetsOf` is not involved — a run is not a point).

### 6.5 Style, drop, tie-backs
- **Style** — DECIDE 5: drawing only. `CurtainStyle = "waves" | "pinch" | "sheer" | "swag" | "ruffle"` in `SYMBOL_STYLES.curtain` ("סוג הווילון", tiles in the appearance editor — the chair-style pattern); absent = today's `DrapePleats` (= waves), so no row changes by itself. On the plan: waves = today's pleats; pinch = tight regular pleats; sheer = a straight soft band; swag = scallops; ruffle = a dense fine wave. In 3D `curtainBody` takes the style for its pleat profile. The quote is unchanged (a fullness factor — a wave curtain uses twice its width in fabric — is a later question for the row, not this round). The venue curtain's "קטע" panel gets the same tiles (`FeatureCurtain.style`).
- **Drop** — `dropMm?` on the placement and the venue curtain: absent = to the floor (Ravid: "mostly always touch the floor"); the bar's "אורך (ס״מ)" blank = "עד הרצפה". A `side` rail's top is the thing's height, a `rod`'s its own, a `wall`'s the wall's.
- **Tie-backs** — not in this round (decorative; nothing on the plan or the quote depends on them).

### 6.6 The venue's curtain
`FeatureCurtain` becomes `{ rail?: Rail; style?; dropMm?; wallId?, from?, to?, side? (legacy) }`; `curtainRail(f)` reads either. /halls' flyout: "וילון" on a wall as today; near a pergola/building side, on it (§6.1); "וילון על מוט" (§6.2). `syncCurtains` re-lays a wall curtain after a wall edit as today and a side curtain after its feature moves. Door parting (`curtainPieces`) is a wall rail's alone.

## 7. LED

Ravid: strips and screens, both worlds, glowing at night. Nothing else (no uplights, no lit floor, no festoon, no neon).

### 7.1 A strip (`led-strips`, a line rail)
A row of category `led-strips` ("פסי לד", grp-accessories, per m, no height required) is placed on a rail: along a WALL at a height (`heightMm` on the wall rail — the floor line at 0, the top at the wall's height, typed in the bar; default 0, the skirting line), along a SIDE of a stage (its deck edge), a bar (its counter edge, at the bar's height), a pergola beam, a building face; or as a free RUN between two points at a height (a line across the ceiling). The colour is the row's shade (`swatch`). Drawn: a thin solid line in the shade's colour over a wider translucent one of the same colour (the glow), on every canvas and the colour print; the crew print draws a dash-dot line with "LED" in the key. 3D: a thin emissive `ribbon` along the path (MaterialKind `glow`, the colour), and it joins the emitter pool as a chandelier's bulbs do — the light COUNT never changes (the pool stays `CAPABLE.pointLights`); the strip's light is its emissive face, not a point light per metre. Quote: the sum of its lines' length × price.

### 7.2 A screen (`led-screens`)
A row of category `led-screens` ("מסכי לד", grp-accessories, `dims: "box"`, height required — a 4 × 0.1 × 2.5 panel), a free floor item like a backdrop: stands on a stage or the floor, snaps to walls and stage edges as anything does, its FRONT is +y as a stage's. Symbol kind `screen`: a thick dark bar with a fine pixel grid and the row's name, the front marked. 3D: a box whose front face is a `plane` with an emissive material in a neutral grey-blue (an unlit screen is dark; at night it glows softly — no picture, this is a placement drawing, not a content preview). Quote per unit.

### 7.3 The venue's own
`FeatureKind` gains `led` (`StructureFeature.led?: { rail: Rail; colour: string }`, drawn and built as the row's strip; added from /halls' flyout "פס לד" on a wall, a side or two points) and `screen` (`FEATURE_DEFAULTS.screen` 4000 × 100 × 2500, the row's drawing, not movable). A sketch takes a venue LED down for its event as it takes a curtain (`removeFeatures`). Never counted or quoted — they are the venue's.

## 8. A carpet over a surface or a stage

Ravid: "mostly surface and stages"; reshaping the surface reshapes the carpet.

### 8.1 The verb
A venue surface takes no click in the sketch (it is the room), so the verb lives where a point is known: the sketch's **right-click menu** over a venue surface or a stage offers **"שטיח על המשטח…"** / **"שטיח על הבמה…"** with a submenu of the studio's `rugs` rows and **"שטיח מותאם…"**; the stage's own bar carries the same verb (DECIDE 12). "מותאם" opens the product drawer in `new` mode on a fresh `rugs` row — a name, a colour, no price (DECIDE 6: a one-off row, because every placement points at a row in its own studio; its quote line is `partial` until the designer prices it, which is exactly what "custom" means to the quote).

### 8.2 The link
`Placement.cover?: { featureId?: string; stageId?: string; insetMm?: number }` (one of the two ids; `insetMm` default 0 — DECIDE 7). The rug's footprint is DERIVED on every read from the covered thing's world outline — curves and corners included — inset by `insetMm` (`insetOutline`, the band-offset arithmetic `buildHollow` already has): `placementFootprint` returns a `custom` footprint for a covered rug, as it returns a block's for chair rows. `position` and `sizeMm` are WRITTEN with it (the box centre and size, `settleCovers` in `apply()` beside `settleHung`) so a reader that knows only a point and a size — the quote's area, the packing list, alignment — is right without knowing what a cover is; the per-event move of a venue surface (`FeaturePlacement`) is read through `arrangedStructure` as every feature is. A covered rug takes no drag, resize, bow or corner grips; its popover shows the link ("על הדשא · שוליים 0") with "ניתוק מהמשטח", which writes the current outline into `Placement.outline?` (new, read by `placementFootprint` when there is no cover) and drops the link; a covered thing that is gone detaches the same way on read, said in the bar. A stage's hole (`StagePiece.hole`) is a hole in its carpet.

### 8.3 Everywhere else
Drawn by `RugPattern` on the derived outline (the border and fringe follow it as they follow bows). Print the same; the mono booklet's rug grey. Clearance: a rug is not an obstacle (unchanged). 3D: `curvedRugBody` over the outline, standing on the stage when it covers one (`elevation`). Quote: per m² rows bill the outline's area; per-unit rows one. Still the hall pass's rug (`HALL_PASS_CATEGORIES`).

## 9. A pool's שפה (rim), and an edging on any surface

Ravid: inside, the water shrinks; mostly the pool, other elements if cheap. It is cheap — the band is `buildHollow`'s (a band `bandMm` deep inside the outline, curves kept, a closed band one keyhole outline), so the same field goes on `pool` and `surface` (DECIDE 8).

```ts
StructureFeature.rim?: { widthMm: number; material: SurfaceMaterial; raisedMm?: number; style?: ElementStyle };
```
- **Plan**: the band laid in its material (`SurfaceFill`/`ItemSurface`, a tint from `style.fill`), the water (or the surface's own material) inside the inner outline; the inner outline stroked as the pool's edge is today, the outer as a hairline. The dims layer measures the rim's width once. Print: the band hatched as the key says; mono: `MONO.ground`.
- **3D**: the pool's hole in its floor (`Part.holes`) is the INNER outline; the band is a slab `raisedMm` high (default 0 = flush; a pool on a platform keeps `BASIN_RIM_MM`) in its material. A surface's edging is a slab the same way (a lawn's kerb at 100).
- **Clearance and standing**: the rim is floor — the pool's obstacle outline for the sketch's clearance and the print's "fixed" solids is the inner (water) outline (Ravid: people stand on it).
- **Bar**: the pool's / surface's bar gets a "שפה" chip: width (cm), the material from `SurfaceTiles`, "מוגבהת" (cm), a tint; 0 width = none. Not on the fountain — its basin is drawn by its symbol.
- `check:structure`: a 12 × 6 ellipse pool with a 40 cm rim → water 11.2 × 5.2; a rim deeper than the pool is no water at all (the band is the solid, `buildHollow`'s rule).

## 10. Contour on rugs and cloths

```ts
export interface Border {
  widthMm: number;               // the band, inside the edge
  colour: string;                // CSS colour
  inner?: { widthMm: number; gapMm: number; colour: string };  // a second band inside the first (Ravid: yes to two)
  fringe?: boolean;              // absent = the rug's default (on for a rug, off for a cloth)
  fringeColour?: string;         // absent = the border's colour
}
MapAppearance.border?: Border;   // the row's (rugs, tablecloths)
Placement.border?: Border | null; // this plan's override; null = none here (the vessel's rule)
```
DECIDE 9 (Ravid: "your recommendation"): on the row, overridable per placement. `borderOf(p, product)` resolves the two. Drawn by `RugPattern` (bands FILLED along `rugInset`'s outlines — a bow and a corner followed, the second band inside the gap, the fringe in its colour) and by `ClothDrape` (the hem as a band along the cloth's edge; a runner's too). The catalog preview, the rail's drag image, the canvas, the colour print; mono: the band a step darker than the rug's grey (so a bordered rug still reads). 3D: the rug's and the cloth's materials get the band in their procedural canvas texture (a (colours, widths, size) key in the material table; `TEXTURE_REPEAT_MM` logic untouched). Edited in the appearance editor's "קונטור" block (width cm, a swatch, "קונטור כפול" with its gap and colour, "פרנזים" with a swatch) and, per placement, the same fields in the rug popover / the cloth's bar ("כמו בקטלוג" resets). `check:rug-shape` holds a bordered bowed rug's bands.

## 11. Deferred: textures (stripes, crosshatch, checks)

Not in this round (Ravid: "let's do it later"). When it comes: a `Pattern` beside `Texture` on the appearance — stripes / grid / checks / herringbone / chevron / dots, two colours, a line width, a spacing, an angle — on tables, bars, rugs, surfaces, cloths and curtains, drawn by `ItemSurface` as a `pattern` tile in plan mm, flattened to a grey in mono. The question of what "cover" means (משבצות?) is open.

## 12. Data model, in one place

| Field | On | Store | Read by |
| --- | --- | --- | --- |
| `Wall.heightMm?` | structure | JSONB | `wallHeightMm`, curtain top, window cap |
| `StructureFeature.corners?`, `ZoneSource.region.edgeCurves?/corners?` | structure, zones.source | JSONB | `shapedOutline` / `flattenOutline` |
| `StructureFeature.pergola?`, kind `pergola` | structure | JSONB | glyph, body, `roofAt` |
| `Rail`; `Placement.rail?`, `FeatureCurtain.rail?`, `StructureFeature.led?` | document, structure | JSONB | `resolveRail` → every reader |
| `CurtainStyle` (`symbolStyle`), `Placement.dropMm?`, `FeatureCurtain.style?/dropMm?` | appearance, document, structure | JSONB | `DrapePleats`, `curtainBody` |
| categories `curtain-rods`, `sails`, `ceiling-drapes`, `led-strips`, `led-screens`, `pergolas`; `CategoryDef.rails?` | code | — | rail, drawer, quote |
| `StructureFeature.rim?` (pool, surface) | structure | JSONB | `buildHollow` band, envelope hole |
| kinds `led`, `screen` | structure | JSONB | glyphs, bodies |
| `Placement.cover?`, `Placement.outline?` | document | JSONB | `placementFootprint`, `settleCovers` |
| `Border`; `MapAppearance.border?`, `Placement.border?` | appearance, document | JSONB | `RugPattern`, `ClothDrape`, materials |

**No migration.** `check:costs` is unaffected (nothing here is money, and the new categories are priced like every other row). `check:client-product`'s allow-list gains `border` and the rail-bearing fields a client's read-only sketch draws.

## 13. Checks

New: `check:rail` (every rail type resolves; a dangling id is null; a canopy's runs cover its area; the quote length is the arc on a bowed wall), `check:shaped-outline` (corners clamp, a bowed-and-rounded 12 × 6 flattens to a polygon whose area is within 0.5 % of the true one, the keyhole case), `check:roofs`, `check:pergola`, `check:cover` (derived footprint, inset, detach, a stage's hole), and cases added to `check:envelope`, `check:structure`, `check:curtain`, `check:rug-shape`, `check:floor-kinds`, `check:overhead`, `check:scene` (the fixture gains a pergola, a rod curtain, a sail, a strip, a rimmed pool, a bordered rug — and the secret price still never appears).

## 14. Build order

1. **Walls and windows** (§2, §3) — small, self-contained, no new module.
2. **Shaped outlines** (§4) + pool presets + **the rim** (§9): one editor, one module, the pool is the first customer.
3. **Rails** (§1, §6.1, §6.2, §6.5, §6.6): the span → rail refactor with the wall rail only first (every existing drape and venue curtain unchanged, `check:curtain` green), then side and rod, then styles and drop.
4. **Pergola and roofs** (§5): the first `side` rail with somewhere new to hang.
5. **Sails and ceiling drapes** (§6.3, §6.4).
6. **LED** (§7).
7. **Covers** (§8).
8. **Contours** (§10).
Each step ends with `npm run typecheck`, its checks, and a look at אמרה on develop (its twelve curtains and the קוליסאום pool are the regression set).

## 15. DECIDEs — the answers this document assumes

1. Curves are the wall's BOW (one depth per side), plus a radius per corner and "החלקה"; no free bezier handles yet.
2. A curtain on a rod is ONE placement; the rod is billed from a `curtain-rods` row like a stage's skirt, `partial` when the studio has none.
3. **ר** means a cantilevered rod: one post, the arm out to 3 m. (If Ravid meant an L in plan, that is a two-point bend — the polyline has it either way.)
4. A sail is priced per m² of its polygon.
5. The curtain style changes the drawing and the 3D only; the quote bills the length as today (fullness later).
6. A "custom" carpet is a new unpriced `rugs` row made on the spot; its line is `partial` until priced.
7. A cover's inset defaults to 0.
8. The rim is one field on `pool` AND `surface`.
9. The contour is on the row, overridable per placement (`null` = none on this plan).
10. A pergola's "closed sides" are lattice panels.
11. `pergolas` sits in the חופות group; `led-strips`/`led-screens`/`curtain-rods` in מוצרים נלווים; `sails`/`ceiling-drapes` in עיצובי תקרה.
12. The carpet verb is the right-click menu over a surface or a stage, and the stage bar — venue surfaces stay unclickable in the sketch.
13. An LED strip lights the 3D room as emissive geometry in the existing emitter pool; the light count is fixed.
14. Tie-backs, a door's height, a wall height on the plan or on paper, and textures are out of this round.
