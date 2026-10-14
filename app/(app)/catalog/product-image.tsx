import type { Product } from "@/lib/catalog/types";
import { AppearancePreview } from "./appearance-preview";

// The product photo is the card hero. Until the designer uploads one, the card shows the item AS THE
// PLAN DRAWS IT — the table with its chairs, the stage in its decks' timber, the candelabrum with its
// candles, in its own shade — on a tile with the plan's own dotted ground. That is a truer picture of
// the row than the category glyph it replaced (every table in the catalog wore the same table icon),
// and it is the picture the designer will meet on the sketch.
export function ProductImage({ product, className = "" }: { product: Product; className?: string }) {
  if (product.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs; next/image needs remote config we don't have yet
    return <img src={product.imageUrl} alt={product.name} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-canvas p-[8%] ${className}`}
      style={{
        backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)",
        backgroundSize: "10px 10px",
      }}
      aria-hidden="true"
    >
      <AppearancePreview product={product} className="h-full w-full" />
    </div>
  );
}
