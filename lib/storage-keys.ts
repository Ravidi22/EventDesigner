// The localStorage namespace for every storage module. Keys are built here and nowhere else,
// so the prefix is a single edit — and so the pre-Eve migration below is guaranteed to run
// before any read (every localStorage access in the app goes through a lib/*/storage.ts,
// and each of those imports this module).
const PREFIX = "eve.";
const LEGACY_PREFIX = "idesign.";

let migrated = false;

// One-time rename of keys written under the old product name. Copies each `idesign.*` entry to
// its `eve.*` equivalent and drops the original, so a designer's existing catalog, events, halls
// and gallery survive the rename instead of silently reverting to sample data.
function migrateLegacyKeys(): void {
  if (migrated || typeof window === "undefined") return;
  migrated = true;
  try {
    // Snapshot the keys first — we mutate the store while walking them.
    for (const key of Object.keys(window.localStorage)) {
      if (!key.startsWith(LEGACY_PREFIX)) continue;
      const next = PREFIX + key.slice(LEGACY_PREFIX.length);
      const value = window.localStorage.getItem(key);
      // Never clobber a newer value that already exists under the new name.
      if (value !== null && window.localStorage.getItem(next) === null) {
        window.localStorage.setItem(next, value);
      }
      window.localStorage.removeItem(key);
    }
  } catch {
    // non-fatal — a blocked or full store just leaves the old keys in place
  }
}

/** Namespaced localStorage key, e.g. `storageKey("events")` → `"eve.events"`. */
export function storageKey(suffix: string): string {
  migrateLegacyKeys();
  return PREFIX + suffix;
}

/** Prefix for the rare case of scanning the store, e.g. every saved studio document. */
export function storagePrefix(suffix = ""): string {
  migrateLegacyKeys();
  return PREFIX + suffix;
}
