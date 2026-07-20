// A hall shell (F-3.1): the halls the designer works in — geometry, entrances, obstacles,
// optional near-fixed elements (stage/bar), and calibration. It does NOT store table layouts;
// those arrive per event from the iPlan sketch (F-3.2–F-3.3).
import type { Hall } from "@/lib/studio/hall";

export interface HallTemplate {
  id: string;
  name: string;
  hall: Hall;
  mmPerUnit: number; // calibration (F-3.4), set once per hall
  createdAt: number;
}
