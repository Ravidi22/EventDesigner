import { memo, type ReactNode } from "react";
import type { Footprint } from "@/lib/studio/footprint";
import { CLOTH_DROP_MM, type ChairStyle, type SymbolKind } from "@/lib/catalog/symbols";

export { CLOTH_DROP_MM };
import { isDark } from "@/lib/element-style";
import { FootprintShape, sameDrawProps } from "./footprint-shape";

// The category pictures (lib/catalog/symbols.ts says which item gets which, and why). Drawn in the
// footprint's own frame — centred on (0,0), true scale in millimetres — so every surface that already
// puts a footprint in place (the studio canvas, the drag image, the catalog card, the printed map)
// puts the picture in the same place by drawing it inside the same <g>.
//
// Seen from ABOVE, like everything else on the plan: a candelabrum is its candles round a stem, a
// chair is a seat with a backrest across one end, a chandelier is its arms and bulbs, dashed because
// it hangs overhead. Detail is kept to what still reads at hall zoom — a few shapes per item, not a
// drawing — because a room holds hundreds of them.
//
// No hooks and no handlers, so it renders on the server too (the printed map).

/** The "front" of a directional piece (a chair, a sofa, a bar's guest side) is +y — the bottom edge
 *  before the item is turned — and its back is −y. Turning the placement turns the picture. */

const FLAME = "#F2B544";
const LEAF = "#8FAE84";
const WATER = "#D3E7F0";
const WATER_DEEP = "#B5D5E3";

/** The colour an item is drawn in when its row and its shade say nothing: what the thing is usually
 *  made of. The designer's shade always wins (see `tone`). */
const DEFAULT_TONE: Record<SymbolKind, string> = {
  candlestick: "#C9A24A",
  flowers: "#E8BCCE",
  centerpiece: "#E8BCCE",
  chair: "#F7F6FC",
  sofa: "#ECE7F5",
  chandelier: "#C9A24A",
  column: "#FAF9FD",
  fountain: WATER,
  arch: "#E8BCCE",
  chuppah: "#FBF7F1",
  bar: "#FFFFFF",
  runner: "#EFE3CF",
};

export interface ItemSymbolProps {
  kind: SymbolKind;
  footprint: Footprint;
  /** Candles, arms, bulbs — symbolCount(). */
  count: number;
  /** The item's colour (its shade's swatch, or its row's fill). Absent = the material's default. */
  tone?: string;
  /** The line colour. Screen: a soft ink; print: the sheet's ink. */
  ink?: string;
  /** Monochrome for the printed sheet: every fill white, every line ink — legible photocopied. */
  print?: boolean;
  /** Hung from the ceiling: drawn, never filled, as FootprintShape draws anything overhead. */
  overhead?: boolean;
  /** Which chair, for a chair (symbolStyleOf). Absent = a dining chair, or a stool when round. */
  chairStyle?: ChairStyle;
}

function ItemSymbolView({ kind, footprint, count, tone, ink = "var(--color-ink-soft)", print, overhead, chairStyle }: ItemSymbolProps) {
  const { w, h, round } = boxOf(footprint);
  if (w <= 0 || h <= 0) return null;
  const t = print ? "#ffffff" : tone || DEFAULT_TONE[kind];
  const c: Colours = {
    tone: t,
    ink,
    inkOpacity: print ? 1 : 0.6,
    // The modelling inside a piece (a sofa's back and arms, a chair's backrest) is a shade OF its
    // colour: darker on a light piece, lighter on a dark one, or a navy sofa is one flat block.
    shade: print ? "#ffffff" : isDark(t) ? "#ffffff" : ink,
    shadeOpacity: print ? 1 : isDark(t) ? 0.16 : 0.14,
    print: !!print,
    overhead: !!overhead || kind === "chandelier",
  };
  const line = { stroke: c.ink, strokeOpacity: c.inkOpacity, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
  let body: ReactNode;
  switch (kind) {
    case "candlestick":
      body = candlestick(w, h, round, count, c, line);
      break;
    case "flowers":
      body = flowers(w, h, round, c, line);
      break;
    case "centerpiece":
      body = centerpiece(w, h, round, c, line);
      break;
    case "chair":
      body = round ? pouf(w, h, c, line) : chair(w, h, chairStyle ?? "dining", c, line);
      break;
    case "sofa":
      body = round ? pouf(w, h, c, line) : sofa(w, h, c, line);
      break;
    case "chandelier":
      body = chandelier(w, h, count, c, line);
      break;
    case "column":
      body = column(w, h, round, c, line);
      break;
    case "fountain":
      body = fountain(w, h, round, c, line);
      break;
    case "arch":
      body = along(w, h, (L, D) => arch(L, D, c, line));
      break;
    case "chuppah":
      body = chuppah(w, h, round, c, line);
      break;
    case "bar":
      body = round ? roundBar(w, h, c, line) : along(w, h, (L, D) => bar(L, D, c, line));
      break;
    case "runner":
      body = along(w, h, (L, D) => runner(L, D, c, line));
      break;
  }
  return <g className="pointer-events-none">{body}</g>;
}

// ── shared ──────────────────────────────────────────────────────────────────────────────────────

interface Colours {
  tone: string;
  ink: string;
  inkOpacity: number;
  shade: string;
  shadeOpacity: number;
  print: boolean;
  overhead: boolean;
}
type Line = { stroke: string; strokeOpacity: number; strokeWidth: number; vectorEffect: "non-scaling-stroke" };

function boxOf(f: Footprint): { w: number; h: number; round: boolean } {
  if (f.kind === "circle") return { w: f.diameterMm, h: f.diameterMm, round: true };
  if (f.kind === "ellipse") return { w: f.widthMm, h: f.depthMm, round: true };
  if (f.kind === "rect") return { w: f.widthMm, h: f.depthMm, round: false };
  return { w: 0, h: 0, round: false };
}

/** Draw a long piece along its LONGER side: the builder is written for a run along x, and a piece
 *  whose depth is its long side (a bar drawn 60×300) is turned a quarter to fit it. */
function along(w: number, h: number, draw: (length: number, depth: number) => ReactNode): ReactNode {
  return w >= h ? draw(w, h) : <g transform="rotate(90)">{draw(h, w)}</g>;
}

const polar = (r: number, deg: number) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });

