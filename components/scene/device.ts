// What this device can afford (spec §8): a phone or a tablet — a touch screen, or fewer than six
// cores — gets no shadow map and a pixel ratio capped at 1.25; anything else shadows and 1.5.
// A heuristic, read once by the screen that mounts the viewer; the designer's panel may override
// it later. No three here — this is plain DOM.

export interface DeviceProfile {
  shadows: boolean;
  maxDpr: number;
  touch: boolean;
}

export const CAPABLE: DeviceProfile = { shadows: true, maxDpr: 1.5, touch: false };
export const MODEST: DeviceProfile = { shadows: false, maxDpr: 1.25, touch: true };

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
