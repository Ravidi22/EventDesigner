# Design Mode Layers, Ceiling Rods, Bulk Dressing & Architectural Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the studio's design pass work like a layered drawing tool — what is overhead reads as overhead, ceiling items hang from rods built into the hall, one dressed table can be copied onto twenty-three others, and the plans that come out are drawn to architectural standard at a stated scale.

**Architecture:** Four additive changes, no migrations. `Layer` gains an *active* state (locking for free); `VenueStructure` gains `rigs` and `Placement` gains `hang`, mirroring the wall/`WallSpan` pair a drape already uses; two new document actions replace two narrower ones so bulk falls out of a better *selection* rather than a matrix of commands; and the placement map is reframed inside a `SheetFrame` that states a true scale.

**Tech Stack:** Next.js (see `AGENTS.md` — read `node_modules/next/dist/docs/` before writing route/page code), React 19, TypeScript, Tailwind v4 `@theme` tokens, Drizzle + Postgres (JSONB, untouched here), SVG for all drawing.

**Spec:** `docs/superpowers/specs/2026-09-01-design-mode-layers-design.md`

**Branch:** `feat/design-mode-layers`

## Global Constraints

Every task's requirements implicitly include all of these.

- **Tests are self-checks, not a framework.** This repo has no jest/vitest. Pure modules end with `if (isMain(import.meta.url)) { ... }` using a local `assert`, and are wired to an `npm run check:*` script in `package.json`. TDD here means: add the assertion, run the script, watch it fail, implement, watch it pass.
- **No migrations.** `venue_structures.structure` and `design_documents.content` are JSONB typed through TypeScript. Every new field is optional (`?`) and every reader defaults it. Do not touch `lib/db/schema.ts`. Do not run `db:generate` or `db:push`.
- **RTL-first.** Hebrew UI. Use CSS logical properties (`ms-*`/`me-*`, `start`/`end`), never `left`/`right` for flow-relative spacing. Arrow-key handlers: → is *previous*.
- **Design tokens, not raw hex.** Use the `@theme` tokens in `app/globals.css` (`text-accent`, `bg-accent-tint`, `border-border`, `text-muted`, `text-ink`, `text-ink-soft`, `bg-canvas`, `bg-inset`, `warn-ink`). The one primary violet is `#6D55BD` = `accent`; never introduce a second purple.
- **`npm run check:costs` is a hard gate for anything under `app/(app)/outputs`.** That is a printing surface: no `costPrice`, no `lib/suppliers/` import, no margin, no forecast. Phase D touches it.
- **Print strokes use `vectorEffect="non-scaling-stroke"`** so weights stay constant as the scale changes.
- **`ponytail:` comments** mark deliberate simplifications, naming the ceiling and the upgrade path.
- **Staging.** The working tree carries unrelated WIP plus repo-wide CRLF churn. **Never `git add -A` or `git add .`** — stage only the exact files each task names.
- **Verify before done:** `npm run typecheck` passes at the end of every task (a Stop hook also runs it).

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `lib/outputs/scale.ts` | Pure: pick a standard drawing scale that fits a frame. Self-checked. |
| `lib/outputs/sheets.ts` | The `PlanSheet` type and the five presets. Pure data. |
| `lib/outputs/dimensions.ts` | Pure: overall dimension lines from a zone boundary. Self-checked. |
| `app/(app)/outputs/sheet-frame.tsx` | The drafting frame: title block, scale bar, north arrow, legend. |

**Modified:**

| Path | Change |
|---|---|
| `lib/design-document/types.ts` | `RigHang`; `Placement.hang` |
| `lib/design-document/stacking.ts` | ceiling is in no floor stack (self-check) |
| `lib/design-document/actions.ts` | `applyToTables` replaces two actions; `copyDressing`; `setPlacementHang` |
| `lib/venues/structure.ts` | `CeilingRig`; `rigs`; `addRig`/`updateRig`/`removeRig`/`rigLengthMm` |
| `lib/venues/selection.ts` | `PlanSelectionKind` gains `"rig"`; `hitsInBox` picks up rods |
| `lib/studio/anchor.ts` | `rigSegment`/`resolveHang`/`nearestRig` |
| `lib/studio/snap.ts` | `SnapContext.lines` — snap a point onto a line |
| `components/footprint-shape.tsx` | `overhead?: boolean` |
| `app/(app)/studio/canvas-stage.tsx` | ceiling pass, layer dimming, rod drawing, hang gestures |
| `app/(app)/studio/studio-screen.tsx` | `activeLayer`; hang on drop; selection commands; bulk callbacks |
| `app/(app)/studio/toolbar.tsx` | layer chips become active/visible |
| `app/(app)/studio/inspector.tsx` | rig readout; selection commands; bulk buttons |
| `app/(app)/halls/halls-screen.tsx` | `"rigs"` dock mode |
| `components/venue-inspector.tsx` | rig panel |
| `app/(app)/outputs/placement-map.tsx` | takes a `PlanSheet`, draws content only |
| `app/(app)/outputs/outputs-screen.tsx` | sheet multi-select |
| `package.json` | `check:scale`, `check:sheets`, `check:dimensions` |

---

# PHASE A — Layers become a plane

### Task 1: Ceiling leaves the floor stack

The bug: `classify()` never asks about `layer`, so a chandelier is z-ordered among rugs and tables and can draw *behind* a table.

**Files:**
- Modify: `lib/design-document/stacking.ts` (self-check block at the end)
- Modify: `app/(app)/studio/canvas-stage.tsx:196-204` (`classify`), and the render pass

**Interfaces:**
- Consumes: nothing.
- Produces: `classify(p: Placement): StackKind | undefined` returns `undefined` for `p.layer === "ceiling"`. Later tasks rely on ceiling placements never appearing in `floorStack()`.

- [ ] **Step 1: Write the failing assertions**

In `lib/design-document/stacking.ts`, inside the `isMain` block. Find the `kinds` record and the `doc` that follow the comment `// rug + two tables + an object, plus a cloth and a drape that are in no stack at all.` Add a ceiling placement to that document and assert it is in no stack.

```ts
  // rug + two tables + an object, plus a cloth, a drape and a CHANDELIER that are in no stack.
  const kinds: Record<string, StackKind | undefined> = {
    rug: "carpet",
    lamp: "item",
    cloth: undefined,
    drape: undefined,
    chandelier: undefined, // overhead — nothing on the floor for it to be in front of
  };
  const classify = (p: Placement) => kinds[p.id];
  const doc: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [table("t1"), table("t2")],
    placements: [
      place("rug"),
      place("lamp"),
      place("cloth", { tableId: "t1", layer: "table" }),
      place("drape"),
      place("chandelier", { layer: "ceiling" }),
    ],
  };
```

Then, directly after the existing assertion `"…so the buttons are not offered for them"`, add:

```ts
  assert(!isStackable(stack, { kind: "placement", id: "chandelier" }), "a ceiling item is in no floor stack");
  assert(names(stack) === "rug t1 t2 lamp", "…and does not appear among the things on the floor");
  assert(restackTo(stack, [{ kind: "placement", id: "chandelier" }], "front").length === 0, "…so it cannot be restacked");
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run check:stacking`
Expected: FAIL — `stack.length === 4` on the existing assertion, because the added chandelier makes it 5 while `classify` in the self-check already returns `undefined`. Adjust the existing `assert(stack.length === 4, ...)` message to read `"a cloth, a drape and a chandelier are in no stack"` — the count stays 4 and that existing line is what pins it.

> **Note for the implementer:** the self-check injects its own `classify`, so the *self-check* passes as soon as the map above says `chandelier: undefined`. The real fix is in the canvas, which has its own `classify`. The assertions above are the executable statement of the contract; Step 3 is what makes the app obey it.

- [ ] **Step 3: Fix the real classifier**

In `app/(app)/studio/canvas-stage.tsx`, the `classify` callback (search for `const classify = useCallback`):

```ts
  const classify = useCallback((p: Placement): StackKind | undefined => {
    const r = resolve(p.variantId);
    if (r?.anchor === "wall") return undefined; // a drape hangs on a wall
    // Overhead. It is not standing on the floor, so it is in no floor stack and nothing on the
    // floor can be in front of it — it draws in its own pass, last. Before this, a chandelier was
    // sorted among the rugs and tables and could be occluded by one.
    if (p.layer === "ceiling") return undefined;
    if (p.layer === "table" && p.tableId) return undefined; // a cloth or a chip belongs to a table
    return r?.sizing === "stretch" ? "carpet" : "item";
  }, []);
```

- [ ] **Step 4: Add the ceiling pass**

`sorted` (search `const sorted = useMemo`) currently sends non-drape, non-table, non-stretch placements to `items`. Add a `ceiling` bucket **before** the `stretch` test so an overhead item never lands in `carpets` or `items`:

```ts
    for (const p of doc.placements) {
      const r = resolve(p.variantId);
      if (r?.anchor === "wall") {
        drapes.push(p);
      } else if (p.layer === "table" && p.tableId) {
        if (r?.anchor === "table") coverByTable.set(p.tableId, p);
        else chipsByTable.set(p.tableId, [...(chipsByTable.get(p.tableId) ?? []), p]);
      } else if (p.layer === "ceiling") {
        ceiling.push(p);
      } else if (r?.sizing === "stretch") {
        carpets.push(p);
      } else {
        items.push(p);
      }
    }
```

Declare `const ceiling: Placement[] = [];` beside the other buckets and add `ceiling` to the returned object.

Then render it as the **last** pass in the canvas, after the existing drapes block (search for the comment `Drapes last, over the wall they hang on`) — move that comment's block above the new one and add:

```tsx
          {/* OVERHEAD, and therefore last. A chandelier is not standing on the floor: nothing down
              there can be in front of it, so it is drawn after everything, outside the floor stack.
              See lib/design-document/stacking.ts. */}
          {layerVisible.ceiling &&
            sorted.ceiling.map((p) => (
              <PlacementNode
                key={p.id}
                placement={p}
                x={p.position.x}
                y={p.position.y}
                selected={isSel("placement", p.id)}
                ctx={ctx}
                drag={nodeProps({ kind: "placement", id: p.id }, ctx)}
              />
            ))}
```

Remove `ceiling` placements from the `movable` list's `sorted.items` filter — they now come from `sorted.ceiling`:

```ts
    const placed = [
      ...(layerVisible.floor ? sorted.carpets : []),
      ...sorted.items.filter((p) => layerVisible[p.layer]),
      ...(layerVisible.ceiling ? sorted.ceiling : []),
    ];
```

- [ ] **Step 5: Verify**

Run: `npm run check:stacking` → Expected: PASS, printing `stacking self-check passed`
Run: `npm run typecheck` → Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/design-document/stacking.ts "app/(app)/studio/canvas-stage.tsx"
git commit -m "$(cat <<'EOF'
fix(studio): a chandelier is not standing on the floor

classify() never asked about layer, so ceiling placements went into
floorStack() and were z-ordered among the rugs and tables -- a chandelier
could draw BEHIND a table. Overhead items leave the stack entirely and get
their own pass, drawn last, so nothing on the floor can occlude them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The overhead look

Dashed, unfilled, no shadow — the architectural convention for "above the cut plane". This is what makes the ceiling sheet legible in black and white, and what tells the designer at a glance that the thing under the cursor is overhead.

