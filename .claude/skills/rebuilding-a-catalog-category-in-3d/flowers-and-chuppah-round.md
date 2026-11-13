# The flowers and chuppah round (2026-11-09): the record

The second use of SKILL.md. The user asked: "do to all products what we did to the chandeliers.
The most important are סידורי פרחים and חופה. Search the web for unique, high-level designs of
those and try to create them in my catalog."

## References (web, no photos copied)

**Flower arrangements:**

- a pomander ball on a tall gold stand (insideweddings 77458);
- orchids cascading from a tall crystal vase (insideweddings 67376);
- Jeff Leatham's monochrome mass of one flower (harpersbazaararabia);
- a blossom tree centrepiece (insideweddings 593);
- flower towers (thewed);
- a low sculptural runner, the most-saved pattern of 2026 (paperlust);
- a rose topiary cone (shopwildthings).

**Chuppahs:**

- a floral cloud on clear acrylic posts (insideweddings 76134, theknot);
- a suspended chuppah with no posts (insideweddings 66384);
- a draped chuppah (insideweddings 44385);
- a wooden geometric hexagon (insideweddings 52116);
- a gilded dome or birdcage (hunker, insideweddings 73670);
- driftwood or birch branches (smashingtheglass Corsica, insideweddings 48702).

## What was broken, and why

Each item was seen in the app headlessly before reading the code.

| # | Seen | Root cause | Fix |
|---|---|---|---|
| 1 | A flower arrangement with a גוף became an opaque green urn, with heads peeking out of its mouth | `flowers` and `centerpiece` were in the "combine" bucket, so the base's `revolve` was built as a lathe | Added to `PROFILE_IS_PICTURE`. `FlowerDrawSpec.profile` became the envelope `flowerBuild` reads (`profileTop` for the top, the mass, rings, stems). |
| 2 | A round chuppah with a גוף became a 3 m cream tower under the canopy | Same bucket bug | Added `chuppah` to the set, and a meaning: the profile is the round roof's section above the eave (`eaveOf`) |
| 3 | Every chuppah's poles were 27 cm columns in 3D | The plan's m·0.045 pole was copied into the room | Real radius by finish (`CHUPPAH_POST_R`); the plan keeps its pole |
| 4 | A round chuppah stood its posts on a square, and a hexagon could not be drawn as a chuppah | Posts were hard-coded at 45° steps; `symbolOf` only allowed circle, ellipse and rect | `chuppahLayout`: `n` posts on a ring, an outline's corners for a drawn shape. `symbolOf` lets a chuppah through on any single outline. |
| 5 | Chuppahs could not express any of the reference designs | No spec: four poles, a cloth and two posies only | `ChuppahSpec`: posts (0 = hung), finish, roof, flowers, bloom, meadow, drapes |
| 6 | The floral cloud was sparse on the plan and a dark mass from below | The plan used the 110-stem default mix; a flat cloud had flowers only on top | `cloudFlowers` is one dense spec for plan and room; `CLOUD_LENS` closes underneath, so the rings dress the underside |
| 7 | A cone of roses was sparse, with dark mass showing | The plan lays heads by projected area, which a steep side stretches | The rings start where the side turns steep (`STEEP_DEG` 50°) |
| 8 | A tree's sprigs floated halfway up its trunk | `LEAF_Z` was a fixed 0.45 of the height | In an envelope, sprigs and orchid trails leave from its widest ring |
| 9 | The 3D pane opened under the chuppah's canopy | A floor item was looked at no higher than 1 m, from its footprint's reach | Above `TALL_MM` 1.8 m, look at the middle from `max(reach·1.35, h)` |

## Decisions

- **The plan of a flower arrangement does not change with its envelope.** The plan is the top
  view. Only the room reads the profile.
- **A chuppah with no spec keeps its old plan drawing to the digit** (the `chuppah()` function).
  Only a specced one goes through `chuppahBuilt`.
- **The 3D of every chuppah changed on purpose.** Real-size posts and a frame along the top are
  bug fixes, as the chandelier's real candles were.
- **The flowers' colour on a chuppah is a spec field (`bloom`).** Chuppahs have no flower lines,
  and the row's shade stays the cloth's colour.
- **The rotunda is its own build** and takes none of the spec.
- **Web designs are references.** Each row's `spec` text names its source; no stranger's photo is
  uploaded.

## File map

| Layer | File |
|---|---|
| Shared profile readers | `lib/element/revolve.ts` (`profileAt` moved here; `profileTop` is new) |
| Flower envelope | `lib/catalog/flower-draw.ts` (`FlowerDrawSpec.profile`, `FLOWER_PROFILES`), `lib/catalog/flower-spec.ts`, `lib/scene/flowers.ts` (`P` branch, `NECK_SHARE`, `RING_MIN_SHARE`, `STEEP_DEG`, `TRUNK`) |
| Chuppah layout | `lib/catalog/chuppah.ts` (new: spec, layout, profiles, cloud), `lib/catalog/types.ts` (`ChuppahSpec`) |
| Chuppah 3D | `lib/scene/floor-kinds.ts` (`chuppahBody`, `rodPart`, `roofSheet`, `roofSection`), `lib/scene/build.ts` (`chainMm` for a hung one) |
| Plan | `components/item-symbol.tsx` (`chuppahBuilt`), `components/footprint-shape.tsx` (`sameDrawProps`) |
| Routing | `lib/scene/items.ts` (`PROFILE_IS_PICTURE`), `lib/catalog/symbols.ts` (`symbolOf`) |
| Context | `lib/scene/item-context.ts`, `lib/scene/tables.ts` |
| Camera | `lib/scene/focus.ts` (`TALL_MM`) |
| Editor | `app/(app)/catalog/appearance-modal.tsx` (`FLOWER_ENVELOPES`, `CHUPPAH_ROOF_TILES`, the chuppah block) |
| Callers | the eight `ItemSymbol` callers pass `chuppah={chuppahDrawOf(x.appearance)}` |
| Checks | `check:chuppah` (new); `item-scene.ts` also checks that an arrangement or a chuppah with a body builds no solid |

## Rows (develop, studio org …0001, UUIDv5 keys `fl-…` / `ch-…`)

- **סידורי פרחים:**
  - כדור ורדים על מרטיני זהב (ball, in the gold martini 80);
  - מפל סחלבים על קריסטל (cascade, in the diamond-cut crystal 80);
  - כיפת 150 ורדים (cushion, gold goblet bowl);
  - עץ פורח (tree, large terracotta pot);
  - מגדל פרחים (tower, a floor piece);
  - ראנר פרחים פיסולי (runner);
  - פירמידת ורדים (cone, gold goblet bowl).
- **חופות:**
  - חופת ענן פרחים (acrylic, flower roof);
  - חופה תלויה (no posts, flower roof);
  - חופת שיפון זהב (gold, sheer, corners, meadow, drapes);
  - חופת עץ משושה (hexagon, wood, open, asym, drapes);
  - חופת כיפה זהב (dome profile, gold ribs, cascade);
  - חופת ענפי ליבנה (birch, open, asym, meadow).

## Not done

- Nothing was seen on a real GPU or a phone.
- A floral cloud over a long rectangle is round pieces side by side, not one cloud of its shape.
- Birch posts have no bark marks.
- A chuppah row has no flower lines, so its flowers are not counted for procurement.
