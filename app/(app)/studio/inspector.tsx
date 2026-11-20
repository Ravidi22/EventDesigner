"use client";

import { Fragment, useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
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
  Lock,
  LockOpen,
  RotateCcw,
  Scissors,
  Shirt,
  Frame,
  Zap,
  Sailboat,
  Waves,
} from "lucide-react";
import type { MirrorAxis } from "@/lib/design-document/mirror";
import type { Product, ResizeSpec } from "@/lib/catalog/types";
import { CATEGORY_BY_ID, isRunner } from "@/lib/catalog/categories";
import { tableLine } from "@/lib/studio/table-patterns";
import { patternUnits, unitOf, unitsOf } from "./dressing-units";
import { WaveFields, waveOf } from "./dressing-bar";
import type { HeightWave } from "@/lib/studio/hang-over";
import { ArrowUpFromLine } from "lucide-react";
import { Link2, Unlink } from "lucide-react";
import { coverTarget } from "@/lib/studio/cover";
import { formatDimensions } from "@/lib/catalog/format";
import { SearchInput } from "@/components/search-input";
import { ProductImage } from "../catalog/product-image";
import type { BenchSideKind, BenchSpec, ChairRows, DesignDocumentContent, DesignTable, Placement, WallSpan } from "@/lib/design-document/types";
import { ChairRowsPopover } from "@/components/chair-rows-popover";
import { MAX_PER_ROW, MAX_ROWS } from "@/lib/design-document/chair-rows";
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
import { Bar, BarButton, ModeVerb, Note, PanelRow, QuickLead, QuickNumber, QuickSep, QuickTail, QuickTurn, QuickUnit, ltr } from "@/components/inspector-bar";
import { PanelGroups, PanelListRow, PickRow, panelGroup as G, type PanelGroup } from "@/components/end-panel";
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
import { AlignMenu, alignItems, type AlignPanel } from "./align-menu";
import { LAYER_LABEL } from "@/lib/catalog/categories";
import { productVessel, takesVessel } from "@/lib/catalog/vessel";
import { borderOf, cleanBorder, takesBorder, type Border } from "@/lib/catalog/border";
import { BorderPanel } from "@/components/border-fields";
import { LedRailPopover } from "./led-popover";
import { isLedStrip } from "@/lib/venues/led";
import { fieldLabelClassName } from "@/components/control";
import { VesselPicker, vesselChoices } from "../catalog/vessel-picker";
import { loadProducts } from "@/lib/catalog/storage";
import { Amphora } from "lucide-react";
import { aisleOf, benchOf, chairBlockOf, coverOn, resolve, shadesOf, tableUtilization, type AisleView } from "@/lib/studio/catalog-resolver";
import { AISLE_PITCH_MAX_MM, AISLE_PITCH_MIN_MM, AISLE_PITCH_MM, aisleWords, type AislePlacement } from "@/lib/catalog/aisle";
import { AisleFields, AislePiecePicker, aislePieceChoices } from "../catalog/aisle-fields";
import { Route } from "lucide-react";
import { catalogBox } from "@/lib/studio/footprint";
import { chairOptions, defaultChair } from "@/lib/catalog/chairs";
import { duplicateNumbers, tableLabel } from "@/lib/design-document/groups";
import { SwitchRow } from "@/components/toggle";
import { CANTILEVER_MAX_MM, isRodRow, railLengthMm, railOf, ROD_MIN_MM, ROD_THICK_MAX_MM, ROD_THICK_MIN_MM, rodRunMm, rodThickMm, rodWithLength, rodWithThick, sketchRailContext, type Rail } from "@/lib/studio/rail";
import { clothKindOf, clothRuns, maxSagMm, RUN_SAG_MM, runEndHeight, runEndHeights, runLowestMm, sailSheet, withSag } from "@/lib/studio/ceiling-cloth";
import { CeilingClothPopover } from "./ceiling-cloth-bar";
import { arrangedStructure } from "@/lib/design-document/features";
import { ArrowDownToLine } from "lucide-react";
import { hangHeightOf, HANG_MAX_MM } from "@/lib/studio/hang";
import { ceilingUndersideMm } from "@/lib/scene/overhead";
import type { Point } from "@/lib/studio/hall";
import type { Selection, SelectionRef, SpinMode } from "./canvas-stage";
import type { DeckType, MissingPiece } from "@/lib/studio/stage-fill";
import type { PieceInfo } from "@/lib/studio/stage-rim";
import { MissingPieces, missingSummary } from "./missing-pieces";

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
//
// AND NOW IN TWO PLACES (2026-11-09, the user's "Studio + Halls" board, /halls' halls-selection.tsx
// first): the QUICK BAR at the canvas's foot — what it is, at most three numbers typed in place, one
// mode verb, then copy · delete · ⋯ — and the END PANEL's groups, every other field, folded under a
// title that reads its value back. The screen renders `Inspector` twice over one props object
// (`part`). The chips' fields moved into the groups as they were; a chip that was a picker (a type
// swap, a cloth) is a group's pick row opening the same list beside the panel. Every kind is asked in
// two places: the table and the block, the stage, a group of stages and a stage's edge item, a design
// item and a ceiling item, the special placements (a banquette, chair rows, a flight, a covered carpet,
// a rug, anything on a rail), several things, a group of design items and a venue feature. The one bar
// with no groups is the scope bar ("בחירה" — nothing selected, a zone or a plane worked in): it is a
// menu of ways to start a selection, and has no fields.
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

/** What the bar may change about one side of a banquette: what it is, how many sit there
 *  (`seats: null` = back to one per 60cm), and — a sofa — its run along the banquette and its seat
 *  depth (`null` = the whole length / the half strip). */
export type BenchSidePatch = { kind?: BenchSideKind; seats?: number | null; widthMm?: number | null; depthMm?: number | null };

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
  /** The step this stage's flights are built in (StageBuild.riserMm / treadMm, stairStepOf) — and
   *  whether the stage carries its own, or climbs by the defaults. */
  stairStep: { riserMm: number; treadMm: number; own: boolean };
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

/** Everything the selection's two parts are given — ONE object, built once by the screen and rendered
 *  twice (2026-11-09, the user's "Studio + Halls" board): `part="bar"` is the QUICK BAR at the canvas's
 *  foot, `part="groups"` the END PANEL's groups. Each kind's derived numbers live in one place. */
export type InspectorProps = {
  /** "bar" — the quick bar at the canvas's foot; "groups" — the end panel's groups. A kind not yet
   *  turned into groups renders its old bar for "bar" and nothing for "groups". */
  part: "bar" | "groups";
  /** The one thing being edited — null when nothing, or several things, are selected. */
  selection: Selection;
  /** How many things are selected in total. A group has no fields to show (a quantity stepper over
   *  six different products means nothing), so it gets the one bar that is still true of all of
   *  them: how many there are, and the way to remove them. */
  selectedCount: number;
  /** Set when the one selected thing is a VENUE feature rather than something in this document —
   *  the bar, a built stage, the pool. See lib/design-document/features.ts for what an event may say
   *  about one (where it stood it, and nothing else). */
  feature: { id: string; label: string; kind: FeatureKind; rotationDeg: number; moved: boolean; curtainSwap?: SwapPanel | null } | null;
  onResetFeature: (featureId: string) => void;
  /** The venue's curtain taken down for this event and a catalog curtain hung on its stretch
   *  instead (lib/venues/curtain.ts) — a drape placement, quoted and packed as any hired one. */
  onSwapCurtain: (featureId: string, productId: string) => void;
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
  /** How many TABLES are selected — what the bulk seat control applies to (a block counts once). */
  selectedTables: number;
  /** Every selected table, a block's members each — what several things' ״מפה״ and ״מראה״ reach. */
  selectedTableIds: string[];
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
  /** What is overhead at a point, as a height (lib/venues/roofs.ts) — a ceiling item with no height of
   *  its own or its row's shows where the room hangs it under that (lib/scene/overhead.ts). */
  roofOf?: (p: Point) => number | null;
  /** A ceiling item back over the middle of the table it hangs over. */
  onCentreOver?: (placementId: string) => void;
  /** N of a ceiling item strung along the row (or column) of tables its table stands in. */
  onSpreadRow?: (placementId: string, opts: { axis: "row" | "column"; count: number; wave?: HeightWave | null }) => void;
  /** One of a ceiling item above each item set out on the table it hangs over. */
  onHangOverDressing?: (placementId: string, wave?: HeightWave | null) => void;
  /** The vase an arrangement stands in (lib/catalog/vessel.ts): a variant, null = none, undefined =
   *  its catalog row's own. */
  onVessel?: (placementIds: string[], vessel: string | null | undefined) => void;
  /** A rug's or a cloth's contour on this plan (Placement.border, lib/catalog/border.ts): a contour,
   *  null = none here, undefined = its catalog row's again. Several ids: a block's cloths at once. */
  onBorder?: (placementIds: string[], border: Border | null | undefined) => void;
  /** An AISLE's own answers on this plan (lib/catalog/aisle.ts): a patch over what it carries; a
   *  field given as null goes back to its row's. */
  onAisle?: (placementIds: string[], patch: AislePatch) => void;
  /** A rented flight or ramp standing on its own: its rise, steps or direction, with the run that
   *  follows and where it now stands (lib/studio/climb-item.ts builds the edit). */
  onClimb?: (placementId: string, edit: ClimbEdit) => void;
  onApplyToAllTables: (placementId: string) => void;
  onVariant: (id: string, variantId: string) => void;
  onSpan: (id: string, span: WallSpan) => void;
  /** A drape's RAIL retyped from its bar (lib/studio/rail.ts) — the whole side, the other side of
   *  it, a rod's height or its ר — and its drop (null = to the floor). Absent = walls only (onSpan). */
  onRail?: (id: string, rail: Rail, dropMm?: number | null) => void;
  /** Draw this drape a new free-standing rod on the canvas ("וילון על מוט" — components/rod-draw-pane.tsx). */
  onDrawRod?: (id: string) => void;
  /** Take a curtain down off its rod and leave the rod standing — the placement becomes the studio's
   *  bare rod on the same rail (lib/studio/rail.ts isRodRow). Absent = the studio has no rod row. In
   *  the ״מסילה״ group of a curtain on a rod. */
  onBareRod?: (id: string) => void;
  /** Draw a sail or a ceiling drape again on the canvas — a sail tie by tie, a drape as a run or as an
   *  area (lib/studio/ceiling-cloth.ts). */
  onDrawCloth?: (id: string, kind: "sail" | "run" | "canopy") => void;
  onResize: (id: string, sizeMm: { widthMm: number; depthMm: number }) => void;
  /** A rug's curved sides (Placement.bows); null straightens them all. */
  onBows?: (id: string, bows: [number, number, number, number] | null) => void;
  /** A rug's rounded corners (Placement.corners), radius mm each; null squares them all. */
  onCorners?: (id: string, corners: [number, number, number, number] | null) => void;
  /** A carpet laid over a surface or a stage (Placement.cover, lib/studio/cover.ts): how far in from
   *  its edge it stops, mm. */
  onCoverInset?: (id: string, insetMm: number) => void;
  /** …and let go of it, its shape kept ("ניתוק מהמשטח"). */
  onDetachCover?: (id: string) => void;
  /** The stage bar's "…" rows that lay a carpet over THIS stage — one per catalog rug, and "שטיח
   *  מותאם…" (a new row of the studio's own). Empty / absent = none offered. */
  stageCoverItems?: MenuItem[];
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
  /** Whether the view cluster's zone chip is currently focused on one — "בחר הכל באזור" has nothing to
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
  /** Pin the selection where it stands, or free it (DesignTable.locked / Placement.locked) — the
   *  "…" row on every bar, Ctrl+Shift+L on the canvas. Null when nothing selected can be locked. */
  lock: LockPanel | null;
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
  /** The step the stage's flights are built in; null on a field = back to the default. */
  onStairStep: (step: { riserMm?: number | null; treadMm?: number | null }) => void;
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
  /** The clipboard (Ctrl+C / Ctrl+X) — the first rows of a converted kind's ⋯. The quick bar's copy
   *  button duplicates (onDuplicate); this copy can be pasted into another sketch. */
  onCopy?: () => void;
  onCut?: () => void;
  /** Select these instead — a row of a group that lists things (the items on a table). */
  onSelectItems?: (refs: SelectionRef[]) => void;
};

