// From a diff to what the sketch draws over itself (components/sketch-delta.tsx). Pure.
import type { DesignDocumentContent, DesignTable, Point } from "@/lib/design-document/types";
import type { DocChange, TableAspect } from "@/lib/design-document/delta";

export interface DeltaMark {
  key: string;
  kind: "add" | "remove" | "move" | "edit";
  /** Drawn dashed: where a moved table was, a removed one stood, or a held-back move would go. */
  ghost?: DesignTable;
  /** The table as the drawn sketch has it now — what a halo or a tag is put round. */
  at?: DesignTable;
  /** An arrow, centre to centre. */
  from?: Point;
  to?: Point;
  /** A short line on a tag — "חדש", "12 מקומות (היו 10)". */
  tag?: string;
  /** applied = in the drawn sketch; held = left out (unticked); conflict = the designer changed it too. */
  state: "applied" | "held" | "conflict";
  focused?: boolean;
}

// Words that read right whichever way the text is laid out. An arrow between two numbers ("10 → 12")
// depends on bidi isolation, which an SVG <text> on the plan does not reliably honour — rendered, it
// came out as "12 → 10", the change backwards. "12 (היו 10)" has no order to get wrong.
const TAG: Partial<Record<TableAspect, (b: DesignTable, a: DesignTable) => string>> = {
  seats: (b, a) => `${a.seats ?? 0} מקומות (היו ${b.seats ?? 0})`,
  seated: (b, a) => `${a.seated ?? 0} יושבים (היו ${b.seated ?? 0})`,
  number: (b, a) => `מספר ${a.number} (היה ${b.number})`,
  type: (_b, a) => a.type,
  size: () => "גודל חדש",
  numbered: (_b, a) => (a.unnumbered ? "ללא מספר" : "עם מספר"),
};

export interface MarkOptions {
  /** Changes left out of the drawn sketch (unticked in the review). */
  held?: ReadonlySet<string>;
  /** Changes the designer has also touched. */
  conflicts?: ReadonlySet<string>;
  focused?: string | null;
}

/**
 * The marks for `changes` (base → proposed) over `shown` — the sketch as it is drawn: the proposal
 * itself (the client's view), or the designer's drawing with the ticked changes merged (the review).
 */
export function deltaMarks(changes: readonly DocChange[], shown: DesignDocumentContent, options: MarkOptions = {}): DeltaMark[] {
  const byId = new Map(shown.tables.map((t) => [t.id, t]));
  const out: DeltaMark[] = [];
  for (const c of changes) {
    if (c.kind !== "table") continue;
    const state: DeltaMark["state"] = options.conflicts?.has(c.key) ? "conflict" : options.held?.has(c.key) ? "held" : "applied";
    const focused = options.focused === c.key;
    const now = byId.get(c.id);
    if (c.op === "add") {
      out.push(state === "applied" && now ? { key: c.key, kind: "add", at: now, tag: "חדש", state, focused } : { key: c.key, kind: "add", ghost: c.after, tag: "חדש", state, focused });
      continue;
    }
    if (c.op === "remove") {
      out.push({ key: c.key, kind: "remove", ghost: now ?? c.before, state, focused });
      continue;
    }
    const tags = c.aspects.map((a) => TAG[a]?.(c.before!, c.after!)).filter((t): t is string => !!t);
    const tag = tags.length ? tags.join(" · ") : undefined;
    if (c.aspects.includes("position") || c.aspects.includes("rotation")) {
      if (state === "applied" && now) {
        out.push({ key: c.key, kind: "move", ghost: c.before, at: now, from: c.before!.position, to: now.position, tag, state, focused });
      } else {
        const here = now ?? c.before!;
        out.push({ key: c.key, kind: "move", ghost: c.after, at: here, from: here.position, to: c.after!.position, tag, state, focused });
      }
      continue;
    }
    out.push({ key: c.key, kind: "edit", at: now ?? c.after, tag, state, focused });
  }
  return out;
}
