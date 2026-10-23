// What this device can afford (spec §8, plan D4): a phone or a tablet — a touch screen, or fewer
// than six cores — gets no shadow map, a pixel ratio capped at 1.25, no real point lights (the
// emitters' halos alone), LOD thresholds halved and the fog brought nearer; anything else gets
// shadows, 1.5, sixteen lights and the full distances. A heuristic, read once by the screen that
// mounts the viewer; the designer's panel may override it later. No three here — plain DOM.

export interface DeviceProfile {
  shadows: boolean;
  maxDpr: number;
  /** How many emitters get a REAL point light in the evening and at night (the nearest to the
   *  camera, chandeliers and lamps first). 0 = halos only. */
  pointLights: number;
  /** Multiplies every LOD distance: 0.5 halves them, so a phone drops detail twice as near. */
  lodScale: number;
  /** Multiplies where the fog starts and ends: under 1 it closes in and hides the far venue. */
  fogScale: number;
  touch: boolean;
}

export const CAPABLE: DeviceProfile = { shadows: true, maxDpr: 1.5, pointLights: 16, lodScale: 1, fogScale: 1, touch: false };
export const MODEST: DeviceProfile = { shadows: false, maxDpr: 1.25, pointLights: 0, lodScale: 0.5, fogScale: 0.6, touch: true };

export function detectDevice(): DeviceProfile {
  if (typeof window === "undefined" || typeof navigator === "undefined") return CAPABLE;
  let touch = false;
  try {
    touch = navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)")?.matches === true;
  } catch {
    touch = false;
  }
  const cores = navigator.hardwareConcurrency ?? 8;
  if (touch || cores < 6) return { ...MODEST, touch };
  return { ...CAPABLE, touch };
}

/** A caller's partial profile (an older screen passes shadows and dpr alone) filled from CAPABLE. */
export function resolveDevice(device: Partial<DeviceProfile> | undefined): DeviceProfile {
  return { ...CAPABLE, ...device };
}
