import type { Product } from "@/lib/catalog/types";
import type { MarketSupplier } from "@/lib/marketplace/types";
import { ProductImage } from "../catalog/product-image";

// The two pictures a supplier is known by on the marketplace, shared by the shop card and the
// shop's own header: a cover made of what they sell (a supplier uploads no banner — their products
// ARE the shop window), and their logo, or their initial when they have none.

/** Up to three products as one cover: one alone, two side by side, three as one large and two
 *  stacked beside it. */
export function ShopCover({ products, className = "" }: { products: Product[]; className?: string }) {
  const [first, ...rest] = products;
  if (!first) return <div className={`bg-inset ${className}`} aria-hidden="true" />;
  const layout =
    products.length === 1 ? "grid-cols-1" : products.length === 2 ? "grid-cols-2" : "grid-cols-3 grid-rows-2";
  return (
    <div className={`grid gap-0.5 bg-border ${layout} ${className}`} aria-hidden="true">
      <div className={`overflow-hidden ${products.length >= 3 ? "col-span-2 row-span-2" : ""}`}>
        <ProductImage product={first} />
      </div>
      {rest.map((p) => (
        <div key={p.id} className="overflow-hidden">
          <ProductImage product={p} />
        </div>
      ))}
    </div>
  );
}

export function ShopAvatar({ supplier, className = "" }: { supplier: MarketSupplier; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-surface bg-accent-tint shadow-lifted ${className}`}
    >
      {supplier.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs, as ProductImage
        <img src={supplier.logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-display text-xl font-bold text-accent" aria-hidden="true">
          {supplier.name.trim().charAt(0)}
        </span>
      )}
    </span>
  );
}
