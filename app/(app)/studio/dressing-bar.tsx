"use client";

import type { ReactNode } from "react";
import { AlignHorizontalSpaceAround, AlignVerticalSpaceAround, BookmarkPlus, Crosshair, LayoutGrid, Orbit, PaintRoller, WandSparkles, type LucideIcon } from "lucide-react";
import { Bar } from "@/components/inspector-bar";
import { Popover } from "@/components/popover";
import { InspectorDivider } from "@/components/plan-canvas";
import type { ArrangeKind } from "@/lib/design-document/dressing";

// The bar over a table being dressed (its focus mode — see DressingOverlay in canvas-stage.tsx).
// Above the plan rather than in the inspector's place along the bottom: the inspector is still
// there, for whatever is selected ON the table (a candlestick's shade, the cloth), and this is about
// the table as a whole — how its items stand, and which other tables should look like it.

const ACTIONS: { kind: ArrangeKind; icon: LucideIcon; label: string }[] = [
  { kind: "center", icon: Crosshair, label: "למרכז" },
  { kind: "row", icon: AlignHorizontalSpaceAround, label: "בשורה" },
  { kind: "column", icon: AlignVerticalSpaceAround, label: "בטור" },
  { kind: "ring", icon: Orbit, label: "במעגל" },
];

export function DressingBar({
  title,
  count,
  selectedCount,
  arranged,
  onArrange,
  onAuto,
  picker,
  designs,
  onClose,
}: {
  title: string;
  /** Items on the table. */
  count: number;
  /** Of them, selected — the arrange actions act on these when there are two or more. */
  selectedCount: number;
  arranged: boolean;
  onArrange: (kind: ArrangeKind) => void;
  onAuto: () => void;
  /** The "which tables" panel (TablePatternPicker), already bound to this table. */
  picker: ReactNode;
  /** The saved table designs (TableDesignsPanel), bound to this table. */
  designs: ReactNode;
  onClose: () => void;
}) {
  const scope = selectedCount >= 2 ? `${selectedCount} הנבחרים` : "כל הפריטים";
  return (
    <Bar
      icon={PaintRoller}
      title={title}
      facts={
        count === 0
          ? "גררו פריטי עיצוב מהקטלוג אל השולחן"
          : `${count} פריטים · ${arranged ? "מסודר ביד" : "סידור אוטומטי"} · גרירה או חיצים מזיזים (Shift — צעד גדול) · Esc ליציאה`
      }
      onClose={onClose}
    >
      {ACTIONS.map(({ kind, icon: Icon, label }) => (
        <button
          key={kind}
          type="button"
          disabled={count === 0}
          onClick={() => onArrange(kind)}
          title={`${label} — ${scope}`}
          className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          {label}
        </button>
      ))}
      <button
        type="button"
        disabled={!arranged}
        onClick={onAuto}
        title="חזרה לסידור האוטומטי — הפריטים מסתדרים לפי צורת השולחן"
        className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <WandSparkles className="h-3.5 w-3.5" strokeWidth={2} />
        אוטומטי
      </button>
      <InspectorDivider />
      <Popover label="עיצובים שמורים" icon={BookmarkPlus} value="עיצובים" panelClassName="w-72" side="bottom">
        {designs}
      </Popover>
      <Popover label="החלת העיצוב על שולחנות" icon={LayoutGrid} value="דפוס" panelClassName="w-72" side="bottom" disabled={count === 0}>
        {picker}
      </Popover>
    </Bar>
  );
}
