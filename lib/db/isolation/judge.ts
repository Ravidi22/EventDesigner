// Did studio B get anything of studio A's back? (EVE-23)
//
// The test cannot know WHY an action said no, and does not need to: the property is that nothing of
// A's comes back to B and nothing of A's changes (the second half is the snapshot in ./fixture.ts).
// So an answer is a refusal unless it carries one of A's ids, whatever shape it has — a throw, an
// { error }, an empty list, or data that is all B's own.

export interface Verdict {
  refused: boolean;
  why: string;
}

/** JSON with every object's keys sorted, at every depth — the fingerprint of a row, so a change inside
 *  a jsonb column counts and key order never does. (`JSON.stringify(row, keys)` would not do: an
 *  array replacer FILTERS keys at every level, and a drawing's whole content would go unseen.) */
export function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : v,
  );
}

export function judge(result: unknown, aIds: readonly string[]): Verdict {
  if (result instanceof Error) return { refused: true, why: `threw: ${result.message.slice(0, 120)}` };
  if (result === null || result === undefined) return { refused: true, why: "nothing" };
  const text = typeof result === "string" ? result : JSON.stringify(result);
  const leaked = aIds.find((id) => text.includes(id));
  if (leaked) return { refused: false, why: `returned A's ${leaked}` };
  if (Array.isArray(result) && result.length === 0) return { refused: true, why: "an empty list" };
  if (typeof result === "object" && typeof (result as { error?: unknown }).error === "string") {
    return { refused: true, why: `error: ${String((result as { error: string }).error).slice(0, 120)}` };
  }
  return { refused: true, why: "nothing of A's" };
}
