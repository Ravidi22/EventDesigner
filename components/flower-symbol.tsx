import type { ReactNode } from "react";
import { composeFlowers, darken, isPale, lighten, luminance, type FlowerDrawSpec, type FlowerItem } from "@/lib/catalog/flower-draw";
import type { FlowerKindId } from "@/lib/catalog/flower-kinds";

// The flowers themselves, seen from above — one glyph per kind (lib/catalog/flower-kinds.ts), laid
// where lib/catalog/flower-draw.ts put them. Drawn in the arrangement's own frame, centred on
// (0,0), in millimetres, like every other picture in components/item-symbol.tsx, which is what
// hands this its items.
//
// TWO LEVELS OF DETAIL, by CSS, not by props. Every glyph is a base shape (a disc in the flower's
// colour, the sprig's leaves) plus its detail (the spiral of a rose, the florets of a hydrangea,
// the veins of a lily), and the detail carries `fl-d`. The plan's <svg> says how far out it is
// (`data-lod` on PlanCanvas) and globals.css hides every `fl-d` under a far view — so zooming never
// re-renders a node, and a hall of sixty arrangements at hall zoom paints sixty soft discs of
// colour. A filler's florets are too small to carry a base, so it has a far-only disc (`fl-f`)
// shown in their place. The printed sheet has no `data-lod` and prints the detail; the map hands
// `detail={false}` to a sheet too small to print it (a 1:100 hall), which leaves the detail out
// of the DOM altogether.
//
// No hooks and no handlers, so it renders on the server too (the printed map).

const TAU = Math.PI * 2;
const f1 = (n: number) => Math.round(n * 10) / 10;

interface Look {
  /** The sheet's ink in print; a soft ink on screen. */
  ink: string;
  print: boolean;
  /** Whether the detail (`fl-d`) is rendered at all. */
  detail: boolean;
}

const polar = (r: number, a: number) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });

// ── path helpers ────────────────────────────────────────────────────────────────────────────────

const circ = (x: number, y: number, r: number) => `M${f1(x - r)} ${f1(y)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0Z`;
const ell = (cx: number, cy: number, rx: number, ry: number, a: number) => {
  const dx = rx * Math.cos(a);
  const dy = rx * Math.sin(a);
  const deg = f1((a * 180) / Math.PI);
  return `M${f1(cx - dx)} ${f1(cy - dy)}a${f1(rx)} ${f1(ry)} ${deg} 1 0 ${f1(2 * dx)} ${f1(2 * dy)}a${f1(rx)} ${f1(ry)} ${deg} 1 0 ${f1(-2 * dx)} ${f1(-2 * dy)}Z`;
};
const polyD = (pts: { x: number; y: number }[]) => "M" + pts.map((p) => `${f1(p.x)} ${f1(p.y)}`).join("L") + "Z";
const lineD = (pts: { x: number; y: number }[]) => "M" + pts.map((p) => `${f1(p.x)} ${f1(p.y)}`).join("L");
/** A disc whose rim rises and falls `n` times by `amp` of its radius: a ruffled petal edge. */
const lobed = (r: number, n: number, amp: number, rot: number) => {
  const N = n * 10;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = rot + (i / N) * TAU;
    const rr = r * (1 - amp + amp * Math.abs(Math.sin((a * n) / 2)));
    pts.push(polar(rr, a));
  }
  return polyD(pts);
};
/** One pointed petal from radius r0 out to r1 along `a`, `w` wide at its middle. */
const petal = (a: number, r0: number, r1: number, w: number) => {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const nx = -sa;
  const ny = ca;
  const m = (r0 + r1) / 2;
  return `M${f1(r0 * ca)} ${f1(r0 * sa)}Q${f1(m * ca + nx * w)} ${f1(m * sa + ny * w)} ${f1(r1 * ca)} ${f1(r1 * sa)}Q${f1(m * ca - nx * w)} ${f1(m * sa - ny * w)} ${f1(r0 * ca)} ${f1(r0 * sa)}Z`;
};
type P = [number, number];
const quad = (p0: P, c: P, p1: P, t: number): P => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
};
const quadTan = (p0: P, c: P, p1: P, t: number): P => {
  const u = 1 - t;
  return [2 * u * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), 2 * u * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])];
};

