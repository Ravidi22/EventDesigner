# The chandelier round (2026-11-08): the record

This is the worked example for SKILL.md. There were two requests.

1. **Eight chandelier photographs.** The user said: "I tried to add generic format to all of my
   catalog categories גוף but it doesn't look good in the 3D. Try to see why. First chandeliers,
   then all products. Add them to my catalog using the app, write what is broken and fix it."
2. **Two glass pendant photographs.** One amber globe on a black cord, and five globes in amber,
   smoke, clear and chrome at different drops. The user said: "Can I make like this, as a single,
   as a group, and more variations?"

## What was broken, and why

Each item was found by building the photographed piece in the app headlessly, before reading any
code.

| # | Seen in the app | Root cause | Fix |
|---|---|---|---|
| 1 | Setting a גוף turned the chandelier into a gold urn, with the arms, bulbs and crystal hidden inside it | `itemBody` → `hasOwnBody` → `ownBodyParts` built the base's `revolve` as an opaque matte lathe the size of the piece, *beside* the picture | `PROFILE_IS_PICTURE` and `ownBodyParts(…, { baseProfileIsPicture })`. The profile became the silhouette `chandelierTiers` reads (`profileAt`). |
| 2 | The tiers field offered 9, but the build stopped at 5 | Hidden cap in the layout | `CHANDELIER_TIERS_MAX` = 10, and the field takes `max` |
| 3 | An empire basket could not stack | One basket only | `tiers` stacks baskets, and every upper ring is a curtain down to the next (`empireCrownR`) |
| 4 | No way to make a spiral or floating rings | No style for them | New styles `spiral` (`SPIRAL`) and `rings` (`RINGS`). A torus takes `rotDeg`/`tiltDeg` (`ringPoint`, `ringGlobe`). |
| 5 | The crystal was invisible | Beads were `glass` at 0.22 opacity | `MaterialKind "crystal"`: flat-shaded, metalness .45, env 3, emissive .18, opacity .78 |
| 6 | Strands read as dots | Beads were unconnected spheres | `CrystalBead.strand`, so beads are linked by `chains()`. Pears became teardrops (`crystalPart`). |
| 7 | The arms were sticks with fat bulbs | The plan's exaggerated bulb was copied into 3D | S-arms of 3 rods (`rod()`), and real candles: sleeve, drip pan, flame |
| 8 | Rings and hoops floated | Nothing held them | `columnProfile` to the crown, spokes to every ring, cables from the crown |
| 9 | Tall pieces were cut off at the top of the pane | The focus looked at the underside, at a guessed 2.5 m | `focus.ts`: the middle, at the real hang height (`hangHeightOf` ?? `ceilingUndersideMm(roofAt)`) |
| 10 | The pendant globes were nearly invisible clear balls on a chandelier chain | Pendants were treated as a chandelier variant | Glass finish from the shade name (`glassFinishOf`), the body = the glass's shape, its own cord, cap, socket and Edison bulb |
| 11 | The globes were faceted | Lathe of few points | `smoothProfile` (Catmull-Rom) |
| 12 | Amber looked opaque | Tinted opacity too high | Tinted 0.4, clear 0.2, mirror a see-through metal 0.86, frosted gloss 0.9 |
| 13 | The globes inside the rings were invisible | Too small and unlit | Emissive amber, `globeR` .11, plus an emitter |
| 14 | The spiral's balls were faint | Too small and too few | End ball r = BEAD×3.4, 56 strands |
| 15 | React duplicate-key error in the glass tiles | The none tile and the "cylinder" form shared a key | The none tile's key is `"__none"` |

## Decisions, with the reason for each

- **A body's profile is the silhouette for envelope categories.** Built as a solid, it hid the
  picture. That was the user's complaint, word for word.
- **A plan with no profile keeps the old layout to the digit.** No existing row moves. The
  self-check asserts the old numbers.
- **One layout module.** `lib/catalog/chandelier.ts` holds fractions of R and h. The plan
  (`item-symbol.tsx`) and the room (`lib/scene/overhead.ts`) both read it. `chandelierDrawOf(a,
  variants)` builds the one draw object, and every `ItemSymbol` caller passes it.
- **Spec fields are "absent = the style's own".** `chandelierOf` resolves them and
  `chandelierPatch` never stores a default.