/** One bloom seen from above: the flower, and the lighter heart of it. */
function bloom(key: string, x: number, y: number, r: number, c: Colours, line: Line, dim = false) {
  return (
    <g key={key}>
      <circle cx={x} cy={y} r={r} fill={c.tone} fillOpacity={dim && !c.print ? 0.82 : 1} {...line} strokeOpacity={line.strokeOpacity * 0.7} />
      <circle cx={x} cy={y} r={r * 0.38} fill={c.print ? "none" : "#ffffff"} fillOpacity={0.45} {...(c.print ? line : {})} />
    </g>
  );
}

function leaf(key: string, x: number, y: number, len: number, deg: number, c: Colours, line: Line) {
  return (
    <ellipse
      key={key}
      cx={x}
      cy={y}
      rx={len / 2}
      ry={len / 5}
      transform={`rotate(${deg} ${x} ${y})`}
      fill={c.print ? "#ffffff" : LEAF}
      {...line}
      strokeOpacity={line.strokeOpacity * 0.5}
    />
  );
}

/** A round bunch: leaves showing round the rim, a bloom in the middle and a ring of six round it. */
function cluster(r: number, c: Colours, line: Line, at = { x: 0, y: 0 }, prefix = "") {
  const out: ReactNode[] = [];
  for (let k = 0; k < 5; k++) {
    const deg = 18 + k * 72;
    const p = polar(r * 0.7, deg);
    out.push(leaf(`${prefix}l${k}`, at.x + p.x, at.y + p.y, r * 0.62, deg, c, line));
  }
  for (let k = 0; k < 6; k++) {
    const p = polar(r * 0.5, -90 + k * 60);
    out.push(bloom(`${prefix}b${k}`, at.x + p.x, at.y + p.y, r * 0.3, c, line, k % 2 === 1));
  }
  out.push(bloom(`${prefix}c`, at.x, at.y, r * 0.34, c, line));
  return out;
}

// ── the pictures ────────────────────────────────────────────────────────────────────────────────

/** A candelabrum: its candles round a central stem, joined to it by its arms — or, on a long piece,
 *  a row of candles on a bar. Each candle wears its flame, which is what makes it read as light. */
function candlestick(w: number, h: number, round: boolean, n: number, c: Colours, line: Line) {
  const candle = (key: string, x: number, y: number, r: number) => (
    <g key={key}>
      <circle cx={x} cy={y} r={r} fill={c.tone} {...line} />
      <circle cx={x} cy={y} r={r * 0.5} fill={c.print ? "none" : FLAME} {...(c.print ? line : {})} />
      {!c.print && <circle cx={x} cy={y} r={r * 0.2} fill="#ffffff" fillOpacity={0.85} />}
    </g>
  );
  // A long piece: candles in a row along a bar.
  if (!round && Math.max(w, h) / Math.min(w, h) >= 1.8) {
    return along(w, h, (L, D) => {
      const r = Math.min(D * 0.34, L / (n * 2.3));
      const xs = Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -L * 0.42 + (i * L * 0.84) / (n - 1)));
      return (
        <>
          <rect x={-L * 0.46} y={-D * 0.12} width={L * 0.92} height={D * 0.24} rx={D * 0.12} fill={c.tone} {...line} />
          {xs.map((x, i) => candle(`c${i}`, x, 0, r))}
        </>
      );
    });
  }
  const R = Math.min(w, h) / 2;
  if (n <= 1) {
    return (
      <>
        <circle r={R * 0.92} fill={c.tone} fillOpacity={c.print ? 1 : 0.35} {...line} />
        {candle("c", 0, 0, R * 0.5)}
      </>
    );
  }
  // A centre candle on an odd count; the rest round it.
  const ring = n % 2 === 1 ? n - 1 : n;
  const reach = R * 0.68;
  const r = Math.min(R * 0.21, ((Math.PI * reach) / ring) * 0.55);
  const arms = Array.from({ length: ring }, (_, i) => polar(reach, -90 + (i * 360) / ring));
  return (
    <>
      {arms.map((p, i) => (
        <line key={`a${i}`} x1={0} y1={0} x2={p.x} y2={p.y} {...line} stroke={c.print ? c.ink : c.tone} strokeOpacity={1} strokeWidth={2.5} />
      ))}
      <circle r={R * 0.2} fill={c.tone} {...line} />
      {arms.map((p, i) => candle(`c${i}`, p.x, p.y, r))}
      {n % 2 === 1 && candle("cc", 0, 0, r * 0.95)}
    </>
  );
}

