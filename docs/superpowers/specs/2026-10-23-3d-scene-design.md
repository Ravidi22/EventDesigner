# The 3D scene: the sketch as a room the client is shown round

Version 0.1 | 2026-10-23 | **Defined, not built.** Written from Ravid's answers of 2026-10-23 (quoted in §2) and a read of the code as it stands on `feat/catalog-sets-and-group-focus`. Each **DECIDE** in §11 is a product call only Ravid can make; the recommended answer is first and is what gets built unless overturned. Supersedes the wording of F-9.1–F-9.3 in docs/01 §6 and refines ADR-5 (docs/02) — the *principle* of ADR-5 stands (approximation from the catalog, not hand-modelling, with an exit door to real models); its *means* ("a box or cylinder wearing the product photo") is replaced by category models, for the reason in §3.

Ravid, 2026-10-23: *"we are now going to do one of the greatest features in the app, the 3D."*

## 0. What exists

- **The decision to do it, from July.** docs/01 §6: F-9.1 "סגירת פגישה ב-3D — הפקת סצנה ממסמך העיצוב", F-9.2 "לינק צפייה ללקוח… ללא התקנה וללא חשבון, עם תפוגה", F-9.3 "נקודות מבט שמורות". ADR-5 chose approximation over modelling. R-3 made `products.height_mm` NOT NULL for exactly this (`lib/db/schema.ts:431`). docs/02's technology table pencilled in Three.js (react-three-fiber), "to decide at the start of phase 2". This is that start.
- **One document, many renderers (ADR-4).** The 2D canvas, the printed set and the quote all read `DesignDocumentContent` and never own a truth of their own. The 3D scene is the fourth renderer, and the one most tempted to grow its own state (a camera, a mood, a viewpoint). §7 says where that state goes so the drawing stays the subject.
- **The data is already dimensional.** Every table, item and venue feature has a height (`Product.dimensions.heightMm`, `StructureFeature.heightMm`); a ceiling item has a hang height (`hangHeightOf`, lib/studio/hang.ts:179); a stage lays its decks, levels, flights, ramps, banquettes, barriers, backdrops, skirt and corner pieces in a pure module (`layStage`, `edgeItemShape`, `stageCorners`, `openEdges` — lib/design-document/stage.ts) with every height absolute above the floor; a table's chairs are placed by `seatsAround` (lib/studio/seating.ts:442) with a facing each; dressing stands at `dressingSpots(…).at` (components/footprint-shape.tsx:273); a chair block lays each chair (`chairRowsLayout`); flowers are laid head by head at real size (`composeFlowers`, lib/catalog/flower-draw.ts:559, with a hemispherical scale law that IS a height model); a bar knows its counter, shelf and bottles (`barDrawing`); textures know their real repeat (planks 180×1800, slabs 600×400, boards 140, tiles 1200 — `LaidPattern`, components/surface-fill.tsx). **Zones already carry a ceiling height** (`Zone.ceilingHeightMm`, 0 = open to the sky, a hall defaults to 4 000; edited in the zone dialog's "תקרה (מ׳)" field). Walls have no height and no thickness; doors have a width and a swing.
- **Every 2D item kind is a dimensional recipe, not a picture.** `lib/catalog/symbols.ts` + `components/item-symbol.tsx` draw a chair as seat + back (eight styles), a candlestick as arms + candles (ten styles), a chandelier as ring + arms + bulbs, a chuppah as poles + canopy (or a rotunda's columns), a sofa as back + arms + cushions, a vase as rim/opening/foot at 1 / 0.8 / 0.32, a column as plinth + fluted shaft + capital, a tree as a lobed canopy + trunk — each from width × depth × height, a count and a shade. The same recipes, given a z, are the 3D models. That is why ADR-5's box-with-a-photo is no longer the cheapest honest option: the proportions are already in the code.
- **The surfaces to plug into.** The event surface (`components/event-surface.tsx`: סטודיו | פלטים rail, `active` prop, one card) and `isEventSurface` in `components/app-shell.tsx:69`; the meeting flow (`lib/meeting/steps.ts` `MEETING_STEPS`/`DEFAULT_FLOW`, the switch in `app/meeting/meeting-screen.tsx:205-231`, `isCanvas` at `:159`); the client portal (`requireClient`, `app/client/events/[id]/page.tsx`, `fetchClientSketch`, the `clientProduct` allow-list — `check:client-product`); the hashed, expiring invite token (`lib/auth/invite-token.ts`: mint / hash / `expires_at`, compared with `gt(expiresAt, now)`); `proxy.ts:42` `PUBLIC` for a route a visitor opens without a session; `lib/files` for uploads (`FileKind` allow-list).
- **Nothing 3D is installed.** next 16.2.10, react 19.2.4. Current: `three` 0.186.1, `@react-three/fiber` 9.8.2 (peer react ≥19 <19.4 — fits), `@react-three/drei` 10.7.9. Next 16 loads a client-only library with `next/dynamic(…, { ssr: false })` from inside a client component (node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md).
- **No browser automation in this environment.** Every phase ends with Ravid opening it in a browser; the pure scene builder is what the self-checks can verify.

## 1. The one idea: a pure scene description, and one viewer that draws it everywhere

```
DesignDocumentContent + EventPlan + catalog + SceneSettings
        │  lib/scene/build.ts  (pure TS, no three, no React — `check:scene`)
        ▼
Scene = { nodes: SceneNode[], lights, sky, bounds }      ← mm, plan frame, z up
        │  components/scene/scene-viewer.tsx  (three via react-three-fiber, client-only, lazy)
        ▼
the designer's tab · the meeting stage · the client's portal page · the share link
```

`lib/scene/` turns the document into a list of **scene nodes** — a closed vocabulary of bodies (an extruded outline, a box, a lathe profile, an instanced set of one geometry at many transforms, a plane, a strip along a path, a light, an emitter) with a material reference (a colour, a known texture, an image), all in millimetres and in the plan's frame with z up. It knows every rule in §3 and nothing about WebGL. It is self-checked like every other pure module here: a fixture document (a round table with a cloth, ten chairs, an arrangement in a vase, three candlesticks, a chandelier hung over it, a stage with a flight and a banquette, a bar, a hall with a door and a 4 m ceiling, an open-sky terrace with a tree) builds to a scene whose node counts, heights and frames are asserted.

`components/scene/` is the only place three.js is imported. It takes a `Scene` and draws it: one React component per node kind, instancing where the builder said so, materials from a small table, the three moods, the camera. It renders on demand (`frameloop="demand"`): a still picture costs nothing, a fly-in costs frames only while it flies. It is imported with `next/dynamic` + `ssr: false` by the four screens, so three.js never reaches the server bundle, the studio's first paint, or a page that never opens the tab.

Why this split and not "React Three Fiber components that read the document directly": (1) the self-check — a scene built from data can be asserted in `tsx` with no GPU, which is the only verification this environment has; (2) the client's phone and the share link get the identical scene the designer saw, built from the same function with `clientProduct` rows; (3) a screenshot/video exporter later, and a real-model upgrade per catalog row (ADR-5's exit door), both plug into the node vocabulary without touching the builders.

