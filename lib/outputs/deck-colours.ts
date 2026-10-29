// How the stage crew reads a stage plan: every deck coloured by its HEIGHT, from the crew's own key,
// and labelled with its size — "122-244", "40-244" — short side first, in centimetres. Taken from the
// אמארה plan of 26.10 (the crew's drawing the user handed over as the model): 20cm salmon, 40 yellow,
// 60 cyan, 90 lavender, 110 orange… A height between two keys takes the nearer one — a 45cm stage is
// drawn as the 40s are, and its legend row still says 45.
//
// Pure, self-checked: `npx tsx lib/outputs/deck-colours.ts`.
import { isMain } from "../self-check";

/** The crew's key, centimetres → colour. */
export const HEIGHT_COLOURS: readonly (readonly [number, string])[] = [
  [0, "#ffffff"],
  [10, "#ff00ff"],
  [20, "#ff7f7f"],
  [30, "#9933ff"],
  [40, "#ffff7f"],
  [50, "#7fff7f"],
  [55, "#007f3f"],
  [60, "#7fffff"],
  [70, "#007fff"],
  [75, "#ff7fbf"],
  [80, "#ff0000"],
  [90, "#7f7fbf"],
  [100, "#7f3f3f"],
  [110, "#ff7f00"],
  [120, "#0000ff"],
  [130, "#7f7f00"],
  [140, "#7f7f7f"],
  [150, "#3f7f7f"],
];

/** The key's colour for a deck standing this high. */
export function heightColour(heightMm: number): string {
  const cm = heightMm / 10;
  let best = HEIGHT_COLOURS[0];
  for (const k of HEIGHT_COLOURS) if (Math.abs(k[0] - cm) < Math.abs(best[0] - cm)) best = k;
  return best[1];
}

/** Whether text on this colour should be white (the key's blues, reds and dark greens). */
export function darkFill(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18;
}

/** A deck's size as the crew writes it: "122-244", short side first, in centimetres. */
export function deckLabel(widthMm: number, depthMm: number): string {
  const [a, b] = [widthMm, depthMm].map((v) => Math.round(v / 10)).sort((x, y) => x - y);
  return `${a}-${b}`;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  assert(heightColour(400) === "#ffff7f" && heightColour(600) === "#7fffff" && heightColour(200) === "#ff7f7f", "40 yellow, 60 cyan, 20 salmon — the crew's key");
  assert(heightColour(450) === heightColour(400) || heightColour(450) === heightColour(500), "a height between two keys takes one of them");
  assert(heightColour(5000) === "#3f7f7f", "…and one past the top takes the top");
  assert(deckLabel(2440, 1220) === "122-244" && deckLabel(800, 2440) === "80-244", "sizes read short side first, in cm");
  assert(darkFill("#0000ff") && darkFill("#007f3f") && !darkFill("#ffff7f") && !darkFill("#7fffff"), "white text on the dark keys only");
  console.log("deck-colours self-check passed");
}
