// A change to the sketch, in words — the line on the client's "what I changed" list and on the
// designer's review panel, so both read the same sentence about the same change.
import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import type { ConflictReason, DocChange, TableAspect } from "@/lib/design-document/delta";
import { tableLabel } from "@/lib/design-document/groups";

/** Numbers in a Hebrew line read right-to-left unless isolated: "8 → 10" would print as "10 ← 8". */
const iso = (s: string) => `⁦${s}⁩`;
const arrow = (a: number | undefined, b: number | undefined) => iso(`${a ?? 0} → ${b ?? 0}`);

const ASPECT_WORD: Record<TableAspect, (b: DesignTable, a: DesignTable) => string> = {
  position: () => "הוזז",
  rotation: () => "סובב",
  type: (_b, a) => `הוחלף ל${a.type}`,
  size: () => "שונה גודל",
  seats: (b, a) => `מקומות ${arrow(b.seats, a.seats)}`,
  seated: (b, a) => `תפוסה ${arrow(b.seated, a.seated)}`,
  number: (b, a) => `מספר ${arrow(b.number, a.number)}`,
  numbered: (_b, a) => (a.unnumbered ? "ללא מספור" : "קיבל מספר"),
};

export interface ChangeWords {
  /** What it is about: "שולחן 12", "שולחן חדש". */
  title: string;
  /** What happened to it: "הוזז · מקומות 10 → 12". */
  detail: string;
  /** For the icon and the tint: what kind of change. */
  tone: "add" | "remove" | "edit";
}

export function describeChange(c: DocChange, base: DesignDocumentContent, proposed: DesignDocumentContent): ChangeWords {
  if (c.kind === "group") {
    const member = base.tables.find((t) => t.groupId === c.id);
    return { title: member ? tableLabel(base, member) : "שולחן משולב", detail: `מספר ${arrow(c.before.number, c.after.number)}`, tone: "edit" };
  }
  if (c.op === "add") {
    const t = c.after!;
    const seats = t.seats ? ` · ${iso(String(t.seats))} מקומות` : "";
    return { title: t.unnumbered ? "שולחן חדש" : `שולחן חדש ${iso(String(t.number))}`, detail: `${t.type}${seats}`, tone: "add" };
  }
  if (c.op === "remove") return { title: tableLabel(base, c.before!), detail: "הוסר", tone: "remove" };
  const words = c.aspects.map((a) => ASPECT_WORD[a](c.before!, c.after!));
  return { title: tableLabel(proposed, c.after!), detail: words.join(" · "), tone: "edit" };
}

export const CONFLICT_WORD: Record<ConflictReason, string> = {
  removed: "המעצב הסיר את השולחן הזה בינתיים",
  changed: "המעצב שינה את אותו הדבר בינתיים",
  "edited-since": "המעצב עבד על השולחן הזה מאז",
  "number-taken": "המספר כבר תפוס בסקיצה",
};
