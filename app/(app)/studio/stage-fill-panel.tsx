"use client";

import { Check, Expand, Grid2x2Plus, PenLine, Ruler, TriangleAlert } from "lucide-react";
import type { Point } from "@/lib/studio/hall";
import type { DeckType, FillResult } from "@/lib/studio/stage-fill";
import { Bar, Note, ltr } from "@/components/inspector-bar";
import { Button } from "@/components/button";
import { Popover } from "@/components/popover";
import { TagToggle } from "@/components/tag-toggle";
import { Segmented } from "@/components/segmented";

// "מילוי במות" — the second half of the area tool. The area is drawn on the canvas
// (canvas-stage.tsx); this bar, in the inspector's place, says which of the studio's decks may be
// used, shows how the build came out while the preview sits on the plan, and puts the stage down —
// ONE stage (Placement.stage), whose decks are derived from its outline from then on. The same bar
// edits a stage already on the plan: `editing` is its id, and committing gives it the new outline.
//
// The choice is a set of pills rather than a list of checkboxes: it is the same "which of these"
// question the catalog's style tags ask, and a studio has a handful of deck sizes, not dozens.
//
// An area the decks do not divide into is not left as a hole to discover later: when it is a
// rectangle, the nearest sizes that DO divide are offered as buttons ("מידה מדויקת"), and taking one
// redraws the area at that size, kept against its back edge.

export type StageFillState =
  | {
      phase: "draw";
      /** Carried through a redraw, so "סימון מחדש" keeps the decks chosen and the stage being edited. */
      chosen?: string[];
      editing?: string;
    }
  | {
      phase: "pick";
      polygon: Point[];
      /** The edge facing the room — rows are laid from it (edge i runs polygon[i] → polygon[i+1]). */
      front: number;
      /** Variant ids of the decks the stage may be built from. */
      chosen: string[];
      /** The stage on the plan this is re-drawing, if any. */
      editing?: string;
      /** Decks may reach past the line where that beats a bare strip (FillOptions.exceed). */
      exceed?: boolean;
    };

const cm = (mm: number) => Math.round(mm / 10);
/** Metres for a stage's own measurements: "3.66", "4" — a stage is talked about in metres. */
const m = (mm: number) => String(Math.round(mm / 10) / 100);

