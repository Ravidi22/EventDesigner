// npm run check:stacking — the self-check of ./stacking.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, DesignTable, Placement } from "./types";
import { autoStack, DEFAULT_ORDER, floorStack, isStackable, landOnTop, restackTo, type StackAssignment, type StackBox, type StackEntry, type StackKind } from "./stacking";

// ponytail: self-check. Run: npm run check:stacking
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const table = (id: string, order?: number): DesignTable => ({
  id,
  type: "עגול",
  number: 1,
  position: { x: 0, y: 0 },
  rotation: 0,
  diameterMm: 1800,
  ...(order === undefined ? {} : { order }),
});
const place = (id: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  variantId: "v",
  layer: "floor",
  quantity: 1,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: 1,
  ...extra,
});

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

const names = (s: StackEntry[]) => s.map((e) => e.ref.id).join(" ");
const stack = floorStack(doc, classify);

// The default look IS the three passes this replaced.
assert(names(stack) === "rug t1 t2 lamp", "with nothing restacked, a rug is under the tables and an object above them");
assert(stack.length === 4, "a cloth, a drape and a chandelier are in no stack");
assert(!isStackable(stack, { kind: "placement", id: "cloth" }), "…so the buttons are not offered for them");
assert(isStackable(stack, { kind: "table", id: "t1" }), "…and are offered for a table");
assert(!isStackable(stack, { kind: "placement", id: "chandelier" }), "a ceiling item is in no floor stack");
assert(names(stack) === "rug t1 t2 lamp", "…and does not appear among the things on the floor");
assert(restackTo(stack, [{ kind: "placement", id: "chandelier" }], "front").length === 0, "…so it cannot be restacked");

// A table brought to the front clears the object above it — the thing three fixed passes could not do.
{
  const a = restackTo(stack, [{ kind: "table", id: "t1" }], "front");
  assert(a.length === 1 && a[0].kind === "table" && a[0].id === "t1", "a table can be brought to the front");
  const after = floorStack(
    { ...doc, tables: doc.tables.map((t) => (t.id === "t1" ? { ...t, order: a[0].order } : t)) },
    classify,
  );
  assert(names(after) === "rug t2 lamp t1", "…and lands in front of the object that was above it");
}

// An object sent to the back goes under the rug, which is the other half of the same idea.
{
  const a = restackTo(stack, [{ kind: "placement", id: "lamp" }], "back");
  const after = floorStack(
    { ...doc, placements: doc.placements.map((p) => (p.id === "lamp" ? { ...p, order: a[0].order } : p)) },
    classify,
  );
  assert(names(after) === "lamp rug t1 t2", "an object can be sent behind the rug");
}

// Pressing the same button twice is a no-op, not a climb.
{
  const a = restackTo(stack, [{ kind: "placement", id: "lamp" }], "front");
  assert(a.length === 0, "the thing already in front is already in front");
  const b = restackTo(stack, [{ kind: "placement", id: "rug" }], "back");
  assert(b.length === 0, "…and so is the thing already at the back");
  assert(restackTo(stack, [], "front").length === 0, "restacking nothing is not an edit");
  assert(restackTo(stack, [{ kind: "table", id: "gone" }], "front").length === 0, "…nor is restacking something that is not there");
}

// Several at once: they clear the stack together and keep their order against each other.
{
  // A ref naming the right id but the wrong kind matches nothing — the rug is a placement, and
  // asking for a TABLE called "rug" is asking for something that does not exist.
  const wrongKind = restackTo(stack, [{ kind: "table", id: "rug" }], "front");
  assert(wrongKind.length === 0, "a ref with the wrong kind matches nothing");
  const b = restackTo(stack, [{ kind: "table", id: "t2" }, { kind: "placement", id: "rug" }], "front");
  assert(b.length === 2, "two things move together");
  const byId = new Map(b.map((x) => [x.id, x.order]));
  assert(byId.get("rug")! < byId.get("t2")!, "…keeping the order they already had between them");
  const after = floorStack(
    {
      tables: doc.tables.map((t) => (t.id === "t2" ? { ...t, order: byId.get("t2") } : t)),
      placements: doc.placements.map((p) => (p.id === "rug" ? { ...p, order: byId.get("rug") } : p)),
      calibration: doc.calibration,
    },
    classify,
  );
  assert(names(after) === "t1 lamp rug t2", "…and the pair clears everything that stayed behind");
}

