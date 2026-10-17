// What a flower IS, by its name — which is what the plan draws it as.
//
// An arrangement's spec is rows of NAME × stems (Product.flowers), typed in a designer's own words
// and offered from a list. The name is the only thing the drawing has to go on: "ורד" has to come
// out as a spiral of petals, "הורטנזיה" as a ball of florets, "אקליפטוס" as round leaves spilling
// over the rim. This module is that dictionary — the KINDS a flower can be drawn as, with the one
// size and the one colour rule each kind brings, and the Hebrew names and spellings that map onto
// them. A row may also carry its kind explicitly (FlowerLine.kind, set when the designer picks a
// known flower in the drawer); the name is the fallback, so a flower typed free still draws.
//
// Pure, no React, no catalog registry: `npm run check:flower-kinds`.
import { isMain } from "../self-check";

/** What part a flower plays in an arrangement: a HEAD is a bloom seen from above; a FILLER is the
 *  small stuff between the heads (phlox, gypsophila); a TRAIL arches out past the rim (an orchid
 *  spray); GREEN is the foliage everything sits in. */
export type FlowerRole = "head" | "fill" | "trail" | "green";

export type FlowerKindId =
  | "rose"
  | "spray"
  | "peony"
  | "hydrangea"
  | "lisianthus"
  | "ranunculus"
  | "carnation"
  | "anemone"
  | "daisy"
  | "sunflower"
  | "lily"
  | "calla"
  | "tulip"
  | "orchid"
  | "phlox"
  | "delphinium"
  | "lavender"
  | "gyps"
  | "filler"
  | "euca"
  | "ruscus"
  | "fern"
  | "monstera"
  | "green"
  | "grass"
  | "dried";

export interface FlowerKind {
  id: FlowerKindId;
  /** The name the drawer offers for it, singular, as a spec lists it. */
  label: string;
  role: FlowerRole;
  /** One head's diameter seen from above, in mm. A green's number is the width of its leaf cluster
   *  for a single stem drawn on its own; a sprig in an arrangement is laid by its length. */
  headMm: number;
  /** Stems it takes to show one head from above — the rest are under it, or face sideways. */
  perHead: number;
  /** A colour the kind HAS rather than takes from the arrangement's shade: the greens, gypsophila
   *  (always white), lavender, dried grasses. Absent = follows the shade unless the row pins one. */
  natural?: string;
}

const GREEN = "#8FAE84";

export const FLOWER_KINDS: FlowerKind[] = [
  { id: "rose", label: "ורד", role: "head", headMm: 76, perHead: 1.6 },
  { id: "spray", label: "ורד ספריי", role: "head", headMm: 88, perHead: 2.2 },
  { id: "peony", label: "פיאוני", role: "head", headMm: 124, perHead: 1.3 },
  { id: "hydrangea", label: "הידראנגאה", role: "head", headMm: 172, perHead: 1.25 },
  { id: "lisianthus", label: "ליזיאנטוס", role: "head", headMm: 60, perHead: 1.8 },
  { id: "ranunculus", label: "נורית", role: "head", headMm: 64, perHead: 1.7 },
  { id: "carnation", label: "ציפורן", role: "head", headMm: 70, perHead: 1.6 },
  { id: "anemone", label: "אנמונה", role: "head", headMm: 72, perHead: 1.6 },
  { id: "daisy", label: "גרברה", role: "head", headMm: 100, perHead: 1.5 },
  { id: "sunflower", label: "חמנייה", role: "head", headMm: 150, perHead: 1.4 },
  { id: "lily", label: "ליליום", role: "head", headMm: 140, perHead: 1.6 },
  { id: "calla", label: "קאלה", role: "head", headMm: 68, perHead: 1.6 },
  { id: "tulip", label: "צבעוני", role: "head", headMm: 56, perHead: 1.7 },
  { id: "orchid", label: "סחלב", role: "trail", headMm: 70, perHead: 4 },
  { id: "phlox", label: "פלוקס", role: "fill", headMm: 88, perHead: 1.6 },
  { id: "delphinium", label: "דלפיניום", role: "fill", headMm: 68, perHead: 1.4 },
  { id: "lavender", label: "לבנדר", role: "fill", headMm: 60, perHead: 1.4, natural: "#9A8BC9" },
  { id: "gyps", label: "גיבסנית", role: "fill", headMm: 80, perHead: 2.2, natural: "#FFFFFF" },
  // A name nothing here knows — drawn as small florets of filling, in the shade.
  { id: "filler", label: "פרח מילוי", role: "fill", headMm: 60, perHead: 1.8 },
  { id: "euca", label: "אקליפטוס", role: "green", headMm: 34, perHead: 1, natural: "#A9BDB0" },
  { id: "ruscus", label: "רוסקוס", role: "green", headMm: 50, perHead: 1, natural: "#729460" },
  { id: "fern", label: "שרך", role: "green", headMm: 56, perHead: 1, natural: "#88A971" },
  { id: "monstera", label: "מונסטרה", role: "green", headMm: 240, perHead: 1, natural: "#52805A" },
  { id: "green", label: "ירק", role: "green", headMm: 40, perHead: 1, natural: GREEN },
  { id: "grass", label: "פמפס", role: "green", headMm: 120, perHead: 1, natural: "#D9C9A3" },
  { id: "dried", label: "פרח יבש", role: "green", headMm: 70, perHead: 1, natural: "#C9B596" },
];

