"use client";

import { useState, type ReactNode } from "react";
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
  Orbit,
  Ungroup,
  Armchair,
  Users,
  RotateCw,
  RotateCcw,
  BringToFront,
  SendToBack,
  Undo2,
  Building2,
  ListChecks,
  MapPin,
  AlignHorizontalDistributeCenter,
  ArrowDownFromLine,
  Boxes,
  Hash,
  Info,
  Palette,
  Ruler,
  Sparkles,
  Table as TableIcon,
  type LucideIcon,
} from "lucide-react";
import type { DesignDocumentContent, WallSpan, RigHang } from "@/lib/design-document/types";
import type { ElementStyle } from "@/lib/element-style";
import type { FeatureKind, VenueStructure } from "@/lib/venues/structure";
import { FEATURE_KIND_LABEL } from "@/lib/venues/structure";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { StyleFields } from "@/components/style-fields";
import { Swatch, SwatchPicker } from "@/components/swatch-field";
import { Segmented } from "@/components/segmented";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, type MenuItem } from "@/components/menu";
import { Popover } from "@/components/popover";
import { InspectorDivider, InspectorHeader } from "@/components/plan-canvas";
import { LAYER_LABEL } from "@/lib/catalog/categories";
import { coverOn, resolve, shadesOf, tableUtilization } from "@/lib/studio/catalog-resolver";
import { resolveSpan, WHOLE_WALL } from "@/lib/studio/anchor";
import type { Selection, SpinMode } from "./canvas-stage";

