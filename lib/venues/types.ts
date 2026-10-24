// A venue is the physical property the studio works at (חוות רונית, אחוזת הדר). It owns exactly
// one site plan: a single millimetre coordinate space that every zone on the property is drawn in.
//
// That shared plane is the whole point. Before this, each hall was drawn in its own blank space
// starting at (0,0), so two halls at the same venue knew nothing about each other and "the חופה is
// just outside the big hall's doors" was unrepresentable. With one plane, adjacency, gaps and
// walking distance are all plain arithmetic — and an event that spans several zones can be drawn
// as one continuous plan instead of one drawing per room.
import type { Point } from "@/lib/studio/hall";

// The designer's own iPlan render/PDF, placed and scaled over the plan so zone outlines can be
// traced straight off it. Optional: a venue can be drawn from scratch with the wall tools instead.
// Geometry is in venue mm, same as everything else on the plan.
// ponytail: fileName only for now — real image pixels arrive with file storage, same staging as
// SketchRef in the design document.
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
