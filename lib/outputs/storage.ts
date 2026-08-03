// Per-event state the operational outputs own: packing-list spares (F-6.3) and the running export
// version (F-6.4). Both were reaching into window.localStorage from inside the components that
// render them; they live here now for the same reason every other seam does — the swap to a server
// action happens in one file, and a screen that writes storage directly is a screen the swap misses.
import { storageKey } from "@/lib/storage-keys";

/** Manual spare quantity per variant, added on top of what the design document counts. */
export type Spares = Record<string, number>;

const sparesKey = (eventId: string) => storageKey(`spares.${eventId}`);
const exportKey = (eventId: string) => storageKey(`exports.${eventId}`);

export function loadSpares(eventId: string): Spares {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(sparesKey(eventId));
    return raw ? (JSON.parse(raw) as Spares) : {};
  } catch {
    return {};
  }
}

/** Zero is not stored — an absent key and "0 spare" are the same fact, and keeping both invites
 *  them to disagree. */
export function saveSpare(eventId: string, variantId: string, quantity: number, current: Spares): Spares {
  const next = { ...current };
  if (quantity > 0) next[variantId] = quantity;
  else delete next[variantId];
  try {
    window.localStorage.setItem(sparesKey(eventId), JSON.stringify(next));
  } catch {
    // non-fatal — the returned map is still what the screen renders
  }
  return next;
}

/** F-6.4: the version number the NEXT export will carry, so the crew can tell whether the sheet in
 *  their hand is current. */
export function nextExportVersion(eventId: string): number {
  if (typeof window === "undefined") return 1;
  try {
    return Number(window.localStorage.getItem(exportKey(eventId)) ?? 0) + 1;
  } catch {
    return 1;
  }
}

export function markExported(eventId: string, version: number): void {
  try {
    window.localStorage.setItem(exportKey(eventId), String(version));
  } catch {
    // non-fatal
  }
}
