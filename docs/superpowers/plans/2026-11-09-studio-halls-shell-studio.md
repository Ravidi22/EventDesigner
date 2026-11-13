# Studio + Halls Shell — Plan 2: The Studio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild /studio as the board's shell, as /halls already is: ONE card of rail · canvas · end panel; no header; the selection as a quick bar and end-panel groups; the modes (fill tool, dressing, armed) in the same frame.

**Architecture:**
- The shared parts exist (Plan 1): `components/end-panel.tsx`, `components/canvas-chrome.tsx`, `components/inspector-bar.tsx` (Quick*), `components/popover.tsx` (picker / beside / pill), `components/tool-tile.tsx`, `components/modal-frame.tsx`, `lib/studio/panel-groups.ts`.
- **The model to copy is /halls:** `app/(app)/halls/halls-selection.tsx` takes `part: "bar" | "groups"` and is rendered twice from ONE props object (`selectionProps` in `halls-screen.tsx`). Every task that converts a bar reads that file first.
- The studio's `Inspector` (`app/(app)/studio/inspector.tsx`) gains the same `part` prop and is converted KIND BY KIND. Until a kind is converted, `part="bar"` renders today's bar and `part="groups"` renders nothing for it, so every task leaves a working screen.
- Nothing stored changes. No reducer action, check or data shape changes (spec §6).