// ── strokes and fills ───────────────────────────────────────────────────────────────────────────

const fillOf = (L: Look, c: string) => (L.print ? "#ffffff" : c);
/** The outline of a shape: the ink, soft on screen. */
const edge = (L: Look, op = 0.45) => ({ stroke: L.ink, strokeOpacity: L.print ? 1 : op, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const });
/** A line INSIDE a flower — a shade of its own colour: darker on a light flower, lighter on a dark one. */
const vein = (L: Look, c: string, op = 0.7) => ({
  stroke: L.print ? L.ink : luminance(c) < 0.4 ? lighten(c, 0.45) : darken(c, 0.4),
  strokeOpacity: L.print ? 0.9 : op,
  strokeWidth: 1,
  vectorEffect: "non-scaling-stroke" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});
/** The hairline between florets of one cluster. */
const soft = (L: Look, c: string) => (L.print ? edge(L) : { stroke: darken(c, 0.2), strokeOpacity: 0.38, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const });

const D = "fl-d";
const F = "fl-f";

// ── one head, seen from above, radius r, in its colour ──────────────────────────────────────────

type Glyph = (r: number, c: string, L: Look, rot: number) => ReactNode;

const spiral = (r: number, rot: number, turns = 2.5) => {
  const pts = [];
  for (let i = 0; i <= 44; i++) {
    const t = i / 44;
    pts.push(polar(r * (0.86 - 0.78 * t), rot + t * turns * TAU));
  }
  return lineD(pts);
};

const rose: Glyph = (r, c, L, rot) => (
  <>
    <path d={lobed(r, 5, 0.06, rot)} fill={fillOf(L, c)} {...edge(L, 0.4)} />
    {L.detail && (
      <g className={D}>
        <path d={lobed(r * 0.64, 4, 0.08, rot + 0.5)} fill={fillOf(L, lighten(c, 0.12))} {...vein(L, c, 0.35)} />
        <path d={spiral(r * 0.62, rot + 0.5)} fill="none" {...vein(L, c)} />
      </g>
    )}
  </>
);

const spray: Glyph = (r, c, L, rot) => (
  <>
    {[0, 1, 2].map((k) => {
      const p = polar(r * 0.47, rot + (k * TAU) / 3);
      return (
        <g key={k} transform={`translate(${f1(p.x)} ${f1(p.y)})`}>
          {rose(r * 0.52, c, L, rot + k * 2)}
        </g>
      );
    })}
  </>
);

const peony: Glyph = (r, c, L, rot) => (
  <>
    <path d={lobed(r, 9, 0.13, rot)} fill={fillOf(L, c)} {...edge(L, 0.4)} />
    {L.detail && (
      <g className={D}>
        <path d={lobed(r * 0.68, 7, 0.18, rot + 0.4)} fill={fillOf(L, lighten(c, 0.2))} {...vein(L, c, 0.5)} />
        <path d={lobed(r * 0.38, 5, 0.24, rot + 0.9)} fill={fillOf(L, lighten(c, 0.38))} {...vein(L, c, 0.5)} />
      </g>
    )}
  </>
);

const hydrangea: Glyph = (r, c, L, rot) => {
  let d = "";
  if (L.detail) {
    const n = 24;
    const q = r * 0.082;
    for (let i = 0; i < n; i++) {
      const rr = r * 0.84 * Math.sqrt((i + 0.5) / n);
      const a = rot + i * 2.39996;
      const x = rr * Math.cos(a);
      const y = rr * Math.sin(a);
      if (L.print) {
        d += circ(x, y, q * 1.7);
        continue;
      }
      for (let k = 0; k < 4; k++) {
        const b = a + (k * Math.PI) / 2;
        d += circ(x + q * 0.95 * Math.cos(b), y + q * 0.95 * Math.sin(b), q);
      }
    }
  }
  return (
    <>
      <circle r={f1(r)} fill={fillOf(L, lighten(c, 0.35))} {...edge(L, 0.35)} />
      {L.detail && <path className={D} d={d} fill={fillOf(L, c)} {...soft(L, c)} />}
    </>
  );
};