**Files:**
- Modify: `components/footprint-shape.tsx`
- Modify: `app/(app)/studio/canvas-stage.tsx` (the ceiling pass from Task 1)

**Interfaces:**
- Consumes: `sorted.ceiling` from Task 1.
- Produces: `OVERHEAD_DASH: string` and `FootprintShape`'s `overhead?: boolean` prop, both used by Phase D's placement map.

- [ ] **Step 1: Add the prop to the shared shape**

In `components/footprint-shape.tsx`, above `FootprintShape`:

```tsx
/** The dash pattern for anything overhead, in world millimetres — 12cm on, 9cm off, which reads as
 *  a dashed line from a whole-hall zoom down to one table. The architectural convention for
 *  something above the cut plane, and the reason a ceiling plan is legible when it is photocopied
 *  in black and white: an overhead item and a floor item cannot be told apart by fill alone. */
export const OVERHEAD_DASH = "120 90";
```

Change the signature and pass the dash through every branch:

```tsx
export function FootprintShape({
  footprint,
  overhead,
  ...common
}: { footprint: Footprint; overhead?: boolean } & ShapeProps) {
  // Overhead items are drawn, never filled: the convention says the thing is above you, and a
  // filled shape reads as something you would walk around.
  const od = overhead ? { strokeDasharray: OVERHEAD_DASH, vectorEffect: "non-scaling-stroke" as const } : undefined;
  const props = { ...od, ...common };
  ...
}
```

Replace every `{...common}` spread in the four branches with `{...props}` (keeping the existing `as React.SVGProps<...>` casts).

- [ ] **Step 2: Use it in the canvas ceiling pass**

`PlacementNode` must forward an `overhead` flag to its `FootprintShape`. Add an `overhead?: boolean` prop to `PlacementNode` and pass it through; in the ceiling pass from Task 1, set `overhead`. Overhead nodes also drop their shadow — find the shadow/filter attribute `PlacementNode` applies and skip it when `overhead` is set.

- [ ] **Step 3: Verify**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run dev`, open `/studio`, drag a שנדליר from the rail onto the plan.
Expected: it draws as a dashed unfilled outline, and it draws *over* any table it overlaps.

- [ ] **Step 4: Commit**

```bash
git add components/footprint-shape.tsx "app/(app)/studio/canvas-stage.tsx"
git commit -m "$(cat <<'EOF'
feat(studio): overhead items draw dashed and unfilled

The architectural convention for something above the cut plane. Not
decoration: on a black-and-white ceiling sheet an overhead item and a floor
item cannot be told apart by fill alone, and PRODUCT.md requires those sheets
be legible in B&W.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: An active layer

Clicking a layer chip makes it the one you are working in. Every other visible layer dims and stops accepting the pointer — which is layer *locking* obtained for free, with no `locked` flag and no third toggle.

**Files:**
- Modify: `app/(app)/studio/studio-screen.tsx` (state + prop passing)
- Modify: `app/(app)/studio/canvas-stage.tsx` (dim + disable)
- Modify: `app/(app)/studio/toolbar.tsx` (the layer chips)

**Interfaces:**
- Consumes: nothing.
- Produces: `activeLayer: LayerId | null` on both `CanvasStage` and `Toolbar` props; `null` means "all layers live", which is the pre-existing behaviour exactly. `isLive(layer: LayerId): boolean` inside `canvas-stage.tsx`.

- [ ] **Step 1: Hold the state**

In `app/(app)/studio/studio-screen.tsx`, beside the existing `layerVisible`:

```ts
  // WHICH layer is being worked in, as opposed to which are merely visible. null — the default, and
  // exactly how this screen behaved before — means every visible layer is live. Naming one dims the
  // others and takes them out of the pointer's reach, which is the whole of what "lock" would have
  // been: dressing tables without dragging a rug by accident is one click, and there is no second
  // flag to keep honest.
  const [activeLayer, setActiveLayer] = useState<LayerId | null>(null);
```

Pass `activeLayer` and `onActivateLayer={(l) => setActiveLayer((cur) => (cur === l ? null : l))}` to both `<Toolbar>` and `<CanvasStage>`.

- [ ] **Step 2: Dim and disable in the canvas**

In `app/(app)/studio/canvas-stage.tsx`, add `activeLayer: LayerId | null` to the props type and destructure it. Then:

```tsx
  /** Is this layer accepting the pointer? With no active layer every visible layer is, which is how
   *  this canvas has always behaved. */
  const isLive = (l: LayerId) => activeLayer === null || activeLayer === l;
  /** What a whole layer's <g> wears when it is visible but not the one being worked in. */
  const layerAttrs = (l: LayerId) =>
    isLive(l) ? undefined : { opacity: 0.35, style: { pointerEvents: "none" as const } };
```

Wrap each layer's render pass in a `<g {...layerAttrs(...)}>`:
- the floor stack pass and the venue features → `layerAttrs("floor")`
- the table-chips pass → `layerAttrs("table")`
- the drapes pass and the ceiling pass → `layerAttrs("ceiling")`

Tables are floor-plane, so they ride inside the floor `<g>`.

- [ ] **Step 3: Keep the marquee honest**

A rubber-band must never catch what the designer cannot see or touch. In the `movable` memo, gate each source on `isLive` as well as `layerVisible`:

```ts
    const out: { ref: SelectionRef; box: SnapBox }[] = isLive("floor")
      ? doc.tables.map((t) => {
          const b = footprintBounds(tableFootprint(t));
          return { ref: { kind: "table" as const, id: t.id }, box: { ...t.position, widthMm: b.w, depthMm: b.h } };
        })
      : [];
    const placed = [
      ...(layerVisible.floor && isLive("floor") ? sorted.carpets : []),
      ...sorted.items.filter((p) => layerVisible[p.layer] && isLive(p.layer)),
      ...(layerVisible.ceiling && isLive("ceiling") ? sorted.ceiling : []),
    ];
```

and guard the venue-features loop with `if (isLive("floor"))`. Add `activeLayer` to the memo's dependency array.

- [ ] **Step 4: The toolbar chips**

In `app/(app)/studio/toolbar.tsx`, add to the props type:

```ts
  /** The layer being worked in, or null for "all of them". */
  activeLayer: LayerId | null;
  onActivateLayer: (l: LayerId) => void;
```

Replace the `LAYERS.map(...)` block. The chip body activates; the eye is its own button inside the chip, and must `stopPropagation` so toggling visibility does not also change the active layer.

```tsx
      <div className="flex items-center gap-1">
        {LAYERS.map((l) => {
          const on = layerVisible[l.id];
          const active = activeLayer === l.id;
          return (
            <div
              key={l.id}
              className={
                "inline-flex items-center gap-1 rounded-md border ps-1 pe-2 py-1 text-xs transition-colors " +
                (active
                  ? "border-accent bg-accent-tint text-accent"
                  : on
                    ? "border-border bg-canvas text-ink"
                    : "border-transparent text-muted")
              }
            >
              {/* The eye is visibility. It is deliberately NOT the same press as choosing a layer to
                  work in: hiding the ceiling and working on the ceiling are different questions, and
                  one control that did both would make each of them unreachable half the time. */}
              <button
                type="button"
                onClick={() => onToggleLayer(l.id)}
                aria-pressed={on}
                aria-label={on ? `הסתרת שכבת ${l.label}` : `הצגת שכבת ${l.label}`}
                title={on ? `הסתרת שכבת ${l.label}` : `הצגת שכבת ${l.label}`}
                className="rounded-sm p-0.5 transition-colors hover:bg-bg"
              >
                {on ? <Eye className="h-3.5 w-3.5" strokeWidth={2} /> : <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />}
              </button>
              <button
                type="button"
                onClick={() => onActivateLayer(l.id)}
                aria-pressed={active}
                title={active ? "חזרה לכל השכבות" : `עבודה בשכבת ${l.label} בלבד`}
                className="font-medium"
              >
                {l.label}
              </button>
            </div>
          );
        })}
      </div>
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run dev`, open `/studio` on an event with tables and a rug.
Expected: clicking **רצפה** highlights it; the table-layer chips dim to 35% and cannot be clicked; clicking **רצפה** again returns everything to full. A marquee drawn while a layer is active catches only that layer's items. The eye still hides a layer independently.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/studio/studio-screen.tsx" "app/(app)/studio/canvas-stage.tsx" "app/(app)/studio/toolbar.tsx"
git commit -m "$(cat <<'EOF'
feat(studio): a layer you are working IN, not just one you can see

Naming an active layer dims every other visible layer to 35% and takes it out
of the pointer's reach -- which is the whole of what a per-layer lock flag
would have bought, with no flag to keep honest and no third toggle to learn.
null stays the default and is exactly the old behaviour.

The marquee follows the same rule: a rubber-band must never catch what the
designer cannot interact with.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# PHASE B — Ceiling rods

### Task 4: `CeilingRig` on the venue structure

**Files:**
- Modify: `lib/venues/structure.ts`

**Interfaces:**
- Produces: `CeilingRig`, `VenueStructure.rigs?`, `addRig(s, rig) => { structure, rigId }`, `updateRig(s, id, patch) => VenueStructure`, `removeRig(s, id) => VenueStructure`, `rigLengthMm(rig) => number`, `isHangingPoint(rig) => boolean`. Tasks 5, 6, 7 and 16 all consume these.

- [ ] **Step 1: Write the failing assertions**

At the end of the `isMain` block in `lib/venues/structure.ts`, before its final `console.log`:

```ts
  // --- ceiling rods ---------------------------------------------------------
  {
    const empty = emptyStructure();
    assert(empty.rigs === undefined, "a fresh structure has no rods, and no empty array either");

    const { structure: s1, rigId } = addRig(empty, {
      label: "מוט מרכזי",
      a: { x: 0, y: 0 },
      b: { x: 8000, y: 0 },
      heightMm: 4200,
    });
    assert(s1.rigs?.length === 1, "a rod is added");
    assert(Math.abs(rigLengthMm(s1.rigs![0]) - 8000) < 1e-9, "an 8m rod is 8m long");
    assert(!isHangingPoint(s1.rigs![0]), "…and is not a hanging point");
    assert(empty.rigs === undefined, "adding a rod does not mutate the structure it was added to");

    const s2 = updateRig(s1, rigId, { heightMm: 3800, loadKg: 200 });
    assert(s2.rigs![0].heightMm === 3800 && s2.rigs![0].loadKg === 200, "a rod can be re-measured and rated");
    assert(s2.rigs![0].label === "מוט מרכזי", "…without losing what it is called");
    assert(updateRig(s1, "gone", { heightMm: 1 }).rigs![0].heightMm === 4200, "updating a rod that is not there changes nothing");

    // A single eyebolt: both ends in the same place. Zero length, and every consumer has to
    // survive dividing by it — see resolveHang in lib/studio/anchor.ts.
    const { structure: s3 } = addRig(s2, { label: "נקודת תלייה", a: { x: 2000, y: 2000 }, b: { x: 2000, y: 2000 }, heightMm: 4000 });
    assert(rigLengthMm(s3.rigs![1]) === 0 && isHangingPoint(s3.rigs![1]), "a hanging point is a rod of zero length");

    const s4 = removeRig(s3, rigId);
    assert(s4.rigs!.length === 1 && s4.rigs![0].label === "נקודת תלייה", "a rod can be removed, and takes only itself");
  }
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run check:structure`
Expected: FAIL — TypeScript cannot resolve `addRig`, `rigLengthMm`, `isHangingPoint`, `updateRig`, `removeRig`.