**Tech Stack:** Next.js (this repo's version; read `node_modules/next/dist/docs/` before touching routing), React, TypeScript, Tailwind v4 tokens in `app/globals.css`, lucide-react. Self-checks are `tsx` scripts guarded by `isMain(import.meta.url)` (`lib/self-check`), wired as `npm run check:*`.

**Spec:** [docs/superpowers/specs/2026-11-09-studio-halls-shell-design.md](../specs/2026-11-09-studio-halls-shell-design.md) — read §1, §2, §4, §5, §9 before any task. Plan 1 (done): [2026-11-09-studio-halls-shell-parts-and-halls.md](2026-11-09-studio-halls-shell-parts-and-halls.md).

## The user's notes after Plan 1 (binding; they override the spec where they differ)
Given 2026-11-09 after seeing /halls (fixed for /halls in commit 65c421a):
1. **No document ⋯ where it would only open a panel group.** /halls lost its ⋯. The studio gets **no document ⋯ either**: numbering, saved sketches and removed venue features are end-panel groups shown when nothing is selected (spec §4.3), so a ⋯ pointing at them is the same redundancy. Paste is Ctrl+V and the right-click menu on empty canvas. (Overrides spec §1 "⋯ the document menu", D1, D5, D6's ⋯ part.)
2. **No venue ▾ on the canvas.** The venue is the app nav's switcher (and in the studio, the event's). The studio's view cluster is zone ▾ (only with more than one zone) · 3D. (Overrides D15.)
3. **The folded end panel is a 48px column with its button at the top** — already built in `EndPanel` (65c421a). Use `<EndPanel screen="studio" collapsible>`.
4. **Toggles wear the board's look** — `Segmented` / `SegmentedToggle` already do (`segmentClass`, 65c421a: chosen = `bg-accent-wash text-accent-deep` bold). Never hand-roll a filled-violet toggle; `SegmentedToggle fill` in a panel group, compact in a bar.
5. **Every element must take a plain click.** A picture that takes no pointer (`ItemSymbol` is `pointer-events-none`) needs a transparent hit shape; while a tool is armed nothing on the plan may swallow the click that places it.

## Global Constraints
- **RTL-first:** logical properties only (`ms-/me-/ps-/pe-`, `start/end`, `border-s/border-e`, `inset-inline-start`). Never `left/right` for flow spacing. Arrow-key handlers account for RTL.
- **Tokens as-is:** radii `rounded-sm` 8 / `rounded-md` 14 / `rounded-lg` 22 / `rounded-pill`; shadows `shadow-floating` / `shadow-lifted` / `shadow-dialog`; colours `bg-surface`, `bg-inset`, `border-border`, `border-border-soft`, `text-accent`, `bg-accent-tint`, `bg-accent-wash`, `text-accent-deep`, `border-accent-line`, `text-warn-ink`, `bg-warn-tint`.
- **No new stored data**, no new reducer action, no change to `lib/design-document/` (spec §6). Board fields the model lacks are not built (spec §10).
- **Fields live in end-panel groups** (`PanelGroups` / `PanelGroup`, every group with a mandatory `summary`, warn groups first). Popovers are PICKERS (`variant="picker"`, opened from a `PickRow`, `side="beside"`) or MENUS only.
- **Quick bar row 2 order:** at most 3 numbers (a W×D pair counts as one) → at most one `ModeVerb` → `QuickTail` (copy · delete · ⋯, ⋯ always last). `QuickTurn` is the angle.
- **Every key handler matches by physical key** through `isShortcut` (lib/keyboard.ts), Hebrew layout safe.
- **Canvas speed rules** (CLAUDE.md "The camera is a transform" and "Every drag is startPointerGesture"): no setState per pointermove; no fresh closures/objects as memoised node props; never put the view in React state. The 3D pane's three rules hold (settle, hide-never-unmount, follow the selection).
- **/meeting mounts the same `StudioScreen`** (modes `hall` / `design`, inside `CanvasCard`). Every change must work there; `mode === "hall"` still hides dressing (`onDressTable` undefined).
- **Client-facing rule:** nothing that shows cost/price enters a client surface (`npm run check:costs`).
- **Verification per task:** `npm run typecheck`; `npm run check:actions`; the `check:*` of any `lib/` module touched; the task's headless harness (below); then commit. Never `--no-verify`.

## The headless harness (every UI task uses it)
- Dev server: `http://localhost:3000` is already running (`npm run dev`). If it is not, start it in the background and wait for it.
- Scripts live in the scratchpad folder `C:\Users\Ravid\AppData\Local\Temp\claude\be93d0f21d8125eb\4fc5f6c1-b369-4c07-932e-f4c9958d9a03\scratchpad\shell\` (call it `$SHELL`). Put each task's script in `$SHELL\studio\tN-<name>.js` and `require("../studio-lib")`.
- `$SHELL\studio-lib.js` exports `openStudio(opts?)` (logs in as the throwaway studio "בדיקת מעטפת", opens /studio, waits for the rail), `plan(p)` (the canvas box), `tap(p, x, y)` (hover → down → up), `arm(p, name)` (a rail row by its name), `place(p, name, [[fx, fy], …])` (lays copies at fractions of the canvas box and disarms; returns the screen points), `esc(p, n)`, `shot(p, file, clip?)` (writes into `$SHELL`), `bodyHas(p, text)`, `has(p, selector)`, `sleep`, `out`. Read it before writing a script.
- The throwaway studio has NO event: /studio opens on a scratch drawing (browser localStorage — empty in every fresh run) over the device's venue (Amare, read-only for this login). So every run starts from an empty plan: lay what you need from the rail ("עגול 244", "מרובע 120×120", "מלבן 120×180", "מסך לד", "פרגולה", "שטיח", "רחבת ריקודים", "בנקט לבמה", "מדרגות במה 100", "וילון", "פס לד", "בד תקרה"; the "שורות כיסאות" card; the stage fill tool).
- A headless step is the task's RED/GREEN test: write the script's assertions first, run it, see it FAIL for the right reason (the element is not there yet), build, run it again to PASS. Print `PASS <name>` / `FAIL <name>` per assertion and exit non-zero on any FAIL. Screenshot the states the task changes and LOOK at them (Read the PNG).
- Never edit Amare or any real studio's data. The scratch drawing is per browser and disappears with it.

## Code map (as of commit 65c421a — line numbers drift as tasks land; search by name)
**`app/(app)/studio/studio-screen.tsx` (SS, ~6000 lines)**
- `StudioScreen` props 256–269: `mode?: "full" | "hall" | "design"`, `initialProducts?`, `onSaveState?`. Mounted by `app/(app)/studio/page.tsx` (full, inside `EventSurface`) and `app/meeting/meeting-screen.tsx` (hall / design, inside `CanvasCard`).
- State: `history` 320; `selected: SelectionRef[]` 336; `scenePrefs` 342 (`sceneMounted` latch 343, `patchScene` 353, `toggleScene` 354); `layerVisible: Record<Plane, boolean>` 370; `activeLayer: Plane | null` 376; `showClearance` 383; `stageFill` 384; `saveState: "saving" | "saved" | "error"` 393; `zoneFocus` 394; `hint` (toast) 395, `showHint` 644; `retrySave` 584.
- Handlers: `copy` 1416, `paste` 1565, `cut` 1595, `selectAll` 1261, `selectInZone` 1303, `selectLayer` 1318, `restoreFeatures` 1402, `removedVenueFeatures` 1410, `clearance` 2159 (`clearanceSubjects` → `clearanceIssues`), `breaches` 2167, `startStageFill` 2576, `stagePanel` 3013, `sketches`/`saveSketch`/`loadSketch`/`deleteSketch`/`sketchPhoto` 3507–3561, `seating` 3616, `numbering` 4186, `renumberAll` 4193, `renderDesigns` 4785, `renderPattern` 4809, keyboard effect 4973–5056, `contextItems` 5065, `coverMenuAt` 5206, `zoneOptions` 5233, `focusZoneId` 5239.
- Render 5248–5957: outer `div.flex h-full flex-col` → `<Toolbar>` 5250–5287 → row `div.relative flex min-h-0 flex-1` 5290: `<CatalogRail>` 5291 | canvas column `div.relative min-w-0 flex-1` 5304 (holds `<CanvasStage>` 5305–5505 and every overlay) | `<ScenePreview>` 5926 (when `sceneMounted`). `<ProductDrawer>` 5944 after the row.
- Overlays in the canvas column (in JSX order): proposal banner 5506 (`top-3`), `<ProposalReview>` 5523 (covers the column), `<DressingBar>` 5548 (`top-3`), stage-fill draw hint 5596 / pick hint 5610 / stage-tool hint 5621 (`top-4` centred pills), bottom dock 5630–5834 (`StageDrawBar` 5638 | `StageFillPanel` 5652 | `<Inspector>` 5668–5831, all props inline), seating chip 5838 (`top-4` start), armed chip 5847 (`top-4`, `top-28` while dressing), template-placing hint 5888, `<VenueAccessNotice>` 5895, `<VenueUnsetNotice>` 5902, toast 5912 (`bottom-20`).
- Keyboard (4973–5056, window keydown, bubble): `typing = isTypingTarget() || inside a dialog`; order: `deckKey` (fill tool) → mod+Z / Shift / mod+Y → mod+C/X (not with a text selection) → mod+V → mod+G / Shift → mod+Shift+L → mod+A → mod+] / [ → Delete → arrows (dressing nudge) → Escape (`!typing && !defaultPrevented`): fill pick (unpick deck / close) → dressing → activeEdge → backToGroup → selection → zone + layer scope. Capture-phase Escape listeners (run first, stopPropagation, NO typing check): `placing` 3491, `armedId` 3600, `stageTool` stair 4073. No Ctrl+D outside the fill tool.
**`app/(app)/studio/toolbar.tsx`** — `Toolbar` 29 (h-12 header): undo/redo · copy/cut/paste · `NumberingMenu` 349 (body is a render prop; calls `close()` only after renumber) · `SketchMenu` 473 (own state: name, confirm, file input; nested `ConfirmDialog`) · `RemovedFeaturesMenu` 318 (only with removed features) · zone `Select` (ScanEye, only with >1 zone) · `PlaneRail` 253 · 3D toggle · save state 207–228 (saving / error button "לא נשמר · נסה שוב" → `onRetrySave` / saved).
**`app/(app)/studio/canvas-stage.tsx`** — `CanvasStage` renders `<PlanCanvas>` 1881–3094; `toolbarExtras` 1909–1927 = clearance toggle (ShieldAlert) + "מילוי במות" (Grid2x2Plus → `onStageFill`). It passes NO `onUndo/onRedo/canUndo/canRedo` (PlanCanvas draws its undo pair only when given them). `planeOf(ref)` 493.
**`app/(app)/studio/inspector.tsx`** (~3300 lines) — `Inspector` 333, props typed 456–716 (121 props). Dispatch: block/group 729 (741–913) · stages group 919 (922–1148) · multi 1151 (1156–1278) · empty-scope "בחירה" 1288 · venue feature 1303 (1305–1335) · placement 1338: stage edge 1353 (1354–1512), stage 1515–1801, any other placement 1852–2245 (flags 1804–1851: on table, over table, drape `railOf`, cloth kind, stretch, climb, bench, chair block, LED) · table 2248 (2262–2502). Helpers: `BenchSidesFields` 2518, `SwapPopover` 2643, `MoreMenu` 2748, `lockItems` 2764, `mirrorItems` 2772, `SaveTemplatePopover` 2783, `SizePopover` 2805, `BreachPopover` 2859, `UnnumberedSwitch` 2880, `DuplicateNumber` 2892, `SpacingPopover` 2901, `stackItems` 2936, `selectionItems` 2948, `RowSpreadPopover` 2996, `DrapeRailPopover` 3055, `HangPopover` 3122, `ClimbPopover` 3156, `VesselPopover` 3230, `ScalePopover` 3259. Panels' types: `StagePanel` 235, `StageGroupPanel` 284, `BenchPanel` 223, `SizePanel` 2605, `Spacing` 2614, `SwapPanel` 2628, `LockPanel` 2756. Already panel-friendly: `ChairRowsPopover bare`, `BorderPanel`, `StyleFields`, `SwatchPicker`, `SeatSidesPicker`, `VesselPicker`, `BenchSidesFields`, `WaveFields`, `renderPattern`/`renderDesigns` output. No bare mode yet: every popover above, `Rotation`, `LedRailPopover` (led-popover.tsx), `CeilingClothPopover` (ceiling-cloth-bar.tsx), `MissingPieces` (missing-pieces.tsx).
**`app/(app)/studio/catalog-rail.tsx`** — `CatalogRail` 41, `aside w-64` 165; header = search + filter toggle + "+" (166–241); list: נוסף עכשיו 244 · מובנים 257 (`railBuiltIns`) · בתיק האירוע 270 · one flat "כל הקטלוג" 282–291 (`RowsCard` 412 first, then `ProductRow` 483: 44px `ProductImage` tile · name · `formatDimensions` · layer chip / "מניחים" / "מורכב" · "…" Menu); footer hint 294.
**`app/(app)/studio/stage-fill-panel.tsx`** — `StageFillState` 32, `DeckAction` 84, `PickedDeck` 110, `StageFillPanel` 131 (chips: אילו במות · פלטה/פתח · חריגה מהקו · פינות · מה ייכנס · חסר בקטלוג · מידה מדויקת · חפיפה; buttons סימון מחדש · הוספת/עדכון הבמה), `StageDrawBar` 447 (shapes + templates).
**`app/(app)/studio/scene-preview.tsx`** — `ScenePreview` 92; corner = `absolute bottom-16 end-3 z-30` with width `widthPx` and height `widthPx × 10/16`; split = a third flex column; Maximize/Minimize + ✕ 247–256; resize grip at `start-0 top-0` 257–270. Prefs `ScenePreviewPrefs {open, layout: "corner" | "split", widthPx}` in lib/studio/storage.ts 55–91.
**Data for the panel lists**
- `Placement` (lib/design-document/types.ts 110–225): `variantId`, `layer`, `quantity`, `tableId?`, `stage?`, `rows?`, `bench?`, `over?`, `groupId?`. `DesignTable` (20–94): `type`, `number`, `unnumbered?`, `seats?`, `seated?`, `variantId?`, `groupId?`.
- `resolve(variantId)` (lib/studio/catalog-resolver.ts 183) → `{ product, variant?, label, category, swatch?, … }`; group by `resolve(p.variantId)?.product.id`. `tableLabel(doc, t)` (lib/design-document/groups.ts 219), `groupSeats` 64, `groupSeated` 72, `numberedUnits` 153.
- Clearance: `ClearanceIssue {a, b, distance, required, from, to}` (lib/studio/proximity.ts 187; `a`/`b` are subject keys `"table:<id>" | "placement:<id>" | "feature:<id>"`); labels from `clearanceSubjects` (app/(app)/studio/plan-geometry.ts 248; a feature's label may be empty — fall back to `FEATURE_KIND_LABEL[kind]`).
- Missing stage pieces: `layStage(stage, deckOf).missing` (lib/design-document/stage.ts 499), `missingByShape(missing)` 726 → `{shape, info, count}`, `pieceName(info)` (lib/studio/stage-rim.ts 634).
- Seating: SS `seating` memo 3616 = `{tables, benches}` capacity; seated via `DesignTable.seated` / `groupSeated`.

## Review Focus
1. **/meeting's two passes** (`mode="hall"` and `mode="design"` inside `CanvasCard`). Expected: the same shell; the hall pass has no הלבשה verb anywhere; the end panel, quick bar and save pill fit the meeting card. Pinned in Task 13 (a meeting screenshot is not reachable headless — check `meeting-screen.tsx` compiles against the new props and that no prop it passes was removed; record that as the check).
2. **Escape inside a panel field while a tool is armed / a template is placing / the fill tool is open.** Expected: the field blurs and NOTHING else changes; the next Escape steps the chain. Pinned in Task 12's harness.
3. **Selecting a different kind while a group is open, and a list row that selects many.** Expected: each kind gets its remembered open groups; a product row selects every item of that product in that plane and the quick bar is the multi bar. Pinned in Task 2's harness (row click → "N פריטים נבחרו").
4. **A 1280px window with the panel open.** Expected: the quick bar wraps, never scrolls sideways, never covers the save pill; the view cluster, canvas strip and hint pills don't overlap. Pinned in Task 13's 1280×800 screenshot.
5. **Two renders of one Inspector.** Expected: a field typed in the panel and the same number in the quick bar stay in step (one source: the doc); popovers with local state (swap search, spacing, row spread, template name) live in ONE part only, so they never reset each other. Pinned in Task 6's harness (seats typed in the bar shows in the ישיבה group's summary).

---

## Phase 3a — the shell

### Task 1: The panel's lists, pure

**Files:**
- Create: `lib/studio/plan-list.ts`, `lib/studio/plan-checks.ts` (each with its self-check)
- Modify: `package.json` (add `"check:plan-list": "tsx lib/studio/plan-list.ts"`, `"check:plan-checks": "tsx lib/studio/plan-checks.ts"`)

**Interfaces:**
- Produces (plan-list.ts):
  - `type ListRef = { kind: "table" | "placement" | "feature"; id: string }` (structurally the studio's `SelectionRef`)
  - `interface PlanListRow { key: string; plane: Plane; label: string; count: number; meta?: string; refs: ListRef[]; venue?: boolean; swatch?: string }`
  - `planListRows(doc: DesignDocument, opts: { resolve: (variantId: string) => { product: { id: string; name: string }; swatch?: string } | undefined; venueFeatures?: { id: string; label: string }[] }): Record<Plane, PlanListRow[]>`
    - **tables:** lone tables grouped by `variantId ?? "type:" + type` (label = the product's name, else the table's type word; count = tables; meta = `"N מושבים"` summed seats); every BLOCK (`groupId` shared by tables) one row of its own (label = `tableLabel` of the block — "שולחן 4", "שולחן ראש"; meta = `"N שולחנות"`; refs = its members); rows in first-appearance order.
    - **table / floor / ceiling:** placements grouped by `(plane, product id)` where plane = `p.layer ?? "floor"`; label = product name; count = placements; meta = `"×Q"` when the summed `quantity` differs from the count; swatch = the first's `swatch`. A STAGE (`p.stage`) is a row of its own (label "במה", meta = its width × depth in metres). A placement whose variant does not resolve is grouped under label "פריט".
    - **venue features:** each of `venueFeatures` a floor row of its own with `venue: true`, refs `[{kind:"feature", id}]`.
  - `listCrumb(rows: Record<Plane, PlanListRow[]>, sel: ListRef[]): string | undefined` — `"<plane label> › <row label>"` for the row holding `sel[0]` (labels from `PLANES`), undefined when none.
- Produces (plan-checks.ts):
  - `interface CheckRow { key: string; kind: "clearance" | "missing"; text: string; refs: ListRef[] }`
  - `refOfSubject(key: string): ListRef | null` — `"table:<id>"` etc. → a ref; anything else → null.
  - `clearanceRows(issues: readonly { a: string; b: string; distance: number; required: number }[], labelOf: (subjectKey: string) => string | undefined): CheckRow[]` — text `` `${A} ↔ ${B} · ${cm(distance)} ס״מ · נדרש ${cm(required)}` `` (whole cm, rounded); refs = both subjects; a label missing → "פריט".
  - `missingRows(stages: readonly { id: string; label: string; missing: readonly { name: string; count: number }[] }[]): CheckRow[]` — one row per stage with any missing: `` `${label} · חסר בקטלוג: ${name ×count, …}` `` (`×N` only when N > 1); refs `[{kind:"placement", id}]`.

- [ ] **Step 1: Write both self-checks** (under `if (isMain(import.meta.url))`, ending `console.log("plan-list: ok")` / `console.log("plan-checks: ok")`), with a hand-built `DesignDocument` (copy the minimal shape other self-checks in lib/design-document use) and a fake `resolve`:
  - three lone round tables of one variant + one block of two rectangles (`groupId: "g"`) → `tables` has 2 rows: `{label: <product name>, count: 3}` and the block row with `refs.length === 2`, meta `"2 שולחנות"`
  - two candlesticks of one product on tables (`layer: "table"`) + one of another → `table` has 2 rows, counts 2 and 1
  - one floor rug with `quantity: 3` → meta `"×3"`
  - one stage placement 6000×4000 → a floor row labelled "במה", meta containing `"6"` and `"4"`
  - `venueFeatures: [{id:"f1", label:"בר"}]` → a floor row with `venue: true`
  - `listCrumb(rows, [{kind:"placement", id:<a candlestick>}])` → `"עיצוב שולחן › <its product name>"`
  - `clearanceRows([{a:"table:t1", b:"placement:p1", distance: 102, required: 800}], k => ({"table:t1":"שולחן 1","placement:p1":"בר"})[k])` → one row, text `"שולחן 1 ↔ בר · 10 ס״מ · נדרש 80"`, refs `[{kind:"table",id:"t1"},{kind:"placement",id:"p1"}]`
  - `refOfSubject("feature:f9")` → `{kind:"feature", id:"f9"}`; `refOfSubject("x")` → null
  - `missingRows([{id:"s1", label:"במה", missing:[{name:"רבע עיגול R180", count:2}]}])` → text `"במה · חסר בקטלוג: רבע עיגול R180 ×2"`; a stage with no missing → no row
- [ ] **Step 2: Run** `npx tsx lib/studio/plan-list.ts` and `npx tsx lib/studio/plan-checks.ts` — expect FAIL (functions not defined).
- [ ] **Step 3: Implement** both modules (pure: no React, no catalog import — `resolve` is passed in; `tableLabel` from lib/design-document/groups.ts is allowed).
- [ ] **Step 4: Run** both — expect `ok`. Add the two npm scripts; run them through npm. `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(studio): the end panel's lists — what is on the plan by plane and product, and the checks as rows`.

### Task 2: The end panel — the list and the nothing-selected groups

**Files:**
- Create: `app/(app)/studio/document-groups.tsx` — the bodies of the toolbar's three menus as panel content: `NumberingFields`, `SketchList`, `RemovedFeaturesList` (moved out of toolbar.tsx; the toolbar's menus now wrap them in their Popover until Task 3 deletes the toolbar)
- Modify: `app/(app)/studio/toolbar.tsx`, `app/(app)/studio/studio-screen.tsx`

