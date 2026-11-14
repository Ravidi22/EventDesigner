---
name: rebuilding-a-catalog-category-in-3d
description: Use when a catalog category's picture looks generic, wrong or lifeless in EventDesigner's 3D room or on the plan; when the shape editor's "גוף" (revolve / body) spoils an item in 3D; when the user sends photographs of real pieces, or asks to find high-end designs on the web, for a category (chandeliers, flower arrangements / סידורי פרחים, chuppahs / חופה, arches, candlesticks, trees, lamps…) and wants them made in the catalog; or when a category needs new styles or spec fields.
---

# Rebuilding a catalog category in 3D

## Overview

A category's picture is a **recipe**. Everything the designer sets on a row (the base shape's
"גוף", a style, a count, the shades) is an **input to that recipe**. It is never a second solid
standing beside the picture. The plan and the room read **one layout**. The judge is the real piece:
a photograph set beside a screenshot of what the app builds.

This was learned on chandeliers (2026-11-08), then applied to flower arrangements and chuppahs
(2026-11-09). The records are in this folder: `chandelier-round.md` and
`flowers-and-chuppah-round.md`. Each has what was broken, the root cause, every decision and the
files. Read them before starting a new category.

## Rounds so far

| Kind | What the base's `revolve` means | Where it is read |
|---|---|---|
| chandelier | The silhouette: every tier's radius | `lib/catalog/chandelier.ts` `chandelierTiers` |
| pendants (a chandelier style) | The glass's own shape | `PENDANT_GLASS`, `lib/scene/overhead.ts` |
| flowers, centerpiece | The envelope: heads on its top, rings down its steep side and underside, the mass inside, a neck as stems | `FlowerDrawSpec.profile`, `lib/scene/flowers.ts` |
| flowers on any shape (2026-11-13) | Nothing — a footprint that is not a plain box is COVERED: cap, walls, underside per outline; a front shape on its face | `lib/catalog/flower-cover.ts`, `lib/scene/flower-cover.ts` |
| chuppah (round) | The roof's section above the eave: posts rise to it, then the cloth, cloud or ribs follow it | `lib/catalog/chuppah.ts` |
| lamp | The whole lamp from the side: base below its neck (metal), shade above (cloth, lit) | `lib/catalog/body-profiles.ts` `lampParts`, `lib/scene/items.ts` `lampBody` |
| tree | The crown's envelope: leaves where wide, trunk where thin | `lib/scene/plants.ts` `treeEnvelopeParts` |
| vase, column, fountain | The object itself, turned — in ITS OWN material, keeping what makes it that thing (hollow glass; water, jet and glow) | `lib/scene/items.ts` `vaseBody`, `floor-kinds.ts` |
| candlestick; round chair / sofa | The turned body under its candles; the pouf | `turnedCandlestick`, `turnedPart` |

Likely next: arches, trees (a crown envelope, like flowers), candlesticks, bars.

## First question: which bucket is the category in?

`itemBody` in `lib/scene/items.ts` decides how a row's own body meets the category's picture.

| Bucket | Set in items.ts | What the base's `revolve` means | Kinds today |
|---|---|---|---|
| Profile is the picture | `PROFILE_IS_PICTURE` | The recipe READS it (`ctx.profile` or its own draw object): the **silhouette** its many small pieces are laid inside, or the turned object itself built in the kind's own material. Nothing is built for it beside the picture. | chandelier, flowers, centerpiece, chuppah, lamp, tree, vase, column, fountain, candlestick, chair, sofa |
| Combine (default) | — | The recipe draws on the rest of the footprint, and the element model adds the shapes' own bodies: raised parts, a lathe. | everything else |

How to choose:

- **One turned solid** (a vessel, a shaft): the recipe builds the profile ITSELF, in its own material,
  and keeps what makes the thing what it is (a fountain's water, a lamp's light). The old "body
  replaces the picture" bucket is gone (2026-11-13): it handed the row to the flat fallback, and a
  lamp came out a matte cone with no bulb.