/** An arrangement: a round bunch, or blooms in a staggered run along a long one. */
function flowers(w: number, h: number, round: boolean, c: Colours, line: Line) {
  if (round && Math.abs(w - h) < 1) return cluster(w / 2, c, line);
  return along(w, h, (L, D) => {
    const n = Math.max(3, Math.round(L / (D * 0.5)));
    const r = Math.min(D * 0.3, L / (n * 1.6));
    const out: ReactNode[] = [];
    // Leaves out past the ends and along the sides, under the blooms.
    out.push(leaf("le0", -L / 2 + D * 0.3, 0, D * 0.6, 0, c, line), leaf("le1", L / 2 - D * 0.3, 0, D * 0.6, 0, c, line));
    for (let i = 0; i < n - 1; i++) {
      const x = -L / 2 + D * 0.4 + ((i + 0.5) * (L - D * 0.8)) / (n - 1);
      out.push(leaf(`ls${i}`, x, (i % 2 ? 1 : -1) * D * 0.3, D * 0.45, i % 2 ? 35 : -35, c, line));
    }
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + D * 0.4 + (i * (L - D * 0.8)) / (n - 1);
      out.push(bloom(`b${i}`, x, (i % 2 ? 1 : -1) * D * 0.1, r, c, line, i % 2 === 1));
    }
    return out;
  });
}

/** A centrepiece: the base it stands on, faint, and the flowers spilling over it. */
function centerpiece(w: number, h: number, round: boolean, c: Colours, line: Line) {
  if (!round || Math.abs(w - h) > 1) return flowers(w, h, round, c, line);
  const R = w / 2;
  return (
    <>
      <circle r={R} fill={c.print ? "#ffffff" : "#F4F1F8"} {...line} strokeOpacity={line.strokeOpacity * 0.6} />
      <circle r={R * 0.86} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.35} />
      {cluster(R * 0.78, c, line)}
    </>
  );
}

// ── chairs ─────────────────────────────────────────────────────────────────────────────────────
//
// Every chair is drawn in the same frame: `w` across, `h` deep, its BACK along −y and the edge you
// sit down from along +y. The styles (ChairStyle, lib/catalog/symbols.ts) differ in what makes them
// recognisable from above — a Chiavari's narrow back rail and its two posts, a cross-back's X, a
// ghost chair's clear shell, an armchair's arms — and agree on everything else, so a room laid in
// several reads as one set of chairs.

/** A backrest that curves, as a dining chair's does: a band along the back edge bowed toward the
 *  sitter, `t` thick, `sag` deep at its middle. */
function curvedBack(w: number, h: number, t: number, sag: number) {
  const y0 = -h / 2;
  return `M ${-w / 2} ${y0 + sag} Q 0 ${y0 - sag} ${w / 2} ${y0 + sag} L ${w / 2} ${y0 + sag + t} Q 0 ${y0 - sag + t} ${-w / 2} ${y0 + sag + t} Z`;
}

/** The seat: wider at the front than the back by `taper`, its front corners rounder than its back. */
function seatPath(w: number, top: number, bottom: number, taper: number, r: number) {
  const bw = (w * (1 - taper)) / 2;
  const fw = w / 2;
  return `M ${-bw + r * 0.4} ${top} L ${bw - r * 0.4} ${top} Q ${bw} ${top} ${bw + (fw - bw) * 0.1} ${top + r * 0.4} L ${fw} ${bottom - r} Q ${fw} ${bottom} ${fw - r} ${bottom} L ${-fw + r} ${bottom} Q ${-fw} ${bottom} ${-fw} ${bottom - r} L ${-bw - (fw - bw) * 0.1} ${top + r * 0.4} Q ${-bw} ${top} ${-bw + r * 0.4} ${top} Z`;
}

