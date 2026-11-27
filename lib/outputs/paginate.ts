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
