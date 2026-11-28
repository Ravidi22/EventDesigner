// npm run check:list-objects — the self-check of ./list-objects.ts (EVE-22): reading one page of an S3
// ListObjectsV2 answer, which is how the erase finds every file under a business's prefix on R2.
import { parseListObjects } from "./list-objects";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

const page1 = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>eve</Name><Prefix>org-1/</Prefix><KeyCount>2</KeyCount><MaxKeys>1000</MaxKeys>
  <IsTruncated>true</IsTruncated>
  <Contents><Key>org-1/product/a.jpg</Key><Size>10</Size></Contents>
  <Contents><Key>org-1/gallery/b&amp;c.png</Key><Size>20</Size></Contents>
  <NextContinuationToken>1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=</NextContinuationToken>
</ListBucketResult>`;
const one = parseListObjects(page1);
assert(one.keys.length === 2, `two keys (${JSON.stringify(one.keys)})`);
assert(one.keys[0] === "org-1/product/a.jpg", "the first key");
assert(one.keys[1] === "org-1/gallery/b&c.png", "an entity in a key is decoded");
assert(one.next === "1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=", "the continuation token");

const last = parseListObjects(`<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>org-1/x.webp</Key></Contents></ListBucketResult>`);
assert(last.keys.length === 1 && last.next === null, "the last page has no next");

const empty = parseListObjects(`<ListBucketResult><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>`);
assert(empty.keys.length === 0 && empty.next === null, "an empty prefix");

console.log("check:list-objects — ok");