const lisianthus: Glyph = (r, c, L, rot) => {
  let d = "";
  for (let k = 0; k < 5; k++) {
    const p = polar(r * 0.42, rot + (k * TAU) / 5);
    d += circ(p.x, p.y, r * 0.58);
  }
  return (
    <>
      <path d={d} fill={fillOf(L, c)} {...edge(L, 0.28)} />
      {L.detail && (
        <g className={D}>
          <circle r={f1(r * 0.34)} fill={fillOf(L, lighten(c, 0.3))} {...vein(L, c, 0.45)} />
          <circle r={f1(r * 0.11)} fill={L.print ? "#ffffff" : "#B7C47C"} {...edge(L, 0.35)} />
        </g>
      )}
    </>
  );
};

const ranunculus: Glyph = (r, c, L) => (
  <>
    <circle r={f1(r)} fill={fillOf(L, c)} {...edge(L, 0.4)} />
    {L.detail && (
      <g className={D}>
        {[0.76, 0.54, 0.32].map((k, i) => (
          <circle key={k} r={f1(r * k)} fill={fillOf(L, i % 2 ? c : lighten(c, 0.16))} {...vein(L, c, 0.45)} />
        ))}
        <circle r={f1(r * 0.12)} fill={L.print ? "#ffffff" : "#9DB07A"} {...edge(L, 0.35)} />
      </g>
    )}
  </>
);

const carnation: Glyph = (r, c, L, rot) => (
  <>
    <path d={lobed(r, 16, 0.09, rot)} fill={fillOf(L, c)} {...edge(L, 0.4)} />
    {L.detail && (
      <g className={D}>
        <path d={lobed(r * 0.7, 12, 0.12, rot + 0.3)} fill={fillOf(L, lighten(c, 0.1))} {...vein(L, c, 0.45)} />
        <path d={lobed(r * 0.42, 8, 0.16, rot + 0.7)} fill={fillOf(L, lighten(c, 0.22))} {...vein(L, c, 0.45)} />
      </g>
    )}
  </>
);

const anemone: Glyph = (r, c, L, rot) => {
  const pts = [];
  for (let i = 0; i < 72; i++) {
    const a = rot + (i / 72) * TAU;
    pts.push(polar(r * (0.78 + 0.22 * Math.abs(Math.cos(a * 3))), a));
  }
  const eye = L.print ? L.ink : "#2A2433";
  let dots = "";
  for (let k = 0; k < 14; k++) {
    const p = polar(r * 0.4, rot + (k * TAU) / 14);
    dots += circ(p.x, p.y, r * 0.04);
  }
  return (
    <>
      <path d={polyD(pts)} fill={fillOf(L, c)} {...edge(L, 0.4)} />
      <circle r={f1(r * 0.3)} fill={eye} />
      {L.detail && <path className={D} d={dots} fill={eye} />}
    </>
  );
};

function daisyLike(r: number, c: string, L: Look, rot: number, petals: number, heart: number): ReactNode {
  let d = "";
  for (let k = 0; k < petals; k++) {
    const a = rot + (k * TAU) / petals;
    const p = polar(r * (1 - heart) * 0.5 + r * heart * 0.8, a);
    d += ell(p.x, p.y, r * (1 - heart) * 0.55, (r * TAU) / petals / 2.6, a);
  }
  const heartFill = L.print ? "#ffffff" : darken(c, 0.55);
  return (
    <>
      {L.detail ? (
        <path className={D} d={d} fill={fillOf(L, c)} {...edge(L, 0.35)} />
      ) : null}
      <circle className={L.detail ? F : undefined} r={f1(r)} fill={fillOf(L, c)} {...edge(L, 0.4)} />
      <circle r={f1(r * heart)} fill={heartFill} {...edge(L, 0.4)} />
      {L.detail && <circle className={D} r={f1(r * heart * 0.55)} fill="none" {...vein(L, "#ffffff", 0.4)} />}
    </>
  );
}
const daisy: Glyph = (r, c, L, rot) => daisyLike(r, c, L, rot, 20, 0.32);
const sunflower: Glyph = (r, c, L, rot) => daisyLike(r, c, L, rot, 26, 0.48);