// A whole evening of restacking never lets an untouched rug climb over an untouched table: the
// default bands are a million apart, and one press moves something by one.
{
  let d = doc;
  for (let i = 0; i < 50; i++) {
    const s = floorStack(d, classify);
    const a = restackTo(s, [{ kind: "table", id: i % 2 === 0 ? "t1" : "t2" }], "front");
    d = { ...d, tables: d.tables.map((t) => { const m = a.find((x) => x.id === t.id); return m ? { ...t, order: m.order } : t; }) };
  }
  const s = floorStack(d, classify);
  assert(s[0].ref.id === "rug", "after fifty restacks an untouched rug is still on the floor");
  assert(s[s.length - 1].ref.id === "t2" || s[s.length - 1].ref.id === "t1", "…and the last table pressed is in front");
}

// Moving things settles what stands on what: a table carried onto a stage is drawn ON it, and a
// stage dragged over tables leaves the tables on top — without a trip to the menu per table.
{
  const d: DesignDocumentContent = { ...doc, placements: [...doc.placements, place("stage")] };
  const k2: Record<string, StackKind | undefined> = { ...kinds, stage: "item" };
  const s = floorStack(d, (p) => k2[p.id]);
  const boxes = new Map<string, StackBox>([
    ["table:t1", { x: 0, y: 0, widthMm: 1800, depthMm: 1800 }],
    ["table:t2", { x: 9000, y: 0, widthMm: 1800, depthMm: 1800 }],
    ["placement:rug", { x: 0, y: 0, widthMm: 8000, depthMm: 8000 }],
    ["placement:lamp", { x: 500, y: 500, widthMm: 400, depthMm: 400 }],
    ["placement:stage", { x: 0, y: 0, widthMm: 6000, depthMm: 4000 }],
  ]);
  const onto = autoStack(s, boxes, [{ kind: "table", id: "t1" }]);
  const ontoBy = new Map(onto.map((x) => [x.id, x.order]));
  assert(ontoBy.get("t1")! > DEFAULT_ORDER.item, "a table moved onto a stage is put above it");
  // The lamp at (500,500) stands on that table: it rises with it, and stays above it, rather than
  // being left at its band under the table it is on.
  assert(onto.length === 2 && ontoBy.get("lamp")! > ontoBy.get("t1")!, "…and the lamp standing on the table rises with it");
  const under = autoStack(s, boxes, [{ kind: "placement", id: "stage" }]);
  assert(under.some((x) => x.id === "t1"), "…and a stage moved over a table lifts the table");
  assert(!under.some((x) => x.id === "t2"), "…but not a table it does not cover");
  assert(autoStack(s, boxes, [{ kind: "placement", id: "rug" }]).length === 0, "a rug moved under a table changes nothing — the table is already on it");
  const lamp = autoStack(s, boxes, [{ kind: "placement", id: "lamp" }]);
  assert(lamp.length === 1 && lamp[0].id === "lamp", "a lamp placed before the stage was, moved onto it, comes up above it");
  const lifted = floorStack({ ...d, placements: d.placements.map((p) => (p.id === "lamp" ? { ...p, order: lamp[0].order } : p)) }, (p) => k2[p.id]);
  assert(autoStack(lifted, boxes, [{ kind: "placement", id: "lamp" }]).length === 0, "…and moved again, it is already where it should be");
  assert(autoStack(s, boxes, [{ kind: "table", id: "t2" }]).length === 0, "a table moved onto open floor changes nothing");
}

