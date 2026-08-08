import { CATEGORY_BY_ID } from "@/lib/catalog/categories";

// Three soft washes echoing the same peach → blush → violet family a saturated reference used,
// just pulled back to tint strength — a grid of a dozen cards can't each carry a full-strength
// gradient (DESIGN.md: at most one saturated surface per screen) without turning into visual
// noise, but a pale, per-product cycle still reads as "warm and varied", not an empty grey gap.
const PLACEHOLDER_THEMES = [
  "from-peach/40 to-blush/30",
  "from-blush/35 to-accent-tint",
  "from-accent-tint to-indigo-50",
];

function placeholderTheme(productId: string): string {
  let hash = 0;
  for (let i = 0; i < productId.length; i++) hash = (hash * 31 + productId.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_THEMES[hash % PLACEHOLDER_THEMES.length];
}

// The product photo is the card hero. Until the designer uploads one, we show a calm,
// honest per-category glyph rather than a broken image or a fake stock photo.
export function ProductImage({
  imageUrl,
  category,
  name,
  productId,
  className = "",
}: {
  imageUrl?: string;
  category: string;
  name: string;
  productId: string;
  className?: string;
}) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs; next/image needs remote config we don't have yet
    return <img src={imageUrl} alt={name} className={`h-full w-full object-cover ${className}`} />;
  }
  const Icon = CATEGORY_BY_ID[category]?.icon;
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${placeholderTheme(productId)} ${className}`}
      aria-hidden="true"
    >
      {Icon ? <Icon className="h-9 w-9 text-accent/40" strokeWidth={1.5} /> : null}
    </div>
  );
}