function chair(w: number, h: number, style: ChairStyle, c: Colours, line: Line) {
  const m = Math.min(w, h);
  const shade = { fill: c.shade, fillOpacity: c.print ? 0 : c.shadeOpacity * 2 };
  const faint = { ...line, strokeOpacity: line.strokeOpacity * 0.45 };
  switch (style) {
    case "chiavari": {
      // Narrow back rail with a post at each end; a seat that widens to the front.
      const rail = h * 0.12;
      const post = m * 0.07;
      const top = -h / 2 + rail * 0.6;
      return (
        <>
          <path d={seatPath(w * 0.96, top, h / 2, 0.14, m * 0.14)} fill={c.tone} {...line} />
          <path d={seatPath(w * 0.96 * 0.78, top + h * 0.1, h / 2 - h * 0.1, 0.12, m * 0.1)} fill="none" {...faint} />
          <rect x={-w * 0.42} y={-h / 2} width={w * 0.84} height={rail} rx={rail / 2} fill={c.tone} {...line} />
          <rect x={-w * 0.42} y={-h / 2} width={w * 0.84} height={rail} rx={rail / 2} {...shade} />
          {[-1, 1].map((s) => (
            <circle key={s} cx={s * w * 0.42} cy={-h / 2 + rail / 2} r={post} fill={c.tone} {...line} />
          ))}
        </>
      );
    }
    case "crossback": {
      // Timber: a planked seat, and the back rail with the X it is named for.
      const back = h * 0.16;
      const top = -h / 2 + back * 0.7;
      return (
        <>
          <path d={seatPath(w, top, h / 2, 0.06, m * 0.1)} fill={c.tone} {...line} />
          {[0.36, 0.64].map((f) => (
            <line key={f} x1={-w / 2 + w * 0.04} y1={top + (h / 2 - top) * f} x2={w / 2 - w * 0.04} y2={top + (h / 2 - top) * f} {...faint} />
          ))}
          <rect x={-w / 2} y={-h / 2} width={w} height={back} rx={back * 0.3} fill={c.tone} {...line} />
          <rect x={-w / 2} y={-h / 2} width={w} height={back} rx={back * 0.3} {...shade} />
          <path d={`M ${-w * 0.36} ${-h / 2 + back * 0.2} L ${w * 0.36} ${-h / 2 + back * 0.8} M ${w * 0.36} ${-h / 2 + back * 0.2} L ${-w * 0.36} ${-h / 2 + back * 0.8}`} {...line} fill="none" />
        </>
      );
    }
    case "ghost": {
      // Clear polycarbonate: the shell is a tint you see the floor through, its edge the only line.
      const clear = { fill: c.tone, fillOpacity: c.print ? 0 : 0.35 };
      const back = h * 0.18;
      return (
        <>
          <path d={seatPath(w, -h / 2 + back * 0.6, h / 2, 0.08, m * 0.22)} {...clear} {...line} />
          <path d={curvedBack(w * 0.92, h, back, h * 0.1)} {...clear} {...line} strokeLinejoin="round" />
        </>
      );
    }
    case "folding": {
      // A slatted seat and a back that stands clear of it — the gap where it folds.
      const back = h * 0.12;
      const top = -h / 2 + back + h * 0.06;
      return (
        <>
          <rect x={-w / 2} y={top} width={w} height={h / 2 - top} rx={m * 0.06} fill={c.tone} {...line} />
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={-w / 2 + w * 0.06} y1={top + (h / 2 - top) * f} x2={w / 2 - w * 0.06} y2={top + (h / 2 - top) * f} {...faint} />
          ))}
          <rect x={-w / 2} y={-h / 2} width={w} height={back} rx={back / 2} fill={c.tone} {...line} />
          <rect x={-w / 2} y={-h / 2} width={w} height={back} rx={back / 2} {...shade} />
        </>
      );
    }
    case "armchair": {
      // Upholstered: a deep back, an arm each side, the cushion between, buttoned.
      const back = h * 0.24;
      const arm = w * 0.15;
      const r = m * 0.16;
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={r} fill={c.tone} {...line} />
          <path d={curvedBack(w, h, back, h * 0.04)} {...shade} />
          <rect x={-w / 2} y={-h / 2 + back * 0.5} width={arm} height={h - back * 0.5} rx={arm / 2} {...shade} {...faint} />
          <rect x={w / 2 - arm} y={-h / 2 + back * 0.5} width={arm} height={h - back * 0.5} rx={arm / 2} {...shade} {...faint} />
          <rect x={-w / 2 + arm + w * 0.02} y={-h / 2 + back + h * 0.02} width={w - arm * 2 - w * 0.04} height={h / 2 - (-h / 2 + back) - h * 0.06} rx={r * 0.6} fill={c.tone} {...faint} />
          {[-1, 1].map((s) => (
            <circle key={s} cx={s * w * 0.12} cy={h * 0.08} r={m * 0.025} fill={c.print ? "none" : c.shade} fillOpacity={0.4} {...faint} />
          ))}
        </>
      );
    }
    case "stool":
      return pouf(w, h, c, line);
    case "bench": {
      // A long seat, no back: planks along its length.
      const n = Math.max(2, Math.round(h / 120));
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={m * 0.12} fill={c.tone} {...line} />
          {Array.from({ length: n - 1 }, (_, i) => (
            <line key={i} x1={-w / 2 + m * 0.1} y1={-h / 2 + ((i + 1) * h) / n} x2={w / 2 - m * 0.1} y2={-h / 2 + ((i + 1) * h) / n} {...faint} />
          ))}
        </>
      );
    }
    default: {
      // A dining chair: an upholstered seat with its cushion seam, and a curved back.
      const back = h * 0.17;
      const top = -h / 2 + back * 0.55;
      return (
        <>
          <path d={seatPath(w, top, h / 2, 0.08, m * 0.2)} fill={c.tone} {...line} />
          <path d={seatPath(w * 0.8, top + h * 0.09, h / 2 - h * 0.09, 0.08, m * 0.14)} fill="none" {...faint} />
          <path d={curvedBack(w, h, back, h * 0.06)} fill={c.tone} {...line} strokeLinejoin="round" />
          <path d={curvedBack(w, h, back, h * 0.06)} {...shade} />
        </>
      );
    }
  }
}

/** One of the chairs round a table, in the seat's own frame (lib/studio/seating.ts: +x points at the
 *  table, the chair is `widthMm` across and `depthMm` deep) — the dining chair turned so its back is
 *  away from the table. Neutral by default: the chairs are the room's furniture, not its design. */
