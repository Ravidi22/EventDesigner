// npm run check:delta — the self-check of ./delta.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, DesignGroup, DesignTable, Placement } from "./types";
import { duplicateNumbers } from "./groups";
import { changeRows, diffDocuments, mergeChanges, rebaseDraft, type TableChange } from "./delta";

const assert = (ok: unknown, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log("  ok   " + what);
};
const T = (id: string, number: number, x: number, extra: Partial<DesignTable> = {}): DesignTable => ({
  id,
  type: "עגול 180",
  variantId: "v-round",
  number,
  position: { x, y: 0 },
  rotation: 0,
  diameterMm: 1800,
  seats: 12,
  ...extra,
});
const cloth = (id: string, tableId: string): Placement => ({ id, variantId: "v-cloth", layer: "table", quantity: 1, tableId, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
const doc = (tables: DesignTable[], placements: Placement[] = [], groups?: DesignGroup[]): DesignDocumentContent => ({
  calibration: { mmPerUnit: 1 },
  tables,
  placements,
  ...(groups ? { groups } : {}),
});

const base = doc([T("a", 1, 0), T("b", 2, 3000), T("c", 3, 6000)], [cloth("ca", "a"), cloth("cb", "b")]);

// ── the diff ──
{
  const proposed = doc(
    [T("a", 1, 500), T("b", 2, 3000, { rotation: 90, seats: 10 }), T("n", 4, 9000)],
    [cloth("ca", "a"), cloth("cb", "b"), cloth("cn", "n")],
  );
  const d = diffDocuments(base, proposed);
  const by = new Map(d.map((c) => [c.key, c]));
  assert(by.get("table:a")?.op === "edit" && (by.get("table:a") as TableChange).aspects.join() === "position", "a move is one aspect");
  assert((by.get("table:b") as TableChange).aspects.join() === "rotation,seats", "a turn and a seat count, in aspect order");
  assert(by.get("table:n")?.op === "add", "a new table is an add");
  assert(by.get("table:c")?.op === "remove", "a missing table is a remove");
  const jiggle = doc([T("a", 1, 4), T("b", 2, 3000, { rotation: 0.2 }), T("c", 3, 6000)]);
  assert(diffDocuments(base, jiggle).length === 0, "4mm and 0.2° are not changes");
  const styled = doc([T("a", 1, 0, { style: { fill: "#000" } }), T("b", 2, 3000), T("c", 3, 6000)]);
  assert(diffDocuments(base, styled).length === 0, "a field no aspect owns is not a change a client can make");
}

// ── the permission filter: merge onto the base itself ──
{
  const proposed = doc(
    [T("a", 1, 500, { style: { fill: "#f00" }, chairVariantId: "gold" }), T("b", 2, 3000), T("c", 3, 6000)],
    [cloth("ca", "a"), cloth("cb", "b"), { ...cloth("x", "a"), variantId: "v-centrepiece" }],
  );
  const { doc: safe, conflicts } = mergeChanges(base, base, proposed);
  const a = safe.tables.find((t) => t.id === "a")!;
  assert(conflicts.length === 0, "the base can never conflict with itself");
  assert(a.position.x === 500, "the move is kept");
  assert(a.style === undefined && a.chairVariantId === undefined, "style and chairs never travel from a proposal");
  assert(!safe.placements.some((p) => p.id === "x"), "a centrepiece added to an existing table does not travel");
}

// ── the approval: three-way ──
{
  // The designer moved on: dressed c, turned a, renumbered b to 7.
  const current = doc([T("a", 1, 0, { rotation: 45 }), T("b", 7, 3000), T("c", 3, 6000)], [cloth("ca", "a"), cloth("cb", "b"), cloth("cc", "c")]);
  const proposed = doc(
    [T("a", 1, 500, { rotation: 90 }), T("b", 5, 3000, { seats: 10 }), T("n", 4, 9000)],
    [cloth("ca", "a"), cloth("cb", "b"), cloth("cn", "n")],
  );
  const r = mergeChanges(current, base, proposed);
  const t = (id: string) => r.doc.tables.find((x) => x.id === id);
  assert(t("a")!.position.x === 500 && t("a")!.rotation === 45, "a's move lands, its turn (which the designer also changed) does not");
  assert(r.conflicts.some((c) => c.key === "table:a" && c.aspect === "rotation" && c.reason === "changed"), "…and the turn is reported");
  assert(t("b")!.seats === 10 && t("b")!.number === 7, "b's seats land, the number the designer changed stands");
  assert(r.conflicts.some((c) => c.key === "table:c" && c.reason === "edited-since") && t("c") && r.doc.placements.some((p) => p.id === "cc"), "removing a table the designer has dressed since waits");
  assert(t("n") && r.doc.placements.some((p) => p.id === "cn"), "an added table brings its cloth");
  const forced = mergeChanges(current, base, proposed, { force: ["table:a", "table:c"] });
  assert(forced.doc.tables.find((x) => x.id === "a")!.rotation === 90, "a forced change takes the client's turn");
  assert(!forced.doc.tables.some((x) => x.id === "c") && !forced.doc.placements.some((p) => p.tableId === "c"), "a forced remove takes the table and its dressing");
  const untouched = doc([T("a", 1, 0), T("b", 2, 3000), T("c", 3, 6000)], [cloth("ca", "a"), cloth("cb", "b")]);
  const r4 = mergeChanges(untouched, base, doc([T("a", 1, 0), T("b", 2, 3000)], [cloth("ca", "a"), cloth("cb", "b")]));
  assert(!r4.doc.tables.some((x) => x.id === "c") && r4.conflicts.length === 0, "a table nobody touched since is simply removed");
}
{
  // Removing a table the designer has since moved is a conflict, not a silent loss.
  const current = doc([T("a", 1, 0), T("b", 2, 3000), T("c", 3, 7000)]);
  const proposed = doc([T("a", 1, 0), T("b", 2, 3000)]);
  const r = mergeChanges(current, base, proposed);
  assert(r.conflicts.some((c) => c.key === "table:c" && c.reason === "edited-since") && r.doc.tables.some((x) => x.id === "c"), "removing an edited table waits");
  const removedByDesigner = doc([T("a", 1, 0), T("c", 3, 6000)]);
  const edit = doc([T("a", 1, 0), T("b", 2, 3000, { seats: 8 }), T("c", 3, 6000)]);
  const r2 = mergeChanges(removedByDesigner, base, edit);
  assert(r2.conflicts.some((c) => c.key === "table:b" && c.reason === "removed"), "an edit to a table the designer removed is reported");
}

// ── numbers ──
{
  // The client swapped 1 and 2: never two 1s, at any point that is returned.
  const proposed = doc([T("a", 2, 0), T("b", 1, 3000), T("c", 3, 6000)], [cloth("ca", "a"), cloth("cb", "b")]);
  const r = mergeChanges(base, base, proposed);
  assert(r.doc.tables.find((x) => x.id === "a")!.number === 2 && r.doc.tables.find((x) => x.id === "b")!.number === 1, "a swap of two numbers lands whole");
  assert(duplicateNumbers(r.doc).size === 0, "…with no duplicate");
  // The designer added a table 4 meanwhile, and the client's new table is also 4.
  const current = doc([...base.tables, T("d", 4, 12000)], base.placements);
  const added = doc([...base.tables, T("n", 4, 9000)], base.placements);
  const r2 = mergeChanges(current, base, added);
  assert(r2.doc.tables.find((x) => x.id === "n")!.number === 5 && r2.renumbered[0]?.to === 5, "an added table whose number is taken gets the next one");
  // The client renumbered c to 4, which the designer's new table now shows.
  const renum = doc([T("a", 1, 0), T("b", 2, 3000), T("c", 4, 6000)], base.placements);
  const r3 = mergeChanges(current, base, renum);
  assert(r3.doc.tables.find((x) => x.id === "c")!.number === 3 && r3.conflicts.some((c) => c.key === "table:c" && c.reason === "number-taken"), "a renumber onto a taken number is put back and reported");
}

// ── a retype resets what the studio's swap resets ──
{
  const blocked = doc([T("a", 1, 0, { blockedSides: [0] }), T("b", 2, 3000), T("c", 3, 6000)]);
  const proposed = doc([
    { id: "a", type: "מלבן 240", variantId: "v-rect", number: 1, position: { x: 0, y: 0 }, rotation: 0, widthMm: 2400, depthMm: 1200, seats: 10 },
    T("b", 2, 3000),
    T("c", 3, 6000),
  ]);
  const a = mergeChanges(blocked, blocked, proposed).doc.tables.find((x) => x.id === "a")!;
  assert(a.variantId === "v-rect" && a.widthMm === 2400 && a.diameterMm === undefined && a.blockedSides === undefined && a.seats === 10, "a retype is the studio's swap");
}

// ── blocks ──
{
  const grouped = doc([T("a", 1, 0, { groupId: "g" }), T("b", 2, 1800, { groupId: "g" }), T("c", 3, 6000)], [], [{ id: "g", number: 1 }]);
  const proposed = { ...grouped, groups: [{ id: "g", number: 9 }] };
  const r = mergeChanges(grouped, grouped, proposed);
  assert(r.doc.groups?.[0].number === 9 && r.applied.includes("group:g"), "a block's number is a change of its own");
  const loose = doc([...grouped.tables, T("n", 4, 9000, { groupId: "zz" })], [], grouped.groups);
  const r2 = mergeChanges(grouped, grouped, loose);
  assert(r2.doc.tables.find((x) => x.id === "n")!.groupId === undefined, "a new table naming a block that does not exist is loose");
}

// ── selection and rebase ──
{
  const proposed = doc([T("a", 1, 500), T("b", 2, 3000, { seats: 8 }), T("c", 3, 6000)], base.placements);
  const r = mergeChanges(base, base, proposed, { accept: ["table:b"] });
  assert(r.doc.tables.find((x) => x.id === "a")!.position.x === 0 && r.doc.tables.find((x) => x.id === "b")!.seats === 8, "only the ticked change is carried");
  const newBase = doc([T("a", 1, 0, { position: { x: 0, y: 2000 } }), T("b", 2, 3000), T("c", 3, 6000)], base.placements);
  const re = rebaseDraft(base, proposed, newBase);
  assert(re.content.tables.find((x) => x.id === "b")!.seats === 8 && re.dropped.some((c) => c.key === "table:a"), "a rebase keeps what still applies and names what it dropped");
  assert(mergeChanges(base, base, base).applied.length === 0, "no changes, nothing applied");
}

// ── a block is decided whole ──
{
  const grouped = doc([T("a", 1, 0, { groupId: "g" }), T("b", 1, 1800, { groupId: "g" }), T("c", 3, 6000)], [], [{ id: "g", number: 1 }]);
  const moved = doc([T("a", 1, 0, { groupId: "g", position: { x: 0, y: 1000 } }), T("b", 1, 1800, { groupId: "g", position: { x: 1800, y: 1000 } }), T("c", 3, 6000)], [], [{ id: "g", number: 1 }]);
  const rows = changeRows(diffDocuments(grouped, moved));
  assert(rows.length === 1 && rows[0].keys.length === 2, "a block moved is ONE row to decide");
  const r = mergeChanges(grouped, grouped, moved, { accept: ["table:a"] });
  assert(r.doc.tables.filter((t) => t.groupId === "g").every((t) => t.position.y === 1000), "ticking one member moves the whole block");
  // The designer turned one half since: the block is held back whole, both halves reported.
  const turned = doc([T("a", 1, 0, { groupId: "g", rotation: 0 }), T("b", 1, 1800, { groupId: "g", position: { x: 1800, y: 500 } }), T("c", 3, 6000)], [], [{ id: "g", number: 1 }]);
  const held = mergeChanges(turned, grouped, moved);
  assert(held.doc.tables.find((t) => t.id === "a")!.position.y === 0 && held.doc.tables.find((t) => t.id === "b")!.position.y === 500, "a block one member of which conflicts is not merged in half");
  assert(held.conflicts.some((c) => c.key === "table:a") && held.conflicts.some((c) => c.key === "table:b"), "…and both members are reported");
  const forced = mergeChanges(turned, grouped, moved, { force: ["table:b"] });
  assert(forced.doc.tables.filter((t) => t.groupId === "g").every((t) => t.position.y === 1000), "forcing one member forces the block");
}

console.log("delta: all checks passed");
