"use client";

import type { Product } from "@/lib/catalog/types";
import { resolveFootprint, resolveContent, footprintBounds, type ResolvedContent } from "@/lib/studio/footprint";
import { labelAnchor } from "@/lib/studio/label-anchor";
import type { Point } from "@/lib/design-document/types";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";
import { isDark, resolveStyle } from "@/lib/element-style";
import { FootprintShape } from "@/components/footprint-shape";
import { ClothDrape, CLOTH_DROP_MM, DrapePleats, ItemSymbol, RugPattern, SeatChair } from "@/components/item-symbol";
import { ItemSurface } from "@/components/surface-fill";
import { anySurface } from "@/lib/catalog/textures";
import { CATEGORY_BY_ID, anchorOf } from "@/lib/catalog/categories";
import { seatsAround, CHAIR_D_MM, CHAIR_W_MM } from "@/lib/studio/seating";
import { chairStyleOf, symbolCount, symbolOf } from "@/lib/catalog/symbols";

export function AppearancePreview({ product, className }: { product: Product; className?: string }) {
  const f = resolveFootprint(product);
  const content = resolveContent(product);
  const cat = CATEGORY_BY_ID[product.category];
  // The colour the plan draws it in when nothing else says: its first shade.
  const swatch = product.variants.find((v) => !v.archived && v.swatch)?.swatch;

  // A drape has no width of its own — it is cut to whatever wall it hangs on — so it previews as a
  // length of itself: the band, its pleats, in its shade.
  if (cat?.anchor === "wall") {
    const colour = swatch ?? product.appearance?.style?.fill ?? "#E9E4F2";
    return (
      <svg viewBox="-1400 -700 2800 1400" className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית">
        <rect x={-1200} y={-160} width={2400} height={320} fill={colour} stroke="currentColor" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <DrapePleats lengthMm={2400} depthMm={320} ink={isDark(colour) ? "#ffffff" : "var(--color-ink)"} opacity={isDark(colour) ? 0.5 : 0.35} />
      </svg>
    );
  }

  // Bounds in mm, centered on (0,0) to match the map's local frame. "currentColor" is the
  // pass-through default: with no style set, resolveStyle hands it straight back and the
  // wrapping <svg>'s text-ink-soft class still drives it exactly as before.
  const resolved = resolveStyle(product.appearance?.style, "screen", { fill: swatch ?? "#ffffff", stroke: "currentColor", strokeWidth: 2 });
  // The same component the plan draws with, so a shape made of several parts previews as the plan
  // will draw it rather than as a second opinion about it.
  const { w, h } = footprintBounds(f);
  // The category's picture, when it has one — the card shows the item the way the plan will.
  const symbol = symbolOf(product, f);
  const surfaced = !symbol && anySurface(product.appearance);
  const cloth = anchorOf(product) === "table"; // a runner is drawn as itself, not as a cloth
  const shape = (
    <FootprintShape
      footprint={f}
      fill={resolved.fill}
      fillOpacity={symbol ? 0 : undefined}
      stroke={resolved.stroke}
      strokeOpacity={cloth ? 0.25 : undefined}
      strokeWidth={cloth ? 1 : resolved.strokeWidth}
      strokeDasharray={resolved.dashArray.length ? resolved.dashArray.join(" ") : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
  // A table is shown laid: its chairs round it, on the sides that are open, exactly as the plan
  // will put them — which is most of what tells a 180 round from a 160 square at a glance.
  const seats = product.category === "tables" ? Number(product.categoryFields?.seats) || 0 : 0;
  const ring = seats > 0 ? seatsAround(f, seats, undefined, product.appearance?.blockedSides ?? []) : [];
  const reach = ring.length ? CHAIR_D_MM + 120 : cloth ? CLOTH_DROP_MM : 0;

  const pad = Math.max(w, h) * 0.12 + 80 + reach;
  const vb = `${-(w / 2 + pad)} ${-(h / 2 + pad)} ${w + pad * 2} ${h + pad * 2}`;
  return (
    <svg viewBox={vb} className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית">
      {ring.map((seat, i) => (
        <g key={i} transform={`translate(${seat.x} ${seat.y}) rotate(${seat.facingDeg})`}>
          <SeatChair widthMm={CHAIR_W_MM} depthMm={CHAIR_D_MM} />
        </g>
      ))}
      {symbol ? (
        <ItemSymbol
          kind={symbol}
          footprint={f}
          count={symbolCount(product, symbol)}
          tone={swatch ?? product.appearance?.style?.fill}
          overhead={product.layer === "ceiling"}
          chairStyle={chairStyleOf(product)}
        />
      ) : (
        <>
          {cloth && <ClothDrape footprint={f} colour={resolved.fill} />}
          {shape}
          {surfaced && (
            <>
              <ItemSurface appearance={product.appearance} footprint={f} color={product.appearance?.style?.fill ?? swatch} seed={product.id} />
              <FootprintShape footprint={f} fill="none" stroke={resolved.stroke} strokeWidth={resolved.strokeWidth} vectorEffect="non-scaling-stroke" />
            </>
          )}
          {product.category === "rugs" && f.kind === "rect" && <RugPattern w={f.widthMm} h={f.depthMm} />}
          {/* A cloth is the table's surface on the plan, never labelled there — so not here either. */}
          {!cloth && <PlanContent content={content} w={w} h={h} at={labelAnchor(f)} />}
        </>
      )}
    </svg>
  );
}

const ORIGIN: Point = { x: 0, y: 0 };

/** The name-or-icon that sits inside a footprint — at `at`, the shape's own label point
 *  (lib/studio/label-anchor.ts) in a `w`×`h` box centred on (0,0), in mm. The plan writes a name at
 *  the same point, so the preview shows where it will actually land: the middle of an arc's band,
 *  not the box centre out in the air.
 *
 *  Its own component because the custom-shape editor draws it too: the shape canvas is a plan, and
 *  a plan that shows the outline but not what is written inside it answers "what will this look
 *  like?" with half the picture — which is exactly what an icon picked in that modal used to do,
 *  visible only in the 96px tile beside a full-screen canvas that ignored it.
 *
 *  An icon whose name no longer exists in MAP_ICONS falls back to the NAME rather than to nothing:
 *  drawing an empty shape is the one outcome that tells the designer neither what is wrong nor
 *  that anything is. */
export function PlanContent({ content, w, h, at = ORIGIN }: { content: ResolvedContent; w: number; h: number; at?: Point }) {
  const Icon = content.mode === "icon" && content.icon ? ICON_BY_NAME[content.icon] : undefined;
  if (Icon) {
    const size = Math.min(w, h) * 0.6;
    return (
      <g transform={`translate(${at.x - size / 2} ${at.y - size / 2})`}>
        <Icon width={size} height={size} color="currentColor" />
      </g>
    );
  }
  if (content.mode === "none") return null;
  return (
    <text x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central" fill="currentColor"
      style={{ fontSize: Math.max(120, Math.min(h * 0.4, w * 0.22)) }}>
      {content.name}
    </text>
  );
}
