"use client";

import { Check, Copy, Expand, FlipHorizontal2, Grid2x2Plus, Move, PenLine, Pin, PinOff, RotateCw, Ruler, Square, Squircle, TriangleAlert, X } from "lucide-react";
import type { Point } from "@/lib/studio/hall";
import type { StagePiece } from "@/lib/design-document/types";
import { Select } from "@/components/select";
import { asRect, type DeckType } from "@/lib/studio/stage-fill";
import type { StageLayout } from "@/lib/design-document/stage";
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
      /** …and the decks put by hand (see the pick phase's), which stand in the room. */
      pieces?: StagePiece[];
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
      /** Decks put BY HAND — dragged to their place, swapped for another size, turned — each a piece
       *  of the stage (StageBuild.pieces) the fill lays the rest round. In the ROOM's frame (centre
       *  and facing in room mm/degrees), so a redraw or a reshape of the area leaves them standing;
       *  carried into the stage's own frame for the preview and the saved stage. */
      pieces?: StagePiece[];
      /** The deck (or hole) picked on the plan — what the bar's "פלטה" chip, the right-click menu
       *  and the keys act on. */
      picked?: DeckRef;
    };

/** One deck of the preview: a PIECE (StageBuild.pieces — put by hand, or a hole) by its index there,
 *  or a deck the fill LAID by its index in the layout's decks. */
export type DeckRef = { kind: "piece"; index: number } | { kind: "deck"; index: number };
export const sameDeckRef = (a: DeckRef | undefined, b: DeckRef | undefined): boolean => !!a && !!b && a.kind === b.kind && a.index === b.index;

/** What the designer may do to the picked deck — from the bar, the right-click menu or the keys.
 *  Every one but "release", "releaseAll" and "unpick" PINS a laid deck where it stands (it becomes a
 *  piece) and amends a pinned one. */
export type DeckAction =
  | { type: "swap"; typeId: string }
  /** A quarter turn more. */
  | { type: "turn" }
  /** Facing, degrees, relative to the stage. */
  | { type: "rotate"; deg: number }
  /** Flipped across its own width — a shaped piece's mirror image. */
  | { type: "flip" }
  /** A copy, flush beside it. */
  | { type: "duplicate" }
  /** A laid deck pinned where it stands. */
  | { type: "pin" }
  /** A piece let go — the fill lays that floor again. */
  | { type: "release" }
  /** A bare spot — no deck laid there, the platform open — or a deck again. */
  | { type: "hole"; on: boolean }
  /** Its centre put at (x, y) from the area's left end and its front, in the stage's frame, mm. */
  | { type: "place"; xMm: number; yMm: number }
  /** Its centre put here, in the room, mm — where a drag let it go. */
  | { type: "move"; centre: { x: number; y: number } }
  /** Moved by (dx, dy) in the room, mm. */
  | { type: "nudge"; dx: number; dy: number }
  | { type: "releaseAll" }
  | { type: "unpick" };