- [ ] **Step 3: Implement**

Add the type after `StructureFeature` / `FEATURE_KIND_LABEL`:

```ts
/** A rod or truss built into the hall's ceiling — the thing a chandelier or a ceiling installation
 *  is physically hung from. The PROPERTY's, like a wall: measured once at /halls, and every event
 *  held in the room plans around the same rods.
 *
 *  Two absolute points rather than a node graph like the walls. Rods cross the room and share
 *  nothing with the walls, so there is no shared endpoint to keep in step and a graph would buy
 *  nothing but a second editor. `a === b` is a single eyebolt, drawn as a cross rather than a line —
 *  one geometry for both, so nothing downstream has to branch on which kind of fixing it is.
 *
 *  `loadKg` is RECORDED AND PRINTED, never validated against: summing what hangs off a rod needs a
 *  weight per product, and the catalog has none. */
export interface CeilingRig {
  id: string;
  label: string;
  a: Point;
  b: Point;
  heightMm: number; // above the floor
  loadKg?: number;
}
```

Add to `VenueStructure`:

```ts
  /** Absent on every venue drawn before rods existed — every reader defaults it. */
  rigs?: CeilingRig[];
```

`emptyStructure()` is unchanged (it must keep leaving `rigs` absent).

Then, beside the feature helpers:

```ts
export function rigLengthMm(rig: CeilingRig): number {
  return Math.hypot(rig.b.x - rig.a.x, rig.b.y - rig.a.y);
}

/** A single eyebolt rather than a run: both ends in the same place. Tested with a tolerance, not
 *  with ===, because a rod drawn by a click that moved one millimetre is still one fixing. */
export function isHangingPoint(rig: CeilingRig): boolean {
  return rigLengthMm(rig) < 1;
}

export function addRig(s: VenueStructure, rig: Omit<CeilingRig, "id">): { structure: VenueStructure; rigId: string } {
  const next: CeilingRig = { ...rig, id: crypto.randomUUID() };
  return { structure: { ...s, rigs: [...(s.rigs ?? []), next] }, rigId: next.id };
}

export function updateRig(s: VenueStructure, id: string, patch: Partial<Omit<CeilingRig, "id">>): VenueStructure {
  if (!s.rigs) return s;
  return { ...s, rigs: s.rigs.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function removeRig(s: VenueStructure, id: string): VenueStructure {
  if (!s.rigs) return s;
  return { ...s, rigs: s.rigs.filter((r) => r.id !== id) };
}
```

- [ ] **Step 4: Verify**

Run: `npm run check:structure` → Expected: PASS
Run: `npm run typecheck` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/venues/structure.ts
git commit -m "$(cat <<'EOF'
feat(venues): ceiling rods on the venue structure

A rod is the property's, like a wall: measured once at /halls, and every event
held in the room plans around the same ones. Two absolute points rather than a
node graph -- rods cross the room and share nothing with the walls, so a graph
would buy nothing but a second editor. a === b is a single eyebolt, so one
geometry covers both and nothing downstream branches on the kind of fixing.

Optional field on a JSONB column: no migration, and every venue already drawn
is unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Resolving a hang against a rod

`lib/studio/anchor.ts` already turns a stored wall span into points and a pointer back into a span. Rods get the same trio, reusing the same geometry.

**Files:**
- Modify: `lib/design-document/types.ts` (`RigHang`, `Placement.hang`)
- Modify: `lib/studio/anchor.ts`

**Interfaces:**
- Consumes: `CeilingRig`, `rigLengthMm` (Task 4).
- Produces: `RigHang { rigId; t; dropMm? }`; `Placement.hang?: RigHang`; `rigSegment(structure, rigId): WallSegment | null`; `resolveHang(structure, hang): Point | null`; `nearestRig(structure, p): { rigId; distanceMm; t } | null`; `RIG_SNAP_MM: 400`. Tasks 6, 7, 8 and 16 consume these.

- [ ] **Step 1: Add the document field**

In `lib/design-document/types.ts`, after `WallSpan`:

```ts
/** Where a ceiling item hangs. When this is set, `position` is derived from the rod and ignored —
 *  the same contract WallSpan has, and for the same reason: the rod belongs to the PROPERTY, so a
 *  hall re-surveyed at /halls has to carry its chandeliers with it rather than leave them at old
 *  millimetres in mid-air.
 *
 *  A point, not a span, because that is what the thing is: a drape is pinned along a wall by both
 *  ends, a chandelier hangs off one fixing. Widening WallSpan to cover both would give every reader
 *  two optional ids to disambiguate for no gain.
 *
 *  A `rigId` that no longer resolves is ignored on read — the item falls back to its last free
 *  position — exactly like a dangling wallId. */
export interface RigHang {
  rigId: string;
  t: number; // 0..1 along the rod; always 0 on a single hanging point
  dropMm?: number; // how far below the rod it hangs; absent = flush to the rod
}
```

And on `Placement`, after `span`:

```ts
  /** Ceiling items hung on one of the venue's rods. When set, `position` is ignored — see RigHang. */
  hang?: RigHang;
```

- [ ] **Step 2: Write the failing assertions**

In `lib/studio/anchor.ts`'s `isMain` block, extend the fixture structure with rods and add assertions before the final `console.log`:

```ts
  // --- ceiling rods ---------------------------------------------------------
  {
    // An 8m rod running along x at y=3000, and a single eyebolt off to the side.
    const rigged: VenueStructure = {
      ...structure,
      rigs: [
        { id: "r-long", label: "מוט מרכזי", a: { x: 1000, y: 3000 }, b: { x: 9000, y: 3000 }, heightMm: 4200 },
        { id: "r-point", label: "נקודה", a: { x: 3000, y: 5000 }, b: { x: 3000, y: 5000 }, heightMm: 4000 },
      ],
    };

    assert(rigSegment(rigged, "gone") === null, "a deleted rod resolves to nothing");
    assert(near(rigSegment(rigged, "r-long")!.lengthMm, 8000), "rod length");

    const mid = resolveHang(rigged, { rigId: "r-long", t: 0.5 })!;
    assert(near(mid.x, 5000) && near(mid.y, 3000), "half way along the rod");

    const start = resolveHang(rigged, { rigId: "r-long", t: 0 })!;
    assert(near(start.x, 1000), "t=0 is the rod's own start");
    assert(near(resolveHang(rigged, { rigId: "r-long", t: 3 })!.x, 9000), "an out-of-range t clamps to the rod");
    assert(resolveHang(rigged, { rigId: "gone", t: 0.5 }) === null, "a dangling rigId resolves to nothing");

    // A zero-length rod must not divide by zero — it resolves to its own point, whatever t says.
    const pt = resolveHang(rigged, { rigId: "r-point", t: 0.7 })!;
    assert(near(pt.x, 3000) && near(pt.y, 5000), "a hanging point resolves to itself at any t");

    const dropped = nearestRig(rigged, { x: 5000, y: 3200 })!;
    assert(dropped.rigId === "r-long" && near(dropped.t, 0.5) && near(dropped.distanceMm, 200), "a drop near the rod picks it, with where along it");
    assert(nearestRig(rigged, { x: 3100, y: 5000 })!.rigId === "r-point", "…and a drop by the eyebolt picks that");
    assert(nearestRig(rigged, { x: 3000, y: 5000 })!.t === 0, "a hanging point is always at t=0");
    assert(nearestRig(structure, { x: 0, y: 0 }) === null, "a venue with no rods offers nothing to hang from");
  }
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run check:anchor`
Expected: FAIL — `rigSegment`, `resolveHang`, `nearestRig` are not defined.

- [ ] **Step 4: Implement**

Add to `lib/studio/anchor.ts` (import `rigLengthMm` and `type CeilingRig` from `@/lib/venues/structure`, and `type RigHang` from `@/lib/design-document/types`):

```ts
/** How near a rod a ceiling item has to be dropped before it hangs on it rather than floating.
 *  400mm — the same order as the room's other snaps, and about the radius of the chandelier that is
 *  usually being placed. */
export const RIG_SNAP_MM = 400;

/** One rod's endpoints, or null if the id dangles. Same contract, and same shape, as wallSegment. */
export function rigSegment(structure: VenueStructure, rigId: string): WallSegment | null {
  const rig = structure.rigs?.find((r) => r.id === rigId);
  if (!rig) return null;
  return { a: rig.a, b: rig.b, lengthMm: rigLengthMm(rig) };
}

/** Where a hung item actually is. A zero-length rod (a single eyebolt) resolves to its own point at
 *  any t rather than dividing by its length. */
export function resolveHang(structure: VenueStructure, hang: RigHang): Point | null {
  const seg = rigSegment(structure, hang.rigId);
  if (!seg) return null;
  if (seg.lengthMm === 0) return { ...seg.a };
  return pointAtDistance(seg.a, seg.b, clamp01(hang.t) * seg.lengthMm);
}

export interface NearestRig {
  rigId: string;
  distanceMm: number;
  t: number;
}

/** The rod closest to a dropped item, and where along it the drop landed. Null when the venue has
 *  no rods at all, which is most venues until somebody measures them. */
export function nearestRig(structure: VenueStructure, p: Point): NearestRig | null {
  let best: NearestRig | null = null;
  let bestDistSq = Infinity;
  for (const rig of structure.rigs ?? []) {
    const len = rigLengthMm(rig);
    // A hanging point has no direction to project onto: it is simply near or it is not.
    const foot = len === 0 ? rig.a : pointAtDistance(rig.a, rig.b, projectOntoWall(rig.a, rig.b, p));
    const distSq = (p.x - foot.x) ** 2 + (p.y - foot.y) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = {
        rigId: rig.id,
        distanceMm: Math.sqrt(distSq),
        t: len === 0 ? 0 : clamp01(projectOntoWall(rig.a, rig.b, p) / len),
      };
    }
  }
  return best;
}
```

- [ ] **Step 5: Verify**

Run: `npm run check:anchor` → Expected: PASS
Run: `npm run typecheck` → Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/design-document/types.ts lib/studio/anchor.ts
git commit -m "$(cat <<'EOF'
feat(studio): resolve a ceiling item's hang against a rod

The same trio anchor.ts already gives a drape's wall span, for rods: resolve a
stored hang to a point, and turn a pointer back into one. A point rather than
a span because that is what the thing is -- a drape is pinned by both ends, a
chandelier hangs off one fixing.

A zero-length rod resolves to its own point at any t instead of dividing by
its length, and a dangling rigId resolves to nothing, exactly like a dangling
wallId.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Drawing rods at /halls

**Files:**
- Modify: `lib/venues/selection.ts` (`PlanSelectionKind`, `hitsInBox`)
- Modify: `app/(app)/halls/halls-screen.tsx` (a `"rigs"` dock mode)
- Modify: `components/venue-inspector.tsx` (a rig panel)

**Interfaces:**
- Consumes: `addRig`/`updateRig`/`removeRig`/`rigLengthMm`/`isHangingPoint` (Task 4), `constrainAngleDeg` (existing, `lib/studio/snap.ts`).
- Produces: rods persisted on the venue structure, which Tasks 7, 8 and 16 read.

- [ ] **Step 1: Write the failing selection assertions**

In `lib/venues/selection.ts`'s `isMain` block, after the existing wall/node assertions:

