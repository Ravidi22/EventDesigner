"use client";

import { useId, type ReactNode } from "react";
import type { Product } from "@/lib/catalog/types";
import { chandelierDrawOf } from "@/lib/catalog/chandelier";
import { chuppahDrawOf } from "@/lib/catalog/chuppah";
import { resolveFootprint, resolveContent, footprintBounds, type ResolvedContent } from "@/lib/studio/footprint";
import { labelAnchor } from "@/lib/studio/label-anchor";
import type { Point } from "@/lib/design-document/types";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";
import { isDark, resolveStyle } from "@/lib/element-style";
import { FootprintShape } from "@/components/footprint-shape";
import { ClothDrape, CLOTH_DROP_MM, DrapePleats, ItemSymbol, RugPattern, SeatChair } from "@/components/item-symbol";
import { ItemSurface, edgeFootprint } from "@/components/surface-fill";
import { anySurface } from "@/lib/catalog/textures";
import { CATEGORY_BY_ID, anchorOf } from "@/lib/catalog/categories";
import { seatsAround, seatTransform, CHAIR_D_MM, CHAIR_W_MM } from "@/lib/studio/seating";
import { chairStyleOf, curtainStyleOf, drawStyleOf, symbolCount, symbolOf } from "@/lib/catalog/symbols";
import { pergolaPostOf } from "@/lib/venues/pergola";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { climbRise } from "@/lib/studio/climb-item";
import { vesselOf } from "@/lib/catalog/vessel";
import { VesselMark } from "@/components/vessel-mark";
import { resolve } from "@/lib/studio/catalog-resolver";
import { borderOf } from "@/lib/catalog/border";
import { isLedStrip } from "@/lib/venues/led";
import { isCeilingClothCategory } from "@/lib/studio/ceiling-cloth";
import { CeilingDrapeSymbol, SailSymbol } from "@/components/ceiling-cloth";
import { Dim, type DimTone } from "@/components/venue-dims";
import { useMounted } from "@/lib/use-mounted";

export function AppearancePreview({ product, className }: { product: Product; className?: string }) {
  // Drawn once the page is the browser's (lib/use-mounted.ts) — on the server and in the hydrating
  // render the frame alone. Every picture here is trigonometry (bottles round a bar, candles round a
  // stem, pleats, a ring of chairs), and Node's Math and the browser's can differ in the last digit —
  // depending even on which tier of the JIT ran it — so a server-drawn preview did not hydrate: a
  // warning on every load of a page with the catalog rail on it. Opened later (the drawer, the shape
  // editor), it is drawn at once: the hook answers "mounted" outside hydration.
  const mounted = useMounted();
  if (!mounted) return <svg className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית" />;
  return <PreviewDrawn product={product} className={className} />;
}

function PreviewDrawn({ product, className }: { product: Product; className?: string }) {
  const cat = CATEGORY_BY_ID[product.category];
  // The colour the plan draws it in when nothing else says: its first shade.
  const swatch = product.variants.find((v) => !v.archived && v.swatch)?.swatch;

  // An LED strip rides a rail as a drape does, but is LIGHT: a length of its glowing line, in its shade.
  if (isLedStrip(product)) {
    return (
      <svg viewBox="-1400 -700 2800 1400" className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית">
        <ItemSymbol kind="led" footprint={{ kind: "rect", widthMm: 2600, depthMm: 500 }} count={1} tone={swatch ?? product.appearance?.style?.fill} />
      </svg>
    );
  }

  // Nor has a sail or a ceiling drape: each is drawn to the points it is tied to (lib/studio/
  // ceiling-cloth.ts), so it previews as one of itself — a sail on four ties, a scalloped swag.
  if (isCeilingClothCategory(product.category)) {
    const colour = swatch ?? product.appearance?.style?.fill ?? (product.category === "sails" ? "#F4F1EA" : "#F3EDE2");
    return (
      <svg viewBox="-2300 -1500 4600 3000" className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית">
        {product.category === "sails" ? <SailSymbol w={4000} h={2600} tone={colour} ink="currentColor" /> : <CeilingDrapeSymbol L={4200} D={1400} tone={colour} ink="currentColor" />}
      </svg>
    );
  }

  // A drape has no width of its own — it is cut to whatever wall it hangs on — so it previews as a
  // length of itself: the band, its pleats, in its shade.
  if (cat?.anchor === "wall") {
    const colour = swatch ?? product.appearance?.style?.fill ?? "#E9E4F2";
    return (
      <svg viewBox="-1400 -700 2800 1400" className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית">
        <rect x={-1200} y={-160} width={2400} height={320} fill={colour} stroke="currentColor" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <DrapePleats lengthMm={2400} depthMm={320} ink={isDark(colour) ? "#ffffff" : "var(--color-ink)"} opacity={isDark(colour) ? 0.5 : 0.35} style={curtainStyleOf(product)} />
      </svg>
    );
  }

  const { art, w, h, reach } = planArt(product);
  const pad = Math.max(w, h) * 0.12 + 80 + reach;
  const vb = `${-(w / 2 + pad)} ${-(h / 2 + pad)} ${w + pad * 2} ${h + pad * 2}`;
  return (
    <svg viewBox={vb} className={"text-ink-soft " + (className ?? "")} role="img" aria-label="תצוגה מקדימה של המראה על התוכנית">
      {art}
    </svg>
  );
}

