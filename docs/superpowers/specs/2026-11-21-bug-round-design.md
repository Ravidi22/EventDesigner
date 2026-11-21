# Bug round 2026-11-21 — design

Status: v0.1, written from Ravid's answers of 2026-11-21. The findings it answers are [docs/qa/2026-11-21-bug-round.md](../../qa/2026-11-21-bug-round.md); IDs (CR, EI, CN, MT, PT, VS) point there.

Where Ravid said "IDK", the call is mine and is marked **DECIDE n**. Correct any of them by number.

## 0. Why

Ravid wants the studio to draw real event set-ups without fighting the tool:
- a banquette with its sofa where the guests are;
- ר-shaped banquettes;
- a curtain on a rod he drew;
- stairs and banquettes that behave like one side;
- candlesticks, a fire trough and vases that look like his photographs;
- every product in its real material;
- two new table products: a קאנט and a table garden.

The **dangerous bugs go first**: things that destroy a stage, or a colour that looks unsaved.

**Production:** `master` was fast-forwarded to this branch and pushed on 2026-11-21 (1621484). No migration was pending; production is at 0028. From now on every round ends with a push to `master` (Ravid: "yes push to master").

---

## 1. Round A — the bugs that need no design

Each is a fix to the finding with the same ID.

| ID | Fix |
|---|---|
| EI-3 | Ctrl+C / Ctrl+X with a stair or banquette picked act on THAT item: copy it, or copy and remove it. They never touch the stage. Paste is §2.4. |
| EI-4 | Right-click on a picked edge item opens the ITEM's menu: העתקה · שכפול · מחיקה. Never the stage's. |
| EI-5 | The edge item's quick bar gets the copy button (duplicate, §2.4) and a "…". |
| EI-7 | Every stage resize path (handles, typed מידות, round scale) ends in `tidyEdgeItems`. Items never stand through each other. |
| EI-8 | The rotate knob and the middle grip of a selected stage never sit on an edge item. They move outward past whatever stands on that side. |
| EI-9 | The banquette depth grip writes `bench.depthMm`, never the legacy field. |
| EI-10 | A split banquette gives its sofa and typed counts to the piece the sofa stands on. The other piece gets the automatic counts and no sofa. |
| EI-11 | Anything that cuts or drops a banquette removes the dressing perched on the part that went. |
| EI-12 | Removing an item, or changing its kind, is ONE undo entry. |
| EI-14 | The joined-run skip is keyed by (stage id, item id), not by item id alone. |
| VS-1 | The shade's colour shows everywhere — see §5.1. |
| VS-3 | `VesselMark` passes the vase's `drawStyle`. |
| VS-6 | Profile handles never sit on the box's corner grips. A point at a corner is drawn beside it. |
| VS-7 | ✕ and ביטול ask before discarding unsaved edits. |
| VS-8 | One colour-picker drag is one undo step (`amend` while the input is live). |
| CN-1 | A hurricane glass is OPEN at the top. The flame stands in it, not on a lid. |
| CR-2 | While a curtain is DRAGGED over the plan, the rod it would take is lit, as the armed click already does. |
| CR-4 | A rod's body drag keeps `placement.position` in step with its points. |

---

## 2. Round B — stairs and banquettes on a stage

### 2.1 The sofa is its own thing on its banquette (Q2: "per banquette, but separate")

**Reading of the answer:** one sofa per banquette side, standing on the banquette but positioned on its own. Ravid, correct this if "separate" meant something else.

**Data:** `BenchSide.offsetMm?: number` is the sofa run's centre, measured from the banquette's middle along its length. Absent means centred, which is today's drawing to the digit. The run (`widthMm`) is unchanged.

**Default (Ravid: "in front of a table"):**
- When a side becomes a sofa, or a banquette with a sofa is placed, `offsetMm` is set to the nearest table on the sofa's side within 2.5 m. Its centre is projected onto the banquette's axis.
- The run is clamped so the sofa stays on the banquette.
- It is stored, not derived: moving the table later does not move the sofa.
- "מול השולחן" in the sofa's group re-centres it on the table in front now.

**Drag:** with the banquette picked, a press on the SOFA drags the sofa along the banquette, clamped to it. A press anywhere else on the banquette slides the banquette, as today. The same applies to a standalone banquette.