- **Pendants are a style, not a category.** The count is 1 for a single and N for a group. The
  glass is the shade, the body is the glass's shape, and the fitting is a spec field. The `glassMix`
  and `equal` switches cover the group photograph.
- **A group can also be a composite of singles,** each at its own hang height and shade.
- **The profile tiles belong to the category.** They are `CHANDELIER_PROFILES` (cone, funnel,
  spindle, crown, bell, globe) and `PENDANT_GLASS` (globe, egg, drop, bell, dome, cylinder, cone),
  passed to the shared `RevolveFields` through `tiles`. The first shape's chip is labelled with
  the category's word.
- **No glow-mood tricks.** A lit shade is `emissive`, so it shows in every mood. Bulbs are emitters.

## File map

| Layer | File | What changed |
|---|---|---|
| Types | `lib/catalog/types.ts` | `ChandelierSpec` (tiers, crystals, strands, fitting, glassMix, equal), `PendantFitting` |
| Styles | `lib/catalog/symbols.ts` | `SYMBOL_STYLES.chandelier`: styles, labels, hints |
| Layout | `lib/catalog/chandelier.ts` | `chandelierOf`, `chandelierPatch`, `chandelierDrawOf`, `chandelierTiers`, `crystalBeads`, `profileAt`, `CHANDELIER_PROFILES`, `PENDANT_GLASS`, `glassFinishOf`, `equalGlobes`, `globeRise`, the self-check |
| Scene types | `lib/scene/types.ts` | `MaterialKind "crystal"`, torus `rotDeg`/`tiltDeg` |
| Materials | `lib/scene/materials.ts`, `components/scene/scene-materials.ts` | `crystalMaterial`, the crystal case |
| Geometry | `components/scene/scene-geometry.ts` | Tilted torus, body key hashing |
| Recipe | `lib/scene/overhead.ts` | `chandelierBody` per style, the pendants, helpers (`rod`, `crystalPart`, `chains`, `columnProfile`, `pendantGlass`, `smoothProfile`), the self-check |
| Routing | `lib/scene/items.ts`, `lib/scene/element-body.ts` | `PROFILE_IS_PICTURE`, `baseProfileIsPicture` |
| Context | `lib/scene/item-context.ts`, `lib/scene/tables.ts` | `ctx.chandelier = chandelierDrawOf(...)` |
| Camera | `lib/scene/focus.ts` | A ceiling item's middle at its real hang height |
| Plan | `components/item-symbol.tsx` | Empire stack, spiral, rings, pendants (single = full circle, palette tints) |
| Editor | `app/(app)/catalog/revolve-editor.tsx` | `RevolveTiles`, `RevolveFields tiles`, the `"__none"` key |
| Editor | `app/(app)/catalog/appearance-modal.tsx` | Silhouette and glass tiles, tiers max, the metal Select, the mix and equal switches, `ShapeBar bodyTiles` |
| Callers | appearance-preview, placement-map, canvas-stage, plan-glyph, composition-drawing | `chandelier={chandelierDrawOf(x.appearance, x.variants)}` |
| Checks | `lib/scene/item-scene.ts` | An urn-bodied chandelier builds no lathe > 0.5R |

## Checks that ran

These all passed:

- the item checks: `check:chandelier`, `check:item-scene`, `check:scene`, `check:scene-viewer`,
  `check:scene-focus`, `check:scene-element`;
- the element and catalog checks: `check:element-parity`, `check:revolve`, `check:element`,
  `check:footprint`;
- the app-wide checks: `check:costs`, `check:scene-boundary`, `check:items`, `check:actions`,
  `check:viewpoints`;
- `npx tsx lib/scene/overhead.ts` (prints "scene overhead ok");
- `npm run typecheck`.

## Rows created (develop, studio org `00000000-0000-0000-0000-000000000001`)

- **Chandeliers:** שנדליר מריה תרזה זהב, מפל קריסטל יהלום, סל קריסטל שלוש קומות, תוף קריסטל 60,
  ספירלת קריסטל, מפל קריסטל עם כתר, טבעות אור מרחפות.
- **Pendants:** גלובוס זכוכית תלוי 25, אשכול 5 גלובוסים, פעמון זכוכית תלוי 30, אשכול 7 גלובוסים
  בגדלים, ביצת זכוכית תלויה 22.

## Not done

- Nothing was seen on a real GPU or a phone. All of it was SwiftShader.
- The Edison filament is faint in daylight.