/** The categories whose picture is not drawn from a footprint at all — an LED strip, a sail or a
 *  ceiling drape, a curtain: each previews as a length of itself in a frame of its own. */
const ownFrame = (product: Product) =>
  isLedStrip(product) || isCeilingClothCategory(product.category) || CATEGORY_BY_ID[product.category]?.anchor === "wall";

/** What the plan draws of an item drawn from its footprint, in plan mm about (0,0): the shape or the
 *  category's picture, a table's chairs, a cloth's fall — and how far beyond the footprint's box that
 *  reaches (`reach`), so a frame round it can leave room. The card's preview and the drawer's figured
 *  preview (PlanPreview) both frame this one drawing. */
function planArt(product: Product): { art: ReactNode; w: number; h: number; reach: number; round: boolean } {
  const f = resolveFootprint(product);
  const content = resolveContent(product);
  const swatch = product.variants.find((v) => !v.archived && v.swatch)?.swatch;
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
  // The vase its row is made in (lib/catalog/vessel.ts), drawn with it, as the plan will.
  const vessel = symbol === "flowers" || symbol === "centerpiece" ? vesselOf({ variantId: product.id }, (id) => (id === product.id ? product : resolve(id)?.product)) : undefined;
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

  const art = (
    <>
      {ring.map((seat, i) => (
        <g key={i} transform={seatTransform(seat)}>
          <SeatChair widthMm={CHAIR_W_MM} depthMm={CHAIR_D_MM} />
        </g>
      ))}
      {symbol ? (
        <>
        {vessel && <VesselMark variantId={vessel} pass="under" holder={f} />}
        <ItemSymbol
          kind={symbol}
          footprint={f}
          count={symbolCount(product, symbol)}
          flowers={symbol === "flowers" || symbol === "centerpiece" ? flowerDrawSpecOf(product, f, swatch ?? product.appearance?.style?.fill) : undefined}
          tone={swatch ?? product.appearance?.style?.fill}
          overhead={product.layer === "ceiling"}
          chairStyle={chairStyleOf(product)}
          drawStyle={drawStyleOf(product)}
          chandelier={chandelierDrawOf(product.appearance, product.variants)} chuppah={chuppahDrawOf(product.appearance)}
          postMm={pergolaPostOf(product)}
          rise={climbRise(product)}
          border={symbol === "runner" ? borderOf(undefined, product) : undefined}
          label={symbol === "screen" ? product.name : undefined}
        />
        {vessel && <VesselMark variantId={vessel} pass="over" holder={f} />}
        </>
      ) : (
        <>
          {cloth && <ClothDrape footprint={f} colour={resolved.fill} border={borderOf(undefined, product)} />}
          {shape}
          {surfaced && (
            <>
              <ItemSurface appearance={product.appearance} footprint={f} color={product.appearance?.style?.fill ?? swatch} seed={product.id} />
              {(() => {
                const edged = edgeFootprint(product.appearance, f);
                return edged && <FootprintShape footprint={edged} fill="none" stroke={resolved.stroke} strokeWidth={resolved.strokeWidth} vectorEffect="non-scaling-stroke" />;
              })()}
            </>
          )}
          {product.category === "rugs" && f.kind === "rect" && <RugPattern w={f.widthMm} h={f.depthMm} border={borderOf(undefined, product)} />}
          {/* A cloth is the table's surface on the plan, never labelled there — so not here either. */}
          {!cloth && <PlanContent content={content} w={w} h={h} at={labelAnchor(f)} />}
        </>
      )}
    </>
  );
  return { art, w, h, reach, round: f.kind === "circle" };
}