const lily: Glyph = (r, c, L, rot) => {
  let d = "";
  let v = "";
  let st = "";
  let an = "";
  for (let k = 0; k < 6; k++) {
    const a = rot + (k * TAU) / 6;
    const b = a + TAU / 12;
    d += petal(a, r * 0.08, r, r * 0.62);
    const t = polar(r * 0.7, a);
    v += `M0 0L${f1(t.x)} ${f1(t.y)}`;
    const s = polar(r * 0.46, b);
    st += `M0 0L${f1(s.x)} ${f1(s.y)}`;
    const e = polar(r * 0.5, b);
    an += ell(e.x, e.y, r * 0.07, r * 0.03, b);
  }
  return (
    <>
      <path d={d} fill={fillOf(L, c)} {...edge(L, 0.4)} />
      {L.detail && (
        <g className={D}>
          <path d={v} fill="none" {...vein(L, c, 0.35)} />
          <path d={st} fill="none" stroke={L.print ? L.ink : "#7D8A55"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={an} fill={L.print ? L.ink : "#A0522D"} />
        </g>
      )}
    </>
  );
};

const calla: Glyph = (r, c, L, rot) => {
  const cup = (k: number) =>
    `M${f1(r * k)} 0C${f1(r * 0.3 * k)} ${f1(-r * 0.95 * k)} ${f1(-r * 0.95 * k)} ${f1(-r * 0.75 * k)} ${f1(-r * 0.78 * k)} 0C${f1(-r * 0.95 * k)} ${f1(r * 0.75 * k)} ${f1(r * 0.3 * k)} ${f1(r * 0.95 * k)} ${f1(r * k)} 0Z`;
  return (
    <g transform={`rotate(${f1((rot * 180) / Math.PI)})`}>
      <path d={cup(1)} fill={fillOf(L, c)} {...edge(L, 0.4)} />
      {L.detail && (
        <g className={D}>
          <path d={cup(0.58)} transform={`translate(${f1(-r * 0.2)} 0)`} fill={fillOf(L, lighten(c, 0.25))} {...vein(L, c, 0.45)} />
          <path d={ell(-r * 0.22, 0, r * 0.22, r * 0.07, 0)} fill={L.print ? "#ffffff" : "#E8C24E"} {...edge(L, 0.35)} />
        </g>
      )}
    </g>
  );
};

const tulip: Glyph = (r, c, L, rot) => (
  <>
    <path d={lobed(r, 3, 0.1, rot)} fill={fillOf(L, c)} {...edge(L, 0.4)} />
    {L.detail && (
      <g className={D}>
        <path d={lobed(r * 0.58, 3, 0.14, rot + Math.PI / 3)} fill={fillOf(L, lighten(c, 0.18))} {...vein(L, c, 0.45)} />
        <circle r={f1(r * 0.1)} fill={L.print ? "#ffffff" : "#3B3326"} />
      </g>
    )}
  </>
);

/** Phlox and the rest of the small stuff: a cluster of five-petal florets. */
const florets = (r: number, c: string, L: Look, rot: number, petals: number) => {
  const q = r * 0.34;
  const centres = [polar(0, 0)];
  for (let k = 0; k < 6; k++) centres.push(polar(r * 0.62, rot + (k * TAU) / 6));
  let d = "";
  let eyes = "";
  for (const { x, y } of centres) {
    if (L.print) d += circ(x, y, q * 0.95);
    else for (let k = 0; k < petals; k++) {
      const p = polar(q * 0.5, rot + (k * TAU) / petals);
      d += circ(x + p.x, y + p.y, q * 0.5);
    }
    eyes += circ(x, y, q * 0.14);
  }
  return (
    <>
      <circle className={F} r={f1(r * 0.82)} fill={fillOf(L, c)} {...edge(L, 0.3)} />
      <g className={D}>
        <path d={d} fill={fillOf(L, c)} {...soft(L, c)} />
        <path d={eyes} fill={L.print ? L.ink : darken(c, 0.35)} />
      </g>
    </>
  );
};
const phlox: Glyph = (r, c, L, rot) => (L.detail ? florets(r, c, L, rot, 5) : <circle r={f1(r * 0.82)} fill={fillOf(L, c)} {...edge(L, 0.3)} />);
const filler: Glyph = (r, c, L, rot) => (L.detail ? florets(r * 0.9, c, L, rot, 4) : <circle r={f1(r * 0.75)} fill={fillOf(L, c)} {...edge(L, 0.3)} />);

const delphinium: Glyph = (r, c, L, rot) => {
  if (!L.detail) return <circle r={f1(r * 0.8)} fill={fillOf(L, c)} {...edge(L, 0.3)} />;
  const q = r * 0.36;
  const star = (x: number, y: number, a0: number) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = a0 + (i * Math.PI) / 5;
      const p = polar(i % 2 ? q * 0.5 : q, a);
      pts.push({ x: x + p.x, y: y + p.y });
    }
    return polyD(pts);
  };
  let d = "";
  let eyes = "";
  for (let k = 0; k < 6; k++) {
    const a = rot + (k * TAU) / 6;
    const p = polar(r * 0.6, a);
    d += star(p.x, p.y, a);
    eyes += circ(p.x, p.y, q * 0.18);
  }
  return (
    <>
      <circle className={F} r={f1(r * 0.8)} fill={fillOf(L, c)} {...edge(L, 0.3)} />
      <g className={D}>
        <path d={d} fill={fillOf(L, c)} strokeLinejoin="round" {...soft(L, c)} />
        <path d={ell(0, 0, r * 0.22, r * 0.16, rot)} fill={fillOf(L, lighten(c, 0.35))} {...edge(L, 0.35)} />
        <path d={eyes} fill={L.print ? L.ink : "#ffffff"} fillOpacity={L.print ? 1 : 0.85} />
      </g>
    </>
  );
};

