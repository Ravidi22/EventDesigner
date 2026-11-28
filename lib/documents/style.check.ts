// npm run check:doc-style — the self-check of ./style.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { changedCount, hebrewNumeral, mix, monogram, normalizeDocStyle, resolveDocStyle, withToken } from "./style";

// ponytail: self-check. Run: npm run check:doc-style
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
assert(resolveDocStyle(null).direction === "stationery", "default direction");
assert(resolveDocStyle({ direction: "studio", overrides: {} }).headFont === "IBM Plex Sans Hebrew", "a direction's own faces");
const s = normalizeDocStyle({ direction: "lookbook", overrides: { accent: "#6B2230", cover: "plain", paper: "nonsense", headFont: "Comic Sans" } });
assert(!("accent" in s.overrides), "an override equal to the direction's answer drops out (case-insensitive)");
assert(s.overrides.cover === "plain" && !("paper" in s.overrides) && !("headFont" in s.overrides), "unknown values are refused");
assert(changedCount(s) === 1, "changed counts what differs");
const t = withToken(s, "cover", "photo");
assert(changedCount(t) === 0, "setting a token back to the direction's answer clears it");
assert(normalizeDocStyle({ direction: "x" }).direction === "stationery", "an unknown direction falls back");
assert(mix("#000000", "#ffffff", 0.5) === "#808080", "mix halfway");
assert(JSON.stringify(monogram("מיכל ודניאל")) === '["מ","ד"]', "a couple's monogram");
assert(JSON.stringify(monogram("Dana & Tom")) === '["D","T"]', "& joins a couple");
assert(JSON.stringify(monogram("דנה")) === '["ד"]', "one name, one letter");
assert(monogram("").length === 0, "no name, no monogram");
assert(hebrewNumeral(1) === "א" && hebrewNumeral(5) === "ה" && hebrewNumeral(30) === "30", "letter numerals");
console.log("doc-style self-check passed");
