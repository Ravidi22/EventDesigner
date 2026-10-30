import { memo, type ReactNode } from "react";
import type { Footprint } from "@/lib/studio/footprint";
import {
  CLOTH_DROP_MM,
  type ArchStyle,
  type CandleStyle,
  type ChairStyle,
  type ChandelierStyle,
  type ColumnStyle,
  type DrawStyle,
  type FountainStyle,
  type GateStyle,
  type LampStyle,
  type SofaStyle,
  type SymbolKind,
  type TreeStyle,
  type VaseStyle,
} from "@/lib/catalog/symbols";

export { CLOTH_DROP_MM };
import { isDark } from "@/lib/element-style";
import type { PlacementClimb, Point } from "@/lib/design-document/types";
import { benchLayout, type BenchLayout } from "@/lib/design-document/bench";
import { CHAIR_D_MM, CHAIR_W_MM } from "@/lib/studio/seating";
import { FootprintShape, sameDrawProps } from "./footprint-shape";
import { ClimbGlyph } from "./climb-glyph";
import { FlowerDrawing } from "./flower-symbol";
import { SurfaceFill } from "./surface-fill";
import { defaultMix, seedOf, type FlowerDrawSpec, type FlowerForm } from "@/lib/catalog/flower-draw";
import { barDrawing, bottleRadiusMm, BOTTLE_PITCH_MM, counterShelfMm, counterTopMm, type Strip } from "@/lib/catalog/bar-draw";
import { outlinePathD } from "@/lib/studio/geometry";
import { rugFringe, rugInset, type RugBows } from "@/lib/studio/rug-shape";

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
export const DEFAULT_TONE: Record<SymbolKind, string> = {
  candlestick: "#C9A24A",
  flowers: "#E8BCCE",
  centerpiece: "#E8BCCE",
  // Glass, which most of a vase shelf is; a gold or a white one says so through its shade.
  vase: "#EEF2F5",
  tree: LEAF,
  chair: "#F7F6FC",
  sofa: "#ECE7F5",
  chandelier: "#C9A24A",
  column: "#FAF9FD",
  fountain: WATER,
  arch: "#E8BCCE",
  chuppah: "#FBF7F1",
  bar: "#FFFFFF",
  runner: "#EFE3CF",
  // The plan's own inset well (--color-inset): a flight is floor, not furniture.
  stairs: "#FAF9FD",
  ramp: "#FAF9FD",
  // A banquette's top: the same quiet upholstery a sofa is.
  bench: "#ECE7F5",
  // A linen shade.
  lamp: "#FBF6EC",
  // Cast stone, which most gates hired for an event imitate.
  gate: "#F1ECE3",
};

export interface ItemSymbolProps {
  kind: SymbolKind;
  footprint: Footprint;
  /** Candles, arms, bulbs — symbolCount(). */
  count: number;
  /** For an arrangement or a centrepiece: which flowers, in what form and shade — the row's spec
   *  resolved by lib/catalog/flower-spec.ts (`flowerDrawSpecOf`, one object per row/size/shade, so
   *  this memoises). Absent = the default mix in `tone`, for a tile that has no row. */
  flowers?: FlowerDrawSpec;
  /** Whether a flower's inner detail is drawn at all — off for a sheet too small to print it. On
   *  screen the plan's zoom hides it by CSS instead (components/flower-symbol.tsx). */
  detail?: boolean;
  /** The item's colour (its shade's swatch, or its row's fill). Absent = the material's default. In
   *  print it is the flat fill the sheet asks for (the B&W booklet's grey), and absent = white. */
  tone?: string;
  /** The line colour. Screen: a soft ink; print: the sheet's ink. */
  ink?: string;
  /** Monochrome for the printed sheet: every line ink, every fill white (or `tone`) — legible
   *  photocopied. */
  print?: boolean;
  /** Hung from the ceiling: drawn, never filled, as FootprintShape draws anything overhead. */
  overhead?: boolean;
  /** Which chair, for a chair (symbolStyleOf). Absent = a dining chair, or a stool when round. */
  chairStyle?: ChairStyle;
  /** Which version of the picture (drawStyleOf) — a candlestick's, a chuppah's, a chandelier's, a
   *  gate's entrance… Absent = the category's default. */
  drawStyle?: DrawStyle;
  /** For a flight or a ramp: the height it climbs and which way (climbRise, lib/studio/climb-item.ts). */
  rise?: PlacementClimb & { heightMm: number };
  /** How the caller turns and flips the item — so a ramp's slope, written along it, reads upright. */
  turnDeg?: number;
  mirrored?: boolean;
  /** The size of words the picture writes (a ramp's slope), in the drawing's mm: the caller's screen
   *  or printed size. Absent = sized off the item itself, for a card or a drag image. */
  textMm?: number;
  /** For a banquette: how it is laid on THIS plan — which side is chairs, which a sofa, how many
   *  (lib/design-document/bench.ts). Absent = the default layout at its size (a card, a drag image):
   *  chairs along its back. `chairs: false` leaves the chairs off (a sheet that hides every chair). */
  bench?: BenchLayout;
  chairs?: boolean;
}

function ItemSymbolView({ kind, footprint, count, flowers, detail = true, tone, ink = "var(--color-ink-soft)", print, overhead, chairStyle, drawStyle, rise, turnDeg, mirrored, textMm, bench, chairs = true }: ItemSymbolProps) {
  const { w, h, round } = boxOf(footprint);
  // A bar of any shape — a ח, an oval ring, a horseshoe — is laid along its band (lib/catalog/
  // bar-draw.ts); every other picture is drawn in a box and needs a primitive one.
  const shaped = kind === "bar" && (footprint.kind === "custom" || footprint.kind === "multi");
  if (!shaped && (w <= 0 || h <= 0)) return null;
  const t = print ? tone || "#ffffff" : tone || DEFAULT_TONE[kind];
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
      body = candlestick(w, h, round, count, c, line, drawStyle as CandleStyle | undefined);
      break;
    case "lamp":
      body = lamp(w, h, round, c, line, drawStyle as LampStyle | undefined);
      break;
    case "flowers":
      body = <FlowerDrawing spec={flowers ?? plainFlowers(w, h, tone)} ink={ink} print={c.print} detail={detail} />;
      break;
    case "centerpiece":
      // The base it stands on, faint, under the flowers spilling over it.
      body = (
        <>
          {round && Math.abs(w - h) <= 1 && (
            <>
              <circle r={w / 2} fill={c.print ? "#ffffff" : "#F4F1F8"} {...line} strokeOpacity={line.strokeOpacity * 0.6} />
              <circle r={w * 0.43} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.35} />
            </>
          )}
          <FlowerDrawing spec={flowers ?? plainFlowers(w, h, tone)} ink={ink} print={c.print} detail={detail} />
        </>
      );
      break;
    case "vase":
      body = vase(w, h, round, c, line, drawStyle as VaseStyle | undefined);
      break;
    case "tree":
      body = tree(w, h, round, c, line, drawStyle as TreeStyle | undefined);
      break;
    case "chair":
      body = round ? pouf(w, h, c, line) : chair(w, h, chairStyle ?? "dining", c, line);
      break;
    case "sofa":
      body = round ? pouf(w, h, c, line) : sofa(w, h, c, line, drawStyle as SofaStyle | undefined);
      break;
    case "chandelier":
      body = chandelier(w, h, count, c, line, drawStyle as ChandelierStyle | undefined, ink, detail);
      break;
    case "column":
      body = column(w, h, round, c, line, drawStyle as ColumnStyle | undefined);
      break;
    case "fountain":
      body = fountain(w, h, round, c, line, drawStyle as FountainStyle | undefined);
      break;
    case "arch":
      body = along(w, h, (L, D) => arch(L, D, c, line, ink, detail, drawStyle as ArchStyle | undefined));
      break;
    case "gate":
      body = along(w, h, (L, D) => gate(L, D, c, line, drawStyle as GateStyle | undefined));
      break;
    case "chuppah":
      body = drawStyle === "rotunda" ? rotunda(w, h, c, line) : chuppah(w, h, round, c, line, ink, detail);
      break;
    case "bar":
      body = shaped ? shapedBar(footprint, c, line) : round ? roundBar(w, h, c, line) : along(w, h, (L, D) => bar(L, D, c, line));
      break;
    case "runner":
      body = along(w, h, (L, D) => runner(L, D, c, line));
      break;
    case "stairs":
    case "ramp":
      // The venue's own stairs' drawing (components/climb-glyph.tsx), so a rented flight and a built
      // one read the same: its edge and step lines a quiet ink, its walking line the strong one.
      body = (
        <ClimbGlyph
          f={{ kind, shape: "rect", widthMm: w, depthMm: h, heightMm: rise?.heightMm ?? 0, climb: rise }}
          fill={t}
          stroke={print ? ink : "var(--color-muted)"}
          strokeWidth={1}
          lineWidth={1}
          ink={ink}
          textSize={textMm ?? Math.min(w * 0.24, h * 0.3)}
          textFill={ink}
          alertFill={print ? ink : "var(--color-alert-ink)"}
          turnDeg={turnDeg}
          mirrored={mirrored}
        />
      );
      break;
    case "bench":
      body = benchSymbol(w, h, bench ?? benchLayout(w, h), chairs, c, line);
      break;
  }
  return <g className="pointer-events-none">{body}</g>;
}

/** A banquette standing on its own (lib/design-document/bench.ts), in its own frame — the strip is
 *  its top; along a chairs side the same chairs a table has, pushed in against it; along a sofa side
 *  the cushions inside the strip and the backrest line toward the other half. A stage's edge
 *  banquette is drawn by the stage (its chairs with the stage's Chair) and borrows SofaCushions. */
function benchSymbol(w: number, h: number, lay: BenchLayout, chairs: boolean, c: Colours, line: Line) {
  // A table's chair — the very drawing SeatChair is (chair(), turned so +x faces what it is pulled
  // up to), in the chair's own quiet tone, so a banquette's chairs match the tables' round the room.
  const seatTone = c.print ? "#ffffff" : "#F4F2F9";
  const seat: Colours = { ...c, tone: seatTone, inkOpacity: c.print ? 1 : 0.75, shade: c.print ? "#ffffff" : isDark(seatTone) ? "#ffffff" : c.ink };
  const seatLine = { ...line, strokeOpacity: seat.inkOpacity };
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(40, h * 0.1)} fill={c.tone} {...line} />
      {chairs &&
        lay.chairs.map((s, i) => (
          <g key={`chair-${i}`} transform={`translate(${s.x} ${s.y}) rotate(${s.facingDeg}) rotate(-90)`}>
            {chair(CHAIR_W_MM, CHAIR_D_MM, "dining", seat, seatLine)}
          </g>
        ))}
      {sofaCushions(lay.cushions, lay.backs, c, line)}
    </>
  );
}

