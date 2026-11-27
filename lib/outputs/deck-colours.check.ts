// npm run check:deck-colours — the self-check of ./deck-colours.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { darkFill, deckLabel, heightColour } from "./deck-colours";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
assert(heightColour(400) === "#ffff7f" && heightColour(600) === "#7fffff" && heightColour(200) === "#ff7f7f", "40 yellow, 60 cyan, 20 salmon — the crew's key");
assert(heightColour(450) === heightColour(400) || heightColour(450) === heightColour(500), "a height between two keys takes one of them");
assert(heightColour(5000) === "#3f7f7f", "…and one past the top takes the top");
assert(deckLabel(2440, 1220) === "122-244" && deckLabel(800, 2440) === "80-244", "sizes read short side first, in cm");
assert(darkFill("#0000ff") && darkFill("#007f3f") && !darkFill("#ffff7f") && !darkFill("#7fffff"), "white text on the dark keys only");
console.log("deck-colours self-check passed");