export function Inspector({
  part,
  selection,
  selectedCount,
  feature,
  onResetFeature,
  onSwapCurtain,
  facing,
  onFace,
  spin,
  onSpin,
  canRestack,
  onRestack,
  selectedTables,
  selectedTableIds,
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
  roofOf,
  onCentreOver,
  onSpreadRow,
  onHangOverDressing,
  onVessel,
  onBorder,
  onAisle,
  onClimb,
  onApplyToAllTables,
  onVariant,
  onSpan,
  onRail,
  onDrawRod,
  onBareRod,
  onDrawCloth,
  onResize,
  onBows,
  onCorners,
  onCoverInset,
  onDetachCover,
  stageCoverItems,
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
  lock,
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
  onStairStep,
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
  onCopy,
  onCut,
  onSelectItems,
}: InspectorProps) {
  // Several things' spacing axis: the quick bar's number measures along it, the ״מרווח״ group's
  // Segmented chooses it — two renders of this component, one choice (useSpacingAxis).
  const [spaceAxis, setSpaceAxis] = useSpacingAxis(spacing);

  const selectItems = selectionItems({ zoneFocused, onSelectInZone, layerActive, onSelectLayer, onSelectSimilar });
  const bar = part === "bar";
  /** A kind's groups in the end panel — open or closed as they were last left for this kind
   *  (lib/studio/panel-groups.ts), warn ones first. */
  const groupsOf = (kindKey: string, title: string, sub: string | undefined, groups: (PanelGroup | false | null | undefined)[], defaultOpen?: string[]) => (
    <PanelGroups kind={`studio:${kindKey}`} title={title} sub={sub} defaultOpen={defaultOpen} groups={groups.filter((g): g is PanelGroup => !!g)} />
  );
  /** A kind's ⋯: the clipboard first (Ctrl+C / Ctrl+X — the quick bar's copy button duplicates), then
   *  the kind's sections, flattened (flatSections). */
  const moreOf = (sections: MenuItem[][]) => flatSections([clipboardItems(onCopy, onCut), ...sections]);
  /** ״החלפה״ — the selection swapped for another catalog row, its pick row opening the list beside
   *  the panel. Several things' and a group of design items' (a table's and a block's sits in its
   *  ״שולחן״ group, a design item's in its ״פריט״). */
  const swapGroup = (label: string) => {
    if (!swap) return null;
    const current = swap.options.find((o) => o.id === swap.current);
    return G(
      "swap",
      Replace,
      "החלפה",
      current?.name ?? `${swap.count} ${swap.kind === "tables" ? "שולחנות" : "פריטים"}`,
      <SwapPickRow swap={swap} onSwap={onSwap} label={label} />,
    );
  };

  // A GROUP — the designer pushed these together and said they are one thing. For tables that means
  // one number for the lot, so the number field here edits the group and not any table inside it.
  // (A group made only of stages is a STAGE group — its own bar, below, with the stage tools.)
  if (group && !(selectedCount > 1 && stageGroup)) {
    const facts = countLine([
      [group.tables, "שולחן אחד", "שולחנות"],
      [group.items, "פריט אחד", "פריטים"],
      [group.seats, "כסא אחד", "כסאות"],
    ]);

    // A GROUP OF DESIGN ITEMS only — a lantern and its candles, two screens either side of a stage.
    // The quick bar turns it and takes it apart (its one verb); the ⋯ flips it, saves it as one
    // catalog item and locks it. Its group lists what it is made of, and swaps them for another row
    // when they are all of one kind.
    if (group.tables === 0) {
      if (bar)
        return (
          <Bar icon={Group} title="קבוצה" facts={facts} onClose={onClose}>
            <QuickTurn value={facing} onChange={onFace} />
            <QuickSep />
            <ModeVerb icon={Ungroup} label="פירוק הקבוצה" onClick={onUngroup} />
            <QuickTail
              onCopy={onDuplicate}
              copyLabel="שכפול הקבוצה"
              onDelete={onDelete}
              deleteLabel="מחיקת הקבוצה"
              more={moreOf([
                mirrorItems(onMirror),
                onSaveComposite ? [{ label: "שמירה כפריט מורכב בקטלוג", icon: PackagePlus, onSelect: onSaveComposite }] : [],
                lockItems(lock),
              ])}
              moreLabel="עוד פעולות לקבוצה"
            />
          </Bar>
        );
      const items = doc.placements.filter((p) => p.groupId === group.id);
      return groupsOf(
        "items-group",
        "קבוצה",
        facts,
        [
          swapGroup("החלפת הפריטים בקבוצה"),
          G(
            "members",
            Boxes,
            "פריטים בקבוצה",
            items.length === 1 ? "פריט אחד" : `${items.length} פריטים`,
            <>
              <TableItems items={items} />
              <Note>הקבוצה זזה, מסתובבת ומשוכפלת כיחידה אחת. ״פירוק הקבוצה״ בסרגל משחרר אותם — כל פריט נשאר במקומו.</Note>
            </>,
          ),
        ],
        ["members"],
      );
    }

    // A BLOCK of tables is one table — it is given what a table is given: its number and seats, its
    // cloth, its chair, its look, its saved designs and its pattern, each over every table of it at
    // once. The cloth shown is the first table's that has one; a change goes on them all. Its
    // members are listed (counted from the right, as the dressing bar counts them), and a member's
    // row opens the block's focus mode on that member (D13).
    const members = group.tableIds.map((id) => doc.tables.find((x) => x.id === id)).filter((x): x is DesignTable => !!x);
    const covers = members.map((m) => coverOn(doc, m.id)).filter((c): c is NonNullable<typeof c> => !!c);
    const blockCloth = covers[0];
    const blockVariant = members.length > 0 && members.every((m) => m.variantId && m.variantId === members[0].variantId) ? members[0].variantId : undefined;
    const blockChair = members.length > 0 && members.every((m) => (m.chairVariantId ?? "") === (members[0].chairVariantId ?? "")) ? (members[0].chairVariantId ?? "") : null;
    const blockDressed = doc.placements.some((p) => (p.layer === "table" && !!p.tableId && group.tableIds.includes(p.tableId)) || (p.layer === "ceiling" && !!p.over && group.tableIds.includes(p.over)));
    const lead = members[0];
    const title = group.unnumbered ? "שולחן ללא מספר" : group.number ? `שולחן ${group.number}` : group.number === 0 ? "שולחן ראש" : "קבוצה";
    const blockMore = moreOf([
      mirrorItems(onMirror),
      [
        ...(onEditProduct && blockVariant && resolve(blockVariant) ? [{ label: "עריכת סוג השולחנות בקטלוג", icon: Pencil, onSelect: () => onEditProduct(blockVariant) }] : []),
        ...(onSaveComposite ? [{ label: "שמירה כפריט מורכב בקטלוג", icon: PackagePlus, onSelect: onSaveComposite }] : []),
      ],
      lockItems(lock),
    ]);

    if (bar)
      return (
        <Bar icon={Group} title={title} facts={facts} onClose={onClose}>
          <NumberAndSeats
            number={group.number ?? 0}
            unnumbered={group.unnumbered}
            onNumber={(v) => onRenumberGroup(group.id, v)}
            seats={group.seats}
            onSeats={(v) => onGroupSeats(group.id, v)}
          />
          <QuickTurn value={facing} onChange={onFace} />
          <QuickSep />
          <ModeVerb icon={Ungroup} label="פירוק הבלוק" onClick={onUngroup} />
          <QuickTail onCopy={onDuplicate} copyLabel="שכפול הבלוק" onDelete={onDelete} deleteLabel="מחיקת הבלוק" more={blockMore} moreLabel="עוד פעולות לבלוק" />
        </Bar>
      );

    return groupsOf(
      "block",
      title,
      facts,
      [
        G(
          "members",
          Group,
          "שולחנות בבלוק",
          `${members.length} שולחנות`,
          <>
            <div className="-mx-1.5 flex flex-col gap-px">
              {members.map((m, i) => (
                <PanelListRow
                  key={m.id}
                  glyph={<TableIcon aria-hidden className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />}
                  label={`שולחן ${i + 1}`}
                  meta={m.type}
                  onClick={onDressTable ? () => onDressTable(m.id) : undefined}
                />
              ))}
            </div>
            {onDressTable && <Note>לחיצה על שולחן פותחת את עיצוב הבלוק — הזזה וסידור של הפריטים על כל הבלוק, עם השולחן הזה פעיל.</Note>}
          </>,
        ),
        G(
          "table",
          TableIcon,
          "שולחן",
          numberSummary(group.number ?? 0, !!group.unnumbered),
          <TableNumberFields
            idPrefix="group"
            swap={swap}
            swapLabel={swap?.kind === "tables" ? "סוג השולחנות בקבוצה" : "החלפת הפריטים בקבוצה"}
            onSwap={onSwap}
            number={group.number ?? 0}
            unnumbered={!!group.unnumbered}
            duplicate={!group.unnumbered && group.number !== undefined && group.number > 0 && duplicateNumbers(doc, benchOf).has(group.number)}
            onNumber={(v) => onRenumberGroup(group.id, v)}
            onUnnumbered={(off) => onTablesNumbered(group.tableIds, !off)}
            note="השולחנות נספרים כשולחן אחד, והכסאות מסודרים סביב הבלוק כולו."
          />,
        ),
        // One block, one chair count and one occupancy. What is typed here is spread back over the
        // tables underneath (chairs evenly; occupancy filling each to its own seat count, in order)
        // so that breaking the block up later leaves each table holding a number that is true of it.
        G(
          "seating",
          Armchair,
          "ישיבה",
          seatingSummary(group.seated, group.seats),
          <SeatingFields
            idPrefix="group"
            seats={group.seats}
            seated={group.seated}
            onSeats={(v) => onGroupSeats(group.id, v)}
            onSeated={(v) => onGroupSeated(group.id, v)}
            chair={blockChair}
            chairLabel="סוג הכיסא סביב הבלוק"
            onChair={onChairForSelection}
            note="הכסאות מסודרים סביב הבלוק כולו ומתחלקים בין השולחנות שבו; התפוסה ממלאת כל שולחן עד מלוא הכסאות שלו."
          />,
        ),
        !!blockCloth &&
          !!onBlockCloth &&
          G(
            "cloth",
            Shirt,
            "מפה",
            <ClothSummary cloth={blockCloth} />,
            <ClothFields
              cloth={blockCloth}
              options={clothOptions}
              onProduct={(productId) => onBlockCloth(group.tableIds, { productId })}
              onShade={(variantId) => onBlockCloth(group.tableIds, { variantId })}
              // Its contour — the first cloth's shown, a change hems every cloth of the block.
              onBorder={onBorder ? (b) => onBorder(covers.map((c) => c.id), b) : undefined}
              onAll={() => onApplyToAllTables(blockCloth.id)}
              onRemove={() => onBlockCloth(group.tableIds, "remove")}
              note={covers.length < members.length ? `${members.length - covers.length} מהשולחנות בבלוק בלי מפה — שינוי כאן חל על מי שיש לו. להלבשת כולם: גוררים מפה מהסרגל על הבלוק.` : undefined}
            />,
          ),
        // The block's design, as a table's: its saved designs, and its whole dressing onto other
        // tables in a pattern — a block landing on a block, a round or a rectangle at the same
        // relative places. The design pass's only.
        !!onDressTable && !!lead && G("designs", BookmarkPlus, "עיצובי שולחן", "שמירה והחלה", renderDesigns(lead.id)),
        !!onDressTable && !!lead && blockDressed && G("pattern", LayoutGrid, "דפוס", "החלה על שולחנות", renderPattern(lead.id, undefined, true)),
        !!lead && !!onStyleTables && tableLookGroup(lead, (style) => onStyleTables(group.tableIds, style)),
      ],
      ["members", "seating"],
    );
  }

  // SEVERAL STAGES — built by hand from pieces and grouped, or just selected together. They are meant
  // to be one platform, so the quick bar leads with making them one: only a single stage has stairs
  // on every edge, levels, a surface and one build. The bar asks the size the lot stands (read only —
  // an exact size is one stage's), one height for every stage and the angle; the groups carry what a
  // stage's own groups set, over every stage at once. Levels and single edge items stay with one
  // stage (select it, or merge first): a riser belongs to the platform it stands on.
  if (selectedCount > 1 && stageGroup) {
    const gm = (mm: number) => String(Math.round(mm / 10) / 100);
    const sg = stageGroup;
    const title = sg.grouped ? "במה מקובצת" : "במות";
    const facts = [
      `${sg.count} חלקים`,
      sg.heightMm ? `${Math.round(sg.heightMm / 10)} ס״מ` : sg.stages > 1 ? "גבהים שונים" : null,
      // A piece that is not yet a stage takes no height ("גובה כל הבמות" sets the stages) — said here,
      // where the height is read.
      sg.pieces === 1 ? "חלק אחד עדיין אינו במה" : sg.pieces > 1 ? `${sg.pieces} חלקים עדיין אינם במה` : null,
      sg.gapsMm > 0 ? `${gm(sg.gapsMm)} מ׳ שפה פתוחה` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    if (bar)
      return (
        <Bar icon={Grid2x2} title={title} facts={facts} onClose={onClose}>
          {/* How big the lot stands — read, not typed: an exact size is one stage's (its own bar,
              from ״במה בודדת״). */}
          {sg.whole && (
            <>
              <QuickLead icon={Ruler} label="מידות הקבוצה" />
              <span className="nums whitespace-nowrap text-[13px] font-semibold text-ink" title="הקבוצה כולה — מידה מדויקת בבחירת במה אחת">
                {ltr(`${gm(sg.whole.size.widthMm)}×${gm(sg.whole.size.depthMm)}`)}
              </span>
              <QuickUnit>מ׳</QuickUnit>
              <QuickSep />
            </>
          )}
          {/* Blank rather than a number when they differ; typing one sets every stage to it. */}
          {sg.stages > 0 && onGroupStageHeight && (
            <>
              <QuickLead icon={MoveVertical} label="גובה (ס״מ)" />
              <QuickNumber
                label="גובה כל הבמות (ס״מ)"
                narrow
                min={10}
                max={300}
                value={sg.heightMm ? Math.round(sg.heightMm / 10) : 0}
                hideZero
                placeholder="—"
                onChange={(cm) => cm > 0 && onGroupStageHeight(cm * 10)}
              />
              <QuickSep />
            </>
          )}
          <QuickTurn value={facing} onChange={onFace} />
          {onMergeStages && (
            <>
              <QuickSep />
              <ModeVerb icon={Combine} label="איחוד לבמה אחת" onClick={onMergeStages} />
            </>
          )}
          {/* The rest, in the "…": the clipboard, flipping, closing the gaps and lining up (one
              section), grouping and taking apart — apart from each other: "פירוק הקבוצה" lets go
              of the group, "פירוק לפלטות" turns every stage into loose decks — and the lock. */}
          <QuickTail
            onCopy={onDuplicate}
            copyLabel="שכפול הבמות"
            onDelete={onDelete}
            deleteLabel="מחיקת הבמות"
            more={moreOf([
              mirrorItems(onMirror),
              [
                ...(onStickStages ? [{ label: "הצמדה — סגירת הרווחים ויישור", icon: Magnet, onSelect: onStickStages }] : []),
                ...(align ? alignItems(align) : []),
              ],
              [sg.grouped ? { label: "פירוק הקבוצה", icon: Ungroup, onSelect: onUngroup } : { label: "קיבוץ · Ctrl+G", icon: Group, onSelect: onGroup }],
              sg.whole && onGroupExplode ? [{ label: "פירוק כל הבמות לפלטות נפרדות", icon: Blocks, onSelect: onGroupExplode }] : [],
              lockItems(lock),
            ])}
            moreLabel="עוד פעולות לבמות"
          />
        </Bar>
      );

    // A GROUP of stages carries the rest of a stage's groups, over all of them: how big the lot stands,
    // what it is built of (with the exceed switch on every member), its railing, a template per
    // member — and one member picked out for the tools that belong to ONE stage: levels, a flight on
    // a side, the outline, an exact size. A click on a member of the selected group does the same.
    const w = sg.whole;
    return groupsOf(
      "stages",
      title,
      facts,
      [
        sg.stages > 0 &&
          !!onGroupFillEdges &&
          G(
            "edges",
            Footprints,
            "קצוות",
            sg.gapsMm > 0 ? `${gm(sg.gapsMm)} מ׳ פתוחים` : w?.flights ? `${w.flights} מדרגות` : "סגור",
            // A group's edges, counted over every member — what the single stage's group lists.
            <EdgeFinishFields
              totals={
                w
                  ? {
                      flights: w.flights,
                      stairsMm: w.stairsMm,
                      benchMm: w.benchMm,
                      benchSeats: w.benchSeats,
                      barrierMm: w.barrierMm,
                      backdropMm: w.backdropMm,
                      ramps: w.ramps,
                      stairsCounted: w.stairsCounted,
                      benchCounted: w.benchCounted,
                      barrierCounted: w.barrierCounted,
                    }
                  : null
              }
              corners={
                w && onGroupStageCorners && (w.cornerCount > 0 || w.corners !== true)
                  ? { label: `פינות בין שתי ריצות — בכל הבמות${w.corners === undefined ? " (כרגע שונות)" : ""}`, value: w.corners, onChange: onGroupStageCorners }
                  : null
              }
              gapsMm={sg.gapsMm}
              gapLine={`${gm(sg.gapsMm)} מ׳ של שפה פתוחה בבמות שבקבוצה.`}
              closedLine="כל הצדדים הפתוחים סגורים."
              skirtMm={sg.skirtMm}
              onFill={onGroupFillEdges}
              note="צדדים שצמודים לבמה אחרת אינם פתוחים — במות שעומדות זו לצד זו באותו גובה הן משטח אחד. מדרגות או בנקט בודדים מוסיפים בבחירת במה אחת."
            />,
            sg.gapsMm > 0,
          ),
        sg.stages > 0 &&
          !!onGroupStageSurface &&
          G(
            "surface",
            Layers2,
            "משטח",
            surfaceName(sg.surface, sg.surfaceOptions),
            <SurfaceFields
              value={sg.surface}
              options={sg.surfaceOptions}
              onPick={onGroupStageSurface}
              pickerLabel="מה מכסה את הבמות"
              note={`אותו משטח על כל הבמות בקבוצה (${gm(sg.areaMm2 / 1000)} מ״ר).`}
            />,
          ),
        !!w &&
          G(
            "size",
            Ruler,
            "מידות",
            ltr(`${gm(w.size.widthMm)}×${gm(w.size.depthMm)} מ׳`),
            <Note>
              {`הקבוצה כולה תופסת ${gm(w.size.widthMm)}×${gm(w.size.depthMm)} מ׳ — ${sg.count} חלקים. `}
              מידה מדויקת לבמה אחת, מפלסים, מדרגות בצד ועריכת הצורה — בלחיצה על אותה במה בתוך הקבוצה, או ב״במה בודדת״ כאן.
            </Note>,
          ),
        !!w &&
          G(
            "built",
            Blocks,
            "בנויה מ",
            `${w.deckCount} פלטות`,
            <BuiltFromFields
              decks={w.decks}
              skirtMm={sg.skirtMm}
              skirtCounted={w.skirtCounted}
              exceed={w.exceed}
              exceedLabel={`פלטה שעוברת את הקו — בכל הבמות${w.exceed === undefined ? " (כרגע שונות)" : ""}`}
              onExceed={onGroupStageExceed}
              empty="אף פלטה לא נכנסת — אולי הפלטות שנבחרו נמחקו מהקטלוג."
              note={
                <>
                  {w.coverage < 0.995 ? `הפלטות מכסות ${Math.floor(w.coverage * 100)}% מהרצפה המסומנת. ` : ""}
                  כל במה בקבוצה מחושבת מהפלטות שלה; הצעת המחיר ורשימת הציוד סופרות את כולן, את המדרגות ואת מטרי החצאית.
                </>
              }
            />,
          ),
        !!w &&
          w.railingMm !== null &&
          w.railingMm > 0 &&
          G(
            "railing",
            Fence,
            "מעקה",
            ltr(`${gm(w.railingMm)} מ׳`),
            <Note>
              לפי הכלל שנקבע בהגדרות (מעל {Math.round((w.railingAboveMm ?? 0) / 10)} ס״מ), צריך מעקה בצדדים הפתוחים של הבמות
              בקבוצה, המסומנים בקו מנוקד. החזית לא מסומנת לעולם.
            </Note>,
            true,
          ),
        !!w &&
          !!onGroupSaveTemplate &&
          G(
            "template",
            BookmarkPlus,
            "תבנית",
            "שמירה",
            <SaveTemplateFields
              onSave={onGroupSaveTemplate}
              note={`תבנית היא במה אחת: כל אחת מ־${w.members.length} הבמות בקבוצה נשמרת כתבנית משלה, בשם הזה וממוספרת. במה מתבנית מוצבת מכלי ״מילוי במות״.`}
            />,
          ),
        !!w &&
          !!onPickStage &&
          G(
            "members",
            Grid2x2,
            "במה בודדת",
            `${w.members.length} במות`,
            <>
              <div className="-mx-1.5 flex flex-col gap-px">
                {w.members.map((mbr) => (
                  <PanelListRow
                    key={mbr.id}
                    glyph={<Grid2x2 aria-hidden className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />}
                    label={mbr.label}
                    meta={mbr.size ? ltr(mbr.size) : undefined}
                    onClick={() => onPickStage(mbr.id)}
                  />
                ))}
              </div>
              <Note>בחירת במה אחת מתוך הקבוצה — לסרגל ולקבוצות שלה: מפלסים, מדרגות בצד, עריכת הפלטות ומידות. ״חזרה לקבוצת הבמות״ בסרגל שלה, או Esc.</Note>
            </>,
          ),
      ],
      ["edges", "members"],
    );
  }

  // SEVERAL THINGS — a rubber band across the room, Ctrl+A, a handful picked one by one. The quick bar
  // turns them (each about its own centre), lines them up by one of them (יישור), sets the air
  // between them (מרווח — measured along the axis the ״מרווח״ group holds) and makes them one (קיבוץ,
  // the verb); the ⋯ holds the rarer verbs. The groups carry what can be said of all of them at once:
  // another catalog row, chairs round every table, a copied table's dressing, the tables' cloths and
  // look, and what the canvas's rotate handle does with them.
  if (selectedCount > 1) {
    const title = `${selectedCount} פריטים נבחרו`;
    const facts = "גרירה מזיזה את כולם יחד";
    if (bar) {
      // Equal air between things along whichever axis the selection spans more — the two ends stay
      // put. Only where the align menu does not already offer it (it spreads along either axis once
      // there are three units); left out, not disabled, when something has no free position to move.
      const distribute: MenuItem[] = canDistribute && !(align && align.units >= 3) ? [{ label: "פיזור אחיד", icon: AlignHorizontalDistributeCenter, onSelect: onDistribute }] : [];
      const gap = spacing ? spacingGap(spacing, spaceAxis) : null;
      return (
        <Bar icon={Boxes} title={title} facts={facts} onClose={onClose}>
          <QuickTurn value={facing} onChange={onFace} />
          {align && (
            <>
              <QuickSep />
              <AlignMenu align={align} trigger="chip" />
            </>
          )}
          {/* "1.5m between them" — typed, rather than nudged until the tape agrees. Blank when the
              gaps differ along that axis, or the things overlap on it. */}
          {spacing && (
            <>
              <QuickSep />
              <QuickLead icon={MoveHorizontal} label={`מרווח — ${SPACING_AXIS_LABEL[spaceAxis]}`} />
              <QuickNumber
                label="מרווח בין הפריטים (ס״מ)"
                min={0}
                value={gap !== null && gap >= 0 ? cm(gap) : 0}
                hideZero={gap === null || gap < 0}
                placeholder="—"
                onChange={(v) => onSpace(v * 10, spaceAxis)}
              />
              <QuickUnit>ס״מ</QuickUnit>
            </>
          )}
          <QuickSep />
          <ModeVerb icon={Group} label="קיבוץ" title="קיבוץ לקבוצה אחת · Ctrl+G" onClick={onGroup} />
          {/* The rest, in the "…": the clipboard, flipping, the floor stack, ways to grow the
              selection, spreading evenly and — stages among them — closing the gaps or merging them
              into one platform (so the skirt and stairs are worked out for the whole, not for the
              parts, which would skirt the seam between them), saving the lot as one catalog item, and
              the lock. */}
          <QuickTail
            onCopy={onDuplicate}
            copyLabel="שכפול הנבחרים"
            onDelete={onDelete}
            deleteLabel="מחיקת הנבחרים"
            more={moreOf([
              mirrorItems(onMirror),
              stackItems(canRestack, onRestack),
              selectItems,
              [
                ...distribute,
                ...(onStickStages ? [{ label: "הצמדת הבמות — סגירת הרווחים ויישור", icon: Magnet, onSelect: onStickStages }] : []),
                ...(onMergeStages ? [{ label: "איחוד הבמות לבמה אחת", icon: Combine, onSelect: onMergeStages }] : []),
              ],
              onSaveComposite ? [{ label: "שמירה כפריט מורכב בקטלוג", icon: PackagePlus, onSelect: onSaveComposite }] : [],
              lockItems(lock),
            ])}
            moreLabel="עוד פעולות לנבחרים"
          />
        </Bar>
      );
    }

    // The selected tables' cloths, as a block's: the first one shown, a change reaching every one.
    const tables = selectedTableIds.map((id) => doc.tables.find((t) => t.id === id)).filter((t): t is DesignTable => !!t);
    const covers = tables.map((t) => coverOn(doc, t.id)).filter((c): c is NonNullable<typeof c> => !!c);
    const mixedCloths = covers.some((c) => resolve(c.variantId)?.product.id !== resolve(covers[0].variantId)?.product.id);
    const lead = tables[0];
    return groupsOf(
      "multi",
      title,
      facts,
      [
        swapGroup(swap?.kind === "tables" ? "סוג השולחנות שנבחרו" : "החלפת הפריטים שנבחרו"),
        // One number of chairs over the whole selection. A room of forty tables going from ten places
        // to twelve used to be forty trips through this inspector. Occupancy is deliberately not
        // here: how many seats a table HAS is the same across a room, how many are taken is a
        // different fact per table.
        selectedTables > 1 &&
          G("seating", Armchair, "ישיבה", `${selectedTables} שולחנות`, <BulkSeatsFields count={selectedTables} onSeats={onSeatsForSelection} onChair={onChairForSelection} />),
        // One table's whole dressing, worn onto the rest of this selection — the bulk form of "החל על
        // כל שולחנות X", for whatever tables happen to be selected. Offered only once there is
        // somewhere for it to land.
        dressCandidateCount > 0 &&
          G("copy-design", Sparkles, "העתקת עיצוב", `${dressCandidateCount} שולחנות`, <CopyDressingFields count={dressCandidateCount} onApply={onCopyDressing} />),
        covers.length > 0 &&
          !!onBlockCloth &&
          G(
            "cloth",
            Shirt,
            "מפה",
            <ClothSummary cloth={covers[0]} />,
            <ClothFields
              cloth={covers[0]}
              options={clothOptions}
              onProduct={(productId) => onBlockCloth(selectedTableIds, { productId })}
              onShade={(variantId) => onBlockCloth(selectedTableIds, { variantId })}
              onBorder={onBorder ? (b) => onBorder(covers.map((c) => c.id), b) : undefined}
              onAll={() => onApplyToAllTables(covers[0].id)}
              onRemove={() => onBlockCloth(selectedTableIds, "remove")}
              note={
                [
                  mixedCloths ? "המפות בבחירה שונות — מוצגת הראשונה, ושינוי כאן חל על כולן." : null,
                  covers.length < tables.length
                    ? `${tables.length - covers.length} מהשולחנות שנבחרו בלי מפה — שינוי כאן חל על מי שיש לו. להלבשת כולם: גוררים מפה מהסרגל על כל שולחן.`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            />,
          ),
        !!spacing &&
          G(
            "spacing",
            MoveHorizontal,
            "מרווח",
            `${spacingWords(spacingGap(spacing, spaceAxis))} · ${SPACING_AXIS_LABEL[spaceAxis]}`,
            <SpacingFields key={spacing.key} spacing={spacing} axis={spaceAxis} onAxis={setSpaceAxis} onSpace={onSpace} />,
          ),
        // What the rotate HANDLE does over several things — swing the lot about one shared centre (a
        // block aimed at the room), or turn each where it stands (twelve tables scattered across a
        // hall, which would otherwise all orbit the middle of the room). Set once per selection.
        G("spin", Orbit, "סיבוב", SPIN_LABEL[spin], <SpinFields spin={spin} onSpin={onSpin} />),
        !!lead && !!onStyleTables && tableLookGroup(lead, (style) => onStyleTables(selectedTableIds, style)),
      ],
      ["seating", "spacing"],
    );
  }

  // Nothing is selected, but there is still something to select FROM — the view cluster's zone chip or
  // the active plane. Without this the commands would be reachable only after something was already
  // picked, which defeats the one that is meant to start a selection from a bare canvas.
  //
  // It stays up for exactly as long as the zone chip or the active plane is on, says what is holding
  // it open, and its ✕ turns those off. A menu of ways to start a selection, no fields — so no groups.
  if (selectedCount === 0 && (zoneFocused || layerActive)) {
    if (!bar) return null;
    return (
      <Bar icon={ListChecks} title="בחירה" facts={scopeLabel} onClose={onClearScope}>
        <Menu label="דרכים לבחור" side="top" items={selectionItems({ zoneFocused, onSelectInZone, layerActive, onSelectLayer })} />
      </Bar>
    );
  }

  if (!selection) return null;

  // A VENUE FEATURE. Everything asked here is a placement of it for tonight and nothing more: no
  // size, no name. Those are the property's, measured once at /halls, and an event that could edit
  // them would be editing every other event held in the same room. The quick bar turns it and puts it
  // back where the venue has it (the verb, idle until it was moved); its delete is tonight's too —
  // the bar wheeled out for this event (FeaturePlacement.removed); the venue keeps it, and the
  // panel's "פריטי מתחם שהוסרו" brings it back. A curtain or an LED strip hangs on its wall: nothing
  // to turn or put back. A curtain's group swaps it for one of the catalog's.
  if (selection.kind === "feature") {
    if (!feature) return null;
    const pinned = feature.kind === "curtain" || feature.kind === "led";
    const name = feature.label || FEATURE_KIND_LABEL[feature.kind];
    const facts = `${FEATURE_KIND_LABEL[feature.kind]} · תוכנית המתחם`;
    if (bar)
      return (
        <Bar icon={Building2} title={name} facts={facts} onClose={onClose}>
          {!pinned && (
            <>
              <QuickTurn value={facing} onChange={onFace} />
              <QuickSep />
              <ModeVerb
                icon={Undo2}
                label="החזרה למקום"
                disabled={!feature.moved}
                title={feature.moved ? "החזרה למקום שבתוכנית המתחם" : "נמצא במקומו בתוכנית המתחם"}
                onClick={() => onResetFeature(feature.id)}
              />
            </>
          )}
          <QuickTail onDelete={onDelete} deleteLabel="הסרה מהסקיצה של האירוע הזה" />
        </Bar>
      );
    const curtainSwap = feature.kind === "curtain" ? (feature.curtainSwap ?? null) : null;
    return groupsOf(
      "feature",
      name,
      facts,
      [
        G(
          "venue",
          Info,
          "פריט של המתחם",
          pinned ? "תלוי על הקיר" : feature.moved ? "הוזז לאירוע הזה" : "במקומו בתוכנית",
          <Note>
            {pinned
              ? `תלוי על הקיר של המתחם — לא זז ולא מסתובב. אפשר להסיר אותו${feature.kind === "curtain" ? " או להחליף אותו בווילון מהקטלוג" : ""} לאירוע הזה בלבד; `
              : "אפשר להזיז, לסובב ולהסיר אותו לאירוע הזה בלבד; "}
            הגודל והמקום הקבוע נקבעים במסך האולמות, ואירועים אחרים באותו מתחם לא מושפעים. פריט שהוסר חוזר מ״פריטי מתחם שהוסרו״ בלוח, כשדבר אינו נבחר.
          </Note>,
        ),
        !!curtainSwap &&
          G(
            "curtain",
            Replace,
            "החלפה בווילון",
            `${curtainSwap.options.length} בקטלוג`,
            <>
              <SwapPickRow swap={curtainSwap} onSwap={(productId) => onSwapCurtain(feature.id, productId)} label="החלפה בווילון מהקטלוג" current={{ name, meta: "הווילון של המתחם" }} />
              <Note>הווילון של המתחם יורד לאירוע הזה, ווילון מהקטלוג נתלה באותו קטע — מתומחר ונארז כמו כל וילון שמזמינים. הווילון המקורי חוזר מ״פריטי מתחם שהוסרו״.</Note>
            </>,
          ),
      ],
      ["venue", "curtain"],
    );
  }

  if (selection.kind === "placement") {
    const p = doc.placements.find((x) => x.id === selection.id);
    if (!p) return null;

    // A STAGE. One thing on the plan, and the bar says what it is built of — which is the whole
    // point of it being one thing: the designer works with "the stage", and the decks are the
    // stage's business (lib/design-document/stage.ts). The quick bar asks its size (a rectangle's,
    // or the box a round or shaped stage scales by), its height and its angle, and offers עריכת
    // הפלטות; every other field is a group — what is wrong first (open edges, pieces the catalog
    // lacks, a safety distance, a railing), then what it is built of, how high, what covers it, and
    // saving it as a template.
    if (p.stage && stagePanel) {
      const m = (mm: number) => String(Math.round(mm / 10) / 100);
      const cmOf = (mm: number) => Math.round(mm / 10);
      const sp = stagePanel;
      const it = sp.activeEdge;

      // ONE EDGE ITEM, picked on the plan or just clicked onto a side from ״קצוות״. Its quick bar
      // asks its width and its steps (a banquette: its seats); its ✕ goes back to the stage, as Esc
      // does. What it is, where it stands, how much of the side it takes, and its steps or its two
      // sides are groups.
      if (it) {
        const label = EDGE_KIND_LABEL[it.kind];
        const edgeFacts = [
          it.side,
          it.inner ? (it.kind === "stairs" ? "שקועות בבמה" : "על הבמה") : null,
          it.full ? "כל הצד" : `${cmOf(it.widthMm)} ס״מ`,
          it.kind === "bench" ? `${it.seats} מקומות ישיבה` : null,
          it.kind === "bench" && it.sofaSeats > 0 ? `${it.sofaSeats} על ספה` : null,
          it.kind === "ramp" ? `אורך ${m(it.depthMm)} מ׳` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        // A banquette's seats, typed in the bar: the first side anybody sits on — the stage side, else
        // the room side. Both sides, and a sofa's own size, are its ״בנקט״ group.
        const seatSide = it.kind !== "bench" ? null : it.back.kind !== "none" ? "back" : it.front.kind !== "none" ? "front" : null;
        if (bar)
          return (
            <Bar icon={EDGE_KIND_ICON[it.kind]} title={label} facts={edgeFacts} onClose={() => onSelectEdge(null)}>
              {/* "The whole side" is the ״רוחב״ group's — while it is on, the width is the side's. */}
              <QuickLead icon={MoveHorizontal} label="רוחב" />
              <QuickNumber label="רוחב (ס״מ)" narrow min={30} max={3000} disabled={it.full} value={cmOf(it.widthMm)} onChange={(cm) => onStairChange(it.id, { widthMm: cm * 10 })} />
              <QuickUnit>ס״מ</QuickUnit>
              {it.kind === "stairs" && (
                <>
                  <QuickSep />
                  <QuickLead icon={Footprints} label="מספר מדרגות" />
                  <QuickNumber label="מספר מדרגות" narrow min={1} max={20} value={it.risers} onChange={(n) => onStairChange(it.id, { risers: n })} />
                </>
              )}
              {seatSide && (
                <>
                  <QuickSep />
                  <QuickLead icon={Armchair} label={seatSide === "back" ? "מושבים בצד הבמה" : "מושבים בצד האולם"} />
                  <QuickNumber
                    label={seatSide === "back" ? "מושבים בצד הבמה" : "מושבים בצד האולם"}
                    narrow
                    min={0}
                    max={60}
                    value={it[seatSide].seats}
                    onChange={(n) => onStairChange(it.id, seatSide === "back" ? { back: { seats: n } } : { front: { seats: n } })}
                  />
                </>
              )}
              {/* No copy: a second flight is clicked onto a side from the stage's ״קצוות״. */}
              <QuickTail onDelete={() => onRemoveStair(it.id)} deleteLabel={`מחיקת ה${label}`} />
            </Bar>
          );
        return groupsOf(
          "edge",
          label,
          edgeFacts,
          [
            G(
              "kind",
              Grid2x2,
              "סוג",
              label,
              <>
                <Segmented label="מה עומד בצד הזה" value={it.kind} options={EDGE_KINDS.map((k) => [k, EDGE_KIND_LABEL[k]] as const)} onChange={(kind) => onStairChange(it.id, { kind })} />
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
              </>,
            ),
            (it.kind === "stairs" || it.kind === "bench") &&
              G(
                "place",
                Layers2,
                "מיקום",
                it.inner ? "פנימי" : "חיצוני",
                <>
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
                        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => onStairChange(it.id, { inner: true })}>
                          {it.kind === "stairs" ? "להעביר לתוך הבמה" : "להעמיד על הבמה"}
                        </Button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-ink">
                      {it.inner ? "בתוך הבמה." : "מחוץ לבמה."} {it.innerFits || it.inner ? "" : it.kind === "stairs" ? "אי אפשר לשקוע מדרגות בצד הזה." : ""}
                    </p>
                  )}
                  <Note>
                    {it.kind === "stairs"
                      ? "מדרגות פנימיות שקועות בתוך קו הבמה — עולים מהרצפה בשפה, והפלטות מונחות סביבן. זו הדרך היחידה למדרגות בצד שקרוב לקיר."
                      : "בנקט פנימי עומד על הבמה לאורך השפה, והכיסאות שלו מאחוריו, פונים החוצה."}
                  </Note>
                </>,
                !it.inner && !it.outerFits,
              ),
            G(
              "width",
              MoveHorizontal,
              "רוחב",
              it.full ? "כל הצד" : `${cmOf(it.widthMm)} ס״מ`,
              <>
                <Segmented
                  label="רוחב"
                  value={it.full ? "full" : "set"}
                  options={[
                    ["set", "לפי מידה"],
                    ["full", "כל הצד"],
                  ] as const}
                  onChange={(v) => onStairChange(it.id, { full: v === "full" })}
                />
                <Note>את המידה מקלידים בסרגל. אפשר גם לגרור את הקצוות בתוכנית, ואת הפריט כולו לאורך הצד.</Note>
              </>,
            ),
            it.kind === "stairs" &&
              G(
                "steps",
                Footprints,
                "מדרגות",
                ltr(`${it.risers}×${cmOf(it.riserMm)}`),
                <>
                  <PanelRow label="מספר מדרגות" htmlFor="edge-r">
                    {it.manual && it.risers !== it.autoRisers && <BarButton icon={Undo2} label={`חזרה לאוטומטי (${it.autoRisers})`} onClick={() => onStairChange(it.id, { risers: null })} />}
                    <NumberField id="edge-r" decimals={0} min={1} max={20} value={it.risers} onChange={(n) => onStairChange(it.id, { risers: n })} className="w-20" />
                  </PanelRow>
                  {it.riserMm > 200 && <p className="text-xs text-alert-ink">מדרגה של {cmOf(it.riserMm)} ס״מ גבוהה לעלייה — כדאי להוסיף מדרגה.</p>}
                </>,
                it.riserMm > 200,
              ),
            it.kind === "bench" &&
              G(
                "bench",
                RectangleHorizontal,
                "בנקט",
                benchSeatsWord(it.chairSeats, it.sofaSeats),
                <>
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
                    lengthMm={it.widthMm}
                    depthMm={it.depthMm}
                    onSide={(side, patch) => onStairChange(it.id, { [side]: patch })}
                    onHeight={(mm) => onStairChange(it.id, { heightMm: mm })}
                    onSofaHeight={(mm) => onStairChange(it.id, { sofaHeightMm: mm })}
                  />
                  <PanelRow label="עומק (ס״מ)" htmlFor="edge-d">
                    <NumberField id="edge-d" decimals={0} min={25} max={150} commitOnBlur value={cmOf(it.depthMm)} onChange={(cm) => onStairChange(it.id, { depthMm: cm * 10 })} className="w-20" />
                  </PanelRow>
                  <Note>
                    {it.dressed > 0 ? `${it.dressed} פריטי עיצוב על הבנקט. ` : ""}
                    גררו פרחים, נרות ופמוטים מהקטלוג אל הבנקט — הם מתפרסים לאורכו ונספרים ברשימת הציוד.
                  </Note>
                </>,
              ),
          ],
          ["kind", "place"],
        );
      }

      const size = sp.size;
      const facts = [
        // A string, not ltr(): the title row is text, and an element in it printed "[object Object]".
        size ? `${iso(`${m(size.widthMm)}×${m(size.depthMm)}`)} מ׳` : null,
        `${cmOf(sp.heightMm)} ס״מ`,
        `${sp.deckCount} פלטות`,
        sp.coverage < 0.995 ? `כיסוי ${Math.floor(sp.coverage * 100)}%` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      if (bar)
        return (
          <Bar icon={Grid2x2} title="במה" facts={facts} onClose={onClose}>
            {/* One stage picked out of its group: its own bar, with the group a click away. */}
            {onBackToGroup && (
              <>
                <BarButton icon={ArrowRight} label="חזרה לקבוצת הבמות · Esc" onClick={onBackToGroup} />
                <QuickSep />
              </>
            )}
            {/* Its size — a rectangle's, or the box a round or shaped stage is scaled by. The back
                holds where it stands and the front moves (setStageSize); an outline of any other
                shape has no one size, and is reshaped in עריכת הפלטות. */}
            {size && (
              <>
                <QuickLead icon={Ruler} label="מידות (ס״מ)" />
                <QuickNumber label="רוחב הבמה (ס״מ)" min={10} max={6000} value={cmOf(size.widthMm)} onChange={(cm) => onStageSize({ widthMm: Math.round(cm * 10), depthMm: size.depthMm })} />
                <QuickUnit>×</QuickUnit>
                <QuickNumber label="עומק הבמה (ס״מ)" min={10} max={6000} value={cmOf(size.depthMm)} onChange={(cm) => onStageSize({ widthMm: size.widthMm, depthMm: Math.round(cm * 10) })} />
                <QuickSep />
              </>
            )}
            <QuickLead icon={MoveVertical} label="גובה (ס״מ)" />
            <QuickNumber label="גובה הבמה (ס״מ)" narrow min={10} max={300} value={cmOf(sp.heightMm)} onChange={(cm) => onStageHeight(cm * 10)} />
            <QuickSep />
            <QuickTurn value={facing} onChange={onFace} />
            <QuickSep />
            <ModeVerb icon={PenLine} label="עריכת הפלטות" onClick={onEditStage} />
            {/* Taking it apart into loose decks is one way, so it is a row in the "…", not a verb
                beside עריכת הפלטות a slip away from it. */}
            <QuickTail
              onCopy={onDuplicate}
              copyLabel="שכפול הבמה"
              onDelete={onDelete}
              deleteLabel="מחיקת הבמה"
              more={moreOf([mirrorItems(onMirror), stackItems(canRestack, onRestack), stageCoverItems ?? [], [{ label: "פירוק לפלטות נפרדות", icon: Blocks, onSelect: onExplodeStage }], lockItems(lock)])}
              moreLabel="עוד פעולות לבמה"
            />
          </Bar>
        );

      const totals = edgeTotals(sp.edges);
      const open = sp.gapsMm > 0;
      return groupsOf(
        "stage",
        "במה",
        facts,
        [
          // THE EDGES. Every open side is finished with stairs, a banquette or a barrier; this says
          // what is on them, what is still bare (and finishes it in one click), and adds one more —
          // then each one is edited by clicking it on the plan.
          G(
            "edges",
            Footprints,
            "קצוות",
            open ? `${m(sp.gapsMm)} מ׳ פתוחים` : totals.flights > 0 ? `${totals.flights} מדרגות` : "סגור",
            <EdgeFinishFields
              totals={totals}
              corners={sp.cornerCount > 0 || !sp.corners ? { label: "פינות בין שתי ריצות", value: sp.corners, onChange: onStageCorners } : null}
              gapsMm={sp.gapsMm}
              gapLine={`${m(sp.gapsMm)} מ׳ של שפה פתוחה — מסומנים באדום בתוכנית.`}
              onFill={onFillEdges}
              onAdd={onAddEdge}
              note="לחיצה על מדרגות, בנקט או מחסום בתוכנית עורכת אותם; גרירה מזיזה לאורך הצד."
            />,
            open,
          ),
          sp.missing.length > 0 &&
            G(
              "missing",
              PackagePlus,
              "חסר בקטלוג",
              missingSummary(sp.missing),
              <MissingPieces missing={sp.missing} types={sp.pieceTypes} chosen={sp.chosen} onUse={onUseStagePieces} onAdd={onAddStagePieces} />,
              true,
            ),
          breaches.length > 0 && G("clearance", ShieldAlert, "מרחק ביטחון", breaches.length === 1 ? "חריגה אחת" : `${breaches.length} חריגות`, <BreachList breaches={breaches} />, true),
          G(
            "built",
            Blocks,
            "בנויה מ",
            `${sp.deckCount} פלטות`,
            <BuiltFromFields
              decks={sp.decks}
              skirtMm={sp.skirtMm}
              skirtCounted={sp.skirtCounted}
              // Whether a deck may reach past the line where that beats a bare strip — the fill tool's
              // own switch, here too, because the decision is as often made looking at the built stage
              // as at the drawn area.
              exceed={sp.exceed}
              exceedLabel="פלטה שעוברת את הקו"
              onExceed={onStageExceed}
              empty="אף פלטה לא נכנסת — אולי הפלטות שנבחרו נמחקו מהקטלוג. ״עריכת הפלטות״ תאפשר לבחור אחרות."
              note={
                <>
                  הבמה מחושבת מהפלטות בכל פעם — הגדלה או שינוי צורה מחשבים אותן מחדש, והצעת המחיר ורשימת הציוד סופרות
                  אותן, את המדרגות ואת מטרי החצאית בצדדים הפתוחים.
                  {/* What the size typed in the bar does to the build, said where the build is. */}
                  {size && (
                    <>
                      {" "}
                      {sp.coverage < 0.995 ? `הפלטות מכסות ${Math.floor(sp.coverage * 100)}% מהמידה בסרגל. ` : "הפלטות מכסות את המידה בסרגל בדיוק. "}
                      {sp.round
                        ? "מידה שמוקלדת מגדילה או מקטינה את הצורה כולה, והמדרגות סביבה עוקבות אחרי הקשת. הגב נשאר במקומו."
                        : sp.shaped
                          ? "המידה היא של התיבה, כולל הקימור. הפינות המעוגלות והחזית הקמורה נבנות מחדש על המלבן החדש; הגב נשאר במקומו. לשינוי הרדיוס — ״עריכת הפלטות״."
                          : "במידה שמוקלדת הגב נשאר במקומו והחזית זזה. בגרירה, ידית נמשכת למידות שהפלטות בונות בדיוק (Alt משחרר)."}
                    </>
                  )}
                </>
              }
            />,
          ),
          G(
            "height",
            MoveVertical,
            "גובה ומפלסים",
            `${cmOf(sp.heightMm)} ס״מ${sp.levels.length ? ` · ${sp.levels.length === 1 ? "מפלס אחד" : `${sp.levels.length} מפלסים`}` : ""}`,
            <>
              <PanelRow label="הבמה" htmlFor="stage-height">
                <NumberField id="stage-height" decimals={0} min={10} max={300} value={cmOf(sp.heightMm)} onChange={(cm) => onStageHeight(cm * 10)} className="w-20" />
                <span className="text-xs text-muted">ס״מ</span>
              </PanelRow>
              {/* THE STEP its flights climb in — the crew's stair module (StageBuild.riserMm/treadMm):
                  no riser taller than this, each tread this deep. A new stage takes the studio's
                  (settings → במות); this is where one stage is built in another. */}
              <PanelRow label="גובה מדרגה" htmlFor="stage-riser">
                <NumberField id="stage-riser" decimals={0} min={8} max={30} value={cmOf(sp.stairStep.riserMm)} onChange={(cm) => onStairStep({ riserMm: cm * 10 })} className="w-20" />
                <span className="text-xs text-muted">ס״מ · לכל היותר</span>
              </PanelRow>
              <PanelRow label="עומק מדרגה" htmlFor="stage-tread">
                <NumberField id="stage-tread" decimals={0} min={15} max={60} value={cmOf(sp.stairStep.treadMm)} onChange={(cm) => onStairStep({ treadMm: cm * 10 })} className="w-20" />
                <span className="text-xs text-muted">ס״מ</span>
                {sp.stairStep.own && <BarButton icon={RotateCcw} label="חזרה למדרגה הרגילה" onClick={() => onStairStep({ riserMm: null, treadMm: null })} />}
              </PanelRow>
              {sp.levels.map((l, i) => (
                <PanelRow key={l.id} label={`מפלס ${i + 1}`} htmlFor={`level-${l.id}`}>
                  <NumberField id={`level-${l.id}`} decimals={0} min={10} max={400} value={cmOf(l.heightMm)} onChange={(cm) => onLevelHeight(l.id, cm * 10)} className="w-20" />
                  <span className="text-xs text-muted">ס״מ · {l.deckCount} פלטות</span>
                  <BarButton icon={Trash2} label={`הסרת מפלס ${i + 1}`} onClick={() => onRemoveLevel(l.id)} />
                </PanelRow>
              ))}
              <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onAddLevel}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                הוספת מפלס מוגבה
              </Button>
              <Note>מפלס הוא חלק מוגבה של הבמה — פודסט לתופים, עמדת DJ. מסמנים אותו על הבמה, והוא נבנה מאותן פלטות על רגליים ארוכות יותר.</Note>
            </>,
          ),
          G(
            "surface",
            Layers2,
            "משטח",
            surfaceName(sp.surface, sp.surfaceOptions),
            <SurfaceFields
              value={sp.surface}
              options={sp.surfaceOptions}
              onPick={onStageSurface}
              pickerLabel="מה מכסה את הבמה"
              note={`שטיח, רחבת ריקודים — מחושב לפי שטח הבמה (${m(sp.areaMm2 / 1000)} מ״ר).${sp.surfaceOptions.length === 0 ? " אין בקטלוג ״משטחי במה״ — אפשר להוסיף." : ""}`}
            />,
          ),
          sp.railingMm !== null &&
            sp.railingMm > 0 &&
            G(
              "railing",
              Fence,
              "מעקה",
              ltr(`${m(sp.railingMm)} מ׳`),
              <Note>
                לפי הכלל שנקבע בהגדרות (מעל {cmOf(sp.railingAboveMm ?? 0)} ס״מ), צריך מעקה בצדדים הפתוחים המסומנים בקו מנוקד.
                החזית לא מסומנת לעולם.
              </Note>,
              true,
            ),
          G("template", BookmarkPlus, "תבנית", "שמירה", <SaveTemplateFields onSave={onSaveTemplate} />),
        ],
        ["edges", "built"],
      );
    }

    // Any other placement — a DESIGN ITEM (on a table, hung over one, or standing on the floor), a
    // CEILING ITEM, and the special kinds: a banquette, a chair (rows of them, or one that could be), a
    // flight or a ramp, a carpet laid over a surface, a stretched rug, and anything hung on a RAIL (a
    // drape, an LED strip, a sail, a ceiling cloth). Every one is asked in the same two places. Its
    // quick bar leads with the numbers that kind is placed by — a design item's drawing size (or how
    // many), a ceiling item's hang height, a block's rows × chairs, a banquette's number, a flight's
    // rise, a carpet's margin, a rug's W×D, a rail's length (read, not typed — D14: it is the rail's,
    // its ends are dragged or the ״מסילה״ group typed) and its drop or height — then its angle and its
    // one verb, then copy · delete · ⋯. Every other field is a group: what is wrong first, the kind's
    // own (מסילה · מספר, גובה, ישיבה · שורות · מדרגות · על <name> · גודל ופינות), then what it is, its
    // shade, its vessel, its contour, its size and — on or over a table — the same item onto others.
    const r = resolve(p.variantId);
    const table = p.tableId ? doc.tables.find((t) => t.id === p.tableId) : undefined;
    // A ceiling item hung OVER a table (Placement.over): named here, centred, arranged in that
    // table's focus mode, and hung over other tables in a pattern — the table-item verbs, above.
    const overTable = p.layer === "ceiling" && p.over ? doc.tables.find((t) => t.id === p.over) : undefined;
    const shades = shadesOf(p.variantId);
    const shade = shades.find((s) => s.id === p.variantId);
    // A drape hangs on a RAIL (lib/studio/rail.ts) — its legacy span read as a wall rail — and so do an
    // LED strip, a sail and a ceiling cloth.
    const drape = r?.anchor === "wall" ? (railOf(p) ?? undefined) : undefined;
    const railCtx = drape ? sketchRailContext(doc, structure, arrangedStructure(structure, doc), (v) => resolve(v)?.product) : null;
    const runMm = drape && railCtx ? railLengthMm(drape, railCtx) : undefined;
    const run = runMm !== undefined ? { lengthMm: runMm } : null;
    const onWhat = drape?.type === "side" ? "על הצד" : drape?.type === "rod" ? "על המוט" : "על הקיר";
    // An LED strip rides the same rail but is light, not cloth (./led-popover.tsx): its height, its
    // stretch, a run of its own — no drop, no rod.
    const led = !!drape && isLedStrip(r?.product);
    // A BARE ROD (the built-in מוט וילון placed by itself — lib/studio/rail.ts): a rod with no cloth
    // on it yet. Its length, its thickness and its height; no drop.
    const bareRod = !!drape && isRodRow(r?.product);
    // A SAIL or a CEILING DRAPE (lib/studio/ceiling-cloth.ts): its own fields and facts, not a curtain's.
    const clothKind = drape && r ? clothKindOf(r.product.category, drape) : null;
    const clothSheet = clothKind && drape?.type === "sail" && railCtx ? sailSheet(drape, railCtx) : null;
    const cloth = clothKind && (drape?.type === "run" || drape?.type === "canopy") ? clothRuns(drape) : null;
    const clothMm = cloth ? cloth.reduce((n, x) => n + x.lengthMm, 0) : undefined;
    const stretch = r?.sizing === "stretch" && !drape;
    // The size the canvas draws it at (placementFootprint): its own, else its row's — a rug just laid
    // has none of its own yet, and read 0×0.
    const drawn = footprintBounds(placementFootprint(p));
    const drawnSize = { widthMm: drawn.w, depthMm: drawn.h };
    const rugSize = p.sizeMm ?? drawnSize;
    // A flight or a ramp standing on its own — never one worn on a table or hung on a wall.
    const climb = r && !table && !drape && onClimb ? itemClimbHost(r.product, drawnSize, p.climb) : null;
    const editClimb = (edit: ClimbEdit | null) => {
      if (edit && onClimb) onClimb(p.id, edit);
    };
    // A STANDALONE BANQUETTE is set like a table: its number (optional — clearing it leaves the
    // banquette seated but unnumbered), its height, its two sides and their counts, and its occupancy.
    // Its row is still quoted by the metre; nothing here touches that.
    const bench = benchPanel?.layout;
    const benchNumber = benchPanel?.spec?.number;
    // A chair on the floor may be set out in ROWS (lib/design-document/chair-rows.ts); one that is,
    // is a block — its count is its rows, and the quantity stepper would only argue with them.
    const block = chairBlockOf(p);
    // AN AISLE (lib/catalog/aisle.ts): the piece that lines it and how it is laid — its row's
    // answers, or this plan's own.
    const aisle = !table && !drape ? aisleOf(p) : null;
    const rowsAllowed = !!onChairRows && r?.product.category === "chairs" && !table && !drape && !p.perch && !p.stage;
    // A carpet laid OVER a surface or a stage (lib/studio/cover.ts) is that thing's shape: in place of a
    // size it says what it lies on, takes a margin, and lets go — the shape kept. It faces as that does.
    const covered = stretch && !!p.cover;
    const laid = covered ? coverTarget(p, doc, structure) : null;
    const coverInset = Math.round((p.cover?.insetMm ?? 0) / 10);

    const hungOverDressing = overTable
      ? doc.placements.filter((x) => {
          if (x.layer !== "table" || x.tableId !== overTable.id) return false;
          const rx = resolve(x.variantId);
          return !!rx && rx.anchor !== "table" && !isRunner(rx.product);
        }).length
      : 0;

    // The item's "…" — the quick bar's ⋯ (after the clipboard): flip, the floor stack, selection, the
    // over-table verbs, its catalog row, a stage piece made a stage, the lock.
    const itemSections: MenuItem[][] = [
      !table && !drape && !p.cover ? mirrorItems(onMirror) : [],
      stackItems(canRestack, onRestack),
      selectItems,
      overTable
        ? [
            ...(onCentreOver ? [{ label: "למרכז השולחן", icon: Crosshair, onSelect: () => onCentreOver(p.id) }] : []),
            ...(onHangOverDressing && hungOverDressing > 0
              ? [{ label: `אחד מעל כל פריט שעל השולחן (${hungOverDressing})`, icon: ArrowUpFromLine, onSelect: () => onHangOverDressing(p.id) }]
              : []),
          ]
        : [],
      [
        ...(onEditProduct && r ? [{ label: "עריכת הפריט בקטלוג", icon: Pencil, onSelect: () => onEditProduct(p.variantId) }] : []),
        // What stands on a table (or hangs over one) saved as a TABLE SET — the one case where a single
        // item makes a catalog item worth having (lib/catalog/composition.ts).
        ...(onSaveComposite && (table || overTable) ? [{ label: "שמירה כפריט מורכב בקטלוג", icon: PackagePlus, onSelect: onSaveComposite }] : []),
      ],
      onMakeStage ? [{ label: "הפיכה לבמה — מדרגות, גובה ומפלסים", icon: Grid2x2, onSelect: onMakeStage }] : [],
      lockItems(lock),
    ];

    // Which kind it is — its bar's lead, its own groups, and which of them it opens on (remembered per
    // kind, lib/studio/panel-groups.ts).
    const kind = drape ? "rail" : aisle ? "aisle" : bench ? "bench" : rowsAllowed ? "rows" : climb ? "climb" : covered ? "cover" : stretch ? "rug" : p.layer === "ceiling" ? "ceiling" : "item";
    const name = r?.product.name ?? "פריט";
    const title = bench ? (benchPanel?.numbered && benchNumber ? `בנקט ${benchNumber}` : "בנקט") : block ? "שורות כיסאות" : name;
    const icon = aisle ? Route : bench ? RectangleHorizontal : block ? Rows3 : climb ? (climb.kind === "ramp" ? Accessibility : Footprints) : led ? Zap : bareRod ? Minus : clothKind ? (drape?.type === "sail" ? Sailboat : Waves) : Sparkles;
    // Where a rail runs, in words — or, when what it ran along is gone, that.
    const railWhere = !drape
      ? null
      : clothKind
        ? drape.type === "sail"
          ? clothSheet
            ? `${drape.ties.length} קשירות`
            : "הקיר או המבנה שהמפרש נקשר אליו הוסר"
          : drape.type === "canopy"
            ? "על שטח"
            : null
        : run
          ? led
            ? drape.type === "wall"
              ? "על הקיר"
              : drape.type === "side"
                ? "על הצד"
                : "באוויר"
            : bareRod
              ? "בלי וילון — גוררים עליו וילון כדי לתלות"
              : onWhat
          : drape.type === "side"
            ? led
              ? "האלמנט שהפס רץ עליו הוסר"
              : "הפריט שהווילון היה תלוי עליו הוסר"
            : "הקיר נמחק";
    // …and whether its rail lost what it ran along — said in warn ink on its ״מסילה״ group.
    const railLost = !!drape && (clothKind ? drape.type === "sail" && !clothSheet : !run);
    const facts = [
      block ? `${p.quantity} כיסאות · ${block.spec.rows} שורות × ${block.spec.perRow}` : null,
      aisle ? (aisle.piece ? `${aisle.piece.label} · ${aisleWords(aisle.layout)}` : "לא נבחר פריט") : null,
      bench || block ? r?.product.name : LAYER_LABEL[p.layer],
      bench ? `${(bench.widthMm / 1000).toFixed(2)} מ׳` : null,
      bench && bench.seats > 0 ? `${bench.seats} מקומות ישיבה` : null,
      table ? tableLabel(doc, table) : null,
      overTable ? `מעל ${tableLabel(doc, overTable)}` : null,
      railWhere,
      // A swag's headroom: its lowest point from the floor.
      clothKind && drape?.type === "run" && cloth?.[0] ? `נקודה נמוכה ${Math.round(runLowestMm(cloth[0]) / 10)} ס״מ` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const ceiling = p.layer === "ceiling";
    // Drawn bigger or smaller on THIS plan — unless its row has a size of its own to type (מידות), it
    // stretches, it hangs on a rail, it is a climb (its run follows the step it covers) or a block of
    // chairs (its size is its rows; its chairs are drawn at their real size).
    const scaled = !sizePanel && !stretch && !drape && !p.stage && !climb && !block && !aisle;
    const pct = Math.round((p.scale || 1) * 100);
    // The table it stands on, or hangs over: its focus mode is where it is moved and arranged.
    const dressOn = table ?? overTable;
    const hang =
      ceiling && !drape && onHang
        ? {
            own: p.hangHeightMm,
            fallback: hangHeightOf({}, r?.product),
            underRoof: roofOf ? ceilingUndersideMm(roofOf(p.position), r?.product.dimensions.heightMm ?? 0) : undefined,
            set: (mm: number | null) => onHang(p.id, mm),
          }
        : null;
    const hung = hang ? hangView(hang.own, hang.fallback, hang.underRoof) : null;
    const contour = r && takesBorder(r.product) ? borderOf(p, r.product) : undefined;
    const rowVessel = r ? productVessel(r.product) : undefined;
    const rowsSpec: ChairRows = p.rows ?? { rows: 1, perRow: 1 };

    if (bar) {
      // The numbers it is placed by, by kind (see above). Each subject is a segment; a hairline
      // between them.
      const lead: { key: string; node: ReactNode }[] = [];
      const seg = (key: string, node: ReactNode) => lead.push({ key, node });
      if (drape) {
        const sail = drape.type === "sail";
        const lengthMm = clothMm ?? runMm;
        // A ROD's own two numbers are typed, not only dragged (2026-11-13, the user: "the rod width
        // and length should be editable"): its length — the first post stays, the last stretch grows —
        // and its thickness. A bare rod's third number is its height; a curtain's is its drop.
        if (drape.type === "rod" && onRail && !led && !clothKind) {
          seg(
            "length",
            <>
              <QuickLead icon={MoveHorizontal} label="אורך המוט (ס״מ)" />
              <QuickNumber label="אורך המוט (ס״מ)" min={ROD_MIN_MM / 10} max={6000} value={cm(rodRunMm(drape))} onChange={(v) => onRail(p.id, rodWithLength(drape, v * 10))} />
              <QuickUnit>ס״מ</QuickUnit>
            </>,
          );
          seg(
            "thick",
            <>
              <QuickLead icon={Minus} label="עובי המוט (מ״מ)" />
              <QuickNumber label="עובי המוט (מ״מ)" narrow min={ROD_THICK_MIN_MM} max={ROD_THICK_MAX_MM} value={rodThickMm(drape)} onChange={(v) => onRail(p.id, rodWithThick(drape, v))} />
              <QuickUnit>מ״מ</QuickUnit>
            </>,
          );
        } else
        seg(
          "length",
          <>
            <QuickLead icon={sail ? Sailboat : MoveHorizontal} label={sail ? "שטח המפרש" : "אורך לאורך המסילה"} />
            <span className="nums whitespace-nowrap text-[13px] font-semibold text-ink" title={sail ? "שטח המפרש — הקשירות נגררות על התוכנית" : "האורך לאורך המסילה — מקצרים בידיות שבקצוות, או ב״מסילה״"}>
              {sail ? (clothSheet ? ltr((clothSheet.areaMm2 / 1e6).toFixed(1)) : "—") : lengthMm !== undefined ? ltr((lengthMm / 1000).toFixed(2)) : "—"}
            </span>
            <QuickUnit>{sail ? "מ״ר" : "מ׳"}</QuickUnit>
          </>,
        );
        // How far a curtain comes down (blank = to the floor); how high a strip or a ceiling cloth runs.
        if (onRail && bareRod && drape.type === "rod")
          seg(
            "height",
            <>
              <QuickLead icon={MoveVertical} label="גובה המוט (ס״מ)" />
              <QuickNumber label="גובה המוט (ס״מ)" min={50} max={800} value={cm(drape.heightMm)} onChange={(v) => onRail(p.id, { ...drape, heightMm: Math.round(v * 10) })} />
              <QuickUnit>ס״מ</QuickUnit>
            </>,
          );
        else if (onRail && !led && !clothKind)
          seg(
            "drop",
            <>
              <QuickLead icon={ArrowDownToLine} label="אורך הבד (ס״מ) — ריק: עד הרצפה" />
              <QuickNumber label="אורך הבד (ס״מ)" min={0} max={1200} value={p.dropMm ? cm(p.dropMm) : 0} hideZero placeholder="רצפה" onChange={(v) => onRail(p.id, drape, v > 0 ? v * 10 : null)} />
              <QuickUnit>ס״מ</QuickUnit>
            </>,
          );
        else if (onRail && led && (drape.type === "wall" || drape.type === "run"))
          seg(
            "height",
            <>
              <QuickLead icon={MoveVertical} label={drape.type === "wall" ? "גובה מהרצפה (ס״מ)" : "גובה (ס״מ)"} />
              <QuickNumber
                label={drape.type === "wall" ? "גובה מהרצפה (ס״מ)" : "גובה (ס״מ)"}
                min={0}
                max={1500}
                value={cm(drape.heightMm ?? 0)}
                onChange={(v) => onRail(p.id, { ...drape, heightMm: Math.max(0, Math.round(v * 10)) })}
              />
              <QuickUnit>ס״מ</QuickUnit>
            </>,
          );
        else if (onRail && clothKind && drape.type === "run") {
          // ONE SWAG (2026-11-13): each end's height from the floor — א the end it was drawn from, ב
          // the other, named so on the plan too — and how deep it hangs, which is also its handle.
          const [hA, hB] = runEndHeights(drape);
          seg(
            "height",
            <>
              <QuickLead icon={MoveVertical} label="גובה כל קצה מהרצפה (ס״מ)" />
              <QuickUnit>א׳</QuickUnit>
              <QuickNumber label="גובה קצה א׳ (ס״מ)" min={50} max={1500} value={cm(hA)} onChange={(v) => onRail(p.id, runEndHeight(drape, 0, v * 10))} />
              <QuickUnit>ב׳</QuickUnit>
              <QuickNumber label="גובה קצה ב׳ (ס״מ)" min={50} max={1500} value={cm(hB)} onChange={(v) => onRail(p.id, runEndHeight(drape, 1, v * 10))} />
            </>,
          );
          seg(
            "sag",
            <>
              <QuickLead icon={ArrowDownToLine} label="עומק הקימור (ס״מ)" />
              <QuickNumber label="עומק הקימור (ס״מ)" min={0} max={cm(cloth?.[0] ? maxSagMm(cloth[0]) : 3000)} value={cm(cloth?.[0]?.sagMm ?? drape.sagMm ?? RUN_SAG_MM)} onChange={(v) => onRail(p.id, withSag(drape, v * 10))} />
              <QuickUnit>ס״מ</QuickUnit>
            </>,
          );
        } else if (onRail && clothKind && drape.type === "canopy")
          seg(
            "height",
            <>
              <QuickLead icon={MoveVertical} label="גובה (ס״מ)" />
              <QuickNumber label="גובה (ס״מ)" min={100} max={1500} value={cm(drape.heightMm)} onChange={(v) => onRail(p.id, { ...drape, heightMm: v * 10 })} />
              <QuickUnit>ס״מ</QuickUnit>
            </>,
          );
      } else if (bench && benchPanel) {
        seg(
          "number",
          <>
            <QuickLead icon={Hash} label="מספר הבנקט" />
            <QuickNumber
              label="מספר הבנקט"
              narrow
              min={0}
              value={benchNumber ?? 0}
              hideZero={benchNumber === undefined}
              placeholder="—"
              onChange={(v) => onBench(p.id, { number: v })}
            />
          </>,
        );
      } else if (rowsAllowed && onChairRows) {
        // A single chair is one row of one: typing more rows (or more in a row) makes it a block.
        const setRows = (patch: Partial<ChairRows>) => {
          const next = { ...rowsSpec, ...patch };
          if (!p.rows && next.rows <= 1 && next.perRow <= 1) return;
          onChairRows(p.id, next);
        };
        seg(
          "rows",
          <>
            <QuickLead icon={Rows3} label="שורות × כיסאות בשורה" />
            <QuickNumber label="שורות" narrow min={1} max={MAX_ROWS} value={rowsSpec.rows} onChange={(n) => setRows({ rows: n })} />
            <QuickUnit>×</QuickUnit>
            <QuickNumber label="כיסאות בשורה" narrow min={1} max={MAX_PER_ROW} value={rowsSpec.perRow} onChange={(n) => setRows({ perRow: n })} />
          </>,
        );
      } else if (climb && r) {
        seg(
          "rise",
          <>
            <QuickLead icon={MoveVertical} label="הפרש גובה (ס״מ)" />
            <QuickNumber label="הפרש גובה (ס״מ)" narrow min={0} max={600} value={cm(climb.heightMm)} onChange={(v) => editClimb(climbHeightEdit(p, r.product, drawnSize, v * 10))} />
            <QuickUnit>ס״מ</QuickUnit>
          </>,
        );
      } else if (covered) {
        if (onCoverInset)
          seg(
            "inset",
            <>
              <QuickLead icon={Link2} label="שוליים (ס״מ)" />
              <QuickNumber label="שוליים (ס״מ)" narrow min={0} value={coverInset} onChange={(v) => onCoverInset(p.id, Math.max(0, v) * 10)} />
              <QuickUnit>ס״מ</QuickUnit>
            </>,
          );
      } else if (aisle && sizePanel) {
        // AN AISLE is laid by three numbers: how long, how wide across, and a piece every so far.
        seg(
          "size",
          <>
            <QuickLead icon={Ruler} label="אורך × רוחב (ס״מ)" />
            <QuickNumber label="אורך השדרה (ס״מ)" min={cm(sizePanel.spec.width?.minMm ?? 1000)} max={cm(sizePanel.spec.width?.maxMm ?? 60000)} value={cm(sizePanel.size.widthMm)} onChange={(v) => onSize({ widthMm: v * 10, depthMm: sizePanel.size.depthMm })} />
            <QuickUnit>×</QuickUnit>
            <QuickNumber label="רוחב השדרה (ס״מ)" min={cm(sizePanel.spec.depth?.minMm ?? 800)} max={cm(sizePanel.spec.depth?.maxMm ?? 15000)} value={cm(sizePanel.size.depthMm)} onChange={(v) => onSize({ widthMm: sizePanel.size.widthMm, depthMm: v * 10 })} />
          </>,
        );
        if (onAisle)
          seg(
            "pitch",
            <>
              <QuickLead icon={Route} label="פריט כל (ס״מ)" />
              <QuickNumber label="פריט כל (ס״מ)" min={AISLE_PITCH_MIN_MM / 10} max={AISLE_PITCH_MAX_MM / 10} value={cm(aisle.spec.pitchMm ?? AISLE_PITCH_MM)} onChange={(v) => onAisle([p.id], { pitchMm: v * 10 })} />
              <QuickUnit>ס״מ</QuickUnit>
            </>,
          );
      } else if (stretch) {
        // A carpet sized by number — faster than its corners when the client says "three by two".
        seg(
          "size",
          <>
            <QuickLead icon={Ruler} label="מידות (ס״מ)" />
            <QuickNumber label="רוחב השטיח (ס״מ)" min={30} value={cm(rugSize.widthMm)} onChange={(v) => onResize(p.id, { widthMm: v * 10, depthMm: rugSize.depthMm })} />
            <QuickUnit>×</QuickUnit>
            <QuickNumber label="עומק השטיח (ס״מ)" min={30} value={cm(rugSize.depthMm)} onChange={(v) => onResize(p.id, { widthMm: rugSize.widthMm, depthMm: v * 10 })} />
          </>,
        );
      } else if (hang && hung) {
        seg(
          "hang",
          <>
            <QuickLead icon={ArrowDownToLine} label="גובה תלייה (ס״מ)" />
            <QuickNumber
              label="גובה תלייה (ס״מ)"
              min={0}
              max={HANG_MAX_MM / 10}
              value={hang.own ? cm(hang.own) : 0}
              hideZero
              placeholder={hung.placeholder}
              onChange={(v) => hang.set(v > 0 ? v * 10 : null)}
            />
            <QuickUnit>ס״מ</QuickUnit>
          </>,
        );
      } else if (scaled && p.quantity <= 1) {
        seg(
          "scale",
          <>
            <QuickLead icon={Scaling} label="גודל על התוכנית (%)" />
            <QuickNumber label="גודל על התוכנית (%)" narrow min={30} max={300} value={pct} onChange={(v) => onScale(p.id, v / 100)} />
            <QuickUnit>%</QuickUnit>
          </>,
        );
      } else {
        // Counted by the unit (or sized by its row, with nothing to scale): how many, in place.
        seg("quantity", <QuantityStepper quantity={p.quantity} onStep={(d) => onQuantity(p.id, d)} />);
      }
      // Its angle — not a carpet laid over a thing (it faces as that does) nor anything on a rail (the
      // rail is where it runs; its own angle is read by nothing).
      if (!covered && !drape) seg("turn", <QuickTurn value={facing} onChange={onFace} />);
      // Its one verb: a rail drawn again on the canvas — a curtain on a rod of its own, a strip as a
      // free run, a cloth tie by tie or end to end — or the table it stands on (or hangs over) dressed.
      if (drape) {
        if (onRail && !p.locked && !clothKind && onDrawRod)
          seg(
            "verb",
            <ModeVerb icon={Minus} label={led ? (drape.type === "run" ? "ציור הפס מחדש" : "פס חופשי") : drape.type === "rod" ? "ציור המוט מחדש" : "ציור על מוט"} onClick={() => onDrawRod(p.id)} />,
          );
        else if (onRail && !p.locked && clothKind && onDrawCloth) {
          const again = drape.type === "sail" ? "sail" : drape.type === "canopy" ? "canopy" : "run";
          seg("verb", <ModeVerb icon={PenLine} label={again === "canopy" ? "ציור השטח מחדש" : "ציור מחדש"} onClick={() => onDrawCloth(p.id, again)} />);
        }
      } else if (dressOn && onDressTable) seg("verb", <ModeVerb icon={PaintRoller} label="הלבשה" onClick={() => onDressTable(dressOn.id)} />);
      return (
        <Bar icon={icon} title={title} facts={facts} onClose={onClose}>
          {lead.map(({ key, node }, i) => (
            <Fragment key={key}>
              {i > 0 && <QuickSep />}
              {node}
            </Fragment>
          ))}
          <QuickTail
            onCopy={onDuplicate}
            copyLabel="שכפול הפריט"
            onDelete={onDelete}
            deleteLabel="מחיקת הפריט"
            more={moreOf(itemSections)}
            moreLabel="עוד פעולות לפריט"
          />
        </Bar>
      );
    }

    const opens: Record<typeof kind, string[]> = {
      rail: ["rail", "item"],
      aisle: ["aisle", "size"],
      bench: ["seating", "number"],
      rows: ["rows", "item"],
      climb: ["climb", "item"],
      cover: ["cover", "item"],
      rug: ["rugsize", "item"],
      ceiling: ["hang", "item"],
      item: ["item", "shade"],
    };
    const railGroup =
      !!drape &&
      G(
        "rail",
        led ? Zap : clothKind ? (drape.type === "sail" ? Sailboat : Waves) : drape.type === "rod" ? Minus : Maximize2,
        "מסילה",
        drape.type === "sail" ? (clothSheet ? ltr(`${(clothSheet.areaMm2 / 1e6).toFixed(1)} מ״ר`) : "—") : clothMm !== undefined ? ltr(`${drape.type === "canopy" && cloth ? `${cloth.length}× ` : ""}${(clothMm / 1000).toFixed(2)} מ׳`) : run ? ltr(`${(run.lengthMm / 1000).toFixed(2)} מ׳`) : "—",
        led ? (
          // The run drawn of its own is the bar's verb.
          <LedRailPopover rail={drape} lengthMm={runMm} onRail={(rail) => onRail?.(p.id, rail)} />
        ) : clothKind ? (
          onRail ? (
            // A sail's ties and sag, a ceiling drape's height, width, sag, scallops — and both ways to
            // draw it again (a line, an area), which the bar's verb is one of.
            <CeilingClothPopover rail={drape} sheet={clothSheet} onRail={(rail) => onRail(p.id, rail)} onRedraw={onDrawCloth && !p.locked ? (k) => onDrawCloth(p.id, k) : undefined} />
          ) : (
            <Note>{railWhere ?? "בד תקרה"}</Note>
          )
        ) : (
          // A drape covers its whole wall (or side) by default; this puts it back after it was
          // shortened. On a rod: its height and its ר. Every rail: the drop. (A rod of its own is the
          // bar's verb.)
          <DrapeRailFields
            rail={drape}
            run={run}
            dropMm={p.dropMm}
            bare={bareRod}
            onBareRod={onBareRod && !bareRod && drape.type === "rod" && !p.locked ? () => onBareRod(p.id) : undefined}
            onWhat={onWhat}
            onRail={(rail, dropMm) => (onRail ? onRail(p.id, rail, dropMm) : rail.type === "wall" && dropMm === undefined && onSpan(p.id, { wallId: rail.wallId, from: rail.from, to: rail.to }))}
            editable={!!onRail}
          />
        ),
        railLost,
      );
    const climbSteep = !!climb && climb.kind === "ramp" && rampTooSteep(climb);
    return groupsOf(
      kind,
      title,
      facts,
      [
        breaches.length > 0 && G("clearance", ShieldAlert, "מרחק ביטחון", breaches.length === 1 ? "חריגה אחת" : `${breaches.length} חריגות`, <BreachList breaches={breaches} />, true),
        railGroup,
        // AN AISLE: which piece lines it, a piece every so far, one side or both, its runner — warn
        // while no piece is chosen (it stands bare and counts nothing).
        !!aisle &&
          !!onAisle &&
          G("aisle", Route, "שדרה", aisle.piece ? aisleWords(aisle.layout) : "לא נבחר פריט", <AislePanel id={p.id} view={aisle} own={p.aisle} onAisle={(patch) => onAisle([p.id], patch)} />, !aisle.piece),
        // A STANDALONE BANQUETTE: its number, its height and its two sides — as a table's ״שולחן״ and
        // ״ישיבה״.
        !!bench &&
          !!benchPanel &&
          G(
            "number",
            Hash,
            "מספר",
            benchPanel.numbered && benchNumber ? ltr(`#${benchNumber}`) : "ללא",
            <BenchNumberFields
              number={benchNumber}
              seats={bench.seats}
              duplicate={benchPanel.numbered && benchNumber !== undefined && benchNumber > 0 && duplicateNumbers(doc, benchOf).has(benchNumber)}
              onNumber={(n) => onBench(p.id, { number: n })}
            />,
            benchPanel.numbered && benchNumber !== undefined && benchNumber > 0 && duplicateNumbers(doc, benchOf).has(benchNumber),
          ),
        // ITS HEIGHT, a group of its own (2026-10-31, the user: "need to be able to define his height in
        // the inspector"): the top — table height for the chairs beside it — always, and a sofa side's
        // seat when it has one.
        !!bench &&
          !!benchPanel &&
          G(
            "height",
            MoveVertical,
            "גובה",
            `${cm(bench.heightMm)} ס״מ`,
            <BenchHeightFields
              heightMm={bench.heightMm}
              sofaHeightMm={bench.back.kind === "sofa" || bench.front.kind === "sofa" ? bench.sofaHeightMm : undefined}
              onHeight={(mm) => onBench(p.id, { heightMm: mm })}
              onSofaHeight={(mm) => onBench(p.id, { sofaHeightMm: mm })}
            />,
          ),
        !!bench &&
          !!benchPanel &&
          G(
            "seating",
            Armchair,
            "ישיבה",
            bench.seats > 0 ? ltr(`${benchPanel.spec?.seated ?? 0}/${bench.seats}`) : "ללא ישיבה",
            <>
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
                heights={false}
                lengthMm={bench.widthMm}
                depthMm={bench.depthMm}
                onSide={(side, patch) => onBench(p.id, { [side]: patch })}
                onHeight={(mm) => onBench(p.id, { heightMm: mm })}
                onSofaHeight={(mm) => onBench(p.id, { sofaHeightMm: mm })}
              />
              {bench.seats > 0 && (
                <PanelRow label="תפוסה" htmlFor="bench-seated">
                  <NumberField id="bench-seated" decimals={0} min={0} value={benchPanel.spec?.seated ?? 0} onChange={(v) => onBench(p.id, { seated: v })} className="w-20" />
                  <span className={"text-xs " + occupancyInk(benchPanel.spec?.seated ?? 0, bench.seats)}>מתוך {bench.seats}</span>
                </PanelRow>
              )}
              <Note>
                הצד האחורי הוא הצד העליון של הבנקט כפי שהונח. כיסאות נספרים ונארזים כמו כיסאות שולחן; ספה נספרת במקומות הישיבה בלבד.
                אורך הבנקט נמתח בידיות שבתוכנית.
              </Note>
            </>,
          ),
        // A chair's rows: how many, how many in each, the gaps and an aisle — a single chair is one row
        // of one, and typing more makes it a block.
        rowsAllowed &&
          !!onChairRows &&
          !!r &&
          G("rows", Rows3, "שורות", p.rows ? ltr(`${p.rows.rows}×${p.rows.perRow}`) : "כיסא בודד", <ChairRowsPopover bare single rows={p.rows} chair={catalogBox(r.product)} onChange={(rows) => onChairRows(p.id, rows)} />),
        !!climb &&
          !!r &&
          G(
            "climb",
            climb.kind === "ramp" ? Accessibility : Footprints,
            climb.kind === "ramp" ? "רמפה" : "מדרגות",
            climb.kind === "ramp" ? ltr(formatRatio(rampRatio(climb)) || "—") : ltr(`${climbRisers(climb)}×${cm(riserHeightMm(climb))}`),
            <ClimbFields
              host={climb}
              onHeight={(mm) => editClimb(climbHeightEdit(p, r.product, drawnSize, mm))}
              onRisers={(n) => editClimb(climbRisersEdit(p, r.product, drawnSize, n))}
              onAccessible={() => editClimb(climbAccessibleEdit(p, r.product, drawnSize))}
              onReverse={() => editClimb(climbReverseEdit(p, r.product, drawnSize))}
            />,
            climbSteep,
          ),
        // What it lies on — a covered thing since gone is said, in warn ink: the carpet stands as it
        // was laid.
        covered &&
          G(
            "cover",
            Link2,
            laid?.present ? `על ${laid.name}` : `${laid?.name ?? "המשטח"} — לא בתוכנית`,
            coverInset ? ltr(`${coverInset} ס״מ`) : "צמוד לקצה",
            <CoverFields
              id={p.id}
              name={laid?.name ?? "המשטח"}
              present={!!laid?.present}
              feature={laid?.kind === "feature"}
              insetCm={coverInset}
              onInset={onCoverInset ? (cmv) => onCoverInset(p.id, Math.max(0, cmv) * 10) : undefined}
              onDetach={onDetachCover ? () => onDetachCover(p.id) : undefined}
            />,
            !laid?.present,
          ),
        // A rug's size and its corners — rounded together or one by one, and its bowed sides said.
        stretch &&
          !covered &&
          G(
            "rugsize",
            Ruler,
            "גודל ופינות",
            ltr(`${cm(rugSize.widthMm)}×${cm(rugSize.depthMm)}`),
            <RugSizeFields
              placement={p}
              size={rugSize}
              onSize={(size) => onResize(p.id, size)}
              onCorners={onCorners ? (corners) => onCorners(p.id, corners) : undefined}
              onBows={onBows ? (bows) => onBows(p.id, bows) : undefined}
            />,
          ),
        // How high it hangs — the bar's number, with the row's height back and what the room does
        // when neither says.
        !!hang && !!hung && G("hang", ArrowDownToLine, "תלייה", hung.shown ? ltr(hung.words) : hung.words, <HangFields own={hang.own} fallback={hang.fallback} underRoof={hang.underRoof} onHang={hang.set} />),
        G(
          "item",
          Sparkles,
          "פריט",
          !block && p.quantity > 1 ? `${name} · ${iso(`×${p.quantity}`)}` : name,
          // A block's count is its rows — no stepper.
          <ItemFields product={r?.product} swap={swap} onSwap={onSwap} quantity={block ? undefined : p.quantity} onQuantity={(d) => onQuantity(p.id, d)} />,
        ),
        shades.length > 0 &&
          G(
            "shade",
            Palette,
            "גוון",
            <>
              {shade?.swatch && <Swatch color={shade.swatch} size={12} />}
              <span className="truncate">{shade?.name ?? "ברירת מחדל"}</span>
            </>,
            <ShadeFields shades={shades} value={p.variantId} onChange={(v) => onVariant(p.id, v)} />,
          ),
        // The vase or jug an arrangement stands in — packed and counted with it. Not for one that hangs:
        // a hung arrangement stands in none (lib/catalog/vessel.ts vesselOf).
        !!onVessel &&
          !!r &&
          takesVessel(r.product) &&
          r.product.layer !== "ceiling" &&
          G("vessel", Amphora, "כלי", vesselView(p.vessel, rowVessel).name, <VesselPickRow own={p.vessel} rowVessel={rowVessel} onVessel={(v) => onVessel([p.id], v)} />),
        // A rug's or a runner's contour on THIS plan — its row's until it is given its own.
        !!onBorder &&
          !!r &&
          takesBorder(r.product) &&
          G(
            "border",
            Frame,
            "קונטור",
            <>
              {contour && <Swatch color={contour.colour} size={12} />}
              {borderWords(contour)}
            </>,
            <BorderPanel own={p.border} row={cleanBorder(r.product.appearance?.border)} category={r.product.category} onBorder={(b) => onBorder([p.id], b)} idPrefix={`border-${p.id}`} />,
          ),
        scaled && G("scale", Scaling, "גודל על התוכנית", ltr(`${pct}%`), <ScaleFields scale={p.scale || 1} onScale={(v) => onScale(p.id, v)} />),
        !!sizePanel &&
          G(
            "size",
            Ruler,
            "מידות",
            ltr(sizePanel.axes.uniform ? `⌀${cm(sizePanel.size.widthMm)}` : `${cm(sizePanel.size.widthMm)}×${cm(sizePanel.size.depthMm)}`),
            <SizeFields panel={sizePanel} onSize={onSize} labels={aisle ? { width: "אורך", depth: "רוחב" } : undefined} />,
          ),
        // On a table: the same item onto other tables, in a pattern.
        !!table && G("pattern", LayoutGrid, "דפוס", "החלה על שולחנות", renderPattern(table.id, p.id)),
        // Hung over a table: over other tables in a pattern, strung along its row, one over each item
        // on its table. Centring it is a one-press verb, in the ⋯.
        !!overTable &&
          G(
            "over",
            LayoutGrid,
            "מעל שולחנות",
            tableLabel(doc, overTable),
            <>
              {renderPattern(overTable.id, p.id)}
              {onSpreadRow && (
                <div className="mt-3 border-t border-border-soft pt-3">
                  <span className={fieldLabelClassName}>פיזור לאורך השורה</span>
                  <RowSpreadFields doc={doc} sourceId={overTable.id} name={name} heightMm={hangHeightOf(p, r?.product)} onSpread={(opts) => onSpreadRow(p.id, opts)} />
                </div>
              )}
              {onHangOverDressing && hungOverDressing > 0 && (
                <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => onHangOverDressing(p.id)}>
                  <ArrowUpFromLine className="h-3.5 w-3.5" strokeWidth={2} />
                  {`אחד מעל כל פריט שעל השולחן (${hungOverDressing})`}
                </Button>
              )}
            </>,
          ),
      ],
      opens[kind],
    );
  }

  // A TABLE. The quick bar asks its number, its seats and its angle in place, and offers הלבשה; every
  // other field is a group in the end panel — what is wrong first (a safety distance, a top that holds
  // more than it has room for), then what it is (its type and number), its seating, its size, its
  // cloth, its design, and how it is drawn.
  const t = doc.tables.find((x) => x.id === selection.id);
  if (!t) return null;
  const util = tableUtilization(doc, t);
  const pct = Math.round(util * 100);
  const count = doc.placements.filter((p) => p.layer === "table" && p.tableId === t.id).length;
  const overflow = util > 1;
  // The cloth is the table's surface, so it is edited from the table rather than selected as its own
  // object on the plan — there is nothing to click that isn't the table itself.
  const cloth = coverOn(doc, t.id);
  const onTable = doc.placements.filter((p) => p.layer === "table" && p.tableId === t.id && p.id !== cloth?.id);
  const seats = t.seats ?? 0;
  const title = tableLabel(doc, t);
  // How full the top is, read off the title row — the group appears only when it overflows.
  const facts = [t.type, count > 0 ? `${count} פריטים · ${pct}% מהשטח` : "0 פריטים"].join(" · ");

  if (bar)
    return (
      <Bar icon={TableIcon} title={title} facts={facts} onClose={onClose}>
        <NumberAndSeats number={t.number} unnumbered={!!t.unnumbered} onNumber={(v) => onRenumber(t.id, v)} seats={seats} onSeats={(v) => onSeats(t.id, v)} />
        <QuickTurn value={facing} onChange={onFace} />
        {/* Its focus mode — the items on it moved and arranged. The design pass's: the hall pass lays
            tables out and does not dress them. */}
        {onDressTable && (
          <>
            <QuickSep />
            <ModeVerb icon={PaintRoller} label="הלבשה" onClick={() => onDressTable(t.id)} />
          </>
        )}
        {/* The rest, in the "…": the clipboard, flipping and the floor stack (a head table stands on a
            staging deck, two pushed together overlap — lib/design-document/stacking.ts), building a
            selection from it, and its catalog row — edited, or the table with everything on it saved
            as an item of its own, to place again, dressed, at the next event. */}
        <QuickTail
          onCopy={onDuplicate}
          copyLabel="שכפול השולחן"
          onDelete={onDelete}
          deleteLabel="מחיקת השולחן"
          more={moreOf([
            mirrorItems(onMirror),
            stackItems(canRestack, onRestack),
            selectItems,
            [
              ...(onEditProduct && t.variantId && resolve(t.variantId) ? [{ label: "עריכת סוג השולחן בקטלוג", icon: Pencil, onSelect: () => onEditProduct(t.variantId!) }] : []),
              ...(onSaveComposite ? [{ label: "שמירת השולחן עם העיצוב כפריט מורכב בקטלוג", icon: PackagePlus, onSelect: onSaveComposite }] : []),
            ],
            lockItems(lock),
          ])}
          moreLabel="עוד פעולות לשולחן"
        />
      </Bar>
    );

  // Its size as the plan draws it: the stretched size when the row may be stretched, else its row's.
  const footprint = tableFootprint(t);
  const box = footprintBounds(footprint);
  const round = sizePanel ? sizePanel.axes.uniform : footprint.kind === "circle";
  const sizeWords = sizePanel
    ? round
      ? `⌀${cm(sizePanel.size.widthMm)}`
      : `${cm(sizePanel.size.widthMm)}×${cm(sizePanel.size.depthMm)}`
    : round
      ? `⌀${cm(box.w)}`
      : `${cm(box.w)}×${cm(box.h)}`;

  return groupsOf(
    "table",
    title,
    facts,
    [
      breaches.length > 0 && G("clearance", ShieldAlert, "מרחק ביטחון", breaches.length === 1 ? "חריגה אחת" : `${breaches.length} חריגות`, <BreachList breaches={breaches} />, true),
      // How full the top is. At rest the percentage rides the title row ("6 פריטים · 42% מהשטח"); the
      // group is here only when the items hold more than the top has room for.
      overflow &&
        G(
          "fill",
          Boxes,
          "ניצול שטח",
          ltr(`${pct}%`),
          <>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted">{count} פריטים על השולחן</span>
              <span className="nums font-semibold text-warn-ink">{pct}%</span>
            </div>
            <div role="progressbar" aria-label="ניצול שטח" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-warn" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-warn-ink">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              הפריטים חורגים משטח השולחן
            </p>
          </>,
          true,
        ),
      // What it is: its type (swapped from a picker) and its number (F-3.3: auto-running, editable
      // per table).
      G(
        "table",
        TableIcon,
        "שולחן",
        numberSummary(t.number, !!t.unnumbered),
        <TableNumberFields
          idPrefix="table"
          swap={swap?.kind === "tables" ? swap : null}
          swapLabel="סוג שולחן"
          onSwap={onSwap}
          number={t.number}
          unnumbered={!!t.unnumbered}
          duplicate={!t.unnumbered && t.number > 0 && duplicateNumbers(doc, benchOf).has(t.number)}
          onNumber={(v) => onRenumber(t.id, v)}
          onUnnumbered={(off) => onTablesNumbered([t.id], !off)}
          note="המספור רץ מאליו; מה שנקבע כאן גובר עליו, לשולחן הזה בלבד. 0 הוא שולחן הראש."
        />,
      ),
      // The chairs on the plan ARE this number — it came from the catalog row when the table was
      // dropped, and a head table that seats six rather than the standard twelve says so here.
      G(
        "seating",
        Armchair,
        "ישיבה",
        seatingSummary(t.seated ?? 0, seats),
        <SeatingFields
          idPrefix="table"
          seats={seats}
          seated={t.seated ?? 0}
          onSeats={(v) => onSeats(t.id, v)}
          onSeated={(v) => onSeated(t.id, v)}
          chair={t.chairVariantId ?? ""}
          chairLabel="סוג הכיסא"
          onChair={onChair ? (variantId) => onChair(t.id, variantId) : undefined}
        >
          {/* Which sides are laid. The catalog row says what a table of this kind does (a head table
              faces the room); a table pushed against a wall on THIS plan says so here, for itself.
              Drawn turned as it stands, so the side against the wall is the side against the wall. */}
          <div className="mt-2">
            <SeatSidesPicker
              footprint={footprint}
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
                  <button type="button" onClick={() => onBlockedSides(t.id, null)} className="font-medium text-accent transition-colors hover:text-accent-hover">
                    חזרה להגדרת הקטלוג
                  </button>
                </>
              )}
            </Note>
          </div>
        </SeatingFields>,
      ),
      G(
        "size",
        Scaling,
        "מידות",
        ltr(sizeWords),
        sizePanel ? (
          <SizeFields panel={sizePanel} onSize={onSize} />
        ) : (
          <>
            <PanelRow label={round ? "קוטר (ס״מ)" : "רוחב × עומק (ס״מ)"}>
              <span className="nums text-sm font-semibold text-ink">{ltr(round ? cm(box.w).toString() : `${cm(box.w)}×${cm(box.h)}`)}</span>
            </PanelRow>
            <Note>הגודל של סוג השולחן בקטלוג — שולחן מהסוג הזה לא נמתח על התוכנית. לגודל אחר: סוג שולחן אחר בקבוצה ״שולחן״.</Note>
          </>
        ),
      ),
      !!cloth &&
        G(
          "cloth",
          Shirt,
          "מפה",
          <ClothSummary cloth={cloth} />,
          <ClothFields
            cloth={cloth}
            options={clothOptions}
            onProduct={(productId) => onReplaceCloth(cloth.id, productId)}
            onShade={(variantId) => onVariant(cloth.id, variantId)}
            // Its contour — the hem the plan draws round the table (ClothDrape).
            onBorder={onBorder ? (b) => onBorder([cloth.id], b) : undefined}
            onAll={() => onApplyToAllTables(cloth.id)}
            onRemove={() => onRemovePlacement(cloth.id)}
          />,
        ),
      // What stands on it — the cloth is its own group above. A row selects that item. The design
      // pass's, like the dressing below it: the hall pass does not draw what stands on a table.
      !!onDressTable &&
        onTable.length > 0 &&
        G(
          "items",
          Sparkles,
          "על השולחן",
          onTable.length === 1 ? "פריט אחד" : `${onTable.length} פריטים`,
          <TableItems items={onTable} onSelect={onSelectItems ? (id) => onSelectItems([{ kind: "placement", id }]) : undefined} />,
        ),
      // Dressing: the designs saved from tables before it, and its whole dressing onto others in a
      // pattern. The design pass's — the hall pass lays tables out and does not dress them.
      !!onDressTable && G("designs", BookmarkPlus, "עיצובי שולחן", "שמירה והחלה", renderDesigns(t.id)),
      !!onDressTable && count > 0 && G("pattern", LayoutGrid, "דפוס", "החלה על שולחנות", renderPattern(t.id)),
      tableLookGroup(t, (style) => onStyleTable(t.id, style)),
    ],
    ["seating", "cloth"],
  );
}

