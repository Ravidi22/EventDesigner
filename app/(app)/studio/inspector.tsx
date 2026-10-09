"use client";

import { useState, type ReactNode } from "react";
import {
  Minus,
  Plus,
  Trash2,
  Copy,
  TriangleAlert,
  Layers,
  Maximize2,
  Group,
  Orbit,
  Ungroup,
  Armchair,
  BringToFront,
  SendToBack,
  Undo2,
  Building2,
  ListChecks,
  MapPin,
  AlignHorizontalDistributeCenter,
  Boxes,
  Hash,
  Info,
  Palette,
  Ruler,
  Sparkles,
  Table as TableIcon,
  FlipHorizontal2,
  FlipVertical2,
  Scaling,
  ShieldAlert,
  MoveHorizontal,
  Grid2x2,
  PenLine,
  Blocks,
  Footprints,
  MoveVertical,
  Fence,
  Magnet,
  Combine,
  ArrowRight,
  RectangleHorizontal,
  PanelTop,
  Accessibility,
  Layers2,
  BookmarkPlus,
  Replace,
  Check,
  LayoutGrid,
  PaintRoller,
} from "lucide-react";
import type { MirrorAxis } from "@/lib/design-document/mirror";
import type { Product, ResizeSpec } from "@/lib/catalog/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { formatDimensions } from "@/lib/catalog/format";
import { SearchInput } from "@/components/search-input";
import { ProductImage } from "../catalog/product-image";
import type { DesignDocumentContent, WallSpan } from "@/lib/design-document/types";
import { tableBlockedSides, tableFootprint } from "@/components/footprint-shape";
import { SeatSidesPicker } from "@/components/seat-sides-picker";
import { Actions, Bar, BarButton, Note, PanelRow, Rotation, ltr } from "@/components/inspector-bar";
import type { ElementStyle } from "@/lib/element-style";
import type { FeatureKind, VenueStructure } from "@/lib/venues/structure";
import { FEATURE_KIND_LABEL } from "@/lib/venues/structure";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { StyleFields } from "@/components/style-fields";
import { Swatch, SwatchPicker } from "@/components/swatch-field";
import { Segmented } from "@/components/segmented";
import { Select } from "@/components/select";
import { TextField } from "@/components/text-field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Menu, type MenuItem } from "@/components/menu";
import { Popover } from "@/components/popover";
import { LAYER_LABEL } from "@/lib/catalog/categories";
import { coverOn, resolve, shadesOf, tableUtilization } from "@/lib/studio/catalog-resolver";
import { chairOptions, defaultChair } from "@/lib/catalog/chairs";
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
export type EdgeKindId = "stairs" | "bench" | "barrier" | "backdrop" | "ramp";
export const EDGE_KIND_LABEL: Record<EdgeKindId, string> = {
  stairs: "מדרגות",
  bench: "בנקט",
  barrier: "מחסום",
  backdrop: "קיר רקע",
  ramp: "רמפה",
};
const EDGE_KIND_ICON = { stairs: Footprints, bench: RectangleHorizontal, barrier: Fence, backdrop: PanelTop, ramp: Accessibility };
const EDGE_KINDS: EdgeKindId[] = ["stairs", "bench", "barrier", "backdrop", "ramp"];

/** One stairs / banquette / barrier, as the bar lists and edits it. */
export interface StageEdgeRow {
  id: string;
  kind: EdgeKindId;
  /** Which side: "בחזית", "בצד", "מאחור", "אל המפלס". */
  side: string;
  widthMm: number;
  full: boolean;
  risers: number;
  riserMm: number;
  autoRisers: number;
  manual: boolean;
  depthMm: number;
  heightMm: number;
  seats: number;
  /** A banquette's chair count when the designer set one; else the one-per-60cm default. */
  seatsSet: boolean;
  autoSeats: number;
  /** Design items standing on it (a banquette). */
  dressed: number;
}

/** What the stage bar shows: its size when it is a rectangle, what it is built of, how high it and
 *  its levels stand, its flights, and the skirt and railing its open sides need. */
