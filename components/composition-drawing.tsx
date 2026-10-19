"use client";

import type { Composition } from "@/lib/catalog/types";
import type { DesignDocumentContent, Placement, Point } from "@/lib/design-document/types";
import type { Footprint } from "@/lib/studio/footprint";
import { footprintBounds } from "@/lib/studio/footprint";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { chairBlockOf, resolve } from "@/lib/studio/catalog-resolver";
import { chairStyleOf, drawStyleOf, symbolCount, symbolOf } from "@/lib/catalog/symbols";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { climbRise } from "@/lib/studio/climb-item";
import { resolveStyle } from "@/lib/element-style";
import { MIRROR_TRANSFORM } from "@/lib/design-document/mirror";
import { blockSeats } from "@/lib/design-document/block";
import { groupSeats } from "@/lib/design-document/groups";
import { CHAIR_D_MM, CHAIR_W_MM, seatsAround, type Seat } from "@/lib/studio/seating";
import { FootprintShape, dressBlockOf, dressingSpots, placementFootprint, productStyle, tableBlock, tableBlockedSides, tableFootprint } from "./footprint-shape";
import { ClothDrape, ItemSymbol, SeatChair } from "./item-symbol";
import { ChairBlock } from "./chair-block";
import { vesselOf } from "@/lib/catalog/vessel";
import { VesselMark } from "./vessel-mark";

// A composite catalog item (Product.composition, lib/catalog/composition.ts) drawn the way the plan
// will draw it once placed: its tables in their cloths with their chairs round them (a block's round
// the block), what stands on them where it stands, what hangs over them dashed, and the rest on the
// floor about them. The catalog card, the rail's row and the picture a drag off the rail carries are
// all this one drawing, so what is picked up is what lands.
//
// A still picture: no pointer, no selection, no zoom-sized type. Nothing here is written — a set is
// recognised by its shape and its colours, and its name is on the card beside it.

/** How far the drawing reaches past the pieces' own box: the chairs, and a little air. */
const CHAIR_REACH_MM = CHAIR_D_MM + 160;

export function CompositionDrawing({ composition, className }: { composition: Composition; className?: string }) {
  const box = compositionBox(composition);
  const reach = CHAIR_REACH_MM + Math.max(box.maxX - box.minX, box.maxY - box.minY) * 0.04;
  const vb = `${box.minX - reach} ${box.minY - reach} ${box.maxX - box.minX + reach * 2} ${box.maxY - box.minY + reach * 2}`;
  return (
    <svg viewBox={vb} className={className} role="img" aria-label="תצוגה של הפריט המורכב" style={{ overflow: "visible" }}>
      <CompositionPieces composition={composition} />
    </svg>
  );
}

/** The pieces themselves, in the item's own frame (its origin is where a drop lands it) — for a
 *  drawing that is already inside an SVG: the canvas's armed ghost, the drag image. */