export const FLOWER_KIND_BY_ID: Record<FlowerKindId, FlowerKind> = Object.fromEntries(
  FLOWER_KINDS.map((k) => [k.id, k]),
) as Record<FlowerKindId, FlowerKind>;

export function isFlowerKindId(value: unknown): value is FlowerKindId {
  return typeof value === "string" && value in FLOWER_KIND_BY_ID;
}

/** A name as it is compared: no niqqud, no doubled spaces, no case. */
export function normalizeFlowerName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[֑-ׇ]/g, "")
    .replace(/[״"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Which kind a name is — by the first entry whose text appears in it. ORDER MATTERS: a spray rose
 * is a rose with "ספריי" in it, so the more specific word is listed first. The words are what an
 * Israeli florist's price list calls things (bukiflowers.com was the reference), including the
 * common misspellings ("דולפיניום", "אקליפוטוס").
 */
const MATCH: [string, FlowerKindId][] = [
  ["ספריי", "spray"],
  ["ספרי", "spray"],
  ["ורד", "rose"],
  ["פיאוני", "peony"],
  ["פאוני", "peony"],
  ["אדמונית", "peony"],
  ["הידראנג", "hydrangea"],
  ["הידרנג", "hydrangea"],
  ["הורטנז", "hydrangea"],
  ["ליזיאנטוס", "lisianthus"],
  ["ליסיאנטוס", "lisianthus"],
  ["נורית", "ranunculus"],
  ["רננקולוס", "ranunculus"],
  ["ציפורן", "carnation"],
  ["אנמונה", "anemone"],
  ["כלנית", "anemone"],
  ["חמני", "sunflower"],
  ["גרברה", "daisy"],
  ["חרצי", "daisy"],
  ["מרגריט", "daisy"],
  ["מרגנית", "daisy"],
  ["בבונג", "daisy"],
  ["קמומיל", "daisy"],
  ["דליה", "daisy"],
  ["ליליום", "lily"],
  ["ליליות", "lily"],
  ["שושן", "lily"],
  ["קאלה", "calla"],
  ["קאלות", "calla"],
  ["קלות", "calla"],
  ["אנטורי", "calla"],
  ["צבעוני", "tulip"],
  ["טוליפ", "tulip"],
  ["סחלב", "orchid"],
  ["אורכיד", "orchid"],
  ["לבנדר", "lavender"],
  ["דלפיניום", "delphinium"],
  ["דולפיניום", "delphinium"],
  ["לוע ארי", "delphinium"],
  ["סייפן", "delphinium"],
  ["לימוניום", "delphinium"],
  ["סולידגו", "delphinium"],
  ["אסטילבה", "delphinium"],
  ["ורוניקה", "delphinium"],
  ["גיבסנית", "gyps"],
  ["גיפסנית", "gyps"],
  ["גיפסו", "gyps"],
  ["כיסופית", "gyps"],
  ["ענן", "gyps"],
  ["פלוקס", "phlox"],
  ["מתיולה", "phlox"],
  ["אלסטרומריה", "phlox"],
  ["פרזיה", "phlox"],
  ["בוורדיה", "phlox"],
  ["טווידה", "phlox"],
  ["אסטר", "phlox"],
  ["אקליפטוס", "euca"],
  ["אקליפוטוס", "euca"],
  ["רוסקוס", "ruscus"],
  ["פיטוספורום", "ruscus"],
  ["זית", "ruscus"],
  ["הדס", "ruscus"],
  ["רוזמרין", "ruscus"],
  ["ריחן", "ruscus"],
  ["קיסוס", "ruscus"],
  ["מוראה", "ruscus"],
  ["שרך", "fern"],
  ["אספרגוס", "fern"],
  ["פלומוזיס", "fern"],
  ["דקל", "fern"],
  ["מונסטרה", "monstera"],
  ["אספדיסטרה", "monstera"],
  ["אלוקסיה", "monstera"],
  ["גן עדן", "monstera"],
  ["סנסיווריה", "monstera"],
  ["ארליה", "monstera"],
  ["פמפס", "grass"],
  ["גראס", "grass"],
  ["לגורוס", "grass"],
  ["חיטה", "grass"],
  ["שיבול", "grass"],
  ["אוונה", "grass"],
  ["עשב", "grass"],
  ["יבש", "dried"],
  ["חנוט", "dried"],
  ["מיובש", "dried"],
  ["חציר", "dried"],
  ["אצטרובל", "dried"],
  ["כותנה", "dried"],
  ["לוטוס", "dried"],
  ["ירוק", "green"],
  ["ירק", "green"],
  ["עלווה", "green"],
  ["עלים", "green"],
  ["ענפ", "green"],
  ["מוס", "green"],
];

/** The kind a name reads as, or `fallback` (a filler) when no word in it is known. */
export function kindOfName(name: string, fallback: FlowerKindId = "filler"): FlowerKindId {
  const n = normalizeFlowerName(name);
  if (!n) return fallback;
  for (const [word, kind] of MATCH) if (n.includes(word)) return kind;
  return fallback;
}

/** A flower row's kind: the one it carries, else the one its name reads as. */
export function kindOfLine(line: { name: string; kind?: string }, fallback: FlowerKindId = "filler"): FlowerKindId {
  return isFlowerKindId(line.kind) ? line.kind : kindOfName(line.name, fallback);
}

/**
 * The vocabulary the drawer offers — the kinds' own names plus the common flowers that read as one
 * of them, so "פרזיה" is offered and draws as a filler. Each is one spelling; the catalog's own
 * names and the marketplace's are added on top (lib/catalog/flowers.ts). */
export const FLOWER_VOCABULARY: { name: string; kind: FlowerKindId }[] = [
  ...FLOWER_KINDS.filter((k) => k.id !== "filler").map((k) => ({ name: k.label, kind: k.id })),
  { name: "שושן", kind: "lily" },
  { name: "חרצית", kind: "daisy" },
  { name: "אלסטרומריה", kind: "phlox" },
  { name: "פרזיה", kind: "phlox" },
  { name: "לימוניום", kind: "delphinium" },
  { name: "סולידגו", kind: "delphinium" },
  { name: "אסטר", kind: "phlox" },
  { name: "פיטוספורום", kind: "ruscus" },
];

// ── colours by their names ──────────────────────────────────────────────────────────────────────
//
// A florist's list names colours in words ("ורוד בהיר", "לבן\ורוד\לילך"); the plan needs a hex.
// Longest first, so "ורוד בהיר" is read before "ורוד" eats it.
const COLOUR_WORDS: [string, string][] = [
  ["ורוד סגלגל", "#C98BB9"],
  ["ורוד בהיר", "#F2C4D0"],
  ["ורוד עתיק", "#D9A5A9"],
  ["סגול בהיר", "#B9A3D6"],
  ["סגול כהה", "#5A3B82"],
  ["ירוק כהה", "#4F6E43"],
  ["ירוק בהיר", "#9EC27E"],
  ["כתום בהיר", "#F5B08A"],
  ["לבן-שמנת", "#F6EFE0"],
  ["לבן שמנת", "#F6EFE0"],
  ["אדום-כתום", "#D9532E"],
  ["צהוב-אדום", "#E9A23B"],
  ["ירוק-אפור", "#A9BDB0"],
  ["לבן", "#FFFFFF"],
  ["שמנת", "#F3E9D6"],
  ["שמפיין", "#EAD8B8"],
  ["פוקסיה", "#D63384"],
  ["ורוד", "#E8A0B4"],
  ["אפרסק", "#F4B48F"],
  ["בורדו", "#6E1B2C"],
  ["אדום", "#C8102E"],
  ["כתום", "#EF8A3C"],
  ["צהוב", "#F2C14E"],
  ["זהב", "#D4AF5A"],
  ["דבש", "#D7A64A"],
  ["לילך", "#B497D6"],
  ["לבנדר", "#9A8BC9"],
  ["סגול", "#7A4FA3"],
  ["תכלת", "#9EC9EB"],
  ["כחול", "#2F5FA8"],
  ["ירוק", "#7FA36B"],
  ["אפור", "#B5B8B1"],
  ["חום", "#8B5E3C"],
  ["שחור", "#2B2B2B"],
  ["טבעי", "#D9C9A3"],
];

export interface NamedColour {
  name: string;
  hex: string;
}

/** Every colour named in a text, in the order they appear, each once — "לבן\ורוד\לילך" is three.
 *  A florist's list separates them with slashes, backslashes and commas, so the text is cut on
 *  those first and each piece read on its own. */
export function coloursOfText(text: string): NamedColour[] {
  const out: NamedColour[] = [];
  const seen = new Set<string>();
  for (const piece of normalizeFlowerName(text).split(/[\\/,|·]+/)) {
    let rest = piece;
    while (rest) {
      let hit: { at: number; word: string; hex: string } | null = null;
      for (const [word, hex] of COLOUR_WORDS) {
        const at = rest.indexOf(word);
        if (at !== -1 && (!hit || at < hit.at)) hit = { at, word, hex };
      }
      if (!hit) break;
      if (!seen.has(hit.word)) {
        seen.add(hit.word);
        out.push({ name: hit.word, hex: hit.hex });
      }
      rest = rest.slice(hit.at + hit.word.length);
    }
  }
  return out;
}

/** The one colour a name carries ("ליזיאנטוס 80 ס״מ ורוד" → pink), or undefined. */
export function colourOfName(name: string): string | undefined {
  return coloursOfText(name)[0]?.hex;
}

// ponytail: self-check. Run: npm run check:flower-kinds
if (isMain(import.meta.url)) {
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
}
