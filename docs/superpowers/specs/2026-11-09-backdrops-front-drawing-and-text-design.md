# Backdrops, the front drawing, and text — design

Version 0.1 | 2026-11-09 | Branch `feat/2026-11-09-backdrops` (worktree `.claude/worktrees/backdrops`, off `feat/2026-11-09-studio-halls-shell` @ 1b7157d). Questions answered by Ravid the same day; every "your recommendation" is a DECIDE in §10. Not built yet.

Ravid: *"help me design and structure the elements in 3D and make the 2D better… add option to edit it as side view (not top only like it is now) like vertical, because some of the top view look nice but side ways it look bad, and then in the 3D it looks bad also. The first object that I want is קיר רקע… I wanna really be able to create crazy קיר רקע… text fonts."* Then, with two photographs of pipe-and-drape walls: *"mostly I want to have an option to arrange the flowers (maybe balloons)."*

The references: seven pictures. **2** (white pleated petal panels in a half-circle behind a round stepped stage), **5** (three wavy "mountain" layers with a script monogram "HS", flower clusters fixed on the face, a monogram on the floor), **6** and **7** (a pipe frame, a pleated curtain, swags sweeping and crossing, a corner cluster cascading off the frame, arrangements at the foot) are this round. **1, 3, 4** (fabric funnels with string fringes, fluted trumpets with wavy rims, a lit ruffled cloud) are INSTALLATIONS — a later round (answer 1a).

---

## 0. What exists — the honest inventory

