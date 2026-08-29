"use client";

import {
  Minus,
  Plus,
  Trash2,
  Copy,
  X,
  TriangleAlert,
  Layers,
  Maximize2,
  Group,
  Ungroup,
  Armchair,
  Users,
  RotateCw,
  BringToFront,
  SendToBack,
  Undo2,
  Building2,
} from "lucide-react";
import type { DesignDocumentContent, WallSpan } from "@/lib/design-document/types";
import type { ElementStyle } from "@/lib/element-style";
import type { FeatureKind, VenueStructure } from "@/lib/venues/structure";
import { FEATURE_KIND_LABEL } from "@/lib/venues/structure";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import { StyleFields } from "@/components/style-fields";
import { SwatchPicker } from "@/components/swatch-field";
import { LAYER_LABEL } from "@/lib/catalog/categories";
import { coverOn, resolve, shadesOf, tableUtilization } from "@/lib/studio/catalog-resolver";
import { resolveSpan, WHOLE_WALL } from "@/lib/studio/anchor";
import type { Selection } from "./canvas-stage";

export function Inspector({
  selection,
  selectedCount,
  feature,
  onResetFeature,
  facing,
  onFace,
  canRestack,
  onRestack,
  selectedTables,
  onSeatsForSelection,
  group,
  onGroup,
  onUngroup,
  onRenumberGroup,
  onSeats,
  onSeated,
  onGroupSeated,
  doc,
  structure,
  onClose,
  onQuantity,
  onDelete,
  onSmartApply,
  onApplyToAllTables,
  onVariant,
  onSpan,
  onResize,
  onRenumber,
  onStyleTable,
  onDuplicateTable,
  onRemovePlacement,
}: {
  /** The one thing being edited — null when nothing, or several things, are selected. */
  selection: Selection;
  /** How many things are selected in total. A group has no fields to show (a quantity stepper over
   *  six different products means nothing), so it gets the one panel that is still true of all of
   *  them: how many there are, and the way to remove them. */
  selectedCount: number;
  /** Set when the one selected thing is a VENUE feature rather than something in this document —
   *  the bar, a built stage, the pool. See lib/design-document/features.ts for what an event may say
   *  about one (where it stood it, and nothing else). */
  feature: { id: string; label: string; kind: FeatureKind; rotationDeg: number; moved: boolean } | null;
  onResetFeature: (featureId: string) => void;
  /** The one angle everything selected is facing, or null when they disagree. */
  facing: number | null;
  /** Turn everything selected to this absolute angle, each about its own centre. */
  onFace: (deg: number) => void;
  /** Whether anything in the selection is in a stack that could be moved through. */
  canRestack: boolean;
  onRestack: (to: "front" | "back") => void;
  /** How many TABLES are selected — what the bulk seat control applies to. */
  selectedTables: number;
  onSeatsForSelection: (seats: number) => void;
  /** Set when the selection is EXACTLY one group — its whole membership and nothing else. */
  group: { id: string; number?: number; tables: number; items: number; seats: number; seated: number } | null;
  onGroup: () => void;
  onUngroup: () => void;
  onRenumberGroup: (groupId: string, number: number) => void;
  /** How many chairs go round one table. Seeded from the catalog row, editable per table. */
  onSeats: (id: string, seats: number) => void;
  /** How many of those chairs are spoken for. */
  onSeated: (id: string, seated: number) => void;
  /** The same, for a whole block — one number for the lot, spread back over its tables. */
  onGroupSeated: (groupId: string, seated: number) => void;
  doc: DesignDocumentContent;
  /** The venue's walls — a drape's length is a fact about the wall it hangs on, not about itself. */
  structure: VenueStructure;
  onClose: () => void;
  onQuantity: (id: string, delta: number) => void;
  onDelete: () => void;
  onSmartApply: () => void;
  onApplyToAllTables: (placementId: string) => void;
  onVariant: (id: string, variantId: string) => void;
  onSpan: (id: string, span: WallSpan) => void;
  onResize: (id: string, sizeMm: { widthMm: number; depthMm: number }) => void;
  onRenumber: (id: string, number: number) => void;
  onStyleTable: (id: string, style: ElementStyle | undefined) => void;
  onDuplicateTable: (id: string) => void;
  onRemovePlacement: (id: string) => void;
}) {
  // A GROUP — the designer pushed these together and said they are one thing. For tables that means
  // one number for the lot, so the number field here edits the group and not any table inside it.
  if (group) {
    return (
      <Panel title={group.tables > 0 && group.number ? `שולחן ${group.number}` : "קבוצה"} onClose={onClose}>
        <dl className="space-y-1.5 text-sm">
          {group.tables > 0 && <Row label="שולחנות" value={String(group.tables)} />}
          {group.items > 0 && <Row label="פריטים" value={String(group.items)} />}
          {group.seats > 0 && <Row label="כסאות" value={String(group.seats)} />}
        </dl>

        {/* One block, one occupancy. What is typed here is spread back over the tables underneath
            (fill each to its own seat count, in order) so that breaking the block up later leaves
            each table holding a number that is true of it. */}
        {group.seats > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <label htmlFor="group-seated" className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
              <Users className="h-3.5 w-3.5" strokeWidth={2} />
              תפוסה
            </label>
            <div className="flex items-center gap-2">
              <NumberField
                id="group-seated"
                decimals={0}
                min={0}
                value={group.seated}
                onChange={(v) => onGroupSeated(group.id, v)}
                className="w-16"
              />
              <span className={"text-xs " + occupancyInk(group.seated, group.seats)}>מתוך {group.seats}</span>
            </div>
          </div>
        )}

        {group.tables > 0 && (
          <>
            <div className="mt-3 flex items-center justify-between">
              <label htmlFor="group-number" className="text-sm text-ink-soft">מספר שולחן</label>
              <NumberField
                id="group-number"
                decimals={0}
                value={group.number ?? 0}
                onChange={(v) => onRenumberGroup(group.id, v)}
                className="w-16"
              />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              השולחנות נספרים כשולחן אחד, והכסאות מסודרים סביב הבלוק כולו.
            </p>
          </>
        )}

        <FacingField value={facing} onChange={onFace} />

        <div className="mt-4 flex flex-col gap-1.5">
          <Button variant="ghost" onClick={onUngroup} title="פירוק · Ctrl+Shift+G">
            <Ungroup className="h-4 w-4" strokeWidth={2} />
            פירוק הקבוצה
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            הסרת הקבוצה
          </Button>
        </div>
      </Panel>
    );
  }

  if (selectedCount > 1) {
    return (
      <Panel title={`${selectedCount} פריטים נבחרו`} onClose={onClose}>
        <p className="text-sm leading-relaxed text-muted">
          גרירה מזיזה את כולם יחד, והידית שמעליהם מסובבת את כולם סביב המרכז המשותף.
        </p>

        {/* One number of chairs over the whole selection. A room of forty tables going from ten
            places to twelve used to be forty trips through this panel. Occupancy is deliberately
            not here: how many seats a table HAS is the same across a room, how many are taken is a
            different fact per table. */}
        {selectedTables > 1 && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <label htmlFor="bulk-seats" className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
              <Armchair className="h-3.5 w-3.5" strokeWidth={2} />
              כסאות
            </label>
            <div className="flex items-center gap-2">
              {/* Blank rather than 0: this field REPORTS nothing (the selected tables may seat
                  several different numbers) and only WRITES. A resting 0 would read as a claim
                  that they all seat nobody. */}
              <NumberField
                id="bulk-seats"
                decimals={0}
                min={0}
                value={0}
                hideZero
                placeholder="—"
                onChange={(v) => onSeatsForSelection(v)}
                className="w-16"
              />
              <span className="text-xs text-muted">ל־{selectedTables} שולחנות</span>
            </div>
          </div>
        )}

        {/* The same field a single item gets — it just writes to all of them. Each turns about its
            OWN centre here, which is how a scattered handful is squared to the room; the canvas
            handle above them is the other gesture, swinging the lot about one shared pivot. */}
        <FacingField value={facing} onChange={onFace} />

        <StackButtons show={canRestack} onRestack={onRestack} />

        <div className="mt-3 flex flex-col gap-1.5">
          <Button variant="ghost" onClick={onGroup} title="קיבוץ · Ctrl+G">
            <Group className="h-4 w-4" strokeWidth={2} />
            קיבוץ
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            הסרת הנבחרים
          </Button>
        </div>
      </Panel>
    );
  }

  if (!selection) return null;

  // A VENUE FEATURE. Everything this panel offers is a placement of it for tonight and nothing more:
  // no size, no name, no delete. Those are the property's, measured once at /halls, and an event
  // that could edit them would be editing every other event held in the same room.
  if (selection.kind === "feature") {
    if (!feature) return null;
    return (
      <Panel title={feature.label || FEATURE_KIND_LABEL[feature.kind]} onClose={onClose}>
        <dl className="space-y-1.5 text-sm">
          <Row label="סוג" value={FEATURE_KIND_LABEL[feature.kind]} />
          <Row label="שייך ל" value="תוכנית המתחם" />
        </dl>

        <p className="mt-2 text-xs leading-relaxed text-muted">
          פריט של המתחם. אפשר להזיז ולסובב אותו לאירוע הזה — הגודל והמקום הקבוע נקבעים במסך האולמות,
          ואירועים אחרים באותו מתחם לא מושפעים.
        </p>

        <FacingField value={facing} onChange={onFace} />

        <div className="mt-4 flex flex-col gap-1.5">
          <Button variant="ghost" disabled={!feature.moved} onClick={() => onResetFeature(feature.id)}>
            <Undo2 className="h-4 w-4" strokeWidth={2} />
            {feature.moved ? "החזרה למקום בתוכנית" : "נמצא במקומו המקורי"}
          </Button>
          <p className="inline-flex items-start gap-1.5 text-xs leading-relaxed text-muted">
            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            לשינוי הגודל או למחיקה — מסך האולמות.
          </p>
        </div>
      </Panel>
    );
  }

  if (selection.kind === "placement") {
    const p = doc.placements.find((x) => x.id === selection.id);
    if (!p) return null;
    const r = resolve(p.variantId);
    const table = p.tableId ? doc.tables.find((t) => t.id === p.tableId) : undefined;
    const shades = shadesOf(p.variantId);
    const drape = r?.anchor === "wall" ? p.span : undefined;
    const run = drape ? resolveSpan(structure, drape) : null;
    const stretch = r?.sizing === "stretch" && !drape;
    const size = p.sizeMm;

    return (
      <Panel title={r?.product.name ?? "פריט"} onClose={onClose}>
        <dl className="space-y-1.5 text-sm">
          {r?.variant && <Row label="גוון" value={r.variant.name} />}
          <Row label="שכבה" value={LAYER_LABEL[p.layer]} />
          {table && <Row label="שולחן" value={String(table.number)} />}
          {drape && <Row label="אורך על הקיר" value={run ? `${(run.lengthMm / 1000).toFixed(2)} מ׳` : "הקיר נמחק"} />}
        </dl>

        {shades.length > 0 && (
          <ShadeSection value={p.variantId} shades={shades} onChange={(v) => onVariant(p.id, v)} />
        )}

        {/* A drape covers its whole wall by default; this puts it back after it was shortened. */}
        {drape && (
          <Button
            variant="ghost"
            className="mt-3 w-full"
            disabled={!run || (drape.from === 0 && drape.to === 1)}
            onClick={() => onSpan(p.id, { ...drape, ...WHOLE_WALL })}
          >
            <Maximize2 className="h-4 w-4" strokeWidth={2} />
            על כל הקיר
          </Button>
        )}

        {/* A carpet is sized here as well as by its corners — a number is faster when the client
            says "three by two". */}
        {stretch && (
          <div className="mt-3">
            <span className="mb-1.5 block text-xs text-ink-soft">גודל (ס״מ)</span>
            <div className="flex items-center gap-2">
              <NumberField
                aria-label="רוחב"
                decimals={0}
                min={30}
                value={Math.round((size?.widthMm ?? 0) / 10)}
                onChange={(v) => onResize(p.id, { widthMm: v * 10, depthMm: size?.depthMm ?? v * 10 })}
                className="w-20"
              />
              <span className="text-sm text-muted">×</span>
              <NumberField
                aria-label="עומק"
                decimals={0}
                min={30}
                value={Math.round((size?.depthMm ?? 0) / 10)}
                onChange={(v) => onResize(p.id, { widthMm: size?.widthMm ?? v * 10, depthMm: v * 10 })}
                className="w-20"
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-ink-soft">כמות</span>
          <div className="flex items-center gap-2">
            <Stepper aria-label="הפחת" onClick={() => onQuantity(p.id, -1)} disabled={p.quantity <= 1}>
              <Minus className="h-4 w-4" strokeWidth={2} />
            </Stepper>
            <span className="nums w-6 text-center text-sm font-semibold text-ink">{p.quantity}</span>
            <Stepper aria-label="הוסף" onClick={() => onQuantity(p.id, 1)}>
              <Plus className="h-4 w-4" strokeWidth={2} />
            </Stepper>
          </div>
        </div>

        <FacingField value={facing} onChange={onFace} />

        <StackButtons show={canRestack} onRestack={onRestack} />

        <div className="mt-4 flex flex-col gap-1.5">
          {table && (
            <Button variant="ghost" onClick={onSmartApply}>
              <Copy className="h-4 w-4" strokeWidth={2} />
              החל על כל שולחנות {table.type}
            </Button>
          )}
          <Button variant="danger" onClick={onDelete}>
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            הסר פריט
          </Button>
        </div>
      </Panel>
    );
  }

  const t = doc.tables.find((x) => x.id === selection.id);
  if (!t) return null;
  const util = tableUtilization(doc, t);
  const count = doc.placements.filter((p) => p.layer === "table" && p.tableId === t.id).length;
  const overflow = util > 1;
  // The cloth is the table's surface, so it is edited from the table rather than selected as its
  // own object on the plan — there is nothing to click that isn't the table itself.
  const cloth = coverOn(doc, t.id);
  const clothShades = cloth ? shadesOf(cloth.variantId) : [];
  const clothName = cloth ? resolve(cloth.variantId)?.product.name : undefined;

  return (
    <Panel title={t.number > 0 ? `שולחן ${t.number}` : "שולחן ראש"} onClose={onClose}>
      <dl className="space-y-1.5 text-sm">
        <Row label="סוג" value={t.type} />
        <Row label="פריטים" value={String(count)} />
      </dl>

      {/* The chairs on the plan ARE this number — it came from the catalog row when the table was
          dropped, and a head table that seats six rather than the standard twelve says so here. */}
      <div className="mt-3 flex items-center justify-between">
        <label htmlFor="table-seats" className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
          <Armchair className="h-3.5 w-3.5" strokeWidth={2} />
          כסאות
        </label>
        <NumberField
          id="table-seats"
          decimals={0}
          min={0}
          value={t.seats ?? 0}
          onChange={(v) => onSeats(t.id, v)}
          className="w-16"
        />
      </div>

      {/* How many of them are spoken for — the `4/12` the plan draws under the table's number. Only
          offered on a table that has chairs: a cocktail table nobody sits at has no occupancy to
          fill in, and a field reading 0/0 is a question with no answer. */}
      {(t.seats ?? 0) > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <label htmlFor="table-seated" className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
            <Users className="h-3.5 w-3.5" strokeWidth={2} />
            תפוסה
          </label>
          <div className="flex items-center gap-2">
            <NumberField
              id="table-seated"
              decimals={0}
              min={0}
              value={t.seated ?? 0}
              onChange={(v) => onSeated(t.id, v)}
              className="w-16"
            />
            <span className={"text-xs " + occupancyInk(t.seated ?? 0, t.seats ?? 0)}>מתוך {t.seats}</span>
          </div>
        </div>
      )}

      {cloth && (
        <div className="mt-3 rounded-md border border-border-soft bg-inset p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-ink">{clothName ?? "מפה"}</span>
            <IconButton label="הסרת המפה" onClick={() => onRemovePlacement(cloth.id)}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </IconButton>
          </div>
          {clothShades.length > 0 && (
            <SwatchPicker
              options={clothShades}
              value={cloth.variantId}
              onChange={(v) => onVariant(cloth.id, v)}
              label="גוון המפה"
            />
          )}
          <Button variant="ghost" className="mt-2 w-full" onClick={() => onApplyToAllTables(cloth.id)}>
            <Copy className="h-4 w-4" strokeWidth={2} />
            על כל השולחנות
          </Button>
        </div>
      )}

      {/* F-3.3: auto-running numbering, editable per table */}
      <div className="mt-3 flex items-center justify-between">
        <label htmlFor="table-number" className="text-sm text-ink-soft">מספר שולחן</label>
        <NumberField id="table-number" decimals={0} value={t.number} onChange={(v) => onRenumber(t.id, v)} className="w-16" />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1 text-ink-soft">
            <Layers className="h-3.5 w-3.5" strokeWidth={2} />
            ניצול שטח
          </span>
          <span className={"nums font-semibold " + (overflow ? "text-warn-ink" : "text-ink")}>{Math.round(util * 100)}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="ניצול שטח"
          aria-valuenow={Math.round(util * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-border"
        >
          <div
            className={"h-full rounded-full " + (overflow ? "bg-warn" : "bg-accent")}
            style={{ width: `${Math.min(100, Math.round(util * 100))}%` }}
          />
        </div>
        {overflow && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-warn-ink">
            <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
            הפריטים חורגים משטח השולחן
          </p>
        )}
      </div>

      <FacingField value={facing} onChange={onFace} />

      {/* Tables are in the floor stack too — a head table stands on a staging deck, and two pushed
          together overlap. That could not be said at all until the three fixed paint passes became
          one (lib/design-document/stacking.ts). */}
      <StackButtons show={canRestack} onRestack={onRestack} />

      <div className="mt-3">
        <span className="mb-1.5 block text-xs text-ink-soft">מראה</span>
        <div className="flex flex-wrap items-center gap-2">
          <StyleFields style={t.style} onChange={(style) => onStyleTable(t.id, style)} strokeWidthDefault={2.5} />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <Button variant="ghost" onClick={() => onDuplicateTable(t.id)}>
          <Copy className="h-4 w-4" strokeWidth={2} />
          שכפול שולחן
        </Button>
        <Button variant="danger" onClick={onDelete}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          הסר שולחן
        </Button>
      </div>
    </Panel>
  );
}

/** Which way the thing is facing, in degrees, plus the two quarter-turns that are what a designer
 *  actually wants nine times out of ten.
 *
 *  Typed as well as dragged. The canvas handle is faster for "about like that" and this is the only
 *  way to say "exactly 90" or to match one item to another; the same pairing every fixture on the
 *  hall plan already has. On a mixed selection the number reads blank rather than 0 — several items
 *  at several angles have no shared facing, and showing 0 would claim they were all square. Typing
 *  one anyway squares them all to it deliberately, which is the point of the field being there.
 */
function FacingField({ value, onChange }: { value: number | null; onChange: (deg: number) => void }) {
  const turn = (by: number) => onChange((((value ?? 0) + by) % 360 + 360) % 360);
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <label htmlFor="facing" className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
        <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
        סיבוב
      </label>
      <div className="flex items-center gap-1.5">
        <Stepper aria-label="רבע סיבוב שמאלה" onClick={() => turn(-90)}>
          <RotateCw className="h-3.5 w-3.5 -scale-x-100" strokeWidth={2} />
        </Stepper>
        <NumberField
          id="facing"
          decimals={0}
          value={value ?? 0}
          // Blank when they disagree, "0" when they genuinely all face front — hideZero is switched
          // on for exactly the first case, so the two are never confused for each other.
          hideZero={value === null}
          placeholder={value === null ? "—" : undefined}
          onChange={onChange}
          className="w-14"
          aria-label="זווית במעלות"
        />
        <span className="text-xs text-muted">°</span>
        <Stepper aria-label="רבע סיבוב ימינה" onClick={() => turn(90)}>
          <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
        </Stepper>
      </div>
    </div>
  );
}

