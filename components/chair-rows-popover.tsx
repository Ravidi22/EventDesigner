"use client";

import { Rows3 } from "lucide-react";
import type { ChairRows } from "@/lib/design-document/types";
import { AISLE_MM, CHAIR_GAP_MM, MAX_PER_ROW, MAX_ROWS, ROW_GAP_MM, chairRowsLayout } from "@/lib/design-document/chair-rows";
import { Popover } from "@/components/popover";
import { Note, PanelRow, ltr } from "@/components/inspector-bar";
import { NumberField } from "@/components/number-field";
import { Switch } from "@/components/toggle";
import { Button } from "@/components/button";

/** CHAIRS IN ROWS — the seats facing a חופה (lib/design-document/chair-rows.ts): how many rows, how
 *  many chairs in each, the legroom between rows, the space between chairs, and a centre aisle. Every
 *  field is one edit; what the block comes to — chairs and floor — is said under it.
 *
 *  The one panel for both blocks: a sketch's block of a catalog chair (the studio's bar) and the
 *  venue's own rows (a `seating` feature, the hall editor's bar). `single` is the sketch's: there a
 *  chair on the floor is a row of one, so typing 5 rows makes it a block and "כיסא בודד" puts it
 *  back; a venue block is always a block. */
export function ChairRowsPopover({
  rows,
  chair,
  onChange,
  single = false,
}: {
  /** Absent = a single chair (only with `single`). */
  rows: ChairRows | undefined;
  /** One chair's box. */
  chair: { widthMm: number; depthMm: number };
  onChange: (rows: ChairRows | null) => void;
  single?: boolean;
}) {
  const spec: ChairRows = rows ?? { rows: 1, perRow: 1 };
  const layout = chairRowsLayout(spec, chair);
  const count = layout.rows * layout.perRow;
  const set = (patch: Partial<ChairRows>) => {
    const next = { ...spec, ...patch };
    // Back to one chair and nothing else asked of it: a chair, not a block of one.
    if (single && next.rows <= 1 && next.perRow <= 1 && !rows) return;
    onChange(next);
  };
  const cm = (mm: number) => Math.round(mm / 10);
  return (
    <Popover label="שורות" icon={Rows3} value={rows ? ltr(`${spec.rows}×${spec.perRow}`) : "כיסא בודד"} panelClassName="w-80">
      <PanelRow label="שורות" htmlFor="rows-n">
        <NumberField id="rows-n" decimals={0} min={1} max={MAX_ROWS} value={spec.rows} onChange={(n) => set({ rows: n })} className="w-20" />
      </PanelRow>
      <PanelRow label="כיסאות בשורה" htmlFor="rows-per">
        <NumberField id="rows-per" decimals={0} min={1} max={MAX_PER_ROW} value={spec.perRow} onChange={(n) => set({ perRow: n })} className="w-20" />
      </PanelRow>
      {rows && (
        <>
          <PanelRow label="רווח בין השורות (ס״מ)" htmlFor="rows-gap">
            <NumberField id="rows-gap" decimals={0} min={0} max={300} step={5} commitOnBlur value={cm(layout.rowGapMm)} onChange={(v) => set({ rowGapMm: v * 10 })} className="w-20" />
          </PanelRow>
          <PanelRow label="רווח בין הכיסאות (ס״מ)" htmlFor="rows-chair-gap">
            <NumberField id="rows-chair-gap" decimals={0} min={0} max={300} step={5} commitOnBlur value={cm(layout.gapMm)} onChange={(v) => set({ gapMm: v * 10 })} className="w-20" />
          </PanelRow>
          <PanelRow label="מעבר באמצע">
            <Switch checked={!!spec.aisleMm} onChange={(on) => set({ aisleMm: on ? AISLE_MM : 0 })} label="מעבר באמצע" />
          </PanelRow>
          {!!spec.aisleMm && (
            <PanelRow label="רוחב המעבר (ס״מ)" htmlFor="rows-aisle">
              <NumberField id="rows-aisle" decimals={0} min={10} max={600} step={10} commitOnBlur value={cm(spec.aisleMm)} onChange={(v) => set({ aisleMm: v * 10 })} className="w-20" />
            </PanelRow>
          )}
          <p className="nums mt-1 text-xs font-medium text-ink">
            {`${count} כיסאות · ${(layout.widthMm / 1000).toFixed(2)} × ${(layout.depthMm / 1000).toFixed(2)} מ׳`}
          </p>
          <Note>
            השורה הראשונה היא החזית, והכיסאות פונים אליה — סובבו את הבלוק אל החופה. שורות נוספות מאריכות אותו לאחור, והחזית
            נשארת במקומה. ברירת המחדל: {cm(ROW_GAP_MM)} ס״מ בין השורות, {cm(CHAIR_GAP_MM)} ס״מ בין הכיסאות.
          </Note>
          {single && (
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => onChange(null)}>
              כיסא בודד
            </Button>
          )}
        </>
      )}
      {!rows && <Note>כיסא בודד הוא שורה אחת של כיסא אחד. כמה שורות או כמה כיסאות בשורה — והוא נעשה בלוק של שורות, כמו מול החופה.</Note>}
    </Popover>
  );
}