- **A stored profile always runs from the floor to the top** (`cleanRevolve`). A part that starts
  higher (a lamp's shade) cannot be stored as its own profile: read the WHOLE piece's profile and
  split it (`lampParts` at the neck, a tree at `CROWN_THIN`).
- **Many small things inside an envelope** (crystal and arms, flower heads, a tree's crown, a
  chuppah's canopy of cloth and flowers): the profile is the picture.
- **Parts at their own heights** (a shelf, a tier on a stand): combine.

A category left in "combine" while it is really an envelope gets the chandelier bug: an opaque
matte lathe the size of the whole piece, with the picture hidden inside it.

Four traps:

- **"Profile is the picture" has two halves.** The kind goes in the set, *and* the recipe reads
  the profile (`ctx.<kind>.profile`), so the profile changes what is built. With only the set, the
  גוף silently does nothing. Decide first what the profile *means* for this kind. For a chuppah it
  is the canopy's section: a dome, an onion or a peak, with the poles standing at its rim.
- **The sets are per `SymbolKind`, not per category.** `CATEGORIES[].symbol` maps several
  categories to one kind. For example `flowers` serves flower-arrangements, greenery and
  dried-flowers. Check every category that maps to the kind.
- **`own.rest` is a `multi` footprint.** When a row also has other shapes, the picture gets the
  leftover footprint. `isRound` and some size readers say no to a `multi`, so take the round-ness
  from the base shape.
- **A kind can be built along more than one path.** Flowers are built on the floor through
  `itemBody`, on a table through `lib/scene/tables.ts`, and hung through `build.ts`
  `ceilingPlacement` → `hungFlowersBody`. Grep for the recipe's callers and give every path the
  draw object.
- **A form and a profile can both be set.** For example a flower `symbolStyle` form and a
  `revolve`. Decide which wins and write it down. The chandelier rule: the profile shapes the tiers,
  and the style still picks the construction.

## The round

1. **References.** Use the user's photographs, or search the web for high-end pieces. Make one
   row per piece: its structure (tiers, pieces, counts), its proportions (⌀ × height), its materials
   and finishes, and how it stands or hangs.
   - Web images are references only. Never upload a stranger's photograph as a row's picture.
     Put the source in the row's `spec` text; the card draws `AppearancePreview` when there is no
     photo.
   - The user's own photographs do go on the rows.
2. **Read what the user already made.** Query their rows in the category (develop, studio org).
   Look at the `appearance.revolve`, `symbolStyle` and spec fields they set: each one says what
   they meant the גוף to do. Print hosts only, never a database URL.
3. **Reproduce through the app before touching code.**
   - Copy `scripts/harness.js` into a scratchpad folder, install playwright there, and drive the
     dev server from it. Never run it from the repo.
   - Make a new draft in the category, set its size, style and body, and screenshot the plan and
     the 3D pane.
   - Write the list of what is broken, one screenshot per item.
   - Never press save in that flow.
4. **Find the root cause of every item before fixing.** Use superpowers:systematic-debugging, and
   trace from `itemBody` down to the recipe. Usual causes:
   - the body is built as a solid;
   - the recipe ignores a spec field;
   - the plan and 3D compute positions separately;
   - the material is too faint to see;
   - pieces float with nothing holding them;
   - the camera frames the wrong part.
5. **Model every feature of a photograph as exactly one of these:**

   | Feature | Becomes |
   |---|---|
   | A different construction (spiral, floating rings, rotunda) | a **style** in `SYMBOL_STYLES` (absent = the old drawing) |
   | A number or switch inside one style (tiers, strands, fitting, mix) | a **spec field** on `MapAppearance.<kind>` (absent = the style's own answer) |
   | The overall outline (cone, bell, crown) | the **profile** (`revolve`), offered as category tiles |
   | A colour or finish (amber glass, chrome, gold) | a **shade** (variant), read by name where it matters |
   | Two separate things together (a drum over a cascade) | a **composite** of rows |
   | Its own product | a separate **row**, using the existing style |

6. **Build in this order.**
   1. A layout module `lib/catalog/<kind>.ts`, in fractions of R and h, with a self-check.
      Shared profile readers such as `profileAt` (today in `lib/catalog/chandelier.ts`) move to
      `lib/element/revolve.ts` once a second kind needs them. Never copy them.
   2. The plan case in `components/item-symbol.tsx`.
   3. The 3D recipe in `lib/scene/` (overhead / floor-kinds / items / flowers).
   4. The editor in `app/(app)/catalog/appearance-modal.tsx`: style tiles, spec fields, and profile
      tiles through `RevolveFields tiles`.
   5. The draw object, carried through `ItemContext` and **every** `ItemSymbol` caller (grep for
      them).
7. **Verify, then look.**
   - Run `npx tsx` on every module you touched (each self-checks when run directly), then
     `npm run check:item-scene`, `check:scene`, `check:scene-element`, `check:element-parity`,
     `check:revolve`, `check:costs`, `check:scene-boundary`, the kind's own check (`check:flowers`,
     `check:scene-flowers`, `check:floor-kinds`, `check:overhead`…), and `npm run typecheck`.
   - Add an assertion that a row with a profile builds no opaque lathe wider than half the piece
     (the chandelier one is in `lib/scene/item-scene.ts`).
   - Run the harness again and set each reference photo beside its screenshot. Fix what the eye
     says, and repeat until they resemble each other.
8. **Rows.** Save them with `scripts/add-rows.template.mts`, as the studio (`SINGLE_ORG_ID`, UUIDv5
   ids, photos through `fileDriver`). Read them back from the database, and confirm each one builds
   in 3D.
9. **Write it down.**
   - A CLAUDE.md paragraph: the decisions, names, constants and row names.
   - The memory note `element-model-branch`.
   - A report to the user in plain before/after terms, with the screenshots folder.

## Decisions that carry over

1. **Absent means the old drawing, to the digit.** A new style or field never changes an existing
   row. The patch never stores the style's own default (`chandelierPatch`).
2. **One layout for plan and room.** Positions are fractions of R and h in the
   `lib/catalog/<kind>.ts` module. `item-symbol.tsx` and the 3D recipe both read it, and neither
   keeps its own math.
3. **The profile is read, not built.** Each tier's radius comes from the profile (`profileAt`, as
   a share of its widest point). The flag `ownBodyParts(…, { baseProfileIsPicture })` keeps the base
   from becoming a solid.
4. **Real sizes in 3D.** The plan exaggerates so things can be seen: fat bulbs, thick candles. The
   room uses real sizes: tapers with drip pans and flames, 2.5 mm cords.
5. **Nothing floats.** Every piece is held by a column, spokes, cables, a cord or a chain.
6. **A material kind, not an opacity hack.** Glass at 0.22 opacity was a ghost. Cut glass became
   `MaterialKind "crystal"`. A finish is read off the shade's name (`glassFinishOf`: chrome,
   frosted, clear or tinted).
