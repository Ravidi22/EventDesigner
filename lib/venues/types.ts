// A venue is the physical property the studio works at (חוות רונית, אחוזת הדר). It owns exactly
// one site plan: a single millimetre coordinate space that every zone on the property is drawn in.
//
// That shared plane is the whole point. Before this, each hall was drawn in its own blank space
// starting at (0,0), so two halls at the same venue knew nothing about each other and "the חופה is
// just outside the big hall's doors" was unrepresentable. With one plane, adjacency, gaps and
// walking distance are all plain arithmetic — and an event that spans several zones can be drawn
// as one continuous plan instead of one drawing per room.
import type { Point } from "@/lib/studio/hall";
import type { Zone } from "./zone";
import type { VenueStructure } from "./structure";

// A floor plan the designer already has — the venue's own PDF, a photo of a printout — placed and
// scaled over the plane so zone outlines can be traced straight off it. Optional: a venue can be
// drawn from scratch with the wall tools instead. Geometry is in venue mm, like everything else here.
//
// This is the ONLY place an imported drawing still belongs. The meeting used to import a per-event
// table layout drawn in an outside tool and align it over the hall; tables are drawn in the meeting
// itself now (lib/meeting/steps.ts — סקיצת אולם), so nothing per-event is imported any more.
// ponytail: fileName only for now — real image pixels arrive with file storage.
export interface PlanUnderlay {
  fileName: string;
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  opacity: number; // dimmed while tracing so the traced outline stays readable over it
}

export interface VenuePlan {
  // Calibration lives here, not per zone: scale is a property of the property, so measuring once
  // off the site plan keeps every zone on it honest to each other.
  mmPerUnit: number;
  boundary?: Point[]; // the property line, if the designer bothered to draw it
  underlay?: PlanUnderlay;
}

export interface Venue {
  id: string;
  name: string;
  /** Optional custom venue logo (data URL or remote URL); falls back to initials when unset. */
  logoUrl?: string;
  plan: VenuePlan;
}

export function emptyPlan(mmPerUnit = 1): VenuePlan {
  return { mmPerUnit };
}

/** Everything about a property that drawing on it requires: the wall graph, every zone on the
 *  plane, and the scale they are all measured in.
 *
 *  It exists so that the one function which turns an event into a drawable plan (eventPlan, in
 *  lib/events/plan.ts) can be handed its inputs instead of fetching them. That function is pure
 *  geometry — resolving faces, ordering zones, computing a frame — and it had grown three storage
 *  reads inside it, which made a pure calculation impossible to call without a store behind it, and
 *  will make it impossible to call without an `await` once that store is a database. Loading is the
 *  caller's job now; see venueGeometry() in ./storage. */
export interface VenueGeometry {
  structure: VenueStructure;
  /** Every zone on the property — not just the ones an event occupies. An event in the חופה still
   *  has to see the hall it opens off. */
  zones: Zone[];
  mmPerUnit: number;
}