// THE DESIGNER'S ORDER STANDS. A drag settles only what it changed: a table deliberately sent
// behind a stage stays behind it when either is nudged, and comes up again only on a NEW landing.
// (The bug: every nudge put it back on top.)
{
  const d: DesignDocumentContent = { ...doc, placements: [...doc.placements, place("stage")] };
  const k2: Record<string, StackKind | undefined> = { ...kinds, stage: "item" };
  const cls = (p: Placement) => k2[p.id];
  const t1 = { kind: "table" as const, id: "t1" };
  const stageRef = { kind: "placement" as const, id: "stage" };
  const boxes = new Map<string, StackBox>([
    ["table:t1", { x: 0, y: 0, widthMm: 1800, depthMm: 1800 }],
    ["table:t2", { x: 9000, y: 0, widthMm: 1800, depthMm: 1800 }],
    ["placement:rug", { x: 0, y: 0, widthMm: 8000, depthMm: 8000 }],
    ["placement:lamp", { x: 9000, y: 9000, widthMm: 400, depthMm: 400 }],
    ["placement:stage", { x: 0, y: 0, widthMm: 6000, depthMm: 4000 }],
  ]);
  const withOrders = (base: DesignDocumentContent, a: StackAssignment[]): DesignDocumentContent => ({
    ...base,
    tables: base.tables.map((t) => { const m = a.find((x) => x.kind === "table" && x.id === t.id); return m ? { ...t, order: m.order } : t; }),
    placements: base.placements.map((p) => { const m = a.find((x) => x.kind === "placement" && x.id === p.id); return m ? { ...p, order: m.order } : p; }),
  });

  // A table in its DEFAULT band under a stage — dropped there from the rail, never dragged — has
  // been told nothing: nudged, it still comes up, and so does nudging the stage under it.
  const s0 = floorStack(d, cls);
  assert(!s0.find((e) => e.ref.id === "t1")!.ordered && s0.find((e) => e.ref.id === "stage")!.ordered === false, "nothing restacked carries no stored order");
  assert(autoStack(s0, boxes, [t1], boxes).some((a) => a.id === "t1"), "a table standing under a stage in its default band comes up when nudged — nobody said it goes under");
  assert(autoStack(s0, boxes, [stageRef], boxes).some((a) => a.id === "t1"), "…and when the stage under it is nudged");

  // Lifted onto the stage by a drag, then sent to the back by the designer.
  const lifted = withOrders(d, autoStack(s0, boxes, [t1]));
  const s1 = floorStack(lifted, cls);
  assert(names(s1) === "rug t2 lamp stage t1", "a table dragged onto the stage stands on it");
  const backed = withOrders(lifted, restackTo(s1, [t1], "back", boxes));
  const s2 = floorStack(backed, cls);
  assert(names(s2) === "t1 rug t2 lamp stage", "…and sent to the back by the designer, it is behind everything");
  assert(autoStack(s2, boxes, [t1], boxes).length === 0, "nudged on the stage, a table deliberately sent behind it STAYS behind it");
  assert(autoStack(s2, boxes, [stageRef], boxes).length === 0, "…and nudging the stage does not bring it up either");
  assert(autoStack(s2, boxes, [t1]).length === 1, "(without the gesture's start to compare against it would have come back up — the bug)");
  // Carried off the stage and back onto it: a new landing, and it lands on top again.
  const away = new Map(boxes);
  away.set("table:t1", { x: 20000, y: 0, widthMm: 1800, depthMm: 1800 });
  const landing = autoStack(s2, boxes, [t1], away);
  assert(landing.length === 1 && landing[0].id === "t1" && landing[0].order > DEFAULT_ORDER.item, "…but carried off and back onto the stage, it lands on top");
  // The stage dragged out from under it and back under it: the same new landing, seen from the other side.
  const stageAway = new Map(boxes);
  stageAway.set("placement:stage", { x: 20000, y: 0, widthMm: 6000, depthMm: 4000 });
  assert(autoStack(s2, boxes, [stageRef], stageAway).some((a) => a.id === "t1"), "…as it does when the stage is dragged back under it");

  // BRING TO FRONT CARRIES WHAT STANDS ON IT. The lamp is brought in front of everything; then the
  // stage — and its head table comes along, above it, instead of being left underneath.
  const lampFront = withOrders(lifted, restackTo(s1, [{ kind: "placement", id: "lamp" }], "front"));
  const s3 = floorStack(lampFront, cls);
  assert(names(s3) === "rug t2 stage t1 lamp", "a lamp brought to the front is in front of the stage and its table");
  const carried = restackTo(s3, [stageRef], "front", boxes);
  assert(carried.length === 2, "a stage brought to the front carries the table standing on it");
  assert(names(floorStack(withOrders(lampFront, carried), cls)) === "rug t2 lamp stage t1", "…and the table is still above the stage");
  assert(names(floorStack(withOrders(lampFront, restackTo(s3, [stageRef], "front")), cls)) === "rug t2 t1 lamp stage", "(without boxes nothing is carried — the table goes under)");
  assert(restackTo(floorStack(withOrders(lampFront, carried), cls), [stageRef], "front", boxes).length === 0, "pressed again, the stage and its cargo are already in front");
  // A table deliberately sent BEHIND the stage is nobody's cargo: the stage goes to the front alone.
  const backedLampFront = withOrders(backed, restackTo(s2, [{ kind: "placement", id: "lamp" }], "front"));
  const s4 = floorStack(backedLampFront, cls);
  const alone = restackTo(s4, [stageRef], "front", boxes);
  assert(alone.length === 1 && alone[0].id === "stage", "a table the designer sent behind the stage is not carried to the front with it");
  assert(names(floorStack(withOrders(backedLampFront, alone), cls)) === "t1 rug t2 lamp stage", "…and stays behind");
  // Sending to the back carries nothing: what stood on the stage is still above it.
  const sent = restackTo(s3, [stageRef], "back", boxes);
  assert(sent.length === 1 && sent[0].id === "stage", "a stage sent to the back goes alone");
  assert(names(floorStack(withOrders(lampFront, sent), cls)) === "stage rug t2 t1 lamp", "…and its table is still above it");
}

