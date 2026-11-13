# Studio + Halls — one shell, built like the shape editor — design

Version 1.0 | 2026-11-09 | Branch `feat/2026-11-09-studio-halls-shell` (off `feat/2026-11-07-element-model` at `0019766`). Not built yet.

Source: Ravid's claude.ai/design board **"Studio + Halls - Anatomy"** and its **"Studio + Halls - Spec.md"** (project "Product dialog and shape editor"), imported 2026-11-09. Ravid: *"I have redesigned the studio and halls screens with Claude Design, follow the design. If you have questions ask."*

Decided with Ravid the same day:

| # | Question | Answer |
| --- | --- | --- |
| Q1 | Where the document controls go (the board's open 1a / 1b / 1c) | **1b: everything floats.** Not the board's recommended 1c. |
| Q2 | Layer headings in the studio's list: 3 (as drawn) or today's 4 planes | **Keep the 4 planes**: שולחנות · עיצוב שולחן · רצפה · תקרה |
| Q3 | Branch | Commit the element-model work, then branch off it (done) |
| Q4 | Build order | **Shared parts → Halls → Studio**, shown to Ravid after each |

Everything else the board leaves open, or where the board and the code disagree, is a **DECIDE** in §9 — my call, open to argument.

**This round changes layout, not data.** Nothing new is stored. The only exception is the zone colour (D17): the model already has `Zone.style` and nothing edits it today. Where the board shows a field the model does not hold, it is listed in §10 rather than invented.

---

## 0. What exists today (the maps this is built from)

### Studio (`app/(app)/studio/studio-screen.tsx`, `inspector.tsx`, `toolbar.tsx`, `catalog-rail.tsx`, `scene-preview.tsx`)
- **A 48px toolbar header** (toolbar.tsx). In order:
  - undo · redo
  - copy · cut · paste
  - מספור (popover)
  - סקיצות שמורות (popover)
  - פריטי מתחם שהוסרו (popover, only when there are any)
  - zone select (ScanEye; only when there is more than one zone)
  - **PlaneRail** (4 planes, each with an eye and "work only here")
  - 3D toggle
  - save state
- **A row under it.** `CatalogRail` (256px, start) | canvas column | `ScenePreview` (a corner card or a split third column).
- **PlanCanvas's own floating strip** (top-end):
  - undo · redo (not passed by the studio)
  - zoom − + · fit
  - הצגת מידות · tape · centre guides
  - the studio's extras: the clearance toggle (ShieldAlert) and **מילוי במות**
- **Everything else floats over the canvas.**
  - Top: the proposal banner, the dressing bar, the stage-tool hints, the seating chip (top-start), the armed chip "מניחים: …", and the venue notices.
  - Bottom: one bar, which is `StageDrawBar` | `StageFillPanel` | `Inspector`.
  - A toast at bottom-20.
- **`Inspector` is one component with about 120 props.** It renders ten bar kinds: table, block/group, stage, stages group, stage edge, the "any other placement" bar, venue feature, multi-select, and the empty-scope "בחירה" bar.
  - Almost every subject is a `Popover` chip holding fields.
  - Rare verbs live in `MoreMenu`, then `Actions` (copy · delete).
- **Nothing selected shows no bar.**
  - Seating is a chip.
  - Clearance breaches are only drawn on the plan; **there is no list of them anywhere.**
  - Missing catalog pieces show only on a stage's bar.

### Halls (`app/(app)/halls/halls-screen.tsx`, `selection-bar.tsx`, `outline-bar.tsx`, `zone-dialog.tsx`)
- **The canvas card has a 48px header.** In order:
  - undo · redo
  - copy · cut · paste
  - שרטוט, and while drawing the קיר / גבול שטח toggle
  - the add-element flyout
  - בחירה · הזזה
  - the venue name · save state
- **Beside the card sits a separate `SidePanel` card** (300px, collapsible to a 96px rail):
  - תוכנית רקע: upload, reuse, calibrate, opacity, rotation, lock/unlock, remove
  - הגדרת אזורים: rows with ✎, then "שרטוט אזור חדש"
- **Bars at the canvas foot.**
  - `SelectionBar` covers draft zone, multi, wall, corner, door/window, stage edge and feature, all as Popover chips.
  - `OutlineBar` is the outline-editing bar for zones, pools and surfaces.
  - **A single zone gets no bar.**
  - The venue switch is in the app sidebar, not on this screen.
- **The add-element flyout** is a 420px popup over `ADD_TOOL_SECTIONS` (lib/venues/add-tools.ts) with search. Its sections are structure, pool, ground, plants, bars, stages and seating, plus the special "ציור חופשי".

### The reference (`app/(app)/catalog/appearance-modal.tsx`)
The shape editor already IS the board's shell:
- `ShapeRail` (tiles)
- the canvas, with PlanCanvas's floating strip
- `ShapeQuickBar` on `Bar`, with `BarNumber` / `BarSep` / `BarUnit`
- a 296px side panel: a "צורות בפריט" list, then `FoldRow variant="panel"` groups whose open state is remembered

Most of the "shared parts" below are lifting those out of that file.

---

## 1. The shell (both screens, RTL: start = right)

```
┌ start rail ─┬──────────── canvas ──────────────────────────────┬─ end panel ─┐
│ studio: 272 │ [view cluster]              [canvas toolbar · ⋯] │ 296, ⇤ puck │
│ halls:  232 │ [3D card]          [hint pill]                   │ list        │
│             │                                                  │ ─────────── │
│             │                                                  │ groups      │
│             │ [save pill]        [quick bar]                   │             │
└─────────────┴──────────────────────────────────────────────────┴─────────────┘
```

- **One card, three columns.**
  - Studio: inside `EventSurface`'s card, as today.
  - Halls: the canvas card and the separate SidePanel card become ONE card, rail | canvas | panel, hairlines between them (`border-e` / `border-s`).
- **No header bar on either screen** (1b). The 48px toolbar header (studio) and the canvas card's header (halls) are deleted.
- **Canvas toolbar** (top-end, 16px in) is PlanCanvas's existing strip:
  - undo · redo — the studio now passes them too
  - − + fit
  - ruler · tape · centre guides
  - the host's view toggles (the studio's clearance eye)
  - **⋯ the document menu** (§2.4)
