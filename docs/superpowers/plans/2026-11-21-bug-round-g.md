# Bug round G — two new products: קאנט and table garden

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §7 of the 2026-11-21 bug-round design.

**Spec:** [docs/superpowers/specs/2026-11-21-bug-round-design.md](../specs/2026-11-21-bug-round-design.md) §7, DECIDE 6, 12, 14.

## Review Focus

- A קאנט is worn WITH the cloth, never in its place (anchor "free"); absent edge sides = every side.
- A table garden follows its table when the table is resized or swapped (derived every draw).
- Billed by the metre: the קאנט's chosen sides, the bed's length — in the quote and in procurement.

---

### Task 1: קאנט
- [x] `lib/catalog/kant.ts` (`check:kant`): sides of a table (a round one is one side), `kantRunMm`, `kantStrips`.
- [x] Category `table-edges` "קאנטים" (grp-table-design, per metre); `Placement.edgeSides` + `setPlacementEdgeSides`; `MapAppearance.kant.dropMm` (default 15 cm).
- [x] Plan: a band over the cloth's 9 cm fall along the chosen sides (dressingSpots). Room: strips hanging `drop` from the top's edge over the cloth (tables.ts). Quote and procurement: `MeasureContext.edgeRunMm`.
- [x] Item panel "צדדים": a switch per side, its metres.
- [ ] Not built: picking sides on the plan (lit lines), the contour band at its bottom edge (`Border`).

### Task 2: Table garden
- [x] `lib/catalog/table-bed.ts` (`check:table-bed`): a band down a long table (−40 cm each side, −30 cm each end, ≥20 cm, a typed width) or a disc 40 cm inside a round's rim; `arrangement.bed`.
- [x] Laid by dressingSpots on its table every draw; its flowers cover the bed; billed by the bed's length (`edgeRunMm`).
- [x] Shape editor: "גינת ירק על השולחן" and its width.
- [ ] Not built: one bed along a whole block's spine (each member wears its own), items dropped onto it standing IN it.

### Task 3: Rows, verify, commit
- [x] Rows "קאנט קטיפה" and "גינת ירק לשולחן" in the develop studio (and the throwaway). Headless `rg.js`.
