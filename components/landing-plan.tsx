import { ClothDrape, ItemSymbol, SeatChair } from "@/components/item-symbol";
import { CHAIR_D_MM, CHAIR_W_MM, seatsAround } from "@/lib/studio/seating";
import type { Footprint } from "@/lib/studio/footprint";

// The landing page's pictures of the product, drawn BY the product: the same chairs, cloths and
// item symbols the studio canvas and the printed map draw (components/item-symbol.tsx), seated by
// the same seatsAround. True scale, in millimetres. A hall drawn here by hand would be a picture of
// some other tool — and would stop matching the real one the first time a chair is redrawn.

const INK = "#4a4658";
const PRINT_INK = "#1b1725";
const ACCENT = "#6d55bd";
const hair = { strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };

const ROUND_180: Footprint = { kind: "circle", diameterMm: 1800 };
const SEATS = seatsAround(ROUND_180, 10);

// The two cloth shades the hall alternates between — a zig-zag, as the studio's table patterns lay it.
const CLOTHS = ["#f4dde6", "#f7e9dc"];

/** The chair, once. Ids are document-wide, so each drawing on the page names its own. */
function ChairDef({ id, print }: { id: string; print?: boolean }) {
  return (
    <g id={id}>
      <SeatChair widthMm={CHAIR_W_MM} depthMm={CHAIR_D_MM} print={print} ink={print ? PRINT_INK : undefined} />
    </g>
  );
}

function RoundTable({
  x = 0,
  y = 0,
  chairId,
  cloth,
  dressed,
  print,
  label,
}: {
  x?: number;
  y?: number;
  /** The id of the one chair this drawing defines (ChairDef); every seat is a <use> of it. */
  chairId: string;
  cloth?: string;
  /** Candlesticks round the centrepiece — only worth drawing where a table is seen close up. */
  dressed?: boolean;
  print?: boolean;
  /** Printed map only: the table's number, and the letter of its design kit under it. */
  label?: { number: string; kit: string };
}) {
  const ink = print ? PRINT_INK : undefined;
  return (
    <g transform={`translate(${x} ${y})`}>
      {SEATS.map((s, i) => (
        <use key={i} href={`#${chairId}`} transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.facingDeg.toFixed(1)})`} />
      ))}
      {cloth && !print && <ClothDrape footprint={ROUND_180} colour={cloth} />}
      <circle
        r={900}
        fill={print ? "#ffffff" : (cloth ?? "#ffffff")}
        stroke={print ? PRINT_INK : INK}
        strokeOpacity={cloth && !print ? 0.25 : 1}
        {...hair}
        strokeWidth={print ? 1.5 : 1}
      />
      {label ? (
        <text textAnchor="middle" fill={PRINT_INK} fontFamily="var(--font-sans)" className="nums">
          <tspan x={0} y={-40} fontSize={420} fontWeight={700}>
            {label.number}
          </tspan>
          <tspan x={0} y={330} fontSize={300} fontWeight={600}>
            {label.kit}
          </tspan>
        </text>
      ) : (
        <ItemSymbol kind="flowers" footprint={{ kind: "circle", diameterMm: dressed ? 560 : 480 }} count={1} print={print} ink={ink} />
      )}
      {dressed &&
        [45, 135, 225, 315].map((deg) => {
          const a = (deg * Math.PI) / 180;
          return (
            <g key={deg} transform={`translate(${(Math.cos(a) * 560).toFixed(1)} ${(Math.sin(a) * 560).toFixed(1)})`}>
              <ItemSymbol kind="candlestick" footprint={{ kind: "circle", diameterMm: 320 }} count={5} print={print} ink={ink} />
            </g>
          );
        })}
    </g>
  );
}

// 26 × 16 m, 22 rounds of ten: two blocks flanking the dance floor and two rows across the back.
const SIDE_ROWS = [3000, 6400, 9800, 13200];
const SIDE_COLS = [2600, 6000, 20000, 23400];
const BACK_ROWS = [10800, 13700];
const BACK_COLS = [9600, 13000, 16400];
const TABLES = [
  ...SIDE_COLS.flatMap((x, c) => SIDE_ROWS.map((y, r) => ({ x, y, shade: (r + c) % 2 }))),
  ...BACK_COLS.flatMap((x, c) => BACK_ROWS.map((y, r) => ({ x, y, shade: (r + c + 1) % 2 }))),
];

/** A whole hall: stage and chuppah, dance floor, and every table laid and seated. */
export function HallPlan({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-300 -300 26600 16600"
      role="img"
      aria-label="סקיצת אולם מתוך Eve: במה עם חופה, רחבת ריקודים ו־22 שולחנות עגולים עם כיסאות ומפות בשני גוונים"
      className={className}
    >
      <rect width={26000} height={16000} fill="#ffffff" stroke={INK} {...hair} strokeWidth={2} />
      {/* the entrance, and the swing of its door */}
      <path d="M 11800 16000 h 2400" stroke="#ffffff" {...hair} strokeWidth={4} />
      <path d="M 11800 16000 a 1200 1200 0 0 1 1200 -1200" fill="none" stroke="#a29eb2" {...hair} />
      <path d="M 14200 16000 a 1200 1200 0 0 0 -1200 -1200" fill="none" stroke="#a29eb2" {...hair} />

      <rect x={8500} y={400} width={9000} height={3000} fill="#efeafb" stroke={ACCENT} {...hair} strokeWidth={1.5} />
      <g transform="translate(13000 1900)">
        <ItemSymbol kind="chuppah" footprint={{ kind: "rect", widthMm: 3000, depthMm: 2200 }} count={1} tone="#ffffff" />
      </g>
      <rect x={9500} y={4400} width={7000} height={4300} fill="#faf9fd" stroke="#a29eb2" strokeDasharray="6 5" {...hair} />

      {/* One laid table per cloth shade, drawn once and stamped 22 times: the hall is ~2,000 shapes
          written out in full, and a landing page should not ship them twice over (markup + payload). */}
      <defs>
        <ChairDef id="hall-chair" />
        {CLOTHS.map((cloth, i) => (
          <g key={cloth} id={`hall-table-${i}`}>
            <RoundTable chairId="hall-chair" cloth={cloth} />
          </g>
        ))}
      </defs>
      {TABLES.map((t) => (
        <use key={`${t.x}-${t.y}`} href={`#hall-table-${t.shade}`} x={t.x} y={t.y} />
      ))}
      <circle cx={20000} cy={6400} r={1420} fill="none" stroke={ACCENT} strokeDasharray="7 5" {...hair} strokeWidth={1.5} />
    </svg>
  );
}

