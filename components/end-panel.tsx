"use client";

import { useEffect, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronsLeft, Eye, EyeOff, type LucideIcon } from "lucide-react";
import { FoldRow } from "@/components/fold-row";
import { groupMemory, orderGroups } from "@/lib/studio/panel-groups";
import { loadEndPanelOpen, saveEndPanelOpen } from "@/lib/studio/storage";

// THE END PANEL — the column at the end of a canvas card (2026-11-09, the user's "Studio + Halls"
// board, built like the shape editor's side panel): what is on the plan (a LIST — the studio's
// layers, the venue's zones, the editor's shapes) above, and the selection's GROUPS below, every
// field the selection has, folded under a title that reads its value back.
//
// One card with its neighbours, not a floating card of its own: the rail, the canvas and this panel
// share the canvas card, a hairline between them (`border-s`). It may be put away (`collapsible`) —
// at 1440px with the app's nav open, the studio's canvas would be a strip between the catalog and
// this — to nothing but the puck that brings it back; open or not is remembered per device and per
// screen (lib/studio/storage.ts).
//
// `data-end-panel` is what a picker opened from inside it (Popover `side="beside"`) measures from:
// it opens beside the panel, into the canvas, never over the panel's own fields.

/** One group of the selection's fields: what it is, what it holds now (mandatory — a closed panel
 *  has to read like a sentence), whether it reports a problem, and the fields. */
export interface PanelGroup {
  key: string;
  icon: LucideIcon;
  title: string;
  summary: ReactNode;
  warn?: boolean;
  body: ReactNode;
}

export function EndPanel({ screen, collapsible = false, children }: { screen: "studio" | "halls" | "editor"; collapsible?: boolean; children: ReactNode }) {
  // Null until the device's preference is read — open, so the server render and the first client
  // render agree and a stored "closed" folds it a frame later rather than flashing it open.
  const [stored, setStored] = useState<boolean | null>(null);
  useEffect(() => {
    if (collapsible) setStored(loadEndPanelOpen(screen));
  }, [collapsible, screen]);
  const open = !collapsible || stored !== false;
  const toggle = () => {
    const next = !open;
    setStored(next);
    saveEndPanelOpen(screen, next);
  };
  return (
    <aside
      data-end-panel
      className={"group/panel relative flex min-h-0 shrink-0 flex-col border-s border-border bg-surface transition-[width] duration-200 ease-fluid " + (open ? "w-[296px]" : "w-0")}
    >
      {collapsible && (
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? "כיווץ הלוח" : "הרחבת הלוח"}
          aria-expanded={open}
          style={{ insetInlineStart: "-14px" }}
          className="absolute top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white/70 text-ink-soft opacity-60 shadow-puck backdrop-blur-md transition-all duration-150 hover:bg-white hover:text-accent hover:opacity-100 focus-visible:opacity-100 group-hover/panel:opacity-100"
        >
          <ChevronsLeft className={"h-4 w-4 transition-transform duration-200 " + (open ? "" : "rotate-180")} strokeWidth={2} />
        </button>
      )}
      <div className={"scroll-slim min-h-0 flex-1 overflow-y-auto " + (open ? "" : "invisible")}>{children}</div>
    </aside>
  );
}

/** What is on the plan: a muted heading with its count, then the rows. */
export function PanelList({ title, count, children }: { title: string; count?: number | string; children: ReactNode }) {
  return (
    <div className="px-3 pb-2.5 pt-3">
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <span className="text-xs font-semibold text-muted">{title}</span>
        {count !== undefined && <span className="nums text-xs text-quiet">{count}</span>}
      </div>
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  );
}

/** A layer heading inside the list: its label is "work only in this layer", its eye is shown or
 *  hidden — two questions, two presses, as the plane rail they replace kept them. */