/** "#4", or "ללא מספור" — a table's (or a block's) ״שולחן״ group read back. */
function numberSummary(number: number, unnumbered: boolean): ReactNode {
  return unnumbered ? "ללא מספור" : ltr(`#${number}`);
}

/** "8/12", or "ללא כסאות" — a ״ישיבה״ group read back. */
function seatingSummary(seated: number, seats: number): ReactNode {
  return seats > 0 ? ltr(`${seated}/${seats}`) : "ללא כסאות";
}

/** What a table (or a block, as the one table it is) is and its number: the type picker, the number
 *  field — which another unit may share — "ללא מספור", and a note. One body for both. */
function TableNumberFields({
  idPrefix,
  swap,
  swapLabel,
  onSwap,
  number,
  unnumbered,
  duplicate,
  onNumber,
  onUnnumbered,
  note,
}: {
  idPrefix: string;
  /** What it could be swapped for; null = no picker. */
  swap: SwapPanel | null;
  swapLabel: string;
  onSwap: (productId: string, all: boolean) => void;
  number: number;
  unnumbered: boolean;
  /** Another unit on the plan shows the same number. */
  duplicate: boolean;
  onNumber: (n: number) => void;
  onUnnumbered: (unnumbered: boolean) => void;
  note: string;
}) {
  return (
    <>
      {swap && <SwapPickRow swap={swap} onSwap={onSwap} label={swapLabel} />}
      {!unnumbered && (
        <PanelRow label="מספר שולחן" htmlFor={`${idPrefix}-number`}>
          <NumberField id={`${idPrefix}-number`} decimals={0} min={0} value={number} onChange={onNumber} className="w-20" />
        </PanelRow>
      )}
      {duplicate && <DuplicateNumber />}
      <div className="mt-2">
        <UnnumberedSwitch checked={unnumbered} onChange={onUnnumbered} />
      </div>
      <Note>{note}</Note>
    </>
  );
}