/** Bring to front / send to back. Only ever reorders an item against the OTHERS OF ITS OWN KIND —
 *  a carpet cannot be brought in front of a table, because a carpet is the floor. See the sort in
 *  canvas-stage and the note on Placement.order. */
function StackButtons({ show, onRestack }: { show: boolean; onRestack: (to: "front" | "back") => void }) {
  if (!show) return null;
  return (
    <div className="mt-3">
      <span className="mb-1.5 block text-xs text-ink-soft">סדר בערימה</span>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" className="flex-1" onClick={() => onRestack("front")}>
          <BringToFront className="h-4 w-4" strokeWidth={2} />
          לחזית
        </Button>
        <Button variant="ghost" className="flex-1" onClick={() => onRestack("back")}>
          <SendToBack className="h-4 w-4" strokeWidth={2} />
          לאחור
        </Button>
      </div>
    </div>
  );
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="w-64 rounded-lg border border-border bg-surface p-4 shadow-floating">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
        <IconButton label="סגור" onClick={onClose}>
          <X className="h-4 w-4" strokeWidth={2} />
        </IconButton>
      </div>
      {children}
    </div>
  );
}

/** The shades this product comes in, as swatches. The chosen one's NAME is spelled out under them:
 *  colour never carries the meaning alone, and two of a designer's creams look identical at 18px. */
function ShadeSection({
  shades,
  value,
  onChange,
}: {
  shades: { id: string; name: string; swatch?: string }[];
  value: string;
  onChange: (variantId: string) => void;
}) {
  return (
    <div className="mt-3">
      <span className="mb-1.5 block text-xs text-ink-soft">גוון</span>
      <SwatchPicker options={shades} value={value} onChange={onChange} label="גוון הפריט" />
      <p className="mt-1.5 text-xs text-muted">{shades.find((s) => s.id === value)?.name ?? "ברירת מחדל"}</p>
    </div>
  );
}

/** The two occupancy states worth a colour: full, and over. Everything between stays quiet — a
 *  table that is half laid is not news, and a panel where every number is coloured says nothing.
 *  Matches what the plan itself draws (CapacityLabel in canvas-stage). */
function occupancyInk(seated: number, seats: number): string {
  if (seated > seats) return "text-alert-ink font-semibold";
  if (seated === seats) return "text-success-ink font-semibold";
  return "text-muted";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function Stepper({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-md border border-border p-1 text-ink-soft transition-colors hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
