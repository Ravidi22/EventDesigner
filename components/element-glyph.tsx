import { OutlinePath, FootprintShape } from "@/components/footprint-shape";
import { flat, type ElementGeometry } from "@/lib/element/geometry";

// THE ONE PLAN DRAWING of an element's geometry (lib/element, docs/superpowers/specs/
// 2026-11-07-element-model-design.md §3): what every SVG surface — the sketch, the drag image, the
// catalog preview, the printed map — draws a geometry as. Stage 1: an element whose parts all stand
// on the floor at its height is drawn as its footprint exactly as FootprintShape always drew it (a
// circle stays a <circle>); an element with raised parts is drawn bottom-up, a shelf over the
// counter it stands above, each part one path. Centred on (0,0) in the element's frame — the caller's
// <g> carries position, rotation and scale, as for FootprintShape.
//
// No "use client": a pure function of its props.

type ShapeProps = Omit<React.SVGProps<SVGPathElement>, "d" | "ref">;

export function ElementGlyph({ geometry, overhead, ...props }: { geometry: ElementGeometry; overhead?: boolean } & ShapeProps) {
  if (flat(geometry)) return <FootprintShape footprint={geometry.footprint} overhead={overhead} {...props} />;
  const od = overhead ? { fill: "none", strokeDasharray: "120 90", vectorEffect: "non-scaling-stroke" as const } : undefined;
  const shape = { ...props, ...od };
  const layers = [...geometry.parts].sort((a, b) => a.zMm - b.zMm);
  return (
    <g>
      {layers.map((p) => p.pieces.map((o, i) => <OutlinePath key={`${p.index}-${i}`} outline={o.outline} edgeCurves={o.edgeCurves} open={o.open} {...shape} />))}
    </g>
  );
}