**Split:** see EI-10. The sofa stays with the piece it stands on.

**Counted:** the sofa's seats as today (`benchSeats`).

### 2.2 ר-shaped banquettes join like stairs (DECIDE 1)

Banquettes stay straight pieces. Where two meet, the joint is DERIVED, exactly as stairs meet today (`edgeJoints`, `stageCorners`). Nothing new is stored.

**On one stage:**
- **Inside corner:** banquettes are mitred like stairs. Today they stand through each other (EI-2).
- **Outside corner:** unchanged. A corner piece of d1 × d2.

**Two stages flush at a corner:** a banquette on each, meeting at 90°, gets the same corner piece across the seam. Today `joinEdgeRuns` joins only collinear runs.

**A free banquette (on the floor):**
- **Snapping:** its END snaps to the end of another free banquette, or of a stage's banquette. Collinear means a continuation; at 90° it means a ר. Alt frees it.
- **Joined on the plan:** no end line at the joint, and the corner square filled.
- **Heights:** a stage banquette sits at deck + 75 and a floor one at 75. They meet with a step, and the 3D shows the step with an end panel.

**Quoted:** each piece as itself, per metre, as today.

**Why not a banquette drawn as one path:** a path would be a new kind of banquette, with seats, sofas, the quote and the 3D all re-done for bends. Joining keeps the one straight banquette that every reader already knows. The path can come later if the joints are not enough.

### 2.3 Items that touch stay touching (DECIDE 2)

A stage side is covered by items that meet end to end. An edit keeps them meeting:

| Edit | Rule |
|---|---|
| **Width grows** (typed or end grip) | A neighbour flush against the moving end is cut back. Same as today. |
| **Width shrinks** | A neighbour that was flush against the moving end grows to stay flush, up to the side's end or the next item. **New.** |
| **Slide** (body drag) of an item flush on both sides | The joints move with it: one neighbour grows, the other shrinks, and the side stays covered. **New.** |
| **Slide** of an item with a gap | Moves until it meets an item and stops there. Same as today. |
| **Alt** | Acts on the one item alone. Neighbours are still cut where it overlaps them; they never grow. |

**"Flush"** means within 1 cm when the press began, judged against the items as they stood then (the grip's `from`).

### 2.4 Copy, cut, paste and duplicate one item (Q6)

- **Ctrl+C:** copies the picked item as an EDGE CLIP: kind, width, bench spec, risers, inner. The hint says "הועתק: בנקט 2.40 מ׳".
- **Ctrl+X:** the same clip, and the item alone is removed.
- **Ctrl+V with an edge clip:**
  - The paste is ARMED: every stage's open sides are lit (`EdgePickLines`). A click places the item there, through `itemAt` + `shareSide` like the side's own "add".
  - The item keeps its width when the stretch allows; otherwise it takes the stretch.
  - Esc cancels.
  - A plan clip (tables, items) pastes as today.
- **Ctrl+D / the quick bar's copy button:** a copy flush beside it on the same side, toward the larger free stretch. With no room on that side it goes to the next free stretch, else it is refused with a hint.
- **The item's "…":** העתקה · גזירה · שכפול · היפוך הצדדים (a banquette's back and front) · מחיקה.

---

## 3. Round C — the curtain rod (Q4)

- **Clicking the rod row** arms a DRAW tool (`RodDrawPane`, as the swag tool uses it):
  - click a point per post, or press-drag one straight line;
  - Enter or double-click ends;
  - typed cm and 45° steps as today;
  - Esc cancels;
  - one rod per arming, and Shift keeps the tool for the next.
  The result is a bare rod along what was drawn: straight, ר or more.
- **Dragging the rod row** from the rail still lays a FIXED rod of the row's length. A rod's body drags freely with no snap or limit (it already does), and keeps `position` in step (CR-4).
- **Hanging a curtain:**
  - **(a)** Drop or click a curtain on the rod. The rod is lit while dragging (CR-2).
  - **(b)** New: the bare rod's bar has "תליית וילון", a `PickRow` that opens a picker of the studio's curtain rows. Picking one adopts the rod with that curtain (`setPlacementVariant`).
  - **(c)** "הורדת הווילון — המוט נשאר" is unchanged.