/** A spike seen end-on: a run of small florets along a short stem. */
const lavender: Glyph = (r, c, L, rot) => {
  if (!L.detail) return <path d={ell(0, 0, r * 0.8, r * 0.4, rot)} fill={fillOf(L, c)} {...edge(L, 0.3)} />;
  let d = "";
  for (let i = 0; i < 9; i++) {
    const t = -0.7 + (1.4 * i) / 8;
    const p = polar(r * t, rot);
    const n = polar(r * 0.16 * (i % 2 ? 1 : -1), rot + Math.PI / 2);
    d += circ(p.x + n.x, p.y + n.y, r * 0.14);
  }
  const a = polar(r * 0.8, rot);
  return (
    <>
      <path className={F} d={ell(0, 0, r * 0.8, r * 0.4, rot)} fill={fillOf(L, c)} {...edge(L, 0.3)} />
      <g className={D}>
        <path d={`M${f1(-a.x)} ${f1(-a.y)}L${f1(a.x)} ${f1(a.y)}`} fill="none" stroke={L.print ? L.ink : "#7E8F5E"} strokeOpacity={0.7} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={d} fill={fillOf(L, c)} {...soft(L, c)} />
      </g>
    </>
  );
};

const gyps: Glyph = (r, c, L) => {
  const n = L.detail ? 15 : 5;
  let d = "";
  let tw = "";
  for (let i = 0; i < n; i++) {
    const rr = r * 0.82 * Math.sqrt((i + 0.5) / n);
    const a = i * 2.39996;
    const x = rr * Math.cos(a);
    const y = rr * Math.sin(a);
    d += circ(x, y, r * 0.11);
    if (i % 3 === 0) tw += `M0 0L${f1(x)} ${f1(y)}`;
  }
  return (
    <>
      <path d={tw} fill="none" stroke={L.print ? L.ink : "#9BAF95"} strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d={d} fill={fillOf(L, c)} {...edge(L, 0.4)} />
    </>
  );
};

const GLYPH: Record<Exclude<FlowerKindId, "orchid" | "euca" | "ruscus" | "fern" | "monstera" | "green" | "grass" | "dried">, Glyph> = {
  rose,
  spray,
  peony,
  hydrangea,
  lisianthus,
  ranunculus,
  carnation,
  anemone,
  daisy,
  sunflower,
  lily,
  calla,
  tulip,
  phlox,
  delphinium,
  lavender,
  gyps,
  filler,
};

/** A head of any kind — a green's or an orchid's single head, asked of a head glyph, draws as a
 *  rose-sized disc rather than nothing. */
