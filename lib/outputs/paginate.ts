// Packing measured blocks into fixed pages — the one thing CSS print pagination cannot hand back.
//
// The quote is a PDF a client receives (app/(app)/outputs/quote-document.tsx), built in the browser
// from images of its pages, so it needs its pages as ELEMENTS: one A4 box per page, the same boxes
// on screen, on paper and in the PDF. The browser's print engine paginates beautifully and tells
// nobody where it broke, so the breaks are decided here instead, over heights the screen measured.
//
// Greedy, with one rule: a block marked `keep` (a section's heading and photographs) never ends a
// page — it is carried over with the block it introduces. A block taller than a page gets a page of
// its own and is allowed to overflow it; that is a layout bug to fix at the block, not here.
import { isMain } from "../self-check";

/** `heights[i]` in any unit, `capacity(page)` in the same one. Returns block indices per page. */
export function paginate(heights: readonly number[], keep: readonly boolean[], capacity: (page: number) => number): number[][] {
  const pages: number[][] = [[]];
  let used = 0;
  heights.forEach((h, i) => {
    const page = pages[pages.length - 1];
    if (page.length > 0 && used + h > capacity(pages.length - 1)) {
      // Carry the trailing kept blocks (never the whole page — that would loop forever).
      const carry: number[] = [];
      while (page.length > 1 && keep[page[page.length - 1]]) carry.unshift(page.pop()!);
      pages.push(carry);
      used = carry.reduce((n, j) => n + heights[j], 0);
    }
    pages[pages.length - 1].push(i);
    used += h;
  });
  return pages;
}

// ponytail: self-check. Run: npm run check:paginate
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const flat = (cap: number) => () => cap;
  assert(JSON.stringify(paginate([40, 40, 40], [false, false, false], flat(100))) === "[[0,1],[2]]", "breaks when full");
  assert(JSON.stringify(paginate([60, 30, 30], [false, true, false], flat(100))) === "[[0],[1,2]]", "a heading moves with its first line");
  assert(JSON.stringify(paginate([30, 30, 50], [true, true, false], flat(100))) === "[[0],[1,2]]", "…but never empties the page it leaves");
  assert(JSON.stringify(paginate([150, 10], [false, false], flat(100))) === "[[0],[1]]", "an oversize block stands alone");
  assert(JSON.stringify(paginate([50, 50, 50], [false, false, false], (p) => (p === 0 ? 50 : 100))) === "[[0],[1,2]]", "per-page capacity");
  assert(JSON.stringify(paginate([], [], flat(100))) === "[[]]", "nothing → one empty page");
  console.log("paginate self-check passed");
}