```ts
  // A rod is selectable like anything else on the plan, and its id under another kind is not it.
  {
    const rigA: PlanSelection = { kind: "rig", id: "a" };
    assert(ids(toggleSelection([], rigA, false)) === "rig:a", "a rod can be selected");
    assert(ids(toggleSelection([{ kind: "wall", id: "a" }], rigA, true)) === "rig:a,wall:a", "a rod and a wall may share an id string");
    const rigged = { ...structure, rigs: [{ id: "r1", label: "מוט", a: { x: 1000, y: 1000 }, b: { x: 3000, y: 1000 }, heightMm: 4000 }] };
    const hits = hitsInBox(rigged, [], { minX: 0, minY: 0, maxX: 5000, maxY: 5000 });
    assert(hits.some((h) => h.kind === "rig" && h.id === "r1"), "a marquee over both ends catches the rod");
    const partial = hitsInBox(rigged, [], { minX: 0, minY: 0, maxX: 2000, maxY: 5000 });
    assert(!partial.some((h) => h.kind === "rig"), "…and a marquee over only one end does not");
  }
```

(Reuse the `structure` fixture already defined in that block; if its shape differs, build a minimal one inline.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm run check:selection`
Expected: FAIL — `"rig"` is not assignable to `PlanSelectionKind`.

- [ ] **Step 3: Implement the selection side**

```ts
export type PlanSelectionKind = "zone" | "wall" | "node" | "door" | "feature" | "rig";
```

In `hitsInBox`, after the features loop — both ends inside, for exactly the reason the wall loop gives:

```ts
  // A rod, like a wall, counts only when the box holds both its ends.
  for (const r of structure.rigs ?? []) if (inside(r.a) && inside(r.b)) hits.push({ kind: "rig", id: r.id });
```

- [ ] **Step 4: The dock mode**

In `app/(app)/halls/halls-screen.tsx`, widen the screen's `mode` union with `"rigs"` and add a third dock button beside שרטוט and בחירה, following the existing button's exact shape (same classes, same `aria-pressed`, same state resets):

```tsx
              <button
                type="button"
                title="מוטות תקרה"
                onClick={() => {
                  setMode("rigs");
                  setRunNodeId(null);
                  setRegion(null);
                  setDraftZone(null);
                  setArmedToolId(null);
                  setAddMenuOpen(false);
                  setSelection([]);
                }}
                aria-pressed={mode === "rigs"}
                className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  mode === "rigs" ? "bg-accent-tint text-accent" : "text-muted hover:bg-inset"
                }`}
              >
                <Minus className="h-[18px] w-[18px]" strokeWidth={1.4} />
                מוטות תקרה
              </button>
```

Import `Minus` from `lucide-react`.

Drawing, in `"rigs"` mode: a pointer-down on empty canvas records `a`; the move draws a preview line through `constrainAngleDeg`; the release calls `addRig` with `heightMm` defaulting to the focused zone's `ceilingHeightMm ?? 4000`. A release within the canvas's own snap tolerance of `a` writes `b === a` — a single hanging point.

```tsx
  // A rod is one standalone segment, so there is no chained run the way walls have: press for one
  // end, release for the other. A press that does not travel is an eyebolt, not a mistake.
  const [rigDraft, setRigDraft] = useState<{ a: Point; b: Point } | null>(null);
```

Render rods (in every mode, so they can be seen while the room is drawn — dashed, muted, labelled) and give them hit targets only in `"rigs"` mode.

- [ ] **Step 5: The inspector panel**

In `components/venue-inspector.tsx`, add a rig branch beside the feature branch: a `TextField` for `label`, `NumberField` for height in metres (`decimals={2}`) and for `loadKg` (`decimals={0}`, optional), a read-only length, and the shared delete affordance routed through `components/confirm-dialog.tsx` like every other delete in the app. A hanging point shows "נקודת תלייה" instead of a length.

- [ ] **Step 6: Verify**

Run: `npm run check:selection` → Expected: PASS
Run: `npm run check:structure` → Expected: PASS
Run: `npm run typecheck` → Expected: PASS
Run: `npm run dev`, open `/halls`, press **מוטות תקרה**, drag across the hall.
Expected: a dashed rod appears with its height; selecting it opens a panel that renames it, re-measures it and deletes it; the rod survives a reload.

- [ ] **Step 7: Commit**

```bash
git add lib/venues/selection.ts "app/(app)/halls/halls-screen.tsx" components/venue-inspector.tsx
git commit -m "$(cat <<'EOF'
feat(halls): draw the ceiling rods a hall is built with

A third dock mode. A rod is one standalone segment, so there is no chained run
the way walls have: press for one end, release for the other, and a press that
does not travel is an eyebolt rather than a mistake.

A rod counts as caught by a marquee only when the box holds both its ends --
the same rule, and the same reason, as a wall.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Hanging a ceiling item on a rod

**Files:**
- Modify: `lib/design-document/actions.ts` (`setPlacementHang`)
- Modify: `app/(app)/studio/studio-screen.tsx` (drop + drag)
- Modify: `app/(app)/studio/canvas-stage.tsx` (draw rods; resolve hung positions)
- Modify: `app/(app)/studio/inspector.tsx` (the readout)

**Interfaces:**
- Consumes: `resolveHang`, `nearestRig`, `RIG_SNAP_MM` (Task 5); `sorted.ceiling` (Task 1).
- Produces: action `{ type: "setPlacementHang"; id: string; hang: RigHang | null }`.

- [ ] **Step 1: Write the failing assertions**

In `lib/design-document/actions.ts`'s `isMain` block:

```ts
  // A ceiling item hung on a rod, and taken off it again.
  {
    let h = initHistory({
      calibration: { mmPerUnit: 1 },
      tables: [],
      placements: [{ id: "ch", variantId: "chandelier", layer: "ceiling", quantity: 1, position: { x: 100, y: 100 }, rotation: 0, scale: 1 }],
    });
    h = dispatch(h, { type: "setPlacementHang", id: "ch", hang: { rigId: "r1", t: 0.5 } });
    assert(h.present.placements[0].hang?.rigId === "r1", "a ceiling item can be hung on a rod");
    h = dispatch(h, { type: "setPlacementHang", id: "ch", hang: null });
    assert(h.present.placements[0].hang === undefined, "…and taken off it, back to a free point");
    assert(h.present.placements[0].position.x === 100, "…keeping the position it had");
  }
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run check:actions`
Expected: FAIL — `"setPlacementHang"` is not in the `Action` union.

- [ ] **Step 3: Implement the action**

In the `Action` union, beside `setPlacementSpan`:

```ts
  // A ceiling item hung on one of the venue's rods, or taken off it. `null` removes the field
  // entirely rather than storing an empty one, so "is this hung" stays one question.
  | { type: "setPlacementHang"; id: string; hang: RigHang | null }
```

In `apply()`, beside the `setPlacementSpan` case:

```ts
    case "setPlacementHang":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          if (action.hang) return { ...p, hang: action.hang };
          const { hang: _dropped, ...rest } = p;
          return rest;
        }),
      };
```

- [ ] **Step 4: Hang on drop**

In `app/(app)/studio/studio-screen.tsx`'s `dropProduct`, add a ceiling branch **before** the final free-position `else`:

```ts
    } else if (product.layer === "ceiling") {
      // Near a rod, it hangs on it and will travel with it if the hall is ever re-surveyed. Far
      // from one — or in a venue nobody has measured the ceiling of — it is a free point, exactly
      // as every ceiling item was before rods existed.
      const near = nearestRig(plan.structure, { x, y });
      const hang = near && near.distanceMm <= RIG_SNAP_MM ? { rigId: near.rigId, t: near.t } : undefined;
      act({ type: "addPlacement", placement: { ...base, position: { x, y }, ...(hang ? { hang } : {}) } });
```

Apply the same rule when a hung item is dragged: on drag end, re-run `nearestRig` and dispatch `setPlacementHang` with the new hang or `null`.

- [ ] **Step 5: Draw rods and resolve hung positions in the canvas**

In `canvas-stage.tsx`, rods draw as part of the **ceiling layer's own visibility** — no fourth toggle:

```tsx
          {/* The rigging plan, shown only when the ceiling layer is. A designer does not want to see
              the rods all evening; they want them the moment they are placing a chandelier, or
              lining a table up under one. That is the same moment the ceiling layer is turned on. */}
          {layerVisible.ceiling &&
            (structure.rigs ?? []).map((r) => (
              <g key={r.id} className="pointer-events-none">
                <line
                  x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y}
                  stroke="var(--color-muted)" strokeWidth={1.5}
                  strokeDasharray={OVERHEAD_DASH} vectorEffect="non-scaling-stroke"
                />
                <text
                  x={(r.a.x + r.b.x) / 2} y={(r.a.y + r.b.y) / 2 - 240}
                  textAnchor="middle" fill="var(--color-muted)"
                  style={{ fontSize: 320, ...HALO }}
                >
                  {r.label} · {(r.heightMm / 1000).toFixed(2)}מ׳
                </text>
              </g>
            ))}
```

In the ceiling pass from Task 1, a hung item draws where its rod puts it:

```tsx
            {sorted.ceiling.map((p) => {
              const at = p.hang ? resolveHang(structure, p.hang) : null;
              const x = at?.x ?? p.position.x;
              const y = at?.y ?? p.position.y;
              return <PlacementNode key={p.id} placement={p} x={x} y={y} overhead ... />;
            })}
```

(`at` being null covers a dangling `rigId` — the item falls back to its free position rather than vanishing.)

- [ ] **Step 6: The inspector readout**

In `app/(app)/studio/inspector.tsx`, for a selected ceiling placement:

```tsx
        {/* The one question asked while placing a chandelier: is there anything up there to hang it
            from. Answered where the item is, rather than by hunting the rigging plan for it. */}
        {hung ? (
          <p className="text-xs text-muted">
            תלוי על: <span className="font-medium text-ink">{hung.label}</span> · {(hung.heightMm / 1000).toFixed(2)}מ׳
          </p>
        ) : (
          <p className="text-xs text-warn-ink">אין מוט במיקום הזה</p>
        )}
```

Plus a `NumberField` for `dropMm` ("שלשול", in cm) when it is hung.

- [ ] **Step 7: Verify**

Run: `npm run check:actions` → Expected: PASS
Run: `npm run typecheck` → Expected: PASS
Run: `npm run dev`. On a venue with a rod: turn the ceiling layer on, drop a שנדליר near the rod.
Expected: it lands on the rod, the inspector says **תלוי על: מוט מרכזי · 4.20מ׳**; dropped mid-room it says **אין מוט במיקום הזה**.

- [ ] **Step 8: Commit**

```bash
git add lib/design-document/actions.ts "app/(app)/studio/studio-screen.tsx" "app/(app)/studio/canvas-stage.tsx" "app/(app)/studio/inspector.tsx"
git commit -m "$(cat <<'EOF'
feat(studio): hang a chandelier on a rod, and say when there is none

Dropped within 400mm of a rod a ceiling item hangs on it and travels with it;
further away it stays a free point, exactly as every ceiling item was before
rods existed. The inspector answers the question actually being asked while
placing one -- is there anything up there to hang this from -- where the item
is, instead of leaving it to be hunted on the rigging plan.

Rods are drawn with the ceiling layer's own visibility. No fourth toggle: the
moment you want to see them IS the moment that layer is on.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: A table under the rod

