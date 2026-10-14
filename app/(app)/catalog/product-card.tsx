"use client";

import { useState } from "react";
import { Copy, Globe, Layers, Palette, Pencil, Trash2 } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { CATEGORY_BY_ID, LAYER_LABEL } from "@/lib/catalog/categories";
import { formatDimensions, formatPrice } from "@/lib/catalog/format";
import { flowerSummary } from "@/lib/catalog/flowers";
import { Menu, type MenuItem } from "@/components/menu";
import { ProductImage } from "./product-image";

// The whole card is one click target (opens the drawer), but the actions need their own click
// handlers — nesting a <button> in a <button> isn't valid HTML, so the "whole card clickable"
// affordance is an absolutely-positioned cover <button> BEHIND the visible content (which is
// pointer-events-none so clicks fall through to it), and anything interactive inside that content
// re-enables pointer-events for itself and sits on top.
//
// The actions live behind one "…" (components/menu.tsx) rather than appearing on hover. Two buttons
// fading in over the card had three problems and no advantage: they landed on the corner where the
// ציבורי badge already is, they told a touch screen nothing at all, and a third action would have
// had nowhere to go. The dot is always there, in the title row, at the weight of ordinary muted
// text — one quiet affordance instead of an interface that appears and disappears.
export function ProductCard({
  product,
  layout = "grid",
  onEdit,
  onDuplicate,
  onDelete,
}: {
  product: Product;
  layout?: "grid" | "list";
  onEdit: (p: Product) => void;
  onDuplicate: (p: Product) => void;
  /** ASKS to delete — the card raises the question and the screen owns the confirmation, so there
   *  is one dialog on the page rather than one per card. */
  onDelete: (p: Product) => void;
}) {
  const category = CATEGORY_BY_ID[product.category];
  const tags = product.styleTags;
  // An arrangement's spec, as one line — the thing that tells two "סידור נמוך" cards apart.
  const flowers = flowerSummary(product.flowers);
  // The open panel hangs past the bottom of the card, and the next card in the grid is later in the
  // DOM — so without lifting this one out of the flow the menu is painted underneath its neighbour.
  // (The card also becomes its own stacking context while hovered, because of the -translate-y, so
  // a z-index on the panel alone cannot reach past the card.)
  const [menuOpen, setMenuOpen] = useState(false);
  const lifted = menuOpen ? " z-30" : "";

  const actions: MenuItem[] = [
    { label: "עריכה", icon: Pencil, onSelect: () => onEdit(product) },
    { label: "שכפול", icon: Copy, onSelect: () => onDuplicate(product) },
    { label: "מחיקה", icon: Trash2, onSelect: () => onDelete(product), danger: true },
  ];
  const menu = (
    <Menu
      label={`אפשרויות ל${product.name}`}
      items={actions}
      onOpenChange={setMenuOpen}
      // -me-1 pulls the dot's own padding back out, so the icon lines up with the card's content
      // edge rather than sitting a button's worth of air inside it.
      className="pointer-events-auto -me-1 shrink-0"
    />
  );

  if (layout === "list") {
    return (
      <div
        className={`relative flex items-center gap-3 rounded-lg border border-border bg-surface p-2 text-right transition duration-150 ease-fluid hover:shadow-floating${lifted}`}
      >
        <button
          type="button"
          onClick={() => onEdit(product)}
          aria-label={`עריכת ${product.name}`}
          className="absolute inset-0 z-0 rounded-lg"
        />

        <div className="pointer-events-none relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border">
          <ProductImage product={product} />
        </div>

        <div className="pointer-events-none relative min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display truncate text-sm text-ink">{product.name}</h3>
            {product.variants.length > 0 && (
              <span className="nums inline-flex shrink-0 items-center gap-1 text-xs text-muted">
                <Palette className="h-3 w-3" strokeWidth={2} />
                {product.variants.length}
              </span>
            )}
          </div>
          <div className="nums mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{formatDimensions(product.dimensions)}</span>
            <span className="text-border" aria-hidden="true">·</span>
            <span>{category?.label}</span>
            {flowers && (
              <>
                <span className="text-border" aria-hidden="true">·</span>
                <span className="truncate">{flowers}</span>
              </>
            )}
            {tags.length > 0 && (
              <>
                <span className="text-border" aria-hidden="true">·</span>
                <span className="truncate">{tags.join(", ")}</span>
              </>
            )}
          </div>
        </div>

        <span className="pointer-events-none relative flex shrink-0 items-baseline gap-1">
          <span className="nums text-lg font-bold text-ink">{formatPrice(product.unitPrice)}</span>
          {product.unitPrice != null && <span className="text-xs text-muted">ליחידה</span>}
        </span>

        {menu}
      </div>
    );
  }

  const shownTags = tags.slice(0, 2);
  const extraTags = tags.length - shownTags.length;

  return (
    <div
      className={`relative flex flex-col rounded-lg border border-border bg-surface p-2 text-right transition duration-150 ease-fluid hover:-translate-y-0.5 hover:shadow-floating${lifted}`}
    >
      <button
        type="button"
        onClick={() => onEdit(product)}
        aria-label={`עריכת ${product.name}`}
        className="absolute inset-0 z-0 rounded-lg"
      />

      <div className="pointer-events-none relative flex flex-col">
        <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-md border border-border">
          <ProductImage product={product} />
          {product.variants.length > 0 && (
            <span className="absolute start-1.5 top-1.5 inline-flex items-center gap-1 rounded-pill border border-canvas/50 bg-canvas/70 px-2 py-0.5 text-xs font-medium text-ink-soft backdrop-blur-sm">
              <Palette className="h-3 w-3" strokeWidth={2} />
              <span className="nums">{product.variants.length}</span> גוונים
            </span>
          )}
          {/* Only PUBLIC is marked. Private is the default and the overwhelming majority, so a badge
              on every card would be noise; the badge means "this one leaves the studio". */}
          {product.visibility === "public" && (
            <span className="absolute end-1.5 top-1.5 inline-flex items-center gap-1 rounded-pill border border-accent-line bg-accent-tint/90 px-2 py-0.5 text-xs font-semibold text-accent backdrop-blur-sm">
              <Globe className="h-3 w-3" strokeWidth={2} />
              ציבורי
            </span>
          )}
        </div>

        {/* The "…" sits beside the title rather than over the image: the two corners of the image
            are already spoken for by the גוונים and ציבורי badges, and a menu button that lands on
            top of a badge is a menu button that lands on top of a badge. */}
        <div className="flex items-start justify-between gap-1">
          <h3 className="font-display text-base leading-tight text-ink">{product.name}</h3>
          {menu}
        </div>

        <p className="nums mt-1 text-sm text-muted">{formatDimensions(product.dimensions)}</p>
        {flowers && <p className="nums mt-0.5 truncate text-xs text-muted">{flowers}</p>}

        <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
          <span>{category?.label}</span>
          <span className="text-border" aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" strokeWidth={2} />
            {LAYER_LABEL[product.layer]}
          </span>
        </div>

        {tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {shownTags.map((t) => (
              <span key={t} className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-ink-soft">
                {t}
              </span>
            ))}
            {extraTags > 0 && <span className="nums px-1 py-0.5 text-xs text-muted">+{extraTags}</span>}
          </div>
        )}

        <div className="-mx-2 mt-3 flex items-baseline justify-between gap-1 border-t border-border px-4 pb-1 pt-2.5">
          {product.unitPrice != null && <span className="text-xs text-muted">מחיר ליחידה</span>}
          <span className="nums text-lg font-bold text-ink">{formatPrice(product.unitPrice)}</span>
        </div>
      </div>
    </div>
  );
}
