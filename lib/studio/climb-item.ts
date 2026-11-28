// A flight of stairs or a ramp the studio brings for ONE event and stands on its own on the floor —
// the rented ramp at the side door, the three steps up to a platform a venue already has. Not the
// flight on a stage's edge (a StageStair, counted off the stage) and not the steps built into the
// venue (a feature, lib/venues/climb.ts): this one is on the quote and the lorry as itself.
//
// It is an ordinary placement of a `stage-stairs` or `stage-ramps` row: dropped off the rail, moved,
// turned, copied, quoted and packed as the one item it is. What the row cannot know is the step it
// covers at THIS venue (Placement.climb.heightMm), and everything that follows from that is derived
// by the venue's own rules (lib/venues/climb.ts) — risers of at most 18cm on 28cm treads, a ramp at
// 1:12 — so a step onto a rented flight and a step built into the hall are the same step.
//
// Its RUN is its size on the plan (Placement.sizeMm's depth — honoured for these rows whether or not
// the row stretches, components/footprint-shape.tsx placementFootprint), so typing a height carries
// the run with it. The HEAD of the climb stays where it stands: a ramp is set against the door it
// serves, and a higher step makes it reach further back into the room, not through the door.
//
// Pure, no DOM. Self-checked: `npm run check:climb-item`.
import type { Product } from "@/lib/catalog/types";
import type { Placement, PlacementClimb, Point } from "@/lib/design-document/types";
import {
  CLIMB_BY_CATEGORY,
  patchForHeight,
  patchForRisers,
  patchToAccessible,
  risersForRise,
  type ClimbHost,
  type ClimbKind,
} from "@/lib/venues/climb";

export function climbKindOf(product: Pick<Product, "category"> | undefined): ClimbKind | undefined {
  return product ? CLIMB_BY_CATEGORY[product.category] : undefined;
}

/** What a picture of the item needs to draw its steps or its slope (components/item-symbol.tsx):
 *  the placement's own choices, over the row's height. Undefined for anything that does not climb. */
export function climbRise(product: Product | undefined, climb?: PlacementClimb): (PlacementClimb & { heightMm: number }) | undefined {
  if (!climbKindOf(product)) return undefined;
  return { ...climb, heightMm: climb?.heightMm ?? product!.dimensions.heightMm ?? 0 };
}

type Size = { widthMm: number; depthMm: number };

/** What the venue's climb rules read off this item, at the size it is drawn. A placed climb is
 *  always straight — a curved flight is a venue's, built to its room. */
export function itemClimbHost(product: Product, size: Size, climb?: PlacementClimb): ClimbHost | null {
  const kind = climbKindOf(product);
  if (!kind) return null;
  const rise = climbRise(product, climb)!;
  return {
    kind,
    shape: "rect",
    widthMm: size.widthMm,
    depthMm: size.depthMm,
    heightMm: rise.heightMm,
    climb: { reversed: rise.reversed, risers: rise.risers },
  };
}

/** One edit to a placed climb, in the shape `setPlacementClimb` takes: its choices, the run they
 *  give, and where it stands so its head has not moved. */
export interface ClimbEdit {
  climb: PlacementClimb;
  sizeMm: Size;
  position: Point;
}

const clean = (c: PlacementClimb): PlacementClimb => {
  const out: PlacementClimb = {};
  if (c.heightMm !== undefined) out.heightMm = c.heightMm;
  if (c.reversed) out.reversed = true;
  if (c.risers) out.risers = c.risers;
  return out;
};

/** The edit that gives `p` a run of `depthMm`, keeping the head of the climb where it is. The head
 *  is the −y end of the item (the +y end when it climbs reversed); the centre moves half the change
 *  away from it, turned with the placement — a mirror flips x only, so it never enters into it. */
function carry(p: Pick<Placement, "position" | "rotation" | "scale">, host: ClimbHost, depthMm: number, climb: PlacementClimb): ClimbEdit {
  const away = ((depthMm - host.depthMm) / 2) * (climb.reversed ? -1 : 1) * (p.scale || 1);
  const rad = ((p.rotation || 0) * Math.PI) / 180;
  return {
    climb: clean(climb),
    sizeMm: { widthMm: host.widthMm, depthMm },
    position: { x: p.position.x - away * Math.sin(rad), y: p.position.y + away * Math.cos(rad) },
  };
}

type Placed = Pick<Placement, "position" | "rotation" | "scale" | "climb">;

/** A new height: the run follows at the tread the flight has, or the slope the ramp is laid at. */
export function climbHeightEdit(p: Placed, product: Product, size: Size, heightMm: number): ClimbEdit | null {
  const host = itemClimbHost(product, size, p.climb);
  if (!host) return null;
  const patch = patchForHeight(host, heightMm);
  const depth = "depthMm" in patch ? patch.depthMm : host.depthMm;
  return carry(p, host, depth, { ...p.climb, heightMm: patch.heightMm });
}

/** Typed steps (undefined, or the count the height gives anyway = derived again), at the same tread. */
export function climbRisersEdit(p: Placed, product: Product, size: Size, risers: number | undefined): ClimbEdit | null {
  const host = itemClimbHost(product, size, p.climb);
  if (!host) return null;
  const typed = risers && risers !== risersForRise(host.heightMm) ? risers : undefined;
  const patch = patchForRisers(host, typed);
  const depth = "depthMm" in patch ? patch.depthMm : host.depthMm;
  return carry(p, host, depth, { ...p.climb, risers: patch.climb.risers });
}

/** A ramp laid back to exactly 1:12. */
export function climbAccessibleEdit(p: Placed, product: Product, size: Size): ClimbEdit | null {
  const host = itemClimbHost(product, size, p.climb);
  if (!host) return null;
  const patch = patchToAccessible(host);
  return carry(p, host, "depthMm" in patch ? patch.depthMm : host.depthMm, { ...p.climb });
}

/** Up the other way — the same run, standing where it stands. */
export function climbReverseEdit(p: Placed, product: Product, size: Size): ClimbEdit | null {
  const host = itemClimbHost(product, size, p.climb);
  if (!host) return null;
  return { climb: clean({ ...p.climb, reversed: !p.climb?.reversed }), sizeMm: { widthMm: host.widthMm, depthMm: host.depthMm }, position: p.position };
}