/** How many sit at a table (or round a block), how many of them are spoken for, and on which chair
 *  — the chair asked only once there are chairs, and over a block that mixes chairs it says so.
 *  `children` is what only a lone table has: which of its sides are laid. One body for both. */
function SeatingFields({
  idPrefix,
  seats,
  seated,
  onSeats,
  onSeated,
  chair,
  chairLabel,
  onChair,
  note,
  children,
}: {
  idPrefix: string;
  seats: number;
  seated: number;
  onSeats: (n: number) => void;
  onSeated: (n: number) => void;
  /** The chair round it ("" = the studio's default), null when a block's tables differ. */
  chair: string | null;
  chairLabel: string;
  /** Absent = no chair question. null = the studio's default again. */
  onChair?: (variantId: string | null) => void;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <PanelRow label="כסאות" htmlFor={`${idPrefix}-seats`}>
        <NumberField id={`${idPrefix}-seats`} decimals={0} min={0} value={seats} onChange={onSeats} className="w-20" />
      </PanelRow>
      {/* Occupancy only once there are chairs: a field reading 0/0 on a cocktail table nobody sits at
          is a question with no answer. */}
      {seats > 0 && (
        <PanelRow label="תפוסה" htmlFor={`${idPrefix}-seated`}>
          <NumberField id={`${idPrefix}-seated`} decimals={0} min={0} value={seated} onChange={onSeated} className="w-20" />
          <span className={"text-xs " + occupancyInk(seated, seats)}>מתוך {seats}</span>
        </PanelRow>
      )}
      {/* Which chair stands round it. Most rooms are one chair — the default — so the plan only names
          a table's chair where it differs; this is where it is made to differ. */}
      {seats > 0 && onChair && chairOptions().length > 0 && (
        <PanelRow label="כיסא" stack>
          <Select
            aria-label={chairLabel}
            value={chair === null ? "__mixed" : chair}
            options={[...(chair === null ? [{ value: "__mixed", label: "כיסאות שונים" }] : []), { value: "", label: defaultChairLabel() }, ...chairOptions()]}
            onChange={(v) => v !== "__mixed" && onChair(v || null)}
          />
        </PanelRow>
      )}
      {seats > 0 && children}
      {note && <Note>{note}</Note>}
    </>
  );
}

