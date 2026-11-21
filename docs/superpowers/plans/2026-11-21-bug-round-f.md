# Bug round F — pattern by hand

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §6 of the 2026-11-21 bug-round design (QA PT-1): tables picked or left out by hand over a דפוס.

**Spec:** [docs/superpowers/specs/2026-11-21-bug-round-design.md](../specs/2026-11-21-bug-round-design.md) §6, DECIDE 5.

## Review Focus

- The source table is never a target, by pattern or by hand.
- A pattern or "החצי השני" changed clears the hand picks.
- Inside a block ("שאר הבלוק") the map is not clickable.

---

- [x] `withHandPicks` / `toggleHandPick` in `lib/studio/table-patterns.ts` (`check:table-patterns`).
- [x] `TablePatternPicker`: the map 220 px, each table's number, each table a toggle; "דפוס + בחירה ידנית · N שולחנות" and "איפוס"; picks cleared on a new pattern or half.
- [x] Headless `rf.js`: table 4 taken out of "כל השולחנות" → 3 tables; איפוס → 4.
