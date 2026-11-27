// npm run check:doc-theme — the self-check of ./theme.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type DocFont } from "./style";
import { docTheme, FONT_VARS, fontStack } from "./theme";

// ponytail: self-check. Run: npm run check:doc-theme
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const st = docTheme(null);
assert(st.dir === "stationery" && st.paper === "#fbf8f3" && st.accent === "#a08155", "stationery by default");
const crew = docTheme({ direction: "lookbook", overrides: { accent: "#2f4a63" } }, { ink: true });
assert(crew.accent === "#111111" && crew.paper === "#ffffff", "a crew sheet is ink on white");
assert(crew.head.includes("--doc-karantina"), "…in the direction's own face");
const compact = docTheme({ direction: "studio", overrides: {} });
assert(!compact.airy && compact.margin < 14 && compact.mono.includes("plex-mono"), "studio is compact, Plex Mono numbers");
for (const f of Object.keys(FONT_VARS)) assert(fontStack(f as DocFont).startsWith("var(--"), `a stack for ${f}`);
console.log("doc-theme self-check passed");