**Interfaces:**
- Consumes: Task 1's `planListRows`, `listCrumb`, `clearanceRows`, `missingRows`, `refOfSubject`; `EndPanel`, `PanelList`, `PanelListHeading`, `PanelListRow`, `PanelListFolded`, `PanelGroups`, `PanelGroup` (components/end-panel.tsx); `PLANES`.
- Produces: `NumberingFields(props: same as NumberingMenu's minus nothing)`, `SketchList(props: SketchMenu's)`, `RemovedFeaturesList(props: RemovedFeaturesMenu's)` — the same fields with no Popover, no `close`.

- [ ] **Step 1: Harness first** — `$SHELL\studio\t2-panel.js`: open the studio; assert FAIL-able facts: an `aside[data-end-panel]` exists; it contains the four plane labels; after laying 3 × "עגול 244" and 2 × "מרובע 120×120" the panel lists a row "עגול 244" with count 3; clicking that row → the quick bar title reads "3 פריטים נבחרו" (or the block/multi bar's title — read inspector.tsx 1156 for the exact string); with nothing selected the panel shows groups titled "ישיבה", "מספור", "סקיצות שמורות"; laying two round tables touching (clearance) → a group "בדיקות" with a row containing "↔"; clicking that row selects (a bar appears). Screenshot `t2-none.png`, `t2-selected.png`. Run → FAIL.
- [ ] **Step 2: Build the panel in studio-screen:** the row becomes rail | canvas column | `<EndPanel screen="studio" collapsible>` (ScenePreview stays where it is until Task 5). Inside the panel:
  - **The list "בתוכנית"** (when nothing is selected, or `unfolded`): `PanelList title="בתוכנית" count={total}`, then per `PLANES` entry a `PanelListHeading` (label → `setActiveLayer(cur => cur === id ? null : id)`, `active = activeLayer === id`, eye → toggle `layerVisible[id]`, count = rows' counts) and its `PanelListRow`s (glyph: a swatch dot or a small lucide icon per plane; meta = `count` or `meta`; `badge="של המקום"` for venue rows; click → `setSelected(row.refs)` — D11; `selected` when every ref is selected). With `activeLayer` set, only that plane's rows show (the board's "פעילה" filter).
  - **Folded** when something is selected: `PanelListFolded icon={Layers} title="בתוכנית" count crumb={listCrumb(...)} badge={checks.length ? <warn count pill/> : undefined} onOpen={() => setUnfolded(true)}` (unfold resets when the selection changes — copy halls' `unfoldedFor` pattern).
  - **Nothing selected → `PanelGroups kind="studio:none"`** with, in order: `ישיבה` (summary `"{seated}/{seats} מושבים"` — seated = Σ `seated` over numbered units; body: the seats line, banquette seats, the table count) · `בדיקות` (`warn` when any rows; summary `"{n} בעיות"` or `"הכול תקין"`; body: one button row per `CheckRow`, click → `setSelected(row.refs)`; clearance rows from `clearance.issues` with labels from `clearance.subjects` (feature label fallback `FEATURE_KIND_LABEL`), missing rows from every stage placement's `layStage(...).missing` through `missingByShape` + `pieceName`) · `מספור` (`NumberingFields`) · `סקיצות שמורות` (`SketchList`) · `פריטי מתחם שהוסרו` (only when any; `RemovedFeaturesList`). defaultOpen `["seating","checks"]`.
  - **Something selected:** the panel shows the folded list only (the selection's groups arrive in Task 6).
  - Delete the seating chip (SS ~5838).
- [ ] **Step 3: Run** the harness → PASS. Look at both screenshots. `npm run typecheck`, `npm run check:actions`, `npm run check:plan-list`, `npm run check:plan-checks`.
- [ ] **Step 4: Commit** `feat(studio): the end panel — the plan's list by plane, and seating, checks, numbering, sketches as groups`.

### Task 3: The chrome — no header

**Files:**
- Delete: `app/(app)/studio/toolbar.tsx` (after moving what remains)
- Modify: `app/(app)/studio/studio-screen.tsx`, `app/(app)/studio/canvas-stage.tsx`

**Interfaces:**
- Consumes: `ViewCluster`, `SavePill`, `HintRow`, `HintPill` (components/canvas-chrome.tsx — read them; `SavePill` takes `state: "saving" | "saved" | "error" | "readonly"` and `onRetry`).
- Produces: `CanvasStage` gains `onUndo?`, `onRedo?`, `canUndo?`, `canRedo?`, passed straight to `PlanCanvas`.

- [ ] **Step 1: Harness first** — `$SHELL\studio\t3-chrome.js`: assert no `header` element inside the canvas card with the old toolbar (e.g. no button labelled "בטל · Ctrl+Z" outside the canvas strip); the canvas strip has `ביטול פעולה`/undo (read PlanCanvas's undo button label) enabled after laying a table, and pressing it removes the table; a save pill with "נשמר" sits in the canvas's bottom-start corner; a button labelled "תלת־ממד" (or the 3D toggle's label) in the top-start cluster; no copy/cut/paste toolbar buttons; right-click on empty canvas after Ctrl+C of a table offers "הדבקה". Screenshot `t3-shell.png`. Run → FAIL.
- [ ] **Step 2: Build:**
  - Delete the `<Toolbar>` and toolbar.tsx; `PlaneRail` goes with it (the list headings replaced it in Task 2).
  - Pass `onUndo/onRedo/canUndo/canRedo` through `CanvasStage` to `PlanCanvas` (the strip's own pair).
  - `<ViewCluster>` (top-start of the canvas column): the zone `Select` with its ScanEye (only with more than one zone, as today) and the 3D `IconButton` (Box, `pressed={scenePane.open}`, `onClick={toggleScene}`). **No venue chip** (the user's note 2).
  - `<SavePill state={saveState} onRetry={retrySave} />` bottom-start of the canvas column.
  - **No document ⋯** (note 1). Paste: keep Ctrl+V; add `{ label: "הדבקה · Ctrl+V", icon: ClipboardPaste, onSelect: paste }` to the canvas's right-click items when nothing is under the pointer and the clip is not empty (read `contextItems` / `coverMenuAt` and PlanCanvas's `contextMenuItems` contract — return it even when the selection is empty). Copy stays in the quick bar tail (Task 6+), cut in its ⋯.
  - Every top overlay that is a hint or a standing notice goes into ONE `<HintRow>` (top-[68px], centred) as `HintPill`s, in this order: venue access denied / venue unset (`tone="warn"`, the notice's own text — keep `VenueAccessNotice`/`VenueUnsetNotice` text by rendering them inside the pill or reading their copy), the proposal banner (`tone="quiet"`, with its "לסקירה" button — the pill gets `pointer-events-auto` for the button), the stage-fill draw / pick hints, the stage-tool hint, the template-placing hint, and the armed chip as a pill ("מניחים: {name} · {instruction} · הונחו N · Esc לסיום" with its ✕ button, `pointer-events-auto`). The DressingBar stays where it is (Task 12).
  - The bottom dock gets the halls dock classes (`ps-[124px]` so the bar clears the save pill).
- [ ] **Step 3: Run** the harness → PASS; look at the screenshot. typecheck, check:actions. `npx eslint` the touched files — no new errors.
- [ ] **Step 4: Commit** `feat(studio): no header — undo in the canvas strip, the view cluster, the save pill, hints in one row`.

### Task 4: The catalog rail

**Files:**
- Modify: `app/(app)/studio/catalog-rail.tsx`, `app/(app)/studio/canvas-stage.tsx` (remove "מילוי במות" from `toolbarExtras`), `app/(app)/studio/studio-screen.tsx` (pass the fill tool to the rail)

**Interfaces:**
- Produces: `CatalogRail` gains `passLabel?: string` (shown in the header), `onStageFill?: () => void`, `stageFillActive?: boolean`.

- [ ] **Step 1: Harness first** — `$SHELL\studio\t4-rail.js`: assert the rail is 272px wide; its header reads "קטלוג"; there are department headings with counts (e.g. a heading containing "שולחנות" or the tables department's label, with a number); rows have no layer chip ("רצפה"/"תקרה" text gone from the rail rows); a "מילוי במות" card exists in the rail and clicking it opens the fill tool (the hint pill for drawing an area appears); the canvas strip has no "מילוי אזור בבמות" button. Screenshot `t4-rail.png`. Run → FAIL.
- [ ] **Step 2: Build** (spec §4.1):
  - `aside w-[272px]`. Header: "קטלוג" (`text-[13px] font-bold`) · the pass name (`passLabel`, muted: "סקיצת אולם" / "סקיצה עיצובית" / none in full) · "+ מוצר" as a tint pill (`bg-accent-tint text-accent rounded-pill`) when `onAddProduct`; the search + filter button under it.
  - Sections: נוסף עכשיו · מובנים · בתיק האירוע as today; then ONE HEADING PER DEPARTMENT with its count instead of the flat "כל הקטלוג" (department = the category's group — find the category→group lookup in lib/catalog/categories.ts; order = the groups' order; names = the groups' labels).
  - Rows: a 40px tile (`ProductImage` inside, `rounded-sm bg-inset`) · name · meta (size); NO layer chip; armed = tinted row (`bg-accent-tint border-accent-line`) with a "מניחים" chip; "מורכב" chip kept for composites; the "…" menu kept.
  - Tool cards under מובנים: "שורות כיסאות" (the existing `RowsCard`) and a new "מילוי במות" card (Grid2x2Plus tile, meta "סימון אזור על התוכנית", pressed look when `stageFillActive`, click → `onStageFill`). Remove the Grid2x2Plus button from `canvas-stage.tsx`'s `toolbarExtras` (the clearance toggle stays).
- [ ] **Step 3: Run** the harness → PASS; look. typecheck, check:actions, `npm run check:built-in`.
- [ ] **Step 4: Commit** `feat(studio): the catalog rail — 272px, departments with counts, glyph rows, the fill tool as a card`.

### Task 5: The 3D card

**Files:**
- Modify: `app/(app)/studio/scene-preview.tsx`, `app/(app)/studio/studio-screen.tsx`, `lib/studio/storage.ts` (read-side only: a stored `"split"` reads as the card)

- [ ] **Step 1: Harness first** — `$SHELL\studio\t5-card.js`: press the cluster's 3D button; assert a card with the header text "תלת־ממד" whose box's top-start corner is within the canvas's top-start quarter, width ≈300px; no "פריסה" / split (Maximize2) control; its ✕ hides it (the card's box becomes invisible) and the 3D button brings it back without re-creating the WebGL canvas (the same `canvas` element: tag it with a `data-` attribute via `page.evaluate` before hiding and find it after). Screenshot `t5-card.png`. Run → FAIL.
- [ ] **Step 2: Build** (spec §4.6): the pane is a floating card in the CANVAS COLUMN, `absolute start-4 top-16 z-30` (under the view cluster), `rounded-md border border-border bg-surface shadow-floating`, a header row (Box icon · "תלת־ממד" · `CloseButton`), default width 300 (`DEFAULT_SCENE_PREVIEW.widthPx` → 300), the resize grip moved to the card's bottom-END corner. The split layout is removed (`layout` ignored; `loadScenePreview` maps a stored `"split"` to the card). Keep the three rules (settle, hide-never-unmount via `hidden`, follow the selection).
- [ ] **Step 3: Run** → PASS; look. typecheck, `npm run check:scene-focus`.
- [ ] **Step 4: Commit** `feat(studio): the 3D pane is a card under the view cluster; the split layout is gone`.

---

## Phase 3b — the selection, kind by kind

**Every task in this phase:** read `app/(app)/halls/halls-selection.tsx` first (its `G()` group helper, its `part` switch, `kindKey`, how a picker becomes a `PickRow`, how `bare` field components are used). For each kind: the quick bar is `<Bar icon title facts onClose>` with the spec §4.4 numbers → verb → `QuickTail` (copy = `onDuplicate`, delete = `onDelete`, ⋯ = the kind's `MoreMenu` sections flattened exactly as `MoreMenu` flattens them, with "גזירה" and the clipboard copy added at the top of ⋯ where the kind can be cut); the groups are `PanelGroups kind={"studio:" + kindKey}` with every chip that held fields turned into a group of the same name holding the same field components (spec §4.4: "today's Popover chips with fields become groups of the same name"), warn groups (מרחק ביטחון, ניצול שטח, חסר בקטלוג, קצוות with gaps, מעקה) marked `warn`. A chip that was a PICKER (SwapPopover, VesselPopover, the cloth Select) becomes a `PickRow` whose picker body is the old list. Rotation is `QuickTurn` in the bar (its presets need no group). Nothing a chip offered may be dropped — fold it, never cut it.

### Task 6: The seam, the table and the block

**Files:**
- Modify: `app/(app)/studio/inspector.tsx`, `app/(app)/studio/studio-screen.tsx`

**Interfaces:**
- Produces: `Inspector` takes `part: "bar" | "groups"`; `type InspectorProps` exported; studio-screen builds ONE `inspectorProps: InspectorProps` object (move the inline JSX attributes at SS ~5668–5831 into it, unchanged) and renders `<Inspector part="bar" {...inspectorProps} />` in the dock and `<Inspector part="groups" {...inspectorProps} />` in the end panel under the folded list (only when something is selected or a scope is active). Unconverted kinds: `part="groups"` → null, `part="bar"` → today's bar.
- Group memory kinds: `studio:table`, `studio:block`.

- [ ] **Step 1: Harness first** — `$SHELL\studio\t6-table.js`: lay 2 × "עגול 244"; select table 1; assert the quick bar has number fields labelled for the table number and the seats and an angle field, a "הלבשה" verb (full mode), and a ⋯ as the LAST button; the panel has groups titled "שולחן", "ישיבה", "מידות", "מפה" (only with a cloth — skip), "עיצובי שולחן", "מראה"; typing 12 into the bar's seats field and Tab → the ישיבה group's summary contains "12"; open ⋯ → it holds "גזירה" and "העתקה"; group the two tables (select both, Ctrl+G) and select the block → its bar shows "פירוק הבלוק" and its panel a group "שולחנות בבלוק" with two rows; clicking a member row opens dressing focus (the DressingBar's title appears). Screenshots `t6-table.png`, `t6-block.png`. Run → FAIL.
- [ ] **Step 2: Build the seam** (props object, `part`, the two renders). Run typecheck — the screen must behave exactly as before for every kind.
- [ ] **Step 3: Convert the TABLE** (spec §4.4 row "Table"):
  - Bar: `QuickNumber` מס׳ (table number; disabled with "—" when unnumbered) · `QuickNumber` מושבים (seats) · `QuickTurn` · `ModeVerb` הלבשה (PaintRoller; only when `onDressTable`) · `QuickTail`.
  - Groups (in this order, warn first): מרחק ביטחון ⚠ (the BreachPopover's list) · ניצול שטח ⚠ (only when overflowing) · שולחן (PickRow → the table-type SwapPopover list; the number field + `DuplicateNumber` + `UnnumberedSwitch`) · ישיבה (seats, chair `Select`, seated, `SeatSidesPicker`, "חזרה להגדרת הקטלוג") · מידות (SizePopover's fields) · מפה (only with a cloth: PickRow → the cloth options; `SwatchPicker`; `BorderPanel`; "על כל השולחנות"; "הסרת המפה") · עיצובי שולחן (`renderDesigns`) · דפוס (only with items on it: `renderPattern`) · מראה (`StyleFields`). defaultOpen `["seating","cloth"]`. ⋯ = today's table MoreMenu sections.
- [ ] **Step 4: Convert the BLOCK** (spec row "Block"):
  - Bar: מס׳ (group number) · מושבים (group seats) · `QuickTurn` · `ModeVerb` פירוק הבלוק (Ungroup → `onUngroup`) · `QuickTail`.
  - Groups: שולחנות בבלוק (one row per member — "שולחן N · type" — click → `onDressTable(memberId)`, D13; only when `onDressTable`, else plain rows) · ישיבה · מפה · עיצובי שולחן · דפוס · מראה; plus שולחן (the swap PickRow + number fields) where the block bar had them. defaultOpen `["members","seating"]`.
- [ ] **Step 5: Run** the harness → PASS; look at both screenshots. typecheck, check:actions.
- [ ] **Step 6: Commit** `feat(studio): the selection is a quick bar and panel groups — the seam, the table and the block`.

### Task 7: The stage, the stages group and the stage edge

**Files:** Modify `app/(app)/studio/inspector.tsx` (and `missing-pieces.tsx` for a `bare` mode)

- Group memory kinds: `studio:stage`, `studio:stages`, `studio:edge`.

- [ ] **Step 1: Harness first** — `$SHELL\studio\t7-stage.js`: open the fill tool (the rail's "מילוי במות" card), draw a rectangle (4 taps + the first point again, or Enter — read `canvas-stage.tsx` `drawArea`), commit "הוספת הבמה"; select the stage; assert the bar has width/depth fields, a height field, an angle field, a "עריכת הפלטות" verb, ⋯ last; the panel has groups "קצוות" (warn — a new stage has bare edges), "בנויה מ", "גובה ומפלסים", "משטח", "תבנית"; in קצוות click the add-stairs button then a side → an edge item is selected → its bar shows "רוחב" and the ✕ goes back to the stage; panel groups "סוג", "מיקום". Screenshots `t7-stage.png`, `t7-edge.png`. Run → FAIL.
- [ ] **Step 2: Convert the STAGE** — bar: W×D (two `QuickNumber`s with "×", one measurement) · גובה · `QuickTurn` · `ModeVerb` עריכת הפלטות (`onEditStage`) · `QuickTail`. Groups: קצוות ⚠ (summary, corners `Segmented`, fill buttons, add-edge buttons) · חסר בקטלוג ⚠ (`MissingPieces` content, bare) · מרחק ביטחון ⚠ · בנויה מ (deck list, skirt, exceed) · גובה ומפלסים (height, riser, tread, levels, "הוספת מפלס מוגבה") · משטח · מעקה ⚠ · תבנית (SaveTemplatePopover's field + save). "חזרה לקבוצת הבמות" (when `onBackToGroup`) is the bar's first item as a `BarButton`. defaultOpen `["edges","built"]`.
- [ ] **Step 3: Convert the STAGES GROUP** — bar: W×D (whole, read-only facts if not editable) · גובה · `QuickTurn` · `ModeVerb` איחוד לבמה אחת (`onMergeStages`) · tail; the הצמדה and AlignMenu go into the ⋯ (separated section). Groups: as the stage's (קצוות, משטח, מידות, בנויה מ, מעקה, תבנית) plus במה בודדת (one row per member → `onPickStage`). defaultOpen `["edges","members"]`.
- [ ] **Step 4: Convert the STAGE EDGE** — bar: רוחב (`QuickNumber`) · מדרגות (risers) or מושבים (a bench's seats) · delete in the tail (no copy); ✕ = `onSelectEdge(null)` (back to the stage). Groups: סוג (the 5-kind `Segmented`) · מיקום (outer / inner) · מדרגות (risers, back-to-auto) or בנקט (`BenchSidesFields` + depth). defaultOpen `["kind","place"]`.
- [ ] **Step 5: Run** → PASS; look. typecheck, check:actions, `npm run check:stage`.
- [ ] **Step 6: Commit** `feat(studio): the stage, the stages group and the stage edge as quick bar + groups`.

### Task 8: The design item (general)

**Files:** Modify `app/(app)/studio/inspector.tsx`

- Group memory kinds: `studio:item` (on a table / on the floor), `studio:ceiling` (an overhead item that is not on a rail).

- [ ] **Step 1: Harness first** — `$SHELL\studio\t8-item.js`: lay "עגול 244", then a candlestick or centrepiece from the rail onto it (find a design row by searching the rail — e.g. type "פמוט" in the rail search; if the base catalog has none, use "שטיח" on the floor for the floor path and "בד תקרה"/a chandelier row for the ceiling path — record what you used); select it; assert the bar has a size % (or quantity) field, an angle field, ⋯ last; panel groups "פריט" (a PickRow with "החלפה") and "גוון" where the product has shades; for the ceiling path, the bar has "גובה תלייה". Screenshots `t8-item.png`, `t8-ceiling.png`. Run → FAIL.
- [ ] **Step 2: Convert** (spec rows "Design item" and "Ceiling item") — bar: גודל % (`ScalePopover`'s number as a `QuickNumber`, or the ×N quantity stepper when the item counts) · `QuickTurn` (hidden for a cover) · `ModeVerb` הלבשה when on/over a table (`onDressTable`) · `QuickTail`. Ceiling: גובה תלייה (`QuickNumber`, cm) · `QuickTurn` · tail. Groups: מרחק ביטחון ⚠ · פריט (PickRow → the SwapPopover list) · גוון (`SwatchPicker`) · כלי (PickRow → `VesselPicker`) · קונטור (`BorderPanel`) · גודל על התוכנית (ScalePopover's presets + field) · מידות (SizePopover) · דפוס / מעל שולחנות (the "החלת הפריט על/מעל שולחנות" `renderPattern`, `RowSpreadPopover`'s fields, "אחד מעל כל פריט") · מראה where the old bar had it. defaultOpen `["item","shade"]` (ceiling `["hang","item"]` with a תלייה group holding HangPopover's fields).
- [ ] **Step 3: Run** → PASS; look. typecheck, check:actions.
- [ ] **Step 4: Commit** `feat(studio): design items and ceiling items as quick bar + groups`.

### Task 9: The special items — banquette, chair rows, climb, cover, rug, rails

**Files:** Modify `app/(app)/studio/inspector.tsx`, `app/(app)/studio/led-popover.tsx`, `app/(app)/studio/ceiling-cloth-bar.tsx` (a `bare` mode each, as halls' `VenueLedPopover bare`)

- Group memory kinds: `studio:bench`, `studio:rows`, `studio:climb`, `studio:cover`, `studio:rug`, `studio:rail`.

- [ ] **Step 1: Harness first** — `$SHELL\studio\t9-special.js`: lay and select in turn: the "שורות כיסאות" card (bar: rows × per-row numbers; panel group "שורות"), "בנקט לבמה" (bar: מספר; groups "ישיבה", "גובה"), "מדרגות במה 100" (bar: rise; group "מדרגות"), "שטיח" (bar: W×D; group "גודל ופינות"), "וילון" near a wall / "פס לד" (bar: a read-only length, a height/drop number, "ציור על מוט" verb; group "מסילה"). Assert each; screenshot each `t9-<kind>.png`. Run → FAIL.
- [ ] **Step 2: Convert** (spec row "Chair rows · banquette · cover · rug · climb" and "Drape / LED / cloth on a rail"): each kind leads its bar with the 2–3 numbers its bar already led with (rows×per row; number; inset; W×D; rise) then tail; its popovers become one group each (שורות = `ChairRowsPopover bare`; ישיבה + גובה + מספר for the banquette; "על <name>" for a cover with inset + "ניתוק מהמשטח"; גודל ופינות for a rug — W×D, all-corners radius, per-corner fields, bows note; מדרגות / רמפה = ClimbPopover's fields). Rails: bar = length (read-only `QuickUnit` text, D14) · drop or height (`QuickNumber`) · `ModeVerb` ציור על מוט (`onDrawRod`) or the cloth's draw verb · tail; groups מסילה (DrapeRailPopover / `LedRailPopover bare` / `CeilingClothPopover bare` fields) · פריט · גוון · מראה.
- [ ] **Step 3: Run** → PASS; look. typecheck, check:actions, `npm run check:chair-rows`, `npm run check:rail`.
- [ ] **Step 4: Commit** `feat(studio): banquettes, chair rows, climbs, covers, rugs and rails as quick bar + groups`.

### Task 10: Several things, a venue feature, and the scope bar

**Files:** Modify `app/(app)/studio/inspector.tsx`

- Group memory kinds: `studio:multi`, `studio:feature`.

- [ ] **Step 1: Harness first** — `$SHELL\studio\t10-multi.js`: lay 3 × "עגול 244", Ctrl+A; assert the bar has an angle field, an "יישור" menu chip, a spacing control ("מרווח"), a "קיבוץ" verb, ⋯ last; groups "ישיבה" (bulk chairs), "סיבוב"; with a zone/layer scope active and nothing selected (click a plane heading's label in the list) the bar is "בחירה". Screenshot `t10-multi.png`. (A movable venue feature needs a venue with one; Amare's bars are movable — if the scratch drawing over Amare shows one, select it and assert "החזרה למקום"; otherwise record that the feature path was checked by reading only.) Run → FAIL.
- [ ] **Step 2: Convert** — MULTI: bar `QuickTurn` · `AlignMenu` (chip) · מרווח (SpacingPopover stays a small popover from the bar — it is a tool, not a field set — or a `QuickNumber` gap + axis in a group; pick one and ledger it) · `ModeVerb` קיבוץ (`onGroup`) · tail (⋯ = today's multi MoreMenu). Groups: ישיבה (bulk seats + chair) · העתקת עיצוב (the copied-dressing chip's fields, with its ConfirmDialog) · מפה where the selection is tables with cloths · סיבוב (spin mode: around a shared centre / each around itself) · מראה. VENUE FEATURE: bar `QuickTurn` · `ModeVerb` החזרה למקום (`onResetFeature`, disabled unless moved) · delete as "הסרה מהסקיצה"; groups פריט של המתחם (the note) · (curtain) החלפה בווילון (PickRow → the curtain swap list). SCOPE BAR "בחירה": unchanged in the bar (`part="groups"` → null).
- [ ] **Step 3: Run** → PASS; look. typecheck, check:actions, `npm run check:align`.
- [ ] **Step 4: Commit** `feat(studio): several things, venue features and the scope bar as quick bar + groups`.

---

## Phase 3c — the modes

### Task 11: The stage fill tool

**Files:** Modify `app/(app)/studio/stage-fill-panel.tsx`, `app/(app)/studio/studio-screen.tsx`

**Interfaces:**
- Produces: `StageFillPanel` takes `part: "bar" | "groups"` (rendered twice like the Inspector); `StageDrawBar` unchanged in shape, restyled as the drawing bar.

- [ ] **Step 1: Harness first** — `$SHELL\studio\t11-fill.js`: open the fill tool from the rail; assert the dock shows the drawing bar (shape choices as a compact `SegmentedToggle` or tiles, "ביטול"); draw a rectangle; assert the bar shows the build's facts, "סימון מחדש", "ביטול", and a primary "הוספת הבמה"; the end panel shows groups "אילו במות", "חריגה מהקו", "פינות", "מה ייכנס" (and "חסר בקטלוג" / "מידה מדויקת" / "חפיפה" when they apply); Escape closes the tool. Screenshots `t11-draw.png`, `t11-pick.png`. Run → FAIL.
- [ ] **Step 2: Build** (spec §4.5) — the pick phase's quick bar: facts (what it will build) · `ModeVerb`/ghost סימון מחדש · ghost ביטול · primary הוספת / עדכון הבמה · N פלטות; its chips become end-panel groups (`PanelGroups kind="studio:fill"`): אילו במות · פלטה / פתח (when a deck is picked or pinned) · חריגה מהקו · פינות · מה ייכנס · חסר בקטלוג ⚠ · מידה מדויקת · חפיפה ⚠. While the tool is open the panel shows these groups instead of the selection's (the list stays folded above). The draw phase's `StageDrawBar` is the drawing bar (WallDrawBar's look: title, the shape choice, templates, ביטול).
- [ ] **Step 3: Run** → PASS; look. typecheck, check:actions, `npm run check:stage-fill`, `npm run check:deck-move`.
- [ ] **Step 4: Commit** `feat(studio): the stage fill tool as a drawing bar and panel groups`.

### Task 12: Dressing focus and the keys

**Files:** Modify `app/(app)/studio/studio-screen.tsx`, `app/(app)/studio/dressing-bar.tsx` (position only)

- [ ] **Step 1: Harness first** — `$SHELL\studio\t12-keys.js`:
  - lay a table, double-click it → the DressingBar sits in the hint row's place (top ≥ 60px from the canvas top, centred) and does not overlap the canvas strip or the view cluster;
  - Escape leaves focus;
  - arm "עגול 244", click into a panel field (e.g. numbering's start field), press Escape → the field loses focus AND the arm is still on (the armed hint pill is still there); Escape again → disarmed;
  - select a table, Ctrl+D → two tables more than before? exactly one more table (the bar's copy);
  - Delete with focus in a panel field does not delete the selection.
  Run → FAIL (the armed listener disarms from inside a field; Ctrl+D does nothing).
- [ ] **Step 2: Build:**
  - DressingBar: `absolute inset-x-3 top-[68px]` centred (the hint row's line); the armed pill sits under it while dressing (it is in the HintRow since Task 3 — make the row stack under the dressing bar).
  - Escape is FIELD-FIRST everywhere: the capture listeners for `placing`, `armedId` and the stair tool return early when `isTypingTarget()` (blur the field instead: `(document.activeElement as HTMLElement).blur()`), and the main handler's Escape branch starts with `if (e.defaultPrevented) return; if (isTypingTarget()) { blur; return; }`.
  - Ctrl+D (`isShortcut(e, "d")` with mod, not typing, not in the fill tool's deck handling) duplicates the selection exactly as the quick bar's copy button (`onDuplicate`).
- [ ] **Step 3: Run** → PASS. typecheck, check:actions.
- [ ] **Step 4: Commit** `feat(studio): dressing focus on the hint row; Escape field-first; Ctrl+D duplicates`.

### Task 13: Docs, the board's states, the prop audit

**Files:** Modify `CLAUDE.md`, `DESIGN.md` (only where the board added a rule)

- [ ] **Step 1: The prop audit** — list every prop of `InspectorProps`, `StageFillPanel`'s props and the deleted Toolbar's props; for each name where it is now READ in the new parts (`grep`), and write the table to `$SHELL\studio\t13-audit.md`. Any prop read nowhere is a finding: give it a home (a group, the bar, the ⋯) before continuing.
- [ ] **Step 2: Screenshots of the board's states** — `$SHELL\studio\t13-states.js` at 1440×900: S1 nothing selected (the list, ישיבה/בדיקות); S2 a table selected; S3 a stage selected; S4 a design item on a table; S5 several selected; S6 the fill tool. And one at 1280×800 with the panel open and a table selected (Review Focus 4). Look at each; record differences from the board in `$SHELL\studio\t13-diff.md` (the board's studio frames are in `$SHELL\..\design\anatomy.html` — search "S1"…"S6").
- [ ] **Step 3: /meeting** — read `app/meeting/meeting-screen.tsx`: it must compile against `StudioScreen`'s props and pass nothing removed (Review Focus 1). typecheck.
- [ ] **Step 4: CLAUDE.md** — rewrite the studio parts of the Design System Guidelines for the shell: the THE SHELL bullet says the studio is built (no header; PlaneRail gone — the list headings are the planes; the 3D card; the fill tool on the rail; no ⋯; Inspector rendered twice); the "studio toolbar's four planes" bullet becomes the list headings' rule (two presses kept apart); the "Every selection bar on the sketch reads in ONE order" bullet re-stated for quick bar + groups (what is wrong → what it is → design → …, now group order with warn first); the 3D pane bullet: a card, no split. Keep everything else.
- [ ] **Step 5:** typecheck, check:actions, check:costs. Commit `docs(claude): the studio shell`.
