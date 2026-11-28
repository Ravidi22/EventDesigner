// npm run check:scene-boundary — the self-check of ./boundary.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { ALLOWED, scanThreeImports } from "./boundary";

const violations = scanThreeImports(process.cwd());
if (violations.length) {
  for (const v of violations) console.error(`${v.file}:${v.line}  ${v.text}`);
  console.error(`\n${violations.length} three.js import(s) outside ${ALLOWED}/`);
  process.exit(1);
}
console.log(`scene boundary ok: three.js imported only under ${ALLOWED}/`);
