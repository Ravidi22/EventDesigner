# Bug round A (remainder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Round A of the 2026-11-21 bug round: the eight fixes left after 192df51.

**Architecture:** Each fix is local to the file that owns the behaviour. Pure rules go in `lib/` with an `isMain` self-check (`npm run check:<name>`). UI fixes are verified headless on the throwaway studio "בדיקת מעטפת".

**Tech Stack:** Next.js 16 / React 19, TypeScript, tsx self-checks, Playwright (scratchpad harness `h/`).

**Spec:** [docs/superpowers/specs/2026-11-21-bug-round-design.md](../specs/2026-11-21-bug-round-design.md) §1, findings [docs/qa/2026-11-21-bug-round.md](../../qa/2026-11-21-bug-round.md).

## Global Constraints

- Every typed number in the UI is cm; Hebrew copy; RTL logical properties.
- No `setState` per pointermove in the canvas (CLAUDE.md "The camera is a transform"); equality-checked state only.
- One user action = one undo entry.
- Never touch production data; test data only in org 90901584 (throwaway).
- `npm run typecheck` and every touched `check:*` pass before the commit; push `master` at the end.

## Review Focus

- A drag that drops a neighbour banquette mid-gesture and gives it back must keep that banquette's dressing (Task 1 test: orphans are pruned only when the gesture ends).
- Two COPIES of one stage in one run: the second copy's banquette must still draw (Task 2 test).
- A stage with nothing on a side keeps its middle grip at the box edge (Task 3: outset 0).
- Closing the shape editor with NO edits must not ask (Task 6).
- A shade with no colour: the editor's shade row shows the empty swatch and the plan falls back to the item's fill (Task 8).

---

### Task 1: Dressing on a banquette that went is removed (EI-11)

**Files:**
- Create: `lib/design-document/perch.ts` (+ `"check:perch"` in package.json)
- Modify: `app/(app)/studio/studio-screen.tsx` (`act`, `batch`, `endDrag`, `settleDrag`)

**Interfaces:**
- Produces: `dropOrphanPerches(doc: DesignDocumentContent): DesignDocumentContent` — removes every placement with `perch` whose stage placement exists but holds no `bench`-kind item with `perch.itemId`; returns `doc` itself when nothing goes.