export interface StagePanel {
  size: { widthMm: number; depthMm: number } | null;
  deckCount: number;
  coverage: number;
  decks: { name: string; count: number }[];
  heightMm: number;
  levels: { id: string; heightMm: number; deckCount: number }[];
  /** Everything finishing the stage's edges — stairs, banquettes, barriers. */
  edges: StageEdgeRow[];
  /** The one being edited, when one is. */
  activeEdge: StageEdgeRow | null;
  /** How much open edge nothing covers — where somebody can walk off. */
  gapsMm: number;
  /** Whether the catalog has a row to count each as on the quote. */
  benchCounted: boolean;
  barrierCounted: boolean;
  /** What covers the deck: the chosen row, and the studio's rows to choose from. */
  surface: string | null;
  surfaceOptions: { value: string; label: string }[];
  areaMm2: number;
  /** Corner pieces filled where two runs meet, and how many there are. */
  corners: boolean;
  cornerCount: number;
  /** Decks may reach past the outline (StageBuild.exceed). */
  exceed: boolean;
  skirtMm: number;
  /** Null = the studio's railing rule is off (settings → במות). */
  railingMm: number | null;
  railingAboveMm: number | null;
  /** Whether the catalog has a row to count stairs and skirt as on the quote. */
  stairsCounted: boolean;
  skirtCounted: boolean;
}

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
  onChairForSelection,
  onChair,
  group,
  onGroup,
  onUngroup,
  onRenumberGroup,
  onSeats,
  onSeated,
  onBlockedSides,
  onGroupSeated,
  onGroupSeats,
  doc,
  structure,
  onClose,
  onQuantity,
  onDelete,
  onDressTable,
  renderPattern,
  renderDesigns,
  onScale,
  onApplyToAllTables,
  onVariant,
  onSpan,
  onResize,
  onRenumber,
  onStyleTable,
  onDuplicate,
  onRemovePlacement,
  zoneFocused,
  onSelectInZone,
  layerActive,
  onSelectLayer,
  scopeLabel,
  onClearScope,
  onSelectSimilar,
  canDistribute,
  onDistribute,
  dressCandidateCount,
  onCopyDressing,
  onMirror,
  breaches,
  sizePanel,
  onSize,
  spacing,
  onSpace,
  stagePanel,
  onEditStage,
  onExplodeStage,
  onStageHeight,
  onStageSize,
  onLevelHeight,
  onRemoveLevel,
  onAddLevel,
  onAddEdge,
  onFillEdges,
  onSelectEdge,
  onRemoveStair,
  onStairChange,
  onStageSurface,
  onStageCorners,
  onStageExceed,
  onSaveTemplate,
  stageGroup,
  onStickStages,
  onMergeStages,
  onMakeStage,
  swap,
  onSwap,
  clothOptions,
  onReplaceCloth,
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
  /** One chair over every selected table; null = the studio's default. */
  onChairForSelection?: (variantId: string | null) => void;
  /** This table's chair; null = the studio's default (DesignTable.chairVariantId). */
  onChair?: (id: string, variantId: string | null) => void;
  /** Set when the selection is EXACTLY one group — its whole membership and nothing else. */
  group: { id: string; number?: number; tables: number; items: number; seats: number; seated: number } | null;
  onGroup: () => void;
  onUngroup: () => void;
  onRenumberGroup: (groupId: string, number: number) => void;
  /** How many chairs go round one table. Seeded from the catalog row, editable per table. */
  onSeats: (id: string, seats: number) => void;
  /** How many of those chairs are spoken for. */
  onSeated: (id: string, seated: number) => void;
  /** The sides of this table nobody sits at; null hands the question back to its catalog row. */
  onBlockedSides: (id: string, sides: number[] | null) => void;
  /** The same, for a whole block — one number for the lot, spread back over its tables. */
  onGroupSeated: (groupId: string, seated: number) => void;
  /** How many chairs go round a whole block — spread evenly back over its tables. */
  onGroupSeats: (groupId: string, seats: number) => void;
  doc: DesignDocumentContent;
  /** The venue's walls — a drape's length is a fact about the wall it hangs on, not about itself. */
  structure: VenueStructure;
  onClose: () => void;
  onQuantity: (id: string, delta: number) => void;
  onDelete: () => void;
  /** Open a table's focus mode — where the items on it are moved about and arranged. */
  onDressTable: (tableId: string) => void;
  /** The "which tables" panel (TablePatternPicker), bound to a source table and — when one item is
   *  being applied rather than the table's whole dressing — that item. */
  renderPattern: (sourceTableId: string, placementId?: string) => ReactNode;
  /** The saved table designs panel (TableDesignsPanel), bound to a table. */
  renderDesigns: (tableId: string) => ReactNode;
  /** How big one placed item is DRAWN (Placement.scale) — not what it costs or how many there are. */
  onScale: (placementId: string, scale: number) => void;
  onApplyToAllTables: (placementId: string) => void;
  onVariant: (id: string, variantId: string) => void;
  onSpan: (id: string, span: WallSpan) => void;
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
  /** What the zone eye and the active layer are pointed at, in words — "אזור: אולם · שכבה: תקרה".
   *  The empty-selection bar exists BECAUSE of them, and has to say so. */
  scopeLabel?: string;
  /** Turn both off — the empty-selection bar's ✕. */
  onClearScope?: () => void;
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
  /** Turn the selection over (lib/design-document/mirror.ts). Absent when nothing selected can be —
   *  a cloth, a drape. */
  onMirror?: (axis: MirrorAxis) => void;
  /** The safety distances the one selected thing is party to, by the other thing's name. */
  breaches: { other: string; distance: number; required: number }[];
  /** Set when the one selected thing may be stretched (Product.resize). */
  sizePanel: SizePanel | null;
  /** A typed size (snapped by the screen), or null for the catalog's. */
  onSize: (size: { widthMm: number; depthMm: number } | null) => void;
  /** The air between the selected things now — null when they cannot all be moved. */
  spacing: Spacing | null;
  onSpace: (gapMm: number, mode: "x" | "y" | "direct") => void;
  /** Set when the one selected thing is a STAGE (Placement.stage): its size and what it is built of. */
  stagePanel: StagePanel | null;
  /** Re-open the area tool on this stage — its outline, its front, its decks. */
  onEditStage: () => void;
  /** Replace the stage with its decks as loose items, grouped. One way: the plan then holds decks. */
  onExplodeStage: () => void;
  onStageHeight: (heightMm: number) => void;
  /** A rectangular stage set to an exact size, its back edge held where it stands. */
  onStageSize: (size: { widthMm: number; depthMm: number }) => void;
  onLevelHeight: (levelId: string, heightMm: number) => void;
  onRemoveLevel: (levelId: string) => void;
  /** Draw a raised level on the stage (the area tool, bounded by the stage). */
  onAddLevel: () => void;
  /** Click a side of the stage to put a flight there. */
  /** Click a side of the stage to put an edge item of this kind there. */
  onAddEdge: (kind: EdgeKindId) => void;
  /** Cover every bare stretch of open edge with this kind. */
  onFillEdges: (kind: EdgeKindId) => void;
  onSelectEdge: (itemId: string | null) => void;
  onRemoveStair: (stairId: string) => void;
  /** An edge item's kind, width, steps (`risers: null` = back to automatic), depth or height. */
  onStairChange: (
    stairId: string,
    patch: { kind?: EdgeKindId; widthMm?: number; risers?: number | null; full?: boolean; depthMm?: number; heightMm?: number; seats?: number | null },
  ) => void;
  onStageSurface: (variantId: string | null) => void;
  onStageCorners: (on: boolean) => void;
  onStageExceed: (on: boolean) => void;
  /** Save the selected stage as a named template. */
  onSaveTemplate: (name: string) => void;
  /** Set when the selection is a group (or a handful) made only of stages — the bar then speaks of
   *  stages, and offers to make them one. */
  stageGroup: { count: number; grouped: boolean } | null;
  /** Set when two or more stages are selected: close the gaps between them / make them one stage. */
  onStickStages?: () => void;
  onMergeStages?: () => void;
  /** Set when the one selected thing is a stage PIECE placed on its own (a "במה 400×300" from the
   *  rail before stages were stages): make it a stage, with stairs, height and levels. */
  onMakeStage?: () => void;
  /** What the selection could be swapped for — the studio's other tables, or (for design items) the
   *  catalog rows that hang, stand or sit the way these do. Null when nothing selected can be. */
  swap: SwapPanel | null;
  /** Swap the selection — or, `all`, every one on the plan that is the same row — for this product. */
  onSwap: (productId: string, all: boolean) => void;
  /** The studio's tablecloths, for swapping the one a table wears for another. */
  clothOptions: { value: string; label: string }[];
  onReplaceCloth: (placementId: string, productId: string) => void;
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
        {/* One block, one chair count and one occupancy. What is typed here is spread back over the
            tables underneath (chairs evenly; occupancy filling each to its own seat count, in order)
            so that breaking the block up later leaves each table holding a number that is true of
            it. Offered whenever the block has tables — a block of tables nobody seats yet is exactly
            the one that needs its chairs typed. */}
        {group.tables > 0 && (
          <Popover label="ישיבה" icon={Armchair} value={group.seats > 0 ? ltr(`${group.seated}/${group.seats}`) : "—"}>
            <PanelRow label="כסאות" htmlFor="group-seats">
              <NumberField
                id="group-seats"
                decimals={0}
                min={0}
                value={group.seats}
                onChange={(v) => onGroupSeats(group.id, v)}
                className="w-20"
              />
            </PanelRow>
            {group.seats > 0 && (
              <PanelRow label="תפוסה" htmlFor="group-seated">
                <NumberField
                  id="group-seated"
                  decimals={0}
                  min={0}
                  value={group.seated}
                  onChange={(v) => onGroupSeated(group.id, v)}
                  className="w-20"
                />
                <span className={"text-xs " + occupancyInk(group.seated, group.seats)}>מתוך {group.seats}</span>
              </PanelRow>
            )}
            <Note>הכסאות מסודרים סביב הבלוק כולו ומתחלקים בין השולחנות שבו; התפוסה ממלאת כל שולחן עד מלוא הכסאות שלו.</Note>
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

        {swap && (
          <SwapPopover swap={swap} onSwap={onSwap} label={swap.kind === "tables" ? "סוג השולחנות בקבוצה" : "החלפת הפריטים בקבוצה"} />
        )}

        <Rotation value={facing} onChange={onFace} />
        <MirrorMenu onMirror={onMirror} />

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

  // SEVERAL STAGES — built by hand from pieces and grouped, or just selected together. They are meant
  // to be one platform, so the bar says so and leads with making them one: only a single stage has
  // stairs on every edge, levels, a surface and one build.
  if (selectedCount > 1 && stageGroup) {
    return (
      <Bar
        icon={Grid2x2}
        title={stageGroup.grouped ? "במה מקובצת" : "במות"}
        facts={`${stageGroup.count} חלקים · איחוד לבמה אחת נותן מדרגות, מפלסים ומשטח`}
        onClose={onClose}
      >
        {onMergeStages && (
          <Button size="sm" onClick={onMergeStages}>
            <Combine className="h-3.5 w-3.5" strokeWidth={2} />
            איחוד לבמה אחת
          </Button>
        )}
        {onStickStages && <BarButton icon={Magnet} label="הצמדה — סגירת הרווחים ויישור" onClick={onStickStages} />}
        <Rotation value={facing} onChange={onFace} />
        <MirrorMenu onMirror={onMirror} />
        {stageGroup.grouped ? (
          <BarButton icon={Ungroup} label="פירוק הקבוצה" onClick={onUngroup} />
        ) : (
          <BarButton icon={Group} label="קיבוץ · Ctrl+G" onClick={onGroup} />
        )}
        <Actions onDuplicate={onDuplicate} duplicateLabel="שכפול הבמות" onDelete={onDelete} deleteLabel="מחיקת הבמות" />
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
            {/* Which chair, over the lot — the head table's armchairs set in one go. Writes only,
                like the count above: the selection may hold several chairs between them. */}
            {onChairForSelection && chairOptions().length > 0 && (
              <PanelRow label="כיסא">
                <Select
                  aria-label="סוג הכיסא לשולחנות שנבחרו"
                  value=""
                  options={[{ value: "", label: "—" }, { value: "__default", label: "ברירת המחדל של הסטודיו" }, ...chairOptions()]}
                  onChange={(v) => v && onChairForSelection(v === "__default" ? null : v)}
                />
              </PanelRow>
            )}
          </Popover>
        )}

        {/* Every selected table (or design item) for another row of the catalog, in one press. */}
        {swap && (
          <SwapPopover swap={swap} onSwap={onSwap} label={swap.kind === "tables" ? "סוג השולחנות שנבחרו" : "החלפת הפריטים שנבחרו"} />
        )}

        {/* "1.5m between them" — typed, rather than nudged until the tape agrees. */}
        {spacing && <SpacingPopover key={spacing.key} spacing={spacing} onSpace={onSpace} />}

        {/* Each turns about its OWN centre here, which is how a scattered handful is squared to the
            room. */}
        {/* Stages pushed together into one platform: the gaps closed and near-lines lined up, or
            merged outright so the skirt and stairs are worked out for the whole — not for the parts,
            which would skirt the seam between them. */}
        {onStickStages && <BarButton icon={Magnet} label="הצמדת הבמות — סגירת הרווחים ויישור" onClick={onStickStages} />}
        {onMergeStages && <BarButton icon={Combine} label="איחוד לבמה אחת" onClick={onMergeStages} />}

        <Rotation value={facing} onChange={onFace} />
        {/* …and turned over together, about the middle of the lot: the left side of a room mirrored
            onto the right. */}
        <MirrorMenu onMirror={onMirror} />

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
  //
  // It stays up for exactly as long as the zone eye or the active layer is on — both are toolbar
  // toggles, so with nothing on the card naming them it read as a panel stuck over the plan with no
  // way out. It says what is holding it open, and its ✕ turns those off.
  if (selectedCount === 0 && (zoneFocused || layerActive)) {
    return (
      <Bar icon={ListChecks} title="בחירה" facts={scopeLabel} onClose={onClearScope}>
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

    // A STAGE. One thing on the plan, and the bar says what it is built of — which is the whole
    // point of it being one thing: the designer works with "the stage", and the decks are the
    // stage's business (lib/design-document/stage.ts).
    if (p.stage && stagePanel) {
      const m = (mm: number) => String(Math.round(mm / 10) / 100);
      const cmOf = (mm: number) => Math.round(mm / 10);
      const sp = stagePanel;
      const it = sp.activeEdge;

      // ONE EDGE ITEM, picked on the plan. Its own bar, the way a table's dressing is edited from the
      // table — and a way back to the stage.
      if (it) {
        return (
          <Bar
            icon={EDGE_KIND_ICON[it.kind]}
            title={EDGE_KIND_LABEL[it.kind]}
            facts={[
              it.side,
              it.full ? "כל הצד" : `${cmOf(it.widthMm)} ס״מ`,
              it.kind === "bench" ? `${it.seats} מקומות ישיבה` : null,
              it.kind === "ramp" ? `אורך ${m(it.depthMm)} מ׳` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            onClose={onClose}
          >
            <BarButton icon={ArrowRight} label="חזרה לבמה" onClick={() => onSelectEdge(null)} />
            <Popover label="סוג" icon={Grid2x2} value={EDGE_KIND_LABEL[it.kind]} panelClassName="w-[22rem]">
              <Segmented
                label="מה עומד בצד הזה"
                value={it.kind}
                options={EDGE_KINDS.map((k) => [k, EDGE_KIND_LABEL[k]] as const)}
                onChange={(kind) => onStairChange(it.id, { kind })}
              />
              <Note>
                {it.kind === "stairs"
                  ? "עלייה לבמה. מספר המדרגות נקבע מהגובה."
                  : it.kind === "bench"
                    ? "ספסל נמוך לאורך הבמה — מקום ישיבה, ומשטח שאפשר לעצב עליו."
                    : it.kind === "barrier"
                      ? "מעקה על שפת הבמה, שלא ייפלו ממנה."
                      : it.kind === "backdrop"
                        ? "קיר על שפת הבמה — קיר פרחים, מסגרת בד. אפשר גם בצד שצמוד לקיר האולם."
                        : "עלייה בשיפוע 1:12 לכיסא גלגלים — האורך נקבע מגובה הבמה."}
              </Note>
            </Popover>
            <Popover label="רוחב" icon={MoveHorizontal} value={it.full ? "כל הצד" : `${cmOf(it.widthMm)} ס״מ`}>
              <Segmented
                label="רוחב"
                value={it.full ? "full" : "set"}
                options={[
                  ["set", "לפי מידה"],
                  ["full", "כל הצד"],
                ] as const}
                onChange={(v) => onStairChange(it.id, { full: v === "full" })}
              />
              {!it.full && (
                <PanelRow label="רוחב (ס״מ)" htmlFor="edge-w">
                  <NumberField
                    id="edge-w"
                    decimals={0}
                    min={30}
                    max={3000}
                    commitOnBlur
                    value={cmOf(it.widthMm)}
                    onChange={(cm) => onStairChange(it.id, { widthMm: cm * 10 })}
                    className="w-20"
                  />
                </PanelRow>
              )}
              <Note>אפשר גם לגרור את הקצוות בתוכנית, ואת הפריט כולו לאורך הצד.</Note>
            </Popover>
            {it.kind === "stairs" && (
              <Popover
                label="מדרגות"
                icon={Footprints}
                tone={it.riserMm > 200 ? "warn" : "default"}
                value={ltr(`${it.risers}×${cmOf(it.riserMm)}`)}
              >
                <PanelRow label="מספר מדרגות" htmlFor="edge-r">
                  {it.manual && it.risers !== it.autoRisers && (
                    <BarButton icon={Undo2} label={`חזרה לאוטומטי (${it.autoRisers})`} onClick={() => onStairChange(it.id, { risers: null })} />
                  )}
                  <NumberField
                    id="edge-r"
                    decimals={0}
                    min={1}
                    max={20}
                    value={it.risers}
                    onChange={(n) => onStairChange(it.id, { risers: n })}
                    className="w-20"
                  />
                </PanelRow>
                {it.riserMm > 200 && <p className="text-xs text-alert-ink">מדרגה של {cmOf(it.riserMm)} ס״מ גבוהה לעלייה — כדאי להוסיף מדרגה.</p>}
              </Popover>
            )}
            {it.kind === "bench" && (
              <Popover label="בנקט" icon={RectangleHorizontal} value={`${it.seats} כיסאות`}>
                <PanelRow label="כיסאות" htmlFor="edge-s">
                  {it.seatsSet && it.seats !== it.autoSeats && (
                    <BarButton icon={Undo2} label={`חזרה לאחד לכל 60 ס״מ (${it.autoSeats})`} onClick={() => onStairChange(it.id, { seats: null })} />
                  )}
                  <NumberField
                    id="edge-s"
                    decimals={0}
                    min={0}
                    max={60}
                    value={it.seats}
                    onChange={(n) => onStairChange(it.id, { seats: n })}
                    className="w-20"
                  />
                </PanelRow>
                <PanelRow label="עומק (ס״מ)" htmlFor="edge-d">
                  <NumberField
                    id="edge-d"
                    decimals={0}
                    min={25}
                    max={150}
                    commitOnBlur
                    value={cmOf(it.depthMm)}
                    onChange={(cm) => onStairChange(it.id, { depthMm: cm * 10 })}
                    className="w-20"
                  />
                </PanelRow>
                <PanelRow label="גובה (ס״מ)" htmlFor="edge-h">
                  <NumberField
                    id="edge-h"
                    decimals={0}
                    min={20}
                    max={100}
                    commitOnBlur
                    value={cmOf(it.heightMm)}
                    onChange={(cm) => onStairChange(it.id, { heightMm: cm * 10 })}
                    className="w-20"
                  />
                </PanelRow>
                <Note>
                  {it.dressed > 0 ? `${it.dressed} פריטי עיצוב על הבנקט. ` : ""}
                  גררו פרחים, נרות ופמוטים מהקטלוג אל הבנקט — הם מתפרסים לאורכו ונספרים ברשימת הציוד.
                </Note>
              </Popover>
            )}
            <BarButton icon={Trash2} label={`מחיקת ה${EDGE_KIND_LABEL[it.kind]}`} tone="danger" onClick={() => onRemoveStair(it.id)} />
          </Bar>
        );
      }

      return (
        <Bar
          icon={Grid2x2}
          title="במה"
          facts={[
            sp.size ? ltr(`${m(sp.size.widthMm)}×${m(sp.size.depthMm)} מ׳`) : null,
            `${cmOf(sp.heightMm)} ס״מ`,
            `${sp.deckCount} פלטות`,
            sp.coverage < 0.995 ? `כיסוי ${Math.floor(sp.coverage * 100)}%` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          onClose={onClose}
        >
          {sp.size && (
            <Popover label="מידות" icon={Ruler} value={ltr(`${m(sp.size.widthMm)}×${m(sp.size.depthMm)} מ׳`)} panelClassName="w-72">
              <PanelRow label="חזית (ס״מ)" htmlFor="stage-w">
                <NumberField
                  id="stage-w"
                  decimals={0}
                  min={10}
                  max={6000}
                  commitOnBlur
                  value={cmOf(sp.size.widthMm)}
                  onChange={(cm) => onStageSize({ widthMm: Math.round(cm * 10), depthMm: sp.size!.depthMm })}
                  className="w-24"
                />
              </PanelRow>
              <PanelRow label="עומק (ס״מ)" htmlFor="stage-d">
                <NumberField
                  id="stage-d"
                  decimals={0}
                  min={10}
                  max={6000}
                  commitOnBlur
                  value={cmOf(sp.size.depthMm)}
                  onChange={(cm) => onStageSize({ widthMm: sp.size!.widthMm, depthMm: Math.round(cm * 10) })}
                  className="w-24"
                />
              </PanelRow>
              <Note>
                {sp.coverage < 0.995
                  ? `הפלטות מכסות ${Math.floor(sp.coverage * 100)}% מהמידה הזו. `
                  : "הפלטות מכסות את המידה הזו בדיוק. "}
                הגב נשאר במקומו והחזית זזה. בגרירה, ידית נמשכת למידות שהפלטות בונות בדיוק (Alt משחרר).
              </Note>
            </Popover>
          )}

          <Popover label="בנויה מ" icon={Blocks} value={`${sp.deckCount} פלטות`} panelClassName="w-72">
            {sp.decks.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {sp.decks.map((d) => (
                  <li key={d.name} className="flex justify-between gap-3">
                    <span className="text-ink">{d.name}</span>
                    <span className="nums font-semibold text-ink">×{d.count}</span>
                  </li>
                ))}
                {sp.skirtMm > 0 && (
                  <li className="flex justify-between gap-3 border-t border-border-soft pt-1">
                    <span className="text-ink">חצאית{sp.skirtCounted ? "" : " (אין בקטלוג)"}</span>
                    <span className="nums font-semibold text-ink">{ltr(`${m(sp.skirtMm)} מ׳`)}</span>
                  </li>
                )}
              </ul>
            ) : (
              <Note>אף פלטה לא נכנסת — אולי הפלטות שנבחרו נמחקו מהקטלוג. ״עריכת הבמה״ תאפשר לבחור אחרות.</Note>
            )}
            {/* Whether a deck may reach past the line where that beats a bare strip — the fill tool's
                own switch, here too, because the decision is as often made looking at the built
                stage as at the drawn area. */}
            <div className="mt-2">
              <Segmented
                label="פלטה שעוברת את הקו"
                value={sp.exceed ? "on" : "off"}
                options={[
                  ["off", "בתוך הקו"],
                  ["on", "מותר לחרוג"],
                ] as const}
                onChange={(v) => onStageExceed(v === "on")}
              />
            </div>
            <Note>
              הבמה מחושבת מהפלטות בכל פעם — הגדלה או שינוי צורה מחשבים אותן מחדש, והצעת המחיר ורשימת
              הציוד סופרות אותן, את המדרגות ואת מטרי החצאית בצדדים הפתוחים.
            </Note>
          </Popover>

          <Popover label="גובה" icon={MoveVertical} value={`${cmOf(sp.heightMm)} ס״מ`} panelClassName="w-80">
            <PanelRow label="הבמה" htmlFor="stage-height">
              <NumberField
                id="stage-height"
                decimals={0}
                min={10}
                max={300}
                value={cmOf(sp.heightMm)}
                onChange={(cm) => onStageHeight(cm * 10)}
                className="w-20"
              />
              <span className="text-xs text-muted">ס״מ</span>
            </PanelRow>
            {sp.levels.map((l, i) => (
              <PanelRow key={l.id} label={`מפלס ${i + 1}`} htmlFor={`level-${l.id}`}>
                <NumberField
                  id={`level-${l.id}`}
                  decimals={0}
                  min={10}
                  max={400}
                  value={cmOf(l.heightMm)}
                  onChange={(cm) => onLevelHeight(l.id, cm * 10)}
                  className="w-20"
                />
                <span className="text-xs text-muted">ס״מ · {l.deckCount} פלטות</span>
                <BarButton icon={Trash2} label={`הסרת מפלס ${i + 1}`} onClick={() => onRemoveLevel(l.id)} />
              </PanelRow>
            ))}
            <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={onAddLevel}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              הוספת מפלס מוגבה
            </Button>
            <Note>מפלס הוא חלק מוגבה של הבמה — פודסט לתופים, עמדת DJ. מסמנים אותו על הבמה, והוא נבנה מאותן פלטות על רגליים ארוכות יותר.</Note>
          </Popover>

          {/* THE EDGES. Every open side is finished with stairs, a banquette or a barrier; this says
              what is on them, what is still bare (and finishes it in one click), and adds one more —
              then each one is edited by clicking it on the plan. */}
          {(() => {
            const total = (k: EdgeKindId) => sp.edges.filter((e) => e.kind === k).reduce((t, e) => t + e.widthMm, 0);
            const seats = sp.edges.filter((e) => e.kind === "bench").reduce((t, e) => t + e.seats, 0);
            const flights = sp.edges.filter((e) => e.kind === "stairs").length;
            const open = sp.gapsMm > 0;
            return (
              <Popover
                label="קצוות"
                icon={Footprints}
                tone={open ? "warn" : "default"}
                value={open ? `${m(sp.gapsMm)} מ׳ פתוחים` : flights > 0 ? `${flights} מדרגות` : "סגור"}
              >
                <ul className="space-y-1 text-sm">
                  {flights > 0 && (
                    <li className="flex justify-between gap-3">
                      <span className="text-ink">מדרגות</span>
                      <span className="nums text-muted">{`${flights} · ${m(total("stairs"))} מ׳`}</span>
                    </li>
                  )}
                  {total("bench") > 0 && (
                    <li className="flex justify-between gap-3">
                      <span className="text-ink">בנקט</span>
                      <span className="nums text-muted">{`${m(total("bench"))} מ׳ · ${seats} מקומות`}</span>
                    </li>
                  )}
                  {total("barrier") > 0 && (
                    <li className="flex justify-between gap-3">
                      <span className="text-ink">מחסום</span>
                      <span className="nums text-muted">{`${m(total("barrier"))} מ׳`}</span>
                    </li>
                  )}
                  {total("backdrop") > 0 && (
                    <li className="flex justify-between gap-3">
                      <span className="text-ink">קיר רקע</span>
                      <span className="nums text-muted">{`${m(total("backdrop"))} מ׳`}</span>
                    </li>
                  )}
                  {sp.edges.some((e) => e.kind === "ramp") && (
                    <li className="flex justify-between gap-3">
                      <span className="text-ink">רמפה</span>
                      <span className="nums text-muted">{sp.edges.filter((e) => e.kind === "ramp").length}</span>
                    </li>
                  )}
                </ul>
                {sp.cornerCount > 0 || !sp.corners ? (
                  <div className="mt-2">
                    <Segmented
                      label="פינות בין שתי ריצות"
                      value={sp.corners ? "on" : "off"}
                      options={[
                        ["on", "פינה מלאה"],
                        ["off", "פתוחה"],
                      ] as const}
                      onChange={(v) => onStageCorners(v === "on")}
                    />
                  </div>
                ) : null}
                {open && (
                  <div className="mt-2 space-y-1.5 border-t border-border-soft pt-2">
                    <p className="text-xs text-alert-ink">{m(sp.gapsMm)} מ׳ של שפה פתוחה — מסומנים באדום בתוכנית.</p>
                    <div className="flex gap-1">
                      {(["stairs", "bench", "barrier"] as const).map((k) => (
                        <Button key={k} size="sm" variant="ghost" className="flex-1" onClick={() => onFillEdges(k)}>
                          {EDGE_KIND_LABEL[k]}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-2 border-t border-border-soft pt-2">
                  <span className="text-xs text-muted">הוספה — ואז לחיצה על צד הבמה</span>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    {EDGE_KINDS.map((k) => (
                      <Button key={k} size="sm" variant="ghost" onClick={() => onAddEdge(k)}>
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        {EDGE_KIND_LABEL[k]}
                      </Button>
                    ))}
                  </div>
                </div>
                <Note>לחיצה על מדרגות, בנקט או מחסום בתוכנית עורכת אותם; גרירה מזיזה לאורך הצד.</Note>
              </Popover>
            );
          })()}

          {sp.railingMm !== null && sp.railingMm > 0 && (
            <Popover label="מעקה" icon={Fence} tone="warn" value={ltr(`${m(sp.railingMm)} מ׳`)} panelClassName="w-72">
              <Note>
                לפי הכלל שנקבע בהגדרות (מעל {cmOf(sp.railingAboveMm ?? 0)} ס״מ), צריך מעקה בצדדים הפתוחים המסומנים
                בקו מנוקד. החזית לא מסומנת לעולם.
              </Note>
            </Popover>
          )}

          <Popover
            label="משטח"
            icon={Layers2}
            value={sp.surface ? (sp.surfaceOptions.find((o) => o.value === sp.surface)?.label ?? "—") : "פלטות חשופות"}
          >
            <Select
              aria-label="מה מכסה את הבמה"
              value={sp.surface ?? ""}
              options={[{ value: "", label: "ללא — פלטות חשופות" }, ...sp.surfaceOptions]}
              onChange={(v) => onStageSurface(v || null)}
            />
            <Note>
              {`שטיח, רחבת ריקודים — מחושב לפי שטח הבמה (${m(sp.areaMm2 / 1000)} מ״ר).`}
              {sp.surfaceOptions.length === 0 ? " אין בקטלוג ״משטחי במה״ — אפשר להוסיף." : ""}
            </Note>
          </Popover>

          <SaveTemplatePopover onSave={onSaveTemplate} />

          <BreachPopover breaches={breaches} />
          <Rotation value={facing} onChange={onFace} />
          <MirrorMenu onMirror={onMirror} />
          <StackMenu show={canRestack} onRestack={onRestack} />
          <BarButton icon={PenLine} label="עריכת הבמה — צורה, חזית ופלטות" onClick={onEditStage} />
          <BarButton icon={Blocks} label="פירוק לפלטות נפרדות" onClick={onExplodeStage} />
          <Actions onDuplicate={onDuplicate} duplicateLabel="שכפול הבמה" onDelete={onDelete} deleteLabel="מחיקה של הבמה" />
        </Bar>
      );
    }

    const r = resolve(p.variantId);
    const table = p.tableId ? doc.tables.find((t) => t.id === p.tableId) : undefined;
    const shades = shadesOf(p.variantId);
    const drape = r?.anchor === "wall" ? p.span : undefined;
    const run = drape ? resolveSpan(structure, drape) : null;
    const stretch = r?.sizing === "stretch" && !drape;
    const size = p.sizeMm;
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

        {swap && <SwapPopover swap={swap} onSwap={onSwap} label="החלפה בפריט אחר" />}

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

        {sizePanel && <SizePopover panel={sizePanel} onSize={onSize} />}
        {/* A row that stretches has its own size field above; everything else of a fixed size can
            still be drawn bigger or smaller on THIS plan — a fuller arrangement on the head table. */}
        {!sizePanel && !stretch && !drape && !p.stage && <ScalePopover scale={p.scale || 1} onScale={(v) => onScale(p.id, v)} />}
        <BreachPopover breaches={breaches} />

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

        <Rotation value={facing} onChange={onFace} />
        {!table && !drape && <MirrorMenu onMirror={onMirror} />}
        <StackMenu show={canRestack} onRestack={onRestack} />
        <SelectionMenu items={selectItems} />

        {/* On a table: put it on others in a pattern, and move it about its own table. */}
        {table && (
          <>
            <Popover label="החלת הפריט על שולחנות" icon={LayoutGrid} value="דפוס" panelClassName="w-72">
              {renderPattern(table.id, p.id)}
            </Popover>
            <BarButton icon={PaintRoller} label="עיצוב השולחן — הזזה וסידור של הפריטים עליו · לחיצה כפולה" onClick={() => onDressTable(table.id)} />
          </>
        )}
        {onMakeStage && <BarButton icon={Grid2x2} label="הפיכה לבמה — מדרגות, גובה ומפלסים" onClick={onMakeStage} />}
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

      {swap?.kind === "tables" && <SwapPopover swap={swap} onSwap={onSwap} label="סוג שולחן" />}

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
        {/* Which chair stands round it. Most rooms are one chair — the default — so the plan only
            names a table's chair where it differs; this is where it is made to differ. */}
        {seats > 0 && onChair && chairOptions().length > 0 && (
          <PanelRow label="כיסא">
            <Select
              aria-label="סוג הכיסא"
              value={t.chairVariantId ?? ""}
              options={[
                { value: "", label: `ברירת מחדל${(() => {
                  const d = defaultChair();
                  const name = d ? chairOptions().find((o) => o.value === d)?.label : undefined;
                  return name ? ` — ${name}` : "";
                })()}` },
                ...chairOptions(),
              ]}
              onChange={(v) => onChair(t.id, v || null)}
            />
          </PanelRow>
        )}
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
        {/* Which sides are laid. The catalog row says what a table of this kind does (a head table
            faces the room); a table pushed against a wall on THIS plan says so here, for itself.
            Drawn turned as it stands, so the side against the wall is the side against the wall. */}
        {seats > 0 && (
          <div className="mt-2">
            <SeatSidesPicker
              footprint={tableFootprint(t)}
              seats={seats}
              blocked={tableBlockedSides(t)}
              rotation={t.rotation}
              mirrored={t.mirrored}
              onToggle={(i) => {
                const now = tableBlockedSides(t);
                onBlockedSides(t.id, now.includes(i) ? now.filter((x) => x !== i) : [...now, i]);
              }}
              className="h-40 w-full rounded-md bg-canvas"
            />
            <Note>
              לחיצה על צד חוסמת אותו לישיבה — הכסאות עוברים לצדדים הפתוחים.
              {t.blockedSides && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => onBlockedSides(t.id, null)}
                    className="font-medium text-accent transition-colors hover:text-accent-hover"
                  >
                    חזרה להגדרת הקטלוג
                  </button>
                </>
              )}
            </Note>
          </div>
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
          {clothOptions.length > 1 && (
            <Select
              aria-label="סוג המפה"
              value={resolve(cloth.variantId)?.product.id ?? ""}
              options={clothOptions}
              onChange={(v) => v && onReplaceCloth(cloth.id, v)}
              className="mb-2 w-full"
            />
          )}
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

      {/* Dressing: the table's focus mode, and its whole dressing onto others in a pattern. */}
      <BarButton icon={PaintRoller} label="עיצוב השולחן — הזזה וסידור של הפריטים עליו · לחיצה כפולה על השולחן" onClick={() => onDressTable(t.id)} />
      <Popover label="עיצובים שמורים" icon={BookmarkPlus} value="עיצובים" panelClassName="w-72">
        {renderDesigns(t.id)}
      </Popover>
      {count > 0 && (
        <Popover label="החלת עיצוב השולחן על שולחנות" icon={LayoutGrid} value="דפוס" panelClassName="w-72">
          {renderPattern(t.id)}
        </Popover>
      )}

      {sizePanel && <SizePopover panel={sizePanel} onSize={onSize} />}
      <BreachPopover breaches={breaches} />

      <Rotation value={facing} onChange={onFace} />
      <MirrorMenu onMirror={onMirror} />

      <Popover label="מראה" icon={Palette} panelClassName="w-72">
        <StyleFields
          style={t.style}
          onChange={(style) => onStyleTable(t.id, style)}
          // At rest the table is drawn at its catalog row's weight (productStyle, components/footprint-shape.tsx),
          // so that is the number to show for it — not the canvas's own 2.5 when the row says otherwise.
          strokeWidthDefault={(t.variantId ? resolve(t.variantId)?.product.appearance?.style?.strokeWidthPx : undefined) ?? 2.5}
        />
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

export interface SizePanel {
  size: { widthMm: number; depthMm: number };
  catalog: { widthMm: number; depthMm: number };
  axes: { width: boolean; depth: boolean; uniform: boolean };
  spec: ResizeSpec;
  /** Whether it has been stretched away from the catalog's size at all. */
  custom: boolean;
}

export interface Spacing {
  /** Which selection this reading is of — the panel keeps what was typed until the selection changes. */
  key: string;
  count: number;
  axis: "x" | "y";
  x: number | null;
  y: number | null;
  /** Edge to edge straight across — a pair only. */
  direct: number | null;
  /** The name of the one that stays put. */
  first: string;
}

/** What a selection could be swapped for, worked out by the screen (which has the catalog). */
export interface SwapPanel {
  kind: "tables" | "items";
  /** How many selected things a swap would change. */
  count: number;
  /** The product they all are, when they are all one — marked in the list, and what "כל הדומים"
   *  matches. Null for a mixed selection. */
  current: string | null;
  /** How many on the whole plan are that product — the selection's own included. */
  similar: number;
  /** The rows to swap to, current included. */
  options: Product[];
}

/** "Change these for that": the catalog's rows of the same kind, each as the rail shows it, and —
 *  when the plan holds more of the same thing than are selected — whether to change all of them. */
function SwapPopover({ swap, onSwap, label }: { swap: SwapPanel; onSwap: (productId: string, all: boolean) => void; label: string }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"selected" | "all">("selected");
  // "All of them" is for the selection it was chosen over. Picking a different thing on the plan with
  // the bar still up must not carry it across — the next swap would reach tables nobody chose.
  const [scopeFor, setScopeFor] = useState(`${swap.kind}:${swap.current}:${swap.count}`);
  const key = `${swap.kind}:${swap.current}:${swap.count}`;
  if (key !== scopeFor) {
    setScopeFor(key);
    setScope("selected");
  }
  const canAll = swap.current !== null && swap.similar > swap.count;
  const all = canAll && scope === "all";
  const current = swap.options.find((p) => p.id === swap.current);
  const q = query.trim();
  const shown = q ? swap.options.filter((p) => p.name.includes(q)) : swap.options;
  // The current row's category first; the rest in the order the catalog has them.
  const categories = [...new Set(shown.map((p) => p.category))].sort((a, b) =>
    a === current?.category ? -1 : b === current?.category ? 1 : 0,
  );
  const [one, many] = swap.kind === "tables" ? ["שולחן", "שולחנות"] : ["פריט", "פריטים"];
  const facts = (p: Product) => {
    const seats = Number(p.categoryFields?.seats);
    return [formatDimensions(p.dimensions), swap.kind === "tables" && seats > 0 ? `${seats} כסאות` : null].filter(Boolean).join(" · ");
  };

  return (
    <Popover label={label} icon={Replace} value={current?.name ?? (swap.count > 1 ? `${swap.count} ${many}` : undefined)} panelClassName="w-80">
      {canAll && (
        <div className="mb-2">
          <Segmented
            label="מה מחליפים"
            value={scope}
            options={[
              ["selected", swap.count === 1 ? `רק ה${one} הזה` : `הנבחרים (${swap.count})`],
              ["all", `כל ה־${current?.name ?? many} (${swap.similar})`],
            ] as const}
            onChange={setScope}
          />
        </div>
      )}
      {swap.options.length > 8 && (
        <SearchInput value={query} onChange={setQuery} placeholder="חיפוש…" aria-label={`חיפוש ${many}`} className="mb-2" />
      )}
      <div className="scroll-slim -mx-1 max-h-72 overflow-y-auto px-1">
        {categories.map((c) => (
          <div key={c}>
            {categories.length > 1 && (
              <p className="px-1 pb-1 pt-2 text-xs font-medium text-ink-soft">{CATEGORY_BY_ID[c]?.label ?? c}</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {shown
                .filter((p) => p.category === c)
                .map((p) => {
                  const on = p.id === swap.current;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={on}
                        aria-current={on || undefined}
                        onClick={() => onSwap(p.id, all)}
                        className={
                          "flex w-full items-center gap-2.5 rounded-sm p-1.5 text-start transition-colors " +
                          (on ? "cursor-default bg-accent-tint" : "hover:bg-bg")
                        }
                      >
                        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-sm border border-border">
                          <ProductImage product={p} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={"block truncate text-sm font-medium " + (on ? "text-accent" : "text-ink")}>{p.name}</span>
                          <span className="nums block truncate text-xs text-muted">{facts(p)}</span>
                        </span>
                        {on && <Check className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
        {shown.length === 0 && <p className="p-3 text-center text-sm text-muted">אין תוצאות</p>}
      </div>
      <Note>
        {swap.kind === "tables"
          ? "המספר, הקבוצה, התפוסה והעיצוב שעל השולחן נשארים; הגודל והכסאות באים מהשולחן החדש. שולחנות צמודים בקבוצה נשארים צמודים."
          : "המקום והכמות נשארים; הגוון חוזר לברירת המחדל של הפריט החדש."}
      </Note>
    </Popover>
  );
}

const cm = (mm: number) => Math.round(mm / 10);
const metres = (mm: number) => `${(mm / 1000).toFixed(2)} מ׳`;

/** Mirror the selection side to side, or top to bottom. */
function MirrorMenu({ onMirror }: { onMirror?: (axis: MirrorAxis) => void }) {
  if (!onMirror) return null;
  return (
    <Menu
      label="היפוך"
      icon={FlipHorizontal2}
      side="top"
      items={[
        { label: "היפוך מצד לצד", icon: FlipHorizontal2, onSelect: () => onMirror("horizontal") },
        { label: "היפוך מלמעלה למטה", icon: FlipVertical2, onSelect: () => onMirror("vertical") },
      ]}
    />
  );
}

/** The size of a stretchable item, in the module it is built in. Commits on blur — a stage built in
 *  1m decks would otherwise snap to 1m the moment the "4" of "450" was typed. */
/** "Save this stage as a template": a name, and the button. */
function SaveTemplatePopover({ onSave }: { onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Popover label="תבנית" icon={BookmarkPlus} value="שמירה">
      <TextField label="שם התבנית" value={name} onChange={setName} placeholder="במת חופה 4×4" />
      <Button
        size="sm"
        className="mt-2 w-full"
        disabled={!name.trim()}
        onClick={() => {
          onSave(name.trim());
          setName("");
        }}
      >
        <BookmarkPlus className="h-3.5 w-3.5" strokeWidth={2} />
        שמירה כתבנית
      </Button>
      <Note>הצורה, המפלסים, הקצוות, המשטח והעיצוב על הבנקטים נשמרים. במה מתבנית מוצבת מכלי ״מילוי במות״.</Note>
    </Popover>
  );
}

function SizePopover({ panel, onSize }: { panel: SizePanel; onSize: (size: { widthMm: number; depthMm: number } | null) => void }) {
  const { size, catalog, axes, spec, custom } = panel;
  const step = spec.stepMm || 100;
  const value = axes.uniform ? `⌀${cm(size.widthMm)}` : `${cm(size.widthMm)}×${cm(size.depthMm)}`;
  const range = (r?: { minMm: number; maxMm: number }) => (r ? `${cm(r.minMm)}–${cm(r.maxMm)}` : null);
  return (
    <Popover label="גודל (ס״מ)" icon={Scaling} value={ltr(value)}>
      {axes.width && spec.width && (
        <PanelRow label={axes.uniform ? "קוטר" : "רוחב"} htmlFor="resize-w">
          <NumberField
            id="resize-w"
            decimals={0}
            min={cm(spec.width.minMm)}
            max={cm(spec.width.maxMm)}
            step={cm(step)}
            commitOnBlur
            value={cm(size.widthMm)}
            onChange={(v) => onSize({ widthMm: v * 10, depthMm: size.depthMm })}
            className="w-24"
          />
        </PanelRow>
      )}
      {axes.depth && spec.depth && (
        <PanelRow label="עומק" htmlFor="resize-d">
          <NumberField
            id="resize-d"
            decimals={0}
            min={cm(spec.depth.minMm)}
            max={cm(spec.depth.maxMm)}
            step={cm(step)}
            commitOnBlur
            value={cm(size.depthMm)}
            onChange={(v) => onSize({ widthMm: size.widthMm, depthMm: v * 10 })}
            className="w-24"
          />
        </PanelRow>
      )}
      <Note>
        בקפיצות של {cm(step)} ס״מ
        {axes.width && spec.width ? ` · ${axes.uniform ? "קוטר" : "רוחב"} ${range(spec.width)}` : ""}
        {axes.depth && spec.depth ? ` · עומק ${range(spec.depth)}` : ""}. אפשר גם למתוח בידיות שעל התוכנית.
      </Note>
      {custom && (
        <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => onSize(null)}>
          <Undo2 className="h-3.5 w-3.5" strokeWidth={2} />
          חזרה לגודל הקטלוג ({axes.uniform ? `⌀${cm(catalog.widthMm)}` : `${cm(catalog.widthMm)}×${cm(catalog.depthMm)}`})
        </Button>
      )}
    </Popover>
  );
}

/** The safety distances this thing is not being given, by name — carried in the warning ink on the
 *  chip itself, so the bar says so before it is opened. */
function BreachPopover({ breaches }: { breaches: { other: string; distance: number; required: number }[] }) {
  if (breaches.length === 0) return null;
  return (
    <Popover label="מרחק ביטחון" icon={ShieldAlert} tone="warn" value={breaches.length === 1 ? "חריגה אחת" : `${breaches.length} חריגות`}>
      <ul className="space-y-1.5 text-xs">
        {breaches.map((b, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="truncate text-ink">{b.other}</span>
            <span className="nums shrink-0 font-semibold text-warn-ink" dir="ltr">
              {(b.distance / 1000).toFixed(2)} / {(b.required / 1000).toFixed(2)} מ׳
            </span>
          </li>
        ))}
      </ul>
      <Note>המרחק הנקי בין הפריטים, מקצה לקצה, קטן ממרחק הביטחון שהוגדר לפריט בקטלוג.</Note>
    </Popover>
  );
}

/** Set the air between the selected things. The first one picked stays put. */
function SpacingPopover({ spacing, onSpace }: { spacing: Spacing; onSpace: (gapMm: number, mode: "x" | "y" | "direct") => void }) {
  const [mode, setMode] = useState<"x" | "y" | "direct">(spacing.axis);
  const current = mode === "direct" ? spacing.direct : spacing[mode];
  const [gapCm, setGapCm] = useState(() => Math.max(0, cm(current ?? 1000)));
  const shown = current === null ? "—" : current < 0 ? "חופפים" : metres(current);
  const options: (readonly ["x" | "y" | "direct", string])[] = [
    ["x", "אופקי"],
    ["y", "אנכי"],
    ...(spacing.count === 2 ? ([["direct", "ישיר"]] as const) : []),
  ];
  return (
    <Popover label="מרווח בין הפריטים" icon={MoveHorizontal} value={shown} panelClassName="w-72">
      <Segmented label="נמדד" value={mode} options={options} onChange={setMode} />
      <p className="mt-2 text-xs text-muted">
        עכשיו: <span className="nums font-medium text-ink">{shown}</span>
      </p>
      <PanelRow label="מרווח (ס״מ)" htmlFor="spacing-gap">
        <NumberField id="spacing-gap" decimals={0} min={0} value={gapCm} onChange={setGapCm} className="w-24" />
      </PanelRow>
      <Button size="sm" className="mt-2 w-full" onClick={() => onSpace(gapCm * 10, mode)}>
        <MoveHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
        החלת המרווח
      </Button>
      <Note>
        {spacing.first} נשאר במקומו
        {spacing.count === 2 ? " והשני זז." : " והשאר מסתדרים בשורה ממנו."}{" "}
        {mode === "direct" ? "נמדד מקצה לקצה, לאורך הקו בין המרכזים." : "נמדד בין קצוות הפריטים, לאורך הציר."}
      </Note>
    </Popover>
  );
}

/** Bring to front / send to back, across the whole floor stack — a table over a stage, a plinth under
 *  a rug (lib/design-document/stacking.ts). Also Ctrl+] / Ctrl+[ and the canvas's right-click menu;
 *  the shortcuts are written between LRMs so the brackets are not mirrored by the Hebrew around them. */
function StackMenu({ show, onRestack }: { show: boolean; onRestack: (to: "front" | "back") => void }) {
  if (!show) return null;
  return (
    <Menu
      label="סדר בערימה — מה מצויר מעל מה"
      icon={Layers}
      side="top"
      items={[
        { label: "לחזית · \u200eCtrl+]\u200e", icon: BringToFront, onSelect: () => onRestack("front") },
        { label: "לאחור · \u200eCtrl+[\u200e", icon: SendToBack, onSelect: () => onRestack("back") },
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

/** How big one item is drawn on this plan, as a percentage of its catalog size. A drawing size only:
 *  the quote, the packing list and the order still count it as the row it is. */
function ScalePopover({ scale, onScale }: { scale: number; onScale: (scale: number) => void }) {
  const pct = Math.round(scale * 100);
  return (
    <Popover label="גודל על התוכנית" icon={Scaling} value={ltr(`${pct}%`)}>
      <div className="grid grid-cols-4 gap-1" role="group" aria-label="גדלים מוכנים">
        {[75, 100, 125, 150].map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={pct === v}
            onClick={() => onScale(v / 100)}
            className={
              "nums rounded-sm py-1 text-xs font-semibold transition-colors " +
              (pct === v ? "bg-accent text-canvas" : "bg-inset text-ink-soft hover:bg-accent-tint hover:text-accent")
            }
          >
            {ltr(`${v}%`)}
          </button>
        ))}
      </div>
      <PanelRow label="אחוז" htmlFor="placement-scale">
        <NumberField id="placement-scale" decimals={0} min={30} max={300} value={pct} onChange={(v) => onScale(v / 100)} className="w-20" />
        <span className="text-xs text-muted">%</span>
      </PanelRow>
      <Note>גודל הציור בלבד — המחיר, הכמות ורשימת הציוד לא משתנים.</Note>
    </Popover>
  );
}
