"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Copy, Heart, MousePointerClick, Pencil, Plus, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Menu } from "@/components/menu";
import type { ChairRows } from "@/lib/design-document/types";
import { NEW_BLOCK, chairRowsLayout } from "@/lib/design-document/chair-rows";
import { catalogBox } from "@/lib/studio/footprint";
import { ChairBlock } from "@/components/chair-block";
import { CompositionPieces, compositionBox } from "@/components/composition-drawing";
import type { Product } from "@/lib/catalog/types";
import { CATEGORY_BY_ID, CATEGORY_GROUPS, LAYER_LABEL, styleTagsOf, type CategoryGroupId } from "@/lib/catalog/categories";
import { formatDimensions } from "@/lib/catalog/format";
import { fetchFolder, fetchImages } from "@/lib/gallery/actions";
import { likedProductIds } from "@/lib/gallery/folder-logic";
import { activeEvent } from "@/lib/events/storage";
import { EMPTY_FILTERS, hasActiveFilters, matchesFilters, type FilterState } from "../catalog/filters";
import { SearchInput } from "@/components/search-input";
import { Select } from "@/components/select";
import { TagToggle } from "@/components/tag-toggle";
import { ProductImage } from "../catalog/product-image";
import { PlanGlyph, glyphSize } from "./plan-glyph";
import { carryProduct, carryRows, dropCarried, rowsToolId } from "@/lib/studio/drag-payload";

