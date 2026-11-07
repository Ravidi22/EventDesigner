# The built-in kit — design

Version 1.0 | 2026-11-07 | Decided with Ravid the same day, after the venue-plan round ([2026-11-07 venue heights, rails and covers](2026-11-07-venue-heights-rails-and-covers-design.md)). Not built yet.

Ravid: *"build the default kit that designer should have… some elements don't need an option to create products from them, should be one built-in product that can be used (like the LED strip) and should be removed from the add catalog… built-in elements are created at the user's creation, after it fully customisable to his decisions, he can add a price, shades…"*

## 1. What a built-in is

- **A real catalog row, installed for every studio when it is created** (`installStandardCatalog` at sign-up, lib/auth/actions.ts) and for every older studio by the existing backfill (`npm run catalog:standard`). It is a base-library item (lib/catalog/standard/items.ts) marked `builtIn: true`; its id is the base library's UUIDv5 over (organisation, key), so re-running adds only what is missing and never overwrites what the designer changed.
- **The designer's own from then on**: name, photo, price, cost, supplier, shades, stock, drawing — every field an ordinary row has. Its colour on the plan is whichever of ITS shades the placement wears.
- **Never created again, never deleted.** Its row cannot be deleted or duplicated (server-side refusal, no menu item). A category that is built-in only (`CategoryDef.builtIn`) is not offered in a studio's new-item form or CSV import; the one row is the category.
- **Shaped where it is used.** Route, length, width, ties, size — set on the canvas, per placement, as each item already does (rails, stage edges, covers).
- **Pinned at the top of the sketch's rail** in its pass, the way "שורות כיסאות" is, for the built-ins that are placed directly.
- **Rows the studio already has in those categories keep working** as they are (sketches and quotes unchanged); they are ordinary rows.
- `Product.builtIn` (the base key) is DERIVED on read by the server (the row's id is the built-in's derived id) — no column, no migration.

## 2. The kit

| Key | Name | Category | Category creatable by hand? | Placed directly? |
| --- | --- | --- | --- | --- |
| `builtin-led-strip` | פס לד | `led-strips` | no | yes (rail) |
| `builtin-led-screen` | מסך לד | `led-screens` | no | yes |
| `builtin-curtain-rod` | מוט וילון | `curtain-rods` | no | no (comes with a rod curtain) |
| `stage-skirt` (exists) | חצאית במה | `stage-skirts` | no | no (stage edges) |
| `stage-stairs-100` (exists) | מדרגות במה | `stage-stairs` | no | yes |
| `stage-ramp` (exists) | רמפת נגישות | `stage-ramps` | no | yes |
| `stage-barrier` (exists) | מחסום במה | `stage-barriers` | no | no (stage edges) |
| `stage-backdrop` (exists) | קיר רקע לבמה | `stage-backdrops` | no | no (stage edges) |
| `stage-carpet` (exists) | משטח במה | `stage-surfaces` | no | no (a stage's surface) |
| `stage-bench` (exists) | בנקט | `stage-benches` | no | yes |
| `builtin-ceiling-drape` | בד תקרה | `ceiling-drapes` | no | yes (rail) |
| `builtin-sail` | מפרש | `sails` | no | yes (rail) |
| `builtin-pergola` | פרגולה | `pergolas` | no | yes |
| `builtin-dance-floor` | רחבת ריקודים | `dance-floors` (new) | no | yes |
| `builtin-rug` | שטיח | `rugs` | **yes** (owned rugs stay) | yes |
| `builtin-curtain` | וילון | `curtains` | **yes** (special fabrics stay) | yes (rail) |

- The custom carpet over a surface (`שטיח מותאם…`) lays the built-in שטיח, sized to its target, instead of minting a new row per use.
- A supplier organisation's drawer still offers every category (it sells LED strips); a studio copying one from the marketplace gets a second row in that category, which is the one way it happens.
- The רחבת ריקודים is new: a floor item laid like a rug (stretch, corners, the hall pass's), drawn as panels in its shade, glossy in 3D, priced per m².

## 3. Not built-in (stay creatable, unchanged)
Tables, chairs, sofas; cloths, centrepieces, arrangements, vases, candlesticks; flowers, greenery, dried; chandeliers, lamps; bars, chuppahs, arches, gates, columns, fountains, trees; stages and stage decks (real inventory, already installed by default); אחר; composites (their own flow).
