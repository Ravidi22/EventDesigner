
// The end panel's groups (components/end-panel.tsx): in what order they stand, and which of them
// are open.
//
// ORDER: a group that reports a problem (a breach, an open stage edge, a missing catalog piece)
// goes to the top, ahead of everything else, so a closed panel says what is wrong before it says
// what something is. Otherwise the caller's order stands — what it is → how it is built → how it
// looks → advanced (the board's rule) is the caller's to write, not this file's to guess.
//
// OPEN STATE is remembered PER SELECTION KIND for the session (2026-11-09, the board: "which groups
// are open is remembered per selection kind"): a designer who opened מפה on a table finds it open
// on the next table, and the stage they click after that opens on the stage's own groups, not on a
// table's. In memory, not in storage — the shape editor kept its open groups the same way, and a
// panel that reopened yesterday's groups would be a panel that remembered too much.

/** Warn groups first; otherwise the given order (stable). */
export function orderGroups<T extends { key: string; warn?: boolean }>(groups: readonly T[]): T[] {
  return [...groups.filter((g) => g.warn), ...groups.filter((g) => !g.warn)];
}

export type OpenGroups = Record<string, boolean>;

export interface GroupMemory {
  /** The kind's open groups. The FIRST read of a kind opens its defaults; after that what the
   *  designer did wins. The same object is returned until something changes (a stable snapshot for
   *  useSyncExternalStore). */
  get(kind: string, defaults?: readonly string[]): OpenGroups;
  /** Opens a closed group or closes an open one; returns the kind's new state. */
  toggle(kind: string, key: string, defaults?: readonly string[]): OpenGroups;
  /** Opens a group whatever it was — the document menu's "תוכנית רקע…" jumps to one. */
  open(kind: string, key: string): void;
  subscribe(listener: () => void): () => void;
}

export function createGroupMemory(): GroupMemory {
  const byKind = new Map<string, OpenGroups>();
  const listeners = new Set<() => void>();
  const get = (kind: string, defaults?: readonly string[]): OpenGroups => {
    const known = byKind.get(kind);
    if (known) return known;
    const first: OpenGroups = Object.fromEntries((defaults ?? []).map((k) => [k, true]));
    byKind.set(kind, first);
    return first;
  };
  const set = (kind: string, next: OpenGroups) => {
    byKind.set(kind, next);
    for (const l of listeners) l();
    return next;
  };
  return {
    get,
    toggle: (kind, key, defaults) => {
      const cur = get(kind, defaults);
      return set(kind, { ...cur, [key]: !cur[key] });
    },
    open: (kind, key) => {
      set(kind, { ...get(kind), [key]: true });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The one memory every panel on every screen shares, for the session. */
export const groupMemory: GroupMemory = createGroupMemory();
