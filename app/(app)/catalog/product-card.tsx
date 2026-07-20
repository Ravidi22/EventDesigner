import { Layers, Palette } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { CATEGORY_BY_ID, LAYER_LABEL } from "@/lib/catalog/categories";
import { formatDimensions, formatPrice } from "@/lib/catalog/format";
import { ProductImage } from "./product-image";

export function ProductCard({ product, onEdit }: { product: Product; onEdit: (p: Product) => void }) {
  const category = CATEGORY_BY_ID[product.category];
  const tags = product.styleTags;
  const shownTags = tags.slice(0, 2);
  const extraTags = tags.length - shownTags.length;

  return (
    <button
      type="button"
      onClick={() => onEdit(product)}
      className="group flex flex-col rounded-lg border border-border bg-surface p-2 text-right transition duration-150 ease-fluid hover:shadow-floating focus-visible:shadow-floating"
    >
      <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-md border border-border">
        <ProductImage imageUrl={product.imageUrl} category={product.category} name={product.name} />
        {product.variants.length > 0 && (
          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-sm border border-border bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink-soft">
            <Palette className="h-3 w-3" strokeWidth={2} />
            <span className="nums">{product.variants.length}</span> גוונים
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold leading-tight text-ink">{product.name}</h3>

      <p className="nums mt-0.5 text-sm text-muted">{formatDimensions(product.dimensions)}</p>

      <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
        <span>{category?.label}</span>
        <span className="text-border" aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" strokeWidth={2} />
          {LAYER_LABEL[product.layer]}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {shownTags.map((t) => (
            <span
              key={t}
              className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-ink-soft"
            >
              {t}
            </span>
          ))}
          {extraTags > 0 && (
            <span className="nums px-1 py-0.5 text-xs text-muted">+{extraTags}</span>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <span className="nums text-sm font-semibold text-ink">{formatPrice(product.unitPrice)}</span>
        <span className="text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          עריכה
        </span>
      </div>
    </button>
  );
}
