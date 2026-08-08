import { Copy, Layers, Palette, Pencil } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { CATEGORY_BY_ID, LAYER_LABEL } from "@/lib/catalog/categories";
import { formatDimensions, formatPrice } from "@/lib/catalog/format";
import { IconButton } from "@/components/icon-button";
import { ProductImage } from "./product-image";

// The whole card is one click target (opens the drawer), but Edit/Duplicate need their own
// click handlers — nesting a <button> in a <button> isn't valid HTML, so the "whole card
// clickable" affordance is an absolutely-positioned cover <button> BEHIND the visible content
// (which is pointer-events-none so clicks fall through to it), with the quick actions as a
// separate, later sibling that re-enables pointer-events for itself and sits on top.
export function ProductCard({
  product,
  layout = "grid",
  onEdit,
  onDuplicate,
}: {
  product: Product;
  layout?: "grid" | "list";
  onEdit: (p: Product) => void;
  onDuplicate: (p: Product) => void;
}) {
  const category = CATEGORY_BY_ID[product.category];
  const tags = product.styleTags;

  const quickActions = (
    <div
      className={
        "pointer-events-auto relative flex shrink-0 gap-1 rounded-pill border border-canvas/60 bg-canvas/80 p-1 opacity-0 shadow-floating backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" +
        (layout === "list" ? " border-none bg-transparent p-0 shadow-none backdrop-blur-none" : "")
      }
    >
      <IconButton label={`עריכת ${product.name}`} onClick={() => onEdit(product)}>
        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
      </IconButton>
      <IconButton label={`שכפול ${product.name}`} onClick={() => onDuplicate(product)}>
        <Copy className="h-3.5 w-3.5" strokeWidth={2} />
      </IconButton>
    </div>
  );

  if (layout === "list") {
    return (
      <div className="group relative flex items-center gap-3 rounded-lg border border-border bg-surface p-2 text-right transition duration-150 ease-fluid hover:shadow-floating">
        <button
          type="button"
          onClick={() => onEdit(product)}
          aria-label={`עריכת ${product.name}`}
          className="absolute inset-0 z-0 rounded-lg"
        />

        <div className="pointer-events-none relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border">
          <ProductImage imageUrl={product.imageUrl} category={product.category} name={product.name} productId={product.id} />
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

        {quickActions}
      </div>
    );
  }

  const shownTags = tags.slice(0, 2);
  const extraTags = tags.length - shownTags.length;

  return (
    <div className="group relative flex flex-col rounded-lg border border-border bg-surface p-2 text-right transition duration-150 ease-fluid hover:-translate-y-0.5 hover:shadow-floating">
      <button
        type="button"
        onClick={() => onEdit(product)}
        aria-label={`עריכת ${product.name}`}
        className="absolute inset-0 z-0 rounded-lg"
      />

      <div className="pointer-events-none relative flex flex-col">
        <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-md border border-border">
          <ProductImage imageUrl={product.imageUrl} category={product.category} name={product.name} productId={product.id} />
          {product.variants.length > 0 && (
            <span className="absolute start-1.5 top-1.5 inline-flex items-center gap-1 rounded-pill border border-canvas/50 bg-canvas/70 px-2 py-0.5 text-xs font-medium text-ink-soft backdrop-blur-sm">
              <Palette className="h-3 w-3" strokeWidth={2} />
              <span className="nums">{product.variants.length}</span> גוונים
            </span>
          )}
        </div>

        <h3 className="font-display text-base leading-tight text-ink">{product.name}</h3>

        <p className="nums mt-1 text-sm text-muted">{formatDimensions(product.dimensions)}</p>

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

      <div className="pointer-events-none absolute inset-x-2 top-2 flex justify-end">{quickActions}</div>
    </div>
  );
}
