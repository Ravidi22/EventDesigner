# Bug round C — the curtain rod

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §3 of the 2026-11-21 bug-round design: draw a rod, then hang a curtain on it.

**Architecture:** The rod tool reuses the swag tool's drawing pane (`components/rod-draw-pane.tsx`, `drag` mode: a click per post, a press-drag for one line); the hang is the existing swap with a bare rod's own list.

**Spec:** [docs/superpowers/specs/2026-11-21-bug-round-design.md](../specs/2026-11-21-bug-round-design.md) §3; findings CR-3, CR-5.

## Global Constraints

- One rod per arming; Shift keeps the tool; Esc cancels; Enter / double-click ends.
- Dragging the rod row off the rail still lays a fixed rod of the row's length.

## Review Focus

- A click on an existing rod while the tool is up draws a new rod, never a second one on top (the pane takes every press).
- A rod drawn shorter than the pane's minimum is no rod (the pane cancels).
- The curtain list of a bare rod holds curtains only — never an LED strip, a sail, a ceiling cloth or the rod itself.

---

### Task 1: The rod tool
- [x] `rodTool` state in studio-screen: arming the rod row takes it up (the row wears the armed look); `finishRodTool` lays a bare rod of the row along the points — height `defaultRailHeight`, thickness the row's depth — selected, with a hint; Shift keeps the tool.
- [x] Canvas `rodDraw` takes `drag` and `id` (re-mount per rod); a standing hint pill with ✕.

### Task 2: "תליית וילון על המוט" (CR-3)
- [x] A bare rod's swap list is the curtain rows that take a rod rail; `SwapPanel.label` names the pick row and its picker; picking one is `setPlacementVariant` — the rod's line is kept.

### Task 3: Verify, commit, push
- [x] Typecheck, every `check:*`, headless `rc.js` (a ר by clicks, a line by drag, a curtain hung from the bar).