**Files:**
- Modify: `lib/studio/snap.ts` (`SnapContext.lines`)
- Modify: `app/(app)/studio/canvas-stage.tsx` (pass the rods; draw the guide)

**Interfaces:**
- Consumes: `structure.rigs` (Task 4).
- Produces: `SnapContext.lines?: { a: Point; b: Point }[]` and `SnapResult.lineGuide?: { a: Point; b: Point }`.

- [ ] **Step 1: Write the failing assertions**

In `lib/studio/snap.ts`'s `isMain` block:

```ts
  // Snapping onto a LINE, which is how a table lands under a ceiling rod. Alignment snapping can
  // only offer axes; a rod at 30° across the room is neither.
  {
    const base: SnapContext = { toleranceMm: 300, outline: [], fixtures: [], gridMm: 0 };
    const diagonal = { a: { x: 0, y: 0 }, b: { x: 10000, y: 10000 } };

    const on = snapPoint({ x: 5100, y: 4900 }, { ...base, lines: [diagonal] });
    assert(near(on.point.x, 5000) && near(on.point.y, 5000), "a point near a line is pulled onto it");
    assert(on.lineGuide !== undefined, "…and says which line it landed on");

    const off = snapPoint({ x: 5000, y: 9000 }, { ...base, lines: [diagonal] });
    assert(near(off.point.x, 5000) && near(off.point.y, 9000), "a point far from the line is left alone");
    assert(off.lineGuide === undefined, "…and reports no line");

    const none = snapPoint({ x: 5100, y: 4900 }, { ...base, lines: [] });
    assert(near(none.point.x, 5100) && near(none.point.y, 4900), "no lines, no line snapping");

    // Beyond the rod's ends there is no rod. A table three rooms away must not be dragged onto the
    // infinite extension of a line that stops at the wall.
    const past = snapPoint({ x: 12000, y: 12000 }, { ...base, lines: [diagonal] });
    assert(near(past.point.x, 12000), "the snap is to the segment, not to the infinite line");
  }
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run check:snap`
Expected: FAIL — `lines` is not a property of `SnapContext`.

- [ ] **Step 3: Implement**

Add to `SnapContext`:

```ts
  /** Lines the point may land ON, as opposed to axes it may line up WITH — the venue's ceiling rods,
   *  so a table can be centred under one. Alignment snapping can only ever offer a horizontal or a
   *  vertical, and a rod running at 30° across the room is neither. Absent (the usual case) leaves
   *  every other rule in this file untouched. */
  lines?: { a: Point; b: Point }[];
```

Add to `SnapResult`:

```ts
  /** The line this point was pulled onto, for drawing the guide. */
  lineGuide?: { a: Point; b: Point };
```

In `snapPoint`, after the axis and spacing rules settle `sx`/`sy` and before the final `return`:

```ts
  // Landing ON a line is a STRONGER claim than lining up with an axis — a rod is a physical thing
  // in the room, not an inferred alignment — so it is applied last and wins the coordinate.
  // Projected onto the SEGMENT, never its infinite extension: a rod stops at the wall.
  let lineGuide: { a: Point; b: Point } | undefined;
  for (const ln of ctx.lines ?? []) {
    const len = Math.hypot(ln.b.x - ln.a.x, ln.b.y - ln.a.y);
    if (len === 0) continue;
    const t = Math.max(0, Math.min(1, ((sx - ln.a.x) * (ln.b.x - ln.a.x) + (sy - ln.a.y) * (ln.b.y - ln.a.y)) / (len * len)));
    const fx = ln.a.x + (ln.b.x - ln.a.x) * t;
    const fy = ln.a.y + (ln.b.y - ln.a.y) * t;
    if (Math.hypot(sx - fx, sy - fy) <= tol) {
      sx = fx;
      sy = fy;
      lineGuide = ln;
      break;
    }
  }
```

and include `...(lineGuide ? { lineGuide } : {})` in the returned object.

- [ ] **Step 4: Feed the rods in**

In `canvas-stage.tsx`, where the drag builds its `SnapContext`, pass the rods **only while the ceiling layer is visible** — so with the ceiling hidden the drag behaves bit-for-bit as it did before:

```ts
      // Only while the ceiling layer is on. Hidden, no lines are passed and this is exactly the
      // drag it always was.
      ...(layerVisible.ceiling && structure.rigs?.length
        ? { lines: structure.rigs.filter((r) => rigLengthMm(r) > 0).map((r) => ({ a: r.a, b: r.b })) }
        : {}),
```

Draw `result.lineGuide` in the same accent as the existing alignment guides.

- [ ] **Step 5: Verify**

Run: `npm run check:snap` → Expected: PASS
Run: `npm run typecheck` → Expected: PASS
Run: `npm run dev`. Turn the ceiling layer on, drag a table towards a rod.
Expected: the table's centre lands on the rod's line with a guide drawn along it. With the ceiling layer off, no such snap happens.

- [ ] **Step 6: Commit**

```bash
git add lib/studio/snap.ts "app/(app)/studio/canvas-stage.tsx"
git commit -m "$(cat <<'EOF'
feat(studio): a table snaps under a ceiling rod

Landing ON a line, as opposed to lining up WITH an axis. Alignment snapping
can only ever offer a horizontal or a vertical, and a rod running at 30
degrees across the room is neither -- so this is its own rule, applied last
because a rod is a physical thing in the room rather than an inferred
alignment.

Projected onto the segment, never its infinite extension: a rod stops at the
wall, and a table three rooms away must not be dragged onto where it would
have gone. Passed only while the ceiling layer is visible, so an ordinary drag
is untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# PHASE C — Bulk

### Task 9: `applyToTables` replaces two narrower actions

**Files:**
- Modify: `lib/design-document/actions.ts`
- Modify: `app/(app)/studio/studio-screen.tsx` (the two callers)

**Interfaces:**
- Produces: `{ type: "applyToTables"; tableIds: string[]; placement: Omit<Placement,"id"|"tableId">; replaces?: string[] }`. `applyToTableType` and `applyToAllTables` are **deleted**.

- [ ] **Step 1: Write the failing assertions**

In `lib/design-document/actions.ts`'s `isMain` block, alongside the existing smart-apply cases:

```ts
  // Applying to an explicit list of tables — the general case the two old actions were both
  // special cases of.
  {
    let g = initHistory({
      calibration: { mmPerUnit: 1 },
      tables: [table("t1", "עגול"), table("t2", "עגול"), table("t3", "אביר")],
      placements: [],
    });
    const cloth = { variantId: "gold", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 };

    g = dispatch(g, { type: "applyToTables", tableIds: ["t1", "t3"], placement: cloth });
    assert(g.present.placements.length === 2, "only the two tables named are dressed");
    assert(!g.present.placements.some((p) => p.tableId === "t2"), "…and the one that was not is left bare");

    const before = g.present;
    g = dispatch(g, { type: "applyToTables", tableIds: ["t1"], placement: cloth });
    assert(g.present === before, "re-applying to a table that already wears it is not an edit");

    g = dispatch(g, { type: "applyToTables", tableIds: ["gone"], placement: cloth });
    assert(g.present === before, "a table id that is not there is ignored, not a crash");

    g = dispatch(g, { type: "applyToTables", tableIds: [], placement: cloth });
    assert(g.present === before, "applying to nothing is not an edit");
  }
```

(Use whatever `table(...)` helper the surrounding block already defines; if it takes no `type` argument, build the three tables inline with distinct `type` values.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm run check:actions`
Expected: FAIL — `"applyToTables"` is not in the `Action` union.

- [ ] **Step 3: Implement**

Replace the two union members with one:

```ts
  // F-3.3 smart-apply, generalised: put this item on exactly these tables. The caller decides which
  // tables those are — every table of a type, every table on the plan, the ones the designer has
  // selected, the ones inside a zone. Two narrower actions (applyToTableType / applyToAllTables)
  // used to answer the first two of those and could not be made to answer the others; this is the
  // same body with the list lifted out, so it is one branch here instead of two.
  | { type: "applyToTables"; tableIds: string[]; placement: Omit<Placement, "id" | "tableId">; replaces?: string[] }
```

Replace the two cases with one:

```ts
    case "applyToTables": {
      const wanted = new Set(action.tableIds);
      return spreadOverTables(doc, doc.tables.filter((t) => wanted.has(t.id)), action.placement, action.replaces);
    }
```

`spreadOverTables` is unchanged — it already returns `doc` untouched when there is nothing to do, which is what makes the "not an edit" assertions pass.

- [ ] **Step 4: Update the two callers**

In `app/(app)/studio/studio-screen.tsx`:

```ts
  const smartApply = () => {
    if (sole?.kind !== "placement") return;
    const p = doc.placements.find((x) => x.id === sole.id);
    const table = p?.tableId ? doc.tables.find((t) => t.id === p.tableId) : undefined;
    if (!p || !table) return;
    act({
      type: "applyToTables",
      tableIds: doc.tables.filter((t) => t.type === table.type).map((t) => t.id),
      placement: { variantId: p.variantId, layer: "table", quantity: p.quantity, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    });
    showHint(`הוחל על כל שולחנות ${table.type}`);
  };
```

and in `spreadCloth`, `tableIds: doc.tables.map((t) => t.id)`.

- [ ] **Step 5: Verify**

Run: `npm run check:actions` → Expected: PASS
Run: `npm run typecheck` → Expected: PASS — if it reports `applyToTableType` or `applyToAllTables` anywhere else, those are callers that must be converted too.

- [ ] **Step 6: Commit**

