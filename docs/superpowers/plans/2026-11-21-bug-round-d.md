# Bug round D — material

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §4 of the 2026-11-21 bug-round design: every product may say what it is made of, and the room builds it in that.

**Architecture:** `lib/catalog/material.ts` (pure: the list, Hebrew names, metal finishes, `materialOf` — shape → shade → product → undefined) and `lib/scene/materials.ts materialRefOf` (material → the scene's surface). The scene's one context seam (`tables.ts contextFor`) resolves it; every recipe that guessed reads it first.

**Spec:** [docs/superpowers/specs/2026-11-21-bug-round-design.md](../specs/2026-11-21-bug-round-design.md) §4, DECIDE 3, 7, 8; finding MT-1, VS-4.

## Global Constraints

- Absent = every recipe's own guess, to the digit (no stored row changes until a material is picked).
- A material never writes a texture (DECIDE 8). Shade materials live in the appearance JSON (DECIDE 3) — no migration.

## Review Focus

- A shade with no material of its own is the product's; a shape with none is the shade's.
- Clear glass and crystal keep their own near-white whatever the shade's colour; "glass-tinted" takes it.
- An explicit spec field (a chuppah's finish, a pendant's glass) still wins over the product's material.

---

### Task 1: The data
- [x] `MapAppearance.material`, `shadeMaterials`, `baseMaterial`; `ShapePart.material`; `shape-list.ts` carries the first shape's as `baseMaterial` both ways. `check:material`.

### Task 2: The room
- [x] `materialRefOf(material, colour)`; `ItemContext.material` (first shape → shade → row) and its tone when nothing gives a colour.
- [x] Read first by: the vase and plinth (MT-1), the candlestick frame and arms, the chandelier frame, the bar's body, the fallback body; each element-model part by its own (`ElementPart.material`). `check:items`.

### Task 3: The editors
- [x] Drawer, "גוונים וצבעים": the item's "חומר" and one per shade.
- [x] Shape editor: the item's "חומר" in its look group, with the metal finishes (זהב · כסף · שחור · רוז גולד) as colour presets on the shade being looked at; every shape's own "חומר" group — on picture rows too (VS-4).

### Task 4: Verify, commit, push
- [x] Typecheck, every `check:*`, headless `rd.js` (metal + gold on the QA vase, the 3D pane, stored).
- [ ] Not built: a material's own look on the PLAN (the spec's "Plan" column — glass faint, metal with a highlight); the plan still draws the colour.