- **CR-5:** the draw tool is one-shot, so a click on a rod can never lay a second rod on it.

---

## 4. Round D — material (Q7)

### 4.1 The list

| id | Hebrew | 3D | Plan |
|---|---|---|---|
| `metal` | מתכת | metal in the colour. A metal without a shade colour takes its finish's colour. | colour + a thin highlight |
| `glass-clear` | זכוכית שקופה | glass, clear | faint ink, see-through |
| `glass-frosted` | זכוכית חלבית | glass, frosted | pale fill |
| `glass-tinted` | זכוכית צבעונית | glass in the colour | tinted, see-through |
| `crystal` | קריסטל | `crystal` (faceted) | faint ink + facets |
| `acrylic` | אקריליק | clear plastic, less refraction than glass | see-through |
| `stone` | אבן | matte with grain | stone texture |
| `marble` | שיש | polished with veins | marble texture (exists) |
| `concrete` | בטון | matte with pores | concrete texture |
| `wood` | עץ | wood texture | wood texture (exists) |
| `ceramic` | קרמיקה / חרס | glaze, gloss | flat colour |
| `velvet` | קטיפה / בד | fabric sheen | flat colour |
| `rattan` | ראטן / קש | woven texture | weave |
| `mirror` | מראה | mirror metal | pale + highlight |

**Metal finishes** are offered beside `metal` as colour presets, not as separate materials: זהב #C9A24A, כסף #C0C4C8, שחור #2B2B2E, רוז גולד #C99A86. The colour still comes from the shade when it has one.

### 4.2 Where it is set (Q7 "ok": per product, per shade, per shape)

| Level | Field | Where it is edited |
|---|---|---|
| Product | `MapAppearance.material` | the item's "מראה" group in the shape editor; the drawer's "גוונים וצבעים" fold |
| Shade | `MapAppearance.shadeMaterials: Record<variantId, Material>` | each shade row in the drawer: a "חומר" select beside the colour |
| Shape | `ShapePart.material`, and the first shape's `MapAppearance.baseMaterial` | the shape's group in the editor |

The per-shape group is offered for PICTURE rows too, which fixes VS-4: a candlestick with a crystal stem and gold arms.

**Shade materials live in the appearance JSON, not a new column (DECIDE 3).** A column needs a migration on develop AND production before the deploy, and this needs neither.

### 4.3 How it is read

