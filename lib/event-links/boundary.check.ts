// npm run check:event-links — the self-check of ./boundary.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { scanLinks } from "./boundary";

// ponytail: self-check. Run: npm run check:event-links
const dir = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const found = scanLinks(dir);
for (const v of found) console.error(`FAIL: lib/event-links/${v.file}:${v.line} ${v.why}`);
if (found.length) process.exit(1);
console.log("  ok   no money table or price column in lib/event-links/");
console.log("event links boundary self-check passed");