```bash
git add lib/design-document/actions.ts "app/(app)/studio/studio-screen.tsx"
git commit -m "$(cat <<'EOF'
feat(studio): one smart-apply that takes the tables it is given

applyToTableType and applyToAllTables were two special cases of one thing, and
neither could be made to answer "the tables I have selected" or "the tables in
this zone". Lifting the list out of the action leaves ONE branch where there
were two, and the two new questions cost nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `copyDressing`

Dress one table properly, then make twenty-three others match. Today that is one apply per item.

**Files:**
- Modify: `lib/design-document/actions.ts`

**Interfaces:**
- Produces: `{ type: "copyDressing"; fromTableId: string; toTableIds: string[]; mode: "add" | "replace" }`.

- [ ] **Step 1: Write the failing assertions**

```ts
  // Copying one table's whole dressing onto others.
  {
    const dressed = (id: string, tableId: string, variantId: string) => ({
      id, variantId, layer: "table" as const, tableId, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1,
    });
    let g = initHistory({
      calibration: { mmPerUnit: 1 },
      tables: [table("t1", "עגול"), table("t2", "עגול"), table("t3", "עגול")],
      placements: [
        dressed("a", "t1", "gold-cloth"),
        dressed("b", "t1", "centrepiece"),
        dressed("c", "t2", "cream-cloth"),
      ],
    });

    // add: the target keeps what it wears and gains what it lacks.
    let add = dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "add" });
    const onT2 = add.present.placements.filter((p) => p.tableId === "t2");
    assert(onT2.length === 3, "the target keeps its own cloth and gains both of the source's items");
    assert(onT2.some((p) => p.variantId === "cream-cloth"), "…including the one it already had");

    // replace: the target ends up identical to the source.
    let rep = dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2", "t3"], mode: "replace" });
    for (const t of ["t2", "t3"]) {
      const on = rep.present.placements.filter((p) => p.tableId === t).map((p) => p.variantId).sort();
      assert(on.join(",") === "centrepiece,gold-cloth", `${t} is now dressed exactly like the source`);
    }
    assert(rep.present.placements.filter((p) => p.tableId === "t1").length === 2, "the source is untouched");

    // Every copy is its own row.
    const ids = new Set(rep.present.placements.map((p) => p.id));
    assert(ids.size === rep.present.placements.length, "each copy gets its own id");

    // Nothing to copy, and copying onto itself, are both no-ops rather than edits.
    assert(dispatch(g, { type: "copyDressing", fromTableId: "t3", toTableIds: ["t2"], mode: "add" }).present === g.present, "an undressed source copies nothing");
    assert(dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t1"], mode: "add" }).present === g.present, "a table cannot be dressed from itself");
    assert(dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: [], mode: "add" }).present === g.present, "copying onto nothing is not an edit");

    // replace clears the target's exceptions: "make it identical" overrides an older divergence.
    let ex = initHistory({
      calibration: { mmPerUnit: 1 },
      tables: [table("t1", "עגול"), table("t2", "עגול")],
      placements: [dressed("a", "t1", "gold-cloth")],
      exceptions: [{ tableId: "t2", variantId: "gold-cloth" }],
    });
    const kept = dispatch(ex, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "add" });
    assert(kept.present.placements.filter((p) => p.tableId === "t2").length === 0, "add honours a recorded exception");
    const forced = dispatch(ex, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "replace" });
    assert(forced.present.placements.some((p) => p.tableId === "t2"), "replace overrides it");
    assert((forced.present.exceptions ?? []).length === 0, "…and clears it, so it cannot come back");
  }
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run check:actions`
Expected: FAIL — `"copyDressing"` is not in the `Action` union.

- [ ] **Step 3: Implement**

Union member:

```ts
  // One table's WHOLE dressing onto others — the cloth, the centrepiece, the candlesticks, the
  // runner, in one press. A designer dresses one table until it is right and then wants the room to
  // match it; before this that was one smart-apply per item, and the fifth one was always the one
  // that got forgotten.
  //
  // "add" leaves what a target already wears and gives it what it lacks, honouring any recorded
  // divergence (F-5.3). "replace" makes the target identical to the source and CLEARS its
  // exceptions: an explicit "make these match that one" outranks a divergence recorded weeks ago,
  // and silently honouring the old one would read as the button being broken.
  | { type: "copyDressing"; fromTableId: string; toTableIds: string[]; mode: "add" | "replace" }
```

Case, beside `applyToTables`:

```ts
    case "copyDressing": {
      const source = doc.placements.filter((p) => p.layer === "table" && p.tableId === action.fromTableId);
      const targets = action.toTableIds.filter((id) => id !== action.fromTableId && doc.tables.some((t) => t.id === id));
      if (source.length === 0 || targets.length === 0) return doc;
      const targetSet = new Set(targets);

      // In replace mode the targets are stripped first, so what they end up with is exactly the
      // source's set rather than the union of the two.
      const kept =
        action.mode === "replace"
          ? doc.placements.filter((p) => !(p.layer === "table" && p.tableId && targetSet.has(p.tableId)))
          : doc.placements;

      const added: Placement[] = [];
      for (const tableId of targets) {
        for (const s of source) {
          const has = kept.some((p) => p.layer === "table" && p.tableId === tableId && p.variantId === s.variantId);
          const excepted =
            action.mode === "add" &&
            doc.exceptions?.some((e) => e.tableId === tableId && e.variantId === s.variantId);
          if (has || excepted) continue;
          const { id: _old, tableId: _t, ...rest } = s;
          added.push({ ...rest, id: crypto.randomUUID(), tableId });
        }
      }
      if (added.length === 0 && kept === doc.placements) return doc;

      const exceptions =
        action.mode === "replace"
          ? doc.exceptions?.filter((e) => !targetSet.has(e.tableId))
          : doc.exceptions;
      return { ...doc, placements: [...kept, ...added], exceptions };
    }
```

- [ ] **Step 4: Verify**

Run: `npm run check:actions` → Expected: PASS, printing the actions self-check's success line
Run: `npm run typecheck` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/design-document/actions.ts
git commit -m "$(cat <<'EOF'
feat(studio): copy one table's whole dressing onto the rest

The cloth, the centrepiece, the candlesticks and the runner in one press. A
designer dresses one table until it is right and then wants the room to match
it; before this that was one smart-apply per item, and the fifth was always
the one that got forgotten.

"replace" clears the targets' recorded divergences: an explicit "make these
match that one" outranks an exception recorded weeks ago, and honouring the
old one silently would read as the button being broken.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Selection commands

**Files:**
- Modify: `app/(app)/studio/studio-screen.tsx`
- Modify: `app/(app)/studio/inspector.tsx`

**Interfaces:**
- Consumes: `pickMany` (existing), `applyToTables` / `copyDressing` (Tasks 9-10), `activeLayer` (Task 3).
- Produces: `selectSimilar()`, `selectInZone()`, `selectLayer()` on the screen; wired into the inspector.

- [ ] **Step 1: Implement the three commands**

In `studio-screen.tsx`. All three route through the existing `pickMany`, so group expansion and feature exclusion are already handled:

```ts
  // BULK IS A SELECTION PROBLEM. Every operation this screen has -- drag, rotate, delete, style,
  // restack, copy, paste -- already takes a list of refs. Make the list easy to build and each of
  // them becomes a bulk operation without a line of new code apiece; the alternative was a menu of
  // one-off "apply to..." commands, one per operation, each with its own idea of what it applied to.
  const selectSimilar = useCallback(() => {
    const one = selected[0];
    if (!one) return;
    if (one.kind === "table") {
      const type = doc.tables.find((t) => t.id === one.id)?.type;
      if (!type) return;
      pickMany(doc.tables.filter((t) => t.type === type).map((t) => ({ kind: "table" as const, id: t.id })), false);
    } else if (one.kind === "placement") {
      const variantId = doc.placements.find((p) => p.id === one.id)?.variantId;
      if (!variantId) return;
      pickMany(doc.placements.filter((p) => p.variantId === variantId).map((p) => ({ kind: "placement" as const, id: p.id })), false);
    }
  }, [selected, doc, pickMany]);

  const selectInZone = useCallback(() => {
    const zone = plan.zones.find((r) => r.zone.id === zoneFocus);
    if (!zone || zone.boundary.length < 3) return;
    const inside = (p: Point) => pointInPolygon(p, zone.boundary);
    pickMany(
      [
        ...doc.tables.filter((t) => inside(t.position)).map((t) => ({ kind: "table" as const, id: t.id })),
        ...doc.placements.filter((p) => !p.tableId && !p.span && inside(p.position)).map((p) => ({ kind: "placement" as const, id: p.id })),
      ],
      false,
    );
  }, [plan.zones, zoneFocus, doc, pickMany]);

  const selectLayer = useCallback(() => {
    if (!activeLayer) return;
    const refs = doc.placements.filter((p) => p.layer === activeLayer).map((p) => ({ kind: "placement" as const, id: p.id }));
    // Tables are floor-plane, so "select the floor layer" means them too.
    pickMany(activeLayer === "floor" ? [...doc.tables.map((t) => ({ kind: "table" as const, id: t.id })), ...refs] : refs, false);
  }, [activeLayer, doc, pickMany]);
```

`pointInPolygon` — check `lib/venues/faces.ts` and `lib/studio/geometry.ts` for an existing one and **reuse it**. Only if neither has it, add a standard ray-cast to `lib/studio/geometry.ts` with its own assertions in that file's self-check (a point inside a square; a point outside; a point on an L-shape's notch).

- [ ] **Step 2: Wire the bulk buttons**

In `inspector.tsx`, a selection section offering: **בחר דומים**, **בחר הכל באזור** (only when a zone is focused), **בחר שכבה** (only when a layer is active). Then, when the selection is 2+ tables and the clipboard holds a dressed source table, **החל את עיצוב השולחן הזה** with an add/replace choice — reuse `components/segmented.tsx` (already in the tree) for that pair rather than writing a new control.

Route the destructive `replace` through `components/confirm-dialog.tsx`, ביטול first, naming how many tables it will re-dress.

- [ ] **Step 3: Verify**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run dev`. Select a table, press **בחר דומים**.
Expected: every table of that type is selected; **החל את עיצוב השולחן** dresses them all in one Ctrl+Z-able step.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/studio/studio-screen.tsx" "app/(app)/studio/inspector.tsx"
git commit -m "$(cat <<'EOF'
feat(studio): select similar, select in zone, select layer

Bulk is a selection problem. Every operation this screen has already takes a
list of refs, so making the list easy to build turns each of them into a bulk
operation without a line of new code apiece -- rather than a menu of one-off
"apply to..." commands, each with its own idea of what it applied to.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Distribute evenly

**Files:**
- Modify: `app/(app)/studio/studio-screen.tsx`
- Modify: `app/(app)/studio/inspector.tsx`

- [ ] **Step 1: Implement**

Reuse the existing `moveMany` action — this is a position assignment, nothing new in the reducer:

```ts
  // Equal air between things, along whichever axis the selection is more spread out on. The two end
  // items DO NOT MOVE: they are what the designer has already placed, and a distribute that slid
  // them would be re-deciding the extent instead of dividing it.
  const distributeEvenly = useCallback(() => {
    const refs = docRefs(selected);
    if (refs.length < 3) return;
    const boxes = refs.map((r) => ({ ref: r, box: movableBox(r) })).filter((e) => e.box);
    if (boxes.length < 3) return;
    const spanX = Math.max(...boxes.map((e) => e.box!.x)) - Math.min(...boxes.map((e) => e.box!.x));
    const spanY = Math.max(...boxes.map((e) => e.box!.y)) - Math.min(...boxes.map((e) => e.box!.y));
    const axis: "x" | "y" = spanX >= spanY ? "x" : "y";
    const sorted = [...boxes].sort((a, b) => a.box![axis] - b.box![axis]);
    const first = sorted[0].box![axis];
    const step = (sorted[sorted.length - 1].box![axis] - first) / (sorted.length - 1);
    act({
      type: "moveMany",
      moves: sorted.map((e, i) => ({
        kind: e.ref.kind,
        id: e.ref.id,
        position: axis === "x" ? { x: first + step * i, y: e.box!.y } : { x: e.box!.x, y: first + step * i },
      })),
    });
  }, [selected, docRefs, act]);
```

Check `moveMany`'s exact payload shape in `lib/design-document/actions.ts` and match it. `movableBox(ref)` reads the table's or placement's current centre — lift it from whatever the canvas already uses, or pass the canvas's `movable` list up.

- [ ] **Step 2: Offer it**

In the inspector, **פיזור אחיד** on 3+ selected items that each have a free position. Not offered when the selection holds a cloth, a drape, or a hung ceiling item — none of those has a position a shared delta could move.