/** A table's (or a block's) ״מראה״: its own look, read back as its fill. At rest a table is drawn at
 *  its catalog row's weight (productStyle, components/footprint-shape.tsx), so that is the number
 *  shown for it — not the canvas's own 2.5 when the row says otherwise. */
function tableLookGroup(table: DesignTable, onChange: (style: ElementStyle | undefined) => void): PanelGroup {
  return G(
    "look",
    Palette,
    "מראה",
    table.style?.fill ? <Swatch color={table.style.fill} size={12} /> : "ברירת מחדל",
    <StyleFields
      style={table.style}
      onChange={onChange}
      strokeWidthDefault={(table.variantId ? resolve(table.variantId)?.product.appearance?.style?.strokeWidthPx : undefined) ?? 2.5}
    />,
  );
}

/** What stands on a table (or what a group of design items is made of), one row each: its picture's
 *  category (or its shade), its name, its shade and how many. A click selects it (absent = plain
 *  rows — a group's member cannot be selected out of its group). */
function TableItems({ items, onSelect }: { items: Placement[]; onSelect?: (id: string) => void }) {
  return (
    <>
      <div className="-mx-1.5 flex flex-col gap-px">
        {items.map((p) => {
          const r = resolve(p.variantId);
          const Icon = (r && CATEGORY_BY_ID[r.category]?.icon) || Sparkles;
          return (
            <PanelListRow
              key={p.id}
              glyph={
                r?.swatch ? (
                  <span aria-hidden className="h-3 w-3 rounded-full border border-border" style={{ backgroundColor: r.swatch }} />
                ) : (
                  <Icon aria-hidden className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
                )
              }
              label={r?.product.name ?? "פריט"}
              meta={[r?.variant?.name, p.quantity > 1 ? `×${p.quantity}` : null].filter(Boolean).join(" · ") || undefined}
              onClick={onSelect ? () => onSelect(p.id) : undefined}
            />
          );
        })}
      </div>
      {onSelect && <Note>לחיצה על פריט בוחרת אותו. להזזה ולסידור על השולחן — הלבשה.</Note>}
    </>
  );
}

