"use client";

import { Check, Expand, Grid2x2Plus, PenLine, Ruler, Squircle, TriangleAlert, X } from "lucide-react";
import type { Point } from "@/lib/studio/hall";
import { asRect, type DeckType, type FillResult } from "@/lib/studio/stage-fill";
import type { AreaShape, RoundedAt } from "@/lib/studio/stage-draw";
import type { PieceInfo } from "@/lib/studio/stage-rim";
import { MissingPieces } from "./missing-pieces";
import { Bar, BarButton, Note, PanelRow, ltr } from "@/components/inspector-bar";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
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
      /** Corner by corner, or round (lib/studio/stage-draw.ts AreaShape). Absent = corners. */
      shape?: AreaShape;
    }
  | {
      phase: "pick";
      polygon: Point[];
      /** The corners a curve runs through (StageBuild.smooth) — an area drawn round, or a round stage
       *  being edited. Its corners are not grips: a curve is redrawn, not dented. */
      smooth?: number[];
      /** The shape it was drawn as, for "סימון מחדש". */
      shape?: AreaShape;
      /** The edge facing the room — rows are laid from it (edge i runs polygon[i] → polygon[i+1]). */
      front: number;
      /** Variant ids of the decks the stage may be built from. */
      chosen: string[];
      /** The stage on the plan this is re-drawing, if any. */
      editing?: string;
      /** Decks may reach past the line where that beats a bare strip (FillOptions.exceed). */
      exceed?: boolean;
      /** A RECTANGLE's shaping (StageBuild.roundedMm / roundedAt / bowMm): the corners rounded at
       *  this radius, which of them, and the front bowed out by this much. `polygon` stays the plain
       *  rectangle as drawn — the shape is derived from it every time, so changing the radius never
       *  rounds an outline that was rounded already. Offered only while the area IS a rectangle. */
      roundedMm?: number;
      roundedAt?: RoundedAt;
      bowMm?: number;
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
  onAddPieces,
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
  /** Put these rim pieces — a quarter-round, a curved deck, a triangle the stage needs and the studio
   *  lacks — into the catalog (category stage-decks), chosen for this stage. */
  onAddPieces: (infos: PieceInfo[]) => void;
  onClose: () => void;
}) {
  const decks = layout?.decks ?? [];
  const byType = types
    .map((t) => ({ t, n: decks.filter((d) => d.typeId === t.id).length }))
    .filter((x) => x.n > 0);
  const areaM2 = (layout?.areaMm2 ?? 0) / 1e6;
  // ROUNDED CORNERS AND A BOWED FRONT — a rectangle's, and only while the area still is one (a corner
  // dragged out of square takes the chip away, and the shape with it).
  const rectangle = !state.smooth?.length && asRect(state.polygon, state.front) !== null;
  const roundedMm = rectangle ? (state.roundedMm ?? 0) : 0;
  const bowMm = rectangle ? (state.bowMm ?? 0) : 0;
  const roundedAt: RoundedAt = state.roundedAt ?? "all";
  // The rim pieces the build needs and the catalog does not have (lib/studio/stage-rim.ts).
  const missing = layout?.missing ?? [];
  const AT_LABEL: Record<RoundedAt, string> = { all: "כל הפינות", front: "פינות החזית", back: "פינות האחוריות" };
  const shapeValue = [roundedMm > 0 ? `R${cm(roundedMm)} · ${AT_LABEL[roundedAt]}` : null, bowMm > 0 ? `חזית קמורה ${cm(bowMm)}` : null].filter(Boolean).join(" · ") || "ישרות";
  // A round area has no sides to read lengths off: its size is said here instead.
  const xs = state.polygon.map((q) => q.x);
  const ys = state.polygon.map((q) => q.y);
  const across = Math.max(...xs) - Math.min(...xs);
  const deep = Math.max(...ys) - Math.min(...ys);
  const roundSize = state.smooth?.length ? (Math.abs(across - deep) < 15 && state.smooth.length === state.polygon.length ? `קוטר ${m(across)} מ׳` : ltr(`${m(across)}×${m(deep)} מ׳`)) : null;
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
      facts={[roundSize, `${areaM2 < 10 ? areaM2.toFixed(2) : areaM2.toFixed(1)} מ״ר`, `${decks.length} פלטות`, missing.length > 0 ? `${missing.length} חסרות` : null, `כיסוי ${pct}%`].filter(Boolean).join(" · ")}
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

      {/* A rectangle's corners rounded, its front bowed — derived from the plain rectangle every
          time, so the radius can be changed back and forth. The curves are built of pieces made for
          them; the ones the catalog lacks are said in "חסר בקטלוג". */}
      {rectangle && (
        <Popover label="פינות" icon={Squircle} value={shapeValue} panelClassName="w-80">
          <PanelRow label="רדיוס הפינות (ס״מ)" htmlFor="stage-round">
            <NumberField
              id="stage-round"
              decimals={0}
              min={0}
              max={2000}
              step={10}
              value={cm(roundedMm)}
              onChange={(v) => onChange({ ...state, roundedMm: Math.max(0, Math.round(v * 10)) })}
              className="w-20"
            />
          </PanelRow>
          <Segmented
            label="אילו פינות"
            value={roundedAt}
            options={
              [
                ["all", "כל הפינות"],
                ["front", "פינות החזית"],
                ["back", "פינות האחוריות"],
              ] as const
            }
            onChange={(v) => onChange({ ...state, roundedAt: v })}
          />
          <PanelRow label="חזית קמורה (ס״מ)" htmlFor="stage-bow">
            <NumberField
              id="stage-bow"
              decimals={0}
              min={0}
              max={500}
              step={5}
              value={cm(bowMm)}
              onChange={(v) => onChange({ ...state, bowMm: Math.max(0, Math.round(v * 10)) })}
              className="w-20"
            />
          </PanelRow>
          <Note>
            0 = פינות ישרות, חזית ישרה. הקשתות נבנות מפלטות בצורה (רבע עיגול, פלטה מעוגלת) — מה שאין בקטלוג
            מופיע ב״חסר בקטלוג״. הקשתות נשמרות גם כשמשנים מידות אחר כך; המדרגות עוקבות אחריהן.
          </Note>
        </Popover>
      )}

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
          {pct < 100 && !suggestions.length && !missing.length && (
            <Note>{100 - pct}% מהאזור לא מכוסה — אפשר להוסיף פלטה קטנה יותר לבחירה, או לסמן אזור בכפולות של הפלטות.</Note>
          )}
        </Popover>
      )}

      <MissingPieces
        missing={missing}
        types={types}
        chosen={state.chosen}
        onUse={(ids) => onChange({ ...state, chosen: [...state.chosen, ...ids.filter((id) => !state.chosen.includes(id))] })}
        onAdd={onAddPieces}
      />

      {suggestions.length > 0 && (
        <Popover label="מידה מדויקת" icon={Ruler} value={`${100 - pct}% לא מכוסה`} panelClassName="w-72">
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <Button key={s.direction} size="sm" variant="outline" className="w-full justify-between" onClick={() => onResize(s.widthMm, s.depthMm)}>
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

const SHAPES: readonly (readonly [AreaShape, string, string])[] = [
  ["corners", "פינות", "פינה אחר פינה — מלבן, ר׳, ח׳ וכל צורה ישרה"],
  ["circle", "עיגול", "מרכז, ואז הגודל — מספר ו־Enter קובע קוטר בס״מ"],
  ["ellipse", "אליפסה", "פינה אחת ואז הפינה שמולה · Shift לעיגול"],
  ["half", "חצי עיגול", "הקוטר כמו צלע, ואז הצד שאליו הקשת פונה"],
];

/** What the area tool asks before anything is drawn: the SHAPE of the stage — corner by corner, or
 *  round (a disc, an oval, a half-round), whose rim the stairs then follow — and, when the studio
 *  has saved some, a stage from one of its templates instead. */
export function StageDrawBar({
  shape,
  onShape,
  templates,
  onTemplate,
  onRemoveTemplate,
  onClose,
}: {
  shape: AreaShape;
  onShape: (shape: AreaShape) => void;
  templates: { id: string; name: string }[];
  onTemplate: (id: string) => void;
  onRemoveTemplate: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Bar icon={Grid2x2Plus} title="במה חדשה" facts={templates.length > 0 ? "צורה לסימון על התוכנית — או במה מתבנית" : "צורה לסימון על התוכנית"} onClose={onClose}>
      <div role="group" aria-label="צורת הבמה" className="flex flex-wrap gap-1">
        {SHAPES.map(([v, label, how]) => (
          <TagToggle key={v} active={shape === v} onClick={() => onShape(v)} title={how}>
            {label}
          </TagToggle>
        ))}
      </div>
      {templates.map((t) => (
        <span key={t.id} className="inline-flex items-center rounded-md border border-border">
          <Button size="sm" variant="ghost" onClick={() => onTemplate(t.id)}>
            {t.name}
          </Button>
          <BarButton icon={X} label={`מחיקת התבנית ״${t.name}״`} onClick={() => onRemoveTemplate(t.id)} />
        </span>
      ))}
    </Bar>
  );
}
