"use client";

import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronsLeft, Eye, EyeOff, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { FoldRow } from "@/components/fold-row";
import { Popover } from "@/components/popover";
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

/** A group in one line — key, icon, title, summary, body, and whether it warns. The studio's
 *  selection groups and the fill tool's are written with it (imported as `G`). */
export const panelGroup = (key: string, icon: LucideIcon, title: string, summary: ReactNode, body: ReactNode, warn = false): PanelGroup => ({ key, icon, title, summary, body, warn });

const CHANGE_EVENT = "eve:end-panel-change";

/** The device's open/closed preference as an external store: read straight from storage, told of a
 *  change by this tab's event or another tab's `storage` (no effect copying it into state). */
function subscribePanel(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function setPanelOpen(screen: string, open: boolean) {
  saveEndPanelOpen(screen, open);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** A put-away preference of this device, as the end panel keeps its own — for another drawer of the
 *  same shell (/outputs' document rail). Open until the device says otherwise. */
export function useStoredOpen(key: string): [boolean, (open: boolean) => void] {
  const stored = useSyncExternalStore(subscribePanel, () => loadEndPanelOpen(key), () => true);
  return [stored !== false, (open: boolean) => setPanelOpen(key, open)];
}

/** Bring a screen's end panel back if it was put away — for a verb elsewhere that opens a group in
 *  it. */
export function openEndPanel(screen: string) {
  setPanelOpen(screen, true);
}

export function EndPanel({
  screen,
  collapsible = false,
  foot,
  collapsedTools,
  collapsedFoot,
  forcedClosed,
  children,
}: {
  screen: "studio" | "halls" | "editor" | "outputs" | "scene";
  collapsible?: boolean;
  /** Pinned under the scrolling groups, never scrolled away (the outputs and 3D board, 2026-11-11:
   *  "the foot never scrolls") — the screen's one outward action and its count. */
  foot?: ReactNode;
  /** Put away: what the 48px column keeps under its button (the 3D view's three moods). */
  collapsedTools?: ReactNode;
  /** Put away: the foot's action as one round button at the column's foot. */
  collapsedFoot?: ReactNode;
  /** Shown put away whatever the device remembers, without storing it — the client view. Its
   *  expand button leaves that view (`onOpen`) instead of flipping the stored preference. */
  forcedClosed?: { onOpen: () => void };
  children: ReactNode;
}) {
  // Open on the server and on the hydrating render (the server snapshot), so the two agree and a
  // stored "closed" folds it a frame later rather than flashing it open.
  const stored = useSyncExternalStore(
    subscribePanel,
    () => (collapsible ? loadEndPanelOpen(screen) : true),
    () => true,
  );
  const open = !forcedClosed && (!collapsible || stored !== false);
  const toggle = () => (forcedClosed ? forcedClosed.onOpen() : setPanelOpen(screen, !open));
  // Put away, it is a 48px column with a full-size button at its top (2026-11-09, the user: folded
  // to nothing it was a sliver with half a puck — "the compact is too much"). The column is the
  // button's well, so the canvas never loses the panel's edge.
  return (
    <aside
      data-end-panel
      className={
        "no-print group/panel relative flex min-h-0 shrink-0 flex-col border-s border-border bg-surface transition-[width] duration-200 ease-fluid " +
        (open ? "w-[296px]" : "w-12 overflow-hidden")
      }
    >
      {collapsible && open && (
        <button
          type="button"
          onClick={toggle}
          aria-label="כיווץ הלוח"
          aria-expanded
          title="כיווץ הלוח"
          style={{ insetInlineStart: "-14px" }}
          className="absolute top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white/70 text-ink-soft opacity-60 shadow-puck backdrop-blur-md transition-all duration-150 hover:bg-white hover:text-accent hover:opacity-100 focus-visible:opacity-100 group-hover/panel:opacity-100"
        >
          <ChevronsLeft className="h-4 w-4" strokeWidth={2} />
        </button>
      )}
      {(collapsible || forcedClosed) && !open && (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 py-3">
          <button
            type="button"
            onClick={toggle}
            aria-label="הרחבת הלוח"
            aria-expanded={false}
            title="הרחבת הלוח"
            className="flex h-9 w-9 items-center justify-center rounded-sm text-muted transition-colors hover:bg-accent-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </button>
          {collapsedTools && (
            <>
              <div className="my-1 h-px w-6 bg-border" aria-hidden />
              {collapsedTools}
            </>
          )}
          {collapsedFoot && <div className="mt-auto">{collapsedFoot}</div>}
        </div>
      )}
      <div className={"scroll-slim min-h-0 flex-1 overflow-y-auto " + (open ? "" : "hidden")}>{children}</div>
      {open && foot && <div className="shrink-0 border-t border-border bg-surface px-4 pb-4 pt-3">{foot}</div>}
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
 *  hidden — two questions, two presses, as the plane rail they replace kept them. The eye is drawn at
 *  rest in muted ink, never a hover reveal (2026-11-10, the user: in the quiet grey it "cannot be
 *  seen"); a hidden plane's EyeOff wears the pressed look, so what is switched off reads at a glance. */
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
          className={
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition-colors " +
            (visible ? "text-muted hover:bg-accent-tint hover:text-accent" : "bg-accent-tint text-accent hover:bg-accent-wash")
          }
        >
          <EyeIcon className="h-4 w-4" strokeWidth={1.9} />
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
  disabled = false,
  trailing,
}: {
  glyph: ReactNode;
  label: string;
  meta?: ReactNode;
  badge?: string;
  selected?: boolean;
  onClick?: (e: MouseEvent) => void;
  /** Listed but not pickable just now (the studio's dressing focus: what stands behind the scrim) —
   *  dimmed, and a click does nothing. */
  disabled?: boolean;
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
      {disabled ? (
        <button type="button" disabled className="flex min-h-[34px] w-full cursor-default items-center gap-2 rounded-sm px-1.5 text-start text-ink opacity-50">
          {body}
        </button>
      ) : onClick ? (
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

/** What a group has chosen — a cloth, a table type, a shape — as one row, and the way to choose
 *  again: "החלפה" opens a PICKER beside the panel (the board's B.pick). The picker's body gets
 *  `close`, so a pick applies and the picker goes. */
export function PickRow({
  swatch,
  glyph,
  name,
  meta,
  pickerLabel,
  pickerIcon,
  children,
}: {
  swatch?: string;
  glyph?: ReactNode;
  name: string;
  meta?: string;
  /** The picker's title — "בחירת מפה", "צורה". */
  pickerLabel: string;
  pickerIcon?: LucideIcon;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-inset-border bg-inset p-2">
      {swatch && <span className="h-10 w-10 shrink-0 rounded-sm border border-border" style={{ background: swatch }} aria-hidden />}
      {glyph && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-surface">{glyph}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{name}</span>
        {meta && <span className="block truncate text-xs text-muted">{meta}</span>}
      </span>
      <Popover label={pickerLabel} icon={pickerIcon} variant="picker" trigger="pill" triggerText="החלפה" side="beside">
        {children}
      </Popover>
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
  first = false,
  lead,
}: {
  kind: string;
  title: string;
  sub?: string;
  note?: string;
  groups: PanelGroup[];
  defaultOpen?: readonly string[];
  /** At the top of the panel: no hairline over it (the studio's sketch groups, above the list). */
  first?: boolean;
  /** A line under the heading, before the groups — the quote's "changes not sent yet". */
  lead?: ReactNode;
}) {
  const open = useSyncExternalStore(
    groupMemory.subscribe,
    () => groupMemory.get(kind, defaultOpen),
    () => groupMemory.get(kind, defaultOpen),
  );
  return (
    <div>
      {!first && <div className="h-px bg-border" aria-hidden />}
      <PanelGroupsHeader title={title} sub={sub} note={note} />
      {lead}
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