// WHAT STANDS ON A LIFTED THING RISES WITH IT. Stage A, with a table on it, is dragged onto the
// bigger stage B: A comes up above B, and the table comes up above A rather than sharing A's new
// order and losing the tie to it.
{
  const d: DesignDocumentContent = { ...doc, placements: [...doc.placements, place("stageA"), place("stageB")] };
  const k2: Record<string, StackKind | undefined> = { ...kinds, stageA: "item", stageB: "item" };
  const cls = (p: Placement) => k2[p.id];
  const boxes = new Map<string, StackBox>([
    ["table:t1", { x: 0, y: 0, widthMm: 1800, depthMm: 1800 }],
    ["table:t2", { x: 30000, y: 0, widthMm: 1800, depthMm: 1800 }],
    ["placement:rug", { x: 30000, y: 30000, widthMm: 8000, depthMm: 8000 }],
    ["placement:lamp", { x: 30000, y: 9000, widthMm: 400, depthMm: 400 }],
    ["placement:stageA", { x: 0, y: 0, widthMm: 6000, depthMm: 4000 }],
    ["placement:stageB", { x: 0, y: 0, widthMm: 12000, depthMm: 8000 }],
  ]);
  const onA: DesignDocumentContent = { ...d, tables: d.tables.map((t) => (t.id === "t1" ? { ...t, order: DEFAULT_ORDER.item + 1 } : t)) };
  const s = floorStack(onA, cls);
  assert(names(s) === "rug t2 lamp stageA stageB t1", "the table stands on stage A, which B was added after");
  const before = new Map(boxes);
  before.set("placement:stageA", { x: 20000, y: 0, widthMm: 6000, depthMm: 4000 });
  const a = autoStack(s, boxes, [{ kind: "placement", id: "stageA" }], before);
  const by = new Map(a.map((x) => [x.id, x.order]));
  assert(by.get("stageA")! > DEFAULT_ORDER.item, "stage A carried onto stage B rises above it");
  assert(by.get("t1")! > by.get("stageA")!, "…and the table on A rises above A");
  const after = floorStack(
    { ...onA, placements: onA.placements.map((p) => (by.has(p.id) ? { ...p, order: by.get(p.id) } : p)), tables: onA.tables.map((t) => (by.has(t.id) ? { ...t, order: by.get(t.id) } : t)) },
    cls,
  );
  assert(names(after) === "rug t2 lamp stageB stageA t1", "…so the room paints B, then A, then the table");
}

