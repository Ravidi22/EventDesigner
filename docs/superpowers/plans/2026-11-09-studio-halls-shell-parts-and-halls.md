# Studio + Halls Shell — Plan 1: Shared Parts + Halls

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the board's shared shell parts (quick bar, end panel, pickers, canvas chrome, tool tiles, modal frame), move the shape editor onto them, then rebuild /halls as one card: rail · canvas · end panel.

**Architecture:**
- The shape editor (`app/(app)/catalog/appearance-modal.tsx`) already is the board's shell; its inline pieces are lifted into shared components, and the editor is the first consumer.
- /halls is then rebuilt around them. `SelectionBar` becomes `HallsSelection`, rendered TWICE with `part="bar"` (the quick bar) and `part="groups"` (the end panel). That way every derived value and hook stays in one component per selection kind.
- Nothing stored changes, except that the zone dialog edits `Zone.style.fill`.

**Tech Stack:** Next.js (this repo's version; read `node_modules/next/dist/docs/` before touching routing), React, TypeScript, Tailwind v4 tokens in `app/globals.css`, lucide-react. Self-checks are `tsx` scripts guarded by `isMain(import.meta.url)` (lib/self-check), wired as `npm run check:*`.

**Spec:** [docs/superpowers/specs/2026-11-09-studio-halls-shell-design.md](../specs/2026-11-09-studio-halls-shell-design.md). Read §1–§3 and §9 before any task. The Studio half (spec §4) is Plan 2, written after Ravid has seen this one.

## Global Constraints
- **RTL-first:** logical properties only (`ms-/me-/ps-/pe-`, `start/end`, `border-s/border-e`). Never `left/right` for flow spacing.
- **Tokens as-is:**
  - radii: `rounded-sm` 8, `rounded-md` 14, `rounded-lg` 22, `rounded-pill`
  - shadows: `shadow-floating`, `shadow-lifted`, `shadow-dialog`
  - colours: `bg-surface`, `bg-inset`, `border-border`, `border-border-soft`, `text-accent`, `bg-accent-tint`, `bg-accent-wash`, `border-accent-line`, `text-warn-ink`, `bg-warn-tint`
- **No new stored data.** Board fields the model lacks — sliding door, wall thickness, guest entrance, wall look, "+ שולחן לבלוק" — are NOT built (spec §10).
- **Fields live in end-panel groups.** Popovers are pickers (`variant="picker"`, 336px) or menus only (spec §2.3).
- **Quick bar row 2 order:** at most 3 numbers → one `ModeVerb` → `QuickTail` (copy · delete · ⋯, ⋯ last).
- **Every key handler matches by physical key** through `isShortcut` (Hebrew layout safe).
- **Canvas speed rules** (CLAUDE.md "The camera is a transform"): no setState per pointermove, no fresh closures/objects as memoised node props.
- **Verification:**
  - `npm run typecheck` after every task (a Stop hook also runs it)
  - `npm run check:actions` and the `check:*` of any `lib/` module a task edits
  - commit after every task

## Review Focus
1. **A halls viewer (read-only role) opens a venue.** Expected: no rail, no quick-bar verbs, groups' fields disabled, the save pill says "צפייה בלבד", keys do nothing. Pinned in Task 13 step 2 (the viewer run).
2. **A narrow canvas: the end panel collapsed, the window at 1280px.** Expected: the quick bar wraps and never scrolls sideways; the save pill and quick bar do not overlap. Pinned in Task 13 step 3 (a 1280×800 screenshot).
3. **Escape with a picker open from a panel group.** Expected: only the picker closes; the selection stays. Pinned in Task 4's harness step.
4. **Selecting a different kind while a group is open.** Expected: the new kind gets ITS remembered open groups; coming back restores the first kind's. Pinned in Task 1's self-check (`createGroupMemory`).
5. **A wall with no openings / a venue with no walls.** Expected: the פתחים group says "אין פתחים" with + דלת / + חלון; the rail's opening tiles are disabled with their reason in `title`. Pinned in Task 8's check (`openingsOn` → `[]`) and Task 6's harness step (the disabled tile).

---

## Phase 1 — Shared parts

### Task 1: Group order and memory (pure)

**Files:**
- Create: `lib/studio/panel-groups.ts` (with its self-check)
- Modify: `package.json` (add `"check:panel-groups": "tsx lib/studio/panel-groups.ts"`)

**Interfaces:**
- Produces:
  - `orderGroups<T extends { key: string; warn?: boolean }>(groups: readonly T[]): T[]` — warn groups first; otherwise the given order, stable.
  - `type OpenGroups = Record<string, boolean>`
  - `createGroupMemory(): GroupMemory` where `GroupMemory = { get(kind: string, defaults?: readonly string[]): OpenGroups; toggle(kind: string, key: string, defaults?: readonly string[]): OpenGroups; open(kind: string, key: string): void; subscribe(listener: () => void): () => void }`
    - `open` sets a key true without toggling (the document ⋯ uses it).
    - `toggle` and `open` notify subscribers, so a mounted `PanelGroups` follows through `useSyncExternalStore`.
  - `const groupMemory: GroupMemory` — the module-level instance the panels share for the session.

- [ ] **Step 1: Write the self-check** under `if (isMain(import.meta.url))`:
  - `orderGroups([{key:"a"},{key:"b",warn:true},{key:"c"},{key:"d",warn:true}])` → keys `b,d,a,c`
  - `orderGroups([])` → `[]`
  - with `const m = createGroupMemory()`:
    - `m.get("table", ["cloth"])` → `{cloth:true}`
    - `m.toggle("table","seats",["cloth"])` → `{cloth:true, seats:true}`
    - `m.get("stage")` → `{}`
    - `m.get("table")` still has `seats:true` (a kind keeps its own)
    - `m.toggle("table","cloth")` → `cloth:false`
    - a subscriber counting calls: after `m.open("stage","edges")` and one `m.toggle(…)`, the count is 2, and `m.get("stage").edges === true`
    - after unsubscribing, further calls do not count
  - Ends with `console.log("panel-groups: ok")`.
- [ ] **Step 2: Run** `npx tsx lib/studio/panel-groups.ts` — expect it to fail (the functions don't exist yet).
- [ ] **Step 3: Implement.** Defaults apply only the first time a kind is read; after that the stored record wins.
- [ ] **Step 4: Run** `npm run check:panel-groups` → `panel-groups: ok`.
- [ ] **Step 5: Commit** `feat(shell): group order and per-kind memory for the end panel`.

### Task 2: Quick-bar pieces + the shape editor's bar on them

**Files:**
- Modify: `components/inspector-bar.tsx` (add pieces; keep `Bar`, `BarButton`, `Rotation`, `PanelRow`, `Note`, `ltr`, `Actions`)
- Modify: `app/(app)/catalog/appearance-modal.tsx`
  - `ShapeQuickBar` (~1246–1333)
  - delete its local `BarNumber`/`BarSep`/`BarUnit` (~1237–1241)

**Interfaces:**
- Consumes: `Menu`, `MenuItem` (components/menu.tsx), `NumberField` (`size="sm"`, `commitOnBlur`).
- Produces (all in `components/inspector-bar.tsx`):
  - `QuickNumber({ label, value, onChange, decimals?, min?, max?, narrow?, placeholder?, hideZero?, disabled? })`
    - `NumberField size="sm" commitOnBlur`
    - width `w-14` (56px); `narrow` = `w-11` (44px)
    - `aria-label=label`
  - `QuickUnit({ children })` — `text-xs text-muted`
  - `QuickSep()` — `mx-0.5 h-6 w-px bg-border`
  - `QuickLead({ icon, label })` — a muted 16px icon with `title=label`
  - `ModeVerb({ icon, label, onClick, active? })`
    - outline pill `h-[30px] rounded-pill border-[1.5px] border-accent-line px-3 text-[13px] font-bold text-accent`
    - `active` → `bg-accent-wash`, `aria-pressed`
  - `QuickTail({ onCopy?, copyLabel?, onDelete?, deleteLabel?, deleteDisabled?, more?: MenuItem[], moreLabel? })`
    - renders `ms-auto` · `InspectorDivider` · Copy `BarButton` (if `onCopy`) · Trash `BarButton tone="danger"` (if `onDelete`) · `<Menu side="top">` (if `more?.length`)
    - **⋯ is LAST**

- [ ] **Step 1: Add the six pieces** to `components/inspector-bar.tsx`, each with a one-line doc comment saying what the board calls it.
- [ ] **Step 2: Move `ShapeQuickBar` onto them.**
  - `BarNumber` → `QuickNumber`, `BarSep` → `QuickSep`, `BarUnit` → `QuickUnit`.
  - The trailing `<Menu …items={more}/>` + `<Actions …/>` become ONE `<QuickTail onCopy={onDuplicate} copyLabel="שכפול הצורה · Ctrl+D" onDelete={onRemove} deleteLabel="מחיקת הצורה · Delete" more={more} moreLabel="עוד פעולות לצורה" />`.
- [ ] **Step 3: Run** `npm run typecheck` → no errors; `npm run check:shape-list` → ok.
- [ ] **Step 4: Commit** `feat(shell): quick-bar pieces; the shape editor's bar ends copy · delete · ⋯`.

### Task 3: End panel + the shape editor's side panel on it

**Files:**
- Create: `components/end-panel.tsx`
- Modify: `lib/studio/storage.ts` (add `loadEndPanelOpen`, `saveEndPanelOpen`)
- Modify: `app/(app)/catalog/appearance-modal.tsx`
  - the `<aside className="… w-[296px] …">` (~2351)
  - its "צורות בפריט" list (~2353–2395)
  - its section label (~2398–2408)

**Interfaces:**
- Consumes: `FoldRow` (components/fold-row.tsx, `variant="panel"`); `orderGroups`, `groupMemory` (Task 1).
- Produces (components/end-panel.tsx):
  - `interface PanelGroup { key: string; icon: LucideIcon; title: string; summary: ReactNode; warn?: boolean; body: ReactNode }`
  - `EndPanel({ screen: "studio" | "halls" | "editor", collapsible?: boolean, children })`
    - `w-[296px] shrink-0 flex-col border-s border-border bg-surface`, a `scroll-slim` body
    - when `collapsible`: a round puck on its inner edge (the `SidePanel` puck look: `bg-surface shadow-puck`, ChevronsLeft/Right by direction)
    - collapsed = the puck alone (`w-0`); the open state comes from `loadEndPanelOpen(screen)` in an effect (null until loaded = open)
  - `PanelList({ title, count?, children })` — `px-3 pb-2.5 pt-3`; heading `text-xs font-semibold text-muted` + count `nums text-quiet`
  - `PanelListHeading({ label, count?, active?, visible?, onActivate?, onToggleVisible? })`
    - h-7; the label is a button (`font-bold text-accent` when active, else `font-semibold text-ink-soft`)
    - a "פעילה" `bg-accent-wash` badge when active, then the count, a `flex-1 h-px bg-border-soft`
    - an eye button (`Eye`/`EyeOff`, `text-quiet`, `aria-pressed`)
  - `PanelListRow({ glyph, label, meta?, badge?, selected?, onClick?, trailing? })`
    - h-[34px] `rounded-sm px-1.5`, selected `bg-accent-tint`
    - a 26px `bg-inset` glyph tile; the badge is an `border-accent-line` pill
  - `PanelListFolded({ icon, title, count?, crumb?, badge?, onOpen })`
    - one 36px `rounded-sm border-inset-border bg-inset` row: icon · title · count · crumb (end-aligned, truncated) · ChevronDown
  - `PanelGroups({ kind, title, sub?, note?, groups: PanelGroup[], defaultOpen?: string[] })`
    - a header `px-4 pb-2 pt-3` (title 13/700, sub 12 muted), an optional note
    - then `orderGroups(groups)` as `FoldRow variant="panel"`
    - open state from `groupMemory.get(kind, defaultOpen)` read through `useSyncExternalStore(groupMemory.subscribe, …)`, so an `open()` from elsewhere shows at once
    - **cache the snapshot per kind** (`useSyncExternalStore` needs a stable object until something changed)
    - a warn group's icon and summary in `text-warn-ink` — add an optional `tone?: "warn"` prop to `FoldRow`
  - `PickRow({ swatch?, glyph?, name, meta?, pickerLabel, children })`
    - the board's B.pick: a `rounded-md border-inset-border bg-inset p-2` row
    - the picker is `<Popover variant="picker" trigger="pill" triggerText="החלפה" side="beside" label={pickerLabel}>{children}</Popover>` (Task 4)
- `lib/studio/storage.ts`:
  - `loadEndPanelOpen(screen: string): boolean | null`
  - `saveEndPanelOpen(screen: string, open: boolean): void`
  - key `storageKey("shell.end-panel." + screen)`, try/catch like `loadScenePreview`

- [ ] **Step 1: Add the storage pair** next to the scene-preview prefs.
- [ ] **Step 2: Write `components/end-panel.tsx`**, plus `FoldRow`'s `tone`. `PickRow` lands in Task 4, after the picker variant exists.
- [ ] **Step 3: Move the shape editor onto it.**
  - The `<aside>` → `<EndPanel screen="editor">`.
  - "צורות בפריט" → `PanelList` + `PanelListRow` (keep its click/shift logic, the בסיס and repeat badges, `sizeLabel` as meta).
  - The section label → `PanelGroups`' header. The editor's groups STAY its own `FoldRow`s: `ShapePanel` keeps rendering them, so only the shell and the list move.
- [ ] **Step 4: Run** `npm run typecheck`.
- [ ] **Step 5: Run a headless look at the editor** (memory `headless-browser-check`: supplier `buki@bukiflowers.dev`, `/catalog` → a card → "עריכת המראה על התוכנית").
  - Screenshot to `…/scratchpad/shell/editor-panel.png`.
  - Expected: it looks as before (same 296px panel, same rows).
- [ ] **Step 6: Commit** `feat(shell): the end panel; the shape editor's panel is the first one`.

### Task 4: Picker popovers + tool tiles

**Files:**
- Modify: `components/popover.tsx`
- Create: `components/tool-tile.tsx`
- Modify: `components/end-panel.tsx` (add `PickRow`)
- Modify: `app/(app)/catalog/appearance-modal.tsx`
  - `ShapeQuickBar`'s "צורה" Popover
  - `ShapeRail` (~526–572)

**Interfaces:**
- Produces:
  - **`Popover` gains three props:**
    - `variant?: "panel" | "picker"` — picker = `w-[336px]` unless `panelClassName` is given, header `h-12`
    - `trigger?: "chip" | "icon" | "pill"` — `pill` = the `ModeVerb` look with `triggerText`
    - `triggerText?: string`
  - **`side?: "top" | "bottom" | "beside"`.** `beside` puts the panel's inline-END edge 8px before the trigger's closest `[data-end-panel]` ancestor's inline-START edge (into the canvas), level with the trigger's top, then clamps as today. `EndPanel` sets `data-end-panel`.
  - **`ToolTile({ icon?, swatch?, label, title?, armed?, disabled?, onClick, dragId? })`**
    - the editor's tile: `h-[58px] rounded-sm border` · 18px icon or swatch · `text-[11px]` truncated label
    - armed = `border-accent bg-accent-tint`; disabled = `opacity-40 cursor-not-allowed`
    - `draggable` with `dataTransfer "text/plain" = dragId` when given
  - **`ToolGrid({ label, children })`** — the `text-xs font-semibold text-muted` label over a `grid grid-cols-3 gap-1`.

- [ ] **Step 1: Implement the Popover additions.** Escape stays captured exactly as today.
- [ ] **Step 2: Write `components/tool-tile.tsx`** and `PickRow`.
- [ ] **Step 3: Move the editor onto them.**
  - `ShapeRail`'s grid → `ToolGrid label="צורות"` + `ToolTile`s (keep `onDragStart` data via `dragId`).
  - "צורה" in `ShapeQuickBar` → `variant="picker"`, closing on pick: `{(close) => <ShapeGrid … onPick={(s) => { onReshape(s); close(); }} />}`.
- [ ] **Step 4: Run** `npm run typecheck`.
- [ ] **Step 5: Headless check** (Review Focus 3).
  - In the editor, select a shape, open צורה, press Escape. Expected: the picker is gone AND the shape is still selected (its quick bar still shows).
  - Then pick a shape. Expected: the picker closes and the shape changes.
  - Screenshot `…/shell/editor-picker.png`.
- [ ] **Step 6: Commit** `feat(shell): picker popovers and tool tiles; the editor's rail and shape grid use them`.

---

## Phase 2 — Halls

### Task 5: The halls rail (sections pure, tiles from the flyout's logic)

**Files:**
- Modify: `lib/venues/add-tools.ts`
  - add `railSections`
  - move `DRAW_SURFACE` here from halls-screen (~266) as `DRAW_SURFACE_ID = "surface:draw"`
  - extend its self-check
- Create: `app/(app)/halls/halls-rail.tsx`
- Modify: `app/(app)/halls/halls-screen.tsx` — export nothing new yet; the rail is mounted in Task 6

**Interfaces:**
- Produces:
  - `interface RailSection { section: AddToolSection; label: string; tools: AddTool[] }`
  - `railSections(tools: readonly AddTool[]): RailSection[]` — `ADD_TOOL_SECTIONS` order, empty sections dropped, each tool exactly once
  - `toolTileState(tool: AddTool, structure: VenueStructure): { title: string; disabled: boolean }` — exported from halls-rail.tsx. This is the per-tool title/disabled logic now inline in the flyout's items (halls-screen ~1852–1884): entrance, window and curtain are disabled with no `kind === "wall"` walls.
  - `HallsRail({ tools, structure, armedId, drawingWalls, onDrawWalls, onNewZone, onPick })`
    - `aside w-[232px] border-e`
    - two 40px `rounded-md` buttons: "שרטוט קירות" (PenLine, a `W` kbd hint, pressed while drawing) and "אזור חדש" (SquareDashed)
    - then one `ToolGrid` per `railSections` entry
    - a `DRAW_SURFACE_ID` tile ("ציור חופשי", PenLine) first in the ground section
    - ground tiles pass `swatch` (the surface's colour from `ADD_TOOL_PREVIEW` / `SURFACE_MATERIALS`); others pass `icon={ADD_TOOL_ICON[addToolIconKey(tool)]}` (components/venue-inspector.tsx)
    - `onPick(id: string)` is the flyout's `onPick` contract unchanged

- [ ] **Step 1: Extend the self-check** of `lib/venues/add-tools.ts`:
  - `railSections(addTools([]))` → section ids in `ADD_TOOL_SECTIONS` order minus the empty ones
  - the total tool count equals `addTools([]).length`
  - no section has zero tools
  - `DRAW_SURFACE_ID === "surface:draw"`
- [ ] **Step 2: Run** `npx tsx lib/venues/add-tools.ts` — expect it to fail.
- [ ] **Step 3: Implement** `railSections`, move `DRAW_SURFACE_ID`, and write `halls-rail.tsx`.
- [ ] **Step 4: Run** `npx tsx lib/venues/add-tools.ts` → ok; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(halls): the draw + add rail`.

### Task 6: The halls shell — one card, floating chrome, the rail mounted

**Files:**
- Create: `components/canvas-chrome.tsx`
- Modify: `app/(app)/halls/halls-screen.tsx` — the return (~1747–2894), the `onKey` effect (~1035–1139), the toolbar header (~1775–1982) deleted
- Delete: `components/add-element-flyout.tsx` (halls was its only user)

**Interfaces:**
- Consumes: `HallsRail`, `toolTileState`, `DRAW_SURFACE_ID` (Task 5); `EndPanel` (Task 3); `Menu`; `useVenues`; `setActiveVenueId` (lib/venues/storage).
- Produces (components/canvas-chrome.tsx):
  - `ViewCluster({ children })` — `absolute top-4 start-4 z-20` card (`rounded-md border bg-surface p-1 shadow-floating`, items `gap-0.5`)
  - `SavePill({ state: "saving" | "saved" | "error" | "readonly", onRetry? })`
    - `absolute bottom-4 start-4 z-20 h-7 rounded-pill border bg-surface px-2.5 text-xs text-muted`, `aria-live="polite"`
    - text: נשמר (Check in accent) · שומר… · "לא נשמר · נסו שוב" (a button, alert ink) · צפייה בלבד
  - `HintPill({ children })` — `pointer-events-none absolute inset-x-0 top-[68px] z-10 flex justify-center`; the pill `rounded-pill bg-ink/85 px-4 py-2 text-[13px] text-canvas max-w-[70%]`; children may carry their own `pointer-events-auto` buttons
  - `DocumentMenu({ items: MenuItem[] })` — `<Menu label="פעולות על המסמך" side="bottom" items={items} />`

- [ ] **Step 1: Write `components/canvas-chrome.tsx`.**
- [ ] **Step 2: Rewrite halls-screen's return.**
  - Layout: `div.flex.h-full.flex-col.p-4` → one `section` card (`relative flex min-h-0 flex-1 overflow-hidden rounded-md bg-surface shadow-floating`) holding `HallsRail` (not rendered when `readOnly`) · the canvas host (`relative min-w-0 flex-1 bg-inset`) · `<EndPanel screen="halls" collapsible>`.
  - The panel's CONTENT moves unchanged from `SidePanel`'s children for now; Task 7 restyles it.
  - Delete the `<header>` toolbar and the `SidePanel`.
- [ ] **Step 3: Wire the chrome.**
  - PlanCanvas gets `onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}`, plus `toolbarExtras={<DocumentMenu items={…}/>}` (hidden for a viewer).
    - Items: "הדבקה" (`pasteClip`, disabled when `clip.length===0`) and "תוכנית רקע…" (clears the selection, calls `groupMemory.open("halls:none", "underlay")`, then scrolls the group into view).
  - `ViewCluster` holds a venue ▾: a `Menu` with `Building2` and the venue's name as its trigger, one item per `useVenues().venues`, `onSelect: () => setActiveVenueId(v.id)`.
  - `SavePill state={readOnly ? "readonly" : saveState} onRetry={retrySave}`.
  - The hint pill carries:
    - the armed tool's text ("לחצו על התוכנית כדי להניח <label> · Esc")
    - `MODES.walls.hint` while drawing walls
    - the region-tracing hint
    - the viewer note (~2045) and `planNote` (~2053)
  - The cursor tooltip (~2329) keeps only the live length.
- [ ] **Step 4: Rail wiring and keys.**
  - `onDrawWalls` = the old "שרטוט" handler (~1805–1824). `onNewZone` = the old "שרטוט אזור חדש" handler. `onPick` = the flyout's `onPick` (~1888–1900).
  - Delete the בחירה/הזזה buttons. `handTool` stays, toggled by `KeyH` only.
  - In `onKey` add `isShortcut(e, "w")` (lib/keyboard.ts; no modifiers, not typing, not readOnly) → `onDrawWalls()`.
- [ ] **Step 5: Run** `npm run typecheck`; `npm run check:actions`.
- [ ] **Step 6: Headless — create the harness**, in the scratchpad: `…/scratchpad/shell/`, Playwright as in memory `headless-browser-check`.
  - First run `npx tsx scripts/create-studio-account.ts --email shell-check@eve.dev --name "Shell Check" --studio "בדיקת מעטפת" --dry-run`, then without `--dry-run`. Keep the printed password in `…/shell/creds.txt` (scratchpad only).
  - `halls.js` logs in, opens /halls (an empty studio opens in walls mode), and draws a 16×14 m room: W, then four clicks and a click on the first point.
  - It screenshots:
    - `h6-draw.png` mid-run
    - `h-empty.png` after Escape
    - a wall, after a click on the north wall's middle
    - with nothing selected, Review Focus 5: the rail's כניסה tile is disabled before the first wall exists — capture it at the start
- [ ] **Step 7: Commit** `feat(halls): one card — rail, floating chrome, no header`.

### Task 7: The halls end panel — zones list and the underlay group

**Files:**
- Create: `app/(app)/halls/underlay-group.tsx` — the "תוכנית רקע" section moved out of halls-screen (~2492–2707), its state passed in
- Modify: `app/(app)/halls/halls-screen.tsx` — the panel's children

**Interfaces:**
- Consumes: `PanelList`, `PanelListRow`, `PanelListFolded`, `PanelGroups`, `PanelGroup` (Task 3); `ZONE_DOT_COLOR`, `ZONE_KIND_LABEL`.
- Produces:
  - `UnderlayGroupBody(props)` — exactly today's underlay controls (upload / reuse, calibrate, שקיפות, סיבוב, נעילת מיקום, החלפה, הסרה). Its props are the halls-screen state and handlers it already reads (`underlay`, `calib`, `calibAnswer`, `underlayUnlocked`, `patchUnderlay`, `persistUnderlay`, `removeUnderlay`, `reuseUnderlay`, `setCropFile`, …).
  - `underlaySummary(u: PlanUnderlay | undefined): string` — `"<fileName> · <opacity%>"` or "אין".

- [ ] **Step 1: Move the underlay section** into `underlay-group.tsx` verbatim; only the wrapper changes. Add a "החלפה" file input that runs the same `setCropFile` path.
- [ ] **Step 2: Build the list.**
  - `PanelList title="אזורים" count={resolved.length}`.
  - One `PanelListRow` per zone: glyph = the kind dot; label = name; meta = `<kind> · <area> מ״ר`; selected when the zone is selected; `trailing` = the ✎ `IconButton` → `editZone` (hidden for a viewer).
  - Then a `+ אזור חדש` row (accent, = `onNewZone`).
  - Fold to `PanelListFolded` (icon SquareDashed, crumb = the zone that contains the selection, else the venue name) while a NON-zone thing is selected. `onOpen` unfolds for the rest of that selection.
- [ ] **Step 3: Nothing selected.** Render `<PanelGroups kind="halls:none" title="המקום" sub={venue.name} groups={[{ key: "underlay", icon: ImageIcon, title: "תוכנית רקע", summary: underlaySummary(u), body: <UnderlayGroupBody …/> }]} defaultOpen={["underlay"]} />`. A viewer gets no underlay group.
- [ ] **Step 4: Run** `npm run typecheck`. Re-run `halls.js` → `h1-none.png`.
- [ ] **Step 5: Commit** `feat(halls): the end panel — zones list and the underlay group`.

### Task 8: Openings on a wall (pure)

**Files:**
- Modify: `lib/venues/structure.ts` (add `openingsOn`; extend its self-check, `check:structure`)

**Interfaces:**
- Produces:
  - `interface OpeningRow { id: string; kind: OpeningKind; widthMm: number; fromCornerMm: number; label: string }`
  - `openingsOn(s: VenueStructure, wallId: string): OpeningRow[]`
    - the wall's entrances sorted by `fromCornerMm` ascending
    - `fromCornerMm` = `doorOffsets(e, wallLen).toEdgeMm`
    - `label` = "דלת" / "חלון" / "ויטרינה" (`isVitrine`)

- [ ] **Step 1: Self-check.**
  - A 10 m wall with a 1.6 m door centred at 6 m (`measureFrom` absent) and a 2 m vitrine centred at 2 m → rows `[ויטרינה (from 1000), דלת (from 5200)]`.
  - `openingsOn(s, "missing")` → `[]`.
  - A wall with none → `[]`.
- [ ] **Step 2: Run** `npm run check:structure` — expect it to fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check:structure` → ok.
- [ ] **Step 5: Commit** `feat(venues): openingsOn — a wall's openings as rows`.

### Task 9: HallsSelection — walls, corners, doors

**Files:**
- Create: `app/(app)/halls/halls-selection.tsx` — begins as a MOVE of `selection-bar.tsx` (`git mv`), renamed `HallsSelection`
- Modify: `app/(app)/halls/halls-screen.tsx` — render it twice: `part="bar"` in the bottom dock (~2371) and `part="groups"` in the end panel under the list

**Interfaces:**
- Consumes: Task 2's quick pieces, Task 3's `PanelGroups`/`PanelGroup`/`PickRow`, Task 8's `openingsOn`.
- Produces:
  - `HallsSelection(props: SelectionBarProps & { part: "bar" | "groups" })` — props as today's `SelectionBar` (selection-bar.tsx:207–262) plus `part`
  - `kindKey(selection, structure): string` — the `PanelGroups` memory kind: `"halls:wall"`, `"halls:node"`, `"halls:door"`, `"halls:window"`, `"halls:feature:<kind>"`, `"halls:multi"`, `"halls:zone"`, `"halls:edge"`, `"halls:draft"`

**The conversion rule (applies to Tasks 9–11):**
- Each branch returns `part === "bar" ? <Bar …>{numbers}{verb}<QuickTail …/></Bar> : <PanelGroups kind=… title=… sub=… groups={[…]} />`.
- A Popover chip with FIELDS becomes a group: same title and icon, `summary` = the chip's old `value`, `body` = the chip's old children.
- Inline numbers come from the spec §3.3 table.
- `Rotation` becomes `QuickLead RotateCw` + `QuickNumber` (the angle) between two `BarButton`s (±90).

- [ ] **Step 1: Wall.**
  - Bar: `QuickLead Ruler` + אורך `QuickNumber` (m, 2 dp → `setWallLength`) · `QuickSep` · זווית (→ `setWallAngle`) · `QuickSep` · `QuickLead Spline` + קשת `QuickNumber narrow` (cm → `setWallBulge`).
  - Then `<Menu label="פתח" icon={DoorOpen} side="top" items={[דלת, חלון]}>` styled as `ModeVerb` (add `trigger="pill"` + `triggerText` to `Menu` as Popover got in Task 4) — only on a `kind==="wall"`.
  - Then `QuickTail onDelete deleteLabel="מחיקת הקיר"` (no copy).
  - Groups:
    - מידות: אורך, גובה (+ the existing Note)
    - פתחים: `openingsOn` rows, each selecting its opening via a new `onSelectOpening(id)` prop wired to `pick({kind:"door", id})`; "אין פתחים" when empty; + דלת, + חלון buttons
    - סוג: Segmented קיר / גבול שטח
    - קשת: the bulge field
- [ ] **Step 2: Corner.** Bar: x · y `QuickNumber`s · delete. Group: מיקום (the X/Y fields + Note).
- [ ] **Step 3: Door / window.**
  - Bar: רוחב `QuickNumber narrow` (cm) · מהפינה `QuickNumber` (m, `doorOffsets().toEdgeMm`, writing back through the existing distance handler) · `BarButton FlipHorizontal2` "היפוך הפתיחה" (a door: toggles `swingInward`) · `QuickTail onDelete` (no copy, as today).
  - Groups:
    - מיקום: מדידה מ־ Segmented + both distances + Note
    - פתיחה (door): יחידה/כפולה, פנימה/החוצה — **or** זכוכית (window): ויטרינה/חלון, the sill and head fields
    - וילון: the curtain-over-door switch, only when a curtain hangs on the wall
- [ ] **Step 4: Mount both parts** in halls-screen. The end panel shows `part="groups"` under the (folded) list whenever there is a selection; nothing selected keeps Task 7's groups.
- [ ] **Step 5: Run** `npm run typecheck`. `halls.js`: select a wall → `h2-wall.png`; add a door from פתח → select it → `h3-door.png`; select a corner → `h-corner.png`.
- [ ] **Step 6: Commit** `feat(halls): walls, corners and openings as quick bar + groups`.

### Task 10: HallsSelection — features and stage edges

**Files:**
- Modify: `app/(app)/halls/halls-selection.tsx` — the feature branch (old 1006–1383), the edge branch (old 934–1005), `VenueRailFields`, `CurtainLookFields`, `PergolaPopover`
- Modify: `app/(app)/halls/led-panel.tsx` — `VenueLedPopover` becomes `VenueLedFields` (its body); the Popover wrapper goes

**Interfaces:**
- Consumes: the Task 9 conversion rule; `PickRow` + `ShapeGrid`. Export `ShapeGrid` from appearance-modal.tsx, or move it to `components/shape-grid.tsx` if the import would pull the modal into halls — prefer the move.

- [ ] **Step 1: Feature bar.**
  - W×D `QuickNumber`s in m, or ⌀ for round (writing `updateFeature` as the old מידות panel did; absent for bound / curtain / LED / seating / climb, which get their own number: seating = rows × per row, climb = rise in cm, curtain/LED = length read-only `QuickUnit`) · זווית.
  - `ModeVerb PenLine "עריכת הקווים"` when `canEditOutline` (`active` = `outlineEditId === f.id`).
  - `QuickTail` — copy only when `onDuplicate`, delete honouring `allLocked`; `more` = הגדרה כאזור…, הגדרה כעמודים (when `canDefineColumns`), נעילה/שחרור, the four restack items (`separated`).
  - The old `zoneChip` Popover becomes the group "אזור" (its body), shown when `onFeatureZone`.
- [ ] **Step 2: Feature groups**, in this order (warn first via `orderGroups`):
  - צורה: `PickRow` with the shape's glyph + "החלפה" → `ShapeGrid`; for a surface, חומר instead (`SurfaceTiles` body); for a plant, סוג צמח
  - מידות (the old panel incl. height)
  - שם
  - the kind group: עמוד · פרגולה (`PergolaPopover`'s body) · שפה · קטע (curtain: wall/rail fields + `CurtainLookFields`) · פס לד (`VenueLedFields`) · שורות + כיסא (seating: `ChairRowsPopover`'s body — export its body as `ChairRowsFields` from components/chair-rows-popover.tsx) · מדרגות / רמפה (`ClimbFields`)
  - קצוות (`takesEdgeItems`)
  - בסקיצה (the switch)
  - אזור
  - מראה (`StyleFields`, `fillOnly` for pictures; none for LED)
- [ ] **Step 3: Stage edge.**
  - Bar: רוחב · מדרגות (stairs) · delete; ✕ calls `onSelectEdge(featureId, null)` (back to the stage).
  - Groups: סוג · מיקום (stairs) · מדרגות.
- [ ] **Step 4: Run** `npm run typecheck`; `npm run check:stage-edges`. `halls.js`: place a stage from the rail → `h4-feature.png`; open צורה → `h4-shape-picker.png`. Expected: the picker sits beside the panel, not over the stage.
- [ ] **Step 5: Commit** `feat(halls): features and stage edges as quick bar + groups`.

### Task 11: HallsSelection — several, zones, drafts, drawing bars

**Files:**
- Modify: `app/(app)/halls/halls-selection.tsx` — the multi branch, the zone branch, the draft-zone branch
- Modify: `app/(app)/halls/outline-bar.tsx` — the drawing-bar form, with סיום
- Modify: `app/(app)/halls/halls-screen.tsx` — the bar-shown conditions (~2352–2410); the wall-drawing bar; the `newWallHeightMm` state

**Interfaces:**
- Produces:
  - `WallDrawBar({ kind, onKind, onCancel, onFinish, facts })`
    - in halls-selection.tsx
    - a `Bar` with PenLine "שרטוט קיר", facts "N קטעים · L מ׳"
    - row 2: Segmented קיר / גבול שטח · `flex-1` · ghost "ביטול" · primary `size="sm"` "סיום" (= Enter's `setRunNodeId(null)`)
  - Halls-screen state `newWallHeightMm: number | null`. `onPick` applies `setWallHeight(next, newWall.id, h)` to the wall `addWall` just appended (`next.walls.length > s.walls.length` → the last one).

- [ ] **Step 1: Several.**
  - Bar: זווית (features) · `Menu` יישור (`trigger="pill"`, units > 1) · `QuickTail` (copy when features + `onDuplicate`; `more` = הגדרה כאזור…, הגדרה כעמודים, lock, restack).
  - Groups: סוג (all walls: קיר / גבול) · מראה · אזור.
- [ ] **Step 2: Zone.** The branch no longer returns null.
  - Bar: kind-dot · name · facts `<kind> · <m²>` (+ ceiling, seats) · `ModeVerb Pencil "עריכת האזור"` (→ `editZone`) · `BarButton MousePointer2 "בחירת הפריטים באזור"` · `ModeVerb PenLine "עריכת הקווים"` for a `region` zone (toggles the outline edit that today opens by itself) · `QuickTail onDelete`.
  - Groups: none — `part="groups"` returns the note "השדות של האזור — בחלון ״עריכת האזור״".
  - The zones list stays OPEN with the row tinted.
  - Add `onEditZone(id)` and `onSelectZoneMembers(id)` props.
- [ ] **Step 3: Drafts.**
  - The naming draft's bar: שם TextField · Segmented סוג · ghost ביטול · primary שמירה.
  - Its groups: משטח בלבד (`SurfaceTiles` body) · מבנה (`BuildingDraft` body) · מרווח (a features zone).
  - The surface intent's bar: "משטח חדש" + ביטול. Its single group חומר (`SurfaceTiles`) is open by default.
- [ ] **Step 4: Outline editing.** `OutlineBar` keeps its fields and gains a primary "סיום" that does what its ✕ did.
- [ ] **Step 5: Drawing walls.**
  - While `mode === "walls"`, the bottom dock shows `WallDrawBar`.
  - The end panel shows `<PanelGroups kind="halls:draw" title="קיר חדש" sub="הגדרות השרטוט" groups={[{ key:"new", icon: Ruler, title:"קיר חדש", summary: …, body: <גובה field writing newWallHeightMm; blank = לפי החדר> + Note }]} defaultOpen={["new"]} />`.
- [ ] **Step 6: Delete the dead parts.** Remove `selection-bar.tsx` leftovers and any `SelectionBar` import. `SidePanel` stays for app-shell and scene-screen.
- [ ] **Step 7: Run** `npm run typecheck`; `npm run check:actions`; `npm run check:face-surfaces`; `npm run check:feature-zones`.
  - `halls.js`: draw a closed room → the naming draft → `h-draft.png`; save as "חופה" kind טקס → select it → `h5-zone.png`; multi-select two features → `h-multi.png`.
- [ ] **Step 8: Commit** `feat(halls): several, zones, drafts and drawing as quick bar + groups`.

### Task 12: ZoneDialog (and the other dialogs) in the modal frame

**Files:**
- Create: `components/modal-frame.tsx`
- Modify: `app/(app)/halls/zone-dialog.tsx`
- Modify: `components/confirm-dialog.tsx`, `components/underlay-crop-modal.tsx`

**Interfaces:**
- Produces:
  - `ModalFrame({ open, onClose, tile, title, facts?, footer, closeTabIndex?, className?, children, labelledBy? })`
    - a native `<dialog className="modal … rounded-lg border bg-surface p-0 shadow-dialog">` opened with `showModal()` in an effect, as zone-dialog does now
    - header `flex items-center gap-3 border-b px-5 py-3`: the 36px `rounded-sm` tile · title 14/600 · facts 12 muted · `CloseButton tabIndex={closeTabIndex}`
    - body `p-5 flex flex-col gap-[18px]`
    - footer `flex items-center gap-2 border-t px-5 py-3.5`
    - **its own `close` event only** — CLAUDE.md "Drawer reacts only to its OWN close"

- [ ] **Step 1: Write `ModalFrame`.**
- [ ] **Step 2: ZoneDialog on it.**
  - Tile = the kind dot on its tint; facts = `אזור · <kind> · <m²> · <source word>`.
  - Body, every field kept, in order: שם · סוג (chips) · מושבים / עמידה / תקרה · משטח (`SurfaceTiles`) · **צבע על התוכנית** · צורה (the source note + existing buttons) · הוספה בתוך האזור (`ToolGrid` of `ToolTile`s over `railSections(tools)`, replacing `AddElementMenu`).
    - צבע: six swatches + ✕, writing `onChange({ style: fill ? { ...zone.style, fill } : undefined })`; ring on the current one.
  - Footer: primary "סיום" · borderless alert "מחיקת האזור" (Trash2) · `flex-1` · Check + "נשמר תוך כדי עריכה".
- [ ] **Step 3: ConfirmDialog and UnderlayCropModal on `ModalFrame`.**
  - ConfirmDialog keeps its rule: ביטול is the filled primary, ✕ has `tabIndex={-1}`, focus lands on ביטול.
- [ ] **Step 4: Run** `npm run typecheck`. `halls.js`: ✎ on the zone → `h5-modal.png`; a confirm (delete the zone) → `h-confirm.png`; then Escape.
- [ ] **Step 5: Commit** `feat(shell): the modal frame; zone, confirm and underlay dialogs wear it`.

### Task 13: Verify Halls against the board, viewer run, docs

**Files:**
- Modify: `CLAUDE.md` — the Design System Guidelines bullets that describe /halls' toolbar, its SidePanel zone panel and SelectionBar: rewritten to the shell, i.e. the rail, the end panel and `HallsSelection`. Add a short "The shell" bullet naming the parts and their files.
- Scratchpad only: `…/shell/halls.js`, `…/shell/compare.html`

- [ ] **Step 1: Side by side.** Build `compare.html`, which places each `h*.png` next to the board's frame screenshot (the board is renderable from `…/scratchpad/design/anatomy.html` with `support.js` fetched through DesignSync `get_file`, or compared by eye from the board in claude.ai/design). List every visible difference in `…/shell/diff.md`; fix what is a bug, and note what is a deliberate DECIDE.
- [ ] **Step 2: Viewer run** (Review Focus 1). As the throwaway studio, follow אמרה (`/halls` → the sidebar's "follow"), which opens it as a viewer, and screenshot `h-viewer.png`. Expected: no rail, no verbs, "צפייה בלבד", no edits on keys (press Delete and Ctrl+Z with something clicked; the plan is unchanged).
  - **Never edit אמרה.**
  - Unfollow afterwards.
- [ ] **Step 3: Narrow run** (Review Focus 2). 1280×800 with the end panel collapsed → `h-narrow.png`. Expected: the quick bar wraps and does not overlap the save pill.
- [ ] **Step 4: Full checks.** `npm run typecheck`, `check:actions`, `check:structure`, `check:panel-groups`, `check:stage-edges`, `check:face-surfaces`, `check:feature-zones`, and `npx tsx lib/venues/add-tools.ts`. All ok.
- [ ] **Step 5: Commit** `docs(claude): the halls shell`, then show Ravid the screenshots (spec §8: phase 2's gate). **Plan 2 (Studio) is written after his answer.**
- [ ] **Step 6: Clean up after Ravid has seen it.** `npx tsx scripts/delete-organization.ts` for "בדיקת מעטפת" (read its header for the flags; dry run first).
