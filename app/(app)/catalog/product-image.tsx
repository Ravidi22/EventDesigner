import { CATEGORY_BY_ID } from "@/lib/catalog/categories";

// The product photo is the card hero. Until the designer uploads one, we show a calm,
// honest per-category glyph rather than a broken image or a fake stock photo.
export function ProductImage({
  imageUrl,
  category,
  name,
  className = "",
}: {
  imageUrl?: string;
  category: string;
  name: string;
  className?: string;
}) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs; next/image needs remote config we don't have yet
    return <img src={imageUrl} alt={name} className={`h-full w-full object-cover ${className}`} />;
  }
  const Icon = CATEGORY_BY_ID[category]?.icon;
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-bg ${className}`}
      aria-hidden="true"
    >
      {Icon ? <Icon className="h-9 w-9 text-ink-soft/35" strokeWidth={1.5} /> : null}
    </div>
  );
}
