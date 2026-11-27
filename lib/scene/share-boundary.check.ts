// npm run check:scene-share — the self-check of ./share-boundary.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { FORBIDDEN_IMPORTS, scanShare, TRUSTING_READS } from "./share-boundary";

const problems = scanShare(process.cwd());
if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\n${problems.length} scene-share problem(s)`);
  process.exit(1);
}
// A canary: the rules must actually catch what they are written for.
const sample = 'import { fetchQuote } from "@/lib/quotes/actions";';
if (!FORBIDDEN_IMPORTS.some((f) => f.pattern.test(sample))) {
  console.error("the forbidden-import rule no longer catches a quotes import");
  process.exit(1);
}
console.log(`scene share ok: ${TRUSTING_READS.length} trusting reads are plain modules, no client component imports them, the share surfaces stay off the business`);