`materialOf(product, variantId, shapeIndex?)` resolves the most specific answer: shape → shade → product → **guessed** (today's eight guesses, MT §4, untouched).

So no existing row changes until a material is chosen. Every 3D builder that guesses today asks `materialOf` first. `check:material` holds the resolution order and "absent = today's guess".

---

## 5. Round E — vases, candlesticks, the fire trough (built with the project skill `rebuilding-a-catalog-category-in-3d`)

### 5.1 Vase colour (DECIDE 4)

- **With shades:** the shade's colour wins. The shape editor stops pretending otherwise. Its "מראה" colour row becomes "צבע הגוון", with a switcher for which shade is previewed, and editing it edits THAT SHADE's colour.
- **Saving:** the modal's save carries `variantPatches` back to the drawer.
- **Without shades:** the fill is the item's colour, as today.
- **Everywhere:** every view (plan, חזית, 3D, card) draws the same tone.

### 5.2 Vase styles in 3D (Q13 yes)

- Each `VaseStyle` builds its own body: cylinder, martini (גביע על רגל), כד (urn), bowl on a foot, bowl, plain vase. A גוף profile still wins when one is drawn.
- **"כד עם ידיות"** gets real handles: two loops from shoulder to neck, sized by the vase.
- **Material:** §4. Today a white vase is clear glass (MT-1); with a material it is what was chosen.

### 5.3 Candlesticks (Q9 "ok, customisable")

**Data:** `MapAppearance.candles: CandleSpec`, the ChandelierSpec pattern. Absent means the drawing to the digit; `candlePatch` stores only what differs.

| Field | Values | Default |
|---|---|---|
| `kind` | taper דק · pillar עבה · הידורית (glass cup) · LED · floating | by style, as today |
| `diameterMm`, `heightMm` | typed | taper ⌀2.2×25 · pillar ⌀7×15 · הידורית ⌀6×9 · LED ⌀7×12 · floating ⌀6×3 |
| `guard` | none · straight cylinder · tulip | none, or cylinder for the "sleeves" style |
| `guardDiameterMm`, `guardHeightMm` | typed | cylinder ⌀9×30 · tulip ⌀12×25 |
| `heights` | equal · centre highest · ends highest · stepped · each typed | equal |
| `stepHeights` | one number per arm, cm, when "each typed" | — |
| `drops` | crystal drops on chains: none · some · full | none |

- **Arms:** the count (`categoryFields.arms`) is edited IN the shape editor. The modal's save carries `categoryFields`.
- **Material:** §4 (crystal, acrylic, metal…).
- **Layout:** stays the style tiles.

**The photographs as rows:**
1. Acrylic, five rods on a round base, stepped heights, tall cylinder guards.
2. / 3. Crystal, a centre and four S-arms, cylinder guards.
4. Crystal, seven lights in tiers, tulip guards, drops.

### 5.4 The fire trough (Q8 "yes, customisable")

**Data:** `MapAppearance.fire: FireSpec`.

| Field | Values | Default |
|---|---|---|
| `stones` | inside around the burner · a frame round it on the table · both · none | inside |
| `stoneColour` | colour | white #F2F0EA |
| `stoneSizeMm` | number | 25 |
| `guard` | a glass wind screen round the burner | off |
| `bodyHeightMm` | number | 12 cm |
| body material | §4 | concrete |

- **3D:** a LOW trough (never the row's full height as a block); the burner a thin dark line, flames along it; pebbles as instanced stones.
- **Plan:** the trough's outline, pebble dots, the burner line, small flame marks.

---

## 6. Round F — pattern by hand (PT)

- The mini-map grows to 220 px, writes each table's number, and every table is a toggle.
- A click adds or removes that table on top of the chosen pattern. The label then reads "דפוס + בחירה ידנית · N שולחנות", with "איפוס" to drop the hand picks.
- Changing the pattern clears the hand picks (DECIDE 5): they were picked against the old one.

---

## 7. Round G — two new products

### 7.1 קאנט (Q10 "yes")

**Category:** `table-edges` "קאנטים", in עיצוב שולחן, design pass. A table item, worn WITH the cloth, on top of it; it never replaces it.

**Row:** `MapAppearance.kant`, plus the shade's colour:

| Field | Meaning | Default |
|---|---|---|
| `dropMm` | how far it hangs | 15 cm |
| `border` | a contour band at its bottom edge, like a rug's (`Border`, lib/catalog/border.ts) | — |

**Placement:** `Placement.edgeSides` names the table sides it runs on. Absent means all sides, as a head table's front-only kant needs. It is picked on the plan like a stage's sides: lit lines, click to toggle. On a block it runs round the block's outline.

**Drawn:**
- plan: a band in its colour along the chosen sides, over the cloth's hem;
- 3D: a vertical band of `dropMm` hanging from the top's edge (the cloth's `band` code);
- printed: like a cloth's contour.

**Quoted:** per metre of the chosen sides (the row's price unit; `MeasureContext` measures the sides).

### 7.2 גינת ירק on a table (Q11 "ok")

**Category:** a flowers row with `arrangement.bed`. It stands on the table (layer table).

**Its outline is DERIVED from the table or block it stands on**, like a runner's trim (`DressingSpot.footprint`). It is re-derived whenever the table changes.

| Table | Bed | Default |
|---|---|---|
| Long table / block | a band along the spine | width = table depth − 2 × 40 cm (place settings), min 20 cm, typed `widthMm` override; ends inset 30 cm |
| Round | a DISC inset from the rim (DECIDE 6) | ⌀ = table ⌀ − 2 × 40 cm |

- **Height:** default 25 cm, typed.
- **Fill:** the row's flower lines over a greenery base (`coverSpots`, "full"). With no lines, greens and the default mix.
- **A head table (block):** one continuous bed along the block's spine.
- **Quoted:** by the row's unit; per metre reads the bed's length.

---

## 8. Checks to add

| Check | Holds |
|---|---|
| `check:edge-copy` | the edge clip; Ctrl+D placement and refusal |
| `check:edge-touch` | the §2.3 table, case by case |
| `check:bench` (extend) | `offsetMm` absent = centred; default in front of a table; split keeps the sofa once |
| `check:stage` (extend) | banquettes mitred at an inside corner; corners across two stages; free-banquette end snap |
| `check:material` | the resolution order; absent = today's guess |
| `check:candles` | `CandleSpec` defaults; absent = the drawing to the digit |
| `check:fire` | `FireSpec` defaults |
| `check:vase-3d` | each style builds its own body; the urn has handles |
| `check:kant` | sides, measured metres, block outline |
| `check:table-bed` | the band and disc from a table, re-derived on resize; a block |
| `check:table-patterns` (extend) | hand picks over a pattern; cleared on a pattern change |

---

## 9. Build order

Each round is committed and pushed to `master` when it is done, and seen headless before it is reported.

- **A** Round A (§1) — now.
- **B** §2 stairs and banquettes.
- **C** §3 the rod.
- **D** §4 material, needed by E.
- **E** §5 vases, candlesticks, fire trough.
- **F** §6 pattern by hand.
- **G** §7 קאנט and table garden.

---

## 10. DECIDE

1. **ר banquettes** join as derived joints between straight pieces: a mitre at an inside corner, a corner piece outside, a snap at the ends for free banquettes. Not a banquette drawn as a path.
2. **Items that touch stay touching:** a shrink lets the flush neighbour grow; a slide between flush neighbours moves the joints; Alt acts alone.
3. **Per-shade materials** live in the appearance JSON (`shadeMaterials`), not in a new column. No migration.
4. **Vase colour:** with shades, the shade's colour wins, and the editor edits that shade's colour; without shades, the fill.
5. **Pattern by hand:** changing the pattern clears the hand picks.
6. **Table garden on a round table:** a disc inset 40 cm from the rim, not a ring.

## 11. The builder check (2026-11-21) — answers

A fresh reviewer read this design as a builder would. Its questions, sorted:

**Ravid's (asked):**
- **Two banquettes that touch end to end on one side: two pieces or one?** Today `tidyEdgeItems` JOINS touching items of one kind into one (the first one's settings win) on every merge or reshape. §2.1 (a sofa per banquette, "separate") and §2.4 (Ctrl+D lays a copy flush beside it) make touching pairs that a later merge or reshape would join. Round A's resize fix deliberately uses `separateEdgeItems` (no join) for that reason. Round B waits on this.

**My calls (DECIDE 7–14):**
7. **Material and multi-part pictures:** the product's material is the main body's. A recipe with distinct parts gets per-part fields in its own spec (`CandleSpec`: frame · arms · guard; chairs: frame · seat). Per-shape material is for drawn shapes. An explicit spec field (`ChuppahSpec.finish`, a pendant's glass) wins over the product's material. Every 3D recipe reads it, not only the eight that guess today.
8. **Material vs texture:** different questions. Material = what it is made of (the 3D surface kind, and the plan look when no texture is set). Texture = a pattern laid on it (the plan, and the map in 3D). Choosing a material never writes a texture.
9. **A new sofa's length:** the length of the table in front, along the banquette (its width across), else 1.80 m; it can be typed or dragged at its ends.
10. **§2.3 details:** a typed width with BOTH ends touching resizes about its middle, so both neighbours grow back (EI-6's exact case). A slide touching on ONE side drags that joint with it. Only banquettes, barriers and backdrops GROW to fill; stairs and ramps never grow by themselves (they are quoted per module), they are only cut.
11. **Candlesticks:** `heights` / `stepHeights` are the heights of the arms or rods; candles stay one size. Photo 1 is a new layout, "מוטות על בסיס" (rods on a base). The S-arm is a field `armShape` (straight · S), the crystal styles' default S.
12. **Table garden stems:** a bed's flower lines are per METRE of bed. The florist's order is lines × bed length. Centrepieces and candlesticks dropped on it stand IN it.
13. **CN-2, VS-9, VS-10** are in Round E.
14. **קאנט default:** absent means ALL sides; a head table's front-only is picked on the plan.

**Branch:** the rounds are built on `feat/2026-11-21-bug-round` (off the pushed `master`). Each round is fast-forwarded into `master` and pushed. The uncommitted `lib/catalog/standard/backfill.ts` (another session's) stays out.
