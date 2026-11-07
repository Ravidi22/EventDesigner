// A pool's שפה, or a surface's edging, as the plan draws it (StructureFeature.rim, lib/venues/rim.ts):
// the band laid in its own material at real scale, and inside it the water — or the surface's own
// material — in what is left. The band is one keyhole (buildHollow's), so a tint or a see-through
// water never shows the band's stone under it. Every surface that draws the property draws it this
// way: the hall editor and the sketch (components/venue-plan.tsx FeatureNode) and the colour print
// (outputs/placement-map.tsx); the B&W booklet flattens it to its greys there.
//
// Centred on the feature's origin, unturned — inside the same group FootprintShape draws in. The
// caller strokes the edges: the water's in the pool's own line, the outline as a hairline.
import { SurfaceFill } from "@/components/surface-fill";
import { surfaceMaterial, type StructureFeature } from "@/lib/venues/structure";
import { rimOf } from "@/lib/venues/rim";

export function RimFill({ f, seed }: { f: StructureFeature; seed: string }) {
  const r = rimOf(f);
  if (!r) return null;
  // The footprints come off rimOf's per-feature cache, so SurfaceFill's memo holds across renders.
  return (
    <>
      <SurfaceFill material={r.rim.material} footprint={r.band} w={f.widthMm} d={f.depthMm} id={`${seed}:rim`} color={r.rim.style?.fill} opacity={r.rim.style?.fillOpacity} />
      {r.inside && (
        <SurfaceFill
          material={f.kind === "pool" ? "water" : surfaceMaterial(f)}
          footprint={r.inside}
          w={f.widthMm}
          d={f.depthMm}
          id={seed}
          color={f.style?.fill}
          opacity={f.style?.fillOpacity}
        />
      )}
    </>
  );
}