function SeatChairView({
  widthMm,
  depthMm,
  style = "dining",
  tone = "#F4F2F9",
  ink = "var(--color-muted)",
  print,
}: {
  widthMm: number;
  depthMm: number;
  style?: ChairStyle;
  tone?: string;
  ink?: string;
  print?: boolean;
}) {
  const t = print ? "#ffffff" : tone;
  const c: Colours = {
    tone: t,
    ink,
    inkOpacity: print ? 1 : 0.75,
    shade: print ? "#ffffff" : isDark(t) ? "#ffffff" : ink,
    shadeOpacity: print ? 1 : isDark(t) ? 0.16 : 0.14,
    print: !!print,
    overhead: false,
  };
  const line = { stroke: ink, strokeOpacity: c.inkOpacity, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
  return <g transform="rotate(-90)">{chair(widthMm, depthMm, style, c, line)}</g>;
}

/** A sofa: the back along its back edge, an arm at each end, and its seat cushions between them. */
function sofa(w: number, h: number, c: Colours, line: Line) {
  const back = Math.min(h * 0.28, 260);
  const arm = Math.min(w * 0.13, 230, h * 0.3);
  const innerW = w - arm * 2;
  const n = Math.max(1, Math.round(innerW / 650));
  const gap = 25;
  const cw = (innerW - gap * (n + 1)) / n;
  const cy = -h / 2 + back + gap;
  const ch = h / 2 - cy - gap;
  const shade = { fill: c.shade, fillOpacity: c.print ? 1 : c.shadeOpacity };
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(arm, back) * 0.6} fill={c.tone} {...line} />
      <rect x={-w / 2} y={-h / 2} width={w} height={back} rx={back * 0.4} {...shade} />
      <rect x={-w / 2} y={-h / 2} width={arm} height={h} rx={arm * 0.45} {...shade} {...line} strokeOpacity={line.strokeOpacity * 0.5} />
      <rect x={w / 2 - arm} y={-h / 2} width={arm} height={h} rx={arm * 0.45} {...shade} {...line} strokeOpacity={line.strokeOpacity * 0.5} />
      {cw > 40 &&
        ch > 40 &&
        Array.from({ length: n }, (_, i) => (
          <rect
            key={i}
            x={-w / 2 + arm + gap + i * (cw + gap)}
            y={cy}
            width={cw}
            height={ch}
            rx={Math.min(cw, ch) * 0.18}
            fill={c.tone}
            {...line}
            strokeOpacity={line.strokeOpacity * 0.6}
          />
        ))}
    </>
  );
}

/** A round seat — a stool, a pouf: the cushion and its button. */
function pouf(w: number, h: number, c: Colours, line: Line) {
  return (
    <>
      <ellipse rx={w / 2} ry={h / 2} fill={c.tone} {...line} />
      <ellipse rx={w * 0.32} ry={h * 0.32} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.4} />
      <circle r={Math.min(w, h) * 0.05} fill={c.print ? "none" : c.ink} fillOpacity={0.35} {...line} />
    </>
  );
}

/** A chandelier: hub, arms and bulbs, and its crystal ring — lines only, dashed where it is a ring,
 *  because the thing is overhead and a filled shape reads as something you walk round. */
function chandelier(w: number, h: number, n: number, c: Colours, line: Line) {
  const R = Math.min(w, h) / 2;
  const count = Math.max(3, n);
  const arms = Array.from({ length: count }, (_, i) => polar(R * 0.74, -90 + (i * 360) / count));
  const bulb = Math.min(R * 0.1, ((Math.PI * R * 0.74) / arms.length) * 0.35);
  const stroke = c.print ? c.ink : c.tone;
  return (
    <>
      <circle r={R * 0.48} fill="none" {...line} strokeDasharray="4 3" />
      {arms.map((p, i) => (
        <line key={`a${i}`} x1={0} y1={0} x2={p.x} y2={p.y} {...line} stroke={stroke} strokeOpacity={0.9} strokeWidth={1.5} />
      ))}
      {arms.map((p, i) => (
        <circle key={`b${i}`} cx={p.x} cy={p.y} r={bulb} fill="none" {...line} stroke={stroke} strokeOpacity={1} strokeWidth={1.5} />
      ))}
      <circle r={R * 0.13} fill="none" {...line} stroke={stroke} strokeOpacity={1} strokeWidth={1.5} />
    </>
  );
}

/** A column: its plinth, the fluted shaft standing on it, and the capital at the top. */
function column(w: number, h: number, round: boolean, c: Colours, line: Line) {
  const R = Math.min(w, h) / 2;
  const flutes = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <>
      {round ? <ellipse rx={w / 2} ry={h / 2} fill={c.tone} {...line} /> : <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={c.tone} {...line} />}
      <circle r={R * 0.74} fill={c.tone} {...line} />
      {flutes.map((deg, i) => {
        const a = polar(R * 0.58, deg);
        const b = polar(R * 0.74, deg);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...line} strokeOpacity={line.strokeOpacity * 0.6} />;
      })}
      <circle r={R * 0.36} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.5} />
    </>
  );
}