/** The picked deck as the bar shows it. */
export interface PickedDeck {
  ref: DeckRef;
  typeId: string;
  widthMm: number;
  depthMm: number;
  /** A piece — put by hand, or a hole. */
  pinned: boolean;
  hole: boolean;
  /** A shaped piece (a quarter-round, a curved deck): it has a mirror image worth offering. */
  shaped: boolean;
  /** Facing relative to the stage, degrees. */
  rotationDeg: number;
  /** Its centre from the area's left end and from its front, in the stage's frame, mm. */
  xMm: number;
  yMm: number;
}

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
  picked,
  pinnedCount,
  onDeck,
  onAddPieces,
  onClose,
}: {
  state: Extract<StageFillState, { phase: "pick" }>;
  types: (DeckType & { name: string })[];
  layout: StageLayout | null;
  /** The area overlaps a stage already on the plan (or the venue's own). Said, not refused — a
   *  designer replacing the house stage with a bigger one means to. */
  overlaps: boolean;
  onChange: (next: StageFillState) => void;
  onRedraw: () => void;
  onResize: (widthMm: number, depthMm: number) => void;
  onCommit: () => void;
  /** The deck picked on the plan, and how many decks stand pinned by hand (holes among them). */
  picked: PickedDeck | null;
  pinnedCount: number;
  /** What the designer asks of the picked deck (or of all the pinned ones). */
  onDeck: (action: DeckAction) => void;
  /** Put these rim pieces — a quarter-round, a curved deck, a triangle the stage needs and the studio
   *  lacks — into the catalog (category stage-decks), chosen for this stage. */
  onAddPieces: (infos: PieceInfo[]) => void;
  onClose: () => void;
}) {
  const decks = layout?.decks ?? [];
  const holes = layout?.holes.length ?? 0;
  const rectTypes = types.filter((t) => !t.round && !t.outline);
  const byType = types
    .map((t) => ({ t, n: decks.filter((d) => d.typeId === t.id).length }))
    .filter((x) => x.n > 0);
  const areaM2 = (layout?.areaMm2 ?? 0) / 1e6;
  // The height the build came out at — one stage is one height, and with decks of two heights chosen
  // the designer has to see which system the fill went for.
  const heights = [...new Set(byType.map(({ t }) => t.heightMm).filter((h): h is number => !!h))].map(cm);
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
      facts={[roundSize, `${areaM2 < 10 ? areaM2.toFixed(2) : areaM2.toFixed(1)} מ״ר`, `${decks.length} פלטות`, holes > 0 ? (holes === 1 ? "פתח אחד" : `${holes} פתחים`) : null, heights.length ? `גובה ${heights.join("/")} ס״מ` : null, missing.length > 0 ? `${missing.length} חסרות` : null, `כיסוי ${pct}%`].filter(Boolean).join(" · ")}
      onClose={onClose}
    >
      <Popover label="אילו במות" icon={Grid2x2Plus} value={`${state.chosen.length} מתוך ${types.length}`} panelClassName="w-80">
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <TagToggle key={t.id} active={state.chosen.includes(t.id)} onClick={() => toggle(t.id)}>
              {t.name} <span className="nums text-muted">{ltr(`${cm(t.widthMm)}×${cm(t.depthMm)}`)}{t.heightMm ? ` · ${cm(t.heightMm)} ס״מ` : ""}</span>
            </TagToggle>
          ))}
        </div>
        <Note>
          הגדולות מונחות קודם, לאורך החזית, והקטנות משלימות את השורה האחרונה. פלטות בגובה שונה או במידות
          שלא מתחברות (למשל 200×100 ו־122×244) לא מתערבבות באותה במה — כדאי לבחור גובה אחד. צד באלכסון
          מקבל שורת פלטות מסובבות לאורכו, והשוליים שאף פלטה לא נכנסת אליהם נשארים בצד האחורי.
        </Note>
      </Popover>

      {/* A deck picked on the plan — or, with none picked, the decks pinned by hand: its size, facing
          and place typed; a copy, a pin, a release, a hole left bare. The same verbs are on the
          deck's right-click menu and on the keys (lib/studio/deck-move.ts; studio-screen deckAction). */}
      {(picked || pinnedCount > 0) && (
        <Popover
          label={picked?.hole ? "פתח" : "פלטה"}
          icon={picked?.hole ? Square : Move}
          value={picked ? `${cm(picked.widthMm)}×${cm(picked.depthMm)}${picked.hole ? " · ללא פלטה" : picked.pinned ? " · במקומה" : ""}` : `${pinnedCount} במקומן`}
          panelClassName="w-[23rem]"
        >
          {picked ? (
            <>
              <PanelRow label={picked.hole ? "מידת הפתח" : "מידה"} stack>
                <Select
                  value={rectTypes.some((t) => t.id === picked.typeId) ? picked.typeId : ""}
                  onChange={(v) => v && onDeck({ type: "swap", typeId: v })}
                  aria-label={picked.hole ? "מידת הפתח" : "מידת הפלטה"}
                  options={[
                    ...(rectTypes.some((t) => t.id === picked.typeId) ? [] : [{ value: "", label: "פלטה בצורה" }]),
                    ...rectTypes.map((t) => ({ value: t.id, label: `${t.name} · ${cm(t.widthMm)}×${cm(t.depthMm)}${t.heightMm ? ` · ${cm(t.heightMm)} ס״מ` : ""}` })),
                  ]}
                  className="w-full"
                />
              </PanelRow>
              <PanelRow label="זווית" htmlFor="deck-deg">
                <div className="flex items-center gap-2">
                  <NumberField id="deck-deg" decimals={0} min={0} max={359} step={5} commitOnBlur value={Math.round(picked.rotationDeg)} onChange={(v) => onDeck({ type: "rotate", deg: v })} className="w-20" />
                  <span className="text-xs text-muted">°</span>
                  <Button size="sm" variant="outline" onClick={() => onDeck({ type: "turn" })} title="סיבוב ברבע סיבוב · R">
                    <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
                    90°
                  </Button>
                  {picked.shaped && (
                    <Button size="sm" variant="outline" onClick={() => onDeck({ type: "flip" })} title="תמונת ראי של הפלטה">
                      <FlipHorizontal2 className="h-3.5 w-3.5" strokeWidth={2} />
                      היפוך
                    </Button>
                  )}
                </div>
              </PanelRow>
              <PanelRow label="מיקום המרכז (ס״מ)">
                <div className="flex items-center gap-2">
                  <NumberField aria-label="מהקצה השמאלי" decimals={0} min={0} step={10} commitOnBlur value={cm(picked.xMm)} onChange={(v) => onDeck({ type: "place", xMm: v * 10, yMm: picked.yMm })} className="w-20" />
                  <span className="text-xs text-muted">משמאל</span>
                  <NumberField aria-label="מהחזית" decimals={0} min={0} step={10} commitOnBlur value={cm(picked.yMm)} onChange={(v) => onDeck({ type: "place", xMm: picked.xMm, yMm: v * 10 })} className="w-20" />
                  <span className="text-xs text-muted">מהחזית</span>
                </div>
              </PanelRow>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => onDeck({ type: "duplicate" })} title="עותק צמוד לידה · Ctrl+D">
                  <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                  שכפול
                </Button>
                {picked.pinned ? (
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => onDeck({ type: "release" })} title="חזרה למילוי האוטומטי · Delete">
                    <PinOff className="h-3.5 w-3.5" strokeWidth={2} />
                    שחרור
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => onDeck({ type: "pin" })} title="נשארת בדיוק כאן כשהשאר מסתדרות">
                    <Pin className="h-3.5 w-3.5" strokeWidth={2} />
                    נעיצה במקום
                  </Button>
                )}
                <Button size="sm" variant={picked.hole ? "primary" : "outline"} className="flex-1" onClick={() => onDeck({ type: "hole", on: !picked.hole })} title="עמוד שעובר דרך הבמה, פתח שירות — אין שם פלטה והבמה פתוחה">
                  <Square className="h-3.5 w-3.5" strokeWidth={2} />
                  {picked.hole ? "חזרה לפלטה" : "פתח ללא פלטה"}
                </Button>
              </div>
              <Note>
                פלטה שגררתם, החלפתם, סובבתם או שכפלתם ננעצת במקומה והמילוי מסדר את השאר סביבה. פתח נשאר ריק —
                אין בו פלטה, הוא לא נספר ולא מחופה. במקלדת: חצים מזיזים ס״מ (Shift — 10), R מסובב, Ctrl+D
                משכפל, Delete משחרר, Esc מבטל את הבחירה. לחיצה ימנית על פלטה פותחת את אותן פעולות.
              </Note>
            </>
          ) : (
            <Note>{pinnedCount === 1 ? "פלטה אחת נעוצה במקומה" : `${pinnedCount} פלטות נעוצות במקומן`} — המילוי מסדר את השאר סביבן. לחיצה על פלטה בתוכנית בוחרת אותה; גרירה מזיזה.</Note>
          )}
          {pinnedCount > 0 && (
            <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onDeck({ type: "releaseAll" })}>
              <PinOff className="h-3.5 w-3.5" strokeWidth={2} />
              שחרור כל הפלטות הנעוצות למילוי
            </Button>
          )}
        </Popover>
      )}

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
