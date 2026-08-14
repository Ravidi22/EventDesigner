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
//
// `x`/`y` is the top-left of the UNROTATED rectangle and `rotationDeg` turns it about its centre —
// the placement maths in ./underlay.ts depends on reading that the same way the renderer does.
export interface PlanUnderlay {
  /** Where the bytes live — `lib/files/` minted it, and it is a bucket URL or this app's own file
   *  route depending on which driver is configured. Empty for a row written before file storage. */
  url: string;
  fileName: string;
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  opacity: number; // dimmed while tracing so the traced outline stays readable over it
}

export interface VenuePlan {
  /** ⚠ PINNED TO 1, AND NOT A STUB. The plane is millimetres (lib/studio/hall.ts), so a "unit" IS
   *  a millimetre and the factor is 1 by definition.
   *
   *  It survives from the cancelled PDF import (ADR-3), which was the only thing that ever put
   *  foreign units on this plane. Calibrating a traced plan (F-3.4) scales the UNDERLAY instead —
   *  see lib/venues/underlay.ts for why putting an image's scale here would make a product's size
   *  depend on which building it is in, and would reach the quote. */
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
  /** WHY this geometry is empty, when it is.
   *
   *  Events belong to the whole studio; venues are granted per member. So a designer can open an
   *  event booked into a hall nobody shared with them, and the honest answers "there is no plan
   *  yet" and "there is a plan and it is not yours to see" are two different sentences that used to
   *  arrive as the same empty room.
   *
   *  ⚠ It is NOT enough to draw a blank plane in that case: a drape measures its metres off the
   *  wall it hangs on, and with no wall it falls back to the product's catalog width (see
   *  lib/design-document/measure.ts). A 14-metre wall then quotes as 3 metres of fabric — a wrong
   *  PRICE, silently, on a screen that looked merely empty. Any surface that measures or prices has
   *  to check this field and say so. */
  access: VenueAccessState;
}

/**
 *   none    — the event has not picked a venue yet. A normal mid-details state, nothing to say.
 *   granted — the plan below is the real one.
 *   denied  — a property exists here and this person has no grant on it.
 */
export type VenueAccessState = "none" | "granted" | "denied";
