"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  KeyRound,
} from "lucide-react";
import { Menu, type MenuItem } from "@/components/menu";
import { ALIGN_LABEL, type AlignOp } from "@/lib/studio/align";

/** What the inspector needs to offer יישור — null when the selection cannot be aligned. */
export interface AlignPanel {
  /** How many units (a group counts once) — distribution needs three. */
  units: number;
  /** What the others line up with, by name — the key the canvas marks. */
  keyLabel: string;
  onAlign: (op: AlignOp) => void;
  onPickKey: (which: "next" | "last") => void;
}

// The plan's own sides, as it is drawn on screen: the vertical-line icons are "edges on a line
// down the page" (left/centre/right), the horizontal ones "edges on a line across it". Start =
// LEFT and end = RIGHT in these glyph names, because the canvas is not mirrored for RTL.
const ROWS: { op: AlignOp; icon: MenuItem["icon"] }[] = [
  { op: "right", icon: AlignEndVertical },
  { op: "hcenter", icon: AlignCenterVertical },
  { op: "left", icon: AlignStartVertical },
  { op: "top", icon: AlignStartHorizontal },
  { op: "vmiddle", icon: AlignCenterHorizontal },
  { op: "bottom", icon: AlignEndHorizontal },
];

/** "יישור" — line the selection up by one of its own members (lib/studio/align.ts). Every row is
 *  one action and one undo. The key is named in the last rows and drawn on the plan. */
export function AlignMenu({ align }: { align: AlignPanel | null }) {
  if (!align) return null;
  const items: MenuItem[] = [
    ...ROWS.map(({ op, icon }) => ({ label: ALIGN_LABEL[op], icon, onSelect: () => align.onAlign(op) })),
    ...(align.units >= 3
      ? [
          { label: ALIGN_LABEL["distribute-x"], icon: AlignHorizontalDistributeCenter, onSelect: () => align.onAlign("distribute-x") },
          { label: ALIGN_LABEL["distribute-y"], icon: AlignVerticalDistributeCenter, onSelect: () => align.onAlign("distribute-y") },
        ]
      : []),
    { label: `לפי: ${align.keyLabel} — החלפה לבא בתור`, icon: KeyRound, onSelect: () => align.onPickKey("next") },
    { label: "לפי האחרון שנבחר", icon: KeyRound, onSelect: () => align.onPickKey("last") },
  ];
  return <Menu label={`יישור — לפי ${align.keyLabel}`} icon={AlignCenterVertical} side="top" items={items} />;
}