export function StageFillPanel({
  state,
  types,
  layout,
  overlaps,
  onChange,
  onRedraw,
  onResize,
  onCommit,
  onClose,
}: {
  state: Extract<StageFillState, { phase: "pick" }>;
  types: (DeckType & { name: string })[];
  layout: FillResult | null;
  /** The area overlaps a stage already on the plan (or the venue's own). Said, not refused — a
   *  designer replacing the house stage with a bigger one means to. */
  overlaps: boolean;
  onChange: (next: StageFillState) => void;
  onRedraw: () => void;
  onResize: (widthMm: number, depthMm: number) => void;
  onCommit: () => void;
  onClose: () => void;
}) {
  const decks = layout?.decks ?? [];
  const byType = types
    .map((t) => ({ t, n: decks.filter((d) => d.typeId === t.id).length }))
    .filter((x) => x.n > 0);
  const areaM2 = (layout?.areaMm2 ?? 0) / 1e6;
  // Floored, not rounded — 99.4% must not read as "100%" beside a strip that is visibly bare — but
  // from the same half-percent the layout itself calls exact, so float noise on a turned area does
  // not read as 99%.
  const coverage = layout?.coverage ?? 0;
  const pct = coverage >= 0.995 ? 100 : Math.floor(coverage * 100);
  const suggestions = layout?.suggestions ?? [];
  const toggle = (id: string) =>
    onChange({ ...state, chosen: state.chosen.includes(id) ? state.chosen.filter((x) => x !== id) : [...state.chosen, id] });

  return (
    <Bar
      icon={Grid2x2Plus}
      title={state.editing ? "עריכת במה" : "מילוי במות"}
      facts={`${areaM2 < 10 ? areaM2.toFixed(2) : areaM2.toFixed(1)} מ״ר · ${decks.length} פלטות · כיסוי ${pct}%`}
      onClose={onClose}
    >
      <Popover label="אילו במות" icon={Grid2x2Plus} value={`${state.chosen.length} מתוך ${types.length}`} panelClassName="w-80">
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <TagToggle key={t.id} active={state.chosen.includes(t.id)} onClick={() => toggle(t.id)}>
              {t.name} <span className="nums text-muted">{ltr(`${cm(t.widthMm)}×${cm(t.depthMm)}`)}</span>
            </TagToggle>
          ))}
        </div>
        <Note>
          הגדולות מונחות קודם, לאורך החזית, והקטנות משלימות. פלטות בגובה שונה או במידות שלא מתחברות
          (למשל 200×100 ו־122×244) לא מתערבבות באותה במה. שוליים שאף פלטה לא נכנסת אליהם נשארים
          בצד האחורי.
        </Note>
      </Popover>

      <Popover label="חריגה מהקו" icon={Expand} value={state.exceed ? "מותרת" : "לא"} panelClassName="w-80">
        <Segmented
          label="פלטה שעוברת את הקו"
          value={state.exceed ? "on" : "off"}
          options={[
            ["off", "נשארים בקו"],
            ["on", "מותר לחרוג"],
          ] as const}
          onChange={(v) => onChange({ ...state, exceed: v === "on" })}
        />
        <Note>
          כשמותר לחרוג, פלטה שרובה בתוך האזור מונחת גם אם היא עוברת את הקו — חזית של 6.90 מ׳ נבנית
          כשבעה מטרי פלטות במקום שישה ורצועה חשופה. פלטה שרובה מחוץ לקו לא מונחת.
        </Note>
      </Popover>

      {byType.length > 0 && (
        <Popover label="מה ייכנס" value={byType.map(({ t, n }) => `${n}× ${cm(t.widthMm)}×${cm(t.depthMm)}`).join(" · ")} panelClassName="w-72">
          <ul className="space-y-1 text-xs">
            {byType.map(({ t, n }) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span className="text-ink">{t.name}</span>
                <span className="nums font-semibold text-ink">×{n}</span>
              </li>
            ))}
          </ul>
          {pct < 100 && !suggestions.length && (
            <Note>{100 - pct}% מהאזור לא מכוסה — אפשר להוסיף פלטה קטנה יותר לבחירה, או לסמן אזור בכפולות של הפלטות.</Note>
          )}
        </Popover>
      )}

      {suggestions.length > 0 && (
        <Popover label="מידה מדויקת" icon={Ruler} value={`${100 - pct}% לא מכוסה`} panelClassName="w-72">
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <Button key={s.direction} size="sm" variant="ghost" className="w-full justify-between" onClick={() => onResize(s.widthMm, s.depthMm)}>
                <span>{s.direction === "smaller" ? "להקטין ל־" : "להגדיל ל־"}<span className="nums">{ltr(`${m(s.widthMm)}×${m(s.depthMm)}`)}</span></span>
                <span className="nums text-muted">{s.decks} פלטות</span>
              </Button>
            ))}
          </div>
          <Note>
            הפלטות לא מתחלקות בדיוק במידה שסימנתם{layout?.rect ? ` (${ltr(`${m(layout.rect.widthMm)}×${m(layout.rect.depthMm)}`)} מ׳)` : ""}. המידות
            כאן מתחלקות בלי רווח. החזית נשארת ממורכזת והגב נשאר במקומו.
          </Note>
        </Popover>
      )}

      {overlaps && (
        <Popover label="חפיפה" icon={TriangleAlert} tone="warn" value="במה קיימת" panelClassName="w-72">
          <Note>
            האזור עולה על במה שכבר בתוכנית. אם זו הרחבה שלה, עדיף לערוך את הבמה הקיימת (״עריכת הבמה״
            בסרגל שלה) — כך נשארת במה אחת שהפלטות שלה מחושבות יחד.
          </Note>
        </Popover>
      )}


      <Button size="sm" variant="ghost" onClick={onRedraw}>
        <PenLine className="h-3.5 w-3.5" strokeWidth={2} />
        סימון מחדש
      </Button>
      <Button size="sm" onClick={onCommit} disabled={decks.length === 0}>
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
        {state.editing ? "עדכון הבמה" : "הוספת הבמה"} · {decks.length} פלטות
      </Button>
    </Bar>
  );
}
