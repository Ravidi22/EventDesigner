"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  Crosshair,
  LayoutGrid,
  PaintRoller,
  ArrowDownUp,
  Rows3,
  Pencil,
  PackagePlus,
} from "lucide-react";
import type { MirrorAxis } from "@/lib/design-document/mirror";
import type { Product, ResizeSpec } from "@/lib/catalog/types";
import { CATEGORY_BY_ID, isRunner } from "@/lib/catalog/categories";
import { tableLine } from "@/lib/studio/table-patterns";
import { patternUnits, unitOf, unitsOf } from "./dressing-units";
import { WaveFields, waveOf } from "./dressing-bar";
import type { HeightWave } from "@/lib/studio/hang-over";
import { ArrowUpFromLine } from "lucide-react";
import { formatDimensions } from "@/lib/catalog/format";
import { SearchInput } from "@/components/search-input";
import { ProductImage } from "../catalog/product-image";
import type { BenchSideKind, BenchSpec, ChairRows, DesignDocumentContent, DesignTable, WallSpan } from "@/lib/design-document/types";
import { ChairRowsPopover } from "@/components/chair-rows-popover";
import { BENCH_SIDE_KINDS, BENCH_SIDE_LABEL, SEAT_WIDTH_MM, type BenchLayout, type BenchSideLayout } from "@/lib/design-document/bench";
import { placementFootprint, tableBlockedSides, tableFootprint } from "@/components/footprint-shape";
import { footprintBounds } from "@/lib/studio/footprint";
import {
  climbAccessibleEdit,
  climbHeightEdit,
  climbReverseEdit,
  climbRisersEdit,
  itemClimbHost,
  type ClimbEdit,
} from "@/lib/studio/climb-item";
import {
  MAX_RISERS,
  climbRisers,
  formatRatio,
  rampRatio,
  rampTooSteep,
  riserHeightMm,
  risersForRise,
  treadDepthMm,
  type ClimbHost,
} from "@/lib/venues/climb";
import { SeatSidesPicker } from "@/components/seat-sides-picker";
import { Actions, Bar, BarButton, Note, PanelRow, Rotation, ltr } from "@/components/inspector-bar";
import { InspectorDivider } from "@/components/plan-canvas";
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
import { AlignMenu, type AlignPanel } from "./align-menu";
import { Popover } from "@/components/popover";
import { LAYER_LABEL } from "@/lib/catalog/categories";
import { productVessel, takesVessel } from "@/lib/catalog/vessel";
import { VesselPicker, vesselChoices } from "../catalog/vessel-picker";
import { loadProducts } from "@/lib/catalog/storage";
import { Amphora } from "lucide-react";
import { benchOf, chairBlockOf, coverOn, resolve, shadesOf, tableUtilization } from "@/lib/studio/catalog-resolver";
import { catalogBox } from "@/lib/studio/footprint";
import { chairOptions, defaultChair } from "@/lib/catalog/chairs";
import { duplicateNumbers, tableLabel } from "@/lib/design-document/groups";
import { SwitchRow } from "@/components/toggle";
import { resolveSpan, WHOLE_WALL } from "@/lib/studio/anchor";
import { ArrowDownToLine } from "lucide-react";
import { hangHeightOf, HANG_MAX_MM } from "@/lib/studio/hang";
import type { Selection, SpinMode } from "./canvas-stage";
import type { DeckType, MissingPiece } from "@/lib/studio/stage-fill";
import type { PieceInfo } from "@/lib/studio/stage-rim";
import { MissingPieces } from "./missing-pieces";

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
  /** Set into the stage (StageStair.inner), and whether it could stand outside / inside where it is. */
  inner: boolean;
  outerFits: boolean;
  innerFits: boolean;
  /** Which side: "בחזית", "בצד", "מאחור", "אל המפלס". */
  side: string;
  widthMm: number;
  full: boolean;
  risers: number;
  riserMm: number;
  autoRisers: number;
  manual: boolean;
  depthMm: number;
  /** A banquette's TOP above the deck (a chairs side's table), and a sofa side's seat height. */
  heightMm: number;
  sofaHeightMm: number;
  /** Everyone seated at a banquette; of them, on chairs (packed) and on a sofa side. */
  seats: number;
  chairSeats: number;
  sofaSeats: number;
  /** One per 60cm of its length — what a side seats when nobody typed a count. */
  autoSeats: number;
  /** Its two sides — the stage side (`back`) and the room side (`front`) — and whether each count
   *  was typed. */
  back: BenchSideRow;
  front: BenchSideRow;
  /** Design items standing on it (a banquette). */
  dressed: number;
}

/** One side of a banquette as the bar shows it. */
export interface BenchSideRow extends BenchSideLayout {
  /** Whether the designer typed this side's count (else it is one per 60cm). */
  set: boolean;
}

/** What the bar may change about one side of a banquette: what it is, and how many sit there
 *  (`seats: null` = back to one per 60cm). */
export type BenchSidePatch = { kind?: BenchSideKind; seats?: number | null };

/** What the bar shows for a STANDALONE banquette (Placement.bench): how it is laid, what the
 *  designer set, and whether it currently carries a number. */
export interface BenchPanel {
  layout: BenchLayout;
  spec: BenchSpec | undefined;
  /** Set when it takes part in the numbering — seated, and numbered. */
  numbered: boolean;
}

/** A standalone banquette's edit: a side, a height, its number (`null` clears it) or its occupancy. */
export type BenchPatch = { back?: BenchSidePatch; front?: BenchSidePatch; heightMm?: number; sofaHeightMm?: number; number?: number | null; seated?: number };

/** What the stage bar shows: its size when it is a rectangle, what it is built of, how high it and
 *  its levels stand, its flights, and the skirt and railing its open sides need. */
export interface StagePanel {
  /** A rectangle's size — or, `round`, the box of a stage with a curve (a disc, an oval, a
   *  half-round), which a typed size scales whole. */
  size: { widthMm: number; depthMm: number } | null;
  round?: boolean;
  /** A rectangle with rounded corners or a bowed front (StageBuild.roundedMm / bowMm): its size is
   *  its box, and a typed size rebuilds the same shape on the new rectangle. */
  shaped?: boolean;
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
  /** The rim pieces the build needs and the catalog does not have (lib/studio/stage-rim.ts), the
   *  stage pieces the catalog has, and the ones this stage is built from — for "חסר בקטלוג". */
  missing: MissingPiece[];
  pieceTypes: (DeckType & { name: string })[];
  chosen: string[];
}