**Frame mapping, in one function.** Plan (x, y) in mm, +y down the screen, rotation clockwise, transform order translate · rotate · mirror · scale (canvas-stage.tsx:3990) → three (x, y_up, z) = (x/1000, h/1000, y/1000), `rotation.y = −θ`, mirror = `scale.x = −1` inside the rotation group (negative scale flips winding: materials are `DoubleSide` or normals are fixed once in the node factory). `toWorld` in `lib/scene/frame.ts` is the one place that knows this; the builders stay in plan mm and the viewer converts at each node. Viewed from +y with `up = (0,0,−1)` the scene reproduces the 2D plan exactly — the first thing `check:scene` and the first browser session verify.

## 2. The product (Ravid's answers, 2026-10-23)

| Question | Answer |
| --- | --- |
| Who is it for | **The client in the meeting**, **the client at home**, **marketing and the quote**. Not the designer's own checking (so no measuring tools, no sight-line analysis — the designer uses it to *set up what the client sees*). |
| What kind | **Live 3D in the browser**, real time, no install. Not photoreal stills, not VR/AR. |
| How real | **Category models built from the catalog.** No content work per item. (Real models per row stay ADR-5's exit door, §10 phase E.) |
| Editing | **View only.** The sketch is the one editor; 3D is a renderer. |
| The venue | **Walls at the zone's ceiling height, a ceiling indoors, sky outdoors.** No per-wall survey, no photo backdrops. |
| Light | **Day / evening / night**, candles, chandeliers and lamps lit at night. A lighting-design module is a separate product, later. |
| Movement | **Saved viewpoints and a guided tour. Curated only:** the client sees the spots the designer set and the tour between them, never a free camera. The designer has a free camera to set them. |
| Where | **A third tab beside סטודיו | פלטים, and an optional stage in the meeting flow** between the design and the quote. |
| The client at home | **The client portal, plus an expiring no-login share link** to forward to family. |
| What must look right first | **The dressed tables** — cloths, chairs, centrepieces, flowers, candles, runners, vases. Then everything else. |
| Pictures (quote cover, per-section pictures, gallery screenshots, the tour as a video) | **"Let's define it after."** Kept as phase E (§10) with its own DECIDEs, nothing built for it before then except the hooks it will need. |
| *"also need to work entirely on the client side (TBD)"* | Read as: **rendering happens entirely in the browser** — no server-side render, no paid render service, nothing the app has to host (ADR-6: no worker, no second deployment). If it meant "the client-portal side is still to be defined", §6.3–6.4 are the proposal to react to. |

The rule that follows from "curated only" and "the client": the client's viewer has **no way to reach a view the designer did not set**, and **nothing a client sees carries a price, a cost, a stock count or a supplier** — the new folders join `check:costs`'s scan (§6.5).

## 3. The scene: what every thing in the document becomes

Units mm; heights are above the venue floor at z = 0; "the recipe" names the 2D rule the body lifts. Colour: the placement's variant `swatch`, else `appearance.style.fill`, else the kind's `DEFAULT_TONE` (symbols.ts:40) — exactly the canvas's `own` (canvas-stage.tsx:3924). Textures: `appearance.texture` / `textureImage` as on the plan (§3.9).

### 3.1 The envelope (the venue)

- **Floor.** Each resolved zone's boundary (`eventPlan(...).all` — every zone on the property, not only the event's, so the hall next door is still there when the camera looks through its door) is a floor polygon at z = 0 in `zone.surface ?? "plain"`, then the venue's `surface` features over it as the plan draws them (`ZoneSurface`, `SurfaceFill`), a `water` surface recessed 300 mm with a water material. Under everything, a neutral ground plane 20 m past `plan.bounds`, fading to the sky at the horizon.
- **Walls.** A `wall` kind wall is a box along its chord (a curved wall follows its bow in 250 mm chords — `flattenEdge`), **200 mm thick centred on the line** (nothing stores thickness; DECIDE 6), to the height of the **tallest roofed zone it borders**; a wall bordering no roofed zone (both faces open sky, or outside every zone) is a **garden wall 1 000 mm high**. An `edge` kind (a terrace lip, the קוליסאום rim) is a kerb 150 mm high, 100 mm thick. Which faces a wall borders comes from `detectFaces` (lib/venues/faces.ts) + `resolveZones`, already computed by `eventPlan`.
- **Doors.** An opening `widthMm` wide, 2 100 mm high, at `doorOffsets` along the wall: the wall becomes two boxes and a lintel. Phase B adds the leaf — a 40 mm panel standing open at 90° on the `swingInward` side (a double door, two leaves).
- **Ceiling.** A roofed zone (`ceilingHeightMm > 0`) gets a plane over its boundary at that height, off-white, lit from below; a chandelier hung in it gets a chain from its hang height up to the ceiling. An open-sky zone gets nothing above it, and the sky dome shows through.
- **Sky.** A dome with a gradient per mood (§4) and a sun; outdoors it is the backdrop, indoors it is seen only through doors.
- **Venue features** (`arrangedStructure(plan.structure, doc)` — this event's moves and removals applied): a `stage` through the SAME stage builder as a sketch stage (`featureStage`, lib/venues/structure.ts:630 — decks, its own flights and ramps); a `bar` as §3.5's bar; `structure` / `other` as an extruded footprint to `heightMm` in its style's fill; a `plant` as §3.6's tree/shrub by species (`PLANT_DEFAULTS` sizes); `pool` as the water recess; `stairs` / `ramp` (`lib/venues/climb.ts`) as §3.7's flights; `seating` as §3.4's chair rows. A feature's `fillsFace` surface is a floor patch like a zone surface.

### 3.2 The dressed table (first)

- **Top.** `tableFootprint(t)` extruded 30 mm thick with its top face at the row's `heightMm` (750 default); legs: a round/square table a pedestal (⌀ 0.12 w, a foot ⌀ 0.4 w), a long table four legs 60 mm square inset 80 mm — a leg rule by shape, since no row stores legs. Texture from the row (`wood` is the honest default for a bare table), colour from `productStyle`.
- **Cloth** (`coverOn(doc, t.id)`): the top disappears under the cloth — the footprint offset outward by **`CLOTH_DROP_MM` (90) at the rim, then falling to the floor** (DECIDE 2), as a lathe/extrude from the rim outline to the floor outline with a 10 mm hem and the plan's fold lines as a bump; colour = the cloth variant's swatch, a soft fabric material. A cloth that is a runner (`isRunner`) is instead a strip on the top (§3.3).
- **Chairs** (`seatsAround(tableFootprint, seats, CHAIR_OFFSET_MM, blockedSides)` in the table frame, through the table's turn and mirror; a block through `blockSeats` in the block frame — the chair ring of a block is the block's, never its members'): one instanced chair per seat, the chair = `chairOf(t)`'s row drawn in its `ChairStyle` at the row's width × depth × height (seat at 450, the back to `heightMm`, default 900; arms on `armchair`; a `stool`/round footprint a pouf), facing the table (`facingDeg`), tone = the chair row's shade. 600 chairs are one `InstancedMesh` per (style, colour) — the plan's `SeatChair` already treats them as one shape.
- **Dressing** (`dressingSpots(t, chips, block)`: `at` in the room, `rotation`, the chip's own `mirrored`/`scale`): every item stands on the table's top face (z = table height), drawn by its kind (§3.3). A block's dressing is laid by `dressBlockOf` exactly as the canvas does, so a centrepiece on the seam stands on the seam.
- **Seats, numbers, capacity:** NOT drawn. A number on a table in 3D is a crew mark, and the client view is a room, not a plan. (The designer's tab can toggle a floating number per table for setting up a "ליד שולחן 12" viewpoint — a label sprite, phase C.)

### 3.3 Table items (the design pass, by `SymbolKind`)

| kind | body | the recipe lifted |
| --- | --- | --- |
| `flowers`, `centerpiece` | `composeFlowers(flowerDrawSpecOf(product, fp, shade))` heads as instanced low-poly spheres (12 segments) of radius `r`, at `(x, y)`, z from the dome law `z = h · sqrt(1 − (d/rim)²)` scaled to the row's `heightMm` (cushion/dome/garden/cascade/bud/runner/single each by its form's `core`/`rim`), greens as flat leaf planes at their `ang`/`len`, trails drooping; a centrepiece's plate a 20 mm disc. One `InstancedMesh` per (kind, colour) across the WHOLE room — a room of forty arrangements is forty × ~60 heads, one draw call per colour. | flower-draw.ts: the layout, radii, colours and the `sc` law |
| `vase` (`vesselOf`) | a lathe: rim at 1.0, opening at 0.8, foot at 0.32 of its diameter, the row's height; the arrangement stands with its base at the vase's rim − 10 % (DECIDE 7: whether `heightMm` of an arrangement includes its vase) | vessel-mark.tsx, symbols `vase()` |
| `candlestick` | per `CandleStyle`: ring/tiered = hub cylinder + arms (thin boxes to `reach`) + candles (cylinders radius `r`, height from the row's `heightMm` share) + a flame emitter each; row = a bar + candles; cluster/floating/powder/pillars = glass cylinders by `packCircles` with the wax inside; lantern = posts + glass; fire = a trough with flame emitters | symbols.ts `candlestick()` 318–640: every radius and count |
| `lamp` | shade as a lathe from the bottom rim to the top rim at 0.64, a stem, an emitter inside | `lamp()` 647 |
| `runner` | a strip `D` wide on the top, 8 mm thick, pointed ends, trimmed to the table's long side + 2·90 (`DressingSpot.footprint`) | `runner()` 1244 |
| `chair`, `sofa`, `bench` on a table | never (not table items) | — |
| anything else on a table (`other`, `symbol === false`) | ADR-5's fallback: the footprint extruded to `heightMm` with the row's photo on its sides (a billboard when it has one, else the fill) | — |

### 3.4 Floor items

| kind | body | the recipe |
| --- | --- | --- |
| `chair` (free, and `rows` blocks) | as §3.2, one instance per `chairRowsLayout` chair facing +y of the block; a lone chair facing its own −y | chair-rows.ts, `chair()` |
| `sofa` | back (`min(h·0.28, 260)`) to `heightMm`, arms to 0.65 h, cushions at 450 | `sofa()` 875 |
| `bench` (`standaloneBench`) | the strip to `BenchLayout.heightMm` (750) with a chairs side's chairs at `BenchLayout.chairs`, a sofa side's cushions at 460 with a backrest line | bench.ts |
| `column` | plinth 0.12 h, fluted shaft (16 flutes as a bump), capital | `column()` 948 |
| `fountain` | basin 350 high with a water disc at 300, bowl on a stem at 0.42 R, a spout emitter | `fountain()` 966 |
| `arch` | two feet to 0.9 h, the span bar across at the top (`D·0.38`), the garland as runner-form flowers along it | `arch()` 996 |
| `chuppah` canopy | four poles (`m·0.045`) to `heightMm`, a fabric canopy plane sagging 60 mm between them, dome posies on the front poles at 2/3 height; `rotunda`: eight columns on the ring, a torus entablature at the top, drapes between the back columns as pleated planes | `chuppah()` 1011, 1065 |
| `tree` | `TREE_CLUMPS` lobes as spheres stacked from 0.45 h to h, trunk `min(rx,ry)·0.07` | `tree()` 689 |
| `bar` | the band's inside edges extruded to `heightMm` (1100) in the row's texture; the `front` strips raised +40 as a counter top 50 mm proud; the `shelf` strips at 0.85 h with instanced bottles every 260; parts as back bars with their bottle rows | bar-draw.ts |
| `rugs` | a 12 mm slab in the swatch, the border/fringe pattern as a texture | `RugPattern` |
| `stage-stairs`, `stage-ramps` placed alone | §3.7 with `climbRise` | climb-item.ts |
| `curtains` (`span`) | `resolveSpan` → the wall stretch; a pleated plane (sine, amplitude `0.28·depth`, a pleat every 150) from the ceiling (or `heightMm` above the floor when the zone is open sky) to the floor, 220 mm band | `DrapePleats`, canvas-stage.tsx:2775 |
| `other`, `symbol === false`, an unknown category | ADR-5 fallback (footprint × `heightMm`, photo on the sides) | — |
| `composites` | never placed (pasted as parts) | — |

### 3.5 Ceiling items

`hangHeightOf(p, product)` is the item's underside; absent = the zone's ceiling − 1 200 (a chandelier) or − 600 (anything else), never the floor. Position = `hangCentreOf` when `over` a table (the table's middle), else `hangPointOf`. A **chandelier** = ring torus at R·0.74, arms, bulbs (emitters) to `symbolCount`, a hub, a chain to the ceiling plane when there is one; a hung **arrangement** = §3.3's heads with the form inverted (cascade down). The height wave of a row of pendants is already in each placement's `hangHeightMm`.

### 3.6 The stage (both a sketch's `Placement.stage` and a venue's `featureStage`)

`layStage(stage, deckOf)` in the stage frame, `toRoom` out: each `StageDeck` a box of width × depth × (its `heightMm` top, legs 40 mm inset shown as a dark underside), a `round` deck a cylinder, a piece with an `outline` extruded; `missing` pieces a warn-dashed outline on the floor (the designer's tab only — the client never sees "חסר"). Levels partition the floor at their own height. Edge items by `edgeItemShape`: **stairs** = one box per tread from `treads` with `riserMm` risers; **ramp** = a wedge from the floor to the deck over `depthMm`; **bench** = §3.4's banquette at `heightMm` above its deck, its back chairs standing ON the deck, a front sofa side's seat 460 above the floor; **barrier** = 60 thick to the `barrierVariant` row's height (1 000 default); **backdrop** = 120 thick to the `backdropVariant` row's height (2 400 default). `stageCorners` boxes at their kind's height. **Skirt**: a strip along `openEdges` dropping `dropMm`, pleated, in the skirt row's swatch. A `surfaceVariant` row textures the deck tops. Railings (`railingRuns`) as posts + a rail when the studio setting is on.

### 3.7 Flights and ramps

`climbDrawing(host)` tread lines → one box per tread rising `riserHeightMm` from the foot toward the head (−y, or +y when `reversed`); a ramp a wedge to `heightMm` over its run. A stage's own flights come through §3.6 with the same bodies.

### 3.8 What stands on what (elevation — nothing stores it)

`lib/scene/elevation.ts`: a table, a free item or a chair ring whose footprint centre lies inside a stage's outline-in-room stands on that stage's deck top (a level's top when inside the level's outline); inside a rug, +12; perched on a banquette (`perch`) at `benchInRoom(...).along`, on the bench top; on a table, on its top. `order` (the floor stack) is paint order only and is ignored. A venue `stage` feature counts as a stage. `check:scene` has a table on a stage at 600 and a candlestick on it at 600 + 750.

### 3.9 Materials

One table, `lib/scene/materials.ts`: a `MaterialRef` is `{ colour, texture?: Texture, image?: TextureImage, kind: "matte" | "fabric" | "gloss" | "glass" | "metal" | "water" | "foliage" | "emissive" }`. Known textures are drawn as **procedural canvas textures** at their `LaidPattern` real sizes (planks 180×1800, slabs 600×400, boards 140 + 10, tiles 1200, grass stripes, water crests) tinted by `SURFACE_BASE` or the swatch — the same look as the plan's fills, no image assets to ship; a `textureImage` is loaded through `/api/files/<key>` (same-origin, as the quote's photos) and repeated at `tileMm` or stretched. Phase E may swap canvas textures for real PBR maps where it shows.

### 3.10 Deliberately not drawn

Table numbers, capacity, kit letters, measurements, guides, clearance, the `×N` badge (a `quantity > 1` item is drawn ONCE, as on the plan — DECIDE 8), prices and names (no labels at all in the client's view; the designer's tab may show a hover name).

## 4. Light and mood

`SceneSettings.mood: "day" | "evening" | "night"` (default "evening", DECIDE 5), switchable by the client.

- **day:** a warm sun (directional, one shadow map at 2048 over `plan.bounds`), a blue-white sky dome, ambient from the sky. Emitters off.
- **evening:** golden-hour sun low on the horizon, orange-to-violet dome, longer shadows; emitters on at half.
- **night:** no sun, a deep-blue dome with a faint horizon, low ambient; **every emitter glows** — candle flames (a sprite + a small warm point light on the nearest 12 to the camera, the rest emissive only), chandelier bulbs and lamp shades (emissive + one point light per chandelier up to 16, then emissive only), a fountain's water lit. Bloom (drei's `EffectComposer` is heavy — a cheap additive sprite halo per emitter instead; a real bloom only on the designer's laptop, DECIDE 9).

Shadows are on for the designer and the meeting, off on a phone (§8).

## 5. Navigation: curated

### 5.1 Viewpoints

```ts
interface Viewpoint { id: string; name: string; eye: Vec3; look: Vec3; fovDeg?: number }   // mm, z up
interface TourStop  { viewpointId: string; dwellMs: number; travelMs: number }
interface Tour      { stops: TourStop[]; loop: boolean }
interface SceneSettings { mood: Mood; viewpoints: Viewpoint[]; tour: Tour | null }
```

- **Defaults** (`defaultViewpoints(plan, doc)`, `lib/scene/viewpoints.ts`, `check:viewpoints`): generated whenever the designer has saved none, so a link is never empty — "מהכניסה" (1 m inside each door of the event's zones at eye height 1 600, looking at the zone's centroid), "מבט על" (elevated 35° from the front of the main zone, framing `bounds`), "מהבמה" (from the stage/chuppah looking back over the tables), "ליד שולחן 1" (seated: 1 200 high beside table 1 looking across the room). Saving any viewpoint replaces the defaults with the saved list.
- **Setting one** (the designer's tab): a free camera (orbit + pan + dolly + fly with WASD/arrows, `OrbitControls` with a floor clamp so the eye never goes under z = 0) and "שמירת נקודת מבט" takes the current camera; a saved one is a row in the side panel (rename, re-shoot from the current camera, delete, drag to reorder, a thumbnail captured off the canvas at save).
- **The client's bar**: the viewpoint names as chips in a `rounded-pill bg-inset` rail (the event rail's look), ▶ for the tour, ☀ / 🌆 / 🌙, fullscreen. Tapping a chip flies the camera there (an eased path, 1.2 s, the look point interpolated, never through a wall when a straight line would — the path lifts over the room when the two eyes are in different zones). Between flights the client may **turn their head ±35° and tilt ±20°** by dragging, and pinch to zoom the field of view a little — no walking, no orbiting (DECIDE 1). A chip is the only way to move.

### 5.2 The tour

An ordered list of viewpoints with a dwell and a travel time each (defaults 4 s / 1.5 s), looping. The tour editor is the viewpoint list with two number fields per row and a "נגינה" preview; the player is the same fly function in sequence, pausable, with the chips lighting as it goes. The tour is what phase E records to a video.

## 6. Where it lives

### 6.1 The designer's tab — `/scene`

`app/(app)/scene/page.tsx` (`requireDesigner`, `EventSurface active="scene"`, `fetchProducts`) → `scene-screen.tsx`: `useEventWorkspace()` + `eventPlan` + `primeCatalog` exactly as outputs does, the viewer in the card full-bleed, a right-docked panel (an ordinary `SidePanel`) with: נקודות מבט (list + save), סיור (the tour), תאורה (mood), שיתוף (§6.4: the links). The rail gets a third `<Tab href="/scene" icon={Box}>תלת-ממד</Tab>`; `isEventSurface` learns `/scene`; `TITLES` stays without it. The document is read live (the workspace's `document.content`), so a change made on /studio is there on the next visit — no seal, no version (a seal is minted only by an output).

### 6.2 The meeting stage — `scene`

`MeetingStepId` gains `"scene"` (label "תלת-ממד", hint "הלקוח רואה את האולם מבפנים", status `design`), placed after `design` and before `quote` in `MEETING_STEPS`, **optional and NOT in `DEFAULT_FLOW`** (a studio opts in from settings → פגישה; DECIDE 10). Two things the code does today that must change for an optional stage: `toggleStep` and `meeting-section.tsx` rank by `DEFAULT_FLOW.indexOf` (a stage missing from it ranks −1, before details) → rank by `MEETING_STEPS` order instead; and `events.step` is a positional index into the studio's flow — inserting a stage into a flow mid-event shifts it, which `toggleStep` already allows today, so no new hazard, but `check:meeting` gets the case. The screen is `<CanvasCard><SceneScreen frame="meeting" /></CanvasCard>` with the panel collapsed to the client's bar + a "נקודות מבט" puck, `isCanvas` includes it, and `guarded()` has nothing to guard (nothing is edited).

### 6.3 The client portal — `/client/events/[id]/scene`

A page beside the sketch page (same header, `requireClient`), `fetchClientScene(eventId)` in `lib/client-portal/actions.ts` — `sharedEvent` + `designerDocument` + `eventGeometry` + `clientCatalog` + the event's `SceneSettings`, the products through `clientProduct` — and the viewer with the client's bar. A button "לראות בתלת-ממד" on the event page and the card at `/client`.

### 6.4 The share link — `/v/<token>`

F-9.2. A `scene_links` row (§7) minted from the designer's panel (and later from the event drawer's `ClientAccessCard`): the token shown once, copy or WhatsApp, expiring (30 days, DECIDE 4), revocable, with an opened count. `app/v/[token]/page.tsx` is **public** (`proxy.ts` `PUBLIC` += `/v`): no session, no shell — the wordmark, the client's name and date, the viewer full-bleed with the client's bar, a footer "העיצוב של <studio>" with the studio's phone. `fetchSceneByToken(token)` (`lib/scene/share-actions.ts`) compares the hash, checks `expires_at` and `revoked_at`, counts the open, and returns the same `ClientScene` shape as §6.3 — the live document (DECIDE 3). It is the ONLY read in the app keyed by a token rather than a session, and it reads `clientProduct` rows and nothing else; `check:scene-share` scans `lib/scene/` and `app/v/` for imports of events' prices, quotes, suppliers, expenses, users.

### 6.5 Privacy

`check:costs` adds `app/v`, `app/(app)/scene` and `lib/scene` to its scan (as it did for `lib/proposals`). The scene builder never receives a price field: it takes `Product` rows through `clientProduct` on every client surface, and `check:scene` asserts the fixture scene contains no string from a `unitPrice`/`costPrice`/`supplierId`.

## 7. Data (one migration, 0022)

```
event_scenes   event_id uuid PK → events (cascade), organization_id uuid → organizations,
               settings jsonb not null  -- SceneSettings {mood, viewpoints, tour}
               updated_at
scene_links    id uuid PK, organization_id, event_id → events (cascade),
               token_hash text unique, expires_at timestamptz not null, revoked_at timestamptz,
               created_by uuid → users (set null), opened_count int default 0, last_opened_at,
               created_at
```

`lib/scene/actions.ts` (`"use server"`): `fetchSceneSettings(eventId)`, `saveSceneSettings(eventId, settings)` (`currentOrg` + `assertEventOwned`, validated, debounced from the panel), `fetchSceneLinks`, `mintSceneLink(eventId, days)`, `revokeSceneLink(id)`. Nothing here writes `design_documents`; the scene is a renderer. A camera's position is not an autosave: the panel saves when the designer presses save, not on every orbit frame.

No change to `products` in this phase. A per-wall height, a wall thickness, a window — none of them are added; the envelope is read from what /halls already stores (DECIDE 6 lists the one default that may want a venue-level knob).

## 8. Performance — the budget, and how it is met

Targets: the designer's laptop 60 fps during a fly-in and a sub-2 s first frame; the meeting tablet 30 fps; a mid-range phone on the share link 30 fps and a first frame under 4 s on אמרה (500 venue features, 125 plants, ~60 tables). Nothing is promised until measured in a browser; these are the numbers the first browser session reads off `renderer.info`.

- **On demand.** `frameloop="demand"`; a frame only when the camera moves, a mood changes or the document changes. A still viewpoint costs zero.
- **Instancing by the builder.** The builder emits `instanced` nodes: chairs per (style, colour), flower heads per (kind, colour), bottles, balusters, treads. 600 chairs + 3 000 heads are ~20 draw calls.
- **Merged statics.** Walls, floors, ceilings, decks merge into one geometry per material (`BufferGeometryUtils.mergeGeometries`) at build.
- **Level of detail by distance** on flowers (fills drop past 8 m, heads become 6-segment past 15 m) and on chairs (a box past 25 m) — the 2D `data-lod` idea, in the viewer.
- **Pixel ratio capped at 1.5**, shadows off and emitters sprite-only on a phone (`navigator.hardwareConcurrency < 6 || touch` heuristic, overridable from the designer's panel), fog to hide the far venue.
- **Build once per document.** `buildScene` is memoised on the document object + settings; it runs in a few ms for the fixture, and the first real measurement of אמרה decides whether it moves to a worker (it must stay pure either way).
- **Bundle.** three + fiber + drei ≈ 700 kB gzipped: loaded only when a scene route or the meeting's scene stage mounts (`next/dynamic`, `ssr: false`), never on /studio.

## 9. Files

```
lib/scene/
  types.ts        SceneNode, MaterialRef, Scene, SceneSettings, Viewpoint, Tour, Mood
  frame.ts        toWorld (the one mapping), plan→three helpers              check:scene-frame
  build.ts        buildScene(doc, plan, products, settings, opts) → Scene      check:scene
  envelope.ts     floors, walls, doors, ceilings, sky, venue features
  tables.ts       top, legs, cloth, chairs, dressing
  items.ts        every SymbolKind → nodes (one function per kind)
  flowers.ts      composeFlowers → instanced heads with z
  stage.ts        layStage/edge items/corners/skirt → nodes (sketch and venue stages)
  elevation.ts    what stands on what                                         (in check:scene)
  materials.ts    MaterialRef table, SURFACE_BASE tints, LaidPattern sizes
  viewpoints.ts   defaultViewpoints, fly path, tour timing                    check:viewpoints
  actions.ts      "use server": settings + links (studio side)
  share-actions.ts "use server": fetchSceneByToken (public read)
  client.ts       ClientScene shape shared by the portal page and /v
components/scene/
  scene-viewer.tsx    the lazy Canvas; props: scene, settings, mode "author" | "curated"
  scene-nodes.tsx     node kind → mesh/instanced mesh; mm→m at the node
  scene-materials.ts  MaterialRef → three material, procedural canvas textures (cached)
  scene-lights.tsx    the three moods, emitters, shadow setup
  scene-camera.tsx    author controls, curated head-turn, flyTo, tour player
  scene-bar.tsx       the client's bar (chips, ▶, mood, fullscreen)
app/(app)/scene/page.tsx, scene-screen.tsx, viewpoints-panel.tsx, share-panel.tsx
app/client/events/[id]/scene/page.tsx
app/v/[token]/page.tsx, shared-scene.tsx
lib/meeting/steps.ts, app/meeting/meeting-screen.tsx, app/(app)/settings/meeting-section.tsx
components/event-surface.tsx, components/app-shell.tsx, proxy.ts
lib/db/schema.ts + drizzle/0022_scene.sql
scripts/check-costs (+ the new folders), package.json (three, @react-three/fiber, @react-three/drei; check:scene, check:scene-frame, check:viewpoints, check:scene-share)
```

## 10. Phases — the plan

Each phase ends with `npm run typecheck`, its checks, and a browser session by Ravid (there is no browser here). Nothing in a later phase is started before the previous one has been SEEN. The size words are relative to the client side (built 2026-10-17 in one long session): phase A is about that; B is bigger; C, D are smaller; E is open.

**Phase A — the room and the dressed tables (the thing that must look right).**
1. Install three / fiber / drei; `lib/scene/types.ts`, `frame.ts`, `materials.ts`, `build.ts` with the envelope (§3.1 without door leaves and plants) and the dressed table (§3.2 + §3.3 complete: cloths, chairs in their styles, flowers with z, vases, candlesticks in all ten styles, lamps, runners, the fallback box). `check:scene` + `check:scene-frame`.
2. `components/scene/` viewer with the author camera, the day mood, instancing, canvas textures; the `/scene` tab and the rail entry, reading the live document.
3. Browser session: the plan reproduced from above; then from a chair. **Done when** Ravid says a dressed round table of ליאב וסימבר's catalog reads as that table.

**Phase B — the rest of the room.** Stages with every edge item, levels, skirt and corners (sketch and venue); flights and ramps; bars; chuppahs (both styles); chandeliers and hung arrangements with chains; curtains; rugs; sofas, benches, columns, fountains, arches, trees and the venue's plants, pools, surfaces, door leaves, chair rows; elevation (§3.8); evening and night with emitters. Each kind is its own small function in `items.ts` with its own fixture line in `check:scene`. **Done when** אמרה's two reference plans (A 616, B 840) build and render.

**Phase C — curated navigation + the meeting.** Viewpoints (defaults, save/rename/reorder/thumbnail), the fly, the head-turn, the tour editor and player, the client's bar; the `scene` meeting stage (and the ranking fix in `toggleStep`); migration 0022's `event_scenes`. `check:viewpoints`. **Done when** a meeting can end on the tour.

**Phase D — the client.** `/client/events/[id]/scene`, `scene_links` + mint/revoke + `/v/<token>` public page, `check:costs` + `check:scene-share` extended, the phone budget (§8: DPR cap, LOD, shadows off), pinch for the field of view. `db:verify:scene` walks mint → open → count → expire → revoke against the real DB like `db:verify:client`. **Done when** a WhatsApp link opens on a phone and plays the tour.

**Phase E — to define with Ravid (not started by me):** pictures on the quote cover / per section, screenshots into the gallery (`gallery_images` rows or an event-scoped table — the surfaces agent's four options), the tour as a video (`canvas.captureStream()` + `MediaRecorder`, WebM in the browser; MP4 needs a transcoder and is a real question), real GLB models per catalog row (`Product.model3d`, a new `FileKind "model"` — ADR-5's exit door), real PBR textures, a lighting-design module, bloom.

## 11. DECIDE — the calls only Ravid makes (recommended answer first)

1. **Head-turn at a viewpoint.** *Recommended:* yes, ±35° yaw / ±20° pitch and a little zoom by drag/pinch, no movement — still curated, and a view that cannot even be nudged feels like a slideshow. Alternative: completely still.
2. **How far the cloth falls.** *Recommended:* to the floor (a banquet cloth), always. Alternative: read the drop from the cloth row's own size against the table's, falling to the floor only when it reaches.
3. **What the share link shows.** *Recommended:* the live document, like the portal (the designer edits, the link follows; a link sent before a change shows the change — the honest behaviour, and no second copy of a drawing to keep). Alternative: a snapshot sealed per link (a version row per link; a client could then be shown a room that no longer matches the quote).
4. **Link lifetime.** *Recommended:* 30 days, revocable, one link live per event at a time (minting a new one revokes the old). Alternative: until the event date.
5. **Default mood.** *Recommended:* evening everywhere (the most flattering, and the hour most events happen). Alternative: day for outdoor venues.
6. **Walls with no roofed zone on either side.** *Recommended:* a 1 000 mm garden wall and 200 mm thickness, no new field; a venue that needs otherwise gets a per-venue number later. Alternative: add `VenuePlan.wallHeightMm` now (jsonb, no migration).
7. **Does an arrangement's height include its vase?** *Recommended:* no — the arrangement is its own height and stands on the vase's rim; a tall vase makes a tall piece, as on a real table. Alternative: the height is the whole piece and the flowers shrink to fit above the vase.
8. **`quantity > 1`.** *Recommended:* drawn once with no badge (the plan draws one glyph too; the quote counts). Alternative: fan N copies out around the point (invents places nobody chose).
9. **Bloom.** *Recommended:* sprite halos only, everywhere — one look on every device. Alternative: a real post-process bloom on the designer's laptop and not on phones (two looks).
10. **The meeting stage.** *Recommended:* optional, off by default (`DEFAULT_FLOW` unchanged), between design and quote. Alternative: on by default for every studio.
11. **Route and label.** *Recommended:* `/scene`, tab "תלת-ממד", meeting step `scene`. Alternative: `/3d` (a route that starts with a digit reads badly in `isEventSurface` and in prose).

## 12. Risks

- **Fidelity expectations.** "Category models" are honest proportions, not a render studio: a chair is a chair of its style, not that chair. The first browser session on phase A is where Ravid calibrates what "looks right" means for the tables; it is deliberately the first thing shown.
- **Phones.** אמרה's 125 plants and 500 features are the stress case; the budget in §8 is a plan, not a measurement. If a phone cannot hold 30 fps the fallback is a lower LOD tier, never a server render.
- **No browser here.** The pure builder is checked; the viewer is not until Ravid opens it. The frame mapping (§1) is the one thing most likely to be wrong on first sight (a mirrored room, a turned chair) and it lives in one function.
- **Bundle and first paint.** three must never be imported outside `components/scene/` — a stray import in a shared module puts 700 kB into every page. A `check:scene-share`-style scan for `from "three"` outside that folder is cheap and goes in with phase A.
- **Negative scale.** Mirrored placements flip winding; a DoubleSide material or a normal fix per node, tested with a mirrored ח bar in the fixture.
- **Two sources for one height.** A banquette's chairs stand on the deck for an outer edge item and on the floor for a standalone one (bench.ts); the elevation module must read `benchInRoom`, not guess. The fixture has both.
- **The optional meeting stage** touches `events.step` semantics; `check:meeting` grows the case before the stage is added.

## Sequence

A1 types/frame/materials/build + checks → A2 viewer + tab → **browser** → B kinds one by one → **browser on אמרה** → C viewpoints/tour/meeting → **browser** → D portal/link/phone → **phone** → E defined with Ravid.