- **There is no backdrop category.** The only backdrop is the stage's EDGE ITEM (`StageStair.kind: "backdrop"`, lib/design-document/stage.ts): a wall standing on a stage's side, drawn as a dark strip, built in 3D as a plain extrude of the strip at the row's height (lib/scene/stage.ts:223, `BACKDROP_HEIGHT_MM` 2.4 m). Its category `stage-backdrops` became BUILT-IN ONLY in the built-in kit (2026-11-07): one row, "קיר רקע לבמה", renamable and priceable, and the drawer offers no new row there. That is why Ravid only sees "קיר רקע לבמה" and can't make another. Git has never had a standalone backdrop category under any name.
- **Every shape is drawn from ABOVE and pushed UP.** A `ShapePart` is a plan outline (the footprint engine, lib/studio/footprint.ts) with an optional `zMm`/`heightMm` (Stage 2 of the element model) — so a shelf a metre up, a raised back-bar. The only side-drawn thing is `revolve` (גוף): a ROUND shape's side profile, as fractions, edited in a small panel (`revolve-editor.tsx`, ~256 px).
- **The side view exists only as a picture.** `app/(app)/catalog/elevation-view.tsx` draws each shape as a box from its z to its top (a revolve as its silhouette) — 256 × 120 px inside the גובה panel. Nothing can be dragged there, and it does not show what the 3D room builds (a chandelier's tiers, a chuppah's roof, an arrangement's heads), which is exactly the complaint: "the top view looks nice, but sideways it looks bad, and then in the 3D it looks bad also" — the designer cannot SEE the side until the 3D pane, and cannot shape it anywhere.
- **No text anywhere on the décor.** No font is loaded for drawing (the UI's Assistant/Urbanist/Space Grotesk come through `next/font` and are CSS only). Nothing in the repo turns text into outlines.
- **Composites already assemble rows** (`Product.composition`, the composite editor with the studio's canvas), and a CEILING piece in one has its own hang height. A floor piece has no height: everything stands on the floor or on what is under it (`floorUnder`).
- **What is reused unchanged:** the footprint engine (any outline, bows, corners, hollow bands, pins, repeats), `PlanCanvas` (pan/zoom/handles/outline editing — the camera-as-transform rules), the outline editor, `textureImage` uploads, the flower engine (`composeFlowers`, forms incl. `runner`, real head sizes, the scene's `bloomMesh`), the ceiling cloth's sagging run (`clothView`), the curtain's pleated ribbon, the `glow` material (LED: glows, never lights), the 3D pane in the editors (`scene-pane.tsx`, `itemScene`, `withResolved`).

## 1. The one idea — a second drawing plane

Today a shape is drawn on the FLOOR and pushed UP by its height. A backdrop is the opposite: its shape is in the FRONT view — the petal, the wave, the arch, the frame, the letters — and it is pushed BACK by its thickness. So "side view" is not another picture of the same thing; it is a second place to draw:

- **The חזית view** (and צד, the same seen from the side) is a real editing canvas in the shape editor: every shape can be dragged up and down and its height changed there, a round shape's גוף is dragged there at full size, and the room is drawn UNDER it from the front (§4) — so what the designer shapes is what the 3D will be.
- **A front shape** is drawn in that view — any tile from the shapes drawer, a free drawing, a wave, a petal, a swag, a garland, text — with a THICKNESS. On the plan it is a band as thick as it is (bent along an arc if it bends); in the room it is the shape it was drawn as.

Everything else is built from that: a backdrop is a row made of front shapes; the pipe-and-drape is a frame + a pleated curtain + swags; picture 5 is three wave shapes at three depths; picture 2 is petal shapes spread on an arc; a monogram is two text shapes; a balloon arch is a garland along an arch path.

## 2. The front shape — the data model

`ShapePart` gains a PLANE. No migration (it is jsonb under `products.appearance`, like `zMm`).

| Field | Meaning on a FRONT shape (`plane: "front"`) |
| --- | --- |
| `plane?: "front"` | Absent = a plan shape, exactly as today. |
| `shape`, `outline`, `edgeCurves`, `widthMm`, `depthMm`, `diameterMm`, `arc`, `hollow` | The FRONT PROFILE, built by the SAME footprint engine, in the face's own frame: x across, the profile's second axis UP. So `depthMm` is the shape's height on the face (the editor labels it גובה), a `hollow` rect is a FRAME, a `half-circle` is an arch (on a rect: two shapes, or a hand-drawn outline with a bowed top side), a hand-drawn outline with bowed sides is a petal or a mountain line. (Corner radii are still absent from catalog shapes — the venue round's `corners` is not on `ShapePart`; a rounded panel is drawn with bows until it is.) |
| `x`, `y` | Where its centre stands in PLAN (x across, y the depth it stands at — picture 5's three layers are three y's). |
| `zMm` | Its bottom above the item's floor. |
| `rotation` | Its turn in PLAN about the vertical (a petal facing the stage's centre). |
| `faceTurnDeg?` | Its turn WITHIN its own face (a petal leaning). |
| `thicknessMm?` | How far it is pushed back. Absent = `FRONT_THICK_MM` 20 (a panel). |
| `bendDeg?` | The panel bent along an arc in plan: how many degrees its width sweeps (0 = flat; 180 = a half cylinder), + = concave toward the front (embracing what stands in front, picture 2), − = convex. Its WIDTH stays its arc length. |
| `face?: FaceFinish` | What the face is made of (§3). Absent = flat in its colour. |
| `text?`, `swag?`, `garland?` | The three front-only kinds (§3.2–3.4), each a `shape` value of its own: `"text"`, `"swag"`, `"garland"`. |
| `style`, `texture`, `textureImage`, `pin`, `repeat`, `body` | As on any shape. `textureImage` on a front shape is the PRINT on its face (stretched). Pins work in x and in UP (so a frame stretched wider keeps its pipe, a swag keeps its ends at the corners). `repeat: row` lays copies across (a petal every 80 cm). |

The element model (lib/element) gains one op, `{ kind: "panel"; thicknessMm; bendDeg; faceTurnDeg }`: `elementGeometry` returns a front shape's PLAN band (its x-extent × thickness, bent and turned — what clearance, hit-testing, snapping and measurements read, unchanged in kind) and its `ResolvedPart` with the profile in the face frame. **Rows with no front shape are untouched: `check:element-parity` stays green on the whole catalog.**

Where a front shape is offered: every category whose things STAND (answer 4a) — backdrops, signs, balloons, arches, gates, chuppahs, columns, bars, lamps, trees, fountains, stage pieces, אחר. Not on flat things (rugs, dance floors, cloths, surfaces) or rail things (curtains, drapes, LED, sails). Table items keep גוף (a vase, a centrepiece).

**What it replaces (answer 4a/4b, DECIDE 6):** in ARCHES, GATES and CHUPPAHS a front drawing REPLACES the category's picture — on the plan and in the room — because their picture is already a drawn front (an arch's curve, a gate's lintel, a chuppah's frame). Everywhere else front shapes ADD to the picture, as a drawn גוף adds to a chandelier today (a front panel on a bar). Backdrops, signs and balloons have no picture of their own — the drawing IS them.

## 3. What a front shape can be

### 3.1 Faces (`FaceFinish`, answer 6 — all six)

| Finish | On the face | Plan | Room |
| --- | --- | --- | --- |
| flat (absent) | its colour / the shade | band in its colour | the profile extruded |
| `pleats` — `vertical` · `fan` (from a point, the funnel's) · `follow` (with the outline, picture 2's petals); `pitchMm` | pleat lines | band | the curtain's pleated ribbon laid on the face (vertical), a fanned relief (fan/follow) |
| `print` (`textureImage`) | the picture, stretched | band | the picture on the front face |
| `flowers` / `greenery` — a mix preset and density, coloured by the shade | heads/leaves at real size | band with heads along it | the flower engine on a vertical plane (heads facing out) |
| `lit` — strength | a soft glow | band | `glow` material, strength by mood (never a light — the LED rule) |
| `gloss` — `mirror?` | sheen | band | polished / mirror metal reflecting the environment (not the room — DECIDE 7) |

A flower or greenery FACE is a drawing of the wall's cover, priced inside the backdrop row (a rented flower wall). Real flowers ordered for an event are arrangements and garlands (§3.4), which are counted (DECIDE 8).

### 3.2 Swags (`shape: "swag"`, pictures 6 and 7)
Fabric hung between two points with a sag: `swag = { a, b (face coordinates), sagMm, widthMm, folds? }`. Drawn in חזית with two clicks and a drag for the sag; crossing swags are two swags. On the face: a curved band with fold lines gathering to its ends. In the room: the ceiling run's sagging cloth turned into the vertical plane, bulging a little forward. On the plan: inside the backdrop's band. Part of the row (styling), never counted on its own. Pinned at both ends to the frame's corners by default, so a stretched frame keeps its swags corner to corner.

### 3.3 Text (`shape: "text"`, answer 7 — all)
`text = { value, fontId, sizeMm (cap height), letterSpacing?, lineHeight?, align?, finish, depthMm? }`. The profile is the GLYPH OUTLINES of the string in that font (lib/catalog/text.ts, through `opentype.js`), so the plan, the print and the room draw the same letters; its box is the laid-out text, and resizing it scales `sizeMm`.
- **On a face or standing** (`plane: "front"`): finishes `print` (on the face — the room a decal just in front of it), `cut` (holes through the shape under it — the counters of an O fall out, as a laser cut's would; a stencil font keeps them — DECIDE 9), `raised` (letters standing proud of the face by `depthMm`, or standing on the floor alone: "LOVE", 1.2 m initials), `neon` (thin raised letters in `glow` — DECIDE 10).
- **On the floor** (a PLAN text shape): printed onto whatever is under it — a dance floor, an aisle runner, a rug (picture 5's floor monogram). A floor monogram is a `signs` row whose shape is plan text (DECIDE 12).
- **Monogram**: two text shapes overlapped by hand, plus a "מונוגרמה" preset (two initials and an "&", interlocked, one size).
- **Hebrew**: laid right to left (one direction per line, taken from its first strong letter); no niqqud in this round.

**Fonts** (answer 8a): a set shipped with the app under `public/fonts/` (TTF, SIL OFL — licences beside them), loaded on demand, and a studio's OWN fonts uploaded as files (`FileKind` `font`; .ttf/.otf/.woff — not .woff2, which opentype cannot read; the studio answers for its licence). The shipped set (DECIDE 11), Hebrew + Latin:

| Use | Hebrew | Latin |
| --- | --- | --- |
| Script / hand | Amatic SC, Karantina | Great Vibes, Pinyon Script, Allura, Parisienne |
| Serif / classic | Frank Ruhl Libre, David Libre, Bellefair | Cormorant Garamond, Playfair Display, Cinzel |
| Sans / modern | Assistant, Rubik | Montserrat |
| Display | Suez One, Secular One | — |

### 3.4 Garlands — flowers and balloons along a line (`shape: "garland"`, answer 12)
`garland = { path, curves?, widthMm, fill: "flowers" | "greenery" | "balloons", taper? }`: a line drawn on the face (an L along the frame's corner, an arch's curve, a diagonal), filled by an ENGINE along it — the flower engine's runner laid along the path with heads facing out (sizes and colours from the row's flower lines and shade, as an arrangement's), or the BALLOON engine (lib/catalog/balloons.ts): balloons of three sizes (5″ / 11″ / 18″, a preset mix) packed in a band along the path, in the row's shades cycled (up to four — as the pendants' `glassMix`). On the plan: the heads / circles along the line's projection. In the room: blooms and leaf cards, or glossy latex spheres.

A garland is a ROW of its own (DECIDE 14): a `flower-arrangements` row of the new form `garland` (its flower lines per metre), a `greenery` garland, or a `balloons` row — billed PER METRE of its path (`MeasureContext.garlandMm`) or per unit. It is drawn in its row's shape editor (a balloon arch = a garland along an arch), and HUNG ON THE BACKDROP in a composite (§5).

## 4. The editor — three views (answer 11a)

A switch in the canvas strip of the shape editor: **תוכנית · חזית · צד** (the 3D pane stays where it is).

- **חזית** is a `PlanCanvas` whose world is (x, −z): the floor is a line, up is up. Every shape is there:
  - a plan shape as its box from its z to its top — dragged up and down (`zMm`), its top edge dragged (`heightMm`);
  - a round shape with a גוף as its silhouette, with the profile's points dragged ON it at full size (the גוף improvement, answer 4a — DECIDE 5; the panel keeps the preset tiles);
  - a front shape as itself — moved, resized, turned in its face (`faceTurnDeg`), its points edited with the outline editor, its bar asking width, height, thickness, bend, finish.
  New front shapes are drawn there: the shapes drawer's tiles (a rect panel, an arch, an ellipse, a hexagon…), free drawing, and four front-only tools — גל (a wave line), עלה (a petal), גל בד (a swag), שרשרת (a garland) — and טקסט.
- **The room under the drawing** (DECIDE 4): behind the חזית / צד canvas, the item's 3D drawn by an ORTHOGRAPHIC camera at exactly the canvas's scale (the same `itemScene` the 3D pane builds), rendered at the settled view and carried by a CSS transform during a pan or zoom (the HUD's rule — no render per frame). So a chandelier's tiers, an arrangement's heads, a chuppah's roof are SEEN from the side while their גוף is shaped. Off when the machine has no WebGL; the boxes and silhouettes stand alone then.
- **צד** is the same canvas looking along x: every shape can be moved and heightened there; drawing is only in חזית (a side-drawn shape is a front shape turned 90°).
- **תוכנית** is today's canvas; a front shape shows as its band with its FACE side marked, and may be moved and turned there (where it stands).
- The selection is one across the three views (select in חזית, see it in plan); undo is the editor's one history.

## 5. Composites — arranging the flowers on the backdrop (answer 9a)

A dressed backdrop is a COMPOSITE: the backdrop row + arrangements + garlands + floor pieces, so every flower stays a real row — counted, quoted, packed, ordered.

- **Every piece of a composite may have a height** (`Placement.zMm`: its bottom above the floor, for floor and table items; ceiling items keep `hangHeightMm`), and may be **mounted on a face** (`Placement.mount: "face"`): its picture turned to face front — an arrangement's dome looks at the room, a cascade trails DOWN the face (picture 6's corner cluster), a garland lies on the face.
- **The composite editor gets the חזית view** (the same canvas over the same ortho room): pieces are dragged up the face, along it and in depth; a garland row's path is laid where it is dropped.
- **On the sketch** a pasted composite's pieces keep their `zMm` and `mount`: they stand at that height in the room, draw where they are on the plan (over the backdrop's band), and the item bar of such a piece has "גובה מהרצפה". The quote bills a garland by its length.

## 6. Categories and the stage (answers 2a, 3a)

- **A new department "תפאורה"** (`grp-scenery`, in the design pass) with three categories (DECIDE 1):
  - `backdrops` — **קירות רקע**: creatable, floor layer, per unit or per metre, front drawing is the whole drawing.
  - `signs` — **שלטים ואותיות**: standing letters, neon signs, welcome signs, floor monograms.
  - `balloons` — **בלונים**: garlands, arches, columns, clusters; shades are the palette; `defaultPriceUnit` "m".
  Arches, gates and columns stay in מוצרים נלווים. INSTALLATIONS (pictures 1, 3, 4) join this department in their own round.
- **The stage's backdrop edge item wears a backdrop row** (answer 3a, DECIDE 13): the built-in "קיר רקע לבמה" stays the plain frame and the default; an edge item of kind `backdrop` may name any `backdrops` row (`StageStair.variantId`), and that row's front drawing stands along the item's stretch, sized to it by the row's PINS (a frame stretches and keeps its pipe; petals pinned `scale` stretch, a centred monogram stays centred). The edge item still counts and quotes as the row it names.
- `stage-backdrops` stays built-in only — one row, the plain one.

## 7. On paper (answer 10a)

- **Plan**: a front shape is its band in its colour, a hairline on its FACE side; text on a face is not drawn on the plan (it is inside the band); standing letters are their band; a garland its heads along its line. The B&W booklet draws the band in MONO's item grey.
- **"חזית קיר רקע"** — a new sheet in the map set (`lib/outputs/elevation-sheet.ts`): one per backdrop placed (and per stage backdrop that wears a row), the FRONT view to scale (1:20 / 1:25 / 1:50 by `sheetScale`), overall width and height, every panel's width and height and its height from the floor, layer depths as a small plan strip under it, the text with its font named, the finishes in words, the mounted flowers numbered with callouts (like the table detail). For the crew who build it. Figures through `placeLabels`, text in printed mm (`SheetFrame`'s rule).

## 8. Checks

| Check | Holds |
| --- | --- |
| `check:front` (lib/element/front.ts) | a front shape's plan band (flat, bent ±, turned); its elevation box; bend keeps the width as arc length; face turn; pins in x and up |
| `check:element-parity` (existing) | every row WITHOUT a front shape is unchanged to the path string |
| `check:text` (lib/catalog/text.ts) | layout box, Hebrew right to left, mixed lines by first strong letter, letter spacing, cut-through holes, a fixture font's glyph outlines |
| `check:swag` | a swag's band and folds; pinned ends follow a stretched frame |
| `check:garland` / `check:balloons` | path length; heads and balloons along a path inside its band; the three balloon sizes; shades cycled |
| `check:backdrop` | a stage backdrop edge item wearing a row: sized to its stretch by pins; counted as the named row |
| `check:scene-front` | 3D: a panel bent and turned; cut text as holes; each finish's material; a mounted arrangement faces front; a composite piece at its `zMm` |
| `check:composition` (existing) | `zMm` and `mount` carried through paste and `fromSelection` |
| `check:elevation-sheet` | one sheet per backdrop; figures placed; scale chosen |
| `check:costs` (existing) | no price reaches the scene or the sheets |

## 9. Build order — each stage a Definition of Done

**S1 — The חזית and צד views (M).** The elevation canvas in the shape editor; plan shapes dragged in z and height there; the ortho room under it; a round shape's גוף dragged on it (the panel keeps the tiles); selection shared across views.
*Done when*: the bar's back-bar is raised by dragging in חזית; a chandelier's גוף is shaped on its real side view with its tiers showing under it; seen headlessly.

**S2 — Front shapes (L).** `plane: "front"`, thickness, bend, face turn; the drawing tools in חזית (tiles, free draw, גל, עלה); the plan band with its face mark; the `panel` op in lib/element and the room; arches, gates and chuppahs replaced by a front drawing.
*Done when*: picture 5's three wave layers are built by hand in the editor and look right on the plan, in חזית and in 3D; an arch row drawn from the front stands as drawn.

**S3 — Backdrops (L).** Department תפאורה, `backdrops`; the six faces; the swag; the frame preset; the stage edge item wearing a row; seed rows on develop (org …0001, no photos — the pictures are references, named in each row's `spec`): pipe-and-drape with crossed swags (7), pipe-and-drape with a sweeping swag (6), the wave layers (5), the petal half-circle (2).
*Done when*: picture 7 is a row that looks like picture 7 in the room, and a stage's back edge wears it.

**S4 — Text (L).** opentype.js; the shipped fonts + upload; text on a face, standing and on the floor; the four finishes; the monogram preset; `signs`.
*Done when*: "HS" in a script on picture 5's wall (raised), a standing "LOVE" sign, a floor monogram on a dance floor — on the plan, in חזית, in 3D.

**S5 — Flowers and balloons on the backdrop (L).** The garland shape and its flower / greenery / balloon engines; `balloons`; the `garland` arrangement form; composite pieces with `zMm` and `mount`; the composite editor's חזית view; per-metre billing.
*Done when*: picture 6 is one composite — the backdrop, the corner garland cascading off the frame, two floor arrangements, the plinth with its arrangement — placed on a sketch, seen in 3D and quoted with the garland by the metre; a balloon arch row stands on its own.

**S6 — Paper (M).** The plan symbol polish and the "חזית קיר רקע" sheet.
*Done when*: picture 6's composite prints its front sheet with every figure readable.

S1 → S2 → S3; S4 and S5 after S2 (either order); S6 last. Each stage is shown headlessly before the next.

## 10. DECIDEs (recommended answer taken unless Ravid says otherwise)

1. **The department** is "תפאורה" with קירות רקע · שלטים ואותיות · בלונים; arches, gates and columns stay where they are; installations join it later.
2. **A front profile reuses the plan engine**, its second axis read as UP — every shape, bow, corner, hollow and pin works on a face from day one.
3. **Bend is the degrees a panel's width sweeps**, + concave toward the front; the width stays the arc length.
4. **חזית shows the real room under the drawing** (orthographic, rendered at the settled view, carried by CSS while moving); boxes and silhouettes only where there is no WebGL.
5. **The גוף is shaped on the חזית view at full size**; the small panel keeps the preset tiles. (Answer 4a: "the whole thing with גוף in chandelier needs to be improved.")
6. **Arches, gates, chuppahs: a front drawing replaces the picture**; elsewhere it adds.
7. **Gloss/mirror reflects the environment, not the room** (a true mirror re-renders the room per mirror — the aisle round may revisit it).
8. **A flower/greenery FACE is drawing only**, priced inside the backdrop row; counted flowers are arrangements and garlands.
9. **Cut text loses its counters** (as a laser cut would); a stencil font keeps them.
10. **Neon is thin raised letters that glow** (glow, never a light).
11. **The shipped fonts** are the table in §3.3; a studio uploads its own .ttf/.otf/.woff; no niqqud; one direction per line.
12. **A floor monogram is a `signs` row** with plan text, drawn over what is under it and billed as a sign.
13. **A stage backdrop wears a row sized by the row's pins**; the plain built-in stays the default.
14. **Garlands are rows** (flowers, greenery, balloons), billed per metre of path, hung on a backdrop in a composite.
15. **Composite pieces carry `zMm` and `mount: "face"`**, kept on the sketch, edited as "גובה מהרצפה".
16. **Balloons**: three sizes, a preset mix, the row's shades cycled.
17. **The front sheet**: one per backdrop placed, scale by `sheetScale`, flowers numbered with callouts.
18. **Seed rows** from pictures 2, 5, 6, 7 on develop, without photos.

## 11. Not in this round
Installations — fabric funnels with fringes (1), fluted trumpets with wavy rims (3: a גוף whose plan is not a circle — a "loft"), the lit ruffled cloud (4); pleated pedestals (5's fluted columns); the mirror aisle runner; text along a curve; niqqud; a true mirror; neon as a single-stroke tube.

## 12. Risks
- **The ortho room under חזית** costs a GL context in the editor — the 3D pane already holds one; the underlay SHARES it (one viewer, two cameras), or it doubles the shader compile (the 2026-10-27 lesson). Rendered only at settle.
- **Hebrew in opentype.js**: no shaping engine; Hebrew needs none beyond order (final letters are their own code points), so a reversed run is exact; niqqud would need positioning and is out.
- **Font weight on the page**: ~16 TTF files, 50–300 KB each, fetched only when a text shape uses one.
- **A text shape's outline is many points** (a script monogram, thousands): kept as one SVG path on the plan and one extrude in the room, never walked by clearance (its box is its footprint).