function head(kind: FlowerKindId, r: number, c: string, L: Look, rot: number): ReactNode {
  const g = (GLYPH as Partial<Record<FlowerKindId, Glyph>>)[kind] ?? filler;
  return g(r, c, L, rot);
}

// ── greenery: one sprig, in its own frame, from (0,0) out along +x ──────────────────────────────
//
// Leaves are their REAL size, like the flowers: a longer sprig has more leaves, not bigger ones.

function sprig(kind: FlowerKindId, len: number, bend: number, c: string, L: Look): ReactNode {
  const fill = fillOf(L, c);
  const st = { stroke: L.print ? L.ink : darken(c, 0.35), strokeOpacity: L.print ? 0.55 : 0.65, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
  if (kind === "monstera") {
    const rx = len * 0.46;
    const ry = len * 0.36;
    const cx = len * 0.52;
    let cuts = "";
    for (const side of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const th = side * (0.7 + k * 0.55);
        cuts += `M${f1(cx + rx * Math.cos(th))} ${f1(ry * Math.sin(th))}L${f1(cx + rx * 0.45 * Math.cos(th))} ${f1(ry * 0.45 * Math.sin(th))}`;
      }
    }
    return (
      <>
        <path d={ell(cx, 0, rx, ry, 0)} fill={fill} {...st} />
        {L.detail && <path className={D} d={cuts} fill="none" stroke={L.print ? L.ink : "#ffffff"} strokeWidth={L.print ? 1 : 2} vectorEffect="non-scaling-stroke" />}
        <path d={`M${f1(cx - rx)} 0L${f1(cx + rx * 0.9)} 0`} fill="none" {...st} />
      </>
    );
  }
  if (kind === "grass" || kind === "dried") {
    // A plume: a feathered oval along the stem, its barbs as fine strokes.
    const rx = len * 0.38;
    const ry = Math.min(len * 0.14, 60);
    const cx = len * 0.6;
    let barbs = "";
    for (let i = 0; i < 12; i++) {
      const t = -0.9 + (1.8 * i) / 11;
      const x = cx + rx * t;
      const h = ry * Math.sqrt(Math.max(0, 1 - t * t));
      barbs += `M${f1(x)} ${f1(-h)}L${f1(x + rx * 0.12)} 0L${f1(x)} ${f1(h)}`;
    }
    return (
      <>
        <path d={`M0 0L${f1(cx - rx)} 0`} fill="none" {...st} />
        <path d={ell(cx, 0, rx, ry, 0)} fill={fill} fillOpacity={L.print ? 1 : 0.85} {...st} strokeOpacity={st.strokeOpacity * 0.6} />
        {L.detail && <path className={D} d={barbs} fill="none" {...st} strokeOpacity={st.strokeOpacity * 0.7} />}
      </>
    );
  }
  const p0: P = [0, 0];
  const cc: P = [len * 0.5, bend];
  const p1: P = [len, 0];
  const at = (t: number) => {
    const p = quad(p0, cc, p1, t);
    const g = quadTan(p0, cc, p1, t);
    const l = Math.hypot(g[0], g[1]) || 1;
    return { p, a: Math.atan2(g[1], g[0]), n: [-g[1] / l, g[0] / l] as P };
  };
  let d = "";
  if (kind === "euca") {
    // Silver-dollar eucalyptus: round leaves in pairs, ⌀34mm at the base down to ⌀20 at the tip.
    const n = Math.max(2, Math.floor((len * 0.82) / 27));
    for (let i = 0; i <= n; i++) {
      const t = 0.18 + (0.82 * i) / n;
      const { p, n: nv } = at(Math.min(1, t));
      const lr = 17 - 7 * t;
      if (i === n) {
        d += circ(p[0], p[1], lr);
        break;
      }
      const off = i % 2 ? 0.95 : 0.85;
      d += circ(p[0] + nv[0] * lr * off, p[1] + nv[1] * lr * off, lr) + circ(p[0] - nv[0] * lr * off, p[1] - nv[1] * lr * off, lr);
    }
  } else if (kind === "ruscus" || kind === "green") {
    // Narrow pointed leaves, 5cm long, alternating; the generic green a little wider.
    const wide = kind === "green" ? 11 : 7.5;
    const n = Math.max(3, Math.floor((len * 0.85) / 21));
    for (let i = 0; i < n; i++) {
      const t = 0.15 + (0.85 * i) / Math.max(1, n - 1);
      const { p, a } = at(Math.min(1, t));
      const b = a + (i % 2 ? 1 : -1) * 0.55;
      const rx = 25 - 6 * t;
      d += ell(p[0] + Math.cos(b) * rx * 0.9, p[1] + Math.sin(b) * rx * 0.9, rx, wide, b);
    }
  } else {
    // A fern frond: leaflets on both sides of the rib, shortening to the tip.
    const n = Math.max(6, Math.floor(len / 13));
    for (let i = 0; i < n; i++) {
      const t = 0.06 + (0.92 * i) / n;
      const { p, a } = at(t);
      const pl = Math.min(56, len * 0.16) * (1 - t * 0.75);
      for (const side of [1, -1]) {
        const b = a + side * 1.05;
        d += ell(p[0] + Math.cos(b) * pl * 0.5, p[1] + Math.sin(b) * pl * 0.5, pl * 0.5, pl * 0.17, b);
      }
    }
  }
  return (
    <>
      <path d={`M0 0Q${f1(cc[0])} ${f1(cc[1])} ${f1(len)} 0`} fill="none" {...st} />
      <path d={d} fill={fill} {...st} />
    </>
  );
}