function sofaCushions(cushions: Point[][], backs: [Point, Point][], c: Colours, line: Line) {
  if (cushions.length === 0 && backs.length === 0) return null;
  const shade = { fill: c.shade, fillOpacity: c.print ? 1 : c.shadeOpacity };
  return (
    <>
      {cushions.map((q, i) => (
        <polygon key={`c-${i}`} points={q.map((p) => `${p.x},${p.y}`).join(" ")} {...shade} {...line} strokeLinejoin="round" />
      ))}
      {backs.map(([a, b], i) => (
        <line key={`b-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...line} strokeWidth={c.print ? 1 : 2} strokeOpacity={1} strokeLinecap="round" />
      ))}
    </>
  );
}

/** A sofa side of a STAGE's edge banquette: its cushions and backrest where the stage laid them (in
 *  the stage's frame — EdgeItemShape.cushions/backs). Screen inks, or the sheet's ink in print. */
export function SofaCushions({ cushions, backs, ink = "var(--color-ink-soft)", print }: { cushions: Point[][]; backs: [Point, Point][]; ink?: string; print?: boolean }) {
  const c: Colours = {
    tone: print ? "#ffffff" : DEFAULT_TONE.bench,
    ink,
    inkOpacity: print ? 1 : 0.6,
    shade: print ? "#ffffff" : ink,
    shadeOpacity: print ? 1 : 0.14,
    print: !!print,
    overhead: false,
  };
  const line = { stroke: ink, strokeOpacity: c.inkOpacity, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
  return <g className="pointer-events-none">{sofaCushions(cushions, backs, c, line)}</g>;
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

/**
 * Flowers with no row behind them — an arch's garland, a chuppah's poles, a tile with no product:
 * the default mix (lib/catalog/flower-draw.ts) in the item's tone, at this size. Kept per
 * (form, size, tone) so the same object comes back and the drawing memoises; a plan has a handful
 * of these, not hundreds.
 */
const plain = new Map<string, FlowerDrawSpec>();
function plainFlowers(w: number, h: number, tone: string | undefined, form?: FlowerForm): FlowerDrawSpec {
  const f = form ?? (Math.max(w, h) >= Math.min(w, h) * 2.2 ? "runner" : "dome");
  const key = `${f}|${Math.round(w)}|${Math.round(h)}|${tone ?? ""}`;
  let spec = plain.get(key);
  if (!spec) {
    if (plain.size > 400) plain.clear();
    spec = { form: f, w: Math.round(w), h: Math.round(h), lines: defaultMix(), shade: tone, seed: seedOf(key) };
    plain.set(key, spec);
  }
  return spec;
}

// ── the pictures ────────────────────────────────────────────────────────────────────────────────

/** A candle piece, in its style (CandleStyle, lib/catalog/symbols.ts) — or, with none chosen, by its
 *  footprint: a long piece a row of candles on a bar, anything else its candles round a stem. Each
 *  candle wears its flame, which is what makes it read as light. `n` is the row's arms: candles,
 *  cylinders or glasses, whichever the style is made of. */
function candlestick(w: number, h: number, round: boolean, n: number, c: Colours, line: Line, style?: CandleStyle) {
  const long = !round && Math.max(w, h) / Math.min(w, h) >= 1.8;
  switch (style ?? (long ? "row" : "ring")) {
    case "row":
      return candleRow(w, h, n, long, false, c, line);
    case "sleeves":
      return long ? candleRow(w, h, n, long, true, c, line) : candleRing(w, h, n, true, c, line);
    case "tiered":
      return candleTiers(w, h, n, c, line);
    case "cluster":
      return glassCluster(w, h, n, "pillar", c, line);
    case "floating":
      return glassCluster(w, h, n, "float", c, line);
    case "powder":
      return glassCluster(w, h, n, "powder", c, line);
    case "pillars":
      return pillarTray(w, h, round, n, long, c, line);
    case "lantern":
      return lanterns(w, h, n, long, c, line);
    case "fire":
      return fireBurner(w, h, round, c, line);
    default:
      return candleRing(w, h, n, false, c, line);
  }
}

/** The arms of a candelabrum: the metal itself where it has a colour, a faint ink line where it is
 *  clear glass or white (drawn in its own near-white tone, the arms of a crystal piece vanished). */
function armLine(c: Colours, line: Line, width: number) {
  if (c.print) return { ...line, stroke: c.ink, strokeOpacity: 1, strokeWidth: width };
  return paleTone(c.tone) ? { ...line, strokeOpacity: 0.4, strokeWidth: width * 0.7 } : { ...line, stroke: c.tone, strokeOpacity: 1, strokeWidth: width };
}

/** Near-white — glass, white porcelain, crystal. */
function paleTone(t: string): boolean {
  const hex = t.trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((x) => x + x).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 225;
}

/** One candle seen from above: its wax, the flame, the bright heart of it — and, in a sleeve, the
 *  glass round it a little wider than the candle. */
function candleAt(key: string, x: number, y: number, r: number, c: Colours, line: Line, sleeve = false) {
  return (
    <g key={key}>
      {sleeve && <circle cx={x} cy={y} r={r * 1.75} fill={c.print ? "none" : "#ffffff"} fillOpacity={0.4} {...line} strokeOpacity={line.strokeOpacity * 0.6} />}
      <circle cx={x} cy={y} r={r} fill={c.tone} {...line} />
      <circle cx={x} cy={y} r={r * 0.5} fill={c.print ? "none" : FLAME} {...(c.print ? line : {})} />
      {!c.print && <circle cx={x} cy={y} r={r * 0.2} fill="#ffffff" fillOpacity={0.85} />}
    </g>
  );
}

/** Candles in a line — a long piece's bar, or a candelabrum whose arms stand in one plane (a classic
 *  five-arm piece is a line seen from above), standing on its round foot. */
function candleRow(w: number, h: number, n: number, long: boolean, sleeves: boolean, c: Colours, line: Line) {
  return along(w, h, (L, D) => {
    const r = Math.min(D * (sleeves ? 0.2 : 0.34), L / (n * (sleeves ? 3.8 : 2.3)));
    const span = L * (sleeves ? 0.78 : 0.84);
    const xs = Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -span / 2 + (i * span) / (n - 1)));
    const bar = long ? D * 0.24 : Math.min(D * 0.12, L * 0.05);
    return (
      <>
        {!long && <circle r={Math.min(D * 0.36, L * 0.16)} fill={c.tone} fillOpacity={c.print ? 1 : 0.35} {...line} />}
        <rect x={-L * 0.46} y={-bar / 2} width={L * 0.92} height={bar} rx={bar / 2} fill={c.tone} {...line} />
        {xs.map((x, i) => candleAt(`c${i}`, x, 0, r, c, line, sleeves))}
      </>
    );
  });
}

/** Candles round a central stem, joined to it by its arms — a centre candle on an odd count. */
function candleRing(w: number, h: number, n: number, sleeves: boolean, c: Colours, line: Line) {
  const R = Math.min(w, h) / 2;
  if (n <= 1) {
    return (
      <>
        <circle r={R * 0.92} fill={c.tone} fillOpacity={c.print ? 1 : 0.35} {...line} />
        {candleAt("c", 0, 0, R * (sleeves ? 0.32 : 0.5), c, line, sleeves)}
      </>
    );
  }
  const ring = n % 2 === 1 ? n - 1 : n;
  const reach = R * (sleeves ? 0.62 : 0.68);
  const r = Math.min(R * 0.21, ((Math.PI * reach) / ring) * 0.55) / (sleeves ? 1.6 : 1);
  const arms = Array.from({ length: ring }, (_, i) => polar(reach, -90 + (i * 360) / ring));
  return (
    <>
      {arms.map((p, i) => (
        <line key={`a${i}`} x1={0} y1={0} x2={p.x} y2={p.y} {...armLine(c, line, 2.5)} />
      ))}
      <circle r={R * 0.2} fill={c.tone} {...line} />
      {arms.map((p, i) => candleAt(`c${i}`, p.x, p.y, r, c, line, sleeves))}
      {n % 2 === 1 && candleAt("cc", 0, 0, r * 0.95, c, line, sleeves)}
    </>
  );
}

/** A tall crystal piece in tiers — the 13- and 25-arm candelabra: an outer ring of candles on its
 *  arms, a smaller ring above them turned half a step, one candle crowning the middle, and the
 *  crystal drops hanging between the outer arms. Too few candles for two rings is one ring. */
function candleTiers(w: number, h: number, n: number, c: Colours, line: Line) {
  if (n < 7) return candleRing(w, h, n, false, c, line);
  const R = Math.min(w, h) / 2;
  const rest = n - 1;
  const outer = Math.ceil(rest * 0.6);
  const inner = rest - outer;
  const outerAt = Array.from({ length: outer }, (_, i) => polar(R * 0.76, -90 + (i * 360) / outer));
  const innerAt = Array.from({ length: inner }, (_, i) => polar(R * 0.4, -90 + ((i + 0.5) * 360) / inner));
  const ro = Math.min(R * 0.13, ((Math.PI * R * 0.76) / outer) * 0.42);
  const ri = Math.min(R * 0.11, ((Math.PI * R * 0.4) / inner) * 0.42);
  const drops = Array.from({ length: outer }, (_, i) => polar(R * 0.9, -90 + ((i + 0.5) * 360) / outer));
  const arm = armLine(c, line, 2);
  return (
    <>
      {outerAt.map((p, i) => (
        <line key={`a${i}`} x1={0} y1={0} x2={p.x} y2={p.y} {...arm} />
      ))}
      <circle r={R * 0.4} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.5} strokeDasharray="3 3" />
      {drops.map((p, i) => (
        <circle key={`d${i}`} cx={p.x} cy={p.y} r={R * 0.035} fill={c.print ? "none" : "#ffffff"} {...line} strokeOpacity={line.strokeOpacity * 0.6} />
      ))}
      <circle r={R * 0.16} fill={c.tone} {...line} />
      {outerAt.map((p, i) => candleAt(`o${i}`, p.x, p.y, ro, c, line))}
      {innerAt.map((p, i) => candleAt(`i${i}`, p.x, p.y, ri, c, line))}
      {candleAt("cc", 0, 0, ro, c, line)}
    </>
  );
}

/** `n` circles of uneven sizes packed tight round the middle of a unit circle — a cluster of glass as
 *  a designer sets one: the biggest in the middle, the rest close round it, nothing overlapping.
 *  Kept per count, so a room of identical clusters packs once. */
const packs = new Map<number, { x: number; y: number; r: number }[]>();
const PACK_SIZES = [1, 0.84, 0.74, 0.92, 0.68, 0.8, 0.62, 0.88, 0.7, 0.78];
export function packCircles(count: number): { x: number; y: number; r: number }[] {
  const n = Math.max(1, Math.min(24, Math.round(count)));
  const hit = packs.get(n);
  if (hit) return hit;
  const base = 1 / Math.sqrt(n);
  const gap = base * 0.06;
  const placed: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = base * PACK_SIZES[i % PACK_SIZES.length];
    if (!placed.length) {
      placed.push({ x: 0, y: 0, r });
      continue;
    }
    let best = { x: 0, y: 0 };
    let bestScore = Infinity;
    for (const p of placed) {
      for (let a = 0; a < 360; a += 7.5) {
        const d = p.r + r + gap;
        const x = p.x + d * Math.cos((a * Math.PI) / 180);
        const y = p.y + d * Math.sin((a * Math.PI) / 180);
        if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + r + gap - 1e-9)) continue;
        const score = Math.hypot(x, y);
        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    placed.push({ ...best, r });
  }
  // Centred on its own box, and grown or shrunk to fill the unit circle.
  const minX = Math.min(...placed.map((p) => p.x - p.r));
  const maxX = Math.max(...placed.map((p) => p.x + p.r));
  const minY = Math.min(...placed.map((p) => p.y - p.r));
  const maxY = Math.max(...placed.map((p) => p.y + p.r));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const reach = Math.max(...placed.map((p) => Math.hypot(p.x - cx, p.y - cy) + p.r));
  const k = 0.96 / reach;
  const out = placed.map((p) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k, r: p.r * k }));
  packs.set(n, out);
  return out;
}

/** Glass cylinders packed in a cluster, each holding its candle: a pillar candle (a solitaire
 *  cluster), a floating candle on water, or powdered wax round a wick. The glass is the item's tone,
 *  see-through; its rim a second line inside the first. */
function glassCluster(w: number, h: number, n: number, fill: "pillar" | "float" | "powder", c: Colours, line: Line) {
  const m = Math.min(w, h) / 2;
  const faint = { ...line, strokeOpacity: line.strokeOpacity * 0.45 };
  return (
    <>
      {packCircles(n).map((g, i) => {
        const x = (g.x * w) / 2;
        const y = (g.y * h) / 2;
        const r = g.r * m;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill={c.print ? "#ffffff" : c.tone} fillOpacity={c.print ? 1 : 0.5} {...line} />
            <circle cx={x} cy={y} r={r * 0.86} fill="none" {...faint} />
            {fill === "pillar" && (
              <>
                <circle cx={x} cy={y} r={r * 0.56} fill={c.print ? "#ffffff" : "#FBF4E4"} {...faint} />
                <circle cx={x} cy={y} r={r * 0.22} fill={c.print ? "none" : FLAME} {...(c.print ? line : {})} />
              </>
            )}
            {fill === "float" && (
              <>
                <circle cx={x} cy={y} r={r * 0.86} fill={c.print ? "none" : WATER} fillOpacity={0.75} />
                <circle cx={x} cy={y} r={r * 0.64} fill="none" stroke={c.print ? c.ink : "#ffffff"} strokeOpacity={c.print ? 0.4 : 0.9} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />
                <circle cx={x} cy={y} r={r * 0.4} fill="#ffffff" {...faint} />
                <circle cx={x} cy={y} r={r * 0.17} fill={c.print ? "none" : FLAME} {...(c.print ? line : {})} />
              </>
            )}
            {fill === "powder" && (
              <>
                <circle cx={x} cy={y} r={r * 0.86} fill={c.print ? "#ffffff" : "#F3EADB"} />
                {Array.from({ length: 9 }, (_, j) => {
                  const p = polar(r * 0.72 * Math.sqrt((j + 0.5) / 9), j * 137.5 + i * 41);
                  return <circle key={j} cx={x + p.x} cy={y + p.y} r={r * 0.05} fill={c.ink} fillOpacity={c.print ? 0.6 : 0.22} />;
                })}
                <circle cx={x} cy={y} r={r * 0.18} fill={c.print ? "none" : FLAME} {...(c.print ? line : {})} />
              </>
            )}
          </g>
        );
      })}
    </>
  );
}

/** Pillar candles standing on a tray — round, or a long one for a runner of them. */
function pillarTray(w: number, h: number, round: boolean, n: number, long: boolean, c: Colours, line: Line) {
  const faint = { ...line, strokeOpacity: line.strokeOpacity * 0.45 };
  const tray = round ? (
    <>
      <ellipse rx={w / 2} ry={h / 2} fill={c.tone} {...line} />
      <ellipse rx={w * 0.44} ry={h * 0.44} fill="none" {...faint} />
    </>
  ) : (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(w, h) * 0.14} fill={c.tone} {...line} />
      <rect x={-w * 0.44} y={-h * 0.44} width={w * 0.88} height={h * 0.88} rx={Math.min(w, h) * 0.1} fill="none" {...faint} />
    </>
  );
  const pillar = (key: string, x: number, y: number, r: number) => (
    <g key={key}>
      <circle cx={x} cy={y} r={r} fill={c.print ? "#ffffff" : "#FBF4E4"} {...line} />
      <circle cx={x} cy={y} r={r * 0.3} fill={c.print ? "none" : FLAME} {...(c.print ? line : {})} />
    </g>
  );
  if (long) {
    return (
      <>
        {tray}
        {along(w, h, (L, D) => {
          const r = Math.min(D * 0.3, (L * 0.8) / (n * 2.3));
          const span = L * 0.8 - r * 2;
          return Array.from({ length: n }, (_, i) => pillar(`p${i}`, n === 1 ? 0 : -span / 2 + (i * span) / (n - 1), 0, r));
        })}
      </>
    );
  }
  return (
    <>
      {tray}
      {packCircles(n).map((g, i) => pillar(`p${i}`, (g.x * w) / 2 * 0.74, (g.y * h) / 2 * 0.74, g.r * (Math.min(w, h) / 2) * 0.74))}
    </>
  );
}

/** A lantern from above: its frame, the glass inside it, a post at each corner, the ring it is
 *  carried by — and the candle it holds. A long piece is a row of them. */
function lanterns(w: number, h: number, n: number, long: boolean, c: Colours, line: Line) {
  const one = (key: string, x: number, s: number) => (
    <g key={key} transform={`translate(${x} 0)`}>
      <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={s * 0.06} fill={c.tone} {...line} />
      <rect x={-s * 0.39} y={-s * 0.39} width={s * 0.78} height={s * 0.78} fill={c.print ? "#ffffff" : "#ffffff"} fillOpacity={c.print ? 1 : 0.55} {...line} strokeOpacity={line.strokeOpacity * 0.5} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => <rect key={`${sx}${sy}`} x={sx * s * 0.39 - s * 0.06} y={sy * s * 0.39 - s * 0.06} width={s * 0.12} height={s * 0.12} fill={c.tone} {...line} />))}
      {candleAt("c", 0, 0, s * 0.16, { ...c, tone: c.print ? "#ffffff" : "#FBF4E4" }, line)}
      <circle r={s * 0.27} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.4} strokeDasharray="3 3" />
    </g>
  );
  if (!long) return one("l", 0, Math.min(w, h) * 0.94);
  return along(w, h, (L, D) => {
    const s = Math.min(D * 0.94, (L / Math.max(1, n)) * 0.86);
    const span = L - s;
    return <>{Array.from({ length: Math.max(1, n) }, (_, i) => one(`l${i}`, n <= 1 ? 0 : -span / 2 + (i * span) / (n - 1), s))}</>;
  });
}

/** A fire feature: a burner trough down a long piece (a "שולחן אש" — the slot, its tongues of
 *  flame along it), or a fire bowl when round. Its count is not candles — the flames follow its length. */
function fireBurner(w: number, h: number, round: boolean, c: Colours, line: Line) {
  const burner = c.print ? "#ffffff" : "#3B3431";
  const tongue = (key: string, x: number, y: number, rx: number, ry: number, deg: number) => (
    <g key={key} transform={`translate(${x} ${y}) rotate(${deg})`}>
      <ellipse rx={rx} ry={ry} fill={c.print ? "none" : FLAME} fillOpacity={0.9} {...(c.print ? line : {})} />
      {!c.print && <ellipse rx={rx * 0.5} ry={ry * 0.45} fill="#FFE7A6" />}
    </g>
  );
  if (round) {
    const R = Math.min(w, h) / 2;
    const k = Math.max(6, Math.round((2 * Math.PI * R * 0.46) / 90));
    return (
      <>
        <ellipse rx={w / 2} ry={h / 2} fill={c.tone} {...line} />
        <ellipse rx={w * 0.36} ry={h * 0.36} fill={burner} {...line} />
        {Array.from({ length: k }, (_, i) => {
          const a = (i * 360) / k;
          const p = polar(R * 0.46, a);
          return tongue(`f${i}`, p.x * (w / 2 / R), p.y * (h / 2 / R), Math.min(R * 0.12, (Math.PI * R * 0.46) / k * 0.6), R * 0.07, a + 90);
        })}
      </>
    );
  }
  return along(w, h, (L, D) => {
    const slotL = L - D * 0.6;
    const k = Math.max(3, Math.floor(slotL / 130));
    const step = slotL / k;
    return (
      <>
        <rect x={-L / 2} y={-D / 2} width={L} height={D} rx={D * 0.2} fill={c.tone} {...line} />
        <rect x={-slotL / 2} y={-D * 0.2} width={slotL} height={D * 0.4} rx={D * 0.1} fill={burner} {...line} />
        {Array.from({ length: k }, (_, i) => tongue(`f${i}`, -slotL / 2 + step * (i + 0.5), (i % 2 ? 1 : -1) * D * 0.03, step * (i % 3 === 1 ? 0.48 : 0.4), D * (i % 2 ? 0.19 : 0.23), 0))}
      </>
    );
  });
}

/** A table lamp from above, in its style (LampStyle): by default an empire shade — the bottom rim,
 *  the smaller top rim, the light inside, the spider that holds the shade and the finial at its
 *  middle. A drum is one rim all the way down; a mushroom an opaque dome; a globe clear glass with
 *  its base showing through. A square shade is a square. */
function lamp(w: number, h: number, round: boolean, c: Colours, line: Line, style?: LampStyle) {
  const faint = { ...line, strokeOpacity: line.strokeOpacity * 0.5 };
  const R = Math.min(w, h) / 2;
  const ring = (k: number, props: object) =>
    round ? <ellipse rx={(w / 2) * k} ry={(h / 2) * k} {...props} /> : <rect x={(-w / 2) * k} y={(-h / 2) * k} width={w * k} height={h * k} rx={R * 0.08 * k} {...props} />;
  const spider = (k: number) =>
    [45, 135, 225, 315].map((deg) => {
      const p = polar(R * k, deg);
      return <line key={deg} x1={0} y1={0} x2={p.x * (round ? w / 2 / R : 1)} y2={p.y * (round ? h / 2 / R : 1)} {...faint} />;
    });
  switch (style) {
    case "drum":
      return (
        <>
          {ring(1, { fill: c.tone, ...line })}
          {ring(0.93, { fill: c.print ? "none" : "#F6D98E", fillOpacity: 0.3, ...faint })}
          {spider(0.9)}
          {!c.print && <circle r={R * 0.22} fill="#FFF4C9" fillOpacity={0.9} />}
          <circle r={R * 0.07} fill={c.tone} {...line} />
        </>
      );
    case "mushroom":
      // Opaque: nothing of the light shows from above, only the dome lit from the top left.
      return (
        <>
          {ring(1, { fill: c.tone, ...line })}
          {ring(0.72, { fill: "none", ...faint, strokeOpacity: line.strokeOpacity * 0.3 })}
          {!c.print && <ellipse cx={-R * 0.22} cy={-R * 0.24} rx={R * 0.34} ry={R * 0.26} fill="#ffffff" fillOpacity={0.4} />}
        </>
      );
    case "globe":
      return (
        <>
          {ring(1, { fill: c.print ? "#ffffff" : "#ffffff", fillOpacity: c.print ? 1 : 0.45, ...line })}
          {ring(0.46, { fill: c.tone, fillOpacity: c.print ? 0 : 0.5, ...faint, strokeDasharray: "3 3" })}
          {!c.print && <circle r={R * 0.24} fill="#FFF4C9" fillOpacity={0.95} />}
          <circle r={R * 0.08} fill="none" {...faint} />
          <path d={`M ${-R * 0.72} ${-R * 0.1} A ${R * 0.72} ${R * 0.72} 0 0 1 ${-R * 0.1} ${-R * 0.72}`} fill="none" {...line} stroke={c.print ? c.ink : "#ffffff"} strokeOpacity={c.print ? 0.4 : 0.95} strokeWidth={2} strokeLinecap="round" />
        </>
      );
    default:
      return (
        <>
          {ring(1, { fill: c.tone, ...line })}
          {!c.print && ring(0.8, { fill: "#F6D98E", fillOpacity: 0.3 })}
          {ring(0.64, { fill: "none", ...faint })}
          {spider(0.6)}
          {!c.print && <circle r={R * 0.18} fill="#FFF4C9" fillOpacity={0.9} />}
          <circle r={R * 0.07} fill={c.tone} {...line} />
        </>
      );
  }
}

/** A vessel — a vase, an urn, a footed bowl: its rim, the opening inside it in the shade's darker
 *  tone, and the foot showing faintly through. Empty, because what is arranged in it is its own item
 *  (a centrepiece, an arrangement) and is drawn by that one. An oval bowl is an oval rim. */
function vase(w: number, h: number, round: boolean, c: Colours, line: Line, style?: VaseStyle) {
  const ring = (k: number, props: object) =>
    round ? <ellipse rx={(w / 2) * k} ry={(h / 2) * k} {...props} /> : <rect x={(-w / 2) * k} y={(-h / 2) * k} width={w * k} height={h * k} rx={Math.min(w, h) * 0.12 * k} {...props} />;
  const soft = (k: number) => ({ ...line, strokeOpacity: line.strokeOpacity * k });
  const hollow = { fill: c.shade, fillOpacity: c.print ? 0 : c.shadeOpacity * 1.3 };
  switch (style) {
    case "cylinder":
      // Clear glass: the wall a thin double line, the floor of it seen through the water.
      return (
        <>
          {ring(1, { fill: c.tone, fillOpacity: c.print ? 1 : 0.45, ...line })}
          {ring(0.88, { fill: "none", ...soft(0.6) })}
          {ring(0.8, { fill: "none", ...soft(0.3), strokeDasharray: "3 3" })}
        </>
      );
    case "trumpet":
      // A wide cone narrowing to its stem: rings closing in on the middle, the foot hidden under it.
      return (
        <>
          {ring(1, { fill: c.tone, ...line })}
          {ring(0.92, { fill: "none", ...soft(0.6) })}
          {ring(0.66, { ...hollow, ...soft(0.4) })}
          {ring(0.4, { ...hollow, ...soft(0.4) })}
          {ring(0.56, { fill: "none", ...soft(0.3), strokeDasharray: "3 3" })}
          {ring(0.12, { fill: c.print ? "none" : c.ink, fillOpacity: 0.25, ...soft(0.6) })}
        </>
      );
    case "urn": {
      // The belly, the narrower neck and rim above it, the opening — and a handle either side.
      const hx = (w / 2) * 0.88;
      return (
        <>
          {[-1, 1].map((s) => (
            <ellipse key={s} cx={s * hx} cy={0} rx={w * 0.07} ry={h * 0.13} fill="none" {...line} strokeWidth={1.5} />
          ))}
          {ring(0.86, { fill: c.tone, ...soft(0.5) })}
          {ring(0.62, { fill: c.tone, ...line })}
          {ring(0.5, { ...hollow, ...soft(0.6) })}
        </>
      );
    }
    case "pedestal":
      // A shallow bowl: the rim, the bowl falling to its middle, the foot hidden under it.
      return (
        <>
          {ring(1, { fill: c.tone, ...line })}
          {ring(0.88, { fill: "none", ...soft(0.6) })}
          {ring(0.6, { ...hollow, ...soft(0.35) })}
          {ring(0.34, { fill: "none", ...soft(0.35), strokeDasharray: "3 3" })}
        </>
      );
    case "bowl":
      return (
        <>
          {ring(1, { fill: c.tone, ...line })}
          {ring(0.88, { ...hollow, ...soft(0.6) })}
          {ring(0.5, { fill: "none", ...soft(0.3) })}
        </>
      );
    default:
      return (
        <>
          {ring(1, { fill: c.tone, ...line })}
          {ring(0.8, { ...hollow, ...line, strokeOpacity: line.strokeOpacity * 0.6 })}
          {ring(0.32, { fill: "none", ...line, strokeOpacity: line.strokeOpacity * 0.35 })}
        </>
      );
  }
}

/** [radius, bearing] of each clump of a canopy, as fractions of its radius. */
export const TREE_CLUMPS: [number, number][] = [
  [0.4, 0], [0.33, 44], [0.38, 80], [0.42, 122], [0.34, 166], [0.39, 204], [0.35, 246], [0.41, 284], [0.36, 326],
];

const TRUNK = "#8A6A4F";

/** A tree from above, in its style (TreeStyle). The canopy is the default; the others are drawn in
 *  a unit disc scaled onto the canopy, so an oval canopy stays an oval of the same tree. Each
 *  species keeps its own green until the row or its shade gives it a colour. */
function tree(w: number, h: number, round: boolean, c: Colours, line: Line, style?: TreeStyle) {
  if (!style || style === "canopy") return canopy(w, h, c, line);
  const own = c.tone === DEFAULT_TONE.tree;
  const soft = { ...line, strokeOpacity: line.strokeOpacity * 0.5 };
  const trunk = c.print ? "#ffffff" : TRUNK;
  const unit = (body: ReactNode) => <g transform={`scale(${w / 2} ${h / 2})`}>{body}</g>;
  switch (style) {
    case "olive": {
      // An open, silvery crown — small clumps with the sky between them — over a split trunk.
      const leaf = own && !c.print ? "#A9B48F" : c.tone;
      return unit(
        <>
          {OLIVE_CLUMPS.map(([r, deg, d], i) => {
            const p = polar(d, deg);
            return <circle key={i} cx={p.x} cy={p.y} r={r} fill={leaf} {...soft} />;
          })}
          {[[-0.06, 0.03], [0.07, -0.02], [0.01, 0.08]].map(([x, y], i) => (
            <circle key={`t${i}`} cx={x} cy={y} r={0.055} fill={trunk} {...line} />
          ))}
        </>,
      );
    }
    case "blossom": {
      // The canopy in blossom, and the flowers over it.
      const crown = own && !c.print ? "#F6DCE5" : c.tone;
      const bloom = c.print ? "#ffffff" : own ? "#E58FB0" : "#ffffff";
      return (
        <>
          {canopy(w, h, { ...c, tone: crown }, line)}
          {unit(
            BLOSSOMS.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.035} fill={bloom} fillOpacity={c.print ? 1 : 0.95} {...(c.print ? soft : {})} />),
          )}
        </>
      );
    }
    case "palm": {
      // Fronds from one crown: each a long leaf, its midrib, and leaflets down both sides.
      const leaf = own && !c.print ? "#6E9B57" : c.tone;
      const N = 9;
      return unit(
        <>
          {Array.from({ length: N }, (_, i) => {
            const deg = i * (360 / N) + (i % 2 ? 9 : -4);
            const L = i % 3 === 1 ? 0.86 : 0.98;
            return (
              <g key={i} transform={`rotate(${deg})`}>
                <path d={`M 0.08 0 Q ${L * 0.5} -0.17 ${L} 0 Q ${L * 0.5} 0.17 0.08 0 Z`} fill={leaf} {...soft} />
                <line x1={0.08} y1={0} x2={L} y2={0} {...soft} />
                {[0.28, 0.42, 0.56, 0.7, 0.84].filter((t) => t < L - 0.06).map((t) => {
                  const half = 0.15 * Math.sin((Math.PI * (t - 0.08)) / (L - 0.08));
                  return <path key={t} d={`M ${t} ${-half} L ${t - 0.06} 0 L ${t} ${half}`} fill="none" {...soft} strokeOpacity={line.strokeOpacity * 0.35} />;
                })}
              </g>
            );
          })}
          <circle r={0.1} fill={trunk} {...line} />
        </>,
      );
    }
    case "cypress": {
      // Narrow and upright: from above a tight, spiky star of foliage round the leader.
      const leaf = own && !c.print ? "#4F7A4A" : c.tone;
      const star = (out: number, inn: number, turn: number) =>
        Array.from({ length: 28 }, (_, i) => {
          const p = polar(i % 2 ? inn : out, turn + i * (360 / 28));
          return `${i ? "L" : "M"} ${p.x} ${p.y}`;
        }).join(" ") + " Z";
      return unit(
        <>
          <path d={star(1, 0.78, 0)} fill={leaf} {...soft} strokeLinejoin="round" />
          <path d={star(0.62, 0.44, 6)} fill={c.shade} fillOpacity={c.print ? 0 : c.shadeOpacity} {...soft} strokeOpacity={line.strokeOpacity * 0.3} />
          <circle r={0.08} fill={trunk} {...line} />
        </>,
      );
    }
    case "topiary":
      // A clipped ball: one clean round, lit from the top left, its clipped surface a fine stipple.
      return unit(
        <>
          <circle r={1} fill={c.tone} {...line} />
          {BLOSSOMS.slice(0, 22).map((p, i) => (
            <circle key={i} cx={p.x * 0.92} cy={p.y * 0.92} r={0.03} fill={c.print ? "none" : c.shade} fillOpacity={c.shadeOpacity * 1.6} {...(c.print ? soft : {})} />
          ))}
          <circle r={0.8} fill="none" {...soft} strokeOpacity={line.strokeOpacity * 0.25} />
          {!c.print && <ellipse cx={-0.3} cy={-0.32} rx={0.34} ry={0.26} fill="#ffffff" fillOpacity={0.3} />}
        </>,
      );
    case "potted": {
      // Broad leaves over the rim of their pot, the soil showing between them.
      const pot = c.print ? "#ffffff" : "#C98F6B";
      const N = 7;
      return unit(
        <>
          {round ? <circle r={0.62} fill={pot} {...line} /> : <rect x={-0.62} y={-0.62} width={1.24} height={1.24} rx={0.06} fill={pot} {...line} />}
          {round ? <circle r={0.53} fill={c.print ? "none" : "#6B5444"} fillOpacity={0.55} {...soft} /> : <rect x={-0.53} y={-0.53} width={1.06} height={1.06} fill={c.print ? "none" : "#6B5444"} fillOpacity={0.55} {...soft} />}
          {Array.from({ length: N }, (_, i) => (
            <g key={i} transform={`rotate(${i * (360 / N) + 12})`}>
              <ellipse cx={0.5} cy={0} rx={0.46} ry={0.18} fill={c.tone} {...soft} />
              <line x1={0.08} y1={0} x2={0.92} y2={0} {...soft} strokeOpacity={line.strokeOpacity * 0.35} />
            </g>
          ))}
        </>,
      );
    }
  }
  return canopy(w, h, c, line);
}

/** [radius, bearing, distance] of each clump of an olive's crown, in the unit disc. */
const OLIVE_CLUMPS: [number, number, number][] = [
  [0.2, 8, 0.76], [0.17, 38, 0.72], [0.22, 70, 0.74], [0.18, 104, 0.78], [0.21, 140, 0.7], [0.17, 172, 0.76],
  [0.2, 206, 0.73], [0.18, 238, 0.78], [0.22, 270, 0.72], [0.17, 302, 0.77], [0.2, 334, 0.71],
  [0.2, 20, 0.36], [0.18, 110, 0.4], [0.21, 196, 0.34], [0.18, 286, 0.4], [0.16, 0, 0],
];

/** Points scattered evenly over the unit disc (a sunflower spiral) — blossoms, a clipped stipple. */
const BLOSSOMS = Array.from({ length: 46 }, (_, i) => polar(0.9 * Math.sqrt((i + 0.5) / 46), i * 137.508));

/** The default tree: its canopy — a ring of overlapping clumps round a fuller middle, in the tree's
 *  colour (white for a blossom tree, through its shade) — and the trunk at the centre. */
function canopy(w: number, h: number, c: Colours, line: Line) {
  const rx = w / 2;
  const ry = h / 2;
  // Uneven on purpose — nine equal lobes read as a flower, not a tree. Each clump touches the edge.
  const clumps = TREE_CLUMPS.map(([r, deg]) => ({ r, ...polar(1 - r, deg) }));
  const soft = { ...line, strokeOpacity: line.strokeOpacity * 0.5 };
  return (
    <>
      {clumps.map((p, i) => (
        <ellipse key={i} cx={p.x * rx} cy={p.y * ry} rx={rx * p.r} ry={ry * p.r} fill={c.tone} {...soft} />
      ))}
      <ellipse rx={rx * 0.62} ry={ry * 0.62} fill={c.tone} />
      <ellipse rx={rx * 0.4} ry={ry * 0.4} fill={c.shade} fillOpacity={c.print ? 0 : c.shadeOpacity} {...soft} strokeOpacity={line.strokeOpacity * 0.25} />
      <circle r={Math.min(rx, ry) * 0.07} fill={c.print ? "#ffffff" : "#8A6A4F"} {...line} />
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
  tone,
  ink = "var(--color-muted)",
  print,
}: {
  widthMm: number;
  depthMm: number;
  style?: ChairStyle;
  /** Absent = the neutral chair on screen, white in print. */
  tone?: string;
  ink?: string;
  print?: boolean;
}) {
  const t = tone || (print ? "#ffffff" : "#F4F2F9");
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

/** A sofa in its style (SofaStyle) — back at −y, the seat toward +y, like a chair. */
function sofa(w: number, h: number, c: Colours, line: Line, style?: SofaStyle) {
  switch (style) {
    case "chesterfield":
      return chesterfield(w, h, c, line);
    case "corner":
      return cornerSofa(w, h, c, line);
    case "curved":
      return curvedSofa(w, h, c, line);
    case "armless":
      return armlessSofa(w, h, c, line);
    case "ottoman":
      return ottoman(w, h, c, line);
    default:
      return classicSofa(w, h, c, line);
  }
}

/** Seat cushions laid along a run from (x0, y0) to (x1, y1), one about every 65cm, a gap between. */
function cushionRun(key: string, x0: number, y0: number, x1: number, y1: number, alongX: boolean, c: Colours, line: Line) {
  const gap = 25;
  const len = alongX ? x1 - x0 : y1 - y0;
  const n = Math.max(1, Math.round(len / 650));
  const each = (len - gap * (n - 1)) / n;
  if (each <= 40 || (alongX ? y1 - y0 : x1 - x0) <= 40) return null;
  return Array.from({ length: n }, (_, i) => {
    const a = (alongX ? x0 : y0) + i * (each + gap);
    const x = alongX ? a : x0;
    const y = alongX ? y0 : a;
    const cw = alongX ? each : x1 - x0;
    const ch = alongX ? y1 - y0 : each;
    return <rect key={`${key}${i}`} x={x} y={y} width={cw} height={ch} rx={Math.min(cw, ch) * 0.18} fill={c.tone} {...line} strokeOpacity={line.strokeOpacity * 0.6} />;
  });
}

/** Tufting: a staggered grid of buttons over a box, about every `pitch` mm. */
function buttons(key: string, x0: number, y0: number, x1: number, y1: number, pitch: number, c: Colours, line: Line) {
  const cols = Math.max(1, Math.round((x1 - x0) / pitch));
  const rows = Math.max(1, Math.round((y1 - y0) / pitch));
  const r = Math.min(16, pitch * 0.09);
  const out: ReactNode[] = [];
  for (let j = 0; j < rows; j++) {
    // Every other row sits half a step over, between the buttons of the row before it.
    const stagger = j % 2 === 1 && cols > 1;
    for (let i = 0; i < (stagger ? cols - 1 : cols); i++) {
      const x = x0 + ((i + (stagger ? 1 : 0.5)) * (x1 - x0)) / cols;
      out.push(<circle key={`${key}${j}-${i}`} cx={x} cy={y0 + ((j + 0.5) * (y1 - y0)) / rows} r={r} fill={c.print ? "none" : c.shade} fillOpacity={isDark(c.tone) ? 0.5 : 0.35} {...(c.print ? line : {})} />);
    }
  }
  return out;
}

/** A Chesterfield: arms rolled as high as its back, both buttoned, one long seat cushion. */
function chesterfield(w: number, h: number, c: Colours, line: Line) {
  const back = Math.min(h * 0.24, 230);
  const arm = Math.min(w * 0.12, 220, h * 0.3);
  const gap = 25;
  const shade = { fill: c.shade, fillOpacity: c.print ? 1 : c.shadeOpacity };
  const faint = { ...line, strokeOpacity: line.strokeOpacity * 0.5 };
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={arm * 0.5} fill={c.tone} {...line} />
      <rect x={-w / 2} y={-h / 2} width={w} height={back} rx={back * 0.45} {...shade} />
      <rect x={-w / 2} y={-h / 2} width={arm} height={h} rx={arm * 0.5} {...shade} {...faint} />
      <rect x={w / 2 - arm} y={-h / 2} width={arm} height={h} rx={arm * 0.5} {...shade} {...faint} />
      {buttons("b", -w / 2 + arm, -h / 2, w / 2 - arm, -h / 2 + back, 140, c, line)}
      <rect x={-w / 2 + arm + gap} y={-h / 2 + back + gap} width={w - 2 * (arm + gap)} height={h - back - 2 * gap} rx={Math.min(arm, back) * 0.4} fill={c.tone} {...faint} />
    </>
  );
}

/** An L — a corner sofa: a back along the back edge and down the left side, a seat in the corner,
 *  an arm at the end of each run. */
function cornerSofa(w: number, h: number, c: Colours, line: Line) {
  const sd = Math.min(950, h * 0.55, w * 0.4);
  const back = Math.min(sd * 0.28, 260);
  const arm = Math.min(200, sd * 0.25);
  const gap = 25;
  const top = -h / 2;
  const left = -w / 2;
  const shade = { fill: c.shade, fillOpacity: c.print ? 1 : c.shadeOpacity };
  const faint = { ...line, strokeOpacity: line.strokeOpacity * 0.5 };
  const L = (k: number) =>
    `M ${left} ${top} L ${w / 2} ${top} L ${w / 2} ${top + k} L ${left + k} ${top + k} L ${left + k} ${h / 2} L ${left} ${h / 2} Z`;
  return (
    <>
      <path d={L(sd)} fill={c.tone} {...line} strokeLinejoin="round" />
      <path d={L(back)} {...shade} />
      <rect x={w / 2 - arm} y={top} width={arm} height={sd} rx={arm * 0.45} {...shade} {...faint} />
      <rect x={left} y={h / 2 - arm} width={sd} height={arm} rx={arm * 0.45} {...shade} {...faint} />
      {cushionRun("r", left + sd + gap, top + back + gap, w / 2 - arm - gap, top + sd - gap, true, c, line)}
      {cushionRun("k", left + back + gap, top + back + gap, left + sd - gap, top + sd - gap, true, c, line)}
      {cushionRun("l", left + back + gap, top + sd + gap, left + sd - gap, h / 2 - arm - gap, false, c, line)}
    </>
  );
}

/** A curved sofa: a band on an arc, its back along the outside, the cushions cut across it. */
function curvedSofa(w: number, h: number, c: Colours, line: Line) {
  const sd = Math.min(h * 0.62, 900, w * 0.35);
  const back = Math.min(sd * 0.3, 240);
  const y = h / 2;
  const band = (rxOut: number, ryOut: number, rxIn: number, ryIn: number) =>
    `M ${-rxOut} ${y} A ${rxOut} ${ryOut} 0 0 1 ${rxOut} ${y} L ${rxIn} ${y} A ${rxIn} ${ryIn} 0 0 0 ${-rxIn} ${y} Z`;
  const [rx0, ry0] = [w / 2, h];
  const [rx1, ry1] = [w / 2 - back, h - back];
  const [rx2, ry2] = [w / 2 - sd, h - sd];
  const n = Math.max(2, Math.round((Math.PI * ((rx1 + rx2) / 2 + (ry1 + ry2) / 2)) / 2 / 700));
  const at = (rx: number, ry: number, t: number) => ({ x: rx * Math.cos(t), y: y - ry * Math.sin(t) });
  return (
    <>
      <path d={band(rx0, ry0, rx2, ry2)} fill={c.tone} {...line} strokeLinejoin="round" />
      <path d={band(rx0, ry0, rx1, ry1)} fill={c.shade} fillOpacity={c.print ? 1 : c.shadeOpacity} />
      {Array.from({ length: n - 1 }, (_, i) => {
        const t = Math.PI - ((i + 1) * Math.PI) / n;
        const a = at(rx1, ry1, t);
        const b = at(rx2, ry2, t);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...line} strokeOpacity={line.strokeOpacity * 0.6} />;
      })}
    </>
  );
}

/** Armless modules pushed together: one back along them, a seam where each module meets the next. */
function armlessSofa(w: number, h: number, c: Colours, line: Line) {
  const back = Math.min(h * 0.28, 260);
  const n = Math.max(1, Math.round(w / 800));
  const gap = 25;
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={back * 0.3} fill={c.tone} {...line} />
      <rect x={-w / 2} y={-h / 2} width={w} height={back} rx={back * 0.3} fill={c.shade} fillOpacity={c.print ? 1 : c.shadeOpacity} />
      {Array.from({ length: n }, (_, i) => {
        const x0 = -w / 2 + (i * w) / n;
        return (
          <g key={i}>
            {i > 0 && <line x1={x0} y1={-h / 2} x2={x0} y2={h / 2} {...line} strokeOpacity={line.strokeOpacity * 0.7} />}
            <rect x={x0 + gap} y={-h / 2 + back + gap} width={w / n - 2 * gap} height={h - back - 2 * gap} rx={Math.min(w / n, h) * 0.08} fill={c.tone} {...line} strokeOpacity={line.strokeOpacity * 0.5} />
          </g>
        );
      })}
    </>
  );
}

/** A backless upholstered bench — a long ottoman: its piping and its buttons. */
function ottoman(w: number, h: number, c: Colours, line: Line) {
  const m = Math.min(w, h);
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={m * 0.18} fill={c.tone} {...line} />
      <rect x={-w / 2 + m * 0.08} y={-h / 2 + m * 0.08} width={w - m * 0.16} height={h - m * 0.16} rx={m * 0.12} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.4} />
      {buttons("o", -w / 2 + m * 0.08, -h / 2 + m * 0.08, w / 2 - m * 0.08, h / 2 - m * 0.08, 200, c, line)}
    </>
  );
}

/** The default sofa: the back along its back edge, an arm at each end, and its seat cushions between them. */
function classicSofa(w: number, h: number, c: Colours, line: Line) {
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
 *  because the thing is overhead and a filled shape reads as something you walk round. The other
 *  styles (ChandelierStyle) keep to the same rule: metal as heavy lines, glass and light as tints. */
function chandelier(w: number, h: number, n: number, c: Colours, line: Line, style?: ChandelierStyle, ink?: string, detail?: boolean) {
  const R = Math.min(w, h) / 2;
  const count = Math.max(3, n);
  // Clear crystal or white has no colour to draw its metal in — drawn in its own tone it vanished
  // into the cloth under it — so a pale piece is drawn in a soft ink, its bulbs as warm light.
  const pale = !c.print && paleTone(c.tone);
  const stroke = c.print || pale ? c.ink : c.tone;
  // On screen the arms and bulbs are drawn a touch heavier than the rest of the plan's hairlines:
  // the thing floats over a table drawn in the same greys, and at hall zoom a 1px gold line on a
  // grey cloth was the one item on the plan a designer could not find.
  const sw = c.print ? 1.5 : 2;
  const metal = { ...line, stroke, strokeOpacity: pale ? 0.6 : 0.95, strokeWidth: sw };
  const glow = (key: string, x: number, y: number, r: number) => (
    <circle
      key={key}
      cx={x}
      cy={y}
      r={r}
      fill={c.print ? "none" : pale ? "#FFE9A8" : stroke}
      fillOpacity={c.print ? undefined : pale ? 0.95 : 0.35}
      {...line}
      stroke={stroke}
      strokeOpacity={pale ? 0.6 : 1}
      strokeWidth={sw}
    />
  );
  const ringAt = (k: number, m: number, turn = -90) => Array.from({ length: m }, (_, i) => polar(R * k, turn + (i * 360) / m));
  switch (style) {
    case "crystal": {
      // Rings of drops round the lights — the outer one the widest, the second turned half a drop.
      const bulbs = ringAt(0.48, count);
      const bulb = Math.min(R * 0.08, ((Math.PI * R * 0.48) / count) * 0.35);
      const drop = (key: string, p: { x: number; y: number }, r: number) => (
        <circle key={key} cx={p.x} cy={p.y} r={r} fill={c.print ? "none" : "#ffffff"} fillOpacity={0.75} {...line} stroke={stroke} strokeOpacity={0.8} />
      );
      return (
        <>
          <circle r={R * 0.9} fill="none" {...line} strokeOpacity={c.print ? line.strokeOpacity : 0.5} strokeDasharray="4 3" />
          {ringAt(0.9, 32).map((p, i) => drop(`o${i}`, p, R * 0.042))}
          {ringAt(0.72, 24, -90 + 7.5).map((p, i) => drop(`m${i}`, p, R * 0.036))}
          {bulbs.map((p, i) => (
            <line key={`a${i}`} x1={0} y1={0} x2={p.x} y2={p.y} {...metal} />
          ))}
          {bulbs.map((p, i) => glow(`b${i}`, p.x, p.y, bulb))}
          {ringAt(0.26, 12, -75).map((p, i) => drop(`i${i}`, p, R * 0.03))}
          <circle r={R * 0.12} fill="none" {...metal} />
        </>
      );
    }
    case "hoop": {
      // One ring of light, its lamps along it, hung from a plate in the middle by three cables.
      const bulbs = ringAt(0.9, count);
      return (
        <>
          {ringAt(0.9, 3, -60).map((p, i) => (
            <line key={`k${i}`} x1={0} y1={0} x2={p.x} y2={p.y} {...line} strokeOpacity={c.print ? line.strokeOpacity : 0.7} strokeDasharray="3 3" />
          ))}
          <circle r={R * 0.9} fill="none" {...metal} strokeWidth={sw * 1.5} />
          {bulbs.map((p, i) => glow(`b${i}`, p.x, p.y, Math.min(R * 0.06, ((Math.PI * R * 0.9) / count) * 0.3)))}
          <circle r={R * 0.08} fill="none" {...metal} />
        </>
      );
    }
    case "sputnik": {
      // A sphere with rods out to every side, a bulb on each — some reaching further than others,
      // because half of them point up or down.
      const m = Math.max(12, count);
      const rods = Array.from({ length: m }, (_, i) => polar(R * (0.6 + 0.36 * (((i * 7) % 5) / 4)), i * 137.508));
      return (
        <>
          {rods.map((p, i) => (
            <line key={`r${i}`} x1={0} y1={0} x2={p.x} y2={p.y} {...metal} strokeWidth={sw * 0.75} />
          ))}
          {rods.map((p, i) => glow(`b${i}`, p.x, p.y, R * 0.05))}
          <circle r={R * 0.17} fill={c.print ? "none" : pale ? "#ffffff" : stroke} fillOpacity={c.print ? undefined : pale ? 0.8 : 0.3} {...metal} />
        </>
      );
    }
    case "pendants": {
      // Globes of different sizes hung from one canopy plate, each with its bulb.
      return (
        <>
          <circle r={R * 0.98} fill="none" {...line} strokeOpacity={c.print ? line.strokeOpacity : 0.45} strokeDasharray="4 3" />
          {packCircles(count).map((g, i) => {
            const x = (g.x * w) / 2;
            const y = (g.y * h) / 2;
            const r = g.r * R * 0.94;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={r} fill={c.print ? "none" : pale ? "#ffffff" : stroke} fillOpacity={c.print ? undefined : pale ? 0.7 : 0.16} {...metal} strokeWidth={sw * 0.75} />
                {glow(`b${i}`, x, y, r * 0.24)}
              </g>
            );
          })}
        </>
      );
    }
    case "linear":
      // A long bar with its lamps in a row under it, hung by a cable near each end.
      return along(w, h, (L, D) => {
        const m = Math.max(2, count);
        const r = Math.min(D * 0.34, (L * 0.9) / (m * 3.2));
        const span = L * 0.9 - r * 2;
        return (
          <>
            <rect x={-L * 0.47} y={-D * 0.07} width={L * 0.94} height={D * 0.14} rx={D * 0.07} fill="none" {...metal} />
            {[-1, 1].map((s) => (
              <circle key={s} cx={s * L * 0.32} cy={0} r={D * 0.12} fill="none" {...line} strokeOpacity={c.print ? line.strokeOpacity : 0.7} strokeDasharray="3 3" />
            ))}
            {Array.from({ length: m }, (_, i) => glow(`b${i}`, -span / 2 + (i * span) / (m - 1), 0, r))}
          </>
        );
      });
    case "floral": {
      // A hoop wound with greenery, clusters of flowers on it and its lights between them.
      const k = 5;
      const leaf = c.print ? "#ffffff" : LEAF;
      return (
        <>
          <circle r={R * 0.8} fill="none" {...metal} strokeWidth={sw * 1.4} />
          {Array.from({ length: 18 }, (_, i) => {
            const deg = i * 20;
            const p = polar(R * (i % 2 ? 0.86 : 0.74), deg);
            return <ellipse key={`l${i}`} cx={p.x} cy={p.y} rx={R * 0.11} ry={R * 0.045} transform={`rotate(${deg + 90 + (i % 2 ? 25 : -25)} ${p.x} ${p.y})`} fill={leaf} fillOpacity={c.print ? 1 : 0.85} {...line} strokeOpacity={line.strokeOpacity * 0.5} />;
          })}
          {ringAt(0.8, k, -72).map((p, i) => (
            <g key={`f${i}`} transform={`translate(${p.x} ${p.y})`}>
              <FlowerDrawing spec={plainFlowers(R * 0.42, R * 0.42, undefined, "dome")} ink={ink} print={c.print} detail={detail} />
            </g>
          ))}
          {ringAt(0.8, k, -36).map((p, i) => glow(`b${i}`, p.x, p.y, R * 0.05))}
        </>
      );
    }
  }
  const arms = ringAt(0.74, count);
  const bulb = Math.min(R * 0.1, ((Math.PI * R * 0.74) / arms.length) * 0.35);
  return (
    <>
      <circle r={R * 0.48} fill="none" {...line} strokeOpacity={c.print ? line.strokeOpacity : 0.8} strokeDasharray="4 3" />
      {arms.map((p, i) => (
        <line key={`a${i}`} x1={0} y1={0} x2={p.x} y2={p.y} {...metal} />
      ))}
      {arms.map((p, i) => glow(`b${i}`, p.x, p.y, bulb))}
      <circle r={R * 0.13} fill="none" {...metal} strokeOpacity={pale ? metal.strokeOpacity : 1} />
    </>
  );
}

/** A column, in its style (ColumnStyle): by default its plinth, the fluted shaft standing on it, and
 *  the capital at the top. A smooth one stands on a round base; a square pillar is square all the
 *  way up; a display pedestal is a block under its top plate. */
function column(w: number, h: number, round: boolean, c: Colours, line: Line, style?: ColumnStyle) {
  const R = Math.min(w, h) / 2;
  const faint = { ...line, strokeOpacity: line.strokeOpacity * 0.5 };
  const box = (k: number, props: object) => <rect x={(-w / 2) * k} y={(-h / 2) * k} width={w * k} height={h * k} {...props} />;
  // A display pedestal is round or square as its footprint is; a square pillar is square regardless.
  const block = (k: number, props: object) => (round ? <ellipse rx={(w / 2) * k} ry={(h / 2) * k} {...props} /> : box(k, { rx: R * 0.04 * k, ...props }));
  switch (style) {
    case "smooth":
      return (
        <>
          <ellipse rx={w / 2} ry={h / 2} fill={c.tone} {...line} />
          <ellipse rx={w * 0.43} ry={h * 0.43} fill="none" {...faint} />
          <circle r={R * 0.74} fill={c.tone} {...line} />
          <circle r={R * 0.6} fill="none" {...faint} />
          {!c.print && <ellipse cx={-R * 0.22} cy={-R * 0.22} rx={R * 0.24} ry={R * 0.16} fill="#ffffff" fillOpacity={0.5} />}
        </>
      );
    case "square":
      // Plinth, capital and — hidden under the capital — the shaft; the capital's corners chamfered
      // down to the plinth's.
      return (
        <>
          {box(1, { fill: c.tone, ...line })}
          {[-1, 1].flatMap((sx) => [-1, 1].map((sy) => <line key={`${sx}${sy}`} x1={(sx * w) / 2} y1={(sy * h) / 2} x2={(sx * w * 0.8) / 2} y2={(sy * h * 0.8) / 2} {...faint} />))}
          {box(0.8, { fill: c.tone, ...line })}
          {box(0.58, { fill: "none", ...faint, strokeDasharray: "3 3" })}
        </>
      );
    case "pedestal":
      // A display block: its top plate, the body under it hidden by the plate.
      return (
        <>
          {block(1, { fill: c.tone, ...line })}
          {block(0.86, { fill: "none", ...faint, strokeDasharray: "3 3" })}
          {block(0.94, { fill: "none", ...faint, strokeOpacity: line.strokeOpacity * 0.3 })}
        </>
      );
  }
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

/** A fountain, in its style (FountainStyle): by default the basin, its rim, the bowl in the middle
 *  and the spout — and the rings on the water. Tiered is three bowls one over the other; jets a pool
 *  with its jets in a row; a bowl one raised stone bowl brimming over. */
function fountain(w: number, h: number, round: boolean, c: Colours, line: Line, style?: FountainStyle) {
  const water = c.print ? "#ffffff" : c.tone === DEFAULT_TONE.fountain ? WATER : c.tone;
  const ripple = { fill: "none", stroke: c.print ? c.ink : "#ffffff", strokeOpacity: c.print ? 0.5 : 0.9, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
  const R = Math.min(w, h) / 2;
  // The basin holds the same water the venue's pool is drawn in (components/surface-fill.tsx) — a
  // flat blue disc beside a textured pool read as a lid. The item's own tone tints it; the printed
  // sheet keeps the flat white basin. One seed for every fountain: its ripples are not a signature.
  const pool = (bw: number, bh: number, rx: number) => {
    const basin: Footprint = round ? { kind: "ellipse", widthMm: bw, depthMm: bh } : { kind: "rect", widthMm: bw, depthMm: bh };
    const edge = (fill: string) => (round ? <ellipse rx={bw / 2} ry={bh / 2} fill={fill} {...line} /> : <rect x={-bw / 2} y={-bh / 2} width={bw} height={bh} rx={rx} fill={fill} {...line} />);
    return c.print ? (
      edge(water)
    ) : (
      <>
        <SurfaceFill material="water" footprint={basin} w={bw} d={bh} id="fountain" color={c.tone === DEFAULT_TONE.fountain ? undefined : c.tone} />
        {edge("none")}
      </>
    );
  };
  const basin = (
    <>
      {pool(w, h, R * 0.15)}
      {round ? <ellipse rx={w / 2 - R * 0.08} ry={h / 2 - R * 0.08} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.6} /> : <rect x={-w / 2 + R * 0.08} y={-h / 2 + R * 0.08} width={w - R * 0.16} height={h - R * 0.16} rx={R * 0.1} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.6} />}
    </>
  );
  switch (style) {
    case "tiered":
      return (
        <>
          {basin}
          <circle r={R * 0.74} {...ripple} strokeDasharray="5 4" />
          <circle r={R * 0.6} fill={c.print ? "#ffffff" : WATER} {...line} />
          <circle r={R * 0.5} {...ripple} strokeDasharray="4 3" />
          <circle r={R * 0.38} fill={c.print ? "#ffffff" : WATER_DEEP} {...line} />
          <circle r={R * 0.28} {...ripple} strokeDasharray="3 3" />
          <circle r={R * 0.18} fill={c.print ? "#ffffff" : WATER} {...line} />
          <circle r={R * 0.06} fill="#ffffff" {...line} />
        </>
      );
    case "jets":
      return (
        <>
          {basin}
          {along(w, h, (L, D) => {
            const rows = D >= 1600 ? 2 : 1;
            const k = Math.max(3, Math.round((L * 0.8) / 450));
            const r = Math.min(D * 0.06, 70);
            return Array.from({ length: rows * k }, (_, i) => {
              const row = Math.floor(i / k);
              const x = -L * 0.4 + ((i % k) + 0.5) * ((L * 0.8) / k);
              const y = rows === 1 ? 0 : (row ? 1 : -1) * D * 0.18;
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={r * 2.6} {...ripple} strokeDasharray="3 3" />
                  <circle cx={x} cy={y} r={r} fill="#ffffff" {...line} />
                </g>
              );
            });
          })}
        </>
      );
    case "bowl": {
      // A raised stone bowl, no basin under it: its rim, the water in it, the water brimming over.
      const stone = c.print ? "#ffffff" : c.tone === DEFAULT_TONE.fountain ? "#ECE7DE" : c.tone;
      return (
        <>
          {round ? <ellipse rx={w / 2} ry={h / 2} fill={stone} {...line} /> : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={R * 0.2} fill={stone} {...line} />}
          <g transform={`scale(0.84)`}>{pool(w, h, R * 0.15)}</g>
          {Array.from({ length: 16 }, (_, i) => {
            const a = polar(R * 0.86, i * 22.5);
            const b = polar(R * 0.97, i * 22.5);
            return <line key={i} x1={a.x * (w / 2 / R)} y1={a.y * (h / 2 / R)} x2={b.x * (w / 2 / R)} y2={b.y * (h / 2 / R)} {...ripple} stroke={c.print ? c.ink : WATER_DEEP} strokeOpacity={c.print ? 0.5 : 1} />;
          })}
          <circle r={R * 0.5} {...ripple} strokeDasharray="5 4" />
          <circle r={R * 0.12} fill="#ffffff" {...line} />
        </>
      );
    }
  }
  return (
    <>
      {basin}
      <circle r={R * 0.68} {...ripple} strokeDasharray="5 4" />
      <circle r={R * 0.42} fill={c.print ? "#ffffff" : WATER_DEEP} {...line} />
      <circle r={R * 0.26} {...ripple} />
      <circle r={R * 0.1} fill="#ffffff" {...line} />
    </>
  );
}

/** An arch, seen from above: a foot at each end and the span between them, dressed in its style
 *  (ArchStyle) — by default a garland of flowers the whole way along, the runner form of the same
 *  drawing an arrangement is (components/flower-symbol.tsx), in the arch's own tone. */
function arch(L: number, D: number, c: Colours, line: Line, ink: string, detail: boolean, style?: ArchStyle) {
  const foot = Math.min(D, L * 0.2);
  const span = D * 0.38;
  const tone = c.print ? undefined : c.tone;
  const frame = (
    <>
      <rect x={-L / 2 + foot / 2} y={-span / 2} width={L - foot} height={span} fill={c.print ? "#ffffff" : c.ink} fillOpacity={c.print ? 1 : 0.14} {...line} />
      <rect x={-L / 2} y={-foot / 2} width={foot} height={foot} rx={foot * 0.12} fill={c.print ? "#ffffff" : c.ink} fillOpacity={c.print ? 1 : 0.32} {...line} />
      <rect x={L / 2 - foot} y={-foot / 2} width={foot} height={foot} rx={foot * 0.12} fill={c.print ? "#ffffff" : c.ink} fillOpacity={c.print ? 1 : 0.32} {...line} />
    </>
  );
  switch (style) {
    case "corner": {
      // The asymmetric dressing: a big spray over one corner, a smaller one over the other.
      const big = L * 0.44;
      const small = L * 0.24;
      return (
        <>
          {frame}
          <g transform={`translate(${-L / 2 + foot * 0.4 + big / 2} 0)`}>
            <FlowerDrawing spec={plainFlowers(big, D * 0.95, tone, "runner")} ink={ink} print={c.print} detail={detail} />
          </g>
          <g transform={`translate(${L / 2 - foot * 0.4 - small / 2} 0)`}>
            <FlowerDrawing spec={plainFlowers(small, D * 0.7, tone, "runner")} ink={ink} print={c.print} detail={detail} />
          </g>
        </>
      );
    }
    case "draped": {
      // Fabric thrown over the span, falling in swags: a band that waves along the arch, wider where
      // it gathers, with a fold down its length.
      const x0 = -L / 2 + foot * 0.3;
      const run = L - foot * 0.6;
      const steps = 48;
      const pts = Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        const wave = Math.sin(t * Math.PI * 3);
        return { x: x0 + t * run, y: D * 0.16 * wave, hw: D * (0.2 + 0.18 * Math.abs(Math.cos(t * Math.PI * 3))) };
      });
      const edge = (s: number) => pts.map((p) => `${p.x} ${p.y + s * p.hw}`);
      const band = `M ${edge(-1).join(" L ")} L ${edge(1).reverse().join(" L ")} Z`;
      const fold = `M ${pts.map((p) => `${p.x} ${p.y + p.hw * 0.25}`).join(" L ")}`;
      return (
        <>
          {frame}
          <path d={band} fill={c.print ? "#ffffff" : c.tone} fillOpacity={c.print ? 1 : 0.85} {...line} strokeLinejoin="round" />
          <path d={fold} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.4} />
        </>
      );
    }
    case "bare":
      // The frame alone — metal, timber or neon — its tube drawn down the middle of the span.
      return (
        <>
          {frame}
          <line x1={-L / 2 + foot / 2} y1={0} x2={L / 2 - foot / 2} y2={0} {...line} stroke={c.print || paleTone(c.tone) ? c.ink : c.tone} strokeOpacity={1} strokeWidth={c.print ? 1.5 : 2.5} strokeLinecap="round" />
        </>
      );
  }
  return (
    <>
      {frame}
      <FlowerDrawing spec={plainFlowers(L - foot * 1.2, D * 0.9, tone, "runner")} ink={ink} print={c.print} detail={detail} />
    </>
  );
}

/** A gate, seen from above (`L` along it, `D` through it): a column at each end standing on its
 *  plinth, and the beam joining them overhead — dashed, as anything above the cut is. Between the
 *  columns, the ENTRANCE'S SHAPE folded down onto the plan (GateStyle): square corners under a
 *  straight lintel, one curve under an arch — the one thing a plan cannot otherwise show of a gate,
 *  and the thing that tells two gates apart. */
function gate(L: number, D: number, c: Colours, line: Line, style?: GateStyle) {
  const P = Math.min(D, L * 0.2);
  const cx = L / 2 - P / 2;
  const beam = Math.min(D * 0.62, P * 0.8);
  // The opening, as wide as the passage and as deep as the gate, so its shape reads even at hall
  // zoom: an arch is one curve from column to column, with no straight run anywhere along it.
  const a = (L / 2 - P) * 0.92;
  const foot = D * 0.4;
  const rise = D * 0.8;
  const overhead = { ...line, strokeOpacity: c.print ? line.strokeOpacity : line.strokeOpacity * 0.9, strokeDasharray: "5 3" };
  const profile =
    style === "arched"
      ? `M ${-a} ${foot} A ${a} ${rise} 0 0 1 ${a} ${foot}`
      : `M ${-a} ${foot} L ${-a} ${foot - rise} L ${a} ${foot - rise} L ${a} ${foot}`;
  const post = (x: number) => (
    <g key={x} transform={`translate(${x} 0)`}>
      <rect x={-P / 2} y={-P / 2} width={P} height={P} rx={P * 0.06} fill={c.tone} {...line} />
      <circle r={P * 0.36} fill={c.print ? "#ffffff" : "#FFFFFF"} {...line} />
      <circle r={P * 0.24} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.4} />
    </g>
  );
  return (
    <>
      <rect x={-L / 2} y={-beam / 2} width={L} height={beam} fill={c.print ? "#ffffff" : c.tone} fillOpacity={c.print ? 1 : 0.5} {...overhead} />
      <path d={profile} fill="none" {...line} stroke={c.ink} strokeOpacity={c.print ? 1 : 0.8} strokeWidth={c.print ? 1.2 : 1.6} strokeLinejoin="round" />
      {post(-cx)}
      {post(cx)}
    </>
  );
}

/** A chuppah: the canopy, its four poles, the folds of the cloth corner to corner, and flowers at the
 *  two front poles — the side the couple face the guests from. */
function chuppah(w: number, h: number, round: boolean, c: Colours, line: Line, ink: string, detail: boolean) {
  const m = Math.min(w, h);
  const pole = m * 0.045;
  const fold = { ...line, strokeOpacity: line.strokeOpacity * 0.55, strokeDasharray: "4 3" };
  // The flowers on the poles are the blush every arrangement defaults to, not the canopy's colour.
  const posy = (p: { x: number; y: number }, key: string) => (
    <g key={key} transform={`translate(${p.x} ${p.y})`}>
      <FlowerDrawing spec={plainFlowers(m * 0.28, m * 0.28, undefined, "dome")} ink={ink} print={c.print} detail={detail} />
    </g>
  );
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
        {posy(poles[0], "f0")}
        {posy(poles[1], "f1")}
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
      {posy(poles[2], "f0")}
      {posy(poles[3], "f1")}
    </>
  );
}

/** A round colonnade — a rotunda chuppah: its floor, the entablature overhead (dashed, as anything
 *  above the cut is drawn), eight columns on their plinths standing under it, the opening between
 *  the two front columns (+y, toward the guests), and the drapes hanging between the columns at the
 *  back, let fall rather than gathered. */
function rotunda(w: number, h: number, c: Colours, line: Line) {
  const rx = w / 2;
  const ry = h / 2;
  const m = Math.min(rx, ry);
  const N = 8;
  // Columns half a step either side of the front, so the front is an opening, not a column.
  const at = (deg: number, k: number) => ({ x: rx * k * Math.cos((deg * Math.PI) / 180), y: ry * k * Math.sin((deg * Math.PI) / 180) });
  const angles = Array.from({ length: N }, (_, i) => 90 + (360 / N) * (i + 0.5));
  const col = m * 0.075;
  const overhead = { ...line, strokeOpacity: line.strokeOpacity * 0.7, strokeDasharray: "6 4" };
  // A drape between two neighbouring back columns: the fabric's wave along the ring between them.
  const drape = (a0: number, a1: number, key: string) => {
    const steps = 18;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const k = 0.92 + 0.03 * Math.sin(t * Math.PI * 6);
      const p = at(a0 + (a1 - a0) * t, k);
      d += `${i ? " L" : "M"} ${p.x} ${p.y}`;
    }
    return <path key={key} d={d} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.8} strokeLinejoin="round" />;
  };
  const back = angles.map((a, i) => [a, angles[(i + 1) % N] + (i === N - 1 ? 360 : 0)] as const).filter(([a0, a1]) => Math.sin((((a0 + a1) / 2) * Math.PI) / 180) < -0.2);
  return (
    <>
      <ellipse rx={rx} ry={ry} fill={c.print ? "#ffffff" : c.tone} fillOpacity={c.print ? 1 : 0.55} {...line} strokeOpacity={line.strokeOpacity * 0.5} />
      <ellipse rx={rx * 0.99} ry={ry * 0.99} fill="none" {...overhead} />
      <ellipse rx={rx * 0.84} ry={ry * 0.84} fill="none" {...overhead} />
      {back.map(([a0, a1], i) => drape(a0, a1, `d${i}`))}
      {angles.map((a, i) => {
        const p = at(a, 0.92);
        return (
          <g key={`c${i}`}>
            <rect x={p.x - col * 1.25} y={p.y - col * 1.25} width={col * 2.5} height={col * 2.5} fill={c.print ? "#ffffff" : c.tone} {...line} />
            <circle cx={p.x} cy={p.y} r={col} fill={c.print ? "#ffffff" : "#FFFFFF"} {...line} />
            <circle cx={p.x} cy={p.y} r={col * 0.6} fill="none" {...line} strokeOpacity={line.strokeOpacity * 0.4} />
          </g>
        );
      })}
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
  const top = counterTopMm(D);
  const back = counterShelfMm(D);
  const bottles = Math.max(0, Math.floor((L - back) / BOTTLE_PITCH_MM));
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
          r={bottleRadiusMm(back)}
          fill="#ffffff"
          {...line}
        />
      ))}
    </>
  );
}

/** A bar of any other shape — a ח, an oval ring, a horseshoe, an arc, an outline drawn by hand — in
 *  the straight bar's own strips, laid along its band (lib/catalog/bar-draw.ts says which edge is
 *  which): the counter top along the guests' side, the bartender's shelf and its bottles along the
 *  side that faces in, and the shapes added to it drawn as back bars with their bottles. */
function shapedBar(f: Footprint, c: Colours, line: Line) {
  const d = barDrawing(f);
  const strip = (s: Strip, key: string, opacity: number) => (
    <path
      key={key}
      d={s.map((ring) => `M ${ring.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`).join(" ")}
      fillRule="evenodd"
      fill={c.print ? "#ffffff" : c.ink}
      fillOpacity={c.print ? 1 : opacity}
      {...line}
      strokeOpacity={line.strokeOpacity * 0.7}
      strokeLinejoin="round"
    />
  );
  return (
    <>
      <FootprintShape footprint={f} fill={c.tone} {...line} />
      {d.front.map((s, i) => strip(s, `f${i}`, 0.1))}
      {d.shelf.map((s, i) => strip(s, `s${i}`, 0.18))}
      {d.backs.map((p, i) => (
        <path key={`b${i}`} d={outlinePathD(p.outline, p.edgeCurves)} fill={c.print ? "#ffffff" : c.ink} fillOpacity={c.print ? 1 : 0.18} {...line} strokeOpacity={line.strokeOpacity * 0.7} />
      ))}
      {d.bottles.map((b, i) => (
        <circle key={`o${i}`} cx={b.x} cy={b.y} r={b.r} fill="#ffffff" {...line} />
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
function RugPatternView({ w, h, ink = "var(--color-ink)", opacity = 1, bows }: { w: number; h: number; ink?: string; opacity?: number; bows?: RugBows }) {
  const m = Math.min(w, h);
  const b1 = Math.min(m * 0.07, 160);
  const b2 = Math.min(m * 0.12, 260);
  const fringe = Math.min(70, m * 0.05);
  const gap = 45;
  const line = { fill: "none", stroke: ink, vectorEffect: "non-scaling-stroke" as const, strokeWidth: 1 };
  if (bows) {
    // Curved sides: the border follows the outline (the same bows on the smaller rectangle) and the
    // fringe leaves the short ends along the curve's normal.
    const inner = rugInset(w, h, bows, b1);
    const outer = m > b2 * 3 ? rugInset(w, h, bows, b2) : null;
    const strands = rugFringe(w, h, bows, gap).map((t) => `M ${t.x} ${t.y} l ${t.nx * fringe} ${t.ny * fringe}`).join(" ");
    return (
      <g className="pointer-events-none" opacity={opacity}>
        {inner && <path d={outlinePathD(inner.outline, inner.edgeCurves)} {...line} strokeOpacity={0.3} />}
        {outer && <path d={outlinePathD(outer.outline, outer.edgeCurves)} {...line} strokeOpacity={0.18} strokeDasharray="3 3" />}
        <path d={strands} {...line} strokeOpacity={0.35} />
      </g>
    );
  }
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
