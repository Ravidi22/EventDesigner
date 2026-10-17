"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AlignHorizontalSpaceAround, AlignVerticalSpaceAround, BookmarkPlus, Crosshair, LayoutGrid, Orbit, PaintRoller, AlignHorizontalDistributeCenter, WandSparkles, type LucideIcon } from "lucide-react";
import { Bar, Note, PanelRow } from "@/components/inspector-bar";
import { Popover } from "@/components/popover";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { InspectorDivider } from "@/components/plan-canvas";
import { SwitchRow } from "@/components/toggle";
import type { ArrangeKind } from "@/lib/design-document/dressing";
import type { HeightWave } from "@/lib/studio/hang-over";

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
  hungCount = 0,
  selectedCount,
  arranged,
  onArrange,
  onAuto,
  spread,
  onSpread,
  onAbove,
  picker,
  designs,
  onClose,
}: {
  title: string;
  /** Items on the table. */
  count: number;
  /** …and hung over it (Placement.over) — arranged by the same actions, in the same frame. */
  hungCount?: number;
  /** Of them, selected — the arrange actions act on these when there are two or more. */
  selectedCount: number;
  arranged: boolean;
  onArrange: (kind: ArrangeKind) => void;
  onAuto: () => void;
  /** The one item selected on or over the table, for "פיזור": its name and how many of it there
   *  are already. Null when none, or more than one, is selected. */
  spread?: SpreadSubject | null;
  /** N of the selected item, evenly along the table's spine; a hung one may rise and fall (wave). */
  onSpread?: (count: number, wave?: HeightWave | null) => void;
  /** One of the selected HUNG item above each item set out on the table. */
  onAbove?: (wave?: HeightWave | null) => void;
  /** The "which tables" panel (TablePatternPicker), already bound to this table. */
  picker: ReactNode;
  /** The saved table designs (TableDesignsPanel), bound to this table. */
  designs: ReactNode;
  onClose: () => void;
}) {
  const scope = selectedCount >= 2 ? `${selectedCount} הנבחרים` : "כל הפריטים";
  const any = count + hungCount;
  return (
    <Bar
      icon={PaintRoller}
      title={title}
      facts={
        any === 0
          ? "גררו פריטי עיצוב מהקטלוג אל השולחן — או מעליו"
          : `${count} על השולחן${hungCount ? ` · ${hungCount} מעליו` : ""} · ${arranged ? "מסודר ביד" : "סידור אוטומטי"} · גרירה או חיצים מזיזים (Shift — צעד גדול) · Esc ליציאה`
      }
      onClose={onClose}
    >
      {ACTIONS.map(({ kind, icon: Icon, label }) => (
        <button
          key={kind}
          type="button"
          disabled={any === 0}
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
      {onSpread && <SpreadPopover spread={spread ?? null} onSpread={onSpread} onAbove={onAbove} />}
      <InspectorDivider />
      <Popover label="עיצובים שמורים" icon={BookmarkPlus} value="עיצובים" panelClassName="w-72" side="bottom">
        {designs}
      </Popover>
      <Popover label="החלת העיצוב על שולחנות" icon={LayoutGrid} value="דפוס" panelClassName="w-72" side="bottom" disabled={any === 0}>
        {picker}
      </Popover>
    </Bar>
  );
}

/** The one item selected on or over the table, for "פיזור": its name, how many of it there are
 *  already, whether it hangs (then its height, and how many items stand on the table to hang one
 *  above each of). */
export interface SpreadSubject {
  name: string;
  count: number;
  overhead: boolean;
  heightMm?: number;
  dressed?: number;
}

/** Two hang heights alternated along a run, typed in cm — the fields shared by every run of
 *  pendants the studio lays (the spread over a table, the row run on the item's own bar). */
export function WaveFields({ on, a, b, onOn, onA, onB }: { on: boolean; a: number; b: number; onOn: (v: boolean) => void; onA: (cm: number) => void; onB: (cm: number) => void }) {
  return (
    <>
      <SwitchRow checked={on} onChange={onOn} label="גבהים לסירוגין" hint="הראשון, השלישי, החמישי… בגובה א׳; השאר בגובה ב׳ — שורה שעולה ויורדת." />
      {on && (
        <PanelRow label="גובה א׳ / ב׳ (ס״מ)">
          <NumberField aria-label="גובה א׳ בס״מ" decimals={0} min={30} max={3000} value={a} onChange={onA} className="w-20" />
          <span className="text-xs text-muted">/</span>
          <NumberField aria-label="גובה ב׳ בס״מ" decimals={0} min={30} max={3000} value={b} onChange={onB} className="w-20" />
        </PanelRow>
      )}
    </>
  );
}

/** The wave as the run takes it, in mm — null when it is off. */
export const waveOf = (on: boolean, aCm: number, bCm: number): HeightWave | null => (on ? { a: aCm * 10, b: bCm * 10 } : null);

/** "פיזור" — N of the selected item along the table's spine: its long centre line, or round the
 *  band of an arc (lib/studio/spine.ts). The count starts at how many there already are. A HUNG
 *  item may also rise and fall along the run, and may be hung once above each item on the table. */
function SpreadPopover({ spread, onSpread, onAbove }: { spread: SpreadSubject | null; onSpread: (count: number, wave?: HeightWave | null) => void; onAbove?: (wave?: HeightWave | null) => void }) {
  const [typed, setTyped] = useState<number | null>(null);
  const n = typed ?? Math.max(1, spread?.count ?? 1);
  const [waveOn, setWaveOn] = useState(false);
  const base = Math.round((spread?.heightMm ?? 3000) / 10);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const aCm = a ?? base;
  const bCm = b ?? Math.max(30, base - 40);
  const wave = spread?.overhead ? waveOf(waveOn, aCm, bCm) : null;
  return (
    <Popover label="פיזור לאורך השולחן" icon={AlignHorizontalDistributeCenter} value="פיזור" panelClassName="w-72" side="bottom" disabled={!spread}>
      {spread && (
        <>
          <PanelRow label="כמה" htmlFor="spread-count">
            <NumberField id="spread-count" aria-label="כמה" decimals={0} min={1} max={24} value={n} onChange={(v) => setTyped(Math.max(1, Math.min(24, Math.round(v))))} className="w-20" />
          </PanelRow>
          <Note>
            {`${n} × ${spread.name} ${spread.overhead ? "מעל השולחן" : "על השולחן"}, במרווחים שווים לאורך קו האמצע של השולחן — גם סביב קשת. עותקים נוספים או מוסרים לפי הכמות; שאר הפריטים נשארים במקומם.`}
          </Note>
          {spread.overhead && <WaveFields on={waveOn} a={aCm} b={bCm} onOn={setWaveOn} onA={setA} onB={setB} />}
          <Button size="sm" className="mt-2 w-full" onClick={() => onSpread(n, wave)}>
            {`פיזור ${n} לאורך השולחן`}
          </Button>
          {spread.overhead && onAbove && (
            <Button size="sm" variant="outline" className="mt-2 w-full" disabled={!spread.dressed} onClick={() => onAbove(wave)}>
              {spread.dressed ? `אחד מעל כל פריט שעל השולחן (${spread.dressed})` : "אין פריטים על השולחן לתלות מעליהם"}
            </Button>
          )}
        </>
      )}
    </Popover>
  );
}
