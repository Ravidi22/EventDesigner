import { isMain } from "../self-check";

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

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error(`panel-groups: ${m}`);
  };
  const keys = (l: { key: string }[]) => l.map((g) => g.key).join(",");

  assert(keys(orderGroups([{ key: "a" }, { key: "b", warn: true }, { key: "c" }, { key: "d", warn: true }])) === "b,d,a,c", "warn groups first, the rest in their order");
  assert(orderGroups([]).length === 0, "nothing in, nothing out");

  const m = createGroupMemory();
  assert(JSON.stringify(m.get("table", ["cloth"])) === JSON.stringify({ cloth: true }), "a kind read the first time opens its defaults");
  const after = m.toggle("table", "seats", ["cloth"]);
  assert(after.cloth === true && after.seats === true, "a toggle opens a group beside the defaults");
  assert(JSON.stringify(m.get("stage")) === "{}", "another kind starts closed");
  assert(m.get("table").seats === true, "a kind keeps its own open groups");
  assert(m.toggle("table", "cloth").cloth === false, "a toggle closes an open group");

  let calls = 0;
  const off = m.subscribe(() => calls++);
  m.open("stage", "edges");
  m.toggle("stage", "height");
  assert(calls === 2, "open and toggle both notify");
  assert(m.get("stage").edges === true, "open opens");
  off();
  m.toggle("stage", "height");
  assert(calls === 2, "an unsubscribed listener is not called");
  console.log("panel-groups: ok");
}