/** What the bar for several stages (a group of them, or a handful selected) shows. */
export interface StageGroupPanel {
  count: number;
  grouped: boolean;
  /** How many are stages already, and how many are pieces that are not yet. */
  stages: number;
  pieces: number;
  /** Their height when they share one; null when they differ. */
  heightMm: number | null;
  /** Bare open edge over all of them, and skirt — sides pushed against each other are neither. */
  gapsMm: number;
  skirtMm: number;
  /** Their surface when they share one (null = bare decks); undefined when they differ. */
  surface: string | null | undefined;
  surfaceOptions: { value: string; label: string }[];
  areaMm2: number;
  /** The rest of a stage's bar, over the whole group (set when `grouped`): what the lot is built of,
   *  how big it stands, its edges and railing, and the switches every member shares. */
  whole?: {
    /** The group's box, in the first stage's frame. */
    size: { widthMm: number; depthMm: number };
    deckCount: number;
    /** Decked floor over outlined floor, across the group. */
    coverage: number;
    decks: { name: string; count: number }[];
    /** Runs of each kind over every member, and how many flights and ramps. */
    stairsMm: number;
    flights: number;
    benchMm: number;
    benchSeats: number;
    barrierMm: number;
    backdropMm: number;
    ramps: number;
    /** Corner pieces: on everywhere (true), off everywhere (false), or mixed (undefined). */
    corners: boolean | undefined;
    cornerCount: number;
    /** Decks may exceed the line: all / none / mixed. */
    exceed: boolean | undefined;
    railingMm: number | null;
    railingAboveMm: number | null;
    stairsCounted: boolean;
    skirtCounted: boolean;
    benchCounted: boolean;
    barrierCounted: boolean;
    /** Every stage in the group, to pick one out for its own bar (levels, a flight, the outline) —
     *  its size as a Latin figure the bar wraps LTR, null for a shaped one. */
    members: { id: string; label: string; size: string | null }[];
  };
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
  onTablesNumbered,
  renderPattern,
  renderDesigns,
  onScale,
  onHang,
  onCentreOver,
  onSpreadRow,
  onHangOverDressing,
  onVessel,
  onClimb,
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
  align,
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
  onAddStagePieces,
  onUseStagePieces,
  onLevelHeight,
  onRemoveLevel,
  onAddLevel,
  onAddEdge,
  onFillEdges,
  onSelectEdge,
  onRemoveStair,
  onStairChange,
  benchPanel,
  onBench,
  onChairRows,
  onStageSurface,
  onStageCorners,
  onStageExceed,
  onSaveTemplate,
  stageGroup,
  onGroupStageHeight,
  onGroupFillEdges,
  onGroupStageSurface,
  onGroupStageCorners,
  onGroupStageExceed,
  onGroupSaveTemplate,
  onGroupExplode,
  onPickStage,
  onBackToGroup,
  onStickStages,
  onMergeStages,
  onMakeStage,
  swap,
  onSwap,
  clothOptions,
  onReplaceCloth,
  onEditProduct,
  onSaveComposite,
  onBlockCloth,
  onStyleTables,
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
  group: { id: string; number?: number; tables: number; items: number; seats: number; seated: number; tableIds: string[]; unnumbered: boolean } | null;
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
  /** Open a table's focus mode — where the items on it are moved about and arranged. Absent in the
   *  hall pass, where a table is laid out, not dressed: the bar then offers no roller. */
  onDressTable?: (tableId: string) => void;
  /** Take tables out of the numbering (DesignTable.unnumbered), or put them back — a block by all of
   *  its tables. */
  onTablesNumbered: (tableIds: string[], numbered: boolean) => void;
  /** The "which tables" panel (TablePatternPicker), bound to a source table and — when one item is
   *  being applied rather than the table's whole dressing — that item. */
  renderPattern: (sourceTableId: string, placementId?: string, asBlock?: boolean) => ReactNode;
  /** The saved table designs panel (TableDesignsPanel), bound to a table. */
  renderDesigns: (tableId: string) => ReactNode;
  /** How big one placed item is DRAWN (Placement.scale) — not what it costs or how many there are. */
  onScale: (placementId: string, scale: number) => void;
  /** How high one CEILING item hangs above the floor (Placement.hangHeightMm); null = its catalog
   *  row's default again. A rigging fact — nothing priced or packed reads it. */
  onHang?: (placementId: string, heightMm: number | null) => void;
  /** A ceiling item back over the middle of the table it hangs over. */
  onCentreOver?: (placementId: string) => void;
  /** N of a ceiling item strung along the row (or column) of tables its table stands in. */
  onSpreadRow?: (placementId: string, opts: { axis: "row" | "column"; count: number; wave?: HeightWave | null }) => void;
  /** One of a ceiling item above each item set out on the table it hangs over. */
  onHangOverDressing?: (placementId: string, wave?: HeightWave | null) => void;
  /** The vase an arrangement stands in (lib/catalog/vessel.ts): a variant, null = none, undefined =
   *  its catalog row's own. */
  onVessel?: (placementIds: string[], vessel: string | null | undefined) => void;
  /** A rented flight or ramp standing on its own: its rise, steps or direction, with the run that
   *  follows and where it now stands (lib/studio/climb-item.ts builds the edit). */
  onClimb?: (placementId: string, edit: ClimbEdit) => void;
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
  /** יישור by one of the selected (align-menu.tsx) — null when the selection cannot be aligned. */
  align: AlignPanel | null;
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
  /** The stage's missing rim pieces made catalog rows and chosen for it; or catalog pieces it was not
   *  built from, chosen for it. */
  onAddStagePieces: (infos: PieceInfo[]) => void;
  onUseStagePieces: (ids: string[]) => void;
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
  /** An edge item's kind, width, steps (`risers: null` = back to automatic), depth or heights, one of
   *  a banquette's two sides — or whether it stands outside the stage or set into it (`inner`). */
  onStairChange: (
    stairId: string,
    patch: {
      kind?: EdgeKindId;
      widthMm?: number;
      risers?: number | null;
      full?: boolean;
      depthMm?: number;
      heightMm?: number;
      sofaHeightMm?: number;
      back?: BenchSidePatch;
      front?: BenchSidePatch;
      inner?: boolean;
    },
  ) => void;
  /** Set when the one selected thing is a STANDALONE banquette (lib/design-document/bench.ts). */
  benchPanel: BenchPanel | null;
  onBench: (id: string, patch: BenchPatch) => void;
  /** A chair standing on the floor set out as a BLOCK OF ROWS, re-set, or put back to one chair
   *  (null) — lib/design-document/chair-rows.ts. Absent = no rows panel. */
  onChairRows?: (id: string, rows: ChairRows | null) => void;
  onStageSurface: (variantId: string | null) => void;
  onStageCorners: (on: boolean) => void;
  onStageExceed: (on: boolean) => void;
  /** Save the selected stage as a named template. */
  onSaveTemplate: (name: string) => void;
  /** Set when the selection is a group (or a handful) made only of stages — the bar then speaks of
   *  stages, offers to make them one, and sets what a stage's bar sets on every one of them. */
  stageGroup: StageGroupPanel | null;
  /** …each over every stage in it: one height, every bare edge finished, one surface. */
  onGroupStageHeight?: (heightMm: number) => void;
  onGroupFillEdges?: (kind: EdgeKindId) => void;
  onGroupStageSurface?: (variantId: string | null) => void;
  /** …and, for a GROUP of stages (stageGroup.grouped), the rest of a stage's bar over all of them:
   *  corners and exceed on every member, every member saved as a template (one each — a template
   *  is one outline), every member taken apart into its decks, one member picked out for its own
   *  bar (levels, a flight on a side, the outline, מידות). */
  onGroupStageCorners?: (on: boolean) => void;
  onGroupStageExceed?: (on: boolean) => void;
  onGroupSaveTemplate?: (name: string) => void;
  onGroupExplode?: () => void;
  onPickStage?: (id: string) => void;
  /** Set on a stage's own bar when it was picked out of its group: the group back as the selection. */
  onBackToGroup?: () => void;
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
  /** Open the catalog row behind the one selected item (or table) in the catalog's own drawer, over
   *  the sketch — given the placed variant. Absent = no such button. */
  onEditProduct?: (variantId: string) => void;
  /** What is selected, saved as ONE catalog item made of its parts (lib/catalog/composition.ts) — a
   *  dressed head table to place again at the next event. Absent = not offered. */
  onSaveComposite?: () => void;
  /** A BLOCK's cloth — every table of it at once, as the one table it is: another shade, another
   *  cloth, or off. */
  onBlockCloth?: (tableIds: string[], op: { variantId: string } | { productId: string } | "remove") => void;
  /** One look over several tables (a block's), in one history entry. */
  onStyleTables?: (tableIds: string[], style: ElementStyle | undefined) => void;
}) {
  // Local to the one bar that offers it — a copy of another table's dressing has exactly one entry
  // point on this screen, so there is no second dialog to keep in sync (contrast the catalog's
  // delete, which the card menu AND the edit drawer can both open).
  const [dressMode, setDressMode] = useState<"add" | "replace">("add");
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  const selectItems = selectionItems({ zoneFocused, onSelectInZone, layerActive, onSelectLayer, onSelectSimilar });

  // A GROUP — the designer pushed these together and said they are one thing. For tables that means
  // one number for the lot, so the number field here edits the group and not any table inside it.
  // (A group made only of stages is a STAGE group — its own bar, below, with the stage tools.)
  if (group && !(selectedCount > 1 && stageGroup)) {
    // A block of TABLES is one table — the bar gives it what a table's bar gives a table: its cloth,
    // its chair, its look, its focus mode, its saved designs and its pattern, each over every table
    // of it at once. The cloth shown is the first table's that has one; a change goes on them all.
    const members = group.tableIds.map((id) => doc.tables.find((x) => x.id === id)).filter((x): x is DesignTable => !!x);
    const covers = members.map((m) => coverOn(doc, m.id)).filter((c): c is NonNullable<typeof c> => !!c);
    const blockCloth = covers[0];
    const blockShades = blockCloth ? shadesOf(blockCloth.variantId) : [];
    const blockVariant = members.length > 0 && members.every((m) => m.variantId && m.variantId === members[0].variantId) ? members[0].variantId : undefined;
    const blockChair = members.length > 0 && members.every((m) => (m.chairVariantId ?? "") === (members[0].chairVariantId ?? "")) ? (members[0].chairVariantId ?? "") : null;
    const blockDressed = doc.placements.some((p) => (p.layer === "table" && !!p.tableId && group.tableIds.includes(p.tableId)) || (p.layer === "ceiling" && !!p.over && group.tableIds.includes(p.over)));
    const lead = members[0];
    return (
      <Bar
        icon={Group}
        title={group.tables > 0 ? (group.unnumbered ? "שולחן ללא מספר" : group.number ? `שולחן ${group.number}` : group.number === 0 ? "שולחן ראש" : "קבוצה") : "קבוצה"}
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
            {group.seats > 0 && onChairForSelection && chairOptions().length > 0 && (
              <PanelRow label="כיסא" stack>
                <Select
                  aria-label="סוג הכיסא סביב הבלוק"
                  value={blockChair === null ? "__mixed" : blockChair}
                  options={[
                    ...(blockChair === null ? [{ value: "__mixed", label: "כיסאות שונים" }] : []),
                    { value: "", label: `ברירת מחדל${(() => {
                      const d = defaultChair();
                      const name = d ? chairOptions().find((o) => o.value === d)?.label : undefined;
                      return name ? ` — ${name}` : "";
                    })()}` },
                    ...chairOptions(),
                  ]}
                  onChange={(v) => v !== "__mixed" && onChairForSelection(v || null)}
                />
              </PanelRow>
            )}
            <Note>הכסאות מסודרים סביב הבלוק כולו ומתחלקים בין השולחנות שבו; התפוסה ממלאת כל שולחן עד מלוא הכסאות שלו.</Note>
          </Popover>
        )}

        {group.tables > 0 && (
          <Popover label="מספר שולחן" icon={Hash} value={group.unnumbered ? "ללא" : ltr(`#${group.number ?? 0}`)}>
            {!group.unnumbered && (
              <PanelRow>
                <NumberField
                  id="group-number"
                  aria-label="מספר שולחן"
                  decimals={0}
                  min={0}
                  value={group.number ?? 0}
                  onChange={(v) => onRenumberGroup(group.id, v)}
                  className="w-20"
                />
              </PanelRow>
            )}
            {!group.unnumbered && group.number !== undefined && group.number > 0 && duplicateNumbers(doc, benchOf).has(group.number) && <DuplicateNumber />}
            <div className="mt-2">
              <UnnumberedSwitch checked={!!group.unnumbered} onChange={(off) => onTablesNumbered(group.tableIds, !off)} />
            </div>
            <Note>השולחנות נספרים כשולחן אחד, והכסאות מסודרים סביב הבלוק כולו.</Note>
          </Popover>
        )}

        {swap && (
          <SwapPopover swap={swap} onSwap={onSwap} label={swap.kind === "tables" ? "סוג השולחנות בקבוצה" : "החלפת הפריטים בקבוצה"} />
        )}
        {onEditProduct && blockVariant && resolve(blockVariant) && <BarButton icon={Pencil} label="עריכת סוג השולחנות בקטלוג" onClick={() => onEditProduct(blockVariant)} />}

        {blockCloth && onBlockCloth && (
          <Popover label="מפה" leading={<Swatch color={blockShades.find((s) => s.id === blockCloth.variantId)?.swatch} size={14} />} value={resolve(blockCloth.variantId)?.product.name ?? "מפה"}>
            {clothOptions.length > 1 && (
              <Select
                aria-label="סוג המפה"
                value={resolve(blockCloth.variantId)?.product.id ?? ""}
                options={clothOptions}
                onChange={(v) => v && onBlockCloth(group.tableIds, { productId: v })}
                className="mb-2 w-full"
              />
            )}
            {blockShades.length > 0 && (
              <SwatchPicker options={blockShades} value={blockCloth.variantId} onChange={(v) => onBlockCloth(group.tableIds, { variantId: v })} label="גוון המפה" />
            )}
            {covers.length < members.length && <Note>{`${members.length - covers.length} מהשולחנות בבלוק בלי מפה — שינוי כאן חל על מי שיש לו. להלבשת כולם: גוררים מפה מהסרגל על הבלוק.`}</Note>}
            <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onApplyToAllTables(blockCloth.id)}>
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
              על כל השולחנות
            </Button>
            <Button size="sm" variant="danger" className="mt-1 w-full" onClick={() => onBlockCloth(group.tableIds, "remove")}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              הסרת המפה
            </Button>
          </Popover>
        )}

        {/* The block's design, as a table's: its focus mode, its saved designs, and its whole
            dressing onto other tables in a pattern — a block landing on a block, a round or a
            rectangle at the same relative places. */}
        {group.tables > 0 && onDressTable && lead && (
          <BarButton icon={PaintRoller} label="עיצוב השולחן — הזזה וסידור של הפריטים על הבלוק · לחיצה כפולה" onClick={() => onDressTable(lead.id)} />
        )}
        {group.tables > 0 && lead && (
          <Popover label="עיצובים שמורים" icon={BookmarkPlus} value="עיצובים" panelClassName="w-72">
            {renderDesigns(lead.id)}
          </Popover>
        )}
        {group.tables > 0 && lead && blockDressed && (
          <Popover label="החלת עיצוב הבלוק על שולחנות" icon={LayoutGrid} value="דפוס" panelClassName="w-72">
            {renderPattern(lead.id, undefined, true)}
          </Popover>
        )}
        {group.tables > 0 && lead && onStyleTables && (
          <Popover label="מראה" icon={Palette} panelClassName="w-72">
            <StyleFields
              style={lead.style}
              onChange={(style) => onStyleTables(group.tableIds, style)}
              strokeWidthDefault={(lead.variantId ? resolve(lead.variantId)?.product.appearance?.style?.strokeWidthPx : undefined) ?? 2.5}
            />
          </Popover>
        )}

        <Rotation value={facing} onChange={onFace} />
        <MirrorMenu onMirror={onMirror} />

        <Menu
          label="עוד פעולות לקבוצה"
          side="top"
          items={[
            ...(onSaveComposite ? [{ label: "שמירה כפריט מורכב בקטלוג", icon: PackagePlus, onSelect: onSaveComposite }] : []),
            { label: "פירוק הקבוצה", icon: Ungroup, onSelect: onUngroup },
          ]}
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
    const gm = (mm: number) => String(Math.round(mm / 10) / 100);
    const sg = stageGroup;
    return (
      <Bar
        icon={Grid2x2}
        title={sg.grouped ? "במה מקובצת" : "במות"}
        facts={[
          `${sg.count} חלקים`,
          sg.heightMm ? `${Math.round(sg.heightMm / 10)} ס״מ` : sg.stages > 1 ? "גבהים שונים" : null,
          sg.gapsMm > 0 ? `${gm(sg.gapsMm)} מ׳ שפה פתוחה` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        onClose={onClose}
      >
        {onMergeStages && (
          <Button size="sm" onClick={onMergeStages}>
            <Combine className="h-3.5 w-3.5" strokeWidth={2} />
            איחוד לבמה אחת
          </Button>
        )}
        {onStickStages && <BarButton icon={Magnet} label="הצמדה — סגירת הרווחים ויישור" onClick={onStickStages} />}
        <AlignMenu align={align} />
        {/* What a stage's own bar sets, set on every stage of the group at once. Levels and single
            edge items stay with one stage (select it, or merge first): a riser belongs to the
            platform it stands on. */}
        {sg.stages > 0 && onGroupStageHeight && (
          <Popover label="גובה" icon={MoveVertical} value={sg.heightMm ? `${Math.round(sg.heightMm / 10)} ס״מ` : "שונים"} panelClassName="w-72">
            <PanelRow label="כל הבמות" htmlFor="group-stage-height">
              <NumberField
                id="group-stage-height"
                decimals={0}
                min={10}
                max={300}
                value={sg.heightMm ? Math.round(sg.heightMm / 10) : 0}
                hideZero
                placeholder="—"
                onChange={(cm) => cm > 0 && onGroupStageHeight(cm * 10)}
                className="w-20"
              />
              <span className="text-xs text-muted">ס״מ</span>
            </PanelRow>
            <Note>{sg.pieces > 0 ? `${sg.pieces} חלקים עדיין אינם במה — הגובה נקבע לבמות שבקבוצה. ` : ""}במות שעומדות זו לצד זו באותו גובה הן משטח אחד.</Note>
          </Popover>
        )}
        {sg.stages > 0 && onGroupFillEdges && (
          <Popover
            label="קצוות"
            icon={Footprints}
            tone={sg.gapsMm > 0 ? "warn" : "default"}
            value={sg.gapsMm > 0 ? `${gm(sg.gapsMm)} מ׳ פתוחים` : sg.whole?.flights ? `${sg.whole.flights} מדרגות` : "סגור"}
            panelClassName="w-80"
          >
            {/* A group's edges, counted over every member — what the single stage's bar lists. */}
            {sg.whole && (sg.whole.flights > 0 || sg.whole.benchMm > 0 || sg.whole.barrierMm > 0 || sg.whole.backdropMm > 0 || sg.whole.ramps > 0) && (
              <ul className="mb-2 space-y-1 text-sm">
                {sg.whole.flights > 0 && (
                  <li className="flex justify-between gap-3">
                    <span className="text-ink">מדרגות{sg.whole.stairsCounted ? "" : " (אין בקטלוג)"}</span>
                    <span className="nums text-muted">{`${sg.whole.flights} · ${gm(sg.whole.stairsMm)} מ׳`}</span>
                  </li>
                )}
                {sg.whole.benchMm > 0 && (
                  <li className="flex justify-between gap-3">
                    <span className="text-ink">בנקט{sg.whole.benchCounted ? "" : " (אין בקטלוג)"}</span>
                    <span className="nums text-muted">{`${gm(sg.whole.benchMm)} מ׳ · ${sg.whole.benchSeats} מקומות`}</span>
                  </li>
                )}
                {sg.whole.barrierMm > 0 && (
                  <li className="flex justify-between gap-3">
                    <span className="text-ink">מחסום{sg.whole.barrierCounted ? "" : " (אין בקטלוג)"}</span>
                    <span className="nums text-muted">{`${gm(sg.whole.barrierMm)} מ׳`}</span>
                  </li>
                )}
                {sg.whole.backdropMm > 0 && (
                  <li className="flex justify-between gap-3">
                    <span className="text-ink">קיר רקע</span>
                    <span className="nums text-muted">{`${gm(sg.whole.backdropMm)} מ׳`}</span>
                  </li>
                )}
                {sg.whole.ramps > 0 && (
                  <li className="flex justify-between gap-3">
                    <span className="text-ink">רמפה</span>
                    <span className="nums text-muted">{sg.whole.ramps}</span>
                  </li>
                )}
              </ul>
            )}
            {sg.whole && onGroupStageCorners && (sg.whole.cornerCount > 0 || sg.whole.corners !== true) && (
              <div className="mb-2">
                <Segmented
                  label={`פינות בין שתי ריצות — בכל הבמות${sg.whole.corners === undefined ? " (כרגע שונות)" : ""}`}
                  value={sg.whole.corners === false ? "off" : "on"}
                  options={[
                    ["on", "פינה מלאה"],
                    ["off", "פתוחה"],
                  ] as const}
                  onChange={(v) => onGroupStageCorners(v === "on")}
                />
              </div>
            )}
            {sg.gapsMm > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-alert-ink">{gm(sg.gapsMm)} מ׳ של שפה פתוחה בבמות שבקבוצה.</p>
                <div className="flex gap-1">
                  {(["stairs", "bench", "barrier"] as const).map((k) => (
                    <Button key={k} size="sm" variant="outline" className="flex-1" onClick={() => onGroupFillEdges(k)}>
                      {EDGE_KIND_LABEL[k]}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink">כל הצדדים הפתוחים סגורים.</p>
            )}
            {sg.skirtMm > 0 && <p className="mt-2 text-xs text-muted">{`חצאית: ${gm(sg.skirtMm)} מ׳`}</p>}
            <Note>צדדים שצמודים לבמה אחרת אינם פתוחים. מדרגות או בנקט בודדים מוסיפים בבחירת במה אחת.</Note>
          </Popover>
        )}
        {sg.stages > 0 && onGroupStageSurface && (
          <Popover
            label="משטח"
            icon={Layers2}
            value={sg.surface === undefined ? "שונים" : sg.surface ? (sg.surfaceOptions.find((o) => o.value === sg.surface)?.label ?? "—") : "פלטות חשופות"}
          >
            <Select
              aria-label="מה מכסה את הבמות"
              value={sg.surface ?? ""}
              options={[{ value: "", label: "ללא — פלטות חשופות" }, ...sg.surfaceOptions]}
              onChange={(v) => onGroupStageSurface(v || null)}
            />
            <Note>{`אותו משטח על כל הבמות בקבוצה (${gm(sg.areaMm2 / 1000)} מ״ר).`}</Note>
          </Popover>
        )}
        {/* A GROUP of stages carries the rest of a stage's bar, over all of them: how big the lot
            stands, what it is built of (with the exceed switch on every member), its railing, a
            template per member, every member taken apart — and one member picked out for the tools
            that belong to ONE stage: levels, a flight on a side, the outline, exact מידות. A click
            on a member of the selected group does the same. */}
        {sg.whole && (
          <Popover label="מידות" icon={Ruler} value={ltr(`${gm(sg.whole.size.widthMm)}×${gm(sg.whole.size.depthMm)} מ׳`)} panelClassName="w-72">
            <Note>
              {`הקבוצה כולה תופסת ${gm(sg.whole.size.widthMm)}×${gm(sg.whole.size.depthMm)} מ׳ — ${sg.count} חלקים. `}
              מידה מדויקת לבמה אחת, מפלסים, מדרגות בצד ועריכת הצורה — בלחיצה על אותה במה בתוך הקבוצה, או ב״במה בודדת״ כאן.
            </Note>
          </Popover>
        )}
        {sg.whole && (
          <Popover label="בנויה מ" icon={Blocks} value={`${sg.whole.deckCount} פלטות`} panelClassName="w-72">
            {sg.whole.decks.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {sg.whole.decks.map((d) => (
                  <li key={d.name} className="flex justify-between gap-3">
                    <span className="text-ink">{d.name}</span>
                    <span className="nums font-semibold text-ink">×{d.count}</span>
                  </li>
                ))}
                {sg.skirtMm > 0 && (
                  <li className="flex justify-between gap-3 border-t border-border-soft pt-1">
                    <span className="text-ink">חצאית{sg.whole.skirtCounted ? "" : " (אין בקטלוג)"}</span>
                    <span className="nums font-semibold text-ink">{ltr(`${gm(sg.skirtMm)} מ׳`)}</span>
                  </li>
                )}
              </ul>
            ) : (
              <Note>אף פלטה לא נכנסת — אולי הפלטות שנבחרו נמחקו מהקטלוג.</Note>
            )}
            {onGroupStageExceed && (
              <div className="mt-2">
                <Segmented
                  label={`פלטה שעוברת את הקו — בכל הבמות${sg.whole.exceed === undefined ? " (כרגע שונות)" : ""}`}
                  value={sg.whole.exceed === true ? "on" : "off"}
                  options={[
                    ["off", "בתוך הקו"],
                    ["on", "מותר לחרוג"],
                  ] as const}
                  onChange={(v) => onGroupStageExceed(v === "on")}
                />
              </div>
            )}
            <Note>
              {sg.whole.coverage < 0.995 ? `הפלטות מכסות ${Math.floor(sg.whole.coverage * 100)}% מהרצפה המסומנת. ` : ""}
              כל במה בקבוצה מחושבת מהפלטות שלה; הצעת המחיר ורשימת הציוד סופרות את כולן, את המדרגות ואת מטרי החצאית.
            </Note>
          </Popover>
        )}
        {sg.whole && sg.whole.railingMm !== null && sg.whole.railingMm > 0 && (
          <Popover label="מעקה" icon={Fence} tone="warn" value={ltr(`${gm(sg.whole.railingMm)} מ׳`)} panelClassName="w-72">
            <Note>
              לפי הכלל שנקבע בהגדרות (מעל {Math.round((sg.whole.railingAboveMm ?? 0) / 10)} ס״מ), צריך מעקה בצדדים הפתוחים
              של הבמות בקבוצה, המסומנים בקו מנוקד. החזית לא מסומנת לעולם.
            </Note>
          </Popover>
        )}
        {sg.whole && onPickStage && (
          <Popover label="במה בודדת" icon={Grid2x2} value={`${sg.whole.members.length} במות`} panelClassName="w-72">
            <div className="space-y-1">
              {sg.whole.members.map((mbr) => (
                <Button key={mbr.id} size="sm" variant="outline" className="w-full" onClick={() => onPickStage(mbr.id)}>
                  {mbr.label}
                  {mbr.size ? <> · {ltr(mbr.size)}</> : null}
                </Button>
              ))}
            </div>
            <Note>בחירת במה אחת מתוך הקבוצה — לסרגל שלה: מפלסים, מדרגות בצד, עריכת הצורה ומידות. ״חזרה לקבוצה״ בסרגל שלה, או Esc.</Note>
          </Popover>
        )}
        {sg.whole && onGroupSaveTemplate && (
          <SaveTemplatePopover
            onSave={onGroupSaveTemplate}
            note={`תבנית היא במה אחת: כל אחת מ־${sg.whole.members.length} הבמות בקבוצה נשמרת כתבנית משלה, בשם הזה וממוספרת. במה מתבנית מוצבת מכלי ״מילוי במות״.`}
          />
        )}
        <Rotation value={facing} onChange={onFace} />
        <MirrorMenu onMirror={onMirror} />
        {sg.whole && onGroupExplode && <BarButton icon={Blocks} label="פירוק כל הבמות לפלטות נפרדות" onClick={onGroupExplode} />}
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
      ...(onSaveComposite ? [{ label: "שמירה כפריט מורכב בקטלוג", icon: PackagePlus, onSelect: onSaveComposite }] : []),
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
              <PanelRow label="כיסא" stack>
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
        <AlignMenu align={align} />

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
              className="mt-3 w-full"
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
  // no size, no name. Those are the property's, measured once at /halls, and an event that could
  // edit them would be editing every other event held in the same room. "Remove" is tonight's too —
  // the bar wheeled out for this event (FeaturePlacement.removed); the venue keeps it, and the
  // toolbar's "פריטי מתחם שהוסרו" brings it back.
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
            אפשר להזיז, לסובב ולהסיר אותו לאירוע הזה בלבד. הגודל והמקום הקבוע נקבעים במסך האולמות,
            ואירועים אחרים באותו מתחם לא מושפעים. פריט שהוסר חוזר מ״פריטי מתחם שהוסרו״ בסרגל העליון.
          </Note>
        </Popover>
        <div className="ms-auto flex items-center gap-1">
          <InspectorDivider />
          <BarButton icon={Trash2} label="הסרה מהסקיצה של האירוע הזה · Delete" tone="danger" onClick={onDelete} />
        </div>
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
              it.inner ? (it.kind === "stairs" ? "שקועות בבמה" : "על הבמה") : null,
              it.full ? "כל הצד" : `${cmOf(it.widthMm)} ס״מ`,
              it.kind === "bench" ? `${it.seats} מקומות ישיבה` : null,
              it.kind === "bench" && it.sofaSeats > 0 ? `${it.sofaSeats} על ספה` : null,
              it.kind === "ramp" ? `אורך ${m(it.depthMm)} מ׳` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            onClose={onClose}
          >
            <BarButton icon={ArrowRight} label="חזרה לבמה" onClick={() => onSelectEdge(null)} />
            {(it.kind === "stairs" || it.kind === "bench") && (
              <Popover label="מיקום" icon={Layers2} value={it.inner ? "פנימי" : "חיצוני"} tone={!it.inner && !it.outerFits ? "warn" : "default"}>
                {it.outerFits && it.innerFits ? (
                  <Segmented
                    label={it.kind === "stairs" ? "איפה המדרגות" : "איפה הבנקט"}
                    value={it.inner ? "inner" : "outer"}
                    options={[
                      ["outer", "מחוץ לבמה"],
                      ["inner", it.kind === "stairs" ? "שקועות בבמה" : "על הבמה"],
                    ] as const}
                    onChange={(v) => onStairChange(it.id, { inner: v === "inner" })}
                  />
                ) : !it.outerFits && it.innerFits ? (
                  <>
                    <p className="text-sm text-ink">{it.inner ? "פנימי — " : ""}הצד קרוב לקיר: אין מקום {it.kind === "stairs" ? "לגרם המדרגות" : "לבנקט"} מחוץ לבמה, רק בתוכה.</p>
                    {!it.inner && (
                      <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => onStairChange(it.id, { inner: true })}>
                        {it.kind === "stairs" ? "להעביר לתוך הבמה" : "להעמיד על הבמה"}
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink">{it.inner ? "בתוך הבמה." : "מחוץ לבמה."} {it.innerFits || it.inner ? "" : it.kind === "stairs" ? "אי אפשר לשקוע מדרגות בצד הזה." : ""}</p>
                )}
                <Note>
                  {it.kind === "stairs"
                    ? "מדרגות פנימיות שקועות בתוך קו הבמה — עולים מהרצפה בשפה, והפלטות מונחות סביבן. זו הדרך היחידה למדרגות בצד שקרוב לקיר."
                    : "בנקט פנימי עומד על הבמה לאורך השפה, והכיסאות שלו מאחוריו, פונים החוצה."}
                </Note>
              </Popover>
            )}
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
              <Popover label="בנקט" icon={RectangleHorizontal} value={benchSeatsWord(it.chairSeats, it.sofaSeats)} panelClassName="w-[22rem]">
                {/* The two long sides, each its own: the stage side (chairs stand ON the stage behind
                    it, its top their table) and the room side. */}
                <BenchSidesFields
                  idPrefix="edge"
                  back={it.back}
                  front={it.front}
                  backLabel="צד הבמה"
                  frontLabel="צד האולם"
                  autoSeats={it.autoSeats}
                  heightMm={it.heightMm}
                  sofaHeightMm={it.sofaHeightMm}
                  heightNote="מעל הבמה — שולחן לכיסאות שעליה"
                  onSide={(side, patch) => onStairChange(it.id, { [side]: patch })}
                  onHeight={(mm) => onStairChange(it.id, { heightMm: mm })}
                  onSofaHeight={(mm) => onStairChange(it.id, { sofaHeightMm: mm })}
                />
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
          {/* One stage picked out of its group: its own bar, with the group a click away. */}
          {onBackToGroup && <BarButton icon={Group} label="חזרה לקבוצת הבמות · Esc" onClick={onBackToGroup} />}
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
                {sp.round
                  ? "הצורה כולה גדלה או קטנה איתה, והמדרגות סביבה עוקבות אחרי הקשת. הגב נשאר במקומו."
                  : sp.shaped
                    ? "המידה היא של התיבה, כולל הקימור. הפינות המעוגלות והחזית הקמורה נבנות מחדש על המלבן החדש; הגב נשאר במקומו. לשינוי הרדיוס — ״עריכת הבמה״."
                    : "הגב נשאר במקומו והחזית זזה. בגרירה, ידית נמשכת למידות שהפלטות בונות בדיוק (Alt משחרר)."}
              </Note>
            </Popover>
          )}

          <MissingPieces missing={sp.missing} types={sp.pieceTypes} chosen={sp.chosen} onUse={onUseStagePieces} onAdd={onAddStagePieces} />

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
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onAddLevel}>
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
                panelClassName="w-80"
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
                        <Button key={k} size="sm" variant="outline" className="flex-1" onClick={() => onFillEdges(k)}>
                          {EDGE_KIND_LABEL[k]}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-2 border-t border-border-soft pt-2">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">הוספה — ואז לחיצה על צד הבמה</span>
                  <div className="grid grid-cols-2 gap-1">
                    {EDGE_KINDS.map((k) => (
                      <Button key={k} size="sm" variant="outline" onClick={() => onAddEdge(k)}>
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
    // A ceiling item hung OVER a table (Placement.over): named here, centred, arranged in that
    // table's focus mode, and hung over other tables in a pattern — the table-item verbs, above.
    const overTable = p.layer === "ceiling" && p.over ? doc.tables.find((t) => t.id === p.over) : undefined;
    const shades = shadesOf(p.variantId);
    const drape = r?.anchor === "wall" ? p.span : undefined;
    const run = drape ? resolveSpan(structure, drape) : null;
    const stretch = r?.sizing === "stretch" && !drape;
    const size = p.sizeMm;
    const shade = shades.find((s) => s.id === p.variantId);
    // A flight or a ramp standing on its own — never one worn on a table or hung on a wall.
    const drawn = footprintBounds(placementFootprint(p));
    const drawnSize = { widthMm: drawn.w, depthMm: drawn.h };
    const climb = r && !table && !drape && onClimb ? itemClimbHost(r.product, drawnSize, p.climb) : null;
    const editClimb = (edit: ClimbEdit | null) => {
      if (edit && onClimb) onClimb(p.id, edit);
    };

    const bench = benchPanel?.layout;
    const benchNumber = benchPanel?.spec?.number;
    // A chair on the floor may be set out in ROWS (lib/design-document/chair-rows.ts); one that is,
    // is a block — its count is its rows, and the quantity stepper would only argue with them.
    const block = chairBlockOf(p);
    const rowsAllowed = !!onChairRows && r?.product.category === "chairs" && !table && !drape && !p.perch && !p.stage;
    return (
      <Bar
        icon={bench ? RectangleHorizontal : block ? Rows3 : Sparkles}
        title={bench ? (benchPanel?.numbered && benchNumber ? `בנקט ${benchNumber}` : "בנקט") : block ? "שורות כיסאות" : (r?.product.name ?? "פריט")}
        facts={[
          block ? `${p.quantity} כיסאות · ${block.spec.rows} שורות × ${block.spec.perRow}` : null,
          bench || block ? r?.product.name : LAYER_LABEL[p.layer],
          bench ? `${(bench.widthMm / 1000).toFixed(2)} מ׳` : null,
          bench && bench.seats > 0 ? `${bench.seats} מקומות ישיבה` : null,
          table ? tableLabel(doc, table) : null,
          overTable ? `מעל ${tableLabel(doc, overTable)}` : null,
          drape ? (run ? `${(run.lengthMm / 1000).toFixed(2)} מ׳ על הקיר` : "הקיר נמחק") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        onClose={onClose}
      >
        {/* A STANDALONE BANQUETTE is set like a table: its number (optional — clearing it leaves the
            banquette seated but unnumbered), its two sides and their counts, and its occupancy.
            Its row is still quoted by the metre; nothing here touches that. */}
        {bench && benchPanel && (
          <Popover label="מספר" icon={Hash} value={benchPanel.numbered && benchNumber ? ltr(`#${benchNumber}`) : "ללא"}>
            <PanelRow label="מספר" htmlFor="bench-number">
              {benchNumber !== undefined && <BarButton icon={Undo2} label="ללא מספר" onClick={() => onBench(p.id, { number: null })} />}
              <NumberField
                id="bench-number"
                aria-label="מספר הבנקט"
                decimals={0}
                min={0}
                value={benchNumber ?? 0}
                onChange={(v) => onBench(p.id, { number: v })}
                className="w-20"
              />
            </PanelRow>
            {benchPanel.numbered && benchNumber !== undefined && benchNumber > 0 && duplicateNumbers(doc, benchOf).has(benchNumber) && <DuplicateNumber />}
            <Note>
              {bench.seats > 0
                ? "בנקט שיושבים בו ממוספר כמו שולחן — במפת ההצבה ובמספור מחדש. בלי מספר הוא נשאר במניין המקומות בלבד."
                : "המספר יופיע כשיהיו מקומות ישיבה בבנקט."}
            </Note>
          </Popover>
        )}
        {bench && benchPanel && (
          <Popover label="ישיבה" icon={Armchair} value={bench.seats > 0 ? ltr(`${benchPanel.spec?.seated ?? 0}/${bench.seats}`) : "—"} panelClassName="w-[22rem]">
            <BenchSidesFields
              idPrefix="bench"
              back={{ ...bench.back, set: benchPanel.spec?.back?.seats !== undefined }}
              front={{ ...bench.front, set: benchPanel.spec?.front?.seats !== undefined }}
              backLabel="צד אחורי"
              frontLabel="צד קדמי"
              autoSeats={Math.floor(bench.widthMm / SEAT_WIDTH_MM)}
              heightMm={bench.heightMm}
              sofaHeightMm={bench.sofaHeightMm}
              heightNote="מהרצפה — שולחן לכיסאות שלצידו"
              onSide={(side, patch) => onBench(p.id, { [side]: patch })}
              onHeight={(mm) => onBench(p.id, { heightMm: mm })}
              onSofaHeight={(mm) => onBench(p.id, { sofaHeightMm: mm })}
            />
            {bench.seats > 0 && (
              <PanelRow label="תפוסה" htmlFor="bench-seated">
                <NumberField
                  id="bench-seated"
                  decimals={0}
                  min={0}
                  value={benchPanel.spec?.seated ?? 0}
                  onChange={(v) => onBench(p.id, { seated: v })}
                  className="w-20"
                />
                <span className={"text-xs " + occupancyInk(benchPanel.spec?.seated ?? 0, bench.seats)}>מתוך {bench.seats}</span>
              </PanelRow>
            )}
            <Note>
              הצד האחורי הוא הצד העליון של הבנקט כפי שהונח. כיסאות נספרים ונארזים כמו כיסאות שולחן; ספה נספרת במקומות הישיבה בלבד.
              אורך הבנקט נמתח בידיות שבתוכנית.
            </Note>
          </Popover>
        )}
        {/* A chair's rows: how many, how many in each, the gaps and an aisle — a single chair is one
            row of one, and typing more makes it a block. */}
        {rowsAllowed && onChairRows && r && (
          <ChairRowsPopover single rows={p.rows} chair={catalogBox(r.product)} onChange={(rows) => onChairRows(p.id, rows)} />
        )}
        {/* Inline, not behind a subject: how many of a thing there are is the one field on this bar
            that gets edited over and over while placing. (A block's count is its rows.) */}
        {!block && (
          <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="כמות">
            <BarButton icon={Minus} label="פריט אחד פחות" onClick={() => onQuantity(p.id, -1)} disabled={p.quantity <= 1} />
            <span className="nums w-5 text-center text-sm font-semibold text-ink">{p.quantity}</span>
            <BarButton icon={Plus} label="פריט אחד נוסף" onClick={() => onQuantity(p.id, 1)} />
          </div>
        )}

        {swap && <SwapPopover swap={swap} onSwap={onSwap} label="החלפה בפריט אחר" />}
        {onEditProduct && r && <BarButton icon={Pencil} label="עריכת הפריט בקטלוג" onClick={() => onEditProduct(p.variantId)} />}

        {shades.length > 0 && (
          <Popover label="גוון" leading={<Swatch color={shade?.swatch} size={14} />} value={shade?.name ?? "ברירת מחדל"}>
            {/* Colour never carries the meaning alone: the chosen shade's NAME is spelled out under
                the swatches, because two of a designer's creams look identical at 18px. */}
            <SwatchPicker options={shades} value={p.variantId} onChange={(v) => onVariant(p.id, v)} label="גוון הפריט" />
            <p className="mt-2 text-xs text-muted">{shade?.name ?? "ברירת מחדל"}</p>
          </Popover>
        )}

        {/* The vase or jug an arrangement stands in — packed and counted with it. */}
        {onVessel && r && takesVessel(r.product) && (
          <VesselPopover own={p.vessel} rowVessel={productVessel(r.product)} onVessel={(v) => onVessel([p.id], v)} />
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
        {/* A climb's size is not a drawing choice: its run follows the step it covers. */}
        {/* Not a block: its size is its rows, and its chairs are drawn at their real size. */}
        {!sizePanel && !stretch && !drape && !p.stage && !climb && !block && <ScalePopover scale={p.scale || 1} onScale={(v) => onScale(p.id, v)} />}
        {climb && r && (
          <ClimbPopover
            host={climb}
            onHeight={(mm) => editClimb(climbHeightEdit(p, r.product, drawnSize, mm))}
            onRisers={(n) => editClimb(climbRisersEdit(p, r.product, drawnSize, n))}
            onAccessible={() => editClimb(climbAccessibleEdit(p, r.product, drawnSize))}
            onReverse={() => editClimb(climbReverseEdit(p, r.product, drawnSize))}
          />
        )}
        {p.layer === "ceiling" && !drape && onHang && (
          <HangPopover own={p.hangHeightMm} fallback={hangHeightOf({}, r?.product)} onHang={(mm) => onHang(p.id, mm)} />
        )}
        {overTable && (
          <>
            {onCentreOver && <BarButton icon={Crosshair} label="למרכז השולחן — התלייה מעל אמצע השולחן" onClick={() => onCentreOver(p.id)} />}
            {onSpreadRow && (
              <RowSpreadPopover
                doc={doc}
                sourceId={overTable.id}
                name={r?.product.name ?? "הפריט"}
                heightMm={hangHeightOf(p, r?.product)}
                onSpread={(opts) => onSpreadRow(p.id, opts)}
              />
            )}
            {onHangOverDressing &&
              (() => {
                const dressed = doc.placements.filter((x) => {
                  if (x.layer !== "table" || x.tableId !== overTable.id) return false;
                  const rx = resolve(x.variantId);
                  return !!rx && rx.anchor !== "table" && !isRunner(rx.product);
                }).length;
                return dressed > 0 ? <BarButton icon={ArrowUpFromLine} label={`אחד מעל כל פריט שעל השולחן (${dressed})`} onClick={() => onHangOverDressing(p.id)} /> : null;
              })()}
            <Popover label="החלת הפריט מעל שולחנות" icon={LayoutGrid} value="דפוס" panelClassName="w-72">
              {renderPattern(overTable.id, p.id)}
            </Popover>
            {onDressTable && <BarButton icon={PaintRoller} label="עיצוב מעל השולחן — סידור ופיזור של מה שתלוי מעליו · לחיצה כפולה" onClick={() => onDressTable(overTable.id)} />}
          </>
        )}
        <BreachPopover breaches={breaches} />

        {/* A drape covers its whole wall by default; this puts it back after it was shortened. */}
        {drape && (
          <Popover label="על הקיר" icon={Maximize2} value={run ? `${(run.lengthMm / 1000).toFixed(2)} מ׳` : "—"}>
            <Button
              size="sm"
              variant="outline"
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
            {onDressTable && <BarButton icon={PaintRoller} label="עיצוב השולחן — הזזה וסידור של הפריטים עליו · לחיצה כפולה" onClick={() => onDressTable(table.id)} />}
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
      title={tableLabel(doc, t)}
      facts={[t.type, `${count} פריטים`].join(" · ")}
      onClose={onClose}
    >
      {/* F-3.3: auto-running numbering, editable per table */}
      <Popover label="מספר שולחן" icon={Hash} value={t.unnumbered ? "ללא" : ltr(`#${t.number}`)}>
        {!t.unnumbered && (
          <PanelRow>
            <NumberField
              id="table-number"
              aria-label="מספר שולחן"
              decimals={0}
              min={0}
              value={t.number}
              onChange={(v) => onRenumber(t.id, v)}
              className="w-20"
            />
          </PanelRow>
        )}
        {!t.unnumbered && t.number > 0 && duplicateNumbers(doc, benchOf).has(t.number) && <DuplicateNumber />}
        <div className="mt-2">
          <UnnumberedSwitch checked={!!t.unnumbered} onChange={(off) => onTablesNumbered([t.id], !off)} />
        </div>
        <Note>המספור רץ מאליו; מה שנקבע כאן גובר עליו, לשולחן הזה בלבד. 0 הוא שולחן הראש.</Note>
      </Popover>

      {swap?.kind === "tables" && <SwapPopover swap={swap} onSwap={onSwap} label="סוג שולחן" />}
      {onEditProduct && t.variantId && resolve(t.variantId) && <BarButton icon={Pencil} label="עריכת סוג השולחן בקטלוג" onClick={() => onEditProduct(t.variantId!)} />}

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
          <PanelRow label="כיסא" stack>
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
          <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onApplyToAllTables(cloth.id)}>
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
      {onDressTable && <BarButton icon={PaintRoller} label="עיצוב השולחן — הזזה וסידור של הפריטים עליו · לחיצה כפולה על השולחן" onClick={() => onDressTable(t.id)} />}
      <Popover label="עיצובים שמורים" icon={BookmarkPlus} value="עיצובים" panelClassName="w-72">
        {renderDesigns(t.id)}
      </Popover>
      {count > 0 && (
        <Popover label="החלת עיצוב השולחן על שולחנות" icon={LayoutGrid} value="דפוס" panelClassName="w-72">
          {renderPattern(t.id)}
        </Popover>
      )}
      {/* The table with everything on it, as a catalog item of its own — placed again, dressed, at
          the next event. */}
      {onSaveComposite && <BarButton icon={PackagePlus} label="שמירת השולחן עם העיצוב כפריט מורכב בקטלוג" onClick={onSaveComposite} />}

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

/** "6 כיסאות · 4 על ספה" — a banquette's seating in words, for a bar chip. */
function benchSeatsWord(chairSeats: number, sofaSeats: number): string {
  const parts = [chairSeats > 0 ? `${chairSeats} כיסאות` : null, sofaSeats > 0 ? `${sofaSeats} על ספה` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "ללא ישיבה";
}

/** A banquette's two long sides and two heights — the one fieldset both banquettes are set with
 *  (a stage's edge banquette and a standalone one), so the two cannot be edited differently.
 *
 *  Each side: what it is (chairs / sofa / none) and, unless bare, how many — typed, or one per 60cm
 *  with a way back to that. The TOP height belongs to a chairs side (it is their table); the SEAT
 *  height to a sofa side — each shown only while a side of its kind exists, since a height nobody
 *  sits at is a question with no answer. */
function BenchSidesFields({
  idPrefix,
  back,
  front,
  backLabel,
  frontLabel,
  autoSeats,
  heightMm,
  sofaHeightMm,
  heightNote,
  onSide,
  onHeight,
  onSofaHeight,
}: {
  idPrefix: string;
  back: BenchSideRow;
  front: BenchSideRow;
  backLabel: string;
  frontLabel: string;
  autoSeats: number;
  heightMm: number;
  sofaHeightMm: number;
  /** What the top height is measured from, in words. */
  heightNote: string;
  onSide: (side: "back" | "front", patch: BenchSidePatch) => void;
  onHeight: (mm: number) => void;
  onSofaHeight: (mm: number) => void;
}) {
  const cmOf = (mm: number) => Math.round(mm / 10);
  const side = (key: "back" | "front", row: BenchSideRow, label: string) => (
    <div className="space-y-2 rounded-md border border-inset-border bg-inset p-2.5">
      <Segmented label={label} value={row.kind} options={BENCH_SIDE_KINDS.map((k) => [k, BENCH_SIDE_LABEL[k]] as const)} onChange={(kind) => onSide(key, { kind })} />
      {row.kind !== "none" && (
        <PanelRow label={row.kind === "chairs" ? "כיסאות" : "מקומות על הספה"} htmlFor={`${idPrefix}-${key}-seats`}>
          {row.set && row.seats !== autoSeats && <BarButton icon={Undo2} label={`חזרה לאחד לכל 60 ס״מ (${autoSeats})`} onClick={() => onSide(key, { seats: null })} />}
          <NumberField id={`${idPrefix}-${key}-seats`} decimals={0} min={0} max={60} value={row.seats} onChange={(n) => onSide(key, { seats: n })} className="w-20" />
        </PanelRow>
      )}
    </div>
  );
  const hasChairs = back.kind === "chairs" || front.kind === "chairs";
  const hasSofa = back.kind === "sofa" || front.kind === "sofa";
  return (
    <div className="space-y-2">
      {side("back", back, backLabel)}
      {side("front", front, frontLabel)}
      {hasChairs && (
        <PanelRow label="גובה המשטח (ס״מ)" htmlFor={`${idPrefix}-h`}>
          <NumberField id={`${idPrefix}-h`} decimals={0} min={40} max={120} commitOnBlur value={cmOf(heightMm)} onChange={(cm) => onHeight(cm * 10)} className="w-20" />
          <span className="text-xs text-muted">{heightNote}</span>
        </PanelRow>
      )}
      {hasSofa && (
        <PanelRow label="גובה מושב הספה (ס״מ)" htmlFor={`${idPrefix}-sh`}>
          <NumberField id={`${idPrefix}-sh`} decimals={0} min={30} max={70} commitOnBlur value={cmOf(sofaHeightMm)} onChange={(cm) => onSofaHeight(cm * 10)} className="w-20" />
          <span className="text-xs text-muted">מהרצפה שהיושבים עומדים עליה</span>
        </PanelRow>
      )}
    </div>
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
function SaveTemplatePopover({ onSave, note }: { onSave: (name: string) => void; note?: string }) {
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
      <Note>{note ?? "הצורה, המפלסים, הקצוות, המשטח והעיצוב על הבנקטים נשמרים. במה מתבנית מוצבת מכלי ״מילוי במות״."}</Note>
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
        <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onSize(null)}>
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
/** "ללא מספור" — a table (or a block) the numbering passes by: a cocktail table, the gift table. */
function UnnumberedSwitch({ checked, onChange }: { checked: boolean; onChange: (unnumbered: boolean) => void }) {
  return (
    <SwitchRow
      checked={checked}
      onChange={onChange}
      label="ללא מספור"
      hint="שולחן שלא נכנס לספירה — אין לו מספר על התוכנית ועל המפה, והמספור מדלג עליו. הוא עדיין נספר בהצעת המחיר ובליקוט."
    />
  );
}

/** Another unit on the plan shows the same number — two table 4s the crew cannot tell apart. */
function DuplicateNumber() {
  return (
    <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-warn-ink">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      יש שולחן נוסף עם המספר הזה
    </p>
  );
}

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
        {mode === "direct" ? "נמדד מקצה לקצה, לאורך הקו בין המרכזים." : "נמדד בין קצוות הפריטים, לאורך הציר."} שולחן נמדד מקצה השולחן עצמו — בלי הכיסאות.
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

/** How high one ceiling item hangs above the floor — its own height on this plan, or its catalog
 *  row's when it has none (lib/studio/hang.ts). Printed beside it on the ceiling plan. */
/** "פיזור לאורך השורה" — N of a hung item strung from the first table of its row (or column) to
 *  the last, through every table's middle on the way (lib/studio/table-patterns.ts tableLine).
 *  The count starts at one per table. */
function RowSpreadPopover({
  doc,
  sourceId,
  name,
  heightMm,
  onSpread,
}: {
  doc: DesignDocumentContent;
  sourceId: string;
  name: string;
  heightMm?: number;
  onSpread: (opts: { axis: "row" | "column"; count: number; wave?: HeightWave | null }) => void;
}) {
  const [axis, setAxis] = useState<"row" | "column">("row");
  const [typed, setTyped] = useState<number | null>(null);
  const [waveOn, setWaveOn] = useState(false);
  const base = Math.round((heightMm ?? 3000) / 10);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  // A block in the row is one table of it (./dressing-units.ts), as the run itself reads it.
  const units = useMemo(() => unitsOf(doc), [doc]);
  const line = tableLine(patternUnits(units), unitOf(units, sourceId)?.key ?? sourceId, axis);
  const n = typed ?? Math.max(1, line.length);
  const aCm = a ?? base;
  const bCm = b ?? Math.max(30, base - 40);
  return (
    <Popover label="פיזור לאורך השורה" icon={AlignHorizontalDistributeCenter} value="לאורך השורה" panelClassName="w-72">
      <Segmented
        label="לאורך"
        value={axis}
        options={[
          ["row", "השורה"],
          ["column", "הטור"],
        ]}
        onChange={(v) => {
          setAxis(v);
          setTyped(null);
        }}
      />
      <PanelRow label="כמה" htmlFor="row-spread-count">
        <NumberField id="row-spread-count" aria-label="כמה" decimals={0} min={1} max={48} value={n} onChange={(v) => setTyped(Math.max(1, Math.min(48, Math.round(v))))} className="w-20" />
      </PanelRow>
      <Note>
        {line.length < 2
          ? `השולחן עומד לבדו ב${axis === "row" ? "שורה" : "טור"} שלו — אין קו למתוח לאורכו.`
          : `${n} × ${name} מהשולחן הראשון ב${axis === "row" ? "שורה" : "טור"} עד האחרון (${line.length} שולחנות), דרך אמצע כל שולחן, במרווחים שווים; הקצוות מעל שולחנות הקצה. כל אחד נקשר לשולחן שמתחתיו.`}
      </Note>
      <WaveFields on={waveOn} a={aCm} b={bCm} onOn={setWaveOn} onA={setA} onB={setB} />
      <Button size="sm" className="mt-2 w-full" disabled={line.length < 2} onClick={() => onSpread({ axis, count: n, wave: waveOf(waveOn, aCm, bCm) })}>
        {`פיזור ${n} לאורך ${axis === "row" ? "השורה" : "הטור"}`}
      </Button>
    </Popover>
  );
}

function HangPopover({ own, fallback, onHang }: { own?: number; fallback?: number; onHang: (mm: number | null) => void }) {
  const shown = own ?? fallback;
  return (
    <Popover label="גובה תלייה" icon={ArrowDownToLine} value={shown ? ltr(`${(shown / 1000).toFixed(2)} מ׳`) : "לא צוין"}>
      <PanelRow label="מהרצפה (ס״מ)" htmlFor="placement-hang">
        <NumberField
          id="placement-hang"
          decimals={0}
          min={0}
          max={HANG_MAX_MM / 10}
          hideZero
          placeholder={fallback ? String(Math.round(fallback / 10)) : "—"}
          value={own ? Math.round(own / 10) : 0}
          onChange={(v) => onHang(v > 0 ? v * 10 : null)}
          className="w-20"
        />
      </PanelRow>
      {own !== undefined && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => onHang(null)}>
          {fallback ? `חזרה לגובה מהקטלוג (${(fallback / 1000).toFixed(2)} מ׳)` : "ניקוי הגובה"}
        </Button>
      )}
      <Note>{own === undefined && fallback ? "הגובה מהקטלוג. " : ""}מודפס ליד הפריט בתוכנית התקרה — לא משפיע על המחיר או על רשימת הציוד.</Note>
    </Popover>
  );
}

/** A rented flight or ramp standing on its own: the step it covers, and what follows from it — the
 *  steps (≤18cm on 28cm treads) or the 1:12 run. The venue's own stairs ask the same questions in the
 *  same words (components/venue-inspector.tsx ClimbFields). A ramp steeper than 1:12 is said, in alert
 *  ink, with the one press that lays it back — never refused. */
function ClimbPopover({
  host,
  onHeight,
  onRisers,
  onAccessible,
  onReverse,
}: {
  host: ClimbHost;
  onHeight: (mm: number) => void;
  onRisers: (risers: number | undefined) => void;
  onAccessible: () => void;
  onReverse: () => void;
}) {
  const ramp = host.kind === "ramp";
  const steep = ramp && rampTooSteep(host);
  const risers = climbRisers(host);
  const derived = risersForRise(host.heightMm);
  const cm = (mm: number) => Math.round(mm / 10);
  const runM = (host.depthMm / 1000).toFixed(2);
  return (
    <Popover
      label={ramp ? "רמפה" : "מדרגות"}
      icon={ramp ? Accessibility : Footprints}
      tone={steep ? "warn" : "default"}
      value={ramp ? ltr(formatRatio(rampRatio(host)) || "—") : ltr(`${risers}×${cm(riserHeightMm(host))}`)}
    >
      <PanelRow label="הפרש גובה (ס״מ)" htmlFor="climb-height">
        <NumberField
          id="climb-height"
          decimals={0}
          min={0}
          max={600}
          step={5}
          commitOnBlur
          value={cm(host.heightMm)}
          onChange={(v) => onHeight(v * 10)}
          className="w-20"
        />
      </PanelRow>
      {!ramp && (
        <PanelRow label="מספר מדרגות" htmlFor="climb-risers">
          {risers !== derived && <BarButton icon={Undo2} label={`חזרה לאוטומטי (${derived})`} onClick={() => onRisers(undefined)} />}
          <NumberField id="climb-risers" decimals={0} min={1} max={MAX_RISERS} value={risers} onChange={(n) => onRisers(n)} className="w-20" />
        </PanelRow>
      )}
      {steep ? (
        <>
          <p className="text-xs font-semibold text-alert-ink">
            שיפוע <span dir="ltr">{formatRatio(rampRatio(host))}</span> — תלול מ־1:12 לרמפת נגישות.
          </p>
          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onAccessible}>
            התאמה ל־1:12
          </Button>
        </>
      ) : (
        <Note>
          {ramp
            ? `אורך ${runM} מ׳ בשיפוע ${formatRatio(rampRatio(host)) || "—"}.`
            : `מדרגה של ${cm(riserHeightMm(host))} ס״מ, עומק ${cm(treadDepthMm(host))} ס״מ · אורך ${runM} מ׳.`}{" "}
          האורך נגזר מהגובה, וראש העלייה נשאר במקומו.
        </Note>
      )}
      <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onReverse}>
        <ArrowDownUp className="h-3.5 w-3.5" strokeWidth={2} />
        היפוך כיוון העלייה
      </Button>
    </Popover>
  );
}

/** How big one item is drawn on this plan, as a percentage of its catalog size. A drawing size only:
 *  the quote, the packing list and the order still count it as the row it is. */
/** "כלי" — which vase or jug an arrangement stands in: the catalog's vessels (`vases`), each shade
 *  its own option, plus "as its catalog row" and "none on this plan". */
function VesselPopover({ own, rowVessel, onVessel }: { own: string | null | undefined; rowVessel?: string; onVessel: (v: string | null | undefined) => void }) {
  const ROW = "__row";
  const NONE = "__none";
  const choices = vesselChoices(loadProducts());
  const nameOf = (id?: string) => (id ? (choices.find((o) => o.value === id)?.label ?? resolve(id)?.label) : undefined);
  const current = own === null ? undefined : (own ?? rowVessel);
  const value = own === null ? NONE : own === undefined ? ROW : own;
  return (
    <Popover label="כלי" icon={Amphora} value={nameOf(current) ?? "ללא כלי"} panelClassName="w-80">
      {/* Typed to narrow, and listed INSIDE the panel — a Select's list dropped off the canvas card. */}
      <VesselPicker
        autoFocus
        value={value}
        onChange={(v) => onVessel(v === ROW ? undefined : v === NONE ? null : v)}
        choices={choices}
        lead={[
          { value: ROW, label: rowVessel ? `כמו בקטלוג — ${nameOf(rowVessel) ?? "כלי"}` : "כמו בקטלוג — ללא כלי" },
          { value: NONE, label: "ללא כלי" },
        ]}
      />
      <Note>
        {choices.length === 0
          ? "אין עדיין כלים בקטלוג — מוסיפים אותם בקטגוריה ״אגרטלים וכלים״."
          : "הכלי מצויר מתחת לסידור, נספר ונארז איתו. אפשר גם לגרור סידור אל כלי שכבר מונח על השולחן."}
      </Note>
    </Popover>
  );
}

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