// ── an orchid spray arching out along +x ────────────────────────────────────────────────────────

function orchidFlower(f: number, c: string, L: Look): ReactNode {
  const pale = isPale(c);
  const sepals =
    ell(0, -f * 0.46, f * 0.36, f * 0.17, Math.PI / 2) + ell(-f * 0.24, f * 0.38, f * 0.34, f * 0.15, Math.PI / 2 + 0.55) + ell(f * 0.24, f * 0.38, f * 0.34, f * 0.15, Math.PI / 2 - 0.55);
  const petals = ell(-f * 0.4, -f * 0.02, f * 0.42, f * 0.34, -0.2) + ell(f * 0.4, -f * 0.02, f * 0.42, f * 0.34, 0.2);
  const lip = L.print ? "#ffffff" : pale ? "#C0578F" : darken(c, 0.45);
  return (
    <>
      <path d={sepals} fill={fillOf(L, pale ? "#F6F2F4" : lighten(c, 0.18))} {...edge(L, 0.35)} />
      <path d={petals} fill={fillOf(L, c)} {...edge(L, 0.4)} />
      <path d={ell(0, f * 0.16, f * 0.2, f * 0.14, Math.PI / 2)} fill={lip} {...edge(L, 0.4)} />
    </>
  );
}

function orchidSpray(len: number, bend: number, c: string, L: Look): ReactNode {
  const p0: P = [0, 0];
  const cc: P = [len * 0.55, bend];
  const p1: P = [len, bend * 0.4];
  const tip = quad(p0, cc, p1, 0.97);
  return (
    <>
      <path d={`M0 0Q${f1(cc[0])} ${f1(cc[1])} ${f1(p1[0])} ${f1(p1[1])}`} fill="none" stroke={L.print ? L.ink : "#7E8F5E"} strokeOpacity={0.75} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {(
        [
          [0.36, 0.2],
          [0.55, 0.18],
          [0.72, 0.155],
          [0.86, 0.13],
        ] as const
      ).map(([t, k], i) => {
        const p = quad(p0, cc, p1, t);
        const g = quadTan(p0, cc, p1, t);
        const f = len * k;
        const deg = (Math.atan2(g[1], g[0]) * 180) / Math.PI + 90;
        return (
          <g key={i} transform={`translate(${f1(p[0])} ${f1(p[1])}) rotate(${f1(deg)})`}>
            <circle className={L.detail ? F : undefined} r={f1(f * 0.7)} fill={fillOf(L, c)} {...edge(L, 0.35)} />
            {L.detail && <g className={D}>{orchidFlower(f, c, L)}</g>}
          </g>
        );
      })}
      <path d={ell(tip[0], tip[1], len * 0.04, len * 0.028, 0)} fill={fillOf(L, lighten(c, 0.3))} {...edge(L, 0.35)} />
    </>
  );
}

