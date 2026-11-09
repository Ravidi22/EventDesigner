"use client";
// THE QUICK BAR OF A SIDE VIEW — one shape selected in the shape editor's חזית or צד (spec docs/
// superpowers/specs/2026-11-09-backdrops-front-drawing-and-text-design.md §4): what that view is
// about, its height. The first shape stands on the floor and IS the item's height, so it asks for
// that alone; any other asks where its bottom stands and how tall it is. Then the plan bar's tail —
// copy, delete, ⋯. Numbers in centimetres, stored in millimetres.
import { ArrowUpFromLine, MoveVertical, Shapes } from "lucide-react";
import type { ShapePart } from "@/lib/catalog/types";
import { Bar, QuickLead, QuickNumber, QuickSep, QuickTail, QuickUnit } from "@/components/inspector-bar";
import type { MenuItem } from "@/components/menu";
import { ELEVATION_MIN_H_MM } from "@/lib/element/elevation";

const cm = (mm: number) => Math.round(mm) / 10;
const mmOf = (cmValue: number) => Math.round(cmValue * 10);

export function ElevationQuickBar({
  part,
  base,
  title,
  itemHeightMm,
  onChange,
  onItemHeight,
  onDuplicate,
  onRemove,
  more,
  onClose,
}: {
  part: ShapePart;
  base: boolean;
  title: string;
  itemHeightMm: number;
  onChange: (p: Partial<ShapePart>) => void;
  onItemHeight: (mm: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  more: MenuItem[];
  onClose: () => void;
}) {
  return (
    <Bar icon={Shapes} title={title} badge={base ? "בסיס" : undefined} facts={base ? "עומד על הרצפה · גובהו הוא גובה הפריט" : undefined} onClose={onClose}>
      {base ? (
        <>
          <QuickLead icon={ArrowUpFromLine} label="גובה הפריט" />
          <QuickNumber label="גובה הפריט (ס״מ)" min={1} value={cm(itemHeightMm)} onChange={(v) => onItemHeight(Math.max(ELEVATION_MIN_H_MM, mmOf(v)))} />
          <QuickUnit>ס״מ</QuickUnit>
        </>
      ) : (
        <>
          <QuickLead icon={MoveVertical} label="גובה מהרצפה" />
          <QuickNumber label="גובה מהרצפה (ס״מ)" min={0} value={cm(part.zMm ?? 0)} onChange={(v) => onChange({ zMm: Math.max(0, mmOf(v)) })} />
          <QuickUnit>ס״מ</QuickUnit>
          <QuickSep />
          <QuickLead icon={ArrowUpFromLine} label="גובה" />
          <QuickNumber label="גובה (ס״מ)" min={1} value={cm(part.heightMm ?? itemHeightMm)} onChange={(v) => onChange({ heightMm: Math.max(ELEVATION_MIN_H_MM, mmOf(v)) })} />
          <QuickUnit>ס״מ</QuickUnit>
        </>
      )}
      <QuickSep />
      <QuickTail onCopy={onDuplicate} copyLabel="שכפול הצורה · Ctrl+D" onDelete={onRemove} deleteLabel="מחיקת הצורה" more={more} moreLabel="עוד פעולות לצורה" />
    </Bar>
  );
}