/** A fountain: the basin, its rim, the bowl in the middle and the spout — and the rings on the water. */
function fountain(w: number, h: number, round: boolean, c: Colours, line: Line) {
  const water = c.print ? "#ffffff" : c.tone === DEFAULT_TONE.fountain ? WATER : c.tone;
  const ripple = { fill: "none", stroke: c.print ? c.ink : "#ffffff", strokeOpacity: c.print ? 0.5 : 0.9, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
  const R = Math.min(w, h) / 2;
  return (
    <>
      {round ? <ellipse rx={w / 2} ry={h / 2} fill={water} {...line} /> : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={R * 0.15} fill={water} {...line} />}
      {round ? <ellipse rx={w / 2 - R * 0.08} ry={h / 2 - R * 0.08} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.6} /> : <rect x={-w / 2 + R * 0.08} y={-h / 2 + R * 0.08} width={w - R * 0.16} height={h - R * 0.16} rx={R * 0.1} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.6} />}
      <circle r={R * 0.68} {...ripple} strokeDasharray="5 4" />
      <circle r={R * 0.42} fill={c.print ? "#ffffff" : WATER_DEEP} {...line} />
      <circle r={R * 0.26} {...ripple} />
      <circle r={R * 0.1} fill="#ffffff" {...line} />
    </>
  );
}

/** An arch, seen from above: a foot at each end and the span between them, dressed with flowers. */
function arch(L: number, D: number, c: Colours, line: Line) {
  const foot = Math.min(D, L * 0.2);
  const span = D * 0.38;
  const groups = Math.max(2, Math.round(L / 550));
  const out: ReactNode[] = [
    <rect key="span" x={-L / 2 + foot / 2} y={-span / 2} width={L - foot} height={span} fill={c.print ? "#ffffff" : c.ink} fillOpacity={c.print ? 1 : 0.14} {...line} />,
    <rect key="f0" x={-L / 2} y={-foot / 2} width={foot} height={foot} rx={foot * 0.12} fill={c.print ? "#ffffff" : c.ink} fillOpacity={c.print ? 1 : 0.32} {...line} />,
    <rect key="f1" x={L / 2 - foot} y={-foot / 2} width={foot} height={foot} rx={foot * 0.12} fill={c.print ? "#ffffff" : c.ink} fillOpacity={c.print ? 1 : 0.32} {...line} />,
  ];
  for (let i = 0; i < groups; i++) {
    const x = -L / 2 + foot * 0.7 + (i * (L - foot * 1.4)) / (groups - 1);
    out.push(...cluster(D * 0.42, c, line, { x, y: (i % 2 ? 1 : -1) * D * 0.08 }, `g${i}`));
  }
  return out;
}

/** A chuppah: the canopy, its four poles, the folds of the cloth corner to corner, and flowers at the
 *  two front poles — the side the couple face the guests from. */
function chuppah(w: number, h: number, round: boolean, c: Colours, line: Line) {
  const m = Math.min(w, h);
  const pole = m * 0.045;
  const fold = { ...line, strokeOpacity: line.strokeOpacity * 0.55, strokeDasharray: "4 3" };
  const flower = { ...c, tone: c.print ? c.tone : "#E8BCCE" };
  const post = (p: { x: number; y: number }, i: number) => (
    <circle key={`p${i}`} cx={p.x} cy={p.y} r={pole} fill={c.print ? "#ffffff" : c.ink} fillOpacity={c.print ? 1 : 0.55} {...line} />
  );
  if (round) {
    const poles = [45, 135, 225, 315].map((d) => ({ x: (w / 2) * 0.82 * Math.cos((d * Math.PI) / 180), y: (h / 2) * 0.82 * Math.sin((d * Math.PI) / 180) }));
    return (
      <>
        <ellipse rx={w / 2} ry={h / 2} fill={c.tone} fillOpacity={c.print ? 1 : 0.55} {...line} />
        <line x1={poles[0].x} y1={poles[0].y} x2={poles[2].x} y2={poles[2].y} {...fold} />
        <line x1={poles[1].x} y1={poles[1].y} x2={poles[3].x} y2={poles[3].y} {...fold} />
        {/* The back poles bare; the front two wrapped in flowers. */}
        {post(poles[2], 2)}
        {post(poles[3], 3)}
        {cluster(m * 0.13, flower, line, poles[0], "f0")}
        {cluster(m * 0.13, flower, line, poles[1], "f1")}
      </>
    );
  }
  const x = w / 2 - pole * 1.6;
  const y = h / 2 - pole * 1.6;
  const poles = [
    { x: -x, y: -y },
    { x, y: -y },
    { x, y },
    { x: -x, y },
  ];
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={c.tone} fillOpacity={c.print ? 1 : 0.55} {...line} />
      <line x1={-x} y1={-y} x2={x} y2={y} {...fold} />
      <line x1={x} y1={-y} x2={-x} y2={y} {...fold} />
      {/* The back poles bare; the front two (+y) wrapped in flowers. */}
      {post(poles[0], 0)}
      {post(poles[1], 1)}
      {cluster(m * 0.14, flower, line, poles[2], "f0")}
      {cluster(m * 0.14, flower, line, poles[3], "f1")}
    </>
  );
}

/** A round bar: the ring of counter guests stand at, the staff's well inside it, and the back bar's
 *  bottles in a ring round the middle. */