- [ ] **Step 3: Verify**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run dev`. Place five columns unevenly along a wall, select all, press **פיזור אחיד**.
Expected: the gaps equalise, the two end columns do not move, one Ctrl+Z undoes it.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/studio/studio-screen.tsx" "app/(app)/studio/inspector.tsx"
git commit -m "$(cat <<'EOF'
feat(studio): distribute a selection evenly

The two end items do not move: they are what the designer has already placed,
and a distribute that slid them would be re-deciding the extent instead of
dividing it. Rides on the existing moveMany, so it is one history entry and
nothing new in the reducer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# PHASE D — Architectural export

### Task 13: A true, stated scale

The one that matters. `PlacementMap` is `w-full` over a fitted viewBox today, so it draws at whatever ratio the paper happens to give it and nobody can measure off it.

**Files:**
- Create: `lib/outputs/scale.ts`
- Modify: `package.json` (`check:scale`)

**Interfaces:**
- Produces: `SCALES`, `Extent { widthMm; heightMm }`, `fitScale(world: Extent, frame: Extent): { denominator: number; paperMm: Extent }`, `scaleBarSteps(denominator, maxPaperMm): { metres: number; steps: number }`.

- [ ] **Step 1: Write the file with its self-check first**

Create `lib/outputs/scale.ts`:

```ts
// What scale a drawing is at — the difference between a plan and a picture of a plan.
//
// The placement map used to be an SVG at `width: 100%` over a viewBox fitted to the plan's bounds,
// which means it drew at whatever ratio the paper happened to give it: 1:87 on A4 portrait, 1:62 on
// A3 landscape, and nothing on the sheet said so. You cannot put a ruler on that. Every other
// drawing a crew is handed on site is at a STATED scale, and this makes these the same.
//
// It works because the sheet is already laid out in real millimetres (see outputs-screen.tsx, which
// sets the page's width in mm and mm is a real CSS unit): if the drawing is given a width of
// worldMm / denominator millimetres, then one millimetre on paper IS `denominator` millimetres in
// the room, exactly, on screen and out of the printer.
import { isMain } from "../self-check";

/** The scales a plan is drawn at. Standard architectural steps — a crew reading 1:75 knows what it
 *  is looking at, where 1:87 would just be the number that happened to fit. */
export const SCALES = [20, 25, 50, 75, 100, 150, 200, 250, 500, 1000] as const;

export interface Extent {
  widthMm: number;
  heightMm: number;
}

export interface FittedScale {
  /** 100 means 1:100. */
  denominator: number;
  /** How big the drawing is ON PAPER at that scale. */
  paperMm: Extent;
}

/**
 * The largest drawing that still fits: the SMALLEST denominator whose world extent lands inside the
 * frame. Small denominators are big drawings, so walking SCALES in order and taking the first that
 * fits gives the most readable plan the page can hold.
 *
 * Falls back to the coarsest scale when even that overflows — a hall bigger than 1km on a page. The
 * drawing overflows rather than being silently re-fitted to a scale the title block would then be
 * lying about; a plan that says 1:1000 and is 1:1400 is worse than one that runs off the edge.
 */
export function fitScale(world: Extent, frame: Extent): FittedScale {
  const usable = { widthMm: Math.max(0, frame.widthMm), heightMm: Math.max(0, frame.heightMm) };
  for (const d of SCALES) {
    const paperMm = { widthMm: world.widthMm / d, heightMm: world.heightMm / d };
    if (paperMm.widthMm <= usable.widthMm && paperMm.heightMm <= usable.heightMm) return { denominator: d, paperMm };
  }
  const d = SCALES[SCALES.length - 1];
  return { denominator: d, paperMm: { widthMm: world.widthMm / d, heightMm: world.heightMm / d } };
}

/**
 * A graphic scale bar: how many metres it should span, and in how many divisions.
 *
 * Drawn as well as stated, because the two fail differently. "1:100" is wrong the moment somebody
 * photocopies the sheet at 71% or prints A3 artwork onto A4 — which happens on every job — and the
 * bar is still right, because it shrank with the drawing.
 *
 * Picks the largest 1/2/5-times-a-power-of-ten run of metres that fits the width it is given.
 */
export function scaleBarSteps(denominator: number, maxPaperMm: number): { metres: number; steps: number } {
  const maxMetres = (maxPaperMm * denominator) / 1000;
  const nice = [1, 2, 5];
  let best = { metres: 1, steps: 2 };
  for (let pow = 0; pow <= 3; pow++) {
    for (const n of nice) {
      const m = n * 10 ** pow;
      if (m <= maxMetres) best = { metres: m, steps: n === 2 ? 2 : n === 5 ? 5 : 4 };
    }
  }
  return best;
}

// ponytail: self-check. Run: npm run check:scale
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;

  // A4 portrait with 16mm margins and 40mm of title block: 178 x 249 of drawing.
  const a4 = { widthMm: 178, heightMm: 249 };

  // A 15 x 10 metre hall.
  const hall = { widthMm: 15000, heightMm: 10000 };
  const fit = fitScale(hall, a4);
  assert(fit.denominator === 100, "a 15x10m hall fits A4 at 1:100");
  assert(near(fit.paperMm.widthMm, 150) && near(fit.paperMm.heightMm, 100), "…and is 150x100mm on the page");

  // A small room gets a bigger drawing, not the same one scaled up.
  assert(fitScale({ widthMm: 3000, heightMm: 2000 }, a4).denominator === 20, "a 3x2m room is drawn at 1:20");

  // The constraint can be either axis.
  assert(fitScale({ widthMm: 4000, heightMm: 24000 }, a4).denominator === 100, "a long thin hall is limited by its depth");

  // Bigger than the coarsest scale: stated honestly rather than silently re-fitted.
  const huge = fitScale({ widthMm: 5_000_000, heightMm: 5_000_000 }, a4);
  assert(huge.denominator === 1000, "beyond every scale it falls back to the coarsest");
  assert(huge.paperMm.widthMm > a4.widthMm, "…and overflows rather than lying about its scale");

  // A zero frame must not loop forever or return NaN.
  assert(fitScale(hall, { widthMm: 0, heightMm: 0 }).denominator === 1000, "no room at all still returns a scale");

  // The bar: at 1:100, 60mm of paper is 6m of room, so a 5m bar fits and a 10m one does not.
  const bar = scaleBarSteps(100, 60);
  assert(bar.metres === 5 && bar.steps === 5, "a 5m bar in 5 divisions fits 60mm at 1:100");
  assert(scaleBarSteps(100, 120).metres === 10, "twice the room takes a 10m bar");
  assert(scaleBarSteps(20, 60).metres === 1, "at 1:20 the same 60mm is only 1.2m, so the bar is 1m");

  console.log("scale self-check passed");
}
```

- [ ] **Step 2: Wire the script**

In `package.json`, beside the other checks:

```json
    "check:scale": "tsx lib/outputs/scale.ts",
```

- [ ] **Step 3: Run it**

Run: `npm run check:scale`
Expected: PASS, printing `scale self-check passed`. If an assertion fails, the arithmetic above is what is wrong — fix `fitScale`/`scaleBarSteps`, never the assertion.

- [ ] **Step 4: Commit**

```bash
git add lib/outputs/scale.ts package.json
git commit -m "$(cat <<'EOF'
feat(outputs): a stated scale you can put a ruler on

The placement map draws at whatever ratio the paper happens to give it -- 1:87
on A4, 1:62 on A3 -- and nothing on the sheet says so. The sheet is already
laid out in real millimetres, so a true scale is exact rather than
approximate: give the drawing a width of worldMm/denominator millimetres and
one millimetre on paper IS that many in the room.

The graphic bar is drawn as well as stated because the two fail differently: a
printed "1:100" is wrong the moment somebody photocopies at 71%, and the bar
is still right because it shrank with the drawing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: The sheets, and their dimensions

**Files:**
- Create: `lib/outputs/sheets.ts`
- Create: `lib/outputs/dimensions.ts`
- Modify: `package.json` (`check:sheets`, `check:dimensions`)

**Interfaces:**
- Produces: `PlanSheet`, `PLAN_SHEETS`, `sheetById(id)`; `DimensionLine { from; to; label; offsetMm }`, `overallDimensions(boundary): DimensionLine[]`.

- [ ] **Step 1: `lib/outputs/sheets.ts`**

```ts
// WHICH PLAN. A crew does not read one drawing with everything on it: the rigger wants the ceiling,
// the stage crew wants the stage, and the people laying tables want the tables without a rigging
// plan drawn over them. Five named sheets, because five is what gets handed out -- not a free-form
// layer builder, which asks the person printing to design the drawing.
//
// Layers are not enough on their own: "the stage" is a category GROUP, not a layer, and so is
// "chairs". A sheet therefore filters on both, plus the handful of things that are neither.
import type { Layer } from "../design-document/types";
import type { CategoryGroupId } from "../catalog/categories";
import { isMain } from "../self-check";

/** How the tables appear on a sheet that is not about them. "ghost" is the one that earns its
 *  place: a rigger hanging a chandelier needs to know which table is under it, and a ceiling plan
 *  with no tables on it cannot answer that -- but tables drawn at full weight would bury the rods. */
export type TablePresence = "none" | "ghost" | "full";

export interface PlanSheet {
  id: string;
  label: string;
  layers: Layer[];
  groups?: CategoryGroupId[];
  tables: TablePresence;
  chairs: boolean;
  rigs: boolean;
  numbers: boolean;
}

// Walls, doors and zone floors are on EVERY sheet and are therefore not a flag: a plan with no room
// on it is not a plan.
export const PLAN_SHEETS: PlanSheet[] = [
  { id: "hall", label: "שרטוט אולם", layers: [], tables: "full", chairs: true, rigs: false, numbers: true },
  { id: "design", label: "שרטוט עיצוב", layers: ["floor", "table"], tables: "full", chairs: true, rigs: false, numbers: true },
  { id: "ceiling", label: "תוכנית תקרה", layers: ["ceiling"], tables: "ghost", chairs: false, rigs: true, numbers: true },
  { id: "stage", label: "במה", layers: ["floor"], groups: ["grp-stages"], tables: "none", chairs: false, rigs: false, numbers: false },
  { id: "chairs", label: "פריסת כיסאות", layers: [], tables: "ghost", chairs: true, rigs: false, numbers: true },
];

export function sheetById(id: string): PlanSheet | undefined {
  return PLAN_SHEETS.find((s) => s.id === id);
}

// ponytail: self-check. Run: npm run check:sheets
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  assert(new Set(PLAN_SHEETS.map((s) => s.id)).size === PLAN_SHEETS.length, "sheet ids are unique");
  assert(PLAN_SHEETS.every((s) => s.label.trim().length > 0), "every sheet is named on screen");
  assert(sheetById("ceiling")!.rigs, "the ceiling plan carries the rods");
  assert(sheetById("ceiling")!.tables === "ghost", "…and ghosts the tables, so a rigger knows what is underneath");
  assert(!sheetById("hall")!.rigs, "the hall plan does not");
  assert(sheetById("design")!.layers.includes("table"), "the design sheet carries what is ON the tables");
  assert(sheetById("gone") === undefined, "an unknown id is undefined, not a throw");
  console.log("sheets self-check passed");
}
```

- [ ] **Step 2: `lib/outputs/dimensions.ts`**