// Drag source. Each row carries its product id via dataTransfer; the canvas resolves the drop.
// The products the client liked in the gallery (F-2.3) are pinned to the top ("תיק האירוע") so the
// designer places from the shortlist first — the whole catalog stays available below.
//
// F-5.2 filtering is the same predicate the catalog screen uses (matchesFilters), driven by a much
// smaller set of controls: at this width a permanent filter bar would cost more rows than it saves,
// so category and style tags live behind a disclosure and only the search box is always up.
//
// `groups` narrows the whole rail to a few departments — the meeting's two drawing passes each get
// their own half of the catalog (HALL_PASS_GROUPS / DESIGN_PASS_GROUPS). It's a floor under the
// filters, not one of them: the category dropdown only ever offers what's in scope, and clearing
// the filters cannot widen the rail past it. Absent = the whole catalog, which is /studio.
export function CatalogRail({
  products: all = [],
  groups,
  hint,
  mmPerPx,
  onAddProduct,
  onEditProduct,
  onDuplicateProduct,
  addedIds = [],
  armedId = null,
  onArm,
}: {
  products?: Product[];
  groups?: CategoryGroupId[];
  hint?: string;
  /** The canvas's current zoom, in world mm per screen pixel — a ref the canvas writes and this rail
   *  reads once, at the moment a drag starts, so the picture under the pointer is the item at the
   *  size it will land. Absent = a sensible hall zoom, which is what the rail assumed before. */
  mmPerPx?: RefObject<number>;
  /** Opens the product form over the studio — so an item the client asks for that the catalog does
   *  not have yet is made here, mid-meeting, instead of by leaving the meeting for /catalog. */
  onAddProduct?: () => void;
  /** Opens a row in that same form to EDIT it — the "…" on each row — so a wrong price or size is put
   *  right from here rather than by leaving the sketch for /catalog and coming back. */
  onEditProduct?: (productId: string) => void;
  /** Opens a copy of a row in the form as a new item (the "…"'s שכפול) — the shade or size the
   *  catalog is one step away from. */
  onDuplicateProduct?: (product: Product) => void;
  /** Products added from this rail since the screen opened, newest first. They are pinned above
   *  everything, because the reason one was just made is to drag it onto the plan. */
  addedIds?: string[];
  /** The product a click on the plan will place, while one is armed (click-to-place). */
  armedId?: string | null;
  /** A click on a row arms it; a click on the armed row, or the start of a drag, lets go (null).
   *  Absent = rows are drag-only, as they were. */
  onArm?: (productId: string | null) => void;
} = {}) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  // The catalog is fetched and cached by the studio above us and handed down, so opening the studio
  // is one request rather than one per panel — and so the canvas's resolver and this rail are
  // looking at the same list by construction.
  const products = useMemo(() => all.filter((p) => !p.archived), [all]); // F-4.5: archived stay off the rail

  // The event, the photo library and the event's folder are all server reads. Until they land the
  // rail shows no hearts, which is what an event with no likes shows anyway.
  //
  // This is the read that the folder's crossing was for: the likes happened on the client's tablet,
  // and this rail is on the designer's laptop.
  useEffect(() => {
    let live = true;
    void (async () => {
      const ev = await activeEvent();
      if (!live || !ev) return;
      const [images, folder] = await Promise.all([fetchImages(), fetchFolder(ev.id)]);
      if (live) setLikedIds(likedProductIds(images, folder));
    })();
    return () => {
      live = false;
    };
  }, []);

  // A product just added clears the filters, during render rather than in an effect (the same
  // pattern as useCatalog's seed): a search for "פמוט" still typed in the box would otherwise hide
  // the new "קשת ורדים" the designer is about to reach for.
  const [seenAdded, setSeenAdded] = useState(addedIds.length);
  if (addedIds.length !== seenAdded) {
    setSeenAdded(addedIds.length);
    setFilters(EMPTY_FILTERS);
  }

  const set = (patch: Partial<FilterState>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleTag = (tag: string) =>
    setFilters((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }));

  const allowedGroups = useMemo(() => (groups ? new Set(groups) : null), [groups]);

  const { added, liked, rest } = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const addedSet = new Set(addedIds);
    const likedSet = new Set(likedIds);
    const inScope = (p: Product) => !allowedGroups || allowedGroups.has(CATEGORY_BY_ID[p.category]?.group);
    const match = (p: Product) => inScope(p) && matchesFilters(p, filters);
    // The event folder is filtered too, not exempted: a search for "פמוט" that still shows six
    // liked chuppah photos above the result is a search that didn't happen.
    const added = addedIds.map((id) => byId.get(id)).filter((p): p is Product => !!p && match(p));
    const liked = likedIds
      .map((id) => byId.get(id))
      .filter((p): p is Product => !!p && !addedSet.has(p.id) && match(p));
    const rest = products.filter((p) => !addedSet.has(p.id) && !likedSet.has(p.id) && match(p));
    return { added, liked, rest };
  }, [filters, addedIds, likedIds, products, allowedGroups]);

  // "שורות כיסאות" — a block of the studio's first chair in rows, for a ceremony (lib/design-document/
  // chair-rows.ts). One card, at the head of the catalog, wherever the chairs are in scope and the
  // filters would show a chair; a search finds it by "שורות", "כיסא", "חופה" or "טקס".
  const rowsChair = useMemo(() => {
    const chair = products.find((p) => p.category === "chairs");
    if (!chair) return null;
    if (allowedGroups && !allowedGroups.has(CATEGORY_BY_ID[chair.category]?.group)) return null;
    if (!matchesFilters(chair, { ...filters, search: "" })) return null;
    const q = filters.search.trim();
    if (q && !ROWS_WORDS.some((w) => w.includes(q) || q.includes(w)) && !matchesFilters(chair, filters)) return null;
    return chair;
  }, [products, allowedGroups, filters]);

  const empty = added.length === 0 && liked.length === 0 && rest.length === 0 && !rowsChair;
  const active = hasActiveFilters(filters);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-s border-border bg-surface">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center gap-1.5">
          <SearchInput
            value={filters.search}
            onChange={(v) => set({ search: v })}
            placeholder="חיפוש בקטלוג…"
            aria-label="חיפוש בקטלוג"
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            aria-label="סינון לפי קטגוריה וסגנון"
            title="סינון לפי קטגוריה וסגנון"
            className={
              "relative shrink-0 rounded-md border p-2 transition-colors " +
              (showFilters || active
                ? "border-accent-line bg-accent-tint text-accent"
                : "border-border text-muted hover:text-ink")
            }
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
            {active && !showFilters && (
              <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" aria-hidden />
            )}
          </button>
          {onAddProduct && (
            <button
              type="button"
              onClick={onAddProduct}
              aria-label="הוספת פריט חדש לקטלוג"
              title="הוספת פריט חדש לקטלוג"
              className="shrink-0 rounded-md border border-border p-2 text-muted transition-colors hover:border-accent-line hover:bg-accent-tint hover:text-accent"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>

        {showFilters && (
          <div className="flex flex-col gap-2">
            {/* Departments, not the fine categories: the same level as the catalog page's first
                dropdown, and at this width one short list beats a thirteen-item one. */}
            <Select
              value={filters.category ?? ""}
              onChange={(v) => set({ category: v || null })}
              aria-label="קטגוריה"
              options={[
                { value: "", label: groups ? "כל הקטגוריות בשלב זה" : "כל הקטגוריות" },
                ...CATEGORY_GROUPS.filter((g) => !groups || groups.includes(g.id)).map((g) => ({ value: g.id, label: g.label })),
              ]}
              className="w-full"
            />
            <div className="flex flex-wrap gap-1">
              {styleTagsOf(products).map((tag) => (
                <TagToggle key={tag} active={filters.tags.includes(tag)} onClick={() => toggleTag(tag)}>
                  {tag}
                </TagToggle>
              ))}
            </div>
            {active && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="inline-flex items-center gap-1 self-start text-xs text-muted transition-colors hover:text-ink"
              >
                <X className="h-3 w-3" strokeWidth={2} />
                ניקוי הסינון
              </button>
            )}
          </div>
        )}
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto p-2">
        {added.length > 0 && (
          <>
            <SectionLabel>
              <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
              נוסף עכשיו
            </SectionLabel>
            <ul className="mb-4 flex flex-col gap-1">
              {added.map((p) => (
                <ProductRow key={p.id} product={p} mmPerPx={mmPerPx} armed={p.id === armedId} onArm={onArm} onEdit={onEditProduct} onDuplicate={onDuplicateProduct} />
              ))}
            </ul>
          </>
        )}
        {liked.length > 0 && (
          <>
            <SectionLabel>
              <Heart className="h-3.5 w-3.5 text-accent" strokeWidth={2} fill="currentColor" />
              בתיק האירוע
              <span className="nums text-muted">{liked.length}</span>
            </SectionLabel>
            <ul className="flex flex-col gap-1">
              {liked.map((p) => (
                <ProductRow key={p.id} product={p} mmPerPx={mmPerPx} armed={p.id === armedId} onArm={onArm} onEdit={onEditProduct} onDuplicate={onDuplicateProduct} />
              ))}
            </ul>
            <SectionLabel className="mt-4">כל הקטלוג</SectionLabel>
          </>
        )}
        {added.length > 0 && liked.length === 0 && rest.length > 0 && <SectionLabel>כל הקטלוג</SectionLabel>}
        <ul className="flex flex-col gap-1">
          {rowsChair && <RowsCard chair={rowsChair} mmPerPx={mmPerPx} armed={armedId === rowsToolId(rowsChair.id)} onArm={onArm} />}
          {rest.map((p) => (
            <ProductRow key={p.id} product={p} mmPerPx={mmPerPx} armed={p.id === armedId} onArm={onArm} onEdit={onEditProduct} onDuplicate={onDuplicateProduct} />
          ))}
        </ul>
        {empty && <p className="p-4 text-center text-sm text-muted">אין תוצאות</p>}
      </div>
      <p className="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted">
        {armedId
          ? "לחיצה על התוכנית מניחה את הפריט המסומן. Esc, לחיצה ימנית או לחיצה נוספת על הפריט — לסיום."
          : (hint ?? "לחצו על פריט ואז על התוכנית, או גררו אותו. פריטי שולחן — על שולחן; רצפה ותקרה — לכל נקודה.")}
      </p>
    </aside>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-1.5 pb-1.5 text-xs font-medium text-ink-soft ${className}`}>
      {children}
    </div>
  );
}

// The picture that follows the pointer out of the rail: the item AS THE PLAN DRAWS IT, at the
// canvas's current zoom, held by its centre — which is the point the drop lands on. The browser's
// own default is a translucent snapshot of the list row, so a designer dragging "עגול 244" watched a
// row of text cross the hall and only learned how much room the table takes once it was down.
//
// Rendered imperatively rather than kept mounted per row: setDragImage needs a real, painted element
// at the instant dragstart fires, and a hidden copy of every glyph in a catalog of two hundred is
// two hundred SVGs on a panel that has one job. createRoot + flushSync gives the same component the
// canvas uses, synchronously, for the one item being dragged; the browser snapshots it and the node
// is gone by the next task.
function showPlanGlyph(e: React.DragEvent, product: Product, mmPerPx: number) {
  if (typeof document === "undefined" || typeof e.dataTransfer.setDragImage !== "function") return;
  const host = document.createElement("div");
  // Off-screen but genuinely laid out: a display:none element has nothing to snapshot.
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;top:0;inset-inline-start:-10000px;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    // A composite carries its parts, held by its ORIGIN — the point a drop pastes them about — so the
    // picture is laid out symmetric about it (compositeGlyph).
    const glyph = product.composition ? compositeGlyph(product, mmPerPx) : null;
    flushSync(() => root.render(glyph ? glyph.node : <PlanGlyph product={product} mmPerPx={mmPerPx} />));
    const { w, h } = glyph ?? glyphSize(product, mmPerPx);
    e.dataTransfer.setDragImage(host, w / 2, h / 2);
  } catch {
    // A drag that cannot be given a custom image is still a perfectly good drag — the browser falls
    // back to its own snapshot rather than the drop being lost.
  }
  // After the browser has taken its picture, which it does synchronously as this handler returns.
  setTimeout(() => {
    root.unmount();
    host.remove();
  }, 0);
}

/** A composite's drag image: its parts at the canvas's zoom, kept between 30 and 320 px on its longest
 *  side, in a box symmetric about the item's origin so the pointer holds it where it will land. */
function compositeGlyph(product: Product, mmPerPx: number): { node: React.ReactNode; w: number; h: number } | null {
  const c = product.composition;
  if (!c) return null;
  const b = compositionBox(c);
  const hw = Math.max(-b.minX, b.maxX, 100);
  const hh = Math.max(-b.minY, b.maxY, 100);
  let pxPerMm = 1 / Math.max(0.01, mmPerPx);
  const longest = Math.max(hw, hh) * 2 * pxPerMm;
  if (longest < 30) pxPerMm *= 30 / longest;
  else if (longest > 320) pxPerMm *= 320 / longest;
  const w = Math.max(8, Math.round(hw * 2 * pxPerMm));
  const h = Math.max(8, Math.round(hh * 2 * pxPerMm));
  return {
    w,
    h,
    node: (
      <svg width={w} height={h} viewBox={`${-hw} ${-hh} ${hw * 2} ${hh * 2}`} style={{ overflow: "visible", filter: "drop-shadow(0 4px 10px rgb(109 85 189 / 0.35))" }}>
        <CompositionPieces composition={c} outline />
      </svg>
    ),
  };
}

const ROWS_WORDS = ["שורות", "כיסא", "כיסאות", "חופה", "טקס"];

/** The block's drag image: its chairs at the canvas's zoom, kept between 30 and 240 px on its longest
 *  side like any item's (plan-glyph.tsx), held by its centre. */
function showRowsGlyph(e: React.DragEvent, chair: Product, spec: ChairRows, mmPerPx: number) {
  if (typeof document === "undefined" || typeof e.dataTransfer.setDragImage !== "function") return;
  const l = chairRowsLayout(spec, catalogBox(chair));
  let pxPerMm = 1 / Math.max(0.01, mmPerPx);
  const longest = Math.max(l.widthMm, l.depthMm) * pxPerMm;
  if (longest < 30) pxPerMm *= 30 / longest;
  else if (longest > 240) pxPerMm *= 240 / longest;
  const w = Math.max(8, Math.round(l.widthMm * pxPerMm));
  const h = Math.max(8, Math.round(l.depthMm * pxPerMm));
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;top:0;inset-inline-start:-10000px;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() =>
      root.render(
        <svg width={w} height={h} viewBox={`${-l.widthMm / 2} ${-l.depthMm / 2} ${l.widthMm} ${l.depthMm}`} style={{ overflow: "visible", filter: "drop-shadow(0 4px 10px rgb(109 85 189 / 0.35))" }}>
          <ChairBlock product={chair} spec={spec} />
          <rect x={-l.widthMm / 2} y={-l.depthMm / 2} width={l.widthMm} height={l.depthMm} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
        </svg>,
      ),
    );
    e.dataTransfer.setDragImage(host, w / 2, h / 2);
  } catch {
    // The browser's own snapshot is still a perfectly good drag.
  }
  setTimeout(() => {
    root.unmount();
    host.remove();
  }, 0);
}

/** The rail's "שורות כיסאות": the studio's first chair, set out five rows of five — dragged, or
 *  clicked and then clicked onto the plan, exactly as any row. The block's own bar sets the rows, the
 *  gaps and an aisle, and swaps the chair. */
function RowsCard({
  chair,
  mmPerPx,
  armed,
  onArm,
}: {
  chair: Product;
  mmPerPx?: RefObject<number>;
  armed: boolean;
  onArm?: (productId: string | null) => void;
}) {
  const id = rowsToolId(chair.id);
  const toggle = () => onArm?.(armed ? null : id);
  const thumb: ChairRows = { rows: 3, perRow: 4, aisleMm: 600 };
  const t = chairRowsLayout(thumb, catalogBox(chair));
  const pad = Math.max(t.widthMm, t.depthMm) * 0.08;
  return (
    <li>
      <div
        draggable
        role={onArm ? "button" : undefined}
        tabIndex={onArm ? 0 : undefined}
        aria-pressed={onArm ? armed : undefined}
        title={onArm ? (armed ? "לחיצה נוספת מפסיקה את ההנחה" : "לחיצה — הנחה על התוכנית; גרירה — הנחה אחת") : undefined}
        onClick={onArm ? toggle : undefined}
        onKeyDown={
          onArm
            ? (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                toggle();
              }
            : undefined
        }
        onDragStart={(e) => {
          if (armed) onArm?.(null);
          e.dataTransfer.setData("text/product", id);
          e.dataTransfer.effectAllowed = "copy";
          carryRows(chair, NEW_BLOCK);
          showRowsGlyph(e, chair, NEW_BLOCK, mmPerPx?.current ?? 20);
        }}
        onDragEnd={dropCarried}
        className={
          "group flex cursor-grab items-center gap-2.5 rounded-md border p-1.5 transition-colors active:cursor-grabbing " +
          (armed ? "border-accent-line bg-accent-tint" : "border-transparent hover:border-border hover:bg-bg")
        }
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-canvas">
          <svg viewBox={`${-t.widthMm / 2 - pad} ${-t.depthMm / 2 - pad} ${t.widthMm + pad * 2} ${t.depthMm + pad * 2}`} className="h-10 w-10" aria-hidden>
            <ChairBlock product={chair} spec={thumb} />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className={"truncate text-sm font-medium " + (armed ? "text-accent" : "text-ink")}>שורות כיסאות</p>
          <p className="truncate text-xs text-muted">
            <span className="nums">{`${NEW_BLOCK.rows} × ${NEW_BLOCK.perRow}`}</span> · {chair.name}
          </p>
        </div>
        {armed ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-surface px-1.5 py-0.5 text-xs font-semibold text-accent">
            <MousePointerClick className="h-3.5 w-3.5" strokeWidth={2} />
            מניחים
          </span>
        ) : (
          <span className="shrink-0 rounded-sm bg-bg px-1.5 py-0.5 text-xs text-ink-soft">לחופה</span>
        )}
      </div>
    </li>
  );
}

function ProductRow({
  product: p,
  mmPerPx,
  armed,
  onArm,
  onEdit,
  onDuplicate,
}: {
  product: Product;
  mmPerPx?: RefObject<number>;
  armed: boolean;
  onArm?: (productId: string | null) => void;
  onEdit?: (productId: string) => void;
  onDuplicate?: (product: Product) => void;
}) {
  const toggle = () => onArm?.(armed ? null : p.id);
  // The open panel hangs over the rows below, which come later in the DOM: lifted while it is open
  // (the catalog card's rule, app/(app)/catalog/product-card.tsx).
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <li className={menuOpen ? "relative z-30" : undefined}>
      <div
        draggable
        // A button as well as a drag source: a click arms the row and the plan places it, click after
        // click, until Escape — forty tables are forty clicks, not forty drags across the screen.
        role={onArm ? "button" : undefined}
        tabIndex={onArm ? 0 : undefined}
        aria-pressed={onArm ? armed : undefined}
        title={onArm ? (armed ? "לחיצה נוספת מפסיקה את ההנחה" : "לחיצה — הנחה על התוכנית; גרירה — הנחה אחת") : undefined}
        onClick={onArm ? toggle : undefined}
        onKeyDown={
          onArm
            ? (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                toggle();
              }
            : undefined
        }
        onDragStart={(e) => {
          // A drag is its own one-off placement; holding an armed item through it would leave the
          // plan placing something the designer has visibly moved on from.
          if (armed) onArm?.(null);
          e.dataTransfer.setData("text/product", p.id);
          e.dataTransfer.effectAllowed = "copy";
          // The canvas cannot read dataTransfer until the drop, so it is told separately how big
          // the thing crossing it is — that is what its guide lines are measured against.
          carryProduct(p);
          showPlanGlyph(e, p, mmPerPx?.current ?? 20);
        }}
        onDragEnd={dropCarried}
        className={
          "group flex cursor-grab items-center gap-2.5 rounded-md border p-1.5 transition-colors active:cursor-grabbing " +
          (armed ? "border-accent-line bg-accent-tint" : "border-transparent hover:border-border hover:bg-bg")
        }
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border">
          <ProductImage product={p} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={"truncate text-sm font-medium " + (armed ? "text-accent" : "text-ink")}>{p.name}</p>
          <p className="nums truncate text-xs text-muted">{formatDimensions(p.dimensions)}</p>
        </div>
        {armed ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-surface px-1.5 py-0.5 text-xs font-semibold text-accent">
            <MousePointerClick className="h-3.5 w-3.5" strokeWidth={2} />
            מניחים
          </span>
        ) : (
          <span className="shrink-0 rounded-sm bg-bg px-1.5 py-0.5 text-xs text-ink-soft">{p.composition ? "מורכב" : LAYER_LABEL[p.layer]}</span>
        )}
        {(onEdit || onDuplicate) && (
          // The row is itself a button (it arms): the menu's clicks and keys stop here, so opening
          // it, or choosing from it with Enter, never arms the item as well.
          <span className="-me-1 shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Menu
              label={`אפשרויות ל${p.name}`}
              onOpenChange={setMenuOpen}
              items={[
                ...(onEdit ? [{ label: "עריכת הפריט", icon: Pencil, onSelect: () => onEdit(p.id) }] : []),
                ...(onDuplicate ? [{ label: "שכפול לפריט חדש", icon: Copy, onSelect: () => onDuplicate(p) }] : []),
              ]}
            />
          </span>
        )}
      </div>
    </li>
  );
}

export { CATEGORY_BY_ID };
