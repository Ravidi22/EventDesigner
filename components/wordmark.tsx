type Tone = "gradient" | "mono" | "on-dark" | "gold" | "outline";

// The dot is always the focal accent — light violet on light grounds, gold on dark.
const tones: Record<Tone, { word: string; dot: string }> = {
  gradient: {
    word: "bg-[linear-gradient(135deg,#8f78d8,#6d55bd)] bg-clip-text text-transparent",
    dot: "text-indigo-500 [-webkit-text-fill-color:#8f78d8]",
  },
  mono: { word: "text-accent", dot: "text-accent" },
  "on-dark": { word: "text-canvas", dot: "text-gold" },
  gold: { word: "text-warn", dot: "text-indigo-500" },
  outline: {
    word: "text-transparent [-webkit-text-stroke:1.5px_#fff]",
    dot: "[-webkit-text-stroke-color:#f3d98a]",
  },
};

/**
 * The Eve wordmark. Latin, always LTR, never re-spaced or stretched — keep clear space
 * equal to the cap height of the "E" on every side.
 */
export function Wordmark({
  tone = "mono",
  className = "text-xl",
}: {
  tone?: Tone;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <span dir="ltr" className={`wordmark inline-block ${t.word} ${className}`}>
      Eve<span className={t.dot}>.</span>
    </span>
  );
}