/** A table's (or a block's) number and seats, typed in the quick bar. A table out of the numbering
 *  shows "—" and takes nothing — its ״שולחן״ group puts it back. */
function NumberAndSeats({
  number,
  unnumbered,
  onNumber,
  seats,
  onSeats,
}: {
  number: number;
  unnumbered: boolean;
  onNumber: (n: number) => void;
  seats: number;
  onSeats: (n: number) => void;
}) {
  return (
    <>
      <QuickLead icon={Hash} label="מספר השולחן" />
      <QuickNumber label="מספר השולחן" narrow min={0} value={unnumbered ? 0 : number} hideZero={unnumbered} placeholder={unnumbered ? "—" : undefined} disabled={unnumbered} onChange={onNumber} />
      <QuickSep />
      <QuickLead icon={Armchair} label="מושבים" />
      <QuickNumber label="מושבים" narrow min={0} value={seats} onChange={onSeats} />
      <QuickSep />
    </>
  );
}

/** The cloth a table wears, read back on its group's title row: its shade and its name. */
function ClothSummary({ cloth }: { cloth: Placement }) {
  const shade = shadesOf(cloth.variantId).find((s) => s.id === cloth.variantId);
  return (
    <>
      {shade?.swatch && <Swatch color={shade.swatch} size={12} />}
      <span className="truncate">{resolve(cloth.variantId)?.product.name ?? "מפה"}</span>
    </>
  );
}

/** A worn cloth's fields — which cloth (a picker), its shade, its contour, onto every table, off.
 *  One body for a table's cloth and a block's, which differ only in what each change reaches. */
function ClothFields({
  cloth,
  options,
  onProduct,
  onShade,
  onBorder,
  onAll,
  onRemove,
  note,
}: {
  cloth: Placement;
  /** The studio's tablecloths, by product. */
  options: { value: string; label: string }[];
  onProduct: (productId: string) => void;
  onShade: (variantId: string) => void;
  onBorder?: (border: Border | null | undefined) => void;
  onAll: () => void;
  onRemove: () => void;
  note?: string;
}) {
  const product = resolve(cloth.variantId)?.product;
  const shades = shadesOf(cloth.variantId);
  const shade = shades.find((s) => s.id === cloth.variantId);
  const name = product?.name ?? "מפה";
  return (
    <>
      {options.length > 1 ? (
        <PickRow swatch={shade?.swatch} glyph={shade?.swatch ? undefined : <Shirt className="h-4 w-4 text-muted" strokeWidth={1.75} />} name={name} meta={shade?.name} pickerLabel="בחירת מפה" pickerIcon={Shirt}>
          {(close) => (
            <OptionList
              options={options}
              value={product?.id ?? ""}
              onPick={(v) => {
                onProduct(v);
                close();
              }}
            />
          )}
        </PickRow>
      ) : (
        <div className="flex items-center gap-2.5 rounded-md border border-inset-border bg-inset p-2">
          <Swatch color={shade?.swatch} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{name}</span>
            {shade && <span className="block truncate text-xs text-muted">{shade.name}</span>}
          </span>
        </div>
      )}
      {shades.length > 0 && (
        <div className="mt-3">
          <SwatchPicker options={shades} value={cloth.variantId} onChange={onShade} label="גוון המפה" />
        </div>
      )}
      {onBorder && (
        <div className="mt-3 border-t border-border-soft pt-2">
          <span className={fieldLabelClassName}>קונטור</span>
          <BorderPanel own={cloth.border} row={cleanBorder(product?.appearance?.border)} category="tablecloths" onBorder={onBorder} idPrefix={`border-${cloth.id}`} />
        </div>
      )}
      {note && <Note>{note}</Note>}
      <Button size="sm" variant="outline" className="mt-3 w-full" onClick={onAll}>
        <Copy className="h-3.5 w-3.5" strokeWidth={2} />
        על כל השולחנות
      </Button>
      <Button size="sm" variant="danger" className="mt-1 w-full" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        הסרת המפה
      </Button>
    </>
  );
}

/** A picker's list of plain choices — the current one ticked, a pick applies. */
function OptionList({ options, value, onPick }: { options: { value: string; label: string }[]; value: string; onPick: (value: string) => void }) {
  return (
    <ul className="scroll-slim -mx-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto px-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <li key={o.value}>
            <button
              type="button"
              disabled={on}
              aria-current={on || undefined}
              onClick={() => onPick(o.value)}
              className={"flex w-full items-center gap-2.5 rounded-sm p-1.5 text-start transition-colors " + (on ? "cursor-default bg-accent-tint" : "hover:bg-bg")}
            >
              <span className={"min-w-0 flex-1 truncate text-sm font-medium " + (on ? "text-accent" : "text-ink")}>{o.label}</span>
              {on && <Check className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />}
            </button>
          </li>
        );
      })}
    </ul>
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
  heights,
  lengthMm,
  depthMm,
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
  /** Whether the two height rows are drawn here — the standalone bar shows them in its own
   *  "גובה" chip, the stage's edge bar in this panel. Default on. */
  heights?: boolean;
  /** The strip's length and depth, for a sofa's run and seat-depth fields (what "the whole
   *  length" and "the half strip" are). */
  lengthMm?: number;
  depthMm?: number;
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
      {/* A sofa's own size: how long a run of the banquette it takes (centred), and how deep its
          seat is from the edge in — BenchSide.widthMm / depthMm. Blank = the whole length / the
          half strip, which is what every sofa side was. */}
      {row.kind === "sofa" && (
        <>
          <PanelRow label="רוחב הספה (ס״מ)" htmlFor={`${idPrefix}-${key}-sw`}>
            {row.widthMm !== undefined && lengthMm !== undefined && row.widthMm < lengthMm && <BarButton icon={Undo2} label={`לכל האורך (${cmOf(lengthMm)})`} onClick={() => onSide(key, { widthMm: null })} />}
            <NumberField id={`${idPrefix}-${key}-sw`} decimals={0} min={60} max={1200} commitOnBlur value={cmOf(row.widthMm ?? lengthMm ?? 0)} onChange={(cm) => onSide(key, { widthMm: cm * 10 })} className="w-20" />
          </PanelRow>
          <PanelRow label="עומק המושב (ס״מ)" htmlFor={`${idPrefix}-${key}-sd`}>
            <NumberField id={`${idPrefix}-${key}-sd`} decimals={0} min={20} max={150} commitOnBlur value={cmOf(row.depthMm ?? 0)} onChange={(cm) => onSide(key, { depthMm: cm * 10 })} className="w-20" />
            <span className="text-xs text-muted">{depthMm !== undefined ? `מתוך ${cmOf(depthMm)} של הבנקט` : "מהקצה פנימה"}</span>
          </PanelRow>
        </>
      )}
    </div>
  );
  const hasChairs = heights !== false && (back.kind === "chairs" || front.kind === "chairs");
  const hasSofa = heights !== false && (back.kind === "sofa" || front.kind === "sofa");
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
  /** Which selection this reading is of — the axis chosen in ״מרווח״ is kept for it (useSpacingAxis). */
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

/** What a swap list remembers while its trigger stays up: what was typed into its search, and whether
 *  the swap reaches the selection or every one like it. Held by the TRIGGER (the chip, the pick row),
 *  not the list, which mounts only while its panel is open. */
function useSwapScope(swap: SwapPanel) {
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
  return { query, setQuery, scope, setScope };
}
type SwapScope = ReturnType<typeof useSwapScope>;

/** "120×180 · 12 כסאות" — a swap row's facts. */
function swapFacts(swap: SwapPanel, p: Product): string {
  const seats = Number(p.categoryFields?.seats);
  return [formatDimensions(p.dimensions), swap.kind === "tables" && seats > 0 ? `${seats} כסאות` : null].filter(Boolean).join(" · ");
}

/** "Change these for that" as a group's pick row: what they are now, and "החלפה" opens the same list
 *  as a picker beside the panel — a pick applies and the picker goes. `current` names what stands
 *  there when it is no catalog row of the list (the venue's own curtain). */
function SwapPickRow({
  swap,
  onSwap,
  label,
  current: named,
}: {
  swap: SwapPanel;
  onSwap: (productId: string, all: boolean) => void;
  label: string;
  current?: { name: string; meta?: string };
}) {
  const state = useSwapScope(swap);
  const current = swap.options.find((p) => p.id === swap.current);
  const many = swap.kind === "tables" ? "שולחנות" : "פריטים";
  return (
    <PickRow
      glyph={current ? <span className="block h-full w-full overflow-hidden rounded-sm"><ProductImage product={current} /></span> : <Replace className="h-4 w-4 text-muted" strokeWidth={1.75} />}
      name={current?.name ?? named?.name ?? `${swap.count} ${many}`}
      meta={current ? swapFacts(swap, current) : named?.meta}
      pickerLabel={label}
      pickerIcon={Replace}
    >
      {(close) => (
        <SwapList
          swap={swap}
          state={state}
          onSwap={(productId, all) => {
            onSwap(productId, all);
            close();
          }}
        />
      )}
    </PickRow>
  );
}

/** The catalog's rows of the same kind, each as the rail shows it, and — when the plan holds more of
 *  the same thing than are selected — whether to change all of them. */
function SwapList({ swap, onSwap, state }: { swap: SwapPanel; onSwap: (productId: string, all: boolean) => void; state: SwapScope }) {
  const { query, setQuery, scope, setScope } = state;
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

  return (
    <>
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
                          <span className="nums block truncate text-xs text-muted">{swapFacts(swap, p)}</span>
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
    </>
  );
}

const cm = (mm: number) => Math.round(mm / 10);
const metres = (mm: number) => `${(mm / 1000).toFixed(2)} מ׳`;

/** THE BAR'S "⋯" — one on every quick bar (QuickTail's), holding what a selection CAN be asked but
 *  seldom is, in the same sections in the same order wherever it appears: the clipboard, how it is
 *  drawn (flip, the floor stack), ways to build a selection from it, its catalog row (edit it; save
 *  the selection as an item), what it can be made into or taken apart to, and the lock. Each section
 *  is its own group of rows: this flattens them into one list, a hairline before every section after
 *  the first.
 *
 *  It replaced three icon menus (היפוך, סדר בערימה, בחירה) and four loose icons (the catalog's
 *  pencil, the composite save, "הפיכה לבמה", "פירוק לפלטות") that stood among the subjects a bar is
 *  ABOUT — a dressed table's bar ran to nineteen controls, and the rare ones sat between the common
 *  ones in no order a hand could learn. */
function flatSections(sections: MenuItem[][]): MenuItem[] {
  const items: MenuItem[] = [];
  for (const section of sections) section.forEach((it, i) => items.push(i === 0 && items.length > 0 ? { ...it, separated: true } : it));
  return items;
}

/** The clipboard, the first section of a quick bar's ⋯: the header's העתקה / גזירה went with the
 *  toolbar, Ctrl+C / Ctrl+X stay. The bar's own copy button is a DUPLICATE; this copy can be pasted
 *  into another sketch. */
function clipboardItems(onCopy?: () => void, onCut?: () => void): MenuItem[] {
  return [
    ...(onCopy ? [{ label: "העתקה · Ctrl+C", icon: Copy, onSelect: onCopy }] : []),
    ...(onCut ? [{ label: "גזירה · Ctrl+X", icon: Scissors, onSelect: onCut }] : []),
  ];
}

/** What the "…" says about pinning the selection in place: one row, worded by what it would do. */
export interface LockPanel {
  /** Every selected table and item is already locked. */
  locked: boolean;
  onToggle: () => void;
}

/** "נעילה במקום" / "שחרור הנעילה" — the last section of every bar's "…" (lib/design-document/
 *  types.ts DesignTable.locked). Empty when nothing selected can be locked. */
function lockItems(lock: LockPanel | null): MenuItem[] {
  if (!lock) return [];
  return lock.locked
    ? [{ label: "שחרור הנעילה · Ctrl+Shift+L", icon: LockOpen, onSelect: lock.onToggle }]
    : [{ label: "נעילה במקום — בלי גרירה, ידיות או מחיקה · Ctrl+Shift+L", icon: Lock, onSelect: lock.onToggle }];
}

/** Turn the selection over, side to side or top to bottom. Empty where nothing selected can be. */
function mirrorItems(onMirror?: (axis: MirrorAxis) => void): MenuItem[] {
  if (!onMirror) return [];
  return [
    { label: "היפוך מצד לצד", icon: FlipHorizontal2, onSelect: () => onMirror("horizontal") },
    { label: "היפוך מלמעלה למטה", icon: FlipVertical2, onSelect: () => onMirror("vertical") },
  ];
}

/** "Save this stage as a template": a name, and the button — a stage's (or a group's) ״תבנית״ group. */
function SaveTemplateFields({ onSave, note }: { onSave: (name: string) => void; note?: string }) {
  const [name, setName] = useState("");
  return (
    <>
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
    </>
  );
}

/** Figures that must read left to right inside a Hebrew line of TEXT ("5.8×5") — an LRI…PDI isolate,
 *  where `ltr()` (an element) cannot go: a bar's facts are a string. */
const iso = (t: string) => `⁦${t}⁩`;

/** What finishes a stage's edges (or a group's, over every member), by kind: how many flights and
 *  how many metres of each. A `…Counted` that is false adds "(אין בקטלוג)" — the catalog has no row
 *  to quote that kind by; absent says nothing (a single stage's list never did). */
interface EdgeTotals {
  flights: number;
  stairsMm: number;
  benchMm: number;
  benchSeats: number;
  barrierMm: number;
  backdropMm: number;
  ramps: number;
  stairsCounted?: boolean;
  benchCounted?: boolean;
  barrierCounted?: boolean;
}

function edgeTotals(edges: readonly StageEdgeRow[]): EdgeTotals {
  const of = (k: EdgeKindId) => edges.filter((e) => e.kind === k);
  const run = (k: EdgeKindId) => of(k).reduce((t, e) => t + e.widthMm, 0);
  return {
    flights: of("stairs").length,
    stairsMm: run("stairs"),
    benchMm: run("bench"),
    benchSeats: of("bench").reduce((t, e) => t + e.seats, 0),
    barrierMm: run("barrier"),
    backdropMm: run("backdrop"),
    ramps: of("ramp").length,
  };
}

/** A stage's (or a group's) ״קצוות״: what stands on its edges, the corner pieces where two runs meet,
 *  the bare edge closed in one go, and — a single stage — one more item, clicked onto a side. One
 *  body for both; they differ in what they count over and in their words. */
