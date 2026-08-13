// The geometry an event is designed on: the venue's ONE site plan, plus the zones this event
// occupies on it.
//
// Resolved on read, never stored. The event keeps zone ids and nothing else, so a wall corrected at
// the venue — or a zone renamed, or a door moved — is already right the next time the studio opens.
// The alternative, snapshotting a hall onto each event, is what let the drawing on screen drift
// from the property it claims to describe.
//
// The whole structure travels, not just the selected zones' walls: an event in the חופה still has
// to see the hall it opens off. Selection decides what is FRAMED and tinted (see `bounds`), never
// what is drawn or reachable.
// It reads no storage of its own. The venue's walls, zones and scale arrive as a VenueGeometry the
// caller loaded (venueGeometry() in lib/venues/storage.ts) — this file is pure geometry, and a pure
// function that secretly fetches is one that cannot be called from a test, cannot be called from
// the server, and would have to grow an `await` the day the venue store becomes a database.
import { detectFaces } from "@/lib/venues/faces";
import { emptyStructure, type VenueStructure } from "@/lib/venues/structure";
import { resolveZones, zonesBounds, type ResolvedZone } from "@/lib/venues/zone";
import { outlineBounds, type Bounds } from "@/lib/studio/geometry";
import type { VenueAccessState, VenueGeometry } from "@/lib/venues/types";
import type { Zone } from "@/lib/venues/zone";
import type { EventSummary } from "./types";

export interface EventPlan {
  venueId?: string;
  structure: VenueStructure;
  /** Every zone on the property, resolved — the context the event sits in. */
  all: ResolvedZone[];
  /** The subset this event occupies, in the order the designer picked them. */
  zones: ResolvedZone[];
  /** What a canvas frames: the event's zones, falling back to the whole property when it has none
   *  yet, so an event mid-details-step still opens on something rather than on the origin. */
  bounds: Bounds;
  mmPerUnit: number;
  /** Carried through from the geometry: whether this plane is empty because nobody picked a
   *  property, or because this property was never shared with whoever is looking. Screens render
   *  the difference — see VenueGeometry.access for why an empty plane alone is not enough. */
  access: VenueAccessState;
}

export const EMPTY_PLAN: EventPlan = {
  structure: emptyStructure(),
  all: [],
  zones: [],
  bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, widthMm: 0, heightMm: 0 },
  mmPerUnit: 1,
  access: "none",
};

/** The box around every node the structure has — the fallback frame when no zone is selected. */
function structureBounds(structure: VenueStructure): Bounds {
  return outlineBounds(structure.nodes.map((n) => ({ x: n.x, y: n.y })));
}

export function eventPlan(event: EventSummary | null, geometry: VenueGeometry): EventPlan {
  // An event with no venue has no plan and nothing to explain — but one WITH a venue that came back
  // denied still has no geometry to draw, and that difference has to survive this function rather
  // than collapsing into the same EMPTY_PLAN both used to return.
  if (!event?.venueId) return EMPTY_PLAN;
  if (geometry.access === "denied") return { ...EMPTY_PLAN, venueId: event.venueId, access: "denied" };
  const { structure, zones: allZones, mmPerUnit } = geometry;
  const faces = detectFaces(structure);
  const all = resolveZones(allZones, faces);
  // Ordered by the event's own list, not the venue's: the first zone is the one the designer
  // reached for first, and a picker that reorders behind their back is its own small bug.
  const zones = event.zoneIds
    .map((id) => all.find((r) => r.zone.id === id))
    .filter((r): r is ResolvedZone => !!r);
  const framed = zones.length ? zonesBounds(zones) : structureBounds(structure);
  return {
    venueId: event.venueId,
    structure,
    all,
    zones,
    bounds: framed.widthMm || framed.heightMm ? framed : EMPTY_PLAN.bounds,
    mmPerUnit,
    access: geometry.access,
  };
}

/** The label stored on the event (EventSummary.zonesLabel) — one place builds it, so the details
 *  form and any later caller can't disagree about the separator. */
export function labelForZones(zones: Zone[]): string {
  return zones.map((z) => z.name).join(" · ");
}
