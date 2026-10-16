"use client";

import { PackagePlus } from "lucide-react";
import type { Point } from "@/lib/design-document/types";
import { missingByShape } from "@/lib/design-document/stage";
import type { DeckType, MissingPiece } from "@/lib/studio/stage-fill";
import { congruent, normal, pieceName, type PieceInfo } from "@/lib/studio/stage-rim";
import { Button } from "@/components/button";
import { Note } from "@/components/inspector-bar";
import { Popover } from "@/components/popover";

// "חסר בקטלוג" — the rim pieces a stage needs and the studio does not have (layStage `missing`,
// lib/studio/stage-rim.ts): a quarter-round, a deck with a curved side, a triangle. One entry per
// SHAPE, with how many of it, drawn small so the designer sees what is meant; each one either a
// piece the catalog already has that this stage was not built from ("להשתמש") or one to add.
// Shared by the fill tool's bar and the stage's own bar.

/** The shape a missing piece is, small: its outline fitted to a box, as it stands on the stage. */
function PieceGlyph({ outline }: { outline: Point[] }) {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 || 1;
  const h = Math.max(...ys) - y0 || 1;
  const s = 28 / Math.max(w, h);
  return (
    <svg width={32} height={32} viewBox="-2 -2 32 32" aria-hidden className="shrink-0">
      <polygon
        points={outline.map((p) => `${(p.x - x0) * s + (28 - w * s) / 2},${(p.y - y0) * s + (28 - h * s) / 2}`).join(" ")}
        fill="var(--color-warn-tint)"
        stroke="var(--color-warn)"
        strokeWidth={1.25}
        strokeDasharray="3 2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A catalog piece of this one's shape that the stage was not built from, if the studio has one. */
function ownedFit(m: MissingPiece, types: readonly DeckType[], chosen: readonly string[]): DeckType | undefined {
  const n = normal(m.outline);
  return types.find((t) => !chosen.includes(t.id) && (t.outline?.length || t.round) && congruent(n, normal(t.outline?.length ? t.outline : ellipse(t.widthMm, t.depthMm))));
}

const ellipse = (w: number, d: number): Point[] =>
  Array.from({ length: 48 }, (_, k) => ({ x: (w / 2) * Math.cos((2 * Math.PI * k) / 48), y: (d / 2) * Math.sin((2 * Math.PI * k) / 48) }));

export function MissingPieces({
  missing,
  types,
  chosen,
  onUse,
  onAdd,
}: {
  missing: readonly MissingPiece[];
  /** The catalog's stage pieces, by the variant id a stage stores. */
  types: readonly (DeckType & { name: string })[];
  /** The pieces the stage may be built from now. */
  chosen: readonly string[];
  /** Build the stage from these catalog pieces too. */
  onUse: (ids: string[]) => void;
  /** Make these pieces catalog rows, chosen for the stage. */
  onAdd: (infos: PieceInfo[]) => void;
}) {
  if (!missing.length) return null;
  const groups = missingByShape(missing).map((g) => {
    const sample = missing.find((m) => m.shape === g.shape)!;
    return { ...g, sample, have: ownedFit(sample, types, chosen) as (DeckType & { name: string }) | undefined };
  });
  const toAdd = groups.filter((g) => !g.have);
  return (
    <Popover label="חסר בקטלוג" icon={PackagePlus} tone="warn" value={`${missing.length} ${missing.length === 1 ? "פלטה" : "פלטות"} בצורה`} panelClassName="w-80">
      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.shape} className="flex items-center gap-2.5">
            <PieceGlyph outline={g.sample.outline} />
            <span className="min-w-0 flex-1 text-sm text-ink">
              {pieceName(g.info)} <span className="nums text-muted">×{g.count}</span>
            </span>
            {g.have ? (
              <Button size="sm" variant="outline" onClick={() => onUse([g.have!.id])}>
                להשתמש בקיימת
              </Button>
            ) : groups.length > 1 ? (
              <Button size="sm" variant="outline" onClick={() => onAdd([g.info])}>
                הוספה
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {toAdd.length > 0 && (
        <Button size="sm" className="mt-3 w-full" onClick={() => onAdd(toAdd.map((g) => g.info))}>
          <PackagePlus className="h-3.5 w-3.5" strokeWidth={2} />
          {toAdd.length === 1 ? "הוספה לקטלוג" : `הוספת ${toAdd.length} הצורות לקטלוג`}
        </Button>
      )}
      <Note>
        קשתות ופינות משופעות נבנות מפלטות בצורה, לא מחיתוך פלטות. מה שחסר מסומן בתוכנית בקו מקווקו; הוספה לקטלוג
        בוחרת את הפלטה לבמה, ואפשר לתת לה מחיר ושם בקטלוג.
      </Note>
    </Popover>
  );
}