function roundBar(w: number, h: number, c: Colours, line: Line) {
  const R = Math.min(w, h) / 2;
  const top = Math.min(R * 0.4, 600);
  const n = Math.max(6, Math.round((2 * Math.PI * R * 0.3) / 220));
  const shade = { fill: c.print ? "#ffffff" : c.ink, fillOpacity: c.print ? 1 : 0.1 };
  return (
    <>
      <ellipse rx={w / 2} ry={h / 2} fill={c.tone} {...line} />
      <ellipse rx={w / 2} ry={h / 2} {...shade} />
      <ellipse rx={w / 2 - top} ry={h / 2 - top} fill={c.tone} {...line} strokeOpacity={line.strokeOpacity * 0.7} />
      {Array.from({ length: n }, (_, i) => {
        const p = polar(R * 0.3, (i * 360) / n);
        return <circle key={i} cx={p.x * (w / h > 1 ? w / h : 1)} cy={p.y} r={Math.min(R * 0.05, 45)} fill="#ffffff" {...line} />;
      })}
    </>
  );
}

/** A bar: the counter guests lean on along its front, the aisle the bartender works in, and the back
 *  bar with its bottles along the back edge. */
function bar(L: number, D: number, c: Colours, line: Line) {
  const top = Math.min(D * 0.4, 600);
  const back = Math.min(D * 0.2, 400);
  const bottles = Math.max(0, Math.floor((L - back) / 260));
  return (
    <>
      <rect x={-L / 2} y={-D / 2} width={L} height={D} fill={c.tone} {...line} />
      <rect x={-L / 2} y={D / 2 - top} width={L} height={top} fill={c.print ? "#ffffff" : c.ink} fillOpacity={c.print ? 1 : 0.1} {...line} strokeOpacity={line.strokeOpacity * 0.7} />
      <rect x={-L / 2} y={-D / 2} width={L} height={back} fill={c.print ? "#ffffff" : c.ink} fillOpacity={c.print ? 1 : 0.18} {...line} strokeOpacity={line.strokeOpacity * 0.7} />
      {Array.from({ length: bottles }, (_, i) => (
        <circle
          key={i}
          cx={-L / 2 + back / 2 + ((i + 0.5) * (L - back)) / bottles}
          cy={-D / 2 + back / 2}
          r={Math.min(back * 0.28, 45)}
          fill="#ffffff"
          {...line}
        />
      ))}
    </>
  );
}

// ── a table's cloth ─────────────────────────────────────────────────────────────────────────────

/** A tablecloth seen from above: the fabric a little wider than the table it covers, a hem round its
 *  edge and the folds where it breaks over the rim. Drawn UNDER the tabletop, in the table's frame.
 *
 *  The growth is a round-joined stroke as wide as twice the drop — which is exactly the outline
 *  offset outward, for every shape, the same trick the safety halos use — so an arc, a ח or a
 *  serpentine wears its cloth as faithfully as a round does. */
function ClothDrapeView({ footprint, colour, ink = "var(--color-ink)" }: { footprint: Footprint; colour: string; ink?: string }) {
  const D = CLOTH_DROP_MM;
  const folds: ReactNode[] = [];
  // A crease is a shade of the fabric: darker on a light cloth, lighter on a dark one.
  const fold = isDark(colour)
    ? { stroke: "#ffffff", strokeOpacity: 0.22, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const }
    : { stroke: ink, strokeOpacity: 0.16, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
  if (footprint.kind === "circle" || footprint.kind === "ellipse") {
    const rx = (footprint.kind === "circle" ? footprint.diameterMm : footprint.widthMm) / 2;
    const ry = (footprint.kind === "circle" ? footprint.diameterMm : footprint.depthMm) / 2;
    const n = Math.max(8, Math.round((Math.PI * (rx + ry)) / 260));
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      folds.push(<line key={i} x1={(rx + 12) * c} y1={(ry + 12) * s} x2={(rx + D - 14) * c} y2={(ry + D - 14) * s} {...fold} />);
    }
  } else if (footprint.kind === "rect") {
    const w = footprint.widthMm / 2;
    const h = footprint.depthMm / 2;
    // Evenly along a side, a fold every 30cm or so, none at the corners.
    const along = (len: number) => {
      const n = Math.max(0, Math.round((len * 2) / 300) - 1);
      return Array.from({ length: n }, (_, i) => -len + ((i + 1) * len * 2) / (n + 1));
    };
    along(w).forEach((x, i) => {
      folds.push(<line key={`t${i}`} x1={x} y1={-h - 12} x2={x} y2={-h - D + 14} {...fold} />);
      folds.push(<line key={`b${i}`} x1={x} y1={h + 12} x2={x} y2={h + D - 14} {...fold} />);
    });
    along(h).forEach((y, i) => {
      folds.push(<line key={`l${i}`} x1={-w - 12} y1={y} x2={-w - D + 14} y2={y} {...fold} />);
      folds.push(<line key={`r${i}`} x1={w + 12} y1={y} x2={w + D - 14} y2={y} {...fold} />);
    });
    // The corners, where the fabric gathers.
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      folds.push(<line key={`c${sx}${sy}`} x1={sx * (w + 8)} y1={sy * (h + 8)} x2={sx * (w + D * 0.62)} y2={sy * (h + D * 0.62)} {...fold} />);
    }
  }
  return (
    <g className="pointer-events-none">
      {/* The hem: a hair wider than the fabric, in ink, so the cloth has an edge on a white plan. */}
      <FootprintShape footprint={footprint} fill={colour} stroke={ink} strokeOpacity={0.28} strokeWidth={D * 2 + 14} strokeLinejoin="round" />
      <FootprintShape footprint={footprint} fill={colour} stroke={colour} strokeWidth={D * 2} strokeLinejoin="round" />
      {folds}
    </g>
  );
}

