import { isMain } from "../self-check";
// Pure event-folder logic (no imports — keeps the self-check runnable under plain node).
// Run: node --experimental-strip-types lib/gallery/folder-logic.ts

// Pure toggle — add if absent, remove if present.
export function nextFolder(folder: string[], imageId: string): string[] {
  return folder.includes(imageId) ? folder.filter((x) => x !== imageId) : [imageId, ...folder];
}

// The bridge to the studio: the distinct products behind the liked photos, newest-liked first.
// Several liked photos can point at one product (same chandelier, three events) — it pins once.
export function likedProductIds(images: { id: string; productId: string }[], folder: string[]): string[] {
  const productOf = new Map(images.map((img) => [img.id, img.productId]));
  const out: string[] = [];
  for (const imageId of folder) {
    const pid = productOf.get(imageId);
    if (pid && !out.includes(pid)) out.push(pid);
  }
  return out;
}

if (isMain(import.meta.url)) {
  const empty: string[] = [];
  const added = nextFolder(empty, "a");
  console.assert(added.length === 1 && added[0] === "a", "adds when absent");
  const removed = nextFolder(added, "a");
  console.assert(removed.length === 0, "removes when present");
  console.assert(nextFolder(["a", "b"], "b").join() === "a", "removes the middle one, keeps order");

  const imgs = [
    { id: "i1", productId: "p1" },
    { id: "i2", productId: "p1" }, // same product, different photo
    { id: "i3", productId: "p2" },
  ];
  console.assert(likedProductIds(imgs, ["i2", "i3"]).join() === "p1,p2", "dedups products, keeps folder order");
  console.assert(likedProductIds(imgs, ["i1", "i2"]).join() === "p1", "two photos of one product pin once");
  console.assert(likedProductIds(imgs, ["nope"]).length === 0, "ignores unknown image ids");
  console.log("gallery/folder-logic self-check ok");
}