// WHAT IS NEW LANDS ON TOP. A table dropped onto a stage is on it, not under it; a stage drawn
// over a row of tables comes in front of the room and the tables come back up onto it; a rug
// keeps its place under everything unless it was laid ON something.
{
  const k2: Record<string, StackKind | undefined> = { ...kinds, stage: "item", rug2: "carpet", lamp2: "item" };
  const cls = (p: Placement) => k2[p.id];
  const boxes = new Map<string, StackBox>([
    ["table:t1", { x: 0, y: 0, widthMm: 1800, depthMm: 1800 }],
    ["table:t2", { x: 9000, y: 0, widthMm: 1800, depthMm: 1800 }],
    ["placement:rug", { x: 30000, y: 30000, widthMm: 8000, depthMm: 8000 }],
    ["placement:lamp", { x: 9000, y: 500, widthMm: 400, depthMm: 400 }],
    ["placement:stage", { x: 0, y: 0, widthMm: 6000, depthMm: 4000 }],
    ["placement:rug2", { x: 0, y: 0, widthMm: 3000, depthMm: 2000 }],
    ["placement:lamp2", { x: 40000, y: 0, widthMm: 400, depthMm: 400 }],
  ]);
  const withOrders = (base: DesignDocumentContent, a: StackAssignment[]): DesignDocumentContent => ({
    ...base,
    tables: base.tables.map((t) => { const m = a.find((x) => x.kind === "table" && x.id === t.id); return m ? { ...t, order: m.order } : t; }),
    placements: base.placements.map((p) => { const m = a.find((x) => x.kind === "placement" && x.id === p.id); return m ? { ...p, order: m.order } : p; }),
  });
  // The stage is on the plan; table t1 is the one just dropped onto it.
  const d: DesignDocumentContent = { ...doc, placements: [...doc.placements, place("stage")] };
  const s = floorStack(d, cls);
  assert(names(s) === "rug t1 t2 lamp stage", "by the bands alone a table dropped on a stage is under it");
  const a = landOnTop(s, boxes, [{ kind: "table", id: "t1" }]);
  assert(names(floorStack(withOrders(d, a), cls)).endsWith("stage t1"), "…landing on top puts it on the stage");
  // The stage is the new thing, drawn over t1: it comes to the front, and t1 back up onto it.
  const b = landOnTop(s, boxes, [{ kind: "placement", id: "stage" }]);
  assert(names(floorStack(withOrders(d, b), cls)).endsWith("stage t1"), "a stage drawn over a table leaves the table on it");
  assert(!b.some((x) => x.id === "t2"), "…and does not touch a table it does not cover");
  // Already at the front: nothing to write.
  const lamp2: DesignDocumentContent = { ...d, placements: [...d.placements, place("lamp2")] };
  assert(landOnTop(floorStack(lamp2, cls), boxes, [{ kind: "placement", id: "lamp2" }]).length === 0, "a new object on open floor, already in front, costs nothing");
  // A rug keeps its band — and is lifted only onto what it lies on.
  const rug2: DesignDocumentContent = { ...d, placements: [...d.placements, place("rug2")] };
  const r = landOnTop(floorStack(rug2, cls), boxes, [{ kind: "placement", id: "rug2" }]);
  const rugNames = names(floorStack(withOrders(rug2, r), cls));
  assert(rugNames.indexOf("rug2") > rugNames.indexOf("stage"), "a rug laid on a stage lies on it");
  assert(rugNames.indexOf("rug2") < rugNames.indexOf("t1") || !r.some((x) => x.id === "t1"), "…under the table that stands there");
}

console.log("stacking self-check passed");