function EdgeFinishFields({
  totals,
  corners,
  gapsMm,
  gapLine,
  closedLine,
  skirtMm,
  onFill,
  onAdd,
  note,
}: {
  totals: EdgeTotals | null;
  /** The corner-pieces switch; `value` undefined = a group whose stages differ. Null = not offered. */
  corners: { label: string; value: boolean | undefined; onChange: (on: boolean) => void } | null;
  gapsMm: number;
  /** The bare edge in words, over the buttons that close it. */
  gapLine: string;
  /** What to say when nothing is bare; absent = nothing. */
  closedLine?: string;
  skirtMm?: number;
  onFill: (kind: EdgeKindId) => void;
  /** Click a side of the stage to put an item of this kind there. Absent = not offered (a group). */
  onAdd?: (kind: EdgeKindId) => void;
  note: string;
}) {
  const m = (mm: number) => String(Math.round(mm / 10) / 100);
  const unquoted = (counted?: boolean) => (counted === false ? " (אין בקטלוג)" : "");
  const rows: [string, string][] = [];
  if (totals) {
    if (totals.flights > 0) rows.push([`מדרגות${unquoted(totals.stairsCounted)}`, `${totals.flights} · ${m(totals.stairsMm)} מ׳`]);
    if (totals.benchMm > 0) rows.push([`בנקט${unquoted(totals.benchCounted)}`, `${m(totals.benchMm)} מ׳ · ${totals.benchSeats} מקומות`]);
    if (totals.barrierMm > 0) rows.push([`מחסום${unquoted(totals.barrierCounted)}`, `${m(totals.barrierMm)} מ׳`]);
    if (totals.backdropMm > 0) rows.push(["קיר רקע", `${m(totals.backdropMm)} מ׳`]);
    if (totals.ramps > 0) rows.push(["רמפה", String(totals.ramps)]);
  }
  return (
    <>
      {rows.length > 0 && (
        <ul className="mb-2 space-y-1 text-sm">
          {rows.map(([kind, figure]) => (
            <li key={kind} className="flex justify-between gap-3">
              <span className="text-ink">{kind}</span>
              <span className="nums text-muted">{figure}</span>
            </li>
          ))}
        </ul>
      )}
      {corners && (
        <div className="mb-2">
          <Segmented
            label={corners.label}
            value={corners.value === false ? "off" : "on"}
            options={[
              ["on", "פינה מלאה"],
              ["off", "פתוחה"],
            ] as const}
            onChange={(v) => corners.onChange(v === "on")}
          />
        </div>
      )}
      {gapsMm > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-alert-ink">{gapLine}</p>
          <div className="flex gap-1">
            {(["stairs", "bench", "barrier"] as const).map((k) => (
              <Button key={k} size="sm" variant="outline" className="flex-1" aria-label={`${EDGE_KIND_LABEL[k]} בכל השפה הפתוחה`} title={`${EDGE_KIND_LABEL[k]} בכל השפה הפתוחה`} onClick={() => onFill(k)}>
                {EDGE_KIND_LABEL[k]}
              </Button>
            ))}
          </div>
        </div>
      ) : closedLine ? (
        <p className="text-sm text-ink">{closedLine}</p>
      ) : null}
      {skirtMm !== undefined && skirtMm > 0 && <p className="mt-2 text-xs text-muted">{`חצאית: ${m(skirtMm)} מ׳`}</p>}
      {onAdd && (
        <div className="mt-3">
          <span className="mb-1 block text-xs font-medium text-ink-soft">הוספה — ואז לחיצה על צד הבמה</span>
          <div className="grid grid-cols-2 gap-1">
            {EDGE_KINDS.map((k) => (
              <Button key={k} size="sm" variant="soft" aria-label={`הוספת ${EDGE_KIND_LABEL[k]}`} icon={<Plus className="h-3.5 w-3.5" strokeWidth={2.25} />} onClick={() => onAdd(k)}>
                {EDGE_KIND_LABEL[k]}
              </Button>
            ))}
          </div>
        </div>
      )}
      <Note>{note}</Note>
    </>
  );
}

/** A stage's (or a group's) ״בנויה מ״: its decks by size and the skirt its open sides need, and
 *  whether a deck may reach past the line. One body for both. */
function BuiltFromFields({
  decks,
  skirtMm,
  skirtCounted,
  exceed,
  exceedLabel,
  onExceed,
  empty,
  note,
}: {
  decks: { name: string; count: number }[];
  skirtMm: number;
  skirtCounted: boolean;
  /** On / off — undefined when a group's stages differ (shown off; a choice sets every one). */
  exceed: boolean | undefined;
  exceedLabel: string;
  onExceed?: (on: boolean) => void;
  /** What to say when no deck fits. */
  empty: string;
  note: ReactNode;
}) {
  const m = (mm: number) => String(Math.round(mm / 10) / 100);
  return (
    <>
      {decks.length > 0 ? (
        <ul className="space-y-1 text-xs">
          {decks.map((d) => (
            <li key={d.name} className="flex justify-between gap-3">
              <span className="text-ink">{d.name}</span>
              <span className="nums font-semibold text-ink">×{d.count}</span>
            </li>
          ))}
          {skirtMm > 0 && (
            <li className="flex justify-between gap-3 border-t border-border-soft pt-1">
              <span className="text-ink">חצאית{skirtCounted ? "" : " (אין בקטלוג)"}</span>
              <span className="nums font-semibold text-ink">{ltr(`${m(skirtMm)} מ׳`)}</span>
            </li>
          )}
        </ul>
      ) : (
        <Note>{empty}</Note>
      )}
      {onExceed && (
        <div className="mt-2">
          <Segmented
            label={exceedLabel}
            value={exceed === true ? "on" : "off"}
            options={[
              ["off", "בתוך הקו"],
              ["on", "מותר לחרוג"],
            ] as const}
            onChange={(v) => onExceed(v === "on")}
          />
        </div>
      )}
      <Note>{note}</Note>
    </>
  );
}

/** What covers a stage's deck, in words: the row's name, "פלטות חשופות", or "שונים" over a group whose
 *  stages differ (undefined). */
function surfaceName(value: string | null | undefined, options: { value: string; label: string }[]): string {
  return value === undefined ? "שונים" : value ? (options.find((o) => o.value === value)?.label ?? "—") : "פלטות חשופות";
}

/** A stage's (or a group's) ״משטח״: what covers the deck, chosen from a picker beside the panel (a
 *  `stage-surfaces` row, or bare decks) — or, when the catalog has none, said, with nothing to pick. */
function SurfaceFields({
  value,
  options,
  onPick,
  pickerLabel,
  note,
}: {
  value: string | null | undefined;
  options: { value: string; label: string }[];
  onPick: (variantId: string | null) => void;
  pickerLabel: string;
  note: string;
}) {
  const name = surfaceName(value, options);
  const glyph = <Layers2 className="h-4 w-4 text-muted" strokeWidth={1.75} />;
  return (
    <>
      {options.length > 0 ? (
        <PickRow glyph={glyph} name={name} pickerLabel={pickerLabel} pickerIcon={Layers2}>
          {(close) => (
            <OptionList
              options={[{ value: "", label: "ללא — פלטות חשופות" }, ...options]}
              value={value === undefined ? "__mixed" : (value ?? "")}
              onPick={(v) => {
                onPick(v || null);
                close();
              }}
            />
          )}
        </PickRow>
      ) : (
        <div className="flex items-center gap-2.5 rounded-md border border-inset-border bg-inset p-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-surface">{glyph}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{name}</span>
        </div>
      )}
      <Note>{note}</Note>
    </>
  );
}

/** The size fields — a table's and an item's ״מידות״ group. */
function SizeFields({ panel, onSize, labels }: { panel: SizePanel; onSize: (size: { widthMm: number; depthMm: number } | null) => void; /** An aisle's two numbers are its length and its width across. */ labels?: { width: string; depth: string } }) {
  const { size, catalog, axes, spec, custom } = panel;
  const step = spec.stepMm || 100;
  const range = (r?: { minMm: number; maxMm: number }) => (r ? `${cm(r.minMm)}–${cm(r.maxMm)}` : null);
  return (
    <>
      {axes.width && spec.width && (
        <PanelRow label={axes.uniform ? "קוטר" : (labels?.width ?? "רוחב")} htmlFor="resize-w">
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
        <PanelRow label={labels?.depth ?? "עומק"} htmlFor="resize-d">
          <NumberField
            id="resize-d"
            decimals={0}
            min={cm(spec.depth.minMm)}
            max={cm(spec.depth.maxMm)}
            step={cm(spec.depth.stepMm || step)}
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
    </>
  );
}

/** The safety distances this thing is not being given, by the other thing's name — every kind's
 *  ״מרחק ביטחון״ group, in warn ink. */
function BreachList({ breaches }: { breaches: { other: string; distance: number; required: number }[] }) {
  return (
    <>
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
    </>
  );
}

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

/** Which way several things' spacing is measured: along the plan's width, its depth, or — a pair —
 *  straight across between them. */
type SpacingAxis = "x" | "y" | "direct";
const SPACING_AXIS_LABEL: Record<SpacingAxis, string> = { x: "אופקי", y: "אנכי", direct: "ישיר" };

// The axis chosen for the selection now — ONE choice for the quick bar's number and the ״מרווח״
// group's Segmented, which are two renders of Inspector that share no state. Kept for one selection
// (Spacing.key) and for this page's life only: a new selection starts on the axis it spans more.
let spacingChoice: { key: string; axis: SpacingAxis } | null = null;
const spacingListeners = new Set<() => void>();
function subscribeSpacing(listener: () => void) {
  spacingListeners.add(listener);
  return () => {
    spacingListeners.delete(listener);
  };
}

function useSpacingAxis(spacing: Spacing | null): [SpacingAxis, (axis: SpacingAxis) => void] {
  const key = spacing?.key ?? "";
  const chosen = useSyncExternalStore(
    subscribeSpacing,
    () => (spacingChoice?.key === key ? spacingChoice.axis : null),
    () => null,
  );
  const choose = useCallback(
    (axis: SpacingAxis) => {
      spacingChoice = { key, axis };
      spacingListeners.forEach((l) => l());
    },
    [key],
  );
  const fallback = spacing?.axis ?? "x";
  // "Straight across" is a pair's; a selection that grew past two goes back to its own axis.
  return [chosen === null || (chosen === "direct" && spacing?.count !== 2) ? fallback : chosen, choose];
}

/** The air there is now along an axis — null when the gaps differ (no one number), negative when
 *  they overlap on it. */
function spacingGap(spacing: Spacing, axis: SpacingAxis): number | null {
  return axis === "direct" ? spacing.direct : spacing[axis];
}

function spacingWords(gap: number | null): string {
  return gap === null ? "—" : gap < 0 ? "חופפים" : metres(gap);
}

/** ״מרווח״ — the air between the selected things: the axis it is measured along (the quick bar's
 *  number reads the same), what it is now, a gap typed and applied. The first one picked stays put. */
function SpacingFields({
  spacing,
  axis,
  onAxis,
  onSpace,
}: {
  spacing: Spacing;
  axis: SpacingAxis;
  onAxis: (axis: SpacingAxis) => void;
  onSpace: (gapMm: number, mode: SpacingAxis) => void;
}) {
  const current = spacingGap(spacing, axis);
  // The field reads the gap there is now — the bar's number — until something is typed into it; a
  // new reading (another axis, a gap applied from the bar, a drag) puts the field back on it. With
  // no one gap to read, it offers a metre.
  const seed = Math.max(0, cm(current ?? 1000));
  const [gapCm, setGapCm] = useState(seed);
  const [seededFrom, setSeededFrom] = useState(seed);
  if (seed !== seededFrom) {
    setSeededFrom(seed);
    setGapCm(seed);
  }
  const options: (readonly [SpacingAxis, string])[] = [
    ["x", SPACING_AXIS_LABEL.x],
    ["y", SPACING_AXIS_LABEL.y],
    ...(spacing.count === 2 ? ([["direct", SPACING_AXIS_LABEL.direct]] as const) : []),
  ];
  return (
    <>
      <Segmented label="נמדד" value={axis} options={options} onChange={onAxis} />
      <p className="mt-2 text-xs text-muted">
        עכשיו: <span className="nums font-medium text-ink">{spacingWords(current)}</span>
      </p>
      <PanelRow label="מרווח (ס״מ)" htmlFor="spacing-gap">
        <NumberField id="spacing-gap" decimals={0} min={0} value={gapCm} onChange={setGapCm} className="w-24" />
      </PanelRow>
      <Button size="sm" className="mt-2 w-full" onClick={() => onSpace(gapCm * 10, axis)}>
        <MoveHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
        החלת המרווח
      </Button>
      <Note>
        {spacing.first} נשאר במקומו
        {spacing.count === 2 ? " והשני זז." : " והשאר מסתדרים בשורה ממנו."}{" "}
        {axis === "direct" ? "נמדד מקצה לקצה, לאורך הקו בין המרכזים." : "נמדד בין קצוות הפריטים, לאורך הציר."} שולחן נמדד מקצה השולחן עצמו — בלי הכיסאות.
        המרווח שבסרגל נמדד לאורך אותו ציר.
      </Note>
    </>
  );
}

const SPIN_LABEL: Record<SpinMode, string> = { together: "סביב מרכז משותף", each: "כל אחד סביב עצמו" };

/** ״סיבוב״ for several things: what the canvas's rotate handle does with them. The angle in the
 *  quick bar is another question — it stands each of them at the angle typed. */
function SpinFields({ spin, onSpin }: { spin: SpinMode; onSpin: (mode: SpinMode) => void }) {
  return (
    <>
      <Segmented
        label="ידית הסיבוב"
        value={spin}
        options={[
          ["together", SPIN_LABEL.together],
          ["each", SPIN_LABEL.each],
        ] as const}
        onChange={onSpin}
      />
      <Note>
        הידית שעל התוכנית מסובבת את כולם יחד סביב המרכז המשותף (בלוק שמכוונים לחדר), או כל אחד במקומו (שולחנות פזורים באולם, שאחרת היו
        מסתובבים סביב אמצע החדר). הזווית שבסרגל מעמידה כל אחד על הזווית שנכתבה.
      </Note>
    </>
  );
}

/** ״ישיבה״ for several tables: one chair count and one chair over all of them. Writes only — the
 *  tables may seat different numbers and stand round different chairs, so the fields read blank. */
function BulkSeatsFields({ count, onSeats, onChair }: { count: number; onSeats: (seats: number) => void; onChair?: (variantId: string | null) => void }) {
  return (
    <>
      <PanelRow label={`כסאות לכל שולחן — ${count} שולחנות`} htmlFor="bulk-seats">
        {/* Blank rather than 0: this field REPORTS nothing and only WRITES. A resting 0 would read as a
            claim that they all seat nobody. */}
        <NumberField id="bulk-seats" aria-label="כסאות לכל שולחן" decimals={0} min={0} value={0} hideZero placeholder="—" onChange={onSeats} className="w-20" />
      </PanelRow>
      {/* Which chair, over the lot — the head table's armchairs set in one go. */}
      {onChair && chairOptions().length > 0 && (
        <PanelRow label="כיסא" stack>
          <Select
            aria-label="סוג הכיסא לשולחנות שנבחרו"
            value=""
            options={[{ value: "", label: "—" }, { value: "__default", label: defaultChairLabel() }, ...chairOptions()]}
            onChange={(v) => v && onChair(v === "__default" ? null : v)}
          />
        </PanelRow>
      )}
      <Note>מה שנכתב כאן חל על כל השולחנות שנבחרו (בלוק נספר כשולחן אחד). התפוסה נשארת של כל שולחן.</Note>
    </>
  );
}

/** ״העתקת עיצוב״ — the copied table's dressing worn by the selected tables: added to what is on them,
 *  or in its place, which asks first (the cloths and items on them are taken off). */
function CopyDressingFields({ count, onApply }: { count: number; onApply: (mode: "add" | "replace") => void }) {
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Segmented
        label="אופן ההחלה"
        value={mode}
        options={[
          ["add", "הוספה"],
          ["replace", "החלפה"],
        ] as const}
        onChange={setMode}
      />
      <Button size="sm" className="mt-3 w-full" onClick={() => (mode === "replace" ? setConfirming(true) : onApply("add"))}>
        <Copy className="h-3.5 w-3.5" strokeWidth={2} />
        החל על הנבחרים
      </Button>
      <Note>
        {mode === "replace" ? "המפה והפריטים שעל השולחנות שנבחרו יוסרו, ובמקומם העיצוב שהועתק." : "העיצוב שהועתק מתווסף למה שכבר על השולחנות שנבחרו."} השולחן
        שהועתק (Ctrl+C) לא נספר.
      </Note>
      <ConfirmDialog
        open={confirming}
        title={`להחליף את העיצוב של ${count} שולחנות?`}
        body="המפה והפריטים הקיימים על השולחנות שנבחרו יוסרו ויוחלפו בעיצוב שהועתק."
        confirmLabel="החלפה"
        onConfirm={() => {
          setConfirming(false);
          onApply("replace");
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}

/** Bring to front / send to back, across the whole floor stack — a table over a stage, a plinth under
 *  a rug (lib/design-document/stacking.ts). Also Ctrl+] / Ctrl+[ and the canvas's right-click menu;
 *  the shortcuts are written between LRMs so the brackets are not mirrored by the Hebrew around them. */
function stackItems(show: boolean, onRestack: (to: "front" | "back") => void): MenuItem[] {
  if (!show) return [];
  return [
    { label: "לחזית · \u200eCtrl+]\u200e", icon: BringToFront, onSelect: () => onRestack("front") },
    { label: "לאחור · \u200eCtrl+[\u200e", icon: SendToBack, onSelect: () => onRestack("back") },
  ];
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

/** "ברירת מחדל — כיסא אבירים": the studio's default chair, named, in every chair list on the bars. */
function defaultChairLabel(): string {
  const d = defaultChair();
  const name = d ? chairOptions().find((o) => o.value === d)?.label : undefined;
  return name ? `ברירת מחדל — ${name}` : "ברירת מחדל";
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
type RowSpreadProps = {
  doc: DesignDocumentContent;
  sourceId: string;
  name: string;
  heightMm?: number;
  onSpread: (opts: { axis: "row" | "column"; count: number; wave?: HeightWave | null }) => void;
};

/** The row spread's fields — in a hung item's ״מעל שולחנות״ group. */
function RowSpreadFields({ doc, sourceId, name, heightMm, onSpread }: RowSpreadProps) {
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
    <>
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
    </>
  );
}

/** A drape's rail — its ״מסילה״ group (lib/studio/rail.ts): on a wall or a side, the whole of it again
 *  and — on a side — the other side of it; on a rod, its height and its ר (no post under its end); on
 *  any, how far the cloth comes down (blank = to the floor). The stretch itself is the grips on the
 *  plan; a rod of its own, drawn on the canvas, is the quick bar's verb. */
function DrapeRailFields({
  rail,
  run,
  dropMm,
  bare,
  onBareRod,
  onWhat,
  onRail,
  editable,
}: {
  rail: Rail;
  run: { lengthMm: number } | null;
  dropMm?: number;
  /** A bare rod (no cloth on it): no drop to type, and its own words. */
  bare?: boolean;
  /** Take the curtain down and leave its rod (a curtain on a rod, while the studio has a rod row). */
  onBareRod?: () => void;
  onWhat: string;
  onRail: (rail: Rail, dropMm?: number | null) => void;
  /** The host writes any rail (onRail) — otherwise only a wall's stretch is offered. */
  editable: boolean;
}) {
  const whole = (rail.type === "wall" || rail.type === "side") && Math.min(rail.from, rail.to) === 0 && Math.max(rail.from, rail.to) === 1;
  return (
    <>
      {!run && <Note>{rail.type === "side" ? "הפריט שהווילון היה תלוי עליו הוסר — מוחקים את הווילון ותולים אחד חדש, או ״ציור על מוט״." : "הקיר שהווילון היה תלוי עליו נמחק — מוחקים את הווילון ותולים אחד חדש, או ״ציור על מוט״."}</Note>}
      {(rail.type === "wall" || rail.type === "side") && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" disabled={!run || whole} onClick={() => onRail({ ...rail, from: 0, to: 1 })}>
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
            {rail.type === "wall" ? "על כל הקיר" : "על כל הצד"}
          </Button>
          {rail.type === "side" && editable && (
            <Button size="sm" variant="outline" className="flex-1" disabled={!run} onClick={() => onRail({ ...rail, out: rail.out === 1 ? -1 : 1 })}>
              {rail.out === 1 ? "לצד הפנימי" : "לצד החיצוני"}
            </Button>
          )}
        </div>
      )}
      {rail.type === "rod" && editable && (
        <>
          <PanelRow label="אורך המוט (ס״מ)" htmlFor="rod-length">
            <NumberField id="rod-length" decimals={0} min={ROD_MIN_MM / 10} max={6000} commitOnBlur value={Math.round(rodRunMm(rail) / 10)} onChange={(v) => onRail(rodWithLength(rail, v * 10))} className="w-24" />
          </PanelRow>
          <PanelRow label="עובי המוט (מ״מ)" htmlFor="rod-thick">
            <NumberField id="rod-thick" decimals={0} min={ROD_THICK_MIN_MM} max={ROD_THICK_MAX_MM} commitOnBlur value={rodThickMm(rail)} onChange={(v) => onRail(rodWithThick(rail, v))} className="w-24" />
          </PanelRow>
          <PanelRow label="גובה המוט (ס״מ)" htmlFor="rod-height">
            <NumberField id="rod-height" decimals={0} min={50} max={800} step={10} commitOnBlur value={Math.round(rail.heightMm / 10)} onChange={(cm) => onRail({ ...rail, heightMm: Math.round(cm * 10) })} className="w-24" />
          </PanelRow>
          <SwitchRow
            checked={rail.cantilever === "end"}
            onChange={(on) => onRail(on ? { ...rail, cantilever: "end" } : (({ cantilever: _c, ...rest }) => (void _c, rest))(rail))}
            label="ללא עמוד בקצה (ר)"
            hint={`הזרוע יוצאת מהעמוד האחרון בלי עמוד מתחתיה — עד ${CANTILEVER_MAX_MM / 1000} מ׳`}
          />
        </>
      )}
      {editable && !bare && (
        <PanelRow label="אורך הבד (ס״מ)" htmlFor="drape-drop">
          <NumberField id="drape-drop" decimals={0} min={0} max={1200} hideZero placeholder="עד הרצפה" value={dropMm ? Math.round(dropMm / 10) : 0} onChange={(v) => onRail(rail, v > 0 ? v * 10 : null)} className="w-24" />
        </PanelRow>
      )}
      {onBareRod && (
        <Button size="sm" variant="outline" className="w-full" onClick={onBareRod}>
          הורדת הווילון — המוט נשאר
        </Button>
      )}
      <Note>
        {bare
          ? "גוררים וילון מהקטלוג אל המוט כדי לתלות אותו. גוררים עמוד כדי להזיז אותו, ואת המוט עצמו כדי להעביר אותו; ״ציור המוט מחדש״ בסרגל — לחיצה לכל עמוד. מתומחר לפי אורכו."
          : rail.type === "rod"
            ? "״ציור המוט מחדש״ בסרגל: לחיצה לכל עמוד, Enter או לחיצה כפולה לסיום. גוררים עמוד כדי להזיז אותו, ואת הווילון כדי להעביר אותו עם המוט. המוט מתומחר מהשורה הראשונה בקטגוריית ״מוטות וילון״."
            : `לקיצור — הידיות ש${onWhat} עצמו. מוט משלו — ״ציור על מוט״ בסרגל.`}
      </Note>
    </>
  );
}

/** How high a ceiling item hangs, as its bar, its chip and its ״תלייה״ group read it: this plan's own
 *  height, else its row's (`fallback`), else — neither says — where the room hangs it, a guest's
 *  clearance under what is overhead (a ceiling, a pergola — lib/venues/roofs.ts), or 3 m under open
 *  sky (`roofed`: shown, never stored). `placeholder` is what an empty field shows, in cm. */
function hangView(own: number | undefined, fallback: number | undefined, underRoof: number | undefined) {
  const shown = own ?? fallback;
  const roofed = own === undefined && !fallback && underRoof ? underRoof : undefined;
  return {
    shown,
    roofed,
    words: shown ? `${(shown / 1000).toFixed(2)} מ׳` : "לא צוין",
    placeholder: fallback ? String(Math.round(fallback / 10)) : roofed ? String(Math.round(roofed / 10)) : "—",
  };
}

/** The hang height's fields — a ceiling item's ״תלייה״ group. */
function HangFields({ own, fallback, underRoof, onHang }: { own?: number; fallback?: number; underRoof?: number; onHang: (mm: number | null) => void }) {
  const { roofed, placeholder } = hangView(own, fallback, underRoof);
  return (
    <>
      <PanelRow label="מהרצפה (ס״מ)" htmlFor="placement-hang">
        <NumberField
          id="placement-hang"
          decimals={0}
          min={0}
          max={HANG_MAX_MM / 10}
          hideZero
          placeholder={placeholder}
          value={own ? Math.round(own / 10) : 0}
          onChange={(v) => onHang(v > 0 ? v * 10 : null)}
          className="w-20"
        />
      </PanelRow>
      {own !== undefined && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => onHang(null)}>
          {fallback ? `חזרה לגובה מהקטלוג (${Math.round(fallback / 10)} ס״מ)` : "ניקוי הגובה"}
        </Button>
      )}
      <Note>{own === undefined && fallback ? "הגובה מהקטלוג. " : ""}{roofed ? `בלי גובה — בתלת־ממד נתלה בגובה ${Math.round(roofed / 10)} ס״מ, מתחת למה שמעליו. ` : ""}מודפס ליד הפריט בתוכנית התקרה — לא משפיע על המחיר או על רשימת הציוד.</Note>
    </>
  );
}

/** A rented flight or ramp standing on its own: the step it covers, and what follows from it — the
 *  steps (≤18cm on 28cm treads) or the 1:12 run. The venue's own stairs ask the same questions in the
 *  same words (components/venue-inspector.tsx ClimbFields). A ramp steeper than 1:12 is said, in alert
 *  ink, with the one press that lays it back — never refused. Its ״מדרגות״ / ״רמפה״ group. */
function ClimbFields({
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
    <>
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
    </>
  );
}

const VESSEL_ROW = "__row";
const VESSEL_NONE = "__none";

/** The vessel an arrangement stands in, as its chip, its pick row and its picker read it: the
 *  catalog's vessels, the one in use (this plan's, else its row's) and its name. */
function vesselView(own: string | null | undefined, rowVessel?: string) {
  const choices = vesselChoices(loadProducts());
  const nameOf = (id?: string) => (id ? (choices.find((o) => o.value === id)?.label ?? resolve(id)?.label) : undefined);
  const current = own === null ? undefined : (own ?? rowVessel);
  return {
    choices,
    nameOf,
    current,
    value: own === null ? VESSEL_NONE : own === undefined ? VESSEL_ROW : own,
    name: nameOf(current) ?? "ללא כלי",
  };
}

/** "כלי" — which vase or jug an arrangement stands in: the catalog's vessels (`vases`), each shade
 *  its own option, plus "as its catalog row" and "none on this plan" — as a group's pick row: the
 *  vessel in use, and "החלפה" opens the typed list as a picker beside the panel — a pick applies and
 *  the picker goes. */
/** A patch to an aisle's own answers: any of them, or null to hand one back to its row. */
export type AislePatch = { [K in keyof AislePlacement]?: AislePlacement[K] | null };

/** The ״שדרה״ group: the piece as a pick row (its picker beside the panel), then the lining's fields.
 *  Everything shown is what is IN FORCE — the row's answers under this plan's own — and every edit is
 *  this plan's; "כמו בקטלוג" hands them all back. */
function AislePanel({ id, view, own, onAisle }: { id: string; view: AisleView; own: AislePlacement | undefined; onAisle: (patch: AislePatch) => void }) {
  const choices = aislePieceChoices(loadProducts());
  const mine = !!own && Object.keys(own).length > 0;
  return (
    <div className="space-y-3">
      <PickRow
        glyph={
          view.piece ? (
            <span className="block h-full w-full overflow-hidden rounded-sm">
              <ProductImage product={view.piece.product} />
            </span>
          ) : (
            <Route className="h-4 w-4 text-muted" strokeWidth={1.75} />
          )
        }
        name={view.piece?.label ?? "בחירת פריט"}
        meta={!view.piece ? "השדרה ריקה עד שנבחר פריט" : own?.piece ? "בתוכנית הזו" : "כמו בקטלוג"}
        pickerLabel="הפריט שלאורך השדרה"
        pickerIcon={Route}
      >
        {(close) => (
          <AislePiecePicker
            autoFocus
            value={view.pieceId ?? ""}
            choices={choices}
            lead={own?.piece ? [{ value: "", label: "כמו בקטלוג" }] : []}
            onChange={(v) => {
              onAisle({ piece: v || null });
              close();
            }}
          />
        )}
      </PickRow>
      <AisleFields spec={view.spec} layout={view.layout} onChange={onAisle} idPrefix={`aisle-${id}`} />
      {mine && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => onAisle({ piece: null, pitchMm: null, sides: null, stagger: null, runner: null })}>
          כמו בקטלוג
        </Button>
      )}
    </div>
  );
}