// The studio's object inspector: ONE BAR along the bottom of the canvas, not a panel down its side.
//
// It was a stacked panel, and the panel lost. Everything a selection can be asked was a section in
// one column — numbers, a cloth, occupancy, stacking order, selection commands, four style controls
// — so a dressed table ran taller than the screen it floats over, its own title bar scrolled off the
// top, and the fields inside were wider than the 256px column they sat in (which is where the
// sideways scrollbar came from). Twelve controls that are always visible are not more available than
// twelve controls one press away; they are just further apart, and each of them costs the plan
// underneath a strip of room.
//
// So: the bar states WHAT is selected, keeps the two or three numbers worth reading at a glance in
// its own row, and folds everything else behind one button per SUBJECT — ישיבה, מראה, סיבוב, סדר
// בערימה, בחירה. Fields go behind a Popover, lists of verbs behind a Menu, and both are the app's
// shared ones (components/popover.tsx, components/menu.tsx) rather than a third panel written here.
// It is TWO ROWS in one card: what is selected, and then what can be done to it. One row for both
// was the first attempt at this and it was still too much — at eight subjects the thing's own name
// was just another chip in a queue of chips, and the row broke wherever it happened to run out of
// width, which put the close button alone on a second line. Two rows make that break deliberate.
// Same card as the venue plan's inspector (radius, hairline, surface, shadow) and the same
// InspectorHeader inside it, so the two floating inspectors over this app's two canvases still read
// as one thing.
export function Inspector({
  selection,
  selectedCount,
  feature,
  onResetFeature,
  facing,
  onFace,
  spin,
  onSpin,
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
  onHang,
  onResize,
  onRenumber,
  onStyleTable,
  onDuplicate,
  onRemovePlacement,
  zoneFocused,
  onSelectInZone,
  layerActive,
  onSelectLayer,
  onSelectSimilar,
  canDistribute,
  onDistribute,
  dressCandidateCount,
  onCopyDressing,
}: {
  /** The one thing being edited — null when nothing, or several things, are selected. */
  selection: Selection;
  /** How many things are selected in total. A group has no fields to show (a quantity stepper over
   *  six different products means nothing), so it gets the one bar that is still true of all of
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
  /** What the canvas's rotate handle does with a selection of several: swing the lot about the one
   *  centre they share, or turn each of them where it stands. */
  spin: SpinMode;
  onSpin: (mode: SpinMode) => void;
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
  /** Hang a ceiling item on a rod, move it along the one it is on, or take it off (`null`). */
  onHang: (id: string, hang: RigHang | null) => void;
  onResize: (id: string, sizeMm: { widthMm: number; depthMm: number }) => void;
  onRenumber: (id: string, number: number) => void;
  onStyleTable: (id: string, style: ElementStyle | undefined) => void;
  /** Copy + paste in one press — offered by every bar, because "another one of these" is the same
   *  wish whatever is selected. */
  onDuplicate: () => void;
  onRemovePlacement: (id: string) => void;
  // --- selection commands ---------------------------------------------------------------------
  // Bulk is a selection problem: these three build the list, and every operation above already
  // knows how to run over one — see the note beside selectSimilar/selectInZone/selectLayer in
  // studio-screen.tsx.
  /** Whether the toolbar's zone eye is currently focused on one — "בחר הכל באזור" has nothing to
   *  select against otherwise. */
  zoneFocused: boolean;
  onSelectInZone: () => void;
  /** Whether a layer is being worked IN, as opposed to merely visible — see `activeLayer` on the
   *  screen. "בחר שכבה" only means something once one is named. */
  layerActive: boolean;
  onSelectLayer: () => void;
  onSelectSimilar: () => void;
  /** Whether 3+ of the selected items each have a free position a shared delta could move — false
   *  the moment the selection holds a cloth (worn on a table), a drape (a wall span) or a hung
   *  ceiling item (its position is owned by the rod). Mirrors studio-screen.tsx's own gate on
   *  distributeEvenly, so the command never offers to do less than it says. */
  canDistribute: boolean;
  onDistribute: () => void;
  /** How many of the currently selected tables a copied table's dressing would actually land on
   *  (the source table itself, if it happens to be among them, is excluded) — 0 hides the control
   *  and is also the reducer's own no-op case, so this only ever offers something that does
   *  something. */
  dressCandidateCount: number;
  onCopyDressing: (mode: "add" | "replace") => void;
}) {
  // Local to the one bar that offers it — a copy of another table's dressing has exactly one entry
  // point on this screen, so there is no second dialog to keep in sync (contrast the catalog's
  // delete, which the card menu AND the edit drawer can both open).
  const [dressMode, setDressMode] = useState<"add" | "replace">("add");
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  const selectItems = selectionItems({ zoneFocused, onSelectInZone, layerActive, onSelectLayer, onSelectSimilar });

  // A GROUP — the designer pushed these together and said they are one thing. For tables that means
  // one number for the lot, so the number field here edits the group and not any table inside it.
  if (group) {
    return (
      <Bar
        icon={Group}
        title={group.tables > 0 && group.number ? `שולחן ${group.number}` : "קבוצה"}
        facts={countLine([
          [group.tables, "שולחן אחד", "שולחנות"],
          [group.items, "פריט אחד", "פריטים"],
          [group.seats, "כסא אחד", "כסאות"],
        ])}
        onClose={onClose}
      >
        {/* One block, one occupancy. What is typed here is spread back over the tables underneath
            (fill each to its own seat count, in order) so that breaking the block up later leaves
            each table holding a number that is true of it. */}
        {group.seats > 0 && (
          <Popover label="תפוסה" icon={Users} value={ltr(`${group.seated}/${group.seats}`)}>
            <PanelRow>
              <NumberField
                id="group-seated"
                aria-label="תפוסה"
                decimals={0}
                min={0}
                value={group.seated}
                onChange={(v) => onGroupSeated(group.id, v)}
                className="w-20"
              />
              <span className={"text-xs " + occupancyInk(group.seated, group.seats)}>מתוך {group.seats}</span>
            </PanelRow>
            <Note>המספר מתחלק בין השולחנות שבבלוק, כל אחד עד מלוא הכסאות שלו.</Note>
          </Popover>
        )}

        {group.tables > 0 && (
          <Popover label="מספר שולחן" icon={Hash} value={ltr(`#${group.number ?? 0}`)}>
            <PanelRow>
              <NumberField
                id="group-number"
                aria-label="מספר שולחן"
                decimals={0}
                value={group.number ?? 0}
                onChange={(v) => onRenumberGroup(group.id, v)}
                className="w-20"
              />
            </PanelRow>
            <Note>השולחנות נספרים כשולחן אחד, והכסאות מסודרים סביב הבלוק כולו.</Note>
          </Popover>
        )}

        <Rotation value={facing} onChange={onFace} />

        <Menu
          label="עוד פעולות לקבוצה"
          side="top"
          items={[{ label: "פירוק הקבוצה", icon: Ungroup, onSelect: onUngroup }]}
        />
        <Actions
          onDuplicate={onDuplicate}
          duplicateLabel="שכפול הקבוצה"
          onDelete={onDelete}
          deleteLabel="מחיקה של הקבוצה"
        />
      </Bar>
    );
  }

  if (selectedCount > 1) {
    const more: MenuItem[] = [
      // Equal air between things along whichever axis the selection spans more — the two ends stay
      // put. Left out entirely, not disabled, once the selection holds anything without a free
      // position to move (see canDistribute).
      ...(canDistribute
        ? [{ label: "פיזור אחיד", icon: AlignHorizontalDistributeCenter, onSelect: onDistribute }]
        : []),
      { label: "קיבוץ · Ctrl+G", icon: Group, onSelect: onGroup },
    ];
    return (
      <Bar icon={Boxes} title={`${selectedCount} פריטים נבחרו`} facts="גרירה מזיזה את כולם יחד" onClose={onClose}>
        {/* One number of chairs over the whole selection. A room of forty tables going from ten
            places to twelve used to be forty trips through this inspector. Occupancy is deliberately
            not here: how many seats a table HAS is the same across a room, how many are taken is a
            different fact per table. */}
        {selectedTables > 1 && (
          <Popover label="כסאות לכל השולחנות שנבחרו" icon={Armchair} value={`${selectedTables} שולחנות`}>
            <PanelRow>
              {/* Blank rather than 0: this field REPORTS nothing (the selected tables may seat
                  several different numbers) and only WRITES. A resting 0 would read as a claim that
                  they all seat nobody. */}
              <NumberField
                id="bulk-seats"
                aria-label="כסאות לכל שולחן"
                decimals={0}
                min={0}
                value={0}
                hideZero
                placeholder="—"
                onChange={(v) => onSeatsForSelection(v)}
                className="w-20"
              />
              <span className="text-xs text-muted">כסאות ל־{selectedTables} שולחנות</span>
            </PanelRow>
          </Popover>
        )}

        {/* Each turns about its OWN centre here, which is how a scattered handful is squared to the
            room. */}
        <Rotation value={facing} onChange={onFace} />

        {/* …and this is what the HANDLE does, which is the other gesture entirely and until now had
            only one answer. Swinging the lot about one shared centre is right for a block being
            aimed at the room — it is one object and it turns like one. It is wrong, and wrong in a
            way that ruins a plan, for twelve tables scattered across a hall: they all orbit the
            middle of the room and every one of them ends up somewhere else. "כל אחד סביב עצמו"
            leaves every item exactly where it stands and turns it on the spot. */}
        <Popover
          label="מה הידית מסובבת"
          icon={Orbit}
          value={spin === "each" ? "כל אחד סביב עצמו" : "סביב מרכז משותף"}
        >
          <Segmented
            label="הידית שמעל הבחירה"
            value={spin}
            options={[
              ["together", "סביב מרכז משותף"],
              ["each", "כל אחד סביב עצמו"],
            ] as const}
            onChange={onSpin}
          />
        </Popover>

        <StackMenu show={canRestack} onRestack={onRestack} />
        <SelectionMenu items={selectItems} />

        {/* One table's whole dressing, worn onto the rest of this selection — the bulk form of
            "החל על כל שולחנות X", for whatever tables happen to be selected rather than a whole
            type. Offered only once there is somewhere for it to land. */}
        {dressCandidateCount > 0 && (
          <Popover label="עיצוב השולחן שהועתק" icon={Sparkles} value={`${dressCandidateCount} שולחנות`}>
            <Segmented
              label="אופן ההחלה"
              value={dressMode}
              options={[
                ["add", "הוספה"],
                ["replace", "החלפה"],
              ] as const}
              onChange={setDressMode}
            />
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => (dressMode === "replace" ? setConfirmingReplace(true) : onCopyDressing("add"))}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
              החל על הנבחרים
            </Button>
          </Popover>
        )}

        <Menu label="עוד פעולות לנבחרים" side="top" items={more} />
        <Actions
          onDuplicate={onDuplicate}
          duplicateLabel="שכפול הנבחרים"
          onDelete={onDelete}
          deleteLabel="מחיקה של הנבחרים"
        />

        <ConfirmDialog
          open={confirmingReplace}
          title={`להחליף את העיצוב של ${dressCandidateCount} שולחנות?`}
          body="המפה והפריטים הקיימים על השולחנות שנבחרו יוסרו ויוחלפו בעיצוב שהועתק."
          confirmLabel="החלפה"
          onConfirm={() => {
            setConfirmingReplace(false);
            onCopyDressing("replace");
          }}
          onClose={() => setConfirmingReplace(false)}
        />
      </Bar>
    );
  }

  // Nothing is selected, but there is still something to select FROM — the toolbar's zone eye or
  // its active layer. Without this the commands would be reachable only after something was already
  // picked, which defeats the one that is meant to start a selection from a bare canvas.
  if (selectedCount === 0 && (zoneFocused || layerActive)) {
    return (
      <Bar icon={ListChecks} title="בחירה">
        <Menu label="דרכים לבחור" side="top" items={selectItems} />
      </Bar>
    );
  }

  if (!selection) return null;

  // A VENUE FEATURE. Everything this bar offers is a placement of it for tonight and nothing more:
  // no size, no name, no delete. Those are the property's, measured once at /halls, and an event
  // that could edit them would be editing every other event held in the same room.
  if (selection.kind === "feature") {
    if (!feature) return null;
    return (
      <Bar
        icon={Building2}
        title={feature.label || FEATURE_KIND_LABEL[feature.kind]}
        facts={`${FEATURE_KIND_LABEL[feature.kind]} · תוכנית המתחם`}
        onClose={onClose}
      >
        <Rotation value={facing} onChange={onFace} />

        <BarButton
          icon={Undo2}
          label={feature.moved ? "החזרה למקום בתוכנית" : "נמצא במקומו המקורי"}
          disabled={!feature.moved}
          onClick={() => onResetFeature(feature.id)}
        />
        <Popover label="פריט של המתחם" icon={Info}>
          <Note>
            אפשר להזיז ולסובב אותו לאירוע הזה בלבד. הגודל והמקום הקבוע נקבעים במסך האולמות — וגם
            שינוי גודל או מחיקה — ואירועים אחרים באותו מתחם לא מושפעים.
          </Note>
        </Popover>
      </Bar>
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
    // A rod deleted at the venue leaves `p.hang` pointing at nothing — same contract as a drape's
    // dangling wallId — so this is undefined both when the item was never hung and when its rod is
    // gone, and either way the bar answers the question the designer is asking: is there anything up
    // there right now.
    const hung = p.layer === "ceiling" ? (structure.rigs ?? []).find((rig) => rig.id === p.hang?.rigId) : undefined;
    const shade = shades.find((s) => s.id === p.variantId);

    return (
      <Bar
        icon={Sparkles}
        title={r?.product.name ?? "פריט"}
        facts={[
          LAYER_LABEL[p.layer],
          table ? `שולחן ${table.number}` : null,
          drape ? (run ? `${(run.lengthMm / 1000).toFixed(2)} מ׳ על הקיר` : "הקיר נמחק") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        onClose={onClose}
      >
        {/* Inline, not behind a subject: how many of a thing there are is the one field on this bar
            that gets edited over and over while placing. */}
        <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="כמות">
          <BarButton icon={Minus} label="פריט אחד פחות" onClick={() => onQuantity(p.id, -1)} disabled={p.quantity <= 1} />
          <span className="nums w-5 text-center text-sm font-semibold text-ink">{p.quantity}</span>
          <BarButton icon={Plus} label="פריט אחד נוסף" onClick={() => onQuantity(p.id, 1)} />
        </div>

        {shades.length > 0 && (
          <Popover label="גוון" leading={<Swatch color={shade?.swatch} size={14} />} value={shade?.name ?? "ברירת מחדל"}>
            {/* Colour never carries the meaning alone: the chosen shade's NAME is spelled out under
                the swatches, because two of a designer's creams look identical at 18px. */}
            <SwatchPicker options={shades} value={p.variantId} onChange={(v) => onVariant(p.id, v)} label="גוון הפריט" />
            <p className="mt-2 text-xs text-muted">{shade?.name ?? "ברירת מחדל"}</p>
          </Popover>
        )}

        {/* A carpet is sized here as well as by its corners — a number is faster when the client
            says "three by two". */}
        {stretch && (
          <Popover
            label="גודל (ס״מ)"
            icon={Ruler}
            value={ltr(`${Math.round((size?.widthMm ?? 0) / 10)}×${Math.round((size?.depthMm ?? 0) / 10)}`)}
          >
            <PanelRow>
              <NumberField
                aria-label="רוחב"
                decimals={0}
                min={30}
                value={Math.round((size?.widthMm ?? 0) / 10)}
                onChange={(v) => onResize(p.id, { widthMm: v * 10, depthMm: size?.depthMm ?? v * 10 })}
                className="w-20"
              />
              <span className="text-xs text-muted">×</span>
              <NumberField
                aria-label="עומק"
                decimals={0}
                min={30}
                value={Math.round((size?.depthMm ?? 0) / 10)}
                onChange={(v) => onResize(p.id, { widthMm: size?.widthMm ?? v * 10, depthMm: v * 10 })}
                className="w-20"
              />
            </PanelRow>
          </Popover>
        )}

        {/* A drape covers its whole wall by default; this puts it back after it was shortened. */}
        {drape && (
          <Popover label="על הקיר" icon={Maximize2} value={run ? `${(run.lengthMm / 1000).toFixed(2)} מ׳` : "—"}>
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              disabled={!run || (drape.from === 0 && drape.to === 1)}
              onClick={() => onSpan(p.id, { ...drape, ...WHOLE_WALL })}
            >
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
              על כל הקיר
            </Button>
            <Note>לקיצור — הידיות שעל הקיר עצמו.</Note>
          </Popover>
        )}

        {/* The one question asked while placing a chandelier: is there anything up there to hang it
            from. Answered where the item is, rather than by hunting the rigging plan for it — and
            the chip carries the warning ink, so an item hanging from nothing says so unopened. */}
        {p.layer === "ceiling" && (
          <Popover
            label="תלייה"
            icon={hung ? ArrowDownFromLine : TriangleAlert}
            tone={hung ? "default" : "warn"}
            value={hung ? hung.label : "אין מוט"}
          >
            {hung && p.hang ? (
              <>
                <p className="mb-2 text-xs text-muted">
                  תלוי על <span className="font-medium text-ink">{hung.label}</span> · גובה{" "}
                  {(hung.heightMm / 1000).toFixed(2)}מ׳
                </p>
                <PanelRow label="שלשול (ס״מ)" htmlFor="hang-drop">
                  <NumberField
                    id="hang-drop"
                    decimals={0}
                    min={0}
                    value={Math.round((p.hang.dropMm ?? 0) / 10)}
                    onChange={(v) => onHang(p.id, { ...p.hang!, dropMm: v * 10 })}
                    className="w-20"
                  />
                </PanelRow>
              </>
            ) : (
              <Note>אין מוט תלייה במקום הזה. גרירת הפריט אל מוט תולה אותו עליו.</Note>
            )}
          </Popover>
        )}

        <Rotation value={facing} onChange={onFace} />
        <StackMenu show={canRestack} onRestack={onRestack} />
        <SelectionMenu items={selectItems} />

        {table && (
          <Menu
            label="עוד פעולות לפריט"
            side="top"
            items={[{ label: `החל על כל שולחנות ${table.type}`, icon: Copy, onSelect: onSmartApply }]}
          />
        )}
        <Actions
          onDuplicate={onDuplicate}
          duplicateLabel="שכפול הפריט"
          onDelete={onDelete}
          deleteLabel="מחיקה של הפריט"
        />
      </Bar>
    );
  }

  const t = doc.tables.find((x) => x.id === selection.id);
  if (!t) return null;
  const util = tableUtilization(doc, t);
  const pct = Math.round(util * 100);
  const count = doc.placements.filter((p) => p.layer === "table" && p.tableId === t.id).length;
  const overflow = util > 1;
  // The cloth is the table's surface, so it is edited from the table rather than selected as its own
  // object on the plan — there is nothing to click that isn't the table itself.
  const cloth = coverOn(doc, t.id);
  const clothShades = cloth ? shadesOf(cloth.variantId) : [];
  const clothShade = cloth ? clothShades.find((s) => s.id === cloth.variantId) : undefined;
  const clothName = cloth ? resolve(cloth.variantId)?.product.name : undefined;
  const seats = t.seats ?? 0;

  return (
    <Bar
      icon={TableIcon}
      title={t.number > 0 ? `שולחן ${t.number}` : "שולחן ראש"}
      facts={[t.type, `${count} פריטים`].join(" · ")}
      onClose={onClose}
    >
      {/* F-3.3: auto-running numbering, editable per table */}
      <Popover label="מספר שולחן" icon={Hash} value={ltr(`#${t.number}`)}>
        <PanelRow>
          <NumberField
            id="table-number"
            aria-label="מספר שולחן"
            decimals={0}
            value={t.number}
            onChange={(v) => onRenumber(t.id, v)}
            className="w-20"
          />
        </PanelRow>
        <Note>המספור רץ מאליו; מה שנקבע כאן גובר עליו, לשולחן הזה בלבד.</Note>
      </Popover>

      {/* The chairs on the plan ARE this number — it came from the catalog row when the table was
          dropped, and a head table that seats six rather than the standard twelve says so here.
          Occupancy joins it because they are the same subject; it appears only once there are chairs,
          since a field reading 0/0 on a cocktail table nobody sits at is a question with no answer. */}
      <Popover label="ישיבה" icon={Armchair} value={seats > 0 ? ltr(`${t.seated ?? 0}/${seats}`) : "—"}>
        <PanelRow label="כסאות" htmlFor="table-seats">
          <NumberField
            id="table-seats"
            decimals={0}
            min={0}
            value={seats}
            onChange={(v) => onSeats(t.id, v)}
            className="w-20"
          />
        </PanelRow>
        {seats > 0 && (
          <PanelRow label="תפוסה" htmlFor="table-seated">
            <NumberField
              id="table-seated"
              decimals={0}
              min={0}
              value={t.seated ?? 0}
              onChange={(v) => onSeated(t.id, v)}
              className="w-20"
            />
            <span className={"text-xs " + occupancyInk(t.seated ?? 0, seats)}>מתוך {seats}</span>
          </PanelRow>
        )}
      </Popover>

      {/* How full the top is, and what is standing on it — one subject, because the count is what the
          bar is measuring. */}
      <Popover label="ניצול שטח" icon={Boxes} tone={overflow ? "warn" : "default"} value={ltr(`${pct}%`)}>
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">{count} פריטים על השולחן</span>
          <span className={"nums font-semibold " + (overflow ? "text-warn-ink" : "text-ink")}>{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="ניצול שטח"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-border"
        >
          <div
            className={"h-full rounded-full " + (overflow ? "bg-warn" : "bg-accent")}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        {overflow && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-warn-ink">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            הפריטים חורגים משטח השולחן
          </p>
        )}
      </Popover>

      {cloth && (
        <Popover label="מפה" leading={<Swatch color={clothShade?.swatch} size={14} />} value={clothName ?? "מפה"}>
          {clothShades.length > 0 && (
            <SwatchPicker
              options={clothShades}
              value={cloth.variantId}
              onChange={(v) => onVariant(cloth.id, v)}
              label="גוון המפה"
            />
          )}
          <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => onApplyToAllTables(cloth.id)}>
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
            על כל השולחנות
          </Button>
          <Button size="sm" variant="danger" className="mt-1 w-full" onClick={() => onRemovePlacement(cloth.id)}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            הסרת המפה
          </Button>
        </Popover>
      )}

      <Rotation value={facing} onChange={onFace} />

      <Popover label="מראה" icon={Palette} panelClassName="w-72">
        <StyleFields style={t.style} onChange={(style) => onStyleTable(t.id, style)} strokeWidthDefault={2.5} />
      </Popover>

      {/* Tables are in the floor stack too — a head table stands on a staging deck, and two pushed
          together overlap. That could not be said at all until the three fixed paint passes became
          one (lib/design-document/stacking.ts). */}
      <StackMenu show={canRestack} onRestack={onRestack} />
      <SelectionMenu items={selectItems} />

      <Actions
        onDuplicate={onDuplicate}
        duplicateLabel="שכפול השולחן"
        onDelete={onDelete}
        deleteLabel="מחיקה של השולחן"
      />
    </Bar>
  );
}

/** The card: a title row, then a row of subjects.
 *
 *  The top row is WHAT this is — its name and the facts nobody edits (a layer, a table type, what a
 *  block is made of) — plus the one button that dismisses the whole thing. The bottom row is what
 *  can be done to it. Neither row scrolls: they wrap, which is what keeps this from ever growing a
 *  sideways scrollbar on a narrow canvas.
 *
 *  `w-max` so the card is as wide as its wider row and no wider, `max-w-full` so it still gives way
 *  to a narrow plane instead of running off it. */
function Bar({
  icon,
  title,
  facts,
  onClose,
  children,
}: {
  icon: LucideIcon;
  title: string;
  facts?: string;
  /** Left off the one bar that has nothing to dismiss — the empty-selection one, where closing would
   *  mean deselecting something that isn't selected. */
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex w-max max-w-full flex-col rounded-md border border-border bg-surface shadow-floating">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-2.5 py-1.5">
        <InspectorHeader icon={icon} label={title} />
        {facts && (
          // Truncated rather than wrapped, with the whole of it in the tooltip: this line is context,
          // and context that pushes the controls down a row is no longer context.
          <span className="min-w-0 max-w-64 shrink truncate text-xs text-muted" title={facts}>
            {facts}
          </span>
        )}
        {onClose && (
          <div className="ms-auto ps-2">
            <BarButton icon={X} label="סגור · Esc" onClick={onClose} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">{children}</div>
    </div>
  );
}

/** Which way the thing is facing, in degrees.
 *
 *  Typed as well as dragged. The canvas handle is faster for "about like that"; this is the only way
 *  to say "exactly 90" or to match one item to another. On a mixed selection the chip and the number
 *  read blank rather than 0 — several items at several angles have no shared facing, and showing 0
 *  would claim they were all square. Typing one anyway squares them all to it deliberately, which is
 *  the point of the field being there.
 *
 *  The four quarter-turns are PRESETS rather than a pair of nudge buttons flanking the field: nine
 *  times in ten the wanted angle is one of them, and a row reading "0 90 180 270" says which one is
 *  set now. The two relative turns are still there, either side of the number, for the tenth time. */
function Rotation({ value, onChange }: { value: number | null; onChange: (deg: number) => void }) {
  const turn = (by: number) => onChange(((((value ?? 0) + by) % 360) + 360) % 360);
  return (
    <Popover label="סיבוב" icon={RotateCw} value={value === null ? "—" : ltr(`${value}°`)}>
      <div className="flex items-center justify-between gap-1.5">
        <BarButton icon={RotateCcw} label="רבע סיבוב שמאלה" onClick={() => turn(-90)} />
        <div className="flex items-center gap-1">
          <NumberField
            id="facing"
            decimals={0}
            value={value ?? 0}
            // Blank when they disagree, "0" when they genuinely all face front — hideZero is switched
            // on for exactly the first case, so the two are never confused for each other.
            hideZero={value === null}
            placeholder={value === null ? "—" : undefined}
            onChange={onChange}
            className="w-16"
            aria-label="זווית במעלות"
          />
          <span className="text-xs text-muted">°</span>
        </div>
        <BarButton icon={RotateCw} label="רבע סיבוב ימינה" onClick={() => turn(90)} />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1" role="group" aria-label="זוויות מוכנות">
        {[0, 90, 180, 270].map((deg) => (
          <button
            key={deg}
            type="button"
            aria-pressed={value === deg}
            onClick={() => onChange(deg)}
            className={
              "nums rounded-sm py-1 text-xs font-semibold transition-colors " +
              (value === deg ? "bg-accent text-canvas" : "bg-inset text-ink-soft hover:bg-accent-tint hover:text-accent")
            }
          >
            {ltr(`${deg}°`)}
          </button>
        ))}
      </div>
    </Popover>
  );
}

/** Bring to front / send to back. Only ever reorders an item against the OTHERS OF ITS OWN KIND — a
 *  carpet cannot be brought in front of a table, because a carpet is the floor. See the sort in
 *  canvas-stage and the note on Placement.order. */
function StackMenu({ show, onRestack }: { show: boolean; onRestack: (to: "front" | "back") => void }) {
  if (!show) return null;
  return (
    <Menu
      label="סדר בערימה"
      icon={Layers}
      side="top"
      items={[
        { label: "לחזית", icon: BringToFront, onSelect: () => onRestack("front") },
        { label: "לאחור", icon: SendToBack, onSelect: () => onRestack("back") },
      ]}
    />
  );
}

/** Ways to BUILD a selection, rather than a one-off "apply to…" per operation — every operation this
 *  screen has already takes a list of refs, so growing the list is what makes each of them a bulk
 *  edit for free. `onSelectSimilar` is left out entirely (not merely disabled) where there is
 *  nothing yet to match against, e.g. the empty-selection bar. */
function selectionItems({
  onSelectSimilar,
  zoneFocused,
  onSelectInZone,
  layerActive,
  onSelectLayer,
}: {
  onSelectSimilar?: () => void;
  zoneFocused: boolean;
  onSelectInZone: () => void;
  layerActive: boolean;
  onSelectLayer: () => void;
}): MenuItem[] {
  return [
    ...(onSelectSimilar ? [{ label: "בחר דומים", icon: ListChecks, onSelect: onSelectSimilar }] : []),
    ...(zoneFocused ? [{ label: "בחר הכל באזור", icon: MapPin, onSelect: onSelectInZone }] : []),
    ...(layerActive ? [{ label: "בחר שכבה", icon: Layers, onSelect: onSelectLayer }] : []),
  ];
}

function SelectionMenu({ items }: { items: MenuItem[] }) {
  if (items.length === 0) return null;
  return <Menu label="בחירה" icon={ListChecks} side="top" items={items} />;
}

/** The two verbs every selection has, held at the far end of the subjects row: another one of these,
 *  and remove these. A venue feature has neither — it belongs to the property, not to tonight — so
 *  its bar simply doesn't render this. The hairline is what keeps the destructive one from sitting
 *  flush against the last subject under a moving cursor. */
function Actions({
  onDuplicate,
  duplicateLabel,
  onDelete,
  deleteLabel,
}: {
  onDuplicate: () => void;
  duplicateLabel: string;
  onDelete: () => void;
  deleteLabel: string;
}) {
  return (
    <div className="ms-auto flex items-center gap-1">
      <InspectorDivider />
      <BarButton icon={Copy} label={`${duplicateLabel} · Ctrl+C · Ctrl+V`} onClick={onDuplicate} />
      <BarButton icon={Trash2} label={`${deleteLabel} · Delete`} onClick={onDelete} tone="danger" />
    </div>
  );
}

/** One icon-sized verb. Not IconButton: the danger tone has to change the same hover background
 *  IconButton already sets, and two utilities for one property are settled by their order in the
 *  generated stylesheet rather than by the order they are written in — so the variants are written
 *  out in full here instead of layered on top of each other. */
function BarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "shrink-0 rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35 " +
        (tone === "danger"
          ? "text-muted hover:bg-alert-tint hover:text-alert"
          : "text-muted hover:bg-accent-tint hover:text-accent-hover")
      }
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}

/** One row inside a popover. The label is left out where the panel's own heading already says what
 *  the single field in it is — repeating "סיבוב" under a panel titled "סיבוב" is noise. */
function PanelRow({ label, htmlFor, children }: { label?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2">
      {label &&
        (htmlFor ? (
          <label htmlFor={htmlFor} className="truncate text-sm text-ink-soft">
            {label}
          </label>
        ) : (
          <span className="truncate text-sm text-ink-soft">{label}</span>
        ))}
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** A run that has to read left-to-right inside a right-to-left bar — "#6", "0/8", "42%", "160×90".
 *  Hebrew is the paragraph direction here, and an unmarked "#6" is laid out with the hash to the
 *  right of the digit, which is not what a table number looks like. Only for tokens that are ALL
 *  digits and symbols: a mixed phrase like "2.40 מ׳" already reads correctly and would be reversed
 *  by this. */
function ltr(text: string): ReactNode {
  return <span dir="ltr">{text}</span>;
}

/** A sentence of explanation, at the one size and ink they are all written in. */
function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs leading-relaxed text-muted">{children}</p>;
}

/** "4 שולחנות · 12 פריטים · 40 כסאות" — the parts that are actually there, in Hebrew that reads right
 *  at one as well as at many. An empty count is left out entirely rather than written as 0. */
function countLine(parts: readonly (readonly [number, string, string])[]): string | undefined {
  const said = parts.filter(([n]) => n > 0).map(([n, one, many]) => (n === 1 ? one : `${n} ${many}`));
  return said.length > 0 ? said.join(" · ") : undefined;
}

/** The two occupancy states worth a colour: full, and over. Everything between stays quiet — a table
 *  that is half laid is not news, and a panel where every number is coloured says nothing. Matches
 *  what the plan itself draws (CapacityLabel in canvas-stage). */
function occupancyInk(seated: number, seats: number): string {
  if (seated > seats) return "text-alert-ink font-semibold";
  if (seated === seats) return "text-success-ink font-semibold";
  return "text-muted";
}