/** The product drawer's preview (2026-11-09, the user's redesign: "the plan preview leads the form at
 *  full width, with the measurements typed right under it"): the item drawn to scale on a faint grid,
 *  its width and depth figured outside it — a diameter for a round one — so the numbers typed under
 *  it are seen landing. Framed for a 374×200 box (the drawer's card), which it fills edge to edge.
 *
 *  `ghost`: nothing measured yet — the shape the category seeds is drawn dashed with "?" figures, in
 *  `tone` (alert once a save has been refused for it). */
const PREVIEW_W = 374;
const PREVIEW_H = 200;
const GRID_STEPS = [100, 200, 500, 1000, 2000, 5000];

export function PlanPreview({ product, ghost, tone = "ink", className }: { product: Product; ghost?: "round" | "box"; tone?: DimTone; className?: string }) {
  const gridId = useId();
  if (ownFrame(product)) return <AppearancePreview product={product} className={className} />;
  const drawn = ghost ? null : planArt(product);
  const w = drawn?.w ?? (ghost === "round" ? 1200 : 1600);
  const h = drawn?.h ?? (ghost === "round" ? 1200 : 1000);
  const reach = drawn?.reach ?? 0;
  const round = drawn ? drawn.round : ghost === "round";
  // The drawing sits in the part of the box nothing else uses: under the width figure (top ~40px),
  // left of the depth figure (end ~34px), and above the "עריכת המראה" pill along the bottom (~48px).
  const mpp = Math.max((w + 2 * reach) / (PREVIEW_W - 84), (h + 2 * reach) / (PREVIEW_H - 92), 0.5);
  const mm = (px: number) => px * mpp;
  const vw = PREVIEW_W * mpp;
  const vh = PREVIEW_H * mpp;
  const cx = mm(10);
  const cy = mm(6);
  const grid = GRID_STEPS.find((g) => g / mpp >= 14) ?? 10000;
  const gap = mm(14);
  const top = -h / 2 - reach - gap;
  const side = w / 2 + reach + gap;
  const cm = (v: number) => Math.round(v / 10);
  return (
    <svg
      viewBox={`${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`}
      className={"text-ink-soft " + (className ?? "")}
      role="img"
      aria-label="תצוגה מקדימה של המראה על התוכנית"
    >
      <defs>
        <pattern id={gridId} patternUnits="userSpaceOnUse" width={grid} height={grid}>
          <path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="var(--color-border-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      {/* Three frames wide, so a box a little wider than 374px still shows the grid edge to edge. */}
      <rect x={cx - vw * 1.5} y={cy - vh * 1.5} width={vw * 3} height={vh * 3} fill={`url(#${gridId})`} />
      {drawn ? (
        drawn.art
      ) : (
        <>
          <path
            d={round ? `M ${-w / 2} 0 A ${w / 2} ${h / 2} 0 1 0 ${w / 2} 0 A ${w / 2} ${h / 2} 0 1 0 ${-w / 2} 0 Z` : `M ${-w / 2} ${-h / 2} H ${w / 2} V ${h / 2} H ${-w / 2} Z`}
            fill="var(--color-inset)"
            stroke="var(--color-faint)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
          <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="var(--color-muted)" style={{ fontSize: mm(11) }}>
            הקלידו מידות, או ערכו בעורך
          </text>
        </>
      )}
      <Dim a={{ x: -w / 2, y: top }} b={{ x: w / 2, y: top }} text={`${round ? `⁦⌀${drawn ? cm(w) : "?"}⁩` : drawn ? cm(w) : "?"} ס״מ`} mm={mm} tone={tone} rtl />
      {!round && <Dim a={{ x: side, y: -h / 2 }} b={{ x: side, y: h / 2 }} text={`${drawn ? cm(h) : "?"} ס״מ`} mm={mm} tone={tone} rtl />}
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