```ts
// The overall size of each room, drawn the way a plan says it: a line with witness lines at both
// ends and the figure reading along it. Not a caption -- a dimension is part of the drawing, and a
// crew measures off it.
//
// ONLY the overall width and depth are automatic. Aisle widths, setbacks and the distance between
// two chosen tables are dimensions a designer PLACES, which is a drawing tool and its own field on
// the document; see the spec's "deliberately not built".
import type { Point } from "@/lib/studio/hall";
import { isMain } from "../self-check";

export interface DimensionLine {
  from: Point;
  to: Point;
  /** Metres to two decimals — what a plan is figured in. */
  label: string;
  /** How far off the drawing the line sits, in world mm; sign says which side. */
  offsetMm: number;
}

const metres = (mm: number) => `${(mm / 1000).toFixed(2)}`;

/** The width along the bottom and the depth up one side, from a zone's bounding box. A boundary
 *  with no area gets nothing — there is no room to figure. */
export function overallDimensions(boundary: Point[], offsetMm = 900): DimensionLine[] {
  if (boundary.length < 3) return [];
  const xs = boundary.map((p) => p.x);
  const ys = boundary.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  if (maxX - minX < 1 || maxY - minY < 1) return [];
  return [
    { from: { x: minX, y: maxY }, to: { x: maxX, y: maxY }, label: metres(maxX - minX), offsetMm },
    { from: { x: maxX, y: minY }, to: { x: maxX, y: maxY }, label: metres(maxY - minY), offsetMm },
  ];
}

// ponytail: self-check. Run: npm run check:dimensions
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const square: Point[] = [
    { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 8000 }, { x: 0, y: 8000 },
  ];
  const d = overallDimensions(square);
  assert(d.length === 2, "a room is figured on two sides");
  assert(d[0].label === "12.00" && d[1].label === "8.00", "a 12x8m hall is figured 12.00 and 8.00");
  assert(d[0].from.y === 8000 && d[0].to.y === 8000, "the width runs along one edge, not through the room");
  assert(overallDimensions([{ x: 0, y: 0 }, { x: 1, y: 1 }]).length === 0, "two points are not a room");
  assert(overallDimensions([]).length === 0, "nothing is not a room either");

  // An L-shape is figured on its bounding box, which is what "overall" means.
  const ell: Point[] = [
    { x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 4000 }, { x: 4000, y: 4000 },
    { x: 4000, y: 9000 }, { x: 0, y: 9000 },
  ];
  const e = overallDimensions(ell);
  assert(e[0].label === "10.00" && e[1].label === "9.00", "an L-shaped hall is figured on its overall extent");
  console.log("dimensions self-check passed");
}
```

- [ ] **Step 3: Wire both scripts**

```json
    "check:sheets": "tsx lib/outputs/sheets.ts",
    "check:dimensions": "tsx lib/outputs/dimensions.ts",
```

- [ ] **Step 4: Run them**

Run: `npm run check:sheets` → Expected: PASS
Run: `npm run check:dimensions` → Expected: PASS
Run: `npm run typecheck` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/outputs/sheets.ts lib/outputs/dimensions.ts package.json
git commit -m "$(cat <<'EOF'
feat(outputs): five named plan sheets, and the figures on them

A crew does not read one drawing with everything on it. Layers alone cannot
express it either -- "the stage" and "chairs" are category groups, not layers
-- so a sheet filters on both plus the few things that are neither.

Ghosted tables are the flag that earns its place: a rigger needs to know which
table is under the chandelier, and a ceiling plan with no tables cannot say,
while tables at full weight would bury the rods.

Only overall dimensions are automatic. A placed dimension is a drawing tool
and its own field on the document.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: The drafting frame

One component, so the standard is defined once and cannot drift across five sheets.

**Files:**
- Create: `app/(app)/outputs/sheet-frame.tsx`

**Interfaces:**
- Consumes: `fitScale`, `scaleBarSteps` (Task 13), `PlanSheet` (Task 14).
- Produces: `<SheetFrame world sheet title subtitle sheetNumber sheetCount version date legend>{children}</SheetFrame>`, and `LINE_WEIGHTS`.

- [ ] **Step 1: Build it**

Create `app/(app)/outputs/sheet-frame.tsx`. It:

1. Takes the world extent, calls `fitScale` against the usable frame (paper − margins − title block height), and sets the SVG's **`width` and `height` in `mm`** with a `viewBox` in world mm. **Do not** put `className="w-full"` on it — that is exactly what destroys the scale.
2. Renders `children` (the drawing) inside that SVG.
3. Draws the graphic scale bar bottom-start, from `scaleBarSteps` — alternating filled/empty divisions, figures under the ticks, `0` and the total in metres.
4. Draws the title block along the bottom edge: venue · event and client · sheet name · `n / total` · `1:100` · date · `גרסה n` · studio name. Hairline-ruled cells.
5. Draws a north arrow top-end, only when the venue plan states an orientation; renders nothing otherwise.
6. Draws the legend, boxed at the side, from the rows it is handed.

Export the weights so the map uses the same numbers:

```ts
/** Line weights in PRINTED millimetres. Paired with vectorEffect="non-scaling-stroke", so they stay
 *  constant as the scale changes — a 0.6mm wall is 0.6mm at 1:20 and at 1:500, which is the whole
 *  point of a weight hierarchy. */
export const LINE_WEIGHTS = {
  wall: 0.6,
  feature: 0.35,
  furniture: 0.25,
  annotation: 0.18,
  overhead: 0.25,
} as const;
```

**Black and white only.** No `accent`, no tinted fills. Fills are white, black, or one of the `<pattern>` defs this component owns: `hatch-diagonal` (a stage), `hatch-cross` (a pool), `dot-ghost` (a ghosted table). A designer's chosen element style selects a *pattern*, never a hue.

- [ ] **Step 2: Verify**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run check:costs` → Expected: PASS (this file is under `app/(app)/outputs`)

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/outputs/sheet-frame.tsx"
git commit -m "$(cat <<'EOF'
feat(outputs): the drafting frame every plan sheet is drawn in

Title block, graphic scale bar, north arrow, legend and the printed-millimetre
line-weight hierarchy, in one component -- so the standard is defined once and
cannot drift between five sheets.

The SVG's width is set in mm, not 100%: a percentage is what makes a drawing a
picture of a drawing.

Black and white only. Fills are white, black or a hatch pattern; a designer's
element style picks a PATTERN, never a hue, because PRODUCT.md requires these
sheets be legible photocopied.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: The map draws a sheet

**Files:**
- Modify: `app/(app)/outputs/placement-map.tsx`

**Interfaces:**
- Consumes: `PlanSheet` (Task 14), `SheetFrame` + `LINE_WEIGHTS` (Task 15), `overallDimensions` (Task 14), `OVERHEAD_DASH` (Task 2), `resolveHang` (Task 5).

- [ ] **Step 1: Take the sheet**

Change the signature to `{ doc, plan, sheet, ...frameProps }` and wrap the drawing in `<SheetFrame>`, moving the current `<svg viewBox=...>` wrapper out. The component now draws content only.

- [ ] **Step 2: Filter on the sheet, never on a hard-coded category**

- Walls, doors, zone floors: always.
- Tables: `sheet.tables` — `"full"` as now, `"ghost"` at `LINE_WEIGHTS.annotation` with the `dot-ghost` fill and no number, `"none"` skipped.
- Chairs: `sheet.chairs`.
- Placements: keep `p` when `sheet.layers.includes(p.layer)` **and**, if `sheet.groups` is set, the product's category group is in it.
- Rods: `sheet.rigs`, at `LINE_WEIGHTS.overhead` with `OVERHEAD_DASH`, labelled with height.
- Ceiling placements: `overhead` on `FootprintShape`, positioned through `resolveHang` when hung.
- Numbers: `sheet.numbers`.
- Dimensions: `overallDimensions(zone.boundary)` per zone, at `LINE_WEIGHTS.annotation`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run check:costs` → Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/outputs/placement-map.tsx"
git commit -m "$(cat <<'EOF'
feat(outputs): the placement map draws whichever sheet it is handed

Every filter decision is a lookup on the PlanSheet, never a hard-coded
category test in the renderer -- so a sixth sheet is one line in an array
rather than a new branch in here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Choosing and printing sheets

**Files:**
- Modify: `app/(app)/outputs/outputs-screen.tsx`

- [ ] **Step 1: Multi-select and multi-page**

Replace the single `map` view's rendering with a sheet multi-select (default: `hall`). Each ticked sheet renders its own `<article className="sheet">` page, numbered `n / total`. Reuse `components/multi-select.tsx` if it fits; otherwise a row of toggle chips.

Keep the existing top-of-page header for `packing` and `quote` — those are documents, not drawings, and their header stays exactly as it is. Plan sheets carry the title block instead, so pass `stamped={false}` for the map view.

- [ ] **Step 2: One press, one seal**

`print()` is unchanged in shape: `recordExport(event.id, "placement_map")` once, then `window.print()`. Printing three sheets is one export of one drawing at one version — do **not** call `recordExport` per sheet, and do not extend the `export_type` pgEnum.

- [ ] **Step 3: Verify**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run check:costs` → Expected: PASS
Run: `npm run dev`, open `/outputs`, tick **שרטוט אולם** + **תוכנית תקרה**, press print.
Expected: two pages in the print preview, each with its own title block, each stating its own scale, numbered 1/2 and 2/2. Measure a known 5m wall against the printed scale bar — it must read 5m.

- [ ] **Step 4: Full verification sweep**

```bash
npm run typecheck
npm run check:actions && npm run check:access && npm run check:costs
npm run check:stacking && npm run check:anchor && npm run check:snap
npm run check:structure && npm run check:selection
npm run check:scale && npm run check:sheets && npm run check:dimensions
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/outputs/outputs-screen.tsx"
git commit -m "$(cat <<'EOF'
feat(outputs): print the plan sheets a job needs, in one press

Ticking three sheets prints three pages through the existing print path, each
with its own title block and its own scale.

One press is still ONE export at one document version: printing the ceiling
plan and the hall plan is one export of one drawing, so recordExport is called
once and export_type keeps its three values.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1a ceiling leaves the floor stack | 1 |
| §1b overhead look | 2 |
| §1c active layer | 3 |
| §2a `CeilingRig` | 4 |
| §2b drawing rods at /halls | 6 |
| §2c `RigHang` + anchor trio | 5 |
| §2d hang gesture / table-under-rod | 7, 8 |
| §2e knowing a rod is there | 7 |
| §3a selection commands | 11 |
| §3b `applyToTables`, `copyDressing` | 9, 10 |
| §3c distribute | 12 |
| §4a the sheet | 14 |
| §4b scale, bar, title block, weights, dimensions, B&W, north, legend | 13, 14, 15 |
| §4c wiring | 16, 17 |
| §4d export log unchanged | 17 |

**Type consistency:** `RigHang` (Task 5) is consumed unchanged in Tasks 7 and 16. `nearestRig` returns `{ rigId, distanceMm, t }` in Task 5 and is destructured as such in Task 7. `PlanSheet.tables` is `TablePresence` in Task 14 and switched on as `"full" | "ghost" | "none"` in Task 16. `fitScale` returns `{ denominator, paperMm }` in Task 13 and both are read in Task 15. `OVERHEAD_DASH` is exported in Task 2 and imported in Tasks 7 and 16.

**Known soft spots the implementer must resolve by reading the code, not guessing:**
- Task 11's `pointInPolygon` — check `lib/venues/faces.ts` and `lib/studio/geometry.ts` first; reuse beats adding.
- Task 12's `moveMany` payload — match the shape already in `lib/design-document/actions.ts`.
- Task 9's `table(...)` helper in the actions self-check — use whatever that block already defines.
- Task 2's shadow attribute on `PlacementNode` — find the existing one rather than inventing a name.