- [ ] Self-check asserts: a perched candle on banquette b1 survives while b1 exists; goes when b1 is removed from `stairs`; goes when b1's kind becomes `stairs`; a doc with no perched items is returned by identity.
- [ ] Studio: `act` and `batch` prune the new present (same entry); a drag (`drag`) never prunes; `endDrag` and the end of `settleDrag` prune the present in place (folded into the gesture's entry).
- [ ] Run `npm run check:perch`, commit with the round.

### Task 2: Joined runs skip per stage (EI-14)

**Files:** `lib/design-document/edge-runs.ts`, `app/(app)/studio/canvas-stage.tsx:1311,2465`, `app/(app)/outputs/placement-map.tsx:479,789`

**Interfaces:** `joinedItemIds(runs)` is replaced by `joinedItemsByStage(runs: readonly JoinedRun[]): Map<string, Set<string>>` (stage id → item ids). Callers pass `joined.get(p.id)` as the stage's skip set.

- [ ] Self-check: two stages A and B both holding an item "a1", only A's in a run → the map has "a1" under A and nothing under B.

### Task 3: The stage's middle grips stand past its edge items (EI-8)

**Files:** `app/(app)/studio/canvas-stage.tsx` (`ResizeHandles`, the `resizing` memo, `rotatable`)

**Interfaces:** `ResizeHandles` takes `outset?: (sx: number, sy: number) => number` (mm, side grips only). The grip is drawn `outset` further out; the gesture subtracts it so a press does not jump. A local helper `edgeItemReach(stage): { minX, maxX, minY, maxY }` (edge item polygons in the stage frame) feeds both the grips and the rotate knob.

- [ ] Headless: a 6×3 stage with a front flight — the front middle grip is outside the flight; a press on the flight picks it.

### Task 4: A curtain dragged off the rail lights the rod it will take (CR-2)

**Files:** `components/plan-canvas.tsx` (new prop), `app/(app)/studio/canvas-stage.tsx`

**Interfaces:**
- `PlanCanvas.onDragOverAt?: (p: Point | null) => void` — called on every dragover with the raw plan point, `null` on dragleave and drop.
- `curtainDropAt(product, at, doc, structure): CurtainDrop | null` — ArmedPane's computation moved into one function; ArmedPane and the drag-over both call it.
- Canvas state `dragRodId: string | null` (set only when it changes); the lit rod is drawn like ArmedPane's (accent, opacity 0.55, width 10, non-scaling).

- [ ] Headless: a curtain dragged from the rail over a bare rod shows the lit stroke; let go, it hangs on that rod.

### Task 5: Silhouette handles never sit on the box's grips (VS-6)

**Files:** `lib/element/elevation.ts` (+ its self-check), `app/(app)/catalog/elevation-canvas.tsx`

**Interfaces:** `handleSpots(handles: Pt[], grips: Pt[], radius: number, axisX: number): Pt[]` — a handle within `radius` of a grip is drawn `radius × 1.6` toward the axis (`axisX`); others unchanged. The drag subtracts the shown-minus-true offset taken at the press.

- [ ] Self-check: a cone's floor point at r = 1 is moved off the corner toward the axis; a mid-height point is unchanged.

### Task 6: ✕ and ביטול ask before discarding (VS-7)

**Files:** `app/(app)/catalog/appearance-modal.tsx`

- [ ] `requestClose()`: with `hist.canUndo` false it closes; else it opens `ConfirmDialog` — title "לסגור בלי לשמור?", body "השינויים במראה לא יישמרו.", confirm "סגירה בלי שמירה" (danger). ✕ and ביטול call it.
- [ ] `stopThenClose` ignores a close whose `e.target !== e.currentTarget` (the confirm dialog's own close).

### Task 7: One colour-picker drag is one undo step (VS-8)

**Files:** `components/style-fields.tsx`, `app/(app)/catalog/appearance-modal.tsx`

**Interfaces:** `StyleFields` takes `onLiveChange?: (style: ElementStyle | undefined) => void` and `onCommit?: () => void`. When given, the colour swatch's `input` events call `onLiveChange`, and its native `change` and `blur` call `onCommit`. Every other control still calls `onChange`. The modal maps `onLiveChange` → `hist.amend`, `onCommit` → `hist.commit`.

- [ ] Headless: 30 colour input events then a change → `canUndo` steps back once to the old colour.

### Task 8: The shade's colour is the colour, in the editor too (VS-1, DECIDE 4)

**Files:** `app/(app)/catalog/appearance-modal.tsx`, `app/(app)/catalog/product-drawer.tsx`

**Interfaces:** `AppearanceModal.onSave` patch gains `variants?: ProductVariant[]` (only when a swatch changed). The drawer's `patch(p)` already merges it.

- [ ] With live shades: the item's "מראה" group shows a shade switcher (chips of live shade names), "צבע הגוון" (a colour field editing that shade's `swatch` in the draft, through history), then `StyleFields lineOnly`. Without shades: unchanged.
- [ ] Every preview in the modal (`tone`, `itemColor`) uses the PREVIEWED shade's swatch, then the item's fill.
- [ ] Headless: the QA vase "כד בדיקה QA" → switch shade, change its colour, save the look, save the row → the plan and the card draw the new colour; reopening shows it.

### Task 9: Verify, commit, push

- [ ] `npm run typecheck`; `npm run check:perch check:edge-runs check:stage check:edge-copy` (and `npm run check:all`-equivalent loop over every `check:*`).
- [ ] Commit `fix(studio, editor): bug round A part 2 — …`, fast-forward `master`, push.
