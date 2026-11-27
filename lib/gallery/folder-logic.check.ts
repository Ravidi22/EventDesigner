// npm run check:folder — the self-check of ./folder-logic.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { likedProductIds, nextFolder } from "./folder-logic";

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