/** A table runner seen from above, along x: a strip of fabric with its hem stitched in from the edge,
 *  a soft fold down its length, and a point of tassel at each end where it falls over the table. */
function runner(L: number, D: number, c: Colours, line: Line) {
  const faint = { ...line, strokeOpacity: line.strokeOpacity * 0.5 };
  const hem = Math.min(30, D * 0.08);
  const tip = Math.min(D * 0.45, 120);
  return (
    <>
      <path
        d={`M ${-L / 2 + tip} ${-D / 2} L ${L / 2 - tip} ${-D / 2} L ${L / 2} 0 L ${L / 2 - tip} ${D / 2} L ${-L / 2 + tip} ${D / 2} L ${-L / 2} 0 Z`}
        fill={c.tone}
        fillOpacity={c.print ? 1 : 0.94}
        {...line}
        strokeLinejoin="round"
      />
      <path
        d={`M ${-L / 2 + tip} ${-D / 2 + hem} L ${L / 2 - tip} ${-D / 2 + hem} M ${-L / 2 + tip} ${D / 2 - hem} L ${L / 2 - tip} ${D / 2 - hem}`}
        fill="none"
        {...faint}
        strokeDasharray="6 5"
      />
      <line x1={-L / 2 + tip} y1={0} x2={L / 2 - tip} y2={0} stroke={c.shade} strokeOpacity={c.print ? 0 : c.shadeOpacity} strokeWidth={Math.max(5, D * 0.025)} />
      {[-1, 1].map((sx) => (
        <circle key={sx} cx={sx * (L / 2 + 14)} cy={0} r={Math.max(10, D * 0.05)} fill={c.tone} {...line} />
      ))}
    </>
  );
}

// ── a curtain's pleats, a rug's border and fringe ───────────────────────────────────────────────

/** The folds of a drape, in a frame where the drape runs along x, centred, `depthMm` thick: the wave
 *  of the fabric gathered on its rail, one pleat every 15cm or so. */
function DrapePleatsView({ lengthMm, depthMm, ink = "var(--color-ink)", opacity = 0.35 }: { lengthMm: number; depthMm: number; ink?: string; opacity?: number }) {
  const pleat = 150;
  const n = Math.max(2, Math.round(lengthMm / pleat));
  const step = lengthMm / n;
  const amp = depthMm * 0.28;
  let d = `M ${-lengthMm / 2} 0`;
  for (let i = 0; i < n; i++) {
    const x0 = -lengthMm / 2 + i * step;
    d += ` Q ${x0 + step / 2} ${i % 2 ? amp * 2 : -amp * 2} ${x0 + step} 0`;
  }
  return (
    <path d={d} fill="none" stroke={ink} strokeOpacity={opacity} strokeWidth={1} vectorEffect="non-scaling-stroke" className="pointer-events-none" />
  );
}

/** A rug, centred, `w`×`h`: the woven border inside its edge and the fringe off its two short ends. */
function RugPatternView({ w, h, ink = "var(--color-ink)", opacity = 1 }: { w: number; h: number; ink?: string; opacity?: number }) {
  const m = Math.min(w, h);
  const b1 = Math.min(m * 0.07, 160);
  const b2 = Math.min(m * 0.12, 260);
  const fringe = Math.min(70, m * 0.05);
  const gap = 45;
  const line = { fill: "none", stroke: ink, vectorEffect: "non-scaling-stroke" as const, strokeWidth: 1 };
  // The fringe hangs off the SHORT ends — the ends a rug is woven from.
  let f = "";
  if (w >= h) {
    for (let y = -h / 2 + gap / 2; y < h / 2; y += gap) f += `M ${-w / 2} ${y} h ${-fringe} M ${w / 2} ${y} h ${fringe} `;
  } else {
    for (let x = -w / 2 + gap / 2; x < w / 2; x += gap) f += `M ${x} ${-h / 2} v ${-fringe} M ${x} ${h / 2} v ${fringe} `;
  }
  return (
    <g className="pointer-events-none" opacity={opacity}>
      <rect x={-w / 2 + b1} y={-h / 2 + b1} width={w - b1 * 2} height={h - b1 * 2} {...line} strokeOpacity={0.3} />
      {m > b2 * 3 && <rect x={-w / 2 + b2} y={-h / 2 + b2} width={w - b2 * 2} height={h - b2 * 2} {...line} strokeOpacity={0.18} strokeDasharray="3 3" />}
      <path d={f} {...line} strokeOpacity={0.35} />
    </g>
  );
}

// Memoised: the canvas re-renders every node on each frame of a pan or zoom, and these are most of
// its elements (see sameDrawProps in components/footprint-shape.tsx).
export const ItemSymbol = memo(ItemSymbolView, sameDrawProps);
export const SeatChair = memo(SeatChairView, sameDrawProps);
export const ClothDrape = memo(ClothDrapeView, sameDrawProps);
export const DrapePleats = memo(DrapePleatsView, sameDrawProps);
export const RugPattern = memo(RugPatternView, sameDrawProps);
