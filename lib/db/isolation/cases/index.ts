// Every server action's case, merged. A key may appear in one file only.
import { MONEY_CASES } from "./money";
import { PEOPLE_CASES } from "./people";
import { STUDIO_CASES } from "./studio";
import { VENUE_CASES } from "./venues";
import type { Cases } from "./types";

const parts = [STUDIO_CASES, MONEY_CASES, PEOPLE_CASES, VENUE_CASES];
const seen = new Set<string>();
for (const part of parts) {
  for (const key of Object.keys(part)) {
    if (seen.has(key)) throw new Error(`isolation case defined twice: ${key}`);
    seen.add(key);
  }
}

export const CASES: Cases = Object.assign({}, ...parts);