7. **Shades are variants.** A "mix" switch spreads a row's live shades over its pieces. The palette
   travels inside the draw object, so every caller passes the row's variants.
8. **Profile tiles belong to the category.** For example `CHANDELIER_PROFILES` and
   `PENDANT_GLASS`, shown in the panel and on the first shape's chip under the category's own word
   (צללית / צורת הזכוכית).
9. **The camera looks where the room hangs it.** A tall or hung piece is framed at its middle, at
   its real hang height (`lib/scene/focus.ts`).
10. **The count field means the obvious thing.** A count of 1 is a single piece whose circle *is*
    the plan's circle, and N is a group. The same row type covers both.
11. **Steep sides need their own dressing.** The plan lays small pieces by the area seen from
    above, so on a cone or a tower's side they come out thin. Dress what is steep in 3D: the
    flowers' rings start at `STEEP_DEG`.
12. **The underside is seen.** A cloud over a chuppah or a hung piece is looked at from below.
    Give it an envelope that closes underneath (`CLOUD_LENS`).
13. **The plan and the room share one dense spec.** Not the plan's default mix against the
    room's dense one: `cloudFlowers` is both.
14. **A decoration colour on a structural category is a spec field.** A chuppah row has no flower
    lines, so the flowers' colour is `ChuppahSpec.bloom`.
15. **`symbolOf` limits the picture to circle, ellipse or rectangle.** A picture that should follow
    any outline needs its own exception there (a hexagonal chuppah).
16. **Tall floor pieces are framed whole.** Above `TALL_MM`, the pane looks at the middle and
    backs off (`lib/scene/focus.ts`).
17. **A picture made of many small pieces can follow ANY outline.** Lay the pieces by a rim row plus
    a honeycomb (`coverSpots`), give each spot its depth and its way out, and lift by a section law —
    the round recipe's own law falls out for a circle. Back each piece with a small dark clump;
    never extrude the outline as a "mass" (it shows as a kerb past the pieces).
18. **Full is the default, the spec is the mix.** A drawing that stops at the listed count reads as
    empty on anything large; repeat the mix to cover the surface and keep "exactly the spec" as a switch.

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| Building the base's `revolve` as a solid for an envelope category | An opaque blob the size of the piece | Add the category to `PROFILE_IS_PICTURE`, and have the recipe read the profile |
| Separate plan and 3D math | The plan and the room disagree | Use one module of fractions |
| Changing the default layout | Every existing row moves | Keep the old layout when the field is absent, and assert that in the self-check |
| Copying plan sizes into 3D | Cartoon bulbs and candles | Use real millimetres |
| Faint transparent materials | The pieces vanish in the render | Use a material kind with emissive or env strength |
| Two tiles sharing a key (a "none" tile vs a form named the same) | React duplicate-key error | Give the none tile the key `"__none"` |
| A new draw prop missed at one `ItemSymbol` caller | One surface draws the old picture | Grep every caller: canvas, rail glyph, preview, print, composition |
| Judging only by Node checks | The checks pass and it still looks wrong | Take a headless screenshot beside the photo |
| Pressing save in the supplier test flow | A real row is written | Save rows only through the script, as the studio |
| Scripting a patch that assumes CRLF or LF | The match fails, or the file ends up with mixed endings | Detect `
` per file; `core.autocrlf` is on, so both are fine on commit |
| Expecting a hand-drawn outline to be drawn as the picture | It falls back to outline + name | Check `symbolOf`'s shape rule, and size the picture with `footprintBounds` |

## Files in this folder

- `chandelier-round.md` and `flowers-and-chuppah-round.md`: the full records (the broken list, the
  root cause, the iterations, the file map, the constants, the rows).
- `scripts/harness.js`: the headless Chrome harness (log in, draft, editor, size, 3D pane,
  screenshots).
- `scripts/add-rows.template.mts`: saving rows as the studio, with UUIDv5 ids and photos.