/** One table, close up: cloth, chairs, centrepiece and candlesticks — or, with `print`, the same
 *  table as the placement map prints it: ink on white, its number and its kit letter. */
export function TableDetail({ print, className }: { print?: boolean; className?: string }) {
  const chairId = print ? "detail-chair-print" : "detail-chair";
  return (
    <svg
      viewBox="-1500 -1500 3000 3000"
      role="img"
      aria-label={
        print
          ? "שולחן 7 כפי שהוא מודפס במפת ההצבה: קווי דיו על לבן, מספר השולחן ואות ערכת העיצוב"
          : "שולחן עגול מעוצב: מפה, עשרה כיסאות, סידור פרחים וארבעה פמוטים"
      }
      className={className}
    >
      <defs>
        <ChairDef id={chairId} print={print} />
      </defs>
      <RoundTable chairId={chairId} cloth={CLOTHS[0]} dressed={!print} print={print} label={print ? { number: "7", kit: "ב" } : undefined} />
    </svg>
  );
}

/** A handful of catalog items as the plan draws them, side by side at one scale. */
export function CatalogItems({ className }: { className?: string }) {
  const items: { x: number; node: React.ReactNode }[] = [
    { x: 330, node: <ItemSymbol kind="chair" chairStyle="chiavari" footprint={{ kind: "rect", widthMm: 420, depthMm: 420 }} count={1} /> },
    { x: 990, node: <ItemSymbol kind="chair" chairStyle="crossback" footprint={{ kind: "rect", widthMm: 440, depthMm: 440 }} count={1} tone="#e9d8c4" /> },
    { x: 1680, node: <ItemSymbol kind="candlestick" footprint={{ kind: "circle", diameterMm: 460 }} count={5} /> },
    { x: 2420, node: <ItemSymbol kind="flowers" footprint={{ kind: "circle", diameterMm: 600 }} count={1} /> },
    { x: 3180, node: <ItemSymbol kind="centerpiece" footprint={{ kind: "circle", diameterMm: 520 }} count={1} tone="#efc9ae" /> },
    { x: 4560, node: <ItemSymbol kind="sofa" footprint={{ kind: "rect", widthMm: 1900, depthMm: 850 }} count={1} /> },
  ];
  return (
    <svg
      viewBox="0 0 5640 1100"
      role="img"
      aria-label="פריטי קטלוג כפי שהם מצוירים על התוכנית: שני כיסאות, פמוט, סידור פרחים, מרכז שולחן וספה"
      className={className}
    >
      {items.map((it) => (
        <g key={it.x} transform={`translate(${it.x} 550)`}>
          {it.node}
        </g>
      ))}
    </svg>
  );
}