export function CompositionPieces({
  composition,
  outline = false,
}: {
  composition: Composition;
  /** A dashed accent box round the lot — "being carried". */
  outline?: boolean;
}) {
  const doc: DesignDocumentContent = { calibration: { mmPerUnit: 1 }, tables: composition.tables, placements: composition.placements, groups: composition.groups };
  const box = compositionBox(composition);

  // Chairs: a block's round the block, a lone table's round itself (the canvas's two passes).
  const rings: { key: string; transform: string; seats: Seat[] }[] = [];
  for (const g of composition.groups) {
    const members = composition.tables.filter((t) => t.groupId === g.id);
    const blk = tableBlock(members);
    const seats = groupSeats(doc, g.id);
    if (blk && seats > 0) rings.push({ key: `g-${g.id}`, transform: `translate(${blk.centre.x} ${blk.centre.y})${blk.rotation ? ` rotate(${blk.rotation})` : ""}`, seats: blockSeats(blk, seats) });
  }
  const blocked = new Set(rings.map((r) => r.key));
  for (const t of composition.tables) {
    if (t.groupId && blocked.has(`g-${t.groupId}`)) continue;
    if (!t.seats) continue;
    rings.push({ key: t.id, transform: tableTransform(t.position, t.rotation, t.mirrored), seats: seatsAround(tableFootprint(t), t.seats, undefined, tableBlockedSides(t)) });
  }

  const onTable = (tableId: string) => composition.placements.filter((p) => p.layer === "table" && p.tableId === tableId && resolve(p.variantId)?.anchor !== "table");
  const coverOf = (tableId: string) => composition.placements.find((p) => p.layer === "table" && p.tableId === tableId && resolve(p.variantId)?.anchor === "table");
  const floor = composition.placements.filter((p) => !p.tableId && p.layer !== "ceiling" && resolve(p.variantId)?.anchor !== "wall");
  const overhead = composition.placements.filter((p) => !p.tableId && p.layer === "ceiling");

  return (
    <g>
      {rings.map((r) => (
        <g key={r.key} transform={r.transform}>
          {r.seats.map((seat, i) => (
            <g key={i} transform={`translate(${seat.x} ${seat.y}) rotate(${seat.facingDeg})`}>
              <SeatChair widthMm={CHAIR_W_MM} depthMm={CHAIR_D_MM} />
            </g>
          ))}
        </g>
      ))}
      {floor.map((p) => (
        <Piece key={p.id} placement={p} at={p.position} rotation={p.rotation} />
      ))}
      {composition.tables.map((t) => {
        const cloth = coverOf(t.id);
        const clothColour = cloth ? (resolve(cloth.variantId)?.swatch ?? "var(--color-accent-tint)") : undefined;
        const style = resolveStyle(productStyle(t.variantId ? resolve(t.variantId)?.product : undefined, t.style), "screen", {
          fill: "var(--color-surface)",
          stroke: "var(--color-ink)",
          strokeWidth: 1.5,
        });
        const f = tableFootprint(t);
        return (
          <g key={t.id} transform={tableTransform(t.position, t.rotation, t.mirrored)}>
            {clothColour && <ClothDrape footprint={f} colour={clothColour} />}
            <FootprintShape
              footprint={f}
              fill={clothColour ?? style.fill}
              fillOpacity={clothColour ? 1 : style.fillOpacity}
              stroke={clothColour ? "var(--color-ink)" : style.stroke}
              strokeOpacity={clothColour ? 0.22 : style.strokeOpacity}
              strokeWidth={clothColour ? 1 : style.strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
      {composition.tables.flatMap((t) =>
        dressingSpots(t, onTable(t.id), dressBlockOf(composition.tables, t, onTable)).map((sp) => <Piece key={sp.p.id} placement={sp.p} at={sp.at} rotation={sp.rotation} footprint={sp.footprint} />),
      )}
      {overhead.map((p) => (
        <Piece key={p.id} placement={p} at={p.position} rotation={p.rotation} overhead />
      ))}
      {outline && (
        <rect
          x={box.minX}
          y={box.minY}
          width={box.maxX - box.minX}
          height={box.maxY - box.minY}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

const tableTransform = (at: Point, rotation: number, mirrored?: boolean) =>
  `translate(${at.x} ${at.y})${rotation ? ` rotate(${rotation})` : ""}${mirrored ? ` ${MIRROR_TRANSFORM}` : ""}`;

/** One placed item as the plan draws it at rest: its category's picture when it has one, else its
 *  outline in its shade. */
function Piece({ placement: p, at, rotation, footprint, overhead }: { placement: Placement; at: Point; rotation: number; footprint?: Footprint; overhead?: boolean }) {
  const r = resolve(p.variantId);
  const product = r?.product;
  const f = footprint ?? placementFootprint(p);
  const block = chairBlockOf(p);
  const symbol = block || p.stage ? null : symbolOf(product, f);
  const style = resolveStyle(productStyle(product), "screen", { fill: "var(--color-surface)", stroke: "var(--color-border)", strokeWidth: 1.5 });
  const tone = r?.swatch ?? product?.appearance?.style?.fill;
  const scale = p.scale || 1;
  // The vase an arrangement stands in, drawn with it (lib/catalog/vessel.ts) as the plan will.
  const vessel = symbol === "flowers" || symbol === "centerpiece" ? vesselOf(p, (id) => resolve(id)?.product) : undefined;
  return (
    <g transform={`translate(${at.x} ${at.y})${rotation ? ` rotate(${rotation})` : ""}${p.mirrored ? ` ${MIRROR_TRANSFORM}` : ""}${scale !== 1 ? ` scale(${scale})` : ""}`}>
      {vessel && <VesselMark variantId={vessel} pass="under" holder={f} />}
      {block ? (
        <ChairBlock product={block.product} spec={block.spec} tone={tone} />
      ) : symbol && product ? (
        <ItemSymbol
          kind={symbol}
          footprint={f}
          count={symbolCount(product, symbol)}
          flowers={symbol === "flowers" || symbol === "centerpiece" ? flowerDrawSpecOf(product, f, tone) : undefined}
          tone={tone}
          overhead={overhead}
          chairStyle={chairStyleOf(product)}
          drawStyle={drawStyleOf(product)}
          rise={symbol === "stairs" || symbol === "ramp" ? climbRise(product, p.climb) : undefined}
          detail={false}
        />
      ) : (
        <FootprintShape
          footprint={f}
          overhead={overhead}
          fill={tone ?? style.fill}
          fillOpacity={tone ? 1 : style.fillOpacity}
          stroke={style.stroke}
          strokeOpacity={style.strokeOpacity}
          strokeWidth={style.strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {vessel && <VesselMark variantId={vessel} pass="over" holder={f} />}
    </g>
  );
}

/** The box the pieces stand in — tables by their turned footprints, free items by theirs — without
 *  the chairs, which is how the plan measures a table and what a drop is centred on. */
export function compositionBox(c: Composition): { minX: number; minY: number; maxX: number; maxY: number } {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const take = (at: Point, f: Footprint, rotation: number) => {
    const b = footprintBounds(f);
    const t = (rotation * Math.PI) / 180;
    const w = Math.abs(b.w * Math.cos(t)) + Math.abs(b.h * Math.sin(t));
    const h = Math.abs(b.w * Math.sin(t)) + Math.abs(b.h * Math.cos(t));
    box.minX = Math.min(box.minX, at.x - w / 2);
    box.maxX = Math.max(box.maxX, at.x + w / 2);
    box.minY = Math.min(box.minY, at.y - h / 2);
    box.maxY = Math.max(box.maxY, at.y + h / 2);
  };
  for (const t of c.tables) take(t.position, tableFootprint(t), t.rotation || 0);
  for (const p of c.placements) {
    if (p.tableId || resolve(p.variantId)?.anchor === "wall") continue;
    if (CATEGORY_BY_ID[resolve(p.variantId)?.category ?? ""]?.anchor === "wall") continue;
    take(p.position, placementFootprint(p), p.rotation || 0);
  }
  if (!Number.isFinite(box.minX)) return { minX: -500, minY: -500, maxX: 500, maxY: 500 };
  return box;
}