// ── the arrangement ─────────────────────────────────────────────────────────────────────────────

const LAYER: Record<FlowerItem["t"], number> = { base: 0, green: 1, stem: 2, bottle: 3, fill: 4, head: 5, trail: 6 };
const FOLIAGE = "#93AD8B";

export interface FlowerDrawingProps {
  spec: FlowerDrawSpec;
  /** The line colour: a soft ink on screen, the sheet's ink in print. */
  ink?: string;
  /** Monochrome for the printed sheet: every fill white, every line ink. */
  print?: boolean;
  /** Whether the detail is rendered at all — off for a sheet too small to print it. */
  detail?: boolean;
}

/** An arrangement from above, in the footprint's frame. */
export function FlowerDrawing({ spec, ink = "var(--color-ink-soft)", print = false, detail = true }: FlowerDrawingProps) {
  const L: Look = { ink, print, detail };
  const items = composeFlowers(spec)
    .slice()
    .sort((a, b) => LAYER[a.t] - LAYER[b.t] || zOf(a) - zOf(b));
  return (
    <>
      {items.map((it, i) => {
        const deg = "ang" in it ? f1((it.ang * 180) / Math.PI) : 0;
        switch (it.t) {
          case "base":
            return print ? null : <path key={i} d={polyD(it.d)} fill={FOLIAGE} fillOpacity={0.5} />;
          case "green":
            return (
              <g key={i} transform={`translate(${f1(it.x)} ${f1(it.y)}) rotate(${deg})`}>
                {sprig(it.kind, it.len, it.bend, it.col, L)}
              </g>
            );
          case "stem":
            return <path key={i} d={`M${f1(it.x1)} ${f1(it.y1)}L${f1(it.x2)} ${f1(it.y2)}`} fill="none" stroke={print ? ink : "#6F8A6E"} strokeOpacity={0.7} strokeWidth={1} vectorEffect="non-scaling-stroke" />;
          case "bottle":
            return (
              <g key={i}>
                <circle cx={f1(it.x)} cy={f1(it.y)} r={f1(it.r)} fill={print ? "#ffffff" : "#E9F0F3"} {...edge(L, 0.5)} />
                <circle cx={f1(it.x)} cy={f1(it.y)} r={f1(it.r * 0.5)} fill="none" {...edge(L, 0.3)} />
              </g>
            );
          case "trail":
            return (
              <g key={i} transform={`translate(${f1(it.x)} ${f1(it.y)}) rotate(${deg})`}>
                {orchidSpray(it.len, it.bend, it.col, L)}
              </g>
            );
          default: {
            // A head near the rim of a dome faces outward, so from above it is foreshortened toward
            // the middle.
            const squash = it.sc < 0.995 ? ` rotate(${deg}) scale(${f1(it.sc * 100) / 100} 1) rotate(${-deg})` : "";
            return (
              <g key={i} transform={`translate(${f1(it.x)} ${f1(it.y)})${squash}`}>
                {head(it.kind, it.r, it.col, L, it.rot)}
              </g>
            );
          }
        }
      })}
    </>
  );
}

const zOf = (it: FlowerItem) => ("z" in it ? it.z : 0);

/** One head of a kind at a given radius, for a tile or a list row (the drawer's suggestions, the
 *  form picker). Greens draw as a short sprig, an orchid as a short spray. */
export function FlowerHead({ kind, r, colour, ink = "var(--color-ink-soft)" }: { kind: FlowerKindId; r: number; colour: string; ink?: string }) {
  const L: Look = { ink, print: false, detail: true };
  if (kind === "orchid") return <g transform={`translate(${f1(-r)} ${f1(r * 0.3)}) rotate(-12)`}>{orchidSpray(r * 2, -r * 0.25, colour, L)}</g>;
  if (kind === "euca" || kind === "ruscus" || kind === "fern" || kind === "monstera" || kind === "green" || kind === "grass" || kind === "dried") {
    return <g transform={`translate(${f1(-r)} ${f1(r * 0.3)}) rotate(-14)`}>{sprig(kind, r * 2, r * 0.14, colour, L)}</g>;
  }
  return <>{head(kind, r, colour, L, 0.6)}</>;
}
