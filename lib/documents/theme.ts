// What a page is DRAWN with, derived from a studio's document style (./style.ts): the paper and its
// inks, the accent and its tints, the two faces with their weights, the margins. Pure — the quote
// (app/(app)/outputs/quote-document.tsx), the settings preview and the crew sheets read one theme,
// so a colour or a face is decided once.
//
// CREW SHEETS ARE INK. They take the direction's TYPE (faces, weights, header style) and nothing
// else of its colour: white paper, black ink, the accent turned to ink — they are photocopied,
// faxed and read in a loading bay (PRODUCT.md: B&W-print-legible outputs).
import { mix, resolveDocStyle, type DocDirection, type DocFont, type DocStyle, type DocStyleSetting } from "./style";

/** The CSS variable each face is loaded under (app/doc-fonts.ts — keep the two in step). */
export const FONT_VARS: Record<DocFont, string> = {
  Bellefair: "--doc-bellefair",
  "David Libre": "--doc-david",
  Karantina: "--doc-karantina",
  Heebo: "--doc-heebo",
  "IBM Plex Sans Hebrew": "--doc-plex",
  "Frank Ruhl Libre": "--doc-frank",
  "Suez One": "--doc-suez",
  Rubik: "--doc-rubik",
  "Noto Serif Hebrew": "--doc-noto-serif",
  Assistant: "--font-assistant",
};

const SERIF = new Set<DocFont>(["Bellefair", "David Libre", "Frank Ruhl Libre", "Noto Serif Hebrew", "Suez One"]);

export const fontStack = (f: DocFont) => `var(${FONT_VARS[f]}), ${SERIF.has(f) ? "serif" : "system-ui, sans-serif"}`;
export const MONO_STACK = "var(--doc-plex-mono), ui-monospace, monospace";

/** [light, heading] weight per face — a face with one weight answers it twice. */
const WEIGHTS: Record<DocFont, [number, number]> = {
  Bellefair: [400, 400],
  "David Libre": [400, 500],
  Karantina: [300, 400],
  Heebo: [300, 500],
  "IBM Plex Sans Hebrew": [200, 500],
  "Frank Ruhl Libre": [300, 500],
  "Suez One": [400, 400],
  Rubik: [400, 500],
  "Noto Serif Hebrew": [300, 500],
  Assistant: [300, 700],
};

/** Each direction's paper and inks — the colour of the stock it is printed on. */
const PAPERS: Record<DocDirection, { paper: string; ink: string; soft: string; muted: string; rule: string; hair: string }> = {
  stationery: { paper: "#fbf8f3", ink: "#2d2823", soft: "#5e554c", muted: "#948a7e", rule: "#c7b89f", hair: "#e6dccd" },
  lookbook: { paper: "#ffffff", ink: "#111111", soft: "#333333", muted: "#777777", rule: "#111111", hair: "#e4e4e4" },
  studio: { paper: "#f5f3ef", ink: "#1a1a1a", soft: "#4a4845", muted: "#8b8782", rule: "#c9c4bc", hair: "#dcd7cf" },
};

export interface DocTheme {
  style: DocStyle;
  dir: DocDirection;
  /** A crew sheet: white paper, ink only. */
  ink: boolean;
  paper: string;
  text: string;
  soft: string;
  muted: string;
  rule: string;
  hair: string;
  /** The accent (ink on a crew sheet) and its derivatives. */
  accent: string;
  tint: string;
  soft2: string;
  deep: string;
  /** A photo slot's resting tone before a photo is in it, and its caption ink. */
  slot: string;
  slotInk: string;
  head: string;
  body: string;
  mono: string;
  wLight: number;
  wHead: number;
  airy: boolean;
  /** The density factor: 1 airy, ~0.8 compact. */
  k: number;
  /** Page margin, mm. */
  margin: number;
}

export function docTheme(setting: DocStyleSetting | DocStyle | null | undefined, opts: { ink?: boolean } = {}): DocTheme {
  const style = setting && "headFont" in setting ? setting : resolveDocStyle(setting as DocStyleSetting | null | undefined);
  const dir = style.direction;
  const ink = !!opts.ink;
  const p = PAPERS[dir];
  const airy = style.density !== "compact";
  const A = ink ? "#111111" : style.accent;
  const [wLight, wHead] = WEIGHTS[style.headFont];
  // A clean stationery or studio sheet is still on its own stock — "clean" drops the frame and the
  // grain, not the paper's colour.
  const paper = ink ? "#ffffff" : p.paper;
  const margin = (dir === "stationery" ? 24 : dir === "studio" ? 14 : 13) * (airy ? 1 : 0.85);
  return {
    style,
    dir,
    ink,
    paper,
    text: ink ? "#111111" : p.ink,
    soft: ink ? "#333333" : p.soft,
    muted: ink ? "#666666" : p.muted,
    rule: ink ? "#111111" : p.rule,
    hair: ink ? "#cccccc" : p.hair,
    accent: A,
    tint: ink ? "#f2f2f2" : mix(style.accent, "#ffffff", 0.88),
    soft2: ink ? "#bdbdbd" : mix(style.accent, "#ffffff", 0.55),
    deep: ink ? "#111111" : mix(style.accent, "#000000", 0.28),
    slot: ink ? "#eeeeee" : mix(style.accent, p.paper, 0.82),
    slotInk: ink ? "#999999" : mix(style.accent, p.paper, 0.45),
    head: fontStack(style.headFont),
    body: fontStack(style.bodyFont),
    mono: dir === "studio" ? MONO_STACK : fontStack(style.bodyFont),
    wLight,
    wHead,
    airy,
    k: airy ? 1 : 0.8,
    margin: Math.round(margin * 10) / 10,
  };
}

/** The chapter number a section heading wears: "01" / "א" (stationery). */
export function chapterLabel(theme: DocTheme, n: number, letter: (n: number) => string): string {
  return theme.dir === "stationery" ? letter(n) : String(n).padStart(2, "0");
}
