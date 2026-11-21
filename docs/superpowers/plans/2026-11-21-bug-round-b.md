# Bug round B — stairs and banquettes on a stage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §2 of the 2026-11-21 bug-round design: the sofa placed and dragged on its banquette, ר banquettes, touching items staying touching, the banquette's "…".

**Architecture:** Pure rules in `lib/design-document/` with `isMain` self-checks (`bench.ts`, `edge-touch.ts`, `stage.ts`); the studio wires them into its handles and its change handlers.

**Tech Stack:** TypeScript, tsx self-checks, Playwright headless on the throwaway studio.

**Spec:** [docs/superpowers/specs/2026-11-21-bug-round-design.md](../specs/2026-11-21-bug-round-design.md) §2, DECIDE 1, 2, 9, 10; Ravid's answer: touching banquettes stay two pieces.

## Global Constraints

- One user action = one undo entry; nothing set per pointermove except through `drag` (amended).
- Absent new fields read exactly as before (no stored row changes until edited).

## Review Focus

- A banquette with no sofa: no sofa handle, no "מול השולחן".
- A sofa the whole banquette long: nowhere to move — the offset is dropped.
- A flight never grows to close a joint (it is quoted per module).
- Alt on a grip or a slide: neighbours cut, never grown.
- A disc's closed rim: the touching rules stand down (shareSide / freeStretch as before).

---

### Task 1: The sofa has a place along its banquette (§2.1)
- [x] `BenchSide.offsetMm` (types.ts); `benchLayout`/`benchBlocks` lay the run there, held on the strip; `patchBenchSide` takes `offsetMm` (`null`/0 = centred; dropped on a full-length run).
- [x] `sofaFacingTable(frame, side, tables)` — the nearest table or block on that side within 2.5 m gives the run its length and middle; else 1.80 m centred (DECIDE 9). `check:bench`.
- [x] Studio: a side turned into a sofa, or "מול השולחן" in the banquette group, lays the run there (stage and standalone banquettes); "למרכז הבנקט" centres it.
- [x] Plan: the picked banquette's sofa run is a dashed handle — a press slides it (stage: `EdgeItemShape.sofas`; standalone: `BenchSofaHandles`).

### Task 2: Touching banquettes stay two pieces
- [x] `joinRuns` no longer joins banquettes (flights still join).

### Task 3: Items that touch stay touching (§2.3, DECIDE 10, QA EI-6, EI-13)
- [x] `lib/design-document/edge-touch.ts` (`check:edge-touch`): `keepTouching`, `slideRoom`, `typedWidth`, `flushNeighbours`.
- [x] Grips and slides pass the press-time items and Alt; the host cuts (shareSide) then closes up (keepTouching) unless Alt. A typed width holds the corner end, else the neighbour end, else the middle.

### Task 4: ר banquettes (§2.2, DECIDE 1)
- [x] Banquettes meeting at an inside corner of one stage are mitred like stairs (`check:stage`).
- [x] A loose banquette carried alone snaps flush to a stage banquette's strip (its end or its side).
- [ ] Not built: the corner piece across two stages, the joined drawing of two loose banquettes, the 3D end panel at a step.

### Task 5: The banquette's "…" (§2.4)
- [x] "היפוך הצדדים" swaps a banquette's two sides.

### Task 6: Verify, commit, push
- [x] Typecheck, every `check:*`, headless `rb.js` (facing, drag, typed 60 cm, slide, flip).