- **View cluster** (top-start, 16px in), a floating card the toolbar's shape:
  - Studio: zone ▾ (only with more than one zone, as today) · 3D toggle
  - Halls: venue ▾
- **3D card** (studio): top-start, under the view cluster.
- **Save pill** (bottom-start corner): ✓ נשמר / שומר… / לא נשמר · נסו שוב. A viewer at /halls sees "צפייה בלבד".
- **Hint pill** (top centre, 68px down, under the corners' line):
  - shown only while a tool is armed or drawing
  - also carries the standing notices: venue access / unset, the halls viewer note, the client's proposal banner
- **Quick bar** (bottom centre, 16px up): the selection, or the drawing bar while a tool is drawing.
- **Toast** for refusals and one-off messages stays above the quick bar, as today.

---

## 2. Shared parts (built first, phase 1)

### 2.1 Quick bar — `components/inspector-bar.tsx` (extended)
- **`Bar` keeps row 1**: icon · name · badge · facts (truncated) · ✕ (Esc).
- **Row 2 is built from new pieces, lifted from the shape editor:**
  - `QuickNumber` (56×28; a narrow 44 variant)
  - `QuickUnit`, `QuickSep`
  - `QuickLead` (the muted icon before a number)
  - `ModeVerb` (the outline pill, `border-accent-line text-accent`, 30px)
  - `QuickTail`
- **`QuickTail` = copy · delete · ⋯, in that order, ⋯ last**, behind a hairline.
  - It replaces `Actions` + `MoreMenu`'s position: today the "…" comes BEFORE copy · delete.
  - `copy` is optional (a wall has none).
  - The ⋯ menu holds cut, copy, select similar, stacking, lock, mirror, save as composite and the other rare verbs, in today's `MoreMenu` sections.
- **Row 2 order is fixed:** at most 3 numbers → one mode verb → `QuickTail`.

### 2.2 End panel — `components/end-panel.tsx` (new)
- **`EndPanel`**:
  - 296px, `bg-surface`, `border-s`, scrolls as a whole
  - collapsible by a puck on its inner edge, to nothing but the puck
  - open/closed remembered per device (lib/studio/storage.ts)
- **`PanelList`**: title + count, then rows.
  - `PanelListHeading`: a layer heading — label (click = work only in this layer) · פעילה · count · hairline · eye.
  - `PanelListRow`: glyph 26px · name · badge · meta. Selected = `bg-accent-tint`.
  - **Folded form:** while something is selected the list folds to ONE row — icon · title · count · crumb (`רצפה › שולחן 10`) · chevron. A click unfolds it.
- **`PanelGroups`**:
  - a header (selection name 13/700 · sub 12 muted)
  - then `FoldRow variant="panel"` groups. Every group has a **summary** (mandatory). A group reporting a problem gets warn ink and **sorts to the top**.
- **`usePanelGroups(kind)`**: which groups are open, remembered **per selection kind** for the session (a module-level map, as the editor keeps it).

### 2.3 Pickers — `components/popover.tsx` (extended)
- **`variant="picker"`**: 336px, `rounded-md`, `shadow-lifted`, a 48px header (icon · 14/700 title · ✕).
- **A pick applies and closes** (the existing `(close) =>` children).
- **New `side="beside"`** for a trigger inside the end panel: the picker opens beside the panel, into the canvas, level with its trigger, clamped as today. From the quick bar it still opens upward.
- **Only pickers and menus float.** A Popover that holds FIELDS is now a panel group (§3.3, §4.3). The pickers kept:
  - product swap
  - cloth / shade
  - shape (the editor's `ShapeGrid`)
  - vessel
  - which tables (`TablePatternPicker`)
  - saved table designs
- **A "pick row"** inside a group (swatch or glyph · name · meta · **החלפה**) is how a group opens its picker — the board's `B.pick`.

### 2.4 Canvas chrome — `components/canvas-chrome.tsx` (new)
- **`ViewCluster`** (top-start card), **`SavePill`** (bottom-start), **`HintPill`** (top centre).
- **`DocumentMenu`**: the ⋯ passed into PlanCanvas's strip through `toolbarExtras` (a `Menu`).
  - Studio items: מספור… · סקיצות שמורות… · פריטי מתחם שהוסרו (N) · הדבקה
  - Halls items: הדבקה · תוכנית רקע…
  - **An item with fields does not open a popover.** It clears the selection and opens that group in the end panel (D5).

### 2.5 Tool tiles — `components/tool-tile.tsx` (new)
- The shape editor's 3-column tile (58px: icon over a one-line label, armed = accent border + tint, draggable).
- Shared by the editor's `ShapeRail` and the halls rail.

### 2.6 Modal frame — `components/modal-frame.tsx` (new)
- `rounded-lg` (22), `shadow-dialog`, on the shared `.modal` scrim.
- **Header:** 36px tile · 14/600 title · 12px facts · `CloseButton`.
- **Footer:** primary first · secondary · status at the end.
- **Live-edit dialogs** (the zone) say "נשמר תוך כדי עריכה" and offer only סיום. **Draft dialogs** offer שמירה / ביטול.
- `ZoneDialog` first. ConfirmDialog and UnderlayCropModal take the frame in phase 2.

### 2.7 The shape editor adopts them
- `ShapeQuickBar` on `QuickTail` (⋯ moves to last).
- `ShapeRail` on `ToolTile`, its panel on `EndPanel` / `PanelGroups`.

That makes "the editor, Studio and Halls are asked in the same places" literally one set of components, and it is the proof that the parts work before either screen moves.

---

## 3. Halls (phase 2)

### 3.1 Start rail (232px) — replaces the toolbar's tools and the add-element flyout
- **שרטוט קירות** (the `W` key, physical key) and **אזור חדש**: two full-width buttons on top.
- **Then one tile grid per `ADD_TOOL_SECTIONS` section**, under its label (מבנה, בריכה, רצפה וקרקע, צמחייה, ברים ומזנונים, במות, ישיבה).
  - "ציור חופשי" is the first tile of רצפה וקרקע.
  - Ground tiles show their material swatch where the other tiles show an icon (D9).
  - Click to arm and click the plan to place; drag still works.
  - Disabled tiles (an opening with no wall) say why in their title, as today.
- **בחירה / הזזה buttons go.** Space+drag pans (PlanCanvas already does it); `H` stays as a key.
- **A viewer sees no rail** (the column is not rendered).

### 3.2 End panel
- **List "אזורים":**
  - a row per zone: kind dot · name · kind · area · ✎ (opens ZoneDialog)
  - then "+ אזור חדש"
  - folds while a non-zone thing is selected
  - the selected zone's row is tinted
- **Nothing selected → group תוכנית רקע**, holding today's section unchanged:
  - the file row
  - כיול לפי מידה ידועה
  - שקיפות, סיבוב
  - נעילת מיקום (switch)
  - החלפה (upload again) and הסרה
  - with no underlay yet: העלאה / בחירה מתוכנית קיימת

### 3.3 Selection → quick bar + groups

| Selection | Quick bar (numbers · verb · tail) | Groups |
| --- | --- | --- |
| Wall | אורך · זווית · קשת · **פתח** ▾ (menu: דלת / חלון) · delete · ⋯ | מידות (אורך, גובה) · פתחים (rows select the opening; + דלת, + חלון) · סוג (קיר / גבול שטח) · קשת |
| Corner | x · y · delete | מיקום |
| Door / window | רוחב · מהפינה · היפוך הפתיחה (door) · delete · ⋯ | מיקום (מדידה מ־ + both distances) · פתיחה (יחידה/כפולה, פנימה/החוצה) **or** זכוכית (ויטרינה/חלון, sill, head) · וילון (the curtain-over-door switch, when a curtain hangs on the wall) |
| Feature | W×D (or ⌀) · זווית · **עריכת הקווים** (when `canEditOutline`) · copy · delete · ⋯ | warn first, then: צורה (pick row → shape picker) · מידות · שם · kind groups (צמח · חומר · עמוד · פרגולה · שפה · קטע/וילון · פס לד · שורות + כיסא · מדרגות/רמפה) · קצוות (`takesEdgeItems`) · בסקיצה · מראה |
| Stage edge item (venue stage) | רוחב · מדרגות (stairs) · delete; ✕ = back to the stage | סוג · מיקום · מדרגות |
| Zone | **עריכת האזור** · בחירת הפריטים באזור · עריכת הקווים (a freehand zone) · delete | none: the list stays open with the zone tinted (the board's note line) |
| Several | זווית · יישור ▾ · copy · delete · ⋯ | קיר/גבול (all walls) · מראה · אזור (from features) |
| Outline editing (zone, pool, surface, building) | the drawing bar: the picked side's עיקום or corner's רדיוס · כל הפינות · החלקה · סיום | the outline's own (OutlineBar's fields) |
| Naming a closed shape (draft zone) | the drawing bar: שם · סוג · שמירה · ביטול | משטח בלבד (SurfaceTiles) · מבנה (height + "מבנה סגור עם תקרה") · מרווח (features zones) |
| Drawing walls | the drawing bar: קיר / גבול שטח · ביטול · סיום | קיר חדש: גובה (applied to each wall as it is drawn; blank = the room's) |

- **The ⋯ menu** holds what was chips: הגדרה כאזור, הגדרה כעמודים, נעילה, סדר בערימה, שכפול.
- **Copy** is offered only where duplicate works today (features).

### 3.4 ZoneDialog in the modal frame
- **Header:** the kind dot on its tint · the name · "אזור · <kind> · <m²> · <source>".
- **Body, keeping every field it has today** (fold, never cut):
  - שם
  - סוג (chips)
  - מושבים · עמידה · תקרה
  - משטח (SurfaceTiles)
  - **צבע על התוכנית** (D17)
  - צורה: the source note + יישור צורה · ציור חופשי · בחירת האלמנטים · מרווח
  - הוספה בתוך האזור (tool tiles — not the pop-up list)
- **Footer:** סיום · מחיקת האזור (alert ink) · "נשמר תוך כדי עריכה".

---

## 4. Studio (phase 3)

### 4.1 Start rail (272px) — `CatalogRail` restyled
- **Header:** "קטלוג" · the pass name · "+ מוצר" (tint pill); search + filter button under it.
- **Sections, then departments:**
  - נוסף עכשיו · מובנים · בתיק האירוע (heart, count)
  - then **one heading per department with its count**, replacing the flat "כל הקטלוג"
- **Rows:** a 40px glyph tile · name · meta (size). The layer chip goes. Armed = tinted row with "מניחים". The "…" menu stays.
- **"שורות כיסאות" and "מילוי במות"** are tool cards under מובנים. The fill tool leaves the canvas strip: it creates, so it belongs on the rail (D7).

### 4.2 End panel — list "בתוכנית"
- **Four layer headings** (Q2): שולחנות · עיצוב שולחן · רצפה · תקרה, from `PLANES`.
  - The heading's label = work only in this layer (`activeLayer`). Its eye = shown/hidden (`layerVisible`).
  - **This replaces `PlaneRail`**, which is deleted with the toolbar.
- **Rows group by product** (tables by type, blocks named with their number) with a count or a size.
  - A row selects every item of that product in that layer (D11).
  - The venue's movable features are listed under רצפה with "של המקום".
- **The board's `l.active` "פעילה" badge** marks the working layer. The list filters with it.

### 4.3 Groups when nothing is selected
- **ישיבה**: "seated/seats מושבים", plus banquettes. Replaces the seating chip.
- **בדיקות** (warn when there are any). One row per clearance breach ("שולחן 1 ↔ בר · 10 ס״מ · נדרש 80") and per stage with missing pieces. **A row selects what it describes.**
  - The folded list row carries a warn count badge when בדיקות has rows (D12).
- **מספור** (today's NumberingMenu fields), **סקיצות שמורות** (today's SketchMenu), **פריטי מתחם שהוסרו** (only when any). The document ⋯ opens these.
- **With a zone or layer scope active**, the quick bar is the "בחירה" scope bar (as today).

### 4.4 Selection → quick bar + groups

| Selection | Quick bar | Groups (warn first) |
| --- | --- | --- |
| Table | # · seated/seats · זווית · **הלבשה** (not in the hall pass) · copy · delete · ⋯ | מרחק ביטחון ⚠ · ניצול שטח ⚠ · שולחן (pick row → type swap; ללא מספור) · ישיבה (chair pick row, sides) · מידות · מפה (pick row → cloth, shade swatches, contour, "על כל השולחנות") · על השולחן (the items on it) · עיצובי שולחן (pick → designs; apply → pattern) · מראה |
| Block | # · seated/seats · זווית · **פירוק הבלוק** · tail | שולחנות בבלוק (a row opens focus on that member, D13) · ישיבה · מפה · עיצובי שולחן · מראה |
| Stage | W×D · גובה · זווית · **עריכת הפלטות** (opens the fill tool on it) · tail | קצוות ⚠ (edge rows, הוספה, סגירת הפתחים) · חסר בקטלוג ⚠ · מרחק ביטחון ⚠ · בנויה מ · גובה ומפלסים · משטח · מעקה · תבנית |
| Several stages | W×D (whole) · גובה · זווית · **איחוד לבמה אחת** · tail | as the stage's, plus במה בודדת |
| Stage edge | רוחב · מדרגות or מושבים · delete; ✕ = back to the stage | סוג · מיקום · מדרגות / בנקט |
| Design item (table / floor) | גודל % (or ×N quantity) · זווית · copy · delete · ⋯ | מרחק ביטחון ⚠ · פריט (pick row → swap) · גוון · כלי (pick row) · קונטור · דפוס (pick → which tables) |
| Ceiling item | גובה תלייה · זווית · tail | פריט · גוון · מעל שולחנות (apply, row spread, one over each item) |
| Drape / LED / cloth on a rail | length (read-only) · drop / height · **ציור על מוט** (a rod) · tail | מסילה (today's rail fields) · פריט · גוון · מראה |
| Chair rows · banquette · cover · rug · climb | the 2–3 numbers each bar already leads with (rows×per row; number; inset; size; rise) · tail | today's popovers, one group each (שורות, ישיבה, על <name>, גודל ופינות, מדרגות/רמפה) |
| Several | זווית · יישור ▾ · מרווח · **קיבוץ** · tail | ישיבה (bulk chairs) · העתקת עיצוב · מפה · סיבוב (spin mode) · מראה |
| Venue feature in a sketch | זווית · החזרה למקום · הסרה מהסקיצה | פריט של המתחם · (curtain) החלפה בווילון |

- **The rule for every bar not listed:** today's Popover chips with fields become groups of the same name, holding the same field components. Their pickers stay pickers, opened from a pick row.
- **Number fields** use the board's panel row: 40px, 14px label, 80px field, unit.

### 4.5 Modes
- **Dressing focus** (הלבשה):
  - `DressingBar` moves to the hint row (top centre).
  - The quick bar is the selected dressing item's, as today.
  - ✕ / Esc leaves focus.
- **Stage fill tool:**
  - The quick bar becomes the drawing bar: what it will build · סימון מחדש · ביטול · הוספת / עדכון הבמה.
  - `StageFillPanel`'s chips become end-panel groups: אילו במות · פלטה · חריגה מהקו · פינות · מה ייכנס · חסר בקטלוג · מידה מדויקת · חפיפה.
  - The draw phase's `StageDrawBar` becomes the drawing bar too, with its shape choices and templates.
- **Armed item:** the "מניחים: …" chip becomes the hint pill ("לחצו על התוכנית כדי להניח … · Esc").

### 4.6 3D card
- The corner card is restyled as a floating card: header Box · "תלת־ממד" · ✕.
- Default width 300, resize grip kept.
- Top-start, under the view cluster.
- **The split layout is dropped.** A stored `layout: "split"` reads as the card.
- Its three rules are unchanged: let it settle, hide and never unmount, follow the selection.

---

## 5. Keys (same as the editor)
- **Escape steps back, one step per press:** popover → armed tool / drawing → mode (dressing, fill, outline) → selection → scope. That is today's chain, kept on both screens.
- **Delete** removes. **Ctrl+D** duplicates. Ctrl+D is NEW in the studio outside the fill tool; it does what the bar's copy button does.
- **Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y.** **Space+drag** pans. **W** draws walls (halls).
- All keys go through `isShortcut` (the physical key, Hebrew layout safe).

## 6. What does not change
- The canvas, its rendering and its speed rules (CLAUDE.md "The camera is a transform").
- Every reducer action, every check, every data shape.
- `/meeting`: it mounts the same `StudioScreen`, so it gets the same shell. Nothing in it is a cost.
- `/outputs`, `/scene`, the client side, print.

## 7. Checks
- `npm run typecheck`, `check:actions`, and every `check:*` whose module is touched (the bars call into many).
- **Headless screenshots (Playwright, scratchpad) of the board's states, compared side by side with the board:**
  - Studio: S1–S6
  - Halls: H1–H6
  - The studio states need an event the supplier login cannot reach; see §8 phase 3.

## 8. Build order — each phase shown to Ravid before the next

1. **Phase 1 — shared parts** (§2). The shape editor moves onto them. Done when the editor looks and works exactly as before, its ⋯ is now last, and typecheck is green.
2. **Phase 2 — Halls** (§3).
   - The one card with rail · canvas · panel; the 1b chrome.
   - Every SelectionBar / OutlineBar kind as quick bar + groups; ZoneDialog in the frame.
   - **Done when** H1–H6 screenshot like the board, every chip that existed has a home (checked against the map in §0), and a viewer still sees a read-only plan.
3. **Phase 3 — Studio** (§4), in three steps:
   - **3a** the shell: rail, no header, view cluster, ⋯, save pill, the end panel with the list and the nothing-selected groups, the 3D card.
   - **3b** the bars, kind by kind (table → block → stage → items → multi → the rest).
   - **3c** the modes (fill tool, dressing, armed).
   - **Done when** S1–S6 screenshot like the board and every Inspector prop is reachable. For screenshots: a throwaway studio login on develop, or Ravid's own, with nothing saved.
4. **Phase 4** — CLAUDE.md's Design System Guidelines rewritten for the shell (the end panel replaces SidePanel on /halls; no studio header; PlaneRail gone) and `DESIGN.md` touched where the board added a rule.

## 9. DECIDEs (my calls, open to argument)

- **D1 — 1b's ⋯ sits in the canvas toolbar**, after the view toggles. The board draws it there.
- **D2 — the tape and centre guides stay in the canvas strip.** They are view tools; the board's strip simply didn't draw them.
- **D3 — the end panel is collapsible.** At 1440px with the app nav open, the studio's canvas would be about 580px wide with both side columns showing. The board doesn't show a collapsed state.
- **D4 — Halls becomes ONE card.** The board draws one frame with hairlines, so `SidePanel` leaves /halls (it stays the app nav's).
- **D5 — the document ⋯ opens groups, not popovers,** for anything with fields (numbering, saved sketches, underlay). That keeps the board's rule that fields live in panel groups.
- **D6 — paste lives in the document ⋯ and on the keys.** Copy lives in the quick bar, cut in its ⋯.
- **D7 — מילוי במות moves from the canvas strip to the catalog rail.** It creates; the strip is for viewing.
- **D8 — the halls rail keeps the code's seven sections**, not the board's sample regrouping (פתחים / מבנה / מים וצמחייה / מהקטלוג). The board's own spec says "tile grid by `ADD_TOOL_SECTIONS`".
- **D9 — ground tiles show their material swatch**, every other tile a lucide icon (the board draws icons for all). A "דשא" icon says less than the grass.
- **D10 — no search on the halls rail.** About 45 tools in short sections.
- **D11 — a list row selects every item of its product in its layer**, so the quick bar is then the multi bar.
- **D12 — yes to the בדיקות badge** on the folded list row (the board's second open question).
- **D13 — a block's member row opens dressing focus on that member,** which is what double-clicking it does today. Selecting half a block alone was deliberately removed (2026-10-17).
- **D14 — the drape's length is read-only in the quick bar.** It is the rail's; the ends are dragged, or the מסילה group is typed.
- **D15 — the venue ▾ on /halls is the sidebar's venue switch,** offered on the canvas too. The sidebar one stays.
- **D16 — standing notices ride the hint row.** These are venue access / unset, the viewer note and the client's proposal. The top corners are the toolbar's and the view cluster's.
- **D17 — the zone dialog gains "צבע על התוכנית"** (a few swatches writing `Zone.style.fill`). The model has had the field; nothing edited it.
- **D18 — "+ שולחן לבלוק" is not built this round** (§10). The block group lists and opens members only.
- **D19 — "never over the selection" is approximate in v1.** Pickers open beside the panel or upward from the quick bar, clamped as today. True avoidance (reading the selection's screen box) comes later if a picker is seen covering one.

## 10. Not in this round (the board shows them; the model or the code does not have them)
- A sliding door ("הזזה"), a wall thickness, a "כניסת אורחים" flag on a door, a wall's look ("טיח לבן").
- "+ שולחן לבלוק" (add a table to a block from its group).
- True collision-avoidance for pickers (D19).
