// npm run check:flower-kinds — the self-check of ./flower-kinds.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { colourOfName, coloursOfText, FLOWER_KIND_BY_ID, FLOWER_VOCABULARY, kindOfLine, kindOfName } from "./flower-kinds";

// ponytail: self-check. Run: npm run check:flower-kinds
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
assert(kindOfName("ורד אוולנש 60 ס״מ") === "rose", "a rose variety is a rose");
assert(kindOfName("ורד ספריי") === "spray", "a spray rose is a spray, not a rose");
assert(kindOfName("הורטנזיה יבוא") === "hydrangea" && kindOfName("הידראנגאה") === "hydrangea", "both spellings of hydrangea");
assert(kindOfName("סידור דולפיניום") === "delphinium", "the common misspelling of delphinium");
assert(kindOfName("אקליפוטוס גוני") === "euca" && kindOfName("אקליפטוס מטבעות") === "euca", "eucalyptus, both ways");
assert(kindOfName("לוארי/מנטו") === "filler", "an unknown name is a filler");
assert(kindOfName("סורגום", "green") === "green", "the fallback is the caller's");
assert(kindOfName("פמפס יבש") === "grass", "pampas, dried or not, is a grass");
assert(kindOfName("שרך שרון") === "fern" && kindOfName("אספרגוס פלומוזיס") === "fern", "ferns and asparagus are fronds");
assert(kindOfName("מוס טרי") === "green", "moss is green");
assert(kindOfLine({ name: "whatever", kind: "peony" }) === "peony", "a carried kind wins over the name");
assert(kindOfLine({ name: "ורד", kind: "bogus" }) === "rose", "a kind nobody knows falls back to the name");
assert(FLOWER_KIND_BY_ID.gyps.natural === "#FFFFFF" && !FLOWER_KIND_BY_ID.rose.natural, "gypsophila is white; a rose takes the shade");
assert(new Set(FLOWER_VOCABULARY.map((v) => v.name)).size === FLOWER_VOCABULARY.length, "the vocabulary has no duplicate names");
for (const v of FLOWER_VOCABULARY) assert(kindOfName(v.name) === v.kind, `the vocabulary's ${v.name} reads as its own kind (${v.kind}, read ${kindOfName(v.name)})`);

const three = coloursOfText("לבן\\ורוד\\לילך\\אדום\\כתום\\צהוב נא לציין את הצבע המבוקש");
assert(three.length === 6 && three[0].hex === "#FFFFFF" && three[2].name === "לילך", "a slash-separated list is read colour by colour");
assert(colourOfName("ליזיאנטוס 80 ס״מ ורוד בהיר") === "#F2C4D0", "the longer colour word wins");
assert(colourOfName("ורד אוולנש 50 ס״מ") === undefined, "no colour word, no colour");
assert(coloursOfText("ורוד,ורוד").length === 1, "a colour named twice is one");
console.log("catalog/flower-kinds self-check passed");