function VesselPickRow({ own, rowVessel, onVessel }: { own: string | null | undefined; rowVessel?: string; onVessel: (v: string | null | undefined) => void }) {
  const view = vesselView(own, rowVessel);
  const chosen = view.current ? view.choices.find((c) => c.value === view.current) : undefined;
  return (
    <PickRow
      glyph={
        chosen?.product ? (
          <span className="block h-full w-full overflow-hidden rounded-sm">
            <ProductImage product={chosen.product} />
          </span>
        ) : (
          <Amphora className="h-4 w-4 text-muted" strokeWidth={1.75} />
        )
      }
      name={view.name}
      meta={own === undefined ? "כמו בקטלוג" : own === null ? "ללא כלי בתוכנית הזו" : "בתוכנית הזו"}
      pickerLabel="כלי"
      pickerIcon={Amphora}
    >
      {(close) => (
        <VesselFields
          own={own}
          rowVessel={rowVessel}
          onVessel={(v) => {
            onVessel(v);
            close();
          }}
        />
      )}
    </PickRow>
  );
}

/** The vessel list itself — the ״כלי״ group's picker. */
function VesselFields({ own, rowVessel, onVessel }: { own: string | null | undefined; rowVessel?: string; onVessel: (v: string | null | undefined) => void }) {
  const { choices, nameOf, value } = vesselView(own, rowVessel);
  return (
    <>
      {/* Typed to narrow, and listed INSIDE the panel — a Select's list dropped off the canvas card. */}
      <VesselPicker
        autoFocus
        value={value}
        onChange={(v) => onVessel(v === VESSEL_ROW ? undefined : v === VESSEL_NONE ? null : v)}
        choices={choices}
        lead={[
          { value: VESSEL_ROW, label: rowVessel ? `כמו בקטלוג — ${nameOf(rowVessel) ?? "כלי"}` : "כמו בקטלוג — ללא כלי" },
          { value: VESSEL_NONE, label: "ללא כלי" },
        ]}
      />
      <Note>
        {choices.length === 0
          ? "אין עדיין כלים בקטלוג — מוסיפים אותם בקטגוריה ״אגרטלים וכלים״."
          : "הכלי מצויר מתחת לסידור, נספר ונארז איתו. אפשר גם לגרור סידור אל כלי שכבר מונח על השולחן."}
      </Note>
    </>
  );
}

/** How big one item is drawn on this plan, as a percentage of its catalog size — a design item's
 *  ״גודל על התוכנית״ group: four ready sizes (the board's segmented look) and the percentage typed. A
 *  drawing size only: the quote, the packing list and the order still count it as the row it is. */
function ScaleFields({ scale, onScale }: { scale: number; onScale: (scale: number) => void }) {
  const pct = Math.round(scale * 100);
  return (
    <>
      <Segmented
        label="גדלים מוכנים"
        hideLabel
        value={String(pct)}
        options={[75, 100, 125, 150].map((v) => [String(v), `${v}%`] as const)}
        onChange={(v) => onScale(Number(v) / 100)}
      />
      <PanelRow label="אחוז" htmlFor="placement-scale">
        <NumberField id="placement-scale" decimals={0} min={30} max={300} value={pct} onChange={(v) => onScale(v / 100)} className="w-20" />
        <span className="text-xs text-muted">%</span>
      </PanelRow>
      <Note>גודל הציור בלבד — המחיר, הכמות ורשימת הציוד לא משתנים.</Note>
    </>
  );
}

/** How many of a thing stand here — − N +, inline: the one number edited over and over while
 *  placing. The quick bar's (an item counted by the unit) and the ״פריט״ group's. */
function QuantityStepper({ quantity, onStep }: { quantity: number; onStep: (delta: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="כמות">
      <BarButton icon={Minus} label="פריט אחד פחות" onClick={() => onStep(-1)} disabled={quantity <= 1} />
      <span className="nums w-5 text-center text-sm font-semibold text-ink">{quantity}</span>
      <BarButton icon={Plus} label="פריט אחד נוסף" onClick={() => onStep(1)} />
    </div>
  );
}

/** A shade picked from swatches, its name spelled out under them — colour never carries the meaning
 *  alone: two of a designer's creams look identical at 18px. The ״גוון״ group. */
function ShadeFields({ shades, value, onChange }: { shades: ReturnType<typeof shadesOf>; value: string; onChange: (variantId: string) => void }) {
  const shade = shades.find((s) => s.id === value);
  return (
    <>
      <SwatchPicker options={shades} value={value} onChange={onChange} label="גוון הפריט" />
      <p className="mt-2 text-xs text-muted">{shade?.name ?? "ברירת מחדל"}</p>
    </>
  );
}

/** A contour read back on its chip or its group's title row: the band's width in cm, or "ללא". */
function borderWords(b: Border | undefined): ReactNode {
  return b ? ltr(`${Math.round(b.widthMm) / 10}`) : "ללא";
}

/** An item's ״פריט״ group: what it is — a pick row swapping it for another row of its kind when the
 *  catalog has one, else the row itself — and how many of it stand here (none for a block of chairs:
 *  its count is its rows). */
function ItemFields({
  product,
  swap,
  onSwap,
  quantity,
  onQuantity,
}: {
  product?: Product;
  swap: SwapPanel | null;
  onSwap: (productId: string, all: boolean) => void;
  /** Undefined = no count to step. */
  quantity: number | undefined;
  onQuantity: (delta: number) => void;
}) {
  return (
    <>
      {swap ? (
        <SwapPickRow swap={swap} onSwap={onSwap} label="החלפה בפריט אחר" />
      ) : product ? (
        <div className="flex items-center gap-2.5 rounded-md border border-inset-border bg-inset p-2">
          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-sm border border-border bg-surface">
            <ProductImage product={product} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{product.name}</span>
            <span className="nums block truncate text-xs text-muted">{formatDimensions(product.dimensions)}</span>
          </span>
        </div>
      ) : null}
      {quantity !== undefined && (
        <PanelRow label="כמות">
          <QuantityStepper quantity={quantity} onStep={onQuantity} />
        </PanelRow>
      )}
    </>
  );
}

/** A standalone banquette's ״מספר״ group: it is numbered like a table while anybody sits on it —
 *  cleared, it stays seated but unnumbered. */
function BenchNumberFields({
  number,
  seats,
  duplicate,
  onNumber,
}: {
  number: number | undefined;
  seats: number;
  /** Another unit on the plan shows the same number. */
  duplicate: boolean;
  /** `null` = no number. */
  onNumber: (n: number | null) => void;
}) {
  return (
    <>
      <PanelRow label="מספר" htmlFor="bench-number">
        {number !== undefined && <BarButton icon={Undo2} label="ללא מספר" onClick={() => onNumber(null)} />}
        <NumberField id="bench-number" decimals={0} min={0} value={number ?? 0} onChange={(v) => onNumber(v)} className="w-20" />
      </PanelRow>
      {duplicate && <DuplicateNumber />}
      <Note>
        {seats > 0
          ? "בנקט שיושבים בו ממוספר כמו שולחן — במפת ההצבה ובמספור מחדש. בלי מספר הוא נשאר במניין המקומות בלבד."
          : "המספר יופיע כשיהיו מקומות ישיבה בבנקט."}
      </Note>
    </>
  );
}

/** A standalone banquette's ״גובה״ group: its top — table height for the chairs beside it — and,
 *  when a side is a sofa, the sofa's seat (`sofaHeightMm` undefined = no sofa side). */
function BenchHeightFields({
  heightMm,
  sofaHeightMm,
  onHeight,
  onSofaHeight,
}: {
  heightMm: number;
  sofaHeightMm: number | undefined;
  onHeight: (mm: number) => void;
  onSofaHeight: (mm: number) => void;
}) {
  return (
    <>
      <PanelRow label="גובה המשטח" htmlFor="bench-h">
        <NumberField id="bench-h" decimals={0} min={20} max={150} commitOnBlur value={cm(heightMm)} onChange={(v) => onHeight(v * 10)} className="w-20" />
        <span className="text-xs text-muted">ס״מ מהרצפה</span>
      </PanelRow>
      {sofaHeightMm !== undefined && (
        <PanelRow label="גובה מושב הספה" htmlFor="bench-sh">
          <NumberField id="bench-sh" decimals={0} min={30} max={70} commitOnBlur value={cm(sofaHeightMm)} onChange={(v) => onSofaHeight(v * 10)} className="w-20" />
          <span className="text-xs text-muted">ס״מ מהרצפה</span>
        </PanelRow>
      )}
      <Note>המשטח הוא השולחן של הכיסאות שלצידו — 75 ס״מ כברירת מחדל. ספה נמוכה ממנו, והיושבים עליה פונים החוצה.</Note>
    </>
  );
}

/** A carpet laid OVER a surface or a stage (lib/studio/cover.ts) — its ״על <name>״ group: the margin
 *  it stops short of the edge by, what it follows, and letting go of it (the shape kept). A covered
 *  thing since gone is said: the carpet stands as it was laid. */
function CoverFields({
  id,
  name,
  present,
  feature,
  insetCm,
  onInset,
  onDetach,
}: {
  id: string;
  name: string;
  present: boolean;
  /** It lies on a venue surface (re-laid on the sketch's next open), not on a stage. */
  feature: boolean;
  insetCm: number;
  onInset?: (cm: number) => void;
  onDetach?: () => void;
}) {
  return (
    <>
      {!present && <Note>{`${name} כבר לא בתוכנית — השטיח נשאר בצורה שבה הונח עליו.`}</Note>}
      {onInset && (
        <PanelRow label="שוליים (ס״מ)" htmlFor={`cover-inset-${id}`}>
          <NumberField id={`cover-inset-${id}`} decimals={0} min={0} step={5} value={insetCm} onChange={onInset} className="w-20" />
        </PanelRow>
      )}
      <Note>{`השטיח בצורת ${name} ונע איתו${feature ? "; שינוי צורה באולם משנה אותו בפתיחה הבאה של הסקיצה" : ""}.`}</Note>
      {onDetach && (
        <Button size="sm" variant="outline" className="mt-3 w-full" onClick={onDetach}>
          <Unlink className="h-3.5 w-3.5" strokeWidth={2} />
          ניתוק מהמשטח
        </Button>
      )}
    </>
  );
}

/** A stretched rug's ״גודל ופינות״ group: its size by number (as the bar), its rounded corners — one
 *  radius for all four, and each corner on its own (a rug may be rounded on two corners only,
 *  2026-10-31) — and its bowed sides said, with the ways back to straight. The four corner fields
 *  stand where their corners are on the rug (left to right whatever the page direction), as the
 *  points on the plan do. A carpet laid to an outline (let go from a surface or a stage) has none of
 *  the corners: those are a rectangle's, and a size stretches its shape. */
function RugSizeFields({
  placement: p,
  size,
  onSize,
  onCorners,
  onBows,
}: {
  placement: Placement;
  /** As the canvas draws it — its own size, else its row's. */
  size: { widthMm: number; depthMm: number };
  onSize: (size: { widthMm: number; depthMm: number }) => void;
  onCorners?: (corners: [number, number, number, number] | null) => void;
  onBows?: (bows: [number, number, number, number] | null) => void;
}) {
  const maxRadius = Math.round(Math.min(size.widthMm, size.depthMm) / 20);
  return (
    <>
      <PanelRow label="רוחב × עומק (ס״מ)">
        <NumberField aria-label="רוחב" decimals={0} min={30} value={cm(size.widthMm)} onChange={(v) => onSize({ widthMm: v * 10, depthMm: size.depthMm })} className="w-20" />
        <span className="text-xs text-muted">×</span>
        <NumberField aria-label="עומק" decimals={0} min={30} value={cm(size.depthMm)} onChange={(v) => onSize({ widthMm: size.widthMm, depthMm: v * 10 })} className="w-20" />
      </PanelRow>
      {onCorners && !p.outline && (
        <>
          <PanelRow label="כל הפינות (ס״מ)" htmlFor="rug-corners">
            <NumberField
              id="rug-corners"
              decimals={0}
              min={0}
              max={maxRadius}
              step={5}
              value={Math.round(Math.max(0, ...(p.corners ?? [0])) / 10)}
              onChange={(v) => onCorners(v > 0 ? [v * 10, v * 10, v * 10, v * 10] : null)}
              className="w-20"
            />
          </PanelRow>
          <PanelRow label="כל פינה בנפרד" stack>
            <div dir="ltr" className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-sm border border-border p-2">
              {(["פינה שמאלית עליונה", "פינה ימנית עליונה", "פינה שמאלית תחתונה", "פינה ימנית תחתונה"] as const).map((label, k) => {
                // Grid order is left-top, right-top, left-bottom, right-bottom; RugCorners is
                // top-left, top-right, bottom-right, bottom-left.
                const i = [0, 1, 3, 2][k];
                const radii: [number, number, number, number] = p.corners ? [...p.corners] : [0, 0, 0, 0];
                return (
                  <div key={i} className={k % 2 ? "justify-self-end" : "justify-self-start"}>
                    <NumberField
                      aria-label={`${label} (ס״מ)`}
                      decimals={0}
                      min={0}
                      max={maxRadius}
                      step={5}
                      value={Math.round(radii[i] / 10)}
                      onChange={(v) => {
                        radii[i] = Math.max(0, v) * 10;
                        onCorners(radii.some((x) => x > 0) ? radii : null);
                      }}
                      className="w-16"
                    />
                  </div>
                );
              })}
            </div>
          </PanelRow>
        </>
      )}
      {p.outline && <Note>השטיח בצורה שבה הונח על המשטח — שינוי הגודל מותח את הצורה.</Note>}
      {onBows && !p.outline && (
        <>
          <Note>
            גרירת הריבוע באמצע כל צד מעקמת אותו; לחיצה כפולה עליו מיישרת אותו.
            {onCorners ? " הנקודה שבתוך כל פינה מעגלת את הפינה הזו (Alt — את כל הפינות יחד); לחיצה כפולה עליה מיישרת." : ""}
          </Note>
          {(p.bows || (p.corners && onCorners)) && (
            <div className="mt-3 flex gap-2">
              {p.bows && (
                <Button size="sm" variant="outline" className="flex-1" onClick={() => onBows(null)}>
                  יישור כל הצדדים
                </Button>
              )}
              {p.corners && onCorners && (
                <Button size="sm" variant="outline" className="flex-1" onClick={() => onCorners(null)}>
                  פינות ישרות
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