export function PanelListHeading({
  label,
  count,
  active,
  visible = true,
  onActivate,
  onToggleVisible,
}: {
  label: string;
  count?: number;
  active?: boolean;
  visible?: boolean;
  onActivate?: () => void;
  onToggleVisible?: () => void;
}) {
  const EyeIcon = visible ? Eye : EyeOff;
  return (
    <div className={"mt-1 flex h-7 items-center gap-1.5 px-1.5 " + (visible ? "" : "text-faint")}>
      <button
        type="button"
        onClick={onActivate}
        aria-pressed={active}
        title={active ? "חזרה לכל השכבות" : `עבודה בשכבת ${label} בלבד`}
        className={"rounded-sm text-xs transition-colors hover:text-accent " + (active ? "font-bold text-accent" : visible ? "font-semibold text-ink-soft" : "font-semibold")}
      >
        {label}
      </button>
      {active && <span className="rounded-pill bg-accent-wash px-[7px] text-[10px] font-bold text-accent-hover">פעילה</span>}
      {count !== undefined && <span className="nums text-xs text-faint">{count}</span>}
      <div className="h-px flex-1 bg-border-soft" aria-hidden />
      {onToggleVisible && (
        <button
          type="button"
          onClick={onToggleVisible}
          aria-pressed={!visible}
          aria-label={visible ? `הסתרת שכבת ${label}` : `הצגת שכבת ${label}`}
          title={visible ? "הסתרה" : "הצגה"}
          className="rounded-sm p-0.5 text-quiet transition-colors hover:text-accent"
        >
          <EyeIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

/** One row of the list: a glyph, a name, a badge, a figure at the end. A button when it can be
 *  clicked (a row selects what it lists). */
export function PanelListRow({
  glyph,
  label,
  meta,
  badge,
  selected,
  onClick,
  trailing,
}: {
  glyph: ReactNode;
  label: string;
  meta?: ReactNode;
  badge?: string;
  selected?: boolean;
  onClick?: (e: MouseEvent) => void;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-sm bg-inset">{glyph}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{label}</span>
      {badge && <span className="shrink-0 rounded-pill border border-accent-line px-[7px] text-[11px] font-semibold text-accent-hover">{badge}</span>}
      {meta !== undefined && meta !== null && <span className="nums shrink-0 text-xs text-muted">{meta}</span>}
    </>
  );
  const cls = "flex min-h-[34px] w-full items-center gap-2 rounded-sm px-1.5 text-start transition-colors " + (selected ? "bg-accent-tint text-accent-hover" : "text-ink hover:bg-inset");
  return (
    <div className="flex items-center gap-0.5">
      {onClick ? (
        <button type="button" onClick={onClick} aria-pressed={selected} className={cls}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
      {trailing}
    </div>
  );
}

/** The list folded to one line while something is selected — which list, how many, and where the
 *  selection sits in it ("רצפה › שולחן 10"). A click unfolds it. */
export function PanelListFolded({
  icon: Icon,
  title,
  count,
  crumb,
  badge,
  onOpen,
}: {
  icon: LucideIcon;
  title: string;
  count?: number | string;
  crumb?: string;
  badge?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <div className="px-3 py-2.5">
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={false}
        className="flex h-9 w-full items-center gap-2 rounded-sm border border-inset-border bg-inset px-2.5 text-start transition-colors hover:border-accent-line"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
        <span className="whitespace-nowrap text-[13px] font-semibold text-ink">{title}</span>
        {count !== undefined && <span className="nums text-xs text-quiet">{count}</span>}
        {badge}
        <span className="min-w-0 flex-1 truncate text-end text-xs text-muted">{crumb}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-faint" strokeWidth={2} />
      </button>
    </div>
  );
}

/** The heading over a selection's groups — its name and what it is. */
export function PanelGroupsHeader({ title, sub, note }: { title: string; sub?: string; note?: string }) {
  return (
    <>
      <div className="flex min-w-0 items-baseline gap-2 px-4 pb-2 pt-3">
        <span className="whitespace-nowrap text-[13px] font-bold text-ink">{title}</span>
        {sub && <span className="truncate text-xs text-muted">{sub}</span>}
      </div>
      {note && <p className="px-4 pb-3 text-[13px] leading-relaxed text-muted">{note}</p>}
    </>
  );
}

/** The selection's groups, warn ones first, each open or closed as it was last left for this KIND
 *  of selection (lib/studio/panel-groups.ts) — a stage opens on the stage's groups, a table on a
 *  table's. */
export function PanelGroups({
  kind,
  title,
  sub,
  note,
  groups,
  defaultOpen,
}: {
  kind: string;
  title: string;
  sub?: string;
  note?: string;
  groups: PanelGroup[];
  defaultOpen?: readonly string[];
}) {
  const open = useSyncExternalStore(
    groupMemory.subscribe,
    () => groupMemory.get(kind, defaultOpen),
    () => groupMemory.get(kind, defaultOpen),
  );
  return (
    <div>
      <div className="h-px bg-border" aria-hidden />
      <PanelGroupsHeader title={title} sub={sub} note={note} />
      {orderGroups(groups).map((g) => (
        <div key={g.key} data-group={g.key}>
          <FoldRow
            variant="panel"
            icon={g.icon}
            title={g.title}
            summary={g.summary}
            tone={g.warn ? "warn" : "default"}
            open={!!open[g.key]}
            onToggle={() => groupMemory.toggle(kind, g.key, defaultOpen)}
          >
            {g.body}
          </FoldRow>
        </div>
      ))}
    </div>
  );
}
